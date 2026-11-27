/**
 * 실시간 Rust `.wasm` 필터 가속 브리지 (`studio-wasm64-drawing-core.wasm` 연동).
 *
 * - `../wasm64-runtime-bridge`의 실물 컴파일 `.wasm` 런타임을 지연·비차단으로 예열(`warmStudioWasmFilterRuntime`)한다.
 * - 로드 완료 후에는 동기식 캐시 WASM 고속 경로로 `unsharp-mask` · `gaussian-blur` · `impasto-relief`를
 *   `Uint8ClampedArray` RGBA 버퍼 위에서 즉시 실행한다.
 * - WASM 미로드·비활성(`setStudioWasmFilterAccelerationEnabled(false)`)·실행 예외 상황에서는
 *   Rust 커널과 바이트 단위 동등한 JS 폴백으로 자동 전환하며 구조화된 텔레메트리를 기록한다.
 */

import {
  createStudioWasm64JsFallbackRuntime,
  DEFAULT_IMPASTO_LIGHT_PARAMS,
  loadStudioWasm64HotpathRuntime,
  type ImpastoLightParams,
  type LoadStudioWasm64HotpathOptions,
  type StudioWasm64HotpathRuntime,
  type Wasm64CpuTier,
  type Wasm64HotpathBackendMode,
} from "../wasm64-runtime-bridge";

export type StudioWasmAcceleratedFilterKind =
  | "unsharp-mask"
  | "gaussian-blur"
  | "impasto-relief";

export type StudioWasmFilterEngine = Wasm64HotpathBackendMode;

export interface StudioWasmFilterExecutionRequest {
  readonly filter: StudioWasmAcceleratedFilterKind;
  readonly rgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  /** 가우시안 표준편차(px). 미지정 시 `radius` 또는 필터 기본값을 사용한다. */
  readonly sigma?: number;
  /** `sigma` 미지정 시 사용할 반경(px) 별칭. */
  readonly radius?: number;
  /** 언샤프 마스크 강도 배수 (기본값 1.25). */
  readonly amount?: number;
  /** 언샤프 마스크 채널 차 임계값 0..255 (기본값 2). */
  readonly threshold?: number;
  /** 가우시안 블러 선택 영역 마스크 (`width * height`, 0=보호, 255=블러). */
  readonly selectionMask?: Uint8Array | null;
  /** 2.5D 임파스토 높이장 (`width * height`). 미지정 시 RGBA 휘도로 결정적 생성. */
  readonly heightMap?: Float32Array;
  /** 2.5D 임파스토 조명 파라미터 부분 재정의. */
  readonly light?: Partial<ImpastoLightParams>;
  /** true이면 입력 `rgba` 버퍼에도 결과를 덮어쓴다(기본값 false: 새 버퍼 반환). */
  readonly mutateInPlace?: boolean;
  /** true(기본값)이면 브라우저 환경에서 미로드 상태일 때 백그라운드 예열을 1회 예약한다. */
  readonly autoWarm?: boolean;
}

export interface StudioWasmFilterExecutionResult {
  readonly output: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly filter: StudioWasmAcceleratedFilterKind;
  readonly engine: StudioWasmFilterEngine;
  readonly cpuTier: Wasm64CpuTier;
  readonly addressBits: 64 | 32;
  readonly memory64Active: boolean;
  readonly durationMs: number;
  readonly affectedPixels: number;
  readonly wasmReady: boolean;
  readonly accelerated: boolean;
}

export interface StudioWasmFilterTelemetry {
  readonly enabled: boolean;
  readonly wasmReady: boolean;
  readonly cpuTier: Wasm64CpuTier;
  readonly addressBits: 64 | 32;
  readonly memory64Active: boolean;
  readonly resolvedWasmUrl: string | null;
  readonly wasmExecCount: number;
  readonly jsFallbackCount: number;
  readonly lastEngine: StudioWasmFilterEngine | null;
  readonly lastDurationMs: number;
  readonly estimatedSpeedupRatio: number;
  readonly lastFilter: StudioWasmAcceleratedFilterKind | null;
  readonly wasmByteLength: number;
  readonly fallbackReason: string | null;
}

/**
 * 실물 컴파일 `.wasm` 벤치마크 기준 추정 가속 배율 (세션 내 JS+WASM 쌍 실측 전까지만 추정치로 사용).
 * 실측 비교(wasmExecCount > 0 && jsFallbackCount > 0)가 쌓이면 실측 픽셀당 소요 시간 비로 대체한다.
 */
const BENCHMARK_PRIOR_SPEEDUP: Readonly<Record<StudioWasmAcceleratedFilterKind, number>> =
  Object.freeze({
    "unsharp-mask": 3.29,
    "gaussian-blur": 3.29,
    "impasto-relief": 4.94,
  });

let accelerationEnabled = true;
let cachedWasmRuntime: StudioWasm64HotpathRuntime | null = null;
let cachedJsFallbackRuntime: StudioWasm64HotpathRuntime | null = null;
let warmingPromise: Promise<StudioWasmFilterTelemetry> | null = null;
let autoWarmAttempted = false;

let wasmExecCount = 0;
let jsFallbackCount = 0;
let wasmTotalDurationMs = 0;
let wasmTotalPixels = 0;
let jsTotalDurationMs = 0;
let jsTotalPixels = 0;
let lastEngine: StudioWasmFilterEngine | null = null;
let lastDurationMs = 0;
let lastFilter: StudioWasmAcceleratedFilterKind | null = null;
let lastFallbackReason: string | null = null;

function roundRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.round(value * 100) / 100;
}

function getJsFallbackRuntime(): StudioWasm64HotpathRuntime {
  if (!cachedJsFallbackRuntime) {
    cachedJsFallbackRuntime = createStudioWasm64JsFallbackRuntime(
      "필터 브리지 바이트 동등 JS 폴백 런타임",
    );
  }
  return cachedJsFallbackRuntime;
}

function isWasmRuntimeReady(): boolean {
  return (
    cachedWasmRuntime !== null &&
    cachedWasmRuntime.getMetadata().backendMode === "rust-wasm"
  );
}

function computeEstimatedSpeedupRatio(): number {
  const ready = isWasmRuntimeReady();
  if (!accelerationEnabled || !ready || wasmExecCount === 0) {
    return 1;
  }
  if (jsFallbackCount > 0 && wasmTotalPixels > 0 && jsTotalPixels > 0) {
    const wasmMsPerPixel = wasmTotalDurationMs / wasmTotalPixels;
    const jsMsPerPixel = jsTotalDurationMs / jsTotalPixels;
    if (wasmMsPerPixel > 0 && jsMsPerPixel > 0) {
      return roundRatio(Math.max(0.1, Math.min(50, jsMsPerPixel / wasmMsPerPixel)));
    }
  }
  const refFilter = lastFilter ?? "unsharp-mask";
  return BENCHMARK_PRIOR_SPEEDUP[refFilter];
}

function resolveSigma(
  sigma: number | undefined,
  radius: number | undefined,
  fallback: number,
): number {
  if (typeof sigma === "number" && Number.isFinite(sigma) && sigma > 0) {
    return sigma;
  }
  if (typeof radius === "number" && Number.isFinite(radius) && radius > 0) {
    return radius;
  }
  return fallback;
}

/** RGBA 버퍼에서 알파 가중 휘도 기반 2.5D 임파스토 높이장(0..1)을 결정적으로 생성한다. */
export function deriveStudioImpastoHeightMapFromRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const pixelCount = width * height;
  const heightMap = new Float32Array(pixelCount);
  for (let p = 0; p < pixelCount; p += 1) {
    const off = p * 4;
    const r = rgba[off] ?? 0;
    const g = rgba[off + 1] ?? 0;
    const b = rgba[off + 2] ?? 0;
    const a = (rgba[off + 3] ?? 0) / 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    heightMap[p] = lum * a;
  }
  return heightMap;
}

function validateRgbaDimensions(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new RangeError(`유효하지 않은 필터 해상도입니다: ${width}×${height}`);
  }
  const expectedBytes = width * height * 4;
  if (rgba.length < expectedBytes) {
    throw new RangeError(
      `RGBA 버퍼 길이가 부족합니다: actual=${rgba.length}, expected=${expectedBytes}`,
    );
  }
  return expectedBytes;
}

function maybeScheduleAutoWarm(autoWarm: boolean | undefined): void {
  if (autoWarm === false || !accelerationEnabled || isWasmRuntimeReady()) return;
  if (autoWarmAttempted || warmingPromise !== null) return;
  if (typeof window === "undefined" || typeof fetch !== "function") return;
  const protocol = window.location?.protocol;
  if (protocol !== "http:" && protocol !== "https:") return;
  autoWarmAttempted = true;
  void warmStudioWasmFilterRuntime();
}

/** 실시간 WASM 필터 가속 사용 여부를 전환한다. false 시 바이트 동등 JS 폴백으로 즉시 우회한다. */
export function setStudioWasmFilterAccelerationEnabled(enabled: boolean): boolean {
  accelerationEnabled = Boolean(enabled);
  return accelerationEnabled;
}

/** 현재 WASM 필터 가속 활성화 여부를 반환한다. */
export function isStudioWasmFilterAccelerationEnabled(): boolean {
  return accelerationEnabled;
}

/** 현재 WASM 필터 런타임의 구조화된 텔레메트리 스냅샷을 반환한다. */
export function getStudioWasmFilterTelemetry(): StudioWasmFilterTelemetry {
  const ready = isWasmRuntimeReady();
  const meta = cachedWasmRuntime?.getMetadata() ?? null;
  return Object.freeze({
    enabled: accelerationEnabled,
    wasmReady: ready,
    cpuTier: ready && meta ? meta.cpuTier : "js-fallback",
    addressBits: ready && meta ? meta.addressBits : 32,
    memory64Active: Boolean(ready && meta?.memory64Active),
    resolvedWasmUrl: ready && meta ? meta.resolvedUrl : null,
    wasmExecCount,
    jsFallbackCount,
    lastEngine,
    lastDurationMs,
    estimatedSpeedupRatio: computeEstimatedSpeedupRatio(),
    lastFilter,
    wasmByteLength: ready && meta ? meta.wasmByteLength : 0,
    fallbackReason: ready ? null : lastFallbackReason,
  });
}

/**
 * `studio-wasm64-drawing-core.wasm` 런타임을 백그라운드에서 지연 예열한다.
 * - 기본 호출은 진행 중인 예열 Promise를 재사용한다.
 * - `options`(예: `wasmBytes`, `fetchFn`, `wasmUrl`)를 넘기면 해당 소스로 런타임을 새로 로드·교체한다.
 * - 로드 실패 시 예외를 던지지 않고 JS 폴백 사유를 기록한 텔레메트리 스냅샷을 반환한다.
 */
export async function warmStudioWasmFilterRuntime(
  options?: LoadStudioWasm64HotpathOptions,
): Promise<StudioWasmFilterTelemetry> {
  const hasExplicitOptions = options !== undefined && Object.keys(options).length > 0;
  if (!hasExplicitOptions) {
    if (isWasmRuntimeReady()) {
      return getStudioWasmFilterTelemetry();
    }
    if (warmingPromise) {
      return warmingPromise;
    }
  }

  const loadPromise = loadStudioWasm64HotpathRuntime(options)
    .then((runtime) => {
      const meta = runtime.getMetadata();
      if (meta.backendMode === "rust-wasm") {
        if (cachedWasmRuntime && cachedWasmRuntime !== runtime) {
          cachedWasmRuntime.dispose();
        }
        cachedWasmRuntime = runtime;
        lastFallbackReason = null;
      } else {
        runtime.dispose();
        lastFallbackReason = meta.fallbackReason ?? "WASM 백엔드 비활성화";
      }
      return getStudioWasmFilterTelemetry();
    })
    .catch((error: unknown) => {
      lastFallbackReason = error instanceof Error ? error.message : String(error);
      return getStudioWasmFilterTelemetry();
    })
    .finally(() => {
      if (warmingPromise === loadPromise) {
        warmingPromise = null;
      }
    });

  if (!hasExplicitOptions) {
    warmingPromise = loadPromise;
  }
  return loadPromise;
}

function runKernelOnRuntime(
  runtime: StudioWasm64HotpathRuntime,
  request: StudioWasmFilterExecutionRequest,
  inputBytes: Uint8Array,
  forceBackend: StudioWasmFilterEngine,
): {
  readonly outputBytes: Uint8Array;
  readonly affectedPixels: number;
  readonly durationMs: number;
  readonly engine: StudioWasmFilterEngine;
} {
  const { filter, width, height } = request;
  if (filter === "unsharp-mask") {
    const res = runtime.unsharpMaskRgba(inputBytes, width, height, {
      sigma: resolveSigma(request.sigma, request.radius, 1.4),
      amount: request.amount ?? 1.25,
      threshold: request.threshold ?? 2,
      forceBackend,
    });
    return {
      outputBytes: res.output,
      affectedPixels: res.modifiedPixels,
      durationMs: res.elapsedMs,
      engine: res.backendMode,
    };
  }
  if (filter === "gaussian-blur") {
    const mask =
      request.selectionMask && request.selectionMask.length >= width * height
        ? request.selectionMask.subarray(0, width * height)
        : null;
    const res = runtime.gaussianBlurRgba(inputBytes, width, height, {
      sigma: resolveSigma(request.sigma, request.radius, 1.6),
      selectionMask: mask,
      forceBackend,
    });
    return {
      outputBytes: res.output,
      affectedPixels: res.processedPixels,
      durationMs: res.elapsedMs,
      engine: res.backendMode,
    };
  }

  const pixelCount = width * height;
  const heightMap =
    request.heightMap && request.heightMap.length >= pixelCount
      ? request.heightMap.subarray(0, pixelCount)
      : deriveStudioImpastoHeightMapFromRgba(inputBytes, width, height);
  const res = runtime.applyImpastoLightingRgba(inputBytes, heightMap, width, height, {
    light: request.light ? { ...DEFAULT_IMPASTO_LIGHT_PARAMS, ...request.light } : undefined,
    forceBackend,
  });
  return {
    outputBytes: res.output,
    affectedPixels: res.shadedPixels,
    durationMs: res.elapsedMs,
    engine: res.backendMode,
  };
}

/**
 * `Uint8ClampedArray` RGBA 버퍼에 대해 WASM 가속 또는 바이트 동등 JS 폴백으로 필터를 동기 실행한다.
 */
export function executeStudioFilterWithWasmAcceleration(
  request: StudioWasmFilterExecutionRequest,
): StudioWasmFilterExecutionResult {
  const expectedBytes = validateRgbaDimensions(request.rgba, request.width, request.height);
  const inputBytes = new Uint8Array(
    request.rgba.buffer,
    request.rgba.byteOffset,
    expectedBytes,
  );
  const pixelCount = request.width * request.height;

  const readyBefore = isWasmRuntimeReady();
  const tryWasm = accelerationEnabled && readyBefore && cachedWasmRuntime !== null;
  if (!tryWasm) {
    maybeScheduleAutoWarm(request.autoWarm);
  }

  let kernelResult: {
    readonly outputBytes: Uint8Array;
    readonly affectedPixels: number;
    readonly durationMs: number;
    readonly engine: StudioWasmFilterEngine;
  };

  if (tryWasm && cachedWasmRuntime) {
    try {
      kernelResult = runKernelOnRuntime(cachedWasmRuntime, request, inputBytes, "rust-wasm");
    } catch (error: unknown) {
      lastFallbackReason = error instanceof Error ? error.message : String(error);
      kernelResult = runKernelOnRuntime(getJsFallbackRuntime(), request, inputBytes, "js-fallback");
    }
  } else {
    kernelResult = runKernelOnRuntime(getJsFallbackRuntime(), request, inputBytes, "js-fallback");
  }

  if (kernelResult.engine === "rust-wasm") {
    wasmExecCount += 1;
    wasmTotalDurationMs += Math.max(0, kernelResult.durationMs);
    wasmTotalPixels += pixelCount;
  } else {
    jsFallbackCount += 1;
    jsTotalDurationMs += Math.max(0, kernelResult.durationMs);
    jsTotalPixels += pixelCount;
  }
  lastEngine = kernelResult.engine;
  lastDurationMs = kernelResult.durationMs;
  lastFilter = request.filter;

  const output = new Uint8ClampedArray(
    kernelResult.outputBytes.buffer,
    kernelResult.outputBytes.byteOffset,
    expectedBytes,
  );
  if (request.mutateInPlace) {
    request.rgba.set(output, 0);
  }

  const activeMeta =
    kernelResult.engine === "rust-wasm" && cachedWasmRuntime
      ? cachedWasmRuntime.getMetadata()
      : null;
  const activeCpuTier: Wasm64CpuTier = activeMeta ? activeMeta.cpuTier : "js-fallback";

  return {
    output: request.mutateInPlace ? request.rgba : output,
    width: request.width,
    height: request.height,
    filter: request.filter,
    engine: kernelResult.engine,
    cpuTier: activeCpuTier,
    addressBits: activeMeta ? activeMeta.addressBits : 32,
    memory64Active: Boolean(activeMeta?.memory64Active),
    durationMs: kernelResult.durationMs,
    affectedPixels: kernelResult.affectedPixels,
    wasmReady: isWasmRuntimeReady(),
    accelerated: kernelResult.engine === "rust-wasm",
  };
}

/** 캐시된 WASM 런타임과 텔레메트리 카운터를 초기화한다(테스트 격리·해제용). */
export function resetStudioWasmFilterBridge(): void {
  if (cachedWasmRuntime) {
    cachedWasmRuntime.dispose();
    cachedWasmRuntime = null;
  }
  if (cachedJsFallbackRuntime) {
    cachedJsFallbackRuntime.dispose();
    cachedJsFallbackRuntime = null;
  }
  accelerationEnabled = true;
  warmingPromise = null;
  autoWarmAttempted = false;
  wasmExecCount = 0;
  jsFallbackCount = 0;
  wasmTotalDurationMs = 0;
  wasmTotalPixels = 0;
  jsTotalDurationMs = 0;
  jsTotalPixels = 0;
  lastEngine = null;
  lastDurationMs = 0;
  lastFilter = null;
  lastFallbackReason = null;
}
