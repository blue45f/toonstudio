#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

/**
 * 툰스튜디오 크리에이터 어시스턴트 영역의 모듈·테스트 짝과 핵심 고도화 계약을
 * 정량 스코어카드로 집계한다.
 */
export function buildStudioAdvancementScorecard(repoRoot = REPO_ROOT) {
  const assistantDir = path.join(repoRoot, "apps/web/src/domains/creator/assistant");
  const entries = readdirSync(assistantDir).filter((name) => {
    const full = path.join(assistantDir, name);
    return statSync(full).isFile() && /\.(ts|tsx)$/.test(name);
  });

  const sourceFiles = entries.filter((name) => !/\.test\.(ts|tsx)$/.test(name));
  const testFiles = entries.filter((name) => /\.test\.(ts|tsx)$/.test(name));

  const requiredCapabilities = [
    "studio-assistant-skill-router.ts",
    "studio-workflow-pack.ts",
    "studio-workflow-pack-deeplink.ts",
    "studio-workflow-pack-store.ts",
    "studio-workflow-pack-rights-receipt.ts",
    "studio-workflow-pack-telemetry.ts",
    "studio-workflow-pack-policy.ts",
    "studio-workflow-pack-export-bundle.ts",
    "studio-workflow-pack-sync.ts",
    "StudioWebtoonAssistantWorkflowViews.tsx",
    "StudioWebtoonAssistantContent.tsx",
    "studio-contextual-learning.ts",
  ];
  const presentCapabilities = requiredCapabilities.filter((file) => sourceFiles.includes(file));

  let wiredRouterAndPacks;
  const contentPath = path.join(assistantDir, "StudioWebtoonAssistantContent.tsx");
  const viewsPath = path.join(assistantDir, "StudioWebtoonAssistantWorkflowViews.tsx");
  try {
    const contentSource = readFileSync(contentPath, "utf8");
    const viewsSource = readFileSync(viewsPath, "utf8");
    wiredRouterAndPacks =
      contentSource.includes("StudioAssistantSkillRouterBar") &&
      contentSource.includes("StudioWorkflowPacksPanel") &&
      viewsSource.includes("routeStudioAssistantSkills") &&
      viewsSource.includes("BUILTIN_STUDIO_WORKFLOW_PACKS") &&
      viewsSource.includes("buildWorkflowPackShareUrl") &&
      viewsSource.includes("buildWorkflowPackExportReceiptAttachment") &&
      viewsSource.includes("evaluateWorkflowPackTeamPolicy") &&
      viewsSource.includes("broadcastWorkflowPackUpdate") &&
      viewsSource.includes("saveCustomStudioWorkflowPack");
  } catch {
    return {
      scope: "apps/web/src/domains/creator/assistant",
      sourceFileCount: sourceFiles.length,
      testFileCount: testFiles.length,
      testToSourcePercent: 0,
      requiredCapabilitiesCount: requiredCapabilities.length,
      presentCapabilitiesCount: presentCapabilities.length,
      wiredRouterAndPacks: false,
      ready: false,
    };
  }

  const testCoverageRatio =
    sourceFiles.length > 0 ? Math.round((testFiles.length / sourceFiles.length) * 100) : 0;

  return {
    scope: "apps/web/src/domains/creator/assistant",
    sourceFileCount: sourceFiles.length,
    testFileCount: testFiles.length,
    testToSourcePercent: testCoverageRatio,
    requiredCapabilitiesCount: requiredCapabilities.length,
    presentCapabilitiesCount: presentCapabilities.length,
    wiredRouterAndPacks,
    ready:
      presentCapabilities.length === requiredCapabilities.length &&
      wiredRouterAndPacks &&
      testFiles.length >= 12,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const scorecard = buildStudioAdvancementScorecard();
  const asJson = process.argv.includes("--json");
  if (asJson) {
    console.log(JSON.stringify(scorecard, null, 2));
  } else {
    console.log(
      [
        `# ToonStudio Advancement Scorecard (${scorecard.scope})`,
        `- Source files: ${scorecard.sourceFileCount}`,
        `- Test files: ${scorecard.testFileCount} (${scorecard.testToSourcePercent}% test-to-source ratio)`,
        `- Required capabilities: ${scorecard.presentCapabilitiesCount}/${scorecard.requiredCapabilitiesCount}`,
        `- Router & Workflow Packs wired: ${scorecard.wiredRouterAndPacks ? "YES" : "NO"}`,
        `- Overall readiness: ${scorecard.ready ? "PASS" : "FAIL"}`,
      ].join("\n"),
    );
  }
  if (!scorecard.ready) {
    process.exitCode = 1;
  }
}
