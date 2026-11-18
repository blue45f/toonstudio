import { describe, expect, it } from "vitest";

import { ADMIN_WORKSPACE_RELATIONS, buildAdminWorkspaceCapabilitySql, buildAdminWorkspaceRuntimeAclSql } from "./admin-workspace-database-contract.mjs";

describe("관리자 작업 보드 DB 권한 계약", () => {
  it("보드 한 행의 제한된 열만 수정하고 감사·receipt는 추가만 허용한다", () => {
    const sql = buildAdminWorkspaceRuntimeAclSql("workspace_runtime", "isolated_workspace");
    expect(sql).toContain('GRANT SELECT ON TABLE "isolated_workspace".admin_workspace TO "workspace_runtime"');
    expect(sql).toContain('GRANT UPDATE ("revision", "payload", "payload_digest", "updated_by", "updated_at")');
    expect(sql).toContain('GRANT SELECT, INSERT ON TABLE "isolated_workspace".admin_workspace_audit, "isolated_workspace".admin_workspace_receipt');
    expect(sql).not.toMatch(/GRANT[^;]*(?:DELETE|TRUNCATE|REFERENCES|TRIGGER)/u);
    expect(sql).not.toMatch(/GRANT UPDATE[^;]*(?:admin_workspace_audit|admin_workspace_receipt)/u);
    for (const table of ADMIN_WORKSPACE_RELATIONS) {
      expect(sql).toContain(`ALTER TABLE "isolated_workspace".${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`CREATE POLICY ${table}_runtime`);
    }
    expect(sql).toContain("ARRAY['anon','authenticated']");
    expect(sql).toContain("FROM PUBLIC");
  });
  it("역할·스키마 SQL 삽입과 브라우저 역할을 거부한다", () => {
    for (const role of ["public", "anon", "authenticated", 'runtime";DROP TABLE example;--', "", null]) {
      expect(() => buildAdminWorkspaceRuntimeAclSql(role)).toThrow();
      expect(() => buildAdminWorkspaceCapabilitySql(role)).toThrow();
    }
    expect(() => buildAdminWorkspaceRuntimeAclSql("safe_role", "unsafe.schema")).toThrow();
    expect(() => buildAdminWorkspaceCapabilitySql("safe_role", "'public'")).toThrow();
  });
  it("잘못된 열 타입·누락된 초기 행·추가 변경 권한·브라우저 노출을 readiness에서 검사한다", () => {
    const sql = buildAdminWorkspaceCapabilitySql("workspace_runtime");
    expect(sql).toContain("pg_catalog.format_type(a.atttypid,a.atttypmod)=expected.type_name");
    expect(sql).toContain("bootstrap row is missing");
    expect(sql).toContain("evidence privileges are incompatible");
    expect(sql).toContain("data is exposed to a browser role");
    expect(sql).toContain("has_column_privilege('workspace_runtime','public.admin_workspace','id','UPDATE')");
    expect(sql).toContain("has_any_column_privilege(0::oid");
  });
});
