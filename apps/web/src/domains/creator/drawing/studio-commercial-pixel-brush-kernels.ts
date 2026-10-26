/**
 * 상용 웹툰·페인팅 앱(ibisPaint, MediBang, Photopea, SAI Ver.2, Concepts) 및
 * 픽셀아트(JS Paint, Pixilart, Aseprite) 클린룸 브러시 실행 커널 (Wave 21).
 */

import {
  IBIS_MEDIBANG_BRUSH_PRESETS,
  type ComicRibbonStampPresetId,
} from "./studio-universal-brush-presets";

export interface CommercialBrushPoint2D {
  readonly x: number;
  readonly y: number;
  readonly pressure01?: number;
  readonly timestampMs?: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

export interface ComicRibbonStampInstance {
  readonly x: number;
  readonly y: number;
  readonly nozzleIndex: number;
  readonly tangentAngleDeg: number;
  readonly scale: number;
}

export function synthesizeComicRibbonStampChain(
  presetId: ComicRibbonStampPresetId,
  points: readonly CommercialBrushPoint2D[],
  baseDiameterPx = 24,
): readonly ComicRibbonStampInstance[] {
  const preset =
    IBIS_MEDIBANG_BRUSH_PRESETS.find((item) => item.id === presetId) ??
    IBIS_MEDIBANG_BRUSH_PRESETS[0];
  const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length === 0) return [];

  const diameter = clampRange(baseDiameterPx, 2, 256, 24);
  const stepDist = Math.max(1.5, diameter * preset.spacingRatio);
  const instances: ComicRibbonStampInstance[] = [
    { x: valid[0].x, y: valid[0].y, nozzleIndex: 0, tangentAngleDeg: 0, scale: 1 },
  ];
  let nozzleCursor = 0;
  let prev = valid[0];
  let carryDist = 0;

  for (let i = 1; i < valid.length; i += 1) {
    const curr = valid[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-4) continue;
    const angleDeg = preset.alignToTangent ? (Math.atan2(dy, dx) * 180) / Math.PI : 0;
    let distAlong = stepDist - carryDist;

    while (distAlong <= segLen) {
      const t = distAlong / segLen;
      const p01 = clamp01((prev.pressure01 ?? 0.8) * (1 - t) + (curr.pressure01 ?? 0.8) * t);
      nozzleCursor = (nozzleCursor + 1) % preset.nozzleCycleCount;
      const scale =
        preset.pressureSizeRange01[0] +
        (preset.pressureSizeRange01[1] - preset.pressureSizeRange01[0]) * p01;
      instances.push({
        x: prev.x + dx * t,
        y: prev.y + dy * t,
        nozzleIndex: nozzleCursor,
        tangentAngleDeg: angleDeg,
        scale,
      });
      distAlong += stepDist;
    }
    carryDist = segLen - (distAlong - stepDist);
    prev = curr;
  }
  return instances;
}

export interface CleanRoomBrushQrSharePayload {
  readonly schema: "toonstudio.qr-brush.v1";
  readonly presetId: ComicRibbonStampPresetId;
  readonly baseDiameterPx: number;
  readonly opacity01: number;
  readonly spacingRatio: number;
  readonly checksumHex: string;
}

function computeFnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function encodeCleanRoomBrushQrPayload(params: {
  readonly presetId: ComicRibbonStampPresetId;
  readonly baseDiameterPx: number;
  readonly opacity01: number;
  readonly spacingRatio: number;
}): string {
  const diameter = Math.round(clampRange(params.baseDiameterPx, 1, 500, 24) * 10) / 10;
  const opacity = Math.round(clamp01(params.opacity01) * 1000) / 1000;
  const spacing = Math.round(clampRange(params.spacingRatio, 0.01, 2, 0.25) * 1000) / 1000;
  const canonical = `${params.presetId}|${diameter}|${opacity}|${spacing}`;
  return JSON.stringify({
    schema: "toonstudio.qr-brush.v1",
    presetId: params.presetId,
    baseDiameterPx: diameter,
    opacity01: opacity,
    spacingRatio: spacing,
    checksumHex: computeFnv1aHex(canonical),
  } satisfies CleanRoomBrushQrSharePayload);
}

export function decodeCleanRoomBrushQrPayload(serialized: string): CleanRoomBrushQrSharePayload | null {
  try {
    const parsed = JSON.parse(serialized) as Partial<CleanRoomBrushQrSharePayload>;
    if (parsed.schema !== "toonstudio.qr-brush.v1" || typeof parsed.presetId !== "string") {
      return null;
    }
    if (!IBIS_MEDIBANG_BRUSH_PRESETS.some((item) => item.id === parsed.presetId)) return null;
    const diameter = Number(parsed.baseDiameterPx);
    const opacity = Number(parsed.opacity01);
    const spacing = Number(parsed.spacingRatio);
    if (!Number.isFinite(diameter) || !Number.isFinite(opacity) || !Number.isFinite(spacing)) {
      return null;
    }
    const canonical = `${parsed.presetId}|${diameter}|${opacity}|${spacing}`;
    if (computeFnv1aHex(canonical) !== parsed.checksumHex) return null;
    return {
      schema: "toonstudio.qr-brush.v1",
      presetId: parsed.presetId as ComicRibbonStampPresetId,
      baseDiameterPx: diameter,
      opacity01: opacity,
      spacingRatio: spacing,
      checksumHex: parsed.checksumHex,
    };
  } catch {
    return null;
  }
}

export interface PhotoshopMixerBrushConfig {
  readonly wet01: number;
  readonly load01: number;
  readonly mix01: number;
  readonly flow01: number;
  readonly autoClean?: boolean;
}

export interface PhotoshopMixerBrushStepResult {
  readonly canvasRgb01: readonly [number, number, number];
  readonly reservoirRgb01: readonly [number, number, number];
  readonly effectiveTransfer01: number;
}

export function stepPhotoshopMixerBrushReservoir(
  config: PhotoshopMixerBrushConfig,
  canvasRgb01: readonly [number, number, number],
  reservoirRgb01: readonly [number, number, number],
  pickupColorRgb01: readonly [number, number, number],
): PhotoshopMixerBrushStepResult {
  const wet = clamp01(config.wet01);
  const load = clamp01(config.load01);
  const mix = clamp01(config.mix01);
  const flow = clamp01(config.flow01);

  const baseReservoir: [number, number, number] = config.autoClean
    ? [clamp01(pickupColorRgb01[0]), clamp01(pickupColorRgb01[1]), clamp01(pickupColorRgb01[2])]
    : [
        clamp01(reservoirRgb01[0] * (1 - load * 0.35) + pickupColorRgb01[0] * (load * 0.35)),
        clamp01(reservoirRgb01[1] * (1 - load * 0.35) + pickupColorRgb01[1] * (load * 0.35)),
        clamp01(reservoirRgb01[2] * (1 - load * 0.35) + pickupColorRgb01[2] * (load * 0.35)),
      ];
  const pickupWeight = wet * mix;
  const nextReservoir: [number, number, number] = [
    clamp01(baseReservoir[0] * (1 - pickupWeight) + clamp01(canvasRgb01[0]) * pickupWeight),
    clamp01(baseReservoir[1] * (1 - pickupWeight) + clamp01(canvasRgb01[1]) * pickupWeight),
    clamp01(baseReservoir[2] * (1 - pickupWeight) + clamp01(canvasRgb01[2]) * pickupWeight),
  ];
  const effectiveTransfer01 = clamp01(flow * (0.35 + 0.65 * load));
  const nextCanvas: [number, number, number] = [
    clamp01(clamp01(canvasRgb01[0]) * (1 - effectiveTransfer01) + nextReservoir[0] * effectiveTransfer01),
    clamp01(clamp01(canvasRgb01[1]) * (1 - effectiveTransfer01) + nextReservoir[1] * effectiveTransfer01),
    clamp01(clamp01(canvasRgb01[2]) * (1 - effectiveTransfer01) + nextReservoir[2] * effectiveTransfer01),
  ];
  return { canvasRgb01: nextCanvas, reservoirRgb01: nextReservoir, effectiveTransfer01 };
}

export interface SaiVer2WatercolorParams {
  readonly pressure01: number;
  readonly minDensity01: number;
  readonly waterBlending01: number;
  readonly blurPressureThreshold01: number;
  readonly edgeHardness01: number;
}

export interface SaiVer2WatercolorEvaluation {
  readonly mode: "blur-blend-only" | "pigment-deposit";
  readonly pigmentDepositAlpha01: number;
  readonly blurKernelStrength01: number;
  readonly fringeEdgeBoost01: number;
}

export function evaluateSaiVer2BrushStep(params: SaiVer2WatercolorParams): SaiVer2WatercolorEvaluation {
  const p = clamp01(params.pressure01);
  const threshold = clampRange(params.blurPressureThreshold01, 0.05, 0.85, 0.28);
  const minDensity = clamp01(params.minDensity01);
  const waterBlend = clamp01(params.waterBlending01);
  const edgeHardness = clamp01(params.edgeHardness01);

  if (p <= threshold) {
    const ratio = p / Math.max(0.01, threshold);
    return {
      mode: "blur-blend-only",
      pigmentDepositAlpha01: 0,
      blurKernelStrength01: clamp01(waterBlend * (0.45 + 0.55 * (1 - ratio))),
      fringeEdgeBoost01: clamp01(edgeHardness * 0.25),
    };
  }
  const normalizedAbove = (p - threshold) / Math.max(0.01, 1 - threshold);
  return {
    mode: "pigment-deposit",
    pigmentDepositAlpha01: clamp01(minDensity + (1 - minDensity) * normalizedAbove),
    blurKernelStrength01: clamp01(waterBlend * (1 - normalizedAbove * 0.65)),
    fringeEdgeBoost01: clamp01(edgeHardness * (0.3 + 0.7 * normalizedAbove)),
  };
}

export interface ConceptsNudgeSliceResult {
  readonly nudgedPoints: readonly CommercialBrushPoint2D[];
  readonly slicedSegments: readonly (readonly [CommercialBrushPoint2D, CommercialBrushPoint2D])[];
}

export function applyConceptsNudgeAndSlice(params: {
  readonly strokePoints: readonly CommercialBrushPoint2D[];
  readonly nudgeCenter: CommercialBrushPoint2D;
  readonly nudgeDeltaX: number;
  readonly nudgeDeltaY: number;
  readonly nudgeRadiusPx: number;
  readonly sliceY?: number;
}): ConceptsNudgeSliceResult {
  const radius = Math.max(1, params.nudgeRadiusPx);
  const nudgedPoints = params.strokePoints.map((pt) => {
    const dist = Math.hypot(pt.x - params.nudgeCenter.x, pt.y - params.nudgeCenter.y);
    if (dist >= radius) return pt;
    const falloff = Math.pow(1 - dist / radius, 2);
    return { ...pt, x: pt.x + params.nudgeDeltaX * falloff, y: pt.y + params.nudgeDeltaY * falloff };
  });
  const slicedSegments: [CommercialBrushPoint2D, CommercialBrushPoint2D][] = [];
  for (let i = 1; i < nudgedPoints.length; i += 1) {
    const a = nudgedPoints[i - 1];
    const b = nudgedPoints[i];
    if (params.sliceY !== undefined && Number.isFinite(params.sliceY)) {
      if ((a.y < params.sliceY && b.y > params.sliceY) || (a.y > params.sliceY && b.y < params.sliceY)) {
        continue;
      }
    }
    slicedSegments.push([a, b]);
  }
  return { nudgedPoints, slicedSegments };
}

export type JsPaintBrushShapeKind = "circle" | "square" | "diagonal" | "reverse_diagonal";

export function generateJsPaintBrushMask(
  shape: JsPaintBrushShapeKind,
  diameterPx: number,
): readonly { readonly dx: number; readonly dy: number }[] {
  const size = Math.max(1, Math.min(32, Math.round(diameterPx)));
  const half = Math.floor(size / 2);
  const stamps: { readonly dx: number; readonly dy: number }[] = [];
  if (shape === "diagonal" || shape === "reverse_diagonal") {
    for (let i = 0; i < size; i += 1) {
      stamps.push({ dx: -half + i, dy: shape === "diagonal" ? half - i : -half + i });
    }
    return stamps;
  }
  const rSq = (size / 2) * (size / 2);
  for (let dy = -half; dy <= size - 1 - half; dy += 1) {
    for (let dx = -half; dx <= size - 1 - half; dx += 1) {
      if (shape === "square" || dx * dx + dy * dy <= rSq + 0.25) stamps.push({ dx, dy });
    }
  }
  return stamps;
}

export function filterPixelPerfectStroke(
  pixels: readonly { readonly x: number; readonly y: number }[],
): readonly { readonly x: number; readonly y: number }[] {
  if (pixels.length < 3) return [...pixels];
  const filtered: { readonly x: number; readonly y: number }[] = [pixels[0]];
  let c = 1;
  while (c < pixels.length - 1) {
    const prev = filtered[filtered.length - 1];
    const curr = pixels[c];
    const next = pixels[c + 1];
    const isLCorner =
      Math.abs(prev.x - curr.x) + Math.abs(prev.y - curr.y) === 1 &&
      Math.abs(curr.x - next.x) + Math.abs(curr.y - next.y) === 1 &&
      prev.x !== next.x &&
      prev.y !== next.y;
    if (isLCorner) {
      filtered.push(next);
      c += 2;
    } else {
      filtered.push(curr);
      c += 1;
    }
  }
  if (c === pixels.length - 1) filtered.push(pixels[pixels.length - 1]);
  return filtered;
}

const BAYER_4X4_MATRIX: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

export function evaluateBayerDitherBrushMask(x: number, y: number, density01: number): boolean {
  const d = clamp01(density01);
  if (d <= 0) return false;
  if (d >= 1) return true;
  return d * 16 > BAYER_4X4_MATRIX[((Math.trunc(y) % 4) + 4) % 4][((Math.trunc(x) % 4) + 4) % 4];
}
