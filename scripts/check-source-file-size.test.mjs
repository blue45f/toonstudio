import assert from "node:assert/strict";
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRepository, linesOf, runCli, writeTree } from "./lib/code-structure-gates-test-support.mjs";
import {
  BaselineError, evaluateSizes, RefusedError, rewriteBaseline, validateBaseline,
} from "./lib/source-file-size-ratchet.mjs";
import {
  countLines, hasTsNoCheckDirective, isTargetSourceFile,
} from "./lib/source-file-size-scan.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const SCRIPT = fileURLToPath(new URL("./check-source-file-size.mjs", import.meta.url));
const BASELINE_FILE = "scripts/source-file-size-baseline.json";
const now = new Date("2026-10-15T00:00:00Z");

const readBaselineFile = (root) => JSON.parse(readFileSync(path.join(root, BASELINE_FILE), "utf8"));
const bootstrap = (root, reason = "최초 기준선") => runCli(SCRIPT, root, ["--update-baseline", "--reason", reason]);

/** 기존 초과 파일 두 개(900·1,500줄)와 @ts-nocheck 한 개를 가진 저장소. */
function repositoryWithLegacy(t) {
  return createRepository(t, {
    "apps/web/src/legacy-big.ts": linesOf(1500),
    "apps/web/src/legacy-mid.tsx": linesOf(900),
    "apps/web/src/legacy-nocheck.ts": `/* 추출된 코드 */\n// @ts-nocheck\n${linesOf(10)}`,
    "apps/web/src/small.ts": linesOf(120),
  });
}

test("줄 수는 개행 기준으로 한 가지 방식만 쓴다", () => {
  assert.equal(countLines(Buffer.from("")), 0);
  assert.equal(countLines(Buffer.from("a")), 1);
  assert.equal(countLines(Buffer.from("a\n")), 1);
  assert.equal(countLines(Buffer.from("a\nb")), 2);
  assert.equal(countLines(Buffer.from("a\r\nb\r\n")), 2);
  assert.equal(countLines(Buffer.from("\n\n\n")), 3);
  assert.equal(countLines(Buffer.from(linesOf(800))), 800);
});

test("측정 대상은 소스 파일뿐이고 테스트·생성물·선언·벤더·픽스처는 제외한다", () => {
  const included = [
    "apps/web/src/a.ts", "apps/web/src/b.tsx", "scripts/c.mjs", "scripts/d.mts", "tools/e.cjs",
    "apps/web/src/domains/creator/StudioPage.tsx", "apps/web/src/utils/generate.ts",
  ];
  const excluded = [
    "apps/web/src/a.test.ts", "apps/web/src/a.test.tsx", "scripts/x.test.mjs", "apps/web/src/a.spec.ts",
    "apps/web/src/catalog.generated.ts", "apps/web/src/generated/schema.ts", "apps/web/src/types.d.ts", "packages/x/index.d.mts",
    "apps/web/src/vendor/open-km.ts", "third_party/lib/index.ts", "apps/web/src/__fixtures__/seed.ts",
    "apps/brush-lab/src/bench/fixtures/stroke.ts", "node_modules/pkg/index.js", "README.md", "apps/web/src/style.css",
    "apps/web/src/data.json",
  ];
  for (const file of included) assert.equal(isTargetSourceFile(file), true, file);
  for (const file of excluded) assert.equal(isTargetSourceFile(file), false, file);
});

test("@ts-nocheck 는 파일 선두 주석 영역의 지시문만 센다", () => {
  assert.equal(hasTsNoCheckDirective("// @ts-nocheck\nexport {};\n"), true);
  assert.equal(hasTsNoCheckDirective("/* 설명 */\n// @ts-nocheck\n\"use no memo\";\n"), true);
  assert.equal(hasTsNoCheckDirective("#!/usr/bin/env node\n// @ts-nocheck\n"), true);
  assert.equal(hasTsNoCheckDirective("/* @ts-nocheck */\nexport {};\n"), true);
  assert.equal(hasTsNoCheckDirective("/**\n * 설명\n * @ts-nocheck\n */\nexport {};\n"), true);
  assert.equal(hasTsNoCheckDirective("export {};\n// @ts-nocheck\n"), false, "코드 뒤의 주석은 TypeScript 도 무시한다");
  assert.equal(hasTsNoCheckDirective("// 이 파일은 @ts-nocheck 를 쓰지 않는다\nexport {};\n"), false);
  assert.equal(hasTsNoCheckDirective("const note = \"// @ts-nocheck\";\n"), false);
  assert.equal(hasTsNoCheckDirective(""), false);
});

test("래칫 판정: 신규 초과·증가·새 @ts-nocheck 는 위반, 같은 값과 감소는 통과", () => {
  const baseline = { limit: 800, files: { "a.ts": 1000, "b.ts": 2000, "gone.ts": 900 }, tsNoCheck: ["old.ts"] };
  const measure = (file, lines, tsNoCheck = false) => ({ file, lines, tsNoCheck });
  const result = evaluateSizes({
    baseline,
    measurements: [
      measure("a.ts", 1000), // 같은 값: 통과
      measure("b.ts", 1990), // 감소: 개선
      measure("new-small.ts", 800), // 상한과 같은 신규: 통과
      measure("new-big.ts", 801), // 신규 초과: 위반
      measure("old.ts", 10, true), // 기존 @ts-nocheck: 통과
      measure("fresh.ts", 10, true), // 새 @ts-nocheck: 위반
      measure("grew.ts", 1200),
    ],
  });
  assert.deepEqual(
    result.violations.map(({ kind, file }) => `${kind}:${file}`),
    ["new-ts-nocheck:fresh.ts", "new-over-limit:grew.ts", "new-over-limit:new-big.ts"],
  );
  assert.deepEqual(result.improvements.map(({ file, from, to }) => [file, from, to]), [["b.ts", 2000, 1990]]);
  assert.deepEqual(result.stale, ["gone.ts"]);
  assert.equal(result.summary.overLimitFiles, 4);
  assert.equal(result.summary.totalExcessLines, 200 + 1190 + 1 + 400);
  assert.deepEqual(result.summary.topExcess[0], { file: "b.ts", lines: 1990, excess: 1190 });

  const grown = evaluateSizes({ baseline, measurements: [measure("a.ts", 1001)] });
  assert.deepEqual(grown.violations, [{ kind: "grew", file: "a.ts", lines: 1001, recorded: 1000, limit: 800 }]);
});

test("기준선 파일이 상한 이하로 줄면 제거 가능한 개선으로 보고한다", () => {
  const result = evaluateSizes({
    baseline: { limit: 800, files: { "a.ts": 1000 }, tsNoCheck: [] },
    measurements: [{ file: "a.ts", lines: 700, tsNoCheck: false }],
  });
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.improvements, [{ file: "a.ts", from: 1000, to: 700, removable: true }]);
});

test("기준선 형식 검증은 깨진 값을 거부한다", () => {
  const valid = { schema: "toonstudio.source-file-size-baseline/1", limit: 800, files: { "a.ts": 900 }, tsNoCheck: [] };
  assert.doesNotThrow(() => validateBaseline(valid));
  for (const broken of [
    null, [], { ...valid, schema: "x" }, { ...valid, limit: 0 }, { ...valid, files: { "a.ts": 800 } },
    { ...valid, files: { "a.ts": "900" } }, { ...valid, tsNoCheck: "a.ts" },
  ]) assert.throws(() => validateBaseline(broken), BaselineError);
});

test("tighten 은 줄어든 값만 반영하고 사라진 항목을 정리하며 새 항목은 추가하지 않는다", () => {
  const baseline = { limit: 800, files: { "a.ts": 1000, "b.ts": 2000, "gone.ts": 900, "small.ts": 900 }, tsNoCheck: ["x.ts", "y.ts"], registrations: [] };
  const measurements = [
    { file: "a.ts", lines: 950, tsNoCheck: false },
    { file: "b.ts", lines: 2100, tsNoCheck: false }, // 늘어남: 위반으로 남고 기록값은 유지
    { file: "small.ts", lines: 500, tsNoCheck: false },
    { file: "new-big.ts", lines: 1200, tsNoCheck: false }, // 새 파일: tighten 이 등록하지 않는다
    { file: "x.ts", lines: 10, tsNoCheck: true },
    { file: "fresh.ts", lines: 10, tsNoCheck: true },
  ];
  const result = rewriteBaseline({ baseline, measurements, mode: "tighten", now });
  assert.deepEqual(result.baseline.files, { "a.ts": 950, "b.ts": 2000 });
  assert.deepEqual(result.baseline.tsNoCheck, ["x.ts"]);
  assert.deepEqual(result.dropped, ["gone.ts", "small.ts"]);
  assert.deepEqual(result.lowered, [{ file: "a.ts", from: 1000, to: 950 }]);
  assert.deepEqual(result.registered, []);
});

test("update-baseline 은 증가를 거부하고 새 초과 파일은 사유가 있을 때만 등록한다", () => {
  const baseline = { limit: 800, files: { "a.ts": 1000 }, tsNoCheck: [], registrations: [] };
  const grown = [{ file: "a.ts", lines: 1001, tsNoCheck: false }];
  assert.throws(() => rewriteBaseline({ baseline, measurements: grown, mode: "update", reason: "필요", now }), RefusedError);

  const fresh = [{ file: "a.ts", lines: 1000, tsNoCheck: false }, { file: "table.ts", lines: 1200, tsNoCheck: false }];
  assert.throws(() => rewriteBaseline({ baseline, measurements: fresh, mode: "update", now }), BaselineError);
  assert.throws(() => rewriteBaseline({ baseline, measurements: fresh, mode: "update", reason: "   ", now }), BaselineError);
  const registered = rewriteBaseline({ baseline, measurements: fresh, mode: "update", reason: "데이터 표라 나눌 수 없음", now });
  assert.deepEqual(registered.baseline.files, { "a.ts": 1000, "table.ts": 1200 });
  assert.deepEqual(registered.baseline.registrations, [{ date: "2026-10-15", reason: "데이터 표라 나눌 수 없음", files: ["table.ts"] }]);

  const nocheck = [{ file: "a.ts", lines: 1000, tsNoCheck: false }, { file: "n.ts", lines: 5, tsNoCheck: true }];
  assert.throws(() => rewriteBaseline({ baseline, measurements: nocheck, mode: "update", reason: "필요", now }), RefusedError);

  const noop = rewriteBaseline({ baseline, measurements: [{ file: "a.ts", lines: 990, tsNoCheck: false }], mode: "update", now });
  assert.deepEqual(noop.baseline.files, { "a.ts": 990 }, "등록할 것이 없으면 사유 없이도 tighten 과 같다");
});

test("CLI: 기준선을 만든 뒤 같은 상태는 통과하고 요약에 상위 초과 파일과 총 초과 줄 수를 보인다", (t) => {
  const root = repositoryWithLegacy(t);
  const created = bootstrap(root);
  assert.equal(created.status, 0, created.output);
  const baseline = readBaselineFile(root);
  assert.deepEqual(baseline.files, { "apps/web/src/legacy-big.ts": 1500, "apps/web/src/legacy-mid.tsx": 900 });
  assert.deepEqual(baseline.tsNoCheck, ["apps/web/src/legacy-nocheck.ts"]);
  assert.equal(baseline.registrations.length, 1);

  const checked = runCli(SCRIPT, root, ["--json"]);
  assert.equal(checked.status, 0, checked.output);
  const report = JSON.parse(checked.stdout);
  assert.equal(report.ok, true);
  assert.ok(report.elapsedMs < 3000, `실행 시간 ${report.elapsedMs}ms`);

  const text = runCli(SCRIPT, root);
  assert.equal(text.status, 0, text.output);
  assert.match(text.stdout, /통과/u);
  assert.match(text.stdout, /상위 초과 파일 2개/u);
  assert.match(text.stdout, /총 초과 줄 수 800 \(기준선 800\)/u);
  assert.match(text.stdout, /1,500줄 \(\+700\)\s+apps\/web\/src\/legacy-big\.ts/u);
});

test("CLI: 합성으로 키운 파일·새 초과 파일·새 @ts-nocheck 는 위반 목록과 고치는 방법과 함께 실패한다", (t) => {
  const root = repositoryWithLegacy(t);
  assert.equal(bootstrap(root).status, 0);

  appendFileSync(path.join(root, "apps/web/src/legacy-mid.tsx"), "export const extra = 1;\n"); // 900 -> 901
  writeTree(root, {
    "apps/web/src/brand-new.ts": linesOf(801), // 스테이징하지 않은 새 파일도 검사한다
    "apps/web/src/fresh-nocheck.ts": `// @ts-nocheck\n${linesOf(3)}`,
    "apps/web/src/ok-limit.ts": linesOf(800),
    "apps/web/src/big.test.ts": linesOf(3000), // 테스트는 대상이 아니다
    "apps/web/src/api.generated.ts": linesOf(3000),
    "apps/web/src/types.d.ts": linesOf(3000),
  });

  const failed = runCli(SCRIPT, root);
  assert.equal(failed.status, 1, failed.output);
  assert.match(failed.stdout, /실패/u);
  assert.match(failed.stdout, /위반 3건/u);
  assert.match(failed.stdout, /legacy-mid\.tsx\s+901줄 > 기준선 900줄 \(\+1줄\)/u);
  assert.match(failed.stdout, /brand-new\.ts\s+새 파일\/기준선 밖 파일이 801줄입니다 \(상한 800줄, 초과 \+1\)/u);
  assert.match(failed.stdout, /fresh-nocheck\.ts\s+새 \/\/ @ts-nocheck/u);
  assert.match(failed.stdout, /고치는 방법/u);
  assert.match(failed.stdout, /docs\/engineering\/code-structure-and-bundle-patterns\.md/u);
  assert.doesNotMatch(failed.stdout, /ok-limit|big\.test|api\.generated|types\.d/u);
});

test("CLI: 파일을 줄이면 통과하고 tighten 으로 잠근 뒤에는 이전 크기로 되돌릴 수 없다", (t) => {
  const root = repositoryWithLegacy(t);
  assert.equal(bootstrap(root).status, 0);
  writeFileSync(path.join(root, "apps/web/src/legacy-big.ts"), linesOf(1100));

  const shrunk = runCli(SCRIPT, root);
  assert.equal(shrunk.status, 0, shrunk.output);
  assert.match(shrunk.stdout, /개선됨: 1개 파일이 기준선보다 줄었습니다 \(−400줄\)/u);

  const tightened = runCli(SCRIPT, root, ["--tighten"]);
  assert.equal(tightened.status, 0, tightened.output);
  assert.equal(readBaselineFile(root).files["apps/web/src/legacy-big.ts"], 1100);

  writeFileSync(path.join(root, "apps/web/src/legacy-big.ts"), linesOf(1500));
  const regrown = runCli(SCRIPT, root);
  assert.equal(regrown.status, 1, regrown.output);
  assert.match(regrown.stdout, /1,500줄 > 기준선 1,100줄/u);
});

test("CLI: 상한 이하로 줄어든 파일은 tighten 이 기준선에서 정리한다", (t) => {
  const root = repositoryWithLegacy(t);
  assert.equal(bootstrap(root).status, 0);
  writeFileSync(path.join(root, "apps/web/src/legacy-mid.tsx"), linesOf(700));
  assert.equal(runCli(SCRIPT, root, ["--tighten"]).status, 0);
  assert.deepEqual(Object.keys(readBaselineFile(root).files), ["apps/web/src/legacy-big.ts"]);
});

test("CLI: update-baseline 은 사유 없이는 거부(2), 증가는 거부(1), 새 초과 파일은 사유와 함께 등록한다", (t) => {
  const root = repositoryWithLegacy(t);
  assert.equal(bootstrap(root).status, 0);
  writeTree(root, { "apps/web/src/data-table.ts": linesOf(1200) });

  const withoutReason = runCli(SCRIPT, root, ["--update-baseline"]);
  assert.equal(withoutReason.status, 2, withoutReason.output);
  assert.match(withoutReason.stderr, /사유가 필요합니다/u);
  assert.equal(Object.hasOwn(readBaselineFile(root).files, "apps/web/src/data-table.ts"), false);

  const registered = runCli(SCRIPT, root, ["--update-baseline", "--reason", "정적 데이터 표라 분할하면 가독성이 나빠짐"]);
  assert.equal(registered.status, 0, registered.output);
  const baseline = readBaselineFile(root);
  assert.equal(baseline.files["apps/web/src/data-table.ts"], 1200);
  assert.equal(baseline.registrations.at(-1).reason, "정적 데이터 표라 분할하면 가독성이 나빠짐");
  assert.deepEqual(baseline.registrations.at(-1).files, ["apps/web/src/data-table.ts"]);

  appendFileSync(path.join(root, "apps/web/src/legacy-big.ts"), "export const more = 1;\n");
  const growth = runCli(SCRIPT, root, ["--update-baseline", "--reason", "늘려야 함"]);
  assert.equal(growth.status, 1, growth.output);
  assert.match(growth.stderr, /증가를 허용하지 않습니다/u);
  assert.equal(readBaselineFile(root).files["apps/web/src/legacy-big.ts"], 1500, "거부되면 기준선을 쓰지 않는다");
});

test("CLI: --dry-run 은 기준선을 쓰지 않고 변경 내용만 보여 주며 단독 사용은 거부(2)한다", (t) => {
  const root = repositoryWithLegacy(t);
  assert.equal(bootstrap(root).status, 0);
  const before = readFileSync(path.join(root, BASELINE_FILE), "utf8");
  writeFileSync(path.join(root, "apps/web/src/legacy-big.ts"), linesOf(1200));
  writeTree(root, { "apps/web/src/data-table.ts": linesOf(1000) });

  const tighten = runCli(SCRIPT, root, ["--tighten", "--dry-run"]);
  assert.equal(tighten.status, 1, "새 초과 파일은 tighten 이 등록하지 않으므로 위반이 남는다");
  assert.match(tighten.stdout, /dry-run: 파일은 쓰지 않았습니다/u);
  assert.match(tighten.stdout, /↓ apps\/web\/src\/legacy-big\.ts: 1,500 → 1,200줄/u);
  assert.equal(readFileSync(path.join(root, BASELINE_FILE), "utf8"), before);

  const update = runCli(SCRIPT, root, ["--update-baseline", "--reason", "표", "--dry-run"]);
  assert.equal(update.status, 0, update.output);
  assert.match(update.stdout, /\+ apps\/web\/src\/data-table\.ts/u);
  assert.equal(readFileSync(path.join(root, BASELINE_FILE), "utf8"), before);

  assert.equal(runCli(SCRIPT, root, ["--dry-run"]).status, 2);
});

test("CLI: 기준선이 없거나 깨졌거나 인자가 잘못되면 종료 코드 2", (t) => {
  const root = repositoryWithLegacy(t);
  const missing = runCli(SCRIPT, root);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /기준선이 없습니다/u);
  assert.equal(runCli(SCRIPT, root, ["--tighten"]).status, 2);
  assert.equal(runCli(SCRIPT, root, ["--reason", "x"]).status, 2);
  assert.equal(runCli(SCRIPT, root, ["--update-baseline", "--tighten"]).status, 2);
  assert.equal(runCli(SCRIPT, root, ["--모르는-옵션"]).status, 2);

  writeTree(root, { [BASELINE_FILE]: "{ not json" });
  const broken = runCli(SCRIPT, root);
  assert.equal(broken.status, 2);
  assert.match(broken.stderr, /기준선을 읽을 수 없습니다/u);
});

test("CLI: .gitignore 대상은 검사하지 않고, 작업트리에서 사라진 기준선 파일은 위반이 아니라 stale 로만 보고한다", (t) => {
  const root = createRepository(t, {
    ".gitignore": "ignored/\n",
    "apps/web/src/legacy-big.ts": linesOf(1500),
    "apps/web/src/small.ts": linesOf(10),
  });
  assert.equal(bootstrap(root).status, 0);

  writeTree(root, { "ignored/huge.ts": linesOf(5000) });
  const ignored = runCli(SCRIPT, root);
  assert.equal(ignored.status, 0, ignored.output);

  // 삭제됐거나 sparse-checkout 으로 체크아웃되지 않은 파일과 같은 상태(인덱스에는 있고 디스크에는 없음).
  rmSync(path.join(root, "apps/web/src/legacy-big.ts"));
  const missing = runCli(SCRIPT, root, ["--json"]);
  assert.equal(missing.status, 0, missing.output);
  assert.deepEqual(JSON.parse(missing.stdout).stale, ["apps/web/src/legacy-big.ts"]);

  assert.equal(runCli(SCRIPT, root, ["--tighten"]).status, 0);
  assert.deepEqual(readBaselineFile(root).files, {});
});

test("저장소에 커밋된 기준선은 형식이 유효하고 상한 정책과 일치한다", () => {
  const baseline = JSON.parse(readFileSync(new URL("./source-file-size-baseline.json", import.meta.url), "utf8"));
  assert.doesNotThrow(() => validateBaseline(baseline));
  assert.equal(baseline.limit, 800);
  assert.ok(Object.keys(baseline.files).length > 0);
  assert.deepEqual(baseline.tsNoCheck, [...baseline.tsNoCheck].sort(), "tsNoCheck 목록은 정렬된 상태를 유지한다");
  assert.deepEqual(Object.keys(baseline.files), Object.keys(baseline.files).sort(), "files 키는 정렬된 상태를 유지한다");
  for (const file of Object.keys(baseline.files)) assert.equal(isTargetSourceFile(file), true, `${file} 는 측정 대상이어야 합니다`);
});
