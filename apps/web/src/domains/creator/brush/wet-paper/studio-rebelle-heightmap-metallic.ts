/**
 * Rebelle 7급 물리 종이 높이맵 · 유체 수채화 · 메탈릭 피그먼트 합성 엔진 (`T-019`).
 *
 * - 절차적 3종 종이 높이맵(황목 `cold-press` · 중목 `hot-press` · 캔버스 직물 `linen-canvas`)을
 *   결정적 수식(`studio-wet-paper-math`)만으로 생성해 `Float32Array`(0..1 높이 + 3채널 단위 법선)를 제공한다.
 * - 높이맵 계곡(valley) 침강과 젖음 경계 물감 띠(cauliflower / edge granulation)를 모세관·증발 스텝으로 시뮬레이션한다.
 * - 금 · 은 · 에메랄드 · 로즈골드 4종 메탈릭 피그먼트의 운모(mica) 미세면 스펙큘러·프레넬 셰이딩을 합성한다.
 */

import {
  STUDIO_FLUID_WATERCOLOR_WGSL,
  STUDIO_IMPASTO_RAKING_LIGHT_WGSL,
  createFluidWatercolorGrid,
  depositFluidWatercolorDab,
  evaluateBrushTextureMaxStep,
  measureFluidWatercolorDiagnostics,
  renderFluidWatercolorRgba,
  stepFluidWatercolorCpu,
  type FluidPaperGrainPreset,
  type FluidWatercolorDiagnostics,
  type FluidWatercolorSimParams,
} from "../../imaging-pro";

import {
  clamp01,
  clampNumber,
  detCos,
  detExp,
  detLn,
  detSin,
  smoothstep,
  wetPaperHash01,
  wetPaperValueNoise,
} from "./studio-wet-paper-math";

export type RebellePaperPresetId = "cold-press" | "hot-press" | "linen-canvas";
export type MetallicPigmentId = "gold" | "silver" | "emerald" | "rose-gold";
export type OptionalMetallicPigmentId = MetallicPigmentId | "none";

export interface RebelleRgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface RebellePaperPresetDescriptor {
  readonly id: RebellePaperPresetId;
  readonly label: string;
  readonly description: string;
  readonly reliefStrength: number;
  readonly granulationAffinity: number;
  readonly baseToneRgb: readonly [number, number, number];
}

export interface MetallicPigmentDescriptor {
  readonly id: MetallicPigmentId;
  readonly label: string;
  readonly baseReflectance: readonly [number, number, number];
  readonly iridescenceTint: readonly [number, number, number];
  readonly roughness: number;
  readonly flakeSparkle: number;
}

export const REBELLE_PAPER_PRESETS: Readonly<
  Record<RebellePaperPresetId, RebellePaperPresetDescriptor>
> = Object.freeze({
  "cold-press": Object.freeze({
    id: "cold-press",
    label: "황목 수채화지 (Cold-Press)",
    description: "깊은 요철과 둥근 코튼 골짜기가 안료 입자 침강을 극대화하는 수채 전용지",
    reliefStrength: 3.1,
    granulationAffinity: 0.92,
    baseToneRgb: Object.freeze([0.975, 0.962, 0.935] as const),
  }),
  "hot-press": Object.freeze({
    id: "hot-press",
    label: "중목 수채화지 (Hot-Press)",
    description: "매끄럽게 압착된 표면으로 번짐 경계와 세밀한 선을 깔끔하게 살리는 종이",
    reliefStrength: 1.35,
    granulationAffinity: 0.45,
    baseToneRgb: Object.freeze([0.985, 0.978, 0.962] as const),
  }),
  "linen-canvas": Object.freeze({
    id: "linen-canvas",
    label: "캔버스 직물 (Linen Canvas)",
    description: "날실·씨실 직조 교차 패턴이 물감과 메탈릭 반사광을 직물결로 잡는 린넨 캔버스",
    reliefStrength: 2.65,
    granulationAffinity: 0.78,
    baseToneRgb: Object.freeze([0.955, 0.938, 0.902] as const),
  }),
});

export const METALLIC_PIGMENT_PRESETS: Readonly<
  Record<MetallicPigmentId, MetallicPigmentDescriptor>
> = Object.freeze({
  gold: Object.freeze({
    id: "gold",
    label: "금박 메탈릭 (24K Gold)",
    baseReflectance: Object.freeze([0.98, 0.79, 0.27] as const),
    iridescenceTint: Object.freeze([1.0, 0.91, 0.56] as const),
    roughness: 0.25,
    flakeSparkle: 0.42,
  }),
  silver: Object.freeze({
    id: "silver",
    label: "은박 메탈릭 (Sterling Silver)",
    baseReflectance: Object.freeze([0.92, 0.94, 0.97] as const),
    iridescenceTint: Object.freeze([0.99, 0.99, 1.0] as const),
    roughness: 0.21,
    flakeSparkle: 0.46,
  }),
  emerald: Object.freeze({
    id: "emerald",
    label: "에메랄드 메탈릭 (Emerald Mica)",
    baseReflectance: Object.freeze([0.16, 0.84, 0.55] as const),
    iridescenceTint: Object.freeze([0.42, 0.99, 0.8] as const),
    roughness: 0.28,
    flakeSparkle: 0.48,
  }),
  "rose-gold": Object.freeze({
    id: "rose-gold",
    label: "로즈골드 메탈릭 (Rose Gold)",
    baseReflectance: Object.freeze([0.95, 0.61, 0.55] as const),
    iridescenceTint: Object.freeze([1.0, 0.8, 0.74] as const),
    roughness: 0.26,
    flakeSparkle: 0.44,
  }),
});

export interface RebellePaperHeightmapStats {
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly meanHeight: number;
  readonly roughnessStdDev: number;
}

export interface RebellePaperHeightmap {
  readonly presetId: RebellePaperPresetId;
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly grainScale: number;
  readonly heights: Float32Array;
  readonly normals: Float32Array;
  readonly stats: RebellePaperHeightmapStats;
}

export interface GeneratePaperHeightmapOptions {
  readonly presetId: RebellePaperPresetId;
  readonly width: number;
  readonly height: number;
  readonly seed?: number;
  readonly grainScale?: number;
}

export interface FluidWatercolorFieldState {
  readonly width: number;
  readonly height: number;
  readonly water: Float32Array;
  readonly wetPigment: Float32Array;
  readonly settledPigment: Float32Array;
  readonly metallicLoad: Float32Array;
  readonly washMask: Float32Array;
  readonly pigmentColor: RebelleRgbColor;
  stepCount: number;
  lastDepositCenterX: number;
  lastDepositCenterY: number;
  lastDepositRadius: number;
}

export interface FluidWatercolorDepositOptions {
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  readonly waterAmount?: number;
  readonly pigmentAmount?: number;
  readonly metallicAmount?: number;
}

export interface FluidWatercolorStepOptions {
  readonly flowRate?: number;
  readonly evaporationRate?: number;
  readonly edgeBackrunStrength?: number;
  readonly granulationRate?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
}

export interface CompositeWatercolorMetallicOptions {
  readonly metallicPigment?: OptionalMetallicPigmentId;
  readonly metallicIntensity?: number;
  readonly lightDirection?: readonly [number, number, number];
  readonly paperLightingStrength?: number;
}

export interface RebelleWatercolorMetallicRenderResult {
  readonly width: number;
  readonly height: number;
  readonly presetId: RebellePaperPresetId;
  readonly metallicPigment: OptionalMetallicPigmentId;
  readonly rgba: Uint8ClampedArray;
  readonly valleyPigmentMean: number;
  readonly peakPigmentMean: number;
  readonly valleyToPeakGranulationRatio: number;
  readonly edgeBandPeakDensity: number;
  readonly interiorMeanDensity: number;
  readonly edgeRingContrastRatio: number;
  readonly metallicSpecularHighlightMean: number;
  readonly wetPixelCount: number;
  readonly stepCount: number;
  readonly checksum32: number;
}

export interface RunRebellePreviewOptions {
  readonly presetId: RebellePaperPresetId;
  readonly metallicPigment?: OptionalMetallicPigmentId;
  readonly pigmentColor?: RebelleRgbColor;
  readonly width?: number;
  readonly height?: number;
  readonly seed?: number;
  readonly steps?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
}

const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;
const FOUR_NEIGHBORS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

function clampDimension(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(8, Math.min(512, Math.trunc(value))) : fallback;
}

function fbmNoise(x: number, y: number, seed: number): number {
  const n0 = wetPaperValueNoise(x, y, seed);
  const n1 = wetPaperValueNoise(x * 2.03 + 11.7, y * 2.03 - 5.3, seed ^ 0x1357);
  const n2 = wetPaperValueNoise(x * 4.11 - 3.9, y * 4.11 + 17.1, seed ^ 0x2468);
  return n0 * 0.56 + n1 * 0.3 + n2 * 0.14;
}

function sampleRawPaperHeight(
  presetId: RebellePaperPresetId,
  x: number,
  y: number,
  scale: number,
  seed: number,
): number {
  const sx = x / scale;
  const sy = y / scale;
  if (presetId === "cold-press") {
    const coarse = fbmNoise(sx * 0.42, sy * 0.42, seed);
    const dimple = wetPaperValueNoise(sx * 0.95 + 4.1, sy * 0.95 - 7.4, seed ^ 0x51a3);
    const pit = 1 - Math.abs(2 * dimple - 1);
    const cottonTooth = smoothstep(0.18, 0.88, coarse * 0.65 + pit * pit * 0.35);
    return cottonTooth * 0.84 + wetPaperValueNoise(sx * 2.4, sy * 2.4, seed ^ 0x9b21) * 0.16;
  }
  if (presetId === "hot-press") {
    const roll = fbmNoise(sx * 0.24, sy * 0.24, seed ^ 0x2a11);
    const fiber = wetPaperValueNoise(sx * 1.45, sy * 0.38, seed ^ 0x7713);
    return roll * 0.54 + fiber * 0.28 + wetPaperValueNoise(sx * 2.1, sy * 2.1, seed ^ 0x4431) * 0.18;
  }
  const threadPeriod = 5.4;
  const u = (sx / threadPeriod) * TWO_PI;
  const v = (sy / threadPeriod) * TWO_PI;
  const parity = (Math.floor(sx / threadPeriod) + Math.floor(sy / threadPeriod)) & 1;
  const overWarp = (0.5 + 0.5 * detCos(u)) * (0.68 + 0.32 * detSin(v * 0.5));
  const overWeft = (0.5 + 0.5 * detCos(v)) * (0.68 + 0.32 * detSin(u * 0.5));
  const interlaced =
    parity === 0 ? Math.max(overWarp, overWeft * 0.72) : Math.max(overWeft, overWarp * 0.72);
  return interlaced * 0.76 + fbmNoise(sx * 0.75, sy * 0.75, seed ^ 0x61c8) * 0.24;
}

/** 절차적 3종 종이 높이맵(0..1 `Float32Array`)과 3채널 단위 법선맵을 생성한다. */
export function generateProceduralPaperHeightmap(
  options: GeneratePaperHeightmapOptions,
): RebellePaperHeightmap {
  const preset = REBELLE_PAPER_PRESETS[options.presetId];
  const width = clampDimension(options.width, 64);
  const height = clampDimension(options.height, 64);
  const seed = (options.seed ?? 20261121) | 0;
  const grainScale = clampNumber(options.grainScale ?? 1.0, 0.35, 4.0);
  const total = width * height;
  const raw = new Float32Array(total);
  let rawMin = Number.POSITIVE_INFINITY;
  let rawMax = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = sampleRawPaperHeight(options.presetId, x, y, grainScale, seed);
      raw[y * width + x] = value;
      if (value < rawMin) rawMin = value;
      if (value > rawMax) rawMax = value;
    }
  }

  const [lo, hi]: readonly [number, number] =
    options.presetId === "cold-press"
      ? [0.02, 0.98]
      : options.presetId === "hot-press"
        ? [0.28, 0.74]
        : [0.06, 0.94];
  const invSpan = (hi - lo) / Math.max(1e-5, rawMax - rawMin);
  const heights = new Float32Array(total);
  let minHeight = 1;
  let maxHeight = 0;
  let sum = 0;
  for (let i = 0; i < total; i += 1) {
    const h = clamp01(lo + ((raw[i] ?? 0) - rawMin) * invSpan);
    heights[i] = h;
    if (h < minHeight) minHeight = h;
    if (h > maxHeight) maxHeight = h;
    sum += h;
  }

  const meanHeight = sum / Math.max(1, total);
  let varianceSum = 0;
  for (let i = 0; i < total; i += 1) {
    const d = (heights[i] ?? meanHeight) - meanHeight;
    varianceSum += d * d;
  }

  const normals = new Float32Array(total * 3);
  const strength = preset.reliefStrength;
  for (let y = 0; y < height; y += 1) {
    const ym = y > 0 ? y - 1 : 0;
    const yp = y + 1 < height ? y + 1 : height - 1;
    for (let x = 0; x < width; x += 1) {
      const xm = x > 0 ? x - 1 : 0;
      const xp = x + 1 < width ? x + 1 : width - 1;
      const gx = ((heights[y * width + xm] ?? 0.5) - (heights[y * width + xp] ?? 0.5)) * strength;
      const gy = ((heights[ym * width + x] ?? 0.5) - (heights[yp * width + x] ?? 0.5)) * strength;
      const invLen = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const base = (y * width + x) * 3;
      normals[base] = gx * invLen;
      normals[base + 1] = gy * invLen;
      normals[base + 2] = invLen;
    }
  }

  return Object.freeze({
    presetId: options.presetId,
    label: preset.label,
    width,
    height,
    seed,
    grainScale,
    heights,
    normals,
    stats: Object.freeze({
      minHeight,
      maxHeight,
      meanHeight,
      roughnessStdDev: Math.sqrt(varianceSum / Math.max(1, total)),
    }),
  });
}

/** 유체 수채화 시뮬레이션 필드를 초기화한다. */
export function createFluidWatercolorSimulationState(
  heightmap: RebellePaperHeightmap,
  pigmentColor: RebelleRgbColor = { r: 0.14, g: 0.36, b: 0.68 },
): FluidWatercolorFieldState {
  const total = heightmap.width * heightmap.height;
  return {
    width: heightmap.width,
    height: heightmap.height,
    water: new Float32Array(total),
    wetPigment: new Float32Array(total),
    settledPigment: new Float32Array(total),
    metallicLoad: new Float32Array(total),
    washMask: new Float32Array(total),
    pigmentColor: Object.freeze({
      r: clamp01(pigmentColor.r),
      g: clamp01(pigmentColor.g),
      b: clamp01(pigmentColor.b),
    }),
    stepCount: 0,
    lastDepositCenterX: heightmap.width * 0.5,
    lastDepositCenterY: heightmap.height * 0.5,
    lastDepositRadius: Math.min(heightmap.width, heightmap.height) * 0.32,
  };
}

/** 지정 영역에 수채화 물감·수분·메탈릭 운모 입자를 적재한다. */
export function depositWatercolorWash(
  state: FluidWatercolorFieldState,
  heightmap: RebellePaperHeightmap,
  deposit: FluidWatercolorDepositOptions,
): void {
  const { width, height } = state;
  const radius = Math.max(2, deposit.radius);
  const waterAmount = clampNumber(deposit.waterAmount ?? 0.92, 0.05, 2.5);
  const pigmentAmount = clampNumber(deposit.pigmentAmount ?? 0.72, 0.05, 2.5);
  const metallicAmount = clampNumber(deposit.metallicAmount ?? 0.68, 0, 2.0);
  state.lastDepositCenterX = deposit.centerX;
  state.lastDepositCenterY = deposit.centerY;
  state.lastDepositRadius = radius;

  for (let y = 0; y < height; y += 1) {
    const dy = y - deposit.centerY;
    for (let x = 0; x < width; x += 1) {
      const dx = x - deposit.centerX;
      const normDist = Math.sqrt(dx * dx + dy * dy) / radius;
      if (normDist > 1.05) continue;
      const idx = y * width + x;
      const paperH = heightmap.heights[idx] ?? 0.5;
      const organicRadius = 1.0 + (0.5 - paperH) * 0.14;
      if (normDist > organicRadius) continue;
      const falloff = 1 - smoothstep(0.68 * organicRadius, organicRadius, normDist);
      state.water[idx] = (state.water[idx] ?? 0) + waterAmount * falloff * (0.85 + 0.3 * (1 - paperH));
      state.wetPigment[idx] = (state.wetPigment[idx] ?? 0) + pigmentAmount * falloff;
      state.metallicLoad[idx] = Math.max(state.metallicLoad[idx] ?? 0, metallicAmount * falloff);
      state.washMask[idx] = Math.max(state.washMask[idx] ?? 0, falloff);
    }
  }
}

/**
 * 1스텝 유체 수채화 물리 솔버:
 * 높이맵 계곡(valley) 흐름, 젖음 경계 커피링(cauliflower/edge band) 보충 운송, 오목부 입자 침강을 실행한다.
 */
export function stepFluidWatercolorOnHeightmap(
  state: FluidWatercolorFieldState,
  heightmap: RebellePaperHeightmap,
  options: FluidWatercolorStepOptions = {},
): void {
  const { width, height } = state;
  const total = width * height;
  const preset = REBELLE_PAPER_PRESETS[heightmap.presetId];
  const flowRate = clampNumber(options.flowRate ?? 0.22, 0.02, 0.35);
  const evaporationRate = clampNumber(options.evaporationRate ?? 0.075, 0.005, 0.35);
  const edgeBackrunStrength = clampNumber(options.edgeBackrunStrength ?? 0.34, 0, 0.75);
  const granulationRate = clampNumber(
    options.granulationRate ?? (0.12 + 0.14 * preset.granulationAffinity),
    0.01,
    0.6,
  );
  const tiltX = clampNumber(options.tiltX ?? 0, -0.4, 0.4);
  const tiltY = clampNumber(options.tiltY ?? 0, -0.4, 0.4);

  const nextWater = new Float32Array(state.water);
  const nextWet = new Float32Array(state.wetPigment);
  const nextSettled = new Float32Array(state.settledPigment);
  const nextMetallic = new Float32Array(state.metallicLoad);
  const boundaryScore = new Float32Array(total);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const w = state.water[idx] ?? 0;
      if (w < 0.015) continue;
      const threshold = w * 0.42;
      let dryNeighbors = 0;
      if ((x > 0 ? (state.water[idx - 1] ?? 0) : 0) < threshold) dryNeighbors += 1;
      if ((x + 1 < width ? (state.water[idx + 1] ?? 0) : 0) < threshold) dryNeighbors += 1;
      if ((y > 0 ? (state.water[idx - width] ?? 0) : 0) < threshold) dryNeighbors += 1;
      if ((y + 1 < height ? (state.water[idx + width] ?? 0) : 0) < threshold) dryNeighbors += 1;
      boundaryScore[idx] = dryNeighbors * 0.25;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const w = state.water[idx] ?? 0;
      const wet = state.wetPigment[idx] ?? 0;
      if (w < 0.008 && wet < 0.004) continue;

      const headHere = (heightmap.heights[idx] ?? 0.5) * 0.92 + w * 0.45;
      const bHere = boundaryScore[idx] ?? 0;
      const metal = state.metallicLoad[idx] ?? 0;
      let outW = 0;
      let outP = 0;
      let outM = 0;

      for (let d = 0; d < 4; d += 1) {
        const pair = FOUR_NEIGHBORS[d] as readonly [number, number];
        const nx = x + pair[0];
        const ny = y + pair[1];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        const nW = state.water[nIdx] ?? 0;
        const headNeighbor =
          (heightmap.heights[nIdx] ?? 0.5) * 0.92 + nW * 0.45 - (pair[0] * tiltX + pair[1] * tiltY);
        const headDiff = headHere - headNeighbor;
        if (headDiff > 0 && w > 0.01) {
          const wFlux = Math.min(w * 0.2, headDiff * flowRate * 0.25);
          const pFlux = Math.min(wet * 0.22, wFlux * (wet / Math.max(0.05, w)) * 1.18);
          const mFlux = Math.min(metal * 0.12, wFlux * (metal / Math.max(0.08, w)) * 0.6);
          outW += wFlux;
          outP += pFlux;
          outM += mFlux;
          nextWater[nIdx] = (nextWater[nIdx] ?? 0) + wFlux;
          nextWet[nIdx] = (nextWet[nIdx] ?? 0) + pFlux;
          nextMetallic[nIdx] = (nextMetallic[nIdx] ?? 0) + mFlux;
          if ((nextWater[nIdx] ?? 0) > 0.04) state.washMask[nIdx] = Math.max(state.washMask[nIdx] ?? 0, 0.35);
        }
        const nBoundary = boundaryScore[nIdx] ?? 0;
        if (bHere < 0.05 && nBoundary > 0.15 && wet > 0.01 && edgeBackrunStrength > 0) {
          const ringFlux = Math.min(wet * 0.14, wet * edgeBackrunStrength * nBoundary * 0.28);
          outP += ringFlux;
          nextWet[nIdx] = (nextWet[nIdx] ?? 0) + ringFlux;
        }
      }
      nextWater[idx] = Math.max(0, (nextWater[idx] ?? 0) - outW);
      nextWet[idx] = Math.max(0, (nextWet[idx] ?? 0) - outP);
      nextMetallic[idx] = Math.max(0, (nextMetallic[idx] ?? 0) - outM);
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const w = nextWater[idx] ?? 0;
      const wet = nextWet[idx] ?? 0;
      if (w <= 0 && wet <= 0) continue;
      const h = heightmap.heights[idx] ?? 0.5;
      const avgNeighborH =
        ((x > 0 ? (heightmap.heights[idx - 1] ?? h) : h)
          + (x + 1 < width ? (heightmap.heights[idx + 1] ?? h) : h)
          + (y > 0 ? (heightmap.heights[idx - width] ?? h) : h)
          + (y + 1 < height ? (heightmap.heights[idx + width] ?? h) : h)) * 0.25;
      const concavity = Math.max(0, avgNeighborH - h);
      const valleyDepth = clamp01(1 - h);
      const valleyFactor = valleyDepth * Math.sqrt(valleyDepth);
      const boundary = boundaryScore[idx] ?? 0;

      const remainingWater = Math.max(0, w - evaporationRate * (1 + boundary * 2.1));
      const evapFraction = w > 1e-5 ? clamp01((w - remainingWater) / w) : 1;
      const settleFraction = clamp01(
        granulationRate * (0.3 + 1.35 * valleyFactor + 2.4 * concavity)
          + evapFraction * (0.28 + 0.62 * boundary),
      );
      const deposited = wet * settleFraction;
      nextWater[idx] = remainingWater;
      nextWet[idx] = Math.max(0, wet - deposited);
      nextSettled[idx] = (nextSettled[idx] ?? 0) + deposited;
    }
  }

  state.water.set(nextWater);
  state.wetPigment.set(nextWet);
  state.settledPigment.set(nextSettled);
  state.metallicLoad.set(nextMetallic);
  state.stepCount += 1;
}

function computeFnv1a32(bytes: Uint8ClampedArray): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function normalizeVec3(v: readonly [number, number, number]): readonly [number, number, number] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return len <= 1e-6 ? [0, 0, 1] : [v[0] / len, v[1] / len, v[2] / len];
}

/** 수채화 필드와 4종 메탈릭 피그먼트 스펙큘러 셰이딩을 RGBA8 버퍼로 합성하고 물리 지표를 반환한다. */
export function compositeWatercolorAndMetallicRgba(
  state: FluidWatercolorFieldState,
  heightmap: RebellePaperHeightmap,
  options: CompositeWatercolorMetallicOptions = {},
): RebelleWatercolorMetallicRenderResult {
  const { width, height } = state;
  const total = width * height;
  const preset = REBELLE_PAPER_PRESETS[heightmap.presetId];
  const metallicPigment: OptionalMetallicPigmentId = options.metallicPigment ?? "gold";
  const metallicSpec = metallicPigment === "none" ? null : METALLIC_PIGMENT_PRESETS[metallicPigment];
  const metallicIntensity = clamp01(options.metallicIntensity ?? 0.88);
  const paperLightingStrength = clampNumber(options.paperLightingStrength ?? 0.24, 0, 0.6);

  const light = normalizeVec3(options.lightDirection ?? [-0.42, -0.52, 0.74]);
  const halfVec = normalizeVec3([light[0], light[1], light[2] + 1]);
  const kr = -detLn(Math.max(0.04, state.pigmentColor.r));
  const kg = -detLn(Math.max(0.04, state.pigmentColor.g));
  const kb = -detLn(Math.max(0.04, state.pigmentColor.b));

  const rgba = new Uint8ClampedArray(total * 4);
  let valleySum = 0;
  let valleyCount = 0;
  let peakSum = 0;
  let peakCount = 0;
  let interiorSum = 0;
  let interiorCount = 0;
  let edgeBandPeak = 0;
  let specularBoostSum = 0;
  let wetPixelCount = 0;
  const radius = Math.max(2, state.lastDepositRadius);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const h = heightmap.heights[idx] ?? 0.5;
      const nx = heightmap.normals[idx * 3] ?? 0;
      const ny = heightmap.normals[idx * 3 + 1] ?? 0;
      const nz = heightmap.normals[idx * 3 + 2] ?? 1;

      const ndotl = clamp01(nx * light[0] + ny * light[1] + nz * light[2]);
      const paperShade = 1 - paperLightingStrength * (0.55 - ndotl * 0.72) - (1 - h) * 0.05;
      let r = clamp01(preset.baseToneRgb[0] * paperShade);
      let g = clamp01(preset.baseToneRgb[1] * paperShade);
      let b = clamp01(preset.baseToneRgb[2] * paperShade);

      const density = (state.settledPigment[idx] ?? 0) * 1.18 + (state.wetPigment[idx] ?? 0) * 0.85;
      if (density > 0.002 || (state.washMask[idx] ?? 0) > 0.01) {
        wetPixelCount += 1;
        const opticalD = Math.min(4.2, density * 1.45);
        r *= detExp(-kr * opticalD);
        g *= detExp(-kg * opticalD);
        b *= detExp(-kb * opticalD);
        if (h <= 0.42) {
          valleySum += density;
          valleyCount += 1;
        } else if (h >= 0.58) {
          peakSum += density;
          peakCount += 1;
        }
        const dx = x - state.lastDepositCenterX;
        const dy = y - state.lastDepositCenterY;
        const normDist = Math.sqrt(dx * dx + dy * dy) / radius;
        if (normDist <= 0.55) {
          interiorSum += density;
          interiorCount += 1;
        } else if (normDist >= 0.68 && normDist <= 1.08 && density > edgeBandPeak) {
          edgeBandPeak = density;
        }
      }

      const metalLoad = state.metallicLoad[idx] ?? 0;
      if (metallicSpec && metalLoad > 0.01 && metallicIntensity > 0) {
        const perturb = metallicSpec.flakeSparkle * 0.45;
        const mnx = nx + (wetPaperHash01(heightmap.seed ^ 0x4f19, x, y) - 0.5) * perturb;
        const mny = ny + (wetPaperHash01(heightmap.seed ^ 0x82b3, x, y) - 0.5) * perturb;
        const invM = 1 / Math.sqrt(mnx * mnx + mny * mny + nz * nz);
        const ndoth = clamp01((mnx * halfVec[0] + mny * halfVec[1] + nz * halfVec[2]) * invM);
        const alpha = metallicSpec.roughness * metallicSpec.roughness;
        const alpha2 = alpha * alpha;
        const denom = ndoth * ndoth * (alpha2 - 1) + 1;
        const ggxD = alpha2 / Math.max(1e-4, PI * denom * denom);
        const omv = 1 - clamp01(halfVec[2]);
        const omv2 = omv * omv;
        const fresnel = omv2 * omv2 * omv;

        const coverage = clamp01(metalLoad * metallicIntensity * (0.55 + 0.55 * h));
        const specScale = Math.min(1.35, ggxD * 0.32 * ndotl + 0.16 * ndotl) * coverage;
        const [br, bg, bb] = metallicSpec.baseReflectance;
        const [ir, ig, ib] = metallicSpec.iridescenceTint;
        const specR = (br + (ir - br) * fresnel) * specScale;
        const specG = (bg + (ig - bg) * fresnel) * specScale;
        const specB = (bb + (ib - bb) * fresnel) * specScale;
        const tintMix = coverage * 0.34;
        const lit = 0.45 + 0.55 * ndotl;
        r = clamp01(r * (1 - tintMix) + br * tintMix * lit + specR);
        g = clamp01(g * (1 - tintMix) + bg * tintMix * lit + specG);
        b = clamp01(b * (1 - tintMix) + bb * tintMix * lit + specB);
        specularBoostSum += 0.2126 * specR + 0.7152 * specG + 0.0722 * specB;
      }

      const p = idx * 4;
      rgba[p] = Math.round(r * 255);
      rgba[p + 1] = Math.round(g * 255);
      rgba[p + 2] = Math.round(b * 255);
      rgba[p + 3] = 255;
    }
  }

  const valleyPigmentMean = valleyCount > 0 ? valleySum / valleyCount : 0;
  const peakPigmentMean = peakCount > 0 ? peakSum / peakCount : 0;
  const interiorMeanDensity = interiorCount > 0 ? interiorSum / interiorCount : 0;

  return Object.freeze({
    width,
    height,
    presetId: heightmap.presetId,
    metallicPigment,
    rgba,
    valleyPigmentMean,
    peakPigmentMean,
    valleyToPeakGranulationRatio:
      peakPigmentMean > 1e-5 ? valleyPigmentMean / peakPigmentMean : valleyPigmentMean > 0 ? 1 : 0,
    edgeBandPeakDensity: edgeBandPeak,
    interiorMeanDensity,
    edgeRingContrastRatio: interiorMeanDensity > 1e-5 ? edgeBandPeak / interiorMeanDensity : 0,
    metallicSpecularHighlightMean: wetPixelCount > 0 ? specularBoostSum / wetPixelCount : 0,
    wetPixelCount,
    stepCount: state.stepCount,
    checksum32: computeFnv1a32(rgba),
  });
}

/** 높이맵 생성 → 수채화 워시 적재 → 다중 유체 스텝 → 메탈릭 스펙큘러 합성을 1회 호출로 실행한다. */
export function runRebelleWatercolorMetallicPreview(
  options: RunRebellePreviewOptions,
): RebelleWatercolorMetallicRenderResult {
  const width = clampDimension(options.width ?? 48, 48);
  const height = clampDimension(options.height ?? 48, 48);
  const steps = Math.max(1, Math.min(24, Math.trunc(options.steps ?? 10)));
  const metallicPigment: OptionalMetallicPigmentId = options.metallicPigment ?? "gold";
  const heightmap = generateProceduralPaperHeightmap({
    presetId: options.presetId,
    width,
    height,
    seed: options.seed ?? 20261121,
  });
  const state = createFluidWatercolorSimulationState(
    heightmap,
    options.pigmentColor ?? { r: 0.14, g: 0.34, b: 0.68 },
  );
  depositWatercolorWash(state, heightmap, {
    centerX: width * 0.5,
    centerY: height * 0.5,
    radius: Math.min(width, height) * 0.36,
    waterAmount: 0.96,
    pigmentAmount: 0.78,
    metallicAmount: metallicPigment === "none" ? 0 : 0.82,
  });
  for (let i = 0; i < steps; i += 1) {
    stepFluidWatercolorOnHeightmap(state, heightmap, {
      tiltX: options.tiltX ?? 0.04,
      tiltY: options.tiltY ?? 0.08,
    });
  }
  return compositeWatercolorAndMetallicRgba(state, heightmap, { metallicPigment });
}

export interface RebelleShallowWaterPreviewResult {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly diagnostics: FluidWatercolorDiagnostics;
  readonly wgslShader: string;
}

/**
 * 클린룸 2D Shallow-Water 유체 수채화(WGSL Compute + CPU 동등 엔진)로
 * 중력 기울기·모세관 확산·종이 골짜기 과립화·백런 미리보기를 실행한다.
 */
export function runRebelleShallowWaterFluidPreview(
  options: RunRebellePreviewOptions & {
    readonly simParams?: Partial<FluidWatercolorSimParams>;
  },
): RebelleShallowWaterPreviewResult {
  const width = clampDimension(options.width ?? 48, 48);
  const height = clampDimension(options.height ?? 48, 48);
  const steps = Math.max(1, Math.min(48, Math.trunc(options.steps ?? 10)));
  const paperPreset: FluidPaperGrainPreset =
    options.presetId === "hot-press"
      ? "hot-press"
      : options.presetId === "linen-canvas"
        ? "rough"
        : "cold-press";
  const grid = createFluidWatercolorGrid(width, height, {
    paperPreset,
    seed: options.seed ?? 20261122,
    pigmentColor: options.pigmentColor ?? { r: 0.14, g: 0.34, b: 0.68 },
  });
  depositFluidWatercolorDab(grid, {
    centerX: width * 0.5,
    centerY: height * 0.5,
    radius: Math.min(width, height) * 0.34,
    waterAmount: 0.92,
    pigmentAmount: 0.78,
  });
  stepFluidWatercolorCpu(
    grid,
    {
      gravityX: (options.tiltX ?? 0.04) * 3,
      gravityY: (options.tiltY ?? 0.08) * 3,
      ...options.simParams,
    },
    steps,
  );
  const frame = renderFluidWatercolorRgba(grid);
  return {
    width: frame.width,
    height: frame.height,
    rgba: frame.data,
    diagnostics: measureFluidWatercolorDiagnostics(grid),
    wgslShader: STUDIO_FLUID_WATERCOLOR_WGSL,
  };
}

export { STUDIO_IMPASTO_RAKING_LIGHT_WGSL, evaluateBrushTextureMaxStep };
