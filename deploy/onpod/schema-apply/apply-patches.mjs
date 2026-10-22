#!/usr/bin/env node
// Re-creates the patched copies of the official ToonStudio production scripts (pinned commit 37b5183) inside the
// scratch repo from the pristine copies in ./orig-scripts. Every replacement must match exactly once, otherwise abort.
// The pristine inputs are byte-identical to `git show 37b5183:scripts/<file>`; unified diffs are written to ./patches.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ORIG = join(HERE, "orig-scripts");
const OUT = join(HERE, "repo", "scripts");
mkdirSync(join(HERE, "patches"), { recursive: true });

function patch(file, edits) {
  let text = readFileSync(join(ORIG, file), "utf8");
  for (const [label, search, replacement] of edits) {
    const count = text.split(search).length - 1;
    if (count !== 1) throw new Error(`${file}: patch "${label}" must match exactly once but matched ${count}`);
    text = text.replace(search, () => replacement);
  }
  writeFileSync(join(OUT, file), text);
  const diff = spawnSync("diff", ["-u", "--label", `a/${file}`, "--label", `b/${file}`, join(ORIG, file), join(OUT, file)], { encoding: "utf8" });
  writeFileSync(join(HERE, "patches", `${file}.diff`), diff.stdout);
  console.log(`patched ${file}: ${edits.length} edit(s), ${diff.stdout.split("\n").filter((l) => /^[+-][^+-]/.test(l)).length} changed line(s)`);
}

// ---------------------------------------------------------------------------------------------------------------
// 1) validate-production-database-url.mjs : accept "libpq-env:" pseudo URL = connection comes from PG* environment
//    (sslmode=require + channel_binding=require; server certificate is self-signed so verify-full can never pass).
patch("validate-production-database-url.mjs", [
  ["libpq-env helpers", `const FORBIDDEN_EFFECTIVE_HOST_MARKERS = ["pooler", "pgbouncer"];
`, `const FORBIDDEN_EFFECTIVE_HOST_MARKERS = ["pooler", "pgbouncer"];

// [ONPOD PATCH] "libpq-env:" pseudo URL: credentials stay in PGHOST/PGUSER/PGPASSWORD/PGDATABASE (never in a URL).
// Transport contract is relaxed from verify-full to require (+ channel_binding=require): the onpod server certificate is
// self-signed with a mismatching CN, so verify-full cannot succeed. Everything else is unchanged.
const LIBPQ_ENV_PREFIX = "libpq-env:";
function isLibpqEnvTarget(rawValue) {
  return typeof rawValue === "string" && rawValue.startsWith(LIBPQ_ENV_PREFIX);
}
function libpqEnvContract(environment = process.env) {
  if (environment.PGSSLMODE !== "require") {
    fail("libpq-env mode requires PGSSLMODE=require (TLS encrypted, certificate not verified)");
  }
  for (const key of ["PGHOST", "PGUSER", "PGPASSWORD", "PGDATABASE"]) {
    if (!environment[key]) fail(\`libpq-env mode requires \${key}\`);
  }
  return Object.freeze({
    protocol: "postgresql:",
    hostname: environment.PGHOST,
    port: environment.PGPORT || "5432",
    databaseName: environment.PGDATABASE,
    tlsVerified: false,
  });
}
`],
  ["validate hook", `  rawValue,
  { allowLoopback = false } = {},
) {
  const value = typeof rawValue === "string" ? rawValue.trim() : "";`, `  rawValue,
  { allowLoopback = false } = {},
) {
  if (isLibpqEnvTarget(rawValue)) return libpqEnvContract();
  const value = typeof rawValue === "string" ? rawValue.trim() : "";`],
  ["psql env hook", `  { allowLoopback = false, baseEnvironment = process.env } = {},
) {
  const contract = validateProductionDatabaseUrl(rawValue, { allowLoopback });`, `  { allowLoopback = false, baseEnvironment = process.env } = {},
) {
  if (isLibpqEnvTarget(rawValue)) {
    libpqEnvContract(baseEnvironment);
    return {
      ...baseEnvironment,
      PGSSLMODE: "require",
      PGCHANNELBINDING: "require",
      PGCONNECT_TIMEOUT: baseEnvironment.PGCONNECT_TIMEOUT ?? "20",
    };
  }
  const contract = validateProductionDatabaseUrl(rawValue, { allowLoopback });`],
]);

// ---------------------------------------------------------------------------------------------------------------
// 2) run-production-database-migrations.mjs : single-owner-role mode (ONPOD_SINGLE_ROLE=1)
patch("run-production-database-migrations.mjs", [
  ["single-role flag", `const REPAIR_LOCK_STALE_AFTER = "60 minutes";
`, `const REPAIR_LOCK_STALE_AFTER = "60 minutes";
// [ONPOD PATCH] The onpod role cannot CREATE ROLE, so there is no separate runtime role. In this mode every step that
// names the runtime role (separation probe, per-role REVOKE/GRANT/POLICY, role capability probes) is skipped and logged.
const SINGLE_ROLE_MODE = process.env.ONPOD_SINGLE_ROLE === "1";
`],
  ["skip role separation", `  { requireRuntimeLogin = true } = {},
) {
  const boundaryState = queryScalar(`, `  { requireRuntimeLogin = true } = {},
) {
  if (SINGLE_ROLE_MODE) {
    process.stdout.write("[onpod] SKIPPED role separation probe (single owner role)\\n");
    return;
  }
  const boundaryState = queryScalar(`],
  ["ledger acl PUBLIC only", `  runtimeDatabaseRole,
) {
  psql(
    databaseUrl,
    \`
      \${buildMigrationLedgerRuntimeAclSql(runtimeDatabaseRole)}
`, `  runtimeDatabaseRole,
) {
  if (SINGLE_ROLE_MODE) {
    psql(
      databaseUrl,
      \`
        REVOKE ALL ON SCHEMA toonspectrum_ops FROM PUBLIC;
        REVOKE ALL ON ALL TABLES IN SCHEMA toonspectrum_ops FROM PUBLIC;
      \`,
    );
    process.stdout.write("[onpod] ledger ACL: PUBLIC revoked; runtime-role revoke/verify SKIPPED (single owner role)\\n");
    return;
  }
  psql(
    databaseUrl,
    \`
      \${buildMigrationLedgerRuntimeAclSql(runtimeDatabaseRole)}
`],
  ["execution override hook", `function applyMigration(databaseUrl, migration, releaseSha, action) {
  claimMigration(databaseUrl, migration, releaseSha, action);
  process.stdout.write(\`Applying \${migration.id} ...\\n\`);
  try {
    psql(databaseUrl, migration.contents);`, `// [ONPOD PATCH] Execution-only SQL adaptations. The ledger checksum is still the SHA-256 of the UNMODIFIED reviewed file.
// 0093 runs \`SET LOCAL search_path = pg_catalog, public\` and then creates studio_review_voice_note_guard() unqualified, so
// the function would be created in pg_catalog: denied for any non-superuser ("permission denied for schema pg_catalog").
// Qualifying it with public. matches the clear intent (replace the public guard function created by 0090).
const EXECUTION_OVERRIDES = Object.freeze({
  "0093_review_voice_note_constraints_repair": Object.freeze([
    [
      "CREATE OR REPLACE FUNCTION studio_review_voice_note_guard() RETURNS trigger",
      "CREATE OR REPLACE FUNCTION public.studio_review_voice_note_guard() RETURNS trigger",
    ],
  ]),
});

function executionSql(migration) {
  const edits = EXECUTION_OVERRIDES[migration.id];
  if (!edits) return migration.contents;
  let sql = migration.contents;
  for (const [search, replacement] of edits) {
    if (sql.split(search).length !== 2) {
      fail(\`Execution override for \${migration.id} no longer matches exactly once\`);
    }
    sql = sql.replace(search, () => replacement);
    process.stdout.write(
      \`[onpod] EXECUTION OVERRIDE \${migration.id}: \${JSON.stringify(search)} -> \${JSON.stringify(replacement)}\\n\`,
    );
  }
  return sql;
}

function applyMigration(databaseUrl, migration, releaseSha, action) {
  claimMigration(databaseUrl, migration, releaseSha, action);
  process.stdout.write(\`Applying \${migration.id} ...\\n\`);
  try {
    psql(databaseUrl, executionSql(migration));`],
  ["skip post-loop role ACL (start)", `    // Normalize dynamic-role ACLs on every run. This also repairs providers that do not preserve
    // ALTER DEFAULT PRIVILEGES across independently owned migration and application roles.
    psql(databaseUrl, buildAuthRuntimeAclSql(runtimeDatabaseRole));`, `    // Normalize dynamic-role ACLs on every run. This also repairs providers that do not preserve
    // ALTER DEFAULT PRIVILEGES across independently owned migration and application roles.
    if (SINGLE_ROLE_MODE) {
      process.stdout.write("[onpod] SKIPPED 30 runtime-role ACL/capability statements (single owner role)\\n");
    } else {
    psql(databaseUrl, buildAuthRuntimeAclSql(runtimeDatabaseRole));`],
  ["skip post-loop role ACL (end)", `      buildCreatorAssetObjectStorageRuntimeAclSql(runtimeDatabaseRole),
    );

    process.stdout.write(
      \`Production migration manifest complete:`, `      buildCreatorAssetObjectStorageRuntimeAclSql(runtimeDatabaseRole),
    );
    }

    process.stdout.write(
      \`Production migration manifest complete:`],
]);

// ---------------------------------------------------------------------------------------------------------------
// 3) bootstrap-empty-production-database.mjs : export internals for the single-role orchestrator and keep pg_trgm
patch("bootstrap-empty-production-database.mjs", [
  ["do not drop foreign-owned pg_trgm", `CASCADE;
DROP EXTENSION IF EXISTS pg_trgm;
\`;
}`, `CASCADE;
\${process.env.ONPOD_SINGLE_ROLE === "1" ? "-- [onpod] DROP EXTENSION pg_trgm skipped: extension is owned by the platform role" : "DROP EXTENSION IF EXISTS pg_trgm;"}
\`;
}`],
  ["ignore extension-owned tables (PostGIS spatial_ref_sys) in base-schema verification", `    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename;",`, `    "SELECT t.tablename FROM pg_catalog.pg_tables AS t WHERE t.schemaname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS d WHERE d.classid = 'pg_catalog.pg_class'::regclass AND d.objid = pg_catalog.to_regclass(pg_catalog.format('%I.%I', t.schemaname, t.tablename))::oid AND d.deptype = 'e') ORDER BY t.tablename; -- [onpod] extension-owned tables excluded",`],
  ["export internals", `export function runEmptyProductionDatabaseBootstrap({`, `// [ONPOD PATCH] internals re-exported for scripts/onpod-apply-schema.mjs
export { assertBootstrapContractUnchanged, generateCurrentSchemaDdl, psql as bootstrapPsql, runDrizzleFreshProvision };

export function runEmptyProductionDatabaseBootstrap({`],
]);
