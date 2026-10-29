import { describe, expect, it } from "vitest";

import { floatSampleBytes, halfFloatBits, kraNativeFloat } from "../../../../tests/corpus/formats/kra-fixtures";
import {
  classifyKraProfileTransfer,
  convertKraNativePixel,
  convertKraRow,
  describeKraPixelFormat,
  halfFloatToNumber,
  KRA_SUPPORTED_COLOR_SPACES,
  kraColorLut,
  kraHalfFloatLut,
  kraProfileLooksSrgb,
  kraReduceLut,
  kraReduceLut8,
} from "../kra-colorspace";

/** 테스트에서 따로 쓴 sRGB 전달 함수(구현과 독립). */
function oetf(linear: number): number {
  return linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
}
function eotf(encoded: number): number {
  return encoded <= 0.04045 ? encoded / 12.92 : Math.pow((encoded + 0.055) / 1.055, 2.4);
}

describe("Krita 색 공간 형식", () => {
  it("RGBA8으로 환원할 수 있는 여덟 가지 형식만 안다", () => {
    expect(describeKraPixelFormat("RGBA")).toEqual({ colorSpace: "RGBA", pixelBytes: 4, model: "rgb", depth: 8, sample: "int" });
    expect(describeKraPixelFormat("RGBA16")).toEqual({ colorSpace: "RGBA16", pixelBytes: 8, model: "rgb", depth: 16, sample: "int" });
    expect(describeKraPixelFormat("GRAYA")).toEqual({ colorSpace: "GRAYA", pixelBytes: 2, model: "gray", depth: 8, sample: "int" });
    expect(describeKraPixelFormat("GRAYAU16")).toEqual({ colorSpace: "GRAYAU16", pixelBytes: 4, model: "gray", depth: 16, sample: "int" });
    expect(describeKraPixelFormat("RGBAF16")).toEqual({ colorSpace: "RGBAF16", pixelBytes: 8, model: "rgb", depth: 16, sample: "float" });
    expect(describeKraPixelFormat("RGBAF32")).toEqual({ colorSpace: "RGBAF32", pixelBytes: 16, model: "rgb", depth: 32, sample: "float" });
    expect(describeKraPixelFormat("GRAYAF16")).toEqual({ colorSpace: "GRAYAF16", pixelBytes: 4, model: "gray", depth: 16, sample: "float" });
    expect(describeKraPixelFormat("GRAYAF32")).toEqual({ colorSpace: "GRAYAF32", pixelBytes: 8, model: "gray", depth: 32, sample: "float" });
    expect(KRA_SUPPORTED_COLOR_SPACES).toEqual(["RGBA", "RGBA16", "GRAYA", "GRAYAU16", "RGBAF16", "RGBAF32", "GRAYAF16", "GRAYAF32"]);
  });

  it.each(["CMYKA", "CMYKAU16", "LABA", "XYZA16", "XYZAF32", "YCBCRA8", "rgba", "rgbaf16", "", "__proto__", "constructor"])(
    "읽지 않는 색 공간 %s는 null이다",
    (name) => {
      expect(describeKraPixelFormat(name)).toBeNull();
    },
  );

  it("색 공간 이름이 없으면 null이다", () => {
    expect(describeKraPixelFormat(null)).toBeNull();
  });
});

describe("프로파일 이름으로 전달 함수 판정", () => {
  it.each([
    ["sRGB-elle-V2-g10.icc", "linear", true],
    ["Gray-D50-elle-V2-g10.icc", "linear", true],
    ["Rec2020-elle-V4-g10.icc", "linear", true],
    ["Some Linear Profile", "linear", true],
    ["Canon_G100.icc", "srgb", false],
    ["sRGB-elle-V2-g100.icc", "srgb", false],
    ["Rec2020-elle-V4-g10.icc", "linear", true],
    ["linear", "linear", true],
    ["g10", "linear", true],
    ["(g10)", "linear", true],
    ["sRGB-elle-V2-srgbtrc.icc", "srgb", true],
    ["Gray-D50-elle-V2-srgbtrc.icc", "srgb", true],
    ["sRGB built-in", "srgb", true],
    ["sRGB-IEC61966-2.1", "srgb", true],
    ["sRGB-IE", "srgb", false],
    ["Adobe RGB", "srgb", false],
    ["", "srgb", false],
  ] as const)("%s -> %s (인식 %s)", (name, transfer, recognized) => {
    expect(classifyKraProfileTransfer(name)).toEqual({ transfer, recognized });
  });

  it("프로파일이 없으면 인식하지 못한 sRGB 가정이다", () => {
    expect(classifyKraProfileTransfer(null)).toEqual({ transfer: "srgb", recognized: false });
  });

  it("이름이 sRGB나 회색이면 원색이 sRGB 계열이라고 본다", () => {
    expect(kraProfileLooksSrgb("sRGB-elle-V2-g10.icc")).toBe(true);
    expect(kraProfileLooksSrgb("Gray-D50-elle-V2-g10.icc")).toBe(true);
    expect(kraProfileLooksSrgb("Rec2020-elle-V4-g10.icc")).toBe(false);
    expect(kraProfileLooksSrgb(null)).toBe(false);
  });

  it("TRC 접미사 srgbtrc는 원색이 아니다: 다른 원색의 srgbtrc 프로파일은 sRGB로 보지 않는다", () => {
    for (const name of ["Rec2020-elle-V4-srgbtrc.icc", "ProPhoto-elle-V4-srgbtrc.icc", "ACES-elle-V4-srgbtrc.icc", "AdobeRGB-elle-V4-srgbtrc.icc"]) {
      expect(kraProfileLooksSrgb(name), name).toBe(false);
      expect(classifyKraProfileTransfer(name), name).toEqual({ transfer: "srgb", recognized: true });
    }
    expect(kraProfileLooksSrgb("sRGB-elle-V2-srgbtrc.icc")).toBe(true);
    expect(kraProfileLooksSrgb("Gray-D50-elle-V2-srgbtrc.icc")).toBe(true);
    expect(kraProfileLooksSrgb("  sRGB built-in")).toBe(true);
  });

  it("회색 프로파일은 gray·grey 철자 모두 원색이 없어 sRGB로 본다 (이름 앞머리 기준)", () => {
    expect(kraProfileLooksSrgb("Grey-D50-elle-V2-g10.icc")).toBe(true);
    expect(kraProfileLooksSrgb("GREY gamma 2.2")).toBe(true);
    expect(kraProfileLooksSrgb("Rec2020-Gray-V4.icc")).toBe(false);
  });
});

describe("16비트 -> 8비트 환원 표", () => {
  it("sRGB 감마 문서는 값을 257로 나눠 반올림한다", () => {
    const lut = kraReduceLut("srgb");
    expect(lut).toHaveLength(65_536);
    for (const value of [0, 1, 128, 129, 256, 257, 32_767, 32_768, 65_278, 65_279, 65_535]) {
      expect(lut[value]).toBe(Math.round(value / 257));
    }
    expect(lut[0]).toBe(0);
    expect(lut[65_535]).toBe(255);
  });

  it("선형 문서는 sRGB 전달 함수를 거친다", () => {
    const lut = kraReduceLut("linear");
    for (const value of [0, 1, 20, 100, 2_000, 10_000, 32_768, 50_000, 65_535]) {
      expect(lut[value]).toBe(Math.round(255 * oetf(value / 65_535)));
    }
  });

  it("두 표 모두 단조 증가한다", () => {
    for (const transfer of ["srgb", "linear"] as const) {
      const lut = kraReduceLut(transfer);
      for (let value = 1; value < lut.length; value += 1) expect(lut[value]!).toBeGreaterThanOrEqual(lut[value - 1]!);
    }
  });

  it("8비트 sRGB 값을 16비트 선형으로 늘렸다가 줄이면 원래 값으로 돌아온다 (Krita 대조에서 확인한 성질)", () => {
    const lut = kraReduceLut("linear");
    for (let value = 0; value < 256; value += 1) {
      const linear16 = Math.round(65_535 * eotf(value / 255));
      expect(lut[linear16]).toBe(value);
    }
  });

  it("같은 표를 반복 호출해도 같은 인스턴스를 돌려준다", () => {
    expect(kraReduceLut("srgb")).toBe(kraReduceLut("srgb"));
    expect(kraReduceLut("linear")).toBe(kraReduceLut("linear"));
  });
});

describe("8비트 -> 8비트 환원 표", () => {
  it("감마 부호화 문서는 값 그대로다 (항등 표)", () => {
    const lut = kraReduceLut8("srgb");
    expect(lut).toHaveLength(256);
    for (let value = 0; value < 256; value += 1) expect(lut[value]).toBe(value);
  });

  it("선형 문서는 sRGB 전달 함수를 거친다 (Krita의 g10 -> srgbtrc 변환과 최대 1단계 차이로 일치한 식)", () => {
    const lut = kraReduceLut8("linear");
    expect(lut).toHaveLength(256);
    expect([lut[0], lut[1], lut[64], lut[128], lut[255]]).toEqual([0, 13, 137, 188, 255]);
    for (let value = 0; value < 256; value += 1) expect(lut[value]).toBe(Math.round(255 * oetf(value / 255)));
    for (let value = 1; value < 256; value += 1) expect(lut[value]!).toBeGreaterThanOrEqual(lut[value - 1]!);
  });

  it("kraColorLut은 샘플 깊이와 종류에 맞는 표를 고른다", () => {
    expect(kraColorLut(describeKraPixelFormat("RGBA")!, "linear")).toBe(kraReduceLut8("linear"));
    expect(kraColorLut(describeKraPixelFormat("GRAYA")!, "srgb")).toBe(kraReduceLut8("srgb"));
    expect(kraColorLut(describeKraPixelFormat("RGBA16")!, "linear")).toBe(kraReduceLut("linear"));
    expect(kraColorLut(describeKraPixelFormat("GRAYAU16")!, "srgb")).toBe(kraReduceLut("srgb"));
    // 16비트 실수는 반정밀도 비트가 색인이고, 32비트 실수는 16비트로 양자화한 값이 색인이라 16비트 정수 표를 쓴다
    expect(kraColorLut(describeKraPixelFormat("RGBAF16")!, "linear")).toBe(kraHalfFloatLut("linear"));
    expect(kraColorLut(describeKraPixelFormat("GRAYAF16")!, "srgb")).toBe(kraHalfFloatLut("srgb"));
    expect(kraColorLut(describeKraPixelFormat("RGBAF32")!, "linear")).toBe(kraReduceLut("linear"));
    expect(kraColorLut(describeKraPixelFormat("GRAYAF32")!, "srgb")).toBe(kraReduceLut("srgb"));
  });

  it("8비트 RGBA·GRAYA 행 변환은 색 채널에만 표를 쓰고 알파는 그대로 둔다", () => {
    const lut = kraReduceLut8("linear");
    const rgba = new Uint8Array(4);
    convertKraRow(describeKraPixelFormat("RGBA")!, lut, Uint8Array.from([64, 128, 255, 77]), 1, 0, 1, rgba, 0);
    expect(Array.from(rgba)).toEqual([lut[255], lut[128], lut[64], 77]);
    const gray = new Uint8Array(4);
    convertKraRow(describeKraPixelFormat("GRAYA")!, lut, Uint8Array.from([128, 77]), 1, 0, 1, gray, 0);
    expect(Array.from(gray)).toEqual([lut[128], lut[128], lut[128], 77]);
  });
});

describe("행 변환", () => {
  const identityLut = kraReduceLut8("srgb");

  it("RGBA8: 평면 0~3이 B, G, R, A다", () => {
    // 픽셀 3개, 평면 크기 3
    const raw = Uint8Array.from([10, 11, 12, 20, 21, 22, 30, 31, 32, 255, 254, 253]);
    const out = new Uint8Array(12);
    convertKraRow(describeKraPixelFormat("RGBA")!, identityLut, raw, 3, 0, 3, out, 0);
    expect(Array.from(out)).toEqual([30, 20, 10, 255, 31, 21, 11, 254, 32, 22, 12, 253]);
  });

  it("행의 일부만 변환해 지정한 위치에 쓴다", () => {
    const raw = Uint8Array.from([10, 11, 12, 20, 21, 22, 30, 31, 32, 255, 254, 253]);
    const out = new Uint8Array(12).fill(7);
    convertKraRow(describeKraPixelFormat("RGBA")!, identityLut, raw, 3, 1, 1, out, 4);
    expect(Array.from(out)).toEqual([7, 7, 7, 7, 31, 21, 11, 254, 7, 7, 7, 7]);
  });

  it("GRAYA8: 평면 0이 회색, 평면 1이 알파다", () => {
    const raw = Uint8Array.from([5, 6, 200, 201]);
    const out = new Uint8Array(8);
    convertKraRow(describeKraPixelFormat("GRAYA")!, identityLut, raw, 2, 0, 2, out, 0);
    expect(Array.from(out)).toEqual([5, 5, 5, 200, 6, 6, 6, 201]);
  });

  it("RGBA16: 샘플은 B, G, R, A 순서의 리틀 엔디언 16비트다", () => {
    // 픽셀 1개, 평면 크기 1: 바이트 0~7 = B lo, B hi, G lo, G hi, R lo, R hi, A lo, A hi
    const raw = Uint8Array.from([0x00, 0x00, 0x80, 0x80, 0xff, 0xff, 0x01, 0x01]);
    const out = new Uint8Array(4);
    convertKraRow(describeKraPixelFormat("RGBA16")!, kraReduceLut("srgb"), raw, 1, 0, 1, out, 0);
    // R 0xffff -> 255, G 0x8080 -> 128, B 0 -> 0, A 0x0101 -> 1
    expect(Array.from(out)).toEqual([255, 128, 0, 1]);
  });

  it("GRAYAU16: 회색과 알파가 각각 16비트 리틀 엔디언이다", () => {
    const raw = Uint8Array.from([0x00, 0x80, 0xff, 0x40]);
    const out = new Uint8Array(4);
    convertKraRow(describeKraPixelFormat("GRAYAU16")!, kraReduceLut("srgb"), raw, 1, 0, 1, out, 0);
    // 회색 0x8000 = 32768 -> 127.5 -> 128 (Math.round), 알파 0x40ff = 16639 -> 64.74 -> 65
    expect(Array.from(out)).toEqual([128, 128, 128, 65]);
  });

  it("16비트 알파는 전달 함수를 거치지 않고 비례로 줄인다", () => {
    const raw = Uint8Array.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80]);
    const out = new Uint8Array(4);
    convertKraRow(describeKraPixelFormat("RGBA16")!, kraReduceLut("linear"), raw, 1, 0, 1, out, 0);
    expect(out[3]).toBe(Math.round(32_768 / 257));
  });
});

describe("반정밀도 부동소수", () => {
  it.each([
    [0x0000, 0],
    [0x3c00, 1],
    [0x3800, 0.5],
    [0x4000, 2],
    [0xc000, -2],
    [0xbc00, -1],
    [0x3555, 0.333251953125],
    [0x7bff, 65_504],
    [0x0400, 2 ** -14],
    [0x03ff, 1023 * 2 ** -24],
    [0x0001, 2 ** -24],
    [0x7c00, Number.POSITIVE_INFINITY],
    [0xfc00, Number.NEGATIVE_INFINITY],
  ])("비트 0x%s는 정해진 값이다", (bits, expected) => {
    expect(halfFloatToNumber(bits)).toBe(expected);
  });

  it("0x8000은 음의 0이다", () => {
    expect(Object.is(halfFloatToNumber(0x8000), -0)).toBe(true);
    expect(Object.is(halfFloatToNumber(0x0000), 0)).toBe(true);
  });

  it.each([0x7c01, 0x7e00, 0x7fff, 0xfc01, 0xffff])("지수가 전부 1이고 가수가 0이 아닌 비트 0x%s는 NaN이다", (bits) => {
    expect(Number.isNaN(halfFloatToNumber(bits))).toBe(true);
  });

  it("시험용 독립 인코더와 모든 비트 패턴에서 왕복한다 (NaN 제외)", () => {
    for (let bits = 0; bits < 65_536; bits += 1) {
      const value = halfFloatToNumber(bits);
      if (Number.isNaN(value)) continue;
      expect(halfFloatBits(value), `0x${bits.toString(16)}`).toBe(bits);
    }
  });

  it("인코더는 가장 가까운 짝수로 반올림하고 범위를 넘으면 무한대다", () => {
    expect(halfFloatBits(1 + 2 ** -11)).toBe(0x3c00); // 1.0과 1+2^-10의 한가운데: 짝수 가수(0)로
    expect(halfFloatBits(1 + 3 * 2 ** -11)).toBe(0x3c02); // 1+2^-10과 1+2^-9의 한가운데: 짝수 가수(2)로
    expect(halfFloatBits(65_519)).toBe(0x7bff);
    expect(halfFloatBits(65_520)).toBe(0x7c00);
    expect(halfFloatBits(2 ** -25)).toBe(0); // 가장 작은 비정규 수의 절반: 짝수(0)로
    expect(halfFloatBits(3 * 2 ** -25)).toBe(2); // 1.5 * 2^-24: 짝수(2)로
  });
});

describe("반정밀도 환원 표", () => {
  const exact = (value: number, transfer: "srgb" | "linear") => 255 * (transfer === "linear" ? oetf(Math.min(1, Math.max(0, value))) : Math.min(1, Math.max(0, value)));

  it.each([
    // 0x2e66은 반정밀도로 쓴 0.1(= 0.0999755859375)이라 sRGB 감마 표에서 25.49 -> 25다
    ["sRGB 감마", "srgb", [[0x0000, 0], [0x3c00, 255], [0x3800, 128], [0x3400, 64], [0x3a00, 191], [0x2e66, 25]]],
    ["선형", "linear", [[0x0000, 0], [0x3c00, 255], [0x3800, 188], [0x3400, 137], [0x3a00, 225], [0x2e66, 89]]],
  ] as const)("%s 표의 대표 값", (_label, transfer, cases) => {
    const lut = kraHalfFloatLut(transfer);
    expect(lut).toHaveLength(65_536);
    for (const [bits, expected] of cases) expect(lut[bits], `0x${bits.toString(16)}`).toBe(expected);
  });

  it.each(["srgb", "linear"] as const)("%s 표: 범위를 벗어난 값은 잘린다 (음수·NaN은 0, 1 이상·무한대는 255)", (transfer) => {
    const lut = kraHalfFloatLut(transfer);
    for (const bits of [0x8000, 0xbc00, 0xfc00, 0xffff, 0x7e00, 0x7c01, 0x0001, 0x8001]) expect(lut[bits], `0x${bits.toString(16)}`).toBe(0);
    for (const bits of [0x3c00, 0x4000, 0x7bff, 0x7c00]) expect(lut[bits], `0x${bits.toString(16)}`).toBe(255);
  });

  it.each(["srgb", "linear"] as const)("%s 표: 0~1 구간에서 단조 증가하고 정확한 식과 0.53 이내로 같다", (transfer) => {
    const lut = kraHalfFloatLut(transfer);
    for (let bits = 1; bits <= 0x3c00; bits += 1) {
      expect(lut[bits]!, `0x${bits.toString(16)}`).toBeGreaterThanOrEqual(lut[bits - 1]!);
      expect(Math.abs(lut[bits]! - exact(halfFloatToNumber(bits), transfer)), `0x${bits.toString(16)}`).toBeLessThan(0.53);
    }
  });

  it("16비트 정수 표와 같은 16비트 중간값을 거친다 (값을 65,535배해 반올림한 정수로 줄인 것과 같다)", () => {
    for (const transfer of ["srgb", "linear"] as const) {
      const lut = kraHalfFloatLut(transfer);
      const reduce = kraReduceLut(transfer);
      for (let bits = 0; bits <= 0x3c00; bits += 1) expect(lut[bits]!, `${transfer} 0x${bits.toString(16)}`).toBe(reduce[Math.round(halfFloatToNumber(bits) * 65_535)]);
    }
  });

  it("같은 표를 반복 호출해도 같은 인스턴스를 돌려준다", () => {
    expect(kraHalfFloatLut("linear")).toBe(kraHalfFloatLut("linear"));
    expect(kraHalfFloatLut("srgb")).toBe(kraHalfFloatLut("srgb"));
    expect(kraHalfFloatLut("linear")).not.toBe(kraHalfFloatLut("srgb"));
  });
});

describe("실수 형식 행 변환", () => {
  const FLOATS = ["RGBAF16", "RGBAF32", "GRAYAF16", "GRAYAF32"] as const;
  const lutOf = (name: string, transfer: "srgb" | "linear") => kraColorLut(describeKraPixelFormat(name)!, transfer);

  /** 픽셀 여러 개를 바이트 평면 배치(평면 k = 모든 픽셀의 k번째 바이트)로 쌓는다. */
  function planar(name: string, pixels: readonly (readonly number[])[]): Uint8Array {
    const natives = pixels.map((channels) => kraNativeFloat(name, channels));
    const pixelBytes = natives[0]!.length;
    const raw = new Uint8Array(natives.length * pixelBytes);
    natives.forEach((native, pixel) => native.forEach((byte, k) => (raw[k * natives.length + pixel] = byte)));
    return raw;
  }

  function convert(name: string, transfer: "srgb" | "linear", pixels: readonly (readonly number[])[]): number[] {
    const out = new Uint8Array(pixels.length * 4);
    convertKraRow(describeKraPixelFormat(name)!, lutOf(name, transfer), planar(name, pixels), pixels.length, 0, pixels.length, out, 0);
    return Array.from(out);
  }

  it.each(["RGBAF16", "RGBAF32"])("%s: 샘플은 R, G, B, A 순서다 (정수 RGBA의 B, G, R, A와 다르다)", (name) => {
    expect(convert(name, "srgb", [[1, 0.5, 0.25, 0.75]])).toEqual([255, 128, 64, 191]);
    expect(convert(name, "linear", [[1, 0.5, 0.25, 0.75]])).toEqual([255, 188, 137, 191]); // 알파는 전달 함수를 거치지 않는다
  });

  it.each(["GRAYAF16", "GRAYAF32"])("%s: 샘플은 회색, 알파 순서다", (name) => {
    expect(convert(name, "srgb", [[0.5, 0.25]])).toEqual([128, 128, 128, 64]);
    expect(convert(name, "linear", [[0.5, 0.25]])).toEqual([188, 188, 188, 64]);
  });

  it.each(FLOATS)("%s: 여러 픽셀을 바이트 평면 배치에서 읽는다", (name) => {
    const rgb = name.startsWith("RGBA");
    // 반정밀도와 단정밀도로 정확히 표현되는 값(2의 거듭제곱 분수)만 써서 두 형식이 같은 기대값을 갖게 한다
    const pixels = rgb ? [[0, 0.0625, 0.5, 1], [0.25, 0.3125, 0.875, 0.5], [1, 0.03125, 0.1875, 0]] : [[0, 1], [0.25, 0.5], [1, 0]];
    const expected = rgb
      ? [0, 16, 128, 255, 64, 80, 223, 128, 255, 8, 48, 0]
      : [0, 0, 0, 255, 64, 64, 64, 128, 255, 255, 255, 0];
    expect(convert(name, "srgb", pixels)).toEqual(expected);
  });

  it.each(FLOATS)("%s: 행의 일부만 변환해 지정한 위치에 쓴다", (name) => {
    const rgb = name.startsWith("RGBA");
    const pixels = rgb ? [[1, 1, 1, 1], [0.5, 0.5, 0.5, 0.5], [0, 0, 0, 0]] : [[1, 1], [0.5, 0.5], [0, 0]];
    const out = new Uint8Array(12).fill(7);
    convertKraRow(describeKraPixelFormat(name)!, lutOf(name, "srgb"), planar(name, pixels), 3, 1, 1, out, 4);
    expect(Array.from(out)).toEqual([7, 7, 7, 7, 128, 128, 128, 128, 7, 7, 7, 7]);
  });

  it.each(FLOATS)("%s: 범위를 벗어난 값은 잘린다 (음수·NaN은 0, 1 이상·무한대는 255)", (name) => {
    const one = name.startsWith("RGBA");
    const row = (value: number) => (one ? [value, value, value, value] : [value, value]);
    for (const transfer of ["srgb", "linear"] as const) {
      expect(convert(name, transfer, [row(-0.5)]).slice(0, 4), `${transfer} 음수`).toEqual([0, 0, 0, 0]);
      expect(convert(name, transfer, [row(Number.NaN)]).slice(0, 4), `${transfer} NaN`).toEqual([0, 0, 0, 0]);
      expect(convert(name, transfer, [row(Number.NEGATIVE_INFINITY)]).slice(0, 4), `${transfer} -무한대`).toEqual([0, 0, 0, 0]);
      expect(convert(name, transfer, [row(2)]).slice(0, 4), `${transfer} 1 초과`).toEqual([255, 255, 255, 255]);
      expect(convert(name, transfer, [row(Number.POSITIVE_INFINITY)]).slice(0, 4), `${transfer} +무한대`).toEqual([255, 255, 255, 255]);
    }
  });

  it("단정밀도의 아주 작은 값과 비정규 수는 0이 된다", () => {
    for (const value of [1e-30, 1e-45, 1e-6]) {
      expect(convert("RGBAF32", "srgb", [[value, value, value, value]]), String(value)).toEqual([0, 0, 0, 0]);
      expect(convert("RGBAF32", "linear", [[value, value, value, value]]), String(value)).toEqual([0, 0, 0, 0]);
    }
  });

  it("같은 값을 반정밀도·단정밀도·16비트 정수로 적으면 같은 RGBA8이 나온다", () => {
    const values = [0, 1, 0.5, 0.25, 0.1, 0.18, 0.001, 0.0031308, 0.3333, 0.0625, 0.875];
    const fromInt = (transfer: "srgb" | "linear", value: number) => {
      const word = Math.round(value * 65_535);
      const native = [word & 0xff, word >> 8];
      const raw = Uint8Array.from([...native, ...native, ...native, 0xff, 0xff]); // B, G, R, A 순서의 한 픽셀
      const out = new Uint8Array(4);
      convertKraRow(describeKraPixelFormat("RGBA16")!, kraReduceLut(transfer), raw, 1, 0, 1, out, 0);
      return Array.from(out);
    };
    for (const transfer of ["srgb", "linear"] as const) {
      for (const value of values) {
        // 각 형식이 실제로 담는 값(반정밀도·단정밀도로 반올림한 값)을 16비트 정수로 적은 문서와 비교한다
        const half = halfFloatToNumber(halfFloatBits(value));
        expect(convert("RGBAF16", transfer, [[value, value, value, 1]]).slice(0, 3), `${transfer} f16 ${value}`).toEqual(fromInt(transfer, half).slice(0, 3));
        expect(convert("RGBAF32", transfer, [[value, value, value, 1]]).slice(0, 3), `${transfer} f32 ${value}`).toEqual(fromInt(transfer, Math.fround(value)).slice(0, 3));
      }
    }
  });

  it("단정밀도 값은 16비트로 양자화한 뒤 줄인다 (정확한 식과 0.53 이내)", () => {
    const lut = kraReduceLut("linear");
    let state = 12_345;
    for (let index = 0; index < 5_000; index += 1) {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      const value = state / 4_294_967_296;
      const [r] = convert("RGBAF32", "linear", [[value, 0, 0, 1]]);
      expect(r, String(value)).toBe(lut[Math.round(Math.fround(value) * 65_535)]);
      expect(Math.abs(r! - 255 * oetf(Math.fround(value))), String(value)).toBeLessThan(0.53);
    }
  });

  it("임의의 비트 패턴(NaN, 무한대, 비정규 수 포함)에서도 예외 없이 자르기 규칙대로 줄인다", () => {
    const view = new DataView(new ArrayBuffer(4));
    const expected = (bits: number, transfer: "srgb" | "linear") => {
      view.setUint32(0, bits, true);
      const value = view.getFloat32(0, true);
      const quantized = value > 0 ? (value >= 1 ? 65_535 : Math.round(value * 65_535)) : 0;
      return kraReduceLut(transfer)[quantized]!;
    };
    let state = 987_654_321;
    for (let index = 0; index < 20_000; index += 1) {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      // 가끔 지수가 전부 1인 값(NaN, 무한대)과 지수 0인 값(비정규 수)을 섞는다
      const bits = index % 5 === 0 ? ((state & 0x807fffff) | 0x7f800000) >>> 0 : index % 7 === 0 ? (state & 0x807fffff) >>> 0 : state;
      const bytes = [bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, bits >>> 24];
      const raw = Uint8Array.from([...bytes, ...bytes, ...bytes, ...bytes]);
      const out = new Uint8Array(4);
      for (const transfer of ["srgb", "linear"] as const) {
        convertKraRow(describeKraPixelFormat("RGBAF32")!, lutOf("RGBAF32", transfer), raw, 1, 0, 1, out, 0);
        const colorValue = expected(bits, transfer);
        expect(Array.from(out), `0x${bits.toString(16)} ${transfer}`).toEqual([colorValue, colorValue, colorValue, expected(bits, "srgb")]);
      }
    }
  });

  it("바이트 위치를 바꿔 넣으면 값이 달라진다 (엔디언·채널 순서를 가린다)", () => {
    // R=1.0만 0이 아닌 RGBAF32 한 픽셀을 거꾸로 적으면 R이 아니라 다른 값이 된다
    const raw = Uint8Array.from(kraNativeFloat("RGBAF32", [1, 0, 0, 1]));
    const out = new Uint8Array(4);
    convertKraRow(describeKraPixelFormat("RGBAF32")!, lutOf("RGBAF32", "srgb"), raw, 1, 0, 1, out, 0);
    expect(Array.from(out)).toEqual([255, 0, 0, 255]);
    expect(floatSampleBytes(1, 4)).toEqual([0, 0, 0x80, 0x3f]); // 1.0f의 리틀 엔디언 바이트
    expect(floatSampleBytes(1, 2)).toEqual([0x00, 0x3c]);
  });
});

describe("기본 픽셀 변환", () => {
  it.each([
    ["RGBA", [0x10, 0x20, 0x30, 0x40], [0x30, 0x20, 0x10, 0x40]],
    ["GRAYA", [0x77, 0x88], [0x77, 0x77, 0x77, 0x88]],
    ["RGBA16", [0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff], [255, 0, 0, 255]],
    ["GRAYAU16", [0xff, 0xff, 0, 0], [255, 255, 255, 0]],
    ["RGBAF16", kraNativeFloat("RGBAF16", [1, 0, 0.5, 1]), [255, 0, 128, 255]],
    ["RGBAF32", kraNativeFloat("RGBAF32", [0, 0.25, 1, 0.5]), [0, 64, 255, 128]],
    ["GRAYAF16", kraNativeFloat("GRAYAF16", [0.5, 0]), [128, 128, 128, 0]],
    ["GRAYAF32", kraNativeFloat("GRAYAF32", [1, 1]), [255, 255, 255, 255]],
  ] as const)("%s", (name, native, expected) => {
    const format = describeKraPixelFormat(name)!;
    expect(convertKraNativePixel(format, kraColorLut(format, "srgb"), Uint8Array.from(native))).toEqual(expected);
  });
});
