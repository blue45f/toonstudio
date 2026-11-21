// @vitest-environment jsdom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccessibleTooltipLayer } from "./AccessibleTooltipLayer";

function rect({
  left = 100,
  top = 100,
  width = 32,
  height = 32,
}: Partial<DOMRect> = {}): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

class ResizeObserverStub implements ResizeObserver {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

function installBrowserStubs(reducedMotion = false): void {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: reducedMotion,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.matches('[data-app-tooltip-layer="true"]')) {
      return rect({ left: 0, top: 0, width: 200, height: 64 });
    }
    if (this.matches('[data-zero-size-anchor="true"]')) {
      return rect({ width: 0, height: 0 });
    }
    return rect();
  });
}

function renderLayer(children: ReactNode) {
  return render(
    <>
      <AccessibleTooltipLayer />
      {children}
    </>,
  );
}

function revealByHover(target: HTMLElement): HTMLElement {
  fireEvent.pointerOver(target, { pointerType: "mouse" });
  act(() => vi.advanceTimersByTime(360));
  return screen.getByRole("tooltip");
}

beforeEach(() => {
  document.documentElement.lang = "ko";
  installBrowserStubs();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.lang = "";
});

describe("AccessibleTooltipLayer", () => {
  it("도구막대가 지정한 측면 배치를 따르면서 호버·Esc와 설명 연결을 유지한다", () => {
    vi.useFakeTimers();
    renderLayer(<nav data-app-tooltip-preferred-side="right">
      <button type="button" title="선택 · V">선택</button>
      <button type="button" title="펜 · B">펜</button>
    </nav>);
    const button = screen.getByRole("button", { name: "선택" });
    const tooltip = revealByHover(button);
    expect(tooltip.getAttribute("data-side")).toBe("right");
    expect(Number.parseFloat(tooltip.style.left)).toBeGreaterThan(button.getBoundingClientRect().right);
    expect(button.getAttribute("aria-describedby")).toContain(tooltip.id);
    fireEvent.pointerOut(button, { relatedTarget: tooltip, pointerType: "mouse" });
    fireEvent.pointerOver(tooltip, { relatedTarget: button, pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip")).toBe(tooltip);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(button.getAttribute("title")).toBe("선택 · V");
  });

  it.each([false, true])("Shift+Q keeps Quick Access usable when a previous tooltip is pending/open (%s)", async (alreadyOpen) => {
    vi.useFakeTimers();
    const onEdit = vi.fn();
    function QuickAccessFixture() {
      const [open, setOpen] = useState(false);
      return <>
        <button type="button" title="다시 · Ctrl/⌘+Shift+Z">다시실행</button>
        <button type="button" onKeyDown={(event) => {
          if (event.key === "Q" && event.shiftKey) setOpen(true);
        }}>캔버스</button>
        {open && <section data-studio-quick-access-surface="true" data-mobile="false" aria-label="빠른 액세스">
          <button type="button" title="명령 편집" onClick={onEdit}>빠른 액세스 편집</button>
        </section>}
      </>;
    }
    renderLayer(<QuickAccessFixture />);
    const redo = screen.getByRole("button", { name: "다시실행" });
    fireEvent.pointerOver(redo, { pointerType: "mouse" });
    if (alreadyOpen) {
      act(() => vi.advanceTimersByTime(360));
      expect(screen.getByRole("tooltip").textContent).toContain("다시");
    }
    const canvas = screen.getByRole("button", { name: "캔버스" });
    canvas.focus();
    await act(async () => {
      fireEvent.keyDown(canvas, { key: "Q", shiftKey: true });
    });
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(redo.getAttribute("aria-describedby")).toBeNull();

    const edit = screen.getByRole("button", { name: "빠른 액세스 편집" });
    expect(revealByHover(edit).textContent).toContain("명령 편집");
    fireEvent.keyDown(edit, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.getByRole("region", { name: "빠른 액세스" })).toBeTruthy();
    fireEvent.click(edit);
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("adds friendly state and shortcut guidance to an icon-only accessible control", () => {
    vi.useFakeTimers();
    renderLayer(
      <button type="button" aria-label="작업 메뉴" aria-expanded="false" aria-keyshortcuts="Alt+M">
        <svg aria-hidden="true" />
      </button>,
    );

    const button = screen.getByRole("button", { name: "작업 메뉴" });
    const tooltip = revealByHover(button);

    expect(tooltip.textContent).toContain("작업 메뉴");
    expect(tooltip.textContent).toContain("누르면 관련 메뉴나 패널을 엽니다.");
    expect(tooltip.textContent).toContain("Alt+M");
    expect(tooltip.getAttribute("data-positioned")).toBe("true");
    expect(button.getAttribute("aria-describedby")).toContain(tooltip.id);
    expect(screen.getByRole("complementary", { name: "조작 도움말" }).contains(tooltip)).toBe(true);
  });

  it("avoids noisy aria-label duplication when a control already has visible text", () => {
    vi.useFakeTimers();
    renderLayer(
      <button type="button" aria-label="저장">
        저장
      </button>,
    );

    fireEvent.pointerOver(screen.getByRole("button", { name: "저장" }), {
      pointerType: "mouse",
    });
    act(() => vi.advanceTimersByTime(600));

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("suppresses the native title, stays readable under the pointer, and restores it", () => {
    vi.useFakeTimers();
    renderLayer(<button type="button" title="원본 다운로드" />);
    const button = screen.getByRole("button", { name: "원본 다운로드" });
    const tooltip = revealByHover(button);

    expect(button.hasAttribute("title")).toBe(false);

    fireEvent.pointerOut(button, {
      pointerType: "mouse",
      relatedTarget: tooltip,
    });
    fireEvent.pointerOver(tooltip, {
      pointerType: "mouse",
      relatedTarget: button,
    });
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole("tooltip")).toBe(tooltip);

    fireEvent.pointerOut(tooltip, {
      pointerType: "mouse",
      relatedTarget: document.body,
    });
    act(() => vi.advanceTimersByTime(221));

    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(button.getAttribute("title")).toBe("원본 다운로드");
    expect(button.hasAttribute("aria-describedby")).toBe(false);
  });

  it.each([[12, "right"], [960, "left"]] as const)("세로 도구 모음 x=%i에서 다음 도구를 가리지 않고 도움말을 %s에 연다", (x, side) => {
    vi.useFakeTimers();
    renderLayer(<div role="toolbar" aria-orientation="vertical"><button type="button" title="펜">펜</button></div>);
    const pen = screen.getByRole("button", { name: "펜" });
    Object.defineProperty(pen, "getBoundingClientRect", { value: () => new DOMRect(x, 100, 56, 44) });
    const tooltip = revealByHover(pen);
    expect(tooltip.dataset.side).toBe(side);
    const left = Number.parseFloat(tooltip.style.left);
    const width = tooltip.getBoundingClientRect().width;
    expect(width).toBe(200);
    expect(side === "right" ? left >= x + 56 : left + width <= x).toBe(true);
    expect(pen.getAttribute("aria-describedby")).toContain(tooltip.id);
  });

  it("dismisses ordinary hover help as soon as its action is clicked", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    renderLayer(
      <button type="button" aria-label="필터 열기" onClick={onClick}>
        <svg aria-hidden="true" />
      </button>,
    );
    const button = screen.getByRole("button", { name: "필터 열기" });
    revealByHover(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("falls back to rendered child geometry when an inline wrapper reports zero size", () => {
    vi.useFakeTimers();
    renderLayer(
      <span title="레이어 옵션" data-zero-size-anchor="true">
        <span aria-hidden="true" />
      </span>,
    );
    const wrapper = screen.getByTitle("레이어 옵션");
    const child = wrapper.firstElementChild as HTMLElement;

    const tooltip = revealByHover(child);

    expect(tooltip.textContent).toContain("레이어 옵션");
    expect(tooltip.getAttribute("data-positioned")).toBe("true");
  });

  it("opens immediately for keyboard focus and Escape dismisses it", () => {
    renderLayer(
      <button type="button" aria-label="검색 열기">
        <svg aria-hidden="true" />
      </button>,
    );
    const button = screen.getByRole("button", { name: "검색 열기" });

    fireEvent.keyDown(window, { key: "Tab" });
    fireEvent.focusIn(button);
    expect(screen.getByRole("tooltip").textContent).toContain("검색 열기");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(button.hasAttribute("aria-describedby")).toBe(false);
  });

  it("does not open for programmatic focus without keyboard navigation", () => {
    renderLayer(
      <>
        <button type="button" aria-label="닫기 (Esc)">
          <svg aria-hidden="true" />
        </button>
        <button type="button" aria-label="다음">
          <svg aria-hidden="true" />
        </button>
      </>,
    );
    const close = screen.getByRole("button", { name: "닫기 (Esc)" });
    const next = screen.getByRole("button", { name: "다음" });

    // 대화상자가 열리며 코드로 초기 초점을 준 경우(직전 입력 없음)
    fireEvent.focusIn(close);
    expect(screen.queryByRole("tooltip")).toBeNull();

    // 포인터로 누른 뒤의 초점 이동
    fireEvent.pointerDown(next, { pointerType: "mouse", pointerId: 1 });
    fireEvent.focusIn(next);
    expect(screen.queryByRole("tooltip")).toBeNull();

    // 키보드로 이동하면 다시 연다
    fireEvent.keyDown(window, { key: "Tab" });
    fireEvent.focusIn(close);
    expect(screen.getByRole("tooltip").textContent).toContain("닫기");
  });

  it("uses long-press as help-only input and cancels when touch turns into a drag", () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    renderLayer(
      <>
        <button type="button" aria-label="삭제" onClick={onClick}>
          <svg aria-hidden="true" />
        </button>
        <button type="button" aria-label="공유">
          <svg aria-hidden="true" />
        </button>
      </>,
    );
    const deleteButton = screen.getByRole("button", { name: "삭제" });

    fireEvent.pointerDown(deleteButton, {
      pointerType: "touch",
      pointerId: 7,
      clientX: 20,
      clientY: 20,
    });
    act(() => vi.advanceTimersByTime(520));
    expect(screen.getByRole("tooltip").textContent).toContain("삭제");

    fireEvent.pointerUp(deleteButton, {
      pointerType: "touch",
      pointerId: 7,
      clientX: 20,
      clientY: 20,
    });
    fireEvent.click(deleteButton);
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("tooltip")).toBeTruthy();

    fireEvent.pointerDown(document.body, { pointerType: "touch", pointerId: 8 });
    expect(screen.queryByRole("tooltip")).toBeNull();

    const shareButton = screen.getByRole("button", { name: "공유" });
    fireEvent.pointerDown(shareButton, {
      pointerType: "touch",
      pointerId: 9,
      clientX: 20,
      clientY: 20,
    });
    fireEvent.pointerMove(shareButton, {
      pointerType: "touch",
      pointerId: 9,
      clientX: 40,
      clientY: 20,
    });
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("does not duplicate Studio-owned hints or override a user's off preference", () => {
    vi.useFakeTimers();
    renderLayer(
      <>
        <span data-studio-tool-hint-target="true">
          <button type="button" aria-label="스튜디오 도구">
            <svg aria-hidden="true" />
          </button>
        </span>
        <div data-studio-tool-hint-mode="off">
          <button type="button" title="숨긴 도움말" />
        </div>
      </>,
    );

    for (const button of screen.getAllByRole("button")) {
      fireEvent.pointerOver(button, { pointerType: "mouse" });
      act(() => vi.advanceTimersByTime(600));
      expect(screen.queryByRole("tooltip")).toBeNull();
    }
  });

  it("places tooltips outside open aria-controls popups and closes immediately when entering excluded submenu surfaces", () => {
    vi.useFakeTimers();
    renderLayer(
      <div>
        <a
          href="/discover"
          title="취향과 분위기에 맞는 새 작품을 찾는 입구"
          aria-haspopup="true"
          aria-expanded="true"
          aria-controls="discover-submenu"
        >
          탐색
        </a>
        <div data-app-tooltip-exclude="true">
          <ul id="discover-submenu" aria-label="탐색">
            <li>
              <a href="/ranking">랭킹</a>
            </li>
          </ul>
        </div>
      </div>,
    );

    const explore = screen.getByRole("link", { name: "탐색" });
    const submenu = document.getElementById("discover-submenu")!;
    const ranking = screen.getByRole("link", { name: "랭킹" });

    vi.spyOn(explore, "getBoundingClientRect").mockReturnValue(
      new DOMRect(120, 12, 64, 36),
    );
    vi.spyOn(submenu, "getBoundingClientRect").mockReturnValue(
      new DOMRect(120, 56, 224, 160),
    );

    revealByHover(explore);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toContain("취향과 분위기에 맞는 새 작품을 찾는 입구");
    expect(tooltip.textContent).not.toContain("현재 열려 있습니다");
    expect(Number.parseFloat(tooltip.style.top)).toBeGreaterThanOrEqual(56 + 160 + 10);

    // 서브메뉴 항목으로 포인터가 내려가면 상위 트리거의 툴팁이 지연 없이 즉시 닫힌다.
    fireEvent.pointerOut(explore, { pointerType: "mouse", relatedTarget: ranking });
    fireEvent.pointerOver(ranking, { pointerType: "mouse", relatedTarget: explore });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
