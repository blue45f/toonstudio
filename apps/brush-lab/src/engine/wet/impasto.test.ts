import { describe, expect, it } from "vitest";

import {
  impastoCompositeShading,
  impastoLighting,
  impastoSpecular,
  impastoSpecularFlat,
  stampBristleFurrowRidge,
} from "./impasto";

describe("impasto composite shading & bristle furrow ridges", () => {
  it("impastoCompositeShading returns zero specularDelta on a flat height field", () => {
    const width = 8;
    const height = new Float32Array(width * width).fill(0.5);
    const light = [-0.4, -0.6, 0.7] as const;
    const result = impastoCompositeShading(height, width, { light, gain: 2 });

    for (let i = 0; i < result.specularDelta.length; i += 1) {
      expect(result.specularDelta[i]).toBeCloseTo(0, 6);
      expect(result.normalX[i]).toBeCloseTo(0, 6);
      expect(result.normalY[i]).toBeCloseTo(0, 6);
    }
  });

  it("impastoCompositeShading matches standalone impastoLighting and impastoSpecular minus flat", () => {
    const width = 12;
    const height = new Float32Array(width * width);
    stampBristleFurrowRidge(height, width, { x: 6, y: 6 }, 4.5, Math.PI / 6, 0.8, 7);

    const light = [-0.45, -0.55, 0.7] as const;
    const composite = impastoCompositeShading(height, width, { light, gain: 1.5 });
    const standaloneDiffuse = impastoLighting(height, width, light, 1.5);
    const standaloneSpec = impastoSpecular(height, width, light, 1.5);
    const flat = impastoSpecularFlat(light);

    for (let i = 0; i < height.length; i += 1) {
      expect(composite.diffuse[i]).toBeCloseTo(standaloneDiffuse[i] ?? 0, 5);
      expect(composite.specularDelta[i]).toBeCloseTo((standaloneSpec[i] ?? 0) - flat, 5);
    }
  });

  it("stampBristleFurrowRidge creates anisotropic bristle grooves and lateral berm height", () => {
    const width = 16;
    const height = new Float32Array(width * width);
    stampBristleFurrowRidge(height, width, { x: 8, y: 8 }, 6, 0, 0.9, 8);

    const maxH = Math.max(...height);
    expect(maxH).toBeGreaterThan(0.35);
    // Outside radius remains 0
    expect(height[0]).toBe(0);
    expect(height[width * width - 1]).toBe(0);
  });
});
