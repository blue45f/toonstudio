import { describe, expect, it } from "vitest";

import { DabBatch } from "../core/dab-layout";

import { BUFFER_USAGE } from "./layout";
import { createMockGpu } from "./testing/mock-gpu-device";
import {
  alignUpBytes,
  computeRadixStateSortKey,
  INDEXED_INDIRECT_DRAW_ARGS_BYTES,
  INDIRECT_DRAW_ARGS_BYTES,
  SumiZeroCopyIndirectRuntime,
  WEB_GPU_UBO_ALIGNMENT_BYTES,
  ZERO_COPY_BUFFER_LABELS,
  ZERO_COPY_ENTRY_POINTS,
} from "./webgpu-zero-copy-indirect-runtime";

describe("SumiZeroCopyIndirectRuntime (WebGPU Zero-Copy Compute + Indirect Draw + RenderBundle + WASM Direct-Map)", () => {
  it("allocates visibleDabsBuffer with STORAGE | VERTEX and indirectDrawBuffer with INDIRECT | STORAGE for zero-copy GPU execution", () => {
    const gpu = createMockGpu();
    const runtime = new SumiZeroCopyIndirectRuntime(gpu.device, {
      width: 1024,
      height: 1024,
      maxDabs: 1024,
    });

    const visibleBuf = gpu.bufferByLabel(ZERO_COPY_BUFFER_LABELS.visibleDabs);
    expect(visibleBuf.usage & BUFFER_USAGE.STORAGE).toBe(BUFFER_USAGE.STORAGE);
    expect(visibleBuf.usage & BUFFER_USAGE.VERTEX).toBe(BUFFER_USAGE.VERTEX);

    const indirectBuf = gpu.bufferByLabel(ZERO_COPY_BUFFER_LABELS.indirectDrawArgs);
    expect(indirectBuf.usage & BUFFER_USAGE.INDIRECT).toBe(BUFFER_USAGE.INDIRECT);
    expect(indirectBuf.usage & BUFFER_USAGE.STORAGE).toBe(BUFFER_USAGE.STORAGE);

    const indexedIndirectBuf = gpu.bufferByLabel(ZERO_COPY_BUFFER_LABELS.indexedIndirectDrawArgs);
    expect(indexedIndirectBuf.usage & BUFFER_USAGE.INDIRECT).toBe(BUFFER_USAGE.INDIRECT);
    expect(indexedIndirectBuf.usage & BUFFER_USAGE.STORAGE).toBe(BUFFER_USAGE.STORAGE);
    expect(runtime.width).toBe(1024);
  });

  it("executes Compute Frustum Culling + RenderBundle + drawIndirect with zero hot-path mapAsync calls", () => {
    const gpu = createMockGpu();
    const runtime = new SumiZeroCopyIndirectRuntime(gpu.device, {
      width: 512,
      height: 512,
      maxDabs: 512,
    });

    const batch = new DabBatch(4);
    // Dab 0: inside viewport (100, 100, radius 12, alpha 0.9)
    batch.data[0] = 100;
    batch.data[1] = 100;
    batch.data[2] = 12;
    batch.data[7] = 0.9;
    // Dab 1: inside viewport (250, 250, radius 8, alpha 0.8)
    batch.data[16] = 250;
    batch.data[17] = 250;
    batch.data[18] = 8;
    batch.data[23] = 0.8;
    // Dab 2: outside viewport (-500, -500, radius 5, alpha 1.0) -> culled!
    batch.data[32] = -500;
    batch.data[33] = -500;
    batch.data[34] = 5;
    batch.data[39] = 1.0;
    // Dab 3: zero alpha (120, 120, radius 10, alpha 0.0) -> culled!
    batch.data[48] = 120;
    batch.data[49] = 120;
    batch.data[50] = 10;
    batch.data[55] = 0.0;
    batch.count = 4;

    const report = runtime.executeZeroCopyBrushFrame(
      { kind: "dab-batch", batch },
      { useIndexedIndirect: false, useStaticRenderBundle: true },
    );

    expect(report.rawDabCount).toBe(4);
    expect(report.visibleDabCount).toBe(2);
    expect(report.culledDabCount).toBe(2);
    expect(report.drawCallMode).toBe("drawIndirect");
    expect(report.staticBundleExecuted).toBe(true);
    expect(report.hotPathMapAsyncCount).toBe(0);
    expect(report.cpuDrawCallLoopCount).toBe(0);

    // Verify Compute Shader dispatch
    expect(gpu.dispatches).toHaveLength(1);
    expect(gpu.dispatches[0]?.entryPoint).toBe(ZERO_COPY_ENTRY_POINTS.computeCullAndFlatten);

    // Verify RenderBundle execution + Indirect Draw
    expect(gpu.bundleExecutions).toBe(1);
    expect(gpu.indirectDraws).toHaveLength(1);
    expect(gpu.indirectDraws[0]).toMatchObject({
      entryPoint: ZERO_COPY_ENTRY_POINTS.zeroCopyBrushFs,
      kind: "indirect",
      indirectBuffer: ZERO_COPY_BUFFER_LABELS.indirectDrawArgs,
      indirectOffset: 0,
      vertexOrIndexCount: 6,
      instanceCount: 2,
    });

    // Zero mapAsync calls across all GPU buffers on the hot path
    expect(gpu.buffers.every((b) => b.mapCount === 0)).toBe(true);
  });

  it("supports PlayCanvas-style 20-byte drawIndexedIndirect slots and WebAssembly.Memory direct zero-clone uploads", () => {
    const gpu = createMockGpu();
    const runtime = new SumiZeroCopyIndirectRuntime(gpu.device, {
      width: 1024,
      height: 1024,
      maxDabs: 256,
    });

    const wasmMemory = new WebAssembly.Memory({ initial: 2 });
    const byteOffset = 256;
    const f32View = new Float32Array(wasmMemory.buffer, byteOffset, 3 * 16);
    for (let i = 0; i < 3; i += 1) {
      const base = i * 16;
      f32View[base] = 200 + i * 50;
      f32View[base + 1] = 300 + i * 40;
      f32View[base + 2] = 14;
      f32View[base + 7] = 0.95;
    }

    const r0 = runtime.executeZeroCopyBrushFrame(
      { kind: "wasm-linear-memory", wasmMemory, byteOffset, dabCount: 3 },
      { useIndexedIndirect: true, useStaticRenderBundle: true },
    );
    const r1 = runtime.executeZeroCopyBrushFrame(
      { kind: "wasm-linear-memory", wasmMemory, byteOffset, dabCount: 3 },
      { useIndexedIndirect: true, useStaticRenderBundle: true },
    );

    expect(r0.uploadMode).toBe("wasm-linear-memory-direct");
    expect(r0.drawCallMode).toBe("drawIndexedIndirect");
    expect(r0.indirectSlotIndex).toBe(0);
    expect(r0.indirectByteOffset).toBe(0);
    expect(r0.pipelineTrieCacheHit).toBe(false);

    expect(r1.indirectSlotIndex).toBe(1);
    expect(r1.indirectByteOffset).toBe(INDEXED_INDIRECT_DRAW_ARGS_BYTES);
    expect(r1.dynamicUboByteOffset).toBe(WEB_GPU_UBO_ALIGNMENT_BYTES);
    // Second frame hits the Babylon.js WebGPUCacheRenderPipelineTree integer state trie!
    expect(r1.pipelineTrieCacheHit).toBe(true);
    expect(runtime.getPipelineTrieStats()).toEqual({ hits: 1, misses: 1 });
    // Static RenderBundle was recorded once and reused across both frames
    expect(gpu.renderBundles).toHaveLength(1);
    expect(gpu.bundleExecutions).toBe(2);
  });

  it("supports 3-slot Ring Staging Buffer copy with submitVersion tracking and 256B UBO alignment", () => {
    const gpu = createMockGpu();
    const runtime = new SumiZeroCopyIndirectRuntime(gpu.device, {
      width: 800,
      height: 600,
      maxDabs: 128,
    });

    const data = new Float32Array(2 * 16);
    data[0] = 400;
    data[1] = 300;
    data[2] = 16;
    data[7] = 1.0;
    data[16] = 420;
    data[17] = 320;
    data[18] = 16;
    data[23] = 1.0;

    const report = runtime.executeZeroCopyBrushFrame(
      { kind: "ring-staging", data, dabCount: 2 },
      { useIndexedIndirect: false },
    );

    expect(report.uploadMode).toBe("ring-staging-copy");
    expect(report.visibleDabCount).toBe(2);
    expect(report.indirectByteOffset % INDIRECT_DRAW_ARGS_BYTES).toBe(0);
    expect(gpu.copies.some((c) => c.to === ZERO_COPY_BUFFER_LABELS.rawDabs)).toBe(true);
    expect(runtime.getSubmitVersion()).toBe(1);
    expect(runtime.getLastStagingSubmitVersion()).toBe(0);

    expect(alignUpBytes(1, 4)).toBe(4);
    expect(alignUpBytes(65, 256)).toBe(256);
    const k0 = computeRadixStateSortKey(1, 2, 3, 10);
    const k1 = computeRadixStateSortKey(2, 0, 0, 0);
    expect(k1).toBeGreaterThan(k0);
  });
});
