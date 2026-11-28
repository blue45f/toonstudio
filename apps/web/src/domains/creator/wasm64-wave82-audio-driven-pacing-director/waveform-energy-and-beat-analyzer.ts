/**
 * Wave-82: 오디오·BGM 파형 에너지·스펙트럼 플럭스·비트 온셋 분석기.
 *
 * 외부 오디오 라이브러리 없이 순수 TypeScript만으로 모노 PCM(`Float32Array`) 또는
 * 합성 리듬 디스크립터를 해석해 다음 지표들을 결정론적으로 산출한다.
 * - 단시간 윈도우 RMS 음량 곡선(dBFS 및 0..1 정규화 에너지)
 * - 4차 캐스케이드 바이쿼드 크로스오버 기반 3대역 에너지 분리
 *   (`subBass20To150Hz`, `mid150To2500Hz`, `highTransient2500PlusHz`)
 * - 다주파수 Goertzel 뱅크 기반 스펙트럼 플럭스·에너지 도함수 온셋 검출
 * - 적응형 국소 임계값 + 포물선 보간 기반 비트 타임스탬프 및 BPM 추정
 * - 직전 무음·숨고르기 구간(`silenceHolds`) 및 극적 드롭·클라이맥스 피크(`climaxMoments`)
 */

/** 합성 테스트 파형 프리셋 종류. */
export type SyntheticAudioPreset = "ambient-calm-pad" | "crescendo-strings" | "kick-drum-steady" | "silence-then-drop" | "staccato-action-percussion";

/** 결정론적 합성 오디오 파형 사양. */
export interface SyntheticAudioWaveformSpec {
  readonly bpm?: number;
  readonly durationMs: number;
  readonly peakAmplitude?: number;
  readonly preset: SyntheticAudioPreset;
  readonly sampleRateHz?: number;
  readonly seed?: number;
  readonly silenceDurationMs?: number;
  readonly silenceStartMs?: number;
  readonly startOffsetMs?: number;
}

/** 합성된 테스트 PCM 파형과 기준 정답 메타데이터. */
export interface SynthesizedAudioWaveform {
  readonly bpm: number;
  readonly durationMs: number;
  readonly expectedBeatTimesMs: readonly number[];
  readonly expectedClimaxTimesMs: readonly number[];
  readonly expectedSilenceRangeMs: readonly [number, number] | null;
  readonly pcmSamples: Float32Array;
  readonly preset: SyntheticAudioPreset;
  readonly sampleRateHz: number;
}

/** 오디오 트랙 분석 입력 (원시 PCM 또는 합성 디스크립터). */
export interface AudioTrackAnalysisInput {
  readonly climaxThresholdNormalized?: number;
  readonly frameSizeMs?: number;
  readonly hopSizeMs?: number;
  readonly maxBpm?: number;
  readonly minBeatIntervalMs?: number;
  readonly minBpm?: number;
  readonly minClimaxSeparationMs?: number;
  readonly minSilenceDurationMs?: number;
  readonly onsetSensitivity?: number;
  readonly pcmSamples?: Float32Array;
  readonly sampleRateHz?: number;
  readonly silenceThresholdDbfs?: number;
  readonly syntheticDescriptor?: SyntheticAudioWaveformSpec;
  readonly trackId?: string;
}

/** 프레임별 3대역 분리 에너지(정규화 0..1 및 원시 RMS). */
export interface ThreeBandEnergySnapshot {
  readonly highTransient2500PlusHz: number;
  readonly highTransientRawRms: number;
  readonly mid150To2500Hz: number;
  readonly midRawRms: number;
  readonly subBass20To150Hz: number;
  readonly subBassRawRms: number;
}

/** 단시간 분석 프레임 단위 에너지·플럭스 데이터. */
export interface AudioEnvelopeFrame {
  readonly bands: ThreeBandEnergySnapshot;
  readonly dbfs: number;
  readonly frameIndex: number;
  readonly normalizedEnergy: number;
  readonly noveltyScore: number;
  readonly rawSpectralFlux: number;
  readonly rms: number;
  readonly spectralFlux: number;
  readonly timeMs: number;
}

/** 검출된 비트 온셋 이벤트. */
export interface BeatOnsetEvent {
  readonly beatIndex: number;
  readonly highTransientEnergy: number;
  readonly isStrongDownbeat: boolean;
  readonly strength: number;
  readonly subBassEnergy: number;
  readonly timeMs: number;
}

/** 극적 드롭·클라이맥스 유형. */
export type ClimaxMomentKind = "bass-drop" | "crescendo-peak" | "transient-burst";

/** 극적 드롭·클라이맥스 피크 정보. */
export interface ClimaxMoment {
  readonly climaxIndex: number;
  readonly dramaticScore: number;
  readonly energyJumpRatio: number;
  readonly highTransientImpact: number;
  readonly kind: ClimaxMomentKind;
  readonly peakDbfs: number;
  readonly peakEnergy: number;
  readonly precededBySilenceMs: number;
  readonly subBassImpact: number;
  readonly timeMs: number;
}

/** 무음·호흡 정지(긴장 고조) 구간 정보. */
export interface SilenceHoldSegment {
  readonly averageDbfs: number;
  readonly durationMs: number;
  readonly endMs: number;
  readonly holdIndex: number;
  readonly linkedClimaxIndex: number | null;
  readonly minDbfs: number;
  readonly precedesClimax: boolean;
  readonly startMs: number;
}

/** 전체 오디오 트랙 분석 결과. */
export interface AudioPacingAnalysis {
  readonly averageDbfs: number;
  readonly averageEnergy: number;
  readonly averageRawSpectralFlux: number;
  readonly beatIntervalMs: number;
  readonly beatOnsets: readonly BeatOnsetEvent[];
  readonly beatTimestampsMs: readonly number[];
  readonly bpmConfidence: number;
  readonly climaxMoments: readonly ClimaxMoment[];
  readonly durationMs: number;
  readonly dynamicRangeDb: number;
  readonly estimatedBpm: number;
  readonly frameSizeMs: number;
  readonly frames: readonly AudioEnvelopeFrame[];
  readonly hopSizeMs: number;
  readonly peakDbfs: number;
  readonly peakRawSpectralFlux: number;
  readonly peakRms: number;
  readonly sampleRateHz: number;
  readonly silenceHolds: readonly SilenceHoldSegment[];
  readonly trackId: string;
}

interface BiquadCoeff { readonly a1: number; readonly a2: number; readonly b0: number; readonly b1: number; readonly b2: number }
interface BiquadState { z1: number; z2: number }

const MIN_RMS_FLOOR = 1e-6;
const MIN_DBFS = -120;
const TWO_PI = Math.PI * 2;
const BUTTERWORTH_Q = Math.SQRT1_2;
const GOERTZEL_PROBES_HZ: readonly number[] = [48, 82, 125, 210, 360, 620, 1050, 1780, 2850, 4300, 6400, 9200];

const clamp = (v: number, min: number, max: number): number => (!Number.isFinite(v) ? min : v < min ? min : v > max ? max : v);
const roundN = (v: number, digits: number): number => {
  if (!Number.isFinite(v)) return 0;
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
};
const rmsToDbfs = (rms: number): number => clamp(20 * Math.log10(Math.max(rms, MIN_RMS_FLOOR)), MIN_DBFS, 0);

function createRng(seed: number): () => number {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function designBiquad(kind: "highpass" | "lowpass", cutoffHz: number, fs: number): BiquadCoeff {
  const omega = (TWO_PI * clamp(cutoffHz, 5, fs * 0.45)) / fs;
  const c = Math.cos(omega);
  const alpha = Math.sin(omega) / (2 * BUTTERWORTH_Q);
  const a0 = 1 + alpha;
  const b0 = (kind === "lowpass" ? (1 - c) * 0.5 : (1 + c) * 0.5) / a0;
  return { b0, b1: (kind === "lowpass" ? 1 - c : -(1 + c)) / a0, b2: b0, a1: (-2 * c) / a0, a2: (1 - alpha) / a0 };
}

function stepBiquad(x: number, c: BiquadCoeff, st: BiquadState): number {
  const y = c.b0 * x + st.z1;
  st.z1 = c.b1 * x - c.a1 * y + st.z2;
  st.z2 = c.b2 * x - c.a2 * y;
  return y;
}

const stepCascade = (x: number, c: BiquadCoeff, s1: BiquadState, s2: BiquadState): number =>
  stepBiquad(stepBiquad(x, c, s1), c, s2);

/** 4차 캐스케이드 바이쿼드 크로스오버로 모노 PCM을 초저역·중역·고역 3대역으로 분리한다. */
function separateThreeBandsPcm(pcm: Float32Array, fs: number) {
  const len = pcm.length;
  const subBassBand = new Float32Array(len);
  const midBand = new Float32Array(len);
  const highBand = new Float32Array(len);
  const hp20 = designBiquad("highpass", 20, fs);
  const lp150 = designBiquad("lowpass", 150, fs);
  const hp150 = designBiquad("highpass", 150, fs);
  const lp2500 = designBiquad("lowpass", 2500, fs);
  const hp2500 = designBiquad("highpass", 2500, fs);
  const mk = (): BiquadState => ({ z1: 0, z2: 0 });
  const states = [mk(), mk(), mk(), mk(), mk(), mk(), mk(), mk(), mk()];

  for (let i = 0; i < len; i += 1) {
    const x = Number.isFinite(pcm[i]) ? stepBiquad(pcm[i], hp20, states[0]) : 0;
    subBassBand[i] = stepCascade(x, lp150, states[1], states[2]);
    midBand[i] = stepCascade(stepCascade(x, hp150, states[3], states[4]), lp2500, states[5], states[6]);
    highBand[i] = stepCascade(x, hp2500, states[7], states[8]);
  }
  return { subBassBand, midBand, highBand };
}

function computeGoertzelMagnitudes(
  pcm: Float32Array,
  start: number,
  winLen: number,
  hann: Float32Array,
  coeffs: Float64Array,
  out: Float64Array,
): void {
  const invLen = winLen > 0 ? 1 / winLen : 0;
  for (let b = 0; b < coeffs.length; b += 1) {
    const c = coeffs[b];
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < winLen; i += 1) {
      const s0 = pcm[start + i] * hann[i] + c * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    out[b] = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) * invLen;
  }
}

function computeWindowRms(buf: Float32Array, start: number, count: number): number {
  const end = Math.min(buf.length, start + count);
  const actual = end - start;
  if (actual <= 0) return 0;
  let sumSq = 0;
  for (let i = start; i < end; i += 1) sumSq += buf[i] * buf[i];
  return Math.sqrt(sumSq / actual);
}

/**
 * 결정론적 테스트용 모노 PCM 오디오 파형을 생성한다.
 * 킥 드럼 정박, 무음 후 드롭, 크레셴도 현악, 잔잔한 앰비언트 패드, 고속 액션 타악기를 지원한다.
 */
export function synthesizeTestAudioWaveform(spec: SyntheticAudioWaveformSpec): SynthesizedAudioWaveform {
  const fs = Math.round(clamp(spec.sampleRateHz ?? 44100, 8000, 96000));
  const durationMs = Math.max(200, spec.durationMs);
  const bpm = clamp(spec.bpm ?? 120, 45, 220);
  const peakAmp = clamp(spec.peakAmplitude ?? 0.9, 0.05, 1.0);
  const rng = createRng(spec.seed ?? 8201);
  const totalSamples = Math.max(1, Math.round((durationMs / 1000) * fs));
  const pcmSamples = new Float32Array(totalSamples);
  const beatSec = 60 / bpm;
  const startSec = clamp(spec.startOffsetMs ?? 120, 0, Math.min(400, durationMs * 0.25)) / 1000;
  const expectedBeatTimesMs: number[] = [];
  const expectedClimaxTimesMs: number[] = [];
  let expectedSilenceRangeMs: readonly [number, number] | null = null;

  const addKick = (hitSec: number, gain: number): void => {
    const base = Math.round(hitSec * fs);
    const len = Math.round(0.18 * fs);
    const clickLen = Math.round(0.012 * fs);
    let phase = 0;
    for (let i = 0; i < len; i += 1) {
      const idx = base + i;
      if (idx < 0 || idx >= totalSamples) continue;
      const t = i / fs;
      phase += (TWO_PI * (52 + 98 * Math.exp(-t * 36))) / fs;
      let s = Math.sin(phase) * Math.exp(-t * 17) * Math.min(1, t * 400) * 0.88;
      if (i < clickLen) s += Math.sin(TWO_PI * 3600 * t) * Math.exp(-t * 280) * 0.32;
      pcmSamples[idx] = clamp(pcmSamples[idx] + s * gain, -1, 1);
    }
  };

  const addCrash = (hitSec: number, gain: number): void => {
    const base = Math.round(hitSec * fs);
    const len = Math.round(0.65 * fs);
    let phase = 0;
    for (let i = 0; i < len; i += 1) {
      const idx = base + i;
      if (idx < 0 || idx >= totalSamples) continue;
      const t = i / fs;
      phase += (TWO_PI * (46 + 74 * Math.exp(-t * 18))) / fs;
      const v =
        Math.sin(phase) * Math.exp(-t * 4.8) * Math.min(1, t * 350) * 0.78 +
        (rng() * 2 - 1) * Math.exp(-t * 8.5) * 0.42 +
        Math.sin(TWO_PI * 4200 * t) * Math.exp(-t * 14) * 0.25;
      pcmSamples[idx] = clamp(pcmSamples[idx] + v * gain, -1, 1);
    }
  };

  if (spec.preset === "kick-drum-steady") {
    for (let t = startSec; t < durationMs / 1000 - 0.08; t += beatSec) {
      addKick(t, peakAmp * (expectedBeatTimesMs.length % 4 === 0 ? 1.0 : 0.84));
      expectedBeatTimesMs.push(roundN(t * 1000, 2));
    }
  } else if (spec.preset === "silence-then-drop") {
    const silStart = clamp(spec.silenceStartMs ?? durationMs * 0.36, 500, durationMs * 0.65);
    const silEnd = Math.min(durationMs - 500, silStart + clamp(spec.silenceDurationMs ?? 780, 320, durationMs * 0.35));
    expectedSilenceRangeMs = [silStart, silEnd];
    for (let t = startSec; t < (silStart - 180) / 1000; t += beatSec) {
      addKick(t, peakAmp * 0.42);
      expectedBeatTimesMs.push(roundN(t * 1000, 2));
    }
    const s0 = Math.round((silStart / 1000) * fs);
    const s1 = Math.min(totalSamples, Math.round((silEnd / 1000) * fs));
    for (let i = s0; i < s1; i += 1) pcmSamples[i] = Math.sin((TWO_PI * 220 * i) / fs) * 0.002;
    const dropSec = silEnd / 1000;
    addCrash(dropSec, peakAmp);
    expectedBeatTimesMs.push(roundN(dropSec * 1000, 2));
    expectedClimaxTimesMs.push(roundN(dropSec * 1000, 2));
    for (let t = dropSec + beatSec; t < durationMs / 1000 - 0.1; t += beatSec) {
      addKick(t, peakAmp * 0.72);
      expectedBeatTimesMs.push(roundN(t * 1000, 2));
    }
  } else if (spec.preset === "crescendo-strings") {
    const peakSec = (durationMs / 1000) * 0.82;
    expectedClimaxTimesMs.push(Math.round(peakSec * 1000));
    for (let i = 0; i < totalSamples; i += 1) {
      const t = i / fs;
      const p = clamp(t / peakSec, 0, 1);
      const env = (0.04 + 0.96 * Math.pow(p, 2.4)) * (t > peakSec ? Math.exp(-(t - peakSec) * 4.5) : 1) * peakAmp;
      const s = Math.sin(TWO_PI * 293.66 * t) * 0.5 + Math.sin(TWO_PI * 440 * t) * 0.28 + Math.sin(TWO_PI * 587.33 * t) * 0.16 + Math.sin(TWO_PI * 3520 * t) * (0.05 + 0.25 * p);
      pcmSamples[i] = clamp(s * env, -1, 1);
    }
  } else if (spec.preset === "staccato-action-percussion") {
    const fastSec = Math.max(0.25, beatSec * 0.5);
    for (let tSec = startSec; tSec < durationMs / 1000 - 0.06; tSec += fastSec) {
      if (expectedBeatTimesMs.length % 2 === 0) {
        addKick(tSec, peakAmp * 0.92);
      } else {
        const base = Math.round(tSec * fs);
        const snareLen = Math.round(0.08 * fs);
        for (let i = 0; i < snareLen; i += 1) {
          const idx = base + i;
          if (idx < 0 || idx >= totalSamples) continue;
          const t = i / fs;
          const v = Math.sin(TWO_PI * 220 * t) * Math.exp(-t * 45) * 0.45 + (rng() * 2 - 1) * Math.exp(-t * 36) * 0.72;
          pcmSamples[idx] = clamp(pcmSamples[idx] + v * peakAmp * 0.85, -1, 1);
        }
      }
      expectedBeatTimesMs.push(roundN(tSec * 1000, 2));
    }
    if (expectedBeatTimesMs.length >= 4) expectedClimaxTimesMs.push(expectedBeatTimesMs[Math.floor(expectedBeatTimesMs.length * 0.5)]);
  } else {
    const calmAmp = Math.min(peakAmp, 0.26);
    const durSec = durationMs / 1000;
    for (let i = 0; i < totalSamples; i += 1) {
      const t = i / fs;
      const env = (0.72 + 0.22 * Math.sin(TWO_PI * 0.22 * t)) * Math.min(1, t / 0.35) * Math.min(1, Math.max(0, (durSec - t) / 0.35));
      const pad = Math.sin(TWO_PI * 261.63 * t) * 0.5 + Math.sin(TWO_PI * 329.63 * t) * 0.3 + Math.sin(TWO_PI * 392 * t) * 0.2;
      pcmSamples[i] = clamp(pad * calmAmp * env, -1, 1);
    }
  }

  return { pcmSamples, sampleRateHz: fs, durationMs, preset: spec.preset, bpm, expectedBeatTimesMs, expectedSilenceRangeMs, expectedClimaxTimesMs };
}

function estimateTempo(beatTimesMs: readonly number[], novelty: Float64Array, hopMs: number, minBpm: number, maxBpm: number) {
  const minLagMs = 60000 / maxBpm;
  const maxLagMs = 60000 / minBpm;
  const intervals: number[] = [];
  for (let i = 1; i < beatTimesMs.length; i += 1) {
    let diff = beatTimesMs[i] - beatTimesMs[i - 1];
    if (!Number.isFinite(diff) || diff <= 0) continue;
    while (diff > maxLagMs && diff * 0.5 >= minLagMs) diff *= 0.5;
    while (diff < minLagMs && diff * 2 <= maxLagMs) diff *= 2;
    if (diff >= minLagMs && diff <= maxLagMs) intervals.push(diff);
  }

  let ioiBpm = 0;
  let ioiConf = 0;
  if (intervals.length >= 2) {
    const sorted = [...intervals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const inliers = intervals.filter((v) => Math.abs(v - median) <= median * 0.14);
    const mean = inliers.length > 0 ? inliers.reduce((s, v) => s + v, 0) / inliers.length : median;
    const variance = inliers.reduce((s, v) => s + (v - mean) * (v - mean), 0) / Math.max(1, inliers.length);
    ioiBpm = 60000 / mean;
    ioiConf = clamp((inliers.length / intervals.length) * (1 - (mean > 0 ? Math.sqrt(variance) / mean : 1) * 4), 0, 1);
  }

  const n = novelty.length;
  const minLag = Math.max(1, Math.floor(minLagMs / hopMs));
  const maxLag = Math.min(n - 1, Math.ceil(maxLagMs / hopMs));
  let energy = 0;
  for (let i = 0; i < n; i += 1) energy += novelty[i] * novelty[i];

  let bestLag = 0;
  let bestScore = -1;
  let secondScore = 0;
  if (energy > 1e-9 && maxLag > minLag) {
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let sum = 0;
      const overlap = n - lag;
      for (let i = 0; i < overlap; i += 1) sum += novelty[i] * novelty[i + lag];
      const bpmCand = 60000 / (lag * hopMs);
      const score = (sum / (energy * (overlap / n))) * (0.85 + 0.15 * Math.exp(-Math.pow((bpmCand - 118) / 55, 2)));
      if (score > bestScore) {
        secondScore = bestScore;
        bestScore = score;
        bestLag = lag;
      }
    }
  }

  const acfBpm = bestLag > 0 ? 60000 / (bestLag * hopMs) : 0;
  const acfConf = bestScore > 0 ? clamp(bestScore - Math.max(0, secondScore) * 0.5, 0, 1) : 0;
  if (ioiBpm > 0 && ioiConf >= 0.55) {
    return { estimatedBpm: roundN(clamp(ioiBpm, minBpm, maxBpm), 2), confidence: roundN(clamp(0.55 * ioiConf + 0.45 * Math.max(ioiConf, acfConf), 0, 1), 3) };
  }
  if (acfBpm > 0 && bestScore > 0.08) return { estimatedBpm: roundN(clamp(acfBpm, minBpm, maxBpm), 2), confidence: roundN(acfConf, 3) };
  return ioiBpm > 0 ? { estimatedBpm: roundN(clamp(ioiBpm, minBpm, maxBpm), 2), confidence: roundN(ioiConf, 3) } : { estimatedBpm: 0, confidence: 0 };
}

function detectBeatOnsets(
  frames: readonly AudioEnvelopeFrame[],
  novelty: Float64Array,
  hopMs: number,
  silenceDb: number,
  sensitivity: number,
  minBeatIntervalMs: number,
  isSilent: boolean,
): readonly BeatOnsetEvent[] {
  if (isSilent || frames.length === 0) return [];
  const halfWin = Math.max(4, Math.round(200 / hopMs));
  const raw: Array<{ frameIndex: number; strength: number; timeMs: number }> = [];

  for (let f = 0; f < frames.length; f += 1) {
    const val = novelty[f];
    if (val < 0.14 || frames[f].dbfs < silenceDb + 4) continue;
    const prev = f > 0 ? novelty[f - 1] : -1;
    const next = f + 1 < frames.length ? novelty[f + 1] : -1;
    if (val < prev || val <= next) continue;

    const w0 = Math.max(0, f - halfWin);
    const w1 = Math.min(frames.length - 1, f + halfWin);
    const cnt = w1 - w0 + 1;
    let mean = 0;
    for (let k = w0; k <= w1; k += 1) mean += novelty[k];
    mean /= cnt;
    let vSum = 0;
    for (let k = w0; k <= w1; k += 1) vSum += (novelty[k] - mean) * (novelty[k] - mean);
    if (val < Math.max(0.16, mean * sensitivity + Math.sqrt(vSum / cnt) * 0.28)) continue;

    let offset = 0;
    if (f > 0 && f + 1 < frames.length) {
      const denom = prev - 2 * val + next;
      if (Math.abs(denom) > 1e-9) offset = clamp(0.5 * ((prev - next) / denom), -0.5, 0.5);
    }
    raw.push({ frameIndex: f, strength: val, timeMs: roundN(Math.max(0, (f + offset) * hopMs), 2) });
  }

  const kept: typeof raw = [];
  for (const c of raw) {
    const last = kept[kept.length - 1];
    if (!last || c.timeMs - last.timeMs >= minBeatIntervalMs) kept.push(c);
    else if (c.strength > last.strength) kept[kept.length - 1] = c;
  }

  return kept.map((c, idx) => ({
    beatIndex: idx,
    timeMs: c.timeMs,
    strength: roundN(c.strength, 4),
    subBassEnergy: frames[c.frameIndex].bands.subBass20To150Hz,
    highTransientEnergy: frames[c.frameIndex].bands.highTransient2500PlusHz,
    isStrongDownbeat: idx % 4 === 0 || c.strength >= 0.78,
  }));
}

function detectSilenceAndClimaxes(
  frames: readonly AudioEnvelopeFrame[],
  hopMs: number,
  peakDbfs: number,
  isSilent: boolean,
  silenceThresholdDbfs: number,
  minSilenceDurationMs: number,
  climaxThreshold: number,
  minClimaxSepMs: number,
): { readonly climaxMoments: readonly ClimaxMoment[]; readonly silenceHolds: readonly SilenceHoldSegment[] } {
  const rawSilences: Array<{ avgDb: number; durMs: number; endMs: number; minDb: number; startMs: number }> = [];
  const effSilenceDb = isSilent ? silenceThresholdDbfs : Math.max(silenceThresholdDbfs, peakDbfs - 24);
  let hStart = -1;
  let dbSum = 0;
  let dbMin = 0;

  for (let f = 0; f <= frames.length; f += 1) {
    const silentNow = f < frames.length && (frames[f].dbfs <= effSilenceDb || frames[f].normalizedEnergy <= 0.08);
    if (silentNow) {
      if (hStart === -1) {
        hStart = f;
        dbSum = frames[f].dbfs;
        dbMin = frames[f].dbfs;
      } else {
        dbSum += frames[f].dbfs;
        if (frames[f].dbfs < dbMin) dbMin = frames[f].dbfs;
      }
    } else if (hStart !== -1) {
      const cnt = f - hStart;
      const durMs = cnt * hopMs;
      if (durMs >= minSilenceDurationMs) {
        rawSilences.push({ startMs: roundN(hStart * hopMs, 2), endMs: roundN(f * hopMs, 2), durMs: roundN(durMs, 2), minDb: roundN(dbMin, 2), avgDb: roundN(dbSum / cnt, 2) });
      }
      hStart = -1;
    }
  }

  const impact = new Float64Array(frames.length);
  for (let f = 0; f < frames.length; f += 1) {
    const fr = frames[f];
    impact[f] = fr.normalizedEnergy * 0.48 + fr.bands.subBass20To150Hz * 0.32 + fr.bands.highTransient2500PlusHz * 0.2;
  }

  const lookback = Math.max(6, Math.round(400 / hopMs));
  const rawClimaxes: Array<{ dramatic: number; frameIndex: number; jumpRatio: number; preSilenceMs: number }> = [];
  if (!isSilent && peakDbfs > silenceThresholdDbfs + 8) {
    for (let f = 1; f < frames.length - 1; f += 1) {
      const sc = impact[f];
      if (sc < impact[f - 1] || sc < impact[f + 1]) continue;
      const fr = frames[f];
      const lb0 = Math.max(0, f - lookback);
      const lb1 = Math.max(lb0 + 1, f - 2);
      let preSum = 0;
      for (let k = lb0; k < lb1; k += 1) preSum += frames[k].normalizedEnergy;
      const jumpRatio = fr.normalizedEnergy / Math.max(preSum / Math.max(1, lb1 - lb0), 0.03);

      let preSilenceMs = 0;
      for (const h of rawSilences) {
        const gap = fr.timeMs - h.endMs;
        if (gap >= -hopMs * 2 && gap <= 650) preSilenceMs = Math.max(preSilenceMs, h.durMs);
      }

      if (!(fr.normalizedEnergy >= climaxThreshold && sc >= 0.56) && !(preSilenceMs >= minSilenceDurationMs && fr.normalizedEnergy >= 0.58)) {
        continue;
      }
      rawClimaxes.push({
        frameIndex: f,
        dramatic: clamp(sc * 0.65 + clamp(preSilenceMs / 1000, 0, 0.3) + clamp((jumpRatio - 1) / 10, 0, 0.25), 0, 1),
        jumpRatio,
        preSilenceMs,
      });
    }
  }

  const keptClimaxes: typeof rawClimaxes = [];
  for (const c of rawClimaxes) {
    const last = keptClimaxes[keptClimaxes.length - 1];
    if (!last || frames[c.frameIndex].timeMs - frames[last.frameIndex].timeMs >= minClimaxSepMs) keptClimaxes.push(c);
    else if (c.dramatic > last.dramatic) keptClimaxes[keptClimaxes.length - 1] = c;
  }

  const climaxMoments: ClimaxMoment[] = keptClimaxes.map((c, idx) => {
    const fr = frames[c.frameIndex];
    let kind: ClimaxMomentKind = "crescendo-peak";
    if (c.preSilenceMs > 0 || (fr.bands.subBass20To150Hz >= 0.52 && c.jumpRatio >= 1.8)) kind = "bass-drop";
    else if (fr.bands.highTransient2500PlusHz >= 0.55 && fr.bands.highTransient2500PlusHz > fr.bands.subBass20To150Hz) kind = "transient-burst";
    return {
      climaxIndex: idx, timeMs: fr.timeMs, peakEnergy: fr.normalizedEnergy, peakDbfs: fr.dbfs,
      subBassImpact: fr.bands.subBass20To150Hz, highTransientImpact: fr.bands.highTransient2500PlusHz,
      energyJumpRatio: roundN(c.jumpRatio, 2), precededBySilenceMs: roundN(c.preSilenceMs, 2), dramaticScore: roundN(c.dramatic, 4), kind,
    };
  });

  const silenceHolds: SilenceHoldSegment[] = rawSilences.map((h, idx) => {
    const linked = climaxMoments.find((c) => c.timeMs - h.endMs >= -hopMs * 2 && c.timeMs - h.endMs <= 650);
    return {
      holdIndex: idx, startMs: h.startMs, endMs: h.endMs, durationMs: h.durMs,
      minDbfs: h.minDb, averageDbfs: h.avgDb, precedesClimax: linked !== undefined, linkedClimaxIndex: linked ? linked.climaxIndex : null,
    };
  });

  return { climaxMoments, silenceHolds };
}

/** 웹툰 컷 호흡·여백·집중선 연출을 위해 오디오 PCM 파형을 정밀 분석한다. */
export function analyzeAudioTrackForComicPacing(input: AudioTrackAnalysisInput): AudioPacingAnalysis {
  const synth = input.syntheticDescriptor ? synthesizeTestAudioWaveform(input.syntheticDescriptor) : null;
  const pcm = input.pcmSamples ?? synth?.pcmSamples ?? new Float32Array(0);
  const fs = Math.round(clamp(input.sampleRateHz ?? synth?.sampleRateHz ?? 44100, 8000, 96000));
  const trackId = input.trackId ?? (synth ? `synth:${synth.preset}` : "pcm-track");

  const frameSizeMs = clamp(input.frameSizeMs ?? 25, 8, 80);
  const hopSizeMs = clamp(input.hopSizeMs ?? 10, 4, 40);
  const minBpm = clamp(input.minBpm ?? 60, 30, 140);
  const maxBpm = clamp(input.maxBpm ?? 190, Math.max(minBpm + 20, 100), 260);
  const silenceDb = clamp(input.silenceThresholdDbfs ?? -34, -80, -10);
  const minSilenceMs = clamp(input.minSilenceDurationMs ?? 240, 80, 3000);
  const climaxThreshold = clamp(input.climaxThresholdNormalized ?? 0.72, 0.35, 0.98);
  const minClimaxSepMs = clamp(input.minClimaxSeparationMs ?? 450, 150, 4000);
  const sensitivity = clamp(input.onsetSensitivity ?? 1.35, 1.05, 3.0);
  const minBeatIntervalMs = clamp(input.minBeatIntervalMs ?? 240, 120, 600);

  if (pcm.length === 0) {
    return {
      trackId, sampleRateHz: fs, durationMs: 0, frameSizeMs, hopSizeMs,
      peakRms: 0, peakDbfs: MIN_DBFS, averageDbfs: MIN_DBFS, averageEnergy: 0,
      averageRawSpectralFlux: 0, peakRawSpectralFlux: 0, dynamicRangeDb: 0,
      estimatedBpm: 0, bpmConfidence: 0, beatIntervalMs: 0,
      frames: [], beatTimestampsMs: [], beatOnsets: [], climaxMoments: [], silenceHolds: [],
    };
  }

  const { subBassBand, midBand, highBand } = separateThreeBandsPcm(pcm, fs);
  const frameSamples = Math.max(16, Math.round((frameSizeMs / 1000) * fs));
  const hopSamples = Math.max(8, Math.round((hopSizeMs / 1000) * fs));
  const frameCount = Math.max(1, Math.floor(Math.max(pcm.length - frameSamples, 0) / hopSamples) + 1);

  // 저주파 해상도(<=45Hz) 확보 및 정상파 위상 흔들림 억제를 위해 최대 1024샘플 Hann 창을 사용한다.
  const probes = GOERTZEL_PROBES_HZ.filter((hz) => hz < fs * 0.45);
  const gWin = Math.min(frameSamples, 1024);
  const hann = new Float32Array(gWin);
  for (let i = 0; i < gWin; i += 1) hann[i] = 0.5 * (1 - Math.cos((TWO_PI * i) / Math.max(1, gWin - 1)));
  const gCoeffs = new Float64Array(probes.length);
  for (let b = 0; b < probes.length; b += 1) gCoeffs[b] = 2 * Math.cos((TWO_PI * probes[b]) / fs);

  const rawRms = new Float64Array(frameCount);
  const rawSub = new Float64Array(frameCount);
  const rawMid = new Float64Array(frameCount);
  const rawHigh = new Float64Array(frameCount);
  const rawFlux = new Float64Array(frameCount);
  const prevLog = new Float64Array(probes.length);
  const currMag = new Float64Array(probes.length);

  let peakRms = 0;
  let peakBand = 0;
  let peakFlux = 0;
  let rawFluxSum = 0;

  for (let f = 0; f < frameCount; f += 1) {
    const start = f * hopSamples;
    const avail = Math.min(frameSamples, pcm.length - start);
    rawRms[f] = computeWindowRms(pcm, start, avail);
    rawSub[f] = computeWindowRms(subBassBand, start, avail);
    rawMid[f] = computeWindowRms(midBand, start, avail);
    rawHigh[f] = computeWindowRms(highBand, start, avail);
    if (rawRms[f] > peakRms) peakRms = rawRms[f];
    peakBand = Math.max(peakBand, rawSub[f], rawMid[f], rawHigh[f]);

    const gLen = Math.min(gWin, avail);
    if (gLen >= 16 && probes.length > 0) {
      computeGoertzelMagnitudes(pcm, start, gLen, hann, gCoeffs, currMag);
      let flux = 0;
      for (let b = 0; b < probes.length; b += 1) {
        const lm = Math.log(1 + 40 * currMag[b]);
        if (lm > prevLog[b]) flux += lm - prevLog[b];
        prevLog[b] = lm;
      }
      rawFlux[f] = flux / probes.length;
      rawFluxSum += rawFlux[f];
      if (rawFlux[f] > peakFlux) peakFlux = rawFlux[f];
    }
  }

  const isSilent = peakRms <= 1e-4;
  const bandDiv = Math.max(peakBand, peakRms, 1e-5);
  const novelty = new Float64Array(frameCount);
  let maxNov = 0;
  for (let f = 0; f < frameCount; f += 1) {
    if (isSilent) continue;
    const nFlux = peakFlux > 1e-9 ? rawFlux[f] / peakFlux : 0;
    const dRms = Math.max(0, (rawRms[f] - (f > 0 ? rawRms[f - 1] : 0)) / peakRms);
    const dSub = Math.max(0, (rawSub[f] - (f > 0 ? rawSub[f - 1] : 0)) / bandDiv);
    novelty[f] = nFlux * 0.62 + dRms * 0.22 + dSub * 0.16;
    if (novelty[f] > maxNov) maxNov = novelty[f];
  }
  if (maxNov > 1e-9) {
    for (let f = 0; f < frameCount; f += 1) novelty[f] /= maxNov;
  }

  const frames: AudioEnvelopeFrame[] = [];
  let sumEnergy = 0;
  let sumDb = 0;
  let minAudibleDb = 0;
  for (let f = 0; f < frameCount; f += 1) {
    const rms = rawRms[f];
    const dbfs = rmsToDbfs(rms);
    const normE = isSilent ? 0 : clamp(rms / peakRms, 0, 1);
    sumEnergy += normE;
    sumDb += dbfs;
    if (dbfs < minAudibleDb && rms > MIN_RMS_FLOOR * 2) minAudibleDb = dbfs;
    frames.push({
      frameIndex: f, timeMs: roundN(f * hopSizeMs, 2), rms, dbfs: roundN(dbfs, 2),
      normalizedEnergy: roundN(normE, 4), rawSpectralFlux: roundN(rawFlux[f], 5),
      spectralFlux: peakFlux > 1e-9 ? roundN(clamp(rawFlux[f] / peakFlux, 0, 1), 4) : 0,
      noveltyScore: roundN(novelty[f], 4),
      bands: {
        subBass20To150Hz: isSilent ? 0 : roundN(clamp(rawSub[f] / bandDiv, 0, 1), 4),
        mid150To2500Hz: isSilent ? 0 : roundN(clamp(rawMid[f] / bandDiv, 0, 1), 4),
        highTransient2500PlusHz: isSilent ? 0 : roundN(clamp(rawHigh[f] / bandDiv, 0, 1), 4),
        subBassRawRms: rawSub[f], midRawRms: rawMid[f], highTransientRawRms: rawHigh[f],
      },
    });
  }

  const peakDbfs = rmsToDbfs(peakRms);
  const beatOnsets = detectBeatOnsets(frames, novelty, hopSizeMs, silenceDb, sensitivity, minBeatIntervalMs, isSilent);
  const beatTimestampsMs = beatOnsets.map((b) => b.timeMs);
  const { estimatedBpm, confidence: bpmConfidence } = estimateTempo(beatTimestampsMs, novelty, hopSizeMs, minBpm, maxBpm);
  const { climaxMoments, silenceHolds } = detectSilenceAndClimaxes(
    frames, hopSizeMs, peakDbfs, isSilent, silenceDb, minSilenceMs, climaxThreshold, minClimaxSepMs,
  );

  return {
    trackId, sampleRateHz: fs, durationMs: roundN((pcm.length / fs) * 1000, 2), frameSizeMs, hopSizeMs,
    peakRms, peakDbfs: roundN(peakDbfs, 2), averageDbfs: roundN(sumDb / frameCount, 2),
    averageEnergy: roundN(sumEnergy / frameCount, 4), averageRawSpectralFlux: roundN(rawFluxSum / frameCount, 5),
    peakRawSpectralFlux: roundN(peakFlux, 5), dynamicRangeDb: isSilent ? 0 : roundN(Math.max(0, peakDbfs - minAudibleDb), 2),
    estimatedBpm, bpmConfidence, beatIntervalMs: estimatedBpm > 0 ? roundN(60000 / estimatedBpm, 2) : 0,
    frames, beatTimestampsMs, beatOnsets, climaxMoments, silenceHolds,
  };
}
