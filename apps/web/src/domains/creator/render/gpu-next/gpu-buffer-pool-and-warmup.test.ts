import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_GPU_NEXT_WARMUP_TASKS,
  GPU_NEXT_BUFFER_USAGE,
  GpuBufferPool,
  GpuPipelineWarmupQueue,
  computePowerOfTwoBucket,
  type GpuNextBufferDeviceLike,
  type GpuNextBufferLike,
  type GpuNextComputePipelineLike,
  type GpuNextPipelineDeviceLike,
  type GpuWarmupIdleDeadline,
  type GpuWarmupIdleScheduler,
} from "./gpu-buffer-pool-and-warmup";

interface FakeGpuBuffer extends GpuNextBufferLike {
  readonly id: number;
  destroyed: boolean;
}

function createFakeBufferDevice(): {
  readonly device: GpuNextBufferDeviceLike;
  readonly created: FakeGpuBuffer[];
} {
  const created: FakeGpuBuffer[] = [];
  let nextId = 1;
  const device: GpuNextBufferDeviceLike = {
    createBuffer(descriptor) {
      const buf: FakeGpuBuffer = {
        id: nextId++,
        size: descriptor.size,
        usage: descriptor.usage,
        label: descriptor.label,
        destroyed: false,
        destroy() {
          buf.destroyed = true;
        },
      };
      created.push(buf);
      return buf;
    },
  };
  return { device, created };
}

function createManualIdleScheduler() {
  let nextHandle = 1;
  const queue = new Map<number, (deadline: GpuWarmupIdleDeadline) => void>();
  const cancelled: number[] = [];

  const scheduler: GpuWarmupIdleScheduler = {
    requestIdle(callback) {
      const handle = nextHandle++;
      queue.set(handle, callback);
      return handle;
    },
    cancelIdle(handle) {
      cancelled.push(handle);
      queue.delete(handle);
    },
  };

  const runNext = async (remainingMs: number, didTimeout = false): Promise<boolean> => {
    const first = queue.entries().next();
    if (first.done) return false;
    const [handle, cb] = first.value;
    queue.delete(handle);
    cb({
      didTimeout,
      timeRemaining: () => remainingMs,
    });
    // 비동기 createComputePipelineAsync 후속 마이크로태스크 해소.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    return true;
  };

  return { scheduler, queue, cancelled, runNext };
}

describe("computePowerOfTwoBucket", () => {
  it("최소 4바이트 정렬과 2의 거듭제곱 버킷 올림을 보장한다", () => {
    expect(computePowerOfTwoBucket(1, 256)).toBe(256);
    expect(computePowerOfTwoBucket(256, 256)).toBe(256);
    expect(computePowerOfTwoBucket(257, 256)).toBe(512);
    expect(computePowerOfTwoBucket(1000, 256)).toBe(1024);
    expect(computePowerOfTwoBucket(16, 4)).toBe(16);
    expect(computePowerOfTwoBucket(17, 4)).toBe(32);
    expect(computePowerOfTwoBucket(Number.NaN, 256)).toBe(256);
  });
});

describe("GpuBufferPool", () => {
  it("반복 대여·반납 시 2의 거듭제곱 버킷 재사용률(hitRate)을 높이고 usage 플래그를 격리한다", () => {
    const { device, created } = createFakeBufferDevice();
    const pool = new GpuBufferPool<FakeGpuBuffer>({ minGpuBucketBytes: 256 });

    const usageStorage = GPU_NEXT_BUFFER_USAGE.STORAGE | GPU_NEXT_BUFFER_USAGE.COPY_DST;
    const usageUniform = GPU_NEXT_BUFFER_USAGE.UNIFORM | GPU_NEXT_BUFFER_USAGE.COPY_DST;

    // 첫 1회만 생성하고 이후 19회 반복 대여는 모두 100% 캐시 히트.
    for (let i = 0; i < 20; i += 1) {
      const h = pool.acquireGpuBuffer(device, 300 + (i % 100), usageStorage);
      expect(h.bucketBytes).toBe(512);
      expect(h.reused).toBe(i > 0);
      h.release();
    }

    // 동일 크기라도 usage 플래그가 다르면 별도 버킷으로 생성한다.
    const u = pool.acquireGpuBuffer(device, 300, usageUniform);
    expect(u.reused).toBe(false);
    u.release();

    expect(created).toHaveLength(2);
    const metrics = pool.getMetrics();
    expect(metrics.gpuAcquires).toBe(21);
    expect(metrics.gpuHits).toBe(19);
    expect(metrics.gpuHitRate).toBeGreaterThan(0.9);
    expect(metrics.gpuActiveCount).toBe(0);
    expect(metrics.gpuIdleCount).toBe(2);

    pool.dispose();
    expect(pool.getMetrics().leakedGpuBuffers).toBe(0);
    expect(created.every((b) => b.destroyed)).toBe(true);
  });

  it("메모리 상한 초과 시 전역 LRU 순서로 유휴 버퍼를 회수하고 즉시 destroy한다", () => {
    let clock = 1000;
    const { device } = createFakeBufferDevice();
    const pool = new GpuBufferPool<FakeGpuBuffer>({
      maxPooledGpuBytes: 1024,
      minGpuBucketBytes: 256,
      now: () => clock,
    });
    const usage = GPU_NEXT_BUFFER_USAGE.STORAGE;

    const a = pool.acquireGpuBuffer(device, 512, usage, "a");
    const b = pool.acquireGpuBuffer(device, 512, usage, "b");
    const c = pool.acquireGpuBuffer(device, 512, usage, "c");

    clock = 1010;
    a.release(); // 가장 오래된 유휴 버퍼(LRU 1순위)
    clock = 1020;
    b.release(); // 총 1024B == 상한
    expect(a.buffer.destroyed).toBe(false);
    expect(b.buffer.destroyed).toBe(false);

    clock = 1030;
    c.release(); // 총 1536B > 1024B → 가장 오래된 a가 즉시 destroy되어야 한다.
    expect(a.buffer.destroyed).toBe(true);
    expect(b.buffer.destroyed).toBe(false);
    expect(c.buffer.destroyed).toBe(false);
    expect(pool.getMetrics().gpuIdleBytes).toBe(1024);
    expect(pool.getMetrics().gpuEvictions).toBe(1);

    // 이중 반납은 카운트나 상태를 오염시키지 않는다.
    expect(pool.releaseGpuBuffer(c.buffer)).toBe(false);

    // 상한보다 큰 버퍼는 반납 시 보관하지 않고 즉시 destroy한다.
    const huge = pool.acquireGpuBuffer(device, 2048, usage, "huge");
    huge.release();
    expect(huge.buffer.destroyed).toBe(true);

    // 유휴 시간 경과 회수 확인.
    clock = 5000;
    const expired = pool.evictIdleGpuBuffersOlderThan(2000, clock);
    expect(expired).toBe(2);
    expect(pool.getMetrics().gpuIdleBytes).toBe(0);

    pool.dispose();
    expect(pool.getMetrics().leakedGpuBuffers).toBe(0);
  });

  it("Float32Array 풀 재사용, zeroFill, LRU 정리 및 dispose 누수 0을 검증한다", () => {
    const { device } = createFakeBufferDevice();
    const pool = new GpuBufferPool<FakeGpuBuffer>({
      maxPooledFloat32Bytes: 1024, // 256 floats
      minFloat32BucketLength: 64,
    });

    const f1 = pool.acquireFloat32Array(100);
    expect(f1.bucketLength).toBe(128);
    expect(f1.reused).toBe(false);
    f1.array[0] = 42.5;
    f1.release();

    const f2 = pool.acquireFloat32Array(100, true);
    expect(f2.reused).toBe(true);
    expect(f2.array).toBe(f1.array);
    expect(f2.array[0]).toBe(0);
    f2.release();

    // 활성 대여 중인 GPU 버퍼가 남아 있어도 dispose 시 전부 destroy되어 누수 0.
    const activeLeakCheck = pool.acquireGpuBuffer(device, 512, GPU_NEXT_BUFFER_USAGE.UNIFORM);
    pool.dispose();
    expect(activeLeakCheck.buffer.destroyed).toBe(true);
    expect(pool.getMetrics().leakedGpuBuffers).toBe(0);
    expect(() => pool.acquireFloat32Array(64)).toThrow();
  });
});

describe("GpuPipelineWarmupQueue", () => {
  it("유휴 시간 슬라이스마다 우선순위 순으로 1개씩 비동기 컴파일하고 셰이더 모듈을 중복 생성하지 않는다", async () => {
    const compileOrder: string[] = [];
    const shaderCreateSpy = vi.fn(({ label }: { readonly code: string; readonly label?: string }) => ({
      label,
    }));
    const pipelineCreateSpy = vi.fn(
      async (descriptor: {
        readonly compute: { readonly entryPoint: string };
        readonly label?: string;
      }): Promise<GpuNextComputePipelineLike> => {
        compileOrder.push(descriptor.compute.entryPoint);
        return { label: descriptor.label };
      },
    );

    const fakeDevice: GpuNextPipelineDeviceLike = {
      createShaderModule: shaderCreateSpy,
      createComputePipelineAsync: pipelineCreateSpy,
    };

    const manual = createManualIdleScheduler();
    let clock = 0;
    const queue = new GpuPipelineWarmupQueue(fakeDevice, DEFAULT_GPU_NEXT_WARMUP_TASKS, {
      scheduler: manual.scheduler,
      minIdleBudgetMs: 4,
      now: () => {
        clock += 2;
        return clock;
      },
    });

    queue.start();

    // 유휴 예산이 1ms(< 4ms)로 부족하면 컴파일하지 않고 다음 슬라이스로 양보한다.
    await manual.runNext(1, false);
    expect(compileOrder).toHaveLength(0);

    // 충분한 유휴 슬라이스(10ms)를 6번 주면 6개 파이프라인이 우선순위 순으로 1개씩 순차 완료된다.
    for (let i = 0; i < DEFAULT_GPU_NEXT_WARMUP_TASKS.length; i += 1) {
      await manual.runNext(10, false);
      expect(compileOrder).toHaveLength(i + 1);
    }

    // 우선순위 0(HDR 2종) → 1(스크린톤) → 2(JFA 3종) 순.
    expect(compileOrder.slice(0, 2)).toEqual([
      "hdr_linear_blend_main",
      "hdr_tonemap_dither_srgb8_main",
    ]);
    expect(compileOrder[2]).toBe("screentone_and_outline_main");

    // 6개 엔트리포인트지만 고유 WGSL 소스는 3개이므로 createShaderModule은 정확히 3회만 호출된다.
    expect(shaderCreateSpy).toHaveBeenCalledTimes(3);

    const metrics = queue.getMetrics();
    expect(metrics.allReady).toBe(true);
    expect(metrics.readyCount).toBe(6);
    expect(metrics.failedCount).toBe(0);
    expect(metrics.running).toBe(false);
    expect(queue.getReadyPipeline("hdr-linear-blend")).not.toBeNull();
  });

  it("첫 붓터치 시 on-demand 요청(getOrCreatePipeline)이 진행 중 컴파일을 중복 없이 공유하고 CPU 폴백을 정직하게 보고한다", async () => {
    const resolvers: Array<(p: GpuNextComputePipelineLike) => void> = [];
    const pipelineCreateSpy = vi.fn(
      () =>
        new Promise<GpuNextComputePipelineLike>((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const fakeDevice: GpuNextPipelineDeviceLike = {
      createShaderModule: () => ({ label: "mod" }),
      createComputePipelineAsync: pipelineCreateSpy,
    };

    const manual = createManualIdleScheduler();
    const queue = new GpuPipelineWarmupQueue(fakeDevice, DEFAULT_GPU_NEXT_WARMUP_TASKS.slice(0, 2), {
      scheduler: manual.scheduler,
    });

    const p1 = queue.getOrCreatePipeline("hdr-linear-blend");
    const p2 = queue.getOrCreatePipeline("hdr-linear-blend");
    expect(pipelineCreateSpy).toHaveBeenCalledTimes(1);

    resolvers[0]?.({ label: "hdr-pipeline" });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2);
    expect(r1?.label).toBe("hdr-pipeline");

    queue.start();
    queue.cancel();
    expect(manual.cancelled.length).toBeGreaterThanOrEqual(1);
    queue.dispose();

    // device === null 환경은 가짜 파이프라인을 만들지 않고 cpu-fallback 상태로 보고한다.
    const cpuQueue = new GpuPipelineWarmupQueue(null, DEFAULT_GPU_NEXT_WARMUP_TASKS);
    expect(cpuQueue.getMetrics().backend).toBe("cpu-fallback");
    expect(cpuQueue.getMetrics().cpuFallbackCount).toBe(DEFAULT_GPU_NEXT_WARMUP_TASKS.length);
    expect(await cpuQueue.getOrCreatePipeline("hdr-linear-blend")).toBeNull();
  });
});
