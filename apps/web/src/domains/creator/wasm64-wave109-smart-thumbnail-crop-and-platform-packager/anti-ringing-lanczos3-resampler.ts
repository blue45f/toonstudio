/**
 * Wave 109 — 안티링잉 Lanczos-3 만화 선화 리샘플러 및 플랫폼 출고 매니페스트 컴파일러.
 *
 * - 분리형 2D Lanczos-3 커널(`sinc(x) * sinc(x/3)`, `|x| < 3`)을 순수 결정론적 연산으로 수행한다.
 * - `antiRinging: true`(기본값)일 때 국소 주엽(inner support) `[min, max]` 범위로 채널을 클램프해
 *   고대비 흑백 잉크 선화 경계의 링잉 오버슈트를 0픽셀로 억제하면서도 이중선형(Bilinear)보다
 *   높은 경계 선명도(acutance)를 유지한다.
 */

import { canonicalJsonStringify, sha256HexSync } from "./sha256-canonical-manifest";
import {
  ALL_PLATFORM_THUMBNAIL_PRESET_IDS,
  solveSmartThumbnailCrops,
  type PlatformThumbnailPresetId,
  type Rect2D,
  type SmartThumbnailCropSolution,
  type SmartThumbnailSolverOptions,
  type SmartThumbnailSourceSpec,
  type SolvedPresetCrop,
} from "./smart-thumbnail-crop-solver";

export { sha256HexSync } from "./sha256-canonical-manifest";

export type ResamplerErrorCode = "INVALID_TILE_BUFFER" | "INVALID_TARGET_DIMENSIONS" | "INVALID_CROP_RECT";

export class ResamplerError extends Error {
  readonly code: ResamplerErrorCode;

  constructor(code: ResamplerErrorCode, message: string) {
    super(message);
    this.name = "ResamplerError";
    this.code = code;
  }
}

export interface RgbaTileBuffer {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
}

export interface Lanczos3ResampleOptions {
  readonly antiRinging?: boolean;
  readonly sourceCrop?: Rect2D;
}

export interface TileEdgeAcutanceMetrics {
  readonly rmsSobelAcutance: number;
  readonly meanSobelMagnitude: number;
  readonly maxSobelMagnitude: number;
  readonly meanLaplacianMagnitude: number;
  readonly interiorPixelCount: number;
}

export interface InkEdgeRingingReport {
  readonly expectedMinChannel: number;
  readonly expectedMaxChannel: number;
  readonly ringingOvershootCount: number;
  readonly undershootPixelCount: number;
  readonly overshootPixelCount: number;
  readonly maxUndershootDelta: number;
  readonly maxOvershootDelta: number;
  readonly observedMinChannel: number;
  readonly observedMaxChannel: number;
}

export interface PlatformThumbnailDeliverable {
  readonly presetId: PlatformThumbnailPresetId;
  readonly crop: SolvedPresetCrop;
  readonly outputWidthPx: number;
  readonly outputHeightPx: number;
  readonly resampledTile: RgbaTileBuffer | null;
  readonly tileSha256Hex: string | null;
  readonly lanczosAcutance: TileEdgeAcutanceMetrics | null;
  readonly bilinearAcutance: TileEdgeAcutanceMetrics | null;
  readonly ringingReport: InkEdgeRingingReport | null;
}

export interface ResamplerPackageAuditSummary {
  readonly resampledPresetCount: number;
  readonly antiRingingEnabled: boolean;
  readonly totalRingingOvershootCount: number;
  readonly averageLanczosAcutance: number;
  readonly averageBilinearAcutance: number;
  readonly sharpnessGainRatio: number;
}

export interface PlatformThumbnailPackageReport {
  readonly packageFormatVersion: "toonstudio-thumb-pack-v1";
  readonly artworkId: string;
  readonly titleKo: string;
  readonly sourceWidthPx: number;
  readonly sourceHeightPx: number;
  readonly cropSolution: SmartThumbnailCropSolution;
  readonly deliverables: readonly PlatformThumbnailDeliverable[];
  readonly resamplerAudit: ResamplerPackageAuditSummary;
  readonly manifestCanonicalJson: string;
  readonly manifestSha256Hex: string;
  readonly readyForPublish: boolean;
}

export interface CompilePlatformThumbnailPackageInput {
  readonly sourceSpec: SmartThumbnailSourceSpec;
  readonly presetIds?: readonly PlatformThumbnailPresetId[];
  readonly solverOptions?: SmartThumbnailSolverOptions;
  readonly sourceTile?: RgbaTileBuffer;
  readonly resamplePreviewMaxEdgePx?: number;
  readonly antiRinging?: boolean;
}

interface AxisTapPlan {
  readonly indices: readonly number[];
  readonly weights: readonly number[];
  readonly coreIndices: readonly number[];
}

function clampInt(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function validateTileBuffer(tile: RgbaTileBuffer): void {
  if (
    !Number.isInteger(tile.width) ||
    !Number.isInteger(tile.height) ||
    tile.width <= 0 ||
    tile.height <= 0 ||
    tile.rgba.length !== tile.width * tile.height * 4
  ) {
    throw new ResamplerError(
      "INVALID_TILE_BUFFER",
      "RGBA 타일 버퍼의 가로·세로 크기와 바이트 길이(width * height * 4)가 일치하지 않습니다.",
    );
  }
}

function validateTargetDimensions(targetWidth: number, targetHeight: number): void {
  if (!Number.isInteger(targetWidth) || !Number.isInteger(targetHeight) || targetWidth <= 0 || targetHeight <= 0) {
    throw new ResamplerError("INVALID_TARGET_DIMENSIONS", "리샘플링 출력 가로·세로 크기는 양의 정수여야 합니다.");
  }
}

function resolveCropRect(source: RgbaTileBuffer, sourceCrop?: Rect2D): Rect2D {
  if (!sourceCrop) return { x: 0, y: 0, width: source.width, height: source.height };
  if (
    !Number.isFinite(sourceCrop.x) ||
    !Number.isFinite(sourceCrop.y) ||
    !Number.isFinite(sourceCrop.width) ||
    !Number.isFinite(sourceCrop.height) ||
    sourceCrop.width <= 0 ||
    sourceCrop.height <= 0
  ) {
    throw new ResamplerError("INVALID_CROP_RECT", "원본 크롭 사각형 좌표가 유효하지 않습니다.");
  }
  return sourceCrop;
}

/** 정확한 Lanczos-3 커널 가중치: `sinc(x) * sinc(x/3)` (`|x| < 3`, 그 외 `0`). */
export function lanczos3Weight(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const ax = Math.abs(x);
  if (ax === 0) return 1;
  if (ax >= 3 || ax === 1 || ax === 2) return 0;
  const piX = Math.PI * ax;
  const piX3 = piX / 3;
  return (Math.sin(piX) / piX) * (Math.sin(piX3) / piX3);
}

function buildLanczos3AxisPlans(
  sourceLen: number,
  cropStart: number,
  cropLen: number,
  targetLen: number,
): AxisTapPlan[] {
  const scale = cropLen / targetLen;
  const filterScale = scale > 1 ? scale : 1;
  const support = 3 * filterScale;
  const plans: AxisTapPlan[] = [];

  for (let dst = 0; dst < targetLen; dst += 1) {
    const center = cropStart + (dst + 0.5) * scale - 0.5;
    const iStart = Math.ceil(center - support);
    const iEnd = Math.floor(center + support);
    const indices: number[] = [];
    const rawWeights: number[] = [];
    let weightSum = 0;

    for (let idx = iStart; idx <= iEnd; idx += 1) {
      const w = lanczos3Weight((idx - center) / filterScale);
      if (w !== 0) {
        indices.push(clampInt(idx, 0, sourceLen - 1));
        rawWeights.push(w);
        weightSum += w;
      }
    }

    if (indices.length === 0 || Math.abs(weightSum) < 1e-12) {
      const nearest = clampInt(Math.round(center), 0, sourceLen - 1);
      plans.push({ indices: [nearest], weights: [1], coreIndices: [nearest] });
      continue;
    }

    const normWeights = new Array<number>(rawWeights.length);
    for (let k = 0; k < rawWeights.length; k += 1) normWeights[k] = rawWeights[k] / weightSum;

    const coreMinIdx = Math.min(Math.floor(center), Math.floor(center - filterScale + 1e-9));
    const coreMaxIdx = Math.max(Math.ceil(center), Math.ceil(center + filterScale - 1e-9));
    const coreIndices: number[] = [];
    for (let idx = coreMinIdx; idx <= coreMaxIdx; idx += 1) {
      const clamped = clampInt(idx, 0, sourceLen - 1);
      if (coreIndices.length === 0 || coreIndices[coreIndices.length - 1] !== clamped) {
        coreIndices.push(clamped);
      }
    }
    plans.push({ indices, weights: normWeights, coreIndices });
  }
  return plans;
}

/** 분리형 2D 안티링잉 Lanczos-3 RGBA 타일 리샘플러. */
export function resampleTileLanczos3(
  source: RgbaTileBuffer,
  targetWidth: number,
  targetHeight: number,
  options?: Lanczos3ResampleOptions,
): RgbaTileBuffer {
  validateTileBuffer(source);
  validateTargetDimensions(targetWidth, targetHeight);
  const crop = resolveCropRect(source, options?.sourceCrop);
  const antiRinging = options?.antiRinging ?? true;

  const xPlans = buildLanczos3AxisPlans(source.width, crop.x, crop.width, targetWidth);
  const yPlans = buildLanczos3AxisPlans(source.height, crop.y, crop.height, targetHeight);

  const temp = new Float64Array(source.height * targetWidth * 4);
  const srcRgba = source.rgba;

  for (let sy = 0; sy < source.height; sy += 1) {
    const srcRowOffset = sy * source.width * 4;
    const dstRowOffset = sy * targetWidth * 4;
    for (let dx = 0; dx < targetWidth; dx += 1) {
      const plan = xPlans[dx];
      const outBase = dstRowOffset + dx * 4;
      for (let c = 0; c < 4; c += 1) {
        let acc = 0;
        let supportMin = 255;
        let supportMax = 0;
        for (let k = 0; k < plan.indices.length; k += 1) {
          const val = srcRgba[srcRowOffset + plan.indices[k] * 4 + c];
          acc += val * plan.weights[k];
          if (val < supportMin) supportMin = val;
          if (val > supportMax) supportMax = val;
        }
        if (supportMin === supportMax) {
          temp[outBase + c] = supportMin;
          continue;
        }
        if (antiRinging) {
          let coreMin = 255;
          let coreMax = 0;
          for (let k = 0; k < plan.coreIndices.length; k += 1) {
            const val = srcRgba[srcRowOffset + plan.coreIndices[k] * 4 + c];
            if (val < coreMin) coreMin = val;
            if (val > coreMax) coreMax = val;
          }
          acc = acc < coreMin ? coreMin : acc > coreMax ? coreMax : acc;
        }
        temp[outBase + c] = acc;
      }
    }
  }

  const outRgba = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let dy = 0; dy < targetHeight; dy += 1) {
    const plan = yPlans[dy];
    const outRowOffset = dy * targetWidth * 4;
    for (let dx = 0; dx < targetWidth; dx += 1) {
      const colOffset = dx * 4;
      const outBase = outRowOffset + colOffset;
      for (let c = 0; c < 4; c += 1) {
        let acc = 0;
        let supportMin = 255;
        let supportMax = 0;
        for (let k = 0; k < plan.indices.length; k += 1) {
          const val = temp[plan.indices[k] * targetWidth * 4 + colOffset + c];
          acc += val * plan.weights[k];
          if (val < supportMin) supportMin = val;
          if (val > supportMax) supportMax = val;
        }
        if (supportMin === supportMax) {
          outRgba[outBase + c] = Math.round(supportMin);
          continue;
        }
        if (antiRinging) {
          let coreMin = 255;
          let coreMax = 0;
          for (let k = 0; k < plan.coreIndices.length; k += 1) {
            const val = temp[plan.coreIndices[k] * targetWidth * 4 + colOffset + c];
            if (val < coreMin) coreMin = val;
            if (val > coreMax) coreMax = val;
          }
          acc = acc < coreMin ? coreMin : acc > coreMax ? coreMax : acc;
        }
        outRgba[outBase + c] = Math.round(acc);
      }
    }
  }

  return { width: targetWidth, height: targetHeight, rgba: outRgba };
}

/** 비교 기준용 분리형 2D 이중선형(Bilinear / Triangle) RGBA 타일 리샘플러. */
export function resampleTileBilinear(
  source: RgbaTileBuffer,
  targetWidth: number,
  targetHeight: number,
  sourceCrop?: Rect2D,
): RgbaTileBuffer {
  validateTileBuffer(source);
  validateTargetDimensions(targetWidth, targetHeight);
  const crop = resolveCropRect(source, sourceCrop);

  const buildTrianglePlans = (srcLen: number, start: number, cropLen: number, dstLen: number) => {
    const scale = cropLen / dstLen;
    const fScale = scale > 1 ? scale : 1;
    const plans: { readonly indices: readonly number[]; readonly weights: readonly number[] }[] = [];
    for (let d = 0; d < dstLen; d += 1) {
      const center = start + (d + 0.5) * scale - 0.5;
      const i0 = Math.ceil(center - fScale);
      const i1 = Math.floor(center + fScale);
      const idxs: number[] = [];
      const ws: number[] = [];
      let sum = 0;
      for (let i = i0; i <= i1; i += 1) {
        const u = Math.abs(i - center) / fScale;
        const w = u < 1 ? 1 - u : 0;
        if (w > 0) {
          idxs.push(clampInt(i, 0, srcLen - 1));
          ws.push(w);
          sum += w;
        }
      }
      plans.push(
        idxs.length === 0 || sum <= 1e-12
          ? { indices: [clampInt(Math.round(center), 0, srcLen - 1)], weights: [1] }
          : { indices: idxs, weights: ws.map((w) => w / sum) },
      );
    }
    return plans;
  };

  const xPlans = buildTrianglePlans(source.width, crop.x, crop.width, targetWidth);
  const yPlans = buildTrianglePlans(source.height, crop.y, crop.height, targetHeight);

  const temp = new Float64Array(source.height * targetWidth * 4);
  for (let sy = 0; sy < source.height; sy += 1) {
    const srcRow = sy * source.width * 4;
    const dstRow = sy * targetWidth * 4;
    for (let dx = 0; dx < targetWidth; dx += 1) {
      const p = xPlans[dx];
      const outBase = dstRow + dx * 4;
      for (let c = 0; c < 4; c += 1) {
        let acc = 0;
        for (let k = 0; k < p.indices.length; k += 1) acc += source.rgba[srcRow + p.indices[k] * 4 + c] * p.weights[k];
        temp[outBase + c] = acc;
      }
    }
  }

  const outRgba = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let dy = 0; dy < targetHeight; dy += 1) {
    const p = yPlans[dy];
    const outRow = dy * targetWidth * 4;
    for (let dx = 0; dx < targetWidth; dx += 1) {
      const col = dx * 4;
      const outBase = outRow + col;
      for (let c = 0; c < 4; c += 1) {
        let acc = 0;
        for (let k = 0; k < p.indices.length; k += 1) acc += temp[p.indices[k] * targetWidth * 4 + col + c] * p.weights[k];
        outRgba[outBase + c] = Math.round(acc);
      }
    }
  }

  return { width: targetWidth, height: targetHeight, rgba: outRgba };
}

/** Rec.709 휘도 기반 Sobel/Laplacian 경계 선명도(acutance) 지표 산출. */
export function computeTileEdgeAcutance(tile: RgbaTileBuffer): TileEdgeAcutanceMetrics {
  validateTileBuffer(tile);
  const { width, height, rgba } = tile;
  if (width < 3 || height < 3) {
    return { rmsSobelAcutance: 0, meanSobelMagnitude: 0, maxSobelMagnitude: 0, meanLaplacianMagnitude: 0, interiorPixelCount: 0 };
  }

  const luma = new Float64Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const base = i * 4;
    luma[i] = 0.2126 * rgba[base] + 0.7152 * rgba[base + 1] + 0.0722 * rgba[base + 2];
  }

  let sumSqSobel = 0;
  let sumSobel = 0;
  let maxSobel = 0;
  let sumLaplacian = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    const rowUp = (y - 1) * width;
    const rowMid = y * width;
    const rowDown = (y + 1) * width;
    for (let x = 1; x < width - 1; x += 1) {
      const tl = luma[rowUp + x - 1];
      const tc = luma[rowUp + x];
      const tr = luma[rowUp + x + 1];
      const ml = luma[rowMid + x - 1];
      const mc = luma[rowMid + x];
      const mr = luma[rowMid + x + 1];
      const bl = luma[rowDown + x - 1];
      const bc = luma[rowDown + x];
      const br = luma[rowDown + x + 1];

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const sq = gx * gx + gy * gy;
      const mag = Math.sqrt(sq);
      sumSqSobel += sq;
      sumSobel += mag;
      if (mag > maxSobel) maxSobel = mag;
      sumLaplacian += Math.abs(4 * mc - ml - mr - tc - bc);
      count += 1;
    }
  }

  return {
    rmsSobelAcutance: count > 0 ? Math.sqrt(sumSqSobel / count) : 0,
    meanSobelMagnitude: count > 0 ? sumSobel / count : 0,
    maxSobelMagnitude: maxSobel,
    meanLaplacianMagnitude: count > 0 ? sumLaplacian / count : 0,
    interiorPixelCount: count,
  };
}

/** 원본 채널 허용 구간(`[expectedMinChannel, expectedMaxChannel]`) 밖으로 튄 링잉 오버슈트 탐지. */
export function measureInkEdgeRingingOvershoot(
  tile: RgbaTileBuffer,
  expectedMinChannel: number,
  expectedMaxChannel: number,
): InkEdgeRingingReport {
  validateTileBuffer(tile);
  const { width, height, rgba } = tile;
  let undershootPixelCount = 0;
  let overshootPixelCount = 0;
  let ringingOvershootCount = 0;
  let maxUndershootDelta = 0;
  let maxOvershootDelta = 0;
  let observedMinChannel = 255;
  let observedMaxChannel = 0;

  for (let i = 0; i < width * height; i += 1) {
    const base = i * 4;
    let hasUnder = false;
    let hasOver = false;
    for (let c = 0; c < 3; c += 1) {
      const v = rgba[base + c];
      if (v < observedMinChannel) observedMinChannel = v;
      if (v > observedMaxChannel) observedMaxChannel = v;
      if (v < expectedMinChannel) {
        hasUnder = true;
        maxUndershootDelta = Math.max(maxUndershootDelta, expectedMinChannel - v);
      }
      if (v > expectedMaxChannel) {
        hasOver = true;
        maxOvershootDelta = Math.max(maxOvershootDelta, v - expectedMaxChannel);
      }
    }
    if (hasUnder) undershootPixelCount += 1;
    if (hasOver) overshootPixelCount += 1;
    if (hasUnder || hasOver) ringingOvershootCount += 1;
  }

  return {
    expectedMinChannel,
    expectedMaxChannel,
    ringingOvershootCount,
    undershootPixelCount,
    overshootPixelCount,
    maxUndershootDelta,
    maxOvershootDelta,
    observedMinChannel,
    observedMaxChannel,
  };
}

function measureSourceTileChannelBounds(tile: RgbaTileBuffer): { readonly min: number; readonly max: number } {
  let min = 255;
  let max = 0;
  for (let i = 0; i < tile.width * tile.height; i += 1) {
    const base = i * 4;
    for (let c = 0; c < 3; c += 1) {
      const v = tile.rgba[base + c];
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return { min, max };
}

/** 플랫폼별 스마트 크롭 계산 + 선택적 안티링잉 Lanczos-3 실측 리샘플링 + SHA-256 매니페스트 봉인. */
export function compilePlatformThumbnailPackageManifest(
  input: CompilePlatformThumbnailPackageInput,
): PlatformThumbnailPackageReport {
  const presetIds = input.presetIds ?? ALL_PLATFORM_THUMBNAIL_PRESET_IDS;
  const antiRinging = input.antiRinging ?? true;
  const cropSolution = solveSmartThumbnailCrops(input.sourceSpec, presetIds, input.solverOptions);

  const sourceTile = input.sourceTile ?? null;
  if (sourceTile) validateTileBuffer(sourceTile);
  const sourceBounds = sourceTile ? measureSourceTileChannelBounds(sourceTile) : null;
  const previewMaxEdge = Math.max(16, Math.floor(input.resamplePreviewMaxEdgePx ?? 96));

  const deliverables: PlatformThumbnailDeliverable[] = [];
  let totalRingingOvershootCount = 0;
  let sumLanczosAcutance = 0;
  let sumBilinearAcutance = 0;
  let resampledCount = 0;

  for (let i = 0; i < cropSolution.crops.length; i += 1) {
    const solved = cropSolution.crops[i];
    let resampledTile: RgbaTileBuffer | null = null;
    let tileSha256Hex: string | null = null;
    let lanczosAcutance: TileEdgeAcutanceMetrics | null = null;
    let bilinearAcutance: TileEdgeAcutanceMetrics | null = null;
    let ringingReport: InkEdgeRingingReport | null = null;

    if (sourceTile && sourceBounds) {
      const tileScaleX = sourceTile.width / input.sourceSpec.sourceWidthPx;
      const tileScaleY = sourceTile.height / input.sourceSpec.sourceHeightPx;
      const tileCrop: Rect2D = {
        x: solved.cropWindow.x * tileScaleX,
        y: solved.cropWindow.y * tileScaleY,
        width: Math.max(1, solved.cropWindow.width * tileScaleX),
        height: Math.max(1, solved.cropWindow.height * tileScaleY),
      };
      const aspect = solved.preset.targetAspectRatio;
      const outW = aspect >= 1 ? previewMaxEdge : Math.max(8, Math.round(previewMaxEdge * aspect));
      const outH = aspect >= 1 ? Math.max(8, Math.round(previewMaxEdge / aspect)) : previewMaxEdge;

      resampledTile = resampleTileLanczos3(sourceTile, outW, outH, { antiRinging, sourceCrop: tileCrop });
      const bilinearTile = resampleTileBilinear(sourceTile, outW, outH, tileCrop);
      tileSha256Hex = sha256HexSync(resampledTile.rgba);
      lanczosAcutance = computeTileEdgeAcutance(resampledTile);
      bilinearAcutance = computeTileEdgeAcutance(bilinearTile);
      ringingReport = measureInkEdgeRingingOvershoot(resampledTile, sourceBounds.min, sourceBounds.max);

      totalRingingOvershootCount += ringingReport.ringingOvershootCount;
      sumLanczosAcutance += lanczosAcutance.rmsSobelAcutance;
      sumBilinearAcutance += bilinearAcutance.rmsSobelAcutance;
      resampledCount += 1;
    }

    deliverables.push({
      presetId: solved.presetId,
      crop: solved,
      outputWidthPx: solved.preset.targetWidthPx,
      outputHeightPx: solved.preset.targetHeightPx,
      resampledTile,
      tileSha256Hex,
      lanczosAcutance,
      bilinearAcutance,
      ringingReport,
    });
  }

  const averageLanczosAcutance = resampledCount > 0 ? sumLanczosAcutance / resampledCount : 0;
  const averageBilinearAcutance = resampledCount > 0 ? sumBilinearAcutance / resampledCount : 0;
  const sharpnessGainRatio = averageBilinearAcutance > 1e-9 ? averageLanczosAcutance / averageBilinearAcutance : 1;

  const manifestCanonicalJson = canonicalJsonStringify({
    packageFormatVersion: "toonstudio-thumb-pack-v1",
    artworkId: input.sourceSpec.artworkId,
    sourceWidthPx: input.sourceSpec.sourceWidthPx,
    sourceHeightPx: input.sourceSpec.sourceHeightPx,
    antiRingingEnabled: antiRinging,
    deliverables: deliverables.map((d) => ({
      presetId: d.presetId,
      targetWidthPx: d.outputWidthPx,
      targetHeightPx: d.outputHeightPx,
      cropWindow: d.crop.cropWindow,
      aspectRatioRelativeError: d.crop.aspectRatioRelativeError,
      primaryFaceFullyContained: d.crop.primaryFaceFullyContained,
      primaryEyeOccludedByUiBadge: d.crop.primaryEyeOccludedByUiBadge,
      upscaleRatio: d.crop.upscaleRatio,
      lowResolutionWarning: d.crop.lowResolutionWarning,
      tileSha256Hex: d.tileSha256Hex,
      ringingOvershootCount: d.ringingReport ? d.ringingReport.ringingOvershootCount : null,
    })),
  });
  const manifestSha256Hex = sha256HexSync(manifestCanonicalJson);

  return {
    packageFormatVersion: "toonstudio-thumb-pack-v1",
    artworkId: input.sourceSpec.artworkId,
    titleKo: input.sourceSpec.titleKo,
    sourceWidthPx: input.sourceSpec.sourceWidthPx,
    sourceHeightPx: input.sourceSpec.sourceHeightPx,
    cropSolution,
    deliverables,
    resamplerAudit: {
      resampledPresetCount: resampledCount,
      antiRingingEnabled: antiRinging,
      totalRingingOvershootCount,
      averageLanczosAcutance,
      averageBilinearAcutance,
      sharpnessGainRatio,
    },
    manifestCanonicalJson,
    manifestSha256Hex,
    readyForPublish:
      cropSolution.allPrimaryFacesContained &&
      !cropSolution.anyPrimaryEyeOccludedByUiBadge &&
      cropSolution.maxAspectRatioRelativeError < 1e-4 &&
      totalRingingOvershootCount === 0,
  };
}
