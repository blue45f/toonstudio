/**
 * Rust `crates/studio-wasm64-drawing-core` 실제 `.wasm` 번들 런타임 핫패스 로더 및 제로카피 브리지.
 *
 * - 브라우저에서는 `WebAssembly.instantiateStreaming` / `WebAssembly.instantiate`로
 *   `/wasm/studio-wasm64-drawing-core.wasm`을 직접 로드하고 16바이트 정렬 선형 메모리 아레나에
 *   제로카피 `Uint8Array` / `Float32Array` 뷰를 열어 512² 언샤프 · 2.5D 임파스토 · 가우시안 블러 ·
 *   Kubelka-Munk 16파장 혼색 · 타일 XOR 델타를 실행한다.
 * - 비네트워크/오프라인/테스트 환경에서는 바이트 동등 JS 폴백으로 자동 전환되며,
 *   실측 Wasm vs JS 속도 벤치마크와 픽셀/바이트 정합 검증을 함께 제공한다.
 */

import {
  detectWasmCpuTier,
  fetchAndInstantiateWasmUrl,
  inferCpuTierFromUrl,
  inferWasmBinaryCpuTier,
  normalizeWasmArrayBuffer,
  resolveWasmCoreTierCandidates,
} from "./wasm64-cpu-tier";
import {
  jsCompositeTileDirtyRect,
  jsMixPigmentsKmPacked,
} from "./wasm64-hotpath-js-compositor";
import {
  DEFAULT_IMPASTO_LIGHT_PARAMS,
  jsApplyImpastoLightingRgba,
  jsFnv1aChecksum32,
  jsGaussianBlurRgba,
  jsMixPigmentsKm16Packed,
  jsMixPigmentsKm16Strip,
  jsSampleWorldPaperHeight,
  jsUnsharpMaskRgba,
  jsXorTileDeltaBytes,
  type ImpastoLightParams,
} from "./wasm64-hotpath-js-fallback";
import {
  DEFAULT_WASM64_HOTPATH_ROUTING,
  WASM64_HOTPATH_EXPECTED_ABI,
  WASM64_HOTPATH_EXPECTED_CAPABILITIES,
  type HotpathBlurOptions,
  type HotpathBlurResult,
  type HotpathImpastoOptions,
  type HotpathImpastoResult,
  type HotpathKm16StripResult,
  type HotpathTileCompositeOptions,
  type HotpathTileCompositeResult,
  type HotpathUnsharpOptions,
  type HotpathUnsharpResult,
  type HotpathXorDeltaResult,
  type LoadStudioWasm64HotpathOptions,
  type StudioWasm64HotpathMetadata,
  type StudioWasm64HotpathRuntime,
  type TileBlendModeCode,
  type Wasm64ExecutableTier,
  type Wasm64HotpathBackendMode,
  type Wasm64HotpathRouteKey,
  type Wasm64HotpathRoutingConfig,
  type WasmCoreTierCandidate,
  type WasmDirtyRect,
  type ZeroCopyUnsharpViewResult,
} from "./wasm64-hotpath-types";

export {
  benchmarkWasm64VsJsHotpaths,
  createHotpathBenchmarkFixtures,
} from "./wasm64-hotpath-benchmark";
export {
  detectWasmCpuTier,
  inferCpuTierFromUrl,
  inferWasmBinaryCpuTier,
  probeWasmCpuTierCapabilities,
  resolveWasmCoreTierCandidates,
  WASM_RELAXED_SIMD_PROBE_BYTES,
  WASM_SCALAR_PROBE_BYTES,
  WASM_SIMD128_PROBE_BYTES,
  type WasmValidateFn,
} from "./wasm64-cpu-tier";
export { DEFAULT_IMPASTO_LIGHT_PARAMS };
export * from "./wasm64-hotpath-types";

interface RawRustWasmExports {
  readonly memory: WebAssembly.Memory;
  readonly wasm_drawing_core_abi_version: () => number;
  readonly wasm_hotpath_capabilities: () => number;
  readonly wasm_alloc: (byteLen: number) => number;
  readonly wasm_free: (ptr: number, byteLen: number) => void;
  readonly wasm_unsharp_mask_rgba: (
    srcPtr: number,
    dstPtr: number,
    width: number,
    height: number,
    sigma: number,
    amount: number,
    threshold: number,
  ) => number;
  readonly wasm_gaussian_blur_rgba: (
    srcPtr: number,
    maskPtr: number,
    dstPtr: number,
    width: number,
    height: number,
    sigma: number,
  ) => number;
  readonly wasm_apply_impasto_lighting_rgba: (
    rgbaPtr: number,
    heightPtr: number,
    width: number,
    height: number,
    lightParamsPtr: number,
  ) => number;
  readonly wasm_mix_pigments_km_packed: (rgbaA: number, rgbaB: number, ratio: number) => number;
  readonly wasm_mix_pigments_km16_packed: (rgbaA: number, rgbaB: number, ratio: number) => number;
  readonly wasm_mix_pigments_km16_strip: (
    dstPtr: number,
    srcPtr: number,
    pixelCount: number,
    ratio: number,
  ) => number;
  readonly wasm_composite_tile_dirty_rect: (
    dstPtr: number,
    srcPtr: number,
    tileWidth: number,
    tileHeight: number,
    dirtyX: number,
    dirtyY: number,
    dirtyWidth: number,
    dirtyHeight: number,
    blendMode: number,
    opacityU8: number,
  ) => number;
  readonly wasm_xor_tile_delta_bytes: (
    prevPtr: number,
    nextPtr: number,
    outPtr: number,
    byteLen: number,
  ) => number;
  readonly wasm_fnv1a_checksum: (ptr: number, byteLen: number) => number;
  readonly wasm_sample_world_paper_height: (
    worldX: number,
    worldY: number,
    grainScale: number,
    seed: number,
  ) => number;
}

interface LinearScratchSlot {
  ptr: number;
  capacity: number;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function isRustWasmExports(exportsObj: WebAssembly.Exports): exportsObj is WebAssembly.Exports & RawRustWasmExports {
  return (
    exportsObj.memory instanceof WebAssembly.Memory &&
    typeof exportsObj.wasm_drawing_core_abi_version === "function" &&
    typeof exportsObj.wasm_hotpath_capabilities === "function" &&
    typeof exportsObj.wasm_alloc === "function" &&
    typeof exportsObj.wasm_free === "function" &&
    typeof exportsObj.wasm_unsharp_mask_rgba === "function" &&
    typeof exportsObj.wasm_gaussian_blur_rgba === "function" &&
    typeof exportsObj.wasm_apply_impasto_lighting_rgba === "function" &&
    typeof exportsObj.wasm_mix_pigments_km_packed === "function" &&
    typeof exportsObj.wasm_mix_pigments_km16_packed === "function" &&
    typeof exportsObj.wasm_mix_pigments_km16_strip === "function" &&
    typeof exportsObj.wasm_composite_tile_dirty_rect === "function" &&
    typeof exportsObj.wasm_xor_tile_delta_bytes === "function" &&
    typeof exportsObj.wasm_fnv1a_checksum === "function" &&
    typeof exportsObj.wasm_sample_world_paper_height === "function"
  );
}

function resolveImpastoParams(partial?: Partial<ImpastoLightParams>): ImpastoLightParams {
  if (!partial) return DEFAULT_IMPASTO_LIGHT_PARAMS;
  return {
    azimuthRad: partial.azimuthRad ?? DEFAULT_IMPASTO_LIGHT_PARAMS.azimuthRad,
    elevationRad: partial.elevationRad ?? DEFAULT_IMPASTO_LIGHT_PARAMS.elevationRad,
    reliefStrength: partial.reliefStrength ?? DEFAULT_IMPASTO_LIGHT_PARAMS.reliefStrength,
    ambient: partial.ambient ?? DEFAULT_IMPASTO_LIGHT_PARAMS.ambient,
    diffuseStrength: partial.diffuseStrength ?? DEFAULT_IMPASTO_LIGHT_PARAMS.diffuseStrength,
    specularStrength: partial.specularStrength ?? DEFAULT_IMPASTO_LIGHT_PARAMS.specularStrength,
    shininess: partial.shininess ?? DEFAULT_IMPASTO_LIGHT_PARAMS.shininess,
  };
}

function buildRuntime(
  wasmExports: RawRustWasmExports | null,
  baseMeta: Omit<StudioWasm64HotpathMetadata, "linearMemoryBytes">,
  initialRouting?: Partial<Wasm64HotpathRoutingConfig>,
): StudioWasm64HotpathRuntime {
  let routing: Wasm64HotpathRoutingConfig = { ...DEFAULT_WASM64_HOTPATH_ROUTING, ...initialRouting };
  let disposed = false;

  const slotA: LinearScratchSlot = { ptr: 0, capacity: 0 };
  const slotB: LinearScratchSlot = { ptr: 0, capacity: 0 };
  const slotOut: LinearScratchSlot = { ptr: 0, capacity: 0 };
  const slotLight: LinearScratchSlot = { ptr: 0, capacity: 0 };
  const allSlots = [slotA, slotB, slotOut, slotLight];

  const ensureSlot = (slot: LinearScratchSlot, requiredBytes: number): number => {
    if (!wasmExports || disposed) {
      throw new Error("Wasm 런타임이 비활성화되었거나 해제되었습니다");
    }
    if (requiredBytes <= 0) return 0;
    if (slot.capacity >= requiredBytes && slot.ptr !== 0) return slot.ptr;
    if (slot.ptr !== 0 && slot.capacity > 0) {
      wasmExports.wasm_free(slot.ptr, slot.capacity);
      slot.ptr = 0;
      slot.capacity = 0;
    }
    const nextPtr = wasmExports.wasm_alloc(requiredBytes);
    if (nextPtr === 0) {
      throw new Error(`Wasm 선형 메모리 할당 실패 (${requiredBytes} B)`);
    }
    slot.ptr = nextPtr;
    slot.capacity = requiredBytes;
    return nextPtr;
  };

  const shouldUseWasm = (routeKey: Wasm64HotpathRouteKey, forceBackend?: Wasm64HotpathBackendMode): boolean => {
    if (forceBackend === "js-fallback") return false;
    if (!wasmExports || disposed) return false;
    if (forceBackend === "rust-wasm") return true;
    return routing[routeKey];
  };

  const getMetadata = (): StudioWasm64HotpathMetadata => ({
    ...baseMeta,
    linearMemoryBytes: wasmExports && !disposed ? wasmExports.memory.buffer.byteLength : 0,
  });

  const getRouting = (): Wasm64HotpathRoutingConfig => routing;

  const setRouting = (patch: Partial<Wasm64HotpathRoutingConfig>): Wasm64HotpathRoutingConfig => {
    routing = { ...routing, ...patch };
    return routing;
  };

  const runZeroCopyUnsharp = (
    writeInput: (inputView: Uint8Array) => void,
    width: number,
    height: number,
    options: HotpathUnsharpOptions = {},
  ): ZeroCopyUnsharpViewResult => {
    const sigma = options.sigma ?? 1.4;
    const amount = options.amount ?? 1.25;
    const threshold = Math.max(0, Math.min(255, Math.round(options.threshold ?? 2)));
    const byteLen = width * height * 4;
    const started = nowMs();

    if (shouldUseWasm("unsharp512", options.forceBackend) && wasmExports) {
      const srcPtr = ensureSlot(slotA, byteLen);
      const dstPtr = ensureSlot(slotOut, byteLen);
      const inputView = new Uint8Array(wasmExports.memory.buffer, srcPtr, byteLen);
      writeInput(inputView);
      const rc = wasmExports.wasm_unsharp_mask_rgba(srcPtr, dstPtr, width, height, sigma, amount, threshold);
      if (rc < 0) {
        throw new Error(`wasm_unsharp_mask_rgba 오류 코드: ${rc}`);
      }
      const outputView = new Uint8Array(wasmExports.memory.buffer, dstPtr, byteLen);
      return {
        outputView,
        modifiedPixels: rc,
        elapsedMs: nowMs() - started,
        backendMode: "rust-wasm",
      };
    }

    const inputBuf = new Uint8Array(byteLen);
    writeInput(inputBuf);
    const jsRes = jsUnsharpMaskRgba(inputBuf, width, height, sigma, amount, threshold);
    return {
      outputView: jsRes.output,
      modifiedPixels: jsRes.modifiedPixels,
      elapsedMs: nowMs() - started,
      backendMode: "js-fallback",
    };
  };

  const unsharpMaskRgba = (
    rgba: Uint8Array,
    width: number,
    height: number,
    options: HotpathUnsharpOptions = {},
  ): HotpathUnsharpResult => {
    const res = runZeroCopyUnsharp((view) => view.set(rgba), width, height, options);
    const output = res.backendMode === "rust-wasm" ? new Uint8Array(res.outputView) : res.outputView;
    return {
      output,
      modifiedPixels: res.modifiedPixels,
      elapsedMs: res.elapsedMs,
      backendMode: res.backendMode,
      zeroCopyViewBytes: res.backendMode === "rust-wasm" ? rgba.byteLength * 2 : 0,
    };
  };

  const gaussianBlurRgba = (
    rgba: Uint8Array,
    width: number,
    height: number,
    options: HotpathBlurOptions = {},
  ): HotpathBlurResult => {
    const sigma = options.sigma ?? 1.6;
    const mask = options.selectionMask ?? null;
    const started = nowMs();

    if (shouldUseWasm("gaussianBlur", options.forceBackend) && wasmExports) {
      const byteLen = width * height * 4;
      const srcPtr = ensureSlot(slotA, byteLen);
      const dstPtr = ensureSlot(slotOut, byteLen);
      const maskPtr = mask ? ensureSlot(slotB, mask.byteLength) : 0;
      new Uint8Array(wasmExports.memory.buffer, srcPtr, byteLen).set(rgba);
      if (mask && maskPtr !== 0) {
        new Uint8Array(wasmExports.memory.buffer, maskPtr, mask.byteLength).set(mask);
      }
      const rc = wasmExports.wasm_gaussian_blur_rgba(srcPtr, maskPtr, dstPtr, width, height, sigma);
      if (rc < 0) {
        throw new Error(`wasm_gaussian_blur_rgba 오류 코드: ${rc}`);
      }
      const output = new Uint8Array(new Uint8Array(wasmExports.memory.buffer, dstPtr, byteLen));
      return {
        output,
        processedPixels: rc,
        elapsedMs: nowMs() - started,
        backendMode: "rust-wasm",
      };
    }

    const jsRes = jsGaussianBlurRgba(rgba, width, height, sigma, mask);
    return {
      output: jsRes.output,
      processedPixels: jsRes.processedPixels,
      elapsedMs: nowMs() - started,
      backendMode: "js-fallback",
    };
  };

  const applyImpastoLightingRgba = (
    rgba: Uint8Array,
    heightMap: Float32Array,
    width: number,
    height: number,
    options: HotpathImpastoOptions = {},
  ): HotpathImpastoResult => {
    const light = resolveImpastoParams(options.light);
    const started = nowMs();

    if (shouldUseWasm("impasto25d", options.forceBackend) && wasmExports) {
      const rgbaLen = width * height * 4;
      const heightBytes = heightMap.byteLength;
      const rgbaPtr = ensureSlot(slotOut, rgbaLen);
      const heightPtr = ensureSlot(slotB, heightBytes);
      const lightPtr = ensureSlot(slotLight, 7 * 4);

      new Uint8Array(wasmExports.memory.buffer, rgbaPtr, rgbaLen).set(rgba);
      new Float32Array(wasmExports.memory.buffer, heightPtr, heightMap.length).set(heightMap);
      const lightView = new Float32Array(wasmExports.memory.buffer, lightPtr, 7);
      lightView[0] = light.azimuthRad;
      lightView[1] = light.elevationRad;
      lightView[2] = light.reliefStrength;
      lightView[3] = light.ambient;
      lightView[4] = light.diffuseStrength;
      lightView[5] = light.specularStrength;
      lightView[6] = light.shininess;

      const rc = wasmExports.wasm_apply_impasto_lighting_rgba(rgbaPtr, heightPtr, width, height, lightPtr);
      if (rc < 0) {
        throw new Error(`wasm_apply_impasto_lighting_rgba 오류 코드: ${rc}`);
      }
      const output = new Uint8Array(new Uint8Array(wasmExports.memory.buffer, rgbaPtr, rgbaLen));
      return {
        output,
        shadedPixels: rc,
        elapsedMs: nowMs() - started,
        backendMode: "rust-wasm",
        zeroCopyViewBytes: rgbaLen + heightBytes + 28,
      };
    }

    const jsRes = jsApplyImpastoLightingRgba(rgba, heightMap, width, height, light);
    return {
      output: jsRes.output,
      shadedPixels: jsRes.shadedPixels,
      elapsedMs: nowMs() - started,
      backendMode: "js-fallback",
      zeroCopyViewBytes: 0,
    };
  };

  const mixPigmentsKmPacked = (
    rgbaA: number,
    rgbaB: number,
    ratio: number,
    forceBackend?: Wasm64HotpathBackendMode,
  ): number => {
    if (shouldUseWasm("km16SpectralMix", forceBackend) && wasmExports) {
      return wasmExports.wasm_mix_pigments_km_packed(rgbaA >>> 0, rgbaB >>> 0, ratio) >>> 0;
    }
    return jsMixPigmentsKmPacked(rgbaA, rgbaB, ratio);
  };

  const mixPigmentsKm16Packed = (
    rgbaA: number,
    rgbaB: number,
    ratio: number,
    forceBackend?: Wasm64HotpathBackendMode,
  ): number => {
    if (shouldUseWasm("km16SpectralMix", forceBackend) && wasmExports) {
      return wasmExports.wasm_mix_pigments_km16_packed(rgbaA >>> 0, rgbaB >>> 0, ratio) >>> 0;
    }
    return jsMixPigmentsKm16Packed(rgbaA, rgbaB, ratio);
  };

  const mixPigmentsKm16Strip = (
    dstRgba: Uint8Array,
    srcRgba: Uint8Array,
    ratio: number,
    forceBackend?: Wasm64HotpathBackendMode,
  ): HotpathKm16StripResult => {
    const started = nowMs();
    if (shouldUseWasm("km16SpectralMix", forceBackend) && wasmExports) {
      const byteLen = dstRgba.byteLength;
      const dstPtr = ensureSlot(slotOut, byteLen);
      const srcPtr = ensureSlot(slotA, byteLen);
      new Uint8Array(wasmExports.memory.buffer, dstPtr, byteLen).set(dstRgba);
      new Uint8Array(wasmExports.memory.buffer, srcPtr, byteLen).set(srcRgba);
      const rc = wasmExports.wasm_mix_pigments_km16_strip(dstPtr, srcPtr, byteLen >>> 2, ratio);
      if (rc < 0) {
        throw new Error(`wasm_mix_pigments_km16_strip 오류 코드: ${rc}`);
      }
      const output = new Uint8Array(new Uint8Array(wasmExports.memory.buffer, dstPtr, byteLen));
      return {
        output,
        processedPixels: rc,
        elapsedMs: nowMs() - started,
        backendMode: "rust-wasm",
      };
    }

    const jsRes = jsMixPigmentsKm16Strip(dstRgba, srcRgba, ratio);
    return {
      output: jsRes.output,
      processedPixels: jsRes.processedPixels,
      elapsedMs: nowMs() - started,
      backendMode: "js-fallback",
    };
  };

  const compositeTileDirtyRect = (
    dstRgba: Uint8Array,
    srcRgba: Uint8Array,
    tileWidth: number,
    tileHeight: number,
    options: HotpathTileCompositeOptions = {},
  ): HotpathTileCompositeResult => {
    const dirty: WasmDirtyRect = options.dirtyRect ?? {
      x: 0,
      y: 0,
      width: tileWidth,
      height: tileHeight,
    };
    const blendMode: TileBlendModeCode = options.blendMode ?? 0;
    const opacityU8 = Math.max(0, Math.min(255, Math.round(options.opacityU8 ?? 255)));
    const started = nowMs();

    if (options.forceBackend !== "js-fallback" && wasmExports && !disposed) {
      const byteLen = tileWidth * tileHeight * 4;
      const dstPtr = ensureSlot(slotOut, byteLen);
      const srcPtr = ensureSlot(slotA, byteLen);
      new Uint8Array(wasmExports.memory.buffer, dstPtr, byteLen).set(dstRgba);
      new Uint8Array(wasmExports.memory.buffer, srcPtr, byteLen).set(srcRgba);
      const rc = wasmExports.wasm_composite_tile_dirty_rect(
        dstPtr,
        srcPtr,
        tileWidth >>> 0,
        tileHeight >>> 0,
        dirty.x >>> 0,
        dirty.y >>> 0,
        dirty.width >>> 0,
        dirty.height >>> 0,
        blendMode,
        opacityU8,
      );
      if (rc < 0) {
        throw new Error(`wasm_composite_tile_dirty_rect 오류 코드: ${rc}`);
      }
      const output = new Uint8Array(new Uint8Array(wasmExports.memory.buffer, dstPtr, byteLen));
      return {
        output,
        processedPixels: rc,
        elapsedMs: nowMs() - started,
        backendMode: "rust-wasm",
      };
    }

    const jsRes = jsCompositeTileDirtyRect(
      dstRgba,
      srcRgba,
      tileWidth,
      tileHeight,
      dirty,
      blendMode,
      opacityU8,
    );
    return {
      output: jsRes.output,
      processedPixels: jsRes.processedPixels,
      elapsedMs: nowMs() - started,
      backendMode: "js-fallback",
    };
  };

  const xorTileDeltaBytes = (
    prev: Uint8Array,
    next: Uint8Array,
    forceBackend?: Wasm64HotpathBackendMode,
  ): HotpathXorDeltaResult => {
    const started = nowMs();
    if (prev.byteLength !== next.byteLength) {
      throw new RangeError(`XOR 타일 길이 불일치: prev=${prev.byteLength}, next=${next.byteLength}`);
    }
    if (shouldUseWasm("xorTileDelta", forceBackend) && wasmExports) {
      const byteLen = prev.byteLength;
      const prevPtr = ensureSlot(slotA, byteLen);
      const nextPtr = ensureSlot(slotB, byteLen);
      const outPtr = ensureSlot(slotOut, byteLen);
      const memView = new Uint8Array(wasmExports.memory.buffer);
      memView.set(prev, prevPtr);
      memView.set(next, nextPtr);

      const changed = wasmExports.wasm_xor_tile_delta_bytes(prevPtr, nextPtr, outPtr, byteLen);
      if (changed < 0) {
        throw new Error(`wasm_xor_tile_delta_bytes 오류 코드: ${changed}`);
      }
      const checksumPrev = wasmExports.wasm_fnv1a_checksum(prevPtr, byteLen) >>> 0;
      const checksumNext = wasmExports.wasm_fnv1a_checksum(nextPtr, byteLen) >>> 0;
      const checksumDelta = wasmExports.wasm_fnv1a_checksum(outPtr, byteLen) >>> 0;
      const delta = new Uint8Array(new Uint8Array(wasmExports.memory.buffer, outPtr, byteLen));
      return {
        delta,
        changedBytes: changed,
        checksumPrev,
        checksumNext,
        checksumDelta,
        elapsedMs: nowMs() - started,
        backendMode: "rust-wasm",
        zeroCopyViewBytes: byteLen * 3,
      };
    }

    const jsRes = jsXorTileDeltaBytes(prev, next);
    return {
      delta: jsRes.delta,
      changedBytes: jsRes.changedBytes,
      checksumPrev: jsFnv1aChecksum32(prev),
      checksumNext: jsFnv1aChecksum32(next),
      checksumDelta: jsFnv1aChecksum32(jsRes.delta),
      elapsedMs: nowMs() - started,
      backendMode: "js-fallback",
      zeroCopyViewBytes: 0,
    };
  };

  const fnv1aChecksum = (bytes: Uint8Array, forceBackend?: Wasm64HotpathBackendMode): number => {
    if (shouldUseWasm("xorTileDelta", forceBackend) && wasmExports) {
      if (bytes.byteLength === 0) return wasmExports.wasm_fnv1a_checksum(0, 0) >>> 0;
      const ptr = ensureSlot(slotA, bytes.byteLength);
      new Uint8Array(wasmExports.memory.buffer, ptr, bytes.byteLength).set(bytes);
      return wasmExports.wasm_fnv1a_checksum(ptr, bytes.byteLength) >>> 0;
    }
    return jsFnv1aChecksum32(bytes);
  };

  const sampleWorldPaperHeight = (
    worldX: number,
    worldY: number,
    grainScale: number,
    seed: number,
    forceBackend?: Wasm64HotpathBackendMode,
  ): number => {
    if (forceBackend !== "js-fallback" && wasmExports && !disposed) {
      return wasmExports.wasm_sample_world_paper_height(worldX, worldY, grainScale, seed >>> 0);
    }
    return jsSampleWorldPaperHeight(worldX, worldY, grainScale, seed);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    if (!wasmExports) return;
    for (const slot of allSlots) {
      if (slot.ptr !== 0 && slot.capacity > 0) {
        wasmExports.wasm_free(slot.ptr, slot.capacity);
        slot.ptr = 0;
        slot.capacity = 0;
      }
    }
  };

  return {
    getMetadata,
    getRouting,
    setRouting,
    unsharpMaskRgba,
    runZeroCopyUnsharp,
    gaussianBlurRgba,
    applyImpastoLightingRgba,
    mixPigmentsKmPacked,
    mixPigmentsKm16Packed,
    mixPigmentsKm16Strip,
    compositeTileDirtyRect,
    xorTileDeltaBytes,
    fnv1aChecksum,
    sampleWorldPaperHeight,
    dispose,
  };
}

/** 비네트워크/오프라인 환경에서 바이트 동등 JS 폴백 런타임을 즉시 생성한다. */
export function createStudioWasm64JsFallbackRuntime(
  fallbackReason = "JS 폴백 모드 직접 활성화",
  initialRouting?: Partial<Wasm64HotpathRoutingConfig>,
): StudioWasm64HotpathRuntime {
  return buildRuntime(
    null,
    {
      backendMode: "js-fallback",
      cpuTier: "js-fallback",
      resolvedUrl: null,
      wasmByteLength: 0,
      abiVersion: WASM64_HOTPATH_EXPECTED_ABI,
      capabilitiesMask: WASM64_HOTPATH_EXPECTED_CAPABILITIES,
      loadSource: "js-fallback",
      loadElapsedMs: 0,
      fallbackReason,
    },
    initialRouting,
  );
}

/** 이미 확보된 `.wasm` 바이너리 바이트를 `WebAssembly.instantiate`로 직접 인스턴스화한다. */
export async function createStudioWasm64HotpathFromBytes(
  wasmBytes: Uint8Array | ArrayBuffer,
  initialRouting?: Partial<Wasm64HotpathRoutingConfig>,
  tierMeta?: {
    readonly cpuTierHint?: Wasm64ExecutableTier;
    readonly resolvedUrl?: string | null;
  },
): Promise<StudioWasm64HotpathRuntime> {
  const started = nowMs();
  const buffer = normalizeWasmArrayBuffer(wasmBytes);
  const { instance } = await WebAssembly.instantiate(buffer, {});
  if (!isRustWasmExports(instance.exports)) {
    throw new Error("컴파일된 studio-wasm64-drawing-core.wasm 필수 export 시그니처가 누락되었습니다");
  }
  const cpuTier = tierMeta?.cpuTierHint ?? inferWasmBinaryCpuTier(new Uint8Array(buffer));
  return buildRuntime(
    instance.exports,
    {
      backendMode: "rust-wasm",
      cpuTier,
      resolvedUrl: tierMeta?.resolvedUrl ?? null,
      wasmByteLength: buffer.byteLength,
      abiVersion: instance.exports.wasm_drawing_core_abi_version() >>> 0,
      capabilitiesMask: instance.exports.wasm_hotpath_capabilities() >>> 0,
      loadSource: "instantiate-bytes",
      loadElapsedMs: nowMs() - started,
      fallbackReason: null,
    },
    initialRouting,
  );
}

/**
 * `studio-wasm64-drawing-core` 바이너리를 CPU 계층(`relaxed-simd` → `simd128` → `scalar` → JS 폴백)
 * 순으로 자동 탐색·인스턴스화한다. `wasmBytes`·`wasmUrl` 명시 시 기존 호환 경로를 그대로 따른다.
 */
export async function loadStudioWasm64HotpathRuntime(
  options: LoadStudioWasm64HotpathOptions = {},
): Promise<StudioWasm64HotpathRuntime> {
  if (options.forceJsFallback) {
    return createStudioWasm64JsFallbackRuntime("사용자 설정으로 JS 폴백 강제", options.initialRouting);
  }
  if (typeof WebAssembly === "undefined") {
    return createStudioWasm64JsFallbackRuntime("현재 런타임에서 WebAssembly 미지원", options.initialRouting);
  }
  if (options.wasmBytes) {
    try {
      return await createStudioWasm64HotpathFromBytes(options.wasmBytes, options.initialRouting, {
        cpuTierHint: options.cpuTierHint,
        resolvedUrl: options.wasmUrl ?? null,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return createStudioWasm64JsFallbackRuntime(`Wasm 바이트 인스턴스화 실패: ${reason}`, options.initialRouting);
    }
  }

  const fetchImpl = options.fetchFn ?? (typeof fetch === "function" ? fetch : null);
  if (!fetchImpl) {
    return createStudioWasm64JsFallbackRuntime("fetch API 미지원 비네트워크 환경", options.initialRouting);
  }

  const candidates: readonly WasmCoreTierCandidate[] = options.wasmUrl
    ? [
        {
          tier: options.cpuTierHint ?? inferCpuTierFromUrl(options.wasmUrl) ?? "wasm-scalar",
          url: options.wasmUrl,
        },
      ]
    : resolveWasmCoreTierCandidates(
        options.preferredTier ?? detectWasmCpuTier(options.validateFn),
      );

  if (candidates.length === 0) {
    return createStudioWasm64JsFallbackRuntime("WebAssembly CPU 계층 프로브 미지원", options.initialRouting);
  }

  const started = nowMs();
  let lastErrorReason = "Wasm 티어 후보군 로드 실패";

  for (const candidate of candidates) {
    try {
      const fetched = await fetchAndInstantiateWasmUrl(candidate.url, fetchImpl);
      if (!isRustWasmExports(fetched.instance.exports)) {
        throw new Error(`필수 Wasm export 누락 (${candidate.url})`);
      }
      const detectedTier: Wasm64ExecutableTier =
        options.cpuTierHint ??
        (options.wasmUrl && fetched.binaryBytes
          ? inferCpuTierFromUrl(candidate.url) ?? inferWasmBinaryCpuTier(fetched.binaryBytes)
          : candidate.tier);

      return buildRuntime(
        fetched.instance.exports,
        {
          backendMode: "rust-wasm",
          cpuTier: detectedTier,
          resolvedUrl: candidate.url,
          wasmByteLength: fetched.byteLength,
          abiVersion: fetched.instance.exports.wasm_drawing_core_abi_version() >>> 0,
          capabilitiesMask: fetched.instance.exports.wasm_hotpath_capabilities() >>> 0,
          loadSource: fetched.loadSource,
          loadElapsedMs: nowMs() - started,
          fallbackReason: null,
        },
        options.initialRouting,
      );
    } catch (error) {
      lastErrorReason = error instanceof Error ? error.message : String(error);
    }
  }

  return createStudioWasm64JsFallbackRuntime(`Wasm 네트워크 로드 폴백: ${lastErrorReason}`, options.initialRouting);
}
