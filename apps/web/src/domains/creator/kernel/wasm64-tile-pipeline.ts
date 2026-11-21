/**
 * WebAssembly Memory64 (`i64`) 256×256 타일 파이프라인 · SIMD128(`v128`) 프로브 ·
 * `SharedArrayBuffer` 4~8워커 병렬 타일 작업 큐 · WebGPU WGSL 15종 고부하 필터 디스패치 플래너.
 *
 * 대형 세로 웹툰 원고(예: 1600×20000 px)의 더티 타일만 Wasm64 선형 메모리에 매핑해
 * Source-Over · Multiply · Screen · Overlay 합성을 수행한다.
 */

import type { CspReaFilterId, CspReaFilterParamMap } from "../filter/csp-rea/csp-rea-filter-descriptors";

import { clampByte, fnv1aChecksum32 } from "./wasm64-raster-fallback";
import {
  createWasm64RasterEngine, WASM64_WEB_MAX_PAGES,
  type Wasm64RasterBackend, type Wasm64RasterEngine, type Wasm64RasterEngineOptions,
} from "./wasm64-raster-kernel";
import {
  encodeSection, encodeUleb128_32, encodeUleb128_64, encodeUtf8Name, encodeVector,
  WASM_MAGIC_AND_VERSION, WASM_MEMORY64_LIMITS_FLAG,
  WASM_OP as OP, WASM_SEC as SEC, WASM_VAL as VAL, WasmBodyBuilder,
} from "./wasm64-raster-leb128";

export const WASM64_DEFAULT_TILE_SIZE_PX = 256;
export const WASM64_SHARED_QUEUE_MAGIC = 0x54533634; // "TS64"
export const WASM64_SHARED_QUEUE_PROTOCOL_VERSION = 1 as const;
export type Wasm64BlendMode = "source-over" | "multiply" | "screen" | "overlay";

/* 1) Screen · Overlay Wasm64 (i64) 동반 확장 모듈 + JS 비트 동치 폴백 */

interface Wasm64BlendExtensionExports {
  readonly compositeLayerScreen64: (dstPtr: bigint, srcPtr: bigint, pixelCount: bigint, opacity255: number) => void;
  readonly compositeLayerOverlay64: (dstPtr: bigint, srcPtr: bigint, pixelCount: bigint, opacity255: number) => void;
}

const emitDiv255 = (b: WasmBodyBuilder): WasmBodyBuilder =>
  b.i32Const(127).op(OP.I32_ADD).i32Const(255).op(OP.I32_DIV_U);

function buildSeparableBlend64Body(mode: "screen" | "overlay"): number[] {
  const L = {
    dstPtr: 0, srcPtr: 1, pixelCount: 2, opacity255: 3, dPtr: 4, sPtr: 5, dEnd: 6,
    op: 7, sa: 8, sr: 9, sg: 10, sb: 11, dr: 12, dg: 13, db: 14, da: 15,
    daScaled: 16, outA: 17, invDa: 18, cr: 19, cg: 20, cb: 21, blended: 22,
  };
  const b = new WasmBodyBuilder();
  b.localGet(L.pixelCount).op(OP.I64_EQZ).ifVoid().op(OP.RETURN).end();
  b.localGet(L.opacity255).i32Const(0).op(OP.I32_LE_S).ifVoid().op(OP.RETURN).end();
  b.localGet(L.opacity255).i32Const(255).op(OP.I32_GT_S).ifVoid()
    .i32Const(255).localSet(L.op).elseBranch().localGet(L.opacity255).localSet(L.op).end();
  b.localGet(L.dstPtr).localSet(L.dPtr).localGet(L.srcPtr).localSet(L.sPtr);
  b.localGet(L.dstPtr).localGet(L.pixelCount).i64Const(BigInt(2)).op(OP.I64_SHL).op(OP.I64_ADD).localSet(L.dEnd);

  b.block().loop();
  b.localGet(L.dPtr).localGet(L.dEnd).op(OP.I64_GE_U).brIf(1);
  emitDiv255(b.localGet(L.sPtr).load8U64(BigInt(3)).localGet(L.op).op(OP.I32_MUL)).localTee(L.sa);
  b.i32Const(0).op(OP.I32_GT_S).ifVoid();
  b.localGet(L.sPtr).load8U64(BigInt(0)).localSet(L.sr).localGet(L.sPtr).load8U64(BigInt(1)).localSet(L.sg)
    .localGet(L.sPtr).load8U64(BigInt(2)).localSet(L.sb).localGet(L.dPtr).load8U64(BigInt(3)).localSet(L.da);
  b.localGet(L.da).op(OP.I32_EQZ).ifVoid()
    .localGet(L.dPtr).localGet(L.sr).store8_64(BigInt(0)).localGet(L.dPtr).localGet(L.sg).store8_64(BigInt(1))
    .localGet(L.dPtr).localGet(L.sb).store8_64(BigInt(2)).localGet(L.dPtr).localGet(L.sa).store8_64(BigInt(3))
    .elseBranch();
  b.localGet(L.dPtr).load8U64(BigInt(0)).localSet(L.dr).localGet(L.dPtr).load8U64(BigInt(1)).localSet(L.dg)
    .localGet(L.dPtr).load8U64(BigInt(2)).localSet(L.db).i32Const(255).localGet(L.da).op(OP.I32_SUB).localSet(L.invDa);

  for (const [sCh, dCh, cCh] of [[L.sr, L.dr, L.cr], [L.sg, L.dg, L.cg], [L.sb, L.db, L.cb]] as const) {
    if (mode === "screen") {
      b.i32Const(255);
      emitDiv255(b.i32Const(255).localGet(dCh).op(OP.I32_SUB).i32Const(255).localGet(sCh).op(OP.I32_SUB).op(OP.I32_MUL))
        .op(OP.I32_SUB).localSet(L.blended);
    } else {
      b.localGet(dCh).i32Const(128).op(OP.I32_LT_S).ifVoid();
      emitDiv255(b.i32Const(2).localGet(dCh).op(OP.I32_MUL).localGet(sCh).op(OP.I32_MUL))
        .localSet(L.blended).elseBranch().i32Const(255);
      emitDiv255(
        b.i32Const(2).i32Const(255).localGet(dCh).op(OP.I32_SUB).op(OP.I32_MUL)
          .i32Const(255).localGet(sCh).op(OP.I32_SUB).op(OP.I32_MUL),
      ).op(OP.I32_SUB).localSet(L.blended).end();
    }
    emitDiv255(b.localGet(L.invDa).localGet(sCh).op(OP.I32_MUL).localGet(L.da).localGet(L.blended).op(OP.I32_MUL).op(OP.I32_ADD))
      .localSet(cCh);
  }
  emitDiv255(b.localGet(L.da).i32Const(255).localGet(L.sa).op(OP.I32_SUB).op(OP.I32_MUL))
    .localTee(L.daScaled).localGet(L.sa).op(OP.I32_ADD).localSet(L.outA);
  for (const [cCh, dCh, off] of [[L.cr, L.dr, BigInt(0)], [L.cg, L.dg, BigInt(1)], [L.cb, L.db, BigInt(2)]] as const) {
    b.localGet(L.dPtr).localGet(cCh).localGet(L.sa).op(OP.I32_MUL)
      .localGet(dCh).localGet(L.daScaled).op(OP.I32_MUL).op(OP.I32_ADD)
      .localGet(L.outA).i32Const(1).op(OP.I32_SHR_U).op(OP.I32_ADD)
      .localGet(L.outA).op(OP.I32_DIV_U).store8_64(off);
  }
  b.localGet(L.dPtr).localGet(L.outA).store8_64(BigInt(3)).end().end();
  b.localGet(L.dPtr).i64Const(BigInt(4)).op(OP.I64_ADD).localSet(L.dPtr)
    .localGet(L.sPtr).i64Const(BigInt(4)).op(OP.I64_ADD).localSet(L.sPtr).br(0).end().end();
  return b.build([[3, VAL.I64], [16, VAL.I32]]);
}

let cachedBlendExtBytes: Uint8Array | null = null;

/** Screen · Overlay Wasm64 (`i64`) 확장 바이너리 모듈을 생성한다. */
export function buildWasm64BlendExtensionModuleBytes(): Uint8Array {
  if (cachedBlendExtBytes) return cachedBlendExtBytes;
  cachedBlendExtBytes = new Uint8Array([
    ...WASM_MAGIC_AND_VERSION,
    ...encodeSection(SEC.TYPE, encodeVector([[0x60, 4, VAL.I64, VAL.I64, VAL.I64, VAL.I32, 0]])),
    ...encodeSection(SEC.IMPORT, encodeVector([[
      ...encodeUtf8Name("env"), ...encodeUtf8Name("memory"), 0x02, WASM_MEMORY64_LIMITS_FLAG,
      ...encodeUleb128_64(BigInt(1)), ...encodeUleb128_64(WASM64_WEB_MAX_PAGES),
    ]])),
    ...encodeSection(SEC.FUNCTION, encodeVector([[0x00], [0x00]])),
    ...encodeSection(SEC.EXPORT, encodeVector([
      [...encodeUtf8Name("compositeLayerScreen64"), 0x00, ...encodeUleb128_32(0)],
      [...encodeUtf8Name("compositeLayerOverlay64"), 0x00, ...encodeUleb128_32(1)],
    ])),
    ...encodeSection(SEC.CODE, encodeVector([buildSeparableBlend64Body("screen"), buildSeparableBlend64Body("overlay")])),
  ]);
  return cachedBlendExtBytes;
}

function jsCompositeSeparable(dst: Uint8Array, src: Uint8Array, pixelCount: number, opacity255: number, mode: "screen" | "overlay"): void {
  const op = clampByte(opacity255);
  if (pixelCount <= 0 || op <= 0) return;
  const blend = (d: number, s: number): number =>
    mode === "screen"
      ? 255 - ((((255 - d) * (255 - s) + 127) / 255) | 0)
      : d < 128 ? ((2 * d * s + 127) / 255) | 0 : 255 - ((((2 * (255 - d) * (255 - s) + 127) / 255) | 0));
  for (let i = 0, end = pixelCount * 4; i < end; i += 4) {
    const sa = (((src[i + 3] ?? 0) * op + 127) / 255) | 0;
    if (sa <= 0) continue;
    const sr = src[i] ?? 0, sg = src[i + 1] ?? 0, sb = src[i + 2] ?? 0, da = dst[i + 3] ?? 0;
    if (da === 0) { dst[i] = sr; dst[i + 1] = sg; dst[i + 2] = sb; dst[i + 3] = sa; continue; }
    const dr = dst[i] ?? 0, dg = dst[i + 1] ?? 0, db = dst[i + 2] ?? 0, invDa = 255 - da;
    const cr = ((invDa * sr + da * blend(dr, sr) + 127) / 255) | 0;
    const cg = ((invDa * sg + da * blend(dg, sg) + 127) / 255) | 0;
    const cb = ((invDa * sb + da * blend(db, sb) + 127) / 255) | 0;
    const daScaled = ((da * (255 - sa) + 127) / 255) | 0;
    const outA = sa + daScaled, half = outA >>> 1;
    dst[i] = ((cr * sa + dr * daScaled + half) / outA) | 0;
    dst[i + 1] = ((cg * sa + dg * daScaled + half) / outA) | 0;
    dst[i + 2] = ((cb * sa + db * daScaled + half) / outA) | 0;
    dst[i + 3] = outA;
  }
}

function attachBlendExtension(engine: Wasm64RasterEngine, wa: typeof WebAssembly | null): Wasm64BlendExtensionExports | null {
  if (engine.backend !== "wasm64-native" || !engine.memory || !wa) return null;
  try {
    const bytes = buildWasm64BlendExtensionModuleBytes();
    if (!wa.validate(bytes as BufferSource)) return null;
    const exp = new wa.Instance(new wa.Module(bytes as BufferSource), { env: { memory: engine.memory } }).exports;
    if (typeof exp.compositeLayerScreen64 === "function" && typeof exp.compositeLayerOverlay64 === "function") {
      return exp as unknown as Wasm64BlendExtensionExports;
    }
    return null;
  } catch { return null; }
}

/* 2) 실제 V8/Chrome SIMD128 (`v128`) + Memory64 (`i64`) 피처 디텍션 */

export interface Wasm64Simd128ProbeReport {
  readonly simd128Validated: boolean;
  readonly simd128Executed: boolean;
  readonly memory64WithSimd128Validated: boolean;
  readonly memory64WithSimd128Executed: boolean;
  readonly vectorWidthBits: 128;
  readonly rgbaPixelsPerVector: 4;
}

/** 실제 Node 24 V8 / Chrome 런타임에서 `v128` SIMD128 및 `Memory64+SIMD128` 실행을 실측한다. */
export function probeWasm64Simd128Support(webAssemblyOverride?: typeof WebAssembly | null): Wasm64Simd128ProbeReport {
  const wa = webAssemblyOverride === null ? null : webAssemblyOverride ?? (typeof WebAssembly === "object" ? WebAssembly : null);
  let simd128Validated = false, simd128Executed = false;
  let memory64WithSimd128Validated = false, memory64WithSimd128Executed = false;
  if (wa) {
    try {
      const code = [0xfd, 0x0c, ...Array<number>(16).fill(100), 0xfd, 0x0c, ...Array<number>(16).fill(200), 0xfd, 0x70, 0xfd, 0x16, 0x00, OP.END];
      const bytes = new Uint8Array([
        ...WASM_MAGIC_AND_VERSION,
        ...encodeSection(SEC.TYPE, encodeVector([[0x60, 0, 1, VAL.I32]])),
        ...encodeSection(SEC.FUNCTION, encodeVector([[0x00]])),
        ...encodeSection(SEC.EXPORT, encodeVector([[...encodeUtf8Name("probe"), 0x00, 0x00]])),
        ...encodeSection(SEC.CODE, encodeVector([[...encodeUleb128_32(1 + code.length), 0x00, ...code]])),
      ]);
      simd128Validated = wa.validate(bytes as BufferSource);
      if (simd128Validated) {
        const fn = new wa.Instance(new wa.Module(bytes as BufferSource)).exports.probe as (() => number) | undefined;
        simd128Executed = typeof fn === "function" && fn() === 255;
      }
    } catch { simd128Executed = false; }

    try {
      const mask = [255, 255, 255, 0, 255, 255, 255, 0, 255, 255, 255, 0, 255, 255, 255, 0];
      const code = [OP.LOCAL_GET, 0x00, OP.LOCAL_GET, 0x00, 0xfd, 0x00, 0x00, 0x00, 0xfd, 0x0c, ...mask, 0xfd, 0x51, 0xfd, 0x0b, 0x00, 0x00, OP.END];
      const bytes = new Uint8Array([
        ...WASM_MAGIC_AND_VERSION,
        ...encodeSection(SEC.TYPE, encodeVector([[0x60, 1, VAL.I64, 0]])),
        ...encodeSection(SEC.FUNCTION, encodeVector([[0x00]])),
        ...encodeSection(0x05, encodeVector([[WASM_MEMORY64_LIMITS_FLAG, 0x01, 0x02]])),
        ...encodeSection(SEC.EXPORT, encodeVector([[...encodeUtf8Name("memory"), 0x02, 0x00], [...encodeUtf8Name("invert4px"), 0x00, 0x00]])),
        ...encodeSection(SEC.CODE, encodeVector([[...encodeUleb128_32(1 + code.length), 0x00, ...code]])),
      ]);
      memory64WithSimd128Validated = wa.validate(bytes as BufferSource);
      if (memory64WithSimd128Validated) {
        const exp = new wa.Instance(new wa.Module(bytes as BufferSource)).exports;
        const mem = exp.memory as WebAssembly.Memory | undefined;
        const fn = exp.invert4px as ((ptr: bigint) => void) | undefined;
        if (mem && typeof fn === "function") {
          const view = new Uint8Array(mem.buffer, 0, 16);
          view.set([10, 20, 30, 200, 0, 255, 128, 77, 1, 2, 3, 4, 250, 251, 252, 255]);
          fn(BigInt(0));
          memory64WithSimd128Executed =
            view[0] === 245 && view[1] === 235 && view[2] === 225 && view[3] === 200
            && view[4] === 255 && view[5] === 0 && view[6] === 127 && view[7] === 77;
        }
      }
    } catch { memory64WithSimd128Executed = false; }
  }
  return Object.freeze({
    simd128Validated, simd128Executed, memory64WithSimd128Validated, memory64WithSimd128Executed,
    vectorWidthBits: 128, rgbaPixelsPerVector: 4,
  });
}

/* 3) Wasm64 256×256 더티 타일 합성기 (`Wasm64TiledCompositor`, T-015) */

export interface Wasm64TileCoord {
  readonly tx: number; readonly ty: number; readonly pixelX: number; readonly pixelY: number;
  readonly pixelWidth: number; readonly pixelHeight: number;
}
export interface Wasm64TiledLayerSpec {
  readonly id: string; readonly blendMode: Wasm64BlendMode; readonly opacity01: number; readonly visible?: boolean;
}
export interface Wasm64TiledBrushDab {
  readonly cx: number; readonly cy: number; readonly radius: number;
  readonly r: number; readonly g: number; readonly b: number; readonly alpha255: number; readonly hardness255: number;
}
export interface Wasm64TiledBrushStampResult {
  readonly touchedTileCount: number; readonly touchedPixels: number; readonly dirtyTiles: readonly Wasm64TileCoord[];
}
export interface Wasm64TiledCompositeReport {
  readonly backend: Wasm64RasterBackend; readonly addressMode: "i64" | "js-heap";
  readonly canvasWidth: number; readonly canvasHeight: number; readonly tileSizePx: number;
  readonly cols: number; readonly rows: number; readonly totalCanvasTiles: number;
  readonly dirtyTilesProcessed: number; readonly skippedCleanTiles: number; readonly residentTileCount: number;
  readonly layersComposited: number; readonly pixelsProcessed: number;
  readonly elapsedMs: number; readonly throughputMegaPixelsPerSec: number;
  readonly committedBytes: bigint; readonly reservedAddressSpaceBytes: bigint; readonly exceeds4GiBAddressSpace: boolean;
  readonly outputChecksum32: number; readonly blendModesUsed: readonly Wasm64BlendMode[]; readonly simd128: Wasm64Simd128ProbeReport;
}
export interface Wasm64TiledCompositorOptions extends Wasm64RasterEngineOptions {
  readonly width: number; readonly height: number; readonly tileSizePx?: 128 | 256 | 512;
}

const nowMs = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

/** 대형 세로 웹툰 원고를 256×256 더티 타일 단위로만 Wasm64 선형 메모리에 매핑·합성한다. */
export class Wasm64TiledCompositor {
  readonly width: number; readonly height: number; readonly tileSizePx: 128 | 256 | 512;
  readonly cols: number; readonly rows: number; readonly totalTiles: number;
  readonly simd128: Wasm64Simd128ProbeReport;

  private readonly engine: Wasm64RasterEngine;
  private readonly blendExt: Wasm64BlendExtensionExports | null;
  private readonly layerTiles = new Map<string, Map<number, Uint8Array>>();
  private readonly compositeTiles = new Map<number, Uint8Array>();
  private readonly dirtyKeys = new Set<number>();
  private readonly maxTileBytes: number;

  constructor(options: Wasm64TiledCompositorOptions) {
    this.width = Math.max(1, Math.trunc(options.width));
    this.height = Math.max(1, Math.trunc(options.height));
    this.tileSizePx = options.tileSizePx ?? WASM64_DEFAULT_TILE_SIZE_PX;
    this.cols = Math.ceil(this.width / this.tileSizePx);
    this.rows = Math.ceil(this.height / this.tileSizePx);
    this.totalTiles = this.cols * this.rows;
    this.maxTileBytes = this.tileSizePx * this.tileSizePx * 4;
    this.engine = createWasm64RasterEngine({
      initialPages: options.initialPages ?? BigInt(32), maximumPages: options.maximumPages,
      minimumPages: options.minimumPages, allowFallback: options.allowFallback ?? true, webAssembly: options.webAssembly,
    });
    const wa = options.webAssembly === null ? null : options.webAssembly ?? (typeof WebAssembly === "object" ? WebAssembly : null);
    this.blendExt = attachBlendExtension(this.engine, wa);
    this.simd128 = probeWasm64Simd128Support(options.webAssembly);
    this.engine.ensureCapacity(BigInt(this.maxTileBytes * 2 + 1024));
  }

  get backend(): Wasm64RasterBackend { return this.engine.backend; }
  get addressMode(): "i64" | "js-heap" { return this.engine.addressType; }
  get dirtyTileCount(): number { return this.dirtyKeys.size; }
  get disposed(): boolean { return this.engine.disposed; }
  get residentTileCount(): number {
    let count = this.compositeTiles.size;
    for (const map of this.layerTiles.values()) count += map.size;
    return count;
  }

  tileKey(tx: number, ty: number): number { return ty * this.cols + tx; }
  clearDirtyTiles(): void { this.dirtyKeys.clear(); }

  describeTile(tx: number, ty: number): Wasm64TileCoord {
    const pixelX = tx * this.tileSizePx, pixelY = ty * this.tileSizePx;
    return Object.freeze({
      tx, ty, pixelX, pixelY,
      pixelWidth: Math.max(0, Math.min(this.tileSizePx, this.width - pixelX)),
      pixelHeight: Math.max(0, Math.min(this.tileSizePx, this.height - pixelY)),
    });
  }

  markDirtyTile(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return false;
    const key = this.tileKey(tx, ty);
    const had = this.dirtyKeys.has(key);
    this.dirtyKeys.add(key);
    return !had;
  }

  markDirtyRect(x: number, y: number, width: number, height: number): number {
    if (width <= 0 || height <= 0) return 0;
    const minTx = Math.max(0, Math.floor(x / this.tileSizePx));
    const maxTx = Math.min(this.cols - 1, Math.floor((x + width - 1) / this.tileSizePx));
    const minTy = Math.max(0, Math.floor(y / this.tileSizePx));
    const maxTy = Math.min(this.rows - 1, Math.floor((y + height - 1) / this.tileSizePx));
    let affected = 0;
    for (let ty = minTy; ty <= maxTy; ty += 1) {
      for (let tx = minTx; tx <= maxTx; tx += 1) { this.dirtyKeys.add(this.tileKey(tx, ty)); affected += 1; }
    }
    return affected;
  }

  getDirtyTileCoords(): readonly Wasm64TileCoord[] {
    return Object.freeze(
      Array.from(this.dirtyKeys).sort((a, b) => a - b).map((key) => {
        const ty = Math.floor(key / this.cols);
        return this.describeTile(key - ty * this.cols, ty);
      }),
    );
  }

  private ensureLayerMap(layerId: string): Map<number, Uint8Array> {
    let map = this.layerTiles.get(layerId);
    if (!map) { map = new Map<number, Uint8Array>(); this.layerTiles.set(layerId, map); }
    return map;
  }

  writeLayerTile(layerId: string, tx: number, ty: number, rgba: Uint8Array | Uint8ClampedArray): void {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return;
    const coord = this.describeTile(tx, ty);
    const expected = coord.pixelWidth * coord.pixelHeight * 4;
    const tileBuf = new Uint8Array(expected);
    tileBuf.set(new Uint8Array(rgba.buffer, rgba.byteOffset, Math.min(expected, rgba.byteLength)));
    const key = this.tileKey(tx, ty);
    this.ensureLayerMap(layerId).set(key, tileBuf);
    this.dirtyKeys.add(key);
  }

  readCompositeTile(tx: number, ty: number): Uint8ClampedArray | null {
    if (tx < 0 || ty < 0 || tx >= this.cols || ty >= this.rows) return null;
    const buf = this.compositeTiles.get(this.tileKey(tx, ty));
    return buf ? new Uint8ClampedArray(buf) : null;
  }

  /** 브러시 댑이 걸치는 타일만 Wasm64 아레나로 올려 스탬핑하고 더티 표시한다. */
  stampBrushDab(layerId: string, dab: Wasm64TiledBrushDab): Wasm64TiledBrushStampResult {
    if (dab.radius <= 0 || dab.alpha255 <= 0) {
      return Object.freeze({ touchedTileCount: 0, touchedPixels: 0, dirtyTiles: Object.freeze([]) });
    }
    const minTx = Math.max(0, Math.floor((dab.cx - dab.radius) / this.tileSizePx));
    const maxTx = Math.min(this.cols - 1, Math.floor((dab.cx + dab.radius) / this.tileSizePx));
    const minTy = Math.max(0, Math.floor((dab.cy - dab.radius) / this.tileSizePx));
    const maxTy = Math.min(this.rows - 1, Math.floor((dab.cy + dab.radius) / this.tileSizePx));
    const layerMap = this.ensureLayerMap(layerId);
    const dirtyTiles: Wasm64TileCoord[] = [];
    let touchedPixels = 0;

    for (let ty = minTy; ty <= maxTy; ty += 1) {
      for (let tx = minTx; tx <= maxTx; tx += 1) {
        const coord = this.describeTile(tx, ty);
        const bytes = coord.pixelWidth * coord.pixelHeight * 4;
        const key = this.tileKey(tx, ty);
        const existing = layerMap.get(key);
        const view = this.engine.getScratchView(BigInt(0), bytes);
        if (existing) view.set(existing); else view.fill(0);
        const localTouched = this.engine.stampSoftBrushDab64(
          BigInt(0), BigInt(coord.pixelWidth), BigInt(coord.pixelHeight),
          dab.cx - coord.pixelX, dab.cy - coord.pixelY, dab.radius,
          clampByte(dab.r), clampByte(dab.g), clampByte(dab.b), clampByte(dab.alpha255), clampByte(dab.hardness255),
        );
        if (localTouched > 0) {
          const updated = existing ?? new Uint8Array(bytes);
          updated.set(view);
          layerMap.set(key, updated);
          this.dirtyKeys.add(key);
          dirtyTiles.push(coord);
          touchedPixels += localTouched;
        }
      }
    }
    return Object.freeze({ touchedTileCount: dirtyTiles.length, touchedPixels, dirtyTiles: Object.freeze(dirtyTiles) });
  }

  /** 등록된 더티 타일만 선택적으로 Wasm64 `i64` 선형 메모리에 매핑해 4종 블렌드 모드로 합성한다. */
  compositeDirtyTiles(
    layers: readonly Wasm64TiledLayerSpec[],
    options?: { readonly clearDirty?: boolean; readonly tonalLut256x3?: Uint8Array },
  ): Wasm64TiledCompositeReport {
    const visibleLayers = layers.filter((layer) => layer.visible !== false && layer.opacity01 > 0);
    const dirtyCoords = this.getDirtyTileCoords();
    const dstPtr = BigInt(0), srcPtr = BigInt(this.maxTileBytes), lutPtr = BigInt(this.maxTileBytes * 2);
    const hasLut = options?.tonalLut256x3 !== undefined && options.tonalLut256x3.byteLength >= 768;
    if (hasLut && options.tonalLut256x3) this.engine.getScratchView(lutPtr, 768).set(options.tonalLut256x3.subarray(0, 768));

    const blendModesUsed = new Set<Wasm64BlendMode>();
    let pixelsProcessed = 0;
    let combinedChecksum = 0x811c9dc5;
    const t0 = nowMs();

    for (const coord of dirtyCoords) {
      const pixelCount = coord.pixelWidth * coord.pixelHeight;
      const byteLength = pixelCount * 4;
      const key = this.tileKey(coord.tx, coord.ty);
      const dstView = this.engine.getScratchView(dstPtr, byteLength);
      dstView.fill(0);
      const pCountBig = BigInt(pixelCount);

      for (const layer of visibleLayers) {
        const tileData = this.layerTiles.get(layer.id)?.get(key);
        if (!tileData) continue;
        const opacity255 = clampByte(Math.round(layer.opacity01 * 255));
        if (opacity255 <= 0) continue;
        const srcView = this.engine.getScratchView(srcPtr, byteLength);
        srcView.set(tileData);
        blendModesUsed.add(layer.blendMode);

        if (layer.blendMode === "source-over") this.engine.compositeLayerSourceOver64(dstPtr, srcPtr, pCountBig, opacity255);
        else if (layer.blendMode === "multiply") this.engine.compositeLayerMultiply64(dstPtr, srcPtr, pCountBig, opacity255);
        else if (layer.blendMode === "screen") {
          if (this.blendExt) this.blendExt.compositeLayerScreen64(dstPtr, srcPtr, pCountBig, opacity255);
          else jsCompositeSeparable(dstView, srcView, pixelCount, opacity255, "screen");
        } else {
          if (this.blendExt) this.blendExt.compositeLayerOverlay64(dstPtr, srcPtr, pCountBig, opacity255);
          else jsCompositeSeparable(dstView, srcView, pixelCount, opacity255, "overlay");
        }
        pixelsProcessed += pixelCount;
      }

      if (hasLut) { this.engine.applyTonalLut64(dstPtr, pCountBig, lutPtr); pixelsProcessed += pixelCount; }
      const outTile = this.compositeTiles.get(key) ?? new Uint8Array(byteLength);
      outTile.set(dstView);
      this.compositeTiles.set(key, outTile);
      combinedChecksum = Math.imul(combinedChecksum ^ fnv1aChecksum32(outTile), 0x01000193) >>> 0;
    }

    const elapsedMs = Math.max(0.001, nowMs() - t0);
    if (options?.clearDirty ?? true) this.dirtyKeys.clear();
    return Object.freeze({
      backend: this.engine.backend, addressMode: this.engine.addressType,
      canvasWidth: this.width, canvasHeight: this.height, tileSizePx: this.tileSizePx,
      cols: this.cols, rows: this.rows, totalCanvasTiles: this.totalTiles,
      dirtyTilesProcessed: dirtyCoords.length, skippedCleanTiles: this.totalTiles - dirtyCoords.length,
      residentTileCount: this.residentTileCount, layersComposited: visibleLayers.length, pixelsProcessed,
      elapsedMs: Number(elapsedMs.toFixed(3)),
      throughputMegaPixelsPerSec: Number((pixelsProcessed / (elapsedMs / 1000) / 1_000_000).toFixed(2)),
      committedBytes: this.engine.committedBytes, reservedAddressSpaceBytes: this.engine.reservedAddressSpaceBytes,
      exceeds4GiBAddressSpace: this.engine.exceeds4GiBAddressSpace,
      outputChecksum32: combinedChecksum >>> 0, blendModesUsed: Object.freeze(Array.from(blendModesUsed)), simd128: this.simd128,
    });
  }

  dispose(): void { this.layerTiles.clear(); this.compositeTiles.clear(); this.dirtyKeys.clear(); this.engine.dispose(); }
}

export const createWasm64TiledCompositor = (options: Wasm64TiledCompositorOptions): Wasm64TiledCompositor =>
  new Wasm64TiledCompositor(options);

/* 4) SharedArrayBuffer + Atomics 4~8워커 타일 작업 큐 프로토콜 (T-016) */

const HDR = { MAGIC: 0, VERSION: 1, TOTAL: 2, NEXT: 3, DONE: 4, ERR: 5, WORKERS: 6, STATE: 7 } as const;
const QUEUE_HDR_INTS = 8;
const QUEUE_SLOT_INTS = 4;

export interface Wasm64SharedTileJob {
  readonly jobIndex: number; readonly tx: number; readonly ty: number; readonly pixelWidth: number; readonly pixelHeight: number;
}
export interface Wasm64SharedTileQueueSnapshot {
  readonly protocolVersion: typeof WASM64_SHARED_QUEUE_PROTOCOL_VERSION; readonly isSharedMemory: boolean;
  readonly workerCount: number; readonly totalJobs: number; readonly claimedJobs: number;
  readonly completedJobs: number; readonly errorCount: number; readonly done: boolean;
}
export interface Wasm64SharedTileWorkQueue {
  readonly protocolVersion: typeof WASM64_SHARED_QUEUE_PROTOCOL_VERSION; readonly isSharedMemory: boolean;
  readonly totalJobs: number; readonly workerCount: number; readonly buffer: SharedArrayBuffer | ArrayBuffer;
  claimNextJob(): Wasm64SharedTileJob | null;
  completeJob(ok?: boolean): number;
  getSnapshot(): Wasm64SharedTileQueueSnapshot;
}
export interface Wasm64WorkerTileBatch {
  readonly workerIndex: number; readonly tiles: readonly Wasm64TileCoord[]; readonly pixelCount: number; readonly byteLength: number;
}
export interface Wasm64ParallelTilePlan {
  readonly transport: "shared-array-buffer" | "transferable-fallback";
  readonly workerPoolSize: number; readonly activeWorkerCount: number;
  readonly totalDirtyTiles: number; readonly totalPixels: number; readonly loadImbalanceRatio: number;
  readonly batches: readonly Wasm64WorkerTileBatch[]; readonly queue: Wasm64SharedTileWorkQueue;
}
export interface PlanParallelTileBatchesOptions {
  readonly workerCount?: number; readonly minWorkers?: number; readonly maxWorkers?: number;
  readonly useSharedArrayBuffer?: boolean; readonly crossOriginIsolated?: boolean;
}

/** Lock-free `SharedArrayBuffer` + `Atomics` 타일 작업 큐를 생성한다(미지원 시 `ArrayBuffer` 안전 폴백). */
export function createSharedTileWorkQueue(
  tiles: readonly Wasm64TileCoord[],
  workerCount: number,
  options?: Pick<PlanParallelTileBatchesOptions, "useSharedArrayBuffer" | "crossOriginIsolated">,
): Wasm64SharedTileWorkQueue {
  const safeWorkers = Math.max(1, Math.min(16, Math.trunc(workerCount)));
  const totalJobs = tiles.length;
  const bytes = (QUEUE_HDR_INTS + totalJobs * QUEUE_SLOT_INTS) * Int32Array.BYTES_PER_ELEMENT;
  const isSharedMemory =
    options?.useSharedArrayBuffer !== false && options?.crossOriginIsolated !== false
    && typeof SharedArrayBuffer === "function" && typeof Atomics === "object";
  const buffer: SharedArrayBuffer | ArrayBuffer = isSharedMemory ? new SharedArrayBuffer(bytes) : new ArrayBuffer(bytes);
  const view = new Int32Array(buffer);
  view[HDR.MAGIC] = WASM64_SHARED_QUEUE_MAGIC;
  view[HDR.VERSION] = WASM64_SHARED_QUEUE_PROTOCOL_VERSION;
  view[HDR.TOTAL] = totalJobs;
  view[HDR.WORKERS] = safeWorkers;
  view[HDR.STATE] = totalJobs === 0 ? 1 : 0;
  for (let i = 0; i < totalJobs; i += 1) {
    const t = tiles[i];
    if (!t) continue;
    const base = QUEUE_HDR_INTS + i * QUEUE_SLOT_INTS;
    view[base] = t.tx; view[base + 1] = t.ty; view[base + 2] = t.pixelWidth; view[base + 3] = t.pixelHeight;
  }

  const loadH = (i: number) => (isSharedMemory ? Atomics.load(view, i) : (view[i] ?? 0));
  const addH = (i: number, d: number) => {
    if (isSharedMemory) return Atomics.add(view, i, d);
    const prev = view[i] ?? 0; view[i] = prev + d; return prev;
  };
  return {
    protocolVersion: WASM64_SHARED_QUEUE_PROTOCOL_VERSION, isSharedMemory, totalJobs, workerCount: safeWorkers, buffer,
    claimNextJob(): Wasm64SharedTileJob | null {
      const jobIndex = addH(HDR.NEXT, 1);
      if (jobIndex >= totalJobs) return null;
      const base = QUEUE_HDR_INTS + jobIndex * QUEUE_SLOT_INTS;
      return Object.freeze({
        jobIndex, tx: view[base] ?? 0, ty: view[base + 1] ?? 0,
        pixelWidth: view[base + 2] ?? 0, pixelHeight: view[base + 3] ?? 0,
      });
    },
    completeJob(ok = true): number {
      if (!ok) addH(HDR.ERR, 1);
      const completed = addH(HDR.DONE, 1) + 1;
      if (completed >= totalJobs) { if (isSharedMemory) Atomics.store(view, HDR.STATE, 1); else view[HDR.STATE] = 1; }
      return completed;
    },
    getSnapshot(): Wasm64SharedTileQueueSnapshot {
      const completedJobs = Math.min(totalJobs, loadH(HDR.DONE));
      return Object.freeze({
        protocolVersion: WASM64_SHARED_QUEUE_PROTOCOL_VERSION, isSharedMemory, workerCount: safeWorkers, totalJobs,
        claimedJobs: Math.min(totalJobs, loadH(HDR.NEXT)), completedJobs, errorCount: loadH(HDR.ERR), done: completedJobs >= totalJobs,
      });
    },
  };
}

/** 더티 타일을 4~8워커로 픽셀 부하 균등 분할(LPT)하고 `SharedArrayBuffer` 큐를 생성한다. */
export function planParallelTileBatches(
  dirtyTiles: readonly Wasm64TileCoord[],
  options: PlanParallelTileBatchesOptions = {},
): Wasm64ParallelTilePlan {
  const minW = Math.max(1, Math.min(8, Math.trunc(options.minWorkers ?? 4)));
  const maxW = Math.max(minW, Math.min(16, Math.trunc(options.maxWorkers ?? 8)));
  const poolSize = options.workerCount !== undefined
    ? Math.max(minW, Math.min(maxW, Math.trunc(options.workerCount)))
    : Math.max(minW, Math.min(maxW, dirtyTiles.length <= minW ? minW : maxW));

  const buckets = Array.from({ length: poolSize }, () => ({ tiles: [] as Wasm64TileCoord[], pixelCount: 0 }));
  const ordered = [...dirtyTiles].sort(
    (a, b) => (b.pixelWidth * b.pixelHeight) - (a.pixelWidth * a.pixelHeight) || a.ty - b.ty || a.tx - b.tx,
  );
  let totalPixels = 0;
  for (const tile of ordered) {
    const px = tile.pixelWidth * tile.pixelHeight;
    totalPixels += px;
    let best = 0;
    for (let w = 1; w < buckets.length; w += 1) {
      if ((buckets[w]?.pixelCount ?? 0) < (buckets[best]?.pixelCount ?? 0)) best = w;
    }
    const bucket = buckets[best];
    if (bucket) { bucket.tiles.push(tile); bucket.pixelCount += px; }
  }
  const loads = buckets.filter((b) => b.tiles.length > 0).map((b) => b.pixelCount);
  const maxLoad = loads.length > 0 ? Math.max(...loads) : 0;
  const minLoad = loads.length > 0 ? Math.min(...loads) : 0;
  const queue = createSharedTileWorkQueue(ordered, poolSize, options);

  return Object.freeze({
    transport: queue.isSharedMemory ? "shared-array-buffer" : "transferable-fallback",
    workerPoolSize: poolSize, activeWorkerCount: loads.length, totalDirtyTiles: dirtyTiles.length, totalPixels,
    loadImbalanceRatio: maxLoad > 0 ? Number(((maxLoad - minLoad) / maxLoad).toFixed(4)) : 0,
    batches: Object.freeze(buckets.map((b, workerIndex) => Object.freeze({
      workerIndex, tiles: Object.freeze(b.tiles), pixelCount: b.pixelCount, byteLength: b.pixelCount * 4,
    }))),
    queue,
  });
}

/* 5) WebGPU WGSL Compute Shader 15종 고부하 필터 디스패치 플래너 (T-017) */

export const WEBGPU_HEAVY_FILTER_IDS = Object.freeze([
  "gauss-blur", "motion-blur", "radial-blur", "rotation-blur", "unsharp-mask",
  "fisheye", "lens-distortion", "pinch", "sphere", "spiral",
  "flow-based-abstraction", "pencil-art", "chromatic-aberration", "normal-map", "reduce-noise",
] as const satisfies readonly CspReaFilterId[]);

export type WebGpuHeavyFilterId = (typeof WEBGPU_HEAVY_FILTER_IDS)[number];

export interface WebGpuFilterComputePass {
  readonly passIndex: number; readonly passId: string; readonly entryPoint: string;
  readonly workgroupSize: readonly [number, number, number]; readonly dispatchWorkgroups: readonly [number, number, number];
  readonly uniformBufferBytes: number; readonly storageBufferBytes: number; readonly useShaderF16: boolean; readonly wgslSource: string;
}
export interface WebGpuFilterComputePlan {
  readonly filterId: CspReaFilterId; readonly supportedOnWebGpu: boolean;
  readonly width: number; readonly height: number; readonly pixelCount: number; readonly storageBufferBytes: number;
  readonly requiresTileStreaming: boolean; readonly recommendedTileSizePx: 256 | 512 | 1024;
  readonly useShaderF16: boolean; readonly uniforms: readonly [number, number, number, number];
  readonly passes: readonly WebGpuFilterComputePass[];
}
export interface WebGpuFilterComputeValidation { readonly valid: boolean; readonly errors: readonly string[]; }

interface HeavyKernelSpec {
  readonly wg: readonly [number, number];
  readonly passes: readonly { readonly id: string; readonly entry: string; readonly body: string }[];
  readonly uniforms: (p?: CspReaFilterParamMap) => readonly [number, number, number, number];
}

const pNum = (p: CspReaFilterParamMap | undefined, k: string, fb: number): number =>
  typeof p?.[k] === "number" && Number.isFinite(p[k]) ? (p[k] as number) : fb;

const WGSL_PRELUDE = [
  "struct FilterUniforms { width: u32, height: u32, param0: f32, param1: f32, param2: f32, param3: f32, passIndex: u32, _pad: u32 };",
  "@group(0) @binding(0) var<uniform> u: FilterUniforms;",
  "@group(0) @binding(1) var<storage, read> srcPixels: array<u32>;",
  "@group(0) @binding(2) var<storage, read_write> dstPixels: array<u32>;",
  "fn unpackRgba(p: u32) -> vec4<f32> { return vec4<f32>(f32(p & 255u), f32((p >> 8u) & 255u), f32((p >> 16u) & 255u), f32((p >> 24u) & 255u)) / 255.0; }",
  "fn packRgba(c: vec4<f32>) -> u32 { let q = vec4<u32>(clamp(round(c * 255.0), vec4<f32>(0.0), vec4<f32>(255.0))); return q.x | (q.y << 8u) | (q.z << 16u) | (q.w << 24u); }",
  "fn sampleClamp(ix: i32, iy: i32) -> vec4<f32> { return unpackRgba(srcPixels[u32(clamp(iy, 0, i32(u.height) - 1)) * u.width + u32(clamp(ix, 0, i32(u.width) - 1))]); }",
  "fn sampleBilinear(fx: f32, fy: f32) -> vec4<f32> { let x0 = i32(floor(fx)); let y0 = i32(floor(fy)); let tx = fx - f32(x0); let ty = fy - f32(y0); return mix(mix(sampleClamp(x0, y0), sampleClamp(x0 + 1, y0), tx), mix(sampleClamp(x0, y0 + 1), sampleClamp(x0 + 1, y0 + 1), tx), ty); }",
].join("\n");

const gauss1d = (axis: "x" | "y") =>
  `let rad = i32(clamp(round(u.param0), 1.0, 64.0)); let s2 = max(0.25, u.param0 * u.param0 * 0.25); var acc = vec4<f32>(0.0); var ws = 0.0; for (var k = -rad; k <= rad; k = k + 1) { let w = exp(-f32(k * k) / (2.0 * s2)); acc = acc + ${axis === "x" ? "sampleClamp(i32(gid.x) + k, i32(gid.y))" : "sampleClamp(i32(gid.x), i32(gid.y) + k)"} * w; ws = ws + w; } dstPixels[gid.y * u.width + gid.x] = packRgba(acc / max(1e-5, ws));`;

const HEAVY_KERNEL_SPECS: Readonly<Record<WebGpuHeavyFilterId, HeavyKernelSpec>> = {
  "gauss-blur": { wg: [16, 16], uniforms: (p) => [pNum(p, "radiusPx", 3), 0, 0, 0], passes: [{ id: "gauss-horizontal", entry: "cs_gauss_blur_h", body: gauss1d("x") }, { id: "gauss-vertical", entry: "cs_gauss_blur_v", body: gauss1d("y") }] },
  "motion-blur": { wg: [16, 16], uniforms: (p) => [pNum(p, "distancePx", 8), (pNum(p, "angleDeg", 0) * Math.PI) / 180, 0, 0], passes: [{ id: "motion-line", entry: "cs_motion_blur", body: "let taps = i32(clamp(round(u.param0), 1.0, 64.0)); let d = vec2<f32>(cos(u.param1), sin(u.param1)); var acc = vec4<f32>(0.0); for (var k = -taps; k <= taps; k = k + 1) { acc = acc + sampleBilinear(f32(gid.x) + d.x * f32(k), f32(gid.y) + d.y * f32(k)); } dstPixels[gid.y * u.width + gid.x] = packRgba(acc / f32(taps * 2 + 1));" }] },
  "radial-blur": { wg: [16, 16], uniforms: (p) => [pNum(p, "strengthPx", 10), 0.5, 0.5, 0], passes: [{ id: "radial-zoom", entry: "cs_radial_blur", body: "let c = vec2<f32>(f32(u.width) * u.param1, f32(u.height) * u.param2); let d = vec2<f32>(f32(gid.x), f32(gid.y)) - c; var acc = vec4<f32>(0.0); for (var i = 0; i < 16; i = i + 1) { let sc = 1.0 - (f32(i) / 16.0) * (u.param0 / max(1.0, f32(u.width))); let pos = c + d * sc; acc = acc + sampleBilinear(pos.x, pos.y); } dstPixels[gid.y * u.width + gid.x] = packRgba(acc / 16.0);" }] },
  "rotation-blur": { wg: [16, 16], uniforms: (p) => [(pNum(p, "amountDeg", 12) * Math.PI) / 180, pNum(p, "aspect", 1), 0, 0], passes: [{ id: "rotation-arc", entry: "cs_rotation_blur", body: "let c = vec2<f32>(f32(u.width) * 0.5, f32(u.height) * 0.5); let r = vec2<f32>(f32(gid.x) - c.x, (f32(gid.y) - c.y) / max(0.1, u.param1)); var acc = vec4<f32>(0.0); for (var i = -7; i <= 7; i = i + 1) { let a = (f32(i) / 7.0) * u.param0 * 0.5; let p = vec2<f32>(r.x * cos(a) - r.y * sin(a) + c.x, (r.x * sin(a) + r.y * cos(a)) * u.param1 + c.y); acc = acc + sampleBilinear(p.x, p.y); } dstPixels[gid.y * u.width + gid.x] = packRgba(acc / 15.0);" }] },
  "unsharp-mask": { wg: [16, 16], uniforms: (p) => [pNum(p, "radiusPx", 2), pNum(p, "amountPercent", 120) / 100, pNum(p, "threshold", 2) / 255, 0], passes: [{ id: "unsharp-blur-h", entry: "cs_unsharp_blur_h", body: gauss1d("x") }, { id: "unsharp-combine", entry: "cs_unsharp_combine", body: "let c = sampleClamp(i32(gid.x), i32(gid.y)); let b = (sampleClamp(i32(gid.x), i32(gid.y) - 1) + c * 2.0 + sampleClamp(i32(gid.x), i32(gid.y) + 1)) * 0.25; let diff = c.rgb - b.rgb; let m = step(vec3<f32>(u.param2), abs(diff)); dstPixels[gid.y * u.width + gid.x] = packRgba(vec4<f32>(c.rgb + diff * u.param1 * m, c.a));" }] },
  "fisheye": { wg: [16, 16], uniforms: (p) => [pNum(p, "distortion", 50) / 100, pNum(p, "radiusScale", 1), 0, 0], passes: [{ id: "fisheye-warp", entry: "cs_fisheye_warp", body: "let c = vec2<f32>(f32(u.width) * 0.5, f32(u.height) * 0.5); let rad = max(1.0, min(c.x, c.y) * u.param1); let d = (vec2<f32>(f32(gid.x), f32(gid.y)) - c) / rad; let r = length(d); let f = select(1.0, pow(max(1e-4, r), 1.0 + u.param0 * 0.65) / max(1e-4, r), r < 1.0); let p = c + d * f * rad; dstPixels[gid.y * u.width + gid.x] = packRgba(sampleBilinear(p.x, p.y));" }] },
  "lens-distortion": { wg: [16, 16], uniforms: (p) => [pNum(p, "distortion", -35) / 100, pNum(p, "oblateness", 0), 0, 0], passes: [{ id: "brown-conrady", entry: "cs_lens_distortion", body: "let c = vec2<f32>(f32(u.width) * 0.5, f32(u.height) * 0.5); let n = (vec2<f32>(f32(gid.x), f32(gid.y)) - c) / max(vec2<f32>(1.0), c); let r2 = dot(n, n); let p = c + n * (1.0 + u.param0 * r2 + u.param0 * 0.25 * r2 * r2) * c; dstPixels[gid.y * u.width + gid.x] = packRgba(sampleBilinear(p.x, p.y));" }] },
  "pinch": { wg: [16, 16], uniforms: (p) => [pNum(p, "strength", 45) / 100, pNum(p, "radiusScale", 1), 0, 0], passes: [{ id: "pinch-warp", entry: "cs_pinch_warp", body: "let c = vec2<f32>(f32(u.width) * 0.5, f32(u.height) * 0.5); let rad = max(1.0, min(c.x, c.y) * u.param1); let d = (vec2<f32>(f32(gid.x), f32(gid.y)) - c) / rad; let r = length(d); let s = select(1.0, pow(sin(1.5707963 * r), -u.param0), r < 1.0 && r > 1e-4); let p = c + d * s * rad; dstPixels[gid.y * u.width + gid.x] = packRgba(sampleBilinear(p.x, p.y));" }] },
  "sphere": { wg: [16, 16], uniforms: (p) => [pNum(p, "strength", 60) / 100, 0, 0, 0], passes: [{ id: "sphere-warp", entry: "cs_sphere_warp", body: "let c = vec2<f32>(f32(u.width) * 0.5, f32(u.height) * 0.5); let d = (vec2<f32>(f32(gid.x), f32(gid.y)) - c) / max(vec2<f32>(1.0), c); let r = length(d); let z = sqrt(max(0.0, 1.0 - r * r)); let f = select(1.0, mix(1.0, (1.0 - 0.6366197 * asin(z)) / max(1e-4, r), abs(u.param0)), r < 1.0); let p = c + d * f * c; dstPixels[gid.y * u.width + gid.x] = packRgba(sampleBilinear(p.x, p.y));" }] },
  "spiral": { wg: [16, 16], uniforms: (p) => [pNum(p, "twirlTurns", 0.5) * Math.PI * 2, 0, 0, 0], passes: [{ id: "spiral-twirl", entry: "cs_spiral_twirl", body: "let c = vec2<f32>(f32(u.width) * 0.5, f32(u.height) * 0.5); let rad = max(1.0, min(c.x, c.y)); let d = vec2<f32>(f32(gid.x), f32(gid.y)) - c; let a = max(0.0, 1.0 - length(d) / rad) * u.param0; let p = c + vec2<f32>(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a)); dstPixels[gid.y * u.width + gid.x] = packRgba(sampleBilinear(p.x, p.y));" }] },
  "flow-based-abstraction": { wg: [8, 8], uniforms: (p) => [pNum(p, "numberOfGradations", 6), pNum(p, "lineOpacity01", 0.85), 0, 0], passes: [{ id: "etf-quantize", entry: "cs_flow_abstraction", body: "let c = sampleClamp(i32(gid.x), i32(gid.y)); let gx = sampleClamp(i32(gid.x) + 1, i32(gid.y)).rgb - sampleClamp(i32(gid.x) - 1, i32(gid.y)).rgb; let gy = sampleClamp(i32(gid.x), i32(gid.y) + 1).rgb - sampleClamp(i32(gid.x), i32(gid.y) - 1).rgb; let edge = clamp(length(gx) + length(gy), 0.0, 1.0); let bins = max(2.0, u.param0); let q = floor(c.rgb * bins) / bins; dstPixels[gid.y * u.width + gid.x] = packRgba(vec4<f32>(mix(q, vec3<f32>(0.05), edge * u.param1), c.a));" }] },
  "pencil-art": { wg: [8, 8], uniforms: (p) => [p?.showOutline === false ? 0 : 1, p?.grayscaleOutput === false ? 0 : 1, 0, 0], passes: [{ id: "pencil-sobel", entry: "cs_pencil_art", body: "let c = sampleClamp(i32(gid.x), i32(gid.y)); let lum = vec3<f32>(0.299, 0.587, 0.114); let dx = dot(sampleClamp(i32(gid.x) + 1, i32(gid.y)).rgb - sampleClamp(i32(gid.x) - 1, i32(gid.y)).rgb, lum); let dy = dot(sampleClamp(i32(gid.x), i32(gid.y) + 1).rgb - sampleClamp(i32(gid.x), i32(gid.y) - 1).rgb, lum); let sk = clamp(1.0 - sqrt(dx * dx + dy * dy) * 2.4 * u.param0, 0.0, 1.0); dstPixels[gid.y * u.width + gid.x] = packRgba(vec4<f32>(vec3<f32>(sk), c.a));" }] },
  "chromatic-aberration": { wg: [16, 16], uniforms: (p) => [pNum(p, "intensity", 35) * 0.12, (pNum(p, "angleDeg", 0) * Math.PI) / 180, 0, 0], passes: [{ id: "chromatic-split", entry: "cs_chromatic_aberration", body: "let c = vec2<f32>(f32(u.width) * 0.5, f32(u.height) * 0.5); let dir = normalize(vec2<f32>(f32(gid.x), f32(gid.y)) - c + vec2<f32>(1e-4)) * u.param0; let r = sampleBilinear(f32(gid.x) + dir.x, f32(gid.y) + dir.y).r; let g = sampleClamp(i32(gid.x), i32(gid.y)); let b = sampleBilinear(f32(gid.x) - dir.x, f32(gid.y) - dir.y).b; dstPixels[gid.y * u.width + gid.x] = packRgba(vec4<f32>(r, g.g, b, g.a));" }] },
  "normal-map": { wg: [16, 16], uniforms: (p) => [pNum(p, "strength", 2.5), p?.yDirectionType === "directx-y-minus" ? -1 : 1, 0, 0], passes: [{ id: "sobel-normal", entry: "cs_normal_map", body: "let lum = vec3<f32>(0.299, 0.587, 0.114); let dx = dot(sampleClamp(i32(gid.x) - 1, i32(gid.y)).rgb - sampleClamp(i32(gid.x) + 1, i32(gid.y)).rgb, lum); let dy = dot(sampleClamp(i32(gid.x), i32(gid.y) - 1).rgb - sampleClamp(i32(gid.x), i32(gid.y) + 1).rgb, lum); let n = normalize(vec3<f32>(dx * u.param0, dy * u.param0 * u.param1, 1.0)); dstPixels[gid.y * u.width + gid.x] = packRgba(vec4<f32>(n * 0.5 + vec3<f32>(0.5), 1.0));" }] },
  "reduce-noise": { wg: [8, 8], uniforms: (p) => [pNum(p, "strength01", 0.6), pNum(p, "preserveDetail01", 0.5), 0, 0], passes: [{ id: "bilateral-denoise", entry: "cs_reduce_noise", body: "let c = sampleClamp(i32(gid.x), i32(gid.y)); let sr = max(0.05, (1.0 - u.param1 * 0.85) * 0.35); var acc = vec3<f32>(0.0); var ws = 0.0; for (var dy = -2; dy <= 2; dy = dy + 1) { for (var dx = -2; dx <= 2; dx = dx + 1) { let s = sampleClamp(i32(gid.x) + dx, i32(gid.y) + dy); let dr = length(s.rgb - c.rgb); let w = exp(-f32(dx * dx + dy * dy) * 0.25 - (dr * dr) / (2.0 * sr * sr)); acc = acc + s.rgb * w; ws = ws + w; } } dstPixels[gid.y * u.width + gid.x] = packRgba(vec4<f32>(mix(c.rgb, acc / max(1e-5, ws), u.param0), c.a));" }] },
};

const isHeavyWebGpuFilter = (id: CspReaFilterId): id is WebGpuHeavyFilterId =>
  Object.prototype.hasOwnProperty.call(HEAVY_KERNEL_SPECS, id);

/** 고부하 15종 CSP 필터의 WebGPU WGSL 컴퓨트 셰이더 소스 및 디스패치 계획을 생성한다. */
export function buildWebGpuFilterComputePlan(
  filterId: CspReaFilterId,
  width: number,
  height: number,
  params?: CspReaFilterParamMap,
  options?: { readonly shaderF16?: boolean; readonly maxBufferSizeBytes?: number },
): WebGpuFilterComputePlan {
  const safeW = Math.max(1, Math.trunc(width)), safeH = Math.max(1, Math.trunc(height));
  const pixelCount = safeW * safeH, storageBufferBytes = pixelCount * 4;
  const requiresTileStreaming = storageBufferBytes > (options?.maxBufferSizeBytes ?? 256 * 1024 * 1024);
  const useShaderF16 = Boolean(options?.shaderF16);

  if (!isHeavyWebGpuFilter(filterId)) {
    return Object.freeze({
      filterId, supportedOnWebGpu: false, width: safeW, height: safeH, pixelCount, storageBufferBytes,
      requiresTileStreaming, recommendedTileSizePx: requiresTileStreaming ? 512 : 256,
      useShaderF16, uniforms: Object.freeze([0, 0, 0, 0] as const), passes: Object.freeze([]),
    });
  }

  const spec = HEAVY_KERNEL_SPECS[filterId];
  const [wgX, wgY] = spec.wg;
  const dispatch: readonly [number, number, number] = Object.freeze([Math.ceil(safeW / wgX), Math.ceil(safeH / wgY), 1]);
  const f16Header = useShaderF16 ? "enable f16;\n" : "";

  const passes: readonly WebGpuFilterComputePass[] = Object.freeze(
    spec.passes.map((pass, passIndex) => Object.freeze({
      passIndex, passId: pass.id, entryPoint: pass.entry,
      workgroupSize: Object.freeze([wgX, wgY, 1] as const), dispatchWorkgroups: dispatch,
      uniformBufferBytes: 32, storageBufferBytes, useShaderF16,
      wgslSource: `${f16Header}${WGSL_PRELUDE}\n@compute @workgroup_size(${wgX}, ${wgY}, 1)\nfn ${pass.entry}(@builtin(global_invocation_id) gid: vec3<u32>) {\n  if (gid.x >= u.width || gid.y >= u.height) { return; }\n  ${pass.body}\n}\n`,
    })),
  );

  return Object.freeze({
    filterId, supportedOnWebGpu: true, width: safeW, height: safeH, pixelCount, storageBufferBytes,
    requiresTileStreaming, recommendedTileSizePx: requiresTileStreaming ? 512 : 1024,
    useShaderF16, uniforms: Object.freeze(spec.uniforms(params)), passes,
  });
}

/** 생성된 WGSL 컴퓨트 셰이더 계획의 구조·정렬·디스패치 무결성을 검증한다. */
export function validateWebGpuComputePlan(plan: WebGpuFilterComputePlan): WebGpuFilterComputeValidation {
  const errors: string[] = [];
  if (!plan.supportedOnWebGpu) errors.push(`Filter "${plan.filterId}" is not registered for WebGPU compute dispatch`);
  if (plan.passes.length === 0) errors.push(`Plan for "${plan.filterId}" has zero compute passes`);
  for (const pass of plan.passes) {
    const [wgX, wgY, wgZ] = pass.workgroupSize;
    const [dx, dy, dz] = pass.dispatchWorkgroups;
    if (wgX * wgY * wgZ > 256 || wgX <= 0 || wgY <= 0 || wgZ <= 0) errors.push(`${pass.passId}: invalid workgroup size`);
    if (dx <= 0 || dy <= 0 || dz <= 0) errors.push(`${pass.passId}: zero dispatch dimensions`);
    if (pass.uniformBufferBytes % 16 !== 0 || pass.uniformBufferBytes < 16) errors.push(`${pass.passId}: uniform misalignment`);
    if (!pass.wgslSource.includes("@compute") || !pass.wgslSource.includes(`fn ${pass.entryPoint}`)) {
      errors.push(`${pass.passId}: WGSL missing @compute or fn ${pass.entryPoint}`);
    }
    if (!pass.wgslSource.includes("@group(0) @binding(0)") || !pass.wgslSource.includes("gid.x >= u.width")) {
      errors.push(`${pass.passId}: WGSL missing binding or bounds guard`);
    }
    if (pass.useShaderF16 && !pass.wgslSource.startsWith("enable f16;")) {
      errors.push(`${pass.passId}: shaderF16 requested without enable f16; directive`);
    }
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
