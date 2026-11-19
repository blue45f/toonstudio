import { describe, expect, it, vi } from "vitest";

import {
  createStudioImageFilterResidentWorkerSession,
  createStudioImageFilterWorkerSession,
  runStudioImageFilterWorker,
  type StudioImageFilterWorkerLike,
} from "../studio-image-filter-worker-client";
import type { StudioImageFilterWorkerResponseMessage } from "../studio-image-filter-worker-protocol";

describe("이미지 필터의 첫 엔진 응답", () => {
  it.each(["단일", "연속", "원본 상주"] as const)("%s 요청은 늦게 도착한 준비 응답을 한 번 처리하고 취소할 수 있다", async mode => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const postMessage = vi.fn();
    const terminate = vi.fn();
    const worker: StudioImageFilterWorkerLike = { onmessage: null, onerror: null, postMessage, terminate };
    const workerFactory = () => worker;
    const session = mode === "연속" ? createStudioImageFilterWorkerSession({ workerFactory })
      : mode === "원본 상주" ? createStudioImageFilterResidentWorkerSession({ workerFactory }) : null;
    try {
      const request = { imageData: { width: 1, height: 1, data: new Uint8ClampedArray(4) }, el: {} };
      const runOptions = { signal: controller.signal, sourceRevision: 1 };
      const pending = session
        ? session.run(request, runOptions)
        : runStudioImageFilterWorker(request, { signal: controller.signal, workerFactory });
      const outcome = pending.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(4_500);
      expect(terminate).not.toHaveBeenCalled();
      expect(postMessage).not.toHaveBeenCalled();
      const ready = new MessageEvent<StudioImageFilterWorkerResponseMessage>("message", {
        data: { type: "studio-image-filter/ready", version: 1 },
      });
      worker.onmessage?.(ready);
      worker.onmessage?.(ready);
      expect(postMessage).toHaveBeenCalledTimes(1);
      expect(postMessage.mock.calls[0]?.[0].type).toBe(mode === "원본 상주" ? "studio-image-filter/load-source" : "studio-image-filter/run");
      controller.abort();
      await expect(outcome).resolves.toMatchObject({ name: "AbortError" });
    } finally {
      controller.abort();
      session?.dispose();
      vi.useRealTimers();
    }
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});
