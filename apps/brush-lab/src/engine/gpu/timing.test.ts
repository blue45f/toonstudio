import { describe, expect, it } from "vitest";

import { createMockGpu } from "./testing/mock-gpu-device";
import { GpuTimer, TIMER_RING_FRAMES, timingSourceFor } from "./timing";

import type { Clock } from "../core/types";

function fakeClock(step = 2): Clock {
  let t = 0;
  return {
    now: () => {
      t += step;
      return t;
    },
  };
}

describe("gpu/timing GpuTimer", () => {
  it("timestamp-query: pass에 begin/end 인덱스를 쓰고 resolve 합산이 ns→ms로 나온다", async () => {
    const gpu = createMockGpu({ features: ["timestamp-query"], timestampsNs: [1_000_000n, 3_500_000n] });
    const timer = new GpuTimer(gpu.device, true, fakeClock());
    expect(timer.source).toBe("timestamp-query");
    expect(gpu.querySets).toEqual([{ label: "sumi-timestamps", count: TIMER_RING_FRAMES * 2, type: "timestamp" }]);
    for (let f = 0; f < 3; f += 1) {
      const tw = timer.passTimestamps();
      expect(tw).toMatchObject({ beginningOfPassWriteIndex: f * 2, endOfPassWriteIndex: f * 2 + 1 });
      const encoder = gpu.device.createCommandEncoder();
      timer.endFrame(encoder);
      gpu.device.queue.submit([encoder.finish()]);
      timer.afterSubmit();
    }
    expect(gpu.resolves.length).toBe(3);
    const flush = gpu.device.createCommandEncoder();
    timer.flushPartial(flush);
    // 스테이징 map은 복사를 담은 encoder를 submit한 뒤에만 시작한다(submit 전 map = command buffer 무효).
    expect(gpu.calls.filter((c) => c === "buffer.mapAsync")).toEqual([]);
    gpu.device.queue.submit([flush.finish()]);
    timer.startPendingMaps();
    const lastSubmit = gpu.calls.lastIndexOf("queue.submit");
    expect(gpu.calls.indexOf("buffer.mapAsync")).toBeGreaterThan(lastSubmit);
    const result = await timer.resolve();
    expect(result.source).toBe("timestamp-query");
    expect(result.framesMeasured).toBe(3);
    expect(result.gpuTimeMs).toBeCloseTo(3 * 2.5, 6);
    expect(gpu.calls.filter((c) => c === "queue.onSubmittedWorkDone")).toEqual([]);
    timer.dispose();
    expect(gpu.calls).toContain("querySet.destroy");
  });

  it("timestamp-query: 링이 가득 차면 자동으로 플러시한다", async () => {
    const gpu = createMockGpu({ timestampsNs: [0n, 1_000_000n] });
    const timer = new GpuTimer(gpu.device, true, null);
    for (let f = 0; f < TIMER_RING_FRAMES; f += 1) {
      timer.passTimestamps();
      const encoder = gpu.device.createCommandEncoder();
      timer.endFrame(encoder);
      gpu.device.queue.submit([encoder.finish()]);
      timer.afterSubmit();
    }
    const result = await timer.resolve();
    expect(result.framesMeasured).toBe(TIMER_RING_FRAMES);
    expect(result.gpuTimeMs).toBeCloseTo(TIMER_RING_FRAMES, 6);
    expect(gpu.copies.filter((c) => c.to === "sumi-timestamp-staging").length).toBe(1);
  });

  it("abandon: 버려진 획의 비동기 측정은 다음 획 합산에 섞이지 않고 링 슬롯도 경계로 건너뛴다", async () => {
    const gpu = createMockGpu({ features: ["timestamp-query"], timestampsNs: [0n, 2_000_000n] });
    const timer = new GpuTimer(gpu.device, true, null);
    // 획 A: 3프레임을 내고 링이 가득 차기 전에 abort(= abandon). 슬롯 3개가 링에 남는다.
    for (let f = 0; f < 3; f += 1) {
      timer.passTimestamps();
      const encoder = gpu.device.createCommandEncoder();
      timer.endFrame(encoder);
      gpu.device.queue.submit([encoder.finish()]);
      timer.afterSubmit();
    }
    timer.abandon();
    // 획 B: 2프레임. 다음 flushPartial은 슬롯 0부터 2개만 복사해야 한다(A의 3개가 섞이면 5가 된다).
    expect(timer.passTimestamps()).toMatchObject({ beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 });
    for (let f = 0; f < 2; f += 1) {
      const encoder = gpu.device.createCommandEncoder();
      timer.endFrame(encoder);
      gpu.device.queue.submit([encoder.finish()]);
      timer.afterSubmit();
      timer.passTimestamps();
    }
    const flush = gpu.device.createCommandEncoder();
    timer.flushPartial(flush);
    gpu.device.queue.submit([flush.finish()]);
    timer.startPendingMaps();
    const result = await timer.resolve();
    expect(result.framesMeasured).toBe(2);
    expect(result.gpuTimeMs).toBeCloseTo(4, 6);
    timer.dispose();
  });

  it("abandon: submitted-work-done 측정 중이던 획의 결과도 버린다", async () => {
    const gpu = createMockGpu();
    const timer = new GpuTimer(gpu.device, false, fakeClock(3));
    const encoder = gpu.device.createCommandEncoder();
    timer.endFrame(encoder);
    gpu.device.queue.submit([encoder.finish()]);
    timer.afterSubmit();
    timer.abandon();
    const result = await timer.resolve();
    expect(result).toMatchObject({ gpuTimeMs: null, framesMeasured: 0 });
    timer.dispose();
  });

  it("timestamp 없음 + 시계 있음: submitted-work-done으로 시계 차이를 합산한다", async () => {
    const gpu = createMockGpu();
    const timer = new GpuTimer(gpu.device, false, fakeClock(3));
    expect(timer.source).toBe("submitted-work-done");
    expect(timer.passTimestamps()).toBeUndefined();
    const encoder = gpu.device.createCommandEncoder();
    timer.endFrame(encoder);
    gpu.device.queue.submit([encoder.finish()]);
    timer.afterSubmit();
    timer.afterSubmit();
    const result = await timer.resolve();
    expect(result.source).toBe("submitted-work-done");
    expect(result.framesMeasured).toBe(2);
    // 제출 시각 t0 = 3, 6 이 먼저 찍히고 onSubmittedWorkDone 콜백(마이크로태스크)이 9, 12에 돌아 (9−3) + (12−6) = 12.
    expect(result.gpuTimeMs).toBe(12);
    expect(gpu.querySets).toEqual([]);
  });

  it("둘 다 없으면 unavailable·null", async () => {
    const gpu = createMockGpu();
    const timer = new GpuTimer(gpu.device, false, null);
    expect(timer.source).toBe("unavailable");
    timer.afterSubmit();
    const result = await timer.resolve();
    expect(result).toEqual({ gpuTimeMs: null, source: "unavailable", framesMeasured: 0 });
  });

  it("측정 프레임이 없으면 timestamp-query여도 null", async () => {
    const gpu = createMockGpu();
    const timer = new GpuTimer(gpu.device, true, null);
    expect(await timer.resolve()).toEqual({ gpuTimeMs: null, source: "timestamp-query", framesMeasured: 0 });
  });

  it("timingSourceFor는 GpuTimer와 같은 규칙", () => {
    expect(timingSourceFor(new Set(["timestamp-query"]), null)).toBe("timestamp-query");
    expect(timingSourceFor(new Set(), fakeClock())).toBe("submitted-work-done");
    expect(timingSourceFor(new Set(), null)).toBe("unavailable");
  });
});
