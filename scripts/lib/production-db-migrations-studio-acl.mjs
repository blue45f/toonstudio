/**
 * 운영 DB 마이그레이션 러너의 스튜디오 프로젝트 그래프·프로덕션 런타임 ACL SQL 빌더.
 */
import { validateRuntimeDatabaseRole } from "../validate-production-database-url.mjs";
import { sqlLiteral } from "./production-db-migrations-planning.mjs";

const STUDIO_PROJECT_GRAPH_RUNTIME_ACL = Object.freeze([
  { relation: "studio_project_graph", insert: true, delete: false, mutableColumns: [] },
  {
    relation: "studio_artifact",
    insert: true,
    delete: false,
    mutableColumns: ["headRevisionId", "approvedRevisionId", "updatedAt"],
  },
  { relation: "studio_revision", insert: true, delete: false, mutableColumns: [] },
  { relation: "studio_revision_parent", insert: true, delete: false, mutableColumns: [] },
  { relation: "studio_blob", insert: true, delete: false, mutableColumns: [] },
  { relation: "studio_revision_blob", insert: true, delete: false, mutableColumns: [] },
  { relation: "studio_operation", insert: true, delete: false, mutableColumns: [] },
  { relation: "studio_mutation_receipt", insert: true, delete: false, mutableColumns: [] },
  {
    relation: "studio_compatibility_report",
    insert: true,
    delete: false,
    mutableColumns: ["approvedBy", "approvedAt"],
  },
  {
    relation: "studio_external_file_binding",
    insert: true,
    delete: true,
    mutableColumns: [
      "displayPath",
      "syncMode",
      "remoteVersion",
      "remoteEtag",
      "contentHash",
      "lastSyncedRevisionId",
      "lastSyncedAt",
      "updatedAt",
    ],
  },
  {
    relation: "studio_review",
    insert: true,
    delete: false,
    mutableColumns: ["status", "decidedAt", "decidedBy", "updatedAt"],
  },
  {
    relation: "studio_review_reviewer",
    insert: true,
    delete: false,
    // Reviewer membership is immutable evidence. The final decision is stored on studio_review;
    // this relation has no decision/decidedAt columns and must never receive UPDATE grants.
    mutableColumns: [],
  },
  {
    relation: "studio_review_comment",
    insert: true,
    delete: false,
    mutableColumns: ["status", "resolutionRevisionId", "resolvedBy", "updatedAt"],
  },
  {
    relation: "studio_review_comment_assignee",
    insert: true,
    delete: true,
    mutableColumns: [],
  },
  {
    relation: "studio_review_policy",
    insert: true,
    delete: false,
    mutableColumns: ["policyVersion", "stateVersion", "definition", "configuredBy", "configuredAt"],
  },
  { relation: "studio_review_policy_event", insert: true, delete: false, mutableColumns: [] },
  { relation: "studio_capability_ledger", insert: false, delete: false, mutableColumns: [] },
]);

function studioProjectGraphRelationSqlList() {
  return STUDIO_PROJECT_GRAPH_RUNTIME_ACL
    .map(({ relation }) => `public.${relation}`)
    .join(",\n  ");
}

/**
 * The ProjectGraph API writes immutable revisions/operations and only mutates explicit pointer,
 * approval, review and external-binding columns. The deployment role owns schema changes; the
 * runtime role receives the least privilege needed by the repository.
 */
export function buildStudioProjectGraphRuntimeAclSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const quotedRole = `"${role}"`;
  const relations = studioProjectGraphRelationSqlList();
  const inserts = STUDIO_PROJECT_GRAPH_RUNTIME_ACL
    .filter(({ insert }) => insert)
    .map(({ relation }) => `public.${relation}`)
    .join(",\n    ");
  const deletes = STUDIO_PROJECT_GRAPH_RUNTIME_ACL
    .filter(({ delete: allowed }) => allowed)
    .map(({ relation }) => `public.${relation}`)
    .join(",\n    ");
  const updateGrants = STUDIO_PROJECT_GRAPH_RUNTIME_ACL
    .filter(({ mutableColumns }) => mutableColumns.length > 0)
    .map(({ relation, mutableColumns }) => `GRANT UPDATE (${mutableColumns.map((column) => `"${column}"`).join(", ")})\n  ON TABLE public.${relation}\n  TO ${quotedRole};`)
    .join("\n");
  return `
DO $studio_project_graph_acl$
DECLARE
  relation_name text;
  column_list text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    ${STUDIO_PROJECT_GRAPH_RUNTIME_ACL.map(({ relation }) => sqlLiteral(relation)).join(",\n    ")}
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
$studio_project_graph_acl$;

REVOKE ALL ON TABLE
  ${relations}
FROM PUBLIC;

REVOKE ALL ON TABLE
  ${relations}
FROM ${quotedRole};

GRANT SELECT ON TABLE
  ${relations}
TO ${quotedRole};

GRANT INSERT ON TABLE
    ${inserts}
  TO ${quotedRole};

GRANT DELETE ON TABLE
    ${deletes}
  TO ${quotedRole};

${updateGrants}
REVOKE ALL ON FUNCTION public.studio_review_policy_actor_epoch(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.studio_review_policy_actor_epoch(text,text) FROM ${quotedRole};
GRANT EXECUTE ON FUNCTION public.studio_review_policy_actor_epoch(text,text) TO ${quotedRole};
`;
}

export function buildStudioProjectGraphRuntimeAclViolationSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const roleLiteral = sqlLiteral(role);
  const rows = STUDIO_PROJECT_GRAPH_RUNTIME_ACL.map(({ relation, insert, delete: allowedDelete, mutableColumns }) => `(
          ${sqlLiteral(relation)}::text,
          ${insert ? "true" : "false"}::boolean,
          ${allowedDelete ? "true" : "false"}::boolean,
          ARRAY[${mutableColumns.map((column) => sqlLiteral(column)).join(", ")}]::text[]
        )`).join(",\n        ");
  return `(
    NOT pg_catalog.has_function_privilege(${roleLiteral}, 'public.studio_review_policy_actor_epoch(text,text)', 'EXECUTE')
    OR pg_catalog.has_function_privilege(0::oid, 'public.studio_review_policy_actor_epoch(text,text)', 'EXECUTE')
    OR pg_catalog.has_function_privilege(${roleLiteral}, 'public.studio_review_policy_actor_epoch(text,text)', 'EXECUTE WITH GRANT OPTION')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid='public.studio_review_policy_actor_epoch(text,text)'::regprocedure AND prosecdef)
    OR EXISTS (
      SELECT 1
      FROM (VALUES
        ${rows}
      ) AS graph_contract(relation_name, allow_insert, allow_delete, mutable_columns)
      WHERE NOT pg_catalog.has_table_privilege(
        ${roleLiteral},
        format('public.%I', graph_contract.relation_name),
        'SELECT'
      )
      OR pg_catalog.has_table_privilege(
        ${roleLiteral},
        format('public.%I', graph_contract.relation_name),
        'INSERT'
      ) <> graph_contract.allow_insert
      OR pg_catalog.has_table_privilege(
        ${roleLiteral},
        format('public.%I', graph_contract.relation_name),
        'DELETE'
      ) <> graph_contract.allow_delete
      OR pg_catalog.has_table_privilege(
        ${roleLiteral},
        format('public.%I', graph_contract.relation_name),
        'UPDATE'
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(ARRAY['TRUNCATE', 'REFERENCES', 'TRIGGER']::text[]) AS unexpected_privilege
        WHERE pg_catalog.has_table_privilege(
          ${roleLiteral},
          format('public.%I', graph_contract.relation_name),
          unexpected_privilege
        )
      )
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute
        WHERE attribute.attrelid = format('public.%I', graph_contract.relation_name)::regclass
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
          AND pg_catalog.has_column_privilege(
            ${roleLiteral},
            format('public.%I', graph_contract.relation_name),
            attribute.attname,
            'UPDATE'
          ) <> (attribute.attname = ANY(graph_contract.mutable_columns))
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
          format('public.%I', graph_contract.relation_name),
          delegable_privilege
        )
      )
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        ${STUDIO_PROJECT_GRAPH_RUNTIME_ACL.map(({ relation }) => sqlLiteral(relation)).join(",\n        ")}
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
  )`;
}

export function buildStudioProductionRuntimeAclSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const quotedRole = `"${role}"`;
  return `
DO $studio_production_acl$
DECLARE
  relation_name text;
  column_list text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'creator_work_production_workspace',
    'creator_studio_personal_kit',
    'creator_work_review_link',
    'creator_work_review_feedback',
    'studio_pinned_review_share',
    'studio_pinned_review_feedback',
    'studio_review_delivery',
    'studio_review_delivery_event',
    'studio_review_voice_note'
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
$studio_production_acl$;

REVOKE ALL ON TABLE
  public.creator_work_production_workspace,
  public.creator_studio_personal_kit,
  public.creator_work_review_link,
  public.creator_work_review_feedback,
  public.studio_pinned_review_share,
  public.studio_pinned_review_feedback,
  public.studio_review_delivery,
  public.studio_review_delivery_event,
  public.studio_review_voice_note
FROM PUBLIC;

REVOKE ALL ON TABLE
  public.creator_work_production_workspace,
  public.creator_studio_personal_kit,
  public.creator_work_review_link,
  public.creator_work_review_feedback,
  public.studio_pinned_review_share,
  public.studio_pinned_review_feedback,
  public.studio_review_delivery,
  public.studio_review_delivery_event,
  public.studio_review_voice_note
FROM ${quotedRole};

GRANT SELECT, INSERT
  ON TABLE
    public.creator_work_production_workspace,
    public.creator_studio_personal_kit,
    public.creator_work_review_link,
    public.creator_work_review_feedback,
    public.studio_pinned_review_share,
    public.studio_pinned_review_feedback,
    public.studio_review_delivery,
    public.studio_review_delivery_event,
    public.studio_review_voice_note
  TO ${quotedRole};

GRANT UPDATE ("revision", "document", "updatedBy", "updatedAt")
  ON TABLE public.creator_work_production_workspace
  TO ${quotedRole};
GRANT UPDATE ("revision", "document", "updatedAt")
  ON TABLE public.creator_studio_personal_kit
  TO ${quotedRole};
GRANT UPDATE ("revokedAt", "updatedAt")
  ON TABLE public.creator_work_review_link
  TO ${quotedRole};
GRANT UPDATE ("revokedAt")
  ON TABLE public.studio_pinned_review_share
  TO ${quotedRole};
GRANT UPDATE (state, version, "archiveSha256", "archiveByteLength", "updatedAt", "issuedAt", "deliveredAt", "acceptedAt", "cancelledAt")
  ON TABLE public.studio_review_delivery
  TO ${quotedRole};
GRANT UPDATE ("deletedAt", "deleteOperationId")
  ON TABLE public.studio_review_voice_note
  TO ${quotedRole};
GRANT USAGE, SELECT ON SEQUENCE public.studio_review_delivery_event_sequence_seq TO ${quotedRole};
`;
}

/**
 * Production workspaces and Personal Kit documents use optimistic revisions. Review-link records
 * are append-only except for revocation, and external feedback is fully append-only. Keep those
 * boundaries at the database role as well as in the repositories so a compromised API query cannot
 * rewrite identities, tokens, reviewer evidence, or creation timestamps.
 */
export function buildStudioProductionRuntimeAclViolationSql(
  runtimeDatabaseRole,
) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const roleLiteral = sqlLiteral(role);
  return `(
    NOT pg_catalog.has_sequence_privilege(${roleLiteral}, 'public.studio_review_delivery_event_sequence_seq', 'USAGE, SELECT')
    OR pg_catalog.has_sequence_privilege(0::oid, 'public.studio_review_delivery_event_sequence_seq', 'USAGE')
    OR pg_catalog.has_sequence_privilege(${roleLiteral}, 'public.studio_review_delivery_event_sequence_seq', 'UPDATE')
    OR EXISTS (
      SELECT 1
      FROM (VALUES
        (
          'creator_work_production_workspace'::text,
          ARRAY['revision', 'document', 'updatedBy', 'updatedAt']::text[]
        ),
        (
          'creator_studio_personal_kit'::text,
          ARRAY['revision', 'document', 'updatedAt']::text[]
        ),
        (
          'creator_work_review_link'::text,
          ARRAY['revokedAt', 'updatedAt']::text[]
        ),
        (
          'creator_work_review_feedback'::text,
          ARRAY[]::text[]
        ),
        ('studio_pinned_review_share'::text, ARRAY['revokedAt']::text[]),
        ('studio_pinned_review_feedback'::text, ARRAY[]::text[]),
        ('studio_review_delivery'::text, ARRAY['state','version','archiveSha256','archiveByteLength','updatedAt','issuedAt','deliveredAt','acceptedAt','cancelledAt']::text[]),
        ('studio_review_delivery_event'::text, ARRAY[]::text[]),
        ('studio_review_voice_note'::text, ARRAY['deletedAt','deleteOperationId']::text[])
      ) AS production_contract(relation_name, mutable_columns)
      WHERE NOT pg_catalog.has_table_privilege(
        ${roleLiteral},
        format('public.%I', production_contract.relation_name),
        'SELECT'
      )
      OR NOT pg_catalog.has_table_privilege(
        ${roleLiteral},
        format('public.%I', production_contract.relation_name),
        'INSERT'
      )
      OR pg_catalog.has_table_privilege(
        ${roleLiteral},
        format('public.%I', production_contract.relation_name),
        'UPDATE'
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(ARRAY[
          'DELETE',
          'TRUNCATE',
          'REFERENCES',
          'TRIGGER'
        ]::text[]) AS unexpected_table_privilege
        WHERE pg_catalog.has_table_privilege(
          ${roleLiteral},
          format('public.%I', production_contract.relation_name),
          unexpected_table_privilege
        )
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
        ]::text[]) AS delegable_table_privilege
        WHERE pg_catalog.has_table_privilege(
          ${roleLiteral},
          format('public.%I', production_contract.relation_name),
          delegable_table_privilege
        )
      )
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS production_attribute
        WHERE production_attribute.attrelid =
          format('public.%I', production_contract.relation_name)::regclass
          AND production_attribute.attnum > 0
          AND NOT production_attribute.attisdropped
          AND (
            (
              production_attribute.attname = ANY(production_contract.mutable_columns)
              AND NOT pg_catalog.has_column_privilege(
                ${roleLiteral},
                format('public.%I', production_contract.relation_name),
                production_attribute.attname,
                'UPDATE'
              )
            )
            OR (
              production_attribute.attname <> ALL(production_contract.mutable_columns)
              AND pg_catalog.has_column_privilege(
                ${roleLiteral},
                format('public.%I', production_contract.relation_name),
                production_attribute.attname,
                'UPDATE'
              )
            )
            OR pg_catalog.has_column_privilege(
              ${roleLiteral},
              format('public.%I', production_contract.relation_name),
              production_attribute.attname,
              'UPDATE WITH GRANT OPTION'
            )
          )
      )
      OR pg_catalog.has_any_column_privilege(
        ${roleLiteral},
        format('public.%I', production_contract.relation_name),
        'REFERENCES'
      )
      OR pg_catalog.has_any_column_privilege(
        ${roleLiteral},
        format('public.%I', production_contract.relation_name),
        'SELECT WITH GRANT OPTION'
      )
      OR pg_catalog.has_any_column_privilege(
        ${roleLiteral},
        format('public.%I', production_contract.relation_name),
        'INSERT WITH GRANT OPTION'
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
        ]::text[]) AS public_table_privilege
        WHERE pg_catalog.has_table_privilege(
          0::oid,
          format('public.%I', production_contract.relation_name),
          public_table_privilege
        )
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
          format('public.%I', production_contract.relation_name),
          public_column_privilege
        )
      )
    )
  )`;
}
