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
    engineRuntime: { phase: "ready" as const, plan, canvasKey: backend, glFactory: downloading ? null : vi.fn(), canvasStage: "waiting-for-canvas" as const, setPreference, reportRendererFailure },
    onClearModelRenderer: vi.fn(),
    isRestoringScene: false,
    viewportHostRef: { current: host },
  };
  const view = render(<StudioBg3dViewportReadinessOverlay {...props} modelRenderer={null} />);
  return { reportRendererFailure, setPreference, view, host,
    stage: (stage: StudioBg3dViewportReadinessOverlayProps["engineRuntime"]["canvasStage"], mounted: boolean) =>
      view.rerender(<StudioBg3dViewportReadinessOverlay {...props} engineRuntime={{ ...props.engineRuntime, canvasStage: stage }} modelRenderer={mounted ? {} : null} />),
    moduleReady: () => view.rerender(<StudioBg3dViewportReadinessOverlay {...props}
      engineRuntime={{ ...props.engineRuntime, glFactory: vi.fn() }} modelRenderer={null} />),
    ready: () => view.rerender(<StudioBg3dViewportReadinessOverlay {...props} engineRuntime={{ ...props.engineRuntime, canvasStage: "rendered" }} modelRenderer={{}} />) };
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

  it("WebGL2가 6초 넘게 걸리면 캔버스를 유지하고 수동 재시도를 제공한다", () => {
    vi.useFakeTimers();
    const viewport = openViewport("webgl2");
    act(() => vi.advanceTimersByTime(6_000));
    fireEvent.click(viewport.view.getByRole("button", { name: "WebGL2 다시 시도" }));
    expect(viewport.setPreference).toHaveBeenCalledWith("webgl2", true);
    viewport.stage("waiting-for-frame", true);
    act(() => vi.advanceTimersByTime(40_000));
    expect(viewport.view.getByText("장면의 첫 화면을 그리고 있습니다…")).toBeTruthy();
    viewport.ready();
    act(() => vi.advanceTimersByTime(90_000));
    expect(viewport.reportRendererFailure).not.toHaveBeenCalled();
    expect(viewport.view.queryByRole("status")).toBeNull();
  });

  it("엔진 마운트 이후에도 첫 화면이 90초 안에 제출되지 않으면 복구 화면을 연다", () => {
    vi.useFakeTimers();
    const viewport = openViewport("webgl2");
    act(() => vi.advanceTimersByTime(10_000));
    viewport.stage("waiting-for-frame", true);
    act(() => vi.advanceTimersByTime(79_999));
    expect(viewport.reportRendererFailure).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(viewport.reportRendererFailure).toHaveBeenCalledWith("webgl2", expect.stringContaining("첫 화면"));
  });

  it("네이티브 컨텍스트 생성 오류는 느린 시작으로 취급하지 않고 즉시 알린다", () => {
    const viewport = openViewport("webgl2");
    act(() => { viewport.host.dispatchEvent(new Event("webglcontextcreationerror")); });
    expect(viewport.reportRendererFailure).toHaveBeenCalledWith("webgl2", expect.stringContaining("컨텍스트"));
  });
});
