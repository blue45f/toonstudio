// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getActiveServiceStatusSlot, registerModalStatusSlot } from "@/shared/lib/modal-status-slot";
import { StudioDrawingClarityTaskDialog } from "./StudioDrawingClarityTaskDialog";

// close fires as a queued task in browsers. Keep it separate from close() so
// replayed effect cleanup cannot accidentally pass with a synchronous-only mock.
let pendingClose: HTMLDialogElement[] = [];
let restoreNative: () => void;
const nativeEvents: string[] = [];
beforeEach(() => {
  pendingClose = []; nativeEvents.length = 0;
  const proto = HTMLDialogElement.prototype;
  const show = Object.getOwnPropertyDescriptor(proto, "showModal"), close = Object.getOwnPropertyDescriptor(proto, "close");
  Object.defineProperty(proto, "showModal", { configurable: true, value: function (this: HTMLDialogElement) {
    this.open = true; nativeEvents.push("show");
  } });
  Object.defineProperty(proto, "close", { configurable: true, value: function (this: HTMLDialogElement) {
    if (!this.open) return; this.open = false; nativeEvents.push("close"); pendingClose.push(this);
  } });
  restoreNative = () => {
    if (show) Object.defineProperty(proto, "showModal", show); else Reflect.deleteProperty(proto, "showModal");
    if (close) Object.defineProperty(proto, "close", close); else Reflect.deleteProperty(proto, "close");
  };
});
afterEach(() => { cleanup(); restoreNative(); pendingClose = []; });
function flushCloseEvents(): void { pendingClose.splice(0).forEach(node => node.dispatchEvent(new Event("close"))); }

function renderTask({ strict = false, onClose = vi.fn(), run = vi.fn() } = {}) {
  function Harness() {
    const source = useRef<HTMLButtonElement>(null), next = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(true), [changes, setChanges] = useState(0);
    return <><button type="button" ref={source} onClick={() => setOpen(true)}>원래 도구</button>
      <button type="button" ref={next}>다음 작업</button>
      {open ? <StudioDrawingClarityTaskDialog id="test-task" title="보기 설정" kind="view" returnFocus={() => source.current}
        onClose={() => { onClose(); setOpen(false); }}>
        {(finish) => <><button type="button" onClick={() => finish(() => { run(); next.current?.focus(); })}>실제 작업 열기</button>
          <button type="button" onClick={() => setChanges(value => value + 1)}>설정 바꾸기 {changes}</button></>}
      </StudioDrawingClarityTaskDialog> : null}</>;
  }
  const view = render(strict ? <StrictMode><Harness /></StrictMode> : <Harness />);
  return { ...view, onClose, run };
}

describe("드로잉 목적 화면 native lifecycle", () => {
  it("진입 초점과 shortcut 경계를 제공하고 내용 갱신으로 화면을 재열거나 초점을 빼앗지 않는다", () => {
    const { onClose } = renderTask();
    const dialog = screen.getByRole("dialog", { name: "보기 설정" }) as HTMLDialogElement;
    expect(dialog.open).toBe(true); expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("data-studio-shortcut-boundary")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "그리기로 돌아가기" }));
    const change = screen.getByRole("button", { name: "설정 바꾸기 0" }); change.focus(); fireEvent.click(change);
    expect(screen.getByRole("button", { name: "설정 바꾸기 1" })).toBe(change);
    expect(document.activeElement).toBe(change); expect(nativeEvents).toEqual(["show"]);
    expect(onClose).not.toHaveBeenCalled();
  });
  it("첫 Escape는 문서 단축키로 전파되지 않고 취소·초점 복귀를 한 번만 수행한다", () => {
    const { onClose, run } = renderTask();
    const listener = vi.fn(); document.addEventListener("keydown", listener);
    try {
      const action = screen.getByRole("button", { name: "실제 작업 열기" }); action.focus();
      const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      fireEvent(action, escape);
      expect(escape.defaultPrevented).toBe(true); expect(listener).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1); expect(run).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "원래 도구" }));
      act(flushCloseEvents); expect(onClose).toHaveBeenCalledTimes(1);
      expect(getActiveServiceStatusSlot()).toBeNull();
    } finally { document.removeEventListener("keydown", listener); }
  });
  it("native cancel을 소비하고 실제 다음 작업은 실행하지 않는다", () => {
    const { onClose, run } = renderTask();
    const dialog = screen.getByRole("dialog", { name: "보기 설정" });
    const cancel = new Event("cancel", { cancelable: true }); fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true); expect(onClose).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "원래 도구" }));
  });
  it("먼저 native를 닫고 실제 목적을 열며 다음 화면의 초점을 원래 트리거로 빼앗지 않는다", () => {
    const run = vi.fn(() => expect((document.getElementById("test-task") as HTMLDialogElement).open).toBe(false));
    const { onClose } = renderTask({ run });
    fireEvent.click(screen.getByRole("button", { name: "실제 작업 열기" }));
    expect(run).toHaveBeenCalledTimes(1); expect(onClose).toHaveBeenCalledTimes(1);
    expect(nativeEvents).toEqual(["show", "close"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "다음 작업" }));
    act(flushCloseEvents); expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "다음 작업" }));
  });
  it("외부 native close 이벤트도 한 번만 정리하고 원래 트리거로 돌려준다", () => {
    const { onClose } = renderTask();
    const dialog = screen.getByRole("dialog", { name: "보기 설정" }) as HTMLDialogElement;
    act(() => { dialog.close(); flushCloseEvents(); });
    expect(onClose).toHaveBeenCalledTimes(1); expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "원래 도구" }));
  });
  it("StrictMode의 effect 재생과 늦은 close가 새 화면을 취소하지 않고 최종 unmount는 slot을 원래대로 돌린다", () => {
    const baseline = document.createElement("div"), unregister = registerModalStatusSlot(baseline);
    try {
      const { onClose, run, unmount } = renderTask({ strict: true });
      const dialog = screen.getByRole("dialog", { name: "보기 설정" }) as HTMLDialogElement;
      expect(nativeEvents).toEqual(["show", "close", "show"]);
      expect(dialog.open).toBe(true); expect(onClose).not.toHaveBeenCalled();
      act(flushCloseEvents);
      expect(dialog.open).toBe(true); expect(onClose).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
      expect(getActiveServiceStatusSlot()?.element.closest("dialog")).toBe(dialog);
      unmount(); act(flushCloseEvents);
      expect(getActiveServiceStatusSlot()?.element).toBe(baseline);
      expect(onClose).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
      expect(nativeEvents).toEqual(["show", "close", "show", "close"]);
    } finally { unregister(); }
  });
});
