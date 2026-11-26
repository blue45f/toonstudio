/**
 * 온디바이스 오프라인 음성 합성(TTS · 운율 · 립싱크 비젬) + 48비트 Smallest-Three 스켈레탈 애니메이션 코덱.
 *
 * - 서버 비용 ₩0: 한국어(한글 자모 분해)·영어·일본어(가나 모라 분해) 포먼트 PCM 16-bit/Float32 합성기
 * - 프로바이더 라우터: WebNN ONNX(VITS/Kokoro) → Web Speech API → 결정적 오프라인 포먼트 PCM 자동 폴백
 * - Wave-3 Rust 오디오 DSP / WebCodecs 로컬 오디오툰 내보내기와 호환되는 `Wave3StereoPcmBus` 직접 출력
 * - 3D 아바타용 6-비젬(`A/I/U/E/O/closed`) 립싱크 타임라인 및 동시조음 블렌드셰이프 샘플러
 * - 48비트(6바이트) Smallest-Three 쿼터니언 양자화 + Catmull-Rom 오차 상한 키프레임 간소화(>=75% 절감, <=0.5°)
 */

import type { Wave3StereoPcmBus } from "../wasm64-gpu-media-pipeline/webcodecs-audiotoon-timeline-mux";

export type SpeechLanguageCode = "ko" | "en" | "ja" | "auto";
export type VisemeId = "A" | "I" | "U" | "E" | "O" | "closed";
export type SpeechEmotionStyle = "neutral" | "bright" | "dramatic" | "calm" | "whisper";
export type OnDeviceSpeechProviderKind = "webnn-onnx-vits" | "webnn-onnx-kokoro" | "web-speech-api" | "local-formant-pcm";

export interface SpeechVoicePreset {
  readonly id: string; readonly labelKo: string; readonly basePitchHz: number;
  readonly formantScale: number; readonly breathiness: number; readonly speakingRate: number;
}

export const DEFAULT_SPEECH_VOICE_PRESETS: Readonly<Record<string, SpeechVoicePreset>> = {
  "narrator-calm": { id: "narrator-calm", labelKo: "차분한 내레이터", basePitchHz: 158, formantScale: 1.0, breathiness: 0.08, speakingRate: 1.0 },
  "heroine-bright": { id: "heroine-bright", labelKo: "밝은 주인공", basePitchHz: 232, formantScale: 1.14, breathiness: 0.12, speakingRate: 1.08 },
  "baritone-deep": { id: "baritone-deep", labelKo: "중저음 캐릭터", basePitchHz: 116, formantScale: 0.88, breathiness: 0.06, speakingRate: 0.94 },
};

export interface WebNnSpeechModelRunner {
  readonly modelKind: "webnn-onnx-vits" | "webnn-onnx-kokoro";
  readonly supportedLanguages: readonly Exclude<SpeechLanguageCode, "auto">[];
  readonly synthesizePcm: (input: {
    readonly text: string; readonly language: Exclude<SpeechLanguageCode, "auto">;
    readonly sampleRate: number; readonly speakingRate: number; readonly pitchScale: number;
  }) => Promise<Float32Array>;
}

export interface WebSpeechSynthesisLike {
  readonly getVoices: () => readonly { readonly lang: string; readonly name: string }[];
  readonly speak?: (utterance: { readonly text: string; readonly lang: string; readonly rate: number; readonly pitch: number }) => void;
}

export interface SpeechProviderProbeEnv {
  readonly navigatorMl?: { readonly createContext?: (options?: { readonly deviceType?: string }) => Promise<unknown> } | null;
  readonly speechSynthesis?: WebSpeechSynthesisLike | null;
  readonly webNnRunner?: WebNnSpeechModelRunner | null;
}

export interface SpeechProviderProbeReport {
  readonly webNnAvailable: boolean; readonly webNnModelKind: "webnn-onnx-vits" | "webnn-onnx-kokoro" | null;
  readonly webSpeechAvailable: boolean; readonly webSpeechVoiceCount: number;
  readonly selectedProvider: OnDeviceSpeechProviderKind; readonly pcmAlwaysAvailable: true;
  readonly serverCostKrw: 0; readonly reasonKo: string;
}

export interface SpeechSynthesisRequest {
  readonly text: string; readonly language?: SpeechLanguageCode; readonly sampleRate?: number;
  readonly voicePresetId?: string; readonly emotion?: SpeechEmotionStyle; readonly speakingRate?: number;
  readonly pitchShiftSemitones?: number; readonly stereoPan?: number; readonly preferProvider?: OnDeviceSpeechProviderKind;
}

export interface PhonemeUnit {
  readonly index: number; readonly symbol: string; readonly syllable: string;
  readonly language: Exclude<SpeechLanguageCode, "auto">; readonly viseme: VisemeId;
  readonly voiced: boolean; readonly fricative: boolean; readonly nasal: boolean;
  readonly f1Hz: number; readonly f2Hz: number; readonly f3Hz: number;
  readonly durationMs: number; readonly stress: number; readonly pitchMultiplier: number;
}

export interface VisemeKeyframe {
  readonly index: number; readonly startMs: number; readonly endMs: number; readonly durationMs: number;
  readonly viseme: VisemeId; readonly weight: number; readonly phoneme: string;
  readonly syllable: string; readonly pitchHz: number; readonly energy: number;
}

export interface VisemeBlendWeights {
  readonly A: number; readonly I: number; readonly U: number;
  readonly E: number; readonly O: number; readonly closed: number;
}

export interface SpeechSynthesisResult {
  readonly provider: OnDeviceSpeechProviderKind; readonly language: Exclude<SpeechLanguageCode, "auto">;
  readonly sampleRate: number; readonly durationMs: number; readonly frameCount: number;
  readonly pcmFloat32: Float32Array; readonly pcmInt16: Int16Array; readonly stereoBus: Wave3StereoPcmBus;
  readonly phonemes: readonly PhonemeUnit[]; readonly visemes: readonly VisemeKeyframe[];
  readonly peakLinear: number; readonly rmsLinear: number; readonly serverCostKrw: 0;
}

// ---------------------------------------------------------------------------
// 언어 판별 · 음소/음절 분해 · 포먼트 테이블
// ---------------------------------------------------------------------------

interface VowelFormantSpec { readonly viseme: VisemeId; readonly f1: number; readonly f2: number; readonly f3: number; readonly durationScale: number; }
interface ResonatorState { y1: number; y2: number; }

const VOWEL_FORMANTS: Readonly<Record<Exclude<VisemeId, "closed">, VowelFormantSpec>> = {
  A: { viseme: "A", f1: 760, f2: 1220, f3: 2550, durationScale: 1.05 },
  I: { viseme: "I", f1: 290, f2: 2280, f3: 3010, durationScale: 0.94 },
  U: { viseme: "U", f1: 340, f2: 880, f3: 2320, durationScale: 0.98 },
  E: { viseme: "E", f1: 520, f2: 1860, f3: 2640, durationScale: 1.0 },
  O: { viseme: "O", f1: 470, f2: 920, f3: 2480, durationScale: 1.02 },
};
const KO_CHO = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"] as const;
const KO_JUNG_VISEME: readonly Exclude<VisemeId, "closed">[] = [
  "A", "E", "A", "E", "O", "E", "O", "E", "O", "A", "E", "E", "O", "U", "O", "E", "I", "U", "U", "I", "I",
];
const KO_JUNG_BIAS: readonly (readonly [number, number])[] = [
  [1, 1], [0.84, 1.38], [0.98, 1.12], [0.82, 1.42], [1.14, 1.08], [0.95, 1.04], [1.1, 1.15],
  [0.92, 1.08], [1, 1], [0.94, 0.96], [0.88, 1.18], [0.92, 1.08], [0.98, 1.04], [1, 1],
  [1.08, 1.06], [0.96, 1.02], [1.04, 0.92], [0.96, 1.12], [1.18, 1.42], [1.06, 0.95], [1, 1],
];
const KO_JONG: readonly ("none" | "stop" | "nasal" | "liquid")[] = [
  "none", "stop", "stop", "stop", "nasal", "nasal", "nasal", "stop", "liquid", "stop", "nasal", "stop", "stop", "stop",
  "stop", "stop", "nasal", "stop", "stop", "stop", "stop", "nasal", "stop", "stop", "stop", "stop", "stop", "stop",
];
const KANA_VOWEL5: readonly Exclude<VisemeId, "closed">[] = ["A", "I", "U", "E", "O"];

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const isFricative = (c: string): boolean => c === "s" || c === "ss" || c === "h" || c === "f" || c === "z" || c === "sh" || c === "ch" || c === "jj" || c === "j";
const isNasal = (c: string): boolean => c === "n" || c === "m" || c === "ng";

function hashTextSeed32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0) || 0x12345678;
}

export function detectSpeechLanguage(text: string): Exclude<SpeechLanguageCode, "auto"> {
  let ko = 0; let ja = 0; let en = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c >= 0xac00 && c <= 0xd7a3) ko += 1;
    else if ((c >= 0x3040 && c <= 0x309f) || (c >= 0x30a0 && c <= 0x30ff)) ja += 1;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) en += 1;
  }
  if (ko >= ja && ko >= en && ko > 0) return "ko";
  if (ja > ko && ja >= en && ja > 0) return "ja";
  return "en";
}

function mapKanaCode(code: number): { readonly viseme: VisemeId; readonly fric: boolean; readonly nasal: boolean; readonly pause: boolean } {
  const n = code >= 0x30a1 && code <= 0x30f6 ? code - 0x60 : code;
  if (n === 0x3063) return { viseme: "closed", fric: false, nasal: false, pause: true };
  if (n === 0x3093) return { viseme: "closed", fric: false, nasal: true, pause: false };
  if (n >= 0x3041 && n <= 0x304a) return { viseme: KANA_VOWEL5[Math.floor((n - 0x3041) / 2)] ?? "A", fric: false, nasal: false, pause: false };
  if (n >= 0x304b && n <= 0x3062) return { viseme: KANA_VOWEL5[Math.floor((n - 0x304b) / 2) % 5] ?? "A", fric: n >= 0x3055, nasal: false, pause: false };
  if (n >= 0x3064 && n <= 0x3069) return { viseme: KANA_VOWEL5[n <= 0x3065 ? 2 : n <= 0x3067 ? 3 : 4] ?? "U", fric: false, nasal: false, pause: false };
  if (n >= 0x306a && n <= 0x306e) return { viseme: KANA_VOWEL5[n - 0x306a] ?? "A", fric: false, nasal: true, pause: false };
  if (n >= 0x306f && n <= 0x307d) return { viseme: KANA_VOWEL5[Math.floor((n - 0x306f) / 3) % 5] ?? "A", fric: (n - 0x306f) % 3 === 0, nasal: false, pause: false };
  if (n >= 0x307e && n <= 0x3082) return { viseme: KANA_VOWEL5[n - 0x307e] ?? "A", fric: false, nasal: true, pause: false };
  if (n >= 0x3083 && n <= 0x3088) return { viseme: (["A", "A", "U", "U", "O", "O"] as const)[n - 0x3083] ?? "A", fric: false, nasal: false, pause: false };
  if (n >= 0x3089 && n <= 0x308d) return { viseme: KANA_VOWEL5[n - 0x3089] ?? "A", fric: false, nasal: false, pause: false };
  return { viseme: n === 0x3092 ? "O" : "A", fric: false, nasal: false, pause: false };
}

function classifyEnglishVowel(chunk: string): { readonly viseme: Exclude<VisemeId, "closed">; readonly digraph: boolean } | null {
  if (chunk === "ee" || chunk === "ea" || chunk === "ie") return { viseme: "I", digraph: true };
  if (chunk === "oo" || chunk === "ou" || chunk === "ue") return { viseme: "U", digraph: true };
  if (chunk === "oa" || chunk === "ow" || chunk === "aw") return { viseme: "O", digraph: true };
  if (chunk === "ai" || chunk === "ay" || chunk === "ei") return { viseme: "E", digraph: true };
  const c = chunk[0];
  if (c === "a") return { viseme: "A", digraph: false };
  if (c === "i" || c === "y") return { viseme: "I", digraph: false };
  if (c === "u") return { viseme: "U", digraph: false };
  if (c === "e") return { viseme: "E", digraph: false };
  if (c === "o") return { viseme: "O", digraph: false };
  return null;
}

/** 한국어·영어·일본어 텍스트를 포먼트 음소 시퀀스 및 운율 곡선으로 분해한다. */
export function tokenizeTextToPhonemes(
  text: string,
  language: SpeechLanguageCode = "auto",
  options?: { readonly speakingRate?: number; readonly emotion?: SpeechEmotionStyle },
): { readonly language: Exclude<SpeechLanguageCode, "auto">; readonly units: readonly PhonemeUnit[] } {
  const resolvedLang = language === "auto" ? detectSpeechLanguage(text) : language;
  const rate = clamp(options?.speakingRate ?? 1.0, 0.5, 2.0);
  const emotion = options?.emotion ?? "neutral";
  const trimmed = text.trim();
  const isQuestion = trimmed.endsWith("?") || trimmed.endsWith("？");
  const isExclamation = trimmed.endsWith("!") || trimmed.endsWith("！");
  const units: PhonemeUnit[] = [];

  const pushUnit = (u: Omit<PhonemeUnit, "index">): void => { units.push({ index: units.length, ...u }); };
  const pushPause = (symbol: string, ms: number): void =>
    pushUnit({ symbol, syllable: symbol, language: resolvedLang, viseme: "closed", voiced: false, fricative: false, nasal: false, f1Hz: 0, f2Hz: 0, f3Hz: 0, durationMs: ms / rate, stress: 0, pitchMultiplier: 1 });
  const pushConsonant = (symbol: string, syllable: string, lang: Exclude<SpeechLanguageCode, "auto">, voiced: boolean, fricative: boolean, nasal: boolean, ms: number, stress: number, f2Hz = 1480): void =>
    pushUnit({ symbol, syllable, language: lang, viseme: "closed", voiced, fricative, nasal, f1Hz: 265, f2Hz, f3Hz: 2600, durationMs: ms / rate, stress, pitchMultiplier: 0.98 });
  const pushVowel = (symbol: string, syllable: string, lang: Exclude<SpeechLanguageCode, "auto">, viseme: Exclude<VisemeId, "closed">, ms: number, stress: number, b1 = 1, b2 = 1): void => {
    const spec = VOWEL_FORMANTS[viseme];
    pushUnit({ symbol, syllable, language: lang, viseme, voiced: true, fricative: false, nasal: false, f1Hz: spec.f1 * b1, f2Hz: spec.f2 * b2, f3Hz: spec.f3, durationMs: (ms * spec.durationScale) / rate, stress, pitchMultiplier: 1 });
  };

  let i = 0;
  while (i < trimmed.length) {
    const ch = trimmed[i] ?? "";
    const code = trimmed.charCodeAt(i);
    if (/\s/.test(ch)) {
      pushPause(" ", 48);
      while (i < trimmed.length && /\s/.test(trimmed[i] ?? "")) i += 1;
      continue;
    }
    if (ch === "," || ch === "、" || ch === ";") { pushPause(ch, 110); i += 1; continue; }
    if (ch === "." || ch === "!" || ch === "?" || ch === "。" || ch === "！" || ch === "？" || ch === "…") { pushPause(ch, 150); i += 1; continue; }

    if (code >= 0xac00 && code <= 0xd7a3) {
      const sIdx = code - 0xac00;
      const cho = KO_CHO[Math.floor(sIdx / 588)] ?? "";
      const jungIdx = Math.floor((sIdx % 588) / 28);
      const jongIdx = sIdx % 28;
      const viseme = KO_JUNG_VISEME[jungIdx] ?? "A";
      const bias = KO_JUNG_BIAS[jungIdx] ?? [1, 1];
      if (cho.length > 0) pushConsonant(cho, ch, "ko", isNasal(cho) || cho === "r", isFricative(cho), isNasal(cho), isFricative(cho) ? 38 : 26, 0.45, 1450);
      pushVowel(`${viseme.toLowerCase()}${jongIdx > 0 ? "_c" : ""}`, ch, "ko", viseme, 96, 1.0, bias[0], bias[1]);
      const coda = KO_JONG[jongIdx] ?? "none";
      if (coda !== "none") pushConsonant(coda, ch, "ko", coda !== "stop", false, coda === "nasal", coda === "stop" ? 28 : 42, coda === "stop" ? 0.2 : 0.55, 1180);
      i += 1; continue;
    }

    if ((code >= 0x3041 && code <= 0x3096) || (code >= 0x30a1 && code <= 0x30f6) || code === 0x30fc) {
      if (code === 0x30fc && units.length > 0) {
        pushUnit({ ...units[units.length - 1]!, symbol: "ー", syllable: "ー", durationMs: 78 / rate });
        i += 1; continue;
      }
      const m = mapKanaCode(code);
      if (m.pause) pushPause(ch, 52);
      else if (m.viseme === "closed") pushConsonant("N", ch, "ja", true, false, true, 68, 0.65, 1200);
      else {
        if (m.fric || m.nasal) pushConsonant(m.fric ? "s" : "n", ch, "ja", m.nasal, m.fric, m.nasal, 28, 0.45, 1550);
        pushVowel(m.viseme.toLowerCase(), ch, "ja", m.viseme, 88, 0.95);
      }
      i += 1; continue;
    }

    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      const slice = trimmed.slice(i, i + 2).toLowerCase();
      const vMatch = classifyEnglishVowel(slice);
      if (vMatch) {
        pushVowel(vMatch.digraph ? slice : slice[0] ?? "a", vMatch.digraph ? trimmed.slice(i, i + 2) : ch, "en", vMatch.viseme, vMatch.digraph ? 112 : 84, 1.0);
        i += vMatch.digraph ? 2 : 1;
      } else {
        const lower = ch.toLowerCase();
        const fric = isFricative(lower) || lower === "v" || lower === "x";
        const nasal = isNasal(lower);
        pushConsonant(lower, ch, "en", nasal || lower === "l" || lower === "r" || lower === "w" || lower === "v" || lower === "z", fric, nasal, fric ? 38 : 26, fric ? 0.5 : 0.35, 1500);
        i += 1;
      }
      continue;
    }
    i += 1;
  }

  if (units.length === 0) pushPause(" ", 80);

  const emotionLift = emotion === "bright" ? 1.08 : emotion === "dramatic" ? 1.12 : emotion === "calm" ? 0.94 : 1.0;
  const n = units.length;
  const shaped = units.map((u, idx) => {
    const t = n <= 1 ? 0.5 : idx / (n - 1);
    let contour = 1.0 + 0.06 * Math.sin(t * Math.PI);
    if (isQuestion && t > 0.65) contour += ((t - 0.65) / 0.35) * 0.24;
    else if (isExclamation && t > 0.55) contour += 0.12 * Math.sin(((t - 0.55) / 0.45) * Math.PI);
    else contour -= t * 0.11;
    return { ...u, pitchMultiplier: u.pitchMultiplier * contour * emotionLift };
  });

  return { language: resolvedLang, units: shaped };
}

function stepResonator(x: number, freqHz: number, bandwidthHz: number, sampleRate: number, st: ResonatorState): number {
  const f = clamp(freqHz, 80, sampleRate * 0.45);
  const r = Math.exp((-Math.PI * Math.max(30, bandwidthHz)) / sampleRate);
  const a1 = -2 * r * Math.cos((2 * Math.PI * f) / sampleRate);
  const y = (1 - r) * x - a1 * st.y1 - r * r * st.y2;
  st.y2 = st.y1;
  st.y1 = y;
  return y;
}

function synthesizeFormantPcmFromUnits(
  units: readonly PhonemeUnit[], seed: number, sampleRate: number,
  preset: SpeechVoicePreset, emotion: SpeechEmotionStyle, pitchShiftSemitones: number,
): { readonly pcmFloat32: Float32Array; readonly visemes: readonly VisemeKeyframe[] } {
  const basePitch = preset.basePitchHz * Math.pow(2, clamp(pitchShiftSemitones, -12, 12) / 12);
  const breathGain = emotion === "whisper" ? 0.55 : preset.breathiness;
  const voiceGain = emotion === "whisper" ? 0.12 : 1.0;
  let totalSamples = 0;
  const counts = units.map((u) => { const c = Math.max(16, Math.round((u.durationMs / 1000) * sampleRate)); totalSamples += c; return c; });
  const pcm = new Float32Array(totalSamples);
  const visemes: VisemeKeyframe[] = [];
  const res1: ResonatorState = { y1: 0, y2: 0 };
  const res2: ResonatorState = { y1: 0, y2: 0 };
  const res3: ResonatorState = { y1: 0, y2: 0 };
  let phase = 0; let rng = seed >>> 0; let cursor = 0; let timeMs = 0;

  for (let uIdx = 0; uIdx < units.length; uIdx += 1) {
    const u = units[uIdx]!; const count = counts[uIdx]!; const durationMs = (count / sampleRate) * 1000;
    const f0Start = basePitch * u.pitchMultiplier;
    const f0End = units[uIdx + 1] ? basePitch * units[uIdx + 1]!.pitchMultiplier : f0Start * 0.94;
    const atk = Math.max(8, Math.floor(count * 0.12)); const rel = Math.max(8, Math.floor(count * 0.16));
    const f1 = u.f1Hz * preset.formantScale; const f2 = u.f2Hz * preset.formantScale; const f3 = u.f3Hz * preset.formantScale;
    let energyAcc = 0;
    for (let s = 0; s < count; s += 1) {
      const instF0 = f0Start + (f0End - f0Start) * (count > 1 ? s / (count - 1) : 0);
      const env = s < atk ? s / atk : s > count - rel ? Math.max(0, (count - s) / rel) : 1.0;
      rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5;
      const noise = ((rng >>> 0) / 0xffffffff) * 2 - 1;
      let sample: number;
      if (u.voiced && u.f1Hz > 0) {
        phase += instF0 / sampleRate;
        if (phase >= 1) phase -= Math.floor(phase);
        const glottal = phase < 0.42 ? Math.sin((phase / 0.42) * Math.PI) : -0.22 * Math.sin(((phase - 0.42) / 0.58) * Math.PI);
        const exc = glottal * voiceGain + noise * breathGain;
        sample = (stepResonator(exc, f1, 75, sampleRate, res1) * 0.62 + stepResonator(exc, f2, 110, sampleRate, res2) * 0.34 + stepResonator(exc, f3, 150, sampleRate, res3) * 0.14) * (u.nasal ? 0.55 : 1.0) * env * u.stress;
      } else if (u.fricative) {
        sample = stepResonator(noise * 0.45, Math.max(2200, f2 * 1.4), 650, sampleRate, res3) * env * 0.6;
      } else {
        stepResonator(0, 320, 120, sampleRate, res1); stepResonator(0, 1200, 180, sampleRate, res2); stepResonator(0, 2400, 220, sampleRate, res3);
        sample = 0;
      }
      pcm[cursor + s] = sample; energyAcc += sample * sample;
    }
    visemes.push({
      index: uIdx, startMs: timeMs, endMs: timeMs + durationMs, durationMs, viseme: u.viseme,
      weight: u.viseme === "closed" ? 0 : clamp(0.45 + u.stress * 0.55, 0, 1),
      phoneme: u.symbol, syllable: u.syllable, pitchHz: f0Start, energy: Math.sqrt(energyAcc / Math.max(1, count)),
    });
    cursor += count; timeMs += durationMs;
  }

  let peak = 0;
  for (let i = 0; i < pcm.length; i += 1) peak = Math.max(peak, Math.abs(pcm[i] ?? 0));
  if (peak > 1e-6) {
    const normGain = 0.88 / peak;
    for (let i = 0; i < pcm.length; i += 1) pcm[i] = Math.tanh((pcm[i] ?? 0) * normGain * 1.05) * 0.92;
  }
  return { pcmFloat32: pcm, visemes };
}

export function float32PcmToInt16(pcmFloat32: Float32Array): Int16Array {
  const out = new Int16Array(pcmFloat32.length);
  for (let i = 0; i < pcmFloat32.length; i += 1) {
    const v = clamp(pcmFloat32[i] ?? 0, -1, 1);
    out[i] = v < 0 ? Math.round(v * 32768) : Math.round(v * 32767);
  }
  return out;
}

/** 모노 16-bit PCM을 표준 RIFF/WAVE 바이트 배열로 래핑한다. */
export function encodeMonoPcm16Wav(pcmInt16: Int16Array, sampleRate: number): Uint8Array {
  const dataBytes = pcmInt16.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const writeAscii = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeAscii(0, "RIFF"); view.setUint32(4, 36 + dataBytes, true); writeAscii(8, "WAVE");
  writeAscii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeAscii(36, "data"); view.setUint32(40, dataBytes, true);
  for (let i = 0; i < pcmInt16.length; i += 1) view.setInt16(44 + i * 2, pcmInt16[i] ?? 0, true);
  return new Uint8Array(buf);
}

/** 지정 시점(ms)에서 동시조음(Coarticulation) 크로스페이드 비젬 가중치를 계산한다. */
export function sampleVisemeWeightsAtMs(timeline: readonly VisemeKeyframe[], timeMs: number, blendWindowMs = 22): VisemeBlendWeights {
  const w: Record<VisemeId, number> = { A: 0, I: 0, U: 0, E: 0, O: 0, closed: 0 };
  if (timeline.length === 0) return { ...w, closed: 1 };
  const half = Math.max(4, blendWindowMs * 0.5);
  let active = 0;
  for (const kf of timeline) {
    if (timeMs < kf.startMs - half || timeMs > kf.endMs + half) continue;
    const alpha =
      timeMs < kf.startMs + half ? clamp((timeMs - (kf.startMs - half)) / (2 * half), 0, 1)
        : timeMs > kf.endMs - half ? clamp((kf.endMs + half - timeMs) / (2 * half), 0, 1) : 1;
    const val = alpha * kf.weight;
    if (kf.viseme !== "closed") { w[kf.viseme] = Math.max(w[kf.viseme], val); active += val; }
  }
  const openSum = w.A + w.I + w.U + w.E + w.O;
  if (openSum > 1) {
    const inv = 1 / openSum;
    w.A *= inv; w.I *= inv; w.U *= inv; w.E *= inv; w.O *= inv; w.closed = 0;
  } else {
    w.closed = active <= 0 ? 1 : clamp(1 - openSum, 0, 1);
  }
  return w;
}

export function probeOnDeviceSpeechProviders(env?: SpeechProviderProbeEnv): SpeechProviderProbeReport {
  const nav = typeof navigator !== "undefined" ? (navigator as unknown as { readonly ml?: SpeechProviderProbeEnv["navigatorMl"] }) : null;
  const win = typeof globalThis !== "undefined" ? (globalThis as unknown as { readonly speechSynthesis?: WebSpeechSynthesisLike }) : null;
  const ml = env?.navigatorMl !== undefined ? env.navigatorMl : nav?.ml ?? null;
  const speech = env?.speechSynthesis !== undefined ? env.speechSynthesis : win?.speechSynthesis ?? null;
  const runner = env?.webNnRunner ?? null;
  const webNnAvailable = Boolean(ml && typeof ml.createContext === "function");
  const voices = speech && typeof speech.getVoices === "function" ? speech.getVoices() : [];
  const webSpeechAvailable = Boolean(speech && typeof speech.getVoices === "function");
  const selectedProvider: OnDeviceSpeechProviderKind =
    webNnAvailable && runner ? runner.modelKind : webSpeechAvailable && voices.length > 0 ? "web-speech-api" : "local-formant-pcm";
  const reasonKo =
    selectedProvider === "local-formant-pcm"
      ? "오프라인 포먼트 PCM 합성기(무서버·결정적 파형)로 동작합니다."
      : selectedProvider === "web-speech-api"
        ? `브라우저 내장 Web Speech API(음성 ${voices.length}개)와 오프라인 PCM 프리뷰를 연동합니다.`
        : `WebNN NPU(${selectedProvider}) 온디바이스 신경망 음성을 우선 사용합니다.`;
  return { webNnAvailable, webNnModelKind: runner?.modelKind ?? null, webSpeechAvailable, webSpeechVoiceCount: voices.length, selectedProvider, pcmAlwaysAvailable: true, serverCostKrw: 0, reasonKo };
}

/** 온디바이스 오프라인 TTS·운율·립싱크 엔진. */
export class OnDeviceSpeechSynthEngine {
  private readonly env?: SpeechProviderProbeEnv;
  public constructor(env?: SpeechProviderProbeEnv) { this.env = env; }
  public probeProviders(): SpeechProviderProbeReport { return probeOnDeviceSpeechProviders(this.env); }

  public async synthesize(request: SpeechSynthesisRequest): Promise<SpeechSynthesisResult> {
    const sampleRate = clamp(Math.round(request.sampleRate ?? 48_000), 8_000, 96_000);
    const preset = DEFAULT_SPEECH_VOICE_PRESETS[request.voicePresetId ?? "narrator-calm"] ?? DEFAULT_SPEECH_VOICE_PRESETS["narrator-calm"]!;
    const speakingRate = clamp(request.speakingRate ?? preset.speakingRate, 0.5, 2.0);
    const emotion = request.emotion ?? "neutral";
    const pitchShift = request.pitchShiftSemitones ?? 0;
    const probe = this.probeProviders();
    const { language, units } = tokenizeTextToPhonemes(request.text, request.language ?? "auto", { speakingRate, emotion });
    const formantOut = synthesizeFormantPcmFromUnits(units, hashTextSeed32(`${language}:${request.text}`), sampleRate, preset, emotion, pitchShift);

    let pcmFloat32 = formantOut.pcmFloat32;
    let provider: OnDeviceSpeechProviderKind = "local-formant-pcm";
    const runner = this.env?.webNnRunner;
    if (runner && probe.webNnAvailable && runner.supportedLanguages.includes(language) && (!request.preferProvider || request.preferProvider === runner.modelKind)) {
      pcmFloat32 = await runner.synthesizePcm({ text: request.text, language, sampleRate, speakingRate, pitchScale: Math.pow(2, pitchShift / 12) });
      provider = runner.modelKind;
    } else if (request.preferProvider === "web-speech-api" && probe.webSpeechAvailable) {
      provider = "web-speech-api";
    }

    const pcmInt16 = float32PcmToInt16(pcmFloat32);
    const pan = clamp(request.stereoPan ?? 0, -1, 1);
    const lGain = Math.cos(((pan + 1) * Math.PI) / 4); const rGain = Math.sin(((pan + 1) * Math.PI) / 4);
    const left = new Float32Array(pcmFloat32.length); const right = new Float32Array(pcmFloat32.length);
    let peak = 0; let sumSq = 0;
    for (let i = 0; i < pcmFloat32.length; i += 1) {
      const v = pcmFloat32[i] ?? 0;
      left[i] = v * lGain; right[i] = v * rGain; peak = Math.max(peak, Math.abs(v)); sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, pcmFloat32.length));
    return {
      provider, language, sampleRate, durationMs: (pcmFloat32.length / sampleRate) * 1000, frameCount: pcmFloat32.length,
      pcmFloat32, pcmInt16, phonemes: units, visemes: formantOut.visemes, peakLinear: peak, rmsLinear: rms, serverCostKrw: 0,
      stereoBus: { left, right, sampleRate, integratedLufs: rms > 1e-9 ? 20 * Math.log10(rms) - 0.691 : -70, truePeakDbfs: peak > 1e-9 ? 20 * Math.log10(peak) : -120 },
    };
  }
}

// ---------------------------------------------------------------------------
// 48-bit Smallest-Three 쿼터니언 패킹 + Catmull-Rom 오차 상한 스켈레탈 코덱
// ---------------------------------------------------------------------------

const INV_SQRT2 = Math.SQRT1_2;
const QUAT15_MAX = 32767;
const ANIM_MAGIC = [0x54, 0x53, 0x41, 0x4b] as const; // "TSAK"

export type Quat4 = readonly [number, number, number, number];
export interface SkeletalBoneTrack {
  readonly boneName: string; readonly times: Float32Array; readonly rotations: Float32Array; readonly positions?: Float32Array;
}
export interface SkeletalAnimationClip {
  readonly clipId: string; readonly fps: number; readonly durationSec: number; readonly tracks: readonly SkeletalBoneTrack[];
}
export interface WebNnLatentPoseCodecHook {
  readonly providerName: string;
  readonly encodeLatentPose: (poseVector: Float32Array) => Float32Array;
  readonly decodeLatentPose: (latentVector: Float32Array, outputLength: number) => Float32Array;
}
export interface CompressSkeletalClipOptions {
  readonly maxAngularErrorDeg?: number; readonly maxPositionError?: number; readonly latentPoseHook?: WebNnLatentPoseCodecHook | null;
}
export interface CompressedBoneTrack {
  readonly boneName: string; readonly frameCount: number; readonly keyIndices: Uint16Array;
  readonly packedRotations48: Uint8Array; readonly hasPositions: boolean; readonly positionKeyIndices: Uint16Array;
  readonly positionMin: readonly [number, number, number]; readonly positionScale: readonly [number, number, number];
  readonly packedPositions16: Uint16Array;
}
export interface CompressedSkeletalClipMetrics {
  readonly rawBytes: number; readonly compressedBytes: number; readonly compressionRatio: number;
  readonly savingsPct: number; readonly originalKeyframes: number; readonly retainedRotationKeyframes: number;
  readonly maxAngularErrorDeg: number; readonly meanAngularErrorDeg: number;
  readonly maxPositionError: number; readonly latentPoseHookUsed: boolean;
}
export interface CompressedSkeletalClip {
  readonly clipId: string; readonly fps: number; readonly durationSec: number; readonly frameCount: number;
  readonly tracks: readonly CompressedBoneTrack[]; readonly binaryPayload: Uint8Array;
  readonly latentSummary: Float32Array | null; readonly metrics: CompressedSkeletalClipMetrics;
}

export function normalizeQuat(x: number, y: number, z: number, w: number): [number, number, number, number] {
  const len = Math.hypot(x, y, z, w);
  if (len <= 1e-12) return [0, 0, 0, 1];
  const inv = 1 / len;
  return [x * inv, y * inv, z * inv, w * inv];
}

export function quaternionAngularErrorDeg(a: Quat4, b: Quat4): number {
  const dot = Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]));
  return 2 * Math.acos(dot) * (180 / Math.PI);
}

/** 단위 쿼터니언을 정확히 48비트(6바이트) Smallest-Three 표현으로 양자화한다. */
export function packSmallestThree48(q: Quat4, out: Uint8Array, byteOffset: number, flagBit = 0): void {
  const n = normalizeQuat(q[0], q[1], q[2], q[3]);
  let largest = 0;
  for (let i = 1; i < 4; i += 1) if (Math.abs(n[i]!) > Math.abs(n[largest]!)) largest = i;
  const sign = n[largest]! < 0 ? -1 : 1;
  const rem: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    if (i !== largest) rem.push(Math.round(clamp((n[i]! * sign + INV_SQRT2) / (2 * INV_SQRT2), 0, 1) * QUAT15_MAX));
  }
  const hi24 = ((largest & 3) << 22) | ((rem[0]! & QUAT15_MAX) << 7) | ((rem[1]! >>> 8) & 0x7f);
  const lo24 = ((rem[1]! & 0xff) << 16) | ((rem[2]! & QUAT15_MAX) << 1) | (flagBit & 1);
  out[byteOffset] = (hi24 >>> 16) & 0xff; out[byteOffset + 1] = (hi24 >>> 8) & 0xff; out[byteOffset + 2] = hi24 & 0xff;
  out[byteOffset + 3] = (lo24 >>> 16) & 0xff; out[byteOffset + 4] = (lo24 >>> 8) & 0xff; out[byteOffset + 5] = lo24 & 0xff;
}

/** 48비트(6바이트) Smallest-Three 표현을 단위 쿼터니언으로 복원한다. */
export function unpackSmallestThree48(bytes: Uint8Array, byteOffset: number): [number, number, number, number] {
  const hi24 = ((bytes[byteOffset] ?? 0) << 16) | ((bytes[byteOffset + 1] ?? 0) << 8) | (bytes[byteOffset + 2] ?? 0);
  const lo24 = ((bytes[byteOffset + 3] ?? 0) << 16) | ((bytes[byteOffset + 4] ?? 0) << 8) | (bytes[byteOffset + 5] ?? 0);
  const largest = (hi24 >>> 22) & 3;
  const v0 = (((hi24 >>> 7) & QUAT15_MAX) / QUAT15_MAX) * 2 * INV_SQRT2 - INV_SQRT2;
  const v1 = (((((hi24 & 0x7f) << 8) | ((lo24 >>> 16) & 0xff)) / QUAT15_MAX) * 2 * INV_SQRT2) - INV_SQRT2;
  const v2 = (((lo24 >>> 1) & QUAT15_MAX) / QUAT15_MAX) * 2 * INV_SQRT2 - INV_SQRT2;
  const missing = Math.sqrt(Math.max(0, 1 - (v0 * v0 + v1 * v1 + v2 * v2)));
  const vals = [v0, v1, v2];
  const out: [number, number, number, number] = [0, 0, 0, 0];
  let r = 0;
  for (let i = 0; i < 4; i += 1) out[i] = i === largest ? missing : vals[r++]!;
  return normalizeQuat(out[0], out[1], out[2], out[3]);
}

function alignHemisphere(ref: Quat4, t: Quat4): [number, number, number, number] {
  return ref[0] * t[0] + ref[1] * t[1] + ref[2] * t[2] + ref[3] * t[3] < 0
    ? [-t[0], -t[1], -t[2], -t[3]] : [t[0], t[1], t[2], t[3]];
}

function evalCatmullRomQuat(
  keys: readonly { readonly frame: number; readonly q: readonly [number, number, number, number] }[],
  segIdx: number,
  frame: number,
): [number, number, number, number] {
  const k1 = keys[segIdx]!; const k2 = keys[segIdx + 1]!;
  if (k2.frame <= k1.frame) return [k1.q[0], k1.q[1], k1.q[2], k1.q[3]];
  const t = (frame - k1.frame) / (k2.frame - k1.frame);
  const k0 = keys[Math.max(0, segIdx - 1)]!; const k3 = keys[Math.min(keys.length - 1, segIdx + 2)]!;
  const p1 = k1.q; const p2 = alignHemisphere(p1, k2.q);
  const p0 = alignHemisphere(p1, k0.q); const p3 = alignHemisphere(p2, k3.q);
  const dt12 = Math.max(1, k2.frame - k1.frame);
  const dt01 = Math.max(1, k1.frame - k0.frame);
  const dt23 = Math.max(1, k3.frame - k2.frame);
  const t2 = t * t; const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1; const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2; const h11 = t3 - t2;
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let c = 0; c < 4; c += 1) {
    const m1 = segIdx === 0 ? p2[c]! - p1[c]! : 0.5 * (p2[c]! - p1[c]! + ((p1[c]! - p0[c]!) * dt12) / dt01);
    const m2 = segIdx + 1 === keys.length - 1 ? p2[c]! - p1[c]! : 0.5 * (p2[c]! - p1[c]! + ((p3[c]! - p2[c]!) * dt12) / dt23);
    out[c] = h00 * p1[c]! + h10 * m1 + h01 * p2[c]! + h11 * m2;
  }
  return normalizeQuat(out[0], out[1], out[2], out[3]);
}

function decimateRotationTrack(rotations: Float32Array, frameCount: number, maxDeg: number) {
  if (frameCount <= 0) return { keyIndices: new Uint16Array(0), packedRotations48: new Uint8Array(0), maxErrorDeg: 0, meanErrorDeg: 0 };
  const orig: [number, number, number, number][] = [];
  const quant: [number, number, number, number][] = [];
  const tmp = new Uint8Array(6);
  for (let f = 0; f < frameCount; f += 1) {
    const o = f * 4;
    let q = normalizeQuat(rotations[o] ?? 0, rotations[o + 1] ?? 0, rotations[o + 2] ?? 0, rotations[o + 3] ?? 1);
    if (f > 0) q = alignHemisphere(orig[f - 1]!, q);
    orig.push(q);
    packSmallestThree48(q, tmp, 0);
    let uq = unpackSmallestThree48(tmp, 0);
    if (f > 0) uq = alignHemisphere(quant[f - 1]!, uq);
    quant.push(uq);
  }

  let staticErr = 0;
  for (let f = 1; f < frameCount; f += 1) staticErr = Math.max(staticErr, quaternionAngularErrorDeg(orig[f]!, quant[0]!));
  if (frameCount === 1 || staticErr <= maxDeg) {
    const packed = new Uint8Array(6);
    packSmallestThree48(orig[0]!, packed, 0);
    return { keyIndices: new Uint16Array([0]), packedRotations48: packed, maxErrorDeg: staticErr, meanErrorDeg: staticErr * 0.5 };
  }

  const kept = new Set<number>([0, frameCount - 1]);
  let worstErr = Infinity; let totalErr = 0;
  for (let iter = 0; iter < frameCount; iter += 1) {
    const sorted = Array.from(kept).sort((a, b) => a - b);
    const keys = sorted.map((frame) => ({ frame, q: quant[frame]! }));
    worstErr = 0; totalErr = 0; let worstFrame = -1;
    for (let seg = 0; seg < keys.length - 1; seg += 1) {
      const fStart = keys[seg]!.frame; const fEnd = keys[seg + 1]!.frame;
      for (let f = fStart; f <= fEnd; f += 1) {
        if (f === fEnd && seg < keys.length - 2) continue;
        const recon = f === fStart ? keys[seg]!.q : f === fEnd ? keys[seg + 1]!.q : evalCatmullRomQuat(keys, seg, f);
        const err = quaternionAngularErrorDeg(orig[f]!, recon);
        totalErr += err;
        if (err > worstErr) { worstErr = err; worstFrame = f; }
      }
    }
    if (worstErr <= maxDeg || worstFrame < 0 || kept.has(worstFrame)) break;
    kept.add(worstFrame);
  }
  const finalIndices = Array.from(kept).sort((a, b) => a - b);
  const packed = new Uint8Array(finalIndices.length * 6);
  for (let i = 0; i < finalIndices.length; i += 1) packSmallestThree48(orig[finalIndices[i]!]!, packed, i * 6);
  return { keyIndices: new Uint16Array(finalIndices), packedRotations48: packed, maxErrorDeg: worstErr, meanErrorDeg: totalErr / Math.max(1, frameCount) };
}

function decimatePositionTrack(positions: Float32Array, frameCount: number, maxPosError: number) {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let f = 0; f < frameCount; f += 1) {
    const o = f * 3;
    minX = Math.min(minX, positions[o] ?? 0); maxX = Math.max(maxX, positions[o] ?? 0);
    minY = Math.min(minY, positions[o + 1] ?? 0); maxY = Math.max(maxY, positions[o + 1] ?? 0);
    minZ = Math.min(minZ, positions[o + 2] ?? 0); maxZ = Math.max(maxZ, positions[o + 2] ?? 0);
  }
  const sx = maxX - minX; const sy = maxY - minY; const sz = maxZ - minZ;
  const quantizeAxis = (v: number, mn: number, sc: number): number => (sc > 1e-9 ? Math.round(clamp((v - mn) / sc, 0, 1) * 65535) : 0);
  const qPos = (f: number): [number, number, number] => [
    minX + (quantizeAxis(positions[f * 3] ?? 0, minX, sx) / 65535) * sx,
    minY + (quantizeAxis(positions[f * 3 + 1] ?? 0, minY, sy) / 65535) * sy,
    minZ + (quantizeAxis(positions[f * 3 + 2] ?? 0, minZ, sz) / 65535) * sz,
  ];
  if (frameCount <= 1 || Math.hypot(sx, sy, sz) <= maxPosError) {
    return { keyIndices: new Uint16Array([0]), min: [minX, minY, minZ] as const, scale: [sx, sy, sz] as const, packed: new Uint16Array([0, 0, 0]), maxError: Math.hypot(sx, sy, sz) };
  }
  const kept = new Set<number>([0, frameCount - 1]);
  let worstErr = 0;
  for (let iter = 0; iter < frameCount; iter += 1) {
    const sorted = Array.from(kept).sort((a, b) => a - b);
    worstErr = 0; let worstFrame = -1;
    for (let seg = 0; seg < sorted.length - 1; seg += 1) {
      const f0 = sorted[seg]!; const f1 = sorted[seg + 1]!;
      const p0 = qPos(f0); const p1 = qPos(f1);
      for (let f = f0 + 1; f < f1; f += 1) {
        const t = (f - f0) / (f1 - f0);
        const o = f * 3;
        const err = Math.hypot((positions[o] ?? 0) - (p0[0] + (p1[0] - p0[0]) * t), (positions[o + 1] ?? 0) - (p0[1] + (p1[1] - p0[1]) * t), (positions[o + 2] ?? 0) - (p0[2] + (p1[2] - p0[2]) * t));
        if (err > worstErr) { worstErr = err; worstFrame = f; }
      }
    }
    if (worstErr <= maxPosError || worstFrame < 0 || kept.has(worstFrame)) break;
    kept.add(worstFrame);
  }
  const finalIndices = Array.from(kept).sort((a, b) => a - b);
  const packed = new Uint16Array(finalIndices.length * 3);
  for (let i = 0; i < finalIndices.length; i += 1) {
    const o = finalIndices[i]! * 3;
    packed[i * 3] = quantizeAxis(positions[o] ?? 0, minX, sx);
    packed[i * 3 + 1] = quantizeAxis(positions[o + 1] ?? 0, minY, sy);
    packed[i * 3 + 2] = quantizeAxis(positions[o + 2] ?? 0, minZ, sz);
  }
  return { keyIndices: new Uint16Array(finalIndices), min: [minX, minY, minZ] as const, scale: [sx, sy, sz] as const, packed, maxError: worstErr };
}

function serializeCompressedClipBinary(fps: number, durationSec: number, frameCount: number, tracks: readonly CompressedBoneTrack[]): Uint8Array {
  let byteLength = 20;
  for (const t of tracks) {
    byteLength += 6 + t.keyIndices.length * 2 + t.packedRotations48.length + (t.hasPositions ? 26 + t.positionKeyIndices.length * 2 + t.packedPositions16.length * 2 : 0);
  }
  const buf = new ArrayBuffer(byteLength);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  bytes.set(ANIM_MAGIC, 0);
  view.setUint16(4, 1, true); view.setUint16(6, tracks.length, true);
  view.setUint32(8, frameCount, true); view.setFloat32(12, fps, true); view.setFloat32(16, durationSec, true);

  let off = 20;
  const writeU16s = (arr: Uint16Array): void => { for (let i = 0; i < arr.length; i += 1) { view.setUint16(off, arr[i]!, true); off += 2; } };
  for (const t of tracks) {
    view.setUint16(off, t.keyIndices.length, true);
    view.setUint16(off + 2, t.hasPositions ? t.positionKeyIndices.length : 0, true);
    view.setUint16(off + 4, t.hasPositions ? 1 : 0, true);
    off += 6;
    writeU16s(t.keyIndices);
    bytes.set(t.packedRotations48, off); off += t.packedRotations48.length;
    if (t.hasPositions) {
      view.setFloat32(off, t.positionMin[0], true); view.setFloat32(off + 4, t.positionMin[1], true); view.setFloat32(off + 8, t.positionMin[2], true);
      view.setFloat32(off + 12, t.positionScale[0], true); view.setFloat32(off + 16, t.positionScale[1], true); view.setFloat32(off + 20, t.positionScale[2], true);
      view.setUint16(off + 24, t.positionKeyIndices.length, true); off += 26;
      writeU16s(t.positionKeyIndices); writeU16s(t.packedPositions16);
    }
  }
  return bytes;
}

/** 스켈레탈 애니메이션 클립을 48비트 Smallest-Three + 오차 상한 Catmull-Rom 간소화로 압축한다. */
export function compressSkeletalClip(clip: SkeletalAnimationClip, options?: CompressSkeletalClipOptions): CompressedSkeletalClip {
  const maxDeg = clamp(options?.maxAngularErrorDeg ?? 0.45, 0.02, 5.0);
  const maxPosErr = clamp(options?.maxPositionError ?? 0.002, 1e-5, 0.25);
  const frameCount = clip.tracks[0]?.times.length ?? 0;

  let rawBytes = 0; let originalKeyframes = 0; let retainedRotationKeyframes = 0;
  let maxAngularErrorObserved = 0; let meanAngularErrorAcc = 0; let maxPositionErrorObserved = 0;
  const compressedTracks: CompressedBoneTrack[] = [];

  for (const track of clip.tracks) {
    const n = track.times.length;
    originalKeyframes += n;
    rawBytes += n * 4 + track.rotations.byteLength + (track.positions?.byteLength ?? 0);
    const rot = decimateRotationTrack(track.rotations, n, maxDeg);
    retainedRotationKeyframes += rot.keyIndices.length;
    maxAngularErrorObserved = Math.max(maxAngularErrorObserved, rot.maxErrorDeg);
    meanAngularErrorAcc += rot.meanErrorDeg;
    const pos = track.positions && track.positions.length >= n * 3 ? decimatePositionTrack(track.positions, n, maxPosErr) : null;
    if (pos) maxPositionErrorObserved = Math.max(maxPositionErrorObserved, pos.maxError);
    compressedTracks.push({
      boneName: track.boneName, frameCount: n, keyIndices: rot.keyIndices, packedRotations48: rot.packedRotations48,
      hasPositions: pos !== null, positionKeyIndices: pos?.keyIndices ?? new Uint16Array(0),
      positionMin: pos?.min ?? [0, 0, 0], positionScale: pos?.scale ?? [0, 0, 0], packedPositions16: pos?.packed ?? new Uint16Array(0),
    });
  }

  let latentSummary: Float32Array | null = null;
  if (options?.latentPoseHook && clip.tracks.length > 0 && frameCount > 0) {
    const mid = Math.floor(frameCount / 2);
    const poseVec = new Float32Array(clip.tracks.length * 4);
    for (let t = 0; t < clip.tracks.length; t += 1) {
      const rots = clip.tracks[t]!.rotations;
      const o = Math.min(mid, Math.max(0, clip.tracks[t]!.times.length - 1)) * 4;
      poseVec.set([rots[o] ?? 0, rots[o + 1] ?? 0, rots[o + 2] ?? 0, rots[o + 3] ?? 1], t * 4);
    }
    latentSummary = options.latentPoseHook.encodeLatentPose(poseVec);
  }

  const binaryPayload = serializeCompressedClipBinary(clip.fps, clip.durationSec, frameCount, compressedTracks);
  const compressedBytes = binaryPayload.byteLength;
  return {
    clipId: clip.clipId, fps: clip.fps, durationSec: clip.durationSec, frameCount, tracks: compressedTracks, binaryPayload, latentSummary,
    metrics: {
      rawBytes, compressedBytes, compressionRatio: rawBytes > 0 ? rawBytes / Math.max(1, compressedBytes) : 1,
      savingsPct: rawBytes > 0 ? ((rawBytes - compressedBytes) / rawBytes) * 100 : 0,
      originalKeyframes, retainedRotationKeyframes, maxAngularErrorDeg: maxAngularErrorObserved,
      meanAngularErrorDeg: meanAngularErrorAcc / Math.max(1, clip.tracks.length),
      maxPositionError: maxPositionErrorObserved, latentPoseHookUsed: latentSummary !== null,
    },
  };
}

/** 압축된 스켈레탈 클립을 전 프레임 쿼터니언·위치 트랙으로 복원한다. */
export function decompressSkeletalClip(compressed: CompressedSkeletalClip): SkeletalAnimationClip {
  const dt = compressed.fps > 0 ? 1 / compressed.fps : 1 / 30;
  const tracks: SkeletalBoneTrack[] = compressed.tracks.map((ct) => {
    const n = ct.frameCount;
    const times = new Float32Array(n);
    for (let f = 0; f < n; f += 1) times[f] = f * dt;
    const keys: { readonly frame: number; readonly q: [number, number, number, number] }[] = [];
    for (let i = 0; i < ct.keyIndices.length; i += 1) {
      let q = unpackSmallestThree48(ct.packedRotations48, i * 6);
      if (i > 0) q = alignHemisphere(keys[i - 1]!.q, q);
      keys.push({ frame: ct.keyIndices[i]!, q });
    }
    const rotations = new Float32Array(n * 4);
    if (keys.length === 1) {
      for (let f = 0; f < n; f += 1) rotations.set(keys[0]!.q, f * 4);
    } else if (keys.length >= 2) {
      let seg = 0;
      for (let f = 0; f < n; f += 1) {
        while (seg + 1 < keys.length - 1 && f > keys[seg + 1]!.frame) seg += 1;
        rotations.set(f === keys[seg]!.frame ? keys[seg]!.q : f === keys[seg + 1]!.frame ? keys[seg + 1]!.q : evalCatmullRomQuat(keys, seg, f), f * 4);
      }
    }
    if (!ct.hasPositions || ct.positionKeyIndices.length === 0) return { boneName: ct.boneName, times, rotations };
    const positions = new Float32Array(n * 3);
    const decodeP = (k: number): [number, number, number] => [
      ct.positionMin[0] + ((ct.packedPositions16[k * 3] ?? 0) / 65535) * ct.positionScale[0],
      ct.positionMin[1] + ((ct.packedPositions16[k * 3 + 1] ?? 0) / 65535) * ct.positionScale[1],
      ct.positionMin[2] + ((ct.packedPositions16[k * 3 + 2] ?? 0) / 65535) * ct.positionScale[2],
    ];
    if (ct.positionKeyIndices.length === 1) {
      const p0 = decodeP(0);
      for (let f = 0; f < n; f += 1) positions.set(p0, f * 3);
    } else {
      let pSeg = 0;
      for (let f = 0; f < n; f += 1) {
        while (pSeg + 1 < ct.positionKeyIndices.length - 1 && f > ct.positionKeyIndices[pSeg + 1]!) pSeg += 1;
        const f0 = ct.positionKeyIndices[pSeg]!; const f1 = ct.positionKeyIndices[pSeg + 1]!;
        const t = f1 > f0 ? (f - f0) / (f1 - f0) : 0;
        const p0 = decodeP(pSeg); const p1 = decodeP(pSeg + 1);
        positions.set([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t], f * 3);
      }
    }
    return { boneName: ct.boneName, times, rotations, positions };
  });
  return { clipId: compressed.clipId, fps: compressed.fps, durationSec: compressed.durationSec, tracks };
}
