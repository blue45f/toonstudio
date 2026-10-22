// Replays the Core API's real schema-readiness probe (apps/api/src/modules/health/health-readiness.repository.ts at the
// pinned commit) against the onpod database, and prints every capability flag it computes.
// Connection: PG* environment (node-postgres reads PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT); TLS = encrypted, not verified.
// Usage (through ../onpod-run.sh):  node node_modules/tsx/dist/cli.mjs scripts/onpod-readiness-replay.mjs [--as-owner-runtime-acl]
//   --as-owner-runtime-acl[=marketplace|all] : inside ONE transaction that is always ROLLED BACK, first apply the official runtime-ACL builders with the
//                            migration role standing in for the runtime role, then run the probe. Proves what a single-role setup needs.
// This file is plain JavaScript on purpose: it only runs inside the workspace that rebuild.sh creates (it imports the pinned-commit sources by
// relative path), so the repository's own `tsc -p tsconfig.json` must not try to resolve those imports. tsx runs it and resolves the TypeScript imports.
import pg from "pg";

process.env.DATABASE_URL ||= "postgresql://unused:unused@127.0.0.1:1/unused?sslmode=disable"; // module-level default pool; never used here

const { PostgresHealthReadinessRepository, REQUIRED_DATABASE_RELATIONS, REQUIRED_DATABASE_MIGRATIONS } = await import(
  "../apps/api/src/modules/health/health-readiness.repository"
);

const aclArgument = process.argv.find((argument) => argument.startsWith("--as-owner-runtime-acl"));
const asOwnerRuntimeAcl = Boolean(aclArgument);
const aclScope = aclArgument?.split("=")[1] ?? "all"; // "marketplace" | "all"
const pool = new pg.Pool({ max: 1, ssl: { rejectUnauthorized: false }, allowExitOnIdle: true, connectionTimeoutMillis: 15_000 });

/** @type {Record<string, unknown> | undefined} */
let catalog;
// 준비성 점검이 만드는 카탈로그 질의("relationNames" 포함)의 첫 행을 기록한다. 이 행이 26개 플래그를 담는다.
function capture(config, result) {
  const text = typeof config === "string" ? config : (config?.text ?? "");
  if (text.includes('"relationNames"')) catalog = result.rows[0];
}
const recorder = {
  async query(config, values) {
    const result = await pool.query(config, values);
    capture(config, result);
    return result;
  },
};

async function runProbe(label, queryable) {
  catalog = undefined;
  const repository = new PostgresHealthReadinessRepository(queryable);
  const reachable = await repository.isDatabaseReachable();
  const schemaReady = await repository.isSchemaReady();
  const state = catalog;
  const relationNames = state?.relationNames ?? [];
  console.log(`\n=== ${label}`);
  console.log(`isDatabaseReachable=${reachable}  isSchemaReady=${schemaReady}  (required relations=${REQUIRED_DATABASE_RELATIONS.length}, found=${relationNames.length}, required cutover markers=${REQUIRED_DATABASE_MIGRATIONS.length})`);
  const failing = [];
  for (const [key, value] of Object.entries(state ?? {})) {
    if (key === "relationNames") continue;
    if (value !== true) failing.push(key);
  }
  console.log(`capability flags: ${Object.keys(state ?? {}).length - 1} total, ${failing.length} not true`);
  for (const key of failing) console.log(`  FAIL ${key}`);
  return { schemaReady, failing };
}

try {
  if (!asOwnerRuntimeAcl) {
    await runProbe("readiness probe as the migration/owner role (as deployed)", recorder);
  } else {
    // Build the runtime-ACL SQL with the migration role's own name (read in-process, never printed).
    const { rows } = await pool.query("SELECT current_user AS name");
    const role = rows[0].name;
    const aclModule = await import("./run-production-database-migrations.mjs");
    const all = [
      aclModule.buildAuthRuntimeAclSql, aclModule.buildTrafficAnalyticsRuntimeAclSql, aclModule.buildCreatorRoleWorkspaceRuntimeAclSql,
      aclModule.buildPersonalCloudRuntimeAclSql, aclModule.buildCommunityCommentRuntimeAclSql, aclModule.buildMessagingRuntimeAclSql,
      aclModule.buildRuntimeCutoverLedgerAclSql, aclModule.buildMembershipRuntimeAclSql, aclModule.buildStudioProductionRuntimeAclSql,
      aclModule.buildStudioProjectGraphRuntimeAclSql, aclModule.buildCreatorMarketplaceRuntimeAclSql, aclModule.buildCreatorAssetObjectStorageRuntimeAclSql,
    ];
    const builders = aclScope === "marketplace" ? [aclModule.buildCreatorMarketplaceRuntimeAclSql] : all;
    const sql = builders.map((build) => build(role)).join("\n");
    console.log(`applying ${builders.length} official runtime-ACL builder(s) with the owner role standing in for the runtime role (scope=${aclScope}), ${sql.length} chars of SQL`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (/^[ \t]*((BEGIN|COMMIT|ROLLBACK)[ \t]*;|START[ \t]+TRANSACTION\b|SET[ \t]+(LOCAL[ \t]+)?ROLE\b)/imu.test(sql)) throw new Error("ACL builder contains transaction control; refusing");
      await client.query(sql); // simple-query protocol: multi-statement string, dollar-quoted blocks stay intact
      const inTransaction = { async query(config, values) {
        const result = await client.query(config, values);
        capture(config, result);
        return result;
      } };
      await runProbe("readiness probe with runtime-ACL builders applied to the owner role (transaction, rolled back)", inTransaction);
    } finally {
      await client.query("ROLLBACK");
      client.release();
      console.log("\n(transaction rolled back; database unchanged)");
    }
  }
} finally {
  await pool.end();
}
