// @vitest-environment jsdom

/**
 * 듣는 사람 낭독 설정 테스트 — 기본 꺼짐, 저장·복원, 깨진 값과 저장소 차단에서의 안전한 동작.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHARACTER_CHAT_VOICE_SETTINGS_KEY,
  DEFAULT_CHARACTER_CHAT_VOICE_SETTINGS,
  getCharacterChatVoiceSettings,
  resetCharacterChatVoiceSettingsForTests,
  subscribeCharacterChatVoiceSettings,
  updateCharacterChatVoiceSettings,
} from "./character-chat-voice-settings";

beforeEach(() => {
  window.localStorage.clear();
  resetCharacterChatVoiceSettingsForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("낭독 설정 저장소", () => {
  it("자동 낭독과 온라인 음성은 기본이 꺼짐이다", () => {
    expect(getCharacterChatVoiceSettings()).toEqual({ autoRead: false, allowOnlineVoices: false });
    expect(DEFAULT_CHARACTER_CHAT_VOICE_SETTINGS.autoRead).toBe(false);
  });

  it("바꾼 값은 저장되고 구독자에게 알린다", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCharacterChatVoiceSettings(listener);

    updateCharacterChatVoiceSettings({ autoRead: true });

    expect(getCharacterChatVoiceSettings()).toEqual({ autoRead: true, allowOnlineVoices: false });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(CHARACTER_CHAT_VOICE_SETTINGS_KEY) ?? "{}")).toEqual({
      autoRead: true,
      allowOnlineVoices: false,
    });

    unsubscribe();
    updateCharacterChatVoiceSettings({ allowOnlineVoices: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("새로 불러와도 저장된 값을 복원한다", () => {
    // beforeEach의 reset으로 모듈 상태가 비어 있으므로, 저장소에 값을 두면 첫 읽기에서 복원된다.
    window.localStorage.setItem(
      CHARACTER_CHAT_VOICE_SETTINGS_KEY,
      JSON.stringify({ autoRead: false, allowOnlineVoices: true }),
    );
    expect(getCharacterChatVoiceSettings()).toEqual({ autoRead: false, allowOnlineVoices: true });
  });

  it("깨진 값이나 true가 아닌 값은 켜진 것으로 보지 않는다", () => {
    window.localStorage.setItem(CHARACTER_CHAT_VOICE_SETTINGS_KEY, "{깨진 json");
    expect(getCharacterChatVoiceSettings()).toEqual({ autoRead: false, allowOnlineVoices: false });

    resetCharacterChatVoiceSettingsForTests();
    window.localStorage.setItem(
      CHARACTER_CHAT_VOICE_SETTINGS_KEY,
      JSON.stringify({ autoRead: "true", allowOnlineVoices: 1 }),
    );
    expect(getCharacterChatVoiceSettings()).toEqual({ autoRead: false, allowOnlineVoices: false });
  });

  it("다른 탭에서 바꾼 값을 덮어쓰지 않고 바꾼 항목만 합친다", () => {
    expect(getCharacterChatVoiceSettings().autoRead).toBe(false);
    // 다른 탭이 저장소에 먼저 써 둔 경우를 흉내 낸다.
    window.localStorage.setItem(
      CHARACTER_CHAT_VOICE_SETTINGS_KEY,
      JSON.stringify({ autoRead: true, allowOnlineVoices: false }),
    );

    updateCharacterChatVoiceSettings({ allowOnlineVoices: true });

    expect(getCharacterChatVoiceSettings()).toEqual({ autoRead: true, allowOnlineVoices: true });
  });

  it("저장소를 쓸 수 없는 환경에서는 던지지 않고 이번 방문 동안 메모리 값으로 동작한다", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    resetCharacterChatVoiceSettingsForTests();

    expect(getCharacterChatVoiceSettings()).toEqual({ autoRead: false, allowOnlineVoices: false });
    expect(() => updateCharacterChatVoiceSettings({ autoRead: true })).not.toThrow();
    expect(getCharacterChatVoiceSettings().autoRead).toBe(true);
  });

  it("저장소를 읽을 수 없어도 앞서 바꾼 항목은 다음 항목을 바꿀 때 유지된다", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    resetCharacterChatVoiceSettingsForTests();

    updateCharacterChatVoiceSettings({ autoRead: true });
    updateCharacterChatVoiceSettings({ allowOnlineVoices: true });

    // 메모리 값이 바꾸기의 기준이다 — 기본값으로 되돌아가 앞서 켠 자동 낭독이 꺼지면 안 된다.
    expect(getCharacterChatVoiceSettings()).toEqual({ autoRead: true, allowOnlineVoices: true });
  });

  it("저장이 실패한 뒤에도(용량 초과) 메모리 값을 기준으로 이어서 바꾸고, 저장이 되살아나면 최신 값을 쓴다", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    updateCharacterChatVoiceSettings({ autoRead: true });
    updateCharacterChatVoiceSettings({ allowOnlineVoices: true });
    expect(getCharacterChatVoiceSettings()).toEqual({ autoRead: true, allowOnlineVoices: true });
    expect(window.localStorage.getItem(CHARACTER_CHAT_VOICE_SETTINGS_KEY)).toBeNull();

    setItem.mockRestore();
    updateCharacterChatVoiceSettings({ autoRead: false });
    expect(getCharacterChatVoiceSettings()).toEqual({ autoRead: false, allowOnlineVoices: true });
    expect(JSON.parse(window.localStorage.getItem(CHARACTER_CHAT_VOICE_SETTINGS_KEY) ?? "{}")).toEqual({
      autoRead: false,
      allowOnlineVoices: true,
    });
  });

  it("저장이 실패했다가 성공한 뒤에는 다시 저장소 값(다른 탭의 변경 포함)을 기준으로 합친다", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    updateCharacterChatVoiceSettings({ autoRead: true });
    setItem.mockRestore();
    updateCharacterChatVoiceSettings({ allowOnlineVoices: true });
    // 이제 저장소가 최신이다. 다른 탭이 자동 낭독을 끄면 그 값을 따른다.
    window.localStorage.setItem(
      CHARACTER_CHAT_VOICE_SETTINGS_KEY,
      JSON.stringify({ autoRead: false, allowOnlineVoices: true }),
    );
    updateCharacterChatVoiceSettings({ allowOnlineVoices: false });
    expect(getCharacterChatVoiceSettings()).toEqual({ autoRead: false, allowOnlineVoices: false });
  });
});
