import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAdminProductionChangesCapabilitySql, buildAdminProductionChangesRuntimeAclSql } from "./admin-production-changes-database-contract.mjs";
describe("제작 변경 DB 최소 권한 계약", () => {
  it("요청만 지정 열을 수정하고 감사·캡처 수정 및 삭제 권한을 부여하지 않는다", () => {
    const sql=buildAdminProductionChangesRuntimeAclSql("production_runtime","production_test");
    expect(sql).toContain('GRANT UPDATE ("version", "document", "updated_by", "updated_at") ON TABLE "production_test".admin_production_change_request');
    expect(sql).not.toMatch(/GRANT (?:DELETE|TRUNCATE|ALL)/u);
    expect(sql).not.toMatch(/GRANT UPDATE[^;]*(?:admin_production_change_audit|admin_production_change_capture)/u);
    expect(sql).toContain("REVOKE ALL PRIVILEGES");
  });
  it("capability 검사는 쓰지 않고 unsafe 역할·스키마를 거부한다", () => {
    const sql=buildAdminProductionChangesCapabilitySql("production_runtime");
    expect(sql).toContain("has_column_privilege"); expect(sql).toContain("admin_production_change_capture");
    expect(sql).not.toMatch(/(?:^|\n)\s*(?:GRANT|REVOKE|INSERT|UPDATE|DELETE)\b/mu);
    expect(()=>buildAdminProductionChangesRuntimeAclSql('unsafe"role')).toThrow();
    expect(()=>buildAdminProductionChangesCapabilitySql("runtime","invalid-schema")).toThrow();
  });
  it("추가형 migration은 이력 불변성·중복 요청·캡처 한도를 보존한다", () => {
    const sql=readFileSync(new URL("../apps/api/src/platform/database/migrations/0132_admin_production_changes.sql",import.meta.url),"utf8");
    expect(sql.match(/CREATE TABLE IF NOT EXISTS/gu)).toHaveLength(3);
    expect(sql).toContain("UNIQUE(actor_id,mutation_id)");
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON public.admin_production_change_audit");
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON public.admin_production_change_capture");
    expect(sql).toContain("byte_length BETWEEN 1 AND 5242880");
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE TABLE/u);
  });
});
