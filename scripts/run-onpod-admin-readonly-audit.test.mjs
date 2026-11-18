import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { ADMIN_BOARD_RELATIONS, ONPOD_ADMIN_DB_AUDIT_PREFIX } from "./onpod-admin-db-audit-payload.mjs";
import {
  ROOT, formatAuditSummary, inspectCloudflareMetadata, parseOnpodAuditResult,
  parseOnpodAuditStatus, readAuditManifest, runOnpodAdminReadonlyAudit,
} from "./run-onpod-admin-readonly-audit.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const releaseSha = "a".repeat(40);
const secretFixture = "opk_unit_test_fixture_only";
const manifest = readAuditManifest();
const environment = (overrides = {}) => ({
  GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main", GITHUB_SHA: releaseSha,
  RELEASE_SHA: releaseSha, ONPOD_DEPLOY_TOKEN: secretFixture, PATH: "/usr/bin", HOME: "/tmp",
  ...overrides,
});
const appStatus = (overrides = {}) => ({
  name: "toonstudio-api", state: "running", plan: "cpu_micro", free_tier: true,
  image: `ghcr.io/blue45f/toonspectrum-core-api:${releaseSha}`,
  previous_image: `onpod://toonspectrum-core-api:${"b".repeat(40)}`, ...overrides,
});
function dbReport(overrides = {}) {
  return {
    schemaVersion: 1, mode: "read-only", status: "ok", reason: null, runtime: { imageSha: releaseSha },
    database: { hostMatched: true, readOnly: true, rolledBack: true, connectionClosed: true, tls: null, role: null },
    migrations: {
      ledgerExists: true, entries: [], unknownRowsCount: 0, truncated: false, orderValid: true, integrity: "verified",
      comparisons: manifest.map(({ id }) => ({ id, status: Number(id.slice(0, 4)) <= 121 ? "applied" : "pending" })),
    },
    durableLockCount: 0, catalog: ADMIN_BOARD_RELATIONS.map((name) => ({ name, present: false })), ownership: [],
    ...overrides,
  };
}
const sentinel = (report = dbReport()) => `${ONPOD_ADMIN_DB_AUDIT_PREFIX}${JSON.stringify(report)}\n`;
function transport({ status = appStatus(), stdout = sentinel(), exitCode = 0, onCall } = {}) {
  return (executable, args, options) => {
    onCall?.(executable, args, options);
    if (executable === "git" && args[0] === "rev-parse") return { status: 0, stdout: `${releaseSha}\n` };
    if (executable === "git" && args[0] === "status") return { status: 0, stdout: "" };
    if (executable === "onpod" && args[0] === "app") return { status: 0, stdout: JSON.stringify(status) };
    if (executable === "onpod" && args[0] === "exec") return { status: exitCode, stdout, stderr: secretFixture };
    assert.fail("허용하지 않은 실행 명령");
  };
}

test("정본 전체 manifest의 순서·파일 집합·SQL 체크섬을 읽고 0122~0128을 포함한다", () => {
  assert.ok(manifest.length >= 128);
  assert.equal(manifest[121].id, "0122_admin_workspace");
  assert.equal(manifest[127].id, "0128_admin_business_plan_access");
  for (const [index, entry] of manifest.entries()) {
    assert.equal(Number(entry.id.slice(0, 4)), index + 1);
    assert.match(entry.checksum, /^[a-f0-9]{64}$/u);
  }
  const root = mkdtempSync(resolve(tmpdir(), "admin-audit-manifest-"));
  try {
    mkdirSync(resolve(root, "scripts"));
    mkdirSync(resolve(root, "apps/api/src/platform/database/migrations"), { recursive: true });
    const paths = Array.from({ length: 128 }, (_, index) => `apps/api/src/platform/database/migrations/${String(index + 1).padStart(4, "0")}_fixture.sql`);
    for (const path of paths) writeFileSync(resolve(root, path), "SELECT 1;\n");
    const manifestPath = resolve(root, "scripts/production-database-migrations.manifest");
    writeFileSync(manifestPath, paths.join("\n"));
    const before = readAuditManifest(root);
    writeFileSync(resolve(root, paths[127]), "SELECT 2;\n");
    assert.notEqual(readAuditManifest(root)[127].checksum, before[127].checksum);
    for (const invalid of [[...paths].reverse(), [paths[0], ...paths.slice(0, -1)], [...paths.slice(0, -1), "../../unexpected.sql"]]) {
      writeFileSync(manifestPath, invalid.join("\n"));
      assert.throws(() => readAuditManifest(root), /MANIFEST_INVALID/u);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("앱 상태에서 고정 대상과 허용 값만 출력하고 문자열 false를 무료로 취급하지 않는다", () => {
  const result = parseOnpodAuditStatus(JSON.stringify(appStatus({
    free_tier: "false", privateValue: secretFixture, image: secretFixture, state: secretFixture,
  })));
  assert.equal(result.freeTier, null);
  assert.equal(result.image, null);
  assert.equal(result.state, "unknown");
  assert.ok(!JSON.stringify(result).includes(secretFixture));
  assert.throws(() => parseOnpodAuditStatus(JSON.stringify(appStatus({ name: "another-app" }))), /APP_STATUS_INVALID/u);
});

test("sentinel 하나만 허용하며 원문·추가 필드·오류 텍스트를 버린다", () => {
  const report = dbReport({ privateValue: secretFixture });
  report.runtime.databaseUrl = secretFixture;
  const parsed = parseOnpodAuditResult(`CLI banner ${secretFixture}\n${sentinel(report)}${secretFixture}\n`, manifest);
  assert.equal(parsed.runtime.imageSha, releaseSha);
  assert.ok(!JSON.stringify(parsed).includes(secretFixture));
  assert.equal(parsed.migrations.comparisons[121].status, "pending");
  assert.equal(parsed.migrations.comparisons[120].status, "applied");
  assert.equal(parsed.migrations.orderValid, true);
  for (const invalid of [sentinel() + sentinel(), secretFixture, `${ONPOD_ADMIN_DB_AUDIT_PREFIX}{`, "x".repeat(1024 * 1024 + 1)]) {
    assert.throws(() => parseOnpodAuditResult(invalid, manifest), /EXEC_RESULT_INVALID/u);
  }
  for (const change of [
    { mode: "write" }, { reason: secretFixture }, { database: { ...report.database, readOnly: false } },
    { database: { ...report.database, rolledBack: false } },
    { catalog: [{ name: secretFixture, present: true }] },
    { ownership: [{ name: secretFixture, status: "observed", rowCount: 1 }] },
    { migrations: { ...report.migrations, comparisons: [{ id: secretFixture, status: "applied" }] } },
  ]) assert.throws(() => parseOnpodAuditResult(sentinel(dbReport(change)), manifest), /EXEC_RESULT_INVALID/u);
});

test("catalog와 원장·TLS·role 값은 고정 필드·타입으로 다시 투영한다", () => {
  const report = dbReport();
  report.database.tls = {
    enabled: true, authorized: false, hostnameMatches: false, configuredMode: "no-verify", protocol: "TLSv1.3",
    peerFingerprintSha256: "c".repeat(64), validFrom: "2026-01-01T00:00:00.000Z", validTo: secretFixture,
    channelBindingEnforced: true, migrationTransportVerified: true, limitation: secretFixture,
  };
  report.database.role = { ownsDatabase: true, superuser: false, configuredMode: "single-owner", username: secretFixture };
  report.catalog = [{
    name: "admin_workspace", present: true, kind: "r", rls: false, forceRls: false,
    ownedByCurrentRole: true, effectivePrivileges: { select: true, insert: true, extra: secretFixture },
    columns: [{ name: "id", present: true, type: "text", defaultExpression: secretFixture }],
    constraints: { count: 1, unvalidatedCount: 0, typeCounts: { c: 1 }, required: [{ name: "admin_workspace_state_check", present: true, validated: true, expression: secretFixture }] },
    triggers: { count: 0, unknownCount: 0, required: [] },
  }];
  report.migrations.entries = [{ id: manifest[0].id, checksum: "c".repeat(64), state: "applied", provenance: "adopted", releaseSha, appliedAt: "2026-01-01T00:00:00.000Z", error: secretFixture }];
  const parsed = parseOnpodAuditResult(sentinel(report), manifest);
  assert.equal(parsed.database.tls.migrationTransportVerified, false);
  assert.equal(parsed.database.tls.channelBindingEnforced, false);
  assert.equal(parsed.database.role.ownsDatabase, true);
  assert.equal(parsed.catalog[0].columns[0].type, "text");
  assert.ok(!JSON.stringify(parsed).includes(secretFixture));
  report.catalog[0].columns.push({ name: secretFixture, present: true });
  assert.throws(() => parseOnpodAuditResult(sentinel(report), manifest), /EXEC_RESULT_INVALID/u);
});

test("수동 main·동일 SHA·무인자·깨끗한 checkout 조건을 통과하기 전에는 운영 호출하지 않는다", async () => {
  for (const overrides of [
    { GITHUB_EVENT_NAME: "push" }, { GITHUB_REF: "refs/heads/feature" },
    { RELEASE_SHA: "short" }, { GITHUB_SHA: "b".repeat(40) },
  ]) {
    const result = await runOnpodAdminReadonlyAudit({ env: environment(overrides), argv: [], spawnImpl: () => assert.fail("명령 실행 금지") });
    assert.equal(result.status, "blocked");
  }
  const argumentsResult = await runOnpodAdminReadonlyAudit({ env: environment(), argv: ["--sql", "SELECT 1"], spawnImpl: () => assert.fail("명령 실행 금지") });
  assert.equal(argumentsResult.reason, "MANUAL_MAIN_ONLY");
  const dirtyResult = await runOnpodAdminReadonlyAudit({ env: environment(), argv: [], spawnImpl: (executable, args) => ({ status: 0, stdout: args[0] === "rev-parse" ? releaseSha : " M file" }) });
  assert.equal(dirtyResult.reason, "DIRTY_CHECKOUT");
});

test("무료이며 실행 중인 앱에만 고정 stdin payload를 한 번 보내고 자식에 필요한 앱 토큰만 전달한다", async () => {
  const calls = [];
  const result = await runOnpodAdminReadonlyAudit({
    env: environment({ DATABASE_URL: secretFixture, ONPOD_API_ENV_JSON: secretFixture, UNRELATED_SECRET: secretFixture }), argv: [],
    spawnImpl: transport({ onCall: (executable, args, options) => calls.push({ executable, args, options }) }),
    fetchImpl: () => assert.fail("토큰 없는 CF 조회 금지"),
  });
  assert.equal(result.status, "ok");
  assert.equal(result.cloudflare.status, "not-configured");
  const executions = calls.filter(({ args }) => args[0] === "exec");
  assert.equal(executions.length, 1);
  assert.deepEqual(executions[0].args, ["exec", "toonstudio-api", "--stdin", "--timeout", "40", "--", "node", "--max-old-space-size=64", "-"]);
  assert.match(executions[0].options.input, /BEGIN READ ONLY/u);
  assert.ok(!executions[0].options.input.includes(secretFixture));
  assert.equal(executions[0].options.timeout, 60_000);
  assert.equal(executions[0].options.shell, false);
  assert.equal(executions[0].options.env.ONPOD_TOKEN, secretFixture);
  for (const { executable, options } of calls) {
    for (const key of ["DATABASE_URL", "ONPOD_API_ENV_JSON", "UNRELATED_SECRET", "CLOUDFLARE_API_TOKEN", "ONPOD_DEPLOY_TOKEN"]) assert.ok(!(key in options.env));
    if (executable === "git") assert.ok(!("ONPOD_TOKEN" in options.env));
  }
  assert.ok(!formatAuditSummary(result).includes(secretFixture));
});

test("무료 여부 미확인·유료·절전 앱에는 exec을 보내지 않는다", async () => {
  for (const [status, reason] of [
    [appStatus({ free_tier: false }), "FREE_TIER_UNVERIFIED"],
    [appStatus({ free_tier: "true" }), "FREE_TIER_UNVERIFIED"],
    [appStatus({ free_tier: null }), "FREE_TIER_UNVERIFIED"],
    [appStatus({ state: "sleeping" }), "APP_NOT_RUNNING"],
  ]) {
    const result = await runOnpodAdminReadonlyAudit({ env: environment(), argv: [], spawnImpl: transport({ status, onCall: (_, args) => assert.notEqual(args[0], "exec") }) });
    assert.equal(result.reason, reason);
  }
  const missing = await runOnpodAdminReadonlyAudit({ env: environment({ ONPOD_DEPLOY_TOKEN: "" }), argv: [], spawnImpl: transport({ onCall: (executable) => assert.notEqual(executable, "onpod") }) });
  assert.equal(missing.reason, "APP_TOKEN_UNAVAILABLE");
});

test("실패한 exec·예외·부분 결과의 원문 오류를 노출하거나 성공으로 보고하지 않는다", async () => {
  for (const spawnImpl of [
    transport({ stdout: secretFixture, exitCode: 1 }),
    transport({ exitCode: 1 }),
    transport({ stdout: sentinel({ schemaVersion: 1, mode: "read-only", status: "error", reason: "AUDIT_PAYLOAD_FAILED" }), exitCode: 1 }),
    (executable, args, options) => { if (executable === "onpod") throw new Error(secretFixture); return transport()(executable, args, options); },
  ]) {
    const result = await runOnpodAdminReadonlyAudit({ env: environment(), argv: [], spawnImpl });
    assert.notEqual(result.status, "ok");
    assert.ok(!formatAuditSummary(result).includes(secretFixture));
    if (result.audit?.migrations) {
      assert.notEqual(result.audit.status, "ok");
      assert.equal(result.audit.migrations.integrity, "unknown");
      assert.equal(result.audit.migrations.orderValid, null);
      assert.ok(result.audit.migrations.comparisons.every(({ status }) => status === "unknown"));
    }
  }
  const partial = parseOnpodAuditResult(sentinel(dbReport({ status: "error", reason: "ROLLBACK_UNCONFIRMED" })), manifest);
  assert.equal(partial.migrations.integrity, "unknown");
  assert.equal(partial.migrations.orderValid, null);
  assert.ok(partial.migrations.comparisons.every(({ status }) => status === "unknown"));
});

test("Cloudflare 토큰이 없으면 호출하지 않고 있으면 고정된 Worker GET 메타데이터만 읽는다", async () => {
  const absent = await inspectCloudflareMetadata({}, () => assert.fail("토큰 없는 조회 금지"));
  assert.equal(absent.tokenConfigured, false);
  const accountId = "d".repeat(32);
  const uuid = "12345678-1234-1234-1234-123456789abc";
  const calls = [];
  const observed = await inspectCloudflareMetadata({ CLOUDFLARE_API_TOKEN: secretFixture, CLOUDFLARE_ACCOUNT_ID: accountId }, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, text: async () => JSON.stringify({ success: true, result: url.endsWith("deployments")
      ? { deployments: [{ id: uuid, versions: [{ version_id: uuid }], private: secretFixture }] }
      : { bindings: [{ name: "RELEASE_SHA", type: "plain_text", text: releaseSha }, { name: "SECRET", text: secretFixture }] } }) };
  });
  assert.equal(observed.releaseSha, releaseSha);
  assert.deepEqual(observed.versionIds, [uuid]);
  assert.ok(!JSON.stringify(observed).includes(secretFixture));
  assert.deepEqual(calls.map(({ url }) => url), ["deployments", "settings"].map((suffix) => `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/toonspectrum-web/${suffix}`));
  for (const { options } of calls) { assert.equal(options.method, "GET"); assert.equal(options.redirect, "error"); assert.ok(!("body" in options)); }
  for (const fetchImpl of [async () => ({ ok: false, status: 403 }), async () => { throw new Error(secretFixture); }]) {
    const failure = await inspectCloudflareMetadata({ CLOUDFLARE_API_TOKEN: secretFixture, CLOUDFLARE_ACCOUNT_ID: accountId }, fetchImpl);
    assert.ok(["denied", "unavailable"].includes(failure.status));
    assert.ok(!JSON.stringify(failure).includes(secretFixture));
  }
});

test("workflow는 main 수동 실행·무료 표준 runner·단계별 secret 주입만 허용한다", () => {
  const source = readFileSync(resolve(ROOT, ".github/workflows/onpod-admin-readonly-audit.yml"), "utf8");
  const trigger = source.split("on:\n")[1].split("\npermissions:")[0];
  assert.match(trigger, /^ {2}workflow_dispatch:/mu);
  assert.doesNotMatch(trigger, /^ {2}(?:push|pull_request|pull_request_target|workflow_run|schedule):/mu);
  assert.deepEqual([...trigger.matchAll(/^ {6}([a-z_]+):$/gmu)].map((match) => match[1]), ["release_sha"]);
  assert.match(source, /if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/u);
  assert.match(source, /permissions:\n {2}contents: read\n/u);
  assert.match(source, /runs-on: ubuntu-24\.04\n/u);
  assert.match(source, /timeout-minutes: 10\n/u);
  assert.match(source, /environment: production-deploy\n/u);
  assert.match(source, /persist-credentials: false/u);
  assert.match(source, /fetch-depth: 1\n/u);
  assert.match(source, /filter: blob:none\n/u);
  assert.match(source, /sparse-checkout-cone-mode: false\n/u);
  const checkoutPaths = source.split("          sparse-checkout: |\n")[1].split("\n\n")[0]
    .trim().split("\n").map((line) => line.trim());
  assert.deepEqual(checkoutPaths, [
    "/.github/workflows/onpod-admin-readonly-audit.yml",
    "/scripts/run-onpod-admin-readonly-audit.mjs",
    "/scripts/run-onpod-admin-readonly-audit.test.mjs",
    "/scripts/onpod-admin-db-audit-payload.mjs",
    "/scripts/onpod-admin-db-audit-payload.test.mjs",
    "/scripts/production-database-migrations.manifest",
    "/apps/api/src/platform/database/migrations/",
  ]);
  assert.match(source, /package-manager-cache: false/u);
  assert.match(source, /node --test scripts\/onpod-admin-db-audit-payload\.test\.mjs scripts\/run-onpod-admin-readonly-audit\.test\.mjs/u);
  assert.match(source, /onpod@0\.7\.159/u);
  assert.match(source, /git fetch --no-tags --depth=1 --filter=blob:none origin main/u);
  assert.match(source, /git rev-parse FETCH_HEAD/u);
  const steps = source.split(/^ {6}- /mu);
  const secretSteps = steps.filter((step) => /\$\{\{ secrets\./u.test(step));
  assert.equal(secretSteps.length, 1);
  assert.match(secretSteps[0], /run: node scripts\/run-onpod-admin-readonly-audit\.mjs/u);
  assert.deepEqual([...secretSteps[0].matchAll(/secrets\.([A-Z_]+)/gu)].map((match) => match[1]), ["ONPOD_DEPLOY_TOKEN", "CLOUDFLARE_API_TOKEN"]);
  assert.doesNotMatch(source, /actions\/(?:cache|upload-artifact|download-artifact)|pnpm install|ONPOD_API_ENV_JSON|DATABASE_URL|\b(?:app update|app rollback|db create|attach-db)\b/u);
});
