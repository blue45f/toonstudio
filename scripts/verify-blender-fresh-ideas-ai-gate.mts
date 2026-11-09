#!/usr/bin/env node

/**
 * Blender 5.2 × Generate Fresh Ideas (5-Lens Remix) × Verify AI Quality Gate (Phase 1 + Phase 2 V01~V10) 통합 검증 CLI.
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
import { evaluateVerifyAiPreflightGates } from "../apps/web/src/domains/creator/bg3d/studio-bg3d-shot-continuity-linked-ink";
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

const input: BlenderSceneVerifyAiSynthesisInput = {
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

const result = evaluateBlenderSceneWithVerifyAi(input);
const preflight = evaluateVerifyAiPreflightGates({
  archetypeId: "action-impact",
  artisticOverride: false,
  contrastRatio: lightingEval.contrastRatio,
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

const fullMarkdown = [
  qualityMarkdown.trimEnd(),
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
  result.evaluation.passed && preflight.hardGatePassed ? 0 : 1;
