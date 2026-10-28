// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { applyCanvasShaperViewPreset, getCanvasCameraInputStyle, registerCanvasCameraInputTarget, setCanvasCameraInputStyle } from "./viewport-input-style";

describe("뷰포트 카메라 입력 연결", () => {
  it("캔버스별 조작 방식을 보존하고 연결된 실제 카메라에 시점 각도를 적용한다", () => {
    const canvas = document.createElement("canvas");
    const camera = { alpha: 0, beta: 0, lowerBetaLimit: 0.2 };
    expect(getCanvasCameraInputStyle(canvas)).toBe("unity");
    expect(applyCanvasShaperViewPreset(canvas, "front")).toBe(false);
    setCanvasCameraInputStyle(canvas, "blender");
    expect(getCanvasCameraInputStyle(canvas)).toBe("blender");
    expect(getCanvasCameraInputStyle(document.createElement("canvas"))).toBe("unity");
    const detach = registerCanvasCameraInputTarget(canvas, camera);
    expect(applyCanvasShaperViewPreset(canvas, "front")).toBe(true);
    expect(camera).toMatchObject({ alpha: Math.PI / 2, beta: Math.PI / 2 });
    applyCanvasShaperViewPreset(canvas, "left");
    expect(camera.alpha).toBe(Math.PI);
    applyCanvasShaperViewPreset(canvas, "top");
    expect(camera.beta).toBe(0.2);
    detach();
    expect(applyCanvasShaperViewPreset(canvas, "front")).toBe(false);
  });

  it("이전 연결을 해제해도 새 카메라 연결은 보존하며 상단 기본 한계를 쓴다", () => {
    const canvas = document.createElement("canvas");
    const previous = { alpha: 0, beta: 0, lowerBetaLimit: null };
    const current = { alpha: 0, beta: 0, lowerBetaLimit: null };
    const detachPrevious = registerCanvasCameraInputTarget(canvas, previous);
    const detachCurrent = registerCanvasCameraInputTarget(canvas, current);
    detachPrevious();
    expect(applyCanvasShaperViewPreset(canvas, "top")).toBe(true);
    expect(current).toMatchObject({ alpha: Math.PI / 2, beta: 0.08 });
    expect(previous.beta).toBe(0);
    detachCurrent();
  });
});
