import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parse } from "yaml";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

function fixtureGitEnv(inheritedEnv = process.env) {
  // 훅이 전달한 저장소·인덱스·객체·설정 경로를 합성 저장소에 물려주지 않는다.
  return {
    ...Object.fromEntries(Object.entries(inheritedEnv).filter(([key]) => !/^GIT_/iu.test(key))),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
  };
}

function fixtureGit(root, inheritedEnv = process.env) {
  const env = fixtureGitEnv(inheritedEnv);
  return (...args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", env });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
}

function focusedCheckoutStep() {
  const source = readFileSync(new URL("../.github/workflows/toonstudio-session-goals.yml", import.meta.url), "utf8");
  const checkout = parse(source).jobs["focused-validation"].steps.find((step) => step.uses?.startsWith("actions/checkout@"));
  return { source, checkout };
}

function assertFocusedCheckout(root, checkout, inheritedEnv = process.env) {
  const prefix = "apps/web/public/assets/studio/cc0-20260906/";
  const manifest = `${prefix}manifest.json`;
  const payloads = [`${prefix}textures/base.webp`, `${prefix}textures/roughness.jpg`];
  const unrelated = "apps/web/public/assets/studio/unrelated/model.glb";
  const git = fixtureGit(root, inheritedEnv);
  git("init", "--quiet");
  for (const path of [manifest, ...payloads, unrelated]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), "합성 자산\n");
  }
  git("add", ".");
  git("-c", "user.name=CI Test", "-c", "user.email=ci@example.test", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
  git("config", "core.sparseCheckout", "true");
  git("config", "core.sparseCheckoutCone", "false");
  for (const event of ["workflow_dispatch", "pull_request"]) {
    const patterns = checkout.with["sparse-checkout"].replace(/\$\{\{ github\.event_name == 'pull_request' && '([^']+)' \|\| '' \}\}/gu,
      (_, path) => event === "pull_request" ? path : "");
    writeFileSync(join(root, ".git/info/sparse-checkout"), patterns);
    git("read-tree", "-mu", "HEAD");
    assert.equal(existsSync(join(root, manifest)), true);
    for (const path of payloads) assert.equal(existsSync(join(root, path)), event === "pull_request", `${event}: ${path}`);
    assert.equal(existsSync(join(root, unrelated)), false);
  }
}

test("PR related 검사는 CC0 실물 자산을 복원하고 수동 검사는 manifest만 유지한다", () => {
  const { source, checkout } = focusedCheckoutStep();
  assert.equal(checkout.with.filter, "blob:none");
  assert.equal(checkout.with["persist-credentials"], false);
  assert.doesNotMatch(source, /--exclude ['"]\*\*\/studio-marketplace-cc0-catalog\.test\.ts/u);
  const root = realpathSync(mkdtempSync(join(tmpdir(), "focused-cc0-inputs-")));
  try {
    assertFocusedCheckout(root, checkout);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("훅의 Git 환경을 격리해 임시 부모 HEAD·설정·인덱스를 보존하고 자식 checkout을 실행한다", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "focused-cc0-hook-env-")));
  const parent = join(root, "parent");
  const child = join(root, "child");
  mkdirSync(parent);
  mkdirSync(child);
  const parentGit = fixtureGit(parent);
  try {
    parentGit("init", "--quiet");
    writeFileSync(join(parent, "tracked.txt"), "부모 커밋\n");
    parentGit("add", "tracked.txt");
    parentGit("-c", "user.name=CI Test", "-c", "user.email=ci@example.test", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "부모 합성 저장소");
    writeFileSync(join(parent, "staged.txt"), "부모 스테이지\n");
    parentGit("add", "staged.txt");
    writeFileSync(join(parent, "tracked.txt"), "부모 미스테이지 변경\n");

    const parentGitDir = join(parent, ".git");
    const before = {
      head: parentGit("rev-parse", "HEAD"),
      config: readFileSync(join(parentGitDir, "config")),
      index: readFileSync(join(parentGitDir, "index")),
    };
    // 모든 오염 경로는 폐기 가능한 임시 부모 저장소만 가리킨다.
    const hookEnv = {
      ...fixtureGitEnv(),
      GIT_DIR: parentGitDir,
      GIT_COMMON_DIR: parentGitDir,
      GIT_WORK_TREE: parent,
      GIT_INDEX_FILE: join(parentGitDir, "index"),
      GIT_OBJECT_DIRECTORY: join(parentGitDir, "objects"),
      GIT_ALTERNATE_OBJECT_DIRECTORIES: join(parentGitDir, "objects"),
      GIT_CONFIG_GLOBAL: join(parentGitDir, "config"),
      GIT_CONFIG_SYSTEM: join(parentGitDir, "config"),
      GIT_CONFIG_NOSYSTEM: "0",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.bare",
      GIT_CONFIG_VALUE_0: "true",
      GIT_PREFIX: "hooks/",
      GIT_FUTURE_FIXTURE_SETTING: "상속 금지",
    };
    const isolated = fixtureGitEnv(hookEnv);
    assert.deepEqual(Object.keys(isolated).filter((key) => /^GIT_/iu.test(key)).sort(), ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM"]);
    assert.equal(isolated.GIT_CONFIG_GLOBAL, "/dev/null");
    assert.equal(isolated.GIT_CONFIG_NOSYSTEM, "1");

    assertFocusedCheckout(child, focusedCheckoutStep().checkout, hookEnv);
    assert.equal(fixtureGit(child)("rev-parse", "--show-toplevel"), child);
    assert.notEqual(fixtureGit(child)("rev-parse", "HEAD"), before.head);
    assert.equal(parentGit("rev-parse", "HEAD"), before.head);
    assert.deepEqual(readFileSync(join(parentGitDir, "config")), before.config);
    assert.deepEqual(readFileSync(join(parentGitDir, "index")), before.index);
    assert.equal(parentGit("config", "--local", "core.bare"), "false");
    assert.equal(readFileSync(join(parent, "tracked.txt"), "utf8"), "부모 미스테이지 변경\n");
    assert.equal(readFileSync(join(parent, "staged.txt"), "utf8"), "부모 스테이지\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
