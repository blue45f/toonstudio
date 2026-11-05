import { describe, expect, it } from "vitest";

import {
  BRUSH_STUDIO_V6_PIGMENT_PROVIDERS,
  BrushStudioV6PigmentProviderUnavailableError,
  brushStudioV6PigmentProviderForNode,
  createBrushStudioV6PigmentPalette,
  mixBrushStudioV6PigmentChromaPreserving,
  mixBrushStudioV6PigmentColors,
  simulateLatentPigmentGlaze,
} from "./brush-studio-v6-pigment-provider";

describe("V6 pigment providers", () => {
  it("자체 잠재 안료를 RGB·분광 대체 없이 실행한다", () => {
    const first = "#ffe000";
    const second = "#0050dc";
    const mixbox = mixBrushStudioV6PigmentColors(first, second, 0.5, "toonstudio-latent-pigment-v1");
    const rgb = mixBrushStudioV6PigmentColors(first, second, 0.5, "rgb-linear-v1");
    const spectral = mixBrushStudioV6PigmentColors(first, second, 0.5, "spectral-wgm-v1");
    expect(mixbox).not.toBe(rgb);
    expect(mixbox).not.toBe(spectral);
    const value = Number.parseInt(mixbox.slice(1), 16);
    const red = value >>> 16;
    const green = value >>> 8 & 0xff;
    const blue = value & 0xff;
    expect(green).toBeGreaterThan(red);
    expect(green).toBeGreaterThan(blue);
  });

  it("preserves exact endpoints and creates deterministic immutable latent palettes", () => {
    const palette = createBrushStudioV6PigmentPalette(
      "#f4d03f",
      "#2455d6",
      "toonstudio-latent-pigment-v1",
    );
    expect(palette).toHaveLength(33);
    expect(palette[0]).toBe("#f4d03f");
    expect(palette.at(-1)).toBe("#2455d6");
    expect(Object.isFrozen(palette)).toBe(true);
    expect(createBrushStudioV6PigmentPalette(
      "#f4d03f",
      "#2455d6",
      "toonstudio-latent-pigment-v1",
    )).toEqual(palette);
  });

  it("keeps provider identities explicit and fails closed for unknown pigment nodes", () => {
    expect(new Set(BRUSH_STUDIO_V6_PIGMENT_PROVIDERS.map((entry) => entry.id)).size)
      .toBe(BRUSH_STUDIO_V6_PIGMENT_PROVIDERS.length);
    expect(brushStudioV6PigmentProviderForNode("pigment-mixbox")).toMatchObject({
      id: "toonstudio-latent-pigment-v1",
      version: "1",
      rights: "internal",
      execution: "native",
    });
    expect(brushStudioV6PigmentProviderForNode("pigment-unknown")).toBeNull();
    expect(BRUSH_STUDIO_V6_PIGMENT_PROVIDERS.some((entry) => String(entry.id) === "mixbox-js-v2"))
      .toBe(false);
    expect(() => mixBrushStudioV6PigmentColors("#ffff00", "#0000ff", 0.5, "mixbox-js-v2" as never))
      .toThrow(BrushStudioV6PigmentProviderUnavailableError);
    expect(() => createBrushStudioV6PigmentPalette(
      "#000000",
      "#ffffff",
      "unknown-provider" as never,
    )).toThrow(BrushStudioV6PigmentProviderUnavailableError);
  });

  it("자체 안료의 채도를 보존하고 다중 코팅을 계산한다", () => {
    const mixed = mixBrushStudioV6PigmentChromaPreserving("#ffe600", "#0047db", 0.5);
    const parsed = Number.parseInt(mixed.slice(1), 16);
    const r = parsed >>> 16;
    const g = (parsed >>> 8) & 0xff;
    const b = parsed & 0xff;
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);

    const glazeSteps = simulateLatentPigmentGlaze("#f8e16c", "#1d4ed8", 4, 0.35);
    expect(glazeSteps).toHaveLength(5);
    expect(glazeSteps[0]).toBe("#f8e16c");
    expect(Object.isFrozen(glazeSteps)).toBe(true);
    expect(new Set(glazeSteps).size).toBeGreaterThan(3);
  });
});
