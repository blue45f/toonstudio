/**
 * 캐릭터 챗 낭독의 "듣는 사람" 설정 — 이 기기·브라우저에서만 유효한 개인 설정.
 *
 * 프로필의 낭독 선호(작가가 정하는 캐릭터의 목소리)와 달리, 아래 두 값은 듣는 사람이 정한다.
 *  - `autoRead`: 새 캐릭터 답변이 오면 자동으로 읽을지. 기본 꺼짐. 소리가 갑자기 나는 일을
 *    막고, 스크린 리더와 소리가 겹치는 일을 듣는 사람이 직접 판단하게 한다.
 *  - `allowOnlineVoices`: 브라우저가 "원격 합성"으로 표시한 음성도 후보에 넣을지. 기본 꺼짐.
 *    꺼져 있으면 기기 안에서 합성하는 음성만 쓴다.
 *
 * 값은 localStorage에만 남고 서버로 보내지 않는다. 저장소를 못 쓰는 환경(사생활 보호 창 등)에서는
 * 메모리 값으로 동작하며 새로고침하면 기본값으로 돌아간다.
 */

export interface CharacterChatVoiceSettings {
  readonly autoRead: boolean;
  readonly allowOnlineVoices: boolean;
}

export const CHARACTER_CHAT_VOICE_SETTINGS_KEY = "toonstudio-character-chat-voice-settings-v1";

export const DEFAULT_CHARACTER_CHAT_VOICE_SETTINGS: CharacterChatVoiceSettings = Object.freeze({
  autoRead: false,
  allowOnlineVoices: false,
});

type SettingsStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): SettingsStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // 저장소 접근 자체가 막힌 환경(보안 정책·사생활 보호 모드)
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSettings(raw: string | null): CharacterChatVoiceSettings {
  if (!raw) return DEFAULT_CHARACTER_CHAT_VOICE_SETTINGS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return DEFAULT_CHARACTER_CHAT_VOICE_SETTINGS;
    return {
      // 정확히 true인 값만 켜진 것으로 본다 — 깨진 값이 소리를 켜는 일은 없어야 한다.
      autoRead: parsed.autoRead === true,
      allowOnlineVoices: parsed.allowOnlineVoices === true,
    };
  } catch {
    return DEFAULT_CHARACTER_CHAT_VOICE_SETTINGS;
  }
}

function readStored(): CharacterChatVoiceSettings {
  const storage = browserStorage();
  if (!storage) return DEFAULT_CHARACTER_CHAT_VOICE_SETTINGS;
  try {
    return parseSettings(storage.getItem(CHARACTER_CHAT_VOICE_SETTINGS_KEY));
  } catch {
    return DEFAULT_CHARACTER_CHAT_VOICE_SETTINGS;
  }
}

let current: CharacterChatVoiceSettings | null = null;
/** 마지막 저장이 실패했다(용량 초과·저장 금지). 이때 저장소의 값은 낡았으므로 메모리 값을 기준으로 삼는다. */
let persistFailed = false;
const listeners = new Set<() => void>();

/**
 * 바꾸기 전의 기준값. 저장소를 읽을 수 있고 마지막 저장이 성공했다면 저장소 값이 기준이다(다른 탭이 바꾼 항목을
 * 덮지 않는다). 저장소가 막혔거나 읽지 못하거나 저장된 값이 없거나 마지막 저장이 실패했다면 이번 방문의 메모리 값이
 * 기준이다 — 그렇지 않으면 앞서 켠 항목이 다음 항목을 바꿀 때 조용히 기본값으로 되돌아간다.
 */
function mergeBase(): CharacterChatVoiceSettings {
  const memory = current ?? DEFAULT_CHARACTER_CHAT_VOICE_SETTINGS;
  if (persistFailed) return memory;
  const storage = browserStorage();
  if (!storage) return memory;
  try {
    const raw = storage.getItem(CHARACTER_CHAT_VOICE_SETTINGS_KEY);
    return raw === null ? memory : parseSettings(raw);
  } catch {
    return memory;
  }
}

export function getCharacterChatVoiceSettings(): CharacterChatVoiceSettings {
  if (current === null) current = readStored();
  return current;
}

export function subscribeCharacterChatVoiceSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 일부 값만 바꾼다. 다른 탭에서 바뀐 값을 덮지 않도록 쓰기 직전에 저장소 값을 다시 읽는다(`mergeBase`). */
export function updateCharacterChatVoiceSettings(patch: Partial<CharacterChatVoiceSettings>): void {
  const next: CharacterChatVoiceSettings = { ...mergeBase(), ...patch };
  current = next;
  const storage = browserStorage();
  if (storage) {
    try {
      storage.setItem(CHARACTER_CHAT_VOICE_SETTINGS_KEY, JSON.stringify(next));
      persistFailed = false;
    } catch {
      // 용량 초과·저장 금지: 이번 방문 동안은 메모리 값으로 동작한다(다음 바꾸기도 메모리 값을 기준으로 한다).
      persistFailed = true;
    }
  }
  listeners.forEach((listener) => listener());
}

/** 테스트에서 모듈 상태와 저장소를 처음 상태로 되돌린다. */
export function resetCharacterChatVoiceSettingsForTests(): void {
  current = null;
  persistFailed = false;
  try {
    browserStorage()?.removeItem(CHARACTER_CHAT_VOICE_SETTINGS_KEY);
  } catch {
    // 정리 실패는 무시한다.
  }
  listeners.forEach((listener) => listener());
}
