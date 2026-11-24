/**
 * Wave 38F — 극한의 브러시 질감 타입 계약 및 3채널 종이 요철 하이트맵(height · absorbency · anisotropy) 엔진.
 */

export type PaperPresetId =
  | "cold-press-cotton"
  | "rough-watercolor"
  | "kent-webtoon-smooth"
  | "canvas-linen-weave";

export interface PaperPresetSpec {
  readonly id: PaperPresetId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly baseRoughness: number;
  readonly baseAbsorbency: number;
  readonly baseAnisotropy: number;
  readonly grainAngleRad: number;
  readonly frequencyScale: number;
  readonly weaveHarmonic: number;
}

export interface PaperHeightmap3Channel {
  readonly presetId: PaperPresetId;
  readonly labelKo: string;
  readonly width: number;
  readonly height: number;
  readonly heightField: Float32Array;
  readonly absorbencyField: Float32Array;
  readonly anisotropyField: Float32Array;
  readonly grainAngleRad: number;
  readonly peakMean: number;
  readonly valleyMean: number;
  readonly roughnessIndex: number;
}

export interface PaperChannelSample {
  readonly height: number;
  readonly absorbency: number;
  readonly anisotropy: number;
}

export interface PaperTransferInput {
  readonly paper: PaperChannelSample;
  readonly pressure: number;
  readonly wetness: number;
  readonly toothThreshold?: number;
  readonly strokeAngleRad?: number;
  readonly grainAngleRad?: number;
}

export interface PaperTransferResult {
  readonly totalTransfer: number;
  readonly peakContribution: number;
  readonly valleyContribution: number;
  readonly capillaryAbsorption: number;
  readonly anisotropyCatch: number;
  readonly granulationWeight: number;
}

export interface BrushOklchPigment {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export interface ImpastoBuffer25D {
  readonly width: number;
  readonly height: number;
  readonly thickness: Float32Array;
  readonly pigmentL: Float32Array;
  readonly pigmentC: Float32Array;
  readonly pigmentH: Float32Array;
  readonly wetnessMap: Float32Array;
  readonly peakThickness: number;
  readonly meanThickness: number;
  readonly coverageRatio: number;
}

export interface RakingLightConfig {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly intensity: number;
  readonly specularPower: number;
  readonly specularStrength: number;
  readonly ambientStrength: number;
  readonly reliefScale: number;
}

export interface SobelNormalResult {
  readonly width: number;
  readonly height: number;
  readonly normals: Float32Array;
  readonly maxSlope: number;
  readonly meanDeviationDeg: number;
  readonly nonFlatRatio: number;
}

export interface ImpastoShadingResult {
  readonly width: number;
  readonly height: number;
  readonly luminance: Float32Array;
  readonly specular: Float32Array;
  readonly normals: Float32Array;
  readonly luminanceVariance: number;
  readonly luminanceRange: number;
  readonly peakSpecular: number;
  readonly meanNormalDeviationDeg: number;
}

export interface BristleClusterConfig {
  readonly bristleCount: number;
  readonly brushRadiusPx: number;
  readonly stiffness: number;
  readonly splayFactor: number;
  readonly clumpiness: number;
  readonly tiltRad: number;
  readonly azimuthRad: number;
}

export interface BristleStrand {
  readonly index: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly widthPx: number;
  readonly inkLoad: number;
  readonly contactWeight: number;
  readonly ridgeHeight: number;
}

export interface BristleSplayResult {
  readonly strands: readonly BristleStrand[];
  readonly activeStrandCount: number;
  readonly effectiveSpanPx: number;
  readonly meanInkLoad: number;
  readonly splayRatio: number;
}

export interface GPenNibConfig {
  readonly baseWidthPx: number;
  readonly maxSplitPx: number;
  readonly elasticity: number;
  readonly splitThresholdPressure: number;
  readonly asymmetryBias: number;
  readonly inkViscosity: number;
}

export interface GPenTineSplitResult {
  readonly tineSeparationPx: number;
  readonly leftTineOffsetPx: number;
  readonly rightTineOffsetPx: number;
  readonly totalStrokeWidthPx: number;
  readonly meniscusIntact: boolean;
  readonly railroadGapRatio: number;
  readonly springRestoreForce: number;
  readonly snapBackSharpness: number;
}

export interface InkStarvationConfig {
  readonly initialInkLoad: number;
  readonly depletionRate: number;
  readonly dryThreshold: number;
  readonly paperAbsorbencyFactor: number;
}

export interface InkPoolingResult {
  readonly poolingFactor: number;
  readonly haloDarkening: number;
  readonly edgeFeatherPx: number;
  readonly dwellBoost: number;
}

export interface PencilTipWearState {
  readonly initialSharpnessMm: number;
  readonly currentFlatWidthMm: number;
  readonly maxFlatWidthMm: number;
  readonly accumulatedDistancePx: number;
  readonly bevelAngleRad: number;
  readonly wearRate: number;
  readonly sharpnessRatio: number;
  readonly graphiteTransferBoost: number;
}

export interface BrushStrokeSamplePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltRad: number;
  readonly velocityPxPerSec: number;
  readonly timestampMs: number;
}

export interface ExtremeBrushStrokeParams {
  readonly presetId: PaperPresetId;
  readonly width: number;
  readonly height: number;
  readonly wetness: number;
  readonly bristleCount: number;
  readonly brushRadiusPx: number;
  readonly impastoLoad: number;
  readonly nibConfig: GPenNibConfig;
  readonly rakingLight: RakingLightConfig;
  readonly pigmentOklch: BrushOklchPigment;
  readonly initialWearMm?: number;
}

export interface ExtremeBrushStrokeSampleMetrics {
  readonly distancePx: number;
  readonly inkReserve: number;
  readonly starvationBreakup: number;
  readonly pooling: InkPoolingResult;
  readonly tineSplit: GPenTineSplitResult;
  readonly transfer: PaperTransferResult;
  readonly tipFlatWidthMm: number;
}

export interface ExtremeBrushStrokeResult {
  readonly paper: PaperHeightmap3Channel;
  readonly impasto: ImpastoBuffer25D;
  readonly shading: ImpastoShadingResult;
  readonly finalBristles: BristleSplayResult;
  readonly finalTipWear: PencilTipWearState;
  readonly peakTineSplitPx: number;
  readonly endInkReserve: number;
  readonly maxStarvationBreakup: number;
  readonly endPoolingFactor: number;
  readonly samples: readonly ExtremeBrushStrokeSampleMetrics[];
}

export const PAPER_PRESETS: readonly PaperPresetSpec[] = [
  {
    id: "cold-press-cotton",
    labelKo: "황목 코튼 300g",
    summaryKo: "균형 잡힌 산마루 요철과 높은 습식 모세관 흡수력",
    baseRoughness: 0.68,
    baseAbsorbency: 0.78,
    baseAnisotropy: 0.32,
    grainAngleRad: 0.28,
    frequencyScale: 1.15,
    weaveHarmonic: 0.12,
  },
  {
    id: "rough-watercolor",
    labelKo: "거친 수채 황목",
    summaryKo: "깊은 골짜기 과립화와 극적인 건식 갈필 질감",
    baseRoughness: 0.92,
    baseAbsorbency: 0.88,
    baseAnisotropy: 0.25,
    grainAngleRad: 0.55,
    frequencyScale: 0.85,
    weaveHarmonic: 0.08,
  },
  {
    id: "kent-webtoon-smooth",
    labelKo: "켄트 웹툰 원고지",
    summaryKo: "매끄러운 잉크 활주와 날카로운 G펜 닙 선명도",
    baseRoughness: 0.22,
    baseAbsorbency: 0.34,
    baseAnisotropy: 0.14,
    grainAngleRad: 0.05,
    frequencyScale: 2.1,
    weaveHarmonic: 0.04,
  },
  {
    id: "canvas-linen-weave",
    labelKo: "리넨 유화 캔버스",
    summaryKo: "강한 직교 씨실·날실 이방성과 두꺼운 임파스토 안착",
    baseRoughness: 0.82,
    baseAbsorbency: 0.52,
    baseAnisotropy: 0.86,
    grainAngleRad: 0.0,
    frequencyScale: 1.45,
    weaveHarmonic: 0.68,
  },
] as const;

export const DEFAULT_GPEN_NIB_CONFIG: GPenNibConfig = {
  baseWidthPx: 1.4,
  maxSplitPx: 6.8,
  elasticity: 0.62,
  splitThresholdPressure: 0.24,
  asymmetryBias: 0.08,
  inkViscosity: 0.64,
};

export const DEFAULT_RAKING_LIGHT_CONFIG: RakingLightConfig = {
  azimuthDeg: 38,
  elevationDeg: 24,
  intensity: 1.15,
  specularPower: 28,
  specularStrength: 0.48,
  ambientStrength: 0.34,
  reliefScale: 2.6,
};

export const DEFAULT_BRUSH_PIGMENT_OKLCH: BrushOklchPigment = {
  l: 0.42,
  c: 0.14,
  h: 258,
};

const FALLBACK_PAPER_PRESET: PaperPresetSpec = {
  id: "cold-press-cotton",
  labelKo: "황목 코튼 300g",
  summaryKo: "균형 잡힌 산마루 요철과 높은 습식 모세관 흡수력",
  baseRoughness: 0.68,
  baseAbsorbency: 0.78,
  baseAnisotropy: 0.32,
  grainAngleRad: 0.28,
  frequencyScale: 1.15,
  weaveHarmonic: 0.12,
};

export function clampBrushNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function hashBrush2d(ix: number, iy: number, seed: number): number {
  const n = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

export function smoothstepBrush(edge0: number, edge1: number, x: number): number {
  if (Math.abs(edge1 - edge0) < 1e-6) return x >= edge1 ? 1 : 0;
  const t = clampBrushNumber((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function valueNoise2d(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hashBrush2d(ix, iy, seed);
  const b = hashBrush2d(ix + 1, iy, seed);
  const c = hashBrush2d(ix, iy + 1, seed);
  const d = hashBrush2d(ix + 1, iy + 1, seed);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm2d(x: number, y: number, seed: number): number {
  let sum = 0;
  let amp = 0.54;
  let freq = 1;
  let norm = 0;
  for (let octave = 0; octave < 4; octave += 1) {
    sum += valueNoise2d(x * freq, y * freq, seed + octave * 19.3) * amp;
    norm += amp;
    freq *= 2.04;
    amp *= 0.48;
  }
  return norm > 0 ? sum / norm : 0.5;
}

export function getPaperPresetSpec(presetId: PaperPresetId): PaperPresetSpec {
  return PAPER_PRESETS.find((p) => p.id === presetId) ?? PAPER_PRESETS[0] ?? FALLBACK_PAPER_PRESET;
}

/**
 * 3채널(height · absorbency · anisotropy) 결정론적 종이 요철 하이트맵을 생성한다.
 */
export function createPaperHeightmap3Channel(
  presetId: PaperPresetId = "cold-press-cotton",
  width = 64,
  height = 64,
  seed = 42,
): PaperHeightmap3Channel {
  const spec = getPaperPresetSpec(presetId);
  const safeW = Math.max(8, Math.floor(width));
  const safeH = Math.max(8, Math.floor(height));
  const total = safeW * safeH;

  const heightField = new Float32Array(total);
  const absorbencyField = new Float32Array(total);
  const anisotropyField = new Float32Array(total);

  const cosA = Math.cos(spec.grainAngleRad);
  const sinA = Math.sin(spec.grainAngleRad);
  let peakSum = 0;
  let peakCount = 0;
  let valleySum = 0;
  let valleyCount = 0;
  let sumH = 0;
  let sumH2 = 0;

  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      const idx = y * safeW + x;
      const nx = (x / safeW) * 8 * spec.frequencyScale;
      const ny = (y / safeH) * 8 * spec.frequencyScale;
      const rx = nx * cosA - ny * sinA;
      const ry = nx * sinA + ny * cosA;

      const baseNoise = fbm2d(rx * 1.15, ry * 0.82, seed);
      const fiberWave =
        0.5 +
        0.5 *
          Math.sin(rx * Math.PI * 2.2) *
          Math.cos(ry * Math.PI * (1.2 + spec.weaveHarmonic * 1.8));
      const fineTooth = valueNoise2d(nx * 3.8, ny * 3.8, seed + 91.7);

      const rawElevation =
        baseNoise * (1 - spec.weaveHarmonic * 0.55) +
        fiberWave * (spec.weaveHarmonic * 0.55) +
        (fineTooth - 0.5) * 0.22;

      const centered = 0.5 + (rawElevation - 0.5) * (0.45 + spec.baseRoughness * 0.85);
      const hVal = clampBrushNumber(centered, 0.02, 0.99);
      heightField[idx] = hVal;

      const poreNoise = valueNoise2d(nx * 2.6, ny * 2.6, seed + 173.1);
      absorbencyField[idx] = clampBrushNumber(
        spec.baseAbsorbency * (0.72 + (1 - hVal) * 0.42) + (poreNoise - 0.5) * 0.12,
        0.04,
        1,
      );

      const ridgeGradient = Math.abs(Math.cos(rx * Math.PI * 2.2));
      anisotropyField[idx] = clampBrushNumber(
        spec.baseAnisotropy * (0.65 + 0.35 * ridgeGradient) + (fineTooth - 0.5) * 0.08,
        0.02,
        1,
      );

      sumH += hVal;
      sumH2 += hVal * hVal;
      if (hVal >= 0.5) {
        peakSum += hVal;
        peakCount += 1;
      } else {
        valleySum += hVal;
        valleyCount += 1;
      }
    }
  }

  const meanH = sumH / total;
  const varianceH = Math.max(0, sumH2 / total - meanH * meanH);

  return {
    presetId: spec.id,
    labelKo: spec.labelKo,
    width: safeW,
    height: safeH,
    heightField,
    absorbencyField,
    anisotropyField,
    grainAngleRad: spec.grainAngleRad,
    peakMean: peakCount > 0 ? peakSum / peakCount : 0.65,
    valleyMean: valleyCount > 0 ? valleySum / valleyCount : 0.35,
    roughnessIndex: clampBrushNumber(Math.sqrt(varianceH) * 3.2, 0, 1),
  };
}

/**
 * UV 좌표(타일링 래핑)에서 3채널 종이 속성을 쌍선형 보간한다.
 */
export function samplePaperChannel(
  map: PaperHeightmap3Channel,
  u: number,
  v: number,
): PaperChannelSample {
  const wu = ((u % 1) + 1) % 1;
  const wv = ((v % 1) + 1) % 1;
  const fx = wu * map.width;
  const fy = wv * map.height;
  const x0 = Math.floor(fx) % map.width;
  const y0 = Math.floor(fy) % map.height;
  const x1 = (x0 + 1) % map.width;
  const y1 = (y0 + 1) % map.height;
  const tx = fx - Math.floor(fx);
  const ty = fy - Math.floor(fy);

  const sampleField = (field: Float32Array): number => {
    const v00 = field[y0 * map.width + x0] ?? 0.5;
    const v10 = field[y0 * map.width + x1] ?? 0.5;
    const v01 = field[y1 * map.width + x0] ?? 0.5;
    const v11 = field[y1 * map.width + x1] ?? 0.5;
    const top = v00 + (v10 - v00) * tx;
    const bot = v01 + (v11 - v01) * tx;
    return top + (bot - top) * ty;
  };

  return {
    height: sampleField(map.heightField),
    absorbency: sampleField(map.absorbencyField),
    anisotropy: sampleField(map.anisotropyField),
  };
}

/**
 * 필압과 습도에 따른 종이 산마루(peak)↔골짜기(valley) 건식/습식 안료 전사율을 계산한다.
 */
export function computePaperTransfer(input: PaperTransferInput): PaperTransferResult {
  const pressure = clampBrushNumber(input.pressure, 0, 1);
  const wetness = clampBrushNumber(input.wetness, 0, 1);
  const h = clampBrushNumber(input.paper.height, 0, 1);
  const absorbency = clampBrushNumber(input.paper.absorbency, 0, 1);
  const anisotropy = clampBrushNumber(input.paper.anisotropy, 0, 1);
  const toothBias = clampBrushNumber(input.toothThreshold ?? 0.5, 0.05, 0.95);

  const strokeAngle = input.strokeAngleRad ?? 0;
  const grainAngle = input.grainAngleRad ?? 0;
  const crossGrainFactor = Math.abs(Math.sin(strokeAngle - grainAngle));
  const anisotropyCatch = clampBrushNumber(crossGrainFactor * anisotropy * 0.35, 0, 0.35);

  const dryDepthReach = Math.pow(pressure, 0.78);
  const effectiveThreshold = clampBrushNumber(
    (1 - dryDepthReach) * (0.62 + 0.38 * toothBias),
    0,
    0.96,
  );
  const contactMargin = h + anisotropyCatch * 0.45 - effectiveThreshold;
  const peakEngage = smoothstepBrush(-0.22, 0.28, contactMargin);
  const dryTransfer = clampBrushNumber(
    pressure * (0.28 + 0.72 * peakEngage) + pressure * h * 0.14,
    0,
    1,
  );

  const valleyDepth = 1 - h;
  const capillaryAbsorption = clampBrushNumber(
    wetness * absorbency * (0.35 + 0.65 * valleyDepth) * (0.4 + 0.6 * pressure),
    0,
    1,
  );
  const wetBaseCoverage = clampBrushNumber(
    wetness * (0.25 + 0.75 * Math.pow(pressure, 0.65)) * (0.55 + 0.45 * absorbency),
    0,
    1,
  );

  const peakContribution = clampBrushNumber(
    dryTransfer * (1 - 0.35 * wetness) * (0.35 + 0.65 * h),
    0,
    1,
  );
  const valleyContribution = clampBrushNumber(
    capillaryAbsorption * 0.78 +
      smoothstepBrush(0.45, 0.98, pressure) * valleyDepth * (0.42 + 0.35 * wetness),
    0,
    1,
  );

  const totalTransfer = clampBrushNumber(
    dryTransfer * (1 - wetness * 0.52) +
      Math.max(wetBaseCoverage, capillaryAbsorption) * (0.58 + 0.42 * wetness) * wetness +
      valleyContribution * 0.24,
    0,
    1,
  );
  const granulationWeight = clampBrushNumber(wetness * valleyDepth * absorbency * 1.25, 0, 1);

  return {
    totalTransfer,
    peakContribution,
    valleyContribution,
    capillaryAbsorption,
    anisotropyCatch,
    granulationWeight,
  };
}
