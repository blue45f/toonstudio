const RELATIONS = ["admin_nestjs_quality_board", "admin_nestjs_quality_history"];
const MUTABLE_COLUMNS = ["document", "revision", "updated_by", "updated_at"];

function identifier(value, allowPublic = false) {
  if (typeof value !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/u.test(value) || (!allowPublic && value === "public")) {
    throw new Error("검증 보드 DB 권한에는 안전한 PostgreSQL 역할·스키마 이름이 필요합니다.");
  }
  return value;
}

/** 보드는 지정 열만 수정하고 서버 변경 이력은 추가만 허용한다. */
export function buildAdminNestjsQualityRuntimeAclSql(runtimeRole, schema = "public") {
  const role = identifier(runtimeRole);
  const namespace = identifier(schema, true);
  const relations = RELATIONS.map((name) => `"${namespace}".${name}`).join(", ");
  return `BEGIN;
REVOKE ALL ON TABLE ${relations} FROM PUBLIC, "${role}";
DO $nestjs_quality_acl$
DECLARE relation_name text; columns text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[${RELATIONS.map((name) => `'${name}'`).join(", ")}] LOOP
    SELECT string_agg(format('%I', attname), ', ') INTO columns FROM pg_attribute
      WHERE attrelid=format('%I.%I', '${namespace}', relation_name)::regclass AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE %I.%I FROM PUBLIC, "${role}"', columns, '${namespace}', relation_name);
  END LOOP;
END $nestjs_quality_acl$;
GRANT SELECT, INSERT ON TABLE ${relations} TO "${role}";
GRANT UPDATE (${MUTABLE_COLUMNS.map((name) => `"${name}"`).join(", ")})
  ON TABLE "${namespace}".admin_nestjs_quality_board TO "${role}";
COMMIT;`;
}

export function buildAdminNestjsQualityCapabilitySql(runtimeRole, schema = "public") {
  const role = identifier(runtimeRole);
  const namespace = identifier(schema, true);
  return `DO $nestjs_quality_capability$
BEGIN
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY[${RELATIONS.map((name) => `'${name}'`).join(", ")}]) AS contract(name)
    LEFT JOIN pg_class relation ON relation.oid=to_regclass('${namespace}.' || contract.name)
    WHERE relation.oid IS NULL OR relation.relowner=(SELECT oid FROM pg_roles WHERE rolname='${role}')
      OR EXISTS (
        SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS privilege(name)
        WHERE has_table_privilege('${role}',relation.oid,privilege.name) IS DISTINCT FROM (privilege.name IN ('SELECT','INSERT'))
          OR has_table_privilege('${role}',relation.oid,privilege.name || ' WITH GRANT OPTION')
          OR has_table_privilege(0::oid,relation.oid,privilege.name)
      )
      OR EXISTS (
        SELECT 1 FROM pg_attribute attribute CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) AS privilege(name)
        WHERE attribute.attrelid=relation.oid AND attribute.attnum>0 AND NOT attribute.attisdropped
          AND (has_column_privilege('${role}',relation.oid,attribute.attname,privilege.name) IS DISTINCT FROM (
            privilege.name IN ('SELECT','INSERT') OR (privilege.name='UPDATE' AND contract.name='admin_nestjs_quality_board'
              AND attribute.attname::text=ANY(ARRAY['document','revision','updated_by','updated_at'])))
            OR has_column_privilege('${role}',relation.oid,attribute.attname,privilege.name || ' WITH GRANT OPTION')
            OR has_column_privilege(0::oid,relation.oid,attribute.attname,privilege.name))
      )
  ) THEN
    RAISE EXCEPTION 'NestJS verification board runtime privileges are incompatible';
  END IF;
END $nestjs_quality_capability$;`;
}
