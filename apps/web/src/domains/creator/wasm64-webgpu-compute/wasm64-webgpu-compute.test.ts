import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_RESIDENT_TILES,
  DEFAULT_TILE_DIM,
  GPU_BUFFER_USAGE,
  HALFTONE_MODE_CODES,
  InMemorySyncAccessHandle,
  OpfsStreamingTileMmap,
  RGBA8_BYTES_PER_PIXEL,
  StudioWebGpuComputeDispatcher,
  TILE_ENCODING_DELTA_RLE,
  TILE_MMAP_MAGIC,
  TileChecksumMismatchError,
  WGSL_COMPUTE_KERNELS,
  WGSL_LT_GBUFFER_CONTOUR,
  WGSL_PROCEDURAL_HALFTONE_SCREENTONE,
  WGSL_SEPARABLE_GAUSSIAN_BLUR,
  computeDispatchWorkgroups,
  computeFnv1a32,
  detectWasmRelaxedSimdSupport,
  validateWgslComputeShader,
  type ComputeGpuBufferLike,
  type ComputeGpuDeviceLike,
  type ComputeGpuDeviceLostInfoLike,
  type TileCoord,
} from "./index";

interface MockGpuHarness {
  readonly device: ComputeGpuDeviceLike;
  readonly shaderCalls: string[];
  readonly pipelineCalls: string[];
  readonly createdBuffers: ComputeGpuBufferLike[];
  readonly destroyedBuffers: ComputeGpuBufferLike[];
  readonly bindGroupCalls: number[];
  readonly writeBufferCalls: { readonly byteOffset: number; readonly byteLength: number; readonly bufferOffset: number }[];
  readonly dispatches: readonly [number, number, number][];
  readonly submitCount: () => number;
  readonly triggerLost: (info: ComputeGpuDeviceLostInfoLike) => void;
}

function createMockGpuHarness(options?: { readonly failPipeline?: boolean }): MockGpuHarness {
  const shaderCalls: string[] = [];
  const pipelineCalls: string[] = [];
  const createdBuffers: ComputeGpuBufferLike[] = [];
  const destroyedBuffers: ComputeGpuBufferLike[] = [];
  const bindGroupCalls: number[] = [];
  const writeBufferCalls: { readonly byteOffset: number; readonly byteLength: number; readonly bufferOffset: number }[] = [];
  const dispatches: [number, number, number][] = [];
  let submits = 0;
  let resolveLost: (info: ComputeGpuDeviceLostInfoLike) => void = () => {};
  const lost = new Promise<ComputeGpuDeviceLostInfoLike>((resolve) => { resolveLost = resolve; });

  const device: ComputeGpuDeviceLike = {
    lost,
    queue: {
      writeBuffer(_buf, bufferOffset, data, dataOffset = 0, size) {
        const byteLength = size ?? (ArrayBuffer.isView(data) ? data.byteLength : data.byteLength);
        writeBufferCalls.push({ byteOffset: dataOffset, byteLength, bufferOffset });
      },
      submit(commandBuffers) { submits += commandBuffers.length; },
    },
    createShaderModule(desc) { shaderCalls.push(desc.label ?? "shader"); return { label: desc.label }; },
    createBuffer(desc) {
      const buf: ComputeGpuBufferLike = {
        size: desc.size, usage: desc.usage, label: desc.label,
        destroy() { destroyedBuffers.push(buf); },
      };
      createdBuffers.push(buf);
      return buf;
    },
    async createComputePipelineAsync(desc) {
      if (options?.failPipeline) throw new Error("Simulated GPU pipeline compilation fault");
      pipelineCalls.push(desc.label ?? desc.compute.entryPoint);
      return { label: desc.label, getBindGroupLayout: (i) => ({ label: `layout:${desc.label}:${i}` }) };
    },
    createBindGroup(desc) { bindGroupCalls.push(desc.entries.length); return { label: desc.label }; },
    createCommandEncoder(desc) {
      return {
        beginComputePass() {
          return {
            setPipeline() {}, setBindGroup() {},
            dispatchWorkgroups(x, y = 1, z = 1) { dispatches.push([x, y, z]); },
            end() {},
          };
        },
        finish() { return { label: desc?.label }; },
      };
    },
  };
  return {
    device, shaderCalls, pipelineCalls, createdBuffers, destroyedBuffers, bindGroupCalls,
    writeBufferCalls, dispatches, submitCount: () => submits, triggerLost: (info) => resolveLost(info),
  };
}

function makePatternTile(seed: number, dim: number = DEFAULT_TILE_DIM, flat = false): Uint8Array {
  const bytes = new Uint8Array(dim * dim * RGBA8_BYTES_PER_PIXEL);
  if (flat) {
    for (let i = 0; i < bytes.byteLength; i += 4) {
      bytes[i] = seed & 0xff; bytes[i + 1] = (seed * 3) & 0xff; bytes[i + 2] = (seed * 7) & 0xff; bytes[i + 3] = 255;
    }
    return bytes;
  }
  for (let i = 0; i < bytes.byteLength; i += 4) {
    const p = i >>> 2;
    bytes[i] = (seed + p) & 0xff; bytes[i + 1] = (seed * 5 + (p >>> 4)) & 0xff;
    bytes[i + 2] = (seed * 13 + (p & 31)) & 0xff; bytes[i + 3] = 255;
  }
  return bytes;
}

describe("wgsl-compute-kernels", () => {
  it("validates all 3 production WGSL compute shaders with @workgroup_size(16, 16) and unique bindings", () => {
    const blur = validateWgslComputeShader(WGSL_SEPARABLE_GAUSSIAN_BLUR);
    expect(blur.valid).toBe(true);
    expect(blur.errors).toEqual([]);
    expect(blur.workgroupSize).toEqual([16, 16, 1]);
    expect(blur.entryPoints).toEqual(["main"]);
    expect(blur.bindings).toEqual([{ group: 0, binding: 0 }, { group: 0, binding: 1 }, { group: 0, binding: 2 }]);
    expect(blur.usesWorkgroupMemory).toBe(true);
    expect(blur.usesWorkgroupBarrier).toBe(true);

    const halftone = validateWgslComputeShader(WGSL_PROCEDURAL_HALFTONE_SCREENTONE);
    expect(halftone.valid).toBe(true);
    expect(halftone.workgroupSize).toEqual([16, 16, 1]);
    expect(halftone.bindings).toHaveLength(3);
    expect(halftone.usesWorkgroupMemory).toBe(true);
    expect(halftone.usesWorkgroupBarrier).toBe(true);
    expect(Object.keys(HALFTONE_MODE_CODES)).toEqual(["dot", "line", "crosshatch", "diamond"]);

    const contour = validateWgslComputeShader(WGSL_LT_GBUFFER_CONTOUR);
    expect(contour.valid).toBe(true);
    expect(contour.workgroupSize).toEqual([16, 16, 1]);
    expect(contour.bindings).toHaveLength(5);
    expect(contour.usesWorkgroupMemory).toBe(true);
    expect(contour.usesWorkgroupBarrier).toBe(true);

    for (const kernel of Object.values(WGSL_COMPUTE_KERNELS)) {
      const check = validateWgslComputeShader(kernel.source, kernel.entryPoint);
      expect(check.valid).toBe(true);
      expect(check.bindings).toHaveLength(kernel.bindingCount);
    }
  });

  it("rejects malformed WGSL shaders (missing @compute, duplicate bindings, bad workgroup size, unbalanced syntax)", () => {
    expect(validateWgslComputeShader("").valid).toBe(false);
    const bad = validateWgslComputeShader(`
      @group(0) @binding(0) var<storage, read> a: array<u32>;
      @group(0) @binding(0) var<storage, read_write> b: array<u32>;
      @workgroup_size(32, 16)
      fn wrong_entry() { let x = (1u + 2u; } /* unclosed
    `);
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e) => e.includes("Missing @compute"))).toBe(true);
    expect(bad.errors.some((e) => e.includes("Duplicate @group(0) @binding(0)"))).toBe(true);
    expect(bad.errors.some((e) => e.includes("Invalid @workgroup_size"))).toBe(true);
    expect(bad.errors.some((e) => e.includes("Unbalanced"))).toBe(true);
    expect(bad.errors.some((e) => e.includes("Unclosed /*"))).toBe(true);
  });

  it("computes exact workgroup dispatch grids for 1x1, 256x256, 4096x4096, 8192x8192 and edge sizes", () => {
    expect(computeDispatchWorkgroups(1, 1, 16, 16)).toMatchObject({ x: 1, y: 1, z: 1, totalWorkgroups: 1, totalInvocations: 256 });
    expect(computeDispatchWorkgroups(256, 256, 16, 16)).toMatchObject({ x: 16, y: 16, z: 1, totalWorkgroups: 256, totalInvocations: 65536 });
    expect(computeDispatchWorkgroups(4096, 4096, 16, 16)).toMatchObject({ x: 256, y: 256, z: 1, totalWorkgroups: 65536, totalInvocations: 16777216 });
    expect(computeDispatchWorkgroups(8192, 8192, 16, 16)).toMatchObject({ x: 512, y: 512, z: 1, totalWorkgroups: 262144, totalInvocations: 67108864 });
    expect(computeDispatchWorkgroups(17, 33, 16, 16)).toMatchObject({ x: 2, y: 3, z: 1, totalWorkgroups: 6 });
    expect(computeDispatchWorkgroups(0, 256, 16, 16).totalWorkgroups).toBe(0);
    expect(() => computeDispatchWorkgroups(256, 256, 0, 16)).toThrow(RangeError);
  });
});

describe("StudioWebGpuComputeDispatcher", () => {
  it("dispatches all 3 kernels end-to-end with pipeline cache, bind-group cache, and zero-copy buffer pooling", async () => {
    const harness = createMockGpuHarness();
    const dispatcher = new StudioWebGpuComputeDispatcher({ device: harness.device, wasmRelaxedSimdSupported: true });
    expect(dispatcher.getBackendDescriptor().backend).toBe("webgpu-compute");

    const srcBuf = dispatcher.acquireBuffer(1024, GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST);
    const dstBuf = dispatcher.acquireBuffer(1024, GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_SRC);
    const uniformSlice = new Uint32Array(16).subarray(4, 12);

    const first = await dispatcher.dispatchKernel({
      kernelId: "separable-gaussian-blur", width: 256, height: 256, uniformData: uniformSlice,
      storageBindings: [{ binding: 1, buffer: srcBuf }, { binding: 2, buffer: dstBuf }],
    });
    expect(first.executedOnGpu).toBe(true);
    expect(first.backend).toBe("webgpu-compute");
    expect(first.bindGroupCacheHit).toBe(false);
    expect(first.workgroups).toMatchObject({ x: 16, y: 16, z: 1 });
    expect(harness.writeBufferCalls[0]).toMatchObject({ byteOffset: 16, byteLength: 32, bufferOffset: 0 });

    const second = await dispatcher.dispatchKernel({
      kernelId: "separable-gaussian-blur", width: 4096, height: 4096, uniformData: uniformSlice,
      storageBindings: [{ binding: 1, buffer: srcBuf }, { binding: 2, buffer: dstBuf }],
    });
    expect(second.executedOnGpu).toBe(true);
    expect(second.bindGroupCacheHit).toBe(true);
    expect(second.bufferPoolHits).toBeGreaterThanOrEqual(1);
    expect(harness.pipelineCalls).toHaveLength(1);
    expect(harness.bindGroupCalls).toEqual([3]);

    const contour = await dispatcher.dispatchKernel({
      kernelId: "lt-gbuffer-contour", width: 512, height: 512, uniformData: new Uint32Array(8),
      storageBindings: [
        { binding: 1, byteLength: 1024 }, { binding: 2, byteLength: 1024 },
        { binding: 3, byteLength: 1024 }, { binding: 4, byteLength: 1024 },
      ],
    });
    expect(contour.executedOnGpu).toBe(true);
    expect(contour.resolvedBuffers).toHaveLength(4);
    expect(harness.dispatches).toEqual([[16, 16, 1], [256, 256, 1], [32, 32, 1]]);
    expect(harness.submitCount()).toBe(3);

    dispatcher.releaseBuffer(srcBuf);
    dispatcher.releaseBuffer(dstBuf);
    dispatcher.dispose();
    expect(harness.destroyedBuffers.length).toBeGreaterThanOrEqual(3);
  });

  it("gracefully falls back to wasm-relaxed-simd on GPU device loss/fault and js-fallback when unsupported", async () => {
    const harness = createMockGpuHarness();
    const dispatcher = new StudioWebGpuComputeDispatcher({ device: harness.device, wasmRelaxedSimdSupported: true });
    const tempBuf = dispatcher.acquireBuffer(512, GPU_BUFFER_USAGE.STORAGE);
    dispatcher.releaseBuffer(tempBuf);

    harness.triggerLost({ reason: "destroyed", message: "GPU driver reset" });
    await Promise.resolve();

    const desc = dispatcher.getBackendDescriptor();
    expect(desc.backend).toBe("wasm-relaxed-simd");
    expect(desc.deviceLost).toBe(true);
    expect(desc.reason).toContain("GPU driver reset");
    expect(harness.destroyedBuffers).toContain(tempBuf);

    const fallbackRes = await dispatcher.dispatchKernel({
      kernelId: "procedural-halftone-screentone", width: 256, height: 256,
      uniformData: new Uint32Array(12), storageBindings: [],
    });
    expect(fallbackRes.executedOnGpu).toBe(false);
    expect(fallbackRes.backend).toBe("wasm-relaxed-simd");
    expect(fallbackRes.fallback?.deviceLost).toBe(true);
    expect(dispatcher.getStats().fallbackCount).toBe(1);

    const faulty = new StudioWebGpuComputeDispatcher({
      device: createMockGpuHarness({ failPipeline: true }).device, wasmRelaxedSimdSupported: true,
    });
    const recovered = await faulty.dispatchKernel({
      kernelId: "procedural-halftone-screentone", width: 128, height: 128,
      uniformData: new Uint32Array(12), storageBindings: [],
    });
    expect(recovered.executedOnGpu).toBe(false);
    expect(recovered.backend).toBe("wasm-relaxed-simd");

    const jsOnly = new StudioWebGpuComputeDispatcher({ device: null, wasmRelaxedSimdSupported: false });
    expect(jsOnly.getBackendDescriptor().backend).toBe("js-fallback");
    expect(typeof detectWasmRelaxedSimdSupport()).toBe("boolean");
  });
});

describe("OpfsStreamingTileMmap", () => {
  it("addresses >4 GiB 64-bit BigInt virtual & physical offsets and persists across close/reopen", () => {
    const FOUR_GIB = BigInt("0x100000000");
    const handle = new InMemorySyncAccessHandle();
    const mmap = new OpfsStreamingTileMmap(handle, { tileDim: 64, maxResidentTiles: 4, dataRegionBaseOffset: FOUR_GIB });

    const farCoord: TileCoord = { layerId: 12, tileX: 120, tileY: 900 };
    expect(mmap.computeVirtualTileOffset(farCoord) > FOUR_GIB * BigInt(4)).toBe(true);

    const tileA = makePatternTile(42, 64);
    const tileB = makePatternTile(99, 64);
    mmap.writeTile({ layerId: 0, tileX: 0, tileY: 0 }, tileA);
    mmap.writeTile(farCoord, tileB);
    mmap.close();
    expect(handle.isClosed()).toBe(true);

    const reopenedHandle = handle.reopen();
    const reopened = new OpfsStreamingTileMmap(reopenedHandle, { tileDim: 64, maxResidentTiles: 4 });
    const header = reopened.getHeader();
    expect(header.magic).toBe(TILE_MMAP_MAGIC);
    expect(header.pageCount).toBe(2);
    expect(header.dataRegionByteOffset).toBe(FOUR_GIB);
    expect(header.virtualDocumentBytes > FOUR_GIB * BigInt(4)).toBe(true);
    expect((reopened.getDirectoryEntry(farCoord)?.byteOffset ?? BigInt(0)) >= FOUR_GIB).toBe(true);
    expect(reopened.readTile({ layerId: 0, tileX: 0, tileY: 0 })).toEqual(tileA);
    expect(reopened.readTile(farCoord)).toEqual(tileB);
    expect(reopenedHandle.getAllocatedBlockCount()).toBeLessThan(16);
    reopened.close();
  });

  it("enforces bounded LRU eviction, dirty writeback persistence, delta-RLE compression, and FNV-1a corruption detection", () => {
    const handle = new InMemorySyncAccessHandle();
    const mmap = new OpfsStreamingTileMmap(handle, { tileDim: 64, maxResidentTiles: 4, enableCompression: true });
    const tiles = Array.from({ length: 6 }, (_, i) => makePatternTile(i + 1, 64, i % 2 === 0));
    for (let i = 0; i < 4; i += 1) mmap.writeTile({ layerId: 0, tileX: i, tileY: 0 }, tiles[i]);

    // 타일 0을 최근 사용(MRU)으로 승격 -> 다음 쓰기 시 타일 1이 퇴거되어야 한다.
    expect(mmap.readTile({ layerId: 0, tileX: 0, tileY: 0 })).toEqual(tiles[0]);
    mmap.writeTile({ layerId: 0, tileX: 4, tileY: 0 }, tiles[4]);
    expect(mmap.getStats().residentCount).toBe(4);
    expect(mmap.getStats().evictionCount).toBe(1);
    expect(mmap.getDirectoryEntry({ layerId: 0, tileX: 1, tileY: 0 })).toBeDefined();

    const hitsBefore = mmap.getStats().cacheHits;
    expect(mmap.readTile({ layerId: 0, tileX: 0, tileY: 0 })).toEqual(tiles[0]);
    expect(mmap.getStats().cacheHits).toBe(hitsBefore + 1);

    mmap.flushDirtyTiles();
    const flatEntry = mmap.getDirectoryEntry({ layerId: 0, tileX: 0, tileY: 0 });
    expect(flatEntry?.encoding).toBe(TILE_ENCODING_DELTA_RLE);
    expect((flatEntry?.storedByteLength ?? 999999) < (flatEntry?.uncompressedByteLength ?? 0)).toBe(true);

    const replacement = makePatternTile(77, 64, false);
    mmap.writeTile({ layerId: 0, tileX: 0, tileY: 0 }, replacement);
    mmap.close();

    const h2 = handle.reopen();
    const m2 = new OpfsStreamingTileMmap(h2, { tileDim: 64, maxResidentTiles: 4, enableCompression: true });
    expect(m2.getDirectoryEntry({ layerId: 0, tileX: 0, tileY: 0 })?.generation).toBe(2);
    expect(m2.readTile({ layerId: 0, tileX: 0, tileY: 0 })).toEqual(replacement);
    expect(m2.readTile({ layerId: 0, tileX: 4, tileY: 0 })).toEqual(tiles[4]);

    const targetEntry = m2.getDirectoryEntry({ layerId: 0, tileX: 2, tileY: 0 });
    expect(targetEntry).toBeDefined();
    if (targetEntry) h2.corruptByteAt(targetEntry.byteOffset + BigInt(4), 0x5a);
    expect(() => m2.readTile({ layerId: 0, tileX: 2, tileY: 0 })).toThrow(TileChecksumMismatchError);
    m2.close();

    const h3 = handle.reopen();
    h3.corruptByteAt(BigInt(12), 0x01);
    expect(() => new OpfsStreamingTileMmap(h3, { tileDim: 64 })).toThrow(TileChecksumMismatchError);
  });

  it("streams 96x (256x256 RGBA8 = 24 MiB) sequential tiles while strictly capping RAM at 64 tiles (16 MiB)", () => {
    const TILE_COUNT = 96;
    const EXPECTED_RAM_CAP = DEFAULT_MAX_RESIDENT_TILES * DEFAULT_TILE_DIM * DEFAULT_TILE_DIM * RGBA8_BYTES_PER_PIXEL;
    expect(EXPECTED_RAM_CAP).toBe(16 * 1024 * 1024);

    const handle = new InMemorySyncAccessHandle();
    const writer = new OpfsStreamingTileMmap(handle);
    const coords: TileCoord[] = [];
    const expectedChecksums: number[] = [];

    for (let i = 0; i < TILE_COUNT; i += 1) {
      const coord: TileCoord = { layerId: 0, tileX: i % 8, tileY: Math.floor(i / 8) };
      const pixels = makePatternTile(i + 10, DEFAULT_TILE_DIM, true);
      pixels[0] = i & 0xff;
      pixels[pixels.byteLength - 4] = (i * 7) & 0xff;
      expectedChecksums.push(computeFnv1a32(pixels));
      coords.push(coord);
      writer.writeTile(coord, pixels);
      const st = writer.getStats();
      expect(st.residentCount).toBeLessThanOrEqual(DEFAULT_MAX_RESIDENT_TILES);
      expect(st.residentBytes).toBeLessThanOrEqual(EXPECTED_RAM_CAP);
    }
    writer.close();

    const reader = new OpfsStreamingTileMmap(handle.reopen());
    const startMs = performance.now();
    let streamedCount = 0;
    for (const { pixels } of reader.streamReadTiles(coords)) {
      expect(computeFnv1a32(pixels)).toBe(expectedChecksums[streamedCount]);
      const st = reader.getStats();
      expect(st.residentCount).toBeLessThanOrEqual(DEFAULT_MAX_RESIDENT_TILES);
      expect(st.residentBytes).toBeLessThanOrEqual(EXPECTED_RAM_CAP);
      streamedCount += 1;
    }
    const elapsedMs = Math.max(0.01, performance.now() - startMs);
    const throughputMiBPerSec = (TILE_COUNT * 0.25) / (elapsedMs / 1000);

    expect(streamedCount).toBe(TILE_COUNT);
    expect(reader.getStats().evictionCount).toBe(TILE_COUNT - DEFAULT_MAX_RESIDENT_TILES);
    expect(throughputMiBPerSec).toBeGreaterThan(10);
    reader.close();
  });
});
