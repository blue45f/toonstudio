/** Free-only team organization contracts; unrelated to a per-work production board. */
export type TeamWorkspaceRole = "owner" | "admin" | "member" | "guest";
export type InvitableWorkspaceRole = Exclude<TeamWorkspaceRole, "owner">;
export const FREE_USAGE_POLICY = Object.freeze({
  version: "free-operations-v1.1",
  ownedWorkspaces: 2, projectsPerWorkspace: 5, membersPerWorkspace: 10,
  workspaceOriginalBytes: 2 * 1024 ** 3, ownerOriginalBytes: 4 * 1024 ** 3,
  imageBytes: 50 * 1024 ** 2, imagePixels: 25_000_000,
  pdfBytes: 50 * 1024 ** 2, pdfPages: 100,
  comparisonViews: 4, sideViews: 2, queuedJobs: 5,
  runningJobs: 1, dailyExports: 20, activeShares: 20, defaultShareDays: 7,
});
export type FreeUsagePolicy = { readonly [K in keyof typeof FREE_USAGE_POLICY]: K extends "version" ? string : number };
export interface TeamWorkspaceSummary {
  readonly id: string;
  readonly name: string;
  readonly ownerUserId: string;
  readonly revision: number;
  readonly role: TeamWorkspaceRole;
  readonly createdAt: string;
  readonly projectCount: number;
  readonly memberCount: number;
  readonly pendingInvites: number;
}
export interface TeamWorkspaceMember {
  readonly userId: string;
  readonly displayName: string;
  readonly role: TeamWorkspaceRole;
  readonly joinedAt: string;
}
export interface TeamWorkspaceInvite {
  readonly id: string;
  readonly email: string;
  readonly role: InvitableWorkspaceRole;
  readonly expiresAt: string;
}
/**
 * 초대 수락 전에 보여 주는 미리보기. 토큰을 가진 본인(이메일 일치)에게만 열리며,
 * 워크스페이스 이름·부여 역할·초대자·만료를 수락 전에 확인할 수 있게 한다.
 * 이미 합류한 사람이 링크를 다시 열었을 때를 위해 합류 여부도 함께 알린다.
 */
export interface TeamWorkspaceInvitePreview {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly role: InvitableWorkspaceRole;
  readonly inviterName: string;
  readonly expiresAt: string;
  readonly alreadyAccepted: boolean;
  readonly alreadyMember: boolean;
}
export interface TeamWorkspaceProject {
  readonly id: string;
  readonly workId: string;
  readonly title: string;
  /** 작품 소유자(creator_work.userId). 작품 소유권 이전 표면을 소유자에게만 열기 위한 서버 사실이다. */
  readonly ownerUserId: string;
}
export interface TeamWorkspaceDetail {
  readonly workspace: TeamWorkspaceSummary;
  readonly projects: readonly TeamWorkspaceProject[];
  readonly members: readonly TeamWorkspaceMember[];
  readonly invites: readonly TeamWorkspaceInvite[];
}
export interface WorkspaceUsageResponse {
  readonly policy: FreeUsagePolicy;
  readonly workspaceId: string;
  readonly operationMode: "free" | "paid";
  readonly policyRevision: number;
  readonly counters: {
    readonly ownedWorkspaces: number;
    readonly projects: number;
    readonly members: number;
    readonly pendingInvites: number;
  };
  /** Unknown is not zero. Media accounting requires its own release gate. */
  readonly originalStorage: { readonly status: "not-instrumented"; readonly usedBytes: null };
  readonly nextDailyResetAt: string;
  readonly externalAiEnabled: false;
  readonly meteredProvidersEnabled: false;
}
/**
 * 감사 로그에 실제로 기록되는 행위 코드. repository의 record()가 만드는 값과 1:1이다:
 * 생성은 workspace.created, 명령은 workspace.<명령 타입>, 초대 수락은 workspace.invite-accepted.
 */
export const TEAM_WORKSPACE_AUDIT_ACTIONS = [
  "workspace.created",
  "workspace.rename",
  "workspace.invite",
  "workspace.revoke-invite",
  "workspace.change-member-role",
  "workspace.remove-member",
  "workspace.transfer-owner",
  "workspace.attach-project",
  "workspace.detach-project",
  "workspace.invite-accepted",
] as const;
export type TeamWorkspaceAuditAction = (typeof TEAM_WORKSPACE_AUDIT_ACTIONS)[number];
/** 감사 로그 한 줄. targetDisplayName은 대상이 구성원·초대·작품·워크스페이스일 때만 채워지고, 아니면 null이다. */
export interface TeamWorkspaceAuditEntry {
  readonly id: number;
  readonly actorUserId: string;
  readonly actorDisplayName: string;
  readonly action: TeamWorkspaceAuditAction;
  readonly targetId: string;
  readonly targetDisplayName: string | null;
  readonly revision: number;
  readonly occurredAt: string;
}
/** 기간[from,to)·행위자·행위 필터 + id 내림차순 키셋 페이지네이션(cursor = 마지막으로 본 id). */
export interface TeamWorkspaceAuditQuery {
  readonly from?: string;
  readonly to?: string;
  readonly actorUserId?: string;
  readonly action?: TeamWorkspaceAuditAction;
  readonly cursor?: number;
  readonly limit?: number;
}
export interface TeamWorkspaceAuditResponse {
  readonly workspaceId: string;
  readonly entries: readonly TeamWorkspaceAuditEntry[];
  /** 다음 페이지가 있으면 마지막 항목의 id, 없으면 null. */
  readonly nextCursor: number | null;
}
export const TEAM_WORKSPACE_AUDIT_DEFAULT_LIMIT = 50;
export const TEAM_WORKSPACE_AUDIT_MAX_LIMIT = 100;
export interface WorkspaceMutationResult {
  readonly workspaceId: string;
  readonly revision: number;
  readonly invitationId?: string;
  /** Returned once only; a replay never returns a stored plaintext token. */
  readonly token?: string;
  readonly delivery?: "manual-link";
  readonly expiresAt?: string;
}
export function nextSeoulDay(now: Date): string {
  const value = now.getTime();
  if (!Number.isFinite(value)) throw new RangeError("Invalid date");
  const offset = 9 * 60 * 60 * 1000;
  return new Date(Math.floor((value + offset) / 86_400_000) * 86_400_000 + 86_400_000 - offset).toISOString();
}
export function isWorkspaceManager(role: TeamWorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}
export type TeamWorkspaceCommandInput =
  | { readonly type: "rename"; readonly name: string }
  | { readonly type: "invite"; readonly email: string; readonly role: InvitableWorkspaceRole }
  | { readonly type: "revoke-invite"; readonly invitationId: string }
  | { readonly type: "change-member-role"; readonly userId: string; readonly role: InvitableWorkspaceRole }
  | { readonly type: "remove-member"; readonly userId: string }
  | { readonly type: "transfer-owner"; readonly userId: string }
  | { readonly type: "transfer-work-owner"; readonly projectId: string; readonly userId: string }
  | { readonly type: "attach-project"; readonly projectId: string }
  | { readonly type: "detach-project"; readonly projectId: string };
