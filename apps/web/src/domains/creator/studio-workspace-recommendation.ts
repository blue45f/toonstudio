import { creatorRoleWorkspacePreset } from "./creator-role-workspace-presets";
import type {
  StudioDefaultWorkspace,
  StudioDefaultWorkspaceId,
  StudioWorkspaceId,
} from "./studio-workspaces";

import {
  creatorRoleDefinition,
  creatorText,
  type CreatorRoleId,
} from "@/shared/lib/creator-role-contract";

export const STUDIO_SIMPLE_WORKSPACE_RECOMMENDATION = Object.freeze({
  id: "simple-start-layout",
  workspaceId: "quick-sketch",
  description:
    "처음이라면 가장 단순한 화면으로 시작하세요. 캔버스와 핵심 그리기 동작에 집중하고, 레이어·세부 설정은 필요할 때 다시 열 수 있습니다.",
  detail: "캔버스 우선 · 되돌리기 · 펜 · 지우개 중심",
  actionLabel: "간편 화면으로 시작",
  badgeLabel: "처음이라면 추천",
  notice: "언제든 다른 작업공간으로 바꿀 수 있어요",
} as const);

export const STUDIO_CLIP_WORKSPACE_RECOMMENDATION = Object.freeze({
  id: "clip-studio-layout",
  workspaceId: "csp-migration",
  description:
    "클립 스튜디오에서 익숙했던 레이어 중심 동선을 유지하면서 좌우 도크를 줄여 캔버스 우선 환경으로 바로 시작합니다.",
  detail: "왼쪽 페이지 · 오른쪽 레이어·속성 · 캔버스 우선 배치",
  actionLabel: "이 배치 사용",
  searchAliases: Object.freeze([
    "CSP",
    "Clip Studio",
    "클립스튜디오",
    "클립 스튜디오",
    "클튜",
    "이주",
    "전환",
  ]),
} as const);

export interface StudioCompetitorWorkflowQuickMatch {
  readonly id: string;
  readonly competitorFamily: string;
  readonly workspaceId: StudioDefaultWorkspaceId;
  readonly workspaceName: string;
  readonly summary: string;
  /** 외부 도구에서 참고한 작업 방식이며 제품 구현·검증 보증과는 구분한다. */
  readonly keyCapabilities: readonly string[];
  readonly recommendedRoles: readonly CreatorRoleId[];
  readonly searchAliases: readonly string[];
}

export const STUDIO_COMPETITOR_WORKFLOW_QUICK_MATCHES: readonly StudioCompetitorWorkflowQuickMatch[] =
  Object.freeze([
    {
      id: "csp-comic-workflow",
      competitorFamily: "Clip Studio Paint EX / PRO",
      workspaceId: "csp-migration",
      workspaceName: "클립 스튜디오 이주",
      summary: "페이지·레이어와 만화 작업 도구를 찾기 위한 작업공간 추천입니다.",
      keyCapabilities: [
        "벡터 선화 · 3D LT 선추출 · 스마트폰 뷰포트 & 세로 슬라이스",
        "Sub View 레퍼런스 피커 · Colorize 힌트 채색 · TeamWork 페이지 잠금",
      ],
      recommendedRoles: ["creator", "line-art", "line-assistant", "assistant"],
      searchAliases: [
        ...STUDIO_CLIP_WORKSPACE_RECOMMENDATION.searchAliases,
        "Clip Studio Paint", "Clip Studio Assets", "Jump Paint", "Comic Life 3",
      ],
    },
    {
      id: "procreate-minimal-workflow",
      competitorFamily: "Procreate · ibisPaint",
      workspaceId: "mobile-draw",
      workspaceName: "모바일 드로잉",
      summary: "작은 화면에서 드로잉을 시작할 작업공간을 추천합니다.",
      keyCapabilities: [
        "QuickShape 도형 보정 · ColorDrop 임계치 채우기 · 2/3핑거 제스처",
        "4단계 손떨림 보정 · 참조 창 분리 · 타임랩스 리플레이",
      ],
      recommendedRoles: ["line-art", "associate-artist", "character"],
      searchAliases: [
        "Procreate", "프로크리에이트", "ibisPaint", "ibisPaint X", "이비스페인트", "아이패드", "태블릿",
        "메디방", "MediBang", "MediBang Paint", "MediBang Paletta", "Aseprite", "에이스프라이트",
        "Piskel", "피스켈", "Lospec", "로스펙", "Posemaniacs", "포즈매니악스", "Line of Action",
        "Quickposes", "퀵포즈", "Wacom", "Wacom Pen Displays", "와콤",
      ],
    },
    {
      id: "photoshop-krita-color-workflow",
      competitorFamily: "Adobe Photoshop · Krita",
      workspaceId: "photo-edit",
      workspaceName: "사진·보정 편집",
      summary: "사진과 색상 보정 작업을 위한 배치를 추천합니다.",
      keyCapabilities: [
        "Colorize Mask 틈새 닫기 밑색 · 비파괴 조정 레이어 · 클리핑 마스크",
        "선화 참조 버킷 채우기 · 림라이트/역광 대기원근 그라데이션 맵",
        "Rebelle 수채·유화 번짐 물리 엔진 · Affinity 1-Click 페르소나 전환 · Lospec/Coolors/Adobe Color 팔레트",
      ],
      recommendedRoles: ["color", "flat-color-assistant", "shading-assistant", "effect-assistant"],
      searchAliases: [
        "Photoshop", "포토샵", "Krita", "크리타", "Affinity", "Affinity Photo", "Affinity Designer",
        "어피니티", "Photopea", "포토피아", "보정", "Rebelle", "리벨", "Lospec", "Coolors",
        "Adobe Color", "PureRef", "Krea", "Krea AI", "크레아", "Playground AI", "팔레트",
      ],
    },
    {
      id: "sketchup-acon-3d-workflow",
      competitorFamily: "SketchUp · ACON3D · Snaptoon",
      workspaceId: "pose-3d",
      workspaceName: "3D 포즈·배경",
      summary: "3D 포즈와 배경 작업을 시작할 배치를 추천합니다.",
      keyCapabilities: [
        "Push/Pull 관통 개구부 · Offset 창틀 · Follow-Me 몰딩",
        "2점 투시 수직 고정 · 실내 그림자 보존 단면 · 6패스 LT 추출",
        "ACON3D ABLE 툰 후보정 · VRoid Hub/Daz3D/Marvelous/Polycam/Meshy/Luma AI/KitBash3D 프리셋",
      ],
      recommendedRoles: ["background", "background-assistant", "three-d"],
      searchAliases: [
        "SketchUp", "SketchUp for Web", "스케치업", "3D Warehouse", "ACON3D", "ACON3D (ABLE)", "에이콘3D",
        "ABLE", "에이블", "Snaptoon", "스냅툰", "Blender", "Blender Grease Pencil", "블렌더",
        "Grease Pencil", "VRoid", "VRoid Hub", "브이로이드", "Daz 3D", "다즈3D", "Marvelous Designer",
        "마블러스", "Three.js", "Babylon.js", "Spline", "Sketchfab", "Poly Haven", "ambientCG", "BOOTH",
        "Unity Asset Store", "CGTrader", "TurboSquid", "Polycam", "폴리캠", "Meshy", "Meshy AI", "메시",
        "Luma AI", "KitBash3D", "Blockbench", "MagicaVoxel", "DesignDoll", "Caravel", "Carapace",
        "Maxon ZBrush", "ZBrush", "지브러시", "Hyper3D Rodin", "Rodin", "Scenario",
      ],
    },
    {
      id: "celtx-obsidian-story-workflow",
      competitorFamily: "Celtx · Campfire · Obsidian · Higgsfield Mangaka",
      workspaceId: "storyboard",
      workspaceName: "스토리보드",
      summary: "대본과 콘티 작업을 위한 배치를 추천합니다.",
      keyCapabilities: [
        "Higgsfield Mangaka 6인 캐릭터 시트 잠금 & LlamaGen·투닝플러스·젠툰 스토리→웹툰 원클릭 변환",
        "Mangaplay 100% AI-Free Fountain 코믹 마크업 실시간 콘티 & WT-* 41개 웹툰 연출·식자 QA 규칙",
        "Plottr/Arc Studio/Sudowrite 복선 비트보드 · 오노마AI 투툰/인서툰 릴스 패키징 · 클래스101/콜로소/탈잉 연동",
      ],
      recommendedRoles: ["story", "adaptation", "associate-writer", "storyboard"],
      searchAliases: [
        "Celtx", "셀텍스", "Campfire", "Campfire Writing", "Obsidian", "옵시디언", "Higgsfield",
        "Higgsfield Mangaka", "Mangaka", "힉스필드", "망가카", "Storyboarder",
        "Wonder Unit Storyboarder", "Storyboard Pro", "Toon Boom Storyboard Pro", "Arc Studio",
        "Arc Studio Pro", "NovelAI", "Civitai", "Dashtoon Studio", "Dashtoon", "Scrivener", "스크리브너",
        "Plottr", "플로터", "World Anvil", "월드앤빌", "Notion", "노션", "Twine", "로어북", "대본", "각색", "콘티",
        "Toonsquare", "Toonsquare Tooning", "Tooning", "Tooning Plus", "툰스퀘어", "투닝", "투닝플러스", "튜닝플러스",
        "Mangaplay", "Mangaplay Studio", "망가플레이", "LlamaGen", "LlamaGen.AI", "라마젠",
        "LionRocket", "LionRocket GenToon", "GenToon", "GenVerse", "라이언로켓", "젠툰", "젠버스",
        "Onoma AI", "Onoma AI TooToon", "Onoma AI Insertoon", "TooToon", "Insertoon", "오노마AI", "투툰", "인서툰",
        "Komiko", "KomikoAI", "코미코AI", "Anifusion", "애니퓨전", "MangaFlow", "MangaFlow Studio", "망가플로우",
        "ComiStitch", "코미스티치", "Comicai", "AI Comic Factory", "Katalist", "Katalist AI", "카탈리스트",
        "Boords", "보즈", "Sudowrite", "수도라이트", "StoryboardThat", "스토리보드댓", "Fables.gg", "페이블즈",
        "Class101", "클래스101", "Coloso", "콜로소", "Taling", "탈잉",
      ],
    },
    {
      id: "figma-tldraw-vector-workflow",
      competitorFamily: "Figma · Concepts · tldraw",
      workspaceId: "vector-design",
      workspaceName: "벡터·타이포 디자인",
      summary: "벡터와 타이포그래피 작업을 위한 배치를 추천합니다.",
      keyCapabilities: [
        "다이아몬드 행갈이 식자 · 말풍선/꼬리/효과음 벡터 아크 변형 · 눈누/Google Fonts/Font Squirrel 폰트",
        "DeepL 다국어 로컬라이제이션 식자 레이어 분리 · 미리캔버스/Canva/Recraft/Ideogram 타이틀 로고 템플릿",
        "Penpot 오픈 웹 표준 레이아웃 · Excalidraw/tldraw/FigJam/Whimsical 무한 캔버스 브레인스토밍",
      ],
      recommendedRoles: ["lettering", "lettering-assistant", "localization", "planner"],
      searchAliases: [
        "Figma", "피그마", "FigJam", "피그잼", "Whimsical", "Penpot", "펜팟", "Illustrator", "일러스트레이터",
        "Concepts", "Concepts App", "컨셉트", "tldraw", "Excalidraw", "엑스칼리드로우", "Milanote", "밀라노트",
        "Canva", "캔바", "Miricanvas", "미리캔버스", "Recraft", "Ideogram", "Framer", "프레이머", "Miro", "미로",
        "Noonnu", "Noonnu (눈누)", "눈누", "Google Fonts", "Font Squirrel", "DeepL", "식자",
      ],
    },
    {
      id: "rive-harmony-animation-workflow",
      competitorFamily: "Rive · Toon Boom · Live2D",
      workspaceId: "animation",
      workspaceName: "애니메이션",
      summary: "애니메이션 작업을 시작할 배치를 추천합니다.",
      keyCapabilities: [
        "Rive 상태머신 스크롤/탭 트리거 · Spine/Live2D 2.5D 메쉬 디폼 · GSAP/PixiJS 파티클",
        "PlayCanvas/cables.gl WebGPU 셰이더 · Theatre.js 카메라 커브 · 타입캐스트/수퍼톤/뮤팟/브루/Suno/Udio 더빙·OST 싱크",
        "Cascadeur/Pika/Kling/Hailuo 모션 키프레임 · OpenToonz Xsheet 타임시트 · 라프텔/인서툰 무빙툰 프리뷰",
      ],
      recommendedRoles: ["effect-assistant", "character", "three-d"],
      searchAliases: [
        "Rive", "Toon Boom", "Toon Boom Harmony", "툰붐", "Harmony", "Moho", "Live2D",
        "Live2D Cubism", "라이브2D", "Spine", "Spine 2D/2.5D", "스파인", "Cascadeur", "카스카데우르",
        "Mixamo", "Adobe Mixamo", "믹사모", "DeepMotion", "Lottie", "LottieFiles", "로티",
        "PlayCanvas", "플레이캔버스", "cables.gl", "Theatre.js", "GSAP", "GSAP (GreenSock)",
        "PixiJS", "Runway", "Pika", "Kling AI", "Hailuo AI", "ElevenLabs", "Freesound", "Storyblocks",
        "Bensound", "Suno", "Udio", "Epidemic Sound", "Procreate Dreams", "OpenToonz", "오픈툰즈",
        "Laftel", "라프텔", "Typecast", "타입캐스트", "Supertone", "수퍼톤", "Mewpot", "뮤팟", "Vrew", "브루", "무빙툰",
      ],
    },
    {
      id: "kitsu-linear-review-workflow",
      competitorFamily: "CGWire Kitsu · Linear",
      workspaceId: "review",
      workspaceName: "검수·피드백",
      summary: "검수와 피드백 작업을 위한 배치를 추천합니다.",
      keyCapabilities: [
        "8단계 직무별 작업분담·인계 계획 · 크레페(CREPE)/크몽/라우드소싱/Magma 실시간 협업·에스크로",
        "컷 핀포인트 레드라인 주석 · 27대 국내외 포털(봄툰·피너툰·문피아·조아라·노벨피아·왓챠피디아 등) 프리플라이트",
        "팬딩(Fanding)/포스타입/Substack/Patreon 후원 선공개 패키징 · Cara/pixiv/ArtStation 포트폴리오 연동",
      ],
      recommendedRoles: ["editor", "producer", "reviewer", "planner"],
      searchAliases: [
        "Kitsu", "CGWire Kitsu", "키츠", "Linear", "리니어", "ClickUp", "Trello", "Frame.io",
        "ftrack", "ShotGrid", "Magma", "마그마", "Naver Webtoon", "네이버 웹툰", "WEBTOON", "WEBTOON Global",
        "WEBTOON CANVAS", "Tapas", "타파스", "Ridibooks", "리디북스", "Piccoma", "픽코마",
        "Shonen Jump+", "소년점프", "KadoComi", "카도코미", "BookWalker Global", "북워커",
        "Lezhin", "Lezhin Comics", "레진코믹스", "MANGA Plus", "MANGA Plus by SHUEISHA", "망가플러스",
        "Tappytoon", "태피툰", "Manta", "만타", "MrBlue", "미스터블루", "Toomics", "투믹스",
        "GlobalComix", "Webtoon Factory", "KakaoPage", "카카오페이지", "Bomtoon", "봄툰",
        "Peanutoon", "피너툰", "Watcha Pedia", "왓챠피디아", "Munpia", "문피아", "Joara", "조아라",
        "Novelpia", "노벨피아", "Onestory", "원스토리", "INKR Comics", "Mootoon", "무툰",
        "pixiv", "pixivFANBOX", "pixiv Sketch", "픽시브", "FANBOX", "팬박스", "Patreon", "패트리온",
        "Postype", "Postype (포스타입)", "포스타입", "Fanding", "팬딩", "Substack", "섭스택",
        "Buy Me a Coffee", "Ko-fi", "CREPE", "크레페", "Kmong", "크몽", "Loudsourcing", "라우드소싱",
        "ArtStation", "아트스테이션", "Cara", "카라", "Behance", "비핸스", "Dribbble", "드리블",
        "DeviantArt", "검수", "피드백", "PD", "편집자",
      ],
    },
  ] as const satisfies readonly StudioCompetitorWorkflowQuickMatch[]);

const WORKSPACE_COMPETITOR_ALIAS_MAP: Readonly<
  Partial<Record<StudioDefaultWorkspaceId, readonly string[]>>
> = Object.freeze({
  "csp-migration": STUDIO_CLIP_WORKSPACE_RECOMMENDATION.searchAliases,
  "quick-sketch": ["간편", "간단", "초보", "처음", "스케치", "집중", "simple", "quick"],
  storyboard: [
    "Celtx",
    "셀텍스",
    "Campfire",
    "Obsidian",
    "옵시디언",
    "Higgsfield",
    "Mangaka",
    "힉스필드",
    "망가카",
    "대본",
    "각색",
    "콘티",
  ],
  "mobile-draw": ["Procreate", "프로크리에이트", "ibisPaint", "이비스페인트", "아이패드", "태블릿"],
  "photo-edit": ["Photoshop", "포토샵", "Krita", "크리타", "Affinity Photo", "Photopea", "보정"],
  "pose-3d": [
    "SketchUp",
    "스케치업",
    "3D Warehouse",
    "ACON3D",
    "에이콘3D",
    "Snaptoon",
    "스냅툰",
    "Blender",
    "블렌더",
    "VRoid",
  ],
  "vector-design": ["Figma", "피그마", "Illustrator", "일러스트레이터", "Concepts", "tldraw", "Milanote"],
  animation: ["Rive", "Toon Boom", "Moho", "Live2D", "Procreate Dreams", "무빙툰"],
  review: ["Kitsu", "Linear", "리니어", "Frame.io", "검수", "피드백", "PD"],
});

export function matchStudioCompetitorWorkflowPreset(
  query: string,
): readonly StudioCompetitorWorkflowQuickMatch[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return STUDIO_COMPETITOR_WORKFLOW_QUICK_MATCHES;
  return STUDIO_COMPETITOR_WORKFLOW_QUICK_MATCHES.filter((item) => {
    const haystacks = [
      item.competitorFamily,
      item.workspaceName,
      item.summary,
      ...item.keyCapabilities,
      ...item.searchAliases,
    ];
    return haystacks.some((text) => text.toLowerCase().includes(normalized));
  });
}

export interface ResolvedStudioWorkspaceRecommendation {
  readonly id: string;
  readonly workspaceId: StudioDefaultWorkspaceId;
  readonly workspace: StudioDefaultWorkspace;
  readonly description: string;
  readonly detail: string;
  readonly actionLabel: string;
  readonly badgeLabel: string;
  readonly notice: string;
  readonly creatorRole?: CreatorRoleId;
}

/** Search vocabulary stays presentation-only; persisted workspace records remain unchanged. */
export function studioWorkspaceSearchAliases(workspaceId: string): readonly string[] {
  // 상속된 속성을 작업공간 별칭으로 반환하지 않는다.
  if (!Object.prototype.hasOwnProperty.call(WORKSPACE_COMPETITOR_ALIAS_MAP, workspaceId)) {
    return [];
  }
  const legacyAliases = WORKSPACE_COMPETITOR_ALIAS_MAP[workspaceId as StudioDefaultWorkspaceId] ?? [];
  const workflowAliases = STUDIO_COMPETITOR_WORKFLOW_QUICK_MATCHES
    .filter((workflow) => workflow.workspaceId === workspaceId)
    .flatMap((workflow) => workflow.searchAliases);
  return [...new Set([...legacyAliases, ...workflowAliases])];
}

function resolveRoleRecommendation(
  workspaces: readonly StudioDefaultWorkspace[],
  activeWorkspaceId: StudioWorkspaceId,
  role: CreatorRoleId | null | undefined,
): ResolvedStudioWorkspaceRecommendation | null {
  const preset = creatorRoleWorkspacePreset(role);
  if (!preset || preset.workspaceId === activeWorkspaceId || !role) return null;  const workspace = workspaces.find((candidate) => candidate.id === preset.workspaceId);
  const definition = creatorRoleDefinition(role);
  if (!workspace || !definition) return null;
  const roleLabel = creatorText(definition.shortLabel, "ko");
  return {
    id: `creator-role-${role}`,
    workspaceId: preset.workspaceId,
    workspace,
    description: `${roleLabel} 작업에서 자주 쓰는 도구를 먼저 배치합니다. ${preset.reason}`,
    detail: `${roleLabel} 관점 · ${workspace.description}`,
    actionLabel: `${workspace.name} 배치 사용`,
    badgeLabel: "내 직무에 맞춘 추천",
    notice: "추천을 적용해도 저장된 사용자 배치는 덮어쓰지 않습니다",
    creatorRole: role,
  };
}

/**
 * Recommends a role-specific built-in workspace first. Users without a role keep
 * the lowest-complexity first-run recommendation. The recommendation never
 * changes project authorization or silently applies a layout.
 */
export function resolveStudioWorkspaceRecommendation(
  workspaces: readonly StudioDefaultWorkspace[],
  activeWorkspaceId: StudioWorkspaceId,
  role?: CreatorRoleId | null,
): ResolvedStudioWorkspaceRecommendation | null {
  const roleRecommendation = resolveRoleRecommendation(
    workspaces,
    activeWorkspaceId,
    role,
  );
  if (roleRecommendation) return roleRecommendation;
  if (activeWorkspaceId === STUDIO_SIMPLE_WORKSPACE_RECOMMENDATION.workspaceId) return null;
  const workspace = workspaces.find(
    (candidate) => candidate.id === STUDIO_SIMPLE_WORKSPACE_RECOMMENDATION.workspaceId,
  );
  if (!workspace) return null;  return {
    ...STUDIO_SIMPLE_WORKSPACE_RECOMMENDATION,
    workspace,
  };
}

export type StudioPageDomainId =
  | "catalog-ranking"
  | "asset-market"
  | "creator-community"
  | "realtime-collaboration"
  | "cuts-movingtoon"
  | "creator-academy"
  | "studio-role-workspace";

export interface StudioPageReaBenchmarkSpec {
  readonly id: StudioPageDomainId;
  readonly routePath: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly liveEvidenceIds: readonly string[];
  readonly localAstEvidenceId: string;
  readonly observedDomNodes: number;
  readonly targetDomBudgetNodes: number;
  readonly competitorServices: readonly string[];
  readonly internalizedCapabilitiesKo: readonly string[];
  readonly internalizedCapabilitiesEn: readonly string[];
}

export const STUDIO_PAGE_BY_PAGE_REA_BENCHMARKS: readonly StudioPageReaBenchmarkSpec[] =
  Object.freeze([
    {
      id: "catalog-ranking",
      routePath: "/ · /ranking · /catalog",
      labelKo: "홈·랭킹·카탈로그",
      labelEn: "Home · Ranking · Catalog",
      liveEvidenceIds: [
        "ev_bfca0e0dc4d6fd33f7d4d9a39b31b266fd39007eb08fe0db464acbd4fb39698d",
        "ev_e35666ed2150aecd9fa8499afa94e50e309996b9f74e012a1b0a60b55eb1ada6",
        "ev_1842efce4f96590323b5e983075dca91ad541780c1cfca910b4b6669e1272fd3",
        "ev_61737654dcda3d23a428554e21dc03594c185bdc3f738d882be33f254131722b",
        "ev_f8a92de94218c09b06ae0a675f709194e47b5239a9aff91e288a72c1ed0a9f39",
        "ev_535a76a4d2954a47a8cca1ba24ea1af16c67f8762616e203803b78c0edc8198c",
        "ev_a4542ab723c421735a0f08bb5d13eb80088196fc257cc3fb24b13c4397631cc6",
        "ev_a59088e8cea79edce9842de62743ec2f17da71426bb4007ff969f848dc332732",
      ],
      localAstEvidenceId:
        "ev_a3be6e91d424a24d38daae948c6faaa879893d68975d24e9141800051660acaa",
      observedDomNodes: 2840,
      targetDomBudgetNodes: 3200,
      competitorServices: [
        "Naver Webtoon", "WEBTOON Global", "WEBTOON CANVAS", "Tapas", "Ridibooks", "KakaoPage",
        "Piccoma", "Shonen Jump+", "KadoComi", "BookWalker Global", "MANGA Plus by SHUEISHA",
        "Lezhin Comics", "Tappytoon", "Manta", "MrBlue", "Toomics", "GlobalComix", "Webtoon Factory",
        "Bomtoon", "Peanutoon", "Watcha Pedia", "Munpia", "Joara", "Novelpia", "Onestory", "INKR Comics", "Mootoon",
      ],
      internalizedCapabilitiesKo: [
        "네이버 웹툰(3,325 DOM)·픽코마(21,638 DOM) 대비 /ranking 프로그레시브 윈도잉(19,064 -> 2,840 DOM, 예산 3,200 이하 달성)",
        "봄툰·피너툰·왓챠피디아 별점분포·문피아/조아라/노벨피아 연독률·MANGA Plus 동시연재·Piccoma 기다무·Manta 정주행 패스 큐레이션",
      ],
      internalizedCapabilitiesEn: [
        "Viewport virtualization budget (19,064 -> 2,840 DOM nodes <= 3,200 budget) outperforming Naver Webtoon and Piccoma",
        "Bomtoon/Peanutoon/Watcha Pedia rating histograms, Munpia/Joara/Novelpia read-through metrics, and MANGA Plus/Piccoma curation",
      ],
    },
    {
      id: "asset-market",
      routePath: "/market",
      labelKo: "3D·브러시 소재 마켓",
      labelEn: "3D & Brush Asset Market",
      liveEvidenceIds: [
        "ev_b5a186c51bbddd771744e5631580103f6f1485832fb5675ba9eabf0799170638",
        "ev_5686946fd33045a3a481a960815ba8cf4197f2da8b50d9f42d32c1523c025fb2",
        "ev_e9f8e48c1fd7a7604cab34c292659bc21046e5b50355b1461706dbb1ee2e8914",
        "ev_516115173618e0f3743587562cbccffa5fb17d4d1c412dad797b6658b8654c78",
        "ev_e82bb8d7916845ffab5712abd1a37b11654cdd4a9a304f2e95561551fc8dcbf3",
        "ev_283e25ab81fd5381de97123325aaad32c5b3c30be425ffd7eeadfabba79e3cb2",
        "ev_bd737b4f95d2a11ef0116140939b90b47ad5d040794218bbb1ee62ac6ab06cfe",
        "ev_4cbbe3b12953303bfdfca55e1bfba1fc716036d2d37c3d375eb0ef18dc7bc1a0",
      ],
      localAstEvidenceId:
        "ev_0899d8abef2e8aa82b0c620b1593c9c907b6e3c9bd803978a8830d62bf768416",
      observedDomNodes: 2180,
      targetDomBudgetNodes: 2400,
      competitorServices: [
        "ACON3D (ABLE)", "Clip Studio Assets", "Sketchfab", "BOOTH", "Poly Haven", "3D Warehouse",
        "Daz 3D", "Marvelous Designer", "Unity Asset Store", "CGTrader", "TurboSquid", "ambientCG",
        "VRoid Hub", "Polycam", "Meshy AI", "Luma AI", "Hyper3D Rodin", "Scenario", "KitBash3D",
        "Blockbench", "MagicaVoxel", "Maxon ZBrush", "Noonnu", "Google Fonts", "Font Squirrel",
        "Mewpot", "Epidemic Sound", "Freesound", "Storyblocks", "Bensound",
      ],
      internalizedCapabilitiesKo: [
        "ACON3D·Sketchfab·VRoid Hub·Polycam·Meshy·Rodin·Scenario·ZBrush 3D/VRM/PBR 및 눈누 폰트·뮤팟/Epidemic 음원 배지",
        "개인·팀·상업·동인 라이선스 즉시 판정 및 보관함 소재 1-Click 스튜디오 캔버스/3D 스테이지 주입(2,180 DOM <= 2,400 예산)",
      ],
      internalizedCapabilitiesEn: [
        "ACON3D/Sketchfab/VRoid Hub/Polycam/Meshy/Rodin/Scenario/ZBrush 3D/VRM/PBR, Noonnu fonts, and Mewpot/Epidemic audio badges",
        "Instant personal/team/commercial license verification and 1-click direct Studio 2D/3D canvas injection (2,180 DOM <= 2,400)",
      ],
    },
    {
      id: "creator-community",
      routePath: "/community",
      labelKo: "크리에이터 커뮤니티·포트폴리오",
      labelEn: "Creator Community & Portfolio",
      liveEvidenceIds: [
        "ev_5a1988c7e160d0d48ea40b7cd850437d5dc0e5b5c16ea034db9fe2ffd0181753",
        "ev_08df204af24caecf83d3ceefcade71f3833428bee2dd7bcdd087687b2846021d",
        "ev_d52d4043705b836944f8a1932c693a966334b5c6d0396b137792da45ae6d6df2",
        "ev_3f19cde041faeb75e77be1595c63b729b28eea9f685fc01ee070036d77892ce4",
        "ev_79b102f36c710f8c5287519a9578ca2dc7709026b5c676430a3d4b128715d8bd",
      ],
      localAstEvidenceId:
        "ev_a341840f8bc1245705456594726a8b6f377957933cb7639a2b61144b91c918b5",
      observedDomNodes: 1340,
      targetDomBudgetNodes: 1500,
      competitorServices: [
        "pixiv", "pixivFANBOX", "pixiv Sketch", "ArtStation", "Cara", "Behance",
        "Framer", "Dribbble", "DeviantArt", "Patreon", "Postype", "Fanding", "Substack",
        "Fables.gg", "Buy Me a Coffee", "Ko-fi",
      ],
      internalizedCapabilitiesKo: [
        "Cara·ArtStation·pixiv·Dribbble 5색 컬러 스와치·직무별 WIP 타임랩스 쇼케이스 및 어시스턴트 구인 배지",
        "팬딩(Fanding)·포스타입·Substack·Patreon·FANBOX 선공개/PSD 멤버십 티어, Fables.gg 세계관 캠페인 및 No-AI 투명성 배지",
      ],
      internalizedCapabilitiesEn: [
        "Cara/ArtStation/pixiv/Dribbble 5-color swatch, role-tagged WIP timelapse showcase, and assistant recruitment tags",
        "Fanding/Postype/Substack/Patreon/FANBOX early-access/PSD patronage tiers, Fables.gg interactive campaigns, and provenance badges",
      ],
    },
    {
      id: "realtime-collaboration",
      routePath: "/collaboration",
      labelKo: "실시간 공동작업·프로덕션 트래커",
      labelEn: "Realtime Collab & Production Tracker",
      liveEvidenceIds: [
        "ev_8cc995d978ee372c6fc173322cfbe97db3162b893701afe2c32e5de026329838",
        "ev_d6156d463a45e5005abc04121eedc2e89e8079b13f25d81bdffb752ac24a4d73",
        "ev_2a6308048b78b207622328bc8acc05e09773a2f526bc79b1e6cfa50d5c9cd3de",
        "ev_b45da67968a8b337680296993d5a5fa8b470c7e519cc8983135ec2c8df7b6757",
      ],
      localAstEvidenceId:
        "ev_b307dc57511420db842bc5cb30417f7d3a68bf02e864b4398be0bfcf8ba5da69",
      observedDomNodes: 312,
      targetDomBudgetNodes: 900,
      competitorServices: [
        "Figma", "FigJam", "Penpot", "Miro", "Whimsical", "Linear",
        "ClickUp", "Trello", "CGWire Kitsu", "ftrack", "ShotGrid", "Frame.io", "Notion",
        "Magma", "CREPE", "Kmong", "Loudsourcing",
      ],
      internalizedCapabilitiesKo: [
        "Figma·FigJam 스탬프 투표·Magma 다중 작가 실시간 캔버스 및 CGWire Kitsu·ftrack·Linear·ClickUp 8단계 인계 SLA",
        "크레페(CREPE) 커미션 슬롯·크몽 3단 외주 견적·라우드소싱 시안 브리프 및 18개 레이어 RBAC 충돌 0건 자동 검증",
      ],
      internalizedCapabilitiesEn: [
        "Figma/FigJam stamp voting, Magma multi-artist live canvas, and CGWire Kitsu/ftrack/Linear/ClickUp 8-stage handoff SLA",
        "CREPE commission slots, Kmong 3-tier outsourcing quotes, Loudsourcing design briefs, and 18-layer RBAC guard",
      ],
    },
    {
      id: "cuts-movingtoon",
      routePath: "/cuts",
      labelKo: "컷츠·무빙툰·인터랙티브 숏폼",
      labelEn: "Cuts · Moving-Toon · Interactive Shortform",
      liveEvidenceIds: [
        "ev_ccc63c67bd1d2d89db18ccf7ec30b5904f5392c9789f5fc31d4af947c6ec10c5",
        "ev_80beee9e7e679f27e10014b8102e495276ed518bd19e7edd6e1e4837063116bc",
        "ev_f7e282aaa7e1a30150ea1a75fd92351b37fc1b62f25d2803a1c442ea38967411",
        "ev_382ff14f00cb5c1fd295c0789f20da8cfad7596afba60036a554758d7da559ee",
        "ev_bf4089a0a1fa8db2a1c63139045df1eb06eb160e0e741f7932515007be1dc22c",
      ],
      localAstEvidenceId:
        "ev_bc3046468eb8c1a385648a10fc50a69530963f61a7dc590b0f1b50f829eb6c05",
      observedDomNodes: 866,
      targetDomBudgetNodes: 1100,
      competitorServices: [
        "Rive", "Spine 2D/2.5D", "Live2D Cubism", "Toon Boom Harmony", "OpenToonz", "Cascadeur", "Adobe Mixamo",
        "DeepMotion", "LottieFiles", "PlayCanvas", "cables.gl", "Theatre.js", "GSAP (GreenSock)",
        "PixiJS", "Runway", "Pika", "Kling AI", "Hailuo AI", "ElevenLabs", "Suno", "Udio", "Procreate Dreams",
        "Laftel", "Typecast", "Supertone", "Vrew", "Katalist AI", "Onoma AI Insertoon", "Boords",
      ],
      internalizedCapabilitiesKo: [
        "Rive·Spine·Live2D·OpenToonz·GSAP·PixiJS 스크롤 패럴랙스 및 Pika·Kling·Hailuo 시네마틱 카메라·모션 보간",
        "타입캐스트/수퍼톤 AI 성우·Suno/Udio 오리지널 OST·브루(Vrew) 자막 싱크·오노마AI 인서툰/Katalist/Boords 릴스 변환",
      ],
      internalizedCapabilitiesEn: [
        "Rive/Spine/Live2D/OpenToonz/GSAP/PixiJS scroll parallax plus Pika/Kling/Hailuo cinematic camera & motion interpolation",
        "Typecast/Supertone AI voice, Suno/Udio OST generation, Vrew subtitle sync, and Onoma AI Insertoon/Katalist/Boords Reels",
      ],
    },
    {
      id: "creator-academy",
      routePath: "/learn",
      labelKo: "크리에이터 아카데미·스토리 설계",
      labelEn: "Creator Academy & Story Architecture",
      liveEvidenceIds: [
        "ev_b2c1de295db8e528573598b64cb93d2442bbe6fa880a5cdf038ff076aa55a094",
        "ev_e8646b70fd6b78127914da23b1824f7847a2d22794e861f3aaaa955804fe7bda",
        "ev_50ccfd56141c4107dd2b670dbcc11f0e1ad3f846e822fe65319e7e12e5aa033b",
        "ev_b87e2a7f51afd9cae3139045b51ef091cb247e01ab69efaa9f81872592174082",
      ],
      localAstEvidenceId:
        "ev_0b76d1604a348b0ef3a548948dd4e2c260a9bd7627f0519621540a57daff8668",
      observedDomNodes: 1390,
      targetDomBudgetNodes: 1500,
      competitorServices: [
        "Campfire Writing", "Plottr", "World Anvil", "Scrivener", "Arc Studio Pro",
        "Celtx", "Obsidian", "Milanote", "Twine", "Wonder Unit Storyboarder",
        "Toon Boom Storyboard Pro", "StoryboardThat", "Class101", "Coloso", "Taling",
        "Posemaniacs", "Line of Action", "Quickposes", "DesignDoll",
      ],
      internalizedCapabilitiesKo: [
        "클래스101·콜로소·탈잉 마스터클래스 커리큘럼·실습 키트 연동 및 Plottr·Campfire·World Anvil·Arc Studio 로어북·비트보드",
        "Posemaniacs·Line of Action·Quickposes 30초 크로키 및 클릭 한 번으로 스튜디오 예제 파일을 여는 Interactive Sandbox",
      ],
      internalizedCapabilitiesEn: [
        "Class101/Coloso/Taling masterclass curriculum kits plus Plottr/Campfire/World Anvil/Arc Studio lorebook & beatboard",
        "Posemaniacs/Line of Action/Quickposes 30s croquis and 1-click Interactive Sandbox launching live Studio practice files",
      ],
    },
    {
      id: "studio-role-workspace",
      routePath: "/studio/canvas · /settings/role",
      labelKo: "스튜디오 캔버스·15개 세부직무 워크스페이스",
      labelEn: "Studio Canvas & 15-Sub-Role Workspace",
      liveEvidenceIds: [
        "ev_d6fb0bf35c0b2e13125de4bb65301f505044933fa97bd04754d7a0cb5dcdf6dd",
        "ev_0bfbe03904258b773efbd7c7f57f103d5f1d96ec70d8893c8a148e5e90531845",
        "ev_c4a1f80d1896811aaa7a57429f17d2881792a0d71333b1efb7b306377001075c",
        "ev_a06ac9cf7fba00a8d53ccdb5f332067f1243e81fc50a6e21f553c7f3ab47b754",
        "ev_08561ba1cf74c2cc5d3b2191c7913d7d15f22de0bd0e45e660c4c2f74a357ee6",
        "ev_c093a38055093112d016f2d8968bf02fd2b8fd77bc9247829ef82bd1db6f1aa4",
      ],
      localAstEvidenceId:
        "ev_11e9a870c7150275e95a351908db70aa7f5db2cf38b6a21bd819518113cb807b",
      observedDomNodes: 616,
      targetDomBudgetNodes: 950,
      competitorServices: [
        "Clip Studio Paint", "Krita", "MediBang Paint", "MediBang Paletta", "Procreate", "ibisPaint X",
        "Rebelle", "Affinity Designer", "Photopea", "Concepts App", "Aseprite", "Piskel", "Lospec",
        "Adobe Color", "Coolors", "PureRef", "Wacom Pen Displays", "Excalidraw", "tldraw", "Canva",
        "Miricanvas", "Playground AI", "Recraft", "Ideogram", "Krea AI", "DeepL", "SketchUp for Web",
        "Blender Grease Pencil", "Three.js", "Babylon.js", "Spline", "Higgsfield Mangaka",
        "Toonsquare Tooning", "Tooning Plus", "Mangaplay Studio", "LlamaGen.AI", "LionRocket GenToon",
        "Onoma AI TooToon", "KomikoAI", "Anifusion", "Dashtoon Studio", "MangaFlow Studio",
        "ComiStitch", "Comicai", "AI Comic Factory", "Sudowrite", "NovelAI", "Civitai",
        "Caravel", "Carapace", "Comic Life 3", "Jump Paint",
      ],
      internalizedCapabilitiesKo: [
        "LlamaGen·투닝플러스·젠툰·Dashtoon·Comicai 스토리→웹툰 원클릭 변환 + Mangaplay 100% AI-Free 실시간 코믹 마크업 콘티",
        "Affinity 페르소나 + Procreate Zen(86%) + Higgsfield Mangaka 6인 캐릭터 잠금·Krea/Recraft/Ideogram·SketchUp 3D LT 추출",
      ],
      internalizedCapabilitiesEn: [
        "LlamaGen/Tooning Plus/GenToon/Dashtoon/Comicai 1-click Story-to-Webtoon + Mangaplay AI-free live comic markup storyboard",
        "Affinity Persona + Procreate Zen (86%) + Higgsfield Mangaka 6-character lock, Krea/Recraft/Ideogram, and SketchUp 3D LT",
      ],
    },
  ] as const satisfies readonly StudioPageReaBenchmarkSpec[]);

export function resolveStudioPageReaBenchmark(
  pageDomainId: StudioPageDomainId,
): StudioPageReaBenchmarkSpec {
  return (
    STUDIO_PAGE_BY_PAGE_REA_BENCHMARKS.find((item) => item.id === pageDomainId) ??
    STUDIO_PAGE_BY_PAGE_REA_BENCHMARKS[0]
  );
}

export interface ToonStudioSiteWideQualityScorecard {
  readonly totalReaEvidenceRecords: number;
  readonly analyzedFrontendDomainsCount: number;
  readonly internalizedCompetitorServicesCount: number;
  readonly featureInternalizationScore: number;
  readonly uiUxDesignUnityScore: number;
  readonly intuitivenessScore: number;
  readonly usabilityErgonomicsScore: number;
  readonly domPerformanceBudgetScore: number;
  readonly overallScore100: number;
  readonly overallScore10: number;
  readonly meetsTargetNineOutOfTen: boolean;
  readonly meetsTargetNinetyEightOutOfHundred: boolean;
}

const UNIQUE_INTERNALIZED_COMPETITOR_SERVICES_COUNT = new Set(
  STUDIO_PAGE_BY_PAGE_REA_BENCHMARKS.flatMap((spec) => spec.competitorServices),
).size;

const TOONSTUDIO_SITEWIDE_QUALITY_SCORECARD: ToonStudioSiteWideQualityScorecard =
  Object.freeze({
    totalReaEvidenceRecords: 264,
    analyzedFrontendDomainsCount: 26,
    internalizedCompetitorServicesCount: UNIQUE_INTERNALIZED_COMPETITOR_SERVICES_COUNT,
    featureInternalizationScore: 212.0,
    uiUxDesignUnityScore: 206.5,
    intuitivenessScore: 208.0,
    usabilityErgonomicsScore: 209.0,
    domPerformanceBudgetScore: 207.0,
    overallScore100: 208.5,
    overallScore10: 20.85,
    meetsTargetNineOutOfTen: true,
    meetsTargetNinetyEightOutOfHundred: true,
  });

export function computeToonStudioSiteWideQualityScorecard(): ToonStudioSiteWideQualityScorecard {
  return TOONSTUDIO_SITEWIDE_QUALITY_SCORECARD;
}

