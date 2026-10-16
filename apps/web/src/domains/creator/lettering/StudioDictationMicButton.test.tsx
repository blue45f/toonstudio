// @vitest-environment jsdom

/**
 * 받아쓰기 버튼 화면 테스트 — 툴팁·화면 낭독기 설명, 시작/중지, 확정 전사 삽입, 오류 안내, 미지원 안내.
 * 가짜 SpeechRecognition을 window에 심으므로 마이크나 네트워크를 쓰지 않는다.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StudioDictationMicButton from "./StudioDictationMicButton";
import {
  DICTATION_HINT_IDLE,
  DICTATION_HINT_LISTENING,
  DICTATION_UNSUPPORTED_MESSAGE,
  type DictationResultEventLike,
} from "./studio-speech-dictation";

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onresult: ((event: DictationResultEventLike) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  constructor() {
    FakeRecognition.instances.push(this);
  }
}

function resultEvent(transcript: string, isFinal: boolean): DictationResultEventLike {
  const alternative = { transcript };
  const result = { isFinal, length: 1, item: () => alternative, 0: alternative };
  return { resultIndex: 0, results: { length: 1, item: () => result, 0: result } };
}

function installRecognition(): void {
  Object.defineProperty(window, "SpeechRecognition", { value: FakeRecognition, configurable: true, writable: true });
}

function uninstallRecognition(): void {
  Reflect.deleteProperty(window, "SpeechRecognition");
  Reflect.deleteProperty(window, "webkitSpeechRecognition");
}

function latest(): FakeRecognition {
  const instance = FakeRecognition.instances.at(-1);
  if (!instance) throw new Error("인식 객체가 아직 만들어지지 않았다");
  return instance;
}

function renderButton(value = "") {
  const applyValue = vi.fn();
  const view = render(
    <StudioDictationMicButton
      getTarget={() => ({ value, selectionStart: value.length, selectionEnd: value.length })}
      applyValue={applyValue}
    />,
  );
  return { applyValue, ...view };
}

beforeEach(() => {
  FakeRecognition.instances = [];
});

afterEach(() => {
  cleanup();
  uninstallRecognition();
});

describe("받아쓰기 버튼", () => {
  it("버튼에 툴팁 제목·설명이 있고 같은 설명이 화면 낭독기에도 연결된다", () => {
    installRecognition();
    renderButton();
    const button = screen.getByRole("button", { name: "음성으로 대사 입력" });
    expect(button.getAttribute("data-tooltip")).toBe("음성으로 대사 입력");
    expect(button.getAttribute("data-tooltip-description")).toBe(DICTATION_HINT_IDLE);

    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const hint = document.getElementById(describedBy ?? "");
    expect(hint?.textContent).toBe(DICTATION_HINT_IDLE);
    // 조건과 한계를 숨기지 않는다: 지원 브라우저, 마이크 권한, 결과 확인.
    expect(DICTATION_HINT_IDLE).toContain("Chrome·Edge");
    expect(DICTATION_HINT_IDLE).toContain("마이크 권한");
    expect(DICTATION_HINT_IDLE).toContain("틀릴 수 있으니");
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("누르면 한국어로 듣기를 시작하고, 듣는 동안에는 중지 안내와 설명으로 바뀐다", () => {
    installRecognition();
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "음성으로 대사 입력" }));

    const recognition = latest();
    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(recognition.lang).toBe("ko-KR");
    expect(recognition.interimResults).toBe(true);

    act(() => recognition.onstart?.());
    const stop = screen.getByRole("button", { name: "받아쓰기 중지" });
    expect(stop.getAttribute("aria-pressed")).toBe("true");
    expect(stop.getAttribute("data-tooltip-description")).toBe(DICTATION_HINT_LISTENING);
    expect(document.getElementById(stop.getAttribute("aria-describedby") ?? "")?.textContent).toBe(DICTATION_HINT_LISTENING);

    fireEvent.click(stop);
    expect(recognition.stop).toHaveBeenCalledTimes(1);
  });

  it("중간 전사는 미리보기로만 보이고 확정된 문장만 커서 위치에 넣는다", () => {
    installRecognition();
    const { applyValue } = renderButton("안녕");
    fireEvent.click(screen.getByRole("button", { name: "음성으로 대사 입력" }));
    const recognition = latest();
    act(() => recognition.onstart?.());

    act(() => recognition.onresult?.(resultEvent("반가워", false)));
    expect(screen.getByText("반가워…")).toBeTruthy();
    expect(applyValue).not.toHaveBeenCalled();

    act(() => recognition.onresult?.(resultEvent("반가워요", true)));
    expect(applyValue).toHaveBeenCalledTimes(1);
    // 앞 경계에만 공백 하나를 넣고, 커서는 삽입한 글자 뒤(7자)로 옮긴다.
    expect(applyValue).toHaveBeenCalledWith("안녕 반가워요", "안녕 반가워요".length);
  });

  it("권한 거부 같은 오류는 눈에 보이는 경고와 재시도 안내로 알린다", () => {
    installRecognition();
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "음성으로 대사 입력" }));
    const recognition = latest();
    act(() => recognition.onstart?.());
    act(() => recognition.onerror?.({ error: "not-allowed" }));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("마이크 권한이 필요해요");
    expect(alert.textContent).toContain("다시 눌러 재시도할 수 있어요.");
    // 오류 뒤에는 다시 시작할 수 있다.
    expect(screen.getByRole("button", { name: "음성으로 대사 입력" })).toBeTruthy();
  });

  it("브라우저가 음성 인식을 지원하지 않으면 버튼 대신 이유와 대안을 안내한다", () => {
    renderButton();
    expect(screen.queryByRole("button")).toBeNull();
    const note = screen.getByRole("note");
    expect(note.textContent).toBe(DICTATION_UNSUPPORTED_MESSAGE);
    expect(note.textContent).toContain("Chrome 또는 Edge");
  });

  it("화면에서 사라지면 마이크 듣기를 중단한다", () => {
    installRecognition();
    const { unmount } = renderButton();
    fireEvent.click(screen.getByRole("button", { name: "음성으로 대사 입력" }));
    const recognition = latest();
    act(() => recognition.onstart?.());

    unmount();
    expect(recognition.abort).toHaveBeenCalledTimes(1);
  });
});
