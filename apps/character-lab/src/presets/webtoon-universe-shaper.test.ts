import { describe, expect, it } from "vitest";

import {
  FACE_PARAM_KEYS,
  characterRecipeSchema,
  createDefaultRecipe,
  createKitDefaultRecipe,
  hairColorSchema,
  lookSchema,
  proportionSchema,
} from "../contracts";

import {
  SHAPER_FACE_SCULPT_PRESETS,
  SHAPER_HAIR_OMBRE_PRESETS,
  SHAPER_HEAD_RATIO_PRESETS,
  SHAPER_TOON_SHADER_PRESETS,
  WEBTOON_UNIVERSE_SHAPER_IDS,
  WEBTOON_UNIVERSE_SHAPER_PRESETS,
  applyShaperFineSlidersToRecipe,
  blendWebtoonUniverseRecipes,
  buildShaperToonShadingProfile,
  composeWebtoonUniverseRecipe,
  resolveCharacterLabVarco3dPreviewSettings,
  summarizeWebtoonShaperParityMetrics,
  webtoonUniverseShaperPreset,
} from "./webtoon-universe-shaper";

describe("presets/webtoon-universe-shaper", () => {
  it("16대 웹툰 세계관 셰이퍼 프리셋이 절차(procedural) 및 키트(kit) 기본 레시피 위에서 모두 유효한 v3 레시피를 합성한다", () => {
    expect(WEBTOON_UNIVERSE_SHAPER_PRESETS).toHaveLength(16);
    expect(WEBTOON_UNIVERSE_SHAPER_IDS).toHaveLength(16);

    const procBase = createDefaultRecipe();
    const kitBase = createKitDefaultRecipe();
    const uniqueSignatures = new Set<string>();

    for (const id of WEBTOON_UNIVERSE_SHAPER_IDS) {
      const preset = webtoonUniverseShaperPreset(id);
      expect(preset.id).toBe(id);
      expect(preset.varcoBinding.glbArtifactName).toMatch(/\.glb$/u);

      const sig = `${preset.artStyleId}:${JSON.stringify(preset.slots)}`;
      expect(uniqueSignatures.has(sig)).toBe(false);
      uniqueSignatures.add(sig);

      const procComposed = composeWebtoonUniverseRecipe(id, procBase);
      expect(procComposed.ok).toBe(true);
      if (procComposed.ok) {
        expect(characterRecipeSchema.safeParse(procComposed.recipe).success).toBe(true);
        expect(procComposed.recipe.shading.mode).toBe("toon");
        expect(procComposed.recipe.style.packId).toBe(preset.artStyleId);
        if (preset.proportionOverride) {
          expect(procComposed.recipe.style.proportion?.headsTall).toBe(preset.proportionOverride.headsTall);
        }
        // style.neutralFacs에 기본 표정을 담고 recipe.expression은 비워 두어 FACS 가중치가 2배로 중복 합산되지 않도록 보장한다
        expect(procComposed.recipe.expression).toEqual({});
        expect(procComposed.recipe.style.neutralFacs).toEqual(preset.expression);
        for (const [unit, weight] of Object.entries(preset.expression)) {
          const effective = (procComposed.recipe.expression[unit as keyof typeof preset.expression] ?? 0) + (procComposed.recipe.style.neutralFacs[unit as keyof typeof preset.expression] ?? 0);
          expect(effective).toBeCloseTo(weight ?? 0, 6);
        }
      }

      const kitComposed = composeWebtoonUniverseRecipe(id, kitBase);
      expect(kitComposed.ok).toBe(true);
      if (kitComposed.ok) {
        expect(characterRecipeSchema.safeParse(kitComposed.recipe).success).toBe(true);
        expect(kitComposed.recipe.source.kind).toBe("kit");
        if (kitComposed.recipe.source.kind === "kit") {
          expect(kitComposed.recipe.source.baseId).toBe(preset.figure === "masculine" ? "male" : "female");
        }
        expect(kitComposed.recipe.expression).toEqual({});
        expect(kitComposed.recipe.style.neutralFacs).toEqual(preset.expression);
        const parity = summarizeWebtoonShaperParityMetrics(kitComposed.recipe);
        expect(parity.summaryKo).toContain("실루엣");
      }
    }
  });

  it("신규 8종 플래그십 웹툰 캐릭터 아키타입(북부대공·남주·아이돌·마탑주·암살자·세자·스포츠·흑막황후) 비례와 슬렌딩이 정상 동작한다", () => {
    const base = createDefaultRecipe();
    const duke = composeWebtoonUniverseRecipe("northern-grand-duke", base);
    expect(duke.ok).toBe(true);
    if (duke.ok) {
      expect(duke.recipe.style.proportion?.headsTall).toBe(8.5);
      expect(duke.recipe.slots.hair).toBe("hair/wolf-layered");
    }

    const blended = blendWebtoonUniverseRecipes("romance-fantasy-noble", "cyberpunk-runner", 0.5, base);
    expect(blended.ok).toBe(true);
    if (blended.ok) {
      expect(characterRecipeSchema.safeParse(blended.recipe).success).toBe(true);
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

  it("원클릭 등신비·안면 조형·헤어 옴브레·웹툰 셀셰이딩 프리셋이 계약 스키마를 100% 통과한다", () => {
    expect(SHAPER_HEAD_RATIO_PRESETS).toHaveLength(5);
    for (const preset of SHAPER_HEAD_RATIO_PRESETS) {
      expect(proportionSchema.safeParse(preset.proportion).success).toBe(true);
    }

    expect(SHAPER_FACE_SCULPT_PRESETS).toHaveLength(6);
    for (const preset of SHAPER_FACE_SCULPT_PRESETS) {
      for (const key of FACE_PARAM_KEYS) {
        expect(typeof preset.face[key]).toBe("number");
        expect(preset.face[key]).toBeGreaterThanOrEqual(-1);
        expect(preset.face[key]).toBeLessThanOrEqual(1);
      }
    }

    expect(SHAPER_HAIR_OMBRE_PRESETS).toHaveLength(5);
    for (const preset of SHAPER_HAIR_OMBRE_PRESETS) {
      expect(hairColorSchema.safeParse(preset.hairColor).success).toBe(true);
    }

    expect(SHAPER_TOON_SHADER_PRESETS).toHaveLength(4);
    const baseShading = createDefaultRecipe().shading;
    for (const preset of SHAPER_TOON_SHADER_PRESETS) {
      const next = buildShaperToonShadingProfile(baseShading, preset);
      expect(next.mode).toBe("toon");
      expect(lookSchema.safeParse(next.look).success).toBe(true);
    }
  });

  it("세계관별 VARCO 3D 프리뷰·인스펙터(HDRI 환경·360도 조명 회전·PBR 채널·오버레이) 기본값을 계산한다", () => {
    const murimPreview = resolveCharacterLabVarco3dPreviewSettings("murim-swordsman");
    expect(murimPreview.environmentId).toBe("venice_sunset");
    expect(murimPreview.lightingRotationDeg).toBe(60);
    expect(murimPreview.pivotToBottom).toBe(true);

    const dukePreview = resolveCharacterLabVarco3dPreviewSettings("northern-grand-duke");
    expect(dukePreview.environmentId).toBe("studio_small");

    const overridden = resolveCharacterLabVarco3dPreviewSettings("cyberpunk-runner", {
      lightingRotationDeg: -30,
      mapPreviewMode: "roughness",
      isWireframeOn: true,
    });
    expect(overridden.lightingRotationDeg).toBe(330);
    expect(overridden.mapPreviewMode).toBe("roughness");
    expect(overridden.isWireframeOn).toBe(true);
  });
});
