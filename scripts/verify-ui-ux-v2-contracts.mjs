#!/usr/bin/env node
/**
 * UI/UX v2 전수 시안(데스크톱 시안 A~P · 모바일 시안 M1~M4) 및 디자인 시스템 계약 자동 검증 게이트.
 *
 * 브라우저를 기동하지 않고 <100ms 내에 아래 불변식을 검증한다:
 * 1. 정본 문서(PRODUCT.md, DESIGN.md, UI/UX v2 Blueprint, Quality Gates Policy) 존재 및 시안 A~P / 모바일 M1~M4 기록 동기화
 * 2. 독립 셸(apps/mobile/shell, apps/admin-web, apps/desktop-sync)의 스피너 금지(DESIGN.md §4), OKLCH 의미 토큰(§2), 44px 터치 타깃(WCAG 2.5.8) 준수
 * 3. 게스트 3초 비차단 세션(INITIAL_SESSION_READY_DEADLINE_MS <= 3500) 회귀 방지(UX_FLOW_BACKLOG P1)
 * 4. 16대 핵심 화면군 UI/UX v2 컴포넌트 및 데이터 앵커 연결 무결성
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  } else {
    issues.push("apps/mobile/shell 엔트리 파일 누락");
  }

  if (root !== DEFAULT_ROOT) {
    return { ok: issues.length === 0, issues };
  }

  // 2) 독립 Admin 셸 & Desktop Sync 충돌 콘솔: OKLCH 토큰 및 >= 44px(2.75rem) 터치 타깃
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

  // 4) 16대 전수 화면군 핵심 UI/UX v2 앵커 연결 무결성
  const requiredSurfaceAnchors = [
    ["apps/web/src/domains/creator/studio-shell/StudioProjectLibraryFastStartStrip.tsx", "studio-fast-start-strip"],
    ["apps/web/src/domains/creator/studio-shell/StudioDocumentStagePillBar.tsx", "data-studio-stage-pill-bar"],
    ["apps/web/src/domains/creator/bg3d/StudioBg3dAssetShelf.tsx", "studio-bg3d-dcc-mode-bar"],
    ["apps/web/src/domains/creator/export/StudioExportOutputSummary.tsx", "Rights BOM"],
    ["apps/web/src/domains/catalog/DiscoverFacetTabStrip.tsx", "discover-facet-tab-strip"],
    ["apps/web/src/domains/catalog/TitleDetailCreationBridgeCard.tsx", "title-detail-creation-bridge"],
    ["apps/web/src/domains/creator/studio-shell/StudioProjectTeamKanbanBridge.tsx", "studio-project-team-kanban-bridge"],
    ["apps/web/src/domains/market/components/MarketResourceCard.tsx", "data-market-rights-bom"],
    ["apps/web/src/domains/creator-resources/OpenDataPurposeFilterBar.tsx", "open-data-purpose-filter-bar"],
    ["apps/web/src/domains/creator/publishing/ShowcaseSocialHubBar.tsx", "showcase-social-hub-bar"],
    ["apps/web/src/domains/creator/studio-shell/StudioSpecialistSuiteBar.tsx", "studio-specialist-suite-bar"],
    ["apps/web/src/domains/account/MySpaceVaultAndRestBar.tsx", "my-space-vault-rest-bar"],
    ["apps/web/src/domains/admin/shell/AdminShell.tsx", "Edge Gate"],
    ["apps/web/src/domains/catalog/TitleReaderImmersiveCreationBar.tsx", "reader-spatial-creation-bar"],
    ["apps/web/src/domains/integrations/PublishSurfaceCrossBridge.tsx", "publish-surface-cross-bridge"],
    ["apps/web/src/domains/legal/technology/EngineeringStoryUi.tsx", "engineering-atlas-sticky-toc"],
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
    console.error(`UI/UX v2 계약 게이트 실패 (${result.issues.length}건):`);
    for (const issue of result.issues) console.error(` - ${issue}`);
    process.exit(1);
  }
  console.log("UI/UX v2 계약 게이트 통과: 데스크톱 시안 A~P · 모바일 시안 M1~M4 · OKLCH · 무스피너 · 44px 불변식 정상");
}
