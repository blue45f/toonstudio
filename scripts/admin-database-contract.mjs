import { readFileSync } from "node:fs";

const adminRelations = Object.freeze([
  "admin_announcements",
  "admin_audit_logs",
  "admin_banned_words",
  "admin_content_reports",
  "admin_promos",
  "admin_security_policies",
]);

function roleName(role) {
  if (typeof role !== "string" || role === "public" || !/^[a-z_][a-z0-9_]{0,62}$/u.test(role)) {
    throw new Error("An explicit safe administrator runtime role is required");
  }
  return role;
}

const cloudWorkboardRelations = Object.freeze([
  "admin_cloud_workboard",
  "admin_cloud_workboard_audit",
  "admin_cloud_workboard_receipt",
]);

export function buildAdminCloudWorkboardRuntimeAclSql(role) {
  const quotedRole = `"${roleName(role)}"`;
  const tables = cloudWorkboardRelations.map((name) => `public.${name}`).join(", ");
  return `
REVOKE ALL ON TABLE ${tables} FROM PUBLIC;
REVOKE ALL ON TABLE ${tables} FROM ${quotedRole};
GRANT SELECT, INSERT, UPDATE ON TABLE public.admin_cloud_workboard TO ${quotedRole};
GRANT SELECT, INSERT ON TABLE public.admin_cloud_workboard_audit, public.admin_cloud_workboard_receipt TO ${quotedRole};
${cloudWorkboardRelations.map((name) => `ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ${name}_runtime ON public.${name};
CREATE POLICY ${name}_runtime ON public.${name}
  TO ${quotedRole} USING (true) WITH CHECK (true);`).join("\n")}
`;
}

export function buildAdminCloudWorkboardCapabilitySql(role) {
  const safeRole = roleName(role);
  const tables = cloudWorkboardRelations.map((name) => `('${name}')`).join(", ");
  return `
DO $admin_cloud_workboard_capability$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (VALUES ${tables}) AS required(table_name)
    CROSS JOIN unnest(ARRAY['SELECT', 'INSERT']) AS permission(privilege_name)
    WHERE NOT pg_catalog.has_table_privilege('${safeRole}', 'public.' || table_name, privilege_name)
  ) OR NOT pg_catalog.has_table_privilege('${safeRole}', 'public.admin_cloud_workboard', 'UPDATE')
  THEN
    RAISE EXCEPTION 'administrator cloud workboard runtime privileges are incomplete';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES ${tables}) AS required(table_name)
    JOIN pg_catalog.pg_class relation ON relation.oid = ('public.' || table_name)::regclass
    WHERE NOT relation.relrowsecurity
      OR pg_catalog.pg_has_role('${safeRole}', relation.relowner, 'USAGE')
      OR pg_catalog.has_table_privilege('${safeRole}', relation.oid, 'DELETE, TRUNCATE, REFERENCES, TRIGGER')
      OR pg_catalog.has_table_privilege(0::oid, relation.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
      OR (table_name <> 'admin_cloud_workboard' AND pg_catalog.has_table_privilege('${safeRole}', relation.oid, 'UPDATE'))
      OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_policy policy
        WHERE policy.polrelid=relation.oid AND policy.polname=table_name || '_runtime'
          AND (SELECT oid FROM pg_catalog.pg_roles WHERE rolname='${safeRole}')=ANY(policy.polroles)
      )
  ) OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='${safeRole}' AND (rolsuper OR rolbypassrls))
  THEN
    RAISE EXCEPTION 'administrator cloud workboard history or isolation privileges are incompatible';
  END IF;
END
$admin_cloud_workboard_capability$;
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
`;
}

export function buildAdminCapabilitySql(role) {
  const safeRole = roleName(role);
  const source = readFileSync(new URL("../apps/api/src/platform/database/admin-schema-contract.ts", import.meta.url), "utf8");
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
`;
}
