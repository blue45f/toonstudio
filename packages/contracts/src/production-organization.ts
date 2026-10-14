/**
 * 조직(회사·스튜디오) 서버 계약의 정본.
 *
 * 조직은 기존 팀(워크스페이스)을 묶는 상위 단위일 뿐, 조직 소속이 어떤 자원 접근도
 * 새로 만들지 않는다. 원고·작품 접근 강제는 기존 워크스페이스·작품 권한이 정본이며
 * 조직 역할은 조직 표면(프로필·연결·공지·롤업·구성원)에 대한 권한만 정한다.
 * 이 파일의 역할 매트릭스를 웹 표시와 서버 강제가 함께 쓰므로 양쪽이 어긋날 수 없다.
 */
export type OrganizationKind = "company" | "studio" | "team-circle";
export type OrganizationRole = "owner" | "admin" | "manager" | "member" | "guest";
export type InvitableOrganizationRole = Exclude<OrganizationRole, "owner">;
export type OrganizationAction = "edit-profile" | "manage-links" | "post-notice" | "view-rollup";

/** 무료 조직 정책 v1. 한도는 서버가 강제하고, 운영 정책 확장은 별도 항목으로 분리한다. */
export const ORGANIZATION_FREE_POLICY = Object.freeze({
  version: "free-organization-v1",
  ownedOrganizations: 3,
  membersPerOrganization: 50,
  linkedWorkspacesPerOrganization: 30,
  noticesPerOrganization: 100,
});
export type OrganizationFreePolicy = { readonly [K in keyof typeof ORGANIZATION_FREE_POLICY]: K extends "version" ? string : number };

export interface OrganizationSummary {
  readonly id: string;
  readonly name: string;
  readonly kind: OrganizationKind;
  readonly description: string;
  readonly ownerUserId: string;
  readonly revision: number;
  /** 호출자 본인의 조직 역할. 목록·상세 모두 서버가 멤버십에서 도출한다. */
  readonly role: OrganizationRole;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly memberCount: number;
  /** 대기 초대는 구성원 관리 권한이 있는 역할에게만 실제 수를, 아니면 0을 준다. */
  readonly pendingInvites: number;
  readonly linkedWorkspaceCount: number;
}

export interface OrganizationMember {
  readonly userId: string;
  readonly displayName: string;
  readonly role: OrganizationRole;
  readonly joinedAt: string;
}

export interface OrganizationInvite {
  readonly id: string;
  readonly email: string;
  readonly role: InvitableOrganizationRole;
  readonly expiresAt: string;
}

/**
 * 초대 수락 전에 보여 주는 미리보기. 토큰을 가진 본인(이메일 일치)에게만 열리며,
 * 조직 이름·종류·부여 역할·초대자·만료를 수락 전에 확인할 수 있게 한다.
 */
export interface OrganizationInvitePreview {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly kind: OrganizationKind;
  readonly role: InvitableOrganizationRole;
  readonly inviterName: string;
  readonly expiresAt: string;
  readonly alreadyAccepted: boolean;
  readonly alreadyMember: boolean;
}

export interface OrganizationNoticeRecord {
  readonly id: string;
  readonly body: string;
  readonly authorName: string;
  readonly createdAt: string;
}

/**
 * 조직 상세. 게스트에게는 공개 프로필만 주고 구성원·초대·공지·연결 목록은 비운다 —
 * 팀 상세의 게스트 규칙과 같은 경계다.
 */
export interface OrganizationDetail {
  readonly organization: OrganizationSummary;
  readonly members: readonly OrganizationMember[];
  readonly invites: readonly OrganizationInvite[];
  readonly notices: readonly OrganizationNoticeRecord[];
  readonly linkedWorkspaceIds: readonly string[];
}

export interface OrganizationMutationResult {
  readonly organizationId: string;
  readonly revision: number;
  readonly invitationId?: string;
  readonly noticeId?: string;
  /** Returned once only; a replay never returns a stored plaintext token. */
  readonly token?: string;
  readonly delivery?: "manual-link";
  readonly expiresAt?: string;
}

interface OrganizationRoleRow {
  readonly role: OrganizationRole;
  readonly actions: readonly OrganizationAction[];
}

/**
 * 조직 역할 매트릭스. 조직 역할은 조직 표면에 대한 권한일 뿐 워크스페이스/작품
 * 접근권이 아니다. guest는 공개 프로필만 보므로 롤업 열람에도 포함하지 않는다.
 * 구성원 관리(초대·역할 변경·제거·대표 이전)는 매트릭스 밖의 별도 규칙으로,
 * owner/admin만 가능하고 세부 보호 규칙은 서버 리포지토리가 강제한다.
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

/** 구성원 관리(초대·역할·제거)를 할 수 있는 역할. 팀의 isWorkspaceManager와 같은 경계다. */
export function isOrganizationManager(role: OrganizationRole): boolean {
  return role === "owner" || role === "admin";
}

export type OrganizationCommandInput =
  | { readonly type: "update-profile"; readonly name: string; readonly kind: OrganizationKind; readonly description: string }
  | { readonly type: "link-workspace"; readonly workspaceId: string }
  | { readonly type: "unlink-workspace"; readonly workspaceId: string }
  | { readonly type: "post-notice"; readonly body: string }
  | { readonly type: "delete-notice"; readonly noticeId: string }
  | { readonly type: "invite"; readonly email: string; readonly role: InvitableOrganizationRole }
  | { readonly type: "revoke-invite"; readonly invitationId: string }
  | { readonly type: "change-member-role"; readonly userId: string; readonly role: InvitableOrganizationRole }
  | { readonly type: "remove-member"; readonly userId: string }
  | { readonly type: "transfer-owner"; readonly userId: string };
