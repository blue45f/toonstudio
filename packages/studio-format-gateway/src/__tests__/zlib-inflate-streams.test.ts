import { constants, deflateSync, inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  canonicalCodes,
  DeflateBitWriter,
  distanceSymbol,
  expandTokens,
  huffmanLengths,
  lengthSymbol,
  writeDynamicBlock,
  writeFixedBlock,
  writeStoredBlock,
  zlibWrapRaw,
  type CodeLengthItem,
  type DeflateToken,
  type DynamicBlockSpec,
} from "../../../../tests/corpus/formats/deflate-writer";
import { inflateZlib, ZlibInflateError, type ZlibInflateErrorCode } from "../zlib-inflate";

const LIMITS = { maxOutputBytes: 1 << 24 };

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function codeOf(action: () => unknown): ZlibInflateErrorCode | "other" | "none" {
  try {
    action();
    return "none";
  } catch (error) {
    return error instanceof ZlibInflateError ? error.code : "other";
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && Buffer.compare(left, right) === 0;
}

/** 리터럴 `prefix`개(무작위) 다음에 일치 하나(길이, 거리)를 둔 토큰 열. 거리는 `prefix` 이하여야 한다. */
function matchTokens(prefix: number, length: number, distance: number, seed: number): DeflateToken[] {
  const next = mulberry32(seed);
  const tokens: DeflateToken[] = Array.from({ length: prefix }, () => ({ kind: "literal", value: Math.floor(next() * 256) }));
  tokens.push({ kind: "match", length, distance }, { kind: "endOfBlock" });
  return tokens;
}

function fixedStream(tokens: readonly DeflateToken[]): { stream: Uint8Array; expected: Uint8Array } {
  const writer = new DeflateBitWriter();
  writeFixedBlock(writer, tokens, true);
  const expected = expandTokens(tokens);
  return { stream: zlibWrapRaw(writer.toBytes(), expected), expected };
}

/** 쓰인 심볼의 빈도로 허프만 길이를 만들어 동적 블록 하나를 쓴다. */
function dynamicSpecFor(tokens: readonly DeflateToken[]): DynamicBlockSpec {
  const literalFrequencies = new Array<number>(286).fill(0);
  const distanceFrequencies = new Array<number>(30).fill(0);
  for (const token of tokens) {
    if (token.kind === "literal") literalFrequencies[token.value] = literalFrequencies[token.value]! + 1;
    else if (token.kind === "endOfBlock") literalFrequencies[256] = literalFrequencies[256]! + 1;
    else if (token.kind === "match") {
      const lengthInfo = lengthSymbol(token.length);
      literalFrequencies[lengthInfo.symbol] = literalFrequencies[lengthInfo.symbol]! + 1;
      const distanceInfo = distanceSymbol(token.distance);
      distanceFrequencies[distanceInfo.symbol] = distanceFrequencies[distanceInfo.symbol]! + 1;
    }
  }
  let hlitLast = 285;
  while (hlitLast > 256 && literalFrequencies[hlitLast] === 0) hlitLast -= 1;
  let hdistLast = 29;
  while (hdistLast > 0 && distanceFrequencies[hdistLast] === 0) hdistLast -= 1;
  // 쓰인 심볼의 빈도를 평평하게 만들어 드문 심볼의 부호가 15비트를 넘지 않게 한다(어떤 빈도든 부호는 유효하다).
  const flatten = (frequencies: number[]): number[] => frequencies.map((frequency) => (frequency > 0 ? frequency + 64 : 0));
  return {
    literalLengths: huffmanLengths(flatten(literalFrequencies), 15).slice(0, hlitLast + 1),
    distanceLengths: huffmanLengths(flatten(distanceFrequencies), 15).slice(0, hdistLast + 1),
    tokens,
  };
}

function dynamicStream(tokens: readonly DeflateToken[]): { stream: Uint8Array; expected: Uint8Array } {
  const writer = new DeflateBitWriter();
  writeDynamicBlock(writer, dynamicSpecFor(tokens), true);
  const expected = expandTokens(tokens);
  return { stream: zlibWrapRaw(writer.toBytes(), expected), expected };
}

function dynamicSpecStream(spec: DynamicBlockSpec, expected: Uint8Array): Uint8Array {
  const writer = new DeflateBitWriter();
  writeDynamicBlock(writer, spec, true);
  return zlibWrapRaw(writer.toBytes(), expected);
}

describe("테스트 보조: RFC 심볼 표를 규칙으로 계산한다", () => {
  it("길이: 알려진 경계 값", () => {
    expect(lengthSymbol(3)).toEqual({ symbol: 257, extraBits: 0, extraValue: 0 });
    expect(lengthSymbol(10)).toEqual({ symbol: 264, extraBits: 0, extraValue: 0 });
    expect(lengthSymbol(11)).toEqual({ symbol: 265, extraBits: 1, extraValue: 0 });
    expect(lengthSymbol(12)).toEqual({ symbol: 265, extraBits: 1, extraValue: 1 });
    expect(lengthSymbol(13)).toEqual({ symbol: 266, extraBits: 1, extraValue: 0 });
    expect(lengthSymbol(19)).toEqual({ symbol: 269, extraBits: 2, extraValue: 0 });
    expect(lengthSymbol(35)).toEqual({ symbol: 273, extraBits: 3, extraValue: 0 });
    expect(lengthSymbol(67)).toEqual({ symbol: 277, extraBits: 4, extraValue: 0 });
    expect(lengthSymbol(131)).toEqual({ symbol: 281, extraBits: 5, extraValue: 0 });
    expect(lengthSymbol(227)).toEqual({ symbol: 284, extraBits: 5, extraValue: 0 });
    expect(lengthSymbol(257)).toEqual({ symbol: 284, extraBits: 5, extraValue: 30 });
    expect(lengthSymbol(258)).toEqual({ symbol: 285, extraBits: 0, extraValue: 0 });
  });

  it("거리: 알려진 경계 값", () => {
    expect(distanceSymbol(1)).toEqual({ symbol: 0, extraBits: 0, extraValue: 0 });
    expect(distanceSymbol(4)).toEqual({ symbol: 3, extraBits: 0, extraValue: 0 });
    expect(distanceSymbol(5)).toEqual({ symbol: 4, extraBits: 1, extraValue: 0 });
    expect(distanceSymbol(6)).toEqual({ symbol: 4, extraBits: 1, extraValue: 1 });
    expect(distanceSymbol(7)).toEqual({ symbol: 5, extraBits: 1, extraValue: 0 });
    expect(distanceSymbol(9)).toEqual({ symbol: 6, extraBits: 2, extraValue: 0 });
    expect(distanceSymbol(24_577)).toEqual({ symbol: 29, extraBits: 13, extraValue: 0 });
    expect(distanceSymbol(32_768)).toEqual({ symbol: 29, extraBits: 13, extraValue: 8191 });
  });

  it("모든 길이와 거리가 심볼 하나로 유일하게 표현되고 범위를 빠짐없이 덮는다", () => {
    const lengths = new Set<string>();
    for (let length = 3; length <= 258; length += 1) {
      const { symbol, extraBits, extraValue } = lengthSymbol(length);
      expect(symbol).toBeGreaterThanOrEqual(257);
      expect(symbol).toBeLessThanOrEqual(285);
      expect(extraValue).toBeLessThan(1 << extraBits);
      lengths.add(`${symbol}:${extraValue}`);
    }
    expect(lengths.size).toBe(256);
    const distances = new Set<string>();
    for (let distance = 1; distance <= 32_768; distance += 1) {
      const { symbol, extraBits, extraValue } = distanceSymbol(distance);
      expect(symbol).toBeLessThan(30);
      expect(extraValue).toBeLessThan(1 << extraBits);
      distances.add(`${symbol}:${extraValue}`);
    }
    expect(distances.size).toBe(32_768);
  });

  it("범위 밖의 길이·거리는 예외다", () => {
    expect(() => lengthSymbol(2)).toThrow();
    expect(() => lengthSymbol(259)).toThrow();
    expect(() => distanceSymbol(0)).toThrow();
    expect(() => distanceSymbol(32_769)).toThrow();
  });

  it("정규 부호: RFC 1951 3.2.2의 예(A~H 길이 3,3,3,3,3,2,4,4)", () => {
    const codes = canonicalCodes([3, 3, 3, 3, 3, 2, 4, 4]);
    expect(codes.map((entry) => entry && entry.code.toString(2).padStart(entry.length, "0"))).toEqual([
      "010", "011", "100", "101", "110", "00", "1110", "1111",
    ]);
  });
});

describe("모든 (길이, 거리) 조합: 고정 허프만 블록", () => {
  it("거리 1~64 × 길이 3~258 전부(겹치는 복사 포함)를 정확히 되돌린다", () => {
    let checked = 0;
    for (let distance = 1; distance <= 64; distance += 1) {
      for (let length = 3; length <= 258; length += 1) {
        const { stream, expected } = fixedStream(matchTokens(distance, length, distance, distance * 1000 + length));
        const result = inflateZlib(stream, { maxOutputBytes: expected.byteLength, expectedBytes: expected.byteLength });
        if (!sameBytes(result.output, expected)) expect.fail(`거리 ${distance} 길이 ${length}`);
        checked += 1;
      }
    }
    expect(checked).toBe(64 * 256);
  });

  const DISTANCE_EDGES: number[] = [];
  for (let code = 0; code < 30; code += 1) {
    const first = code < 4 ? code + 1 : ((2 + (code & 1)) << ((code >> 1) - 1)) + 1;
    const extraBits = code < 4 ? 0 : (code >> 1) - 1;
    DISTANCE_EDGES.push(first, first + (1 << extraBits) - 1);
  }
  const LENGTH_SAMPLES = [3, 4, 10, 11, 12, 30, 130, 131, 226, 227, 257, 258];

  it("거리 심볼 30개의 첫 값과 끝 값 × 길이 표본이 정확히 되돌아온다", () => {
    expect(DISTANCE_EDGES).toHaveLength(60);
    expect(DISTANCE_EDGES[0]).toBe(1);
    expect(DISTANCE_EDGES.at(-1)).toBe(32_768);
    for (const distance of DISTANCE_EDGES) {
      for (const length of LENGTH_SAMPLES) {
        const { stream, expected } = fixedStream(matchTokens(distance, length, distance, distance * 31 + length));
        const result = inflateZlib(stream, LIMITS);
        if (!sameBytes(result.output, expected)) expect.fail(`거리 ${distance} 길이 ${length}`);
      }
    }
  });

  it("일치가 앞선 일치를 가리키고(거리 < 길이) 일치가 이어지는 복합 열도 되돌린다", () => {
    const tokens: DeflateToken[] = [
      ...Array.from({ length: 5 }, (_, index): DeflateToken => ({ kind: "literal", value: 65 + index })),
      { kind: "match", length: 20, distance: 3 },
      { kind: "match", length: 7, distance: 1 },
      { kind: "match", length: 40, distance: 25 },
      { kind: "endOfBlock" },
    ];
    const { stream, expected } = fixedStream(tokens);

    expect(sameBytes(inflateZlib(stream, LIMITS).output, expected)).toBe(true);
    expect(sameBytes(new Uint8Array(inflateSync(stream)), expected)).toBe(true);
  });
});

describe("모든 (길이, 거리) 조합: 동적 허프만 블록", () => {
  it("거리·길이 표본이 동적 블록에서도 정확히 되돌아온다", () => {
    const distances = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 16, 17, 24, 25, 32, 33, 64, 65, 255, 256, 257, 1000, 4096, 4097, 8193, 16_384, 24_576, 24_577, 32_768];
    for (const distance of distances) {
      for (const length of [3, 4, 11, 19, 35, 67, 131, 227, 258]) {
        const { stream, expected } = dynamicStream(matchTokens(distance, length, distance, distance * 17 + length));
        const result = inflateZlib(stream, LIMITS);
        if (!sameBytes(result.output, expected)) expect.fail(`동적: 거리 ${distance} 길이 ${length}`);
      }
    }
  });

  it("기대 크기를 알려 주는 경로와 알려 주지 않는 경로의 결과가 같다", () => {
    const { stream, expected } = dynamicStream(matchTokens(300, 200, 100, 9));

    expect(sameBytes(inflateZlib(stream, LIMITS).output, expected)).toBe(true);
    expect(sameBytes(inflateZlib(stream, { ...LIMITS, expectedBytes: expected.byteLength }).output, expected)).toBe(true);
  });
});

describe("출력 버퍼 경계", () => {
  it("리터럴만 14만 개(65,536과 131,072 경계를 지난다)를 되돌린다", () => {
    const next = mulberry32(5);
    const tokens: DeflateToken[] = Array.from({ length: 140_000 }, () => ({ kind: "literal", value: Math.floor(next() * 256) }));
    tokens.push({ kind: "endOfBlock" });
    const { stream, expected } = fixedStream(tokens);
    const result = inflateZlib(stream, { maxOutputBytes: 1 << 20 });

    expect(sameBytes(result.output, expected)).toBe(true);
  });

  it("Node가 허프만 전용으로 압축한 작은 알파벳 20만 바이트도 되돌린다", () => {
    const next = mulberry32(6);
    const data = Uint8Array.from({ length: 200_000 }, () => Math.floor(next() * 12));
    const stream = new Uint8Array(deflateSync(data, { strategy: constants.Z_HUFFMAN_ONLY }));

    expect(sameBytes(inflateZlib(stream, { maxOutputBytes: 1 << 20 }).output, data)).toBe(true);
  });

  it("일치 복사가 버퍼 끝을 넘겨 자라야 할 때도 정확하다(65,530바이트 뒤에 258바이트 일치)", () => {
    const tokens: DeflateToken[] = [
      ...matchTokens(65_530, 3, 1, 11).filter((token) => token.kind === "literal"),
      { kind: "match", length: 258, distance: 7 },
      { kind: "match", length: 258, distance: 300 },
      { kind: "endOfBlock" },
    ];
    const { stream, expected } = fixedStream(tokens);

    expect(sameBytes(inflateZlib(stream, LIMITS).output, expected)).toBe(true);
  });
});

describe("동적 블록의 드문 구조", () => {
  it("15비트 부호(길이 1,2,…,14,15,15)가 있는 리터럴/길이 부호를 해독한다", () => {
    const literalLengths = new Array<number>(257).fill(0);
    for (let symbol = 0; symbol < 14; symbol += 1) literalLengths[symbol] = symbol + 1;
    literalLengths[14] = 15;
    literalLengths[256] = 15;
    const tokens: DeflateToken[] = [
      ...Array.from({ length: 15 }, (_, value): DeflateToken => ({ kind: "literal", value })),
      ...[14, 13, 0, 7].map((value): DeflateToken => ({ kind: "literal", value })),
      { kind: "endOfBlock" },
    ];
    const expected = expandTokens(tokens);
    const stream = dynamicSpecStream({ literalLengths, distanceLengths: [1], tokens }, expected);

    expect(sameBytes(new Uint8Array(inflateSync(stream)), expected)).toBe(true);
    expect(sameBytes(inflateZlib(stream, LIMITS).output, expected)).toBe(true);
  });

  it("부호 길이 반복 심볼의 경계: 16은 6회, 18은 138회와 111회", () => {
    // 리터럴/길이 알파벳 257개 + 거리 1개 = 258개 길이. 심볼 0~6과 블록 끝(256)이 길이 3인 완전한 부호(8개 × 1/8).
    const literalLengths = new Array<number>(257).fill(0);
    for (let symbol = 0; symbol < 7; symbol += 1) literalLengths[symbol] = 3;
    literalLengths[256] = 3;
    const items: CodeLengthItem[] = [
      { symbol: 3 }, // 심볼 0
      { symbol: 16, extraValue: 3 }, // 앞의 길이(3)를 3 + 3 = 6회: 심볼 1~6
      { symbol: 18, extraValue: 127 }, // 11 + 127 = 138개 0: 심볼 7~144
      { symbol: 18, extraValue: 100 }, // 11 + 100 = 111개 0: 심볼 145~255
      { symbol: 3 }, // 심볼 256
      { symbol: 1 }, // 거리 심볼 0
    ];
    const tokens: DeflateToken[] = [0, 1, 2, 3, 4, 5, 6, 6, 0].map((value): DeflateToken => ({ kind: "literal", value }));
    tokens.push({ kind: "endOfBlock" });
    const expected = expandTokens(tokens);
    const stream = dynamicSpecStream({ literalLengths, distanceLengths: [1], tokens, codeLengthItems: items }, expected);

    expect(sameBytes(new Uint8Array(inflateSync(stream)), expected)).toBe(true);
    expect(sameBytes(inflateZlib(stream, LIMITS).output, expected)).toBe(true);
  });

  it("부호 길이 반복 심볼의 경계: 16은 3회, 17은 3회와 10회, 18은 138회와 100회", () => {
    // 심볼 0~3이 길이 3, 심볼 4와 블록 끝(256)이 길이 2인 완전한 부호(4/8 + 2/4 = 1).
    const literalLengths = new Array<number>(257).fill(0);
    for (let symbol = 0; symbol < 4; symbol += 1) literalLengths[symbol] = 3;
    literalLengths[4] = 2;
    literalLengths[256] = 2;
    const items: CodeLengthItem[] = [
      { symbol: 3 }, // 심볼 0
      { symbol: 16, extraValue: 0 }, // 3회: 심볼 1~3
      { symbol: 2 }, // 심볼 4
      { symbol: 17, extraValue: 7 }, // 3 + 7 = 10개 0
      { symbol: 17, extraValue: 0 }, // 3개 0
      { symbol: 18, extraValue: 127 }, // 138개 0
      { symbol: 18, extraValue: 89 }, // 100개 0 → 심볼 5~255 (10 + 3 + 138 + 100 = 251)
      { symbol: 2 }, // 심볼 256
      { symbol: 1 }, // 거리 심볼 0
    ];
    const tokens: DeflateToken[] = [4, 3, 2, 1, 0, 4].map((value): DeflateToken => ({ kind: "literal", value }));
    tokens.push({ kind: "endOfBlock" });
    const expected = expandTokens(tokens);
    const stream = dynamicSpecStream({ literalLengths, distanceLengths: [1], tokens, codeLengthItems: items }, expected);

    expect(sameBytes(new Uint8Array(inflateSync(stream)), expected)).toBe(true);
    expect(sameBytes(inflateZlib(stream, LIMITS).output, expected)).toBe(true);
  });

  it("가장 큰 알파벳(리터럴/길이 286, 거리 30)과 길이 부호 19개 전부를 쓰는 머리를 해독한다", () => {
    const literalLengths = huffmanLengths(new Array<number>(286).fill(1), 15);
    const distanceLengths = huffmanLengths(new Array<number>(30).fill(1), 15);
    const tokens: DeflateToken[] = [
      { kind: "literal", value: 9 },
      { kind: "literal", value: 200 },
      { kind: "match", length: 258, distance: 2 },
      { kind: "match", length: 3, distance: 1 },
      { kind: "endOfBlock" },
    ];
    const expected = expandTokens(tokens);
    // 19개 심볼이 모두 길이 4(13개) 또는 5(6개)인 완전한 부호: HCLEN = 15.
    const codeLengthLengths = [...new Array<number>(13).fill(4), ...new Array<number>(6).fill(5)];
    const stream = dynamicSpecStream({ literalLengths, distanceLengths, tokens, codeLengthLengths }, expected);

    expect(literalLengths).toHaveLength(286);
    expect(distanceLengths).toHaveLength(30);
    expect(sameBytes(new Uint8Array(inflateSync(stream)), expected)).toBe(true);
    expect(sameBytes(inflateZlib(stream, LIMITS).output, expected)).toBe(true);
  });

  it("거리 부호가 하나뿐이면(길이 1) 불완전한 부호도 받는다", () => {
    const tokens = matchTokens(30, 12, 9, 3);
    const { stream, expected } = dynamicStream(tokens);

    expect(sameBytes(new Uint8Array(inflateSync(stream)), expected)).toBe(true);
    expect(sameBytes(inflateZlib(stream, LIMITS).output, expected)).toBe(true);
  });

  it("거리 부호가 하나도 없어도(모두 0) 리터럴만 있는 블록은 받는다", () => {
    const literalFrequencies = new Array<number>(257).fill(0);
    literalFrequencies[65] = 3;
    literalFrequencies[256] = 1;
    const tokens: DeflateToken[] = [{ kind: "literal", value: 65 }, { kind: "literal", value: 65 }, { kind: "literal", value: 65 }, { kind: "endOfBlock" }];
    const expected = expandTokens(tokens);
    const stream = dynamicSpecStream({ literalLengths: huffmanLengths(literalFrequencies, 15), distanceLengths: [0], tokens }, expected);

    expect(sameBytes(new Uint8Array(inflateSync(stream)), expected)).toBe(true);
    expect(sameBytes(inflateZlib(stream, LIMITS).output, expected)).toBe(true);
  });

  it("리터럴/길이 부호가 블록 끝 하나뿐(길이 1)인 블록도 zlib처럼 받는다", () => {
    const literalLengths = new Array<number>(257).fill(0);
    literalLengths[256] = 1;
    const stream = dynamicSpecStream({ literalLengths, distanceLengths: [0], tokens: [{ kind: "endOfBlock" }] }, new Uint8Array(0));

    expect(sameBytes(new Uint8Array(inflateSync(stream)), new Uint8Array(0))).toBe(true);
    expect(inflateZlib(stream, LIMITS).output.byteLength).toBe(0);
  });
});

describe("여러 블록이 이어진 스트림", () => {
  it("저장 → 고정 → 동적 블록이 앞 블록의 출력을 가리키는 일치를 포함해 이어진다", () => {
    const writer = new DeflateBitWriter();
    const first = [10, 20, 30, 40];
    writeStoredBlock(writer, first, false);
    const fixedTokens: DeflateToken[] = [{ kind: "match", length: 9, distance: 4 }, { kind: "literal", value: 99 }, { kind: "endOfBlock" }];
    writeFixedBlock(writer, fixedTokens, false);
    const dynamicTokens: DeflateToken[] = [{ kind: "literal", value: 7 }, { kind: "match", length: 30, distance: 14 }, { kind: "endOfBlock" }];
    const spec = dynamicSpecFor(dynamicTokens);
    // 첫 두 블록이 낸 출력을 앞 문맥으로 쓰므로 거리 14는 유효하다(4 + 9 + 1 = 14바이트 뒤).
    writeDynamicBlock(writer, spec, true);
    const expected = expandTokens([
      ...first.map((value): DeflateToken => ({ kind: "literal", value })),
      ...fixedTokens,
      ...dynamicTokens,
    ]);
    const stream = zlibWrapRaw(writer.toBytes(), expected);

    expect(sameBytes(new Uint8Array(inflateSync(stream)), expected)).toBe(true);
    const result = inflateZlib(stream, LIMITS);
    expect(sameBytes(result.output, expected)).toBe(true);
    expect(result.consumedBytes).toBe(stream.byteLength);
  });

  it("최종 표시가 없는 블록 뒤에서 입력이 끝나면 truncated다", () => {
    const writer = new DeflateBitWriter();
    writeStoredBlock(writer, [1, 2, 3], false);
    const stream = zlibWrapRaw(writer.toBytes(), Uint8Array.of(1, 2, 3));

    expect(codeOf(() => inflateZlib(stream, LIMITS))).toBe("truncated");
  });

  it("최종 블록이 끝나면 뒤의 블록은 읽지 않는다", () => {
    const writer = new DeflateBitWriter();
    writeStoredBlock(writer, [1, 2], true);
    writeStoredBlock(writer, [9, 9, 9], true);
    const deflate = writer.toBytes();
    const firstBlockBytes = 1 + 4 + 2; // 헤더 바이트 + LEN/NLEN + 데이터
    const stream = zlibWrapRaw(deflate.subarray(0, firstBlockBytes), Uint8Array.of(1, 2));
    const withTail = new Uint8Array(stream.byteLength + (deflate.byteLength - firstBlockBytes));
    withTail.set(stream);
    withTail.set(deflate.subarray(firstBlockBytes), stream.byteLength);
    const result = inflateZlib(withTail, LIMITS);

    expect([...result.output]).toEqual([1, 2]);
    expect(result.consumedBytes).toBe(stream.byteLength);
  });
});

describe("손상·악의적 스트림: zlib도 거부하는 입력은 data 오류로 거부한다", () => {
  const eob: DeflateToken[] = [{ kind: "endOfBlock" }];
  const rejectedByBoth = (stream: Uint8Array, code: ZlibInflateErrorCode = "data"): void => {
    expect(() => inflateSync(stream)).toThrow();
    expect(codeOf(() => inflateZlib(stream, LIMITS))).toBe(code);
  };
  const literalLengthsWith = (assign: Record<number, number>): number[] => {
    const lengths = new Array<number>(257).fill(0);
    for (const [symbol, length] of Object.entries(assign)) lengths[Number(symbol)] = length;
    return lengths;
  };

  it("리터럴/길이 부호가 과다 구독이다", () => {
    rejectedByBoth(dynamicSpecStream({ literalLengths: literalLengthsWith({ 0: 1, 1: 1, 2: 1, 256: 2 }), distanceLengths: [1], tokens: eob }, new Uint8Array(0)));
  });

  it("리터럴/길이 부호가 불완전하다(길이 2가 둘뿐)", () => {
    rejectedByBoth(dynamicSpecStream({ literalLengths: literalLengthsWith({ 0: 2, 256: 2 }), distanceLengths: [1], tokens: eob }, new Uint8Array(0)));
  });

  it("거리 부호가 불완전하다(길이 2가 둘뿐, 둘 이상이라서 단일 부호 예외가 아니다)", () => {
    rejectedByBoth(
      dynamicSpecStream({ literalLengths: literalLengthsWith({ 0: 1, 256: 1 }), distanceLengths: [2, 2], tokens: eob }, new Uint8Array(0)),
    );
  });

  it("거리 부호가 과다 구독이다", () => {
    rejectedByBoth(
      dynamicSpecStream({ literalLengths: literalLengthsWith({ 0: 1, 256: 1 }), distanceLengths: [1, 1, 1], tokens: eob }, new Uint8Array(0)),
    );
  });

  it("블록 끝 심볼(256)에 부호가 없다", () => {
    const lengths = literalLengthsWith({ 0: 1, 1: 1 });
    const items = [...lengths, 1].map((symbol): CodeLengthItem => ({ symbol }));
    rejectedByBoth(dynamicSpecStream({ literalLengths: lengths, distanceLengths: [1], tokens: [{ kind: "literal", value: 0 }], codeLengthItems: items }, new Uint8Array(0)));
  });

  it("HLIT가 286을 넘는다(HLIT=30 → 287)", () => {
    const lengths = [...literalLengthsWith({ 0: 1, 256: 1 }), ...new Array<number>(30).fill(0)];
    expect(lengths.length).toBe(287);
    rejectedByBoth(dynamicSpecStream({ literalLengths: lengths, distanceLengths: [1], tokens: eob, hlit: 30 }, new Uint8Array(0)));
  });

  it("HDIST가 30을 넘는다(HDIST=30 → 31)", () => {
    rejectedByBoth(
      dynamicSpecStream({ literalLengths: literalLengthsWith({ 0: 1, 256: 1 }), distanceLengths: [1, ...new Array<number>(30).fill(0)], tokens: eob, hdist: 30 }, new Uint8Array(0)),
    );
  });

  it("길이 부호 16이 맨 앞에 와서 되풀이할 앞 길이가 없다", () => {
    const items: CodeLengthItem[] = [{ symbol: 16, extraValue: 0 }, ...new Array<CodeLengthItem>(255).fill({ symbol: 0 }), { symbol: 1 }, { symbol: 1 }];
    rejectedByBoth(dynamicSpecStream({ literalLengths: literalLengthsWith({ 256: 1 }), distanceLengths: [1], tokens: eob, codeLengthItems: items }, new Uint8Array(0)));
  });

  it("길이 부호의 반복이 전체 개수를 넘는다", () => {
    const items: CodeLengthItem[] = [...new Array<CodeLengthItem>(250).fill({ symbol: 0 }), { symbol: 18, extraValue: 127 }];
    rejectedByBoth(dynamicSpecStream({ literalLengths: literalLengthsWith({ 256: 1 }), distanceLengths: [1], tokens: eob, codeLengthItems: items }, new Uint8Array(0)));
  });

  it("길이 부호의 부호 자체가 과다 구독이거나 불완전하다", () => {
    const base = { literalLengths: literalLengthsWith({ 0: 1, 256: 1 }), distanceLengths: [1], tokens: eob };
    // 심볼 0, 1, 2에 모두 길이 1 → 과다 구독
    rejectedByBoth(dynamicSpecStream({ ...base, codeLengthLengths: [1, 1, 1, ...new Array<number>(16).fill(0)] }, new Uint8Array(0)));
    // 심볼 0, 1에 길이 2 → 불완전
    rejectedByBoth(dynamicSpecStream({ ...base, codeLengthLengths: [2, 2, ...new Array<number>(17).fill(0)] }, new Uint8Array(0)));
  });

  it("길이 부호의 부호가 모두 0이다", () => {
    rejectedByBoth(dynamicSpecStream({ literalLengths: literalLengthsWith({ 0: 1, 256: 1 }), distanceLengths: [1], tokens: [], codeLengthLengths: new Array<number>(19).fill(0), codeLengthItems: [], hclen: 0 }, new Uint8Array(0)));
  });

  it("길이 2짜리가 셋뿐인 부호도, 15비트 자리 하나만 빈 부호도 불완전하다고 거부한다", () => {
    const messageFor = (spec: DynamicBlockSpec): string => {
      try {
        inflateZlib(dynamicSpecStream(spec, new Uint8Array(0)), LIMITS);
      } catch (error) {
        return (error as Error).message;
      }
      return "오류 없음";
    };
    const threeOfTwo = literalLengthsWith({ 0: 2, 1: 2, 256: 2 });
    rejectedByBoth(dynamicSpecStream({ literalLengths: threeOfTwo, distanceLengths: [1], tokens: eob }, new Uint8Array(0)));
    expect(messageFor({ literalLengths: threeOfTwo, distanceLengths: [1], tokens: eob })).toBe("허프만 부호가 불완전하다");
    rejectedByBoth(dynamicSpecStream({ literalLengths: literalLengthsWith({ 0: 1, 256: 1 }), distanceLengths: [2, 2, 2], tokens: eob }, new Uint8Array(0)));

    // 길이 1, 2, ..., 14, 15를 하나씩 쓰면 합이 1 - 2^-15라서 15비트 자리 하나만 비어 있다(완전하려면 15비트 부호가 둘이어야 한다).
    const almostComplete = Array.from({ length: 15 }, (_, index) => index + 1);
    const literalAlmost = literalLengthsWith({ ...Object.fromEntries(almostComplete.slice(0, 14).map((length, symbol) => [symbol, length])), 256: 15 });
    rejectedByBoth(dynamicSpecStream({ literalLengths: literalAlmost, distanceLengths: [1], tokens: eob }, new Uint8Array(0)));
    expect(messageFor({ literalLengths: literalAlmost, distanceLengths: [1], tokens: eob })).toBe("허프만 부호가 불완전하다");
    rejectedByBoth(dynamicSpecStream({ literalLengths: literalLengthsWith({ 0: 1, 256: 1 }), distanceLengths: almostComplete, tokens: eob }, new Uint8Array(0)));
    expect(messageFor({ literalLengths: literalLengthsWith({ 0: 1, 256: 1 }), distanceLengths: almostComplete, tokens: eob })).toBe("허프만 부호가 불완전하다");
  });

  it("부호가 하나도 없는 거리 표로 거리를 읽으려 하면 잘못된 부호다(조용히 거리 1로 읽지 않는다)", () => {
    const literalLengths = literalLengthsWith({ 0: 2, 1: 2, 256: 2, 257: 2 });
    const stream = dynamicSpecStream(
      { literalLengths, distanceLengths: [0], tokens: [{ kind: "literal", value: 0 }, { kind: "rawLiteralLengthSymbol", symbol: 257 }, { kind: "endOfBlock" }, { kind: "endOfBlock" }] },
      new Uint8Array(0),
    );

    expect(() => inflateSync(stream)).toThrow();
    try {
      inflateZlib(stream, LIMITS);
      expect.fail("오류가 나야 한다");
    } catch (error) {
      expect((error as ZlibInflateError).code).toBe("data");
      expect((error as Error).message).toBe("잘못된 허프만 부호");
    }
  });

  it("부호가 하나뿐인(길이 1) 리터럴 표에서 배정되지 않은 비트가 오면 잘못된 부호다", () => {
    const writer = new DeflateBitWriter();
    writeDynamicBlock(writer, { literalLengths: literalLengthsWith({ 256: 1 }), distanceLengths: [1], tokens: [] }, true);
    writer.bits(1, 1); // 256에는 '0'만 배정돼 있다.

    expect(() => inflateSync(zlibWrapRaw(writer.toBytes(), new Uint8Array(0)))).toThrow();
    try {
      inflateZlib(zlibWrapRaw(writer.toBytes(), new Uint8Array(0)), LIMITS);
      expect.fail("오류가 나야 한다");
    } catch (error) {
      expect((error as ZlibInflateError).code).toBe("data");
      expect((error as Error).message).toBe("잘못된 허프만 부호");
    }
  });

  it("고정 블록에 쓸 수 없는 길이 심볼(286, 287)이 나온다", () => {
    for (const symbol of [286, 287]) {
      const writer = new DeflateBitWriter();
      writeFixedBlock(writer, [{ kind: "literal", value: 1 }, { kind: "rawLiteralLengthSymbol", symbol }, { kind: "endOfBlock" }], true);
      rejectedByBoth(zlibWrapRaw(writer.toBytes(), Uint8Array.of(1)));
    }
  });

  it("고정 블록에 쓸 수 없는 거리 심볼(30, 31)이 나온다", () => {
    for (const symbol of [30, 31]) {
      const writer = new DeflateBitWriter();
      writeFixedBlock(writer, [{ kind: "literal", value: 1 }, { kind: "literal", value: 2 }, { kind: "literal", value: 3 }, { kind: "rawLiteralLengthSymbol", symbol: 257 }, { kind: "rawDistanceSymbol", symbol }, { kind: "endOfBlock" }], true);
      rejectedByBoth(zlibWrapRaw(writer.toBytes(), Uint8Array.of(1, 2, 3)));
    }
  });

  it("거리가 이미 만든 출력보다 멀다(출력이 3바이트일 때 거리 4)", () => {
    const { stream } = fixedStream([{ kind: "literal", value: 1 }, { kind: "literal", value: 2 }, { kind: "literal", value: 3 }, { kind: "match", length: 3, distance: 4 }, { kind: "endOfBlock" }]);
    rejectedByBoth(stream);
  });

  it("거리가 정확히 출력 길이와 같으면 받는다(경계)", () => {
    const { stream, expected } = fixedStream([{ kind: "literal", value: 1 }, { kind: "literal", value: 2 }, { kind: "literal", value: 3 }, { kind: "match", length: 3, distance: 3 }, { kind: "endOfBlock" }]);

    expect([...expected]).toEqual([1, 2, 3, 1, 2, 3]);
    expect([...inflateZlib(stream, LIMITS).output]).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it("출력이 아직 없을 때 일치가 나온다", () => {
    const writer = new DeflateBitWriter();
    writeFixedBlock(writer, [{ kind: "rawLiteralLengthSymbol", symbol: 257 }, { kind: "rawDistanceSymbol", symbol: 0 }, { kind: "endOfBlock" }], true);
    rejectedByBoth(zlibWrapRaw(writer.toBytes(), new Uint8Array(0)));
  });
});

describe("잘린 스트림: 올바른 스트림의 모든 접두는 truncated다", () => {
  const next = mulberry32(77);
  const mixed = Uint8Array.from({ length: 3000 }, (_, index) => (index % 7 === 0 ? Math.floor(next() * 256) : index % 5));
  const streams: Array<[string, Uint8Array]> = [
    ["고정(리터럴과 일치)", fixedStream(matchTokens(40, 30, 17, 1)).stream],
    ["동적(리터럴과 일치)", dynamicStream(matchTokens(200, 77, 130, 2)).stream],
    ["저장 블록", zlibWrapRaw(new DeflateBitWriter().bits(1, 1).bits(0, 2).rawBytes([3, 0, 0xfc, 0xff, 1, 2, 3]).toBytes(), Uint8Array.of(1, 2, 3))],
    ["Node 수준 6", new Uint8Array(deflateSync(mixed, { level: 6 }))],
    ["Node 수준 1", new Uint8Array(deflateSync(mixed, { level: 1 }))],
    ["Node 고정 전략", new Uint8Array(deflateSync(mixed, { strategy: constants.Z_FIXED }))],
    ["Node 허프만 전용", new Uint8Array(deflateSync(mixed, { strategy: constants.Z_HUFFMAN_ONLY }))],
  ];

  it.each(streams)("%s: 길이 0부터 전체 길이 − 1까지 모든 접두가 truncated다", (_name, stream) => {
    expect(codeOf(() => inflateZlib(stream, LIMITS))).toBe("none");
    for (let length = 0; length < stream.byteLength; length += 1) {
      const code = codeOf(() => inflateZlib(stream.subarray(0, length), LIMITS));
      if (code !== "truncated") expect.fail(`길이 ${length}/${stream.byteLength}: ${code}`);
    }
  });
});

describe("고정 허프만 전략으로 만든 Node 스트림", () => {
  it("모든 바이트 값(0~255, 144 이상은 9비트 부호)과 먼 거리 일치를 포함한 입력을 되돌린다", () => {
    const next = mulberry32(88);
    const noise = Uint8Array.from({ length: 40_000 }, () => Math.floor(next() * 256));
    const data = new Uint8Array(noise.byteLength + 3000);
    data.set(noise);
    // 마지막 3000바이트는 앞쪽(거리 30000 안팎)을 되풀이한다 → 먼 거리 심볼(24577~32768)을 쓴다.
    for (let index = 0; index < 3000; index += 1) data[noise.byteLength + index] = noise[noise.byteLength - 31_000 + index]!;
    for (const level of [1, 4, 9]) {
      const stream = new Uint8Array(deflateSync(data, { level, strategy: constants.Z_FIXED }));
      expect(sameBytes(inflateZlib(stream, LIMITS).output, data)).toBe(true);
    }
  });
});

describe("DEFLATE 블록 수 상한(maxBlocks)", () => {
  /** 바이트 하나씩 담은 저장 블록 `count`개로 이루어진 스트림. 마지막 블록만 final이다. */
  function storedBlocksStream(count: number, final = true): Uint8Array {
    const writer = new DeflateBitWriter();
    const original: number[] = [];
    for (let index = 0; index < count; index += 1) {
      original.push(index & 255);
      writeStoredBlock(writer, [index & 255], final && index === count - 1);
    }
    return zlibWrapRaw(writer.toBytes(), Uint8Array.from(original));
  }

  it("결과가 푼 DEFLATE 블록 수를 알리고 상한이 없으면 얼마든 푼다", () => {
    for (const count of [1, 2, 5, 300]) {
      const result = inflateZlib(storedBlocksStream(count), LIMITS);
      expect(result.blocks).toBe(count);
      expect(result.output.byteLength).toBe(count);
    }
  });

  it("고정·동적·저장 블록을 섞어도 블록 수를 센다", () => {
    const writer = new DeflateBitWriter();
    const tokens: DeflateToken[] = [{ kind: "literal", value: 65 }, { kind: "endOfBlock" }];
    writeFixedBlock(writer, tokens, false);
    writeStoredBlock(writer, [66], false);
    writeDynamicBlock(writer, dynamicSpecFor(matchTokens(8, 5, 3, 9)), true);
    const original = Uint8Array.from([65, 66, ...expandTokens(matchTokens(8, 5, 3, 9))]);
    const result = inflateZlib(zlibWrapRaw(writer.toBytes(), original), LIMITS);

    expect(result.blocks).toBe(3);
    expect(sameBytes(result.output, original)).toBe(true);
  });

  it("상한과 같은 수의 블록은 풀리고 하나 더 있으면 limit이다(경계)", () => {
    for (const count of [1, 2, 7, 256]) {
      const stream = storedBlocksStream(count);
      expect(inflateZlib(stream, { ...LIMITS, maxBlocks: count }).blocks).toBe(count);
      expect(inflateZlib(stream, { ...LIMITS, maxBlocks: count + 1 }).blocks).toBe(count);
      if (count > 1) expect(codeOf(() => inflateZlib(stream, { ...LIMITS, maxBlocks: count - 1 }))).toBe("limit");
    }
  });

  it("상한을 넘으면 메시지에 상한 값이 든다", () => {
    let thrown: unknown;
    try {
      inflateZlib(storedBlocksStream(5), { ...LIMITS, maxBlocks: 4 });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ZlibInflateError);
    expect((thrown as ZlibInflateError).message).toBe("DEFLATE 블록이 상한 4개를 넘는다");
  });

  it("끝나지 않는 스트림도 입력을 다 읽기 전에 상한에서 멈춘다(truncated보다 limit이 먼저다)", () => {
    const endless = storedBlocksStream(300, false);

    expect(codeOf(() => inflateZlib(endless, LIMITS))).toBe("truncated");
    expect(codeOf(() => inflateZlib(endless, { ...LIMITS, maxBlocks: 256 }))).toBe("limit");
    expect(codeOf(() => inflateZlib(endless, { ...LIMITS, maxBlocks: 1000 }))).toBe("truncated");
  });

  it("출력이 없는 빈 저장 블록만 이어진 스트림도 상한이 막는다", () => {
    const writer = new DeflateBitWriter();
    for (let index = 0; index < 2000; index += 1) writeStoredBlock(writer, [], false);
    const stream = zlibWrapRaw(writer.toBytes(), new Uint8Array(0));

    expect(codeOf(() => inflateZlib(stream, { ...LIMITS, maxBlocks: 256 }))).toBe("limit");
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])("maxBlocks=%s는 RangeError다", (maxBlocks) => {
    expect(() => inflateZlib(storedBlocksStream(1), { ...LIMITS, maxBlocks })).toThrow(new RangeError("maxBlocks는 1 이상의 정수여야 한다"));
  });

  it("maxBlocks=1은 올바른 값이다", () => {
    expect(inflateZlib(storedBlocksStream(1), { ...LIMITS, maxBlocks: 1 }).blocks).toBe(1);
  });
});

describe("동적 블록 머리의 오류 문구", () => {
  /** 동적 블록(BFINAL=1) 머리: HLIT=0(리터럴 257개), HDIST=0(거리 1개), 코드 길이 부호 길이 `lengths`(HCLEN=0이면 4개: 16, 17, 18, 0 순서). */
  function dynamicHeader(lengths: readonly number[]): DeflateBitWriter {
    const writer = new DeflateBitWriter();
    writer.bits(1, 1).bits(2, 2).bits(0, 5).bits(0, 5).bits(lengths.length - 4, 4);
    for (const length of lengths) writer.bits(length, 3);
    return writer;
  }
  const messageOf = (writer: DeflateBitWriter): string => {
    try {
      inflateZlib(zlibWrapRaw(writer.toBytes(), new Uint8Array(0)), LIMITS);
    } catch (error) {
      return `${(error as ZlibInflateError).code}: ${(error as Error).message}`;
    }
    return "오류 없음";
  };

  it("코드 길이 부호가 하나도 없으면 비었다고 알린다", () => {
    expect(messageOf(dynamicHeader([0, 0, 0, 0]))).toBe("data: 허프만 부호가 비어 있다");
  });

  it("코드 길이 부호는 길이 1짜리 하나만 있어도 불완전하다(리터럴·거리 부호와 달리 예외가 없다)", () => {
    expect(messageOf(dynamicHeader([0, 0, 0, 1]))).toBe("data: 허프만 부호가 불완전하다");
    expect(messageOf(dynamicHeader([1, 0, 0, 0]))).toBe("data: 허프만 부호가 불완전하다");
  });

  it("길이 부호 16이 맨 앞에 오면 되풀이할 앞 길이가 없다고 알린다", () => {
    // 코드 길이 부호: 심볼 0과 16이 각각 1비트(완전). 정규 부호는 번호 순서라 0 → '0', 16 → '1'이다.
    const writer = dynamicHeader([1, 0, 0, 1]);
    writer.code(1, 1).bits(0, 2);

    expect(messageOf(writer)).toBe("data: 반복할 이전 길이가 없다");
  });

  it("코드 길이 반복이 길이 목록을 넘으면 그 자리에서 알린다", () => {
    // 코드 길이 부호: 심볼 0과 18이 각각 1비트(완전). 18 + 7비트 127 = 0을 138번 → 두 번이면 276 > 258(= 257 + 1).
    const writer = dynamicHeader([0, 0, 1, 1]);
    writer.code(1, 1).bits(127, 7).code(1, 1).bits(127, 7);

    expect(messageOf(writer)).toBe("data: 부호 길이 반복이 범위를 넘는다");
  });

  it("반복이 길이 목록과 정확히 맞아떨어지면 넘치지 않은 것이다(경계)", () => {
    // 0을 138번 + 120번 = 258번 = 목록 길이. 그 뒤에는 블록 끝 심볼의 길이가 0이라는 오류가 나야 한다.
    const writer = dynamicHeader([0, 0, 1, 1]);
    writer.code(1, 1).bits(127, 7).code(1, 1).bits(109, 7);

    expect(messageOf(writer)).toBe("data: 블록 끝 심볼의 부호가 없다");
  });
});
