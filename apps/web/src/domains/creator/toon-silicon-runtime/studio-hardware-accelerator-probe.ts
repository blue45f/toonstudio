/**
 * 순수·무의존성 브라우저 실리콘 하드웨어 가속 역량 프로버.
 *
 * 브라우저 샌드박스에서 실제 표준 API로 CPU(WASM SIMD128·Relaxed-SIMD·WASM64·
 * SharedArrayBuffer 스레드), GPU(WebGPU shader-f16·subgroups·버퍼/워크그룹 한계),
 * NPU(WebNN `navigator.ml.createContext({ deviceType: "npu" })`), 그리고
 * 미디어 인코딩(WebCodecs `VideoEncoder`/`AudioEncoder` 하드웨어 가속)을 감지한다.
 *
 * - CPU SIMD: WASM `simd128` 및 `relaxed-simd`를 V8/JSC가 NEON/AVX2/AVX-512로 JIT 컴파일
 * - GPU: WebGPU `shader-f16` + `subgroups`
 * - NPU: WebNN `navigator.ml.createContext({ deviceType: "npu" })` + ONNX Runtime Web `webnn` EP
 * - Media: WebCodecs `VideoEncoder`/`AudioEncoder` `hardwareAcceleration: "prefer-hardware"` + `VideoFrame` 제로카피
 *
 * 번들 경계: `onnxruntime-web`, React, Konva 등 무거운 런타임을 정적 import하지 않는다.
 */

export type StudioWasmSimdTier = "relaxed-simd" | "simd128" | "scalar";

export type StudioWebNnDeviceType = "npu" | "gpu" | "cpu" | "unavailable";

export type StudioHardwareExecutionTier =
  | "webnn-npu"
  | "webgpu-f16-subgroups"
  | "webgpu"
  | "wasm-relaxed-simd-threads"
  | "wasm-simd128"
  | "wasm-scalar";

export type StudioHardwareCascadeProvider = "webnn-npu" | "webgpu" | "wasm";

export type StudioWebCodecsVideoCodec = "h264" | "hevc" | "av1";

export type StudioOnnxHardwareEpOption =
  | {
      readonly name: "webnn";
      readonly deviceType: "npu" | "gpu" | "cpu";
      readonly powerPreference: "default" | "low-power" | "high-performance";
    }
  | {
      readonly name: "webgpu";
      readonly validationMode: "basic";
    }
  | "wasm";

export interface StudioWasmCpuCapabilities {
  readonly simd128: boolean;
  readonly relaxedSimd: boolean;
  readonly memory64: boolean;
  readonly bulkMemory: boolean;
  readonly crossOriginIsolated: boolean;
  readonly sharedArrayBuffer: boolean;
  readonly hardwareConcurrency: number;
  readonly optimalWorkerThreads: number;
  readonly wasmThreadCount: number;
  readonly simdTier: StudioWasmSimdTier;
}

export interface StudioWebGpuAdapterInfoSummary {
  readonly vendor: string;
  readonly architecture: string;
  readonly device: string;
  readonly description: string;
}

export interface StudioWebGpuCapabilities {
  readonly apiAvailable: boolean;
  readonly available: boolean;
  readonly shaderF16: boolean;
  readonly subgroups: boolean;
  readonly maxStorageBufferBindingSize: number | null;
  readonly maxComputeInvocationsPerWorkgroup: number | null;
  readonly adapterInfo: StudioWebGpuAdapterInfoSummary | null;
  readonly timedOut: boolean;
}

export interface StudioWebNnCapabilities {
  readonly apiAvailable: boolean;
  readonly available: boolean;
  readonly npuAvailable: boolean;
  readonly deviceType: StudioWebNnDeviceType;
  readonly timedOut: boolean;
}

export interface StudioWebCodecsHardwareSupport {
  readonly hasVideoEncoder: boolean;
  readonly hasAudioEncoder: boolean;
  readonly hasVideoFrame: boolean;
  readonly h264: boolean;
  readonly hevc: boolean;
  readonly av1: boolean;
  readonly opus: boolean;
  readonly supportedVideoCodecs: readonly StudioWebCodecsVideoCodec[];
  readonly preferredVideoCodec: StudioWebCodecsVideoCodec | null;
  readonly highestEfficiencyVideoCodec: StudioWebCodecsVideoCodec | null;
  readonly hardwareAccelerationPreferred: boolean;
  readonly zeroCopyVideoFramePath: boolean;
}

export interface StudioWasmRuntimeRecommendation {
  readonly simd: boolean;
  readonly relaxedSimd: boolean;
  readonly numThreads: number;
  readonly proxy: boolean;
}

export interface StudioZeroCopyCapabilitySummary {
  readonly transferableArrayBuffers: boolean;
  readonly sharedArrayBuffer: boolean;
  readonly webGpuNativeBuffers: boolean;
  readonly webCodecsVideoFrame: boolean;
}

export interface StudioHardwareAccelerationReport {
  readonly wasm: StudioWasmCpuCapabilities;
  readonly webgpu: StudioWebGpuCapabilities;
  readonly webnn: StudioWebNnCapabilities;
  readonly webCodecs: StudioWebCodecsHardwareSupport;
  readonly executionTier: StudioHardwareExecutionTier;
  readonly cascadeOrder: readonly StudioHardwareCascadeProvider[];
  readonly onnxExecutionProviders: readonly StudioOnnxHardwareEpOption[];
  readonly wasmRuntimeConfig: StudioWasmRuntimeRecommendation;
  readonly zeroCopy: StudioZeroCopyCapabilitySummary;
}

export interface StudioGpuAdapterLike {
  readonly features?: {
    has(feature: string): boolean;
  };
  readonly limits?: {
    readonly maxStorageBufferBindingSize?: number;
    readonly maxComputeInvocationsPerWorkgroup?: number;
  };
  readonly info?: {
    readonly vendor?: string;
    readonly architecture?: string;
    readonly device?: string;
    readonly description?: string;
  };
}

export interface StudioGpuLike {
  requestAdapter(options?: {
    readonly powerPreference?: "low-power" | "high-performance";
  }): Promise<StudioGpuAdapterLike | null | undefined>;
}

export interface StudioMlContextLike {
  destroy?: () => void;
}

export interface StudioMlLike {
  createContext(options?: {
    readonly deviceType?: "npu" | "gpu" | "cpu";
    readonly powerPreference?: "default" | "low-power" | "high-performance";
  }): Promise<StudioMlContextLike | null | undefined>;
}

export interface StudioVideoEncoderStaticLike {
  isConfigSupported(config: {
    readonly codec: string;
    readonly width: number;
    readonly height: number;
    readonly bitrate?: number;
    readonly framerate?: number;
    readonly hardwareAcceleration?: "no-preference" | "prefer-hardware" | "prefer-software";
  }): Promise<{ readonly supported?: boolean } | null | undefined>;
}

export interface StudioAudioEncoderStaticLike {
  isConfigSupported(config: {
    readonly codec: string;
    readonly sampleRate: number;
    readonly numberOfChannels: number;
    readonly bitrate?: number;
  }): Promise<{ readonly supported?: boolean } | null | undefined>;
}

export interface StudioHardwareAcceleratorProbeDeps {
  readonly validateWasm?: (bytes: Uint8Array) => boolean;
  readonly crossOriginIsolated?: boolean;
  readonly sharedArrayBufferAvailable?: boolean;
  readonly hardwareConcurrency?: number;
  readonly resolveGpu?: () => StudioGpuLike | null;
  readonly resolveMl?: () => StudioMlLike | null;
  readonly resolveVideoEncoder?: () => StudioVideoEncoderStaticLike | null;
  readonly resolveAudioEncoder?: () => StudioAudioEncoderStaticLike | null;
  readonly videoFrameAvailable?: boolean;
  readonly probeTimeoutMs?: number;
}

export type StudioHardwareAcceleratorProbe = () => Promise<StudioHardwareAccelerationReport>;

/**
 * 최소 유효 WASM 기능 프로브 바이너리 (V8/JSC/SpiderMonkey 규격 검증 완료).
 * - simd128: `v128.const` (0xfd 0x0c)
 * - relaxedSimd: `i8x16.relaxed_swizzle` (0xfd 0x80 0x02)
 * - memory64: 64-bit linear memory limits flag (0x04)
 * - bulkMemory: `memory.fill` (0xfc 0x0b)
 */
export const WASM_SIMD128_PROBE_BYTES: Uint8Array = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x16, 0x01, 0x14, 0x00,
  0xfd, 0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0x0b,
]);

export const WASM_RELAXED_SIMD_PROBE_BYTES: Uint8Array = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x2b, 0x01, 0x29, 0x00,
  0xfd, 0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0xfd, 0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0xfd, 0x80, 0x02,
  0x0b,
]);

export const WASM_MEMORY64_PROBE_BYTES: Uint8Array = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x05, 0x03, 0x01, 0x04, 0x00,
]);

export const WASM_BULK_MEMORY_PROBE_BYTES: Uint8Array = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
  0x03, 0x02, 0x01, 0x00,
  0x05, 0x03, 0x01, 0x00, 0x01,
  0x0a, 0x0d, 0x01, 0x0b, 0x00,
  0x41, 0x00, 0x41, 0x00, 0x41, 0x00,
  0xfc, 0x0b, 0x00,
  0x0b,
]);

const DEFAULT_PROBE_TIMEOUT_MS = 1_500;

const H264_HW_CANDIDATES = ["avc1.640028", "avc1.42E01E"] as const;
const HEVC_HW_CANDIDATES = ["hvc1.1.6.L120.90", "hev1.1.6.L120.90"] as const;
const AV1_HW_CANDIDATES = ["av01.0.08M.08", "av01.0.04M.08"] as const;

const TIMEOUT_SENTINEL = Symbol("studio-hardware-probe-timeout");

function defaultValidateWasm(bytes: Uint8Array): boolean {
  if (typeof WebAssembly !== "object" || typeof WebAssembly.validate !== "function") {
    return false;
  }
  try {
    return WebAssembly.validate(bytes as BufferSource);
  } catch {
    return false;
  }
}

function defaultCrossOriginIsolated(): boolean {
  return (globalThis as { readonly crossOriginIsolated?: unknown }).crossOriginIsolated === true;
}

function defaultSharedArrayBufferConstructorExists(): boolean {
  return typeof SharedArrayBuffer === "function";
}

function defaultHardwareConcurrency(): number {
  if (typeof navigator === "undefined") return 4;
  const cores = (navigator as { readonly hardwareConcurrency?: unknown }).hardwareConcurrency;
  return typeof cores === "number" && Number.isFinite(cores) && cores >= 1
    ? Math.floor(cores)
    : 4;
}

function defaultResolveGpu(): StudioGpuLike | null {
  if (typeof navigator === "undefined") return null;
  const gpu = (navigator as { readonly gpu?: unknown }).gpu;
  if (!gpu || typeof gpu !== "object") return null;
  const candidate = gpu as { requestAdapter?: unknown };
  return typeof candidate.requestAdapter === "function" ? (gpu as StudioGpuLike) : null;
}

function defaultResolveMl(): StudioMlLike | null {
  if (typeof navigator === "undefined") return null;
  const ml = (navigator as { readonly ml?: unknown }).ml;
  if (!ml || typeof ml !== "object") return null;
  const candidate = ml as { createContext?: unknown };
  return typeof candidate.createContext === "function" ? (ml as StudioMlLike) : null;
}

function defaultResolveVideoEncoder(): StudioVideoEncoderStaticLike | null {
  const ctor = (globalThis as { readonly VideoEncoder?: unknown }).VideoEncoder;
  if (typeof ctor !== "function" && (typeof ctor !== "object" || ctor === null)) {
    return null;
  }
  const candidate = ctor as { isConfigSupported?: unknown };
  return typeof candidate.isConfigSupported === "function"
    ? (ctor as StudioVideoEncoderStaticLike)
    : null;
}

function defaultResolveAudioEncoder(): StudioAudioEncoderStaticLike | null {
  const ctor = (globalThis as { readonly AudioEncoder?: unknown }).AudioEncoder;
  if (typeof ctor !== "function" && (typeof ctor !== "object" || ctor === null)) {
    return null;
  }
  const candidate = ctor as { isConfigSupported?: unknown };
  return typeof candidate.isConfigSupported === "function"
    ? (ctor as StudioAudioEncoderStaticLike)
    : null;
}

function defaultVideoFrameAvailable(): boolean {
  return typeof (globalThis as { readonly VideoFrame?: unknown }).VideoFrame === "function";
}

function sanitizePositiveLimit(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.floor(value);
}

function sanitizeTimeoutMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_PROBE_TIMEOUT_MS;
  }
  return Math.min(10_000, Math.max(10, Math.floor(value)));
}

async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | typeof TIMEOUT_SENTINEL> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
        timer = setTimeout(() => resolve(TIMEOUT_SENTINEL), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

function safeDestroyMlContext(context: StudioMlContextLike | null | undefined): void {
  if (!context || typeof context.destroy !== "function") return;
  try {
    context.destroy();
  } catch {
    // 프로브 종료 시 컨텍스트 정리 오류는 무시한다.
  }
}

/**
 * WASM CPU 기능(`simd128`, `relaxed-simd`, `memory64`, `bulk-memory`, `SharedArrayBuffer`)과
 * 최적 워커 스레드 수를 동기적으로 감지한다.
 */
export function probeWasmCpuCapabilities(
  deps: Pick<
    StudioHardwareAcceleratorProbeDeps,
    "validateWasm" | "crossOriginIsolated" | "sharedArrayBufferAvailable" | "hardwareConcurrency"
  > = {},
): StudioWasmCpuCapabilities {
  const validate = deps.validateWasm ?? defaultValidateWasm;
  const safeValidate = (bytes: Uint8Array): boolean => {
    try {
      return validate(bytes) === true;
    } catch {
      return false;
    }
  };

  const simd128 = safeValidate(WASM_SIMD128_PROBE_BYTES);
  const relaxedSimd = simd128 && safeValidate(WASM_RELAXED_SIMD_PROBE_BYTES);
  const memory64 = safeValidate(WASM_MEMORY64_PROBE_BYTES);
  const bulkMemory = safeValidate(WASM_BULK_MEMORY_PROBE_BYTES);

  const crossOriginIsolated = deps.crossOriginIsolated ?? defaultCrossOriginIsolated();
  const hasSabCtor =
    deps.sharedArrayBufferAvailable ?? defaultSharedArrayBufferConstructorExists();
  const sharedArrayBuffer = Boolean(crossOriginIsolated && hasSabCtor);

  const rawCores = deps.hardwareConcurrency ?? defaultHardwareConcurrency();
  const hardwareConcurrency =
    typeof rawCores === "number" && Number.isFinite(rawCores) && rawCores >= 1
      ? Math.floor(rawCores)
      : 4;
  const optimalWorkerThreads = Math.max(1, Math.min(8, hardwareConcurrency - 1));
  const wasmThreadCount = sharedArrayBuffer ? optimalWorkerThreads : 1;
  const simdTier: StudioWasmSimdTier = relaxedSimd
    ? "relaxed-simd"
    : simd128
      ? "simd128"
      : "scalar";

  return Object.freeze({
    simd128,
    relaxedSimd,
    memory64,
    bulkMemory,
    crossOriginIsolated,
    sharedArrayBuffer,
    hardwareConcurrency,
    optimalWorkerThreads,
    wasmThreadCount,
    simdTier,
  });
}

/**
 * WebGPU 어댑터 실재 여부 및 `shader-f16`, `subgroups`, 핵심 compute 한계를 프로브한다.
 */
export async function probeWebGpuCapabilities(
  deps: Pick<StudioHardwareAcceleratorProbeDeps, "resolveGpu" | "probeTimeoutMs"> = {},
): Promise<StudioWebGpuCapabilities> {
  const gpu = (deps.resolveGpu ?? defaultResolveGpu)();
  if (!gpu) {
    return Object.freeze({
      apiAvailable: false,
      available: false,
      shaderF16: false,
      subgroups: false,
      maxStorageBufferBindingSize: null,
      maxComputeInvocationsPerWorkgroup: null,
      adapterInfo: null,
      timedOut: false,
    });
  }

  const timeoutMs = sanitizeTimeoutMs(deps.probeTimeoutMs);
  try {
    const adapter = await raceWithTimeout(
      Promise.resolve(gpu.requestAdapter({ powerPreference: "high-performance" })),
      timeoutMs,
    );
    if (adapter === TIMEOUT_SENTINEL) {
      return Object.freeze({
        apiAvailable: true,
        available: false,
        shaderF16: false,
        subgroups: false,
        maxStorageBufferBindingSize: null,
        maxComputeInvocationsPerWorkgroup: null,
        adapterInfo: null,
        timedOut: true,
      });
    }
    if (!adapter) {
      return Object.freeze({
        apiAvailable: true,
        available: false,
        shaderF16: false,
        subgroups: false,
        maxStorageBufferBindingSize: null,
        maxComputeInvocationsPerWorkgroup: null,
        adapterInfo: null,
        timedOut: false,
      });
    }

    const hasFeature = (feature: string): boolean => {
      try {
        return typeof adapter.features?.has === "function" && adapter.features.has(feature) === true;
      } catch {
        return false;
      }
    };

    const shaderF16 = hasFeature("shader-f16");
    const subgroups = hasFeature("subgroups");
    const maxStorageBufferBindingSize = sanitizePositiveLimit(
      adapter.limits?.maxStorageBufferBindingSize,
    );
    const maxComputeInvocationsPerWorkgroup = sanitizePositiveLimit(
      adapter.limits?.maxComputeInvocationsPerWorkgroup,
    );
    const adapterInfo: StudioWebGpuAdapterInfoSummary | null =
      adapter.info && typeof adapter.info === "object"
        ? Object.freeze({
            vendor: typeof adapter.info.vendor === "string" ? adapter.info.vendor : "",
            architecture:
              typeof adapter.info.architecture === "string" ? adapter.info.architecture : "",
            device: typeof adapter.info.device === "string" ? adapter.info.device : "",
            description:
              typeof adapter.info.description === "string" ? adapter.info.description : "",
          })
        : null;

    return Object.freeze({
      apiAvailable: true,
      available: true,
      shaderF16,
      subgroups,
      maxStorageBufferBindingSize,
      maxComputeInvocationsPerWorkgroup,
      adapterInfo,
      timedOut: false,
    });
  } catch {
    return Object.freeze({
      apiAvailable: true,
      available: false,
      shaderF16: false,
      subgroups: false,
      maxStorageBufferBindingSize: null,
      maxComputeInvocationsPerWorkgroup: null,
      adapterInfo: null,
      timedOut: false,
    });
  }
}

/**
 * WebNN(`navigator.ml.createContext`) 가용성과 실제 백엔드 장치 유형(`npu` / `gpu` / `cpu`)을 프로브한다.
 */
export async function probeWebNnCapabilities(
  deps: Pick<StudioHardwareAcceleratorProbeDeps, "resolveMl" | "probeTimeoutMs"> = {},
): Promise<StudioWebNnCapabilities> {
  const ml = (deps.resolveMl ?? defaultResolveMl)();
  if (!ml) {
    return Object.freeze({
      apiAvailable: false,
      available: false,
      npuAvailable: false,
      deviceType: "unavailable",
      timedOut: false,
    });
  }

  const timeoutMs = sanitizeTimeoutMs(deps.probeTimeoutMs);
  let timedOut = false;

  for (const deviceType of ["npu", "gpu", "cpu"] as const) {
    try {
      const pending = Promise.resolve(
        ml.createContext({ deviceType, powerPreference: "default" }),
      );
      const result = await raceWithTimeout(pending, timeoutMs);
      if (result === TIMEOUT_SENTINEL) {
        timedOut = true;
        void pending.then(safeDestroyMlContext, () => undefined);
        continue;
      }
      if (result) {
        safeDestroyMlContext(result);
        return Object.freeze({
          apiAvailable: true,
          available: true,
          npuAvailable: deviceType === "npu",
          deviceType,
          timedOut,
        });
      }
    } catch {
      // 다음 WebNN deviceType 후보로 조용히 넘어간다.
    }
  }

  return Object.freeze({
    apiAvailable: true,
    available: false,
    npuAvailable: false,
    deviceType: "unavailable",
    timedOut,
  });
}

async function probeVideoCodecHardware(
  encoder: StudioVideoEncoderStaticLike,
  candidates: readonly string[],
  timeoutMs: number,
): Promise<boolean> {
  for (const codec of candidates) {
    try {
      const result = await raceWithTimeout(
        Promise.resolve(
          encoder.isConfigSupported({
            codec,
            width: 1920,
            height: 1080,
            bitrate: 4_000_000,
            framerate: 30,
            hardwareAcceleration: "prefer-hardware",
          }),
        ),
        timeoutMs,
      );
      if (result !== TIMEOUT_SENTINEL && result?.supported === true) {
        return true;
      }
    } catch {
      // 다음 프로파일 문자열을 시도한다.
    }
  }
  return false;
}

async function probeAudioOpusSupport(
  encoder: StudioAudioEncoderStaticLike,
  timeoutMs: number,
): Promise<boolean> {
  try {
    const result = await raceWithTimeout(
      Promise.resolve(
        encoder.isConfigSupported({
          codec: "opus",
          sampleRate: 48_000,
          numberOfChannels: 2,
          bitrate: 128_000,
        }),
      ),
      timeoutMs,
    );
    return result !== TIMEOUT_SENTINEL && result?.supported === true;
  } catch {
    return false;
  }
}

/**
 * WebCodecs `VideoEncoder`/`AudioEncoder`의 하드웨어 가속(`prefer-hardware`) 지원 여부를 감지한다.
 * 오디오툰·애니매틱 내보내기에서 `VideoFrame` 제로카피 하드웨어 인코딩 경로 판별에 사용한다.
 */
export async function probeWebCodecsHardwareSupport(
  deps: Pick<
    StudioHardwareAcceleratorProbeDeps,
    "resolveVideoEncoder" | "resolveAudioEncoder" | "videoFrameAvailable" | "probeTimeoutMs"
  > = {},
): Promise<StudioWebCodecsHardwareSupport> {
  const videoEncoder = (deps.resolveVideoEncoder ?? defaultResolveVideoEncoder)();
  const audioEncoder = (deps.resolveAudioEncoder ?? defaultResolveAudioEncoder)();
  const hasVideoFrame = deps.videoFrameAvailable ?? defaultVideoFrameAvailable();
  const timeoutMs = sanitizeTimeoutMs(deps.probeTimeoutMs);

  const [h264, hevc, av1, opus] = await Promise.all([
    videoEncoder ? probeVideoCodecHardware(videoEncoder, H264_HW_CANDIDATES, timeoutMs) : false,
    videoEncoder ? probeVideoCodecHardware(videoEncoder, HEVC_HW_CANDIDATES, timeoutMs) : false,
    videoEncoder ? probeVideoCodecHardware(videoEncoder, AV1_HW_CANDIDATES, timeoutMs) : false,
    audioEncoder ? probeAudioOpusSupport(audioEncoder, timeoutMs) : false,
  ]);

  const supportedVideoCodecs: StudioWebCodecsVideoCodec[] = [];
  if (h264) supportedVideoCodecs.push("h264");
  if (hevc) supportedVideoCodecs.push("hevc");
  if (av1) supportedVideoCodecs.push("av1");

  const preferredVideoCodec: StudioWebCodecsVideoCodec | null = h264
    ? "h264"
    : hevc
      ? "hevc"
      : av1
        ? "av1"
        : null;
  const highestEfficiencyVideoCodec: StudioWebCodecsVideoCodec | null = av1
    ? "av1"
    : hevc
      ? "hevc"
      : h264
        ? "h264"
        : null;
  const hardwareAccelerationPreferred = supportedVideoCodecs.length > 0;

  return Object.freeze({
    hasVideoEncoder: videoEncoder !== null,
    hasAudioEncoder: audioEncoder !== null,
    hasVideoFrame,
    h264,
    hevc,
    av1,
    opus,
    supportedVideoCodecs: Object.freeze(supportedVideoCodecs),
    preferredVideoCodec,
    highestEfficiencyVideoCodec,
    hardwareAccelerationPreferred,
    zeroCopyVideoFramePath: Boolean(hasVideoFrame && videoEncoder !== null && hardwareAccelerationPreferred),
  });
}

/**
 * 감지된 WASM · WebGPU · WebNN · WebCodecs 역량을 기반으로 실행 티어와
 * ONNX Runtime Web `executionProviders` 우선순위 목록을 결정한다.
 */
export function buildHardwareAccelerationReport(input: {
  readonly wasm: StudioWasmCpuCapabilities;
  readonly webgpu: StudioWebGpuCapabilities;
  readonly webnn: StudioWebNnCapabilities;
  readonly webCodecs: StudioWebCodecsHardwareSupport;
}): StudioHardwareAccelerationReport {
  const { wasm, webgpu, webnn, webCodecs } = input;

  let executionTier: StudioHardwareExecutionTier;
  if (webnn.deviceType === "npu") {
    executionTier = "webnn-npu";
  } else if (webgpu.available && webgpu.shaderF16 && webgpu.subgroups) {
    executionTier = "webgpu-f16-subgroups";
  } else if (webgpu.available) {
    executionTier = "webgpu";
  } else if (wasm.relaxedSimd && wasm.sharedArrayBuffer) {
    executionTier = "wasm-relaxed-simd-threads";
  } else if (wasm.simd128) {
    executionTier = "wasm-simd128";
  } else {
    executionTier = "wasm-scalar";
  }

  const cascadeOrder: StudioHardwareCascadeProvider[] = [];
  const onnxExecutionProviders: StudioOnnxHardwareEpOption[] = [];

  if (webnn.deviceType === "npu") {
    cascadeOrder.push("webnn-npu");
    onnxExecutionProviders.push(
      Object.freeze({
        name: "webnn" as const,
        deviceType: "npu" as const,
        powerPreference: "default" as const,
      }),
    );
  }
  if (webgpu.available) {
    cascadeOrder.push("webgpu");
    onnxExecutionProviders.push(
      Object.freeze({
        name: "webgpu" as const,
        validationMode: "basic" as const,
      }),
    );
  }
  cascadeOrder.push("wasm");
  onnxExecutionProviders.push("wasm");

  return Object.freeze({
    wasm,
    webgpu,
    webnn,
    webCodecs,
    executionTier,
    cascadeOrder: Object.freeze(cascadeOrder),
    onnxExecutionProviders: Object.freeze(onnxExecutionProviders),
    wasmRuntimeConfig: Object.freeze({
      simd: wasm.simd128,
      relaxedSimd: wasm.relaxedSimd,
      numThreads: wasm.wasmThreadCount,
      proxy: false,
    }),
    zeroCopy: Object.freeze({
      transferableArrayBuffers: true,
      sharedArrayBuffer: wasm.sharedArrayBuffer,
      webGpuNativeBuffers: webgpu.available,
      webCodecsVideoFrame: webCodecs.zeroCopyVideoFramePath,
    }),
  });
}

/**
 * 주입 가능한 소스로 메모이즈된 하드웨어 역량 프로버를 생성한다.
 * 페이지 수명 동안 한 번만 프로브를 실행하고 결과를 공유한다.
 */
export function createStudioHardwareAcceleratorProbe(
  deps: StudioHardwareAcceleratorProbeDeps = {},
): StudioHardwareAcceleratorProbe {
  let cached: Promise<StudioHardwareAccelerationReport> | null = null;
  return () => {
    cached ??= (async () => {
      const wasm = probeWasmCpuCapabilities(deps);
      const [webgpu, webnn, webCodecs] = await Promise.all([
        probeWebGpuCapabilities(deps),
        probeWebNnCapabilities(deps),
        probeWebCodecsHardwareSupport(deps),
      ]);
      return buildHardwareAccelerationReport({ wasm, webgpu, webnn, webCodecs });
    })();
    return cached;
  };
}

let sharedHardwareProbe: StudioHardwareAcceleratorProbe =
  createStudioHardwareAcceleratorProbe();

/** 앱 전역에서 공유하는 캐시된 기본 하드웨어 가속 프로버. */
export function probeStudioHardwareAcceleration(): Promise<StudioHardwareAccelerationReport> {
  return sharedHardwareProbe();
}

/** 테스트 격리용 기본 프로브 캐시 초기화. */
export function resetStudioHardwareAcceleratorProbeCache(): void {
  sharedHardwareProbe = createStudioHardwareAcceleratorProbe();
}
