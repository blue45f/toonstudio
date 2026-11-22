// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAdaptiveFloatingChrome } from "./useAdaptiveFloatingChrome";

function mockMatchMedia(reduced: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function Harness({ defaultEnabled = true }: { readonly defaultEnabled?: boolean }) {
  const chrome = useAdaptiveFloatingChrome({
    defaultEnabled,
    persistPreference: false,
    viewportWidthPx: 1440,
    viewportHeightPx: 900,
    floatingOverlayWidthPx: 280,
  });

  return (
    <div>
      <div data-studio-canvas-viewport="true" data-testid="canvas-surface" />
      <aside data-testid="floating-chrome" {...chrome.chromeContainerProps}>
        <button
          type="button"
          aria-label={chrome.toggleLabel}
          aria-pressed={chrome.enabled}
          className="min-h-11 min-w-11"
          onClick={chrome.toggleEnabled}
        >
          {chrome.toggleLabel}
        </button>
        <output data-testid="viewport-ratio">{chrome.viewportGuard.ratio}</output>
      </aside>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useAdaptiveFloatingChrome React 훅", () => {
  it("캔버스 pointerdown 시 후퇴하고 pointerup·호버·포커스 시 즉시 복원한다", () => {
    mockMatchMedia(false);
    render(<Harness />);

    const canvas = screen.getByTestId("canvas-surface");
    const panel = screen.getByTestId("floating-chrome");
    const toggle = screen.getByRole("button", { name: "그리는 중 패널 자동 숨김" });

    expect(panel.getAttribute("data-adaptive-floating-chrome")).toBe("visible");
    expect(Number(panel.style.opacity)).toBe(1);

    fireEvent.pointerDown(canvas, { button: 0, isPrimary: true, pointerId: 11 });
    expect(panel.getAttribute("data-adaptive-floating-chrome")).toBe("receded");
    expect(Number(panel.style.opacity)).toBeLessThan(0.3);
    expect(panel.style.pointerEvents).toBe("none");
    expect(Number(screen.getByTestId("viewport-ratio").textContent)).toBeGreaterThanOrEqual(0.82);

    // 크롬에 포인터가 올라가면 획 중이라도 즉시 복원
    fireEvent.pointerEnter(panel);
    expect(panel.getAttribute("data-adaptive-floating-chrome")).toBe("visible");
    fireEvent.pointerLeave(panel);
    expect(panel.getAttribute("data-adaptive-floating-chrome")).toBe("receded");

    // 키보드 포커스 시 즉시 복원
    fireEvent.focus(toggle);
    expect(panel.getAttribute("data-adaptive-floating-chrome")).toBe("visible");
    fireEvent.blur(toggle);
    expect(panel.getAttribute("data-adaptive-floating-chrome")).toBe("receded");

    // 획 종료 시 즉시 복원
    fireEvent.pointerUp(window, { pointerId: 11 });
    expect(panel.getAttribute("data-adaptive-floating-chrome")).toBe("visible");
    expect(Number(panel.style.opacity)).toBe(1);
    expect(panel.style.pointerEvents).toBe("auto");
  });

  it("prefers-reduced-motion: reduce 환경에서 트랜지션·이동을 끄고 사용자 토글 해제를 반영한다", () => {
    mockMatchMedia(true);
    render(<Harness />);

    const canvas = screen.getByTestId("canvas-surface");
    const panel = screen.getByTestId("floating-chrome");
    const toggle = screen.getByRole("button", { name: "그리는 중 패널 자동 숨김" });

    fireEvent.pointerDown(canvas, { button: 0, isPrimary: true, pointerId: 3 });
    expect(panel.getAttribute("data-adaptive-floating-chrome")).toBe("receded");
    expect(panel.style.transition).toBe("none");
    expect(panel.style.transform).toBe("none");

    fireEvent.pointerUp(window, { pointerId: 3 });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    // 비활성화 이후에는 캔버스 획 중에도 패널이 유지된다.
    fireEvent.pointerDown(canvas, { button: 0, isPrimary: true, pointerId: 4 });
    expect(panel.getAttribute("data-adaptive-floating-chrome")).toBe("visible");
  });
});
