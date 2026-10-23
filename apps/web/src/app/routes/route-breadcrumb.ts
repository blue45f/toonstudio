import { canonicalSitePath } from "@/shared/lib/site-route-metadata";

import type { AppBreadcrumbItem } from "../components/breadcrumb";

const HOME: AppBreadcrumbItem = { ko: "홈", en: "Home", href: "/" };

function trail(parent: AppBreadcrumbItem, leafKo: string, leafEn: string): AppBreadcrumbItem[] {
  return [HOME, parent, { ko: leafKo, en: leafEn }];
}

const MARKET: AppBreadcrumbItem = { ko: "마켓", en: "Market", href: "/market" };
const COMMUNITY: AppBreadcrumbItem = { ko: "커뮤니티", en: "Community", href: "/community" };
const ABOUT: AppBreadcrumbItem = { ko: "소개", en: "About", href: "/about" };
const TECHNOLOGY: AppBreadcrumbItem = { ko: "기술", en: "Technology", href: "/about/technology" };
const STUDIO: AppBreadcrumbItem = { ko: "Studio", en: "Studio", href: "/studio" };
const PRODUCTION: AppBreadcrumbItem = { ko: "제작", en: "Production", href: "/production" };
const RESEARCH: AppBreadcrumbItem = { ko: "창작 리서치", en: "Research", href: "/research" };
const CREATOR_HUB: AppBreadcrumbItem = { ko: "창작 허브", en: "Creator hub", href: "/creator-hub" };
const SETTINGS: AppBreadcrumbItem = { ko: "설정", en: "Settings", href: "/settings" };
const FORTUNE: AppBreadcrumbItem = { ko: "운세", en: "Fortune", href: "/fortune" };
const CUTS: AppBreadcrumbItem = { ko: "컷츠", en: "Cuts", href: "/cuts" };
const NEWSLETTER: AppBreadcrumbItem = { ko: "뉴스레터", en: "Newsletter", href: "/newsletter" };
const CHARACTER_CHAT: AppBreadcrumbItem = { ko: "캐릭터 토크", en: "Character Talk", href: "/character-chat" };
const COLLABORATE: AppBreadcrumbItem = { ko: "구인·의뢰", en: "Collaboration", href: "/collaborate" };
const SHOWCASE: AppBreadcrumbItem = { ko: "창작 갤러리", en: "Showcase", href: "/showcase" };
const CREATE: AppBreadcrumbItem = { ko: "작품 시작하기", en: "Start a work", href: "/create" };
const INSIGHTS: AppBreadcrumbItem = { ko: "트렌드", en: "Trends", href: "/insights" };
const DISCOVER: AppBreadcrumbItem = { ko: "탐색", en: "Discover", href: "/discover" };
const EVENTS: AppBreadcrumbItem = { ko: "이벤트", en: "Events", href: "/events" };
const OPEN_DATA: AppBreadcrumbItem = { ko: "공개 데이터 창작실", en: "Open data", href: "/research/open-data" };
const LEARN: AppBreadcrumbItem = { ko: "웹툰 배우기", en: "Learn" };

/** 홈 > 대분류 > 중분류 > 현재 페이지 형태의 4단 트레일. */
function trail2(
  parent: AppBreadcrumbItem,
  sub: AppBreadcrumbItem,
  leafKo: string,
  leafEn: string,
): AppBreadcrumbItem[] {
  return [HOME, parent, sub, { ko: leafKo, en: leafEn }];
}

/**
 * 주요 2뎁스 이상 경로의 브레드크럼 트레일.
 *
 * 큐레이션 방식으로 운영한다: 라벨은 사람이 고른 한·영 문구를 그대로 쓰며,
 * 등록되지 않은 경로는 빈 배열을 돌려준다(브레드크럼 미표시). 새 경로를 추가할
 * 때는 이 테이블에 한 줄을 더하고 `withRouteBreadcrumb`으로 감싸면 된다.
 *
 * 2026-10-13 UX 고도화: 정적 라우트 237개 중 2뎁스 이상 주요 경로의 커버리지를
 * 57개 → 121개로 넓혔다. 동적 세그먼트(:id 등)와 스튜디오 내부 경로는 각 셸이
 * 자체 위치 표시를 소유하므로 여기 넣지 않는다.
 */
const CURATED_TRAILS: Record<string, AppBreadcrumbItem[]> = {
  "/market/browse": trail(MARKET, "둘러보기", "Browse"),
  "/market/fit": trail(MARKET, "핏 랩", "Fit lab"),
  "/market/publish": trail(MARKET, "에셋 등록", "Publish"),
  "/market/manage": trail(MARKET, "내 등록 에셋", "My assets"),
  "/market/library": trail(MARKET, "내 보관함", "Library"),
  "/market/wishlist": trail(MARKET, "찜 목록", "Wishlist"),
  "/market/compare": trail(MARKET, "비교", "Compare"),
  "/community/cafes": trail(COMMUNITY, "장르 카페", "Cafes"),
  "/community/events": trail(COMMUNITY, "이벤트", "Events"),
  "/community/promote": trail(COMMUNITY, "홍보 게시판", "Promote"),
  "/collaborate": [HOME, { ko: "구인·의뢰", en: "Collaboration" }],
  "/team/recruiting": [HOME, { ko: "협업", en: "Team", href: "/team" }, { ko: "인재·지원 관리", en: "Recruiting" }],
  "/about/workflow": trail(ABOUT, "제작 과정", "Workflow"),
  "/about/principles": trail(ABOUT, "제품 원칙", "Principles"),
  "/about/technology": [HOME, ABOUT, { ko: "기술", en: "Technology" }],
  "/about/technology/architecture": [HOME, ABOUT, TECHNOLOGY, { ko: "아키텍처", en: "Architecture" }],
  "/about/technology/libraries": [HOME, ABOUT, TECHNOLOGY, { ko: "라이브러리", en: "Libraries" }],
  "/about/technology/story": [HOME, ABOUT, TECHNOLOGY, { ko: "제작 스토리", en: "Story" }],
  "/about/technology/guides": [HOME, ABOUT, TECHNOLOGY, { ko: "적용 가이드", en: "Guides" }],
  "/about/technology/references": [HOME, ABOUT, TECHNOLOGY, { ko: "참고 자료", en: "References" }],
  "/about/technology/field-notes": [HOME, ABOUT, TECHNOLOGY, { ko: "심화 노트", en: "Field notes" }],
  "/about/technology/deck": [HOME, ABOUT, TECHNOLOGY, { ko: "발표 모드", en: "Deck" }],
  "/about/technology/videos": [HOME, ABOUT, TECHNOLOGY, { ko: "영상", en: "Video" }],
  "/about/technology/licenses": [HOME, ABOUT, TECHNOLOGY, { ko: "라이선스", en: "Licenses" }],
  "/about/technology/glossary": [HOME, ABOUT, TECHNOLOGY, { ko: "용어집", en: "Glossary" }],
  "/about/technology/atlas": [HOME, ABOUT, TECHNOLOGY, { ko: "기술 도감", en: "Tech atlas" }],
  "/about/technology/playbook": [HOME, ABOUT, TECHNOLOGY, { ko: "플레이북", en: "Playbook" }],
  "/product-tour": [HOME, { ko: "제품 투어", en: "Product tour" }],
  "/brand-film": [HOME, { ko: "브랜드 필름", en: "Brand film" }],
  "/promo-library": [HOME, { ko: "홍보 영상 자료실", en: "Promo video library" }],
  "/membership": [HOME, { ko: "멤버십", en: "Membership" }],
  "/membership/usage": [HOME, { ko: "멤버십", en: "Membership", href: "/membership" }, { ko: "이용 내역", en: "Usage" }],
  "/account/points": [HOME, { ko: "내 정보", en: "My profile", href: "/me" }, { ko: "포인트 지갑", en: "Points wallet" }],
  "/settings/ai": trail(SETTINGS, "AI 설정", "AI settings"),
  "/settings/integrations": trail(SETTINGS, "연동", "Integrations"),
  "/settings/api-keys": [HOME, SETTINGS, { ko: "연동", en: "Integrations", href: "/settings/integrations" }, { ko: "API 키 허브", en: "API key hub" }],
  "/studio/new": trail(STUDIO, "새 작품", "New work"),
  "/studio/import": trail(STUDIO, "가져오기", "Import"),
  "/studio/assets": trail(STUDIO, "작품 재료", "Assets"),
  "/studio/toolchain": trail(STUDIO, "툴체인", "Toolchain"),
  "/studio/engines": trail(STUDIO, "엔진", "Engines"),
  "/studio/jobs": trail(STUDIO, "작업", "Jobs"),
  "/studio/growth": trail(STUDIO, "그로스 랩", "Growth lab"),
  "/studio/manual": trail(STUDIO, "매뉴얼", "Manual"),
  "/production/projects": trail(PRODUCTION, "프로젝트", "Projects"),
  "/production/workspaces": trail(PRODUCTION, "워크스페이스", "Workspaces"),
  "/research/assets": trail(RESEARCH, "레퍼런스 아틀라스", "Reference atlas"),
  "/research/catalog": trail(RESEARCH, "작품 리서치 랩", "Catalog lab"),
  "/research/books": trail(RESEARCH, "만화·도서 판본", "Books"),
  "/research/open-data": trail(RESEARCH, "공개 데이터 창작실", "Open data"),
  "/creator-hub/references": trail(CREATOR_HUB, "창작 레퍼런스", "References"),
  "/story-lab": [HOME, { ko: "스토리 연구실", en: "Story lab" }],
  "/learn/recipes": [HOME, { ko: "웹툰 배우기", en: "Learn" }, { ko: "제작 레시피", en: "Recipes" }],
  "/ecosystem/education": [HOME, { ko: "생태계", en: "Ecosystem", href: "/ecosystem" }, { ko: "교육 허브", en: "Education" }],
  "/pricing": [HOME, { ko: "요금제", en: "Pricing" }],
  // 운세 — 가벼운 즐길 거리도 "지금 어디인지"는 항상 보여준다.
  "/fortune/today": trail(FORTUNE, "오늘의 운세", "Today"),
  "/fortune/tarot": trail(FORTUNE, "타로", "Tarot"),
  "/fortune/saju": trail(FORTUNE, "사주", "Saju"),
  "/fortune/zodiac": trail(FORTUNE, "별자리", "Zodiac"),
  "/fortune/compatibility": trail(FORTUNE, "궁합", "Compatibility"),
  "/fortune/monthly": trail(FORTUNE, "월간 운세", "Monthly"),
  "/fortune/yearly": trail(FORTUNE, "연간 운세", "Yearly"),
  "/fortune/prescription": trail(FORTUNE, "독서 처방", "Reading prescription"),
  // 리서치 데스크 하위 자료실
  "/research/3d-assets": trail(RESEARCH, "3D 에셋", "3D assets"),
  "/research/archive": trail(RESEARCH, "아카이브", "Archive"),
  "/research/creatures": trail(RESEARCH, "생물 자료", "Creatures"),
  "/research/fonts": trail(RESEARCH, "폰트", "Fonts"),
  "/research/materials": trail(RESEARCH, "소재", "Materials"),
  "/research/material-assets": trail(RESEARCH, "소재 에셋", "Material assets"),
  "/research/music-metadata": trail(RESEARCH, "음악 메타데이터", "Music metadata"),
  "/research/open-creation": trail(RESEARCH, "오픈 창작", "Open creation"),
  "/research/packs": trail(RESEARCH, "리서치 팩", "Research packs"),
  "/research/space-assets": trail(RESEARCH, "우주 에셋", "Space assets"),
  "/research/weather-light": trail(RESEARCH, "날씨·빛", "Weather & light"),
  "/research/rijksmuseum": trail(RESEARCH, "릭스미술관", "Rijksmuseum"),
  "/research/vam": trail(RESEARCH, "V&A", "V&A"),
  "/research/catalog/notebook": trail2(RESEARCH, { ko: "작품 리서치 랩", en: "Catalog lab", href: "/research/catalog" }, "리서치 노트", "Research notebook"),
  "/research/open-data/nasa": trail2(RESEARCH, OPEN_DATA, "NASA", "NASA"),
  "/research/open-data/smithsonian": trail2(RESEARCH, OPEN_DATA, "스미스소니언", "Smithsonian"),
  "/research/open-data/wikimedia": trail2(RESEARCH, OPEN_DATA, "위키미디어", "Wikimedia"),
  "/research/open-data/europeana": trail2(RESEARCH, OPEN_DATA, "유로피아나", "Europeana"),
  "/research/open-data/korean": trail2(RESEARCH, OPEN_DATA, "국내 공개 데이터", "Korean open data"),
  "/research/open-data/internetarchive": trail2(RESEARCH, OPEN_DATA, "인터넷 아카이브", "Internet Archive"),
  "/research/open-data/ambientcg": trail2(RESEARCH, OPEN_DATA, "ambientCG", "ambientCG"),
  "/research/open-data/dpla": trail2(RESEARCH, OPEN_DATA, "DPLA", "DPLA"),
  "/research/open-data/gbif": trail2(RESEARCH, OPEN_DATA, "GBIF", "GBIF"),
  "/research/open-data/kheritage": trail2(RESEARCH, OPEN_DATA, "국가유산", "Korean heritage"),
  "/research/open-data/musicbrainz": trail2(RESEARCH, OPEN_DATA, "MusicBrainz", "MusicBrainz"),
  "/research/open-data/neis": trail2(RESEARCH, OPEN_DATA, "나이스 교육정보", "NEIS"),
  "/research/open-data/tourapi": trail2(RESEARCH, OPEN_DATA, "관광 정보", "TourAPI"),
  "/research/open-data/vam": trail2(RESEARCH, OPEN_DATA, "V&A", "V&A"),
  // 컷츠·뉴스레터·캐릭터 토크
  "/cuts/studio": trail(CUTS, "컷츠 클립 만들기", "Create a Cuts clip"),
  "/cuts/rewards": trail(CUTS, "리워드", "Rewards"),
  "/newsletter/compose": trail(NEWSLETTER, "뉴스레터 보내기", "Send a newsletter"),
  "/character-chat/manage": trail(CHARACTER_CHAT, "캐릭터 챗 관리", "Manage chats"),
  // 커뮤니티·협업
  "/community/timelapses": trail(COMMUNITY, "타임랩스", "Timelapses"),
  "/collaborate/gallery": trail(COLLABORATE, "작업 갤러리", "Gallery"),
  "/collaborate/new": trail(COLLABORATE, "새 의뢰", "New request"),
  "/collaborate/positions": trail(COLLABORATE, "포지션", "Positions"),
  "/collaborate/workspace": trail(COLLABORATE, "워크스페이스", "Workspace"),
  // 제작·연재
  "/production/pinned-review": trail(PRODUCTION, "고정 검수", "Pinned review"),
  "/production/workspaces/join": trail2(PRODUCTION, { ko: "워크스페이스", en: "Workspaces", href: "/production/workspaces" }, "워크스페이스 합류", "Join workspace"),
  "/studio/analytics": trail(STUDIO, "창작자 애널리틱스", "Creator analytics"),
  "/studio/templates": trail(STUDIO, "템플릿", "Templates"),
  "/create/challenges": trail(CREATE, "챌린지", "Challenges"),
  "/create/promo": trail(CREATE, "홍보", "Promo"),
  "/showcase/challenges": trail(SHOWCASE, "챌린지", "Challenges"),
  "/showcase/promo": trail(SHOWCASE, "홍보", "Promo"),
  "/showcase/reviews": trail(SHOWCASE, "리뷰", "Reviews"),
  // 창작자·생태계·발견
  "/creator/early-access": [HOME, { ko: "얼리 액세스", en: "Early access" }],
  "/creator/membership": [HOME, { ko: "창작자 멤버십", en: "Creator membership" }],
  "/creator/revenue": [HOME, { ko: "수익", en: "Revenue" }],
  "/ecosystem/collaboration": [HOME, { ko: "생태계", en: "Ecosystem", href: "/ecosystem" }, { ko: "협업", en: "Collaboration" }],
  "/ecosystem/fandom": [HOME, { ko: "생태계", en: "Ecosystem", href: "/ecosystem" }, { ko: "팬덤", en: "Fandom" }],
  "/ecosystem/library": [HOME, { ko: "생태계", en: "Ecosystem", href: "/ecosystem" }, { ko: "라이브러리", en: "Library" }],
  "/learn/education": [HOME, LEARN, { ko: "교육 허브", en: "Education" }],
  "/insights/resources": trail(INSIGHTS, "리소스 인사이트", "Resource insights"),
  "/discover/works": trail(DISCOVER, "작품 탐색", "Browse works"),
  "/events/beta-open": trail(EVENTS, "베타 오픈", "Beta open"),
  "/about/data": trail(ABOUT, "데이터 안내", "Data"),
  "/about/crawler": trail(ABOUT, "수집 안내", "Crawler"),
  "/team/organization": [HOME, { ko: "협업", en: "Team", href: "/team" }, { ko: "조직", en: "Organization" }],
};

/** 경로에 대한 브레드크럼 트레일을 돌려준다. 큐레이션에 없으면 빈 배열. */
export function resolveBreadcrumbTrail(pathname: string): AppBreadcrumbItem[] {
  const canonical = canonicalSitePath(pathname);
  return CURATED_TRAILS[canonical] ?? [];
}
