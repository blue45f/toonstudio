import { constants, deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { inflateZlib, ZlibInflateError, type ZlibInflateErrorCode } from "../zlib-inflate";

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBytes(length: number, seed: number): Uint8Array {
  const next = mulberry32(seed);
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) bytes[index] = Math.floor(next() * 256);
  return bytes;
}

/** 압축이 잘 되는 입력: 짧은 알파벳과 되풀이되는 구간이 섞여 있다. */
function textLike(length: number, seed: number): Uint8Array {
  const next = mulberry32(seed);
  const words = ["pixel", "layer", "alpha", "block", "tile", "mask", "stroke", "canvas"];
  const encoder = new TextEncoder();
  const parts: number[] = [];
  while (parts.length < length) parts.push(...encoder.encode(`${words[Math.floor(next() * words.length)]!} ${Math.floor(next() * 1000)}\n`));
  return Uint8Array.from(parts.slice(0, length));
}

function runs(length: number, seed: number): Uint8Array {
  const next = mulberry32(seed);
  const bytes = new Uint8Array(length);
  let index = 0;
  while (index < length) {
    const value = Math.floor(next() * 256);
    const run = 1 + Math.floor(next() * 600);
    for (let fill = 0; fill < run && index < length; fill += 1) bytes[index++] = value;
  }
  return bytes;
}

/** 큰 버퍼는 vitest의 깊은 비교가 매우 느리므로(1MiB에 수 초) 바이트 비교로 대신한다. */
function expectSameBytes(actual: Uint8Array, expected: Uint8Array, label: string): void {
  expect(actual.byteLength, `${label}: 길이`).toBe(expected.byteLength);
  if (Buffer.compare(actual, expected) === 0) return;
  let index = 0;
  while (actual[index] === expected[index]) index += 1;
  expect.fail(`${label}: ${index}번째 바이트가 다르다 (${actual[index]} != ${expected[index]})`);
}

function codeOf(action: () => unknown): ZlibInflateErrorCode | "other" | "none" {
  try {
    action();
    return "none";
  } catch (error) {
    return error instanceof ZlibInflateError ? error.code : "other";
  }
}

const limits = { maxOutputBytes: 1 << 26 };

function messageOf(bytes: Uint8Array, options = limits): string {
  try {
    inflateZlib(bytes, options);
  } catch (error) {
    return (error as Error).message;
  }
  return "오류 없음";
}

describe("inflateZlib: Node zlib을 오라클로 삼은 대조", () => {
  const corpus: Array<[string, Uint8Array]> = [
    ["빈 입력", new Uint8Array(0)],
    ["1바이트", Uint8Array.of(7)],
    ["0..255 증가", Uint8Array.from({ length: 256 }, (_, index) => index)],
    ["0이 1MiB", new Uint8Array(1 << 20)],
    ["무작위 4KiB(압축 불가)", randomBytes(4096, 1)],
    ["무작위 70000바이트(저장 블록이 여럿)", randomBytes(70_000, 2)],
    ["글자 모양 30000바이트", textLike(30_000, 3)],
    ["되풀이 구간 100000바이트", runs(100_000, 4)],
    ["327680바이트(블록 크기) 되풀이", runs(327_680, 5)],
  ];

  it.each(corpus)("%s: 모든 압축 수준에서 왕복한다", (_name, data) => {
    for (let level = 0; level <= 9; level += 1) {
      const compressed = new Uint8Array(deflateSync(data, { level }));
      const result = inflateZlib(compressed, limits);
      expectSameBytes(result.output, data, `level ${level}`);
      expect(result.consumedBytes).toBe(compressed.byteLength);
    }
  });

  it("압축 전략(기본·FILTERED·HUFFMAN_ONLY·RLE·FIXED)과 memLevel·창 크기를 바꿔도 왕복한다", () => {
    const strategies = [
      constants.Z_DEFAULT_STRATEGY,
      constants.Z_FILTERED,
      constants.Z_HUFFMAN_ONLY,
      constants.Z_RLE,
      constants.Z_FIXED,
    ];
    const inputs = [textLike(20_000, 11), runs(40_000, 12), randomBytes(5_000, 13)];
    for (const data of inputs) {
      for (const strategy of strategies) {
        for (const memLevel of [1, 5, 9]) {
          for (const windowBits of [9, 12, 15]) {
            const compressed = new Uint8Array(deflateSync(data, { level: 6, strategy, memLevel, windowBits }));
            const label = `strategy ${strategy} memLevel ${memLevel} windowBits ${windowBits}`;
            expectSameBytes(inflateZlib(compressed, limits).output, data, label);
          }
        }
      }
    }
  });

  it("무작위 입력 300건(길이·내용·수준·전략 무작위)을 모두 되돌린다", () => {
    const next = mulberry32(99);
    for (let trial = 0; trial < 300; trial += 1) {
      const length = Math.floor(next() * next() * 20_000);
      const kind = Math.floor(next() * 3);
      const seed = Math.floor(next() * 1e9);
      const data = kind === 0 ? randomBytes(length, seed) : kind === 1 ? textLike(length, seed) : runs(length, seed);
      const level = Math.floor(next() * 10);
      const strategy = [constants.Z_DEFAULT_STRATEGY, constants.Z_FILTERED, constants.Z_HUFFMAN_ONLY, constants.Z_RLE, constants.Z_FIXED][Math.floor(next() * 5)]!;
      const compressed = new Uint8Array(deflateSync(data, { level, strategy }));
      expectSameBytes(inflateZlib(compressed, limits).output, data, `trial ${trial}`);
    }
  });

  it("스트림 뒤의 군더더기는 읽지 않고 소비한 바이트 수만 알린다", () => {
    const data = textLike(2_000, 21);
    const compressed = new Uint8Array(deflateSync(data));
    const withTail = new Uint8Array(compressed.byteLength + 5);
    withTail.set(compressed);
    withTail.set([1, 2, 3, 4, 5], compressed.byteLength);
    const result = inflateZlib(withTail, limits);
    expect(result.output).toEqual(data);
    expect(result.consumedBytes).toBe(compressed.byteLength);
  });

  it("Node가 만든 결과와 같은 버퍼 내용을 입력 별칭 없이 돌려준다", () => {
    const compressed = new Uint8Array(deflateSync(textLike(500, 31)));
    const before = Uint8Array.from(compressed);
    const first = inflateZlib(compressed, limits).output;
    first.fill(0);
    expect(compressed).toEqual(before);
    expect(inflateZlib(compressed, limits).output).not.toEqual(first);
  });
});

describe("inflateZlib: 손으로 쓴 알려진 스트림", () => {
  it("빈 저장 블록", () => {
    // 78 01 | 01 (BFINAL=1, BTYPE=00) 00 00 ff ff | adler32("") = 00 00 00 01
    const result = inflateZlib(Uint8Array.of(0x78, 0x01, 0x01, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0x00, 0x01), limits);
    expect(result.output).toEqual(new Uint8Array(0));
    expect(result.consumedBytes).toBe(11);
  });

  it("고정 허프만 블록 하나(\"a\")", () => {
    // 78 9c | 4b 04 00 (고정 허프만, 리터럴 'a', 블록 끝) | adler32("a") = 00 62 00 62
    const result = inflateZlib(Uint8Array.of(0x78, 0x9c, 0x4b, 0x04, 0x00, 0x00, 0x62, 0x00, 0x62), limits);
    expect(new TextDecoder().decode(result.output)).toBe("a");
  });

  it("저장 블록에 든 바이트를 그대로 낸다", () => {
    // 78 01 | 01 03 00 fc ff 'a' 'b' 'c' | adler32("abc") = 02 4d 01 27
    const stream = Uint8Array.of(0x78, 0x01, 0x01, 0x03, 0x00, 0xfc, 0xff, 0x61, 0x62, 0x63, 0x02, 0x4d, 0x01, 0x27);
    expect(new TextDecoder().decode(inflateZlib(stream, limits).output)).toBe("abc");
  });
});

describe("inflateZlib: 헤더와 체크섬", () => {
  const good = new Uint8Array(deflateSync(textLike(1_000, 41)));

  it("압축 방식이 deflate가 아니면 header 오류다(검사값은 맞춰 둬서 방식만 틀린 헤더)", () => {
    const stream = Uint8Array.from(good);
    stream[0] = 0x79; // 방식 9, 창 크기 지수 7
    stream[1] = (31 - ((0x79 << 8) % 31)) % 31;
    expect(((stream[0] << 8) | stream[1]) % 31).toBe(0);

    expect(codeOf(() => inflateZlib(stream, limits))).toBe("header");
    expect(messageOf(stream)).toBe("압축 방식이 deflate(8)가 아니다");
  });

  it("창 크기 지수가 7을 넘으면 header 오류다", () => {
    const stream = Uint8Array.from(good);
    stream[0] = 0x88;
    stream[1] = (31 - (((0x88 << 8) | 0) % 31)) % 31;
    expect(codeOf(() => inflateZlib(stream, limits))).toBe("header");
  });

  it("헤더 검사값이 틀리면 header 오류다", () => {
    const stream = Uint8Array.from(good);
    stream[1] = (stream[1]! + 1) & 0xff;
    expect(codeOf(() => inflateZlib(stream, limits))).toBe("header");
  });

  it("사전(FDICT)이 필요한 스트림은 dictionary 오류다", () => {
    const stream = Uint8Array.from(good);
    stream[1] = (stream[1]! & 0x1f) | 0x20;
    stream[1] = (stream[1]! & ~0x1f) | ((31 - (((stream[0]! << 8) | (stream[1]! & ~0x1f)) % 31)) % 31);
    expect(codeOf(() => inflateZlib(stream, limits))).toBe("dictionary");
  });

  it("2바이트보다 짧으면 truncated다", () => {
    expect(codeOf(() => inflateZlib(new Uint8Array(0), limits))).toBe("truncated");
    expect(codeOf(() => inflateZlib(Uint8Array.of(0x78), limits))).toBe("truncated");
  });

  it("끝의 Adler-32가 틀리면 checksum 오류이고 skipChecksum이면 통과한다", () => {
    const stream = Uint8Array.from(good);
    stream[stream.byteLength - 1] = (stream[stream.byteLength - 1]! ^ 0xff) & 0xff;
    expect(codeOf(() => inflateZlib(stream, limits))).toBe("checksum");
    expect(inflateZlib(stream, { ...limits, skipChecksum: true }).output).toEqual(textLike(1_000, 41));
  });

  it("Adler-32 4바이트가 없으면 truncated다", () => {
    expect(codeOf(() => inflateZlib(good.subarray(0, good.byteLength - 1), limits))).toBe("truncated");
  });

  it("잘림 메시지는 어디서 끊겼는지 구분하고 입력이 정확히 거기서 끝나는 경계에서도 맞다", () => {
    // zlib 헤더(2바이트) 자체가 모자라다 / 헤더만 있고 DEFLATE 블록이 없다
    expect(messageOf(Uint8Array.of(0x78))).toBe("zlib 헤더가 중간에 끝났다");
    expect(messageOf(Uint8Array.of(0x78, 0x01))).toBe("DEFLATE 스트림이 중간에 끝났다");
    // 저장 블록 머리(LEN/NLEN 4바이트)가 입력 끝과 정확히 맞는다 → 머리는 읽히고 Adler-32가 없다
    expect(messageOf(Uint8Array.of(0x78, 0x01, 0x01, 0x00, 0x00, 0xff, 0xff))).toBe("Adler-32 값이 중간에 끝났다");
    // 머리가 한 바이트 모자라다
    expect(messageOf(Uint8Array.of(0x78, 0x01, 0x01, 0x00, 0x00, 0xff))).toBe("저장 블록 헤더가 중간에 끝났다");
    // 저장 블록 데이터가 입력 끝과 정확히 맞는다 → 데이터는 읽히고 Adler-32가 없다 / 데이터가 한 바이트 모자라다
    expect(messageOf(Uint8Array.of(0x78, 0x01, 0x01, 0x03, 0x00, 0xfc, 0xff, 0x61, 0x62, 0x63))).toBe("Adler-32 값이 중간에 끝났다");
    expect(messageOf(Uint8Array.of(0x78, 0x01, 0x01, 0x03, 0x00, 0xfc, 0xff, 0x61, 0x62))).toBe("저장 블록이 중간에 끝났다");
  });
});

describe("inflateZlib: 상한과 기대 크기", () => {
  const data = textLike(10_000, 51);
  const compressed = new Uint8Array(deflateSync(data));

  it("출력이 maxOutputBytes를 넘으면 limit이다(경계 포함)", () => {
    expect(codeOf(() => inflateZlib(compressed, { maxOutputBytes: data.byteLength - 1 }))).toBe("limit");
    expectSameBytes(inflateZlib(compressed, { maxOutputBytes: data.byteLength }).output, data, "경계");
  });

  it("마지막 바이트가 리터럴이어도 출력이 상한과 같으면 통과하고 1 작으면 limit이다(경계)", () => {
    const literalOnly = new Uint8Array(deflateSync(Uint8Array.of(7, 8, 9), { strategy: constants.Z_HUFFMAN_ONLY }));

    expect([...inflateZlib(literalOnly, { maxOutputBytes: 3 }).output]).toEqual([7, 8, 9]);
    expect([...inflateZlib(literalOnly, { maxOutputBytes: 3, expectedBytes: 3 }).output]).toEqual([7, 8, 9]);
    expect(codeOf(() => inflateZlib(literalOnly, { maxOutputBytes: 2 }))).toBe("limit");
  });

  it("저장 블록도 상한을 넘으면 limit이다", () => {
    const stored = new Uint8Array(deflateSync(randomBytes(3_000, 52), { level: 0 }));
    expect(codeOf(() => inflateZlib(stored, { maxOutputBytes: 2_999 }))).toBe("limit");
  });

  it("expectedBytes와 길이가 같을 때만 통과하고 짧으면 data, 길면 limit이다", () => {
    expectSameBytes(inflateZlib(compressed, { maxOutputBytes: 1 << 20, expectedBytes: data.byteLength }).output, data, "기대 크기");
    expect(codeOf(() => inflateZlib(compressed, { maxOutputBytes: 1 << 20, expectedBytes: data.byteLength + 1 }))).toBe("data");
    expect(codeOf(() => inflateZlib(compressed, { maxOutputBytes: 1 << 20, expectedBytes: data.byteLength - 1 }))).toBe("limit");
  });

  it("압축 폭탄(0이 128MiB)은 상한 1MiB에서 바로 limit으로 끝난다", () => {
    const bomb = new Uint8Array(deflateSync(new Uint8Array(128 << 20), { level: 9 }));
    expect(bomb.byteLength).toBeLessThan(200_000);
    const started = performance.now();
    expect(codeOf(() => inflateZlib(bomb, { maxOutputBytes: 1 << 20 }))).toBe("limit");
    expect(performance.now() - started).toBeLessThan(2_000);
  });

  it.each([
    ["음수 상한", { maxOutputBytes: -1 }, "maxOutputBytes는 0 이상의 정수여야 한다"],
    ["소수 상한", { maxOutputBytes: 1.5 }, "maxOutputBytes는 0 이상의 정수여야 한다"],
    ["NaN 상한", { maxOutputBytes: Number.NaN }, "maxOutputBytes는 0 이상의 정수여야 한다"],
    ["무한 상한", { maxOutputBytes: Number.POSITIVE_INFINITY }, "maxOutputBytes는 0 이상의 정수여야 한다"],
    ["상한보다 큰 기대 크기", { maxOutputBytes: 10, expectedBytes: 11 }, "expectedBytes는 0 이상 maxOutputBytes 이하의 정수여야 한다"],
    ["음수 기대 크기", { maxOutputBytes: 10, expectedBytes: -1 }, "expectedBytes는 0 이상 maxOutputBytes 이하의 정수여야 한다"],
    ["소수 기대 크기", { maxOutputBytes: 10, expectedBytes: 1.5 }, "expectedBytes는 0 이상 maxOutputBytes 이하의 정수여야 한다"],
    ["NaN 기대 크기", { maxOutputBytes: 10, expectedBytes: Number.NaN }, "expectedBytes는 0 이상 maxOutputBytes 이하의 정수여야 한다"],
  ])("옵션 오류: %s는 RangeError다", (_name, options, message) => {
    expect(() => inflateZlib(compressed, options)).toThrow(new RangeError(message));
  });

  it("상한 0과 기대 크기 0은 올바른 값이다(빈 출력). 한 바이트라도 나오면 상한 0은 limit이다", () => {
    const empty = Uint8Array.of(0x78, 0x01, 0x01, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0x00, 0x01);
    const a = Uint8Array.of(0x78, 0x9c, 0x4b, 0x04, 0x00, 0x00, 0x62, 0x00, 0x62);

    expect(inflateZlib(empty, { maxOutputBytes: 0 }).output.byteLength).toBe(0);
    expect(inflateZlib(empty, { maxOutputBytes: 0, expectedBytes: 0 }).output.byteLength).toBe(0);
    expect(inflateZlib(empty, { maxOutputBytes: 5, expectedBytes: 0 }).output.byteLength).toBe(0);
    expect(codeOf(() => inflateZlib(a, { maxOutputBytes: 0 }))).toBe("limit");
    expect(codeOf(() => inflateZlib(a, { maxOutputBytes: 1, expectedBytes: 0 }))).toBe("limit");
  });

  it("출력이 상한과 정확히 같은 크기까지 자라는 경우도 버퍼를 한 번에 키워 받는다(저장 블록 100,000바이트, 상한 100,000)", () => {
    const original = randomBytes(100_000, 53);
    const stored = new Uint8Array(deflateSync(original, { level: 0 }));
    const result = inflateZlib(stored, { maxOutputBytes: 100_000 });

    expectSameBytes(result.output, original, "상한과 같은 크기");
    expect(codeOf(() => inflateZlib(stored, { maxOutputBytes: 99_999 }))).toBe("limit");
  });

  it("버퍼를 처음 키우는 한 걸음이 곧바로 상한에 닿아도 받는다(초기 용량 65,536바이트, 출력 65,537바이트, 상한 65,537)", () => {
    // 같은 바이트 65,536개 뒤에 다른 바이트 하나: 마지막 심볼이 리터럴 하나라 그 한 걸음(필요한 크기 65,537)이 처음으로 용량을 넘고 상한과 같다.
    // 키운 크기가 필요한 크기와 같을 때 한 번 더 키우려 들면 상한에서 더 자라지 못해 끝나지 않는다.
    const original = new Uint8Array(65_537).fill(7);
    original[65_536] = 9;
    const stream = new Uint8Array(deflateSync(original));

    expectSameBytes(inflateZlib(stream, { maxOutputBytes: 65_537 }).output, original, "처음 키운 크기가 상한");
    expect(codeOf(() => inflateZlib(stream, { maxOutputBytes: 65_536 }))).toBe("limit");
  });

  it("버퍼는 상한을 넘겨 키우지 않는다(초기 용량의 두 배가 상한보다 클 때도)", () => {
    const original = new Uint8Array(70_000).fill(7);
    const result = inflateZlib(new Uint8Array(deflateSync(original)), { maxOutputBytes: 80_000 });

    expectSameBytes(result.output, original, "상한보다 작은 출력");
    expect(result.output.buffer.byteLength).toBeLessThanOrEqual(80_000);
    const exact = inflateZlib(new Uint8Array(deflateSync(original)), { maxOutputBytes: 70_000 });
    expect(exact.output.buffer.byteLength).toBeLessThanOrEqual(70_000);
  });
});

describe("inflateZlib: 손상된 입력", () => {
  const samples: Array<[string, Uint8Array]> = [
    ["동적 허프만", new Uint8Array(deflateSync(textLike(3_000, 61)))],
    ["고정 허프만", new Uint8Array(deflateSync(runs(1_500, 62), { strategy: constants.Z_FIXED }))],
    ["저장 블록", new Uint8Array(deflateSync(randomBytes(500, 63), { level: 0 }))],
  ];

  it.each(samples)("%s: 어느 길이에서 잘라도 ZlibInflateError만 난다", (_name, stream) => {
    for (let length = 0; length < stream.byteLength; length += 1) {
      const code = codeOf(() => inflateZlib(stream.subarray(0, length), limits));
      expect(code, `length ${length}`).not.toBe("other");
      expect(code, `length ${length}`).not.toBe("none");
    }
  });

  it("바이트 하나를 무작위로 바꾼 1500건은 오류로 끝나거나 원래 출력을 낸다(그 밖의 예외나 무한 반복이 없다)", () => {
    const next = mulberry32(7);
    for (const [, stream] of samples) {
      const original = inflateZlib(stream, limits).output;
      for (let trial = 0; trial < 500; trial += 1) {
        const mutated = Uint8Array.from(stream);
        mutated[Math.floor(next() * mutated.byteLength)] ^= 1 + Math.floor(next() * 255);
        try {
          const result = inflateZlib(mutated, limits);
          expectSameBytes(result.output, original, "변조");
        } catch (error) {
          expect(error).toBeInstanceOf(ZlibInflateError);
        }
      }
    }
  });

  it("예약된 블록 종류(3)는 data 오류다", () => {
    // 78 01 | 07 = BFINAL=1, BTYPE=11
    const stream = Uint8Array.of(0x78, 0x01, 0x07, 0, 0, 0, 0, 0, 0);

    expect(codeOf(() => inflateZlib(stream, limits))).toBe("data");
    expect(messageOf(stream)).toBe("예약된 블록 종류(3)");
  });

  it("저장 블록의 길이 보수가 틀리면 data 오류다", () => {
    expect(codeOf(() => inflateZlib(Uint8Array.of(0x78, 0x01, 0x01, 0x03, 0x00, 0xfc, 0xfe, 0x61, 0x62, 0x63, 0, 0, 0, 0), limits))).toBe("data");
  });

  it("거리가 이미 만든 출력보다 멀면 data 오류다", () => {
    // 고정 허프만 블록: 길이 3 거리 1을 출력 0바이트에서 요구한다.
    // 비트: BFINAL=1 BTYPE=01, 길이 심볼 257(7비트 0000001), 거리 심볼 0(5비트 00000)
    const stream = Uint8Array.of(0x78, 0x01, 0x03, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00);
    expect(codeOf(() => inflateZlib(stream, limits))).toBe("data");
  });
});
