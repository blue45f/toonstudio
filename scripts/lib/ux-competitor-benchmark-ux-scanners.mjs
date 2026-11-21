/**
 * ToonStudio UI/UX 벤치마크 축 1~5(GNB/LNB·모바일·멀티디바이스·최소입력 AI·OKLCH 스펙트럼) 실측 스캐너 및 공통 유틸.
 */
import fs from "node:fs";
import path from "node:path";

import { AXIS_MAX_SCORE, UX_BENCHMARK_AXES, round1 } from "./ux-competitor-benchmark-rubric.mjs";

export const CORE_SHELL_CSS_FILES = [
  "apps/web/src/shared/components/workspace/workspace-visual-v3.css",
  "apps/web/src/shared/components/workspace/workspace-redesign.css",
  "apps/web/src/shared/components/site-menu.css",
  "apps/web/src/app/styles/mobile-first-shell.css",
];

const EXTRA_UX_CSS_FILES = [
  "apps/web/src/app/styles/design-themes.css",
  "apps/web/src/domains/creator/nextgen-web-platform/nextgen-web-platform.css",
];

const SPECTRUM_TOKENS = [
  "--ts-spectrum-creation",
  "--ts-spectrum-3d",
  "--ts-spectrum-collab",
  "--ts-spectrum-market",
  "--ts-spectrum-support",
];

export function resolvePath(root, relPath) {
  return path.join(root, relPath);
}

export function fileExists(root, relPath) {
  return fs.existsSync(resolvePath(root, relPath));
}

export function readText(root, relPath) {
  const fullPath = resolvePath(root, relPath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, "utf8");
}

export function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//gu, "");
}

export function findRawHexLiterals(css) {
  const cleaned = stripCssComments(css).replace(/url\((?:[^)(]+|\([^)(]*\))*\)/giu, "url()");
  const matches = [];
  const pattern = /(?:^|[:(\s,"'])(#[0-9a-fA-F]{3,8})(?![-\w])(?!\s*[{>+~])/gu;
  for (const match of cleaned.matchAll(pattern)) {
    matches.push(match[1]);
  }
  return matches;
}

export function findTransitionAllViolations(source) {
  const cleaned = stripCssComments(source);
  const cssMatches = cleaned.match(/transition\s*:\s*[^;{}]*\ball\b/giu) ?? [];
  const twMatches = cleaned.match(/\btransition-all\b/gu) ?? [];
  return [...cssMatches, ...twMatches];
}

export function hasUnpairedBackdropFilter(css) {
  const cleaned = stripCssComments(css);
  const decls = cleaned.match(/(?<![-\w])backdrop-filter\s*:\s*([^;{}]+)/giu) ?? [];
  const activeDecls = decls.filter((decl) => !/:\s*none\b/iu.test(decl));
  if (activeDecls.length === 0) return false;
  return !/-webkit-backdrop-filter\s*:/iu.test(cleaned);
}

export function makeCheck({
  id,
  labelKo,
  maxPoints,
  earnedPoints,
  evidence,
  remediationKo = "",
  targetFiles = [],
}) {
  const clamped = round1(Math.max(0, Math.min(maxPoints, earnedPoints)));
  const passed = clamped >= maxPoints;
  return {
    id,
    labelKo,
    maxPoints,
    earnedPoints: clamped,
    passed,
    evidence,
    ...(passed ? {} : { remediationKo, targetFiles }),
  };
}

export function finalizeAxis(axisId, checks, rawMetrics = {}) {
  const meta = UX_BENCHMARK_AXES.find((item) => item.id === axisId);
  const rawTotal = checks.reduce((sum, check) => sum + check.earnedPoints, 0);
  const score = round1(Math.max(0, Math.min(AXIS_MAX_SCORE, rawTotal)));
  const remediations = checks
    .filter((check) => !check.passed)
    .map((check) => ({
      axisId,
      axisOrder: meta?.order ?? 0,
      axisTitleKo: meta?.titleKo ?? axisId,
      checkId: check.id,
      checkLabelKo: check.labelKo,
      potentialGain: round1(check.maxPoints - check.earnedPoints),
      actionKo: check.remediationKo,
      targetFiles: check.targetFiles ?? [],
    }));
  return {
    axisId,
    order: meta?.order ?? 0,
    titleKo: meta?.titleKo ?? axisId,
    shortKo: meta?.shortKo ?? axisId,
    score,
    maxScore: AXIS_MAX_SCORE,
    status: score >= 9.5 ? "PASS" : "NEEDS_IMPROVEMENT",
    checks,
    rawMetrics,
    remediations,
  };
}

/** 축 1: GNB·LNB 통일성 및 5단계 창작 여정 명확성 */
export function scanAxis1GnbLnbJourney(root) {
  const navPath = "apps/web/src/shared/components/site-navigation.ts";
  const navSrc = readText(root, navPath);
  const hasUnifiedGroups = Boolean(
    navSrc &&
    navSrc.includes("SITE_NAVIGATION_GROUPS") &&
    navSrc.includes("TOONSTUDIO_NAVIGATION_GROUPS = SITE_NAVIGATION_GROUPS") &&
    navSrc.includes("TOONSPECTRUM_NAVIGATION_GROUPS = SITE_NAVIGATION_GROUPS"),
  );
  const journeys = ["start", "create", "publish", "collaborate", "rest"];
  const journeyCount = navSrc
    ? journeys.filter((token) => new RegExp(`["']${token}["']`, "u").test(navSrc)).length
    : 0;

  const shellNavFiles = [
    "apps/web/src/shared/components/workspace/WorkspaceNavigation.tsx",
    "apps/web/src/shared/components/workspace/WorkspaceMenuNavigation.tsx",
    "apps/web/src/shared/components/SiteMenuDestinations.tsx",
    "apps/web/src/shared/components/site-header-mobile-nav.tsx",
    "apps/web/src/shared/components/workspace/workspace-navigation-model.ts",
  ];
  const presentShellNav = shellNavFiles.filter((file) => fileExists(root, file));
  const navTests = [
    "apps/web/src/shared/components/site-navigation-renderer-equivalence.test.ts",
    "apps/web/src/shared/components/workspace/WorkspaceChrome.menu-boundary.test.tsx",
  ];
  const presentNavTests = navTests.filter((file) => fileExists(root, file));

  const mapPath = "apps/web/src/shared/components/workspace/page-role-journey-map.ts";
  const mapSrc = readText(root, mapPath);
  const accentTones = ["creation", "three-d", "collab", "market", "support"];
  const mapToneCount = mapSrc
    ? accentTones.filter((tone) => mapSrc.includes(tone)).length
    : 0;
  const mapCoreRoutesPresent = mapSrc
    ? ["/studio", "/production", "/market"].every((route) => mapSrc.includes(route)) &&
      (mapSrc.includes("/creator-support") || mapSrc.includes("/support"))
    : false;
  const mapMetaComplete = Boolean(
    mapSrc &&
    mapSrc.includes("stageNumber") &&
    mapSrc.includes("roleHeadlineKo") &&
    mapSrc.includes("recommendedNextSteps") &&
    mapToneCount === 5 &&
    mapCoreRoutesPresent,
  );

  const navigatorPath = "apps/web/src/shared/components/workspace/PageRoleAndJourneyNavigator.tsx";
  const navigatorTestPath = "apps/web/src/shared/components/workspace/PageRoleAndJourneyNavigator.test.tsx";
  const taskFramePath = "apps/web/src/shared/components/workspace/WorkspaceTaskFrame.tsx";
  const navigatorSrc = readText(root, navigatorPath);
  const taskFrameSrc = readText(root, taskFramePath);
  const navigatorWired = Boolean(
    navigatorSrc &&
    fileExists(root, navigatorTestPath) &&
    taskFrameSrc &&
    taskFrameSrc.includes("PageRoleAndJourneyNavigator"),
  );

  const checks = [
    makeCheck({
      id: "single-canonical-nav-map",
      labelKo: "단일 정본 내비게이션 지도 및 5단계 여정 축 정의",
      maxPoints: 2.5,
      earnedPoints: hasUnifiedGroups && journeyCount === 5 ? 2.5 : hasUnifiedGroups ? 1.5 : 0,
      evidence: `unifiedGroups=${hasUnifiedGroups}, journeys=${journeyCount}/5`,
      remediationKo: "site-navigation.ts에 단일 정본 지도(SITE_NAVIGATION_GROUPS)와 5단계 여정 축을 유지하세요.",
      targetFiles: [navPath],
    }),
    makeCheck({
      id: "gnb-lnb-mobile-parity",
      labelKo: "PC GNB·LNB·모바일 메뉴 정본 동등성 컴포넌트 및 계약 테스트",
      maxPoints: 2.5,
      earnedPoints:
        presentShellNav.length === shellNavFiles.length && presentNavTests.length === navTests.length
          ? 2.5
          : round1((presentShellNav.length / shellNavFiles.length) * 1.5 + (presentNavTests.length / navTests.length)),
      evidence: `shellNav=${presentShellNav.length}/${shellNavFiles.length}, navContractTests=${presentNavTests.length}/${navTests.length}`,
      remediationKo: "WorkspaceNavigation·SiteMenuDestinations·site-header-mobile-nav와 동등성 계약 테스트를 모두 유지하세요.",
      targetFiles: [...shellNavFiles, ...navTests],
    }),
    makeCheck({
      id: "page-role-journey-map",
      labelKo: "페이지별 역할·5단계 여정·다음 추천 동선 단일 지도(page-role-journey-map.ts)",
      maxPoints: 2.5,
      earnedPoints: mapMetaComplete ? 2.5 : mapSrc ? 1.0 : 0,
      evidence: `exists=${Boolean(mapSrc)}, tones=${mapToneCount}/5, coreRoutes=${mapCoreRoutesPresent}`,
      remediationKo: "apps/web/src/shared/components/workspace/page-role-journey-map.ts에 5단계 여정·roleHeadlineKo·recommendedNextSteps·5색 accentTone(/studio·/production·/market·/creator-support)을 정의하세요.",
      targetFiles: [mapPath],
    }),
    makeCheck({
      id: "page-role-journey-navigator-wired",
      labelKo: "페이지 역할 & 다음 동선 칩 내비게이터 구현 및 WorkspaceTaskFrame 연결",
      maxPoints: 2.5,
      earnedPoints: navigatorWired ? 2.5 : navigatorSrc ? 1.0 : 0,
      evidence: `component=${Boolean(navigatorSrc)}, test=${fileExists(root, navigatorTestPath)}, frameWired=${Boolean(taskFrameSrc?.includes("PageRoleAndJourneyNavigator"))}`,
      remediationKo: "PageRoleAndJourneyNavigator.tsx와 테스트를 추가하고 WorkspaceTaskFrame.tsx에 연결해 현재 단계·역할 한 줄·다음 동선 칩을 노출하세요.",
      targetFiles: [navigatorPath, navigatorTestPath, taskFramePath],
    }),
  ];

  return finalizeAxis("gnb-lnb-journey", checks, {
    hasUnifiedGroups,
    journeyCount,
    mapMetaComplete,
    navigatorWired,
  });
}

/** 축 2: 모바일(320~430px) 엄지 UX & 가로 오버플로 0px */
export function scanAxis2MobileThumbUx(root) {
  const mobileCssPath = "apps/web/src/app/styles/mobile-first-shell.css";
  const visualV3Path = "apps/web/src/shared/components/workspace/workspace-visual-v3.css";
  const redesignPath = "apps/web/src/shared/components/workspace/workspace-redesign.css";
  const nextgenCssPath = "apps/web/src/domains/creator/nextgen-web-platform/nextgen-web-platform.css";
  const mobileDockPath = "apps/web/src/domains/creator/nextgen-web-platform/beginner-onboarding-mobile-dock.ts";
  const mobileNavTsxPath = "apps/web/src/shared/components/site-header-mobile-nav.tsx";

  const mobileCss = readText(root, mobileCssPath) ?? "";
  const visualV3 = readText(root, visualV3Path) ?? "";
  const redesign = readText(root, redesignPath) ?? "";
  const mobileDock = readText(root, mobileDockPath) ?? "";
  const mobileNavTsx = readText(root, mobileNavTsxPath) ?? "";

  const hasTouchTargetCss =
    /min-(?:height|block-size)\s*:\s*(?:4[4-9]|[5-9]\d)px/iu.test(mobileCss) &&
    /min-height\s*:\s*(?:4[4-9]|[5-9]\d)px/iu.test(visualV3);
  const hasDock44 =
    /MOBILE_THUMB_DOCK_MIN_TOUCH_TARGET_PX\s*=\s*44/u.test(mobileDock) &&
    mobileDock.includes("MOBILE_THUMB_DOCK_ACTIONS");
  const sub44Violations = mobileNavTsx.match(/\bmin-h-(?:6|7|8|9|10)\b/gu) ?? [];

  const safeAreaFiles = [mobileCssPath, visualV3Path, redesignPath, nextgenCssPath];
  const safeAreaCovered = safeAreaFiles.filter((file) =>
    (readText(root, file) ?? "").includes("safe-area-inset-bottom"),
  );

  const mobileClip = /overflow-x\s*:\s*clip/iu.test(mobileCss);
  const visualClip = /overflow-x\s*:\s*clip/iu.test(visualV3);
  const hasTouchManipulation = mobileCss.includes("touch-action: manipulation");

  const has5TabDock =
    /grid-template-columns\s*:\s*repeat\(\s*5\s*,/iu.test(visualV3) &&
    /grid-template-columns\s*:\s*repeat\(\s*5\s*,/iu.test(redesign) &&
    mobileNavTsx.includes("mobileSiteTabsForPath");
  const hasKeepAll = /word-break\s*:\s*keep-all/iu.test(mobileCss);

  const mobileA11yTests = [
    "apps/web/src/shared/components/site-shell-mobile-accessibility.test.tsx",
    "apps/web/src/shared/components/site-mobile-purpose.test.ts",
  ];
  const presentMobileTests = mobileA11yTests.filter((file) => fileExists(root, file));
  const spectrumContractPath =
    "apps/web/src/shared/components/workspace/multidevice-spectrum-ux.contract.test.ts";
  const hasSpectrumContract = fileExists(root, spectrumContractPath);

  const checks = [
    makeCheck({
      id: "mobile-touch-target-44px",
      labelKo: "모바일 44px+ 터치 타깃 및 320~430px 엄지 독 계약 준수",
      maxPoints: 2.5,
      earnedPoints:
        hasTouchTargetCss && hasDock44 && sub44Violations.length === 0
          ? 2.5
          : (hasTouchTargetCss ? 1.0 : 0) + (hasDock44 ? 1.0 : 0) - (sub44Violations.length > 0 ? 1.0 : 0),
      evidence: `css44px=${hasTouchTargetCss}, dock44px=${hasDock44}, sub44Violations=${sub44Violations.length}`,
      remediationKo: "모바일 셸 CSS와 엄지 독에서 44px 이상 터치 타깃을 유지하고 min-h-6..10 사용을 제거하세요.",
      targetFiles: [mobileCssPath, visualV3Path, mobileDockPath, mobileNavTsxPath],
    }),
    makeCheck({
      id: "safe-area-inset-bottom",
      labelKo: "노치·홈 인디케이터 안전 영역(env(safe-area-inset-bottom)) 4대 CSS 적용",
      maxPoints: 2.0,
      earnedPoints: round1((safeAreaCovered.length / safeAreaFiles.length) * 2.0),
      evidence: `safeAreaFiles=${safeAreaCovered.length}/${safeAreaFiles.length}`,
      remediationKo: "mobile-first-shell.css·workspace-visual-v3.css·workspace-redesign.css·nextgen-web-platform.css 모두에 env(safe-area-inset-bottom) 패딩을 보장하세요.",
      targetFiles: safeAreaFiles.filter((file) => !safeAreaCovered.includes(file)),
    }),
    makeCheck({
      id: "horizontal-overflow-zero-clip",
      labelKo: "모바일 가로 오버플로 0px(overflow-x: clip) 및 터치 반응성 가드",
      maxPoints: 2.0,
      earnedPoints:
        mobileClip && visualClip && hasTouchManipulation
          ? 2.0
          : (visualClip ? 0.8 : 0) + (mobileClip ? 0.8 : 0) + (hasTouchManipulation ? 0.4 : 0),
      evidence: `mobileCssClip=${mobileClip}, visualV3Clip=${visualClip}, touchManipulation=${hasTouchManipulation}`,
      remediationKo: "apps/web/src/app/styles/mobile-first-shell.css에 overflow-x: clip 규칙을 추가해 320~430px 뷰포트 가로 오버플로 0px을 보장하세요.",
      targetFiles: [mobileCssPath, visualV3Path],
    }),
    makeCheck({
      id: "mobile-5tab-thumb-dock",
      labelKo: "하단 5탭 엄지 독 그리드 및 한글 어절 줄바꿈(word-break: keep-all)",
      maxPoints: 2.0,
      earnedPoints: has5TabDock && hasKeepAll ? 2.0 : has5TabDock ? 1.4 : hasKeepAll ? 0.6 : 0,
      evidence: `fiveTabDock=${has5TabDock}, keepAll=${hasKeepAll}`,
      remediationKo: "하단 5탭 그리드(repeat(5, minmax(0, 1fr)))와 모바일 한글 keep-all 규칙을 유지하세요.",
      targetFiles: [visualV3Path, redesignPath, mobileCssPath, mobileNavTsxPath],
    }),
    makeCheck({
      id: "mobile-contract-tests",
      labelKo: "모바일 접근성·멀티디바이스 스펙트럼 계약 테스트 확보",
      maxPoints: 1.5,
      earnedPoints: round1(
        (presentMobileTests.length / mobileA11yTests.length) * 0.7 + (hasSpectrumContract ? 0.8 : 0),
      ),
      evidence: `mobileA11yTests=${presentMobileTests.length}/${mobileA11yTests.length}, multideviceSpectrumContract=${hasSpectrumContract}`,
      remediationKo: "apps/web/src/shared/components/workspace/multidevice-spectrum-ux.contract.test.ts를 추가해 모바일 44px·320~767px 계약을 자동 검증하세요.",
      targetFiles: [spectrumContractPath, ...mobileA11yTests],
    }),
  ];

  return finalizeAxis("mobile-thumb-ux", checks, {
    hasTouchTargetCss,
    hasDock44,
    sub44ViolationCount: sub44Violations.length,
    safeAreaCoveredCount: safeAreaCovered.length,
    mobileClip,
    visualClip,
    hasSpectrumContract,
  });
}

/** 축 3: 태블릿(768~1279px) · PC(>= 1280px) 멀티디바이스 일관성 */
export function scanAxis3MultideviceConsistency(root) {
  const visualV3Path = "apps/web/src/shared/components/workspace/workspace-visual-v3.css";
  const redesignPath = "apps/web/src/shared/components/workspace/workspace-redesign.css";
  const siteMenuCssPath = "apps/web/src/shared/components/site-menu.css";
  const mobileCssPath = "apps/web/src/app/styles/mobile-first-shell.css";

  const visualV3 = readText(root, visualV3Path) ?? "";
  const redesign = readText(root, redesignPath) ?? "";
  const siteMenuCss = readText(root, siteMenuCssPath) ?? "";
  const mobileCss = readText(root, mobileCssPath) ?? "";
  const combinedShellCss = `${visualV3}\n${redesign}\n${siteMenuCss}\n${mobileCss}`;

  const hasPc1280 = /min-width\s*:\s*1280px/iu.test(visualV3);
  const hasLegacy1181 = visualV3.includes("1181px");
  const hasCoarsePointer44 = /pointer\s*:\s*coarse/iu.test(visualV3);

  const hasTabletBand =
    /min-width\s*:\s*768px[\s\S]{0,40}max-width\s*:\s*1279px/iu.test(combinedShellCss);
  const hasMobileBand = /max-width\s*:\s*767px/iu.test(combinedShellCss);

  const hasLayoutTokens =
    combinedShellCss.includes("--layout-rail-icon") &&
    combinedShellCss.includes("--layout-rail-row") &&
    combinedShellCss.includes("100dvh");
  const allShellCssPresent = CORE_SHELL_CSS_FILES.every((file) => fileExists(root, file));

  const existingContractFiles = [
    "apps/web/src/shared/components/workspace/sitewide-visual-v3.contract.test.ts",
    "apps/web/src/app/styles/layout-token-contract.contract.test.ts",
    "apps/web/src/shared/components/workspace/WorkspaceContextPanel.adaptive.test.tsx",
    "scripts/audit-sitewide-visual-ux.mjs",
  ];
  const presentExistingContracts = existingContractFiles.filter((file) => fileExists(root, file));
  const spectrumContractPath =
    "apps/web/src/shared/components/workspace/multidevice-spectrum-ux.contract.test.ts";
  const hasSpectrumContract = fileExists(root, spectrumContractPath);

  const checks = [
    makeCheck({
      id: "pc-1280px-rail-and-coarse-hybrid",
      labelKo: "PC(>= 1280px) 좌측 레일 표준화 및 터치 겸용(pointer: coarse) 44px 보장",
      maxPoints: 2.5,
      earnedPoints:
        hasPc1280 && !hasLegacy1181 && hasCoarsePointer44
          ? 2.5
          : (hasPc1280 ? 1.5 : 0) + (hasCoarsePointer44 ? 0.5 : 0) - (hasLegacy1181 ? 1.0 : 0),
      evidence: `pc1280=${hasPc1280}, legacy1181=${hasLegacy1181}, coarsePointer=${hasCoarsePointer44}`,
      remediationKo: "workspace-visual-v3.css에 @media (min-width: 1280px) 표준 레일과 pointer: coarse 44px 규칙을 유지하고 구형 1181px를 제거하세요.",
      targetFiles: [visualV3Path],
    }),
    makeCheck({
      id: "tablet-768-1279px-band",
      labelKo: "태블릿 전용 구간(768px~1279px) 반응형 레이아웃 규칙",
      maxPoints: 2.5,
      earnedPoints: hasTabletBand ? 2.5 : 0,
      evidence: `tabletBand768To1279=${hasTabletBand}`,
      remediationKo: "workspace-redesign.css 또는 workspace-visual-v3.css에 @media (min-width: 768px) and (max-width: 1279px) 태블릿 균형 규칙을 정의하세요.",
      targetFiles: [redesignPath, visualV3Path],
    }),
    makeCheck({
      id: "three-tier-responsive-shell",
      labelKo: "PC·태블릿·모바일 3단 뷰포트 및 공통 레일 토큰(--layout-rail-*) 일관성",
      maxPoints: 2.5,
      earnedPoints:
        allShellCssPresent && hasPc1280 && hasTabletBand && hasMobileBand && hasLayoutTokens
          ? 2.5
          : (allShellCssPresent ? 1.0 : 0) + (hasLayoutTokens ? 1.0 : 0),
      evidence: `shellCss=${allShellCssPresent}, mobile=${hasMobileBand}, tablet=${hasTabletBand}, pc=${hasPc1280}, layoutTokens=${hasLayoutTokens}`,
      remediationKo: "4대 셸 CSS에서 3단 뷰포트 브레이크포인트와 --layout-rail-icon/--layout-rail-row/100dvh 토큰을 일관 적용하세요.",
      targetFiles: CORE_SHELL_CSS_FILES,
    }),
    makeCheck({
      id: "multidevice-contract-suite",
      labelKo: "멀티디바이스 시각·레이아웃 계약 테스트 및 전수 감사 스크립트",
      maxPoints: 2.5,
      earnedPoints: round1(
        (presentExistingContracts.length / existingContractFiles.length) * 1.5 +
          (hasSpectrumContract ? 1.0 : 0),
      ),
      evidence: `existingContracts=${presentExistingContracts.length}/${existingContractFiles.length}, multideviceSpectrumContract=${hasSpectrumContract}`,
      remediationKo: "apps/web/src/shared/components/workspace/multidevice-spectrum-ux.contract.test.ts를 추가해 3단 브레이크포인트 계약을 잠그세요.",
      targetFiles: [spectrumContractPath, ...existingContractFiles],
    }),
  ];

  return finalizeAxis("multidevice-consistency", checks, {
    hasPc1280,
    hasTabletBand,
    hasMobileBand,
    hasCoarsePointer44,
    hasSpectrumContract,
  });
}

/** 축 4: 필수항목 최소화(<= 2개) & AI 원클릭 자동 채우기 */
export function scanAxis4MinimalFormAiAutofill(root) {
  const schemasPath = "apps/web/src/domains/creator/smart-form-autofill/smart-form-workflow-schemas.ts";
  const enginePath = "apps/web/src/domains/creator/smart-form-autofill/minimal-required-form-engine.ts";
  const cardPath = "apps/web/src/domains/creator/smart-form-autofill/StudioSmartAutofillAssistantCard.tsx";
  const testPath = "apps/web/src/domains/creator/smart-form-autofill/__tests__/smart-form-autofill.test.tsx";
  const stripPath = "apps/web/src/domains/creator/studio-shell/StudioCreateQuickPresetStrip.tsx";

  const schemasSrc = readText(root, schemasPath) ?? "";
  const engineSrc = readText(root, enginePath) ?? "";
  const cardSrc = readText(root, cardPath) ?? "";
  const stripSrc = readText(root, stripPath) ?? "";

  const maxReqMatch = schemasSrc.match(/MAX_REQUIRED_FIELDS\s*=\s*(\d+)/u);
  const maxRequiredConst = maxReqMatch ? Number(maxReqMatch[1]) : null;

  const expectedWorkflows = [
    "project-create",
    "episode-publish",
    "export-release",
    "team-division-invite",
    "support-inquiry",
  ];
  const presentWorkflows = expectedWorkflows.filter((id) => schemasSrc.includes(`"${id}"`));

  const requiredBlockMatches = [
    ...schemasSrc.matchAll(/requiredFields\s*:\s*\[([\s\S]*?)\]\s*,\s*optionalFields\s*:\s*\[([\s\S]*?)\]/gu),
  ];
  const parsedWorkflowCounts = requiredBlockMatches.map((match) => ({
    required: (match[1].match(/\bdefineField\(/gu) ?? []).length,
    optional: (match[2].match(/\bdefineField\(/gu) ?? []).length,
  }));
  const allRequiredWithinLimit =
    parsedWorkflowCounts.length >= 5 &&
    parsedWorkflowCounts.every((entry) => entry.required >= 1 && entry.required <= 2);
  const allOptionalRich =
    parsedWorkflowCounts.length >= 5 &&
    parsedWorkflowCounts.every((entry) => entry.optional >= 6);

  const engineAndUiReady = Boolean(
    engineSrc.includes("generateSmartFormRecommendations") &&
    engineSrc.includes("applySmartFormRecommendations") &&
    engineSrc.includes("undoSmartFormAutofill") &&
    cardSrc.includes("smart-form-autofill-btn") &&
    cardSrc.includes("min-h-11") &&
    findRawHexLiterals(cardSrc).length === 0 &&
    findTransitionAllViolations(cardSrc).length === 0,
  );

  const lazyWired = Boolean(
    stripSrc.includes("StudioSmartAutofillAssistantCard") &&
    /React\.lazy\s*\(|lazy\s*\(/u.test(stripSrc) &&
    !/import\s+[\s\S]*from\s+["']\.\.\/smart-form-autofill/u.test(stripSrc) &&
    fileExists(root, testPath),
  );

  const checks = [
    makeCheck({
      id: "max-required-fields-le-2",
      labelKo: "전 워크플로 필수항목 2개 이하(<= 2) 및 선택항목 6개+ 자동 보강 계약",
      maxPoints: 2.5,
      earnedPoints:
        maxRequiredConst !== null && maxRequiredConst <= 2 && allRequiredWithinLimit && allOptionalRich
          ? 2.5
          : maxRequiredConst !== null && maxRequiredConst <= 2 && allRequiredWithinLimit
            ? 1.5
            : 0,
      evidence: `MAX_REQUIRED_FIELDS=${maxRequiredConst}, parsedWorkflows=${parsedWorkflowCounts.length}, allRequired<=2=${allRequiredWithinLimit}, allOptional>=6=${allOptionalRich}`,
      remediationKo: "smart-form-workflow-schemas.ts의 MAX_REQUIRED_FIELDS <= 2를 유지하고 모든 워크플로의 필수 입력을 1~2개로 제한하세요.",
      targetFiles: [schemasPath],
    }),
    makeCheck({
      id: "five-core-autofill-workflows",
      labelKo: "5대 핵심 워크플로(작품생성·회차발행·출고·분업초대·문의접수) 완비",
      maxPoints: 2.5,
      earnedPoints: round1((presentWorkflows.length / expectedWorkflows.length) * 2.5),
      evidence: `workflows=${presentWorkflows.length}/5 (${presentWorkflows.join(", ")})`,
      remediationKo: "5대 핵심 워크플로 스키마(project-create·episode-publish·export-release·team-division-invite·support-inquiry)를 모두 등록하세요.",
      targetFiles: [schemasPath],
    }),
    makeCheck({
      id: "one-click-ai-autofill-engine-ui",
      labelKo: "AI 원클릭 자동 채우기·사용자 수정 보호·Undo 엔진 및 OKLCH 44px 카드 UI",
      maxPoints: 2.5,
      earnedPoints: engineAndUiReady ? 2.5 : engineSrc && cardSrc ? 1.2 : 0,
      evidence: `engine=${Boolean(engineSrc)}, card=${Boolean(cardSrc)}, cleanUi=${engineAndUiReady}`,
      remediationKo: "minimal-required-form-engine.ts와 StudioSmartAutofillAssistantCard.tsx의 원클릭 채움·Undo·min-h-11·무HEX 규칙을 복구하세요.",
      targetFiles: [enginePath, cardPath],
    }),
    makeCheck({
      id: "smart-form-lazy-mount-and-tests",
      labelKo: "초기 번들 무영향 React.lazy 지연 연결 및 자동 채우기 단위 테스트",
      maxPoints: 2.5,
      earnedPoints: lazyWired ? 2.5 : fileExists(root, testPath) ? 1.0 : 0,
      evidence: `lazyWired=${lazyWired}, testExists=${fileExists(root, testPath)}`,
      remediationKo: "StudioCreateQuickPresetStrip.tsx에서 정적 import 없이 React.lazy로 연결하고 smart-form-autofill.test.tsx를 유지하세요.",
      targetFiles: [stripPath, testPath],
    }),
  ];

  return finalizeAxis("minimal-form-ai-autofill", checks, {
    maxRequiredConst,
    workflowCount: presentWorkflows.length,
    parsedWorkflowCounts,
    engineAndUiReady,
    lazyWired,
  });
}

/** 축 5: OKLCH 다색 스펙트럼 비주얼 & 접근성 대비(>= 4.5:1) */
export function scanAxis5OklchSpectrumA11y(root) {
  const themesPath = "apps/web/src/app/styles/design-themes.css";
  const unifiedPath = "apps/web/src/app/styles/unified-theme-contract.css";
  const themesCss = readText(root, themesPath) ?? "";
  const unifiedCss = readText(root, unifiedPath) ?? "";

  const oklchInThemes = (themesCss.match(/oklch\(/giu) ?? []).length;
  const hasContrastTheme =
    themesCss.includes('data-design-theme="contrast"') ||
    unifiedCss.includes('data-design-theme="contrast"');
  const hasForcedColors =
    /forced-colors\s*:\s*active/iu.test(readText(root, CORE_SHELL_CSS_FILES[0]) ?? "") ||
    /forced-colors\s*:\s*active/iu.test(themesCss);

  const shellCssEntries = CORE_SHELL_CSS_FILES.map((file) => ({
    file,
    content: readText(root, file) ?? "",
  }));
  const allUxCssEntries = [
    ...shellCssEntries,
    ...EXTRA_UX_CSS_FILES.map((file) => ({ file, content: readText(root, file) ?? "" })),
  ];
  const presentUxCssEntries = allUxCssEntries.filter((entry) => entry.content.length > 0);
  const presentShellCssCount = shellCssEntries.filter((entry) => entry.content.length > 0).length;

  const combinedShellAndTheme = `${shellCssEntries.map((e) => e.content).join("\n")}\n${themesCss}`;
  const spectrumTokensWithOklch = SPECTRUM_TOKENS.filter((token) =>
    new RegExp(`${token}\\s*:\\s*[^;{}]*oklch\\(`, "iu").test(combinedShellAndTheme),
  );

  const hexViolationsByFile = [];
  for (const entry of presentUxCssEntries) {
    const found = findRawHexLiterals(entry.content);
    if (found.length > 0) {
      hexViolationsByFile.push({ file: entry.file, count: found.length, sample: found.slice(0, 4) });
    }
  }
  const totalRawHex = hexViolationsByFile.reduce((sum, item) => sum + item.count, 0);

  const transitionAllCount = presentUxCssEntries.reduce(
    (sum, entry) => sum + findTransitionAllViolations(entry.content).length,
    0,
  );
  const unpairedBackdropFiles = shellCssEntries
    .filter((entry) => entry.content && hasUnpairedBackdropFilter(entry.content))
    .map((entry) => entry.file);

  const reducedMotionShellFiles = shellCssEntries.filter((entry) =>
    /prefers-reduced-motion\s*:\s*reduce/iu.test(entry.content),
  );
  const hasModernProgressiveCss = presentUxCssEntries.some(
    (entry) =>
      /@supports\s*\(\s*animation-timeline\s*:\s*view\(\)\s*\)/iu.test(entry.content) ||
      /@starting-style\b/iu.test(entry.content),
  );

  const hexPoints =
    presentShellCssCount === 0
      ? 0
      : totalRawHex === 0
        ? 2.0
        : totalRawHex <= 3
          ? 0.8
          : 0;
  const transitionAndBackdropPoints =
    presentShellCssCount === 0
      ? 0
      : transitionAllCount === 0 && unpairedBackdropFiles.length === 0
        ? 1.5
        : (transitionAllCount === 0 ? 0.8 : 0) + (unpairedBackdropFiles.length === 0 ? 0.7 : 0);

  const checks = [
    makeCheck({
      id: "oklch-design-system-and-contrast",
      labelKo: "OKLCH 디자인 토큰 체계(100+ 선언)·고대비 테마(4.5:1)·forced-colors 가드",
      maxPoints: 2.5,
      earnedPoints:
        oklchInThemes >= 100 && hasContrastTheme && hasForcedColors
          ? 2.5
          : (oklchInThemes >= 50 ? 1.2 : 0) + (hasContrastTheme ? 0.7 : 0) + (hasForcedColors ? 0.6 : 0),
      evidence: `oklchCount=${oklchInThemes}, contrastTheme=${hasContrastTheme}, forcedColors=${hasForcedColors}`,
      remediationKo: "design-themes.css와 unified-theme-contract.css의 OKLCH 토큰·contrast 고대비 테마·forced-colors 가드를 유지하세요.",
      targetFiles: [themesPath, unifiedPath],
    }),
    makeCheck({
      id: "five-tone-oklch-spectrum-tokens",
      labelKo: "5색 시맨틱 OKLCH 스펙트럼 변수(--ts-spectrum-creation/3d/collab/market/support)",
      maxPoints: 2.5,
      earnedPoints: round1((spectrumTokensWithOklch.length / SPECTRUM_TOKENS.length) * 2.5),
      evidence: `spectrumTokensOklch=${spectrumTokensWithOklch.length}/5`,
      remediationKo: "workspace-visual-v3.css 등 셸 CSS에 5색 OKLCH 스펙트럼 변수(--ts-spectrum-creation, --ts-spectrum-3d, --ts-spectrum-collab, --ts-spectrum-market, --ts-spectrum-support)를 oklch()로 정의하세요.",
      targetFiles: CORE_SHELL_CSS_FILES,
    }),
    makeCheck({
      id: "zero-raw-hex-in-ux-css",
      labelKo: "핵심 UX 셸·테마 CSS 원시 HEX 0건(순수 OKLCH 전환)",
      maxPoints: 2.0,
      earnedPoints: hexPoints,
      evidence:
        presentShellCssCount === 0
          ? "shellCssMissing"
          : totalRawHex === 0
            ? "rawHex=0"
            : `rawHex=${totalRawHex} (${hexViolationsByFile.map((v) => `${path.basename(v.file)}:${v.count}`).join(", ")})`,
      remediationKo:
        presentShellCssCount === 0
          ? "핵심 셸 CSS 4종을 배치하고 순수 OKLCH 토큰으로 구성하세요."
          : `원시 HEX ${totalRawHex}건을 모두 OKLCH 시맨틱 토큰으로 교체하세요 (${hexViolationsByFile.map((v) => `${v.file}: ${v.count}건`).join("; ")}).`,
      targetFiles: hexViolationsByFile.length > 0 ? hexViolationsByFile.map((v) => v.file) : CORE_SHELL_CSS_FILES,
    }),
    makeCheck({
      id: "zero-transition-all-and-backdrop-pairing",
      labelKo: "transition: all 0건 및 Safari/iPadOS -webkit-backdrop-filter 페어링",
      maxPoints: 1.5,
      earnedPoints: transitionAndBackdropPoints,
      evidence:
        presentShellCssCount === 0
          ? "shellCssMissing"
          : `transitionAll=${transitionAllCount}, unpairedBackdrop=${unpairedBackdropFiles.length}`,
      remediationKo: "transition: all 선언을 명시 속성으로 교체하고 backdrop-filter와 -webkit-backdrop-filter를 항상 짝지어 선언하세요.",
      targetFiles: unpairedBackdropFiles.length > 0 ? unpairedBackdropFiles : CORE_SHELL_CSS_FILES,
    }),
    makeCheck({
      id: "reduced-motion-and-modern-css",
      labelKo: "4대 셸 CSS 전수 prefers-reduced-motion 가드 및 차세대 CSS(@starting-style/view())",
      maxPoints: 1.5,
      earnedPoints: round1(
        (reducedMotionShellFiles.length / CORE_SHELL_CSS_FILES.length) * 1.0 +
          (hasModernProgressiveCss ? 0.5 : 0),
      ),
      evidence: `reducedMotionShell=${reducedMotionShellFiles.length}/${CORE_SHELL_CSS_FILES.length}, modernProgressiveCss=${hasModernProgressiveCss}`,
      remediationKo: "누락된 셸 CSS(mobile-first-shell.css 등)에 @media (prefers-reduced-motion: reduce) 모션 해제 규칙을 추가하세요.",
      targetFiles: CORE_SHELL_CSS_FILES.filter(
        (file) => !reducedMotionShellFiles.some((entry) => entry.file === file),
      ),
    }),
  ];

  return finalizeAxis("oklch-spectrum-a11y", checks, {
    oklchInThemes,
    spectrumTokensCount: spectrumTokensWithOklch.length,
    totalRawHex,
    transitionAllCount,
    unpairedBackdropCount: unpairedBackdropFiles.length,
    reducedMotionShellCount: reducedMotionShellFiles.length,
  });
}
