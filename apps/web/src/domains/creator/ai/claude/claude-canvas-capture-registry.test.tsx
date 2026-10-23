// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getStudioCanvasCapture,
  installStudioCanvasCapture,
  resetStudioCanvasCaptureForTests,
  useStudioCanvasCaptureAvailable,
} from "./claude-canvas-capture-registry";

describe("스튜디오 캔버스 캡처 저장소", () => {
  afterEach(() => {
    cleanup();
    resetStudioCanvasCaptureForTests();
  });

  it("등록하면 가져올 수 있고, 등록을 풀면 사라진다", () => {
    const capture = vi.fn();
    expect(getStudioCanvasCapture()).toBeNull();

    const uninstall = installStudioCanvasCapture(capture);
    expect(getStudioCanvasCapture()).toBe(capture);
    uninstall();

    expect(getStudioCanvasCapture()).toBeNull();
  });

  it("먼저 등록한 쪽의 정리가 나중에 등록된 함수를 지우지 않는다(다시 마운트되는 에디터)", () => {
    const first = vi.fn();
    const second = vi.fn();
    const uninstallFirst = installStudioCanvasCapture(first);
    const uninstallSecond = installStudioCanvasCapture(second);

    uninstallFirst();
    expect(getStudioCanvasCapture()).toBe(second);
    uninstallSecond();
    expect(getStudioCanvasCapture()).toBeNull();
  });

  it("화면은 등록과 해제를 따라 가능 여부를 바꾼다", () => {
    const { result } = renderHook(() => useStudioCanvasCaptureAvailable());
    expect(result.current).toBe(false);

    let uninstall: () => void = () => undefined;
    act(() => { uninstall = installStudioCanvasCapture(vi.fn()); });
    expect(result.current).toBe(true);

    act(() => uninstall());
    expect(result.current).toBe(false);
  });
});
