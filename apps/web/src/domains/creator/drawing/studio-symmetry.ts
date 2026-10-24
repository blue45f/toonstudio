/**
 * studio-symmetry.ts
 *
 * CSP 대칭 자 격차 보강 — 대칭 그리기 순수 도메인 모델.
 *
 * 벤치마크:
 * - Clip Studio Paint: 대칭 자(Symmetrical Ruler) — 선 대칭 축 기준 미러 스냅
 * - Procreate: Drawing Guide 대칭 (수직/수평/쿼드런트/방사형)
 * - ibisPaint: 대칭 그리기 (수직·수평·방사형)
 * - Krita: Multibrush (미러·병렬·스노플레이크)
 *
 * ## 왜 "샘플 단계에서 복제" 인가
 * 순진한 구현은 스트로크를 다 그린 뒤 래스터 완성본을 뒤집어 합친다.
 * 그러면 방향성 브러시(캘리그래피 펜, 납작 붓, 질감 브러시)의 획 방향이
 * 뒤집힌 채로 찍혀 대칭축 너머의 질감이 어색해진다.
 * 이 모듈은 스트로크 샘플(x/y/pressure/방향벡터)을 대칭 행렬로 복제한다:
 * 좌표는 아핀 변환(회전/반사 + 평행이동), 방향벡터는 선형 부분(회전/반사)만
 * 적용한다. 브러시 엔진은 각 복제본을 독립된 스트로크로 렌더링하면 된다.
 *
 * DOM에 의존하지 않는다. 호출자가 PointerEvent 등에서 x/y/pressure와
 * 방향벡터(dx/dy)를 추출해 전달하면 복제된 샘플 배열을 반환한다.
 */

/** 대칭 복제 대상 스트로크 샘플 1개. */
export interface SymmetryStrokeSample {
  readonly x: number;
  readonly y: number;
  /** 필압 0–1. */
  readonly pressure: number;
  /** 스트로크 진행 방향 벡터. 정규화되지 않아도 된다. */
  readonly dx: number;
  readonly dy: number;
  /** 선택적 스타일러스 기울기 벡터 (-90..90 deg 또는 정규화 성분). */
  readonly tiltX?: number;
  readonly tiltY?: number;
  /** 선택적 스타일러스 배럴 롤 회전각 (0..360 deg). */
  readonly twistDeg?: number;
}

/** 대칭 모드: 끄기 / 수직축 / 수평축 / 4방향(수직+수평) / 방사형 N-fold. */
export type StudioSymmetryMode =
  | "off"
  | "vertical"
  | "horizontal"
  | "quad"
  | "radial";

export const STUDIO_SYMMETRY_MODES = [
  "off",
  "vertical",
  "horizontal",
  "quad",
  "radial",
] as const;

/** 방사형 분할 수 범위 (Procreate/CSP 관례 2–16). */
export const STUDIO_SYMMETRY_FOLDS_MIN = 2;
export const STUDIO_SYMMETRY_FOLDS_MAX = 12;

export function isStudioSymmetryMode(
  value: unknown,
): value is StudioSymmetryMode {
  return (
    STUDIO_SYMMETRY_MODES as readonly unknown[]
  ).includes(value);
}

export interface StudioSymmetrySettings {
  readonly mode: StudioSymmetryMode;
  /** 수직축 x 위치 (캔버스 좌표, 드래그로 이동). */
  readonly axisX: number;
  /** 수평축 y 위치 (캔버스 좌표, 드래그로 이동). */
  readonly axisY: number;
  /** 대칭축 각도(도, -180–180). 0이면 수직 모드는 정확히 수직선. */
  readonly angleDeg: number;
  /** 방사형 중심점 (드래그로 이동). */
  readonly centerX: number;
  readonly centerY: number;
  /** 방사형 분할 수 2–12. */
  readonly folds: number;
  /**
   * CSP 대칭 자 "선 대칭(Line symmetry)" / 만다라(Kaleidoscope D_n 이면군) 옵션:
   * true이면 방사형 모드에서 홀수 번째 섹터를 스포크 축 기준으로 거울 반사한다.
   */
  readonly mirrorRadial?: boolean;
}

export function normalizeStudioSymmetrySettings(
  input: Partial<StudioSymmetrySettings> | null | undefined,
): StudioSymmetrySettings {
  const mode = isStudioSymmetryMode(input?.mode) ? input.mode : "off";
  const num = (value: unknown, fallback: number): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const rawFolds = num(input?.folds, 6);
  const base: StudioSymmetrySettings = {
    mode,
    axisX: num(input?.axisX, 160),
    axisY: num(input?.axisY, 120),
    angleDeg: Math.min(180, Math.max(-180, num(input?.angleDeg, 0))),
    centerX: num(input?.centerX, 160),
    centerY: num(input?.centerY, 120),
    folds: Math.min(
      STUDIO_SYMMETRY_FOLDS_MAX,
      Math.max(STUDIO_SYMMETRY_FOLDS_MIN, Math.round(rawFolds)),
    ),
  };
  return typeof input?.mirrorRadial === "boolean"
    ? { ...base, mirrorRadial: input.mirrorRadial }
    : base;
}

/** 모드별 복제본 개수 (off=1: 원본만). */
export function studioSymmetryCloneCount(
  settings: StudioSymmetrySettings,
): number {
  switch (settings.mode) {
    case "off":
      return 1;
    case "vertical":
    case "horizontal":
      return 2;
    case "quad":
      return 4;
    case "radial":
      return settings.folds;
  }
}

export interface Affine2D {
  /** 선형 부분 [a b; c d] — 방향벡터·틸트에 적용. */
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  /** 평행이동 (tx, ty) — 좌표에만 적용. */
  readonly tx: number;
  readonly ty: number;
}

const IDENTITY: Affine2D = Object.freeze({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  tx: 0,
  ty: 0,
});

/**
 * 점 P를 지나고 단위 방향 u를 갖는 직선에 대한 반사 변환.
 * p' = 2P − p + 2(u·(p−P))u, 선형 부분 R = 2uuᵀ − I.
 */
function reflectionAcrossLine(
  px: number,
  py: number,
  ux: number,
  uy: number,
): Affine2D {
  const a = 2 * ux * ux - 1;
  const b = 2 * ux * uy;
  const c = 2 * ux * uy;
  const d = 2 * uy * uy - 1;
  // t = (I − R)P
  const tx = (1 - a) * px - b * py;
  const ty = -c * px + (1 - d) * py;
  return { a, b, c, d, tx, ty };
}

/** 점 C를 중심으로 각도 θ(rad)만큼 회전. */
function rotationAbout(
  cx: number,
  cy: number,
  theta: number,
): Affine2D {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const tx = (1 - cos) * cx + sin * cy;
  const ty = -sin * cx + (1 - cos) * cy;
  return { a: cos, b: -sin, c: sin, d: cos, tx, ty };
}

/** 수직축(기본: x = axisX 직선, angleDeg만큼 회전)의 반사 행렬. */
function verticalAxisTransform(settings: StudioSymmetrySettings): Affine2D {
  const phi = Math.PI / 2 + (settings.angleDeg * Math.PI) / 180;
  return reflectionAcrossLine(
    settings.axisX,
    settings.axisY,
    Math.cos(phi),
    Math.sin(phi),
  );
}

/** 수평축(기본: y = axisY 직선, angleDeg만큼 회전)의 반사 행렬. */
function horizontalAxisTransform(settings: StudioSymmetrySettings): Affine2D {
  const phi = (settings.angleDeg * Math.PI) / 180;
  return reflectionAcrossLine(
    settings.axisX,
    settings.axisY,
    Math.cos(phi),
    Math.sin(phi),
  );
}

function composeAffine(first: Affine2D, second: Affine2D): Affine2D {
  // second ∘ first: p ↦ second(first(p))
  return {
    a: second.a * first.a + second.b * first.c,
    b: second.a * first.b + second.b * first.d,
    c: second.c * first.a + second.d * first.c,
    d: second.c * first.b + second.d * first.d,
    tx: second.a * first.tx + second.b * first.ty + second.tx,
    ty: second.c * first.tx + second.d * first.ty + second.ty,
  };
}

/**
 * cloneIndex번째 복제본에 적용할 아핀 변환.
 * - quad는 [원본, 수직반사, 수평반사, 수직∘수평(=중심점 대칭)] 4개다.
 * - radial에서 `mirrorRadial === true`이면 홀수 인덱스를 해당 스포크 대칭축에 반사(이면군 D_n)한다.
 */
export function studioSymmetryTransform(
  settings: StudioSymmetrySettings,
  cloneIndex: number,
): Affine2D {
  const count = studioSymmetryCloneCount(settings);
  const index = ((cloneIndex % count) + count) % count;
  switch (settings.mode) {
    case "off":
      return IDENTITY;
    case "vertical":
      return index === 0 ? IDENTITY : verticalAxisTransform(settings);
    case "horizontal":
      return index === 0 ? IDENTITY : horizontalAxisTransform(settings);
    case "quad": {
      const v = verticalAxisTransform(settings);
      const h = horizontalAxisTransform(settings);
      if (index === 0) return IDENTITY;
      if (index === 1) return v;
      if (index === 2) return h;
      return composeAffine(v, h);
    }
    case "radial": {
      if (settings.mirrorRadial && index % 2 === 1) {
        const baseRad = (settings.angleDeg * Math.PI) / 180;
        const spokeAngle = baseRad + (index * Math.PI) / settings.folds;
        return reflectionAcrossLine(
          settings.centerX,
          settings.centerY,
          Math.cos(spokeAngle),
          Math.sin(spokeAngle),
        );
      }
      return rotationAbout(
        settings.centerX,
        settings.centerY,
        (index * 2 * Math.PI) / settings.folds,
      );
    }
  }
}

/** 해당 복제본 변환이 카이랄성(Chirality)을 뒤집는 거울 반사(det < 0)인지 판별한다. */
export function isStudioSymmetryTransformReflected(
  settings: StudioSymmetrySettings,
  cloneIndex: number,
): boolean {
  const t = studioSymmetryTransform(settings, cloneIndex);
  return t.a * t.d - t.b * t.c < 0;
}

/**
 * 스트로크 샘플 1개를 cloneIndex번째 복제본 좌표계로 변환한다.
 * 좌표에는 아핀 전체를, 방향벡터 및 스타일러스 틸트/배럴 롤에는 선형 부분만 적용한다
 * (평행이동이 방향을 바꾸면 안 된다 — 방향성 캘리그라피/납작붓 브러시 정확도의 핵심).
 */
export function transformStudioSymmetrySample(
  settings: StudioSymmetrySettings,
  cloneIndex: number,
  sample: SymmetryStrokeSample,
): SymmetryStrokeSample {
  const t = studioSymmetryTransform(settings, cloneIndex);
  const base: SymmetryStrokeSample = {
    x: t.a * sample.x + t.b * sample.y + t.tx,
    y: t.c * sample.x + t.d * sample.y + t.ty,
    pressure: sample.pressure,
    dx: t.a * sample.dx + t.b * sample.dy,
    dy: t.c * sample.dx + t.d * sample.dy,
  };
  const hasTilt =
    sample.tiltX !== undefined &&
    sample.tiltY !== undefined &&
    Number.isFinite(sample.tiltX) &&
    Number.isFinite(sample.tiltY);
  const hasTwist =
    sample.twistDeg !== undefined && Number.isFinite(sample.twistDeg);
  if (!hasTilt && !hasTwist) return base;

  let transformedTwist: number | undefined;
  if (hasTwist) {
    const rad = (sample.twistDeg! * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const vx = t.a * ux + t.b * uy;
    const vy = t.c * ux + t.d * uy;
    const deg = (Math.atan2(vy, vx) * 180) / Math.PI;
    transformedTwist = ((deg % 360) + 360) % 360;
  }
  return {
    ...base,
    ...(hasTilt
      ? {
          tiltX: t.a * sample.tiltX! + t.b * sample.tiltY!,
          tiltY: t.c * sample.tiltX! + t.d * sample.tiltY!,
        }
      : {}),
    ...(transformedTwist !== undefined ? { twistDeg: transformedTwist } : {}),
  };
}

/**
 * 스트로크 샘플 1개를 모든 복제본으로 펼친다.
 * 반환 배열의 인덱스 i가 cloneIndex i에 대응한다.
 */
export function cloneStudioSymmetrySample(
  settings: StudioSymmetrySettings,
  sample: SymmetryStrokeSample,
): SymmetryStrokeSample[] {
  const count = studioSymmetryCloneCount(settings);
  const clones: SymmetryStrokeSample[] = [];
  for (let i = 0; i < count; i += 1) {
    clones.push(transformStudioSymmetrySample(settings, i, sample));
  }
  return clones;
}

export interface StudioSymmetryAxisSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * 캔버스 오버레이에 표시할 대칭 가이드 직선 선분 목록을 계산한다.
 */
export function computeStudioSymmetryAxisSegments(
  settings: StudioSymmetrySettings,
  radiusPx = 1024,
): ReadonlyArray<StudioSymmetryAxisSegment> {
  const r = Math.max(16, Number.isFinite(radiusPx) ? radiusPx : 1024);
  const degRad = (settings.angleDeg * Math.PI) / 180;
  const lineAt = (
    cx: number,
    cy: number,
    theta: number,
  ): StudioSymmetryAxisSegment => {
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    return {
      x1: cx - ux * r,
      y1: cy - uy * r,
      x2: cx + ux * r,
      y2: cy + uy * r,
    };
  };
  switch (settings.mode) {
    case "off":
      return [];
    case "vertical":
      return [lineAt(settings.axisX, settings.axisY, Math.PI / 2 + degRad)];
    case "horizontal":
      return [lineAt(settings.axisX, settings.axisY, degRad)];
    case "quad":
      return [
        lineAt(settings.axisX, settings.axisY, Math.PI / 2 + degRad),
        lineAt(settings.axisX, settings.axisY, degRad),
      ];
    case "radial": {
      const segments: StudioSymmetryAxisSegment[] = [];
      for (let i = 0; i < settings.folds; i += 1) {
        const theta = degRad + (i * Math.PI) / settings.folds;
        segments.push(lineAt(settings.centerX, settings.centerY, theta));
      }
      return segments;
    }
  }
}

