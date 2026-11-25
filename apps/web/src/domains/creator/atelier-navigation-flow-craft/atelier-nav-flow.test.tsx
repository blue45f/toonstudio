// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATELIER_NAV_BRAND,
  CALM_CHROME_GNB_PILLARS,
  CANONICAL_INTENT_ROUTES,
  LEGACY_DISTRIBUTED_CHROME_BASELINE,
  NAV_FLOW_SCHEMA_VERSION,
  StudioAtelierNavFlowPanel,
  WORKFLOW_PHASE_CHROME_PROFILES,
  buildVisualUndoTimeline,
  evaluateChromeErgonomics,
  exportNavFlowArchitectureJson,
  extractKoreanChoseong,
  getCalmGnbPillar,
  getWorkflowPhaseProfile,
  isChoseongIntentQuery,
  restoreVisualUndoSnapshot,
  searchIntentRoutes,
  type WorkflowPhaseId,
} from "./index";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const ENGINE_SRC = readFileSync(resolve(MODULE_DIR, "atelier-nav-flow-engine.ts"), "utf8");
const PANEL_SRC = readFileSync(resolve(MODULE_DIR, "StudioAtelierNavFlowPanel.tsx"), "utf8");
const INDEX_SRC = readFileSync(resolve(MODULE_DIR, "index.ts"), "utf8");
const ALL_MODULE_SOURCES = `${ENGINE_SRC}\n${PANEL_SRC}\n${INDEX_SRC}`;

const fromCodes = (codes: readonly number[]): string => String.fromCharCode(...codes);

describe("Wave 63C: CalmChrome GNB·LNB·탑메뉴·푸터 평면 동선 및 적응형 커맨드 런처", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // Section A — 4대 목적 평면 GNB & 중복 진입 통합
  it("1. 4대 목적 평면 GNB(그리기·3D/캐릭터·가상 작업실·기술/작품)가 5개 이하 예산을 엄수한다", () => {
    expect(CALM_CHROME_GNB_PILLARS).toHaveLength(4);
    expect(CALM_CHROME_GNB_PILLARS.length).toBeLessThanOrEqual(5);
    expect(CALM_CHROME_GNB_PILLARS.map((p) => p.labelKo)).toEqual([
      "그리기", "3D/캐릭터", "가상 작업실", "기술/작품",
    ]);
  });

  it("2. 각 GNB 축이 고유 정본 경로와 ToonStudio 고유 브랜드를 보유한다", () => {
    expect(CALM_CHROME_GNB_PILLARS.map((p) => p.canonicalHref)).toEqual([
      "/studio/canvas", "/studio/bg3d", "/studio/space", "/tech",
    ]);
    expect(CALM_CHROME_GNB_PILLARS.map((p) => p.brandEngine)).toEqual([
      "AtelierInk", "AtelierSolid", "AtelierStage", "ToonStudio",
    ]);
  });

  it("3. getCalmGnbPillar가 4대 축 조회를 결정론적으로 처리한다", () => {
    expect(getCalmGnbPillar("draw").canonicalHref).toBe("/studio/canvas");
    expect(getCalmGnbPillar("solid-cast").brandEngine).toBe("AtelierSolid");
    expect(getCalmGnbPillar("virtual-stage").canonicalHref).toBe("/studio/space");
    expect(getCalmGnbPillar("tech-works").canonicalHref).toBe("/tech");
  });

  it("4. 기존 분산 구조 기준선이 290+ 라우트·5대 허브(122+ 탭)·중복 진입 4그룹을 기록한다", () => {
    expect(LEGACY_DISTRIBUTED_CHROME_BASELINE.totalRoutes).toBeGreaterThanOrEqual(290);
    expect(LEGACY_DISTRIBUTED_CHROME_BASELINE.hubCount).toBe(5);
    expect(LEGACY_DISTRIBUTED_CHROME_BASELINE.hubTabCount).toBeGreaterThanOrEqual(122);
    expect(LEGACY_DISTRIBUTED_CHROME_BASELINE.avgClickDepth).toBe(3.8);
    expect(LEGACY_DISTRIBUTED_CHROME_BASELINE.duplicateEntryGroups).toHaveLength(4);
    const dupHrefs = LEGACY_DISTRIBUTED_CHROME_BASELINE.duplicateEntryGroups.flatMap((g) => g.legacyDuplicates);
    expect(dupHrefs).toContain("/studio/new");
    expect(dupHrefs).toContain("/about/technology");
  });

  it("5. 4대 GNB 축의 통합 레거시 라우트 합계가 전체 분산 라우트 수와 일치한다", () => {
    const sum = CALM_CHROME_GNB_PILLARS.reduce((acc, p) => acc + p.consolidatedLegacyCount, 0);
    expect(sum).toBe(LEGACY_DISTRIBUTED_CHROME_BASELINE.totalRoutes);
  });

  // Section B — 4대 크롬 인체공학 진단 & 면적·클릭 깊이 계산
  it("6. 기본 1440×900 콤팩트 레일에서 탑바 44px·LNB 52px·푸터 28px·캔버스 면적 >= 88%를 만족한다", () => {
    const report = evaluateChromeErgonomics();
    expect(report.mode).toBe("simulation-model");
    expect(report.calm.topBarHeightPx).toBe(44);
    expect(report.calm.lnbWidthPx).toBe(52);
    expect(report.calm.footerHeightPx).toBe(28);
    expect(report.calm.canvasWidthPx).toBe(1388);
    expect(report.calm.canvasHeightPx).toBe(828);
    expect(report.calm.canvasUsableRatioPct).toBeGreaterThanOrEqual(88);
    expect(report.checks.canvasAreaTargetMet).toBe(true);
  });

  it("7. 몰입 96% 집중 모드에서 캔버스 실가용 면적이 >= 96%로 확장된다", () => {
    const report = evaluateChromeErgonomics({ immersiveFocusMode: true });
    expect(report.calm.lnbWidthPx).toBe(0);
    expect(report.calm.footerHeightPx).toBe(0);
    expect(report.calm.topBarHeightPx).toBe(28);
    expect(report.calm.canvasUsableRatioPct).toBeGreaterThanOrEqual(96);
    expect(report.checks.canvasAreaTargetMet).toBe(true);
  });

  it("8. LNB 레일 확장 토글 시 좌측 폭이 52px에서 216px로 전환되고 캔버스 폭이 164px 줄어든다", () => {
    const compact = evaluateChromeErgonomics({ lnbExpanded: false });
    const expanded = evaluateChromeErgonomics({ lnbExpanded: true, lnbPinned: true });
    expect(compact.calm.lnbWidthPx).toBe(52);
    expect(expanded.calm.lnbWidthPx).toBe(216);
    expect(compact.calm.canvasWidthPx - expanded.calm.canvasWidthPx).toBe(164);
    expect(expanded.lnbPinned).toBe(true);
  });

  it("9. 푸터 <details> 사이트맵 전개 시 푸터 높이가 28px에서 112px로 전환된다", () => {
    const collapsed = evaluateChromeErgonomics({ footerSitemapExpanded: false });
    const open = evaluateChromeErgonomics({ footerSitemapExpanded: true });
    expect(collapsed.calm.footerHeightPx).toBe(28);
    expect(open.calm.footerHeightPx).toBe(112);
    expect(collapsed.calm.canvasHeightPx - open.calm.canvasHeightPx).toBe(84);
  });

  it("10. 평균 클릭 깊이가 3.8에서 1.4로 단축되고 5대 인체공학 검사가 전원 통과한다", () => {
    const report = evaluateChromeErgonomics();
    expect(report.calm.avgClickDepth).toBe(1.4);
    expect(report.calm.clickReductionPct).toBeGreaterThan(60);
    expect(report.calm.canvasGainPct).toBeGreaterThan(20);
    expect(Object.values(report.checks).every(Boolean)).toBe(true);
  });

  it("11. surfaceAudits가 GNB·LNB·탑메뉴·푸터 4대 크롬 Before/After 픽셀 진단을 반환한다", () => {
    const report = evaluateChromeErgonomics();
    expect(report.surfaceAudits.map((a) => a.surfaceId)).toEqual(["gnb", "lnb", "top-menu", "footer"]);
    for (const audit of report.surfaceAudits) {
      expect(audit.afterPixels).toBeLessThan(audit.beforePixels);
      expect(audit.legacyMetricKo.length).toBeGreaterThan(5);
      expect(audit.calmMetricKo.length).toBeGreaterThan(5);
    }
  });

  it("12. 비정상 뷰포트 크기(NaN·음수·초대형)를 안전 경계로 클램프한다", () => {
    const tiny = evaluateChromeErgonomics({ viewportWidthPx: -200, viewportHeightPx: Number.NaN });
    expect(tiny.viewportWidthPx).toBe(360);
    expect(tiny.viewportHeightPx).toBe(600);
    const huge = evaluateChromeErgonomics({ viewportWidthPx: 9999, viewportHeightPx: 9999 });
    expect(huge.viewportWidthPx).toBe(3840);
    expect(huge.viewportHeightPx).toBe(2160);
  });

  it("13. 활성 작업 단계에 따라 보고서의 탑바 도구 수와 LNB 핀 수가 정확히 연동된다", () => {
    const lineart = evaluateChromeErgonomics({ activePhaseId: "ink-lineart" });
    const qa = evaluateChromeErgonomics({ activePhaseId: "qa-export" });
    expect(lineart.calm.topBarToolCount).toBe(5);
    expect(lineart.calm.lnbPinCount).toBe(6);
    expect(qa.calm.topBarToolCount).toBe(5);
    expect(qa.calm.lnbPinCount).toBe(5);
  });

  it("14. 1920×1080 데스크톱 환경에서 기본 콤팩트 레일 캔버스 면적이 90% 이상이다", () => {
    const fhd = evaluateChromeErgonomics({ viewportWidthPx: 1920, viewportHeightPx: 1080 });
    expect(fhd.calm.canvasUsableRatioPct).toBeGreaterThanOrEqual(90);
  });

  // Section C — 6대 작업 단계별 적응형 탑 메뉴 & LNB 프로파일
  it("15. 6대 작업 단계(sketch-conti ~ qa-export) 프로파일이 모두 정의되어 있다", () => {
    const expectedIds: readonly WorkflowPhaseId[] = [
      "sketch-conti", "ink-lineart", "color-render", "solid-3d-stage", "lettering-sfx", "qa-export",
    ];
    expect(WORKFLOW_PHASE_CHROME_PROFILES.map((p) => p.id)).toEqual(expectedIds);
  });

  it("16. 모든 6개 단계에서 탑 바 도구 정확히 5개(<=6)·LNB 핀 <=6 예산을 불변식으로 지킨다", () => {
    for (const profile of WORKFLOW_PHASE_CHROME_PROFILES) {
      expect(profile.topBarTools).toHaveLength(5);
      expect(profile.topBarTools.length).toBeLessThanOrEqual(6);
      expect(profile.lnbRailItems.length).toBeGreaterThanOrEqual(5);
      expect(profile.lnbRailItems.length).toBeLessThanOrEqual(6);
    }
  });

  it("17. 모든 단계가 중복 없는 도구 ID·서랍 보조 도구(>=3)·푸터 상태 프리셋을 가진다", () => {
    for (const profile of WORKFLOW_PHASE_CHROME_PROFILES) {
      const toolIds = new Set(profile.topBarTools.map((t) => t.id));
      const railIds = new Set(profile.lnbRailItems.map((r) => r.id));
      expect(toolIds.size).toBe(profile.topBarTools.length);
      expect(railIds.size).toBe(profile.lnbRailItems.length);
      expect(profile.overflowDrawerToolsKo.length).toBeGreaterThanOrEqual(3);
      expect(profile.footerStatus.saveLabelKo.length).toBeGreaterThan(3);
    }
  });

  it("18. 모든 6개 작업 단계의 OKLCH 강조 색조가 바이올렛 금지 대역(265°~325°) 밖에 있다", () => {
    for (const profile of WORKFLOW_PHASE_CHROME_PROFILES) {
      const inViolet = profile.accentHueDeg >= 265 && profile.accentHueDeg <= 325;
      expect(inViolet).toBe(false);
    }
  });

  it("19. solid-3d-stage 단계가 AtelierSolid와 AtelierCast 핵심 도구를 탑 바에 함께 배치한다", () => {
    const stage3d = getWorkflowPhaseProfile("solid-3d-stage");
    const brands = new Set(stage3d.topBarTools.map((t) => t.brandEngine));
    expect(brands.has("AtelierSolid")).toBe(true);
    expect(brands.has("AtelierCast")).toBe(true);
  });

  it("20. getWorkflowPhaseProfile이 6개 단계 ID 모두를 정확히 반환한다", () => {
    for (const profile of WORKFLOW_PHASE_CHROME_PROFILES) {
      expect(getWorkflowPhaseProfile(profile.id).id).toBe(profile.id);
    }
  });

  // Section D — Cmd+K 의도 검색 & 예측 프리페치 3건
  it("21. 정본 목적지 카탈로그가 정확히 24개(4대 GNB 축별 6개)이며 ID·경로가 고유하다", () => {
    expect(CANONICAL_INTENT_ROUTES).toHaveLength(24);
    expect(new Set(CANONICAL_INTENT_ROUTES.map((r) => r.id)).size).toBe(24);
    expect(new Set(CANONICAL_INTENT_ROUTES.map((r) => r.href)).size).toBe(24);
    for (const pillar of CALM_CHROME_GNB_PILLARS) {
      const count = CANONICAL_INTENT_ROUTES.filter((r) => r.pillarId === pillar.id).length;
      expect(count).toBe(6);
    }
  });

  it("22. Cmd+K 자연어 의도 '선화' 검색 시 바로 그리기(/studio/canvas)가 1순위로 랭킹된다", () => {
    const result = searchIntentRoutes("선화");
    expect(result.hits[0]?.route.id).toBe("draw-canvas-instant");
    expect(result.hits[0]?.route.href).toBe("/studio/canvas");
  });

  it("23. Cmd+K 자연어 의도 '3d' 검색 시 3D 솔리드 CAD 배경(/studio/bg3d)이 1순위로 랭킹된다", () => {
    const result = searchIntentRoutes("3d");
    expect(result.hits[0]?.route.id).toBe("solid-cad-bg3d");
    expect(result.hits[0]?.route.href).toBe("/studio/bg3d");
  });

  it("24. Cmd+K 자연어 의도 '발표' 검색 시 기술 발표 덱(/tech)이 1순위로 랭킹된다", () => {
    const result = searchIntentRoutes("발표");
    expect(result.hits[0]?.route.id).toBe("tech-presentation-deck");
    expect(result.hits[0]?.route.href).toBe("/tech");
  });

  it("25. Cmd+K 자연어 의도 '캐릭터' 검색 시 3D 캐릭터 셰이퍼(/studio/character)가 1순위로 랭킹된다", () => {
    const result = searchIntentRoutes("캐릭터");
    expect(result.hits[0]?.route.id).toBe("cast-character-shaper");
    expect(result.hits[0]?.route.href).toBe("/studio/character");
  });

  it("26. Cmd+K 자연어 의도 '협업' 검색 시 가상 작업실(/studio/space)이 1순위로 랭킹된다", () => {
    const result = searchIntentRoutes("협업");
    expect(result.hits[0]?.route.id).toBe("stage-virtual-space");
    expect(result.hits[0]?.route.href).toBe("/studio/space");
  });

  it("27. Cmd+K 자연어 의도 '내보내기' 검색 시 검수·출고 패키지(/studio/export)가 1순위로 랭킹된다", () => {
    const result = searchIntentRoutes("내보내기");
    expect(result.hits[0]?.route.id).toBe("stage-review-export");
    expect(result.hits[0]?.route.href).toBe("/studio/export");
  });

  it("28. 한글 초성 추출 및 초성 검색(ㅂㄹㅅ · ㄱㅅ · ㅇㅇㅈ)이 정확히 매칭된다", () => {
    expect(extractKoreanChoseong("브러시 질감")).toBe("ㅂㄹㅅㅈㄱ");
    expect(isChoseongIntentQuery("ㅂㄹㅅ")).toBe(true);
    expect(isChoseongIntentQuery("선화")).toBe(false);
    expect(isChoseongIntentQuery("   ")).toBe(false);

    const brush = searchIntentRoutes("ㅂㄹㅅ");
    expect(brush.isChoseong).toBe(true);
    expect(brush.hits[0]?.route.id).toBe("draw-brush-texture");

    const glossary = searchIntentRoutes("ㅇㅇㅈ");
    expect(glossary.hits.some((h) => h.route.id === "tech-easy-glossary")).toBe(true);
  });

  it("29. 빈 질의·일반 질의·매칭 0건 질의 모두에서 예측 프리페치 3건을 중복 없이 산출한다", () => {
    const scenarios = [
      searchIntentRoutes("", { activePhaseId: "color-render" }),
      searchIntentRoutes("캐릭터", { activePhaseId: "solid-3d-stage" }),
      searchIntentRoutes("존재하지않는의도xyz999", { activePhaseId: "qa-export" }),
    ];
    for (const res of scenarios) {
      expect(res.prefetchTargets).toHaveLength(3);
      expect(new Set(res.prefetchTargets.map((t) => t.routeId)).size).toBe(3);
      for (const target of res.prefetchTargets) {
        expect(target.confidencePct).toBeGreaterThanOrEqual(60);
        expect(target.confidencePct).toBeLessThanOrEqual(100);
        expect(target.href.startsWith("/")).toBe(true);
      }
    }
  });

  it("30. 다중 토큰 자연어 질의('광학 블룸', '권리 BOM')로 관련 정본 목적지를 찾는다", () => {
    expect(searchIntentRoutes("광학 블룸").hits[0]?.route.id).toBe("draw-optical-filter");
    expect(searchIntentRoutes("권리 BOM").hits[0]?.route.id).toBe("stage-review-export");
  });

  // Section E — 비주얼 언두 필름스트립 & JSON 내보내기
  it("31. buildVisualUndoTimeline이 6장 스냅샷과 최신 시점 기본 상태를 생성한다", () => {
    const tl = buildVisualUndoTimeline();
    expect(tl.frames).toHaveLength(6);
    expect(tl.activeIndex).toBe(5);
    expect(tl.undoDepth).toBe(5);
    expect(tl.redoDepth).toBe(0);
    expect(tl.frames[5]?.isCurrentHead).toBe(true);
    expect(tl.resumeBreadcrumbKo).toHaveLength(3);
  });

  it("32. restoreVisualUndoSnapshot이 불변 1클릭 복원과 Breadcrumb 동기화를 수행한다", () => {
    const initial = buildVisualUndoTimeline();
    const restored = restoreVisualUndoSnapshot(initial, 2);
    expect(initial.activeIndex).toBe(5);
    expect(restored.activeIndex).toBe(2);
    expect(restored.undoDepth).toBe(2);
    expect(restored.redoDepth).toBe(3);
    expect(restored.frames[2]?.isCurrentHead).toBe(true);
    expect(restored.frames[2]?.canRestore).toBe(false);
    expect(restored.resumeBreadcrumbKo[0]).toBe("3D/캐릭터");
    expect(restored.lastActionSummaryKo).toContain("예시 프레임을 선택했습니다.");
  });

  it("33. restoreVisualUndoSnapshot이 범위 밖 인덱스를 0과 마지막 인덱스로 안전 클램프한다", () => {
    const initial = buildVisualUndoTimeline();
    expect(restoreVisualUndoSnapshot(initial, -10).activeIndex).toBe(0);
    expect(restoreVisualUndoSnapshot(initial, 99).activeIndex).toBe(5);
  });

  it("34. exportNavFlowArchitectureJson이 v3 스키마·4대 축·24 라우트·프리페치 3건 JSON을 출력한다", () => {
    const ergonomics = evaluateChromeErgonomics({ activePhaseId: "ink-lineart" });
    const searchResult = searchIntentRoutes("선화", { activePhaseId: "ink-lineart" });
    const timeline = buildVisualUndoTimeline({ activeIndex: 3 });
    const parsed = JSON.parse(exportNavFlowArchitectureJson({ ergonomics, searchResult, timeline })) as {
      schemaVersion: string;
      mode: string;
      brand: typeof ATELIER_NAV_BRAND;
      gnbPillars: readonly unknown[];
      intentLauncher: { totalCatalogRoutes: number; prefetchTargets: readonly unknown[] };
      visualUndo: { activeIndex: number; totalSnapshots: number };
    };
    expect(parsed.schemaVersion).toBe(NAV_FLOW_SCHEMA_VERSION);
    expect(parsed.mode).toBe("simulation-model");
    expect(parsed.brand.chrome).toBe("CalmChrome");
    expect(parsed.gnbPillars).toHaveLength(4);
    expect(parsed.intentLauncher.totalCatalogRoutes).toBe(24);
    expect(parsed.intentLauncher.prefetchTargets).toHaveLength(3);
    expect(parsed.visualUndo.activeIndex).toBe(3);
    expect(parsed.visualUndo.totalSnapshots).toBe(6);
  });

  it("35. 동일 상태에 대해 exportNavFlowArchitectureJson이 완전히 결정론적이다", () => {
    const ergonomics = evaluateChromeErgonomics();
    const searchResult = searchIntentRoutes("3d");
    const timeline = buildVisualUndoTimeline();
    const a = exportNavFlowArchitectureJson({ ergonomics, searchResult, timeline });
    const b = exportNavFlowArchitectureJson({ ergonomics, searchResult, timeline });
    expect(a).toBe(b);
  });

  // Section F — StudioAtelierNavFlowPanel 인터랙티브 UI 검증
  it("36. props 없이 기본 렌더링 시 와이어프레임 SVG·Breadcrumb·4대 크롬 감사 카드가 표시된다", () => {
    render(<StudioAtelierNavFlowPanel />);
    expect(screen.getByTestId("studio-atelier-nav-flow-panel")).toBeTruthy();
    expect(screen.getByTestId("calm-chrome-wireframe-svg")).toBeTruthy();
    expect(screen.getByTestId("nav-resume-breadcrumb")).toBeTruthy();
    expect(screen.getByTestId("metric-click-depth").textContent).toContain("3.8 → 1.4");
    expect(screen.getByTestId("metric-canvas-area").textContent).toContain("88.7%");
    expect(screen.getByTestId("chrome-audit-gnb")).toBeTruthy();
    expect(screen.getByTestId("chrome-audit-lnb")).toBeTruthy();
    expect(screen.getByTestId("chrome-audit-top-menu")).toBeTruthy();
    expect(screen.getByTestId("chrome-audit-footer")).toBeTruthy();
  });

  it("37. LNB 확장·몰입 96%·Cmd+K 오버레이·푸터 사이트맵 토글이 면적 지표와 SVG를 실시간 갱신한다", () => {
    render(<StudioAtelierNavFlowPanel />);
    fireEvent.click(screen.getByTestId("toggle-lnb-expand"));
    expect(screen.getByTestId("toggle-lnb-expand").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("metric-canvas-area").textContent).not.toContain("88.7%");

    fireEvent.click(screen.getByTestId("toggle-footer-sitemap"));
    expect(screen.getByTestId("toggle-footer-sitemap").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("toggle-immersive-focus"));
    expect(screen.getByTestId("metric-canvas-area").textContent).toContain("96.9%");
    expect(screen.queryByTestId("wireframe-lnb-rail")).toBeNull();
    expect(screen.queryByTestId("wireframe-footer-bar")).toBeNull();

    fireEvent.click(screen.getByTestId("toggle-cmdk-overlay"));
    expect(screen.queryByTestId("wireframe-cmdk-overlay")).toBeNull();
  });

  it("38. 6대 작업 단계 탭 클릭 시 탑 바 5도구·LNB 레일·푸터 상태가 변신하고 onPhaseChange를 호출한다", () => {
    const onPhaseChange = vi.fn();
    render(<StudioAtelierNavFlowPanel onPhaseChange={onPhaseChange} />);

    fireEvent.click(screen.getByTestId("phase-tab-solid-3d-stage"));
    expect(onPhaseChange).toHaveBeenCalledTimes(1);
    expect(onPhaseChange.mock.calls[0]?.[0]?.id).toBe("solid-3d-stage");
    expect(screen.getByTestId("active-phase-topbar-tools").textContent).toContain("솔리드 돌출");
    expect(screen.getByTestId("active-phase-topbar-tools").textContent).toContain("의상 케이지 리핏");
    expect(screen.getByTestId("active-phase-lnb-items").textContent).toContain("AtelierSolid CAD");
    expect(screen.getByTestId("active-phase-footer-status").textContent).toContain("메시 검사 상태 예시");

    fireEvent.click(screen.getByTestId("phase-tab-qa-export"));
    expect(screen.getByTestId("active-phase-topbar-tools").textContent).toContain("권리 BOM 점검");
    expect(screen.getByTestId("active-phase-footer-status").textContent).toContain("권리 검사 상태 표시 예시");
  });

  it("39. 라이브 Cmd+K 검색 입력·칩 클릭이 결과를 랭킹하고 목적지 클릭 시 onSelectRoute를 호출한다", () => {
    const onSelectRoute = vi.fn();
    render(<StudioAtelierNavFlowPanel onSelectRoute={onSelectRoute} />);

    fireEvent.click(screen.getByTestId("intent-chip-발표"));
    const deckBtn = screen.getByTestId("cmdk-hit-tech-presentation-deck");
    fireEvent.click(deckBtn);
    expect(onSelectRoute).toHaveBeenCalledTimes(1);
    expect(onSelectRoute.mock.calls[0]?.[0]?.href).toBe("/tech");

    const input = screen.getByTestId("cmdk-intent-input");
    fireEvent.change(input, { target: { value: "ㅂㄹㅅ" } });
    expect(screen.getByTestId("cmdk-hit-draw-brush-texture")).toBeTruthy();
    expect(screen.getByTestId("nav-prefetch-list").querySelectorAll("li")).toHaveLength(3);

    fireEvent.click(screen.getByTestId("cmdk-clear-btn"));
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("40. 비주얼 언두 필름스트립 클릭 및 이전/다음/최신 버튼이 1클릭 복원과 Breadcrumb을 동기화한다", () => {
    const onRestoreSnapshot = vi.fn();
    render(<StudioAtelierNavFlowPanel onRestoreSnapshot={onRestoreSnapshot} />);

    fireEvent.click(screen.getByTestId("undo-frame-1"));
    expect(onRestoreSnapshot).toHaveBeenCalledTimes(1);
    expect(onRestoreSnapshot.mock.calls[0]?.[0]?.id).toBe("snap-02-solid3d");
    expect(screen.getByTestId("nav-resume-breadcrumb").textContent).toContain("AtelierSolid 배경 투영");

    fireEvent.click(screen.getByTestId("undo-prev-btn"));
    expect(screen.getByTestId("undo-frame-0").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("undo-next-btn"));
    expect(screen.getByTestId("undo-frame-1").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("undo-latest-btn"));
    expect(screen.getByTestId("undo-frame-5").getAttribute("aria-pressed")).toBe("true");
  });

  it("41. JSON 복사 버튼과 locale='en' 영문 모드가 정상 동작한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<StudioAtelierNavFlowPanel locale="en" />);
    expect(screen.getByText(/4-Pillar Flat Navigation/u)).toBeTruthy();
    fireEvent.click(screen.getByTestId("nav-copy-json-btn"));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("nav-copy-json-btn").textContent).toContain("JSON Copied");
  });

  // Section G — 디자인 위생 · 고유 브랜드 청정 · 라인 예산 정적 감사
  it("42. 소스 파일에 원시 색상·바이올렛(270~320°)·transition-all·Sparkles·Web Storage·'= {}' props가 0건이다", () => {
    expect(ALL_MODULE_SOURCES).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(ALL_MODULE_SOURCES).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\s*\(/u);
    expect(ALL_MODULE_SOURCES).not.toMatch(/\b(?:violet|purple|indigo|fuchsia)-/u);
    expect(ALL_MODULE_SOURCES).not.toContain("transition-all");
    expect(ALL_MODULE_SOURCES).not.toContain("Sparkles");
    expect(ALL_MODULE_SOURCES).not.toMatch(/\b(?:localStorage|sessionStorage|indexedDB)\b/u);
    expect(PANEL_SRC).not.toMatch(/=\s*\{\s*\}/u);

    const oklchHues = [...ALL_MODULE_SOURCES.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/gu)]
      .map((match) => Number(match[1]));
    for (const hue of oklchHues) {
      expect(hue < 270 || hue > 320).toBe(true);
    }
  });

  it("43. 100% ToonStudio 고유 브랜드만 사용하며 외부 제품명이 0건이다", () => {
    expect(ALL_MODULE_SOURCES).toContain("CalmChrome");
    expect(ALL_MODULE_SOURCES).toContain("AtelierInk");
    expect(ALL_MODULE_SOURCES).toContain("AtelierSolid");
    expect(ALL_MODULE_SOURCES).toContain("AtelierCast");
    expect(ALL_MODULE_SOURCES).toContain("AtelierStage");

    // 외부 제품명 차단 검사는 문자 코드로 구성해 테스트 소스 자체에도 외부 브랜드 문자열이 남지 않게 한다.
    const blockedExternalTokens = [
      fromCodes([112, 104, 111, 116, 111, 115, 104, 111, 112]),
      fromCodes([99, 108, 105, 112, 32, 115, 116, 117, 100, 105, 111]),
      fromCodes([112, 114, 111, 99, 114, 101, 97, 116, 101]),
      fromCodes([102, 105, 103, 109, 97]),
      fromCodes([98, 108, 101, 110, 100, 101, 114]),
      fromCodes([115, 107, 101, 116, 99, 104, 117, 112]),
      fromCodes([110, 111, 116, 105, 111, 110]),
      fromCodes([108, 105, 110, 101, 97, 114, 46, 97, 112, 112]),
    ];
    const lowerSources = ALL_MODULE_SOURCES.toLowerCase();
    for (const token of blockedExternalTokens) {
      expect(lowerSources).not.toContain(token);
    }
  });

  it("44. 접근성·타이포 계약(min-h-11·tabular-nums·keep-all·motion-reduce) 및 파일 라인 예산을 준수한다", () => {
    expect(PANEL_SRC).toContain("min-h-11");
    expect(PANEL_SRC).toContain("tabular-nums");
    expect(PANEL_SRC).toContain("[word-break:keep-all]");
    expect(PANEL_SRC).toContain("motion-reduce:transition-none");

    expect(ENGINE_SRC.split("\n").length).toBeLessThanOrEqual(720);
    expect(PANEL_SRC.split("\n").length).toBeLessThanOrEqual(680);
    expect(INDEX_SRC.split("\n").length).toBeLessThanOrEqual(80);
  });
});
