import { buildAdminCapabilitySql, buildAdminRuntimeAclSql } from "./admin-database-contract.mjs";
import { buildAdminWorkspaceCapabilitySql, buildAdminWorkspaceRuntimeAclSql } from "./admin-workspace-database-contract.mjs";
import { buildAdminNestjsQualityCapabilitySql, buildAdminNestjsQualityRuntimeAclSql } from "./admin-nestjs-quality-database-contract.mjs";

/** 관리자 저장소마다 ACL 복구 직후 실제 읽기·쓰기 계약을 검증한다. */
export function applyAdminDatabaseFeatureContracts(executeSql, runtimeDatabaseRole) {
  for (const buildSql of [
    buildAdminRuntimeAclSql,
    buildAdminCapabilitySql,
    buildAdminWorkspaceRuntimeAclSql,
    buildAdminWorkspaceCapabilitySql,
    buildAdminNestjsQualityRuntimeAclSql,
    buildAdminNestjsQualityCapabilitySql,
  ]) {
    executeSql(buildSql(runtimeDatabaseRole));
  }
}

/** 읽기 검증 경로는 권한을 부여하거나 테이블을 수정하지 않는다. */
export function buildAdminDatabaseFeatureCapabilitySql(runtimeDatabaseRole) {
  return [buildAdminCapabilitySql, buildAdminWorkspaceCapabilitySql, buildAdminNestjsQualityCapabilitySql]
    .map((buildSql) => buildSql(runtimeDatabaseRole))
    .join("\n");
}
