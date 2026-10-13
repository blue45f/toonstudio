import { describe, expect, it } from "vitest";

import {
  STUDIO_NAMEPLATE_MIN_CONTRAST,
  studioContrastRatio,
  studioReadableNameplateColor,
} from "./studio-virtual-space-nameplate-contrast";

const COSMETICS = { violet: "#d7c8ff", rose: "#ffc2db", sky: "#bde8ff", amber: "#ffe09a" } as const;
// 실제 이름표 판 색: 다른 참가자는 어두운 패널, 내 이름표는 밝은 강조색(알파 포함 "#rrggbbaa").
const PEER_PLATE = "#0b101de6";
const SELF_PLATE_DARK_THEME = "#b39bfff0";
const SELF_TEXT_DARK_THEME = "#121226";

describe("studioContrastRatio", () => {
  it("검정과 흰색은 21:1, 같은 색은 1:1이다", () => {
    expect(studioContrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(studioContrastRatio("#7a7a7a", "#7a7a7a")).toBeCloseTo(1, 5);
  });

  it("3자리·8자리(알파) 표기를 읽고, 읽을 수 없으면 null이다", () => {
    expect(studioContrastRatio("#fff", "#000")).toBeCloseTo(21, 5);
    expect(studioContrastRatio("#ffffffff", "#000000cc")).toBeCloseTo(21, 5);
    expect(studioContrastRatio("rgb(0,0,0)", "#ffffff")).toBeNull();
    expect(studioContrastRatio("#12345", "#ffffff")).toBeNull();
    expect(studioContrastRatio("", "#ffffff")).toBeNull();
  });
});

describe("studioReadableNameplateColor", () => {
  it("어두운 판의 다른 참가자 이름표는 꾸민 색 네 가지를 모두 그대로 쓴다", () => {
    for (const color of Object.values(COSMETICS)) {
      expect(studioContrastRatio(color, PEER_PLATE)!).toBeGreaterThan(STUDIO_NAMEPLATE_MIN_CONTRAST);
      expect(studioReadableNameplateColor(color, PEER_PLATE, "#f1f4ff")).toBe(color);
    }
  });

  it("밝은 강조색 판의 내 이름표는 파스텔이 묻히므로 본래 글자색으로 돌아간다(수정 전 실측 1.46:1)", () => {
    expect(studioContrastRatio(COSMETICS.violet, SELF_PLATE_DARK_THEME)!).toBeLessThan(2);
    for (const color of Object.values(COSMETICS)) {
      expect(studioReadableNameplateColor(color, SELF_PLATE_DARK_THEME, SELF_TEXT_DARK_THEME)).toBe(SELF_TEXT_DARK_THEME);
    }
    expect(studioContrastRatio(SELF_TEXT_DARK_THEME, SELF_PLATE_DARK_THEME)!).toBeGreaterThan(7);
  });

  it("판 색을 모르거나 읽을 수 없으면 꾸민 색을 존중한다", () => {
    expect(studioReadableNameplateColor("#d7c8ff", undefined, "#121226")).toBe("#d7c8ff");
    expect(studioReadableNameplateColor("#d7c8ff", "transparent", "#121226")).toBe("#d7c8ff");
  });

  it("기준 대비는 조정할 수 있다", () => {
    expect(studioReadableNameplateColor("#808080", "#ffffff", "#000000", 3)).toBe("#808080");
    expect(studioReadableNameplateColor("#808080", "#ffffff", "#000000", 4.5)).toBe("#000000");
  });
});
