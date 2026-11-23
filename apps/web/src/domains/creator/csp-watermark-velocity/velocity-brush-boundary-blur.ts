/**
 * Clip Studio Paint Ver. 4.0~5.0 호환 속도 기반 브러시 곡선·예측 선행(Predictive Stroke Lookahead),
 * 선택 경계 색번짐 0% 차단 가우시안 블러, 일별 작업시간 분석 및 숨김/빈 레이어 일괄 정리 엔진.
 */

export type VelocityBrushPresetId = "ink-snap" | "calligraphy-whip" | "airbrush-glide" | "manga-speedline";

/** 2D 3차 베지어 곡선: P0=(0, y0), P1=(cx1, cy1), P2=(cx2, cy2), P3=(1, y3). */
export interface VelocityCubicBezierCurve {
  readonly y0: number; readonly cx1: number; readonly cy1: number;
  readonly cx2: number; readonly cy2: number; readonly y3: number;
}

export interface VelocityBrushProfile {
  readonly id: VelocityBrushPresetId | string;
  readonly labelKo: string; readonly labelEn: string;
  readonly descriptionKo: string; readonly descriptionEn: string;
  readonly maxVelocityPxPerMs: number;
  readonly sizeCurve: VelocityCubicBezierCurve;
  readonly opacityCurve: VelocityCubicBezierCurve;
  readonly lookaheadMs: number; readonly maxLookaheadPx: number;
}

export interface StrokeLookaheadContext {
  readonly currentX?: number; readonly currentY?: number;
  readonly directionAngleRad?: number; readonly accelerationPxPerMs2?: number;
}

export interface VelocityBrushDynamicsResult {
  readonly profileId: string;
  readonly clampedVelocityPxPerMs: number; readonly normalizedVelocity: number;
  readonly sizeMultiplier: number; readonly opacityMultiplier: number;
  readonly lookaheadDistancePx: number;
  readonly lookaheadOffsetX: number; readonly lookaheadOffsetY: number;
  readonly predictedX: number; readonly predictedY: number;
}

export interface VelocityCurveSamplePoint {
  readonly velocityPxPerMs: number; readonly normalizedVelocity: number;
  readonly sizeMultiplier: number; readonly opacityMultiplier: number;
}

export interface SelectionSafeBlurResult {
  readonly rgba: Uint8ClampedArray;
  readonly width: number; readonly height: number; readonly radiusPx: number;
  readonly kernelMode: "exact-2d-masked" | "separable-masked" | "passthrough";
  readonly selectedPixelCount: number; readonly untouchedOutsidePixelCount: number;
  /** 선택 경계 외부 픽셀 참조 횟수 (수학적으로 항상 0) */
  readonly externalPixelsRead: 0;
  readonly elapsedMs: number;
}

export interface BoundaryBleedAudit {
  readonly maxGreenIncreaseInside: number; readonly meanGreenIncreaseInside: number;
  readonly bledInsidePixelCount: number; readonly totalInsidePixelCount: number;
  readonly bleedRatioPercent: number; readonly outsideMaxDelta: number;
  readonly zeroExternalBleed: boolean;
}

export interface DemoBoundaryBlurFixture {
  readonly width: number; readonly height: number;
  readonly rgba: Uint8ClampedArray; readonly selectionMask: Uint8Array;
}

export interface BoundaryBlurComparison {
  readonly safeResult: SelectionSafeBlurResult;
  readonly safeAudit: BoundaryBleedAudit;
  readonly standardAudit: BoundaryBleedAudit;
}

export type WorkSessionStage = "storyboard" | "lineart" | "color" | "finishing" | "export";

export interface WorkTimeSession {
  readonly id: string; readonly startedAtIso: string;
  readonly durationMinutes: number; readonly idleMinutes?: number;
  readonly projectName?: string; readonly stage?: WorkSessionStage; readonly hourOfDay?: number;
}

export interface DailyWorkBucket {
  readonly date: string; readonly totalMinutes: number; readonly totalHours: number;
  readonly idleMinutes: number; readonly sessionCount: number;
  readonly focusRatio: number; readonly dominantStage: WorkSessionStage | null;
}

export interface PeakFocusHourSummary {
  readonly hour: number; readonly label: string; readonly totalMinutes: number;
}

export interface DailyWorkHoursSummary {
  readonly days: readonly DailyWorkBucket[];
  readonly totalMinutes: number; readonly totalHours: number;
  readonly averageDailyMinutes: number; readonly activeDaysCount: number;
  readonly peakDay: DailyWorkBucket | null;
  readonly peakFocusHour: PeakFocusHourSummary | null;
  readonly hourlyDistribution: readonly number[];
}

export type CleanupLayerKind = "raster" | "vector" | "text" | "folder" | "redline" | "draft-markup" | "reference";
export type LayerCleanupRemovalReason = "hidden" | "empty" | "hidden-and-empty";
export type LayerCleanupProtectionReason = "locked" | "non-export-redline";

export interface CleanupCandidateLayer {
  readonly id: string; readonly name: string; readonly nameEn?: string;
  readonly visible: boolean; readonly locked: boolean; readonly isEmpty: boolean;
  readonly nonTransparentPixelCount?: number; readonly kind?: CleanupLayerKind;
  readonly isNonExportRedline?: boolean;
  readonly widthPx: number; readonly heightPx: number;
  readonly bytesPerPixel?: number; readonly estimatedMemoryBytes?: number;
}

export interface PlannedRemovableLayer {
  readonly id: string; readonly name: string; readonly nameEn?: string;
  readonly reason: LayerCleanupRemovalReason;
  readonly memoryBytes: number; readonly memoryMiB: number;
}

export interface PlannedProtectedLayer {
  readonly id: string; readonly name: string; readonly nameEn?: string;
  readonly primaryReason: LayerCleanupProtectionReason;
  readonly protectionReasons: readonly LayerCleanupProtectionReason[];
  readonly wouldHaveMatchedCleanup: boolean;
  readonly memoryBytes: number; readonly memoryMiB: number;
}

export interface HiddenLayerCleanupPlan {
  readonly removableLayers: readonly PlannedRemovableLayer[];
  readonly removableLayerIds: readonly string[];
  readonly protectedLayers: readonly PlannedProtectedLayer[];
  readonly keptActiveLayers: readonly CleanupCandidateLayer[];
  readonly totalLayerCount: number; readonly removableCount: number;
  readonly protectedCount: number; readonly protectedLockedCount: number;
  readonly protectedRedlineCount: number; readonly keptActiveCount: number;
  readonly estimatedSavingsBytes: number; readonly estimatedSavingsMiB: number;
}

const DEFAULT_MAX_VELOCITY = 4.0;
const BYTES_PER_MIB = 1024 * 1024;
const EMPTY_LAYER_SPARSE_CAP_BYTES = 256 * 256 * 4;

export const VELOCITY_BRUSH_PRESETS: Readonly<Record<VelocityBrushPresetId, VelocityBrushProfile>> = {
  "ink-snap": {
    id: "ink-snap", labelKo: "잉크 스냅 G펜", labelEn: "Ink Snap G-Pen",
    descriptionKo: "빠르게 그을수록 펜끝이 예리하게 가늘어지고 잉크 농도는 유지됩니다.",
    descriptionEn: "Tapers cleanly on fast flicks while preserving crisp ink density.",
    maxVelocityPxPerMs: DEFAULT_MAX_VELOCITY,
    sizeCurve: { y0: 1.0, cx1: 0.25, cy1: 0.96, cx2: 0.65, cy2: 0.34, y3: 0.22 },
    opacityCurve: { y0: 1.0, cx1: 0.3, cy1: 0.99, cx2: 0.75, cy2: 0.9, y3: 0.82 },
    lookaheadMs: 10, maxLookaheadPx: 18,
  },
  "calligraphy-whip": {
    id: "calligraphy-whip", labelKo: "캘리그래피 붓", labelEn: "Calligraphy Whip",
    descriptionKo: "느린 획은 먹물 번짐처럼 두껍고, 빠른 채찍 획은 갈필처럼 가늘고 옅어집니다.",
    descriptionEn: "Rich wet width when slow, dramatic dry-brush taper and fade when whipped.",
    maxVelocityPxPerMs: DEFAULT_MAX_VELOCITY,
    sizeCurve: { y0: 1.15, cx1: 0.2, cy1: 1.05, cx2: 0.55, cy2: 0.26, y3: 0.14 },
    opacityCurve: { y0: 1.0, cx1: 0.28, cy1: 0.94, cx2: 0.68, cy2: 0.54, y3: 0.42 },
    lookaheadMs: 14, maxLookaheadPx: 24,
  },
  "airbrush-glide": {
    id: "airbrush-glide", labelKo: "에어브러시 글라이드", labelEn: "Airbrush Glide",
    descriptionKo: "빠르게 이동할수록 분사 범위는 넓어지고 농도는 옅어져 부드러운 그라데이션을 만듭니다.",
    descriptionEn: "Expands spray radius and softens opacity at higher velocities for smooth gradients.",
    maxVelocityPxPerMs: DEFAULT_MAX_VELOCITY,
    sizeCurve: { y0: 0.65, cx1: 0.3, cy1: 0.72, cx2: 0.7, cy2: 1.24, y3: 1.35 },
    opacityCurve: { y0: 0.9, cx1: 0.25, cy1: 0.82, cx2: 0.68, cy2: 0.38, y3: 0.28 },
    lookaheadMs: 8, maxLookaheadPx: 16,
  },
  "manga-speedline": {
    id: "manga-speedline", labelKo: "만화 집중선·스피드라인", labelEn: "Manga Speedline",
    descriptionKo: "초고속 집중선에서 바늘 끝처럼 급격히 가늘어지며 예측 선행이 펜 지연을 억제합니다.",
    descriptionEn: "Ultra-sharp needle taper with aggressive predictive lookahead for action speedlines.",
    maxVelocityPxPerMs: DEFAULT_MAX_VELOCITY,
    sizeCurve: { y0: 1.05, cx1: 0.18, cy1: 0.88, cx2: 0.5, cy2: 0.16, y3: 0.08 },
    opacityCurve: { y0: 1.0, cx1: 0.35, cy1: 0.98, cx2: 0.72, cy2: 0.8, y3: 0.72 },
    lookaheadMs: 16, maxLookaheadPx: 32,
  },
};

export const VELOCITY_BRUSH_PRESET_LIST: readonly VelocityBrushProfile[] = [
  VELOCITY_BRUSH_PRESETS["ink-snap"],
  VELOCITY_BRUSH_PRESETS["calligraphy-whip"],
  VELOCITY_BRUSH_PRESETS["airbrush-glide"],
  VELOCITY_BRUSH_PRESETS["manga-speedline"],
];

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function evalCubicBezierAxis(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const inv = 1 - t;
  return inv * inv * inv * p0 + 3 * inv * inv * t * p1 + 3 * inv * t * t * p2 + t * t * t * p3;
}

export function evaluateVelocityCubicBezier(u: number, curve: VelocityCubicBezierCurve): number {
  const targetX = clamp(u, 0, 1);
  if (targetX <= 0) return curve.y0;
  if (targetX >= 1) return curve.y3;
  const cx1 = clamp(curve.cx1, 0, 1);
  const cx2 = clamp(curve.cx2, 0, 1);
  let lo = 0;
  let hi = 1;
  for (let iter = 0; iter < 24; iter += 1) {
    const mid = (lo + hi) * 0.5;
    if (evalCubicBezierAxis(mid, 0, cx1, cx2, 1) < targetX) lo = mid;
    else hi = mid;
  }
  return evalCubicBezierAxis((lo + hi) * 0.5, curve.y0, curve.cy1, curve.cy2, curve.y3);
}

function resolveVelocityProfile(profile: VelocityBrushProfile | VelocityBrushPresetId): VelocityBrushProfile {
  return typeof profile === "string" ? VELOCITY_BRUSH_PRESETS[profile] : profile;
}

/** 스트로크 속도(0..4 px/ms)에 따른 3차 베지어 크기·불투명도 배율과 예측 선행 좌표를 계산한다. */
export function evaluateVelocityBrushDynamics(
  velocityPxPerMs: number,
  profile: VelocityBrushProfile | VelocityBrushPresetId,
  strokeContext: StrokeLookaheadContext = {},
): VelocityBrushDynamicsResult {
  const resolved = resolveVelocityProfile(profile);
  const maxV = Math.max(0.1, resolved.maxVelocityPxPerMs || DEFAULT_MAX_VELOCITY);
  const clampedV = clamp(velocityPxPerMs, 0, maxV);
  const u = clampedV / maxV;
  const sizeMultiplier = roundTo(clamp(evaluateVelocityCubicBezier(u, resolved.sizeCurve), 0.05, 2.5), 4);
  const opacityMultiplier = roundTo(clamp(evaluateVelocityCubicBezier(u, resolved.opacityCurve), 0.05, 1.0), 4);

  const smoothGate = u * u * (3 - 2 * u);
  const leadMs = Math.max(0, resolved.lookaheadMs) * smoothGate;
  const accel = Number.isFinite(strokeContext.accelerationPxPerMs2 ?? 0)
    ? clamp(strokeContext.accelerationPxPerMs2 ?? 0, -0.5, 0.5)
    : 0;
  const lookaheadDistancePx = roundTo(
    clamp(clampedV * leadMs + 0.5 * accel * leadMs * leadMs, 0, Math.max(0, resolved.maxLookaheadPx)),
    2,
  );
  const angle = Number.isFinite(strokeContext.directionAngleRad ?? 0) ? (strokeContext.directionAngleRad ?? 0) : 0;
  const currentX = Number.isFinite(strokeContext.currentX ?? 0) ? (strokeContext.currentX ?? 0) : 0;
  const currentY = Number.isFinite(strokeContext.currentY ?? 0) ? (strokeContext.currentY ?? 0) : 0;
  const lookaheadOffsetX = roundTo(Math.cos(angle) * lookaheadDistancePx, 2);
  const lookaheadOffsetY = roundTo(Math.sin(angle) * lookaheadDistancePx, 2);

  return {
    profileId: resolved.id,
    clampedVelocityPxPerMs: roundTo(clampedV, 3),
    normalizedVelocity: roundTo(u, 4),
    sizeMultiplier,
    opacityMultiplier,
    lookaheadDistancePx,
    lookaheadOffsetX,
    lookaheadOffsetY,
    predictedX: roundTo(currentX + lookaheadOffsetX, 2),
    predictedY: roundTo(currentY + lookaheadOffsetY, 2),
  };
}

export function sampleVelocityCurvePoints(
  profile: VelocityBrushProfile | VelocityBrushPresetId,
  steps = 24,
): readonly VelocityCurveSamplePoint[] {
  const resolved = resolveVelocityProfile(profile);
  const safeSteps = Math.max(2, Math.trunc(steps));
  const points: VelocityCurveSamplePoint[] = [];
  for (let i = 0; i <= safeSteps; i += 1) {
    const d = evaluateVelocityBrushDynamics((i / safeSteps) * resolved.maxVelocityPxPerMs, resolved);
    points.push({
      velocityPxPerMs: d.clampedVelocityPxPerMs,
      normalizedVelocity: d.normalizedVelocity,
      sizeMultiplier: d.sizeMultiplier,
      opacityMultiplier: d.opacityMultiplier,
    });
  }
  return points;
}

function buildGaussianWeights1D(radiusPx: number): { readonly kernelRadius: number; readonly weights: Float64Array } {
  const sigma = Math.max(0.5, radiusPx * 0.55);
  const kernelRadius = Math.min(24, Math.max(1, Math.ceil(radiusPx * 1.8)));
  const weights = new Float64Array(kernelRadius * 2 + 1);
  const twoSigmaSq = 2 * sigma * sigma;
  for (let d = -kernelRadius; d <= kernelRadius; d += 1) {
    weights[d + kernelRadius] = Math.exp(-(d * d) / twoSigmaSq);
  }
  return { kernelRadius, weights };
}

function assertBlurBuffers(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  selectionMask: Uint8Array | readonly number[],
): number {
  const w = Math.max(0, Math.trunc(width));
  const h = Math.max(0, Math.trunc(height));
  const pixelCount = w * h;
  if (pixelCount === 0) return 0;
  if (rgba.length < pixelCount * 4) throw new RangeError(`RGBA 버퍼 길이가 ${w}x${h}에 부족합니다.`);
  if (selectionMask.length < pixelCount) throw new RangeError(`selectionMask 길이가 ${w}x${h}에 부족합니다.`);
  return pixelCount;
}

interface FloatRgbaPlanes {
  readonly r: Float64Array; readonly g: Float64Array; readonly b: Float64Array; readonly a: Float64Array;
}

function runMaskedGaussianAxisPass(
  src: FloatRgbaPlanes,
  w: number,
  h: number,
  selectionMask: Uint8Array | readonly number[],
  kernelRadius: number,
  weights: Float64Array,
  axis: "horizontal" | "vertical",
): FloatRgbaPlanes {
  const n = w * h;
  const dst: FloatRgbaPlanes = { r: new Float64Array(n), g: new Float64Array(n), b: new Float64Array(n), a: new Float64Array(n) };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = y * w + x;
      if (selectionMask[idx] !== 1) continue;
      const coord = axis === "horizontal" ? x : y;
      const cMin = Math.max(0, coord - kernelRadius);
      const cMax = Math.min((axis === "horizontal" ? w : h) - 1, coord + kernelRadius);
      let aW = 0; let aSum = 0; let rgbW = 0; let rSum = 0; let gSum = 0; let bSum = 0;
      for (let s = cMin; s <= cMax; s += 1) {
        const sIdx = axis === "horizontal" ? y * w + s : s * w + x;
        // 외부 픽셀(selectionMask !== 1)은 절대 참조하지 않아 색번짐 0.00% 보장
        if (selectionMask[sIdx] !== 1) continue;
        const wt = weights[s - coord + kernelRadius] ?? 0;
        const sA = src.a[sIdx] ?? 0;
        aW += wt; aSum += wt * sA;
        const rw = wt * (sA / 255);
        rgbW += rw; rSum += rw * (src.r[sIdx] ?? 0); gSum += rw * (src.g[sIdx] ?? 0); bSum += rw * (src.b[sIdx] ?? 0);
      }
      dst.r[idx] = rgbW > 1e-12 ? rSum / rgbW : (src.r[idx] ?? 0);
      dst.g[idx] = rgbW > 1e-12 ? gSum / rgbW : (src.g[idx] ?? 0);
      dst.b[idx] = rgbW > 1e-12 ? bSum / rgbW : (src.b[idx] ?? 0);
      dst.a[idx] = aW > 1e-12 ? aSum / aW : (src.a[idx] ?? 0);
    }
  }
  return dst;
}

function run2dSelectedConvolution(
  rgba: Uint8ClampedArray,
  out: Uint8ClampedArray,
  w: number,
  h: number,
  selectionMask: Uint8Array | readonly number[],
  kernelRadius: number,
  weights: Float64Array,
  blockExternalReads: boolean,
): void {
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const centerIdx = y * w + x;
      if (selectionMask[centerIdx] !== 1) continue;
      const yMin = Math.max(0, y - kernelRadius);
      const yMax = Math.min(h - 1, y + kernelRadius);
      const xMin = Math.max(0, x - kernelRadius);
      const xMax = Math.min(w - 1, x + kernelRadius);
      let aW = 0; let aSum = 0; let rgbW = 0; let rSum = 0; let gSum = 0; let bSum = 0;

      for (let sy = yMin; sy <= yMax; sy += 1) {
        const wy = weights[sy - y + kernelRadius] ?? 0;
        const rowStart = sy * w;
        for (let sx = xMin; sx <= xMax; sx += 1) {
          const sampleIdx = rowStart + sx;
          if (blockExternalReads && selectionMask[sampleIdx] !== 1) continue;
          const w2d = wy * (weights[sx - x + kernelRadius] ?? 0);
          const sOff = sampleIdx * 4;
          const sA = rgba[sOff + 3] ?? 0;
          aW += w2d; aSum += w2d * sA;
          const rw = blockExternalReads ? w2d * (sA / 255) : w2d;
          rgbW += rw; rSum += rw * (rgba[sOff] ?? 0); gSum += rw * (rgba[sOff + 1] ?? 0); bSum += rw * (rgba[sOff + 2] ?? 0);
        }
      }
      const cOff = centerIdx * 4;
      if (rgbW > 1e-12) {
        out[cOff] = Math.round(rSum / rgbW);
        out[cOff + 1] = Math.round(gSum / rgbW);
        out[cOff + 2] = Math.round(bSum / rgbW);
      }
      if (aW > 1e-12) out[cOff + 3] = Math.round(aSum / aW);
    }
  }
}

/**
 * 선택 영역(selectionMask[i] === 1) 내부 픽셀만 가중 평균 가우시안 블러하여
 * 선택 경계 바깥 색이 안으로 0.00% 번지지 않음(Zero External Color Bleed)을 수학적으로 보장한다.
 */
export function applySelectionSafeBlur(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  selectionMask: Uint8Array | readonly number[],
  radiusPx: number,
): SelectionSafeBlurResult {
  const started = performance.now();
  const w = Math.max(0, Math.trunc(width));
  const h = Math.max(0, Math.trunc(height));
  const pixelCount = assertBlurBuffers(rgba, w, h, selectionMask);
  const safeRadius = clamp(radiusPx, 0, 24);
  const out = new Uint8ClampedArray(rgba);

  let selectedPixelCount = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    if (selectionMask[i] === 1) selectedPixelCount += 1;
  }
  const untouchedOutsidePixelCount = pixelCount - selectedPixelCount;

  if (pixelCount === 0 || selectedPixelCount === 0 || safeRadius <= 0) {
    return {
      rgba: out, width: w, height: h, radiusPx: safeRadius, kernelMode: "passthrough",
      selectedPixelCount, untouchedOutsidePixelCount, externalPixelsRead: 0,
      elapsedMs: roundTo(performance.now() - started, 3),
    };
  }

  const { kernelRadius, weights } = buildGaussianWeights1D(safeRadius);
  if (kernelRadius <= 8) {
    run2dSelectedConvolution(rgba, out, w, h, selectionMask, kernelRadius, weights, true);
    return {
      rgba: out, width: w, height: h, radiusPx: safeRadius, kernelMode: "exact-2d-masked",
      selectedPixelCount, untouchedOutsidePixelCount, externalPixelsRead: 0,
      elapsedMs: roundTo(performance.now() - started, 3),
    };
  }

  const srcPlanes: FloatRgbaPlanes = {
    r: new Float64Array(pixelCount), g: new Float64Array(pixelCount),
    b: new Float64Array(pixelCount), a: new Float64Array(pixelCount),
  };
  for (let i = 0; i < pixelCount; i += 1) {
    if (selectionMask[i] !== 1) continue;
    const off = i * 4;
    srcPlanes.r[i] = rgba[off] ?? 0; srcPlanes.g[i] = rgba[off + 1] ?? 0;
    srcPlanes.b[i] = rgba[off + 2] ?? 0; srcPlanes.a[i] = rgba[off + 3] ?? 0;
  }
  const passH = runMaskedGaussianAxisPass(srcPlanes, w, h, selectionMask, kernelRadius, weights, "horizontal");
  const passV = runMaskedGaussianAxisPass(passH, w, h, selectionMask, kernelRadius, weights, "vertical");
  for (let i = 0; i < pixelCount; i += 1) {
    if (selectionMask[i] !== 1) continue;
    const off = i * 4;
    out[off] = Math.round(passV.r[i] ?? 0); out[off + 1] = Math.round(passV.g[i] ?? 0);
    out[off + 2] = Math.round(passV.b[i] ?? 0); out[off + 3] = Math.round(passV.a[i] ?? 0);
  }
  return {
    rgba: out, width: w, height: h, radiusPx: safeRadius, kernelMode: "separable-masked",
    selectedPixelCount, untouchedOutsidePixelCount, externalPixelsRead: 0,
    elapsedMs: roundTo(performance.now() - started, 3),
  };
}

/** 비교 대조용 일반 가우시안 블러 (경계 밖 픽셀까지 읽은 뒤 쓰기만 선택 영역으로 클리핑). */
export function applyStandardUnmaskedBlur(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  selectionMask: Uint8Array | readonly number[],
  radiusPx: number,
): Uint8ClampedArray {
  const w = Math.max(0, Math.trunc(width));
  const h = Math.max(0, Math.trunc(height));
  const pixelCount = assertBlurBuffers(rgba, w, h, selectionMask);
  const safeRadius = clamp(radiusPx, 0, 24);
  const out = new Uint8ClampedArray(rgba);
  if (pixelCount === 0 || safeRadius <= 0) return out;
  const { kernelRadius, weights } = buildGaussianWeights1D(safeRadius);
  run2dSelectedConvolution(rgba, out, w, h, selectionMask, kernelRadius, weights, false);
  return out;
}

export function measureSelectionBoundaryBleed(
  beforeRgba: Uint8ClampedArray,
  afterRgba: Uint8ClampedArray,
  width: number,
  height: number,
  selectionMask: Uint8Array | readonly number[],
): BoundaryBleedAudit {
  const pixelCount = assertBlurBuffers(beforeRgba, width, height, selectionMask);
  let maxGreenIncreaseInside = 0; let sumGreenIncreaseInside = 0;
  let bledInsidePixelCount = 0; let totalInsidePixelCount = 0; let outsideMaxDelta = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    if (selectionMask[i] === 1) {
      totalInsidePixelCount += 1;
      const inc = Math.max(0, (afterRgba[off + 1] ?? 0) - (beforeRgba[off + 1] ?? 0));
      if (inc > 0) {
        bledInsidePixelCount += 1;
        sumGreenIncreaseInside += inc;
        if (inc > maxGreenIncreaseInside) maxGreenIncreaseInside = inc;
      }
    } else {
      const dMax = Math.max(
        Math.abs((afterRgba[off] ?? 0) - (beforeRgba[off] ?? 0)),
        Math.abs((afterRgba[off + 1] ?? 0) - (beforeRgba[off + 1] ?? 0)),
        Math.abs((afterRgba[off + 2] ?? 0) - (beforeRgba[off + 2] ?? 0)),
        Math.abs((afterRgba[off + 3] ?? 0) - (beforeRgba[off + 3] ?? 0)),
      );
      if (dMax > outsideMaxDelta) outsideMaxDelta = dMax;
    }
  }

  return {
    maxGreenIncreaseInside,
    meanGreenIncreaseInside: totalInsidePixelCount > 0 ? roundTo(sumGreenIncreaseInside / totalInsidePixelCount, 3) : 0,
    bledInsidePixelCount,
    totalInsidePixelCount,
    bleedRatioPercent: totalInsidePixelCount > 0 ? roundTo((bledInsidePixelCount / totalInsidePixelCount) * 100, 2) : 0,
    outsideMaxDelta,
    zeroExternalBleed: maxGreenIncreaseInside === 0 && bledInsidePixelCount === 0,
  };
}

export function createDemoBoundaryBlurFixture(width = 40, height = 40): DemoBoundaryBlurFixture {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const selectionMask = new Uint8Array(width * height);
  const x0 = Math.floor(width * 0.25); const x1 = Math.floor(width * 0.75);
  const y0 = Math.floor(height * 0.25); const y1 = Math.floor(height * 0.75);
  const midX = Math.floor((x0 + x1) / 2);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const off = idx * 4;
      const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
      selectionMask[idx] = inside ? 1 : 0;
      rgba[off] = inside ? (x < midX ? 240 : 120) : 0;
      rgba[off + 1] = inside ? 0 : 240;
      rgba[off + 2] = 0;
      rgba[off + 3] = 255;
    }
  }
  return { width, height, rgba, selectionMask };
}

export function compareBoundaryBlurAtRadius(fixture: DemoBoundaryBlurFixture, radiusPx: number): BoundaryBlurComparison {
  const safeResult = applySelectionSafeBlur(fixture.rgba, fixture.width, fixture.height, fixture.selectionMask, radiusPx);
  const standardRgba = applyStandardUnmaskedBlur(fixture.rgba, fixture.width, fixture.height, fixture.selectionMask, radiusPx);
  return {
    safeResult,
    safeAudit: measureSelectionBoundaryBleed(fixture.rgba, safeResult.rgba, fixture.width, fixture.height, fixture.selectionMask),
    standardAudit: measureSelectionBoundaryBleed(fixture.rgba, standardRgba, fixture.width, fixture.height, fixture.selectionMask),
  };
}

function parseIsoDateAndHour(iso: string, hourOverride?: number): { readonly date: string; readonly hour: number } {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):\d{2})?/.exec(iso.trim());
  if (match) {
    return { date: match[1] ?? "1970-01-01", hour: Math.trunc(clamp(hourOverride ?? (match[2] !== undefined ? Number(match[2]) : 0), 0, 23)) };
  }
  const dt = new Date(iso);
  if (!Number.isNaN(dt.getTime())) {
    return { date: dt.toISOString().slice(0, 10), hour: Math.trunc(clamp(hourOverride ?? dt.getUTCHours(), 0, 23)) };
  }
  return { date: "1970-01-01", hour: Math.trunc(clamp(hourOverride ?? 0, 0, 23)) };
}

/** 일별 작업 시간(분), 집중 비율, 최고 작업일 및 24시간 집중 피크 시간대를 집계한다. */
export function summarizeDailyWorkHours(sessions: readonly WorkTimeSession[]): DailyWorkHoursSummary {
  const hourly = new Array<number>(24).fill(0);
  const byDate = new Map<string, { activeMinutes: number; idleMinutes: number; sessionCount: number; stageMinutes: Map<WorkSessionStage, number> }>();
  let totalMinutes = 0;

  for (const session of sessions) {
    const active = Math.max(0, Number.isFinite(session.durationMinutes) ? session.durationMinutes : 0);
    const idle = Math.max(0, Number.isFinite(session.idleMinutes ?? 0) ? (session.idleMinutes ?? 0) : 0);
    const { date, hour } = parseIsoDateAndHour(session.startedAtIso, session.hourOfDay);
    totalMinutes += active;
    hourly[hour] = roundTo((hourly[hour] ?? 0) + active, 2);

    let bucket = byDate.get(date);
    if (!bucket) {
      bucket = { activeMinutes: 0, idleMinutes: 0, sessionCount: 0, stageMinutes: new Map<WorkSessionStage, number>() };
      byDate.set(date, bucket);
    }
    bucket.activeMinutes += active;
    bucket.idleMinutes += idle;
    bucket.sessionCount += 1;
    if (session.stage) bucket.stageMinutes.set(session.stage, (bucket.stageMinutes.get(session.stage) ?? 0) + active);
  }

  const days: DailyWorkBucket[] = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => {
      const denom = bucket.activeMinutes + bucket.idleMinutes;
      let dominantStage: WorkSessionStage | null = null;
      let bestStageMinutes = -1;
      for (const [stage, mins] of bucket.stageMinutes.entries()) {
        if (mins > bestStageMinutes) { bestStageMinutes = mins; dominantStage = stage; }
      }
      return {
        date, totalMinutes: roundTo(bucket.activeMinutes, 1), totalHours: roundTo(bucket.activeMinutes / 60, 2),
        idleMinutes: roundTo(bucket.idleMinutes, 1), sessionCount: bucket.sessionCount,
        focusRatio: denom > 0 ? roundTo(bucket.activeMinutes / denom, 3) : 1, dominantStage,
      };
    });

  let peakDay: DailyWorkBucket | null = null;
  for (const day of days) {
    if (!peakDay || day.totalMinutes > peakDay.totalMinutes) peakDay = day;
  }

  let peakFocusHour: PeakFocusHourSummary | null = null;
  for (let h = 0; h < 24; h += 1) {
    const mins = hourly[h] ?? 0;
    if (mins > 0 && (!peakFocusHour || mins > peakFocusHour.totalMinutes)) {
      peakFocusHour = { hour: h, label: `${String(h).padStart(2, "0")}:00–${String((h + 1) % 24).padStart(2, "0")}:00`, totalMinutes: roundTo(mins, 1) };
    }
  }

  const activeDaysCount = days.filter((d) => d.totalMinutes > 0).length;
  return {
    days, totalMinutes: roundTo(totalMinutes, 1), totalHours: roundTo(totalMinutes / 60, 2),
    averageDailyMinutes: activeDaysCount > 0 ? roundTo(totalMinutes / activeDaysCount, 1) : 0,
    activeDaysCount, peakDay, peakFocusHour, hourlyDistribution: hourly,
  };
}

function estimateLayerMemoryBytes(layer: CleanupCandidateLayer, effectivelyEmpty: boolean): number {
  if (layer.estimatedMemoryBytes !== undefined && Number.isFinite(layer.estimatedMemoryBytes)) {
    return Math.max(0, Math.round(layer.estimatedMemoryBytes));
  }
  if (layer.kind === "folder") return 4096;
  const fullBytes = Math.max(0, Math.trunc(layer.widthPx)) * Math.max(0, Math.trunc(layer.heightPx)) * Math.max(1, Math.trunc(layer.bytesPerPixel ?? 4));
  return effectivelyEmpty ? Math.min(fullBytes, EMPTY_LAYER_SPARSE_CAP_BYTES) : fullBytes;
}

/**
 * 숨김/빈 레이어 1클릭 일괄 정리 계획을 수립한다.
 * 잠긴 레이어(locked)와 비출력 붉은펜/검수 마크업 레이어는 숨김·빈 상태여도 무조건 보호한다.
 */
export function planHiddenLayerCleanup(layers: readonly CleanupCandidateLayer[]): HiddenLayerCleanupPlan {
  const removableLayers: PlannedRemovableLayer[] = [];
  const protectedLayers: PlannedProtectedLayer[] = [];
  const keptActiveLayers: CleanupCandidateLayer[] = [];
  let protectedLockedCount = 0; let protectedRedlineCount = 0; let estimatedSavingsBytes = 0;

  for (const layer of layers) {
    const effectivelyEmpty = layer.isEmpty || layer.nonTransparentPixelCount === 0;
    const isRedlineProtected = layer.isNonExportRedline === true || layer.kind === "redline" || layer.kind === "draft-markup";
    const protectionReasons: LayerCleanupProtectionReason[] = [];
    if (layer.locked) { protectionReasons.push("locked"); protectedLockedCount += 1; }
    if (isRedlineProtected) { protectionReasons.push("non-export-redline"); protectedRedlineCount += 1; }

    const memoryBytes = estimateLayerMemoryBytes(layer, effectivelyEmpty);
    const memoryMiB = roundTo(memoryBytes / BYTES_PER_MIB, 2);
    const matchesCleanup = !layer.visible || effectivelyEmpty;

    if (protectionReasons.length > 0) {
      protectedLayers.push({
        id: layer.id, name: layer.name, nameEn: layer.nameEn,
        primaryReason: protectionReasons[0] ?? "locked", protectionReasons,
        wouldHaveMatchedCleanup: matchesCleanup, memoryBytes, memoryMiB,
      });
    } else if (matchesCleanup) {
      const reason: LayerCleanupRemovalReason =
        !layer.visible && effectivelyEmpty ? "hidden-and-empty" : !layer.visible ? "hidden" : "empty";
      removableLayers.push({ id: layer.id, name: layer.name, nameEn: layer.nameEn, reason, memoryBytes, memoryMiB });
      estimatedSavingsBytes += memoryBytes;
    } else {
      keptActiveLayers.push(layer);
    }
  }

  return {
    removableLayers, removableLayerIds: removableLayers.map((item) => item.id),
    protectedLayers, keptActiveLayers, totalLayerCount: layers.length,
    removableCount: removableLayers.length, protectedCount: protectedLayers.length,
    protectedLockedCount, protectedRedlineCount, keptActiveCount: keptActiveLayers.length,
    estimatedSavingsBytes, estimatedSavingsMiB: roundTo(estimatedSavingsBytes / BYTES_PER_MIB, 2),
  };
}

export function applyHiddenLayerCleanup(
  layers: readonly CleanupCandidateLayer[],
  plan: HiddenLayerCleanupPlan,
): readonly CleanupCandidateLayer[] {
  const removeSet = new Set(plan.removableLayerIds);
  return layers.filter((layer) => !removeSet.has(layer.id));
}

export function createDemoWorkTimeSessions(): readonly WorkTimeSession[] {
  return [
    { id: "ws-1", startedAtIso: "2026-11-17T10:00:00+09:00", durationMinutes: 95, idleMinutes: 10, stage: "storyboard" },
    { id: "ws-2", startedAtIso: "2026-11-17T21:00:00+09:00", durationMinutes: 110, idleMinutes: 8, stage: "lineart" },
    { id: "ws-3", startedAtIso: "2026-11-18T14:00:00+09:00", durationMinutes: 120, idleMinutes: 15, stage: "lineart" },
    { id: "ws-4", startedAtIso: "2026-11-18T21:15:00+09:00", durationMinutes: 135, idleMinutes: 12, stage: "color" },
    { id: "ws-5", startedAtIso: "2026-11-19T15:00:00+09:00", durationMinutes: 85, idleMinutes: 10, stage: "color" },
    { id: "ws-6", startedAtIso: "2026-11-19T21:30:00+09:00", durationMinutes: 155, idleMinutes: 9, stage: "color" },
    { id: "ws-7", startedAtIso: "2026-11-20T11:00:00+09:00", durationMinutes: 70, idleMinutes: 12, stage: "finishing" },
    { id: "ws-8", startedAtIso: "2026-11-20T21:00:00+09:00", durationMinutes: 125, idleMinutes: 5, stage: "finishing" },
    { id: "ws-9", startedAtIso: "2026-11-21T16:00:00+09:00", durationMinutes: 140, idleMinutes: 14, stage: "export" },
  ];
}

export function createDemoCleanupLayers(): readonly CleanupCandidateLayer[] {
  return [
    { id: "layer-ink-main", name: "캐릭터 메인 선화", nameEn: "Character Main Ink", visible: true, locked: false, isEmpty: false, kind: "vector", widthPx: 1600, heightPx: 6000 },
    { id: "layer-flat-color", name: "밑색 채색 레이어", nameEn: "Flat Base Colors", visible: true, locked: false, isEmpty: false, kind: "raster", widthPx: 1600, heightPx: 6000 },
    { id: "layer-hidden-rough-v1", name: "구버전 러프 스케치 (숨김)", nameEn: "Old Rough Sketch v1 (Hidden)", visible: false, locked: false, isEmpty: false, kind: "raster", widthPx: 1600, heightPx: 6000 },
    { id: "layer-hidden-alt-bg", name: "폐기된 배경 시안 (숨김)", nameEn: "Discarded BG Draft (Hidden)", visible: false, locked: false, isEmpty: false, kind: "raster", widthPx: 1600, heightPx: 6000 },
    { id: "layer-empty-stray", name: "레이어 24 (빈 레이어)", nameEn: "Layer 24 (Empty)", visible: true, locked: false, isEmpty: true, nonTransparentPixelCount: 0, kind: "raster", widthPx: 1600, heightPx: 6000 },
    { id: "layer-locked-guide", name: "말풍선 안전선 가이드 (잠금)", nameEn: "Safe Gutter Guide (Locked)", visible: false, locked: true, isEmpty: false, kind: "reference", widthPx: 1600, heightPx: 6000 },
    { id: "layer-pd-redline", name: "PD 1차 붉은펜 피드백 (비출력)", nameEn: "PD Pass-1 Redline Markup (Non-Export)", visible: false, locked: false, isEmpty: false, kind: "redline", isNonExportRedline: true, widthPx: 1600, heightPx: 6000 },
  ];
}
