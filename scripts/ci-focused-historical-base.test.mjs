import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

// PR 이벤트의 기준 SHA와 체크아웃한 병합 커밋의 현재 main 부모가 다를 때를 재현한다.
test("main이 전진해도 filtered PR checkout에 이전 기준 커밋과 tree가 남는다", () => {
  const root = mkdtempSync(join(tmpdir(), "focused-historical-base-"));
  const remote = join(root, "remote");
  const shallow = join(root, "shallow");
  const complete = join(root, "complete");
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "CI Fixture", GIT_AUTHOR_EMAIL: "ci@example.invalid",
    GIT_COMMITTER_NAME: "CI Fixture", GIT_COMMITTER_EMAIL: "ci@example.invalid",
    GIT_NO_LAZY_FETCH: "1",
  };
  const run = (cwd, args) => spawnSync("git", args, { cwd, env, encoding: "utf8" });
  const git = (cwd, ...args) => {
    const result = run(cwd, args);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    mkdirSync(remote);
    git(remote, "init", "--quiet", "-b", "main");
    git(remote, "config", "uploadpack.allowFilter", "true");
    writeFileSync(join(remote, "base.ts"), "export const base = 1;\n");
    git(remote, "add", ".");
    git(remote, "commit", "--quiet", "-m", "기준");
    const base = git(remote, "rev-parse", "HEAD");
    const blob = git(remote, "rev-parse", "HEAD:base.ts");
    git(remote, "checkout", "--quiet", "-b", "feature");
    writeFileSync(join(remote, "feature.ts"), "export const feature = 1;\n");
    git(remote, "add", ".");
    git(remote, "commit", "--quiet", "-m", "PR 변경");
    git(remote, "checkout", "--quiet", "main");
    for (let index = 0; index < 4; index += 1) {
      writeFileSync(join(remote, "main.ts"), `export const version = ${index};\n`);
      git(remote, "add", ".");
      git(remote, "commit", "--quiet", "-m", `main ${index}`);
    }
    git(remote, "merge", "--quiet", "--no-ff", "feature", "-m", "현재 main과 병합");
    const url = `file://${remote}`;
    git(root, "clone", "--quiet", "--filter=blob:none", "--depth=2", "--no-checkout", url, shallow);
    assert.notEqual(run(shallow, ["cat-file", "-e", `${base}^{commit}`]).status, 0, "기존 깊이 2에서 이전 기준은 누락된다.");
    const workflow = readFileSync(new URL("../.github/workflows/toonstudio-session-goals.yml", import.meta.url), "utf8");
    assert.ok(workflow.includes("fetch-depth: ${{ github.event_name != 'pull_request' && 1 || 0 }}"));
    assert.match(workflow, /filter: blob:none/u);
    assert.match(workflow, /persist-credentials: false/u);
    git(root, "clone", "--quiet", "--filter=blob:none", "--no-checkout", url, complete);
    git(complete, "remote", "set-url", "origin", `file://${join(root, "없어진-원격")}`);
    git(complete, "cat-file", "-e", `${base}^{commit}`);
    git(complete, "cat-file", "-e", `${base}^{tree}`);
    assert.notEqual(run(complete, ["cat-file", "-e", blob]).status, 0, "이전 원문 blob은 받지 않는다.");
    assert.equal(git(complete, "diff", "--no-renames", "--name-only", base, "HEAD"), "feature.ts\nmain.ts");
    assert.notEqual(run(complete, ["cat-file", "-e", blob]).status, 0, "변경 경로 비교는 blob을 추가로 받지 않는다.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
