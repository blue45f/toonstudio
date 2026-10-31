// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudioQuickAccessSurfaceLifecycle } from "./use-studio-quick-access-surface-lifecycle";

function Surface({ children, onClose = () => undefined, mobile = true }: {
  children?: ReactNode; onClose?: () => void; mobile?: boolean;
}) {
  const { surfaceRef } = useStudioQuickAccessSurfaceLifecycle(mobile, onClose);
  return <div ref={surfaceRef} role="dialog" aria-modal={mobile || undefined} aria-label="도구" tabIndex={-1}>{children}</div>;
}

function tab(target: Element, shiftKey = false) {
  const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
  fireEvent(target, event);
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom에는 배치 계산이 없으므로 화면에 보이는 요소의 사각형만 대체한다.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    const hidden = this.closest("[hidden], [data-layout-hidden]");
    const rect = new DOMRect(0, 0, 100, 24);
    return hidden ? Object.assign([], { item: () => null })
      : Object.assign([rect], { item: (index: number) => index === 0 ? rect : null });
  });
});
afterEach(() => { cleanup(); vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("빠른 액세스의 실제 React·DOM 키보드 연결", () => {
  it.each([false, true])("컨테이너에서 %s 방향 Tab으로 내부 경계에 진입한다", (backwards) => {
    render(<Surface><button type="button">처음</button><button type="button">마지막</button></Surface>);
    act(() => vi.runOnlyPendingTimers());
    const root = screen.getByRole("dialog"); root.focus();
    expect(tab(root, backwards).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: backwards ? "마지막" : "처음" }));
  });

  it("마지막 링크와 textarea를 빠뜨리지 않고 중간 Tab은 브라우저에 맡긴다", () => {
    render(<Surface><button type="button">처음</button><textarea aria-label="설명" /><a href="#help">도움말</a></Surface>);
    act(() => vi.runOnlyPendingTimers());
    const first = screen.getByRole("button"); first.focus();
    expect(tab(first).defaultPrevented).toBe(false);
    const text = screen.getByRole("textbox"); text.focus();
    expect(tab(text).defaultPrevented).toBe(false);
    const last = screen.getByRole("link"); last.focus();
    expect(tab(last).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(tab(first, true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it("음수 tabindex·비활성 fieldset·숨김·inert 항목을 건너뛴다", () => {
    render(<Surface><button type="button">가능</button><input aria-label="제외" tabIndex={-1} />
      <fieldset disabled><input aria-label="잠김" /></fieldset><div hidden><button type="button">숨김</button></div>
      <div inert><input aria-label="inert" /></div><div aria-hidden="true"><input aria-label="숨김 상속" /></div>
      <input aria-label="시각 숨김" style={{ visibility: "hidden" }} />
    </Surface>);
    act(() => vi.runOnlyPendingTimers());
    const available = screen.getByRole("button", { name: "가능" }); available.focus();
    expect(tab(available).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(available);
  });

  it("summary와 명시적인 양수 tabindex를 원래 순서로 포함한다", () => {
    render(<Surface><button type="button" tabIndex={2}>둘째</button><details><summary>펼치기</summary></details>
      <button type="button" tabIndex={1}>첫째</button></Surface>);
    act(() => vi.runOnlyPendingTimers());
    const root = screen.getByRole("dialog"); root.focus(); tab(root);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "첫째" }));
    tab(document.activeElement ?? root, true);
    expect(document.activeElement).toBe(screen.getByText("펼치기"));
  });

  it("라디오 그룹은 선택된 항목을 하나의 Tab 경계로 사용한다", () => {
    render(<Surface><input type="radio" name="choice" aria-label="미선택" />
      <input type="radio" name="choice" aria-label="선택" defaultChecked /><button type="button">끝</button></Surface>);
    act(() => vi.runOnlyPendingTimers());
    const root = screen.getByRole("dialog"); root.focus(); tab(root);
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "선택", exact: true }));
    tab(document.activeElement ?? root, true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "끝" }));
  });

  it("이미 하위 입력이 처리한 Tab의 초점을 빼앗지 않는다", () => {
    render(<Surface><button type="button" onKeyDown={(event) => event.preventDefault()}>처리됨</button><button type="button">끝</button></Surface>);
    act(() => vi.runOnlyPendingTimers());
    const first = screen.getByRole("button", { name: "처리됨" }); first.focus(); tab(first, true);
    expect(document.activeElement).toBe(first);
  });

  it("별도 모달이 열렸을 때 그 모달의 Tab을 가로채지 않는다", () => {
    render(<><Surface><button type="button">도구 명령</button></Surface>
      <div role="dialog" aria-modal="true" aria-label="상위 확인"><button type="button">확인</button></div></>);
    act(() => vi.runOnlyPendingTimers());
    const confirm = screen.getByRole("button", { name: "확인" }); confirm.focus();
    expect(tab(confirm).defaultPrevented).toBe(false); expect(document.activeElement).toBe(confirm);
  });

  it("조작 가능한 항목이 없으면 모달 자체에서 초점을 유지한다", () => {
    render(<Surface><fieldset disabled><button type="button">잠김</button></fieldset></Surface>);
    act(() => vi.runOnlyPendingTimers());
    const root = screen.getByRole("dialog"); root.focus();
    expect(tab(root).defaultPrevented).toBe(true); expect(document.activeElement).toBe(root);
  });

  it.each([{ isComposing: true }, { keyCode: 229 }])("한글 조합 Escape는 팔레트를 닫지 않는다: %j", (ime) => {
    const close = vi.fn(); render(<Surface onClose={close}><input aria-label="검색" /></Surface>);
    const input = screen.getByRole("textbox"); input.focus();
    fireEvent.keyDown(input, { key: "Escape", ...ime }); expect(close).not.toHaveBeenCalled();
  });

  it("하위 컨트롤이 처리한 Shift+Q는 팔레트를 닫지 않는다", () => {
    const close = vi.fn();
    render(<Surface onClose={close}><button type="button" onKeyDown={(event) => event.preventDefault()}>하위 기능</button></Surface>);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Q", code: "KeyQ", shiftKey: true });
    expect(close).not.toHaveBeenCalled();
  });

  it("데스크톱 비모달에서는 Tab을 가두지 않는다", () => {
    render(<Surface mobile={false}><button type="button">명령</button></Surface>);
    const button = screen.getByRole("button"); button.focus();
    expect(tab(button).defaultPrevented).toBe(false);
  });

  it("일반 Escape로 닫으면 시작 버튼으로 초점을 복원한다", () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return <><button type="button" onClick={() => setOpen(true)}>도구 열기</button>
        {open ? <Surface onClose={() => setOpen(false)}><input aria-label="검색" /></Surface> : null}</>;
    }
    render(<Host />); const launcher = screen.getByRole("button"); launcher.focus(); fireEvent.click(launcher);
    act(() => vi.runOnlyPendingTimers());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(launcher);
  });
});
