import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  CSP_NATIVE_PLUGIN_BINARY_MANIFEST,
  CSP_UX_EDIT_IMAGE_TOOL_CATALOG,
  applyCspGaussBlurFilter,
  applyCspGeometricDistortionFishEyeFilter,
  applyCspLiquifyStrokeDab,
  applyCspMosaicFilter,
  applyCspMotionBlurFilter,
  applyCspPinchFilter,
  applyCspRadialBlurFilter,
  applyCspSharpAndBlurMoreFilter,
  applyCspTgTosDensityTilingComposite,
  applyCspTppChromaticAberrationFilter,
  applyCspUnSharpMaskFilter,
  applyCspWatercolorEdgeV2PostProcess,
} from "../studio-csp-complete-filter-liquify-suite";

function createTestCanvas(width: number, height: number): Uint8Array {
  const buf = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isCenter = x >= 4 && x < width - 4 && y >= 4 && y < height - 4;
      buf[idx] = isCenter ? 220 : 30;
      buf[idx + 1] = isCenter ? 140 : 40;
      buf[idx + 2] = isCenter ? 80 : 60;
      buf[idx + 3] = isCenter ? 255 : 0;
    }
  }
  return buf;
}

describe("CSP 1.5 Complete Native FilterPlugIn (11 bundles), Liquify 7-Mode, Watercolor Edge v2 & TGTos Tiling", () => {
  it("runs GaussBlur, MotionBlur, RadialBlur, UnSharpMask, and Sharp/SharpOff/SharpOffStrong filters", () => {
    const src = createTestCanvas(16, 16);

    const gauss = applyCspGaussBlurFilter(src, 16, 16, { radiusPx: 2.0 });
    expect(gauss.byteLength).toBe(src.byteLength);
    // Edge alpha at (3, 8) should gain non-zero alpha from neighboring opaque pixels
    expect(gauss[(8 * 16 + 3) * 4 + 3]).toBeGreaterThan(0);

    const motion = applyCspMotionBlurFilter(src, 16, 16, {
      angleDeg: 0,
      distancePx: 3,
      direction: "both",
      mode: "smooth",
    });
    expect(motion[(8 * 16 + 2) * 4 + 3]).toBeGreaterThan(0);

    const radial = applyCspRadialBlurFilter(src, 16, 16, {
      centerX: 8,
      centerY: 8,
      strengthPx: 4,
      direction: "outward",
    });
    expect(radial.byteLength).toBe(src.byteLength);

    const unsharp = applyCspUnSharpMaskFilter(src, 16, 16, {
      radiusPx: 1.5,
      amountPercent: 120,
      threshold: 2,
    });
    expect(unsharp[(4 * 16 + 4) * 4]).toBeGreaterThanOrEqual(src[(4 * 16 + 4) * 4]!);

    const sharpStrong = applyCspSharpAndBlurMoreFilter(src, 16, 16, { mode: "sharp-strong" });
    const blurMore = applyCspSharpAndBlurMoreFilter(src, 16, 16, { mode: "blur-more" });
    expect(sharpStrong.byteLength).toBe(src.byteLength);
    expect(blurMore[(8 * 16 + 3) * 4 + 3]).toBeGreaterThan(0);
  });

  it("runs Mosaic, Pinch, TPPChromaticAberration, and GeometricDistortionFishEye filters", () => {
    const src = createTestCanvas(16, 16);

    const mosaic = applyCspMosaicFilter(src, 16, 16, { tileSizePx: 4 });
    // Pixels inside the same 4x4 block must have identical RGBA
    expect(mosaic[(4 * 16 + 4) * 4]).toBe(mosaic[(5 * 16 + 5) * 4]);

    const pinch = applyCspPinchFilter(src, 16, 16, {
      centerX: 8,
      centerY: 8,
      strength: 55,
      radiusScale: 1.0,
      oblateness: 10,
    });
    expect(pinch.byteLength).toBe(src.byteLength);

    const chromatic = applyCspTppChromaticAberrationFilter(src, 16, 16, {
      mode: "lateral",
      intensity: 40,
      angleDeg: 0,
    });
    expect(chromatic.byteLength).toBe(src.byteLength);

    const fisheye = applyCspGeometricDistortionFishEyeFilter(src, 16, 16, {
      distortion: 65,
      centerX: 8,
      centerY: 8,
      radiusScale: 1.0,
      shape: "circle",
    });
    expect(fisheye.byteLength).toBe(src.byteLength);
  });

  it("runs UXEditImageTool.todb Liquify 7-mode engine and Watercolor Edge v2 post-processor", () => {
    const src = createTestCanvas(16, 16);

    const pushed = applyCspLiquifyStrokeDab(src, 16, 16, {
      fromX: 6,
      fromY: 8,
      toX: 9,
      toY: 8,
      radiusPx: 6,
      operation: "push",
      strength: 80,
      hardness: 50,
    });
    expect(pushed).not.toEqual(src);

    const twirled = applyCspLiquifyStrokeDab(src, 16, 16, {
      fromX: 8,
      fromY: 8,
      toX: 8,
      toY: 8,
      radiusPx: 6,
      operation: "twirl-cw",
      strength: 75,
      hardness: 40,
    });
    expect(twirled.byteLength).toBe(src.byteLength);

    const restored = applyCspLiquifyStrokeDab(pushed, 16, 16, {
      fromX: 9,
      fromY: 8,
      toX: 9,
      toY: 8,
      radiusPx: 8,
      operation: "restore",
      strength: 100,
      hardness: 100,
      originalBuffer: src,
    });
    expect(restored[(8 * 16 + 9) * 4]).toBe(src[(8 * 16 + 9) * 4]);

    const waterEdge = applyCspWatercolorEdgeV2PostProcess(src, 16, 16, {
      style: 2,
      strength: 60,
      vividness: 70,
    });
    // Edge pixel (4, 8) adjacent to transparent (3, 8) should darken pigment along the wet boundary
    expect(waterEdge[(8 * 16 + 4) * 4]).toBeLessThan(src[(8 * 16 + 4) * 4]!);
  });

  it("runs TGTosPlugIn density tiling compositor and exposes UXEditImageTool & native binary manifests", () => {
    const src = createTestCanvas(8, 8);
    const pattern = new Uint8Array([64, 192, 192, 64]);
    const tiled1Bit = applyCspTgTosDensityTilingComposite(src, pattern, 2, 8, 8, {
      densityPercent: 50,
      binarize1Bit: true,
    });
    expect([0, 255]).toContain(tiled1Bit[(4 * 8 + 4) * 4 + 3]);

    expect(CSP_UX_EDIT_IMAGE_TOOL_CATALOG.length).toBeGreaterThanOrEqual(25);
    expect(CSP_UX_EDIT_IMAGE_TOOL_CATALOG.some((t) => t.pwId === 134 && t.nameKo === "픽셀 유동화")).toBe(true);
    expect(CSP_UX_EDIT_IMAGE_TOOL_CATALOG.some((t) => t.pwId === 141 && t.nameKo === "속도 조절 지우개")).toBe(true);
    expect(CSP_NATIVE_PLUGIN_BINARY_MANIFEST).toHaveLength(6);

    const uxDbPath = "/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Tool/korean/UXEditImageTool.todb";
    if (existsSync(uxDbPath)) {
      expect(existsSync(uxDbPath)).toBe(true);
    }
  });
});
