import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { drawText, FONT_ADVANCE, supportsGlyph, textWidth } from "./mini-font";
import { adler32, crc32, encodePng, zlibStore } from "./png-encode";

function readU32(b: Uint8Array, o: number): number {
  return (((b[o] ?? 0) << 24) | ((b[o + 1] ?? 0) << 16) | ((b[o + 2] ?? 0) << 8) | (b[o + 3] ?? 0)) >>> 0;
}

describe("png-encode: 체크섬", () => {
  it("CRC-32·Adler-32가 알려진 값과 같다", () => {
    const text = Uint8Array.from("123456789", (c) => c.charCodeAt(0));
    expect(crc32(text)).toBe(0xcbf43926);
    expect(adler32(text)).toBe(0x091e01de);
    expect(adler32(new Uint8Array(0))).toBe(1);
  });
});

describe("png-encode: PNG 바이트", () => {
  it("서명·IHDR·IDAT·IEND 구조가 맞고 모든 청크 CRC가 맞는다", () => {
    const w = 5;
    const h = 3;
    const rgba = new Uint8ClampedArray(w * h * 4).map((_, i) => (i * 7) & 0xff);
    const png = encodePng(w, h, rgba);
    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    let o = 8;
    const types: string[] = [];
    while (o < png.length) {
      const len = readU32(png, o);
      const type = String.fromCharCode(png[o + 4] ?? 0, png[o + 5] ?? 0, png[o + 6] ?? 0, png[o + 7] ?? 0);
      types.push(type);
      expect(readU32(png, o + 8 + len)).toBe(crc32(png, o + 4, o + 8 + len));
      if (type === "IHDR") {
        expect(readU32(png, o + 8)).toBe(w);
        expect(readU32(png, o + 12)).toBe(h);
        expect(png[o + 16]).toBe(8);
        expect(png[o + 17]).toBe(6);
      }
      o += 12 + len;
    }
    expect(types).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  it("zlib 표준 해석기(node:zlib)로 풀면 원본 픽셀이 나온다(필터 0 + 행)", () => {
    const w = 40;
    const h = 30;
    const rgba = new Uint8ClampedArray(w * h * 4).map((_, i) => (i * 13 + (i >> 5)) & 0xff);
    const png = encodePng(w, h, rgba);
    // IDAT 내용 추출.
    let o = 8;
    let idat: Uint8Array = new Uint8Array(0);
    while (o < png.length) {
      const len = readU32(png, o);
      const type = String.fromCharCode(png[o + 4] ?? 0, png[o + 5] ?? 0, png[o + 6] ?? 0, png[o + 7] ?? 0);
      if (type === "IDAT") idat = png.subarray(o + 8, o + 8 + len);
      o += 12 + len;
    }
    const raw = inflateSync(idat);
    expect(raw.length).toBe((w * 4 + 1) * h);
    for (let y = 0; y < h; y += 1) {
      expect(raw[y * (w * 4 + 1)]).toBe(0);
      expect(Array.from(raw.subarray(y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1)))).toEqual(Array.from(rgba.subarray(y * w * 4, (y + 1) * w * 4)));
    }
  });

  it("65535바이트를 넘는 데이터는 저장 블록 여러 개로 나뉘고 해석기로 풀린다", () => {
    const raw = new Uint8Array(150_000).map((_, i) => (i * 31) & 0xff);
    const z = zlibStore(raw);
    expect(Array.from(inflateSync(z))).toEqual(Array.from(raw));
    expect(zlibStore(new Uint8Array(0)).length).toBeGreaterThan(5);
    expect(inflateSync(zlibStore(new Uint8Array(0))).length).toBe(0);
  });

  it("같은 입력은 같은 바이트다(결정적)이고 잘못된 크기·길이는 RangeError다", () => {
    const rgba = new Uint8ClampedArray(2 * 2 * 4).fill(9);
    expect(Array.from(encodePng(2, 2, rgba))).toEqual(Array.from(encodePng(2, 2, rgba)));
    expect(() => encodePng(0, 2, rgba)).toThrow(RangeError);
    expect(() => encodePng(2, 2, new Uint8ClampedArray(3))).toThrow(RangeError);
  });
});

describe("mini-font", () => {
  it("글자를 그리고 지원하지 않는 글자(한글)는 건너뛰되 폭은 유지한다", () => {
    expect(supportsGlyph("A")).toBe(true);
    expect(supportsGlyph("가")).toBe(false);
    expect(textWidth("AB")).toBe(2 * FONT_ADVANCE - 1);
    expect(textWidth("")).toBe(0);
    const w = 40;
    const h = 12;
    const buf = new Uint8ClampedArray(w * h * 4);
    drawText(buf, w, h, 1, 1, "a가b", [255, 0, 0]);
    let lit = 0;
    for (let i = 3; i < buf.length; i += 4) if ((buf[i] ?? 0) === 255) lit += 1;
    expect(lit).toBeGreaterThan(10);
    // 가운데 글자 자리(x = 1 + 6 .. 1 + 11)는 비어 있다.
    for (let y = 0; y < h; y += 1) {
      for (let x = 1 + FONT_ADVANCE; x < 1 + 2 * FONT_ADVANCE - 1; x += 1) expect(buf[(y * w + x) * 4 + 3]).toBe(0);
    }
  });

  it("버퍼 밖으로 나가는 픽셀은 버린다(throw 없음)", () => {
    const buf = new Uint8ClampedArray(8 * 8 * 4);
    expect(() => drawText(buf, 8, 8, 4, 4, "WWWW", [1, 2, 3], 2)).not.toThrow();
    expect(() => drawText(buf, 8, 8, -10, -10, "A")).not.toThrow();
  });
});
