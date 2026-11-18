// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { selectStudioBg3dEngine } from "./studio-bg3d-engine-selection";
import { classifyStudioBg3dInAppBrowser } from "./studio-bg3d-inapp-browser";
import { StudioBg3dViewportReadinessOverlay } from "./StudioBg3dViewportReadinessOverlay";

function openViewport(backend: "webgpu" | "webgl2") {
  const reportRendererFailure = vi.fn();
  const host = document.createElement("div");
  const plan = selectStudioBg3dEngine({
    preference: backend,
    deviceProfile: "desktop",
    probe: { supported: true, reason: "available", computeSupported: true, timestampQuerySupported: false, limits: {} },
    inApp: classifyStudioBg3dInAppBrowser({ userAgent: "Chrome" }),
    webgl2Supported: true,
    webgpuRuntimeAvailable: true,
  });
  const props = {
    open: true,
    engineRuntime: { phase: "ready" as const, plan, canvasKey: backend, reportRendererFailure },
    onClearModelRenderer: vi.fn(),
    isRestoringScene: false,
    viewportHostRef: { current: host },
  };
  const view = render(<StudioBg3dViewportReadinessOverlay {...props} modelRenderer={null} />);
  return { reportRendererFailure, ready: () => view.rerender(<StudioBg3dViewportReadinessOverlay {...props} modelRenderer={{}} />) };
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("3D 배경 렌더러 초기화 시간", () => {
  it("6초 뒤에 완료된 WebGPU 장치를 표시하고 남은 감시 타이머를 해제한다", () => {
    vi.useFakeTimers();
    const gpu = openViewport("webgpu");
    act(() => vi.advanceTimersByTime(7_000));
    expect(gpu.reportRendererFailure).not.toHaveBeenCalled();
    gpu.ready();
    act(() => vi.advanceTimersByTime(20_000));
    expect(gpu.reportRendererFailure).not.toHaveBeenCalled();
  });

  it.each([["webgl2", 6_000], ["webgpu", 16_000]] as const)(
    "%s 엔진에 끝내 응답이 없으면 해당 엔진의 오류 상태로 넘어간다",
    (backend, timeout) => {
      vi.useFakeTimers();
      const viewport = openViewport(backend);
      act(() => vi.advanceTimersByTime(timeout - 1));
      expect(viewport.reportRendererFailure).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(viewport.reportRendererFailure).toHaveBeenCalledWith(backend, expect.stringContaining("초기화"));
    },
  );
});
