// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { selectStudioBg3dEngine } from "./studio-bg3d-engine-selection";
import { classifyStudioBg3dInAppBrowser } from "./studio-bg3d-inapp-browser";
import { StudioBg3dViewportReadinessOverlay, type StudioBg3dViewportReadinessOverlayProps } from "./StudioBg3dViewportReadinessOverlay";

function openViewport(backend: "webgpu" | "webgl2", downloading = false) {
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
  const setPreference = vi.fn();
  const props = {
    open: true,
    engineRuntime: { phase: "ready" as const, plan, canvasKey: backend, glFactory: downloading ? null : vi.fn(), webGpuCanvasStage: "waiting-for-canvas" as const, setPreference, reportRendererFailure },
    onClearModelRenderer: vi.fn(),
    isRestoringScene: false,
    viewportHostRef: { current: host },
  };
  const view = render(<StudioBg3dViewportReadinessOverlay {...props} modelRenderer={null} />);
  return { reportRendererFailure, setPreference, view,
    stage: (stage: StudioBg3dViewportReadinessOverlayProps["engineRuntime"]["webGpuCanvasStage"], mounted: boolean) =>
      view.rerender(<StudioBg3dViewportReadinessOverlay {...props} engineRuntime={{ ...props.engineRuntime, webGpuCanvasStage: stage }} modelRenderer={mounted ? {} : null} />),
    moduleReady: () => view.rerender(<StudioBg3dViewportReadinessOverlay {...props}
      engineRuntime={{ ...props.engineRuntime, glFactory: vi.fn() }} modelRenderer={null} />),
    ready: () => view.rerender(<StudioBg3dViewportReadinessOverlay {...props} engineRuntime={{ ...props.engineRuntime, webGpuCanvasStage: "rendered" }} modelRenderer={{}} />) };
}

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("3D 배경 렌더러 초기화 시간", () => {
  it("엔진 파일을 받은 뒤에도 첫 프레임이 늦으면 장면을 유지하고 직접 선택한 엔진만 전환한다", () => {
    vi.useFakeTimers();
    const gpu = openViewport("webgpu", true);
    act(() => vi.advanceTimersByTime(19_000));
    expect(gpu.reportRendererFailure).not.toHaveBeenCalled();
    gpu.moduleReady();
    act(() => vi.advanceTimersByTime(15_999));
    expect(gpu.reportRendererFailure).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(gpu.reportRendererFailure).not.toHaveBeenCalled();
    fireEvent.click(gpu.view.getByRole("button", { name: "WebGL2로 계속" }));
    expect(gpu.setPreference).toHaveBeenCalledWith("webgl2");
  });

  it("다른 캔버스의 WebGPU 오류로 배경 장면의 초기화를 중단하지 않는다", () => {
    const gpu = openViewport("webgpu");
    const unrelated = new ErrorEvent("error", { message: "WebGPU preview failed", cancelable: true });
    act(() => { window.dispatchEvent(unrelated); });
    expect(gpu.reportRendererFailure).not.toHaveBeenCalled();
    expect(unrelated.defaultPrevented).toBe(false);
  });

  it("6초 뒤에 완료된 WebGPU 장치를 표시하고 남은 감시 타이머를 해제한다", () => {
    vi.useFakeTimers();
    const gpu = openViewport("webgpu");
    act(() => vi.advanceTimersByTime(7_000));
    expect(gpu.reportRendererFailure).not.toHaveBeenCalled();
    gpu.ready();
    act(() => vi.advanceTimersByTime(20_000));
    expect(gpu.reportRendererFailure).not.toHaveBeenCalled();
  });

  it("장치 초기화가 끝나고 장면이 Suspense에 머물러도 첫 프레임을 기다린다", () => {
    vi.useFakeTimers();
    const gpu = openViewport("webgpu");
    gpu.stage("waiting-for-frame", true);
    act(() => vi.advanceTimersByTime(60_000));
    expect(gpu.reportRendererFailure).not.toHaveBeenCalled();
    expect(gpu.view.getByText("장면의 첫 화면을 그리고 있습니다…")).toBeTruthy();
    gpu.ready();
    expect(gpu.view.queryByRole("status")).toBeNull();
  });

  it("WebGL2의 컨텍스트 생성이 멈추면 기존 제한 시간 뒤 복구 화면을 연다",
    () => {
      const backend = "webgl2", timeout = 6_000;
      vi.useFakeTimers();
      const viewport = openViewport(backend);
      act(() => vi.advanceTimersByTime(timeout - 1));
      expect(viewport.reportRendererFailure).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(viewport.reportRendererFailure).toHaveBeenCalledWith(backend, expect.stringContaining("초기화"));
    },
  );
});
