// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioAdaptiveModeChromeBar } from "./StudioAdaptiveModeChromeBar";

function mockMatchMedia(reduced = false): void {
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

function ChromeFocusHarness({
  viewportWidthPx,
  viewportHeightPx,
}: {
  readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  return (
    <div>
      <div
        ref={canvasRef}
        tabIndex={-1}
        data-studio-canvas-viewport="true"
        data-testid="focus-return-canvas"
      />
      <StudioAdaptiveModeChromeBar
        canvasRef={canvasRef}
        viewportWidthPx={viewportWidthPx}
        viewportHeightPx={viewportHeightPx}
      />
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioAdaptiveModeChromeBar (Calm Atelier 5-모드 크롬 · CLS 0 · Tab/Escape 포커스)", () => {
  it("5개 모드(콘티·선화·채색·식자·3D) 전환 시 5~9개 핵심 도구만 전면 노출하고 보조 도구는 <details>로 수납한다", () => {
    mockMatchMedia(false);
    render(<StudioAdaptiveModeChromeBar viewportWidthPx={1440} viewportHeightPx={900} />);

    const modeIds = ["storyboard", "lineart", "coloring", "lettering", "three-d"] as const;
    for (const modeId of modeIds) {
      fireEvent.click(screen.getByTestId(`adaptive-mode-tab-${modeId}`));

      const primaryContainer = screen.getByTestId("adaptive-chrome-primary-tools");
      const primaryButtons = primaryContainer.querySelectorAll("button");
      expect(primaryButtons.length).toBeGreaterThanOrEqual(5);
      expect(primaryButtons.length).toBeLessThanOrEqual(9);

      // 모든 전면 버튼이 44x44px 터치 타깃 + keep-all + reduced-motion 클래스를 지킨다
      for (const button of primaryButtons) {
        expect(button.className).toContain("min-h-11");
        expect(button.className).toContain("min-w-11");
        expect(button.className).toContain("[word-break:keep-all]");
        expect(button.className).toContain("motion-reduce:transition-none");
      }

      // 보조 도구는 <details> 기본 접힘 상태 + 모드 전환 시 CLS = 0 + 캔버스 점유 >= 82%
      const details = screen.getByTestId("adaptive-chrome-aux-details") as HTMLDetailsElement;
      expect(details.open).toBe(false);
      expect(screen.getByTestId("adaptive-chrome-cls").getAttribute("data-cls-zero")).toBe("true");
      expect(
        screen.getByTestId("adaptive-chrome-occupancy").getAttribute("data-occupancy-passed"),
      ).toBe("true");
    }
  });

  it("Tab 이동과 Escape 키 입력 시 <details> 서랍 닫기 → summary 복귀 → 캔버스 포커스 복귀 순서로 동작한다", () => {
    mockMatchMedia(false);
    render(<ChromeFocusHarness viewportWidthPx={1440} viewportHeightPx={900} />);

    const canvas = screen.getByTestId("focus-return-canvas");
    const details = screen.getByTestId("adaptive-chrome-aux-details") as HTMLDetailsElement;
    const summary = screen.getByTestId("adaptive-chrome-aux-summary");

    // 1) 화살표 키로 모드 탭 이동(선화 -> 채색)
    const lineartTab = screen.getByTestId("adaptive-mode-tab-lineart");
    lineartTab.focus();
    fireEvent.keyDown(lineartTab, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByTestId("adaptive-mode-tab-coloring"));

    // 다시 선화 탭으로 복귀
    fireEvent.keyDown(screen.getByTestId("adaptive-mode-tab-coloring"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(lineartTab);

    // 2) 보조 도구 <details> 서랍을 열고 내부 버튼에 포커스 후 Escape -> 서랍 닫힘 & summary로 포커스 복귀
    details.open = true;
    fireEvent(details, new Event("toggle"));
    const auxToolBtn = screen.getByTestId("adaptive-aux-tool-pressure-curve");
    auxToolBtn.focus();
    expect(document.activeElement).toBe(auxToolBtn);

    fireEvent.keyDown(auxToolBtn, { key: "Escape" });
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe(summary);

    // 3) 서랍이 닫힌 상태에서 플로팅 도구 버튼으로 Tab 이동 후 Escape -> 캔버스 표면으로 포커스 복귀
    const firstPrimaryBtn = screen.getByTestId("adaptive-primary-tool-g-pen");
    firstPrimaryBtn.focus();
    expect(document.activeElement).toBe(firstPrimaryBtn);
    fireEvent.keyDown(firstPrimaryBtn, { key: "Escape" });
    expect(document.activeElement).toBe(canvas);

    // 4) Tab 순차 탐색 가능 요소 검증(활성 모드 탭만 tabIndex=0, 핵심 도구·서랍 summary·자동 숨김 토글은 모두 Tab 도달 가능)
    const tabbableModeTabs = screen
      .getAllByRole("tab")
      .filter((tab) => tab.getAttribute("tabindex") === "0");
    expect(tabbableModeTabs).toHaveLength(1);
    expect(tabbableModeTabs[0]).toBe(lineartTab);
    expect(firstPrimaryBtn.tabIndex).toBeGreaterThanOrEqual(0);
    expect(summary.tabIndex).toBeGreaterThanOrEqual(0);
    expect(screen.getByTestId("adaptive-chrome-autohide-toggle").tabIndex).toBeGreaterThanOrEqual(0);
  });

  it("canvasRef가 없을 때 플로팅 도구에서 Escape를 누르면 활성 모드 탭으로 포커스가 복귀한다", () => {
    mockMatchMedia(false);
    render(<StudioAdaptiveModeChromeBar initialMode="lettering" viewportWidthPx={1440} viewportHeightPx={900} />);

    const bubbleBtn = screen.getByTestId("adaptive-primary-tool-add-bubble");
    bubbleBtn.focus();
    expect(document.activeElement).toBe(bubbleBtn);

    fireEvent.keyDown(bubbleBtn, { key: "Escape" });
    expect(document.activeElement).toBe(screen.getByTestId("adaptive-mode-tab-lettering"));
  });

  it("2560px 울트라와이드에서 1280px 노트북으로 리사이즈 시 중앙 캔버스 비침범 좌/우 도크 자동 스냅을 반영한다", () => {
    mockMatchMedia(false);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 2560 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1440 });

    render(<StudioAdaptiveModeChromeBar />);

    const root = screen.getByTestId("studio-adaptive-mode-chrome-bar");
    expect(root.getAttribute("data-viewport-tier")).toBe("ultrawide");
    expect(root.getAttribute("data-overlaps-center")).toBe("false");
    expect(
      screen.getByTestId("adaptive-chrome-dock-status").getAttribute("data-compact-docked"),
    ).toBe("false");

    // 2560px -> 1280px 창 리사이즈 이벤트 발생
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 720 });
    fireEvent(window, new Event("resize"));

    expect(root.getAttribute("data-viewport-tier")).toBe("desktop");
    expect(root.getAttribute("data-overlaps-center")).toBe("false");
    expect(
      screen.getByTestId("adaptive-chrome-dock-status").getAttribute("data-compact-docked"),
    ).toBe("true");
    expect(
      screen.getByTestId("adaptive-chrome-occupancy").getAttribute("data-occupancy-passed"),
    ).toBe("true");
  });
});
