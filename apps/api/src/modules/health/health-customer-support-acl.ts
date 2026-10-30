/** 비공개 상담 기록과 유료 호출 예약의 최소 권한을 확인한다. */
export const CUSTOMER_SUPPORT_ACL_READY_SQL = `NOT (
  EXISTS (
    SELECT 1 FROM unnest(ARRAY['customer_support_conversation','customer_support_message','customer_support_ai_attempt']) AS contract(name)
    LEFT JOIN pg_class relation ON relation.oid=to_regclass('public.' || contract.name)
    WHERE relation.oid IS NULL OR relation.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
      OR EXISTS (
        SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS privilege(name)
        WHERE has_table_privilege(current_user,relation.oid,privilege.name) IS DISTINCT FROM (privilege.name IN ('SELECT','INSERT'))
          OR has_table_privilege(current_user,relation.oid,privilege.name || ' WITH GRANT OPTION')
          OR has_table_privilege(0::oid,relation.oid,privilege.name)
      )
      OR EXISTS (
        SELECT 1 FROM pg_attribute attribute CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) AS privilege(name)
        WHERE attribute.attrelid=relation.oid AND attribute.attnum>0 AND NOT attribute.attisdropped
          AND (has_column_privilege(current_user,relation.oid,attribute.attname,privilege.name) IS DISTINCT FROM (
            privilege.name IN ('SELECT','INSERT') OR (privilege.name='UPDATE' AND contract.name='customer_support_conversation'
              AND attribute.attname::text=ANY(ARRAY['status','aiLease','aiLeaseUntil','updatedAt'])))
            OR has_column_privilege(current_user,relation.oid,attribute.attname,privilege.name || ' WITH GRANT OPTION')
            OR has_column_privilege(0::oid,relation.oid,attribute.attname,privilege.name))
      )
  )
  OR to_regclass('public.customer_support_message_sequence_seq') IS NULL
  OR EXISTS (
    SELECT 1 FROM unnest(ARRAY['USAGE','SELECT','UPDATE']) AS privilege(name)
    WHERE has_sequence_privilege(current_user,to_regclass('public.customer_support_message_sequence_seq'),privilege.name)
        IS DISTINCT FROM (privilege.name IN ('USAGE','SELECT'))
      OR has_sequence_privilege(current_user,to_regclass('public.customer_support_message_sequence_seq'),privilege.name || ' WITH GRANT OPTION')
      OR has_sequence_privilege(0::oid,to_regclass('public.customer_support_message_sequence_seq'),privilege.name)
  )
)`;
