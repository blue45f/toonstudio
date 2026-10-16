import { deflateSync } from "node:zlib";

import { decode } from "image-js";
import { describe, expect, it } from "vitest";

import {
  IEND_CHUNK,
  ihdrChunk,
  idatChunk,
  inflatingIccpChunk,
  inflatingZtxtChunk,
  adam7Rows,
  pngChunk,
  pngChunkTypes,
  pngChunksHaveValidCrc,
  pngFile,
  rawRows,
  zeroRunIdat,
} from "../../../test/cover-image-fixtures";
import { COVER_MAX_DECODE_RAW_BYTES } from "./cover-decode-limits";
import { guardPng } from "./cover-png-guard";

const grey = (x: number, y: number): readonly number[] => [(x * 7 + y * 13) & 0xff];
const rgb = (x: number, y: number): readonly number[] => [(x * 5) & 0xff, (y * 9) & 0xff, (x + y) & 0xff];

/** 8비트 회색 width x height PNG 에 header 와 IDAT 사이·뒤의 청크를 끼워 만든다. */
function greyPng(width: number, height: number, extra: { before?: readonly Buffer[]; after?: readonly Buffer[] } = {}): Buffer {
  return pngFile(
    ihdrChunk({ width, height }),
    ...(extra.before ?? []),
    idatChunk(rawRows(width, height, 8, grey)),
    ...(extra.after ?? []),
    IEND_CHUNK,
  );
}

describe("guardPng 허용 청크 재조립", () => {
  it("보조 청크는 모두 버리고 IHDR·IDAT·IEND 만 남기며 CRC 가 유효한 PNG 를 돌려준다", () => {
    const ancillary = [
      pngChunk("gAMA", Buffer.from([0, 1, 0x86, 0xa0])),
      pngChunk("cHRM", Buffer.alloc(32)),
      pngChunk("sRGB", Buffer.from([0])),
      pngChunk("iCCP", Buffer.concat([Buffer.from("p\0", "latin1"), Buffer.from([0, 0x78, 0x9c, 0x03, 0, 0, 0, 0, 1])])),
      pngChunk("tEXt", Buffer.from("Title\0cover", "latin1")),
      inflatingZtxtChunk(1024),
      pngChunk("iTXt", Buffer.from("k\0\0\0\0\0v", "latin1")),
      pngChunk("pHYs", Buffer.from([0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1])),
      pngChunk("tIME", Buffer.alloc(7)),
      pngChunk("bKGD", Buffer.from([0])),
      pngChunk("sBIT", Buffer.from([8])),
      pngChunk("eXIf", Buffer.alloc(8)),
      pngChunk("abCD", Buffer.from("알 수 없는 보조 청크")),
    ];
    const guarded = guardPng(greyPng(64, 48, { before: ancillary, after: [pngChunk("tEXt", Buffer.from("tail\0x"))] }));

    expect(guarded).not.toBeNull();
    expect(pngChunkTypes(guarded!.sanitized)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(pngChunksHaveValidCrc(guarded!.sanitized)).toBe(true);
    expect(guarded).toMatchObject({ width: 64, height: 48 });
    expect(decode(guarded!.sanitized)).toMatchObject({ width: 64, height: 48 });
  });

  it("팔레트 PNG 의 PLTE·tRNS 는 원래 순서대로 남긴다", () => {
    const palette = pngChunk("PLTE", Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 9, 9, 9]));
    const alpha = pngChunk("tRNS", Buffer.from([255, 128]));
    const png = pngFile(
      ihdrChunk({ width: 16, height: 8, bitDepth: 2, colorType: 3 }),
      pngChunk("gAMA", Buffer.from([0, 1, 0x86, 0xa0])),
      palette,
      alpha,
      pngChunk("bKGD", Buffer.from([0])),
      idatChunk(rawRows(16, 8, 2, (x, y) => [(x + y) & 3])),
      IEND_CHUNK,
    );
    const guarded = guardPng(png);

    expect(pngChunkTypes(guarded!.sanitized)).toEqual(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);
    expect(guarded!.sanitized.includes(palette)).toBe(true);
    expect(guarded!.sanitized.includes(alpha)).toBe(true);
    expect(pngChunksHaveValidCrc(guarded!.sanitized)).toBe(true);
    expect(decode(guarded!.sanitized).alpha).toBe(true);
  });

  it("IDAT 가 여러 조각이어도 순서와 바이트를 그대로 남기고 IEND 뒤의 바이트는 버린다", () => {
    const header = ihdrChunk({ width: 32, height: 32 });
    const compressed = deflateSync(rawRows(32, 32, 8, grey));
    const half = Math.floor(compressed.length / 2);
    const firstIdat = pngChunk("IDAT", compressed.subarray(0, half));
    const secondIdat = pngChunk("IDAT", compressed.subarray(half));
    const split = pngFile(
      header,
      firstIdat,
      pngChunk("tEXt", Buffer.from("between\0x")),
      secondIdat,
      IEND_CHUNK,
      Buffer.from("IEND 뒤의 쓰레기 바이트"),
    );

    const guarded = guardPng(split);

    expect(guarded!.sanitized.equals(pngFile(header, firstIdat, secondIdat, IEND_CHUNK))).toBe(true);
    expect(decode(guarded!.sanitized)).toMatchObject({ width: 32, height: 32 });
  });

  it("압축 해제 크기가 수백 MB 로 풀리는 iCCP·zTXt 는 풀지 않고 버린다(파일은 작고 재조립본도 작다)", () => {
    // 실제 공격은 256MB 이지만 시험은 같은 구조의 8MB 로 충분하다: 재조립본에 이 청크가 없다는 것이 방어다.
    const bomb = greyPng(64, 48, { before: [inflatingIccpChunk(8 * 1024 * 1024), inflatingZtxtChunk(8 * 1024 * 1024)] });
    expect(bomb.length).toBeLessThan(64 * 1024);

    const guarded = guardPng(bomb);

    expect(pngChunkTypes(guarded!.sanitized)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(guarded!.sanitized.length).toBeLessThan(bomb.length);
    expect(guarded!.sanitized.includes(Buffer.from("iCCP"))).toBe(false);
  });
});

describe("guardPng 거절", () => {
  it("IHDR 이 둘 이상이면 어느 자리에 있든 변환하지 않는다(디코더는 마지막 IHDR 을 쓴다)", () => {
    const second = ihdrChunk({ width: 22_600, height: 22_600, bitDepth: 1 });
    expect(guardPng(greyPng(64, 48, { before: [second] }))).toBeNull();
    expect(guardPng(greyPng(64, 48, { after: [second] }))).toBeNull();
    // 같은 값의 IHDR 이 한 번 더 있어도 정확히 하나여야 한다.
    expect(guardPng(greyPng(64, 48, { before: [ihdrChunk({ width: 64, height: 48 })] }))).toBeNull();
  });

  it.each(["acTL", "fcTL", "fdAT"])("애니메이션 PNG 청크 %s 가 있으면 변환하지 않는다", (type) => {
    expect(guardPng(greyPng(64, 48, { before: [pngChunk(type, Buffer.alloc(26))] }))).toBeNull();
  });

  it("PLTE 는 한 번, 1~256색(3의 배수)만 허용한다", () => {
    const palettePng = (...chunks: Buffer[]) =>
      pngFile(
        ihdrChunk({ width: 16, height: 8, bitDepth: 8, colorType: 3 }),
        ...chunks,
        idatChunk(rawRows(16, 8, 8, (x) => [x])),
        IEND_CHUNK,
      );
    expect(guardPng(palettePng(pngChunk("PLTE", Buffer.alloc(256 * 3))))).not.toBeNull();
    expect(guardPng(palettePng(pngChunk("PLTE", Buffer.alloc(257 * 3))))).toBeNull();
    expect(guardPng(palettePng(pngChunk("PLTE", Buffer.alloc(3_000_000 * 3))))).toBeNull();
    expect(guardPng(palettePng(pngChunk("PLTE", Buffer.alloc(0))))).toBeNull();
    expect(guardPng(palettePng(pngChunk("PLTE", Buffer.alloc(10))))).toBeNull();
    expect(guardPng(palettePng(pngChunk("PLTE", Buffer.alloc(6)), pngChunk("PLTE", Buffer.alloc(6))))).toBeNull();
  });

  it("tRNS 는 한 번, 256바이트까지만 허용한다", () => {
    const withTransparency = (...chunks: Buffer[]) =>
      pngFile(
        ihdrChunk({ width: 16, height: 8, bitDepth: 8, colorType: 3 }),
        pngChunk("PLTE", Buffer.alloc(256 * 3)),
        ...chunks,
        idatChunk(rawRows(16, 8, 8, (x) => [x])),
        IEND_CHUNK,
      );
    expect(guardPng(withTransparency(pngChunk("tRNS", Buffer.alloc(256))))).not.toBeNull();
    expect(guardPng(withTransparency(pngChunk("tRNS", Buffer.alloc(257))))).toBeNull();
    expect(guardPng(withTransparency(pngChunk("tRNS", Buffer.alloc(2)), pngChunk("tRNS", Buffer.alloc(2))))).toBeNull();
  });

  it("IEND 가 없거나 길이가 0 이 아니거나 청크가 잘렸으면 변환하지 않는다", () => {
    const idat = idatChunk(rawRows(64, 48, 8, grey));
    const header = ihdrChunk({ width: 64, height: 48 });
    expect(guardPng(pngFile(header, idat))).toBeNull();
    expect(guardPng(pngFile(header, idat, pngChunk("IEND", Buffer.from([1]))))).toBeNull();
    expect(guardPng(pngFile(header, idat, IEND_CHUNK).subarray(0, 8 + 25 + idat.length - 10))).toBeNull();
    expect(guardPng(pngFile(header, IEND_CHUNK))).toBeNull(); // IDAT 없음
  });

  it("헤더가 PNG 가 아니거나 크기·색 유형·깊이·인터레이스 조합이 비정상이면 변환하지 않는다", () => {
    const idat = idatChunk(Buffer.alloc(64));
    const tail = [idat, IEND_CHUNK] as const;
    expect(guardPng(Buffer.from("not an image at all, just text bytes......"))).toBeNull();
    expect(guardPng(pngFile(ihdrChunk({ width: 0, height: 4 }), ...tail))).toBeNull();
    expect(guardPng(pngFile(ihdrChunk({ width: 4, height: 0 }), ...tail))).toBeNull();
    // 폭 0 인데 압축 해제 크기가 선언(행마다 필터 바이트 하나)과 맞는 PNG 도 변환하지 않는다.
    expect(guardPng(pngFile(ihdrChunk({ width: 0, height: 4 }), idatChunk(Buffer.alloc(4)), IEND_CHUNK))).toBeNull();
    expect(guardPng(pngFile(ihdrChunk({ width: 4, height: 4, colorType: 5 }), ...tail))).toBeNull();
    expect(guardPng(pngFile(ihdrChunk({ width: 4, height: 4, colorType: 2, bitDepth: 4 }), ...tail))).toBeNull();
    expect(guardPng(pngFile(ihdrChunk({ width: 4, height: 4, interlace: 2 }), ...tail))).toBeNull();
  });
});

describe("guardPng 크기 상한", () => {
  it("화소 수 상한(1600만)은 포함하고 한 화소만 넘어도 거절한다", () => {
    const bilevel = (width: number, height: number) =>
      pngFile(
        ihdrChunk({ width, height, bitDepth: 1 }),
        idatChunk(Buffer.alloc(height * (1 + Math.ceil(width / 8)))),
        IEND_CHUNK,
      );
    expect(guardPng(bilevel(4_000, 4_000))).not.toBeNull();
    expect(guardPng(bilevel(4_001, 4_000))).toBeNull();
    expect(guardPng(bilevel(16_000_001, 1))).toBeNull();
  });

  it("압축 해제 후 크기 상한(64MiB)은 화소 수가 적어도 적용되고, 상한 직전은 허용한다", () => {
    // 16비트 RGBA: 화소당 8바이트. 2047x4096 은 67,080,192 < 64MiB, 2048x4096 은 67,112,960 > 64MiB 이다.
    const sixteenBitRgba = (width: number, height: number) => {
      const raw = height * (1 + width * 8);
      return pngFile(ihdrChunk({ width, height, bitDepth: 16, colorType: 6 }), zeroRunIdat(raw), IEND_CHUNK);
    };
    expect(4096 * (1 + 2047 * 8)).toBeLessThan(COVER_MAX_DECODE_RAW_BYTES);
    expect(4096 * (1 + 2048 * 8)).toBeGreaterThan(COVER_MAX_DECODE_RAW_BYTES);
    expect(guardPng(sixteenBitRgba(2_047, 4_096))).not.toBeNull();
    expect(guardPng(sixteenBitRgba(2_048, 4_096))).toBeNull();
  });
});

describe("guardPng 팽창 검사", () => {
  it("압축 해제 결과가 선언한 크기와 같으면 통과하고 한 바이트라도 넘치면 거절한다", () => {
    const width = 100;
    const height = 50;
    const exact = rawRows(width, height, 8, grey);
    expect(exact.length).toBe(height * (1 + width));
    const png = (raw: Buffer) => pngFile(ihdrChunk({ width, height }), idatChunk(raw), IEND_CHUNK);

    expect(guardPng(png(exact))).not.toBeNull();
    expect(guardPng(png(Buffer.concat([exact, Buffer.from([0])])))).toBeNull();
  });

  it("작은 선언(1x1)에 훨씬 크게 풀리는 IDAT 는 거절한다", () => {
    const bomb = pngFile(ihdrChunk({ width: 1, height: 1 }), zeroRunIdat(8 * 1024 * 1024), IEND_CHUNK);
    expect(bomb.length).toBeLessThan(64 * 1024);
    expect(guardPng(bomb)).toBeNull();
  });

  it("Adam7 인터레이스는 정직한 데이터를 통과시키고, 선언 대비 지나치게 큰 데이터는 거절한다", () => {
    const width = 37;
    const height = 23;
    const honest = adam7Rows(width, height, 8, rgb);
    const header = ihdrChunk({ width, height, bitDepth: 8, colorType: 2, interlace: 1 });
    // 일곱 패스의 필터 바이트 때문에 인터레이스 데이터는 같은 크기의 비인터레이스 데이터보다 크다.
    expect(honest.length).toBeGreaterThan(height * (1 + width * 3));

    expect(guardPng(pngFile(header, idatChunk(honest), IEND_CHUNK))).not.toBeNull();

    // 상한은 (2 * 높이 + 7)행 x (1 + 행 바이트)다. 그보다 큰 데이터는 거절한다.
    const rowBytes = 1 + width * 3;
    const oversized = Buffer.alloc((2 * height + 7) * rowBytes + 1);
    expect(guardPng(pngFile(header, idatChunk(oversized), IEND_CHUNK))).toBeNull();
    expect(guardPng(pngFile(header, idatChunk(oversized.subarray(0, (2 * height + 7) * rowBytes)), IEND_CHUNK))).not.toBeNull();
  });
});
