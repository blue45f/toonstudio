// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { StudioWorkAssetHydrator } from "../../studio-work-asset-hydrator";
import { useStudioHydrationRuntime } from "./useStudioHydrationRuntime";

afterEach(() => { vi.restoreAllMocks(); });

it("같은 원고의 StrictMode 재설정 동안 작품 리소스를 유지하고 실제 이탈 때 한 번 해제한다", async () => {
  const dispose = vi.spyOn(StudioWorkAssetHydrator.prototype, "dispose");
  const { result, unmount } = renderHook(useStudioHydrationRuntime, { wrapper: StrictMode });
  await act(async () => { await Promise.resolve(); });
  expect(dispose).not.toHaveBeenCalled();
  const hydrator = result.current.studioWorkAssetHydrator;
  const notified = vi.fn();
  const release = hydrator.subscribe(notified);
  act(() => hydrator.setWorkId("work-a"));
  expect(notified).toHaveBeenCalled();
  release();
  unmount();
  await Promise.resolve();
  expect(dispose).toHaveBeenCalledTimes(1);
});
