import { describe, expect, it } from "vitest";

import { createDefaultRecipe } from "../../contracts";

import { evaluateCharacterLabVerifyAiGate } from "./character-verify-ai-fresh-ideas";

describe("character-verify-ai-fresh-ideas", () => {
  it("evaluates 4-angle turnaround consistency, facial SDF cleanliness, and 5-lens remixes", () => {
    const recipe = createDefaultRecipe();
    const report = evaluateCharacterLabVerifyAiGate({
      shading: recipe.shading,
      lookId: "shaper-cel",
      headUnits: 7.5,
      delight: true,
      disableHairInline: true,
    });

    expect(report.passed).toBe(true);
    expect(report.overallScore100).toBeGreaterThanOrEqual(88);
    expect(report.turnaroundAngles).toHaveLength(4);
    expect(report.remixes).toHaveLength(5);
    expect(report.summaryBadgeKo).toContain("Character Verify AI PASS");
    expect(report.recommendedShadingPatch.mode).toBe("toon");
    expect(report.recommendedShadingPatch.toon?.outlinePressure).toBe(true);
  });

  it("raises outline anisotropy and silhouette score when recommended toon patch is applied", () => {
    const baseShading = createDefaultRecipe().shading;
    const before = evaluateCharacterLabVerifyAiGate({
      shading: {
        ...baseShading,
        mode: "pbr",
        toon: { ...baseShading.toon, outline: "none", rim: false, outlinePressure: false },
      },
      lookId: "shaper-noir-ink",
    });

    const after = evaluateCharacterLabVerifyAiGate({
      shading: {
        ...baseShading,
        ...before.recommendedShadingPatch,
        toon: {
          ...baseShading.toon,
          ...before.recommendedShadingPatch.toon,
        },
      },
      lookId: "shaper-noir-ink",
    });

    expect(after.overallScore100).toBeGreaterThan(before.overallScore100);
    expect(after.outlineAnisotropyScore100).toBe(97.5);
  });

  it("실측 GPU/셰이더 텔레메트리가 모두 활성화된 경우에만 정당하게 100.0/100을 달성하고, 단일 패스 누락 시 감점한다", () => {
    const baseShading = createDefaultRecipe().shading;
    const optimalShading = {
      ...baseShading,
      mode: "toon" as const,
      toon: {
        ...baseShading.toon,
        rampSteps: 3 as const,
        faceSdfShadow: true,
        outline: "hull" as const,
        rim: true,
        outlinePressure: true,
      },
    };

    const legacy = evaluateCharacterLabVerifyAiGate({
      shading: optimalShading,
      lookId: "shaper-cel",
      delight: true,
      disableHairInline: true,
    });
    expect(legacy.overallScore100).toBe(98.34);
    expect(legacy.outlineAnisotropyScore100).toBe(97.5);

    const fullTelemetry = {
      headContourPassActive: true,
      faceSdfAntiAliased: true,
      kitFaceShadowUvPresent: true,
      cubicMatCapActive: true,
      directionalBacklightRimActive: true,
      hairAngelRingActive: true,
      screenSpaceOutlineCompensation: true,
      coloredLineartActive: true,
      vertexTaperMaskActive: true,
      hairInlineStencilActive: true,
    };

    const perfect = evaluateCharacterLabVerifyAiGate({
      shading: optimalShading,
      lookId: "shaper-cel",
      delight: true,
      disableHairInline: true,
      renderTelemetry: fullTelemetry,
    });
    expect(perfect.passed).toBe(true);
    expect(perfect.turnaroundConsistencyScore100).toBe(100);
    expect(perfect.facialSdfCleanScore100).toBe(100);
    expect(perfect.silhouetteReadabilityScore100).toBe(100);
    expect(perfect.outlineAnisotropyScore100).toBe(100);
    expect(perfect.rightsProvenanceScore100).toBe(100);
    expect(perfect.overallScore100).toBe(100);

    for (const key of Object.keys(fullTelemetry) as Array<keyof typeof fullTelemetry>) {
      const degraded = evaluateCharacterLabVerifyAiGate({
        shading: optimalShading,
        lookId: "shaper-cel",
        delight: true,
        disableHairInline: true,
        renderTelemetry: { ...fullTelemetry, [key]: false },
      });
      expect(degraded.overallScore100, `missing pass: ${key}`).toBeLessThan(100);
    }

    const withReadback = evaluateCharacterLabVerifyAiGate({
      shading: optimalShading,
      lookId: "shaper-cel",
      renderTelemetry: {
        ...fullTelemetry,
        turnaroundReadbackMetrics: {
          front0Silhouette100: 94.0,
          threeQuarter35Silhouette100: 96.0,
          side90Silhouette100: 95.0,
          back180Silhouette100: 95.0,
          faceSdfClean100: 97.0,
        },
      },
    });
    expect(withReadback.turnaroundConsistencyScore100).toBe(95);
    expect(withReadback.facialSdfCleanScore100).toBe(97);
    expect(withReadback.overallScore100).toBeLessThan(100);
  });
});
