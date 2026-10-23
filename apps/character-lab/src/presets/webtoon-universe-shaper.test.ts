import { describe, expect, it } from "vitest";

import {
  characterRecipeSchema,
  createDefaultRecipe,
  createKitDefaultRecipe,
} from "../contracts";

import {
  WEBTOON_UNIVERSE_SHAPER_IDS,
  WEBTOON_UNIVERSE_SHAPER_PRESETS,
  applyShaperFineSlidersToRecipe,
  blendWebtoonUniverseRecipes,
  composeWebtoonUniverseRecipe,
  webtoonUniverseShaperPreset,
} from "./webtoon-universe-shaper";

describe("presets/webtoon-universe-shaper", () => {
  it("8대 웹툰 세계관 셰이퍼 프리셋이 절차(procedural) 및 키트(kit) 기본 레시피 위에서 모두 유효한 v3 레시피를 합성한다", () => {
    expect(WEBTOON_UNIVERSE_SHAPER_PRESETS).toHaveLength(8);
    expect(WEBTOON_UNIVERSE_SHAPER_IDS).toHaveLength(8);

    const procBase = createDefaultRecipe();
    const kitBase = createKitDefaultRecipe();

    for (const id of WEBTOON_UNIVERSE_SHAPER_IDS) {
      const preset = webtoonUniverseShaperPreset(id);
      expect(preset.id).toBe(id);
      expect(preset.varcoBinding.glbArtifactName).toMatch(/\.glb$/u);

      const procComposed = composeWebtoonUniverseRecipe(id, procBase);
      expect(procComposed.ok).toBe(true);
      if (procComposed.ok) {
        expect(characterRecipeSchema.safeParse(procComposed.recipe).success).toBe(true);
        expect(procComposed.recipe.shading.mode).toBe("toon");
        expect(procComposed.recipe.style.packId).toBe(preset.artStyleId);
      }

      const kitComposed = composeWebtoonUniverseRecipe(id, kitBase);
      expect(kitComposed.ok).toBe(true);
      if (kitComposed.ok) {
        expect(characterRecipeSchema.safeParse(kitComposed.recipe).success).toBe(true);
        expect(kitComposed.recipe.source.kind).toBe("kit");
      }
    }
  });

  it("3D 세이퍼 미세 슬라이더(안면·체형·비례·파츠 형태·외곽선 두께)와 세계관 간 0..1 연속 블렌딩이 정확히 작동한다", () => {
    const base = createDefaultRecipe();
    const blended = blendWebtoonUniverseRecipes(
      "school-romance",
      "hunter-awakener",
      0.5,
      base,
    );
    expect(blended.ok).toBe(true);
    if (!blended.ok) return;

    expect(blended.preset.id).toBe("hunter-awakener");
    expect(blended.recipe.style.proportion?.headsTall).toBeCloseTo((7.8 + 8.6) / 2, 2);

    const fineAdjusted = applyShaperFineSlidersToRecipe(blended.recipe, {
      face: { eyeSize: 0.75, jawWidth: -0.4 },
      body: { shoulderWidth: 0.65 },
      proportion: { headsTall: 8.8, legRatio: 0.55 },
      partParams: { hair: { length: 0.9, curl: 0.45 } },
      hairColor: { gradient: [0.35, 0.95], tipMix: 0.8, accent: "streak" },
      outlineWidthMm: 5.5,
      rampSoftness: 0.4,
      rimStrength: 1.4,
    });
    expect(fineAdjusted.ok).toBe(true);
    if (!fineAdjusted.ok) return;

    expect(fineAdjusted.recipe.face.eyeSize).toBe(0.75);
    expect(fineAdjusted.recipe.face.jawWidth).toBe(-0.4);
    expect(fineAdjusted.recipe.body.shoulderWidth).toBe(0.65);
    expect(fineAdjusted.recipe.style.proportion?.headsTall).toBe(8.8);
    expect(fineAdjusted.recipe.partParams.hair?.length).toBe(0.9);
    expect(fineAdjusted.recipe.hairColor.tipMix).toBe(0.8);
    expect(fineAdjusted.recipe.shading.look.line.widthMm).toBe(5.5);
    expect(fineAdjusted.recipe.shading.look.ramp.softness).toBe(0.4);
    expect(fineAdjusted.recipe.shading.look.rim.strength).toBe(1.4);
  });
});
