/**
 * 캐릭터 챗 낭독 규칙 테스트 — 선호 값 범위 제한, 기존 프로필 호환, 음성 선택(개인정보 기본값),
 * 긴 응답 분절. 브라우저 API 없이 순수 함수만 검증한다.
 */

import { describe, expect, it } from "vitest";

import type { NaturalSpeechVoice } from "@/shared/lib/natural-browser-speech";

import {
  CHARACTER_CHAT_SPEECH_SEGMENT_CHARS,
  CHARACTER_CHAT_VOICE_PITCH_MAX,
  CHARACTER_CHAT_VOICE_PITCH_MIN,
  CHARACTER_CHAT_VOICE_RATE_MAX,
  CHARACTER_CHAT_VOICE_RATE_MIN,
  CHARACTER_CHAT_VOICE_URI_MAX,
  DEFAULT_CHARACTER_CHAT_VOICE,
  characterChatVoiceForStorage,
  isDefaultCharacterChatVoice,
  normalizeCharacterChatVoicePreference,
  prepareCharacterChatSpeech,
  resolveCharacterChatVoice,
  selectCharacterChatVoice,
} from "./character-chat-voice";

function voice(name: string, options: Partial<NaturalSpeechVoice> = {}): NaturalSpeechVoice {
  return { name, lang: "ko-KR", voiceURI: name, localService: true, ...options };
}

describe("normalizeCharacterChatVoicePreference", () => {
  it("모양이 맞지 않는 입력은 기본값이다", () => {
    for (const input of [undefined, null, "voice", 42, ["a"]]) {
      expect(normalizeCharacterChatVoicePreference(input)).toEqual(DEFAULT_CHARACTER_CHAT_VOICE);
    }
  });

  it("속도와 높낮이를 허용 범위로 자르고 0.05 단위로 반올림한다", () => {
    const low = normalizeCharacterChatVoicePreference({ rate: 0.1, pitch: 0.1 });
    expect(low.rate).toBe(CHARACTER_CHAT_VOICE_RATE_MIN);
    expect(low.pitch).toBe(CHARACTER_CHAT_VOICE_PITCH_MIN);

    const high = normalizeCharacterChatVoicePreference({ rate: 9, pitch: 9 });
    expect(high.rate).toBe(CHARACTER_CHAT_VOICE_RATE_MAX);
    expect(high.pitch).toBe(CHARACTER_CHAT_VOICE_PITCH_MAX);

    const stepped = normalizeCharacterChatVoicePreference({ rate: 1.07, pitch: 0.93 });
    expect(stepped.rate).toBe(1.05);
    expect(stepped.pitch).toBe(0.95);
  });

  it("숫자가 아닌 값은 기본 배율로 되돌린다", () => {
    const result = normalizeCharacterChatVoicePreference({ rate: "빠르게", pitch: Number.NaN });
    expect(result.rate).toBe(1);
    expect(result.pitch).toBe(1);
    expect(normalizeCharacterChatVoicePreference({ rate: Infinity }).rate).toBe(1);
  });

  it("음색 힌트는 정해진 값만 받는다", () => {
    expect(normalizeCharacterChatVoicePreference({ gender: "female" }).gender).toBe("female");
    expect(normalizeCharacterChatVoicePreference({ gender: "male" }).gender).toBe("male");
    expect(normalizeCharacterChatVoicePreference({ gender: "robot" }).gender).toBe("neutral");
  });

  it("voiceURI는 제어 문자(NUL 포함)를 지우고 길이를 제한하며 빈 값은 null이다", () => {
    expect(normalizeCharacterChatVoicePreference({ voiceURI: "  Yuna\u0000\u0007  " }).voiceURI).toBe("Yuna");
    expect(normalizeCharacterChatVoicePreference({ voiceURI: "   " }).voiceURI).toBeNull();
    expect(normalizeCharacterChatVoicePreference({ voiceURI: 7 }).voiceURI).toBeNull();
    expect(
      normalizeCharacterChatVoicePreference({ voiceURI: "가".repeat(CHARACTER_CHAT_VOICE_URI_MAX + 50) }).voiceURI,
    ).toHaveLength(CHARACTER_CHAT_VOICE_URI_MAX);
  });

  it("저장된 값은 다시 정규화해도 변하지 않는다", () => {
    const once = normalizeCharacterChatVoicePreference({
      voiceURI: "Microsoft SunHi Online (Natural) - Korean (Korea)",
      gender: "female",
      rate: 0.9,
      pitch: 1.1,
    });
    expect(normalizeCharacterChatVoicePreference(once)).toEqual(once);
  });
});

describe("기존 프로필 호환", () => {
  it("voice 필드가 없는 기존 프로필은 기본 낭독 선호로 읽는다", () => {
    expect(resolveCharacterChatVoice({})).toEqual(DEFAULT_CHARACTER_CHAT_VOICE);
    expect(resolveCharacterChatVoice({ voice: undefined })).toEqual(DEFAULT_CHARACTER_CHAT_VOICE);
  });

  it("기본값은 저장 값으로 남기지 않아 프로필 모양이 달라지지 않는다", () => {
    expect(isDefaultCharacterChatVoice(DEFAULT_CHARACTER_CHAT_VOICE)).toBe(true);
    expect(characterChatVoiceForStorage(undefined)).toBeUndefined();
    expect(characterChatVoiceForStorage({ rate: 1, pitch: 1, gender: "neutral", voiceURI: null })).toBeUndefined();
  });

  it("기본이 아닌 값은 정규화해서 저장 값으로 남긴다", () => {
    expect(characterChatVoiceForStorage({ rate: 3, gender: "male" })).toEqual({
      voiceURI: null,
      gender: "male",
      rate: CHARACTER_CHAT_VOICE_RATE_MAX,
      pitch: 1,
    });
  });
});

describe("selectCharacterChatVoice", () => {
  const localKorean = voice("기기 한국어", { localService: true });
  const onlineNatural = voice("Microsoft SunHi Online (Natural) - Korean", { localService: false });
  const english = voice("English", { lang: "en-US" });
  const allowLocalOnly = { allowOnline: false } as const;
  const allowOnline = { allowOnline: true } as const;

  it("음성 목록을 아직 읽지 못했으면 브라우저 기본 음성에 맡긴다", () => {
    expect(selectCharacterChatVoice([], DEFAULT_CHARACTER_CHAT_VOICE, allowLocalOnly)).toEqual({ kind: "default" });
  });

  it("기본 정책은 기기 안 음성만 후보로 삼는다 — 더 자연스러운 온라인 음성이 있어도 쓰지 않는다", () => {
    const choice = selectCharacterChatVoice([onlineNatural, localKorean, english], DEFAULT_CHARACTER_CHAT_VOICE, allowLocalOnly);
    expect(choice).toEqual({ kind: "voice", voice: localKorean, online: false });
  });

  it("온라인 음성을 허용하면 순위화 결과 1위를 쓰고 온라인임을 표시한다", () => {
    const choice = selectCharacterChatVoice([localKorean, onlineNatural], DEFAULT_CHARACTER_CHAT_VOICE, allowOnline);
    expect(choice).toEqual({ kind: "voice", voice: onlineNatural, online: true });
  });

  it("작가가 고른 음성이 이 기기에 있으면 순위와 무관하게 그것을 쓴다", () => {
    const other = voice("다른 기기 음성", { localService: true });
    const choice = selectCharacterChatVoice(
      [other, localKorean],
      { ...DEFAULT_CHARACTER_CHAT_VOICE, voiceURI: "기기 한국어" },
      allowLocalOnly,
    );
    expect(choice.kind === "voice" && choice.voice).toBe(localKorean);
  });

  it("voiceURI가 달라도 이름이 같으면 같은 음성으로 본다", () => {
    const renamed = voice("Yuna", { voiceURI: "com.apple.voice.compact.ko-KR.Yuna" });
    const choice = selectCharacterChatVoice(
      [localKorean, renamed],
      { ...DEFAULT_CHARACTER_CHAT_VOICE, voiceURI: "Yuna" },
      allowLocalOnly,
    );
    expect(choice.kind === "voice" && choice.voice).toBe(renamed);
  });

  it("고른 음성이 온라인이고 허용하지 않았다면 기기 안 음성으로 대신 읽는다", () => {
    const choice = selectCharacterChatVoice(
      [localKorean, onlineNatural],
      { ...DEFAULT_CHARACTER_CHAT_VOICE, voiceURI: onlineNatural.voiceURI ?? null },
      allowLocalOnly,
    );
    expect(choice).toEqual({ kind: "voice", voice: localKorean, online: false });
  });

  it("고른 음성이 이 기기에 없으면 음색 힌트로 순위를 매긴 한국어 음성을 쓴다", () => {
    const female = voice("서현 음성", { voiceURI: "seohyeon" });
    const male = voice("인준 음성", { voiceURI: "injoon" });
    const choice = selectCharacterChatVoice(
      [male, female],
      { voiceURI: "없는 음성", gender: "female", rate: 1, pitch: 1 },
      allowLocalOnly,
    );
    expect(choice.kind === "voice" && choice.voice).toBe(female);
  });

  it("한국어 음성이 하나도 없으면 읽지 않고 이유를 돌려준다", () => {
    expect(selectCharacterChatVoice([english], DEFAULT_CHARACTER_CHAT_VOICE, allowOnline)).toEqual({
      kind: "none",
      reason: "no-korean-voice",
    });
  });

  it("온라인 한국어 음성만 있고 허용하지 않았다면 그 사유를 구분해 돌려준다", () => {
    expect(selectCharacterChatVoice([onlineNatural, english], DEFAULT_CHARACTER_CHAT_VOICE, allowLocalOnly)).toEqual({
      kind: "none",
      reason: "no-local-korean-voice",
    });
  });
});

describe("prepareCharacterChatSpeech", () => {
  it("긴 응답을 문장 단위로 나누고 분절 하나가 상한을 넘지 않게 한다", () => {
    const sentence = "달빛이 두 개 뜨는 밤이면 나는 옛 맹세를 떠올리며 조용히 검을 닦곤 해.";
    const reply = Array.from({ length: 12 }, () => sentence).join(" ");
    const plan = prepareCharacterChatSpeech(reply, DEFAULT_CHARACTER_CHAT_VOICE);
    expect(plan.length).toBeGreaterThanOrEqual(12);
    for (const segment of plan) {
      expect(segment.spokenText.length).toBeLessThanOrEqual(CHARACTER_CHAT_SPEECH_SEGMENT_CHARS);
    }
  });

  it("문장부호 없이 이어지는 긴 글도 강제로 끊어 한 번에 맡기지 않는다", () => {
    const run = "가나다라마바사아자차카타파하 ".repeat(30).trim();
    const plan = prepareCharacterChatSpeech(run, DEFAULT_CHARACTER_CHAT_VOICE);
    expect(plan.length).toBeGreaterThan(5);
    expect(plan.every((segment) => segment.spokenText.length <= CHARACTER_CHAT_SPEECH_SEGMENT_CHARS + 6)).toBe(true);
  });

  it("작가가 저장한 속도·높낮이 배율이 분절에 반영된다", () => {
    const base = prepareCharacterChatSpeech("안녕, 오랜만이야.", DEFAULT_CHARACTER_CHAT_VOICE)[0];
    const fast = prepareCharacterChatSpeech("안녕, 오랜만이야.", {
      ...DEFAULT_CHARACTER_CHAT_VOICE,
      rate: CHARACTER_CHAT_VOICE_RATE_MAX,
      pitch: CHARACTER_CHAT_VOICE_PITCH_MIN,
    })[0];
    expect(fast?.rate).toBeGreaterThan(base?.rate ?? 0);
    expect(fast?.pitch).toBeLessThan(base?.pitch ?? 0);
  });

  it("이모지·마크다운·링크는 읽는 글에서 정리하되 화면 원문은 바꾸지 않는다", () => {
    const text = "**잠깐** 이거 봐 😊 https://example.com/a?b=1";
    const plan = prepareCharacterChatSpeech(text, DEFAULT_CHARACTER_CHAT_VOICE);
    const spoken = plan.map((segment) => segment.spokenText).join(" ");
    expect(spoken).not.toContain("*");
    expect(spoken).not.toContain("😊");
    expect(spoken).not.toContain("https://");
    expect(text).toContain("https://example.com");
  });

  it("읽을 글자가 없으면 빈 계획이다", () => {
    expect(prepareCharacterChatSpeech("   ", DEFAULT_CHARACTER_CHAT_VOICE)).toEqual([]);
    expect(prepareCharacterChatSpeech("😊😊", DEFAULT_CHARACTER_CHAT_VOICE)).toEqual([]);
    // 말줄임표만 있는 답(말을 아끼는 캐릭터)도 소리 없는 발화를 만들지 않는다.
    expect(prepareCharacterChatSpeech("…", DEFAULT_CHARACTER_CHAT_VOICE)).toEqual([]);
    expect(prepareCharacterChatSpeech("...", DEFAULT_CHARACTER_CHAT_VOICE)).toEqual([]);
  });

  it("말줄임표로 시작하는 대사는 첫 분절이 말줄임표뿐인 발화가 되지 않는다", () => {
    for (const text of ["…볼일이 뭔데.", "...누구지. 볼일이 있으면 짧게 말해.", "“…누구지.”"]) {
      const plan = prepareCharacterChatSpeech(text, DEFAULT_CHARACTER_CHAT_VOICE);
      expect(plan.length).toBeGreaterThan(0);
      expect(plan.every((segment) => /[\p{L}\p{N}]/u.test(segment.spokenText))).toBe(true);
    }
    expect(prepareCharacterChatSpeech("…볼일이 뭔데.", DEFAULT_CHARACTER_CHAT_VOICE)[0]?.spokenText).toContain("볼일이");
  });
});
