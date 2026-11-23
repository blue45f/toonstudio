/**
 * 12대 핵심 페이지 비주얼 아이덴티티 정본 카탈로그.
 *
 * 각 페이지는 1초 만에 역할을 파악할 수 있도록
 * 아이소메트릭 디오라마 엠블럼 WebP, 3단계 초간단 도식 칩,
 * 1클릭 CTA, OKLCH 무드 변수 매핑을 단일 출처로 소유한다.
 */

export const VIBRANT_PAGE_IDENTITY_IDS = [
  "discover",
  "studio",
  "character",
  "bg3d-stage",
  "market",
  "community",
  "production",
  "library",
  "pricing",
  "guide-map",
  "benchmark",
  "tech-lab",
] as const;

export type VibrantPageIdentityId = (typeof VIBRANT_PAGE_IDENTITY_IDS)[number];

export interface VibrantBilingualCopy {
  readonly ko: string;
  readonly en: string;
}

export interface VibrantPageFlowStep {
  readonly stepNumber: 1 | 2 | 3;
  readonly label: VibrantBilingualCopy;
  readonly detail: VibrantBilingualCopy;
  readonly href: string;
}

export interface VibrantPageCta {
  readonly label: VibrantBilingualCopy;
  readonly href: string;
}

export interface VibrantPageMoodSpec {
  readonly key: VibrantPageIdentityId;
  readonly accentVar: string;
  readonly surfaceVar: string;
  readonly borderVar: string;
  readonly oklchHue: number;
  readonly oklchSecondaryHue: number;
  readonly label: VibrantBilingualCopy;
}

export interface VibrantPageIdentitySpec {
  readonly id: VibrantPageIdentityId;
  readonly emblemSrc: string;
  readonly emblemAlt: VibrantBilingualCopy;
  readonly roleBadge: VibrantBilingualCopy;
  readonly headline: VibrantBilingualCopy;
  readonly summary: VibrantBilingualCopy;
  readonly steps: readonly [VibrantPageFlowStep, VibrantPageFlowStep, VibrantPageFlowStep];
  readonly primaryCta: VibrantPageCta;
  readonly mood: VibrantPageMoodSpec;
}

export interface VibrantQuickHubLink {
  readonly id: "studio" | "compare-studio" | "tech";
  readonly href: "/studio" | "/compare/studio" | "/tech";
  readonly label: VibrantBilingualCopy;
  readonly shortLabel: VibrantBilingualCopy;
}

const bi = (ko: string, en: string): VibrantBilingualCopy => ({ ko, en });

const flowStep = (
  stepNumber: 1 | 2 | 3,
  koLabel: string,
  enLabel: string,
  koDetail: string,
  enDetail: string,
  href: string,
): VibrantPageFlowStep => ({
  stepNumber,
  label: bi(koLabel, enLabel),
  detail: bi(koDetail, enDetail),
  href,
});

function moodSpec(
  key: VibrantPageIdentityId,
  oklchHue: number,
  oklchSecondaryHue: number,
  koLabel: string,
  enLabel: string,
): VibrantPageMoodSpec {
  return {
    key,
    accentVar: `--vp-mood-${key}-accent`,
    surfaceVar: `--vp-mood-${key}-surface`,
    borderVar: `--vp-mood-${key}-border`,
    oklchHue,
    oklchSecondaryHue,
    label: bi(koLabel, enLabel),
  };
}

/** 전 페이지 배너에서 원클릭으로 건너갈 수 있는 3대 핵심 허브 빠른 링크. */
export const VIBRANT_GLOBAL_QUICK_LINKS: readonly VibrantQuickHubLink[] = [
  { id: "studio", href: "/studio", label: bi("스튜디오 홈", "Studio Home"), shortLabel: bi("스튜디오", "Studio") },
  { id: "compare-studio", href: "/compare/studio", label: bi("도구 비교", "Tool Benchmark"), shortLabel: bi("비교", "Compare") },
  { id: "tech", href: "/tech", label: bi("기술 쇼케이스", "Tech Lab"), shortLabel: bi("테크", "Tech") },
] as const;

export const VIBRANT_PAGE_IDENTITY_CATALOG: Readonly<
  Record<VibrantPageIdentityId, VibrantPageIdentitySpec>
> = {
  discover: {
    id: "discover",
    emblemSrc: "/assets/studio/vibrant-sprites/emblem-discover.webp",
    emblemAlt: bi("펼쳐진 웹툰 페이지와 별빛이 어우러진 탐색 엠블럼", "Isometric emblem of open comic pages with golden stars"),
    roleBadge: bi("작품 탐색 허브", "Story Discovery Hub"),
    headline: bi("취향에 맞는 다음 작품을 바로 찾으세요", "Find your next favorite story in seconds"),
    summary: bi("검색·장르 필터·실시간 랭킹과 공식 연재처까지 한 화면에서 좁혀 봅니다.", "Narrow down genres, live rankings, and official reading links in one view."),
    steps: [
      flowStep(1, "조건 고르기", "Pick filters", "장르·연재 상태·평점", "Genre, status & rating", "/explore"),
      flowStep(2, "인기·요일 비교", "Check rankings", "실시간 순위·요일 신작", "Live charts & schedule", "/ranking"),
      flowStep(3, "서재에 저장", "Save to library", "관심작 기록·이어보기", "Track & resume reads", "/library"),
    ],
    primaryCta: { label: bi("장르·조건 탐색 열기", "Open Filter Explore"), href: "/explore" },
    mood: moodSpec("discover", 236, 56, "스타라이트 블루", "Starlight Blue"),
  },

  studio: {
    id: "studio",
    emblemSrc: "/assets/studio/vibrant-sprites/emblem-studio.webp",
    emblemAlt: bi("웹툰 원고와 팔레트·브러시가 놓인 작화 책상 엠블럼", "Isometric drawing desk emblem with webtoon pages and palette"),
    roleBadge: bi("창작 스튜디오 홈", "Creator Studio Home"),
    headline: bi("원고 기획부터 작화·출고까지 한 자리에서 이어 가세요", "Sketch, ink, and export your manuscript from one desk"),
    summary: bi("로컬 자동 저장과 2D·3D 작업실을 오가며 바로 그리기를 시작합니다.", "Jump straight into drawing with local auto-save and 2D/3D rooms."),
    steps: [
      flowStep(1, "포맷 선택", "Pick canvas", "세로 웹툰·4컷·콘티", "Scroll, 4-panel, rough", "/studio/new"),
      flowStep(2, "선화·채색", "Ink & color", "펜·말풍선·레이어 작화", "Pens, balloons & layers", "/studio/comic"),
      flowStep(3, "검수·출고", "Review & export", "세로 분할·PSD 패키지", "Vertical slice & PSD", "/studio/publish"),
    ],
    primaryCta: { label: bi("새 원고 바로 열기", "Start New Manuscript"), href: "/studio/new" },
    mood: moodSpec("studio", 42, 268, "아틀리에 앰버", "Atelier Amber"),
  },

  character: {
    id: "character",
    emblemSrc: "/assets/studio/vibrant-sprites/emblem-character.webp",
    emblemAlt: bi("캐릭터 흉상과 표정·의상 시트가 놓인 3D 캐릭터 엠블럼", "Isometric character bust emblem with expressions and outfits"),
    roleBadge: bi("캐릭터 셰이퍼", "Character Shaper"),
    headline: bi("주인공 비율·표정·의상을 3D 시트로 고정하세요", "Lock hero proportions, faces, and outfits in 3D"),
    summary: bi("회차가 거듭돼도 흔들리지 않는 캐릭터 레퍼런스와 포즈를 만듭니다.", "Keep character anatomy and poses consistent across every episode."),
    steps: [
      flowStep(1, "체형·얼굴 조율", "Shape figure", "등신대·헤어·표정 프리셋", "Ratio, hair & expressions", "/studio/assets/characters/new"),
      flowStep(2, "포즈 잡기", "Set pose", "관절 핀·시선·손동작", "Joints, gaze & hands", "/studio/poser"),
      flowStep(3, "컷에 배치", "Send to panel", "선화 가이드로 바로 투영", "Project line guide to cut", "/studio/comic"),
    ],
    primaryCta: { label: bi("캐릭터 셰이퍼 열기", "Open Character Shaper"), href: "/studio/assets/characters/new" },
    mood: moodSpec("character", 24, 336, "코랄 로즈", "Coral Rose"),
  },

  "bg3d-stage": {
    id: "bg3d-stage",
    emblemSrc: "/assets/studio/vibrant-sprites/emblem-bg3d-stage.webp",
    emblemAlt: bi("벚꽃 거리 카페 미니어처 3D 배경 엠블럼", "Isometric miniature cafe street 3D background stage emblem"),
    roleBadge: bi("3D 배경 스테이지", "3D Background Stage"),
    headline: bi("3D 공간을 배치하고 카메라 컷 선화를 바로 추출하세요", "Stage 3D rooms and extract crisp panel line art"),
    summary: bi("소품 배치·조명·카메라 화각을 저장해 매 회차 같은 장소를 재사용합니다.", "Save props, lighting, and camera lenses to reuse recurring sets."),
    steps: [
      flowStep(1, "공간 조립", "Build set", "건물·소품·가림 벽 정리", "Props & wall visibility", "/studio/bg3d"),
      flowStep(2, "카메라 구도", "Frame shot", "화각·소실점·시간대 조명", "Lens, horizon & daylight", "/studio/3d/dcc/shot"),
      flowStep(3, "선화 굽기", "Bake line art", "2D 원고 레이어로 전송", "Send directly to 2D cut", "/studio/comic"),
    ],
    primaryCta: { label: bi("3D 배경 스테이지 열기", "Open 3D Stage"), href: "/studio/bg3d" },
    mood: moodSpec("bg3d-stage", 352, 224, "블로섬 스카이", "Blossom Sky"),
  },

  market: {
    id: "market",
    emblemSrc: "/assets/studio/vibrant-sprites/emblem-market.webp",
    emblemAlt: bi("브러시·스크린톤·인증 배지가 담긴 나무 소재 정리함 엠블럼", "Isometric wooden material chest with brushes, tones, and license badges"),
    roleBadge: bi("창작 소재 마켓", "Creator Asset Market"),
    headline: bi("상업용 검증 브러시·3D 배경을 원고에 바로 꽂으세요", "Plug verified brushes and 3D sets straight into your pages"),
    summary: bi("라이선스 조건과 원고 호환성(Fit Lab)을 설치 전에 한눈에 확인합니다.", "Inspect commercial licenses and manuscript fit before downloading."),
    steps: [
      flowStep(1, "조건 필터", "Filter assets", "상업용·CC0·No-AI 검증", "Commercial, CC0, No-AI", "/market/browse"),
      flowStep(2, "원고 위 시험", "Test in Fit Lab", "화풍·선 굵기 미리 확인", "Check line weight & fit", "/market/fit"),
      flowStep(3, "보관함 장착", "Equip in Studio", "내 스튜디오 즉시 동기화", "Sync to your studio", "/studio/assets"),
    ],
    primaryCta: { label: bi("전체 소재 카탈로그", "Browse All Assets"), href: "/market/browse" },
    mood: moodSpec("market", 58, 168, "아틀리에 골드", "Atelier Gold"),
  },

  community: {
    id: "community",
    emblemSrc: "/assets/studio/vibrant-sprites/emblem-community.webp",
    emblemAlt: bi("만화 두루마리와 하트 말풍선·왕관이 떠 있는 커뮤니티 엠블럼", "Isometric comic scroll surrounded by heart speech bubbles and crowns"),
    roleBadge: bi("독자 · 작가 커뮤니티", "Readers & Creators Plaza"),
    headline: bi("작품 감상·연재 응원·신작 홍보를 한 광장에서 나누세요", "Share story discussions, creator notes, and new releases"),
    summary: bi("작품별 대화방, 펜카페, 오픈 연재 승격 리그까지 바로 참여합니다.", "Join title threads, fan cafes, and open serialization showcases."),
    steps: [
      flowStep(1, "대화방 참여", "Join threads", "작품·작가·펜카페 피드", "Title, author & fan cafes", "/community/cafes"),
      flowStep(2, "신작·예고 홍보", "Promote work", "첫 1화·타임랩스 공유", "Share Ep. 1 & timelapses", "/community/promote/new"),
      flowStep(3, "협업·팀 연결", "Find teammates", "어시스턴트·구인 의뢰", "Recruiting & commissions", "/collaborate"),
    ],
    primaryCta: { label: bi("내 작품 홍보 등록", "Promote Your Story"), href: "/community/promote/new" },
    mood: moodSpec("community", 164, 18, "에메랄드 코랄", "Emerald Coral"),
  },

  production: {
    id: "production",
    emblemSrc: "/assets/studio/vibrant-sprites/emblem-production.webp",
    emblemAlt: bi("공정 핀 보드와 달력·시계·진척 그래프가 놓인 제작 허브 엠블럼", "Isometric production pinboard with calendar, clock, and progress bars"),
    roleBadge: bi("웹툰 제작 프로덕션", "Webtoon Production Hub"),
    headline: bi("회차 일정·원고 핀 피드백·최종 승인을 한 흐름으로 묶으세요", "Run schedules, pinned feedback, and approvals in one flow"),
    summary: bi("담당자별 작업함과 지연 위험 회차를 실시간으로 점검하고 출고합니다.", "Track team assignees, at-risk deadlines, and episode sign-offs."),
    steps: [
      flowStep(1, "공정 배정", "Assign tasks", "콘티·선화·채색 마감 관리", "Owners & due dates", "/production/projects/sample-project/production"),
      flowStep(2, "핀 검수", "Pin feedback", "컷 위 좌표 댓글·버전 비교", "Pinned notes & diff view", "/production/projects/sample-project/episodes/episode-12"),
      flowStep(3, "승인 출고", "Approve release", "역할별 확인 후 게시 준비", "Role sign-off to publish", "/production/projects/sample-project/review"),
    ],
    primaryCta: { label: bi("샘플 공정 보드 열기", "Open Sample Board"), href: "/production/projects/sample-project/overview" },
    mood: moodSpec("production", 148, 76, "보태니컬 민트", "Botanical Mint"),
  },

  library: {
    id: "library",
    emblemSrc: "/assets/studio/vibrant-sprites/emblem-library.webp",
    emblemAlt: bi("단행본과 화분·별 책갈피가 꽂힌 원목 서재 엠블럼", "Isometric wooden bookshelf emblem with comics, plants, and star bookmarks"),
    roleBadge: bi("개인 서재 · 취향 기록", "Personal Library & Taste"),
    headline: bi("찜한 작품과 별점 기록으로 나만의 취향 지도를 채우세요", "Organize saved series and ratings into your taste map"),
    summary: bi("관심작·감상 일기·컬렉션을 모으면 다음 정주행 추천이 정교해집니다.", "Every bookmark, diary note, and rating sharpens your recommendations."),
    steps: [
      flowStep(1, "작품 담기", "Collect series", "보고 싶은·보는 중 분류", "Reading & saved shelves", "/library"),
      flowStep(2, "취향 분석", "Check taste", "선호 장르·별점 분포 확인", "Genre & rating spectrum", "/library?tab=taste"),
      flowStep(3, "맞춤 추천", "Get picks", "기록 기반 다음 작품 연결", "Tailored next reads", "/recommend"),
    ],
    primaryCta: { label: bi("취향 분석 보기", "View Taste Spectrum"), href: "/library?tab=taste" },
    mood: moodSpec("library", 38, 12, "웜 우드 코랄", "Warm Wood Coral"),
  },

  pricing: {
    id: "pricing",
    emblemSrc: "/assets/studio/vibrant-sprites/emblem-pricing.webp",
    emblemAlt: bi("황금 왕관과 브러시·보석 리본이 놓인 요금제 엠블럼", "Isometric royal cushion emblem with golden brush crown and gem ribbons"),
    roleBadge: bi("요금제 · 멤버십 정책", "Plans & Membership"),
    headline: bi("핵심 창작은 무료, 작업 규모에 맞는 한도를 투명하게 비교하세요", "Create free first, and compare transparent capacity tiers"),
    summary: bi("베타 기간 결제 없이 저장공간·AI 토큰·팀 협업 한도를 바로 확인합니다.", "Compare storage, AI tokens, and team seats with zero beta billing."),
    steps: [
      flowStep(1, "작업 형태 선택", "Pick workstyle", "개인 입문·연재·프로·팀", "Solo, serial, pro or team", "/pricing"),
      flowStep(2, "한도 비교", "Compare limits", "저장공간·협업·마켓 권한", "Storage, seats & market", "/membership"),
      flowStep(3, "무료 시작", "Start free", "카드 등록 없이 바로 작화", "Open studio without card", "/studio/new"),
    ],
    primaryCta: { label: bi("멤버십 정책 확인", "Read Membership Policy"), href: "/membership" },
    mood: moodSpec("pricing", 252, 74, "로열 사파이어 골드", "Royal Sapphire Gold"),
  },

  "guide-map": {
    id: "guide-map",
    emblemSrc: "/assets/studio/vibrant-sprites/emblem-guide-map.webp",
    emblemAlt: bi("이정표와 황금 나침반이 그려진 전체 메뉴 지도 엠블럼", "Isometric village map emblem with colorful signposts and brass compass"),
    roleBadge: bi("전체 메뉴 · 기능 지도", "Full Menu & Route Map"),
    headline: bi("초성·동의어 검색으로 원하는 도구와 페이지를 한 번에 여세요", "Jump to any studio tool or page with instant search"),
    summary: bi("작화·3D·협업·마켓·계정까지 숨김 없이 한 화면에 정리했습니다.", "Every studio, 3D, collaboration, market, and account destination in one map."),
    steps: [
      flowStep(1, "초성·키워드 입력", "Type keyword", "예: ㅁㅍㅅ, 3D, PSD", "e.g. brush, 3D, PSD", "/sitemap"),
      flowStep(2, "영역 좁히기", "Filter domain", "만들기·탐색·협업·성장", "Create, discover, grow", "/sitemap/all"),
      flowStep(3, "즉시 실행", "Launch direct", "0클릭 목록에서 바로 이동", "Open route in one click", "/studio"),
    ],
    primaryCta: { label: bi("전체 디렉터리 보기", "Browse Full Directory"), href: "/sitemap/all" },
    mood: moodSpec("guide-map", 142, 46, "컴퍼스 세이지", "Compass Sage"),
  },

  benchmark: {
    id: "benchmark",
    emblemSrc: "/assets/studio/vibrant-sprites/emblem-benchmark.webp",
    emblemAlt: bi("황금 천칭과 1·2·3위 시상대·브러시가 놓인 비교 벤치마크 엠블럼", "Isometric podium and golden balance scale emblem with stars and brushes"),
    roleBadge: bi("도구 비교 벤치마크", "Studio Tool Benchmark"),
    headline: bi("주요 웹툰·드로잉 도구 7종의 기능과 구조를 투명하게 비교하세요", "Compare 7 drawing and webtoon tools on transparent specs"),
    summary: bi("브라우저 실행·3D 통합·협업·가격 구조를 공개 스펙 기준으로 대조합니다.", "Contrast browser speed, 3D workflow, collaboration, and pricing honestly."),
    steps: [
      flowStep(1, "페르소나 선택", "Pick persona", "입문·개인 연재·팀·모바일", "Solo, serial, team, mobile", "/compare/studio"),
      flowStep(2, "7대 축 대조", "Compare 7 axes", "작화·3D·협업·브라우저 지원", "Draw, 3D, collab & web", "/compare/studio"),
      flowStep(3, "직접 체험", "Test live", "내 기기에서 바로 캔버스 열기", "Try live on your device", "/studio/new"),
    ],
    primaryCta: { label: bi("경쟁 도구 비교 보기", "Open Tool Benchmark"), href: "/compare/studio" },
    mood: moodSpec("benchmark", 34, 274, "트로피 앰버", "Trophy Amber"),
  },

  "tech-lab": {
    id: "tech-lab",
    emblemSrc: "/assets/studio/vibrant-sprites/emblem-tech-lab.webp",
    emblemAlt: bi("유리 온실 실험실 안에 기어·설계도·꿀벌이 담긴 기술 연구소 엠블럼", "Isometric glass greenhouse lab emblem with gears, blueprints, and worker bees"),
    roleBadge: bi("차세대 웹 기술 랩", "Next-Gen Web Tech Lab"),
    headline: bi("WebGPU·SQLite OPFS·Remotion·스웜 아키텍처를 직접 점검하세요", "Inspect WebGPU, SQLite OPFS, Remotion, and AI architecture live"),
    summary: bi("브라우저가 지원하는 차세대 API와 제작 파이프라인 구현을 투명하게 공개합니다.", "Explore live browser API probes and production engineering recipes."),
    steps: [
      flowStep(1, "아키텍처 지도", "Architecture map", "로컬 우선·WebGPU·CRDT", "Local-first, WebGPU, CRDT", "/tech"),
      flowStep(2, "Remotion·스킬", "Remotion & skills", "애니매틱 코드·하네스 구조", "Animatic recipes & harness", "/tech"),
      flowStep(3, "브라우저 프로브", "Live API probe", "현재 기기 지원 API 실측", "Detect browser support", "/tech"),
    ],
    primaryCta: { label: bi("기술 쇼케이스 열기", "Open Tech Showcase"), href: "/tech" },
    mood: moodSpec("tech-lab", 204, 84, "프리즘 시안", "Prism Cyan"),
  },
};

export function getVibrantPageIdentity(id: VibrantPageIdentityId): VibrantPageIdentitySpec {
  return VIBRANT_PAGE_IDENTITY_CATALOG[id];
}

export function listVibrantPageIdentities(): readonly VibrantPageIdentitySpec[] {
  return VIBRANT_PAGE_IDENTITY_IDS.map((id) => VIBRANT_PAGE_IDENTITY_CATALOG[id]);
}
