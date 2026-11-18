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
import { evaluateAftermathReadabilityAndVtt } from "./studio-bg3d-aftermath-readability-vtt";
import {
  evaluateDuoOtsRemotionAndOffline,
  filterQuickPresetCommands,
} from "./studio-bg3d-duo-ots-remotion-offline";
import { evaluateDustLodCliffhangerAndPack } from "./studio-bg3d-dust-lod-cliffhanger-pack";
import {
  evaluateVrmPoseAndWebGpuGuard,
  inspectGlbBinaryEvidence,
} from "./studio-bg3d-glb-binary-vrm-guard";
import { evaluateAtmosphericBokehAndQuarterlyRoi } from "./studio-bg3d-atmospheric-bokeh-dof";
import { evaluateArticulatedPropAndIkSocketBridge } from "./studio-bg3d-articulated-ik-bridge";
import { evaluateSlitGodRayAndShadowDrift } from "./studio-bg3d-slit-godray-sequence";
import { evaluateWeatherMotionAndColorScript } from "./studio-bg3d-weather-motion-colorscript";
import {
  createContinuityLedgerSnapshot,
  evaluateWindDrapeAndContinuity,
} from "./studio-bg3d-wind-drape-continuity";
import { evaluateZDepthCrowdTodCompositor } from "./studio-bg3d-zdepth-crowd-tod-compositor";
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

    const v23Compositor = evaluateZDepthCrowdTodCompositor({
      openRatioPct: 65,
      apertureFStop: 2.8,
      foregroundCocPx: 17.0,
      timeOfDayId: "sunset-3200k",
      crowdCount: 15,
      gutterPx: 280,
      baseBokehWeeklyHoursSaved: 27.1,
      foregroundBokehLayerTag: "FX_FG_Bokeh_RofanPetals_f28",
    });
    expect(v23Compositor.zDepthSfxPlaneYM).toBe(-0.34);
    expect(v23Compositor.darkroomProofPassed).toBe(true);
    expect(v23Compositor.manifest.layers).toHaveLength(6);
    expect(v23Compositor.totalWeeklyHoursV23).toBe(29.9);
    expect(v23Compositor.quarterlyBankedEpisodesV23).toBe(4.86);

    const v24Motion = evaluateWeatherMotionAndColorScript({
      openRatioPct: 100,
      weatherId: "abyss-storm-mist",
      backgroundFocalMm: 24,
      characterFocalMm: 85,
      activeActId: "act3-climax",
      localeId: "JA",
      baseV23WeeklyHoursSaved: v23Compositor.totalWeeklyHoursV23,
      layers: v23Compositor.manifest.layers,
    });
    expect(v24Motion.weather.indoorCeilingLeakCount).toBe(0);
    expect(v24Motion.dualFocalFacialDistortionPct).toBeLessThan(1.2);
    expect(v24Motion.all70CutsDarkroomCompliant).toBe(true);
    expect(v24Motion.localizedSfxSlot.backgroundReRenderCount).toBe(0);
    expect(v24Motion.motionManifest.tracks).toHaveLength(7);
    expect(v24Motion.totalWeeklyHoursV24).toBe(32.7);
    expect(v24Motion.quarterlyBankedEpisodesV24).toBe(5.31);

    const lockedPrevEp = createContinuityLedgerSnapshot(
      100,
      v24Motion.indoorWetReachM,
      v24Motion.activeAct.kelvin,
    );
    const v25Match = evaluateWindDrapeAndContinuity({
      openRatioPct: 100,
      fabricId: "tempest-silk",
      indoorWetReachM: v24Motion.indoorWetReachM,
      indoorRippleCount: v24Motion.indoorRippleCount,
      kelvin: v24Motion.activeAct.kelvin,
      locale: v24Motion.localizedSfxSlot.locale,
      onomatopoeiaText: v24Motion.localizedSfxSlot.onomatopoeiaText,
      lockedLedger: lockedPrevEp,
      tankobonFormatId: "B5",
      baseV24WeeklyHoursSaved: v24Motion.totalWeeklyHoursV24,
    });
    expect(v25Match.continuityCompliant).toBe(true);
    expect(v25Match.billowDeflectionM).toBe(0.78);
    expect(v25Match.fresnelReflectPct).toBe(12.0);
    expect(v25Match.tankobonSpec.printPixels350Dpi).toEqual([5098, 3624]);
    expect(v25Match.audioManifest.cues).toHaveLength(4);
    expect(v25Match.totalWeeklyHoursV25).toBe(34.2);
    expect(v25Match.quarterlyHoursSavedV25).toBe(444.6);
    expect(v25Match.quarterlyBankedEpisodesV25).toBe(5.56);

    const v25DriftA5 = evaluateWindDrapeAndContinuity({
      openRatioPct: 65,
      fabricId: "rofan-velvet",
      indoorWetReachM: 0.77,
      indoorRippleCount: 7,
      kelvin: 3200,
      locale: "KO",
      onomatopoeiaText: "촤르륵 · 영롱",
      lockedLedger: lockedPrevEp,
      tankobonFormatId: "A5",
      baseV24WeeklyHoursSaved: v24Motion.totalWeeklyHoursV24,
    });
    expect(v25DriftA5.continuityCompliant).toBe(false);
    expect(v25DriftA5.continuityStatusKo).toContain("연속성 이탈 감지");
    expect(v25DriftA5.tankobonSpec.printPixels350Dpi).toEqual([4161, 2976]);

    const v26Release = evaluateAftermathReadabilityAndVtt({
      aftermathId: "shattered",
      dialogueDensityPct: 80,
      baseBgLineThicknessPx: 2.8,
      displayModeId: "deuteranopia-safe",
      locale: "JA",
      onomatopoeiaText: v24Motion.localizedSfxSlot.onomatopoeiaText,
      continuityCompliant: v25Match.continuityCompliant,
      all70CutsDarkroomCompliant: v24Motion.all70CutsDarkroomCompliant,
      tankobonFormatId: "B5",
      baseV25WeeklyHoursSaved: v25Match.totalWeeklyHoursV25,
    });
    expect(v26Release.aftermath.debrisShardCount).toBe(28);
    expect(v26Release.attenuatedHaloLinePx).toBe(1.5);
    expect(v26Release.readabilityPassed).toBe(true);
    expect(v26Release.vttContentString).toContain("WEBVTT");
    expect(v26Release.allFourChannelsReady).toBe(true);
    expect(v26Release.totalWeeklyHoursV26).toBe(35.2);
    expect(v26Release.quarterlyHoursSavedV26).toBe(457.6);
    expect(v26Release.quarterlyBankedEpisodesV26).toBe(5.72);

    const v27MobileUnproxied = evaluateDustLodCliffhangerAndPack({
      hazeId: "tempest-shockwave-haze",
      deviceId: "mobile-midrange-60fps",
      proxyLodEnabled: false,
      cliffhangerBlackoutGutterPx: 780,
      locale: "JA",
      tankobonFormatId: "B5",
      continuityDigestHex: v25Match.currentSnapshot.digestHex,
      allFourChannelsReady: v26Release.allFourChannelsReady,
      baseV26WeeklyHoursSaved: v26Release.totalWeeklyHoursV26,
    });
    expect(v27MobileUnproxied.budget60FpsPassed).toBe(false);

    const v27MobileProxied = evaluateDustLodCliffhangerAndPack({
      hazeId: "tempest-shockwave-haze",
      deviceId: "mobile-midrange-60fps",
      proxyLodEnabled: true,
      cliffhangerBlackoutGutterPx: 780,
      locale: "JA",
      tankobonFormatId: "B5",
      continuityDigestHex: v25Match.currentSnapshot.digestHex,
      allFourChannelsReady: v26Release.allFourChannelsReady,
      baseV26WeeklyHoursSaved: v26Release.totalWeeklyHoursV26,
    });
    expect(v27MobileProxied.budget60FpsPassed).toBe(true);
    expect(v27MobileProxied.datumDriftMeters).toBe(0);
    expect(v27MobileProxied.cliffhangerGrade).toBe("S");
    expect(v27MobileProxied.packManifest.bundledArtifacts).toHaveLength(4);
    expect(v27MobileProxied.totalWeeklyHoursV27).toBe(36.0);
    expect(v27MobileProxied.quarterlyHoursSavedV27).toBe(468.0);
    expect(v27MobileProxied.quarterlyBankedEpisodesV27).toBe(5.85);

    const v28Vrm = evaluateVrmPoseAndWebGpuGuard({
      poseId: "portal-stride-132cm",
      chromeTier: "pro",
      activeSceneTriangles: v27MobileProxied.activeSceneTriangles,
      baseV27WeeklyHoursSaved: v27MobileProxied.totalWeeklyHoursV27,
    });
    expect(v28Vrm.anatomicalLimitsCompliant).toBe(true);
    expect(v28Vrm.webGpuGuard.leakedResourceCount).toBe(0);
    expect(v28Vrm.webGpuGuard.perFrameHeapAllocs).toBe(0);
    expect(v28Vrm.totalWeeklyHoursV28).toBe(36.8);
    expect(v28Vrm.quarterlyHoursSavedV28).toBe(478.4);
    expect(v28Vrm.quarterlyBankedEpisodesV28).toBe(5.98);

    const truncatedGlb = inspectGlbBinaryEvidence(new Uint8Array([1, 2, 3]));
    expect(truncatedGlb.validGlb20).toBe(false);
    expect(truncatedGlb.unknownGaps.length).toBeGreaterThan(0);

    expect(filterQuickPresetCommands("ㅇㅂㄷㅅㄷ")).toHaveLength(1);
    const v29DuoSafe = evaluateDuoOtsRemotionAndOffline({
      duoId: "rofan-gaze-24cm",
      cameraAxisSide: "same-side-safe",
      hasNeutralBridgeCut: false,
      networkOnline: false,
      quickCommandQuery: "ㄹㅍ",
      continuityDigestHex: v25Match.currentSnapshot.digestHex,
      baseV28WeeklyHoursSaved: v28Vrm.totalWeeklyHoursV28,
    });
    expect(v29DuoSafe.duo.heightGapCm).toBe(24);
    expect(v29DuoSafe.axis180Compliant).toBe(true);
    expect(v29DuoSafe.motionAudit.unseededRandomCalls).toBe(0);
    expect(v29DuoSafe.offlineQueue.unsavedCutLossCount).toBe(0);
    expect(v29DuoSafe.matchedCommands).toHaveLength(1);
    expect(v29DuoSafe.totalWeeklyHoursV29).toBe(38.0);
    expect(v29DuoSafe.quarterlyHoursSavedV29).toBe(494.0);
    expect(v29DuoSafe.quarterlyBankedEpisodesV29).toBe(6.18);

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
