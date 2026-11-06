import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CANONICAL_COMMANDS, CANONICAL_SETTINGS, WORKFLOW_PATH,
  assertPublisherContext, collectFingerprint, createReceipt, validateReceipt,
} from "./ci-typecheck-receipt.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const sha = "a".repeat(40), tree = "b".repeat(40);
function fingerprint() {
  return {
    source: { repository: "blue45f/toonstudio", sha, tree, extraInputsClean: true, eventName: "pull_request", ref: "refs/pull/1/merge",
      pr: { number: 1, baseSha: "c".repeat(40), headSha: "d".repeat(40), baseRepository: "blue45f/toonstudio", headRepository: "fork/toonstudio" } },
    runtime: { platform: "linux", arch: "x64", imageOS: "ubuntu24", nodeVersion: "v24.1.0", pnpmVersion: "11.4.0", lockSha256: "e".repeat(64) },
    canonical: { ...CANONICAL_SETTINGS, commands: [...CANONICAL_COMMANDS] },
  };
}
function producer() {
  return { workflowPath: WORKFLOW_PATH, runId: "123", runAttempt: "2", jobKey: "typecheck", status: "completed", conclusion: "success" };
}
function environment() {
  return { GITHUB_ACTIONS: "true", GITHUB_JOB: "typecheck", CI: "1", NODE_OPTIONS: "--max-old-space-size=12288",
    GITHUB_REPOSITORY: "blue45f/toonstudio", GITHUB_SHA: sha, GITHUB_EVENT_NAME: "pull_request", GITHUB_REF: "refs/pull/1/merge",
    GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "2", GITHUB_WORKFLOW_REF: `blue45f/toonstudio/${WORKFLOW_PATH}@refs/pull/1/merge` };
}
const receipt = () => createReceipt({ fingerprint: fingerprint(), producer: producer() });

test("동일 소스·환경과 API 실행 식별자가 일치한 성공만 재사용한다", () => {
  assert.deepEqual(validateReceipt(receipt(), { fingerprint: fingerprint(), producer: producer() }), { ok: true, reasons: [] });
  const original = fingerprint();
  const result = createReceipt({ fingerprint: original, producer: producer() });
  original.runtime.lockSha256 = "f".repeat(64);
  assert.equal(result.fingerprint.runtime.lockSha256, "e".repeat(64));
});

test("소스 SHA·tree·이벤트·PR 기준과 후보·환경 변경을 모두 거절한다", () => {
  const changes = [
    ["source", "sha", "f".repeat(40)], ["source", "tree", "f".repeat(40)],
    ["source", "repository", "other/repo"], ["source", "eventName", "push"], ["source", "ref", "refs/heads/main"],
    ["runtime", "lockSha256", "f".repeat(64)], ["runtime", "nodeVersion", "v24.2.0"],
    ["runtime", "platform", "darwin"], ["runtime", "arch", "arm64"], ["runtime", "imageOS", "ubuntu26"],
    ["runtime", "pnpmVersion", "11.4.1"],
  ];
  for (const [section, key, value] of changes) {
    const target = fingerprint(); target[section][key] = value;
    assert.equal(validateReceipt(receipt(), { fingerprint: target }).ok, false, `${section}.${key}`);
  }
  for (const key of ["number", "baseSha", "headSha", "baseRepository", "headRepository"]) {
    const target = fingerprint(); target.source.pr[key] = key === "number" ? 2 : key.endsWith("Sha") ? "f".repeat(40) : "other/repo";
    assert.equal(validateReceipt(receipt(), { fingerprint: target }).ok, false, key);
  }
});

test("명령·heap 정본·영수증 버전·불완전 입력을 거절한다", () => {
  for (const mutate of [
    (r) => { r.schemaVersion = 2; }, (r) => { delete r.fingerprint.runtime.lockSha256; },
    (r) => { r.fingerprint.canonical.commands.pop(); }, (r) => { r.fingerprint.canonical.commands[0] += " --skip"; },
    (r) => { r.fingerprint.canonical.nodeOptions = "--max-old-space-size=8192"; },
    (r) => { r.fingerprint.canonical.ci = "true"; },
    (r) => { delete r.fingerprint.source.extraInputsClean; },
  ]) { const target = receipt(); mutate(target); assert.equal(validateReceipt(target, { fingerprint: fingerprint() }).ok, false); }
  for (const target of [null, undefined, {}, { schemaVersion: 1 }]) assert.equal(validateReceipt(target, { fingerprint: fingerprint() }).ok, false);
});

test("다른 run·attempt·job·workflow와 미완료·실패·취소·skip은 성공이 아니다", () => {
  for (const key of ["runId", "runAttempt"]) {
    const expected = producer(); expected[key] = "999";
    assert.equal(validateReceipt(receipt(), { fingerprint: fingerprint(), producer: expected }).ok, false);
  }
  for (const [key, values] of [
    ["status", ["queued", "in_progress", "waiting", "", null]],
    ["conclusion", ["failure", "cancelled", "skipped", "timed_out", "neutral", "", null]],
    ["jobKey", ["build", "other"]], ["workflowPath", [".github/workflows/other.yml"]],
    ["runId", [0, -1, "", "01", "NaN"]], ["runAttempt", [0, "", "1.5"]],
  ]) for (const value of values) {
    const target = receipt(); target.producer[key] = value;
    assert.equal(validateReceipt(target, { fingerprint: fingerprint() }).ok, false, `${key}:${value}`);
    assert.throws(() => createReceipt({ fingerprint: fingerprint(), producer: target.producer }));
  }
});

test("발행은 실제 정본 job·컨텍스트·환경만 허용하고 소비자 heap은 입력에서 제외한다", () => {
  assert.doesNotThrow(() => assertPublisherContext(environment(), fingerprint()));
  for (const [key, value] of Object.entries({ GITHUB_ACTIONS: "false", GITHUB_JOB: "quality-static", CI: "true", NODE_OPTIONS: "--max-old-space-size=8192",
    GITHUB_SHA: "f".repeat(40), GITHUB_REPOSITORY: "other/repo", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "push",
    GITHUB_RUN_ID: "", GITHUB_RUN_ATTEMPT: "0", GITHUB_WORKFLOW_REF: "other/ref" })) {
    assert.throws(() => assertPublisherContext({ ...environment(), [key]: value }, fingerprint()), undefined, key);
  }
  for (const [key, value] of Object.entries({ platform: "darwin", arch: "arm64", imageOS: "ubuntu26", nodeVersion: "v22.1.0", pnpmVersion: "11.4.1" })) {
    const target = fingerprint(); target.runtime[key] = value;
    assert.throws(() => assertPublisherContext(environment(), target), undefined, key);
    assert.equal(validateReceipt(createReceipt({ fingerprint: target, producer: producer() }), { fingerprint: target }).ok, false, key);
  }
  assert.equal(validateReceipt(receipt(), { fingerprint: fingerprint() }).ok, true);
});

test("수집은 실제 HEAD·tree·clean 상태·lockfile·도구 버전을 확인한다", () => {
  const root = mkdtempSync(join(tmpdir(), "ci-typecheck-receipt-"));
  try {
    writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    const calls = [];
    const run = (command, args, options) => {
      calls.push([command, args]); assert.equal(options.cwd, root);
      if (command === "pnpm") return "11.4.0\n";
      if (args[0] === "ls-files") return "";
      if (args[0] === "status") return "";
      return args[1] === "HEAD" ? sha : tree;
    };
    const event = { number: 1, pull_request: { base: { sha: "c".repeat(40), repo: { full_name: "blue45f/toonstudio" } }, head: { sha: "d".repeat(40), repo: { full_name: "fork/toonstudio" } } } };
    const result = collectFingerprint({ root, env: environment(), event, run });
    assert.deepEqual(result.source, fingerprint().source);
    assert.match(result.runtime.lockSha256, /^[a-f0-9]{64}$/u);
    assert.equal(result.runtime.nodeVersion, process.version);
    assert(calls.some(([command, args]) => command === "git" && args.includes("--untracked-files=no")));
    assert.throws(() => collectFingerprint({ root, env: { ...environment(), GITHUB_SHA: "f".repeat(40) }, event, run }), /HEAD/u);
    assert.throws(() => collectFingerprint({ root, env: environment(), event, run: (command, args, options) => args[0] === "status" ? " M source.ts" : run(command, args, options) }), /변경/u);
    assert.throws(() => collectFingerprint({ root, env: environment(), event, run: () => { throw new Error("private output"); } }), (error) => !error.message.includes("private output"));
    assert.throws(() => collectFingerprint({ root, env: environment(), event: {}, run }), /PR/u);
    for (const ignored of [false, true]) {
      assert.throws(() => collectFingerprint({ root, env: environment(), event,
        run: (command, args, options) => args[0] === "ls-files" && args.includes("--ignored") === ignored
          ? "apps/web/src/extra.ts\0" : run(command, args, options) }), /추적되지 않은/u);
      for (const path of ["tools/new.mts", "docs/new.mts"]) {
        assert.throws(() => collectFingerprint({ root, env: environment(), event,
          run: (command, args, options) => {
            if (args[0] === "ls-files" && args.includes("--ignored") === ignored) {
              assert(args.includes(":(exclude,glob)**/node_modules/**"));
              return args.includes(":(top,glob)**/*.mts") ? `${path}\0` : "";
            }
            return run(command, args, options);
          } }), /추적되지 않은/u, `${ignored ? "ignored" : "untracked"}:${path}`);
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
