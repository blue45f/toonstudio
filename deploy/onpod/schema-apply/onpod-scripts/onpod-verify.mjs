#!/usr/bin/env node
// Read-only verification of the onpod toonstudio-db after `onpod-apply-schema.mjs execute`.
// Connection: libpq environment only (run through ../onpod-run.sh). Prints no connection values.
process.env.ONPOD_SINGLE_ROLE = "1";

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const RELEASE_SHA = "37b51837787ea67ee26b14358a1ac84664a7c584";
const MARKER_ID = "__managed_history_through_0019__";

const { loadMigrationManifest } = await import("./run-production-database-migrations.mjs");
const { loadHealthReadinessContract } = await import("./verify-production-database-capabilities.mjs");
const { HISTORICAL_BASELINE_RELATIONS, POST_BASELINE_RELATIONS } = await import("./run-production-database-migrations-relations.mjs");

function psql(sql) {
  const result = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-A", "-q", "-t", "-F", "\t"], {
    encoding: "utf8",
    input: sql,
    env: { ...process.env, PSQLRC: "/dev/null", PGSSLMODE: "require", PGCHANNELBINDING: "require" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`psql failed: ${(result.stderr || result.stdout || "").trim().slice(0, 2000)}`);
  return (result.stdout || "").trim();
}
const rows = (sql) => {
  const output = psql(sql);
  return output ? output.split(/\r?\n/u).map((line) => line.split("\t")) : [];
};
const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok });
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -- ${detail}` : ""}\n`);
}
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

// ---- 1. migration ledger (toonspectrum_ops.deployment_migration) ------------------------------------------------------
const manifest = loadMigrationManifest();
const ledgerRows = rows(
  `SELECT "id", "checksum", "state", "provenance", "releaseSha", ("appliedAt" IS NOT NULL) FROM toonspectrum_ops.deployment_migration ORDER BY "id";`,
);
const ledger = new Map(ledgerRows.map(([id, checksum, state, provenance, releaseSha, hasApplied]) => [id, { checksum, state, provenance, releaseSha, hasApplied }]));
const expectedProvenance = (m) => (m.sequence <= 19 ? "adopted" : m.id === "0023_production_migration_ledger" ? "bootstrap" : "executed");
const ledgerProblems = [];
for (const m of manifest) {
  const row = ledger.get(m.id);
  if (!row) ledgerProblems.push(`${m.id}: missing`);
  else if (row.checksum !== m.checksum) ledgerProblems.push(`${m.id}: checksum drift`);
  else if (row.state !== "applied") ledgerProblems.push(`${m.id}: state=${row.state}`);
  else if (row.provenance !== expectedProvenance(m)) ledgerProblems.push(`${m.id}: provenance=${row.provenance}`);
  else if (row.releaseSha !== RELEASE_SHA) ledgerProblems.push(`${m.id}: releaseSha mismatch`);
  else if (row.hasApplied !== "t") ledgerProblems.push(`${m.id}: appliedAt missing`);
}
const markerChecksum = sha256(manifest.filter((m) => m.sequence <= 19).map((m) => `${m.id}:${m.checksum}\n`).join(""));
const marker = ledger.get(MARKER_ID);
check("ledger: 113 manifest migrations recorded with exact SHA-256 checksum / state=applied / expected provenance", ledgerProblems.length === 0 && manifest.length === 113, ledgerProblems.slice(0, 5).join("; ") || `${manifest.length} rows`);
check("ledger: adoption marker present with reviewed checksum", marker?.checksum === markerChecksum && marker?.state === "applied" && marker?.provenance === "adopted");
check("ledger: total rows = 113 + marker", ledger.size === 114, `rows=${ledger.size}`);
const provenanceCounts = Object.fromEntries([...new Set([...ledger.values()].map((r) => `${r.state}/${r.provenance}`))].sort().map((key) => [key, [...ledger.values()].filter((r) => `${r.state}/${r.provenance}` === key).length]));
process.stdout.write(`      ledger breakdown: ${JSON.stringify(provenanceCounts)}\n`);
check("durable runner lock released (deployment_migration_lock empty)", psql(`SELECT count(*) FROM toonspectrum_ops.deployment_migration_lock;`) === "0");

// ---- 2. legacy cutover markers + readiness relation contract --------------------------------------------------------------
const readiness = loadHealthReadinessContract();
const markers = new Set(rows(`SELECT "id" FROM public.toonspectrum_schema_migration;`).map(([id]) => id));
const missingMarkers = readiness.migrationIds.filter((id) => !markers.has(id));
check(`readiness: ${readiness.migrationIds.length} required cutover markers in public.toonspectrum_schema_migration`, missingMarkers.length === 0, missingMarkers.join(",") || `total markers=${markers.size}`);

const present = new Set(rows(`SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p');`).map(([n]) => n));
const requiredRelations = readiness.relationNames;
const missingRelations = requiredRelations.filter((name) => !present.has(name));
check(`readiness: ${requiredRelations.length} required relations (tables) present in public`, requiredRelations.length === 223 && missingRelations.length === 0, missingRelations.join(",") || `required=${requiredRelations.length}`);
const classified = new Set([...HISTORICAL_BASELINE_RELATIONS, ...POST_BASELINE_RELATIONS]);
check("readiness relation list == runner classification (through-0019 + post-baseline)", classified.size === requiredRelations.length && requiredRelations.every((n) => classified.has(n)), `classified=${classified.size}`);
const extraTables = [...present].filter((name) => !requiredRelations.includes(name)).sort();
process.stdout.write(`      tables in public not in readiness list (${extraTables.length}): ${extraTables.join(", ") || "-"}\n`);
process.stdout.write(`      total tables in public (non-extension) = ${present.size}\n`);

// ---- 3. extensions ------------------------------------------------------------------------------------------------------
check("extension pg_trgm installed", rows(`SELECT extname FROM pg_catalog.pg_extension WHERE extname = 'pg_trgm';`).length === 1,
  rows(`SELECT n.nspname FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm';`).map(([s]) => `schema=${s}`).join(""));

// ---- 4. catalog health ----------------------------------------------------------------------------------------------------
const invalidIndexes = rows(`SELECT c.relname FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('public','toonspectrum_ops') AND (NOT i.indisvalid OR NOT i.indisready);`);
check("no invalid / not-ready indexes", invalidIndexes.length === 0, invalidIndexes.map((r) => r[0]).join(","));
const unvalidated = rows(`SELECT conrelid::regclass::text || '.' || conname FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace WHERE n.nspname IN ('public','toonspectrum_ops') AND NOT c.convalidated;`);
check("no NOT VALID constraints", unvalidated.length === 0, unvalidated.map((r) => r[0]).slice(0, 8).join(","));
const disabledTriggers = rows(`SELECT tgrelid::regclass::text || '.' || tgname FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'O' AND tgrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('public','toonspectrum_ops'));`);
check("no disabled triggers", disabledTriggers.length === 0, disabledTriggers.map((r) => r[0]).slice(0, 8).join(","));
const strayCatalogFunctions = rows(`SELECT p.proname FROM pg_catalog.pg_proc p WHERE p.pronamespace = 'pg_catalog'::regnamespace AND p.proname LIKE 'studio\\_review%';`);
check("no application function leaked into pg_catalog", strayCatalogFunctions.length === 0, strayCatalogFunctions.map((r) => r[0]).join(","));

// ---- 5. inventory ---------------------------------------------------------------------------------------------------------
const inventory = rows(`
  SELECT 'tables(public)', count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
  UNION ALL SELECT 'tables(toonspectrum_ops)', count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='toonspectrum_ops' AND c.relkind IN ('r','p')
  UNION ALL SELECT 'views/matviews', count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','toonspectrum_ops') AND c.relkind IN ('v','m') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
  UNION ALL SELECT 'sequences', count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','toonspectrum_ops') AND c.relkind='S'
  UNION ALL SELECT 'indexes', count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','toonspectrum_ops') AND c.relkind IN ('i','I') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
  UNION ALL SELECT 'constraints', count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN ('public','toonspectrum_ops')
  UNION ALL SELECT 'triggers(non-internal)', count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','toonspectrum_ops')
  UNION ALL SELECT 'functions(app)', count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','toonspectrum_ops') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
  UNION ALL SELECT 'policies', count(*) FROM pg_policy
  UNION ALL SELECT 'rls-enabled tables', count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relrowsecurity
  UNION ALL SELECT 'ledger rows', count(*) FROM toonspectrum_ops.deployment_migration
  UNION ALL SELECT 'legacy cutover markers', count(*) FROM public.toonspectrum_schema_migration;`);
process.stdout.write(`      inventory: ${inventory.map(([k, v]) => `${k}=${v}`).join(", ")}\n`);

const failed = checks.filter((c) => !c.ok);
process.stdout.write(`\nSUMMARY: ${checks.length - failed.length}/${checks.length} checks passed\n`);
process.exitCode = failed.length === 0 ? 0 : 1;
