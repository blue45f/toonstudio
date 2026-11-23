/**
 * 실제 실행 가능한 표준 Wasm32 스칼라 및 Wasm SIMD128(`v128`) RGBA 픽셀 커널
 * 바이너리 인코더와 41바이트 SIMD128 프로브 상수.
 *
 * - 외부 툴체인 없이 순수 LEB128·섹션 인코더로 유효한 WebAssembly 바이너리를 생성한다.
 * - 모든 모듈은 `env.memory` 선형 메모리를 import하고 6종 픽셀 커널을 export한다.
 */

const WASM_MAGIC_AND_VERSION = [
  0x00, 0x61, 0x73, 0x6d,
  0x01, 0x00, 0x00, 0x00,
] as const;

export const WASM_PAGE_BYTES = 65_536;
export const WASM_MAX_PAGES = 64; // 4 MiB 상주 워킹셋 (초대형 캔버스는 청크 슬라이스로 안전 처리)

const SEC_TYPE = 0x01;
const SEC_IMPORT = 0x02;
const SEC_FUNCTION = 0x03;
const SEC_EXPORT = 0x07;
const SEC_CODE = 0x0a;

const VAL_VOID = 0x40;
const VAL_I32 = 0x7f;
const VAL_V128 = 0x7b;

const OP = {
  BLOCK: 0x02,
  LOOP: 0x03,
  IF: 0x04,
  ELSE: 0x05,
  END: 0x0b,
  BR: 0x0c,
  BR_IF: 0x0d,
  SELECT: 0x1b,
  LOCAL_GET: 0x20,
  LOCAL_SET: 0x21,
  LOCAL_TEE: 0x22,
  I32_LOAD8_U: 0x2d,
  I32_STORE8: 0x3a,
  I32_CONST: 0x41,
  I32_LT_S: 0x48,
  I32_GT_S: 0x4a,
  I32_GE_U: 0x4f,
  I32_POPCNT: 0x69,
  I32_ADD: 0x6a,
  I32_SUB: 0x6b,
  I32_MUL: 0x6c,
  I32_AND: 0x71,
  I32_SHL: 0x74,
  I32_SHR_S: 0x75,
  I32_SHR_U: 0x76,
  SIMD_PREFIX: 0xfd,
} as const;

// Wasm 2.0 Fixed-Width SIMD128 명령어 (0xfd 프리픽스 뒤 uleb128 오프코드)
const SIMD = {
  V128_LOAD: 0x00,
  V128_STORE: 0x0b,
  V128_CONST: 0x0c,
  I32X4_SPLAT: 0x11,
  I32X4_GE_U: 0x40,
  V128_AND: 0x4e,
  V128_OR: 0x50,
  V128_XOR: 0x51,
  I32X4_BITMASK: 0xa4,
  I32X4_SHL: 0xab,
  I32X4_SHR_S: 0xac,
  I32X4_SHR_U: 0xad,
  I32X4_ADD: 0xae,
  I32X4_SUB: 0xb1,
  I32X4_MUL: 0xb5,
  I32X4_MIN_S: 0xb6,
  I32X4_MAX_S: 0xb8,
} as const;

export type WasmPixelKernelMode =
  | "invert"
  | "luma"
  | "contrast"
  | "threshold"
  | "alpha-mask-count"
  | "alpha-threshold";

export type WasmKernelExportName =
  | "invert_rgba"
  | "luma_rgba"
  | "contrast_rgba"
  | "threshold_rgba"
  | "alpha_mask_count"
  | "alpha_threshold_rgba";

export const WASM_KERNEL_EXPORT_SPECS: readonly {
  readonly mode: WasmPixelKernelMode;
  readonly exportName: WasmKernelExportName;
}[] = [
  { mode: "invert", exportName: "invert_rgba" },
  { mode: "luma", exportName: "luma_rgba" },
  { mode: "contrast", exportName: "contrast_rgba" },
  { mode: "threshold", exportName: "threshold_rgba" },
  { mode: "alpha-mask-count", exportName: "alpha_mask_count" },
  { mode: "alpha-threshold", exportName: "alpha_threshold_rgba" },
];

/**
 * 표준 41바이트 Wasm SIMD128(`v128.const`) 프로브 바이너리:
 * `(module (global (export "sim") v128 (v128.const i32x4 0 0 0 0)))`
 */
export const WASM_SIMD128_PROBE_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x06, 0x16, 0x01, 0x7b, 0x00,
  0xfd, 0x0c,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x0b,
  0x07, 0x07, 0x01, 0x03, 0x73, 0x69, 0x6d, 0x03, 0x00,
]);

/**
 * 함수 본문 내 `v128.const` 실행 경로를 함께 검증하는 43바이트 표준 SIMD128 프로브:
 * `(module (func (result v128) (v128.const i32x4 0 0 0 0)))`
 */
export const WASM_SIMD128_FUNC_PROBE_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x16, 0x01, 0x14, 0x00,
  0xfd, 0x0c,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x0b,
]);

function encodeUleb32(value: number): number[] {
  let remaining = value >>> 0;
  const out: number[] = [];
  do {
    let byte = remaining & 0x7f;
    remaining >>>= 7;
    if (remaining !== 0) byte |= 0x80;
    out.push(byte);
  } while (remaining !== 0);
  return out;
}

function encodeSleb32(value: number): number[] {
  let remaining = value | 0;
  const out: number[] = [];
  for (;;) {
    let byte = remaining & 0x7f;
    remaining >>= 7;
    const signBit = (byte & 0x40) !== 0;
    const done = (remaining === 0 && !signBit) || (remaining === -1 && signBit);
    if (!done) byte |= 0x80;
    out.push(byte);
    if (done) break;
  }
  return out;
}

function encodeAscii(name: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < name.length; i += 1) {
    bytes.push(name.charCodeAt(i) & 0x7f);
  }
  return [...encodeUleb32(bytes.length), ...bytes];
}

function encodeSection(sectionId: number, payload: readonly number[]): number[] {
  return [sectionId, ...encodeUleb32(payload.length), ...payload];
}

function encodeVector(items: readonly (readonly number[])[]): number[] {
  const out = encodeUleb32(items.length);
  for (const item of items) {
    for (let i = 0; i < item.length; i += 1) {
      out.push(item[i] ?? 0);
    }
  }
  return out;
}

function simdOp(opcode: number): number[] {
  return [OP.SIMD_PREFIX, ...encodeUleb32(opcode)];
}

function i32Const(value: number): number[] {
  return [OP.I32_CONST, ...encodeSleb32(value)];
}

function localGet(idx: number): number[] {
  return [OP.LOCAL_GET, ...encodeUleb32(idx)];
}

function localSet(idx: number): number[] {
  return [OP.LOCAL_SET, ...encodeUleb32(idx)];
}

function localTee(idx: number): number[] {
  return [OP.LOCAL_TEE, ...encodeUleb32(idx)];
}

function loadU8(offset: number): number[] {
  return [OP.I32_LOAD8_U, 0x00, ...encodeUleb32(offset)];
}

function storeU8(offset: number): number[] {
  return [OP.I32_STORE8, 0x00, ...encodeUleb32(offset)];
}

function emitScalarLumaCalc(ptrIdx: number, rIdx: number, gIdx: number, bIdx: number): number[] {
  return [
    ...localGet(ptrIdx), ...loadU8(0), ...localTee(rIdx), ...i32Const(54), OP.I32_MUL,
    ...localGet(ptrIdx), ...loadU8(1), ...localTee(gIdx), ...i32Const(183), OP.I32_MUL, OP.I32_ADD,
    ...localGet(ptrIdx), ...loadU8(2), ...localTee(bIdx), ...i32Const(19), OP.I32_MUL, OP.I32_ADD,
    ...i32Const(128), OP.I32_ADD,
    ...i32Const(8), OP.I32_SHR_U,
  ];
}

function emitScalarContrastChannel(ptrIdx: number, offset: number, factorIdx: number, outIdx: number): number[] {
  return [
    ...localGet(ptrIdx), ...loadU8(offset),
    ...i32Const(128), OP.I32_SUB,
    ...localGet(factorIdx), OP.I32_MUL,
    ...i32Const(7), OP.I32_SHR_S,
    ...i32Const(128), OP.I32_ADD,
    ...localTee(outIdx),
    ...i32Const(0), OP.I32_LT_S,
    OP.IF, VAL_VOID,
      ...i32Const(0), ...localSet(outIdx),
    OP.ELSE,
      ...localGet(outIdx), ...i32Const(255), OP.I32_GT_S,
      OP.IF, VAL_VOID,
        ...i32Const(255), ...localSet(outIdx),
      OP.END,
    OP.END,
    ...localGet(ptrIdx), ...localGet(outIdx), ...storeU8(offset),
  ];
}

function emitScalarTailLoop(mode: WasmPixelKernelMode, endIdx: number, countIdx: number): number[] {
  const ptr = 0;
  const param = 2;
  const r = 5;
  const g = 6;
  const b = 7;
  const tmp = 8;

  const body: number[] = [];
  if (mode === "invert") {
    body.push(
      ...localGet(ptr), ...i32Const(255), ...localGet(ptr), ...loadU8(0), OP.I32_SUB, ...storeU8(0),
      ...localGet(ptr), ...i32Const(255), ...localGet(ptr), ...loadU8(1), OP.I32_SUB, ...storeU8(1),
      ...localGet(ptr), ...i32Const(255), ...localGet(ptr), ...loadU8(2), OP.I32_SUB, ...storeU8(2),
      ...localGet(countIdx),
      ...localGet(ptr), ...loadU8(3), ...localGet(param), OP.I32_GE_U,
      OP.I32_ADD, ...localSet(countIdx),
    );
  } else if (mode === "luma") {
    body.push(
      ...emitScalarLumaCalc(ptr, r, g, b), ...localSet(tmp),
      ...localGet(ptr), ...localGet(tmp), ...storeU8(0),
      ...localGet(ptr), ...localGet(tmp), ...storeU8(1),
      ...localGet(ptr), ...localGet(tmp), ...storeU8(2),
      ...localGet(countIdx),
      ...localGet(tmp), ...localGet(param), OP.I32_GE_U,
      OP.I32_ADD, ...localSet(countIdx),
    );
  } else if (mode === "contrast") {
    body.push(
      ...emitScalarContrastChannel(ptr, 0, param, r),
      ...emitScalarContrastChannel(ptr, 1, param, g),
      ...emitScalarContrastChannel(ptr, 2, param, b),
      ...localGet(r), ...i32Const(54), OP.I32_MUL,
      ...localGet(g), ...i32Const(183), OP.I32_MUL, OP.I32_ADD,
      ...localGet(b), ...i32Const(19), OP.I32_MUL, OP.I32_ADD,
      ...i32Const(128), OP.I32_ADD, ...i32Const(8), OP.I32_SHR_U,
      ...i32Const(128), OP.I32_GE_U,
      ...localGet(countIdx), OP.I32_ADD, ...localSet(countIdx),
    );
  } else if (mode === "threshold") {
    body.push(
      ...emitScalarLumaCalc(ptr, r, g, b),
      ...localGet(param), OP.I32_GE_U, ...localTee(tmp),
      ...localGet(countIdx), OP.I32_ADD, ...localSet(countIdx),
      ...i32Const(255), ...i32Const(0), ...localGet(tmp), OP.SELECT, ...localSet(r),
      ...localGet(ptr), ...localGet(r), ...storeU8(0),
      ...localGet(ptr), ...localGet(r), ...storeU8(1),
      ...localGet(ptr), ...localGet(r), ...storeU8(2),
    );
  } else if (mode === "alpha-mask-count") {
    body.push(
      ...localGet(countIdx),
      ...localGet(ptr), ...loadU8(3), ...localGet(param), OP.I32_GE_U,
      OP.I32_ADD, ...localSet(countIdx),
    );
  } else {
    body.push(
      ...localGet(ptr), ...loadU8(3), ...localGet(param), OP.I32_GE_U, ...localTee(tmp),
      ...localGet(countIdx), OP.I32_ADD, ...localSet(countIdx),
      ...localGet(ptr),
      ...i32Const(255), ...i32Const(0), ...localGet(tmp), OP.SELECT,
      ...storeU8(3),
    );
  }

  return [
    OP.BLOCK, VAL_VOID,
      OP.LOOP, VAL_VOID,
        ...localGet(ptr), ...localGet(endIdx), OP.I32_GE_U, OP.BR_IF, 1,
        ...body,
        ...localGet(ptr), ...i32Const(4), OP.I32_ADD, ...localSet(ptr),
        OP.BR, 0,
      OP.END,
    OP.END,
  ];
}

function buildScalarFunctionBody(mode: WasmPixelKernelMode): number[] {
  const code = [
    ...localGet(0), ...localGet(1), ...i32Const(2), OP.I32_SHL, OP.I32_ADD, ...localSet(3),
    ...emitScalarTailLoop(mode, 3, 4),
    ...localGet(4),
    OP.END,
  ];
  const full = [...encodeVector([[6, VAL_I32]]), ...code];
  return [...encodeUleb32(full.length), ...full];
}

function emitSimdContrastLane(
  shiftedSrc: number[],
  vMaskFF: number,
  v128: number,
  vFactor: number,
  vZero: number,
  v255: number,
  outLocal: number,
): number[] {
  return [
    ...shiftedSrc,
    ...localGet(vMaskFF), ...simdOp(SIMD.V128_AND),
    ...localGet(v128), ...simdOp(SIMD.I32X4_SUB),
    ...localGet(vFactor), ...simdOp(SIMD.I32X4_MUL),
    ...i32Const(7), ...simdOp(SIMD.I32X4_SHR_S),
    ...localGet(v128), ...simdOp(SIMD.I32X4_ADD),
    ...localGet(vZero), ...simdOp(SIMD.I32X4_MAX_S),
    ...localGet(v255), ...simdOp(SIMD.I32X4_MIN_S),
    ...localSet(outLocal),
  ];
}

function emitSimdLumaFromPixels(
  vPix: number,
  vMaskFF: number,
  vW54: number,
  vW183: number,
  vW19: number,
  v128: number,
): number[] {
  return [
    ...localGet(vPix), ...localGet(vMaskFF), ...simdOp(SIMD.V128_AND),
    ...localGet(vW54), ...simdOp(SIMD.I32X4_MUL),

    ...localGet(vPix), ...i32Const(8), ...simdOp(SIMD.I32X4_SHR_U),
    ...localGet(vMaskFF), ...simdOp(SIMD.V128_AND),
    ...localGet(vW183), ...simdOp(SIMD.I32X4_MUL),
    ...simdOp(SIMD.I32X4_ADD),

    ...localGet(vPix), ...i32Const(16), ...simdOp(SIMD.I32X4_SHR_U),
    ...localGet(vMaskFF), ...simdOp(SIMD.V128_AND),
    ...localGet(vW19), ...simdOp(SIMD.I32X4_MUL),
    ...simdOp(SIMD.I32X4_ADD),

    ...localGet(v128), ...simdOp(SIMD.I32X4_ADD),
    ...i32Const(8), ...simdOp(SIMD.I32X4_SHR_U),
  ];
}

function buildSimdFunctionBody(mode: WasmPixelKernelMode): number[] {
  const ptr = 0;
  const pixelCount = 1;
  const param = 2;
  const endPtr = 3;
  const count = 4;
  const vecEnd = 9;

  const vPix = 10;
  const vParam = 11;
  const vMaskFF = 12;
  const vAlphaMask = 13;
  const vRgbMask = 14;
  const vW54 = 15;
  const vW183 = 16;
  const vW19 = 17;
  const v128 = 18;
  const vPackRgb = 19;
  const vTmp0 = 20;
  const vTmp1 = 21;
  const vTmp2 = 22;
  const vTmp3 = 23;

  const setup: number[] = [
    ...localGet(ptr), ...localGet(pixelCount), ...i32Const(2), OP.I32_SHL, OP.I32_ADD, ...localSet(endPtr),
    ...localGet(ptr),
    ...localGet(pixelCount), ...i32Const(-4), OP.I32_AND, ...i32Const(2), OP.I32_SHL,
    OP.I32_ADD, ...localSet(vecEnd),
    ...localGet(param), ...simdOp(SIMD.I32X4_SPLAT), ...localSet(vParam),
    ...i32Const(0xff), ...simdOp(SIMD.I32X4_SPLAT), ...localSet(vMaskFF),
    ...i32Const(-16_777_216), ...simdOp(SIMD.I32X4_SPLAT), ...localSet(vAlphaMask),
    ...i32Const(0x00ff_ffff), ...simdOp(SIMD.I32X4_SPLAT), ...localSet(vRgbMask),
    ...i32Const(54), ...simdOp(SIMD.I32X4_SPLAT), ...localSet(vW54),
    ...i32Const(183), ...simdOp(SIMD.I32X4_SPLAT), ...localSet(vW183),
    ...i32Const(19), ...simdOp(SIMD.I32X4_SPLAT), ...localSet(vW19),
    ...i32Const(128), ...simdOp(SIMD.I32X4_SPLAT), ...localSet(v128),
    ...i32Const(0x0001_0101), ...simdOp(SIMD.I32X4_SPLAT), ...localSet(vPackRgb),
  ];

  const vecBody: number[] = [];
  if (mode === "invert") {
    const invertXorMask = [
      255, 255, 255, 0, 255, 255, 255, 0,
      255, 255, 255, 0, 255, 255, 255, 0,
    ];
    vecBody.push(
      ...localGet(ptr), ...simdOp(SIMD.V128_LOAD), 0x00, 0x00, ...localTee(vPix),
      ...simdOp(SIMD.V128_CONST), ...invertXorMask,
      ...simdOp(SIMD.V128_XOR), ...localSet(vTmp0),
      ...localGet(ptr), ...localGet(vTmp0), ...simdOp(SIMD.V128_STORE), 0x00, 0x00,
      ...localGet(vPix), ...i32Const(24), ...simdOp(SIMD.I32X4_SHR_U),
      ...localGet(vParam), ...simdOp(SIMD.I32X4_GE_U),
      ...simdOp(SIMD.I32X4_BITMASK), OP.I32_POPCNT,
      ...localGet(count), OP.I32_ADD, ...localSet(count),
    );
  } else if (mode === "luma") {
    vecBody.push(
      ...localGet(ptr), ...simdOp(SIMD.V128_LOAD), 0x00, 0x00, ...localSet(vPix),
      ...emitSimdLumaFromPixels(vPix, vMaskFF, vW54, vW183, vW19, v128),
      ...localTee(vTmp0),
      ...localGet(vParam), ...simdOp(SIMD.I32X4_GE_U),
      ...simdOp(SIMD.I32X4_BITMASK), OP.I32_POPCNT,
      ...localGet(count), OP.I32_ADD, ...localSet(count),
      ...localGet(ptr),
      ...localGet(vTmp0), ...localGet(vPackRgb), ...simdOp(SIMD.I32X4_MUL),
      ...localGet(vPix), ...localGet(vAlphaMask), ...simdOp(SIMD.V128_AND),
      ...simdOp(SIMD.V128_OR),
      ...simdOp(SIMD.V128_STORE), 0x00, 0x00,
    );
  } else if (mode === "contrast") {
    setup.push(...i32Const(0), ...simdOp(SIMD.I32X4_SPLAT), ...localSet(vPackRgb));
    vecBody.push(
      ...localGet(ptr), ...simdOp(SIMD.V128_LOAD), 0x00, 0x00, ...localSet(vPix),
      ...emitSimdContrastLane(localGet(vPix), vMaskFF, v128, vParam, vPackRgb, vMaskFF, vTmp0),
      ...emitSimdContrastLane(
        [...localGet(vPix), ...i32Const(8), ...simdOp(SIMD.I32X4_SHR_U)],
        vMaskFF, v128, vParam, vPackRgb, vMaskFF, vTmp1,
      ),
      ...emitSimdContrastLane(
        [...localGet(vPix), ...i32Const(16), ...simdOp(SIMD.I32X4_SHR_U)],
        vMaskFF, v128, vParam, vPackRgb, vMaskFF, vTmp2,
      ),
      ...localGet(ptr),
      ...localGet(vTmp0),
      ...localGet(vTmp1), ...i32Const(8), ...simdOp(SIMD.I32X4_SHL), ...simdOp(SIMD.V128_OR),
      ...localGet(vTmp2), ...i32Const(16), ...simdOp(SIMD.I32X4_SHL), ...simdOp(SIMD.V128_OR),
      ...localGet(vPix), ...localGet(vAlphaMask), ...simdOp(SIMD.V128_AND), ...simdOp(SIMD.V128_OR),
      ...simdOp(SIMD.V128_STORE), 0x00, 0x00,
      ...localGet(vTmp0), ...localGet(vW54), ...simdOp(SIMD.I32X4_MUL),
      ...localGet(vTmp1), ...localGet(vW183), ...simdOp(SIMD.I32X4_MUL), ...simdOp(SIMD.I32X4_ADD),
      ...localGet(vTmp2), ...localGet(vW19), ...simdOp(SIMD.I32X4_MUL), ...simdOp(SIMD.I32X4_ADD),
      ...localGet(v128), ...simdOp(SIMD.I32X4_ADD), ...i32Const(8), ...simdOp(SIMD.I32X4_SHR_U),
      ...localGet(v128), ...simdOp(SIMD.I32X4_GE_U),
      ...simdOp(SIMD.I32X4_BITMASK), OP.I32_POPCNT,
      ...localGet(count), OP.I32_ADD, ...localSet(count),
    );
  } else if (mode === "threshold") {
    vecBody.push(
      ...localGet(ptr), ...simdOp(SIMD.V128_LOAD), 0x00, 0x00, ...localSet(vPix),
      ...emitSimdLumaFromPixels(vPix, vMaskFF, vW54, vW183, vW19, v128),
      ...localGet(vParam), ...simdOp(SIMD.I32X4_GE_U), ...localTee(vTmp0),
      ...simdOp(SIMD.I32X4_BITMASK), OP.I32_POPCNT,
      ...localGet(count), OP.I32_ADD, ...localSet(count),
      ...localGet(ptr),
      ...localGet(vTmp0), ...localGet(vRgbMask), ...simdOp(SIMD.V128_AND),
      ...localGet(vPix), ...localGet(vAlphaMask), ...simdOp(SIMD.V128_AND),
      ...simdOp(SIMD.V128_OR),
      ...simdOp(SIMD.V128_STORE), 0x00, 0x00,
    );
  } else if (mode === "alpha-mask-count") {
    vecBody.push(
      ...localGet(ptr), ...simdOp(SIMD.V128_LOAD), 0x00, 0x00,
      ...i32Const(24), ...simdOp(SIMD.I32X4_SHR_U),
      ...localGet(vParam), ...simdOp(SIMD.I32X4_GE_U),
      ...simdOp(SIMD.I32X4_BITMASK), OP.I32_POPCNT,
      ...localGet(count), OP.I32_ADD, ...localSet(count),
    );
  } else {
    vecBody.push(
      ...localGet(ptr), ...simdOp(SIMD.V128_LOAD), 0x00, 0x00, ...localTee(vPix),
      ...i32Const(24), ...simdOp(SIMD.I32X4_SHR_U),
      ...localGet(vParam), ...simdOp(SIMD.I32X4_GE_U), ...localTee(vTmp3),
      ...simdOp(SIMD.I32X4_BITMASK), OP.I32_POPCNT,
      ...localGet(count), OP.I32_ADD, ...localSet(count),
      ...localGet(ptr),
      ...localGet(vPix), ...localGet(vRgbMask), ...simdOp(SIMD.V128_AND),
      ...localGet(vTmp3), ...localGet(vAlphaMask), ...simdOp(SIMD.V128_AND),
      ...simdOp(SIMD.V128_OR),
      ...simdOp(SIMD.V128_STORE), 0x00, 0x00,
    );
  }

  const code = [
    ...setup,
    OP.BLOCK, VAL_VOID,
      OP.LOOP, VAL_VOID,
        ...localGet(ptr), ...localGet(vecEnd), OP.I32_GE_U, OP.BR_IF, 1,
        ...vecBody,
        ...localGet(ptr), ...i32Const(16), OP.I32_ADD, ...localSet(ptr),
        OP.BR, 0,
      OP.END,
    OP.END,
    ...emitScalarTailLoop(mode, endPtr, count),
    ...localGet(count),
    OP.END,
  ];
  const full = [...encodeVector([[7, VAL_I32], [14, VAL_V128]]), ...code];
  return [...encodeUleb32(full.length), ...full];
}

function buildPixelKernelModuleBytes(useSimd: boolean): Uint8Array<ArrayBuffer> {
  const typeSection = encodeSection(
    SEC_TYPE,
    encodeVector([[0x60, 0x03, VAL_I32, VAL_I32, VAL_I32, 0x01, VAL_I32]]),
  );
  const importSection = encodeSection(
    SEC_IMPORT,
    encodeVector([[
      ...encodeAscii("env"),
      ...encodeAscii("memory"),
      0x02,
      0x01,
      ...encodeUleb32(1),
      ...encodeUleb32(WASM_MAX_PAGES),
    ]]),
  );
  const funcSection = encodeSection(
    SEC_FUNCTION,
    encodeVector(WASM_KERNEL_EXPORT_SPECS.map(() => [0x00])),
  );
  const exportSection = encodeSection(
    SEC_EXPORT,
    encodeVector(
      WASM_KERNEL_EXPORT_SPECS.map((spec, idx) => [
        ...encodeAscii(spec.exportName),
        0x00,
        ...encodeUleb32(idx),
      ]),
    ),
  );
  const codeSection = encodeSection(
    SEC_CODE,
    encodeVector(
      WASM_KERNEL_EXPORT_SPECS.map((spec) =>
        useSimd ? buildSimdFunctionBody(spec.mode) : buildScalarFunctionBody(spec.mode),
      ),
    ),
  );

  return new Uint8Array([
    ...WASM_MAGIC_AND_VERSION,
    ...typeSection,
    ...importSection,
    ...funcSection,
    ...exportSection,
    ...codeSection,
  ]);
}

/**
 * 실제 실행 가능한 표준 Wasm32 스칼라 RGBA 픽셀 커널 모듈 바이너리.
 */
export const WASM_PIXEL_LUMA_INVERT_BYTES: Uint8Array<ArrayBuffer> = buildPixelKernelModuleBytes(false);

/**
 * 실제 실행 가능한 Wasm SIMD128(`v128`) 벡터화 RGBA 픽셀 커널 모듈 바이너리.
 */
export const WASM_PIXEL_SIMD128_BYTES: Uint8Array<ArrayBuffer> = buildPixelKernelModuleBytes(true);
