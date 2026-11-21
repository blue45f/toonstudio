// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccessibleTooltipLayer } from "@/shared/components/AccessibleTooltipLayer";

import { DEFAULT_STUDIO_QUICK_ACCESS_STATE } from "../studio-quick-access";
import { buildStudioQuickAccessCommandCatalog } from "../studio-quick-access-integration";
import { StudioQuickAccessSurface } from "../StudioQuickAccessSurface";

const catalogue = buildStudioQuickAccessCommandCatalog({ undo: true, redo: true, save: true });
let surfaceBounds = new DOMRect(1092, 76, 332, 720);
let backgroundBounds = new DOMRect(1260, 52, 66, 44);
const resizeObservers = new Map<ResizeObserver, { callback: ResizeObserverCallback; targets: Set<Element> }>();

class ResizeObserverStub implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) { resizeObservers.set(this, { callback, targets: new Set() }); }
  disconnect(): void { resizeObservers.delete(this); }
  observe(target: Element): void { resizeObservers.get(this)?.targets.add(target); }
  unobserve(target: Element): void { resizeObservers.get(this)?.targets.delete(target); }
}

function notifyResize(target: HTMLElement) {
  for (const [observer, { callback, targets }] of resizeObservers) if (targets.has(target)) {
    callback([{ target, contentRect: bounds(target), borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] }], observer);
  }
}

function bounds(element: HTMLElement): DOMRect {
  if (element.matches('[data-studio-quick-access-surface="true"]')) return surfaceBounds;
  if (element.dataset.testid === "background-redo") return backgroundBounds;
  if (element.getAttribute("aria-label") === "빠른 액세스 편집") return new DOMRect(1370, 120, 44, 44);
  if (element.matches('[data-app-tooltip-layer="true"]')) {
    return new DOMRect(Number.parseFloat(element.style.left) || 0, Number.parseFloat(element.style.top) || 0, 280, 64);
  }
  return new DOMRect(1105, 280, 90, 90);
}

function Fixture() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(DEFAULT_STUDIO_QUICK_ACCESS_STATE);
  return <>
    <AccessibleTooltipLayer />
    <button type="button" data-testid="background-redo" aria-describedby="background-note" title="다시 · Ctrl/⌘+Shift+Z">다시실행</button>
    <span id="background-note" hidden>되돌린 작업을 다시 적용합니다.</span>
    <button type="button" onKeyDown={(event) => {
      if (event.key === "Q" && event.shiftKey) setOpen(true);
    }}>캔버스</button>
    {open && <StudioQuickAccessSurface state={state} catalog={catalogue} isMobile={false}
      onStateChange={setState} onExecute={() => undefined} onClose={() => setOpen(false)} />}
  </>;
}

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
  document.documentElement.lang = "ko";
  surfaceBounds = new DOMRect(1092, 76, 332, 720);
  backgroundBounds = new DOMRect(1260, 52, 66, 44);
  vi.stubGlobal("innerWidth", 1440);
  vi.stubGlobal("innerHeight", 1100);
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, media: "", onchange: null,
    addListener: () => undefined, removeListener: () => undefined,
    addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false })));
  // jsdom에 없는 배치 계산만 #2109 원본의 겹친 도구막대/팔레트 크기로 제공한다.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) { return bounds(this); });
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return this.closest("[hidden], [inert]") ? Object.assign([], { item: () => null })
      : Object.assign([bounds(this)], { item: (index: number) => index === 0 ? bounds(this) : null });
  });
});

afterEach(() => {
  cleanup();
  resizeObservers.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  document.documentElement.lang = "";
});

async function openPalette() {
  render(<Fixture />);
  const canvas = screen.getByRole("button", { name: "캔버스" });
  canvas.focus();
  await act(async () => { fireEvent.keyDown(canvas, { key: "Q", code: "KeyQ", shiftKey: true }); });
  act(() => vi.advanceTimersByTime(1));
  return screen.getByRole("dialog", { name: "빠른 액세스 팔레트" });
}

function hoverBackgroundRedo() {
  fireEvent.pointerOver(screen.getByTestId("background-redo"), { pointerType: "mouse" });
  act(() => vi.advanceTimersByTime(360));
  return screen.getByRole("tooltip");
}

describe("빠른 액세스와 외부 도움말의 실제 DOM 연결", () => {
  it("팔레트가 열린 뒤 늦게 들어온 배경 hover가 편집 버튼을 가리지 않는다", async () => {
    await openPalette();
    const tooltip = hoverBackgroundRedo();
    expect(tooltip.textContent).toContain("다시 · Ctrl/⌘+Shift+Z");
    const edit = screen.getByRole("button", { name: "빠른 액세스 편집" });
    const target = edit.getBoundingClientRect(), help = tooltip.getBoundingClientRect();
    const x = target.left + target.width / 2, y = target.top + target.height / 2;
    expect(x >= help.left && x < help.right && y >= help.top && y < help.bottom).toBe(false);
    expect(screen.getByTestId("background-redo").getAttribute("aria-describedby")).toContain(tooltip.id);
    fireEvent.click(edit);
    expect(screen.getByRole("searchbox", { name: "추가할 빠른 액세스 명령 검색" })).toBeTruthy();
  });

  it("창과 겹치지 않는 외부 도움말은 기존 anchor 바로 아래에 둔다", async () => {
    backgroundBounds = new DOMRect(100, 52, 66, 44);
    await openPalette();
    const tooltip = hoverBackgroundRedo();
    expect(tooltip.style.left).toBe("10px");
    expect(tooltip.style.top).toBe("106px");
    expect(tooltip.getAttribute("data-side")).toBe("bottom");
  });

  it("창 이동과 크기 변경 뒤에도 같은 anchor와 화면 안의 빈 공간을 따라간다", async () => {
    const palette = await openPalette();
    const tooltip = hoverBackgroundRedo();
    const anchor = screen.getByTestId("background-redo");
    await act(async () => {
      surfaceBounds = new DOMRect(100, 100, 332, 720);
      palette.style.left = "100px";
      palette.style.top = "100px";
    });
    expect(tooltip.style.top).toBe("106px");
    expect(tooltip.getAttribute("data-side")).toBe("bottom");
    act(() => {
      surfaceBounds = new DOMRect(100, 100, 1324, 720);
      notifyResize(palette);
    });
    const help = tooltip.getBoundingClientRect();
    expect(help.top).toBeGreaterThanOrEqual(surfaceBounds.bottom);
    expect(help.left).toBeGreaterThanOrEqual(10);
    expect(help.right).toBeLessThanOrEqual(1430);
    expect(help.bottom).toBeLessThanOrEqual(1090);
    expect(anchor.getAttribute("aria-describedby")).toBe("background-note " + tooltip.id);
    expect(tooltip.textContent).toContain("다시 · Ctrl/⌘+Shift+Z");
  });

  it("화면을 가득 덮은 창 주위에 공간이 없으면 외부 도움말만 닫고 원래 설명을 복구한다", async () => {
    const palette = await openPalette();
    hoverBackgroundRedo();
    act(() => {
      surfaceBounds = new DOMRect(0, 0, 1440, 1100);
      notifyResize(palette);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
    const anchor = screen.getByTestId("background-redo");
    expect(anchor.getAttribute("aria-describedby")).toBe("background-note");
    expect(anchor.getAttribute("title")).toBe("다시 · Ctrl/⌘+Shift+Z");
    expect(palette.isConnected).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "빠른 액세스 편집" }));
    expect(screen.getByRole("searchbox", { name: "추가할 빠른 액세스 명령 검색" })).toBeTruthy();
  });

  it("팔레트 내부 도움말은 유지하고 첫 Escape로 도움말만, 다음 Escape로 창을 닫는다", async () => {
    const palette = await openPalette();
    const edit = screen.getByRole("button", { name: "빠른 액세스 편집" });
    fireEvent.pointerOver(edit, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(360));
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toContain("명령 편집");
    expect(edit.getAttribute("aria-describedby")).toContain(tooltip.id);
    act(() => edit.focus());
    fireEvent.keyDown(edit, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(palette.isConnected).toBe(true);
    fireEvent.keyDown(edit, { key: "Escape" });
    expect(palette.isConnected).toBe(false);
  });

  it("키보드로 외부 anchor에 초점을 둔 채 도움말을 닫아도 초점을 빼앗지 않는다", async () => {
    const palette = await openPalette();
    const anchor = screen.getByTestId("background-redo");
    fireEvent.keyDown(document, { key: "Tab" });
    act(() => anchor.focus());
    expect(screen.getByRole("tooltip").textContent).toContain("다시 · Ctrl/⌘+Shift+Z");
    expect(document.activeElement).toBe(anchor);
    act(() => {
      surfaceBounds = new DOMRect(0, 0, 1440, 1100);
      notifyResize(palette);
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(document.activeElement).toBe(anchor);
    expect(anchor.getAttribute("aria-describedby")).toBe("background-note");
    expect(anchor.getAttribute("title")).toBe("다시 · Ctrl/⌘+Shift+Z");
    expect(palette.isConnected).toBe(true);
  });
});
