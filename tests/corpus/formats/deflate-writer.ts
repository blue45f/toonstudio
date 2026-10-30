/**
 * 테스트 보조: RFC 1950/1951 스트림을 비트 단위로 직접 쓴다. 해제기의 표(길이·거리 기준값)와 독립이 되도록 길이·거리 심볼 표는 RFC의
 * 규칙(추가 비트가 4개 심볼마다 하나씩 늘어난다)으로 계산한다. Node `zlib`이 만들지 않는 스트림(과다 구독, 불완전한 부호, 15비트 부호,
 * 범위를 벗어난 개수, 반복 부호의 경계 …)을 만들어 해제기의 오류 경로와 드문 경로를 시험하는 것이 목적이다.
 */

export class DeflateBitWriter {
  private readonly bytes: number[] = [];
  private accumulator = 0;
  private pending = 0;

  /** 낮은 비트부터 쓴다(RFC 1951 3.1.1). */
  bits(value: number, width: number): this {
    for (let index = 0; index < width; index += 1) {
      this.accumulator |= ((value >>> index) & 1) << this.pending;
      this.pending += 1;
      if (this.pending === 8) this.flushByte();
    }
    return this;
  }

  /** 허프만 부호는 최상위 비트부터 쓴다. */
  code(code: number, length: number): this {
    for (let index = length - 1; index >= 0; index -= 1) this.bits((code >>> index) & 1, 1);
    return this;
  }

  alignToByte(): this {
    if (this.pending > 0) this.flushByte();
    return this;
  }

  rawBytes(bytes: ArrayLike<number>): this {
    this.alignToByte();
    for (let index = 0; index < bytes.length; index += 1) this.bytes.push(bytes[index]! & 0xff);
    return this;
  }

  toBytes(): Uint8Array {
    const copy = [...this.bytes];
    if (this.pending > 0) copy.push(this.accumulator & 0xff);
    return Uint8Array.from(copy);
  }

  private flushByte(): void {
    this.bytes.push(this.accumulator & 0xff);
    this.accumulator = 0;
    this.pending = 0;
  }
}

export interface PrefixCode {
  readonly code: number;
  readonly length: number;
}

/** 정규 허프만 부호(RFC 1951 3.2.2). 길이 0인 심볼은 undefined. 과다 구독이어도 규칙대로 번호를 매겨 만든다(시험용). */
export function canonicalCodes(lengths: readonly number[]): Array<PrefixCode | undefined> {
  const counts = new Array<number>(16).fill(0);
  for (const length of lengths) counts[length] = counts[length]! + 1;
  counts[0] = 0;
  const next = new Array<number>(17).fill(0);
  let code = 0;
  for (let bits = 1; bits <= 15; bits += 1) {
    code = (code + counts[bits - 1]!) << 1;
    next[bits] = code;
  }
  return lengths.map((length) => {
    if (length === 0) return undefined;
    const assigned = next[length]!;
    next[length] = assigned + 1;
    return { code: assigned, length };
  });
}

/** 길이 3~258 → (심볼 257~285, 추가 비트 수, 추가 비트 값). RFC의 규칙으로 계산한다. */
export function lengthSymbol(length: number): { symbol: number; extraBits: number; extraValue: number } {
  if (length < 3 || length > 258) throw new Error(`길이 ${length}는 3~258이어야 한다`);
  if (length === 258) return { symbol: 285, extraBits: 0, extraValue: 0 };
  if (length <= 10) return { symbol: 254 + length, extraBits: 0, extraValue: 0 };
  for (let code = 8; code < 28; code += 1) {
    const extraBits = (code >> 2) - 1;
    const base = ((4 + (code & 3)) << extraBits) + 3;
    if (length >= base && length < base + (1 << extraBits)) return { symbol: 257 + code, extraBits, extraValue: length - base };
  }
  throw new Error("도달할 수 없다");
}

/** 거리 1~32768 → (심볼 0~29, 추가 비트 수, 추가 비트 값). */
export function distanceSymbol(distance: number): { symbol: number; extraBits: number; extraValue: number } {
  if (distance < 1 || distance > 32_768) throw new Error(`거리 ${distance}는 1~32768이어야 한다`);
  if (distance <= 4) return { symbol: distance - 1, extraBits: 0, extraValue: 0 };
  for (let code = 4; code < 30; code += 1) {
    const extraBits = (code >> 1) - 1;
    const base = ((2 + (code & 1)) << extraBits) + 1;
    if (distance >= base && distance < base + (1 << extraBits)) return { symbol: code, extraBits, extraValue: distance - base };
  }
  throw new Error("도달할 수 없다");
}

export type DeflateToken =
  | { readonly kind: "literal"; readonly value: number }
  | { readonly kind: "match"; readonly length: number; readonly distance: number }
  /** 일부러 잘못된 심볼 번호를 쓴다(예: 길이 심볼 286). */
  | { readonly kind: "rawLiteralLengthSymbol"; readonly symbol: number }
  | { readonly kind: "rawDistanceSymbol"; readonly symbol: number }
  | { readonly kind: "endOfBlock" };

/** 고정 허프만(RFC 1951 3.2.6)의 리터럴/길이 부호. */
export function fixedLiteralCode(symbol: number): PrefixCode {
  if (symbol <= 143) return { code: 0x30 + symbol, length: 8 };
  if (symbol <= 255) return { code: 0x190 + (symbol - 144), length: 9 };
  if (symbol <= 279) return { code: symbol - 256, length: 7 };
  return { code: 0xc0 + (symbol - 280), length: 8 };
}

function writeBlockHeader(writer: DeflateBitWriter, final: boolean, type: number): void {
  writer.bits(final ? 1 : 0, 1).bits(type, 2);
}

export function writeStoredBlock(writer: DeflateBitWriter, bytes: ArrayLike<number>, final: boolean): void {
  writeBlockHeader(writer, final, 0);
  writer.alignToByte();
  const length = bytes.length;
  writer.rawBytes([length & 0xff, length >> 8, ~length & 0xff, (~length >> 8) & 0xff]).rawBytes(bytes);
}

export function writeFixedBlock(writer: DeflateBitWriter, tokens: readonly DeflateToken[], final: boolean): void {
  writeBlockHeader(writer, final, 1);
  for (const token of tokens) {
    if (token.kind === "literal") {
      const { code, length } = fixedLiteralCode(token.value);
      writer.code(code, length);
    } else if (token.kind === "endOfBlock") {
      const { code, length } = fixedLiteralCode(256);
      writer.code(code, length);
    } else if (token.kind === "rawLiteralLengthSymbol") {
      const { code, length } = fixedLiteralCode(token.symbol);
      writer.code(code, length);
    } else if (token.kind === "rawDistanceSymbol") {
      writer.code(token.symbol, 5);
    } else {
      const lengthInfo = lengthSymbol(token.length);
      const lengthCode = fixedLiteralCode(lengthInfo.symbol);
      writer.code(lengthCode.code, lengthCode.length).bits(lengthInfo.extraValue, lengthInfo.extraBits);
      const distanceInfo = distanceSymbol(token.distance);
      writer.code(distanceInfo.symbol, 5).bits(distanceInfo.extraValue, distanceInfo.extraBits);
    }
  }
}

/** 부호 길이 배열에서 쓰이는 길이 부호 항목: 심볼 0~15는 길이 그대로, 16·17·18은 반복(추가 비트 값 포함). */
export interface CodeLengthItem {
  readonly symbol: number;
  readonly extraValue?: number;
}

const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
const CODE_LENGTH_EXTRA_BITS: Readonly<Record<number, number>> = { 16: 2, 17: 3, 18: 7 };

export interface DynamicBlockSpec {
  /** 리터럴/길이 알파벳의 부호 길이(길이 257~286). 마지막 항목들이 0이면 HLIT가 줄어든다. */
  readonly literalLengths: readonly number[];
  /** 거리 알파벳의 부호 길이(길이 1~30). */
  readonly distanceLengths: readonly number[];
  readonly tokens: readonly DeflateToken[];
  /** 길이 부호의 길이(19개, `CODE_LENGTH_ORDER` 순서가 아니라 심볼 번호 순서). 생략하면 쓰인 항목의 빈도로 계산한다. */
  readonly codeLengthLengths?: readonly number[];
  /** 부호 길이를 나타내는 항목 열. 생략하면 길이를 하나씩 직접 나타낸다. */
  readonly codeLengthItems?: readonly CodeLengthItem[];
  /** HLIT/HDIST/HCLEN을 직접 정한다(경계 시험용). 생략하면 배열 길이에서 계산한다. */
  readonly hlit?: number;
  readonly hdist?: number;
  readonly hclen?: number;
}

/** 빈도로 허프만 길이를 만든다(최대 `maxLength`를 넘으면 예외). 심볼이 하나뿐이면 길이 1. */
export function huffmanLengths(frequencies: readonly number[], maxLength: number): number[] {
  const used = frequencies.map((frequency, symbol) => ({ frequency, symbol })).filter((entry) => entry.frequency > 0);
  const lengths = new Array<number>(frequencies.length).fill(0);
  if (used.length === 0) return lengths;
  if (used.length === 1) {
    lengths[used[0]!.symbol] = 1;
    return lengths;
  }
  interface Node {
    weight: number;
    symbols: number[];
  }
  let nodes: Node[] = used.map((entry) => ({ weight: entry.frequency, symbols: [entry.symbol] }));
  while (nodes.length > 1) {
    nodes.sort((left, right) => left.weight - right.weight || left.symbols[0]! - right.symbols[0]!);
    const [first, second, ...rest] = nodes as [Node, Node, ...Node[]];
    for (const symbol of [...first.symbols, ...second.symbols]) lengths[symbol] = lengths[symbol]! + 1;
    nodes = [{ weight: first.weight + second.weight, symbols: [...first.symbols, ...second.symbols] }, ...rest];
  }
  if (Math.max(...lengths) > maxLength) throw new Error(`허프만 길이가 ${maxLength}를 넘는다`);
  return lengths;
}

export function writeDynamicBlock(writer: DeflateBitWriter, spec: DynamicBlockSpec, final: boolean): void {
  const literalLengths = [...spec.literalLengths];
  const distanceLengths = [...spec.distanceLengths];
  const hlit = spec.hlit ?? literalLengths.length - 257;
  const hdist = spec.hdist ?? distanceLengths.length - 1;
  const items: CodeLengthItem[] = spec.codeLengthItems ? [...spec.codeLengthItems] : [...literalLengths, ...distanceLengths].map((symbol) => ({ symbol }));

  let codeLengthLengths = spec.codeLengthLengths ? [...spec.codeLengthLengths] : null;
  if (codeLengthLengths === null) {
    const frequencies = new Array<number>(19).fill(0);
    for (const item of items) frequencies[item.symbol] = frequencies[item.symbol]! + 1;
    codeLengthLengths = huffmanLengths(frequencies, 7);
  }
  let hclen = spec.hclen;
  if (hclen === undefined) {
    let last = 18;
    while (last > 3 && codeLengthLengths[CODE_LENGTH_ORDER[last]!] === 0) last -= 1;
    hclen = last - 3;
  }

  writeBlockHeader(writer, final, 2);
  writer.bits(hlit, 5).bits(hdist, 5).bits(hclen, 4);
  for (let index = 0; index < hclen + 4; index += 1) writer.bits(codeLengthLengths[CODE_LENGTH_ORDER[index]!]!, 3);
  const codeLengthCodes = canonicalCodes(codeLengthLengths);
  for (const item of items) {
    const prefix = codeLengthCodes[item.symbol];
    if (prefix === undefined) throw new Error(`길이 부호 ${item.symbol}에 부호가 없다`);
    writer.code(prefix.code, prefix.length);
    const extraBits = CODE_LENGTH_EXTRA_BITS[item.symbol];
    if (extraBits !== undefined) writer.bits(item.extraValue ?? 0, extraBits);
  }

  const literalCodes = canonicalCodes(literalLengths);
  const distanceCodes = canonicalCodes(distanceLengths);
  const need = (prefix: PrefixCode | undefined, what: string): PrefixCode => {
    if (prefix === undefined) throw new Error(`${what}에 부호가 없다`);
    return prefix;
  };
  for (const token of spec.tokens) {
    if (token.kind === "literal") {
      const prefix = need(literalCodes[token.value], `리터럴 ${token.value}`);
      writer.code(prefix.code, prefix.length);
    } else if (token.kind === "endOfBlock") {
      const prefix = need(literalCodes[256], "블록 끝");
      writer.code(prefix.code, prefix.length);
    } else if (token.kind === "rawLiteralLengthSymbol") {
      const prefix = need(literalCodes[token.symbol], `심볼 ${token.symbol}`);
      writer.code(prefix.code, prefix.length);
    } else if (token.kind === "rawDistanceSymbol") {
      const prefix = need(distanceCodes[token.symbol], `거리 심볼 ${token.symbol}`);
      writer.code(prefix.code, prefix.length);
    } else {
      const lengthInfo = lengthSymbol(token.length);
      const lengthPrefix = need(literalCodes[lengthInfo.symbol], `길이 심볼 ${lengthInfo.symbol}`);
      writer.code(lengthPrefix.code, lengthPrefix.length).bits(lengthInfo.extraValue, lengthInfo.extraBits);
      const distanceInfo = distanceSymbol(token.distance);
      const distancePrefix = need(distanceCodes[distanceInfo.symbol], `거리 심볼 ${distanceInfo.symbol}`);
      writer.code(distancePrefix.code, distancePrefix.length).bits(distanceInfo.extraValue, distanceInfo.extraBits);
    }
  }
}

export function adler32Of(bytes: Uint8Array): number {
  let low = 1;
  let high = 0;
  for (const byte of bytes) {
    low = (low + byte) % 65_521;
    high = (high + low) % 65_521;
  }
  return ((high << 16) | low) >>> 0;
}

/** zlib 머리(0x78 0x9c) + DEFLATE + Adler-32. */
export function zlibWrapRaw(deflate: Uint8Array, original: Uint8Array): Uint8Array {
  const checksum = adler32Of(original);
  const out = new Uint8Array(2 + deflate.byteLength + 4);
  out.set([0x78, 0x9c], 0);
  out.set(deflate, 2);
  new DataView(out.buffer).setUint32(2 + deflate.byteLength, checksum, false);
  return out;
}

/** 리터럴·일치·블록 끝 토큰으로 기대 출력을 계산한다(겹치는 일치 포함). */
export function expandTokens(tokens: readonly DeflateToken[]): Uint8Array {
  const out: number[] = [];
  for (const token of tokens) {
    if (token.kind === "literal") out.push(token.value);
    else if (token.kind === "match") for (let copied = 0; copied < token.length; copied += 1) out.push(out[out.length - token.distance]!);
  }
  return Uint8Array.from(out);
}
