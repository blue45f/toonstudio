/**
 * Wave 41: 비주기 확률 격자(Stochastic Simplex Lattice + Wang Edge Hashing) 및
 * 연속 배율 시각 주파수 보존(`log2(zoom)`) 기반 시각 프록시 질감 합성기.
 *
 * - 정삼각형 심플렉스 격자 정점별 비주기 Wang 엣지 해시 오프셋·위상 변조와
 *   히스토그램 분산 보존 보간(Heitz & Neyret 2018 Variance-Preserving Blending)을 결합해
 *   웹툰 배경 석재·한지·수채화지·망점 스크린톤의 주기적 타일링 반복선(Seam)을 원천 제거한다.
 * - `12.5%`(`0.125x`) 전체 원고 보기부터 `800%`(`8.0x`) 펜선 확대까지 연속 로그 배율(`log2(zoom)`)
 *   코사인 통과대역 가중치(`sum(w^2) === 1`)로 옥타브를 분수 교차 페이드해 모아레와 밉맵 팝핑을 막는다.
 */

/** 최소 지원 연속 줌 배율 (`12.5%` 전체 원고 조감 보기). */
export const MIN_CONTINUOUS_PROXY_ZOOM = 0.125 as const;
/** 최대 지원 연속 줌 배율 (`800%` 세밀 펜선 확대 보기). */
export const MAX_CONTINUOUS_PROXY_ZOOM = 8.0 as const;
/** 기본 타일 기준 픽셀 주기 (`100%` 배율에서 1 프록시 셀 너비). */
export const DEFAULT_PROXY_BASE_TILE_PX = 32 as const;

const INV_SQRT3 = 1 / Math.sqrt(3);
const TWO_INV_SQRT3 = 2 / Math.sqrt(3);
const OCTAVE_WINDOW_HALF_WIDTH = 2.0;
const OCTAVE_L2_NORMALIZER = Math.sqrt(2 / 3);
const MIN_OCTAVE_INDEX = -5;
const MAX_OCTAVE_INDEX = 6;

export type ProxySurfacePresetId = "stone-granite" | "hanji-fiber" | "watercolor-coldpress" | "screentone-rosette";
export type ProxyTilingMode = "aperiodic-stochastic" | "periodic-grid";
export type ProxyLatticeBlendMode = "variance-preserving" | "linear";

export interface ProxySurfacePresetSpec {
  readonly id: ProxySurfacePresetId;
  readonly labelKo: string;
  readonly baseFrequency: number;
  readonly meanAlbedo: number;
  readonly contrastStdDev: number;
  readonly reliefAmplitude: number;
  readonly maxRotationJitterRad: number;
}

export const PROXY_SURFACE_PRESETS: Readonly<Record<ProxySurfacePresetId, ProxySurfacePresetSpec>> = {
  "stone-granite": {
    id: "stone-granite", labelKo: "화강암 석재 결", baseFrequency: 1.0,
    meanAlbedo: 0.56, contrastStdDev: 0.14, reliefAmplitude: 0.85, maxRotationJitterRad: Math.PI,
  },
  "hanji-fiber": {
    id: "hanji-fiber", labelKo: "전통 한지 섬유 결", baseFrequency: 1.15,
    meanAlbedo: 0.91, contrastStdDev: 0.055, reliefAmplitude: 0.42, maxRotationJitterRad: (14 * Math.PI) / 180,
  },
  "watercolor-coldpress": {
    id: "watercolor-coldpress", labelKo: "수채화 중목 종이 결", baseFrequency: 0.9,
    meanAlbedo: 0.94, contrastStdDev: 0.048, reliefAmplitude: 0.58, maxRotationJitterRad: Math.PI,
  },
  "screentone-rosette": {
    id: "screentone-rosette", labelKo: "비모아레 망점 스크린톤", baseFrequency: 1.35,
    meanAlbedo: 0.72, contrastStdDev: 0.16, reliefAmplitude: 0.25, maxRotationJitterRad: Math.PI,
  },
};

export interface SimplexVertexDescriptor {
  readonly vx: number;
  readonly vy: number;
  readonly weight: number;
  readonly wangCornerCode: number;
  readonly offsetU: number;
  readonly offsetV: number;
  readonly rotationJitterUnit: number;
  readonly phaseSeed: number;
}

export interface SimplexTriangleSample {
  readonly vertices: readonly [SimplexVertexDescriptor, SimplexVertexDescriptor, SimplexVertexDescriptor];
  readonly weightNormL2: number;
}

export interface ContinuousZoomOctaveBand {
  readonly octaveIndex: number;
  readonly worldFrequency: number;
  readonly screenFrequency: number;
  readonly rawWindowWeight: number;
  readonly normalizedEnergyWeight: number;
}

export interface ContinuousZoomGrainSchedule {
  readonly clampedZoom: number;
  readonly log2Zoom: number;
  readonly bands: readonly ContinuousZoomOctaveBand[];
  readonly totalNormalizedEnergy: number;
}

export interface AperiodicProxyEvalOptions {
  readonly seed?: number;
  readonly tilingMode?: ProxyTilingMode;
  readonly blendMode?: ProxyLatticeBlendMode;
}

export interface AperiodicProxySampleValue {
  readonly zeroMeanGrain: number;
  readonly albedoLuma: number;
  readonly heightValue: number;
}

export interface AperiodicProxyTextureRequest {
  readonly presetId: ProxySurfacePresetId;
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  readonly panWorldU?: number;
  readonly panWorldV?: number;
  readonly baseTilePx?: number;
  readonly seed?: number;
  readonly tilingMode?: ProxyTilingMode;
  readonly blendMode?: ProxyLatticeBlendMode;
}

export interface AperiodicProxyTexturePatch {
  readonly presetId: ProxySurfacePresetId;
  readonly labelKo: string;
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
  readonly log2Zoom: number;
  readonly albedoLuma: Float32Array;
  readonly heightField: Float32Array;
  readonly zeroMeanField: Float32Array;
  readonly mean: number;
  readonly variance: number;
  readonly stdDev: number;
  readonly octaveSchedule: ContinuousZoomGrainSchedule;
}

export interface AutocorrelationAuditReport {
  readonly lagPx: number;
  readonly horizontalAutocorrelation: number;
  readonly verticalAutocorrelation: number;
  readonly peakPeriodicCorrelation: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function positiveFrac(value: number): number {
  const f = value - Math.floor(value);
  return f < 0 ? f + 1 : f;
}

function mix32(h: number): number {
  let x = h | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

function hashCoords32(x: number, y: number, seed: number): number {
  let h = mix32((seed | 0) ^ 0x9e3779b9);
  h = mix32(h ^ Math.imul((x | 0) + 0x517cc1b7, 0x85ebca77));
  return mix32(h ^ Math.imul((y | 0) + 0x27d4eb2f, 0xc2b2ae3d));
}

/**
 * 격자 정점 `(vx, vy)` 주변의 수평·수직 인접 Wang 타일 엣지 색상(`0..3` 각 4종)을 결합해
 * 정점 고유 비주기 Wang 코너 코드(`0..255`)와 32비트 시드를 결정론적으로 계산한다.
 */
export function computeWangTileCornerHash(
  vx: number,
  vy: number,
  seed = 0x51f15e,
): { readonly cornerCode: number; readonly hash32: number } {
  const west = hashCoords32(vx - 1, vy, seed ^ 0x11) & 0x3;
  const east = hashCoords32(vx, vy, seed ^ 0x11) & 0x3;
  const south = hashCoords32(vx, vy - 1, seed ^ 0x29) & 0x3;
  const north = hashCoords32(vx, vy, seed ^ 0x29) & 0x3;
  const cornerCode = west | (east << 2) | (south << 4) | (north << 6);
  const hash32 = mix32(hashCoords32(vx, vy, seed) ^ Math.imul(cornerCode + 1, 0x27d4eb2f));
  return { cornerCode, hash32 };
}

function buildVertexDescriptor(vx: number, vy: number, weight: number, seed: number): SimplexVertexDescriptor {
  const { cornerCode, hash32 } = computeWangTileCornerHash(vx, vy, seed);
  const h2 = mix32(hash32 ^ 0x6c8e9cf5);
  const h3 = mix32(h2 ^ 0xb5297a4d);
  return {
    vx,
    vy,
    weight,
    wangCornerCode: cornerCode,
    offsetU: (hash32 >>> 8) / 16_777_216,
    offsetV: (h2 >>> 8) / 16_777_216,
    rotationJitterUnit: (h3 >>> 8) / 8_388_608 - 1,
    phaseSeed: h3,
  };
}

/**
 * 2D 연속 월드 좌표 `(u, v)`를 정삼각형 심플렉스 격자로 변환하고 무게중심 가중치와 Wang 정점 기술자를 반환한다.
 */
export function resolveSimplexTriangleLattice(u: number, v: number, seed = 1337): SimplexTriangleSample {
  const beta = v * TWO_INV_SQRT3;
  const alpha = u - v * INV_SQRT3;
  const i = Math.floor(alpha);
  const j = Math.floor(beta);
  const fa = alpha - i;
  const fb = beta - j;

  let v0: SimplexVertexDescriptor;
  let v1: SimplexVertexDescriptor;
  let v2: SimplexVertexDescriptor;
  if (fa + fb <= 1) {
    const w1 = clamp(fa, 0, 1);
    const w2 = clamp(fb, 0, 1);
    v0 = buildVertexDescriptor(i, j, Math.max(0, 1 - w1 - w2), seed);
    v1 = buildVertexDescriptor(i + 1, j, w1, seed);
    v2 = buildVertexDescriptor(i, j + 1, w2, seed);
  } else {
    const w1 = clamp(1 - fb, 0, 1);
    const w2 = clamp(1 - fa, 0, 1);
    v0 = buildVertexDescriptor(i + 1, j + 1, Math.max(0, 1 - w1 - w2), seed);
    v1 = buildVertexDescriptor(i + 1, j, w1, seed);
    v2 = buildVertexDescriptor(i, j + 1, w2, seed);
  }

  const weightNormL2 = Math.hypot(v0.weight, v1.weight, v2.weight) || 1e-4;
  return { vertices: [v0, v1, v2], weightNormL2 };
}

/** Heitz & Neyret (2018) 히스토그램 분산 보존 보간 연산자. */
export function blendSimplexVariancePreserving(
  s0: number,
  s1: number,
  s2: number,
  w0: number,
  w1: number,
  w2: number,
  mean = 0,
): number {
  const linearBlend = w0 * s0 + w1 * s1 + w2 * s2;
  const norm = Math.sqrt(Math.max(1e-8, w0 * w0 + w1 * w1 + w2 * w2));
  return mean + (linearBlend - mean) / norm;
}

/** `12.5%`(`0.125`) ~ `800%`(`8.0`) 줌 배율의 연속 로그(`log2(zoom)`)에 따라 옥타브 에너지를 교차 페이드한다. */
export function computeContinuousZoomOctaveSchedule(
  zoom: number,
  baseFrequency = 1.0,
): ContinuousZoomGrainSchedule {
  const clampedZoom = clamp(zoom, MIN_CONTINUOUS_PROXY_ZOOM, MAX_CONTINUOUS_PROXY_ZOOM);
  const log2Zoom = Math.log2(clampedZoom);
  const safeBaseFreq = Math.max(1e-4, baseFrequency);
  const bands: ContinuousZoomOctaveBand[] = [];
  let energyAccum = 0;

  for (let k = MIN_OCTAVE_INDEX; k <= MAX_OCTAVE_INDEX; k += 1) {
    const tau = k - log2Zoom;
    if (Math.abs(tau) >= OCTAVE_WINDOW_HALF_WIDTH) continue;
    const rawWindowWeight = 0.5 * (1 + Math.cos((Math.PI * tau) / OCTAVE_WINDOW_HALF_WIDTH));
    const normalizedEnergyWeight = rawWindowWeight * OCTAVE_L2_NORMALIZER;
    const worldFrequency = safeBaseFreq * 2 ** k;
    bands.push({
      octaveIndex: k,
      worldFrequency,
      screenFrequency: worldFrequency / clampedZoom,
      rawWindowWeight,
      normalizedEnergyWeight,
    });
    energyAccum += normalizedEnergyWeight * normalizedEnergyWeight;
  }

  if (bands.length > 0 && Math.abs(energyAccum - 1) > 1e-5) {
    const invNorm = 1 / Math.sqrt(Math.max(1e-8, energyAccum));
    let correctedEnergy = 0;
    const rescaled = bands.map((band) => {
      const w = band.normalizedEnergyWeight * invNorm;
      correctedEnergy += w * w;
      return { ...band, normalizedEnergyWeight: w };
    });
    return { clampedZoom, log2Zoom, bands: rescaled, totalNormalizedEnergy: correctedEnergy };
  }

  return { clampedZoom, log2Zoom, bands, totalNormalizedEnergy: energyAccum };
}

function evaluateZeroMeanExemplar(
  presetId: ProxySurfacePresetId,
  localU: number,
  localV: number,
  phaseSeed: number,
): number {
  const tau = Math.PI * 2;
  const p0 = ((phaseSeed & 0xff) / 256) * tau;
  const p1 = (((phaseSeed >>> 8) & 0xff) / 256) * tau;
  const p2 = (((phaseSeed >>> 16) & 0xff) / 256) * tau;
  const x = localU * tau;
  const y = localV * tau;

  switch (presetId) {
    case "stone-granite": {
      const c1 = Math.cos(2 * x + y + p0) * Math.sin(x - 2 * y + p1);
      const c2 = Math.cos(3 * x - 2 * y + p2) * 0.72;
      const quartz = Math.sin(4 * x + 3 * y - p0) * Math.cos(2 * x - 4 * y + p1) * 0.55;
      return (c1 + c2 + quartz) * 1.16;
    }
    case "hanji-fiber": {
      const longFiber = Math.sin(x + y * 5 + p0) * 0.82;
      const crossFiber = Math.cos(x * 4 - y + p1) * 0.44;
      const pulp = Math.sin(2 * x + 2 * y + p2) * Math.cos(x - 3 * y - p0) * 0.52;
      return (longFiber + crossFiber + pulp) * 1.24;
    }
    case "watercolor-coldpress": {
      const dimpleA = Math.cos(2 * x + p0) * Math.cos(2 * y + p1);
      const dimpleB = Math.sin(x + 2 * y + p2) * Math.sin(2 * x - y + p0) * 0.75;
      return (dimpleA + dimpleB + Math.cos(3 * x + y - p1) * 0.45) * 1.32;
    }
    case "screentone-rosette": {
      const r0 = Math.cos(3 * x + y + p0) + Math.cos(x - 3 * y + p1);
      return (r0 * 0.68 + Math.cos(2 * x + 2 * y + p2) * 0.65) * 1.12;
    }
  }
}

function evaluateSingleOctave(
  preset: ProxySurfacePresetSpec,
  scaledU: number,
  scaledV: number,
  octaveSeed: number,
  tilingMode: ProxyTilingMode,
  blendMode: ProxyLatticeBlendMode,
): number {
  if (tilingMode === "periodic-grid") {
    return evaluateZeroMeanExemplar(preset.id, positiveFrac(scaledU), positiveFrac(scaledV), octaveSeed);
  }
  const simplex = resolveSimplexTriangleLattice(scaledU, scaledV, octaveSeed);
  const s: [number, number, number] = [0, 0, 0];
  for (let idx = 0; idx < 3; idx += 1) {
    const vtx = simplex.vertices[idx];
    const theta = vtx.rotationJitterUnit * preset.maxRotationJitterRad;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const dx = scaledU - (vtx.vx + vtx.vy * 0.5);
    const dy = scaledV - vtx.vy * (Math.sqrt(3) * 0.5);
    const rotU = dx * cosT - dy * sinT + vtx.offsetU;
    const rotV = dx * sinT + dy * cosT + vtx.offsetV;
    s[idx] = evaluateZeroMeanExemplar(preset.id, rotU, rotV, vtx.phaseSeed);
  }
  const [v0, v1, v2] = simplex.vertices;
  if (blendMode === "linear") {
    return v0.weight * s[0] + v1.weight * s[1] + v2.weight * s[2];
  }
  return blendSimplexVariancePreserving(s[0], s[1], s[2], v0.weight, v1.weight, v2.weight, 0);
}

function softBoundedToneMap(mean: number, delta: number): number {
  return clamp(mean + delta / Math.sqrt(1 + (delta / 0.42) ** 2), 0, 1);
}

/** 단일 월드 좌표 `(worldU, worldV)`와 연속 줌 배율에서 비주기 프록시 질감과 높이값을 평가한다. */
export function evaluateAperiodicProxySample(
  worldU: number,
  worldV: number,
  zoom: number,
  presetId: ProxySurfacePresetId,
  options: AperiodicProxyEvalOptions = {},
): AperiodicProxySampleValue {
  const preset = PROXY_SURFACE_PRESETS[presetId];
  const seed = options.seed ?? 20261127;
  const tilingMode = options.tilingMode ?? "aperiodic-stochastic";
  const blendMode = options.blendMode ?? "variance-preserving";
  const schedule = computeContinuousZoomOctaveSchedule(zoom, preset.baseFrequency);

  let zeroMeanGrain = 0;
  for (const band of schedule.bands) {
    const salt = tilingMode === "periodic-grid" ? band.octaveIndex + 31 : band.octaveIndex + 97;
    const octaveSeed = mix32(seed ^ Math.imul(salt, 0x85ebca77));
    zeroMeanGrain +=
      band.normalizedEnergyWeight *
      evaluateSingleOctave(preset, worldU * band.worldFrequency, worldV * band.worldFrequency, octaveSeed, tilingMode, blendMode);
  }

  return {
    zeroMeanGrain,
    albedoLuma: softBoundedToneMap(preset.meanAlbedo, zeroMeanGrain * preset.contrastStdDev),
    heightValue: softBoundedToneMap(0.5, zeroMeanGrain * preset.reliefAmplitude * 0.22),
  };
}

/** 지정된 뷰포트 해상도와 연속 줌 배율에 대해 비주기 프록시 알베도·마이크로 요철 높이 맵 패치를 합성한다. */
export function synthesizeAperiodicProxyTexturePatch(
  request: AperiodicProxyTextureRequest,
): AperiodicProxyTexturePatch {
  const preset = PROXY_SURFACE_PRESETS[request.presetId];
  const width = Math.max(1, Math.min(2048, Math.floor(request.width)));
  const height = Math.max(1, Math.min(2048, Math.floor(request.height)));
  const baseTilePx = Math.max(4, request.baseTilePx ?? DEFAULT_PROXY_BASE_TILE_PX);
  const panWorldU = Number.isFinite(request.panWorldU) ? (request.panWorldU ?? 0) : 0;
  const panWorldV = Number.isFinite(request.panWorldV) ? (request.panWorldV ?? 0) : 0;
  const seed = request.seed ?? 20261127;
  const tilingMode = request.tilingMode ?? "aperiodic-stochastic";
  const blendMode = request.blendMode ?? "variance-preserving";

  const octaveSchedule = computeContinuousZoomOctaveSchedule(request.zoom, preset.baseFrequency);
  const clampedZoom = octaveSchedule.clampedZoom;
  const invPixelToWorld = 1 / (baseTilePx * clampedZoom);

  const count = width * height;
  const albedoLuma = new Float32Array(count);
  const heightField = new Float32Array(count);
  const zeroMeanField = new Float32Array(count);

  let sum = 0;
  for (let y = 0; y < height; y += 1) {
    const worldV = panWorldV + (y + 0.5) * invPixelToWorld;
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const worldU = panWorldU + (x + 0.5) * invPixelToWorld;
      let grain = 0;
      for (const band of octaveSchedule.bands) {
        const salt = tilingMode === "periodic-grid" ? band.octaveIndex + 31 : band.octaveIndex + 97;
        const octaveSeed = mix32(seed ^ Math.imul(salt, 0x85ebca77));
        grain +=
          band.normalizedEnergyWeight *
          evaluateSingleOctave(preset, worldU * band.worldFrequency, worldV * band.worldFrequency, octaveSeed, tilingMode, blendMode);
      }
      const idx = rowOffset + x;
      const luma = softBoundedToneMap(preset.meanAlbedo, grain * preset.contrastStdDev);
      zeroMeanField[idx] = grain;
      albedoLuma[idx] = luma;
      heightField[idx] = softBoundedToneMap(0.5, grain * preset.reliefAmplitude * 0.22);
      sum += luma;
    }
  }

  const mean = sum / count;
  let sqDiffSum = 0;
  for (let i = 0; i < count; i += 1) {
    const d = albedoLuma[i] - mean;
    sqDiffSum += d * d;
  }
  const variance = sqDiffSum / count;

  return {
    presetId: preset.id,
    labelKo: preset.labelKo,
    width,
    height,
    zoom: clampedZoom,
    log2Zoom: octaveSchedule.log2Zoom,
    albedoLuma,
    heightField,
    zeroMeanField,
    mean,
    variance,
    stdDev: Math.sqrt(variance),
    octaveSchedule,
  };
}

/** 정수 주기 `lagPx`만큼 떨어진 픽셀 쌍의 수평·수직 피어슨 자기상관계수를 측정한다. */
export function measureSpatialLagAutocorrelation(
  field: Float32Array,
  width: number,
  height: number,
  lagPx: number,
): AutocorrelationAuditReport {
  const safeLag = Math.max(1, Math.floor(lagPx));
  const total = width * height;
  if (total === 0 || field.length < total) {
    return { lagPx: safeLag, horizontalAutocorrelation: 0, verticalAutocorrelation: 0, peakPeriodicCorrelation: 0 };
  }
  let mean = 0;
  for (let i = 0; i < total; i += 1) mean += field[i];
  mean /= total;

  let hNum = 0;
  let hDenA = 0;
  let hDenB = 0;
  if (safeLag < width) {
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let x = 0; x < width - safeLag; x += 1) {
        const a = field[row + x] - mean;
        const b = field[row + x + safeLag] - mean;
        hNum += a * b;
        hDenA += a * a;
        hDenB += b * b;
      }
    }
  }
  const horizontalAutocorrelation = hDenA > 1e-12 && hDenB > 1e-12 ? hNum / Math.sqrt(hDenA * hDenB) : 0;

  let vNum = 0;
  let vDenA = 0;
  let vDenB = 0;
  if (safeLag < height) {
    for (let y = 0; y < height - safeLag; y += 1) {
      const rowA = y * width;
      const rowB = (y + safeLag) * width;
      for (let x = 0; x < width; x += 1) {
        const a = field[rowA + x] - mean;
        const b = field[rowB + x] - mean;
        vNum += a * b;
        vDenA += a * a;
        vDenB += b * b;
      }
    }
  }
  const verticalAutocorrelation = vDenA > 1e-12 && vDenB > 1e-12 ? vNum / Math.sqrt(vDenA * vDenB) : 0;

  return {
    lagPx: safeLag,
    horizontalAutocorrelation,
    verticalAutocorrelation,
    peakPeriodicCorrelation: Math.max(Math.abs(horizontalAutocorrelation), Math.abs(verticalAutocorrelation)),
  };
}
