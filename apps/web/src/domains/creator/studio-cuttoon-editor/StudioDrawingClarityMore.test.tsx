// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioDrawingClarityMore } from "./StudioDrawingClarityMore";
import { getActiveServiceStatusSlot } from "@/shared/lib/modal-status-slot";

afterEach(cleanup);
function menu(hostId = "mobile-tools", run = vi.fn()) {
  return <StudioDrawingClarityMore id="drawing-menu" hostId={hostId} purpose="도구와 도움말"
    actions={Array.from({ length: 8 }, (_, index) => ({ id: String(index), label: `목적 ${index + 1}`, run }))} />;
}
function trigger() { return screen.getByLabelText("더보기 · 도구와 도움말"); }

describe("드로잉 더보기의 실제 진입점과 초점", () => {
  it("메뉴는 캔버스의 잘림·상태 도구 계층을 벗어나고 내부 포인터는 행동을 보존한다", () => {
    render(<div style={{ overflow: "hidden", isolation: "isolate" }}><button type="button">다른 영역</button>{menu("absent")}</div>);
    const source = trigger(); fireEvent.click(source);
    const action = screen.getByRole("button", { name: "목적 1" });
    expect(action.parentElement?.parentElement).toBe(document.body);
    fireEvent.pointerDown(action);
    expect(source.getAttribute("aria-expanded")).toBe("true");
    fireEvent.pointerDown(screen.getByRole("button", { name: "다른 영역" }));
    expect(source.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("drawing-menu")?.hidden).toBe(true);
  });
  it("포털에서도 Tab으로 첫 행동에 진입하고 역방향·끝에서는 같은 트리거로 돌아간다", () => {
    render(menu("absent")); const source = trigger(); source.focus(); fireEvent.click(source);
    const first = screen.getByRole("button", { name: "목적 1" });
    const last = screen.getByRole("button", { name: "목적 8" });
    fireEvent.keyDown(source, { key: "Tab" }); expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true }); expect(document.activeElement).toBe(source);
    last.focus(); fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(source); expect(source.getAttribute("aria-expanded")).toBe("false");
  });
  it("이름 있는8개 행동을 한 트리거에서 찾고 실제 누른 트리거로 복귀한다", () => {
    const run = vi.fn(); render(menu("absent", run)); const source = trigger(); source.focus(); fireEvent.click(source);
    expect(screen.getAllByRole("button")).toHaveLength(8); fireEvent.click(screen.getByRole("button", { name: "목적 4" }));
    expect(run).toHaveBeenCalledExactlyOnceWith(source); expect(document.activeElement).toBe(source);
    expect(screen.queryByRole("button", { name: "목적 4" })).toBeNull();
  });
  it("Escape는 실행하지 않고 현재 더보기만 닫아 같은 하단 트리거로 돌아간다", () => {
    const run = vi.fn(); render(<><span id="mobile-tools" />{menu("mobile-tools", run)}</>);
    const source = trigger(); source.focus(); fireEvent.click(source); const action = screen.getByRole("button", { name: "목적 1" }); action.focus();
    fireEvent.keyDown(action, { key: "Escape" }); expect(source.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(source); expect(run).not.toHaveBeenCalled();
  });
  it("하단 host가 사라지고 다시 생겨도 중복 메뉴 없이 초점을 복구한다", async () => {
    const host = document.createElement("span"); host.id = "mobile-tools"; document.body.append(host);
    try {
      const view = render(menu()); await waitFor(() => expect(host.querySelector("summary")).not.toBeNull()); trigger().focus();
      act(() => host.remove()); await waitFor(() => expect(view.container.querySelector("summary")).not.toBeNull());
      expect(document.activeElement).toBe(trigger()); expect(document.querySelectorAll('[data-studio-clarity-more-trigger="true"]')).toHaveLength(1);
      act(() => document.body.append(host)); await waitFor(() => expect(host.querySelector("summary")).not.toBeNull());
      expect(document.activeElement).toBe(trigger()); expect(document.querySelectorAll('[data-studio-clarity-more-trigger="true"]')).toHaveLength(1);
    } finally { cleanup(); host.remove(); }
  });
  it("모바일과PC 컴포넌트를 교체할 때 기존 초점을 새 더보기로 넘긴다", async () => {
    function Surface({ mobile }: { mobile: boolean }) {
      return <div data-studio-editor="true"><span id={mobile ? "mobile-tools" : "pc-tools"} />
        <StudioDrawingClarityMore key={mobile ? "mobile" : "pc"} id="drawing-menu" hostId={mobile ? "mobile-tools" : "pc-tools"}
          purpose="도구와 도움말" actions={[]} /></div>;
    }
    const view = render(<Surface mobile />); trigger().focus();
    view.rerender(<Surface mobile={false} />); await waitFor(() => expect(document.activeElement).toBe(trigger()));
    expect(document.querySelectorAll('[data-studio-clarity-more-trigger="true"]')).toHaveLength(1);
  });
  it("외부로 옮긴 사용자의 초점은 host 이동으로 빼앗지 않는다", async () => {
    const host = document.createElement("span"); host.id = "mobile-tools"; document.body.append(host);
    try {
      render(<><button type="button">다른 작업</button>{menu()}</>); const other = screen.getByRole("button", { name: "다른 작업" });
      trigger().focus(); other.focus(); act(() => host.remove()); await waitFor(() => expect(trigger().parentElement?.parentElement).not.toBe(host));
      expect(document.activeElement).toBe(other);
    } finally { cleanup(); host.remove(); }
  });
  it("기존 배치로 돌아가면 간단한 그리기 진입점으로 초점을 유지한다", async () => {
    function Surface({ simple }: { simple: boolean }) {
      return <div data-studio-editor="true">{simple ? menu() : <button type="button" data-studio-clarity-entry="true">간단한 그리기</button>}</div>;
    }
    const view = render(<Surface simple />); trigger().focus(); view.rerender(<Surface simple={false} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "간단한 그리기" })));
  });
  it("기존 배치의 새 대화상자가 받은 초점을 복귀 버튼으로 빼앗지 않는다", async () => {
    function Surface({ simple }: { simple: boolean }) {
      return <div data-studio-editor="true">{simple ? menu() : <><button type="button" data-studio-clarity-entry="true">간단한 그리기</button><div role="dialog" aria-label="팀 작업"><button type="button" ref={(node) => { node?.focus(); }}>팀 작업 닫기</button></div></>}</div>;
    }
    const view = render(<Surface simple />); trigger().focus(); view.rerender(<Surface simple={false} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "팀 작업 닫기" })));
  });
});


// jsdom has no top layer/inert implementation. These fixtures check controller calls;
// actual native Tab containment and background inert remain browser checks.
describe("목적 화면으로 여는 드로잉 더보기", () => {
  let restoreNative: () => void;
  const nativeEvents: string[] = [];
  let pendingClose: HTMLDialogElement[] = [];
  beforeEach(() => {
    nativeEvents.length = 0; pendingClose = [];
    const proto = HTMLDialogElement.prototype;
    const show = Object.getOwnPropertyDescriptor(proto, "showModal"), close = Object.getOwnPropertyDescriptor(proto, "close");
    Object.defineProperty(proto, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; nativeEvents.push("show"); } });
    Object.defineProperty(proto, "close", { configurable: true, value: function (this: HTMLDialogElement) {
      if (!this.open) return; this.open = false; nativeEvents.push("close"); pendingClose.push(this);
    } });
    restoreNative = () => {
      if (show) Object.defineProperty(proto, "showModal", show); else Reflect.deleteProperty(proto, "showModal");
      if (close) Object.defineProperty(proto, "close", close); else Reflect.deleteProperty(proto, "close");
    };
  });
  afterEach(() => { cleanup(); restoreNative(); pendingClose = []; });
  function tasks(run = vi.fn()) {
    return <StudioDrawingClarityMore id="drawing-tasks" hostId="absent" purpose="도구와 도움말" presentation="tasks"
      actions={[
        { id: "pages", label: "페이지와 컷", run }, { id: "assets", label: "소재 찾기", run },
        { id: "export", label: "내보내기", run }, { id: "team", label: "함께 작업", run },
        { id: "device", label: "이 기기에서 할 수 있는 작업", run }, { id: "layers", label: "레이어", run },
        { id: "windows", label: "기존 작업 배치", run }, { id: "view", label: "보기 설정", run },
      ]} />;
  }
  it("원본 트리거에서 native 화면으로 초점이 진입하며 이름 있는 부가 기능을 보존한다", () => {
    render(tasks()); const source = trigger(); source.focus(); fireEvent.click(source);
    const dialog = screen.getByRole("dialog", { name: "원고 도구" }) as HTMLDialogElement;
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.open).toBe(true); expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("data-studio-shortcut-boundary")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "그리기로 돌아가기" }));
    expect(source.getAttribute("aria-haspopup")).toBe("dialog");
    expect(source.getAttribute("aria-controls")).toBe(dialog.id);
    expect(nativeEvents).toEqual(["show"]);
    expect(getActiveServiceStatusSlot()?.element.closest("dialog")).toBe(dialog);
    expect(dialog.querySelectorAll('[data-studio-clarity-action]')).toHaveLength(0);
    expect(screen.getByRole("navigation", { name: "원고 도구 목적 고르기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /원고와 레이어/ }));
    expect(dialog.querySelectorAll('[data-studio-clarity-action]')).toHaveLength(3);
    expect(screen.getByRole("button", { name: "레이어" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "보기 설정" })).toBeNull();
  });
  it("내부 포인터는 닫기를 선행하지 않고 native를 닫은 뒤 원본 트리거로 실제 행동을 한 번 실행한다", () => {
    const next = document.createElement("button"); next.textContent = "다음 작업"; document.body.append(next);
    let source: HTMLElement;
    const run = vi.fn((actual: HTMLElement) => {
      nativeEvents.push("run"); expect(actual).toBe(source);
      expect((document.getElementById("drawing-tasks") as HTMLDialogElement).open).toBe(false);
      next.focus();
    });
    try {
      render(tasks(run)); source = trigger(); source.focus(); fireEvent.click(source);
      fireEvent.click(screen.getByRole("button", { name: /원고와 레이어/ }));
      const action = screen.getByRole("button", { name: "소재 찾기" });
      fireEvent.pointerDown(action);
      expect(source.getAttribute("aria-expanded")).toBe("true");
      expect(nativeEvents).toEqual(["show"]);
      fireEvent.click(action);
      expect(nativeEvents).toEqual(["show", "close", "run"]);
      expect(run).toHaveBeenCalledExactlyOnceWith(source);
      expect(screen.queryByRole("dialog", { name: "원고 도구" })).toBeNull();
      expect(source.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(next);
      act(() => { pendingClose.splice(0).forEach(node => node.dispatchEvent(new Event("close"))); });
      expect(run).toHaveBeenCalledTimes(1); expect(getActiveServiceStatusSlot()).toBeNull();
    } finally { next.remove(); }
  });
  it("첫 Escape는 행동을 실행하지 않고 같은 더보기로 돌아가며 modal 자리를 정리한다", () => {
    const run = vi.fn(); render(tasks(run)); const source = trigger(); source.focus(); fireEvent.click(source);
    fireEvent.click(screen.getByRole("button", { name: /화면과 도움말/ }));
    const action = screen.getByRole("button", { name: "이 기기에서 할 수 있는 작업" }); action.focus();
    fireEvent.keyDown(action, { key: "Escape" });
    expect(run).not.toHaveBeenCalled(); expect(document.activeElement).toBe(source);
    expect(source.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog", { name: "원고 도구" })).toBeNull();
    expect(getActiveServiceStatusSlot()).toBeNull();
    expect(nativeEvents).toEqual(["show", "close"]);
  });
});
