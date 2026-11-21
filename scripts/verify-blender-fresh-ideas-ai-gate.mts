#!/usr/bin/env node

/**
 * Blender 5.2 × Generate Fresh Ideas (5-Lens Remix) × Verify AI Quality Gate (Phase 1 ~ Phase 4) 통합 검증 CLI.
 *
 * Usage:
 *   pnpm exec tsx scripts/verify-blender-fresh-ideas-ai-gate.mts [--report /tmp/blender-verify-ai-report.md] [--json /tmp/blender-verify-ai-run.json]
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { formatStudioAiQualityEvaluationMarkdown } from "../apps/web/src/domains/creator/ai/studio-ai-quality-benchmark";
import {
  evaluateBlenderSceneWithVerifyAi,
  type BlenderSceneVerifyAiSynthesisInput,
} from "../apps/web/src/domains/creator/bg3d/studio-bg3d-fresh-ideas-verify-ai";
import {
  applyVerifyAiAutoRemediation,
  evaluateMultiPassToonPsdExportPlan,
  evaluateRightsBomCommercialReadiness,
} from "../apps/web/src/domains/creator/bg3d/studio-bg3d-multipass-rights-remediation";
import {
  buildBlenderLiveSceneSyncBridge,
  evaluateBlenderSceneIsolationGuard,
  evaluateVerticalScrollCutPacing,
} from "../apps/web/src/domains/creator/bg3d/studio-bg3d-scroll-pacing-live-sync";
import { evaluateGenreLockGuardrail } from "../apps/web/src/domains/creator/bg3d/studio-bg3d-shot-continuity-linked-ink";
import { expandLensToChannelDraft } from "../apps/web/src/domains/creator/fresh-ideas/fresh-ideas-channels-localization";
import { FRESH_IDEAS_100_CAPABILITIES } from "../apps/web/src/domains/creator/fresh-ideas/fresh-ideas-contracts";
import {
  deconstructFreshIdeasThesis,
  ingestFreshIdeasSources,
} from "../apps/web/src/domains/creator/fresh-ideas/fresh-ideas-ingest-deconstruct";
import { generateFiveOrthogonalLenses } from "../apps/web/src/domains/creator/fresh-ideas/fresh-ideas-lenses-engine";
import { auditFreshIdeasQualityAndSafety } from "../apps/web/src/domains/creator/fresh-ideas/fresh-ideas-quality-ecosystem";
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

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const reportPath = argument("--report");
const jsonPath = argument("--json");

const lightingPreset = BLENDER_FANTASY_LIGHTING_RIG_PRESETS[0]!;
const shaderPreset = BLENDER_NPR_SHADER_PRESETS[0]!;
const freestylePreset = BLENDER_FREESTYLE_INK_PRESETS[0]!;
const weaponPreset = BLENDER_FANTASY_WEAPON_PRESETS[1]!;
const monsterPreset = BLENDER_FANTASY_MONSTER_PRESETS[0]!;
const crowdPreset = BLENDER_FANTASY_CROWD_PRESETS[2]!;

const lightingEval = evaluateBlenderFantasyLightingRig(lightingPreset);
const shaderEval = evaluateBlenderNprShaderTree(shaderPreset, {
  normal: [0.65, 0.35, 0.67],
  lightDir: [0.3, 0.6, 0.74],
  viewDir: [0, 0.1, 0.99],
  edgeCurvature: 0.75,
  cavityOcclusion: 0.2,
});
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
const monsterEval = solveBlenderItascMultiLimbMonsterIk(
  monsterPreset,
  "roar-intimidation",
  0,
);
const crowdEval = simulateBlenderGeometryNodesBoidCrowd(crowdPreset, 180, 1.0);

const remediationExec = applyVerifyAiAutoRemediation(
  {
    archetypeId: "action-impact",
    artisticOverride: false,
    contrastRatio: lightingEval.contrastRatio,
  },
  8500,
);
const preflight = remediationExec.preflightAfter;
const autoRemediation = remediationExec.plan;

const multiPassPlan = evaluateMultiPassToonPsdExportPlan({
  qualityTier: "final",
  webgpuComputeAvailable: true,
});
const rightsBomAudit = evaluateRightsBomCommercialReadiness();
const sceneIsolationReport = evaluateBlenderSceneIsolationGuard();
const genreLockReport = evaluateGenreLockGuardrail({
  lockMode: "action-impact-lock",
  activeLineThicknessPx: freestylePreset.baseThicknessPx,
  activeKelvin: lightingPreset.lights[0]?.temperatureKelvin ?? 8500,
  activeDispersion: shaderEval.dispersionRgbShift[2],
});
const scrollPacing = evaluateVerticalScrollCutPacing({
  archetypeId: "action-impact",
  lensId: "contrarian-take",
  cameraTiltDeg: preflight.archetypeRecommendation.recommendedCameraTiltDeg,
  silhouetteSeparationRatio:
    preflight.archetypeRecommendation.silhouetteSeparationRatio,
  activeWeaponCount: weaponEval.blades.length,
  weaponPositions3d: weaponEval.blades.map((b) => b.position),
  avoidSafeZoneOrbit: true,
});

const input: BlenderSceneVerifyAiSynthesisInput = {
  lightingPreset,
  lightingEval,
  shaderPreset,
  shaderEval,
  freestylePreset,
  freestyleEval,
  weaponPreset,
  weaponEval,
  monsterPreset,
  monsterEval,
  crowdPreset,
  crowdEval,
  preflightReport: preflight,
  multiPassPlan,
  rightsBomAudit,
  scrollPacingPlan: scrollPacing,
  sceneIsolationReport,
  genreLockReport,
};

const result = evaluateBlenderSceneWithVerifyAi(input);
const liveSyncBridge = buildBlenderLiveSceneSyncBridge({
  lightingPresetId: lightingPreset.id,
  shaderPresetId: shaderPreset.id,
  inkPresetId: freestylePreset.id,
  weaponPresetId: weaponPreset.id,
  monsterPresetId: monsterPreset.id,
  focalLengthMm: preflight.archetypeRecommendation.recommendedFocalLengthMm,
  cameraTiltDeg: preflight.archetypeRecommendation.recommendedCameraTiltDeg,
});

const qualityMarkdown = formatStudioAiQualityEvaluationMarkdown(
  result.qualityRun,
  result.evaluation,
);

const preflightRows = preflight.metrics
  .map(
    (m) =>
      `| ${m.id} | ${m.labelKo} | ${m.hardGate ? "YES" : "NO"} | ${m.score} | ${m.measuredValueKo} | ${m.passed ? "PASS" : "HOLD"} |`,
  )
  .join("\n");

const v2Bundle = ingestFreshIdeasSources([
  {
    id: "blender-gate-v2",
    title: `${lightingPreset.nameKo} × ${weaponPreset.nameKo}`,
    kind: "sheet-csv",
    content: `${result.cycleTimeBenchmark.summaryKo} · ${result.weeklyEpisodeRoi.summaryKo}`,
  },
]);
const v2Decon = deconstructFreshIdeasThesis(v2Bundle);
const v2Lenses = generateFiveOrthogonalLenses(v2Bundle, v2Decon);
const v2Draft = expandLensToChannelDraft(v2Lenses[0]!, "linkedin-kr");
const v2Audit = auditFreshIdeasQualityAndSafety(
  v2Lenses,
  v2Draft.bodySectionsKo.join("\n"),
  v2Bundle.preservedUrls,
);

const fullMarkdown = [
  qualityMarkdown.trimEnd(),
  "",
  `## Fresh Ideas v2.0 (100-Capability & @unslop Gate) — ${v2Audit.passed ? "PASS" : "HOLD"} (${v2Audit.score100}점)`,
  "",
  `- **Capabilities Registered:** ${FRESH_IDEAS_100_CAPABILITIES.length}/100`,
  `- **Max Pairwise Overlap:** ${v2Audit.maxPairwiseOverlap}`,
  `- **Violations:** ${v2Audit.violations.length}`,
  "",
  `## Phase 2 Preflight Hard Gate (V01~V10) — ${preflight.summaryBadgeKo}`,
  "",
  `- **Shot Continuity (S_CD):** ${preflight.shotContinuity.continuityDriftScore} (${preflight.shotContinuity.remediationKo})`,
  `- **Linked Ink Bridge (BRI):** ${preflight.linkedInkBridge.bridgeReliabilityIndex} (${preflight.linkedInkBridge.remediationKo})`,
  `- **Archetype Recommendation (PRS):** ${preflight.archetypeRecommendation.presetRecommendationScore} (${preflight.archetypeRecommendation.rationaleKo})`,
  "",
  "| ID | 지표 | Hard Gate | 점수 | 측정값 | 판정 |",
  "|---|---|:---:|---:|---|:---:|",
  preflightRows,
  "",
  `## Phase 3 Multi-Pass PSD · Rights BOM · Auto-Remediation`,
  "",
  `- **Multi-Pass PSD:** ${multiPassPlan.summaryKo}`,
  `- **Rights BOM:** ${rightsBomAudit.summaryKo} (${rightsBomAudit.autoAttributionCreditsKo.join(", ")})`,
  `- **Auto-Remediation:** ${autoRemediation.summaryKo}`,
  "",
  `## Phase 4 Vertical Scroll Pacing (B_SZ) · Live Blender 5.3 Scene Sync`,
  "",
  `- **Scroll Pacing & Safe Zone:** ${scrollPacing.summaryKo}`,
  `- **Live Blender 5.3 Sync:** ${liveSyncBridge.summaryKo}`,
  `- **Viewport Snapshot:** ${liveSyncBridge.viewportSnapshotFile}`,
  "",
  `## ${result.remixHeaderKo}`,
  "",
  ...result.remixes.flatMap((remix) => [
    `### ${remix.badgeKo}: ${remix.lensTitle}`,
    `- **Pitch:** ${remix.pitchKo}`,
    `- **Angle:** ${remix.angleKo}`,
    ...(remix.actionableStepsKo
      ? remix.actionableStepsKo.map((step, i) => `  ${i + 1}. ${step}`)
      : []),
    "",
  ]),
].join("\n");

if (jsonPath) {
  const resolvedJson = resolve(jsonPath);
  await mkdir(dirname(resolvedJson), { recursive: true });
  await writeFile(
    resolvedJson,
    `${JSON.stringify(result.qualityRun, null, 2)}\n`,
    "utf8",
  );
}

if (reportPath) {
  const resolvedReport = resolve(reportPath);
  await mkdir(dirname(resolvedReport), { recursive: true });
  await writeFile(resolvedReport, fullMarkdown, "utf8");
}

process.stdout.write(fullMarkdown);
process.exitCode =
  result.evaluation.passed &&
  preflight.hardGatePassed &&
  rightsBomAudit.commercialPublishAllowed &&
  liveSyncBridge.liveSyncReady
    ? 0
    : 1;
