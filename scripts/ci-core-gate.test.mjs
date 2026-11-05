import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { assertCoreResults, REQUIRED_CORE_GATES } from "./ci-core-gate.mjs";
import { REQUIRED_VITEST_TARGETS, SHARD_NAMES, executionTargetsByShard, expandGlobTargets } from "./ci-core-regression-shards.mjs";
import { resolveRequiredTargets } from "./run-core-vitest.mjs";
import { SERIAL_TEST_FILES } from "../vitest.serial-test-files.mjs";
import { sparsePatterns } from "./ci-checkout-test-helpers.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const success = () => Object.fromEntries(
  REQUIRED_CORE_GATES.map((name) => [name, { result: "success" }]),
);

test("accepts actual success from every declared gate", () => {
  assert.doesNotThrow(() => assertCoreResults(success()));
});

test("rejects every non-success or missing gate without registering hundreds of cases", () => {
  const statuses = ["failure", "cancelled", "skipped", "pending", "neutral", undefined];
  for (const name of REQUIRED_CORE_GATES) {
    for (const status of statuses) {
      assert.throws(
        () => assertCoreResults({ ...success(), [name]: { result: status } }),
        /actual success/,
        `${name}:${String(status)}`,
      );
    }

    const results = success();
    delete results[name];
    assert.throws(() => assertCoreResults(results), /actual success/, `missing:${name}`);
  }
});

test("rejects empty, malformed, inherited and unknown dependencies", () => {
  for (const results of [null, undefined, [], {}, "success", false, Object.create(success())]) {
    assert.throws(() => assertCoreResults(results));
  }
  assert.throws(
    () => assertCoreResults({ ...success(), ignored: { result: "failure" } }),
    /unrecognized/,
  );
});

test("CLI exits nonzero for malformed JSON and failed gates, then succeeds once", () => {
  const script = fileURLToPath(new URL("./ci-core-gate.mjs", import.meta.url));
  const invalidInputs = [
    "not-json",
    "",
    "null",
    "{}",
    JSON.stringify({ ...success(), serial: { result: "skipped" } }),
  ];

  for (const raw of invalidInputs) {
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, CORE_RESULTS: raw },
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr);
  }

  const result = spawnSync(process.execPath, [script], {
    env: { ...process.env, CORE_RESULTS: JSON.stringify(success()) },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /all required checks succeeded/);
});


test("브러시 디스크·화면 ROI·실제 갈필 경계 회귀를 필수 Core 소유자에서 한 번 실행한다", () => {
  const execution = executionTargetsByShard();
  const files = Object.fromEntries(SHARD_NAMES.map((name) => [name, resolveRequiredTargets(expandGlobTargets(execution[name]))]));
  for (const [target, owner] of [
    ["scripts/toonstudio-integration-disk-policy.test.mjs", "studio-foundation"],
    ["scripts/lib/studio-smart-shape-visible-grid.test.ts", "studio-foundation"],
    ["scripts/lib/studio-filter-dialog-surface.test.ts", "studio-foundation"],
    ["apps/web/src/app/spatial-campus/campus-route-coverage.test.ts", "studio-foundation"],
    ["apps/web/src/shared/language/error-copy.guard.test.ts", "studio-foundation"],
    ["apps/web/src/shared/language/tone-copy.guard.test.ts", "studio-foundation"],
    ["apps/web/src/shared/components/LanguagePicker.test.tsx", "studio-foundation"],
    ["apps/web/src/shared/components/route-purpose-scene.contract.test.ts", "studio-foundation"],
    ["apps/web/src/domains/collaboration/hiring/HiringDiscovery.test.tsx", "studio-foundation"],
    ["apps/web/src/domains/creator/mesh-surface/studio-mesh-surface-plan.test.ts", "studio-foundation"],
    ["apps/web/src/domains/creator/ai/StudioAiSuperSuiteModal.test.tsx", "studio-foundation"],
    ["scripts/secretlint-files.test.mjs", "studio-foundation"],
    ["scripts/studio-review-local-storage-certificates.test.mjs", "studio-foundation"],
    ["scripts/seed/persona-accounts-seed.test.mjs", "studio-foundation"],
    ["apps/web/tools/browser-harnesses/plasticine-materials/browser-png-csp.test.mjs", "studio-foundation"],
    ["tests/integration/api-web/api/modules/creator/studio-crdt-root-schema-boundary.test.ts", "studio-foundation"],
    ["apps/web/src/domains/creator/studio-companion-browser-harness-boundary.test.ts", "studio-foundation"],
    ["tests/integration/web-api/domains/creator/virtual-space/studio-virtual-space-design-closure.test.ts", "product"],
    ["apps/api/src/modules/creator/studio-crdt-bg3d-shape.test.ts", "product"],
    ["apps/web/src/domains/creator/brush/studio-wet-wash-live-pipeline.test.ts", "studio-editing"],
    ["apps/web/src/domains/creator/brush/wet-paper/studio-wet-paper-host.test.ts", "studio-editing"],
    ["apps/web/src/domains/creator/brush/wet-paper/StudioDrawNode.dry-brush-live.test.tsx", "studio-editing"],
  ]) {
    assert.equal(REQUIRED_VITEST_TARGETS.filter((item) => item === target).length, 1, `필수 회귀 선택자 누락·중복: ${target}`);
    assert.deepEqual(SHARD_NAMES.filter((name) => files[name].includes(target)), [owner], target);
    assert.equal(SERIAL_TEST_FILES.includes(target), false, `일반 shard에서 제외된 성능 시험: ${target}`);
  }
  const performance = "apps/web/src/domains/creator/brush/studio-long-stroke-per-move-cost.test.ts";
  assert.equal(SERIAL_TEST_FILES.filter((target) => target === performance).length, 1);
  assert.deepEqual(SHARD_NAMES.filter((name) => files[name].includes(performance)), []);
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const start = ci.indexOf("\n  static:"), end = ci.indexOf("\n  serial:", start);
  assert(start >= 0 && end > start);
  const checkout = ci.slice(start, end);
  assert(sparsePatterns(checkout, { shard: "product" }).includes("/docs/"), "closure의 필수 문서는 소유 product shard에 있어야 합니다.");
  assert(!sparsePatterns(checkout, { shard: "studio-foundation" }).includes("/docs/"));
});
