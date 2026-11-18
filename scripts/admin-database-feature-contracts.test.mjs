import { describe, expect, it, vi } from "vitest";
import { applyAdminDatabaseFeatureContracts, buildAdminDatabaseFeatureCapabilitySql } from "./admin-database-feature-contracts.mjs";

const PRIVILEGE_WRITE_SQL = /\b(?:GRANT|REVOKE|CREATE POLICY) /u;
// has_*_privilege에 붙이는 정확한 조회 문자열만 제외하고 실제 권한 변경 명령은 그대로 검사한다.
const withoutPrivilegeOptionLiteral = (sql) => sql.replaceAll("' WITH GRANT OPTION'", "''");

describe("관리자 기능 DB 연결 순서", () => {
  it("관리자·워크스페이스·NestJS 보드의 권한을 각각 복구한 직후 검증한다", () => {
    const execute = vi.fn();
    applyAdminDatabaseFeatureContracts(execute, "test_runtime");
    expect(execute).toHaveBeenCalledTimes(6);
    const statements = execute.mock.calls.map(([sql]) => sql);
    expect(statements[0]).toMatch(/GRANT|CREATE POLICY/u);
    expect(withoutPrivilegeOptionLiteral(statements[1])).not.toMatch(PRIVILEGE_WRITE_SQL);
    expect(statements[2]).toContain("CREATE POLICY admin_workspace_runtime");
    expect(statements[3]).toContain("administrator workspace schema");
    expect(statements[4]).toContain("admin_nestjs_quality_history");
    expect(statements[4]).toContain("GRANT SELECT, INSERT");
    expect(statements[5]).toContain("NestJS verification board runtime privileges");
    expect(withoutPrivilegeOptionLiteral(statements[5])).not.toMatch(PRIVILEGE_WRITE_SQL);
  });
  it("읽기 전용 검증은 세 기능의 진단만 합친다", () => {
    const sql = buildAdminDatabaseFeatureCapabilitySql("test_runtime");
    expect(sql).toContain("admin_announcements");
    expect(sql).toContain("admin_workspace_receipt");
    expect(sql).toContain("admin_nestjs_quality_history");
    expect(sql).toContain("' WITH GRANT OPTION'");
    expect(withoutPrivilegeOptionLiteral(sql)).not.toMatch(PRIVILEGE_WRITE_SQL);
    for (const command of [
      "GRANT SELECT ON TABLE public.admin_workspace TO test_runtime;",
      "GRANT ALL ON TABLE public.admin_workspace TO test_runtime;",
      "REVOKE GRANT OPTION FOR SELECT ON TABLE public.admin_workspace FROM test_runtime;",
    ]) expect(withoutPrivilegeOptionLiteral(command)).toMatch(PRIVILEGE_WRITE_SQL);
  });
  it("앞선 권한 검증이 실패하면 다음 저장소 권한 변경을 실행하지 않는다", () => {
    const execute = vi.fn().mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw new Error("verification failed"); });
    expect(() => applyAdminDatabaseFeatureContracts(execute, "test_runtime")).toThrow("verification failed");
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
