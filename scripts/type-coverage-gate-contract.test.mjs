import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const ciSource = readFileSync(
  new URL("../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

const jobs = ciSource
  .slice(ciSource.indexOf("\njobs:\n") + 7)
  .split(/(?=^ {2}[a-z][a-z0-9-]*:\n)/m);

function job(name) {
  const block = jobs.find((entry) => entry.startsWith(`  ${name}:\n`));
  assert.ok(block, `missing job: ${name}`);
  return block;
}

// The ratchet floor lives in exactly one place: the check:type-coverage
// script. The CI step must call that script, never a second copy of the
// threshold, so the number cannot drift between local and CI runs.
const EXPECTED_SCRIPT = "type-coverage --at-least 95";
const EXPECTED_VERSION = "2.30.3";

test("type-coverage is a pinned dev-only dependency", () => {
  assert.equal(packageJson.devDependencies?.["type-coverage"], EXPECTED_VERSION);
  assert.equal(packageJson.dependencies?.["type-coverage"], undefined);
});

test("the ratchet script fixes the typed-identifier floor at 95 percent", () => {
  assert.equal(packageJson.scripts?.["check:type-coverage"], EXPECTED_SCRIPT);
  const atLeast = Number(EXPECTED_SCRIPT.match(/--at-least (\d+(?:\.\d+)?)/u)?.[1]);
  assert.ok(atLeast >= 95, "floor must not silently drop below the adopted baseline");
});

test("the core typecheck job enforces the ratchet after installing", () => {
  const typecheck = job("typecheck");
  const install = typecheck.indexOf("pnpm install --frozen-lockfile");
  const typecheckRun = typecheck.indexOf("pnpm run typecheck\n");
  const gate = typecheck.indexOf("pnpm run check:type-coverage");
  assert.ok(install >= 0, "typecheck job must install dependencies first");
  assert.ok(typecheckRun > install, "typecheck must run after install");
  assert.ok(gate > typecheckRun, "type-coverage gate must run after the typecheck");
  assert.doesNotMatch(typecheck, /type-coverage --at-least/, "threshold must not be duplicated in the workflow");
});

test("the preflight wiring runs this contract before installing", () => {
  const typecheck = job("typecheck");
  const contract = typecheck.indexOf("scripts/type-coverage-gate-contract.test.mjs");
  const install = typecheck.indexOf("pnpm install --frozen-lockfile");
  assert.ok(contract >= 0, "preflight must execute the type-coverage contract test");
  assert.ok(contract < install, "contract tests run before dependency installation");
});
