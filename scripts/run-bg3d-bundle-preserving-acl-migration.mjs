#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  acquireRunnerLock, buildMigrationLedgerRuntimeAclViolationSql, claimMigration, ledgerExists,
  loadMigrationManifest, markMigrationApplied, markMigrationFailed, psql, queryScalar,
  readLedger, releaseRunnerLock, requireMigrationRoleSeparation, requireProvisionedBase, validateRuntimeDatabaseRole,
} from "./run-production-database-migrations.mjs";
import {
  BG3D_MIGRATION_ID, buildBg3dDefaultAclSafetySql, buildBg3dObjectStateSql,
  buildExistingAuthorizationFingerprintSql, buildExistingLedgerSafetySql,
  buildSingleOwnerVerificationSql, planBg3dPreservingAclMigration, validateBg3dObjectState,
} from "./bg3d-preserving-acl-contract.mjs";
import { buildBg3dBundleRuntimeAclSql, buildBg3dBundleRuntimeAclViolationSql } from "./studio-bg3d-bundle-runtime-acl.mjs";
import { createProductionMigrationConnection, isDisposableMigrationConnection } from "./production-database-connection.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APPLY_CONFIRMATION = "APPLY-TOONSPECTRUM-PRODUCTION-MIGRATIONS";
// 다른 역할의 backend_type은 NULL일 수 있으므로 종류를 확인할 수 없는 세션도 거절한다.
export const BG3D_OTHER_CLIENTS_SQL = "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND (backend_type='client backend' OR backend_type IS NULL);";

export function validateBg3dMigrationOptions(options) {
  if (!["plan", "apply"].includes(options.mode)) throw new Error("0121 보존 경로는 plan 또는 apply만 허용합니다.");
  if (!/^[a-f0-9]{40}$/u.test(options.releaseSha)) throw new Error("정확한 40자리 release SHA가 필요합니다.");
  validateRuntimeDatabaseRole(options.runtimeDatabaseRole);
  if (!["separated", "single-owner"].includes(options.runtimeRoleMode)) throw new Error("기존 runtime 역할 모드를 명시해야 합니다.");
  if (options.mode === "apply" && (options.confirmation !== APPLY_CONFIRMATION
    || options.writerStateConfirmation !== "NO-STUDIO-WRITERS")) {
    throw new Error("실제 Studio writer를 drain한 후 apply 확인과 NO-STUDIO-WRITERS를 명시해야 합니다.");
  }
}

function verifyReleaseProvenance(releaseSha, connection) {
  const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (git("rev-parse", "HEAD") !== releaseSha) throw new Error("체크아웃 HEAD와 승인 release SHA가 다릅니다.");
  if (!isDisposableMigrationConnection(connection) && git("status", "--porcelain", "--untracked-files=all")) {
    throw new Error("운영 적용은 변경 없는 정확한 승인 checkout에서만 실행해야 합니다.");
  }
  try {
    git("show-ref", "--verify", "--quiet", "refs/remotes/origin/main");
    git("merge-base", "--is-ancestor", releaseSha, "refs/remotes/origin/main");
  } catch {
    throw new Error("승인 SHA가 origin/main의 검토된 이력에 포함되지 않습니다.");
  }
}

function requireTrue(connection, sql, message) {
  if (queryScalar(connection, sql) !== "t") throw new Error(message);
}

function requireNoOtherClients(connection) {
  if (queryScalar(connection, BG3D_OTHER_CLIENTS_SQL) !== "0") {
    throw new Error("다른 DB client가 연결되어 있어 Studio writer drain 확인을 수용할 수 없습니다.");
  }
}

function preflight(connection, options, manifest) {
  if (options.runtimeRoleMode === "separated") requireMigrationRoleSeparation(connection, options.runtimeDatabaseRole);
  else requireTrue(connection, buildSingleOwnerVerificationSql(options.runtimeDatabaseRole), "기존 단일 소유자 역할의 비승격 경계가 일치하지 않습니다.");
  requireProvisionedBase(connection);
  if (!ledgerExists(connection)) throw new Error("기존 정본 원장이 없어 0121 보존 경로를 실행할 수 없습니다.");
  requireTrue(connection, buildExistingLedgerSafetySql(), "기존 migration 원장이 PUBLIC에 노출돼 있어 보존 적용을 거절합니다.");
  if (options.runtimeRoleMode === "separated") {
    requireTrue(connection, "SELECT NOT " + buildMigrationLedgerRuntimeAclViolationSql(options.runtimeDatabaseRole) + ";",
      "기존 runtime 역할이 원장에 접근할 수 있어 적용을 거절합니다.");
  }
  const ledger = readLedger(connection);
  const plan = planBg3dPreservingAclMigration(manifest, ledger);
  validateBg3dObjectState(JSON.parse(queryScalar(connection, buildBg3dObjectStateSql())), plan.pending);
  requireTrue(connection, buildBg3dDefaultAclSafetySql(options.runtimeDatabaseRole), "기존 default ACL이 새 private 객체에 제삼자 권한을 부여하므로 적용을 거절합니다.");
  return plan;
}

function verifyNewAcl(connection, options) {
  if (options.runtimeRoleMode === "separated") {
    requireTrue(connection, "SELECT NOT " + buildBg3dBundleRuntimeAclViolationSql(options.runtimeDatabaseRole) + ";", "신규 6패스 runtime 최소 권한 검증에 실패했습니다.");
    return;
  }
  requireTrue(connection, `WITH contract AS (
    SELECT c.oid,c.relowner,c.relacl,t.mutable FROM (VALUES
      ('studio_bg3d_bundle_revision',ARRAY['state','sealedAt']::text[]),
      ('studio_bg3d_bundle_artifact',ARRAY[]::text[])) t(name,mutable)
      JOIN pg_class c ON c.oid=format('public.%I',t.name)::regclass
  ) SELECT NOT EXISTS (
    SELECT 1 FROM contract c WHERE c.relowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)
      OR NOT EXISTS (SELECT 1 FROM aclexplode(c.relacl) a WHERE a.grantee=c.relowner AND a.privilege_type='SELECT')
      OR EXISTS (SELECT 1 FROM aclexplode(c.relacl) a WHERE a.grantee<>c.relowner OR a.privilege_type<>'SELECT' OR a.is_grantable)
      OR EXISTS (SELECT 1 FROM pg_attribute col WHERE col.attrelid=c.oid AND col.attnum>0 AND NOT col.attisdropped AND (
        NOT EXISTS (SELECT 1 FROM aclexplode(col.attacl) a WHERE a.grantee=c.relowner AND a.privilege_type='INSERT')
        OR EXISTS (SELECT 1 FROM aclexplode(col.attacl) a WHERE a.grantee<>c.relowner OR a.is_grantable
          OR a.privilege_type NOT IN ('INSERT','UPDATE') OR (a.privilege_type='UPDATE' AND NOT col.attname=ANY(c.mutable)))
        OR (col.attname=ANY(c.mutable)) IS DISTINCT FROM EXISTS
          (SELECT 1 FROM aclexplode(col.attacl) a WHERE a.grantee=c.relowner AND a.privilege_type='UPDATE')
      ))
  );`, "신규 6패스의 명시적 단일 소유자 ACL이 정본 최소 계약과 다릅니다.");
}

/** 원문 SQL·정본 원장 프로토콜을 재사용하고 기존 권한을 재조정하지 않는 0121 전용 경계다. */
export function runBg3dPreservingAclMigration(options) {
  validateBg3dMigrationOptions(options);
  const connection = createProductionMigrationConnection(options.databaseUrl, options);
  verifyReleaseProvenance(options.releaseSha, connection);
  const manifest = loadMigrationManifest();
  const initial = preflight(connection, options, manifest);
  const beforeAcl = queryScalar(connection, buildExistingAuthorizationFingerprintSql());
  if (options.mode === "plan") return { migration: BG3D_MIGRATION_ID, pending: initial.pending, skipped: initial.skipped, existingAclSha256: beforeAcl, writes: false };
  requireNoOtherClients(connection);
  let ownerToken;
  let claimed = false;
  try {
    ownerToken = acquireRunnerLock(connection, options.releaseSha, "apply", "");
    const plan = preflight(connection, options, manifest);
    requireNoOtherClients(connection);
    if (plan.pending) {
      claimMigration(connection, plan.migration, options.releaseSha, "apply");
      claimed = true;
      psql(connection, plan.migration.contents);
      psql(connection, "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';\n"
        + buildBg3dBundleRuntimeAclSql(options.runtimeDatabaseRole) + "\nCOMMIT;");
    }
    verifyNewAcl(connection, options);
    const afterAcl = queryScalar(connection, buildExistingAuthorizationFingerprintSql());
    if (beforeAcl !== afterAcl) throw new Error("기존 ACL·역할·소유권 지문이 변경되어 원장 완료를 거절합니다.");
    if (claimed) markMigrationApplied(connection, plan.migration, options.releaseSha);
    return { migration: BG3D_MIGRATION_ID, applied: plan.pending ? 1 : 0, skipped: plan.skipped, existingAclSha256: afterAcl, existingAclPreserved: true };
  } catch (error) {
    if (claimed) markMigrationFailed(connection, initial.migration, options.releaseSha);
    throw error;
  } finally {
    if (ownerToken) releaseRunnerLock(connection, ownerToken);
  }
}

export function parseBg3dMigrationArguments(argv) {
  const result = {};
  const keys = { "--mode": "mode", "--release-sha": "releaseSha", "--runtime-database-role": "runtimeDatabaseRole",
    "--runtime-role-mode": "runtimeRoleMode", "--confirmation": "confirmation", "--writer-state-confirmation": "writerStateConfirmation",
    "--public-ca-file": "publicCaFile" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const key = argument === "--allow-loopback" ? "allowLoopback" : Object.hasOwn(keys, argument) ? keys[argument] : undefined;
    if (!key || Object.hasOwn(result, key)) throw new Error("알 수 없거나 중복된 0121 migration 인자입니다.");
    if (key === "allowLoopback") result[key] = true;
    else {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("0121 migration 인자 값이 필요합니다.");
      result[key] = value;
      index += 1;
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseBg3dMigrationArguments(process.argv.slice(2));
    console.log(JSON.stringify(runBg3dPreservingAclMigration({
      ...options, databaseUrl: process.env.MIGRATION_DATABASE_URL ?? process.env.PRODUCTION_DATABASE_DIRECT_URL,
    })));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "0121 보존 migration 실행에 실패했습니다.");
    process.exitCode = 1;
  }
}
