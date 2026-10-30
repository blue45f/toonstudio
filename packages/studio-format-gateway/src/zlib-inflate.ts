/**
 * @file zlib-inflate.ts
 * @description RFC 1950(zlib) 래퍼와 RFC 1951(DEFLATE)을 해제하는 동기 해제기. 출력 크기를 호출자가 정한 상한으로 막고,
 * 손상된 입력은 예외(`ZlibInflateError`)로 끝나며 무한 반복하지 않는다.
 *
 * 쓰임: 플랫폼 `DecompressionStream`은 스트림을 만드는 비용이 커서 수만 개의 작은 블록(최대 수십 KB)을 풀 때 느리고,
 * 비동기라 호출 코드가 모두 async가 된다. 이 해제기는 의존성이 없고 어느 런타임에서나 같은 결과를 낸다.
 *
 * 근거: 공개된 형식 설명(RFC 1950/1951)만 따라 직접 썼다. 구현의 정확성은 Node의 zlib을 오라클로 삼아 압축 수준·전략·memLevel·창 크기(9, 12, 15)를
 * 바꿔 가며 무작위 입력의 왕복을 대조한 테스트(`__tests__/zlib-inflate.test.ts`)와, 길이·거리 심볼의 모든 조합과 zlib이 만들지 않는 스트림
 * (과다 구독·불완전한 부호·15비트 부호·반복 부호의 경계 …)을 비트 단위로 직접 써서 확인한 테스트(`__tests__/zlib-inflate-streams.test.ts`)가
 * 뒷받침한다. 거부 규칙(불완전한 부호는 길이 1짜리 하나일 때만 허용 등)은 zlib과 같다.
 *
 * 작업량 방어: 출력 상한과 기대 크기뿐 아니라 DEFLATE 블록 수 상한(`maxBlocks`)도 있다. 출력이 없는 빈 블록을 잔뜩 이은 스트림은 입력 바이트당
 * 허프만 표를 계속 새로 만들게 해(15비트 표는 1 MiB 입력에 수 초) 출력 상한만으로는 막지 못한다.
 */

export type ZlibInflateErrorCode = "header" | "dictionary" | "data" | "truncated" | "checksum" | "limit";

export class ZlibInflateError extends Error {
  constructor(
    message: string,
    readonly code: ZlibInflateErrorCode,
  ) {
    super(message);
    this.name = "ZlibInflateError";
  }
}

export interface ZlibInflateOptions {
  /** 출력 상한(바이트). 넘으면 `limit`으로 던진다. */
  readonly maxOutputBytes: number;
  /**
   * 정확히 이 크기의 출력을 기대한다. 주면 버퍼를 한 번에 만들고, 출력이 이보다 길면 `limit`, 짧으면 `data`로 던진다.
   * `maxOutputBytes`보다 클 수 없다.
   */
  readonly expectedBytes?: number;
  /** 끝의 Adler-32를 확인하지 않는다. 기본은 확인한다. */
  readonly skipChecksum?: boolean;
  /** DEFLATE 블록(블록 머리 하나) 수 상한. 넘으면 `limit`으로 던진다. 1 이상. 기본은 제한 없음. */
  readonly maxBlocks?: number;
}

export interface ZlibInflateResult {
  readonly output: Uint8Array;
  /** 입력에서 zlib 스트림이 차지한 바이트 수(헤더와 Adler-32 포함). */
  readonly consumedBytes: number;
  /** 읽은 DEFLATE 블록 수. */
  readonly blocks: number;
}

const LENGTH_BASE = Uint16Array.of(
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
);
const LENGTH_EXTRA = Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0);
const DISTANCE_BASE = Uint16Array.of(
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193,
  12289, 16385, 24577,
);
const DISTANCE_EXTRA = Uint8Array.of(
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
);
const CODE_LENGTH_ORDER = Uint8Array.of(16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15);

const MAX_CODE_BITS = 15;
const INITIAL_GROWTH_BYTES = 1 << 16;

/** 심볼 하나를 읽는 표. 항목 = (부호 길이 << 9) | 심볼, 인덱스는 스트림에서 먼저 나온 비트가 낮은 자리인 `bits`비트 값이다. */
interface DecodeTable {
  readonly entries: Uint16Array;
  readonly bits: number;
}

function reverseBits(value: number, length: number): number {
  let reversed = 0;
  for (let index = 0; index < length; index += 1) {
    reversed = (reversed << 1) | (value & 1);
    value >>>= 1;
  }
  return reversed;
}

/**
 * 정규 허프만 부호 길이로 해독 표를 만든다. 과다 구독(over-subscribed)은 항상 오류다. 불완전한 부호는 zlib처럼 부호가 하나뿐이고 그 길이가
 * 1일 때만 받는다(`allowIncomplete`가 true인 표에서만 — 리터럴/길이 표와 거리 표. 길이 부호 표는 항상 완전해야 한다). 부호가 하나도
 * 없는 표는 `allowIncomplete`일 때만 받으며, 그 표로 심볼을 읽으려 하면 오류가 된다.
 */
function buildDecodeTable(lengths: Uint8Array, symbolCount: number, allowIncomplete: boolean): DecodeTable {
  const lengthCounts = new Uint16Array(MAX_CODE_BITS + 1);
  let maxLength = 0;
  for (let symbol = 0; symbol < symbolCount; symbol += 1) {
    const length = lengths[symbol]!;
    lengthCounts[length] = lengthCounts[length]! + 1;
    if (length > maxLength) maxLength = length;
  }
  if (maxLength === 0) {
    // 부호가 하나도 없다. 거리 부호에서만 허용되며, 이 표로 심볼을 읽으려 하면 오류가 된다.
    if (!allowIncomplete) throw new ZlibInflateError("허프만 부호가 비어 있다", "data");
    return { entries: new Uint16Array(2), bits: 1 };
  }
  lengthCounts[0] = 0;
  let left = 1;
  for (let length = 1; length <= MAX_CODE_BITS; length += 1) {
    left = (left << 1) - lengthCounts[length]!;
    if (left < 0) throw new ZlibInflateError("허프만 부호가 과다 구독되었다", "data");
  }
  if (left > 0 && (!allowIncomplete || maxLength !== 1)) throw new ZlibInflateError("허프만 부호가 불완전하다", "data");

  const nextCode = new Uint16Array(MAX_CODE_BITS + 2);
  let code = 0;
  for (let length = 1; length <= MAX_CODE_BITS; length += 1) {
    code = (code + lengthCounts[length - 1]!) << 1;
    nextCode[length] = code;
  }
  const size = 1 << maxLength;
  const entries = new Uint16Array(size);
  for (let symbol = 0; symbol < symbolCount; symbol += 1) {
    const length = lengths[symbol]!;
    if (length === 0) continue;
    const assigned = nextCode[length]!;
    nextCode[length] = assigned + 1;
    const entry = (length << 9) | symbol;
    const reversed = reverseBits(assigned, length);
    for (let fill = reversed; fill < size; fill += 1 << length) entries[fill] = entry;
  }
  return { entries, bits: maxLength };
}

let fixedTables: { readonly literal: DecodeTable; readonly distance: DecodeTable } | null = null;

function getFixedTables(): { readonly literal: DecodeTable; readonly distance: DecodeTable } {
  if (fixedTables === null) {
    const literalLengths = new Uint8Array(288);
    literalLengths.fill(8, 0, 144);
    literalLengths.fill(9, 144, 256);
    literalLengths.fill(7, 256, 280);
    literalLengths.fill(8, 280, 288);
    fixedTables = {
      literal: buildDecodeTable(literalLengths, 288, false),
      // RFC 1951 3.2.6: 고정 거리 부호는 5비트 32개(0~31)이고 30·31은 쓸 수 없다(디코드 루프가 거부한다). 32개라야 완전한 부호다.
      distance: buildDecodeTable(new Uint8Array(32).fill(5), 32, false),
    };
  }
  return fixedTables;
}

/** 입력 비트 읽기와 출력 버퍼 관리. 비트는 낮은 자리부터 쓰인다(RFC 1951 3.1.1). */
class InflateState {
  position: number;
  private bitBuffer = 0;
  private bitCount = 0;
  output: Uint8Array;
  outputLength = 0;
  private readonly growable: boolean;

  constructor(
    readonly input: Uint8Array,
    start: number,
    private readonly maxOutputBytes: number,
    expectedBytes: number | undefined,
  ) {
    this.position = start;
    this.growable = expectedBytes === undefined;
    this.output = new Uint8Array(expectedBytes ?? Math.min(INITIAL_GROWTH_BYTES, maxOutputBytes));
  }

  /** 입력이 남아 있는 만큼 비트 버퍼를 `count`비트 이상으로 채운다(입력이 끝났으면 그대로 둔다). */
  private fill(count: number): void {
    while (this.bitCount < count && this.position < this.input.byteLength) {
      this.bitBuffer |= this.input[this.position]! << this.bitCount;
      this.position += 1;
      this.bitCount += 8;
    }
  }

  readBits(count: number): number {
    if (count === 0) return 0;
    this.fill(count);
    if (this.bitCount < count) throw new ZlibInflateError("DEFLATE 스트림이 중간에 끝났다", "truncated");
    const value = this.bitBuffer & ((1 << count) - 1);
    this.bitBuffer >>>= count;
    this.bitCount -= count;
    return value;
  }

  readSymbol(table: DecodeTable): number {
    this.fill(table.bits);
    const entry = table.entries[this.bitBuffer & ((1 << table.bits) - 1)]!;
    const length = entry >> 9;
    if (length === 0) throw new ZlibInflateError("잘못된 허프만 부호", "data");
    if (length > this.bitCount) throw new ZlibInflateError("DEFLATE 스트림이 중간에 끝났다", "truncated");
    this.bitBuffer >>>= length;
    this.bitCount -= length;
    return entry & 0x1ff;
  }

  /** 남은 비트를 버려 바이트 경계에 맞추고, 버퍼에 미리 읽어 둔 완전한 바이트는 입력으로 되돌린다. */
  alignToByte(): void {
    this.bitBuffer = 0;
    this.position -= this.bitCount >> 3;
    this.bitCount = 0;
  }

  ensure(extra: number): void {
    const needed = this.outputLength + extra;
    if (needed > this.maxOutputBytes) throw new ZlibInflateError(`출력이 상한 ${this.maxOutputBytes}바이트를 넘는다`, "limit");
    if (needed <= this.output.byteLength) return;
    if (!this.growable) throw new ZlibInflateError("출력이 기대한 크기를 넘는다", "limit");
    let capacity = this.output.byteLength;
    while (capacity < needed) capacity = Math.min(this.maxOutputBytes, Math.max(capacity * 2, needed));
    const grown = new Uint8Array(capacity);
    grown.set(this.output.subarray(0, this.outputLength));
    this.output = grown;
  }
}

function inflateStoredBlock(state: InflateState): void {
  state.alignToByte();
  if (state.position + 4 > state.input.byteLength) throw new ZlibInflateError("저장 블록 헤더가 중간에 끝났다", "truncated");
  const length = state.input[state.position]! | (state.input[state.position + 1]! << 8);
  const complement = state.input[state.position + 2]! | (state.input[state.position + 3]! << 8);
  if ((length ^ 0xffff) !== complement) throw new ZlibInflateError("저장 블록의 길이 보수가 맞지 않는다", "data");
  state.position += 4;
  if (state.position + length > state.input.byteLength) throw new ZlibInflateError("저장 블록이 중간에 끝났다", "truncated");
  state.ensure(length);
  state.output.set(state.input.subarray(state.position, state.position + length), state.outputLength);
  state.outputLength += length;
  state.position += length;
}

function inflateCodedBlock(state: InflateState, literal: DecodeTable, distance: DecodeTable): void {
  for (;;) {
    const symbol = state.readSymbol(literal);
    if (symbol < 256) {
      state.ensure(1);
      state.output[state.outputLength] = symbol;
      state.outputLength += 1;
      continue;
    }
    if (symbol === 256) return;
    const lengthIndex = symbol - 257;
    if (lengthIndex >= LENGTH_BASE.length) throw new ZlibInflateError("잘못된 길이 심볼", "data");
    const length = LENGTH_BASE[lengthIndex]! + state.readBits(LENGTH_EXTRA[lengthIndex]!);
    const distanceSymbol = state.readSymbol(distance);
    if (distanceSymbol >= DISTANCE_BASE.length) throw new ZlibInflateError("잘못된 거리 심볼", "data");
    const back = DISTANCE_BASE[distanceSymbol]! + state.readBits(DISTANCE_EXTRA[distanceSymbol]!);
    if (back > state.outputLength) throw new ZlibInflateError("거리가 이미 만든 출력보다 멀다", "data");
    state.ensure(length);
    const output = state.output;
    let to = state.outputLength;
    let from = to - back;
    // 겹치는 복사(back < length)는 앞쪽 바이트를 되풀이하므로 바이트 단위로 복사해야 한다.
    for (let copied = 0; copied < length; copied += 1) output[to++] = output[from++]!;
    state.outputLength = to;
  }
}

function readDynamicTables(state: InflateState): { readonly literal: DecodeTable; readonly distance: DecodeTable } {
  const literalCount = state.readBits(5) + 257;
  const distanceCount = state.readBits(5) + 1;
  const codeLengthCount = state.readBits(4) + 4;
  if (literalCount > 286 || distanceCount > 30) throw new ZlibInflateError("동적 블록의 부호 개수가 범위를 벗어났다", "data");

  const codeLengthLengths = new Uint8Array(19);
  for (let index = 0; index < codeLengthCount; index += 1) codeLengthLengths[CODE_LENGTH_ORDER[index]!] = state.readBits(3);
  const codeLengthTable = buildDecodeTable(codeLengthLengths, 19, false);

  const lengths = new Uint8Array(literalCount + distanceCount);
  let index = 0;
  while (index < lengths.length) {
    const symbol = state.readSymbol(codeLengthTable);
    if (symbol < 16) {
      lengths[index] = symbol;
      index += 1;
      continue;
    }
    let repeat: number;
    let value = 0;
    if (symbol === 16) {
      if (index === 0) throw new ZlibInflateError("반복할 이전 길이가 없다", "data");
      value = lengths[index - 1]!;
      repeat = 3 + state.readBits(2);
    } else if (symbol === 17) {
      repeat = 3 + state.readBits(3);
    } else {
      repeat = 11 + state.readBits(7);
    }
    if (index + repeat > lengths.length) throw new ZlibInflateError("부호 길이 반복이 범위를 넘는다", "data");
    lengths.fill(value, index, index + repeat);
    index += repeat;
  }
  if (lengths[256] === 0) throw new ZlibInflateError("블록 끝 심볼의 부호가 없다", "data");
  return {
    literal: buildDecodeTable(lengths.subarray(0, literalCount), literalCount, true),
    distance: buildDecodeTable(lengths.subarray(literalCount), distanceCount, true),
  };
}

function adler32(bytes: Uint8Array): number {
  let low = 1;
  let high = 0;
  // 5552는 32비트 정수가 넘치지 않고 모듈로를 미룰 수 있는 최대 길이다(zlib의 NMAX).
  for (let start = 0; start < bytes.byteLength; start += 5552) {
    const end = Math.min(start + 5552, bytes.byteLength);
    for (let index = start; index < end; index += 1) {
      low += bytes[index]!;
      high += low;
    }
    low %= 65521;
    high %= 65521;
  }
  return ((high << 16) | low) >>> 0;
}

/** zlib 스트림 하나를 풀어 출력과 입력에서 소비한 바이트 수를 돌려준다. */
export function inflateZlib(input: Uint8Array, options: ZlibInflateOptions): ZlibInflateResult {
  const { maxOutputBytes, expectedBytes } = options;
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 0) {
    throw new RangeError("maxOutputBytes는 0 이상의 정수여야 한다");
  }
  if (expectedBytes !== undefined && (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > maxOutputBytes)) {
    throw new RangeError("expectedBytes는 0 이상 maxOutputBytes 이하의 정수여야 한다");
  }
  const { maxBlocks } = options;
  if (maxBlocks !== undefined && (!Number.isSafeInteger(maxBlocks) || maxBlocks < 1)) {
    throw new RangeError("maxBlocks는 1 이상의 정수여야 한다");
  }
  if (input.byteLength < 2) throw new ZlibInflateError("zlib 헤더가 중간에 끝났다", "truncated");
  const methodAndWindow = input[0]!;
  const flags = input[1]!;
  if ((methodAndWindow & 0x0f) !== 8) throw new ZlibInflateError("압축 방식이 deflate(8)가 아니다", "header");
  if (methodAndWindow >> 4 > 7) throw new ZlibInflateError("창 크기가 32KiB를 넘는다", "header");
  if (((methodAndWindow << 8) | flags) % 31 !== 0) throw new ZlibInflateError("zlib 헤더 검사값이 맞지 않는다", "header");
  if ((flags & 0x20) !== 0) throw new ZlibInflateError("사전(FDICT)이 필요한 스트림은 지원하지 않는다", "dictionary");

  const state = new InflateState(input, 2, maxOutputBytes, expectedBytes);
  let isFinal = false;
  let blocks = 0;
  while (!isFinal) {
    blocks += 1;
    if (maxBlocks !== undefined && blocks > maxBlocks) throw new ZlibInflateError(`DEFLATE 블록이 상한 ${maxBlocks}개를 넘는다`, "limit");
    isFinal = state.readBits(1) === 1;
    const type = state.readBits(2);
    if (type === 0) {
      inflateStoredBlock(state);
    } else if (type === 1) {
      const fixed = getFixedTables();
      inflateCodedBlock(state, fixed.literal, fixed.distance);
    } else if (type === 2) {
      const tables = readDynamicTables(state);
      inflateCodedBlock(state, tables.literal, tables.distance);
    } else {
      throw new ZlibInflateError("예약된 블록 종류(3)", "data");
    }
  }
  state.alignToByte();
  if (expectedBytes !== undefined && state.outputLength !== expectedBytes) {
    throw new ZlibInflateError(`출력 ${state.outputLength}바이트가 기대한 ${expectedBytes}바이트와 다르다`, "data");
  }
  if (state.position + 4 > input.byteLength) throw new ZlibInflateError("Adler-32 값이 중간에 끝났다", "truncated");
  const output = state.output.subarray(0, state.outputLength);
  if (options.skipChecksum !== true) {
    const stored =
      ((input[state.position]! << 24) | (input[state.position + 1]! << 16) | (input[state.position + 2]! << 8) | input[state.position + 3]!) >>> 0;
    if (stored !== adler32(output)) throw new ZlibInflateError("Adler-32이 맞지 않는다", "checksum");
  }
  return { output, consumedBytes: state.position + 4, blocks };
}
