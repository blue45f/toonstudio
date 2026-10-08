import { describe, expect, it } from "vitest";

import { DEFAULT_RECIPE_COLORS } from "../../contracts";
import { hexToLinearRgb } from "../../shared/color";

import { decideTint, isNearWhite, resolveTintColors } from "./tint";

describe("resolveTintColors", () => {
  it("기본은 앱의 DEFAULT_RECIPE_COLORS, --color 값이 덮는다", () => {
    expect(resolveTintColors({})).toEqual(DEFAULT_RECIPE_COLORS);
    expect(resolveTintColors({ hair: "#ff0000" })).toEqual({ ...DEFAULT_RECIPE_COLORS, hair: "#ff0000" });
  });
});

describe("decideTint", () => {
  const colors = resolveTintColors({ skin: "#ffccaa" });

  it("recolor: 역할의 색 키로 틴트를 정하고 선형 값을 굽는다", () => {
    const decision = decideTint("skin", "recolor", colors, [1, 1, 1, 1]);
    expect(decision.colorKey).toBe("skin");
    expect(decision.planColorHex).toBe("#ffccaa");
    expect(decision.bakeLinear).toEqual(hexToLinearRgb("#ffccaa"));
    expect(decideTint("head", "recolor", colors, null).colorKey).toBe("skin");
    expect(decideTint("hair", "recolor", colors, null).planColorHex).toBe(DEFAULT_RECIPE_COLORS.hair);
    expect(decideTint("pupil", "recolor", colors, null).colorKey).toBe("iris");
  });

  it("recolor인데 색 키가 없는 역할은 legacy로 떨어진다(굽지 않는다)", () => {
    expect(decideTint("eyeball", "recolor", colors, null)).toEqual({ mode: "legacy", planColorHex: null, bakeLinear: null, colorKey: null });
  });

  it("fixed: 틴트를 무시하고 GLB 고정색(없거나 흰색이면 #ffffff)을 쓴다", () => {
    expect(decideTint("eyeball", "fixed", colors, null)).toEqual({ mode: "fixed", planColorHex: "#ffffff", bakeLinear: null, colorKey: null });
    expect(decideTint("teeth", "fixed", colors, [1, 1, 1, 1]).planColorHex).toBe("#ffffff");
    const pink = decideTint("tongue", "fixed", colors, [0.8, 0.2, 0.25, 1]);
    expect(pink.planColorHex).toMatch(/^#[0-9a-f]{6}$/u);
    expect(pink.planColorHex).not.toBe("#ffffff");
    expect(pink.bakeLinear).toBeNull();
  });

  it("legacy: 아무것도 바꾸지 않는다", () => {
    expect(decideTint("skin", "legacy", colors, [0.5, 0.5, 0.5, 1])).toEqual({ mode: "legacy", planColorHex: null, bakeLinear: null, colorKey: null });
  });

  it("isNearWhite", () => {
    expect(isNearWhite(null)).toBe(true);
    expect(isNearWhite([1, 1, 1, 1])).toBe(true);
    expect(isNearWhite([1, 0.9, 1, 1])).toBe(false);
  });
});
