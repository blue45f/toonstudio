import { describe, expect, it } from "vitest";

import {
  computeColorRelativeLuminance,
  DEFAULT_INTERMEDIATE_CORNERS,
  generateIntermediateColorGrid,
  hexToRgb,
  interpolateBilinearColor,
  oklabToSrgb,
  rgbToHex,
  srgbToOklab,
  STUDIO_INTERMEDIATE_COLOR_PRESETS,
} from "./studio-intermediate-color";

describe("studio-intermediate-color", () => {
  it("converts hex to RGB and RGB to hex accurately", () => {
    expect(hexToRgb("#ffffff")).toEqual([255, 255, 255]);
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
    expect(hexToRgb("#f00")).toEqual([255, 0, 0]);
    expect(hexToRgb("invalid")).toEqual([128, 128, 128]);

    expect(rgbToHex(255, 255, 255)).toBe("#ffffff");
    expect(rgbToHex(0, 0, 0)).toBe("#000000");
    expect(rgbToHex(255, 0, 0)).toBe("#ff0000");
  });

  it("performs bilinear color interpolation correctly at corners and midpoint", () => {
    const c00 = "#000000"; // Top-Left: black
    const c10 = "#ffffff"; // Top-Right: white
    const c01 = "#000000"; // Bottom-Left: black
    const c11 = "#ffffff"; // Bottom-Right: white

    // At u=0, v=0 -> Top-Left corner
    expect(interpolateBilinearColor(c00, c10, c01, c11, 0, 0)).toBe("#000000");
    // At u=1, v=0 -> Top-Right corner
    expect(interpolateBilinearColor(c00, c10, c01, c11, 1, 0)).toBe("#ffffff");
    // At u=0.5, v=0 -> Mid-gray
    const midTop = interpolateBilinearColor(c00, c10, c01, c11, 0.5, 0);
    const [r] = hexToRgb(midTop);
    expect(r).toBeCloseTo(128, -1);
  });

  it("preserves exact corners and higher perceptual luminance in OKLab bilinear interpolation", () => {
    const [L, a, bLab] = srgbToOklab(252, 213, 181);
    const [rtR, rtG, rtB] = oklabToSrgb(L, a, bLab);
    expect(rtR).toBeCloseTo(252, 0);
    expect(rtG).toBeCloseTo(213, 0);
    expect(rtB).toBeCloseTo(181, 0);

    // Complementary Blue (#0044ff) and Yellow (#ffee00) midpoint in OKLab vs sRGB
    const srgbMid = interpolateBilinearColor("#0044ff", "#ffee00", "#0044ff", "#ffee00", 0.5, 0, "srgb");
    const oklabMid = interpolateBilinearColor("#0044ff", "#ffee00", "#0044ff", "#ffee00", 0.5, 0, "oklab");
    expect(srgbMid).not.toBe(oklabMid);
    // OKLab midpoint between bright yellow and cobalt blue avoids dark muddy sRGB dip
    expect(computeColorRelativeLuminance(oklabMid)).toBeGreaterThan(
      computeColorRelativeLuminance(srgbMid),
    );

    const gridOklab = generateIntermediateColorGrid(DEFAULT_INTERMEDIATE_CORNERS, 4, "oklab");
    expect(gridOklab[0]?.[0]?.toLowerCase()).toBe(DEFAULT_INTERMEDIATE_CORNERS.c00.toLowerCase());
    expect(gridOklab[0]?.[3]?.toLowerCase()).toBe(DEFAULT_INTERMEDIATE_CORNERS.c10.toLowerCase());
    expect(gridOklab[3]?.[0]?.toLowerCase()).toBe(DEFAULT_INTERMEDIATE_CORNERS.c01.toLowerCase());
    expect(gridOklab[3]?.[3]?.toLowerCase()).toBe(DEFAULT_INTERMEDIATE_CORNERS.c11.toLowerCase());
  });

  it("generates an NxN grid of intermediate colors", () => {
    const grid4x4 = generateIntermediateColorGrid(DEFAULT_INTERMEDIATE_CORNERS, 4);
    expect(grid4x4.length).toBe(4);
    expect(grid4x4[0]?.length).toBe(4);
    expect(grid4x4[0]?.[0]?.toLowerCase()).toBe(DEFAULT_INTERMEDIATE_CORNERS.c00.toLowerCase());
    expect(grid4x4[0]?.[3]?.toLowerCase()).toBe(DEFAULT_INTERMEDIATE_CORNERS.c10.toLowerCase());
    expect(grid4x4[3]?.[0]?.toLowerCase()).toBe(DEFAULT_INTERMEDIATE_CORNERS.c01.toLowerCase());
    expect(grid4x4[3]?.[3]?.toLowerCase()).toBe(DEFAULT_INTERMEDIATE_CORNERS.c11.toLowerCase());

    const grid6x6 = generateIntermediateColorGrid(DEFAULT_INTERMEDIATE_CORNERS, 6);
    expect(grid6x6.length).toBe(6);
    expect(grid6x6[0]?.length).toBe(6);
  });

  it("provides curated webtoon presets", () => {
    expect(STUDIO_INTERMEDIATE_COLOR_PRESETS.length).toBeGreaterThanOrEqual(4);
    const skinPreset = STUDIO_INTERMEDIATE_COLOR_PRESETS.find((p) => p.id === "korean-webtoon-skin");
    expect(skinPreset).toBeDefined();
    expect(skinPreset?.corners.c00).toBe("#fff0e6");
  });
});
