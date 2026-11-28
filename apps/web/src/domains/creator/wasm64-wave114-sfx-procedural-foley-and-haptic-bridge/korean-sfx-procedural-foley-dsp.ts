/**
 * Wave 114: 한국어 웹툰 효과음(SFX) 프로시저럴 폴리(Foley) DSP 합성 엔진.
 *
 * 외부 오디오 파일 없이 한국어 의성어·의태어를 6종 정규 폴리 아키타입으로 분류하고
 * 방송 안전 기준(`<= -1.0 dBFS`, DC 오프셋 `< 0.01`, 비유한 샘플 0건)을 만족하는
 * 결정론적 모노 PCM과 실측 음향 기술자를 생성한다.
 */

import {
  TWO_PI,
  analyzePcmAcousticDescriptors,
  clamp,
  createDeterministicRng,
  linearToDbfs,
  makeBiquadCoeffs,
  normalizeDeterministicSeed,
  stepBiquad,
  type BiquadState,
  type DeterministicRng,
  type SfxAcousticDescriptors,
  type SfxSampleRateHz,
} from "./foley-dsp-math";

export {
  analyzePcmAcousticDescriptors,
  linearToDbfs,
  normalizeDeterministicSeed,
  type SfxAcousticDescriptors,
  type SfxSampleRateHz,
};

/** 웹툰 효과음 정규 6종 폴리(Foley) 아키타입. */
export type SfxFoleyArchetype =
  | "impact-boom"
  | "blade-clash"
  | "heartbeat-thump"
  | "whoosh-dash"
  | "rain-ambience"
  | "glass-shatter";

/** 방송 안전 피크 상한(dBFS). */
export const PEAK_SAFETY_CEILING_DBFS = -1.0;

/** 방송 안전 피크 선형 상한(`-1.0 dBFS` ≈ `0.89125`, Float32 반올림 여유 확보). */
export const PEAK_SAFETY_CEILING_LINEAR = 0.891;

/** 6종 정규 폴리 아키타입 목록. */
export const SFX_FOLEY_ARCHETYPES: readonly SfxFoleyArchetype[] = [
  "impact-boom",
  "blade-clash",
  "heartbeat-thump",
  "whoosh-dash",
  "rain-ambience",
  "glass-shatter",
];

/** 한국어 효과음 분류 결과. */
export interface KoreanSfxClassification {
  readonly rawText: string;
  readonly normalizedText: string;
  readonly archetype: SfxFoleyArchetype;
  readonly confidence: number;
  readonly matchedKeyword: string | null;
  readonly captionCategoryKo: string;
  readonly recommendedBaseFreqHz: number;
  readonly recommendedDurationMs: number;
  readonly intensityHint: number;
}

/** 단일 한국어 효과음 폴리 합성 요청. */
export interface KoreanSfxFoleyRequest {
  readonly sfxTextKo?: string;
  readonly archetype?: SfxFoleyArchetype;
  readonly sampleRateHz?: SfxSampleRateHz;
  readonly durationMs?: number;
  readonly intensity?: number;
  readonly baseFreqHz?: number;
  readonly seed?: number | string;
}

/** 단일 한국어 효과음 프로시저럴 폴리 합성 결과. */
export interface SynthesizedKoreanSfxFoley {
  readonly archetype: SfxFoleyArchetype;
  readonly classification: KoreanSfxClassification;
  readonly sampleRateHz: SfxSampleRateHz;
  readonly durationMs: number;
  readonly appliedIntensity: number;
  readonly baseFreqHz: number;
  readonly seedNumber: number;
  readonly pcm: Float32Array;
  readonly descriptors: SfxAcousticDescriptors;
}

interface ArchetypeDefaults {
  readonly captionCategoryKo: string;
  readonly baseFreqHz: number;
  readonly durationMs: number;
  readonly attackMs: number;
  readonly releaseMs: number;
}

const ARCHETYPE_DEFAULTS: Readonly<Record<SfxFoleyArchetype, ArchetypeDefaults>> = {
  "impact-boom": { captionCategoryKo: "폭발 충격음", baseFreqHz: 130, durationMs: 620, attackMs: 2.5, releaseMs: 45 },
  "blade-clash": { captionCategoryKo: "금속 검격음", baseFreqHz: 940, durationMs: 480, attackMs: 1.5, releaseMs: 55 },
  "heartbeat-thump": { captionCategoryKo: "심장 박동", baseFreqHz: 62, durationMs: 880, attackMs: 6, releaseMs: 40 },
  "whoosh-dash": { captionCategoryKo: "질주 풍절음", baseFreqHz: 780, durationMs: 460, attackMs: 18, releaseMs: 60 },
  "rain-ambience": { captionCategoryKo: "빗소리 배경음", baseFreqHz: 1650, durationMs: 1100, attackMs: 45, releaseMs: 80 },
  "glass-shatter": { captionCategoryKo: "유리 파쇄음", baseFreqHz: 2450, durationMs: 560, attackMs: 1.5, releaseMs: 50 },
};

/** 아키타입별 한국어 의성어·의태어 사전(최장 키워드 우선 매칭). */
const ARCHETYPE_KEYWORDS: Readonly<Record<SfxFoleyArchetype, readonly string[]>> = {
  "heartbeat-thump": ["쿵쾅쿵쾅", "두근두근", "콩닥콩닥", "두근거림", "쿵쾅", "두근", "콩닥", "벌렁", "심장"],
  "rain-ambience": ["주룩주룩", "보슬보슬", "추적추적", "후두둑", "후드득", "주르륵", "쏴아아", "빗소리", "빗방울", "소나기", "주룩", "쏴아"],
  "glass-shatter": ["산산조각", "와장창", "쨍그랑", "파지직", "바사삭", "파직", "와직", "유리", "쨍"],
  "blade-clash": ["스르릉", "차아앙", "챙강", "서걱", "차앙", "스릉", "카앙", "쩌렁", "검격", "챙", "깡"],
  "whoosh-dash": ["휘이익", "스으윽", "슈우욱", "휘리릭", "휘익", "스윽", "슈욱", "슈웅", "후욱", "바람", "질주", "휙", "쌩", "홱", "쓩"],
  "impact-boom": ["콰과광", "쿠구궁", "우당탕", "우르릉", "콰광", "쿠웅", "퍼엉", "두웅", "폭발", "충격", "쾅", "쿵", "펑", "퍽", "둥"],
};

const BLADE_MODAL_RATIOS: readonly number[] = [1.0, 1.47, 2.09, 2.86, 3.74];

/** 아키타입별 한국어 무음 독자 자막 카테고리 라벨을 반환한다. */
export function getArchetypeCaptionCategoryKo(archetype: SfxFoleyArchetype): string {
  return ARCHETYPE_DEFAULTS[archetype].captionCategoryKo;
}

/** 한국어 웹툰 의성어·의태어 문자열을 6종 정규 폴리 아키타입으로 분류한다. */
export function classifyKoreanComicSfxText(sfxTextKo: string): KoreanSfxClassification {
  const rawText = typeof sfxTextKo === "string" ? sfxTextKo : "";
  const trimmed = rawText.trim();
  const normalizedText = trimmed.replace(/[\s!?~….,'"`·\-_()[\]{}]/g, "");

  let exclamationCount = 0;
  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed.charAt(i) === "!") exclamationCount += 1;
  }

  let bestArchetype: SfxFoleyArchetype | null = null;
  let matchedKeyword: string | null = null;
  for (let a = 0; a < SFX_FOLEY_ARCHETYPES.length; a += 1) {
    const candidate = SFX_FOLEY_ARCHETYPES[a];
    if (candidate === undefined) continue;
    const words = ARCHETYPE_KEYWORDS[candidate];
    for (let w = 0; w < words.length; w += 1) {
      const kw = words[w];
      if (kw !== undefined && normalizedText.indexOf(kw) !== -1) {
        if (matchedKeyword === null || kw.length > matchedKeyword.length) {
          matchedKeyword = kw;
          bestArchetype = candidate;
        }
      }
    }
  }

  let archetype: SfxFoleyArchetype = bestArchetype ?? "impact-boom";
  let confidence = matchedKeyword !== null ? (normalizedText === matchedKeyword ? 0.98 : 0.91) : 0.48;

  if (bestArchetype === null && normalizedText.length > 0) {
    const firstCode = normalizedText.charCodeAt(0);
    if (firstCode >= 0xac00 && firstCode <= 0xd7a3) {
      const choseong = Math.floor((firstCode - 0xac00) / 588);
      if (choseong === 18 || choseong === 9 || choseong === 10) {
        archetype = "whoosh-dash";
        confidence = 0.56;
      } else if (choseong === 14 || choseong === 13) {
        archetype = "blade-clash";
        confidence = 0.54;
      }
    }
  }

  const defaults = ARCHETYPE_DEFAULTS[archetype];
  const baseIntensity =
    archetype === "rain-ambience" ? 0.48 : archetype === "heartbeat-thump" ? 0.62 : 0.72;
  const intensityHint = clamp(
    baseIntensity + Math.min(exclamationCount, 3) * 0.08 + (normalizedText.length >= 4 ? 0.04 : 0),
    0.2,
    0.98,
  );

  return {
    rawText,
    normalizedText,
    archetype,
    confidence,
    matchedKeyword,
    captionCategoryKo: defaults.captionCategoryKo,
    recommendedBaseFreqHz: defaults.baseFreqHz,
    recommendedDurationMs: defaults.durationMs,
    intensityHint,
  };
}

/** 1) 폭발/타격 충격음: 지수 주파수 하강 서브베이스(130Hz -> 34Hz) + 저역통과 노이즈 버스트. */
function renderImpactBoom(
  out: Float64Array,
  sampleRateHz: number,
  baseFreqHz: number,
  rng: DeterministicRng,
): readonly number[] {
  const n = out.length;
  const durationSec = n / sampleRateHz;
  const startFreq = clamp(baseFreqHz, 85, 190);
  const endFreq = clamp(startFreq * 0.26, 28, 44);
  const lpfState: BiquadState = { x1: 0, x2: 0, y1: 0, y2: 0 };
  const lpfCoeffs = makeBiquadCoeffs("lowpass", sampleRateHz, 340, 0.85);
  let phase = 0;

  for (let i = 0; i < n; i += 1) {
    const t = i / sampleRateHz;
    const normT = t / Math.max(durationSec, 0.05);
    const freq = endFreq + (startFreq - endFreq) * Math.exp(-t * 14.5);
    phase += (TWO_PI * freq) / sampleRateHz;
    const subEnv = Math.exp(-t * (4.2 / Math.max(0.35, durationSec))) * (1 - Math.exp(-t * 280));
    const subTone = Math.sin(phase) * 0.84 + Math.sin(phase * 2) * 0.14 * Math.exp(-t * 12);
    const burstEnv = Math.exp(-t * 26) * (1 - Math.exp(-t * 400));
    const lowNoise = stepBiquad(lpfState, lpfCoeffs, rng.nextBipolar());
    const tailRumble = Math.sin(phase * 0.5) * 0.16 * Math.exp(-normT * 3.1);
    out[i] = subTone * subEnv + lowNoise * burstEnv * 0.55 + tailRumble;
  }
  return [Math.min(18, Math.round(durationSec * 1000 * 0.08))];
}

/** 2) 금속 검격음: 비조화 모달 공명 `[1.0, 1.47, 2.09, 2.86, 3.74]` + 고역 금속 마찰 트랜지언트. */
function renderBladeClash(
  out: Float64Array,
  sampleRateHz: number,
  baseFreqHz: number,
  rng: DeterministicRng,
): readonly number[] {
  const n = out.length;
  const nyquistSafe = sampleRateHz * 0.44;
  const f0 = clamp(baseFreqHz, 650, Math.min(1450, nyquistSafe / 3.8));
  const modalPhases = new Float64Array(BLADE_MODAL_RATIOS.length);
  const modalDecays = [4.6, 5.8, 7.1, 8.9, 11.2];
  const modalWeights = [0.42, 0.34, 0.28, 0.22, 0.18];
  for (let m = 0; m < modalPhases.length; m += 1) modalPhases[m] = rng.nextUnit() * TWO_PI;

  const hpfState: BiquadState = { x1: 0, x2: 0, y1: 0, y2: 0 };
  const hpfCoeffs = makeBiquadCoeffs("highpass", sampleRateHz, Math.min(3400, nyquistSafe * 0.72), 1.4);

  for (let i = 0; i < n; i += 1) {
    const t = i / sampleRateHz;
    let modalSum = 0;
    for (let m = 0; m < BLADE_MODAL_RATIOS.length; m += 1) {
      const freq = Math.min(nyquistSafe, f0 * (BLADE_MODAL_RATIOS[m] ?? 1));
      const nextPhase = (modalPhases[m] ?? 0) + (TWO_PI * freq) / sampleRateHz;
      modalPhases[m] = nextPhase;
      modalSum += Math.sin(nextPhase) * (modalWeights[m] ?? 0.2) * Math.exp(-t * (modalDecays[m] ?? 6));
    }
    const scrapeEnv = Math.exp(-t * 34) * (1 - Math.exp(-t * 600));
    const secondRingEnv = t >= 0.045 ? Math.exp(-(t - 0.045) * 28) * 0.55 : 0;
    const scrapeNoise = stepBiquad(hpfState, hpfCoeffs, rng.nextBipolar());
    out[i] = modalSum * 0.85 + scrapeNoise * (scrapeEnv * 0.65 + secondRingEnv * 0.35);
  }
  const durMs = (n / sampleRateHz) * 1000;
  return durMs >= 120 ? [8, Math.min(58, Math.round(durMs * 0.22))] : [8];
}

/** 3) 심장 박동: 생리적 S1–S2 럽-덥(Lub-Dub) 이중 저주파 펄스. */
function renderHeartbeatThump(out: Float64Array, sampleRateHz: number, baseFreqHz: number): readonly number[] {
  const n = out.length;
  const durationSec = n / sampleRateHz;
  const s1Freq = clamp(baseFreqHz, 44, 78);
  const s2Freq = clamp(s1Freq * 1.24, 56, 98);
  const cycleSec = 0.86;
  const s2DelaySec = 0.255;
  const transients: number[] = [];
  const cycleCount = Math.max(1, Math.ceil(durationSec / cycleSec));

  for (let c = 0; c < cycleCount; c += 1) {
    const s1Start = c * cycleSec + 0.045;
    const s2Start = s1Start + s2DelaySec;
    if (s1Start < durationSec - 0.02) transients.push(Math.round(s1Start * 1000));
    if (s2Start < durationSec - 0.02) transients.push(Math.round(s2Start * 1000));

    for (let i = 0; i < n; i += 1) {
      const t = i / sampleRateHz;
      let sample = 0;
      const dt1 = t - s1Start;
      if (dt1 >= 0 && dt1 < 0.22) {
        const env1 = Math.sin(Math.min(1, dt1 / 0.024) * (Math.PI * 0.5)) * Math.exp(-dt1 * 18);
        sample += Math.sin(TWO_PI * s1Freq * (0.64 + 0.36 * Math.exp(-dt1 * 14)) * dt1) * env1 * 0.96;
      }
      const dt2 = t - s2Start;
      if (dt2 >= 0 && dt2 < 0.18) {
        const env2 = Math.sin(Math.min(1, dt2 / 0.02) * (Math.PI * 0.5)) * Math.exp(-dt2 * 24);
        sample += Math.sin(TWO_PI * s2Freq * (0.68 + 0.32 * Math.exp(-dt2 * 16)) * dt2) * env2 * 0.72;
      }
      out[i] = (out[i] ?? 0) + sample;
    }
  }
  return transients;
}

/** 4) 질주/바람 풍절음: 대역통과 필터 스윕 속도 노이즈 포락선. */
function renderWhooshDash(
  out: Float64Array,
  sampleRateHz: number,
  baseFreqHz: number,
  rng: DeterministicRng,
): readonly number[] {
  const n = out.length;
  const durationSec = Math.max(0.08, n / sampleRateHz);
  const nyquistSafe = sampleRateHz * 0.42;
  const lowSweepHz = clamp(baseFreqHz * 0.42, 220, 620);
  const peakSweepHz = clamp(baseFreqHz * 3.1, 1400, nyquistSafe);
  const bp1: BiquadState = { x1: 0, x2: 0, y1: 0, y2: 0 };
  const bp2: BiquadState = { x1: 0, x2: 0, y1: 0, y2: 0 };
  let coeffs = makeBiquadCoeffs("bandpass", sampleRateHz, lowSweepHz, 2.1);

  for (let i = 0; i < n; i += 1) {
    const u = i / Math.max(1, n - 1);
    const velocityCurve = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.82)), 1.35);
    if ((i & 15) === 0) {
      coeffs = makeBiquadCoeffs("bandpass", sampleRateHz, lowSweepHz + (peakSweepHz - lowSweepHz) * velocityCurve, 2.2);
    }
    const f1 = stepBiquad(bp1, coeffs, rng.nextBipolar());
    out[i] = stepBiquad(bp2, coeffs, f1 * 1.4) * (0.2 + 0.95 * velocityCurve);
  }
  return [Math.round(durationSec * 1000 * 0.4)];
}

/** 5) 빗소리 배경음: 핑크 노이즈 텍스처 + 희소 미세 빗방울 임펄스. */
function renderRainAmbience(
  out: Float64Array,
  sampleRateHz: number,
  baseFreqHz: number,
  rng: DeterministicRng,
): readonly number[] {
  const n = out.length;
  const nyquistSafe = sampleRateHz * 0.42;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  const airState: BiquadState = { x1: 0, x2: 0, y1: 0, y2: 0 };
  const airCoeffs = makeBiquadCoeffs("highpass", sampleRateHz, Math.min(950, nyquistSafe * 0.35), 0.7);

  for (let i = 0; i < n; i += 1) {
    const white = rng.nextBipolar();
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
    const rainAir = stepBiquad(airState, airCoeffs, pink);
    const swell = 0.82 + 0.18 * Math.sin((TWO_PI * i) / (sampleRateHz * 0.9));
    out[i] = (pink * 0.45 + rainAir * 0.85) * swell;
  }

  const dropletCount = clamp(Math.round((n / sampleRateHz) * 14), 4, 36);
  const transients: number[] = [];
  for (let d = 0; d < dropletCount; d += 1) {
    const startIdx = Math.floor(rng.nextUnit() * Math.max(1, n - Math.floor(sampleRateHz * 0.03)));
    const dropFreq = clamp(baseFreqHz * (0.95 + rng.nextUnit() * 1.45), 1300, nyquistSafe);
    const dropLen = Math.min(n - startIdx, Math.floor(sampleRateHz * 0.022));
    const amp = 0.18 + rng.nextUnit() * 0.22;
    if (d % 4 === 0) transients.push(Math.round((startIdx / sampleRateHz) * 1000));
    for (let k = 0; k < dropLen; k += 1) {
      const dt = k / sampleRateHz;
      out[startIdx + k] =
        (out[startIdx + k] ?? 0) + Math.sin(TWO_PI * dropFreq * (1 + dt * 9) * dt) * Math.exp(-dt * 190) * amp;
    }
  }
  transients.sort((a, b) => a - b);
  return transients;
}

/** 6) 유리 파쇄음: 고-Q 군집 결정성 차임 임펄스 + 고역 파열 크랙. */
function renderGlassShatter(
  out: Float64Array,
  sampleRateHz: number,
  baseFreqHz: number,
  rng: DeterministicRng,
): readonly number[] {
  const n = out.length;
  const nyquistSafe = sampleRateHz * 0.44;
  const hpfState: BiquadState = { x1: 0, x2: 0, y1: 0, y2: 0 };
  const hpfCoeffs = makeBiquadCoeffs("highpass", sampleRateHz, Math.min(3600, nyquistSafe * 0.72), 1.6);

  const crackLen = Math.min(n, Math.floor(sampleRateHz * 0.07));
  for (let i = 0; i < crackLen; i += 1) {
    const t = i / sampleRateHz;
    const crackEnv = Math.exp(-t * 58) * (1 - Math.exp(-t * 900));
    out[i] = stepBiquad(hpfState, hpfCoeffs, rng.nextBipolar()) * crackEnv * 0.68;
  }

  const transients: number[] = [6];
  const spreadSamples = Math.max(1, Math.floor(n * 0.48));
  for (let s = 0; s < 24; s += 1) {
    const u = rng.nextUnit();
    const startIdx = Math.floor(u * u * spreadSamples);
    const f1 = clamp(baseFreqHz * (0.95 + rng.nextUnit() * 1.65), 2100, nyquistSafe);
    const f2 = Math.min(nyquistSafe, f1 * (1.29 + rng.nextUnit() * 0.34));
    const decay = 18 + rng.nextUnit() * 24;
    const shardLen = Math.min(n - startIdx, Math.floor(sampleRateHz * 0.24));
    const amp = (0.14 + rng.nextUnit() * 0.18) * (1 - u * 0.45);
    if (s === 4 || s === 11) transients.push(Math.round((startIdx / sampleRateHz) * 1000));
    for (let k = 0; k < shardLen; k += 1) {
      const dt = k / sampleRateHz;
      const env = Math.exp(-dt * decay) * (1 - Math.exp(-dt * 1200));
      const chime = Math.sin(TWO_PI * f1 * dt) * 0.62 + Math.sin(TWO_PI * f2 * dt) * 0.38;
      out[startIdx + k] = (out[startIdx + k] ?? 0) + chime * env * amp;
    }
  }
  transients.sort((a, b) => a - b);
  return transients;
}

/** DC 차단, 안티클릭 페이드, 창-가중 잔여 DC 제거 및 `-1.0 dBFS` 소프트니 피크 리미터를 적용한다. */
function postProcessBroadcastSafePcm(
  raw: Float64Array,
  sampleRateHz: number,
  attackMs: number,
  releaseMs: number,
  intensity: number,
): Float32Array {
  const n = raw.length;
  const out = new Float32Array(n);
  if (n === 0) return out;

  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < n; i += 1) {
    const x = Number.isFinite(raw[i]) ? (raw[i] ?? 0) : 0;
    const y = x - prevIn + 0.996 * prevOut;
    prevIn = x;
    prevOut = y;
    raw[i] = y;
  }

  const attackSamples = Math.min(Math.floor(n * 0.25), Math.max(2, Math.round((attackMs / 1000) * sampleRateHz)));
  const releaseSamples = Math.min(Math.floor(n * 0.35), Math.max(4, Math.round((releaseMs / 1000) * sampleRateHz)));
  for (let i = 0; i < attackSamples; i += 1) {
    raw[i] = (raw[i] ?? 0) * (0.5 * (1 - Math.cos((Math.PI * i) / attackSamples)));
  }
  for (let i = 0; i < releaseSamples; i += 1) {
    const idx = n - 1 - i;
    raw[idx] = (raw[idx] ?? 0) * (0.5 * (1 - Math.cos((Math.PI * i) / releaseSamples)));
  }

  let rawPeak = 0;
  for (let i = 0; i < n; i += 1) {
    const abs = Math.abs(raw[i] ?? 0);
    if (abs > rawPeak) rawPeak = abs;
  }
  const safeIntensity = clamp(intensity, 0.05, 1.5);
  const targetDrive = safeIntensity <= 1.0 ? 0.28 + 0.58 * safeIntensity : 0.86 + (safeIntensity - 1.0) * 1.1;
  const normGain = rawPeak > 1e-6 ? targetDrive / rawPeak : 0;

  const knee = 0.72;
  const headroom = PEAK_SAFETY_CEILING_LINEAR - knee;
  let sumX = 0;
  let sumW = 0;
  for (let i = 0; i < n; i += 1) {
    const driven = (raw[i] ?? 0) * normGain;
    const absVal = Math.abs(driven);
    const limited =
      absVal > knee
        ? (driven >= 0 ? 1 : -1) * (knee + headroom * Math.tanh((absVal - knee) / headroom))
        : driven;
    const clamped = clamp(limited, -PEAK_SAFETY_CEILING_LINEAR, PEAK_SAFETY_CEILING_LINEAR);
    raw[i] = clamped;
    sumX += clamped;
    sumW += Math.sin((Math.PI * i) / Math.max(1, n - 1));
  }

  const dcCorrection = sumW > 1e-6 ? sumX / sumW : 0;
  for (let i = 0; i < n; i += 1) {
    const w = Math.sin((Math.PI * i) / Math.max(1, n - 1));
    out[i] = clamp((raw[i] ?? 0) - dcCorrection * w, -PEAK_SAFETY_CEILING_LINEAR, PEAK_SAFETY_CEILING_LINEAR);
  }
  out[0] = 0;
  out[n - 1] = 0;
  return out;
}

/** 한국어 웹툰 효과음 텍스트 또는 아키타입 요청을 결정론적 모노 폴리 PCM으로 합성한다. */
export function synthesizeKoreanSfxFoleyPcm(request: KoreanSfxFoleyRequest): SynthesizedKoreanSfxFoley {
  const sampleRateHz: SfxSampleRateHz = request.sampleRateHz ?? 24000;
  const classification = classifyKoreanComicSfxText(request.sfxTextKo ?? "");
  const archetype: SfxFoleyArchetype = request.archetype ?? classification.archetype;
  const defaults = ARCHETYPE_DEFAULTS[archetype];

  const durationMs = Math.round(clamp(request.durationMs ?? defaults.durationMs, 80, 6000));
  const appliedIntensity = clamp(request.intensity ?? classification.intensityHint, 0.05, 1.5);
  const baseFreqHz = clamp(request.baseFreqHz ?? defaults.baseFreqHz, 36, sampleRateHz * 0.38);
  const seedNumber = normalizeDeterministicSeed(
    request.seed,
    `${archetype}:${classification.normalizedText}:${durationMs}:${baseFreqHz}`,
  );
  const rng = createDeterministicRng(seedNumber);
  const raw = new Float64Array(Math.max(64, Math.round((durationMs / 1000) * sampleRateHz)));

  let transientTimesMs: readonly number[];
  switch (archetype) {
    case "impact-boom":
      transientTimesMs = renderImpactBoom(raw, sampleRateHz, baseFreqHz, rng);
      break;
    case "blade-clash":
      transientTimesMs = renderBladeClash(raw, sampleRateHz, baseFreqHz, rng);
      break;
    case "heartbeat-thump":
      transientTimesMs = renderHeartbeatThump(raw, sampleRateHz, baseFreqHz);
      break;
    case "whoosh-dash":
      transientTimesMs = renderWhooshDash(raw, sampleRateHz, baseFreqHz, rng);
      break;
    case "rain-ambience":
      transientTimesMs = renderRainAmbience(raw, sampleRateHz, baseFreqHz, rng);
      break;
    case "glass-shatter":
      transientTimesMs = renderGlassShatter(raw, sampleRateHz, baseFreqHz, rng);
      break;
  }

  const pcm = postProcessBroadcastSafePcm(raw, sampleRateHz, defaults.attackMs, defaults.releaseMs, appliedIntensity);
  return {
    archetype,
    classification,
    sampleRateHz,
    durationMs,
    appliedIntensity,
    baseFreqHz,
    seedNumber,
    pcm,
    descriptors: analyzePcmAcousticDescriptors(pcm, sampleRateHz, transientTimesMs),
  };
}
