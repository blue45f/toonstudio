const RELATIONS = ["admin_final_submission", "admin_final_submission_audit", "admin_final_submission_receipt"];
const MUTABLE = ["revision", "payload", "updated_at"];

function identifier(value, allowPublic = false) {
  if (typeof value !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/u.test(value) || (!allowPublic && value === "public")) {
    throw new Error("최종 제출 점검 DB에는 안전한 런타임 역할·스키마 이름이 필요합니다.");
  }
  return value;
}

/** 현재 개인 기록의 지정 열만 수정하며 감사·영수증은 추가만 허용한다. */
export function buildFinalSubmissionRuntimeAclSql(runtimeRole, schema = "public") {
  const role = identifier(runtimeRole), namespace = identifier(schema, true);
  return RELATIONS.map((table) => `
DO $final_submission_columns$
DECLARE columns text;
BEGIN
  SELECT string_agg(format('%I',attname),', ' ORDER BY attnum) INTO columns
    FROM pg_catalog.pg_attribute WHERE attrelid='${namespace}.${table}'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE "${namespace}".${table} FROM PUBLIC, "${role}"',columns);
END $final_submission_columns$;
REVOKE ALL ON TABLE "${namespace}".${table} FROM PUBLIC, "${role}";
GRANT SELECT, INSERT ON TABLE "${namespace}".${table} TO "${role}";
${table === RELATIONS[0] ? `GRANT UPDATE (${MUTABLE.map(name => `"${name}"`).join(", ")}) ON TABLE "${namespace}".${table} TO "${role}";` : ""}
ALTER TABLE "${namespace}".${table} ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ${table}_owner ON "${namespace}".${table};
CREATE POLICY ${table}_owner ON "${namespace}".${table} TO "${role}"
  USING (owner_user_id=current_setting('toonstudio.final_submission_owner',true))
  WITH CHECK (owner_user_id=current_setting('toonstudio.final_submission_owner',true));
`).join("\n") + `REVOKE ALL ON FUNCTION "${namespace}".admin_final_submission_immutable_guard() FROM PUBLIC, "${role}";`;
}

/** 읽기 전용 검증. 소유자 분리·이력 보존·권한 위임 금지를 검사한다. */
export function buildFinalSubmissionCapabilitySql(runtimeRole, schema = "public") {
  const role = identifier(runtimeRole), namespace = identifier(schema, true);
  return `DO $final_submission_capability$
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(ARRAY[${RELATIONS.map(name => `'${name}'`).join(", ")}]) contract(name)
    LEFT JOIN pg_class relation ON relation.oid=to_regclass('${namespace}.' || contract.name)
    WHERE relation.oid IS NULL OR NOT relation.relrowsecurity
      OR pg_has_role('${role}',relation.relowner,'USAGE')
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege(name)
        WHERE has_table_privilege('${role}',relation.oid,privilege.name) IS DISTINCT FROM (privilege.name IN ('SELECT','INSERT'))
          OR has_table_privilege('${role}',relation.oid,privilege.name || ' WITH GRANT OPTION')
          OR has_table_privilege(0::oid,relation.oid,privilege.name))
      OR EXISTS (SELECT 1 FROM pg_attribute attribute
        WHERE attribute.attrelid=relation.oid AND attribute.attnum>0 AND NOT attribute.attisdropped
          AND (has_column_privilege('${role}',relation.oid,attribute.attname,'UPDATE') IS DISTINCT FROM
            (contract.name='admin_final_submission' AND attribute.attname::text=ANY(ARRAY[${MUTABLE.map(name => `'${name}'`).join(", ")}]))
            OR has_column_privilege('${role}',relation.oid,attribute.attname,'SELECT WITH GRANT OPTION, INSERT WITH GRANT OPTION, UPDATE WITH GRANT OPTION, REFERENCES WITH GRANT OPTION')
            OR has_column_privilege(0::oid,relation.oid,attribute.attname,'SELECT, INSERT, UPDATE, REFERENCES')))
      OR NOT EXISTS (SELECT 1 FROM pg_policy policy WHERE policy.polrelid=relation.oid
        AND policy.polname=contract.name || '_owner'
        AND (SELECT oid FROM pg_roles WHERE rolname='${role}')=ANY(policy.polroles)
        AND pg_get_expr(policy.polqual,policy.polrelid) LIKE '%toonstudio.final_submission_owner%'
        AND pg_get_expr(policy.polwithcheck,policy.polrelid) LIKE '%toonstudio.final_submission_owner%')
  ) OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${role}' AND (rolsuper OR rolbypassrls))
  THEN RAISE EXCEPTION 'final submission runtime privileges are incompatible'; END IF;
  IF to_regprocedure('${namespace}.admin_final_submission_immutable_guard()') IS NULL
    OR has_function_privilege('${role}','${namespace}.admin_final_submission_immutable_guard()','EXECUTE')
  THEN RAISE EXCEPTION 'final submission immutable history guard is missing'; END IF;
  IF EXISTS (SELECT 1 FROM (VALUES
    ('admin_final_submission','admin_final_submission_delete_guard',11),
    ('admin_final_submission','admin_final_submission_truncate_guard',34),
    ('admin_final_submission_audit','admin_final_submission_audit_immutable',27),
    ('admin_final_submission_audit','admin_final_submission_audit_truncate_guard',34),
    ('admin_final_submission_receipt','admin_final_submission_receipt_immutable',27),
    ('admin_final_submission_receipt','admin_final_submission_receipt_truncate_guard',34)
  ) required(relation_name,trigger_name,trigger_type) WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger trigger_record
    WHERE trigger_record.tgrelid=to_regclass('${namespace}.' || required.relation_name)
      AND trigger_record.tgname=required.trigger_name AND trigger_record.tgtype=required.trigger_type
      AND trigger_record.tgenabled IN ('O','A')
      AND trigger_record.tgfoid='${namespace}.admin_final_submission_immutable_guard()'::regprocedure
  )) THEN RAISE EXCEPTION 'final submission history triggers are incompatible'; END IF;
END $final_submission_capability$;`;
}
