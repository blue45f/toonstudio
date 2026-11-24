import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildFinalSubmissionCapabilitySql, buildFinalSubmissionRuntimeAclSql } from "./admin-final-submission-database-contract.mjs";

describe("개인 최종 제출 점검 DB 계약", () => {
  it.each(["public", "", "runtime;drop", "a\"b", "A-role", "x".repeat(64)])("안전하지 않은 역할을 거부한다: %s", (role) => {
    expect(() => buildFinalSubmissionRuntimeAclSql(role)).toThrow();
    expect(() => buildFinalSubmissionCapabilitySql(role)).toThrow();
  });

  it("원장 지정 열만 수정하고 개인 RLS·이력 불변 검증을 연결한다", () => {
    const sql = buildFinalSubmissionRuntimeAclSql("fixture_runtime");
    expect(sql).toContain('GRANT UPDATE ("revision", "payload", "updated_at")');
    expect(sql).not.toMatch(/GRANT[^;]*(?:DELETE|TRUNCATE|WITH GRANT OPTION)/u);
    expect(sql).not.toMatch(/GRANT UPDATE[^;]*admin_final_submission_(?:audit|receipt)/u);
    expect(sql).toContain("owner_user_id=current_setting('toonstudio.final_submission_owner',true)");
    expect(sql).toContain("REVOKE ALL PRIVILEGES (%s)");
    const capability = buildFinalSubmissionCapabilitySql("fixture_runtime");
    expect(capability).toContain("pg_has_role");
    expect(capability).toContain("relrowsecurity");
    expect(capability).toContain("admin_final_submission_receipt_truncate_guard");
    expect(capability).not.toMatch(/\n(?:GRANT|REVOKE|CREATE|ALTER|DROP) /u);
  });

  it("추가형 migration은 계정별 원장과 불변 이력만 만들고 기존 원문을 수정하지 않는다", () => {
    const sql = readFileSync(new URL("../apps/api/src/platform/database/migrations/0134_admin_final_submission.sql", import.meta.url), "utf8");
    expect(sql).toMatch(/\nBEGIN;[\s\S]*COMMIT;\s*$/u);
    expect(sql).toContain('owner_user_id text PRIMARY KEY REFERENCES public."user"(id) ON DELETE RESTRICT');
    expect(sql).toContain("actor_user_id=owner_user_id");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("BEFORE TRUNCATE");
    expect(sql).not.toMatch(/(?:DROP TABLE|TRUNCATE TABLE|UPDATE public\.|INSERT INTO public\.|SECURITY DEFINER)/u);
  });
});
