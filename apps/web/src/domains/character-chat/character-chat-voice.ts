/**
 * 캐릭터 챗 음성 낭독 규칙 — 프로필에 저장하는 낭독 선호의 정규화와, 그 선호를 팬 기기의
 * 브라우저 내장 음성으로 바꾸는 선택·분절 규칙(순수 함수, React·저장소·네트워크 없음).
 *
 * 소리를 만드는 일은 하지 않는다. 한국어 음성 순위화와 분절 계획은 프로모 보이스 스튜디오·
 * 운세 낭독이 이미 쓰는 `shared/lib/natural-browser-speech`를 그대로 재사용하고, 이 모듈은
 * 캐릭터 챗에 필요한 세 가지만 더한다.
 *
 *  1. 선호 값의 범위 제한 — 속도·높낮이를 알아듣기 어려운 극단으로 저장하지 못하게 한다.
 *  2. 개인정보 보호 기본값 — 브라우저가 기기 안에서 합성한다고 밝힌 음성만 후보로 삼고,
 *     "원격"으로 표시된 온라인 음성은 사용자가 명시적으로 허용했을 때만 후보에 넣는다
 *     (프로모 디렉터의 `allowOnlineVoices`와 같은 정책). 외부 TTS 서비스는 호출하지 않는다.
 *  3. 긴 응답의 문장 단위 분절 — 한 번에 한 분절씩만 브라우저에 맡긴다.
 */

import {
  buildNaturalSpeechPlan,
  rankNaturalKoreanVoices,
  type NaturalSpeechSegment,
  type NaturalSpeechVoice,
  type NaturalVoiceGender,
} from "@/shared/lib/natural-browser-speech";

import type { CharacterChatProfile, CharacterChatVoicePreference } from "./character-chat-types";

/**
 * 속도·높낮이 배율의 허용 범위. 공용 분절 계획의 자체 한계(속도 0.65~1.55, 높낮이 0.7~1.35)보다
 * 좁게 잡아, 작가가 저장한 값이 팬 기기에서 알아듣기 힘든 소리가 되는 일을 막는다.
 */
export const CHARACTER_CHAT_VOICE_RATE_MIN = 0.8;
export const CHARACTER_CHAT_VOICE_RATE_MAX = 1.25;
export const CHARACTER_CHAT_VOICE_PITCH_MIN = 0.85;
export const CHARACTER_CHAT_VOICE_PITCH_MAX = 1.15;
/** 슬라이더 한 칸이자 저장 값의 반올림 단위. */
export const CHARACTER_CHAT_VOICE_STEP = 0.05;
export const CHARACTER_CHAT_VOICE_URI_MAX = 200;
/**
 * 한 분절의 최대 글자 수. 브라우저 음성은 긴 발화를 중간에 멈추는 경우가 있어 짧게 끊어 맡긴다.
 * 공용 계획 빌더가 30~120자로 보정하고, 프로모 보이스 스튜디오는 54~66자를 쓴다.
 */
export const CHARACTER_CHAT_SPEECH_SEGMENT_CHARS = 60;

export const DEFAULT_CHARACTER_CHAT_VOICE: CharacterChatVoicePreference = Object.freeze({
  voiceURI: null,
  gender: "neutral",
  rate: 1,
  pitch: 1,
});

const VOICE_GENDERS: readonly NaturalVoiceGender[] = ["female", "male", "neutral"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 범위로 자르고 0.05 단위로 반올림한다. 숫자가 아니면 기본값으로 되돌린다. */
function clampToStep(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const clamped = Math.min(max, Math.max(min, numeric));
  const stepped = Math.round(clamped / CHARACTER_CHAT_VOICE_STEP) * CHARACTER_CHAT_VOICE_STEP;
  return Math.min(max, Math.max(min, Math.round(stepped * 100) / 100));
}

function normalizeVoiceUri(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // 제어 문자(NUL 포함)는 JSON 저장·서버 미러에서 문제가 되므로 버린다.
  const cleaned = value.replace(/\p{Cc}/gu, "").trim().slice(0, CHARACTER_CHAT_VOICE_URI_MAX);
  return cleaned ? cleaned : null;
}

/**
 * 저장돼 있던 값·폼 입력·서버에서 온 값 어느 것이든 안전한 낭독 선호로 만든다.
 * 알 수 없는 모양이면 기본값이고, 숫자는 허용 범위로 자른다.
 */
export function normalizeCharacterChatVoicePreference(input: unknown): CharacterChatVoicePreference {
  if (!isRecord(input)) return DEFAULT_CHARACTER_CHAT_VOICE;
  const gender = VOICE_GENDERS.find((candidate) => candidate === input.gender) ?? "neutral";
  return {
    voiceURI: normalizeVoiceUri(input.voiceURI),
    gender,
    rate: clampToStep(input.rate, CHARACTER_CHAT_VOICE_RATE_MIN, CHARACTER_CHAT_VOICE_RATE_MAX, 1),
    pitch: clampToStep(input.pitch, CHARACTER_CHAT_VOICE_PITCH_MIN, CHARACTER_CHAT_VOICE_PITCH_MAX, 1),
  };
}

export function isDefaultCharacterChatVoice(preference: CharacterChatVoicePreference): boolean {
  return (
    preference.voiceURI === null
    && preference.gender === "neutral"
    && preference.rate === 1
    && preference.pitch === 1
  );
}

/** 프로필에서 낭독 선호를 읽는다. `voice`가 없는 기존 프로필은 기본값이다. */
export function resolveCharacterChatVoice(
  profile: Pick<CharacterChatProfile, "voice">,
): CharacterChatVoicePreference {
  return normalizeCharacterChatVoicePreference(profile.voice);
}

/**
 * 저장용 값. 기본값이면 `undefined`를 돌려줘 프로필에 필드를 만들지 않는다 —
 * 낭독을 설정하지 않은 프로필의 JSON 모양이 이 기능이 생기기 전과 같게 유지된다.
 */
export function characterChatVoiceForStorage(input: unknown): CharacterChatVoicePreference | undefined {
  const normalized = normalizeCharacterChatVoicePreference(input);
  return isDefaultCharacterChatVoice(normalized) ? undefined : normalized;
}

export type CharacterChatVoiceChoice<T extends NaturalSpeechVoice> =
  /** 이 기기에서 고른 음성. `online`이면 브라우저가 원격 합성으로 표시한 음성이다. */
  | { readonly kind: "voice"; readonly voice: T; readonly online: boolean }
  /** 음성 목록을 아직 읽지 못했다 — 브라우저 기본 음성에 한국어(ko-KR)만 지정해 맡긴다. */
  | { readonly kind: "default" }
  /** 허용된 범위에 쓸 수 있는 한국어 음성이 없다 — 읽지 않고 이유를 안내한다. */
  | { readonly kind: "none"; readonly reason: "no-korean-voice" | "no-local-korean-voice" };

/**
 * 낭독 선호를 이 기기의 음성 한 개로 바꾼다.
 * 후보는 한국어 음성뿐이며 `allowOnline`이 꺼져 있으면 기기 안 음성(localService)만 남긴다.
 * 선호한 음성이 후보에 있으면 그것을, 없으면 음색 힌트로 순위를 매긴 1위를 쓴다.
 */
export function selectCharacterChatVoice<T extends NaturalSpeechVoice>(
  voices: readonly T[],
  preference: CharacterChatVoicePreference,
  options: { readonly allowOnline: boolean },
): CharacterChatVoiceChoice<T> {
  if (voices.length === 0) return { kind: "default" };
  const ranked = rankNaturalKoreanVoices(voices, {
    gender: preference.gender,
    preferLocal: true,
    localOnly: !options.allowOnline,
    preferredVoiceURI: preference.voiceURI,
  });
  const wanted = preference.voiceURI;
  const exact = wanted
    ? ranked.find((voice) => voice.voiceURI === wanted || voice.name === wanted)
    : undefined;
  const best = exact ?? ranked[0];
  if (best) return { kind: "voice", voice: best, online: best.localService !== true };
  const anyKorean = rankNaturalKoreanVoices(voices).length > 0;
  return { kind: "none", reason: anyKorean ? "no-local-korean-voice" : "no-korean-voice" };
}

/** 글자나 숫자가 하나라도 있어야 소리 나는 분절이다. */
const SPEAKABLE = /[\p{L}\p{N}]/u;

/**
 * 메시지를 문장 단위 분절 계획으로 만든다. 이모지·마크다운·링크 정리와 호흡(휴지)은 공용
 * 계획 빌더가 맡고, 이 모듈은 캐릭터 대화에 맞는 `dialogue` 스타일과 선호 배율만 지정한다.
 * 읽을 내용이 없으면(기호만 있는 메시지 등) 빈 배열이다.
 *
 * "…볼일이 뭔데."처럼 말줄임표로 시작하는 대사는 공용 분절기가 "…"만 담은 분절을 따로 만든다.
 * 글자·숫자가 없는 분절은 소리 없는 발화와 어색한 정지만 만들므로 계획에서 뺀다.
 */
export function prepareCharacterChatSpeech(
  text: string,
  preference: CharacterChatVoicePreference,
): NaturalSpeechSegment[] {
  return buildNaturalSpeechPlan(text, {
    style: "dialogue",
    rate: preference.rate,
    pitch: preference.pitch,
    volume: 1,
    maxSegmentChars: CHARACTER_CHAT_SPEECH_SEGMENT_CHARS,
  }).filter((segment) => SPEAKABLE.test(segment.spokenText));
}
