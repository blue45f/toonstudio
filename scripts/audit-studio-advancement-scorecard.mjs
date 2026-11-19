#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

function auditDomainDir(repoRoot, relativeDir) {
  const dir = path.join(repoRoot, relativeDir);
  if (!existsSync(dir)) {
    return { domain: relativeDir, sourceFileCount: 0, testFileCount: 0, testToSourcePercent: 0 };
  }
  const entries = readdirSync(dir).filter((name) => {
    const full = path.join(dir, name);
    return statSync(full).isFile() && /\.(ts|tsx)$/.test(name);
  });
  const sourceFiles = entries.filter((name) => !/\.test\.(ts|tsx)$/.test(name));
  const testFiles = entries.filter((name) => /\.test\.(ts|tsx)$/.test(name));
  const testToSourcePercent =
    sourceFiles.length > 0 ? Math.round((testFiles.length / sourceFiles.length) * 100) : 0;
  return {
    domain: relativeDir,
    sourceFileCount: sourceFiles.length,
    testFileCount: testFiles.length,
    testToSourcePercent,
  };
}

/**
 * 툰스튜디오 핵심 4대 도메인(assistant, bg3d, brush, export)의 테스트 비율과
 * 어시스턴트 고도화 모듈(14종) 및 크로스-도메인 브리지(14종)의 연결 무결성을 정량 스코어카드로 집계한다.
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
    "studio-rights-receipt-verifier.ts",
    "studio-workflow-pack-runtime-bridge.ts",
    "StudioWebtoonAssistantWorkflowViews.tsx",
    "StudioWebtoonAssistantContent.tsx",
    "studio-contextual-learning.ts",
  ];
  const presentCapabilities = requiredCapabilities.filter((file) => sourceFiles.includes(file));

  const requiredCrossDomainBridges = [
    "apps/web/src/domains/creator/assistant/use-workflow-pack-runtime-consumer.ts",
    "apps/web/src/domains/creator/export/studio-export-rights-receipt-adapter.ts",
    "apps/web/src/domains/creator/export/studio-rights-receipt-remediation.ts",
    "apps/web/src/domains/creator/export/studio-png-rights-chunk-codec.ts",
    "apps/web/src/domains/creator/export/studio-episode-rights-dossier.ts",
    "apps/web/src/domains/creator/export/studio-cut-perceptual-rights-ledger.ts",
    "apps/web/src/domains/creator/export/studio-episode-delivery-package.ts",
    "apps/web/src/domains/creator/export/studio-ai-optout-manifest.ts",
    "apps/web/src/domains/creator/export/studio-spectrum-license-offer.ts",
    "apps/web/src/domains/creator/export/studio-episode-escrow-settlement.ts",
    "apps/web/src/domains/creator/export/studio-creator-mg-readiness.ts",
    "apps/web/src/domains/creator/bg3d/studio-bg3d-workflow-pack-adapter.ts",
    "apps/web/src/domains/creator/brush/studio-brush-workflow-pack-adapter.ts",
    "scripts/verify-rights-bom-receipt-cli.mjs",
  ];
  const presentCrossDomainBridges = requiredCrossDomainBridges.filter((relPath) =>
    existsSync(path.join(repoRoot, relPath)),
  );

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
      viewsSource.includes("dispatchWorkflowPackRuntimeEvent") &&
      viewsSource.includes("verifySubmittedRightsReceipt") &&
      viewsSource.includes("saveCustomStudioWorkflowPack");
  } catch {
    return {
      scope: "apps/web/src/domains/creator/{assistant,bg3d,brush,export}",
      sourceFileCount: sourceFiles.length,
      testFileCount: testFiles.length,
      testToSourcePercent: 0,
      requiredCapabilitiesCount: requiredCapabilities.length,
      presentCapabilitiesCount: presentCapabilities.length,
      requiredCrossDomainBridgesCount: requiredCrossDomainBridges.length,
      presentCrossDomainBridgesCount: presentCrossDomainBridges.length,
      wiredRouterAndPacks: false,
      domains: [],
      ready: false,
    };
  }

  const domains = [
    auditDomainDir(repoRoot, "apps/web/src/domains/creator/assistant"),
    auditDomainDir(repoRoot, "apps/web/src/domains/creator/bg3d"),
    auditDomainDir(repoRoot, "apps/web/src/domains/creator/brush"),
    auditDomainDir(repoRoot, "apps/web/src/domains/creator/export"),
  ];

  const testCoverageRatio =
    sourceFiles.length > 0 ? Math.round((testFiles.length / sourceFiles.length) * 100) : 0;

  return {
    scope: "apps/web/src/domains/creator/{assistant,bg3d,brush,export}",
    sourceFileCount: sourceFiles.length,
    testFileCount: testFiles.length,
    testToSourcePercent: testCoverageRatio,
    requiredCapabilitiesCount: requiredCapabilities.length,
    presentCapabilitiesCount: presentCapabilities.length,
    requiredCrossDomainBridgesCount: requiredCrossDomainBridges.length,
    presentCrossDomainBridgesCount: presentCrossDomainBridges.length,
    wiredRouterAndPacks,
    domains,
    ready:
      presentCapabilities.length === requiredCapabilities.length &&
      presentCrossDomainBridges.length === requiredCrossDomainBridges.length &&
      wiredRouterAndPacks &&
      domains.every((d) => d.sourceFileCount > 0) &&
      testFiles.length >= 14,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const scorecard = buildStudioAdvancementScorecard();
  const asJson = process.argv.includes("--json");
  if (asJson) {
    console.log(JSON.stringify(scorecard, null, 2));
  } else {
    const domainLines = scorecard.domains.map(
      (d) =>
        `  - ${d.domain}: ${d.sourceFileCount} src / ${d.testFileCount} tests (${d.testToSourcePercent}%)`,
    );
    console.log(
      [
        `# ToonStudio Multi-Domain Advancement Scorecard`,
        `- Assistant capabilities: ${scorecard.presentCapabilitiesCount}/${scorecard.requiredCapabilitiesCount}`,
        `- Cross-domain bridges & CLI: ${scorecard.presentCrossDomainBridgesCount}/${scorecard.requiredCrossDomainBridgesCount}`,
        `- Router, Workflow Packs, Runtime Bridge & Verifier wired: ${scorecard.wiredRouterAndPacks ? "YES" : "NO"}`,
        `- Domain breakdown:`,
        ...domainLines,
        `- Overall readiness: ${scorecard.ready ? "PASS" : "FAIL"}`,
      ].join("\n"),
    );
  }
  if (!scorecard.ready) {
    process.exitCode = 1;
  }
}
