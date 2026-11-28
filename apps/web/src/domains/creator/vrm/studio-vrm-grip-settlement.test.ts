import { expect, it, vi } from "vitest";

import { createStudioVrmGripSettlement, pendingStudioVrmGripSettlement, waitForStudioVrmGripSettlement } from "./studio-vrm-grip-settlement";

import type { VRM } from "@pixiv/three-vrm";

it("소품이 준비된 프레임에서 캡처를 재개하고 취소·세대 교체는 대기 중인 캡처에 알린다", async () => {
  const vrm = {} as VRM, invalidate = vi.fn();
  expect(pendingStudioVrmGripSettlement(vrm)).toBeUndefined();
  await waitForStudioVrmGripSettlement(vrm);
  const first = createStudioVrmGripSettlement(vrm, invalidate);
  const abort = new AbortController();
  const cancelled = waitForStudioVrmGripSettlement(vrm, abort.signal);
  const completed = waitForStudioVrmGripSettlement(vrm);
  abort.abort();
  await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
  expect(invalidate).toHaveBeenCalledTimes(2);
  first.ready(true);
  await completed;
  expect(pendingStudioVrmGripSettlement(vrm)).toBeUndefined();
  first.ready(false);
  const previous = waitForStudioVrmGripSettlement(vrm);
  first.dispose();
  await expect(previous).rejects.toMatchObject({ name: "AbortError" });
  const next = createStudioVrmGripSettlement(vrm, invalidate);
  const restored = waitForStudioVrmGripSettlement(vrm);
  next.ready(true);
  await restored;
  next.dispose();
  await expect(waitForStudioVrmGripSettlement(vrm, abort.signal)).rejects.toMatchObject({ name: "AbortError" });
});
