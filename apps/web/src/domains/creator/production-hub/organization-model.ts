import type { TeamWorkspaceSummary } from "@toonstudio/contracts/production-workspace";

/**
 * 조직(회사·스튜디오) 단위 로컬 모델.
 *
 * 조직 서버 계약이 아직 없으므로 1차 구현의 경계는 이 모듈의 주석이 정본이다.
 * - 조직 프로필·연결 워크스페이스·공지는 소유자 스코프로 이 기기에만 저장한다.
 * - 롤업 수치는 서버가 준 워크스페이스 카운터만 합산한다. 클라이언트가 지어내지 않는다.
 * - 조직 소속은 어떤 자원 접근도 새로 만들지 않는다. 접근 강제는 기존 워크스페이스·
 *   작품 권한이 정본이다 (팀 소속만으로 원고를 열 수 없는 기존 원칙의 조직 확장).
 * - 서버 계약이 생기면 organization-directory의 구현체만 API로 교체한다.
 */

export type OrganizationKind = "company" | "studio" | "team-circle";
export type OrganizationRole = "owner" | "admin" | "manager" | "member" | "guest";
export type OrganizationAction = "edit-profile" | "manage-links" | "post-notice" | "view-rollup";

export interface OrganizationProfile {
  readonly id: string;
  readonly name: string;
  readonly kind: OrganizationKind;
  readonly description: string;
  readonly ownerUserId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OrganizationNotice {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
}

/** 로컬 조직 상태 전체. 서버 조직 상세 응답이 생기면 이 모양을 응답 계약으로 승격한다. */
export interface LocalOrganizationState {
  readonly profile: OrganizationProfile | null;
  readonly linkedWorkspaceIds: readonly string[];
  readonly notices: readonly OrganizationNotice[];
}

export const EMPTY_ORGANIZATION_STATE: LocalOrganizationState = {
  profile: null,
  linkedWorkspaceIds: [],
  notices: [],
};

export const ORGANIZATION_KIND_LABELS: Record<OrganizationKind, { readonly ko: string; readonly en: string }> = {
  company: { ko: "회사", en: "Company" },
  studio: { ko: "제작 스튜디오", en: "Production studio" },
  "team-circle": { ko: "작가 팀·서클", en: "Creator team / circle" },
};

export const ORGANIZATION_ROLE_LABELS: Record<OrganizationRole, { readonly ko: string; readonly en: string }> = {
  owner: { ko: "대표", en: "Owner" },
  admin: { ko: "운영 관리자", en: "Admin" },
  manager: { ko: "매니저·PD", en: "Manager" },
  member: { ko: "소속 구성원", en: "Member" },
  guest: { ko: "외부 게스트", en: "Guest" },
};

interface OrganizationRoleRow {
  readonly role: OrganizationRole;
  readonly actions: readonly OrganizationAction[];
}

/**
 * 조직 역할 매트릭스. 조직 역할은 조직 표면(프로필·연결·공지·롤업)에 대한 권한일 뿐
 * 워크스페이스/작품 접근권이 아니며, 서버 강제 위치는 조직 계약이 생긴 뒤의 조직 서버다.
 * guest는 공개 프로필만 보므로 롤업 열람에도 포함하지 않는다.
 */
export const ORGANIZATION_ROLE_MATRIX: readonly OrganizationRoleRow[] = [
  { role: "owner", actions: ["edit-profile", "manage-links", "post-notice", "view-rollup"] },
  { role: "admin", actions: ["edit-profile", "manage-links", "post-notice", "view-rollup"] },
  { role: "manager", actions: ["post-notice", "view-rollup"] },
  { role: "member", actions: ["view-rollup"] },
  { role: "guest", actions: [] },
];

export function organizationRoleCan(role: OrganizationRole, action: OrganizationAction): boolean {
  return ORGANIZATION_ROLE_MATRIX.some((row) => row.role === role && row.actions.includes(action));
}

const STORAGE_PREFIX = "toonstudio.organization.v1:";

export function organizationStorageKey(ownerUserId: string): string {
  return `${STORAGE_PREFIX}${ownerUserId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readKind(value: unknown): OrganizationKind {
  return value === "company" || value === "team-circle" ? value : "studio";
}

function normalizeProfile(value: unknown, ownerUserId: string): OrganizationProfile | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const name = readString(value.name).trim();
  if (!id || !name) return null;
  // 다른 소유자의 프로필이 섞여 들어오면 버린다. 조직 상태는 소유자 스코프가 정본이다.
  if (readString(value.ownerUserId) !== ownerUserId) return null;
  return {
    id,
    name,
    kind: readKind(value.kind),
    description: readString(value.description),
    ownerUserId,
    createdAt: readString(value.createdAt),
    updatedAt: readString(value.updatedAt),
  };
}

function normalizeNotice(value: unknown): OrganizationNotice | null {
  if (!isRecord(value)) return null;
  const id = readString(value.id);
  const body = readString(value.body).trim();
  if (!id || !body) return null;
  return { id, body, createdAt: readString(value.createdAt) };
}

function normalizeIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === "string" && item.trim()) seen.add(item);
  }
  return [...seen];
}

/** 깨진 저장값은 조용히 빈 상태로 되돌린다. 부분적으로라도 읽히는 필드는 살린다. */
export function parseLocalOrganizationState(raw: string | null, ownerUserId: string): LocalOrganizationState {
  if (!raw) return EMPTY_ORGANIZATION_STATE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_ORGANIZATION_STATE;
  }
  if (!isRecord(parsed)) return EMPTY_ORGANIZATION_STATE;
  const notices = Array.isArray(parsed.notices)
    ? parsed.notices.map(normalizeNotice).filter((notice): notice is OrganizationNotice => notice !== null)
    : [];
  return {
    profile: normalizeProfile(parsed.profile, ownerUserId),
    linkedWorkspaceIds: normalizeIds(parsed.linkedWorkspaceIds),
    notices,
  };
}

export function serializeLocalOrganizationState(state: LocalOrganizationState): string {
  return JSON.stringify(state);
}

export function createOrganizationProfile(
  input: { readonly name: string; readonly kind: OrganizationKind; readonly description: string },
  ownerUserId: string,
  now: Date,
  id: string,
): OrganizationProfile {
  const timestamp = now.toISOString();
  return {
    id,
    name: input.name.trim(),
    kind: input.kind,
    description: input.description.trim(),
    ownerUserId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function toggleLinkedWorkspace(state: LocalOrganizationState, workspaceId: string, linked: boolean): LocalOrganizationState {
  const has = state.linkedWorkspaceIds.includes(workspaceId);
  if (linked === has) return state;
  return {
    ...state,
    linkedWorkspaceIds: linked
      ? [...state.linkedWorkspaceIds, workspaceId]
      : state.linkedWorkspaceIds.filter((id) => id !== workspaceId),
  };
}

export interface OrganizationRollup {
  /** 연결 목록에 있고 서버 목록에서도 확인되는 팀. */
  readonly teams: readonly TeamWorkspaceSummary[];
  /** 연결했지만 현재 서버 목록에 없는 팀 수 (나갔거나 삭제된 팀). */
  readonly missingCount: number;
  /** 연결 팀들의 연결 작품 수 합산 (서버 카운터 기준). */
  readonly projectCount: number;
  /** 연결 팀들의 구성원 수 합산. 사람 단위 중복 제거가 아니므로 "팀별 구성원 합"으로 표기한다. */
  readonly memberSlotCount: number;
  /** 연결 팀들의 대기 초대 수 합산. */
  readonly pendingInvites: number;
}

/** 조직 롤업은 연결된 팀의 서버 카운터만 합산한다. 연결되지 않은 팀은 조직 수치에 넣지 않는다. */
export function summarizeOrganizationRollup(
  workspaces: readonly TeamWorkspaceSummary[],
  linkedWorkspaceIds: readonly string[],
): OrganizationRollup {
  const linked = new Set(linkedWorkspaceIds);
  const teams = workspaces.filter((workspace) => linked.has(workspace.id));
  return {
    teams,
    missingCount: linkedWorkspaceIds.length - teams.length,
    projectCount: teams.reduce((sum, team) => sum + team.projectCount, 0),
    memberSlotCount: teams.reduce((sum, team) => sum + team.memberCount, 0),
    pendingInvites: teams.reduce((sum, team) => sum + team.pendingInvites, 0),
  };
}
