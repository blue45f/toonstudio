#!/usr/bin/env node
// onpod single-owner-role variant of `pnpm db:bootstrap:production-empty -- --execute` (official flow, pinned commit 37b5183).
//
// What is identical to the official flow (same code, imported from the patched copies next to this file):
//   current-schema Drizzle DDL generation (twice, determinism proof) + single-transaction provisioning + table-set proof,
//   historical structure 0001-0019, forward-migration boundary, `adopt` (ledger bootstrap 0023, checksum adoption, marker),
//   forward `apply` of 0020-0113 with durable lock / checksum / provenance ledger, and an `apply` re-run as idempotency proof.
// What differs (the onpod role has no CREATEROLE, so a separate runtime role cannot exist):
//   no runtime role creation / NOLOGIN gate / role ACL normalisation / role-boundary probes, TLS = require instead of
//   verify-full, DROP EXTENSION pg_trgm skipped (extension is owned by the platform role).
// Connection: libpq environment only (PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGSSLMODE=require). No URL is ever built.
//
// Usage: ONPOD_SINGLE_ROLE=1 node scripts/onpod-apply-schema.mjs plan|execute   (wrapped by ../onpod-run.sh)

process.env.ONPOD_SINGLE_ROLE = "1"; // must be set before the patched modules are evaluated (they read it at import time)

import { performance } from "node:perf_hooks";

const RELEASE_SHA = "37b51837787ea67ee26b14358a1ac84664a7c584";
const RUNTIME_ROLE_PLACEHOLDER = "toonspectrum_runtime"; // name only: this role does not exist and is never created
const TARGET = "libpq-env:onpod";

const mode = process.argv[2];
if (mode !== "plan" && mode !== "execute") {
  process.stderr.write("usage: onpod-apply-schema.mjs plan|execute\n");
  process.exit(2);
}

const bootstrap = await import("./bootstrap-empty-production-database.mjs");
const migrations = await import("./run-production-database-migrations.mjs");

const log = (message) => process.stdout.write(`${message}\n`);
const psql = (sql, description, options = {}) =>
  bootstrap.bootstrapPsql(TARGET, sql, { allowLoopback: false, description, ...options });

function timed(label, action) {
  const startedAt = performance.now();
  log(`[${label}] start`);
  const result = action();
  log(`[${label}] done in ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
  return result;
}

// ---- 0. contract + preflight (read-only) ---------------------------------------------------------------------------
const contract = bootstrap.loadBootstrapContract();
log(`release sha            : ${RELEASE_SHA}`);
log(`contract fingerprint   : ${contract.fingerprint}`);
log(`manifest migrations    : ${contract.manifest.length} (${contract.manifest[0].id} .. ${contract.manifest.at(-1).id})`);
log(`historical (adopted)   : ${contract.historical.length} (through ${contract.historical.at(-1).id})`);
log(`forward (pending)      : ${contract.pending.length} (excluding ledger bootstrap 0023)`);

const inspectionOutput = timed("preflight", () =>
  psql(bootstrap.buildBootstrapDatabaseInspectionSql(RUNTIME_ROLE_PLACEHOLDER), "Bootstrap preflight", {
    tuplesOnly: true,
  }),
);
const inspection = JSON.parse(inspectionOutput.split(/\r?\n/u).at(-1));
// Only non-identifying facts are printed (role and database names are withheld on purpose).
log(
  `preflight facts        : ${JSON.stringify({
    applicationObjectCount: inspection.applicationObjectCount,
    operationsSchemaExists: inspection.operationsSchemaExists,
    otherClientConnections: inspection.activeConnectionCount,
    trigramExtensionInstalled: inspection.trigramExtensionInstalled,
    migratorCanCreateInDatabase: inspection.migratorCanCreateInDatabase,
    migratorCanCreateInPublic: inspection.migratorCanCreateInPublic,
    migratorCanCreateRole: inspection.migratorCanCreateRole,
    readOnly: inspection.readOnly,
    runtimeRoleExists: inspection.runtimeRoleExists,
  })}`,
);
if (inspection.readOnly) throw new Error("target is read-only");
if (!inspection.migratorCanCreateInDatabase || !inspection.migratorCanCreateInPublic) {
  throw new Error("migration role cannot create objects in the target database/public schema");
}
if (inspection.runtimeRoleExists) {
  throw new Error("a role named like the placeholder runtime role already exists; refusing to continue");
}
// The official preflight counts every relation in public, including PostGIS members (spatial_ref_sys, geometry_columns,
// geography_columns). Emptiness here means: no NON-extension relation / function / type in public or toonspectrum_ops
// (same membership rule as prepare-managed-database-bootstrap.mjs) and no toonspectrum_ops schema.
const NON_EXTENSION_OBJECTS_SQL = `
  SELECT count(*) FROM (
    SELECT c.oid, 'pg_catalog.pg_class'::regclass AS classid FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public', 'toonspectrum_ops') AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    UNION ALL SELECT p.oid, 'pg_catalog.pg_proc'::regclass FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('public', 'toonspectrum_ops')
    UNION ALL SELECT t.oid, 'pg_catalog.pg_type'::regclass FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname IN ('public', 'toonspectrum_ops') AND t.typrelid = 0 AND t.typelem = 0 AND t.typtype IN ('c', 'd', 'e', 'r', 'm')
  ) o WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend d WHERE d.classid = o.classid AND d.objid = o.oid AND d.deptype = 'e');`;
const nonExtensionObjects = Number(
  psql(NON_EXTENSION_OBJECTS_SQL, "Non-extension object count", { tuplesOnly: true }).split(/\r?\n/u)[0],
);
log(`non-extension objects  : ${nonExtensionObjects} (official preflight counted ${inspection.applicationObjectCount} incl. PostGIS members)`);
if (nonExtensionObjects !== 0 || inspection.operationsSchemaExists) {
  throw new Error(
    "target is not empty (application objects or toonspectrum_ops exist); run sql/reset-app-objects.sql first, then re-run",
  );
}
if (!inspection.trigramExtensionInstalled) {
  throw new Error("pg_trgm is not installed and cannot be created without extension privileges");
}

const ddl = timed("drizzle-ddl-generation (offline, x2 determinism proof)", () => bootstrap.generateCurrentSchemaDdl());
log(`drizzle base schema    : ${ddl.statements.length} statements, ${ddl.tableNames.length} tables`);

if (mode === "plan") {
  log("PLAN ONLY: no database writes performed.");
  log("Execution phases: 1 pg_trgm check | 2 Drizzle base | 3 historical 0001-0019 | 4 boundary | 5 adopt+apply 0020-0113 | 6 apply re-run");
  process.exit(0);
}

// ---- 1..6. execution (writes) ---------------------------------------------------------------------------------------
timed("1 pg_trgm", () => psql("CREATE EXTENSION IF NOT EXISTS pg_trgm;", "pg_trgm provision"));
bootstrap.assertBootstrapContractUnchanged(contract.fingerprint);

timed("2 current Drizzle base schema", () => bootstrap.runDrizzleFreshProvision(TARGET, false));
bootstrap.assertBootstrapContractUnchanged(contract.fingerprint);

timed("3 historical structure 0001-0019", () => {
  for (const migration of contract.historical) {
    psql(migration.contents, `Historical structure ${migration.id}`);
  }
});

timed("4 forward migration boundary", () =>
  psql(bootstrap.buildForwardMigrationBoundarySql(), "Forward migration boundary preparation"),
);
bootstrap.assertBootstrapContractUnchanged(contract.fingerprint);

const adoptResult = timed("5 adopt + apply (runner, mode=adopt)", () =>
  migrations.runProductionDatabaseMigrations({
    allowLoopback: false,
    databaseUrl: TARGET,
    mode: "adopt",
    releaseSha: RELEASE_SHA,
    runtimeDatabaseRole: RUNTIME_ROLE_PLACEHOLDER,
    runtimeRoleLoginMode: "bootstrap-gated",
  }),
);
log(`runner result (adopt)  : ${JSON.stringify(adoptResult)}`);
bootstrap.assertBootstrapContractUnchanged(contract.fingerprint);

const applyResult = timed("6 apply re-run (idempotency proof, mode=apply)", () =>
  migrations.runProductionDatabaseMigrations({
    allowLoopback: false,
    databaseUrl: TARGET,
    mode: "apply",
    releaseSha: RELEASE_SHA,
    runtimeDatabaseRole: RUNTIME_ROLE_PLACEHOLDER,
    runtimeRoleLoginMode: "bootstrap-gated",
  }),
);
log(`runner result (apply)  : ${JSON.stringify(applyResult)}`);
bootstrap.assertBootstrapContractUnchanged(contract.fingerprint);
log("ONPOD SCHEMA APPLY COMPLETE (single owner role; runtime-role ACL steps skipped).");
