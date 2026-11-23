/**
 * 월드 좌표 2층 심리스 종이 높이장 · 블루노이즈 R2 격자 제거 · 기울기 음영 · 듀얼 브러시 3중 합성 엔진.
 * Procreate · Rebelle 7 · Clip Studio Paint 5.0 급 건식/습식 물리 질감의 기반 높이장과 팁 합성 연산을 제공한다.
 */

export const PAPER_TILE_SIZE = 256;
const PAPER_TILE_MASK = PAPER_TILE_SIZE - 1;
const SECONDARY_TILE_SIZE = 128;
const SECONDARY_TILE_MASK = SECONDARY_TILE_SIZE - 1;

/** R2 2D 저불일치 준난수(plastic constant g ≈ 1.3247179572) 상수 */
const R2_ALPHA_X = 0.7548776662466927;
const R2_ALPHA_Y = 0.5698402909980532;
const TAU = Math.PI * 2;

export type PaperPresetId = "kent" | "cold-press" | "rough-cotton" | "sketchbook-tooth" | "linen-canvas";
export type DualBrushTextureMode = "fixed-world" | "rolling-tip";
export type PressureCurvePresetId = "light" | "standard" | "heavy";

export interface PaperPresetSpec {
  readonly id: PaperPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly macroBasePeriod: number;
  readonly macroWeight: number;
  readonly microBasePeriod: number;
  readonly microWeight: number;
  /** 정수 격자 방향 벡터 (심리스 타일링 경계 연속성 보장) */
  readonly fiberDirX: number;
  readonly fiberDirY: number;
  readonly fiberStretch: number;
  readonly weaveWeight: number;
  readonly weavePeriod: number;
  readonly contrastGain: number;
  readonly absorbency: number;
  readonly basePaperRgb: readonly [number, number, number];
}

export interface WorldPaperHeightfieldTile {
  readonly presetId: PaperPresetId;
  readonly seed: number;
  readonly size: number;
  readonly height: Float32Array;
  readonly macro: Float32Array;
  readonly micro: Float32Array;
  readonly mean: number;
  readonly stdDev: number;
  readonly min: number;
  readonly max: number;
}

export interface PaperHeightSampleOptions {
  readonly scale?: number;
  readonly seed?: number;
  readonly bilinear?: boolean;
}

export interface PaperHeightSample {
  readonly height: number;
  readonly macro: number;
  readonly micro: number;
  readonly valleyMask: number;
  readonly peakMask: number;
}

export interface BlueNoiseOffset2D {
  readonly dx: number;
  readonly dy: number;
  readonly angleJitterRad: number;
  readonly phaseU: number;
  readonly phaseV: number;
}

export interface PressureCurvePresetSpec {
  readonly id: PressureCurvePresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly gamma: number;
  readonly lift: number;
}

export interface TiltGrazingInput {
  readonly tiltDeg: number;
  readonly azimuthRad?: number;
  readonly pressure: number;
  readonly paperHeight: number;
  readonly grainHardness?: number;
}

export interface TiltGrazingResult {
  readonly isGrazing: boolean;
  readonly grazingRatio: number;
  readonly majorScale: number;
  readonly minorScale: number;
  readonly ellipseAspect: number;
  readonly peakCatch: number;
  readonly grazingOpacityFactor: number;
  readonly valleySkipMask: number;
}

export interface DualBrushTripleMultiplyInput {
  readonly worldX: number;
  readonly worldY: number;
  readonly dabX: number;
  readonly dabY: number;
  readonly dabRadiusPx: number;
  readonly dabIndex: number;
  readonly strokeDistancePx: number;
  readonly strokeAngleRad?: number;
  readonly pressure: number;
  readonly pressureCurve?: PressureCurvePresetId;
  readonly tiltDeg?: number;
  readonly azimuthRad?: number;
  readonly paperPreset: PaperPresetId;
  readonly paperScale?: number;
  readonly paperToothStrength?: number;
  readonly dualMode: DualBrushTextureMode;
  readonly secondaryScale?: number;
  readonly secondaryContrast?: number;
  readonly tipHardness?: number;
  readonly seed?: number;
}

export interface DualBrushTripleMultiplyResult {
  readonly coverage: number;
  readonly primaryTipSilhouette: number;
  readonly worldPaperTooth: number;
  readonly secondaryTextureMask: number;
  readonly paperHeight: number;
  readonly effectivePressure: number;
  readonly tilt: TiltGrazingResult;
}

export interface DualBrushDabStampParams {
  readonly dabX: number;
  readonly dabY: number;
  readonly dabRadiusPx: number;
  readonly dabIndex: number;
  readonly strokeDistancePx: number;
  readonly strokeAngleRad?: number;
  readonly pressure: number;
  readonly pressureCurve?: PressureCurvePresetId;
  readonly tiltDeg?: number;
  readonly azimuthRad?: number;
  readonly paperPreset: PaperPresetId;
  readonly paperScale?: number;
  readonly paperToothStrength?: number;
  readonly dualMode: DualBrushTextureMode;
  readonly secondaryScale?: number;
  readonly secondaryContrast?: number;
  readonly tipHardness?: number;
  readonly flow?: number;
  readonly pigmentRgb: readonly [number, number, number];
  readonly jitterAmplitudePx?: number;
  readonly seed?: number;
}

export interface DualBrushDabAuxBuffers {
  readonly waxMask?: Float32Array;
  readonly waxDepositRate?: number;
  readonly impastoHeight?: Float32Array;
  readonly impastoThickness?: number;
  readonly wetnessMap?: Float32Array;
  readonly wetnessDeposit?: number;
}

export interface DualBrushDabStampStats {
  readonly stampedPixels: number;
  readonly totalCoverage: number;
  readonly jitteredX: number;
  readonly jitteredY: number;
  readonly boundsMinX: number;
  readonly boundsMinY: number;
  readonly boundsMaxX: number;
  readonly boundsMaxY: number;
}

export const PAPER_PRESETS: Readonly<Record<PaperPresetId, PaperPresetSpec>> = {
  kent: {
    id: "kent", labelKo: "켄트지", labelEn: "Kent Bristol",
    summaryKo: "매끄러운 펜화·잉크용 미세 펄프 결", summaryEn: "Smooth fine-pulp grain for crisp ink work",
    macroBasePeriod: 8, macroWeight: 0.42, microBasePeriod: 32, microWeight: 0.58,
    fiberDirX: 1, fiberDirY: 0, fiberStretch: 1.5, weaveWeight: 0, weavePeriod: 16,
    contrastGain: 0.44, absorbency: 0.38, basePaperRgb: [250, 249, 246],
  },
  "cold-press": {
    id: "cold-press", labelKo: "중목 수채화지", labelEn: "Cold-Press",
    summaryKo: "물감 번짐과 입자 침전이 균형 잡힌 300g 골짜기", summaryEn: "Balanced 300gsm valleys for capillary soak & granulation",
    macroBasePeriod: 8, macroWeight: 0.62, microBasePeriod: 32, microWeight: 0.38,
    fiberDirX: 2, fiberDirY: 1, fiberStretch: 1.8, weaveWeight: 0, weavePeriod: 16,
    contrastGain: 1.08, absorbency: 0.86, basePaperRgb: [248, 244, 236],
  },
  "rough-cotton": {
    id: "rough-cotton", labelKo: "황목 코튼지", labelEn: "Rough Cotton",
    summaryKo: "깊은 요철 봉우리로 건식 긁힘과 물감 고임 극대화", summaryEn: "Deep cotton craters with bold peaks for dry-brush & pooling",
    macroBasePeriod: 8, macroWeight: 0.68, microBasePeriod: 32, microWeight: 0.32,
    fiberDirX: 1, fiberDirY: 1, fiberStretch: 1.4, weaveWeight: 0, weavePeriod: 16,
    contrastGain: 1.52, absorbency: 0.94, basePaperRgb: [246, 241, 231],
  },
  "sketchbook-tooth": {
    id: "sketchbook-tooth", labelKo: "스케치북 크로키", labelEn: "Sketchbook Tooth",
    summaryKo: "연필·목탄 기울기 음영에 특화된 사선 섬유 이빨", summaryEn: "Directional fiber tooth tuned for pencil & charcoal grazing",
    macroBasePeriod: 8, macroWeight: 0.46, microBasePeriod: 32, microWeight: 0.54,
    fiberDirX: 3, fiberDirY: 1, fiberStretch: 2.6, weaveWeight: 0, weavePeriod: 16,
    contrastGain: 0.96, absorbency: 0.56, basePaperRgb: [247, 244, 237],
  },
  "linen-canvas": {
    id: "linen-canvas", labelKo: "린넨 캔버스", labelEn: "Linen Canvas",
    summaryKo: "유화·아크릴 임파스토용 직교 날실/씨실 직조 결", summaryEn: "Woven warp-and-weft linen threads for oil & impasto",
    macroBasePeriod: 8, macroWeight: 0.34, microBasePeriod: 32, microWeight: 0.34,
    fiberDirX: 1, fiberDirY: 0, fiberStretch: 1.2, weaveWeight: 0.32, weavePeriod: 18,
    contrastGain: 1.22, absorbency: 0.42, basePaperRgb: [243, 239, 230],
  },
};

export const PAPER_PRESET_LIST: readonly PaperPresetSpec[] = [
  PAPER_PRESETS.kent,
  PAPER_PRESETS["cold-press"],
  PAPER_PRESETS["rough-cotton"],
  PAPER_PRESETS["sketchbook-tooth"],
  PAPER_PRESETS["linen-canvas"],
];

export const PRESSURE_CURVE_PRESETS: Readonly<Record<PressureCurvePresetId, PressureCurvePresetSpec>> = {
  light: { id: "light", labelKo: "가볍게", labelEn: "Light", gamma: 0.65, lift: 0.08 },
  standard: { id: "standard", labelKo: "표준", labelEn: "Standard", gamma: 1.0, lift: 0.0 },
  heavy: { id: "heavy", labelKo: "강하게", labelEn: "Heavy", gamma: 1.55, lift: -0.04 },
};

export const PRESSURE_CURVE_PRESET_LIST: readonly PressureCurvePresetSpec[] = [
  PRESSURE_CURVE_PRESETS.light,
  PRESSURE_CURVE_PRESETS.standard,
  PRESSURE_CURVE_PRESETS.heavy,
];

const paperTileCache = new Map<string, WorldPaperHeightfieldTile>();
const secondaryTileCache = new Map<number, Float32Array>();

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function quintic(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function hashPeriodic2D(ix: number, iy: number, periodX: number, periodY: number, seed: number): number {
  const wx = ((ix % periodX) + periodX) % periodX;
  const wy = ((iy % periodY) + periodY) % periodY;
  let h =
    Math.imul(wx ^ 0x9e3779b1, 0x85ebca77) ^
    Math.imul(wy ^ 0xc2b2ae3d, 0x27d4eb2f) ^
    Math.imul(seed ^ 0x165667b1, 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967295;
}

function periodicValueNoise2D(u: number, v: number, periodX: number, periodY: number, seed: number): number {
  const sx = u * periodX;
  const sy = v * periodY;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = quintic(sx - x0);
  const fy = quintic(sy - y0);
  const n00 = hashPeriodic2D(x0, y0, periodX, periodY, seed);
  const n10 = hashPeriodic2D(x0 + 1, y0, periodX, periodY, seed);
  const n01 = hashPeriodic2D(x0, y0 + 1, periodX, periodY, seed);
  const n11 = hashPeriodic2D(x0 + 1, y0 + 1, periodX, periodY, seed);
  const nx0 = n00 + (n10 - n00) * fx;
  return nx0 + (n01 + (n11 - n01) * fx - nx0) * fy;
}

function periodicFbm2D(u: number, v: number, basePeriod: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let ampNorm = 0;
  let period = basePeriod;
  for (let oct = 0; oct < octaves; oct += 1) {
    sum += periodicValueNoise2D(u, v, period, period, seed + oct * 97) * amp;
    ampNorm += amp;
    period *= 2;
    amp *= 0.52;
  }
  return ampNorm > 0 ? sum / ampNorm : 0.5;
}

const PRESET_SEED_OFFSET: Readonly<Record<PaperPresetId, number>> = {
  kent: 101,
  "cold-press": 211,
  "rough-cotton": 307,
  "sketchbook-tooth": 409,
  "linen-canvas": 521,
};

function buildPaperHeightfieldTile(presetId: PaperPresetId, seed: number): WorldPaperHeightfieldTile {
  const spec = PAPER_PRESETS[presetId];
  const total = PAPER_TILE_SIZE * PAPER_TILE_SIZE;
  const macro = new Float32Array(total);
  const micro = new Float32Array(total);
  const rawCombined = new Float32Array(total);
  const height = new Float32Array(total);
  const baseSeed = seed + PRESET_SEED_OFFSET[presetId];
  const invSize = 1 / PAPER_TILE_SIZE;

  let rawMean = 0;
  for (let y = 0; y < PAPER_TILE_SIZE; y += 1) {
    const v = y * invSize;
    const rowOffset = y * PAPER_TILE_SIZE;
    for (let x = 0; x < PAPER_TILE_SIZE; x += 1) {
      const u = x * invSize;
      const idx = rowOffset + x;
      // 주기 도메인 워핑으로 직교 노이즈 격자 흔적을 제거하면서 심리스 경계(0↔256)를 100% 유지한다.
      const warpU = (periodicFbm2D(u, v, 4, 2, baseSeed + 313) - 0.5) * 0.085;
      const warpV = (periodicFbm2D(u, v, 4, 2, baseSeed + 557) - 0.5) * 0.085;
      const wu = fract(u + warpU);
      const wv = fract(v + warpV);

      const macroVal = periodicFbm2D(wu, wv, spec.macroBasePeriod, 3, baseSeed);
      macro[idx] = macroVal;

      const along = spec.fiberDirX * wu + spec.fiberDirY * wv;
      const across = -spec.fiberDirY * wu + spec.fiberDirX * wv;
      const pAlong = Math.max(8, Math.round(spec.microBasePeriod / spec.fiberStretch));
      const pAcross = Math.max(16, Math.round(spec.microBasePeriod * 1.5));
      const fiberA = periodicValueNoise2D(along, across, pAlong, pAcross, baseSeed + 701);
      const fiberB = periodicValueNoise2D(wu, wv, spec.microBasePeriod * 2, spec.microBasePeriod * 2, baseSeed + 919);
      let microVal = fiberA * 0.64 + fiberB * 0.36;

      if (spec.weaveWeight > 0) {
        const wJit = (periodicValueNoise2D(wu, wv, 16, 16, baseSeed + 1201) - 0.5) * 0.65;
        const fJit = (periodicValueNoise2D(wu, wv, 16, 16, baseSeed + 1409) - 0.5) * 0.65;
        const gessoSlub = 0.45 + 0.55 * periodicFbm2D(wu, wv, 8, 2, baseSeed + 1607);
        const warp = 0.5 + 0.5 * Math.cos(TAU * (wu * spec.weavePeriod + wJit));
        const weft = 0.5 + 0.5 * Math.cos(TAU * (wv * spec.weavePeriod + fJit));
        const overUnder = 0.5 + 0.5 * Math.cos(TAU * ((wu + wv) * (spec.weavePeriod * 0.5)));
        const weave = (warp * (0.45 + 0.55 * overUnder) + weft * (1 - 0.55 * overUnder) * 0.72) * gessoSlub;
        microVal = clamp01(microVal * 0.58 + clamp01(weave * 0.85) * 0.42);
      }
      micro[idx] = microVal;

      const combined = macroVal * spec.macroWeight + microVal * (spec.microWeight + spec.weaveWeight);
      rawCombined[idx] = combined;
      rawMean += combined;
    }
  }

  rawMean /= total;
  let variance = 0;
  for (let i = 0; i < total; i += 1) {
    const d = (rawCombined[i] ?? rawMean) - rawMean;
    variance += d * d;
  }
  const gain = (0.165 * spec.contrastGain) / Math.max(1e-4, Math.sqrt(variance / total));

  let sum = 0;
  let minVal = 1;
  let maxVal = 0;
  for (let i = 0; i < total; i += 1) {
    const h = clamp01(0.5 + ((rawCombined[i] ?? rawMean) - rawMean) * gain);
    height[i] = h;
    sum += h;
    if (h < minVal) minVal = h;
    if (h > maxVal) maxVal = h;
  }

  const mean = sum / total;
  let finalVar = 0;
  for (let i = 0; i < total; i += 1) {
    const d = (height[i] ?? mean) - mean;
    finalVar += d * d;
  }
  return { presetId, seed, size: PAPER_TILE_SIZE, height, macro, micro, mean, stdDev: Math.sqrt(finalVar / total), min: minVal, max: maxVal };
}

/** 256×256 심리스 종이 높이장 타일 LUT를 사전 생성·캐싱해 반환한다. */
export function getWorldPaperHeightfieldTile(presetId: PaperPresetId, seed = 1337): WorldPaperHeightfieldTile {
  const key = `${presetId}:${seed}`;
  const cached = paperTileCache.get(key);
  if (cached) return cached;
  const tile = buildPaperHeightfieldTile(presetId, seed);
  paperTileCache.set(key, tile);
  return tile;
}

/** 캐싱된 종이 높이장 및 보조 텍스처 LUT를 초기화한다. */
export function clearWorldPaperHeightfieldCache(): void {
  paperTileCache.clear();
  secondaryTileCache.clear();
}

function getSecondaryTextureTile(seed: number): Float32Array {
  const cached = secondaryTileCache.get(seed);
  if (cached) return cached;
  const data = new Float32Array(SECONDARY_TILE_SIZE * SECONDARY_TILE_SIZE);
  const inv = 1 / SECONDARY_TILE_SIZE;
  for (let y = 0; y < SECONDARY_TILE_SIZE; y += 1) {
    const v = y * inv;
    const row = y * SECONDARY_TILE_SIZE;
    for (let x = 0; x < SECONDARY_TILE_SIZE; x += 1) {
      const u = x * inv;
      const wu = fract(u + (periodicFbm2D(u, v, 4, 2, seed + 3079) - 0.5) * 0.14);
      const wv = fract(v + (periodicFbm2D(u, v, 4, 2, seed + 3581) - 0.5) * 0.14);
      const clump = periodicFbm2D(wu, wv, 8, 3, seed + 4099);
      const bristle = periodicValueNoise2D(wu, wv, 32, 16, seed + 5113);
      const pore = periodicValueNoise2D(wu, wv, 64, 64, seed + 6131);
      data[row + x] = clamp01(clump * 0.48 + bristle * 0.34 + pore * 0.18);
    }
  }
  secondaryTileCache.set(seed, data);
  return data;
}

function sampleTileBilinear(data: Float32Array, size: number, mask: number, fx: number, fy: number): number {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const ix0 = x0 & mask;
  const iy0 = y0 & mask;
  const ix1 = (x0 + 1) & mask;
  const iy1 = (y0 + 1) & mask;
  const r0 = iy0 * size;
  const r1 = iy1 * size;
  const v00 = data[r0 + ix0] ?? 0.5;
  const v10 = data[r0 + ix1] ?? 0.5;
  const v01 = data[r1 + ix0] ?? 0.5;
  const v11 = data[r1 + ix1] ?? 0.5;
  const top = v00 + (v10 - v00) * tx;
  return top + (v01 + (v11 - v01) * tx - top) * ty;
}

/** 픽셀 핫루프용 무할당 O(1) 종이 높이 조회 함수. */
export function samplePaperHeightFast(tile: WorldPaperHeightfieldTile, worldX: number, worldY: number, invScale = 1): number {
  return sampleTileBilinear(tile.height, PAPER_TILE_SIZE, PAPER_TILE_MASK, worldX * invScale, worldY * invScale);
}

/** 월드 좌표 (worldX, worldY)에서 2층 심리스 종이 높이장을 O(1) 조회한다. */
export function sampleWorldPaperHeightfield(
  worldX: number,
  worldY: number,
  presetId: PaperPresetId,
  options: PaperHeightSampleOptions = {},
): PaperHeightSample {
  const invScale = 1 / Math.max(0.1, options.scale ?? 1);
  const tile = getWorldPaperHeightfieldTile(presetId, options.seed ?? 1337);
  const fx = worldX * invScale;
  const fy = worldY * invScale;

  if (options.bilinear === false) {
    const idx = (Math.floor(fy) & PAPER_TILE_MASK) * PAPER_TILE_SIZE + (Math.floor(fx) & PAPER_TILE_MASK);
    const height = tile.height[idx] ?? 0.5;
    return { height, macro: tile.macro[idx] ?? 0.5, micro: tile.micro[idx] ?? 0.5, valleyMask: clamp01(1 - height), peakMask: clamp01(height) };
  }

  const height = sampleTileBilinear(tile.height, PAPER_TILE_SIZE, PAPER_TILE_MASK, fx, fy);
  const macro = sampleTileBilinear(tile.macro, PAPER_TILE_SIZE, PAPER_TILE_MASK, fx, fy);
  const micro = sampleTileBilinear(tile.micro, PAPER_TILE_SIZE, PAPER_TILE_MASK, fx, fy);
  return { height, macro, micro, valleyMask: clamp01(1 - height), peakMask: clamp01(height) };
}

/** R2 저불일치 준난수 + Cranley-Patterson 시드 회전으로 팁 스탬핑 격자(lattice) 정렬을 제거한다. */
export function blueNoiseOffset2D(index: number, seed = 2026, amplitude = 1): BlueNoiseOffset2D {
  const safeIndex = Math.max(0, Math.floor(index)) + 1;
  const shiftX = fract(Math.abs(Math.sin(seed * 12.9898 + 78.233)) * 43758.5453);
  const shiftY = fract(Math.abs(Math.sin(seed * 39.3468 + 11.135)) * 24634.6345);
  const u = fract(shiftX + safeIndex * R2_ALPHA_X);
  const v = fract(shiftY + safeIndex * R2_ALPHA_Y);
  const ig = fract(52.9829189 * fract(0.06711056 * (safeIndex + seed * 0.13) + 0.00583715 * (u * 97 + v * 53)));
  return { dx: (u - 0.5) * amplitude, dy: (v - 0.5) * amplitude, angleJitterRad: (ig - 0.5) * TAU, phaseU: u, phaseV: v };
}

/** 3종 필압 커브 프리셋(가볍게 / 표준 / 강하게)을 적용해 유효 필압 [0, 1]을 계산한다. */
export function evaluatePressureCurve(rawPressure: number, presetId: PressureCurvePresetId = "standard"): number {
  const p = clamp01(rawPressure);
  if (p <= 0) return 0;
  const spec = PRESSURE_CURVE_PRESETS[presetId];
  return clamp01(Math.pow(p, spec.gamma) + spec.lift * p * (1 - p));
}

/** 스타일러스 기울기(tiltDeg > 28°)에 따른 접촉 타원 확대 및 종이 봉우리 사선 긁힘 음영을 계산한다. */
export function evaluateTiltGrazingShading(input: TiltGrazingInput): TiltGrazingResult {
  const tilt = Math.max(0, Math.min(85, input.tiltDeg));
  const pressure = clamp01(input.pressure);
  const height = clamp01(input.paperHeight);
  const hardness = clamp01(input.grainHardness ?? 0.65);

  const isGrazing = tilt > 28;
  const grazingRatio = isGrazing ? clamp01((tilt - 28) / (85 - 28)) : 0;
  const majorScale = 1 + grazingRatio * 2.35;
  const minorScale = Math.max(0.48, 1 - grazingRatio * 0.24);
  const ellipseAspect = majorScale / minorScale;

  const threshold = clamp01(0.14 + grazingRatio * 0.44 - pressure * (0.48 - grazingRatio * 0.14) * 0.55);
  const softness = 0.22 - hardness * 0.11;
  const peakCatch = smoothstep(threshold - softness, threshold + softness, height);
  return {
    isGrazing,
    grazingRatio,
    majorScale,
    minorScale,
    ellipseAspect,
    peakCatch,
    grazingOpacityFactor: 1 - grazingRatio * 0.34,
    valleySkipMask: clamp01(grazingRatio * (1 - peakCatch)),
  };
}

/** 듀얼 브러시 3중 합성: Primary Tip Silhouette × World Paper Tooth × Secondary Texture Mask. */
export function evaluateDualBrushTripleMultiply(input: DualBrushTripleMultiplyInput): DualBrushTripleMultiplyResult {
  const radius = Math.max(0.5, input.dabRadiusPx);
  const effectivePressure = evaluatePressureCurve(input.pressure, input.pressureCurve ?? "standard");
  const invPaperScale = 1 / Math.max(0.1, input.paperScale ?? 1);
  const toothStrength = clamp01(input.paperToothStrength ?? 0.85);
  const seed = input.seed ?? 1337;
  const paperHeight = samplePaperHeightFast(getWorldPaperHeightfieldTile(input.paperPreset, seed), input.worldX, input.worldY, invPaperScale);
  const azimuth = input.azimuthRad ?? input.strokeAngleRad ?? 0;

  const tilt = evaluateTiltGrazingShading({
    tiltDeg: input.tiltDeg ?? 12,
    azimuthRad: azimuth,
    pressure: effectivePressure,
    paperHeight,
    grainHardness: input.tipHardness ?? 0.65,
  });

  // 1) Primary Tip Silhouette
  const cosA = Math.cos(-azimuth);
  const sinA = Math.sin(-azimuth);
  const relX = input.worldX - input.dabX;
  const relY = input.worldY - input.dabY;
  const rotX = relX * cosA - relY * sinA;
  const rotY = relX * sinA + relY * cosA;
  const normDist = Math.hypot(rotX / (radius * tilt.majorScale), rotY / (radius * tilt.minorScale));
  const innerEdge = clamp01(input.tipHardness ?? 0.6) * 0.72;
  const primaryTipSilhouette = normDist >= 1 ? 0 : 1 - smoothstep(innerEdge, 1, normDist);

  // 2) World Paper Tooth
  const toothCurve = Math.pow(clamp01(paperHeight * (0.65 + 0.65 * effectivePressure) + (effectivePressure - 0.45) * 0.45), 1.15 - effectivePressure * 0.35);
  const grazingTooth = tilt.isGrazing ? toothCurve * (0.28 + 0.72 * tilt.peakCatch) : toothCurve;
  const worldPaperTooth = clamp01(1 - toothStrength + toothStrength * grazingTooth);

  // 3) Secondary Texture Mask (fixed-world vs rolling-tip 완전 분리)
  const secondaryTile = getSecondaryTextureTile(seed);
  const invSecScale = 1 / Math.max(0.15, input.secondaryScale ?? 1.0);
  let secU: number;
  let secV: number;
  if (input.dualMode === "fixed-world") {
    secU = input.worldX * invSecScale;
    secV = input.worldY * invSecScale;
  } else {
    const jitter = blueNoiseOffset2D(input.dabIndex, seed + 77, 1);
    const rollAngle = (input.strokeAngleRad ?? 0) + jitter.angleJitterRad * 0.45;
    const cR = Math.cos(rollAngle);
    const sR = Math.sin(rollAngle);
    secU = (relX * cR - relY * sR + input.strokeDistancePx * 0.78 + jitter.phaseU * SECONDARY_TILE_SIZE) * invSecScale;
    secV = (relX * sR + relY * cR + input.dabIndex * 17.3 + jitter.phaseV * SECONDARY_TILE_SIZE) * invSecScale;
  }
  const rawSec = sampleTileBilinear(secondaryTile, SECONDARY_TILE_SIZE, SECONDARY_TILE_MASK, secU, secV);
  const secContrast = clamp01(input.secondaryContrast ?? 0.72);
  const shapedSec = clamp01(0.5 + (rawSec - 0.5) * (0.8 + secContrast * 1.6));
  const secondaryTextureMask = clamp01(1 - secContrast * 0.75 + secContrast * 0.75 * shapedSec);
  const coverage = clamp01(primaryTipSilhouette * worldPaperTooth * secondaryTextureMask * (0.18 + 0.82 * effectivePressure) * tilt.grazingOpacityFactor);

  return { coverage, primaryTipSilhouette, worldPaperTooth, secondaryTextureMask, paperHeight, effectivePressure, tilt };
}

/** 실제 Canvas2D/ImageData(Uint8ClampedArray) 버퍼에 듀얼 브러시 3중 합성 dab을 스탬핑한다. */
export function stampDualBrushDabRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  params: DualBrushDabStampParams,
  auxBuffers: DualBrushDabAuxBuffers = {},
): DualBrushDabStampStats {
  const seed = params.seed ?? 1337;
  const jitterAmp = Math.max(0, params.jitterAmplitudePx ?? Math.min(2.2, params.dabRadiusPx * 0.22));
  const jitter = jitterAmp > 0 ? blueNoiseOffset2D(params.dabIndex, seed + 17, jitterAmp) : { dx: 0, dy: 0 };
  const cx = params.dabX + jitter.dx;
  const cy = params.dabY + jitter.dy;

  const tiltPreview = evaluateTiltGrazingShading({
    tiltDeg: params.tiltDeg ?? 12,
    pressure: evaluatePressureCurve(params.pressure, params.pressureCurve ?? "standard"),
    paperHeight: 0.5,
  });
  const reach = Math.ceil(params.dabRadiusPx * tiltPreview.majorScale) + 1;
  const minX = Math.max(0, Math.floor(cx - reach));
  const maxX = Math.min(width - 1, Math.ceil(cx + reach));
  const minY = Math.max(0, Math.floor(cy - reach));
  const maxY = Math.min(height - 1, Math.ceil(cy + reach));

  const flow = clamp01(params.flow ?? 0.85);
  const [pigR, pigG, pigB] = params.pigmentRgb;
  let stampedPixels = 0;
  let totalCoverage = 0;

  for (let py = minY; py <= maxY; py += 1) {
    const row = py * width;
    for (let px = minX; px <= maxX; px += 1) {
      const sample = evaluateDualBrushTripleMultiply({
        worldX: px + 0.5, worldY: py + 0.5, dabX: cx, dabY: cy,
        dabRadiusPx: params.dabRadiusPx, dabIndex: params.dabIndex,
        strokeDistancePx: params.strokeDistancePx, strokeAngleRad: params.strokeAngleRad,
        pressure: params.pressure, pressureCurve: params.pressureCurve,
        tiltDeg: params.tiltDeg, azimuthRad: params.azimuthRad,
        paperPreset: params.paperPreset, paperScale: params.paperScale,
        paperToothStrength: params.paperToothStrength, dualMode: params.dualMode,
        secondaryScale: params.secondaryScale, secondaryContrast: params.secondaryContrast,
        tipHardness: params.tipHardness, seed,
      });

      const alpha = clamp01(sample.coverage * flow);
      if (alpha <= 0.002) continue;

      const pixelIdx = row + px;
      const off = pixelIdx * 4;
      const dstA = (rgba[off + 3] ?? 255) / 255;
      const outA = alpha + dstA * (1 - alpha);
      if (outA > 1e-4) {
        const invOut = 1 / outA;
        rgba[off] = Math.round((pigR * alpha + (rgba[off] ?? 255) * dstA * (1 - alpha)) * invOut);
        rgba[off + 1] = Math.round((pigG * alpha + (rgba[off + 1] ?? 255) * dstA * (1 - alpha)) * invOut);
        rgba[off + 2] = Math.round((pigB * alpha + (rgba[off + 2] ?? 255) * dstA * (1 - alpha)) * invOut);
        rgba[off + 3] = Math.round(clamp01(outA) * 255);
      }

      if (auxBuffers.waxMask) {
        const prev = auxBuffers.waxMask[pixelIdx] ?? 0;
        auxBuffers.waxMask[pixelIdx] = clamp01(prev + alpha * (auxBuffers.waxDepositRate ?? 0.9) * (1 - prev * 0.35));
      }
      if (auxBuffers.impastoHeight) {
        const prev = auxBuffers.impastoHeight[pixelIdx] ?? 0;
        auxBuffers.impastoHeight[pixelIdx] = Math.min(2.5, prev + alpha * (auxBuffers.impastoThickness ?? 0.65) * (0.65 + 0.55 * sample.secondaryTextureMask));
      }
      if (auxBuffers.wetnessMap) {
        auxBuffers.wetnessMap[pixelIdx] = clamp01((auxBuffers.wetnessMap[pixelIdx] ?? 0) + alpha * (auxBuffers.wetnessDeposit ?? 0.85));
      }
      stampedPixels += 1;
      totalCoverage += alpha;
    }
  }

  return { stampedPixels, totalCoverage, jitteredX: cx, jitteredY: cy, boundsMinX: minX, boundsMinY: minY, boundsMaxX: maxX, boundsMaxY: maxY };
}
