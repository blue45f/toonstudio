/**
 * Wave-69: 블록 매칭 옵티컬 플로(Optical Flow) 60fps 프레임 보간기 및 숏폼 출고 매니페스트 빌더.
 *
 * 12fps·24fps 웹툰 모션 키프레임 쌍을 오버랩 패치 블록 매칭(셀 단색 영역의 조리개 문제 해결) +
 * 전·후방 일관성 차폐 판정(Forward-Backward Consistency) + 양방향 중간시점 스플래팅 워핑
 * (Bidirectional Occlusion-Aware Warping)으로 60fps 중간 프레임으로 보간하고,
 * 유튜브 쇼츠·틱톡·인스타그램 릴스 출고 규격 검증 매니페스트를 생성한다.
 */

import type { SafeTitleInsetPx, ShortformAspectPreset } from "./parallax-25d-camera-choreographer";
import { SHORTFORM_VIEWPORT_PRESETS } from "./parallax-25d-camera-choreographer";

export interface RgbaImageFrame {
  readonly data: Uint8ClampedArray;
  readonly height: number;
  readonly width: number;
}

export interface BlockMotionVector {
  readonly blockX: number;
  readonly blockY: number;
  readonly confidence: number;
  readonly dx: number;
  readonly dy: number;
  readonly isFlat: boolean;
  readonly occluded: boolean;
  readonly sad: number;
}

export interface BlockOpticalFlowOptions {
  readonly blockSize?: number;
  readonly computeBackwardFlow?: boolean;
  readonly flatVarianceThreshold?: number;
  readonly occlusionThresholdPx?: number;
  readonly patchPaddingPx?: number;
  readonly regularizationWeight?: number;
  readonly searchRadius?: number;
  readonly subpixelRefinement?: boolean;
}

export interface BlockOpticalFlowField {
  readonly backwardVectors: readonly BlockMotionVector[];
  readonly blockSize: number;
  readonly cols: number;
  readonly forwardVectors: readonly BlockMotionVector[];
  readonly height: number;
  readonly maxMagnitudePx: number;
  readonly meanConfidence: number;
  readonly meanMagnitudePx: number;
  readonly occludedBlockRatio: number;
  readonly rows: number;
  readonly width: number;
}

export interface InterpolatedMotionToonFrameResult {
  readonly alpha: number;
  readonly flowField: BlockOpticalFlowField;
  readonly frame: RgbaImageFrame;
  readonly occlusionResolvedPixelCount: number;
  readonly splattedPixelCoverageRatio: number;
}

export interface KeyframeInterpolationSlot {
  readonly alpha: number;
  readonly frameAIndex: number;
  readonly frameBIndex: number;
  readonly outputFrameIndex: number;
  readonly timestampMs: number;
}

export type ShortformExportPlatform = "instagram-reels" | "tiktok" | "youtube-shorts";

export interface ShortformPlatformSpec {
  readonly allowedAudioSampleRatesHz: readonly number[];
  readonly container: "mp4";
  readonly maxBitrateKbps: number;
  readonly maxDurationSec: number;
  readonly maxFps: number;
  readonly minBitrateKbps: number;
  readonly minDurationSec: number;
  readonly platform: ShortformExportPlatform;
  readonly requiredAspectPreset: ShortformAspectPreset;
  readonly requiredHeightPx: number;
  readonly requiredWidthPx: number;
  readonly safeZoneInsetPx: SafeTitleInsetPx;
  readonly targetLufsMax: number;
  readonly targetLufsMin: number;
}

/** 유튜브 쇼츠·틱톡·인스타그램 릴스 60fps 숏폼 출고 기준. */
export const SHORTFORM_PLATFORM_SPECS: Readonly<Record<ShortformExportPlatform, ShortformPlatformSpec>> = {
  "instagram-reels": {
    allowedAudioSampleRatesHz: [44100, 48000], container: "mp4", maxBitrateKbps: 14000, maxDurationSec: 90,
    maxFps: 60, minBitrateKbps: 6000, minDurationSec: 3, platform: "instagram-reels",
    requiredAspectPreset: "9:16", requiredHeightPx: 1920, requiredWidthPx: 1080,
    safeZoneInsetPx: { bottom: 420, left: 64, right: 150, top: 220 }, targetLufsMax: -12, targetLufsMin: -16,
  },
  tiktok: {
    allowedAudioSampleRatesHz: [44100, 48000], container: "mp4", maxBitrateKbps: 15000, maxDurationSec: 180,
    maxFps: 60, minBitrateKbps: 6000, minDurationSec: 3, platform: "tiktok",
    requiredAspectPreset: "9:16", requiredHeightPx: 1920, requiredWidthPx: 1080,
    safeZoneInsetPx: { bottom: 400, left: 64, right: 148, top: 210 }, targetLufsMax: -12, targetLufsMin: -16,
  },
  "youtube-shorts": {
    allowedAudioSampleRatesHz: [48000], container: "mp4", maxBitrateKbps: 16000, maxDurationSec: 180,
    maxFps: 60, minBitrateKbps: 8000, minDurationSec: 1, platform: "youtube-shorts",
    requiredAspectPreset: "9:16", requiredHeightPx: 1920, requiredWidthPx: 1080,
    safeZoneInsetPx: { bottom: 380, left: 64, right: 140, top: 220 }, targetLufsMax: -12, targetLufsMin: -16,
  },
};

export interface ShortformValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface ShortformPlatformValidationResult {
  readonly compliant: boolean;
  readonly issues: readonly ShortformValidationIssue[];
  readonly platform: ShortformExportPlatform;
  readonly safeZoneInsetPx: SafeTitleInsetPx;
}

export interface BuildShortformExportManifestInput {
  readonly aspectPreset: ShortformAspectPreset;
  readonly audioSampleRateHz?: number;
  readonly bpm: number;
  readonly durationMs: number;
  readonly generatedAtIso?: string;
  readonly heightPx?: number;
  readonly meanOccludedBlockRatio?: number;
  readonly platforms?: readonly ShortformExportPlatform[];
  readonly prefersReducedMotion?: boolean;
  readonly projectId: string;
  readonly sourceFps: 12 | 24 | 30;
  readonly targetBitrateKbps?: number;
  readonly targetFps?: number;
  readonly targetLufs?: number;
  readonly widthPx?: number;
  readonly zeroBlackBorderGuaranteed: boolean;
}

export interface ShortformExportManifest {
  readonly allPlatformsCompliant: boolean;
  readonly audioProfile: {
    readonly bitrateKbps: number;
    readonly bpm: number;
    readonly channels: 2;
    readonly codec: "aac-lc";
    readonly sampleRateHz: number;
    readonly targetLufs: number;
  };
  readonly generatedAtIso: string;
  readonly manifestVersion: "wave69-motion-toon-1.0";
  readonly motionQualitySummary: {
    readonly meanOccludedBlockRatio: number;
    readonly opticalFlowMethod: "block-matching-bidirectional-occlusion-aware";
    readonly prefersReducedMotion: boolean;
    readonly zeroBlackBorderGuaranteed: boolean;
  };
  readonly platformChecks: readonly ShortformPlatformValidationResult[];
  readonly projectId: string;
  readonly videoProfile: {
    readonly aspectPreset: ShortformAspectPreset;
    readonly codec: "h264-high";
    readonly colorSpace: "bt709";
    readonly container: "mp4";
    readonly durationMs: number;
    readonly heightPx: number;
    readonly interpolationRatio: number;
    readonly pixelFormat: "yuv420p";
    readonly sourceFps: 12 | 24 | 30;
    readonly targetBitrateKbps: number;
    readonly targetFps: number;
    readonly totalOutputFrames: number;
    readonly widthPx: number;
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function clampInt(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function assertCompatibleFrames(frameA: RgbaImageFrame, frameB: RgbaImageFrame): void {
  if (frameA.width <= 0 || frameA.height <= 0) {
    throw new Error("프레임 크기는 양의 정수여야 합니다.");
  }
  if (frameA.width !== frameB.width || frameA.height !== frameB.height) {
    throw new Error("두 프레임의 해상도가 일치해야 옵티컬 플로를 추정할 수 있습니다.");
  }
  const expectedBytes = frameA.width * frameA.height * 4;
  if (frameA.data.length !== expectedBytes || frameB.data.length !== expectedBytes) {
    throw new Error("RGBA 버퍼 길이가 width * height * 4와 일치하지 않습니다.");
  }
}

function computePatchRgbaSad(
  src: Uint8ClampedArray, dst: Uint8ClampedArray, width: number, height: number,
  x0: number, y0: number, x1: number, y1: number, dx: number, dy: number,
): number {
  let sum = 0;
  let count = 0;
  const maxX = width - 1;
  const maxY = height - 1;
  for (let y = y0; y < y1; y += 1) {
    const sRow = clampInt(y, 0, maxY) * width;
    const tRow = clampInt(y + dy, 0, maxY) * width;
    for (let x = x0; x < x1; x += 1) {
      const si = (sRow + clampInt(x, 0, maxX)) * 4;
      const ti = (tRow + clampInt(x + dx, 0, maxX)) * 4;
      sum +=
        (Math.abs((src[si] ?? 0) - (dst[ti] ?? 0)) +
          Math.abs((src[si + 1] ?? 0) - (dst[ti + 1] ?? 0)) +
          Math.abs((src[si + 2] ?? 0) - (dst[ti + 2] ?? 0)) +
          Math.abs((src[si + 3] ?? 0) - (dst[ti + 3] ?? 0))) *
        0.25;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

function computePatchSpatialVariance(
  data: Uint8ClampedArray, width: number, height: number, x0: number, y0: number, x1: number, y1: number,
): number {
  const maxX = width - 1;
  const maxY = height - 1;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    const row = clampInt(y, 0, maxY) * width;
    for (let x = x0; x < x1; x += 1) {
      const idx = (row + clampInt(x, 0, maxX)) * 4;
      sumR += data[idx] ?? 0;
      sumG += data[idx + 1] ?? 0;
      sumB += data[idx + 2] ?? 0;
      count += 1;
    }
  }
  if (count === 0) return 0;
  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;
  let mad = 0;
  for (let y = y0; y < y1; y += 1) {
    const row = clampInt(y, 0, maxY) * width;
    for (let x = x0; x < x1; x += 1) {
      const idx = (row + clampInt(x, 0, maxX)) * 4;
      mad +=
        (Math.abs((data[idx] ?? 0) - meanR) +
          Math.abs((data[idx + 1] ?? 0) - meanG) +
          Math.abs((data[idx + 2] ?? 0) - meanB)) /
        3;
    }
  }
  return mad / count;
}

function refineParabolicSubpixel(costNeg: number, costZero: number, costPos: number): number {
  const denom = 2 * (costNeg - 2 * costZero + costPos);
  return Math.abs(denom) < 1e-6 ? 0 : clamp((costNeg - costPos) / denom, -0.5, 0.5);
}

function estimateSingleDirectionFlow(
  srcFrame: RgbaImageFrame, dstFrame: RgbaImageFrame, blockSize: number, searchRadius: number,
  patchPaddingPx: number, regWeight: number, flatThreshold: number, subpixelRefinement: boolean,
): BlockMotionVector[] {
  const { width, height } = srcFrame;
  const cols = Math.ceil(width / blockSize);
  const rows = Math.ceil(height / blockSize);
  const vectors: BlockMotionVector[] = [];

  for (let by = 0; by < rows; by += 1) {
    const py0 = by * blockSize - patchPaddingPx;
    const py1 = Math.min(height, (by + 1) * blockSize) + patchPaddingPx;
    for (let bx = 0; bx < cols; bx += 1) {
      const px0 = bx * blockSize - patchPaddingPx;
      const px1 = Math.min(width, (bx + 1) * blockSize) + patchPaddingPx;

      const zeroSad = computePatchRgbaSad(srcFrame.data, dstFrame.data, width, height, px0, py0, px1, py1, 0, 0);
      const spatialVar = computePatchSpatialVariance(srcFrame.data, width, height, px0, py0, px1, py1);

      // 정적 단색 배경 블록은 0벡터로 정규화해 노이즈를 차단한다.
      if (spatialVar < flatThreshold && zeroSad < flatThreshold) {
        vectors.push({ blockX: bx, blockY: by, confidence: 0.3, dx: 0, dy: 0, isFlat: true, occluded: false, sad: zeroSad });
        continue;
      }

      let bestDx = 0;
      let bestDy = 0;
      let bestSad = zeroSad;
      let bestCost = zeroSad;

      const scanRange = (minDx: number, maxDx: number, minDy: number, maxDy: number, step: number): void => {
        for (let dy = minDy; dy <= maxDy; dy += step) {
          for (let dx = minDx; dx <= maxDx; dx += step) {
            const sad = computePatchRgbaSad(srcFrame.data, dstFrame.data, width, height, px0, py0, px1, py1, dx, dy);
            const cost = sad + regWeight * Math.hypot(dx, dy);
            if (cost < bestCost) {
              bestCost = cost;
              bestSad = sad;
              bestDx = dx;
              bestDy = dy;
            }
          }
        }
      };

      const coarseStep = searchRadius > 14 ? 2 : 1;
      scanRange(-searchRadius, searchRadius, -searchRadius, searchRadius, coarseStep);
      if (coarseStep > 1) {
        scanRange(
          Math.max(-searchRadius, bestDx - 2), Math.min(searchRadius, bestDx + 2),
          Math.max(-searchRadius, bestDy - 2), Math.min(searchRadius, bestDy + 2), 1,
        );
      }

      let finalDx = bestDx;
      let finalDy = bestDy;
      if (subpixelRefinement && spatialVar >= flatThreshold) {
        const sadL = computePatchRgbaSad(srcFrame.data, dstFrame.data, width, height, px0, py0, px1, py1, bestDx - 1, bestDy);
        const sadR = computePatchRgbaSad(srcFrame.data, dstFrame.data, width, height, px0, py0, px1, py1, bestDx + 1, bestDy);
        const sadU = computePatchRgbaSad(srcFrame.data, dstFrame.data, width, height, px0, py0, px1, py1, bestDx, bestDy - 1);
        const sadD = computePatchRgbaSad(srcFrame.data, dstFrame.data, width, height, px0, py0, px1, py1, bestDx, bestDy + 1);
        finalDx = bestDx + refineParabolicSubpixel(sadL, bestSad, sadR);
        finalDy = bestDy + refineParabolicSubpixel(sadU, bestSad, sadD);
      }

      const matchQuality = clamp(1 - bestSad / 128, 0, 1);
      const gainOverZero = zeroSad > 1e-3 ? clamp((zeroSad - bestSad) / (zeroSad + 1), 0, 1) : 0;
      vectors.push({
        blockX: bx, blockY: by,
        confidence: clamp(0.45 * matchQuality + 0.55 * Math.max(matchQuality, gainOverZero), 0.1, 1),
        dx: finalDx, dy: finalDy, isFlat: spatialVar < flatThreshold, occluded: false, sad: bestSad,
      });
    }
  }
  return vectors;
}

function sampleBlockGridVector(
  vectors: readonly BlockMotionVector[], cols: number, rows: number, blockSize: number, px: number, py: number,
): { readonly confidence: number; readonly dx: number; readonly dy: number; readonly occluded: boolean } {
  const gx = clamp(px / blockSize - 0.5, 0, Math.max(0, cols - 1));
  const gy = clamp(py / blockSize - 0.5, 0, Math.max(0, rows - 1));
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(cols - 1, x0 + 1);
  const y1 = Math.min(rows - 1, y0 + 1);
  const fx = gx - x0;
  const fy = gy - y0;
  const v00 = vectors[y0 * cols + x0];
  const v10 = vectors[y0 * cols + x1];
  const v01 = vectors[y1 * cols + x0];
  const v11 = vectors[y1 * cols + x1];
  if (!v00 || !v10 || !v01 || !v11) return { confidence: 0, dx: 0, dy: 0, occluded: false };

  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  const nearest = vectors[Math.round(gy) * cols + Math.round(gx)];
  return {
    confidence: v00.confidence * w00 + v10.confidence * w10 + v01.confidence * w01 + v11.confidence * w11,
    dx: v00.dx * w00 + v10.dx * w10 + v01.dx * w01 + v11.dx * w11,
    dy: v00.dy * w00 + v10.dy * w10 + v01.dy * w01 + v11.dy * w11,
    occluded: Boolean(nearest?.occluded),
  };
}

/** 두 RGBA 키프레임 사이의 전·후방 블록 매칭 옵티컬 플로와 차폐(Occlusion) 마스크를 추정한다. */
export function estimateBlockOpticalFlow(
  frameA: RgbaImageFrame,
  frameB: RgbaImageFrame,
  options: BlockOpticalFlowOptions = {},
): BlockOpticalFlowField {
  assertCompatibleFrames(frameA, frameB);
  const blockSize = clampInt(Math.round(options.blockSize ?? 8), 4, 32);
  const searchRadius = clampInt(Math.round(options.searchRadius ?? 12), 2, 32);
  const patchPaddingPx = clampInt(Math.round(options.patchPaddingPx ?? Math.ceil(blockSize / 2)), 0, 16);
  const regWeight = Math.max(0, options.regularizationWeight ?? 0.12);
  const flatThreshold = Math.max(0.1, options.flatVarianceThreshold ?? 1.8);
  const subpixel = options.subpixelRefinement !== false;
  const computeBackward = options.computeBackwardFlow !== false;
  const occBaseThresholdPx = Math.max(0.5, options.occlusionThresholdPx ?? 2.0);
  const cols = Math.ceil(frameA.width / blockSize);
  const rows = Math.ceil(frameA.height / blockSize);

  const rawForward = estimateSingleDirectionFlow(
    frameA, frameB, blockSize, searchRadius, patchPaddingPx, regWeight, flatThreshold, subpixel,
  );
  const rawBackward = computeBackward
    ? estimateSingleDirectionFlow(
        frameB, frameA, blockSize, searchRadius, patchPaddingPx, regWeight, flatThreshold, subpixel,
      )
    : [];

  const markOcclusion = (primary: readonly BlockMotionVector[], reverse: readonly BlockMotionVector[]): BlockMotionVector[] => {
    if (reverse.length === 0) return primary.slice();
    return primary.map((vec) => {
      const wx = (vec.blockX + 0.5) * blockSize + vec.dx;
      const wy = (vec.blockY + 0.5) * blockSize + vec.dy;
      const outOfBounds = wx < 0 || wx >= frameA.width || wy < 0 || wy >= frameA.height;
      const rev = sampleBlockGridVector(reverse, cols, rows, blockSize, wx, wy);
      const err = Math.hypot(vec.dx + rev.dx, vec.dy + rev.dy);
      const threshold = Math.max(occBaseThresholdPx, 0.22 * Math.hypot(vec.dx, vec.dy) + 1.25);
      return outOfBounds || err > threshold ? { ...vec, occluded: true } : vec;
    });
  };

  const forwardVectors = markOcclusion(rawForward, rawBackward);
  const backwardVectors = rawBackward.length > 0 ? markOcclusion(rawBackward, rawForward) : [];

  let magSum = 0;
  let maxMagnitudePx = 0;
  let confSum = 0;
  let occludedCount = 0;
  for (let i = 0; i < forwardVectors.length; i += 1) {
    const vec = forwardVectors[i];
    if (!vec) continue;
    const mag = Math.hypot(vec.dx, vec.dy);
    magSum += mag;
    if (mag > maxMagnitudePx) maxMagnitudePx = mag;
    confSum += vec.confidence;
    if (vec.occluded) occludedCount += 1;
  }

  const totalBlocks = Math.max(1, forwardVectors.length);
  return {
    backwardVectors, blockSize, cols, forwardVectors, height: frameA.height, maxMagnitudePx,
    meanConfidence: confSum / totalBlocks, meanMagnitudePx: magSum / totalBlocks,
    occludedBlockRatio: occludedCount / totalBlocks, rows, width: frameA.width,
  };
}

function sampleRgbaBilinear(frame: RgbaImageFrame, x: number, y: number, out: Float64Array): void {
  const cx = clamp(x, 0, frame.width - 1);
  const cy = clamp(y, 0, frame.height - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(frame.width - 1, x0 + 1);
  const y1 = Math.min(frame.height - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  const i00 = (y0 * frame.width + x0) * 4;
  const i10 = (y0 * frame.width + x1) * 4;
  const i01 = (y1 * frame.width + x0) * 4;
  const i11 = (y1 * frame.width + x1) * 4;
  const d = frame.data;
  for (let c = 0; c < 4; c += 1) {
    out[c] = (d[i00 + c] ?? 0) * w00 + (d[i10 + c] ?? 0) * w10 + (d[i01 + c] ?? 0) * w01 + (d[i11 + c] ?? 0) * w11;
  }
}

/**
 * 양방향 차폐 인지(Bidirectional Occlusion-Aware) 중간시점 스플래팅 워핑으로
 * 시점 `alpha (0..1)`의 60fps 모션툰 중간 프레임을 생성한다.
 */
export function interpolateMotionToonFrameRgba(
  frameA: RgbaImageFrame,
  frameB: RgbaImageFrame,
  alpha: number,
  options: { readonly flowField?: BlockOpticalFlowField; readonly flowOptions?: BlockOpticalFlowOptions } = {},
): InterpolatedMotionToonFrameResult {
  assertCompatibleFrames(frameA, frameB);
  const t = clamp(alpha, 0, 1);
  const flowField = options.flowField ?? estimateBlockOpticalFlow(frameA, frameB, options.flowOptions);
  const { width, height, blockSize, cols, rows } = flowField;
  const pixelCount = width * height;

  if (t <= 0 || t >= 1) {
    const source = t <= 0 ? frameA : frameB;
    return {
      alpha: t, flowField, frame: { data: new Uint8ClampedArray(source.data), height, width },
      occlusionResolvedPixelCount: 0, splattedPixelCoverageRatio: 1,
    };
  }

  const sumVx = new Float32Array(pixelCount);
  const sumVy = new Float32Array(pixelCount);
  const sumW = new Float32Array(pixelCount);
  const visA = new Float32Array(pixelCount);
  const visB = new Float32Array(pixelCount);

  const splat = (tx: number, ty: number, vx: number, vy: number, weight: number, fromA: boolean): void => {
    const ix = Math.round(tx);
    const iy = Math.round(ty);
    if (ix < 0 || ix >= width || iy < 0 || iy >= height) return;
    const idx = iy * width + ix;
    sumVx[idx] = (sumVx[idx] ?? 0) + vx * weight;
    sumVy[idx] = (sumVy[idx] ?? 0) + vy * weight;
    sumW[idx] = (sumW[idx] ?? 0) + weight;
    if (fromA) visA[idx] = (visA[idx] ?? 0) + weight;
    else visB[idx] = (visB[idx] ?? 0) + weight;
  };

  for (let y = 0; y < height; y += 1) {
    const by = Math.min(rows - 1, Math.floor(y / blockSize));
    for (let x = 0; x < width; x += 1) {
      const bx = Math.min(cols - 1, Math.floor(x / blockSize));
      const fVec = flowField.forwardVectors[by * cols + bx];
      if (fVec) {
        const w = fVec.confidence * (fVec.occluded ? 0.35 : 1.0) * (1 + Math.hypot(fVec.dx, fVec.dy) * 1.5);
        splat(x + t * fVec.dx, y + t * fVec.dy, fVec.dx, fVec.dy, w, true);
      }
      if (flowField.backwardVectors.length > 0) {
        const bVec = flowField.backwardVectors[by * cols + bx];
        if (bVec) {
          const w = bVec.confidence * (bVec.occluded ? 0.35 : 1.0) * (1 + Math.hypot(bVec.dx, bVec.dy) * 1.5);
          splat(x + (1 - t) * bVec.dx, y + (1 - t) * bVec.dy, -bVec.dx, -bVec.dy, w, false);
        }
      }
    }
  }

  const outData = new Uint8ClampedArray(pixelCount * 4);
  const colorA = new Float64Array(4);
  const colorB = new Float64Array(4);
  let splattedCount = 0;
  let occlusionResolvedPixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const totalW = sumW[idx] ?? 0;
      const hasSplat = totalW > 1e-5;
      let vx: number;
      let vy: number;
      if (hasSplat) {
        vx = (sumVx[idx] ?? 0) / totalW;
        vy = (sumVy[idx] ?? 0) / totalW;
        splattedCount += 1;
      } else {
        const fallback = sampleBlockGridVector(flowField.forwardVectors, cols, rows, blockSize, x, y);
        vx = fallback.dx;
        vy = fallback.dy;
      }

      const ax = x - t * vx;
      const ay = y - t * vy;
      const bxCoord = x + (1 - t) * vx;
      const byCoord = y + (1 - t) * vy;
      sampleRgbaBilinear(frameA, ax, ay, colorA);
      sampleRgbaBilinear(frameB, bxCoord, byCoord, colorB);

      const aVis = visA[idx] ?? 0;
      const bVis = visB[idx] ?? 0;
      const aOut = ax < 0 || ax > width - 1 || ay < 0 || ay > height - 1;
      const bOut = bxCoord < 0 || bxCoord > width - 1 || byCoord < 0 || byCoord > height - 1;
      const photoDiff =
        (Math.abs((colorA[0] ?? 0) - (colorB[0] ?? 0)) +
          Math.abs((colorA[1] ?? 0) - (colorB[1] ?? 0)) +
          Math.abs((colorA[2] ?? 0) - (colorB[2] ?? 0))) / 3;

      let weightA = 1 - t;
      let weightB = t;
      if (aOut && !bOut) {
        weightA = 0;
        weightB = 1;
        occlusionResolvedPixelCount += 1;
      } else if (bOut && !aOut) {
        weightA = 1;
        weightB = 0;
        occlusionResolvedPixelCount += 1;
      } else if (hasSplat && photoDiff > 22) {
        if (aVis > bVis * 2.2) {
          weightA = 0.94;
          weightB = 0.06;
          occlusionResolvedPixelCount += 1;
        } else if (bVis > aVis * 2.2) {
          weightA = 0.06;
          weightB = 0.94;
          occlusionResolvedPixelCount += 1;
        }
      }

      const wSum = Math.max(1e-6, weightA + weightB);
      const outIdx = idx * 4;
      for (let c = 0; c < 4; c += 1) {
        outData[outIdx + c] = clampInt(Math.round(((colorA[c] ?? 0) * weightA + (colorB[c] ?? 0) * weightB) / wSum), 0, 255);
      }
    }
  }

  return {
    alpha: t, flowField, frame: { data: outData, height, width },
    occlusionResolvedPixelCount, splattedPixelCoverageRatio: splattedCount / Math.max(1, pixelCount),
  };
}

/** 12fps·24fps·30fps 키프레임 시퀀스를 드리프트 없는 유리수 주기로 60fps 출력 슬롯에 매핑한다. */
export function planKeyframeTo60fpsInterpolationSchedule(
  keyframeCount: number,
  sourceFps: 12 | 24 | 30,
  targetFps = 60,
): readonly KeyframeInterpolationSlot[] {
  if (keyframeCount <= 0) return [];
  const safeTargetFps = Math.max(sourceFps, Math.round(targetFps));
  if (keyframeCount === 1) {
    return [{ alpha: 0, frameAIndex: 0, frameBIndex: 0, outputFrameIndex: 0, timestampMs: 0 }];
  }
  const totalOutputFrames = Math.round(((keyframeCount - 1) * safeTargetFps) / sourceFps) + 1;
  const slots: KeyframeInterpolationSlot[] = [];
  for (let outIdx = 0; outIdx < totalOutputFrames; outIdx += 1) {
    const exactSourcePos = (outIdx * sourceFps) / safeTargetFps;
    const frameAIndex = Math.min(keyframeCount - 1, Math.floor(exactSourcePos));
    const frameBIndex = Math.min(keyframeCount - 1, frameAIndex + 1);
    slots.push({
      alpha: frameAIndex === frameBIndex ? 0 : clamp(exactSourcePos - frameAIndex, 0, 1),
      frameAIndex, frameBIndex, outputFrameIndex: outIdx, timestampMs: (outIdx * 1000) / safeTargetFps,
    });
  }
  return slots;
}

/** 12fps/24fps 키프레임 배열을 60fps RGBA 시퀀스로 일괄 보간한다. */
export function upsampleKeyframeSequenceTo60fps(
  keyframes: readonly RgbaImageFrame[],
  sourceFps: 12 | 24 | 30,
  targetFps = 60,
  flowOptions?: BlockOpticalFlowOptions,
): {
  readonly frames: readonly RgbaImageFrame[];
  readonly meanOccludedBlockRatio: number;
  readonly schedule: readonly KeyframeInterpolationSlot[];
} {
  const schedule = planKeyframeTo60fpsInterpolationSchedule(keyframes.length, sourceFps, targetFps);
  const flowCache = new Map<string, BlockOpticalFlowField>();
  const frames: RgbaImageFrame[] = [];

  for (let i = 0; i < schedule.length; i += 1) {
    const slot = schedule[i];
    if (!slot) continue;
    const frameA = keyframes[slot.frameAIndex];
    const frameB = keyframes[slot.frameBIndex];
    if (!frameA || !frameB) continue;
    if (slot.alpha <= 1e-6 || slot.frameAIndex === slot.frameBIndex) {
      frames.push({ data: new Uint8ClampedArray(frameA.data), height: frameA.height, width: frameA.width });
      continue;
    }
    if (slot.alpha >= 1 - 1e-6) {
      frames.push({ data: new Uint8ClampedArray(frameB.data), height: frameB.height, width: frameB.width });
      continue;
    }
    const cacheKey = `${slot.frameAIndex}:${slot.frameBIndex}`;
    let cachedFlow = flowCache.get(cacheKey);
    if (!cachedFlow) {
      cachedFlow = estimateBlockOpticalFlow(frameA, frameB, flowOptions);
      flowCache.set(cacheKey, cachedFlow);
    }
    frames.push(interpolateMotionToonFrameRgba(frameA, frameB, slot.alpha, { flowField: cachedFlow }).frame);
  }

  let occSum = 0;
  flowCache.forEach((field) => { occSum += field.occludedBlockRatio; });
  return { frames, meanOccludedBlockRatio: flowCache.size > 0 ? occSum / flowCache.size : 0, schedule };
}

/** 유튜브 쇼츠·틱톡·인스타그램 릴스 출고 규격을 일괄 검증하고 60fps 모션툰 출고 매니페스트를 생성한다. */
export function buildShortformExportManifest(input: BuildShortformExportManifestInput): ShortformExportManifest {
  const presetSpec = SHORTFORM_VIEWPORT_PRESETS[input.aspectPreset];
  const widthPx = Math.round(input.widthPx ?? presetSpec.widthPx);
  const heightPx = Math.round(input.heightPx ?? presetSpec.heightPx);
  const targetFps = Math.round(input.targetFps ?? 60);
  const durationMs = Math.max(0, input.durationMs);
  const durationSec = durationMs / 1000;
  const targetBitrateKbps = Math.round(input.targetBitrateKbps ?? 12000);
  const audioSampleRateHz = Math.round(input.audioSampleRateHz ?? 48000);
  const targetLufs = input.targetLufs ?? -14;
  const platforms: readonly ShortformExportPlatform[] = input.platforms ?? ["youtube-shorts", "tiktok", "instagram-reels"];

  const platformChecks: ShortformPlatformValidationResult[] = [];
  for (let i = 0; i < platforms.length; i += 1) {
    const platform = platforms[i];
    if (!platform) continue;
    const spec = SHORTFORM_PLATFORM_SPECS[platform];
    const issues: ShortformValidationIssue[] = [];
    const pushErr = (code: string, message: string): void => { issues.push({ code, message, severity: "error" }); };

    if (input.aspectPreset !== spec.requiredAspectPreset) {
      pushErr("ASPECT_MISMATCH", `${platform} 출고는 ${spec.requiredAspectPreset} 세로 화면비가 필요하지만 현재 ${input.aspectPreset}입니다.`);
    }
    if (widthPx !== spec.requiredWidthPx || heightPx !== spec.requiredHeightPx) {
      pushErr("RESOLUTION_MISMATCH", `${platform} 권장 해상도는 ${spec.requiredWidthPx}×${spec.requiredHeightPx}이지만 현재 ${widthPx}×${heightPx}입니다.`);
    }
    if (targetFps !== spec.maxFps) {
      pushErr("FPS_NOT_60", `60fps 모션툰 출고 기준(${spec.maxFps}fps)과 달리 현재 ${targetFps}fps로 설정되어 있습니다.`);
    }
    if (durationSec < spec.minDurationSec || durationSec > spec.maxDurationSec) {
      pushErr("DURATION_OUT_OF_RANGE", `${platform} 허용 재생 길이(${spec.minDurationSec}~${spec.maxDurationSec}초)를 벗어났습니다(현재 ${durationSec.toFixed(1)}초).`);
    }
    if (targetBitrateKbps < spec.minBitrateKbps || targetBitrateKbps > spec.maxBitrateKbps) {
      pushErr("BITRATE_OUT_OF_RANGE", `비디오 비트레이트(${targetBitrateKbps}kbps)가 ${platform} 권장 범위(${spec.minBitrateKbps}~${spec.maxBitrateKbps}kbps) 밖입니다.`);
    }
    if (spec.allowedAudioSampleRatesHz.indexOf(audioSampleRateHz) === -1) {
      pushErr("AUDIO_SAMPLE_RATE_UNSUPPORTED", `오디오 샘플레이트 ${audioSampleRateHz}Hz는 ${platform} 권장 규격(${spec.allowedAudioSampleRatesHz.join("/")}Hz)과 다릅니다.`);
    }
    if (targetLufs < spec.targetLufsMin || targetLufs > spec.targetLufsMax) {
      pushErr("AUDIO_LOUDNESS_OUT_OF_RANGE", `라우드니스(${targetLufs} LUFS)가 ${spec.targetLufsMin}~${spec.targetLufsMax} LUFS 범위를 벗어납니다.`);
    }
    if (!input.zeroBlackBorderGuaranteed) {
      pushErr("BLACK_BORDER_EXPOSED", "2.5D 오버스캔 크롭 안전 경계에서 검은 여백 노출 위험이 감지되었습니다.");
    }
    if ((input.meanOccludedBlockRatio ?? 0) > 0.45) {
      issues.push({ code: "HIGH_OCCLUSION_RATIO", message: "옵티컬 플로 차폐 블록 비율이 45%를 넘어 중간 프레임 잔상 점검이 필요합니다.", severity: "warning" });
    }

    platformChecks.push({
      compliant: !issues.some((issue) => issue.severity === "error"),
      issues, platform, safeZoneInsetPx: spec.safeZoneInsetPx,
    });
  }

  return {
    allPlatformsCompliant: platformChecks.length > 0 && platformChecks.every((check) => check.compliant),
    audioProfile: { bitrateKbps: 192, bpm: input.bpm, channels: 2, codec: "aac-lc", sampleRateHz: audioSampleRateHz, targetLufs },
    generatedAtIso: input.generatedAtIso ?? "2026-11-28T00:00:00.000Z",
    manifestVersion: "wave69-motion-toon-1.0",
    motionQualitySummary: {
      meanOccludedBlockRatio: clamp(input.meanOccludedBlockRatio ?? 0, 0, 1),
      opticalFlowMethod: "block-matching-bidirectional-occlusion-aware",
      prefersReducedMotion: Boolean(input.prefersReducedMotion),
      zeroBlackBorderGuaranteed: input.zeroBlackBorderGuaranteed,
    },
    platformChecks,
    projectId: input.projectId,
    videoProfile: {
      aspectPreset: input.aspectPreset, codec: "h264-high", colorSpace: "bt709", container: "mp4",
      durationMs, heightPx, interpolationRatio: targetFps / input.sourceFps, pixelFormat: "yuv420p",
      sourceFps: input.sourceFps, targetBitrateKbps, targetFps,
      totalOutputFrames: Math.max(1, Math.round(durationSec * targetFps)), widthPx,
    },
  };
}
