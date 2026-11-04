import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parse } from "yaml";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("PR related 검사는 CC0 실물 자산을 복원하고 수동 검사는 manifest만 유지한다", () => {
  const source = readFileSync(new URL("../.github/workflows/toonstudio-session-goals.yml", import.meta.url), "utf8");
  const checkout = parse(source).jobs["focused-validation"].steps.find((step) => step.uses === "actions/checkout@v7");
  assert.equal(checkout.with.filter, "blob:none");
  assert.equal(checkout.with["persist-credentials"], false);
  assert.doesNotMatch(source, /--exclude ['"]\*\*\/studio-marketplace-cc0-catalog\.test\.ts/u);
  const root = mkdtempSync(join(tmpdir(), "focused-cc0-inputs-"));
  const prefix = "apps/web/public/assets/studio/cc0-20260906/";
  const manifest = `${prefix}manifest.json`;
  const payloads = [`${prefix}textures/base.webp`, `${prefix}textures/roughness.jpg`];
  const unrelated = "apps/web/public/assets/studio/unrelated/model.glb";
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
    assert.equal(result.status, 0, result.stderr);
  };
  try {
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
  } finally { rmSync(root, { recursive: true, force: true }); }
});
