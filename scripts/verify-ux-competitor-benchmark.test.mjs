import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

import {
  COMPETITOR_PROFILES,
  TOTAL_MAX_SCORE,
  UX_BENCHMARK_AXES,
  computeCompetitorDeltas,
  summarizeCompetitorBaselines,
  validateRubricIntegrity,
} from "./lib/ux-competitor-benchmark-rubric.mjs";
import {
  findRawHexLiterals,
  findTransitionAllViolations,
  hasUnpairedBackdropFilter,
} from "./lib/ux-competitor-benchmark-scanners.mjs";
import {
  evaluateUxCompetitorBenchmark,
  formatConsoleReport,
  main,
  parseArguments,
} from "./verify-ux-competitor-benchmark.mjs";

function writeFixtureFile(root, relPath, content) {
  const fullPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
}

function buildWorkflowBlock(id, requiredCount = 1, optionalCount = 6) {
  const req = Array.from({ length: requiredCount }, (_, idx) => `defineField("req_${idx}", "필수", "Req", "text", "", "")`).join(",\n");
  const opt = Array.from({ length: optionalCount }, (_, idx) => `defineField("opt_${idx}", "선택", "Opt", "text", "", "")`).join(",\n");
  return `"${id}": { id: "${id}", requiredFields: [${req}], optionalFields: [${opt}] }`;
}

/** 10대 축 100점 만점 요건을 모두 충족하는 격리 합성 저장소 픽스처를 생성한다. */
function createPassingRepoFixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ux-benchmark-pass-"));

  // 축 1: GNB/LNB + 5단계 여정 지도 + PageRoleAndJourneyNavigator
  writeFixtureFile(
    tmp,
    "apps/web/src/shared/components/site-navigation.ts",
    `export type SiteNavigationJourney = "start" | "create" | "publish" | "collaborate" | "rest";
export const SITE_NAVIGATION_GROUPS = [];
export const TOONSTUDIO_NAVIGATION_GROUPS = SITE_NAVIGATION_GROUPS;
export const TOONSPECTRUM_NAVIGATION_GROUPS = SITE_NAVIGATION_GROUPS;`,
  );
  for (const rel of [
    "apps/web/src/shared/components/workspace/WorkspaceNavigation.tsx",
    "apps/web/src/shared/components/workspace/WorkspaceMenuNavigation.tsx",
    "apps/web/src/shared/components/SiteMenuDestinations.tsx",
    "apps/web/src/shared/components/workspace/workspace-navigation-model.ts",
    "apps/web/src/shared/components/site-navigation-renderer-equivalence.test.ts",
    "apps/web/src/shared/components/workspace/WorkspaceChrome.menu-boundary.test.tsx",
    "apps/web/src/shared/components/site-shell-mobile-accessibility.test.tsx",
    "apps/web/src/shared/components/site-mobile-purpose.test.ts",
    "apps/web/src/shared/components/workspace/sitewide-visual-v3.contract.test.ts",
    "apps/web/src/app/styles/layout-token-contract.contract.test.ts",
    "apps/web/src/shared/components/workspace/WorkspaceContextPanel.adaptive.test.tsx",
    "apps/web/src/shared/components/workspace/multidevice-spectrum-ux.contract.test.ts",
    "scripts/audit-sitewide-visual-ux.mjs",
  ]) {
    writeFixtureFile(tmp, rel, "// fixture contract file\n");
  }
  writeFixtureFile(
    tmp,
    "apps/web/src/shared/components/site-header-mobile-nav.tsx",
    `export function MobileNav() { return mobileSiteTabsForPath("/studio"); }`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/shared/components/workspace/page-role-journey-map.ts",
    `export const PAGE_ROLE_JOURNEY_MAP = [
  { path: "/studio", stageNumber: 2, roleHeadlineKo: "원고 제작", recommendedNextSteps: ["/production"], accentTone: "creation" },
  { path: "/studio/bg3d", stageNumber: 2, roleHeadlineKo: "3D 스테이지", recommendedNextSteps: ["/studio"], accentTone: "three-d" },
  { path: "/production", stageNumber: 3, roleHeadlineKo: "팀 분업 관제", recommendedNextSteps: ["/market"], accentTone: "collab" },
  { path: "/market", stageNumber: 4, roleHeadlineKo: "에셋 탐색", recommendedNextSteps: ["/creator-support"], accentTone: "market" },
  { path: "/creator-support", stageNumber: 5, roleHeadlineKo: "1:1 AI 고객센터", recommendedNextSteps: ["/studio"], accentTone: "support" },
];`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/shared/components/workspace/PageRoleAndJourneyNavigator.tsx",
    `export function PageRoleAndJourneyNavigator() { return null; }`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/shared/components/workspace/PageRoleAndJourneyNavigator.test.tsx",
    `// unit test`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/shared/components/workspace/WorkspaceTaskFrame.tsx",
    `import { PageRoleAndJourneyNavigator } from "./PageRoleAndJourneyNavigator";
export function WorkspaceTaskFrame() { return <PageRoleAndJourneyNavigator />; }`,
  );

  // 축 2, 3, 5: 멀티디바이스 + OKLCH 스펙트럼 + 접근성 CSS (원시 HEX 0건 · transition:all 0건)
  writeFixtureFile(
    tmp,
    "apps/web/src/shared/components/workspace/workspace-visual-v3.css",
    `:root {
  --ts-spectrum-creation: oklch(0.62 0.21 18);
  --ts-spectrum-3d: oklch(0.64 0.16 185);
  --ts-spectrum-collab: oklch(0.56 0.20 278);
  --ts-spectrum-market: oklch(0.68 0.17 75);
  --ts-spectrum-support: oklch(0.60 0.16 158);
}
.workspace-shell { overflow-x: clip; grid-template-columns: var(--layout-rail-icon) minmax(0, 1fr); }
.workspace-topbar { backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
@media (max-width: 767px) {
  .workspace-shell { min-height: 100dvh; padding-bottom: calc(72px + env(safe-area-inset-bottom)); }
  .workspace-sidebar .workspace-nav { grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .workspace-sidebar .workspace-nav a { min-height: 48px; }
}
@media (min-width: 1280px) { .workspace-shell { grid-template-columns: var(--layout-rail-row) minmax(0, 1fr); } }
@media (min-width: 1280px) and (pointer: coarse) { .workspace-sidebar a { min-height: 44px; } }
@supports (animation-timeline: view()) { .card { animation-timeline: view(); } }
@media (prefers-reduced-motion: reduce) { .workspace-shell * { transition: none; } }
@media (forced-colors: active) { .workspace-shell { background: Canvas; } }`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/shared/components/workspace/workspace-redesign.css",
    `@media (min-width: 768px) and (max-width: 1279px) { .workspace-shell { padding-inline: 18px; } }
@media (max-width: 767px) {
  .workspace-sidebar .workspace-nav { grid-template-columns: repeat(5, minmax(0, 1fr)); padding-bottom: env(safe-area-inset-bottom); }
}
@media (prefers-reduced-motion: reduce) { * { animation: none; } }`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/shared/components/site-menu.css",
    `@starting-style { .site-menu-panel { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .site-menu-panel { transition: none; } }`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/app/styles/mobile-first-shell.css",
    `html, body { overflow-x: clip; }
@media (max-width: 1179px) {
  [data-slot="button"] { min-block-size: 48px; touch-action: manipulation; }
  .site-footer { padding-block-end: calc(6rem + env(safe-area-inset-bottom)); }
}
@media (max-width: 767px) { #main-content button { word-break: keep-all; min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { * { transition: none; } }`,
  );
  const hundredOklch = Array.from({ length: 110 }, (_, idx) => `--tok-${idx}: oklch(0.5 0.1 ${idx % 360});`).join("\n");
  writeFixtureFile(
    tmp,
    "apps/web/src/app/styles/design-themes.css",
    `:root[data-design-theme="contrast"] {\n${hundredOklch}\n}\n@media (forced-colors: active) { :root { color: CanvasText; } }`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/app/styles/unified-theme-contract.css",
    `:root[data-design-theme="contrast"] { --unified-fg: oklch(0.15 0 0); }`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/nextgen-web-platform/nextgen-web-platform.css",
    `.nextgen-dock { padding-bottom: env(safe-area-inset-bottom); color: oklch(0.2 0.02 260); }
@supports (animation-timeline: view()) { .nextgen-card { animation-timeline: view(); } }
@media (prefers-reduced-motion: reduce) { * { animation: none; } }`,
  );

  // 축 4: smart-form-autofill 5대 워크플로 (필수 <= 2)
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/smart-form-autofill/smart-form-workflow-schemas.ts",
    `export const MAX_REQUIRED_FIELDS = 2 as const;
export const SMART_FORM_WORKFLOW_SCHEMAS = {
  ${buildWorkflowBlock("project-create", 1, 9)},
  ${buildWorkflowBlock("episode-publish", 1, 8)},
  ${buildWorkflowBlock("export-release", 1, 7)},
  ${buildWorkflowBlock("team-division-invite", 2, 7)},
  ${buildWorkflowBlock("support-inquiry", 1, 6)},
};`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/smart-form-autofill/minimal-required-form-engine.ts",
    `export function generateSmartFormRecommendations() {}
export function applySmartFormRecommendations() {}
export function undoSmartFormAutofill() {}`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/smart-form-autofill/StudioSmartAutofillAssistantCard.tsx",
    `export function StudioSmartAutofillAssistantCard() { return <button data-testid="smart-form-autofill-btn" className="min-h-11" />; }`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/smart-form-autofill/__tests__/smart-form-autofill.test.tsx",
    `// test`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/studio-shell/StudioCreateQuickPresetStrip.tsx",
    `const LazyCard = React.lazy(() => import("../smart-form-autofill/StudioSmartAutofillAssistantCard"));`,
  );

  // 축 6: 60초 온보딩 + 1:1 AI 고객센터 풀스택
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/nextgen-web-platform/beginner-onboarding-mobile-dock.ts",
    `export const BEGINNER_ONBOARDING_STORAGE_KEY = "k";
export const BEGINNER_ONBOARDING_STEPS = [
  { id: "s1", durationSec: 10 },
  { id: "s2", durationSec: 15 },
  { id: "s3", durationSec: 15 },
  { id: "s4", durationSec: 10 },
  { id: "s5", durationSec: 10 },
];
export const MOBILE_THUMB_DOCK_MIN_TOUCH_TARGET_PX = 44;
export const MOBILE_THUMB_DOCK_ACTIONS = [];`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/nextgen-web-platform/StudioNextGenBeginnerTab.tsx",
    `import { BEGINNER_ONBOARDING_STEPS } from "./beginner-onboarding-mobile-dock";`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/studio-shell/StudioExportPanel.tsx",
    `const Hub = React.lazy(() => import("../nextgen-web-platform/StudioNextGenWebPlatformHub"));`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/nextgen-web-platform/__tests__/nextgen-web-platform.test.tsx",
    `// test`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/support-chat-ai/StudioAiSupportCenterChat.tsx",
    `export function StudioAiSupportCenterChat() { return null; }`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/support-chat-ai/support-ai-chat-kb.ts",
    `export const SUPPORT_AI_QUICK_PROMPTS = [];
export function maskSensitiveSupportInput(v) { return v; }`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/support-chat-ai/support-ai-chat-client.ts",
    `export function sendSupportAiChatMessage() {}`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/studio-shell/StudioCreatorSupportPage.tsx",
    `const Chat = React.lazy(() => import("../support-chat-ai/StudioAiSupportCenterChat"));`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/support-chat-ai/__tests__/support-chat-ai.test.tsx",
    `// test`,
  );
  for (const rel of [
    "apps/api/src/modules/customer-support/customer-support.controller.ts",
    "apps/api/src/modules/customer-support/customer-support-chat.service.ts",
    "apps/api/src/modules/customer-support/customer-support-ai.service.ts",
    "apps/api/src/modules/customer-support/customer-support.repository.ts",
    "apps/api/src/modules/customer-support/customer-support-chat.service.test.ts",
    "apps/api/src/platform/database/migrations/0118_customer_support.sql",
  ]) {
    writeFixtureFile(tmp, rel, "// api support fixture\n");
  }

  // 축 7: 올인원 크리에이티브 깊이
  for (const rel of [
    "apps/web/src/domains/creator/photoshop-pro/photoshop-layer-fx-compositor.ts",
    "apps/web/src/domains/creator/photoshop-pro/photoshop-smart-object-stack.ts",
    "apps/web/src/domains/creator/photoshop-pro/photoshop-camera-raw-channels.ts",
    "apps/web/src/domains/creator/photoshop-pro/photoshop-retouch-frequency.ts",
    "apps/web/src/domains/creator/photoshop-pro/PhotoshopProStudioWorkbench.tsx",
    "apps/web/src/domains/creator/ai-creative-suites/canva-magic-studio-engine.ts",
    "apps/web/src/domains/creator/ai-creative-suites/figma-ai-layout-engine.ts",
    "apps/web/src/domains/creator/ai-creative-suites/tooning-plotr-story-engine.ts",
    "apps/web/src/domains/creator/ai-creative-suites/firefly-graph-relight-engine.ts",
    "apps/web/src/domains/creator/ai-creative-suites/csp-ai-smart-assist-engine.ts",
    "apps/web/src/domains/creator/ai-creative-suites/krita-comfy-live-canvas-engine.ts",
    "apps/web/src/domains/creator/ai-creative-suites/naver-ai-painter-engine.ts",
    "apps/web/src/domains/creator/ai-creative-suites/StudioDesignStoryAi4SuitesPanel.tsx",
    "apps/web/src/domains/creator/ai-creative-suites/StudioVisualAi4SuitesPanel.tsx",
    "apps/web/src/domains/creator/stage-3d-compositor/stage-3d-bg-character-compositor.ts",
    "apps/web/src/domains/creator/stage-3d-compositor/stage-3d-compositor-catalog.ts",
    "apps/web/src/domains/creator/stage-3d-compositor/Studio3dBgCharacterCompositorPanel.tsx",
    "apps/web/src/domains/creator/studio-3d-pro/kwebtoon-npr-ink-contract.ts",
    "apps/web/src/domains/creator/studio-3d-pro/cascadeur-designdoll-rig-pro.ts",
    "apps/web/src/domains/creator/studio-3d-pro/blender-sketchup-vroid-pro-ops.ts",
    "apps/web/src/domains/creator/auto-bg-crowd/auto-bg-crowd-engine.ts",
    "apps/web/src/domains/creator/auto-bg-crowd/auto-bg-crowd-backdrop-svg.ts",
    "apps/web/src/domains/creator/auto-bg-crowd/auto-bg-crowd-crowd-layer.ts",
    "apps/web/src/domains/creator/auto-bg-crowd/auto-bg-crowd-palettes.ts",
    "apps/web/src/domains/creator/auto-bg-crowd/StudioAutoBgCrowdDrawerPanel.tsx",
  ]) {
    writeFixtureFile(tmp, rel, "// creative depth fixture\n");
  }
  writeFixtureFile(tmp, "apps/web/src/domains/creator/StudioImageAdjustmentsPanel.tsx", `import("./photoshop-pro/PhotoshopProStudioWorkbench");`);
  writeFixtureFile(tmp, "apps/web/src/domains/creator/studio-shell/StudioFreeAiAssistWorkbench.tsx", `import("../ai-creative-suites/StudioDesignStoryAi4SuitesPanel");`);
  writeFixtureFile(tmp, "apps/web/src/domains/creator/ai-assist/StudioWebtoonModelerImageGenPanel.tsx", `import("../ai-creative-suites/StudioVisualAi4SuitesPanel");`);
  writeFixtureFile(tmp, "apps/web/src/domains/creator/scene3d/StudioScene3dCutPanel.tsx", `import("../stage-3d-compositor/Studio3dBgCharacterCompositorPanel");`);
  writeFixtureFile(tmp, "apps/web/src/domains/creator/StudioBackgroundPanel.tsx", `import("./auto-bg-crowd/StudioAutoBgCrowdDrawerPanel");`);

  // 축 8: 스튜디오 분업 OS
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/production-hub/division-os/cut-slice-partition-stitch.ts",
    `export interface CutSliceLease {} // previousCutContext nextCutContext`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/production-hub/division-os/layer-authority-rbac.ts",
    `export const DIVISION_ROLE_IDS = ["pd","art_director","writer","storyboard","bg3d","line","flat","shade","finishing_lettering"];
export const STANDARD_LAYER_FOLDERS = ["00_CONTI","60_LETTERING","99_AD_REDLINE"];`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/production-hub/division-os/ad-regulation-qa-engine.ts",
    `export const QA = ["oklch_color_chip","line_weight_cv","color_script_mood","mobile_375_readability","rights_bom_license"];`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/production-hub/division-os/studio-royalty-ledger.ts",
    `export const MODES = ["studio-no9-cut-plus-royalty","korean-cp-mg-rs","withholding_3_3","corporate_vat_10"];`,
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/creator/production-hub/division-os/binary-lock-forensic-guard.ts",
    `export function checkoutBinaryAssetLock() {}
export function embedForensicLsbWatermark() {}
export function extractForensicLsbWatermark() {}`,
  );
  writeFixtureFile(tmp, "apps/web/src/domains/creator/production-hub/division-os/StudioDivisionOsHub.tsx", `export function StudioDivisionOsHub() {}`);
  writeFixtureFile(tmp, "apps/web/src/domains/creator/production-hub/division-os/studio-division-os.test.tsx", `// test`);
  writeFixtureFile(tmp, "apps/web/src/domains/creator/production-hub/ProductionHubPage.tsx", `import("./division-os/StudioDivisionOsHub");`);

  // 축 9: 진입 번들 & 비차단 세션
  writeFixtureFile(
    tmp,
    "scripts/studio-eager-graph-snapshot.json",
    JSON.stringify({
      ok: true,
      totals: { modules: 1550, bytes: 17_400_000 },
      entryTotals: { "apps/web/src/app/main.tsx": { modules: 220, bytes: 1_090_000 } },
      lazyInvalidated: 0,
      opaqueDynamicImports: 0,
      violations: [],
    }),
  );
  writeFixtureFile(
    tmp,
    "apps/web/src/domains/auth/public/session/auth-session.tsx",
    `export const INITIAL_SESSION_READY_DEADLINE_MS = 3_000;`,
  );

  // 축 10: 로컬 ₩0 풀스택·무과금 AI 가드
  writeFixtureFile(
    tmp,
    "scripts/local-object-storage-emulator.mjs",
    `export function assertLoopbackStorageHost() {}
export function resolveConfinedPath() {}
export function verifyLocalObjectStorageRoundTrip() {}`,
  );
  writeFixtureFile(tmp, "scripts/local-object-storage-emulator.test.mjs", `// test`);
  writeFixtureFile(
    tmp,
    "scripts/local-studio-seed-pack.mjs",
    `export const STUDIO_SEED_TEAM_MEMBERS = [];
export function isRemoteStudioDatabaseUrl() {}
export function assertLocalStudioSeedAllowed() {}
export function validateCutSlicePartition() {}
export function redactStudioDatabaseUrl() {}`,
  );
  writeFixtureFile(tmp, "scripts/local-studio-seed-pack.test.mjs", `// test`);
  writeFixtureFile(
    tmp,
    "scripts/verify-free-ai-assist-zero-cost.mjs",
    `const MAX_PROBE_TOKENS = 32;
const SAFETY_CUTOFF_RATIO = 0.9;
const WHITELISTS = {};
// 402 429 billing_hard_limit insufficient_quota`,
  );
  writeFixtureFile(tmp, "apps/web/src/shared/ai/free-ai-zero-bill-cascade.ts", `// 402 429 failover`);
  writeFixtureFile(tmp, "apps/web/src/shared/ai/free-ai-zero-bill-cascade.test.ts", `// test`);
  writeFixtureFile(tmp, "scripts/local-test-stack.mjs", `// stack`);
  writeFixtureFile(tmp, "scripts/verify-local-full-stack.mjs", `// smoke`);

  return tmp;
}

describe("ux-competitor-benchmark rubric & CSS helpers", () => {
  it("10대 축 × 10점 = 100점과 경쟁사 6종 구조 기준선 정합성을 만족한다", () => {
    const check = validateRubricIntegrity();
    assert.equal(check.ok, true, check.errors.join("; "));
    assert.equal(UX_BENCHMARK_AXES.length, 10);
    assert.equal(COMPETITOR_PROFILES.length, 6);
    assert.equal(
      UX_BENCHMARK_AXES.reduce((sum, axis) => sum + axis.maxScore, 0),
      TOTAL_MAX_SCORE,
    );

    const summary = summarizeCompetitorBaselines();
    assert.equal(summary.competitors.length, 6);
    for (const comp of summary.competitors) {
      assert.equal(comp.measurementMode, "public-structural-rubric");
      assert.ok(comp.totalScore > 0 && comp.totalScore < 95);
    }

    const perfectAxes = UX_BENCHMARK_AXES.map((axis) => ({ axisId: axis.id, score: 10 }));
    const deltas = computeCompetitorDeltas(perfectAxes);
    assert.equal(deltas.toonTotal, 100);
    assert.equal(deltas.beatsAllCompetitorsOverall, true);
    assert.equal(deltas.beatsAllCompetitorsEveryAxis, true);
    assert.ok(deltas.deltaVsHighestCompetitor >= 30);
  });

  it("CSS 분석 유틸이 원시 HEX·transition:all·backdrop-filter 페어링을 정확히 감지한다", () => {
    assert.deepEqual(
      findRawHexLiterals("/* #ffffff */ .a { color: #ff00aa; background: url('data:image/svg+xml,%23112233'); } #main-content { color: oklch(0.5 0.1 20); }"),
      ["#ff00aa"],
    );
    assert.deepEqual(findRawHexLiterals("#cafe { color: oklch(0.6 0.1 40); }"), []);
    assert.equal(findTransitionAllViolations(".a { transition: all 0.2s ease; }").length, 1);
    assert.equal(findTransitionAllViolations(".a { transition: color 0.15s ease; }").length, 0);
    assert.equal(hasUnpairedBackdropFilter(".a { backdrop-filter: blur(12px); }"), true);
    assert.equal(
      hasUnpairedBackdropFilter(".a { backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }"),
      false,
    );
    assert.equal(hasUnpairedBackdropFilter(".a { backdrop-filter: none; }"), false);
  });

  it("ReDoS 회귀 방어: url( 뒤에 작은따옴표(')가 50,000번 반복되어도 50ms 이내에 선형 시간으로 종료한다", () => {
    const adversarialNoHex = `url(${"'".repeat(50_000)}`;
    const startNoHex = performance.now();
    const resNoHex = findRawHexLiterals(adversarialNoHex);
    const elapsedNoHexMs = performance.now() - startNoHex;
    assert.deepEqual(resNoHex, []);
    assert.ok(
      elapsedNoHexMs < 50,
      `ReDoS 의심 지연: url( + '×50,000 처리에 ${elapsedNoHexMs.toFixed(2)}ms 소요됨 (50ms 이내여야 함)`,
    );

    const adversarialWithHex = `url(${"'".repeat(50_000)}; color: #ff00aa;`;
    const startWithHex = performance.now();
    const resWithHex = findRawHexLiterals(adversarialWithHex);
    const elapsedWithHexMs = performance.now() - startWithHex;
    assert.deepEqual(resWithHex, ["#ff00aa"]);
    assert.ok(
      elapsedWithHexMs < 50,
      `ReDoS 의심 지연: 꼬리 HEX 포함 입력 처리에 ${elapsedWithHexMs.toFixed(2)}ms 소요됨`,
    );

    // 따옴표 및 중첩 괄호를 포함한 정상 SVG data URL 내부 HEX는 오탐 없이 제외하고 외부 HEX만 감지한다.
    assert.deepEqual(
      findRawHexLiterals(
        `background: url("data:image/svg+xml,<svg fill='#112233'>)</svg>"), url(data:image/svg+xml,<svg fill="#445566" transform="translate(1,2)"></svg>); color: #abcdef;`,
      ),
      ["#abcdef"],
    );
  });
});

describe("ux-competitor-benchmark real repository scan", () => {
  it("실제 저장소에서 10대 축을 오류 없이 실측하고 Wave 7~13 완결 6축 만점 및 경쟁사 격차를 산출한다", () => {
    const report = evaluateUxCompetitorBenchmark({ minScore: 95 });
    assert.equal(report.toonStudio.axes.length, 10);
    assert.equal(report.competitors.length, 6);
    assert.equal(report.deltas.overall.length, 6);
    assert.equal(report.deltas.beatsAllCompetitorsOverall, true);

    const byId = new Map(report.toonStudio.axes.map((axis) => [axis.axisId, axis]));
    for (const completedAxisId of [
      "minimal-form-ai-autofill",
      "beginner-onboarding-ai-support",
      "all-in-one-creative-depth",
      "studio-division-os",
      "initial-bundle-lazy-boundary",
      "local-zero-cost-ai-guard",
    ]) {
      assert.equal(
        byId.get(completedAxisId)?.score,
        10,
        `${completedAxisId} 축이 10점 만점이 아닙니다: ${JSON.stringify(byId.get(completedAxisId)?.remediations)}`,
      );
    }

    const bundleAxis = byId.get("initial-bundle-lazy-boundary");
    assert.ok(typeof bundleAxis.rawMetrics.totalBytes === "number" && bundleAxis.rawMetrics.totalBytes > 0);
    assert.equal(bundleAxis.rawMetrics.lazyInvalidated, 0);

    const expectedVerdict =
      report.toonStudio.totalScore >= 95 && report.deltas.beatsAllCompetitorsOverall
        ? "PASS"
        : "BLOCKED";
    assert.equal(report.verdict, expectedVerdict);

    const table = formatConsoleReport(report);
    assert.ok(table.includes("Clip Studio Paint"));
    assert.ok(table.includes("Canva Magic Studio"));
    assert.ok(table.includes("Procreate"));
  });
});

describe("ux-competitor-benchmark passing fixture & fault injection", () => {
  it("10대 축 요건을 모두 충족한 픽스처에서 100/100 PASS와 종료 코드 0을 반환한다", () => {
    const tmp = createPassingRepoFixture();
    try {
      const report = evaluateUxCompetitorBenchmark({ root: tmp, minScore: 95 });
      assert.equal(report.toonStudio.totalScore, 100);
      assert.equal(report.verdict, "PASS");
      assert.equal(report.ok, true);
      assert.equal(report.improvementActions.length, 0);
      assert.equal(report.deltas.beatsAllCompetitorsEveryAxis, true);

      const jsonLines = [];
      const jsonCode = main(["--root", tmp, "--min-score", "95", "--json"], {
        log: (line) => jsonLines.push(line),
        error: () => {},
      });
      assert.equal(jsonCode, 0);
      const parsed = JSON.parse(jsonLines.join("\n"));
      assert.equal(parsed.verdict, "PASS");
      assert.equal(parsed.toonStudio.totalScore, 100);

      const outReportPath = path.join(tmp, "out/benchmark.json");
      const textLines = [];
      const textCode = main(["--root", tmp, "--min-score", "95", "--write-json", outReportPath], {
        log: (line) => textLines.push(line),
        error: () => {},
      });
      assert.equal(textCode, 0);
      assert.ok(textLines.join("\n").includes("[1] 10대 실측 평가 축"));
      assert.ok(textLines.join("\n").includes("[4] JSON 요약"));
      assert.equal(JSON.parse(fs.readFileSync(outReportPath, "utf8")).verdict, "PASS");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("축 1·2·5 결함 주입(여정 지도 누락 · overflow-x 제거 · 원시 HEX/transition:all 주입) 시 점수가 하락하고 BLOCKED(exit 1) 판정된다", () => {
    const tmp = createPassingRepoFixture();
    try {
      fs.rmSync(path.join(tmp, "apps/web/src/shared/components/workspace/page-role-journey-map.ts"));
      writeFixtureFile(
        tmp,
        "apps/web/src/app/styles/mobile-first-shell.css",
        `body { margin: 0; }`,
      );
      writeFixtureFile(
        tmp,
        "apps/web/src/shared/components/workspace/workspace-visual-v3.css",
        `.workspace-shell { color: #ff00aa; background: #112233; transition: all 0.2s ease; backdrop-filter: blur(12px); }`,
      );

      const report = evaluateUxCompetitorBenchmark({ root: tmp, minScore: 95 });
      assert.equal(report.verdict, "BLOCKED");
      assert.equal(report.ok, false);
      assert.ok(report.toonStudio.totalScore < 95);

      const axisMap = new Map(report.toonStudio.axes.map((a) => [a.axisId, a]));
      assert.ok(axisMap.get("gnb-lnb-journey").score < 10);
      assert.ok(axisMap.get("mobile-thumb-ux").score < 10);
      assert.ok(axisMap.get("oklch-spectrum-a11y").score < 5);
      assert.ok(report.improvementActions.some((item) => item.checkId === "zero-raw-hex-in-ux-css"));
      assert.ok(report.improvementActions.some((item) => item.checkId === "page-role-journey-map"));

      const exitCode = main(["--root", tmp, "--min-score", "95", "--json"], {
        log: () => {},
        error: () => {},
      });
      assert.equal(exitCode, 1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("축 4 필수항목 초과(3개) · 축 6 온보딩 120초 초과 · 축 9 번들 22MiB & 지연 무효화 주입 시 즉시 BLOCKED 판정된다", () => {
    const tmp = createPassingRepoFixture();
    try {
      writeFixtureFile(
        tmp,
        "apps/web/src/domains/creator/smart-form-autofill/smart-form-workflow-schemas.ts",
        `export const MAX_REQUIRED_FIELDS = 4 as const;
export const SMART_FORM_WORKFLOW_SCHEMAS = {
  ${buildWorkflowBlock("project-create", 3, 6)},
  ${buildWorkflowBlock("episode-publish", 1, 6)},
  ${buildWorkflowBlock("export-release", 1, 6)},
  ${buildWorkflowBlock("team-division-invite", 2, 6)},
  ${buildWorkflowBlock("support-inquiry", 1, 6)},
};`,
      );
      writeFixtureFile(
        tmp,
        "apps/web/src/domains/creator/nextgen-web-platform/beginner-onboarding-mobile-dock.ts",
        `export const BEGINNER_ONBOARDING_STORAGE_KEY = "k";
export const BEGINNER_ONBOARDING_STEPS = [
  { id: "s1", durationSec: 40 },
  { id: "s2", durationSec: 40 },
  { id: "s3", durationSec: 40 },
];
export const MOBILE_THUMB_DOCK_MIN_TOUCH_TARGET_PX = 44;
export const MOBILE_THUMB_DOCK_ACTIONS = [];`,
      );

      const report = evaluateUxCompetitorBenchmark({
        root: tmp,
        minScore: 95,
        eagerGraphOverride: {
          ok: false,
          totals: { modules: 2200, bytes: 22 * 1024 * 1024 },
          entryTotals: { "apps/web/src/app/main.tsx": { modules: 400, bytes: 2.2 * 1024 * 1024 } },
          lazyInvalidated: 3,
          opaqueDynamicImports: 1,
          violations: ["bundle grew"],
        },
      });

      assert.equal(report.verdict, "BLOCKED");
      const axisMap = new Map(report.toonStudio.axes.map((a) => [a.axisId, a]));
      assert.ok(axisMap.get("minimal-form-ai-autofill").score < 10);
      assert.ok(axisMap.get("beginner-onboarding-ai-support").score < 10);
      assert.ok(axisMap.get("initial-bundle-lazy-boundary").score <= 1.5);
      assert.ok(report.improvementActions.some((item) => item.checkId === "eager-graph-under-17-5-mib"));
      assert.ok(report.improvementActions.some((item) => item.checkId === "zero-lazy-invalidated"));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("축 7·8·10 핵심 자산·RBAC·워터마크·무과금 402/429 가드 삭제 시 점수 하락 및 BLOCKED가 발생한다", () => {
    const tmp = createPassingRepoFixture();
    try {
      fs.rmSync(path.join(tmp, "apps/web/src/domains/creator/ai-creative-suites/canva-magic-studio-engine.ts"));
      fs.rmSync(path.join(tmp, "apps/web/src/domains/creator/photoshop-pro/photoshop-layer-fx-compositor.ts"));
      fs.rmSync(path.join(tmp, "apps/web/src/domains/creator/production-hub/division-os/binary-lock-forensic-guard.ts"));
      writeFixtureFile(tmp, "scripts/verify-free-ai-assist-zero-cost.mjs", `// guard removed`);

      const report = evaluateUxCompetitorBenchmark({ root: tmp, minScore: 95 });
      assert.equal(report.verdict, "BLOCKED");
      assert.ok(report.toonStudio.totalScore < 95);
      const axisMap = new Map(report.toonStudio.axes.map((a) => [a.axisId, a]));
      assert.ok(axisMap.get("all-in-one-creative-depth").score < 10);
      assert.ok(axisMap.get("studio-division-os").score <= 8.0);
      assert.equal(axisMap.get("local-zero-cost-ai-guard").score, 7.5);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("빈 디렉터리(경쟁사 대비 열위)에서는 --min-score가 낮아도 경쟁사 우위 미달로 BLOCKED 판정한다", () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "ux-benchmark-empty-"));
    try {
      const report = evaluateUxCompetitorBenchmark({ root: emptyDir, minScore: 0 });
      assert.equal(report.toonStudio.totalScore, 0);
      assert.equal(report.deltas.beatsAllCompetitorsOverall, false);
      assert.equal(report.verdict, "BLOCKED");
      assert.ok(report.blockReasons.some((msg) => msg.includes("경쟁사 대비 우위 미달")));
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("CLI 인자 파싱과 오류 종료 코드(2)를 올바르게 처리한다", () => {
    assert.equal(parseArguments(["--min-score", "92", "--json"]).minScore, 92);
    assert.throws(() => parseArguments(["--min-score", "150"]), /0~100/);
    assert.throws(() => parseArguments(["--unknown-flag"]), /알 수 없는 인자/);

    const helpLogs = [];
    assert.equal(main(["--help"], { log: (m) => helpLogs.push(m), error: () => {} }), 0);
    assert.ok(helpLogs.join("\n").includes("--min-score"));

    const errLogs = [];
    assert.equal(main(["--min-score", "abc"], { log: () => {}, error: (m) => errLogs.push(m) }), 2);
    assert.ok(errLogs.join("\n").includes("0~100"));
  });
});
