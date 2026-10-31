// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudioQuickAccessSurfaceLifecycle } from "../use-studio-quick-access-surface-lifecycle";
import { StudioQuickAccessMobileSurface } from "../StudioQuickAccessMobileSurface";
import { DEFAULT_STUDIO_QUICK_ACCESS_STATE } from "../studio-quick-access";

vi.mock("../StudioQuickAccessPalette", () => ({ StudioQuickAccessPalette: () => <div>도구 목록</div> }));
vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({ useBilingual: () => (ko: string) => ko }));

function Surface({ children, onClose = () => undefined }: {
  children?: ReactNode;
  onClose?: () => void;
}) {
  const { surfaceRef } = useStudioQuickAccessSurfaceLifecycle(true, onClose);
  return <div ref={surfaceRef} role="dialog" aria-modal="true" aria-label="팔레트" tabIndex={-1}>{children}</div>;
}

function press(target: Element, key: "Tab" | "Escape" | "Q", backwards = false) {
  const event = new KeyboardEvent("keydown", {
    key, code: key === "Q" ? "KeyQ" : key,
    shiftKey: key === "Q" || backwards, bubbles: true, cancelable: true,
  });
  fireEvent(target, event);
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom은 실제 스크롤·가림을 계산하지 않는다. DOM의 초점과 호출 계약만 검증한다.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    if (this.closest("[hidden]")) return Object.assign([], { item: () => null });
    const rect = new DOMRect(0, 0, 100, 44);
    return Object.assign([rect], { item: (index: number) => index === 0 ? rect : null });
  });
});
afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("도구 팔레트의 보이는 이동과 하위 확인창 보호", () => {
  it("낮은 화면의 시트 최대높이를 고정 최소높이로 덮지 않는다", () => {
    render(<StudioQuickAccessMobileSurface state={DEFAULT_STUDIO_QUICK_ACCESS_STATE}
      catalog={[]} descriptionId="description" surfaceRef={createRef<HTMLDivElement>()}
      onStateChange={vi.fn()} onExecute={vi.fn()} onClose={vi.fn()} />);
    // 클래스 계약만 확인한다. 실제 가상키보드·viewport 가림은 브라우저 gate에서 검사한다.
    const surface = screen.getByRole("dialog", { name: "빠른 액세스 팔레트" });
    expect(surface.className).toContain("min-h-0");
    expect(surface.className).toContain("max-h-[calc(100dvh-4rem)]");
    expect(surface.className).not.toContain("min-h-[14rem]");
  });

  it.each([false, true])("%s 방향 경계 이동은 대상을 드러내는 기본 스크롤을 허용한다", (backwards) => {
    render(<Surface><button type="button">처음</button><button type="button">마지막</button></Surface>);
    act(() => vi.runOnlyPendingTimers());
    const from = screen.getByRole("button", { name: backwards ? "처음" : "마지막" });
    const target = screen.getByRole("button", { name: backwards ? "마지막" : "처음" });
    from.focus();
    const moved = vi.spyOn(target, "focus");
    expect(press(from, "Tab", backwards).defaultPrevented).toBe(true);
    expect(moved).toHaveBeenCalledExactlyOnceWith();
    expect(document.activeElement).toBe(target);
  });

  it.each([false, true])("모달 자체에서 %s 방향 진입도 기본 스크롤을 허용한다", (backwards) => {
    render(<Surface><button type="button">처음</button><button type="button">마지막</button></Surface>);
    act(() => vi.runOnlyPendingTimers());
    const root = screen.getByRole("dialog"); root.focus();
    const target = screen.getByRole("button", { name: backwards ? "마지막" : "처음" });
    const moved = vi.spyOn(target, "focus");
    press(root, "Tab", backwards);
    expect(moved).toHaveBeenCalledExactlyOnceWith();
    expect(document.activeElement).toBe(target);
  });

  it.each([
    ["dialog", "Escape"], ["dialog", "Q"],
    ["alertdialog", "Escape"], ["alertdialog", "Q"],
    ["native", "Escape"], ["native", "Q"],
  ] as const)("하위 %s의 %s는 뒤 팔레트를 닫지 않는다", (kind, key) => {
    const close = vi.fn();
    const confirm = <button type="button">확인</button>;
    render(<Surface onClose={close}>
      {kind === "native" ? <dialog open aria-label="하위 창">{confirm}</dialog>
        : <div role={kind} aria-modal="true" aria-label="하위 창">{confirm}</div>}
    </Surface>);
    act(() => vi.runOnlyPendingTimers());
    const target = screen.getByRole("button", { name: "확인" }); target.focus();
    expect(press(target, key).defaultPrevented).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(target);
  });

  it.each([false, true])("별도 경고창의 %s 방향 Tab도 가로채지 않는다", (backwards) => {
    render(<><Surface><button type="button">도구 명령</button></Surface>
      <div role="alertdialog" aria-modal="true" aria-label="삭제 확인"><button type="button">취소</button></div></>);
    act(() => vi.runOnlyPendingTimers());
    const target = screen.getByRole("button", { name: "취소" }); target.focus();
    expect(press(target, "Tab", backwards).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(target);
  });

  it.each([false, true])("중첩 경고창의 %s 방향 Tab도 가로채지 않는다", (backwards) => {
    render(<Surface><button type="button">도구 명령</button>
      <div role="alertdialog" aria-modal="true" aria-label="삭제 확인"><button type="button">취소</button></div></Surface>);
    act(() => vi.runOnlyPendingTimers());
    const target = screen.getByRole("button", { name: "취소" }); target.focus();
    expect(press(target, "Tab", backwards).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(target);
  });

  it.each(["hidden", "inert", "aria-hidden"] as const)("%s 상태의 팔레트는 늦은 키 이벤트로 닫히거나 초점을 옮기지 않는다", (attribute) => {
    const close = vi.fn();
    render(<Surface onClose={close}><button type="button">명령</button></Surface>);
    act(() => vi.runOnlyPendingTimers());
    const root = screen.getByRole("dialog");
    const target = screen.getByRole("button"); target.focus();
    root.setAttribute(attribute, attribute === "aria-hidden" ? "true" : "");
    for (const key of ["Tab", "Escape", "Q"] as const) {
      expect(press(target, key).defaultPrevented).toBe(false);
    }
    expect(close).not.toHaveBeenCalled();
  });

  it.each(["disabled", "hidden", "inert", "aria-hidden"] as const)("닫힐 때 %s 상태가 된 원래 버튼으로 초점을 돌리지 않는다", (attribute) => {
    const launcher = document.createElement("button"); launcher.type = "button";
    document.body.append(launcher); launcher.focus();
    try {
      const view = render(<Surface><button type="button">명령</button></Surface>);
      act(() => vi.runOnlyPendingTimers());
      launcher.setAttribute(attribute, attribute === "aria-hidden" ? "true" : "");
      const restored = vi.spyOn(launcher, "focus");
      view.unmount();
      expect(restored).not.toHaveBeenCalled();
    } finally { launcher.remove(); }
  });

  it("정상 닫기는 원래 버튼으로 돌아가되 편집 화면 스크롤을 보존한다", () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return <><button type="button" onClick={() => setOpen(true)}>열기</button>
        {open ? <Surface onClose={() => setOpen(false)}><button type="button">명령</button></Surface> : null}</>;
    }
    render(<Host />);
    const launcher = screen.getByRole("button", { name: "열기" }); launcher.focus();
    fireEvent.click(launcher); act(() => vi.runOnlyPendingTimers());
    const restored = vi.spyOn(launcher, "focus");
    press(screen.getByRole("button", { name: "명령" }), "Escape");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(restored).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(document.activeElement).toBe(launcher);
  });
});


/** 실제 React의 effect·timer와 DOM 초점을 사용한다. 배치와 OS 입력기는 이 검사 범위 밖이다. */
describe("팔레트 초기 초점과 사용자 이동의 경합", () => {
  function commands() {
    return <div data-command-available="true"><fieldset><button type="button">첫 명령</button></fieldset>
      <button type="button">다음 명령</button></div>;
  }

  it("처음 사용 가능한 명령으로 이동하면서 기본 초점 스크롤을 허용한다", () => {
    render(<Surface>{commands()}</Surface>);
    const first = screen.getByRole("button", { name: "첫 명령" });
    const moved = vi.spyOn(first, "focus");
    act(() => vi.runOnlyPendingTimers());
    expect(document.activeElement).toBe(first);
    expect(moved).toHaveBeenCalledExactlyOnceWith();
  });

  it.each(["hidden", "inert", "aria-hidden", "disabled", "fieldset-disabled", "negative-tabindex", "css-hidden", "layout-hidden"] as const)(
    "%s 첫 명령을 건너뛰고 실제로 조작 가능한 명령을 선택한다", (state) => {
      render(<Surface>{commands()}</Surface>);
      const first = screen.getByRole("button", { name: "첫 명령" });
      const next = screen.getByRole("button", { name: "다음 명령" });
      if (state === "fieldset-disabled") first.closest("fieldset")?.setAttribute("disabled", "");
      else if (state === "negative-tabindex") first.tabIndex = -1;
      else if (state === "css-hidden") first.style.visibility = "hidden";
      else if (state === "layout-hidden") vi.spyOn(first, "getClientRects").mockReturnValue(Object.assign([], { item: () => null }));
      else first.setAttribute(state, state === "aria-hidden" ? "true" : "");
      const unavailableFocus = vi.spyOn(first, "focus");
      act(() => vi.runOnlyPendingTimers());
      expect(unavailableFocus).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(next);
    },
  );

  it("사용 가능한 명령이 없으면 팔레트 자체에서 안내를 읽을 수 있다", () => {
    render(<Surface><div data-command-available="true"><button type="button" disabled>준비 중</button></div></Surface>);
    act(() => vi.runOnlyPendingTimers());
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("사용자가 이미 검색창으로 옮긴 초점과 입력을 지키고 명령으로 되돌리지 않는다", () => {
    render(<Surface>{commands()}<input aria-label="도구 검색" /></Surface>);
    const search = screen.getByRole("textbox", { name: "도구 검색" });
    search.focus(); fireEvent.change(search, { target: { value: "브러시" } });
    act(() => vi.runOnlyPendingTimers());
    expect(document.activeElement).toBe(search);
    expect(screen.getByDisplayValue("브러시")).toBe(search);
  });

  it("예약된 초점이 실행되기 전에 사용자가 다른 화면을 선택하면 가로채지 않는다", () => {
    render(<><Surface>{commands()}</Surface><input aria-label="다른 작업" /></>);
    const other = screen.getByRole("textbox", { name: "다른 작업" }); other.focus();
    act(() => vi.runOnlyPendingTimers());
    expect(document.activeElement).toBe(other);
  });

  it.each([
    ["dialog", false], ["alertdialog", false], ["native", false],
    ["dialog", true], ["alertdialog", true], ["native", true],
  ] as const)("%s 별도배치%s의 확인창이 먼저 초점을 받으면 초기 명령이 빼앗지 않는다", (kind, sibling) => {
    const button = <button type="button">확인창에서 계속</button>;
    const modal = kind === "native" ? <dialog open aria-label="추가 창">{button}</dialog>
      : <div role={kind} aria-modal="true" aria-label="추가 창">{button}</div>;
    render(<><Surface>{commands()}{sibling ? null : modal}</Surface>{sibling ? modal : null}</>);
    const confirm = screen.getByRole("button", { name: "확인창에서 계속" }); confirm.focus();
    act(() => vi.runOnlyPendingTimers());
    expect(document.activeElement).toBe(confirm);
  });

  it.each(["hidden", "inert", "aria-hidden"] as const)("예약 중 %s 상태가 된 팔레트는 초점을 잡지 않는다", (attribute) => {
    render(<><button type="button">실행한 버튼</button><Surface>{commands()}</Surface></>);
    const launcher = screen.getByRole("button", { name: "실행한 버튼" }); launcher.focus();
    const root = screen.getByRole("dialog"); root.setAttribute(attribute, attribute === "aria-hidden" ? "true" : "");
    const command = screen.getByText("첫 명령");
    const moved = vi.spyOn(command, "focus"); const rootFocus = vi.spyOn(root, "focus");
    act(() => vi.runOnlyPendingTimers());
    expect(moved).not.toHaveBeenCalled(); expect(rootFocus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(launcher);
  });

  it.each([false, true])("닫히기 전에 다른 입력이나 확인창%s을 선택했다면 원래 버튼으로 강제 복귀하지 않는다", (modal) => {
    const launcher = document.createElement("button"); document.body.append(launcher); launcher.focus();
    const destination = document.createElement("input");
    const host = document.createElement("div");
    if (modal) { host.setAttribute("role", "dialog"); host.setAttribute("aria-modal", "true"); }
    host.append(destination); document.body.append(host);
    try {
      const view = render(<Surface>{commands()}</Surface>);
      act(() => vi.runOnlyPendingTimers()); destination.focus();
      const restored = vi.spyOn(launcher, "focus"); view.unmount();
      expect(restored).not.toHaveBeenCalled(); expect(document.activeElement).toBe(destination);
    } finally { host.remove(); launcher.remove(); }
  });

  it.each(["css-hidden", "layout-hidden"] as const)("닫을 때 %s 원래 버튼으로 초점을 보내지 않는다", (state) => {
    const launcher = document.createElement("button"); document.body.append(launcher); launcher.focus();
    try {
      const view = render(<Surface>{commands()}</Surface>); act(() => vi.runOnlyPendingTimers());
      if (state === "css-hidden") launcher.style.visibility = "hidden";
      else vi.spyOn(launcher, "getClientRects").mockReturnValue(Object.assign([], { item: () => null }));
      const restored = vi.spyOn(launcher, "focus"); view.unmount();
      expect(restored).not.toHaveBeenCalled();
    } finally { launcher.remove(); }
  });

  it("초기 초점 전에 팔레트를 닫으면 남은 예약으로 다시 초점을 잡지 않는다", () => {
    const view = render(<Surface>{commands()}</Surface>);
    const first = screen.getByRole("button", { name: "첫 명령" }); const moved = vi.spyOn(first, "focus");
    view.unmount(); act(() => vi.runOnlyPendingTimers());
    expect(moved).not.toHaveBeenCalled();
  });
});
