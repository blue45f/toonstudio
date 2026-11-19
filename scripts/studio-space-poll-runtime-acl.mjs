import { validateRuntimeDatabaseRole } from "./database-runtime-role.mjs";

const tables = [
  { name: "studio_space_poll", insert: ["id", "workId", "world", "question", "options", "anonymous", "createdBy", "creatorName", "requestHash", "deadline"], update: ["closed"], defaults: ["createdAt"] },
  { name: "studio_space_poll_vote", insert: ["pollId", "voterId", "optionIndex", "voterName"], update: [], defaults: [] },
];

function roleName(value) {
  const role = validateRuntimeDatabaseRole(value);
  if (["public", "anon", "authenticated", "service_role", "postgres"].includes(role)) throw new Error("팀 투표 전용 런타임 역할을 지정하세요.");
  return role;
}

const columns = names => names.map(name => `"${name}"`).join(", ");

export function buildStudioSpacePollRuntimeAclSql(value) {
  const role = roleName(value);
  return tables.map(({ name, insert, update, defaults }) => {
    const table = `public.${name}`;
    return `REVOKE ALL ON TABLE ${table} FROM PUBLIC, "${role}";
REVOKE ALL PRIVILEGES (${columns([...insert, ...update, ...defaults])}) ON TABLE ${table} FROM PUBLIC, "${role}";
GRANT SELECT ON TABLE ${table} TO "${role}";
GRANT INSERT (${columns(insert)}) ON TABLE ${table} TO "${role}";${update.length ? `
GRANT UPDATE (${columns(update)}) ON TABLE ${table} TO "${role}";` : ""}`;
  }).join("\n");
}

export function buildStudioSpacePollRuntimeAclViolationSql(value) {
  const role = roleName(value);
  return tables.map(({ name, insert, update }) => {
    const table = `'public.${name}'`;
    const names = list => `ARRAY[${list.map(column => `'${column}'`).join(",")}]::text[]`;
    return `(NOT has_table_privilege('${role}', ${table}, 'SELECT')
      OR has_table_privilege('${role}', ${table}, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_table_privilege(0::oid, ${table}, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid=${table}::regclass AND attnum>0 AND NOT attisdropped AND
        (has_column_privilege('${role}', attrelid, attname, 'INSERT') <> (attname::text = ANY(${names(insert)}))
        OR has_column_privilege('${role}', attrelid, attname, 'UPDATE') <> (attname::text = ANY(${names(update)}))
        OR has_column_privilege('${role}', attrelid, attname, 'REFERENCES')
        OR has_column_privilege(0::oid, attrelid, attname, 'SELECT,INSERT,UPDATE,REFERENCES'))))`;
  }).join(" OR ");
}
