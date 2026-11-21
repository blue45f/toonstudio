/**
 * WebAssembly 64-bit (`memory64`, `i64` 주소 지정) 실실행 래스터 컴퓨트 커널.
 *
 * - 기존 Memory64 거버너 계약(`WasmMemory64Capability.ts`, `Memory64WorkloadCoordinator.ts`)을
 *   준수하는 일회용 연산 스크래치 아레나(disposable compute scratch arena) 전용이다.
 * - 원본 원고 상태(Canonical IR)나 영구 저장소를 직접 기록하지 않는다.
 * - Chrome 133+ 및 Node 24 V8에서는 정식 Memory64(`0x05` 한계 플래그 + `i64` 주소) 바이너리를
 *   검증·인스턴스화해 네이티브 실행하며, 미지원 구형 런타임에서만 동일 수학의 JS 안전 폴백을 쓴다.
 */

import {
  STUDIO_WASM32_ADDRESS_LIMIT_BYTES,
  STUDIO_WASM_PAGE_BYTES,
  STUDIO_WEB_MEMORY64_ADDRESS_LIMIT_BYTES,
} from "../studio-wasm64-memory-governor";

import {
  planWasmScratchWorkingSet,
  probeWasmMemory64Capability,
  WASM_MEMORY64_ACCELERATOR_POLICY,
  type WasmMemory64CapabilityReceipt,
} from "./WasmMemory64Capability";
import {
  buildWasm64RasterModuleBytes,
  WASM_MEMORY64_LIMITS_FLAG,
} from "./wasm64-raster-binary-builder";
import {
  buildWebtoonTonalLut256x3,
  fnv1aChecksum32,
  jsApplyTonalLut,
  jsCompositeLayerMultiply,
  jsCompositeLayerSourceOver,
  jsStampSoftBrushDab,
} from "./wasm64-raster-fallback";

export { buildWasm64RasterModuleBytes, buildWebtoonTonalLut256x3, WASM_MEMORY64_LIMITS_FLAG };

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);

/** Chrome Web Memory64 주소 공간 한도(16 GiB = 262,144 pages). */
export const WASM64_WEB_MAX_PAGES =
  STUDIO_WEB_MEMORY64_ADDRESS_LIMIT_BYTES / STUDIO_WASM_PAGE_BYTES;

/** 4 GiB 경계 페이지 수(65,536 pages). */
export const WASM32_BOUNDARY_PAGES =
  STUDIO_WASM32_ADDRESS_LIMIT_BYTES / STUDIO_WASM_PAGE_BYTES;

/** 기본 초기 커밋 페이지: 64 pages = 4 MiB. */
export const WASM64_RASTER_DEFAULT_INITIAL_PAGES = BigInt(64);

/** 기본 최대 주소 공간 예약: 131,072 pages = 8 GiB (> 4 GiB 64비트 주소 공간 정책). */
export const WASM64_RASTER_DEFAULT_MAX_PAGES = BigInt(131_072);

/** 메모리 압박 시 안전 축소 재시도 하한: 16 pages = 1 MiB. */
export const WASM64_RASTER_DEFAULT_MIN_PAGES = BigInt(16);

export type Wasm64RasterBackend = "wasm64-native" | "js-fallback";

export interface Wasm64RasterExports {
  readonly applyTonalLut64: (pixelPtr: bigint, pixelCount: bigint, lutPtr: bigint) => void;
  readonly compositeLayerSourceOver64: (
    dstPtr: bigint,
    srcPtr: bigint,
    pixelCount: bigint,
    opacity255: number,
  ) => void;
  readonly compositeLayerMultiply64: (
    dstPtr: bigint,
    srcPtr: bigint,
    pixelCount: bigint,
    opacity255: number,
  ) => void;
  readonly stampSoftBrushDab64: (
    canvasPtr: bigint,
    width: bigint,
    height: bigint,
    cx: number,
    cy: number,
    radius: number,
    r: number,
    g: number,
    b: number,
    alpha255: number,
    hardness255: number,
  ) => number;
}

export interface Wasm64RasterEngineOptions {
  readonly initialPages?: bigint;
  readonly maximumPages?: bigint;
  readonly minimumPages?: bigint;
  readonly allowFallback?: boolean;
  readonly webAssembly?: typeof WebAssembly | null;
}

export interface Wasm64RasterBenchmarkStage {
  readonly id: "brush-dab" | "source-over" | "multiply" | "tonal-lut";
  readonly label: string;
  readonly elapsedMs: number;
  readonly pixelsProcessed: number;
  readonly megaPixelsPerSec: number;
}

export interface Wasm64RasterBenchmarkReport {
  readonly backend: Wasm64RasterBackend;
  readonly addressMode: "i64" | "js-heap";
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly totalPixelsProcessed: number;
  readonly brushDabCount: number;
  readonly totalTouchedBrushPixels: number;
  readonly totalElapsedMs: number;
  readonly throughputMegaPixelsPerSec: number;
  readonly reservedAddressSpaceBytes: bigint;
  readonly committedBytes: bigint;
  readonly exceeds4GiBAddressSpace: boolean;
  readonly allocationAttempts: number;
  readonly moduleByteLength: number;
  readonly outputChecksum32: number;
  readonly stages: readonly Wasm64RasterBenchmarkStage[];
}

export interface Wasm64RasterEngine {
  readonly backend: Wasm64RasterBackend;
  readonly addressType: "i64" | "js-heap";
  readonly moduleValidated: boolean;
  readonly moduleByteLength: number;
  readonly memory: WebAssembly.Memory | null;
  readonly wasmExports: Wasm64RasterExports | null;
  readonly initialPages: bigint;
  readonly maximumPages: bigint;
  readonly reservedAddressSpaceBytes: bigint;
  readonly exceeds4GiBAddressSpace: boolean;
  readonly allocationAttempts: number;
  readonly fallbackReason: string | null;
  readonly capability: WasmMemory64CapabilityReceipt;
  readonly policy: typeof WASM_MEMORY64_ACCELERATOR_POLICY;
  readonly committedBytes: bigint;
  readonly committedPages: bigint;
  readonly disposed: boolean;
  ensureCapacity(requiredBytes: bigint): boolean;
  getScratchView(offset: bigint, byteLength: number): Uint8Array;
  applyTonalLut64(pixelPtr: bigint, pixelCount: bigint, lutPtr: bigint): void;
  compositeLayerSourceOver64(
    dstPtr: bigint,
    srcPtr: bigint,
    pixelCount: bigint,
    opacity255: number,
  ): void;
  compositeLayerMultiply64(
    dstPtr: bigint,
    srcPtr: bigint,
    pixelCount: bigint,
    opacity255: number,
  ): void;
  stampSoftBrushDab64(
    canvasPtr: bigint,
    width: bigint,
    height: bigint,
    cx: number,
    cy: number,
    radius: number,
    r: number,
    g: number,
    b: number,
    alpha255: number,
    hardness255: number,
  ): number;
  runBenchmark(options?: {
    readonly width?: number;
    readonly height?: number;
    readonly brushDabs?: number;
  }): Wasm64RasterBenchmarkReport;
  dispose(): void;
}

interface Memory64Descriptor {
  readonly address: "i64";
  readonly initial: bigint;
  readonly maximum: bigint;
}

type Memory64Constructor = new (descriptor: Memory64Descriptor) => WebAssembly.Memory;

type Memory64AllocOutcome =
  | {
      readonly ok: true;
      readonly memory: WebAssembly.Memory;
      readonly initialPages: bigint;
      readonly maximumPages: bigint;
      readonly attempts: number;
    }
  | {
      readonly ok: false;
      readonly attempts: number;
      readonly reason: string;
    };

let cachedDefaultWasm64ModuleBytes: Uint8Array | null = null;

function defaultWasm64ModuleBytes(): Uint8Array {
  if (!cachedDefaultWasm64ModuleBytes) {
    cachedDefaultWasm64ModuleBytes = buildWasm64RasterModuleBytes({
      initialPages: ONE,
      maximumPages: WASM64_WEB_MAX_PAGES,
    });
  }
  return cachedDefaultWasm64ModuleBytes;
}

function ceilPages(byteLength: bigint): bigint {
  if (byteLength <= ZERO) return ZERO;
  return (byteLength + STUDIO_WASM_PAGE_BYTES - ONE) / STUDIO_WASM_PAGE_BYTES;
}

function resolveWebAssemblyHost(
  override: typeof WebAssembly | null | undefined,
): typeof WebAssembly | null {
  if (override === null) return null;
  if (override !== undefined) return override;
  return typeof WebAssembly === "object" ? WebAssembly : null;
}

function allocateMemory64WithSafeShrink(
  webAssembly: typeof WebAssembly,
  requestedInitial: bigint,
  requestedMaximum: bigint,
  minimumPages: bigint,
): Memory64AllocOutcome {
  const MemoryCtor = webAssembly.Memory as unknown as Memory64Constructor;
  const clampedMax =
    requestedMaximum > WASM64_WEB_MAX_PAGES ? WASM64_WEB_MAX_PAGES : requestedMaximum;
  let currentMax = clampedMax < minimumPages ? minimumPages : clampedMax;
  let currentInitial = requestedInitial > currentMax ? currentMax : requestedInitial;
  if (currentInitial < ONE) currentInitial = ONE;

  let attempts = 0;
  let lastError = "memory64-allocation-failed";

  while (attempts < 24) {
    attempts += 1;
    try {
      const memory = new MemoryCtor({
        address: "i64",
        initial: currentInitial,
        maximum: currentMax,
      });
      return {
        ok: true,
        memory,
        initialPages: currentInitial,
        maximumPages: currentMax,
        attempts,
      };
    } catch (caught) {
      lastError = caught instanceof Error ? caught.message : String(caught);
      if (currentMax <= minimumPages && currentInitial <= minimumPages) break;
      const nextMax = currentMax / TWO;
      currentMax = nextMax >= minimumPages ? nextMax : minimumPages;
      if (currentInitial > currentMax) {
        currentInitial = currentMax;
      } else if (currentInitial > minimumPages) {
        const nextInit = currentInitial / TWO;
        currentInitial = nextInit >= minimumPages ? nextInit : minimumPages;
      }
    }
  }
  return { ok: false, attempts, reason: lastError };
}

function isWasm64ExportSet(
  exportsObject: WebAssembly.Exports,
): exportsObject is WebAssembly.Exports & Wasm64RasterExports {
  return (
    typeof exportsObject.applyTonalLut64 === "function"
    && typeof exportsObject.compositeLayerSourceOver64 === "function"
    && typeof exportsObject.compositeLayerMultiply64 === "function"
    && typeof exportsObject.stampSoftBrushDab64 === "function"
  );
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function createWasm64RasterEngine(
  options: Wasm64RasterEngineOptions = {},
): Wasm64RasterEngine {
  const requestedInitial = options.initialPages ?? WASM64_RASTER_DEFAULT_INITIAL_PAGES;
  const requestedMaximum = options.maximumPages ?? WASM64_RASTER_DEFAULT_MAX_PAGES;
  const minimumPages = options.minimumPages ?? WASM64_RASTER_DEFAULT_MIN_PAGES;
  const allowFallback = options.allowFallback ?? true;

  const capability = probeWasmMemory64Capability({
    webAssembly: options.webAssembly,
    selectedRuntime: "memory64",
  });
  const webAssembly = resolveWebAssemblyHost(options.webAssembly);
  const moduleBytes = defaultWasm64ModuleBytes();

  let backend: Wasm64RasterBackend = "js-fallback";
  let moduleValidated = false;
  let memory: WebAssembly.Memory | null = null;
  let wasmExports: Wasm64RasterExports | null = null;
  let initialPages = requestedInitial;
  let maximumPages =
    requestedMaximum > WASM64_WEB_MAX_PAGES ? WASM64_WEB_MAX_PAGES : requestedMaximum;
  let allocationAttempts = 0;
  let fallbackReason: string | null = null;
  let fallbackBuffer: Uint8Array | null = null;
  let isDisposed = false;

  if (webAssembly && capability.isMemory64Supported) {
    try {
      moduleValidated = webAssembly.validate(moduleBytes as BufferSource);
    } catch {
      moduleValidated = false;
    }

    if (moduleValidated) {
      const requestedBytes = requestedInitial * STUDIO_WASM_PAGE_BYTES;
      planWasmScratchWorkingSet(
        { selectedRuntime: capability.selectedRuntime },
        {
          availableBytes: requestedMaximum * STUDIO_WASM_PAGE_BYTES,
          availablePages: requestedMaximum,
        },
        {
          workload: "brush",
          logicalByteLength: requestedBytes,
          preferredChunkBytes: requestedBytes,
          minimumChunkBytes: minimumPages * STUDIO_WASM_PAGE_BYTES,
        },
      );

      const alloc = allocateMemory64WithSafeShrink(
        webAssembly,
        requestedInitial,
        requestedMaximum,
        minimumPages,
      );
      allocationAttempts = alloc.attempts;

      if (alloc.ok) {
        try {
          const wasmModule = new webAssembly.Module(moduleBytes as BufferSource);
          const instance = new webAssembly.Instance(wasmModule, {
            env: { memory: alloc.memory },
          });
          if (isWasm64ExportSet(instance.exports)) {
            backend = "wasm64-native";
            memory = alloc.memory;
            wasmExports = instance.exports;
            initialPages = alloc.initialPages;
            maximumPages = alloc.maximumPages;
          } else {
            fallbackReason = "wasm64-exports-incomplete";
          }
        } catch (caught) {
          fallbackReason = caught instanceof Error ? caught.message : "wasm64-instantiation-failed";
        }
      } else {
        fallbackReason = alloc.reason;
      }
    } else {
      fallbackReason = "wasm64-module-validation-failed";
    }
  } else {
    fallbackReason = "memory64-runtime-unsupported";
  }

  if (backend !== "wasm64-native") {
    if (!allowFallback) {
      throw new Error(`WebAssembly Memory64 engine unavailable: ${fallbackReason ?? "unknown"}`);
    }
    const initialBytes = Number(
      (requestedInitial > BigInt(256) ? BigInt(256) : requestedInitial) * STUDIO_WASM_PAGE_BYTES,
    );
    fallbackBuffer = new Uint8Array(Math.max(Number(STUDIO_WASM_PAGE_BYTES), initialBytes));
  }

  const assertAlive = () => {
    if (isDisposed) throw new Error("Wasm64RasterEngine has been disposed");
  };

  const currentBytes = (): bigint => {
    if (memory) return BigInt(memory.buffer.byteLength);
    return BigInt(fallbackBuffer ? fallbackBuffer.byteLength : 0);
  };

  const ensureCapacity = (requiredBytes: bigint): boolean => {
    assertAlive();
    if (requiredBytes <= ZERO) return true;
    const have = currentBytes();
    if (requiredBytes <= have) return true;
    const neededPages = ceilPages(requiredBytes);
    if (memory) {
      if (neededPages > maximumPages) return false;
      const delta = neededPages - have / STUDIO_WASM_PAGE_BYTES;
      if (delta <= ZERO) return true;
      try {
        (memory.grow as unknown as (deltaPages: bigint) => bigint)(delta);
        return BigInt(memory.buffer.byteLength) >= requiredBytes;
      } catch {
        return false;
      }
    }
    const next = new Uint8Array(Number(neededPages * STUDIO_WASM_PAGE_BYTES));
    if (fallbackBuffer) next.set(fallbackBuffer);
    fallbackBuffer = next;
    return true;
  };

  const getScratchView = (offset: bigint, byteLength: number): Uint8Array => {
    assertAlive();
    const start = Number(offset);
    if (memory) return new Uint8Array(memory.buffer, start, byteLength);
    if (!fallbackBuffer) throw new Error("Scratch buffer unavailable");
    return fallbackBuffer.subarray(start, start + byteLength);
  };

  const applyTonalLut64 = (pixelPtr: bigint, pixelCount: bigint, lutPtr: bigint): void => {
    assertAlive();
    if (wasmExports) wasmExports.applyTonalLut64(pixelPtr, pixelCount, lutPtr);
    else if (fallbackBuffer) jsApplyTonalLut(fallbackBuffer, pixelPtr, pixelCount, lutPtr);
  };

  const compositeLayerSourceOver64 = (
    dstPtr: bigint,
    srcPtr: bigint,
    pixelCount: bigint,
    opacity255: number,
  ): void => {
    assertAlive();
    if (wasmExports) wasmExports.compositeLayerSourceOver64(dstPtr, srcPtr, pixelCount, opacity255);
    else if (fallbackBuffer) {
      jsCompositeLayerSourceOver(fallbackBuffer, dstPtr, srcPtr, pixelCount, opacity255);
    }
  };

  const compositeLayerMultiply64 = (
    dstPtr: bigint,
    srcPtr: bigint,
    pixelCount: bigint,
    opacity255: number,
  ): void => {
    assertAlive();
    if (wasmExports) wasmExports.compositeLayerMultiply64(dstPtr, srcPtr, pixelCount, opacity255);
    else if (fallbackBuffer) {
      jsCompositeLayerMultiply(fallbackBuffer, dstPtr, srcPtr, pixelCount, opacity255);
    }
  };

  const stampSoftBrushDab64 = (
    canvasPtr: bigint,
    width: bigint,
    height: bigint,
    cx: number,
    cy: number,
    radius: number,
    r: number,
    g: number,
    b: number,
    alpha255: number,
    hardness255: number,
  ): number => {
    assertAlive();
    if (wasmExports) {
      return wasmExports.stampSoftBrushDab64(
        canvasPtr, width, height, cx, cy, radius, r, g, b, alpha255, hardness255,
      );
    }
    if (!fallbackBuffer) return 0;
    return jsStampSoftBrushDab(
      fallbackBuffer, canvasPtr, width, height, cx, cy, radius, r, g, b, alpha255, hardness255,
    );
  };

  const runBenchmark = (benchOptions?: {
    readonly width?: number;
    readonly height?: number;
    readonly brushDabs?: number;
  }): Wasm64RasterBenchmarkReport => {
    assertAlive();
    const width = Math.max(16, Math.min(2048, Math.trunc(benchOptions?.width ?? 512)));
    const height = Math.max(16, Math.min(2048, Math.trunc(benchOptions?.height ?? 512)));
    const brushDabs = Math.max(1, Math.min(64, Math.trunc(benchOptions?.brushDabs ?? 12)));
    const pixelCount = width * height;
    const layerBytes = pixelCount * 4;
    const lutBytes = 256 * 3;

    const dstPtr = ZERO;
    const srcPtr = BigInt(layerBytes);
    const shadowPtr = BigInt(layerBytes * 2);
    const lutPtr = BigInt(layerBytes * 3);
    if (!ensureCapacity(lutPtr + BigInt(lutBytes))) {
      throw new Error(`Scratch arena cannot fit ${(lutPtr + BigInt(lutBytes)).toString()} bytes`);
    }

    const dstView = getScratchView(dstPtr, layerBytes);
    const srcView = getScratchView(srcPtr, layerBytes);
    const shadowView = getScratchView(shadowPtr, layerBytes);
    getScratchView(lutPtr, lutBytes).set(buildWebtoonTonalLut256x3());

    for (let y = 0; y < height; y += 1) {
      const yFactor = (y * 255) / height;
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4;
        dstView[idx] = (232 - (x * 40) / width) | 0;
        dstView[idx + 1] = (224 - (yFactor * 28) / 255) | 0;
        dstView[idx + 2] = 216;
        dstView[idx + 3] = 255;

        srcView[idx] = (48 + (x * 160) / width) | 0;
        srcView[idx + 1] = (92 + (y * 120) / height) | 0;
        srcView[idx + 2] = 212;
        srcView[idx + 3] = 168;

        shadowView[idx] = 178;
        shadowView[idx + 1] = 168;
        shadowView[idx + 2] = 214;
        shadowView[idx + 3] = 192;
      }
    }

    const wBig = BigInt(width);
    const hBig = BigInt(height);
    const pBig = BigInt(pixelCount);

    const t0 = nowMs();
    let totalTouchedBrushPixels = 0;
    for (let i = 0; i < brushDabs; i += 1) {
      const progress = (i + 0.5) / brushDabs;
      const cx = width * (0.15 + 0.7 * progress);
      const cy = height * (0.25 + 0.5 * Math.sin(progress * Math.PI));
      const radius = Math.min(width, height) * (0.06 + 0.04 * (i % 3));
      totalTouchedBrushPixels += stampSoftBrushDab64(
        dstPtr, wBig, hBig, cx, cy, radius,
        220 - i * 8, 72 + i * 10, 64 + i * 12, 200, i % 2 === 0 ? 180 : 255,
      );
    }
    const t1 = nowMs();
    compositeLayerSourceOver64(dstPtr, srcPtr, pBig, 196);
    const t2 = nowMs();
    compositeLayerMultiply64(dstPtr, shadowPtr, pBig, 210);
    const t3 = nowMs();
    applyTonalLut64(dstPtr, pBig, lutPtr);
    const t4 = nowMs();

    const rate = (px: number, ms: number) =>
      Number((px / (Math.max(0.001, ms) / 1000) / 1_000_000).toFixed(2));
    const brushMs = Math.max(0, t1 - t0);
    const overMs = Math.max(0, t2 - t1);
    const mulMs = Math.max(0, t3 - t2);
    const lutMs = Math.max(0, t4 - t3);
    const totalElapsedMs = Math.max(0.001, t4 - t0);
    const totalPixelsProcessed = totalTouchedBrushPixels + pixelCount * 3;
    const outputChecksum32 = fnv1aChecksum32(getScratchView(dstPtr, layerBytes));

    return Object.freeze({
      backend,
      addressMode: backend === "wasm64-native" ? "i64" : "js-heap",
      width,
      height,
      pixelCount,
      totalPixelsProcessed,
      brushDabCount: brushDabs,
      totalTouchedBrushPixels,
      totalElapsedMs: Number(totalElapsedMs.toFixed(3)),
      throughputMegaPixelsPerSec: rate(totalPixelsProcessed, totalElapsedMs),
      reservedAddressSpaceBytes:
        backend === "wasm64-native" ? maximumPages * STUDIO_WASM_PAGE_BYTES : currentBytes(),
      committedBytes: currentBytes(),
      exceeds4GiBAddressSpace:
        backend === "wasm64-native" && maximumPages > WASM32_BOUNDARY_PAGES,
      allocationAttempts,
      moduleByteLength: moduleBytes.byteLength,
      outputChecksum32,
      stages: Object.freeze([
        Object.freeze({
          id: "brush-dab" as const,
          label: "서브픽셀 브러시 댑 스탬핑",
          elapsedMs: Number(brushMs.toFixed(3)),
          pixelsProcessed: totalTouchedBrushPixels,
          megaPixelsPerSec: rate(totalTouchedBrushPixels, brushMs),
        }),
        Object.freeze({
          id: "source-over" as const,
          label: "Source-Over 레이어 합성",
          elapsedMs: Number(overMs.toFixed(3)),
          pixelsProcessed: pixelCount,
          megaPixelsPerSec: rate(pixelCount, overMs),
        }),
        Object.freeze({
          id: "multiply" as const,
          label: "웹툰 그림자 곱하기(Multiply) 합성",
          elapsedMs: Number(mulMs.toFixed(3)),
          pixelsProcessed: pixelCount,
          megaPixelsPerSec: rate(pixelCount, mulMs),
        }),
        Object.freeze({
          id: "tonal-lut" as const,
          label: "256×3 RGB 톤 LUT 변환",
          elapsedMs: Number(lutMs.toFixed(3)),
          pixelsProcessed: pixelCount,
          megaPixelsPerSec: rate(pixelCount, lutMs),
        }),
      ]),
    });
  };

  return {
    backend,
    addressType: backend === "wasm64-native" ? "i64" : "js-heap",
    moduleValidated,
    moduleByteLength: moduleBytes.byteLength,
    memory,
    wasmExports,
    initialPages,
    maximumPages,
    reservedAddressSpaceBytes:
      backend === "wasm64-native" ? maximumPages * STUDIO_WASM_PAGE_BYTES : currentBytes(),
    exceeds4GiBAddressSpace:
      backend === "wasm64-native" && maximumPages > WASM32_BOUNDARY_PAGES,
    allocationAttempts,
    fallbackReason,
    capability,
    policy: WASM_MEMORY64_ACCELERATOR_POLICY,
    get committedBytes() {
      return currentBytes();
    },
    get committedPages() {
      return currentBytes() / STUDIO_WASM_PAGE_BYTES;
    },
    get disposed() {
      return isDisposed;
    },
    ensureCapacity,
    getScratchView,
    applyTonalLut64,
    compositeLayerSourceOver64,
    compositeLayerMultiply64,
    stampSoftBrushDab64,
    runBenchmark,
    dispose() {
      isDisposed = true;
      fallbackBuffer = null;
    },
  };
}
