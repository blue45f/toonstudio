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
});
