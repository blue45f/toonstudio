import { describe, expect, it, vi } from "vitest";

import {
  applyCanvasShaperViewPreset,
  getCanvasCameraInputStyle,
  registerCanvasViewportControls,
  setCanvasCameraInputStyle,
} from "./viewport-controls";

const canvasIdentity = (): HTMLCanvasElement => ({}) as HTMLCanvasElement;

describe("엔진 독립 캔버스 제어 포트", () => {
  it("연결 전에는 기본 unity 스타일이며 시점 요청은 처리되지 않는다", () => {
    const canvas = canvasIdentity();
    expect(getCanvasCameraInputStyle(canvas)).toBe("unity");
    expect(applyCanvasShaperViewPreset(canvas, "front")).toBe(false);
  });

  it("정면·좌측·상단을 현재 소유자에게 전달하고 입력 설정은 엔진 해제 뒤에도 유지한다", () => {
    const canvas = canvasIdentity();
    const applyViewPreset = vi.fn();
    const detach = vi.fn();
    setCanvasCameraInputStyle(canvas, "blender");
    const release = registerCanvasViewportControls(canvas, { applyViewPreset, detach });
    for (const view of ["front", "left", "top"] as const) {
      expect(applyCanvasShaperViewPreset(canvas, view)).toBe(true);
    }
    expect(applyViewPreset.mock.calls).toEqual([["front"], ["left"], ["top"]]);
    release();
    release();
    expect(detach).toHaveBeenCalledTimes(1);
    expect(applyCanvasShaperViewPreset(canvas, "front")).toBe(false);
    expect(getCanvasCameraInputStyle(canvas)).toBe("blender");
  });

  it("중복 등록은 이전 소유자를 한 번 해제하고 오래된 cleanup이 새 등록을 지우지 않는다", () => {
    const canvas = canvasIdentity();
    const previous = { applyViewPreset: vi.fn(), detach: vi.fn() };
    const current = { applyViewPreset: vi.fn(), detach: vi.fn() };
    const releasePrevious = registerCanvasViewportControls(canvas, previous);
    const releaseCurrent = registerCanvasViewportControls(canvas, current);
    expect(previous.detach).toHaveBeenCalledTimes(1);
    releasePrevious();
    expect(applyCanvasShaperViewPreset(canvas, "left")).toBe(true);
    expect(previous.applyViewPreset).not.toHaveBeenCalled();
    expect(current.applyViewPreset).toHaveBeenCalledWith("left");
    releaseCurrent();
    expect(current.detach).toHaveBeenCalledTimes(1);
  });

  it("같은 포트 객체를 다시 등록해도 오래된 해제로 새 수명이 끝나지 않는다", () => {
    const canvas = canvasIdentity();
    const controls = { applyViewPreset: vi.fn(), detach: vi.fn() };
    const releasePrevious = registerCanvasViewportControls(canvas, controls);
    const releaseCurrent = registerCanvasViewportControls(canvas, controls);
    releasePrevious();
    expect(applyCanvasShaperViewPreset(canvas, "top")).toBe(true);
    expect(controls.detach).toHaveBeenCalledTimes(1);
    releaseCurrent();
    expect(controls.detach).toHaveBeenCalledTimes(2);
  });
});
