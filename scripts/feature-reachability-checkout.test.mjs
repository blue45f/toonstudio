import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const root = fileURLToPath(new URL("../", import.meta.url));
const script = "scripts/verify-toonstudio-feature-reachability.mjs";
const workflowPath = ".github/workflows/toonstudio-feature-reachability.yml";
const testPath = "scripts/feature-reachability-checkout.test.mjs";
const workflow = readFileSync(join(root, workflowPath), "utf8");

function sparsePaths() {
  const block = workflow.match(/^ {10}sparse-checkout: \|\n((?: {12}[^\n]+\n)+)/mu)?.[1];
  assert.ok(block, "검증에 필요한 입력 범위를 명시해야 합니다.");
  return block.trim().split("\n").map((line) => line.trim().replace(/^\//u, "").replace(/\/$/u, ""));
}

test("기능 경로 검사는 원화·의존성 전체 다운로드 없이 원래 검증 명령과 제한을 유지한다", () => {
  assert.deepEqual(sparsePaths(), ["apps/web/src", script, workflowPath, testPath]);
  assert.match(workflow, /filter: blob:none/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /timeout-minutes: 10/u);
  assert.match(workflow, /run: node scripts\/verify-toonstudio-feature-reachability\.mjs/u);
  assert.match(workflow, /run: node --test scripts\/feature-reachability-checkout\.test\.mjs/u);
  assert.doesNotMatch(workflow, /pnpm\/action-setup|pnpm install|cache: pnpm/u);
});

test("제한된 소스만 있어도 전체 작업공간과 동일한 기능 도달성 결과를 낸다", { timeout: 120_000 }, () => {
  const fixture = mkdtempSync(join(tmpdir(), "feature-reachability-source-"));
  try {
    for (const path of sparsePaths()) {
      const target = join(fixture, path);
      mkdirSync(dirname(target), { recursive: true });
      cpSync(join(root, path), target, { recursive: true });
    }
    assert.equal(existsSync(join(fixture, "node_modules")), false);
    assert.equal(existsSync(join(fixture, "package.json")), false);
    assert.equal(existsSync(join(fixture, "apps/web/public/assets")), false);
    const full = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    const focused = spawnSync(process.execPath, [script], { cwd: fixture, encoding: "utf8" });
    assert.equal(full.status, 0, full.stderr);
    assert.equal(focused.status, 0, focused.stderr);
    assert.match(full.stdout, /feature reachability passed \(53 required modules,/u);
    assert.equal(focused.stdout, full.stdout);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
