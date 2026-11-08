import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";

import { createMigrationPsqlEnvironment, createProductionMigrationConnection, isDisposableMigrationConnection, validatePublicCaFile } from "./production-database-connection.mjs";
import { createStudioReviewQaCertificates } from "./studio-review-local-storage-runtime.mjs";

const fixtures = [];
const production = "postgresql://fixture:fixture@db.example.com:5432/fixture?sslmode=verify-full&channel_binding=require";
const loopback = "postgresql://fixture:fixture@127.0.0.1:55464/fixture?sslmode=verify-full&channel_binding=require";

function caFile() {
  const directory = mkdtempSync(join(tmpdir(), "toonstudio-public-ca-"));
  fixtures.push(directory);
  const file = join(directory, "ca.crt");
  writeFileSync(file, readFileSync(new URL("../deploy/trust/supabase-prod-ca-2021.crt", import.meta.url)));
  return file;
}
afterEach(() => { for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true }); });

test("기본 production은 system trust와 verify-full/binding을 유지하고 상속 trust를 제거한다", () => {
  const context = createProductionMigrationConnection(production);
  const result = createMigrationPsqlEnvironment(context, { PGSSLROOTCERT: "/untrusted", SSL_CERT_FILE: "/untrusted", SSL_CERT_DIR: "/untrusted",
    PGHOST: "other.invalid", PGOPTIONS: "-c role=other", KEEP_TEST: "kept" });
  expect(result).toMatchObject({ PGSSLROOTCERT: "system", PGSSLMODE: "verify-full", PGCHANNELBINDING: "require", PGHOST: "db.example.com", KEEP_TEST: "kept" });
  expect(result).not.toHaveProperty("SSL_CERT_FILE");
  expect(result).not.toHaveProperty("SSL_CERT_DIR");
  expect(result).not.toHaveProperty("PGOPTIONS");
  expect(isDisposableMigrationConnection(context)).toBe(false);
  expect(isDisposableMigrationConnection(createProductionMigrationConnection(production, { allowLoopback: true }))).toBe(false);
});

test("새 explicit CA context는 disposable loopback에서도 실제 verify-full과 binding을 강제한다", () => {
  const file = caFile();
  const result = createMigrationPsqlEnvironment(createProductionMigrationConnection(loopback, { allowLoopback: true, publicCaFile: file }));
  expect(result).toMatchObject({ PGSSLMODE: "verify-full", PGCHANNELBINDING: "require", PGSSLROOTCERT: file, PGHOST: "127.0.0.1" });
  expect(() => createProductionMigrationConnection(loopback, { publicCaFile: file })).toThrow(/loopback/u);
  expect(isDisposableMigrationConnection(createProductionMigrationConnection(loopback, { allowLoopback: true, publicCaFile: file }))).toBe(true);
});

test("유효한 CA는 허용하고 그 CA가 발급한 CA:FALSE 서버 인증서는 공개 CA로 거절한다", async () => {
  const directory = await createStudioReviewQaCertificates();
  fixtures.push(directory);
  const ca = join(directory, "ca.crt");
  const leaf = join(directory, "public.crt");
  expect(() => createProductionMigrationConnection(production, { publicCaFile: ca })).not.toThrow();
  expect(() => createProductionMigrationConnection(production, { publicCaFile: leaf })).toThrow(/CA 제약/u);
});

test("CA 없는 기존 loopback 테스트 예외와 production query allowlist는 그대로다", () => {
  expect(createMigrationPsqlEnvironment(createProductionMigrationConnection("postgresql://fixture:fixture@localhost:55464/fixture",
    { allowLoopback: true }))).toMatchObject({ PGSSLMODE: "disable", PGCHANNELBINDING: "disable" });
  expect(() => createProductionMigrationConnection(production + "&sslrootcert=/untrusted")).toThrow(/not allowed/u);
  const file = caFile();
  expect(() => createProductionMigrationConnection("postgresql://fixture:fixture@localhost:55464/fixture",
    { allowLoopback: true, publicCaFile: file })).toThrow(/verify-full/u);
});

test("상대경로·없는 파일·디렉터리·symlink·private key·비인증서를 거절하고 입력값을 오류에 노출하지 않는다", () => {
  const file = caFile();
  for (const path of ["relative.crt", resolve(file, "missing"), resolve(file, "..")]) expect(() => validatePublicCaFile(path)).toThrow();
  const alias = file + ".link";
  symlinkSync(file, alias);
  expect(() => validatePublicCaFile(alias)).toThrow();
  for (const source of ["not a certificate", "-----BEGIN PRIVATE KEY-----\nfixture-only\n-----END PRIVATE KEY-----", "-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----"]) {
    writeFileSync(file, source);
    expect(() => validatePublicCaFile(file)).toThrow();
    try { validatePublicCaFile(file); } catch (error) { expect(error.message).not.toContain(source); expect(error.message).not.toContain(file); }
  }
});

test("CA 본문 변경과 가짜 context는 다음 psql 실행 전에 거절한다", () => {
  const file = caFile();
  const context = createProductionMigrationConnection(production, { publicCaFile: file });
  writeFileSync(file, readFileSync(file, "utf8") + "\n");
  expect(() => createMigrationPsqlEnvironment(context)).toThrow(/변경/u);
  expect(() => createMigrationPsqlEnvironment({ databaseUrl: production, publicCaFile: file })).toThrow(/context/u);
});
