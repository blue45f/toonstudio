import type { DatabaseRuntimeRoleMode } from "../../config/database-role-mode";

/**
 * 연결 역할(`current_user`)이 최소 권한이고 `WITH GRANT OPTION`이 없어야 통과하는 마켓플레이스 ACL 검사 여섯 개.
 * 표 소유자는 REVOKE해도 grant option을 항상 가져(2026-10-22 실측) 소유자와 런타임 역할을 분리하지 못하는 DB에서는
 * 통과할 수 없다. `DATABASE_RUNTIME_ROLE_MODE=single-owner`를 명시했을 때만 이 목록을 건너뛴다.
 */
export const ROLE_SEPARATION_ACL_FLAGS = [
  "marketplaceResourceAclReady",
  "marketplaceCloudLibraryAclReady",
  "marketplacePackageModerationAclReady",
  "marketplacePublishGateAclReady",
  "marketplaceReportAclReady",
  "marketplaceReportGateAclReady",
] as const;

/** 준비성 카탈로그 행에서 이 여섯 플래그만 본다(행에 없는 이름이면 타입 검사가 막는다). */
export type RoleSeparationAclState = Readonly<
  Record<(typeof ROLE_SEPARATION_ACL_FLAGS)[number], boolean>
>;

export function roleSeparationAclReady(
  state: RoleSeparationAclState,
  roleMode: DatabaseRuntimeRoleMode,
): boolean {
  if (roleMode === "single-owner") return true;
  return ROLE_SEPARATION_ACL_FLAGS.every((flag) => state[flag] === true);
}
