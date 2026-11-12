import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { publishReceipt, reuseOrRun, runOriginalTypecheck } from "./ci-shared-typecheck.mjs";
import { CANONICAL_COMMANDS, CANONICAL_SETTINGS } from "./ci-typecheck-receipt.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("CI는 실제 Core 성공 뒤 영수증을 만들고 두 도메인은 전체 검사 fallback과 엄격한 집계를 유지한다", () => {
  const workflow = (name) => readFileSync(new URL("../.github/workflows/" + name + ".yml", import.meta.url), "utf8");
  const ci = workflow("ci");
  const start = ci.indexOf("\n  typecheck:"), end = ci.indexOf("\n  static:", start);
  const core = ci.slice(start, end);
  const publisher = core.indexOf("node scripts/ci-shared-typecheck.mjs publish");
  for (const command of CANONICAL_COMMANDS) {
    assert(core.indexOf(command) >= 0 && core.indexOf(command) < publisher, command);
  }
  assert(core.includes("name: core-typecheck-" + "${{ github.run_id }}-${{ github.run_attempt }}"));
  assert(core.includes("path: ${{ runner.temp }}/core-typecheck/receipt.json"));
  assert(core.includes("if-no-files-found: error"));
  assert(core.includes("retention-days: 1"));
  assert.doesNotMatch(core, /continue-on-error/);
  for (const name of ["studio-finishing-quality", "feedback-community-validation"]) {
    const source = workflow(name);
    assert(source.includes("actions: read"));
    assert(source.includes("GITHUB_TOKEN: ${{ github.token }}"));
    assert(source.includes("node scripts/ci-shared-typecheck.mjs reuse-or-run 2>&1 | tee"));
    for (const file of [
      "scripts/ci-shared-typecheck.mjs", "scripts/ci-shared-typecheck.test.mjs",
      "scripts/ci-typecheck-receipt.mjs", "scripts/ci-typecheck-receipt.test.mjs",
      "scripts/ci-typecheck-lookup.mjs", "scripts/ci-typecheck-lookup.test.mjs",
    ]) assert.equal(source.split("      - '" + file + "'").length - 1, 2, name + "/" + file);
  }
  const feedback = workflow("feedback-community-validation");
  assert(feedback.includes("id: types\n        continue-on-error: true"));
  assert(feedback.includes("TYPES: ${{ steps.types.outcome }}"));
  assert(feedback.includes("if os.environ.get(key) != 'success'"));
  assert(feedback.includes("pnpm run build:bundle 2>&1 | tee artifacts/feedback/production-build.log"));
  assert(feedback.includes("steps.types.outcome == 'success'"));
  for (const file of ["ci-shared-typecheck", "ci-typecheck-receipt", "ci-typecheck-lookup"]) {
    assert(ci.includes("scripts/" + file + ".test.mjs"));
  }
});


const fingerprint = {
  runtime: { platform: "linux", arch: "x64", imageOS: "ubuntu24" },
  source: { sha: "a".repeat(40) },
};
const candidate = { receipt: {}, producer: {
  path: ".github/workflows/ci.yml", runId: 12, runAttempt: 2, jobId: 34, conclusion: "success",
} };

test("검증된 완료 영수증만 실제 타입 검사 없이 재사용한다", async () => {
  let executions = 0;
  const result = await reuseOrRun({
    collect: () => fingerprint, lookup: async () => candidate,
    validate: (_receipt, expected) => {
      assert.equal(expected.producer.runId, 12);
      assert.equal(expected.producer.runAttempt, 2);
      assert.equal(expected.producer.conclusion, "success");
      return { ok: true };
    },
    run: () => { executions += 1; return 7; }, log: () => {},
  });
  assert.equal(result, 0);
  assert.equal(executions, 0);
});

test("영수증 누락·거부·API 오류·context 오류는 실제 검사 한 번의 실패를 전파한다", async () => {
  for (const overrides of [
    { lookup: async () => null },
    { validate: () => ({ ok: false }) },
    { lookup: async () => { throw new Error("인증값을 포함할 수 있는 오류"); } },
    { collect: () => { throw new Error("context 누락"); } },
  ]) {
    let executions = 0;
    const messages = [];
    const result = await reuseOrRun({
      collect: () => fingerprint, lookup: async () => candidate, validate: () => ({ ok: true }),
      run: () => { executions += 1; return 17; }, log: (message) => messages.push(message),
      ...overrides,
    });
    assert.equal(result, 17);
    assert.equal(executions, 1);
    assert.doesNotMatch(messages.join("\n"), /인증값을 포함/);
  }
});

test("OS 이미지·플랫폼·아키텍처 차이는 원격 조회 없이 실제 검사를 실행한다", async () => {
  for (const runtime of [
    { ...fingerprint.runtime, imageOS: "ubuntu26" },
    { ...fingerprint.runtime, platform: "darwin" },
    { ...fingerprint.runtime, arch: "arm64" },
  ]) {
    let lookups = 0, executions = 0;
    assert.equal(await reuseOrRun({
      collect: () => ({ ...fingerprint, runtime }),
      lookup: async () => { lookups += 1; return candidate; },
      run: () => { executions += 1; return 0; }, log: () => {},
    }), 0);
    assert.equal(executions, 1);
    assert.equal(lookups, 0);
  }
});

test("API 조회 중 입력이 바뀌면 다시 확인하고 실제 검사로 되돌아간다", async () => {
  let collections = 0, executions = 0;
  assert.equal(await reuseOrRun({
    collect: () => {
      collections += 1;
      if (collections > 1) throw new Error("조회 중 source 변경");
      return fingerprint;
    },
    lookup: async () => candidate,
    run: () => { executions += 1; return 19; }, log: () => {},
  }), 19);
  assert.equal(collections, 2);
  assert.equal(executions, 1);
});

test("프로세스 실패·signal·시작 오류를 성공으로 바꾸지 않는다", () => {
  for (const result of [{ status: 31 }, { status: null, signal: "SIGTERM" }, { status: null, error: new Error("실행 실패") }]) {
    const status = runOriginalTypecheck({
      spawn: (command, args, options) => {
        assert.equal(command, "pnpm");
        assert.deepEqual(args, ["run", "typecheck"]);
        assert.equal(options.shell, false);
        assert.equal(options.env.GITHUB_TOKEN, undefined);
        return result;
      }, env: { GITHUB_TOKEN: "test-only-placeholder" }, log: () => {},
    });
    assert.notEqual(status, 0);
  }
});

test("발행 경로·정본 컨텍스트를 확인하고 기존 파일과 심볼릭 링크를 덮어쓰지 않는다", () => {
  const directory = mkdtempSync(join(tmpdir(), "shared-typecheck-publish-"));
  const repository = "blue45f/toonstudio", sha = "a".repeat(40), ref = "refs/heads/main";
  const env = {
    GITHUB_ACTIONS: "true", GITHUB_JOB: "typecheck", CI: "1", NODE_OPTIONS: CANONICAL_SETTINGS.nodeOptions,
    GITHUB_REPOSITORY: repository, GITHUB_SHA: sha, GITHUB_REF: ref, GITHUB_EVENT_NAME: "push",
    GITHUB_RUN_ID: "12", GITHUB_RUN_ATTEMPT: "2", RUNNER_TEMP: directory,
    GITHUB_WORKFLOW_REF: repository + "/.github/workflows/ci.yml@" + ref,
  };
  const collect = () => ({
    source: { repository, sha, tree: "b".repeat(40), extraInputsClean: true, eventName: "push", ref, pr: null },
    runtime: { platform: "linux", arch: "x64", imageOS: "ubuntu24", nodeVersion: "v24.22.1", pnpmVersion: "11.4.0", lockSha256: "c".repeat(64) },
    canonical: { ...CANONICAL_SETTINGS, commands: [...CANONICAL_COMMANDS] },
  });
  const output = join(directory, "core-typecheck", "receipt.json");
  try {
    assert.throws(() => publishReceipt({ output: join(directory, "other.json"), env, collect }), /임시 디렉터리/);
    assert.throws(() => publishReceipt({ output, env: { ...env, GITHUB_JOB: "lint" }, collect }), /정본 검사 컨텍스트/);
    publishReceipt({ output, env, collect });
    assert.equal(JSON.parse(readFileSync(output, "utf8")).producer.runAttempt, 2);
    assert.throws(() => publishReceipt({ output, env, collect }), /EEXIST/);
    rmSync(join(directory, "core-typecheck"), { recursive: true });
    const elsewhere = join(directory, "other");
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(directory, "core-typecheck"));
    assert.throws(() => publishReceipt({ output, env, collect }), /심볼릭 링크/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("실제 CLI도 공유 환경이 없으면 원래 명령과 종료 코드를 유지한다", () => {
  const directory = mkdtempSync(join(tmpdir(), "shared-typecheck-cli-"));
  try {
    const executable = join(directory, "pnpm"), receipt = join(directory, "args.txt");
    writeFileSync(executable, '#!/bin/sh\nprintf "%s\\n" "$@" > "$TEST_ARGUMENTS"\nexit 23\n');
    chmodSync(executable, 0o700);
    const script = fileURLToPath(new URL("./ci-shared-typecheck.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [script, "reuse-or-run"], {
      env: { PATH: directory + ":" + process.env.PATH, TEST_ARGUMENTS: receipt },
      encoding: "utf8",
    });
    assert.equal(result.status, 23, result.stderr);
    assert.equal(readFileSync(receipt, "utf8"), "run\ntypecheck\n");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

