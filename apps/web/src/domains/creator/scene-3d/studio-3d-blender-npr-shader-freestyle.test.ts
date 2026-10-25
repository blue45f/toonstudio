import { describe, expect, it } from "vitest";

import {
  BLENDER_FREESTYLE_INK_PRESETS,
  BLENDER_NPR_SHADER_PRESETS,
  DEFAULT_FREESTYLE_SAMPLE_EDGES,
  evaluateBlenderColorRamp,
  evaluateBlenderNprShaderTree,
  evaluateBlenderToonBsdf,
  evaluateFreestyleViewMapStrokes,
} from "./studio-3d-blender-npr-shader-freestyle";

describe("studio-3d-blender-npr-shader-freestyle", () => {
  it("evaluates Blender ShaderNodeBsdfToon for DIFFUSE and GLOSSY components", () => {
    const litDiffuse = evaluateBlenderToonBsdf(
      "DIFFUSE",
      0.5,
      0.1,
      [0, 0, 1],
      [0, 0, 1],
      [0, 0, 1],
    );
    const darkDiffuse = evaluateBlenderToonBsdf(
      "DIFFUSE",
      0.3,
      0.05,
      [0, 0, 1],
      [0, 0, -1],
      [0, 0, 1],
    );
    expect(litDiffuse).toBe(1.0);
    expect(darkDiffuse).toBe(0.0);

    const glossyPeak = evaluateBlenderToonBsdf(
      "GLOSSY",
      0.35,
      0.08,
      [0, 0, 1],
      [0, 0, 1],
      [0, 0, 1],
    );
    expect(glossyPeak).toBe(1.0);
  });

  it("evaluates ShaderNodeValToRGB (ColorRamp) in CONSTANT, LINEAR, and EASE modes", () => {
    const stops = BLENDER_NPR_SHADER_PRESETS[0]!.colorRampStops;
    const constantSample = evaluateBlenderColorRamp(0.5, stops, "CONSTANT");
    const linearSample = evaluateBlenderColorRamp(0.5, stops, "LINEAR");
    const easeSample = evaluateBlenderColorRamp(0.5, stops, "EASE");

    // In CONSTANT mode at 0.5 (between 0.32 and 0.64), it snaps to stop index 1 (#7f5539)
    expect(constantSample.stopIndex).toBe(1);
    expect(constantSample.hex).toBe("#7f5539");
    // In LINEAR/EASE mode it interpolates toward stop 2 (#d4a359)
    expect(linearSample.rgb[0]).toBeGreaterThan(constantSample.rgb[0]);
    expect(easeSample.hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("evaluates full Blender ShaderNodeTree (ShaderToRGB + AO + Bevel + Fresnel/LayerWeight)", () => {
    for (const preset of BLENDER_NPR_SHADER_PRESETS) {
      const litEdge = evaluateBlenderNprShaderTree(preset, {
        normal: [0.85, 0.2, 0.48],
        lightDir: [0.2, 0.5, 0.84],
        viewDir: [0, 0, 1],
        edgeCurvature: 0.75,
        cavityOcclusion: 0.15,
      });

      expect(litEdge.presetId).toBe(preset.id);
      expect(litEdge.fresnelFactor).toBeGreaterThan(0);
      expect(litEdge.bevelHighlight).toBeGreaterThan(0);
      expect(litEdge.finalSurfaceHex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("evaluates Freestyle ViewMap edge detectors, LineArt occlusion, and stroke modifiers", () => {
    const gpenPreset = BLENDER_FREESTYLE_INK_PRESETS[0]!; // maxOcclusion = 0
    const xrayPreset = BLENDER_FREESTYLE_INK_PRESETS[3]!; // maxOcclusion = 2

    const gpenResult = evaluateFreestyleViewMapStrokes(
      gpenPreset,
      DEFAULT_FREESTYLE_SAMPLE_EDGES,
    );
    const xrayResult = evaluateFreestyleViewMapStrokes(
      xrayPreset,
      DEFAULT_FREESTYLE_SAMPLE_EDGES,
    );

    // G-Pen filters out the occluded inner core edge (occlusionLevel: 1), whereas X-Ray keeps it
    expect(gpenResult.selectedStrokeCount).toBe(2);
    expect(xrayResult.selectedStrokeCount).toBe(3);

    const firstStroke = gpenResult.strokes[0]!;
    expect(firstStroke.classifiedNature).toBe("SILHOUETTE");
    // BackboneStretcher extends endpoints beyond original [120, 40] -> [180, 260]
    expect(firstStroke.stretchedStart2d[1]).toBeLessThan(40);
    expect(firstStroke.stretchedEnd2d[1]).toBeGreaterThan(260);
    expect(firstStroke.midThicknessPx).toBeGreaterThan(firstStroke.startThicknessPx);
  });
});
