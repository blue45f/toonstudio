import { describe, expect, it } from "vitest";

import { Pcg32 } from "../core/rng";

import {
  applyPigmentColorDynamics,
  dabColor,
  hsvToRgb,
  NO_COLOR_DYNAMICS,
  rgbToHsv,
} from "./color-dynamics";

describe("color-dynamics & applyPigmentColorDynamics", () => {
  it("round-trips rgbToHsv and hsvToRgb accurately", () => {
    const [h, s, v] = rgbToHsv(0.85, 0.35, 0.15);
    const [r, g, b] = hsvToRgb(h, s, v);
    expect(r).toBeCloseTo(0.85, 5);
    expect(g).toBeCloseTo(0.35, 5);
    expect(b).toBeCloseTo(0.15, 5);
  });

  it("dabColor consumes exactly 3 RNG floats regardless of jitter state", () => {
    const rng1 = new Pcg32(42);
    const rng2 = new Pcg32(42);
    dabColor([0.5, 0.4, 0.3, 1], NO_COLOR_DYNAMICS, rng1);
    dabColor(
      [0.5, 0.4, 0.3, 1],
      { hueJitter: 0.2, satJitter: 0.2, valJitter: 0.2, perDab: true, kmMixing: false },
      rng2,
    );
    expect(rng1.nextU32()).toBe(rng2.nextU32());
  });

  it("applyPigmentColorDynamics mixes yellow and blue into a vibrant green without grey mud", () => {
    const yellow = [1.0, 0.88, 0.04] as const;
    const blue = [0.05, 0.28, 0.88] as const;
    const mixed = applyPigmentColorDynamics(yellow, {
      secondaryPigment: blue,
      secondaryMix: 0.5,
    });
    expect(mixed[1]).toBeGreaterThan(mixed[0]);
    expect(mixed[1]).toBeGreaterThan(mixed[2]);
  });

  it("applyPigmentColorDynamics shifts warm/cool temperature and lifts with titanium white", () => {
    const base = [0.22, 0.52, 0.38] as const;
    const warm = applyPigmentColorDynamics(base, { temperatureShift: 0.8 });
    const cool = applyPigmentColorDynamics(base, { temperatureShift: -0.8 });
    const lifted = applyPigmentColorDynamics(base, { titaniumLift: 0.7 });

    expect(warm[0]).toBeGreaterThan(cool[0]);
    expect(cool[2]).toBeGreaterThan(warm[2]);
    expect(lifted[0] + lifted[1] + lifted[2]).toBeGreaterThan(base[0] + base[1] + base[2]);
  });
});
