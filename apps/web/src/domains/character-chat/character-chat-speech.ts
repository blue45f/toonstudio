/**
 * 캐릭터 챗 낭독 컨트롤러 — 브라우저 내장 음성(Web Speech `speechSynthesis`)으로 메시지 한 건을
 * 읽고 멈추는 프레임워크 중립 객체.
 *
 * 설계 약속
 *  - 외부 TTS 서비스를 부르지 않는다. 소리는 브라우저가 낸다(`shared/lib/natural-browser-speech`).
 *  - 음성 파일·녹음·복제 음성을 만들거나 저장하지 않는다. 컨트롤러가 들고 있는 건 재생 중인
 *    메시지 id와 안내용 사건뿐이고, 메시지 본문은 재생 요청 한 번 동안만 쓰인다.
 *  - 한 번에 한 메시지만 읽는다. 새 요청은 읽던 것을 끊고 시작한다.
 *  - 브라우저 기능(`scope`)은 주입할 수 있다. 테스트는 가짜 `SpeechSynthesis`를 넘긴다.
 *  - 어떤 메서드도 던지지 않는다. 실패는 상태의 `failed` 사건으로 알린다.
 */

import {
  isNaturalBrowserSpeechSupported,
  listNaturalBrowserSpeechVoices,
  speakNaturalBrowserSpeech,
  type NaturalBrowserSpeechSession,
  type NaturalSpeechSegment,
} from "@/shared/lib/natural-browser-speech";

import type { CharacterChatVoicePreference } from "./character-chat-types";
import {
  prepareCharacterChatSpeech,
  selectCharacterChatVoice,
  type CharacterChatVoiceChoice,
} from "./character-chat-voice";

/** 브라우저 음성 기능 묶음 — 공용 낭독 함수가 받는 주입 지점과 같은 모양이다. */
export type CharacterChatSpeechScope = NonNullable<Parameters<typeof speakNaturalBrowserSpeech>[1]>;

export type CharacterChatSpeechFailure =
  | "unsupported"
  | "no-korean-voice"
  | "no-local-korean-voice"
  | "nothing-to-read"
  | "playback-failed";

/** 가장 최근에 일어난 일. `seq`는 같은 종류가 연달아 일어나도 안내가 다시 나오게 하는 증가 번호다. */
export type CharacterChatSpeechEvent =
  | { readonly seq: number; readonly type: "started" | "finished" | "stopped"; readonly messageId: string }
  | {
      readonly seq: number;
      readonly type: "failed";
      readonly messageId: string;
      readonly reason: CharacterChatSpeechFailure;
    };

export interface CharacterChatSpeechSnapshot {
  /** 지금 읽고 있는 메시지 id. 읽는 중이 아니면 null. */
  readonly activeMessageId: string | null;
  readonly lastEvent: CharacterChatSpeechEvent | null;
}

export interface CharacterChatSpeakRequest {
  readonly messageId: string;
  readonly text: string;
  readonly preference: CharacterChatVoicePreference;
  /** 원격(온라인) 합성 음성도 후보에 넣을지. 기본 정책은 false다. */
  readonly allowOnline: boolean;
}

export interface CharacterChatSpeechController {
  /** 이 브라우저가 음성 합성을 지원하는지. 컨트롤러를 만들 때 한 번 정한다. */
  readonly supported: boolean;
  getSnapshot(): CharacterChatSpeechSnapshot;
  subscribe(listener: () => void): () => void;
  /** 이 기기가 알려 준 음성 목록. `voiceschanged`가 오기 전까지는 같은 배열을 돌려준다. */
  getVoices(): readonly SpeechSynthesisVoice[];
  subscribeVoices(listener: () => void): () => void;
  /** 읽기 시작에 성공하면 true. 실패하면 false이고 사유는 `lastEvent`에 남는다. */
  speak(request: CharacterChatSpeakRequest): boolean;
  /** 읽던 메시지가 있으면 멈추고 `stopped` 사건을 남긴다. 없으면 아무 일도 없다. */
  stop(): void;
  /** 사건을 남기지 않고 재생만 끊는다 — 화면 이탈·언마운트·캐릭터 전환용. */
  release(): void;
}

const IDLE_SNAPSHOT: CharacterChatSpeechSnapshot = Object.freeze({
  activeMessageId: null,
  lastEvent: null,
});

/**
 * 브라우저의 `speechSynthesis`는 문서 하나에 하나뿐이라 컨트롤러가 둘 이상(프로필 편집기의 미리보기
 * 대화 + 음성 미리 듣기)이어도 동시에 읽을 수 없다. 새로 읽기 시작하는 컨트롤러가 앞서 읽던 컨트롤러를
 * 먼저 놓게 해, 소리가 끊긴 쪽 화면에 '읽는 중' 표시가 남지 않게 한다. 음성 엔진 객체를 키로 쓰므로
 * 서로 다른 가짜 음성을 주입하는 테스트끼리는 영향을 주지 않는다.
 */
const activeSpeakerBySynthesis = new WeakMap<object, { readonly release: () => void }>();

function sameVoices(left: readonly SpeechSynthesisVoice[], right: readonly SpeechSynthesisVoice[]): boolean {
  return (
    left.length === right.length
    && left.every((voice, index) => {
      const other = right[index];
      return (
        other !== undefined
        && voice.voiceURI === other.voiceURI
        && voice.name === other.name
        && voice.lang === other.lang
        && voice.localService === other.localService
      );
    })
  );
}

export function createCharacterChatSpeechController(
  options: { readonly scope?: CharacterChatSpeechScope } = {},
): CharacterChatSpeechController {
  const scope: CharacterChatSpeechScope | undefined =
    options.scope ?? (typeof window === "undefined" ? undefined : window);
  const supported = isNaturalBrowserSpeechSupported(scope);

  let snapshot: CharacterChatSpeechSnapshot = IDLE_SNAPSHOT;
  let session: NaturalBrowserSpeechSession | null = null;
  /** 오래된 재생의 늦은 콜백을 무시하기 위한 세대 번호. 재생을 끊을 때마다 올린다. */
  let generation = 0;
  let eventSeq = 0;
  const listeners = new Set<() => void>();

  let voices: readonly SpeechSynthesisVoice[] = listNaturalBrowserSpeechVoices(scope);
  const voiceListeners = new Set<() => void>();

  const notify = () => listeners.forEach((listener) => listener());

  const publish = (next: CharacterChatSpeechSnapshot) => {
    snapshot = next;
    notify();
  };

  const nextEvent = (
    event:
      | { readonly type: "started" | "finished" | "stopped"; readonly messageId: string }
      | { readonly type: "failed"; readonly messageId: string; readonly reason: CharacterChatSpeechFailure },
  ): CharacterChatSpeechEvent => {
    eventSeq += 1;
    return { ...event, seq: eventSeq };
  };

  const endSession = () => {
    generation += 1;
    const ending = session;
    session = null;
    ending?.cancel();
  };

  /** 재생만 끊고 화면 상태를 처음으로 돌린다 — 사건은 남기지 않는다. 소리 낼 차례를 넘길 때도 이걸 쓴다. */
  const resetToIdle = () => {
    endSession();
    if (snapshot !== IDLE_SNAPSHOT) publish(IDLE_SNAPSHOT);
  };

  /** 음성 엔진별 "지금 읽는 컨트롤러" 자리에 올리는 값. */
  const speakerHandle = { release: resetToIdle };

  /** 이 컨트롤러가 소리 낼 차례를 잡는다 — 같은 음성 엔진에서 먼저 읽던 다른 컨트롤러는 놓게 한다. */
  const claimSpeaker = () => {
    const engine = scope?.speechSynthesis;
    if (!engine) return;
    const previous = activeSpeakerBySynthesis.get(engine);
    if (previous && previous !== speakerHandle) previous.release();
    activeSpeakerBySynthesis.set(engine, speakerHandle);
  };

  const unclaimSpeaker = () => {
    const engine = scope?.speechSynthesis;
    if (engine && activeSpeakerBySynthesis.get(engine) === speakerHandle) activeSpeakerBySynthesis.delete(engine);
  };

  /** 목록이 실제로 달라졌을 때만 캐시를 바꾼다 — 같은 내용이면 같은 배열 참조를 유지해 불필요한 렌더를 막는다. */
  const refreshVoices = () => {
    const fresh = listNaturalBrowserSpeechVoices(scope);
    if (sameVoices(voices, fresh)) return;
    voices = fresh;
    voiceListeners.forEach((listener) => listener());
  };

  const attachVoiceListener = () => {
    try {
      scope?.speechSynthesis?.addEventListener("voiceschanged", refreshVoices);
    } catch {
      // 이벤트를 못 거는 브라우저는 처음 읽은 목록과 읽기 직전 갱신만 쓴다.
    }
  };

  const detachVoiceListener = () => {
    try {
      scope?.speechSynthesis?.removeEventListener("voiceschanged", refreshVoices);
    } catch {
      // 기능이 사라진 환경: 풀 것이 없다.
    }
  };

  const fail = (messageId: string, reason: CharacterChatSpeechFailure): false => {
    unclaimSpeaker();
    publish({ activeMessageId: null, lastEvent: nextEvent({ type: "failed", messageId, reason }) });
    return false;
  };

  return {
    supported,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getVoices: () => voices,
    subscribeVoices(listener) {
      if (voiceListeners.size === 0) {
        attachVoiceListener();
        // 컨트롤러가 만들어진 뒤 구독이 걸리기 전에 목록이 바뀌었을 수 있다(구독은 렌더 뒤 효과에서 걸린다).
        // 아직 구독자가 없으니 알림 없이 캐시만 맞추고, 새 구독자는 다음 스냅샷 읽기에서 바뀐 목록을 본다.
        refreshVoices();
      }
      voiceListeners.add(listener);
      return () => {
        voiceListeners.delete(listener);
        if (voiceListeners.size === 0) detachVoiceListener();
      };
    },
    speak(request) {
      // 같은 메시지를 다시 눌러도, 다른 메시지로 넘어가도 먼저 읽던 것은 끊는다.
      endSession();
      if (!supported) return fail(request.messageId, "unsupported");

      // 읽기 직전에 목록을 한 번 더 읽는다 — 첫 렌더 뒤에 늦게 채워지는 브라우저가 있다.
      refreshVoices();
      let choice: CharacterChatVoiceChoice<SpeechSynthesisVoice>;
      let plan: NaturalSpeechSegment[];
      try {
        choice = selectCharacterChatVoice(voices, request.preference, { allowOnline: request.allowOnline });
        plan = prepareCharacterChatSpeech(request.text, request.preference);
      } catch {
        return fail(request.messageId, "playback-failed");
      }
      if (choice.kind === "none") return fail(request.messageId, choice.reason);
      if (plan.length === 0) return fail(request.messageId, "nothing-to-read");

      // 같은 화면의 다른 컨트롤러가 읽고 있었다면 먼저 놓게 한다(브라우저 음성 엔진은 하나뿐이다).
      claimSpeaker();

      const token = generation;
      let settled = false;
      const settle = (event: Parameters<typeof nextEvent>[0]) => {
        // 이미 끊긴 재생(세대가 바뀜)의 늦은 콜백은 화면 상태를 건드리지 않는다.
        if (token !== generation || settled) return;
        settled = true;
        session = null;
        generation += 1;
        unclaimSpeaker();
        publish({ activeMessageId: null, lastEvent: nextEvent(event) });
      };

      const started = speakNaturalBrowserSpeech(
        {
          text: request.text,
          plan,
          voice: choice.kind === "voice" ? choice.voice : null,
          onEnd: () => settle({ type: "finished", messageId: request.messageId }),
          onError: () => settle({ type: "failed", messageId: request.messageId, reason: "playback-failed" }),
        },
        scope,
      );
      // 시작 도중 동기적으로 실패한 경우(settle이 이미 실패 상태를 남김)는 그대로 둔다.
      if (settled) return false;
      if (!started) return fail(request.messageId, "playback-failed");

      session = started;
      publish({
        activeMessageId: request.messageId,
        lastEvent: nextEvent({ type: "started", messageId: request.messageId }),
      });
      return true;
    },
    stop() {
      const messageId = snapshot.activeMessageId;
      if (messageId === null) return;
      endSession();
      unclaimSpeaker();
      publish({ activeMessageId: null, lastEvent: nextEvent({ type: "stopped", messageId }) });
    },
    release() {
      unclaimSpeaker();
      resetToIdle();
    },
  };
}
