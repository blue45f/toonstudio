/**
 * 실시간 Radix-2 FFT + Spectral Flux 온셋 비트 검출 기반 오디오 반응형 3D 스테이지 엔진.
 *
 * - Wave-3 Rust 오디오 DSP 출력(`left`/`right` 평면 PCM · `integratedLufs` · `truePeakLinear`) 및 모노 PCM 직접 호환
 * - Hann 윈도우 + 제자리 Cooley-Tukey Radix-2 FFT로 5개 스펙트럼 대역(Sub-bass · Bass · Mid · Presence · Brilliance) 추출
 * - 반파 정류 Spectral Flux 적응형 임계치 비트 검출기 + BPM 추정 + 어택/릴리즈 엔벨로프 추종
 * - 3D 광원 강도 · 셀 림 펄스 · 카메라 미세 진동 · 코믹 집중선 밀도를 구동하는 64바이트 정렬 WebGPU 유니폼 패킹
 */

export const AUDIO_REACTIVE_UNIFORM_BYTES = 64 as const;
export const DEFAULT_AUDIO_SAMPLE_RATE = 48_000 as const;
export const DEFAULT_AUDIO_FFT_SIZE = 1024 as const;

export const AUDIO_REACTIVE_FLAGS = {
  IS_BEAT_ONSET: 1 << 0,
  HIGH_ENERGY_CLIMAX: 1 << 1,
  TRUE_PEAK_LIMITER_GUARD: 1 << 2,
} as const;

/** 5대역 주파수 경계(Hz). */
export const AUDIO_BAND_RANGES_HZ = {
  subBass: [20, 60] as const,
  bass: [60, 250] as const,
  mid: [250, 2000] as const,
  presence: [2000, 6000] as const,
  brilliance: [6000, 20000] as const,
} as const;

/** 3D 스테이지 셰이더에서 `@binding`으로 직접 공유하는 64바이트 WGSL 유니폼 구조체 정의. */
export const WGSL_AUDIO_REACTIVE_STAGE_UNIFORMS: string = /* wgsl */ `
struct AudioReactiveStageUniforms {
  sub_bass: f32,
  bass: f32,
  mid: f32,
  presence: f32,
  brilliance: f32,
  spectral_flux: f32,
  beat_pulse: f32,
  estimated_bpm: f32,
  light_intensity_scale: f32,
  cel_rim_pulse: f32,
  camera_shake_x: f32,
  camera_shake_y: f32,
  speedline_density: f32,
  stage_time_sec: f32,
  frame_index: u32,
  flags: u32,
}`;

/** Wave-3 `Wave3MixMasterResult` / `Wave3BiquadEqResult` / `Wave3ReverbResult`와 직접 호환되는 입력 형태. */
export interface Wave3AudioPcmInput {
  readonly left: Float32Array;
  readonly right?: Float32Array;
  readonly sampleRate?: number;
  readonly integratedLufs?: number;
  readonly truePeakLinear?: number;
}

export type AudioReactivePcmSource = Float32Array | Wave3AudioPcmInput;

export interface Radix2FftResult {
  readonly fftSize: number;
  readonly sampleRate: number;
  readonly binHz: number;
  readonly magnitudes: Float32Array;
  readonly peakBin: number;
  readonly peakFrequencyHz: number;
  readonly peakMagnitude: number;
  readonly rmsLevel: number;
}

export interface FiveBandAudioEnergies {
  readonly subBass: number;
  readonly bass: number;
  readonly mid: number;
  readonly presence: number;
  readonly brilliance: number;
  readonly rawRms: {
    readonly subBass: number;
    readonly bass: number;
    readonly mid: number;
    readonly presence: number;
    readonly brilliance: number;
  };
}

export interface AudioReactiveStageState {
  readonly bands: FiveBandAudioEnergies;
  readonly spectralFlux: number;
  readonly adaptiveThreshold: number;
  readonly isBeatOnset: boolean;
  readonly beatPulse: number;
  readonly beatCount: number;
  readonly estimatedBpm: number;
  readonly lightIntensityScale: number;
  readonly celRimPulse: number;
  readonly cameraShakeX: number;
  readonly cameraShakeY: number;
  readonly speedlineDensity: number;
  readonly stageTimeSec: number;
  readonly frameIndex: number;
  readonly flags: number;
  readonly peakFrequencyHz: number;
  readonly rmsLevel: number;
}

export interface PackedAudioReactiveUniforms {
  readonly buffer: ArrayBuffer;
  readonly bytes: Uint8Array;
  readonly f32View: Float32Array;
  readonly u32View: Uint32Array;
  readonly byteLength: typeof AUDIO_REACTIVE_UNIFORM_BYTES;
  readonly state: AudioReactiveStageState;
}

export interface AudioReactiveStageEngineOptions {
  readonly sampleRate?: number;
  readonly fftSize?: number;
  readonly fluxHistoryLength?: number;
  readonly onsetSensitivity?: number;
  readonly onsetMinFluxFloor?: number;
  readonly minBeatIntervalMs?: number;
  readonly beatDecayPerSec?: number;
  readonly bandAttack?: number;
  readonly bandRelease?: number;
  readonly maxCameraShakeMeters?: number;
}

function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n >= 64 && n <= 16384 && (n & (n - 1)) === 0;
}

function normalizePcmToMono(source: AudioReactivePcmSource, fallbackSampleRate: number): {
  readonly mono: Float32Array;
  readonly sampleRate: number;
  readonly truePeakLinear: number;
} {
  if (source instanceof Float32Array) {
    let peak = 0;
    const mono = new Float32Array(source.length);
    for (let i = 0; i < source.length; i += 1) {
      const s = Number.isFinite(source[i]) ? source[i] : 0;
      mono[i] = s;
      const a = Math.abs(s);
      if (a > peak) peak = a;
    }
    return { mono, sampleRate: fallbackSampleRate, truePeakLinear: peak };
  }

  const left = source.left;
  const right = source.right;
  const len = right ? Math.min(left.length, right.length) : left.length;
  const mono = new Float32Array(len);
  let peak = source.truePeakLinear ?? 0;
  for (let i = 0; i < len; i += 1) {
    const l = Number.isFinite(left[i]) ? left[i] : 0;
    const r = right && Number.isFinite(right[i]) ? right[i] : l;
    const m = right ? (l + r) * 0.5 : l;
    mono[i] = m;
    const a = Math.max(Math.abs(l), Math.abs(r));
    if (a > peak) peak = a;
  }
  return {
    mono,
    sampleRate: source.sampleRate ?? fallbackSampleRate,
    truePeakLinear: peak,
  };
}

/**
 * 제자리 비트 반전 Cooley-Tukey Radix-2 FFT + Hann 윈도우를 계산해 정규화 크기 스펙트럼을 반환한다.
 * 단위 진폭 순수 사인파 입력 시 해당 빈의 크기가 약 `1.0`으로 정규화된다.
 */
export function computeRadix2FftMagnitude(
  pcmSamples: Float32Array,
  sampleRate: number = DEFAULT_AUDIO_SAMPLE_RATE,
  fftSize: number = DEFAULT_AUDIO_FFT_SIZE,
): Radix2FftResult {
  if (!isPowerOfTwo(fftSize)) {
    throw new RangeError(`fftSize는 64~16384 범위의 2의 거듭제곱이어야 합니다(실제 ${fftSize}).`);
  }
  const safeRate = clampNum(sampleRate, 8_000, 384_000);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  const copyLen = Math.min(pcmSamples.length, fftSize);
  const invDenom = fftSize > 1 ? 1 / (fftSize - 1) : 0;
  let sqSum = 0;

  for (let i = 0; i < copyLen; i += 1) {
    const raw = Number.isFinite(pcmSamples[i]) ? pcmSamples[i] : 0;
    sqSum += raw * raw;
    const hann = 0.5 * (1 - Math.cos(2 * Math.PI * i * invDenom));
    re[i] = raw * hann;
  }

  // 비트 반전 치환
  let j = 0;
  for (let i = 1; i < fftSize; i += 1) {
    let bit = fftSize >> 1;
    while ((j & bit) !== 0) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      const tmpR = re[i];
      re[i] = re[j];
      re[j] = tmpR;
    }
  }

  // 반복적 Radix-2 버터플라이
  for (let size = 2; size <= fftSize; size <<= 1) {
    const half = size >> 1;
    const angleStep = (-2 * Math.PI) / size;
    const wStepR = Math.cos(angleStep);
    const wStepI = Math.sin(angleStep);
    for (let start = 0; start < fftSize; start += size) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < half; k += 1) {
        const evenIdx = start + k;
        const oddIdx = evenIdx + half;
        const oddR = re[oddIdx];
        const oddI = im[oddIdx];
        const tr = wr * oddR - wi * oddI;
        const ti = wr * oddI + wi * oddR;

        re[oddIdx] = re[evenIdx] - tr;
        im[oddIdx] = im[evenIdx] - ti;
        re[evenIdx] += tr;
        im[evenIdx] += ti;

        const nextWr = wr * wStepR - wi * wStepI;
        wi = wr * wStepI + wi * wStepR;
        wr = nextWr;
      }
    }
  }

  // Hann 윈도우 코히런트 게인(0.5) 보정: 양측 스펙트럼 합산 2 / (N * 0.5) = 4 / N
  const halfBins = (fftSize >> 1) + 1;
  const magnitudes = new Float32Array(halfBins);
  const scale = 4 / fftSize;
  const dcScale = 2 / fftSize;
  let peakBin = 0;
  let peakMagnitude = 0;

  for (let k = 0; k < halfBins; k += 1) {
    const s = k === 0 || k === fftSize >> 1 ? dcScale : scale;
    const mag = Math.hypot(re[k], im[k]) * s;
    magnitudes[k] = mag;
    if (k > 0 && mag > peakMagnitude) {
      peakMagnitude = mag;
      peakBin = k;
    }
  }

  const binHz = safeRate / fftSize;
  return {
    fftSize,
    sampleRate: safeRate,
    binHz,
    magnitudes,
    peakBin,
    peakFrequencyHz: peakBin * binHz,
    peakMagnitude,
    rmsLevel: copyLen > 0 ? Math.sqrt(sqSum / copyLen) : 0,
  };
}

function bandEnergyFromSpectrum(
  magnitudes: Float32Array,
  binHz: number,
  minHz: number,
  maxHz: number,
): number {
  const maxBin = magnitudes.length - 1;
  const lo = Math.max(1, Math.min(maxBin, Math.round(minHz / binHz)));
  const hi = Math.max(lo, Math.min(maxBin, Math.round(maxHz / binHz)));
  let peak = 0;
  let sqSum = 0;
  let count = 0;
  for (let k = lo; k <= hi; k += 1) {
    const m = magnitudes[k];
    if (m > peak) peak = m;
    sqSum += m * m;
    count += 1;
  }
  const rms = count > 0 ? Math.sqrt(sqSum / count) : 0;
  // 대역 내 좁은 톤(단일 사인파)과 광대역 타격음 모두 안정적으로 포착
  return peak * 0.65 + rms * 0.35;
}

function compressBandLevel(rawEnergy: number, gain: number): number {
  const clamped = Math.max(0, rawEnergy);
  return clampNum(Math.log1p(clamped * gain) / Math.log1p(gain), 0, 1);
}

/** FFT 크기 스펙트럼에서 Sub-bass / Bass / Mid / Presence / Brilliance 5대역 에너지를 추출한다. */
export function extract5BandSpectrumEnergies(fft: Radix2FftResult): FiveBandAudioEnergies {
  const rawSub = bandEnergyFromSpectrum(fft.magnitudes, fft.binHz, AUDIO_BAND_RANGES_HZ.subBass[0], AUDIO_BAND_RANGES_HZ.subBass[1]);
  const rawBass = bandEnergyFromSpectrum(fft.magnitudes, fft.binHz, AUDIO_BAND_RANGES_HZ.bass[0], AUDIO_BAND_RANGES_HZ.bass[1]);
  const rawMid = bandEnergyFromSpectrum(fft.magnitudes, fft.binHz, AUDIO_BAND_RANGES_HZ.mid[0], AUDIO_BAND_RANGES_HZ.mid[1]);
  const rawPres = bandEnergyFromSpectrum(fft.magnitudes, fft.binHz, AUDIO_BAND_RANGES_HZ.presence[0], AUDIO_BAND_RANGES_HZ.presence[1]);
  const rawBril = bandEnergyFromSpectrum(fft.magnitudes, fft.binHz, AUDIO_BAND_RANGES_HZ.brilliance[0], AUDIO_BAND_RANGES_HZ.brilliance[1]);

  return {
    subBass: compressBandLevel(rawSub, 4.0),
    bass: compressBandLevel(rawBass, 4.0),
    mid: compressBandLevel(rawMid, 4.5),
    presence: compressBandLevel(rawPres, 5.0),
    brilliance: compressBandLevel(rawBril, 5.5),
    rawRms: {
      subBass: rawSub,
      bass: rawBass,
      mid: rawMid,
      presence: rawPres,
      brilliance: rawBril,
    },
  };
}

/** 오디오 반응형 스테이지 상태를 정확히 64바이트 WebGPU 유니폼 버퍼로 패킹한다. */
export function packAudioReactiveStageUniforms(state: AudioReactiveStageState): PackedAudioReactiveUniforms {
  const buffer = new ArrayBuffer(AUDIO_REACTIVE_UNIFORM_BYTES);
  const view = new DataView(buffer);
  view.setFloat32(0, Math.fround(clampNum(state.bands.subBass, 0, 1)), true);
  view.setFloat32(4, Math.fround(clampNum(state.bands.bass, 0, 1)), true);
  view.setFloat32(8, Math.fround(clampNum(state.bands.mid, 0, 1)), true);
  view.setFloat32(12, Math.fround(clampNum(state.bands.presence, 0, 1)), true);
  view.setFloat32(16, Math.fround(clampNum(state.bands.brilliance, 0, 1)), true);
  view.setFloat32(20, Math.fround(Math.max(0, state.spectralFlux)), true);
  view.setFloat32(24, Math.fround(clampNum(state.beatPulse, 0, 1)), true);
  view.setFloat32(28, Math.fround(clampNum(state.estimatedBpm, 0, 300)), true);
  view.setFloat32(32, Math.fround(clampNum(state.lightIntensityScale, 0.25, 4.0)), true);
  view.setFloat32(36, Math.fround(clampNum(state.celRimPulse, 0, 1)), true);
  view.setFloat32(40, Math.fround(clampNum(state.cameraShakeX, -1, 1)), true);
  view.setFloat32(44, Math.fround(clampNum(state.cameraShakeY, -1, 1)), true);
  view.setFloat32(48, Math.fround(clampNum(state.speedlineDensity, 0, 1)), true);
  view.setFloat32(52, Math.fround(Math.max(0, state.stageTimeSec)), true);
  view.setUint32(56, Math.max(0, Math.floor(state.frameIndex)) >>> 0, true);
  view.setUint32(60, state.flags >>> 0, true);

  return {
    buffer,
    bytes: new Uint8Array(buffer),
    f32View: new Float32Array(buffer),
    u32View: new Uint32Array(buffer),
    byteLength: AUDIO_REACTIVE_UNIFORM_BYTES,
    state,
  };
}

/**
 * 실시간 3D 스테이지 오디오 반응 엔진.
 * 프레임 단위 PCM 청크를 입력받아 Spectral Flux 온셋 검출, BPM 추정, 64B GPU 유니폼 출력을 수행한다.
 */
export class AudioReactive3dStageEngine {
  private readonly defaultSampleRate: number;
  private readonly fftSize: number;
  private readonly fluxHistoryLength: number;
  private readonly onsetSensitivity: number;
  private readonly onsetMinFluxFloor: number;
  private readonly minBeatIntervalSec: number;
  private readonly beatDecayPerSec: number;
  private readonly bandAttack: number;
  private readonly bandRelease: number;
  private readonly maxCameraShakeMeters: number;

  private prevMagnitudes: Float32Array;
  private readonly fluxHistory: number[] = [];
  private readonly onsetIntervalsSec: number[] = [];
  private lastOnsetTimeSec = -10;
  private stageTimeSec = 0;
  private frameIndex = 0;
  private beatCount = 0;
  private beatPulse = 0;
  private estimatedBpm = 0;
  private smoothedBands = { subBass: 0, bass: 0, mid: 0, presence: 0, brilliance: 0 };

  constructor(options: AudioReactiveStageEngineOptions = {}) {
    this.defaultSampleRate = clampNum(options.sampleRate ?? DEFAULT_AUDIO_SAMPLE_RATE, 8_000, 384_000);
    const fftSize = options.fftSize ?? DEFAULT_AUDIO_FFT_SIZE;
    if (!isPowerOfTwo(fftSize)) {
      throw new RangeError(`fftSize는 64~16384 범위의 2의 거듭제곱이어야 합니다(실제 ${fftSize}).`);
    }
    this.fftSize = fftSize;
    this.fluxHistoryLength = Math.max(4, Math.min(128, Math.floor(options.fluxHistoryLength ?? 24)));
    this.onsetSensitivity = clampNum(options.onsetSensitivity ?? 1.45, 0.25, 6.0);
    this.onsetMinFluxFloor = clampNum(options.onsetMinFluxFloor ?? 0.018, 0.001, 1.0);
    this.minBeatIntervalSec = clampNum(options.minBeatIntervalMs ?? 180, 60, 2000) / 1000;
    this.beatDecayPerSec = clampNum(options.beatDecayPerSec ?? 5.5, 0.5, 30.0);
    this.bandAttack = clampNum(options.bandAttack ?? 0.72, 0.05, 1.0);
    this.bandRelease = clampNum(options.bandRelease ?? 0.22, 0.02, 1.0);
    this.maxCameraShakeMeters = clampNum(options.maxCameraShakeMeters ?? 0.035, 0.0, 0.25);
    this.prevMagnitudes = new Float32Array((fftSize >> 1) + 1);
  }

  /** 내부 히스토리와 비트 검출 상태를 초기화한다. */
  reset(): void {
    this.prevMagnitudes.fill(0);
    this.fluxHistory.length = 0;
    this.onsetIntervalsSec.length = 0;
    this.lastOnsetTimeSec = -10;
    this.stageTimeSec = 0;
    this.frameIndex = 0;
    this.beatCount = 0;
    this.beatPulse = 0;
    this.estimatedBpm = 0;
    this.smoothedBands = { subBass: 0, bass: 0, mid: 0, presence: 0, brilliance: 0 };
  }

  /**
   * 단일 PCM 프레임(모노 또는 Wave-3 스테레오 평면 버스)을 분석해 64바이트 GPU 유니폼을 생성한다.
   * `dtSec`를 생략하면 `pcmLength / sampleRate`를 자동 사용한다.
   */
  processFrame(source: AudioReactivePcmSource, dtSec?: number): PackedAudioReactiveUniforms {
    const { mono, sampleRate, truePeakLinear } = normalizePcmToMono(source, this.defaultSampleRate);
    const frameDt =
      typeof dtSec === "number" && Number.isFinite(dtSec) && dtSec > 0
        ? dtSec
        : Math.max(mono.length, 1) / sampleRate;
    this.stageTimeSec += frameDt;

    const fft = computeRadix2FftMagnitude(mono, sampleRate, this.fftSize);
    const instBands = extract5BandSpectrumEnergies(fft);

    // 반파 정류 Spectral Flux 계산(20Hz ~ 4500Hz 타격·리듬 대역 가중)
    const minFluxBin = Math.max(1, Math.floor(20 / fft.binHz));
    const maxFluxBin = Math.min(fft.magnitudes.length - 1, Math.ceil(4500 / fft.binHz));
    let fluxAccum = 0;
    let fluxWeightSum = 0;
    for (let k = minFluxBin; k <= maxFluxBin; k += 1) {
      const diff = fft.magnitudes[k] - this.prevMagnitudes[k];
      const freq = k * fft.binHz;
      const w = freq <= 250 ? 2.2 : freq <= 1200 ? 1.2 : 0.7;
      if (diff > 0) fluxAccum += diff * w;
      fluxWeightSum += w;
    }
    const spectralFlux = fluxWeightSum > 0 ? fluxAccum / Math.sqrt(fluxWeightSum) : 0;
    this.prevMagnitudes.set(fft.magnitudes);

    // 적응형 임계치(이동 평균 + 민감도 × 표준편차 + 바닥값)
    let meanFlux = 0;
    for (let i = 0; i < this.fluxHistory.length; i += 1) meanFlux += this.fluxHistory[i];
    if (this.fluxHistory.length > 0) meanFlux /= this.fluxHistory.length;
    let varFlux = 0;
    for (let i = 0; i < this.fluxHistory.length; i += 1) {
      const d = this.fluxHistory[i] - meanFlux;
      varFlux += d * d;
    }
    const stdFlux = this.fluxHistory.length > 1 ? Math.sqrt(varFlux / this.fluxHistory.length) : 0;
    const adaptiveThreshold = meanFlux + this.onsetSensitivity * stdFlux + this.onsetMinFluxFloor;

    const sinceLastBeat = this.stageTimeSec - this.lastOnsetTimeSec;
    const isBeatOnset =
      spectralFlux > adaptiveThreshold &&
      sinceLastBeat >= this.minBeatIntervalSec &&
      fft.rmsLevel > 0.015;

    this.fluxHistory.push(spectralFlux);
    if (this.fluxHistory.length > this.fluxHistoryLength) {
      this.fluxHistory.shift();
    }

    if (isBeatOnset) {
      if (this.beatCount > 0 && sinceLastBeat >= 0.25 && sinceLastBeat <= 1.5) {
        this.onsetIntervalsSec.push(sinceLastBeat);
        if (this.onsetIntervalsSec.length > 8) this.onsetIntervalsSec.shift();
        let ioiSum = 0;
        for (let i = 0; i < this.onsetIntervalsSec.length; i += 1) ioiSum += this.onsetIntervalsSec[i];
        const avgIoi = ioiSum / this.onsetIntervalsSec.length;
        this.estimatedBpm = clampNum(60 / avgIoi, 50, 220);
      }
      this.lastOnsetTimeSec = this.stageTimeSec;
      this.beatCount += 1;
      this.beatPulse = 1.0;
    } else {
      this.beatPulse = this.beatPulse * Math.exp(-this.beatDecayPerSec * frameDt);
      if (this.beatPulse < 1e-4) this.beatPulse = 0;
    }

    // 대역별 어택/릴리즈 스무딩
    const smooth = (prev: number, next: number): number => {
      const alpha = next >= prev ? this.bandAttack : this.bandRelease;
      return prev + (next - prev) * alpha;
    };
    this.smoothedBands = {
      subBass: smooth(this.smoothedBands.subBass, instBands.subBass),
      bass: smooth(this.smoothedBands.bass, instBands.bass),
      mid: smooth(this.smoothedBands.mid, instBands.mid),
      presence: smooth(this.smoothedBands.presence, instBands.presence),
      brilliance: smooth(this.smoothedBands.brilliance, instBands.brilliance),
    };

    const { subBass, bass, mid, presence, brilliance } = this.smoothedBands;
    const lightIntensityScale = clampNum(1.0 + bass * 0.55 + subBass * 0.35 + this.beatPulse * 0.5, 0.6, 2.5);
    const celRimPulse = clampNum(presence * 0.42 + brilliance * 0.33 + this.beatPulse * 0.55, 0, 1);
    const shakeMag = clampNum((subBass * 0.65 + this.beatPulse * 0.75) * this.maxCameraShakeMeters, 0, this.maxCameraShakeMeters);
    const cameraShakeX = Math.sin(this.stageTimeSec * 41.3 + this.frameIndex * 0.37) * shakeMag;
    const cameraShakeY = Math.cos(this.stageTimeSec * 53.7 + this.frameIndex * 0.61) * shakeMag * 0.75;
    const speedlineDensity = clampNum(
      this.beatPulse * 0.45 + Math.min(spectralFlux * 2.5, 1.0) * 0.3 + mid * 0.15 + brilliance * 0.2,
      0,
      1,
    );

    let flags = 0;
    if (isBeatOnset) flags |= AUDIO_REACTIVE_FLAGS.IS_BEAT_ONSET;
    if (lightIntensityScale >= 1.75 || speedlineDensity >= 0.72) flags |= AUDIO_REACTIVE_FLAGS.HIGH_ENERGY_CLIMAX;
    if (truePeakLinear >= 0.98) flags |= AUDIO_REACTIVE_FLAGS.TRUE_PEAK_LIMITER_GUARD;

    const currentFrame = this.frameIndex;
    this.frameIndex += 1;

    const state: AudioReactiveStageState = {
      bands: {
        ...this.smoothedBands,
        rawRms: instBands.rawRms,
      },
      spectralFlux,
      adaptiveThreshold,
      isBeatOnset,
      beatPulse: this.beatPulse,
      beatCount: this.beatCount,
      estimatedBpm: this.estimatedBpm,
      lightIntensityScale,
      celRimPulse,
      cameraShakeX,
      cameraShakeY,
      speedlineDensity,
      stageTimeSec: this.stageTimeSec,
      frameIndex: currentFrame,
      flags,
      peakFrequencyHz: fft.peakFrequencyHz,
      rmsLevel: fft.rmsLevel,
    };

    return packAudioReactiveStageUniforms(state);
  }
}
