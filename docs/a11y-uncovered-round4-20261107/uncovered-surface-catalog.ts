import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { collectAuditRouteInventory } from "../../scripts/lib/sitewide-audit-route-inventory.mjs";

export const ROUND4_OWNED_PREFIX = "docs/a11y-uncovered-round4-20261107/";

export type RouteAuditDisposition =
  | "existing-verified"
  | "excluded-active-owner"
  | "duplicate-or-alias"
  | "auth-gated"
  | "realdata-required"
  | "unimplemented-fallback"
  | "selected-uncovered-12"
  | "uncovered-secondary";

export type FunctionalSurfaceGroup =
  | "market-hub"
  | "market-pricing"
  | "community-media"
  | "community-collab"
  | "learn-lesson"
  | "legal-help"
  | "account-guest"
  | "experience-fortune"
  | "experience-play"
  | "events-promo"
  | "creator-pitch"
  | "reader-spatial";

export interface UncoveredSurfaceTarget {
  readonly id: string;
  readonly functionalGroup: FunctionalSurfaceGroup;
  readonly groupLabel: string;
  readonly route: string;
  readonly deduplicatedAliases: readonly string[];
  readonly componentName: string;
  readonly sourceFiles: readonly string[];
  readonly syntheticFixtureStrategy: string;
}

export interface Round4DefectFinding {
  readonly id: string;
  readonly severity: "high" | "medium" | "low";
  readonly axis:
    | "keyboard-dialog-focus-trap"
    | "aria-role-state-contrast"
    | "reflow-320-zoom-200-target-size"
    | "reduced-motion-shortcut-safety";
  readonly surfaceId: string;
  readonly route: string;
  readonly title: string;
  readonly targetFilesToFix: readonly string[];
  readonly wcagCriteria: readonly string[];
  readonly reproductionSteps: readonly string[];
  readonly observedEvidence: string;
  readonly minimalFixRecommendation: string;
}

export interface ClassifiedRouteEntry {
  readonly route: string;
  readonly disposition: RouteAuditDisposition;
  readonly reason: string;
  readonly canonicalRoute?: string;
}

export interface Round4InventoryClassificationReport {
  readonly generatedAt: string;
  readonly totalConcreteRoutes: number;
  readonly existingBrowserMatrixCheckCount: number;
  readonly existingVerifiedBaseRoutes: readonly string[];
  readonly countsByDisposition: Readonly<Record<RouteAuditDisposition, number>>;
  readonly selectedSurfaces: readonly UncoveredSurfaceTarget[];
  readonly defectFindings: readonly Round4DefectFinding[];
  readonly classifiedRoutes: readonly ClassifiedRouteEntry[];
}

/** 기존 라운드(Round 1~2)에서 실제 브라우저 검증(31개 뷰포트 매트릭스 + 스튜디오 캔버스)이 완료된 베이스 경로 */
export const EXISTING_VERIFIED_BASE_ROUTES = [
  "/",
  "/discover",
  "/community",
  "/learn",
  "/accessibility",
  "/settings",
  "/studio",
  "/admin/overview",
  "/studio/canvas",
] as const;

/** 기능군별 대표 미검증 표면 12개 선정 정본 */
export const ROUND4_UNCOVERED_SURFACES: readonly UncoveredSurfaceTarget[] = [
  {
    id: "SURF-01-MARKET",
    functionalGroup: "market-hub",
    groupLabel: "에셋 마켓플레이스 허브 및 빠른 미리보기 대화상자",
    route: "/market",
    deduplicatedAliases: ["/marketplace", "/market/browse"],
    componentName: "MarketHomePage + MarketQuickPreviewDialog",
    sourceFiles: [
      "apps/web/src/domains/market/pages/MarketHomePage.tsx",
      "apps/web/src/domains/market/components/MarketQuickPreviewDialog.tsx",
    ],
    syntheticFixtureStrategy:
      "정적 CREATOR_MARKETPLACE_RESOURCES 합성 카탈로그 사용(실서버 API 503 격리)",
  },
  {
    id: "SURF-02-PRICING",
    functionalGroup: "market-pricing",
    groupLabel: "요금제 비교·결제 주기 전환·FAQ 아코디언",
    route: "/pricing",
    deduplicatedAliases: ["/membership"],
    componentName: "PricingPage + PricingPolish",
    sourceFiles: [
      "apps/web/src/app/routes/pricing-page.tsx",
      "apps/web/src/domains/marketing/PricingPolish.tsx",
    ],
    syntheticFixtureStrategy: "정적 PLANS 요금 테이블 및 로컬 시뮬레이터 상태 사용",
  },
  {
    id: "SURF-03-TIMELAPSES",
    functionalGroup: "community-media",
    groupLabel: "커뮤니티 작업 타임랩스 갤러리 및 단계 플레이어",
    route: "/community/timelapses",
    deduplicatedAliases: [],
    componentName: "TimelapseGalleryPage",
    sourceFiles: ["apps/web/src/domains/community/TimelapseGalleryPage.tsx"],
    syntheticFixtureStrategy: "내장 SEED_CLIPS 합성 시드 및 로컬 스토리지 병합 사용",
  },
  {
    id: "SURF-04-COLLABORATE",
    functionalGroup: "community-collab",
    groupLabel: "창작 협업 모집 보드 및 모집글 작성 모달",
    route: "/collaborate",
    deduplicatedAliases: ["/collaborate/workspace", "/team", "/team/recruiting"],
    componentName: "CollaborationBoardPage",
    sourceFiles: ["apps/web/src/domains/collaboration/CollaborationBoardPage.tsx"],
    syntheticFixtureStrategy: "내장 INITIAL_PROJECTS 합성 시드 및 로컬 스토리지 사용",
  },
  {
    id: "SURF-05-LEARN-LESSON",
    functionalGroup: "learn-lesson",
    groupLabel: "인터랙티브 웹툰 실습 레슨 및 단축키 체크리스트",
    route: "/learn/lessons/studio-first-page",
    deduplicatedAliases: ["/learn/glossary", "/learn/paths/first-three-panels"],
    componentName: "LessonDetail + LessonSession + LessonLab",
    sourceFiles: [
      "apps/web/src/domains/learn/LearnContent.tsx",
      "apps/web/src/domains/learn/LessonLab.tsx",
    ],
    syntheticFixtureStrategy: "정적 LESSONS(36건) 및 LEARNING_PATHS(12건) 대표 1건 검증",
  },
  {
    id: "SURF-06-HELP",
    functionalGroup: "legal-help",
    groupLabel: "도움말 센터·질문 검색·법률 문서 앵커 도구",
    route: "/help",
    deduplicatedAliases: ["/terms", "/privacy", "/copyright", "/youth-policy"],
    componentName: "HelpCenterPage + PolicyPage + LegalDocTools",
    sourceFiles: [
      "apps/web/src/domains/legal/HelpCenterPage.tsx",
      "apps/web/src/domains/legal/PolicyPage.tsx",
      "apps/web/src/domains/legal/LegalDocTools.tsx",
    ],
    syntheticFixtureStrategy: "정적 TOPICS/QUESTIONS 및 로컬 브라우저 준비도 진단 픽스처",
  },
  {
    id: "SURF-07-MY-GUEST",
    functionalGroup: "account-guest",
    groupLabel: "내 공간 게스트 허브(로컬 활동 요약·역할 필터)",
    route: "/my",
    deduplicatedAliases: ["/library", "/bookmarks", "/history"],
    componentName: "MySpaceHubPage",
    sourceFiles: ["apps/web/src/domains/account/MySpaceHubPage.tsx"],
    syntheticFixtureStrategy: "비로그인 게스트 로컬 스토리지 활동 요약 픽스처",
  },
  {
    id: "SURF-08-FORTUNE",
    functionalGroup: "experience-fortune",
    groupLabel: "운세 관측소(8종 탭·성별 토글·결과 공유 모달)",
    route: "/fortune",
    deduplicatedAliases: [
      "/fortune/today",
      "/fortune/monthly",
      "/fortune/yearly",
      "/fortune/zodiac",
      "/fortune/saju",
      "/fortune/compatibility",
      "/fortune/tarot",
      "/fortune/prescription",
    ],
    componentName: "FortunePage + FortuneShareModal",
    sourceFiles: [
      "apps/web/src/domains/fortune/FortunePage.tsx",
      "apps/web/src/domains/fortune/FortuneShareModal.tsx",
    ],
    syntheticFixtureStrategy: "클라이언트 @toonstudio/core/fortune 결정론적 합성 운세 계산",
  },
  {
    id: "SURF-09-PLAY",
    functionalGroup: "experience-play",
    groupLabel: "플레이 미니게임 허브 및 모션컷 랩",
    route: "/play",
    deduplicatedAliases: ["/worldcup", "/quiz", "/vote", "/mbti", "/tier"],
    componentName: "PlayPage + PlayComicGuide",
    sourceFiles: [
      "apps/web/src/domains/play/PlayPage.tsx",
      "apps/web/src/domains/play/PlayComicGuide.tsx",
    ],
    syntheticFixtureStrategy: "정적 GAMES 카탈로그 및 로컬 플레이 요약 시드",
  },
  {
    id: "SURF-10-EVENTS",
    functionalGroup: "events-promo",
    groupLabel: "이벤트·프로모션 허브 및 카테고리/검색 필터",
    route: "/events",
    deduplicatedAliases: ["/events/beta-open"],
    componentName: "EventsHubPage",
    sourceFiles: ["apps/web/src/domains/marketing/events/EventsHubPage.tsx"],
    syntheticFixtureStrategy: "정적 seedEvents 합성 이벤트 데이터 사용",
  },
  {
    id: "SURF-11-IR-PITCH",
    functionalGroup: "creator-pitch",
    groupLabel: "IR 피치덱 및 전체화면 발표 모드 대화상자",
    route: "/ir",
    deduplicatedAliases: ["/story-lab", "/product-tour"],
    componentName: "IrPitchPage",
    sourceFiles: ["apps/web/src/domains/marketing/IrPitchPage.tsx"],
    syntheticFixtureStrategy: "정적 IR 슬라이드 덱 및 인라인 SVG 지표 차트",
  },
  {
    id: "SURF-12-SPATIAL-READER",
    functionalGroup: "reader-spatial",
    groupLabel: "공간 리더(3D/2D 샘플 뷰어·곡률/시선 토글)",
    route: "/read/spatial",
    deduplicatedAliases: ["/studio/spatial-reader", "/production", "/cuts"],
    componentName: "StudioSpatialReaderPage + SpatialReaderViewer",
    sourceFiles: [
      "apps/web/src/domains/creator/spatial-reader/StudioSpatialReaderPage.tsx",
      "apps/web/src/domains/creator/spatial-reader/SpatialReaderViewer.tsx",
    ],
    syntheticFixtureStrategy: "내장 샘플 원고(openSample) 클라이언트 뷰어 픽스처",
  },
] as const;

/** 실제 브라우저 + 정적 분석으로 확증된 수정 필요 파일 및 재현 절차 */
export const ROUND4_DEFECT_FINDINGS: readonly Round4DefectFinding[] = [
  {
    id: "GAP-R4-01",
    severity: "high",
    axis: "keyboard-dialog-focus-trap",
    surfaceId: "SURF-11-IR-PITCH",
    route: "/ir",
    title:
      "IR 발표 모드 모달(role='dialog') 오픈 시 초기 포커스 미진입·Tab 포커스 트랩 부재·Escape 닫기 후 트리거 포커스 미복귀 및 모달 상단 버튼 40px 타깃 미달",
    targetFilesToFix: ["apps/web/src/domains/marketing/IrPitchPage.tsx"],
    wcagCriteria: ["2.1.2 No Keyboard Trap", "2.4.3 Focus Order", "2.5.5 Target Size"],
    reproductionSteps: [
      "1. `/ir` 접속 후 '발표 모드로 열기' 버튼을 키보드(Enter/Space) 또는 클릭으로 활성화한다.",
      "2. `role='dialog'[aria-label='IR 발표 모드']`가 열릴 때 `document.activeElement`가 대화상자 내부로 이동하지 않고 기존 트리거/배경에 남는지 확인한다.",
      "3. `Tab` 키를 반복 입력할 때 포커스가 발표 모달 내부(`전체화면 전환`, `발표 모드 종료`, `이전 씬`, `다음 씬`)에 갇히지 않고 배경 페이지 링크들로 이탈하는지 확인한다.",
      "4. `Escape` 키로 모달을 닫은 직후 `document.activeElement`가 '발표 모드로 열기' 트리거 버튼으로 복귀하지 않는지 확인한다.",
    ],
    observedEvidence:
      "IrPitchPage.tsx:78-102, 643-674에서 overlayRef.current?.focus() 미호출, Tab 트랩 미구현, 닫기 시 트리거 포커스 복귀 누락 확인. 또한 lines 650, 653의 '전체화면 전환'·'발표 모드 종료' 버튼이 size-10(40×40px)으로 44px 미달이며, line 659 진행 바(`transition-all duration-300`)에 `motion-reduce:transition-none`이 누락됨.",
    minimalFixRecommendation:
      "발표 모드 오픈 전 triggerRef에 activeElement를 저장하고 오픈 직후 닫기 버튼으로 포커스를 이동시키며, 모달 내부 Tab/Shift+Tab 순환 트랩과 close 시 triggerRef.current?.focus() 복귀를 추가한다. 모달 상단 버튼 2개는 size-11(44px)로 확대하고 진행 바에 motion-reduce:transition-none을 부여한다.",
  },
  {
    id: "GAP-R4-02",
    severity: "high",
    axis: "keyboard-dialog-focus-trap",
    surfaceId: "SURF-08-FORTUNE",
    route: "/fortune",
    title:
      "운세 공유 모달(FortuneShareModal) Tab 포커스 트랩·복귀 누락, 운세 탭 목록(role='tablist') 화살표 키 및 tabpanel 연결 누락, 성별 선택 토글 aria-pressed 누락",
    targetFilesToFix: [
      "apps/web/src/domains/fortune/FortuneShareModal.tsx",
      "apps/web/src/domains/fortune/FortunePage.tsx",
    ],
    wcagCriteria: ["2.4.3 Focus Order", "4.1.2 Name, Role, Value", "2.3.3 Animation from Interactions"],
    reproductionSteps: [
      "1. `/fortune`에서 생년월일 입력 또는 기본 상태로 결과를 확인하고, 성별 토글 버튼('선택 안 함', '남성', '여성')의 `aria-pressed` 속성과 그룹 역할을 검사한다.",
      "2. 상단 `role='tablist'[aria-label='운세 종류']`의 탭에 포커스한 뒤 `ArrowRight`/`ArrowLeft` 입력 시 포커스 이동 여부와 하단 패널의 `role='tabpanel'` 존재 여부를 확인한다.",
      "3. 결과 영역의 '공유·저장' 버튼을 눌러 `FortuneShareModal`(`role='dialog'[aria-label='운세 결과 공유']`)을 연 뒤 `Tab`으로 모달 외부 이탈 여부 및 `Escape` 닫기 후 트리거 포커스 복귀 여부를 확인한다.",
    ],
    observedEvidence:
      "FortuneShareModal.tsx:58-66에서 Escape 닫기만 처리하고 Tab 포커스 트랩 및 닫기 후 트리거 복귀가 없음. FortunePage.tsx:732-757에서 role='tablist'가 화살표 키 네비게이션과 role='tabpanel'을 제공하지 않으며, lines 1549-1569 성별 선택 버튼 3개에 aria-pressed가 전혀 없고 line 717 animate-ping에 motion-reduce:animate-none이 누락됨.",
    minimalFixRecommendation:
      "FortuneShareModal에 Tab/Shift+Tab 포커스 트랩과 닫기 시 이전 activeElement 포커스 복귀를 추가하고, FortunePage 탭 목록에 ArrowLeft/Right 핸들러 및 role='tabpanel'을 연결하며, 성별 버튼에 role='group'과 aria-pressed를 명시한다.",
  },
  {
    id: "GAP-R4-03",
    severity: "medium",
    axis: "aria-role-state-contrast",
    surfaceId: "SURF-02-PRICING",
    route: "/pricing",
    title:
      "요금제 추천 배지 하드코딩 text-white로 인한 고대비 테마 명도 대비 미달(1.24:1) 및 FAQ <summary> 펼침 마커·포커스 링 제거",
    targetFilesToFix: ["apps/web/src/app/routes/pricing-page.tsx"],
    wcagCriteria: ["1.4.3 Contrast (Minimum)", "2.4.7 Focus Visible", "4.1.2 Name, Role, Value"],
    reproductionSteps: [
      "1. `/pricing` 접속 후 고대비 테마(`data-theme='contrast'`) 또는 밝은 액센트 상태에서 Pro 플랜 상단 '추천 · MOST POPULAR' 배지의 전경색(`text-white`)과 배경색(`bg-accent`) 명도 대비를 측정한다.",
      "2. 하단 '자주 묻는 질문' 섹션의 `<summary>` 요소에 `Tab`으로 포커스할 때 기본 삼각형 마커가 `list-none [&::-webkit-details-marker]:hidden`으로 숨겨진 상태에서 대체 아이콘이나 `focus-visible` 외곽선이 표시되는지 확인한다.",
    ],
    observedEvidence:
      "pricing-page.tsx:250에서 `bg-accent ... text-white`를 하드코딩하여 고대비 테마(밝은 황색 `--accent`) 적용 시 명도 대비가 4.5:1 기준에 미달함(`text-on-accent` 미사용). 또한 lines 338-343 `<summary>`에서 기본 마커(`list-none [&::-webkit-details-marker]:hidden`)를 제거하면서 대체 화살표 아이콘과 `focus-visible:outline` 스타일을 빠뜨림.",
    minimalFixRecommendation:
      "추천 배지의 `text-white`를 의미 토큰 `text-on-accent`로 교체하고, FAQ `<summary>`에 `focus-visible:outline` 링과 회전 가능한 Chevron 아이콘을 추가한다.",
  },
  {
    id: "GAP-R4-04",
    severity: "medium",
    axis: "reduced-motion-shortcut-safety",
    surfaceId: "SURF-05-LEARN-LESSON",
    route: "/learn/lessons/studio-first-page",
    title:
      "배우기 상세 페이지 스킵 링크 대상(#learn-main) tabIndex={-1} 누락 및 단일 문자 단축키(1~9, C, [, ]) 대화상자 열림 시 미차단",
    targetFilesToFix: ["apps/web/src/domains/learn/LearnContent.tsx"],
    wcagCriteria: ["2.4.1 Bypass Blocks", "2.1.4 Character Key Shortcuts"],
    reproductionSteps: [
      "1. `/learn/lessons/studio-first-page`에서 첫 번째 포커스 요소인 `.learn-skip-link`('본문으로 건너뛰기', `href='#learn-main'`)의 대상 `#learn-main` 요소가 포커스 가능한지(`tabIndex={-1}`) 확인한다.",
      "2. 같은 화면에서 전역 대화상자(`[role='dialog']`)가 열려 있을 때 단일 문자 키(`1`, `c`, `[`, `]`) 입력 시 배경 레슨 단계나 체크리스트가 의도치 않게 변경되는지 확인한다.",
    ],
    observedEvidence:
      "LearnContent.tsx:728-738에서 `<a className='learn-skip-link' href='#learn-main'>`의 타깃 `<div id='learn-main'>`에 `tabIndex={-1}`이 없어 프로그래밍 방식 포커스 고정이 보장되지 않으며, lines 242-279의 전역 단일 키 리스너(`1`~`9`, `c`, `[`, `]`)가 `[role='dialog']` 내부 포커스 상태를 가드하지 않음.",
    minimalFixRecommendation:
      "`#learn-main` 컨테이너에 `tabIndex={-1}`을 추가하고, `LessonSession`의 전역 `keydown` 핸들러에 `target.closest('[role=\"dialog\"], dialog')` 및 수정키(`ctrlKey || metaKey || altKey`) 가드를 추가한다.",
  },
  {
    id: "GAP-R4-05",
    severity: "medium",
    axis: "reflow-320-zoom-200-target-size",
    surfaceId: "SURF-07-MY-SPACE",
    route: "/my",
    title:
      "미검증 공개 표면(/my, /community/timelapses, /read/spatial, /market, /help) 필터 칩·컨트롤 44px 터치 타깃 미달 및 /play 그룹 역할 누락",
    targetFilesToFix: [
      "apps/web/src/domains/account/MySpaceHubPage.tsx",
      "apps/web/src/domains/creator/spatial-reader/StudioSpatialReaderPage.tsx",
      "apps/web/src/domains/community/TimelapseGalleryPage.tsx",
      "apps/web/src/domains/market/components/MarketQuickPreviewDialog.tsx",
      "apps/web/src/domains/legal/HelpCenterPage.tsx",
      "apps/web/src/domains/play/PlayPage.tsx",
    ],
    wcagCriteria: ["2.5.5 Target Size", "1.4.10 Reflow", "4.1.2 Name, Role, Value"],
    reproductionSteps: [
      "1. `320×844` 모바일 뷰포트에서 `/my`(역할 필터 칩 `min-h-9`), `/read/spatial`(곡률·시선 포커스 칩 `py-1.5`), `/community/timelapses`(CTA·검색 `min-h-9`/`h-9`)의 컨트롤 높이(`getBoundingClientRect().height`)를 측정한다.",
      "2. `/help`를 `320×844` 및 `200%` 확대에서 열어 상단 토픽 카드 그리드(`grid-cols-2`)의 카드 폭이 약 140px로 압축되는지 확인하고, FAQ 화살표(`transition-transform`)의 `motion-reduce` 적용 여부를 검사한다.",
      "3. `/play`에서 `.play-filter-tabs`(`aria-label='콘텐츠 분류'`) 요소에 `role='group'`이 지정되어 있는지 확인한다.",
    ],
    observedEvidence:
      "MySpaceHubPage.tsx:335(`min-h-9`=36px), StudioSpatialReaderPage.tsx:414/435(`py-1.5`=30px), TimelapseGalleryPage.tsx:87/130(`min-h-9`/`h-9`=36px), MarketQuickPreviewDialog.tsx:206/286(`size-9`=36px) 등 컨트롤 높이가 30~36px로 프로젝트 표준(44px, `min-h-11`) 미달. PlayPage.tsx:137은 `.play-filter-tabs` `<div>`에 `role='group'` 없이 `aria-label='콘텐츠 분류'`만 부여함.",
    minimalFixRecommendation:
      "각 페이지의 필터/토글 칩과 아이콘 버튼에 `min-h-11`/`size-11`(44px) 터치 타깃 바닥선을 적용하고, `HelpCenterPage.tsx:276`을 `grid-cols-1 min-[380px]:grid-cols-2` 및 `motion-reduce:transition-none`으로 보강하며, `PlayPage.tsx:137`의 `.play-filter-tabs`에 `role='group'`을 추가한다.",
  },
];

const SELECTED_ROUTE_SET = new Set(ROUND4_UNCOVERED_SURFACES.map((s) => s.route));
const DEDUPED_ALIAS_TO_CANONICAL = new Map<string, string>();
for (const surface of ROUND4_UNCOVERED_SURFACES) {
  for (const alias of surface.deduplicatedAliases) {
    DEDUPED_ALIAS_TO_CANONICAL.set(alias, surface.route);
  }
}

export function classifyRouteForRound4Audit(routePath: string): ClassifiedRouteEntry {
  if ((EXISTING_VERIFIED_BASE_ROUTES as readonly string[]).includes(routePath)) {
    return {
      route: routePath,
      disposition: "existing-verified",
      reason: "Round 1~2 실제 브라우저 매트릭스(31건) 및 후속 결함 검증에서 이미 실증 완료",
    };
  }

  if (SELECTED_ROUTE_SET.has(routePath)) {
    return {
      route: routePath,
      disposition: "selected-uncovered-12",
      reason: "Round 4 기능군별 대표 미검증 실브라우저 검증 대상(12개)",
      canonicalRoute: routePath,
    };
  }

  // 1) 진행 중 구현/별도 담당 제외 범위: 드로잉, 홈, 일정, 탐색, Character(PackagePanel/PackageDetail), 메시지함, ServiceStatus
  if (
    routePath === "/home" ||
    routePath === "/calendar" ||
    routePath === "/schedule" ||
    routePath === "/production/projects/visual-audit/schedule" ||
    routePath === "/status" ||
    routePath === "/messages" ||
    routePath.startsWith("/messages/") ||
    routePath === "/notifications" ||
    routePath === "/settings/notifications" ||
    routePath.startsWith("/discover/") ||
    routePath === "/explore" ||
    routePath === "/search" ||
    routePath === "/ranking" ||
    routePath === "/recommend" ||
    routePath === "/compare" ||
    routePath === "/random" ||
    routePath === "/insights" ||
    routePath.startsWith("/insights/") ||
    routePath === "/news" ||
    routePath === "/guide" ||
    routePath === "/authors" ||
    routePath.startsWith("/author/") ||
    routePath === "/tags" ||
    routePath.startsWith("/title/") ||
    routePath.startsWith("/lists/") ||
    routePath === "/references" ||
    routePath === "/studio/character" ||
    routePath.startsWith("/studio/character") ||
    routePath.endsWith("/character") ||
    routePath.includes("/characters/") ||
    routePath === "/shaper" ||
    routePath.startsWith("/character-chat") ||
    routePath === "/market/resource/visual-audit" ||
    routePath === "/market/manage" ||
    routePath === "/market/seller" ||
    routePath === "/studio/comic" ||
    routePath === "/studio/animation" ||
    routePath === "/studio/brushes" ||
    routePath === "/studio/bg3d" ||
    routePath === "/studio/poser" ||
    routePath === "/studio/lift3d" ||
    routePath.startsWith("/studio/compose/") ||
    routePath.startsWith("/studio/work/") ||
    routePath.startsWith("/studio/remix/") ||
    routePath.startsWith("/studio/p/") ||
    routePath.startsWith("/studio/draft/") ||
    routePath.startsWith("/studio/assets/brushes") ||
    routePath === "/brush-lab" ||
    routePath === "/studio/brush-lab" ||
    routePath === "/canvas"
  ) {
    return {
      route: routePath,
      disposition: "excluded-active-owner",
      reason:
        "타 담당 진행 중 작업(드로잉/홈/일정/탐색/Character·PackagePanel/메시지함/ServiceStatus) 소유 보호 제외",
    };
  }

  // 2) 로그인/관리자 권한 가드 필요 경로
  if (
    routePath.startsWith("/admin") ||
    routePath === "/community/cafes/visual-audit/manage" ||
    routePath === "/account/points" ||
    routePath === "/points" ||
    routePath === "/coins" ||
    routePath === "/settings/ai" ||
    routePath === "/settings/api-keys" ||
    routePath === "/settings/integrations" ||
    routePath === "/settings/role" ||
    routePath === "/creator/revenue" ||
    routePath === "/creator/membership" ||
    routePath === "/market/orders" ||
    routePath === "/market/library" ||
    routePath === "/market/wishlist" ||
    routePath === "/market/publish" ||
    routePath === "/market/checkout/visual-audit"
  ) {
    return {
      route: routePath,
      disposition: "auth-gated",
      reason: "비로그인 게스트 접근 시 인증/권한 가드 또는 계정 전용 결제·정산 세션 필요",
    };
  }

  // 3) 미구현 또는 합성 visual-audit 샘플 ID에 대해 404/폴백을 렌더하는 경로
  if (
    routePath === "/auth/visual-audit" ||
    routePath === "/production/projects/visual-audit/episodes/visual-audit"
  ) {
    return {
      route: routePath,
      disposition: "unimplemented-fallback",
      reason: "동적 파라미터 샘플(visual-audit) 허용 목록 외 경로로 NotFound/차단 폴백 렌더",
    };
  }

  // 4) 실데이터/백엔드 API 필수 경로(오프라인·합성 503 환경에서 로컬 시드 없이 ErrorState 렌더)
  if (
    routePath === "/reviews" ||
    routePath === "/community/cafes" ||
    routePath === "/community/cafes/visual-audit" ||
    routePath === "/community/events" ||
    routePath === "/community/post/visual-audit" ||
    routePath === "/community/promote/visual-audit" ||
    routePath === "/community/promote/visual-audit/edit" ||
    routePath === "/community/visual-audit" ||
    routePath === "/events/visual-audit" ||
    routePath === "/contests/visual-audit" ||
    routePath === "/funding/visual-audit" ||
    routePath === "/enterprise/rfp/visual-audit" ||
    routePath === "/u/visual-audit" ||
    routePath === "/profile/visual-audit" ||
    routePath === "/team/people/visual-audit" ||
    routePath === "/showcase/series/visual-audit" ||
    routePath === "/cuts/visual-audit" ||
    routePath === "/market/creator/visual-audit"
  ) {
    return {
      route: routePath,
      disposition: "realdata-required",
      reason: "실서버 레코드 조회 필수 경로(게스트 합성 503 격리 시 빈/오류 상태만 표시)",
    };
  }

  // 5) 단순 라우트 중복(리다이렉트 별칭, 동일 컴포넌트 다중 마운트, 동일 템플릿의 파라미터 반복 확장)
  const mappedCanonical = DEDUPED_ALIAS_TO_CANONICAL.get(routePath);
  if (
    mappedCanonical ||
    routePath.startsWith("/about/") ||
    routePath.startsWith("/learn/lessons/") ||
    routePath.startsWith("/learn/paths/") ||
    routePath.startsWith("/research/") ||
    routePath.startsWith("/story-lab/") ||
    routePath.startsWith("/production/projects/visual-audit") ||
    routePath.startsWith("/production/workspaces") ||
    routePath.startsWith("/create/") ||
    routePath.startsWith("/legal/") ||
    routePath.startsWith("/policy/") ||
    [
      "/make",
      "/new",
      "/more",
      "/tour",
      "/principles",
      "/story",
      "/creator-hub",
      "/creator-hub/references",
      "/publishing",
      "/ecosystem",
      "/learn/education",
      "/learn/accessibility",
      "/challenges",
      "/motion-webtoon",
      "/music",
      "/studio/recovery",
      "/studio/trash",
      "/studio/assets/3d",
      "/studio/storyworld",
      "/data-transparency",
      "/ai-ethics",
    ].includes(routePath)
  ) {
    return {
      route: routePath,
      disposition: "duplicate-or-alias",
      reason: "리다이렉트 별칭·동일 컴포넌트 다중 경로·동일 레슨/시트 템플릿 파라미터 반복 확장",
      canonicalRoute: mappedCanonical,
    };
  }

  return {
    route: routePath,
    disposition: "uncovered-secondary",
    reason: "기능군별 대표 12개 표면으로 대표 검증되는 동일 도메인 보조 정적/서브 페이지",
  };
}

export async function buildRound4InventoryReport(
  repoRoot: string = process.cwd(),
): Promise<Round4InventoryClassificationReport> {
  const raw = await collectAuditRouteInventory(repoRoot);
  const countsByDisposition: Record<RouteAuditDisposition, number> = {
    "existing-verified": 0,
    "excluded-active-owner": 0,
    "duplicate-or-alias": 0,
    "auth-gated": 0,
    "realdata-required": 0,
    "unimplemented-fallback": 0,
    "selected-uncovered-12": 0,
    "uncovered-secondary": 0,
  };

  const classifiedRoutes: ClassifiedRouteEntry[] = raw.routes.map((route: string) => {
    const entry = classifyRouteForRound4Audit(route);
    countsByDisposition[entry.disposition] += 1;
    return entry;
  });

  const existingSweepPath = path.join(
    repoRoot,
    "docs/accessibility-sweep-20261107/browser-sweep-report.json",
  );
  const existingSweep = JSON.parse(fs.readFileSync(existingSweepPath, "utf8")) as {
    viewportMatrixCount: number;
  };

  return {
    generatedAt: "2026-11-07",
    totalConcreteRoutes: raw.routes.length,
    existingBrowserMatrixCheckCount: existingSweep.viewportMatrixCount,
    existingVerifiedBaseRoutes: EXISTING_VERIFIED_BASE_ROUTES,
    countsByDisposition,
    selectedSurfaces: ROUND4_UNCOVERED_SURFACES,
    defectFindings: ROUND4_DEFECT_FINDINGS,
    classifiedRoutes,
  };
}

export function verifyRound4OwnershipBoundary(repoRoot: string = process.cwd()): {
  readonly ok: boolean;
  readonly ownedPaths: readonly string[];
  readonly violatingPaths: readonly string[];
} {
  const status = spawnSync("git", ["status", "--porcelain=v1", "-uall"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const diff = spawnSync("git", ["diff", "--name-only", "origin/main...HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const paths = new Set<string>();
  for (const line of (status.stdout ?? "").split("\n")) {
    if (!line.trim()) continue;
    const raw = line.slice(3).trim().replace(/^"+|"+$/gu, "");
    for (const part of raw.split(" -> ")) {
      if (part.trim()) paths.add(part.trim());
    }
  }
  for (const line of (diff.stdout ?? "").split("\n")) {
    if (line.trim()) paths.add(line.trim());
  }
  const ownedPaths: string[] = [];
  const violatingPaths: string[] = [];
  for (const p of [...paths].sort()) {
    if (p.startsWith(ROUND4_OWNED_PREFIX)) ownedPaths.push(p);
    else violatingPaths.push(p);
  }
  return { ok: violatingPaths.length === 0, ownedPaths, violatingPaths };
}
