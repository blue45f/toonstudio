import {
  FREE_USAGE_POLICY,
  type FreeUsagePolicy,
  type TeamWorkspaceSummary,
  type WorkspaceUsageResponse,
} from "@toonstudio/contracts/production-workspace";

/**
 * 조직 단위 사용량·좌석 풀 "미리보기" 모델.
 *
 * 경계 (org 검토 축6이 정본):
 * - 실제 한도는 지금도 워크스페이스(팀) 단위 정책(FREE_USAGE_POLICY)이 강제한다.
 *   조직 단위 합산 한도·좌석 배분·포인트 풀은 서버 정책이 없어 존재하지 않는다.
 * - 이 모델은 그 없는 것을 있는 척하지 않는다. 연결 팀의 서버 카운터를 합산해
 *   "조직 좌석 풀이라면 이만큼 차 있다"는 미리보기만 계산하며, enforcement는
 *   항상 "preview-only"다. 좌석 풀 수치는 어떤 강제·차단·과금에도 쓰지 않는다.
 * - 좌석 사용량은 팀 사용량 화면과 같은 정의를 쓴다: 구성원 + 대기 초대
 *   (대기 초대가 구성원 한도에 산입되는 것이 현행 정책이다).
 * - 원고 저장량은 미측정(not-instrumented)이 정본이라 0으로 위장하지 않고
 *   storageMetered=false로 드러낸다.
 */

export type SeatPoolStatus = "available" | "near-full" | "full" | "over";

export interface TeamSeatUsage {
  readonly workspaceId: string;
  readonly name: string;
  readonly members: number;
  readonly pendingInvites: number;
  /** 구성원 + 대기 초대. 팀 한도에 실제로 산입되는 좌석 사용량. */
  readonly seatsUsed: number;
  readonly seatLimit: number;
  readonly seatsLeft: number;
  readonly projectsUsed: number;
  readonly projectLimit: number;
  readonly status: SeatPoolStatus;
  /** usage: 팀 사용량 API 카운터 기준 / summary: 팀 목록 요약 카운터 기준(폴백). */
  readonly source: "usage" | "summary";
}

export interface OrganizationUsagePreview {
  /** 좌석 풀은 강제 수단이 아니라 미리보기 개념이다. */
  readonly enforcement: "preview-only";
  readonly teamCount: number;
  readonly teams: readonly TeamSeatUsage[];
  /** 조직 좌석 풀 미리보기: 연결 팀 한도의 단순 합. */
  readonly seatCapacity: number;
  readonly seatsUsed: number;
  readonly seatsLeft: number;
  readonly membersTotal: number;
  readonly pendingInvitesTotal: number;
  readonly projectCapacity: number;
  readonly projectsUsed: number;
  readonly projectsLeft: number;
  readonly status: SeatPoolStatus;
  readonly policyVersion: string;
  /** 사용량 상세를 불러온 팀이 있을 때만 채워진다. 없으면 null — 지어내지 않는다. */
  readonly operationMode: "free" | "paid" | null;
  /** 원고 저장량은 아직 측정되지 않는다. 0이 아니다. */
  readonly storageMetered: false;
}

export function seatStatus(seatsUsed: number, seatLimit: number): SeatPoolStatus {
  if (seatLimit <= 0) return seatsUsed > 0 ? "over" : "available";
  if (seatsUsed > seatLimit) return "over";
  if (seatsUsed === seatLimit) return "full";
  if (seatsUsed / seatLimit >= 0.8) return "near-full";
  return "available";
}

function teamSeatUsage(
  team: TeamWorkspaceSummary,
  usage: WorkspaceUsageResponse | undefined,
  policy: FreeUsagePolicy,
): TeamSeatUsage {
  const members = usage ? usage.counters.members : team.memberCount;
  const pendingInvites = usage ? usage.counters.pendingInvites : team.pendingInvites;
  const projectsUsed = usage ? usage.counters.projects : team.projectCount;
  const seatsUsed = members + pendingInvites;
  const seatLimit = usage ? usage.policy.membersPerWorkspace : policy.membersPerWorkspace;
  const projectLimit = usage ? usage.policy.projectsPerWorkspace : policy.projectsPerWorkspace;
  return {
    workspaceId: team.id,
    name: team.name,
    members,
    pendingInvites,
    seatsUsed,
    seatLimit,
    seatsLeft: Math.max(0, seatLimit - seatsUsed),
    projectsUsed,
    projectLimit,
    status: seatStatus(seatsUsed, seatLimit),
    source: usage ? "usage" : "summary",
  };
}

/**
 * 연결 팀 합산 미리보기. usages에 없는 팀은 요약 카운터로 폴백하고 source로 구분한다.
 * 정책은 사용량 응답이 준 정책을 우선하고, 없으면 contracts 정본 상수를 쓴다.
 */
export function buildOrganizationUsagePreview(
  teams: readonly TeamWorkspaceSummary[],
  usages: ReadonlyMap<string, WorkspaceUsageResponse> = new Map(),
  policy: FreeUsagePolicy = FREE_USAGE_POLICY,
): OrganizationUsagePreview {
  const rows = teams.map((team) => teamSeatUsage(team, usages.get(team.id), policy));
  const seatCapacity = rows.reduce((sum, row) => sum + row.seatLimit, 0);
  const seatsUsed = rows.reduce((sum, row) => sum + row.seatsUsed, 0);
  const projectCapacity = rows.reduce((sum, row) => sum + row.projectLimit, 0);
  const projectsUsed = rows.reduce((sum, row) => sum + row.projectsUsed, 0);
  const firstUsage = teams.map((team) => usages.get(team.id)).find((usage) => usage !== undefined);
  return {
    enforcement: "preview-only",
    teamCount: rows.length,
    teams: rows,
    seatCapacity,
    seatsUsed,
    seatsLeft: Math.max(0, seatCapacity - seatsUsed),
    membersTotal: rows.reduce((sum, row) => sum + row.members, 0),
    pendingInvitesTotal: rows.reduce((sum, row) => sum + row.pendingInvites, 0),
    projectCapacity,
    projectsUsed,
    projectsLeft: Math.max(0, projectCapacity - projectsUsed),
    status: seatStatus(seatsUsed, seatCapacity),
    policyVersion: firstUsage ? firstUsage.policy.version : policy.version,
    operationMode: firstUsage ? firstUsage.operationMode : null,
    storageMetered: false,
  };
}
