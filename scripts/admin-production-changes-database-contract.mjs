const RELATIONS = ["admin_production_change_request", "admin_production_change_audit", "admin_production_change_capture"];
const MUTABLE = ["version", "document", "updated_by", "updated_at"];
function identifier(value, allowPublic = false) {
  if (typeof value !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/u.test(value) || (!allowPublic && value === "public")) throw new Error("제작 변경 DB 권한에는 안전한 PostgreSQL 역할·스키마 이름이 필요합니다.");
  return value;
}
/** 요청의 지정 열만 수정한다. 감사 이력·캡처는 추가만 허용한다. */
export function buildAdminProductionChangesRuntimeAclSql(runtimeRole, schema = "public") {
  const role = identifier(runtimeRole), namespace = identifier(schema, true);
  const relations = RELATIONS.map(name => `"${namespace}".${name}`).join(", ");
  return `BEGIN;
REVOKE ALL ON TABLE ${relations} FROM PUBLIC, "${role}";
DO $production_changes_acl$
DECLARE relation_name text; columns text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[${RELATIONS.map(name => `'${name}'`).join(", ")}] LOOP
    SELECT string_agg(format('%I',attname),', ') INTO columns FROM pg_attribute
      WHERE attrelid=format('%I.%I','${namespace}',relation_name)::regclass AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE %I.%I FROM PUBLIC, "${role}"',columns,'${namespace}',relation_name);
  END LOOP;
END $production_changes_acl$;
GRANT SELECT, INSERT ON TABLE ${relations} TO "${role}";
GRANT UPDATE (${MUTABLE.map(name=>`"${name}"`).join(", ")}) ON TABLE "${namespace}".admin_production_change_request TO "${role}";
COMMIT;`;
}
/** 읽기 전용 capability 검증은 권한을 부여하거나 기록을 변경하지 않는다. */
export function buildAdminProductionChangesCapabilitySql(runtimeRole, schema = "public") {
  const role=identifier(runtimeRole), namespace=identifier(schema,true);
  return `DO $production_changes_capability$
BEGIN
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY[${RELATIONS.map(name=>`'${name}'`).join(", ")}]) AS contract(name)
    LEFT JOIN pg_class relation ON relation.oid=to_regclass('${namespace}.' || contract.name)
    WHERE relation.oid IS NULL OR relation.relowner=(SELECT oid FROM pg_roles WHERE rolname='${role}')
      OR EXISTS (
        SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS privilege(name)
        WHERE has_table_privilege('${role}',relation.oid,privilege.name) IS DISTINCT FROM (privilege.name IN ('SELECT','INSERT'))
          OR has_table_privilege('${role}',relation.oid,privilege.name || ' WITH GRANT OPTION') OR has_table_privilege(0::oid,relation.oid,privilege.name)
      ) OR EXISTS (
        SELECT 1 FROM pg_attribute attribute CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) AS privilege(name)
        WHERE attribute.attrelid=relation.oid AND attribute.attnum>0 AND NOT attribute.attisdropped
          AND (has_column_privilege('${role}',relation.oid,attribute.attname,privilege.name) IS DISTINCT FROM (
            privilege.name IN ('SELECT','INSERT') OR (privilege.name='UPDATE' AND contract.name='admin_production_change_request'
              AND attribute.attname::text=ANY(ARRAY[${MUTABLE.map(name=>`'${name}'`).join(", ")}])) )
            OR has_column_privilege('${role}',relation.oid,attribute.attname,privilege.name || ' WITH GRANT OPTION')
            OR has_column_privilege(0::oid,relation.oid,attribute.attname,privilege.name))
      )
  ) THEN RAISE EXCEPTION 'Production change runtime privileges are incompatible'; END IF;
END $production_changes_capability$;`;
}
