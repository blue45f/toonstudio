import { describe, expect, it } from "vitest";

import {
  classifyKraProfileTransfer,
  convertKraNativePixel,
  convertKraRow,
  describeKraPixelFormat,
  kraColorLut,
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
  it("RGBA8으로 환원할 수 있는 네 가지 형식만 안다", () => {
    expect(describeKraPixelFormat("RGBA")).toEqual({ colorSpace: "RGBA", pixelBytes: 4, model: "rgb", depth: 8 });
    expect(describeKraPixelFormat("RGBA16")).toEqual({ colorSpace: "RGBA16", pixelBytes: 8, model: "rgb", depth: 16 });
    expect(describeKraPixelFormat("GRAYA")).toEqual({ colorSpace: "GRAYA", pixelBytes: 2, model: "gray", depth: 8 });
    expect(describeKraPixelFormat("GRAYAU16")).toEqual({ colorSpace: "GRAYAU16", pixelBytes: 4, model: "gray", depth: 16 });
  });

  it.each(["RGBAF16", "RGBAF32", "CMYKA", "CMYKAU16", "LABA", "XYZA16", "YCBCRA8", "rgba", "", "__proto__", "constructor"])(
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

  it("kraColorLut은 샘플 깊이에 맞는 표를 고른다", () => {
    expect(kraColorLut(describeKraPixelFormat("RGBA")!, "linear")).toBe(kraReduceLut8("linear"));
    expect(kraColorLut(describeKraPixelFormat("GRAYA")!, "srgb")).toBe(kraReduceLut8("srgb"));
    expect(kraColorLut(describeKraPixelFormat("RGBA16")!, "linear")).toBe(kraReduceLut("linear"));
    expect(kraColorLut(describeKraPixelFormat("GRAYAU16")!, "srgb")).toBe(kraReduceLut("srgb"));
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

describe("기본 픽셀 변환", () => {
  it.each([
    ["RGBA", [0x10, 0x20, 0x30, 0x40], [0x30, 0x20, 0x10, 0x40]],
    ["GRAYA", [0x77, 0x88], [0x77, 0x77, 0x77, 0x88]],
    ["RGBA16", [0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff], [255, 0, 0, 255]],
    ["GRAYAU16", [0xff, 0xff, 0, 0], [255, 255, 255, 0]],
  ] as const)("%s", (name, native, expected) => {
    const format = describeKraPixelFormat(name)!;
    expect(convertKraNativePixel(format, kraColorLut(format, "srgb"), Uint8Array.from(native))).toEqual(expected);
  });
});
