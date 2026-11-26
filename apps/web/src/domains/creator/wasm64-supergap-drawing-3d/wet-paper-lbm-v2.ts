/**
 * Super-Gap Pillar A (#1): WebGPU Lattice-Boltzmann Wet Paper v2.
 * 종이 섬유 높이맵(`cold-press`·`hot-press`·`hanji`), D2Q9/4-이웃 모세관 확산,
 * 골짜기 안료 과립 침강(granulation), 증발·건조 타이머를 ₩0 로컬로 시뮬레이션한다.
 */


export type PaperGrainPreset = "cold-press" | "hot-press" | "hanji";

export type RgbaTuple = readonly [number, number, number, number];

export interface PaperPresetSpec {
  readonly id: PaperGrainPreset;
  readonly labelKo: string;
  readonly grainAmplitude: number;
  readonly baseFrequency: number;
  readonly fiberAnisotropy: number;
  readonly fiberAngleRad: number;
  readonly capillaryRate: number;
  readonly granulationRate: number;
  readonly evaporationRate: number;
  readonly absorbencyBase: number;
  readonly relaxationTau: number;
}

export const PAPER_PRESET_SPECS: Readonly<Record<PaperGrainPreset, PaperPresetSpec>> = {
  "cold-press": {
    id: "cold-press",
    labelKo: "중목 수채지 (Cold-Press)",
    grainAmplitude: 0.78,
    baseFrequency: 0.24,
    fiberAnisotropy: 0.14,
    fiberAngleRad: 0.35,
    capillaryRate: 0.28,
    granulationRate: 0.74,
    evaporationRate: 0.048,
    absorbencyBase: 0.56,
    relaxationTau: 0.88,
  },
  "hot-press": {
    id: "hot-press",
    labelKo: "세목 매끈지 (Hot-Press)",
    grainAmplitude: 0.22,
    baseFrequency: 0.36,
    fiberAnisotropy: 0.05,
    fiberAngleRad: 0.0,
    capillaryRate: 0.16,
    granulationRate: 0.24,
    evaporationRate: 0.062,
    absorbencyBase: 0.32,
    relaxationTau: 0.76,
  },
  hanji: {
    id: "hanji",
    labelKo: "전통 닥종이 한지 (Hanji)",
    grainAmplitude: 0.64,
    baseFrequency: 0.19,
    fiberAnisotropy: 0.76,
    fiberAngleRad: 0.42,
    capillaryRate: 0.44,
    granulationRate: 0.62,
    evaporationRate: 0.036,
    absorbencyBase: 0.78,
    relaxationTau: 0.94,
  },
};

export interface PaperFiberField {
  readonly width: number;
  readonly height: number;
  readonly preset: PaperGrainPreset;
  readonly heightmap: Float32Array;
  readonly fiberBiasX: Float32Array;
  readonly fiberBiasY: Float32Array;
  readonly absorbency: Float32Array;
  readonly roughnessStdDev: number;
  readonly meanAnisotropy: number;
}

export interface WetPaperLbmState {
  readonly width: number;
  readonly height: number;
  readonly preset: PaperGrainPreset;
  readonly heightmap: Float32Array;
  readonly fiberBiasX: Float32Array;
  readonly fiberBiasY: Float32Array;
  readonly absorbency: Float32Array;
  /** D2Q9 분포함수: cell * 9 + dir */
  readonly lbmF: Float32Array;
  /** 자유 표면 수분량 */
  readonly water: Float32Array;
  /** 종이 섬유 침윤도 [0, 1] */
  readonly wetness: Float32Array;
  /** 부유(이동 가능) 안료 RGBA: cell * 4 + c */
  readonly pigmentMobile: Float32Array;
  /** 골짜기에 침강·고착된 안료 RGBA: cell * 4 + c */
  readonly pigmentSettled: Float32Array;
  readonly velX: Float32Array;
  readonly velY: Float32Array;
  /** 셀별 남은 건조 예상 시간(초) */
  readonly dryingTimerSec: Float32Array;
  elapsedSec: number;
  stepCount: number;
}

export interface WetPigmentDepositInput {
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusPx: number;
  readonly waterAmount: number;
  readonly pigmentRgba: RgbaTuple;
  readonly pigmentLoad: number;
  readonly velocityX?: number;
  readonly velocityY?: number;
}

export interface WetPaperStepOptions {
  readonly dtSec?: number;
  readonly capillaryMultiplier?: number;
  readonly granulationMultiplier?: number;
  readonly evaporationMultiplier?: number;
  readonly ambientHumidity?: number;
}

export interface WetPaperStepMetrics {
  readonly stepCount: number;
  readonly elapsedSec: number;
  readonly totalWater: number;
  readonly totalMobilePigment: number;
  readonly totalSettledPigment: number;
  readonly totalPigmentMass: number;
  readonly valleySettledMean: number;
  readonly peakSettledMean: number;
  readonly valleyToPeakGranulationRatio: number;
  readonly wetCellCount: number;
  readonly maxDryingTimerSec: number;
  readonly isFullyDry: boolean;
  readonly computeTimeMs: number;
}

export interface WgslValidationReport {
  readonly valid: boolean;
  readonly hasComputeEntry: boolean;
  readonly hasD2q9Weights: boolean;
  readonly hasGranulationPass: boolean;
  readonly hasEvaporationTimer: boolean;
  readonly lineCount: number;
}

// D2Q9 이산 속도 벡터 및 가중치 (0: 정지, 1~4: 4-이웃 축, 5~8: 대각)
const D2Q9_CX = [0, 1, -1, 0, 0, 1, -1, 1, -1] as const;
const D2Q9_CY = [0, 0, 0, 1, -1, 1, 1, -1, -1] as const;
const D2Q9_W = [
  4 / 9,
  1 / 9,
  1 / 9,
  1 / 9,
  1 / 9,
  1 / 36,
  1 / 36,
  1 / 36,
  1 / 36,
] as const;

export const WGSL_WET_PAPER_LBM_V2 = /* wgsl */ `
// WebGPU Lattice-Boltzmann Wet Paper v2 Compute Shader (D2Q9 + Capillary + Granulation + Drying)
struct WetPaperUniforms {
  width: u32,
  height: u32,
  dtSec: f32,
  relaxationTau: f32,
  capillaryRate: f32,
  granulationRate: f32,
  evaporationRate: f32,
  dryThreshold: f32,
};

@group(0) @binding(0) var<uniform> params: WetPaperUniforms;
@group(0) @binding(1) var<storage, read> heightmap: array<f32>;
@group(0) @binding(2) var<storage, read> fiberBias: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read> lbmIn: array<f32>;
@group(0) @binding(4) var<storage, read_write> lbmOut: array<f32>;
@group(0) @binding(5) var<storage, read_write> waterField: array<f32>;
@group(0) @binding(6) var<storage, read_write> pigmentMobile: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read_write> pigmentSettled: array<vec4<f32>>;
@group(0) @binding(8) var<storage, read_write> dryingTimerSec: array<f32>;

const D2Q9_CX = array<i32, 9>(0, 1, -1, 0, 0, 1, -1, 1, -1);
const D2Q9_CY = array<i32, 9>(0, 0, 0, 1, -1, 1, 1, -1, -1);
const D2Q9_W = array<f32, 9>(
  0.44444445,
  0.11111111, 0.11111111, 0.11111111, 0.11111111,
  0.02777778, 0.02777778, 0.02777778, 0.02777778
);

fn clampCoord(v: i32, limit: u32) -> u32 {
  return u32(clamp(v, 0, i32(limit) - 1));
}

fn cellIndex(x: u32, y: u32) -> u32 {
  return y * params.width + x;
}

@compute @workgroup_size(8, 8, 1)
fn stepWetPaperLbmV2(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }
  let idx = cellIndex(gid.x, gid.y);
  let xL = clampCoord(i32(gid.x) - 1, params.width);
  let xR = clampCoord(i32(gid.x) + 1, params.width);
  let yU = clampCoord(i32(gid.y) - 1, params.height);
  let yD = clampCoord(i32(gid.y) + 1, params.height);

  // 1) D2Q9 pull-streaming + paper height gradient capillary force
  var rho: f32 = 0.0;
  var ux: f32 = 0.0;
  var uy: f32 = 0.0;
  var fPull: array<f32, 9>;

  for (var d: u32 = 0u; d < 9u; d = d + 1u) {
    let sx = clampCoord(i32(gid.x) - D2Q9_CX[d], params.width);
    let sy = clampCoord(i32(gid.y) - D2Q9_CY[d], params.height);
    let sIdx = cellIndex(sx, sy);
    let fVal = lbmIn[sIdx * 9u + d];
    fPull[d] = fVal;
    rho = rho + fVal;
    ux = ux + f32(D2Q9_CX[d]) * fVal;
    uy = uy + f32(D2Q9_CY[d]) * fVal;
  }

  let hCenter = heightmap[idx];
  let gradHx = 0.5 * (heightmap[cellIndex(xR, gid.y)] - heightmap[cellIndex(xL, gid.y)]);
  let gradHy = 0.5 * (heightmap[cellIndex(gid.x, yD)] - heightmap[cellIndex(gid.x, yU)]);
  let fBias = fiberBias[idx];

  if (rho > 1e-5) {
    ux = clamp((ux / rho) - gradHx * params.capillaryRate * (1.0 + fBias.x), -0.35, 0.35);
    uy = clamp((uy / rho) - gradHy * params.capillaryRate * (1.0 + fBias.y), -0.35, 0.35);
  } else {
    ux = 0.0;
    uy = 0.0;
  }

  // 2) Evaporation & BGK collision relaxation
  let evap = max(0.0, rho - params.evaporationRate * params.dtSec);
  let omega = clamp(1.0 / max(params.relaxationTau, 0.52), 0.1, 1.85);
  let uSq = ux * ux + uy * uy;
  let scaleRho = select(0.0, evap / max(rho, 1e-6), rho > 1e-6);

  for (var d: u32 = 0u; d < 9u; d = d + 1u) {
    let cu = f32(D2Q9_CX[d]) * ux + f32(D2Q9_CY[d]) * uy;
    let fEq = D2Q9_W[d] * evap * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * uSq);
    let fCur = fPull[d] * scaleRho;
    lbmOut[idx * 9u + d] = max(0.0, fCur + omega * (fEq - fCur));
  }
  waterField[idx] = evap;

  // 3) Granulation pigment settling into paper valleys (1.0 - height)
  let valleyFactor = clamp(1.0 - hCenter, 0.05, 1.0);
  let mobile = pigmentMobile[idx];
  let settleFrac = select(
    clamp(params.granulationRate * valleyFactor * params.dtSec, 0.0, 0.95),
    1.0,
    evap <= params.dryThreshold
  );
  let settledDelta = mobile * settleFrac;
  pigmentMobile[idx] = mobile - settledDelta;
  pigmentSettled[idx] = pigmentSettled[idx] + settledDelta;

  // 4) Remaining drying timer (seconds)
  let evapSafe = max(params.evaporationRate, 1e-5);
  dryingTimerSec[idx] = select(0.0, (evap - params.dryThreshold) / evapSafe, evap > params.dryThreshold);
}
`;

export function validateWetPaperLbmWgslSource(source: string = WGSL_WET_PAPER_LBM_V2): WgslValidationReport {
  const hasComputeEntry =
    source.indexOf("@compute") >= 0 && source.indexOf("fn stepWetPaperLbmV2") >= 0;
  const hasD2q9Weights =
    source.indexOf("D2Q9_W") >= 0 && source.indexOf("D2Q9_CX") >= 0;
  const hasGranulationPass =
    source.indexOf("valleyFactor") >= 0 && source.indexOf("pigmentSettled") >= 0;
  const hasEvaporationTimer =
    source.indexOf("evaporationRate") >= 0 && source.indexOf("dryingTimerSec") >= 0;
  return {
    valid: hasComputeEntry && hasD2q9Weights && hasGranulationPass && hasEvaporationTimer,
    hasComputeEntry,
    hasD2q9Weights,
    hasGranulationPass,
    hasEvaporationTimer,
    lineCount: source.split("\n").length,
  };
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function clampRange(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function hash2dUnit(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967295;
}

function valueNoise2d(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const n00 = hash2dUnit(x0, y0, seed);
  const n10 = hash2dUnit(x0 + 1, y0, seed);
  const n01 = hash2dUnit(x0, y0 + 1, seed);
  const n11 = hash2dUnit(x0 + 1, y0 + 1, seed);
  const nx0 = n00 + (n10 - n00) * ux;
  const nx1 = n01 + (n11 - n01) * ux;
  return nx0 + (nx1 - nx0) * uy;
}

function fbm2d(x: number, y: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * valueNoise2d(x * freq, y * freq, seed + o * 97);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return norm > 0 ? sum / norm : 0.5;
}

/**
 * 결정적 종이 섬유 높이맵 및 이방성 모세관 방향장 생성.
 */
export function generatePaperFiberHeightmap(
  width: number,
  height: number,
  preset: PaperGrainPreset,
  seed: number = 1337,
): PaperFiberField {
  const safeW = Math.max(2, Math.floor(width));
  const safeH = Math.max(2, Math.floor(height));
  const spec = PAPER_PRESET_SPECS[preset];
  const cellCount = safeW * safeH;
  const heightmap = new Float32Array(cellCount);
  const fiberBiasX = new Float32Array(cellCount);
  const fiberBiasY = new Float32Array(cellCount);
  const absorbency = new Float32Array(cellCount);

  const cosA = Math.cos(spec.fiberAngleRad);
  const sinA = Math.sin(spec.fiberAngleRad);
  let sumH = 0;
  let sumAniso = 0;

  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      const idx = y * safeW + x;
      const rx = x * cosA - y * sinA;
      const ry = x * sinA + y * cosA;
      const isoNoise = fbm2d(x * spec.baseFrequency, y * spec.baseFrequency, seed, 3);

      // 한지(hanji)는 긴 닥섬유가 교차하는 이방성 섬유 줄기를 추가로 합성한다.
      let rawHeight = isoNoise;
      if (preset === "hanji") {
        const longFiberPrimary = fbm2d(rx * 0.07, ry * 0.44, seed + 503, 2);
        const longFiberCross = fbm2d(ry * 0.08, rx * 0.39, seed + 811, 2);
        const fiberRidge = Math.max(longFiberPrimary, longFiberCross * 0.86);
        rawHeight = isoNoise * 0.38 + fiberRidge * 0.62;
      } else if (preset === "cold-press") {
        const pebble = valueNoise2d(x * 0.52, y * 0.52, seed + 307);
        rawHeight = isoNoise * 0.62 + pebble * 0.38;
      }

      const centered = (rawHeight - 0.5) * spec.grainAmplitude;
      const hVal = clamp01(0.5 + centered);
      heightmap[idx] = hVal;
      sumH += hVal;

      const localWave = 0.65 + 0.35 * valueNoise2d(rx * 0.12, ry * 0.12, seed + 991);
      const bx = Math.abs(cosA) * spec.fiberAnisotropy * localWave;
      const by = Math.abs(sinA) * spec.fiberAnisotropy * localWave;
      fiberBiasX[idx] = bx;
      fiberBiasY[idx] = by;
      sumAniso += Math.hypot(bx, by);
      absorbency[idx] = clamp01(spec.absorbencyBase + (1 - hVal) * 0.25);
    }
  }

  const meanH = sumH / cellCount;
  let variance = 0;
  for (let i = 0; i < cellCount; i += 1) {
    const diff = heightmap[i] - meanH;
    variance += diff * diff;
  }

  return {
    width: safeW,
    height: safeH,
    preset,
    heightmap,
    fiberBiasX,
    fiberBiasY,
    absorbency,
    roughnessStdDev: Math.sqrt(variance / cellCount),
    meanAnisotropy: sumAniso / cellCount,
  };
}

export function createWetPaperLbmState(
  width: number,
  height: number,
  preset: PaperGrainPreset,
  seed: number = 1337,
): WetPaperLbmState {
  const field = generatePaperFiberHeightmap(width, height, preset, seed);
  const cellCount = field.width * field.height;
  return {
    width: field.width,
    height: field.height,
    preset,
    heightmap: field.heightmap,
    fiberBiasX: field.fiberBiasX,
    fiberBiasY: field.fiberBiasY,
    absorbency: field.absorbency,
    lbmF: new Float32Array(cellCount * 9),
    water: new Float32Array(cellCount),
    wetness: new Float32Array(cellCount),
    pigmentMobile: new Float32Array(cellCount * 4),
    pigmentSettled: new Float32Array(cellCount * 4),
    velX: new Float32Array(cellCount),
    velY: new Float32Array(cellCount),
    dryingTimerSec: new Float32Array(cellCount),
    elapsedSec: 0,
    stepCount: 0,
  };
}

/**
 * 붓질로 수분과 부유 안료를 습식 종이 LBM 격자에 투여한다.
 */
export function depositWetPigmentBrush(
  state: WetPaperLbmState,
  input: WetPigmentDepositInput,
): number {
  const { width, height } = state;
  const r = Math.max(0.5, input.radiusPx);
  const rSq = r * r;
  const minX = Math.max(0, Math.floor(input.centerX - r));
  const maxX = Math.min(width - 1, Math.ceil(input.centerX + r));
  const minY = Math.max(0, Math.floor(input.centerY - r));
  const maxY = Math.min(height - 1, Math.ceil(input.centerY + r));
  const vx = clampRange(input.velocityX ?? 0, -0.25, 0.25);
  const vy = clampRange(input.velocityY ?? 0, -0.25, 0.25);
  const uSq = vx * vx + vy * vy;
  const spec = PAPER_PRESET_SPECS[state.preset];
  const evapSafe = Math.max(spec.evaporationRate, 1e-4);

  let affected = 0;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - input.centerX;
      const dy = y - input.centerY;
      const distSq = dx * dx + dy * dy;
      if (distSq > rSq) continue;

      const falloff = Math.cos((Math.sqrt(distSq) / r) * (Math.PI * 0.5));
      const weight = falloff * falloff;
      const idx = y * width + x;
      const addWater = Math.max(0, input.waterAmount) * weight;

      state.water[idx] += addWater;
      state.wetness[idx] = clamp01(state.wetness[idx] + addWater * 0.75);
      state.velX[idx] = clampRange(state.velX[idx] + vx * weight, -0.35, 0.35);
      state.velY[idx] = clampRange(state.velY[idx] + vy * weight, -0.35, 0.35);

      for (let d = 0; d < 9; d += 1) {
        const cu = D2Q9_CX[d] * vx + D2Q9_CY[d] * vy;
        const fEqAdd = D2Q9_W[d] * addWater * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * uSq);
        state.lbmF[idx * 9 + d] += Math.max(0, fEqAdd);
      }

      const load = Math.max(0, input.pigmentLoad) * weight;
      const pBase = idx * 4;
      state.pigmentMobile[pBase] += clamp01(input.pigmentRgba[0]) * load;
      state.pigmentMobile[pBase + 1] += clamp01(input.pigmentRgba[1]) * load;
      state.pigmentMobile[pBase + 2] += clamp01(input.pigmentRgba[2]) * load;
      state.pigmentMobile[pBase + 3] += clamp01(input.pigmentRgba[3]) * load;
      state.dryingTimerSec[idx] = state.water[idx] / evapSafe;
      affected += 1;
    }
  }
  return affected;
}

/**
 * D2Q9 Lattice-Boltzmann + 4-이웃 모세관 확산 + 골짜기 과립 침강 + 증발 건조 스텝 (CPU 정합 구현).
 */
export function stepWetPaperLbmCpu(
  state: WetPaperLbmState,
  options: WetPaperStepOptions = {},
): WetPaperStepMetrics {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const { width, height } = state;
  const cellCount = width * height;
  const spec = PAPER_PRESET_SPECS[state.preset];

  const dtSec = clampRange(options.dtSec ?? 0.1, 0.005, 1.0);
  const humidity = clamp01(options.ambientHumidity ?? 0.35);
  const capillaryRate = spec.capillaryRate * Math.max(0, options.capillaryMultiplier ?? 1);
  const granulationRate = spec.granulationRate * Math.max(0, options.granulationMultiplier ?? 1);
  const evapRate =
    spec.evaporationRate *
    Math.max(0, options.evaporationMultiplier ?? 1) *
    (1 - humidity * 0.45);
  const dryThreshold = 0.004;
  const omega = clampRange(1 / Math.max(spec.relaxationTau, 0.54), 0.15, 1.8);

  const nextF = new Float32Array(cellCount * 9);
  const nextWater = new Float32Array(cellCount);
  const nextWetness = new Float32Array(cellCount);
  const nextVelX = new Float32Array(cellCount);
  const nextVelY = new Float32Array(cellCount);
  const nextPigmentMobile = new Float32Array(cellCount * 4);

  // 1) D2Q9 pull-streaming + 높이맵 기울기 기반 모세관 가속 + BGK 충돌 + 증발
  for (let y = 0; y < height; y += 1) {
    const yU = y > 0 ? y - 1 : 0;
    const yD = y < height - 1 ? y + 1 : height - 1;
    for (let x = 0; x < width; x += 1) {
      const xL = x > 0 ? x - 1 : 0;
      const xR = x < width - 1 ? x + 1 : width - 1;
      const idx = y * width + x;

      let rho = 0;
      let momX = 0;
      let momY = 0;
      const pulled = [0, 0, 0, 0, 0, 0, 0, 0, 0];

      for (let d = 0; d < 9; d += 1) {
        const sx = clampRange(x - D2Q9_CX[d], 0, width - 1);
        const sy = clampRange(y - D2Q9_CY[d], 0, height - 1);
        const fVal = state.lbmF[(sy * width + sx) * 9 + d];
        pulled[d] = fVal;
        rho += fVal;
        momX += D2Q9_CX[d] * fVal;
        momY += D2Q9_CY[d] * fVal;
      }

      const gradHx = 0.5 * (state.heightmap[y * width + xR] - state.heightmap[y * width + xL]);
      const gradHy = 0.5 * (state.heightmap[yD * width + x] - state.heightmap[yU * width + x]);
      let ux = 0;
      let uy = 0;
      if (rho > 1e-6) {
        ux = clampRange(
          momX / rho - gradHx * capillaryRate * (1 + state.fiberBiasX[idx]),
          -0.32,
          0.32,
        );
        uy = clampRange(
          momY / rho - gradHy * capillaryRate * (1 + state.fiberBiasY[idx]),
          -0.32,
          0.32,
        );
      }

      const evapWater = Math.max(0, rho - evapRate * dtSec);
      const scaleRho = rho > 1e-6 ? evapWater / rho : 0;
      const uSq = ux * ux + uy * uy;

      for (let d = 0; d < 9; d += 1) {
        const cu = D2Q9_CX[d] * ux + D2Q9_CY[d] * uy;
        const fEq = D2Q9_W[d] * evapWater * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * uSq);
        const fCur = pulled[d] * scaleRho;
        nextF[idx * 9 + d] = Math.max(0, fCur + omega * (fEq - fCur));
      }

      nextWater[idx] = evapWater;
      nextVelX[idx] = ux;
      nextVelY[idx] = uy;

      // 4-이웃 이방성 섬유 습윤도(wetness) 모세관 확산
      const wx = 1 + state.fiberBiasX[idx];
      const wy = 1 + state.fiberBiasY[idx];
      const wSelf = state.wetness[idx];
      const laplacian =
        wx * (state.wetness[y * width + xL] + state.wetness[y * width + xR] - 2 * wSelf) +
        wy * (state.wetness[yU * width + x] + state.wetness[yD * width + x] - 2 * wSelf);
      const diffusedWet =
        wSelf +
        laplacian * Math.min(0.18, capillaryRate * 0.28 * dtSec) +
        Math.min(0.25, evapWater * state.absorbency[idx] * dtSec) -
        evapRate * 0.65 * dtSec;
      nextWetness[idx] = clamp01(diffusedWet);
    }
  }

  // 2) 질량 보존형 4-이웃 모세관 안료 수송 (골짜기 방향 + 유속 방향 바이어스)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const pBase = idx * 4;
      const alpha = state.pigmentMobile[pBase + 3];
      if (alpha <= 1e-8) continue;

      const curWater = nextWater[idx];
      if (curWater <= dryThreshold) {
        for (let c = 0; c < 4; c += 1) {
          nextPigmentMobile[pBase + c] += state.pigmentMobile[pBase + c];
        }
        continue;
      }

      const hCur = state.heightmap[idx];
      const vx = nextVelX[idx];
      const vy = nextVelY[idx];
      const outWeights = [0, 0, 0, 0];
      const nIndices = [
        y * width + (x < width - 1 ? x + 1 : x),
        y * width + (x > 0 ? x - 1 : x),
        (y < height - 1 ? y + 1 : y) * width + x,
        (y > 0 ? y - 1 : y) * width + x,
      ];
      const dirX = [1, -1, 0, 0];
      const dirY = [0, 0, 1, -1];
      let sumOut = 0;

      for (let k = 0; k < 4; k += 1) {
        const nIdx = nIndices[k];
        if (nIdx === idx) continue;
        const valleyPull = Math.max(0, hCur - state.heightmap[nIdx]) * 1.65;
        const advectPull = Math.max(0, vx * dirX[k] + vy * dirY[k]) * 1.4;
        const fiberGain =
          dirX[k] !== 0 ? 1 + state.fiberBiasX[idx] : 1 + state.fiberBiasY[idx];
        const baseDiff = 0.08 * fiberGain;
        const wetGate = nextWater[nIdx] > dryThreshold * 0.25 || nextWetness[nIdx] > 0.05 ? 1 : 0.35;
        const flux = (baseDiff + valleyPull + advectPull) * capillaryRate * dtSec * wetGate;
        outWeights[k] = Math.max(0, flux);
        sumOut += outWeights[k];
      }

      const maxOutFrac = 0.62;
      const scaleOut = sumOut > maxOutFrac ? maxOutFrac / sumOut : 1;
      const remainFrac = 1 - sumOut * scaleOut;

      for (let c = 0; c < 4; c += 1) {
        const mass = state.pigmentMobile[pBase + c];
        nextPigmentMobile[pBase + c] += mass * remainFrac;
        for (let k = 0; k < 4; k += 1) {
          const frac = outWeights[k] * scaleOut;
          if (frac > 0) {
            nextPigmentMobile[nIndices[k] * 4 + c] += mass * frac;
          }
        }
      }
    }
  }

  // 3) 골짜기 과립 침강(Granulation) + 완전 건조 시 고착 + 건조 타이머 업데이트
  let totalWater = 0;
  let totalMobile = 0;
  let totalSettled = 0;
  let valleySettledSum = 0;
  let valleyCount = 0;
  let peakSettledSum = 0;
  let peakCount = 0;
  let wetCellCount = 0;
  let maxDryingTimerSec = 0;
  const evapSafe = Math.max(evapRate, 1e-5);

  for (let idx = 0; idx < cellCount; idx += 1) {
    const w = nextWater[idx];
    totalWater += w;
    if (w > dryThreshold) {
      wetCellCount += 1;
    }

    const h = state.heightmap[idx];
    // 골짜기(h가 작을수록)에 훨씬 빠르게 과립 안료가 침강한다.
    const valleyDepth = Math.pow(clamp01(1 - h), 1.85);
    const settleFrac =
      w <= dryThreshold
        ? 1.0
        : clampRange(granulationRate * (0.04 + 0.96 * valleyDepth) * dtSec, 0, 0.95);

    const pBase = idx * 4;
    for (let c = 0; c < 4; c += 1) {
      const mVal = nextPigmentMobile[pBase + c];
      const delta = mVal * settleFrac;
      state.pigmentMobile[pBase + c] = mVal - delta;
      state.pigmentSettled[pBase + c] += delta;
    }

    const mobileA = state.pigmentMobile[pBase + 3];
    const settledA = state.pigmentSettled[pBase + 3];
    totalMobile += mobileA;
    totalSettled += settledA;

    if (mobileA + settledA > 1e-4) {
      if (h < 0.45) {
        valleySettledSum += settledA;
        valleyCount += 1;
      } else if (h > 0.55) {
        peakSettledSum += settledA;
        peakCount += 1;
      }
    }

    const remainTimer = w > dryThreshold ? (w - dryThreshold) / evapSafe : 0;
    state.dryingTimerSec[idx] = remainTimer;
    if (remainTimer > maxDryingTimerSec) {
      maxDryingTimerSec = remainTimer;
    }
  }

  state.lbmF.set(nextF);
  state.water.set(nextWater);
  state.wetness.set(nextWetness);
  state.velX.set(nextVelX);
  state.velY.set(nextVelY);
  state.elapsedSec += dtSec;
  state.stepCount += 1;

  const valleySettledMean = valleyCount > 0 ? valleySettledSum / valleyCount : 0;
  const peakSettledMean = peakCount > 0 ? peakSettledSum / peakCount : 0;
  const valleyToPeakGranulationRatio =
    peakSettledMean > 1e-6 ? valleySettledMean / peakSettledMean : valleySettledMean > 0 ? 10 : 1;
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();

  return {
    stepCount: state.stepCount,
    elapsedSec: state.elapsedSec,
    totalWater,
    totalMobilePigment: totalMobile,
    totalSettledPigment: totalSettled,
    totalPigmentMass: totalMobile + totalSettled,
    valleySettledMean,
    peakSettledMean,
    valleyToPeakGranulationRatio,
    wetCellCount,
    maxDryingTimerSec,
    isFullyDry: wetCellCount === 0,
    computeTimeMs: Math.max(0, t1 - t0),
  };
}
