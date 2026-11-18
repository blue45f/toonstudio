#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";
import { validatePostgresIntegrationUrl } from "./run-postgres-integration-tests.mjs";

// Only a newly provisioned disposable loopback database. Never inherit DATABASE_URL or .env.
const value = process.env.TEST_DATABASE_URL?.trim();
assert(value, "TEST_DATABASE_URL must identify a fresh disposable review test database");
validatePostgresIntegrationUrl(value, { environment: { NODE_ENV: "test" } });
const url = new URL(value);
assert(["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname), "Review schema preparation is loopback-only");
assert(/(?:^|[_-])(?:test|integration)(?:$|[_-])/u.test(url.pathname.slice(1)), "The database name must identify a disposable test target");
const pool = new pg.Pool({ connectionString: value, application_name: "studio-review-test-schema" });
try {
  const tables = await pool.query("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'");
  assert.equal(tables.rows[0].count, 0, "Schema preparation requires an empty test database; existing data is never reset");
  // CI의 일회성 PG 안에서만 생성한다. 실제 최소 테이블 권한은 격리된 테스트 스키마에 한정한다.
  const workspaceRuntimeRole = process.env.ADMIN_WORKSPACE_TEST_RUNTIME_ROLE?.trim();
  if (workspaceRuntimeRole) {
    assert.match(workspaceRuntimeRole, /^[a-z_][a-z0-9_]{0,62}$/u, "안전한 테스트 runtime 역할 이름이 필요합니다.");
    assert(![url.username, "public", "postgres", "anon", "authenticated"].includes(workspaceRuntimeRole) && !workspaceRuntimeRole.startsWith("pg_"), "테스트 runtime은 DB 소유자·내장 역할과 분리해야 합니다.");
    await pool.query(`CREATE ROLE "${workspaceRuntimeRole}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
  }
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  const { stdout, stderr } = await promisify(execFile)("pnpm", ["db:push"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: { ...process.env, DATABASE_URL: value, NODE_ENV: "test" },
    maxBuffer: 8 * 1024 * 1024,
  });
  // Drizzle can log an SQL error while exiting zero. Require its positive completion receipt.
  assert(/Changes applied/u.test(stdout) && !/\berror:/iu.test(stdout + stderr), "Drizzle did not confirm a successful test schema application");
  for (const migration of [
    "0009_socket_io_postgres_adapter.sql",
    "0013_creator_asset_marketplace.sql",
    "0017_creator_work_live_lock_revision.sql",
    "0018_studio_ai_request_gate.sql",
    "0019_studio_ai_request_receipt.sql",
    "0060_studio_ai_free_provider_expansion.sql",
    "0064_studio_project_graph_v3.sql",
    "0067_creator_role_workspace_personalization.sql",
    "0077_membership_operations.sql",
    "0082_studio_review_policy.sql",
    "0083_studio_review_vote_epoch.sql",
    "0086_production_operation_policy.sql",
    "0087_studio_pinned_review_share.sql",
    "0088_studio_review_delivery.sql",
    "0090_studio_review_voice_note.sql",
    "0091_creator_work_publication_media.sql",
    "0093_review_voice_note_constraints_repair.sql",
    "0116_studio_review_comment_pen_strokes.sql",
    "0117_studio_scoped_write_policy.sql",
    "0119_studio_review_voice_note_guard_schema.sql",
    "0121_studio_bg3d_six_pass_bundle.sql",
    "0122_admin_workspace.sql",
    "0123_admin_business_plan.sql",
    "0124_admin_nestjs_quality.sql",
    "0125_admin_cloud_workboard.sql",
    "0126_admin_ai_operations.sql",
    "0127_admin_workspace_access.sql",
    "0128_admin_business_plan_access.sql",
  ]) {
    await pool.query(await readFile(new URL(`../apps/api/src/platform/database/migrations/${migration}`, import.meta.url), "utf8"));
  }
  // Drizzle가 만들지 않는 불변 이력 트리거와 소유권 FK를 실제 public 스키마에서 확인한다.
  const adminGuards = [
    ["admin_business_plan", "admin_business_plan_delete_guard", 11, "admin_business_plan_immutable_guard"],
    ["admin_business_plan_revision", "admin_business_plan_revision_immutable", 27, "admin_business_plan_immutable_guard"],
    ["admin_business_plan_audit", "admin_business_plan_audit_immutable", 27, "admin_business_plan_immutable_guard"],
    ["admin_business_plan_receipt", "admin_business_plan_receipt_immutable", 27, "admin_business_plan_immutable_guard"],
    ["admin_business_plan", "admin_business_plan_truncate_guard", 34, "admin_business_plan_immutable_guard"],
    ["admin_business_plan_revision", "admin_business_plan_revision_truncate_guard", 34, "admin_business_plan_immutable_guard"],
    ["admin_business_plan_audit", "admin_business_plan_audit_truncate_guard", 34, "admin_business_plan_immutable_guard"],
    ["admin_business_plan_receipt", "admin_business_plan_receipt_truncate_guard", 34, "admin_business_plan_immutable_guard"],
    ["admin_business_plan_access_audit", "admin_business_plan_access_audit_immutable", 27, "admin_business_plan_immutable_guard"],
    ["admin_business_plan_access_audit", "admin_business_plan_access_audit_truncate_guard", 34, "admin_business_plan_immutable_guard"],
    ["admin_nestjs_quality_history", "admin_nestjs_quality_history_immutable", 27, "admin_nestjs_quality_history_immutable"],
  ];
  const adminTriggers = await pool.query(`
    SELECT relation.relname, trigger_record.tgname, trigger_record.tgtype, function_record.proname
    FROM pg_catalog.pg_trigger trigger_record
    JOIN pg_catalog.pg_class relation ON relation.oid=trigger_record.tgrelid
    JOIN pg_catalog.pg_namespace relation_schema ON relation_schema.oid=relation.relnamespace
    JOIN pg_catalog.pg_proc function_record ON function_record.oid=trigger_record.tgfoid
    JOIN pg_catalog.pg_namespace function_schema ON function_schema.oid=function_record.pronamespace
    WHERE relation_schema.nspname='public' AND function_schema.nspname='public'
      AND NOT trigger_record.tgisinternal AND trigger_record.tgenabled IN ('O','A')
      AND NOT function_record.prosecdef
  `);
  for (const [relation, trigger, type, fn] of adminGuards) {
    assert(adminTriggers.rows.some((row) => row.relname === relation && row.tgname === trigger
      && row.tgtype === type && row.proname === fn), `관리자 이력 보호가 없습니다: ${relation}.${trigger}`);
  }
  const ownerGuards = await pool.query(`
    SELECT relation.relname, attribute.attname
    FROM pg_catalog.pg_constraint constraint_record
    JOIN pg_catalog.pg_class relation ON relation.oid=constraint_record.conrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
    JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid=relation.oid
      AND constraint_record.conkey=ARRAY[attribute.attnum]
    JOIN pg_catalog.pg_attribute target ON target.attrelid=constraint_record.confrelid
      AND constraint_record.confkey=ARRAY[target.attnum]
    WHERE namespace.nspname='public' AND relation.relrowsecurity
      AND constraint_record.contype='f' AND constraint_record.confdeltype='r' AND constraint_record.convalidated
      AND NOT attribute.attnotnull AND NOT attribute.attisdropped
      AND target.attrelid='public."user"'::regclass AND target.attname='id' AND NOT target.attisdropped
  `);
  for (const [relation, column] of [["admin_workspace", "business_owner_user_id"], ["admin_business_plan", "owner_user_id"]]) {
    assert(ownerGuards.rows.some((row) => row.relname === relation && row.attname === column),
      `관리자 비공개 자료 소유권 보호가 없습니다: ${relation}.${column}`);
  }
  const triggers = await pool.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'studio_%'");
  for (const required of ["studio_revision_immutable_update", "studio_revision_topology_revision", "studio_revision_topology_parent", "studio_artifact_revision_pointer_check", "studio_review_snapshot_check", "studio_review_reviewer_check", "studio_review_comment_anchor_check", "studio_review_comment_strokes_check", "studio_review_policy_guard_trigger", "studio_review_policy_event_guard_trigger", "studio_review_group_approval_check", "studio_pinned_review_share_immutable_update", "studio_pinned_review_feedback_immutable_update", "studio_review_delivery_guard_update", "studio_review_delivery_event_immutable_update", "studio_review_voice_note_guard_update", "studio_bg3d_revision_guard", "studio_bg3d_artifact_guard"]) {
    assert(triggers.rows.some((row) => row.tgname === required), `Missing database invariant: ${required}`);
  }
  console.log(`Prepared fresh review test schema with ${triggers.rows.length} Studio invariant triggers.`);
} finally { await pool.end(); }
