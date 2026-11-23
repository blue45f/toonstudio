/**
 * WebAssembly 64-bit (`memory64`) 코어 드로잉 실행 런타임, 64비트 가상 타일 스와퍼,
 * 비동기 델타 히스토리 직렬화기.
 *
 * - `StudioWasmLinearMemoryRuntime` 선형 메모리를 [상주 타일 아레나]와 [임시 스크래치 아레나]로
 *   충돌 없이 격리 배정하여 타일 데이터와 Wasm64 커널 연산이 서로 덮어쓰지 않도록 보장한다.
 * - `memory64` 미지원 런타임에서는 동일 연산 Wasm32(`i32`) 바이너리로 자동 우아 폴백한다.
 */

import {
  checkStudioWasm64Capability,
  createStudioWasmMemoryRuntime,
  STUDIO_WASM32_ADDRESS_LIMIT_BYTES,
  STUDIO_WASM_PAGE_BYTES,
  StudioWasm64MemoryManager,
  type StudioWasm64CapabilityReport,
  type StudioWasmAddressType,
  type StudioWasmLinearMemoryRuntime,
} from "../studio-wasm64-memory-governor";

import {
  buildSyntheticPsdHeaderBytes,
  createWasm64HubDemoFixtures,
  parseLargePsdHeaderWasm64,
  runWasm64FilterOrWarp,
  vectorizeStrokeWasm64,
  type CubicBezierCurveSegment,
  type MlsWarpPin2D,
  type ParsedPsdHeaderWasm64,
  type ParsePsdHeaderResult,
  type PsdColorModeName,
  type StrokeSamplePoint,
  type VectorizeStrokeResult,
  type Wasm64FilterOrWarpRequest,
  type Wasm64FilterOrWarpResult,
} from "./wasm64-drawing-algorithms";
import {
  buildWasmDrawingModuleBytes,
  WASM32_DRAWING_LIMITS_FLAG,
  WASM64_DRAWING_LIMITS_FLAG,
} from "./wasm64-drawing-binary";

export {
  buildSyntheticPsdHeaderBytes,
  buildWasmDrawingModuleBytes,
  createWasm64HubDemoFixtures,
  parseLargePsdHeaderWasm64,
  runWasm64FilterOrWarp,
  vectorizeStrokeWasm64,
  WASM32_DRAWING_LIMITS_FLAG,
  WASM64_DRAWING_LIMITS_FLAG,
};
export type {
  CubicBezierCurveSegment,
  MlsWarpPin2D,
  ParsedPsdHeaderWasm64,
  ParsePsdHeaderResult,
  PsdColorModeName,
  StrokeSamplePoint,
  VectorizeStrokeResult,
  Wasm64FilterOrWarpRequest,
  Wasm64FilterOrWarpResult,
};

const ZERO = BigInt(0);
const ALIGN_64 = BigInt(64);
const DEFAULT_TILE_DIM = 256;
export const WASM64_TILE_RGBA_BYTES = DEFAULT_TILE_DIM * DEFAULT_TILE_DIM * 4;
export const WASM64_PAGE_SIZE_BYTES = STUDIO_WASM_PAGE_BYTES;
const DEFAULT_SWAPPER_BASE_ADDR = STUDIO_WASM32_ADDRESS_LIMIT_BYTES + BigInt(1024 * 1024);

export type Wasm64DrawingBackendMode = "wasm64-native" | "wasm32-fallback" | "js-fallback";

export interface Wasm64DrawingModuleOptions {
  readonly initialPages?: bigint;
  readonly maximumPages?: bigint;
  readonly preferAddressType?: StudioWasmAddressType;
  readonly webAssembly?: typeof WebAssembly | null;
}

interface RawWasm64Exports {
  readonly unsharpMixRgba: (o: bigint, b: bigint, out: bigint, count: bigint, amtQ8: number, thr: number) => number;
  readonly xorDeltaBytes: (prev: bigint, next: bigint, out: bigint, len: bigint) => number;
  readonly fnv1aChecksum: (ptr: bigint, len: bigint) => number;
  readonly blendRgbaLinear: (dst: bigint, src: bigint, count: bigint, ratioQ8: number) => number;
}

interface RawWasm32Exports {
  readonly unsharpMixRgba: (o: number, b: number, out: number, count: number, amtQ8: number, thr: number) => number;
  readonly xorDeltaBytes: (prev: number, next: number, out: number, len: number) => number;
  readonly fnv1aChecksum: (ptr: number, len: number) => number;
  readonly blendRgbaLinear: (dst: number, src: number, count: number, ratioQ8: number) => number;
}

export interface Wasm64DrawingModuleInstance {
  readonly backendMode: Wasm64DrawingBackendMode;
  readonly addressType: StudioWasmAddressType | "js";
  readonly capability: StudioWasm64CapabilityReport;
  readonly memoryRuntime: StudioWasmLinearMemoryRuntime | null;
  readonly moduleByteLength: number;
  readonly memoryLimitsFlag: number;
  readonly unsharpMixRgba: (
    orig: Uint8Array,
    blurred: Uint8Array,
    amount: number,
    threshold: number,
  ) => { readonly output: Uint8Array; readonly modifiedPixels: number };
  readonly xorDeltaBytes: (
    prev: Uint8Array,
    next: Uint8Array,
  ) => { readonly delta: Uint8Array; readonly changedBytes: number };
  readonly computeFnv1aChecksum: (bytes: Uint8Array) => number;
  readonly blendRgbaLinear: (
    dst: Uint8Array,
    src: Uint8Array,
    ratio: number,
  ) => { readonly output: Uint8Array; readonly processedPixels: number };
}

// 선형 메모리 내 영구 타일 풀 예약 구간과 임시 스크래치 영역을 격리 관리한다.
interface LinearArenaReservation {
  readonly start: bigint;
  readonly end: bigint;
}

const activeArenaReservations = new WeakMap<StudioWasmLinearMemoryRuntime, LinearArenaReservation[]>();

function alignUp64(value: bigint): bigint {
  const rem = value % ALIGN_64;
  return rem === ZERO ? value : value + ALIGN_64 - rem;
}

function getScratchBaseOffsetI64(runtime: StudioWasmLinearMemoryRuntime): bigint {
  const list = activeArenaReservations.get(runtime);
  if (!list || list.length === 0) return ZERO;
  let maxEnd = ZERO;
  for (const r of list) {
    if (r.end > maxEnd) maxEnd = r.end;
  }
  return alignUp64(maxEnd);
}

function reserveLinearArena(
  runtime: StudioWasmLinearMemoryRuntime,
  byteLength: number,
): { readonly baseOffsetI64: bigint; readonly release: () => void } {
  const list = activeArenaReservations.get(runtime) ?? [];
  if (!activeArenaReservations.has(runtime)) activeArenaReservations.set(runtime, list);
  const start = getScratchBaseOffsetI64(runtime);
  const reservation: LinearArenaReservation = { start, end: start + BigInt(byteLength) };
  list.push(reservation);
  let released = false;
  return {
    baseOffsetI64: start,
    release: () => {
      if (released) return;
      released = true;
      const idx = list.indexOf(reservation);
      if (idx >= 0) list.splice(idx, 1);
    },
  };
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function jsFnv1aChecksum(bytes: Uint8Array): number {
  let hash = 0x811c9dc5 | 0;
  for (let i = 0; i < bytes.length; i += 1) hash = Math.imul(hash ^ (bytes[i] ?? 0), 16777619);
  return hash >>> 0;
}

function jsUnsharpMixRgba(
  orig: Uint8Array,
  blurred: Uint8Array,
  amountQ8: number,
  threshold: number,
): { readonly output: Uint8Array; readonly modifiedPixels: number } {
  const len = Math.min(orig.length, blurred.length) & ~3;
  const output = new Uint8Array(len);
  let modified = 0;
  for (let i = 0; i < len; i += 4) {
    let changed = 0;
    for (let ch = 0; ch < 3; ch += 1) {
      const oVal = orig[i + ch] ?? 0;
      const bVal = blurred[i + ch] ?? 0;
      const diff = oVal - bVal;
      const absDiff = diff < 0 ? -diff : diff;
      let val = oVal;
      if (absDiff >= threshold) {
        val = oVal + ((diff * amountQ8) >> 8);
        if (val < 0) val = 0;
        if (val > 255) val = 255;
        if (val !== oVal) changed = 1;
      }
      output[i + ch] = val;
    }
    output[i + 3] = orig[i + 3] ?? 255;
    modified += changed;
  }
  return { output, modifiedPixels: modified };
}

function jsXorDeltaBytes(
  prev: Uint8Array,
  next: Uint8Array,
): { readonly delta: Uint8Array; readonly changedBytes: number } {
  const len = Math.min(prev.length, next.length);
  const delta = new Uint8Array(len);
  let changed = 0;
  for (let i = 0; i < len; i += 1) {
    const x = (prev[i] ?? 0) ^ (next[i] ?? 0);
    delta[i] = x;
    if (x !== 0) changed += 1;
  }
  return { delta, changedBytes: changed };
}

function jsBlendRgbaLinear(
  dst: Uint8Array,
  src: Uint8Array,
  ratioQ8: number,
): { readonly output: Uint8Array; readonly processedPixels: number } {
  const len = Math.min(dst.length, src.length) & ~3;
  const output = new Uint8Array(len);
  const r = ratioQ8 < 0 ? 0 : ratioQ8 > 256 ? 256 : ratioQ8 | 0;
  const invR = 256 - r;
  for (let i = 0; i < len; i += 4) {
    for (let ch = 0; ch < 4; ch += 1) {
      output[i + ch] = (((dst[i + ch] ?? 0) * invR + (src[i + ch] ?? 0) * r + 128) >>> 8);
    }
  }
  return { output, processedPixels: len >>> 2 };
}

function resolveWebAssembly(override: typeof WebAssembly | null | undefined): typeof WebAssembly | null {
  if (override === null) return null;
  if (override !== undefined) return override;
  return typeof WebAssembly === "object" ? WebAssembly : null;
}

function tryInstantiateMode(
  addressType: StudioWasmAddressType,
  options: Wasm64DrawingModuleOptions,
): Wasm64DrawingModuleInstance | null {
  const wasmApi = resolveWebAssembly(options.webAssembly);
  if (!wasmApi) return null;

  const initialPages = options.initialPages ?? BigInt(8);
  const maximumPages = options.maximumPages ?? (addressType === "i64" ? BigInt(16384) : BigInt(4096));
  const runtimeResult = createStudioWasmMemoryRuntime({
    selectedMode: addressType, initialPages, maximumPages, webAssembly: options.webAssembly,
  });
  if (!runtimeResult.ok) return null;

  const { runtime, capability } = runtimeResult;
  const moduleBytes = buildWasmDrawingModuleBytes(addressType, { initialPages, maximumPages });
  let instance: WebAssembly.Instance;
  try {
    if (!wasmApi.validate(moduleBytes)) return null;
    const mod = new wasmApi.Module(moduleBytes);
    instance = new wasmApi.Instance(mod, { env: { memory: runtime.memory } });
  } catch {
    return null;
  }

  const acquireScratch = (totalBytes: number): { readonly baseI64: bigint; readonly view: Uint8Array } | null => {
    const baseI64 = getScratchBaseOffsetI64(runtime);
    const grow = runtime.growToFit(baseI64 + BigInt(totalBytes));
    if (!grow.ok) return null;
    const viewRes = runtime.createByteView(baseI64, totalBytes);
    return viewRes.ok ? { baseI64, view: viewRes.view } : null;
  };

  const is64 = addressType === "i64";
  const exp64 = instance.exports as unknown as RawWasm64Exports;
  const exp32 = instance.exports as unknown as RawWasm32Exports;

  return {
    backendMode: is64 ? "wasm64-native" : "wasm32-fallback",
    addressType,
    capability,
    memoryRuntime: runtime,
    moduleByteLength: moduleBytes.byteLength,
    memoryLimitsFlag: is64 ? WASM64_DRAWING_LIMITS_FLAG : WASM32_DRAWING_LIMITS_FLAG,
    unsharpMixRgba(orig, blurred, amount, threshold) {
      const len = Math.min(orig.length, blurred.length) & ~3;
      const amtQ8 = Math.max(0, Math.round(amount * 256));
      const thr = Math.max(0, Math.min(255, Math.round(threshold)));
      if (len === 0) return { output: new Uint8Array(0), modifiedPixels: 0 };
      const scratch = acquireScratch(len * 3);
      if (!scratch) return jsUnsharpMixRgba(orig, blurred, amtQ8, thr);
      scratch.view.set(orig.subarray(0, len), 0);
      scratch.view.set(blurred.subarray(0, len), len);
      const pixelCount = len >>> 2;
      const base = scratch.baseI64;
      const modifiedPixels = is64
        ? exp64.unsharpMixRgba(base, base + BigInt(len), base + BigInt(len * 2), BigInt(pixelCount), amtQ8, thr)
        : exp32.unsharpMixRgba(Number(base), Number(base) + len, Number(base) + len * 2, pixelCount, amtQ8, thr);
      const outView = runtime.createByteView(base + BigInt(len * 2), len);
      return { output: outView.ok ? new Uint8Array(outView.view) : new Uint8Array(len), modifiedPixels };
    },
    xorDeltaBytes(prev, next) {
      const len = Math.min(prev.length, next.length);
      if (len === 0) return { delta: new Uint8Array(0), changedBytes: 0 };
      const scratch = acquireScratch(len * 3);
      if (!scratch) return jsXorDeltaBytes(prev, next);
      scratch.view.set(prev.subarray(0, len), 0);
      scratch.view.set(next.subarray(0, len), len);
      const base = scratch.baseI64;
      const changedBytes = is64
        ? exp64.xorDeltaBytes(base, base + BigInt(len), base + BigInt(len * 2), BigInt(len))
        : exp32.xorDeltaBytes(Number(base), Number(base) + len, Number(base) + len * 2, len);
      const outView = runtime.createByteView(base + BigInt(len * 2), len);
      return { delta: outView.ok ? new Uint8Array(outView.view) : new Uint8Array(len), changedBytes };
    },
    computeFnv1aChecksum(bytes) {
      if (bytes.length === 0) return 0x811c9dc5 >>> 0;
      const scratch = acquireScratch(bytes.length);
      if (!scratch) return jsFnv1aChecksum(bytes);
      scratch.view.set(bytes, 0);
      const raw = is64
        ? exp64.fnv1aChecksum(scratch.baseI64, BigInt(bytes.length))
        : exp32.fnv1aChecksum(Number(scratch.baseI64), bytes.length);
      return raw >>> 0;
    },
    blendRgbaLinear(dst, src, ratio) {
      const len = Math.min(dst.length, src.length) & ~3;
      const rQ8 = Math.max(0, Math.min(256, Math.round(ratio * 256)));
      if (len === 0) return { output: new Uint8Array(0), processedPixels: 0 };
      const scratch = acquireScratch(len * 2);
      if (!scratch) return jsBlendRgbaLinear(dst, src, rQ8);
      scratch.view.set(dst.subarray(0, len), 0);
      scratch.view.set(src.subarray(0, len), len);
      const pixelCount = len >>> 2;
      const base = scratch.baseI64;
      const processedPixels = is64
        ? exp64.blendRgbaLinear(base, base + BigInt(len), BigInt(pixelCount), rQ8)
        : exp32.blendRgbaLinear(Number(base), Number(base) + len, pixelCount, rQ8);
      const outView = runtime.createByteView(base, len);
      return { output: outView.ok ? new Uint8Array(outView.view) : new Uint8Array(len), processedPixels };
    },
  };
}

/** WebAssembly 64-bit (`memory64`) 드로잉 모듈을 인스턴스화하며 미지원 환경은 Wasm32로 폴백한다. */
export function instantiateWasm64DrawingModule(
  options: Wasm64DrawingModuleOptions = {},
): Wasm64DrawingModuleInstance {
  const prefer = options.preferAddressType ?? "i64";
  if (prefer === "i64") {
    const wasm64 = tryInstantiateMode("i64", options);
    if (wasm64) return wasm64;
  }
  const wasm32 = tryInstantiateMode("i32", options);
  if (wasm32) return wasm32;

  const capability = checkStudioWasm64Capability({ webAssembly: options.webAssembly, selectedMode: prefer });
  return {
    backendMode: "js-fallback",
    addressType: "js",
    capability,
    memoryRuntime: null,
    moduleByteLength: 0,
    memoryLimitsFlag: 0x00,
    unsharpMixRgba: (orig, blurred, amount, threshold) =>
      jsUnsharpMixRgba(orig, blurred, Math.max(0, Math.round(amount * 256)), Math.max(0, Math.min(255, Math.round(threshold)))),
    xorDeltaBytes: jsXorDeltaBytes,
    computeFnv1aChecksum: jsFnv1aChecksum,
    blendRgbaLinear: (dst, src, ratio) =>
      jsBlendRgbaLinear(dst, src, Math.max(0, Math.min(256, Math.round(ratio * 256)))),
  };
}

// ---------------------------------------------------------------------------
// 64비트 주소 공간 256×256 가상 타일 LRU 스와퍼
// ---------------------------------------------------------------------------

function compressRleBytes(raw: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < raw.length) {
    const val = raw[i] ?? 0;
    let run = 1;
    while (i + run < raw.length && run < 255 && raw[i + run] === val) run += 1;
    out.push(run, val);
    i += run;
  }
  return new Uint8Array(out);
}

function decompressRleBytes(compressed: Uint8Array, expectedLen: number): Uint8Array {
  const out = new Uint8Array(expectedLen);
  let pos = 0;
  for (let i = 0; i + 1 < compressed.length && pos < expectedLen; i += 2) {
    const run = compressed[i] ?? 0;
    const val = compressed[i + 1] ?? 0;
    const end = Math.min(expectedLen, pos + run);
    out.fill(val, pos, end);
    pos = end;
  }
  return out;
}

export interface Wasm64TileSwapperOptions {
  readonly tileBytes?: number;
  readonly maxResidentBytes: number;
  readonly baseVirtualAddrI64?: bigint;
  readonly memoryRuntime?: StudioWasmLinearMemoryRuntime | null;
  readonly checksumFn?: (bytes: Uint8Array) => number;
}

export interface Wasm64TileSwapperStats {
  readonly tileBytes: number;
  readonly residentTiles: number;
  readonly swappedOutTiles: number;
  readonly residentBytes: number;
  readonly maxResidentBytes: number;
  readonly swapOuts: number;
  readonly swapIns: number;
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly totalVirtualAllocatedBytesI64: bigint;
  readonly highWaterVirtualAddrI64: bigint;
  readonly crosses4GiBBoundary: boolean;
  readonly backingLinearMemoryBytes: bigint;
}

interface ResidentTileSlot {
  readonly globalAddrI64: bigint;
  readonly slotIndex: number;
  readonly checksum: number;
  lastTick: number;
  fallbackPixels: Uint8Array | null;
}

interface SwappedTileRecord {
  readonly globalAddrI64: bigint;
  readonly checksum: number;
  readonly compressed: Uint8Array;
}

/** `StudioWasmLinearMemoryRuntime` 격리 아레나와 연동하는 64비트 256×256 타일 LRU 스와퍼. */
export class Wasm64VirtualTileSwapper {
  private readonly tileBytes: number;
  private readonly maxResidentBytes: number;
  private readonly maxSlots: number;
  private readonly addressManager: StudioWasm64MemoryManager;
  private readonly memoryRuntime: StudioWasmLinearMemoryRuntime | null;
  private readonly arenaBaseOffsetI64: bigint;
  private readonly releaseArena: (() => void) | null;
  private readonly checksumFn: (bytes: Uint8Array) => number;
  private readonly resident = new Map<string, ResidentTileSlot>();
  private readonly swapped = new Map<string, SwappedTileRecord>();
  private readonly freeSlots: number[] = [];
  private tick = 0;
  private swapOuts = 0;
  private swapIns = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private highWaterAddrI64: bigint;

  constructor(options: Wasm64TileSwapperOptions) {
    this.tileBytes = options.tileBytes ?? WASM64_TILE_RGBA_BYTES;
    if (this.tileBytes <= 0 || this.tileBytes % 4 !== 0) {
      throw new RangeError("tileBytes must be a positive multiple of 4");
    }
    this.maxResidentBytes = options.maxResidentBytes;
    this.maxSlots = Math.floor(this.maxResidentBytes / this.tileBytes);
    if (this.maxSlots < 1) throw new RangeError("maxResidentBytes must fit at least one tile");

    const baseAddr = options.baseVirtualAddrI64 ?? DEFAULT_SWAPPER_BASE_ADDR;
    this.highWaterAddrI64 = baseAddr;
    this.addressManager = new StudioWasm64MemoryManager({ startAddressI64: baseAddr });
    this.memoryRuntime = options.memoryRuntime ?? null;
    if (this.memoryRuntime) {
      const reserved = reserveLinearArena(this.memoryRuntime, this.maxSlots * this.tileBytes);
      this.arenaBaseOffsetI64 = reserved.baseOffsetI64;
      this.releaseArena = reserved.release;
    } else {
      this.arenaBaseOffsetI64 = ZERO;
      this.releaseArena = null;
    }
    this.checksumFn = options.checksumFn ?? jsFnv1aChecksum;
    for (let s = this.maxSlots - 1; s >= 0; s -= 1) this.freeSlots.push(s);
  }

  public dispose(): void {
    this.releaseArena?.();
  }

  private writeSlotBytes(slotIndex: number, pixels: Uint8Array): Uint8Array | null {
    if (this.memoryRuntime) {
      const slotOffset = this.arenaBaseOffsetI64 + BigInt(slotIndex) * BigInt(this.tileBytes);
      const grown = this.memoryRuntime.growToFit(slotOffset + BigInt(this.tileBytes));
      if (grown.ok) {
        const view = this.memoryRuntime.createByteView(slotOffset, this.tileBytes);
        if (view.ok) {
          view.view.set(pixels);
          return null;
        }
      }
    }
    return new Uint8Array(pixels);
  }

  private readSlotBytes(slot: ResidentTileSlot): Uint8Array {
    if (slot.fallbackPixels) return new Uint8Array(slot.fallbackPixels);
    if (this.memoryRuntime) {
      const slotOffset = this.arenaBaseOffsetI64 + BigInt(slot.slotIndex) * BigInt(this.tileBytes);
      const view = this.memoryRuntime.createByteView(slotOffset, this.tileBytes);
      if (view.ok) return new Uint8Array(view.view);
    }
    return new Uint8Array(this.tileBytes);
  }

  private evictLruSlot(): number {
    let victimKey: string | null = null;
    let oldestTick = Number.POSITIVE_INFINITY;
    for (const [key, entry] of this.resident.entries()) {
      if (entry.lastTick < oldestTick) { oldestTick = entry.lastTick; victimKey = key; }
    }
    if (!victimKey) throw new Error("No resident tile available to evict");
    const entry = this.resident.get(victimKey)!;
    const raw = this.readSlotBytes(entry);
    this.resident.delete(victimKey);
    this.swapped.set(victimKey, {
      globalAddrI64: entry.globalAddrI64,
      checksum: entry.checksum,
      compressed: compressRleBytes(raw),
    });
    this.swapOuts += 1;
    return entry.slotIndex;
  }

  public writeTile(tileKey: string, pixels: Uint8Array): { readonly globalAddrI64: bigint; readonly checksum: number } {
    if (pixels.length !== this.tileBytes) {
      throw new RangeError(`Expected tile size ${this.tileBytes}, got ${pixels.length}`);
    }
    this.tick += 1;
    const checksum = this.checksumFn(pixels);
    const existing = this.resident.get(tileKey);
    if (existing) {
      const fb = this.writeSlotBytes(existing.slotIndex, pixels);
      this.resident.set(tileKey, { ...existing, checksum, lastTick: this.tick, fallbackPixels: fb });
      this.cacheHits += 1;
      return { globalAddrI64: existing.globalAddrI64, checksum };
    }

    let globalAddrI64: bigint;
    const prevSwapped = this.swapped.get(tileKey);
    if (prevSwapped) {
      this.swapped.delete(tileKey);
      globalAddrI64 = prevSwapped.globalAddrI64;
    } else {
      const alloc = this.addressManager.allocateLayerMemory(tileKey, this.tileBytes);
      globalAddrI64 = alloc.addressI64;
      if (alloc.endAddressExclusiveI64 > this.highWaterAddrI64) this.highWaterAddrI64 = alloc.endAddressExclusiveI64;
    }
    const slotIndex = this.freeSlots.length > 0 ? this.freeSlots.pop()! : this.evictLruSlot();
    const fallbackPixels = this.writeSlotBytes(slotIndex, pixels);
    this.resident.set(tileKey, { globalAddrI64, slotIndex, checksum, lastTick: this.tick, fallbackPixels });
    return { globalAddrI64, checksum };
  }

  public readTile(tileKey: string): { readonly pixels: Uint8Array; readonly checksumVerified: boolean; readonly swappedIn: boolean } | null {
    this.tick += 1;
    const existing = this.resident.get(tileKey);
    if (existing) {
      existing.lastTick = this.tick;
      this.cacheHits += 1;
      const pixels = this.readSlotBytes(existing);
      return { pixels, checksumVerified: this.checksumFn(pixels) === existing.checksum, swappedIn: false };
    }
    const record = this.swapped.get(tileKey);
    if (!record) { this.cacheMisses += 1; return null; }
    this.cacheMisses += 1;
    this.swapped.delete(tileKey);
    const restored = decompressRleBytes(record.compressed, this.tileBytes);
    const slotIndex = this.freeSlots.length > 0 ? this.freeSlots.pop()! : this.evictLruSlot();
    const fallbackPixels = this.writeSlotBytes(slotIndex, restored);
    this.resident.set(tileKey, {
      globalAddrI64: record.globalAddrI64, slotIndex, checksum: record.checksum, lastTick: this.tick, fallbackPixels,
    });
    this.swapIns += 1;
    return { pixels: restored, checksumVerified: this.checksumFn(restored) === record.checksum, swappedIn: true };
  }

  public getStats(): Wasm64TileSwapperStats {
    return {
      tileBytes: this.tileBytes,
      residentTiles: this.resident.size,
      swappedOutTiles: this.swapped.size,
      residentBytes: this.resident.size * this.tileBytes,
      maxResidentBytes: this.maxResidentBytes,
      swapOuts: this.swapOuts,
      swapIns: this.swapIns,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      totalVirtualAllocatedBytesI64: this.addressManager.getTotalAllocatedBytes(),
      highWaterVirtualAddrI64: this.highWaterAddrI64,
      crosses4GiBBoundary: this.highWaterAddrI64 > STUDIO_WASM32_ADDRESS_LIMIT_BYTES,
      backingLinearMemoryBytes: this.memoryRuntime ? this.memoryRuntime.currentByteLength : ZERO,
    };
  }
}

// ---------------------------------------------------------------------------
// 비동기 델타 히스토리 직렬화기 (Wasm64 XOR + RLE + FNV-1a 무결성 검증)
// ---------------------------------------------------------------------------

export interface DeltaHistoryEntrySummary {
  readonly index: number;
  readonly rawBytes: number;
  readonly encodedBytes: number;
  readonly changedBytes: number;
  readonly checksum: number;
  readonly compressionRatio: number;
  readonly elapsedMs: number;
}

interface InternalDeltaSnapshot {
  readonly rawLength: number;
  readonly compressedDelta: Uint8Array;
  readonly checksum: number;
  readonly changedBytes: number;
}

/** Wasm64 XOR 델타 및 FNV-1a 체크섬을 활용하는 비동기 히스토리 직렬화기. */
export class AsyncDeltaHistorySerializer {
  private readonly wasmModule: Wasm64DrawingModuleInstance;
  private readonly entries: InternalDeltaSnapshot[] = [];
  private lastRaw: Uint8Array | null = null;

  constructor(wasmModule: Wasm64DrawingModuleInstance) {
    this.wasmModule = wasmModule;
  }

  public get length(): number {
    return this.entries.length;
  }

  public async pushSnapshot(frame: Uint8Array): Promise<DeltaHistoryEntrySummary> {
    const started = nowMs();
    await Promise.resolve();
    const checksum = this.wasmModule.computeFnv1aChecksum(frame);
    let deltaBytes: Uint8Array;
    let changedBytes: number;
    if (!this.lastRaw || this.lastRaw.length !== frame.length) {
      deltaBytes = new Uint8Array(frame);
      changedBytes = frame.length;
    } else {
      const xorRes = this.wasmModule.xorDeltaBytes(this.lastRaw, frame);
      deltaBytes = xorRes.delta;
      changedBytes = xorRes.changedBytes;
    }
    const compressedDelta = compressRleBytes(deltaBytes);
    this.entries.push({ rawLength: frame.length, compressedDelta, checksum, changedBytes });
    this.lastRaw = new Uint8Array(frame);
    return {
      index: this.entries.length - 1,
      rawBytes: frame.length,
      encodedBytes: compressedDelta.byteLength,
      changedBytes,
      checksum,
      compressionRatio: compressedDelta.byteLength > 0 ? frame.length / compressedDelta.byteLength : 1,
      elapsedMs: Math.max(0, nowMs() - started),
    };
  }

  public async restoreSnapshot(index: number): Promise<{
    readonly frame: Uint8Array;
    readonly checksumVerified: boolean;
    readonly expectedChecksum: number;
    readonly actualChecksum: number;
    readonly elapsedMs: number;
  }> {
    const started = nowMs();
    if (index < 0 || index >= this.entries.length) {
      throw new RangeError(`History index out of bounds: ${index}`);
    }
    await Promise.resolve();
    let current = decompressRleBytes(this.entries[0]!.compressedDelta, this.entries[0]!.rawLength);
    for (let i = 1; i <= index; i += 1) {
      const entry = this.entries[i]!;
      const delta = decompressRleBytes(entry.compressedDelta, entry.rawLength);
      current = current.length !== entry.rawLength ? delta : this.wasmModule.xorDeltaBytes(current, delta).delta;
    }
    const expectedChecksum = this.entries[index]!.checksum;
    const actualChecksum = this.wasmModule.computeFnv1aChecksum(current);
    return {
      frame: current,
      checksumVerified: actualChecksum === expectedChecksum,
      expectedChecksum,
      actualChecksum,
      elapsedMs: Math.max(0, nowMs() - started),
    };
  }
}
