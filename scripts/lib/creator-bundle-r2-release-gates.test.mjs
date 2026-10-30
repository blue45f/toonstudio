import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireBundleR2Attempt, authorizeBundleR2Production, validateBundleReleaseCi } from "./creator-bundle-r2-release-gates.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const SHA = "a".repeat(40);
const runs = () => [{ workflow_runs: [{ id: 1, run_number: 1, run_attempt: 1, head_sha: SHA, head_branch: "main", event: "push", status: "completed", conclusion: "success", check_suite_id: 20 }] }];
const checks = () => [{ check_runs: ["core", "verify"].map((name, i) => ({ id: i + 1, name, head_sha: SHA, check_suite: { id: 20 }, app: { slug: "github-actions" }, status: "completed", conclusion: "success" })) }];

test("동일 main SHA의 최신 CI 실행 core·verify 둘 다 녹색이어야 한다", () => {
  assert.deepEqual(validateBundleReleaseCi(SHA, runs(), checks()), { runId: 1, checkSuiteId: 20, core: "success", verify: "success" });
  const failed = runs(); failed[0].workflow_runs.push({ ...failed[0].workflow_runs[0], id: 2, run_attempt: 2, conclusion: "failure" });
  assert.throws(() => validateBundleReleaseCi(SHA, failed, checks()), { code: "CI_NOT_GREEN" });
  for (const field of ["head_sha", "conclusion"]) {
    const changed = checks(); changed[0].check_runs[1][field] = field === "head_sha" ? "b".repeat(40) : "failure";
    assert.throws(() => validateBundleReleaseCi(SHA, runs(), changed), { code: "CI_NOT_GREEN" });
  }
  const otherSuite = checks(); otherSuite[0].check_runs[1].check_suite.id = 999;
  assert.throws(() => validateBundleReleaseCi(SHA, runs(), otherSuite), { code: "CI_NOT_GREEN" });
});

test("동일 main SHA의 정식 수동 CI 성공을 받고 PR·다른 SHA·suite 혼합·미완료는 거부한다", () => {
  const pages = runs();
  pages[0].workflow_runs[0].conclusion = "failure";
  const manual = { ...pages[0].workflow_runs[0], id: 2, run_number: 2, event: "workflow_dispatch", conclusion: "success", check_suite_id: 30 };
  pages[0].workflow_runs.push(manual);
  const currentChecks = checks();
  for (const check of currentChecks[0].check_runs) check.check_suite.id = 30;
  assert.deepEqual(validateBundleReleaseCi(SHA, pages, currentChecks), { runId: 2, checkSuiteId: 30, core: "success", verify: "success" });
  for (const mutation of [{ event: "pull_request" }, { head_sha: "b".repeat(40) }, { status: "queued", conclusion: null }]) {
    const changed = structuredClone(pages);
    Object.assign(changed[0].workflow_runs[1], mutation);
    assert.throws(() => validateBundleReleaseCi(SHA, changed, currentChecks), { code: "CI_NOT_GREEN" });
  }
  assert.throws(() => validateBundleReleaseCi(SHA, pages, checks()), { code: "CI_NOT_GREEN" });
});

function commandFixture(changes = {}) {
  const table = {
    "branch --show-current": "main", "status --porcelain": "", "rev-parse HEAD": SHA,
    "remote get-url origin": "https://github.com/blue45f/toonstudio.git",
    "ls-remote --heads origin refs/heads/main": `${SHA}\trefs/heads/main`, "rev-parse --git-common-dir": "/private/common-git", ...changes,
  };
  return (exe, args) => exe === "gh" ? JSON.stringify(args.at(-1).includes("check-runs") ? checks() : runs()) : table[args.join(" ")];
}
const standingRead = () => JSON.stringify({ scope: "cloudflare-static-production", grantedAt: "2026-10-13" });

test("상시 승인·정확한 main·clean·방금 읽은 remote main을 모두 요구한다", () => {
  assert.equal(authorizeBundleR2Production({ approvedSha: SHA, environment: {}, command: commandFixture(), read: standingRead }).approvedSha, SHA);
  for (const changes of [{ "branch --show-current": "codex/feature" }, { "status --porcelain": " M source.ts" },
    { "rev-parse HEAD": "b".repeat(40) }, { "ls-remote --heads origin refs/heads/main": `${"b".repeat(40)}\trefs/heads/main` }]) {
    assert.throws(() => authorizeBundleR2Production({ approvedSha: SHA, environment: {}, command: commandFixture(changes), read: standingRead }));
  }
  assert.throws(() => authorizeBundleR2Production({ approvedSha: SHA, environment: {}, command: commandFixture(), read: () => "broken" }), { code: "STANDING_APPROVAL" });
  assert.throws(() => authorizeBundleR2Production({ approvedSha: SHA, environment: { TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL: "other-scope" }, command: commandFixture(), read: standingRead }), { code: "APPROVAL_SCOPE" });
});

test("worktree 공용 lock과 동일 SHA 실행 기록을 보존하며 자동 재실행하지 않는다", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "bundle-r2-gate-")));
  try {
    const gate = { gitCommonDir: root, approvedSha: SHA, ci: { core: "success", verify: "success" } }, identity = { catalogSha256: "b".repeat(64) };
    const attempt = acquireBundleR2Attempt(gate, identity);
    assert.throws(() => acquireBundleR2Attempt(gate, { catalogSha256: "c".repeat(64) }), { code: "SINGLE_EXECUTOR" });
    attempt.append({ phase: "failed", code: "PUT_OUTCOME_UNCERTAIN", automaticRetry: false });
    attempt.close();
    assert.match(readFileSync(attempt.path, "utf8"), /PUT_OUTCOME_UNCERTAIN/u);
    assert.throws(() => acquireBundleR2Attempt(gate, identity), { code: "ATTEMPT_ALREADY_RECORDED" });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
