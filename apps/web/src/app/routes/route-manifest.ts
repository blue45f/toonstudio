/**
 * 라우트 등록 계약 (BLUEPRINT §1.3, S1-8).
 *
 * 이 목록에 오르는 모든 표면은 아래 네 가지를 선언해야 한다. 선언이 없으면
 * 타입 검사(필수 필드)와 route-governance.test.ts가 CI에서 실패한다 —
 * 선언 없는 신규 최상위 표면은 만들 수 없다.
 *
 * - canonicalSurfaceId: 속한 정본 그룹. 같은 일의 표면은 정본 허브와 모듈이
 *   같은 id를 공유한다 (§1.2 정본 모델). 새 그룹이 필요하면 이 유니온에
 *   추가하는 것 자체가 거버넌스 리뷰 대상이다.
 * - surfaceRole: 이 표면의 역할을 고정한 한 문장. 그룹 안에서의 경계이며
 *   UI 문구가 아니다.
 * - tier: 노출 등급. site-navigation의 tier 어휘와 같다 —
 *   "primary"(그룹 정본·1차 노출) | "contextual"(상황별 노출) |
 *   "directory"(사이트맵·팔레트 전용).
 * - stage: 속한 흐름 단계. 회차 여정(탐색→제작→게시→운영)과
 *   계정·지원 단계를 같은 어휘로 쓴다.
 */
export type AppRouteCanonicalGroupId =
  | "discover"
  | "community"
  | "create"
  | "market"
  | "personal"
  | "account"
  | "support"
  | "admin";

export type AppRouteTier = "primary" | "contextual" | "directory";

export type AppRouteStage =
  | "discover"
  | "produce"
  | "publish"
  | "operate"
  | "account"
  | "support";

/** 라우트 등록 계약의 선언 부분. route-manifest와 라우터 정의가 공유한다. */
export interface AppRouteGovernanceDeclaration {
  canonicalSurfaceId: AppRouteCanonicalGroupId;
  surfaceRole: string;
  tier: AppRouteTier;
  stage: AppRouteStage;
}

export interface AppRouteMeta extends AppRouteGovernanceDeclaration {
  path: string;
  label: string;
}

export const appRouteCanonicalGroupIds: readonly AppRouteCanonicalGroupId[] = [
  "discover",
  "community",
  "create",
  "market",
  "personal",
  "account",
  "support",
  "admin",
];

export const appRouteTiers: readonly AppRouteTier[] = [
  "primary",
  "contextual",
  "directory",
];

export const appRouteStages: readonly AppRouteStage[] = [
  "discover",
  "produce",
  "publish",
  "operate",
  "account",
  "support",
];

/**
 * 선언이 런타임에도 완전한지 검사한다. 타입을 우회한 등록(any·캐스트·JS)이
 * CI 테스트에서 걸러지는 지점이다.
 */
export function isAppRouteGovernanceComplete(
  route: Partial<AppRouteMeta>,
): route is AppRouteMeta {
  return (
    typeof route.path === "string" &&
    route.path.startsWith("/") &&
    typeof route.label === "string" &&
    route.label.length > 0 &&
    appRouteCanonicalGroupIds.includes(
      route.canonicalSurfaceId as AppRouteCanonicalGroupId,
    ) &&
    typeof route.surfaceRole === "string" &&
    route.surfaceRole.trim().length > 0 &&
    !route.surfaceRole.includes("\n") &&
    appRouteTiers.includes(route.tier as AppRouteTier) &&
    appRouteStages.includes(route.stage as AppRouteStage)
  );
}

export function routeGovernanceFor(path: string): AppRouteMeta | undefined {
  return appRoutes.find((route) => route.path === path);
}

/**
 * 공개 내비게이션·사이트맵·명령 팔레트가 가리키는 정식 목적지와 그 i18n 라벨 키.
 * 라우터 등록부(groups/app-routes)를 대체하지 않는 읽기 전용 목록이며,
 * 모든 경로는 실제 등록 라우트에 맞고 라벨은 ko/en 셸 사전에 있어야 한다(route-manifest.test.ts).
 * 각 항목의 거버넌스 선언은 §1.3 등록 계약이며, 기존 라우트 백필은 현행
 * 노출·역할을 그대로 선언한 값이다(route-governance.test.ts).
 */
export const appRoutes: AppRouteMeta[] = [
  // 홈·작품 탐색
  { path: "/", label: "nav.home", canonicalSurfaceId: "discover", surfaceRole: "홈(정본) — 추천·이어보기와 모든 탐색의 시작점", tier: "primary", stage: "discover" },
  { path: "/ranking", label: "route.ranking", canonicalSurfaceId: "discover", surfaceRole: "랭킹 — 인기 작품 순위를 확인하는 탐색 표면", tier: "contextual", stage: "discover" },
  { path: "/search", label: "route.search", canonicalSurfaceId: "discover", surfaceRole: "검색 — 작품·작가·태그를 찾는 탐색 표면", tier: "contextual", stage: "discover" },
  { path: "/references", label: "route.references", canonicalSurfaceId: "discover", surfaceRole: "레퍼런스 — 제작에 쓰는 참고 자료를 모아 보는 표면", tier: "directory", stage: "produce" },
  { path: "/recommend", label: "route.recommend", canonicalSurfaceId: "discover", surfaceRole: "추천 — 취향 기반으로 작품을 제안하는 표면", tier: "directory", stage: "discover" },
  { path: "/play", label: "route.play", canonicalSurfaceId: "discover", surfaceRole: "플레이 — 작품을 감상·체험하는 표면", tier: "contextual", stage: "discover" },
  { path: "/cuts", label: "route.cuts", canonicalSurfaceId: "discover", surfaceRole: "컷 모아보기 — 인상적인 컷을 둘러보는 표면", tier: "directory", stage: "discover" },
  { path: "/newsletter", label: "route.newsletter", canonicalSurfaceId: "discover", surfaceRole: "뉴스레터 — 새 작품과 소식을 받아 보는 표면", tier: "directory", stage: "discover" },
  { path: "/character-chat", label: "route.characterChat", canonicalSurfaceId: "discover", surfaceRole: "캐릭터 챗 — 작품 속 캐릭터와 대화하는 체험 표면", tier: "contextual", stage: "discover" },
  { path: "/explore", label: "route.explore", canonicalSurfaceId: "discover", surfaceRole: "탐색 허브 — 장르·태그·큐레이션으로 작품을 찾는 정본 입구", tier: "primary", stage: "discover" },
  { path: "/calendar", label: "route.calendar", canonicalSurfaceId: "discover", surfaceRole: "연재 캘린더 — 요일·일정별 연재를 확인하는 표면", tier: "contextual", stage: "discover" },
  { path: "/reviews", label: "route.reviews", canonicalSurfaceId: "discover", surfaceRole: "리뷰 — 독자 리뷰를 모아 보는 표면", tier: "directory", stage: "discover" },
  { path: "/random", label: "route.random", canonicalSurfaceId: "discover", surfaceRole: "랜덤 — 우연히 새 작품을 만나는 표면", tier: "directory", stage: "discover" },
  { path: "/tags", label: "route.tags", canonicalSurfaceId: "discover", surfaceRole: "태그 — 태그별로 작품을 찾는 표면", tier: "directory", stage: "discover" },
  { path: "/authors", label: "route.authors", canonicalSurfaceId: "discover", surfaceRole: "작가 — 작가 목록을 둘러보는 표면", tier: "directory", stage: "discover" },
  { path: "/news", label: "route.news", canonicalSurfaceId: "discover", surfaceRole: "뉴스 — 플랫폼과 업계 소식을 전하는 표면", tier: "directory", stage: "discover" },
  { path: "/compare", label: "route.compare", canonicalSurfaceId: "discover", surfaceRole: "비교 — 작품을 나란히 비교하는 표면", tier: "directory", stage: "discover" },
  { path: "/insights", label: "route.insights", canonicalSurfaceId: "discover", surfaceRole: "인사이트 — 창작·시장 지표를 보는 표면", tier: "directory", stage: "operate" },
  { path: "/guide", label: "route.guide", canonicalSurfaceId: "discover", surfaceRole: "가이드 — 서비스 이용법을 안내하는 표면", tier: "directory", stage: "support" },
  { path: "/fortune", label: "route.fortune", canonicalSurfaceId: "discover", surfaceRole: "운세 — 재미로 보는 오늘의 운세 표면", tier: "directory", stage: "discover" },
  // 커뮤니티·창작자
  { path: "/community", label: "route.community", canonicalSurfaceId: "community", surfaceRole: "커뮤니티 허브 — 게시판과 모임의 정본 입구", tier: "primary", stage: "discover" },
  { path: "/community/cafes", label: "route.community_cafes", canonicalSurfaceId: "community", surfaceRole: "카페 — 주제별 모임 공간 표면", tier: "contextual", stage: "discover" },
  { path: "/creators", label: "route.creators", canonicalSurfaceId: "community", surfaceRole: "창작자 — 창작자 디렉터리 표면", tier: "contextual", stage: "discover" },
  { path: "/messages", label: "route.messages", canonicalSurfaceId: "community", surfaceRole: "메시지 — 이용자끼리 대화를 주고받는 표면", tier: "contextual", stage: "discover" },
  // 제작
  { path: "/studio", label: "route.studio", canonicalSurfaceId: "create", surfaceRole: "스튜디오 허브 — 작품 제작의 정본 입구", tier: "primary", stage: "produce" },
  { path: "/studio/new", label: "route.studioNew", canonicalSurfaceId: "create", surfaceRole: "새 작품 — 작품 만들기를 시작하는 표면", tier: "contextual", stage: "produce" },
  { path: "/studio/import", label: "route.studioImport", canonicalSurfaceId: "create", surfaceRole: "가져오기 — 외부 원고를 불러오는 표면", tier: "contextual", stage: "produce" },
  { path: "/studio/templates", label: "route.studioTemplates", canonicalSurfaceId: "create", surfaceRole: "템플릿 — 제작 템플릿을 고르는 표면", tier: "contextual", stage: "produce" },
  { path: "/studio/assets", label: "route.studioAssets", canonicalSurfaceId: "create", surfaceRole: "에셋 — 제작 소재를 관리하는 표면", tier: "contextual", stage: "produce" },
  { path: "/studio/analytics", label: "route.creatorAnalytics", canonicalSurfaceId: "create", surfaceRole: "창작자 분석 — 작품 성과 지표를 보는 표면", tier: "contextual", stage: "operate" },
  { path: "/production", label: "route.production", canonicalSurfaceId: "create", surfaceRole: "프로덕션 — 프로젝트 단위 제작 허브", tier: "primary", stage: "produce" },
  { path: "/shaper", label: "route.shaper", canonicalSurfaceId: "create", surfaceRole: "셰이퍼 — 형상·3D 제작 도구 표면", tier: "contextual", stage: "produce" },
  // 마켓
  { path: "/market", label: "route.market", canonicalSurfaceId: "market", surfaceRole: "마켓 허브 — 에셋 거래의 정본 입구", tier: "primary", stage: "discover" },
  { path: "/market/browse", label: "route.marketBrowse", canonicalSurfaceId: "market", surfaceRole: "마켓 둘러보기 — 판매 중인 에셋을 탐색하는 표면", tier: "contextual", stage: "discover" },
  { path: "/market/publish", label: "route.marketPublish", canonicalSurfaceId: "market", surfaceRole: "에셋 등록 — 판매할 에셋을 올리는 표면", tier: "contextual", stage: "publish" },
  { path: "/market/library", label: "route.marketLibrary", canonicalSurfaceId: "personal", surfaceRole: "보유 에셋 모듈 — 설치·보관한 에셋 (개인 그룹)", tier: "contextual", stage: "account" },
  { path: "/market/wishlist", label: "route.marketWishlist", canonicalSurfaceId: "market", surfaceRole: "찜 목록 — 관심 에셋을 모아 보는 표면", tier: "contextual", stage: "discover" },
  { path: "/market/manage", label: "route.marketManage", canonicalSurfaceId: "market", surfaceRole: "판매 관리 — 내 판매 에셋을 운영하는 표면", tier: "contextual", stage: "operate" },
  // 계정·요금
  { path: "/library", label: "route.library", canonicalSurfaceId: "personal", surfaceRole: "서재 모듈 — 읽은·찜한 작품 (개인 그룹)", tier: "primary", stage: "account" },
  { path: "/notifications", label: "route.notifications", canonicalSurfaceId: "account", surfaceRole: "알림 — 활동 알림을 확인하는 표면", tier: "contextual", stage: "account" },
  { path: "/onboarding/taste", label: "route.recommend", canonicalSurfaceId: "account", surfaceRole: "취향 온보딩 — 처음 취향을 고르는 표면", tier: "directory", stage: "account" },
  { path: "/me", label: "route.me", canonicalSurfaceId: "personal", surfaceRole: "공개 프로필·계정 모듈 — 내 작품과 활동 (개인 그룹)", tier: "contextual", stage: "account" },
  { path: "/settings", label: "route.settings", canonicalSurfaceId: "account", surfaceRole: "설정 허브 — 계정·앱 설정의 정본 입구", tier: "primary", stage: "account" },
  { path: "/membership", label: "route.membership", canonicalSurfaceId: "account", surfaceRole: "멤버십 — 구독 상태를 관리하는 표면", tier: "contextual", stage: "account" },
  { path: "/account/points", label: "route.assetPoints", canonicalSurfaceId: "account", surfaceRole: "포인트 — 보유 포인트와 이용 내역 표면", tier: "contextual", stage: "account" },
  { path: "/pricing", label: "route.pricing", canonicalSurfaceId: "account", surfaceRole: "요금제 — 플랜을 비교하고 선택하는 표면", tier: "primary", stage: "account" },
  // 안내·지원·정책
  { path: "/about", label: "route.about", canonicalSurfaceId: "support", surfaceRole: "소개 — 서비스를 소개하는 표면", tier: "directory", stage: "support" },
  { path: "/help", label: "route.help", canonicalSurfaceId: "support", surfaceRole: "도움말 허브 — 지원 안내의 정본 입구", tier: "primary", stage: "support" },
  { path: "/support", label: "route.support", canonicalSurfaceId: "support", surfaceRole: "지원 — 문의와 지원을 받는 표면", tier: "contextual", stage: "support" },
  { path: "/feedback", label: "route.feedback", canonicalSurfaceId: "support", surfaceRole: "피드백 — 서비스 의견을 보내는 표면", tier: "contextual", stage: "support" },
  { path: "/contact", label: "route.contact", canonicalSurfaceId: "support", surfaceRole: "연락처 — 제휴·문의 연락 표면", tier: "directory", stage: "support" },
  { path: "/business", label: "route.business", canonicalSurfaceId: "support", surfaceRole: "비즈니스 — 기업 대상 안내 표면", tier: "directory", stage: "support" },
  { path: "/support-us", label: "route.supportUs", canonicalSurfaceId: "support", surfaceRole: "후원 — 서비스 후원을 안내하는 표면", tier: "directory", stage: "support" },
  { path: "/support-creators", label: "route.creatorSupport", canonicalSurfaceId: "support", surfaceRole: "창작자 후원 — 창작자 지원을 안내하는 표면", tier: "directory", stage: "support" },
  { path: "/design", label: "route.design", canonicalSurfaceId: "support", surfaceRole: "디자인 — 디자인 시스템을 보여 주는 표면", tier: "directory", stage: "support" },
  { path: "/copyright", label: "route.copyright", canonicalSurfaceId: "support", surfaceRole: "저작권 — 권리 안내 표면", tier: "directory", stage: "support" },
  { path: "/terms", label: "route.terms", canonicalSurfaceId: "support", surfaceRole: "이용약관 — 약관 문서 표면", tier: "directory", stage: "support" },
  { path: "/privacy", label: "route.privacy", canonicalSurfaceId: "support", surfaceRole: "개인정보처리방침 — 방침 문서 표면", tier: "directory", stage: "support" },
  { path: "/sitemap", label: "route.sitemap", canonicalSurfaceId: "support", surfaceRole: "사이트맵 — 전체 목적지 목록 표면", tier: "directory", stage: "support" },
  { path: "/admin", label: "route.admin", canonicalSurfaceId: "admin", surfaceRole: "관리자 — 플랫폼 운영 콘솔 표면", tier: "primary", stage: "operate" },
];
