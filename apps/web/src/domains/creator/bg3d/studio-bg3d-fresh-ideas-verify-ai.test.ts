import { describe, expect, it } from "vitest";

import {
  BLENDER_FANTASY_LIGHTING_RIG_PRESETS,
  evaluateBlenderFantasyLightingRig,
  findBlenderFantasyLightingRigPreset,
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
  evaluateBlenderWebtoonCycleTimeBenchmark,
  evaluateWeeklyEpisodeTeamRoi,
  generateBlenderWebtoonFreshIdeasRemix,
  type BlenderSceneVerifyAiSynthesisInput,
} from "./studio-bg3d-fresh-ideas-verify-ai";
import { evaluateAtmosphericBokehAndQuarterlyRoi } from "./studio-bg3d-atmospheric-bokeh-dof";
import { evaluateArticulatedPropAndIkSocketBridge } from "./studio-bg3d-articulated-ik-bridge";
import { evaluateSlitGodRayAndShadowDrift } from "./studio-bg3d-slit-godray-sequence";
import { evaluateBlenderSceneIsolationGuard } from "./studio-bg3d-scroll-pacing-live-sync";
import {
  evaluateDarkroomProofingState,
  evaluateGenreCutDensityAndRejectionRoi,
  SHARED_ARCHITECTURAL_DATUM_SPEC,
} from "./studio-bg3d-shared-datum-proofing";
import { evaluateGenreLockGuardrail } from "./studio-bg3d-shot-continuity-linked-ink";

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
  it("generates all 5 creative remix lenses grounded in live Blender 5.3 metrics, weekly 70-cut ROI, genre lock, and scene isolation", () => {
    const input = createSampleSynthesisInput();
    const { headerKo, remixes, cycleTimeBenchmark, weeklyEpisodeRoi } =
      generateBlenderWebtoonFreshIdeasRemix(input);

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

    expect(cycleTimeBenchmark.retouchTimeSavedPercent).toBeGreaterThan(40);
    expect(cycleTimeBenchmark.revisionLeadTimeSavedPercent).toBeGreaterThan(70);
    expect(weeklyEpisodeRoi.weeklyTotalCuts).toBe(70);
    expect(weeklyEpisodeRoi.totalWeeklyHoursSaved).toBeGreaterThan(15);

    const highAdoptionRoi = evaluateWeeklyEpisodeTeamRoi(cycleTimeBenchmark, {
      weeklyTotalCuts: 70,
      bg3dAdoptionRatioPct: 70,
      avgStoryboardRevisionsPerEpisode: 10,
    });
    expect(highAdoptionRoi.totalWeeklyHoursSaved).toBeGreaterThan(
      weeklyEpisodeRoi.totalWeeklyHoursSaved,
    );

    const salonLockOk = evaluateGenreLockGuardrail({
      lockMode: "rofan-salon-lock",
      activeLineThicknessPx: 1.35,
      activeKelvin: 3200,
      activeDispersion: 0.015,
    });
    expect(salonLockOk.isCompliant).toBe(true);

    const salonLockDrift = evaluateGenreLockGuardrail({
      lockMode: "rofan-salon-lock",
      activeLineThicknessPx: 2.8,
      activeKelvin: 8500,
      activeDispersion: 0,
    });
    expect(salonLockDrift.isCompliant).toBe(false);
    expect(salonLockDrift.violationReasonKo).toContain("이탈 감지");

    const isolation = evaluateBlenderSceneIsolationGuard();
    expect(isolation.zeroCrossSceneMutation).toBe(true);
    expect(isolation.sha256Verified).toBe(true);
    expect(isolation.preservedExternalScenes.length).toBeGreaterThanOrEqual(4);

    const rofanRejectionRoi = evaluateGenreCutDensityAndRejectionRoi({
      genreId: "rofan",
      bg3dAdoptionRatioPct: 50,
    });
    expect(rofanRejectionRoi.datumSpec).toEqual(SHARED_ARCHITECTURAL_DATUM_SPEC);
    expect(rofanRejectionRoi.baselineRejectionRatePct).toBe(18.5);
    expect(rofanRejectionRoi.guardedRejectionRatePct).toBe(2.4);
    expect(rofanRejectionRoi.reworkHoursSavedPerEpisode).toBeGreaterThan(2);
    expect(rofanRejectionRoi.cameraTransferDriftMeters).toBe(0);

    const darkroomOn = evaluateDarkroomProofingState(true, 3200, 2.45);
    expect(darkroomOn.uiChromaticBiasDeltaE).toBe(0);
    expect(darkroomOn.contrastProofPassed).toBe(true);

    const v20Modern = evaluateArticulatedPropAndIkSocketBridge({
      propId: "modern-sliding-terrace",
      openRatioPct: 50,
      ikSnapEnabled: true,
      follow3dSpeedlinesEnabled: true,
    });
    expect(v20Modern.activeTravelMeters).toBe(0.44);
    expect(v20Modern.contactCalibrationMinutes).toBe(0);
    expect(v20Modern.contactMinutesSavedPerCut).toBe(14.5);
    expect(v20Modern.speedlineDriftPx).toBe(0);
    expect(v20Modern.ikSockets).toHaveLength(4);

    const beat15 = evaluateSlitGodRayAndShadowDrift({
      openRatioPct: 15,
      weeklyTotalCuts: 70,
      baseWeeklyHoursSaved: 19.9,
      interactionCutRatioPct: 35,
    });
    const beat100 = evaluateSlitGodRayAndShadowDrift({
      openRatioPct: 100,
      weeklyTotalCuts: 70,
      baseWeeklyHoursSaved: 19.9,
      interactionCutRatioPct: 35,
    });
    expect(beat15.slitApertureWidthM).toBe(0.39);
    expect(beat100.slitApertureWidthM).toBe(1.68);
    expect(beat15.floorShadowLengthM).toBeGreaterThan(beat100.floorShadowLengthM);
    expect(beat15.combinedWeeklyHoursSaved).toBe(25.9);

    const bokeh15 = evaluateAtmosphericBokehAndQuarterlyRoi({
      openRatioPct: 15,
      moteStyleId: "amber-dust-motes",
      climaxSequencesPerEpisode: 3,
      baseCombinedWeeklyHoursSaved: 25.9,
    });
    const bokeh100 = evaluateAtmosphericBokehAndQuarterlyRoi({
      openRatioPct: 100,
      moteStyleId: "abyss-mana-embers",
      climaxSequencesPerEpisode: 3,
      baseCombinedWeeklyHoursSaved: 25.9,
    });
    expect(bokeh15.recommendedApertureFStop).toBe(1.8);
    expect(bokeh100.recommendedApertureFStop).toBe(5.6);
    expect(bokeh15.foregroundCocDiameterPx).toBeGreaterThan(bokeh100.foregroundCocDiameterPx);
    expect(bokeh15.bankedEpisodesPerQuarter).toBeGreaterThan(4.2);

    const salonLighting = findBlenderFantasyLightingRigPreset("lumiere-salon-chandelier-prism");
    const salonShader = BLENDER_NPR_SHADER_PRESETS.find((p) => p.id === "lumiere-rofan-velvet-brocade")!;
    const salonInk = BLENDER_FREESTYLE_INK_PRESETS.find((p) => p.id === "rofan-delicate-dip-pen-lace")!;
    const salonBench = evaluateBlenderWebtoonCycleTimeBenchmark({
      lightingEval: evaluateBlenderFantasyLightingRig(salonLighting),
      shaderPreset: salonShader,
      shaderEval: evaluateBlenderNprShaderTree(salonShader, {
        normal: [0.65, 0.35, 0.67],
        lightDir: [0.3, 0.6, 0.74],
        viewDir: [0, 0.1, 0.99],
        edgeCurvature: 0.75,
        cavityOcclusion: 0.2,
      }),
      freestylePreset: salonInk,
      freestyleEval: evaluateFreestyleViewMapStrokes(salonInk, DEFAULT_FREESTYLE_SAMPLE_EDGES),
      crowdEval: input.crowdEval,
    });
    expect(salonBench.automatedPipelineRetouchMinutes).toBeLessThan(salonBench.baselineManualRetouchMinutes);

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
