import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyzeBundleTreeshake,
  formatMarkdownReport,
  main,
  parseArguments,
} from "./analyze-bundle-treeshake.mjs";
import { runCli, writeTree } from "./lib/code-structure-gates-test-support.mjs";
import { buildEagerGraph } from "./lib/studio-eager-graph.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const SCRIPT = fileURLToPath(new URL("./analyze-bundle-treeshake.mjs", import.meta.url));
const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));

const BASE_FIXTURE = {
  "tsconfig.json": JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "esnext",
      moduleResolution: "bundler",
      jsx: "react-jsx",
      resolveJsonModule: true,
      verbatimModuleSyntax: true,
      strict: true,
      noEmit: true,
      paths: { "@/*": ["./apps/web/src/*"] },
    },
  }),
  "package.json": JSON.stringify({ name: "treeshake-fixture", private: true }),
  "apps/web/index.html":
    '<!doctype html><html><body><script type="module" src="/src/app/main.tsx"></script></body></html>\n',
  "apps/web/src/domains/creator/studio-legacy-editor-adapter.tsx": "export const studioAdapter = 1;\n",
};

function createFixture(t, extraFiles) {
  const root = mkdtempSync(path.join(tmpdir(), "toonstudio-treeshake-"));
  (t.onTestFinished ?? t.after.bind(t))(() => rmSync(root, { force: true, recursive: true }));
  writeTree(root, { ...BASE_FIXTURE, ...extraFiles });
  return root;
}

test("대용량 index.ts 배럴의 미사용 re-export와 fanout 절감 바이트를 정확히 계산한다", (t) => {
  const heavyBody = `export const heavyPayload = ${JSON.stringify("H".repeat(2048))};\n`;
  const root = createFixture(t, {
    "apps/web/src/app/main.tsx": [
      'import { usedLeaf } from "@/shared/barrel";',
      "export const boot = usedLeaf();",
      "",
    ].join("\n"),
    "apps/web/src/shared/barrel/index.ts": [
      'export * from "./used-leaf";',
      'export * from "./heavy-unused";',
      'export { namedUnused } from "./named-unused";',
      "",
    ].join("\n"),
    "apps/web/src/shared/barrel/used-leaf.ts": "export function usedLeaf() { return 42; }\n",
    "apps/web/src/shared/barrel/heavy-unused.ts": heavyBody,
    "apps/web/src/shared/barrel/named-unused.ts": `export const namedUnused = ${JSON.stringify("N".repeat(600))};\n`,
  });

  const report = analyzeBundleTreeshake({ root, entries: ["apps/web/src/app/main.tsx"], top: 10 });
  const unusedStar = report.categories.barrelReexports.find(
    (item) => item.subKind === "unused-star-reexport" && item.target.endsWith("heavy-unused.ts"),
  );
  const unusedNamed = report.categories.barrelReexports.find(
    (item) => item.subKind === "unused-named-reexport" && item.target.endsWith("named-unused.ts"),
  );
  const fanout = report.categories.barrelReexports.find(
    (item) => item.subKind === "index-barrel-fanout" && item.file.endsWith("barrel/index.ts"),
  );

  assert.ok(unusedStar, "미사용 export * 대상이 탐지되어야 한다");
  assert.equal(unusedStar.saveableBytes, Buffer.byteLength(heavyBody, "utf8"));
  assert.equal(unusedStar.saveableModules, 1);

  assert.ok(unusedNamed, "미사용 named re-export 대상이 탐지되어야 한다");
  assert.ok(unusedNamed.saveableBytes >= 600);

  assert.ok(fanout, "index.ts 배럴 fanout이 탐지되어야 한다");
  assert.equal(fanout.saveableModules, 3); // index.ts + heavy-unused.ts + named-unused.ts
  assert.ok(fanout.saveableBytes > unusedStar.saveableBytes);
});

test("배럴 자신이 직접 value import하는 대상은 미사용 re-export로 오탐하지 않는다", (t) => {
  const root = createFixture(t, {
    "apps/web/src/app/main.tsx": [
      'import { wrapper } from "@/shared/hub";',
      "export const value = wrapper();",
      "",
    ].join("\n"),
    "apps/web/src/shared/hub.ts": [
      'import { helper } from "./dep";',
      'export { helper } from "./dep";',
      "export function wrapper() { return helper() + 1; }",
      "",
    ].join("\n"),
    "apps/web/src/shared/dep.ts": "export function helper() { return 7; }\n",
  });

  const report = analyzeBundleTreeshake({ root, entries: ["apps/web/src/app/main.tsx"] });
  assert.equal(report.categories.barrelReexports.length, 0);
});

test("import * as 네임스페이스 임포트의 정적 멤버·동적 탈출·미사용·외부 패키지를 분류한다", (t) => {
  const root = createFixture(t, {
    "apps/web/src/app/main.tsx": [
      'import * as multi from "./multi";',
      'import * as dynamicNs from "./dynamic-mod";',
      'import * as unusedNs from "./unused-ns";',
      'import * as extPkg from "fake-external-icons";',
      "export const out = [multi.alpha, Object.keys(dynamicNs), extPkg.Star];",
      "",
    ].join("\n"),
    "apps/web/src/app/multi.ts": [
      "export const alpha = 1;",
      `export const hugeBeta = ${JSON.stringify("B".repeat(1500))};`,
      "",
    ].join("\n"),
    "apps/web/src/app/dynamic-mod.ts": `export const one = ${JSON.stringify("D".repeat(500))};\n`,
    "apps/web/src/app/unused-ns.ts": `export const dead = ${JSON.stringify("U".repeat(900))};\n`,
  });

  const report = analyzeBundleTreeshake({ root, entries: ["apps/web/src/app/main.tsx"] });
  const byNs = new Map(report.categories.namespaceImports.map((item) => [item.namespaceName, item]));

  assert.equal(byNs.get("unusedNs")?.subKind, "unused-namespace-import");
  assert.ok((byNs.get("unusedNs")?.saveableBytes ?? 0) >= 900);
  assert.equal(byNs.get("unusedNs")?.saveableModules, 1);

  assert.equal(byNs.get("multi")?.subKind, "static-namespace-import");
  assert.deepEqual(byNs.get("multi")?.usedMembers, ["alpha"]);
  assert.equal(byNs.get("multi")?.savingsKind, "estimated-declaration-share");
  assert.ok((byNs.get("multi")?.saveableBytes ?? 0) >= 1500);

  assert.equal(byNs.get("dynamicNs")?.subKind, "dynamic-namespace-import");
  assert.equal(byNs.get("dynamicNs")?.dynamicUse, true);

  assert.equal(byNs.get("extPkg")?.target, "external:fake-external-icons");
  assert.deepEqual(byNs.get("extPkg")?.usedMembers, ["Star"]);
});

test("미사용 정적 임포트·타입 전용 사용·inline type import를 정확히 탐지하고 정상 JSX·import type은 오탐하지 않는다", (t) => {
  const root = createFixture(t, {
    "apps/web/src/app/main.tsx": [
      'import "./polyfill";',
      'import type { CleanType } from "./clean-type";',
      'import { type InlineOnly } from "./inline-type-target";',
      'import { OnlyTypeUsage } from "./type-only-usage";',
      'import { deadSymbol } from "./dead-import";',
      'import { liveSymbol, staleSymbol } from "./partial-mod";',
      'import { UsedComp } from "./UsedComp";',
      "export type Combined = CleanType & InlineOnly & OnlyTypeUsage;",
      "export function App() { return <UsedComp label={liveSymbol()} />; }",
      "",
    ].join("\n"),
    "apps/web/src/app/polyfill.ts": "globalThis.__polyfilled = true;\n",
    "apps/web/src/app/clean-type.ts": `export interface CleanType { ok: boolean }\nexport const neverEager = ${JSON.stringify("X".repeat(800))};\n`,
    "apps/web/src/app/inline-type-target.ts": `export interface InlineOnly { id: string }\nexport const leaked = ${JSON.stringify("I".repeat(700))};\n`,
    "apps/web/src/app/type-only-usage.ts": `export interface OnlyTypeUsage { n: number }\nexport const runtimeTrash = ${JSON.stringify("T".repeat(1200))};\n`,
    "apps/web/src/app/dead-import.ts": `export const deadSymbol = ${JSON.stringify("Z".repeat(1600))};\n`,
    "apps/web/src/app/partial-mod.ts": "export const liveSymbol = () => 'ok';\nexport const staleSymbol = () => 'no';\n",
    "apps/web/src/app/UsedComp.tsx": "export function UsedComp({ label }: { label: string }) { return <span>{label}</span>; }\n",
  });

  const report = analyzeBundleTreeshake({ root, entries: ["apps/web/src/app/main.tsx"] });
  const bySubKind = new Map(report.categories.unusedStaticImports.map((item) => [item.subKind, item]));

  assert.ok(bySubKind.has("inline-type-only-import"));
  assert.ok(bySubKind.get("inline-type-only-import").saveableBytes >= 700);
  assert.ok(bySubKind.has("type-only-usage"));
  assert.ok(bySubKind.get("type-only-usage").saveableBytes >= 1200);
  assert.ok(bySubKind.has("unused-binding"));
  assert.ok(bySubKind.get("unused-binding").saveableBytes >= 1600);
  assert.ok(bySubKind.has("partial-unused-binding"));
  assert.deepEqual(bySubKind.get("partial-unused-binding").symbols, ["staleSymbol"]);

  // 정상 JSX 컴포넌트·side-effect import·clean import type 은 후보에 없어야 한다.
  const flaggedTargets = report.topCandidates.map((item) => item.target);
  assert.ok(!flaggedTargets.some((target) => target.endsWith("UsedComp.tsx")));
  assert.ok(!flaggedTargets.some((target) => target.endsWith("polyfill.ts")));
  assert.ok(!flaggedTargets.some((target) => target.endsWith("clean-type.ts")));

  // Top-N 정렬은 saveableBytes 내림차순이어야 한다.
  for (let i = 1; i < report.topCandidates.length; i += 1) {
    assert.ok(report.topCandidates[i - 1].saveableBytes >= report.topCandidates[i].saveableBytes);
  }
});

test("CLI 인자 파싱·JSON/Markdown 출력·--output 파일 기록·오류 종료 코드를 검증한다", (t) => {
  const root = createFixture(t, {
    "apps/web/src/app/main.tsx": 'import { unused } from "./heavy";\nexport const x = 1;\n',
    "apps/web/src/app/heavy.ts": `export const unused = ${JSON.stringify("W".repeat(1024))};\n`,
  });

  const parsed = parseArguments(["--json", "--top", "5", "--min-bytes", "100", "--entry", "./apps/web/src/app/main.tsx"]);
  assert.equal(parsed.format, "json");
  assert.equal(parsed.top, 5);
  assert.equal(parsed.minBytes, 100);
  assert.deepEqual(parsed.entries, ["apps/web/src/app/main.tsx"]);

  const jsonRun = runCli(SCRIPT, root, ["--entry", "apps/web/src/app/main.tsx", "--json", "--top", "3"]);
  assert.equal(jsonRun.status, 0);
  const payload = JSON.parse(jsonRun.stdout);
  assert.equal(payload.tool, "analyze-bundle-treeshake");
  assert.ok(payload.exactGraphSaveableBytes >= 1024);

  const mdOut = path.join(root, "tmp/report.md");
  const mdRun = runCli(SCRIPT, root, [
    "--entry", "apps/web/src/app/main.tsx",
    "--markdown",
    "--output", "tmp/report.md",
  ]);
  assert.equal(mdRun.status, 0);
  assert.match(mdRun.stdout, /# 초기\(Eager\) 번들 트리 셰이킹 다이어트 리포트/u);
  assert.equal(readFileSync(mdOut, "utf8").trimEnd(), mdRun.stdout.trimEnd());
  assert.match(formatMarkdownReport(payload, { top: 3 }), /\| 순위 \| 유형 \|/u);

  const conflictLogs = [];
  const conflictCode = main(["--json", "--markdown"], { log: () => {}, error: (msg) => conflictLogs.push(msg) });
  assert.equal(conflictCode, 2);
  assert.match(conflictLogs.join("\n"), /함께 쓸 수 없습니다/u);
});

test("실제 저장소에서 check-studio-eager-graph와 동일한 도달 그래프로 리포트를 생성한다", () => {
  const eagerGraph = buildEagerGraph({ root: REPOSITORY_ROOT });
  const report = analyzeBundleTreeshake({ root: REPOSITORY_ROOT, top: 5 });

  assert.equal(report.graphSummary.totalModules, eagerGraph.totals.modules);
  assert.equal(report.graphSummary.totalBytes, eagerGraph.totals.bytes);
  assert.ok(report.topCandidates.length <= 5);
  for (let i = 1; i < report.topCandidates.length; i += 1) {
    assert.ok(report.topCandidates[i - 1].saveableBytes >= report.topCandidates[i].saveableBytes);
  }
});
