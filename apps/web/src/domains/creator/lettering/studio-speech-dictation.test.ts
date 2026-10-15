import { describe, it, expect, vi } from "vitest";

import {
  createDictationSession,
  detectSpeechRecognitionCtor,
  dictationReducer,
  extractDictationTranscripts,
  insertDictationText,
  mapDictationError,
  DICTATION_INITIAL_SNAPSHOT,
  DICTATION_UNSUPPORTED_SNAPSHOT,
  type DictationResultEventLike,
  type SpeechRecognitionLike,
} from "./studio-speech-dictation";

describe("detectSpeechRecognitionCtor", () => {
  it("표준 생성자를 우선하고 webkit 접두로 폴백한다", () => {
    class Standard {}
    class Webkit {}
    expect(detectSpeechRecognitionCtor({ SpeechRecognition: Standard as never })).toBe(Standard);
    expect(detectSpeechRecognitionCtor({ webkitSpeechRecognition: Webkit as never })).toBe(Webkit);
    expect(
      detectSpeechRecognitionCtor({ SpeechRecognition: Standard as never, webkitSpeechRecognition: Webkit as never })
    ).toBe(Standard);
    expect(detectSpeechRecognitionCtor({})).toBeNull();
    expect(detectSpeechRecognitionCtor(undefined)).toBeNull();
    expect(detectSpeechRecognitionCtor(null)).toBeNull();
  });
});

describe("dictationReducer — 상태기계", () => {
  it("idle → requesting → listening → stopping → done(확정 전사 있을 때)", () => {
    let s = dictationReducer(DICTATION_INITIAL_SNAPSHOT, { type: "start-requested" });
    expect(s.status).toBe("requesting");
    s = dictationReducer(s, { type: "started" });
    expect(s.status).toBe("listening");
    s = dictationReducer(s, { type: "result", finalText: "안녕", interimText: "" });
    expect(s.finalText).toBe("안녕");
    s = dictationReducer(s, { type: "stop-requested" });
    expect(s.status).toBe("stopping");
    s = dictationReducer(s, { type: "ended" });
    expect(s.status).toBe("done");
  });

  it("확정 전사 없이 끝나면 idle로 돌아간다", () => {
    let s = dictationReducer(DICTATION_INITIAL_SNAPSHOT, { type: "start-requested" });
    s = dictationReducer(s, { type: "started" });
    s = dictationReducer(s, { type: "ended" });
    expect(s.status).toBe("idle");
  });

  it("listening 중 start-requested는 무시한다(이중 시작 방지)", () => {
    let s = dictationReducer(DICTATION_INITIAL_SNAPSHOT, { type: "start-requested" });
    s = dictationReducer(s, { type: "started" });
    const again = dictationReducer(s, { type: "start-requested" });
    expect(again).toBe(s);
  });

  it("error에서 다시 시작할 수 있고, unsupported는 어떤 전이도 받지 않는다", () => {
    const failed = dictationReducer(DICTATION_INITIAL_SNAPSHOT, {
      type: "failed",
      error: mapDictationError("network"),
    });
    // idle에서 온 failed는 상태기계상 error로 간다(세션 시작 직후 오류 포함)
    expect(failed.status).toBe("error");
    expect(dictationReducer(failed, { type: "start-requested" }).status).toBe("requesting");
    expect(dictationReducer(DICTATION_UNSUPPORTED_SNAPSHOT, { type: "start-requested" })).toBe(
      DICTATION_UNSUPPORTED_SNAPSHOT
    );
    expect(dictationReducer(DICTATION_UNSUPPORTED_SNAPSHOT, { type: "reset" })).toBe(DICTATION_UNSUPPORTED_SNAPSHOT);
  });
});

describe("mapDictationError — 한국어 안내와 재시도 가능성", () => {
  it("권한 거부·무음·네트워크는 재시도 가능, 언어 미지원은 불가", () => {
    expect(mapDictationError("not-allowed").recoverable).toBe(true);
    expect(mapDictationError("not-allowed").message).toContain("마이크 권한");
    expect(mapDictationError("no-speech").recoverable).toBe(true);
    expect(mapDictationError("language-not-supported").recoverable).toBe(false);
    expect(mapDictationError("알 수 없는 코드").message).toContain("다시 눌러");
  });
});

describe("insertDictationText — 커서 삽입과 띄어쓰기", () => {
  it("빈 본문 끝 삽입은 공백을 붙이지 않는다", () => {
    expect(insertDictationText("", 0, 0, "안녕하세요")).toEqual({ value: "안녕하세요", caret: 5 });
  });

  it("문장 뒤에 이어 말하면 경계 공백 하나를 넣는다", () => {
    const r = insertDictationText("안녕", 2, 2, "반가워");
    expect(r.value).toBe("안녕 반가워");
    expect(r.caret).toBe(6);
  });

  it("문장부호로 시작하는 전사는 공백을 넣지 않는다", () => {
    expect(insertDictationText("정말", 2, 2, "!").value).toBe("정말!");
  });

  it("선택 범위를 전사로 교체한다", () => {
    const r = insertDictationText("나는 학생이다", 3, 5, "개발자");
    expect(r.value).toBe("나는 개발자이다");
  });

  it("빈 전사는 본문을 바꾸지 않는다", () => {
    expect(insertDictationText("안녕", 2, 2, "   ")).toEqual({ value: "안녕", caret: 2 });
  });
});

function resultEvent(rows: Array<{ isFinal: boolean; transcript: string }>, resultIndex = 0): DictationResultEventLike {
  const results = rows.map((row) => ({
    isFinal: row.isFinal,
    length: 1,
    item: (i: number) => (i === 0 ? { transcript: row.transcript, confidence: 0.9 } : null),
    0: { transcript: row.transcript, confidence: 0.9 },
  }));
  return {
    resultIndex,
    results: {
      length: results.length,
      item: (i: number) => results[i] ?? null,
      ...Object.fromEntries(results.map((r, i) => [i, r])),
    },
  };
}

describe("extractDictationTranscripts", () => {
  it("final은 누적에 붙이고 interim은 분리한다", () => {
    const e = resultEvent([
      { isFinal: true, transcript: " 첫 문장 " },
      { isFinal: false, transcript: "두 번째" },
    ]);
    expect(extractDictationTranscripts(e, "")).toEqual({ finalText: "첫 문장", interimText: "두 번째" });
    const e2 = resultEvent([{ isFinal: true, transcript: "둘째 문장" }]);
    expect(extractDictationTranscripts(e2, "첫 문장").finalText).toBe("첫 문장 둘째 문장");
  });
});

class FakeRecognition implements SpeechRecognitionLike {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onstart: (() => void) | null = null;
  onresult: ((event: DictationResultEventLike) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  startCalls = 0;
  start(): void {
    this.startCalls += 1;
    this.onstart?.();
  }
  stop(): void {
    this.onend?.();
  }
  abort(): void {
    this.onend?.();
  }
}

/**
 * 세션이 `new`로 만든 가짜 인식 객체를 꺼내 검증할 수 있게 생성 순서대로 기록하는 생성자.
 * 생성자 안에서 `this`를 지역 변수에 담지 않고(no-this-alias) 배열에 등록한다.
 */
function createRecordingCtor(): { Ctor: new () => FakeRecognition; instances: FakeRecognition[] } {
  const instances: FakeRecognition[] = [];
  class Ctor extends FakeRecognition {
    constructor() {
      super();
      instances.push(this);
    }
  }
  return { Ctor, instances };
}

describe("createDictationSession — 가짜 인식 객체 통합", () => {
  it("미지원(생성자 없음)이면 supported=false, 시작해도 아무 일 없다", () => {
    const onSnapshot = vi.fn();
    const session = createDictationSession({ ctor: null, onSnapshot, onFinalText: vi.fn() });
    expect(session.supported).toBe(false);
    session.start();
    expect(session.snapshot().status).toBe("unsupported");
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("ko-KR·연속·interim으로 설정하고 확정 전사만 onFinalText로 흘린다", () => {
    const { Ctor, instances } = createRecordingCtor();
    const finals: string[] = [];
    const session = createDictationSession({
      ctor: Ctor,
      onSnapshot: vi.fn(),
      onFinalText: (t) => finals.push(t),
    });
    session.start();
    const [fake] = instances;
    expect(fake.lang).toBe("ko-KR");
    expect(fake.continuous).toBe(true);
    expect(fake.interimResults).toBe(true);
    expect(session.snapshot().status).toBe("listening");
    fake.onresult?.(resultEvent([{ isFinal: false, transcript: "중간" }]));
    expect(finals).toEqual([]);
    fake.onresult?.(resultEvent([{ isFinal: true, transcript: "확정 대사" }]));
    expect(finals).toEqual(["확정 대사"]);
    session.start(); // listening 중 이중 시작 — 실제 start() 재호출 금지
    expect(fake.startCalls).toBe(1);
    session.stop();
    expect(session.snapshot().status).toBe("done");
    session.dispose();
    expect(fake.onresult).toBeNull();
  });

  it("권한 오류는 error 상태와 한국어 안내로 표면화된다", () => {
    const { Ctor, instances } = createRecordingCtor();
    const session = createDictationSession({ ctor: Ctor, onSnapshot: vi.fn(), onFinalText: vi.fn() });
    session.start();
    const [fake] = instances;
    fake.onerror?.({ error: "not-allowed" });
    expect(session.snapshot().status).toBe("error");
    expect(session.snapshot().error?.message).toContain("마이크 권한");
  });
});
