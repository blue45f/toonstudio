/**
 * Studio Blend Spine & Falloff Field Duplicator
 *
 * Illustrator Blend Spine(`Replace Spine`), Pattern Along Path, Cuttle식 `rep` 파라미터 변조,
 * Cavalry식 공간 감쇠장(Falloff Field) 복제를 순수·결정적 TypeScript로 구현한 비파괴 벡터 엔진.
 */

export interface BlendVec2 { readonly x: number; readonly y: number }
/** 0..1 정규화 선형 RGBA 색상(원시 헥스 문자열 없이 수치 채널로 표현). */
export interface LinearRgbaColor { readonly r: number; readonly g: number; readonly b: number; readonly a: number }
export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; readonly a: number }
export type OklchHueMode = "shortest" | "longest" | "cw" | "ccw";
export type FalloffEasing = "linear" | "smoothstep" | "ease-in" | "ease-out" | "ease-in-out";
export type Transform2DMatrix = readonly [number, number, number, number, number, number];
export interface CubicBezierSegment { readonly p0: BlendVec2; readonly c1: BlendVec2; readonly c2: BlendVec2; readonly p1: BlendVec2 }

export type SpineCurve =
  | { readonly kind: "polyline"; readonly points: readonly BlendVec2[]; readonly closed?: boolean }
  | { readonly kind: "cubic-bezier"; readonly segments: readonly CubicBezierSegment[]; readonly closed?: boolean };

export interface SpineSample {
  readonly point: BlendVec2;
  readonly tangent: BlendVec2;
  readonly normal: BlendVec2;
  readonly angleRad: number;
  readonly distancePx: number;
  readonly u: number;
}

export interface BlendShapeKey {
  readonly id: string;
  readonly points: readonly BlendVec2[];
  readonly closed: boolean;
  readonly fill?: LinearRgbaColor;
  readonly stroke?: LinearRgbaColor;
  readonly strokeWidthPx: number;
  readonly opacity: number;
}

export type BlendSpacingSpec =
  | { readonly mode: "steps"; readonly steps: number }
  | { readonly mode: "distance"; readonly distancePx: number; readonly maxSteps?: number }
  | { readonly mode: "smooth-color"; readonly maxSteps?: number };

export interface BlendSpineConfig {
  readonly kind: "blend-morph";
  readonly id: string;
  readonly startShape: BlendShapeKey;
  readonly endShape: BlendShapeKey;
  readonly spacing: BlendSpacingSpec;
  readonly spine?: SpineCurve;
  readonly alignToTangent: boolean;
  readonly easing?: FalloffEasing;
  readonly hueMode?: OklchHueMode;
  readonly resampleVertexCount?: number;
}

export interface EvaluatedBlendStep {
  readonly index: number;
  readonly t: number;
  readonly distancePx: number;
  readonly center: BlendVec2;
  readonly rotationRad: number;
  readonly points: readonly BlendVec2[];
  readonly closed: boolean;
  readonly fill?: LinearRgbaColor;
  readonly stroke?: LinearRgbaColor;
  readonly strokeWidthPx: number;
  readonly opacity: number;
  readonly matrix: Transform2DMatrix;
}

export interface BlendSpineEvaluation {
  readonly kind: "blend-morph";
  readonly id: string;
  readonly totalArcLengthPx: number;
  readonly stepCount: number;
  readonly matchedVertexCount: number;
  readonly steps: readonly EvaluatedBlendStep[];
  readonly fingerprint: string;
}

export type DuplicatorDistribution =
  | { readonly kind: "linear"; readonly count: number; readonly spacingPx: number; readonly angleDeg?: number; readonly origin?: BlendVec2; readonly centered?: boolean }
  | { readonly kind: "grid"; readonly columns: number; readonly rows: number; readonly spacingX: number; readonly spacingY: number; readonly origin?: BlendVec2; readonly centered?: boolean }
  | { readonly kind: "radial"; readonly count: number; readonly radiusPx: number; readonly center?: BlendVec2; readonly startAngleDeg?: number; readonly sweepDeg?: number; readonly alignOutward?: boolean }
  | {
      readonly kind: "path";
      readonly spine: SpineCurve;
      readonly spacing: { readonly mode: "count"; readonly count: number } | { readonly mode: "distance"; readonly distancePx: number; readonly maxCount?: number };
      readonly alignToTangent: boolean;
      readonly normalOffsetPx?: number;
      readonly startOffset01?: number;
      readonly endOffset01?: number;
    };

export interface DuplicatorSymbolRef {
  readonly symbolId: string;
  readonly localPoints: readonly BlendVec2[];
  readonly closed: boolean;
  readonly baseFill?: LinearRgbaColor;
  readonly baseStroke?: LinearRgbaColor;
  readonly strokeWidthPx?: number;
}

export interface RepModulatorSpec {
  readonly scaleStart?: number;
  readonly scaleEnd?: number;
  readonly scaleWaveAmp?: number;
  readonly scaleWaveFreq?: number;
  readonly rotationStepDeg?: number;
  readonly normalWaveAmpPx?: number;
  readonly normalWaveFreq?: number;
  readonly opacityStart?: number;
  readonly opacityEnd?: number;
  readonly alternateFlipY?: boolean;
}

export type FalloffField =
  | { readonly kind: "linear"; readonly origin: BlendVec2; readonly directionDeg: number; readonly lengthPx: number; readonly invert?: boolean; readonly easing?: FalloffEasing; readonly weight?: number }
  | { readonly kind: "radial"; readonly center: BlendVec2; readonly innerRadiusPx: number; readonly outerRadiusPx: number; readonly invert?: boolean; readonly easing?: FalloffEasing; readonly weight?: number }
  | { readonly kind: "noise"; readonly scalePx: number; readonly seed: number; readonly offset?: BlendVec2; readonly contrast?: number; readonly invert?: boolean; readonly easing?: FalloffEasing; readonly weight?: number };

export type FalloffCombineMode = "add" | "multiply" | "max" | "min";

export interface FalloffResponseSpec {
  readonly scaleDelta?: number;
  readonly rotationDeltaDeg?: number;
  readonly translateXDeltaPx?: number;
  readonly translateYDeltaPx?: number;
  readonly opacityDelta?: number;
  readonly tintTarget?: LinearRgbaColor;
}

export interface DuplicatorJitterSpec { readonly seed: number; readonly positionPx?: number; readonly rotationDeg?: number; readonly scaleRatio?: number }

export interface PatternDuplicatorConfig {
  readonly kind: "pattern-duplicator";
  readonly id: string;
  readonly symbols: readonly DuplicatorSymbolRef[];
  readonly symbolOrder?: "sequential" | "ping-pong" | "seeded";
  readonly distribution: DuplicatorDistribution;
  readonly repModulator?: RepModulatorSpec;
  readonly falloffFields?: readonly FalloffField[];
  readonly falloffCombineMode?: FalloffCombineMode;
  readonly falloffResponse?: FalloffResponseSpec;
  readonly jitter?: DuplicatorJitterSpec;
  readonly hueMode?: OklchHueMode;
}

export interface EvaluatedDuplicatorInstance {
  readonly index: number;
  readonly rep: number;
  readonly t: number;
  readonly symbolId: string;
  readonly position: BlendVec2;
  readonly rotationRad: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly opacity: number;
  readonly fill?: LinearRgbaColor;
  readonly stroke?: LinearRgbaColor;
  readonly strokeWidthPx: number;
  readonly falloffWeight: number;
  readonly matrix: Transform2DMatrix;
  readonly worldPoints: readonly BlendVec2[];
  readonly closed: boolean;
}

export interface PatternDuplicatorEvaluation {
  readonly kind: "pattern-duplicator";
  readonly id: string;
  readonly instanceCount: number;
  readonly totalArcLengthPx: number;
  readonly instances: readonly EvaluatedDuplicatorInstance[];
  readonly fingerprint: string;
}

export interface EditableExpandedVectorItem {
  readonly id: string;
  readonly sourceNodeId: string;
  readonly sourceIndex: number;
  readonly symbolId?: string;
  readonly points: readonly BlendVec2[];
  readonly closed: boolean;
  readonly fill?: LinearRgbaColor;
  readonly stroke?: LinearRgbaColor;
  readonly strokeWidthPx: number;
  readonly opacity: number;
  readonly matrix: Transform2DMatrix;
}

const EPS = 1e-6;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const DEFAULT_MAX_STEPS = 256;
const BEZIER_SUBDIVISIONS = 24;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function applyFalloffEasing(t: number, easing: FalloffEasing = "linear"): number {
  const u = clamp(t, 0, 1);
  if (easing === "smoothstep") return u * u * (3 - 2 * u);
  if (easing === "ease-in") return u * u * u;
  if (easing === "ease-out") return 1 - Math.pow(1 - u, 3);
  if (easing === "ease-in-out") return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  return u;
}

/** 결정적 시드 기반 [0, 1) 부동소수 해시(순수 의사난수). */
export function hashDeterministicFloat(seed: number, index: number, salt = 0): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(index | 0, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 결정적 2D 스무스 값 노이즈([0, 1]). */
export function sampleDeterministicNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const g = (ix: number, iy: number): number => hashDeterministicFloat(seed, Math.imul(ix, 374761393) + Math.imul(iy, 668265263), 17);
  return lerp(lerp(g(x0, y0), g(x0 + 1, y0), u), lerp(g(x0, y0 + 1), g(x0 + 1, y0 + 1), u), v);
}

export function composeTransform2D(tx: number, ty: number, rotationRad: number, scaleX: number, scaleY: number): Transform2DMatrix {
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  return [cos * scaleX, sin * scaleX, -sin * scaleY, cos * scaleY, tx, ty];
}

export function applyTransform2D(point: BlendVec2, matrix: Transform2DMatrix): BlendVec2 {
  return { x: matrix[0] * point.x + matrix[2] * point.y + matrix[4], y: matrix[1] * point.x + matrix[3] * point.y + matrix[5] };
}

/** 선형 RGBA -> OKLCH 지각 색 공간 변환(Ottosson OKLab 행렬). */
export function linearRgbaToOklch(color: LinearRgbaColor): OklchColor {
  const r = clamp(color.r, 0, 1);
  const g = clamp(color.g, 0, 1);
  const b = clamp(color.b, 0, 1);
  const lC = Math.cbrt(Math.max(0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b));
  const mC = Math.cbrt(Math.max(0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b));
  const sC = Math.cbrt(Math.max(0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b));
  const L = 0.2104542553 * lC + 0.7936177850 * mC - 0.0040720468 * sC;
  const A = 1.9779984951 * lC - 2.4285922050 * mC + 0.4505937099 * sC;
  const B = 0.0259040371 * lC + 0.7827717662 * mC - 0.8086757660 * sC;
  const C = Math.hypot(A, B);
  const rawHue = C < EPS ? 0 : Math.atan2(B, A) * RAD_TO_DEG;
  return { l: L, c: C, h: rawHue < 0 ? rawHue + 360 : rawHue, a: clamp(color.a, 0, 1) };
}

/** OKLCH -> 선형 RGBA 역변환(0..1 클램프). */
export function oklchToLinearRgba(color: OklchColor): LinearRgbaColor {
  const rad = color.h * DEG_TO_RAD;
  const A = color.c * Math.cos(rad);
  const B = color.c * Math.sin(rad);
  const lC = color.l + 0.3963377774 * A + 0.2158037573 * B;
  const mC = color.l - 0.1055613458 * A - 0.0638541728 * B;
  const sC = color.l - 0.0894841775 * A - 1.2914855480 * B;
  const l = lC * lC * lC;
  const m = mC * mC * mC;
  const s = sC * sC * sC;
  return {
    r: clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, 0, 1),
    g: clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, 0, 1),
    b: clamp(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s, 0, 1),
    a: clamp(color.a, 0, 1),
  };
}

export function interpolateOklchRgba(start: LinearRgbaColor, end: LinearRgbaColor, t: number, hueMode: OklchHueMode = "shortest"): LinearRgbaColor {
  const u = clamp(t, 0, 1);
  const a = linearRgbaToOklch(start);
  const b = linearRgbaToOklch(end);
  const h1 = a.c < 1e-4 ? b.h : a.h;
  const h2 = b.c < 1e-4 ? a.h : b.h;
  let delta = h2 - h1;
  if (hueMode === "shortest") delta = delta > 180 ? delta - 360 : delta < -180 ? delta + 360 : delta;
  else if (hueMode === "longest") delta = delta > 0 && delta < 180 ? delta - 360 : delta <= 0 && delta > -180 ? delta + 360 : delta;
  else if (hueMode === "cw" && delta < 0) delta += 360;
  else if (hueMode === "ccw" && delta > 0) delta -= 360;
  return oklchToLinearRgba({ l: lerp(a.l, b.l, u), c: lerp(a.c, b.c, u), h: (((h1 + delta * u) % 360) + 360) % 360, a: lerp(a.a, b.a, u) });
}

function evalCubic(seg: CubicBezierSegment, t: number): BlendVec2 {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * seg.p0.x + 3 * mt2 * t * seg.c1.x + 3 * mt * t2 * seg.c2.x + t2 * t * seg.p1.x,
    y: mt2 * mt * seg.p0.y + 3 * mt2 * t * seg.c1.y + 3 * mt * t2 * seg.c2.y + t2 * t * seg.p1.y,
  };
}

function flattenSpineToPolyline(spine: SpineCurve): { points: BlendVec2[]; closed: boolean } {
  if (spine.kind === "polyline") return { points: [...spine.points], closed: Boolean(spine.closed) };
  const pts: BlendVec2[] = [];
  for (let s = 0; s < spine.segments.length; s += 1) {
    for (let i = s === 0 ? 0 : 1; i <= BEZIER_SUBDIVISIONS; i += 1) pts.push(evalCubic(spine.segments[s]!, i / BEZIER_SUBDIVISIONS));
  }
  return { points: pts, closed: Boolean(spine.closed) };
}

interface ArcLengthLut { readonly points: readonly BlendVec2[]; readonly cumulative: readonly number[]; readonly totalLength: number }

function buildArcLengthLut(points: readonly BlendVec2[], closed: boolean): ArcLengthLut {
  if (points.length === 0) return { points: [], cumulative: [], totalLength: 0 };
  const list = closed && points.length >= 2 ? [...points, points[0]!] : [...points];
  const cumulative: number[] = [0];
  let total = 0;
  for (let i = 1; i < list.length; i += 1) {
    total += Math.hypot(list[i]!.x - list[i - 1]!.x, list[i]!.y - list[i - 1]!.y);
    cumulative.push(total);
  }
  return { points: list, cumulative, totalLength: total };
}

function sampleLutAtDistance(lut: ArcLengthLut, rawDistance: number): SpineSample {
  if (lut.points.length <= 1 || lut.totalLength < EPS) {
    return { point: lut.points[0] ?? { x: 0, y: 0 }, tangent: { x: 1, y: 0 }, normal: { x: 0, y: 1 }, angleRad: 0, distancePx: 0, u: 0 };
  }
  const dist = clamp(rawDistance, 0, lut.totalLength);
  let lo = 0;
  let hi = lut.cumulative.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (lut.cumulative[mid]! <= dist) lo = mid;
    else hi = mid;
  }
  const d0 = lut.cumulative[lo]!;
  const localT = clamp((dist - d0) / Math.max(EPS, lut.cumulative[hi]! - d0), 0, 1);
  const p0 = lut.points[lo]!;
  const p1 = lut.points[hi]!;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.max(EPS, Math.hypot(dx, dy));
  const tx = dx / len;
  const ty = dy / len;
  return { point: { x: lerp(p0.x, p1.x, localT), y: lerp(p0.y, p1.y, localT) }, tangent: { x: tx, y: ty }, normal: { x: -ty, y: tx }, angleRad: Math.atan2(ty, tx), distancePx: dist, u: dist / lut.totalLength };
}

export function measureSpineArcLength(spine: SpineCurve): number {
  const flat = flattenSpineToPolyline(spine);
  return buildArcLengthLut(flat.points, flat.closed).totalLength;
}

export function sampleSpineAtFraction(spine: SpineCurve, u: number): SpineSample {
  const flat = flattenSpineToPolyline(spine);
  const lut = buildArcLengthLut(flat.points, flat.closed);
  return sampleLutAtDistance(lut, clamp(u, 0, 1) * lut.totalLength);
}

/** 정점 수가 다른 두 벡터 도형을 호길이 기준으로 리샘플링해 1:1 매칭한다. */
export function resamplePolylineByArcLength(points: readonly BlendVec2[], targetCount: number, closed: boolean): BlendVec2[] {
  const count = Math.max(2, Math.floor(targetCount));
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: count }, () => points[0]!);
  const lut = buildArcLengthLut(points, closed);
  const denom = closed ? count : count - 1;
  return Array.from({ length: count }, (_, i) => sampleLutAtDistance(lut, (denom > 0 ? i / denom : 0) * lut.totalLength).point);
}

function centroidOfPoints(points: readonly BlendVec2[]): BlendVec2 {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

function alignClosedLoopRotation(startRel: readonly BlendVec2[], endRel: readonly BlendVec2[]): BlendVec2[] {
  const n = startRel.length;
  if (n <= 2) return [...endRel];
  let bestShift = 0;
  let bestCost = Infinity;
  for (let shift = 0; shift < n; shift += 1) {
    let cost = 0;
    for (let i = 0; i < n; i += 1) {
      const dx = startRel[i]!.x - endRel[(i + shift) % n]!.x;
      const dy = startRel[i]!.y - endRel[(i + shift) % n]!.y;
      cost += dx * dx + dy * dy;
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestShift = shift;
    }
  }
  return Array.from({ length: n }, (_, i) => endRel[(i + bestShift) % n]!);
}

function resolveBlendStepCount(spacing: BlendSpacingSpec, arcLength: number, startShape: BlendShapeKey, endShape: BlendShapeKey): number {
  if (spacing.mode === "steps") return clamp(Math.floor(spacing.steps), 1, DEFAULT_MAX_STEPS);
  if (spacing.mode === "distance") {
    return clamp(Math.max(1, Math.round(arcLength / Math.max(1, spacing.distancePx))), 1, clamp(spacing.maxSteps ?? DEFAULT_MAX_STEPS, 1, DEFAULT_MAX_STEPS));
  }
  const c1 = startShape.fill ?? startShape.stroke ?? { r: 0, g: 0, b: 0, a: 1 };
  const c2 = endShape.fill ?? endShape.stroke ?? { r: 1, g: 1, b: 1, a: 1 };
  const diff = Math.max(Math.abs(c2.r - c1.r), Math.abs(c2.g - c1.g), Math.abs(c2.b - c1.b), Math.abs(c2.a - c1.a));
  return clamp(Math.max(2, Math.ceil(diff * 32)), 2, clamp(spacing.maxSteps ?? 64, 2, DEFAULT_MAX_STEPS));
}

function computeFingerprint(parts: readonly (string | number | boolean)[]): string {
  let hash = 2166136261;
  for (const part of parts) {
    const str = String(part);
    for (let i = 0; i < str.length; i += 1) hash = Math.imul(hash ^ str.charCodeAt(i), 16777619) >>> 0;
    hash = Math.imul(hash ^ 124, 16777619) >>> 0;
  }
  return `blend-${hash.toString(16).padStart(8, "0")}`;
}

/** 비파괴 Replace Spine: 기존 블렌드 설정을 보존한 채 스파인 곡선만 교체한다. */
export function replaceBlendSpine(config: BlendSpineConfig, nextSpine: SpineCurve | undefined): BlendSpineConfig {
  return { ...config, spine: nextSpine };
}

/** 모드 A: 두 벡터 셰이프를 지정 스파인과 OKLCH 색상 공간에서 비파괴 보간한다. */
export function evaluateBlendSpine(config: BlendSpineConfig): BlendSpineEvaluation {
  const vertexCount = clamp(config.resampleVertexCount ?? Math.max(config.startShape.points.length, config.endShape.points.length, 4), 2, 512);
  const closed = config.startShape.closed && config.endShape.closed;
  const startResampled = resamplePolylineByArcLength(config.startShape.points, vertexCount, closed);
  const endResampled = resamplePolylineByArcLength(config.endShape.points, vertexCount, closed);
  const startCenter = centroidOfPoints(startResampled);
  const endCenter = centroidOfPoints(endResampled);
  const startRel = startResampled.map((p) => ({ x: p.x - startCenter.x, y: p.y - startCenter.y }));
  const rawEndRel = endResampled.map((p) => ({ x: p.x - endCenter.x, y: p.y - endCenter.y }));
  const endRel = closed ? alignClosedLoopRotation(startRel, rawEndRel) : rawEndRel;

  const flatSpine = flattenSpineToPolyline(config.spine ?? { kind: "polyline", points: [startCenter, endCenter], closed: false });
  const spineLut = buildArcLengthLut(flatSpine.points, flatSpine.closed);
  const totalInstances = resolveBlendStepCount(config.spacing, spineLut.totalLength, config.startShape, config.endShape) + 2;
  const easing = config.easing ?? "linear";
  const hueMode = config.hueMode ?? "shortest";

  const steps: EvaluatedBlendStep[] = Array.from({ length: totalInstances }, (_, i) => {
    const t = applyFalloffEasing(totalInstances > 1 ? i / (totalInstances - 1) : 0, easing);
    const s = sampleLutAtDistance(spineLut, t * spineLut.totalLength);
    const rotationRad = config.alignToTangent ? s.angleRad : 0;
    const matrix = composeTransform2D(s.point.x, s.point.y, rotationRad, 1, 1);
    return {
      index: i,
      t,
      distancePx: s.distancePx,
      center: s.point,
      rotationRad,
      points: startRel.map((sp, idx) => applyTransform2D({ x: lerp(sp.x, endRel[idx]!.x, t), y: lerp(sp.y, endRel[idx]!.y, t) }, matrix)),
      closed,
      fill: config.startShape.fill && config.endShape.fill ? interpolateOklchRgba(config.startShape.fill, config.endShape.fill, t, hueMode) : config.startShape.fill ?? config.endShape.fill,
      stroke: config.startShape.stroke && config.endShape.stroke ? interpolateOklchRgba(config.startShape.stroke, config.endShape.stroke, t, hueMode) : config.startShape.stroke ?? config.endShape.stroke,
      strokeWidthPx: lerp(config.startShape.strokeWidthPx, config.endShape.strokeWidthPx, t),
      opacity: clamp(lerp(config.startShape.opacity, config.endShape.opacity, t), 0, 1),
      matrix,
    };
  });

  return {
    kind: "blend-morph",
    id: config.id,
    totalArcLengthPx: spineLut.totalLength,
    stepCount: totalInstances,
    matchedVertexCount: vertexCount,
    steps,
    fingerprint: computeFingerprint([config.id, totalInstances, vertexCount, Math.round(spineLut.totalLength * 100), config.alignToTangent, easing, hueMode]),
  };
}

function evaluateSingleFalloff(point: BlendVec2, field: FalloffField): number {
  let raw: number;
  if (field.kind === "linear") {
    const rad = field.directionDeg * DEG_TO_RAD;
    raw = clamp(1 - ((point.x - field.origin.x) * Math.cos(rad) + (point.y - field.origin.y) * Math.sin(rad)) / Math.max(EPS, field.lengthPx), 0, 1);
  } else if (field.kind === "radial") {
    const inner = Math.max(0, field.innerRadiusPx);
    raw = clamp(1 - (Math.hypot(point.x - field.center.x, point.y - field.center.y) - inner) / Math.max(EPS, Math.max(inner + EPS, field.outerRadiusPx) - inner), 0, 1);
  } else {
    const scale = Math.max(EPS, field.scalePx);
    raw = clamp((sampleDeterministicNoise2D((point.x + (field.offset?.x ?? 0)) / scale, (point.y + (field.offset?.y ?? 0)) / scale, field.seed) - 0.5) * (field.contrast ?? 1) + 0.5, 0, 1);
  }
  return clamp(applyFalloffEasing(field.invert ? 1 - raw : raw, field.easing ?? "smoothstep") * (field.weight ?? 1), 0, 1);
}

/** Cavalry식 다중 공간 감쇠장을 점 좌표에서 평가해 [0, 1] 강도를 반환한다. */
export function evaluateFalloffStrength(point: BlendVec2, fields: readonly FalloffField[] | undefined, combineMode: FalloffCombineMode = "max"): number {
  if (!fields || fields.length === 0) return 0;
  let acc = evaluateSingleFalloff(point, fields[0]!);
  for (let i = 1; i < fields.length; i += 1) {
    const next = evaluateSingleFalloff(point, fields[i]!);
    acc = combineMode === "add" ? clamp(acc + next, 0, 1) : combineMode === "multiply" ? clamp(acc * next, 0, 1) : combineMode === "min" ? Math.min(acc, next) : Math.max(acc, next);
  }
  return acc;
}

interface RawPlacementSlot { readonly position: BlendVec2; readonly normal: BlendVec2; readonly angleRad: number; readonly t: number }

function buildDistributionSlots(dist: DuplicatorDistribution): { slots: RawPlacementSlot[]; totalArcLengthPx: number } {
  const slots: RawPlacementSlot[] = [];
  if (dist.kind === "linear") {
    const count = clamp(Math.floor(dist.count), 0, 1024);
    const rad = (dist.angleDeg ?? 0) * DEG_TO_RAD;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const origin = dist.origin ?? { x: 0, y: 0 };
    const startOff = dist.centered ? -((count - 1) * dist.spacingPx) / 2 : 0;
    for (let i = 0; i < count; i += 1) {
      const d = startOff + i * dist.spacingPx;
      slots.push({ position: { x: origin.x + dx * d, y: origin.y + dy * d }, normal: { x: -dy, y: dx }, angleRad: rad, t: count > 1 ? i / (count - 1) : 0 });
    }
    return { slots, totalArcLengthPx: Math.max(0, count - 1) * Math.abs(dist.spacingPx) };
  }
  if (dist.kind === "grid") {
    const cols = clamp(Math.floor(dist.columns), 0, 128);
    const rows = clamp(Math.floor(dist.rows), 0, 128);
    const total = cols * rows;
    const origin = dist.origin ?? { x: 0, y: 0 };
    const ox = dist.centered ? -((cols - 1) * dist.spacingX) / 2 : 0;
    const oy = dist.centered ? -((rows - 1) * dist.spacingY) / 2 : 0;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        slots.push({ position: { x: origin.x + ox + c * dist.spacingX, y: origin.y + oy + r * dist.spacingY }, normal: { x: 0, y: -1 }, angleRad: 0, t: total > 1 ? (r * cols + c) / (total - 1) : 0 });
      }
    }
    return { slots, totalArcLengthPx: 0 };
  }
  if (dist.kind === "radial") {
    const count = clamp(Math.floor(dist.count), 0, 1024);
    const center = dist.center ?? { x: 0, y: 0 };
    const startRad = (dist.startAngleDeg ?? 0) * DEG_TO_RAD;
    const sweepRad = (dist.sweepDeg ?? 360) * DEG_TO_RAD;
    const denom = Math.abs(dist.sweepDeg ?? 360) >= 359.999 ? Math.max(1, count) : Math.max(1, count - 1);
    for (let i = 0; i < count; i += 1) {
      const ang = startRad + (sweepRad * i) / denom;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      slots.push({ position: { x: center.x + cos * dist.radiusPx, y: center.y + sin * dist.radiusPx }, normal: { x: cos, y: sin }, angleRad: dist.alignOutward ? ang : 0, t: count > 1 ? i / (count - 1) : 0 });
    }
    return { slots, totalArcLengthPx: Math.abs(sweepRad * dist.radiusPx) };
  }
  const flat = flattenSpineToPolyline(dist.spine);
  const lut = buildArcLengthLut(flat.points, flat.closed);
  const startU = clamp(dist.startOffset01 ?? 0, 0, 1);
  const endU = clamp(dist.endOffset01 ?? 1, startU, 1);
  const count = dist.spacing.mode === "count" ? clamp(Math.floor(dist.spacing.count), 0, 1024) : clamp(Math.floor(((endU - startU) * lut.totalLength) / Math.max(1, dist.spacing.distancePx)) + 1, 0, dist.spacing.maxCount ?? 512);
  const nOff = dist.normalOffsetPx ?? 0;
  for (let i = 0; i < count; i += 1) {
    const localT = count > 1 ? i / (count - 1) : 0;
    const s = sampleLutAtDistance(lut, lerp(startU, endU, localT) * lut.totalLength);
    slots.push({ position: { x: s.point.x + s.normal.x * nOff, y: s.point.y + s.normal.y * nOff }, normal: s.normal, angleRad: dist.alignToTangent ? s.angleRad : 0, t: localT });
  }
  return { slots, totalArcLengthPx: lut.totalLength };
}

function pickSymbolForIndex(symbols: readonly DuplicatorSymbolRef[], index: number, order: "sequential" | "ping-pong" | "seeded", seed: number): DuplicatorSymbolRef {
  const n = symbols.length;
  if (n === 1) return symbols[0]!;
  if (order === "seeded") return symbols[clamp(Math.floor(hashDeterministicFloat(seed, index, 91) * n), 0, n - 1)]!;
  if (order === "ping-pong") {
    const cycle = 2 * n - 2;
    const pos = index % cycle;
    return symbols[pos < n ? pos : cycle - pos]!;
  }
  return symbols[index % n]!;
}

/** 모드 B: Pattern Along Path & Falloff Field Duplicator 비파괴 평가기. */
export function evaluatePatternDuplicator(config: PatternDuplicatorConfig): PatternDuplicatorEvaluation {
  if (config.symbols.length === 0) {
    return { kind: "pattern-duplicator", id: config.id, instanceCount: 0, totalArcLengthPx: 0, instances: [], fingerprint: computeFingerprint([config.id, 0]) };
  }
  const { slots, totalArcLengthPx } = buildDistributionSlots(config.distribution);
  const repMod = config.repModulator;
  const response = config.falloffResponse;
  const jitter = config.jitter;
  const order = config.symbolOrder ?? "sequential";
  const seed = jitter?.seed ?? 1337;
  const hueMode = config.hueMode ?? "shortest";

  const instances: EvaluatedDuplicatorInstance[] = slots.map((slot, i) => {
    const symbol = pickSymbolForIndex(config.symbols, i, order, seed);
    const falloff = evaluateFalloffStrength(slot.position, config.falloffFields, config.falloffCombineMode ?? "max");
    const waveOff = repMod?.normalWaveAmpPx && repMod.normalWaveFreq ? Math.sin(slot.t * Math.PI * 2 * repMod.normalWaveFreq) * repMod.normalWaveAmpPx : 0;
    const jx = jitter?.positionPx ? (hashDeterministicFloat(seed, i, 1) * 2 - 1) * jitter.positionPx : 0;
    const jy = jitter?.positionPx ? (hashDeterministicFloat(seed, i, 2) * 2 - 1) * jitter.positionPx : 0;
    const posX = slot.position.x + slot.normal.x * waveOff + (response?.translateXDeltaPx ?? 0) * falloff + jx;
    const posY = slot.position.y + slot.normal.y * waveOff + (response?.translateYDeltaPx ?? 0) * falloff + jy;
    const scaleWave = repMod?.scaleWaveAmp && repMod.scaleWaveFreq ? Math.sin(slot.t * Math.PI * 2 * repMod.scaleWaveFreq) * repMod.scaleWaveAmp : 0;
    const scaleJitter = jitter?.scaleRatio ? (hashDeterministicFloat(seed, i, 3) * 2 - 1) * jitter.scaleRatio : 0;
    const scale = Math.max(0.05, lerp(repMod?.scaleStart ?? 1, repMod?.scaleEnd ?? 1, slot.t) + scaleWave + (response?.scaleDelta ?? 0) * falloff + scaleJitter);
    const scaleY = repMod?.alternateFlipY && i % 2 === 1 ? -scale : scale;
    const rotJitterRad = jitter?.rotationDeg ? (hashDeterministicFloat(seed, i, 4) * 2 - 1) * jitter.rotationDeg * DEG_TO_RAD : 0;
    const rotationRad = slot.angleRad + (repMod?.rotationStepDeg ?? 0) * i * DEG_TO_RAD + (response?.rotationDeltaDeg ?? 0) * falloff * DEG_TO_RAD + rotJitterRad;
    const opacity = clamp(lerp(repMod?.opacityStart ?? 1, repMod?.opacityEnd ?? 1, slot.t) + (response?.opacityDelta ?? 0) * falloff, 0, 1);
    const fill = symbol.baseFill && response?.tintTarget && falloff > EPS ? interpolateOklchRgba(symbol.baseFill, response.tintTarget, falloff, hueMode) : symbol.baseFill;
    const matrix = composeTransform2D(posX, posY, rotationRad, scale, scaleY);
    return {
      index: i, rep: i, t: slot.t, symbolId: symbol.symbolId, position: { x: posX, y: posY }, rotationRad, scaleX: scale, scaleY,
      opacity, fill, stroke: symbol.baseStroke, strokeWidthPx: symbol.strokeWidthPx ?? 1, falloffWeight: falloff, matrix,
      worldPoints: symbol.localPoints.map((pt) => applyTransform2D(pt, matrix)), closed: symbol.closed,
    };
  });

  return {
    kind: "pattern-duplicator", id: config.id, instanceCount: instances.length, totalArcLengthPx, instances,
    fingerprint: computeFingerprint([config.id, config.distribution.kind, instances.length, Math.round(totalArcLengthPx * 100), order, seed]),
  };
}

/** 비파괴 블렌드·복제 결과를 개별 편집 가능한 벡터 레이어 항목 배열로 전개한다(Expand). */
export function expandBlendOrDuplicatorToEditableItems(evaluation: BlendSpineEvaluation | PatternDuplicatorEvaluation): EditableExpandedVectorItem[] {
  if (evaluation.kind === "blend-morph") {
    return evaluation.steps.map((s) => ({
      id: `${evaluation.id}:step:${s.index}`, sourceNodeId: evaluation.id, sourceIndex: s.index,
      points: s.points, closed: s.closed, fill: s.fill, stroke: s.stroke, strokeWidthPx: s.strokeWidthPx, opacity: s.opacity, matrix: s.matrix,
    }));
  }
  return evaluation.instances.map((inst) => ({
    id: `${evaluation.id}:inst:${inst.index}:${inst.symbolId}`, sourceNodeId: evaluation.id, sourceIndex: inst.index, symbolId: inst.symbolId,
    points: inst.worldPoints, closed: inst.closed, fill: inst.fill, stroke: inst.stroke, strokeWidthPx: inst.strokeWidthPx, opacity: inst.opacity, matrix: inst.matrix,
  }));
}
