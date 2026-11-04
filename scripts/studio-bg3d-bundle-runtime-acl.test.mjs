import { expect, test } from "vitest";
import { buildBg3dBundleRuntimeAclSql, buildBg3dBundleRuntimeAclViolationSql } from "./studio-bg3d-bundle-runtime-acl.mjs";
import { loadMigrationManifest } from "./run-production-database-migrations.mjs";

test("6패스 런타임은 manifest와 원본 삭제·수정을 허용하지 않는다", () => {
  const acl = buildBg3dBundleRuntimeAclSql("test_runtime");
  expect(acl).toContain('GRANT UPDATE (state, "sealedAt")');
  expect(acl).toContain('GRANT INSERT ("workId", "bundleId", "renderRevisionId"');
  expect(acl).not.toMatch(/GRANT[^;]*(?:DELETE|TRUNCATE|UPDATE\s+ON TABLE)/u);
  const violation = buildBg3dBundleRuntimeAclViolationSql("test_runtime");
  expect(violation).toContain("ARRAY['state','sealedAt']");
  expect(violation).toContain("has_column_privilege(0::oid");
  expect(() => buildBg3dBundleRuntimeAclSql('bad"; DROP ROLE x')).toThrow();
});

test("추가형 0121은 불변 원본·부모·일곱 역할을 DB에서도 보호하고 재실행 가능하다", () => {
  const migration = loadMigrationManifest().find((item) => item.id === "0121_studio_bg3d_six_pass_bundle");
  expect(migration).toBeDefined();
  expect(migration.contents).toContain("CREATE TABLE IF NOT EXISTS public.studio_bg3d_bundle_revision");
  expect(migration.contents).toContain("CREATE TABLE IF NOT EXISTS public.studio_bg3d_bundle_artifact");
  expect(migration.contents).toContain("IS DISTINCT FROM");
  expect(migration.contents).toContain('"parentRevisionId"');
  expect(migration.contents).toContain("requires scene and six artifacts");
  expect(migration.contents).not.toMatch(/ALTER TABLE creator_work\b|DROP TABLE|UPDATE creator_work\b/u);
});
