import { describe, expect, it, vi } from "vitest";
import { WasmRendererWorkerPool } from "./wasm-worker-slab-pool";
import { TOKENS_PER_KV_PAGE, WebGpuVramKvPager } from "./webgpu-llm-vram-pager";

describe("렌더 워커의 작업 수명", () => {
  it("시간을 넘긴 워커의 슬롯을 완료까지 보유하고 새 세대에서 제출 당시 입력으로 재시도한다", async () => {
    vi.useFakeTimers();
    try {
      const finish = Promise.withResolvers<void>();
      const offsets: number[] = [];
      const pool = new WasmRendererWorkerPool({
        workerCount: 1,
        taskTimeoutMs: 20,
        arenaSlotsPerClass: 2,
        createWorker: (workerId, generation) => ({
          workerId,
          generation,
          async executeDescriptor(descriptor, bytes) {
            offsets.push(descriptor.byteOffset);
            if (generation === 1) await finish.promise;
            return { outputChecksum: bytes[descriptor.byteOffset] ?? 0 };
          },
        }),
      });

      const payload = Uint8Array.of(7);
      const first = pool.submitTileTask({ taskId: 1, priority: "interactive", payload });
      payload.fill(8);
      await vi.advanceTimersByTimeAsync(20);
      await expect(first).resolves.toMatchObject({ workerGeneration: 2, outputChecksum: 7 });
      expect(offsets).toHaveLength(2);
      expect(offsets[0]).not.toBe(offsets[1]);
      expect(pool.getTelemetry().slab.activeAllocations).toBe(1);
      await expect(pool.submitTileTask({ taskId: 2, priority: "background", payload }))
        .resolves.toMatchObject({ outputChecksum: 8 });
      finish.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(pool.getTelemetry().slab.activeAllocations).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

const MiB = 1024 * 1024;
function makePager(physicalPages: number) {
  return new WebGpuVramKvPager({
    vramCapBytes: 1536 * MiB,
    modelWeightsBytes: (1536 - 16 - physicalPages) * MiB,
    activationScratchBytes: 16 * MiB,
    numLayers: 2,
    recentWindowPages: 2,
  });
}

describe("어텐션 단계의 VRAM 페이지", () => {
  it("회상 페이지와 최근 페이지를 모든 레이어에 동시에 유지한다", () => {
    const pager = makePager(8);
    const tokens = 10 * TOKENS_PER_KV_PAGE;
    pager.appendTokens("episode", 0, tokens);
    const pages = pager.ensureAttentionStepResident("episode", tokens, [2]);
    expect(pages).toEqual([0, 2, 8, 9]);
    for (const page of pages) {
      for (let layer = 0; layer < pager.numLayers; layer += 1) {
        expect(pager.getPageEntry("episode", layer, page)?.residency).toBe("vram");
      }
    }
  });

  it("다른 시퀀스의 고정 페이지까지 합쳐 예산을 넘으면 스왑 전에 거절한다", () => {
    const pager = makePager(8);
    const tokens = 10 * TOKENS_PER_KV_PAGE;
    pager.appendTokens("reference", 0, 1);
    pager.appendTokens("episode", 0, tokens);
    const before = pager.getTelemetry();
    expect(() => pager.ensureAttentionStepResident("episode", tokens, [2])).toThrow(RangeError);
    expect(pager.getTelemetry()).toMatchObject({
      swapInCount: before.swapInCount,
      swapOutCount: before.swapOutCount,
      oomEvents: before.oomEvents + 1,
    });
  });
});
