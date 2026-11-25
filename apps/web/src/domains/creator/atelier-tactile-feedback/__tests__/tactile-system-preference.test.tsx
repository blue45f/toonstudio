// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import {
  evaluateTactileFeedbackState,
  exportTactileFeedbackSpecJson,
  StudioImmersiveFeedbackHudPanel,
  type StudioImmersiveFeedbackHudPanelProps,
} from "../index";

function installMotionPreference(matches: boolean) {
  const events = new EventTarget();
  const media = {
    matches, media: "(prefers-reduced-motion: reduce)", onchange: null,
    addListener: vi.fn<MediaQueryList["addListener"]>(),
    removeListener: vi.fn<MediaQueryList["removeListener"]>(),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  } satisfies MediaQueryList;
  const remove = vi.spyOn(media, "removeEventListener");
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  return {
    remove,
    change(next: boolean) {
      act(() => {
        media.matches = next;
        media.dispatchEvent(new Event("change"));
      });
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("시스템 모션 감소를 첫 렌더부터 적용하고 SVG 전환과 수동 해제를 차단한다", () => {
  installMotionPreference(true);
  render(<StudioImmersiveFeedbackHudPanel />);
  const svg = screen.getByTestId("tactile-live-canvas-svg");
  const control = screen.getByTestId("tactile-reduced-motion-switch");
  expect(svg.getAttribute("data-reduced-motion")).toBe("true");
  expect(screen.getByTestId("tactile-svg-edge-pill").style.transitionDuration).toBe("0ms");
  expect(control.getAttribute("aria-checked")).toBe("true");
  expect(control.hasAttribute("disabled")).toBe(true);
  expect(control.getAttribute("aria-label")).toBe("시스템 모션 감소 적용 중");

  fireEvent.change(screen.getByTestId("tactile-slider-brush-size"), { target: { value: "64" } });
  expect(screen.getByTestId("tactile-svg-ephemeral-pill").style.transitionDuration).toBe("0ms");
  fireEvent.click(control);
  expect(svg.getAttribute("data-reduced-motion")).toBe("true");
});

it("시스템 설정 변경을 구독하며 초기화 후에도 존중하고 언마운트에서 구독을 해제한다", () => {
  const preference = installMotionPreference(false);
  const view = render(<StudioImmersiveFeedbackHudPanel />);
  const svg = screen.getByTestId("tactile-live-canvas-svg");
  expect(svg.getAttribute("data-reduced-motion")).toBe("false");
  expect(screen.getByTestId("tactile-svg-edge-pill").style.transitionDuration).toBe("180ms");

  preference.change(true);
  expect(svg.getAttribute("data-reduced-motion")).toBe("true");
  expect(screen.getByTestId("tactile-svg-edge-pill").style.transitionDuration).toBe("0ms");
  fireEvent.click(screen.getByTestId("tactile-reset-btn"));
  expect(svg.getAttribute("data-reduced-motion")).toBe("true");

  preference.change(false);
  expect(svg.getAttribute("data-reduced-motion")).toBe("false");
  expect(screen.getByTestId("tactile-reduced-motion-switch").hasAttribute("disabled")).toBe(false);
  view.unmount();
  expect(preference.remove).toHaveBeenCalledWith("change", expect.any(Function));
});

it("시스템 설정이 바뀌어도 사용자가 추가로 선택한 모션 감소를 유지한다", () => {
  const preference = installMotionPreference(false);
  render(<StudioImmersiveFeedbackHudPanel />);
  fireEvent.click(screen.getByTestId("tactile-reduced-motion-switch"));
  preference.change(true);
  preference.change(false);
  expect(screen.getByTestId("tactile-live-canvas-svg").getAttribute("data-reduced-motion")).toBe("true");
  fireEvent.click(screen.getByTestId("tactile-reduced-motion-switch"));
  expect(screen.getByTestId("tactile-live-canvas-svg").getAttribute("data-reduced-motion")).toBe("false");
});

it("초기화 콜백은 초기 모드와 초기화된 입력·시스템 모션 감소 상태를 함께 전달한다", () => {
  installMotionPreference(true);
  const onModeChange = vi.fn<NonNullable<StudioImmersiveFeedbackHudPanelProps["onModeChange"]>>();
  render(<StudioImmersiveFeedbackHudPanel initialMode="workbench-82" onModeChange={onModeChange} />);
  fireEvent.click(screen.getByTestId("tactile-mode-calm-studio-88"));
  fireEvent.change(screen.getByTestId("tactile-slider-brush-size"), { target: { value: "64" } });
  fireEvent.click(screen.getByTestId("tactile-surface-ink-obsidian"));
  fireEvent.click(screen.getByTestId("tactile-action-offline"));
  fireEvent.click(screen.getByTestId("tactile-reset-btn"));

  expect(onModeChange).toHaveBeenCalledTimes(2);
  expect(onModeChange).toHaveBeenLastCalledWith("workbench-82", expect.objectContaining({
    viewport: expect.objectContaining({ id: "workbench-82" }),
    reducedMotion: true,
    nibHalo: expect.objectContaining({ pressure: 0.64, tiltDeg: 56, brushSizePx: 28 }),
    ephemeralPill: expect.objectContaining({ visible: false, brushOpacityPercent: 88 }),
    inkRippleAndSave: expect.objectContaining({ actionKind: "idle", opfsDot: expect.objectContaining({ status: "steady-forest" }) }),
    surfaceTactile: expect.objectContaining({ surfaceId: "warm-alabaster" }),
  }));
  expect(screen.getByTestId("tactile-live-canvas-svg").getAttribute("data-viewport-mode")).toBe("workbench-82");
});

it("UI·접근성 이름·JSON은 고정 면적 목표와 타이머 표시 시연을 실제 저장과 구분한다", () => {
  installMotionPreference(false);
  render(<StudioImmersiveFeedbackHudPanel />);
  expect(screen.getByTestId("tactile-preview-scope").textContent).toContain("실제 원고 편집·실행취소·OPFS 저장은 수행하지 않습니다");
  expect(screen.getByTestId("tactile-live-canvas-svg").getAttribute("aria-label")).toContain("고정 레이아웃 목표 96%·실측 전");
  expect(screen.getByTestId("tactile-svg-opfs-dot").textContent).toBe("OPFS 저장 완료 표시 예시");
  fireEvent.click(screen.getByTestId("tactile-action-opfs-save"));
  expect(screen.getByTestId("tactile-svg-opfs-dot").textContent).toBe("OPFS 저장 중 표시 시연");
  const spec: unknown = JSON.parse(exportTactileFeedbackSpecJson(evaluateTactileFeedbackState({ lastActionKind: "opfs-save" })));
  expect(spec).toMatchObject({
    scopeNotice: "preview-token-spec-only",
    executionPreview: {
      renderer: "react-svg", timingSource: "demo-timer", canvasOccupancySource: "fixed-design-target-unmeasured",
      productLayoutVerified: false, documentModified: false, opfsWritePerformed: false, saveStatusSource: "simulated-indicator",
    },
  });
});

it("영문 UI도 미측정 면적 목표와 저장 시연을 명시한다", () => {
  installMotionPreference(false);
  render(<StudioImmersiveFeedbackHudPanel locale="en" />);
  expect(screen.getByTestId("tactile-preview-scope").textContent).toContain("Canvas area is unmeasured");
  expect(screen.getByTestId("tactile-live-canvas-svg").getAttribute("aria-label")).toContain("fixed layout target 96%, unmeasured");
  expect(screen.getByTestId("tactile-svg-opfs-dot").textContent).toBe("OPFS Saved Indicator Preview");
});
