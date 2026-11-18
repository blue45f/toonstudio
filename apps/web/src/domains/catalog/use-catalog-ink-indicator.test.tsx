// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCatalogInkIndicator } from "./use-catalog-ink-indicator";

function Fixture({ selected = "one", visible = true }: { readonly selected?: string; readonly visible?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const ink = useCatalogInkIndicator(ref, selected, {
    activeSelector: '[aria-selected="true"]', itemSelector: "button", maxInsetPx: 0,
  });
  return <>{visible ? <div ref={ref} role="tablist" aria-label="작품 구간"
    onPointerMove={ink.onPointerMove} onPointerLeave={ink.onPointerLeave}
    onFocusCapture={ink.onFocusCapture} onBlurCapture={ink.onBlurCapture}>
    <button type="button" role="tab" data-item="one" aria-selected={selected === "one"}>첫 구간</button>
    <button type="button" role="tab" data-item="two" aria-selected={selected === "two"}>다음 구간</button>
    <span aria-hidden="true" data-testid="ink" style={ink.style} />
  </div> : null}<button type="button">다른 동작</button></>;
}

function mockLayout() {
  const layout = { secondWidth: 70 };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const left = this.dataset.item === "two" ? 150 : 100;
    const width = this.dataset.item === "one" ? 50 : this.dataset.item === "two" ? layout.secondWidth : 240;
    return { x: left, y: 0, left, top: 0, right: left + width, bottom: 44, width, height: 44, toJSON: () => ({}) };
  });
  return layout;
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("카탈로그 선택 밑줄", () => {
  it("로딩 뒤 같은 선택으로 나타난 탭에도 연결하고 사라진 DOM의 바인딩을 해제한다", async () => {
    mockLayout();
    const { rerender } = render(<Fixture visible={false} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    rerender(<Fixture />);
    const tabs = screen.getByRole("tablist");
    expect(screen.getByTestId("ink").style.getPropertyValue("--ink-w")).toBe("50");
    await waitFor(() => expect(tabs.dataset.inkReady).toBe("true"));
    rerender(<Fixture visible={false} />);
    expect(tabs.hasAttribute("data-ink-ready")).toBe(false);
    rerender(<Fixture selected="two" />);
    expect(screen.getByTestId("ink").style.getPropertyValue("--ink-w")).toBe("70");
  });

  it("처음 선택한 구간과 외부 선택 변경의 실제 너비를 표시한다", () => {
    mockLayout();
    const { rerender } = render(<Fixture />);
    expect(screen.getByTestId("ink").style.getPropertyValue("--ink-w")).toBe("50");
    rerender(<Fixture selected="two" />);
    expect(screen.getByTestId("ink").style.getPropertyValue("--ink-x")).toBe("50px");
    expect(screen.getByTestId("ink").style.getPropertyValue("--ink-w")).toBe("70");
    expect(screen.getByRole("tab", { name: "다음 구간" }).getAttribute("aria-selected")).toBe("true");
  });

  it("포인터·키보드 미리보기는 선택을 바꾸지 않고 이탈하면 선택 위치로 돌아간다", () => {
    mockLayout();
    render(<Fixture />);
    const next = screen.getByRole("tab", { name: "다음 구간" });
    fireEvent.pointerMove(next);
    expect(screen.getByTestId("ink").style.getPropertyValue("--ink-w")).toBe("70");
    expect(next.getAttribute("aria-selected")).toBe("false");
    fireEvent.pointerLeave(screen.getByRole("tablist"));
    expect(screen.getByTestId("ink").style.getPropertyValue("--ink-w")).toBe("50");
    act(() => { next.focus(); });
    fireEvent.pointerLeave(screen.getByRole("tablist"));
    expect(screen.getByTestId("ink").style.getPropertyValue("--ink-w")).toBe("70");
    act(() => { screen.getByRole("button", { name: "다른 동작" }).focus(); });
    expect(screen.getByTestId("ink").style.getPropertyValue("--ink-w")).toBe("50");
  });

  it("크기 변경을 재측정하고 화면을 닫으면 관찰자·이벤트를 정리한다", async () => {
    const layout = mockLayout();
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      observe = vi.fn();
      disconnect = disconnect;
    });
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<Fixture selected="two" />);
    const tabs = screen.getByRole("tablist");
    layout.secondWidth = 110;
    fireEvent.resize(window);
    expect(screen.getByTestId("ink").style.getPropertyValue("--ink-w")).toBe("110");
    await waitFor(() => expect(tabs.dataset.inkReady).toBe("true"));
    unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(tabs.hasAttribute("data-ink-ready")).toBe(false);
  });
});
