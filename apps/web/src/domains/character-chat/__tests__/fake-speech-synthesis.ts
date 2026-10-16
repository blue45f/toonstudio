/**
 * 캐릭터 챗 낭독 테스트용 가짜 브라우저 음성 — 실제 `speechSynthesis` 대신 주입한다.
 *
 * 컨트롤러·훅 단위 시험은 `createFakeSpeech().scope`를 그대로 넘기고, 화면(스레드·관리 폼)
 * 시험은 `installFakeSpeechOnWindow`로 window에 심는다. 네트워크·오디오 장치·실제 합성은 쓰지 않는다.
 */

import { vi } from "vitest";

import type { CharacterChatSpeechScope } from "../character-chat-speech";

export class FakeUtterance {
  lang = "";
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;
  onboundary: ((event: SpeechSynthesisEvent) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
  constructor(readonly text: string) {}
}

export function fakeVoice(init: {
  readonly name: string;
  readonly lang?: string;
  readonly voiceURI?: string;
  readonly localService?: boolean;
  readonly default?: boolean;
}): SpeechSynthesisVoice {
  return {
    name: init.name,
    lang: init.lang ?? "ko-KR",
    voiceURI: init.voiceURI ?? init.name,
    localService: init.localService ?? true,
    default: init.default ?? false,
  };
}

export interface FakeSpeech {
  readonly scope: CharacterChatSpeechScope;
  readonly synthesis: {
    readonly speak: ReturnType<typeof vi.fn>;
    readonly cancel: ReturnType<typeof vi.fn>;
    readonly pause: ReturnType<typeof vi.fn>;
    readonly resume: ReturnType<typeof vi.fn>;
    readonly getVoices: ReturnType<typeof vi.fn>;
    readonly addEventListener: ReturnType<typeof vi.fn>;
    readonly removeEventListener: ReturnType<typeof vi.fn>;
  };
  /** `speak`에 넘어온 발화를 순서대로 모은다. */
  readonly spoken: FakeUtterance[];
  /** 음성 목록을 바꾸고 `voiceschanged`를 낸다. */
  setVoices(voices: readonly SpeechSynthesisVoice[]): void;
  /** 가장 최근 발화를 정상 종료시킨다(`onend`). */
  endLast(): void;
  /** 가장 최근 발화를 오류로 끝낸다(`onerror`). */
  errorLast(code?: string): void;
  /** 다음 `speak` 호출이 던지게 한다(브라우저가 시작 도중 실패하는 경우). */
  failNextSpeak(): void;
  /** 등록된 `voiceschanged` 리스너 수. */
  voiceListenerCount(): number;
}

export function createFakeSpeech(options: { readonly voices?: readonly SpeechSynthesisVoice[] } = {}): FakeSpeech {
  const spoken: FakeUtterance[] = [];
  const listeners = new Set<() => void>();
  let voices: readonly SpeechSynthesisVoice[] = options.voices ?? [];
  let throwOnNextSpeak = false;

  const synthesis = {
    speak: vi.fn((utterance: FakeUtterance) => {
      if (throwOnNextSpeak) {
        throwOnNextSpeak = false;
        throw new Error("synthesis-failed");
      }
      spoken.push(utterance);
    }),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: vi.fn(() => voices),
    addEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === "voiceschanged") listeners.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      if (type === "voiceschanged") listeners.delete(listener);
    }),
  };

  const scope: CharacterChatSpeechScope = {
    speechSynthesis: synthesis as unknown as SpeechSynthesis,
    SpeechSynthesisUtterance: FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
    // 진행률 추정 틱이 계속 예약되지 않도록 콜백을 부르지 않는 가짜를 쓴다.
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
    performance: { now: () => 0 },
  };

  return {
    scope,
    synthesis,
    spoken,
    setVoices(next) {
      voices = next;
      listeners.forEach((listener) => listener());
    },
    endLast() {
      spoken[spoken.length - 1]?.onend?.();
    },
    errorLast(code = "synthesis-failed") {
      const event = { error: code } as SpeechSynthesisErrorEvent;
      spoken[spoken.length - 1]?.onerror?.(event);
    },
    failNextSpeak() {
      throwOnNextSpeak = true;
    },
    voiceListenerCount: () => listeners.size,
  };
}

/** window에 가짜 음성을 심고, 원래 상태로 되돌리는 함수를 돌려준다. */
export function installFakeSpeechOnWindow(fake: FakeSpeech): () => void {
  const keys = ["speechSynthesis", "SpeechSynthesisUtterance"] as const;
  const previous = keys.map((key) => Object.getOwnPropertyDescriptor(window, key));
  Object.defineProperty(window, "speechSynthesis", { value: fake.scope.speechSynthesis, configurable: true, writable: true });
  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    value: fake.scope.SpeechSynthesisUtterance,
    configurable: true,
    writable: true,
  });
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  const caf = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  return () => {
    raf.mockRestore();
    caf.mockRestore();
    keys.forEach((key, index) => {
      const descriptor = previous[index];
      if (descriptor) Object.defineProperty(window, key, descriptor);
      else Reflect.deleteProperty(window, key);
    });
  };
}
