/**
 * 운영 DB 마이그레이션 러너의 핵심 도메인(인증·트래픽·크리에이터 워크스페이스·클라우드·댓글·메시징·컷오버 원장) 런타임 ACL SQL 빌더.
 */
import { validateRuntimeDatabaseRole } from "../validate-production-database-url.mjs";
import { sqlLiteral } from "./production-db-migrations-planning.mjs";

export function buildAuthRuntimeAclSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const quotedRole = `"${role}"`;
  return `
REVOKE ALL ON TABLE
  public."user",
  public.account,
  public.account_merge
FROM PUBLIC;

REVOKE ALL ON TABLE
  public."user",
  public.account,
  public.account_merge
FROM ${quotedRole};

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public."user", public.account
  TO ${quotedRole};

GRANT SELECT, INSERT
  ON TABLE public.account_merge
  TO ${quotedRole};
GRANT UPDATE ("targetUserId", status, "completedAt", summary)
  ON TABLE public.account_merge
  TO ${quotedRole};
`;
}

export function buildTrafficAnalyticsRuntimeAclSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const quotedRole = `"${role}"`;
  return `
REVOKE ALL ON TABLE
  public.traffic_page_view,
  public.traffic_session,
  public.traffic_share_event
FROM PUBLIC;

REVOKE ALL ON TABLE
  public.traffic_page_view,
  public.traffic_session,
  public.traffic_share_event
FROM ${quotedRole};

GRANT SELECT, INSERT, DELETE
  ON TABLE public.traffic_page_view, public.traffic_share_event
  TO ${quotedRole};
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.traffic_session
  TO ${quotedRole};
`;
}

/**
 * Keep analytics collection private while allowing ingestion, admin reads, and
 * retention cleanup. Page/share events are append-only from the application.
 */
export function buildTrafficAnalyticsRuntimeAclViolationSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const roleLiteral = sqlLiteral(role);
  return `(
    NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.traffic_page_view',
      'SELECT, INSERT, DELETE'
    )
    OR pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.traffic_page_view',
      'UPDATE'
    )
    OR NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.traffic_share_event',
      'SELECT, INSERT, DELETE'
    )
    OR pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.traffic_share_event',
      'UPDATE'
    )
    OR NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.traffic_session',
      'SELECT, INSERT, UPDATE, DELETE'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'public.traffic_page_view',
        'public.traffic_session',
        'public.traffic_share_event'
      ]::text[]) AS relation_name
      CROSS JOIN unnest(ARRAY[
        'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]::text[]) AS elevated_privilege
      WHERE pg_catalog.has_table_privilege(
        ${roleLiteral},
        relation_name,
        elevated_privilege
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'public.traffic_page_view',
        'public.traffic_session',
        'public.traffic_share_event'
      ]::text[]) AS relation_name
      CROSS JOIN unnest(ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]::text[]) AS public_privilege
      WHERE pg_catalog.has_table_privilege(0::oid, relation_name, public_privilege)
    )
  )`;
}

/**
 * Role workspace identity is user-scoped. The runtime may create and read rows,
 * then advance only the optimistic revision, normalized document, and timestamp.
 */
export function buildCreatorRoleWorkspaceRuntimeAclSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const quotedRole = `"${role}"`;
  return `
DO $creator_role_workspace_acl$
DECLARE
  column_list text;
BEGIN
  SELECT string_agg(format('%I', attribute.attname), ', ' ORDER BY attribute.attnum)
  INTO column_list
  FROM pg_catalog.pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.creator_role_workspace_preference'::regclass
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  EXECUTE format(
    'REVOKE ALL PRIVILEGES (%s) ON TABLE public.creator_role_workspace_preference FROM %I',
    column_list,
    ${sqlLiteral(role)}
  );
  EXECUTE format(
    'REVOKE ALL PRIVILEGES (%s) ON TABLE public.creator_role_workspace_preference FROM PUBLIC',
    column_list
  );
END
$creator_role_workspace_acl$;

REVOKE ALL ON TABLE public.creator_role_workspace_preference FROM PUBLIC;
REVOKE ALL ON TABLE public.creator_role_workspace_preference FROM ${quotedRole};
GRANT SELECT, INSERT
  ON TABLE public.creator_role_workspace_preference
  TO ${quotedRole};
GRANT UPDATE ("revision", "document", "updatedAt")
  ON TABLE public.creator_role_workspace_preference
  TO ${quotedRole};
`;
}

export function buildCreatorRoleWorkspaceRuntimeAclViolationSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const roleLiteral = sqlLiteral(role);
  return `(
    NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_role_workspace_preference',
      'SELECT, INSERT'
    )
    OR pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_role_workspace_preference',
      'UPDATE'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]::text[]) AS unexpected_privilege
      WHERE pg_catalog.has_table_privilege(
        ${roleLiteral},
        'public.creator_role_workspace_preference',
        unexpected_privilege
      )
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = 'public.creator_role_workspace_preference'::regclass
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND pg_catalog.has_column_privilege(
          ${roleLiteral},
          'public.creator_role_workspace_preference',
          attribute.attname,
          'UPDATE'
        ) <> (attribute.attname = ANY(ARRAY[
          'revision', 'document', 'updatedAt'
        ]::text[]))
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = 'public.creator_role_workspace_preference'::regclass
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND pg_catalog.has_column_privilege(
          ${roleLiteral},
          'public.creator_role_workspace_preference',
          attribute.attname,
          'UPDATE WITH GRANT OPTION'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]::text[]) AS public_privilege
      WHERE pg_catalog.has_table_privilege(
        0::oid,
        'public.creator_role_workspace_preference',
        public_privilege
      )
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute
      CROSS JOIN unnest(ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
      ]::text[]) AS public_column_privilege
      WHERE attribute.attrelid = 'public.creator_role_workspace_preference'::regclass
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND pg_catalog.has_column_privilege(
          0::oid,
          'public.creator_role_workspace_preference',
          attribute.attname,
          public_column_privilege
        )
    )
  )`;
}

export function buildPersonalCloudRuntimeAclSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const quotedRole = `"${role}"`;
  return `
REVOKE ALL ON TABLE public.personal_cloud_connection FROM PUBLIC;
REVOKE ALL ON TABLE public.personal_cloud_connection FROM ${quotedRole};
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.personal_cloud_connection
  TO ${quotedRole};
`;
}

export function buildCommunityCommentRuntimeAclSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const quotedRole = `"${role}"`;
  return `
REVOKE ALL ON TABLE
  public.creator_work_comment,
  public.creator_work_comment_like,
  public.creator_promotion_comment,
  public.creator_promotion_comment_like
FROM PUBLIC;

REVOKE ALL ON TABLE
  public.creator_work_comment,
  public.creator_work_comment_like,
  public.creator_promotion_comment,
  public.creator_promotion_comment_like
FROM ${quotedRole};

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.creator_work_comment,
  public.creator_work_comment_like,
  public.creator_promotion_comment,
  public.creator_promotion_comment_like
TO ${quotedRole};
`;
}

export function buildCommunityCommentRuntimeAclViolationSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const roleLiteral = sqlLiteral(role);
  return `EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'public.creator_work_comment',
      'public.creator_work_comment_like',
      'public.creator_promotion_comment',
      'public.creator_promotion_comment_like'
    ]::text[]) AS relation_name
    WHERE NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      relation_name,
      'SELECT, INSERT, UPDATE, DELETE'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER']::text[]) AS elevated_privilege
      WHERE pg_catalog.has_table_privilege(${roleLiteral}, relation_name, elevated_privilege)
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]::text[]) AS public_privilege
      WHERE pg_catalog.has_table_privilege(0::oid, relation_name, public_privilege)
    )
  )`;
}

export function buildPersonalCloudRuntimeAclViolationSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const roleLiteral = sqlLiteral(role);
  return `(
    NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.personal_cloud_connection',
      'SELECT, INSERT, UPDATE, DELETE'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER'
      ]::text[]) AS elevated_privilege
      WHERE pg_catalog.has_table_privilege(
        ${roleLiteral},
        'public.personal_cloud_connection',
        elevated_privilege
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER'
      ]::text[]) AS public_privilege
      WHERE pg_catalog.has_table_privilege(
        0::oid,
        'public.personal_cloud_connection',
        public_privilege
      )
    )
  )`;
}

const MESSAGING_RUNTIME_RELATIONS = Object.freeze([
  "member_message",
  "member_message_block",
  "member_message_participant",
  "member_message_preference",
  "member_message_report",
  "member_message_thread",
]);

export function buildMessagingRuntimeAclSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const quotedRole = `"${role}"`;
  const relations = MESSAGING_RUNTIME_RELATIONS
    .map((relation) => `public.${relation}`)
    .join(",\n  ");
  return `
REVOKE ALL ON TABLE
  ${relations}
FROM PUBLIC;
REVOKE ALL ON TABLE
  ${relations}
FROM ${quotedRole};
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE ${relations}
  TO ${quotedRole};
`;
}

export function buildMessagingRuntimeAclViolationSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const roleLiteral = sqlLiteral(role);
  const checks = MESSAGING_RUNTIME_RELATIONS.map((relation) => `(
    NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.${relation}',
      'SELECT, INSERT, UPDATE, DELETE'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER']::text[]) AS elevated_privilege
      WHERE pg_catalog.has_table_privilege(
        ${roleLiteral},
        'public.${relation}',
        elevated_privilege
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]::text[]) AS public_privilege
      WHERE pg_catalog.has_table_privilege(
        0::oid,
        'public.${relation}',
        public_privilege
      )
    )
  )`).join("\n    OR ");
  return `(${checks})`;
}

export function buildAuthRuntimeAclViolationSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const roleLiteral = sqlLiteral(role);
  return `(
    NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public."user"',
      'SELECT, INSERT, UPDATE, DELETE'
    )
    OR NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.account',
      'SELECT, INSERT, UPDATE, DELETE'
    )
    OR NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.account_merge',
      'SELECT, INSERT'
    )
    OR pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.account_merge',
      'UPDATE, DELETE'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'targetUserId', 'status', 'completedAt', 'summary'
      ]::text[]) AS mutable_column
      WHERE NOT pg_catalog.has_column_privilege(
        ${roleLiteral},
        'public.account_merge',
        mutable_column,
        'UPDATE'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'id', 'sourceUserId', 'tokenHash', 'expiresAt', 'createdAt'
      ]::text[]) AS immutable_column
      WHERE pg_catalog.has_column_privilege(
        ${roleLiteral},
        'public.account_merge',
        immutable_column,
        'UPDATE'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'public."user"',
        'public.account',
        'public.account_merge'
      ]::text[]) AS relation_name
      CROSS JOIN unnest(ARRAY[
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER'
      ]::text[]) AS elevated_privilege
      WHERE pg_catalog.has_table_privilege(
        ${roleLiteral},
        relation_name,
        elevated_privilege
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'public."user"',
        'public.account',
        'public.account_merge'
      ]::text[]) AS relation_name
      CROSS JOIN unnest(ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ]::text[]) AS public_privilege
      WHERE pg_catalog.has_table_privilege(
        0::oid,
        relation_name,
        public_privilege
      )
    )
    OR pg_catalog.has_any_column_privilege(
      0::oid,
      'public.account_merge',
      'UPDATE'
    )
  )`;
}

/**
 * Runtime readiness reads the legacy product-schema ledger only to prove destructive cutovers.
 * Keep that narrow read boundary separate from the deployment-only toonspectrum_ops ledger, which
 * the application role must never be able to inspect.
 */
export function buildRuntimeCutoverLedgerAclSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const quotedRole = `"${role}"`;
  return `
REVOKE ALL ON TABLE public.toonspectrum_schema_migration FROM PUBLIC;
REVOKE ALL ON TABLE public.toonspectrum_schema_migration FROM ${quotedRole};
GRANT SELECT ("id") ON TABLE public.toonspectrum_schema_migration TO ${quotedRole};
`;
}

/**
 * A true result means the readiness ledger is unreadable, writable, publicly exposed, or
 * delegable by the runtime role. Table and column checks are both required because PostgreSQL can
 * retain column grants independently of the table ACL.
 */
export function buildRuntimeCutoverLedgerAclViolationSql(
  runtimeDatabaseRole,
) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const roleLiteral = sqlLiteral(role);
  return `(
    NOT pg_catalog.has_column_privilege(
      ${roleLiteral},
      'public.toonspectrum_schema_migration',
      'id',
      'SELECT'
    )
    OR pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.toonspectrum_schema_migration',
      'SELECT'
    )
    OR pg_catalog.has_column_privilege(
      ${roleLiteral},
      'public.toonspectrum_schema_migration',
      'appliedAt',
      'SELECT'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'INSERT',
        'UPDATE',
        'REFERENCES'
      ]::text[]) AS unexpected_column_privilege
      WHERE pg_catalog.has_any_column_privilege(
        ${roleLiteral},
        'public.toonspectrum_schema_migration',
        unexpected_column_privilege
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'DELETE',
        'TRUNCATE',
        'TRIGGER'
      ]::text[]) AS unexpected_table_privilege
      WHERE pg_catalog.has_table_privilege(
        ${roleLiteral},
        'public.toonspectrum_schema_migration',
        unexpected_table_privilege
      )
    )
    OR pg_catalog.has_any_column_privilege(
      ${roleLiteral},
      'public.toonspectrum_schema_migration',
      'SELECT WITH GRANT OPTION'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'SELECT',
        'INSERT',
        'UPDATE',
        'REFERENCES'
      ]::text[]) AS public_column_privilege
      WHERE pg_catalog.has_any_column_privilege(
        0::oid,
        'public.toonspectrum_schema_migration',
        public_column_privilege
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'DELETE',
        'TRUNCATE',
        'TRIGGER'
      ]::text[]) AS public_table_privilege
      WHERE pg_catalog.has_table_privilege(
        0::oid,
        'public.toonspectrum_schema_migration',
        public_table_privilege
      )
    )
  )`;
}
