import { describe, expect, it, vi } from "vitest";

import {
  createStudioOnnxWebGpuAdapterProbe,
  createStudioOnnxWebGpuCapabilityProbe,
  studioOnnxWebGpuApiAvailable,
  type StudioOnnxGpuLike,
} from "./studio-onnx-webgpu-probe";

function fakeGpu(adapter: unknown, reject = false): StudioOnnxGpuLike {
  return {
    requestAdapter: vi.fn(async () => {
      if (reject) throw new Error("adapter blocked");
      return adapter;
    }),
  };
}

describe("Studio ONNX WebGPU adapter probe", () => {
  it("reports available only when requestAdapter resolves a real adapter", async () => {
    const probe = createStudioOnnxWebGpuAdapterProbe(() =>
      fakeGpu({ features: new Set(), limits: {} }),
    );
    await expect(probe()).resolves.toBe(true);
  });

  it("reports unavailable when the adapter is null or the request rejects", async () => {
    const nullProbe = createStudioOnnxWebGpuAdapterProbe(() => fakeGpu(null));
    await expect(nullProbe()).resolves.toBe(false);
    const rejectingProbe = createStudioOnnxWebGpuAdapterProbe(() =>
      fakeGpu(null, true),
    );
    await expect(rejectingProbe()).resolves.toBe(false);
  });

  it("reports unavailable when no GPU API exists at all", async () => {
    const probe = createStudioOnnxWebGpuAdapterProbe(() => null);
    await expect(probe()).resolves.toBe(false);
  });

  it("shares one requestAdapter call across every consumer of the probe", async () => {
    const gpu = fakeGpu({ features: new Set(), limits: {} });
    const probe = createStudioOnnxWebGpuAdapterProbe(() => gpu);
    await Promise.all([probe(), probe(), probe()]);
    await probe();
    expect(gpu.requestAdapter).toHaveBeenCalledTimes(1);
    expect(gpu.requestAdapter).toHaveBeenCalledWith({
      powerPreference: "high-performance",
    });
  });

  it("keeps the sync presence check independent from the adapter verdict", () => {
    // 테스트 환경에는 navigator.gpu가 없으므로 존재 확인은 false다.
    expect(studioOnnxWebGpuApiAvailable()).toBe(false);
  });

  it("extracts shader-f16, subgroups, and compute limits via a single memoized requestAdapter call", async () => {
    const gpu = fakeGpu({
      features: new Set(["shader-f16", "subgroups"]),
      limits: {
        maxStorageBufferBindingSize: 268_435_456,
        maxComputeInvocationsPerWorkgroup: 1024,
      },
    });
    const probe = createStudioOnnxWebGpuCapabilityProbe(() => gpu);
    const [first, second] = await Promise.all([probe(), probe()]);
    expect(first).toBe(second);
    expect(first).toEqual({
      available: true,
      shaderF16: true,
      subgroups: true,
      maxStorageBufferBindingSize: 268_435_456,
      maxComputeInvocationsPerWorkgroup: 1024,
    });
    expect(gpu.requestAdapter).toHaveBeenCalledTimes(1);

    const unavailable = await createStudioOnnxWebGpuCapabilityProbe(() =>
      fakeGpu(null, true),
    )();
    expect(unavailable).toEqual({
      available: false,
      shaderF16: false,
      subgroups: false,
      maxStorageBufferBindingSize: null,
      maxComputeInvocationsPerWorkgroup: null,
    });
  });
});
