// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { useStudioCanvasOnlyViewport } from "./useStudioCanvasOnlyViewport";

afterEach(cleanup);

function useViewport(isMobile: boolean) {
  const [canvasOnlyMode, setCanvasOnlyMode] = useState(false);
  const [maximized, setMaximized] = useState(false);
  useStudioCanvasOnlyViewport({ isMobile, mobileImmersive: isMobile, maximized, canvasOnlyMode, setMaximized, setCanvasOnlyMode });
  return { canvasOnlyMode, setCanvasOnlyMode };
}
it("모바일의 명시적 진입·복원은 유지하고 데스크톱에서 모바일 경계로 이동하면 기존 모바일 편집기를 복원한다", () => {
  const { result, rerender, unmount } = renderHook(useViewport, { initialProps: false });
  act(() => result.current.setCanvasOnlyMode(true));
  expect(document.documentElement.dataset.studioCanvasOnly).toBe("true");
  rerender(true);
  expect(result.current.canvasOnlyMode).toBe(false);
  expect(document.documentElement.dataset.studioCanvasOnly).toBeUndefined();
  act(() => result.current.setCanvasOnlyMode(true));
  expect(result.current.canvasOnlyMode).toBe(true);
  expect(document.documentElement.dataset.studioCanvasOnly).toBe("true");
  act(() => result.current.setCanvasOnlyMode(false));
  expect(document.documentElement.dataset.studioMobileImmersive).toBe("true");
  expect(document.documentElement.dataset.studioCanvasOnly).toBeUndefined();
  unmount();
  expect(document.documentElement.dataset.studioMobileImmersive).toBeUndefined();
});
