import { describe, expect, it } from "vitest";

import {
  buildShaperMultipassPsdStack,
  compositeShaperMultipassPreview,
  computeAlphaCropBounds,
  cropRgbaBuffer,
  resolveShaperExportResolution,
  SHAPER_CANONICAL_PASS_ORDER,
  SHAPER_EXPORT_RE_EVIDENCE,
} from "./studio-shaper-multipass-psd-compositor";

function createSolidPixelPass(
  width: number,
  height: number,
  x: number,
  y: number,
  rgba: readonly [number, number, number, number],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  const idx = (y * width + x) * 4;
  buf[idx] = rgba[0];
  buf[idx + 1] = rgba[1];
  buf[idx + 2] = rgba[2];
  buf[idx + 3] = rgba[3];
  return buf;
}

describe("studio-shaper-multipass-psd-compositor", () => {
  it("preserves ExportManager (0x02000026) reverse-engineering metadata and 8 canonical pass names", () => {
    expect(SHAPER_EXPORT_RE_EVIDENCE.exportManagerToken).toBe("0x02000026");
    expect(SHAPER_EXPORT_RE_EVIDENCE.userStringsRange).toBe("0x70001167..0x700011d9");
    expect(SHAPER_CANONICAL_PASS_ORDER).toEqual([
      "Base",
      "Shadow",
      "Eyeball",
      "OutLine",
      "Hair Base",
      "Hair Shadow",
      "Hair Line",
      "Clip",
    ]);
  });

  it("calculates SetResolusion scales (1x, 2x, 4x, custom) accurately", () => {
    expect(
      resolveShaperExportResolution({
        baseWidth: 1024,
        baseHeight: 1536,
        scale: "2x",
      }),
    ).toEqual({
      scale: "2x",
      width: 2048,
      height: 3072,
      scaleFactorX: 2,
      scaleFactorY: 2,
    });

    expect(
      resolveShaperExportResolution({
        baseWidth: 1000,
        baseHeight: 1000,
        scale: "4x",
      }).width,
    ).toBe(4000);

    expect(
      resolveShaperExportResolution({
        baseWidth: 800,
        baseHeight: 600,
        scale: "custom",
        customWidth: 1600,
        customHeight: 900,
      }),
    ).toEqual({
      scale: "custom",
      width: 1600,
      height: 900,
      scaleFactorX: 2,
      scaleFactorY: 1.5,
    });
  });

  it("computes alpha crop bounds and crops RGBA buffers without distortion", () => {
    const width = 4;
    const height = 4;
    const buf = createSolidPixelPass(width, height, 2, 1, [200, 100, 50, 255]);

    const bounds = computeAlphaCropBounds(buf, width, height);
    expect(bounds).toEqual({ x: 2, y: 1, width: 1, height: 1 });

    const cropped = cropRgbaBuffer(buf, width, height, bounds);
    expect(Array.from(cropped)).toEqual([200, 100, 50, 255]);
  });

  it("builds the 8-Pass PSD stack with clipping masks (Shadow->Base, Hair Shadow->Hair Base) and composites preview", () => {
    const width = 2;
    const height = 1;

    // Pixel 0: body Base (200, 160, 140, 255) + Shadow (128, 128, 128, 255)
    // Pixel 1: Base is transparent (0, 0, 0, 0), Shadow has stray pixel (50, 50, 50, 255) -> must be clipped out!
    const basePass = createSolidPixelPass(width, height, 0, 0, [200, 160, 140, 255]);
    const shadowPass = new Uint8ClampedArray([
      128, 128, 128, 255,
      50, 50, 50, 255,
    ]);
    const hairBasePass = createSolidPixelPass(width, height, 1, 0, [100, 150, 200, 255]);
    const hairShadowPass = createSolidPixelPass(width, height, 1, 0, [128, 128, 128, 255]);

    const stack = buildShaperMultipassPsdStack({
      width,
      height,
      passes: {
        Base: basePass,
        Shadow: shadowPass,
        "Hair Base": hairBasePass,
        "Hair Shadow": hairShadowPass,
      },
    });

    expect(stack.layers).toHaveLength(8);

    const baseLayer = stack.layers.find((l) => l.passId === "Base");
    const shadowLayer = stack.layers.find((l) => l.passId === "Shadow");
    const outlineLayer = stack.layers.find((l) => l.passId === "OutLine");
    const hairShadowLayer = stack.layers.find((l) => l.passId === "Hair Shadow");

    expect(baseLayer?.renderFlags.disableShadowObjects).toBe(true);
    expect(shadowLayer?.clippedToPassId).toBe("Base");
    expect(shadowLayer?.clippingMaskEnabled).toBe(true);
    expect(outlineLayer?.renderFlags.onlyOutlineObjects).toBe(true);
    expect(hairShadowLayer?.clippedToPassId).toBe("Hair Base");

    const preview = compositeShaperMultipassPreview(stack);
    // Pixel 0: Base (200,160,140) multiplied by Shadow (128/255 ≈ 0.502)
    expect(preview[0]).toBe(Math.round((200 / 255) * (128 / 255) * 255));
    expect(preview[1]).toBe(Math.round((160 / 255) * (128 / 255) * 255));
    expect(preview[2]).toBe(Math.round((140 / 255) * (128 / 255) * 255));
    expect(preview[3]).toBe(255);

    // Pixel 1: Shadow was clipped out because Base alpha at pixel 1 is 0;
    // Hair Base (100,150,200) multiplied by Hair Shadow (128/255)
    expect(preview[4]).toBe(Math.round((100 / 255) * (128 / 255) * 255));
    expect(preview[5]).toBe(Math.round((150 / 255) * (128 / 255) * 255));
    expect(preview[6]).toBe(Math.round((200 / 255) * (128 / 255) * 255));
    expect(preview[7]).toBe(255);
  });
});
