import { describe, expect, it, vi } from "vitest";
import { applyAdminDatabaseFeatureContracts, buildAdminDatabaseFeatureCapabilitySql } from "./admin-database-feature-contracts.mjs";

describe("관리자 기능 DB 연결 순서", () => {
  it("관리자와 작업 보드의 권한을 각각 복구한 직후 검증한다", () => {
    const execute = vi.fn();
    applyAdminDatabaseFeatureContracts(execute, "test_runtime");
    expect(execute).toHaveBeenCalledTimes(8);
    const statements = execute.mock.calls.map(([sql]) => sql);
    expect(statements[0]).toMatch(/GRANT|CREATE POLICY/u);
    expect(statements[1]).not.toMatch(/^\s*(?:GRANT|REVOKE|CREATE POLICY)\s/um);
    expect(statements[0]).toContain("admin_business_plan_grant");
    expect(statements[1]).toContain("business plan access migration");
    expect(statements[2]).toContain("CREATE POLICY admin_cloud_workboard_runtime");
    expect(statements[3]).toContain("cloud workboard runtime privileges");
    expect(statements[4]).toContain("admin_nestjs_quality_board");
    expect(statements[5]).toContain("admin_nestjs_quality_history");
    expect(statements[6]).toContain("CREATE POLICY admin_workspace_runtime");
    expect(statements[7]).toContain("administrator workspace schema");
  });
  it("읽기 전용 검증은 모든 관리자 저장소 진단을 합친다", () => {
    const sql = buildAdminDatabaseFeatureCapabilitySql("test_runtime");
    expect(sql).toContain("admin_announcements");
    expect(sql).toContain("admin_workspace_receipt");
    expect(sql).toContain("admin_business_plan_access_audit");
    expect(sql).toContain("admin_cloud_workboard_receipt");
    expect(sql).toContain("admin_nestjs_quality_history");
    expect(sql).not.toMatch(/^\s*(?:GRANT|REVOKE|CREATE POLICY)\s/um);
  });
  it("앞선 권한 검증이 실패하면 다음 저장소 권한 변경을 실행하지 않는다", () => {
    const execute = vi.fn().mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw new Error("verification failed"); });
    expect(() => applyAdminDatabaseFeatureContracts(execute, "test_runtime")).toThrow("verification failed");
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
