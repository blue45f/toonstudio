import { describe, expect, it } from "vitest";

import {
  BLENDER_FANTASY_LIGHTING_RIG_PRESETS,
  evaluateBlenderFantasyLightingRig,
  evaluateEeveeLightContribution,
  evaluateIesProfileAttenuation,
  evaluateLightProbeVolumeIrradiance,
  findBlenderFantasyLightingRigPreset,
  kelvinToLinearRgb,
} from "./studio-3d-blender-eevee-lighting-rig";

describe("studio-3d-blender-eevee-lighting-rig", () => {
  it("converts Planckian blackbody Kelvin temperatures (1800K warm vs 9000K cool) and tint accurately", () => {
    const warm1800 = kelvinToLinearRgb(1800, 0);
    const daylight6500 = kelvinToLinearRgb(6500, 0);
    const cool9000 = kelvinToLinearRgb(9000, 0);

    // 1800K candle/bloodmoon is strongly red-dominant with near-zero blue
    expect(warm1800[0]).toBeGreaterThan(0.95);
    expect(warm1800[2]).toBeLessThan(0.15);

    // 6500K daylight is balanced white
    expect(daylight6500[0]).toBeGreaterThan(0.9);
    expect(daylight6500[1]).toBeGreaterThan(0.9);
    expect(daylight6500[2]).toBeGreaterThan(0.9);

    // 9000K cool sky has blue >= red
    expect(cool9000[2]).toBeGreaterThan(cool9000[0]);
  });

  it("evaluates Blender IESLightNode photometric profiles across angles", () => {
    expect(evaluateIesProfileAttenuation("omni-uniform", -0.5)).toBe(1.0);
    expect(evaluateIesProfileAttenuation("narrow-spot-15", 0.5)).toBe(0);
    expect(evaluateIesProfileAttenuation("narrow-spot-15", 0.99)).toBeGreaterThan(0.8);

    const pillarCore = evaluateIesProfileAttenuation("magic-pillar-beam", 0.98);
    const pillarOffAxis = evaluateIesProfileAttenuation("magic-pillar-beam", 0.2);
    expect(pillarCore).toBeGreaterThan(pillarOffAxis);

    const lanternEquator = evaluateIesProfileAttenuation("torch-lantern-ring", 0.0, 0);
    const lanternPole = evaluateIesProfileAttenuation("torch-lantern-ring", 0.95, 0);
    expect(lanternEquator).toBeGreaterThan(lanternPole);
  });

  it("evaluates EEVEE LightProbe volume irradiance and Fast GI bounce boost", () => {
    const preset = findBlenderFantasyLightingRigPreset("holy-sword-awakening-halo");
    const insideSample = evaluateLightProbeVolumeIrradiance(
      preset.lightProbe,
      [0, 2.0, 0],
    );
    const farSample = evaluateLightProbeVolumeIrradiance(
      preset.lightProbe,
      [25, 2.0, 25],
    );

    expect(insideSample.weight).toBe(1.0);
    expect(insideSample.fastGiBounceFactor).toBeGreaterThan(1.0);
    expect(insideSample.totalSurfelCountEstimate).toBe(6 * 4 * 6 * 32);
    expect(farSample.weight).toBe(0);
  });

  it("evaluates all 5 fantasy webtoon lighting rig presets with rim and volumetric glow", () => {
    expect(BLENDER_FANTASY_LIGHTING_RIG_PRESETS).toHaveLength(5);

    for (const preset of BLENDER_FANTASY_LIGHTING_RIG_PRESETS) {
      const evaluation = evaluateBlenderFantasyLightingRig(preset);
      expect(evaluation.rigId).toBe(preset.id);
      expect(evaluation.lightSamples.length).toBe(preset.lights.length);
      expect(evaluation.combinedDiffuseHex).toMatch(/^#[0-9a-f]{6}$/);
      expect(evaluation.combinedRimIntensity).toBeGreaterThan(0);
      expect(evaluation.combinedVolumetricGlow).toBeGreaterThan(0);
      expect(["S", "A", "B"]).toContain(evaluation.webtoonReadabilityGrade);
    }

    // Verify spot cone attenuation on a single light
    const abyssSpot = BLENDER_FANTASY_LIGHTING_RIG_PRESETS[0]!.lights[0]!;
    const hitSample = evaluateEeveeLightContribution(
      abyssSpot,
      [0, 1.4, 0],
      [0, 0.5, 0.86],
      [0, 0, 1],
    );
    expect(hitSample.diffuseIrradiance).toBeGreaterThan(0);
  });
});
