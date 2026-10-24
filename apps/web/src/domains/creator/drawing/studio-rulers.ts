/**
 * studio-rulers.ts
 *
 * CSP "Special Rulers" 격차 보강 — 자(rulers) 순수 도메인 모델 + 스냅 수학.
 *
 * 벤치마크:
 * - Clip Studio Paint: 특수 자(Special Rulers) — 직선/곡선/동심원/방사선/퍼스펙티브 자.
 *   자를 올려놓으면 스트로크가 자에 스냅된다.
 * - Procreate: Drawing Guide (대칭·그리드) — 자 개념 없음
 * - ibisPaint/Krita: 자 기능 없음 (Krita는 어시스턴트, 방식이 다름)
 *
 * UI 복제 금지: 원리(자 위에 그으면 선이 자에 달라붙는다)와 UX 패턴만 재해석한다.
 * DOM에 의존하지 않는다. 호출자가 PointerEvent 등에서 x/y만 추출해 전달하면
 * 스냅된 좌표를 반환한다. 실제 렌더링·이벤트 바인딩은 UI 레이어가 담당한다.
 *
 * ## 스트로크 파이프라인 순서 (stroke-stabilizer.ts와 연동)
 *
 *   원시 포인터 → StrokeStabilizer.push() → snapStudioRulerPoint() → 대칭 복제(studio-symmetry.ts)
 *
 * 스태빌라이저가 먼저 손떨림을 제거하고, 그 다음 자 스냅을 적용한다.
 * 순서를 바꾸면(스냅 후 스태빌라이즈) 자에 달라붙은 선이 다시 흔들려
 * 스냅이 무너진다. 대칭 복제는 가장 마지막에 한다 — 스냅된 좌표를
 * 대칭 행렬로 복제해야 모든 짝이 자에 정확히 붙는다.
 */

/** 자 위의 2D 점. */
export interface RulerPoint {
  readonly x: number;
  readonly y: number;
}

/** 자 종류: 직선 / 곡선(2차·3차 베지어) / 동심원 / 퍼스펙티브(1–3점 소실점). */
export type StudioRulerKind = "line" | "curve" | "concentric" | "perspective";

export const STUDIO_RULER_KINDS = [
  "line",
  "curve",
  "concentric",
  "perspective",
] as const;

/** 캔버스 하나에 올릴 수 있는 자 최대 개수. */
export const STUDIO_RULERS_MAX_PER_CANVAS = 12;

export function isStudioRulerKind(value: unknown): value is StudioRulerKind {
  return (
    STUDIO_RULER_KINDS as readonly unknown[]
  ).includes(value);
}

interface StudioRulerBase {
  readonly id: string;
  readonly name: string;
  /** 자 표시/숨기기. 꺼져 있으면 렌더도 스냅도 하지 않는다. */
  readonly visible: boolean;
  /** 스냅 on/off. 꺼져 있으면 자는 보이지만 선은 자유롭게 그려진다. */
  readonly snapEnabled: boolean;
  /** 자별 색상 (CSS hex). */
  readonly color: string;
  /**
   * 최대 스냅 허용 거리(px). 0 또는 미지정이면 거리 제한 없이 항상 스냅한다.
   * 양수이면 자로부터 이 거리보다 멀리 떨어진 점은 스냅하지 않고 자유 드로잉을 유지한다.
   */
  readonly maxSnapDistancePx?: number;
}

/**
 * 직선 / 평행선 자: 두 점으로 정의된 직선에 스트로크를 투영한다.
 * - `parallelMode: true` (CSP 평행선 특수 자): 고정 직선 `p0..p1` 하나에만 붙는 대신
 *   스트로크 시작점을 지나고 `p0→p1` 방향과 평행한 직선에 세션을 잠근다.
 * - `parallelSpacingPx > 0`: 평행선 모드에서 수직 방향 간격(px) 격자에 맞춰 시작 오프셋을 양자화한다(균일 해칭·배경 빗금용).
 */
export interface StudioLineRuler extends StudioRulerBase {
  readonly kind: "line";
  readonly p0: RulerPoint;
  readonly p1: RulerPoint;
  readonly parallelMode?: boolean;
  readonly parallelSpacingPx?: number;
}

/** 곡선 자 (2차 베지어). */
export interface StudioQuadraticCurveRuler extends StudioRulerBase {
  readonly kind: "curve";
  readonly degree: 2;
  readonly p0: RulerPoint;
  readonly p1: RulerPoint;
  readonly p2: RulerPoint;
}

/** 곡선 자 (3차 베지어). */
export interface StudioCubicCurveRuler extends StudioRulerBase {
  readonly kind: "curve";
  readonly degree: 3;
  readonly p0: RulerPoint;
  readonly p1: RulerPoint;
  readonly p2: RulerPoint;
  readonly p3: RulerPoint;
}

export type StudioCurveRuler = StudioQuadraticCurveRuler | StudioCubicCurveRuler;

/** 동심원·방사선 복합 자 스냅 모드. */
export type StudioConcentricSnapMode = "rings" | "radial" | "both";

/**
 * 동심원 / 방사선(집중선) 자: 중심 + 기준 반지름 + 간격 + 개수.
 * 마법진·파문·렌즈 플레어(`snapMode: "rings"`), 만화 집중선(`snapMode: "radial"`),
 * 거미줄·극좌표 복합 자(`snapMode: "both"`) 그리기에 유용하다.
 * ellipseX/ellipseY가 1이 아니면 타원 고리·타원 방사선이 된다.
 */
export interface StudioConcentricRuler extends StudioRulerBase {
  readonly kind: "concentric";
  readonly centerX: number;
  readonly centerY: number;
  /** 첫 번째 고리의 반지름(px). */
  readonly baseRadius: number;
  /** 고리 간 간격(px). */
  readonly ringSpacing: number;
  /** 고리 개수 (1 이상). */
  readonly ringCount: number;
  /** 타원 x축 비율 (1 = 원). */
  readonly ellipseX: number;
  /** 타원 y축 비율 (1 = 원). */
  readonly ellipseY: number;
  /** 스냅 모드: 동심 고리("rings", 기본), 방사/집중선("radial"), 초기 진행 방향 자동 잠금("both"). */
  readonly snapMode?: StudioConcentricSnapMode;
  /** 방사선 등분 수 (0 또는 미지정이면 임의 시작 각도 연속 집중선, 2 이상이면 등각 스포크 양자화). */
  readonly radialSpokeCount?: number;
  /** 집중선 중심 여백(내부 불감대 반지름, px). 지정 시 중심에서 이 반지름 안쪽으로는 선이 침범하지 않는다. */
  readonly innerDeadZoneRadius?: number;
}

/**
 * 퍼스펙티브 자: 1–3개의 소실점.
 * 스트로크는 "소실점을 지나는 직선"에 스냅된다. 어떤 소실점의 직선인지는
 * 스트로크 시작 시점의 진행 방향으로 자동 확정된다(CSP UX 재해석).
 */
export interface StudioPerspectiveRuler extends StudioRulerBase {
  readonly kind: "perspective";
  /** 소실점 1–3개. */
  readonly vanishingPoints: ReadonlyArray<RulerPoint>;
}

export type StudioRuler =
  | StudioLineRuler
  | StudioCurveRuler
  | StudioConcentricRuler
  | StudioPerspectiveRuler;

/* ------------------------------------------------------------------ */
/* 기본값 · 정규화                                                     */
/* ------------------------------------------------------------------ */

export const STUDIO_RULER_DEFAULT_COLORS: Readonly<
  Record<StudioRulerKind, string>
> = Object.freeze({
  line: "#4f9cf9",
  curve: "#7c5cff",
  concentric: "#22b8a8",
  perspective: "#f59e0b",
});

export const STUDIO_RULER_DEFAULT_NAMES: Readonly<
  Record<StudioRulerKind, string>
> = Object.freeze({
  line: "직선 자",
  curve: "곡선 자",
  concentric: "동심원 자",
  perspective: "퍼스펙티브 자",
});

const MAX_COORD = 1_000_000;
const MAX_ID_LENGTH = 64;
const MAX_NAME_LENGTH = 80;

function clampCoord(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_COORD, Math.max(-MAX_COORD, n));
}

function clampPoint(value: unknown): RulerPoint {
  const v = value as { x?: unknown; y?: unknown } | null | undefined;
  return { x: clampCoord(v?.x), y: clampCoord(v?.y) };
}

/** 안전한 CSS 색상만 통과시킨다. hex(#rgb/#rrggbb)가 아니면 종류별 기본색으로 폴백. */
export function normalizeStudioRulerColor(
  value: unknown,
  kind: StudioRulerKind,
): string {
  if (
    typeof value === "string" &&
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
  ) {
    return value;
  }
  return STUDIO_RULER_DEFAULT_COLORS[kind];
}

function normalizeBase(
  kind: StudioRulerKind,
  input: {
    id?: unknown;
    name?: unknown;
    visible?: unknown;
    snapEnabled?: unknown;
    color?: unknown;
    maxSnapDistancePx?: unknown;
  } | null | undefined,
): StudioRulerBase {
  const rawId = typeof input?.id === "string" ? input.id.trim() : "";
  const rawName = typeof input?.name === "string" ? input.name.trim() : "";
  const rawMaxDist = Number(input?.maxSnapDistancePx);
  const maxSnapDistancePx =
    Number.isFinite(rawMaxDist) && rawMaxDist > 0
      ? Math.min(MAX_COORD, rawMaxDist)
      : undefined;
  return {
    id:
      rawId.length > 0
        ? rawId.slice(0, MAX_ID_LENGTH)
        : `studio-ruler-${kind}`,
    name:
      rawName.length > 0
        ? rawName.slice(0, MAX_NAME_LENGTH)
        : STUDIO_RULER_DEFAULT_NAMES[kind],
    visible: input?.visible !== false,
    snapEnabled: input?.snapEnabled !== false,
    color: normalizeStudioRulerColor(input?.color, kind),
    ...(maxSnapDistancePx !== undefined ? { maxSnapDistancePx } : {}),
  };
}

/** 직선 자 팩토리. p0/p1이 겹치면 스냅이 비활성화된다(순수 투영 불가). */
export function createStudioLineRuler(input?: {
  id?: unknown;
  name?: unknown;
  visible?: unknown;
  snapEnabled?: unknown;
  color?: unknown;
  maxSnapDistancePx?: unknown;
  p0?: unknown;
  p1?: unknown;
  parallelMode?: unknown;
  parallelSpacingPx?: unknown;
}): StudioLineRuler {
  const rawSpacing = Number(input?.parallelSpacingPx);
  const parallelSpacingPx =
    Number.isFinite(rawSpacing) && rawSpacing > 0
      ? Math.min(100_000, rawSpacing)
      : undefined;
  return {
    ...normalizeBase("line", input),
    kind: "line",
    p0: input?.p0 !== undefined ? clampPoint(input.p0) : { x: 40, y: 120 },
    p1: input?.p1 !== undefined ? clampPoint(input.p1) : { x: 280, y: 120 },
    ...(input?.parallelMode === true ? { parallelMode: true } : {}),
    ...(parallelSpacingPx !== undefined ? { parallelSpacingPx } : {}),
  };
}

/** CSP 평행선 특수 자 전용 팩토리 (각도 기반 생성 지원). */
export function createStudioParallelLineRuler(input?: {
  id?: unknown;
  name?: unknown;
  visible?: unknown;
  snapEnabled?: unknown;
  color?: unknown;
  maxSnapDistancePx?: unknown;
  origin?: unknown;
  angleDeg?: unknown;
  parallelSpacingPx?: unknown;
}): StudioLineRuler {
  const origin =
    input?.origin !== undefined ? clampPoint(input.origin) : { x: 160, y: 120 };
  const rawAngle = Number(input?.angleDeg);
  const angleRad = ((Number.isFinite(rawAngle) ? rawAngle : 0) * Math.PI) / 180;
  const p1 = {
    x: origin.x + Math.cos(angleRad) * 200,
    y: origin.y + Math.sin(angleRad) * 200,
  };
  return createStudioLineRuler({
    ...input,
    name: input?.name ?? "평행선 자",
    p0: origin,
    p1,
    parallelMode: true,
  });
}

/** 곡선 자 팩토리. degree 3이면 p3이 필수다. */
export function createStudioCurveRuler(input?: {
  id?: unknown;
  name?: unknown;
  visible?: unknown;
  snapEnabled?: unknown;
  color?: unknown;
  maxSnapDistancePx?: unknown;
  degree?: unknown;
  p0?: unknown;
  p1?: unknown;
  p2?: unknown;
  p3?: unknown;
}): StudioCurveRuler {
  const degree: 2 | 3 = input?.degree === 3 ? 3 : 2;
  const base = normalizeBase("curve", input);
  const p0 = input?.p0 !== undefined ? clampPoint(input.p0) : { x: 40, y: 160 };
  const p1 = input?.p1 !== undefined ? clampPoint(input.p1) : { x: 160, y: 20 };
  const p2 = input?.p2 !== undefined ? clampPoint(input.p2) : { x: 280, y: 160 };
  if (degree === 3) {
    const p3 =
      input?.p3 !== undefined ? clampPoint(input.p3) : { x: 320, y: 120 };
    return { ...base, kind: "curve", degree, p0, p1, p2, p3 };
  }
  return { ...base, kind: "curve", degree, p0, p1, p2 };
}

/** 동심원·방사선 자 팩토리. */
export function createStudioConcentricRuler(input?: {
  id?: unknown;
  name?: unknown;
  visible?: unknown;
  snapEnabled?: unknown;
  color?: unknown;
  maxSnapDistancePx?: unknown;
  centerX?: unknown;
  centerY?: unknown;
  baseRadius?: unknown;
  ringSpacing?: unknown;
  ringCount?: unknown;
  ellipseX?: unknown;
  ellipseY?: unknown;
  snapMode?: unknown;
  radialSpokeCount?: unknown;
  innerDeadZoneRadius?: unknown;
}): StudioConcentricRuler {
  const rawSpacing = Number(input?.ringSpacing);
  const rawCount = Number(input?.ringCount);
  const rawEllipseX = Number(input?.ellipseX);
  const rawEllipseY = Number(input?.ellipseY);
  const rawSpokes = Number(input?.radialSpokeCount);
  const rawDeadZone = Number(input?.innerDeadZoneRadius);
  const snapMode: StudioConcentricSnapMode =
    input?.snapMode === "radial" || input?.snapMode === "both"
      ? input.snapMode
      : "rings";
  const radialSpokeCount =
    Number.isFinite(rawSpokes) && rawSpokes >= 2
      ? Math.min(360, Math.round(rawSpokes))
      : undefined;
  const innerDeadZoneRadius =
    Number.isFinite(rawDeadZone) && rawDeadZone > 0
      ? Math.min(100_000, rawDeadZone)
      : undefined;
  return {
    ...normalizeBase("concentric", input),
    kind: "concentric",
    centerX: input?.centerX !== undefined ? clampCoord(input.centerX) : 160,
    centerY: input?.centerY !== undefined ? clampCoord(input.centerY) : 120,
    baseRadius: Math.max(
      0,
      input?.baseRadius !== undefined ? clampCoord(input.baseRadius) : 30,
    ),
    ringSpacing: Number.isFinite(rawSpacing)
      ? Math.min(100_000, Math.max(1, rawSpacing))
      : 30,
    ringCount: Number.isFinite(rawCount)
      ? Math.min(64, Math.max(1, Math.round(rawCount)))
      : 3,
    ellipseX:
      Number.isFinite(rawEllipseX) && rawEllipseX > 0
        ? Math.min(10, rawEllipseX)
        : 1,
    ellipseY:
      Number.isFinite(rawEllipseY) && rawEllipseY > 0
        ? Math.min(10, rawEllipseY)
        : 1,
    ...(snapMode !== "rings" ? { snapMode } : {}),
    ...(radialSpokeCount !== undefined ? { radialSpokeCount } : {}),
    ...(innerDeadZoneRadius !== undefined ? { innerDeadZoneRadius } : {}),
  };
}

/** CSP 방사선(집중선) 특수 자 전용 팩토리. */
export function createStudioRadialRuler(input?: {
  id?: unknown;
  name?: unknown;
  visible?: unknown;
  snapEnabled?: unknown;
  color?: unknown;
  maxSnapDistancePx?: unknown;
  centerX?: unknown;
  centerY?: unknown;
  radialSpokeCount?: unknown;
  innerDeadZoneRadius?: unknown;
  ellipseX?: unknown;
  ellipseY?: unknown;
}): StudioConcentricRuler {
  return createStudioConcentricRuler({
    ...input,
    name: input?.name ?? "방사선 자",
    snapMode: "radial",
  });
}

/** 퍼스펙티브 자 팩토리. 소실점이 1–3개가 아니면 null(무효 자). */
export function createStudioPerspectiveRuler(input?: {
  id?: unknown;
  name?: unknown;
  visible?: unknown;
  snapEnabled?: unknown;
  color?: unknown;
  vanishingPoints?: unknown;
}): StudioPerspectiveRuler | null {
  const raw = input?.vanishingPoints;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 3) return null;
  const points: RulerPoint[] = [];
  for (const entry of raw) {
    const v = entry as { x?: unknown; y?: unknown } | null | undefined;
    if (
      v === null ||
      v === undefined ||
      !Number.isFinite(Number(v.x)) ||
      !Number.isFinite(Number(v.y))
    ) {
      return null;
    }
    points.push(clampPoint(v));
  }
  return {
    ...normalizeBase("perspective", input),
    kind: "perspective",
    vanishingPoints: Object.freeze(points),
  };
}

/* ------------------------------------------------------------------ */
/* 스냅 수학                                                           */
/* ------------------------------------------------------------------ */

/**
 * 점을 두 점이 만드는 직선(무한 직선)에 투영한다.
 * p0 == p1이면 투영이 정의되지 않아 입력 그대로 반환한다.
 */
export function projectPointOnLine(
  point: RulerPoint,
  a: RulerPoint,
  b: RulerPoint,
): RulerPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return { x: point.x, y: point.y };
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
  return { x: a.x + dx * t, y: a.y + dy * t };
}

function evalQuadratic(
  p0: RulerPoint,
  p1: RulerPoint,
  p2: RulerPoint,
  t: number,
): RulerPoint {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function evalCubic(
  p0: RulerPoint,
  p1: RulerPoint,
  p2: RulerPoint,
  p3: RulerPoint,
  t: number,
): RulerPoint {
  const u = 1 - t;
  const u2 = u * u;
  const t2 = t * t;
  return {
    x: u2 * u * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t2 * t * p3.x,
    y: u2 * u * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t2 * t * p3.y,
  };
}

export interface StudioBezierSnapResult {
  readonly point: RulerPoint;
  /** 곡선 위 매개변수 t (0–1). */
  readonly t: number;
  readonly distance: number;
}

/**
 * 2차/3차 베지어 곡선 위의 최근접점을 찾는다.
 * 64구간 조밀 샘플링으로 후보 t를 잡고, 6회 국소 세분화로 정밀화한다.
 * 결정적(deterministic)이며 반복문 횟수가 고정되어 있다.
 */
export function nearestPointOnBezier(
  controls: ReadonlyArray<RulerPoint>,
  point: RulerPoint,
): StudioBezierSnapResult {
  const degree = controls.length - 1;
  const evaluate =
    degree === 3
      ? (t: number) =>
          evalCubic(controls[0], controls[1], controls[2], controls[3], t)
      : (t: number) => evalQuadratic(controls[0], controls[1], controls[2], t);

  let bestT = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  const SEGMENTS = 64;
  for (let i = 0; i <= SEGMENTS; i += 1) {
    const t = i / SEGMENTS;
    const p = evaluate(t);
    const d = Math.hypot(p.x - point.x, p.y - point.y);
    if (d < bestDist) {
      bestDist = d;
      bestT = t;
    }
  }
  // 국소 세분화: 윈도우를 절반씩 줄이며 6회 정밀화
  let window = 1 / SEGMENTS;
  for (let round = 0; round < 6; round += 1) {
    window /= 2;
    for (const candidate of [bestT - window, bestT + window]) {
      if (candidate < 0 || candidate > 1) continue;
      const p = evaluate(candidate);
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d < bestDist) {
        bestDist = d;
        bestT = candidate;
      }
    }
  }
  return { point: evaluate(bestT), t: bestT, distance: bestDist };
}

export interface StudioConcentricSnapResult {
  readonly point: RulerPoint;
  /** 스냅된 고리 인덱스 (0 = 가장 안쪽). */
  readonly ringIndex: number;
  /** 스냅된 고리의 반지름. */
  readonly radius: number;
}

/** 동심원(타원) 자 스냅: 타원 정규화 공간에서 각도는 유지하고 반지름을 가장 가까운 고리에 맞춘다. */
export function snapPointToConcentricRuler(
  ruler: StudioConcentricRuler,
  point: RulerPoint,
): StudioConcentricSnapResult {
  const { centerX: cx, centerY: cy, ellipseX: ex, ellipseY: ey } = ruler;
  const dx = (point.x - cx) / ex;
  const dy = (point.y - cy) / ey;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-9) {
    return { point: { x: cx, y: cy }, ringIndex: 0, radius: ruler.baseRadius };
  }
  const rawIndex = Math.round((dist - ruler.baseRadius) / ruler.ringSpacing);
  const ringIndex = Math.min(ruler.ringCount - 1, Math.max(0, rawIndex));
  const radius = ruler.baseRadius + ringIndex * ruler.ringSpacing;
  const angle = Math.atan2(dy, dx);
  return {
    point: { x: cx + Math.cos(angle) * radius * ex, y: cy + Math.sin(angle) * radius * ey },
    ringIndex,
    radius,
  };
}

export interface StudioRadialSnapResult {
  readonly point: RulerPoint;
  readonly angleRad: number;
  readonly radius: number;
}

/** 방사선(집중선) 자 스냅: 중심에서 뻗어 나가는 방사선 각도를 고정(또는 등분 스포크 양자화)하고 내부 불감대를 지킨다. */
export function snapPointToRadialRuler(
  ruler: StudioConcentricRuler,
  point: RulerPoint,
  lockedAngleRad?: number,
): StudioRadialSnapResult {
  const { centerX: cx, centerY: cy, ellipseX: ex, ellipseY: ey } = ruler;
  const dx = (point.x - cx) / ex;
  const dy = (point.y - cy) / ey;
  const rawDist = Math.hypot(dx, dy);
  let angleRad = lockedAngleRad ?? (rawDist < 1e-9 ? 0 : Math.atan2(dy, dx));
  if (lockedAngleRad === undefined && ruler.radialSpokeCount && ruler.radialSpokeCount >= 2) {
    const step = (2 * Math.PI) / ruler.radialSpokeCount;
    angleRad = Math.round(angleRad / step) * step;
  }
  const ux = Math.cos(angleRad);
  const uy = Math.sin(angleRad);
  const projDist = lockedAngleRad !== undefined ? Math.max(0, dx * ux + dy * uy) : rawDist;
  const radius = Math.max(ruler.innerDeadZoneRadius ?? 0, projDist);
  return {
    point: { x: cx + ux * radius * ex, y: cy + uy * radius * ey },
    angleRad,
    radius,
  };
}

/* ---------------- 퍼스펙티브 자 (세션 기반) ---------------- */

export interface StudioPerspectiveSnapSession {
  readonly rulerId: string;
  readonly start: RulerPoint;
  readonly guideVanishingPointIndex: number;
}

export function beginStudioPerspectiveSnapSession(
  ruler: StudioPerspectiveRuler,
  start: RulerPoint,
): StudioPerspectiveSnapSession {
  return { rulerId: ruler.id, start, guideVanishingPointIndex: -1 };
}

function wrapPi(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

export interface StudioPerspectiveSnapResult {
  readonly session: StudioPerspectiveSnapSession;
  readonly point: RulerPoint;
  readonly snapped: boolean;
}

export function snapStudioPerspectivePoint(
  ruler: StudioPerspectiveRuler,
  session: StudioPerspectiveSnapSession,
  sample: RulerPoint,
): StudioPerspectiveSnapResult {
  const vps = ruler.vanishingPoints;
  if (vps.length === 0) return { session, point: sample, snapped: false };
  if (session.guideVanishingPointIndex >= 0) {
    const vp = vps[session.guideVanishingPointIndex];
    return { session, point: projectPointOnLine(sample, vp, session.start), snapped: true };
  }
  const moved = Math.hypot(sample.x - session.start.x, sample.y - session.start.y);
  if (moved < 1e-9) return { session, point: sample, snapped: false };
  const moveAngle = Math.atan2(sample.y - session.start.y, sample.x - session.start.x);
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < vps.length; i += 1) {
    const rayAngle = Math.atan2(session.start.y - vps[i].y, session.start.x - vps[i].x);
    const diff = Math.abs(wrapPi(rayAngle - moveAngle));
    const score = Math.min(diff, Math.PI - diff);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  const locked: StudioPerspectiveSnapSession = { ...session, guideVanishingPointIndex: bestIndex };
  return {
    session: locked,
    point: projectPointOnLine(sample, vps[bestIndex], session.start),
    snapped: true,
  };
}

/* ---------------- 종류 무관 디스패치 ---------------- */

export type StudioRulerSnapState =
  | { readonly kind: "perspective"; readonly session: StudioPerspectiveSnapSession }
  | { readonly kind: "parallel"; readonly rulerId: string; readonly a0: RulerPoint; readonly a1: RulerPoint }
  | { readonly kind: "radial"; readonly rulerId: string; readonly angleRad: number }
  | null;

export interface StudioRulerSnapResult {
  readonly state: StudioRulerSnapState;
  readonly point: RulerPoint;
  readonly snapped: boolean;
}

function withinMaxDistance(point: RulerPoint, snapped: RulerPoint, maxDist?: number): boolean {
  if (maxDist === undefined || maxDist <= 0) return true;
  return Math.hypot(snapped.x - point.x, snapped.y - point.y) <= maxDist;
}

/** 자 종류에 관계없이 스트로크 샘플 1개를 스냅한다. */
export function snapStudioRulerPoint(
  ruler: StudioRuler,
  point: RulerPoint,
  state: StudioRulerSnapState = null,
): StudioRulerSnapResult {
  if (!ruler.visible || !ruler.snapEnabled) {
    return { state: null, point, snapped: false };
  }
  switch (ruler.kind) {
    case "line": {
      const dx = ruler.p1.x - ruler.p0.x;
      const dy = ruler.p1.y - ruler.p0.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) return { state: null, point, snapped: false };
      if (ruler.parallelMode) {
        if (state?.kind === "parallel" && state.rulerId === ruler.id) {
          return { state, point: projectPointOnLine(point, state.a0, state.a1), snapped: true };
        }
        const ux = dx / len;
        const uy = dy / len;
        const nx = -uy;
        const ny = ux;
        let anchor = point;
        if (ruler.parallelSpacingPx && ruler.parallelSpacingPx > 0) {
          const offset = (point.x - ruler.p0.x) * nx + (point.y - ruler.p0.y) * ny;
          const qOffset = Math.round(offset / ruler.parallelSpacingPx) * ruler.parallelSpacingPx;
          const baseProj = projectPointOnLine(point, ruler.p0, ruler.p1);
          anchor = { x: baseProj.x + nx * qOffset, y: baseProj.y + ny * qOffset };
        }
        const a1 = { x: anchor.x + ux * 100, y: anchor.y + uy * 100 };
        const nextState: StudioRulerSnapState = { kind: "parallel", rulerId: ruler.id, a0: anchor, a1 };
        return { state: nextState, point: anchor, snapped: true };
      }
      const projected = projectPointOnLine(point, ruler.p0, ruler.p1);
      if (!withinMaxDistance(point, projected, ruler.maxSnapDistancePx)) {
        return { state: null, point, snapped: false };
      }
      return { state: null, point: projected, snapped: true };
    }
    case "curve": {
      const controls =
        ruler.degree === 3 ? [ruler.p0, ruler.p1, ruler.p2, ruler.p3] : [ruler.p0, ruler.p1, ruler.p2];
      const snapped = nearestPointOnBezier(controls, point).point;
      if (!withinMaxDistance(point, snapped, ruler.maxSnapDistancePx)) {
        return { state: null, point, snapped: false };
      }
      return { state: null, point: snapped, snapped: true };
    }
    case "concentric": {
      if (ruler.snapMode === "radial") {
        const lockedAngle =
          state?.kind === "radial" && state.rulerId === ruler.id ? state.angleRad : undefined;
        const res = snapPointToRadialRuler(ruler, point, lockedAngle);
        return {
          state: { kind: "radial", rulerId: ruler.id, angleRad: res.angleRad },
          point: res.point,
          snapped: true,
        };
      }
      const snapped = snapPointToConcentricRuler(ruler, point).point;
      if (!withinMaxDistance(point, snapped, ruler.maxSnapDistancePx)) {
        return { state: null, point, snapped: false };
      }
      return { state: null, point: snapped, snapped: true };
    }
    case "perspective": {
      const session =
        state?.kind === "perspective" && state.session.rulerId === ruler.id
          ? state.session
          : beginStudioPerspectiveSnapSession(ruler, point);
      const result = snapStudioPerspectivePoint(ruler, session, point);
      return {
        state: { kind: "perspective", session: result.session },
        point: result.point,
        snapped: result.snapped,
      };
    }
  }
}
