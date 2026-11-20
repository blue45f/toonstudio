import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const hook = fileURLToPath(new URL("../.husky/pre-push", import.meta.url));
const harness = fileURLToPath(new URL("./agent-harness.mjs", import.meta.url));

function runHook({ failure = "", baseMissing = false, changedAuditPath = "" } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "toonstudio-push-order-"));
  try {
    const log = join(directory, "calls");
    const record = 'printf "%s\\n" "$*" >> "$CALLS"';
    const fail = 'if [ -n "$FAIL_AT" ]; then case "$*" in *"$FAIL_AT"*) exit 17;; esac; fi';
    const mock = (name, lines) => writeFileSync(join(directory, name),
      ["#!/bin/sh", record, ...lines].join("\n") + "\n", { mode: 0o755 });
    mock("pnpm", [
      'if [ "$*" = "run harness:verify --pre-push" ]; then exec "$REAL_NODE" "$HARNESS" verify --pre-push; fi',
      'if [ "$*" = "run typecheck" ] && [ "$NODE_OPTIONS" != "--max-old-space-size=16384" ]; then exit 23; fi',
      fail,
    ]);
    mock("node", [fail]);
    mock("git", [
      'if [ "$1" = "rev-parse" ]; then exit "$BASE_MISSING"; fi',
      'if [ "$1" = "diff" ] && [ -n "$AUDIT_PATH" ]; then printf "%s\\n" "$AUDIT_PATH"; fi',
    ]);
    const result = spawnSync("sh", [hook], {
      cwd: directory,
      env: {
        ...process.env, PATH: `${directory}:${process.env.PATH}`,
        CALLS: log, REAL_NODE: process.execPath, HARNESS: harness, FAIL_AT: failure,
        PRE_PUSH_BASE: "refs/heads/comparison", BASE_MISSING: baseMissing ? "1" : "0", AUDIT_PATH: changedAuditPath,
      },
      encoding: "utf8",
    });
    const calls = readFileSync(log, "utf8").trim().split("\n");
    assert.deepEqual(calls.filter((call) => call.includes("harness:verify")), ["run harness:verify --pre-push"]);
    return { status: result.status, calls, diagnostic: result.stdout + result.stderr };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

for (const failure of ["validate:architecture", "lint-changed.mjs", "secretlint-files.mjs", "run typecheck", ""]) {
  test(`푸시 훅의 실행 순서와 종료 코드 · ${failure || "전체 성공"}`, () => {
    const result = runHook({ failure });
    assert.equal(result.status, failure ? 17 : 0, result.diagnostic);
    const { calls } = result;
    const preflight = "--test scripts/agent-harness.test.mjs scripts/verify-ui-ux-v2-contracts.test.mjs scripts/run-changed-unit-tests.test.mjs";
    assert.deepEqual(calls.slice(1, 4), [preflight, "scripts/verify-pnpm-lockfile.mjs", "rev-parse --verify --quiet refs/heads/comparison"]);
    const count = calls.filter((call) => call === "run typecheck").length;
    if (failure && failure !== "run typecheck") {
      assert.equal(count, 0);
    } else {
      assert.equal(count, 1);
      for (const check of ["validate:architecture", "lint-changed.mjs", "secretlint-files.mjs"]) {
        const index = calls.findIndex((call) => call.includes(check));
        assert.ok(index >= 0 && index < calls.indexOf("run typecheck"));
      }
    }
    assert.equal(calls.includes("scripts/run-changed-unit-tests.mjs --base=refs/heads/comparison"), !failure);
    assert.ok(!calls.includes("run audit:security") && !calls.includes("run audit:licenses"));
  });
}

test("기준 ref가 없으면 전체 시크릿을 검사하고 구조·타입·변경 단위 검사를 유지한다", () => {
  const { calls, status, diagnostic } = runHook({ baseMissing: true });
  assert.equal(status, 0, diagnostic);
  for (const call of ["run validate:architecture", "scripts/lint-changed.mjs", "run quality:secrets", "run typecheck", "scripts/run-changed-unit-tests.mjs"]) {
    assert.equal(calls.filter((entry) => entry === call).length, 1);
  }
  assert.ok(!calls.some((call) => call.includes("--base=")));
});

test("커밋 범위의 의존성·WASM 변경은 타입·단위 검사 뒤 보안·라이선스 감사를 거친다", () => {
  const result = runHook({ changedAuditPath: "packages/studio-hokusai-wasm/src/lib.rs" });
  assert.equal(result.status, 0, result.diagnostic);
  assert.deepEqual(result.calls.slice(-4), [
    "scripts/run-changed-unit-tests.mjs --base=refs/heads/comparison",
    "diff --name-only refs/heads/comparison...HEAD -- package.json pnpm-lock.yaml packages/studio-hokusai-wasm",
    "run audit:security", "run audit:licenses",
  ]);
});
