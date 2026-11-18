import { describe, expect, it, vi } from "vitest";
import { applyAdminDatabaseFeatureContracts, buildAdminDatabaseFeatureCapabilitySql } from "./admin-database-feature-contracts.mjs";

describe("관리자 기능 DB 연결 순서", () => {
  it("관리자·통합 작업실·개인 클라우드 보드의 권한을 각각 복구한 직후 검증한다", () => {
    const execute = vi.fn();
    applyAdminDatabaseFeatureContracts(execute, "test_runtime");
    expect(execute).toHaveBeenCalledTimes(6);
    const statements = execute.mock.calls.map(([sql]) => sql);
    expect(statements[0]).toMatch(/GRANT|CREATE POLICY/u);
    expect(statements[1]).not.toMatch(/(?:GRANT|REVOKE|CREATE POLICY) /u);
    expect(statements[2]).toContain("CREATE POLICY admin_workspace_runtime");
    expect(statements[3]).toContain("administrator workspace schema");
    expect(statements[4]).toContain("CREATE POLICY admin_cloud_workboard_runtime");
    expect(statements[4]).toContain('GRANT SELECT, INSERT ON TABLE public.admin_cloud_workboard_audit, public.admin_cloud_workboard_receipt TO "test_runtime"');
    expect(statements[4]).not.toMatch(/GRANT[^;]*(?:DELETE|TRUNCATE)/u);
    expect(statements[5]).toContain("administrator cloud workboard history or isolation privileges");
  });
  it("읽기 전용 검증은 세 기능의 진단만 합친다", () => {
    const sql = buildAdminDatabaseFeatureCapabilitySql("test_runtime");
    expect(sql).toContain("admin_announcements");
    expect(sql).toContain("admin_workspace_receipt");
    expect(sql).toContain("admin_cloud_workboard_receipt");
    expect(sql).toContain("administrator cloud workboard runtime privileges are incomplete");
    expect(sql).not.toMatch(/(?:GRANT|REVOKE|CREATE POLICY) /u);
  });
  it.each([2, 4])("%i번째 권한 검증이 실패하면 다음 저장소 권한 변경을 실행하지 않는다", (failureStep) => {
    const execute = vi.fn(() => {
      if (execute.mock.calls.length === failureStep) throw new Error("verification failed");
    });
    expect(() => applyAdminDatabaseFeatureContracts(execute, "test_runtime")).toThrow("verification failed");
    expect(execute).toHaveBeenCalledTimes(failureStep);
  });
});
