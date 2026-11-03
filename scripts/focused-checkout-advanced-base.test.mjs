import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { fixtureGitEnvironment } from "./ci-checkout-test-helpers.mjs";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("PR 이벤트 뒤 main이 앞서도 인증 종료 후 기준 커밋을 추가 전송 없이 읽는다", () => {
  const workflow = parse(readFileSync(new URL("../.github/workflows/toonstudio-session-goals.yml", import.meta.url), "utf8"));
  const checkout = workflow.jobs["focused-validation"].steps.find((s) => s.uses?.startsWith("actions/checkout@"));
  assert.equal(checkout.with["fetch-depth"], "${{ github.event_name != 'pull_request' && 1 || 0 }}");
  assert.equal(checkout.with.filter, "blob:none");
  assert.equal(checkout.with["persist-credentials"], false);
  const root = mkdtempSync(join(tmpdir(), "focused-advanced-base-"));
  const remote = join(root, "remote");
  const env = fixtureGitEnvironment(root);
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = (message) => {
    git(remote, "add", ".");
    git(remote, "-c", "user.name=검증", "-c", "user.email=ci@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", message);
  };
  try {
    mkdirSync(remote);
    git(remote, "init", "-q", "-b", "main");
    git(remote, "config", "uploadpack.allowFilter", "true");
    writeFileSync(join(remote, "old.txt"), "기준 원문\n");
    commit("base");
    const base = git(remote, "rev-parse", "HEAD");
    const blob = git(remote, "rev-parse", "HEAD:old.txt");
    git(remote, "checkout", "-qb", "feature");
    writeFileSync(join(remote, "feature.txt"), "기능\n");
    commit("feature");
    git(remote, "checkout", "-q", "main");
    for (let i = 0; i < 3; i++) {
      writeFileSync(join(remote, "main.txt"), String(i));
      commit(`advance-${i}`);
    }
    git(remote, "-c", "user.name=검증", "-c", "user.email=ci@example.invalid", "-c", "commit.gpgsign=false", "merge", "-q", "--no-ff", "feature", "-m", "merge");
    const shallow = join(root, "shallow");
    git(root, "clone", "-q", "--filter=blob:none", "--depth=2", "--no-checkout", `file://${remote}`, shallow);
    const run = (cwd, ...args) => spawnSync("git", args, { cwd, env: { ...env, GIT_NO_LAZY_FETCH: "1" }, encoding: "utf8" });
    assert.notEqual(run(shallow, "cat-file", "-e", `${base}^{commit}`).status, 0, "이전 깊이 2의 누락을 재현해야 합니다.");
    const complete = join(root, "complete");
    git(root, "clone", "-q", "--filter=blob:none", "--no-checkout", `file://${remote}`, complete);
    git(complete, "remote", "set-url", "origin", `file://${join(root, "unavailable")}`);
    assert.equal(run(complete, "cat-file", "-e", `${base}^{commit}`).status, 0);
    assert.notEqual(run(complete, "cat-file", "-e", blob).status, 0, "이전 파일 blob은 제외합니다.");
    const diff = run(complete, "diff", "--no-renames", "--name-only", base, "HEAD");
    assert.equal(diff.status, 0, diff.stderr);
    assert.deepEqual(diff.stdout.trim().split("\n"), ["feature.txt", "main.txt"]);
    assert.notEqual(run(complete, "cat-file", "-e", blob).status, 0, "경로 비교에서 원문을 lazy fetch하면 안 됩니다.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
