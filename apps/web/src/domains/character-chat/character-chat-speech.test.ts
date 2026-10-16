/**
 * 캐릭터 챗 낭독 컨트롤러 테스트 — 가짜 SpeechSynthesis를 주입해 재생·정지·전환·오류·정리를 검증한다.
 * 실제 오디오 장치나 브라우저 음성은 쓰지 않는다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeSpeech, fakeVoice } from "./__tests__/fake-speech-synthesis";
import { createCharacterChatSpeechController } from "./character-chat-speech";
import type { CharacterChatVoicePreference } from "./character-chat-types";
import { CHARACTER_CHAT_SPEECH_SEGMENT_CHARS, DEFAULT_CHARACTER_CHAT_VOICE } from "./character-chat-voice";

const LOCAL = fakeVoice({ name: "기기 한국어", localService: true });
const ONLINE = fakeVoice({ name: "Microsoft SunHi Online (Natural) - Korean", localService: false });
const ENGLISH = fakeVoice({ name: "English", lang: "en-US" });

function request(
  overrides: Partial<{ messageId: string; text: string; preference: CharacterChatVoicePreference; allowOnline: boolean }> = {},
) {
  return {
    messageId: "m1",
    text: "…볼일이 뭔데.",
    preference: DEFAULT_CHARACTER_CHAT_VOICE,
    allowOnline: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createCharacterChatSpeechController", () => {
  it("음성 합성이 없는 브라우저에서는 던지지 않고 미지원 사유만 남긴다", () => {
    const controller = createCharacterChatSpeechController({ scope: {} });
    expect(controller.supported).toBe(false);
    expect(controller.speak(request())).toBe(false);
    expect(controller.getSnapshot()).toMatchObject({
      activeMessageId: null,
      lastEvent: { type: "failed", messageId: "m1", reason: "unsupported" },
    });
    expect(() => {
      controller.stop();
      controller.release();
    }).not.toThrow();
  });

  it("메시지를 읽기 시작하면 기기 안 한국어 음성과 저장된 배율로 첫 분절을 말한다", () => {
    const fake = createFakeSpeech({ voices: [ENGLISH, ONLINE, LOCAL] });
    const controller = createCharacterChatSpeechController({ scope: fake.scope });
    const preference: CharacterChatVoicePreference = { voiceURI: null, gender: "neutral", rate: 1.25, pitch: 0.85 };

    expect(controller.speak(request({ preference }))).toBe(true);

    expect(fake.spoken).toHaveLength(1);
    expect(fake.spoken[0]?.voice).toBe(LOCAL);
    expect(fake.spoken[0]?.lang).toBe("ko-KR");
    // 공용 분절 계획이 dialogue 기본 속도(0.97)에 저장 배율을 곱한다.
    expect(fake.spoken[0]?.rate).toBeGreaterThan(1.1);
    expect(fake.spoken[0]?.pitch).toBeLessThan(0.95);
    expect(controller.getSnapshot().activeMessageId).toBe("m1");
    expect(controller.getSnapshot().lastEvent).toMatchObject({ type: "started", messageId: "m1" });
  });

  it("온라인 음성은 허용했을 때만 쓴다", () => {
    const onlineOnly = createFakeSpeech({ voices: [ONLINE, ENGLISH] });
    const blocked = createCharacterChatSpeechController({ scope: onlineOnly.scope });
    expect(blocked.speak(request())).toBe(false);
    expect(blocked.getSnapshot().lastEvent).toMatchObject({ type: "failed", reason: "no-local-korean-voice" });
    expect(onlineOnly.synthesis.speak).not.toHaveBeenCalled();

    const allowed = createCharacterChatSpeechController({ scope: onlineOnly.scope });
    expect(allowed.speak(request({ allowOnline: true }))).toBe(true);
    expect(onlineOnly.spoken[0]?.voice).toBe(ONLINE);
  });

  it("한국어 음성이 없으면 읽지 않고 이유를 알린다", () => {
    const fake = createFakeSpeech({ voices: [ENGLISH] });
    const controller = createCharacterChatSpeechController({ scope: fake.scope });
    expect(controller.speak(request({ allowOnline: true }))).toBe(false);
    expect(controller.getSnapshot().lastEvent).toMatchObject({ type: "failed", reason: "no-korean-voice" });
    expect(fake.synthesis.speak).not.toHaveBeenCalled();
  });

  it("음성 목록이 비어 있으면 브라우저 기본 음성에 한국어만 지정해 맡긴다", () => {
    const fake = createFakeSpeech({ voices: [] });
    const controller = createCharacterChatSpeechController({ scope: fake.scope });
    expect(controller.speak(request())).toBe(true);
    expect(fake.spoken[0]?.voice).toBeNull();
    expect(fake.spoken[0]?.lang).toBe("ko-KR");
  });

  it("읽을 글자가 없으면 합성을 시작하지 않는다", () => {
    const fake = createFakeSpeech({ voices: [LOCAL] });
    const controller = createCharacterChatSpeechController({ scope: fake.scope });
    expect(controller.speak(request({ text: "  😊  " }))).toBe(false);
    expect(controller.getSnapshot().lastEvent).toMatchObject({ type: "failed", reason: "nothing-to-read" });
    expect(fake.synthesis.speak).not.toHaveBeenCalled();
  });

  it("긴 응답은 분절을 한 번에 하나씩 순서대로 말하고 끝나면 완료를 알린다", () => {
    const fake = createFakeSpeech({ voices: [LOCAL] });
    const controller = createCharacterChatSpeechController({ scope: fake.scope });
    const sentence = "달이 두 개 뜨는 밤이면 나는 옛 맹세를 떠올리며 조용히 검을 닦곤 해.";
    const text = Array.from({ length: 6 }, () => sentence).join(" ");

    expect(controller.speak(request({ text }))).toBe(true);
    // 큐에 한꺼번에 쌓지 않는다 — 첫 분절만 브라우저에 맡겨져 있다.
    expect(fake.spoken).toHaveLength(1);

    for (let index = 1; index < 6; index += 1) {
      fake.endLast();
      vi.advanceTimersByTime(1_000);
      expect(fake.spoken).toHaveLength(index + 1);
      expect(controller.getSnapshot().activeMessageId).toBe("m1");
    }
    expect(fake.spoken.every((utterance) => utterance.text.length <= CHARACTER_CHAT_SPEECH_SEGMENT_CHARS)).toBe(true);

    fake.endLast();
    vi.advanceTimersByTime(1_000);
    expect(controller.getSnapshot().activeMessageId).toBeNull();
    expect(controller.getSnapshot().lastEvent).toMatchObject({ type: "finished", messageId: "m1" });
  });

  it("정지하면 브라우저 재생을 취소하고, 늦게 오는 종료 콜백은 완료로 세지 않는다", () => {
    const fake = createFakeSpeech({ voices: [LOCAL] });
    const controller = createCharacterChatSpeechController({ scope: fake.scope });
    controller.speak(request());
    const cancelsBefore = fake.synthesis.cancel.mock.calls.length;

    controller.stop();

    expect(fake.synthesis.cancel.mock.calls.length).toBeGreaterThan(cancelsBefore);
    expect(controller.getSnapshot().activeMessageId).toBeNull();
    expect(controller.getSnapshot().lastEvent).toMatchObject({ type: "stopped", messageId: "m1" });

    fake.endLast();
    vi.advanceTimersByTime(1_000);
    expect(controller.getSnapshot().lastEvent).toMatchObject({ type: "stopped" });
  });

  it("읽는 중이 아닐 때의 정지는 아무 사건도 만들지 않는다", () => {
    const fake = createFakeSpeech({ voices: [LOCAL] });
    const controller = createCharacterChatSpeechController({ scope: fake.scope });
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.stop();
    expect(listener).not.toHaveBeenCalled();
    expect(controller.getSnapshot().lastEvent).toBeNull();
  });

  it("다른 메시지를 읽기 시작하면 먼저 읽던 것을 끊고 늦은 콜백을 무시한다", () => {
    const fake = createFakeSpeech({ voices: [LOCAL] });
    const controller = createCharacterChatSpeechController({ scope: fake.scope });
    controller.speak(request({ messageId: "a", text: "첫 번째 메시지야." }));
    const first = fake.spoken[0];
    controller.speak(request({ messageId: "b", text: "두 번째 메시지야." }));

    expect(controller.getSnapshot().activeMessageId).toBe("b");

    // 끊긴 첫 발화의 종료 콜백이 뒤늦게 와도 b의 상태를 건드리지 않는다.
    first?.onend?.();
    vi.advanceTimersByTime(1_000);
    expect(controller.getSnapshot().activeMessageId).toBe("b");
    expect(controller.getSnapshot().lastEvent).toMatchObject({ type: "started", messageId: "b" });
  });

  it("재생 중 오류가 나면 읽는 상태를 풀고 오류를 알린다", () => {
    const fake = createFakeSpeech({ voices: [LOCAL] });
    const controller = createCharacterChatSpeechController({ scope: fake.scope });
    controller.speak(request());
    fake.errorLast("audio-busy");
    expect(controller.getSnapshot().activeMessageId).toBeNull();
    expect(controller.getSnapshot().lastEvent).toMatchObject({
      type: "failed",
      messageId: "m1",
      reason: "playback-failed",
    });
  });

  it("사용자가 멈추거나 끼어든 취소(canceled)는 오류로 알리지 않는다", () => {
    const fake = createFakeSpeech({ voices: [LOCAL] });
    const controller = createCharacterChatSpeechController({ scope: fake.scope });
    controller.speak(request());
    fake.errorLast("canceled");
    fake.errorLast("interrupted");
    expect(controller.getSnapshot().lastEvent).toMatchObject({ type: "started" });
    expect(controller.getSnapshot().activeMessageId).toBe("m1");
  });

  it("브라우저가 시작 도중 던져도 읽는 중으로 남지 않는다", () => {
    const fake = createFakeSpeech({ voices: [LOCAL] });
    const controller = createCharacterChatSpeechController({ scope: fake.scope });
    fake.failNextSpeak();
    expect(controller.speak(request())).toBe(false);
    expect(controller.getSnapshot().activeMessageId).toBeNull();
    expect(controller.getSnapshot().lastEvent).toMatchObject({ type: "failed", reason: "playback-failed" });

    // 같은 컨트롤러로 다시 시도하면 정상 동작한다.
    expect(controller.speak(request())).toBe(true);
    expect(controller.getSnapshot().activeMessageId).toBe("m1");
  });

  it("release는 사건을 남기지 않고 재생만 끊으며 이후의 콜백을 무시한다", () => {
    const fake = createFakeSpeech({ voices: [LOCAL] });
    const controller = createCharacterChatSpeechController({ scope: fake.scope });
    controller.speak(request());
    controller.release();

    expect(controller.getSnapshot()).toEqual({ activeMessageId: null, lastEvent: null });
    expect(fake.synthesis.cancel).toHaveBeenCalled();
    fake.endLast();
    vi.advanceTimersByTime(1_000);
    expect(controller.getSnapshot()).toEqual({ activeMessageId: null, lastEvent: null });
    // 정리 뒤에도 다시 쓸 수 있다(React StrictMode의 effect 재실행).
    expect(controller.speak(request())).toBe(true);
  });

  it("같은 음성 엔진을 쓰는 다른 컨트롤러가 읽기 시작하면 먼저 읽던 쪽은 사건 없이 조용히 놓는다", () => {
    const fake = createFakeSpeech({ voices: [LOCAL] });
    const first = createCharacterChatSpeechController({ scope: fake.scope });
    const second = createCharacterChatSpeechController({ scope: fake.scope });
    first.speak(request({ messageId: "a", text: "첫 번째 화면의 문장이야." }));
    const firstUtterance = fake.spoken[0];
    expect(first.getSnapshot().activeMessageId).toBe("a");

    second.speak(request({ messageId: "b", text: "두 번째 화면의 문장이야." }));

    // 소리가 끊긴 쪽 화면에 '읽는 중' 표시가 남지 않는다.
    expect(first.getSnapshot()).toEqual({ activeMessageId: null, lastEvent: null });
    expect(second.getSnapshot().activeMessageId).toBe("b");

    // 끊긴 쪽의 늦은 콜백은 아무것도 바꾸지 않는다.
    firstUtterance?.onend?.();
    vi.advanceTimersByTime(1_000);
    expect(first.getSnapshot()).toEqual({ activeMessageId: null, lastEvent: null });
    expect(second.getSnapshot().activeMessageId).toBe("b");
  });

  it("읽기를 마치거나 멈춘 컨트롤러는 자리를 비워, 이후 다른 컨트롤러가 읽어도 그 상태를 지우지 않는다", () => {
    const fake = createFakeSpeech({ voices: [LOCAL] });
    const finished = createCharacterChatSpeechController({ scope: fake.scope });
    const stopped = createCharacterChatSpeechController({ scope: fake.scope });
    const later = createCharacterChatSpeechController({ scope: fake.scope });

    finished.speak(request({ messageId: "f", text: "끝까지 읽는 문장이야." }));
    fake.endLast();
    vi.advanceTimersByTime(1_000);
    stopped.speak(request({ messageId: "s", text: "읽다가 멈추는 문장이야." }));
    stopped.stop();

    later.speak(request({ messageId: "l", text: "나중에 읽는 문장이야." }));

    expect(finished.getSnapshot().lastEvent).toMatchObject({ type: "finished", messageId: "f" });
    expect(stopped.getSnapshot().lastEvent).toMatchObject({ type: "stopped", messageId: "s" });
    expect(later.getSnapshot().activeMessageId).toBe("l");
  });

  it("서로 다른 음성 엔진을 쓰는 컨트롤러끼리는 영향을 주지 않는다", () => {
    const firstFake = createFakeSpeech({ voices: [LOCAL] });
    const secondFake = createFakeSpeech({ voices: [LOCAL] });
    const first = createCharacterChatSpeechController({ scope: firstFake.scope });
    const second = createCharacterChatSpeechController({ scope: secondFake.scope });
    first.speak(request({ messageId: "a" }));
    second.speak(request({ messageId: "b" }));
    expect(first.getSnapshot().activeMessageId).toBe("a");
    expect(second.getSnapshot().activeMessageId).toBe("b");
  });

  it("상태 변화는 구독자에게 알리고, 구독을 풀면 더 알리지 않는다", () => {
    const fake = createFakeSpeech({ voices: [LOCAL] });
    const controller = createCharacterChatSpeechController({ scope: fake.scope });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.speak(request());
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    controller.stop();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("음성 목록 변경 이벤트는 첫 구독에서 걸고 마지막 구독이 풀리면 푼다", () => {
    const fake = createFakeSpeech({ voices: [] });
    const controller = createCharacterChatSpeechController({ scope: fake.scope });
    const listener = vi.fn();
    expect(fake.voiceListenerCount()).toBe(0);

    const unsubscribeA = controller.subscribeVoices(listener);
    const unsubscribeB = controller.subscribeVoices(vi.fn());
    expect(fake.voiceListenerCount()).toBe(1);

    fake.setVoices([LOCAL]);
    expect(controller.getVoices()).toEqual([LOCAL]);
    expect(listener).toHaveBeenCalledTimes(1);

    // 내용이 같은 목록은 같은 배열 참조를 유지하고 알리지 않는다.
    const stable = controller.getVoices();
    fake.setVoices([LOCAL]);
    expect(controller.getVoices()).toBe(stable);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribeA();
    expect(fake.voiceListenerCount()).toBe(1);
    unsubscribeB();
    expect(fake.voiceListenerCount()).toBe(0);
  });
});
