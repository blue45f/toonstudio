/** 공용 운영 보드의 감사·영수증은 런타임에서 추가만 가능하다. */
export const AI_OPERATIONS_RELATIONS = Object.freeze([
  ["admin_ai_operations_board", false, ["revision", "payload", "updated_at"]],
  ["admin_ai_operations_audit", true, []],
  ["admin_ai_operations_receipt", true, []],
]);

function identifier(value, allowPublic = false) {
  if (typeof value !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/u.test(value) || (!allowPublic && value === "public")) {
    throw new Error("운영 보드 DB 역할·스키마에 안전한 명시적 이름이 필요합니다.");
  }
  return value;
}

export function buildAiOperationsRuntimeAclSql(runtimeRole, targetSchema = "public") {
  const role = identifier(runtimeRole);
  const schema = identifier(targetSchema, true);
  return "BEGIN;\n" + AI_OPERATIONS_RELATIONS.map(([name, insert, mutable]) => `
DO $ai_operations_acl$
DECLARE columns text;
BEGIN
  SELECT string_agg(format('%I',attname),', ' ORDER BY attnum) INTO columns
    FROM pg_catalog.pg_attribute WHERE attrelid='"${schema}".${name}'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE "${schema}".${name} FROM "${role}", PUBLIC', columns);
END $ai_operations_acl$;
REVOKE ALL ON TABLE "${schema}".${name} FROM "${role}", PUBLIC;
GRANT SELECT${insert ? ", INSERT" : ""} ON TABLE "${schema}".${name} TO "${role}";
${mutable.length ? `GRANT UPDATE (${mutable.map((column) => `"${column}"`).join(", ")}) ON TABLE "${schema}".${name} TO "${role}";` : ""}
`).join("\n") + "COMMIT;";
}

export function buildAiOperationsRuntimeAclViolationSql(runtimeRole, targetSchema = "public") {
  const role = identifier(runtimeRole);
  const schema = identifier(targetSchema, true);
  const values = AI_OPERATIONS_RELATIONS.map(([name, insert, mutable]) =>
    `('${name}'::text,${insert},ARRAY[${mutable.map((column) => `'${column}'`).join(",")}]::text[])`).join(",\n");
  return `EXISTS (
    SELECT 1 FROM (VALUES ${values}) AS contract(name,can_insert,mutable)
    LEFT JOIN pg_catalog.pg_class relation ON relation.oid=to_regclass('"${schema}".' || contract.name)
    WHERE relation.oid IS NULL OR relation.relowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='${role}')
      OR EXISTS (
        SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS privilege(name)
        WHERE pg_catalog.has_table_privilege('${role}',relation.oid,privilege.name) IS DISTINCT FROM (
          privilege.name='SELECT' OR (privilege.name='INSERT' AND contract.can_insert))
          OR pg_catalog.has_table_privilege('${role}',relation.oid,privilege.name || ' WITH GRANT OPTION')
          OR pg_catalog.has_table_privilege(0::oid,relation.oid,privilege.name)
      )
      OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute attribute CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) AS privilege(name)
        WHERE attribute.attrelid=relation.oid AND attribute.attnum>0 AND NOT attribute.attisdropped
          AND (pg_catalog.has_column_privilege('${role}',relation.oid,attribute.attname,privilege.name) IS DISTINCT FROM (
            privilege.name='SELECT' OR (privilege.name='INSERT' AND contract.can_insert)
            OR (privilege.name='UPDATE' AND attribute.attname::text=ANY(contract.mutable)))
            OR pg_catalog.has_column_privilege('${role}',relation.oid,attribute.attname,privilege.name || ' WITH GRANT OPTION')
            OR pg_catalog.has_column_privilege(0::oid,relation.oid,attribute.attname,privilege.name))
      )
  )`;
}

export function buildAiOperationsCapabilitySql(runtimeRole, targetSchema = "public") {
  return `DO $ai_operations_capability$ BEGIN
    IF ${buildAiOperationsRuntimeAclViolationSql(runtimeRole, targetSchema)} THEN
      RAISE EXCEPTION 'AI 운영 보드의 런타임 권한이 공용 기록·감사 보존 계약과 다릅니다';
    END IF;
  END $ai_operations_capability$;`;
}
