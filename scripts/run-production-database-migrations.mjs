#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { applyAdminDatabaseFeatureContracts } from "./admin-database-feature-contracts.mjs";
import { buildCommunityCafeCapabilitySql, buildCommunityCafeRuntimeAclSql } from "./community-cafe-database-contract.mjs";
import { buildCareerConfirmationCapabilitySql, buildCareerConfirmationRuntimeAclSql } from "./creator-career-confirmation-database-contract.mjs";
import { buildHiringAutomationCapabilitySql, buildHiringAutomationRuntimeAclSql } from "./creator-hiring-automation-database-contract.mjs";
import { buildHiringCapabilitySql, buildHiringRuntimeAclSql } from "./creator-hiring-database-contract.mjs";
import { buildFeedbackCapabilitySql, buildFeedbackRuntimeAclSql } from "./feedback-database-contract.mjs";
import { buildFortuneSnapshotRuntimeAclSql } from "./fortune-snapshot-database-contract.mjs";
import {
  buildAuthRuntimeAclSql,
  buildAuthRuntimeAclViolationSql,
  buildCommunityCommentRuntimeAclSql,
  buildCommunityCommentRuntimeAclViolationSql,
  buildCreatorRoleWorkspaceRuntimeAclSql,
  buildCreatorRoleWorkspaceRuntimeAclViolationSql,
  buildMessagingRuntimeAclSql,
  buildMessagingRuntimeAclViolationSql,
  buildPersonalCloudRuntimeAclSql,
  buildPersonalCloudRuntimeAclViolationSql,
  buildRuntimeCutoverLedgerAclSql,
  buildRuntimeCutoverLedgerAclViolationSql,
  buildTrafficAnalyticsRuntimeAclSql,
  buildTrafficAnalyticsRuntimeAclViolationSql,
} from "./lib/production-db-migrations-core-acl.mjs";
import {
  buildCreatorMarketplaceRuntimeAclSql,
  buildCreatorMarketplaceRuntimeAclViolationSql,
} from "./lib/production-db-migrations-marketplace-acl.mjs";
import {
  ADOPTION_BASELINE_SEQUENCE,
  ADOPTION_MARKER_ID,
  LEDGER_RELATION,
  LOCK_RELATION,
  MODE_CONFIRMATIONS,
  REPAIR_LOCK_STALE_AFTER,
  adoptionMarkerChecksum,
  buildHistoricalAdoptionVerificationSql,
  buildMigrationLedgerRuntimeAclSql,
  buildMigrationLedgerRuntimeAclViolationSql,
  buildRepairLockTakeoverSql,
  buildRuntimeDatabaseRoleBoundaryStateSql,
  checksum,
  decideMigrationAction,
  fail,
  migrationId,
  migrationSequence,
  parseArguments,
  parseManifestLines,
  sqlLiteral,
  validateAdoptionMarker,
  validateMigrationSequenceContinuity,
} from "./lib/production-db-migrations-planning.mjs";
import {
  buildCreatorAssetObjectStorageRuntimeAclSql,
  buildCreatorAssetObjectStorageRuntimeAclViolationSql,
  buildMembershipRuntimeAclSql,
  buildMembershipRuntimeAclViolationSql,
} from "./lib/production-db-migrations-storage-membership-acl.mjs";
import {
  buildStudioProductionRuntimeAclSql,
  buildStudioProductionRuntimeAclViolationSql,
  buildStudioProjectGraphRuntimeAclSql,
  buildStudioProjectGraphRuntimeAclViolationSql,
} from "./lib/production-db-migrations-studio-acl.mjs";
import { psql, queryScalar } from "./production-database-connection.mjs";
import { buildProductionOperationCapabilitySql, buildProductionOperationRuntimeAclSql } from "./production-operation-database-contract.mjs";
import { buildProductionOperationsRuntimeAclSql } from "./production-operations-database-contract.mjs";
import { applyProtectedRecordRuntimeContracts } from "./protected-record-database-contracts.mjs";
import { POST_BASELINE_RELATIONS } from "./run-production-database-migrations-relations.mjs";
import { buildStudioSpacePollRuntimeAclSql } from "./studio-space-poll-runtime-acl.mjs";
import { buildStudioVirtualSpaceCapabilitySql, buildStudioVirtualSpaceRuntimeAclSql } from "./studio-virtual-space-database-contract.mjs";
import { buildWorkVrmCutRuntimeAclSql } from "./studio-work-vrm-cut-runtime-acl.mjs";
import {
  validateProductionDatabaseUrl,
  validateRuntimeDatabaseRole,
} from "./validate-production-database-url.mjs";

export {
  POST_BASELINE_RELATIONS,
  buildAuthRuntimeAclSql,
  buildAuthRuntimeAclViolationSql,
  buildCommunityCommentRuntimeAclSql,
  buildCommunityCommentRuntimeAclViolationSql,
  buildCreatorAssetObjectStorageRuntimeAclSql,
  buildCreatorAssetObjectStorageRuntimeAclViolationSql,
  buildCreatorMarketplaceRuntimeAclSql,
  buildCreatorMarketplaceRuntimeAclViolationSql,
  buildCreatorRoleWorkspaceRuntimeAclSql,
  buildCreatorRoleWorkspaceRuntimeAclViolationSql,
  buildHistoricalAdoptionVerificationSql,
  buildMembershipRuntimeAclSql,
  buildMembershipRuntimeAclViolationSql,
  buildMessagingRuntimeAclSql,
  buildMessagingRuntimeAclViolationSql,
  buildMigrationLedgerRuntimeAclSql,
  buildMigrationLedgerRuntimeAclViolationSql,
  buildPersonalCloudRuntimeAclSql,
  buildPersonalCloudRuntimeAclViolationSql,
  buildRepairLockTakeoverSql,
  buildRuntimeCutoverLedgerAclSql,
  buildRuntimeCutoverLedgerAclViolationSql,
  buildRuntimeDatabaseRoleBoundaryStateSql,
  buildStudioProductionRuntimeAclSql,
  buildStudioProductionRuntimeAclViolationSql,
  buildStudioProjectGraphRuntimeAclSql,
  buildStudioProjectGraphRuntimeAclViolationSql,
  buildTrafficAnalyticsRuntimeAclSql,
  buildTrafficAnalyticsRuntimeAclViolationSql,
  decideMigrationAction,
  psql,
  queryScalar,
  validateAdoptionMarker,
  validateMigrationSequenceContinuity,
  validateRuntimeDatabaseRole,
};

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const MANIFEST_PATH = resolve(
  SCRIPT_DIRECTORY,
  "production-database-migrations.manifest",
);
const MIGRATION_DIRECTORY = resolve(REPOSITORY_ROOT, "apps/api/src/platform/database/migrations");

export function loadMigrationManifest({
  repositoryRoot = REPOSITORY_ROOT,
  manifestPath = MANIFEST_PATH,
  migrationDirectory = MIGRATION_DIRECTORY,
} = {}) {
  const paths = parseManifestLines(readFileSync(manifestPath, "utf8"));
  if (paths.length === 0) fail("Production migration manifest is empty");
  if (new Set(paths).size !== paths.length) {
    fail("Production migration manifest contains a duplicate path");
  }

  const expectedPaths = readdirSync(migrationDirectory)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort()
    .map((name) => `apps/api/src/platform/database/migrations/${name}`);
  if (
    paths.length !== expectedPaths.length ||
    paths.some((entry, index) => entry !== expectedPaths[index])
  ) {
    fail(
      "Production migration manifest must list every numbered SQL migration exactly once in lexical order",
    );
  }

  const manifest = paths.map((relativePath) => {
    if (!/^apps\/api\/src\/platform\/database\/migrations\/\d{4}_[a-z0-9_]+\.sql$/u.test(relativePath)) {
      fail(`Invalid production migration manifest path: ${relativePath}`);
    }
    const absolutePath = resolve(repositoryRoot, relativePath);
    if (
      !absolutePath.startsWith(
        `${resolve(repositoryRoot, "apps/api/src/platform/database/migrations")}/`,
      )
    ) {
      fail(`Migration path escapes the migration directory: ${relativePath}`);
    }
    const contents = readFileSync(absolutePath, "utf8");
    const id = migrationId(relativePath);
    return Object.freeze({
      id,
      sequence: migrationSequence(id),
      relativePath,
      absolutePath,
      contents,
      checksum: checksum(contents),
    });
  });
  validateMigrationSequenceContinuity(manifest);
  return Object.freeze(manifest);
}

export function ledgerExists(databaseUrl) {
  return (
    queryScalar(
      databaseUrl,
      `SELECT to_regclass(${sqlLiteral(LEDGER_RELATION)}) IS NOT NULL;`,
    ) === "t"
  );
}

export function requireProvisionedBase(databaseUrl) {
  const ready = queryScalar(
    databaseUrl,
    `
      SELECT
        to_regclass('public."user"') IS NOT NULL
        AND to_regclass('public.creator_work') IS NOT NULL
        AND to_regclass('public.creator_work_live_lock') IS NOT NULL;
    `,
  );
  if (ready !== "t") {
    fail(
      "Production migration runner requires a provisioned base schema; bootstrap is a separate approved operation",
    );
  }
}

export function requireMigrationRoleSeparation(
  databaseUrl,
  runtimeDatabaseRole,
  { requireRuntimeLogin = true } = {},
) {
  const boundaryState = queryScalar(
    databaseUrl,
    `SELECT ${buildRuntimeDatabaseRoleBoundaryStateSql(runtimeDatabaseRole, {
      requireLogin: requireRuntimeLogin,
    })};`,
  );
  if (boundaryState !== "separated") {
    fail(
      `Production migration role separation failed: ${boundaryState || "unknown"}`,
    );
  }
}

function hardenAndVerifyLedgerRuntimeAcl(
  databaseUrl,
  runtimeDatabaseRole,
) {
  psql(
    databaseUrl,
    `
      ${buildMigrationLedgerRuntimeAclSql(runtimeDatabaseRole)}

      DO $toonspectrum_ops_acl_verify$
      BEGIN
        IF ${buildMigrationLedgerRuntimeAclViolationSql(runtimeDatabaseRole)} THEN
          RAISE EXCEPTION
            'runtime database role retains migration schema or ledger privileges';
        END IF;
      END
      $toonspectrum_ops_acl_verify$;
    `,
  );
}

function verifyHistoricalAdoptionCapabilities(databaseUrl) {
  psql(databaseUrl, buildHistoricalAdoptionVerificationSql());
}

export function readLedger(databaseUrl) {
  const output = psql(
    databaseUrl,
    `
      SELECT "id", "checksum", "state", "provenance", "releaseSha"
      FROM ${LEDGER_RELATION}
      ORDER BY "id";
    `,
    { tuplesOnly: true },
  );
  const entries = new Map();
  if (!output) return entries;
  for (const line of output.split(/\r?\n/u)) {
    const [id, storedChecksum, state, provenance, releaseSha] = line.split("|");
    if (!id || !storedChecksum || !state || !provenance || !releaseSha) {
      fail("Production migration ledger returned an invalid row");
    }
    entries.set(id, {
      id,
      checksum: storedChecksum,
      state,
      provenance,
      releaseSha,
    });
  }
  return entries;
}

export function acquireRunnerLock(
  databaseUrl,
  releaseSha,
  mode,
  staleLockOwnerToken,
) {
  if (mode === "repair") {
    const takeoverState = queryScalar(
      databaseUrl,
      buildRepairLockTakeoverSql(staleLockOwnerToken),
    );
    if (takeoverState === "token-required") {
      fail(
        "A stale lock owner token is required to repair an existing durable migration lock",
      );
    }
    if (takeoverState === "owner-mismatch") {
      fail("The supplied stale lock owner token does not match");
    }
    if (takeoverState === "active") {
      fail(
        `The durable migration lock is younger than ${REPAIR_LOCK_STALE_AFTER}; repair refuses to steal an active runner`,
      );
    }
    if (!["absent", "stale-removed"].includes(takeoverState)) {
      fail("Unable to establish the durable migration lock repair state");
    }
  }
  const ownerToken = randomBytes(32).toString("hex");
  const claimed = queryScalar(
    databaseUrl,
    `
      INSERT INTO ${LOCK_RELATION}
        ("singleton", "ownerToken", "releaseSha", "acquiredAt")
      VALUES (
        true,
        ${sqlLiteral(ownerToken)},
        ${sqlLiteral(releaseSha)},
        statement_timestamp()
      )
      ON CONFLICT ("singleton") DO NOTHING
      RETURNING "ownerToken";
    `,
  );
  if (claimed !== ownerToken) {
    fail(
      "Another migration runner owns the durable database lock; an interrupted lock requires the explicit repair boundary",
    );
  }
  return ownerToken;
}

export function releaseRunnerLock(databaseUrl, ownerToken) {
  psql(
    databaseUrl,
    `
      DELETE FROM ${LOCK_RELATION}
      WHERE "singleton" = true
        AND "ownerToken" = ${sqlLiteral(ownerToken)};
    `,
    { tuplesOnly: true },
  );
}

export function claimMigration(databaseUrl, migration, releaseSha, action) {
  const overwriteIncomplete = action === "repair";
  const result = queryScalar(
    databaseUrl,
    `
      INSERT INTO ${LEDGER_RELATION} AS existing (
        "id",
        "checksum",
        "state",
        "provenance",
        "releaseSha",
        "startedAt",
        "appliedAt",
        "updatedAt"
      )
      VALUES (
        ${sqlLiteral(migration.id)},
        ${sqlLiteral(migration.checksum)},
        'applying',
        'executed',
        ${sqlLiteral(releaseSha)},
        statement_timestamp(),
        NULL,
        statement_timestamp()
      )
      ON CONFLICT ("id") DO UPDATE
      SET
        "state" = 'applying',
        "provenance" = 'executed',
        "releaseSha" = EXCLUDED."releaseSha",
        "startedAt" = EXCLUDED."startedAt",
        "appliedAt" = NULL,
        "updatedAt" = EXCLUDED."updatedAt"
      WHERE ${overwriteIncomplete ? "true" : "false"}
        AND existing."checksum" = EXCLUDED."checksum"
        AND existing."state" IN ('applying', 'failed')
      RETURNING "id";
    `,
  );
  if (result !== migration.id) {
    fail(`Migration ${migration.id} could not claim its ledger state`);
  }
}

export function markMigrationApplied(databaseUrl, migration, releaseSha) {
  const updated = queryScalar(
    databaseUrl,
    `
      UPDATE ${LEDGER_RELATION}
      SET
        "state" = 'applied',
        "appliedAt" = statement_timestamp(),
        "updatedAt" = statement_timestamp()
      WHERE "id" = ${sqlLiteral(migration.id)}
        AND "checksum" = ${sqlLiteral(migration.checksum)}
        AND "releaseSha" = ${sqlLiteral(releaseSha)}
        AND "state" = 'applying'
      RETURNING "id";
    `,
  );
  if (updated !== migration.id) {
    fail(`Migration ${migration.id} committed but its ledger acknowledgement failed`);
  }
}

export function markMigrationFailed(databaseUrl, migration, releaseSha) {
  try {
    psql(
      databaseUrl,
      `
        UPDATE ${LEDGER_RELATION}
        SET
          "state" = 'failed',
          "updatedAt" = statement_timestamp()
        WHERE "id" = ${sqlLiteral(migration.id)}
          AND "checksum" = ${sqlLiteral(migration.checksum)}
          AND "releaseSha" = ${sqlLiteral(releaseSha)}
          AND "state" = 'applying';
      `,
      { tuplesOnly: true },
    );
  } catch {
    // An unknown connection outcome deliberately leaves `applying`, which is also fail-closed.
  }
}

function applyMigration(databaseUrl, migration, releaseSha, action) {
  claimMigration(databaseUrl, migration, releaseSha, action);
  process.stdout.write(`Applying ${migration.id} ...\n`);
  try {
    psql(databaseUrl, migration.contents);
    markMigrationApplied(databaseUrl, migration, releaseSha);
  } catch (error) {
    markMigrationFailed(databaseUrl, migration, releaseSha);
    throw error;
  }
}

function recordBootstrappedLedgerMigration(
  databaseUrl,
  migration,
  releaseSha,
) {
  psql(
    databaseUrl,
    `
      INSERT INTO ${LEDGER_RELATION} AS existing (
        "id",
        "checksum",
        "state",
        "provenance",
        "releaseSha",
        "startedAt",
        "appliedAt",
        "updatedAt"
      )
      VALUES (
        ${sqlLiteral(migration.id)},
        ${sqlLiteral(migration.checksum)},
        'applied',
        'bootstrap',
        ${sqlLiteral(releaseSha)},
        statement_timestamp(),
        statement_timestamp(),
        statement_timestamp()
      )
      ON CONFLICT ("id") DO NOTHING;
    `,
  );
}

function recordHistoricalAdoption(databaseUrl, manifest, releaseSha) {
  const historicalMigrations = manifest.filter(
    (migration) => migration.sequence <= ADOPTION_BASELINE_SEQUENCE,
  );
  const adoptedValues = historicalMigrations
    .map(
      (migration) =>
        `(${sqlLiteral(migration.id)}, ${sqlLiteral(migration.checksum)})`,
    )
    .join(",\n          ");
  psql(
    databaseUrl,
    `
      BEGIN;

      WITH adopted("id", "checksum") AS (
        VALUES
          ${adoptedValues}
      )
      INSERT INTO ${LEDGER_RELATION} (
        "id",
        "checksum",
        "state",
        "provenance",
        "releaseSha",
        "startedAt",
        "appliedAt",
        "updatedAt"
      )
      SELECT
        adopted."id",
        adopted."checksum",
        'applied',
        'adopted',
        ${sqlLiteral(releaseSha)},
        statement_timestamp(),
        statement_timestamp(),
        statement_timestamp()
      FROM adopted
      ON CONFLICT ("id") DO NOTHING;

      DO $toonspectrum_adoption_record$
      DECLARE
        invalid_rows text[];
      BEGIN
        WITH adopted("id", "checksum") AS (
          VALUES
            ${adoptedValues}
        )
        SELECT array_agg(adopted."id" ORDER BY adopted."id")
        INTO invalid_rows
        FROM adopted
        LEFT JOIN ${LEDGER_RELATION} AS recorded
          ON recorded."id" = adopted."id"
        WHERE recorded."id" IS NULL
          OR recorded."checksum" <> adopted."checksum"
          OR recorded."state" <> 'applied'
          OR recorded."provenance" <> 'adopted'
          OR recorded."appliedAt" IS NULL;

        IF invalid_rows IS NOT NULL THEN
          RAISE EXCEPTION
            'historical adoption ledger conflicts with reviewed checksums: %',
            invalid_rows;
        END IF;
      END
      $toonspectrum_adoption_record$;

      COMMIT;
    `,
  );
}

function recordAdoptionMarker(databaseUrl, manifest, releaseSha) {
  const markerChecksum = adoptionMarkerChecksum(manifest);
  const result = queryScalar(
    databaseUrl,
    `
      INSERT INTO ${LEDGER_RELATION} AS existing (
        "id",
        "checksum",
        "state",
        "provenance",
        "releaseSha",
        "startedAt",
        "appliedAt",
        "updatedAt"
      )
      VALUES (
        ${sqlLiteral(ADOPTION_MARKER_ID)},
        ${sqlLiteral(markerChecksum)},
        'applied',
        'adopted',
        ${sqlLiteral(releaseSha)},
        statement_timestamp(),
        statement_timestamp(),
        statement_timestamp()
      )
      ON CONFLICT ("id") DO UPDATE
      SET "updatedAt" = EXCLUDED."updatedAt"
      WHERE existing."checksum" = EXCLUDED."checksum"
        AND existing."state" = 'applied'
        AND existing."provenance" = 'adopted'
      RETURNING "id";
    `,
  );
  if (result !== ADOPTION_MARKER_ID) {
    fail("Historical adoption marker conflicts with the reviewed migration history");
  }
}

export function runProductionDatabaseMigrations({ // NOSONAR javascript:S3776
  databaseUrl,
  mode,
  releaseSha,
  staleLockOwnerToken = "",
  runtimeDatabaseRole,
  allowLoopback = false,
  runtimeRoleLoginMode = "required",
}) {
  validateProductionDatabaseUrl(databaseUrl, { allowLoopback });
  validateRuntimeDatabaseRole(runtimeDatabaseRole);
  if (!mode || !(mode in MODE_CONFIRMATIONS)) {
    fail("Migration mode must be apply, adopt, or repair");
  }
  if (!/^[0-9a-f]{40}$/u.test(releaseSha)) {
    fail("Migration release SHA must be a full lowercase 40-character commit SHA");
  }
  if (
    staleLockOwnerToken &&
    !/^[0-9a-f]{64}$/u.test(staleLockOwnerToken)
  ) {
    fail("Stale migration lock owner token must be 64 lowercase hex characters");
  }
  if (mode !== "repair" && staleLockOwnerToken) {
    fail("A stale migration lock owner token is valid only in repair mode");
  }
  if (
    runtimeRoleLoginMode !== "required" &&
    runtimeRoleLoginMode !== "bootstrap-gated"
  ) {
    fail("Runtime role login mode must be required or bootstrap-gated");
  }
  requireMigrationRoleSeparation(databaseUrl, runtimeDatabaseRole, {
    requireRuntimeLogin: runtimeRoleLoginMode === "required",
  });
  requireProvisionedBase(databaseUrl);
  const manifest = loadMigrationManifest();
  const ledgerMigration = manifest.find(
    (migration) => migration.id === "0023_production_migration_ledger",
  );
  if (!ledgerMigration) fail("Migration manifest is missing the ledger bootstrap");

  if (!ledgerExists(databaseUrl)) {
    if (mode !== "adopt") {
      fail(
        "Production migration ledger is not initialized; only the explicit adoption boundary may create it",
      );
    }
    psql(databaseUrl, ledgerMigration.contents);
  }
  hardenAndVerifyLedgerRuntimeAcl(databaseUrl, runtimeDatabaseRole);

  let ownerToken;
  try {
    ownerToken = acquireRunnerLock(
      databaseUrl,
      releaseSha,
      mode,
      staleLockOwnerToken,
    );
    let ledger = readLedger(databaseUrl);
    if (!ledger.has(ledgerMigration.id)) {
      if (mode !== "adopt") {
        fail(
          "Migration ledger bootstrap row is missing; only the explicit adoption boundary may record it",
        );
      }
      recordBootstrappedLedgerMigration(
        databaseUrl,
        ledgerMigration,
        releaseSha,
      );
      ledger = readLedger(databaseUrl);
    }

    const ledgerBootstrapEntry = ledger.get(ledgerMigration.id);
    if (
      !ledgerBootstrapEntry ||
      ledgerBootstrapEntry.checksum !== ledgerMigration.checksum ||
      ledgerBootstrapEntry.state !== "applied" ||
      ledgerBootstrapEntry.provenance !== "bootstrap"
    ) {
      fail("Migration ledger bootstrap row is incomplete or has drift");
    }
    let markerPresent = validateAdoptionMarker(ledger, manifest);
    if (mode === "adopt" && markerPresent) {
      fail("Historical migration adoption is already complete; use apply mode");
    }
    if (mode !== "adopt" && !markerPresent) {
      fail(
        "Historical migration adoption marker is missing; use the explicit adoption boundary",
      );
    }

    let adopted = 0;
    if (mode === "adopt") {
      verifyHistoricalAdoptionCapabilities(databaseUrl);
      recordHistoricalAdoption(databaseUrl, manifest, releaseSha);
      recordAdoptionMarker(databaseUrl, manifest, releaseSha);
      adopted = manifest.filter(
        (migration) => migration.sequence <= ADOPTION_BASELINE_SEQUENCE,
      ).length;
      ledger = readLedger(databaseUrl);
      markerPresent = validateAdoptionMarker(ledger, manifest);
    }

    let applied = 0;
    let skipped = 0;
    for (const migration of manifest) {
      const action = decideMigrationAction({
        migration,
        ledgerEntry: ledger.get(migration.id),
        mode,
        adoptionMarkerPresent: markerPresent,
      });
      if (action === "skip") {
        skipped += 1;
        continue;
      }
      if (action === "adopt") {
        fail(
          `Historical migration ${migration.id} was not atomically recorded during adoption`,
        );
      }
      applyMigration(databaseUrl, migration, releaseSha, action);
      applied += 1;
      ledger = readLedger(databaseUrl);
    }

    applyProtectedRecordRuntimeContracts((sql) => psql(databaseUrl, sql), runtimeDatabaseRole);
    psql(databaseUrl, buildAuthRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildTrafficAnalyticsRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildCreatorRoleWorkspaceRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildPersonalCloudRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildCommunityCommentRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildMessagingRuntimeAclSql(runtimeDatabaseRole));
    applyAdminDatabaseFeatureContracts((sql) => psql(databaseUrl, sql), runtimeDatabaseRole);
    psql(databaseUrl, buildFeedbackRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildFeedbackCapabilitySql(runtimeDatabaseRole));
    psql(databaseUrl, buildCommunityCafeRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildCommunityCafeCapabilitySql(runtimeDatabaseRole));
    psql(databaseUrl, buildRuntimeCutoverLedgerAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildMembershipRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildHiringRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildHiringCapabilitySql(runtimeDatabaseRole));
    psql(databaseUrl, buildHiringAutomationRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildHiringAutomationCapabilitySql(runtimeDatabaseRole));
    psql(databaseUrl, buildFortuneSnapshotRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildCareerConfirmationRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildCareerConfirmationCapabilitySql(runtimeDatabaseRole));
    psql(databaseUrl, buildProductionOperationRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildProductionOperationCapabilitySql(runtimeDatabaseRole));
    psql(databaseUrl, buildStudioVirtualSpaceRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildStudioVirtualSpaceCapabilitySql(runtimeDatabaseRole));
    psql(databaseUrl, buildStudioProductionRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildProductionOperationsRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildStudioProjectGraphRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildCreatorMarketplaceRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildCreatorAssetObjectStorageRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildWorkVrmCutRuntimeAclSql(runtimeDatabaseRole));
    psql(databaseUrl, buildStudioSpacePollRuntimeAclSql(runtimeDatabaseRole));

    process.stdout.write(
      `Production migration manifest complete: ${adopted} adopted, ${applied} applied, ${skipped} checksum-verified skips\n`,
    );
    return { adopted, applied, skipped };
  } finally {
    if (ownerToken) releaseRunnerLock(databaseUrl, ownerToken);
  }
}

function runCli() {
  const options = parseArguments(process.argv.slice(2));
  const environmentStaleLockOwnerToken =
    process.env.MIGRATION_STALE_LOCK_OWNER_TOKEN ?? "";
  if (
    options.staleLockOwnerToken &&
    environmentStaleLockOwnerToken &&
    options.staleLockOwnerToken !== environmentStaleLockOwnerToken
  ) {
    fail("Conflicting stale migration lock owner tokens were supplied");
  }
  const databaseUrl =
    process.env.MIGRATION_DATABASE_URL ??
    process.env.PRODUCTION_DATABASE_DIRECT_URL;
  return runProductionDatabaseMigrations({
    databaseUrl,
    ...options,
    staleLockOwnerToken:
      options.staleLockOwnerToken || environmentStaleLockOwnerToken,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Production migration runner failed"}\n`,
    );
    process.exitCode = 1;
  }
}
