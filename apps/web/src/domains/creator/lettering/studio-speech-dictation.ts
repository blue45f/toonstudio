/**
 * 말풍선 대사 음성 받아쓰기 — 브라우저 내장 Web Speech API(SpeechRecognition) 세션 코어.
 *
 * 서버·외부 서비스 없이 브라우저 내장 음성인식만 쓴다(비용 0). 이 모듈은 순수 상태기계 +
 * 최소 구조 인터페이스로 인식 객체를 감싸므로, 실제 `window.SpeechRecognition` 없이도
 * 가짜 인식 객체로 전 구간을 테스트할 수 있다.
 *
 * 상태기계:
 *   idle ──start──▶ requesting ──onstart──▶ listening ──stop──▶ stopping ──onend──▶ done
 *     ▲                  │                        │  ▲                    │
 *     │                  └──onerror──▶ error ◀────┘  └──(연속 모드) final 누적──┘
 *     └────────────── reset / onend(결과 없음) ──────────────┘
 *   unsupported: 생성 시점에 인식 생성자가 없으면 시작부터 고정(폴백 안내 전용 상태).
 *
 * 삽입 규칙: 확정(final) 전사만 삽입하고, 중간(interim) 전사는 미리보기로만 노출한다 —
 * interim을 본문에 넣었다 지우면 한글 IME 조합과 같은 유실·깜빡임 문제가 생긴다.
 */

/** 인식 결과 대안 하나 — 브라우저 SpeechRecognitionAlternative의 최소 구조. */
export interface DictationAlternativeLike {
  transcript: string;
  confidence?: number;
}

export interface DictationResultLike {
  isFinal: boolean;
  length: number;
  item(index: number): DictationAlternativeLike | null;
  [index: number]: DictationAlternativeLike | undefined;
}

export interface DictationResultEventLike {
  resultIndex: number;
  results: { length: number; item(index: number): DictationResultLike | null; [index: number]: DictationResultLike | undefined };
}

export interface DictationErrorEventLike {
  error: string;
  message?: string;
}

/** window.SpeechRecognition / webkitSpeechRecognition 인스턴스의 최소 구조. */
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: DictationResultEventLike) => void) | null;
  onerror: ((event: DictationErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionCtorLike = new () => SpeechRecognitionLike;

/** 생성자를 찾을 전역 객체 모양 (window 대용 — 테스트에서 가짜를 주입한다). */
export interface SpeechRecognitionHostLike {
  SpeechRecognition?: SpeechRecognitionCtorLike;
  webkitSpeechRecognition?: SpeechRecognitionCtorLike;
}

/** 표준 → webkit 접두 순으로 인식 생성자를 찾는다. 없으면 null(미지원). */
export function detectSpeechRecognitionCtor(
  host: SpeechRecognitionHostLike | undefined | null
): SpeechRecognitionCtorLike | null {
  if (!host) return null;
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

export type DictationStatus =
  | "unsupported"
  | "idle"
  | "requesting"
  | "listening"
  | "stopping"
  | "done"
  | "error";

export interface DictationErrorInfo {
  /** 브라우저가 준 원본 오류 코드 (예: "not-allowed"). */
  code: string;
  /** 사용자에게 보여줄 한국어 안내. */
  message: string;
  /** 다시 눌러 재시도하면 풀릴 수 있는 오류인지. */
  recoverable: boolean;
}

export interface DictationSnapshot {
  status: DictationStatus;
  /** 지금까지 확정된 전사 누적(삽입 완료분). */
  finalText: string;
  /** 현재 발화의 중간 전사(미리보기 전용, 삽입 금지). */
  interimText: string;
  error: DictationErrorInfo | null;
}

export type DictationEvent =
  | { type: "start-requested" }
  | { type: "started" }
  | { type: "result"; finalText: string; interimText: string }
  | { type: "stop-requested" }
  | { type: "ended" }
  | { type: "failed"; error: DictationErrorInfo }
  | { type: "reset" };

export const DICTATION_INITIAL_SNAPSHOT: DictationSnapshot = {
  status: "idle",
  finalText: "",
  interimText: "",
  error: null,
};

export const DICTATION_UNSUPPORTED_SNAPSHOT: DictationSnapshot = {
  status: "unsupported",
  finalText: "",
  interimText: "",
  error: null,
};

/** 미지원 브라우저 폴백 안내 — 입력 자체는 막지 않고 대안 동선을 알려준다. */
export const DICTATION_UNSUPPORTED_MESSAGE =
  "이 브라우저는 음성 받아쓰기를 지원하지 않아요. Chrome 또는 Edge에서 열면 말로 대사를 입력할 수 있고, 지금은 키보드로 입력하거나 다른 기기에서 받아쓴 텍스트를 붙여넣어 주세요.";

const DICTATION_ERROR_MESSAGES: Record<string, { message: string; recoverable: boolean }> = {
  "not-allowed": {
    message: "마이크 권한이 필요해요. 주소창의 마이크 아이콘에서 허용한 뒤 다시 눌러 주세요.",
    recoverable: true,
  },
  "service-not-allowed": {
    message: "이 브라우저에서 음성 인식 서비스를 쓸 수 없어요. Chrome 또는 Edge에서 다시 시도해 주세요.",
    recoverable: false,
  },
  "audio-capture": {
    message: "마이크를 찾지 못했어요. 마이크 연결을 확인한 뒤 다시 눌러 주세요.",
    recoverable: true,
  },
  "no-speech": {
    message: "음성이 들리지 않았어요. 마이크 가까이에서 다시 말해 주세요.",
    recoverable: true,
  },
  network: {
    message: "음성 인식 서버에 닿지 못했어요. 연결을 확인한 뒤 다시 눌러 주세요.",
    recoverable: true,
  },
  "language-not-supported": {
    message: "이 브라우저는 한국어 음성 인식을 지원하지 않아요.",
    recoverable: false,
  },
  aborted: { message: "받아쓰기가 중단됐어요.", recoverable: true },
};

export function mapDictationError(code: string): DictationErrorInfo {
  const known = DICTATION_ERROR_MESSAGES[code];
  if (known) return { code, message: known.message, recoverable: known.recoverable };
  return { code, message: "받아쓰기 중 문제가 생겼어요. 다시 눌러 주세요.", recoverable: true };
}

/**
 * 순수 상태기계. 잘못된 전이(예: listening 중 start-requested)는 스냅샷을 그대로 반환해
 * 이중 시작을 막는다 — 실제 SpeechRecognition.start()를 듣는 중에 또 부르면
 * InvalidStateError가 던져지기 때문이다.
 */
export function dictationReducer(snapshot: DictationSnapshot, event: DictationEvent): DictationSnapshot {
  switch (event.type) {
    case "start-requested":
      if (snapshot.status === "idle" || snapshot.status === "done" || snapshot.status === "error") {
        return { status: "requesting", finalText: "", interimText: "", error: null };
      }
      return snapshot;
    case "started":
      if (snapshot.status === "requesting") return { ...snapshot, status: "listening" };
      return snapshot;
    case "result":
      if (snapshot.status === "listening" || snapshot.status === "stopping") {
        return { ...snapshot, finalText: event.finalText, interimText: event.interimText };
      }
      return snapshot;
    case "stop-requested":
      if (snapshot.status === "listening" || snapshot.status === "requesting") {
        return { ...snapshot, status: "stopping", interimText: "" };
      }
      return snapshot;
    case "ended":
      if (snapshot.status === "stopping" || snapshot.status === "listening" || snapshot.status === "requesting") {
        // 확정 전사가 있으면 done(삽입 완료 신호), 없으면 조용히 idle로.
        return snapshot.finalText.trim()
          ? { ...snapshot, status: "done", interimText: "" }
          : { ...DICTATION_INITIAL_SNAPSHOT };
      }
      return snapshot;
    case "failed":
      if (snapshot.status === "unsupported") return snapshot;
      return { ...snapshot, status: "error", interimText: "", error: event.error };
    case "reset":
      if (snapshot.status === "unsupported") return snapshot;
      return { ...DICTATION_INITIAL_SNAPSHOT };
    default:
      return snapshot;
  }
}

const LEADING_PUNCTUATION = /^[,.!?…·:;%)\]}」』"']/;

/**
 * 확정 전사를 커서 위치에 삽입한 새 본문과 새 커서 위치를 돌려준다.
 * 한국어 띄어쓰기 규칙: 양쪽이 모두 공백이 아니고 전사가 문장부호로 시작하지 않을 때만
 * 경계에 공백 하나를 넣는다(말풍선 대사는 문장 단위 발화가 이어 붙는 경우가 대부분).
 */
export function insertDictationText(
  current: string,
  selectionStart: number,
  selectionEnd: number,
  transcript: string
): { value: string; caret: number } {
  const start = Math.max(0, Math.min(selectionStart, current.length));
  const end = Math.max(start, Math.min(selectionEnd, current.length));
  const spoken = transcript.trim().replace(/\s+/g, " ");
  if (!spoken) return { value: current, caret: start };
  const before = current.slice(0, start);
  const after = current.slice(end);
  // 뒤쪽 경계에는 공백을 넣지 않는다 — 선택 교체나 단어 중간 삽입에서 조사를 띄어
  // 단어를 깨는 사고가 나기 때문이다(한국어는 후행 경계 판정이 신뢰 불가). 이어 말하기의
  // 지배적 동선인 "앞 경계"만 자동 처리한다.
  const needsLeadingSpace =
    before.length > 0 && !/\s$/.test(before) && !LEADING_PUNCTUATION.test(spoken);
  const inserted = `${needsLeadingSpace ? " " : ""}${spoken}`;
  return { value: before + inserted + after, caret: before.length + inserted.length };
}

/** result 이벤트에서 (확정 누적, 중간) 전사를 뽑는다. resultIndex 이전 결과는 이미 확정분이라 다시 세지 않는다. */
export function extractDictationTranscripts(
  event: DictationResultEventLike,
  previousFinalText: string
): { finalText: string; interimText: string } {
  let finalText = previousFinalText;
  let interimText = "";
  for (let i = event.resultIndex; i < event.results.length; i += 1) {
    const result = event.results.item(i);
    const alternative = result?.item(0) ?? result?.[0];
    if (!result || !alternative) continue;
    if (result.isFinal) {
      const piece = alternative.transcript.trim();
      if (piece) finalText = finalText ? `${finalText} ${piece}` : piece;
    } else {
      interimText += alternative.transcript;
    }
  }
  return { finalText, interimText: interimText.trim() };
}

export interface DictationSessionOptions {
  /** 인식 생성자. 생략하면 전역 window에서 탐지한다. */
  ctor?: SpeechRecognitionCtorLike | null;
  /** BCP-47 언어 태그. 기본 "ko-KR". */
  lang?: string;
  onSnapshot: (snapshot: DictationSnapshot) => void;
  /** 확정 전사가 누적될 때마다(삽입 지점) 호출. interim은 오지 않는다. */
  onFinalText: (finalText: string) => void;
}

export interface DictationSession {
  readonly supported: boolean;
  snapshot(): DictationSnapshot;
  start(): void;
  stop(): void;
  dispose(): void;
}

/**
 * 인식 객체 1개를 감싼 세션 컨트롤러. start는 상태기계가 허용할 때만 실제 start()를 부르고,
 * dispose는 콜백을 끊고 abort한다(언마운트 시 마이크가 계속 듣는 사고 방지).
 */
export function createDictationSession(options: DictationSessionOptions): DictationSession {
  const ctor =
    options.ctor !== undefined
      ? options.ctor
      : typeof window !== "undefined"
        ? detectSpeechRecognitionCtor(window as unknown as SpeechRecognitionHostLike)
        : null;
  let snapshot: DictationSnapshot = ctor ? { ...DICTATION_INITIAL_SNAPSHOT } : { ...DICTATION_UNSUPPORTED_SNAPSHOT };
  let recognition: SpeechRecognitionLike | null = null;
  let lastEmittedFinal = "";
  let disposed = false;

  function dispatch(event: DictationEvent): void {
    const next = dictationReducer(snapshot, event);
    if (next === snapshot) return;
    snapshot = next;
    if (!disposed) options.onSnapshot(snapshot);
    if (snapshot.finalText && snapshot.finalText !== lastEmittedFinal) {
      lastEmittedFinal = snapshot.finalText;
      if (!disposed) options.onFinalText(snapshot.finalText);
    }
  }

  function ensureRecognition(): SpeechRecognitionLike | null {
    if (!ctor) return null;
    if (recognition) return recognition;
    const instance = new ctor();
    instance.lang = options.lang ?? "ko-KR";
    instance.continuous = true;
    instance.interimResults = true;
    instance.maxAlternatives = 1;
    instance.onstart = () => dispatch({ type: "started" });
    instance.onresult = (event) => {
      const { finalText, interimText } = extractDictationTranscripts(event, snapshot.finalText);
      dispatch({ type: "result", finalText, interimText });
    };
    instance.onerror = (event) => {
      // stop() 직후의 aborted는 오류로 보여주지 않는다(정상 종료 경로).
      if (event.error === "aborted" && snapshot.status === "stopping") return;
      dispatch({ type: "failed", error: mapDictationError(event.error) });
    };
    instance.onend = () => dispatch({ type: "ended" });
    recognition = instance;
    return instance;
  }

  return {
    supported: ctor !== null,
    snapshot: () => snapshot,
    start() {
      if (disposed || !ctor) return;
      const before = snapshot;
      dispatch({ type: "start-requested" });
      if (snapshot === before) return; // 상태기계가 막은 이중 시작
      lastEmittedFinal = "";
      const instance = ensureRecognition();
      if (!instance) return;
      try {
        instance.start();
      } catch {
        dispatch({ type: "failed", error: mapDictationError("aborted") });
      }
    },
    stop() {
      if (disposed) return;
      dispatch({ type: "stop-requested" });
      recognition?.stop();
    },
    dispose() {
      disposed = true;
      if (recognition) {
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        try {
          recognition.abort();
        } catch {
          // 이미 끝난 세션 abort 실패는 무시한다.
        }
        recognition = null;
      }
    },
  };
}
