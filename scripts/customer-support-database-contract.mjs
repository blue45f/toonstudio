/** 비공개 고객상담의 런타임 권한. 대화 식별자와 메시지·과금 예약은 수정하지 않는다. */
export const CUSTOMER_SUPPORT_RELATIONS = Object.freeze([
  "customer_support_conversation", "customer_support_message", "customer_support_ai_attempt",
]);
const MUTABLE_COLUMNS = ["status", "aiLease", "aiLeaseUntil", "updatedAt"];

function identifier(value) {
  if (typeof value !== "string" || !/^[a-z_][a-z0-9_]{0,62}$/u.test(value) || value === "public") {
    throw new Error("고객상담 runtime 역할에 안전한 명시적 PostgreSQL 이름이 필요합니다.");
  }
  return value;
}

export function buildCustomerSupportRuntimeAclSql(runtimeRole) {
  const role = identifier(runtimeRole);
  const relations = CUSTOMER_SUPPORT_RELATIONS.map((name) => `public.${name}`).join(", ");
  return `BEGIN;
REVOKE ALL ON TABLE ${relations} FROM PUBLIC, "${role}";
DO $support_acl$
DECLARE relation_name text; columns text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[${CUSTOMER_SUPPORT_RELATIONS.map((name) => `'${name}'`).join(", ")}] LOOP
    SELECT string_agg(format('%I', attname), ', ') INTO columns FROM pg_attribute
      WHERE attrelid=format('public.%I', relation_name)::regclass AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC, "${role}"', columns, relation_name);
  END LOOP;
END $support_acl$;
GRANT SELECT, INSERT ON TABLE ${relations} TO "${role}";
GRANT UPDATE (${MUTABLE_COLUMNS.map((name) => `"${name}"`).join(", ")}) ON TABLE public.customer_support_conversation TO "${role}";
REVOKE ALL ON SEQUENCE public.customer_support_message_sequence_seq FROM PUBLIC, "${role}";
GRANT USAGE, SELECT ON SEQUENCE public.customer_support_message_sequence_seq TO "${role}";
COMMIT;`;
}

export function buildCustomerSupportRuntimeAclViolationSql(runtimeRole) {
  const role = `'${identifier(runtimeRole)}'`;
  return supportAclViolationSql(role);
}

// current_user를 사용하는 API 준비 상태 검사와 같은 판정식이다.
function supportAclViolationSql(role) {
  return `(
  EXISTS (
    SELECT 1 FROM unnest(ARRAY['customer_support_conversation','customer_support_message','customer_support_ai_attempt']) AS contract(name)
    LEFT JOIN pg_class relation ON relation.oid=to_regclass('public.' || contract.name)
    WHERE relation.oid IS NULL OR relation.relowner=(SELECT oid FROM pg_roles WHERE rolname=${role})
      OR EXISTS (
        SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS privilege(name)
        WHERE has_table_privilege(${role},relation.oid,privilege.name) IS DISTINCT FROM (privilege.name IN ('SELECT','INSERT'))
          OR has_table_privilege(${role},relation.oid,privilege.name || ' WITH GRANT OPTION')
          OR has_table_privilege(0::oid,relation.oid,privilege.name)
      )
      OR EXISTS (
        SELECT 1 FROM pg_attribute attribute CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) AS privilege(name)
        WHERE attribute.attrelid=relation.oid AND attribute.attnum>0 AND NOT attribute.attisdropped
          AND (has_column_privilege(${role},relation.oid,attribute.attname,privilege.name) IS DISTINCT FROM (
            privilege.name IN ('SELECT','INSERT') OR (privilege.name='UPDATE' AND contract.name='customer_support_conversation'
              AND attribute.attname::text=ANY(ARRAY['status','aiLease','aiLeaseUntil','updatedAt'])))
            OR has_column_privilege(${role},relation.oid,attribute.attname,privilege.name || ' WITH GRANT OPTION')
            OR has_column_privilege(0::oid,relation.oid,attribute.attname,privilege.name))
      )
  )
  OR to_regclass('public.customer_support_message_sequence_seq') IS NULL
  OR EXISTS (
    SELECT 1 FROM unnest(ARRAY['USAGE','SELECT','UPDATE']) AS privilege(name)
    WHERE has_sequence_privilege(${role},to_regclass('public.customer_support_message_sequence_seq'),privilege.name)
        IS DISTINCT FROM (privilege.name IN ('USAGE','SELECT'))
      OR has_sequence_privilege(${role},to_regclass('public.customer_support_message_sequence_seq'),privilege.name || ' WITH GRANT OPTION')
      OR has_sequence_privilege(0::oid,to_regclass('public.customer_support_message_sequence_seq'),privilege.name)
  )
)`;
}

export function buildCustomerSupportCapabilitySql(runtimeRole) {
  return `DO $support_capability$ BEGIN
  IF ${buildCustomerSupportRuntimeAclViolationSql(runtimeRole)} THEN
    RAISE EXCEPTION 'customer support runtime privileges violate the immutable transcript contract';
  END IF;
END $support_capability$;`;
}
