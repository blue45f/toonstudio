/**
 * WebAssembly 3.0 Memory64 (`i64`, 0x05 플래그) 및 Wasm32 (`i32`, 0x01 플래그)
 * 듀얼 모드 드로잉 코어 바이너리 인코더.
 *
 * 익스포트 커널 4종(동일 알고리즘을 i64 memory64 / i32 memory32 두 타깃으로 생성):
 * 1) `unsharpMixRgba(origPtr, blurPtr, outPtr, pixelCount, amountQ8, threshold) -> i32`
 * 2) `xorDeltaBytes(prevPtr, nextPtr, outPtr, byteLen) -> i32`
 * 3) `fnv1aChecksum(ptr, byteLen) -> i32`
 * 4) `blendRgbaLinear(dstPtr, srcPtr, pixelCount, ratioQ8) -> i32`
 */

import {
  STUDIO_WASM_PAGE_BYTES,
  STUDIO_WEB_MEMORY64_ADDRESS_LIMIT_BYTES,
  type StudioWasmAddressType,
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
  WASM_SEC as SEC,
  WASM_VAL as VAL,
} from "../kernel/wasm64-raster-leb128";

/** Memory64 limits flag (`0x01 has_max | 0x04 memory64 = 0x05`). */
export const WASM64_DRAWING_LIMITS_FLAG = WASM_MEMORY64_LIMITS_FLAG;

/** Memory32 limits flag (`0x01 has_max`). */
export const WASM32_DRAWING_LIMITS_FLAG = 0x01;

const WEB_MEMORY64_MAX_PAGES =
  STUDIO_WEB_MEMORY64_ADDRESS_LIMIT_BYTES / STUDIO_WASM_PAGE_BYTES;
const WASM32_MAX_PAGES = BigInt(65536);

const OP = {
  BLOCK: 0x02,
  LOOP: 0x03,
  IF: 0x04,
  ELSE: 0x05,
  END: 0x0b,
  BR: 0x0c,
  BR_IF: 0x0d,
  RETURN: 0x0f,
  LOCAL_GET: 0x20,
  LOCAL_SET: 0x21,
  LOCAL_TEE: 0x22,
  I32_LOAD8_U: 0x2d,
  I32_STORE8: 0x3a,
  I32_CONST: 0x41,
  I64_CONST: 0x42,
  I32_EQZ: 0x45,
  I32_NE: 0x47,
  I32_LT_S: 0x48,
  I32_GT_S: 0x4a,
  I32_GE_S: 0x4e,
  I32_GE_U: 0x4f,
  I64_EQZ: 0x50,
  I64_GE_U: 0x5a,
  I32_ADD: 0x6a,
  I32_SUB: 0x6b,
  I32_MUL: 0x6c,
  I32_XOR: 0x73,
  I32_SHL: 0x74,
  I32_SHR_S: 0x75,
  I32_SHR_U: 0x76,
  I64_ADD: 0x7c,
  I64_SHL: 0x86,
} as const;

export interface WasmDrawingModuleBuildOptions {
  readonly initialPages?: bigint;
  readonly maximumPages?: bigint;
}

/** i64(memory64) / i32(memory32) 공용 바이트코드 빌더. */
class DualAddressWasmBuilder {
  private readonly code: number[] = [];
  private readonly is64: boolean;

  constructor(addressType: StudioWasmAddressType) {
    this.is64 = addressType === "i64";
  }

  op(opcode: number): this {
    this.code.push(opcode);
    return this;
  }

  localGet(idx: number): this {
    this.code.push(OP.LOCAL_GET, ...encodeUleb128_32(idx));
    return this;
  }

  localSet(idx: number): this {
    this.code.push(OP.LOCAL_SET, ...encodeUleb128_32(idx));
    return this;
  }

  localTee(idx: number): this {
    this.code.push(OP.LOCAL_TEE, ...encodeUleb128_32(idx));
    return this;
  }

  i32Const(val: number): this {
    this.code.push(OP.I32_CONST, ...encodeSleb128_32(val));
    return this;
  }

  ptrConst(val: number): this {
    if (this.is64) {
      this.code.push(OP.I64_CONST, ...encodeSleb128_64(BigInt(val)));
    } else {
      this.code.push(OP.I32_CONST, ...encodeSleb128_32(val));
    }
    return this;
  }

  ptrAdd(): this {
    this.code.push(this.is64 ? OP.I64_ADD : OP.I32_ADD);
    return this;
  }

  ptrShl(): this {
    this.code.push(this.is64 ? OP.I64_SHL : OP.I32_SHL);
    return this;
  }

  ptrEqz(): this {
    this.code.push(this.is64 ? OP.I64_EQZ : OP.I32_EQZ);
    return this;
  }

  ptrGeU(): this {
    this.code.push(this.is64 ? OP.I64_GE_U : OP.I32_GE_U);
    return this;
  }

  load8U(offset: number): this {
    const encodedOffset = this.is64
      ? encodeUleb128_64(BigInt(offset))
      : encodeUleb128_32(offset);
    this.code.push(OP.I32_LOAD8_U, 0x00, ...encodedOffset);
    return this;
  }

  store8(offset: number): this {
    const encodedOffset = this.is64
      ? encodeUleb128_64(BigInt(offset))
      : encodeUleb128_32(offset);
    this.code.push(OP.I32_STORE8, 0x00, ...encodedOffset);
    return this;
  }

  block(): this {
    this.code.push(OP.BLOCK, VAL.VOID);
    return this;
  }

  loop(): this {
    this.code.push(OP.LOOP, VAL.VOID);
    return this;
  }

  ifVoid(): this {
    this.code.push(OP.IF, VAL.VOID);
    return this;
  }

  elseBranch(): this {
    this.code.push(OP.ELSE);
    return this;
  }

  end(): this {
    this.code.push(OP.END);
    return this;
  }

  br(depth: number): this {
    this.code.push(OP.BR, ...encodeUleb128_32(depth));
    return this;
  }

  brIf(depth: number): this {
    this.code.push(OP.BR_IF, ...encodeUleb128_32(depth));
    return this;
  }

  build(localGroups: ReadonlyArray<readonly [number, number]>): number[] {
    const localsPayload = encodeVector(
      localGroups.map(([count, type]) => [...encodeUleb128_32(count), type]),
    );
    const body = [...localsPayload, ...this.code, OP.END];
    return [...encodeUleb128_32(body.length), ...body];
  }
}

function buildUnsharpMixRgbaBody(addressType: StudioWasmAddressType): number[] {
  const ptrVal = addressType === "i64" ? VAL.I64 : VAL.I32;
  const L = {
    origPtr: 0, blurPtr: 1, outPtr: 2, pixelCount: 3, amountQ8: 4, threshold: 5,
    i: 6, end: 7,
    oVal: 8, bVal: 9, diff: 10, absDiff: 11, val: 12, modified: 13, pixelChanged: 14,
  };
  const b = new DualAddressWasmBuilder(addressType);

  b.localGet(L.pixelCount).ptrEqz().ifVoid().i32Const(0).op(OP.RETURN).end();
  b.ptrConst(0).localSet(L.i);
  b.localGet(L.pixelCount).ptrConst(2).ptrShl().localSet(L.end);
  b.i32Const(0).localSet(L.modified);

  b.block().loop();
  b.localGet(L.i).localGet(L.end).ptrGeU().brIf(1);
  b.i32Const(0).localSet(L.pixelChanged);

  for (let ch = 0; ch < 3; ch += 1) {
    b.localGet(L.origPtr).localGet(L.i).ptrAdd().load8U(ch).localSet(L.oVal);
    b.localGet(L.blurPtr).localGet(L.i).ptrAdd().load8U(ch).localSet(L.bVal);
    b.localGet(L.oVal).localGet(L.bVal).op(OP.I32_SUB).localSet(L.diff);

    b.localGet(L.diff).i32Const(0).op(OP.I32_LT_S).ifVoid()
      .i32Const(0).localGet(L.diff).op(OP.I32_SUB).localSet(L.absDiff)
      .elseBranch()
      .localGet(L.diff).localSet(L.absDiff)
      .end();

    b.localGet(L.absDiff).localGet(L.threshold).op(OP.I32_GE_S).ifVoid()
      .localGet(L.oVal)
      .localGet(L.diff).localGet(L.amountQ8).op(OP.I32_MUL)
      .i32Const(8).op(OP.I32_SHR_S)
      .op(OP.I32_ADD).localSet(L.val)
      .localGet(L.val).i32Const(0).op(OP.I32_LT_S).ifVoid()
      .i32Const(0).localSet(L.val)
      .end()
      .localGet(L.val).i32Const(255).op(OP.I32_GT_S).ifVoid()
      .i32Const(255).localSet(L.val)
      .end()
      .localGet(L.val).localGet(L.oVal).op(OP.I32_NE).ifVoid()
      .i32Const(1).localSet(L.pixelChanged)
      .end()
      .elseBranch()
      .localGet(L.oVal).localSet(L.val)
      .end();

    b.localGet(L.outPtr).localGet(L.i).ptrAdd().localGet(L.val).store8(ch);
  }

  // 알파 채널 보존
  b.localGet(L.outPtr).localGet(L.i).ptrAdd()
    .localGet(L.origPtr).localGet(L.i).ptrAdd().load8U(3)
    .store8(3);

  b.localGet(L.modified).localGet(L.pixelChanged).op(OP.I32_ADD).localSet(L.modified);
  b.localGet(L.i).ptrConst(4).ptrAdd().localSet(L.i);
  b.br(0).end().end();

  b.localGet(L.modified);
  return b.build([[2, ptrVal], [7, VAL.I32]]);
}

function buildXorDeltaBytesBody(addressType: StudioWasmAddressType): number[] {
  const ptrVal = addressType === "i64" ? VAL.I64 : VAL.I32;
  const L = { prevPtr: 0, nextPtr: 1, outPtr: 2, byteLen: 3, i: 4, xVal: 5, changed: 6 };
  const b = new DualAddressWasmBuilder(addressType);

  b.localGet(L.byteLen).ptrEqz().ifVoid().i32Const(0).op(OP.RETURN).end();
  b.ptrConst(0).localSet(L.i);
  b.i32Const(0).localSet(L.changed);

  b.block().loop();
  b.localGet(L.i).localGet(L.byteLen).ptrGeU().brIf(1);

  b.localGet(L.prevPtr).localGet(L.i).ptrAdd().load8U(0)
    .localGet(L.nextPtr).localGet(L.i).ptrAdd().load8U(0)
    .op(OP.I32_XOR).localSet(L.xVal);

  b.localGet(L.outPtr).localGet(L.i).ptrAdd().localGet(L.xVal).store8(0);

  b.localGet(L.xVal).i32Const(0).op(OP.I32_NE).ifVoid()
    .localGet(L.changed).i32Const(1).op(OP.I32_ADD).localSet(L.changed)
    .end();

  b.localGet(L.i).ptrConst(1).ptrAdd().localSet(L.i);
  b.br(0).end().end();

  b.localGet(L.changed);
  return b.build([[1, ptrVal], [2, VAL.I32]]);
}

function buildFnv1aChecksumBody(addressType: StudioWasmAddressType): number[] {
  const ptrVal = addressType === "i64" ? VAL.I64 : VAL.I32;
  const L = { ptr: 0, byteLen: 1, i: 2, hash: 3 };
  const b = new DualAddressWasmBuilder(addressType);

  // 0x811c9dc5 as signed i32 = -2128831035
  b.i32Const(-2128831035).localSet(L.hash);
  b.ptrConst(0).localSet(L.i);

  b.block().loop();
  b.localGet(L.i).localGet(L.byteLen).ptrGeU().brIf(1);
  b.localGet(L.hash)
    .localGet(L.ptr).localGet(L.i).ptrAdd().load8U(0)
    .op(OP.I32_XOR)
    .i32Const(16777619)
    .op(OP.I32_MUL)
    .localSet(L.hash);
  b.localGet(L.i).ptrConst(1).ptrAdd().localSet(L.i);
  b.br(0).end().end();

  b.localGet(L.hash);
  return b.build([[1, ptrVal], [1, VAL.I32]]);
}

function buildBlendRgbaLinearBody(addressType: StudioWasmAddressType): number[] {
  const ptrVal = addressType === "i64" ? VAL.I64 : VAL.I32;
  const L = {
    dstPtr: 0, srcPtr: 1, pixelCount: 2, ratioQ8: 3,
    i: 4, end: 5,
    rClamped: 6, invR: 7, count: 8,
  };
  const b = new DualAddressWasmBuilder(addressType);

  b.localGet(L.pixelCount).ptrEqz().ifVoid().i32Const(0).op(OP.RETURN).end();

  b.localGet(L.ratioQ8).i32Const(0).op(OP.I32_LT_S).ifVoid()
    .i32Const(0).localSet(L.rClamped)
    .elseBranch()
    .localGet(L.ratioQ8).i32Const(256).op(OP.I32_GT_S).ifVoid()
    .i32Const(256).localSet(L.rClamped)
    .elseBranch()
    .localGet(L.ratioQ8).localSet(L.rClamped)
    .end()
    .end();

  b.i32Const(256).localGet(L.rClamped).op(OP.I32_SUB).localSet(L.invR);
  b.ptrConst(0).localSet(L.i);
  b.localGet(L.pixelCount).ptrConst(2).ptrShl().localSet(L.end);
  b.i32Const(0).localSet(L.count);

  b.block().loop();
  b.localGet(L.i).localGet(L.end).ptrGeU().brIf(1);

  for (let ch = 0; ch < 4; ch += 1) {
    b.localGet(L.dstPtr).localGet(L.i).ptrAdd()
      .localGet(L.dstPtr).localGet(L.i).ptrAdd().load8U(ch).localGet(L.invR).op(OP.I32_MUL)
      .localGet(L.srcPtr).localGet(L.i).ptrAdd().load8U(ch).localGet(L.rClamped).op(OP.I32_MUL)
      .op(OP.I32_ADD)
      .i32Const(128).op(OP.I32_ADD)
      .i32Const(8).op(OP.I32_SHR_U)
      .store8(ch);
  }

  b.localGet(L.count).i32Const(1).op(OP.I32_ADD).localSet(L.count);
  b.localGet(L.i).ptrConst(4).ptrAdd().localSet(L.i);
  b.br(0).end().end();

  b.localGet(L.count);
  return b.build([[2, ptrVal], [3, VAL.I32]]);
}

/**
 * 지정된 주소 모드(`i64` memory64 또는 `i32` memory32)용 실실행 WebAssembly 바이너리 모듈을 생성한다.
 */
export function buildWasmDrawingModuleBytes(
  addressType: StudioWasmAddressType,
  options: WasmDrawingModuleBuildOptions = {},
): Uint8Array<ArrayBuffer> {
  const is64 = addressType === "i64";
  const maxAllowed = is64 ? WEB_MEMORY64_MAX_PAGES : WASM32_MAX_PAGES;
  const initialPages = options.initialPages ?? BigInt(1);
  const maximumPages = options.maximumPages ?? (is64 ? BigInt(16384) : BigInt(4096));

  if (initialPages < BigInt(1) || maximumPages < initialPages || maximumPages > maxAllowed) {
    throw new RangeError(
      `Invalid ${addressType} module page bounds: initial=${initialPages}, maximum=${maximumPages}`,
    );
  }

  const ptrVal = is64 ? VAL.I64 : VAL.I32;
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
      funcType([ptrVal, ptrVal, ptrVal, ptrVal, VAL.I32, VAL.I32], [VAL.I32]),
      funcType([ptrVal, ptrVal, ptrVal, ptrVal], [VAL.I32]),
      funcType([ptrVal, ptrVal], [VAL.I32]),
      funcType([ptrVal, ptrVal, ptrVal, VAL.I32], [VAL.I32]),
    ]),
  );

  const limitsFlag = is64 ? WASM64_DRAWING_LIMITS_FLAG : WASM32_DRAWING_LIMITS_FLAG;
  const encodedLimits = is64
    ? [...encodeUleb128_64(initialPages), ...encodeUleb128_64(maximumPages)]
    : [...encodeUleb128_32(Number(initialPages)), ...encodeUleb128_32(Number(maximumPages))];

  const importSection = encodeSection(
    SEC.IMPORT,
    encodeVector([
      [
        ...encodeUtf8Name("env"),
        ...encodeUtf8Name("memory"),
        0x02,
        limitsFlag,
        ...encodedLimits,
      ],
    ]),
  );

  const functionSection = encodeSection(
    SEC.FUNCTION,
    encodeVector([[0x00], [0x01], [0x02], [0x03]]),
  );

  const exportFunc = (name: string, index: number): number[] => [
    ...encodeUtf8Name(name),
    0x00,
    ...encodeUleb128_32(index),
  ];
  const exportSection = encodeSection(
    SEC.EXPORT,
    encodeVector([
      exportFunc("unsharpMixRgba", 0),
      exportFunc("xorDeltaBytes", 1),
      exportFunc("fnv1aChecksum", 2),
      exportFunc("blendRgbaLinear", 3),
    ]),
  );

  const codeSection = encodeSection(
    SEC.CODE,
    encodeVector([
      buildUnsharpMixRgbaBody(addressType),
      buildXorDeltaBytesBody(addressType),
      buildFnv1aChecksumBody(addressType),
      buildBlendRgbaLinearBody(addressType),
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
