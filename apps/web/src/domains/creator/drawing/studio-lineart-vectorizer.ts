/**
 * studio-lineart-vectorizer.ts
 *
 * Paper.js 벡터 레인 확장 — 선화 벡터화·불리언 합성 고수준 API.
 *
 * 기존 `render/studio-engine-vector-geometry-provider.ts` (Paper.js 격리 경계)
 * 위에 얹히는 도메인 레이어다. Paper 객체가 이 경계를 넘지 않는다.
 *
 * 기능:
 * 1. vectorizeLineartStroke — 손으로 그린 선(점열) → 스무딩된 벡터 패스.
 *    브러시로 그린 선화를 벡터로 변환해 확대·편집 가능하게 한다.
 * 2. mergeBubbleWithTail — 말풍선 본체 + 꼬리를 불리언 unite 으로 합성.
 *    기존 studio-bubble-path 의 단일 패스 방식과 달리, 임의의 본체/꼬리
 *    모양 조합에 대응하는 일반 해법이다.
 * 3. simplifyVectorPath — 벡터 패스 단순화 (내보내기 용량 절감).
 *
 * 전부 비동기(provider 경계) + 순수 입력 검증. DOM에 의존하지 않는다.
 */

import {
  createStudioEngineVectorGeometryProvider,
  type StudioEngineVectorGeometryBooleanOperator,
  type StudioEngineVectorGeometryResult,
  type StudioEngineVectorGeometrySmoothingType,
} from "../render/studio-engine-vector-geometry-provider";

export interface StudioLineartPoint {
  readonly x: number;
  readonly y: number;
}

export interface StudioLineartVectorizeOptions {
  /** 스무딩 강도 0..1. 기본 0.6. */
  readonly smoothing?: number;
  /** 스무딩 알고리즘 종류. 기본 "catmull-rom". */
  readonly smoothingType?: StudioEngineVectorGeometrySmoothingType;
  /** 단순화 허용 오차(px). 0이면 생략. 기본 0. */
  readonly simplifyTolerance?: number;
  /** 최대 입력 점 수. 기본 5_000. */
  readonly maxPoints?: number;
  /** 연속 중복 점 제거 최소 간격(px). 기본 0.05. */
  readonly minStepPx?: number;
  /**
   * 시작점과 끝점 사이 거리가 이 임계값(px) 이하이면 닫힌 루프(Z)로 자동 봉합한 뒤 스무딩한다.
   * 말풍선이나 닫힌 윤곽선을 한 번에 그릴 때 시작·끝 이음새 꺾임을 없앤다. 기본 0(열린 패스).
   */
  readonly closeLoopThresholdPx?: number;
}

export interface StudioVectorizeResult {
  readonly ok: boolean;
  readonly pathData: string;
  readonly closed?: boolean;
  readonly error?: string;
}

export const STUDIO_LINEART_VECTORIZER_DEFAULTS = Object.freeze({
  smoothing: 0.6,
  smoothingType: "catmull-rom" as StudioEngineVectorGeometrySmoothingType,
  simplifyTolerance: 0,
  maxPoints: 5_000,
  minStepPx: 0.05,
  closeLoopThresholdPx: 0,
} as const);

function failResult(error: string): StudioVectorizeResult {
  return { ok: false, pathData: "", error };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function round2(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * 비유효(NaN/Infinity) 좌표를 걸러내고 연속된 영길이(중복) 샘플을 제거한다.
 * Catmull-Rom 접선 계산 시 0으로 나누기(NaN 핸들)가 발생하는 것을 원천 차단한다.
 */
export function sanitizeLineartPoints(
  points: ReadonlyArray<StudioLineartPoint>,
  options: { readonly maxPoints?: number; readonly minStepPx?: number } = {},
): StudioLineartPoint[] {
  const maxPoints = Math.max(
    2,
    options.maxPoints ?? STUDIO_LINEART_VECTORIZER_DEFAULTS.maxPoints,
  );
  const minStepPx = Math.max(
    0,
    options.minStepPx ?? STUDIO_LINEART_VECTORIZER_DEFAULTS.minStepPx,
  );
  const cleaned: StudioLineartPoint[] = [];
  for (const pt of points) {
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    if (cleaned.length > 0 && minStepPx > 0) {
      const prev = cleaned[cleaned.length - 1]!;
      if (Math.hypot(pt.x - prev.x, pt.y - prev.y) < minStepPx) {
        continue;
      }
    }
    cleaned.push({ x: pt.x, y: pt.y });
    if (cleaned.length >= maxPoints) break;
  }
  return cleaned;
}

/** 점열 → 폴리라인 SVG path data (Catmull-Rom 미적용, provider 스무딩에 위임). */
export function pointsToPolylinePathData(
  points: ReadonlyArray<StudioLineartPoint>,
  options?: { readonly closed?: boolean },
): string {
  if (points.length === 0) return "";
  const parts: string[] = [
    `M${round2(points[0].x)} ${round2(points[0].y)}`,
  ];
  for (let i = 1; i < points.length; i += 1) {
    parts.push(`L${round2(points[i].x)} ${round2(points[i].y)}`);
  }
  if (options?.closed && points.length >= 3) {
    parts.push("Z");
  }
  return parts.join("");
}

function unwrap(
  result: StudioEngineVectorGeometryResult,
  context: string,
  closed?: boolean,
): StudioVectorizeResult {
  if (!result.ok) {
    return failResult(`${context} 실패: ${result.reason} (${result.detail})`);
  }
  return {
    ok: true,
    pathData: result.artifact.pathData,
    ...(closed !== undefined ? { closed } : {}),
  };
}

type VectorGeometryProvider = ReturnType<
  typeof createStudioEngineVectorGeometryProvider
>;

/**
 * provider 생성→작업→해제를 한 번에 처리한다.
 * Paper.js 프로젝트 누수를 막기 위해 finally 에서 항상 dispose 한다.
 */
async function withGeometryProvider(
  task: (provider: VectorGeometryProvider) => Promise<StudioVectorizeResult>,
): Promise<StudioVectorizeResult> {
  const provider = createStudioEngineVectorGeometryProvider();
  try {
    return await task(provider);
  } finally {
    provider.dispose();
  }
}

/**
 * 선화 스트로크(점열)를 벡터 패스로 변환한다.
 * 1) 비정상/중복 점 정제 → 2) 닫힌 루프 자동 판정 → 3) Paper.js 스무딩 → 4) 선택적 단순화.
 */
export async function vectorizeLineartStroke(
  points: ReadonlyArray<StudioLineartPoint>,
  options: StudioLineartVectorizeOptions = {},
): Promise<StudioVectorizeResult> {
  const cleaned = sanitizeLineartPoints(points, {
    maxPoints: options.maxPoints,
    minStepPx: options.minStepPx,
  });
  if (cleaned.length < 2) {
    return failResult("선화 벡터화에는 최소 2개의 유효한 점이 필요합니다");
  }

  const closeThreshold =
    options.closeLoopThresholdPx ??
    STUDIO_LINEART_VECTORIZER_DEFAULTS.closeLoopThresholdPx;
  let shouldClose = false;
  let workingPoints = cleaned;
  if (
    Number.isFinite(closeThreshold) &&
    closeThreshold > 0 &&
    cleaned.length >= 3
  ) {
    const first = cleaned[0]!;
    const last = cleaned[cleaned.length - 1]!;
    const endGap = Math.hypot(last.x - first.x, last.y - first.y);
    if (endGap <= closeThreshold) {
      shouldClose = true;
      if (endGap < 1e-3 && cleaned.length > 3) {
        workingPoints = cleaned.slice(0, -1);
      }
    }
  }

  const polyline = pointsToPolylinePathData(workingPoints, {
    closed: shouldClose,
  });
  const smoothing = clamp01(
    options.smoothing ?? STUDIO_LINEART_VECTORIZER_DEFAULTS.smoothing,
  );
  const smoothingType =
    options.smoothingType ?? STUDIO_LINEART_VECTORIZER_DEFAULTS.smoothingType;
  const tolerance =
    options.simplifyTolerance ??
    STUDIO_LINEART_VECTORIZER_DEFAULTS.simplifyTolerance;

  return withGeometryProvider(async (provider) => {
    const smoothed = await provider.execute({
      operation: "smooth",
      pathData: polyline,
      smoothing: { type: smoothingType, factor: smoothing },
    });
    const smoothedResult = unwrap(smoothed, "선화 스무딩", shouldClose);
    if (!smoothedResult.ok || tolerance <= 0) return smoothedResult;

    const simplified = await provider.execute({
      operation: "simplify",
      pathData: smoothedResult.pathData,
      tolerance,
    });
    return unwrap(simplified, "선화 단순화", shouldClose);
  });
}

/**
 * 두 벡터 패스에 불리언 연산(unite / subtract / intersect / exclude)을 수행한다.
 */
export async function booleanVectorPaths(
  leftPathData: string,
  rightPathData: string,
  operator: StudioEngineVectorGeometryBooleanOperator = "unite",
): Promise<StudioVectorizeResult> {
  if (!leftPathData || !rightPathData) {
    return failResult("불리언 연산에는 좌·우 pathData 가 모두 필요합니다");
  }
  return withGeometryProvider(async (provider) => {
    const result = await provider.execute({
      operation: "boolean",
      operator,
      leftPathData,
      rightPathData,
    });
    return unwrap(result, `불리언 ${operator}`);
  });
}

/**
 * 말풍선 본체와 꼬리를 불리언 합집합으로 합성한다.
 * 두 pathData 가 겹치는 영역을 매끄럽게 합쳐 "이중 외곽선 이음새"를 없앤다.
 */
export async function mergeBubbleWithTail(
  bubblePathData: string,
  tailPathData: string,
): Promise<StudioVectorizeResult> {
  if (!bubblePathData || !tailPathData) {
    return failResult("말풍선 본체와 꼬리 pathData 가 모두 필요합니다");
  }
  return booleanVectorPaths(bubblePathData, tailPathData, "unite");
}

/**
 * 다중 연결 말풍선(본체 여러 개 + 꼬리 여러 개) 체인을 단일 Paper.js 세션에서 순차 합집합으로 합성한다.
 */
export async function mergeBubbleChain(
  pathDataList: ReadonlyArray<string>,
): Promise<StudioVectorizeResult> {
  const nonEmpty = pathDataList.map((p) => p.trim()).filter((p) => p.length > 0);
  if (nonEmpty.length < 2) {
    return failResult("연결 말풍선 합성에는 최소 2개의 pathData 가 필요합니다");
  }
  return withGeometryProvider(async (provider) => {
    let acc = nonEmpty[0]!;
    for (let i = 1; i < nonEmpty.length; i += 1) {
      const step = await provider.execute({
        operation: "boolean",
        operator: "unite",
        leftPathData: acc,
        rightPathData: nonEmpty[i]!,
      });
      if (!step.ok) {
        return failResult(`연결 말풍선 합성 실패: ${step.reason} (${step.detail})`);
      }
      acc = step.artifact.pathData;
    }
    return { ok: true, pathData: acc, closed: true };
  });
}

/** 벡터 패스 단순화 (앵커 수 절감, 내보내기 용량 최적화). */
export async function simplifyVectorPath(
  pathData: string,
  tolerance: number,
): Promise<StudioVectorizeResult> {
  if (!pathData) return failResult("pathData 가 비어 있습니다");
  if (!Number.isFinite(tolerance) || tolerance < 0) {
    return failResult("tolerance 는 0 이상의 숫자여야 합니다");
  }
  return withGeometryProvider(async (provider) => {
    const result = await provider.execute({
      operation: "simplify",
      pathData,
      tolerance,
    });
    return unwrap(result, "패스 단순화");
  });
}
