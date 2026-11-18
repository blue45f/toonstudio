const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import vm from "node:vm";

import {
  ADMIN_BOARD_AUDIT_NAMES, ADMIN_BOARD_RELATIONS, ONPOD_ADMIN_DB_AUDIT_PREFIX,
  buildOnpodAdminDbAuditPayload, runOnpodAdminDbAudit,
} from "./onpod-admin-db-audit-payload.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const imageSha = "a".repeat(40);
const timestamp = "2026-11-18T16:00:00.000Z";
const sensitive = "synthetic-private-value-do-not-print";
const connectionString = `postgresql://fixture:${sensitive}@toonstudio-db.db.onpod.local:5432/fixture?sslmode=no-verify`;
const migrations = Array.from({ length: 24 }, (_, index) => ({
  id: index === 22 ? "0023_production_migration_ledger" : `${String(index + 1).padStart(4, "0")}_fixture`,
  checksum: hash(`migration fixture ${index + 1}`),
}));
const options = { expectedMigrations: migrations, expectedRelations: ADMIN_BOARD_RELATIONS };
function ledgerRow(migration) {
  return { ...migration, state: "applied", provenance: Number(migration.id.slice(0, 4)) <= 19 ? "adopted"
    : migration.id === "0023_production_migration_ledger" ? "bootstrap" : "executed",
  releaseSha: imageSha, startedAt: timestamp, appliedAt: timestamp, updatedAt: timestamp };
}
function fixture(overrides = {}) {
  const marker = {
    id: "__managed_history_through_0019__", checksum: hash(migrations.slice(0, 19).map(({ id, checksum }) => `${id}:${checksum}\n`).join("")),
    state: "applied", provenance: "adopted", releaseSha: imageSha, startedAt: timestamp, appliedAt: timestamp, updatedAt: timestamp,
  };
  const entries = [...migrations.map(ledgerRow), marker];
  const relations = ["admin_workspace", "admin_business_plan", "admin_workspace_business_grant", "admin_business_plan_grant"];
  const columns = relations.flatMap((relation) => ADMIN_BOARD_AUDIT_NAMES.columns[relation].split(" ").map((name) => ({
    relation, name, type: "text", not_null: false, has_default: false, public_grants: "0", other_grants: "0",
  })));
  const data = {
    session: { read_only: true, superuser: false, create_database: false, create_role: false, replication: false,
      bypass_rls: false, can_login: true, owns_database: true, session_matches: true, memberships: "0", role_name: sensitive },
    presence: { ledger_exists: true, lock_exists: true }, entries, ledgerCount: { total: String(entries.length), unknown: "0" },
    inventory: relations.map((name) => ({ name, kind: "r", rls: true, force_rls: false, owned: true,
      can_select: true, can_insert: true, can_update: true, can_delete: false, can_truncate: false,
      public_grants: "0", other_grants: "0", policies: "1", public_policies: "0" })),
    columns, constraints: [], triggers: [], ownership: { rows: "1", owners: "1", data_rows: "1", payload: sensitive },
    grants: { rows: "1", active: "1", user_id: sensitive }, ...overrides,
  };
  const calls = []; const clientOptions = []; let connects = 0; let ends = 0;
  class Client {
    constructor(input) {
      clientOptions.push(input);
      this.connectionParameters = { host: "toonstudio-db.db.onpod.local", port: 5432, ...data.connectionParameters };
      this.connection = { stream: { encrypted: true, authorized: false,
        getPeerCertificate: () => ({ raw: Buffer.from("public certificate fixture"), valid_from: timestamp, valid_to: "2027-11-18T16:00:00Z", subject: { CN: sensitive } }),
        getProtocol: () => "TLSv1.3" } };
    }
    on(event, listener) { assert.equal(event, "error"); this.errorListener = listener; }
    async connect() { connects++; if (data.connectError) throw data.connectError; }
    async query({ text, values }) {
      calls.push({ text, values });
      if (data.failAt && text.includes(data.failAt)) throw new Error(`connection ${connectionString} ${sensitive}`);
      if (data.hangAt && text.includes(data.hangAt)) return new Promise(() => {});
      if (data.errorAt && text.includes(data.errorAt)) this.errorListener(new Error(`connection ${connectionString} ${sensitive}`));
      if (text === "BEGIN READ ONLY" || text === "ROLLBACK" || text.startsWith("SET LOCAL ")) return { rows: [] };
      assert.match(text, /^SELECT\b/u, "읽기 트랜잭션에는 SELECT만 허용한다");
      const tag = text.match(/\/\*audit:([a-z-]+)\*\//u)?.[1];
      const rows = {
        session: [data.session], "ledger-presence": [data.presence], "lock-count": [{ count: "0" }],
        "ledger-count": [data.ledgerCount], "ledger-rows": data.entries,
        relations: data.inventory, columns: data.columns, constraints: data.constraints, triggers: data.triggers,
        "workspace-ownership": [data.ownership], "business-ownership": [data.ownership], "cloud-ownership": [data.ownership],
        "workspace-ownership-legacy": [{ ...data.ownership, owners: null }], "business-ownership-legacy": [{ ...data.ownership, owners: null }],
        "workspace-grants": [data.grants], "business-grants": [data.grants],
      }[tag];
      assert.ok(rows, `승인된 고정 SELECT의 결과만 제공한다: ${tag}`);
      return { rows };
    }
    async end() { ends++; if (data.endError) throw new Error(sensitive); }
  }
  const runtime = {
    Client, env: { DATABASE_URL: connectionString, DATABASE_RUNTIME_ROLE_MODE: "single-owner", ONPOD_TOKEN: sensitive },
    readFileSync: () => imageSha, createHash, checkServerIdentity: () => new Error(sensitive), setTimeout, clearTimeout,
  };
  return { data, runtime, Client, calls, clientOptions, stats: () => ({ connects, ends }) };
}

test("진단 source는 검토한 manifest와 관리자 관계만 허용하며 임의 SQL을 받지 않는다", () => {
  for (const change of [
    { expectedMigrations: [] },
    { expectedMigrations: [{ id: "0122_fixture", checksum: hash("fixture") }] },
    { expectedMigrations: [{ id: "0001_fixture;DROP TABLE example", checksum: hash("fixture") }] },
    { expectedMigrations: [{ id: "0001_fixture", checksum: sensitive }] },
    { expectedRelations: ["user"] },
    { expectedRelations: ["admin_workspace; DROP SCHEMA public"] },
    { expectedRelations: ["admin_workspace", "admin_workspace"] },
  ]) assert.throws(() => buildOnpodAdminDbAuditPayload({ ...options, ...change }));
  const source = buildOnpodAdminDbAuditPayload({ ...options, sql: sensitive, command: sensitive });
  assert.equal(source.includes(sensitive), false);
  assert.ok(source.length < 100_000);
});

test("전체 정상 원장을 비교하고 메타데이터만 반환한 뒤 ROLLBACK과 연결 종료를 한다", async () => {
  const f = fixture();
  const report = await runOnpodAdminDbAudit(options, f.runtime);
  assert.equal(report.status, "ok");
  assert.equal(report.database.readOnly, true);
  assert.equal(report.database.rolledBack, true);
  assert.equal(report.database.connectionClosed, true);
  assert.equal(report.migrations.integrity, "verified");
  assert.equal(report.migrations.orderValid, true);
  assert.equal(report.migrations.comparisons.every(({ status }) => status === "applied"), true);
  assert.equal(report.runtime.imageSha, imageSha);
  assert.equal(report.database.tls.configuredMode, "no-verify");
  assert.equal(report.database.tls.authorized, false);
  assert.equal(report.database.tls.hostnameMatches, false);
  assert.equal(report.database.tls.migrationTransportVerified, false);
  assert.equal(report.database.tls.channelBindingEnforced, false);
  assert.equal(report.database.tls.peerFingerprintSha256, hash("public certificate fixture"));
  assert.deepEqual(f.stats(), { connects: 1, ends: 1 });
  assert.equal(f.clientOptions[0].connectionString, connectionString);
  assert.equal(Object.hasOwn(f.clientOptions[0], "ssl"), false);
  assert.equal(JSON.stringify(report).includes(sensitive), false);
  assert.equal(JSON.stringify(report).includes("postgresql://"), false);
  assert.ok(f.calls.every(({ text }) => /^(?:SELECT\b|BEGIN READ ONLY$|SET LOCAL (?:statement_timeout|lock_timeout|idle_in_transaction_session_timeout) = '\d+s'$|ROLLBACK$)/u.test(text)));
  assert.equal(f.calls.at(-1).text, "ROLLBACK");
  assert.equal(f.calls[0].text, "BEGIN READ ONLY");
});

test("잘못된 DB 호스트·포트·연결 override는 접속 전에 차단한다", async () => {
  for (const url of [connectionString.replace(".local", ".example"), connectionString.replace(":5432", ":5433"),
    `${connectionString}&host=other.internal`, `${connectionString}&hostaddr=127.0.0.1`, connectionString.replace("postgresql:", "https:")]) {
    const f = fixture(); f.runtime.env.DATABASE_URL = url;
    const report = await runOnpodAdminDbAudit(options, f.runtime);
    assert.equal(report.status, "blocked"); assert.equal(report.reason, "DATABASE_HOST_MISMATCH");
    assert.equal(f.stats().connects, 0); assert.equal(f.calls.length, 0);
    assert.equal(JSON.stringify(report).includes(sensitive), false);
  }
  const f = fixture({ connectionParameters: { host: "unexpected.internal" } });
  assert.equal((await runOnpodAdminDbAudit(options, f.runtime)).reason, "DATABASE_HOST_UNVERIFIED");
  assert.equal(f.stats().connects, 0);
});

test("서버가 읽기 전용 트랜잭션임을 입증하지 않으면 조회를 중단한다", async () => {
  const f = fixture(); f.data.session.read_only = false;
  const report = await runOnpodAdminDbAudit(options, f.runtime);
  assert.equal(report.status, "blocked"); assert.equal(report.reason, "READ_ONLY_TRANSACTION_UNVERIFIED");
  assert.equal(report.database.rolledBack, true);
  assert.equal(f.calls.some(({ text }) => text.includes("audit:ledger")), false);
});

test("원장 부재·불완전한 목록·채택 증거 누락을 pending으로 추정하지 않는다", async () => {
  const absent = fixture({ presence: { ledger_exists: false, lock_exists: false } });
  const unknown = await runOnpodAdminDbAudit(options, absent.runtime);
  assert.equal(unknown.migrations.ledgerExists, false);
  assert.equal(unknown.migrations.comparisons.every(({ status }) => status === "unknown"), true);
  assert.equal(absent.calls.some(({ text }) => text.includes("audit:ledger-rows")), false);
  for (const altered of ["unknown-row", "missing-marker", "wrong-total"]) {
    const f = fixture(); f.data.entries = f.data.entries.filter(({ id }) => id !== migrations.at(-1).id);
    f.data.ledgerCount.total = String(f.data.entries.length);
    if (altered === "unknown-row") f.data.ledgerCount.unknown = "1";
    if (altered === "missing-marker") {
      f.data.entries.pop(); f.data.ledgerCount.total = String(f.data.entries.length);
    }
    if (altered === "wrong-total") f.data.ledgerCount.total = "1000";
    const report = await runOnpodAdminDbAudit(options, f.runtime);
    assert.equal(report.migrations.comparisons.at(-1).status, "unknown");
    assert.equal(report.migrations.integrity, "blocked");
  }
});

test("검증된 원장에서 실제 빠진 후속 항목만 pending이며 다른 상태를 구분한다", async () => {
  const f = fixture();
  f.data.entries = f.data.entries.filter(({ id }) => id !== migrations.at(-1).id);
  f.data.ledgerCount.total = String(f.data.entries.length);
  f.data.entries[19].checksum = hash("changed checksum");
  f.data.entries[20].state = "failed";
  const report = await runOnpodAdminDbAudit(options, f.runtime);
  assert.equal(report.migrations.comparisons[19].status, "checksum-drift");
  assert.equal(report.migrations.comparisons[20].status, "incomplete");
  assert.equal(report.migrations.comparisons.at(-1).status, "pending");
  assert.equal(report.migrations.integrity, "blocked");
});

test("후속 SQL이 이미 적용된 원장의 중간 누락은 정상 순서로 승인하지 않는다", async () => {
  const f = fixture();
  f.data.entries = f.data.entries.filter(({ id }) => id !== migrations[19].id);
  f.data.ledgerCount.total = String(f.data.entries.length);
  const report = await runOnpodAdminDbAudit(options, f.runtime);
  assert.equal(report.status, "ok");
  assert.equal(report.migrations.comparisons[19].status, "pending");
  assert.equal(report.migrations.comparisons[20].status, "applied");
  assert.equal(report.migrations.orderValid, false);
  assert.equal(report.migrations.integrity, "blocked");
});

test("마지막 조회의 비동기 DB 오류도 비밀값을 숨기고 실패·rollback으로 처리한다", async () => {
  const f = fixture({ errorAt: "audit:business-grants" });
  const report = await runOnpodAdminDbAudit(options, f.runtime);
  assert.equal(report.status, "error"); assert.equal(report.reason, "DATABASE_QUERY_FAILED");
  assert.equal(report.database.rolledBack, true); assert.equal(report.database.connectionClosed, true);
  assert.equal(report.migrations.orderValid, null);
  assert.equal(JSON.stringify(report).includes(sensitive), false);
});

test("조회 후 rollback·연결 종료 실패와 늦은 client 오류도 완료·pending 판정을 무효화한다", async () => {
  for (const [change, reason] of [
    [{ failAt: "ROLLBACK" }, "ROLLBACK_UNCONFIRMED"],
    [{ endError: true }, "CONNECTION_CLOSE_UNCONFIRMED"],
    [{ errorAt: "ROLLBACK" }, "DATABASE_QUERY_FAILED"],
  ]) {
    const f = fixture(change);
    f.data.entries = f.data.entries.filter(({ id }) => id !== migrations.at(-1).id);
    f.data.ledgerCount.total = String(f.data.entries.length);
    const report = await runOnpodAdminDbAudit(options, f.runtime);
    assert.equal(report.status, "error"); assert.equal(report.reason, reason);
    assert.equal(report.migrations.integrity, "unknown"); assert.equal(report.migrations.orderValid, null);
    assert.equal(report.migrations.comparisons.every(({ status }) => status === "unknown"), true);
    assert.equal(f.stats().ends, 1); assert.equal(JSON.stringify(report).includes(sensitive), false);
  }
});

test("예상하지 않은 원장·카탈로그 값과 raw 오류의 비밀값을 출력하지 않는다", async () => {
  const f = fixture();
  f.data.entries[20] = { ...f.data.entries[20], checksum: sensitive, state: sensitive, provenance: sensitive,
    releaseSha: sensitive, startedAt: sensitive, appliedAt: sensitive, updatedAt: sensitive, secret: sensitive };
  f.data.entries.push({ id: sensitive, checksum: sensitive });
  f.data.columns.push({ relation: "admin_workspace", name: sensitive, type: sensitive });
  f.data.constraints.push({ relation: "admin_workspace", name: sensitive, type: sensitive, validated: false });
  f.data.triggers.push({ relation: "admin_workspace", name: sensitive, enabled: sensitive });
  f.runtime.readFileSync = () => sensitive;
  const report = await runOnpodAdminDbAudit(options, f.runtime);
  assert.equal(JSON.stringify(report).includes(sensitive), false);
  assert.equal(report.runtime.imageSha, null);
  assert.equal(report.migrations.comparisons.every(({ status }) => status === "unknown"), true);
  assert.equal(report.reason, "LEDGER_BOUNDS_EXCEEDED");
  const broken = fixture({ failAt: "audit:columns" });
  const failed = await runOnpodAdminDbAudit(options, broken.runtime);
  assert.equal(failed.reason, "DATABASE_QUERY_FAILED");
  assert.equal(failed.database.rolledBack, true); assert.equal(failed.database.connectionClosed, true);
  assert.equal(JSON.stringify(failed).includes(sensitive), false);
  assert.equal(failed.migrations.comparisons.every(({ status }) => status === "unknown"), true);
});

test("카탈로그의 비허용 이름·타입은 값 대신 unknown과 개수로 남긴다", async () => {
  const f = fixture();
  f.data.columns.push({ relation: "admin_workspace", name: sensitive, type: sensitive });
  f.data.columns[0].type = sensitive;
  f.data.constraints.push({ relation: "admin_workspace", name: sensitive, type: sensitive, validated: false });
  f.data.triggers.push({ relation: "admin_workspace", name: sensitive, enabled: sensitive });
  const report = await runOnpodAdminDbAudit(options, f.runtime);
  assert.equal(report.status, "ok");
  assert.equal(JSON.stringify(report).includes(sensitive), false);
  const table = report.catalog.find(({ name }) => name === "admin_workspace");
  assert.equal(table.unknownColumnCount, 1); assert.equal(table.columns[0].type, "unknown");
  assert.equal(table.triggers.unknownCount, 1); assert.equal(table.constraints.unvalidatedCount, 1);
});

test("원장 길이가 정상이어도 예상 밖 ID·상태·시각과 추가 필드를 그대로 출력하지 않는다", async () => {
  const f = fixture();
  f.data.entries[20] = { ...f.data.entries[20], checksum: sensitive, state: sensitive, provenance: sensitive,
    releaseSha: sensitive, startedAt: sensitive, appliedAt: sensitive, updatedAt: sensitive, payload: sensitive };
  f.data.entries[23] = { id: sensitive, checksum: sensitive, user_id: sensitive };
  const report = await runOnpodAdminDbAudit(options, f.runtime);
  assert.equal(report.status, "ok"); assert.equal(report.migrations.integrity, "blocked");
  assert.equal(report.migrations.comparisons[20].status, "incomplete");
  assert.equal(report.migrations.comparisons[23].status, "unknown");
  assert.equal(JSON.stringify(report).includes(sensitive), false);
  assert.equal(report.migrations.entries.length, f.data.entries.length - 1);
});

test("접근 migration 전 기존 자료의 존재는 세되 없는 owner 열을 자동 소유자로 취급하지 않는다", async () => {
  const f = fixture();
  f.data.columns = f.data.columns.filter(({ name }) => !["business_owner_user_id", "owner_user_id"].includes(name));
  const report = await runOnpodAdminDbAudit(options, f.runtime);
  assert.equal(report.status, "ok");
  for (const name of ["admin_workspace", "admin_business_plan"]) {
    const row = report.ownership.find((entry) => entry.name === name);
    assert.equal(row.status, "unknown"); assert.equal(row.ownerCount, null);
    assert.equal(row.rowCount, 1); assert.equal(row.dataRowCount, 1);
  }
  assert.equal(JSON.stringify(report).includes(sensitive), false);
});

test("전체 시간 상한 이후 중단하고 연결을 닫으며 완료·pending을 주장하지 않는다", async () => {
  const f = fixture({ hangAt: "audit:session" });
  f.runtime.setTimeout = (callback, delay) => setTimeout(callback, delay === 25000 ? 1 : delay);
  const report = await runOnpodAdminDbAudit(options, f.runtime);
  assert.equal(report.status, "error"); assert.equal(report.reason, "AUDIT_TIMEOUT");
  assert.equal(report.database.connectionClosed, true); assert.equal(f.stats().ends, 1);
  assert.equal(report.migrations.comparisons.every(({ status }) => status === "unknown"), true);
});

test("실제 생성 CJS payload도 앱 내 pg 경로만 사용하고 sentinel JSON 한 줄을 출력한다", async () => {
  const f = fixture(); const output = [];
  const processStub = { env: f.runtime.env, stdout: { write: (text) => output.push(text) }, exitCode: 0 };
  const requires = [];
  const context = { URL, Buffer, setTimeout, clearTimeout, process: processStub,
    require: (name) => {
      requires.push(name);
      if (name === "node:module") return { createRequire: (path) => {
        assert.equal(path, "/app/apps/api/package.json");
        return (moduleName) => { assert.equal(moduleName, "pg"); return { Client: f.Client }; };
      } };
      if (name === "node:fs") return { readFileSync: f.runtime.readFileSync };
      if (name === "node:crypto") return { createHash };
      if (name === "node:tls") return { checkServerIdentity: f.runtime.checkServerIdentity };
      throw new Error("허용하지 않은 import");
    } };
  await vm.runInNewContext(buildOnpodAdminDbAuditPayload(options), context);
  assert.equal(output.length, 1); assert.ok(output[0].startsWith(ONPOD_ADMIN_DB_AUDIT_PREFIX));
  const report = JSON.parse(output[0].slice(ONPOD_ADMIN_DB_AUDIT_PREFIX.length));
  assert.equal(report.status, "ok"); assert.equal(processStub.exitCode, 0);
  assert.equal(output[0].includes(sensitive), false);
  assert.deepEqual(requires, ["node:module", "node:fs", "node:crypto", "node:tls"]);
});
