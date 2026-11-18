/** 보드 원문·감사 기록은 브라우저 Data API 역할에 공개하지 않는다. */
export const ADMIN_WORKSPACE_RELATIONS = Object.freeze([
  "admin_workspace", "admin_workspace_audit", "admin_workspace_receipt",
]);
const WORKSPACE_WRITABLE_COLUMNS = ["revision", "payload", "payload_digest", "updated_by", "updated_at"];
const COLUMN_TYPES = {
  admin_workspace: { id: "text", revision: "integer", payload: "jsonb", payload_digest: "text", updated_by: "text", updated_at: "timestamp with time zone" },
  admin_workspace_audit: { board_id: "text", revision: "integer", actor_user_id: "text", action: "text", before_digest: "text", after_digest: "text", occurred_at: "timestamp with time zone" },
  admin_workspace_receipt: { board_id: "text", actor_user_id: "text", mutation_id: "uuid", request_digest: "text", accepted_revision: "integer", accepted_at: "timestamp with time zone" },
};

function identifier(value, kind) {
  if (typeof value !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/u.test(value)) throw new Error(`안전한 ${kind} 이름이 필요합니다.`);
  return value;
}
function roleName(value) {
  const role = identifier(value, "런타임 역할");
  if (["public", "anon", "authenticated"].includes(role)) throw new Error("관리자 보드에는 전용 API 런타임 역할이 필요합니다.");
  return role;
}

export function buildAdminWorkspaceRuntimeAclSql(role, schema = "public") {
  const quotedRole = `"${roleName(role)}"`;
  const quotedSchema = `"${identifier(schema, "스키마")}"`;
  const relation = name => `${quotedSchema}.${name}`;
  const tables = ADMIN_WORKSPACE_RELATIONS.map(relation).join(", ");
  const columnRevokes = ADMIN_WORKSPACE_RELATIONS.map(name => `REVOKE ALL PRIVILEGES (${Object.keys(COLUMN_TYPES[name]).map(column => `"${column}"`).join(", ")}) ON TABLE ${relation(name)} FROM PUBLIC, ${quotedRole};`).join("\n");
  const browserColumnRevokes = ADMIN_WORKSPACE_RELATIONS.map(name => `EXECUTE format('REVOKE ALL PRIVILEGES (${Object.keys(COLUMN_TYPES[name]).map(column => `"${column}"`).join(", ")}) ON TABLE ${relation(name)} FROM %I',browser_role);`).join("\n      ");
  const policies = ADMIN_WORKSPACE_RELATIONS.map(name => `
ALTER TABLE ${relation(name)} ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ${name}_runtime ON ${relation(name)};
CREATE POLICY ${name}_runtime ON ${relation(name)} TO ${quotedRole} USING (true) WITH CHECK (true);`).join("\n");
  return `
REVOKE ALL ON TABLE ${tables} FROM PUBLIC;
REVOKE ALL ON TABLE ${tables} FROM ${quotedRole};
${columnRevokes}
GRANT SELECT ON TABLE ${relation("admin_workspace")} TO ${quotedRole};
GRANT UPDATE (${WORKSPACE_WRITABLE_COLUMNS.map(name => `"${name}"`).join(", ")}) ON TABLE ${relation("admin_workspace")} TO ${quotedRole};
GRANT SELECT, INSERT ON TABLE ${relation("admin_workspace_audit")}, ${relation("admin_workspace_receipt")} TO ${quotedRole};
${policies}
DO $admin_workspace_browser_acl$
DECLARE browser_role text;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=browser_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE ${tables} FROM %I',browser_role);
      ${browserColumnRevokes}
    END IF;
  END LOOP;
END
$admin_workspace_browser_acl$;
`;
}

export function buildAdminWorkspaceCapabilitySql(role, schema = "public") {
  const safeRole = roleName(role);
  const safeSchema = identifier(schema, "스키마");
  const names = ADMIN_WORKSPACE_RELATIONS.map(name => `('${name}')`).join(",");
  const columns = Object.entries(COLUMN_TYPES).flatMap(([table, fields]) => Object.entries(fields).map(([column, type]) => `('${table}','${column}','${type}')`)).join(",\n    ");
  const writes = WORKSPACE_WRITABLE_COLUMNS.map(name => `('${name}')`).join(",");
  return `
DO $admin_workspace_capability$
DECLARE browser_role text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM (VALUES ${columns}) AS expected(table_name,column_name,type_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute AS a
      JOIN pg_catalog.pg_class AS c ON c.oid=a.attrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
      WHERE n.nspname='${safeSchema}' AND c.relname=expected.table_name
        AND a.attname=expected.column_name AND NOT a.attisdropped AND a.attnum>0
        AND pg_catalog.format_type(a.atttypid,a.atttypmod)=expected.type_name
    )
  ) THEN RAISE EXCEPTION 'administrator workspace schema is incomplete or incompatible'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "${safeSchema}".admin_workspace WHERE id='toonstudio') THEN
    RAISE EXCEPTION 'administrator workspace bootstrap row is missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES ${names}) AS required(table_name)
    WHERE NOT pg_catalog.has_table_privilege('${safeRole}', '${safeSchema}.' || table_name, 'SELECT')
      OR NOT (SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid=('${safeSchema}.' || table_name)::regclass)
      OR pg_catalog.has_any_column_privilege(0::oid, '${safeSchema}.' || table_name, 'SELECT')
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS privilege_name
        WHERE pg_catalog.has_table_privilege('${safeRole}', '${safeSchema}.' || table_name, privilege_name))
  ) THEN RAISE EXCEPTION 'administrator workspace access privileges are incompatible'; END IF;
  IF pg_catalog.has_any_column_privilege('${safeRole}','${safeSchema}.admin_workspace','INSERT')
    OR pg_catalog.has_column_privilege('${safeRole}','${safeSchema}.admin_workspace','id','UPDATE')
    OR EXISTS (SELECT 1 FROM (VALUES ${writes}) AS required(column_name)
      WHERE NOT pg_catalog.has_column_privilege('${safeRole}','${safeSchema}.admin_workspace',column_name,'UPDATE'))
    OR EXISTS (SELECT 1 FROM (VALUES ('admin_workspace_audit'),('admin_workspace_receipt')) AS required(table_name)
      WHERE NOT pg_catalog.has_table_privilege('${safeRole}','${safeSchema}.' || table_name,'INSERT')
        OR pg_catalog.has_any_column_privilege('${safeRole}','${safeSchema}.' || table_name,'UPDATE'))
  THEN RAISE EXCEPTION 'administrator workspace write or evidence privileges are incompatible'; END IF;
  FOREACH browser_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=browser_role) THEN
      IF EXISTS (
        SELECT 1 FROM (VALUES ${names}) AS required(table_name)
        WHERE pg_catalog.has_any_column_privilege(browser_role,'${safeSchema}.' || table_name,'SELECT')
          OR pg_catalog.has_any_column_privilege(browser_role,'${safeSchema}.' || table_name,'INSERT')
          OR pg_catalog.has_any_column_privilege(browser_role,'${safeSchema}.' || table_name,'UPDATE')
          OR pg_catalog.has_table_privilege(browser_role,'${safeSchema}.' || table_name,'DELETE')
      ) THEN RAISE EXCEPTION 'administrator workspace data is exposed to a browser role'; END IF;
    END IF;
  END LOOP;
END
$admin_workspace_capability$;
`;
}
