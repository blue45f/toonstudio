/**
 * WebAssembly 3.0 Memory64 (`i64`) 네이티브 래스터 커널 바이너리 모듈 빌더.
 *
 * 익스포트 커널 4종:
 * 1) `applyTonalLut64(pixelPtr: i64, pixelCount: i64, lutPtr: i64)`
 * 2) `compositeLayerSourceOver64(dstPtr: i64, srcPtr: i64, pixelCount: i64, opacity255: i32)`
 * 3) `compositeLayerMultiply64(dstPtr: i64, srcPtr: i64, pixelCount: i64, opacity255: i32)`
 * 4) `stampSoftBrushDab64(canvasPtr: i64, width: i64, height: i64, cx: f32, cy: f32,
 *    radius: f32, r: i32, g: i32, b: i32, alpha255: i32, hardness255: i32) -> i32`
 */

import {
  STUDIO_WASM_PAGE_BYTES,
  STUDIO_WEB_MEMORY64_ADDRESS_LIMIT_BYTES,
} from "../studio-wasm64-memory-governor";

import {
  encodeSection,
  encodeSleb128_32,
  encodeSleb128_64,
  encodeUleb128_32,
  encodeUleb128_64,
  encodeUtf8Name,
  encodeVector,
  WASM_MAGIC_AND_VERSION,
  WASM_MEMORY64_LIMITS_FLAG,
  WASM_OP as OP,
  WASM_SEC as SEC,
  WASM_VAL as VAL,
  WasmBodyBuilder,
} from "./wasm64-raster-leb128";

export {
  encodeSleb128_32,
  encodeSleb128_64,
  encodeUleb128_32,
  encodeUleb128_64,
  WASM_MEMORY64_LIMITS_FLAG,
};

const WEB_MEMORY64_MAX_PAGES =
  STUDIO_WEB_MEMORY64_ADDRESS_LIMIT_BYTES / STUDIO_WASM_PAGE_BYTES;

export interface Wasm64RasterModuleBuildOptions {
  /** Import memory minimum pages (64 KiB/page). Default 1n. */
  readonly initialPages?: bigint;
  /** Import memory maximum pages (64 KiB/page). Default 262144n (16 GiB Chrome limit). */
  readonly maximumPages?: bigint;
}

function emitSourceOverWrite(
  b: WasmBodyBuilder,
  locs: {
    readonly dstPtr: number;
    readonly sr: number;
    readonly sg: number;
    readonly sb: number;
    readonly sa: number;
    readonly dr: number;
    readonly dg: number;
    readonly db: number;
    readonly da: number;
    readonly daScaled: number;
    readonly outA: number;
  },
): void {
  const { dstPtr, sr, sg, sb, sa, dr, dg, db, da, daScaled, outA } = locs;

  b.localGet(sa).i32Const(255).op(OP.I32_EQ).ifVoid()
    .localGet(dstPtr).localGet(sr).store8_64(BigInt(0))
    .localGet(dstPtr).localGet(sg).store8_64(BigInt(1))
    .localGet(dstPtr).localGet(sb).store8_64(BigInt(2))
    .localGet(dstPtr).i32Const(255).store8_64(BigInt(3))
    .elseBranch();

  b.localGet(dstPtr).load8U64(BigInt(0)).localSet(dr)
    .localGet(dstPtr).load8U64(BigInt(1)).localSet(dg)
    .localGet(dstPtr).load8U64(BigInt(2)).localSet(db)
    .localGet(dstPtr).load8U64(BigInt(3)).localSet(da);

  b.localGet(da)
    .i32Const(255).localGet(sa).op(OP.I32_SUB)
    .op(OP.I32_MUL)
    .i32Const(127).op(OP.I32_ADD)
    .i32Const(255).op(OP.I32_DIV_U)
    .localTee(daScaled);

  b.localGet(sa).op(OP.I32_ADD).localSet(outA);

  const channels: ReadonlyArray<readonly [number, number, bigint]> = [
    [sr, dr, BigInt(0)],
    [sg, dg, BigInt(1)],
    [sb, db, BigInt(2)],
  ];
  for (const [srcCh, dstCh, offset] of channels) {
    b.localGet(dstPtr)
      .localGet(srcCh).localGet(sa).op(OP.I32_MUL)
      .localGet(dstCh).localGet(daScaled).op(OP.I32_MUL)
      .op(OP.I32_ADD)
      .localGet(outA).i32Const(1).op(OP.I32_SHR_U)
      .op(OP.I32_ADD)
      .localGet(outA).op(OP.I32_DIV_U)
      .store8_64(offset);
  }
  b.localGet(dstPtr).localGet(outA).store8_64(BigInt(3));
  b.end();
}

function buildApplyTonalLut64Body(): number[] {
  const L = { pixelPtr: 0, pixelCount: 1, lutPtr: 2, ptr: 3, endPtr: 4 };
  const b = new WasmBodyBuilder();

  b.localGet(L.pixelCount).op(OP.I64_EQZ).ifVoid().op(OP.RETURN).end();
  b.localGet(L.pixelPtr).localSet(L.ptr);
  b.localGet(L.pixelPtr)
    .localGet(L.pixelCount).i64Const(BigInt(2)).op(OP.I64_SHL)
    .op(OP.I64_ADD)
    .localSet(L.endPtr);

  b.block().loop();
  b.localGet(L.ptr).localGet(L.endPtr).op(OP.I64_GE_U).brIf(1);
  for (let ch = 0; ch < 3; ch += 1) {
    const chOffset = BigInt(ch);
    b.localGet(L.ptr)
      .localGet(L.lutPtr)
      .localGet(L.ptr).load8U64(chOffset)
      .op(OP.I64_EXTEND_I32_U)
      .i64Const(BigInt(3)).op(OP.I64_MUL)
      .op(OP.I64_ADD)
      .load8U64(chOffset)
      .store8_64(chOffset);
  }
  b.localGet(L.ptr).i64Const(BigInt(4)).op(OP.I64_ADD).localSet(L.ptr);
  b.br(0).end().end();

  return b.build([[2, VAL.I64]]);
}

function buildCompositeSourceOver64Body(): number[] {
  const L = {
    dstPtr: 0, srcPtr: 1, pixelCount: 2, opacity255: 3,
    dPtr: 4, sPtr: 5, dEnd: 6,
    op: 7, sa: 8, sr: 9, sg: 10, sb: 11, dr: 12, dg: 13, db: 14, da: 15, daScaled: 16, outA: 17,
  };
  const b = new WasmBodyBuilder();

  b.localGet(L.pixelCount).op(OP.I64_EQZ).ifVoid().op(OP.RETURN).end();
  b.localGet(L.opacity255).i32Const(0).op(OP.I32_LE_S).ifVoid().op(OP.RETURN).end();

  b.localGet(L.opacity255).i32Const(255).op(OP.I32_GT_S).ifVoid()
    .i32Const(255).localSet(L.op)
    .elseBranch()
    .localGet(L.opacity255).localSet(L.op)
    .end();

  b.localGet(L.dstPtr).localSet(L.dPtr);
  b.localGet(L.srcPtr).localSet(L.sPtr);
  b.localGet(L.dstPtr)
    .localGet(L.pixelCount).i64Const(BigInt(2)).op(OP.I64_SHL)
    .op(OP.I64_ADD)
    .localSet(L.dEnd);

  b.block().loop();
  b.localGet(L.dPtr).localGet(L.dEnd).op(OP.I64_GE_U).brIf(1);

  b.localGet(L.sPtr).load8U64(BigInt(3))
    .localGet(L.op).op(OP.I32_MUL)
    .i32Const(127).op(OP.I32_ADD)
    .i32Const(255).op(OP.I32_DIV_U)
    .localTee(L.sa);

  b.i32Const(0).op(OP.I32_GT_S).ifVoid();
  b.localGet(L.sPtr).load8U64(BigInt(0)).localSet(L.sr)
    .localGet(L.sPtr).load8U64(BigInt(1)).localSet(L.sg)
    .localGet(L.sPtr).load8U64(BigInt(2)).localSet(L.sb);
  emitSourceOverWrite(b, {
    dstPtr: L.dPtr, sr: L.sr, sg: L.sg, sb: L.sb, sa: L.sa,
    dr: L.dr, dg: L.dg, db: L.db, da: L.da, daScaled: L.daScaled, outA: L.outA,
  });
  b.end();

  b.localGet(L.dPtr).i64Const(BigInt(4)).op(OP.I64_ADD).localSet(L.dPtr);
  b.localGet(L.sPtr).i64Const(BigInt(4)).op(OP.I64_ADD).localSet(L.sPtr);
  b.br(0).end().end();

  return b.build([[3, VAL.I64], [11, VAL.I32]]);
}

function buildCompositeMultiply64Body(): number[] {
  const L = {
    dstPtr: 0, srcPtr: 1, pixelCount: 2, opacity255: 3,
    dPtr: 4, sPtr: 5, dEnd: 6,
    op: 7, sa: 8, sr: 9, sg: 10, sb: 11, dr: 12, dg: 13, db: 14, da: 15,
    daScaled: 16, outA: 17, invDa: 18, cr: 19, cg: 20, cb: 21,
  };
  const b = new WasmBodyBuilder();

  b.localGet(L.pixelCount).op(OP.I64_EQZ).ifVoid().op(OP.RETURN).end();
  b.localGet(L.opacity255).i32Const(0).op(OP.I32_LE_S).ifVoid().op(OP.RETURN).end();

  b.localGet(L.opacity255).i32Const(255).op(OP.I32_GT_S).ifVoid()
    .i32Const(255).localSet(L.op)
    .elseBranch()
    .localGet(L.opacity255).localSet(L.op)
    .end();

  b.localGet(L.dstPtr).localSet(L.dPtr);
  b.localGet(L.srcPtr).localSet(L.sPtr);
  b.localGet(L.dstPtr)
    .localGet(L.pixelCount).i64Const(BigInt(2)).op(OP.I64_SHL)
    .op(OP.I64_ADD)
    .localSet(L.dEnd);

  b.block().loop();
  b.localGet(L.dPtr).localGet(L.dEnd).op(OP.I64_GE_U).brIf(1);

  b.localGet(L.sPtr).load8U64(BigInt(3))
    .localGet(L.op).op(OP.I32_MUL)
    .i32Const(127).op(OP.I32_ADD)
    .i32Const(255).op(OP.I32_DIV_U)
    .localTee(L.sa);

  b.i32Const(0).op(OP.I32_GT_S).ifVoid();
  b.localGet(L.sPtr).load8U64(BigInt(0)).localSet(L.sr)
    .localGet(L.sPtr).load8U64(BigInt(1)).localSet(L.sg)
    .localGet(L.sPtr).load8U64(BigInt(2)).localSet(L.sb)
    .localGet(L.dPtr).load8U64(BigInt(3)).localSet(L.da);

  b.localGet(L.da).op(OP.I32_EQZ).ifVoid()
    .localGet(L.dPtr).localGet(L.sr).store8_64(BigInt(0))
    .localGet(L.dPtr).localGet(L.sg).store8_64(BigInt(1))
    .localGet(L.dPtr).localGet(L.sb).store8_64(BigInt(2))
    .localGet(L.dPtr).localGet(L.sa).store8_64(BigInt(3))
    .elseBranch();

  b.localGet(L.dPtr).load8U64(BigInt(0)).localSet(L.dr)
    .localGet(L.dPtr).load8U64(BigInt(1)).localSet(L.dg)
    .localGet(L.dPtr).load8U64(BigInt(2)).localSet(L.db)
    .i32Const(255).localGet(L.da).op(OP.I32_SUB).localSet(L.invDa);

  const mulChannels: ReadonlyArray<readonly [number, number, number]> = [
    [L.sr, L.dr, L.cr],
    [L.sg, L.dg, L.cg],
    [L.sb, L.db, L.cb],
  ];
  for (const [sCh, dCh, cCh] of mulChannels) {
    b.localGet(L.invDa).localGet(sCh).op(OP.I32_MUL)
      .localGet(L.da)
      .localGet(dCh).localGet(sCh).op(OP.I32_MUL)
      .i32Const(127).op(OP.I32_ADD)
      .i32Const(255).op(OP.I32_DIV_U)
      .op(OP.I32_MUL)
      .op(OP.I32_ADD)
      .i32Const(127).op(OP.I32_ADD)
      .i32Const(255).op(OP.I32_DIV_U)
      .localSet(cCh);
  }

  b.localGet(L.da)
    .i32Const(255).localGet(L.sa).op(OP.I32_SUB)
    .op(OP.I32_MUL)
    .i32Const(127).op(OP.I32_ADD)
    .i32Const(255).op(OP.I32_DIV_U)
    .localTee(L.daScaled)
    .localGet(L.sa).op(OP.I32_ADD)
    .localSet(L.outA);

  const outChannels: ReadonlyArray<readonly [number, number, bigint]> = [
    [L.cr, L.dr, BigInt(0)],
    [L.cg, L.dg, BigInt(1)],
    [L.cb, L.db, BigInt(2)],
  ];
  for (const [cCh, dCh, offset] of outChannels) {
    b.localGet(L.dPtr)
      .localGet(cCh).localGet(L.sa).op(OP.I32_MUL)
      .localGet(dCh).localGet(L.daScaled).op(OP.I32_MUL)
      .op(OP.I32_ADD)
      .localGet(L.outA).i32Const(1).op(OP.I32_SHR_U)
      .op(OP.I32_ADD)
      .localGet(L.outA).op(OP.I32_DIV_U)
      .store8_64(offset);
  }
  b.localGet(L.dPtr).localGet(L.outA).store8_64(BigInt(3));
  b.end();
  b.end();

  b.localGet(L.dPtr).i64Const(BigInt(4)).op(OP.I64_ADD).localSet(L.dPtr);
  b.localGet(L.sPtr).i64Const(BigInt(4)).op(OP.I64_ADD).localSet(L.sPtr);
  b.br(0).end().end();

  return b.build([[3, VAL.I64], [15, VAL.I32]]);
}

function buildStampSoftBrushDab64Body(): number[] {
  const L = {
    canvasPtr: 0, width: 1, height: 2, cx: 3, cy: 4, radius: 5,
    r: 6, g: 7, b: 8, alpha255: 9, hardness255: 10,
    minX: 11, maxX: 12, minY: 13, maxY: 14, y: 15, x: 16, ptr: 17,
    radSq: 18, inner: 19, invSpan: 20, dy: 21, dx: 22, distSq: 23, dist: 24, cov: 25,
    touched: 26, sa: 27, dr: 28, dg: 29, db: 30, da: 31, daScaled: 32, outA: 33,
    alphaClamped: 34, hardClamped: 35,
  };
  const b = new WasmBodyBuilder();

  b.localGet(L.width).i64Const(BigInt(0)).op(OP.I64_LE_S).ifVoid().i32Const(0).op(OP.RETURN).end();
  b.localGet(L.height).i64Const(BigInt(0)).op(OP.I64_LE_S).ifVoid().i32Const(0).op(OP.RETURN).end();
  b.localGet(L.radius).f32Const(0).op(OP.F32_LE).ifVoid().i32Const(0).op(OP.RETURN).end();
  b.localGet(L.alpha255).i32Const(0).op(OP.I32_LE_S).ifVoid().i32Const(0).op(OP.RETURN).end();

  b.localGet(L.alpha255).i32Const(255).op(OP.I32_GT_S).ifVoid()
    .i32Const(255).localSet(L.alphaClamped)
    .elseBranch()
    .localGet(L.alpha255).localSet(L.alphaClamped)
    .end();

  b.localGet(L.hardness255).i32Const(0).op(OP.I32_LT_S).ifVoid()
    .i32Const(0).localSet(L.hardClamped)
    .elseBranch()
    .localGet(L.hardness255).i32Const(255).op(OP.I32_GT_S).ifVoid()
      .i32Const(255).localSet(L.hardClamped)
      .elseBranch()
      .localGet(L.hardness255).localSet(L.hardClamped)
      .end()
    .end();

  const emitAxisBounds = (center: number, limit: number, minLoc: number, maxLoc: number) => {
    b.localGet(center).localGet(L.radius).op(OP.F32_SUB).op(OP.F32_FLOOR)
      .f32Const(0).op(OP.F32_MAX)
      .localGet(limit).op(OP.F32_CONVERT_I64_S).op(OP.F32_MIN)
      .op(OP.I64_TRUNC_F32_S).localSet(minLoc);
    b.localGet(center).localGet(L.radius).op(OP.F32_ADD).op(OP.F32_CEIL)
      .f32Const(-1).op(OP.F32_MAX)
      .localGet(limit).i64Const(BigInt(-1)).op(OP.I64_ADD).op(OP.F32_CONVERT_I64_S).op(OP.F32_MIN)
      .op(OP.I64_TRUNC_F32_S).localSet(maxLoc);
  };
  emitAxisBounds(L.cx, L.width, L.minX, L.maxX);
  emitAxisBounds(L.cy, L.height, L.minY, L.maxY);

  b.localGet(L.minX).localGet(L.maxX).op(OP.I64_GT_S).ifVoid().i32Const(0).op(OP.RETURN).end();
  b.localGet(L.minY).localGet(L.maxY).op(OP.I64_GT_S).ifVoid().i32Const(0).op(OP.RETURN).end();

  b.localGet(L.radius).localGet(L.radius).op(OP.F32_MUL).localSet(L.radSq);
  b.localGet(L.hardClamped).op(OP.F32_CONVERT_I32_S).f32Const(255).op(OP.F32_DIV).localSet(L.inner);
  b.f32Const(1).f32Const(1).localGet(L.inner).op(OP.F32_SUB).f32Const(1e-5).op(OP.F32_MAX)
    .op(OP.F32_DIV).localSet(L.invSpan);

  b.localGet(L.minY).localSet(L.y);
  b.block().loop();
  b.localGet(L.y).localGet(L.maxY).op(OP.I64_GT_S).brIf(1);

  b.localGet(L.y).op(OP.F32_CONVERT_I64_S).f32Const(0.5).op(OP.F32_ADD)
    .localGet(L.cy).op(OP.F32_SUB).localSet(L.dy);

  b.localGet(L.minX).localSet(L.x);
  b.block().loop();
  b.localGet(L.x).localGet(L.maxX).op(OP.I64_GT_S).brIf(1);

  b.localGet(L.x).op(OP.F32_CONVERT_I64_S).f32Const(0.5).op(OP.F32_ADD)
    .localGet(L.cx).op(OP.F32_SUB).localTee(L.dx)
    .localGet(L.dx).op(OP.F32_MUL)
    .localGet(L.dy).localGet(L.dy).op(OP.F32_MUL)
    .op(OP.F32_ADD).localTee(L.distSq);

  b.localGet(L.radSq).op(OP.F32_LT).ifVoid();
  b.localGet(L.distSq).op(OP.F32_SQRT).localSet(L.dist);

  b.localGet(L.hardClamped).i32Const(255).op(OP.I32_GE_S).ifVoid()
    .localGet(L.radius).localGet(L.dist).op(OP.F32_SUB)
    .f32Const(0).op(OP.F32_MAX).f32Const(1).op(OP.F32_MIN)
    .localSet(L.cov)
    .elseBranch()
    .localGet(L.dist).localGet(L.radius).op(OP.F32_DIV)
    .localGet(L.inner).op(OP.F32_LE).ifVoid()
      .f32Const(1).localSet(L.cov)
      .elseBranch()
      .f32Const(1)
      .localGet(L.dist).localGet(L.radius).op(OP.F32_DIV)
      .localGet(L.inner).op(OP.F32_SUB)
      .localGet(L.invSpan).op(OP.F32_MUL)
      .op(OP.F32_SUB)
      .f32Const(0).op(OP.F32_MAX).f32Const(1).op(OP.F32_MIN)
      .localTee(L.cov)
      .localGet(L.cov).op(OP.F32_MUL)
      .f32Const(3).f32Const(2).localGet(L.cov).op(OP.F32_MUL).op(OP.F32_SUB)
      .op(OP.F32_MUL)
      .localSet(L.cov)
      .end()
    .end();

  b.localGet(L.cov)
    .localGet(L.alphaClamped).op(OP.F32_CONVERT_I32_S)
    .op(OP.F32_MUL).f32Const(0.5).op(OP.F32_ADD)
    .op(OP.I32_TRUNC_F32_S).localTee(L.sa);

  b.i32Const(255).op(OP.I32_GT_S).ifVoid().i32Const(255).localSet(L.sa).end();
  b.localGet(L.sa).i32Const(0).op(OP.I32_GT_S).ifVoid();

  b.localGet(L.canvasPtr)
    .localGet(L.y).localGet(L.width).op(OP.I64_MUL)
    .localGet(L.x).op(OP.I64_ADD)
    .i64Const(BigInt(2)).op(OP.I64_SHL)
    .op(OP.I64_ADD)
    .localSet(L.ptr);

  emitSourceOverWrite(b, {
    dstPtr: L.ptr, sr: L.r, sg: L.g, sb: L.b, sa: L.sa,
    dr: L.dr, dg: L.dg, db: L.db, da: L.da, daScaled: L.daScaled, outA: L.outA,
  });

  b.localGet(L.touched).i32Const(1).op(OP.I32_ADD).localSet(L.touched);
  b.end();
  b.end();

  b.localGet(L.x).i64Const(BigInt(1)).op(OP.I64_ADD).localSet(L.x);
  b.br(0).end().end();

  b.localGet(L.y).i64Const(BigInt(1)).op(OP.I64_ADD).localSet(L.y);
  b.br(0).end().end();

  b.localGet(L.touched);
  return b.build([[7, VAL.I64], [8, VAL.F32], [10, VAL.I32]]);
}

export function buildWasm64RasterModuleBytes(
  options: Wasm64RasterModuleBuildOptions = {},
): Uint8Array {
  const initialPages = options.initialPages ?? BigInt(1);
  const maximumPages = options.maximumPages ?? WEB_MEMORY64_MAX_PAGES;
  if (
    initialPages < BigInt(1)
    || maximumPages < initialPages
    || maximumPages > WEB_MEMORY64_MAX_PAGES
  ) {
    throw new RangeError(
      `Invalid Memory64 module page bounds: initial=${initialPages}, maximum=${maximumPages}`,
    );
  }

  const funcType = (params: readonly number[], results: readonly number[]): number[] => [
    0x60,
    ...encodeUleb128_32(params.length),
    ...params,
    ...encodeUleb128_32(results.length),
    ...results,
  ];
  const typeSection = encodeSection(
    SEC.TYPE,
    encodeVector([
      funcType([VAL.I64, VAL.I64, VAL.I64], []),
      funcType([VAL.I64, VAL.I64, VAL.I64, VAL.I32], []),
      funcType(
        [
          VAL.I64, VAL.I64, VAL.I64,
          VAL.F32, VAL.F32, VAL.F32,
          VAL.I32, VAL.I32, VAL.I32, VAL.I32, VAL.I32,
        ],
        [VAL.I32],
      ),
    ]),
  );

  const importSection = encodeSection(
    SEC.IMPORT,
    encodeVector([
      [
        ...encodeUtf8Name("env"),
        ...encodeUtf8Name("memory"),
        0x02,
        WASM_MEMORY64_LIMITS_FLAG,
        ...encodeUleb128_64(initialPages),
        ...encodeUleb128_64(maximumPages),
      ],
    ]),
  );

  const functionSection = encodeSection(
    SEC.FUNCTION,
    encodeVector([[0x00], [0x01], [0x01], [0x02]]),
  );

  const exportFunc = (name: string, index: number): number[] => [
    ...encodeUtf8Name(name),
    0x00,
    ...encodeUleb128_32(index),
  ];
  const exportSection = encodeSection(
    SEC.EXPORT,
    encodeVector([
      exportFunc("applyTonalLut64", 0),
      exportFunc("compositeLayerSourceOver64", 1),
      exportFunc("compositeLayerMultiply64", 2),
      exportFunc("stampSoftBrushDab64", 3),
    ]),
  );

  const codeSection = encodeSection(
    SEC.CODE,
    encodeVector([
      buildApplyTonalLut64Body(),
      buildCompositeSourceOver64Body(),
      buildCompositeMultiply64Body(),
      buildStampSoftBrushDab64Body(),
    ]),
  );

  return new Uint8Array([
    ...WASM_MAGIC_AND_VERSION,
    ...typeSection,
    ...importSection,
    ...functionSection,
    ...exportSection,
    ...codeSection,
  ]);
}
