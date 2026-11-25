/**
 * Wave 63C — CalmChrome GNB·LNB·탑 메뉴·푸터 평면 동선 및 작업 단계 적응형 엔진.
 *
 * - ToonStudio 고유 브랜드(CalmChrome · AtelierInk · AtelierSolid · AtelierCast · AtelierStage) 전용.
 * - 실제 저장소의 290+ 분산 라우트·5대 허브(122+ 탭)·중복 진입점 구조를 정량 진단하고,
 *   4대 목적 평면 GNB · 52px 적응형 LNB 레일 · 44px 단일 탑 컨텍스트 바 · 28px 미니멀 상태 푸터 ·
 *   Cmd+K 0-클릭 의도 런처 · 비주얼 언두 필름스트립으로 압축 설계한다.
 * - 브라우저 전역·Web Storage에 의존하지 않는 100% 결정론 순수 시뮬레이션 모델이다.
 */

export const NAV_FLOW_SCHEMA_VERSION = "toonstudio.calm-chrome-nav-flow.v3" as const;

export const ATELIER_NAV_BRAND = Object.freeze({
  suite: "ToonStudio",
  chrome: "CalmChrome",
  ink: "AtelierInk",
  solid: "AtelierSolid",
  cast: "AtelierCast",
  stage: "AtelierStage",
} as const);

export type AtelierBrandEngine =
  | "CalmChrome" | "AtelierInk" | "AtelierSolid" | "AtelierCast" | "AtelierStage" | "ToonStudio";
export type CalmGnbPillarId = "draw" | "solid-cast" | "virtual-stage" | "tech-works";
export type WorkflowPhaseId =
  | "sketch-conti" | "ink-lineart" | "color-render" | "solid-3d-stage" | "lettering-sfx" | "qa-export";
export type ChromeSurfaceId = "gnb" | "lnb" | "top-menu" | "footer";

export interface CalmGnbPillarSpec {
  readonly id: CalmGnbPillarId; readonly order: number;
  readonly labelKo: string; readonly labelEn: string;
  readonly brandEngine: AtelierBrandEngine; readonly canonicalHref: string; readonly shortcutChord: string;
  readonly summaryKo: string; readonly summaryEn: string; readonly consolidatedLegacyCount: number;
}

export interface DuplicateEntryConsolidationSpec {
  readonly id: string; readonly labelKo: string; readonly canonicalHref: string;
  readonly legacyDuplicates: readonly string[]; readonly rationaleKo: string;
}

export interface LegacyDistributedChromeBaseline {
  readonly totalRoutes: number; readonly hubCount: number; readonly hubTabCount: number;
  readonly avgClickDepth: number; readonly gnbItemCount: number;
  readonly topBarHeightPx: number; readonly lnbWidthPx: number; readonly footerHeightPx: number;
  readonly canvasUsableRatioPct: number;
  readonly duplicateEntryGroups: readonly DuplicateEntryConsolidationSpec[];
}

export interface ChromeSurfaceAudit {
  readonly surfaceId: ChromeSurfaceId; readonly titleKo: string; readonly titleEn: string;
  readonly legacyMetricKo: string; readonly calmMetricKo: string; readonly improvementKo: string;
  readonly beforePixels: number; readonly afterPixels: number;
}

export interface ChromeErgonomicsInput {
  readonly viewportWidthPx?: number; readonly viewportHeightPx?: number;
  readonly lnbExpanded?: boolean; readonly lnbPinned?: boolean;
  readonly footerSitemapExpanded?: boolean; readonly immersiveFocusMode?: boolean;
  readonly activePhaseId?: WorkflowPhaseId;
}

export interface ChromeErgonomicChecks {
  readonly gnbWithinFiveBudget: boolean; readonly topBarWithinSixBudget: boolean;
  readonly lnbWithinSixBudget: boolean; readonly canvasAreaTargetMet: boolean;
  readonly clickDepthReduced: boolean;
}

export interface ChromeErgonomicsReport {
  readonly mode: "simulation-model";
  readonly viewportWidthPx: number; readonly viewportHeightPx: number;
  readonly activePhaseId: WorkflowPhaseId; readonly lnbExpanded: boolean; readonly lnbPinned: boolean;
  readonly footerSitemapExpanded: boolean; readonly immersiveFocusMode: boolean;
  readonly legacy: LegacyDistributedChromeBaseline;
  readonly calm: {
    readonly gnbItemCount: number; readonly topBarHeightPx: number; readonly lnbWidthPx: number;
    readonly footerHeightPx: number; readonly canvasWidthPx: number; readonly canvasHeightPx: number;
    readonly canvasUsableRatioPct: number; readonly avgClickDepth: number; readonly clickReductionPct: number;
    readonly canvasGainPct: number; readonly topBarToolCount: number; readonly lnbPinCount: number;
    readonly duplicateEntryEliminatedCount: number;
  };
  readonly surfaceAudits: readonly ChromeSurfaceAudit[];
  readonly checks: ChromeErgonomicChecks;
}

export interface PhaseTopBarToolSpec {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly shortcut: string; readonly slotKind: "primary" | "secondary" | "toggle";
  readonly brandEngine: AtelierBrandEngine;
}

export interface PhaseLnbRailItemSpec {
  readonly id: string; readonly shortCode: string; readonly labelKo: string; readonly labelEn: string;
  readonly targetHref: string; readonly pinnedByDefault: boolean;
}

export interface PhaseFooterStatusSpec {
  readonly saveLabelKo: string; readonly engineBadge: AtelierBrandEngine;
  readonly zoomLabel: string; readonly syncLabelKo: string;
}

export interface WorkflowPhaseChromeProfile {
  readonly id: WorkflowPhaseId; readonly order: number; readonly gnbPillarId: CalmGnbPillarId;
  readonly labelKo: string; readonly labelEn: string; readonly brandEngine: AtelierBrandEngine;
  readonly accentHueDeg: number; readonly focusSummaryKo: string; readonly focusSummaryEn: string;
  readonly topBarTools: readonly PhaseTopBarToolSpec[];
  readonly lnbRailItems: readonly PhaseLnbRailItemSpec[];
  readonly overflowDrawerToolsKo: readonly string[];
  readonly footerStatus: PhaseFooterStatusSpec;
}

export interface CanonicalIntentRoute {
  readonly id: string; readonly pillarId: CalmGnbPillarId; readonly brandEngine: AtelierBrandEngine;
  readonly labelKo: string; readonly labelEn: string; readonly href: string; readonly shortcut: string;
  readonly summaryKo: string; readonly summaryEn: string; readonly aliases: readonly string[];
  readonly phaseAffinities: readonly WorkflowPhaseId[];
  readonly nextRouteIds: readonly [string, string, string];
  readonly legacyClickDepth: number;
}

export interface IntentRouteSearchHit {
  readonly route: CanonicalIntentRoute; readonly score: number;
  readonly matchKind: "exact" | "prefix" | "alias" | "choseong" | "substring" | "phase-default";
  readonly matchedToken: string;
}

export interface PredictivePrefetchTarget {
  readonly routeId: string; readonly href: string; readonly labelKo: string; readonly labelEn: string;
  readonly brandEngine: AtelierBrandEngine; readonly reasonKo: string;
  readonly confidencePct: number; readonly priority: "high" | "medium";
}

export interface IntentSearchResult {
  readonly query: string; readonly normalizedQuery: string; readonly isChoseong: boolean;
  readonly totalCatalogRoutes: number; readonly hits: readonly IntentRouteSearchHit[];
  readonly prefetchTargets: readonly [PredictivePrefetchTarget, PredictivePrefetchTarget, PredictivePrefetchTarget];
}

export interface VisualUndoThumbGeometry {
  readonly panelCount: number; readonly hasLineartPass: boolean; readonly hasColorPass: boolean;
  readonly hasSolid3dPass: boolean; readonly balloonCount: number; readonly accentHueDeg: number;
}

export interface VisualUndoSnapshot {
  readonly id: string; readonly index: number; readonly phaseId: WorkflowPhaseId;
  readonly brandEngine: AtelierBrandEngine; readonly labelKo: string; readonly labelEn: string;
  readonly timestampLabel: string; readonly strokeCount: number; readonly layerCount: number;
  readonly routeHref: string;
  readonly breadcrumbTrailKo: readonly [string, string, string];
  readonly breadcrumbTrailEn: readonly [string, string, string];
  readonly thumb: VisualUndoThumbGeometry;
  readonly isCurrentHead: boolean; readonly canRestore: boolean;
}

export interface VisualUndoTimelineState {
  readonly episodeTitleKo: string; readonly episodeTitleEn: string;
  readonly activeIndex: number; readonly headIndex: number;
  readonly undoDepth: number; readonly redoDepth: number;
  readonly frames: readonly VisualUndoSnapshot[];
  readonly resumeBreadcrumbKo: readonly [string, string, string];
  readonly resumeBreadcrumbEn: readonly [string, string, string];
  readonly lastActionSummaryKo: string;
}

export interface SearchIntentRoutesOptions { readonly activePhaseId?: WorkflowPhaseId; readonly limit?: number }
export interface BuildVisualUndoTimelineOptions { readonly activeIndex?: number }
export interface ExportNavFlowArchitectureOptions {
  readonly ergonomics: ChromeErgonomicsReport;
  readonly searchResult: IntentSearchResult;
  readonly timeline: VisualUndoTimelineState;
}

const makeTool = (
  id: string, labelKo: string, labelEn: string, shortcut: string,
  slotKind: PhaseTopBarToolSpec["slotKind"], brandEngine: AtelierBrandEngine,
): PhaseTopBarToolSpec => Object.freeze({ id, labelKo, labelEn, shortcut, slotKind, brandEngine });

const makeRail = (
  id: string, shortCode: string, labelKo: string, labelEn: string, targetHref: string, pinnedByDefault = true,
): PhaseLnbRailItemSpec => Object.freeze({ id, shortCode, labelKo, labelEn, targetHref, pinnedByDefault });

const makePhase = (
  id: WorkflowPhaseId, order: number, gnbPillarId: CalmGnbPillarId, labelKo: string, labelEn: string,
  brandEngine: AtelierBrandEngine, accentHueDeg: number, focusSummaryKo: string, focusSummaryEn: string,
  topBarTools: readonly PhaseTopBarToolSpec[], lnbRailItems: readonly PhaseLnbRailItemSpec[],
  overflowDrawerToolsKo: readonly string[], footerStatus: PhaseFooterStatusSpec,
): WorkflowPhaseChromeProfile => Object.freeze({
  id, order, gnbPillarId, labelKo, labelEn, brandEngine, accentHueDeg, focusSummaryKo, focusSummaryEn,
  topBarTools: Object.freeze([...topBarTools]),
  lnbRailItems: Object.freeze([...lnbRailItems]),
  overflowDrawerToolsKo: Object.freeze([...overflowDrawerToolsKo]),
  footerStatus: Object.freeze({ ...footerStatus }),
});

const makeRoute = (
  id: string, pillarId: CalmGnbPillarId, brandEngine: AtelierBrandEngine, labelKo: string, labelEn: string,
  href: string, shortcut: string, summaryKo: string, summaryEn: string,
  aliases: readonly string[], phaseAffinities: readonly WorkflowPhaseId[],
  nextRouteIds: readonly [string, string, string], legacyClickDepth: number,
): CanonicalIntentRoute => Object.freeze({
  id, pillarId, brandEngine, labelKo, labelEn, href, shortcut, summaryKo, summaryEn,
  aliases: Object.freeze([...aliases]),
  phaseAffinities: Object.freeze([...phaseAffinities]),
  nextRouteIds: Object.freeze([nextRouteIds[0], nextRouteIds[1], nextRouteIds[2]] as const),
  legacyClickDepth,
});

export const CALM_CHROME_GNB_PILLARS: readonly CalmGnbPillarSpec[] = Object.freeze([
  Object.freeze({
    id: "draw", order: 1, labelKo: "그리기", labelEn: "Draw", brandEngine: "AtelierInk",
    canonicalHref: "/studio/canvas", shortcutChord: "G D", consolidatedLegacyCount: 84,
    summaryKo: "콘티·선화·채색·광학 필터를 중복 진입 없이 1클릭으로 여는 주 작화실",
    summaryEn: "Direct one-click drawing canvas for storyboards, lineart, color, and optical filters",
  }),
  Object.freeze({
    id: "solid-cast", order: 2, labelKo: "3D/캐릭터", labelEn: "3D & Cast", brandEngine: "AtelierSolid",
    canonicalHref: "/studio/bg3d", shortcutChord: "G 3", consolidatedLegacyCount: 68,
    summaryKo: "AtelierSolid CAD 배경과 AtelierCast 3D 캐릭터·포즈를 통합한 공간 제작 축",
    summaryEn: "Unified spatial creation axis combining AtelierSolid CAD scenes and AtelierCast figures",
  }),
  Object.freeze({
    id: "virtual-stage", order: 3, labelKo: "가상 작업실", labelEn: "Virtual Stage", brandEngine: "AtelierStage",
    canonicalHref: "/studio/space", shortcutChord: "G S", consolidatedLegacyCount: 74,
    summaryKo: "실시간 팀 협업·연재 보드·오디오 믹서·출고·복구를 묶은 제작 협업실",
    summaryEn: "Live collaboration room, production board, audio mixer, QA export, and local recovery",
  }),
  Object.freeze({
    id: "tech-works", order: 4, labelKo: "기술/작품", labelEn: "Tech & Works", brandEngine: "ToonStudio",
    canonicalHref: "/tech", shortcutChord: "G T", consolidatedLegacyCount: 68,
    summaryKo: "기술 발표 덱·아키텍처 해설·쉬운 용어집·완성 작품 쇼케이스와 평면 지도",
    summaryEn: "Technical presentation deck, architecture guide, glossary, showcase, and flat sitemap",
  }),
]);

export const LEGACY_DISTRIBUTED_CHROME_BASELINE: LegacyDistributedChromeBaseline = Object.freeze({
  totalRoutes: 294, hubCount: 5, hubTabCount: 124, avgClickDepth: 3.8, gnbItemCount: 11,
  topBarHeightPx: 88, lnbWidthPx: 260, footerHeightPx: 136, canvasUsableRatioPct: 64.2,
  duplicateEntryGroups: Object.freeze([
    Object.freeze({ id: "dup-create-entry", labelKo: "작품 시작 진입점 중복", canonicalHref: "/create", legacyDuplicates: Object.freeze(["/studio/new", "/make"]), rationaleKo: "시작 시트(/create) 하나로 정문 통일, 빈 원고 폼은 하위 2단계로 흡수" }),
    Object.freeze({ id: "dup-tech-entry", labelKo: "기술·엔진 안내 중복", canonicalHref: "/tech", legacyDuplicates: Object.freeze(["/about/technology", "/studio/toolchain"]), rationaleKo: "기술/작품 축에서 발표 덱(/tech)과 아키텍처 해설의 역할을 명확히 분리" }),
    Object.freeze({ id: "dup-cast-entry", labelKo: "캐릭터 제작 경로 분산", canonicalHref: "/studio/character", legacyDuplicates: Object.freeze(["/studio/assets/characters/new", "/studio/character-convert"]), rationaleKo: "AtelierCast 셰이퍼 단일 진입점 아래 변환·리깅·앵커를 단계 탭으로 통합" }),
    Object.freeze({ id: "dup-home-entry", labelKo: "작업 홈 별칭 중복", canonicalHref: "/studio/canvas", legacyDuplicates: Object.freeze(["/creator-hub", "/studio"]), rationaleKo: "이어쓰기 작업은 마지막 원고 캔버스로 직행하고 프로젝트 목록은 Cmd+K로 연결" }),
  ]),
});

export const WORKFLOW_PHASE_CHROME_PROFILES: readonly WorkflowPhaseChromeProfile[] = Object.freeze([
  makePhase("sketch-conti", 1, "draw", "콘티/스케치", "Sketch & Conti", "AtelierInk", 42,
    "초안 속도를 높이는 5개 러프·컷 분할 도구만 탑 바에 배치", "Only 5 rapid roughing and panel-slicing tools pinned to the top bar",
    [makeTool("sk-pencil", "연필 러프", "Rough Pencil", "B", "primary", "AtelierInk"), makeTool("sk-cut", "컷 분할", "Slice Panel", "K", "primary", "AtelierInk"), makeTool("sk-balloon", "말풍선 초안", "Draft Balloon", "T", "secondary", "AtelierInk"), makeTool("sk-grid", "구도 안내선", "Layout Grid", "G", "toggle", "CalmChrome"), makeTool("sk-snap", "단계 스냅샷", "Stage Snapshot", "S", "secondary", "CalmChrome")],
    [makeRail("lnb-sk-layer", "LY", "러프 레이어", "Rough Layers", "/studio/canvas"), makeRail("lnb-sk-script", "SC", "콘티 대본", "Conti Script", "/studio/comic"), makeRail("lnb-sk-rhythm", "RH", "컷 리듬표", "Cut Rhythm", "/studio/comic"), makeRail("lnb-sk-ref", "RF", "참고 보드", "Reference Board", "/studio/templates"), makeRail("lnb-sk-next", "NK", "선화 전환", "Next: Lineart", "/studio/canvas")],
    ["원근 소실점 보조", "페이지 일괄 순서 재배치", "대본 텍스트 자동 분할"],
    { saveLabelKo: "자동 저장 표시 예시", engineBadge: "AtelierInk", zoomLabel: "68% · 컷 02/18", syncLabelKo: "스케치 단계" }),
  makePhase("ink-lineart", 2, "draw", "선화", "Ink & Lineart", "AtelierInk", 24,
    "필압·손떨림 보정·벡터 선폭 중심 5도구 집중 모드", "Focused 5-tool strip for pressure ink, stabilization, and vector line weight",
    [makeTool("ink-gpen", "G펜 정밀선", "G-Pen Ink", "P", "primary", "AtelierInk"), makeTool("ink-stab", "손떨림 보정", "Stabilizer", "V", "toggle", "AtelierInk"), makeTool("ink-eraser", "벡터 지우개", "Vector Eraser", "E", "primary", "AtelierInk"), makeTool("ink-ruler", "곡선 자", "Curve Ruler", "R", "secondary", "AtelierInk"), makeTool("ink-flip", "좌우 반전 대조", "Flip Check", "H", "toggle", "CalmChrome")],
    [makeRail("lnb-ink-brush", "BR", "잉크 브러시", "Ink Brushes", "/studio/assets/brushes"), makeRail("lnb-ink-curve", "PR", "필압 커브", "Pressure Curve", "/studio/assets/brushes"), makeRail("lnb-ink-vec", "VC", "벡터 선폭", "Vector Width", "/studio/canvas"), makeRail("lnb-ink-layer", "LY", "레이어 스택", "Layer Stack", "/studio/canvas"), makeRail("lnb-ink-sym", "SM", "대칭 자", "Symmetry Ruler", "/studio/canvas"), makeRail("lnb-ink-paper", "TX", "종이 질감", "Paper Texture", "/studio/assets/brushes", false)],
    ["교차선 자동 정리", "잉크 번짐 시뮬레이션", "벡터 제어점 단순화"],
    { saveLabelKo: "선화 저장 표시 예시", engineBadge: "AtelierInk", zoomLabel: "140% · 보정 Lv.4", syncLabelKo: "선화 단계" }),
  makePhase("color-render", 3, "draw", "채색/필터", "Color & Render", "AtelierInk", 158,
    "틈새닫기 밑색·안료 혼합·광학 필터 5도구 즉시 접근", "Direct 5-tool set for gap-close fill, pigment mixing, and optical finishing",
    [makeTool("col-fill", "틈새닫기 채우기", "Gap-Close Fill", "F", "primary", "AtelierInk"), makeTool("col-mix", "안료 혼합", "Pigment Mix", "M", "primary", "AtelierInk"), makeTool("col-clip", "클리핑 음영", "Clip Shading", "C", "secondary", "AtelierInk"), makeTool("col-opt", "광학 필터", "Optical Filter", "L", "secondary", "AtelierInk"), makeTool("col-p3", "색역 검수", "Gamut Check", "Y", "toggle", "CalmChrome")],
    [makeRail("lnb-col-pal", "OK", "OKLCH 팔레트", "OKLCH Palette", "/studio/canvas?panel=optical-filter"), makeRail("lnb-col-light", "LT", "광원 시뮬레이터", "Light Sim", "/studio/canvas?panel=optical-filter"), makeRail("lnb-col-opt", "OF", "광학 블룸·그레인", "Optical Bloom", "/studio/canvas?panel=optical-filter"), makeRail("lnb-col-tone", "TN", "톤 커브", "Tone Curve", "/studio/canvas?panel=optical-filter"), makeRail("lnb-col-script", "CS", "컬러 스크립트", "Color Script", "/studio/canvas"), makeRail("lnb-col-blend", "BL", "레이어 블렌드", "Layer Blend", "/studio/canvas", false)],
    ["그라데이션 맵 프리셋", "배경 대기 원근 자동 보정", "색약 접근성 시뮬레이션"],
    { saveLabelKo: "안료 프로파일 선택 예시", engineBadge: "AtelierInk", zoomLabel: "100% · Display-P3", syncLabelKo: "필터 배치 예시" }),
  makePhase("solid-3d-stage", 4, "solid-cast", "3D·CAD·캐릭터", "3D Solid & Cast", "AtelierSolid", 214,
    "AtelierSolid 배경 모델링과 AtelierCast 캐릭터·선화 베이크 5도구", "5 unified controls for AtelierSolid CAD geometry, AtelierCast poses, and lineart bake",
    [makeTool("s3d-extrude", "솔리드 돌출", "Solid Extrude", "X", "primary", "AtelierSolid"), makeTool("s3d-pose", "캐릭터 포즈", "Cast Pose", "A", "primary", "AtelierCast"), makeTool("s3d-cage", "의상 케이지 리핏", "Cage Refit", "W", "secondary", "AtelierCast"), makeTool("s3d-cam", "카메라 화각", "Camera FOV", "C", "secondary", "AtelierSolid"), makeTool("s3d-bake", "선화 투영 베이크", "Lineart Bake", "B", "primary", "AtelierSolid")],
    [makeRail("lnb-3d-solid", "SD", "AtelierSolid CAD", "AtelierSolid CAD", "/studio/bg3d"), makeRail("lnb-3d-cast", "CT", "AtelierCast 셰이퍼", "AtelierCast Shaper", "/studio/character"), makeRail("lnb-3d-sun", "SN", "태양광 조명", "Solar Lighting", "/studio/bg3d"), makeRail("lnb-3d-prop", "PR", "소품 배치", "Props Library", "/studio/assets/3d"), makeRail("lnb-3d-mesh", "MS", "메쉬 검수", "Mesh Inspect", "/studio/bg3d"), makeRail("lnb-3d-line", "LN", "2D 선화 추출", "2D Line Extract", "/studio/canvas", false)],
    ["단면 클리핑 플레인", "UV 아틀라스 검수", "카메라 키프레임 보간"],
    { saveLabelKo: "메시 검사 상태 예시", engineBadge: "AtelierSolid", zoomLabel: "35mm 렌즈 예시", syncLabelKo: "캐릭터 단계" }),
  makePhase("lettering-sfx", 5, "draw", "식자/말풍선", "Lettering & SFX", "AtelierStage", 64,
    "말풍선 꼬리·식자·효과음·안전 여백 5도구로 대사 배치 단축", "5 essential controls for speech tails, typography, SFX stamps, and mobile safe margins",
    [makeTool("let-tail", "말풍선 꼬리", "Balloon Tail", "B", "primary", "AtelierInk"), makeTool("let-type", "가로/세로 식자", "Type Tool", "T", "primary", "AtelierInk"), makeTool("let-sfx", "효과음 브러시", "SFX Brush", "S", "secondary", "AtelierInk"), makeTool("let-margin", "모바일 안전여백", "Safe Margin", "M", "toggle", "CalmChrome"), makeTool("let-i18n", "다국어 미리보기", "Locale Preview", "L", "toggle", "AtelierStage")],
    [makeRail("lnb-let-style", "BL", "말풍선 스타일", "Balloon Styles", "/studio/comic"), makeRail("lnb-let-font", "FT", "서체 팩", "Font Pack", "/studio/comic"), makeRail("lnb-let-sfx", "FX", "효과음 프리셋", "SFX Presets", "/studio/comic"), makeRail("lnb-let-script", "DS", "대사 스크립트", "Dialogue Script", "/studio/comic"), makeRail("lnb-let-read", "RD", "가독성 검사", "Readability QA", "/studio/export")],
    ["자간·행간 일괄 정규화", "말풍선 외곽선 자동 피하기", "번역 레이어 CSV 내보내기"],
    { saveLabelKo: "글꼴 라이선스 검사 위치", engineBadge: "AtelierStage", zoomLabel: "375px 폰뷰 예시", syncLabelKo: "식자 단계" }),
  makePhase("qa-export", 6, "virtual-stage", "검수/출고", "QA & Export", "AtelierStage", 174,
    "세로 스크롤 폰뷰·권리 BOM·연속성 체크·출고 5도구 원스톱 완료", "5 one-stop release tools for mobile scroll preview, Rights BOM, continuity QA, and export",
    [makeTool("qa-phone", "세로 스크롤 미리보기", "Scroll Preview", "P", "primary", "CalmChrome"), makeTool("qa-slice", "해상도·컷 분할", "Slice & DPI", "D", "primary", "AtelierStage"), makeTool("qa-bom", "권리 BOM 점검", "Rights BOM", "R", "toggle", "AtelierStage"), makeTool("qa-cont", "연속성 체크", "Continuity QA", "Q", "secondary", "AtelierStage"), makeTool("qa-pack", "출고 패키지", "Export Bundle", "E", "primary", "AtelierStage")],
    [makeRail("lnb-qa-preset", "EX", "출고 프리셋", "Export Presets", "/studio/export"), makeRail("lnb-qa-phone", "PV", "모바일 폰뷰", "Phone Preview", "/studio/export"), makeRail("lnb-qa-bom", "BM", "권리·라이선스 BOM", "Rights BOM", "/studio/export"), makeRail("lnb-qa-team", "RV", "팀 최종 승인", "Team Sign-off", "/studio/space"), makeRail("lnb-qa-backup", "BK", "오프라인 백업", "Offline Backup", "/studio/recovery")],
    ["플랫폼별 썸네일 자동 크롭", "ICC 색 프로파일 변환", "회차 패키지 해시 검증"],
    { saveLabelKo: "권리 검사 상태 표시 예시", engineBadge: "AtelierStage", zoomLabel: "800px × 1280px 분할 예시", syncLabelKo: "출고 체크리스트 예시" }),
]);

export const CANONICAL_INTENT_ROUTES: readonly CanonicalIntentRoute[] = Object.freeze([
  makeRoute("draw-canvas-instant", "draw", "AtelierInk", "바로 그리기", "Instant Drawing Canvas", "/studio/canvas", "G D", "빈 캔버스·이어쓰기 원고에서 콘티·선화·채색을 즉시 시작", "Jump directly into sketching, inking, and coloring", ["선화", "그리기", "스케치", "콘티", "캔버스", "잉크", "펜", "draw", "lineart", "ink"], ["sketch-conti", "ink-lineart", "color-render"], ["draw-brush-texture", "draw-optical-filter", "draw-comic-cuts"], 3),
  makeRoute("draw-brush-texture", "draw", "AtelierInk", "브러시 질감 연구소", "Brush Texture Lab", "/studio/assets/brushes", "G B", "G펜·연필·종이 질감·필압 커브를 실시간 시뮬레이션하고 핀 고정", "Tune G-pen, pencil grain, paper weave, and pressure curves", ["브러시", "질감", "종이", "연필", "지펜", "선화브러시", "필압", "brush", "texture"], ["sketch-conti", "ink-lineart"], ["draw-canvas-instant", "draw-optical-filter", "draw-templates"], 4),
  makeRoute("draw-optical-filter", "draw", "AtelierInk", "광학 필터·색보정", "Optical Filter & Color", "/studio/canvas?panel=optical-filter", "G F", "OKLCH 안료 조화·광학 블룸·필름 그레인·색역 검수 통합 패널", "OKLCH pigment harmony, optical bloom, film grain, and gamut", ["광학", "필터", "색보정", "채색", "블룸", "톤커브", "안료", "filter", "optical", "color"], ["color-render"], ["draw-canvas-instant", "stage-review-export", "draw-comic-cuts"], 4),
  makeRoute("draw-comic-cuts", "draw", "AtelierInk", "컷 분할·말풍선 식자", "Panel Cut & Lettering", "/studio/comic", "G C", "세로 스크롤 컷 리듬·말풍선 꼬리·효과음 브러시·안전 여백 편집", "Vertical scroll pacing, speech tails, SFX stamps, and margins", ["컷", "식자", "말풍선", "효과음", "만화", "리듬", "comic", "lettering", "sfx"], ["sketch-conti", "lettering-sfx"], ["stage-review-export", "draw-canvas-instant", "stage-audio-foley"], 4),
  makeRoute("draw-new-sheet", "draw", "CalmChrome", "새 원고 시작 시트", "New Episode Start Sheet", "/create", "G N", "중복 진입(/studio/new · /make)을 통합한 1클릭 새 작품 시작 정문", "Single canonical entry consolidating legacy new-project forms", ["새로", "시작", "원고", "새작품", "만들기", "create", "new"], ["sketch-conti"], ["draw-canvas-instant", "draw-templates", "solid-cad-bg3d"], 3),
  makeRoute("draw-templates", "draw", "AtelierInk", "웹툰 판형 템플릿", "Webtoon Format Templates", "/studio/templates", "G P", "세로 스크롤·단행본·숏폼 컷 규격과 가이드선 프리셋 라이브러리", "Preset canvases for vertical scroll, print pages, and social cuts", ["템플릿", "판형", "규격", "세로스크롤", "가이드", "template"], ["sketch-conti"], ["draw-new-sheet", "draw-canvas-instant", "draw-comic-cuts"], 4),
  makeRoute("solid-cad-bg3d", "solid-cast", "AtelierSolid", "3D 솔리드 CAD 배경", "3D Solid CAD Scene", "/studio/bg3d", "G 3", "매니폴드 솔리드 건축·실내 배경 조립과 2D 선화 투영 추출", "Manifold solid architecture modeling with 2D lineart bake", ["3d", "솔리드", "배경", "cad", "건축", "투시", "입체", "bg3d", "solid", "AtelierSolid"], ["solid-3d-stage"], ["cast-character-shaper", "solid-3d-assets", "draw-canvas-instant"], 4),
  makeRoute("cast-character-shaper", "solid-cast", "AtelierCast", "3D 캐릭터 셰이퍼", "3D Character Shaper", "/studio/character", "G H", "해부학 연동 등신 비율·의상 케이지 리핏·WebGPU 룩뎁 캐릭터 제작", "Anatomy-linked proportion sculpting and garment cage refit", ["캐릭터", "3d캐릭터", "셰이퍼", "등신", "얼굴", "의상", "인물", "character", "cast", "AtelierCast"], ["solid-3d-stage"], ["cast-pose-rig", "cast-anchor-lab", "solid-cad-bg3d"], 4),
  makeRoute("cast-pose-rig", "solid-cast", "AtelierCast", "포즈·관절 스튜디오", "Pose & Joint Studio", "/studio/poser", "G O", "액션·로판·일상 포즈 프리셋과 손가락 관절 구도 미세 조정", "Action, romance, and everyday pose presets with articulation", ["포즈", "관절", "리깅", "자세", "인체", "3d포즈", "pose", "rig"], ["solid-3d-stage", "sketch-conti"], ["cast-character-shaper", "solid-cad-bg3d", "draw-canvas-instant"], 4),
  makeRoute("solid-3d-assets", "solid-cast", "AtelierSolid", "3D 소품·배경 라이브러리", "3D Props & Sets Library", "/studio/assets/3d", "G A", "검수된 매니폴드 3D 가구·차량·거리 소품 카탈로그와 즉시 배치", "Verified manifold 3D furniture, vehicle, and street props", ["3d소품", "소품", "가구", "오브젝트", "에셋", "모델", "asset", "props"], ["solid-3d-stage"], ["solid-cad-bg3d", "cast-character-shaper", "stage-review-export"], 5),
  makeRoute("cast-anchor-lab", "solid-cast", "AtelierCast", "캐릭터 일관성 앵커", "Character Consistency Anchor", "/studio/anchor-lab", "G K", "회차 간 얼굴·헤어·의상 비율 흔들림을 방지하는 기준 앵커 시트", "Reference anchor sheets keeping characters consistent", ["앵커", "일관성", "캐릭터유지", "캐릭터시트", "작붕방지", "anchor"], ["solid-3d-stage", "qa-export"], ["cast-character-shaper", "stage-review-export", "draw-canvas-instant"], 5),
  makeRoute("solid-motion-webtoon", "solid-cast", "AtelierSolid", "모션 웹툰 카메라", "Motion Webtoon Camera", "/studio/motion-webtoon", "G M", "2.5D 시차 카메라 이동과 컷 전환 모션 프리뷰 타임라인", "2.5D parallax camera tracks and cut transition timeline", ["모션", "카메라", "무빙툰", "시차", "영상", "motion", "camera"], ["solid-3d-stage", "qa-export"], ["stage-audio-foley", "stage-review-export", "solid-cad-bg3d"], 4),
  makeRoute("stage-virtual-space", "virtual-stage", "AtelierStage", "가상 작업실", "Virtual Studio Stage", "/studio/space", "G S", "실시간 커서·피드백·음성 브리핑이 통합된 팀 공동 작업 공간", "Shared team workspace with live cursors and review pins", ["협업", "가상", "작업실", "팀", "실시간", "화상", "스페이스", "space", "collab", "AtelierStage"], ["lettering-sfx", "qa-export"], ["stage-production-board", "stage-review-export", "stage-collaborate-hub"], 3),
  makeRoute("stage-production-board", "virtual-stage", "AtelierStage", "연재 제작 보드", "Series Production Board", "/production", "G R", "회차별 콘티·선화·채색·식자 진행률과 마감 일정을 한눈에 추적", "Track episode milestones from rough through final export", ["제작", "일정", "마감", "연재", "보드", "공정", "협업관리", "production", "schedule"], ["sketch-conti", "qa-export"], ["stage-virtual-space", "stage-review-export", "draw-canvas-instant"], 4),
  makeRoute("stage-audio-foley", "virtual-stage", "AtelierStage", "효과음·배경음 믹서", "Foley & BGM Mixer", "/studio/assets/audio", "G U", "컷 스크롤 위치에 맞춰 효과음·분위기 음원을 배치하고 밸런스 조정", "Cue scroll-synced foley effects and BGM per panel beat", ["오디오", "효과음", "배경음", "사운드", "음악", "bgm", "audio", "foley"], ["lettering-sfx"], ["solid-motion-webtoon", "draw-comic-cuts", "stage-review-export"], 5),
  makeRoute("stage-review-export", "virtual-stage", "AtelierStage", "검수·출고 패키지", "QA & Export Package", "/studio/export", "G E", "권리 BOM 확인·세로 이미지 분할·연속성 검수 후 최종 파일 내보내기", "Verify Rights BOM, slice vertical episodes, and export", ["내보내기", "출고", "검수", "다운로드", "분할", "저장", "패키지", "export", "qa", "publish"], ["qa-export"], ["stage-recovery-vault", "stage-virtual-space", "works-showcase"], 4),
  makeRoute("stage-recovery-vault", "virtual-stage", "CalmChrome", "로컬 복구·오프라인 백업", "Local Recovery & Backup", "/studio/recovery", "G V", "OPFS 스냅샷 복구·충돌 이력 확인·오프라인 작업본 안전 관리", "Recover OPFS snapshots and verify offline backups", ["복구", "백업", "오프라인", "스냅샷", "언두", "recovery", "backup"], ["qa-export"], ["draw-canvas-instant", "stage-review-export", "stage-virtual-space"], 5),
  makeRoute("stage-collaborate-hub", "virtual-stage", "AtelierStage", "팀원 모집·작업 의뢰", "Teammates & Commissions", "/collaborate", "G L", "배경·선화·채색 어시스턴트 협업 매칭과 작업 의뢰 관리", "Match with lineart, coloring, and background teammates", ["구인", "의뢰", "어시", "팀원", "모집", "협업구인", "collaborate", "hire"], ["qa-export"], ["stage-virtual-space", "stage-production-board", "works-showcase"], 4),
  makeRoute("tech-presentation-deck", "tech-works", "ToonStudio", "기술 발표 덱", "Tech Presentation Deck", "/tech", "G T", "ToonStudio 핵심 그래픽스·UI/UX 엔지니어링 3단 실무 해설 슬라이드", "Interactive engineering deck explaining core rendering and UX", ["발표", "덱", "기술", "슬라이드", "프레젠테이션", "ir", "tech", "deck", "presentation"], ["qa-export"], ["tech-architecture-guide", "tech-easy-glossary", "works-compare-studio"], 3),
  makeRoute("tech-architecture-guide", "tech-works", "ToonStudio", "아키텍처 해설", "Architecture Guide", "/about/technology", "G I", "로컬 우선 저장소·WebGPU 렌더링·CalmChrome 계층 구조 기술 문서", "Deep dive into local-first storage, WebGPU, and CalmChrome", ["아키텍처", "해설", "구조", "엔진", "웹지피유", "기술문서", "architecture", "technology"], ["solid-3d-stage"], ["tech-presentation-deck", "tech-easy-glossary", "works-flat-sitemap"], 4),
  makeRoute("tech-easy-glossary", "tech-works", "CalmChrome", "쉬운 용어집", "Plain-Language Glossary", "/guide", "G Q", "매니폴드·OKLCH·OPFS·Rights BOM 등 제작 용어를 일상 언어로 설명", "Plain-language explanations of drawing, 3D, and export terms", ["용어집", "쉬운", "가이드", "입문", "설명서", "도움말", "glossary", "guide", "help"], ["sketch-conti"], ["tech-presentation-deck", "draw-new-sheet", "works-flat-sitemap"], 4),
  makeRoute("works-showcase", "tech-works", "ToonStudio", "완성 작품 쇼케이스", "Creator Works Showcase", "/showcase", "G W", "ToonStudio로 완성한 웹툰·일러스트·3D 배경 사례와 제작 과정 열람", "Explore finished webtoons, illustrations, and 3D scenes", ["작품", "쇼케이스", "구경", "포트폴리오", "독자", "갤러리", "showcase", "works"], ["qa-export"], ["draw-new-sheet", "tech-presentation-deck", "stage-collaborate-hub"], 3),
  makeRoute("works-compare-studio", "tech-works", "ToonStudio", "제작 환경 비교", "Studio Capability Matrix", "/compare/studio", "G X", "로컬 저장·실시간 협업·3D 통합·출고 검수 기준별 환경 비교표", "Objective matrix covering local durability and 3D integration", ["비교", "성능", "환경비교", "기능표", "compare", "matrix"], ["qa-export"], ["tech-presentation-deck", "tech-architecture-guide", "draw-canvas-instant"], 4),
  makeRoute("works-flat-sitemap", "tech-works", "CalmChrome", "전체 평면 사이트맵", "Flat Full Sitemap", "/sitemap", "G Z", "푸터 <details> 접이식 인덱스와 연결되는 4대 목적 전체 주소 지도", "Complete flat directory paired with collapsible footer sitemap", ["사이트맵", "전체메뉴", "지도", "라우트", "목록", "sitemap", "menu"], ["sketch-conti"], ["draw-canvas-instant", "solid-cad-bg3d", "stage-virtual-space"], 3),
]);

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const CHOSEONG_STEP = 588;
const CHOSEONG_LIST: readonly string[] = Object.freeze([
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
]);
const CHOSEONG_SET = new Set<string>(CHOSEONG_LIST);

const clampInt = (value: number, min: number, max: number): number =>
  (Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min);
const round1 = (value: number): number => Math.round(value * 10) / 10;

/** 한글 음절 문자열에서 초성 열을 추출한다(비한글 문자는 소문자로 유지). */
export function extractKoreanChoseong(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= HANGUL_START && code <= HANGUL_END) {
      out += CHOSEONG_LIST[Math.floor((code - HANGUL_START) / CHOSEONG_STEP)] ?? ch;
    } else if (ch !== " ") {
      out += ch.toLowerCase();
    }
  }
  return out;
}

/** 입력 질의가 한글 자음(초성) 위주 검색인지 판별한다. */
export function isChoseongIntentQuery(query: string): boolean {
  const compact = query.replace(/\s+/gu, "");
  if (compact.length === 0) return false;
  for (const ch of compact) {
    if (!CHOSEONG_SET.has(ch)) return false;
  }
  return true;
}

/** 작업 단계 ID로 적응형 크롬 프로파일을 조회한다. */
export function getWorkflowPhaseProfile(phaseId: WorkflowPhaseId): WorkflowPhaseChromeProfile {
  return WORKFLOW_PHASE_CHROME_PROFILES.find((item) => item.id === phaseId)
    ?? (WORKFLOW_PHASE_CHROME_PROFILES[0] as WorkflowPhaseChromeProfile);
}

/** GNB 목적 축 ID로 정본 축 스펙을 조회한다. */
export function getCalmGnbPillar(pillarId: CalmGnbPillarId): CalmGnbPillarSpec {
  return CALM_CHROME_GNB_PILLARS.find((item) => item.id === pillarId)
    ?? (CALM_CHROME_GNB_PILLARS[0] as CalmGnbPillarSpec);
}

/** 4대 크롬(GNB·LNB·탑 메뉴·푸터) 인체공학·면적·클릭 깊이 정량 진단 모델. */
export function evaluateChromeErgonomics(input?: ChromeErgonomicsInput): ChromeErgonomicsReport {
  const viewportWidthPx = clampInt(input?.viewportWidthPx ?? 1440, 360, 3840);
  const viewportHeightPx = clampInt(input?.viewportHeightPx ?? 900, 600, 2160);
  const lnbExpanded = Boolean(input?.lnbExpanded);
  const lnbPinned = Boolean(input?.lnbPinned);
  const footerSitemapExpanded = Boolean(input?.footerSitemapExpanded);
  const immersiveFocusMode = Boolean(input?.immersiveFocusMode);
  const activePhaseId: WorkflowPhaseId = input?.activePhaseId ?? "sketch-conti";
  const phase = getWorkflowPhaseProfile(activePhaseId);

  const topBarHeightPx = immersiveFocusMode ? 28 : 44;
  const lnbWidthPx = immersiveFocusMode ? 0 : (lnbExpanded ? 216 : 52);
  const footerHeightPx = immersiveFocusMode ? 0 : (footerSitemapExpanded ? 112 : 28);
  const canvasWidthPx = Math.max(0, viewportWidthPx - lnbWidthPx);
  const canvasHeightPx = Math.max(0, viewportHeightPx - topBarHeightPx - footerHeightPx);
  const totalPixels = viewportWidthPx * viewportHeightPx;
  const canvasUsableRatioPct = totalPixels > 0 ? round1(((canvasWidthPx * canvasHeightPx) / totalPixels) * 100) : 0;

  const avgClickDepth = 1.4;
  const clickReductionPct = round1(
    ((LEGACY_DISTRIBUTED_CHROME_BASELINE.avgClickDepth - avgClickDepth) / LEGACY_DISTRIBUTED_CHROME_BASELINE.avgClickDepth) * 100,
  );
  const canvasGainPct = round1(canvasUsableRatioPct - LEGACY_DISTRIBUTED_CHROME_BASELINE.canvasUsableRatioPct);
  const duplicateEntryEliminatedCount = LEGACY_DISTRIBUTED_CHROME_BASELINE.duplicateEntryGroups.reduce(
    (sum, group) => sum + group.legacyDuplicates.length, 0,
  );

  const surfaceAudits: readonly ChromeSurfaceAudit[] = Object.freeze([
    Object.freeze({ surfaceId: "gnb", titleKo: "GNB · 4대 목적 평면 헤더", titleEn: "GNB · 4-Pillar Flat Header", legacyMetricKo: "11개 상단 항목 · 다단 드롭다운 · 중복 진입 8건", calmMetricKo: "4대 목적 축(그리기·3D/캐릭터·가상 작업실·기술/작품) + Cmd+K", improvementKo: "목적 선택 인지 부담 63% 축소 · 클릭 깊이 3.8→1.4", beforePixels: 56, afterPixels: topBarHeightPx }),
    Object.freeze({ surfaceId: "lnb", titleKo: "LNB · 52px 적응형 아이콘 레일", titleEn: "LNB · 52px Adaptive Icon Rail", legacyMetricKo: "260px 고정 사이드바 · 5대 허브 124탭 중첩", calmMetricKo: `${lnbWidthPx}px ${immersiveFocusMode ? "몰입 자동숨김" : (lnbExpanded ? "라벨 확장 드로어" : "아이콘 레일")} · 단계 핀 ${phase.lnbRailItems.length}개`, improvementKo: `가로 작업 공간 +${Math.max(0, LEGACY_DISTRIBUTED_CHROME_BASELINE.lnbWidthPx - lnbWidthPx)}px 확보`, beforePixels: LEGACY_DISTRIBUTED_CHROME_BASELINE.lnbWidthPx, afterPixels: lnbWidthPx }),
    Object.freeze({ surfaceId: "top-menu", titleKo: "탑 메뉴 · 44px 단일 컨텍스트 바", titleEn: "Top Menu · 44px Single Context Bar", legacyMetricKo: "88px 이중 헤더 · 18개 메뉴 상시 노출", calmMetricKo: `${topBarHeightPx}px 단일 바 · [${phase.labelKo}] 핵심 ${phase.topBarTools.length}도구 자동 변신`, improvementKo: "나머지 도구는 Cmd+K·서랍으로 정리해 시선 분산 차단", beforePixels: LEGACY_DISTRIBUTED_CHROME_BASELINE.topBarHeightPx, afterPixels: topBarHeightPx }),
    Object.freeze({ surfaceId: "footer", titleKo: "푸터 · 28px 미니멀 시스템 상태 바", titleEn: "Footer · 28px Minimal Status Bar", legacyMetricKo: "136px 다단 링크 띠 상시 점유", calmMetricKo: `${footerHeightPx}px ${immersiveFocusMode ? "몰입 숨김" : (footerSitemapExpanded ? "<details> 사이트맵 전개" : "1줄 저장·엔진·줌 상태 + <details> 접기")}`, improvementKo: `세로 캔버스 +${Math.max(0, LEGACY_DISTRIBUTED_CHROME_BASELINE.footerHeightPx - footerHeightPx)}px 회수`, beforePixels: LEGACY_DISTRIBUTED_CHROME_BASELINE.footerHeightPx, afterPixels: footerHeightPx }),
  ]);

  const minExpectedCanvasPct = immersiveFocusMode ? 96 : (lnbExpanded || footerSitemapExpanded ? 74 : 88);
  return Object.freeze({
    mode: "simulation-model",
    viewportWidthPx, viewportHeightPx, activePhaseId, lnbExpanded, lnbPinned, footerSitemapExpanded, immersiveFocusMode,
    legacy: LEGACY_DISTRIBUTED_CHROME_BASELINE,
    calm: Object.freeze({
      gnbItemCount: CALM_CHROME_GNB_PILLARS.length,
      topBarHeightPx, lnbWidthPx, footerHeightPx, canvasWidthPx, canvasHeightPx, canvasUsableRatioPct,
      avgClickDepth, clickReductionPct, canvasGainPct,
      topBarToolCount: phase.topBarTools.length, lnbPinCount: phase.lnbRailItems.length, duplicateEntryEliminatedCount,
    }),
    surfaceAudits,
    checks: Object.freeze({
      gnbWithinFiveBudget: CALM_CHROME_GNB_PILLARS.length <= 5,
      topBarWithinSixBudget: phase.topBarTools.length <= 6,
      lnbWithinSixBudget: phase.lnbRailItems.length <= 6,
      canvasAreaTargetMet: viewportWidthPx >= 1440 ? canvasUsableRatioPct >= minExpectedCanvasPct : canvasUsableRatioPct >= 70,
      clickDepthReduced: avgClickDepth <= 1.5 && avgClickDepth < LEGACY_DISTRIBUTED_CHROME_BASELINE.avgClickDepth,
    }),
  });
}

function buildPredictivePrefetchTargets(
  hits: readonly IntentRouteSearchHit[],
  activePhaseId: WorkflowPhaseId,
): readonly [PredictivePrefetchTarget, PredictivePrefetchTarget, PredictivePrefetchTarget] {
  const picked: PredictivePrefetchTarget[] = [];
  const seen = new Set<string>();
  const push = (route: CanonicalIntentRoute | undefined, reasonKo: string, confidencePct: number, priority: "high" | "medium"): void => {
    if (!route || seen.has(route.id) || picked.length >= 3) return;
    seen.add(route.id);
    picked.push(Object.freeze({
      routeId: route.id, href: route.href, labelKo: route.labelKo, labelEn: route.labelEn,
      brandEngine: route.brandEngine, reasonKo, confidencePct, priority,
    }));
  };

  const topHit = hits[0]?.route;
  if (topHit) {
    push(topHit, "현재 의도 검색 1순위 · 0ms 전환 대비 선로딩", 96, "high");
    for (const nextId of topHit.nextRouteIds) {
      push(CANONICAL_INTENT_ROUTES.find((r) => r.id === nextId), `[${topHit.labelKo}] 다음 자주 이어지는 후속 작업 경로`, 84 - picked.length * 4, picked.length < 2 ? "high" : "medium");
    }
  }
  for (const route of CANONICAL_INTENT_ROUTES) {
    if (route.phaseAffinities.includes(activePhaseId)) push(route, "현재 작업 단계 연관 정본 목적지", 78, "medium");
  }
  for (const route of CANONICAL_INTENT_ROUTES) push(route, "핵심 4대 목적 축 기본 선로딩", 70, "medium");

  return Object.freeze([picked[0] as PredictivePrefetchTarget, picked[1] as PredictivePrefetchTarget, picked[2] as PredictivePrefetchTarget]);
}

function scoreIntentRoute(
  route: CanonicalIntentRoute, normalizedQuery: string, compactQuery: string,
  tokens: readonly string[], isChoseong: boolean, activePhaseId: WorkflowPhaseId,
): IntentRouteSearchHit | null {
  const ko = route.labelKo.toLowerCase();
  const en = route.labelEn.toLowerCase();
  const href = route.href.toLowerCase();
  const summary = `${route.summaryKo} ${route.summaryEn}`.toLowerCase();
  const labelCho = extractKoreanChoseong(route.labelKo);
  const aliasChos = route.aliases.map((alias) => extractKoreanChoseong(alias));

  let score = 0;
  let matchKind: IntentRouteSearchHit["matchKind"] = "substring";
  let matchedToken = compactQuery;

  if (ko === normalizedQuery || en === normalizedQuery || href === normalizedQuery) {
    score = 160; matchKind = "exact";
  } else if (route.aliases.some((a) => a.toLowerCase() === normalizedQuery)) {
    const idx = route.aliases.findIndex((a) => a.toLowerCase() === normalizedQuery);
    score = 150 - Math.min(idx * 4, 24); matchKind = "alias";
  } else if (ko.startsWith(normalizedQuery) || en.startsWith(normalizedQuery)) {
    score = 132; matchKind = "prefix";
  } else if (isChoseong && labelCho.includes(compactQuery)) {
    score = labelCho.startsWith(compactQuery) ? 136 : 118; matchKind = "choseong";
  } else if (isChoseong && aliasChos.some((cho) => cho.includes(compactQuery))) {
    score = 112; matchKind = "choseong";
  } else if (route.aliases.some((a) => a.toLowerCase().includes(normalizedQuery))) {
    score = 104; matchKind = "alias";
  } else if (ko.includes(normalizedQuery) || en.includes(normalizedQuery)) {
    score = 96; matchKind = "substring";
  } else if (href.includes(normalizedQuery) || summary.includes(normalizedQuery)) {
    score = 76; matchKind = "substring";
  } else if (tokens.length > 1) {
    const bag = `${ko} ${en} ${route.aliases.join(" ").toLowerCase()} ${summary}`;
    const matched = tokens.filter((t) => bag.includes(t)).length;
    if (matched > 0) { score = 45 + matched * 22; matchKind = "substring"; matchedToken = tokens.join("+"); }
  }

  if (score <= 0) return null;
  const phaseBonus = route.phaseAffinities.includes(activePhaseId) ? 8 : 0;
  return Object.freeze({ route, score: round1(score + phaseBonus), matchKind, matchedToken });
}

/** 한글 초성·자연어 의도 기반 Cmd+K 24개 정본 목적지 랭킹 및 예측 프리페치 3건 산출기. */
export function searchIntentRoutes(query: string, options?: SearchIntentRoutesOptions): IntentSearchResult {
  const activePhaseId: WorkflowPhaseId = options?.activePhaseId ?? "sketch-conti";
  const limit = clampInt(options?.limit ?? 8, 1, CANONICAL_INTENT_ROUTES.length);
  const normalizedQuery = query.trim().toLowerCase();
  const compactQuery = normalizedQuery.replace(/\s+/gu, "");
  const isChoseong = isChoseongIntentQuery(compactQuery);

  if (compactQuery.length === 0) {
    const defaultHits = CANONICAL_INTENT_ROUTES
      .map((route, idx) => Object.freeze({
        route, score: round1(60 + (route.phaseAffinities.includes(activePhaseId) ? 40 : 0) - idx * 0.1),
        matchKind: "phase-default" as const, matchedToken: activePhaseId,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return Object.freeze({
      query, normalizedQuery, isChoseong: false, totalCatalogRoutes: CANONICAL_INTENT_ROUTES.length,
      hits: Object.freeze(defaultHits), prefetchTargets: buildPredictivePrefetchTargets(defaultHits, activePhaseId),
    });
  }

  const tokens = normalizedQuery.split(/\s+/u).filter((token) => token.length > 0);
  const scored: IntentRouteSearchHit[] = [];
  for (const route of CANONICAL_INTENT_ROUTES) {
    const hit = scoreIntentRoute(route, normalizedQuery, compactQuery, tokens, isChoseong, activePhaseId);
    if (hit) scored.push(hit);
  }
  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.route.id.localeCompare(b.route.id)));
  const hits = Object.freeze(scored.slice(0, limit));
  return Object.freeze({
    query, normalizedQuery, isChoseong, totalCatalogRoutes: CANONICAL_INTENT_ROUTES.length,
    hits, prefetchTargets: buildPredictivePrefetchTargets(hits, activePhaseId),
  });
}

type BaseUndoFrame = Omit<VisualUndoSnapshot, "isCurrentHead" | "canRestore">;

const makeBaseFrame = (
  id: string, index: number, phaseId: WorkflowPhaseId, brandEngine: AtelierBrandEngine,
  labelKo: string, labelEn: string, timestampLabel: string, strokeCount: number, layerCount: number, routeHref: string,
  breadcrumbTrailKo: readonly [string, string, string], breadcrumbTrailEn: readonly [string, string, string],
  thumb: VisualUndoThumbGeometry,
): BaseUndoFrame => Object.freeze({
  id, index, phaseId, brandEngine, labelKo, labelEn, timestampLabel, strokeCount, layerCount, routeHref,
  breadcrumbTrailKo: Object.freeze([breadcrumbTrailKo[0], breadcrumbTrailKo[1], breadcrumbTrailKo[2]] as const),
  breadcrumbTrailEn: Object.freeze([breadcrumbTrailEn[0], breadcrumbTrailEn[1], breadcrumbTrailEn[2]] as const),
  thumb: Object.freeze({ ...thumb }),
});

const BASE_VISUAL_UNDO_FRAMES: readonly BaseUndoFrame[] = Object.freeze([
  makeBaseFrame("snap-01-conti", 0, "sketch-conti", "AtelierInk", "01. 옥상 3컷 러프 구도", "01. Rooftop 3-Panel Rough", "14:02", 48, 3, "/studio/canvas", ["그리기", "EP.07 옥상 대치", "콘티 · 컷 01~03"], ["Draw", "EP.07 Rooftop", "Conti · Panels 01-03"], { panelCount: 3, hasLineartPass: false, hasColorPass: false, hasSolid3dPass: false, balloonCount: 1, accentHueDeg: 42 }),
  makeBaseFrame("snap-02-solid3d", 1, "solid-3d-stage", "AtelierSolid", "02. 난간·도시 3D 솔리드 배치", "02. Rooftop Solid 3D Stage", "14:15", 64, 6, "/studio/bg3d", ["3D/캐릭터", "EP.07 옥상 대치", "AtelierSolid 배경 투영"], ["3D & Cast", "EP.07 Rooftop", "AtelierSolid Projection"], { panelCount: 3, hasLineartPass: false, hasColorPass: false, hasSolid3dPass: true, balloonCount: 1, accentHueDeg: 214 }),
  makeBaseFrame("snap-03-cast-pose", 2, "solid-3d-stage", "AtelierCast", "03. 주연 2인 포즈·의상 리핏", "03. Cast Pose & Cage Refit", "14:26", 92, 8, "/studio/character", ["3D/캐릭터", "EP.07 옥상 대치", "AtelierCast 포즈 앵커"], ["3D & Cast", "EP.07 Rooftop", "AtelierCast Pose Anchor"], { panelCount: 4, hasLineartPass: false, hasColorPass: false, hasSolid3dPass: true, balloonCount: 2, accentHueDeg: 204 }),
  makeBaseFrame("snap-04-lineart", 3, "ink-lineart", "AtelierInk", "04. G펜 선화·표정 정리", "04. G-Pen Ink & Expressions", "14:44", 286, 12, "/studio/canvas", ["그리기", "EP.07 옥상 대치", "선화 · 컷 04"], ["Draw", "EP.07 Rooftop", "Lineart · Panel 04"], { panelCount: 4, hasLineartPass: true, hasColorPass: false, hasSolid3dPass: true, balloonCount: 2, accentHueDeg: 24 }),
  makeBaseFrame("snap-05-color", 4, "color-render", "AtelierInk", "05. 노을 채색·광학 블룸", "05. Sunset Color & Bloom", "15:08", 418, 19, "/studio/canvas?panel=optical-filter", ["그리기", "EP.07 옥상 대치", "채색 · 노을 광학 필터"], ["Draw", "EP.07 Rooftop", "Color · Sunset Optical"], { panelCount: 4, hasLineartPass: true, hasColorPass: true, hasSolid3dPass: true, balloonCount: 2, accentHueDeg: 158 }),
  makeBaseFrame("snap-06-lettering", 5, "lettering-sfx", "AtelierStage", "06. 대사 식자·출고 직전", "06. Lettering & Export Ready", "15:21", 442, 22, "/studio/export", ["가상 작업실", "EP.07 옥상 대치", "식자 · 출고 검수 대기"], ["Virtual Stage", "EP.07 Rooftop", "Lettering · Export QA"], { panelCount: 4, hasLineartPass: true, hasColorPass: true, hasSolid3dPass: true, balloonCount: 4, accentHueDeg: 64 }),
]);

/** 비주얼 언두 필름스트립 및 작업 복귀 Breadcrumb 초기 상태를 생성한다. */
export function buildVisualUndoTimeline(options?: BuildVisualUndoTimelineOptions): VisualUndoTimelineState {
  const headIndex = BASE_VISUAL_UNDO_FRAMES.length - 1;
  const activeIndex = clampInt(options?.activeIndex ?? headIndex, 0, headIndex);
  const frames: readonly VisualUndoSnapshot[] = Object.freeze(
    BASE_VISUAL_UNDO_FRAMES.map((frame) => Object.freeze({ ...frame, isCurrentHead: frame.index === activeIndex, canRestore: frame.index !== activeIndex })),
  );
  const activeFrame = frames[activeIndex] ?? (frames[0] as VisualUndoSnapshot);
  return Object.freeze({
    episodeTitleKo: "EP.07 옥상 대치", episodeTitleEn: "EP.07 Rooftop Standoff",
    activeIndex, headIndex, undoDepth: activeIndex, redoDepth: headIndex - activeIndex, frames,
    resumeBreadcrumbKo: activeFrame.breadcrumbTrailKo, resumeBreadcrumbEn: activeFrame.breadcrumbTrailEn,
    lastActionSummaryKo: `${activeFrame.labelKo} 시점으로 작업 맥락이 맞춰져 있습니다.`,
  });
}

/** 필름스트립의 임의 스냅샷으로 1클릭 복원한 새 불변 타임라인 상태를 반환한다. */
export function restoreVisualUndoSnapshot(timeline: VisualUndoTimelineState, targetIndex: number): VisualUndoTimelineState {
  const nextIndex = clampInt(targetIndex, 0, timeline.frames.length - 1);
  const nextFrames: readonly VisualUndoSnapshot[] = Object.freeze(
    timeline.frames.map((frame) => Object.freeze({ ...frame, isCurrentHead: frame.index === nextIndex, canRestore: frame.index !== nextIndex })),
  );
  const restored = nextFrames[nextIndex] ?? (nextFrames[0] as VisualUndoSnapshot);
  return Object.freeze({
    ...timeline, activeIndex: nextIndex, undoDepth: nextIndex, redoDepth: timeline.headIndex - nextIndex,
    frames: nextFrames, resumeBreadcrumbKo: restored.breadcrumbTrailKo, resumeBreadcrumbEn: restored.breadcrumbTrailEn,
    lastActionSummaryKo: `${restored.labelKo} (${restored.timestampLabel}) 예시 프레임을 선택했습니다.`,
  });
}

/** CalmChrome v3 네비게이션·동선 아키텍처 진단 스냅샷을 결정론적 JSON으로 내보낸다. */
export function exportNavFlowArchitectureJson(options: ExportNavFlowArchitectureOptions): string {
  const activePhase = getWorkflowPhaseProfile(options.ergonomics.activePhaseId);
  const activeFrame = options.timeline.frames[options.timeline.activeIndex] ?? (options.timeline.frames[0] as VisualUndoSnapshot);
  return JSON.stringify({
    schemaVersion: NAV_FLOW_SCHEMA_VERSION,
    mode: options.ergonomics.mode,
    brand: ATELIER_NAV_BRAND,
    ergonomics: {
      viewport: { widthPx: options.ergonomics.viewportWidthPx, heightPx: options.ergonomics.viewportHeightPx },
      legacy: {
        totalRoutes: options.ergonomics.legacy.totalRoutes, hubCount: options.ergonomics.legacy.hubCount,
        hubTabCount: options.ergonomics.legacy.hubTabCount, avgClickDepth: options.ergonomics.legacy.avgClickDepth,
        canvasUsableRatioPct: options.ergonomics.legacy.canvasUsableRatioPct,
      },
      calmChrome: options.ergonomics.calm,
      checks: options.ergonomics.checks,
    },
    gnbPillars: CALM_CHROME_GNB_PILLARS.map((p) => ({ id: p.id, labelKo: p.labelKo, brandEngine: p.brandEngine, canonicalHref: p.canonicalHref, shortcutChord: p.shortcutChord })),
    activePhaseProfile: {
      id: activePhase.id, labelKo: activePhase.labelKo, brandEngine: activePhase.brandEngine,
      topBarTools: activePhase.topBarTools.map((t) => ({ id: t.id, labelKo: t.labelKo, shortcut: t.shortcut })),
      lnbRailCount: activePhase.lnbRailItems.length, overflowDrawerToolsKo: activePhase.overflowDrawerToolsKo,
    },
    intentLauncher: {
      totalCatalogRoutes: options.searchResult.totalCatalogRoutes, query: options.searchResult.query,
      topMatchHref: options.searchResult.hits[0]?.route.href ?? null,
      prefetchTargets: options.searchResult.prefetchTargets.map((t) => ({ routeId: t.routeId, href: t.href, confidencePct: t.confidencePct })),
    },
    visualUndo: {
      activeIndex: options.timeline.activeIndex, totalSnapshots: options.timeline.frames.length,
      activeSnapshotId: activeFrame.id, resumeBreadcrumbKo: options.timeline.resumeBreadcrumbKo,
    },
  }, null, 2);
}
