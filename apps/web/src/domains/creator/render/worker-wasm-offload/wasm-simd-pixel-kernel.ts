/**
 * 실제 WebAssembly + Wasm SIMD128(`v128`) RGBA 픽셀 커널 런타임 및 기능 프로브.
 *
 * - 가짜 목업이나 빈 스텁 없이 실제 Wasm 바이너리를 `WebAssembly.validate()`로 검증하고
 *   `WebAssembly.instantiate()`로 컴파일·실행한다.
 * - SIMD128 지원 런타임에서는 4픽셀(16바이트) 단위 `v128` 벡터 커널(`WASM_PIXEL_SIMD128_BYTES`)을,
 *   스칼라 Wasm 런타임에서는 표준 Wasm32 커널(`WASM_PIXEL_LUMA_INVERT_BYTES`)을,
 *   WebAssembly 미지원 환경에서는 바이트 단위 100% 동치 JS 폴백을 자동 선택한다.
 */

import {
  WASM_KERNEL_EXPORT_SPECS,
  WASM_MAX_PAGES,
  WASM_PAGE_BYTES,
  WASM_PIXEL_LUMA_INVERT_BYTES,
  WASM_PIXEL_SIMD128_BYTES,
  WASM_SIMD128_FUNC_PROBE_BYTES,
  WASM_SIMD128_PROBE_BYTES,
  type WasmKernelExportName,
  type WasmPixelKernelMode,
} from "./wasm-simd-binary-builder";

export {
  WASM_PIXEL_LUMA_INVERT_BYTES,
  WASM_PIXEL_SIMD128_BYTES,
  WASM_SIMD128_FUNC_PROBE_BYTES,
  WASM_SIMD128_PROBE_BYTES,
  type WasmPixelKernelMode,
};

const CHUNK_PIXEL_CAPACITY = (WASM_MAX_PAGES * WASM_PAGE_BYTES) / 4;

export type ComputeBackendTier =
  | "worker-wasm-simd128"
  | "worker-wasm-scalar"
  | "main-wasm-simd128"
  | "main-wasm-scalar"
  | "main-js-fallback";

export type WasmPixelKernelBackend =
  | "wasm-simd128"
  | "wasm-scalar"
  | "js-fallback";

export interface WasmSupportProbeEnvironment {
  readonly webAssembly?: typeof WebAssembly | undefined;
  readonly sharedArrayBuffer?: unknown;
  readonly crossOriginIsolated?: boolean;
  readonly offscreenCanvas?: unknown;
  readonly worker?: unknown;
  readonly hardwareConcurrency?: number;
}

export interface WasmSimdWorkerSupportSnapshot {
  readonly webAssembly: boolean;
  readonly wasmSimd128: boolean;
  readonly sharedArrayBuffer: boolean;
  readonly crossOriginIsolated: boolean;
  readonly wasmThreadsReady: boolean;
  readonly offscreenCanvas: boolean;
  readonly worker: boolean;
  readonly hardwareConcurrency: number;
  readonly recommendedPoolSize: number;
  readonly recommendedBackendTier: ComputeBackendTier;
  readonly probeBinaryByteLength: number;
}

export interface WasmPixelKernelRunOptions {
  /** 테스트·진단용 실행 백엔드 강제 지정 (기본값 `"auto"`) */
  readonly forceBackend?: "auto" | WasmPixelKernelBackend;
}

export interface WasmPixelKernelResult {
  readonly data: Uint8ClampedArray;
  readonly matchedPixelCount: number;
  readonly totalPixelCount: number;
  readonly backend: WasmPixelKernelBackend;
  readonly elapsedMs: number;
  readonly simdVectorPixels: number;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function clampByteInt(value: number): number {
  if (!Number.isFinite(value)) return 128;
  const truncated = Math.trunc(value);
  if (truncated < 0) return 0;
  if (truncated > 255) return 255;
  return truncated;
}

function resolveHardwareConcurrency(override?: number): number {
  const candidate =
    override !== undefined
      ? override
      : typeof navigator !== "undefined" && typeof navigator.hardwareConcurrency === "number"
        ? navigator.hardwareConcurrency
        : 4;
  if (!Number.isFinite(candidate) || candidate < 1) return 4;
  return Math.max(1, Math.min(64, Math.floor(candidate)));
}

/**
 * 실제 41바이트 표준 Wasm SIMD128(`v128.const`) 바이너리를 `WebAssembly.validate()`로 검증해
 * SIMD128, SharedArrayBuffer, crossOriginIsolated, OffscreenCanvas, Worker, CPU 코어 수를 프로브한다.
 */
export function probeWasmSimdAndWorkerSupport(
  env?: WasmSupportProbeEnvironment,
): WasmSimdWorkerSupportSnapshot {
  const wasmApi = env && "webAssembly" in env
    ? env.webAssembly
    : typeof WebAssembly !== "undefined"
      ? WebAssembly
      : undefined;

  const webAssembly =
    typeof wasmApi === "object"
    && wasmApi !== null
    && typeof wasmApi.validate === "function"
    && typeof wasmApi.instantiate === "function";

  let wasmSimd128 = false;
  if (webAssembly) {
    try {
      wasmSimd128 =
        wasmApi.validate(WASM_SIMD128_PROBE_BYTES)
        && wasmApi.validate(WASM_SIMD128_FUNC_PROBE_BYTES);
    } catch {
      wasmSimd128 = false;
    }
  }

  const sharedArrayBuffer = env && "sharedArrayBuffer" in env
    ? typeof env.sharedArrayBuffer === "function"
    : typeof SharedArrayBuffer === "function";

  const crossOriginIsolated = env && "crossOriginIsolated" in env
    ? Boolean(env.crossOriginIsolated)
    : typeof globalThis.crossOriginIsolated === "boolean" && globalThis.crossOriginIsolated;

  const offscreenCanvas = env && "offscreenCanvas" in env
    ? typeof env.offscreenCanvas === "function"
    : typeof OffscreenCanvas === "function";

  const worker = env && "worker" in env
    ? typeof env.worker === "function"
    : typeof Worker === "function";

  const hardwareConcurrency = resolveHardwareConcurrency(env?.hardwareConcurrency);
  const recommendedPoolSize = Math.min(4, Math.max(1, hardwareConcurrency - 1));

  let recommendedBackendTier: ComputeBackendTier;
  if (worker && wasmSimd128) {
    recommendedBackendTier = "worker-wasm-simd128";
  } else if (worker && webAssembly) {
    recommendedBackendTier = "worker-wasm-scalar";
  } else if (wasmSimd128) {
    recommendedBackendTier = "main-wasm-simd128";
  } else if (webAssembly) {
    recommendedBackendTier = "main-wasm-scalar";
  } else {
    recommendedBackendTier = "main-js-fallback";
  }

  return Object.freeze({
    webAssembly,
    wasmSimd128,
    sharedArrayBuffer,
    crossOriginIsolated,
    wasmThreadsReady: sharedArrayBuffer && crossOriginIsolated && wasmSimd128,
    offscreenCanvas,
    worker,
    hardwareConcurrency,
    recommendedPoolSize,
    recommendedBackendTier,
    probeBinaryByteLength: WASM_SIMD128_PROBE_BYTES.byteLength,
  });
}

type WasmPixelKernelFn = (ptr: number, pixelCount: number, param: number) => number;
type WasmKernelExports = Record<WasmKernelExportName, WasmPixelKernelFn>;

interface CachedWasmRuntime {
  readonly memory: WebAssembly.Memory;
  readonly exports: WasmKernelExports;
}

const runtimeCache: Partial<Record<"wasm-simd128" | "wasm-scalar", Promise<CachedWasmRuntime>>> = {};

function exportNameForMode(mode: WasmPixelKernelMode): WasmKernelExportName {
  switch (mode) {
    case "invert":
      return "invert_rgba";
    case "luma":
      return "luma_rgba";
    case "contrast":
      return "contrast_rgba";
    case "threshold":
      return "threshold_rgba";
    case "alpha-mask-count":
      return "alpha_mask_count";
    case "alpha-threshold":
      return "alpha_threshold_rgba";
  }
}

async function instantiateWasmRuntime(
  variant: "wasm-simd128" | "wasm-scalar",
): Promise<CachedWasmRuntime> {
  const memory = new WebAssembly.Memory({ initial: 1, maximum: WASM_MAX_PAGES });
  const bytes = variant === "wasm-simd128"
    ? WASM_PIXEL_SIMD128_BYTES
    : WASM_PIXEL_LUMA_INVERT_BYTES;
  const instantiated = await WebAssembly.instantiate(bytes, { env: { memory } });
  const rawExports = instantiated.instance.exports;

  const exportsMap = {} as Record<WasmKernelExportName, WasmPixelKernelFn>;
  for (const spec of WASM_KERNEL_EXPORT_SPECS) {
    const fn = rawExports[spec.exportName];
    if (typeof fn !== "function") {
      throw new Error(`Wasm 픽셀 커널 export 누락: ${spec.exportName}`);
    }
    exportsMap[spec.exportName] = fn as WasmPixelKernelFn;
  }

  return { memory, exports: exportsMap };
}

function getOrCreateWasmRuntime(
  variant: "wasm-simd128" | "wasm-scalar",
): Promise<CachedWasmRuntime> {
  const existing = runtimeCache[variant];
  if (existing) return existing;
  const pending = instantiateWasmRuntime(variant).catch((error: unknown) => {
    delete runtimeCache[variant];
    throw error;
  });
  runtimeCache[variant] = pending;
  return pending;
}

function ensureMemoryCapacity(memory: WebAssembly.Memory, neededBytes: number): void {
  const currentBytes = memory.buffer.byteLength;
  if (neededBytes <= currentBytes) return;
  const neededPages = Math.ceil((neededBytes - currentBytes) / WASM_PAGE_BYTES);
  memory.grow(neededPages);
}

/**
 * WebAssembly 미지원 환경용 순수 JS 완전 동치 레퍼런스 커널.
 * 입력 배열은 절대 변경하지 않고 항상 새 `Uint8ClampedArray`를 반환한다.
 */
export function runJsPixelKernelReference(
  rgba: Uint8ClampedArray | Uint8Array,
  mode: WasmPixelKernelMode,
  threshold = 128,
): WasmPixelKernelResult {
  const start = nowMs();
  const safeParam = clampByteInt(threshold);
  const pixelCount = Math.floor(rgba.byteLength / 4);
  const usedBytes = pixelCount * 4;
  const output = new Uint8ClampedArray(rgba.byteLength);
  output.set(rgba);

  let matched = 0;

  if (mode === "invert") {
    for (let i = 0; i < usedBytes; i += 4) {
      output[i] = 255 - (output[i] ?? 0);
      output[i + 1] = 255 - (output[i + 1] ?? 0);
      output[i + 2] = 255 - (output[i + 2] ?? 0);
      if ((output[i + 3] ?? 0) >= safeParam) matched += 1;
    }
  } else if (mode === "luma") {
    for (let i = 0; i < usedBytes; i += 4) {
      const r = output[i] ?? 0;
      const g = output[i + 1] ?? 0;
      const b = output[i + 2] ?? 0;
      const y = (54 * r + 183 * g + 19 * b + 128) >>> 8;
      output[i] = y;
      output[i + 1] = y;
      output[i + 2] = y;
      if (y >= safeParam) matched += 1;
    }
  } else if (mode === "contrast") {
    for (let i = 0; i < usedBytes; i += 4) {
      let r = ((((output[i] ?? 0) - 128) * safeParam) >> 7) + 128;
      let g = ((((output[i + 1] ?? 0) - 128) * safeParam) >> 7) + 128;
      let b = ((((output[i + 2] ?? 0) - 128) * safeParam) >> 7) + 128;
      r = r < 0 ? 0 : r > 255 ? 255 : r;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      b = b < 0 ? 0 : b > 255 ? 255 : b;
      output[i] = r;
      output[i + 1] = g;
      output[i + 2] = b;
      const y = (54 * r + 183 * g + 19 * b + 128) >>> 8;
      if (y >= 128) matched += 1;
    }
  } else if (mode === "threshold") {
    for (let i = 0; i < usedBytes; i += 4) {
      const r = output[i] ?? 0;
      const g = output[i + 1] ?? 0;
      const b = output[i + 2] ?? 0;
      const y = (54 * r + 183 * g + 19 * b + 128) >>> 8;
      const bin = y >= safeParam ? 255 : 0;
      output[i] = bin;
      output[i + 1] = bin;
      output[i + 2] = bin;
      if (y >= safeParam) matched += 1;
    }
  } else if (mode === "alpha-mask-count") {
    for (let i = 0; i < usedBytes; i += 4) {
      if ((output[i + 3] ?? 0) >= safeParam) matched += 1;
    }
  } else {
    for (let i = 0; i < usedBytes; i += 4) {
      const isOpaque = (output[i + 3] ?? 0) >= safeParam;
      output[i + 3] = isOpaque ? 255 : 0;
      if (isOpaque) matched += 1;
    }
  }

  return {
    data: output,
    matchedPixelCount: matched,
    totalPixelCount: pixelCount,
    backend: "js-fallback",
    elapsedMs: Math.max(0, nowMs() - start),
    simdVectorPixels: 0,
  };
}

/**
 * RGBA 버퍼를 선형 메모리(`WebAssembly.Memory`)에 올려 실제 `WebAssembly.instantiate()`
 * 커널(SIMD128 우선 -> 스칼라 Wasm -> JS 동치 폴백)로 처리한다.
 */
export async function runWasmPixelKernel(
  rgba: Uint8ClampedArray | Uint8Array,
  mode: WasmPixelKernelMode,
  threshold = 128,
  options?: WasmPixelKernelRunOptions,
): Promise<WasmPixelKernelResult> {
  const start = nowMs();
  const safeParam = clampByteInt(threshold);
  const totalPixelCount = Math.floor(rgba.byteLength / 4);
  const requestedBackend = options?.forceBackend ?? "auto";

  if (requestedBackend === "js-fallback") {
    return runJsPixelKernelReference(rgba, mode, safeParam);
  }

  const support = probeWasmSimdAndWorkerSupport();
  if (!support.webAssembly) {
    return runJsPixelKernelReference(rgba, mode, safeParam);
  }

  const chosenVariant: "wasm-simd128" | "wasm-scalar" | null =
    requestedBackend === "wasm-simd128"
      ? support.wasmSimd128
        ? "wasm-simd128"
        : null
      : requestedBackend === "wasm-scalar"
        ? "wasm-scalar"
        : support.wasmSimd128
          ? "wasm-simd128"
          : "wasm-scalar";

  if (chosenVariant === null) {
    return runJsPixelKernelReference(rgba, mode, safeParam);
  }

  if (totalPixelCount === 0) {
    const emptyCopy = new Uint8ClampedArray(rgba.byteLength);
    emptyCopy.set(rgba);
    try {
      await getOrCreateWasmRuntime(chosenVariant);
      return {
        data: emptyCopy,
        matchedPixelCount: 0,
        totalPixelCount: 0,
        backend: chosenVariant,
        elapsedMs: Math.max(0, nowMs() - start),
        simdVectorPixels: 0,
      };
    } catch {
      return runJsPixelKernelReference(rgba, mode, safeParam);
    }
  }

  try {
    const runtime = await getOrCreateWasmRuntime(chosenVariant);
    const kernelFn = runtime.exports[exportNameForMode(mode)];
    const output = new Uint8ClampedArray(rgba.byteLength);
    const usedBytes = totalPixelCount * 4;
    if (rgba.byteLength > usedBytes) {
      output.set(rgba.subarray(usedBytes), usedBytes);
    }

    let matchedPixelCount = 0;
    let simdVectorPixels = 0;
    let pixelOffset = 0;

    while (pixelOffset < totalPixelCount) {
      const chunkPixels = Math.min(CHUNK_PIXEL_CAPACITY, totalPixelCount - pixelOffset);
      const chunkBytes = chunkPixels * 4;
      const byteOffset = pixelOffset * 4;

      ensureMemoryCapacity(runtime.memory, chunkBytes);
      const linearView = new Uint8Array(runtime.memory.buffer, 0, chunkBytes);
      linearView.set(rgba.subarray(byteOffset, byteOffset + chunkBytes));

      const chunkMatched = kernelFn(0, chunkPixels, safeParam) >>> 0;
      matchedPixelCount += chunkMatched;
      if (chosenVariant === "wasm-simd128") {
        simdVectorPixels += chunkPixels & ~3;
      }

      if (mode === "alpha-mask-count") {
        output.set(rgba.subarray(byteOffset, byteOffset + chunkBytes), byteOffset);
      } else {
        output.set(new Uint8Array(runtime.memory.buffer, 0, chunkBytes), byteOffset);
      }

      pixelOffset += chunkPixels;
    }

    return {
      data: output,
      matchedPixelCount,
      totalPixelCount,
      backend: chosenVariant,
      elapsedMs: Math.max(0, nowMs() - start),
      simdVectorPixels,
    };
  } catch {
    if (chosenVariant === "wasm-simd128" && requestedBackend === "auto") {
      return runWasmPixelKernel(rgba, mode, safeParam, { forceBackend: "wasm-scalar" });
    }
    return runJsPixelKernelReference(rgba, mode, safeParam);
  }
}

/**
 * 테스트 격리용: 캐시된 Wasm 인스턴스 핸들을 초기화한다.
 */
export function resetWasmPixelKernelCacheForTests(): void {
  delete runtimeCache["wasm-simd128"];
  delete runtimeCache["wasm-scalar"];
}
