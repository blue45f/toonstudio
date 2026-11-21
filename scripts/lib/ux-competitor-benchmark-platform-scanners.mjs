/**
 * ToonStudio UI/UX 벤치마크 축 6~10(온보딩·AI 고객센터·올인원 창작·분업 OS·번들·₩0 풀스택) 실측 스캐너.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

import { round1 } from "./ux-competitor-benchmark-rubric.mjs";
import {
  fileExists,
  finalizeAxis,
  makeCheck,
  readText,
  resolvePath,
} from "./ux-competitor-benchmark-ux-scanners.mjs";

const EAGER_GRAPH_MIB_LIMIT = 17.5;
const EAGER_GRAPH_MIB_PARTIAL_LIMIT = 19.0;
const APP_SHELL_MIB_LIMIT = 1.5;
const BYTES_PER_MIB = 1024 * 1024;

/** 축 6: 초보자 60초 첫 1컷 온보딩 & 1:1 AI 고객센터 */
export function scanAxis6BeginnerOnboardingAiSupport(root) {
  const onboardingModelPath =
    "apps/web/src/domains/creator/nextgen-web-platform/beginner-onboarding-mobile-dock.ts";
  const beginnerTabPath =
    "apps/web/src/domains/creator/nextgen-web-platform/StudioNextGenBeginnerTab.tsx";
  const exportPanelPath = "apps/web/src/domains/creator/studio-shell/StudioExportPanel.tsx";
  const nextgenTestPath =
    "apps/web/src/domains/creator/nextgen-web-platform/__tests__/nextgen-web-platform.test.tsx";

  const supportChatPath =
    "apps/web/src/domains/creator/support-chat-ai/StudioAiSupportCenterChat.tsx";
  const supportKbPath = "apps/web/src/domains/creator/support-chat-ai/support-ai-chat-kb.ts";
  const supportClientPath = "apps/web/src/domains/creator/support-chat-ai/support-ai-chat-client.ts";
  const supportPagePath = "apps/web/src/domains/creator/studio-shell/StudioCreatorSupportPage.tsx";
  const supportTestPath =
    "apps/web/src/domains/creator/support-chat-ai/__tests__/support-chat-ai.test.tsx";

  const apiSupportFiles = [
    "apps/api/src/modules/customer-support/customer-support.controller.ts",
    "apps/api/src/modules/customer-support/customer-support-chat.service.ts",
    "apps/api/src/modules/customer-support/customer-support-ai.service.ts",
    "apps/api/src/modules/customer-support/customer-support.repository.ts",
    "apps/api/src/platform/database/migrations/0118_customer_support.sql",
  ];
  const apiSupportTestPath =
    "apps/api/src/modules/customer-support/customer-support-chat.service.test.ts";

  const onboardingSrc = readText(root, onboardingModelPath) ?? "";
  const beginnerTabSrc = readText(root, beginnerTabPath) ?? "";
  const durations = [...onboardingSrc.matchAll(/durationSec\s*:\s*(\d+)/gu)].map((m) => Number(m[1]));
  const totalOnboardingSec = durations.reduce((sum, sec) => sum + sec, 0);
  const onboardingComplete = Boolean(
    durations.length >= 5 &&
    totalOnboardingSec > 0 &&
    totalOnboardingSec <= 60 &&
    onboardingSrc.includes("BEGINNER_ONBOARDING_STORAGE_KEY") &&
    beginnerTabSrc.includes("BEGINNER_ONBOARDING_STEPS"),
  );

  const supportChatSrc = readText(root, supportChatPath) ?? "";
  const supportKbSrc = readText(root, supportKbPath) ?? "";
  const supportPageSrc = readText(root, supportPagePath) ?? "";
  const supportFrontendComplete = Boolean(
    supportChatSrc.includes("StudioAiSupportCenterChat") &&
    supportKbSrc.includes("SUPPORT_AI_QUICK_PROMPTS") &&
    supportKbSrc.includes("maskSensitiveSupportInput") &&
    fileExists(root, supportClientPath) &&
    supportPageSrc.includes("StudioAiSupportCenterChat") &&
    /React\.lazy\s*\(/u.test(supportPageSrc),
  );

  const presentApiFiles = apiSupportFiles.filter((file) => fileExists(root, file));
  const exportPanelSrc = readText(root, exportPanelPath) ?? "";
  const nextgenLazyWired = exportPanelSrc.includes("StudioNextGenWebPlatformHub");
  const testFiles = [nextgenTestPath, supportTestPath, apiSupportTestPath];
  const presentTests = testFiles.filter((file) => fileExists(root, file));

  const checks = [
    makeCheck({
      id: "beginner-60s-5step-onboarding",
      labelKo: "초보자 60초(5단계 합산 <= 60s) 첫 1컷 스포트라이트 온보딩 엔진·UI",
      maxPoints: 2.5,
      earnedPoints: onboardingComplete ? 2.5 : durations.length >= 5 ? 1.0 : 0,
      evidence: `steps=${durations.length}, totalSec=${totalOnboardingSec}s, tabWired=${beginnerTabSrc.includes("BEGINNER_ONBOARDING_STEPS")}`,
      remediationKo: "nextgen-web-platform의 5단계 60초 첫 1컷 온보딩 상태 머신과 StudioNextGenBeginnerTab.tsx를 복구하세요.",
      targetFiles: [onboardingModelPath, beginnerTabPath],
    }),
    makeCheck({
      id: "support-chat-ai-frontend",
      labelKo: "1:1 실시간 AI 고객센터 채팅 UI·로컬 KB·PII 마스킹·지연 마운트",
      maxPoints: 2.5,
      earnedPoints: supportFrontendComplete ? 2.5 : supportChatSrc.includes("StudioAiSupportCenterChat") ? 1.0 : 0,
      evidence: `chatUi=${Boolean(supportChatSrc)}, piiMask=${supportKbSrc.includes("maskSensitiveSupportInput")}, pageLazy=${supportPageSrc.includes("StudioAiSupportCenterChat")}`,
      remediationKo: "support-chat-ai 컴포넌트·로컬 KB·PII 마스킹과 StudioCreatorSupportPage.tsx React.lazy 연결을 완비하세요.",
      targetFiles: [supportChatPath, supportKbPath, supportClientPath, supportPagePath],
    }),
    makeCheck({
      id: "customer-support-backend-fullstack",
      labelKo: "AI 고객센터 NestJS API 컨트롤러·서비스·저장소·DB 마이그레이션 풀스택",
      maxPoints: 2.5,
      earnedPoints: round1((presentApiFiles.length / apiSupportFiles.length) * 2.5),
      evidence: `apiFiles=${presentApiFiles.length}/${apiSupportFiles.length}`,
      remediationKo: "apps/api/src/modules/customer-support 풀스택 모듈과 0118_customer_support.sql 마이그레이션을 유지하세요.",
      targetFiles: apiSupportFiles.filter((file) => !presentApiFiles.includes(file)),
    }),
    makeCheck({
      id: "onboarding-support-tests-and-wiring",
      labelKo: "온보딩·AI 고객센터 프론트/백엔드 자동화 테스트 및 진입 연결",
      maxPoints: 2.5,
      earnedPoints: round1((presentTests.length / testFiles.length) * 2.0 + (nextgenLazyWired ? 0.5 : 0)),
      evidence: `tests=${presentTests.length}/${testFiles.length}, nextgenLazyWired=${nextgenLazyWired}`,
      remediationKo: "nextgen-web-platform·support-chat-ai·customer-support-chat 단위 테스트와 StudioExportPanel 지연 연결을 유지하세요.",
      targetFiles: [...testFiles, exportPanelPath],
    }),
  ];

  return finalizeAxis("beginner-onboarding-ai-support", checks, {
    onboardingSteps: durations.length,
    totalOnboardingSec,
    supportFrontendComplete,
    apiFileCount: presentApiFiles.length,
  });
}

/** 축 7: 올인원 크리에이티브 깊이 */
export function scanAxis7AllInOneCreativeDepth(root) {
  const photoshopFiles = [
    "apps/web/src/domains/creator/photoshop-pro/photoshop-layer-fx-compositor.ts",
    "apps/web/src/domains/creator/photoshop-pro/photoshop-smart-object-stack.ts",
    "apps/web/src/domains/creator/photoshop-pro/photoshop-camera-raw-channels.ts",
    "apps/web/src/domains/creator/photoshop-pro/photoshop-retouch-frequency.ts",
    "apps/web/src/domains/creator/photoshop-pro/PhotoshopProStudioWorkbench.tsx",
  ];
  const photoshopHost = readText(root, "apps/web/src/domains/creator/StudioImageAdjustmentsPanel.tsx") ?? "";
  const photoshopPresent = photoshopFiles.filter((file) => fileExists(root, file));
  const photoshopWired = photoshopHost.includes("PhotoshopProStudioWorkbench");

  const aiSuiteFiles = [
    "apps/web/src/domains/creator/ai-creative-suites/canva-magic-studio-engine.ts",
    "apps/web/src/domains/creator/ai-creative-suites/figma-ai-layout-engine.ts",
    "apps/web/src/domains/creator/ai-creative-suites/tooning-plotr-story-engine.ts",
    "apps/web/src/domains/creator/ai-creative-suites/firefly-graph-relight-engine.ts",
    "apps/web/src/domains/creator/ai-creative-suites/csp-ai-smart-assist-engine.ts",
    "apps/web/src/domains/creator/ai-creative-suites/krita-comfy-live-canvas-engine.ts",
    "apps/web/src/domains/creator/ai-creative-suites/naver-ai-painter-engine.ts",
    "apps/web/src/domains/creator/ai-creative-suites/StudioDesignStoryAi4SuitesPanel.tsx",
    "apps/web/src/domains/creator/ai-creative-suites/StudioVisualAi4SuitesPanel.tsx",
  ];
  const aiSuitePresent = aiSuiteFiles.filter((file) => fileExists(root, file));
  const aiSuiteWired =
    (readText(root, "apps/web/src/domains/creator/studio-shell/StudioFreeAiAssistWorkbench.tsx") ?? "").includes(
      "StudioDesignStoryAi4SuitesPanel",
    ) &&
    (readText(root, "apps/web/src/domains/creator/ai-assist/StudioWebtoonModelerImageGenPanel.tsx") ?? "").includes(
      "StudioVisualAi4SuitesPanel",
    );

  const stage3dFiles = [
    "apps/web/src/domains/creator/stage-3d-compositor/stage-3d-bg-character-compositor.ts",
    "apps/web/src/domains/creator/stage-3d-compositor/stage-3d-compositor-catalog.ts",
    "apps/web/src/domains/creator/stage-3d-compositor/Studio3dBgCharacterCompositorPanel.tsx",
    "apps/web/src/domains/creator/studio-3d-pro/kwebtoon-npr-ink-contract.ts",
    "apps/web/src/domains/creator/studio-3d-pro/cascadeur-designdoll-rig-pro.ts",
    "apps/web/src/domains/creator/studio-3d-pro/blender-sketchup-vroid-pro-ops.ts",
  ];
  const stage3dPresent = stage3dFiles.filter((file) => fileExists(root, file));
  const stage3dWired = (
    readText(root, "apps/web/src/domains/creator/scene3d/StudioScene3dCutPanel.tsx") ?? ""
  ).includes("Studio3dBgCharacterCompositorPanel");

  const autoBgCrowdFiles = [
    "apps/web/src/domains/creator/auto-bg-crowd/auto-bg-crowd-engine.ts",
    "apps/web/src/domains/creator/auto-bg-crowd/auto-bg-crowd-backdrop-svg.ts",
    "apps/web/src/domains/creator/auto-bg-crowd/auto-bg-crowd-crowd-layer.ts",
    "apps/web/src/domains/creator/auto-bg-crowd/auto-bg-crowd-palettes.ts",
    "apps/web/src/domains/creator/auto-bg-crowd/StudioAutoBgCrowdDrawerPanel.tsx",
  ];
  const autoBgCrowdPresent = autoBgCrowdFiles.filter((file) => fileExists(root, file));
  const autoBgCrowdWired = (
    readText(root, "apps/web/src/domains/creator/StudioBackgroundPanel.tsx") ?? ""
  ).includes("StudioAutoBgCrowdDrawerPanel");

  const checks = [
    makeCheck({
      id: "photoshop-pro-suite",
      labelKo: "포토샵 프로 엔진(레이어 FX·스마트오브젝트·Camera Raw·주파수분리) 및 지연 연결",
      maxPoints: 2.5,
      earnedPoints: round1((photoshopPresent.length / photoshopFiles.length) * 2.0 + (photoshopWired ? 0.5 : 0)),
      evidence: `files=${photoshopPresent.length}/${photoshopFiles.length}, lazyWired=${photoshopWired}`,
      remediationKo: "apps/web/src/domains/creator/photoshop-pro 5대 모듈과 StudioImageAdjustmentsPanel 지연 연결을 복구하세요.",
      targetFiles: photoshopFiles,
    }),
    makeCheck({
      id: "eight-ai-creative-suites",
      labelKo: "8대 AI 크리에이티브 스위트(Canva·Figma·Tooning·Plotr·Firefly·CSP·Krita·네이버) 통합",
      maxPoints: 2.5,
      earnedPoints: round1((aiSuitePresent.length / aiSuiteFiles.length) * 2.0 + (aiSuiteWired ? 0.5 : 0)),
      evidence: `files=${aiSuitePresent.length}/${aiSuiteFiles.length}, lazyWired=${aiSuiteWired}`,
      remediationKo: "apps/web/src/domains/creator/ai-creative-suites 8대 AI 엔진 및 2개 지연 패널 연결을 완비하세요.",
      targetFiles: aiSuiteFiles,
    }),
    makeCheck({
      id: "stage-3d-bg-character-compositor",
      labelKo: "3D 배경+캐릭터 단일 잉크·접지·조명 합성 스테이지 & K-웹툰 3D 프로 엔진",
      maxPoints: 2.5,
      earnedPoints: round1((stage3dPresent.length / stage3dFiles.length) * 2.0 + (stage3dWired ? 0.5 : 0)),
      evidence: `files=${stage3dPresent.length}/${stage3dFiles.length}, lazyWired=${stage3dWired}`,
      remediationKo: "stage-3d-compositor 및 studio-3d-pro 모듈과 StudioScene3dCutPanel 지연 연결을 유지하세요.",
      targetFiles: stage3dFiles,
    }),
    makeCheck({
      id: "auto-bg-crowd-drawer",
      labelKo: "어울리는 투시 배경 및 3단 깊이 군중 자동 드로잉 엔진·UI 연결",
      maxPoints: 2.5,
      earnedPoints: round1((autoBgCrowdPresent.length / autoBgCrowdFiles.length) * 2.0 + (autoBgCrowdWired ? 0.5 : 0)),
      evidence: `files=${autoBgCrowdPresent.length}/${autoBgCrowdFiles.length}, lazyWired=${autoBgCrowdWired}`,
      remediationKo: "auto-bg-crowd 5대 모듈과 StudioBackgroundPanel 지연 연결을 유지하세요.",
      targetFiles: autoBgCrowdFiles,
    }),
  ];

  return finalizeAxis("all-in-one-creative-depth", checks, {
    photoshopPresent: photoshopPresent.length,
    aiSuitePresent: aiSuitePresent.length,
    stage3dPresent: stage3dPresent.length,
    autoBgCrowdPresent: autoBgCrowdPresent.length,
  });
}

/** 축 8: 스튜디오 분업 OS 완결성 */
export function scanAxis8StudioDivisionOs(root) {
  const base = "apps/web/src/domains/creator/production-hub/division-os";
  const cutSlicePath = `${base}/cut-slice-partition-stitch.ts`;
  const rbacPath = `${base}/layer-authority-rbac.ts`;
  const adQaPath = `${base}/ad-regulation-qa-engine.ts`;
  const royaltyPath = `${base}/studio-royalty-ledger.ts`;
  const forensicPath = `${base}/binary-lock-forensic-guard.ts`;
  const hubPath = `${base}/StudioDivisionOsHub.tsx`;
  const testPath = `${base}/studio-division-os.test.tsx`;
  const prodPagePath = "apps/web/src/domains/creator/production-hub/ProductionHubPage.tsx";

  const cutSliceSrc = readText(root, cutSlicePath) ?? "";
  const rbacSrc = readText(root, rbacPath) ?? "";
  const adQaSrc = readText(root, adQaPath) ?? "";
  const royaltySrc = readText(root, royaltyPath) ?? "";
  const forensicSrc = readText(root, forensicPath) ?? "";
  const prodPageSrc = readText(root, prodPagePath) ?? "";

  const cutSliceReady =
    cutSliceSrc.includes("previousCutContext") &&
    cutSliceSrc.includes("nextCutContext") &&
    cutSliceSrc.includes("CutSliceLease");

  const expectedRoles = [
    "pd", "art_director", "writer", "storyboard", "bg3d",
    "line", "flat", "shade", "finishing_lettering",
  ];
  const matchedRoles = expectedRoles.filter((role) => rbacSrc.includes(`"${role}"`));
  const has8Folders =
    rbacSrc.includes("00_CONTI") && rbacSrc.includes("60_LETTERING") && rbacSrc.includes("99_AD_REDLINE");

  const expectedQaChecks = [
    "oklch_color_chip",
    "line_weight_cv",
    "color_script_mood",
    "mobile_375_readability",
    "rights_bom_license",
  ];
  const matchedQaChecks = expectedQaChecks.filter((id) => adQaSrc.includes(`"${id}"`));

  const royaltyReady =
    royaltySrc.includes("studio-no9-cut-plus-royalty") &&
    royaltySrc.includes("korean-cp-mg-rs") &&
    royaltySrc.includes("withholding_3_3") &&
    royaltySrc.includes("corporate_vat_10");

  const forensicSignals = [
    forensicSrc.includes("embedForensicLsbWatermark"),
    forensicSrc.includes("extractForensicLsbWatermark"),
    forensicSrc.includes("checkoutBinaryAssetLock"),
    fileExists(root, hubPath) && fileExists(root, testPath) && prodPageSrc.includes("StudioDivisionOsHub"),
  ];
  const forensicSignalCount = forensicSignals.filter(Boolean).length;

  const checks = [
    makeCheck({
      id: "cut-slice-partition-stitch",
      labelKo: "컷 슬라이스 분할·리스·앞뒤 1컷 읽기 전용 컨텍스트·무손실 합본",
      maxPoints: 2.0,
      earnedPoints: cutSliceReady ? 2.0 : 0,
      evidence: `cutSliceReady=${cutSliceReady}`,
      remediationKo: "cut-slice-partition-stitch.ts에 슬라이스 리스 및 앞뒤 1컷 컨텍스트 합본 엔진을 유지하세요.",
      targetFiles: [cutSlicePath],
    }),
    makeCheck({
      id: "nine-role-rbac-matrix",
      labelKo: "9역할 직군 × 8레이어 폴더 Fail-Closed RBAC 권한 매트릭스",
      maxPoints: 2.0,
      earnedPoints: matchedRoles.length === 9 && has8Folders ? 2.0 : round1((matchedRoles.length / 9) * 1.5),
      evidence: `roles=${matchedRoles.length}/9, folders8=${has8Folders}`,
      remediationKo: "layer-authority-rbac.ts의 9직군(DIVISION_ROLE_IDS) × 8폴더 권한 매트릭스를 유지하세요.",
      targetFiles: [rbacPath],
    }),
    makeCheck({
      id: "ad-5-regulation-qa-engine",
      labelKo: "AD 5종 자동 검수(OKLCH 색칩·선폭 CV·컬러스크립트·375px 가독성·권리 BOM)",
      maxPoints: 2.0,
      earnedPoints: round1((matchedQaChecks.length / 5) * 2.0),
      evidence: `adChecks=${matchedQaChecks.length}/5`,
      remediationKo: "ad-regulation-qa-engine.ts의 5종 자동 검수 규칙과 99_AD_REDLINE 레드라인 레이어를 유지하세요.",
      targetFiles: [adQaPath],
    }),
    makeCheck({
      id: "royalty-settlement-ledger",
      labelKo: "Studio No.9 컷단가+인세 · 한국 CP MG+RS 정산 및 3.3%/VAT 원장",
      maxPoints: 2.0,
      earnedPoints: royaltyReady ? 2.0 : 0,
      evidence: `royaltyModesAndTax=${royaltyReady}`,
      remediationKo: "studio-royalty-ledger.ts의 2종 정산 모델과 세무 계산 로직을 유지하세요.",
      targetFiles: [royaltyPath],
    }),
    makeCheck({
      id: "binary-lock-forensic-watermark-hub",
      labelKo: "바이너리 체크아웃 락·LSB 포렌식 워터마크 및 ProductionHubPage 통합",
      maxPoints: 2.0,
      earnedPoints:
        forensicSrc.includes("embedForensicLsbWatermark")
          ? round1((forensicSignalCount / forensicSignals.length) * 2.0)
          : 0,
      evidence: `forensicWatermark=${forensicSrc.includes("embedForensicLsbWatermark")}, signals=${forensicSignalCount}/4`,
      remediationKo: "binary-lock-forensic-guard.ts의 LSB 워터마크·체크아웃 락과 StudioDivisionOsHub 지연 마운트를 유지하세요.",
      targetFiles: [forensicPath, hubPath, testPath, prodPagePath],
    }),
  ];

  return finalizeAxis("studio-division-os", checks, {
    rolesCount: matchedRoles.length,
    adQaCheckCount: matchedQaChecks.length,
    royaltyReady,
    forensicSignalCount,
  });
}

function measureEagerGraphData(root, eagerGraphOverride) {
  if (eagerGraphOverride) {
    return { source: "override", data: eagerGraphOverride };
  }
  const snapshotPath = resolvePath(root, "scripts/studio-eager-graph-snapshot.json");
  if (fs.existsSync(snapshotPath)) {
    return { source: "snapshot", data: JSON.parse(fs.readFileSync(snapshotPath, "utf8")) };
  }
  const eagerScriptPath = resolvePath(root, "scripts/check-studio-eager-graph.mjs");
  const mainEntryExists = fileExists(root, "apps/web/src/app/main.tsx");
  if (fs.existsSync(eagerScriptPath) && mainEntryExists) {
    try {
      const stdout = execFileSync(process.execPath, [eagerScriptPath, "--json", "--root", root], {
        encoding: "utf8",
        timeout: 25_000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { source: "live-eager-graph", data: JSON.parse(stdout) };
    } catch (error) {
      if (error && typeof error.stdout === "string" && error.stdout.trim().startsWith("{")) {
        try {
          return { source: "live-eager-graph", data: JSON.parse(error.stdout) };
        } catch {
          // JSON 파싱 실패 시 기준선 폴백으로 이동한다.
        }
      }
    }
  }
  const baselinePath = resolvePath(root, "scripts/studio-eager-graph-baseline.json");
  if (fs.existsSync(baselinePath)) {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    return {
      source: "baseline-fallback",
      data: {
        ok: true,
        totals: baseline.totals,
        entryTotals: baseline.entryTotals,
        lazyInvalidated: 0,
        opaqueDynamicImports: 0,
        violations: [],
      },
    };
  }
  return { source: "missing", data: null };
}

/** 축 9: 초기 진입 번들 속도 & 지연 경계 */
export function scanAxis9InitialBundleLazyBoundary(root, options = {}) {
  const { source, data } = measureEagerGraphData(root, options.eagerGraphOverride);
  const totalBytes = data?.totals?.bytes ?? null;
  const totalMiB = totalBytes !== null ? Math.round((totalBytes / BYTES_PER_MIB) * 100) / 100 : null;
  const lazyInvalidated = data?.lazyInvalidated ?? null;
  const opaqueDynamic = data?.opaqueDynamicImports ?? null;
  const ratchetOk = Boolean(data?.ok);
  const appShellBytes = data?.entryTotals?.["apps/web/src/app/main.tsx"]?.bytes ?? null;
  const appShellMiB = appShellBytes !== null ? Math.round((appShellBytes / BYTES_PER_MIB) * 100) / 100 : null;

  const authSessionPath = "apps/web/src/domains/auth/public/session/auth-session.tsx";
  const authSrc = readText(root, authSessionPath) ?? "";
  const deadlineMatch = authSrc.match(/INITIAL_SESSION_READY_DEADLINE_MS\s*=\s*([0-9_]+)/u);
  const sessionDeadlineMs = deadlineMatch ? Number(deadlineMatch[1].replaceAll("_", "")) : null;
  const sessionFast = sessionDeadlineMs !== null && sessionDeadlineMs > 0 && sessionDeadlineMs <= 3500;

  let bundlePoints = 0;
  if (totalBytes !== null) {
    if (totalBytes <= EAGER_GRAPH_MIB_LIMIT * BYTES_PER_MIB) bundlePoints = 4.0;
    else if (totalBytes <= EAGER_GRAPH_MIB_PARTIAL_LIMIT * BYTES_PER_MIB) bundlePoints = 2.0;
  }
  const appShellLean = appShellBytes !== null && appShellBytes <= APP_SHELL_MIB_LIMIT * BYTES_PER_MIB;

  const checks = [
    makeCheck({
      id: "eager-graph-under-17-5-mib",
      labelKo: `Studio 초기 정적 진입 그래프 <= ${EAGER_GRAPH_MIB_LIMIT} MiB`,
      maxPoints: 4.0,
      earnedPoints: bundlePoints,
      evidence:
        totalBytes !== null
          ? `${(totalBytes / BYTES_PER_MIB).toFixed(2)} MiB (${totalBytes.toLocaleString("en-US")} B, source=${source})`
          : "진입 그래프 측정 불가",
      remediationKo: `studio-eager-graph 총 도달 크기를 ${EAGER_GRAPH_MIB_LIMIT} MiB 이하로 줄이세요(무거운 패널은 React.lazy로 격리).`,
      targetFiles: ["scripts/check-studio-eager-graph.mjs", "scripts/studio-eager-graph-baseline.json"],
    }),
    makeCheck({
      id: "zero-lazy-invalidated",
      labelKo: "지연 경계 무효화(lazyInvalidated) 0건",
      maxPoints: 3.0,
      earnedPoints: lazyInvalidated === 0 ? 3.0 : 0,
      evidence: `lazyInvalidated=${lazyInvalidated}`,
      remediationKo: "정적 import로 지연 청크를 끌어온 경로를 제거해 lazyInvalidated를 0건으로 유지하세요.",
      targetFiles: ["scripts/check-studio-eager-graph.mjs"],
    }),
    makeCheck({
      id: "zero-opaque-dynamic-and-ratchet-ok",
      labelKo: "불투명 동적 import 0건 및 진입 그래프 래칫 PASS",
      maxPoints: 1.5,
      earnedPoints: opaqueDynamic === 0 && ratchetOk ? 1.5 : opaqueDynamic === 0 ? 0.7 : 0,
      evidence: `opaqueDynamic=${opaqueDynamic}, ratchetOk=${ratchetOk}`,
      remediationKo: "node scripts/check-studio-eager-graph.mjs 위반 사항을 해소하고 동적 import 경로를 정적 리터럴로 유지하세요.",
      targetFiles: ["scripts/check-studio-eager-graph.mjs"],
    }),
    makeCheck({
      id: "app-shell-lean-and-guest-3s",
      labelKo: "앱 셸 폐포 <= 1.5 MiB 및 게스트 비차단 세션 기한 <= 3.5초",
      maxPoints: 1.5,
      earnedPoints:
        appShellLean && sessionFast ? 1.5 : (appShellLean ? 0.8 : 0) + (sessionFast ? 0.7 : 0),
      evidence: `appShell=${appShellMiB ?? "?"} MiB, sessionDeadline=${sessionDeadlineMs ?? "?"}ms`,
      remediationKo: "apps/web/src/app/main.tsx 초기 폐포를 1.5 MiB 이하로, INITIAL_SESSION_READY_DEADLINE_MS를 3500ms 이하로 유지하세요.",
      targetFiles: ["apps/web/src/app/main.tsx", authSessionPath],
    }),
  ];

  return finalizeAxis("initial-bundle-lazy-boundary", checks, {
    measurementSource: source,
    totalBytes,
    totalMiB,
    lazyInvalidated,
    opaqueDynamic,
    ratchetOk,
    appShellMiB,
    sessionDeadlineMs,
  });
}

/** 축 10: 로컬 ₩0 풀스택·무과금 AI 가드 완결성 */
export function scanAxis10LocalZeroCostAiGuard(root) {
  const emulatorPath = "scripts/local-object-storage-emulator.mjs";
  const emulatorTestPath = "scripts/local-object-storage-emulator.test.mjs";
  const seedPath = "scripts/local-studio-seed-pack.mjs";
  const seedTestPath = "scripts/local-studio-seed-pack.test.mjs";
  const zeroCostPath = "scripts/verify-free-ai-assist-zero-cost.mjs";
  const cascadePath = "apps/web/src/shared/ai/free-ai-zero-bill-cascade.ts";
  const cascadeTestPath = "apps/web/src/shared/ai/free-ai-zero-bill-cascade.test.ts";
  const localStackPath = "scripts/local-test-stack.mjs";
  const localSmokePath = "scripts/verify-local-full-stack.mjs";

  const emulatorSrc = readText(root, emulatorPath) ?? "";
  const seedSrc = readText(root, seedPath) ?? "";
  const zeroCostSrc = readText(root, zeroCostPath) ?? "";
  const cascadeSrc = readText(root, cascadePath) ?? "";

  const emulatorSignals = [
    emulatorSrc.includes("assertLoopbackStorageHost"),
    emulatorSrc.includes("resolveConfinedPath"),
    emulatorSrc.includes("verifyLocalObjectStorageRoundTrip"),
    fileExists(root, emulatorTestPath),
  ];
  const emulatorScore = round1((emulatorSignals.filter(Boolean).length / emulatorSignals.length) * 2.5);

  const seedSignals = [
    seedSrc.includes("isRemoteStudioDatabaseUrl"),
    seedSrc.includes("assertLocalStudioSeedAllowed"),
    seedSrc.includes("STUDIO_SEED_TEAM_MEMBERS"),
    seedSrc.includes("validateCutSlicePartition"),
    seedSrc.includes("redactStudioDatabaseUrl"),
    fileExists(root, seedTestPath),
  ];
  const seedScore = round1((seedSignals.filter(Boolean).length / seedSignals.length) * 2.5);

  const zeroCostSignals = [
    /MAX_PROBE_TOKENS\s*=\s*32/u.test(zeroCostSrc),
    /SAFETY_CUTOFF_RATIO\s*=\s*0\.9/u.test(zeroCostSrc),
    zeroCostSrc.includes("WHITELISTS"),
    zeroCostSrc.includes("402") && zeroCostSrc.includes("429"),
    zeroCostSrc.includes("billing_hard_limit") && zeroCostSrc.includes("insufficient_quota"),
  ];
  const zeroCostScore = round1((zeroCostSignals.filter(Boolean).length / zeroCostSignals.length) * 2.5);

  const cascadeSignals = [
    cascadeSrc.includes("402") && cascadeSrc.includes("429"),
    fileExists(root, cascadeTestPath),
    fileExists(root, localStackPath),
    fileExists(root, localSmokePath),
  ];
  const cascadeScore = round1((cascadeSignals.filter(Boolean).length / cascadeSignals.length) * 2.5);

  const checks = [
    makeCheck({
      id: "local-object-storage-emulator",
      labelKo: "루프백 전용 ₩0 로컬 오브젝트 스토리지 에뮬레이터 및 격리 테스트",
      maxPoints: 2.5,
      earnedPoints: emulatorScore,
      evidence: `signals=${emulatorSignals.filter(Boolean).length}/${emulatorSignals.length}`,
      remediationKo: "scripts/local-object-storage-emulator.mjs의 루프백 가드·경로 탈출 차단·왕복 검증 및 테스트를 유지하세요.",
      targetFiles: [emulatorPath, emulatorTestPath],
    }),
    makeCheck({
      id: "local-studio-seed-pack",
      labelKo: "원격 DB 차단 가드·6인 분업 3화 9슬라이스 로컬 시드팩 및 테스트",
      maxPoints: 2.5,
      earnedPoints: seedScore,
      evidence: `signals=${seedSignals.filter(Boolean).length}/${seedSignals.length}`,
      remediationKo: "scripts/local-studio-seed-pack.mjs의 원격 DB 차단 가드·컷 슬라이스 검증·자격증명 마스킹 및 테스트를 유지하세요.",
      targetFiles: [seedPath, seedTestPath],
    }),
    makeCheck({
      id: "free-ai-zero-cost-guard-script",
      labelKo: "무과금 AI ₩0 Fail-Closed 검증기(max_tokens=32 · 90% 안전선 · 402/429 차단)",
      maxPoints: 2.5,
      earnedPoints: zeroCostScore,
      evidence: `signals=${zeroCostSignals.filter(Boolean).length}/${zeroCostSignals.length}`,
      remediationKo: "scripts/verify-free-ai-assist-zero-cost.mjs의 화이트리스트·90% 안전선·HTTP 402/429 Fail-Closed 차단을 유지하세요.",
      targetFiles: [zeroCostPath],
    }),
    makeCheck({
      id: "zero-bill-cascade-and-local-stack",
      labelKo: "클라이언트 ₩0 AI 페일오버 캐스케이드 및 로컬 풀스택 기동·스모크 스크립트",
      maxPoints: 2.5,
      earnedPoints: cascadeScore,
      evidence: `signals=${cascadeSignals.filter(Boolean).length}/${cascadeSignals.length}`,
      remediationKo: "free-ai-zero-bill-cascade.ts(및 테스트)와 local-test-stack.mjs·verify-local-full-stack.mjs를 유지하세요.",
      targetFiles: [cascadePath, cascadeTestPath, localStackPath, localSmokePath],
    }),
  ];

  return finalizeAxis("local-zero-cost-ai-guard", checks, {
    emulatorScore,
    seedScore,
    zeroCostScore,
    cascadeScore,
  });
}
