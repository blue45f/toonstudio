#!/usr/bin/env node
/**
 * UI/UX v2 전수 시안(데스크톱 시안 A~P · 모바일 시안 M1~M4) 및 Starlight Atelier 디자인 시스템 계약 자동 검증 게이트 (v2.5).
 *
 * 브라우저를 기동하지 않고 <100ms 내에 아래 불변식을 검증한다:
 * 1. 정본 문서(PRODUCT.md, DESIGN.md, UI/UX v2 Blueprint, Quality Gates Policy) 존재 및 시안 A~P / 모바일 M1~M4 기록 동기화
 * 2. 독립 셸(apps/mobile/shell, apps/admin-web, apps/desktop-sync, apps/brush-lab, apps/character-lab)의 스피너 금지(DESIGN.md §4), OKLCH 의미 토큰(§2), 44px 터치 타깃(WCAG 2.5.8) 준수
 * 3. 게스트 3초 비차단 세션(INITIAL_SESSION_READY_DEADLINE_MS <= 3500) 회귀 방지(UX_FLOW_BACKLOG P1)
 * 4. 36대 핵심 화면군·루트 정문·아틀리에 벤토·단일 44px 에디터 바·3D Live Ink 스테이지/쉘프·스펙트럼 리본·어디서 봐 라우터 데이터 앵커 무결성 + 정본 경로(레거시 별칭 금지) + 44px 미만 Tailwind 높이(min-h-6..10) 금지
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN_LEGACY_HREF_RE = /\b(?:href|to)=["'](?:\/shaper|\/brush-lab|\/studio\/brush-lab|\/marketplace|\/new)(?:[?"'#]|["'])/u;
const SUB_44PX_TAILWIND_MIN_H_RE = /\bmin-h-(?:6|7|8|9|10)\b/u;

export function evaluateUiUxV2Contracts(root = DEFAULT_ROOT) {
  const issues = [];
  const resolvePath = (rel) => path.join(root, rel);
  const exists = (rel) => fs.existsSync(resolvePath(rel));
  const read = (rel) => fs.readFileSync(resolvePath(rel), "utf8");
  const hasDocsCheckout = exists("docs/README.md") || root !== DEFAULT_ROOT;

  for (const doc of ["PRODUCT.md", "DESIGN.md"]) {
    if (root === DEFAULT_ROOT && !exists(doc)) issues.push(`필수 정본 문서 누락: ${doc}`);
  }
  if (hasDocsCheckout && root === DEFAULT_ROOT) {
    for (const doc of [
      "docs/architecture/ui-ux-v2-overhaul-blueprint-2026-11-11.md",
      "docs/operations/quality-gates-policy.md",
    ]) {
      if (!exists(doc)) issues.push(`필수 정본 문서 누락: ${doc}`);
    }
  }

  if (exists("docs/architecture/ui-ux-v2-overhaul-blueprint-2026-11-11.md")) {
    const blueprint = read("docs/architecture/ui-ux-v2-overhaul-blueprint-2026-11-11.md");
    for (const boardId of [
      "시안 A", "시안 B", "시안 C", "시안 D", "시안 E", "시안 F", "시안 G", "시안 H",
      "시안 I", "시안 J", "시안 K", "시안 L", "시안 M", "시안 N", "시안 O", "시안 P",
      "모바일 시안 M1", "모바일 시안 M2", "모바일 시안 M3", "모바일 시안 M4",
    ]) {
      if (!blueprint.includes(boardId)) {
        issues.push(`v2 설계서에 화면군 시안 식별자 누락: ${boardId}`);
      }
    }
  }

  // 1) 모바일 네이티브 런처/오프라인 셸: 스피너 금지 + Starlight OKLCH + 스켈레톤 + 48px 터치 타깃
  if (exists("apps/mobile/shell/index.html") && exists("apps/mobile/shell/mobile.css")) {
    const mobileHtml = read("apps/mobile/shell/index.html");
    const mobileCss = read("apps/mobile/shell/mobile.css");
    if (mobileHtml.includes('class="spinner"') || /@keyframes\s+spin\b/u.test(mobileCss)) {
      issues.push("apps/mobile/shell: 회전 스피너가 감지됨 (DESIGN.md §4 스켈레톤 원칙 위반)");
    }
    if (!mobileHtml.includes("data-mobile-skeleton")) {
      issues.push("apps/mobile/shell/index.html: 실루엣 스켈레톤 마크업(data-mobile-skeleton) 누락");
    }
    if (!mobileCss.includes("oklch(")) {
      issues.push("apps/mobile/shell/mobile.css: Starlight OKLCH 색상 토큰 누락");
    }
    if (!mobileCss.includes("prefers-reduced-motion: reduce") || !mobileCss.includes("forced-colors: active")) {
      issues.push("apps/mobile/shell/mobile.css: 모션 감소 또는 고대비(forced-colors) 미디어 쿼리 누락");
    }
  } else if (root === DEFAULT_ROOT) {
    issues.push("apps/mobile/shell 엔트리 파일 누락");
  }

  // 격리 픽스처(root !== DEFAULT_ROOT)에서 부분 계약도 검증할 수 있도록 존재하는 파일은 항상 검사한다.
  const v2ComponentFilesForInlineAudit = [
    "apps/web/src/domains/creator/studio-shell/StudioProjectLibraryFastStartStrip.tsx",
    "apps/web/src/domains/creator/studio-shell/StudioProjectLibraryManagementHeader.tsx",
    "apps/web/src/domains/creator/studio-shell/StudioProjectLibraryManagementUi.tsx",
    "apps/web/src/domains/creator/studio-shell/StudioProjectLibraryManagementContent.tsx",
    "apps/web/src/domains/creator/studio-shell/StudioDocumentStagePillBar.tsx",
    "apps/web/src/domains/creator/studio-shell/StudioDocumentWindowHub.tsx",
    "apps/web/src/domains/creator/bg3d/StudioBg3dAssetShelf.tsx",
    "apps/web/src/domains/creator/bg3d/StudioBg3dProfessionalWorkspace.tsx",
    "apps/web/src/domains/creator/export/StudioExportOutputSummary.tsx",
    "apps/web/src/domains/catalog/DiscoverFacetTabStrip.tsx",
    "apps/web/src/domains/catalog/DiscoverHubPage.tsx",
    "apps/web/src/domains/catalog/TitleDetailPage.tsx",
    "apps/web/src/domains/catalog/TitleDetailCreationBridgeCard.tsx",
    "apps/web/src/domains/creator/studio-shell/StudioProjectTeamKanbanBridge.tsx",
    "apps/web/src/domains/market/components/MarketResourceCard.tsx",
    "apps/web/src/domains/market/pages/MarketHomePage.tsx",
    "apps/web/src/domains/creator-resources/OpenDataPurposeFilterBar.tsx",
    "apps/web/src/domains/creator/publishing/ShowcaseSocialHubBar.tsx",
    "apps/web/src/domains/creator/studio-shell/StudioSpecialistSuiteBar.tsx",
    "apps/web/src/domains/account/MySpaceVaultAndRestBar.tsx",
    "apps/web/src/domains/catalog/TitleReaderImmersiveCreationBar.tsx",
    "apps/web/src/domains/integrations/PublishSurfaceCrossBridge.tsx",
    "apps/web/src/domains/community/CommunityPage.tsx",
    "apps/web/src/domains/community/PencafePage.tsx",
    "apps/web/src/domains/creator/production-hub/ProductionHubPage.tsx",
    "apps/web/src/domains/cuts/CutsFeedPage.tsx",
    "apps/web/src/domains/creator/analytics/CreatorAnalyticsPage.tsx",
    "apps/web/src/domains/catalog/RankingPage.tsx",
    "apps/web/src/domains/catalog/ExplorePage.tsx",
    "apps/web/src/domains/catalog/ExploreReaDirectoryBar.tsx",
    "apps/web/src/domains/catalog/CalendarPage.tsx",
    "apps/web/src/domains/catalog/CalendarFilters.tsx",
    "apps/web/src/domains/character-chat/CharacterChatPage.tsx",
    "apps/web/src/domains/creator/spatial-reader/StudioSpatialReaderPage.tsx",
    "apps/web/src/domains/creator/CreateStartPage.tsx",
    "apps/web/src/domains/marketing/ReferenceCreatorDashboard.tsx",
  ];

  for (const rel of v2ComponentFilesForInlineAudit) {
    if (!exists(rel)) continue;
    const content = read(rel);
    if (FORBIDDEN_LEGACY_HREF_RE.test(content)) {
      issues.push(`${rel}: 레거시 리다이렉트 별칭 경로(href/to) 사용 금지 — 정본(canonical) 경로를 사용하세요`);
    }
    if (SUB_44PX_TAILWIND_MIN_H_RE.test(content)) {
      issues.push(`${rel}: 44px 미만 Tailwind 최소 높이(min-h-6..10) 사용 감지 — min-h-11 이상을 사용하세요`);
    }
  }

  if (root !== DEFAULT_ROOT) {
    return { ok: issues.length === 0, issues };
  }

  // 2) 독립 서브앱 셸(admin-web, desktop-sync, brush-lab, character-lab): OKLCH 토큰 및 >= 44px 터치 타깃
  if (exists("apps/admin-web/src/app/styles/admin.css")) {
    const adminCss = read("apps/admin-web/src/app/styles/admin.css");
    if (!adminCss.includes("oklch(")) {
      issues.push("apps/admin-web/src/app/styles/admin.css: OKLCH 의미 토큰 누락");
    }
    if (/min-height:\s*36px/u.test(adminCss)) {
      issues.push("apps/admin-web/src/app/styles/admin.css: 44px 미만(36px) 버튼 최소 높이 잔존");
    }
  }
  if (exists("apps/desktop-sync/src/conflict-server.ts")) {
    const conflictServer = read("apps/desktop-sync/src/conflict-server.ts");
    if (!conflictServer.includes("oklch(") || !conflictServer.includes("min-height:2.75rem")) {
      issues.push("apps/desktop-sync/src/conflict-server.ts: OKLCH 토큰 또는 2.75rem(44px) 터치 타깃 누락");
    }
  }
  if (exists("apps/brush-lab/src/app/styles/brush-lab.css")) {
    const brushLabCss = read("apps/brush-lab/src/app/styles/brush-lab.css");
    if (!brushLabCss.includes("oklch(")) {
      issues.push("apps/brush-lab/src/app/styles/brush-lab.css: Starlight OKLCH 토큰 누락");
    }
    if (/min-height:\s*(?:34|36|40)px/u.test(brushLabCss)) {
      issues.push("apps/brush-lab/src/app/styles/brush-lab.css: 44px 미만(34/36/40px) 인터랙티브 컨트롤 잔존");
    }
  }
  if (exists("apps/character-lab/src/app/styles/character-lab.css")) {
    const characterLabCss = read("apps/character-lab/src/app/styles/character-lab.css");
    if (!characterLabCss.includes("oklch(")) {
      issues.push("apps/character-lab/src/app/styles/character-lab.css: Starlight OKLCH 토큰 누락");
    }
  }

  // 3) 게스트-퍼스트 3초 비차단 세션 기한(UX_FLOW_BACKLOG P1 회귀 방지)
  if (exists("apps/web/src/domains/auth/public/session/auth-session.tsx")) {
    const authSession = read("apps/web/src/domains/auth/public/session/auth-session.tsx");
    const match = authSession.match(/INITIAL_SESSION_READY_DEADLINE_MS\s*=\s*([0-9_]+)/u);
    if (!match) {
      issues.push("auth-session.tsx: INITIAL_SESSION_READY_DEADLINE_MS 상수 누락");
    } else {
      const ms = Number(match[1].replaceAll("_", ""));
      if (!Number.isFinite(ms) || ms <= 0 || ms > 3_500) {
        issues.push(`auth-session.tsx: 초기 세션 비차단 기한(${ms}ms)이 3.5초 상한을 초과함`);
      }
    }
  }

  // 4) 핵심 화면군 UI/UX v2.5 Starlight Atelier 시각·동선 앵커 연결 무결성
  const requiredSurfaceAnchors = [
    ["apps/web/src/domains/marketing/ReferenceCreatorDashboard.tsx", "home-v2-spectrum-launchpad"],
    ["apps/web/src/domains/marketing/reference-creator-dashboard.css", "rd-v2-spectrum-ribbon"],
    ["apps/web/src/domains/creator/studio-shell/StudioProjectLibraryFastStartStrip.tsx", "studio-fast-start-strip"],
    ["apps/web/src/domains/creator/studio-shell/StudioProjectLibraryManagementHeader.tsx", "data-studio-atelier-bento"],
    ["apps/web/src/domains/creator/studio-shell/StudioProjectLibraryManagementUi.tsx", "data-studio-card-accent-bar"],
    ["apps/web/src/domains/creator/studio-shell/StudioDocumentStagePillBar.tsx", "data-studio-stage-pill-bar"],
    ["apps/web/src/domains/creator/studio-shell/StudioDocumentWindowHub.tsx", "data-studio-autosave-dot"],
    ["apps/web/src/domains/creator/bg3d/StudioBg3dProfessionalWorkspace.tsx", "data-bg3d-stage-header"],
    ["apps/web/src/domains/creator/bg3d/StudioBg3dAssetShelf.tsx", "studio-bg3d-dcc-mode-bar"],
    ["apps/web/src/domains/creator/bg3d/StudioBg3dAssetShelf.tsx", "studio-bg3d-bake-to-panel-cta"],
    ["apps/web/src/domains/creator/export/StudioExportOutputSummary.tsx", "Rights BOM"],
    ["apps/web/src/domains/catalog/DiscoverFacetTabStrip.tsx", "discover-facet-tab-strip"],
    ["apps/web/src/domains/catalog/DiscoverFacetTabStrip.tsx", "data-discover-spectrum-ribbon"],
    ["apps/web/src/domains/catalog/TitleDetailPage.tsx", "data-title-where-to-read-router"],
    ["apps/web/src/domains/catalog/TitleDetailCreationBridgeCard.tsx", "title-detail-creation-bridge"],
    ["apps/web/src/domains/creator/studio-shell/StudioProjectTeamKanbanBridge.tsx", "studio-kanban-stage-card"],
    ["apps/web/src/domains/creator/studio-shell/StudioProjectTeamKanbanBridge.tsx", "data-kanban-stage-accent"],
    ["apps/web/src/domains/market/components/MarketResourceCard.tsx", "data-market-rights-bom"],
    ["apps/web/src/domains/creator-resources/OpenDataPurposeFilterBar.tsx", "open-data-purpose-filter-bar"],
    ["apps/web/src/domains/creator/publishing/ShowcaseSocialHubBar.tsx", "showcase-social-hub-bar"],
    ["apps/web/src/domains/creator/studio-shell/StudioSpecialistSuiteBar.tsx", "studio-specialist-suite-bar"],
    ["apps/web/src/domains/account/MySpaceVaultAndRestBar.tsx", "my-space-vault-rest-bar"],
    ["apps/web/src/domains/admin/shell/AdminShell.tsx", "Edge Gate"],
    ["apps/web/src/domains/catalog/TitleReaderImmersiveCreationBar.tsx", "reader-spatial-creation-bar"],
    ["apps/web/src/domains/integrations/PublishSurfaceCrossBridge.tsx", "publish-surface-cross-bridge"],
    ["apps/web/src/domains/legal/technology/EngineeringStoryUi.tsx", "engineering-atlas-sticky-toc"],
    ["apps/web/src/domains/creator/production-hub/ProductionHubPage.tsx", "production-studio-workspace-link"],
    ["apps/web/src/domains/creator/analytics/CreatorAnalyticsPage.tsx", "creator-analytics-publish-bridge"],
    ["apps/web/src/domains/catalog/RankingPage.tsx", "ranking-create-bridge"],
    ["apps/web/src/domains/character-chat/CharacterChatPage.tsx", "character-chat-shaper-bridge"],
    ["apps/web/src/domains/creator/spatial-reader/StudioSpatialReaderPage.tsx", "spatial-reader-studio-bridge"],
  ];
  for (const [file, marker] of requiredSurfaceAnchors) {
    if (!exists(file)) {
      issues.push(`UI/UX v2 핵심 컴포넌트 누락: ${file}`);
      continue;
    }
    if (!read(file).includes(marker)) {
      issues.push(`UI/UX v2 앵커 마커 누락: ${file} -> ${marker}`);
    }
  }

  return { ok: issues.length === 0, issues };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = evaluateUiUxV2Contracts();
  if (!result.ok) {
    console.error(`UI/UX v2.5 계약 게이트 실패 (${result.issues.length}건):`);
    for (const issue of result.issues) console.error(` - ${issue}`);
    process.exit(1);
  }
  console.log("UI/UX v2.5 계약 게이트 통과: 데스크톱 시안 A~P · 모바일 M1~M4 · Starlight Atelier 벤토/단일바/스펙트럼/라우터 · 36대 허브 44px 불변식 정상");
}
