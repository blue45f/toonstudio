/**
 * 캐릭터 챗 낭독 훅 — 컨트롤러·듣는 사람 설정·캐릭터의 낭독 선호를 한 화면 단위로 묶는다.
 *
 * 수명 주기 약속(청취 중 이탈 시 정지):
 *  - 컴포넌트가 사라지거나 다른 캐릭터로 바뀌면 읽던 소리를 끊는다.
 *  - 탭을 닫거나 페이지를 떠나는 `pagehide`에도 끊는다(뒤로 가기 캐시에 소리가 남지 않게).
 *  - 비동기 답변이 화면을 떠난 뒤 도착해도 호출부가 `speak`를 부르지 않도록 `isActiveFor()`를 준다.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
  createCharacterChatSpeechController,
  type CharacterChatSpeechEvent,
  type CharacterChatSpeechScope,
} from "./character-chat-speech";
import type { CharacterChatProfile, CharacterChatVoicePreference } from "./character-chat-types";
import {
  normalizeCharacterChatVoicePreference,
  selectCharacterChatVoice,
  type CharacterChatVoiceChoice,
} from "./character-chat-voice";
import {
  getCharacterChatVoiceSettings,
  subscribeCharacterChatVoiceSettings,
  updateCharacterChatVoiceSettings,
  type CharacterChatVoiceSettings,
} from "./character-chat-voice-settings";

export interface CharacterChatSpeech {
  /** 이 브라우저가 음성 합성을 지원하는지. 아니면 듣기 버튼을 숨기고 안내만 보인다. */
  readonly supported: boolean;
  readonly voices: readonly SpeechSynthesisVoice[];
  /** 지금 읽고 있는 메시지 id. */
  readonly speakingMessageId: string | null;
  readonly lastEvent: CharacterChatSpeechEvent | null;
  /** 캐릭터 프로필에 저장된 낭독 선호(없으면 기본값). */
  readonly preference: CharacterChatVoicePreference;
  /** 듣는 사람의 이 기기 설정. */
  readonly settings: CharacterChatVoiceSettings;
  /** 설정과 선호를 이 기기의 음성 목록에 대 본 결과 — 지금 어떤 음성으로 읽게 되는지. */
  readonly choice: CharacterChatVoiceChoice<SpeechSynthesisVoice>;
  speak(message: { readonly id: string; readonly text: string }): boolean;
  stop(): void;
  setAutoRead(next: boolean): void;
  setAllowOnlineVoices(next: boolean): void;
  /**
   * 이 캐릭터의 화면이 아직 살아 있는지. 답변이 비동기로 도착했을 때 그사이 화면을 떠났거나
   * 다른 캐릭터로 바뀌었다면 자동 낭독을 하지 않도록 가르는 용도다.
   */
  isActiveFor(profileId: string): boolean;
}

export function useCharacterChatSpeech(
  profile: Pick<CharacterChatProfile, "id" | "voice">,
  options: { readonly scope?: CharacterChatSpeechScope } = {},
): CharacterChatSpeech {
  const [controller] = useState(() =>
    createCharacterChatSpeechController(options.scope ? { scope: options.scope } : {}),
  );

  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const voices = useSyncExternalStore(controller.subscribeVoices, controller.getVoices, controller.getVoices);
  const settings = useSyncExternalStore(
    subscribeCharacterChatVoiceSettings,
    getCharacterChatVoiceSettings,
    getCharacterChatVoiceSettings,
  );

  const profileId = profile.id;
  const profileVoice = profile.voice;
  const preference = useMemo(() => normalizeCharacterChatVoicePreference(profileVoice), [profileVoice]);
  const choice = useMemo(
    () => selectCharacterChatVoice(voices, preference, { allowOnline: settings.allowOnlineVoices }),
    [voices, preference, settings.allowOnlineVoices],
  );

  const activeProfileIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeProfileIdRef.current = profileId;
    const release = () => controller.release();
    window.addEventListener("pagehide", release);
    return () => {
      activeProfileIdRef.current = null;
      window.removeEventListener("pagehide", release);
      // 언마운트와 캐릭터 전환(profileId 변경) 모두 여기서 소리를 끊는다.
      controller.release();
    };
  }, [controller, profileId]);

  const allowOnline = settings.allowOnlineVoices;
  const speak = useCallback(
    (message: { readonly id: string; readonly text: string }) =>
      controller.speak({ messageId: message.id, text: message.text, preference, allowOnline }),
    [controller, preference, allowOnline],
  );
  const stop = useCallback(() => controller.stop(), [controller]);
  const setAutoRead = useCallback((next: boolean) => updateCharacterChatVoiceSettings({ autoRead: next }), []);
  const setAllowOnlineVoices = useCallback(
    (next: boolean) => updateCharacterChatVoiceSettings({ allowOnlineVoices: next }),
    [],
  );
  const isActiveFor = useCallback((id: string) => activeProfileIdRef.current === id, []);

  return {
    supported: controller.supported,
    voices,
    speakingMessageId: snapshot.activeMessageId,
    lastEvent: snapshot.lastEvent,
    preference,
    settings,
    choice,
    speak,
    stop,
    setAutoRead,
    setAllowOnlineVoices,
    isActiveFor,
  };
}
