/**
 * Wave-53: 선화 스타일 동화기 (`lineart-style-harmonizer`).
 *
 * 어시스턴트 선화나 3D 배경 추출선처럼 지나치게 균일하고 기계적인 스트로크를
 * 추출된 작가의 `InkDnaProfile`에 맞춰 유기적 선폭 변조, 끝단 테이퍼 동화,
 * 결정론적 시드 기반 미세 필치 흔들림, 3D 과밀 선화 정리까지 일괄 수행한다.
 */

import {
  computeStyleFeatureDistance,
  measureVectorStrokeMetrics,
  type InkDnaProfile,
  type InkStyleFeatureVector,
  type ReferenceVectorStroke,
  type VectorStrokePoint,
} from "./ink-dna-spectral-extractor";

export const DEFAULT_HARMONIZE_SEED = 53_202_611;
export const DEFAULT_RESAMPLE_STEP_PX = 3.0;
export const DEFAULT_MIN_3D_SEGMENT_LENGTH_PX = 6.0;
export const DEFAULT_CROWDING_RADIUS_PX = 4.5;
export const DEFAULT_CROWDING_ANGLE_RAD = 0.22;

export interface LineartHarmonizeOptions {
  /** 동화 강도 [0..1] (0=원본 유지, 1=작가 DNA에 완전 수렴, 기본 0.85) */
  readonly strength?: number;
  /** 결정론적 필치 흔들림 시드 */
  readonly seed?: number;
  /** 성긴 3D 직선을 유기적으로 세분화할 호길이 간격 (px, 기본 3.0) */
  readonly resampleStepPx?: number;
  /** 3D 추출선 과밀 정리 활성화 여부 (기본: 3d-extracted 존재 시 자동 활성) */
  readonly enable3dDeclutter?: boolean;
  /** 3D 파편선 최소 보존 길이 (px, 기본 6.0) */
  readonly min3dSegmentLengthPx?: number;
  /** 3D 중복 평행선 솎아내기 근접 반경 (px, 기본 4.5) */
  readonly crowdingRadiusPx?: number;
  /** 3D 중복 평행선 판정 최대 방향각 차 (라디안, 기본 0.22) */
  readonly crowdingAngleRad?: number;
}

export interface HarmonizedVectorStroke extends ReferenceVectorStroke {
  readonly originalPointCount: number;
  readonly microBleedRadiusPx: number;
  readonly harmonizedFromSource: "hand-drawn" | "assistant" | "3d-extracted";
}

export interface LineartHarmonizeReport {
  readonly strokes: readonly HarmonizedVectorStroke[];
  readonly beforeFeatures: InkStyleFeatureVector;
  readonly afterFeatures: InkStyleFeatureVector;
  readonly styleDistanceBefore: number;
  readonly styleDistanceAfter: number;
  /** 거리 감소 비율 (양수일수록 작가 필치에 가까워짐) */
  readonly distanceReductionRatio: number;
  readonly droppedMicroFragmentCount: number;
  readonly culledCrowdedStrokeCount: number;
  readonly resampledStrokeCount: number;
  readonly appliedStrength: number;
  readonly seed: number;
}

interface StrokeSummary {
  readonly stroke: ReferenceVectorStroke;
  readonly index: number;
  readonly lengthPx: number;
  readonly midX: number;
  readonly midY: number;
  readonly angleRad: number;
}

function clamp01(v: number): number {
  return !Number.isFinite(v) || v <= 0 ? 0 : v >= 1 ? 1 : v;
}

function clampRange(v: number, min: number, max: number): number {
  return !Number.isFinite(v) || v < min ? min : v > max ? max : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hash1dSigned(index: number, seed: number): number {
  let h = (Math.imul(index | 0, 374_761_393) ^ Math.imul(seed | 0, 668_265_263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  h ^= h >>> 16;
  return (h >>> 0) / 0x7fffffff - 1;
}

function quinticFade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** 연속 1D Value 노이즈 (2옥타브 fBm, [-1, 1]). */
function sampleValueNoise1d(coord: number, seed: number): number {
  const i0 = Math.floor(coord);
  const n0 = lerp(hash1dSigned(i0, seed), hash1dSigned(i0 + 1, seed), quinticFade(coord - i0));
  const c2 = coord * 2.13 + 17.3;
  const j0 = Math.floor(c2);
  const n1 = lerp(hash1dSigned(j0, seed ^ 0x517cc1b7), hash1dSigned(j0 + 1, seed ^ 0x517cc1b7), quinticFade(c2 - j0));
  return clampRange(n0 * 0.68 + n1 * 0.32, -1, 1);
}

function hashStrokeSeed(baseSeed: number, strokeId: string, strokeIndex: number): number {
  let h = (baseSeed ^ Math.imul(strokeIndex + 1, 0x9e3779b1)) | 0;
  for (let i = 0; i < strokeId.length; i += 1) h = Math.imul(h ^ strokeId.charCodeAt(i), 0x85ebca6b);
  return h ^ (h >>> 15);
}

function computeStrokeLength(points: readonly VectorStrokePoint[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev && curr) len += Math.hypot(curr.x - prev.x, curr.y - prev.y);
  }
  return len;
}

function summarizeStroke(stroke: ReferenceVectorStroke, index: number): StrokeSummary {
  const pts = stroke.points;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const mid = pts[Math.floor(pts.length / 2)] ?? first;
  let angle = Math.atan2((last?.y ?? 0) - (first?.y ?? 0), (last?.x ?? 0) - (first?.x ?? 0)) % Math.PI;
  if (angle < 0) angle += Math.PI;
  return {
    stroke,
    index,
    lengthPx: computeStrokeLength(pts),
    midX: ((first?.x ?? 0) + (last?.x ?? 0) + (mid?.x ?? 0)) / 3,
    midY: ((first?.y ?? 0) + (last?.y ?? 0) + (mid?.y ?? 0)) / 3,
    angleRad: angle,
  };
}

function angleDiffModPi(a: number, b: number): number {
  const diff = Math.abs(a - b) % Math.PI;
  return diff > Math.PI / 2 ? Math.PI - diff : diff;
}

/** 3D 배경 추출선에서 미세 파편선과 근접 평행 중복선을 결정론적으로 정리한다. */
function declutter3dExtractedStrokes(
  strokes: readonly ReferenceVectorStroke[],
  minSegmentLengthPx: number,
  crowdingRadiusPx: number,
  crowdingAngleRad: number,
): { readonly kept: readonly ReferenceVectorStroke[]; readonly droppedMicroFragmentCount: number; readonly culledCrowdedStrokeCount: number } {
  const non3d: StrokeSummary[] = [];
  const extracted3d: StrokeSummary[] = [];
  for (let idx = 0; idx < strokes.length; idx += 1) {
    const s = strokes[idx];
    if (!s) continue;
    const summary = summarizeStroke(s, idx);
    if (s.sourceKind === "3d-extracted") extracted3d.push(summary);
    else non3d.push(summary);
  }

  let droppedMicroFragmentCount = 0;
  const long3d: StrokeSummary[] = [];
  for (const item of extracted3d) {
    if (item.stroke.points.length < 2 || item.lengthPx < minSegmentLengthPx) droppedMicroFragmentCount += 1;
    else long3d.push(item);
  }

  // 긴 구조선을 우선 보존하고 근접 평행 중복선만 솎아낸다.
  long3d.sort((a, b) => (b.lengthPx !== a.lengthPx ? b.lengthPx - a.lengthPx : a.index - b.index));
  const surviving3d: StrokeSummary[] = [];
  let culledCrowdedStrokeCount = 0;
  for (const cand of long3d) {
    const crowded = surviving3d.some(
      (k) => Math.hypot(cand.midX - k.midX, cand.midY - k.midY) <= crowdingRadiusPx && angleDiffModPi(cand.angleRad, k.angleRad) <= crowdingAngleRad,
    );
    if (crowded) culledCrowdedStrokeCount += 1;
    else surviving3d.push(cand);
  }

  const kept = [...non3d, ...surviving3d].sort((a, b) => a.index - b.index).map((item) => item.stroke);
  return { kept, droppedMicroFragmentCount, culledCrowdedStrokeCount };
}

/** 성긴 3D 직선이나 불균일 스트로크를 균일 호길이 간격으로 세분화한다. */
function resampleStrokeByArcLength(points: readonly VectorStrokePoint[], stepPx: number): VectorStrokePoint[] {
  if (points.length < 2) return [...points];
  const cumLen = new Float64Array(points.length);
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    cumLen[i] = (cumLen[i - 1] ?? 0) + Math.hypot((curr?.x ?? 0) - (prev?.x ?? 0), (curr?.y ?? 0) - (prev?.y ?? 0));
  }
  const totalLen = cumLen[points.length - 1] ?? 0;
  if (totalLen < 1e-4) return [...points];

  const desired = Math.max(9, Math.min(256, Math.ceil(totalLen / Math.max(0.8, stepPx)) + 1));
  const result: VectorStrokePoint[] = [];
  let seg = 0;
  for (let k = 0; k < desired; k += 1) {
    const targetDist = (k / (desired - 1)) * totalLen;
    while (seg + 1 < points.length - 1 && (cumLen[seg + 1] ?? 0) < targetDist) seg += 1;
    const d0 = cumLen[seg] ?? 0;
    const d1 = cumLen[seg + 1] ?? d0;
    const t = d1 > d0 ? clamp01((targetDist - d0) / (d1 - d0)) : 0;
    const p0 = points[seg];
    const p1 = points[seg + 1] ?? p0;
    if (!p0 || !p1) continue;
    result.push({
      x: lerp(p0.x, p1.x, t),
      y: lerp(p0.y, p1.y, t),
      pressure: lerp(p0.pressure, p1.pressure, t),
      widthPx: lerp(p0.widthPx, p1.widthPx, t),
      opacity: lerp(p0.opacity ?? 1, p1.opacity ?? 1, t),
    });
  }
  return result;
}

function harmonizeSingleStroke(
  stroke: ReferenceVectorStroke,
  strokeIndex: number,
  target: InkStyleFeatureVector,
  strength: number,
  seed: number,
  resampleStepPx: number,
): { readonly stroke: HarmonizedVectorStroke; readonly resampled: boolean } {
  const sourceKind = stroke.sourceKind ?? "assistant";
  const originalPointCount = stroke.points.length;
  if (originalPointCount < 2 || strength <= 0) {
    return {
      stroke: {
        ...stroke,
        points: stroke.points.map((p) => ({ ...p })),
        originalPointCount,
        microBleedRadiusPx: stroke.microBleedRadiusPx ?? 0,
        harmonizedFromSource: sourceKind,
      },
      resampled: false,
    };
  }

  const pts = resampleStrokeByArcLength(stroke.points, resampleStepPx);
  const strokeSeed = hashStrokeSeed(seed, stroke.id, strokeIndex);
  const count = pts.length;
  const cumLen = new Float64Array(count);
  for (let i = 1; i < count; i += 1) {
    const prev = pts[i - 1];
    const curr = pts[i];
    cumLen[i] = (cumLen[i - 1] ?? 0) + Math.hypot((curr?.x ?? 0) - (prev?.x ?? 0), (curr?.y ?? 0) - (prev?.y ?? 0));
  }
  const totalLen = Math.max(1e-4, cumLen[count - 1] ?? 1);
  const stepAvg = totalLen / Math.max(1, count - 1);

  // 양 끝 25% 구간 테이퍼 평균(1/(gamma+1))을 역보정해 전체 선폭 평균이 목표 DNA에 맞도록 조정한다.
  const taperMeanFactor = 0.5 + 0.5 / (Math.max(0.1, target.pressureTaperGamma) + 1);
  const targetBodyW = Math.max(0.4, target.strokeWidthMeanPx / Math.max(0.35, taperMeanFactor));
  const bodyNoiseAmp = Math.sqrt(Math.max(0, target.strokeWidthVariancePx2)) * 0.85;
  const lateralJitterAmp = clampRange(target.edgeRoughnessIndex * stepAvg * 0.22, 0, stepAvg * 0.34);
  const widthChatterAmp = targetBodyW * clampRange(target.edgeRoughnessIndex * 0.14, 0, 0.22);

  const outPoints: VectorStrokePoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const curr = pts[i];
    if (!curr) continue;
    const prev = pts[Math.max(0, i - 1)] ?? curr;
    const next = pts[Math.min(count - 1, i + 1)] ?? curr;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tMag = Math.hypot(tx, ty);
    const nx = tMag > 1e-5 ? -ty / tMag : 0;
    const ny = tMag > 1e-5 ? tx / tMag : 1;

    const u = (cumLen[i] ?? 0) / totalLen;
    const dEnd = Math.min(u, 1 - u);
    const isInterior = i > 0 && i < count - 1;
    const taperEnv = dEnd < 0.25 ? Math.pow(clampRange(dEnd / 0.25, 0.05, 1), target.pressureTaperGamma) : 1;

    const d0x = curr.x - prev.x;
    const d0y = curr.y - prev.y;
    const d1x = next.x - curr.x;
    const d1y = next.y - curr.y;
    const curvatureBoost =
      isInterior && Math.hypot(d0x, d0y) > 1e-4 && Math.hypot(d1x, d1y) > 1e-4
        ? clamp01(Math.abs(Math.atan2(d0x * d1y - d0y * d1x, d0x * d1x + d0y * d1y)) / 0.8) * 0.12
        : 0;

    const lowNoise = sampleValueNoise1d(u * 4.5 + strokeIndex * 1.7, strokeSeed);
    const highNoise = sampleValueNoise1d(i * 0.92, strokeSeed ^ 0x2c1b3c6d);
    const chatter = ((i & 1) === 0 ? 1 : -1) * (0.45 + 0.55 * Math.abs(highNoise));

    const bodyW = Math.max(0.25, targetBodyW * (1 + curvatureBoost) + lowNoise * bodyNoiseAmp + chatter * widthChatterAmp * 0.35);
    const finalWidthPx = lerp(curr.widthPx, Math.max(0.2, bodyW * taperEnv), strength);
    const endFade = isInterior ? clamp01(Math.min(i, count - 1 - i) / 2) : 0;
    const lateralOffset = (highNoise * 0.55 + chatter * 0.45) * lateralJitterAmp * endFade * strength;
    const baseOpacity = clampRange(
      target.inkDensityFloor + (1 - target.inkDensityFloor) * clamp01(0.5 + 0.5 * lowNoise + 0.25 * highNoise),
      0.1,
      1,
    );

    outPoints.push({
      x: curr.x + nx * lateralOffset,
      y: curr.y + ny * lateralOffset,
      pressure: clamp01(lerp(curr.pressure, clamp01(finalWidthPx / Math.max(0.5, targetBodyW * 1.25)), strength)),
      widthPx: finalWidthPx,
      opacity: lerp(curr.opacity ?? 1, baseOpacity, strength),
    });
  }

  return {
    stroke: {
      id: stroke.id,
      sourceKind: stroke.sourceKind,
      points: outPoints,
      originalPointCount,
      microBleedRadiusPx: lerp(stroke.microBleedRadiusPx ?? 0, target.microBleedRadiusPx, strength),
      harmonizedFromSource: sourceKind,
    },
    resampled: count !== originalPointCount,
  };
}

/** 어시스턴트·3D 추출 선화를 작가의 `InkDnaProfile` 필치로 동화하고 스타일 거리 축소 리포트를 반환한다. */
export function harmonizeLineartToInkDna(
  strokes: readonly ReferenceVectorStroke[],
  targetDna: InkDnaProfile,
  options: LineartHarmonizeOptions = {},
): LineartHarmonizeReport {
  const strength = clamp01(options.strength ?? 0.85);
  const seed = Math.trunc(options.seed ?? DEFAULT_HARMONIZE_SEED);
  const resampleStepPx = clampRange(options.resampleStepPx ?? DEFAULT_RESAMPLE_STEP_PX, 1.0, 24.0);
  const enable3dDeclutter = options.enable3dDeclutter ?? strokes.some((s) => s.sourceKind === "3d-extracted");

  const beforeFeatures = measureVectorStrokeMetrics(strokes);
  const styleDistanceBefore = computeStyleFeatureDistance(beforeFeatures, targetDna);

  let working = strokes;
  let droppedMicroFragmentCount = 0;
  let culledCrowdedStrokeCount = 0;
  if (enable3dDeclutter && strength > 0) {
    const decluttered = declutter3dExtractedStrokes(
      strokes,
      Math.max(0.5, options.min3dSegmentLengthPx ?? DEFAULT_MIN_3D_SEGMENT_LENGTH_PX),
      Math.max(0.5, options.crowdingRadiusPx ?? DEFAULT_CROWDING_RADIUS_PX),
      clampRange(options.crowdingAngleRad ?? DEFAULT_CROWDING_ANGLE_RAD, 0.02, Math.PI / 2),
    );
    working = decluttered.kept;
    droppedMicroFragmentCount = decluttered.droppedMicroFragmentCount;
    culledCrowdedStrokeCount = decluttered.culledCrowdedStrokeCount;
  }

  const targetFeatures: InkStyleFeatureVector = {
    strokeWidthMeanPx: lerp(beforeFeatures.strokeWidthMeanPx, targetDna.strokeWidthMeanPx, strength),
    strokeWidthVariancePx2: lerp(Math.sqrt(Math.max(0, beforeFeatures.strokeWidthVariancePx2)), Math.sqrt(Math.max(0, targetDna.strokeWidthVariancePx2)), strength) ** 2,
    edgeRoughnessIndex: lerp(beforeFeatures.edgeRoughnessIndex, targetDna.edgeRoughnessIndex, strength),
    pressureTaperGamma: lerp(beforeFeatures.pressureTaperGamma, targetDna.pressureTaperGamma, strength),
    inkDensityFloor: lerp(beforeFeatures.inkDensityFloor, targetDna.inkDensityFloor, strength),
    microBleedRadiusPx: lerp(beforeFeatures.microBleedRadiusPx, targetDna.microBleedRadiusPx, strength),
  };

  let resampledStrokeCount = 0;
  const harmonizedStrokes: HarmonizedVectorStroke[] = [];
  for (let i = 0; i < working.length; i += 1) {
    const stroke = working[i];
    if (!stroke) continue;
    const { stroke: out, resampled } = harmonizeSingleStroke(stroke, i, targetFeatures, strength, seed, resampleStepPx);
    if (resampled) resampledStrokeCount += 1;
    harmonizedStrokes.push(out);
  }

  const afterFeatures = measureVectorStrokeMetrics(harmonizedStrokes);
  const styleDistanceAfter = computeStyleFeatureDistance(afterFeatures, targetDna);
  return {
    strokes: harmonizedStrokes,
    beforeFeatures,
    afterFeatures,
    styleDistanceBefore,
    styleDistanceAfter,
    distanceReductionRatio: styleDistanceBefore > 1e-6 ? (styleDistanceBefore - styleDistanceAfter) / styleDistanceBefore : 0,
    droppedMicroFragmentCount,
    culledCrowdedStrokeCount,
    resampledStrokeCount,
    appliedStrength: strength,
    seed,
  };
}
