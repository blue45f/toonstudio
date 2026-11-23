/**
 * WebGPU Compute 파이프라인 실행기 (`gap_close_dilate/erode` → `jump_flood_step` → `flatting_region_fill`).
 *
 * 실제 WebGPU `GPUDevice`가 가용할 때 3종의 WGSL 컴퓨트 셰이더를 디스패치하고,
 * 생성한 모든 `GPUBuffer`를 `finally` 블록에서 즉시 회수해 GPU 메모리 누수를 차단한다.
 */

import {
  buildJfaStepSchedule,
  clampInt,
  extractInkBarrierFromRgba,
  nowMs,
  packCoord,
  packRgba,
} from "./webgpu-flatting-jfa-kernels";
import {
  buildWatertightBarrierFromJfa,
  floodFillFinalRegions,
  labelClosedCores,
  normalizeFlattingSeeds,
  type AutoFlattingRegionSummary,
} from "./webgpu-flatting-region-kernels";
import type { AutoFlattingSeed } from "./webgpu-flatting-demo-scene";
import {
  EMPTY_JFA_COORD,
  WGSL_GAP_CLOSE_MORPH_SHADER,
  WGSL_JUMP_FLOOD_STEP_SHADER,
  WGSL_REGION_FLATTING_SHADER,
  WGSL_WORKGROUP_SIZE,
} from "./webgpu-flatting-wgsl-shaders";

const GPU_BUFFER_USAGE_MAP_READ =
  typeof GPUBufferUsage !== "undefined" ? GPUBufferUsage.MAP_READ : 0x0001;
const GPU_BUFFER_USAGE_COPY_SRC =
  typeof GPUBufferUsage !== "undefined" ? GPUBufferUsage.COPY_SRC : 0x0004;
const GPU_BUFFER_USAGE_COPY_DST =
  typeof GPUBufferUsage !== "undefined" ? GPUBufferUsage.COPY_DST : 0x0008;
const GPU_BUFFER_USAGE_UNIFORM =
  typeof GPUBufferUsage !== "undefined" ? GPUBufferUsage.UNIFORM : 0x0040;
const GPU_BUFFER_USAGE_STORAGE =
  typeof GPUBufferUsage !== "undefined" ? GPUBufferUsage.STORAGE : 0x0080;
const GPU_MAP_MODE_READ =
  typeof GPUMapMode !== "undefined" ? GPUMapMode.READ : 0x0001;

export interface WebGpuPipelineExecutionParams {
  readonly device: GPUDevice;
  readonly lineartRgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly appliedGapClosePx: number;
  readonly seeds: readonly AutoFlattingSeed[];
  readonly inkLuminanceThreshold?: number;
  readonly underStrokeTrapPx?: number;
}

export interface WebGpuPipelineExecutionOutput {
  readonly width: number;
  readonly height: number;
  readonly appliedGapClosePx: number;
  readonly backend: "webgpu-compute";
  readonly subgroupsUsed: boolean;
  readonly flattingRgba: Uint8ClampedArray;
  readonly regionMap: Uint32Array;
  readonly closedBarrier: Uint8Array;
  readonly originalInkBarrier: Uint8Array;
  readonly bridgedPixelCount: number;
  readonly filledPixelCount: number;
  readonly underStrokeTrappedPixelCount: number;
  readonly leakedPixelCount: number;
  readonly leakedToBorder: boolean;
  readonly leakBlockRatePct: number;
  readonly jfaPassCount: number;
  readonly regions: readonly AutoFlattingRegionSummary[];
  readonly timingsMs: {
    readonly gapCloseMorphMs: number;
    readonly jumpFloodMs: number;
    readonly regionFlattingMs: number;
    readonly totalMs: number;
  };
  readonly processingTimeMs: number;
}

async function readbackUint32Buffer(
  device: GPUDevice,
  srcBuffer: GPUBuffer,
  byteLength: number,
  ownedBuffers: GPUBuffer[],
): Promise<Uint32Array> {
  const staging = device.createBuffer({
    size: Math.max(4, byteLength),
    usage: GPU_BUFFER_USAGE_MAP_READ | GPU_BUFFER_USAGE_COPY_DST,
  });
  ownedBuffers.push(staging);

  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(srcBuffer, 0, staging, 0, byteLength);
  device.queue.submit([encoder.finish()]);

  await staging.mapAsync(GPU_MAP_MODE_READ);
  const mapped = staging.getMappedRange(0, byteLength);
  const copy = new Uint32Array(mapped.slice(0));
  staging.unmap();
  return copy;
}

export async function executeWebGpuComputePipeline(
  params: WebGpuPipelineExecutionParams,
): Promise<WebGpuPipelineExecutionOutput> {
  const {
    device,
    lineartRgba,
    width,
    height,
    appliedGapClosePx,
    inkLuminanceThreshold,
    underStrokeTrapPx,
  } = params;
  const startedAt = nowMs();
  const total = width * height;
  const seeds = normalizeFlattingSeeds(params.seeds);
  const trapRadiusPx = clampInt(underStrokeTrapPx ?? 1, 0, 1);
  const workgroupsX = Math.max(1, Math.ceil(width / WGSL_WORKGROUP_SIZE));
  const workgroupsY = Math.max(1, Math.ceil(height / WGSL_WORKGROUP_SIZE));
  const ownedBuffers: GPUBuffer[] = [];

  const createTrackedBuffer = (descriptor: GPUBufferDescriptor): GPUBuffer => {
    const buf = device.createBuffer(descriptor);
    ownedBuffers.push(buf);
    return buf;
  };

  try {
    const morphStart = nowMs();
    const originalInkBarrier = extractInkBarrierFromRgba(
      lineartRgba,
      width,
      height,
      inkLuminanceThreshold,
    );
    const origInkU32 = new Uint32Array(total);
    for (let i = 0; i < total; i += 1) origInkU32[i] = originalInkBarrier[i] ?? 0;

    const maskBytes = Math.max(4, total * 4);
    const origInkBuf = createTrackedBuffer({
      size: maskBytes,
      usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST | GPU_BUFFER_USAGE_COPY_SRC,
    });
    device.queue.writeBuffer(origInkBuf, 0, origInkU32);

    const morphModule = device.createShaderModule({ code: WGSL_GAP_CLOSE_MORPH_SHADER });
    let morphClosedBarrier = new Uint8Array(originalInkBarrier);

    if (appliedGapClosePx > 0) {
      const dilatePipeline = device.createComputePipeline({
        layout: "auto",
        compute: { module: morphModule, entryPoint: "gap_close_dilate" },
      });
      const erodePipeline = device.createComputePipeline({
        layout: "auto",
        compute: { module: morphModule, entryPoint: "gap_close_erode" },
      });

      const dilateBuf = createTrackedBuffer({
        size: maskBytes,
        usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_SRC,
      });
      const erodeBuf = createTrackedBuffer({
        size: maskBytes,
        usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_SRC,
      });
      const dilateUniform = createTrackedBuffer({
        size: 16,
        usage: GPU_BUFFER_USAGE_UNIFORM | GPU_BUFFER_USAGE_COPY_DST,
      });
      const erodeUniform = createTrackedBuffer({
        size: 16,
        usage: GPU_BUFFER_USAGE_UNIFORM | GPU_BUFFER_USAGE_COPY_DST,
      });

      device.queue.writeBuffer(
        dilateUniform,
        0,
        new Uint32Array([width, height, appliedGapClosePx, 0]),
      );
      device.queue.writeBuffer(
        erodeUniform,
        0,
        new Uint32Array([width, height, Math.floor(appliedGapClosePx / 2), 1]),
      );

      const dilateBindGroup = device.createBindGroup({
        layout: dilatePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: dilateUniform } },
          { binding: 1, resource: { buffer: origInkBuf } },
          { binding: 2, resource: { buffer: origInkBuf } },
          { binding: 3, resource: { buffer: dilateBuf } },
        ],
      });
      const erodeBindGroup = device.createBindGroup({
        layout: erodePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: erodeUniform } },
          { binding: 1, resource: { buffer: dilateBuf } },
          { binding: 2, resource: { buffer: origInkBuf } },
          { binding: 3, resource: { buffer: erodeBuf } },
        ],
      });

      const encoder = device.createCommandEncoder();
      const pass1 = encoder.beginComputePass();
      pass1.setPipeline(dilatePipeline);
      pass1.setBindGroup(0, dilateBindGroup);
      pass1.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
      pass1.end();

      const pass2 = encoder.beginComputePass();
      pass2.setPipeline(erodePipeline);
      pass2.setBindGroup(0, erodeBindGroup);
      pass2.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
      pass2.end();
      device.queue.submit([encoder.finish()]);

      const closedU32 = await readbackUint32Buffer(device, erodeBuf, maskBytes, ownedBuffers);
      morphClosedBarrier = new Uint8Array(total);
      for (let i = 0; i < total; i += 1) {
        morphClosedBarrier[i] = (closedU32[i] ?? 0) !== 0 ? 1 : 0;
      }
    }
    const gapCloseMorphMs = Math.max(0, nowMs() - morphStart);

    const jfaStart = nowMs();
    let watertightBarrier = originalInkBarrier;
    let bridgedPixelCount = 0;
    let jfaPassCount = 0;

    if (appliedGapClosePx > 0) {
      const coreLabels = labelClosedCores({
        originalInk: originalInkBarrier,
        closedBarrier: morphClosedBarrier,
        width,
        height,
        seeds,
        gapClosePx: appliedGapClosePx,
      });

      const initCells = new Uint32Array(total * 2);
      for (let y = 0; y < height; y += 1) {
        const rowOff = y * width;
        for (let x = 0; x < width; x += 1) {
          const idx = rowOff + x;
          const label = coreLabels[idx] ?? 0;
          initCells[idx * 2] = label > 0 ? packCoord(x, y) : EMPTY_JFA_COORD;
          initCells[idx * 2 + 1] = label;
        }
      }

      const cellBytes = Math.max(8, total * 8);
      const jfaBufA = createTrackedBuffer({
        size: cellBytes,
        usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST | GPU_BUFFER_USAGE_COPY_SRC,
      });
      const jfaBufB = createTrackedBuffer({
        size: cellBytes,
        usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST | GPU_BUFFER_USAGE_COPY_SRC,
      });
      device.queue.writeBuffer(jfaBufA, 0, initCells);

      const jfaModule = device.createShaderModule({ code: WGSL_JUMP_FLOOD_STEP_SHADER });
      const jfaPipeline = device.createComputePipeline({
        layout: "auto",
        compute: { module: jfaModule, entryPoint: "jump_flood_step" },
      });

      const steps = buildJfaStepSchedule(Math.max(width, height));
      jfaPassCount = steps.length;

      let readBuf = jfaBufA;
      let writeBuf = jfaBufB;

      for (const step of steps) {
        const jfaUniform = createTrackedBuffer({
          size: 16,
          usage: GPU_BUFFER_USAGE_UNIFORM | GPU_BUFFER_USAGE_COPY_DST,
        });
        device.queue.writeBuffer(jfaUniform, 0, new Uint32Array([width, height, step, 1]));

        const jfaBindGroup = device.createBindGroup({
          layout: jfaPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: jfaUniform } },
            { binding: 1, resource: { buffer: readBuf } },
            { binding: 2, resource: { buffer: writeBuf } },
            { binding: 3, resource: { buffer: origInkBuf } },
          ],
        });

        const enc = device.createCommandEncoder();
        const pass = enc.beginComputePass();
        pass.setPipeline(jfaPipeline);
        pass.setBindGroup(0, jfaBindGroup);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
        pass.end();
        device.queue.submit([enc.finish()]);

        const swap = readBuf;
        readBuf = writeBuf;
        writeBuf = swap;
      }

      const jfaCellsOut = await readbackUint32Buffer(device, readBuf, cellBytes, ownedBuffers);
      const jfaLabels = new Uint32Array(total);
      for (let i = 0; i < total; i += 1) {
        jfaLabels[i] = jfaCellsOut[i * 2 + 1] ?? 0;
      }

      const bridgeOut = buildWatertightBarrierFromJfa({
        originalInk: originalInkBarrier,
        morphClosedBarrier,
        jfaLabels,
        width,
        height,
      });
      watertightBarrier = bridgeOut.watertightBarrier;
      bridgedPixelCount = bridgeOut.bridgedPixelCount;
    }
    const jumpFloodMs = Math.max(0, nowMs() - jfaStart);

    const flatStart = nowMs();
    const filled = floodFillFinalRegions({
      watertightBarrier,
      width,
      height,
      seeds,
    });

    const lineartPacked = new Uint32Array(total);
    for (let i = 0; i < total; i += 1) {
      const off = i * 4;
      const r = lineartRgba[off] ?? 0;
      const g = lineartRgba[off + 1] ?? 0;
      const b = lineartRgba[off + 2] ?? 0;
      const a = lineartRgba[off + 3] ?? 0;
      lineartPacked[i] = (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
    }

    const palettePacked = new Uint32Array(seeds.length + 1);
    palettePacked[0] = 0;
    for (let i = 0; i < seeds.length; i += 1) {
      const seed = seeds[i];
      if (seed) palettePacked[i + 1] = packRgba(seed.color);
    }

    const regionBuf = createTrackedBuffer({
      size: maskBytes,
      usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST,
    });
    const lineartBuf = createTrackedBuffer({
      size: maskBytes,
      usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST,
    });
    const paletteBuf = createTrackedBuffer({
      size: Math.max(4, palettePacked.byteLength),
      usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_DST,
    });
    const outFlatBuf = createTrackedBuffer({
      size: maskBytes,
      usage: GPU_BUFFER_USAGE_STORAGE | GPU_BUFFER_USAGE_COPY_SRC,
    });
    const flatUniform = createTrackedBuffer({
      size: 16,
      usage: GPU_BUFFER_USAGE_UNIFORM | GPU_BUFFER_USAGE_COPY_DST,
    });

    device.queue.writeBuffer(regionBuf, 0, filled.regionMap);
    device.queue.writeBuffer(lineartBuf, 0, lineartPacked);
    device.queue.writeBuffer(paletteBuf, 0, palettePacked);
    device.queue.writeBuffer(
      flatUniform,
      0,
      new Uint32Array([width, height, palettePacked.length, trapRadiusPx]),
    );

    const flatModule = device.createShaderModule({ code: WGSL_REGION_FLATTING_SHADER });
    const flatPipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module: flatModule, entryPoint: "flatting_region_fill" },
    });
    const flatBindGroup = device.createBindGroup({
      layout: flatPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: flatUniform } },
        { binding: 1, resource: { buffer: regionBuf } },
        { binding: 2, resource: { buffer: lineartBuf } },
        { binding: 3, resource: { buffer: paletteBuf } },
        { binding: 4, resource: { buffer: outFlatBuf } },
      ],
    });

    const flatEnc = device.createCommandEncoder();
    const flatPass = flatEnc.beginComputePass();
    flatPass.setPipeline(flatPipeline);
    flatPass.setBindGroup(0, flatBindGroup);
    flatPass.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
    flatPass.end();
    device.queue.submit([flatEnc.finish()]);

    const outPacked = await readbackUint32Buffer(device, outFlatBuf, maskBytes, ownedBuffers);
    const flattingRgba = new Uint8ClampedArray(total * 4);
    let underStrokeTrappedPixelCount = 0;

    for (let i = 0; i < total; i += 1) {
      const packed = outPacked[i] ?? 0;
      const a = (packed >>> 24) & 0xff;
      if (a > 0) {
        const off = i * 4;
        flattingRgba[off] = packed & 0xff;
        flattingRgba[off + 1] = (packed >>> 8) & 0xff;
        flattingRgba[off + 2] = (packed >>> 16) & 0xff;
        flattingRgba[off + 3] = a;
        if ((filled.regionMap[i] ?? 0) === 0) underStrokeTrappedPixelCount += 1;
      }
    }

    const regionFlattingMs = Math.max(0, nowMs() - flatStart);
    const totalMs = Math.max(0, nowMs() - startedAt);
    const features = device.features as ReadonlySet<string> | undefined;
    const subgroupsUsed = Boolean(
      features && typeof features.has === "function" && features.has("subgroups"),
    );

    return {
      width,
      height,
      appliedGapClosePx,
      backend: "webgpu-compute",
      subgroupsUsed,
      flattingRgba,
      regionMap: filled.regionMap,
      closedBarrier: watertightBarrier,
      originalInkBarrier,
      bridgedPixelCount,
      filledPixelCount: filled.filledPixelCount,
      underStrokeTrappedPixelCount,
      leakedPixelCount: filled.leakedPixelCount,
      leakedToBorder: filled.leakedToBorder,
      leakBlockRatePct: filled.leakBlockRatePct,
      jfaPassCount,
      regions: filled.regions,
      timingsMs: {
        gapCloseMorphMs,
        jumpFloodMs,
        regionFlattingMs,
        totalMs,
      },
      processingTimeMs: totalMs,
    };
  } finally {
    for (const buf of ownedBuffers) {
      try {
        buf.destroy();
      } catch {
        // 이미 해제된 GPU 버퍼는 무시한다.
      }
    }
  }
}

let cachedAutoGpuDevicePromise: Promise<GPUDevice | null> | null = null;

export async function acquireDefaultWebGpuDevice(): Promise<GPUDevice | null> {
  if (typeof navigator === "undefined") return null;
  const gpu = (navigator as Navigator & { readonly gpu?: GPU }).gpu;
  if (!gpu || typeof gpu.requestAdapter !== "function") return null;

  cachedAutoGpuDevicePromise ??= (async () => {
    try {
      const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter || typeof adapter.requestDevice !== "function") return null;
      const features = adapter.features as ReadonlySet<string> | undefined;
      const wantsSubgroups = Boolean(features && features.has("subgroups"));
      const descriptor: GPUDeviceDescriptor | undefined = wantsSubgroups
        ? { requiredFeatures: ["subgroups" as GPUFeatureName] }
        : undefined;
      return await adapter.requestDevice(descriptor);
    } catch {
      cachedAutoGpuDevicePromise = null;
      return null;
    }
  })();

  return cachedAutoGpuDevicePromise;
}
