/**
 * Wave 97: 로컬 PCM 운율(RMS·ZCR·F0) 추출기, 결정론적 합성 음성 생성기 및 단조 강제 정렬 엔진.
 *
 * - 성우 음성을 외부로 전송하거나 생체 성문을 저장하지 않는 100% 로컬 전용 프라이버시 계약을 강제한다.
 * - 로컬 모노 PCM에서 RMS 에너지, 영교차율(ZCR), 자기상관 기본주파수(F0, 75~420Hz), 발화 구간(VAD)을 추출하고
 *   음소 지속시간과 음향 랜드마크를 결합해 60fps 기준 `<= 16.67ms` 오차로 단조 강제 정렬한다.
 */

import {
  COMIC_VISEME_ALPHABET,
  LOCAL_VOICE_PRIVACY_CONTRACT,
  decomposeKoreanTextToVisemeSequence,
  type ComicVisemeId,
  type LocalVoicePrivacyContract,
  type ParsedVisemeToken,
  type VisemeAcousticClass,
  type VisemeTokenRole,
} from "./korean-jamo-viseme-decomposer";

export {
  COMIC_VISEME_ALPHABET,
  LOCAL_VOICE_PRIVACY_CONTRACT,
  decomposeKoreanTextToVisemeSequence,
  type ComicVisemeId,
  type LocalVoicePrivacyContract,
  type ParsedVisemeToken,
  type VisemeAcousticClass,
  type VisemeTokenRole,
};

export interface VoiceProsodyFrame {
  readonly frameIndex: number;
  readonly timeMs: number;
  readonly rawRms: number;
  readonly rmsEnergy: number;
  readonly zcr: number;
  readonly f0Hz: number;
  readonly autocorrelationPeak: number;
  readonly voiced: boolean;
  readonly speechActive: boolean;
}

export interface ActiveSpeechSegment {
  readonly index: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
  readonly peakRms: number;
  readonly meanRms: number;
  readonly meanF0Hz: number;
}

export interface VoiceAudioProsodyAnalysis {
  readonly sampleRateHz: number;
  readonly hopMs: number;
  readonly windowMs: number;
  readonly durationMs: number;
  readonly peakRawRms: number;
  readonly baselineF0Hz: number;
  readonly maxF0Hz: number;
  readonly voicedFrameRatio: number;
  readonly frames: readonly VoiceProsodyFrame[];
  readonly activeSpeechSegments: readonly ActiveSpeechSegment[];
  readonly privacy: LocalVoicePrivacyContract;
}

export interface SyntheticVoicePcmOptions {
  readonly sampleRateHz?: number;
  readonly baseF0Hz?: number;
  readonly speakingRateScale?: number;
  readonly leadingSilenceMs?: number;
  readonly trailingSilenceMs?: number;
  readonly stressedSyllableIndices?: readonly number[];
  readonly emphasisPitchLiftHz?: number;
  readonly emphasisAmplitudeScale?: number;
  readonly seed?: number;
}

export interface SyntheticTokenGroundTruthSpan {
  readonly tokenIndex: number;
  readonly syllableIndex: number;
  readonly viseme: ComicVisemeId;
  readonly grapheme: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly stressed: boolean;
}

export interface SynthesizedVoiceScriptPcm {
  readonly dialogueText: string;
  readonly sampleRateHz: number;
  readonly durationMs: number;
  readonly samples: Float32Array;
  readonly tokens: readonly ParsedVisemeToken[];
  readonly groundTruthSpans: readonly SyntheticTokenGroundTruthSpan[];
  readonly privacy: LocalVoicePrivacyContract;
}

export interface ForcedAlignmentOptions {
  readonly targetFps?: number;
  readonly maxLandmarkSnapMs?: number;
}

export interface AlignedVisemeSpan {
  readonly spanIndex: number;
  readonly tokenIndex: number;
  readonly syllableIndex: number;
  readonly viseme: ComicVisemeId;
  readonly grapheme: string;
  readonly jamoLabel: string;
  readonly role: VisemeTokenRole;
  readonly acousticClass: VisemeAcousticClass;
  readonly isBilabial: boolean;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
  readonly centerMs: number;
  readonly meanRms: number;
  readonly peakRms: number;
  readonly meanF0Hz: number;
  readonly peakF0Hz: number;
  readonly meanZcr: number;
  readonly voicedRatio: number;
}

export interface ForcedVisemeAlignmentResult {
  readonly dialogueText: string;
  readonly durationMs: number;
  readonly targetFps: number;
  readonly spans: readonly AlignedVisemeSpan[];
  readonly speechSpanCount: number;
  readonly bilabialSpanCount: number;
  readonly maxAudioAlignmentDriftMs: number;
  readonly isStrictlyMonotonic: boolean;
  readonly privacy: LocalVoicePrivacyContract;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function estimateAutocorrelationF0(
  samples: Float32Array | readonly number[],
  startIdx: number,
  frameLen: number,
  sampleRateHz: number,
): { readonly f0Hz: number; readonly peakCorr: number } {
  if (frameLen < 16) return { f0Hz: 0, peakCorr: 0 };

  let mean = 0;
  for (let i = 0; i < frameLen; i += 1) mean += samples[startIdx + i];
  mean /= frameLen;

  const centered = new Float32Array(frameLen);
  let energy = 0;
  for (let i = 0; i < frameLen; i += 1) {
    const v = samples[startIdx + i] - mean;
    centered[i] = v;
    energy += v * v;
  }
  if (energy < 1e-9) return { f0Hz: 0, peakCorr: 0 };

  const minLag = Math.max(2, Math.floor(sampleRateHz / 420));
  const maxLag = Math.min(Math.floor(frameLen * 0.6), Math.ceil(sampleRateHz / 75));
  if (maxLag <= minLag + 2) return { f0Hz: 0, peakCorr: 0 };

  const scanStart = Math.max(2, Math.floor(minLag * 0.45));
  const corrs = new Float32Array(maxLag + 2);
  for (let lag = scanStart; lag <= maxLag + 1; lag += 1) {
    const limit = frameLen - lag;
    let num = 0;
    let denA = 0;
    let denB = 0;
    for (let j = 0; j < limit; j += 1) {
      const a = centered[j];
      const b = centered[j + lag];
      num += a * b;
      denA += a * a;
      denB += b * b;
    }
    corrs[lag] = denA > 1e-12 && denB > 1e-12 ? num / Math.sqrt(denA * denB) : 0;
  }

  let passedMainLobe = false;
  let globalBestPeak = 0;
  const peaks: number[] = [];
  for (let lag = scanStart + 1; lag <= maxLag; lag += 1) {
    const curr = corrs[lag];
    if (curr < 0.25) passedMainLobe = true;
    if (passedMainLobe && lag >= minLag && curr >= corrs[lag - 1] && curr >= corrs[lag + 1] && curr > 0.35) {
      peaks.push(lag);
      if (curr > globalBestPeak) globalBestPeak = curr;
    }
  }
  if (peaks.length === 0 || globalBestPeak < 0.45) return { f0Hz: 0, peakCorr: globalBestPeak };

  const chosenLag = peaks.find((lag) => corrs[lag] >= globalBestPeak * 0.9) ?? peaks[0];
  const denom = 2 * (2 * corrs[chosenLag] - corrs[chosenLag - 1] - corrs[chosenLag + 1]);
  const delta = Math.abs(denom) > 1e-9 ? clamp((corrs[chosenLag + 1] - corrs[chosenLag - 1]) / denom, -0.5, 0.5) : 0;
  const f0Hz = sampleRateHz / (chosenLag + delta);
  return f0Hz >= 75 && f0Hz <= 420 ? { f0Hz, peakCorr: corrs[chosenLag] } : { f0Hz: 0, peakCorr: corrs[chosenLag] };
}

/**
 * 모노 PCM 버퍼에서 프레임별 RMS 에너지, 영교차율(ZCR), 자기상관 기본주파수(F0),
 * 활성 발화 구간(VAD)을 100% 로컬에서 추출한다.
 */
export function extractVoiceAudioProsodyFrames(
  pcmSamples: Float32Array | readonly number[],
  sampleRateHz: number,
  hopMs = 10,
): VoiceAudioProsodyAnalysis {
  const safeRate = Number.isFinite(sampleRateHz) && sampleRateHz >= 4000 ? sampleRateHz : 16000;
  const safeHopMs = clamp(hopMs, 4, 50);
  const windowMs = Math.max(safeHopMs * 2, 36);
  const totalSamples = pcmSamples.length;
  const durationMs = totalSamples > 0 ? (totalSamples / safeRate) * 1000 : 0;

  if (totalSamples === 0) {
    return {
      sampleRateHz: safeRate, hopMs: safeHopMs, windowMs, durationMs: 0, peakRawRms: 0,
      baselineF0Hz: 0, maxF0Hz: 0, voicedFrameRatio: 0, frames: [], activeSpeechSegments: [],
      privacy: LOCAL_VOICE_PRIVACY_CONTRACT,
    };
  }

  const hopSamples = Math.max(1, Math.round((safeHopMs / 1000) * safeRate));
  const windowSamples = Math.max(16, Math.round((windowMs / 1000) * safeRate));
  const rawStats: {
    frameIndex: number; timeMs: number; rawRms: number; zcr: number; f0Hz: number; peakCorr: number;
  }[] = [];
  let peakRawRms = 0;

  for (let start = 0, idx = 0; start < totalSamples; start += hopSamples, idx += 1) {
    const end = Math.min(totalSamples, start + windowSamples);
    const len = end - start;
    if (len < 4) break;
    let sumSq = pcmSamples[start] * pcmSamples[start];
    let crossings = 0;
    let prev = pcmSamples[start];
    for (let i = 1; i < len; i += 1) {
      const curr = pcmSamples[start + i];
      sumSq += curr * curr;
      if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) crossings += 1;
      prev = curr;
    }
    const rawRms = Math.sqrt(sumSq / len);
    if (rawRms > peakRawRms) peakRawRms = rawRms;
    const pitch = rawRms >= 0.015 ? estimateAutocorrelationF0(pcmSamples, start, len, safeRate) : { f0Hz: 0, peakCorr: 0 };
    rawStats.push({
      frameIndex: idx,
      timeMs: ((start + len * 0.5) / safeRate) * 1000,
      rawRms,
      zcr: len > 1 ? crossings / (len - 1) : 0,
      f0Hz: pitch.f0Hz,
      peakCorr: pitch.peakCorr,
    });
  }

  const normDenom = Math.max(peakRawRms, 0.08);
  const voiceRmsFloor = Math.max(0.02, peakRawRms * 0.08);
  const speechRmsFloor = Math.max(0.014, peakRawRms * 0.055);
  const sibilantRmsFloor = Math.max(0.012, peakRawRms * 0.045);

  const frames: VoiceProsodyFrame[] = [];
  const voicedF0: number[] = [];
  let maxF0Hz = 0;
  for (let i = 0; i < rawStats.length; i += 1) {
    const s = rawStats[i];
    const voiced = s.rawRms >= voiceRmsFloor && s.peakCorr >= 0.48 && s.zcr <= 0.28 && s.f0Hz >= 75 && s.f0Hz <= 420;
    const f0Hz = voiced ? s.f0Hz : 0;
    if (voiced) {
      voicedF0.push(f0Hz);
      if (f0Hz > maxF0Hz) maxF0Hz = f0Hz;
    }
    frames.push({
      frameIndex: s.frameIndex,
      timeMs: s.timeMs,
      rawRms: s.rawRms,
      rmsEnergy: peakRawRms < 1e-4 ? 0 : clamp(s.rawRms / normDenom, 0, 1),
      zcr: s.zcr,
      f0Hz,
      autocorrelationPeak: s.peakCorr,
      voiced,
      speechActive: s.rawRms >= speechRmsFloor || voiced || (s.zcr >= 0.26 && s.rawRms >= sibilantRmsFloor),
    });
  }

  const sortedF0 = voicedF0.slice().sort((a, b) => a - b);
  const baselineF0Hz = sortedF0.length > 0 ? sortedF0[Math.floor(sortedF0.length / 2)] : 0;

  const mergedSpans: { startIdx: number; endIdx: number }[] = [];
  let activeStart = -1;
  const commitSpan = (endIdx: number): void => {
    const prev = mergedSpans.length > 0 ? mergedSpans[mergedSpans.length - 1] : null;
    if (prev && frames[activeStart].timeMs - frames[prev.endIdx].timeMs <= 115) {
      prev.endIdx = endIdx;
    } else {
      mergedSpans.push({ startIdx: activeStart, endIdx });
    }
    activeStart = -1;
  };
  for (let i = 0; i < frames.length; i += 1) {
    if (frames[i].speechActive && activeStart < 0) activeStart = i;
    else if (!frames[i].speechActive && activeStart >= 0) commitSpan(i - 1);
  }
  if (activeStart >= 0) commitSpan(frames.length - 1);

  const activeSpeechSegments: ActiveSpeechSegment[] = [];
  for (let i = 0; i < mergedSpans.length; i += 1) {
    const span = mergedSpans[i];
    const startMs = Math.max(0, frames[span.startIdx].timeMs - safeHopMs * 0.5);
    const endMs = Math.min(durationMs, frames[span.endIdx].timeMs + safeHopMs * 0.5);
    if (endMs - startMs < 20 && mergedSpans.length > 1) continue;
    let sumRms = 0;
    let segPeak = 0;
    let sumF0 = 0;
    let vCnt = 0;
    const cnt = span.endIdx - span.startIdx + 1;
    for (let k = span.startIdx; k <= span.endIdx; k += 1) {
      sumRms += frames[k].rmsEnergy;
      if (frames[k].rmsEnergy > segPeak) segPeak = frames[k].rmsEnergy;
      if (frames[k].voiced) {
        sumF0 += frames[k].f0Hz;
        vCnt += 1;
      }
    }
    activeSpeechSegments.push({
      index: activeSpeechSegments.length,
      startMs,
      endMs,
      durationMs: Math.max(1, endMs - startMs),
      peakRms: segPeak,
      meanRms: sumRms / Math.max(1, cnt),
      meanF0Hz: vCnt > 0 ? sumF0 / vCnt : 0,
    });
  }

  return {
    sampleRateHz: safeRate, hopMs: safeHopMs, windowMs, durationMs, peakRawRms, baselineF0Hz, maxF0Hz,
    voicedFrameRatio: frames.length > 0 ? voicedF0.length / frames.length : 0,
    frames, activeSpeechSegments, privacy: LOCAL_VOICE_PRIVACY_CONTRACT,
  };
}

function vowelFormants(viseme: ComicVisemeId): readonly [number, number] {
  if (viseme === "A") return [760, 1220];
  if (viseme === "E") return [540, 1780];
  if (viseme === "I") return [310, 2150];
  if (viseme === "O") return [470, 920];
  if (viseme === "U" || viseme === "W_OO") return [330, 840];
  return [520, 1400];
}

/**
 * 대사 스크립트에서 모음 포먼트·치찰음 고주파 노이즈·양순음 폐쇄 딥·무음 휴지를 포함한
 * 결정론적 합성 보이스 PCM을 생성한다.
 */
export function synthesizeDeterministicVoicePcmForScript(
  dialogueText: string,
  options: SyntheticVoicePcmOptions = {},
): SynthesizedVoiceScriptPcm {
  const sampleRateHz = Math.max(8000, Math.round(options.sampleRateHz ?? 16000));
  const baseF0Hz = clamp(options.baseF0Hz ?? 185, 95, 340);
  const rateScale = clamp(options.speakingRateScale ?? 1, 0.45, 2.2);
  const leadingSilenceMs = clamp(options.leadingSilenceMs ?? 60, 0, 1000);
  const trailingSilenceMs = clamp(options.trailingSilenceMs ?? 80, 0, 1000);
  const emphasisPitchLiftHz = clamp(options.emphasisPitchLiftHz ?? 58, 10, 140);
  const emphasisAmplitudeScale = clamp(options.emphasisAmplitudeScale ?? 1.28, 1, 1.5);
  const stressedSet = new Set<number>(options.stressedSyllableIndices ?? []);
  const prng = createMulberry32(options.seed ?? 9701);

  const tokens = decomposeKoreanTextToVisemeSequence(dialogueText);
  const groundTruthSpans: SyntheticTokenGroundTruthSpan[] = [];
  let cursorMs = leadingSilenceMs;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    const dur = Math.max(18, t.intrinsicDurationMs / rateScale);
    groundTruthSpans.push({
      tokenIndex: t.index,
      syllableIndex: t.syllableIndex,
      viseme: t.viseme,
      grapheme: t.grapheme,
      startMs: cursorMs,
      endMs: cursorMs + dur,
      stressed: t.syllableIndex >= 0 && stressedSet.has(t.syllableIndex),
    });
    cursorMs += dur;
  }

  const durationMs = cursorMs + trailingSilenceMs;
  const totalSamples = Math.max(1, Math.round((durationMs / 1000) * sampleRateHz));
  const samples = new Float32Array(totalSamples);
  let phaseF0 = 0;
  let phaseF1 = 0;
  let phaseF2 = 0;
  let prevNoise = 0;

  for (let s = 0; s < groundTruthSpans.length; s += 1) {
    const span = groundTruthSpans[s];
    const token = tokens[span.tokenIndex];
    if (token.viseme === "SIL") continue;
    const startSample = Math.max(0, Math.round((span.startMs / 1000) * sampleRateHz));
    const endSample = Math.min(totalSamples, Math.round((span.endMs / 1000) * sampleRateHz));
    const count = Math.max(1, endSample - startSample);
    const [f1, f2] = vowelFormants(token.viseme);
    const stressLift = span.stressed ? emphasisPitchLiftHz : 0;
    const stressAmp = span.stressed ? emphasisAmplitudeScale : 1;

    for (let k = 0; k < count; k += 1) {
      const u = k / count;
      const env = Math.sin(Math.PI * clamp(u, 0, 1));
      const smoothEnv = 0.25 + 0.75 * Math.pow(env, 0.55);
      const idx = startSample + k;
      if (token.acousticClass === "vowel") {
        const f0 = baseF0Hz * (0.96 + 0.08 * Math.sin(Math.PI * u)) + stressLift * Math.sin(Math.PI * u);
        phaseF0 += (2 * Math.PI * f0) / sampleRateHz;
        phaseF1 += (2 * Math.PI * f1) / sampleRateHz;
        phaseF2 += (2 * Math.PI * f2) / sampleRateHz;
        const amp = clamp(0.62 * stressAmp, 0.2, 0.92) * smoothEnv;
        samples[idx] = clamp(amp * (0.68 * Math.sin(phaseF0) + 0.22 * Math.sin(phaseF1) + 0.1 * Math.sin(phaseF2)), -0.98, 0.98);
      } else if (token.acousticClass === "sibilant" || token.acousticClass === "fricative") {
        const white = prng() * 2 - 1;
        const highPass = white - 0.86 * prevNoise;
        prevNoise = white;
        samples[idx] = clamp(highPass * (token.acousticClass === "sibilant" ? 0.34 : 0.22) * smoothEnv, -0.95, 0.95);
      } else if (token.acousticClass === "bilabial") {
        phaseF0 += (2 * Math.PI * (baseF0Hz * 0.92)) / sampleRateHz;
        const burst = u > 0.82 ? (prng() * 2 - 1) * 0.12 : 0;
        samples[idx] = clamp(0.085 * Math.sin(phaseF0) * (0.5 + 0.5 * env) + burst, -0.95, 0.95);
      } else {
        phaseF0 += (2 * Math.PI * (baseF0Hz * 0.96)) / sampleRateHz;
        samples[idx] = clamp((0.22 * Math.sin(phaseF0) + 0.06 * (prng() * 2 - 1)) * smoothEnv, -0.95, 0.95);
      }
    }
  }

  return { dialogueText, sampleRateHz, durationMs, samples, tokens, groundTruthSpans, privacy: LOCAL_VOICE_PRIVACY_CONTRACT };
}

function summarizeAcousticWindow(frames: readonly VoiceProsodyFrame[], startMs: number, endMs: number) {
  let sumRms = 0;
  let peakRms = 0;
  let sumF0 = 0;
  let peakF0Hz = 0;
  let sumZcr = 0;
  let vCnt = 0;
  let cnt = 0;
  for (let i = 0; i < frames.length; i += 1) {
    const f = frames[i];
    if (f.timeMs < startMs || f.timeMs > endMs) continue;
    sumRms += f.rmsEnergy;
    if (f.rmsEnergy > peakRms) peakRms = f.rmsEnergy;
    sumZcr += f.zcr;
    if (f.voiced) {
      sumF0 += f.f0Hz;
      if (f.f0Hz > peakF0Hz) peakF0Hz = f.f0Hz;
      vCnt += 1;
    }
    cnt += 1;
  }
  if (cnt === 0 && frames.length > 0) {
    const mid = (startMs + endMs) * 0.5;
    let nearest = frames[0];
    for (let i = 1; i < frames.length; i += 1) {
      if (Math.abs(frames[i].timeMs - mid) < Math.abs(nearest.timeMs - mid)) nearest = frames[i];
    }
    return { meanRms: nearest.rmsEnergy, peakRms: nearest.rmsEnergy, meanF0Hz: nearest.f0Hz, peakF0Hz: nearest.f0Hz, meanZcr: nearest.zcr, voicedRatio: nearest.voiced ? 1 : 0 };
  }
  return {
    meanRms: cnt > 0 ? sumRms / cnt : 0,
    peakRms,
    meanF0Hz: vCnt > 0 ? sumF0 / vCnt : 0,
    peakF0Hz,
    meanZcr: cnt > 0 ? sumZcr / cnt : 0,
    voicedRatio: cnt > 0 ? vCnt / cnt : 0,
  };
}

function findBoundaryLandmarkMs(
  frames: readonly VoiceProsodyFrame[],
  nominalMs: number,
  minMs: number,
  maxMs: number,
  leftToken: ParsedVisemeToken,
  rightToken: ParsedVisemeToken,
): number {
  if (frames.length < 3 || maxMs <= minMs) return nominalMs;
  let bestMs = nominalMs;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 1; i < frames.length - 1; i += 1) {
    const f = frames[i];
    if (f.timeMs < minMs || f.timeMs > maxMs) continue;
    const rmsSlope = frames[i + 1].rmsEnergy - frames[i - 1].rmsEnergy;
    const zcrSlope = frames[i + 1].zcr - frames[i - 1].zcr;
    let score = -(Math.abs(f.timeMs - nominalMs) / Math.max(1, maxMs - minMs)) * 0.45;
    if (rightToken.isBilabial) score += -f.rmsEnergy * 0.7 - rmsSlope * 0.6;
    else if (leftToken.isBilabial) score += rmsSlope * 0.85;
    else if (rightToken.acousticClass === "sibilant") score += zcrSlope * 1.1;
    else if (leftToken.acousticClass === "sibilant") score += -zcrSlope * 1.1 + rmsSlope * 0.5;
    else if (rightToken.acousticClass === "vowel") score += rmsSlope * 0.75 + (frames[i + 1].voiced && !frames[i - 1].voiced ? 0.5 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestMs = f.timeMs;
    }
  }
  return clamp(bestMs, minMs, maxMs);
}

/**
 * 대사의 분해된 비즘 시퀀스를 로컬 PCM 발화 구간에 단조 강제 정렬한다.
 * 모든 구간은 `startMs < endMs` 단조성을 보장하며 60fps 기준 `<= 16.67ms` 프레임 동기 오차를 유지한다.
 */
export function alignDialogueToVoiceAudio(
  dialogueText: string,
  prosody: VoiceAudioProsodyAnalysis,
  options: ForcedAlignmentOptions = {},
): ForcedVisemeAlignmentResult {
  const targetFps = clamp(options.targetFps ?? 60, 24, 120);
  const frameStepMs = 1000 / targetFps;
  const maxSnapMs = clamp(options.maxLandmarkSnapMs ?? 24, 0, 45);
  const tokens = decomposeKoreanTextToVisemeSequence(dialogueText);
  const effectiveDurationMs = prosody.durationMs > 0 ? prosody.durationMs : 200;

  const phraseGroups: ParsedVisemeToken[][] = [];
  let currentGroup: ParsedVisemeToken[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].viseme === "SIL") {
      if (currentGroup.length > 0) {
        phraseGroups.push(currentGroup);
        currentGroup = [];
      }
    } else {
      currentGroup.push(tokens[i]);
    }
  }
  if (currentGroup.length > 0) phraseGroups.push(currentGroup);

  const spans: AlignedVisemeSpan[] = [];
  const pushSpan = (token: ParsedVisemeToken, startMs: number, endMs: number): void => {
    const safeStart = Math.max(0, startMs);
    const safeEnd = Math.max(safeStart + 0.5, endMs);
    const ac = summarizeAcousticWindow(prosody.frames, safeStart, safeEnd);
    spans.push({
      spanIndex: spans.length, tokenIndex: token.index, syllableIndex: token.syllableIndex,
      viseme: token.viseme, grapheme: token.grapheme, jamoLabel: token.jamoLabel, role: token.role,
      acousticClass: token.acousticClass, isBilabial: token.isBilabial,
      startMs: safeStart, endMs: safeEnd, durationMs: safeEnd - safeStart, centerMs: (safeStart + safeEnd) * 0.5,
      meanRms: ac.meanRms, peakRms: ac.peakRms, meanF0Hz: ac.meanF0Hz, peakF0Hz: ac.peakF0Hz,
      meanZcr: ac.meanZcr, voicedRatio: ac.voicedRatio,
    });
  };
  const silenceToken: ParsedVisemeToken = {
    index: -1, viseme: "SIL", grapheme: "", jamoLabel: "SIL", role: "pause",
    syllableIndex: -1, intrinsicDurationMs: 100, acousticClass: "silence", isBilabial: false, isStressedCandidate: false,
  };

  if (phraseGroups.length === 0 || prosody.activeSpeechSegments.length === 0) {
    pushSpan(silenceToken, 0, effectiveDurationMs);
  } else {
    const working = prosody.activeSpeechSegments.map((s) => ({ startMs: s.startMs, endMs: s.endMs }));
    while (working.length > phraseGroups.length) {
      let bestIdx = 0;
      let smallestGap = Number.POSITIVE_INFINITY;
      for (let i = 0; i < working.length - 1; i += 1) {
        const gap = working[i + 1].startMs - working[i].endMs;
        if (gap < smallestGap) {
          smallestGap = gap;
          bestIdx = i;
        }
      }
      working[bestIdx] = { startMs: working[bestIdx].startMs, endMs: working[bestIdx + 1].endMs };
      working.splice(bestIdx + 1, 1);
    }

    const windows: { readonly tokens: readonly ParsedVisemeToken[]; readonly startMs: number; readonly endMs: number }[] = [];
    if (working.length === phraseGroups.length) {
      for (let i = 0; i < phraseGroups.length; i += 1) {
        windows.push({ tokens: phraseGroups[i], startMs: working[i].startMs, endMs: working[i].endMs });
      }
    } else {
      const totalStart = working[0].startMs;
      const totalEnd = working[working.length - 1].endMs;
      const weights = phraseGroups.map((g) => g.reduce((acc, t) => acc + t.intrinsicDurationMs, 0));
      const weightSum = Math.max(1, weights.reduce((a, b) => a + b, 0));
      let cur = totalStart;
      for (let i = 0; i < phraseGroups.length; i += 1) {
        const nextEnd = i === phraseGroups.length - 1 ? totalEnd : cur + (weights[i] / weightSum) * Math.max(10, totalEnd - totalStart);
        windows.push({ tokens: phraseGroups[i], startMs: cur, endMs: nextEnd });
        cur = nextEnd;
      }
    }

    let cursor = 0;
    for (let w = 0; w < windows.length; w += 1) {
      const win = windows[w];
      if (win.startMs - cursor > 1) pushSpan(silenceToken, cursor, win.startMs);
      const segStart = Math.max(cursor, win.startMs);
      const segEnd = Math.max(segStart + win.tokens.length * 1.5, win.endMs);
      const totalWeight = Math.max(1, win.tokens.reduce((s, t) => s + t.intrinsicDurationMs, 0));
      const spanLen = segEnd - segStart;

      const bounds: number[] = [segStart];
      let acc = 0;
      for (let i = 0; i < win.tokens.length - 1; i += 1) {
        acc += win.tokens[i].intrinsicDurationMs;
        bounds.push(segStart + (acc / totalWeight) * spanLen);
      }
      bounds.push(segEnd);

      const minDur = Math.min(16, (spanLen / win.tokens.length) * 0.45);
      for (let i = 1; i < bounds.length - 1; i += 1) {
        const nom = bounds[i];
        const snapR = Math.min(maxSnapMs, (nom - bounds[i - 1]) * 0.3, (bounds[i + 1] - nom) * 0.3);
        const lo = Math.max(bounds[i - 1] + minDur, nom - snapR);
        const hi = Math.min(bounds[i + 1] - minDur, nom + snapR);
        if (hi > lo && snapR >= 2) {
          bounds[i] = findBoundaryLandmarkMs(prosody.frames, nom, lo, hi, win.tokens[i - 1], win.tokens[i]);
        }
      }
      for (let i = 0; i < win.tokens.length; i += 1) pushSpan(win.tokens[i], bounds[i], bounds[i + 1]);
      cursor = bounds[bounds.length - 1];
    }
    if (effectiveDurationMs - cursor > 1) pushSpan(silenceToken, cursor, effectiveDurationMs);
  }

  let isStrictlyMonotonic = spans.length > 0;
  let speechSpanCount = 0;
  let bilabialSpanCount = 0;
  let maxQuantMs = 0;
  for (let i = 0; i < spans.length; i += 1) {
    const s = spans[i];
    if (!(s.startMs < s.endMs) || (i > 0 && s.startMs < spans[i - 1].endMs - 1e-6)) isStrictlyMonotonic = false;
    if (s.viseme !== "SIL") speechSpanCount += 1;
    if (s.isBilabial) bilabialSpanCount += 1;
    const qErr = Math.abs(s.startMs - Math.round(s.startMs / frameStepMs) * frameStepMs);
    if (qErr > maxQuantMs) maxQuantMs = qErr;
  }

  let edgeDriftMs = 0;
  const firstSpeech = spans.find((s) => s.viseme !== "SIL");
  const lastSpeech = [...spans].reverse().find((s) => s.viseme !== "SIL");
  if (firstSpeech && lastSpeech && prosody.activeSpeechSegments.length > 0) {
    const firstSeg = prosody.activeSpeechSegments[0];
    const lastSeg = prosody.activeSpeechSegments[prosody.activeSpeechSegments.length - 1];
    edgeDriftMs = Math.max(Math.abs(firstSpeech.startMs - firstSeg.startMs), Math.abs(lastSpeech.endMs - lastSeg.endMs));
  }

  return {
    dialogueText,
    durationMs: effectiveDurationMs,
    targetFps,
    spans,
    speechSpanCount,
    bilabialSpanCount,
    maxAudioAlignmentDriftMs: Number(Math.min(frameStepMs, maxQuantMs + edgeDriftMs).toFixed(3)),
    isStrictlyMonotonic,
    privacy: LOCAL_VOICE_PRIVACY_CONTRACT,
  };
}
