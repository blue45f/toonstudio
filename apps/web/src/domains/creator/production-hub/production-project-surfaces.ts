/**
 * 제작 프로젝트의 탭(화면) 정보 구조.
 *
 * 자주 쓰는 다섯 화면(개요·공정 보드·회차·원고·검수)을 앞에 두고 나머지는 "더보기"에 모은다.
 * 각 화면은 한 줄 설명과 "다음 단계" 행동 하나를 가진다. 다음 단계는 제작 흐름
 * (개요 → 공정 보드 → 회차 룸 → 원고 비교 → 검수 → 게시)으로 자연스럽게 이어지도록 고른다.
 */
import {
  Activity,
  BookOpenText,
  BriefcaseBusiness,
  CalendarClock,
  ClipboardCheck,
  GitBranch,
  Handshake,
  Kanban,
  Layers3,
  LayoutDashboard,
  PanelTopOpen,
  Scale,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { BilingualLabel } from "./production-labels";

export type ProductionProjectSurface =
  | "overview"
  | "planning"
  | "episodes"
  | "manuscripts"
  | "production"
  | "schedule"
  | "control"
  | "handoff"
  | "review"
  | "activity"
  | "procurement"
  | "rights"
  | "settings";

/** 다음 단계 링크. 화면 id 또는 프로젝트 밖 절대 경로. */
export type ProductionSurfaceTarget =
  | { readonly kind: "surface"; readonly surface: ProductionProjectSurface; readonly query?: string }
  | { readonly kind: "episode-room" }
  | { readonly kind: "path"; readonly path: string };

/**
 * 더보기 화면의 작업 단계 그룹. 여덟 화면을 평면으로 나열하면 고르기 전에 전부 훑어야 해서,
 * "무슨 일을 하려는가" 기준으로 세 묶음으로 나눈다 — 1차 결정은 묶음 셋 중 하나다.
 */
export type ProductionMoreGroup = "prepare" | "together" | "operations";

export const PRODUCTION_MORE_GROUP_LABELS: Readonly<Record<ProductionMoreGroup, BilingualLabel>> = Object.freeze({
  prepare: { ko: "준비", en: "Prepare" },
  together: { ko: "함께 일하기", en: "Work together" },
  operations: { ko: "운영·계약", en: "Operations & contracts" },
});

export const PRODUCTION_MORE_GROUP_ORDER: readonly ProductionMoreGroup[] = Object.freeze([
  "prepare",
  "together",
  "operations",
]);

export interface ProductionSurfaceDefinition {
  readonly id: ProductionProjectSurface;
  readonly label: BilingualLabel;
  readonly description: BilingualLabel;
  readonly icon: LucideIcon;
  readonly core: boolean;
  /** 핵심 화면이 아닌 경우 속하는 작업 단계 그룹. 핵심 화면은 null. */
  readonly moreGroup: ProductionMoreGroup | null;
  readonly next: { readonly label: BilingualLabel; readonly target: ProductionSurfaceTarget };
}

type SurfaceContent = Omit<ProductionSurfaceDefinition, "id" | "moreGroup">;

const MORE_GROUP_BY_SURFACE: Readonly<Partial<Record<ProductionProjectSurface, ProductionMoreGroup>>> = Object.freeze({
  planning: "prepare",
  schedule: "prepare",
  handoff: "together",
  activity: "together",
  settings: "together",
  control: "operations",
  procurement: "operations",
  rights: "operations",
});

const SURFACE_CONTENT: Readonly<Record<ProductionProjectSurface, SurfaceContent>> = Object.freeze({
  overview: {
    core: true,
    icon: LayoutDashboard,
    label: { ko: "개요", en: "Overview" },
    description: { ko: "진행률·마감 임박 회차·내 할 일·최근 피드백을 한눈에 봅니다.", en: "Progress, upcoming episodes, your tasks and recent feedback at a glance." },
    next: { label: { ko: "공정 보드 열기", en: "Open the board" }, target: { kind: "surface", surface: "production" } },
  },
  production: {
    core: true,
    icon: Kanban,
    label: { ko: "공정 보드", en: "Board" },
    description: { ko: "콘티부터 식자까지 공정별 담당·마감·상태를 옮기며 관리합니다.", en: "Move work through each process with owners, due dates and status." },
    next: { label: { ko: "회차 룸에서 원고 보기", en: "Open the episode room" }, target: { kind: "episode-room" } },
  },
  episodes: {
    core: true,
    icon: PanelTopOpen,
    label: { ko: "회차", en: "Episodes" },
    description: { ko: "회차별 공정 진행, 게시 마감, 남은 작업량을 비교합니다.", en: "Compare process progress, release dates and remaining work per episode." },
    next: { label: { ko: "가장 급한 회차 룸", en: "Most urgent episode room" }, target: { kind: "episode-room" } },
  },
  manuscripts: {
    core: true,
    icon: Layers3,
    label: { ko: "원고·버전", en: "Manuscripts" },
    description: { ko: "공정별 원고의 최신본·최종본·버전 비교와 공유를 관리합니다.", en: "Latest and final versions, comparisons and sharing for every process." },
    next: { label: { ko: "검수로 이동", en: "Go to review" }, target: { kind: "surface", surface: "review" } },
  },
  review: {
    core: true,
    icon: ClipboardCheck,
    label: { ko: "검수", en: "Review" },
    description: { ko: "원고 위 핀 코멘트, 역할별 승인, 게시를 막는 수정 요청을 확인합니다.", en: "Pinned comments, approvals per role and changes that block publishing." },
    next: { label: { ko: "게시 센터로 이동", en: "Go to the publish center" }, target: { kind: "path", path: "/studio/publish" } },
  },
  activity: {
    core: false,
    icon: Activity,
    label: { ko: "활동", en: "Activity" },
    description: { ko: "누가 언제 무엇을 바꿨는지, 프로젝트의 모든 변경 기록을 봅니다.", en: "Who changed what, and when — the full record of project changes." },
    next: { label: { ko: "개요로 돌아가기", en: "Back to overview" }, target: { kind: "surface", surface: "overview" } },
  },
  planning: {
    core: false,
    icon: BookOpenText,
    label: { ko: "기획", en: "Planning" },
    description: { ko: "작품·시즌·회차·장면 기준을 최신 버전으로 정리합니다.", en: "Keep series, season, episode and scene plans current." },
    next: { label: { ko: "회차 진행 보기", en: "See episodes" }, target: { kind: "surface", surface: "episodes" } },
  },
  schedule: {
    core: false,
    icon: CalendarClock,
    label: { ko: "일정", en: "Schedule" },
    description: { ko: "마감과 작업량을 보고 일정을 다시 배치합니다.", en: "Check deadlines and workload, then rebalance." },
    next: { label: { ko: "막힌 작업 보기", en: "See blocked work" }, target: { kind: "surface", surface: "production", query: "boardFocus=blocked" } },
  },
  control: {
    core: false,
    icon: GitBranch,
    label: { ko: "운영", en: "Operations" },
    description: { ko: "마감을 좌우하는 핵심 작업·연재 계획·자동화·위험 대응을 관리합니다.", en: "The deadline-critical work, release plans, automation and risk response." },
    next: { label: { ko: "일정 확인", en: "Check the schedule" }, target: { kind: "surface", surface: "schedule" } },
  },
  handoff: {
    core: false,
    icon: Handshake,
    label: { ko: "인계", en: "Handoff" },
    description: { ko: "다음 작업자가 꼭 지킬 내용과 막힌 질문을 정리합니다.", en: "What the next artist must keep, and open questions." },
    next: { label: { ko: "회차 룸에서 답하기", en: "Answer in the episode room" }, target: { kind: "episode-room" } },
  },
  procurement: {
    core: false,
    icon: BriefcaseBusiness,
    label: { ko: "외주 맡기기", en: "Outsourcing" },
    description: { ko: "외주 범위·제안·계약·납품 상태를 따로 기록합니다.", en: "Scope, proposals, contracts and deliveries for outside work." },
    next: { label: { ko: "구인·의뢰 게시판", en: "Hiring board" }, target: { kind: "path", path: "/collaborate" } },
  },
  rights: {
    core: false,
    icon: Scale,
    label: { ko: "계약·정산", en: "Rights & pay" },
    description: { ko: "공개 크레딧·권리 동의·보상 기준을 계약 버전과 함께 확인합니다.", en: "Credits, rights consent and compensation tied to contract versions." },
    next: { label: { ko: "외주 계약 보기", en: "See outsourcing contracts" }, target: { kind: "surface", surface: "procurement" } },
  },
  settings: {
    core: false,
    icon: Users,
    label: { ko: "팀 설정", en: "Team" },
    description: { ko: "참여자와 역할, 각 역할이 할 수 있는 일을 확인합니다.", en: "Members, roles and what each role can do." },
    next: { label: { ko: "사람·권한 관리", en: "Manage people & access" }, target: { kind: "path", path: "/team/people" } },
  },
});

/** 화면 순서: 핵심 다섯 개가 먼저, 나머지는 더보기. */
const SURFACE_ORDER: readonly ProductionProjectSurface[] = Object.freeze([
  "overview",
  "production",
  "episodes",
  "manuscripts",
  "review",
  "activity",
  "planning",
  "schedule",
  "control",
  "handoff",
  "procurement",
  "rights",
  "settings",
]);

export const PRODUCTION_SURFACES: readonly ProductionSurfaceDefinition[] = Object.freeze(
  SURFACE_ORDER.map((id) => ({ id, ...SURFACE_CONTENT[id], moreGroup: MORE_GROUP_BY_SURFACE[id] ?? null })),
);

export const PRODUCTION_CORE_SURFACES = PRODUCTION_SURFACES.filter((surface) => surface.core);
export const PRODUCTION_MORE_SURFACES = PRODUCTION_SURFACES.filter((surface) => !surface.core);

/** 더보기 화면을 작업 단계 그룹 순서로 묶은 목록. 그룹 안 순서는 표면 순서를 따른다. */
export const PRODUCTION_MORE_GROUPS: readonly {
  readonly group: ProductionMoreGroup;
  readonly label: BilingualLabel;
  readonly surfaces: readonly ProductionSurfaceDefinition[];
}[] = Object.freeze(
  PRODUCTION_MORE_GROUP_ORDER.map((group) => ({
    group,
    label: PRODUCTION_MORE_GROUP_LABELS[group],
    surfaces: PRODUCTION_MORE_SURFACES.filter((surface) => surface.moreGroup === group),
  })).filter((entry) => entry.surfaces.length > 0),
);

export function productionSurfaceDefinition(id: ProductionProjectSurface): ProductionSurfaceDefinition {
  return { id, ...SURFACE_CONTENT[id], moreGroup: MORE_GROUP_BY_SURFACE[id] ?? null };
}

export function productionSurfacePath(projectId: string, surface: ProductionProjectSurface, query?: string): string {
  const base = `/production/projects/${encodeURIComponent(projectId)}/${surface}`;
  return query ? `${base}?${query}` : base;
}

export function productionEpisodeRoomPath(projectId: string, episodeId: string): string {
  return `/production/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}`;
}

/**
 * 회차 제작 단계 — 기획→콘티→작화→식자·연출→검수→게시→운영.
 * 파이프라인 레일·인계 카드·프로젝트 내비가 공유하는 순서 정본이다.
 * 단계를 새로 만들지 않고, 순서와 명칭은 여기서만 정한다.
 */
export type EpisodeStageId =
  | "plan"
  | "storyboard"
  | "art"
  | "lettering"
  | "review"
  | "publish"
  | "operate";

export interface EpisodeStageDefinition {
  readonly id: EpisodeStageId;
  readonly label: BilingualLabel;
  /** 그 단계에서 가장 먼저 할 일 — 레일의 다음 행동과 내비의 대리 진입에 쓴다. */
  readonly primaryAction: {
    readonly label: BilingualLabel;
    readonly target: ProductionSurfaceTarget;
  };
}

const EPISODE_STAGE_CONTENT: Readonly<Record<EpisodeStageId, Omit<EpisodeStageDefinition, "id">>> =
  Object.freeze({
    plan: {
      label: { ko: "기획", en: "Planning" },
      primaryAction: {
        label: { ko: "기획 보기", en: "See the plan" },
        target: { kind: "surface", surface: "planning" },
      },
    },
    storyboard: {
      label: { ko: "콘티", en: "Storyboard" },
      primaryAction: {
        label: { ko: "공정 보드 열기", en: "Open the board" },
        target: { kind: "surface", surface: "production" },
      },
    },
    art: {
      label: { ko: "작화", en: "Artwork" },
      primaryAction: {
        label: { ko: "원고 보기", en: "See the artwork" },
        target: { kind: "surface", surface: "manuscripts" },
      },
    },
    lettering: {
      label: { ko: "식자·연출", en: "Lettering" },
      primaryAction: {
        label: { ko: "원고 확인하기", en: "Check the lettering" },
        target: { kind: "surface", surface: "manuscripts" },
      },
    },
    review: {
      label: { ko: "검수", en: "Review" },
      primaryAction: {
        label: { ko: "검수 보기", en: "See the review" },
        target: { kind: "surface", surface: "review" },
      },
    },
    publish: {
      label: { ko: "게시", en: "Publish" },
      primaryAction: {
        label: { ko: "게시 명령 센터 열기", en: "Open the publish center" },
        target: { kind: "path", path: "/studio/publish" },
      },
    },
    operate: {
      label: { ko: "운영", en: "Operate" },
      primaryAction: {
        label: { ko: "회차 운영 보기", en: "See episode operations" },
        target: { kind: "surface", surface: "episodes" },
      },
    },
  });

/** 단계 순서 — 레일 정렬·인계 이전 단계 판정·내비 그룹 순서의 단일 정본. */
export const EPISODE_STAGE_ORDER: readonly EpisodeStageId[] = Object.freeze([
  "plan",
  "storyboard",
  "art",
  "lettering",
  "review",
  "publish",
  "operate",
]);

export const EPISODE_STAGES: readonly EpisodeStageDefinition[] = Object.freeze(
  EPISODE_STAGE_ORDER.map((id) => ({ id, ...EPISODE_STAGE_CONTENT[id] })),
);

export function episodeStageDefinition(id: EpisodeStageId): EpisodeStageDefinition {
  const definition = EPISODE_STAGES.find((stage) => stage.id === id);
  if (!definition) throw new Error(`Unknown episode stage: ${id}`);
  return definition;
}

/** 내비 그룹 id — 일곱 단계 또는 관리 묶음. */
export type ProductionNavGroupId = EpisodeStageId | "management";

export interface ProductionNavStageGroup {
  readonly id: EpisodeStageId;
  readonly stage: EpisodeStageDefinition;
  /** 이 단계 그룹에 직접 들어가는 화면. 전용 화면이 없는 단계는 빈 배열이다. */
  readonly surfaces: readonly ProductionSurfaceDefinition[];
}

export interface ProductionNavModel {
  /** 개요는 그룹에 속하지 않고 상단에 고정된다. */
  readonly overview: ProductionSurfaceDefinition;
  readonly stageGroups: readonly ProductionNavStageGroup[];
  readonly managementLabel: BilingualLabel;
  readonly managementSurfaces: readonly ProductionSurfaceDefinition[];
}

/** 단계별 소속 화면 — 모든 화면이 정확히 한 곳에만 든다(개요·관리 제외). */
const NAV_SURFACES_BY_STAGE: Readonly<Record<EpisodeStageId, readonly ProductionProjectSurface[]>> =
  Object.freeze({
    plan: Object.freeze<readonly ProductionProjectSurface[]>(["planning"]),
    storyboard: Object.freeze<readonly ProductionProjectSurface[]>(["production"]),
    art: Object.freeze<readonly ProductionProjectSurface[]>(["manuscripts"]),
    lettering: Object.freeze<readonly ProductionProjectSurface[]>([]),
    review: Object.freeze<readonly ProductionProjectSurface[]>(["review", "handoff"]),
    publish: Object.freeze<readonly ProductionProjectSurface[]>([]),
    operate: Object.freeze<readonly ProductionProjectSurface[]>(["episodes", "control", "activity", "schedule"]),
  });

const NAV_MANAGEMENT_SURFACES: readonly ProductionProjectSurface[] = Object.freeze([
  "procurement",
  "rights",
  "settings",
]);

export const PRODUCTION_NAV_MODEL: ProductionNavModel = Object.freeze({
  overview: productionSurfaceDefinition("overview"),
  stageGroups: Object.freeze(
    EPISODE_STAGE_ORDER.map((id) =>
      Object.freeze({
        id,
        stage: episodeStageDefinition(id),
        surfaces: Object.freeze(NAV_SURFACES_BY_STAGE[id].map((surface) => productionSurfaceDefinition(surface))),
      }),
    ),
  ),
  managementLabel: Object.freeze({ ko: "관리", en: "Management" }),
  managementSurfaces: Object.freeze(NAV_MANAGEMENT_SURFACES.map((surface) => productionSurfaceDefinition(surface))),
});

/** 화면이 속한 내비 그룹. 개요는 고정이라 그룹이 없다. */
export function productionNavGroupIdForSurface(surface: ProductionProjectSurface): ProductionNavGroupId | null {
  if (surface === "overview") return null;
  for (const stageId of EPISODE_STAGE_ORDER) {
    if (NAV_SURFACES_BY_STAGE[stageId].includes(surface)) return stageId;
  }
  return "management";
}

/** 처음 펼칠 내비 그룹 — 지금 단계가 있으면 그 단계, 없으면 활성 화면의 그룹, 그것도 없으면 기획. */
export function productionNavInitialOpenGroup(
  currentStageId?: EpisodeStageId | null,
  activeSurface?: ProductionProjectSurface | null,
): ProductionNavGroupId {
  if (currentStageId) return currentStageId;
  if (activeSurface) return productionNavGroupIdForSurface(activeSurface) ?? "plan";
  return "plan";
}
