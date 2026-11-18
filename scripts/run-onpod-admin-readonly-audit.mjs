#!/usr/bin/env node
/** 고정된 운영 앱에서 관리자 보드의 메타데이터만 조회한다. 배포·migration 실행기는 아니다. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADMIN_BOARD_AUDIT_NAMES,
  ADMIN_BOARD_RELATIONS,
  ONPOD_ADMIN_DB_AUDIT_PREFIX,
  buildOnpodAdminDbAuditPayload,
} from "./onpod-admin-db-audit-payload.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const ONPOD_AUDIT_APP = "toonstudio-api";
const MAX_OUTPUT_BYTES = 1024 * 1024;
const MIGRATION_DIRECTORY = "apps/api/src/platform/database/migrations";
const SHA = /^[a-f0-9]{40}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const MARKER_ID = "__managed_history_through_0019__";
const DB_REASONS = new Set([
  "DATABASE_URL_UNAVAILABLE", "DATABASE_HOST_MISMATCH", "DATABASE_HOST_UNVERIFIED",
  "PG_MODULE_UNAVAILABLE", "UNSAFE_QUERY_REJECTED", "AUDIT_TIMEOUT", "LEDGER_BOUNDS_EXCEEDED",
  "CATALOG_BOUNDS_EXCEEDED", "READ_ONLY_TRANSACTION_UNVERIFIED", "DATABASE_QUERY_FAILED",
  "ROLLBACK_UNCONFIRMED", "CONNECTION_CLOSE_UNCONFIRMED", "AUDIT_PAYLOAD_FAILED",
]);
const AUDIT_REASONS = new Set([
  "MANUAL_MAIN_ONLY", "RELEASE_SHA_MISMATCH", "DIRTY_CHECKOUT", "MANIFEST_INVALID",
  "APP_TOKEN_UNAVAILABLE", "APP_STATUS_UNAVAILABLE", "APP_STATUS_INVALID",
  "FREE_TIER_UNVERIFIED", "APP_NOT_RUNNING", "PAYLOAD_INVALID", "EXEC_RESULT_INVALID",
  "EXEC_FAILED", "DATABASE_AUDIT_INCOMPLETE", "AUDIT_FAILED",
]);
const bool = (value) => typeof value === "boolean" ? value : null;
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const matching = (value, pattern) => typeof value === "string" && pattern.test(value) ? value : null;
const choice = (value, options, fallback = null) => options.includes(value) ? value : fallback;
const names = (value) => value ? value.split(" ") : [];
const timestamp = (value) => matching(value, /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const list = (value, limit) => {
  if (!Array.isArray(value) || value.length > limit) throw new Error("EXEC_RESULT_INVALID");
  return value;
};

function childEnvironment(env, withToken = false) {
  const safe = { CI: "true", NO_COLOR: "1", ONPOD_NO_ERROR_REPORT: "1" };
  for (const key of ["PATH", "HOME", "TMPDIR", "LANG"]) {
    if (typeof env[key] === "string") safe[key] = env[key];
  }
  if (withToken) safe.ONPOD_TOKEN = env.ONPOD_DEPLOY_TOKEN;
  return safe;
}

function command(spawnImpl, executable, args, { root, env, input, timeout = 15_000 } = {}) {
  try {
    return spawnImpl(executable, args, {
      cwd: root, env, input, timeout, maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8",
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"], shell: false,
    });
  } catch (error) {
    return { status: null, stdout: "", error };
  }
}

function projectCommandFailure(result) {
  return {
    exitCode: Number.isInteger(result.status) && result.status >= 0 && result.status <= 255 ? result.status : null,
    signal: result.signal == null ? null : choice(result.signal, ["SIGTERM", "SIGKILL", "SIGABRT", "SIGSEGV", "SIGBUS"], "unknown"),
    spawnErrorCode: result.error == null ? null : choice(result.error.code, ["ENOENT", "EACCES", "EPERM", "ETIMEDOUT", "ENOBUFS"], "unknown"),
  };
}

export function readAuditManifest(root = ROOT) {
  try {
    const paths = readFileSync(resolve(root, "scripts/production-database-migrations.manifest"), "utf8")
      .split(/\r?\n/u).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
    const files = readdirSync(resolve(root, MIGRATION_DIRECTORY)).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name)).sort();
    if (paths.length < 128 || paths.length > 512 || paths.length !== files.length) throw new Error();
    return paths.map((path, index) => {
      if (path !== `${MIGRATION_DIRECTORY}/${files[index]}` || Number(files[index].slice(0, 4)) !== index + 1) throw new Error();
      const contents = readFileSync(resolve(root, path), "utf8");
      return { id: files[index].slice(0, -4), checksum: createHash("sha256").update(contents).digest("hex") };
    });
  } catch {
    throw new Error("MANIFEST_INVALID");
  }
}

export function parseOnpodAuditStatus(raw) {
  try {
    if (typeof raw !== "string" || Buffer.byteLength(raw) > MAX_OUTPUT_BYTES) throw new Error();
    const start = raw.indexOf("{");
    if (start < 0) throw new Error();
    const value = JSON.parse(raw.slice(start, raw.lastIndexOf("}") + 1));
    if (!isObject(value) || value.name !== ONPOD_AUDIT_APP) throw new Error();
    const image = (input) => matching(input, /^(?:ghcr\.io\/blue45f\/toonspectrum-core-api|onpod:\/\/toonspectrum-core-api)(?::[a-f0-9]{40}|@sha256:[a-f0-9]{64})$/u);
    return {
      state: choice(value.state, ["running", "sleeping", "stopped", "pending", "starting", "deploying", "failed", "error"], "unknown"),
      image: image(value.image), previousImage: image(value.previous_image),
      plan: choice(value.plan, ["cpu_micro", "free", "dev", "hobby", "business"], "unknown"),
      freeTier: bool(value.free_tier),
    };
  } catch {
    throw new Error("APP_STATUS_INVALID");
  }
}

function projectCatalog(raw) {
  const catalog = list(raw, ADMIN_BOARD_RELATIONS.length);
  if (new Set(catalog.map((entry) => entry?.name)).size !== catalog.length) throw new Error("EXEC_RESULT_INVALID");
  return catalog.map((entry) => {
    if (!isObject(entry) || !ADMIN_BOARD_RELATIONS.includes(entry.name) || typeof entry.present !== "boolean") throw new Error("EXEC_RESULT_INVALID");
    const base = { name: entry.name, present: entry.present };
    if (!entry.present) return base;
    const columns = list(entry.columns, 64);
    const checks = list(entry.constraints?.required, 64);
    const triggers = list(entry.triggers?.required, 64);
    for (const [rows, allowed] of [
      [columns, names(ADMIN_BOARD_AUDIT_NAMES.columns[entry.name])],
      [checks, names(ADMIN_BOARD_AUDIT_NAMES.constraints[entry.name])],
      [triggers, names(ADMIN_BOARD_AUDIT_NAMES.triggers[entry.name])],
    ]) {
      if (rows.some((row) => !isObject(row) || !allowed.includes(row.name)) || new Set(rows.map((row) => row.name)).size !== rows.length) throw new Error("EXEC_RESULT_INVALID");
    }
    return {
      ...base, kind: choice(entry.kind, ["r", "p"], "unknown"),
      rls: bool(entry.rls), forceRls: bool(entry.forceRls), ownedByCurrentRole: bool(entry.ownedByCurrentRole),
      effectivePrivileges: Object.fromEntries(["select", "insert", "update", "delete", "truncate"].map((key) => [key, bool(entry.effectivePrivileges?.[key])])),
      publicGrantCount: count(entry.publicGrantCount), otherRoleGrantCount: count(entry.otherRoleGrantCount),
      policyCount: count(entry.policyCount), publicPolicyCount: count(entry.publicPolicyCount),
      columns: columns.map((column) => column.present === false ? { name: column.name, present: false } : {
        name: column.name, present: bool(column.present),
        type: choice(column.type, ["text", "integer", "bigint", "jsonb", "uuid", "boolean", "timestamp with time zone", "timestamp without time zone"], "unknown"),
        notNull: bool(column.notNull), hasDefault: bool(column.hasDefault), publicGrantCount: count(column.publicGrantCount), otherRoleGrantCount: count(column.otherRoleGrantCount),
      }),
      unknownColumnCount: count(entry.unknownColumnCount),
      constraints: {
        count: count(entry.constraints.count), unvalidatedCount: count(entry.constraints.unvalidatedCount),
        typeCounts: Object.fromEntries(["c", "p", "f", "u", "x"].map((key) => [key, count(entry.constraints.typeCounts?.[key])])),
        required: checks.map((row) => ({ name: row.name, present: bool(row.present), validated: bool(row.validated) })),
      },
      triggers: {
        count: count(entry.triggers.count), unknownCount: count(entry.triggers.unknownCount),
        required: triggers.map((row) => ({ name: row.name, present: bool(row.present), enabled: choice(row.enabled, ["O", "D", "R", "A"]), expectedFunction: bool(row.expectedFunction) })),
      },
    };
  });
}

export function parseOnpodAuditResult(raw, expectedMigrations) {
  try {
    if (typeof raw !== "string" || Buffer.byteLength(raw) > MAX_OUTPUT_BYTES) throw new Error();
    const lines = raw.split(/\r?\n/u).filter((line) => line.startsWith(ONPOD_ADMIN_DB_AUDIT_PREFIX));
    if (lines.length !== 1) throw new Error();
    const value = JSON.parse(lines[0].slice(ONPOD_ADMIN_DB_AUDIT_PREFIX.length));
    if (!isObject(value) || value.schemaVersion !== 1 || value.mode !== "read-only" || !["ok", "blocked", "error"].includes(value.status)
      || (value.reason !== null && !DB_REASONS.has(value.reason))) throw new Error();
    if (value.status === "ok" && (value.reason !== null || value.database?.hostMatched !== true
      || value.database?.readOnly !== true || value.database?.rolledBack !== true || value.database?.connectionClosed !== true)) throw new Error();
    const report = { schemaVersion: 1, mode: "read-only", status: value.status, reason: value.reason };
    if (value.reason === "AUDIT_PAYLOAD_FAILED") return report;
    const ids = expectedMigrations.map(({ id }) => id);
    const ledgerIds = [...ids, MARKER_ID];
    const entries = list(value.migrations?.entries, ids.length + 1);
    const comparisons = list(value.migrations?.comparisons, ids.length);
    if (entries.some((entry) => !isObject(entry) || !ledgerIds.includes(entry.id)) || new Set(entries.map((entry) => entry.id)).size !== entries.length
      || comparisons.length !== ids.length || comparisons.some((entry, index) => entry?.id !== ids[index])) throw new Error();
    const tls = value.database?.tls;
    const role = value.database?.role;
    const ownership = list(value.ownership, 5);
    const ownershipNames = ["admin_workspace", "admin_business_plan", "admin_cloud_workboard", "admin_workspace_business_grant", "admin_business_plan_grant"];
    if (ownership.some((entry) => !isObject(entry) || !ownershipNames.includes(entry.name)) || new Set(ownership.map((entry) => entry.name)).size !== ownership.length) throw new Error();
    return {
      ...report, runtime: { imageSha: matching(value.runtime?.imageSha, SHA) },
      database: {
        hostMatched: bool(value.database?.hostMatched), readOnly: bool(value.database?.readOnly),
        rolledBack: bool(value.database?.rolledBack), connectionClosed: bool(value.database?.connectionClosed),
        tls: !isObject(tls) ? null : {
          enabled: bool(tls.enabled), authorized: bool(tls.authorized), protocol: choice(tls.protocol, ["TLSv1", "TLSv1.1", "TLSv1.2", "TLSv1.3"]),
          peerFingerprintSha256: matching(tls.peerFingerprintSha256, HASH), validFrom: timestamp(tls.validFrom), validTo: timestamp(tls.validTo),
          hostnameMatches: bool(tls.hostnameMatches), configuredMode: choice(tls.configuredMode, ["disable", "allow", "prefer", "require", "verify-ca", "verify-full", "no-verify", "default"], "unknown"),
          channelBindingEnforced: false, migrationTransportVerified: false,
          limitation: "EXISTING_RUNTIME_CONNECTION_ONLY_NOT_MIGRATION_TLS_PROOF",
        },
        role: !isObject(role) ? null : {
          ...Object.fromEntries(["superuser", "createDatabase", "createRole", "replication", "bypassRls", "canLogin", "ownsDatabase", "sessionMatches"].map((key) => [key, bool(role[key])])),
          membershipCount: count(role.membershipCount), configuredMode: choice(role.configuredMode, ["single-owner", "separated"], "unknown"),
        },
      },
      migrations: {
        ledgerExists: bool(value.migrations.ledgerExists), unknownRowsCount: count(value.migrations.unknownRowsCount),
        truncated: bool(value.migrations.truncated), orderValid: value.status === "ok" ? bool(value.migrations.orderValid) : null,
        integrity: value.status === "ok" ? choice(value.migrations.integrity, ["verified", "blocked"], "unknown") : "unknown",
        entries: entries.map((entry) => ({
          id: entry.id, checksum: matching(entry.checksum, HASH), state: choice(entry.state, ["applied", "applying", "failed"], "unknown"),
          provenance: choice(entry.provenance, ["adopted", "bootstrap", "executed"], "unknown"), releaseSha: matching(entry.releaseSha, SHA),
          startedAt: timestamp(entry.startedAt), appliedAt: timestamp(entry.appliedAt), updatedAt: timestamp(entry.updatedAt),
        })),
        comparisons: comparisons.map((entry) => ({ id: entry.id, status: value.status === "ok" ? choice(entry.status, ["applied", "pending", "checksum-drift", "incomplete"], "unknown") : "unknown" })),
      },
      durableLockCount: count(value.durableLockCount), catalog: projectCatalog(value.catalog),
      ownership: ownership.map((entry) => ({
        name: entry.name, status: choice(entry.status, ["observed"], "unknown"), rowCount: count(entry.rowCount),
        ...(entry.name.endsWith("_grant") ? { activeGrantCount: count(entry.activeGrantCount) } : { ownerCount: count(entry.ownerCount), dataRowCount: count(entry.dataRowCount) }),
      })),
    };
  } catch {
    throw new Error("EXEC_RESULT_INVALID");
  }
}

export async function inspectCloudflareMetadata(env, fetchImpl = fetch) {
  const configured = typeof env.CLOUDFLARE_API_TOKEN === "string" && env.CLOUDFLARE_API_TOKEN.trim().length > 0;
  const result = { tokenConfigured: configured, status: "not-configured", deploymentId: null, versionIds: [], releaseSha: null };
  if (!configured) return result;
  if (!/^[a-f0-9]{32}$/u.test(env.CLOUDFLARE_ACCOUNT_ID || "")) return { ...result, status: "account-unverified" };
  const base = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/toonspectrum-web`;
  try {
    const values = [];
    for (const suffix of ["deployments", "settings"]) {
      const response = await fetchImpl(`${base}/${suffix}`, {
        method: "GET", redirect: "error", signal: AbortSignal.timeout(10_000),
        headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
      });
      if (!response.ok) return { ...result, status: response.status === 401 || response.status === 403 ? "denied" : "unavailable" };
      const raw = await response.text();
      if (Buffer.byteLength(raw) > MAX_OUTPUT_BYTES) return { ...result, status: "unavailable" };
      const value = JSON.parse(raw);
      if (value.success !== true) return { ...result, status: "unavailable" };
      values.push(value.result);
    }
    const deployment = values[0]?.deployments?.[0];
    const versions = Array.isArray(deployment?.versions) ? deployment.versions.slice(0, 10) : [];
    const bindings = Array.isArray(values[1]?.bindings) ? values[1].bindings : [];
    return {
      ...result, status: "observed", deploymentId: matching(deployment?.id, UUID),
      versionIds: versions.map((version) => matching(version?.version_id, UUID)).filter(Boolean),
      releaseSha: matching(bindings.find((binding) => binding?.name === "RELEASE_SHA" && binding.type === "plain_text")?.text, SHA),
    };
  } catch {
    return { ...result, status: "unavailable" };
  }
}

export async function runOnpodAdminReadonlyAudit({
  env = process.env, argv = process.argv.slice(2), root = ROOT, spawnImpl = spawnSync, fetchImpl = fetch,
} = {}) {
  const report = {
    schemaVersion: 1, mode: "read-only", appName: ONPOD_AUDIT_APP, releaseSha: matching(env.RELEASE_SHA, SHA),
    status: "blocked", reason: null, app: null, appStatusFailure: null, audit: null, cloudflare: null,
  };
  try {
    if (argv.length !== 0 || env.GITHUB_EVENT_NAME !== "workflow_dispatch" || env.GITHUB_REF !== "refs/heads/main") throw new Error("MANUAL_MAIN_ONLY");
    if (!report.releaseSha || env.GITHUB_SHA !== report.releaseSha) throw new Error("RELEASE_SHA_MISMATCH");
    const gitEnv = childEnvironment(env);
    const head = command(spawnImpl, "git", ["rev-parse", "HEAD"], { root, env: gitEnv });
    if (head.status !== 0 || head.stdout.trim() !== report.releaseSha) throw new Error("RELEASE_SHA_MISMATCH");
    const clean = command(spawnImpl, "git", ["status", "--porcelain"], { root, env: gitEnv });
    if (clean.status !== 0 || clean.stdout.trim() !== "") throw new Error("DIRTY_CHECKOUT");
    const expectedMigrations = readAuditManifest(root);
    const payload = buildOnpodAdminDbAuditPayload({ expectedMigrations, expectedRelations: ADMIN_BOARD_RELATIONS });
    if (typeof payload !== "string" || Buffer.byteLength(payload) > 128 * 1024) throw new Error("PAYLOAD_INVALID");
    report.cloudflare = await inspectCloudflareMetadata(env, fetchImpl);
    if (typeof env.ONPOD_DEPLOY_TOKEN !== "string" || !/^opk_[^\s]{8,508}$/u.test(env.ONPOD_DEPLOY_TOKEN)) throw new Error("APP_TOKEN_UNAVAILABLE");
    const onpodEnv = childEnvironment(env, true);
    const status = command(spawnImpl, "onpod", ["app", "status", ONPOD_AUDIT_APP, "--json"], { root, env: onpodEnv });
    if (status.status !== 0) {
      report.appStatusFailure = projectCommandFailure(status);
      throw new Error("APP_STATUS_UNAVAILABLE");
    }
    report.app = parseOnpodAuditStatus(status.stdout);
    if (report.app.freeTier !== true) throw new Error("FREE_TIER_UNVERIFIED");
    if (report.app.state !== "running") throw new Error("APP_NOT_RUNNING");
    const executed = command(spawnImpl, "onpod", ["exec", ONPOD_AUDIT_APP, "--stdin", "--timeout", "40", "--", "node", "--max-old-space-size=64", "-"], {
      root, env: onpodEnv, input: payload, timeout: 60_000,
    });
    report.audit = parseOnpodAuditResult(executed.stdout, expectedMigrations);
    if (executed.status !== 0) {
      if (report.audit.status === "ok") {
        report.audit.status = "error";
        report.audit.reason = "EXEC_TRANSPORT_FAILED";
      }
      if (report.audit.migrations) {
        report.audit.migrations.integrity = "unknown";
        report.audit.migrations.orderValid = null;
        report.audit.migrations.comparisons = report.audit.migrations.comparisons.map(({ id }) => ({ id, status: "unknown" }));
      }
      throw new Error("EXEC_FAILED");
    }
    if (report.audit.status !== "ok") throw new Error("DATABASE_AUDIT_INCOMPLETE");
    report.status = "ok";
  } catch (error) {
    report.reason = AUDIT_REASONS.has(error?.message) ? error.message : "AUDIT_FAILED";
    report.status = ["EXEC_FAILED", "EXEC_RESULT_INVALID", "AUDIT_FAILED"].includes(report.reason) ? "error" : "blocked";
  }
  return report;
}

export function formatAuditSummary(report) {
  return [
    "## 관리자 보드 운영 읽기 전용 진단",
    "",
    `- 비교 main SHA: \`${report.releaseSha || "unknown"}\``,
    `- 진단 상태: \`${report.status}\` / \`${report.reason || "none"}\``,
    "- 출력은 앱 상태·원장·스키마·권한 메타데이터와 집계만 포함합니다. 원문 stdout/stderr는 저장하지 않습니다.",
    "- 진단 성공은 배포 완료 또는 migration 실행 승인이 아닙니다. pending과 unknown을 구분합니다.",
    "",
    "```json",
    JSON.stringify(report, null, 2),
    "```",
    "",
  ].join("\n");
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const report = await runOnpodAdminReadonlyAudit();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(process.env.GITHUB_STEP_SUMMARY, formatAuditSummary(report), "utf8"); }
    catch { process.stderr.write("관리자 보드 진단 요약 저장에 실패했습니다. 비밀값을 제외한 진단 JSON을 확인하세요.\n"); process.exitCode = 1; }
  }
  if (report.status !== "ok") {
    process.stderr.write("관리자 보드 진단이 완료되지 않았습니다. 요약의 고정 사유 코드를 확인하고 권한·연결·main SHA를 검토하세요.\n");
    process.exitCode = 1;
  }
}
