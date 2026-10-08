import { describe, expect, it } from "vitest";

import { hexToStrokeColor, hsvToRgb, normalizeHex, parseHex, pushRecentColor, rgbToHsv, toHex } from "./color-utils";

describe("color-utils", () => {
  it("parseHex는 #rrggbb·#rgb·# 생략을 읽고 잘못된 입력은 null을 돌려준다", () => {
    expect(parseHex("#FF8000")).toEqual({ r: 255, g: 128, b: 0 });
    expect(parseHex("f80")).toEqual({ r: 255, g: 136, b: 0 });
    expect(parseHex("  #0a0b0c ")).toEqual({ r: 10, g: 11, b: 12 });
    for (const bad of ["", "#12", "#12345", "#1234567", "#ggg", "red", "#12 456"]) {
      expect(parseHex(bad)).toBeNull();
    }
  });

  it("normalizeHex·toHex는 소문자 #rrggbb로 맞추고 범위를 클램프한다", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("nope")).toBeNull();
    expect(toHex({ r: -5, g: 300, b: 15.6 })).toBe("#00ff10");
  });

  it("RGB ↔ HSV 왕복이 8비트 색 전체 격자에서 손실 없이 돌아온다", () => {
    for (let r = 0; r < 256; r += 51) {
      for (let g = 0; g < 256; g += 51) {
        for (let b = 0; b < 256; b += 51) {
          expect(hsvToRgb(rgbToHsv({ r, g, b }))).toEqual({ r, g, b });
        }
      }
    }
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, v: 1 });
    expect(rgbToHsv({ r: 0, g: 255, b: 0 }).h).toBe(120);
    expect(rgbToHsv({ r: 0, g: 0, b: 255 }).h).toBe(240);
    expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 });
  });

  it("hsvToRgb는 색조를 360으로 감싸고 s·v를 0..1로 클램프한다", () => {
    expect(hsvToRgb({ h: 360, s: 1, v: 1 })).toEqual({ r: 255, g: 0, b: 0 });
    expect(hsvToRgb({ h: -120, s: 1, v: 1 })).toEqual({ r: 0, g: 0, b: 255 });
    expect(hsvToRgb({ h: 10, s: 5, v: 2 })).toEqual(hsvToRgb({ h: 10, s: 1, v: 1 }));
  });

  it("pushRecentColor는 앞에 넣고 중복을 당기며 8칸을 넘으면 오래된 것을 버린다", () => {
    let recent: string[] = [];
    for (let i = 0; i < 10; i += 1) recent = pushRecentColor(recent, `#00000${i}`);
    expect(recent).toHaveLength(8);
    expect(recent[0]).toBe("#000009");
    expect(recent).not.toContain("#000000");
    recent = pushRecentColor(recent, "#000005");
    expect(recent[0]).toBe("#000005");
    expect(recent.filter((c) => c === "#000005")).toHaveLength(1);
    expect(recent).toHaveLength(8);
  });

  it("hexToStrokeColor는 16진을 레인 획 색(sRGB straight 0..1, 알파 1)으로 바꾸고 잘못된 입력은 null이다", () => {
    expect(hexToStrokeColor("#000000")).toEqual([0, 0, 0, 1]);
    expect(hexToStrokeColor("#ff8000")).toEqual([1, 128 / 255, 0, 1]);
    expect(hexToStrokeColor("f80")).toEqual([1, 136 / 255, 0, 1]);
    expect(hexToStrokeColor("#zzz")).toBeNull();
  });
});
