/**
 * Pure R8 MIP pyramid resampling & Photopea ABR descriptor → BrushProgramIR helpers.
 *
 * Kept under `brush/` (not `creator/` root) so `studio-abr-import.ts` stays well
 * under the 800-line source-size ratchet while sharing zero eager-graph edges.
 */

import {
  STUDIO_BRUSH_TEXTURE_COMBINE_MODES_V1,
  type StudioBrushTextureCombineModeV1,
} from "./studio-brush-texture-combine-v1";
import {
  STUDIO_BRUSH_CUSTOM_TIP_ALPHA_MAP_MAX_SIZE,
  encodeStudioBrushTipAlphaMapBase64,
} from "./studio-brush-tip-stamp";

import type { BrushProgramIR, DynamicMappingIR } from "@toonstudio/studio-project-model";
import type { Brush } from "ag-psd";

export interface StudioAbrR8MipLevel {
  readonly size: number;
  readonly alphaMapBase64: string;
}

export interface StudioAbrHighResTip {
  readonly alphaMapBase64: string;
  readonly alphaMapSize: number;
  readonly documentAlphaMapBase64: string;
  readonly documentAlphaMapSize: number;
  readonly mipLevels: readonly StudioAbrR8MipLevel[];
}

export interface StudioAbrDescriptorSummary {
  readonly hasDualBrush: boolean;
  readonly hasTexture: boolean;
  readonly hasColorDynamics: boolean;
  readonly wetEdges: boolean;
  readonly hasScatter: boolean;
  readonly hasBrushPose: boolean;
  readonly hasTransfer: boolean;
  readonly brushPose?: {
    readonly overrideAngle: boolean;
    readonly overrideTiltX: boolean;
    readonly overrideTiltY: boolean;
    readonly overridePressure: boolean;
    readonly tiltX: number;
    readonly tiltY: number;
    readonly angle: number;
    readonly pressure: number;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function normalizedAbrUnitFraction(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return clamp(value > 1 ? value / 100 : value, 0, 1);
}

export function normalizedAbrSignedUnit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return clamp(Math.abs(value) > 1 ? value / 100 : value, -1, 1);
}

export function mapAbrTextureBlendMode(blendMode: string | undefined): StudioBrushTextureCombineModeV1 {
  const normalized = (blendMode ?? "multiply").toLowerCase().replace(/\s+/gu, "-");
  if ((STUDIO_BRUSH_TEXTURE_COMBINE_MODES_V1 as readonly string[]).includes(normalized)) {
    return normalized as StudioBrushTextureCombineModeV1;
  }
  if (normalized === "linear-height") return "linear-height";
  if (normalized === "linear-burn") return "linear-burn";
  if (normalized === "color-dodge") return "color-dodge";
  if (normalized === "color-burn") return "color-burn";
  if (normalized === "hard-mix") return "hard-mix";
  return "multiply";
}

/** Area-averaged (box-filter) R8 downsample when shrinking; bilinear when upscaling. */
export function resampleStudioAbrR8Alpha(
  source: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Uint8Array {
  const output = new Uint8Array(dstWidth * dstHeight);
  if (srcWidth === dstWidth && srcHeight === dstHeight) {
    output.set(source.subarray(0, output.length));
    return output;
  }
  const scaleX = srcWidth / dstWidth;
  const scaleY = srcHeight / dstHeight;
  if (scaleX > 1 || scaleY > 1) {
    for (let dy = 0; dy < dstHeight; dy++) {
      const sy0 = dy * scaleY;
      const sy1 = Math.min(srcHeight, (dy + 1) * scaleY);
      const yStart = Math.floor(sy0);
      const yEnd = Math.min(srcHeight - 1, Math.ceil(sy1) - 1);
      for (let dx = 0; dx < dstWidth; dx++) {
        const sx0 = dx * scaleX;
        const sx1 = Math.min(srcWidth, (dx + 1) * scaleX);
        const xStart = Math.floor(sx0);
        const xEnd = Math.min(srcWidth - 1, Math.ceil(sx1) - 1);
        let sum = 0;
        let weight = 0;
        for (let sy = yStart; sy <= yEnd; sy++) {
          const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
          if (wy <= 0) continue;
          const rowOffset = sy * srcWidth;
          for (let sx = xStart; sx <= xEnd; sx++) {
            const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
            if (wx <= 0) continue;
            const w = wx * wy;
            sum += (source[rowOffset + sx] ?? 0) * w;
            weight += w;
          }
        }
        output[dy * dstWidth + dx] = weight > 0 ? Math.round(sum / weight) : 0;
      }
    }
    return output;
  }

  for (let dy = 0; dy < dstHeight; dy++) {
    const sy = ((dy + 0.5) / dstHeight) * srcHeight - 0.5;
    const top = Math.max(0, Math.min(srcHeight - 1, Math.floor(sy)));
    const bottom = Math.min(srcHeight - 1, top + 1);
    const ty = Math.max(0, Math.min(1, sy - top));
    for (let dx = 0; dx < dstWidth; dx++) {
      const sx = ((dx + 0.5) / dstWidth) * srcWidth - 0.5;
      const left = Math.max(0, Math.min(srcWidth - 1, Math.floor(sx)));
      const right = Math.min(srcWidth - 1, left + 1);
      const tx = Math.max(0, Math.min(1, sx - left));
      const topVal = source[top * srcWidth + left]! * (1 - tx) + source[top * srcWidth + right]! * tx;
      const botVal = source[bottom * srcWidth + left]! * (1 - tx) + source[bottom * srcWidth + right]! * tx;
      output[dy * dstWidth + dx] = Math.round(topVal * (1 - ty) + botVal * ty);
    }
  }
  return output;
}

/** Build a halved R8 MIP chain down to `documentMaxSize` (64px). */
export function buildStudioAbrR8MipChain(
  alpha: Uint8Array,
  size: number,
  documentMaxSize = STUDIO_BRUSH_CUSTOM_TIP_ALPHA_MAP_MAX_SIZE,
): readonly StudioAbrR8MipLevel[] {
  const levels: StudioAbrR8MipLevel[] = [
    { size, alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(alpha) },
  ];
  let currentSize = size;
  let current: Uint8Array = alpha;
  while (currentSize > documentMaxSize) {
    const nextSize = Math.max(documentMaxSize, Math.floor(currentSize / 2));
    const next = resampleStudioAbrR8Alpha(current, currentSize, currentSize, nextSize, nextSize);
    levels.push({ size: nextSize, alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(next) });
    currentSize = nextSize;
    current = next;
  }
  return levels;
}

export function buildAbrProgramIr(
  brush: Brush,
  name: string,
  index: number,
  seed: number,
  size: number,
  opacity: number,
  spacingRatio: number,
  sampleId: string | null,
): BrushProgramIR {
  const sizeDynamics: DynamicMappingIR[] = [
    { input: "constant", curve: [Math.min(1, size / 1000), Math.min(1, size / 1000)], min: 0, max: 1 },
  ];
  const szDyn = brush.shapeDynamics?.sizeDynamics;
  if (szDyn && szDyn.control === "pen pressure") {
    sizeDynamics.push({ input: "pressure", curve: [clamp(szDyn.minimum, 0, 1), 1], min: 0, max: 1 });
  } else if (szDyn && szDyn.control === "pen tilt") {
    sizeDynamics.push({ input: "tiltAltitude", curve: [clamp(szDyn.minimum, 0, 1), 1], min: 0, max: 1 });
  }

  const flowDynamics: DynamicMappingIR[] = [
    { input: "constant", curve: [opacity, opacity], min: 0, max: 1 },
  ];
  const opDyn = brush.transfer?.opacityDynamics ?? brush.toolOptions?.opacityDynamics;
  if (opDyn && opDyn.control === "pen pressure") {
    flowDynamics.push({ input: "pressure", curve: [clamp(opDyn.minimum, 0, 1), 1], min: 0, max: 1 });
  }

  const isSmudge = brush.toolOptions?.type === "smudge brush";
  const isWet = brush.wetEdges || brush.toolOptions?.type === "mixer brush" || (brush.toolOptions?.wetness ?? 0) > 0;
  const mixingKind: "none" | "smudge" | "wet" = isSmudge ? "smudge" : isWet ? "wet" : "none";
  const mixingStrength = isSmudge
    ? normalizedAbrUnitFraction(brush.toolOptions?.strength, 0.5)
    : isWet
      ? normalizedAbrUnitFraction(brush.toolOptions?.wetness ?? brush.toolOptions?.mix, 0.55)
      : 0;
  const hardness = brush.shape.type === "computed"
    ? clamp(brush.shape.hardness, 0, 1)
    : brush.shape.type === "tips"
      ? clamp(brush.shape.tipsHardness, 0, 1)
      : 1;

  const providerPreference = ["hokusai-natural-media"];
  if (brush.dualBrush) providerPreference.push("abr:dual-brush");
  if (brush.texture) providerPreference.push("abr:texture");
  if (brush.colorDynamics) providerPreference.push("abr:color-dynamics");
  if (brush.wetEdges) providerPreference.push("abr:wet-edges");
  if (brush.brushPose) providerPreference.push("abr:brush-pose");

  return {
    id: `abr:${index}:${seed.toString(16)}`,
    name,
    stabilizer: {
      kind: "ema",
      strength: clamp((brush.toolOptions?.smoothingValue ?? 0) / 100, 0, 1),
      predictionMs: 0,
    },
    sizeDynamics,
    flowDynamics,
    geometry: {
      kind: "perfect-freehand",
      thinning: 0.5,
      smoothing: 0.5,
      streamline: clamp((brush.toolOptions?.smoothingValue ?? 0) / 100, 0, 1),
      capStart: true,
      capEnd: true,
    },
    tip: {
      kind: sampleId ? "image" : brush.dualBrush || brush.texture ? "stamp" : "round",
      hardness,
      spacingPct: clamp(Math.round(spacingRatio * 1000) / 10, 1, 1000),
      angleJitterDeg: clamp((brush.shapeDynamics?.angleDynamics.jitter ?? 0) * 180, 0, 180),
      ...(sampleId ? { imageAssetId: sampleId } : {}),
    },
    mixing: { kind: mixingKind, strength: mixingStrength },
    output: { target: "raster-tiles", bake: "flatten" },
    providerPreference,
  };
}
