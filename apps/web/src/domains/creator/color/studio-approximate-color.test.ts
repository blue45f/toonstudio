import { describe, expect, it } from "vitest";

import {
  generateApproximateColorGrid,
  hexToRgb,
  hsvToRgb,
  rgbToHsv,
  shiftHueTowardsTarget,
} from "./studio-approximate-color";

describe("studio-approximate-color", () => {
  it("converts between RGB and HSV with circular fidelity", () => {
    // Red: H=0, S=1, V=1
    expect(rgbToHsv(255, 0, 0)).toEqual([0, 1, 1]);
    expect(hsvToRgb(0, 1, 1)).toEqual([255, 0, 0]);

    // Green: H=120, S=1, V=1
    expect(rgbToHsv(0, 255, 0)).toEqual([120, 1, 1]);
    expect(hsvToRgb(120, 1, 1)).toEqual([0, 255, 0]);

    // Blue: H=240, S=1, V=1
    expect(rgbToHsv(0, 0, 255)).toEqual([240, 1, 1]);
    expect(hsvToRgb(240, 1, 1)).toEqual([0, 0, 255]);
  });

  it("guarantees the center tile matches the reference color", () => {
    const centerHex = "#fcd5b5";
    const grid5x5 = generateApproximateColorGrid(centerHex, {
      mode: "sat-val",
      steps: 5,
      deltaPercent: 5,
    });

    expect(grid5x5.length).toBe(5);
    expect(grid5x5[0]?.length).toBe(5);

    // Center of 5x5 is row 2, col 2
    const centerTile = grid5x5[2]?.[2];
    expect(centerTile?.toLowerCase()).toBe(centerHex.toLowerCase());
  });

  it("supports multiple variation modes and step sizes including webtoon temp-val mode", () => {
    const grid7x7 = generateApproximateColorGrid("#3b82f6", {
      mode: "hue-sat",
      steps: 7,
      deltaPercent: 8,
    });
    expect(grid7x7.length).toBe(7);
    expect(grid7x7[3]?.[3]?.toLowerCase()).toBe("#3b82f6");

    const gridValOnly = generateApproximateColorGrid("#ff0000", {
      mode: "val-only",
      steps: 5,
      deltaPercent: 10,
    });
    expect(gridValOnly.length).toBe(5);
    expect(gridValOnly[2]?.[2]?.toLowerCase()).toBe("#ff0000");

    // Temp-val mode shifts left columns toward cool cobalt shadow (222°) and right columns toward warm sunlight (42°)
    expect(shiftHueTowardsTarget(350, 42, 0.5)).toBeCloseTo(16, 0);
    const gridTempVal = generateApproximateColorGrid("#e59882", {
      mode: "temp-val",
      steps: 5,
      deltaPercent: 8,
    });
    expect(gridTempVal[2]?.[2]?.toLowerCase()).toBe("#e59882");
    const coolLeftHex = gridTempVal[2]?.[0] ?? "#e59882";
    const warmRightHex = gridTempVal[2]?.[4] ?? "#e59882";
    const [coolH] = rgbToHsv(...hexToRgb(coolLeftHex));
    const [warmH] = rgbToHsv(...hexToRgb(warmRightHex));
    expect(Math.abs(warmH - 42)).toBeLessThan(Math.abs(coolH - 42));
  });
});
