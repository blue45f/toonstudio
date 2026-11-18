import { describe, expect, it } from "vitest";
import { buildAdminNestjsQualityCapabilitySql, buildAdminNestjsQualityRuntimeAclSql } from "./admin-nestjs-quality-database-contract.mjs";

describe("NestJS 검증 보드 DB 권한", () => {
  it.each(["", "public", "MixedCase", 'role"; DROP SCHEMA public; --'])("안전하지 않은 역할 %s 를 거부한다", (role) => {
    expect(() => buildAdminNestjsQualityRuntimeAclSql(role)).toThrow();
    expect(() => buildAdminNestjsQualityCapabilitySql(role)).toThrow();
  });

  it("서버 이력 삭제·수정 권한 없이 보드의 지정된 열만 수정한다", () => {
    const sql = buildAdminNestjsQualityRuntimeAclSql("quality_runtime", "quality_test");
    expect(sql).toContain('GRANT SELECT, INSERT ON TABLE "quality_test".admin_nestjs_quality_board, "quality_test".admin_nestjs_quality_history');
    expect(sql).toContain('GRANT UPDATE ("document", "revision", "updated_by", "updated_at")');
    expect(sql).not.toMatch(/GRANT[^;]*DELETE/u);
    expect(sql).not.toMatch(/GRANT UPDATE[^;]*admin_nestjs_quality_history/u);
    expect(() => buildAdminNestjsQualityRuntimeAclSql("quality_runtime", "invalid-schema")).toThrow();
  });

  it("준비 상태 판정은 읽기 전용으로 소유권·전달 권한·이력 변조 권한을 확인한다", () => {
    const sql = buildAdminNestjsQualityCapabilitySql("quality_runtime");
    expect(sql).toContain("relation.relowner");
    expect(sql).toContain("WITH GRANT OPTION");
    expect(sql).toContain("'DELETE','TRUNCATE'");
    expect(sql).not.toMatch(/^\s*(?:CREATE TABLE|ALTER TABLE|CREATE INDEX|GRANT )/mu);
  });
});
