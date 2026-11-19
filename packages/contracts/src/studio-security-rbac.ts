/**
 * 툰스튜디오 전사 보안 역할별 롤(RBAC) 및 세분화 권한 관리 계약 (Web/API/MCP 공용).
 */

export type SecurityScopeType = "studio" | "team" | "work" | "project";

export type SecurityRoleId =
  | "studio_owner"
  | "executive_pd"
  | "main_author"
  | "story_director"
  | "lead_artist"
  | "line_assistant"
  | "color_assistant"
  | "bg3d_artist"
  | "fx_post_artist"
  | "lettering_qc"
  | "ip_manager"
  | "guest_reviewer";

export type SecurityPermissionId =
  | "manuscript:read"
  | "manuscript:write_all"
  | "manuscript:write_assigned_layer"
  | "manuscript:export_raw"
  | "asset3d:download_source"
  | "ip:view_contracts"
  | "ip:manage_expansion"
  | "billing:view"
  | "billing:manage"
  | "rbac:manage_roles"
  | "cafe:moderate"
  | "plaza:post_recruitment"
  | "mcp:execute_draw"
  | "audit:view_logs";

export interface SecurityRoleDefinition {
  readonly id: SecurityRoleId;
  readonly labelKo: string;
  readonly hierarchyRank: number;
  readonly defaultPermissions: readonly SecurityPermissionId[];
  readonly enforceWatermark: boolean;
  readonly blockRawExport: boolean;
}

export interface RoleAssignmentRecord {
  readonly userId: string;
  readonly displayName: string;
  readonly roleId: SecurityRoleId;
  readonly scopeType: SecurityScopeType;
  readonly scopeId: string;
  readonly extraGranted?: readonly SecurityPermissionId[];
  readonly explicitlyRevoked?: readonly SecurityPermissionId[];
  readonly allowedIpCidrs?: readonly string[];
}

export interface RbacEvaluationResult {
  readonly allowed: boolean;
  readonly roleId: SecurityRoleId;
  readonly permission: SecurityPermissionId;
  readonly enforceWatermark: boolean;
  readonly reasonKo: string;
}

export interface SecurityAuditEntry {
  readonly id: string;
  readonly actorUserId: string;
  readonly action: string;
  readonly targetUserId: string;
  readonly scopeType: SecurityScopeType;
  readonly scopeId: string;
  readonly createdAt: string;
}

const ALL_PERMISSIONS: readonly SecurityPermissionId[] = Object.freeze([
  "manuscript:read",
  "manuscript:write_all",
  "manuscript:write_assigned_layer",
  "manuscript:export_raw",
  "asset3d:download_source",
  "ip:view_contracts",
  "ip:manage_expansion",
  "billing:view",
  "billing:manage",
  "rbac:manage_roles",
  "cafe:moderate",
  "plaza:post_recruitment",
  "mcp:execute_draw",
  "audit:view_logs",
]);

export const SECURITY_PERMISSION_LABELS: Readonly<Record<SecurityPermissionId, string>> =
  Object.freeze({
    "manuscript:read": "원고 열람",
    "manuscript:write_all": "전체 레이어 편집",
    "manuscript:write_assigned_layer": "담당 레이어만 편집",
    "manuscript:export_raw": "원본 PSD/고해상도 반출",
    "asset3d:download_source": "3D 원본 모델 다운로드",
    "ip:view_contracts": "IP 계약서 열람",
    "ip:manage_expansion": "IP 확장 파이프라인 관리",
    "billing:view": "정산 내역 조회",
    "billing:manage": "정산/결제 승인",
    "rbac:manage_roles": "역할·권한 관리",
    "cafe:moderate": "카페·커뮤니티 운영",
    "plaza:post_recruitment": "구인 광장 모집 등록",
    "mcp:execute_draw": "MCP/CLI 자동 드로잉 실행",
    "audit:view_logs": "보안 감사 로그 열람",
  });

export const SECURITY_ROLE_CATALOG: readonly SecurityRoleDefinition[] = Object.freeze([
  {
    id: "studio_owner",
    labelKo: "스튜디오 대표 (Owner)",
    hierarchyRank: 100,
    defaultPermissions: ALL_PERMISSIONS,
    enforceWatermark: false,
    blockRawExport: false,
  },
  {
    id: "executive_pd",
    labelKo: "총괄 PD",
    hierarchyRank: 90,
    defaultPermissions: [
      "manuscript:read",
      "manuscript:write_all",
      "manuscript:export_raw",
      "ip:view_contracts",
      "ip:manage_expansion",
      "billing:view",
      "rbac:manage_roles",
      "cafe:moderate",
      "plaza:post_recruitment",
      "mcp:execute_draw",
      "audit:view_logs",
    ],
    enforceWatermark: false,
    blockRawExport: false,
  },
  {
    id: "main_author",
    labelKo: "메인 작가",
    hierarchyRank: 85,
    defaultPermissions: [
      "manuscript:read",
      "manuscript:write_all",
      "manuscript:export_raw",
      "asset3d:download_source",
      "ip:view_contracts",
      "ip:manage_expansion",
      "cafe:moderate",
      "plaza:post_recruitment",
      "mcp:execute_draw",
    ],
    enforceWatermark: false,
    blockRawExport: false,
  },
  {
    id: "story_director",
    labelKo: "글·콘티 디렉터",
    hierarchyRank: 75,
    defaultPermissions: ["manuscript:read", "manuscript:write_assigned_layer", "ip:view_contracts", "cafe:moderate"],
    enforceWatermark: false,
    blockRawExport: true,
  },
  {
    id: "lead_artist",
    labelKo: "작화 총괄 (작감)",
    hierarchyRank: 75,
    defaultPermissions: [
      "manuscript:read",
      "manuscript:write_all",
      "asset3d:download_source",
      "mcp:execute_draw",
    ],
    enforceWatermark: false,
    blockRawExport: true,
  },
  {
    id: "line_assistant",
    labelKo: "선화 어시스턴트",
    hierarchyRank: 50,
    defaultPermissions: ["manuscript:read", "manuscript:write_assigned_layer", "mcp:execute_draw"],
    enforceWatermark: true,
    blockRawExport: true,
  },
  {
    id: "color_assistant",
    labelKo: "밑색·채색 어시스턴트",
    hierarchyRank: 50,
    defaultPermissions: ["manuscript:read", "manuscript:write_assigned_layer"],
    enforceWatermark: true,
    blockRawExport: true,
  },
  {
    id: "bg3d_artist",
    labelKo: "3D 배경·모델링 담당",
    hierarchyRank: 55,
    defaultPermissions: ["manuscript:read", "manuscript:write_assigned_layer", "asset3d:download_source"],
    enforceWatermark: true,
    blockRawExport: true,
  },
  {
    id: "fx_post_artist",
    labelKo: "효과·후보정·원꾸 담당",
    hierarchyRank: 55,
    defaultPermissions: ["manuscript:read", "manuscript:write_assigned_layer", "mcp:execute_draw"],
    enforceWatermark: true,
    blockRawExport: true,
  },
  {
    id: "lettering_qc",
    labelKo: "식자·현지화·QC 담당",
    hierarchyRank: 50,
    defaultPermissions: ["manuscript:read", "manuscript:write_assigned_layer"],
    enforceWatermark: true,
    blockRawExport: true,
  },
  {
    id: "ip_manager",
    labelKo: "IP 사업 매니저",
    hierarchyRank: 70,
    defaultPermissions: ["manuscript:read", "ip:view_contracts", "ip:manage_expansion", "billing:view"],
    enforceWatermark: true,
    blockRawExport: true,
  },
  {
    id: "guest_reviewer",
    labelKo: "외부 검수·게스트 (읽기 전용)",
    hierarchyRank: 10,
    defaultPermissions: ["manuscript:read"],
    enforceWatermark: true,
    blockRawExport: true,
  },
]);

export function getSecurityRole(roleId: SecurityRoleId): SecurityRoleDefinition {
  return SECURITY_ROLE_CATALOG.find((r) => r.id === roleId) ?? SECURITY_ROLE_CATALOG[SECURITY_ROLE_CATALOG.length - 1];
}

export function resolveEffectivePermissions(
  assignment: RoleAssignmentRecord,
): readonly SecurityPermissionId[] {
  const role = getSecurityRole(assignment.roleId);
  const set = new Set<SecurityPermissionId>(role.defaultPermissions);
  for (const perm of assignment.extraGranted ?? []) set.add(perm);
  for (const perm of assignment.explicitlyRevoked ?? []) set.delete(perm);
  if (role.blockRawExport && !(assignment.extraGranted ?? []).includes("manuscript:export_raw")) {
    set.delete("manuscript:export_raw");
  }
  return [...set];
}

export function evaluateSecurityPermission(
  assignment: RoleAssignmentRecord,
  permission: SecurityPermissionId,
  clientIp?: string,
): RbacEvaluationResult {
  const role = getSecurityRole(assignment.roleId);
  if (
    assignment.allowedIpCidrs &&
    assignment.allowedIpCidrs.length > 0 &&
    clientIp &&
    !assignment.allowedIpCidrs.includes(clientIp)
  ) {
    return {
      allowed: false,
      roleId: assignment.roleId,
      permission,
      enforceWatermark: true,
      reasonKo: `허용된 보안 IP 목록에 없는 접속(${clientIp})이 차단되었습니다.`,
    };
  }

  const effective = resolveEffectivePermissions(assignment);
  const allowed = effective.includes(permission);
  return {
    allowed,
    roleId: assignment.roleId,
    permission,
    enforceWatermark: role.enforceWatermark,
    reasonKo: allowed
      ? `${role.labelKo} 역할의 [${SECURITY_PERMISSION_LABELS[permission]}] 권한이 승인되었습니다.`
      : `${role.labelKo} 역할에는 [${SECURITY_PERMISSION_LABELS[permission]}] 권한이 없습니다.`,
  };
}

export function canAssignTargetRole(
  actorRoleId: SecurityRoleId,
  targetRoleId: SecurityRoleId,
): boolean {
  const actor = getSecurityRole(actorRoleId);
  const target = getSecurityRole(targetRoleId);
  if (!actor.defaultPermissions.includes("rbac:manage_roles")) return false;
  return actor.hierarchyRank >= target.hierarchyRank;
}

export function createSecurityAuditEntry(input: {
  readonly actorUserId: string;
  readonly action: string;
  readonly targetUserId: string;
  readonly scopeType: SecurityScopeType;
  readonly scopeId: string;
}): SecurityAuditEntry {
  return {
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    ...input,
    createdAt: new Date().toISOString(),
  };
}
