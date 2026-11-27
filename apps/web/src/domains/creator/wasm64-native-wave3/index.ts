/**
 * Wave-3 확장 스위트 지연 로드 전용 엔트리포인트 (`wasm64-native-wave3`).
 *
 * - 앱 셸·초기 진입 번들에서 절대 정적 import하지 않으며(0 bytes eager graph impact),
 *   AudioToon 믹싱·무한 벡터 스트로크·웹툰 스마트 슬라이싱·인쇄 CMYK/Display-P3 실행 시점에만 동적 로드한다.
 */

import {
  jsBiquadEqStereo,
  jsDedupTilesFnv64,
  jsDisplayP3ToSrgb,
  jsExpandVariableWidthStroke,
  jsExtractPaletteMedianCut,
  jsFlattenCubicBezier,
  jsHitTestPolygonBatch,
  jsMixAndMasterStereo,
  jsPlanWebtoonSmartSlices,
  jsResampleMono,
  jsRgbaToCmykTac,
  jsSchroederReverbStereo,
  jsSimplifyPolylineRdp,
  jsSmoothPolylineChaikin,
  jsSrgbToDisplayP3,
} from "./wave3-js-reference";
import {
  STUDIO_WASM64_WAVE3_URL,
  type StudioWave3Runtime,
  type Wave3BackendTier,
} from "./wave3-types";
import { createDualAddressWidthWasmAdapter } from "../wasm64-runtime-bridge/wasm64-memory64-abi-adapter";
import {
  createWave3WasmRuntimeFromExports,
  isWave3WasmExports,
  type RawWave3WasmExports,
} from "./wave3-wasm-runtime";

export * from "./wave3-types";
export * from "./wave3-js-reference";

export interface LoadStudioWave3Options {
  readonly wasmUrl?: string;
  readonly wasmBytes?: Uint8Array | ArrayBuffer;
  readonly backendHint?: Wave3BackendTier;
  readonly fetchFn?: typeof fetch;
  readonly allowJsFallback?: boolean;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function toArrayBuffer(input: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input;
  return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
}

/** 순수 JS 레퍼런스 기반 Wave-3 폴백 런타임을 생성한다 (WebAssembly 미지원/오프라인 안전 경로). */
export function createStudioWave3JsFallbackRuntime(): StudioWave3Runtime {
  const started = nowMs();
  return {
    getMetadata: () => ({
      backend: "js-fallback",
      abiVersion: 0,
      wave3CapabilitiesMask: 0,
      resolvedUrl: null,
      wasmByteLength: 0,
      linearMemoryBytes: 0,
      loadElapsedMs: Math.max(0, nowMs() - started),
    }),
    getArenaStats: () => ({
      activeAllocations: 0,
      totalAllocations: 0,
      totalFrees: 0,
      liveAllocatedBytes: 0,
      peakAllocatedBytes: 0,
    }),
    biquadEqStereo: jsBiquadEqStereo,
    mixAndMasterStereo: jsMixAndMasterStereo,
    schroederReverbStereo: jsSchroederReverbStereo,
    resampleMono: jsResampleMono,
    simplifyPolylineRdp: jsSimplifyPolylineRdp,
    smoothPolylineChaikin: jsSmoothPolylineChaikin,
    flattenCubicBezier: jsFlattenCubicBezier,
    expandVariableWidthStroke: jsExpandVariableWidthStroke,
    hitTestPolygonBatch: jsHitTestPolygonBatch,
    planWebtoonSmartSlices: jsPlanWebtoonSmartSlices,
    dedupTilesFnv64: jsDedupTilesFnv64,
    srgbToDisplayP3: jsSrgbToDisplayP3,
    displayP3ToSrgb: jsDisplayP3ToSrgb,
    rgbaToCmykTac: jsRgbaToCmykTac,
    extractPaletteMedianCut: jsExtractPaletteMedianCut,
    dispose: () => {},
  };
}

/** 확보된 `studio-wasm64-extended-suite.wasm` 바이트에서 Wave-3 런타임을 직접 인스턴스화한다. */
export async function createStudioWave3RuntimeFromBytes(
  wasmBytes: Uint8Array | ArrayBuffer,
  options: Pick<LoadStudioWave3Options, "wasmUrl" | "backendHint"> = {},
): Promise<StudioWave3Runtime> {
  const started = nowMs();
  const buffer = toArrayBuffer(wasmBytes);
  const { instance } = await WebAssembly.instantiate(buffer, {});
  if (!isWave3WasmExports(instance.exports)) {
    throw new Error("studio-wasm64-extended-suite.wasm에 필수 Wave-3 export가 누락되었습니다");
  }
  const dual = createDualAddressWidthWasmAdapter<RawWave3WasmExports>(instance.exports, {
    binaryBytes: new Uint8Array(buffer),
  });
  return createWave3WasmRuntimeFromExports(dual.adaptedExports, {
    backend: options.backendHint ?? "wasm-relaxed-simd",
    resolvedUrl: options.wasmUrl ?? null,
    wasmByteLength: buffer.byteLength,
    loadElapsedMs: Math.max(0, nowMs() - started),
  });
}

/** `studio-wasm64-extended-suite.wasm`을 지연 로드하고, 실패 시 `allowJsFallback`에 따라 JS 폴백으로 전환한다. */
export async function loadStudioWave3Runtime(
  options: LoadStudioWave3Options = {},
): Promise<StudioWave3Runtime> {
  const allowFallback = options.allowJsFallback ?? true;
  if (typeof WebAssembly === "undefined") {
    if (allowFallback) return createStudioWave3JsFallbackRuntime();
    throw new Error("현재 환경에서 WebAssembly를 지원하지 않습니다");
  }
  try {
    if (options.wasmBytes) {
      return await createStudioWave3RuntimeFromBytes(options.wasmBytes, options);
    }
    const fetchImpl = options.fetchFn ?? (typeof fetch === "function" ? fetch : null);
    if (!fetchImpl) throw new Error("fetch API를 사용할 수 없습니다");
    const url = options.wasmUrl ?? STUDIO_WASM64_WAVE3_URL;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`Wave-3 WASM fetch 실패 (${res.status}): ${url}`);
    const bytes = await res.arrayBuffer();
    return await createStudioWave3RuntimeFromBytes(bytes, {
      wasmUrl: url,
      backendHint: options.backendHint ?? "wasm-relaxed-simd",
    });
  } catch (err) {
    if (allowFallback) return createStudioWave3JsFallbackRuntime();
    throw err;
  }
}
