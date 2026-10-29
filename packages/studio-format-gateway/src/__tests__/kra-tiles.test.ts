import { describe, expect, it } from "vitest";

import {
  buildKraTileFile,
  kraNativeRgba,
  kraTilePayload,
  lzfCompress,
  noiseTile,
  patternTile,
  planarize,
  solidTile,
  tilePixels,
} from "../../../../tests/corpus/formats/kra-fixtures";
import { describeKraPixelFormat, kraReduceLut, kraReduceLut8 } from "../kra-colorspace";
import {
  assembleKraLayer,
  decodeKraTile,
  lzfDecompress,
  parseKraTileFile,
  validateKraTileRecord,
  KraTileError,
  type KraTileFailureCode,
} from "../kra-tiles";
import { KRA_LIMITS, type KraLimits } from "../kra-types";

function failureOf(action: () => unknown): KraTileFailureCode {
  try {
    action();
  } catch (error) {
    if (error instanceof KraTileError) return error.code;
    throw error;
  }
  throw new Error("예외가 발생하지 않았다");
}

const bytes = (...values: number[]) => Uint8Array.from(values);
const ascii = (text: string) => Uint8Array.from(Array.from(text, (character) => character.charCodeAt(0)));

describe("LZF 해제", () => {
  it("리터럴 구간을 그대로 복사한다", () => {
    expect(lzfDecompress(bytes(2, 0x61, 0x62, 0x63), 3)).toEqual(ascii("abc"));
  });

  it("앞쪽 참조를 복사한다 (길이 6, 거리 3)", () => {
    // 리터럴 "abc" 다음 참조: 길이-2 = 4 -> 제어 4 << 5, 거리-1 = 2
    expect(lzfDecompress(bytes(2, 0x61, 0x62, 0x63, 4 << 5, 2), 9)).toEqual(ascii("abcabcabc"));
  });

  it("거리가 길이보다 짧은 겹치는 참조는 앞에서 만든 바이트를 다시 읽는다", () => {
    // 리터럴 "a" 다음 거리 1, 길이 7 -> 'a'가 8개
    expect(lzfDecompress(bytes(0, 0x61, 5 << 5, 0), 8)).toEqual(ascii("aaaaaaaa"));
  });

  it("길이 필드가 7이면 다음 바이트를 길이에 더한다", () => {
    // 길이 = 7 + 20 + 2 = 29, 거리 1
    const out = lzfDecompress(bytes(0, 0x7a, 7 << 5, 20, 0), 30);
    expect(out).toEqual(ascii("z".repeat(30)));
  });

  it("거리의 윗 5비트를 제어 바이트에서 읽는다 (거리 > 256)", () => {
    const literal = Array.from({ length: 300 }, (_, index) => index & 0xff);
    const stream: number[] = [];
    for (let at = 0; at < literal.length; at += 32) {
      const chunk = literal.slice(at, at + 32);
      stream.push(chunk.length - 1, ...chunk);
    }
    // 거리 300 -> 저장값 299 = 0x12b: 제어 하위 5비트 1, 거리 바이트 0x2b. 길이 3 -> 저장값 1.
    stream.push((1 << 5) | 1, 0x2b);
    const out = lzfDecompress(Uint8Array.from(stream), 303);
    expect(Array.from(out.subarray(300))).toEqual(literal.slice(0, 3));
  });

  it("빈 스트림은 기대 길이가 0일 때만 받아들인다", () => {
    expect(lzfDecompress(new Uint8Array(), 0)).toEqual(new Uint8Array());
    expect(failureOf(() => lzfDecompress(new Uint8Array(), 1))).toBe("lzf");
  });

  it.each([
    ["리터럴이 입력 끝을 넘는다", bytes(3, 1, 2), 4],
    ["길이 확장 바이트가 없다", bytes(0, 1, 7 << 5), 20],
    ["거리 바이트가 없다", bytes(0, 1, 2 << 5), 4],
    ["참조가 출력 앞쪽을 벗어난다", bytes(0, 1, 2 << 5, 1), 4],
    ["리터럴이 기대 크기를 넘는다", bytes(2, 1, 2, 3), 2],
    ["참조가 기대 크기를 넘는다", bytes(0, 1, 5 << 5, 0), 3],
    ["출력이 기대 크기보다 짧다", bytes(0, 1), 5],
  ] as const)("잘못된 스트림을 거부한다: %s", (_label, stream, expected) => {
    expect(failureOf(() => lzfDecompress(stream, expected))).toBe("lzf");
  });

  it("테스트 압축기가 만든 스트림을 여러 입력에서 정확히 되돌린다", () => {
    const inputs: Uint8Array[] = [
      new Uint8Array(),
      bytes(7),
      bytes(1, 2),
      new Uint8Array(1000),
      ascii("abcabcabcabcabc".repeat(40)),
      planarize(patternTile(4, 3), 4),
      planarize(noiseTile(4, 5), 4),
      planarize(solidTile([9, 8, 7, 6]), 4),
      Uint8Array.from({ length: 5000 }, (_, index) => (index * index) & 0xff),
    ];
    for (const input of inputs) {
      expect(lzfDecompress(lzfCompress(input), input.byteLength)).toEqual(input);
    }
  });

  it("압축기가 긴 반복에 길이 확장과 먼 거리 참조를 모두 쓴다", () => {
    const compressed = lzfCompress(planarize(solidTile([1, 2, 3, 4]), 4));
    expect(compressed.byteLength).toBeLessThan(400);
    // 길이 7 확장(제어 상위 3비트가 7)이 하나 이상 있다
    let extended = 0;
    for (let at = 0; at < compressed.byteLength; ) {
      const control = compressed[at]!;
      if (control < 32) at += control + 2;
      else {
        if (control >> 5 === 7) {
          extended += 1;
          at += 1;
        }
        at += 2;
      }
    }
    expect(extended).toBeGreaterThan(0);
  });
});

describe("타일 파일 파서", () => {
  const limits: KraLimits = KRA_LIMITS;
  const payload = kraTilePayload(solidTile([1, 2, 3, 4]), 4);

  it("헤더와 타일 레코드를 읽고 페이로드를 입력 위의 뷰로 둔다", () => {
    const file = buildKraTileFile({
      pixelBytes: 4,
      tiles: [
        { x: 0, y: 0, payload },
        { x: -64, y: 128, payload: bytes(0, 9, 9) },
      ],
    });
    const parsed = parseKraTileFile(file, limits);
    expect(parsed).toMatchObject({ tileWidth: 64, tileHeight: 64, pixelBytes: 4, trailingBytes: 0 });
    expect(parsed.tiles.map((tile) => [tile.x, tile.y, tile.compression, tile.payload.byteLength])).toEqual([
      [0, 0, "LZF", payload.byteLength],
      [-64, 128, "LZF", 3],
    ]);
    expect(parsed.tiles[0]!.payload.buffer).toBe(file.buffer);
    expect(Array.from(parsed.tiles[1]!.payload)).toEqual([0, 9, 9]);
  });

  it("마지막 타일 뒤에 남은 바이트 수를 알려 준다", () => {
    const file = buildKraTileFile({ pixelBytes: 4, tiles: [{ x: 0, y: 0, payload }], trailing: bytes(1, 2, 3) });
    expect(parseKraTileFile(file, limits).trailingBytes).toBe(3);
  });

  it("타일이 하나도 없어도 읽는다", () => {
    expect(parseKraTileFile(buildKraTileFile({ pixelBytes: 8, tiles: [] }), limits)).toMatchObject({ pixelBytes: 8, tiles: [] });
  });

  it("작은 타일 크기도 좌표 배수 규칙을 따른다", () => {
    const file = buildKraTileFile({ pixelBytes: 2, tileWidth: 16, tileHeight: 8, tiles: [{ x: 32, y: -16, payload: bytes(0, 1) }] });
    expect(parseKraTileFile(file, limits).tiles[0]).toMatchObject({ x: 32, y: -16 });
  });

  it.each([
    ["빈 입력", new Uint8Array(), "header"],
    ["줄바꿈 없는 헤더", ascii("VERSION 2"), "header"],
    ["키 순서가 다른 헤더", ascii("TILEWIDTH 64\nVERSION 2\nTILEHEIGHT 64\nPIXELSIZE 4\nDATA 0\n"), "header"],
    ["숫자가 아닌 값", ascii("VERSION x\nTILEWIDTH 64\nTILEHEIGHT 64\nPIXELSIZE 4\nDATA 0\n"), "header"],
    ["안전하지 않은 정수", ascii("VERSION 2\nTILEWIDTH 64\nTILEHEIGHT 64\nPIXELSIZE 4\nDATA 99999999999999999999\n"), "header"],
    ["ASCII가 아닌 바이트", Uint8Array.from([...ascii("VERSION 2\nTILEWIDTH 64\nTILEHEIGHT 64\nPIXELSIZE 4\nDATA "), 0xc3, 0xa9, 10]), "header"],
    ["너무 긴 줄", ascii(`VERSION ${"9".repeat(200)}\n`), "header"],
    ["값은 맞지만 줄이 너무 긴 헤더", ascii(`VERSION ${"0".repeat(200)}2\nTILEWIDTH 64\nTILEHEIGHT 64\nPIXELSIZE 4\nDATA 0\n`), "header"],
  ] as const)("잘못된 헤더를 거부한다: %s", (_label, input, code) => {
    expect(failureOf(() => parseKraTileFile(input, limits))).toBe(code);
  });

  it("지원하지 않는 버전을 거부한다", () => {
    expect(failureOf(() => parseKraTileFile(buildKraTileFile({ pixelBytes: 4, version: 3, tiles: [] }), limits))).toBe("version");
  });

  it.each([
    ["타일 너비 0", { tileWidth: 0 }],
    ["타일 높이가 한도 초과", { tileHeight: 1025 }],
    ["픽셀 크기 0", { pixelBytes: 0 }],
    ["픽셀 크기가 한도 초과", { pixelBytes: 33 }],
  ] as const)("범위를 벗어난 헤더 값을 거부한다: %s", (_label, override) => {
    const file = buildKraTileFile({ pixelBytes: 4, tiles: [], ...override });
    expect(failureOf(() => parseKraTileFile(file, limits))).toBe("limit");
  });

  it("한도와 같은 값은 받아들인다 (타일 크기 1024, 픽셀 크기 32, 타일 수)", () => {
    expect(parseKraTileFile(buildKraTileFile({ pixelBytes: 4, tileWidth: 1024, tileHeight: 1024, tiles: [] }), limits)).toMatchObject({ tileWidth: 1024, tileHeight: 1024 });
    expect(parseKraTileFile(buildKraTileFile({ pixelBytes: 32, tiles: [] }), limits).pixelBytes).toBe(32);
    const two = buildKraTileFile({
      pixelBytes: 4,
      tiles: [
        { x: 0, y: 0, payload: bytes(0) },
        { x: 64, y: 0, payload: bytes(0) },
      ],
    });
    expect(parseKraTileFile(two, { ...limits, maxTilesPerLayer: 2 }).tiles).toHaveLength(2);
    expect(failureOf(() => parseKraTileFile(two, { ...limits, maxTilesPerLayer: 1 }))).toBe("limit");
  });

  it("선언한 타일 수가 레이어당 한도를 넘으면 레코드를 읽기 전에 거부한다", () => {
    const file = buildKraTileFile({ pixelBytes: 4, tiles: [], declaredCount: 11 });
    expect(failureOf(() => parseKraTileFile(file, { ...limits, maxTilesPerLayer: 10 }))).toBe("limit");
  });

  it("선언한 타일 수보다 데이터가 적으면 레코드 오류다 (큰 선언으로 시간을 끌 수 없다)", () => {
    const file = buildKraTileFile({ pixelBytes: 4, tiles: [], declaredCount: 1_000_000 });
    expect(failureOf(() => parseKraTileFile(file, limits))).toBe("record");
  });

  it.each([
    ["x,y 형식이 아닌 줄", "0,0,LZF"],
    ["압축 이름이 숫자", "0,0,12,4"],
    ["크기가 음수", "0,0,LZF,-1"],
    ["좌표에 소수", "0.5,0,LZF,1"],
  ] as const)("잘못된 레코드 줄을 거부한다: %s", (_label, line) => {
    const header = "VERSION 2\nTILEWIDTH 64\nTILEHEIGHT 64\nPIXELSIZE 4\nDATA 1\n";
    expect(failureOf(() => parseKraTileFile(ascii(`${header}${line}\nxxxx`), limits))).toBe("record");
  });

  it("페이로드가 파일 끝을 넘으면 거부한다", () => {
    const header = "VERSION 2\nTILEWIDTH 64\nTILEHEIGHT 64\nPIXELSIZE 4\nDATA 1\n";
    expect(failureOf(() => parseKraTileFile(ascii(`${header}0,0,LZF,10\nabc`), limits))).toBe("record");
  });

  it("범위를 벗어난 좌표를 거부한다", () => {
    const file = buildKraTileFile({ pixelBytes: 4, tiles: [{ x: 2 ** 31 + 64, y: 0, payload: bytes(0) }] });
    expect(failureOf(() => parseKraTileFile(file, limits))).toBe("record");
  });

  it("타일 크기의 배수가 아닌 좌표를 거부한다", () => {
    expect(failureOf(() => parseKraTileFile(buildKraTileFile({ pixelBytes: 4, tiles: [{ x: 10, y: 0, payload: bytes(0) }] }), limits))).toBe("misaligned");
    expect(failureOf(() => parseKraTileFile(buildKraTileFile({ pixelBytes: 4, tiles: [{ x: 0, y: -1, payload: bytes(0) }] }), limits))).toBe("misaligned");
  });

  it("같은 좌표의 타일이 반복되면 거부한다", () => {
    const file = buildKraTileFile({
      pixelBytes: 4,
      tiles: [
        { x: 64, y: 0, payload: bytes(0) },
        { x: 64, y: 0, payload: bytes(0) },
      ],
    });
    expect(failureOf(() => parseKraTileFile(file, limits))).toBe("duplicate");
  });
});

describe("타일 레코드 구조 검증", () => {
  const rawBytes = 64 * 64 * 4;
  const fileFor = (payload: Uint8Array, compression = "LZF") => {
    const file = parseKraTileFile(buildKraTileFile({ pixelBytes: 4, tiles: [{ x: 0, y: 0, payload, compression }] }), KRA_LIMITS);
    return { file, tile: file.tiles[0]! };
  };

  it("올바른 LZF·비압축 레코드는 통과시킨다 (LZF 스트림 자체는 풀기 전에는 모른다)", () => {
    for (const payload of [Uint8Array.from([1, 0xff, 0xff, 0xff]), Uint8Array.from([0, ...new Uint8Array(rawBytes)])]) {
      const { file, tile } = fileFor(payload);
      expect(() => validateKraTileRecord(file, tile)).not.toThrow();
    }
  });

  it.each([
    ["다른 압축 이름", Uint8Array.from([1, 0]), "ZIP", "compression"],
    ["빈 페이로드", new Uint8Array(), "LZF", "size"],
    ["알 수 없는 플래그", Uint8Array.from([2, 0]), "LZF", "compression"],
    ["비압축 길이 부족", Uint8Array.from([0, ...new Uint8Array(rawBytes - 1)]), "LZF", "size"],
    ["비압축 길이 초과", Uint8Array.from([0, ...new Uint8Array(rawBytes + 1)]), "LZF", "size"],
  ] as const)("구조가 틀린 레코드를 거부한다: %s", (_label, payload, compression, code) => {
    const { file, tile } = fileFor(payload, compression);
    expect(failureOf(() => validateKraTileRecord(file, tile))).toBe(code);
  });
});

describe("타일 해제", () => {
  const rawBytes = 64 * 64 * 4;

  function fileOf(payload: Uint8Array, compression = "LZF") {
    const file = parseKraTileFile(buildKraTileFile({ pixelBytes: 4, tiles: [{ x: 0, y: 0, payload, compression }] }), KRA_LIMITS);
    return { file, tile: file.tiles[0]! };
  }

  it("LZF 타일(플래그 1)은 바이트 평면 배치로 풀린다", () => {
    const interleaved = patternTile(4, 2);
    const { file, tile } = fileOf(kraTilePayload(interleaved, 4, "lzf"));
    expect(decodeKraTile(file, tile)).toEqual(planarize(interleaved, 4));
  });

  it("비압축 타일(플래그 0)은 픽셀을 이어 붙인 배치라서 평면 배치로 바꾼다", () => {
    const interleaved = noiseTile(4, 9);
    const payload = kraTilePayload(interleaved, 4, "raw");
    expect(payload[0]).toBe(0);
    const { file, tile } = fileOf(payload);
    expect(decodeKraTile(file, tile)).toEqual(planarize(interleaved, 4));
  });

  it("평면 배치와 이어 붙인 배치가 다른 입력으로 두 플래그가 같은 픽셀로 풀리는지 본다", () => {
    const interleaved = patternTile(4, 7);
    const viaLzf = fileOf(kraTilePayload(interleaved, 4, "lzf"));
    const viaRaw = fileOf(kraTilePayload(interleaved, 4, "raw"));
    expect(decodeKraTile(viaRaw.file, viaRaw.tile)).toEqual(decodeKraTile(viaLzf.file, viaLzf.tile));
  });

  it("지원하지 않는 압축 이름을 거부한다", () => {
    const { file, tile } = fileOf(kraTilePayload(solidTile([1, 2, 3, 4]), 4), "ZIP");
    expect(failureOf(() => decodeKraTile(file, tile))).toBe("compression");
  });

  it.each([
    ["빈 페이로드", bytes(), "size"],
    ["알 수 없는 플래그", bytes(2, 0, 0), "compression"],
    ["비압축 크기가 다름", Uint8Array.from([0, ...new Uint8Array(rawBytes - 1)]), "size"],
    ["LZF 출력 크기가 다름", Uint8Array.from([1, 0, 1]), "lzf"],
  ] as const)("잘못된 페이로드를 거부한다: %s", (_label, payload, code) => {
    const { file, tile } = fileOf(payload);
    expect(failureOf(() => decodeKraTile(file, tile))).toBe(code);
  });
});

describe("레이어 조립", () => {
  const rgba8 = describeKraPixelFormat("RGBA")!;
  const rgba16 = describeKraPixelFormat("RGBA16")!;
  const gray8 = describeKraPixelFormat("GRAYA")!;
  const gray16 = describeKraPixelFormat("GRAYAU16")!;
  const identityLut = kraReduceLut8("srgb");

  function assemble(
    tiles: readonly { x: number; y: number; payload: Uint8Array }[],
    overrides: Partial<Parameters<typeof assembleKraLayer>[0]> & { tileSize?: number; pixelBytes?: number } = {},
  ) {
    const pixelBytes = overrides.pixelBytes ?? 4;
    const tileSize = overrides.tileSize ?? 64;
    const file = parseKraTileFile(buildKraTileFile({ pixelBytes, tileWidth: tileSize, tileHeight: tileSize, tiles }), KRA_LIMITS);
    return assembleKraLayer({
      file,
      format: rgba8,
      lut: identityLut,
      defaultPixelNative: null,
      offsetX: 0,
      offsetY: 0,
      canvasWidth: 64,
      canvasHeight: 48,
      limits: KRA_LIMITS,
      ...overrides,
    });
  }

  const at = (result: ReturnType<typeof assemble>, x: number, y: number) => {
    const extent = result.extent!;
    const offset = ((y - extent.y) * extent.width + (x - extent.x)) * 4;
    return Array.from(result.pixels!.subarray(offset, offset + 4));
  };

  it("타일도 없고 기본 픽셀도 투명이면 픽셀이 없다", () => {
    expect(assemble([])).toEqual({ extent: null, pixels: null, defaultPixel: [0, 0, 0, 0] });
  });

  it("타일이 없어도 기본 픽셀이 불투명이면 캔버스를 그 색으로 채운다", () => {
    const result = assemble([], { defaultPixelNative: Uint8Array.from(kraNativeRgba(255, 255, 255, 255)) });
    expect(result.extent).toEqual({ x: 0, y: 0, width: 64, height: 48 });
    expect(result.defaultPixel).toEqual([255, 255, 255, 255]);
    expect(result.pixels).toHaveLength(64 * 48 * 4);
    expect(new Set(result.pixels)).toEqual(new Set([255]));
  });

  it("타일의 BGRA를 RGBA로 바꿔 놓는다", () => {
    const tile = tilePixels(4, (x, y) => kraNativeRgba(x, y, x + y, 200));
    const result = assemble([{ x: 0, y: 0, payload: kraTilePayload(tile, 4) }]);
    expect(result.extent).toEqual({ x: 0, y: 0, width: 64, height: 64 });
    expect(at(result, 0, 0)).toEqual([0, 0, 0, 200]);
    expect(at(result, 5, 9)).toEqual([5, 9, 14, 200]);
    expect(at(result, 63, 63)).toEqual([63, 63, 126, 200]);
  });

  it("레이어 로컬 좌표에 오프셋을 더해 이미지 좌표로 둔다 (음수 좌표 타일 포함)", () => {
    const a = tilePixels(4, () => kraNativeRgba(10, 20, 30, 255));
    const b = tilePixels(4, () => kraNativeRgba(40, 50, 60, 255));
    const result = assemble(
      [
        { x: -64, y: 0, payload: kraTilePayload(a, 4) },
        { x: 64, y: -64, payload: kraTilePayload(b, 4) },
      ],
      { offsetX: 3, offsetY: -2 },
    );
    // 타일 a: x -61..2, y -2..61 / 타일 b: x 67..130, y -66..-3 (끝은 포함)
    expect(result.extent).toEqual({ x: -61, y: -66, width: 192, height: 128 });
    expect(at(result, -61, -2)).toEqual([10, 20, 30, 255]);
    expect(at(result, 2, 61)).toEqual([10, 20, 30, 255]);
    expect(at(result, 67, -66)).toEqual([40, 50, 60, 255]);
    expect(at(result, 130, -3)).toEqual([40, 50, 60, 255]);
    // 두 타일 사이의 빈 곳은 기본 픽셀(투명)이다
    expect(at(result, 30, -40)).toEqual([0, 0, 0, 0]);
  });

  it("타일 사이의 빈 곳을 기본 픽셀로 채운다", () => {
    const tile = tilePixels(4, () => kraNativeRgba(1, 2, 3, 255));
    const result = assemble(
      [
        { x: 0, y: 0, payload: kraTilePayload(tile, 4) },
        { x: 128, y: 0, payload: kraTilePayload(tile, 4) },
      ],
      { defaultPixelNative: Uint8Array.from(kraNativeRgba(9, 8, 7, 6)) },
    );
    expect(result.defaultPixel).toEqual([9, 8, 7, 6]);
    expect(at(result, 100, 10)).toEqual([9, 8, 7, 6]);
    expect(at(result, 130, 10)).toEqual([1, 2, 3, 255]);
  });

  it("기본 픽셀이 불투명이면 캔버스가 타일 밖에 걸쳐도 캔버스를 포함한다", () => {
    const tile = tilePixels(4, () => kraNativeRgba(1, 2, 3, 255));
    const result = assemble([{ x: 128, y: 128, payload: kraTilePayload(tile, 4) }], {
      defaultPixelNative: Uint8Array.from(kraNativeRgba(255, 255, 255, 255)),
    });
    expect(result.extent).toEqual({ x: 0, y: 0, width: 192, height: 192 });
    expect(at(result, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(at(result, 130, 130)).toEqual([1, 2, 3, 255]);
  });

  it("투명하지만 색이 있는 기본 픽셀은 타일 사이의 빈 곳에 그 값으로 남는다", () => {
    const tile = kraTilePayload(solidTile([1, 2, 3, 255]), 4);
    const result = assemble(
      [
        { x: 0, y: 0, payload: tile },
        { x: 128, y: 0, payload: tile },
      ],
      { defaultPixelNative: Uint8Array.from([5, 6, 7, 0]) },
    );
    expect(result.defaultPixel).toEqual([7, 6, 5, 0]);
    expect(at(result, 100, 10)).toEqual([7, 6, 5, 0]);
  });

  it("타일이 없고 기본 픽셀이 투명하면 색이 있어도 픽셀을 만들지 않는다", () => {
    const result = assemble([], { defaultPixelNative: Uint8Array.from([5, 6, 7, 0]) });
    expect(result).toEqual({ extent: null, pixels: null, defaultPixel: [7, 6, 5, 0] });
  });

  it("레이어 출력 픽셀이 한도를 넘으면 limit로 거부한다", () => {
    const tile = kraTilePayload(solidTile([1, 2, 3, 4]), 4);
    expect(failureOf(() => assemble([{ x: 0, y: 0, payload: tile }], { limits: { ...KRA_LIMITS, maxLayerPixels: 64 * 64 - 1 } }))).toBe("limit");
    expect(() => assemble([{ x: 0, y: 0, payload: tile }], { limits: { ...KRA_LIMITS, maxLayerPixels: 64 * 64 } })).not.toThrow();
  });

  it("타일 사이가 멀면 합집합 사각형 크기로 한도를 본다", () => {
    const tile = kraTilePayload(solidTile([1, 2, 3, 4]), 4);
    const tiles = [
      { x: 0, y: 0, payload: tile },
      { x: 6400, y: 6400, payload: tile },
    ];
    expect(failureOf(() => assemble(tiles, { limits: { ...KRA_LIMITS, maxLayerPixels: 1_000_000 } }))).toBe("limit");
  });

  it("타일 헤더의 픽셀 크기가 색 공간과 다르면 거부한다", () => {
    expect(failureOf(() => assemble([], { pixelBytes: 8 }))).toBe("pixel-size");
  });

  it("기본 픽셀 크기가 색 공간과 다르면 거부한다", () => {
    expect(failureOf(() => assemble([], { defaultPixelNative: new Uint8Array(3) }))).toBe("pixel-size");
  });

  it("타일 64개마다 중단 확인 콜백을 부른다", () => {
    const one = kraTilePayload(solidTile([1, 2, 3, 255], 1, 1), 4);
    const callsFor = (count: number) => {
      const tiles = Array.from({ length: count }, (_, index) => ({ x: index, y: 0, payload: one }));
      let calls = 0;
      assemble(tiles, { tileSize: 1, checkpoint: () => (calls += 1) });
      return calls;
    };
    expect(callsFor(63)).toBe(0);
    expect(callsFor(64)).toBe(1);
    expect(callsFor(129)).toBe(2);
    expect(callsFor(130)).toBe(2);
  });

  it("중단 콜백이 던지면 그 오류가 그대로 올라온다", () => {
    const one = kraTilePayload(solidTile([1, 2, 3, 255], 1, 1), 4);
    const tiles = Array.from({ length: 70 }, (_, index) => ({ x: index, y: 0, payload: one }));
    const marker = new Error("중단");
    expect(() =>
      assemble(tiles, {
        tileSize: 1,
        checkpoint: () => {
          throw marker;
        },
      }),
    ).toThrow(marker);
  });

  it("한 타일이라도 깨졌으면 레이어 전체를 포기한다", () => {
    const good = kraTilePayload(solidTile([1, 2, 3, 255]), 4);
    const bad = bytes(1, 0, 1);
    expect(
      failureOf(() =>
        assemble([
          { x: 0, y: 0, payload: good },
          { x: 64, y: 0, payload: bad },
        ]),
      ),
    ).toBe("lzf");
  });

  describe("출력 버퍼 예산과 사전 검증", () => {
    const good = kraTilePayload(solidTile([1, 2, 3, 255]), 4);

    it("출력 버퍼를 만들기 전에 가로×세로×4바이트를 알린다 (결과가 같은 크기다)", () => {
      const calls: number[] = [];
      const result = assemble([{ x: 0, y: 0, payload: good }], { reserve: (bytes) => calls.push(bytes) });
      expect(calls).toEqual([64 * 64 * 4]);
      expect(result.pixels).toHaveLength(64 * 64 * 4);
    });

    it("타일이 없고 기본 픽셀도 투명하면 아무것도 청구하지 않는다", () => {
      const calls: number[] = [];
      assemble([], { reserve: (bytes) => calls.push(bytes) });
      expect(calls).toEqual([]);
    });

    it("청구가 던지면 타일을 하나도 풀지 않는다", () => {
      const marker = new KraTileError("예산 초과", "limit");
      let decoded = 0;
      expect(() =>
        assemble([{ x: 0, y: 0, payload: good }], {
          reserve: () => {
            throw marker;
          },
          checkpoint: () => (decoded += 1),
        }),
      ).toThrow(marker);
      expect(decoded).toBe(0);
    });

    it("구조가 틀린 타일이 하나라도 있으면 출력 버퍼를 청구하기 전에 거부한다", () => {
      const calls: number[] = [];
      const tiles = [
        { x: 0, y: 0, payload: good },
        { x: 64, y: 0, payload: Uint8Array.from([1, 0, 1]) },
      ];
      const file = parseKraTileFile(buildKraTileFile({ pixelBytes: 4, tiles: [...tiles, { x: 128, y: 0, payload: good, compression: "ZIP" }] }), KRA_LIMITS);
      expect(
        failureOf(() =>
          assembleKraLayer({
            file,
            format: rgba8,
            lut: identityLut,
            defaultPixelNative: Uint8Array.from(kraNativeRgba(255, 255, 255, 255)),
            offsetX: 0,
            offsetY: 0,
            canvasWidth: 64,
            canvasHeight: 48,
            limits: KRA_LIMITS,
            reserve: (bytes) => calls.push(bytes),
          }),
        ),
      ).toBe("compression");
      expect(calls).toEqual([]);
    });

    it("LZF가 깨진 타일은 풀어 봐야 알므로 청구는 이미 일어났고 환불되지 않는다", () => {
      const calls: number[] = [];
      expect(
        failureOf(() =>
          assemble(
            [
              { x: 0, y: 0, payload: good },
              { x: 64, y: 0, payload: Uint8Array.from([1, 0, 1]) },
            ],
            { reserve: (bytes) => calls.push(bytes) },
          ),
        ),
      ).toBe("lzf");
      expect(calls).toEqual([128 * 64 * 4]);
    });

    it("출력 버퍼를 만들지 못하면(메모리 부족) 정해진 오류로 바꾼다", () => {
      // 2^31 x 2^31 픽셀 요구: 한도를 풀어 둔 내부 호출에서 new Uint8Array가 RangeError를 던진다
      const tiles = [
        { x: -(2 ** 30), y: -(2 ** 30), payload: good },
        { x: 2 ** 30, y: 2 ** 30, payload: good },
      ];
      expect(failureOf(() => assemble(tiles, { limits: { ...KRA_LIMITS, maxLayerPixels: Number.POSITIVE_INFINITY } }))).toBe("limit");
    });
  });

  describe("색 공간별 환원", () => {
    it("8비트 선형 문서는 색 채널을 sRGB 전달 함수에 통과시키고 알파는 그대로 둔다 (기본 픽셀 포함)", () => {
      const lut = kraReduceLut8("linear");
      const tile = tilePixels(4, () => kraNativeRgba(64, 128, 255, 77));
      const result = assemble([{ x: 0, y: 0, payload: kraTilePayload(tile, 4) }], { lut, defaultPixelNative: Uint8Array.from(kraNativeRgba(64, 0, 0, 255)) });
      expect(at(result, 3, 3)).toEqual([lut[64], lut[128], lut[255], 77]);
      expect(result.defaultPixel).toEqual([lut[64], 0, 0, 255]);
    });

    it("GRAYA 8비트는 회색을 세 채널에 복사한다", () => {
      const tile = tilePixels(2, (x) => [x * 4, 100 + x]);
      const result = assemble([{ x: 0, y: 0, payload: kraTilePayload(tile, 2) }], { format: gray8, pixelBytes: 2 });
      expect(at(result, 3, 0)).toEqual([12, 12, 12, 103]);
    });

    it("RGBA16 sRGB 감마 문서는 값을 257로 나눠 반올림한다", () => {
      const sample = (value: number) => [value & 0xff, value >> 8];
      const tile = tilePixels(8, () => [...sample(0x0101 * 10), ...sample(0x0101 * 128), ...sample(0x0101 * 200), ...sample(0x0101 * 64)]);
      const result = assemble([{ x: 0, y: 0, payload: kraTilePayload(tile, 8) }], { format: rgba16, pixelBytes: 8, lut: kraReduceLut("srgb") });
      // 네이티브 순서는 B, G, R, A
      expect(at(result, 0, 0)).toEqual([200, 128, 10, 64]);
    });

    it("RGBA16 선형 문서는 sRGB 전달 함수를 거친다", () => {
      const sample = (value: number) => [value & 0xff, value >> 8];
      const tile = tilePixels(8, () => [...sample(0), ...sample(65_535), ...sample(2_000), ...sample(65_535)]);
      const result = assemble([{ x: 0, y: 0, payload: kraTilePayload(tile, 8) }], { format: rgba16, pixelBytes: 8, lut: kraReduceLut("linear") });
      // 선형 2000/65535 = 0.0305 -> sRGB 약 0.1938 -> 49
      expect(at(result, 1, 1)).toEqual([49, 255, 0, 255]);
    });

    it("GRAYAU16은 회색과 알파를 각각 줄인다", () => {
      const tile = tilePixels(4, () => [0x80, 0x80, 0xff, 0x7f]);
      const result = assemble([{ x: 0, y: 0, payload: kraTilePayload(tile, 4) }], { format: gray16, pixelBytes: 4, lut: kraReduceLut("srgb") });
      // 0x8080 / 257 = 128.0, 알파 0x7fff / 257 = 127.498 -> 127
      expect(at(result, 0, 0)).toEqual([128, 128, 128, 127]);
    });
  });
});
