import {
  Boxes,
  Brush,
  CircleHelp,
  Compass,
  GraduationCap,
  KanbanSquare,
  Library,
  Megaphone,
  NotebookPen,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/**
 * `/features` 전체 기능·콘텐츠 요약 페이지의 정적 카탈로그.
 *
 * 수록 원칙 (2026-10-06 코드 실측 기준):
 * - 항목은 실제로 등록된 라우트가 있는 기능만 싣는다. 에디터 안 패널처럼
 *   독립 화면이 없는 기능은 싣지 않는다 — 전체 디렉터리는 `/sitemap`이 소유한다.
 * - href는 전부 내부 경로 리터럴이며, 무결성 테스트(features-overview-data.test)가
 *   등록 라우트 표와 대조해 고정한다.
 * - 수치는 코드·데이터로 정적 확인한 것만 쓴다:
 *   - 작품 정보 60,234건 — `apps/api/data/catalog.json.gz`의 titles 배열 길이
 *     (git HEAD blob을 직접 세어 확인, 2026-10-06). 외부 플랫폼 작품의
 *     메타데이터이며 자체 연재작 수가 아니다 — 페이지 문구도 그렇게 밝힌다.
 *   - 플랫폼 20종 — `packages/core/src/platforms.ts`의 PLATFORMS 키 수.
 */

export interface FeatureOverviewText {
  readonly ko: string;
  readonly en: string;
}

export interface FeatureOverviewItem {
  readonly name: FeatureOverviewText;
  readonly description: FeatureOverviewText;
  readonly href: string;
}

export interface FeatureOverviewCategory {
  readonly id: string;
  readonly icon: LucideIcon;
  readonly title: FeatureOverviewText;
  readonly summary: FeatureOverviewText;
  readonly items: readonly FeatureOverviewItem[];
}

/** 외부 플랫폼 작품 메타데이터 건수 (근거는 파일 머리말 참조). */
export const FEATURE_OVERVIEW_CATALOG_TITLES = 60_234;

/** 작품 정보를 모으는 외부 플랫폼 수 (근거는 파일 머리말 참조). */
export const FEATURE_OVERVIEW_PLATFORM_COUNT = 20;

export const FEATURE_OVERVIEW_CATEGORIES: readonly FeatureOverviewCategory[] = [
  {
    id: "plan",
    icon: NotebookPen,
    title: { ko: "기획·스토리", en: "Plan & story" },
    summary: {
      ko: "아이디어를 작품의 뼈대로 바꾸는 단계. 설정과 대본을 정리하고 검증된 구성으로 시작합니다.",
      en: "Turn an idea into the backbone of a work — organize settings and scripts, then start from proven structures.",
    },
    items: [
      {
        name: { ko: "스토리 랩", en: "Story lab" },
        description: { ko: "아이디어를 작품 설정·시즌·대본으로 정리", en: "Shape ideas into settings, seasons and scripts" },
        href: "/story-lab",
      },
      {
        name: { ko: "세계관 랩", en: "Storyworld lab" },
        description: { ko: "캐릭터·세계관 설정 관리와 작품 간 공유 세계관", en: "Manage character and world settings, shared across works" },
        href: "/studio/storyworld",
      },
      {
        name: { ko: "작품 템플릿", en: "Work templates" },
        description: { ko: "검증된 구성의 템플릿으로 새 작품 시작", en: "Start a new work from a proven template" },
        href: "/studio/templates",
      },
      {
        name: { ko: "새 작품 만들기", en: "Create a new work" },
        description: { ko: "빈 작품부터 단계별 마법사로 시작", en: "Start from a blank work with a step-by-step wizard" },
        href: "/studio/new",
      },
    ],
  },
  {
    id: "draw",
    icon: Brush,
    title: { ko: "그리기·편집", en: "Draw & edit" },
    summary: {
      ko: "콘티부터 선화·채색·말풍선까지 그리는 도구들. 실시간으로 함께 그리는 공동 캔버스와 영상형 편집까지.",
      en: "Tools for storyboards, line art, color and balloons — plus a real-time shared canvas and motion editing.",
    },
    items: [
      {
        name: { ko: "드로잉 캔버스", en: "Drawing canvas" },
        description: { ko: "브러시·레이어·컷·말풍선을 한 캔버스에서", en: "Brushes, layers, panels and balloons on one canvas" },
        href: "/studio/canvas",
      },
      {
        name: { ko: "컷툰 편집기", en: "Comic editor" },
        description: { ko: "컷 단위 편집과 실시간 공동 캔버스", en: "Panel-by-panel editing on a real-time shared canvas" },
        href: "/studio/comic",
      },
      {
        name: { ko: "브러시 랩", en: "Brush lab" },
        description: { ko: "브러시를 만들고 실험하는 공간", en: "Create and experiment with brushes" },
        href: "/brush-lab",
      },
      {
        name: { ko: "모션 웹툰", en: "Motion webtoon" },
        description: { ko: "컷에 움직임·자막을 입히는 무빙툰 제작", en: "Add motion and captions to panels" },
        href: "/studio/motion-webtoon",
      },
      {
        name: { ko: "컷츠 스튜디오", en: "Cuts studio" },
        description: { ko: "짧은 컷 영상과 팬 리믹스 제작", en: "Make short panel videos and fan remixes" },
        href: "/cuts/studio",
      },
    ],
  },
  {
    id: "three-d",
    icon: Boxes,
    title: { ko: "캐릭터·3D", en: "Characters & 3D" },
    summary: {
      ko: "그리기 어려운 포즈와 배경을 3D로 잡아 그림의 기준으로 쓰는 도구들.",
      en: "Use 3D to block the poses and backgrounds that are hard to draw, then paint over a solid reference.",
    },
    items: [
      {
        name: { ko: "캐릭터 셰이퍼", en: "Character shaper" },
        description: { ko: "3D 프리셋으로 체형·표정·포즈 설계", en: "Design body, face and pose from 3D presets" },
        href: "/shaper",
      },
      {
        name: { ko: "캐릭터 만들기", en: "Create a character" },
        description: { ko: "프리셋 캐릭터를 만들고 보관함에 저장", en: "Create preset characters and keep them in your library" },
        href: "/studio/assets/characters/new",
      },
      {
        name: { ko: "배경 3D 스튜디오", en: "3D background studio" },
        description: { ko: "3D 공간으로 장면 배경과 카메라 구도 구성", en: "Compose scene backgrounds and camera angles in 3D" },
        href: "/studio/bg3d",
      },
      {
        name: { ko: "포즈 스튜디오", en: "Pose studio" },
        description: { ko: "캐릭터 포즈와 손동작을 잡아 그림 기준으로", en: "Set character poses and hand gestures as drawing reference" },
        href: "/studio/poser",
      },
      {
        name: { ko: "2D→3D 리프트", en: "2D to 3D lift" },
        description: { ko: "평면 이미지를 3D 공간으로 일으키기", en: "Lift a flat image into 3D space" },
        href: "/studio/lift3d",
      },
      {
        name: { ko: "캐릭터 변환", en: "Character convert" },
        description: { ko: "사진·그림을 웹툰 캐릭터로 변환", en: "Convert photos and drawings into webtoon characters" },
        href: "/studio/character-convert",
      },
      {
        name: { ko: "공간 제작", en: "Immersive space" },
        description: { ko: "걸어 다닐 수 있는 몰입형 공간 장면 제작", en: "Build walkable immersive space scenes" },
        href: "/studio/immersive",
      },
    ],
  },
  {
    id: "ai",
    icon: Sparkles,
    title: { ko: "AI 도구", en: "AI tools" },
    summary: {
      ko: "생성과 보조를 맡는 AI. 서버 무료 풀이 기본이고, 내 키를 등록하면(BYOK) 유료 제공자도 내 키로 씁니다.",
      en: "AI for generation and assistance. A free server pool is the default; register your own key (BYOK) to use paid providers.",
    },
    items: [
      {
        name: { ko: "생성형 제작", en: "Generative creation" },
        description: { ko: "프롬프트로 이미지와 컷 생성", en: "Generate images and panels from prompts" },
        href: "/studio/generate",
      },
      {
        name: { ko: "개인 AI 런타임", en: "Personal AI runtime" },
        description: { ko: "브라우저 기기에서 도는 ONNX 모델 실험", en: "Experiment with ONNX models running on your device" },
        href: "/studio/ai-lab",
      },
      {
        name: { ko: "AI 캐릭터 챗", en: "AI character chat" },
        description: { ko: "작품 캐릭터와 대화하는 체험·팬 챗", en: "Chat with the characters of a work" },
        href: "/character-chat",
      },
      {
        name: { ko: "AI 설정", en: "AI settings" },
        description: { ko: "AI 제공자와 모델 선택·동작 방식 조정", en: "Choose AI providers, models and behavior" },
        href: "/studio/ai-settings",
      },
      {
        name: { ko: "API 키 허브", en: "API key hub" },
        description: { ko: "외부 서비스 키를 한곳에서 등록·관리", en: "Register and manage external service keys in one place" },
        href: "/settings/api-keys",
      },
    ],
  },
  {
    id: "production",
    icon: KanbanSquare,
    title: { ko: "제작 관리·협업", en: "Production & teamwork" },
    summary: {
      ko: "혼자서도, 팀으로도. 회차와 일정, 검토와 게시를 작품 단위로 잇는 제작 운영 도구.",
      en: "Solo or with a team — production operations that connect episodes, schedules, reviews and publishing per work.",
    },
    items: [
      {
        name: { ko: "제작 허브", en: "Production hub" },
        description: { ko: "회차·일정·담당·진행 상태를 작품별로 관리", en: "Manage episodes, schedules, owners and progress per work" },
        href: "/production",
      },
      {
        name: { ko: "팀 워크스페이스", en: "Team workspaces" },
        description: { ko: "팀 단위 작업 공간과 사용량 관리", en: "Team workspaces and usage management" },
        href: "/production/workspaces",
      },
      {
        name: { ko: "연재 센터", en: "Serialization center" },
        description: { ko: "내 작품의 연재 현황과 게시 패키지를 한곳에서 확인", en: "Check serialization status and publication packages for your works in one place" },
        href: "/publish",
      },
      {
        name: { ko: "협업 보드", en: "Collaboration board" },
        description: { ko: "함께할 사람과 프로젝트를 찾고 연결", en: "Find people and projects to work with" },
        href: "/collaborate",
      },
      {
        name: { ko: "가상 스튜디오", en: "Virtual studio" },
        description: { ko: "내 캐릭터로 걷고 만나며 함께 작업하는 공간", en: "Walk, meet and work together as your character" },
        href: "/studio/space",
      },
      {
        name: { ko: "창작자 애널리틱스", en: "Creator analytics" },
        description: { ko: "작품 지표와 성장 흐름 확인", en: "Review work metrics and growth" },
        href: "/studio/analytics",
      },
    ],
  },
  {
    id: "learn",
    icon: GraduationCap,
    title: { ko: "배우기", en: "Learn" },
    summary: {
      ko: "클래스와 가이드, 공정별 도구 정리로 만들면서 배우는 학습 영역. 클래스는 무료 또는 활동 포인트로 열립니다.",
      en: "Classes, guides and a per-stage tool guide — learn while making. Classes are free or cost activity points.",
    },
    items: [
      {
        name: { ko: "배우기 홈", en: "Learning home" },
        description: { ko: "클래스·가이드·연습을 모아 보는 입구", en: "The entrance to classes, guides and practice" },
        href: "/learn",
      },
      {
        name: { ko: "제작 공정·도구 가이드", en: "Process & tool guide" },
        description: { ko: "기획부터 홍보까지 공정별로 쓰는 도구 정리", en: "Tools used at each stage, from planning to promotion" },
        href: "/learn/process",
      },
      {
        name: { ko: "창작 레시피", en: "Creation recipes" },
        description: { ko: "짧게 따라 하는 제작 레시피 모음", en: "Short, follow-along creation recipes" },
        href: "/learn/recipes",
      },
      {
        name: { ko: "창작자 허브", en: "Creator hub" },
        description: { ko: "창작자 리소스와 연결의 중심", en: "The hub for creator resources and connections" },
        href: "/creator-hub",
      },
    ],
  },
  {
    id: "resources",
    icon: Library,
    title: { ko: "자료·소재", en: "Research & assets" },
    summary: {
      ko: "출처가 확인된 자료를 찾는 리서치 데스크와, 사고팔고 관리하는 소재 영역.",
      en: "A research desk for sourced material, plus the asset area to buy, sell and manage resources.",
    },
    items: [
      {
        name: { ko: "리서치 데스크", en: "Research desk" },
        description: { ko: "복식·소품·장소 등 창작 자료를 출처와 함께 탐색", en: "Explore creative references with their sources" },
        href: "/research",
      },
      {
        name: { ko: "3D 소재", en: "3D assets" },
        description: { ko: "CC0 3D 모델·HDRI·텍스처 검색", en: "Search CC0 3D models, HDRIs and textures" },
        href: "/research/3d-assets",
      },
      {
        name: { ko: "공개 데이터 창작실", en: "Open data lab" },
        description: { ko: "공식 공개 API를 장면·고증 자료로 연결", en: "Connect official open APIs to scenes and research" },
        href: "/research/open-data",
      },
      {
        name: { ko: "에셋 허브", en: "Asset hub" },
        description: { ko: "내 브러시·배경·캐릭터·폰트와 사용 권리 관리", en: "Manage your brushes, backgrounds, characters, fonts and rights" },
        href: "/studio/assets",
      },
      {
        name: { ko: "창작 마켓", en: "Creator market" },
        description: { ko: "창작자가 만든 에셋을 사고파는 마켓", en: "Buy and sell creator-made assets" },
        href: "/market",
      },
    ],
  },
  {
    id: "discover",
    icon: Compass,
    title: { ko: "읽고 발견하기", en: "Read & discover" },
    summary: {
      ko: `외부 ${FEATURE_OVERVIEW_PLATFORM_COUNT}개 플랫폼에서 모은 작품 정보 ${FEATURE_OVERVIEW_CATALOG_TITLES.toLocaleString("ko-KR")}건을 검색·랭킹·캘린더로 탐색합니다.`,
      en: `Browse ${FEATURE_OVERVIEW_CATALOG_TITLES.toLocaleString("en-US")} catalog entries collected from ${FEATURE_OVERVIEW_PLATFORM_COUNT} external platforms, through search, rankings and a release calendar.`,
    },
    items: [
      {
        name: { ko: "발견 허브", en: "Discovery hub" },
        description: { ko: "새 작품과 작가를 만나는 입구", en: "The entrance to new works and creators" },
        href: "/discover",
      },
      {
        name: { ko: "통합 검색", en: "Unified search" },
        description: { ko: "작품·작가·태그를 한 번에 검색", en: "Search works, creators and tags at once" },
        href: "/search",
      },
      {
        name: { ko: "랭킹", en: "Rankings" },
        description: { ko: "플랫폼을 가로지르는 인기 작품 순위", en: "Popular works ranked across platforms" },
        href: "/ranking",
      },
      {
        name: { ko: "연재 캘린더", en: "Release calendar" },
        description: { ko: "요일별 연재 일정을 달력으로 확인", en: "See weekly release schedules as a calendar" },
        href: "/calendar",
      },
      {
        name: { ko: "취향 탐색", en: "Taste explorer" },
        description: { ko: "장르·태그·조건으로 작품 둘러보기", en: "Browse works by genre, tag and preference" },
        href: "/explore",
      },
      {
        name: { ko: "내 서재", en: "My library" },
        description: { ko: "저장한 작품과 읽기 기록", en: "Saved works and reading history" },
        href: "/library",
      },
      {
        name: { ko: "업계 소식", en: "Industry news" },
        description: { ko: "웹툰·웹소설 관련 소식 모음", en: "News from the webtoon and web novel industry" },
        href: "/news",
      },
    ],
  },
  {
    id: "community",
    icon: Megaphone,
    title: { ko: "홍보·커뮤니티", en: "Promote & community" },
    summary: {
      ko: "완성한 작품을 알리고, 독자·동료 창작자와 만나는 영역.",
      en: "Where finished works get promoted and creators meet readers and peers.",
    },
    items: [
      {
        name: { ko: "커뮤니티", en: "Community" },
        description: { ko: "창작자와 독자의 이야기·카페·게시판", en: "Stories, cafes and boards for creators and readers" },
        href: "/community",
      },
      {
        name: { ko: "홍보 게시판", en: "Promotion board" },
        description: { ko: "내 작품을 독자에게 알리는 게시판", en: "Introduce your work to readers" },
        href: "/community/promote",
      },
      {
        name: { ko: "작품 쇼케이스", en: "Showcase" },
        description: { ko: "완성작과 홍보 페이지를 전시", en: "Exhibit finished works and promo pages" },
        href: "/showcase",
      },
      {
        name: { ko: "뉴스레터", en: "Newsletter" },
        description: { ko: "구독자에게 작품 소식을 메일로 발송", en: "Send work updates to subscribers by email" },
        href: "/newsletter",
      },
      {
        name: { ko: "이벤트", en: "Events" },
        description: { ko: "진행 중인 이벤트와 참여 안내", en: "Ongoing events and how to join" },
        href: "/events",
      },
      {
        name: { ko: "창작 챌린지", en: "Creative challenges" },
        description: { ko: "주제가 있는 창작 이벤트", en: "Themed creative events" },
        href: "/challenges",
      },
      {
        name: { ko: "오늘의 운세", en: "Daily fortune" },
        description: { ko: "가볍게 즐기는 운세 콘텐츠", en: "Light fortune content for a break" },
        href: "/fortune",
      },
    ],
  },
  {
    id: "guide",
    icon: CircleHelp,
    title: { ko: "안내·도움", en: "Guide & help" },
    summary: {
      ko: "서비스를 처음 만나는 분과, 길을 잃은 분을 위한 안내 모음. 모든 페이지를 빠짐없이 찾으려면 사이트맵으로.",
      en: "For first-time visitors and anyone who lost their way. For the complete page directory, use the sitemap.",
    },
    items: [
      {
        name: { ko: "서비스 소개", en: "About ToonStudio" },
        description: { ko: "ToonStudio가 잇는 창작 흐름 한눈에", en: "The connected creative flow at a glance" },
        href: "/about",
      },
      {
        name: { ko: "제품 투어", en: "Product tour" },
        description: { ko: "실제 화면으로 따라가는 8분 전체 투어", en: "An 8-minute tour through real product screens" },
        href: "/product-tour",
      },
      {
        name: { ko: "요금제", en: "Pricing" },
        description: { ko: "플랜과 제공 범위 안내", en: "Plans and what each includes" },
        href: "/pricing",
      },
      {
        name: { ko: "전체 사이트맵", en: "Full sitemap" },
        description: { ko: "직접 열 수 있는 모든 페이지 디렉터리", en: "The directory of every page you can open" },
        href: "/sitemap",
      },
      {
        name: { ko: "도움말", en: "Help" },
        description: { ko: "자주 묻는 질문과 이용 안내", en: "Frequently asked questions and guidance" },
        href: "/help",
      },
      {
        name: { ko: "문의", en: "Support" },
        description: { ko: "이용 문의와 제보·제안", en: "Questions, reports and suggestions" },
        href: "/support",
      },
    ],
  },
];
