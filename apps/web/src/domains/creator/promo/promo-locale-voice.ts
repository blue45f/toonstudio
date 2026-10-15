import { speakNaturalBrowserSpeech, type NaturalBrowserSpeechSession, type NaturalSpeechSegment, type NaturalSpeechVoice } from "../../../shared/lib/natural-browser-speech";

/**
 * 로케일별 음성 미리듣기 — 이 기기에 설치된 브라우저 음성이 있을 때만 제공한다.
 * 일괄 오디오 렌더·외부 TTS·클라우드 음성은 쓰지 않는다(소리를 파일로 만들지 않고 들려 주기만 한다).
 */
function languageRoot(value: string): string {
  return value.trim().toLowerCase().split(/[-_]/u, 1)[0] ?? "";
}
function normalizedTag(value: string): string {
  return value.trim().toLowerCase().replace(/_/gu, "-");
}
/** 간체·번체 스크립트 태그는 음성 목록이 보통 지역 태그(zh-CN·zh-TW)로 알리므로 같은 쪽 지역을 함께 본다(앞쪽일수록 우선). */
const SCRIPT_REGIONS: Readonly<Record<string, readonly string[]>> = {
  "zh-hans": ["zh-cn", "zh-sg"],
  "zh-hant": ["zh-tw", "zh-hk", "zh-mo"],
};

function matchScore(voiceLang: string, locale: string): number {
  const voiceTag = normalizedTag(voiceLang);
  const localeTag = normalizedTag(locale);
  if (languageRoot(voiceTag) !== languageRoot(localeTag)) return 0;
  if (voiceTag === localeTag) return 3;
  const regionRank = SCRIPT_REGIONS[localeTag]?.indexOf(voiceTag) ?? -1;
  if (regionRank >= 0) return 3 - regionRank / 10;
  // 지역이 없는 로케일(en)은 어느 지역 음성이든 받지만, 지역이 다른 음성(en-GB ↔ en-US)은 한 단계 낮춘다.
  return localeTag.includes("-") ? 1 : 2;
}

/**
 * 로케일에 맞는 "이 기기에 설치된" 음성만 고른다. 원격(localService가 아닌) 음성은 문구가 브라우저 제공자의
 * 서버로 나갈 수 있으므로 쓰지 않는다. 같은 점수면 기본 음성, 그다음 이름순이라 결과가 안정적이다.
 */
export function pickPromoLocaleVoice<T extends NaturalSpeechVoice>(voices: readonly T[], locale: string): T | null {
  const candidates = voices
    .map((voice, index) => ({ voice, index, score: voice.localService === true ? matchScore(voice.lang, locale) : 0 }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score
      || Number(Boolean(right.voice.default)) - Number(Boolean(left.voice.default))
      || left.voice.name.localeCompare(right.voice.name)
      || left.index - right.index);
  return candidates[0]?.voice ?? null;
}

type SpeechScope = NonNullable<Parameters<typeof speakNaturalBrowserSpeech>[1]>;

/**
 * 번역 자막 한 줄을 들려 준다. 한국어 발음 보정(DEFAULT_KOREAN_PRONUNCIATIONS)이 영어 "AI"를 "에이 아이"로
 * 바꾸지 않도록, 문구를 그대로 읽는 한 구간짜리 계획을 직접 넘긴다.
 */
export function previewPromoLocaleText(
  text: string,
  voice: SpeechSynthesisVoice,
  handlers: { onEnd: () => void; onError: (error: Error) => void },
  scope?: SpeechScope,
): NaturalBrowserSpeechSession | null {
  const spoken = text.replace(/\s+/gu, " ").trim();
  if (!spoken) return null;
  const segment: NaturalSpeechSegment = {
    sourceText: spoken,
    spokenText: spoken,
    sourceStart: 0,
    sourceEnd: spoken.length,
    rate: 1,
    pitch: 1,
    volume: 1,
    pauseAfterMs: 0,
    estimatedSpeechMs: Math.max(360, Math.round(Array.from(spoken).length / 8 * 1000)),
  };
  return speakNaturalBrowserSpeech({ text: spoken, voice, plan: [segment], onEnd: handlers.onEnd, onError: handlers.onError }, scope);
}
