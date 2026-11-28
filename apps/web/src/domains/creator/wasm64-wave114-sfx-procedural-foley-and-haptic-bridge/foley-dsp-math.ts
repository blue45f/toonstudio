/**
 * Wave 114 내부 DSP 신호 처리·수학 기본 유틸리티.
 *
 * 결정론적 FNV-1a 시드 해시, Mulberry32 PRNG, 2차 Biquad 필터,
 * 기수-2 Cooley-Tukey FFT 스펙트럼 중심 계산 및 PCM 음향 기술자 실측을 제공한다.
 */

/** 지원하는 결정론적 출력 샘플레이트(Hz). */
export type SfxSampleRateHz = 16000 | 24000 | 48000;

/** 합성된 모노 PCM의 실측 음향 기술자. */
export interface SfxAcousticDescriptors {
  readonly sampleCount: number;
  readonly sampleRateHz: SfxSampleRateHz;
  readonly durationMs: number;
  readonly maxAbsSample: number;
  readonly peakDbfs: number;
  readonly rmsLinear: number;
  readonly rmsDbfs: number;
  readonly dcOffset: number;
  readonly spectralCentroidHz: number;
  readonly zeroCrossingRate: number;
  readonly nonFiniteSampleCount: number;
  readonly transientTimesMs: readonly number[];
}

/** 결정론적 Mulberry32 의사난수 생성기(`[-1, 1]` 및 `[0, 1)`). */
export interface DeterministicRng {
  readonly nextUnit: () => number;
  readonly nextBipolar: () => number;
}

/** 2차 Biquad 필터 상태. */
export interface BiquadState {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

/** 2차 Biquad 필터 계수. */
export interface BiquadCoeffs {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
}

export const TWO_PI = Math.PI * 2;
const MIN_DBFS = -120;

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

/** 선형 진폭을 dBFS로 변환한다. */
export function linearToDbfs(linear: number): number {
  if (!Number.isFinite(linear) || linear <= 1e-6) return MIN_DBFS;
  return Math.max(MIN_DBFS, 20 * Math.log10(linear));
}

/** 문자열·숫자 시드를 결정론적 32비트 부호 없는 정수로 변환한다(FNV-1a). */
export function normalizeDeterministicSeed(
  seed: number | string | undefined,
  fallbackSalt: string,
): number {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    const mixed = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
    return mixed === 0 ? 0x6d2b79f5 : mixed;
  }
  const source = typeof seed === "string" && seed.length > 0 ? seed : fallbackSalt;
  let hash = 0x811c9dc5;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const unsigned = hash >>> 0;
  return unsigned === 0 ? 0x6d2b79f5 : unsigned;
}

export function createDeterministicRng(seedNumber: number): DeterministicRng {
  let state = seedNumber >>> 0;
  const nextUnit = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { nextUnit, nextBipolar: () => nextUnit() * 2 - 1 };
}

export function makeBiquadCoeffs(
  mode: "lowpass" | "bandpass" | "highpass",
  sampleRateHz: number,
  cutoffHz: number,
  q: number,
): BiquadCoeffs {
  const safeFreq = clamp(cutoffHz, 20, sampleRateHz * 0.45);
  const safeQ = clamp(q, 0.35, 18);
  const w0 = (TWO_PI * safeFreq) / sampleRateHz;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * safeQ);
  const a0 = 1 + alpha;
  const a1 = (-2 * cosW0) / a0;
  const a2 = (1 - alpha) / a0;

  if (mode === "lowpass") {
    const b1 = 1 - cosW0;
    const b0 = b1 * 0.5;
    return { b0: b0 / a0, b1: b1 / a0, b2: b0 / a0, a1, a2 };
  }
  if (mode === "highpass") {
    const b1 = -(1 + cosW0);
    const b0 = (1 + cosW0) * 0.5;
    return { b0: b0 / a0, b1: b1 / a0, b2: b0 / a0, a1, a2 };
  }
  return { b0: alpha / a0, b1: 0, b2: -alpha / a0, a1, a2 };
}

export function stepBiquad(state: BiquadState, coeffs: BiquadCoeffs, input: number): number {
  const y =
    coeffs.b0 * input +
    coeffs.b1 * state.x1 +
    coeffs.b2 * state.x2 -
    coeffs.a1 * state.y1 -
    coeffs.a2 * state.y2;
  state.x2 = state.x1;
  state.x1 = input;
  state.y2 = state.y1;
  state.y1 = Number.isFinite(y) ? y : 0;
  return state.y1;
}

/** 제자리(in-place) 기수-2 Cooley-Tukey FFT. */
function fftRadix2(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  let j = 0;
  for (let i = 0; i < n; i += 1) {
    if (i < j) {
      const tmpRe = re[i] ?? 0;
      const tmpIm = im[i] ?? 0;
      re[i] = re[j] ?? 0;
      im[i] = im[j] ?? 0;
      re[j] = tmpRe;
      im[j] = tmpIm;
    }
    let bit = n >> 1;
    while (bit > 0 && (j & bit) !== 0) {
      j ^= bit;
      bit >>= 1;
    }
    j |= bit;
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angleStep = -TWO_PI / len;
    for (let start = 0; start < n; start += len) {
      for (let k = 0; k < half; k += 1) {
        const angle = angleStep * k;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const evenIdx = start + k;
        const oddIdx = evenIdx + half;
        const oddRe = re[oddIdx] ?? 0;
        const oddIm = im[oddIdx] ?? 0;
        const tr = wr * oddRe - wi * oddIm;
        const ti = wr * oddIm + wi * oddRe;
        const evenRe = re[evenIdx] ?? 0;
        const evenIm = im[evenIdx] ?? 0;
        re[evenIdx] = evenRe + tr;
        im[evenIdx] = evenIm + ti;
        re[oddIdx] = evenRe - tr;
        im[oddIdx] = evenIm - ti;
      }
    }
  }
}

/** 다중 Hann 창 FFT 스펙트럼으로 스펙트럼 중심 주파수(Hz)를 실측한다. */
function computeSpectralCentroidHz(pcm: Float32Array, sampleRateHz: number): number {
  const n = pcm.length;
  if (n < 32) return 0;

  const fftSize = 1024;
  const halfBins = fftSize >> 1;
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const frameCount = Math.min(24, Math.max(1, Math.ceil(n / 512)));
  const maxStart = Math.max(0, n - fftSize);

  let weightedFreqSum = 0;
  let magSum = 0;

  for (let f = 0; f < frameCount; f += 1) {
    const start = frameCount === 1 ? 0 : Math.floor((f / (frameCount - 1)) * maxStart);
    for (let k = 0; k < fftSize; k += 1) {
      const sample = start + k < n ? (pcm[start + k] ?? 0) : 0;
      re[k] = sample * (0.5 * (1 - Math.cos((TWO_PI * k) / (fftSize - 1))));
      im[k] = 0;
    }
    fftRadix2(re, im);

    for (let bin = 1; bin <= halfBins; bin += 1) {
      const r = re[bin] ?? 0;
      const imVal = im[bin] ?? 0;
      const mag = Math.sqrt(r * r + imVal * imVal);
      weightedFreqSum += ((bin * sampleRateHz) / fftSize) * mag;
      magSum += mag;
    }
  }

  return magSum > 1e-9 ? weightedFreqSum / magSum : 0;
}

/** 모노 PCM 버퍼에서 피크, RMS, DC 오프셋, 스펙트럼 중심, 영교차율, 비유한 샘플 수를 실측한다. */
export function analyzePcmAcousticDescriptors(
  pcm: Float32Array,
  sampleRateHz: SfxSampleRateHz,
  transientTimesMs: readonly number[] = [],
): SfxAcousticDescriptors {
  const n = pcm.length;
  let maxAbsSample = 0;
  let sumSq = 0;
  let sum = 0;
  let zeroCrossings = 0;
  let nonFiniteSampleCount = 0;

  for (let i = 0; i < n; i += 1) {
    const sample = pcm[i] ?? 0;
    if (!Number.isFinite(sample)) {
      nonFiniteSampleCount += 1;
      continue;
    }
    const abs = Math.abs(sample);
    if (abs > maxAbsSample) maxAbsSample = abs;
    sumSq += sample * sample;
    sum += sample;
    if (i > 0) {
      const prev = pcm[i - 1] ?? 0;
      if ((prev >= 0 && sample < 0) || (prev < 0 && sample >= 0)) zeroCrossings += 1;
    }
  }

  const validCount = Math.max(1, n - nonFiniteSampleCount);
  const rmsLinear = Math.sqrt(sumSq / validCount);
  return {
    sampleCount: n,
    sampleRateHz,
    durationMs: Math.round((n / sampleRateHz) * 1000 * 100) / 100,
    maxAbsSample,
    peakDbfs: linearToDbfs(maxAbsSample),
    rmsLinear,
    rmsDbfs: linearToDbfs(rmsLinear),
    dcOffset: sum / validCount,
    spectralCentroidHz: computeSpectralCentroidHz(pcm, sampleRateHz),
    zeroCrossingRate: n > 1 ? zeroCrossings / (n - 1) : 0,
    nonFiniteSampleCount,
    transientTimesMs,
  };
}
