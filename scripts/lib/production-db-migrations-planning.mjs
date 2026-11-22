/**
 * 운영 DB 마이그레이션 러너의 순수 파싱·계획·검증·역할 경계 SQL 헬퍼.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  HISTORICAL_BASELINE_RELATIONS,
  POST_BASELINE_RELATIONS,
} from "../run-production-database-migrations-relations.mjs";
import { validateRuntimeDatabaseRole } from "../validate-production-database-url.mjs";

const LIB_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(LIB_DIRECTORY, "../..");
const HEALTH_READINESS_SOURCE = resolve(
  REPOSITORY_ROOT,
  "apps/api/src/modules/health/health-readiness-inventory.ts",
);

export const ADOPTION_BASELINE_SEQUENCE = 19;
export const ADOPTION_MARKER_ID = "__managed_history_through_0019__";
export const LEDGER_RELATION = "toonspectrum_ops.deployment_migration";
export const LOCK_RELATION = "toonspectrum_ops.deployment_migration_lock";
export const REPAIR_LOCK_STALE_AFTER = "60 minutes";

export const MODE_CONFIRMATIONS = Object.freeze({
  apply: "APPLY-TOONSPECTRUM-PRODUCTION-MIGRATIONS",
  adopt: "ADOPT-TOONSPECTRUM-MIGRATION-HISTORY",
  repair: "REPAIR-TOONSPECTRUM-MIGRATION-STATE",
});

export function fail(message, cause) {
  throw new Error(message, cause ? { cause } : undefined);
}

export function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function migrationSequence(id) {
  const match = /^(?<sequence>\d{4})_/u.exec(id);
  if (!match?.groups?.sequence) fail(`Invalid migration id: ${id}`);
  return Number(match.groups.sequence);
}

export function migrationId(relativePath) {
  return basename(relativePath, ".sql");
}

export function expectedMigrationProvenance(migration) {
  if (migration.sequence <= ADOPTION_BASELINE_SEQUENCE) return "adopted";
  if (migration.id === "0023_production_migration_ledger") return "bootstrap";
  return "executed";
}

export function checksum(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

export function parseManifestLines(contents) {
  return contents
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function validateMigrationSequenceContinuity(manifest) {
  manifest.forEach((migration, index) => {
    const expectedSequence = index + 1;
    if (migration.sequence !== expectedSequence) {
      fail(
        `Production migration sequence must be continuous from 0001; expected ${String(expectedSequence).padStart(4, "0")} but found ${String(migration.sequence).padStart(4, "0")}`,
      );
    }
  });
  return manifest;
}

export function adoptionMarkerChecksum(manifest) {
  const historicalContract = manifest
    .filter((migration) => migration.sequence <= ADOPTION_BASELINE_SEQUENCE)
    .map((migration) => `${migration.id}:${migration.checksum}\n`)
    .join("");
  return checksum(historicalContract);
}

export function buildRuntimeDatabaseRoleBoundaryStateSql(
  runtimeDatabaseRole,
  { requireLogin = true } = {},
) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  if (typeof requireLogin !== "boolean") {
    fail("Runtime database login boundary mode must be explicit");
  }
  const loginBoundary = requireLogin ? "\n            OR NOT rolcanlogin" : "";
  return `(
    SELECT CASE
      WHEN NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles
        WHERE rolname = ${sqlLiteral(role)}
      ) THEN 'missing'
      WHEN current_user = ${sqlLiteral(role)} THEN 'same-role'
      WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles
        WHERE rolname = ${sqlLiteral(role)}
          AND (
            rolsuper
            OR rolcreaterole
            OR rolcreatedb
            OR rolreplication
            OR rolbypassrls${loginBoundary}
          )
      ) THEN 'unsafe-runtime-attributes'
      WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles AS inherited_role
        WHERE inherited_role.rolname <> ${sqlLiteral(role)}
          AND pg_catalog.pg_has_role(
            ${sqlLiteral(role)},
            inherited_role.rolname,
            'MEMBER'
          )
      ) THEN 'runtime-has-memberships'
      WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.pg_database AS database_record
        JOIN pg_catalog.pg_roles AS owner
          ON owner.oid = database_record.datdba
        WHERE database_record.datname = current_database()
          AND owner.rolname = ${sqlLiteral(role)}
      ) THEN 'runtime-owns-database'
      WHEN pg_catalog.has_database_privilege(
        ${sqlLiteral(role)},
        current_database(),
        'CREATE'
      ) THEN 'runtime-can-create-database-objects'
      WHEN NOT pg_catalog.has_database_privilege(
        ${sqlLiteral(role)},
        current_database(),
        'CONNECT'
      ) THEN 'runtime-cannot-connect'
      WHEN NOT pg_catalog.has_schema_privilege(
        ${sqlLiteral(role)},
        'public',
        'USAGE'
      ) THEN 'runtime-cannot-use-public-schema'
      WHEN pg_catalog.has_schema_privilege(
        ${sqlLiteral(role)},
        'public',
        'CREATE'
      ) THEN 'runtime-can-create-public-objects'
      WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        JOIN pg_catalog.pg_roles AS owner
          ON owner.oid = relation.relowner
        WHERE namespace.nspname = 'public'
          AND owner.rolname = ${sqlLiteral(role)}
      ) THEN 'runtime-owns-public-relation'
      WHEN EXISTS (
        SELECT 1
        FROM pg_catalog.pg_extension AS extension_record
        JOIN pg_catalog.pg_roles AS owner
          ON owner.oid = extension_record.extowner
        WHERE owner.rolname = ${sqlLiteral(role)}
      ) THEN 'runtime-owns-extension'
      ELSE 'separated'
    END
  )`;
}

const MIGRATION_LEDGER_TABLE_PRIVILEGES = Object.freeze([
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
]);

export function buildMigrationLedgerRuntimeAclSql(runtimeDatabaseRole) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  return `
DO $toonspectrum_ops_acl$
BEGIN
  EXECUTE 'REVOKE ALL ON SCHEMA toonspectrum_ops FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA toonspectrum_ops FROM PUBLIC';
  EXECUTE format(
    'REVOKE ALL ON SCHEMA toonspectrum_ops FROM %I',
    ${sqlLiteral(role)}
  );
  EXECUTE format(
    'REVOKE ALL ON ALL TABLES IN SCHEMA toonspectrum_ops FROM %I',
    ${sqlLiteral(role)}
  );
END
$toonspectrum_ops_acl$;
`;
}

export function buildMigrationLedgerRuntimeAclViolationSql(
  runtimeDatabaseRole,
) {
  const role = validateRuntimeDatabaseRole(runtimeDatabaseRole);
  const privileges = MIGRATION_LEDGER_TABLE_PRIVILEGES.map(sqlLiteral).join(
    ",\n      ",
  );
  return `(
    pg_catalog.has_schema_privilege(
      ${sqlLiteral(role)},
      'toonspectrum_ops',
      'USAGE'
    )
    OR pg_catalog.has_schema_privilege(
      ${sqlLiteral(role)},
      'toonspectrum_ops',
      'CREATE'
    )
    OR EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        ${privileges}
      ]::text[]) AS privilege_name
      WHERE pg_catalog.has_table_privilege(
        ${sqlLiteral(role)},
        'toonspectrum_ops.deployment_migration',
        privilege_name
      )
      OR pg_catalog.has_table_privilege(
        ${sqlLiteral(role)},
        'toonspectrum_ops.deployment_migration_lock',
        privilege_name
      )
    )
  )`;
}

function loadHistoricalBaselineRelations() {
  const source = readFileSync(HEALTH_READINESS_SOURCE, "utf8");
  const block =
    /export const REQUIRED_DATABASE_RELATIONS = \[([\s\S]*?)\] as const/u.exec(
      source,
    )?.[1];
  if (!block) {
    fail(
      "Unable to derive historical adoption relations from the health readiness contract",
    );
  }
  const currentRelations = new Set(
    [...block.matchAll(/"([^"]+)"/gu)].map((match) => match[1]),
  );
  const classifiedRelations = new Set([
    ...HISTORICAL_BASELINE_RELATIONS,
    ...POST_BASELINE_RELATIONS,
  ]);
  const missingContractRelations = [...classifiedRelations].filter(
    (relation) => !currentRelations.has(relation),
  );
  const unclassifiedRuntimeRelations = [...currentRelations].filter(
    (relation) => !classifiedRelations.has(relation),
  );
  if (
    missingContractRelations.length > 0 ||
    unclassifiedRuntimeRelations.length > 0
  ) {
    fail(
      `Runtime readiness relations must exactly partition into through-0019 and post-baseline sets; missing=${missingContractRelations.join(", ") || "none"} unclassified=${unclassifiedRuntimeRelations.join(", ") || "none"}`,
    );
  }
  return HISTORICAL_BASELINE_RELATIONS;
}

export function buildHistoricalAdoptionVerificationSql() {
  const expectedRelations = loadHistoricalBaselineRelations()
    .map((relation) => sqlLiteral(relation))
    .join(",\n          ");
  return `
DO $toonspectrum_historical_adoption$
DECLARE
  missing_relations text[];
  invalid_constraints text[];
BEGIN
  SELECT array_agg(required_relation ORDER BY required_relation)
  INTO missing_relations
  FROM unnest(ARRAY[
          ${expectedRelations}
       ]::text[]) AS required_relation
  WHERE to_regclass(format('public.%I', required_relation)) IS NULL;

  IF missing_relations IS NOT NULL THEN
    RAISE EXCEPTION
      'cannot adopt through 0019: required historical relations are missing: %',
      missing_relations;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.toonspectrum_schema_migration
    WHERE "id" = '0017_creator_work_live_lock_revision'
  ) THEN
    RAISE EXCEPTION
      'cannot adopt through 0019: destructive 0017 cutover evidence is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    LEFT JOIN pg_catalog.pg_attrdef AS column_default
      ON column_default.adrelid = attribute.attrelid
      AND column_default.adnum = attribute.attnum
    WHERE attribute.attrelid =
      to_regclass('public.creator_work_live_lock')
      AND attribute.attname = 'revision'
      AND attribute.atttypid = 'bigint'::regtype
      AND attribute.attnotnull
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND column_default.oid IS NULL
  ) THEN
    RAISE EXCEPTION
      'cannot adopt through 0019: live-lock revision cutover shape is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid =
      to_regclass('public.creator_work_team_comment_mutation')
      AND attribute.attname = 'messageId'
      AND NOT attribute.attnotnull
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ) THEN
    RAISE EXCEPTION
      'cannot adopt through 0019: nullable comment re-anchor receipt is missing';
  END IF;

  WITH expected(
    "relationName",
    "constraintName",
    "constraintType",
    "definitionToken"
  ) AS (
    VALUES
      ('creator_asset', 'creator_asset_published_rights_check', 'c', 'rightsConfirmedAt'),
      ('creator_asset_report', 'creator_asset_report_asset_reporter_unique', 'u', ''),
      ('creator_work_crdt_raster_checkpoint_job', 'creator_work_crdt_raster_checkpoint_job_state_check', 'c', 'completed'),
      ('creator_work_team_comment_activity', 'creator_work_team_comment_activity_action_check', 'c', 'reanchored'),
      ('creator_work_team_comment_mutation', 'creator_work_team_comment_mutation_operation_check', 'c', 'thread_reanchor'),
      ('creator_work_live_lock', 'creator_work_live_lock_revision_check', 'c', 'revision > 0'),
      ('creator_work_live_lock_clock', 'creator_work_live_lock_clock_revision_check', 'c', 'revision >= 0'),
      ('studio_ai_request_gate', 'studio_ai_request_gate_request_times_check', 'c', '10000'),
      ('studio_ai_request_gate', 'studio_ai_request_gate_lease_state_check', 'c', 'leaseTokenHash'),
      ('studio_ai_request_receipt', 'studio_ai_request_receipt_pkey', 'p', ''),
      ('studio_ai_request_receipt', 'studio_ai_request_receipt_user_request_unique', 'u', ''),
      ('studio_ai_request_receipt', 'studio_ai_request_receipt_userId_user_id_fk', 'f', ''),
      ('studio_ai_request_receipt', 'studio_ai_request_receipt_status_check', 'c', 'ambiguous'),
      ('studio_ai_request_receipt', 'studio_ai_request_receipt_attempt_count_check', 'c', 'attemptCount')
  )
  SELECT array_agg(
    expected."relationName" || '.' || expected."constraintName"
    ORDER BY expected."relationName", expected."constraintName"
  )
  INTO invalid_constraints
  FROM expected
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS actual
    WHERE actual.conrelid =
      to_regclass(format('public.%I', expected."relationName"))
      AND actual.conname = expected."constraintName"
      AND actual.contype = expected."constraintType"::"char"
      AND actual.convalidated
      AND (
        expected."definitionToken" = ''
        OR pg_catalog.pg_get_constraintdef(actual.oid, true)
          LIKE '%' || expected."definitionToken" || '%'
      )
  );

  IF invalid_constraints IS NOT NULL THEN
    RAISE EXCEPTION
      'cannot adopt through 0019: historical constraints are incomplete: %',
      invalid_constraints;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS index_record
    JOIN pg_catalog.pg_namespace AS index_namespace
      ON index_namespace.oid = index_record.relnamespace
    JOIN pg_catalog.pg_index AS index_state
      ON index_state.indexrelid = index_record.oid
    JOIN pg_catalog.pg_class AS indexed_table
      ON indexed_table.oid = index_state.indrelid
    WHERE index_namespace.nspname = 'public'
      AND index_record.relname = 'idx_studio_ai_request_receipt_expires'
      AND indexed_table.relname = 'studio_ai_request_receipt'
      AND index_record.relkind = 'i'
      AND index_state.indisvalid
      AND index_state.indisready
      AND index_state.indislive
      AND index_state.indnkeyatts = 1
      AND index_state.indnatts = 1
      AND index_state.indexprs IS NULL
      AND index_state.indpred IS NULL
      AND pg_catalog.pg_get_indexdef(index_record.oid)
        LIKE '%("expiresAt")%'
  ) THEN
    RAISE EXCEPTION
      'cannot adopt through 0019: AI receipt expiry index is missing';
  END IF;
END
$toonspectrum_historical_adoption$;
`;
}

export function decideMigrationAction({
  migration,
  ledgerEntry,
  mode,
  adoptionMarkerPresent,
}) {
  if (ledgerEntry) {
    if (ledgerEntry.checksum !== migration.checksum) {
      fail(
        `Migration checksum drift detected for ${migration.id}; create a new forward migration instead of editing history`,
      );
    }
    const expectedProvenance = expectedMigrationProvenance(migration);
    if (ledgerEntry.provenance !== expectedProvenance) {
      fail(
        `Migration provenance drift detected for ${migration.id}; expected ${expectedProvenance}`,
      );
    }
    if (ledgerEntry.state === "applied") return "skip";
    if (mode === "repair" && ["applying", "failed"].includes(ledgerEntry.state)) {
      return "repair";
    }
    fail(
      `Migration ${migration.id} is ${ledgerEntry.state}; use the explicit repair boundary`,
    );
  }

  if (mode === "adopt" && migration.sequence <= ADOPTION_BASELINE_SEQUENCE) {
    return "adopt";
  }
  if (mode === "repair") {
    fail(
      `Repair cannot create missing migration ${migration.id}; use adopt for reviewed history or apply for a pending migration`,
    );
  }
  if (!adoptionMarkerPresent || migration.sequence <= ADOPTION_BASELINE_SEQUENCE) {
    fail(
      `Historical migration ${migration.id} has no adopted ledger record; run the explicit adoption boundary`,
    );
  }
  return "apply";
}

export function buildRepairLockTakeoverSql(staleLockOwnerToken = "") {
  return `
    WITH current_lock AS MATERIALIZED (
      SELECT "ownerToken", "acquiredAt"
      FROM ${LOCK_RELATION}
      WHERE "singleton" = true
      FOR UPDATE
    ),
    removed AS (
      DELETE FROM ${LOCK_RELATION} AS lock
      USING current_lock
      WHERE lock."singleton" = true
        AND lock."ownerToken" = current_lock."ownerToken"
        AND current_lock."ownerToken" =
          ${sqlLiteral(staleLockOwnerToken)}
        AND current_lock."acquiredAt" <=
          statement_timestamp() - interval ${sqlLiteral(REPAIR_LOCK_STALE_AFTER)}
      RETURNING lock."ownerToken"
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM current_lock) THEN 'absent'
      WHEN EXISTS (SELECT 1 FROM removed) THEN 'stale-removed'
      WHEN ${sqlLiteral(staleLockOwnerToken)} = '' THEN 'token-required'
      WHEN NOT EXISTS (
        SELECT 1
        FROM current_lock
        WHERE "ownerToken" = ${sqlLiteral(staleLockOwnerToken)}
      ) THEN 'owner-mismatch'
      ELSE 'active'
    END;
  `;
}

export function validateAdoptionMarker(ledger, manifest) {
  const marker = ledger.get(ADOPTION_MARKER_ID);
  if (!marker) return false;
  if (
    marker.state !== "applied" ||
    marker.provenance !== "adopted" ||
    marker.checksum !== adoptionMarkerChecksum(manifest)
  ) {
    fail("Historical adoption marker is incomplete or has checksum drift");
  }
  return true;
}

export function parseArguments(argv) { // NOSONAR javascript:S3776
  const values = new Map();
  const booleanFlags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--allow-loopback") {
      if (booleanFlags.has(argument)) {
        fail(`Duplicate migration runner argument: ${argument}`);
      }
      booleanFlags.add(argument);
      continue;
    }
    if (
      ![
        "--mode",
        "--release-sha",
        "--confirmation",
        "--stale-lock-owner-token",
        "--runtime-database-role",
      ].includes(argument)
    ) {
      fail(`Unknown migration runner argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`Migration runner argument ${argument} requires a value`);
    }
    if (values.has(argument)) {
      fail(`Duplicate migration runner argument: ${argument}`);
    }
    values.set(argument, value);
    index += 1; // NOSONAR javascript:S2310
  }

  const mode = values.get("--mode");
  if (!mode || !(mode in MODE_CONFIRMATIONS)) {
    fail("Migration mode must be apply, adopt, or repair");
  }
  const releaseSha = values.get("--release-sha") ?? "";
  if (!/^[0-9a-f]{40}$/u.test(releaseSha)) {
    fail("Migration release SHA must be a full lowercase 40-character commit SHA");
  }
  const confirmation = values.get("--confirmation") ?? "";
  if (confirmation !== MODE_CONFIRMATIONS[mode]) {
    fail(`Migration confirmation does not match the ${mode} boundary`);
  }
  const staleLockOwnerToken =
    values.get("--stale-lock-owner-token") ?? "";
  if (
    staleLockOwnerToken &&
    !/^[0-9a-f]{64}$/u.test(staleLockOwnerToken)
  ) {
    fail("Stale migration lock owner token must be 64 lowercase hex characters");
  }
  if (mode !== "repair" && staleLockOwnerToken) {
    fail("A stale migration lock owner token is valid only in repair mode");
  }
  const runtimeDatabaseRole = validateRuntimeDatabaseRole(
    values.get("--runtime-database-role") ?? "",
  );
  return {
    mode,
    releaseSha,
    staleLockOwnerToken,
    runtimeDatabaseRole,
    allowLoopback: booleanFlags.has("--allow-loopback"),
  };
}
