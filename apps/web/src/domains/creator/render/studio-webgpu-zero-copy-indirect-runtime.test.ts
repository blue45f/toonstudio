import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_ZERO_COPY_COMPUTE_WGSL,
  STUDIO_ZERO_COPY_DAB_FLOATS,
  STUDIO_ZERO_COPY_RENDER_WGSL,
  StudioWebGpuZeroCopyIndirectRuntime,
} from "./studio-webgpu-zero-copy-indirect-runtime";

function createMockGpuDevice(): GPUDevice {
  const destroy = vi.fn();
  return {
    createBuffer: vi.fn(({ size, label }) => ({ size, label, destroy }) as unknown as GPUBuffer),
    createCommandEncoder: vi.fn(() => ({
      copyBufferToBuffer: vi.fn(),
      finish: vi.fn(() => ({}) as GPUCommandBuffer),
    })),
    queue: {
      writeBuffer: vi.fn(),
      submit: vi.fn(),
    },
  } as unknown as GPUDevice;
}

describe("StudioWebGpuZeroCopyIndirectRuntime", () => {
  it("0-alloc 링버퍼·파이프라인 트라이 캐시·hotPathMapAsyncCount=0으로 500프레임을 실행한다", () => {
    const device = createMockGpuDevice();
    const runtime = new StudioWebGpuZeroCopyIndirectRuntime(device, {
      width: 1024,
      height: 1024,
      maxDabs: 512,
    });
    const dabs = new Float32Array(32 * STUDIO_ZERO_COPY_DAB_FLOATS);
    let lastReport = runtime.executeFrame(dabs, 32);
    expect(lastReport.pipelineTrieCacheHit).toBe(false);
    for (let i = 0; i < 499; i += 1) {
      lastReport = runtime.executeFrame(dabs, 32);
      expect(lastReport.hotPathMapAsyncCount).toBe(0);
      expect(lastReport.cpuDrawCallLoopCount).toBe(0);
      expect(lastReport.pipelineTrieCacheHit).toBe(true);
    }
    const stats = runtime.getPipelineTrieStats();
    expect(stats.hits).toBe(499);
    expect(stats.misses).toBe(1);
    expect(STUDIO_ZERO_COPY_COMPUTE_WGSL).toContain("vello_erf7");
    expect(STUDIO_ZERO_COPY_RENDER_WGSL).toContain("spectral38_mix_srgb");
    runtime.dispose();
  });
});
