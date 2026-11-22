/**
 * 운영 DB 마이그레이션 러너의 크리에이터 마켓플레이스 런타임 ACL SQL 빌더.
 */
import { validateRuntimeDatabaseRole } from "../validate-production-database-url.mjs";
import { sqlLiteral } from "./production-db-migrations-planning.mjs";

export function buildCreatorMarketplaceRuntimeAclSql(
  runtimeDatabaseRole,
) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const quotedRole = `"${role}"`;
  return `
DO $creator_marketplace_acl$
DECLARE
  relation_name text;
  column_list text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'creator_marketplace_resource',
    'creator_marketplace_library_item',
    'creator_marketplace_package_moderation',
    'creator_marketplace_package_moderation_decision',
    'creator_marketplace_publish_gate',
    'creator_marketplace_resource_report',
    'creator_marketplace_resource_report_gate'
  ]::text[] LOOP
    SELECT string_agg(format('%I', attribute.attname), ', ' ORDER BY attribute.attnum)
    INTO column_list
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = format('public.%I', relation_name)::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped;

    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM %I',
      column_list,
      relation_name,
      ${sqlLiteral(role)}
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC',
      column_list,
      relation_name
    );
  END LOOP;
END
$creator_marketplace_acl$;

REVOKE ALL ON TABLE
  public.creator_marketplace_resource,
  public.creator_marketplace_library_item,
  public.creator_marketplace_package_moderation,
  public.creator_marketplace_package_moderation_decision,
  public.creator_marketplace_publish_gate,
  public.creator_marketplace_resource_report,
  public.creator_marketplace_resource_report_gate
FROM PUBLIC;

REVOKE ALL ON TABLE
  public.creator_marketplace_resource,
  public.creator_marketplace_library_item,
  public.creator_marketplace_package_moderation,
  public.creator_marketplace_package_moderation_decision,
  public.creator_marketplace_publish_gate,
  public.creator_marketplace_resource_report,
  public.creator_marketplace_resource_report_gate
FROM ${quotedRole};

GRANT SELECT, INSERT
  ON TABLE public.creator_marketplace_resource
  TO ${quotedRole};
GRANT UPDATE ("delistedAt", "updatedAt")
  ON TABLE public.creator_marketplace_resource
  TO ${quotedRole};

GRANT SELECT, INSERT
  ON TABLE public.creator_marketplace_library_item
  TO ${quotedRole};
GRANT UPDATE (
  "archivedAt",
  "lastConfirmedReleaseId",
  "lastConfirmedResourceVersion",
  "lastConfirmedReleaseOrdinal",
  "lastConfirmedManifestHash",
  "firstConfirmedAt",
  "lastConfirmedAt",
  "updatedAt"
)
  ON TABLE public.creator_marketplace_library_item
  TO ${quotedRole};

GRANT SELECT, INSERT
  ON TABLE public.creator_marketplace_package_moderation
  TO ${quotedRole};
GRANT UPDATE (
  "state",
  "revision",
  "currentDecisionId",
  "hiddenAt",
  "updatedAt"
)
  ON TABLE public.creator_marketplace_package_moderation
  TO ${quotedRole};

GRANT SELECT, INSERT
  ON TABLE public.creator_marketplace_package_moderation_decision
  TO ${quotedRole};

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.creator_marketplace_publish_gate
  TO ${quotedRole};

GRANT SELECT, INSERT
  ON TABLE public.creator_marketplace_resource_report
  TO ${quotedRole};
GRANT UPDATE ("status", "resolutionNote", "reviewedBy", "reviewedAt")
  ON TABLE public.creator_marketplace_resource_report
  TO ${quotedRole};

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.creator_marketplace_resource_report_gate
  TO ${quotedRole};
`;
}

/**
 * Marketplace reads and writes run through a dedicated, non-owning runtime role. Keep its resource
 * and distributed admission tables on the smallest contract used by the repositories. Release
 * content is immutable after insert; release lifecycle writes are limited to owner list/relist
 * timestamps, while package moderation is authoritative in its own append-only decision/state
 * relations. Private cloud-library writes are limited to archive and monotonic confirmation facts.
 * Publish-gate rows require their existing bounded table-level updates.
 */
export function buildCreatorMarketplaceRuntimeAclViolationSql(
  runtimeDatabaseRole,
) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const roleLiteral = sqlLiteral(role);
  return `(
    NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_marketplace_resource',
      'SELECT'
    )
    OR NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_marketplace_resource',
      'INSERT'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'REFERENCES'
      ]::text[]) AS unexpected_column_privilege
      WHERE pg_catalog.has_any_column_privilege(
        ${roleLiteral},
        'public.creator_marketplace_resource',
        unexpected_column_privilege
      )
    )
    OR pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_marketplace_resource',
      'UPDATE'
    )
    OR pg_catalog.has_column_privilege(
      ${roleLiteral},
      'public.creator_marketplace_resource',
      'hidden',
      'UPDATE'
    )
    OR NOT pg_catalog.has_column_privilege(
      ${roleLiteral},
      'public.creator_marketplace_resource',
      'delistedAt',
      'UPDATE'
    )
    OR NOT pg_catalog.has_column_privilege(
      ${roleLiteral},
      'public.creator_marketplace_resource',
      'updatedAt',
      'UPDATE'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS immutable_attribute
      WHERE immutable_attribute.attrelid =
        'public.creator_marketplace_resource'::regclass
        AND immutable_attribute.attnum > 0
        AND NOT immutable_attribute.attisdropped
        AND immutable_attribute.attname <>
          ALL(ARRAY['delistedAt', 'updatedAt']::name[])
        AND pg_catalog.has_column_privilege(
          ${roleLiteral},
          'public.creator_marketplace_resource',
          immutable_attribute.attname,
          'UPDATE'
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
        'public.creator_marketplace_resource',
        unexpected_table_privilege
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'SELECT',
        'INSERT'
      ]::text[]) AS delegable_column_privilege
      WHERE pg_catalog.has_any_column_privilege(
        ${roleLiteral},
        'public.creator_marketplace_resource',
        delegable_column_privilege || ' WITH GRANT OPTION'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY['delistedAt', 'updatedAt']::text[]) AS lifecycle_column
      WHERE pg_catalog.has_column_privilege(
        ${roleLiteral},
        'public.creator_marketplace_resource',
        lifecycle_column,
        'UPDATE WITH GRANT OPTION'
      )
    )
    OR NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_marketplace_library_item',
      'SELECT'
    )
    OR NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_marketplace_library_item',
      'INSERT'
    )
    OR pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_marketplace_library_item',
      'UPDATE'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'archivedAt',
        'lastConfirmedReleaseId',
        'lastConfirmedResourceVersion',
        'lastConfirmedReleaseOrdinal',
        'lastConfirmedManifestHash',
        'firstConfirmedAt',
        'lastConfirmedAt',
        'updatedAt'
      ]::text[]) AS mutable_column
      WHERE NOT pg_catalog.has_column_privilege(
        ${roleLiteral},
        'public.creator_marketplace_library_item',
        mutable_column,
        'UPDATE'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS immutable_attribute
      WHERE immutable_attribute.attrelid =
        'public.creator_marketplace_library_item'::regclass
        AND immutable_attribute.attnum > 0
        AND NOT immutable_attribute.attisdropped
        AND immutable_attribute.attname <> ALL(ARRAY[
          'archivedAt',
          'lastConfirmedReleaseId',
          'lastConfirmedResourceVersion',
          'lastConfirmedReleaseOrdinal',
          'lastConfirmedManifestHash',
          'firstConfirmedAt',
          'lastConfirmedAt',
          'updatedAt'
        ]::name[])
        AND pg_catalog.has_column_privilege(
          ${roleLiteral},
          'public.creator_marketplace_library_item',
          immutable_attribute.attname,
          'UPDATE'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY['DELETE', 'TRUNCATE', 'TRIGGER']::text[])
        AS unexpected_table_privilege
      WHERE pg_catalog.has_table_privilege(
        ${roleLiteral},
        'public.creator_marketplace_library_item',
        unexpected_table_privilege
      )
    )
    OR pg_catalog.has_any_column_privilege(
      ${roleLiteral},
      'public.creator_marketplace_library_item',
      'REFERENCES'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY['SELECT', 'INSERT']::text[]) AS delegable_privilege
      WHERE pg_catalog.has_any_column_privilege(
        ${roleLiteral},
        'public.creator_marketplace_library_item',
        delegable_privilege || ' WITH GRANT OPTION'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'archivedAt',
        'lastConfirmedReleaseId',
        'lastConfirmedResourceVersion',
        'lastConfirmedReleaseOrdinal',
        'lastConfirmedManifestHash',
        'firstConfirmedAt',
        'lastConfirmedAt',
        'updatedAt'
      ]::text[]) AS mutable_column
      WHERE pg_catalog.has_column_privilege(
        ${roleLiteral},
        'public.creator_marketplace_library_item',
        mutable_column,
        'UPDATE WITH GRANT OPTION'
      )
    )
    OR NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_marketplace_package_moderation',
      'SELECT'
    )
    OR NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_marketplace_package_moderation',
      'INSERT'
    )
    OR pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_marketplace_package_moderation',
      'UPDATE'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'state',
        'revision',
        'currentDecisionId',
        'hiddenAt',
        'updatedAt'
      ]::text[]) AS mutable_column
      WHERE NOT pg_catalog.has_column_privilege(
        ${roleLiteral},
        'public.creator_marketplace_package_moderation',
        mutable_column,
        'UPDATE'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS immutable_attribute
      WHERE immutable_attribute.attrelid =
        'public.creator_marketplace_package_moderation'::regclass
        AND immutable_attribute.attnum > 0
        AND NOT immutable_attribute.attisdropped
        AND immutable_attribute.attname <> ALL(ARRAY[
          'state',
          'revision',
          'currentDecisionId',
          'hiddenAt',
          'updatedAt'
        ]::name[])
        AND pg_catalog.has_column_privilege(
          ${roleLiteral},
          'public.creator_marketplace_package_moderation',
          immutable_attribute.attname,
          'UPDATE'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY['DELETE', 'TRUNCATE', 'TRIGGER']::text[])
        AS unexpected_table_privilege
      WHERE pg_catalog.has_table_privilege(
        ${roleLiteral},
        'public.creator_marketplace_package_moderation',
        unexpected_table_privilege
      )
    )
    OR pg_catalog.has_any_column_privilege(
      ${roleLiteral},
      'public.creator_marketplace_package_moderation',
      'REFERENCES'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY['SELECT', 'INSERT']::text[]) AS delegable_privilege
      WHERE pg_catalog.has_any_column_privilege(
        ${roleLiteral},
        'public.creator_marketplace_package_moderation',
        delegable_privilege || ' WITH GRANT OPTION'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'state',
        'revision',
        'currentDecisionId',
        'hiddenAt',
        'updatedAt'
      ]::text[]) AS mutable_column
      WHERE pg_catalog.has_column_privilege(
        ${roleLiteral},
        'public.creator_marketplace_package_moderation',
        mutable_column,
        'UPDATE WITH GRANT OPTION'
      )
    )
    OR NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_marketplace_package_moderation_decision',
      'SELECT'
    )
    OR NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_marketplace_package_moderation_decision',
      'INSERT'
    )
    OR pg_catalog.has_any_column_privilege(
      ${roleLiteral},
      'public.creator_marketplace_package_moderation_decision',
      'UPDATE'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'TRIGGER'
      ]::text[]) AS unexpected_table_privilege
      WHERE pg_catalog.has_table_privilege(
        ${roleLiteral},
        'public.creator_marketplace_package_moderation_decision',
        unexpected_table_privilege
      )
    )
    OR pg_catalog.has_any_column_privilege(
      ${roleLiteral},
      'public.creator_marketplace_package_moderation_decision',
      'REFERENCES'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY['SELECT', 'INSERT']::text[]) AS delegable_privilege
      WHERE pg_catalog.has_any_column_privilege(
        ${roleLiteral},
        'public.creator_marketplace_package_moderation_decision',
        delegable_privilege || ' WITH GRANT OPTION'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE'
      ]::text[]) AS required_privilege
      WHERE NOT pg_catalog.has_table_privilege(
        ${roleLiteral},
        'public.creator_marketplace_publish_gate',
        required_privilege
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'TRUNCATE',
        'TRIGGER'
      ]::text[]) AS unexpected_table_privilege
      WHERE pg_catalog.has_table_privilege(
        ${roleLiteral},
        'public.creator_marketplace_publish_gate',
        unexpected_table_privilege
      )
    )
    OR pg_catalog.has_any_column_privilege(
      ${roleLiteral},
      'public.creator_marketplace_publish_gate',
      'REFERENCES'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'SELECT',
        'INSERT',
        'UPDATE'
      ]::text[]) AS delegable_column_privilege
      WHERE pg_catalog.has_any_column_privilege(
        ${roleLiteral},
        'public.creator_marketplace_publish_gate',
        delegable_column_privilege || ' WITH GRANT OPTION'
      )
    )
    OR pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_marketplace_publish_gate',
      'DELETE WITH GRANT OPTION'
    )
    OR NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_marketplace_resource_report',
      'SELECT'
    )
    OR NOT pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_marketplace_resource_report',
      'INSERT'
    )
    OR pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_marketplace_resource_report',
      'UPDATE'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'status',
        'resolutionNote',
        'reviewedBy',
        'reviewedAt'
      ]::text[]) AS lifecycle_column
      WHERE NOT pg_catalog.has_column_privilege(
        ${roleLiteral},
        'public.creator_marketplace_resource_report',
        lifecycle_column,
        'UPDATE'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS immutable_attribute
      WHERE immutable_attribute.attrelid =
        'public.creator_marketplace_resource_report'::regclass
        AND immutable_attribute.attnum > 0
        AND NOT immutable_attribute.attisdropped
        AND immutable_attribute.attname <> ALL(
          ARRAY['status', 'resolutionNote', 'reviewedBy', 'reviewedAt']::name[]
        )
        AND pg_catalog.has_column_privilege(
          ${roleLiteral},
          'public.creator_marketplace_resource_report',
          immutable_attribute.attname,
          'UPDATE'
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
        'public.creator_marketplace_resource_report',
        unexpected_table_privilege
      )
    )
    OR pg_catalog.has_any_column_privilege(
      ${roleLiteral},
      'public.creator_marketplace_resource_report',
      'REFERENCES'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'SELECT',
        'INSERT'
      ]::text[]) AS delegable_column_privilege
      WHERE pg_catalog.has_any_column_privilege(
        ${roleLiteral},
        'public.creator_marketplace_resource_report',
        delegable_column_privilege || ' WITH GRANT OPTION'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'status',
        'resolutionNote',
        'reviewedBy',
        'reviewedAt'
      ]::text[]) AS lifecycle_column
      WHERE pg_catalog.has_column_privilege(
        ${roleLiteral},
        'public.creator_marketplace_resource_report',
        lifecycle_column,
        'UPDATE WITH GRANT OPTION'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE'
      ]::text[]) AS required_privilege
      WHERE NOT pg_catalog.has_table_privilege(
        ${roleLiteral},
        'public.creator_marketplace_resource_report_gate',
        required_privilege
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY['TRUNCATE', 'TRIGGER']::text[]) AS unexpected_table_privilege
      WHERE pg_catalog.has_table_privilege(
        ${roleLiteral},
        'public.creator_marketplace_resource_report_gate',
        unexpected_table_privilege
      )
    )
    OR pg_catalog.has_any_column_privilege(
      ${roleLiteral},
      'public.creator_marketplace_resource_report_gate',
      'REFERENCES'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'SELECT',
        'INSERT',
        'UPDATE'
      ]::text[]) AS delegable_column_privilege
      WHERE pg_catalog.has_any_column_privilege(
        ${roleLiteral},
        'public.creator_marketplace_resource_report_gate',
        delegable_column_privilege || ' WITH GRANT OPTION'
      )
    )
    OR pg_catalog.has_table_privilege(
      ${roleLiteral},
      'public.creator_marketplace_resource_report_gate',
      'DELETE WITH GRANT OPTION'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'public.creator_marketplace_resource',
        'public.creator_marketplace_library_item',
        'public.creator_marketplace_package_moderation',
        'public.creator_marketplace_package_moderation_decision',
        'public.creator_marketplace_publish_gate',
        'public.creator_marketplace_resource_report',
        'public.creator_marketplace_resource_report_gate'
      ]::text[]) AS public_relation(relation_name)
      CROSS JOIN unnest(ARRAY[
        'SELECT',
        'INSERT',
        'UPDATE',
        'REFERENCES'
      ]::text[]) AS public_column_privilege(privilege_name)
      WHERE pg_catalog.has_any_column_privilege(
        0::oid,
        public_relation.relation_name,
        public_column_privilege.privilege_name
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'public.creator_marketplace_resource',
        'public.creator_marketplace_library_item',
        'public.creator_marketplace_package_moderation',
        'public.creator_marketplace_package_moderation_decision',
        'public.creator_marketplace_publish_gate',
        'public.creator_marketplace_resource_report',
        'public.creator_marketplace_resource_report_gate'
      ]::text[]) AS public_relation(relation_name)
      CROSS JOIN unnest(ARRAY[
        'DELETE',
        'TRUNCATE',
        'TRIGGER'
      ]::text[]) AS public_table_privilege(privilege_name)
      WHERE pg_catalog.has_table_privilege(
        0::oid,
        public_relation.relation_name,
        public_table_privilege.privilege_name
      )
    )
  )`;
}
