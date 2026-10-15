import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runCli, writeTree } from "./lib/code-structure-gates-test-support.mjs";
import { buildEagerGraph, resolveStudioEntries, STUDIO_ADAPTER_ENTRY } from "./lib/studio-eager-graph.mjs";
import { FORBIDDEN_DOMAINS, TOTAL_BYTES_TOLERANCE } from "./lib/studio-eager-graph-policy.mjs";
import {
  BaselineError, evaluateRatchet, listIncreases, measureGraph, tightenBaseline, updateBaseline, validateBaseline,
} from "./lib/studio-eager-graph-ratchet.mjs";
import { createModuleResolver } from "./lib/studio-eager-graph-resolve.mjs";
import { scanModuleEdges } from "./lib/studio-eager-graph-scan.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const SCRIPT = fileURLToPath(new URL("./check-studio-eager-graph.mjs", import.meta.url));
const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const BASELINE_FILE = "scripts/studio-eager-graph-baseline.json";
const CREATOR = "apps/web/src/domains/creator";
const now = new Date("2026-10-15T00:00:00Z");

/** 앱 셸과 Studio 어댑터, 지연 경계·금지 도메인·워크스페이스 패키지를 모두 가진 미니 모노레포. */
const FIXTURE_FILES = {
  "tsconfig.json": JSON.stringify({
    compilerOptions: {
      target: "ES2022", module: "esnext", moduleResolution: "bundler", jsx: "react-jsx", resolveJsonModule: true,
      allowImportingTsExtensions: true, verbatimModuleSyntax: true, strict: true, noEmit: true,
      paths: { "@/*": ["./apps/web/src/*"], "shimmed-lib": ["./apps/web/src/shims/shimmed-lib.d.ts"] },
    },
  }),
  "package.json": JSON.stringify({ name: "fixture-root", private: true }),
  "packages/core/package.json": JSON.stringify({ name: "@toonstudio/core", main: "./src/index.ts", types: "./src/index.ts" }),
  "packages/core/src/index.ts": 'export * from "./util";\n',
  "packages/core/src/util.ts": "export const util = 1;\n",
  "apps/web/index.html": '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/app/main.tsx"></script></body></html>\n',
  "apps/web/src/app/main.tsx": [
    'import "./styles.css";',
    'import { shell } from "@/shared/shell";',
    "export const main = shell;",
    'export const studioRoute = () => import("../domains/creator/studio-legacy-editor-adapter");',
    "",
  ].join("\n"),
  "apps/web/src/app/styles.css": "body { margin: 0 }\n",
  "apps/web/src/shared/shell.ts": [
    'import data from "./data.json";',
    'import type { Heavy } from "../domains/market/heavy";',
    "export type { Heavy };",
    "export const shell = data.name;",
    "",
  ].join("\n"),
  "apps/web/src/shared/data.json": '{ "name": "shell" }\n',
  "apps/web/src/domains/market/heavy.ts": `export interface Heavy { id: string }\nexport const marketOnly = ${JSON.stringify("x".repeat(400))};\n`,
  [`${CREATOR}/studio-legacy-editor-adapter.tsx`]: [
    'import { host } from "./host";',
    'import { util } from "@toonstudio/core";',
    'import shader from "./shader.wgsl?raw";',
    'import WorkerCtor from "./worker.ts?worker";',
    'import icon from "./icon.svg";',
    "export const adapter = [host, util, shader, WorkerCtor, icon];",
    "",
  ].join("\n"),
  [`${CREATOR}/shader.wgsl`]: "@vertex fn main() {}\n",
  [`${CREATOR}/worker.ts`]: "export default class {}\n",
  [`${CREATOR}/icon.svg`]: "<svg/>\n",
  [`${CREATOR}/host.ts`]: [
    'import { panelLoader } from "./panel-loader";',
    'import { pure } from "./pure.js";',
    'import { type Hint } from "./vrm/hint";',
    'import { catalog } from "./registry";',
    'import { z } from "zod";',
    "export type { Hint };",
    "export const host = [panelLoader, pure, catalog, z];",
    "",
  ].join("\n"),
  [`${CREATOR}/panel-loader.ts`]: [
    'export const panelLoader = () => import("./lazy-panel");',
    'export const tooling = () => import("./invalidated");',
    "export const template = (name: string) => import(`./${name}`);",
    "",
  ].join("\n"),
  [`${CREATOR}/lazy-panel.ts`]: 'import { chart } from "../charts/chart";\nexport const panel = chart;\n',
  "apps/web/src/domains/charts/chart.ts": `export const chart = ${JSON.stringify("c".repeat(600))};\n`,
  [`${CREATOR}/pure.ts`]: 'import { invalidated } from "./invalidated";\nexport const pure = invalidated;\n',
  [`${CREATOR}/invalidated.ts`]: "export const invalidated = 1;\n",
  [`${CREATOR}/registry/index.ts`]: 'export * from "./items";\n',
  [`${CREATOR}/registry/items.ts`]: "export const catalog = [1, 2, 3];\n",
  [`${CREATOR}/vrm/hint.ts`]: "export interface Hint { id: string }\n",
};

function createFixture(t, extra = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "toonstudio-eager-graph-"));
  (t.onTestFinished ?? t.after.bind(t))(() => rmSync(root, { force: true, recursive: true }));
  writeTree(root, { ...FIXTURE_FILES, ...extra });
  mkdirSync(path.join(root, "node_modules/@toonstudio"), { recursive: true });
  symlinkSync("../../packages/core", path.join(root, "node_modules/@toonstudio/core"), "dir");
  return root;
}

const bootstrap = (root, reason = "최초 기준선") => runCli(SCRIPT, root, ["--update-baseline", "--reason", reason]);
const readBaseline = (root) => JSON.parse(readFileSync(path.join(root, BASELINE_FILE), "utf8"));

function snapshotOf(root) {
  const graph = buildEagerGraph({ root });
  return { graph, measurement: measureGraph(graph) };
}

test("간선 추출: import type 은 제외하고 인라인 type·부수효과 import 는 정적, 리터럴 import() 는 지연으로 센다", () => {
  const edges = scanModuleEdges([
    'import a from "./a";',
    'import "./side-effect";',
    'import type { T } from "./type-only";',
    'import { type U } from "./inline-type";',
    'import { type V, w } from "./mixed";',
    'export * from "./star";',
    'export * as ns from "./namespace";',
    'export { x } from "./named";',
    'export type { Y } from "./export-type";',
    'export { type Z } from "./export-inline-type";',
    'import eq = require("./equals");',
    "export const lazy = () => import('./lazy');",
    "export const sub = () => import(`./template`);",
    "export const opaque = (n: string) => import(`./${n}`);",
    'export type Dyn = typeof import("./type-position");',
    "",
  ].join("\n"), "sample.ts");
  assert.deepEqual(edges.static, [
    "./a", "./side-effect", "./inline-type", "./mixed", "./star", "./namespace", "./named", "./equals",
  ]);
  assert.deepEqual(edges.typeOnly, ["./type-only", "./export-type", "./export-inline-type"]);
  assert.deepEqual(edges.dynamic, ["./lazy", "./template"]);
  assert.equal(edges.opaqueDynamic, 1);
});

test("간선 추출: 문자열·주석 속 import( 는 간선이 아니고 TSX 도 읽는다", () => {
  const edges = scanModuleEdges([
    'const text = "import(\'./fake\')";',
    "// import('./comment')",
    'import { A } from "./real";',
    "export const view = <A />;",
    "",
  ].join("\n"), "view.tsx");
  assert.deepEqual(edges.static, ["./real"]);
  assert.deepEqual(edges.dynamic, []);
});

test("모듈 해석: 상대·별칭·워크스페이스·디렉터리 index·JSON·Vite 쿼리·외부 패키지를 구분한다", (t) => {
  const root = createFixture(t);
  const { resolve } = createModuleResolver({ root });
  const from = `${CREATOR}/host.ts`;
  assert.deepEqual(resolve("./pure.js", from), { kind: "module", file: `${CREATOR}/pure.ts` });
  assert.deepEqual(resolve("./registry", from), { kind: "module", file: `${CREATOR}/registry/index.ts` });
  assert.deepEqual(resolve("@/shared/data.json", from), { kind: "data", file: "apps/web/src/shared/data.json" });
  assert.deepEqual(resolve("@toonstudio/core", from), { kind: "module", file: "packages/core/src/index.ts" });
  assert.deepEqual(resolve("./shader.wgsl?raw", from), { kind: "data", file: `${CREATOR}/shader.wgsl` });
  assert.deepEqual(resolve("./worker.ts?worker", from), { kind: "worker" });
  assert.deepEqual(resolve("./icon.svg", from), { kind: "asset" });
  assert.deepEqual(resolve("./icon.svg?url", from), { kind: "asset" });
  assert.deepEqual(resolve("zod", from), { kind: "external", packageName: "zod" });
  assert.deepEqual(resolve("@scope/pkg/deep/path", from), { kind: "external", packageName: "@scope/pkg" });
  assert.deepEqual(resolve("node:fs", from), { kind: "external", packageName: "node:fs" });
  assert.equal(resolve("./missing", from).kind, "unresolved");
  // `.d.ts` 보강 파일만 가리키는 paths 항목은 번들러가 쓰지 않으므로 외부 패키지로 본다.
  assert.deepEqual(resolve("shimmed-lib", from), { kind: "external", packageName: "shimmed-lib" });
});

test("그래프: index.html 의 module script 와 Studio 어댑터에서 정적 간선만 따라간다", (t) => {
  const root = createFixture(t);
  assert.deepEqual(resolveStudioEntries(root), ["apps/web/src/app/main.tsx", STUDIO_ADAPTER_ENTRY]);

  const { graph } = snapshotOf(root);
  const reached = [...graph.modules.keys()].sort();
  assert.deepEqual(reached, [
    "apps/web/src/app/main.tsx",
    "apps/web/src/shared/data.json",
    "apps/web/src/shared/shell.ts",
    `${CREATOR}/host.ts`,
    `${CREATOR}/invalidated.ts`,
    `${CREATOR}/panel-loader.ts`,
    `${CREATOR}/pure.ts`,
    `${CREATOR}/registry/index.ts`,
    `${CREATOR}/registry/items.ts`,
    `${CREATOR}/shader.wgsl`,
    `${CREATOR}/studio-legacy-editor-adapter.tsx`,
    `${CREATOR}/vrm/hint.ts`,
    "packages/core/src/index.ts",
    "packages/core/src/util.ts",
  ].sort());
  for (const lazyOnly of [`${CREATOR}/lazy-panel.ts`, "apps/web/src/domains/charts/chart.ts", "apps/web/src/domains/market/heavy.ts", `${CREATOR}/worker.ts`]) {
    assert.equal(graph.modules.has(lazyOnly), false, `${lazyOnly} 는 정적 그래프에 없어야 합니다`);
  }
  assert.equal(graph.totals.modules, reached.length);
  assert.equal(graph.totals.bytes, [...graph.modules.values()].reduce((sum, module) => sum + module.bytes, 0));
  assert.deepEqual([...graph.externalPackages.keys()], ["zod"]);
  assert.equal(graph.unresolved.length, 0);
});

test("그래프: 최단 경로와 지연 무효화(동적 선언 + 정적 도달) 모듈을 복원한다", (t) => {
  const root = createFixture(t);
  const { graph } = snapshotOf(root);
  assert.deepEqual(graph.shortestPath(`${CREATOR}/registry/items.ts`), [
    STUDIO_ADAPTER_ENTRY, `${CREATOR}/host.ts`, `${CREATOR}/registry/index.ts`, `${CREATOR}/registry/items.ts`,
  ]);
  assert.deepEqual(graph.shortestPath("apps/web/src/shared/data.json"), [
    "apps/web/src/app/main.tsx", "apps/web/src/shared/shell.ts", "apps/web/src/shared/data.json",
  ]);
  assert.deepEqual(graph.shortestPath("없는/파일.ts"), []);

  assert.equal(graph.lazyInvalidated.length, 1);
  const [invalidated] = graph.lazyInvalidated;
  assert.equal(invalidated.file, `${CREATOR}/invalidated.ts`);
  assert.deepEqual(invalidated.staticImporters, [`${CREATOR}/pure.ts`]);
  assert.deepEqual(invalidated.dynamicImporters, [`${CREATOR}/panel-loader.ts`]);
});

test("금지 도메인: 인라인 `import { type }` 는 모듈을 끌어오고 `import type` 은 끌어오지 않는다", (t) => {
  const root = createFixture(t);
  const { measurement } = snapshotOf(root);
  assert.deepEqual(measurement.forbidden[`${CREATOR}/vrm`].files, [`${CREATOR}/vrm/hint.ts`]);
  assert.equal(measurement.forbidden["apps/web/src/domains/market"].modules, 0, "import type 으로만 닿는 market/heavy.ts 는 제외된다");
  assert.deepEqual(Object.keys(measurement.forbidden), [...Object.keys(measurement.forbidden)].sort());
  assert.deepEqual(Object.keys(measurement.forbidden).length, FORBIDDEN_DOMAINS.length);
});

test("결정성: 같은 소스는 항상 같은 측정값을 낸다", (t) => {
  const root = createFixture(t);
  assert.deepEqual(snapshotOf(root).measurement, snapshotOf(root).measurement);
});

function baselineFor(root, reason = "테스트") {
  const { graph, measurement } = snapshotOf(root);
  return { graph, measurement, baseline: updateBaseline(null, measurement, { reason, now }).baseline };
}

test("래칫: 같은 상태는 통과한다", (t) => {
  const root = createFixture(t);
  const { graph, measurement, baseline } = baselineFor(root);
  assert.deepEqual(evaluateRatchet({ measurement, baseline, graph }), { violations: [], improvements: [] });
});

test("래칫: 총 정적 도달 크기는 기준선 +1% 정확히까지만 허용한다", () => {
  const graph = { modules: new Map(), shortestPath: () => [], pathIn: () => [], lazyInvalidated: [] };
  const baseline = {
    entries: ["app.ts"], totals: { modules: 10, bytes: 1_000_000 }, entryTotals: {}, modules: {}, folders: {}, forbiddenDomains: {}, lazyInvalidated: [],
  };
  const evaluate = (bytes) => evaluateRatchet({
    graph,
    baseline,
    forbiddenDomains: [],
    measurement: {
      entries: ["app.ts"], totals: { modules: 10, bytes }, entryTotals: {}, modules: {}, folders: {}, forbidden: {}, lazyInvalidated: [],
    },
  });
  assert.equal(TOTAL_BYTES_TOLERANCE, 0.01);
  assert.deepEqual(evaluate(1_010_000).violations, [], "기준선 +1% 와 정확히 같으면 통과");
  const over = evaluate(1_010_001).violations;
  assert.deepEqual(over.map((violation) => violation.kind), ["total-bytes"]);
  assert.equal(over[0].ceiling, 1_010_000);
  assert.deepEqual(evaluate(900_000), { violations: [], improvements: ["총 정적 도달 원본 크기 97.7 KiB 감소"] });
});

test("래칫: 정적 import 한 줄이 시장 도메인을 끌어오면 금지 도메인·총 크기·지연 무효화를 원인 경로와 함께 보고한다", (t) => {
  const root = createFixture(t);
  const { baseline } = baselineFor(root);
  writeTree(root, {
    [`${CREATOR}/probe.ts`]: 'import { marketOnly } from "../market/heavy";\nexport const probe = marketOnly;\n',
    [`${CREATOR}/host.ts`]: readFileSync(path.join(root, `${CREATOR}/host.ts`), "utf8").replace(
      'import { z } from "zod";', 'import { z } from "zod";\nimport { probe } from "./probe";',
    ).replace("[panelLoader,", "[probe, panelLoader,"),
  });
  const { graph, measurement } = snapshotOf(root);
  const { violations } = evaluateRatchet({ measurement, baseline, graph });

  const forbidden = violations.find((violation) => violation.kind === "forbidden-domain");
  assert.equal(forbidden.prefix, "apps/web/src/domains/market");
  assert.equal(forbidden.baselineModules, 0);
  assert.equal(forbidden.currentModules, 1);
  assert.deepEqual(forbidden.added[0].path, [
    STUDIO_ADAPTER_ENTRY, `${CREATOR}/host.ts`, `${CREATOR}/probe.ts`, "apps/web/src/domains/market/heavy.ts",
  ]);
  assert.deepEqual(forbidden.added[0].crossing, { from: `${CREATOR}/probe.ts`, to: "apps/web/src/domains/market/heavy.ts" });
  assert.deepEqual(forbidden.added[0].gateway, { from: `${CREATOR}/host.ts`, to: `${CREATOR}/probe.ts` });
});

test("기준선 modules 는 진입점 소속 비트를 기록한다(1=앱 셸, 2=Studio 어댑터)", (t) => {
  const root = createFixture(t);
  const { baseline } = baselineFor(root);
  assert.equal(baseline.modules["apps/web/src/app/main.tsx"], 1);
  assert.equal(baseline.modules["apps/web/src/shared/shell.ts"], 1);
  assert.equal(baseline.modules[STUDIO_ADAPTER_ENTRY], 2);
  assert.equal(baseline.modules[`${CREATOR}/host.ts`], 2);
  assert.equal(baseline.entryTotals["apps/web/src/app/main.tsx"].modules, 3);
});

test("래칫: 앱 셸이 Studio 모듈을 정적으로 끌어오면 합집합 크기가 그대로여도 앱 셸 폐포 위반이다", (t) => {
  // 합집합 크기에 비해 main.tsx 의 한 줄 증가는 +1% 미만이 되도록 Studio 쪽 모듈을 크게 만든다.
  const root = createFixture(t, { "packages/core/src/util.ts": `export const util = ${JSON.stringify("u".repeat(30_000))};\n` });
  const { baseline } = baselineFor(root);
  writeTree(root, {
    "apps/web/src/app/main.tsx": `import "../domains/creator/host";\n${readFileSync(path.join(root, "apps/web/src/app/main.tsx"), "utf8")}`,
  });
  const { graph, measurement } = snapshotOf(root);
  const { violations } = evaluateRatchet({ measurement, baseline, graph });
  assert.deepEqual(violations.map((violation) => violation.kind), ["app-shell-bytes"], "합집합 총 크기는 허용 범위 안이다");
  const appShell = violations[0];
  assert.equal(appShell.entry, "apps/web/src/app/main.tsx");
  assert.deepEqual(appShell.gateways[0], {
    from: "apps/web/src/app/main.tsx", to: `${CREATOR}/host.ts`, modules: appShell.newModuleCount, bytes: appShell.newModuleBytes,
  });
  assert.deepEqual(appShell.newModules.find((module) => module.file === `${CREATOR}/registry/items.ts`).path, [
    "apps/web/src/app/main.tsx", `${CREATOR}/host.ts`, `${CREATOR}/registry/index.ts`, `${CREATOR}/registry/items.ts`,
  ]);

  // 되돌리면 통과하고, tighten 은 앱 셸 기준선을 올리지 않는다.
  const before = tightenBaseline(baseline, measurement);
  assert.equal(before.baseline.entryTotals["apps/web/src/app/main.tsx"].bytes, baseline.entryTotals["apps/web/src/app/main.tsx"].bytes);
  assert.ok(listIncreases(baseline, measurement).some((line) => line.startsWith("앱 셸 폐포 +")));
});

test("래칫: 진입점 목록이 바뀌면 조용히 비교하지 않고 다시 기록하라고 알린다", (t) => {
  const root = createFixture(t);
  const { graph, measurement, baseline } = baselineFor(root);
  const changed = { ...baseline, entries: [...baseline.entries].reverse() };
  const { violations } = evaluateRatchet({ measurement, baseline: changed, graph });
  assert.equal(violations[0].kind, "entries-changed");
  assert.throws(() => tightenBaseline(changed, measurement), BaselineError);
  assert.ok(listIncreases(changed, measurement).includes("진입점 목록 변경"));
});

test("래칫: 금지 도메인 모듈을 다른 모듈로 교체해 수를 맞춰도 새 모듈은 위반이다", (t) => {
  const root = createFixture(t, { [`${CREATOR}/vrm/other.ts`]: "export const other = 1;\n" });
  const { baseline } = baselineFor(root);
  assert.deepEqual(baseline.forbiddenDomains[`${CREATOR}/vrm`].files, [`${CREATOR}/vrm/hint.ts`]);
  writeTree(root, {
    [`${CREATOR}/host.ts`]: readFileSync(path.join(root, `${CREATOR}/host.ts`), "utf8").replace("./vrm/hint", "./vrm/other"),
  });
  const { graph, measurement } = snapshotOf(root);
  assert.equal(measurement.forbidden[`${CREATOR}/vrm`].modules, 1, "도달 수는 그대로");
  const { violations, improvements } = evaluateRatchet({ measurement, baseline, graph });
  const forbidden = violations.find((violation) => violation.kind === "forbidden-domain");
  assert.deepEqual(forbidden.added.map((module) => module.file), [`${CREATOR}/vrm/other.ts`]);
  assert.ok(improvements.some((line) => line.includes("vrm")), "빠진 모듈은 개선으로 보고한다");
});

test("래칫: 새로 무효화된 지연 모듈은 위반이고 분리하면 개선으로 보고된다", (t) => {
  const root = createFixture(t);
  const { baseline } = baselineFor(root);
  assert.deepEqual(baseline.lazyInvalidated.map((item) => item.file), [`${CREATOR}/invalidated.ts`]);

  // lazy-panel 도 어딘가에서 정적으로 끌려오면 새 무효화다.
  writeTree(root, { [`${CREATOR}/pure.ts`]: 'import { invalidated } from "./invalidated";\nimport { panel } from "./lazy-panel";\nexport const pure = [invalidated, panel];\n' });
  let snapshot = snapshotOf(root);
  const regressed = evaluateRatchet({ ...snapshot, baseline });
  const lazy = regressed.violations.find((violation) => violation.kind === "lazy-invalidated");
  assert.deepEqual(lazy.items.map((item) => item.file), [`${CREATOR}/lazy-panel.ts`]);
  assert.deepEqual(lazy.items[0].staticImporters.map((importer) => importer.file), [`${CREATOR}/pure.ts`]);
  assert.deepEqual(lazy.items[0].dynamicImporters, [`${CREATOR}/panel-loader.ts`]);

  // 원래 무효화 모듈을 정적 import 에서 빼면(= 지연이 실제로 동작) 개선이다.
  writeTree(root, { [`${CREATOR}/pure.ts`]: "export const pure = 1;\n" });
  snapshot = snapshotOf(root);
  const fixed = evaluateRatchet({ ...snapshot, baseline });
  assert.deepEqual(fixed.violations, []);
  assert.ok(fixed.improvements.some((line) => line.includes("지연 무효화 모듈 1개")));
});

test("tighten 은 줄어든 값만 잠그고 새로 늘어난 값은 기록하지 않는다", (t) => {
  const root = createFixture(t);
  const { baseline } = baselineFor(root);
  writeTree(root, { [`${CREATOR}/pure.ts`]: "export const pure = 1;\n" }); // 무효화 해소 + 모듈 감소
  const { measurement } = snapshotOf(root);
  const tightened = tightenBaseline(baseline, measurement);
  assert.deepEqual(tightened.baseline.lazyInvalidated, []);
  assert.ok(tightened.baseline.totals.bytes < baseline.totals.bytes);
  assert.equal(Object.hasOwn(tightened.baseline.modules, `${CREATOR}/invalidated.ts`), false);
  assert.ok(tightened.changes.length >= 2);

  // 새 모듈이 생긴 측정값으로 tighten 해도 목록은 늘지 않고 바이트도 올라가지 않는다.
  writeTree(root, { [`${CREATOR}/extra.ts`]: `export const extra = ${JSON.stringify("e".repeat(2000))};\n`, [`${CREATOR}/pure.ts`]: 'import { extra } from "./extra";\nexport const pure = extra;\n' });
  const grown = tightenBaseline(baseline, snapshotOf(root).measurement);
  assert.ok(grown.baseline.totals.bytes <= baseline.totals.bytes);
  assert.equal(Object.hasOwn(grown.baseline.modules, `${CREATOR}/extra.ts`), false);
  assert.doesNotThrow(() => validateBaseline(grown.baseline));
});

test("update-baseline 은 늘어난 항목이 있을 때만 사유를 요구하고 registrations 에 남긴다", (t) => {
  const root = createFixture(t);
  const { baseline, measurement } = baselineFor(root);
  assert.deepEqual(listIncreases(baseline, measurement), []);
  assert.doesNotThrow(() => updateBaseline(baseline, measurement, { now }), "증가가 없으면 사유 없이도 갱신된다");
  assert.throws(() => updateBaseline(null, measurement, { now }), BaselineError);

  writeTree(root, { [`${CREATOR}/probe.ts`]: 'import { marketOnly } from "../market/heavy";\nexport const probe = marketOnly;\n', [`${CREATOR}/pure.ts`]: 'import { probe } from "./probe";\nexport const pure = probe;\n' });
  const grown = snapshotOf(root).measurement;
  const increases = listIncreases(baseline, grown);
  assert.ok(increases.some((line) => line.startsWith("금지 도메인 apps/web/src/domains/market +1개")), increases.join("|"));
  assert.throws(() => updateBaseline(baseline, grown, { now }), (error) => error instanceof BaselineError && /사유가 필요합니다/u.test(error.message));
  const accepted = updateBaseline(baseline, grown, { reason: "시장 미리보기가 첫 화면에 필요함", now });
  assert.equal(accepted.baseline.registrations.at(-1).reason, "시장 미리보기가 첫 화면에 필요함");
  assert.equal(accepted.baseline.forbiddenDomains["apps/web/src/domains/market"].modules, 1);
});

test("기준선 형식 검증은 깨진 값을 거부한다", (t) => {
  const root = createFixture(t);
  const { baseline } = baselineFor(root);
  assert.doesNotThrow(() => validateBaseline(structuredClone(baseline)));
  const broken = [
    (value) => ({ ...value, schema: "x" }),
    (value) => ({ ...value, totals: { modules: 1, bytes: -1 } }),
    (value) => ({ ...value, forbiddenDomains: { a: { modules: 2, bytes: 0, files: ["x"] } } }),
    (value) => ({ ...value, lazyInvalidated: ["x"] }),
    (value) => ({ ...value, modules: [1] }),
    (value) => ({ ...value, modules: { "a.ts": 0 } }),
    (value) => ({ ...value, modules: { "a.ts": 99 } }),
    (value) => ({ ...value, entries: [] }),
    (value) => ({ ...value, folders: undefined }),
  ];
  for (const mutate of broken) assert.throws(() => validateBaseline(mutate(structuredClone(baseline))), BaselineError);
});

test("CLI: 기준선 생성 뒤 통과하고, 합성 정적 import 는 원인 import·최단 경로·고치는 방법과 함께 실패한다", (t) => {
  const root = createFixture(t);
  const created = bootstrap(root);
  assert.equal(created.status, 0, created.output);
  assert.equal(readBaseline(root).registrations.length, 1);

  const clean = runCli(SCRIPT, root, ["--json"]);
  assert.equal(clean.status, 0, clean.output);
  assert.equal(JSON.parse(clean.stdout).ok, true);
  assert.ok(JSON.parse(clean.stdout).elapsedMs < 20_000);

  writeTree(root, {
    [`${CREATOR}/probe.ts`]: 'import { marketOnly } from "../market/heavy";\nexport const probe = marketOnly;\n',
    [`${CREATOR}/pure.ts`]: 'import { invalidated } from "./invalidated";\nimport { probe } from "./probe";\nexport const pure = [invalidated, probe];\n',
  });
  const failed = runCli(SCRIPT, root);
  assert.equal(failed.status, 1, failed.output);
  assert.match(failed.stdout, /Studio 진입 그래프 래칫 실패/u);
  assert.match(failed.stdout, /\[금지 도메인 정적 도달 증가\] apps\/web\/src\/domains\/market: 0개 → 1개/u);
  assert.match(failed.stdout, /원인 import: .*creator\/pure\.ts\s+→\s+apps\/web\/src\/domains\/creator\/probe\.ts/u, "기준선에 없던 첫 모듈로 들어오는 import");
  assert.match(failed.stdout, /도메인 진입: .*creator\/probe\.ts\s+→\s+apps\/web\/src\/domains\/market\/heavy\.ts/u, "금지 도메인으로 들어가는 간선");
  assert.match(failed.stdout, /→ apps\/web\/src\/domains\/creator\/pure\.ts/u);
  assert.match(failed.stdout, /고치는 방법/u);
  assert.match(failed.stdout, /code-structure-and-bundle-patterns\.md/u);
  assert.match(failed.stdout, /정적 도달 모듈 \d+개/u);
});

test("CLI: 지연 로딩으로 고치면 통과하고 tighten 이 개선을 기준선에 잠근다", (t) => {
  const root = createFixture(t);
  assert.equal(bootstrap(root).status, 0);
  writeTree(root, { [`${CREATOR}/pure.ts`]: "export const pure = 1;\n" });
  const improved = runCli(SCRIPT, root);
  assert.equal(improved.status, 0, improved.output);
  assert.match(improved.stdout, /개선됨/u);
  assert.match(improved.stdout, /--tighten/u);

  const tightened = runCli(SCRIPT, root, ["--tighten"]);
  assert.equal(tightened.status, 0, tightened.output);
  assert.deepEqual(readBaseline(root).lazyInvalidated, []);

  // 잠근 뒤에는 같은 무효화가 다시 생기면 실패한다.
  appendFileSync(path.join(root, `${CREATOR}/pure.ts`), 'import { invalidated } from "./invalidated";\nexport const again = invalidated;\n');
  const regressed = runCli(SCRIPT, root);
  assert.equal(regressed.status, 1, regressed.output);
  assert.match(regressed.stdout, /지연 선언이 정적으로도 도달해 무효화됨/u);
});

test("CLI: 증가 수용은 사유가 있어야 하고 사유가 없으면 거부(2)한다", (t) => {
  const root = createFixture(t);
  assert.equal(bootstrap(root).status, 0);
  writeTree(root, {
    [`${CREATOR}/probe.ts`]: 'import { marketOnly } from "../market/heavy";\nexport const probe = marketOnly;\n',
    [`${CREATOR}/pure.ts`]: 'import { probe } from "./probe";\nexport const pure = probe;\n',
  });
  const refused = runCli(SCRIPT, root, ["--update-baseline"]);
  assert.equal(refused.status, 2, refused.output);
  assert.match(refused.stderr, /사유가 필요합니다/u);
  assert.equal(readBaseline(root).forbiddenDomains["apps/web/src/domains/market"].modules, 0, "거부되면 기준선을 쓰지 않는다");

  const accepted = runCli(SCRIPT, root, ["--update-baseline", "--reason", "시장 미리보기를 첫 화면에 둔다"]);
  assert.equal(accepted.status, 0, accepted.output);
  assert.equal(runCli(SCRIPT, root).status, 0);
  assert.equal(readBaseline(root).registrations.at(-1).reason, "시장 미리보기를 첫 화면에 둔다");
});

test("CLI: --dry-run 은 기준선을 쓰지 않고 변경 내용만 보여 주며 단독 사용은 거부(2)한다", (t) => {
  const root = createFixture(t);
  assert.equal(bootstrap(root).status, 0);
  const before = readFileSync(path.join(root, BASELINE_FILE), "utf8");
  writeTree(root, { [`${CREATOR}/pure.ts`]: "export const pure = 1;\n" });

  const tighten = runCli(SCRIPT, root, ["--tighten", "--dry-run"]);
  assert.equal(tighten.status, 0, tighten.output);
  assert.match(tighten.stdout, /dry-run: 파일은 쓰지 않았습니다/u);
  assert.equal(readFileSync(path.join(root, BASELINE_FILE), "utf8"), before, "dry-run 은 기준선을 바꾸지 않는다");

  const update = runCli(SCRIPT, root, ["--update-baseline", "--dry-run"]);
  assert.equal(update.status, 0, update.output);
  assert.match(update.stdout, /dry-run/u);
  assert.equal(readFileSync(path.join(root, BASELINE_FILE), "utf8"), before);

  assert.equal(runCli(SCRIPT, root, ["--dry-run"]).status, 2);
});

test("CLI: 기준선이 없거나 깨졌거나 인자가 잘못되면 종료 코드 2", (t) => {
  const root = createFixture(t);
  const missing = runCli(SCRIPT, root);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /기준선이 없습니다/u);
  assert.equal(runCli(SCRIPT, root, ["--tighten"]).status, 2);
  assert.equal(runCli(SCRIPT, root, ["--update-baseline", "--tighten"]).status, 2);
  assert.equal(runCli(SCRIPT, root, ["--reason", "x"]).status, 2);
  assert.equal(runCli(SCRIPT, root, ["--모르는-옵션"]).status, 2);
  writeTree(root, { [BASELINE_FILE]: "[]" });
  assert.equal(runCli(SCRIPT, root).status, 2);
});

test("정책: 금지 도메인 접두어는 모두 실제 디렉터리이고 중복이 없으며 커밋된 기준선이 전부 기록한다", () => {
  const prefixes = FORBIDDEN_DOMAINS.map((domain) => domain.prefix);
  assert.equal(new Set(prefixes).size, prefixes.length, "금지 도메인 접두어는 중복되지 않아야 합니다");
  const baseline = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, BASELINE_FILE), "utf8"));
  assert.doesNotThrow(() => validateBaseline(baseline));
  for (const prefix of prefixes) {
    assert.equal(statSync(path.join(REPOSITORY_ROOT, prefix)).isDirectory(), true, `${prefix} 는 실제 디렉터리여야 합니다`);
    assert.ok(baseline.forbiddenDomains[prefix], `기준선에 금지 도메인 ${prefix} 가 없습니다`);
  }
  assert.deepEqual(Object.keys(baseline.forbiddenDomains).sort(), [...prefixes].sort(), "정책에서 빠진 도메인이 기준선에 남아 있습니다");
});

test("진입점: Studio 어댑터 경로는 번들 게이트의 studioEntry 와 같고 기준선 진입점과 일치한다", () => {
  const bundleGate = readFileSync(path.join(REPOSITORY_ROOT, "scripts/check-studio-bundle.mjs"), "utf8");
  const studioEntry = bundleGate.match(/const studioEntry =\s*"([^"]+)"/u)?.[1];
  assert.ok(studioEntry, "check-studio-bundle.mjs 의 studioEntry 상수를 찾지 못했습니다");
  assert.equal(`apps/web/${studioEntry}`, STUDIO_ADAPTER_ENTRY);
  const baseline = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, BASELINE_FILE), "utf8"));
  assert.deepEqual(baseline.entries, resolveStudioEntries(REPOSITORY_ROOT));
});

test("실제 저장소: 정적 도달 그래프는 결정적이고 CPU 20초 안에 끝난다", { timeout: 120_000 }, () => {
  // 벽시계는 병렬 shard 의 부하에 흔들리므로 프로세스 CPU 시간(사용자+시스템)으로 "20초 이내"를 판정한다.
  const run = () => {
    const before = process.cpuUsage();
    const wallStarted = performance.now();
    const measurement = measureGraph(buildEagerGraph({ root: REPOSITORY_ROOT }));
    const cpu = process.cpuUsage(before);
    return { measurement, cpuMs: (cpu.user + cpu.system) / 1000, wallMs: performance.now() - wallStarted };
  };
  const first = run();
  const second = run();
  assert.deepEqual(first.measurement, second.measurement);
  assert.ok(first.cpuMs < 20_000, `첫 실행 CPU ${Math.round(first.cpuMs)}ms (벽시계 ${Math.round(first.wallMs)}ms)`);
  assert.ok(first.wallMs < 100_000, `첫 실행 벽시계 ${Math.round(first.wallMs)}ms`);
  assert.ok(first.measurement.totals.modules > 100);
});
