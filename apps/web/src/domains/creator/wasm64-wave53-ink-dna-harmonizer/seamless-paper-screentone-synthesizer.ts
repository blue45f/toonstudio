/**
 * Wave-53: 토러스 주기 무한 타일 브러시 질감·웹툰 스크린톤 합성기 (`seamless-paper-screentone-synthesizer`).
 *
 * 추출된 종이 결·해칭 DNA(`InkDnaProfile`)로부터 정수 역격자 파동과 토러스 래핑 Value 노이즈만으로
 * 상하·좌우 경계 불연속이 0인 무한 타일 브러시 텍스처 및 맞춤형 웹툰 스크린톤(`Uint8ClampedArray`)을 합성한다.
 */

import type { InkDnaProfile } from "./ink-dna-spectral-extractor";

export const DEFAULT_TILE_SIZE = 128;
export const DEFAULT_SYNTH_SEED = 53_881_029;

export type ScreentonePatternKind = "halftone-dots" | "line-hatch" | "cross-hatch" | "organic-sand";

export interface ToroidalSeamMetrics {
  /** 연속 토러스 필드 f(u+1, v) - f(u, v) 및 f(u, v+1) - f(u, v) 최대 오차 (0에 수렴) */
  readonly toroidalWrapError: number;
  /** 좌우 경계(x=W-1 ↔ x=0) 평균 휘도 차 [0..255] */
  readonly horizontalWrapMeanDiff: number;
  /** 내부 인접 열 평균 휘도 차 [0..255] */
  readonly interiorHorizontalMeanDiff: number;
  /** 상하 경계(y=H-1 ↔ y=0) 평균 휘도 차 [0..255] */
  readonly verticalWrapMeanDiff: number;
  /** 내부 인접 행 평균 휘도 차 [0..255] */
  readonly interiorVerticalMeanDiff: number;
  /** 내부 대비 초과 좌우 경계 불연속 [0..1] */
  readonly horizontalSeamExcess: number;
  /** 내부 대비 초과 상하 경계 불연속 [0..1] */
  readonly verticalSeamExcess: number;
  /** 상하·좌우 경계 연속성 통과 여부 */
  readonly isSeamless: boolean;
}

export interface SeamlessBrushTextureOptions {
  readonly tileSize?: number;
  readonly seed?: number;
  readonly contrast?: number;
  /** 브러시 잉크 RGB 채널 [0..255] (기본 24, 24, 26) */
  readonly inkRgb?: readonly [number, number, number];
}

export interface SeamlessBrushTexture {
  readonly width: number;
  readonly height: number;
  /** 무한 타일링 가능한 RGBA 텍스처 (`width * height * 4`) */
  readonly rgba: Uint8ClampedArray;
  /** 정규화 종이 결 높이맵 [0..1] (`width * height`) */
  readonly grainHeightMap: Float32Array;
  readonly seamMetrics: ToroidalSeamMetrics;
  readonly seed: number;
  readonly sourceDnaSignature: string;
}

export interface SeamlessScreentoneOptions {
  readonly tileSize?: number;
  readonly patternKind?: ScreentonePatternKind;
  /** 목표 스크린톤 어두운 면적 비율 [0.05..0.95] (기본 0.35) */
  readonly toneDensity?: number;
  /** 타일당 정수 선/도트 반복 주기 수 (미지정 시 DNA 주기에서 정수 산출) */
  readonly linesPerTile?: number;
  /** 해칭·망점 기울기 각도(라디안, 미지정 시 DNA 지배각 사용) */
  readonly angleRad?: number;
  /** 종이 결 기반 유기적 가장자리 흔들림 강도 [0..1] */
  readonly organicJitter?: number;
  readonly seed?: number;
  readonly inkRgb?: readonly [number, number, number];
}

export interface SeamlessScreentoneResult {
  readonly width: number;
  readonly height: number;
  readonly patternKind: ScreentonePatternKind;
  readonly targetToneDensity: number;
  readonly realizedToneDensity: number;
  /** 역격자 정수 파동 벡터 (kx, ky) — 상하·좌우 정확 주기 보장 */
  readonly reciprocalWaveVector: readonly [number, number];
  /** 무한 타일링 가능한 RGBA 스크린톤 (`width * height * 4`) */
  readonly rgba: Uint8ClampedArray;
  readonly seamMetrics: ToroidalSeamMetrics;
  readonly seed: number;
  readonly sourceDnaSignature: string;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min) return min;
  return value > max ? max : value;
}

function positiveMod(value: number, period: number): number {
  const m = value % period;
  return m < 0 ? m + period : m;
}

function quinticFade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function validateTileSize(tileSize: number): number {
  const n = Math.trunc(tileSize);
  if (!Number.isInteger(n) || n < 16 || n > 1024) {
    throw new Error("무한 타일 해상도는 16~1024 범위의 정수여야 합니다.");
  }
  return n;
}

/** 2D 정수 격자에서 결정론적 해시 [0..1]을 산출한다. */
function hashGrid2d(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix | 0, 374_761_393) + Math.imul(iy | 0, 668_265_263) + Math.imul(seed | 0, 1_442_695_041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1_274_126_177);
  h ^= h >>> 16;
  return (h >>> 0) / 0xffffffff;
}

/**
 * 토러스(T^2) 주기 래핑 2D Value 노이즈.
 * `u`와 `v`가 정수 1만큼 이동해도 격자 인덱스가 `periodX`, `periodY`로 정확히 순환하므로
 * `f(u + 1, v) === f(u, v)` 및 `f(u, v + 1) === f(u, v)`를 수학적으로 보장한다.
 */
export function sampleToroidalValueNoise(
  u: number,
  v: number,
  periodX: number,
  periodY: number,
  seed: number,
): number {
  const px = Math.max(1, Math.round(periodX));
  const py = Math.max(1, Math.round(periodY));
  const gx = positiveMod(u, 1) * px;
  const gy = positiveMod(v, 1) * py;
  const x0 = Math.floor(gx) % px;
  const y0 = Math.floor(gy) % py;
  const x1 = (x0 + 1) % px;
  const y1 = (y0 + 1) % py;
  const fx = quinticFade(gx - Math.floor(gx));
  const fy = quinticFade(gy - Math.floor(gy));

  const n00 = hashGrid2d(x0, y0, seed);
  const n10 = hashGrid2d(x1, y0, seed);
  const n01 = hashGrid2d(x0, y1, seed);
  const n11 = hashGrid2d(x1, y1, seed);

  const nx0 = n00 + (n10 - n00) * fx;
  const nx1 = n01 + (n11 - n01) * fx;
  return nx0 + (nx1 - nx0) * fy;
}

/** 원하는 각도와 주기 수에 가장 가까운 정수 역격자 파동 벡터 (kx, ky)를 산출한다. */
function resolveReciprocalWaveVector(linesPerTile: number, angleRad: number): readonly [number, number] {
  const freq = Math.max(2, Math.round(linesPerTile));
  // 해칭 선 방향이 angleRad일 때 파동 법선은 angleRad + PI/2이다.
  const normalAngle = angleRad + Math.PI / 2;
  let kx = Math.round(freq * Math.cos(normalAngle));
  const ky = Math.round(freq * Math.sin(normalAngle));
  if (kx === 0 && ky === 0) kx = freq;
  return [kx, ky];
}

function measureContinuousWrapError(evaluator: (u: number, v: number) => number, sampleSteps = 16): number {
  let maxErr = 0;
  for (let i = 0; i < sampleSteps; i += 1) {
    const t = i / sampleSteps;
    const errH = Math.abs(evaluator(0, t) - evaluator(1, t));
    const errV = Math.abs(evaluator(t, 0) - evaluator(t, 1));
    if (errH > maxErr) maxErr = errH;
    if (errV > maxErr) maxErr = errV;
  }
  return maxErr;
}

/** 생성된 RGBA 타일의 좌우·상하 래핑 경계 연속성을 픽셀 단위로 계측한다. */
export function measureToroidalSeamMetrics(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  toroidalWrapError = 0,
): ToroidalSeamMetrics {
  const lum = (x: number, y: number): number => {
    const idx = (y * width + x) * 4;
    const a = (rgba[idx + 3] ?? 255) / 255;
    const raw = 0.2126 * (rgba[idx] ?? 255) + 0.7152 * (rgba[idx + 1] ?? 255) + 0.0722 * (rgba[idx + 2] ?? 255);
    return raw * a + 255 * (1 - a);
  };

  let hWrapSum = 0;
  for (let y = 0; y < height; y += 1) {
    hWrapSum += Math.abs(lum(width - 1, y) - lum(0, y));
  }
  const horizontalWrapMeanDiff = hWrapSum / height;

  let hIntSum = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      hIntSum += Math.abs(lum(x + 1, y) - lum(x, y));
    }
  }
  const interiorHorizontalMeanDiff = hIntSum / (height * Math.max(1, width - 1));

  let vWrapSum = 0;
  for (let x = 0; x < width; x += 1) {
    vWrapSum += Math.abs(lum(x, height - 1) - lum(x, 0));
  }
  const verticalWrapMeanDiff = vWrapSum / width;

  let vIntSum = 0;
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width; x += 1) {
      vIntSum += Math.abs(lum(x, y + 1) - lum(x, y));
    }
  }
  const interiorVerticalMeanDiff = vIntSum / (width * Math.max(1, height - 1));

  const horizontalSeamExcess = Math.max(0, horizontalWrapMeanDiff - interiorHorizontalMeanDiff) / 255;
  const verticalSeamExcess = Math.max(0, verticalWrapMeanDiff - interiorVerticalMeanDiff) / 255;
  const isSeamless = toroidalWrapError <= 1e-6 && horizontalSeamExcess <= 0.06 && verticalSeamExcess <= 0.06;

  return {
    toroidalWrapError,
    horizontalWrapMeanDiff,
    interiorHorizontalMeanDiff,
    verticalWrapMeanDiff,
    interiorVerticalMeanDiff,
    horizontalSeamExcess,
    verticalSeamExcess,
    isSeamless,
  };
}

/** 작가 DNA의 종이 결 스펙트럼으로부터 경계 불연속이 없는 무한 타일 브러시 텍스처를 합성한다. */
export function synthesizeSeamlessBrushTexture(
  dna: InkDnaProfile,
  options: SeamlessBrushTextureOptions = {},
): SeamlessBrushTexture {
  const size = validateTileSize(options.tileSize ?? DEFAULT_TILE_SIZE);
  const seed = Math.trunc(options.seed ?? DEFAULT_SYNTH_SEED);
  const contrast = clampRange(options.contrast ?? 1.0, 0.25, 2.5);
  const inkRgb = options.inkRgb ?? [24, 24, 26];

  const spec = dna.paperGrainSpectrum;
  const [b0, b1, b2, b3] = spec.radialBandEnergy;
  const energyTotal = b0 + b1 + b2 + b3;
  const w0 = energyTotal > 1e-4 ? b0 / energyTotal : 0.22;
  const w1 = energyTotal > 1e-4 ? b1 / energyTotal : 0.34;
  const w2 = energyTotal > 1e-4 ? b2 / energyTotal : 0.28;
  const w3 = energyTotal > 1e-4 ? b3 / energyTotal : 0.16;

  const baseFreq =
    spec.dominantPeriodPx > 1.5
      ? clampRange(Math.round(size / spec.dominantPeriodPx), 4, Math.floor(size / 3))
      : Math.max(6, Math.round(size / 12));
  const [kx, ky] = resolveReciprocalWaveVector(baseFreq, spec.dominantAngleRad);
  const fiberWeight = clamp01(spec.anisotropy * 0.55);
  const grainStrength = clampRange(0.14 + spec.grainAmplitude * 0.65 + dna.edgeRoughnessIndex * 0.22, 0.1, 0.96);

  const p0 = Math.max(2, Math.round(size / 32));
  const p1 = Math.max(4, Math.round(size / 16));
  const p2 = Math.max(8, Math.round(size / 8));
  const p3 = Math.max(16, Math.round(size / 4));
  const phase = (hashGrid2d(7, 13, seed) * 2 - 1) * Math.PI;

  const evaluateGrain = (u: number, v: number): number => {
    const wu = positiveMod(u, 1);
    const wv = positiveMod(v, 1);
    const n0 = sampleToroidalValueNoise(wu, wv, p0, p0, seed + 11);
    const n1 = sampleToroidalValueNoise(wu, wv, p1, p1, seed + 29);
    const n2 = sampleToroidalValueNoise(wu, wv, p2, p2, seed + 53);
    const n3 = sampleToroidalValueNoise(wu, wv, p3, p3, seed + 97);
    const isoNoise = n0 * w0 + n1 * w1 + n2 * w2 + n3 * w3;
    const wave = 0.5 + 0.5 * Math.cos(2 * Math.PI * (kx * wu + ky * wv) + phase);
    const mixed = isoNoise * (1 - fiberWeight) + wave * fiberWeight;
    const centered = 0.5 + (mixed - 0.5) * contrast * (0.45 + grainStrength);
    return clamp01(centered);
  };

  const toroidalWrapError = measureContinuousWrapError(evaluateGrain);
  const grainHeightMap = new Float32Array(size * size);
  const rgba = new Uint8ClampedArray(size * size * 4);

  const inkR = clampRange(Math.round(inkRgb[0]), 0, 255);
  const inkG = clampRange(Math.round(inkRgb[1]), 0, 255);
  const inkB = clampRange(Math.round(inkRgb[2]), 0, 255);

  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const g = evaluateGrain(u, v);
      const idx = y * size + x;
      grainHeightMap[idx] = g;
      // 종이 결 높이맵과 작가의 잉크 농도 바닥값을 결합해 브러시 알파 투과 마스크를 생성한다.
      const inkCoverage = clamp01(dna.inkDensityFloor * (1 - grainStrength * 0.45) + g * grainStrength * 0.85);
      const base = idx * 4;
      rgba[base] = inkR;
      rgba[base + 1] = inkG;
      rgba[base + 2] = inkB;
      rgba[base + 3] = Math.round(inkCoverage * 255);
    }
  }

  const seamMetrics = measureToroidalSeamMetrics(rgba, size, size, toroidalWrapError);
  return {
    width: size,
    height: size,
    rgba,
    grainHeightMap,
    seamMetrics,
    seed,
    sourceDnaSignature: dna.dnaSignature,
  };
}

function selectPatternKindFromDna(dna: InkDnaProfile): ScreentonePatternKind {
  if (dna.paperGrainSpectrum.anisotropy >= 0.45) return "line-hatch";
  if (dna.edgeRoughnessIndex >= 0.52) return "organic-sand";
  return "halftone-dots";
}

/** 목표 톤 밀도(`toneDensity`)에 맞는 정확 임계값을 분위수로 계산한다. */
function findDensityThreshold(field: Float32Array, toneDensity: number): number {
  const sorted = Float32Array.from(field);
  sorted.sort();
  const idx = clampRange(Math.floor(toneDensity * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx] ?? 0.5;
}

/** 작가 DNA에 맞춘 토러스 무한 타일 웹툰 스크린톤(망점·사선 해칭·크로스 해칭·모래톤)을 합성한다. */
export function synthesizeSeamlessScreentone(
  dna: InkDnaProfile,
  options: SeamlessScreentoneOptions = {},
): SeamlessScreentoneResult {
  const size = validateTileSize(options.tileSize ?? DEFAULT_TILE_SIZE);
  const seed = Math.trunc(options.seed ?? DEFAULT_SYNTH_SEED + 7919);
  const patternKind = options.patternKind ?? selectPatternKindFromDna(dna);
  const targetToneDensity = clampRange(options.toneDensity ?? 0.35, 0.05, 0.95);
  const organicJitter = clamp01(options.organicJitter ?? dna.edgeRoughnessIndex);
  const angleRad = options.angleRad ?? (dna.paperGrainSpectrum.anisotropy > 0.15 ? dna.paperGrainSpectrum.dominantAngleRad : Math.PI / 4);

  const defaultLines =
    dna.paperGrainSpectrum.dominantPeriodPx > 2
      ? clampRange(Math.round(size / dna.paperGrainSpectrum.dominantPeriodPx), 4, Math.floor(size / 4))
      : Math.max(6, Math.round(size / 10));
  const linesPerTile = clampRange(Math.round(options.linesPerTile ?? defaultLines), 2, Math.floor(size / 3));
  const [kx, ky] = resolveReciprocalWaveVector(linesPerTile, angleRad);
  const k2x = -ky;
  const k2y = kx;

  const warpPeriod = Math.max(4, Math.round(size / 8));
  const sandPeriodA = Math.max(8, Math.round(size / 4));
  const sandPeriodB = Math.max(16, Math.round(size / 2));

  const evaluateToneField = (u: number, v: number): number => {
    const wu = positiveMod(u, 1);
    const wv = positiveMod(v, 1);
    const warp = (sampleToroidalValueNoise(wu, wv, warpPeriod, warpPeriod, seed + 131) - 0.5) * organicJitter * 0.42;
    const phi1 = 2 * Math.PI * (kx * wu + ky * wv) + warp * Math.PI;
    const phi2 = 2 * Math.PI * (k2x * wu + k2y * wv) - warp * Math.PI;
    if (patternKind === "halftone-dots") {
      const base = 0.5 + 0.25 * (Math.cos(phi1) + Math.cos(phi2));
      return clamp01(base + warp * 0.28);
    }
    if (patternKind === "line-hatch") {
      return clamp01(0.5 + 0.5 * Math.cos(phi1) + warp * 0.22);
    }
    if (patternKind === "cross-hatch") {
      const l1 = 0.5 + 0.5 * Math.cos(phi1);
      const l2 = 0.5 + 0.5 * Math.cos(phi2);
      return clamp01(Math.min(l1, l2) + warp * 0.2);
    }
    const fineA = sampleToroidalValueNoise(wu, wv, sandPeriodA, sandPeriodA, seed + 307);
    const fineB = sampleToroidalValueNoise(wu, wv, sandPeriodB, sandPeriodB, seed + 619);
    return clamp01(fineA * 0.45 + fineB * 0.55);
  };

  const toroidalWrapError = measureContinuousWrapError(evaluateToneField);
  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      field[y * size + x] = evaluateToneField(x / size, v);
    }
  }

  const threshold = findDensityThreshold(field, targetToneDensity);
  const feather = clampRange(0.03 + dna.microBleedRadiusPx * 0.025, 0.02, 0.14);
  const inkRgb = options.inkRgb ?? [18, 18, 22];
  const inkR = clampRange(Math.round(inkRgb[0]), 0, 255);
  const inkG = clampRange(Math.round(inkRgb[1]), 0, 255);
  const inkB = clampRange(Math.round(inkRgb[2]), 0, 255);

  const rgba = new Uint8ClampedArray(size * size * 4);
  let coverageSum = 0;

  for (let i = 0; i < field.length; i += 1) {
    const val = field[i] ?? 1;
    // 값이 threshold 이하일수록 잉크(어두운 도트/해칭)가 채워진다.
    const t = clamp01((threshold + feather - val) / (2 * feather));
    const smoothCoverage = t * t * (3 - 2 * t) * clampRange(dna.inkDensityFloor * 1.05, 0.35, 1);
    coverageSum += smoothCoverage;
    const base = i * 4;
    rgba[base] = inkR;
    rgba[base + 1] = inkG;
    rgba[base + 2] = inkB;
    rgba[base + 3] = Math.round(smoothCoverage * 255);
  }

  const seamMetrics = measureToroidalSeamMetrics(rgba, size, size, toroidalWrapError);
  return {
    width: size,
    height: size,
    patternKind,
    targetToneDensity,
    realizedToneDensity: coverageSum / Math.max(1, field.length),
    reciprocalWaveVector: [kx, ky],
    rgba,
    seamMetrics,
    seed,
    sourceDnaSignature: dna.dnaSignature,
  };
}
