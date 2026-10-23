// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { getStudioCanvasCapture, resetStudioCanvasCaptureForTests } from "./claude-canvas-capture-registry";
import { useStudioRasterExportOrchestration } from "../../useStudioRasterExportOrchestration";

describe("내보내기 훅 → Claude 보조 캔버스 캡처 등록", () => {
  afterEach(() => {
    cleanup();
    resetStudioCanvasCaptureForTests();
  });

  it("에디터가 켜져 있는 동안만 캡처 함수를 건네고, 꺼지면 거둔다", () => {
    expect(getStudioCanvasCapture()).toBeNull();

    const { unmount } = renderHook(() => useStudioRasterExportOrchestration({} as never));
    expect(getStudioCanvasCapture()).not.toBeNull();

    unmount();
    expect(getStudioCanvasCapture()).toBeNull();
  });

  it("다시 그려져도 등록은 그대로고(한 번만), 늘 같은 함수가 최신 컨트롤러를 쓴다", () => {
    const { rerender } = renderHook(() => useStudioRasterExportOrchestration({} as never));
    const first = getStudioCanvasCapture();

    rerender();

    expect(getStudioCanvasCapture()).toBe(first);
  });
});
