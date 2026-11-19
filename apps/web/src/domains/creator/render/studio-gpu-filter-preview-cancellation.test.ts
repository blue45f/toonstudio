import { expect, it, vi } from "vitest";

import { presentGpuFilterChain } from "./studio-gpu-filter-apply";

const image = { data: new Uint8ClampedArray([55, 80, 105, 255]), width: 1, height: 1 };

it.each(["닫기", "슬라이더 재조정", "현재 요청"] as const)("필터 미리보기 %s의 실패 알림은 요청 소유권을 따른다", async action => {
  const controller = new AbortController();
  let revision = 1;
  const onFailure = vi.fn();
  const pending = presentGpuFilterChain(image, { brightness: 0.2 }, {
    gpu: null,
    signal: controller.signal,
    sourceRevision: revision,
    isSourceRevisionCurrent: captured => captured === revision,
    onFailure,
  });
  if (action === "닫기") controller.abort();
  if (action === "슬라이더 재조정") revision++;
  await expect(pending).resolves.toBeNull();
  if (action === "현재 요청") {
    expect(onFailure).toHaveBeenCalledExactlyOnceWith({ phase: "compute", message: "The WebGPU filter compute chain was unavailable." });
  } else {
    expect(onFailure).not.toHaveBeenCalled();
  }
});
