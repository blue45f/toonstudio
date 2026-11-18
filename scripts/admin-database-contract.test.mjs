import { expect, it } from "vitest";

import { buildAdminCapabilitySql, buildAdminRuntimeAclSql, buildBusinessPlanCapabilitySql, buildBusinessPlanRuntimeAclSql, buildAdminCloudWorkboardCapabilitySql, buildAdminCloudWorkboardRuntimeAclSql } from "./admin-database-contract.mjs";

it.each(["", "public", "MixedCase", 'role"; DROP SCHEMA public; --'])("refuses unsafe administrator runtime role %s", (role) => {
  expect(() => buildAdminRuntimeAclSql(role)).toThrow("explicit safe administrator runtime role");
  expect(() => buildAdminCapabilitySql(role)).toThrow("explicit safe administrator runtime role");
  expect(() => buildBusinessPlanRuntimeAclSql(role)).toThrow("explicit safe administrator runtime role");
  expect(() => buildBusinessPlanCapabilitySql(role)).toThrow("explicit safe administrator runtime role");
  expect(() => buildAdminCloudWorkboardRuntimeAclSql(role)).toThrow("explicit safe administrator runtime role");
  expect(() => buildAdminCloudWorkboardCapabilitySql(role)).toThrow("explicit safe administrator runtime role");
});

it("클라우드 작업 본문만 갱신하고 감사·receipt 이력은 추가 권한만 부여한다", () => {
  const sql = buildAdminCloudWorkboardRuntimeAclSql("runtime_test");
  expect(sql).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_cloud_workboard TO "runtime_test"');
  expect(sql).toContain('GRANT SELECT, INSERT ON TABLE public.admin_cloud_workboard_audit, public.admin_cloud_workboard_receipt TO "runtime_test"');
  expect(sql).not.toMatch(/GRANT[^;]*(?:DELETE|TRUNCATE|CREATE)/u);
  expect(sql.match(/ENABLE ROW LEVEL SECURITY/gu)).toHaveLength(3);
  const capability = buildAdminCloudWorkboardCapabilitySql("runtime_test");
  expect(capability).toContain("history or isolation privileges are incompatible");
  expect(capability).toContain("rolsuper OR rolbypassrls");
  expect(capability).not.toMatch(/CREATE TABLE|ALTER TABLE|GRANT /u);
});

it("uses read-only shared schema evidence and checks each required DML privilege independently", () => {
  const sql = buildAdminCapabilitySql("runtime_test");
  expect(sql).toContain("admin_announcements");
  expect(sql).toContain("idx_revenue_ledger_reviewedat");
  expect(sql).toContain("ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']");
  expect(sql).not.toMatch(/CREATE TABLE|ALTER TABLE|CREATE INDEX|GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE|USAGE|EXECUTE)\b/u);
});

it("사업계획서 최신값의 지정 열만 수정하고 snapshot·감사·영수증은 추가만 허용한다", () => {
  const sql = buildBusinessPlanRuntimeAclSql("business_plan_runtime");
  for (const table of ["admin_business_plan", "admin_business_plan_revision", "admin_business_plan_audit", "admin_business_plan_receipt"]) {
    expect(sql).toContain(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, "business_plan_runtime"`);
    expect(sql).toContain(`GRANT SELECT, INSERT ON TABLE public.${table} TO "business_plan_runtime"`);
  }
  expect(sql).toContain('GRANT UPDATE ("revision", "payload", "updated_at") ON TABLE public.admin_business_plan');
  expect(sql).not.toMatch(/GRANT[^;]*(?:DELETE|TRUNCATE|WITH GRANT OPTION)/u);
  expect(sql).not.toMatch(/GRANT UPDATE[^;]*ON TABLE public.admin_business_plan_(?:revision|audit|receipt)/u);
  expect(sql).toContain('REVOKE ALL ON FUNCTION public.admin_business_plan_immutable_guard() FROM PUBLIC, "business_plan_runtime"');
  expect(buildAdminRuntimeAclSql("business_plan_runtime")).toContain(sql);
});

it("사업계획서 권한 검사는 위임·PUBLIC·불변 guard 해제까지 차단한다", () => {
  const sql = buildBusinessPlanCapabilitySql("business_plan_runtime");
  expect(sql).toContain("UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER");
  expect(sql).toContain("WITH GRANT OPTION");
  expect(sql).toContain("acl.grantee=0");
  expect(sql).toContain("prosecdef");
  expect(sql).toContain("trigger_record.tgenabled IN ('O', 'A')");
  expect(sql).toContain("trigger_record.tgtype=required.trigger_type");
  expect(sql).toContain("'admin_business_plan_delete_guard', 11");
  expect(sql).toContain("'admin_business_plan_truncate_guard', 34");
  expect(buildAdminCapabilitySql("business_plan_runtime")).toContain(sql);
});

it("내부 테스트 계정은 지정한 런타임 역할과 최소 DML에만 연결한다", () => {
  const sql = buildAdminRuntimeAclSql("community_runtime");
  expect(sql).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_member_test_accounts TO "community_runtime"');
  expect(sql).toContain('TO "community_runtime" USING (true) WITH CHECK (true)');
  expect(sql).toContain("REVOKE ALL ON TABLE public.admin_member_test_accounts FROM PUBLIC");
  expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*admin_member_test_accounts/u);
  expect(sql).not.toContain("toonspectrum_runtime");
  const capability = buildAdminCapabilitySql("community_runtime");
  expect(capability).toContain("public.admin_member_test_accounts");
  expect(capability).toContain("'DELETE'");
  expect(capability).toContain("relrowsecurity");
  expect(capability).toContain("classification privileges are incompatible");
});
