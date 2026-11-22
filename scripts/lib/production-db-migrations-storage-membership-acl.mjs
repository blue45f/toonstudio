/**
 * 운영 DB 마이그레이션 러너의 크리에이터 에셋 오브젝트 스토리지·멤버십 런타임 ACL SQL 빌더.
 */
import {
  buildBg3dBundleRuntimeAclSql,
  buildBg3dBundleRuntimeAclViolationSql,
} from "../studio-bg3d-bundle-runtime-acl.mjs";
import { validateRuntimeDatabaseRole } from "../validate-production-database-url.mjs";
import { sqlLiteral } from "./production-db-migrations-planning.mjs";

export function buildCreatorAssetObjectStorageRuntimeAclSql(
  runtimeDatabaseRole,
) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const quotedRole = `"${role}"`;
  return `${buildBg3dBundleRuntimeAclSql(role)}
REVOKE ALL ON TABLE
  public.creator_asset_storage_object,
  public.creator_work_asset_storage_reference,
  public.creator_work_publication_media
FROM PUBLIC;

REVOKE ALL ON TABLE
  public.creator_asset_storage_object,
  public.creator_work_asset_storage_reference,
  public.creator_work_publication_media
FROM ${quotedRole};

GRANT SELECT
  ON TABLE public.creator_asset_storage_object
  TO ${quotedRole};
GRANT INSERT (
  "purpose",
  "digest",
  "contractVersion",
  "providerId",
  "objectPath",
  "byteLength",
  "contentType"
)
  ON TABLE public.creator_asset_storage_object
  TO ${quotedRole};
GRANT UPDATE ("state", "deleteToken", "updatedAt", "deletedAt")
  ON TABLE public.creator_asset_storage_object
  TO ${quotedRole};

GRANT SELECT, DELETE
  ON TABLE public.creator_work_asset_storage_reference
  TO ${quotedRole};
GRANT INSERT (
  "workId",
  "purpose",
  "referenceId",
  "objectDigest",
  "sourceAssetId",
  "createdBy"
)
  ON TABLE public.creator_work_asset_storage_reference
  TO ${quotedRole};
GRANT UPDATE ("state", "deleteToken", "updatedAt")
  ON TABLE public.creator_work_asset_storage_reference
  TO ${quotedRole};

GRANT SELECT
  ON TABLE public.creator_work_publication_media
  TO ${quotedRole};
GRANT INSERT (
  "workId",
  "slot",
  "pageIndex",
  "purpose",
  "objectDigest",
  "mediaType",
  "byteLength",
  "createdBy"
)
  ON TABLE public.creator_work_publication_media
  TO ${quotedRole};
`;
}

/**
 * A true result means the runtime role has either lost a required lifecycle
 * capability or gained a table/column capability outside the reviewed 0024
 * object-storage contract. Keep this condition beside the GRANT builder so
 * migration normalization and the production verifier cannot drift apart.
 */
export function buildCreatorAssetObjectStorageRuntimeAclViolationSql(
  runtimeDatabaseRole,
) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  return `(${buildBg3dBundleRuntimeAclViolationSql(role)} OR
    NOT pg_catalog.has_table_privilege(
      ${sqlLiteral(role)},
      'public.creator_asset_storage_object',
      'SELECT'
    )
    OR pg_catalog.has_table_privilege(
      ${sqlLiteral(role)},
      'public.creator_asset_storage_object',
      'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'purpose',
        'digest',
        'contractVersion',
        'providerId',
        'objectPath',
        'byteLength',
        'contentType'
      ]::text[]) AS insert_column
      WHERE NOT pg_catalog.has_column_privilege(
        ${sqlLiteral(role)},
        'public.creator_asset_storage_object',
        insert_column,
        'INSERT'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'state',
        'deleteToken',
        'createdAt',
        'updatedAt',
        'deletedAt'
      ]::text[]) AS default_column
      WHERE pg_catalog.has_column_privilege(
        ${sqlLiteral(role)},
        'public.creator_asset_storage_object',
        default_column,
        'INSERT'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'state',
        'deleteToken',
        'updatedAt',
        'deletedAt'
      ]::text[]) AS lifecycle_column
      WHERE NOT pg_catalog.has_column_privilege(
        ${sqlLiteral(role)},
        'public.creator_asset_storage_object',
        lifecycle_column,
        'UPDATE'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'purpose',
        'digest',
        'contractVersion',
        'providerId',
        'objectPath',
        'byteLength',
        'contentType',
        'createdAt'
      ]::text[]) AS immutable_column
      WHERE pg_catalog.has_column_privilege(
        ${sqlLiteral(role)},
        'public.creator_asset_storage_object',
        immutable_column,
        'UPDATE'
      )
    )
    OR NOT pg_catalog.has_table_privilege(
      ${sqlLiteral(role)},
      'public.creator_work_asset_storage_reference',
      'SELECT'
    )
    OR NOT pg_catalog.has_table_privilege(
      ${sqlLiteral(role)},
      'public.creator_work_asset_storage_reference',
      'DELETE'
    )
    OR pg_catalog.has_table_privilege(
      ${sqlLiteral(role)},
      'public.creator_work_asset_storage_reference',
      'INSERT, UPDATE, TRUNCATE, REFERENCES, TRIGGER'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'workId',
        'purpose',
        'referenceId',
        'objectDigest',
        'sourceAssetId',
        'createdBy'
      ]::text[]) AS insert_column
      WHERE NOT pg_catalog.has_column_privilege(
        ${sqlLiteral(role)},
        'public.creator_work_asset_storage_reference',
        insert_column,
        'INSERT'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'state',
        'deleteToken',
        'createdAt',
        'updatedAt'
      ]::text[]) AS default_column
      WHERE pg_catalog.has_column_privilege(
        ${sqlLiteral(role)},
        'public.creator_work_asset_storage_reference',
        default_column,
        'INSERT'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'state',
        'deleteToken',
        'updatedAt'
      ]::text[]) AS lifecycle_column
      WHERE NOT pg_catalog.has_column_privilege(
        ${sqlLiteral(role)},
        'public.creator_work_asset_storage_reference',
        lifecycle_column,
        'UPDATE'
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'workId',
        'purpose',
        'referenceId',
        'objectDigest',
        'sourceAssetId',
        'createdBy',
        'createdAt'
      ]::text[]) AS immutable_column
      WHERE pg_catalog.has_column_privilege(
        ${sqlLiteral(role)},
        'public.creator_work_asset_storage_reference',
        immutable_column,
        'UPDATE'
      )
    )
    OR NOT pg_catalog.has_table_privilege(
      ${sqlLiteral(role)},
      'public.creator_work_publication_media',
      'SELECT'
    )
    OR pg_catalog.has_table_privilege(
      ${sqlLiteral(role)},
      'public.creator_work_publication_media',
      'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'workId',
        'slot',
        'pageIndex',
        'purpose',
        'objectDigest',
        'mediaType',
        'byteLength',
        'createdBy'
      ]::text[]) AS insert_column
      WHERE NOT pg_catalog.has_column_privilege(
        ${sqlLiteral(role)},
        'public.creator_work_publication_media',
        insert_column,
        'INSERT'
      )
    )
    OR pg_catalog.has_column_privilege(
      ${sqlLiteral(role)},
      'public.creator_work_publication_media',
      'createdAt',
      'INSERT'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'workId',
        'slot',
        'pageIndex',
        'purpose',
        'objectDigest',
        'mediaType',
        'byteLength',
        'createdBy',
        'createdAt'
      ]::text[]) AS immutable_column
      WHERE pg_catalog.has_column_privilege(
        ${sqlLiteral(role)},
        'public.creator_work_publication_media',
        immutable_column,
        'UPDATE'
      )
    )
  )`;
}

const MEMBERSHIP_RUNTIME_ACL = Object.freeze([
  {
    relation: "membership_grant",
    insert: true,
    mutableColumns: ["status", "updatedAt"],
  },
  {
    relation: "member_level",
    insert: true,
    mutableColumns: [
      "creatorLevel",
      "trustLevel",
      "sellerLevel",
      "trustScore",
      "updatedBy",
      "updatedAt",
    ],
  },
  {
    relation: "wallet_account",
    insert: true,
    mutableColumns: [
      "availableAmount",
      "reservedAmount",
      "lifetimeGranted",
      "lifetimeSpent",
      "updatedAt",
    ],
  },
  {
    relation: "wallet_lot",
    insert: true,
    mutableColumns: ["remainingAmount", "reservedAmount"],
  },
  {
    relation: "wallet_reservation",
    insert: true,
    mutableColumns: ["capturedAmount", "status", "updatedAt"],
  },
  {
    relation: "wallet_reservation_allocation",
    insert: true,
    mutableColumns: ["capturedAmount"],
  },
  {
    relation: "wallet_ledger_entry",
    insert: true,
    mutableColumns: [],
  },
  {
    relation: "membership_policy_override",
    insert: true,
    mutableColumns: ["value", "active", "updatedBy", "updatedAt"],
  },
  {
    relation: "membership_resource_usage_event",
    insert: true,
    mutableColumns: [],
  },
  {
    relation: "membership_resource_state",
    insert: true,
    mutableColumns: [
      "planId",
      "status",
      "overQuotaSince",
      "graceEndsAt",
      "lastUsageBytes",
      "lastLimitBytes",
      "updatedAt",
    ],
  },
  {
    relation: "membership_notice",
    insert: true,
    mutableColumns: ["seenAt"],
  },
  {
    relation: "membership_reward_reversal",
    insert: true,
    mutableColumns: [],
  },
  {
    relation: "membership_policy_change",
    insert: false,
    mutableColumns: [],
  },
]);

function membershipRuntimeRelationSqlList() {
  return MEMBERSHIP_RUNTIME_ACL
    .map(({ relation }) => `public.${relation}`)
    .join(",\n  ");
}

/**
 * Membership and wallet state is private by default. Runtime may append immutable
 * receipts and mutate only the lifecycle columns used by the reviewed services.
 * Policy history and pending-recovery mutation remain trigger-owned.
 */
export function buildMembershipRuntimeAclSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const quotedRole = `"${role}"`;
  const relations = membershipRuntimeRelationSqlList();
  const inserts = MEMBERSHIP_RUNTIME_ACL
    .filter(({ insert }) => insert)
    .map(({ relation }) => `public.${relation}`)
    .join(",\n    ");
  const updateGrants = MEMBERSHIP_RUNTIME_ACL
    .filter(({ mutableColumns }) => mutableColumns.length > 0)
    .map(({ relation, mutableColumns }) => `GRANT UPDATE (${mutableColumns.map((column) => `"${column}"`).join(", ")})
  ON TABLE public.${relation}
  TO ${quotedRole};`)
    .join("\n");
  return `
DO $membership_runtime_acl$
DECLARE
  relation_name text;
  column_list text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    ${MEMBERSHIP_RUNTIME_ACL.map(({ relation }) => sqlLiteral(relation)).join(",\n    ")}
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
$membership_runtime_acl$;

REVOKE ALL ON TABLE
  ${relations}
FROM PUBLIC;

REVOKE ALL ON TABLE
  ${relations}
FROM ${quotedRole};

REVOKE ALL ON SEQUENCE public.membership_policy_change_revision_seq FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.membership_policy_change_revision_seq FROM ${quotedRole};

GRANT SELECT ON TABLE
  ${relations}
TO ${quotedRole};

GRANT INSERT ON TABLE
    ${inserts}
  TO ${quotedRole};

${updateGrants}
`;
}

export function buildMembershipRuntimeAclViolationSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const roleLiteral = sqlLiteral(role);
  const rows = MEMBERSHIP_RUNTIME_ACL.map(({ relation, insert, mutableColumns }) => `(
          ${sqlLiteral(relation)}::text,
          ${insert ? "true" : "false"}::boolean,
          ARRAY[${mutableColumns.map((column) => sqlLiteral(column)).join(", ")}]::text[]
        )`).join(",\n        ");
  return `(
    EXISTS (
      SELECT 1
      FROM (VALUES
        ${rows}
      ) AS membership_contract(relation_name, allow_insert, mutable_columns)
      WHERE NOT pg_catalog.has_table_privilege(
        ${roleLiteral},
        format('public.%I', membership_contract.relation_name),
        'SELECT'
      )
      OR pg_catalog.has_table_privilege(
        ${roleLiteral},
        format('public.%I', membership_contract.relation_name),
        'INSERT'
      ) <> membership_contract.allow_insert
      OR pg_catalog.has_table_privilege(
        ${roleLiteral},
        format('public.%I', membership_contract.relation_name),
        'UPDATE'
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(ARRAY['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']::text[]) AS unexpected_privilege
        WHERE pg_catalog.has_table_privilege(
          ${roleLiteral},
          format('public.%I', membership_contract.relation_name),
          unexpected_privilege
        )
      )
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = format('public.%I', membership_contract.relation_name)::regclass
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND pg_catalog.has_column_privilege(
            ${roleLiteral},
            format('public.%I', membership_contract.relation_name),
            attribute.attname,
            'UPDATE'
          ) <> (attribute.attname = ANY(membership_contract.mutable_columns))
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(ARRAY[
          'SELECT WITH GRANT OPTION',
          'INSERT WITH GRANT OPTION',
          'UPDATE WITH GRANT OPTION',
          'DELETE WITH GRANT OPTION',
          'TRUNCATE WITH GRANT OPTION',
          'REFERENCES WITH GRANT OPTION',
          'TRIGGER WITH GRANT OPTION'
        ]::text[]) AS delegable_privilege
        WHERE pg_catalog.has_table_privilege(
          ${roleLiteral},
          format('public.%I', membership_contract.relation_name),
          delegable_privilege
        )
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        ${MEMBERSHIP_RUNTIME_ACL.map(({ relation }) => sqlLiteral(relation)).join(",\n        ")}
      ]::text[]) AS relation_name
      WHERE EXISTS (
        SELECT 1
        FROM unnest(ARRAY[
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
        ]::text[]) AS public_privilege
        WHERE pg_catalog.has_table_privilege(
          0::oid,
          format('public.%I', relation_name),
          public_privilege
        )
      )
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']::text[]) AS public_column_privilege
        WHERE attribute.attrelid = format('public.%I', relation_name)::regclass
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND pg_catalog.has_column_privilege(
            0::oid,
            format('public.%I', relation_name),
            attribute.attname,
            public_column_privilege
          )
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'USAGE',
        'SELECT',
        'UPDATE',
        'USAGE WITH GRANT OPTION',
        'SELECT WITH GRANT OPTION',
        'UPDATE WITH GRANT OPTION'
      ]::text[]) AS sequence_privilege
      WHERE pg_catalog.has_sequence_privilege(
        ${roleLiteral},
        'public.membership_policy_change_revision_seq',
        sequence_privilege
      )
      OR pg_catalog.has_sequence_privilege(
        0::oid,
        'public.membership_policy_change_revision_seq',
        sequence_privilege
      )
    )
  )`;
}
