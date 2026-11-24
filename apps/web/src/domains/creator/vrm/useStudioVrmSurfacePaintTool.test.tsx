/** @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { expect, it, vi } from "vitest";

import { StudioVrmSurfacePaintTool } from "./studio-vrm-surface-paint-tool";
import { useStudioVrmSurfacePaintTool } from "./useStudioVrmSurfacePaintTool";

it("뷰포트가 다시 연결되면 새 표면 브러시를 연결하고 해제된 브러시를 다시 쓰지 않는다", () => {
  const dispose = vi.spyOn(StudioVrmSurfacePaintTool.prototype, "dispose");
  const listener = { current: vi.fn() };
  try {
    const { result, unmount } = renderHook(() => useStudioVrmSurfacePaintTool(listener), { wrapper: StrictMode });
    const activeTool = result.current.current;
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(activeTool).toBeInstanceOf(StudioVrmSurfacePaintTool);
    expect(dispose.mock.contexts[0]).not.toBe(activeTool);
    unmount();
    expect(dispose.mock.contexts[1]).toBe(activeTool);
    expect(result.current.current).toBeNull();
    expect(listener.current).toHaveBeenLastCalledWith(null);
  } finally {
    dispose.mockRestore();
  }
});
