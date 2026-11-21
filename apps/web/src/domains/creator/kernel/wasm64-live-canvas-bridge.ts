/**
 * WebAssembly Memory64 실전 2D 캔버스·46종 CSP 필터·240Hz 스타일러스·머티리얼 브러시 통합 브리지.
 *
 * 1) `accelerateCspFilterWithWasm64`: 톤/색조·그라데이션 LUT 계열 CSP 필터 6종을
 *    Wasm64 `i64` 네이티브 커널(및 `reverse-gradient`용 SIMD128 `v128.xor`)로 비트 동치 가속 실행.
 * 2) `process240HzStylusStrokeStream`: `pointerrawupdate` + Coalesced + Predicted 입력에
 *    등방성 2D 1-Euro 적응형 손떨림 보정(SAI 2급)과 확정/예측 꼬리 분리(고스트 0%)를 적용.
 * 3) `rasterizeMaterialBrushMarksWithWasm64`: 머티리얼 브러시 댑을 `256×256` Wasm64 더티 타일에 직결.
 */

import type { CspReaFilterId, CspReaFilterParamMap } from "../filter/csp-rea/csp-rea-filter-descriptors";
import { buildCspToneCurveLut, type CspGradientMapStop, type CspLevelChannelSpec } from "../filter/csp-rea/csp-rea-tonal-corrections";

import {
  extractHighFreqStylusSamples,
  type HighFreqStylusBatch,
  type HighFreqStylusSample,
  type StylusPointerEventLike,
} from "./chrome-nextgen-adapters";
import { clampByte } from "./wasm64-raster-fallback";
import {
  createWasm64RasterEngine, WASM64_WEB_MAX_PAGES,
  type Wasm64RasterBackend, type Wasm64RasterEngine, type Wasm64RasterEngineOptions,
} from "./wasm64-raster-kernel";
import {
  encodeSection, encodeSleb128_32, encodeSleb128_64, encodeUleb128_32, encodeUleb128_64,
  encodeUtf8Name, encodeVector, WASM_MAGIC_AND_VERSION, WASM_MEMORY64_LIMITS_FLAG,
  WASM_OP as OP, WASM_SEC as SEC, WASM_VAL as VAL,
} from "./wasm64-raster-leb128";
import {
  buildWebGpuFilterComputePlan, createWasm64TiledCompositor, planParallelTileBatches,
  probeWasm64Simd128Support, validateWebGpuComputePlan, WEBGPU_HEAVY_FILTER_IDS,
  type Wasm64BlendMode, type Wasm64ParallelTilePlan, type Wasm64Simd128ProbeReport,
  type Wasm64TiledCompositeReport, type Wasm64TiledCompositor,
} from "./wasm64-tile-pipeline";

export {
  buildWebGpuFilterComputePlan, createWasm64TiledCompositor, planParallelTileBatches,
  probeWasm64Simd128Support, validateWebGpuComputePlan, WEBGPU_HEAVY_FILTER_IDS,
};

/* 1) Wasm64 동반 필터 커널: GradientMap (f64 정밀) + SIMD128 RGB 반전 (v128) */

const VAL_F64 = 0x7c;
const OP_F64 = { CONST: 0x44, FLOOR: 0x9c, ADD: 0xa0, MUL: 0xa2, MIN: 0xa4, MAX: 0xa5, TRUNC_U: 0xab, CONV_I32_U: 0xb8 } as const;

interface Wasm64FilterAuxExports {
  readonly applyGradientMapLut64: (pixelPtr: bigint, pixelCount: bigint, lutPtr: bigint, mixRate: number) => void;
}
interface Wasm64SimdInvertExports {
  readonly invertRgbSimd128_64: (pixelPtr: bigint, pixelCount: bigint) => void;
}

const f64Bytes = (v: number): number[] => {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, v, true);
  return Array.from(new Uint8Array(buf));
};

function buildGradientMapLut64Body(): number[] {
  const L = { pixelPtr: 0, pixelCount: 1, lutPtr: 2, mixRate: 3, ptr: 4, endPtr: 5, lutEntry: 6, invMix: 7, r: 8, g: 9, b: 10, lumIdx: 11 };
  const c: number[] = [];
  const push = (...bytes: number[]) => c.push(...bytes);
  const get = (idx: number) => push(OP.LOCAL_GET, ...encodeUleb128_32(idx));
  const set = (idx: number) => push(OP.LOCAL_SET, ...encodeUleb128_32(idx));
  const f64c = (v: number) => push(OP_F64.CONST, ...f64Bytes(v));
  const load8 = (off: number) => push(OP.I32_LOAD8_U, 0x00, ...encodeUleb128_64(BigInt(off)));
  const store8 = (off: number) => push(OP.I32_STORE8, 0x00, ...encodeUleb128_64(BigInt(off)));

  // if (pixelCount === 0n) return;
  get(L.pixelCount); push(OP.I64_EQZ, OP.IF, VAL.VOID, OP.RETURN, OP.END);
  get(L.pixelPtr); set(L.ptr);
  get(L.pixelPtr); get(L.pixelCount); push(OP.I64_CONST, 2, OP.I64_SHL, OP.I64_ADD); set(L.endPtr);
  f64c(1.0); get(L.mixRate); push(0xa1); set(L.invMix); // f64.sub = 0xa1

  push(OP.BLOCK, VAL.VOID, OP.LOOP, VAL.VOID);
  get(L.ptr); get(L.endPtr); push(OP.I64_GE_U, OP.BR_IF, 1);

  get(L.ptr); load8(0); set(L.r);
  get(L.ptr); load8(1); set(L.g);
  get(L.ptr); load8(2); set(L.b);

  // lumIdx = clampByte(0.2126 * r + 0.7152 * g + 0.0722 * b)
  f64c(0.2126); get(L.r); push(OP_F64.CONV_I32_U, OP_F64.MUL);
  f64c(0.7152); get(L.g); push(OP_F64.CONV_I32_U, OP_F64.MUL, OP_F64.ADD);
  f64c(0.0722); get(L.b); push(OP_F64.CONV_I32_U, OP_F64.MUL, OP_F64.ADD);
  f64c(0.5); push(OP_F64.ADD, OP_F64.FLOOR); f64c(0); push(OP_F64.MAX); f64c(255); push(OP_F64.MIN, OP_F64.TRUNC_U);
  set(L.lumIdx);

  get(L.lutPtr); get(L.lumIdx); push(OP.I64_EXTEND_I32_U, OP.I64_CONST, 3, OP.I64_MUL, OP.I64_ADD); set(L.lutEntry);

  for (const [srcLoc, ch] of [[L.r, 0], [L.g, 1], [L.b, 2]] as const) {
    get(L.ptr);
    get(srcLoc); push(OP_F64.CONV_I32_U); get(L.invMix); push(OP_F64.MUL);
    get(L.lutEntry); load8(ch); push(OP_F64.CONV_I32_U); get(L.mixRate); push(OP_F64.MUL, OP_F64.ADD);
    f64c(0.5); push(OP_F64.ADD, OP_F64.FLOOR); f64c(0); push(OP_F64.MAX); f64c(255); push(OP_F64.MIN, OP_F64.TRUNC_U);
    store8(ch);
  }

  get(L.ptr); push(OP.I64_CONST, 4, OP.I64_ADD); set(L.ptr);
  push(OP.BR, 0, OP.END, OP.END, OP.END);
  const locals = encodeVector([[3, VAL.I64], [1, VAL_F64], [4, VAL.I32]]);
  const full = [...locals, ...c];
  return [...encodeUleb128_32(full.length), ...full];
}

function buildSimdInvert64Body(): number[] {
  // 4픽셀(16바이트) 단위 v128.load -> v128.xor([255,255,255,0 x4]) -> v128.store + 스칼라 테일
  const L = { pixelPtr: 0, pixelCount: 1, ptr: 2, vecEnd: 3, endPtr: 4 };
  const mask = [255, 255, 255, 0, 255, 255, 255, 0, 255, 255, 255, 0, 255, 255, 255, 0];
  const c: number[] = [];
  const push = (...bytes: number[]) => c.push(...bytes);
  const get = (idx: number) => push(OP.LOCAL_GET, ...encodeUleb128_32(idx));
  const set = (idx: number) => push(OP.LOCAL_SET, ...encodeUleb128_32(idx));
  const i64c = (v: number) => push(OP.I64_CONST, ...encodeSleb128_64(BigInt(v)));

  get(L.pixelCount); push(OP.I64_EQZ, OP.IF, VAL.VOID, OP.RETURN, OP.END);
  get(L.pixelPtr); set(L.ptr);
  get(L.pixelPtr); get(L.pixelCount); i64c(2); push(OP.I64_SHL, OP.I64_ADD); set(L.endPtr);
  get(L.pixelPtr); get(L.pixelCount); i64c(2); push(0x88); i64c(4); push(OP.I64_SHL, OP.I64_ADD); set(L.vecEnd);

  push(OP.BLOCK, VAL.VOID, OP.LOOP, VAL.VOID);
  get(L.ptr); get(L.vecEnd); push(OP.I64_GE_U, OP.BR_IF, 1);
  get(L.ptr); get(L.ptr);
  push(0xfd, 0x00, 0x00, 0x00, 0xfd, 0x0c, ...mask, 0xfd, 0x51, 0xfd, 0x0b, 0x00, 0x00);
  get(L.ptr); i64c(16); push(OP.I64_ADD); set(L.ptr);
  push(OP.BR, 0, OP.END, OP.END);

  push(OP.BLOCK, VAL.VOID, OP.LOOP, VAL.VOID);
  get(L.ptr); get(L.endPtr); push(OP.I64_GE_U, OP.BR_IF, 1);
  for (const ch of [0, 1, 2] as const) {
    get(L.ptr); push(OP.I32_CONST, ...encodeSleb128_32(255));
    get(L.ptr); push(OP.I32_LOAD8_U, 0x00, ...encodeUleb128_64(BigInt(ch)), OP.I32_SUB);
    push(OP.I32_STORE8, 0x00, ...encodeUleb128_64(BigInt(ch)));
  }
  get(L.ptr); i64c(4); push(OP.I64_ADD); set(L.ptr);
  push(OP.BR, 0, OP.END, OP.END, OP.END);
  const full = [...encodeVector([[3, VAL.I64]]), ...c];
  return [...encodeUleb128_32(full.length), ...full];
}

let cachedGradMapModBytes: Uint8Array | null = null;
let cachedSimdInvModBytes: Uint8Array | null = null;

function buildMemoryImportSection(): number[] {
  return encodeSection(SEC.IMPORT, encodeVector([[
    ...encodeUtf8Name("env"), ...encodeUtf8Name("memory"), 0x02, WASM_MEMORY64_LIMITS_FLAG,
    ...encodeUleb128_64(BigInt(1)), ...encodeUleb128_64(WASM64_WEB_MAX_PAGES),
  ]]));
}

function getGradientMapModuleBytes(): Uint8Array {
  if (!cachedGradMapModBytes) {
    cachedGradMapModBytes = new Uint8Array([
      ...WASM_MAGIC_AND_VERSION,
      ...encodeSection(SEC.TYPE, encodeVector([[0x60, 4, VAL.I64, VAL.I64, VAL.I64, VAL_F64, 0]])),
      ...buildMemoryImportSection(),
      ...encodeSection(SEC.FUNCTION, encodeVector([[0x00]])),
      ...encodeSection(SEC.EXPORT, encodeVector([[...encodeUtf8Name("applyGradientMapLut64"), 0x00, 0x00]])),
      ...encodeSection(SEC.CODE, encodeVector([buildGradientMapLut64Body()])),
    ]);
  }
  return cachedGradMapModBytes;
}

function getSimdInvertModuleBytes(): Uint8Array {
  if (!cachedSimdInvModBytes) {
    cachedSimdInvModBytes = new Uint8Array([
      ...WASM_MAGIC_AND_VERSION,
      ...encodeSection(SEC.TYPE, encodeVector([[0x60, 2, VAL.I64, VAL.I64, 0]])),
      ...buildMemoryImportSection(),
      ...encodeSection(SEC.FUNCTION, encodeVector([[0x00]])),
      ...encodeSection(SEC.EXPORT, encodeVector([[...encodeUtf8Name("invertRgbSimd128_64"), 0x00, 0x00]])),
      ...encodeSection(SEC.CODE, encodeVector([buildSimdInvert64Body()])),
    ]);
  }
  return cachedSimdInvModBytes;
}

/* 2) CSP 톤/색조·그라데이션 LUT 필터 Wasm64 가속 실행기 (T-015) */

export const WASM64_ACCELERATED_CSP_FILTER_IDS = Object.freeze([
  "brightness-contrast",
  "posterize",
  "reverse-gradient",
  "level-correction",
  "tone-curve",
  "gradient-map",
] as const satisfies readonly CspReaFilterId[]);

export type Wasm64AcceleratedCspFilterId = (typeof WASM64_ACCELERATED_CSP_FILTER_IDS)[number];

export interface Wasm64FilterAccelerationResult {
  readonly filterId: Wasm64AcceleratedCspFilterId;
  readonly data: Uint8ClampedArray;
  readonly backend: Wasm64RasterBackend;
  readonly addressMode: "i64" | "js-heap";
  readonly kernelPath: "wasm64-lut" | "wasm64-simd128-invert" | "wasm64-gradient-map" | "js-fallback";
  readonly pixelsProcessed: number;
  readonly elapsedMs: number;
  readonly throughputMegaPixelsPerSec: number;
  readonly accelerated: true;
}

export interface Wasm64FilterAccelerateOptions extends Wasm64RasterEngineOptions {
  readonly chunkPixels?: number;
}

interface FilterRuntimeHandle {
  readonly engine: Wasm64RasterEngine;
  readonly gradExt: Wasm64FilterAuxExports | null;
  readonly simdInvert: Wasm64SimdInvertExports | null;
}

let sharedFilterRuntime: FilterRuntimeHandle | null = null;

function createFilterRuntime(options?: Wasm64RasterEngineOptions): FilterRuntimeHandle {
  const engine = createWasm64RasterEngine({ initialPages: BigInt(64), ...options });
  const wa = options?.webAssembly === null ? null : options?.webAssembly ?? (typeof WebAssembly === "object" ? WebAssembly : null);
  let gradExt: Wasm64FilterAuxExports | null = null;
  let simdInvert: Wasm64SimdInvertExports | null = null;
  if (engine.backend === "wasm64-native" && engine.memory && wa) {
    try {
      const gmBytes = getGradientMapModuleBytes();
      if (wa.validate(gmBytes as BufferSource)) {
        const exp = new wa.Instance(new wa.Module(gmBytes as BufferSource), { env: { memory: engine.memory } }).exports;
        if (typeof exp.applyGradientMapLut64 === "function") gradExt = exp as unknown as Wasm64FilterAuxExports;
      }
    } catch { gradExt = null; }
    try {
      const invBytes = getSimdInvertModuleBytes();
      if (wa.validate(invBytes as BufferSource)) {
        const exp = new wa.Instance(new wa.Module(invBytes as BufferSource), { env: { memory: engine.memory } }).exports;
        if (typeof exp.invertRgbSimd128_64 === "function") simdInvert = exp as unknown as Wasm64SimdInvertExports;
      }
    } catch { simdInvert = null; }
  }
  return { engine, gradExt, simdInvert };
}

function acquireFilterRuntime(options?: Wasm64FilterAccelerateOptions): { readonly handle: FilterRuntimeHandle; readonly owned: boolean } {
  if (options?.webAssembly !== undefined || options?.allowFallback !== undefined || options?.initialPages !== undefined) {
    return { handle: createFilterRuntime(options), owned: true };
  }
  if (!sharedFilterRuntime || sharedFilterRuntime.engine.disposed) {
    sharedFilterRuntime = createFilterRuntime();
  }
  return { handle: sharedFilterRuntime, owned: false };
}

/** 공유 필터 가속 스크래치 아레나를 즉시 해제한다. */
export function disposeSharedWasm64FilterEngine(): void {
  sharedFilterRuntime?.engine.dispose();
  sharedFilterRuntime = null;
}

export function isCspFilterWasm64Acceleratable(filterId: CspReaFilterId): filterId is Wasm64AcceleratedCspFilterId {
  return (WASM64_ACCELERATED_CSP_FILTER_IDS as readonly string[]).includes(filterId);
}

const clampF = (v: number, min: number, max: number): number => (!Number.isFinite(v) ? min : v < min ? min : v > max ? max : v);
const clampRoundByte = (v: number): number => (!Number.isFinite(v) ? 0 : v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));
const pNum = (p: CspReaFilterParamMap | undefined, k: string, fb: number): number =>
  typeof p?.[k] === "number" && Number.isFinite(p[k]) ? (p[k] as number) : fb;
const pBool = (p: CspReaFilterParamMap | undefined, k: string, fb: boolean): boolean =>
  typeof p?.[k] === "boolean" ? (p[k] as boolean) : fb;

function buildLevelLut1D(spec?: CspLevelChannelSpec): Uint8Array {
  const lut = new Uint8Array(256);
  if (!spec) { for (let i = 0; i < 256; i += 1) lut[i] = i; return lut; }
  const inB = clampF(spec.inputBlack, 0, 254);
  const inW = clampF(spec.inputWhite, inB + 1, 255);
  const invRange = 1 / (inW - inB);
  const invGamma = 1 / clampF(spec.gamma, 0.1, 9.99);
  const outB = clampF(spec.outputBlack, 0, 255);
  const outW = clampF(spec.outputWhite, 0, 255);
  for (let i = 0; i < 256; i += 1) {
    lut[i] = clampRoundByte(outB + Math.pow(clampF((i - inB) * invRange, 0, 1), invGamma) * (outW - outB));
  }
  return lut;
}

function packGrayLut256x3(lut1D: Uint8Array): Uint8Array {
  const lut = new Uint8Array(768);
  for (let i = 0; i < 256; i += 1) {
    const v = lut1D[i] ?? 0;
    lut[i * 3] = v; lut[i * 3 + 1] = v; lut[i * 3 + 2] = v;
  }
  return lut;
}

function buildFilterLut256x3(filterId: Exclude<Wasm64AcceleratedCspFilterId, "gradient-map">, params?: CspReaFilterParamMap): Uint8Array {
  if (filterId === "reverse-gradient") {
    const lut = new Uint8Array(768);
    for (let i = 0; i < 256; i += 1) { const v = 255 - i; lut[i * 3] = v; lut[i * 3 + 1] = v; lut[i * 3 + 2] = v; }
    return lut;
  }
  if (filterId === "brightness-contrast") {
    const b = clampF(pNum(params, "brightness", 10), -100, 100);
    const c = clampF(pNum(params, "contrast", 15), -100, 100);
    const lut1D = new Uint8Array(256);
    if (pBool(params, "legacyMode", false)) {
      const factor = (259 * (c * 2.55 + 255)) / (255 * (259 - c * 2.55));
      const offset = b * 2.55;
      for (let i = 0; i < 256; i += 1) lut1D[i] = clampRoundByte(factor * (i + offset - 128) + 128);
    } else {
      const bNorm = b / 100;
      const cSlope = c >= 0 ? 1 + (c / 100) * 1.85 : 1 + (c / 100) * 0.8;
      for (let i = 0; i < 256; i += 1) {
        const u = i / 255;
        const lit = bNorm >= 0 ? u + bNorm * (1 - u) * 0.72 : u + bNorm * u * 0.72;
        lut1D[i] = clampRoundByte(((lit - 0.5) * cSlope + 0.5) * 255);
      }
    }
    return packGrayLut256x3(lut1D);
  }
  if (filterId === "posterize") {
    const levels = clampF(Math.round(pNum(params, "levels", 6)), 2, 20);
    const step = 255 / (levels - 1);
    const lut1D = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) lut1D[i] = clampRoundByte(Math.floor((i / 256) * levels) * step);
    return packGrayLut256x3(lut1D);
  }
  if (filterId === "level-correction") {
    const mLut = buildLevelLut1D({
      inputBlack: pNum(params, "inputBlack", 10), gamma: pNum(params, "gamma", 1.0),
      inputWhite: pNum(params, "inputWhite", 245), outputBlack: pNum(params, "outputBlack", 0),
      outputWhite: pNum(params, "outputWhite", 255),
    });
    return packGrayLut256x3(mLut);
  }
  // tone-curve
  const midLift = pNum(params, "midtoneLift", 18);
  const shadowLift = pNum(params, "shadowLift", -8);
  const mLut = buildCspToneCurveLut([
    { x: 0, y: 0 }, { x: 64, y: Math.max(0, Math.min(255, 64 + shadowLift)) },
    { x: 128, y: Math.max(0, Math.min(255, 128 + midLift)) }, { x: 255, y: 255 },
  ]);
  return packGrayLut256x3(mLut);
}

function buildGradientMapLut256x3(params?: CspReaFilterParamMap): { readonly lut: Uint8Array; readonly mixRate: number } {
  const mixRate = clampF(pNum(params, "mixRate01", 1), 0, 1);
  const reverse = pBool(params, "reverse", false);
  const rawStops = Array.isArray(params?.stops) ? (params.stops as readonly CspGradientMapStop[]) : [
    { position01: 0, r: 22, g: 18, b: 46 }, { position01: 0.5, r: 172, g: 88, b: 84 }, { position01: 1, r: 248, g: 234, b: 204 },
  ];
  const sorted: readonly CspGradientMapStop[] = rawStops.length >= 2
    ? [...rawStops].sort((a, b) => a.position01 - b.position01)
    : [{ position01: 0, r: 24, g: 18, b: 36, a: 255 }, { position01: 0.5, r: 168, g: 98, b: 78, a: 255 }, { position01: 1, r: 248, g: 236, b: 214, a: 255 }];
  const lut = new Uint8Array(768);
  for (let idx = 0; idx < 256; idx += 1) {
    const t = reverse ? 1 - idx / 255 : idx / 255;
    let left = sorted[0] ?? { position01: 0, r: 0, g: 0, b: 0 };
    let right = sorted[sorted.length - 1] ?? { position01: 1, r: 255, g: 255, b: 255 };
    for (let s = 0; s < sorted.length - 1; s += 1) {
      const curr = sorted[s];
      const next = sorted[s + 1];
      if (curr && next && t >= curr.position01 && t <= next.position01) { left = curr; right = next; break; }
    }
    const localT = clampF((t - left.position01) / Math.max(1e-6, right.position01 - left.position01), 0, 1);
    lut[idx * 3] = clampRoundByte(left.r + (right.r - left.r) * localT);
    lut[idx * 3 + 1] = clampRoundByte(left.g + (right.g - left.g) * localT);
    lut[idx * 3 + 2] = clampRoundByte(left.b + (right.b - left.b) * localT);
  }
  return { lut, mixRate };
}

function jsApplyGradientMapChunk(buf: Uint8Array, lut: Uint8Array, mixRate: number): void {
  const invMix = 1 - mixRate;
  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i] ?? 0, g = buf[i + 1] ?? 0, b = buf[i + 2] ?? 0;
    const lum = clampRoundByte(0.2126 * r + 0.7152 * g + 0.0722 * b) * 3;
    buf[i] = clampRoundByte(r * invMix + (lut[lum] ?? 0) * mixRate);
    buf[i + 1] = clampRoundByte(g * invMix + (lut[lum + 1] ?? 0) * mixRate);
    buf[i + 2] = clampRoundByte(b * invMix + (lut[lum + 2] ?? 0) * mixRate);
  }
}

const nowMs = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

/**
 * 톤/색조·그라데이션 LUT 계열 CSP 필터를 Wasm64 네이티브 커널(비트 동치)로 가속 실행한다.
 * 미지원 필터 ID는 `null`을 반환해 호출부가 표준 JS 파이프라인으로 안전 폴스루하게 한다.
 */
export function accelerateCspFilterWithWasm64(
  filterId: CspReaFilterId,
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  params?: CspReaFilterParamMap,
  options?: Wasm64FilterAccelerateOptions,
): Wasm64FilterAccelerationResult | null {
  if (!isCspFilterWasm64Acceleratable(filterId)) return null;
  const pixelCount = Math.max(0, Math.trunc(width) * Math.trunc(height));
  const totalBytes = pixelCount * 4;
  const out = new Uint8ClampedArray(totalBytes);
  if (pixelCount === 0) {
    return Object.freeze({
      filterId, data: out, backend: "wasm64-native", addressMode: "i64", kernelPath: "wasm64-lut",
      pixelsProcessed: 0, elapsedMs: 0.001, throughputMegaPixelsPerSec: 0, accelerated: true,
    });
  }

  const { handle, owned } = acquireFilterRuntime(options);
  try {
    const chunkPixels = Math.max(1024, Math.min(1_048_576, Math.trunc(options?.chunkPixels ?? 524_288)));
    const chunkBytes = Math.min(totalBytes, chunkPixels * 4);
    const lutPtr = BigInt(chunkBytes);
    handle.engine.ensureCapacity(lutPtr + BigInt(1024));

    let kernelPath: Wasm64FilterAccelerationResult["kernelPath"] =
      handle.engine.backend === "wasm64-native" ? "wasm64-lut" : "js-fallback";
    let gradMix = 1;
    if (filterId === "gradient-map") {
      const gm = buildGradientMapLut256x3(params);
      gradMix = gm.mixRate;
      handle.engine.getScratchView(lutPtr, 768).set(gm.lut);
      kernelPath = handle.gradExt ? "wasm64-gradient-map" : "js-fallback";
    } else if (filterId === "reverse-gradient" && handle.simdInvert) {
      kernelPath = "wasm64-simd128-invert";
    } else {
      handle.engine.getScratchView(lutPtr, 768).set(buildFilterLut256x3(filterId, params));
    }

    const t0 = nowMs();
    const srcRaw = new Uint8Array(src.buffer, src.byteOffset, Math.min(src.byteLength, totalBytes));
    for (let offsetPx = 0; offsetPx < pixelCount; offsetPx += chunkPixels) {
      const count = Math.min(chunkPixels, pixelCount - offsetPx);
      const byteOff = offsetPx * 4;
      const byteLen = count * 4;
      const scratch = handle.engine.getScratchView(BigInt(0), byteLen);
      const avail = Math.max(0, Math.min(byteLen, srcRaw.byteLength - byteOff));
      if (avail > 0) scratch.set(srcRaw.subarray(byteOff, byteOff + avail));
      if (avail < byteLen) {
        scratch.fill(0, avail, byteLen);
        for (let p = avail; p + 3 < byteLen; p += 4) scratch[p + 3] = 255;
      }

      if (filterId === "gradient-map") {
        if (handle.gradExt) handle.gradExt.applyGradientMapLut64(BigInt(0), BigInt(count), lutPtr, gradMix);
        else jsApplyGradientMapChunk(scratch, handle.engine.getScratchView(lutPtr, 768), gradMix);
      } else if (filterId === "reverse-gradient" && handle.simdInvert) {
        handle.simdInvert.invertRgbSimd128_64(BigInt(0), BigInt(count));
      } else {
        handle.engine.applyTonalLut64(BigInt(0), BigInt(count), lutPtr);
      }
      out.set(scratch, byteOff);
    }
    const elapsedMs = Math.max(0.001, nowMs() - t0);
    return Object.freeze({
      filterId, data: out, backend: handle.engine.backend, addressMode: handle.engine.addressType,
      kernelPath, pixelsProcessed: pixelCount, elapsedMs: Number(elapsedMs.toFixed(3)),
      throughputMegaPixelsPerSec: Number((pixelCount / (elapsedMs / 1000) / 1_000_000).toFixed(2)),
      accelerated: true,
    });
  } finally {
    if (owned) handle.engine.dispose();
  }
}

/* 3) 240Hz 스타일러스 1-Euro 적응형 보정 + 확정/예측 꼬리 분리 (고스트 0%, T-018) */

export interface Stylus240HzStreamOptions {
  /** SAI 2 스타일 손떨림 보정 강도 (0=원본 바이패스, 1~15=적응형 1-Euro 보정). 기본 5. */
  readonly stabilizerLevel?: number;
  readonly minCutoffHz?: number;
  readonly beta?: number;
  readonly dCutoffHz?: number;
  readonly pressureCutoffHz?: number;
  readonly defaultSampleRateHz?: number;
  readonly originX?: number;
  readonly originY?: number;
  readonly includePredicted?: boolean;
  readonly maxPredicted?: number;
  readonly maxPredictedJumpPx?: number;
  readonly maxPredictedLeadMs?: number;
}

export interface StabilizedStylusSample extends HighFreqStylusSample {
  readonly rawX: number;
  readonly rawY: number;
  readonly speedPxPerSec: number;
  readonly appliedCutoffHz: number;
  readonly smoothingAlpha: number;
}

export interface Stylus240HzStrokeStreamResult {
  readonly committedSamples: readonly StabilizedStylusSample[];
  readonly predictedTail: readonly StabilizedStylusSample[];
  readonly coalescedInputCount: number;
  readonly predictedInputCount: number;
  readonly droppedGhostPredictedCount: number;
  readonly effectiveSampleRateHz: number;
  readonly jitterReductionRatio: number;
  readonly averageLatencyMs: number;
  readonly usedCoalescedApi: boolean;
  readonly usedPredictedApi: boolean;
  readonly ghostArtifactsGuaranteedZero: true;
}

interface OneEuro2DState {
  initialized: boolean;
  x: number; y: number; pressure: number;
  vx: number; vy: number; lastTimeStamp: number;
}

const oneEuroAlpha = (cutoffHz: number, dtSec: number): number => {
  const tau = 1 / (2 * Math.PI * Math.max(0.05, cutoffHz));
  return 1 / (1 + tau / Math.max(1e-4, dtSec));
};

function resolveOneEuroParams(options?: Stylus240HzStreamOptions): {
  readonly level: number; readonly minCutoffHz: number; readonly beta: number;
  readonly dCutoffHz: number; readonly pressureCutoffHz: number; readonly defaultDtSec: number;
  readonly maxJumpPx: number; readonly maxLeadMs: number;
} {
  const level = clampF(Math.round(options?.stabilizerLevel ?? 5), 0, 15);
  const t = level / 15;
  return {
    level,
    minCutoffHz: options?.minCutoffHz ?? (level === 0 ? 120 : 3.2 - t * 2.65),
    beta: options?.beta ?? (level === 0 ? 1.0 : 0.018 - t * 0.012),
    dCutoffHz: options?.dCutoffHz ?? 1.2,
    pressureCutoffHz: options?.pressureCutoffHz ?? 6.0,
    defaultDtSec: 1 / Math.max(30, Math.min(1000, options?.defaultSampleRateHz ?? 240)),
    maxJumpPx: Math.max(4, options?.maxPredictedJumpPx ?? 48),
    maxLeadMs: Math.max(2, options?.maxPredictedLeadMs ?? 18),
  };
}

function stepOneEuro2D(
  state: OneEuro2DState,
  sample: HighFreqStylusSample,
  cfg: ReturnType<typeof resolveOneEuroParams>,
): StabilizedStylusSample {
  if (!state.initialized || cfg.level === 0) {
    const dt = state.initialized && sample.timeStamp > state.lastTimeStamp
      ? clampF((sample.timeStamp - state.lastTimeStamp) / 1000, 1 / 1000, 0.1)
      : cfg.defaultDtSec;
    const speed = state.initialized ? Math.hypot(sample.x - state.x, sample.y - state.y) / dt : 0;
    state.initialized = true;
    state.x = sample.x; state.y = sample.y; state.pressure = sample.pressure;
    state.vx = 0; state.vy = 0; state.lastTimeStamp = sample.timeStamp;
    return Object.freeze({ ...sample, rawX: sample.x, rawY: sample.y, speedPxPerSec: speed, appliedCutoffHz: cfg.minCutoffHz, smoothingAlpha: 1 });
  }

  const rawDtMs = sample.timeStamp - state.lastTimeStamp;
  const dtSec = rawDtMs > 0 ? clampF(rawDtMs / 1000, 1 / 1000, 0.1) : cfg.defaultDtSec;
  const rawVx = (sample.x - state.x) / dtSec;
  const rawVy = (sample.y - state.y) / dtSec;
  const alphaD = oneEuroAlpha(cfg.dCutoffHz, dtSec);
  state.vx += alphaD * (rawVx - state.vx);
  state.vy += alphaD * (rawVy - state.vy);
  const speed = Math.hypot(state.vx, state.vy);
  const cutoff = cfg.minCutoffHz + cfg.beta * speed;
  const alpha = oneEuroAlpha(cutoff, dtSec);
  const pAlpha = oneEuroAlpha(cfg.pressureCutoffHz, dtSec);
  state.x += alpha * (sample.x - state.x);
  state.y += alpha * (sample.y - state.y);
  state.pressure = clampF(state.pressure + pAlpha * (sample.pressure - state.pressure), 0, 1);
  state.lastTimeStamp = sample.timeStamp;

  return Object.freeze({
    ...sample,
    x: state.x, y: state.y, pressure: state.pressure,
    rawX: sample.x, rawY: sample.y,
    speedPxPerSec: Number(speed.toFixed(2)),
    appliedCutoffHz: Number(cutoff.toFixed(3)),
    smoothingAlpha: Number(alpha.toFixed(4)),
  });
}

function measureSecondDiffEnergy(pts: readonly { readonly x: number; readonly y: number }[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    if (!a || !b || !c) continue;
    sum += Math.hypot(c.x - 2 * b.x + a.x, c.y - 2 * b.y + a.y);
  }
  return sum;
}

export interface Stylus240HzStreamProcessor {
  pushEvent(event: StylusPointerEventLike): Stylus240HzStrokeStreamResult;
  pushBatch(batch: HighFreqStylusBatch): Stylus240HzStrokeStreamResult;
  reset(): void;
  getSnapshot(): Stylus240HzStrokeStreamResult;
}

/** 240Hz 스타일러스 스트림을 상태 유지 방식으로 처리하며 확정 궤적과 임시 예측 꼬리를 완전 분리한다. */
export function create240HzStylusStrokeStreamProcessor(
  options: Stylus240HzStreamOptions = {},
): Stylus240HzStreamProcessor {
  const cfg = resolveOneEuroParams(options);
  const state: OneEuro2DState = { initialized: false, x: 0, y: 0, pressure: 0.5, vx: 0, vy: 0, lastTimeStamp: 0 };
  let committed: StabilizedStylusSample[] = [];
  let predictedTail: StabilizedStylusSample[] = [];
  let coalescedInputCount = 0, predictedInputCount = 0, droppedGhostPredictedCount = 0;
  let usedCoalescedApi = false, usedPredictedApi = false;

  const getSnapshot = (): Stylus240HzStrokeStreamResult => {
    let dtSumMs = 0, dtCount = 0;
    for (let i = 1; i < committed.length; i += 1) {
      const prev = committed[i - 1], curr = committed[i];
      if (prev && curr && curr.timeStamp > prev.timeStamp) { dtSumMs += curr.timeStamp - prev.timeStamp; dtCount += 1; }
    }
    const averageLatencyMs = dtCount > 0 ? dtSumMs / dtCount : cfg.defaultDtSec * 1000;
    const effectiveSampleRateHz = averageLatencyMs > 0 ? 1000 / averageLatencyMs : 240;
    const rawEnergy = measureSecondDiffEnergy(committed.map((s) => ({ x: s.rawX, y: s.rawY })));
    const smoothEnergy = measureSecondDiffEnergy(committed);
    const jitterReductionRatio = rawEnergy > 1e-5 ? clampF((rawEnergy - smoothEnergy) / rawEnergy, 0, 1) : 0;

    return Object.freeze({
      committedSamples: Object.freeze([...committed]),
      predictedTail: Object.freeze([...predictedTail]),
      coalescedInputCount, predictedInputCount, droppedGhostPredictedCount,
      effectiveSampleRateHz: Number(effectiveSampleRateHz.toFixed(1)),
      jitterReductionRatio: Number(jitterReductionRatio.toFixed(4)),
      averageLatencyMs: Number(averageLatencyMs.toFixed(3)),
      usedCoalescedApi, usedPredictedApi, ghostArtifactsGuaranteedZero: true,
    });
  };

  const pushBatch = (batch: HighFreqStylusBatch): Stylus240HzStrokeStreamResult => {
    // 새 포인터 프레임이 들어오면 이전 프레임의 예측 꼬리를 즉시 폐기해 고스트 아티팩트를 0%로 보장한다.
    droppedGhostPredictedCount += predictedTail.length;
    predictedTail = [];
    coalescedInputCount += batch.coalescedCount;
    predictedInputCount += batch.predictedCount;
    usedCoalescedApi = usedCoalescedApi || batch.usedCoalescedApi;
    usedPredictedApi = usedPredictedApi || batch.usedPredictedApi;

    const rawPredicted: HighFreqStylusSample[] = [];
    for (const sample of batch.samples) {
      if (sample.predicted) rawPredicted.push(sample);
      else committed.push(stepOneEuro2D(state, sample, cfg));
    }

    // 예측 꼬리는 영구 필터 상태를 절대 오염시키지 않는 스냅샷 복사본으로만 투영한다.
    if (state.initialized && rawPredicted.length > 0 && options.includePredicted !== false) {
      const epState: OneEuro2DState = { ...state };
      const anchorTime = state.lastTimeStamp;
      const limit = Math.max(0, Math.min(8, Math.trunc(options.maxPredicted ?? 3)));
      for (const pred of rawPredicted.slice(0, limit)) {
        if (pred.timeStamp > 0 && anchorTime > 0 && pred.timeStamp <= anchorTime) continue;
        if (pred.timeStamp > 0 && anchorTime > 0 && pred.timeStamp - anchorTime > cfg.maxLeadMs) continue;
        const dist = Math.hypot(pred.x - epState.x, pred.y - epState.y);
        const clampedPred: HighFreqStylusSample = dist > cfg.maxJumpPx && dist > 1e-5
          ? { ...pred, x: epState.x + ((pred.x - epState.x) * cfg.maxJumpPx) / dist, y: epState.y + ((pred.y - epState.y) * cfg.maxJumpPx) / dist }
          : pred;
        predictedTail.push(stepOneEuro2D(epState, clampedPred, cfg));
      }
    }
    return getSnapshot();
  };

  return {
    pushEvent(event: StylusPointerEventLike): Stylus240HzStrokeStreamResult {
      return pushBatch(extractHighFreqStylusSamples(event, {
        originX: options.originX, originY: options.originY,
        includePredicted: options.includePredicted ?? true, maxPredicted: options.maxPredicted ?? 3,
      }));
    },
    pushBatch,
    reset(): void {
      state.initialized = false; state.vx = 0; state.vy = 0; state.lastTimeStamp = 0;
      committed = []; predictedTail = [];
      coalescedInputCount = 0; predictedInputCount = 0; droppedGhostPredictedCount = 0;
      usedCoalescedApi = false; usedPredictedApi = false;
    },
    getSnapshot,
  };
}

const isBatch = (input: StylusPointerEventLike | HighFreqStylusBatch): input is HighFreqStylusBatch =>
  Array.isArray((input as HighFreqStylusBatch).samples);

/** `pointerrawupdate` 이벤트 또는 배치 시퀀스를 1-Euro 보정 + 확정/예측 꼬리 분리 처리한다. */
export function process240HzStylusStrokeStream(
  inputs: readonly (StylusPointerEventLike | HighFreqStylusBatch)[],
  options: Stylus240HzStreamOptions = {},
): Stylus240HzStrokeStreamResult {
  const processor = create240HzStylusStrokeStreamProcessor(options);
  for (const item of inputs) {
    if (isBatch(item)) processor.pushBatch(item);
    else processor.pushEvent(item);
  }
  return processor.getSnapshot();
}

/* 4) 머티리얼 브러시 댑 ↔ Wasm64 256×256 타일 캔버스 직결 브리지 */

export interface Wasm64MaterialBrushMarkLike {
  readonly x: number; readonly y: number;
  readonly radiusX: number; readonly radiusY: number;
  readonly opacity: number; readonly color: string;
  readonly hardness?: number;
}

export interface Wasm64MaterialBrushRasterResult {
  readonly backend: Wasm64RasterBackend;
  readonly addressMode: "i64" | "js-heap";
  readonly marksStamped: number;
  readonly totalTouchedPixels: number;
  readonly dirtyTilesProcessed: number;
  readonly skippedCleanTiles: number;
  readonly compositeReport: Wasm64TiledCompositeReport;
  readonly parallelPlan: Wasm64ParallelTilePlan;
  readonly simd128: Wasm64Simd128ProbeReport;
}

function parseHexRgb(hex: string): readonly [number, number, number] {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  if (clean.length !== 6) return [24, 24, 28];
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b) ? [r, g, b] : [24, 24, 28];
}

/** 머티리얼 브러시 댑 시퀀스를 Wasm64 256×256 더티 타일에 스탬핑·합성한다. */
export function rasterizeMaterialBrushMarksWithWasm64(
  marks: readonly Wasm64MaterialBrushMarkLike[],
  surfaceWidth: number,
  surfaceHeight: number,
  options?: Wasm64RasterEngineOptions & {
    readonly tileSizePx?: 128 | 256 | 512;
    readonly blendMode?: Wasm64BlendMode;
    readonly layerOpacity01?: number;
    readonly workerCount?: number;
  },
): Wasm64MaterialBrushRasterResult {
  const compositor: Wasm64TiledCompositor = createWasm64TiledCompositor({
    width: surfaceWidth, height: surfaceHeight, tileSizePx: options?.tileSizePx ?? 256,
    initialPages: options?.initialPages, maximumPages: options?.maximumPages,
    minimumPages: options?.minimumPages, allowFallback: options?.allowFallback, webAssembly: options?.webAssembly,
  });
  try {
    let totalTouchedPixels = 0;
    for (const mark of marks) {
      const radius = Math.max(0.5, (Math.abs(mark.radiusX) + Math.abs(mark.radiusY)) * 0.5);
      const [r, g, b] = parseHexRgb(mark.color);
      const alpha255 = clampByte(Math.round(clampF(mark.opacity, 0, 1) * 255));
      const hardness255 = clampByte(Math.round(clampF(mark.hardness ?? 0.82, 0, 1) * 255));
      const stamped = compositor.stampBrushDab("brush-live", { cx: mark.x, cy: mark.y, radius, r, g, b, alpha255, hardness255 });
      totalTouchedPixels += stamped.touchedPixels;
    }
    const dirtyCoords = compositor.getDirtyTileCoords();
    const parallelPlan = planParallelTileBatches(dirtyCoords, { workerCount: options?.workerCount });
    const compositeReport = compositor.compositeDirtyTiles([
      { id: "brush-live", blendMode: options?.blendMode ?? "source-over", opacity01: options?.layerOpacity01 ?? 1 },
    ]);
    return Object.freeze({
      backend: compositeReport.backend, addressMode: compositeReport.addressMode,
      marksStamped: marks.length, totalTouchedPixels,
      dirtyTilesProcessed: compositeReport.dirtyTilesProcessed,
      skippedCleanTiles: compositeReport.skippedCleanTiles,
      compositeReport, parallelPlan, simd128: compositor.simd128,
    });
  } finally {
    compositor.dispose();
  }
}
