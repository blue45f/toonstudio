import { describe, expect, it } from "vitest";

import { hexToHsv } from "./studio-color-harmony-engine";
import {
  GAMUT_MASK_PRESETS,
  applyGamutSelection,
  clampHexToGamut,
  clampToGamut,
  clampToGamutKeepingValue,
  getGamutMaskPreset,
  isHexInGamut,
  isInGamut,
  mixStepHexes,
  mixSteps,
  withLuminosityLock,
} from "./studio-gamut-mask";

const warm = getGamutMaskPreset("warm-sunlight")!;
const night = getGamutMaskPreset("cool-night")!;
const pastel = getGamutMaskPreset("pastel-soft")!;

describe("studio-gamut-mask", () => {
  it("ships exactly the four documented presets", () => {
    expect(GAMUT_MASK_PRESETS.map((preset) => preset.id)).toEqual([
      "warm-sunlight",
      "cool-night",
      "pastel-soft",
      "vivid-pop",
    ]);
    expect(getGamutMaskPreset("missing")).toBeNull();
    expect(getGamutMaskPreset(null)).toBeNull();
  });

  it("classifies colors by polygon and hue window", () => {
    // #00ffff: h=180 is outside the warm window 0..80.
    expect(isHexInGamut("#00ffff", warm)).toBe(false);
    // A muted warm mid-tone sits inside both the polygon and the window.
    expect(isInGamut({ h: 40, s: 50, v: 70 }, warm)).toBe(true);
    // Same (s, v) but a night hue window rejects it.
    expect(isInGamut({ h: 40, s: 50, v: 70 }, night)).toBe(false);
    expect(isInGamut({ h: 240, s: 40, v: 40 }, night)).toBe(true);
  });

  it("clamps an out-of-gamut pick back inside the gamut", () => {
    const clamped = clampHexToGamut("#00ffff", warm);
    expect(clamped).not.toBe("#00ffff");
    expect(isHexInGamut(clamped, warm)).toBe(true);
    const hsv = clampToGamut({ h: 180, s: 100, v: 100 }, warm);
    expect(hsv.h).toBe(80); // nearest hue-window edge
    expect(isInGamut(hsv, warm)).toBe(true);
  });

  it("keeps an in-gamut color untouched by the clamp", () => {
    const inside = { h: 240, s: 40, v: 40 };
    expect(clampToGamut(inside, night)).toEqual(inside);
    expect(clampHexToGamut("#d9aeae", pastel)).toBe("#d9aeae");
  });

  it("luminosity lock keeps the previous value exactly", () => {
    const locked = withLuminosityLock({ h: 0, s: 50, v: 50.2 }, { h: 200, s: 80, v: 90 });
    expect(locked).toEqual({ h: 200, s: 80, v: 50.2 });
  });

  it("applyGamutSelection is a pass-through when every filter is off", () => {
    expect(applyGamutSelection("#123456", "#00ffff")).toEqual({
      hex: "#00ffff",
      clamped: false,
      valueKept: false,
    });
    expect(applyGamutSelection("#123456", "#00ffff", { mask: null })).toEqual({
      hex: "#00ffff",
      clamped: false,
      valueKept: false,
    });
  });

  it("applyGamutSelection clamps the pick into the active gamut", () => {
    const result = applyGamutSelection("#ff0000", "#00ffff", { mask: warm });
    expect(result.clamped).toBe(true);
    expect(isHexInGamut(result.hex, warm)).toBe(true);
  });

  it("applyGamutSelection keeps v under luminosity lock, even with a gamut on", () => {
    const previous = "#804040"; // v = 50.2
    const result = applyGamutSelection(previous, "#00ffff", {
      mask: night,
      luminosityLocked: true,
    });
    expect(result.valueKept).toBe(true);
    expect(Math.abs(hexToHsv(result.hex).v - hexToHsv(previous).v)).toBeLessThanOrEqual(1);
    expect(isHexInGamut(result.hex, night)).toBe(true);
  });

  it("keeping-value clamp returns null when the value line misses the polygon", () => {
    // Pastel polygon spans v 66..100, so v=20 never crosses it.
    expect(clampToGamutKeepingValue({ h: 0, s: 50, v: 20 }, pastel)).toBeNull();
    const kept = clampToGamutKeepingValue({ h: 0, s: 90, v: 80 }, pastel);
    expect(kept).not.toBeNull();
    expect(kept!.v).toBe(80);
    expect(isInGamut(kept!, pastel)).toBe(true);
  });

  it("mixer produces the requested number of steps on the shortest hue arc", () => {
    const steps = mixSteps({ h: 350, s: 50, v: 50 }, { h: 10, s: 50, v: 50 }, 3);
    expect(steps).toHaveLength(3);
    // 350 -> 10 wraps through 0, never through 180.
    expect(steps.every((step) => step.h >= 350 || step.h <= 10)).toBe(true);
    expect(mixSteps({ h: 0, s: 0, v: 0 }, { h: 0, s: 0, v: 0 }, 0)).toHaveLength(1);
  });

  it("mixer hexes are valid, ordered, and stay in the active gamut", () => {
    const steps = mixStepHexes("#ff0000", "#0000ff", 5);
    expect(steps).toHaveLength(5);
    expect(steps.every((hex) => /^#[0-9a-f]{6}$/.test(hex))).toBe(true);
    const values = steps.map((hex) => hexToHsv(hex).h);
    expect(values[0]!).toBeLessThan(360);
    const gamutSteps = mixStepHexes("#ff0000", "#0000ff", 5, night);
    expect(gamutSteps.every((hex) => isHexInGamut(hex, night))).toBe(true);
  });
});
