import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  REQUIRED_VITEST_TARGETS,
  CORE_DATABASE_VITEST_TARGETS,
  buildShardVitestArgs,
  SHARD_COMMANDS,
  SHARD_NAMES,
  assertShardManifest,
  compactTargets,
  executionTargetsByShard,
  expandGlobTargets,
  shardForTarget,
  targetIsCovered,
  targetsByShard,
} from "./ci-core-regression-shards.mjs";

import { resolveRequiredTargets } from "./run-core-vitest.mjs";
import { SERIAL_TEST_FILES } from "../vitest.serial-test-files.mjs";
import { sparsePatterns } from "./ci-checkout-test-helpers.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("required regression manifest remains sorted, unique and partitioned exactly once", () => {
  assert.doesNotThrow(() => assertShardManifest());
  assert.ok(REQUIRED_VITEST_TARGETS.length >= 160, "unexpected regression coverage shrink");
  assert.deepEqual(
    REQUIRED_VITEST_TARGETS,
    [...REQUIRED_VITEST_TARGETS].sort(),
  );
  assert.equal(new Set(REQUIRED_VITEST_TARGETS).size, REQUIRED_VITEST_TARGETS.length);

  const required = targetsByShard();
  const flattened = SHARD_NAMES.flatMap((name) => required[name]);
  assert.deepEqual(flattened.sort(), [...REQUIRED_VITEST_TARGETS].sort());
  assert.equal(new Set(flattened).size, flattened.length);
  assert.ok(SHARD_NAMES.every((name) => required[name].length > 0));
});

test("semantic sharding keeps expensive domains isolated", () => {
  const fixtures = new Map([
    ["apps/api/src/runtime/runtime-boundary.test.ts", "product"],
    ["packages/core/src/catalog/home.cpu-cache.test.ts", "product"],
    ["apps/web/src/domains/creator/assistant/webtoon-tension-map-docs.test.ts", "product"],
    ["apps/web/src/domains/creator/ecosystem/reader-feedback-docs.test.ts", "product"],
    // 기능 문서를 디스크에서 읽는 시험: 문서는 product 샤드에서만 내려받는다(나머지 샤드는 /docs/ 를 스파스 제외).
    // studio-foundation 에 두면 CI 에서만 ENOENT 로 터진다(2026-10-16 PR #2325).
    ["apps/web/src/domains/creator/charm/studio-charm-bar-host-contract.test.ts", "product"],
    ["apps/web/src/domains/learn/accessible-webtoon-guide-docs.test.ts", "product"],
    ["apps/web/src/domains/creator/studio-project-creation.test.ts", "studio-foundation"],
    ["apps/web/src/domains/creator/brush/StudioBrushTray.test.tsx", "studio-editing"],
    ["apps/web/src/domains/creator/live/studio-live-transform-draft-store.test.ts", "studio-editing"],
    ["apps/web/src/domains/creator/bg3d/studio-bg3d-camera-selection.test.ts", "studio-3d"],
    ["apps/web/src/domains/creator/vrm/studio-vrm-wardrobe.test.ts", "studio-character"],
    ["apps/web/src/domains/creator/character-shaper/character-shaper-export.test.ts", "studio-character"],
  ]);
  for (const [target, expected] of fixtures) {
    assert.equal(shardForTarget(target), expected, target);
  }
});

test("통합 테스트 위치를 허용하면서 경로 이탈과 명령 인자를 거부한다", () => {
  const targets = [
    ...REQUIRED_VITEST_TARGETS,
    "tests/integration/web-api/studio-history-regression.test.ts",
    "tests/unit/contracts/synthetic-contract.test.ts",
  ].sort();
  assert.doesNotThrow(() => assertShardManifest(targets));
  for (const unsafe of [
    "tests/integration/../../outside.test.ts",
    "tests/fixtures/ignored.test.ts",
    "tests/unit/other/case.test.ts",
    "tests/unit/contracts-sibling/case.test.ts",
    "tests/unit/contracts/../outside.test.ts",
    "--run",
    "tests/integration/case.test.ts;exit",
  ]) {
    assert.throws(() => assertShardManifest([...targets, unsafe].sort()), /Unsafe CI regression target/u);
  }
});

test("required foundation execution includes virtual-world consent, media and compiler integration regressions", () => {
  const foundation = executionTargetsByShard()["studio-foundation"];
  for (const target of [
    "apps/web/src/domains/creator/virtual-space",
    "apps/web/src/domains/creator/review-handoff",
    "apps/web/src/domains/creator/review-export",
    "apps/web/src/domains/creator/review-production",
    "apps/web/src/domains/creator/review-task-completion",
    "apps/web/src/domains/creator/review-resolution",
    "packages/studio-project-model/src/__tests__/review-task-role-assignment.test.ts",
    "packages/studio-project-model/src/__tests__/world-tilemap.test.ts",
    "apps/web/src/domains/creator/studio-comment-editor-selection.test.ts",
    "apps/web/src/domains/creator/live/huddle",
    "apps/web/tests/vite-react-compiler-runtime-interop.test.ts",
  ]) {
    assert.ok(REQUIRED_VITEST_TARGETS.includes(target), `missing protected regression target: ${target}`);
    assert.equal(shardForTarget(target), "studio-foundation", target);
    assert.ok(targetIsCovered(target, foundation), `target must execute in foundation: ${target}`);
  }
  for (const test of [
    "apps/web/src/domains/creator/review-handoff/studio-review-editor-host.test.ts",
    "apps/web/src/domains/creator/review-handoff/StudioReviewEditorHandoffMount.test.tsx",
    "apps/web/src/domains/creator/review-production/studio-review-production-controller.test.ts",
    "apps/web/src/domains/creator/review-production/StudioReviewProductionConnection.test.tsx",
    "apps/web/src/domains/creator/review-resolution/StudioReviewResolution.test.tsx",
    "apps/web/src/domains/creator/review-task-completion/StudioReviewTaskCompletion.test.tsx",
    "apps/web/src/domains/creator/review-task-completion/studio-review-task-completion-controller.test.ts",
    "apps/web/src/domains/creator/review-export/studio-review-export.test.ts",
    "apps/web/src/domains/creator/review-export/StudioReviewExport.test.tsx",
    "apps/web/src/domains/creator/virtual-space/studio-virtual-space-social.test.ts",
    "apps/web/src/domains/creator/virtual-space/studio-virtual-space-world.test.ts",
    "apps/web/src/domains/creator/virtual-space/studio-virtual-space-npc-director.test.ts",
    "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-controller.test.ts",
    "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-events.test.ts",
  ]) assert.ok(targetIsCovered(test, foundation), `required execution omitted ${test}`);
});

test("real product selectors partition into static and mandatory PostgreSQL execution without losing or duplicating a suite", () => {
  const selectors = expandGlobTargets(executionTargetsByShard().product);
  const all = resolveRequiredTargets(selectors);
  const args = buildShardVitestArgs(selectors);
  const routed = args.flatMap((arg, i) => arg === "--exclude" ? [args[i + 1]] : []);
  assert.deepEqual(routed, [...CORE_DATABASE_VITEST_TARGETS]);
  const staticOnly = all.filter((file) => !routed.includes(file));
  assert.ok(staticOnly.includes("apps/api/src/modules/studio-project-graph/studio-project-graph.module.test.ts"));
  assert.ok(staticOnly.includes("apps/api/src/modules/studio-project-graph/studio-review-preview-producer.service.test.ts"));
  assert.deepEqual([...staticOnly, ...routed].sort(), [...all].sort());
  assert.equal(new Set([...staticOnly, ...routed]).size, all.length);
  assert.ok(routed.every((file) => file.endsWith(".integration.test.ts")));
  for (const suite of [
    "apps/api/src/modules/admin-nestjs-quality/admin-nestjs-quality.integration.test.ts",
    "apps/api/src/modules/admin-workspace/admin-workspace.integration.test.ts",
    "apps/api/src/modules/business-plan/business-plan.integration.test.ts",
    "apps/api/src/modules/production-collaboration/production-auth-http.integration.test.ts",
    "apps/api/src/modules/studio-project-graph/studio-review-capture-source-revision.integration.test.ts",
    "apps/api/src/modules/studio-project-graph/studio-review-pen-comment.integration.test.ts",
  ]) {
    assert.ok(CORE_DATABASE_VITEST_TARGETS.includes(suite), `실제 DB 검증 소유 목록에서 누락: ${suite}`);
    assert.ok(routed.includes(suite), `DB 없는 product 실행에서 분리하지 않은 실제 DB 시험: ${suite}`);
    assert.ok(!staticOnly.includes(suite), `정적 시험에서 실제 DB 검증을 대신 실행할 수 없습니다: ${suite}`);
  }
  for (const name of SHARD_NAMES.filter((name) => name !== "product")) {
    assert.ok(!buildShardVitestArgs(expandGlobTargets(executionTargetsByShard()[name])).includes("--exclude"));
  }
});

test("NestJS 검증 보드는 정적 회귀와 보호된 PostgreSQL job에서 각각 정확히 한 번 실행한다", () => {
  const module = "apps/api/src/modules/admin-nestjs-quality";
  const integration = `${module}/admin-nestjs-quality.integration.test.ts`;
  assert.ok(REQUIRED_VITEST_TARGETS.includes(module), "새 관리자 API 회귀도 모듈 단위로 필수 수집해야 합니다.");
  assert.ok(REQUIRED_VITEST_TARGETS.includes("apps/admin-web/src/domains/operations/nestjs-quality"),
    "새 보드 UI 회귀도 기능 디렉터리 단위로 필수 수집해야 합니다.");
  const execution = executionTargetsByShard();
  const staticByShard = Object.fromEntries(SHARD_NAMES.map((name) => {
    const selectors = expandGlobTargets(execution[name]);
    const args = buildShardVitestArgs(selectors);
    const databaseOnly = args.flatMap((arg, index) => arg === "--exclude" ? [args[index + 1]] : []);
    return [name, resolveRequiredTargets(selectors).filter((target) => !databaseOnly.includes(target))];
  }));
  for (const target of [
    `${module}/admin-nestjs-quality.test.ts`,
    `${module}/admin-nestjs-quality.http.test.ts`,
    "packages/contracts/src/admin-nestjs-quality.test.ts",
    "scripts/admin-nestjs-quality-database-contract.test.mjs",
    "apps/admin-web/src/domains/operations/nestjs-quality/NestQualityBoard.test.tsx",
    "apps/admin-web/src/domains/operations/nestjs-quality/nestjs-quality-api.test.ts",
  ]) {
    assert.equal(shardForTarget(target), "product", target);
    assert.deepEqual(SHARD_NAMES.filter((name) => staticByShard[name].includes(target)), ["product"],
      `관리자 보드의 권한·입력·DB 계약 회귀는 소유 shard에서 한 번 실행해야 합니다: ${target}`);
  }
  assert.ok(CORE_DATABASE_VITEST_TARGETS.includes(integration), "보드의 실제 DB 검증 소유권이 필요합니다.");
  assert.ok(resolveRequiredTargets(expandGlobTargets(execution.product)).includes(integration));
  assert.ok(SHARD_NAMES.every((name) => !staticByShard[name].includes(integration)),
    "실제 DB 시험을 DB 없는 shard에서 skip 성공으로 집계할 수 없습니다.");
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const database = workflow.match(/^ {2}database:\n([\s\S]*?)(?=^ {2}core:\n)/mu)?.[1];
  assert.ok(database, "보호된 실제 PostgreSQL job이 필요합니다.");
  const command = database.match(/pnpm exec vitest run --no-file-parallelism\n((?: {10}[^\n]+\n)+)/u)?.[0];
  assert.ok(command, "실제 DB job의 Vitest 실행 명령이 필요합니다.");
  assert.equal(command.split(/\s+/u).filter((argument) => argument === integration).length, 1,
    "보드 통합 시험은 실제 DB 명령에서 정확히 한 번 실행해야 합니다.");
  const runner = readFileSync(new URL("./run-postgres-integration-tests.mjs", import.meta.url), "utf8");
  const manifest = runner.match(/export const POSTGRES_INTEGRATION_SUITES = Object\.freeze\(\[([\s\S]*?)\]\);/u)?.[1];
  assert.ok(manifest, "일반 PostgreSQL 실행기의 정본 목록이 필요합니다.");
  assert.equal(manifest.split(`"${integration}"`).length - 1, 1);
});

test("클라우드 보드의 계약·API·ACL은 product에서, 실제 DB는 보호된 PostgreSQL job에서 한 번 실행한다", () => {
  const execution = executionTargetsByShard();
  const staticByShard = Object.fromEntries(SHARD_NAMES.map((name) => {
    const selectors = expandGlobTargets(execution[name]);
    const args = buildShardVitestArgs(selectors);
    const databaseOnly = args.flatMap((arg, index) => arg === "--exclude" ? [args[index + 1]] : []);
    return [name, resolveRequiredTargets(selectors).filter((target) => !databaseOnly.includes(target))];
  }));
  for (const target of [
    "apps/api/src/modules/admin/admin-cloud-workboard.test.ts",
    "packages/contracts/src/admin-cloud-workboard.test.ts",
    "scripts/admin-database-contract.test.mjs",
  ]) {
    assert.ok(REQUIRED_VITEST_TARGETS.includes(target), `클라우드 보드 필수 정적 회귀 누락: ${target}`);
    assert.equal(shardForTarget(target), "product", target);
    assert.deepEqual(SHARD_NAMES.filter((name) => staticByShard[name].includes(target)), ["product"],
      `클라우드 보드 정적 회귀는 product에서 정확히 한 번 실행해야 합니다: ${target}`);
  }
  const integration = "apps/api/src/modules/admin/admin-cloud-workboard.integration.test.ts";
  assert.equal(CORE_DATABASE_VITEST_TARGETS.filter((target) => target === integration).length, 1);
  assert.ok(resolveRequiredTargets(expandGlobTargets(execution.product)).includes(integration));
  assert.ok(SHARD_NAMES.every((name) => !staticByShard[name].includes(integration)),
    "클라우드 보드의 실제 DB 검증을 정적 shard의 skip 성공으로 대체할 수 없습니다.");
});

test("원고 제출·귀속·승인과 잠금 회귀는 실제 product 선택에서 실행한다", () => {
  const selectors = expandGlobTargets(executionTargetsByShard().product);
  const executed = resolveRequiredTargets(selectors);
  const args = buildShardVitestArgs(selectors);
  const databaseOnly = args.flatMap((arg, index) => arg === "--exclude" ? [args[index + 1]] : []);
  for (const target of [
    "apps/api/src/modules/creator/studio-scoped-crdt-reference-sources.test.ts",
    "apps/api/src/modules/creator/studio-scoped-crdt-write.test.ts",
    "apps/api/src/modules/creator/studio-scoped-live-op-write.test.ts",
    "apps/api/src/modules/creator/studio-scoped-write-effects.test.ts",
    "apps/api/src/modules/creator/studio-scoped-write-input.test.ts",
    "apps/api/src/modules/creator/studio-scoped-write-purpose.test.ts",
    "apps/api/src/modules/creator/studio-scoped-write-replay.test.ts",
    "apps/api/src/modules/creator/studio-scoped-write-store.test.ts",
    "apps/api/src/modules/creator/studio-scoped-write.repository.test.ts",
    "apps/api/src/modules/creator/studio-writer-room-capture.repository.test.ts",
    "apps/api/src/modules/production-collaboration/production-approval-command.test.ts",
    "apps/api/src/modules/production-collaboration/production-review-policy-command.test.ts",
    "apps/api/src/modules/production-collaboration/production-review-policy-lanes.test.ts",
    "apps/api/src/modules/production-collaboration/production-stale-input-approval.test.ts",
    "apps/api/src/modules/production-collaboration/production-submission-command.test.ts",
    "apps/api/src/modules/production-collaboration/production-submission-flow.test.ts",
    "apps/api/src/modules/production-collaboration/production-submission.dto.test.ts",
    "apps/api/src/modules/production-collaboration/production-task-batch-concurrency.test.ts",
    "apps/api/src/modules/production-collaboration/production-task-output-repository.test.ts",
    "apps/api/src/modules/production-collaboration/production-task-output-source.test.ts",
    "apps/api/src/modules/studio-project-graph/studio-project-graph.dto.test.ts",
    "apps/api/src/modules/studio-project-graph/studio-review-capture-subject.test.ts",
    "apps/api/src/modules/studio-project-graph/studio-review-comment-store.test.ts",
    "apps/api/src/modules/studio-project-graph/studio-review-pen-strokes.migration.test.ts",
    "apps/api/src/modules/studio-project-graph/studio-review-source-map.test.ts",
    "packages/core/src/production/production.test.ts",
    "packages/core/src/production/review-policy.test.ts",
    "packages/core/src/production/role-workflow.test.ts",
    "packages/core/src/production/studio-revision-coverage.test.ts",
    "packages/core/src/production/studio-revision.test.ts",
    "packages/core/src/production/task-output.test.ts",
  ]) {
    assert.equal(shardForTarget(target), "product", target);
    assert.ok(executed.includes(target), `필수 원고 회귀를 실제 실행하지 않는 선택자: ${target}`);
    assert.ok(!databaseOnly.includes(target), `단위 회귀를 DB lane으로 제외할 수 없습니다: ${target}`);
  }
  const foundation = resolveRequiredTargets(expandGlobTargets(executionTargetsByShard()["studio-foundation"]));
  for (const target of ["packages/studio-project-model/src/__tests__/review-pen-storage.test.ts",
    "packages/studio-project-model/src/__tests__/review-pen.test.ts"]) {
    assert.ok(foundation.includes(target), `정본 펜 첨삭 계약의 필수 실행 누락: ${target}`);
  }
});

test("통합 관리자 보드의 API·공통 계약·화면 검증을 필수 product에서 실행한다", () => {
  for (const module of ["apps/api/src/modules/admin-workspace", "packages/contracts/src/admin-workspace", "apps/admin-web/src/domains/workspace"]) {
    assert.ok(REQUIRED_VITEST_TARGETS.includes(module), `새 기능 회귀를 자동 수집할 모듈 선택자 누락: ${module}`);
  }
  const selectors = expandGlobTargets(executionTargetsByShard().product);
  const executed = resolveRequiredTargets(selectors);
  const args = buildShardVitestArgs(selectors);
  const databaseOnly = args.flatMap((arg, index) => arg === "--exclude" ? [args[index + 1]] : []);
  for (const target of [
    "apps/api/src/modules/admin-workspace/admin-workspace.repository.test.ts",
    "apps/api/src/modules/admin-workspace/admin-workspace.module.test.ts",
    "packages/contracts/src/admin-workspace/admin-workspace.test.ts",
    "apps/admin-web/src/domains/workspace/AdminWorkspace.test.tsx",
    "apps/admin-web/src/domains/workspace/useAdminWorkspace.test.tsx",
    "apps/admin-web/src/domains/workspace/WorkspaceBackup.test.tsx",
    "apps/admin-web/src/app/shell/WorkspaceAccess.test.tsx",
    "apps/admin-web/src/platform/http/workspace-api.test.ts",
    "scripts/admin-workspace-database-contract.test.mjs",
    "scripts/admin-database-feature-contracts.test.mjs",
  ]) {
    assert.equal(shardForTarget(target), "product", target);
    assert.ok(executed.includes(target), `필수 관리자 보드 회귀 누락: ${target}`);
    assert.ok(!databaseOnly.includes(target), `정적 관리자 회귀를 DB lane으로 넘길 수 없습니다: ${target}`);
  }
});

test("AI 고객센터·사용자·관리자·권한 회귀는 필수 정적 실행과 실제 DB 실행에서 빠지거나 중복되지 않는다", () => {
  const execution = executionTargetsByShard();
  const staticByShard = Object.fromEntries(SHARD_NAMES.map((name) => {
    const selectors = expandGlobTargets(execution[name]);
    const args = buildShardVitestArgs(selectors);
    const databaseOnly = args.flatMap((arg, index) => arg === "--exclude" ? [args[index + 1]] : []);
    return [name, resolveRequiredTargets(selectors).filter((target) => !databaseOnly.includes(target))];
  }));
  for (const target of [
    "apps/api/src/modules/customer-support/customer-support-ai.service.test.ts",
    "apps/api/src/modules/customer-support/customer-support.service.test.ts",
    "apps/web/src/domains/legal/CustomerSupportChat.test.tsx",
    "apps/web/src/domains/legal/SupportPage.test.tsx",
    "apps/web/src/domains/admin/components/AdminBusinessInquiries.test.tsx",
    "scripts/customer-support-database-contract.test.mjs",
  ]) {
    const owner = shardForTarget(target);
    assert.deepEqual(SHARD_NAMES.filter((name) => staticByShard[name].includes(target)), [owner],
      `고객상담의 필수 정적 시험은 소유 shard에서 정확히 한 번 실행해야 합니다: ${target}`);
  }
  assert.ok(REQUIRED_VITEST_TARGETS.includes("apps/api/src/modules/customer-support"),
    "새 고객상담 API 회귀도 자동 포함되도록 모듈 전체를 선택해야 합니다.");
  const integration = "apps/api/src/modules/customer-support/customer-support.repository.integration.test.ts";
  assert.equal(shardForTarget(integration), "product");
  assert.ok(resolveRequiredTargets(expandGlobTargets(execution.product)).includes(integration),
    "실제 DB 시험도 API 모듈의 필수 회귀 범위에 포함해야 합니다.");
  assert.ok(CORE_DATABASE_VITEST_TARGETS.includes(integration));
  assert.ok(SHARD_NAMES.every((name) => !staticByShard[name].includes(integration)),
    "DB 없는 shard에서 통합 시험을 skip 성공으로 집계할 수 없습니다.");
  const databaseRunner = readFileSync(new URL("./run-postgres-integration-tests.mjs", import.meta.url), "utf8");
  const postgresManifest = databaseRunner.match(/export const POSTGRES_INTEGRATION_SUITES = Object\.freeze\(\[([\s\S]*?)\]\);/u)?.[1];
  assert.ok(postgresManifest, "실제 PostgreSQL 실행기의 내보낸 시험 목록을 확인해야 합니다.");
  assert.equal(postgresManifest.split(`"${integration}"`).length - 1, 1,
    "고객상담 통합 시험은 PostgreSQL 실행기가 정확히 한 번 소유해야 합니다.");
});

test("분석·분산 저장소의 비DB 테스트는 product shard에서 반드시 실행한다", () => {
  const selectors = expandGlobTargets(executionTargetsByShard().product);
  const executed = resolveRequiredTargets(selectors);
  for (const target of [
    "apps/api/src/config/env.test.ts",
    "apps/api/src/platform/federated-data-plane/federated-data-plane-routing.test.ts",
    "apps/api/src/platform/federated-data-plane/federated-data-plane.module.test.ts",
    "apps/api/src/modules/admin/admin-traffic-d1-query.test.ts",
    "apps/api/src/modules/admin/admin-traffic-query.test.ts",
    "apps/api/src/modules/admin/admin-traffic.service.test.ts",
    "apps/api/src/modules/health/health-analytics-readiness.test.ts",
    "apps/api/src/modules/traffic-analytics/traffic-analytics-d1.client.test.ts",
    "apps/api/src/modules/traffic-analytics/traffic-analytics-d1.repository.test.ts",
    "apps/api/src/modules/traffic-analytics/traffic-analytics-repository.provider.test.ts",
    "apps/api/src/modules/traffic-analytics/traffic-analytics-store.test.ts",
    "apps/api/src/modules/traffic-analytics/traffic-analytics.controller.test.ts",
    "apps/api/src/modules/traffic-analytics/traffic-analytics.service.test.ts",
    "apps/api/src/modules/traffic-analytics/traffic-analytics-share-contract.test.ts",
    "deploy/cloudflare-analytics/src/index.test.ts",
    "scripts/deploy-cloudflare-analytics.test.mjs",
    "scripts/free-database-federation.test.mjs",
    "scripts/prepare-managed-database-bootstrap.test.mjs",
    "scripts/provision-cloudflare-free-data-plane.test.mjs",
    "scripts/provision-gcp-free-data-plane.test.mjs",
  ]) {
    assert.ok(REQUIRED_VITEST_TARGETS.includes(target), `필수 회귀 목록 누락: ${target}`);
    assert.equal(shardForTarget(target), "product", target);
    assert.ok(executed.includes(target), `product 실행 목록 누락: ${target}`);
  }
  assert.ok(!executed.includes("apps/api/src/modules/traffic-analytics/traffic-analytics-parity.postgres.test.ts"),
    "opt-in PostgreSQL 비교는 비DB shard에서 실행하지 않는다");
});

test("세 관리자 보드의 정적 계약은 shard에 유지하고 저장 회귀는 필수 PostgreSQL 작업에서 각각 한 번 실행한다", () => {
  const product = expandGlobTargets(executionTargetsByShard().product);
  const resolved = resolveRequiredTargets(product);
  const args = buildShardVitestArgs(product);
  const excluded = args.flatMap((arg, index) => arg === "--exclude" ? [args[index + 1]] : []);
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const database = workflow.match(/\n {2}database:\n([\s\S]*?)\n {2}core:/u)?.[1];
  assert.ok(database, "필수 PostgreSQL 작업을 찾을 수 없습니다.");
  const databaseCommand = database.match(/pnpm exec vitest run --no-file-parallelism\n((?: {10}[^\n]+\n)+)/u)?.[0];
  assert.ok(databaseCommand, "실제 DB job의 Vitest 실행 명령이 필요합니다.");
  const databaseArguments = databaseCommand.split(/\s+/u);
  for (const { integration, unit, contract } of [
    {
      integration: "apps/api/src/modules/admin-nestjs-quality/admin-nestjs-quality.integration.test.ts",
      unit: "apps/api/src/modules/admin-nestjs-quality/admin-nestjs-quality.test.ts",
      contract: "packages/contracts/src/admin-nestjs-quality.test.ts",
    },
    {
      integration: "apps/api/src/modules/admin-workspace/admin-workspace.integration.test.ts",
      unit: "apps/api/src/modules/admin-workspace/admin-workspace.repository.test.ts",
      contract: "packages/contracts/src/admin-workspace/admin-workspace.test.ts",
    },
    {
      integration: "apps/api/src/modules/business-plan/business-plan.integration.test.ts",
      unit: "apps/api/src/modules/business-plan/business-plan.test.ts",
      contract: "packages/contracts/src/business-plan/business-plan.test.ts",
    },
  ]) {
    assert.ok(targetIsCovered(contract, REQUIRED_VITEST_TARGETS), `공유 계약의 필수 회귀 목록 누락: ${contract}`);
    const contractSelectors = expandGlobTargets(executionTargetsByShard()[shardForTarget(contract)]);
    const contractArgs = buildShardVitestArgs(contractSelectors);
    const contractExcludes = contractArgs.flatMap((arg, index) => arg === "--exclude" ? [contractArgs[index + 1]] : []);
    assert.ok(targetIsCovered(contract, contractSelectors), `공유 계약의 정적 실행 목록 누락: ${contract}`);
    assert.ok(!contractExcludes.includes(contract), `공유 계약을 DB lane으로 제외할 수 없습니다: ${contract}`);
    assert.ok(resolved.includes(unit), `단위 회귀의 필수 실행 누락: ${unit}`);
    assert.ok(resolved.includes(integration), `통합 회귀의 필수 실행 누락: ${integration}`);
    assert.ok(targetIsCovered(integration, REQUIRED_VITEST_TARGETS));
    assert.equal(CORE_DATABASE_VITEST_TARGETS.filter((target) => target === integration).length, 1);
    assert.equal(excluded.filter((target) => target === integration).length, 1,
      `DB 없는 실행에서 skip 성공으로 처리할 수 없습니다: ${integration}`);
    assert.ok(!excluded.includes(unit));
    assert.equal(databaseArguments.filter((argument) => argument === integration).length, 1,
      `필수 DB 작업에서 관리자 보드 회귀를 정확히 한 번 실행해야 합니다: ${integration}`);
  }
});

test("directory targets remove redundant child execution without reducing coverage", () => {
  const input = [
    "apps/web/src/domains/creator/export",
    "apps/web/src/domains/creator/export/studio-psd-adjustment-graph.test.ts",
    "apps/web/src/domains/creator/layer",
    "apps/web/src/domains/creator/brush/StudioBrushTray.test.tsx",
  ];
  const compacted = compactTargets(input);
  assert.deepEqual(compacted, [
    "apps/web/src/domains/creator/brush/StudioBrushTray.test.tsx",
    "apps/web/src/domains/creator/export",
    "apps/web/src/domains/creator/layer",
  ]);
  for (const target of input) assert.ok(targetIsCovered(target, compacted), target);

  const required = targetsByShard();
  const execution = executionTargetsByShard();
  for (const name of SHARD_NAMES) {
    assert.ok(execution[name].length <= required[name].length);
    for (const target of required[name]) {
      assert.ok(targetIsCovered(target, execution[name]), `${name}:${target}`);
    }
  }
});

test("glob targets expand before spawning Vitest without duplicating matches", () => {
  const patterns = [];
  const expanded = expandGlobTargets(
    [
      "apps/web/src/plain.test.ts",
      "apps/web/src/studio-*.test.ts",
      "apps/web/src/other-?.test.ts",
    ],
    {
      cwd: "/fixture",
      glob(pattern, options) {
        patterns.push([pattern, options.cwd]);
        if (pattern.includes("studio-")) {
          return [
            "apps/web/src/studio-b.test.ts",
            "apps/web/src/studio-a.test.ts",
          ];
        }
        return [
          "apps/web/src/other-a.test.ts",
          "apps/web/src/studio-a.test.ts",
        ];
      },
    },
  );

  assert.deepEqual(patterns, [
    ["apps/web/src/studio-*.test.ts", "/fixture"],
    ["apps/web/src/other-?.test.ts", "/fixture"],
  ]);
  assert.deepEqual(expanded, [
    "apps/web/src/other-a.test.ts",
    "apps/web/src/plain.test.ts",
    "apps/web/src/studio-a.test.ts",
    "apps/web/src/studio-b.test.ts",
  ]);

  assert.throws(
    () => expandGlobTargets(["apps/web/src/missing-*.test.ts"], { glob: () => [] }),
    /did not match any files/,
  );
});

test("each non-Vitest contract has one owning shard", () => {
  assert.deepEqual(Object.keys(SHARD_COMMANDS), [...SHARD_NAMES]);
  const serialized = SHARD_NAMES.flatMap((name) => SHARD_COMMANDS[name])
    .map(({ argv }) => argv.join(" "))
    .join("\n");
  for (const command of [
    "scripts/api-followup-unit.test.mjs",
    "scripts/api-followup-ci-policy.test.mjs",
    "pnpm run validate:architecture",
    "pnpm run verify:csp",
    "pnpm run verify:toolchain-coverage",
    "scripts/verify-studio-p2p-huddle.test.mjs",
    "scripts/studio-offline-resilience.test.mjs",
    "scripts/verify-studio-menus-ci.test.mjs",
    "pnpm run test:studio-material-brush",
    "scripts/audit-studio-brush-quality-portfolio.mts",
  ]) {
    assert.equal(serialized.split(command).length - 1, 1, command);
  }
  const packageScripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;
  assert.equal(packageScripts["test:studio-material-brush"].split(/\s+/u).filter((arg) => arg === "scripts/studio-brush-v6-pixel-quality.test.ts").length, 1, "Chemy 정책 회귀는 기존 재질 시험 명령에 정확히 한 번 포함해야 합니다.");
  assert(SHARD_COMMANDS["studio-editing"].some(({ argv }) => argv.some((arg) => arg.includes("pnpm run test:studio-material-brush"))), "재질 정책 회귀의 필수 소유 shard를 유지해야 합니다.");
});

test("list mode validates the manifest without installing dependencies", () => {
  const script = fileURLToPath(new URL("./ci-core-regression-shards.mjs", import.meta.url));
  const listed = spawnSync(process.execPath, [script, "--list"], { encoding: "utf8" });
  assert.equal(listed.status, 0, listed.stderr);
  const payload = JSON.parse(listed.stdout);
  assert.deepEqual(payload.shards.map(({ name }) => name), [...SHARD_NAMES]);
  assert.ok(payload.shards.every(({ requiredTargets, executionTargets }) => (
    requiredTargets > 0 && executionTargets.length > 0
  )));

  const invalid = spawnSync(process.execPath, [script, "not-a-shard"], { encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Unknown CI regression shard/);
});

test("구매 번들의 출처·저장·아카이브·장식·캐시 회귀는 required shard에서 한 번 실행된다", () => {
  const execution = executionTargetsByShard();
  for (const target of [
    "apps/web/src/domains/creator/catalog/studio-bundle-source-credit.test.ts",
    "tests/integration/itch-bundle-source-credit.test.ts",
    "apps/web/src/domains/creator/catalog/studio-bundle-personal-library-save.test.ts",
    "apps/web/src/domains/creator/catalog/StudioBundleAssetLibraryPanel.save.test.tsx",
    "apps/web/src/domains/creator/catalog/studio-bundle-backgrounds.test.ts",
    "apps/web/src/domains/creator/catalog/studio-bundle-project-archive.test.ts",
    "apps/web/src/domains/creator/virtual-space/studio-virtual-space-bundle-decor.test.ts",
    "scripts/creator-bundle-decor.test.mjs",
    "scripts/creator-bundle-scene-catalog.test.mjs",
    "scripts/creator-bundle-serving-parity.test.mjs",
    "scripts/rebuild-creator-bundle-local-ingest.test.mjs",
    "apps/web/src/domains/creator/bg3d/studio-bg3d-bundle-asset-loader.test.ts",
    "apps/web/src/domains/creator/bg3d/studio-bg3d-bundle-theme-packs.test.ts",
    "apps/web/src/domains/creator/bg3d/studio-bg3d-bundle-model-resolution.test.ts",
    "apps/web/src/domains/creator/bg3d/studio-bg3d-genre-scene-pack-links.test.ts",
  ]) {
    assert.ok(REQUIRED_VITEST_TARGETS.includes(target), `필수 번들 회귀 누락: ${target}`);
    const expected = target.includes("/bg3d/") ? "studio-3d" : "studio-foundation";
    assert.deepEqual(SHARD_NAMES.filter((name) => targetIsCovered(target, execution[name])), [expected], target);
  }
});

test("native proof와 실제 보안 패치 회귀는 기존 required Node 명령에서 한 번 실행된다", () => {
  const execution = executionTargetsByShard();
  const commands = Object.entries(SHARD_COMMANDS).flatMap(([name, entries]) => entries.map(({ argv }) => ({ name, command: argv.join(" ") })));
  for (const [file, shard] of [
    ["scripts/creator-bundle-native-proof.test.mjs", "studio-foundation"],
    ["scripts/qs-security-compat.test.mjs", "product"],
    ["scripts/deepmerge-security-compat.test.mjs", "product"],
  ]) {
    const owners = commands.filter(({ command }) => command.split(/\s+/u).includes(file));
    assert.equal(owners.length, 1, `${file}: Node 실행 수가 달라졌습니다.`);
    assert.equal(owners[0].name, shard, file);
    assert.match(owners[0].command, /node (?:--experimental-strip-types )?--test /u);
    assert.ok(SHARD_NAMES.every((name) => !targetIsCovered(file, execution[name])), `${file}: Node와 Vitest shard 중복 실행`);
  }
  const proof = readFileSync(new URL("./creator-bundle-native-proof.test.mjs", import.meta.url), "utf8");
  assert.match(proof, /process\.env\.VITEST \? await import\("vitest"\) : await import\("node:test"\)/u,
    "related Vitest도 같은 네 회귀를 수집해야 합니다.");
});

test("live transform 회귀의 이동된 현재 경로를 필수 editing shard에서 실행한다", () => {
  const selector = "apps/web/src/domains/creator/live/studio-live-transform-*.test.ts";
  assert.ok(REQUIRED_VITEST_TARGETS.includes(selector));
  assert.ok(!REQUIRED_VITEST_TARGETS.includes("apps/web/src/domains/creator/studio-live-transform-*.test.ts"));
  const files = expandGlobTargets([selector]);
  assert.ok(files.length > 0);
  const executed = expandGlobTargets(executionTargetsByShard()["studio-editing"]);
  for (const file of files) assert.equal(executed.filter((target) => target === file).length, 1, file);
});


test("foundation 초기 sparse checkout은 전체 기본 래스터 소품 입력을 포함한다", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const staticJob = workflow.slice(workflow.indexOf("\n  static:\n"), workflow.indexOf("\n  serial:\n"));
  const path = "/apps/web/public/assets/studio/props/";
  assert.ok(staticJob.includes("${{ matrix.shard == 'studio-foundation' && '" + path + "' || '' }}"));
  for (const shard of SHARD_NAMES) {
    assert.equal(sparsePatterns(staticJob, { shard }).includes(path), shard === "studio-foundation", `${shard}: 기본 소품 입력 경계`);
  }
});

test("가상 오피스 원본·런타임·기존 시트 검증 입력은 소유 foundation shard에만 복원한다", () => {
  const execution = executionTargetsByShard();
  for (const target of [
    "apps/web/src/domains/creator/virtual-space/office2d/office2d-atlas-frames.test.ts",
    "apps/web/src/domains/creator/virtual-space/studio-virtual-space-office-environments.test.ts",
  ]) {
    assert.equal(shardForTarget(target), "studio-foundation", target);
    assert.deepEqual(SHARD_NAMES.filter((name) => targetIsCovered(target, execution[name])), ["studio-foundation"], target);
  }
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const staticJob = workflow.slice(workflow.indexOf("\n  static:\n"), workflow.indexOf("\n  serial:\n"));
  const expected = [
    "/apps/web/public/assets/virtual-studio/office-cast-v2/",
    "/apps/web/public/assets/virtual-studio/office-themes-v1/",
    "/apps/web/public/assets/virtual-studio/toon-office-v1/characters/",
  ];
  const declarations = [...staticJob.matchAll(/\$\{\{ matrix\.shard == 'studio-foundation' && '([^']+)' \|\| '' \}\}/gu)]
    .map((match) => match[1]).filter((path) => /\/(?:office-cast-v2|office-themes-v1|toon-office-v1\/characters)\/$/u.test(path));
  assert.deepEqual(declarations.sort(), expected);
  for (const path of expected) {
    assert.equal(workflow.split(path).length - 1, 1, `${path}: 초기 조건 경로는 한 번만 선언해야 합니다.`);
    for (const shard of SHARD_NAMES) {
      assert.equal(sparsePatterns(staticJob, { shard }).includes(path), shard === "studio-foundation", `${shard}: 오피스 원본 입력 경계 ${path}`);
    }
  }
});

test("제작 공정과 시각적 작업 보드 검증은 필수 product shard에서 한 번만 실행한다", () => {
  const targets = [
    "apps/web/src/domains/creator/production-hub/ProductionCollaborationRoleEditor.test.tsx",
    "apps/web/src/domains/creator/production-hub/ProductionCreateProjectDialog.test.tsx",
    "apps/web/src/domains/creator/production-hub/ProductionWorkBoard.test.tsx",
    "apps/web/src/domains/creator/production-hub/production-bulk-task-edit.test.ts",
    "apps/web/src/domains/creator/production-hub/production-collaboration-role-model.test.ts",
    "apps/web/src/domains/creator/production-hub/production-create-api.test.ts",
    "apps/web/src/domains/creator/production-hub/production-create-command.test.ts",
    "apps/web/src/domains/creator/production-hub/production-create-pending.test.ts",
    "apps/web/src/domains/creator/production-hub/production-command-recovery.test.ts",
    "apps/web/src/domains/creator/production-hub/production-workflow-episode-plan.test.ts",
    "apps/web/src/domains/creator/production-hub/use-production-role-setup-recovery.test.tsx",
    "packages/contracts/src/production-workflow.test.ts",
    "apps/api/src/modules/production-collaboration/production-workflow-command.test.ts",
  ];
  const execution = executionTargetsByShard();
  for (const target of targets) {
    assert.equal(shardForTarget(target), "product");
    assert.deepEqual(SHARD_NAMES.filter((name) => targetIsCovered(target, execution[name])), ["product"], target);
  }
});

test("필수 목록의 시험 파일은 루트 Vitest 설정이 제외하지 않아 실제로 수집된다", () => {
  // 제외된 파일을 필수 목록에 올리면 `vitest run <파일>` 이 조용히 0개를 수집해, 게이트가 이름만 있고 돌지 않는다.
  const config = readFileSync(new URL("../vitest.config.ts", import.meta.url), "utf8");
  const block = config.match(/\.\.\.configDefaults\.exclude,([\s\S]*?)\.\.\.SERIAL_TEST_FILES/u)?.[1];
  assert.ok(block, "루트 Vitest 제외 목록을 찾지 못했습니다. 이 시험의 파서를 설정 구조에 맞추세요.");
  const excluded = new Set([
    ...[...block.matchAll(/"([^"]+)"/gu)].map((match) => match[1]).filter((entry) => !/[*?[\]{}]/u.test(entry)),
    ...SERIAL_TEST_FILES,
  ]);
  assert.ok(excluded.has("scripts/local-test-stack.test.mjs"), "제외 목록 파서가 파일 항목을 읽지 못했습니다.");
  assert.deepEqual(REQUIRED_VITEST_TARGETS.filter((target) => excluded.has(target)), []);
});


test("6패스 원본 계약·GPU 계산·문서 복구·실제 DB 경계를 각각 필수 실행한다", () => {
  const execution = executionTargetsByShard();
  const files = Object.fromEntries(SHARD_NAMES.map((name) => [name, resolveRequiredTargets(expandGlobTargets(execution[name]))]));
  const nativePg = "apps/api/src/modules/creator/studio-bg3d-bundle.repository.integration.test.ts";
  assert.ok(CORE_DATABASE_VITEST_TARGETS.includes(nativePg));
  assert.ok(buildShardVitestArgs(expandGlobTargets(execution.product)).includes(nativePg));
  for (const [name, targets] of Object.entries({
    product: ["apps/api/src/modules/creator/studio-bg3d-linked-pass-admission.test.ts", "apps/api/src/modules/creator/studio-crdt-bg3d-reader-gate.test.ts"],
    "studio-3d": ["apps/web/src/domains/creator/bg3d/studio-bg3d-canvas-renderer-admission.test.tsx", "apps/web/src/domains/creator/bg3d/studio-bg3d-three-six-pass-capture.test.ts", "apps/web/src/domains/creator/bg3d/studio-bg3d-bundle-project-archive.test.ts"],
    "studio-foundation": ["tests/unit/contracts/studio-bg3d-six-pass-bundle.test.ts", "tests/integration/api-web/api/modules/creator/studio-crdt-bg3d-native-history.test.ts", "apps/web/src/domains/creator/scene3d/bg3d-six-pass/studio-bg3d-six-pass-cloud-project.test.ts", "apps/web/src/domains/creator/studio-cuttoon-editor/runtime/bg3d-six-pass/studio-bg3d-six-pass-history-retention.test.ts"],
  })) for (const target of targets) {
    assert.equal(shardForTarget(target), name, target);
    assert.deepEqual(SHARD_NAMES.filter((owner) => files[owner].includes(target)), [name], `6패스 회귀 실행 소유 누락·중복: ${target}`);
  }
});

test("갈필·기본 배치·진단 원문·SVG 보존 회귀를 소유 Core shard에서 정확히 한 번 실행한다", () => {
  const execution = executionTargetsByShard();
  const files = Object.fromEntries(SHARD_NAMES.map((name) => [name, resolveRequiredTargets(expandGlobTargets(execution[name]))]));
  for (const [name, targets] of Object.entries({
    "studio-editing": [
      "apps/web/src/domains/creator/brush/wet-paper/StudioDrawNode.dry-brush-live.test.tsx",
      "apps/web/src/domains/creator/brush/wet-paper/studio-dry-brush-live-lifecycle.test.ts",
      "apps/web/src/domains/creator/brush/wet-paper/studio-dry-brush-live-loading.test.ts",
      "apps/web/src/domains/creator/brush/studio-brush-selection.prewarm.test.ts",
    ],
    "studio-foundation": [
      "apps/web/src/domains/creator/studio-shell/studio-shell-default-safe-viewport.test.ts",
      "apps/web/src/domains/creator/studio-shell/use-studio-floating-surface-layout.test.tsx",
      "scripts/lib/studio-hokusai-preview-diagnostics.test.ts",
      "scripts/lib/compact-svg-structure.test.mjs",
    ],
  })) for (const target of targets) {
    assert.ok(REQUIRED_VITEST_TARGETS.includes(target), `필수 목록 누락: ${target}`);
    assert.equal(shardForTarget(target), name, target);
    assert.deepEqual(SHARD_NAMES.filter((owner) => files[owner].includes(target)), [name], `회귀 실행 누락·중복: ${target}`);
    assert.ok(!SERIAL_TEST_FILES.includes(target), `일반 shard가 수집하지 않는 성능 시험: ${target}`);
  }
});
