import { describe, expect, it } from "vitest";

import { EXPRESSION_PRESETS, NATURAL_IDLE_POSES, EXTRA_POSE_PRESETS } from "../studio-pose-presets";
import { PANEL_LAYOUTS } from "../studio-panel-layouts";
import { diagnoseStudioSceneRecipe } from "../studio-scene-recipe";
import { SCENE_TEMPLATES } from "../studio-scene-templates";
import { findStudioBackgroundPreset } from "../studio-background-presets";

import {
  applySimpleProductionDefaults,
  buildSimpleProductionHandoff,
  clampSimpleProductionStep,
  createSimpleProductionDraft,
  findSimpleProductionEffect,
  loadSimpleProductionDraft,
  normalizeSimpleProductionDraft,
  saveSimpleProductionDraft,
  SIMPLE_PRODUCTION_DEFAULT_DIALOGUE_SCRIPT,
  SIMPLE_PRODUCTION_EFFECTS,
  SIMPLE_PRODUCTION_STEPS,
  simpleProductionBackgroundFillOptions,
  simpleProductionBackgroundSceneOptions,
  simpleProductionEditorExit,
  simpleProductionEffectCatalog,
  simpleProductionExpressionOptions,
  simpleProductionPoseOptions,
  simpleProductionStepReadiness,
} from "./studio-simple-production-wizard";
import { quickComicRecipeReferenceCatalog } from "./studio-quick-comic-plan";

describe("simple production wizard steps", () => {
  it("fixes the order as background → character → dialogue → effects", () => {
    expect(SIMPLE_PRODUCTION_STEPS.map((step) => step.id)).toEqual([
      "background",
      "character",
      "dialogue",
      "effects",
    ]);
    expect(SIMPLE_PRODUCTION_STEPS.map((step) => step.labelKo)).toEqual([
      "배경",
      "캐릭터",
      "대사",
      "효과",
    ]);
    expect(clampSimpleProductionStep(-3)).toBe(0);
    expect(clampSimpleProductionStep(99)).toBe(SIMPLE_PRODUCTION_STEPS.length - 1);
    expect(clampSimpleProductionStep(Number.NaN)).toBe(0);
  });
});

describe("simple production wizard defaults", () => {
  it("creates a draft whose every id exists in the real catalogs", () => {
    const draft = createSimpleProductionDraft();
    expect(PANEL_LAYOUTS.some((layout) => layout.id === draft.layoutId)).toBe(true);
    expect(SCENE_TEMPLATES.some((template) => template.id === draft.backgroundSceneTemplateId)).toBe(true);
    expect(findStudioBackgroundPreset(draft.backgroundPresetId)).not.toBeNull();
    const poseIds = new Set(
      [...NATURAL_IDLE_POSES, ...EXTRA_POSE_PRESETS].map((preset) => preset.id),
    );
    expect(poseIds.has(draft.characterPoseRef)).toBe(true);
    expect(EXPRESSION_PRESETS.some((preset) => preset.id === draft.characterExpressionRef)).toBe(true);
    expect(draft.characterName.length).toBeGreaterThan(0);
    expect(draft.dialogueScript).toBe(SIMPLE_PRODUCTION_DEFAULT_DIALOGUE_SCRIPT);
    expect(draft.effectId).toBe("soft-warm");
    expect(draft.effectIntensity).toBeGreaterThan(0);
    expect(draft.effectIntensity).toBeLessThanOrEqual(1);
  });

  it("exposes only beginner options that resolve against the catalogs", () => {
    expect(simpleProductionBackgroundSceneOptions().map((t) => t.id)).toEqual([
      "daily-talk",
      "school-classroom",
      "romance-cafe",
      "confession",
    ]);
    expect(simpleProductionBackgroundFillOptions().map((p) => p.id)).toEqual([
      "g-warm-paper",
      "s-paper",
      "g-dawn",
      "a-soft-warm",
    ]);
    expect(simpleProductionPoseOptions().map((p) => p.id)).toEqual([
      "ni_calm_front",
      "xp_wave_greeting",
      "xp_hands_on_hips",
      "xp_chin_rest",
    ]);
    expect(simpleProductionExpressionOptions().map((p) => p.id)).toEqual([
      "xf_joy",
      "xf_neutral",
      "xf_surprised",
      "xf_determined",
    ]);
  });

  it("auto-applies defaults for empty or invalid values and reports the fields", () => {
    const { draft, autoApplied } = applySimpleProductionDefaults({
      backgroundSceneTemplateId: "no-such-scene",
      backgroundPresetId: "",
      characterName: "  ",
      characterPoseRef: "no-such-pose",
      characterExpressionRef: null,
      dialogueScript: "   ",
      effectId: "no-such-effect",
      effectIntensity: Number.NaN,
    });
    const defaults = createSimpleProductionDraft();
    expect(draft.backgroundSceneTemplateId).toBe(defaults.backgroundSceneTemplateId);
    expect(draft.backgroundPresetId).toBe(defaults.backgroundPresetId);
    expect(draft.characterName).toBe(defaults.characterName);
    expect(draft.characterPoseRef).toBe(defaults.characterPoseRef);
    expect(draft.characterExpressionRef).toBe(defaults.characterExpressionRef);
    expect(draft.dialogueScript).toBe(SIMPLE_PRODUCTION_DEFAULT_DIALOGUE_SCRIPT);
    expect(draft.effectId).toBe("soft-warm");
    expect(autoApplied).toEqual(
      expect.arrayContaining([
        "backgroundSceneTemplateId",
        "backgroundPresetId",
        "characterName",
        "characterPoseRef",
        "characterExpressionRef",
        "dialogueScript",
        "effectId",
        "effectIntensity",
      ]),
    );
  });

  it("never overwrites a user's own values and clamps intensity", () => {
    const { draft, autoApplied } = applySimpleProductionDefaults({
      ...createSimpleProductionDraft(),
      backgroundSceneTemplateId: "confession",
      characterName: "지영",
      dialogueScript: "지영: 내 대사는 그대로 둬.",
      effectId: "none",
      effectIntensity: 7,
    });
    expect(draft.backgroundSceneTemplateId).toBe("confession");
    expect(draft.characterName).toBe("지영");
    expect(draft.dialogueScript).toBe("지영: 내 대사는 그대로 둬.");
    expect(draft.effectId).toBe("none");
    expect(draft.effectIntensity).toBe(1);
    expect(autoApplied).toEqual([]);
  });

  it("marks every step ready while flagging which steps used defaults", () => {
    const readiness = simpleProductionStepReadiness({
      ...createSimpleProductionDraft(),
      dialogueScript: "",
    });
    expect(readiness.map((entry) => entry.stepId)).toEqual([
      "background",
      "character",
      "dialogue",
      "effects",
    ]);
    expect(readiness.every((entry) => entry.ready)).toBe(true);
    expect(readiness.find((entry) => entry.stepId === "dialogue")?.usedDefault).toBe(true);
    expect(readiness.find((entry) => entry.stepId === "background")?.usedDefault).toBe(false);
  });
});

describe("simple production wizard handoff", () => {
  it("builds an assembly input, background payload and a diagnosable scene recipe", () => {
    const handoff = buildSimpleProductionHandoff(createSimpleProductionDraft());
    expect(handoff).not.toBeNull();
    if (!handoff) return;
    expect(handoff.comipoInput).toEqual({
      layoutId: handoff.draft.layoutId,
      sceneTemplateId: "daily-talk",
      sceneFrameIndex: 0,
      dialogueScript: SIMPLE_PRODUCTION_DEFAULT_DIALOGUE_SCRIPT,
    });
    expect(handoff.dialogueLineCount).toBe(2);
    expect(handoff.bubbleCount).toBeGreaterThan(0);
    expect(handoff.backgroundApply?.presetId).toBe("g-warm-paper");

    expect(handoff.sceneRecipe.setRef).toBe("daily-talk");
    expect(handoff.sceneRecipe.cast).toEqual([
      expect.objectContaining({
        id: "lead",
        poseRef: "ni_calm_front",
        expressionRef: "xf_joy",
      }),
    ]);
    expect(handoff.sceneRecipe.shots.length).toBe(handoff.layout.frames.length);
    expect(
      handoff.sceneRecipe.shots.every((shot) =>
        shot.effects?.some(
          (effect) =>
            effect.effectRef === "simple-wizard-soft-warm" && effect.intensity === 0.6,
        ),
      ),
    ).toBe(true);

    const catalog = {
      ...quickComicRecipeReferenceCatalog(),
      effects: simpleProductionEffectCatalog(),
    };
    expect(diagnoseStudioSceneRecipe(handoff.sceneRecipe, catalog)).toEqual([]);
  });

  it("omits shot effects when the user picks no effect", () => {
    const handoff = buildSimpleProductionHandoff({
      ...createSimpleProductionDraft(),
      effectId: "none",
      effectIntensity: 0,
    });
    expect(handoff).not.toBeNull();
    expect(
      handoff?.sceneRecipe.shots.every((shot) => (shot.effects ?? []).length === 0),
    ).toBe(true);
    expect(findSimpleProductionEffect("none").effectRef).toBeNull();
    expect(SIMPLE_PRODUCTION_EFFECTS).toHaveLength(5);
  });

  it("exits to the pro editor with story mode and full density, applying first", () => {
    const exit = simpleProductionEditorExit();
    expect(exit).toEqual({
      target: "pro-editor",
      creationMode: "story",
      uiDensityMode: "full",
      labelKo: "전문 에디터에서 이어서 편집",
      labelEn: "Continue in the pro editor",
      applyBeforeExit: true,
    });
    expect(buildSimpleProductionHandoff(createSimpleProductionDraft())?.editorExit).toEqual(exit);
  });

  it("persists drafts and restores corrupted storage to defaults", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
    };
    const draft = { ...createSimpleProductionDraft(), characterName: "민수" };
    expect(saveSimpleProductionDraft(storage, draft)).toBe(true);
    expect(loadSimpleProductionDraft(storage).characterName).toBe("민수");

    map.set("toonstudio-simple-production-wizard:v1", "{broken");
    expect(loadSimpleProductionDraft(storage)).toEqual(createSimpleProductionDraft());
    expect(normalizeSimpleProductionDraft(undefined)).toEqual(createSimpleProductionDraft());
  });
});
