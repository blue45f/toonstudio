/**
 * Rust `studio-wasm64-drawing-core.wasm` 런타임 핫패스 브리지 공용 타입·계약 상수.
 */

import type { ImpastoLightParams } from "./wasm64-hotpath-js-fallback";

export type { ImpastoLightParams };

/** Vite `apps/web/public/wasm/` 정적 자산 기본 경로 (스칼라 · SIMD128 · Relaxed-SIMD · Memory64 · 확장 스위트). */
export const STUDIO_WASM64_CORE_URL = "/wasm/studio-wasm64-drawing-core.wasm";
export const STUDIO_WASM64_CORE_SIMD_URL = "/wasm/studio-wasm64-drawing-core-simd.wasm";
export const STUDIO_WASM64_CORE_RELAXED_SIMD_URL =
  "/wasm/studio-wasm64-drawing-core-relaxed-simd.wasm";
export const STUDIO_WASM64_CORE_MEMORY64_URL =
  "/wasm/studio-wasm64-drawing-core-memory64.wasm";
export const STUDIO_WASM64_EXTENDED_SUITE_URL = "/wasm/studio-wasm64-extended-suite.wasm";
export const STUDIO_WASM64_EXTENDED_SUITE_MEMORY64_URL =
  "/wasm/studio-wasm64-extended-suite-memory64.wasm";
export const WASM64_HOTPATH_EXPECTED_ABI = 1;
export const WASM64_HOTPATH_EXPECTED_CAPABILITIES = 0x7f;

export type Wasm64HotpathBackendMode = "rust-wasm" | "js-fallback";
export type Wasm64CpuTier =
  | "wasm-relaxed-simd"
  | "wasm-simd128"
  | "wasm-scalar"
  | "js-fallback";
export type Wasm64ExecutableTier = Exclude<Wasm64CpuTier, "js-fallback">;

export interface Wasm64CpuTierProbe {
  readonly tier: Wasm64CpuTier;
  readonly webAssemblySupported: boolean;
  readonly simd128Supported: boolean;
  readonly relaxedSimdSupported: boolean;
  readonly memory64Supported: boolean;
}

export interface WasmCoreTierCandidate {
  readonly tier: Wasm64ExecutableTier;
  readonly url: string;
  readonly isMemory64?: boolean;
}

export interface WasmDirtyRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** `TileBlendMode` C-ABI 코드 (0=Normal..11=Add). */
export type TileBlendModeCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export type Wasm64HotpathLoadSource =
  | "instantiate-streaming"
  | "instantiate-bytes"
  | "fetch-array-buffer"
  | "js-fallback";

export type Wasm64HotpathRouteKey =
  | "unsharp512"
  | "impasto25d"
  | "gaussianBlur"
  | "km16SpectralMix"
  | "xorTileDelta";

export interface Wasm64HotpathRoutingConfig {
  readonly unsharp512: boolean;
  readonly impasto25d: boolean;
  readonly gaussianBlur: boolean;
  readonly km16SpectralMix: boolean;
  readonly xorTileDelta: boolean;
}

export const DEFAULT_WASM64_HOTPATH_ROUTING: Wasm64HotpathRoutingConfig = Object.freeze({
  unsharp512: true,
  impasto25d: true,
  gaussianBlur: true,
  km16SpectralMix: true,
  xorTileDelta: true,
});

export interface StudioWasm64HotpathMetadata {
  readonly backendMode: Wasm64HotpathBackendMode;
  readonly cpuTier: Wasm64CpuTier;
  readonly addressBits: 64 | 32;
  readonly memory64Active: boolean;
  readonly resolvedUrl: string | null;
  readonly wasmByteLength: number;
  readonly abiVersion: number;
  readonly capabilitiesMask: number;
  readonly linearMemoryBytes: number;
  readonly loadSource: Wasm64HotpathLoadSource;
  readonly loadElapsedMs: number;
  readonly fallbackReason: string | null;
}

export type StudioWasm64HotpathTelemetry = StudioWasm64HotpathMetadata;

export interface LoadStudioWasm64HotpathOptions {
  readonly wasmUrl?: string;
  readonly wasmBytes?: Uint8Array | ArrayBuffer;
  readonly cpuTierHint?: Wasm64ExecutableTier;
  readonly preferredTier?: Wasm64CpuTier;
  readonly preferMemory64?: boolean;
  readonly fetchFn?: typeof fetch;
  readonly validateFn?: (bytes: Uint8Array) => boolean;
  readonly forceJsFallback?: boolean;
  readonly initialRouting?: Partial<Wasm64HotpathRoutingConfig>;
}

export interface HotpathUnsharpOptions {
  readonly sigma?: number;
  readonly amount?: number;
  readonly threshold?: number;
  readonly forceBackend?: Wasm64HotpathBackendMode;
}

export interface HotpathUnsharpResult {
  readonly output: Uint8Array;
  readonly modifiedPixels: number;
  readonly elapsedMs: number;
  readonly backendMode: Wasm64HotpathBackendMode;
  readonly zeroCopyViewBytes: number;
}

export interface HotpathBlurOptions {
  readonly sigma?: number;
  readonly selectionMask?: Uint8Array | null;
  readonly forceBackend?: Wasm64HotpathBackendMode;
}

export interface HotpathBlurResult {
  readonly output: Uint8Array;
  readonly processedPixels: number;
  readonly elapsedMs: number;
  readonly backendMode: Wasm64HotpathBackendMode;
}

export interface HotpathImpastoOptions {
  readonly light?: Partial<ImpastoLightParams>;
  readonly forceBackend?: Wasm64HotpathBackendMode;
}

export interface HotpathImpastoResult {
  readonly output: Uint8Array;
  readonly shadedPixels: number;
  readonly elapsedMs: number;
  readonly backendMode: Wasm64HotpathBackendMode;
  readonly zeroCopyViewBytes: number;
}

export interface HotpathKm16StripResult {
  readonly output: Uint8Array;
  readonly processedPixels: number;
  readonly elapsedMs: number;
  readonly backendMode: Wasm64HotpathBackendMode;
}

export interface HotpathXorDeltaResult {
  readonly delta: Uint8Array;
  readonly changedBytes: number;
  readonly checksumPrev: number;
  readonly checksumNext: number;
  readonly checksumDelta: number;
  readonly elapsedMs: number;
  readonly backendMode: Wasm64HotpathBackendMode;
  readonly zeroCopyViewBytes: number;
}

export interface HotpathTileCompositeOptions {
  readonly dirtyRect?: WasmDirtyRect;
  readonly blendMode?: TileBlendModeCode;
  readonly opacityU8?: number;
  readonly forceBackend?: Wasm64HotpathBackendMode;
}

export interface HotpathTileCompositeResult {
  readonly output: Uint8Array;
  readonly processedPixels: number;
  readonly elapsedMs: number;
  readonly backendMode: Wasm64HotpathBackendMode;
}

export interface ZeroCopyUnsharpViewResult {
  readonly outputView: Uint8Array;
  readonly modifiedPixels: number;
  readonly elapsedMs: number;
  readonly backendMode: Wasm64HotpathBackendMode;
}

export interface StudioWasm64HotpathRuntime {
  readonly getMetadata: () => StudioWasm64HotpathMetadata;
  readonly getTelemetry: () => StudioWasm64HotpathTelemetry;
  readonly getRouting: () => Wasm64HotpathRoutingConfig;
  readonly setRouting: (patch: Partial<Wasm64HotpathRoutingConfig>) => Wasm64HotpathRoutingConfig;
  readonly unsharpMaskRgba: (
    rgba: Uint8Array,
    width: number,
    height: number,
    options?: HotpathUnsharpOptions,
  ) => HotpathUnsharpResult;
  readonly runZeroCopyUnsharp: (
    writeInput: (inputView: Uint8Array) => void,
    width: number,
    height: number,
    options?: HotpathUnsharpOptions,
  ) => ZeroCopyUnsharpViewResult;
  readonly gaussianBlurRgba: (
    rgba: Uint8Array,
    width: number,
    height: number,
    options?: HotpathBlurOptions,
  ) => HotpathBlurResult;
  readonly applyImpastoLightingRgba: (
    rgba: Uint8Array,
    heightMap: Float32Array,
    width: number,
    height: number,
    options?: HotpathImpastoOptions,
  ) => HotpathImpastoResult;
  readonly mixPigmentsKmPacked: (
    rgbaA: number,
    rgbaB: number,
    ratio: number,
    forceBackend?: Wasm64HotpathBackendMode,
  ) => number;
  readonly mixPigmentsKm16Packed: (
    rgbaA: number,
    rgbaB: number,
    ratio: number,
    forceBackend?: Wasm64HotpathBackendMode,
  ) => number;
  readonly mixPigmentsKm16Strip: (
    dstRgba: Uint8Array,
    srcRgba: Uint8Array,
    ratio: number,
    forceBackend?: Wasm64HotpathBackendMode,
  ) => HotpathKm16StripResult;
  readonly compositeTileDirtyRect: (
    dstRgba: Uint8Array,
    srcRgba: Uint8Array,
    tileWidth: number,
    tileHeight: number,
    options?: HotpathTileCompositeOptions,
  ) => HotpathTileCompositeResult;
  readonly xorTileDeltaBytes: (
    prev: Uint8Array,
    next: Uint8Array,
    forceBackend?: Wasm64HotpathBackendMode,
  ) => HotpathXorDeltaResult;
  readonly fnv1aChecksum: (bytes: Uint8Array, forceBackend?: Wasm64HotpathBackendMode) => number;
  readonly sampleWorldPaperHeight: (
    worldX: number,
    worldY: number,
    grainScale: number,
    seed: number,
    forceBackend?: Wasm64HotpathBackendMode,
  ) => number;
  readonly dispose: () => void;
}

export interface HotpathBenchmarkFixtures {
  readonly dimension: number;
  readonly rgba: Uint8Array;
  readonly nextTileRgba: Uint8Array;
  readonly heightMap: Float32Array;
  readonly kmDstRgba: Uint8Array;
  readonly kmSrcRgba: Uint8Array;
}

export interface HotpathKernelBenchmarkEntry {
  readonly id: "unsharp512" | "impasto25d" | "xorTileDelta" | "km16SpectralMix";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly workloadSummary: string;
  readonly wasmMs: number | null;
  readonly jsMs: number;
  readonly speedupRatio: number;
  readonly maxChannelDiff: number;
  readonly byteExactMatch: boolean;
  readonly checksumWasm: number | null;
  readonly checksumJs: number;
}

export interface HotpathBenchmarkSuiteResult {
  readonly dimension: number;
  readonly backendMode: Wasm64HotpathBackendMode;
  readonly wasmByteLength: number;
  readonly totalWasmMs: number | null;
  readonly totalJsMs: number;
  readonly overallSpeedupRatio: number;
  readonly allByteExactMatch: boolean;
  readonly entries: readonly HotpathKernelBenchmarkEntry[];
}
