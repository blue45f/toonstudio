import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 이 파일은 루트 Vitest 수집 대상이면서 `pnpm test:unconnected-code`(node --test)로도 직접 돌려야 하므로,
// 러너에 따라 테스트 등록 함수를 바꾼다. node:test 의 test 만 쓰면 Vitest 가 스위트를 찾지 못해 파일 전체가 실패한다.
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "check-unconnected-code.mjs");

function makeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), "unconnected-code-"));
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, "apps/web/src", path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
  return root;
}

function runGate(root, extraArgs = []) {
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--root", root, "--json", ...extraArgs],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function findingKeys(report) {
  return report.findings.map(
    (finding) => `${finding.category}:${finding.path}${finding.name ? `#${finding.name}` : ""}`,
  );
}

const ROUTE = "app/routes/home.routes.tsx";

test("reports a module that nothing imports as orphan-module", () => {
  const root = makeFixture({
    [ROUTE]: `export default function HomeRoute() { return null; }\n`,
    "shared/lib/orphan.ts": `export const orphanValue = 1;\n`,
  });
  const report = runGate(root);
  assert.deepEqual(findingKeys(report), ["orphan-module:apps/web/src/shared/lib/orphan.ts"]);
});

test("does not report a component rendered by a route", () => {
  const root = makeFixture({
    [ROUTE]: [
      `import { SaveStatusBar } from "../../domains/save/SaveStatusBar";`,
      `export default function HomeRoute() { return <SaveStatusBar />; }`,
    ].join("\n"),
    "domains/save/SaveStatusBar.tsx": `export function SaveStatusBar() { return null; }\n`,
  });
  const report = runGate(root);
  assert.deepEqual(findingKeys(report), []);
});

test("reports the F5.1 pattern: imported by a host but never rendered", () => {
  const root = makeFixture({
    [ROUTE]: [
      `import { EditorHost } from "../../domains/EditorHost";`,
      `export default function HomeRoute() { return <EditorHost />; }`,
    ].join("\n"),
    "domains/EditorHost.tsx": [
      `import { SaveStatusBar } from "./save/SaveStatusBar";`,
      `export function EditorHost() { return <main />; }`,
    ].join("\n"),
    "domains/save/SaveStatusBar.tsx": `export function SaveStatusBar() { return null; }\n`,
  });
  const report = runGate(root);
  assert.deepEqual(findingKeys(report), [
    "unmounted-component:apps/web/src/domains/save/SaveStatusBar.tsx#SaveStatusBar",
  ]);
});

test("traces component usage through a barrel re-export", () => {
  const root = makeFixture({
    [ROUTE]: [
      `import { SaveStatusBar } from "../../domains/save";`,
      `export default function HomeRoute() { return <SaveStatusBar />; }`,
    ].join("\n"),
    "domains/save/index.ts": `export { SaveStatusBar } from "./SaveStatusBar";\n`,
    "domains/save/SaveStatusBar.tsx": `export function SaveStatusBar() { return null; }\n`,
  });
  const report = runGate(root);
  assert.deepEqual(findingKeys(report), []);
});

test("reports a barrel re-export that nobody consumes as unmounted", () => {
  const root = makeFixture({
    [ROUTE]: `export default function HomeRoute() { return null; }\n`,
    "domains/save/index.ts": `export { SaveStatusBar } from "./SaveStatusBar";\n`,
    "domains/save/SaveStatusBar.tsx": `export function SaveStatusBar() { return null; }\n`,
  });
  const report = runGate(root);
  assert.deepEqual(findingKeys(report), [
    "orphan-module:apps/web/src/domains/save/index.ts",
    "unmounted-component:apps/web/src/domains/save/SaveStatusBar.tsx#SaveStatusBar",
  ]);
});

test("classifies a module imported only by tests as test-only-module", () => {
  const root = makeFixture({
    [ROUTE]: `export default function HomeRoute() { return null; }\n`,
    "shared/lib/fixture-only.ts": `export const fixtureOnly = 1;\n`,
    "shared/lib/fixture-only.test.ts": `import { fixtureOnly } from "./fixture-only";\nvoid fixtureOnly;\n`,
  });
  const report = runGate(root);
  assert.deepEqual(findingKeys(report), [
    "test-only-module:apps/web/src/shared/lib/fixture-only.ts",
  ]);
});

test("treats a dynamic import as a connection and a lazy mount", () => {
  const root = makeFixture({
    [ROUTE]: [
      `import { lazy } from "react";`,
      `const LazyPanel = lazy(() => import("../../domains/LazyPanel"));`,
      `export default function HomeRoute() { return <LazyPanel />; }`,
    ].join("\n"),
    "domains/LazyPanel.tsx": `export default function LazyPanel() { return null; }\n`,
  });
  const report = runGate(root);
  assert.deepEqual(findingKeys(report), []);
});

test("supports @/ alias imports and aliased component bindings", () => {
  const root = makeFixture({
    [ROUTE]: [
      `import { SaveStatusBar as StatusBar } from "@/domains/save/SaveStatusBar";`,
      `export default function HomeRoute() { return <StatusBar />; }`,
    ].join("\n"),
    "domains/save/SaveStatusBar.tsx": `export function SaveStatusBar() { return null; }\n`,
  });
  const report = runGate(root);
  assert.deepEqual(findingKeys(report), []);
});

test("gate mode passes on baseline findings and fails on new inflow", () => {
  const root = makeFixture({
    [ROUTE]: `export default function HomeRoute() { return null; }\n`,
    "shared/lib/known-orphan.ts": `export const known = 1;\n`,
  });
  writeFileSync(
    join(root, "scripts-baseline.json"),
    JSON.stringify({ entries: ["orphan-module:apps/web/src/shared/lib/known-orphan.ts"] }),
  );
  const passing = spawnSync(
    process.execPath,
    [scriptPath, "--root", root, "--baseline", "scripts-baseline.json", "--check"],
    { encoding: "utf8" },
  );
  assert.equal(passing.status, 0, passing.stderr);

  writeFileSync(
    join(root, "apps/web/src/shared/lib/new-orphan.ts"),
    `export const fresh = 1;\n`,
  );
  const failing = spawnSync(
    process.execPath,
    [scriptPath, "--root", root, "--baseline", "scripts-baseline.json", "--check"],
    { encoding: "utf8" },
  );
  assert.equal(failing.status, 1);
  assert.match(failing.stderr, /new unconnected finding/);
});

test("--write-baseline snapshots current findings", () => {
  const root = makeFixture({
    [ROUTE]: `export default function HomeRoute() { return null; }\n`,
    "shared/lib/orphan.ts": `export const orphanValue = 1;\n`,
  });
  const write = spawnSync(
    process.execPath,
    [scriptPath, "--root", root, "--baseline", "snapshot.json", "--write-baseline"],
    { encoding: "utf8" },
  );
  assert.equal(write.status, 0, write.stderr);
  const check = spawnSync(
    process.execPath,
    [scriptPath, "--root", root, "--baseline", "snapshot.json", "--check"],
    { encoding: "utf8" },
  );
  assert.equal(check.status, 0, check.stderr);
});
