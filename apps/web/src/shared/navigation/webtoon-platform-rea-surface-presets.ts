import type { CompetitorPlatformId } from "./webtoon-platform-rea-ledger";

/**
 * 20개 경쟁 웹툰·창작·에셋 플랫폼 REA 역공학 결과에서 도출한
 * ToonStudio 6대 허브 서피스별 클린룸 프리셋 및 필터 계약.
 */

export type DiscoverSerializationTrackId =
  | "all"
  | "originals"
  | "canvas"
  | "wait-free"
  | "cuts-short";

export interface DiscoverSerializationTrack {
  readonly id: DiscoverSerializationTrackId;
  readonly label: string;
  readonly badge: string;
  readonly description: string;
  readonly primaryRoute: string;
  readonly secondaryRoute: string;
  readonly secondaryLabel: string;
  readonly derivedFrom: readonly CompetitorPlatformId[];
}

export const DISCOVER_SERIALIZATION_TRACKS: readonly DiscoverSerializationTrack[] = Object.freeze([
  {
    id: "all",
    label: "전체 통합 트랙",
    badge: "ALL TRACKS",
    description: "정식 요일연재, 오픈 캔버스·베스트도전, 기다무, 숏폼 컷츠를 한눈에 탐색합니다.",
    primaryRoute: "/explore",
    secondaryRoute: "/ranking",
    secondaryLabel: "실시간 랭킹",
    derivedFrom: ["naver-webtoon", "kakaopage", "webtoons-global", "mangaplus"],
  },
  {
    id: "originals",
    label: "정식 연재 (ORIGINALS)",
    badge: "ORIGINALS",
    description: "월~일 요일별 정기 연재작과 주간 화제작을 탐색합니다.",
    primaryRoute: "/calendar",
    secondaryRoute: "/ranking",
    secondaryLabel: "오리지널 랭킹",
    derivedFrom: ["naver-webtoon", "webtoons-global", "kakao-webtoon"],
  },
  {
    id: "canvas",
    label: "오픈 연재 (CANVAS · 베스트도전)",
    badge: "CANVAS",
    description: "창작자가 자유롭게 연재하고 독자 반응으로 정식 승격하는 오픈 리그입니다.",
    primaryRoute: "/community",
    secondaryRoute: "/create",
    secondaryLabel: "캔버스 연재 시작",
    derivedFrom: ["naver-best-challenge", "webtoons-canvas", "postype"],
  },
  {
    id: "wait-free",
    label: "기다무 · 무료 공개 (WUF)",
    badge: "WUF · FREE",
    description: "일정 시간마다 무료로 열리는 대작과 전회차 무료 공개 작품을 모아 봅니다.",
    primaryRoute: "/calendar",
    secondaryRoute: "/explore",
    secondaryLabel: "기다무 작품 탐색",
    derivedFrom: ["kakaopage", "kakao-webtoon", "mrblue-webtoon", "tapas"],
  },
  {
    id: "cuts-short",
    label: "숏폼 컷츠 · 무빙 예고편",
    badge: "SHORT-VOD",
    description: "1분 내외 컷츠 애니메이션과 무빙툰 예고편으로 취향 작품을 즉시 발견합니다.",
    primaryRoute: "/promo-library",
    secondaryRoute: "/cuts",
    secondaryLabel: "컷츠 피드 열기",
    derivedFrom: ["naver-webtoon", "kakaopage", "bomtoon"],
  },
]);

export type RankingStreamModeId = "hottest" | "trending" | "completed" | "canvas-rising";

export interface RankingStreamMode {
  readonly id: RankingStreamModeId;
  readonly label: string;
  readonly badge: string;
  readonly subtitle: string;
  readonly sortHint: "popular" | "latest" | "rating";
  readonly statusFilter?: "ONGOING" | "COMPLETED";
  readonly derivedFrom: readonly CompetitorPlatformId[];
}

export const RANKING_STREAM_MODES: readonly RankingStreamMode[] = Object.freeze([
  {
    id: "hottest",
    label: "실시간 인기 (Hottest)",
    badge: "HOTTEST",
    subtitle: "현재 조회수와 독자 열독률이 가장 높은 대표 인기작 스트림",
    sortHint: "popular",
    derivedFrom: ["mangaplus", "naver-webtoon", "kakaopage"],
  },
  {
    id: "trending",
    label: "급상승 신작 (Trending)",
    badge: "TRENDING",
    subtitle: "최근 업데이트 직후 관심도와 예고편 반응이 급증한 작품 스트림",
    sortHint: "latest",
    derivedFrom: ["mangaplus", "kakao-webtoon", "tapas"],
  },
  {
    id: "completed",
    label: "완결 명작 (Completed)",
    badge: "COMPLETED",
    subtitle: "결말까지 검증된 평점 상위 완결 정주행 명작 스트림",
    sortHint: "rating",
    statusFilter: "COMPLETED",
    derivedFrom: ["mangaplus", "lezhin-comics", "bomtoon"],
  },
  {
    id: "canvas-rising",
    label: "오픈연재 라이징 (CANVAS)",
    badge: "CANVAS UP",
    subtitle: "베스트도전·오픈 캔버스에서 정식 연재 승격이 유력한 주목작 스트림",
    sortHint: "rating",
    derivedFrom: ["naver-best-challenge", "webtoons-canvas", "postype"],
  },
]);

export type CalendarBmFilterId = "all" | "wait-free" | "free" | "new" | "completed";

export interface CalendarBmFilter {
  readonly id: CalendarBmFilterId;
  readonly label: string;
  readonly badge: string;
  readonly description: string;
  readonly derivedFrom: readonly CompetitorPlatformId[];
}

export const CALENDAR_BM_FILTERS: readonly CalendarBmFilter[] = Object.freeze([
  {
    id: "all",
    label: "전체 연재작",
    badge: "ALL",
    description: "선택한 요일의 모든 정기 연재 작품을 표시합니다.",
    derivedFrom: ["naver-webtoon", "kakao-webtoon"],
  },
  {
    id: "wait-free",
    label: "기다리면 무료 (WUF)",
    badge: "WUF",
    description: "대여권·기다무 주기가 적용된 주요 인기 연재작을 우선 표시합니다.",
    derivedFrom: ["kakaopage", "kakao-webtoon", "mrblue-webtoon"],
  },
  {
    id: "free",
    label: "무료 공개",
    badge: "FREE",
    description: "부담 없이 바로 정주행할 수 있는 무료 공개 회차 중심 작품입니다.",
    derivedFrom: ["tapas", "lezhin-comics", "naver-webtoon"],
  },
  {
    id: "new",
    label: "이번 달 신작",
    badge: "NEW · UP",
    description: "최근 런칭되었거나 신규 회차가 막 업로드된 기대작입니다.",
    derivedFrom: ["tapas", "bomtoon", "kakao-webtoon"],
  },
  {
    id: "completed",
    label: "완결 정주행",
    badge: "FIN",
    description: "마지막 회차까지 완결되어 끊김 없이 몰아볼 수 있는 작품입니다.",
    derivedFrom: ["mangaplus", "lezhin-comics", "mrblue-webtoon"],
  },
]);

export type ExploreDirectoryModeId =
  | "all"
  | "ongoing"
  | "completed"
  | "hiatus"
  | "alpha"
  | "updated";

export interface ExploreDirectoryMode {
  readonly id: ExploreDirectoryModeId;
  readonly label: string;
  readonly badge: string;
  readonly statusValue: "ALL" | "ONGOING" | "COMPLETED" | "HIATUS";
  readonly sortValue: "popular" | "latest" | "rating" | "title";
  readonly derivedFrom: readonly CompetitorPlatformId[];
}

export const EXPLORE_DIRECTORY_MODES: readonly ExploreDirectoryMode[] = Object.freeze([
  {
    id: "all",
    label: "전체 디렉터리",
    badge: "ALL",
    statusValue: "ALL",
    sortValue: "popular",
    derivedFrom: ["mangaplus", "naver-webtoon"],
  },
  {
    id: "ongoing",
    label: "연재중 (Ongoing)",
    badge: "ONGOING",
    statusValue: "ONGOING",
    sortValue: "popular",
    derivedFrom: ["mangaplus", "kakao-webtoon"],
  },
  {
    id: "completed",
    label: "완결 (Completed)",
    badge: "COMPLETED",
    statusValue: "COMPLETED",
    sortValue: "rating",
    derivedFrom: ["mangaplus", "lezhin-comics"],
  },
  {
    id: "hiatus",
    label: "시즌 휴재·재정비",
    badge: "SEASON",
    statusValue: "HIATUS",
    sortValue: "popular",
    derivedFrom: ["kakaopage", "manta"],
  },
  {
    id: "alpha",
    label: "가나다 · A-Z 순",
    badge: "A-Z",
    statusValue: "ALL",
    sortValue: "title",
    derivedFrom: ["mangaplus", "pixiv-comic"],
  },
  {
    id: "updated",
    label: "최신 업데이트순",
    badge: "UPDATED",
    statusValue: "ALL",
    sortValue: "latest",
    derivedFrom: ["mangaplus", "bomtoon"],
  },
]);

export interface ExplorePreferenceTagCombo {
  readonly id: string;
  readonly label: string;
  readonly genreValue: string;
  readonly queryKeyword: string;
  readonly tags: readonly string[];
  readonly derivedFrom: readonly CompetitorPlatformId[];
}

export const EXPLORE_PREFERENCE_TAG_COMBOS: readonly ExplorePreferenceTagCombo[] = Object.freeze([
  {
    id: "regression-fantasy",
    label: "회귀 · 헌터 · 액션판타지",
    genreValue: "판타지",
    queryKeyword: "",
    tags: ["#회귀/각성", "#던전/헌터", "#압도적작화"],
    derivedFrom: ["bomtoon", "naver-best-challenge", "kakaopage"],
  },
  {
    id: "contract-rofan",
    label: "계약결혼 · 황궁 로맨스판타지",
    genreValue: "로맨스",
    queryKeyword: "",
    tags: ["#계약관계", "#능력여주", "#서사맛집"],
    derivedFrom: ["bomtoon", "manta", "kakaopage"],
  },
  {
    id: "cyberpunk-sf",
    label: "사이버펑크 · 디스토피아 SF",
    genreValue: "SF",
    queryKeyword: "",
    tags: ["#네오서울", "#AI/메카", "#3D배경연출"],
    derivedFrom: ["bomtoon", "webtoons-global", "sketchfab-3d"],
  },
  {
    id: "mystery-thriller",
    label: "두뇌심리전 · 미스터리 스릴러",
    genreValue: "스릴러",
    queryKeyword: "",
    tags: ["#반전서사", "#추리/서스펜스", "#몰입감"],
    derivedFrom: ["bomtoon", "lezhin-comics", "mrblue-webtoon"],
  },
  {
    id: "slice-of-life-cuts",
    label: "공감 일상 · 숏폼 개그툰",
    genreValue: "일상",
    queryKeyword: "",
    tags: ["#가벼운호흡", "#컷츠연동", "#힐링"],
    derivedFrom: ["naver-webtoon", "postype", "pixiv-comic"],
  },
]);

export interface LibraryPillarCard {
  readonly id: "view" | "purchases" | "likes" | "collections";
  readonly tabKey: "diary" | "saved" | "rated" | "collections";
  readonly label: string;
  readonly badge: string;
  readonly description: string;
  readonly route: string;
  readonly derivedFrom: readonly CompetitorPlatformId[];
}

export const LIBRARY_PILLAR_CARDS: readonly LibraryPillarCard[] = Object.freeze([
  {
    id: "view",
    tabKey: "diary",
    label: "최근 감상 · 이어보기",
    badge: "RECENT VIEW",
    description: "마지막으로 읽던 회차와 스크롤 지점부터 끊김 없이 이어 봅니다.",
    route: "/library?tab=diary",
    derivedFrom: ["postype", "bomtoon", "naver-webtoon"],
  },
  {
    id: "purchases",
    tabKey: "saved",
    label: "찜 · 북마크 보관함",
    badge: "SAVED · ZZIM",
    description: "업데이트 알림을 받을 관심 작품과 소장 리스트를 관리합니다.",
    route: "/library?tab=saved",
    derivedFrom: ["postype", "mrblue-webtoon", "bomtoon"],
  },
  {
    id: "likes",
    tabKey: "rated",
    label: "좋아요 · 별점 평가",
    badge: "LIKES · RATED",
    description: "내가 남긴 별점과 한줄평을 기반으로 맞춤 취향 추천을 정교화합니다.",
    route: "/library?tab=rated",
    derivedFrom: ["postype", "lezhin-comics", "webtoons-canvas"],
  },
  {
    id: "collections",
    tabKey: "collections",
    label: "내 컬렉션 폴더",
    badge: "COLLECTIONS",
    description: "테마별 정주행 리스트와 레퍼런스 작품을 폴더 단위로 묶어 관리합니다.",
    route: "/library?tab=collections",
    derivedFrom: ["postype", "bomtoon", "pixiv-comic"],
  },
]);

export type MarketEcosystemPresetId =
  | "all"
  | "brush-2d"
  | "bg-3d"
  | "char-pose-3d"
  | "tone-sfx"
  | "free-point";

export interface MarketEcosystemPreset {
  readonly id: MarketEcosystemPresetId;
  readonly label: string;
  readonly badge: string;
  readonly categoryCode: "ALL" | "BRUSH" | "3D_BG" | "3D_POS" | "TONE";
  readonly description: string;
  readonly studioMountRoute: string;
  readonly studioMountLabel: string;
  readonly derivedFrom: readonly CompetitorPlatformId[];
}

export const MARKET_ECOSYSTEM_PRESETS: readonly MarketEcosystemPreset[] = Object.freeze([
  {
    id: "all",
    label: "전체 창작 소재",
    badge: "ALL ASSETS",
    categoryCode: "ALL",
    description: "2D 브러시·스크린톤부터 3D 웹툰 배경·캐릭터 포즈까지 전 카테고리를 탐색합니다.",
    studioMountRoute: "/studio/assets",
    studioMountLabel: "스튜디오 보관함 열기",
    derivedFrom: ["clip-studio", "pixiv-booth", "sketchfab-3d", "acon3d"],
  },
  {
    id: "brush-2d",
    label: "2D 펜 · 브러시 · 선화",
    badge: "2D BRUSH",
    categoryCode: "BRUSH",
    description: "펜선, 수채, 이펙트 브러시를 스튜디오 브러시 엔진에 즉시 장착합니다.",
    studioMountRoute: "/studio/brushes",
    studioMountLabel: "브러시 관리자로 장착",
    derivedFrom: ["clip-studio", "pixiv-booth"],
  },
  {
    id: "bg-3d",
    label: "3D 웹툰 배경 · 스테이지",
    badge: "3D STAGE",
    categoryCode: "3D_BG",
    description: "실내·도시·판타지 3D 배경을 카메라 앵글·조명과 함께 원고에 배치합니다.",
    studioMountRoute: "/research/scene-3d",
    studioMountLabel: "3D 씬 랩에서 열기",
    derivedFrom: ["sketchfab-3d", "acon3d", "clip-studio"],
  },
  {
    id: "char-pose-3d",
    label: "3D 캐릭터 · 데생 인형 · 포즈",
    badge: "3D POSE",
    categoryCode: "3D_POS",
    description: "까다로운 하이앵글·로우앵글 인체 비례와 손 포즈를 3D 랩에서 즉시 잡습니다.",
    studioMountRoute: "/research/character-3d",
    studioMountLabel: "3D 캐릭터 랩에서 열기",
    derivedFrom: ["clip-studio", "pixiv-booth", "sketchfab-3d"],
  },
  {
    id: "tone-sfx",
    label: "스크린톤 · 식자 · 효과음",
    badge: "TONE · SFX",
    categoryCode: "TONE",
    description: "출판만화·웹툰 겸용 스크린톤, 말풍선, 효과음 타이포 소재를 장착합니다.",
    studioMountRoute: "/studio/comic",
    studioMountLabel: "웹툰 원고실로 장착",
    derivedFrom: ["clip-studio", "manta", "pixiv-booth"],
  },
  {
    id: "free-point",
    label: "신규 · 인기 추천 에셋",
    badge: "CURATED",
    categoryCode: "ALL",
    description: "이번 주 창작자들이 가장 많이 다운로드한 검증된 작업 시간 단축 소재입니다.",
    studioMountRoute: "/market/library",
    studioMountLabel: "내 구매 에셋 확인",
    derivedFrom: ["clip-studio", "pixiv-booth", "acon3d"],
  },
]);

export interface CommunityPromotionLeagueTier {
  readonly id: "challenge" | "best-challenge" | "originals" | "creator-101";
  readonly stepNumber: number;
  readonly label: string;
  readonly badge: string;
  readonly description: string;
  readonly route: string;
  readonly ctaLabel: string;
  readonly derivedFrom: readonly CompetitorPlatformId[];
}

export const COMMUNITY_PROMOTION_LEAGUE_TIERS: readonly CommunityPromotionLeagueTier[] = Object.freeze([
  {
    id: "challenge",
    stepNumber: 1,
    label: "도전만화 · 오픈 캔버스",
    badge: "TIER 1 · CHALLENGE",
    description: "누구나 첫 1화와 세계관을 등록하고 독자 피드백을 받는 오픈 연재 트랙",
    route: "/create",
    ctaLabel: "오픈 연재 시작",
    derivedFrom: ["naver-best-challenge", "webtoons-canvas", "postype"],
  },
  {
    id: "best-challenge",
    stepNumber: 2,
    label: "베스트도전 · 쇼케이스 승격",
    badge: "TIER 2 · BEST",
    description: "열독률·별점·예고편 반응 상위 작품이 모이는 정식 승격 후보 쇼케이스",
    route: "/community/promote",
    ctaLabel: "작품 홍보관 등록",
    derivedFrom: ["naver-best-challenge", "webtoons-canvas", "bomtoon"],
  },
  {
    id: "originals",
    stepNumber: 3,
    label: "정식 요일연재 · ORIGINALS",
    badge: "TIER 3 · ORIGINALS",
    description: "요일별 정기 연재와 실시간 랭킹·기다무 편성으로 독자층을 확장하는 단계",
    route: "/calendar",
    ctaLabel: "요일연재 편성표",
    derivedFrom: ["naver-webtoon", "kakaopage", "mangaplus"],
  },
  {
    id: "creator-101",
    stepNumber: 4,
    label: "수익화 · 2차 IP 사업화",
    badge: "TIER 4 · IP BIZ",
    description: "후원·유료분 정산과 영상화·출판·게임 IP 확장을 연결하는 프로 작가 단계",
    route: "/studio/revenue",
    ctaLabel: "수익·정산 센터",
    derivedFrom: ["naver-best-challenge", "postype", "bomtoon"],
  },
]);

/**
 * 8. 아카데미 · 학습 로드맵 허브 (`/learn`) 전용 REA 스킬트리 프리셋
 *    - Coloso (`/illust_webtoon`, `/3d_vfx`, `/myclassroom`, `/catalog`)
 *    - Munpia (`academy.munpia.com`, `larc.munpia.com`)
 *    - Clip Studio (4단계 공식 강좌 및 튜토리얼)
 */
export interface LearnCurriculumTrack {
  readonly id: string;
  readonly label: string;
  readonly badge: string;
  readonly description: string;
  readonly practiceHref: string;
  readonly practiceLabel: string;
  readonly derivedFrom: readonly CompetitorPlatformId[];
}

export const LEARN_CURRICULUM_ROADMAP_TRACKS: readonly LearnCurriculumTrack[] = Object.freeze([
  {
    id: "story-novelcomics",
    label: "스토리텔링 · 노블코믹스 각색",
    badge: "MUNPIA · LARC",
    description: "웹소설 원작 기승전결 설계부터 화별 스크립트·콘티 컷 배분까지 실습하는 입문·심화 트랙",
    practiceHref: "/story-lab",
    practiceLabel: "스토리 랩 실습",
    derivedFrom: ["munpia-novel", "kakaopage"],
  },
  {
    id: "drawing-coloring",
    label: "드로잉 · 선화 · 채색 마스터",
    badge: "COLOSO · CSP",
    description: "인체 데생, 펜선 필압, 셀 채색 및 웹툰 조명 후보정 워크플로를 단계별로 마스터하는 트랙",
    practiceHref: "/studio/comic",
    practiceLabel: "원고 에디터 실습",
    derivedFrom: ["coloso-academy", "clip-studio"],
  },
  {
    id: "3d-character-scene",
    label: "3D 캐릭터 · 배경 연출",
    badge: "3D · VROID · ACON",
    description: "VRoid 캐릭터 커스터마이징과 3D 배경 투시·카메라 앵글·툰 셰이더 합성을 익히는 실전 트랙",
    practiceHref: "/studio/assets/characters/new",
    practiceLabel: "3D 캐릭터 셰이퍼",
    derivedFrom: ["coloso-academy", "vroid-studio", "acon3d", "sketchfab-3d"],
  },
  {
    id: "debut-monetization",
    label: "연재 데뷔 · 숏폼 홍보 · 정산",
    badge: "CANVAS · CUTS",
    description: "도전만화 승격 전략, 9:16 컷츠 트레일러 제작, 유료분·후원 수익화까지 완주하는 프로 트랙",
    practiceHref: "/showcase/promo",
    practiceLabel: "예고편 스튜디오",
    derivedFrom: ["naver-best-challenge", "webtoons-canvas", "postype"],
  },
]);

/**
 * 9. 스토리 랩 · 창작 시작점 (`/story-lab`, `/create`) 전용 노블코믹스 & 제작 파이프라인 프리셋
 *    - Munpia (`/page/novelous/group/pl.serial`, `larc.munpia.com`)
 *    - Manta (`/creator/studio/*`)
 *    - Clip Studio (4단계 제작 파이프라인)
 */
export interface StoryToWebtoonPipelineMode {
  readonly id: string;
  readonly step: string;
  readonly label: string;
  readonly description: string;
  readonly targetHref: string;
  readonly ctaLabel: string;
  readonly derivedFrom: readonly CompetitorPlatformId[];
}

export const STORY_TO_WEBTOON_PIPELINE_MODES: readonly StoryToWebtoonPipelineMode[] = Object.freeze([
  {
    id: "worldbuilding-synopsis",
    step: "STEP 01 · WORLD",
    label: "세계관 · 로그라인 · 회귀/빙의/환생 플롯",
    description: "문피아·카카오페이지 검증 흥행 코드와 캐릭터 아크를 구조화하고 시놉시스를 설계합니다.",
    targetHref: "/story-lab",
    ctaLabel: "플롯 보드 열기",
    derivedFrom: ["munpia-novel", "kakaopage"],
  },
  {
    id: "novel-to-script",
    step: "STEP 02 · SCRIPT",
    label: "웹소설 → 웹툰 대본·연출 지문 변환",
    description: "서술형 문장을 화별 60~80컷 스크립트, 말풍선 대사, 카메라 앵글 지문으로 자동 분해합니다.",
    targetHref: "/studio/new",
    ctaLabel: "신작 대본 생성",
    derivedFrom: ["munpia-novel", "manta"],
  },
  {
    id: "storyboard-3d-blocking",
    step: "STEP 03 · CONTI",
    label: "세로 스크롤 콘티 · 3D 캐릭터/배경 블로킹",
    description: "대본 컷마다 3D 캐릭터 포즈와 배경 앵글을 배치해 호흡과 시선 유도를 검증합니다.",
    targetHref: "/studio/comic",
    ctaLabel: "콘티 에디터 직행",
    derivedFrom: ["clip-studio", "vroid-studio", "acon3d"],
  },
  {
    id: "ink-render-publish",
    step: "STEP 04 · LAUNCH",
    label: "펜선·채색 마감 · 컷츠 예고편 동시 발행",
    description: "원고 최종 검수 후 본편 연재와 9:16 숏폼 예고편을 원클릭으로 동시 배포합니다.",
    targetHref: "/studio/publish",
    ctaLabel: "연재·배포 센터",
    derivedFrom: ["naver-webtoon", "webtoons-canvas", "pixiv-comic"],
  },
]);

/**
 * 10. 쇼케이스 · 외주/협업 보드 (`/showcase`, `/collaborate`) 전용 크리에이터 매칭 프리셋
 *    - Notefolio (`/discover`, `/jobs`, `/workshops`, `/creators`)
 *    - LOUD (`/contest/list`, `/market`, `/portfolios`, `/creatives`)
 *    - Pixiv Booth / VRoid Hub 크리에이터 커미션·협업 구조
 */
export interface ShowcaseCollaborationTrack {
  readonly id: string;
  readonly label: string;
  readonly badge: string;
  readonly description: string;
  readonly route: string;
  readonly ctaLabel: string;
  readonly derivedFrom: readonly CompetitorPlatformId[];
}

export const SHOWCASE_COLLABORATION_TRACKS: readonly ShowcaseCollaborationTrack[] = Object.freeze([
  {
    id: "portfolio-curation",
    label: "크리에이터 아트워크 · 캐릭터 쇼케이스",
    badge: "NOTEFOLIO · PIXIV",
    description: "일러스트·선화·3D 캐릭터·배경 아트워크를 작업 공정별로 공개하고 피드백을 받는 갤러리",
    route: "/showcase",
    ctaLabel: "갤러리 탐색",
    derivedFrom: ["notefolio-creative", "pixiv-comic", "vroid-hub"],
  },
  {
    id: "team-recruiting",
    label: "스토리 · 작화 · 채색 · 3D 어시 구인/매칭",
    badge: "JOBS · TEAM",
    description: "분업화 웹툰 스튜디오를 위한 글작가·선화·채색·식자·3D 배경 전문가 1:1 매칭 보드",
    route: "/collaborate",
    ctaLabel: "구인·의뢰 매칭",
    derivedFrom: ["notefolio-creative", "loud-sourcing"],
  },
  {
    id: "contest-pitch",
    label: "신작 공모전 · 노블코믹스 각색 피칭",
    badge: "LOUD · CONTEST",
    description: "원작 IP 웹툰화 피칭 및 시즌별 창작 콘테스트에 참가해 연재 계약과 상금을 확보하는 트랙",
    route: "/opportunities",
    ctaLabel: "공모·기회 보기",
    derivedFrom: ["loud-sourcing", "naver-best-challenge", "munpia-novel"],
  },
]);
