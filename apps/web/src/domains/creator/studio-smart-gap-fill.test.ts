import { describe, expect, it } from "vitest";

import { computeStudioSmartGapFillMask } from "./studio-smart-gap-fill";

describe("computeStudioSmartGapFillMask", () => {
  it("fills enclosed empty area cleanly", () => {
    const width = 10;
    const height = 10;
    const pixels = new Uint8Array(width * height * 4); // all transparent

    // Create a 4x4 box with boundary pixels
    for (let x = 2; x <= 7; x += 1) {
      pixels[(2 * width + x) * 4 + 3] = 255; // top line
      pixels[(7 * width + x) * 4 + 3] = 255; // bottom line
    }
    for (let y = 2; y <= 7; y += 1) {
      pixels[(y * width + 2) * 4 + 3] = 255; // left line
      pixels[(y * width + 7) * 4 + 3] = 255; // right line
    }

    const result = computeStudioSmartGapFillMask(pixels, width, height, 4, 4, { gapRadius: 2 });
    expect(result.filledPixelCount).toBeGreaterThan(0);
    expect(result.mask[4 * width + 4]).toBe(255);
    // Outside should not be filled
    expect(result.mask[0]).toBe(0);
  });

  it("seals broken gap and prevents paint leak", () => {
    const width = 10;
    const height = 10;
    const pixels = new Uint8Array(width * height * 4);

    // Create a box with a 1-pixel gap in top boundary
    for (let x = 2; x <= 7; x += 1) {
      if (x === 4) continue; // Gap at (4, 2)
      pixels[(2 * width + x) * 4 + 3] = 255;
      pixels[(7 * width + x) * 4 + 3] = 255;
    }
    for (let y = 2; y <= 7; y += 1) {
      pixels[(y * width + 2) * 4 + 3] = 255;
      pixels[(y * width + 7) * 4 + 3] = 255;
    }

    const result = computeStudioSmartGapFillMask(pixels, width, height, 4, 4, {
      gapRadius: 3,
      expandPx: 0,
    });

    expect(result.sealedGapCount).toBeGreaterThan(0);
    // Inside should be filled
    expect(result.mask[4 * width + 4]).toBe(255);
    // Outer corner (0,0) must stay unfilled because gap was sealed!
    expect(result.mask[0]).toBe(0);
  });

  it("seals 45-degree diagonal line gaps when enableDiagonalGapSeal is true", () => {
    const width = 12;
    const height = 12;
    const pixels = new Uint8Array(width * height * 4);
    const setOpaqueBlack = (x: number, y: number) => {
      pixels[(y * width + x) * 4 + 3] = 255;
    };

    // Draw a diamond/polygon with a 1-step diagonal gap between (5,2) and (7,4) at (6,3)
    for (let x = 2; x <= 5; x += 1) setOpaqueBlack(x, 2);
    // Diagonal wall from (5,2) -> (6,3) [MISSING GAP] -> (7,4) -> (8,5)
    setOpaqueBlack(7, 4);
    setOpaqueBlack(8, 5);
    for (let y = 5; y <= 9; y += 1) setOpaqueBlack(8, y);
    for (let x = 2; x <= 8; x += 1) setOpaqueBlack(x, 9);
    for (let y = 2; y <= 9; y += 1) setOpaqueBlack(2, y);

    const sealed = computeStudioSmartGapFillMask(pixels, width, height, 4, 6, {
      gapRadius: 3,
      expandPx: 0,
      enableDiagonalGapSeal: true,
    });
    expect(sealed.mask[6 * width + 4]).toBe(255);
    expect(sealed.mask[0]).toBe(0);

    const unsealedOrthogonalOnly = computeStudioSmartGapFillMask(pixels, width, height, 4, 6, {
      gapRadius: 2,
      expandPx: 0,
      enableDiagonalGapSeal: false,
    });
    // Without diagonal ray sealing, paint leaks out through (6,3) to (0,0)
    expect(unsealedOrthogonalOnly.mask[0]).toBe(255);
  });

  it("absorbs isolated unpainted pinholes inside the filled region when fillIsolatedPinholesMaxArea > 0", () => {
    const width = 12;
    const height = 12;
    const pixels = new Uint8Array(width * height * 4);

    // Closed 8x8 box from (2,2) to (9,9)
    for (let x = 2; x <= 9; x += 1) {
      pixels[(2 * width + x) * 4 + 3] = 255;
      pixels[(9 * width + x) * 4 + 3] = 255;
    }
    for (let y = 2; y <= 9; y += 1) {
      pixels[(y * width + 2) * 4 + 3] = 255;
      pixels[(y * width + 9) * 4 + 3] = 255;
    }

    // Create a 2-pixel off-color speck at (5,5) and (6,5) that fails colorTolerance but is not dark enough to be a line boundary
    for (const px of [5, 6]) {
      const idx = (5 * width + px) * 4;
      pixels[idx] = 250;
      pixels[idx + 1] = 250;
      pixels[idx + 2] = 250;
      pixels[idx + 3] = 200;
    }

    const withoutPinholeFill = computeStudioSmartGapFillMask(pixels, width, height, 4, 4, {
      expandPx: 0,
      colorTolerance: 10,
      fillIsolatedPinholesMaxArea: 0,
    });
    expect(withoutPinholeFill.mask[5 * width + 5]).toBe(0);
    expect(withoutPinholeFill.absorbedPinholeCount).toBe(0);

    const withPinholeFill = computeStudioSmartGapFillMask(pixels, width, height, 4, 4, {
      expandPx: 0,
      colorTolerance: 10,
      fillIsolatedPinholesMaxArea: 4,
    });
    expect(withPinholeFill.mask[5 * width + 5]).toBe(255);
    expect(withPinholeFill.mask[5 * width + 6]).toBe(255);
    expect(withPinholeFill.absorbedPinholeCount).toBe(2);
    expect(withPinholeFill.mask[0]).toBe(0);
  });

  it("supports negative expandPx erosion and stopAtLineBarrier expansion", () => {
    const width = 12;
    const height = 12;
    const pixels = new Uint8Array(width * height * 4);
    for (let x = 2; x <= 9; x += 1) {
      pixels[(2 * width + x) * 4 + 3] = 255;
      pixels[(9 * width + x) * 4 + 3] = 255;
    }
    for (let y = 2; y <= 9; y += 1) {
      pixels[(y * width + 2) * 4 + 3] = 255;
      pixels[(y * width + 9) * 4 + 3] = 255;
    }

    const base = computeStudioSmartGapFillMask(pixels, width, height, 5, 5, { expandPx: 0 });
    const shrunk = computeStudioSmartGapFillMask(pixels, width, height, 5, 5, { expandPx: -1 });
    expect(shrunk.filledPixelCount).toBeLessThan(base.filledPixelCount);
    // Inner edge (3,3) was filled in base, but eroded in shrunk
    expect(base.mask[3 * width + 3]).toBe(255);
    expect(shrunk.mask[3 * width + 3]).toBe(0);
    // Deep center (5,5) remains filled
    expect(shrunk.mask[5 * width + 5]).toBe(255);

    // With expandPx: 2 and stopAtLineBarrier: true, fill reaches the boundary at x=2 but does not cross to x=1
    const barrierSafe = computeStudioSmartGapFillMask(pixels, width, height, 5, 5, {
      expandPx: 2,
      stopAtLineBarrier: true,
    });
    expect(barrierSafe.mask[5 * width + 2]).toBe(255);
    expect(barrierSafe.mask[5 * width + 1]).toBe(0);
  });
});
