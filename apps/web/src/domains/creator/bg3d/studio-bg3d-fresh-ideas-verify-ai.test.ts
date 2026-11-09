import { describe, expect, it } from "vitest";

import {
  BLENDER_FANTASY_LIGHTING_RIG_PRESETS,
  evaluateBlenderFantasyLightingRig,
} from "../scene-3d/studio-3d-blender-eevee-lighting-rig";
import {
  BLENDER_FANTASY_CROWD_PRESETS,
  BLENDER_FANTASY_MONSTER_PRESETS,
  BLENDER_FANTASY_WEAPON_PRESETS,
  simulateBlenderGeometryNodesBoidCrowd,
  solveBlenderItascMultiLimbMonsterIk,
  solveBlenderWeaponConstraintRig,
} from "../scene-3d/studio-3d-blender-fantasy-weapon-monster-crowd";
import {
  BLENDER_FREESTYLE_INK_PRESETS,
  BLENDER_NPR_SHADER_PRESETS,
  DEFAULT_FREESTYLE_SAMPLE_EDGES,
  evaluateBlenderNprShaderTree,
  evaluateFreestyleViewMapStrokes,
} from "../scene-3d/studio-3d-blender-npr-shader-freestyle";
import {
  evaluateBlenderSceneWithVerifyAi,
  generateBlenderWebtoonFreshIdeasRemix,
  type BlenderSceneVerifyAiSynthesisInput,
} from "./studio-bg3d-fresh-ideas-verify-ai";

function createSampleSynthesisInput(): BlenderSceneVerifyAiSynthesisInput {
  const lightingPreset = BLENDER_FANTASY_LIGHTING_RIG_PRESETS[0]!;
  const shaderPreset = BLENDER_NPR_SHADER_PRESETS[0]!;
  const freestylePreset = BLENDER_FREESTYLE_INK_PRESETS[0]!;
  const weaponPreset = BLENDER_FANTASY_WEAPON_PRESETS[1]!;
  const monsterPreset = BLENDER_FANTASY_MONSTER_PRESETS[0]!;
  const crowdPreset = BLENDER_FANTASY_CROWD_PRESETS[2]!;

  return {
    lightingPreset,
    lightingEval: evaluateBlenderFantasyLightingRig(lightingPreset),
    shaderPreset,
    shaderEval: evaluateBlenderNprShaderTree(shaderPreset, {
      normal: [0.65, 0.35, 0.67],
      lightDir: [0.3, 0.6, 0.74],
      viewDir: [0, 0.1, 0.99],
      edgeCurvature: 0.75,
      cavityOcclusion: 0.2,
    }),
    freestylePreset,
    freestyleEval: evaluateFreestyleViewMapStrokes(
      freestylePreset,
      DEFAULT_FREESTYLE_SAMPLE_EDGES,
    ),
    weaponPreset,
    weaponEval: solveBlenderWeaponConstraintRig({
      preset: weaponPreset,
      socketSlot: "floating-halo-orbit",
      childOfInfluence: 0.25,
      awakeningFactor: 0.85,
      orbitPhase: 0.15,
    }),
    monsterPreset,
    monsterEval: solveBlenderItascMultiLimbMonsterIk(
      monsterPreset,
      "roar-intimidation",
      0,
    ),
    crowdPreset,
    crowdEval: simulateBlenderGeometryNodesBoidCrowd(crowdPreset, 180, 1.0),
  };
}

describe("studio-bg3d-fresh-ideas-verify-ai", () => {
  it("generates all 5 creative remix lenses grounded in live Blender 5.2 metrics", () => {
    const input = createSampleSynthesisInput();
    const { headerKo, remixes } = generateBlenderWebtoonFreshIdeasRemix(input);

    expect(headerKo).toContain("💡 Remix:");
    expect(headerKo).toContain(input.lightingPreset.nameKo);
    expect(remixes).toHaveLength(5);
    expect(remixes.map((r) => r.id)).toEqual([
      "contrarian-take",
      "personal-story-hook",
      "data-evidence-angle",
      "practical-playbook",
      "what-they-missed",
    ]);

    const playbook = remixes.find((r) => r.id === "practical-playbook");
    expect(playbook?.actionableStepsKo).toHaveLength(4);
  });

  it("evaluates the Blender scene against Verify AI 10-dimension quality thresholds and passes", () => {
    const input = createSampleSynthesisInput();
    const report = evaluateBlenderSceneWithVerifyAi(input);

    expect(report.evaluation.passed).toBe(true);
    expect(report.evaluation.overallScore).toBeGreaterThanOrEqual(82);
    expect(report.evaluation.hardFailureCount).toBe(0);
    expect(report.liveSceneReadinessScore).toBeGreaterThanOrEqual(85);
    expect(report.summaryBadgeKo).toContain("Verify AI PASS");
  });
});
