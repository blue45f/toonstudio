import { describe, expect, it, vi } from "vitest";
import { applyAdminDatabaseFeatureContracts, buildAdminDatabaseFeatureCapabilitySql } from "./admin-database-feature-contracts.mjs";

const privilegeWrite = /\b(?:GRANT\s+|REVOKE\s+|CREATE\s+POLICY\b)/iu;

// has_*_privilege의 정확한 권한값·연결 접미사만 제외한다. 일반 문자열·주석·실제 권한 명령은 남긴다.
function withoutPrivilegeLookupValues(sql) {
  return sql.replaceAll("' WITH GRANT OPTION'", "''").replace(/'(?:SELECT|INSERT|UPDATE|DELETE|REFERENCES)\s+WITH\s+GRANT\s+OPTION(?:,\s*(?:SELECT|INSERT|UPDATE|DELETE|REFERENCES)\s+WITH\s+GRANT\s+OPTION)*'/giu, "''");
}

describe("관리자 기능 DB 연결 순서", () => {
  it.each([
    "GRANT SELECT ON public.admin_workspace TO test_runtime;",
    "GRANT SELECT ON public.admin_workspace TO test_runtime WITH GRANT OPTION;",
    "grant select on public.admin_workspace to test_runtime with grant option;",
    "GRANT OPTION TO test_runtime;",
    'GRANT "OPTION" TO test_runtime;',
    "SELECT 'SELECT WITH GRANT OPTION'; GRANT OPTION TO test_runtime;",
    "REVOKE GRANT OPTION FOR SELECT ON public.admin_workspace FROM test_runtime;",
    "CREATE POLICY admin_workspace_runtime ON public.admin_workspace TO test_runtime USING (true);",
  ])("실제 권한 변경 명령을 계속 차단한다: %s", (sql) => {
    expect(withoutPrivilegeLookupValues(sql)).toMatch(privilegeWrite);
  });
  it("관리자·사업계획서·클라우드·워크스페이스·NestJS 권한을 복구 직후 검증한다", () => {
    const execute = vi.fn();
    applyAdminDatabaseFeatureContracts(execute, "test_runtime");
    expect(execute).toHaveBeenCalledTimes(8);
    const statements = execute.mock.calls.map(([sql]) => sql);
    expect(withoutPrivilegeLookupValues(statements[0])).toMatch(privilegeWrite);
    expect(withoutPrivilegeLookupValues(statements[1])).not.toMatch(privilegeWrite);
    expect(statements[0]).toContain("admin_business_plan_receipt");
    expect(statements[1]).toContain("admin_business_plan_immutable_guard");
    expect(statements[0]).toContain("admin_business_plan_grant");
    expect(statements[1]).toContain("business plan access migration");
    expect(statements[2]).toContain("CREATE POLICY admin_cloud_workboard_runtime");
    expect(statements[3]).toContain("cloud workboard runtime privileges");
    expect(statements[4]).toContain("admin_nestjs_quality_board");
    expect(statements[4]).toContain("admin_nestjs_quality_history");
    expect(statements[4]).toContain("GRANT SELECT, INSERT");
    expect(statements[5]).toContain("admin_nestjs_quality_history");
    expect(statements[5]).toContain("NestJS verification board runtime privileges");
    expect(withoutPrivilegeLookupValues(statements[5])).not.toMatch(privilegeWrite);
    expect(statements[6]).toContain("CREATE POLICY admin_workspace_runtime");
    expect(statements[7]).toContain("administrator workspace schema");
  });
  it("읽기 전용 검증은 모든 관리자 저장소 진단을 합친다", () => {
    const sql = buildAdminDatabaseFeatureCapabilitySql("test_runtime");
    expect(sql).toContain("admin_announcements");
    expect(sql).toContain("admin_business_plan_revision");
    expect(sql).toContain("admin_workspace_receipt");
    expect(sql).toContain("admin_business_plan_access_audit");
    expect(sql).toContain("admin_cloud_workboard_receipt");
    expect(sql).toContain("admin_nestjs_quality_history");
    expect(sql).toContain("' WITH GRANT OPTION'");
    expect(withoutPrivilegeLookupValues(sql)).not.toMatch(privilegeWrite);
    for (const command of [
      "GRANT SELECT ON TABLE public.admin_workspace TO test_runtime;",
      "GRANT ALL ON TABLE public.admin_workspace TO test_runtime;",
      "REVOKE GRANT OPTION FOR SELECT ON TABLE public.admin_workspace FROM test_runtime;",
    ]) expect(withoutPrivilegeLookupValues(command)).toMatch(privilegeWrite);
  });
  it("앞선 권한 검증이 실패하면 다음 저장소 권한 변경을 실행하지 않는다", () => {
    const execute = vi.fn().mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw new Error("verification failed"); });
    expect(() => applyAdminDatabaseFeatureContracts(execute, "test_runtime")).toThrow("verification failed");
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
