import { describe, expect, it, vi } from "vitest";

import {
  WASM_BULK_MEMORY_PROBE_BYTES,
  WASM_MEMORY64_PROBE_BYTES,
  WASM_RELAXED_SIMD_PROBE_BYTES,
  WASM_SIMD128_PROBE_BYTES,
  buildHardwareAccelerationReport,
  createStudioHardwareAcceleratorProbe,
  probeWasmCpuCapabilities,
  probeWebCodecsHardwareSupport,
  probeWebGpuCapabilities,
  probeWebNnCapabilities,
  type StudioAudioEncoderStaticLike,
  type StudioGpuLike,
  type StudioMlLike,
  type StudioVideoEncoderStaticLike,
} from "./studio-hardware-accelerator-probe";
import {
  bindLiveHardwareProbeToSiliconPlan,
  buildSiliconFullPowerPlan,
} from "./toon-silicon-runtime";
import { summarizeWebNnHardwareAvailability } from "./webnn-npu-thermal-compiler";
import {
  probeOnDeviceHardwareCapabilities,
  selectOnDeviceExecutionProvider,
  toOnDeviceHardwareProbe,
} from "./xr-splat-runtime/ondevice-webnn-assist-runtime";

function fakeGpuAdapter(options: {
  readonly features?: readonly string[];
  readonly maxStorageBufferBindingSize?: number;
  readonly maxComputeInvocationsPerWorkgroup?: number;
  readonly info?: {
    readonly vendor?: string;
    readonly architecture?: string;
    readonly device?: string;
    readonly description?: string;
  };
} = {}) {
  return {
    features: new Set(options.features ?? []),
    limits: {
      maxStorageBufferBindingSize: options.maxStorageBufferBindingSize,
      maxComputeInvocationsPerWorkgroup: options.maxComputeInvocationsPerWorkgroup,
    },
    info: options.info,
  };
}

function fakeGpu(adapter: unknown, reject = false): StudioGpuLike {
  return {
    requestAdapter: vi.fn(async () => {
      if (reject) throw new Error("gpu adapter blocked");
      return adapter as ReturnType<StudioGpuLike["requestAdapter"]> extends Promise<infer T>
        ? T
        : never;
    }),
  };
}

describe("WASM CPU real feature probing", () => {
  it("validates all 4 real WASM feature binaries on V8 without errors", () => {
    expect(WebAssembly.validate(WASM_SIMD128_PROBE_BYTES as BufferSource)).toBe(true);
    expect(WebAssembly.validate(WASM_RELAXED_SIMD_PROBE_BYTES as BufferSource)).toBe(true);
    expect(WebAssembly.validate(WASM_MEMORY64_PROBE_BYTES as BufferSource)).toBe(true);
    expect(WebAssembly.validate(WASM_BULK_MEMORY_PROBE_BYTES as BufferSource)).toBe(true);
  });

  it("computes optimal worker thread count clamped to [1, 8] and gates WASM threads on crossOriginIsolated", () => {
    const isolated16 = probeWasmCpuCapabilities({
      validateWasm: () => true,
      crossOriginIsolated: true,
      sharedArrayBufferAvailable: true,
      hardwareConcurrency: 16,
    });
    expect(isolated16).toMatchObject({
      simd128: true,
      relaxedSimd: true,
      memory64: true,
      bulkMemory: true,
      crossOriginIsolated: true,
      sharedArrayBuffer: true,
      hardwareConcurrency: 16,
      optimalWorkerThreads: 8,
      wasmThreadCount: 8,
      simdTier: "relaxed-simd",
    });

    const isolated4 = probeWasmCpuCapabilities({
      validateWasm: () => true,
      crossOriginIsolated: true,
      sharedArrayBufferAvailable: true,
      hardwareConcurrency: 4,
    });
    expect(isolated4.optimalWorkerThreads).toBe(3);
    expect(isolated4.wasmThreadCount).toBe(3);

    const nonIsolated = probeWasmCpuCapabilities({
      validateWasm: () => true,
      crossOriginIsolated: false,
      sharedArrayBufferAvailable: true,
      hardwareConcurrency: 12,
    });
    expect(nonIsolated.sharedArrayBuffer).toBe(false);
    expect(nonIsolated.optimalWorkerThreads).toBe(8);
    expect(nonIsolated.wasmThreadCount).toBe(1);

    const singleCore = probeWasmCpuCapabilities({
      validateWasm: () => true,
      crossOriginIsolated: true,
      sharedArrayBufferAvailable: true,
      hardwareConcurrency: 1,
    });
    expect(singleCore.optimalWorkerThreads).toBe(1);
    expect(singleCore.wasmThreadCount).toBe(1);
  });

  it("distinguishes relaxed-simd, simd128, and scalar tiers accurately", () => {
    const simdOnly = probeWasmCpuCapabilities({
      validateWasm: (bytes) => bytes !== WASM_RELAXED_SIMD_PROBE_BYTES,
      crossOriginIsolated: false,
    });
    expect(simdOnly.simd128).toBe(true);
    expect(simdOnly.relaxedSimd).toBe(false);
    expect(simdOnly.simdTier).toBe("simd128");

    const scalar = probeWasmCpuCapabilities({
      validateWasm: () => false,
      crossOriginIsolated: false,
    });
    expect(scalar.simd128).toBe(false);
    expect(scalar.relaxedSimd).toBe(false);
    expect(scalar.simdTier).toBe("scalar");
  });
});

describe("WebGPU capability probing", () => {
  it("extracts shader-f16, subgroups, compute limits, and adapter info", async () => {
    const gpu = fakeGpu(
      fakeGpuAdapter({
        features: ["shader-f16", "subgroups"],
        maxStorageBufferBindingSize: 536_870_912,
        maxComputeInvocationsPerWorkgroup: 1024,
        info: {
          vendor: "apple",
          architecture: "metal-3",
          device: "apple-m3",
          description: "Apple M3 GPU",
        },
      }),
    );

    const caps = await probeWebGpuCapabilities({ resolveGpu: () => gpu });
    expect(caps).toEqual({
      apiAvailable: true,
      available: true,
      shaderF16: true,
      subgroups: true,
      maxStorageBufferBindingSize: 536_870_912,
      maxComputeInvocationsPerWorkgroup: 1024,
      adapterInfo: {
        vendor: "apple",
        architecture: "metal-3",
        device: "apple-m3",
        description: "Apple M3 GPU",
      },
      timedOut: false,
    });
  });

  it("handles missing API, null adapter, rejections, and timeouts safely", async () => {
    expect(await probeWebGpuCapabilities({ resolveGpu: () => null })).toMatchObject({
      apiAvailable: false,
      available: false,
      timedOut: false,
    });
    expect(
      await probeWebGpuCapabilities({ resolveGpu: () => fakeGpu(null) }),
    ).toMatchObject({
      apiAvailable: true,
      available: false,
      timedOut: false,
    });
    expect(
      await probeWebGpuCapabilities({ resolveGpu: () => fakeGpu(null, true) }),
    ).toMatchObject({
      apiAvailable: true,
      available: false,
      timedOut: false,
    });

    const hangingGpu: StudioGpuLike = {
      requestAdapter: () => new Promise(() => undefined),
    };
    const timedOut = await probeWebGpuCapabilities({
      resolveGpu: () => hangingGpu,
      probeTimeoutMs: 15,
    });
    expect(timedOut.available).toBe(false);
    expect(timedOut.timedOut).toBe(true);
  });
});

describe("WebNN NPU capability probing", () => {
  it("detects true NPU first and destroys the probe MLContext cleanly", async () => {
    const destroy = vi.fn();
    const createContext = vi.fn(async (opts?: { readonly deviceType?: string }) =>
      opts?.deviceType === "npu" ? { destroy } : null,
    );
    const ml: StudioMlLike = { createContext };

    const caps = await probeWebNnCapabilities({ resolveMl: () => ml });
    expect(caps).toEqual({
      apiAvailable: true,
      available: true,
      npuAvailable: true,
      deviceType: "npu",
      timedOut: false,
    });
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(createContext).toHaveBeenCalledWith({
      deviceType: "npu",
      powerPreference: "default",
    });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("falls back through gpu and cpu when npu is rejected, and returns unavailable when all fail", async () => {
    const gpuMl: StudioMlLike = {
      createContext: vi.fn(async (opts) => {
        if (opts?.deviceType === "npu") throw new Error("NPU not present");
        if (opts?.deviceType === "gpu") return { destroy: vi.fn() };
        return null;
      }),
    };
    const gpuCaps = await probeWebNnCapabilities({ resolveMl: () => gpuMl });
    expect(gpuCaps).toMatchObject({
      available: true,
      npuAvailable: false,
      deviceType: "gpu",
    });

    const cpuMl: StudioMlLike = {
      createContext: vi.fn(async (opts) => {
        if (opts?.deviceType === "cpu") return {};
        throw new Error("unsupported");
      }),
    };
    const cpuCaps = await probeWebNnCapabilities({ resolveMl: () => cpuMl });
    expect(cpuCaps).toMatchObject({
      available: true,
      npuAvailable: false,
      deviceType: "cpu",
    });

    const emptyMl: StudioMlLike = {
      createContext: vi.fn(async () => {
        throw new Error("no webnn backend");
      }),
    };
    expect(await probeWebNnCapabilities({ resolveMl: () => emptyMl })).toMatchObject({
      apiAvailable: true,
      available: false,
      npuAvailable: false,
      deviceType: "unavailable",
    });
  });

  it("times out safely when navigator.ml.createContext hangs", async () => {
    const hangingMl: StudioMlLike = {
      createContext: () => new Promise(() => undefined),
    };
    const caps = await probeWebNnCapabilities({
      resolveMl: () => hangingMl,
      probeTimeoutMs: 12,
    });
    expect(caps.available).toBe(false);
    expect(caps.deviceType).toBe("unavailable");
    expect(caps.timedOut).toBe(true);
  });
});

describe("WebCodecs hardware acceleration probing", () => {
  it("detects hardware H.264/HEVC/AV1/Opus and VideoFrame zero-copy path", async () => {
    const videoEncoder: StudioVideoEncoderStaticLike = {
      isConfigSupported: vi.fn(async (config) => ({
        supported:
          config.hardwareAcceleration === "prefer-hardware"
          && (config.codec.startsWith("avc1")
            || config.codec.startsWith("hvc1")
            || config.codec.startsWith("av01")),
      })),
    };
    const audioEncoder: StudioAudioEncoderStaticLike = {
      isConfigSupported: vi.fn(async (config) => ({
        supported: config.codec === "opus",
      })),
    };

    const support = await probeWebCodecsHardwareSupport({
      resolveVideoEncoder: () => videoEncoder,
      resolveAudioEncoder: () => audioEncoder,
      videoFrameAvailable: true,
    });
    expect(support).toEqual({
      hasVideoEncoder: true,
      hasAudioEncoder: true,
      hasVideoFrame: true,
      h264: true,
      hevc: true,
      av1: true,
      opus: true,
      supportedVideoCodecs: ["h264", "hevc", "av1"],
      preferredVideoCodec: "h264",
      highestEfficiencyVideoCodec: "av1",
      hardwareAccelerationPreferred: true,
      zeroCopyVideoFramePath: true,
    });
  });

  it("disables zero-copy VideoFrame path when VideoFrame or hardware codecs are missing", async () => {
    const h264BaselineOnly: StudioVideoEncoderStaticLike = {
      isConfigSupported: vi.fn(async (config) => ({
        supported: config.codec === "avc1.42E01E",
      })),
    };
    const noVideoFrame = await probeWebCodecsHardwareSupport({
      resolveVideoEncoder: () => h264BaselineOnly,
      resolveAudioEncoder: () => null,
      videoFrameAvailable: false,
    });
    expect(noVideoFrame.h264).toBe(true);
    expect(noVideoFrame.hevc).toBe(false);
    expect(noVideoFrame.av1).toBe(false);
    expect(noVideoFrame.opus).toBe(false);
    expect(noVideoFrame.preferredVideoCodec).toBe("h264");
    expect(noVideoFrame.zeroCopyVideoFramePath).toBe(false);

    const unavailable = await probeWebCodecsHardwareSupport({
      resolveVideoEncoder: () => null,
      resolveAudioEncoder: () => null,
      videoFrameAvailable: false,
    });
    expect(unavailable.hardwareAccelerationPreferred).toBe(false);
    expect(unavailable.preferredVideoCodec).toBeNull();
    expect(unavailable.highestEfficiencyVideoCodec).toBeNull();
  });
});

describe("Ranked execution tiers, ONNX EP cascade, caching, and runtime adapters", () => {
  it("ranks all 6 execution tiers and emits exact ONNX Runtime Web executionProviders", async () => {
    const wasmRelaxedThreads = probeWasmCpuCapabilities({
      validateWasm: () => true,
      crossOriginIsolated: true,
      sharedArrayBufferAvailable: true,
      hardwareConcurrency: 10,
    });
    const wasmSimdOnly = probeWasmCpuCapabilities({
      validateWasm: (b) => b === WASM_SIMD128_PROBE_BYTES,
      crossOriginIsolated: false,
      hardwareConcurrency: 4,
    });
    const wasmScalar = probeWasmCpuCapabilities({
      validateWasm: () => false,
      crossOriginIsolated: false,
      hardwareConcurrency: 4,
    });
    const noWebCodecs = await probeWebCodecsHardwareSupport({
      resolveVideoEncoder: () => null,
      resolveAudioEncoder: () => null,
      videoFrameAvailable: false,
    });
    const gpuF16Subgroups = await probeWebGpuCapabilities({
      resolveGpu: () =>
        fakeGpu(
          fakeGpuAdapter({
            features: ["shader-f16", "subgroups"],
            maxStorageBufferBindingSize: 256 * 1024 * 1024,
            maxComputeInvocationsPerWorkgroup: 512,
          }),
        ),
    });
    const gpuBasic = await probeWebGpuCapabilities({
      resolveGpu: () => fakeGpu(fakeGpuAdapter({ features: [] })),
    });
    const noGpu = await probeWebGpuCapabilities({ resolveGpu: () => null });
    const npuReady = await probeWebNnCapabilities({
      resolveMl: () => ({ createContext: async () => ({}) }),
    });
    const noWebNn = await probeWebNnCapabilities({ resolveMl: () => null });

    const tier1 = buildHardwareAccelerationReport({
      wasm: wasmRelaxedThreads,
      webgpu: gpuF16Subgroups,
      webnn: npuReady,
      webCodecs: noWebCodecs,
    });
    expect(tier1.executionTier).toBe("webnn-npu");
    expect(tier1.cascadeOrder).toEqual(["webnn-npu", "webgpu", "wasm"]);
    expect(tier1.onnxExecutionProviders).toEqual([
      { name: "webnn", deviceType: "npu", powerPreference: "default" },
      { name: "webgpu", validationMode: "basic" },
      "wasm",
    ]);

    const tier2 = buildHardwareAccelerationReport({
      wasm: wasmRelaxedThreads,
      webgpu: gpuF16Subgroups,
      webnn: noWebNn,
      webCodecs: noWebCodecs,
    });
    expect(tier2.executionTier).toBe("webgpu-f16-subgroups");
    expect(tier2.onnxExecutionProviders).toEqual([
      { name: "webgpu", validationMode: "basic" },
      "wasm",
    ]);

    const tier3 = buildHardwareAccelerationReport({
      wasm: wasmRelaxedThreads,
      webgpu: gpuBasic,
      webnn: noWebNn,
      webCodecs: noWebCodecs,
    });
    expect(tier3.executionTier).toBe("webgpu");

    const tier4 = buildHardwareAccelerationReport({
      wasm: wasmRelaxedThreads,
      webgpu: noGpu,
      webnn: noWebNn,
      webCodecs: noWebCodecs,
    });
    expect(tier4.executionTier).toBe("wasm-relaxed-simd-threads");
    expect(tier4.onnxExecutionProviders).toEqual(["wasm"]);

    const tier5 = buildHardwareAccelerationReport({
      wasm: wasmSimdOnly,
      webgpu: noGpu,
      webnn: noWebNn,
      webCodecs: noWebCodecs,
    });
    expect(tier5.executionTier).toBe("wasm-simd128");

    const tier6 = buildHardwareAccelerationReport({
      wasm: wasmScalar,
      webgpu: noGpu,
      webnn: noWebNn,
      webCodecs: noWebCodecs,
    });
    expect(tier6.executionTier).toBe("wasm-scalar");
  });

  it("memoizes concurrent calls to createStudioHardwareAcceleratorProbe", async () => {
    const gpu = fakeGpu(fakeGpuAdapter({ features: ["shader-f16", "subgroups"] }));
    const createContext = vi.fn(async () => ({ destroy: vi.fn() }));
    const probe = createStudioHardwareAcceleratorProbe({
      validateWasm: () => true,
      crossOriginIsolated: true,
      sharedArrayBufferAvailable: true,
      hardwareConcurrency: 8,
      resolveGpu: () => gpu,
      resolveMl: () => ({ createContext }),
      resolveVideoEncoder: () => null,
      resolveAudioEncoder: () => null,
      videoFrameAvailable: false,
    });

    const [a, b, c] = await Promise.all([probe(), probe(), probe()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(gpu.requestAdapter).toHaveBeenCalledTimes(1);
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it("bridges live probe results cleanly into ondevice-webnn, toon-silicon, and webnn-thermal adapters", async () => {
    const probe = createStudioHardwareAcceleratorProbe({
      validateWasm: () => true,
      crossOriginIsolated: true,
      sharedArrayBufferAvailable: true,
      hardwareConcurrency: 8,
      resolveGpu: () =>
        fakeGpu(
          fakeGpuAdapter({
            features: ["shader-f16", "subgroups"],
            maxStorageBufferBindingSize: 512 * 1024 * 1024,
          }),
        ),
      resolveMl: () => ({ createContext: async () => ({ destroy: vi.fn() }) }),
      resolveVideoEncoder: () => ({
        isConfigSupported: async (cfg) => ({ supported: cfg.codec.startsWith("avc1") }),
      }),
      resolveAudioEncoder: () => ({
        isConfigSupported: async (cfg) => ({ supported: cfg.codec === "opus" }),
      }),
      videoFrameAvailable: true,
    });

    const report = await probe();

    const onDevice = toOnDeviceHardwareProbe(report);
    expect(onDevice).toMatchObject({
      hasWebNn: true,
      webNnDeviceType: "npu",
      hasWebGpu: true,
      hasWasmSimd: true,
      hasWasmRelaxedSimd: true,
      hasWebGpuShaderF16: true,
      hasWebGpuSubgroups: true,
      wasmThreads: 7,
      estimatedVramMb: 512,
    });
    expect(selectOnDeviceExecutionProvider(onDevice, "foreground-cutout").provider).toBe(
      "webnn-npu",
    );

    const probedOnDevice = await probeOnDeviceHardwareCapabilities({
      validateWasm: () => true,
      resolveGpu: () => null,
      resolveMl: () => null,
      resolveVideoEncoder: () => null,
      resolveAudioEncoder: () => null,
    });
    expect(probedOnDevice.hasWasmSimd).toBe(true);
    expect(probedOnDevice.hasWebGpu).toBe(false);

    const plan = buildSiliconFullPowerPlan({ siliconId: "apple-silicon-ane" });
    expect(plan.runtimeState.hardwareProbed).toBe(false);
    const snapshot = bindLiveHardwareProbeToSiliconPlan(plan, report);
    expect(snapshot).toMatchObject({
      siliconId: "apple-silicon-ane",
      hardwareProbed: true,
      executionTier: "webnn-npu",
      simdTier: "relaxed-simd",
      shaderF16Supported: true,
      subgroupsSupported: true,
      webCodecsHardwareReady: true,
      zeroCopyVideoFramePath: true,
    });

    const thermalSummary = summarizeWebNnHardwareAvailability(report);
    expect(thermalSummary).toMatchObject({
      npuContextReady: true,
      webnnDeviceType: "npu",
      webgpuFallbackReady: true,
      shaderF16Ready: true,
      subgroupsReady: true,
      wasmSimdTier: "relaxed-simd",
      suggestedThermalFallbackTier: 0,
    });
  });
});
