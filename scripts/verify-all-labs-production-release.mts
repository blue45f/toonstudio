#!/usr/bin/env node

/**
 * Wave 2 전사 통합 Verify AI 릴리스 게이트 & 멀티 클라우드·로컬 운영 배포 오케스트레이션 CLI
 * (`verify-all-labs-production-release.mts`)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createDefaultRecipe } from "../apps/character-lab/src/contracts";
import { evaluateCharacterLabVerifyAiGate } from "../apps/character-lab/src/render/style/character-verify-ai-fresh-ideas";
import {
  runBrushLabCompetitorQualityBenchmark,
  selectOptimalServiceBrushConfiguration,
} from "../apps/brush-lab/src/bench/metrics/competitor-quality-bench";
import { evaluateWebtoonBrushVerifyAiGate } from "../apps/brush-lab/src/bench/metrics/webtoon-brush-verify-ai-remix";
import { evaluateBlenderSceneWithVerifyAi } from "../apps/web/src/domains/creator/bg3d/studio-bg3d-fresh-ideas-verify-ai";
import {
  buildVerifyAiAutoRemediationPlan,
  evaluateMultiPassToonPsdExportPlan,
  evaluateRightsBomCommercialReadiness,
} from "../apps/web/src/domains/creator/bg3d/studio-bg3d-multipass-rights-remediation";
import {
  buildBlenderLiveSceneSyncBridge,
  evaluateVerticalScrollCutPacing,
} from "../apps/web/src/domains/creator/bg3d/studio-bg3d-scroll-pacing-live-sync";
import { evaluateVerifyAiPreflightGates } from "../apps/web/src/domains/creator/bg3d/studio-bg3d-shot-continuity-linked-ink";
import { evaluateCrossLabsUnifiedProductionBridge } from "../apps/web/src/domains/creator/bg3d/studio-cross-labs-production-bridge";
import {
  BLENDER_FANTASY_LIGHTING_RIG_PRESETS,
  evaluateBlenderFantasyLightingRig,
} from "../apps/web/src/domains/creator/scene-3d/studio-3d-blender-eevee-lighting-rig";
import {
  BLENDER_FANTASY_CROWD_PRESETS,
  BLENDER_FANTASY_MONSTER_PRESETS,
  BLENDER_FANTASY_WEAPON_PRESETS,
  simulateBlenderGeometryNodesBoidCrowd,
  solveBlenderItascMultiLimbMonsterIk,
  solveBlenderWeaponConstraintRig,
} from "../apps/web/src/domains/creator/scene-3d/studio-3d-blender-fantasy-weapon-monster-crowd";
import {
  BLENDER_FREESTYLE_INK_PRESETS,
  BLENDER_NPR_SHADER_PRESETS,
  DEFAULT_FREESTYLE_SAMPLE_EDGES,
  evaluateBlenderNprShaderTree,
  evaluateFreestyleViewMapStrokes,
} from "../apps/web/src/domains/creator/scene-3d/studio-3d-blender-npr-shader-freestyle";
import { inspectDeployment } from "./deployment-preflight.mjs";
import { buildDynamicDeployMatrix } from "./multi-env-dynamic-deploy.mjs";

const lightingPreset = BLENDER_FANTASY_LIGHTING_RIG_PRESETS[0]!;
const shaderPreset = BLENDER_NPR_SHADER_PRESETS[0]!;
const freestylePreset = BLENDER_FREESTYLE_INK_PRESETS[0]!;
const weaponPreset = BLENDER_FANTASY_WEAPON_PRESETS[1]!;
const monsterPreset = BLENDER_FANTASY_MONSTER_PRESETS[0]!;
const crowdPreset = BLENDER_FANTASY_CROWD_PRESETS[2]!;

const lightingEval = evaluateBlenderFantasyLightingRig(lightingPreset);
const freestyleEval = evaluateFreestyleViewMapStrokes(
  freestylePreset,
  DEFAULT_FREESTYLE_SAMPLE_EDGES,
);
const weaponEval = solveBlenderWeaponConstraintRig({
  preset: weaponPreset,
  socketSlot: "floating-halo-orbit",
  childOfInfluence: 0.25,
  awakeningFactor: 0.85,
  orbitPhase: 0.15,
});

const bg3dVerifyAi = evaluateBlenderSceneWithVerifyAi({
  lightingPreset,
  lightingEval,
  shaderPreset,
  shaderEval: evaluateBlenderNprShaderTree(shaderPreset, {
    normal: [0.65, 0.35, 0.67],
    lightDir: [0.3, 0.6, 0.74],
    viewDir: [0, 0.1, 0.99],
    edgeCurvature: 0.75,
    cavityOcclusion: 0.2,
  }),
  freestylePreset,
  freestyleEval,
  weaponPreset,
  weaponEval,
  monsterPreset,
  monsterEval: solveBlenderItascMultiLimbMonsterIk(
    monsterPreset,
    "roar-intimidation",
    0,
  ),
  crowdPreset,
  crowdEval: simulateBlenderGeometryNodesBoidCrowd(crowdPreset, 180, 1.0),
});

const bg3dPreflight = evaluateVerifyAiPreflightGates({
  archetypeId: "action-impact",
  artisticOverride: false,
  contrastRatio: lightingEval.contrastRatio,
});

const multiPassPlan = evaluateMultiPassToonPsdExportPlan({
  qualityTier: "final",
  webgpuComputeAvailable: true,
});
const rightsBomAudit = evaluateRightsBomCommercialReadiness();
const autoRemediation = buildVerifyAiAutoRemediationPlan(bg3dPreflight, 5600);
const scrollPacing = evaluateVerticalScrollCutPacing({
  archetypeId: "action-impact",
  lensId: "contrarian-take",
  cameraTiltDeg: 18,
  silhouetteSeparationRatio: Math.min(1, lightingEval.contrastRatio / 2.8),
  activeWeaponCount: weaponEval.blades.length,
});
const liveSyncBridge = buildBlenderLiveSceneSyncBridge({
  lightingPresetId: lightingPreset.id,
  shaderPresetId: shaderPreset.id,
  inkPresetId: freestylePreset.id,
  weaponPresetId: weaponPreset.id,
  monsterPresetId: monsterPreset.id,
  focalLengthMm: bg3dPreflight.archetypeRecommendation.recommendedFocalLengthMm,
  cameraTiltDeg: 18,
});

// 2. Character Labs 평가
const defaultCharacterShading = createDefaultRecipe().shading;
const characterInitial = evaluateCharacterLabVerifyAiGate({
  shading: defaultCharacterShading,
  lookId: "shaper-cel",
});
const characterVerifyAi = evaluateCharacterLabVerifyAiGate({
  shading: {
    ...defaultCharacterShading,
    ...characterInitial.recommendedShadingPatch,
    toon: {
      ...defaultCharacterShading.toon,
      ...characterInitial.recommendedShadingPatch.toon,
    },
  },
  lookId: "shaper-cel",
  headUnits: 7.5,
  delight: true,
  disableHairInline: true,
});

// 3. Brush Labs 평가
const brushSummary = runBrushLabCompetitorQualityBenchmark(20261027);
const brushOptimal = selectOptimalServiceBrushConfiguration(20261027);
const brushVerifyAi = evaluateWebtoonBrushVerifyAiGate({
  genreId: "action-gpen-slash",
  compositeBenchScore100: brushOptimal.verifiedCompositeScore100,
  chromaPreservationGain01: brushSummary.spectral38ChromaPreservationGain01,
  mudEliminationGain01: brushSummary.ghostWashMudEliminationGain01,
  eightHourFrameDriftPct: brushOptimal.verified8hFrameDriftPct,
});

// 4. Cross-Labs Unified Production Bridge 평가
const rightsBomScore100 = rightsBomAudit.commercialPublishAllowed ? 100 : 0;
const crossLabsReport = evaluateCrossLabsUnifiedProductionBridge({
  bg3dOverallScore100: bg3dVerifyAi.evaluation.overallScore,
  bg3dPreflightScore100: bg3dPreflight.totalGateScore,
  bg3dContrastRatio: lightingEval.contrastRatio,
  bg3dSafeZoneScore100: scrollPacing.speechBubbleSafeZoneScore,
  characterOverallScore100: characterVerifyAi.overallScore100,
  characterTurnaroundScore100: characterVerifyAi.turnaroundConsistencyScore100,
  characterFaceSdfScore100: characterVerifyAi.facialSdfCleanScore100,
  characterOutlineWidthMm: defaultCharacterShading.look.line.widthMm,
  brushOverallScore100: brushVerifyAi.overallScore100,
  brushTaperSharpness100: brushVerifyAi.taperSharpnessScore100,
  brushLinkedInkStability100: brushVerifyAi.linkedInk3dProjectionStability100,
  brushAverageStrokePx: freestyleEval.averageThicknessPx,
  rightsBomScore100,
});

// 5. Multi-Cloud & Local Dynamic Matrix + Preflight Contract 평가
const deployMatrix = buildDynamicDeployMatrix({
  commitSha: process.env.GITHUB_SHA ?? "26bf446fc",
});

const syntheticSha = "a".repeat(40);
const staticPreflight = inspectDeployment({
  profile: "onpod-current",
  sha: syntheticSha,
  head: syntheticSha,
  operation: "static-deploy",
  env: {
    CLOUDFLARE_API_TOKEN: "fixture-provider-auth",
    CLOUDFLARE_ACCOUNT_ID: "fixture-account",
  },
});
const containerPreflight = inspectDeployment({
  profile: "onpod-current",
  sha: syntheticSha,
  head: syntheticSha,
  operation: "onpod-image-update",
  env: {
    ONPOD_TOKEN: "fixture-provider-auth",
  },
});

const allPassed =
  bg3dVerifyAi.evaluation.passed &&
  bg3dPreflight.hardGatePassed &&
  rightsBomAudit.commercialPublishAllowed &&
  characterVerifyAi.passed &&
  brushVerifyAi.passed &&
  crossLabsReport.coherence.releaseGatePassed &&
  staticPreflight.errors.length === 0 &&
  containerPreflight.errors.length === 0;

const summaryMarkdown = [
  `# ToonStudio Wave 2 전사 통합 Verify AI 릴리스 & 멀티 클라우드 운영 배포 리포트`,
  "",
  `- **최종 릴리스 판정:** **${allPassed ? "PASS (상용 운영 배포 승인)" : "HOLD"}**`,
  `- **전사 통합 Verify AI 점수:** **${crossLabsReport.coherence.unifiedVerifyAiReleaseScore100}점**`,
  `- **Cross-Labs 정합성 지수 (X_LABS):** **${crossLabsReport.coherence.crossLabsCoherenceIndex100}점** (${crossLabsReport.productionReadySummaryKo})`,
  `- **Blender 5.2 라이브 씬 동기화 오브젝트:** **${crossLabsReport.sceneObjectsSynced}종** (${liveSyncBridge.summaryKo})`,
  `- **멀티 클라우드·로컬 다이나믹 매트릭스:** ${deployMatrix.summaryKo}`,
  "",
  "## 1. 4대 핵심 도메인 Verify AI 게이트 집계",
  "",
  "| 도메인 | 대표 지표 | 세부 수치 | 종합 점수 | 판정 |",
  "|---|---|---|---:|:---:|",
  `| **3D Labs (Blender 5.2 × Webtoon)** | V01~V10 Preflight · 8-Pass PSD · B_SZ | Preflight ${bg3dPreflight.totalGateScore} · PSD ${multiPassPlan.estimatedPsdArchiveMiB}MiB · B_SZ ${scrollPacing.speechBubbleSafeZoneScore} | **${bg3dVerifyAi.evaluation.overallScore}** | ${bg3dVerifyAi.evaluation.passed ? "PASS" : "HOLD"} |`,
  `| **Character Labs (SHAPER × Tripo)** | 4방향 턴어라운드(C_ID) · 얼굴 SDF · 비등방 외곽선 | C_ID ${characterVerifyAi.turnaroundConsistencyScore100} · SDF ${characterVerifyAi.facialSdfCleanScore100} · 외곽선 ${characterVerifyAi.outlineAnisotropyScore100} | **${characterVerifyAi.overallScore100}** | ${characterVerifyAi.passed ? "PASS" : "HOLD"} |`,
  `| **Brush Labs (Sumi WebGPU × 38밴드 KM)** | 테이퍼 예리도(T_SHARP) · Linked Ink · 8h 내구성 | 테이퍼 ${brushVerifyAi.taperSharpnessScore100} · Linked Ink ${brushVerifyAi.linkedInk3dProjectionStability100} · 8h ${brushVerifyAi.marathonSoakStability100} | **${brushVerifyAi.overallScore100}** | ${brushVerifyAi.passed ? "PASS" : "HOLD"} |`,
  `| **Cross-Labs Unified Bridge** | 조명 정합 · 선폭 조화 · 원근 스냅 · Rights BOM | 조명 ${crossLabsReport.coherence.bg3dToCharacterLightingMatch100} · 선폭 ${crossLabsReport.coherence.characterToBrushLineWeightMatch100} · 원근 ${crossLabsReport.coherence.bg3dToBrushPerspectiveSnap100} · BOM ${rightsBomScore100} | **${crossLabsReport.coherence.unifiedVerifyAiReleaseScore100}** | ${crossLabsReport.coherence.releaseGatePassed ? "PASS" : "HOLD"} |`,
  "",
  "## 2. 💡 Remix: Cross-Labs Unified Production (5-Lens Creative Angles)",
  "",
  ...crossLabsReport.remixes.flatMap((remix) => [
    `### ${remix.badgeKo}: ${remix.lensTitle}`,
    `- **Pitch:** ${remix.pitchKo}`,
    `- **Angle:** ${remix.angleKo}`,
    ...(remix.actionableStepsKo
      ? remix.actionableStepsKo.map((step, idx) => `  ${idx + 1}. ${step}`)
      : []),
    "",
  ]),
  "## 3. 다중 클라우드 & 로컬 운영 배포 프리플라이트 결과",
  "",
  `- **Cloudflare Static + R2 Preflight:** \`errors=${staticPreflight.errors.length}\` (status: \`${staticPreflight.status}\`)`,
  `- **Onpod Container Cloud Preflight:** \`errors=${containerPreflight.errors.length}\` (status: \`${containerPreflight.status}\`)`,
  `- **원클릭 자동 보정 상태:** ${autoRemediation.summaryKo}`,
  "",
].join("\n");

const reportArgIdx = process.argv.indexOf("--report");
if (reportArgIdx >= 0 && process.argv[reportArgIdx + 1]) {
  const targetReport = resolve(process.argv[reportArgIdx + 1]!);
  mkdirSync(dirname(targetReport), { recursive: true });
  writeFileSync(targetReport, summaryMarkdown, "utf8");
}

process.stdout.write(summaryMarkdown);
process.exitCode = allPassed ? 0 : 1;
