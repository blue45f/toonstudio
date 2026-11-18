/** 기존 앱 연결로 공개 가능한 메타데이터만 읽는다. migration 실행·TLS 승인 증거로 사용하지 않는다. */
export const ONPOD_ADMIN_DB_AUDIT_PREFIX = "TOONSTUDIO_ADMIN_DB_AUDIT_JSON:";

const COLUMNS = Object.freeze({
  admin_workspace: "id revision payload payload_digest updated_by updated_at operations_revision operations_updated_at business_revision business_updated_at business_owner_user_id",
  admin_workspace_audit: "board_id revision actor_user_id action before_digest after_digest occurred_at scope scope_revision",
  admin_workspace_receipt: "board_id actor_user_id mutation_id request_digest accepted_revision accepted_at scope accepted_scope_revision",
  admin_workspace_business_grant: "board_id user_id can_write can_export granted_by updated_at revoked_at",
  admin_workspace_access_audit: "id board_id actor_user_id subject_user_id action mutation_id request_digest can_write can_export occurred_at",
  admin_business_plan: "id revision payload updated_at owner_user_id",
  admin_business_plan_revision: "revision payload created_at",
  admin_business_plan_audit: "revision actor_user_id before_digest after_digest occurred_at",
  admin_business_plan_receipt: "actor_user_id mutation_id request_digest accepted_revision created_at",
  admin_business_plan_grant: "user_id can_write can_export granted_by updated_at revoked_at",
  admin_business_plan_access_audit: "id actor_user_id action subject_user_id mutation_id request_digest can_write can_export occurred_at",
  admin_nestjs_quality_board: "repository revision document updated_by updated_at",
  admin_nestjs_quality_history: "repository revision actor_id mutation_id request_digest reason changed_task_ids snapshot_changed before_document after_document created_at",
  admin_cloud_workboard: "owner_user_id board_id revision payload stored_at",
  admin_cloud_workboard_audit: "owner_user_id board_id revision actor_user_id mutation_id before_digest after_digest task_count occurred_at",
  admin_cloud_workboard_receipt: "owner_user_id board_id mutation_id request_digest accepted_revision",
  admin_ai_operations_board: "id revision payload updated_at",
  admin_ai_operations_audit: "revision actor_user_id before_digest after_digest occurred_at",
  admin_ai_operations_receipt: "actor_user_id mutation_id request_digest accepted_revision",
});
export const ADMIN_BOARD_RELATIONS = Object.freeze(Object.keys(COLUMNS));

const CONSTRAINTS = Object.freeze({
  admin_workspace: "admin_workspace_state_check admin_workspace_operations_scope_check admin_workspace_business_scope_check",
  admin_workspace_audit: "admin_workspace_audit_before_check admin_workspace_audit_scope_check",
  admin_workspace_receipt: "admin_workspace_receipt_scope_check",
  admin_workspace_business_grant: "admin_workspace_grant_revoked_check",
  admin_workspace_access_audit: "admin_workspace_access_event_check",
  admin_business_plan: "admin_business_plan_singleton_check admin_business_plan_revision_check admin_business_plan_state_check",
  admin_business_plan_revision: "admin_business_plan_snapshot_revision_check admin_business_plan_snapshot_payload_check",
  admin_business_plan_audit: "admin_business_plan_audit_before_digest_check admin_business_plan_audit_after_digest_check",
  admin_business_plan_receipt: "admin_business_plan_receipt_digest_check",
  admin_business_plan_grant: "admin_business_plan_grant_revoked_check",
  admin_business_plan_access_audit: "admin_business_plan_access_audit_request_unique admin_business_plan_access_audit_shape_check",
  admin_nestjs_quality_board: "admin_nestjs_quality_board_document_check",
  admin_nestjs_quality_history: "admin_nestjs_quality_history_mutation_unique admin_nestjs_quality_history_before_check admin_nestjs_quality_history_after_check",
  admin_cloud_workboard: "admin_cloud_workboard_id_check admin_cloud_workboard_revision_check admin_cloud_workboard_payload_check admin_cloud_workboard_time_check",
  admin_cloud_workboard_audit: "admin_cloud_workboard_audit_actor_check admin_cloud_workboard_audit_revision_check admin_cloud_workboard_audit_before_check admin_cloud_workboard_audit_after_check admin_cloud_workboard_audit_count_check",
  admin_cloud_workboard_receipt: "admin_cloud_workboard_receipt_digest_check",
  admin_ai_operations_board: "admin_ai_operations_board_singleton admin_ai_operations_board_revision admin_ai_operations_board_state admin_ai_operations_board_payload",
  admin_ai_operations_audit: "admin_ai_operations_audit_revision admin_ai_operations_audit_before admin_ai_operations_audit_after",
  admin_ai_operations_receipt: "admin_ai_operations_receipt_digest_check",
});
const TRIGGERS = Object.freeze({
  admin_business_plan: "admin_business_plan_delete_guard admin_business_plan_truncate_guard",
  admin_business_plan_revision: "admin_business_plan_revision_immutable admin_business_plan_revision_truncate_guard",
  admin_business_plan_audit: "admin_business_plan_audit_immutable admin_business_plan_audit_truncate_guard",
  admin_business_plan_receipt: "admin_business_plan_receipt_immutable admin_business_plan_receipt_truncate_guard",
  admin_business_plan_access_audit: "admin_business_plan_access_audit_immutable admin_business_plan_access_audit_truncate_guard",
  admin_nestjs_quality_history: "admin_nestjs_quality_history_immutable",
});
export const ADMIN_BOARD_AUDIT_NAMES = Object.freeze({ columns: COLUMNS, constraints: CONSTRAINTS, triggers: TRIGGERS });

function auditConfiguration({ expectedMigrations, expectedRelations } = {}) {
  if (!Array.isArray(expectedMigrations) || expectedMigrations.length < 1 || expectedMigrations.length > 512) {
    throw new Error("진단에는 정본 migration 목록 1~512개가 필요합니다.");
  }
  const migrations = expectedMigrations.map((entry, index) => {
    if (!entry || !/^\d{4}_[a-z0-9_]{1,110}$/u.test(entry.id)
      || Number(entry.id.slice(0, 4)) !== index + 1 || !/^[a-f0-9]{64}$/u.test(entry.checksum)) {
      throw new Error("정본 migration 번호·순서·체크섬이 올바르지 않습니다.");
    }
    return { id: entry.id, checksum: entry.checksum };
  });
  if (!Array.isArray(expectedRelations) || expectedRelations.length < 1
    || expectedRelations.length > ADMIN_BOARD_RELATIONS.length
    || new Set(expectedRelations).size !== expectedRelations.length
    || expectedRelations.some((name) => !ADMIN_BOARD_RELATIONS.includes(name))) {
    throw new Error("진단 대상은 정해진 관리자 보드 표만 허용합니다.");
  }
  return {
    expectedMigrations: migrations, expectedRelations: [...expectedRelations],
    columns: COLUMNS, constraints: CONSTRAINTS, triggers: TRIGGERS,
  };
}

// 이 함수는 문자열로 직렬화하므로 외부 바인딩·사용자 SQL·외부 파일을 참조하지 않는다.
async function collectAudit(config, runtime) {
  const markerId = "__managed_history_through_0019__";
  const expectedHost = "toonstudio-db.db.onpod.local";
  const hashPattern = /^[a-f0-9]{64}$/u;
  const shaPattern = /^[a-f0-9]{40}$/u;
  const bool = (value) => typeof value === "boolean" ? value : null;
  const count = (value) => {
    if (typeof value !== "number" && (typeof value !== "string" || !/^\d{1,15}$/u.test(value))) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  };
  const date = (value) => {
    if (!(value instanceof Date) && (typeof value !== "string" || value.length > 80)) return null;
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) && parsed.getUTCFullYear() >= 2000 && parsed.getUTCFullYear() <= 2200
      ? parsed.toISOString() : null;
  };
  const names = (source) => source ? source.split(" ") : [];
  const report = {
    schemaVersion: 1, mode: "read-only", status: "error", reason: null,
    runtime: { imageSha: null },
    database: { hostMatched: false, readOnly: null, rolledBack: false, connectionClosed: false, tls: null, role: null },
    migrations: {
      ledgerExists: null, entries: [], unknownRowsCount: null, truncated: false, integrity: "unknown", orderValid: null,
      comparisons: config.expectedMigrations.map(({ id }) => ({ id, status: "unknown" })),
    },
    durableLockCount: null, catalog: [], ownership: [],
  };
  const safeErrors = new WeakSet();
  const failure = (reason) => { const error = new Error(); error.auditReason = reason; safeErrors.add(error); return error; };
  let client; let connected = false; let transaction = false; let timedOut = false; let clientFault = false; let deadline;
  const timer = runtime.setTimeout ?? setTimeout;
  const clearTimer = runtime.clearTimeout ?? clearTimeout;
  const query = async (sql, parameters = []) => {
    if (timedOut) throw failure("AUDIT_TIMEOUT");
    if (clientFault && sql !== "ROLLBACK") throw failure("DATABASE_QUERY_FAILED");
    if (!/^(?:SELECT\b|BEGIN READ ONLY$|SET LOCAL (?:statement_timeout|lock_timeout|idle_in_transaction_session_timeout) = '\d+s'$|ROLLBACK$)/u.test(sql)) {
      throw failure("UNSAFE_QUERY_REJECTED");
    }
    return client.query({ text: sql, values: parameters, query_timeout: 6000 });
  };
  function tlsMetadata(parsed) {
    const socket = client.connection?.stream;
    const enabled = socket?.encrypted === true;
    let peer; let protocol;
    try { peer = enabled ? socket.getPeerCertificate() : null; protocol = enabled ? socket.getProtocol() : null; } catch { peer = null; }
    let fingerprint = null; let hostnameMatches = null;
    if (peer?.raw) {
      try { fingerprint = runtime.createHash("sha256").update(peer.raw).digest("hex"); } catch { fingerprint = null; }
      try { hostnameMatches = runtime.checkServerIdentity(expectedHost, peer) === undefined; } catch { hostnameMatches = false; }
    }
    const knownModes = ["disable", "allow", "prefer", "require", "verify-ca", "verify-full", "no-verify"];
    const mode = parsed.searchParams.get("sslmode");
    return {
      enabled, authorized: bool(socket?.authorized), protocol: ["TLSv1", "TLSv1.1", "TLSv1.2", "TLSv1.3"].includes(protocol) ? protocol : null,
      peerFingerprintSha256: typeof fingerprint === "string" && hashPattern.test(fingerprint) ? fingerprint : null,
      validFrom: date(peer?.valid_from), validTo: date(peer?.valid_to), hostnameMatches,
      configuredMode: mode === null ? "default" : knownModes.includes(mode) ? mode : "unknown",
      channelBindingEnforced: false, migrationTransportVerified: false,
      limitation: "EXISTING_RUNTIME_CONNECTION_ONLY_NOT_MIGRATION_TLS_PROOF",
    };
  }
  async function readLedger() {
    const found = (await query("SELECT /*audit:ledger-presence*/ to_regclass('toonspectrum_ops.deployment_migration') IS NOT NULL AS ledger_exists, to_regclass('toonspectrum_ops.deployment_migration_lock') IS NOT NULL AS lock_exists")).rows[0];
    report.migrations.ledgerExists = bool(found?.ledger_exists);
    if (found?.lock_exists === true) {
      report.durableLockCount = count((await query("SELECT /*audit:lock-count*/ count(*)::text AS count FROM toonspectrum_ops.deployment_migration_lock")).rows[0]?.count);
    }
    if (found?.ledger_exists !== true) return;
    const knownIds = [...config.expectedMigrations.map(({ id }) => id), markerId];
    const totals = (await query("SELECT /*audit:ledger-count*/ count(*)::text AS total, count(*) FILTER (WHERE NOT (id = ANY($1::text[])))::text AS unknown FROM toonspectrum_ops.deployment_migration", [knownIds])).rows[0];
    const total = count(totals?.total); const unknown = count(totals?.unknown);
    report.migrations.unknownRowsCount = unknown;
    if (total === null || unknown === null || total > knownIds.length || unknown > 0) {
      report.migrations.truncated = total !== null && total > knownIds.length;
      report.migrations.integrity = "blocked";
    }
    const rawRows = (await query('SELECT /*audit:ledger-rows*/ "id", "checksum", "state", "provenance", "releaseSha", "startedAt", "appliedAt", "updatedAt" FROM toonspectrum_ops.deployment_migration WHERE id = ANY($1::text[]) ORDER BY id LIMIT $2', [knownIds, knownIds.length + 1])).rows;
    if (!Array.isArray(rawRows) || rawRows.length > knownIds.length) throw failure("LEDGER_BOUNDS_EXCEEDED");
    const entries = new Map(); let malformed = false;
    for (const row of rawRows) {
      if (!knownIds.includes(row?.id) || entries.has(row.id)) { malformed = true; continue; }
      const safe = {
        id: row.id, checksum: typeof row.checksum === "string" && hashPattern.test(row.checksum) ? row.checksum : null,
        state: ["applied", "applying", "failed"].includes(row.state) ? row.state : "unknown",
        provenance: ["adopted", "bootstrap", "executed"].includes(row.provenance) ? row.provenance : "unknown",
        releaseSha: typeof row.releaseSha === "string" && shaPattern.test(row.releaseSha) ? row.releaseSha : null,
        startedAt: date(row.startedAt), appliedAt: date(row.appliedAt), updatedAt: date(row.updatedAt),
      };
      entries.set(safe.id, safe);
    }
    report.migrations.entries = [...entries.values()];
    const markerChecksum = runtime.createHash("sha256").update(config.expectedMigrations.filter(({ id }) => Number(id.slice(0, 4)) <= 19).map(({ id, checksum }) => `${id}:${checksum}\n`).join("")).digest("hex");
    const marker = entries.get(markerId);
    const markerValid = marker?.checksum === markerChecksum && marker.state === "applied"
      && marker.provenance === "adopted" && marker.releaseSha !== null && marker.appliedAt !== null;
    const complete = !malformed && total !== null && unknown === 0 && total === entries.size && !report.migrations.truncated;
    report.migrations.comparisons = config.expectedMigrations.map(({ id, checksum }) => {
      const row = entries.get(id); let status;
      const provenance = Number(id.slice(0, 4)) <= 19 ? "adopted" : id === "0023_production_migration_ledger" ? "bootstrap" : "executed";
      if (!row) status = complete && markerValid && Number(id.slice(0, 4)) > 19 ? "pending" : "unknown";
      else if (row.checksum === null) status = "incomplete";
      else if (row.checksum !== checksum) status = "checksum-drift";
      else status = row.state === "applied" && row.provenance === provenance && row.releaseSha !== null && row.appliedAt !== null ? "applied" : "incomplete";
      return { id, status };
    });
    let sawUnapplied = false;
    report.migrations.orderValid = complete && markerValid ? report.migrations.comparisons.every(({ status }) => {
      if (status !== "applied") { sawUnapplied = true; return true; }
      return !sawUnapplied;
    }) : null;
    report.migrations.integrity = complete && markerValid && report.migrations.orderValid === true
      && report.migrations.comparisons.every(({ status }) => status === "applied" || status === "pending") ? "verified" : "blocked";
  }
  async function readCatalog() {
    const relations = config.expectedRelations;
    const inventory = (await query(`SELECT /*audit:relations*/ c.relname AS name, c.relkind::text AS kind,
      c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls, c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS owned,
      has_table_privilege(current_user,c.oid,'SELECT') AS can_select, has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,
      has_table_privilege(current_user,c.oid,'UPDATE') AS can_update, has_table_privilege(current_user,c.oid,'DELETE') AS can_delete,
      has_table_privilege(current_user,c.oid,'TRUNCATE') AS can_truncate,
      (SELECT count(*)::text FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0) AS public_grants,
      (SELECT count(*)::text FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee NOT IN (0,c.relowner)) AS other_grants,
      (SELECT count(*)::text FROM pg_policy p WHERE p.polrelid=c.oid) AS policies,
      (SELECT count(*)::text FROM pg_policy p WHERE p.polrelid=c.oid AND 0=ANY(p.polroles)) AS public_policies
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname LIMIT 2049`, [relations])).rows;
    const allColumns = [...new Set(relations.flatMap((name) => names(config.columns[name])))];
    const columns = (await query(`SELECT /*audit:columns*/ c.relname AS relation,
      CASE WHEN a.attname=ANY($2::text[]) THEN a.attname ELSE NULL END AS name,
      format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS not_null, a.atthasdef AS has_default,
      (SELECT count(*)::text FROM aclexplode(a.attacl) acl WHERE acl.grantee=0) AS public_grants,
      (SELECT count(*)::text FROM aclexplode(a.attacl) acl WHERE acl.grantee NOT IN (0,c.relowner)) AS other_grants
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum LIMIT 2049`, [relations, allColumns])).rows;
    const knownConstraints = relations.flatMap((name) => names(config.constraints[name]));
    const constraints = (await query(`SELECT /*audit:constraints*/ t.relname AS relation,
      CASE WHEN c.conname=ANY($2::text[]) THEN c.conname ELSE NULL END AS name,
      c.contype::text AS type, c.convalidated AS validated
      FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname=ANY($1::text[]) ORDER BY t.relname,c.conname LIMIT 2049`, [relations, knownConstraints])).rows;
    const knownTriggers = relations.flatMap((name) => names(config.triggers[name]));
    const triggers = (await query(`SELECT /*audit:triggers*/ c.relname AS relation,
      CASE WHEN t.tgname=ANY($2::text[]) THEN t.tgname ELSE NULL END AS name, t.tgenabled::text AS enabled,
      t.tgfoid=CASE WHEN c.relname='admin_nestjs_quality_history' THEN to_regprocedure('public.admin_nestjs_quality_history_immutable()')
        ELSE to_regprocedure('public.admin_business_plan_immutable_guard()') END AS expected_function
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND NOT t.tgisinternal ORDER BY c.relname,t.tgname LIMIT 2049`, [relations, knownTriggers])).rows;
    if ([inventory, columns, constraints, triggers].some((rows) => !Array.isArray(rows) || rows.length > 2048)) throw failure("CATALOG_BOUNDS_EXCEEDED");
    const allowedTypes = ["text", "integer", "bigint", "jsonb", "uuid", "boolean", "timestamp with time zone", "timestamp without time zone"];
    report.catalog = relations.map((name) => {
      const row = inventory.find((entry) => entry.name === name);
      if (!row) return { name, present: false };
      const fields = columns.filter((entry) => entry.relation === name);
      const checks = constraints.filter((entry) => entry.relation === name);
      const guards = triggers.filter((entry) => entry.relation === name);
      return {
        name, present: true, kind: ["r", "p"].includes(row.kind) ? row.kind : "unknown",
        rls: bool(row.rls), forceRls: bool(row.force_rls), ownedByCurrentRole: bool(row.owned),
        effectivePrivileges: Object.fromEntries(["select", "insert", "update", "delete", "truncate"].map((key) => [key, bool(row[`can_${key}`])])),
        publicGrantCount: count(row.public_grants), otherRoleGrantCount: count(row.other_grants),
        policyCount: count(row.policies), publicPolicyCount: count(row.public_policies),
        columns: names(config.columns[name]).map((columnName) => {
          const column = fields.find((entry) => entry.name === columnName);
          return column ? { name: columnName, present: true, type: allowedTypes.includes(column.type) ? column.type : "unknown",
            notNull: bool(column.not_null), hasDefault: bool(column.has_default), publicGrantCount: count(column.public_grants), otherRoleGrantCount: count(column.other_grants) }
            : { name: columnName, present: false };
        }),
        unknownColumnCount: fields.filter((entry) => !names(config.columns[name]).includes(entry.name)).length,
        constraints: {
          count: checks.length, unvalidatedCount: checks.filter((entry) => entry.validated !== true).length,
          typeCounts: Object.fromEntries(["c", "p", "f", "u", "x"].map((type) => [type, checks.filter((entry) => entry.type === type).length])),
          required: names(config.constraints[name]).map((constraintName) => ({ name: constraintName,
            present: checks.some((entry) => entry.name === constraintName), validated: bool(checks.find((entry) => entry.name === constraintName)?.validated) })),
        },
        triggers: {
          count: guards.length, unknownCount: guards.filter((entry) => !names(config.triggers[name]).includes(entry.name)).length,
          required: names(config.triggers[name]).map((triggerName) => {
            const guard = guards.find((entry) => entry.name === triggerName);
            return { name: triggerName, present: Boolean(guard), enabled: guard && ["O", "D", "R", "A"].includes(guard.enabled) ? guard.enabled : null,
              expectedFunction: bool(guard?.expected_function) };
          }),
        },
      };
    });
  }
  async function readOwnership() {
    // 표·열 이름은 고정 SQL만 사용하며 원문·ID·메일·권한 대상은 반환하지 않는다.
    const plans = [
      ["admin_workspace", "business_owner_user_id", "SELECT /*audit:workspace-ownership*/ count(*)::text AS rows, count(*) FILTER (WHERE business_owner_user_id IS NOT NULL)::text AS owners, count(*) FILTER (WHERE payload IS NOT NULL)::text AS data_rows FROM public.admin_workspace"],
      ["admin_business_plan", "owner_user_id", "SELECT /*audit:business-ownership*/ count(*)::text AS rows, count(*) FILTER (WHERE owner_user_id IS NOT NULL)::text AS owners, count(*) FILTER (WHERE payload IS NOT NULL)::text AS data_rows FROM public.admin_business_plan"],
      ["admin_cloud_workboard", "owner_user_id", "SELECT /*audit:cloud-ownership*/ count(*)::text AS rows, count(DISTINCT owner_user_id)::text AS owners, count(*) FILTER (WHERE revision>0)::text AS data_rows FROM public.admin_cloud_workboard"],
    ];
    for (const [name, ownerColumn, sql] of plans) {
      const table = report.catalog.find((entry) => entry.name === name);
      if (!table?.present) {
        report.ownership.push({ name, status: "unknown", rowCount: null, ownerCount: null, dataRowCount: null });
        continue;
      }
      const ownerPresent = table.columns.some((entry) => entry.name === ownerColumn && entry.present);
      let selectedSql = sql;
      if (!ownerPresent) {
        if (name === "admin_workspace") selectedSql = "SELECT /*audit:workspace-ownership-legacy*/ count(*)::text AS rows, NULL::text AS owners, count(*) FILTER (WHERE payload IS NOT NULL)::text AS data_rows FROM public.admin_workspace";
        else if (name === "admin_business_plan") selectedSql = "SELECT /*audit:business-ownership-legacy*/ count(*)::text AS rows, NULL::text AS owners, count(*) FILTER (WHERE payload IS NOT NULL)::text AS data_rows FROM public.admin_business_plan";
        else {
          report.ownership.push({ name, status: "unknown", rowCount: null, ownerCount: null, dataRowCount: null });
          continue;
        }
      }
      const row = (await query(selectedSql)).rows[0];
      const rowCount = count(row?.rows); const ownerCount = count(row?.owners); const dataRowCount = count(row?.data_rows);
      report.ownership.push({ name, status: [rowCount, ownerCount, dataRowCount].includes(null) ? "unknown" : "observed", rowCount, ownerCount, dataRowCount });
    }
    for (const name of ["admin_workspace_business_grant", "admin_business_plan_grant"]) {
      const table = report.catalog.find((entry) => entry.name === name);
      if (!table?.present || !table.columns.some((entry) => entry.name === "revoked_at" && entry.present)) continue;
      const sql = name === "admin_workspace_business_grant"
        ? "SELECT /*audit:workspace-grants*/ count(*)::text AS rows, count(*) FILTER (WHERE revoked_at IS NULL)::text AS active FROM public.admin_workspace_business_grant"
        : "SELECT /*audit:business-grants*/ count(*)::text AS rows, count(*) FILTER (WHERE revoked_at IS NULL)::text AS active FROM public.admin_business_plan_grant";
      const row = (await query(sql)).rows[0];
      report.ownership.push({ name, status: "observed", rowCount: count(row?.rows), activeGrantCount: count(row?.active) });
    }
  }
  async function perform() {
    try {
      const sha = runtime.readFileSync("/app/RELEASE_SHA", "utf8").trim();
      if (shaPattern.test(sha)) report.runtime.imageSha = sha;
    } catch { report.runtime.imageSha = null; }
    let parsed;
    try { parsed = new URL(runtime.env?.DATABASE_URL); } catch { throw failure("DATABASE_URL_UNAVAILABLE"); }
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || parsed.hostname !== expectedHost
      || (parsed.port && parsed.port !== "5432") || ["host", "hostaddr", "port", "service", "servicefile"].some((key) => parsed.searchParams.has(key))) {
      throw failure("DATABASE_HOST_MISMATCH");
    }
    report.database.hostMatched = true;
    let Client;
    try { Client = runtime.Client ?? runtime.createRequire("/app/apps/api/package.json")("pg").Client; } catch { throw failure("PG_MODULE_UNAVAILABLE"); }
    client = new Client({ connectionString: runtime.env.DATABASE_URL, application_name: "toonstudio-admin-readonly-audit", connectionTimeoutMillis: 5000, query_timeout: 6000 });
    client.on("error", () => { clientFault = true; });
    if (client.connectionParameters?.host !== expectedHost || Number(client.connectionParameters?.port) !== 5432) throw failure("DATABASE_HOST_UNVERIFIED");
    await client.connect(); connected = true;
    report.database.tls = tlsMetadata(parsed);
    await query("BEGIN READ ONLY"); transaction = true;
    await query("SET LOCAL statement_timeout = '5s'");
    await query("SET LOCAL lock_timeout = '2s'");
    await query("SET LOCAL idle_in_transaction_session_timeout = '8s'");
    const state = (await query(`SELECT /*audit:session*/ current_setting('transaction_read_only')='on' AS read_only,
      r.rolsuper AS superuser, r.rolcreatedb AS create_database, r.rolcreaterole AS create_role,
      r.rolreplication AS replication, r.rolbypassrls AS bypass_rls, r.rolcanlogin AS can_login,
      d.datdba=r.oid AS owns_database, current_user=session_user AS session_matches,
      (SELECT count(*)::text FROM pg_auth_members m WHERE m.member=r.oid) AS memberships
      FROM pg_roles r JOIN pg_database d ON d.datname=current_database() WHERE r.rolname=current_user`)).rows[0];
    report.database.readOnly = bool(state?.read_only);
    if (state?.read_only !== true) throw failure("READ_ONLY_TRANSACTION_UNVERIFIED");
    report.database.role = {
      superuser: bool(state.superuser), createDatabase: bool(state.create_database), createRole: bool(state.create_role),
      replication: bool(state.replication), bypassRls: bool(state.bypass_rls), canLogin: bool(state.can_login),
      ownsDatabase: bool(state.owns_database), sessionMatches: bool(state.session_matches), membershipCount: count(state.memberships),
      configuredMode: ["single-owner", "separated"].includes(runtime.env.DATABASE_RUNTIME_ROLE_MODE) ? runtime.env.DATABASE_RUNTIME_ROLE_MODE : "unknown",
    };
    await readLedger(); await readCatalog(); await readOwnership();
    if (clientFault) throw failure("DATABASE_QUERY_FAILED");
    report.status = "ok";
  }
  const endWithin = async (operation, milliseconds) => {
    let timeout;
    try { await Promise.race([operation(), new Promise((_, reject) => { timeout = timer(() => reject(failure("CLEANUP_TIMEOUT")), milliseconds); })]); }
    finally { clearTimer(timeout); }
  };
  try {
    await Promise.race([perform(), new Promise((_, reject) => {
      deadline = timer(() => { timedOut = true; reject(failure("AUDIT_TIMEOUT")); }, 25000);
    })]);
  } catch (error) {
    report.reason = safeErrors.has(error) ? error.auditReason : "DATABASE_QUERY_FAILED";
    report.status = ["DATABASE_HOST_MISMATCH", "DATABASE_HOST_UNVERIFIED", "READ_ONLY_TRANSACTION_UNVERIFIED"].includes(report.reason) ? "blocked" : "error";
  } finally {
    clearTimer(deadline);
    if (connected && transaction && !timedOut) {
      try { await endWithin(() => query("ROLLBACK"), 3000); report.database.rolledBack = true; }
      catch { report.status = "error"; report.reason = "ROLLBACK_UNCONFIRMED"; }
    }
    if (client) {
      try { await endWithin(() => client.end(), 2000); report.database.connectionClosed = true; }
      catch { report.status = "error"; report.reason = "CONNECTION_CLOSE_UNCONFIRMED"; }
    }
  }
  if (report.status === "ok" && (timedOut || clientFault)) {
    report.status = "error"; report.reason = timedOut ? "AUDIT_TIMEOUT" : "DATABASE_QUERY_FAILED";
  }
  if (report.status !== "ok") {
    report.migrations.comparisons = report.migrations.comparisons.map(({ id }) => ({ id, status: "unknown" }));
    report.migrations.integrity = "unknown";
    report.migrations.orderValid = null;
  }
  return report;
}

/** 주입한 fake client로 운영 연결 없이 동일한 진단 경계를 검증한다. */
export async function runOnpodAdminDbAudit(options, runtime) {
  return collectAudit(auditConfiguration(options), runtime);
}

export function buildOnpodAdminDbAuditPayload(options) {
  const config = auditConfiguration(options);
  return `"use strict";\n(async () => {\nconst report = await (${collectAudit.toString()})(${JSON.stringify(config)}, {
    env: process.env, createRequire: require("node:module").createRequire,
    readFileSync: require("node:fs").readFileSync, createHash: require("node:crypto").createHash,
    checkServerIdentity: require("node:tls").checkServerIdentity, setTimeout, clearTimeout
  });
  process.stdout.write(${JSON.stringify(ONPOD_ADMIN_DB_AUDIT_PREFIX)} + JSON.stringify(report) + "\\n");
  process.exitCode = report.status === "ok" ? 0 : 1;
})().catch(() => {
  process.stdout.write(${JSON.stringify(ONPOD_ADMIN_DB_AUDIT_PREFIX)} + JSON.stringify({schemaVersion:1,mode:"read-only",status:"error",reason:"AUDIT_PAYLOAD_FAILED"}) + "\\n");
  process.exitCode = 1;
});\n`;
}
