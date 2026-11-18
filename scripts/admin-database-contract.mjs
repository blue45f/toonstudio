import { readFileSync } from "node:fs";
export { buildAdminNestjsQualityCapabilitySql, buildAdminNestjsQualityRuntimeAclSql } from "./admin-nestjs-quality-database-contract.mjs";

const adminRelations = Object.freeze([
  "admin_announcements",
  "admin_audit_logs",
  "admin_banned_words",
  "admin_content_reports",
  "admin_promos",
  "admin_security_policies",
]);

const businessPlanRelations = Object.freeze([
  ["admin_business_plan", ["revision", "payload", "updated_at"]],
  ["admin_business_plan_revision", []],
  ["admin_business_plan_audit", []],
  ["admin_business_plan_receipt", []],
]);

function roleName(role) {
  if (typeof role !== "string" || role === "public" || !/^[a-z_][a-z0-9_]{0,62}$/u.test(role)) {
    throw new Error("An explicit safe administrator runtime role is required");
  }
  return role;
}

/** 보드 최신값만 지정 열 UPDATE를 허용하고 원문 snapshot·감사·영수증은 추가만 허용한다. */
export function buildBusinessPlanRuntimeAclSql(role) {
  const safeRole = roleName(role);
  return businessPlanRelations.map(([table, mutableColumns]) => `
DO $business_plan_column_acl$
DECLARE columns text;
BEGIN
  SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum) INTO columns
    FROM pg_catalog.pg_attribute WHERE attrelid='public.${table}'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.${table} FROM "${safeRole}"', columns);
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.${table} FROM PUBLIC', columns);
END $business_plan_column_acl$;
REVOKE ALL ON TABLE public.${table} FROM PUBLIC, "${safeRole}";
GRANT SELECT, INSERT ON TABLE public.${table} TO "${safeRole}";
${mutableColumns.length ? `GRANT UPDATE (${mutableColumns.map((column) => `"${column}"`).join(", ")}) ON TABLE public.${table} TO "${safeRole}";` : ""}
`).join("\n") + `
REVOKE ALL ON FUNCTION public.admin_business_plan_immutable_guard() FROM PUBLIC, "${safeRole}";
`;
}

export function buildBusinessPlanCapabilitySql(role) {
  const safeRole = roleName(role);
  const policies = businessPlanRelations.map(([table, mutableColumns]) =>
    `('${table}'::text, ARRAY[${mutableColumns.map((column) => `'${column}'`).join(", ")}]::text[])`).join(",\n");
  return `
DO $business_plan_capability$
BEGIN
  IF EXISTS (SELECT 1 FROM (VALUES ${policies}) AS policy(table_name, mutable)
    WHERE to_regclass('public.' || policy.table_name) IS NULL) THEN
    RAISE EXCEPTION 'business plan storage migration is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM (VALUES ${policies}) AS policy(table_name, mutable)
    WHERE NOT pg_catalog.has_table_privilege('${safeRole}', 'public.' || policy.table_name, 'SELECT')
      OR NOT pg_catalog.has_table_privilege('${safeRole}', 'public.' || policy.table_name, 'INSERT')
      OR pg_catalog.has_table_privilege('${safeRole}', 'public.' || policy.table_name, 'UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
      OR pg_catalog.has_table_privilege('${safeRole}', 'public.' || policy.table_name,
        'SELECT WITH GRANT OPTION, INSERT WITH GRANT OPTION, UPDATE WITH GRANT OPTION, DELETE WITH GRANT OPTION')
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute attribute
        WHERE attribute.attrelid=to_regclass('public.' || policy.table_name) AND attribute.attnum>0 AND NOT attribute.attisdropped
          AND (pg_catalog.has_column_privilege('${safeRole}', attribute.attrelid, attribute.attname, 'UPDATE') <> (attribute.attname=ANY(policy.mutable))
            OR pg_catalog.has_column_privilege('${safeRole}', attribute.attrelid, attribute.attname,
              'SELECT WITH GRANT OPTION, INSERT WITH GRANT OPTION, UPDATE WITH GRANT OPTION, REFERENCES WITH GRANT OPTION')))
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_class relation CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) acl
        WHERE relation.oid=to_regclass('public.' || policy.table_name) AND acl.grantee=0)
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute attribute CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) acl
        WHERE attribute.attrelid=to_regclass('public.' || policy.table_name) AND attribute.attnum>0 AND acl.grantee=0)
  ) THEN
    RAISE EXCEPTION 'business plan runtime privileges are incompatible';
  END IF;
  IF to_regprocedure('public.admin_business_plan_immutable_guard()') IS NULL THEN
    RAISE EXCEPTION 'business plan history guard is missing';
  END IF;
  IF pg_catalog.has_function_privilege('${safeRole}', 'public.admin_business_plan_immutable_guard()', 'EXECUTE')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc function_record
      CROSS JOIN LATERAL pg_catalog.aclexplode(function_record.proacl) acl
      WHERE function_record.oid='public.admin_business_plan_immutable_guard()'::regprocedure AND acl.grantee=0)
    OR (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid='public.admin_business_plan_immutable_guard()'::regprocedure)
  THEN
    RAISE EXCEPTION 'business plan history guard privileges are incompatible';
  END IF;
  IF EXISTS (SELECT 1 FROM (VALUES
    ('admin_business_plan', 'admin_business_plan_delete_guard', 11),
    ('admin_business_plan_revision', 'admin_business_plan_revision_immutable', 27),
    ('admin_business_plan_audit', 'admin_business_plan_audit_immutable', 27),
    ('admin_business_plan_receipt', 'admin_business_plan_receipt_immutable', 27),
    ('admin_business_plan', 'admin_business_plan_truncate_guard', 34),
    ('admin_business_plan_revision', 'admin_business_plan_revision_truncate_guard', 34),
    ('admin_business_plan_audit', 'admin_business_plan_audit_truncate_guard', 34),
    ('admin_business_plan_receipt', 'admin_business_plan_receipt_truncate_guard', 34)
  ) AS required(table_name, trigger_name, trigger_type) WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger trigger_record
    WHERE trigger_record.tgrelid=to_regclass('public.' || required.table_name)
      AND trigger_record.tgname=required.trigger_name AND trigger_record.tgenabled IN ('O', 'A')
      AND trigger_record.tgfoid='public.admin_business_plan_immutable_guard()'::regprocedure
      AND trigger_record.tgtype=required.trigger_type
  )) THEN
    RAISE EXCEPTION 'business plan history triggers are incompatible';
  END IF;
END
$business_plan_capability$;
`;
}

export function buildAdminRuntimeAclSql(role) {
  const quotedRole = `"${roleName(role)}"`;
  const tables = adminRelations.map((name) => `public.${name}`).join(", ");
  return `
REVOKE ALL ON TABLE ${tables} FROM PUBLIC;
REVOKE ALL ON TABLE ${tables} FROM ${quotedRole};
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${tables} TO ${quotedRole};
-- 내부 테스트 계정은 삭제 권한 없이 승인된 실제 런타임 역할에만 연결한다.
REVOKE ALL ON TABLE public.admin_member_test_accounts FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_member_test_accounts FROM ${quotedRole};
GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_member_test_accounts TO ${quotedRole};
ALTER TABLE public.admin_member_test_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_member_test_accounts_runtime ON public.admin_member_test_accounts;
CREATE POLICY admin_member_test_accounts_runtime ON public.admin_member_test_accounts
  TO ${quotedRole} USING (true) WITH CHECK (true);
${buildBusinessPlanRuntimeAclSql(role)}
`;
}

export function buildAdminCapabilitySql(role) {
  const safeRole = roleName(role);
  const source = readFileSync(new URL("../apps/api/src/platform/database/schema/admin.schema.ts", import.meta.url), "utf8");
  const columns = /export const ADMIN_SCHEMA_COLUMNS_SQL = `([^`]+)`;/u.exec(source)?.[1];
  const indexes = /export const ADMIN_SCHEMA_INDEXES_SQL = `([^`]+)`;/u.exec(source)?.[1];
  if (!columns || !indexes) throw new Error("Managed administrator schema contract is unreadable");
  const tables = adminRelations.map((name) => `('${name}')`).join(", ");
  return `
DO $admin_capability$
BEGIN
  IF NOT (${columns}) OR NOT (${indexes}) THEN
    RAISE EXCEPTION 'managed administrator schema is incomplete or incompatible';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES ${tables}) AS required(table_name)
    CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS permission(privilege_name)
    WHERE NOT pg_catalog.has_table_privilege('${safeRole}', 'public.' || table_name, privilege_name)
  ) THEN
    RAISE EXCEPTION 'administrator runtime DML privileges are incomplete';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE']) AS permission(privilege_name)
    WHERE NOT pg_catalog.has_table_privilege('${safeRole}', 'public.admin_member_test_accounts', privilege_name)
  ) OR pg_catalog.has_table_privilege('${safeRole}', 'public.admin_member_test_accounts', 'DELETE')
    OR pg_catalog.has_table_privilege(0::oid, 'public.admin_member_test_accounts', 'SELECT')
    OR NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.admin_member_test_accounts'::regclass)
  THEN
    RAISE EXCEPTION 'administrator test account classification privileges are incompatible';
  END IF;
END
$admin_capability$;
${buildBusinessPlanCapabilitySql(role)}
`;
}
