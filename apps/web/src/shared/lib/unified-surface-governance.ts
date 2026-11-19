/**
 * UI/UX v2 표면 통합 거버넌스 단일 계약 (AC-020 / PRODUCT.md §3 · DESIGN.md §5).
 *
 * 1) 28개 /research/* 기관 경로 -> 5대 용도별 통합 핀보드 필터 무손실 투영
 * 2) 프로젝트 워크스페이스 -> 기본 6탭 + 팀원 합류 시 일정·공정 칸반 점진 확장
 * 3) Admin 16개 기능 -> 4대 운영 도메인 아코디언 그룹화
 */

export type ResearchPinboardCategory =
  | "era-history"
  | "architecture-3d"
  | "costume-props"
  | "lighting-weather"
  | "cc0-commercial";

export interface ResearchPinboardProjection {
  readonly category: ResearchPinboardCategory;
  readonly labelKo: string;
  readonly legacySourceSlug: string;
  readonly canonicalHref: string;
}

const RESEARCH_CATEGORY_LABELS: Record<ResearchPinboardCategory, string> = {
  "era-history": "시대/고증",
  "architecture-3d": "건축/3D",
  "costume-props": "복식/소품",
  "lighting-weather": "조명/날씨",
  "cc0-commercial": "CC0 상업무료",
};

/** 기존 /research/<institution> 경로를 통합 핀보드 필터 쿼리로 무손실 투영한다. */
export function resolveResearchPinboardFilter(legacyPath: string): ResearchPinboardProjection {
  const slug = legacyPath
    .replace(/^\/+research\/?/i, "")
    .replace(/\/+$/u, "")
    .trim()
    .toLowerCase();

  let category: ResearchPinboardCategory = "era-history";
  if (/architecture|3d|sketch|cad|building|interior|museum-3d|smithsonian/i.test(slug)) {
    category = "architecture-3d";
  } else if (/costume|fashion|hanbok|prop|weapon|artifact|met|rijk/i.test(slug)) {
    category = "costume-props";
  } else if (/light|weather|sky|hdri|ambient|polyhaven/i.test(slug)) {
    category = "lighting-weather";
  } else if (/cc0|public-domain|wikimedia|openverse|free/i.test(slug)) {
    category = "cc0-commercial";
  }

  const params = new URLSearchParams({ category });
  if (slug) params.set("source", slug);

  return Object.freeze({
    category,
    labelKo: RESEARCH_CATEGORY_LABELS[category],
    legacySourceSlug: slug || "all",
    canonicalHref: `/research?${params.toString()}`,
  });
}

export interface ProjectWorkspaceTabSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly teamOnly: boolean;
}

const BASE_PROJECT_TABS: readonly ProjectWorkspaceTabSpec[] = [
  { id: "overview", labelKo: "개요", teamOnly: false },
  { id: "episodes", labelKo: "회차 원고", teamOnly: false },
  { id: "assets", labelKo: "소재·3D", teamOnly: false },
  { id: "world", labelKo: "설정·캐릭터", teamOnly: false },
  { id: "review", labelKo: "검수·피드백", teamOnly: false },
  { id: "export", labelKo: "프리플라이트·출고", teamOnly: false },
  { id: "schedule", labelKo: "팀 일정", teamOnly: true },
  { id: "kanban", labelKo: "공정 칸반·인계", teamOnly: true },
];

/** 1인 작가는 기본 6탭, 팀원 합류(memberCount > 1) 시 일정·공정 칸반을 점진 확장한다. */
export function resolveProjectWorkspaceTabs(memberCount: number): readonly ProjectWorkspaceTabSpec[] {
  const isTeam = Number.isFinite(memberCount) && memberCount > 1;
  return BASE_PROJECT_TABS.filter((tab) => !tab.teamOnly || isTeam);
}

export interface AdminDomainAccordionGroup {
  readonly id: "live-metrics" | "members-safety" | "billing-settlement" | "ops-security";
  readonly titleKo: string;
  readonly tabKeys: readonly string[];
}

export const ADMIN_FOUR_DOMAIN_GROUPS: readonly AdminDomainAccordionGroup[] = Object.freeze([
  {
    id: "live-metrics",
    titleKo: "실시간 지표 · 트래픽",
    tabKeys: ["dashboard", "traffic", "catalog-snapshots", "ranking-health"],
  },
  {
    id: "members-safety",
    titleKo: "회원 · 커뮤니티 · 신고",
    tabKeys: ["users", "reports", "community-moderation", "creator-verification"],
  },
  {
    id: "billing-settlement",
    titleKo: "요금 · 정산 · 후원",
    tabKeys: ["plans", "settlements", "supporters", "market-payouts"],
  },
  {
    id: "ops-security",
    titleKo: "운영모드 · 보안 · 감사",
    tabKeys: ["operation-policy", "feature-flags", "audit-logs", "security-access"],
  },
]);
