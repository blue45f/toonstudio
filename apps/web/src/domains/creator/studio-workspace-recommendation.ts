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
      searchAliases: STUDIO_CLIP_WORKSPACE_RECOMMENDATION.searchAliases,
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
        "Procreate",
        "프로크리에이트",
        "ibisPaint",
        "이비스페인트",
        "아이패드",
        "태블릿",
        "메디방",
        "MediBang",
        "Aseprite",
        "에이스프라이트",
        "Wacom",
        "와콤",
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
        "Rebelle 수채·유화 번짐 물리 엔진 · Affinity 1-Click 페르소나 전환",
      ],
      recommendedRoles: ["color", "flat-color-assistant", "shading-assistant", "effect-assistant"],
      searchAliases: [
        "Photoshop",
        "포토샵",
        "Krita",
        "크리타",
        "Affinity",
        "Affinity Photo",
        "Affinity Designer",
        "어피니티",
        "Photopea",
        "포토피아",
        "보정",
        "Rebelle",
        "리벨",
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
        "ACON3D ABLE 툰 후보정 · VRoid/Daz3D/Marvelous 의상·포즈 프리셋",
      ],
      recommendedRoles: ["background", "background-assistant", "three-d"],
      searchAliases: [
        "SketchUp",
        "스케치업",
        "3D Warehouse",
        "ACON3D",
        "에이콘3D",
        "ABLE",
        "에이블",
        "Snaptoon",
        "스냅툰",
        "Blender",
        "블렌더",
        "Grease Pencil",
        "VRoid",
        "브이로이드",
        "Daz 3D",
        "다즈3D",
        "Marvelous Designer",
        "마블러스",
        "Three.js",
        "Babylon.js",
        "Spline",
        "Sketchfab",
        "Poly Haven",
        "BOOTH",
      ],
    },
    {
      id: "celtx-obsidian-story-workflow",
      competitorFamily: "Celtx · Campfire · Obsidian · Higgsfield Mangaka",
      workspaceId: "storyboard",
      workspaceName: "스토리보드",
      summary: "대본과 콘티 작업을 위한 배치를 추천합니다.",
      keyCapabilities: [
        "Higgsfield Mangaka 6인 캐릭터 시트 잠금 & 대본→세로 스트립 스테이징",
        "WT-* 41개 웹툰 연출·식자 QA 규칙 및 8대 포털 슬라이스 규격",
        "Plottr 복선 타임라인 · World Anvil/Campfire 위키 · Storyboard Pro 동선",
      ],
      recommendedRoles: ["story", "adaptation", "associate-writer", "storyboard"],
      searchAliases: [
        "Celtx",
        "셀텍스",
        "Campfire",
        "Obsidian",
        "옵시디언",
        "Higgsfield",
        "Mangaka",
        "힉스필드",
        "망가카",
        "Storyboarder",
        "Storyboard Pro",
        "NovelAI",
        "Civitai",
        "Scrivener",
        "스크리브너",
        "Plottr",
        "플로터",
        "World Anvil",
        "월드앤빌",
        "Notion",
        "노션",
        "Twine",
        "로어북",
        "대본",
        "각색",
        "콘티",
      ],
    },
    {
      id: "figma-tldraw-vector-workflow",
      competitorFamily: "Figma · Concepts · tldraw",
      workspaceId: "vector-design",
      workspaceName: "벡터·타이포 디자인",
      summary: "벡터와 타이포그래피 작업을 위한 배치를 추천합니다.",
      keyCapabilities: [
        "다이아몬드 행갈이 식자 · 말풍선/꼬리/효과음 벡터 아크 변형",
        "다국어 로컬라이제이션 식자 레이어 분리 · 폰트 페어링",
        "Penpot 오픈 웹 표준 레이아웃 · Excalidraw/tldraw 무한 캔버스 브레인스토밍",
      ],
      recommendedRoles: ["lettering", "lettering-assistant", "localization", "planner"],
      searchAliases: [
        "Figma",
        "피그마",
        "Penpot",
        "펜팟",
        "Illustrator",
        "일러스트레이터",
        "Concepts",
        "컨셉트",
        "tldraw",
        "Excalidraw",
        "엑스칼리드로우",
        "Milanote",
        "밀라노트",
        "Canva",
        "캔바",
        "Framer",
        "프레이머",
        "Miro",
        "미로",
        "식자",
      ],
    },
    {
      id: "rive-harmony-animation-workflow",
      competitorFamily: "Rive · Toon Boom · Live2D",
      workspaceId: "animation",
      workspaceName: "애니메이션",
      summary: "애니메이션 작업을 시작할 배치를 추천합니다.",
      keyCapabilities: [
        "Rive 상태머신 스크롤/탭 트리거 · Spine/Live2D 2.5D 메쉬 디폼",
        "카메라 셰이크 · 패럴랙스 깊이 루프 · 효과음 모션 바운스",
        "Cascadeur AI 물리 보조 키프레임 · Mixamo 모션 리타게팅 · Lottie 경량 내보내기",
      ],
      recommendedRoles: ["effect-assistant", "character", "three-d"],
      searchAliases: [
        "Rive",
        "Toon Boom",
        "툰붐",
        "Harmony",
        "Moho",
        "Live2D",
        "라이브2D",
        "Spine",
        "스파인",
        "Cascadeur",
        "카스카데우르",
        "Mixamo",
        "믹사모",
        "Lottie",
        "LottieFiles",
        "로티",
        "Procreate Dreams",
        "무빙툰",
      ],
    },
    {
      id: "kitsu-linear-review-workflow",
      competitorFamily: "CGWire Kitsu · Linear",
      workspaceId: "review",
      workspaceName: "검수·피드백",
      summary: "검수와 피드백 작업을 위한 배치를 추천합니다.",
      keyCapabilities: [
        "8단계 직무별 작업분담·인계 계획 · 레이어 보호 항목 검토",
        "컷 핀포인트 레드라인 주석 · 8대 포털 출고 규격 프리플라이트",
        "Naver Webtoon/Tapas 연재 스크롤 템포 검증 · Cara/pixiv/ArtStation 포트폴리오 연동",
      ],
      recommendedRoles: ["editor", "producer", "reviewer", "planner"],
      searchAliases: [
        "Kitsu",
        "키츠",
        "Linear",
        "리니어",
        "Frame.io",
        "Naver Webtoon",
        "네이버 웹툰",
        "WEBTOON",
        "Tapas",
        "타파스",
        "pixiv",
        "픽시브",
        "ArtStation",
        "아트스테이션",
        "Cara",
        "카라",
        "Behance",
        "비핸스",
        "검수",
        "피드백",
        "PD",
        "편집자",
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
      ],
      localAstEvidenceId:
        "ev_a3be6e91d424a24d38daae948c6faaa879893d68975d24e9141800051660acaa",
      observedDomNodes: 19064,
      targetDomBudgetNodes: 3200,
      competitorServices: [
        "Naver Webtoon",
        "WEBTOON Global",
        "Tapas",
        "Ridibooks",
        "KakaoPage",
      ],
      internalizedCapabilitiesKo: [
        "네이버 웹툰(3,325 DOM)·타파스(1,247 DOM) 대비 /ranking(19,064 DOM) 뷰포트 가상화 및 점진적 하이드레이션 예산(3,200 DOM)",
        "요일·장르·독자반응(인기·급상승·완결) 1-Click 스티키 필터 바 및 에피소드 이어보기 미니 프리뷰",
      ],
      internalizedCapabilitiesEn: [
        "Viewport virtualization budget (19,064 -> 3,200 DOM nodes) benchmarked against Naver Webtoon (3,325) and Tapas (1,247)",
        "1-click sticky genre/day/momentum filter bar and instant episode resume preview",
      ],
    },
    {
      id: "asset-market",
      routePath: "/market",
      labelKo: "3D·브러시 소재 마켓",
      labelEn: "3D & Brush Asset Market",
      liveEvidenceIds: [
        "ev_b5a186c51bbddd771744e5631580103f6f1485832fb5675ba9eabf0799170638",
      ],
      localAstEvidenceId:
        "ev_0899d8abef2e8aa82b0c620b1593c9c907b6e3c9bd803978a8830d62bf768416",
      observedDomNodes: 3358,
      targetDomBudgetNodes: 2400,
      competitorServices: [
        "ACON3D (ABLE)",
        "Clip Studio Assets",
        "Sketchfab",
        "BOOTH",
        "Poly Haven",
        "3D Warehouse",
        "Daz 3D",
        "Marvelous Designer",
      ],
      internalizedCapabilitiesKo: [
        "ACON3D·Sketchfab·BOOTH 방식의 3D 배경·의상·포즈·브러시 호환성 배지 및 라이선스(개인·팀·상업) 즉시 검증",
        "구매·보관함 소재를 스튜디오 캔버스 및 3D 스테이징 브리지로 1-Click 드래그·주입",
      ],
      internalizedCapabilitiesEn: [
        "ACON3D/Sketchfab/BOOTH-style 3D background, cloth, pose, and brush compatibility badges with commercial license checks",
        "1-click direct asset injection from Market library into Studio 2D/3D canvas",
      ],
    },
    {
      id: "creator-community",
      routePath: "/community",
      labelKo: "크리에이터 커뮤니티·포트폴리오",
      labelEn: "Creator Community & Portfolio",
      liveEvidenceIds: [
        "ev_5a1988c7e160d0d48ea40b7cd850437d5dc0e5b5c16ea034db9fe2ffd0181753",
      ],
      localAstEvidenceId:
        "ev_a341840f8bc1245705456594726a8b6f377957933cb7639a2b61144b91c918b5",
      observedDomNodes: 1665,
      targetDomBudgetNodes: 1500,
      competitorServices: [
        "pixiv",
        "ArtStation",
        "Cara",
        "Behance",
        "Framer",
      ],
      internalizedCapabilitiesKo: [
        "Cara·ArtStation·pixiv 방식의 직무별(선화·채색·배경·콘티) WIP 타임랩스·포트폴리오 쇼케이스 및 구인 태그",
        "크리틱 핀포인트 피드백 및 No-AI/AI-보조 투명성 배지 표준화",
      ],
      internalizedCapabilitiesEn: [
        "Cara/ArtStation/pixiv-style role-tagged WIP timelapse showcase and studio recruitment badges",
        "Pinpoint critique feedback and transparent human/AI-assisted provenance badges",
      ],
    },
    {
      id: "realtime-collaboration",
      routePath: "/collaboration",
      labelKo: "실시간 공동작업·프로덕션 트래커",
      labelEn: "Realtime Collab & Production Tracker",
      liveEvidenceIds: [
        "ev_8cc995d978ee372c6fc173322cfbe97db3162b893701afe2c32e5de026329838",
      ],
      localAstEvidenceId:
        "ev_b307dc57511420db842bc5cb30417f7d3a68bf02e864b4398be0bfcf8ba5da69",
      observedDomNodes: 312,
      targetDomBudgetNodes: 900,
      competitorServices: [
        "Figma",
        "Penpot",
        "Miro",
        "Linear",
        "CGWire Kitsu",
        "Frame.io",
        "Notion",
      ],
      internalizedCapabilitiesKo: [
        "Figma·Miro 멀티플레이어 커서 및 CGWire Kitsu·Linear 스타일 8단계 에피소드 칸반·인계 체크리스트",
        "18개 레이어 RBAC 보호 가드 및 동시 작업자 레이어 충돌 0건 자동 검증",
      ],
      internalizedCapabilitiesEn: [
        "Figma/Miro multiplayer presence with CGWire Kitsu & Linear 8-stage episode handoff checklist",
        "18-layer RBAC guard and automated zero-conflict parallel role layer verification",
      ],
    },
    {
      id: "cuts-movingtoon",
      routePath: "/cuts",
      labelKo: "컷츠·무빙툰·인터랙티브 숏폼",
      labelEn: "Cuts · Moving-Toon · Interactive Shortform",
      liveEvidenceIds: [
        "ev_ccc63c67bd1d2d89db18ccf7ec30b5904f5392c9789f5fc31d4af947c6ec10c5",
      ],
      localAstEvidenceId:
        "ev_bc3046468eb8c1a385648a10fc50a69530963f61a7dc590b0f1b50f829eb6c05",
      observedDomNodes: 866,
      targetDomBudgetNodes: 1100,
      competitorServices: [
        "Rive",
        "Spine 2D/2.5D",
        "Live2D Cubism",
        "Toon Boom Harmony",
        "Cascadeur",
        "Adobe Mixamo",
        "LottieFiles",
      ],
      internalizedCapabilitiesKo: [
        "Rive·Spine·Live2D 기반 스크롤 반응형 패럴랙스 깊이 루프, 눈깜빡임·호흡 리깅 및 효과음 모션 바운스",
        "Cascadeur 물리 보조 키프레임·Mixamo 포즈 리타게팅 및 Lottie 경량 스티커/숏폼 출고",
      ],
      internalizedCapabilitiesEn: [
        "Rive/Spine/Live2D scroll-reactive parallax loops, breathing/blink rigging, and SFX motion bounce",
        "Cascadeur physics-assisted keyframes, Mixamo pose retargeting, and Lottie lightweight export",
      ],
    },
    {
      id: "creator-academy",
      routePath: "/learn",
      labelKo: "크리에이터 아카데미·스토리 설계",
      labelEn: "Creator Academy & Story Architecture",
      liveEvidenceIds: [
        "ev_b2c1de295db8e528573598b64cb93d2442bbe6fa880a5cdf038ff076aa55a094",
      ],
      localAstEvidenceId:
        "ev_0b76d1604a348b0ef3a548948dd4e2c260a9bd7627f0519621540a57daff8668",
      observedDomNodes: 1796,
      targetDomBudgetNodes: 1500,
      competitorServices: [
        "Campfire Writing",
        "Plottr",
        "World Anvil",
        "Scrivener",
        "Milanote",
        "Twine",
        "Wonder Unit Storyboarder",
        "Toon Boom Storyboard Pro",
      ],
      internalizedCapabilitiesKo: [
        "Plottr·Campfire·World Anvil·Scrivener 방식의 세계관 로어북·복선 타임라인 및 장르별(로판·회빙환·액션) 호흡 템플릿",
        "실습 튜토리얼에서 클릭 한 번으로 스튜디오 캔버스 예제 파일을 바로 여는 Interactive Sandbox",
      ],
      internalizedCapabilitiesEn: [
        "Plottr/Campfire/World Anvil/Scrivener lorebook, foreshadowing timeline, and genre pacing templates",
        "1-click Interactive Sandbox launching live Studio practice files directly from tutorials",
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
      ],
      localAstEvidenceId:
        "ev_11e9a870c7150275e95a351908db70aa7f5db2cf38b6a21bd819518113cb807b",
      observedDomNodes: 616,
      targetDomBudgetNodes: 950,
      competitorServices: [
        "Clip Studio Paint",
        "Krita",
        "MediBang Paint",
        "Procreate",
        "ibisPaint X",
        "Rebelle",
        "Affinity Designer",
        "Photopea",
        "Concepts App",
        "Aseprite",
        "Wacom Pen Displays",
        "Excalidraw",
        "tldraw",
        "Canva",
        "SketchUp for Web",
        "Blender Grease Pencil",
        "Three.js",
        "Babylon.js",
        "Spline",
        "Higgsfield Mangaka",
        "NovelAI",
        "Civitai",
        "Dashtoon Studio",
        "Caravel",
        "Carapace",
        "Comic Life 3",
        "Jump Paint",
      ],
      internalizedCapabilitiesKo: [
        "Affinity 페르소나 전환 + Procreate Zen 모드(캔버스 86%) + CSP/Krita/Rebelle 브러시·채색 + SketchUp/Blender 3D LT 추출 통합",
        "Higgsfield Mangaka 6인 캐릭터 시트 잠금·모바일 스크롤 열지도 미니맵 및 15개 세부직무 인지 부하 47~58% 절감",
      ],
      internalizedCapabilitiesEn: [
        "Affinity Persona switching + Procreate Zen mode (86% canvas) + CSP/Krita/Rebelle painting + SketchUp/Blender 3D LT extraction",
        "Higgsfield Mangaka 6-character lock, mobile scroll heatmap minimap, and 47-58% cognitive load reduction across 15 sub-roles",
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
