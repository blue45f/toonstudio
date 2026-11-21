/**
 * WebAssembly 3.0 Memory64 (`i64`) LEB128 인코더 · 섹션 프레임 · 바이트코드 빌더 프리미티브.
 */

export const WASM_MAGIC_AND_VERSION = [
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
] as const;

/** Memory64 limits flag: 0x01 (has maximum) | 0x04 (i64 memory64) = 0x05 */
export const WASM_MEMORY64_LIMITS_FLAG = 0x05;

export const WASM_SEC = {
  TYPE: 0x01,
  IMPORT: 0x02,
  FUNCTION: 0x03,
  EXPORT: 0x07,
  CODE: 0x0a,
} as const;

export const WASM_VAL = {
  VOID: 0x40,
  I32: 0x7f,
  I64: 0x7e,
  F32: 0x7d,
} as const;

export const WASM_OP = {
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
  F32_CONST: 0x43,
  I32_EQZ: 0x45,
  I32_EQ: 0x46,
  I32_LT_S: 0x48,
  I32_GT_S: 0x4a,
  I32_LE_S: 0x4c,
  I32_GE_S: 0x4e,
  I64_EQZ: 0x50,
  I64_LT_S: 0x53,
  I64_LT_U: 0x54,
  I64_GT_S: 0x55,
  I64_LE_S: 0x57,
  I64_GE_S: 0x59,
  I64_GE_U: 0x5a,
  F32_LT: 0x5d,
  F32_LE: 0x5f,
  F32_GE: 0x60,
  I32_ADD: 0x6a,
  I32_SUB: 0x6b,
  I32_MUL: 0x6c,
  I32_DIV_U: 0x6e,
  I32_SHR_U: 0x76,
  I64_ADD: 0x7c,
  I64_MUL: 0x7e,
  I64_SHL: 0x86,
  F32_CEIL: 0x8d,
  F32_FLOOR: 0x8e,
  F32_SQRT: 0x91,
  F32_ADD: 0x92,
  F32_SUB: 0x93,
  F32_MUL: 0x94,
  F32_DIV: 0x95,
  F32_MIN: 0x96,
  F32_MAX: 0x97,
  I32_TRUNC_F32_S: 0xa8,
  I64_EXTEND_I32_S: 0xac,
  I64_EXTEND_I32_U: 0xad,
  I64_TRUNC_F32_S: 0xae,
  F32_CONVERT_I32_S: 0xb2,
  F32_CONVERT_I64_S: 0xb4,
} as const;

/** Unsigned 32-bit LEB128 encoding. */
export function encodeUleb128_32(value: number): number[] {
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

/** Unsigned 64-bit LEB128 encoding (required for Memory64 limits and memarg offsets). */
export function encodeUleb128_64(value: bigint): number[] {
  if (value < BigInt(0)) {
    throw new RangeError("Unsigned LEB128 requires a non-negative bigint");
  }
  let remaining = value;
  const out: number[] = [];
  const mask = BigInt(0x7f);
  const shift = BigInt(7);
  const zero = BigInt(0);
  do {
    let byte = Number(remaining & mask);
    remaining >>= shift;
    if (remaining !== zero) byte |= 0x80;
    out.push(byte);
  } while (remaining !== zero);
  return out;
}

/** Signed 32-bit LEB128 encoding. */
export function encodeSleb128_32(value: number): number[] {
  let remaining = value | 0;
  const out: number[] = [];
  while (true) {
    const byte = remaining & 0x7f;
    remaining >>= 7;
    const done =
      (remaining === 0 && (byte & 0x40) === 0)
      || (remaining === -1 && (byte & 0x40) !== 0);
    out.push(done ? byte : byte | 0x80);
    if (done) return out;
  }
}

/** Signed 64-bit LEB128 encoding. */
export function encodeSleb128_64(value: bigint): number[] {
  let remaining = value;
  const out: number[] = [];
  const mask = BigInt(0x7f);
  const shift = BigInt(7);
  const zero = BigInt(0);
  const negOne = BigInt(-1);
  while (true) {
    const byte = Number(remaining & mask);
    remaining >>= shift;
    const done =
      (remaining === zero && (byte & 0x40) === 0)
      || (remaining === negOne && (byte & 0x40) !== 0);
    out.push(done ? byte : byte | 0x80);
    if (done) return out;
  }
}

function encodeF32(value: number): number[] {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, value, true);
  return Array.from(new Uint8Array(buffer));
}

export function encodeUtf8Name(name: string): number[] {
  const bytes = new TextEncoder().encode(name);
  return [...encodeUleb128_32(bytes.length), ...bytes];
}

export function encodeVector(entries: readonly (readonly number[])[]): number[] {
  const out = encodeUleb128_32(entries.length);
  for (const entry of entries) {
    for (let i = 0; i < entry.length; i += 1) out.push(entry[i]!);
  }
  return out;
}

export function encodeSection(sectionId: number, payload: readonly number[]): number[] {
  return [sectionId, ...encodeUleb128_32(payload.length), ...payload];
}

/** Structured Memory64 bytecode emitter. */
export class WasmBodyBuilder {
  private readonly code: number[] = [];

  op(opcode: number): this {
    this.code.push(opcode);
    return this;
  }

  localGet(index: number): this {
    this.code.push(WASM_OP.LOCAL_GET, ...encodeUleb128_32(index));
    return this;
  }

  localSet(index: number): this {
    this.code.push(WASM_OP.LOCAL_SET, ...encodeUleb128_32(index));
    return this;
  }

  localTee(index: number): this {
    this.code.push(WASM_OP.LOCAL_TEE, ...encodeUleb128_32(index));
    return this;
  }

  i32Const(value: number): this {
    this.code.push(WASM_OP.I32_CONST, ...encodeSleb128_32(value));
    return this;
  }

  i64Const(value: bigint): this {
    this.code.push(WASM_OP.I64_CONST, ...encodeSleb128_64(value));
    return this;
  }

  f32Const(value: number): this {
    this.code.push(WASM_OP.F32_CONST, ...encodeF32(value));
    return this;
  }

  /** Memory64 byte load: address on stack is `i64`, offset is u64 LEB128. */
  load8U64(offset: bigint): this {
    this.code.push(WASM_OP.I32_LOAD8_U, 0x00, ...encodeUleb128_64(offset));
    return this;
  }

  /** Memory64 byte store: address on stack is `i64`, offset is u64 LEB128. */
  store8_64(offset: bigint): this {
    this.code.push(WASM_OP.I32_STORE8, 0x00, ...encodeUleb128_64(offset));
    return this;
  }

  block(): this {
    this.code.push(WASM_OP.BLOCK, WASM_VAL.VOID);
    return this;
  }

  loop(): this {
    this.code.push(WASM_OP.LOOP, WASM_VAL.VOID);
    return this;
  }

  ifVoid(): this {
    this.code.push(WASM_OP.IF, WASM_VAL.VOID);
    return this;
  }

  elseBranch(): this {
    this.code.push(WASM_OP.ELSE);
    return this;
  }

  end(): this {
    this.code.push(WASM_OP.END);
    return this;
  }

  br(depth: number): this {
    this.code.push(WASM_OP.BR, ...encodeUleb128_32(depth));
    return this;
  }

  brIf(depth: number): this {
    this.code.push(WASM_OP.BR_IF, ...encodeUleb128_32(depth));
    return this;
  }

  build(localGroups: ReadonlyArray<readonly [number, number]>): number[] {
    const localsPayload = encodeVector(
      localGroups.map(([count, type]) => [...encodeUleb128_32(count), type]),
    );
    const body = [...localsPayload, ...this.code, WASM_OP.END];
    return [...encodeUleb128_32(body.length), ...body];
  }
}
