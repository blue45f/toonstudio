import { createHash } from "node:crypto";
import { expect, test } from "vitest";

import {
  BG3D_MIGRATION_ID, buildExistingAuthorizationFingerprintSql, buildSingleOwnerVerificationSql,
  planBg3dPreservingAclMigration, validateBg3dObjectState,
} from "./bg3d-preserving-acl-contract.mjs";
import { loadMigrationManifest } from "./run-production-database-migrations.mjs";
import { parseBg3dMigrationArguments, runBg3dPreservingAclMigration, validateBg3dMigrationOptions } from "./run-bg3d-bundle-preserving-acl-migration.mjs";

const releaseSha = "534ee5b18549d154753767e402f8389ff2a96216";
const manifest = loadMigrationManifest();
const options = { mode: "apply", releaseSha, runtimeDatabaseRole: "app_runtime", runtimeRoleMode: "separated",
  confirmation: "APPLY-TOONSPECTRUM-PRODUCTION-MIGRATIONS", writerStateConfirmation: "NO-STUDIO-WRITERS" };

function baseline() {
  const ledger = new Map(manifest.slice(0, -1).map((m) => [m.id, { id: m.id, checksum: m.checksum, state: "applied",
    provenance: m.sequence <= 19 ? "adopted" : m.sequence === 23 ? "bootstrap" : "executed", releaseSha }]));
  ledger.set("__managed_history_through_0019__", {
    checksum: createHash("sha256").update(manifest.filter((m) => m.sequence <= 19).map((m) => m.id + ":" + m.checksum + "\n").join("")).digest("hex"),
    state: "applied", provenance: "adopted", releaseSha,
  });
  return ledger;
}

test("실제 파일 120개 이력에서 0121 하나만 적용하고 완료 후 전부 checksum skip한다", () => {
  const ledger = baseline();
  expect(planBg3dPreservingAclMigration(manifest, ledger)).toMatchObject({ pending: true, skipped: 120, migration: { id: BG3D_MIGRATION_ID } });
  ledger.set(BG3D_MIGRATION_ID, { ...manifest.at(-1), state: "applied", provenance: "executed", releaseSha });
  expect(planBg3dPreservingAclMigration(manifest, ledger)).toMatchObject({ pending: false, skipped: 121 });
});

test.each([
  ["checksum", (ledger) => { ledger.get(manifest[30].id).checksum = "0".repeat(64); }],
  ["provenance", (ledger) => { ledger.get(manifest[30].id).provenance = "adopted"; }],
  ["failed", (ledger) => { ledger.get(manifest[30].id).state = "failed"; }],
  ["applying", (ledger) => { ledger.get(manifest[30].id).state = "applying"; }],
  ["marker", (ledger) => { ledger.delete("__managed_history_through_0019__"); }],
  ["다른 pending", (ledger) => { ledger.delete(manifest[119].id); }],
  ["원장 밖 항목", (ledger) => { ledger.set("0122_unreviewed", { releaseSha }); }],
  ["release 출처", (ledger) => { ledger.get(manifest[30].id).releaseSha = "unknown"; }],
])("%s 불일치는 새 DDL 전에 fail-closed한다", (_label, mutate) => {
  const ledger = baseline();
  mutate(ledger);
  expect(() => planBg3dPreservingAclMigration(manifest, ledger)).toThrow();
});

test("원문0121을 수정하거나 향후 일반 migration에 보존 경계를 재사용할 수 없다", () => {
  expect(() => planBg3dPreservingAclMigration([...manifest.slice(0, -1), { ...manifest.at(-1), checksum: "f".repeat(64) }], baseline())).toThrow(/0121/u);
  expect(() => planBg3dPreservingAclMigration([...manifest, { id: "0122_future" }], baseline())).toThrow(/0121/u);
});

test.each(["adopt", "repair", "reset"])("%s 실행과 writer 확인 생략을 거절한다", (mode) => {
  expect(() => validateBg3dMigrationOptions({ ...options, mode })).toThrow();
  expect(() => runBg3dPreservingAclMigration({ ...options, writerStateConfirmation: undefined })).toThrow(/writer/u);
});

test("plan은 writer 확인을 합성하지 않고 단일 소유자도 명시적으로 선택한다", () => {
  expect(() => validateBg3dMigrationOptions({ ...options, mode: "plan", writerStateConfirmation: undefined })).not.toThrow();
  expect(() => validateBg3dMigrationOptions({ ...options, runtimeRoleMode: undefined })).toThrow();
  expect(buildSingleOwnerVerificationSql("app_runtime")).toContain("session_user = current_user");
  for (const flag of ["rolsuper", "rolcreatedb", "rolcreaterole", "rolreplication", "rolbypassrls"]) {
    expect(buildSingleOwnerVerificationSql("app_runtime")).toContain(flag);
  }
});

test("원장과 신규 두 표/함수의 불일치를 자동복구하지 않는다", () => {
  expect(() => validateBg3dObjectState({ tables: 1, guard: false }, true)).toThrow();
  expect(() => validateBg3dObjectState({ tables: 2, guard: true }, true)).toThrow();
  expect(() => validateBg3dObjectState({ tables: 0, guard: false }, false)).toThrow();
  expect(() => validateBg3dObjectState({ tables: 0, guard: false }, true)).not.toThrow();
  expect(() => validateBg3dObjectState({ tables: 2, guard: true }, false)).not.toThrow();
});

test("기존 권한 지문에는 namespace/열/RLS/역할/멤버십/default ACL이 포함되고 기존표 ACL setter는 없다", () => {
  const sql = buildExistingAuthorizationFingerprintSql();
  for (const item of ["pg_namespace", "pg_attribute", "pg_policy", "pg_roles", "pg_auth_members", "pg_default_acl", "datacl"]) expect(sql).toContain(item);
  expect(sql).not.toMatch(/\b(?:GRANT|REVOKE|UPDATE|DELETE|INSERT|CREATE|ALTER)\b/u);
});

test("CLI는 explicit CA·writer 확인만 파싱하며 기존 일반 runner의 bypass 인자를 받지 않는다", () => {
  expect(parseBg3dMigrationArguments(["--mode", "plan", "--public-ca-file", "/fixture/ca.crt", "--allow-loopback"])).toEqual({
    mode: "plan", publicCaFile: "/fixture/ca.crt", allowLoopback: true,
  });
  for (const argv of [["toString", "x"], ["constructor", "x"], ["--skip-acl"], ["--stale-lock-owner-token", "x"], ["--mode", "apply", "--mode", "apply"], ["--public-ca-file"]]) {
    expect(() => parseBg3dMigrationArguments(argv)).toThrow();
  }
});
