import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import {
  assertCompleteCoverage,
  mergeDiagnostics,
  parseArguments,
  partitionFiles,
  verifyInShards,
} from "./typecheck-shards.mjs";
import { loadFullProgram, runWorker, serializeDiagnostic } from "./typecheck-shards-worker.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

function fixture(files, options = {}) {
  const root = mkdtempSync(join(tmpdir(), "toonstudio-full-typecheck-"));
  const config = { compilerOptions: { strict: true, noEmit: true, skipLibCheck: true, types: [], target: "ES2020", ...options }, files: ["entry.ts", "ambient.d.ts"] };
  for (const [path, text] of Object.entries({ "tsconfig.json": JSON.stringify(config), "entry.ts": "export {};", "ambient.d.ts": "export {};", ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return { root, project: join(root, "tsconfig.json"), dispose: () => rmSync(root, { recursive: true, force: true }) };
}

function fixtureRunner(context) {
  return (job) => runWorker({ ...context, cwd: context.root, ...job });
}

function optionsFor(context) {
  return { project: context.project, heapMb: 1024, maxBytes: 1024 * 1024 };
}

test("전체 문맥을 유지한 샤드는 imported 비root 오류·global/module augmentation·related diagnostics를 모두 보존한다", () => {
  const context = fixture({
    "entry.ts": 'import { value } from "./library"; const n: number = value; const a: string = (null as unknown as Window).title; const b: Augmented = { base: 1, extra: "ok" }; export {a,b,n};\n// @ts-expect-error\nconst fine = 1;\n',
    "ambient.d.ts": 'export {}; declare global { interface Window { title: string } interface Augmented { base: number } } declare module "./library" { interface Detail { extra: string } }',
    "library.ts": 'export const value: string = 9; export interface Detail { base: number } export const detail: Detail = { base: 1, extra: "ok" }; declare global { interface Augmented { extra: string } }',
  });
  try {
    const monolithic = loadFullProgram(context.project, context.root);
    const expected = mergeDiagnostics([ts.getPreEmitDiagnostics(monolithic.program).map(serializeDiagnostic)]);
    const report = verifyInShards({ ...optionsFor(context), maxBytes: 80 }, fixtureRunner(context));
    assert.equal(report.complete, true);
    assert.deepEqual(report.diagnostics, expected);
    assert.ok(report.identity.files.some((file) => file.path === join(context.root, "library.ts")));
    assert.equal(report.phases.semantic.checkedFiles, report.identity.files.length);
    assert.ok(report.workers.length > 1);
    assert.ok(report.diagnostics.some((item) => item.file === join(context.root, "library.ts") && item.code === 2322));
    assert.ok(report.diagnostics.some((item) => item.code === 2578));
  } finally { context.dispose(); }
});

test("skipLibCheck의 원래 의미를 변경하지 않고 declaration 파일도 coverage에 포함한다", () => {
  for (const skipLibCheck of [false, true]) {
    const context = fixture({ "ambient.d.ts": "declare const invalid: MissingType;" }, { skipLibCheck });
    try {
      const report = verifyInShards(optionsFor(context), fixtureRunner(context));
      const mono = loadFullProgram(context.project, context.root);
      assert.deepEqual(report.diagnostics, mergeDiagnostics([ts.getPreEmitDiagnostics(mono.program).map(serializeDiagnostic)]));
      assert.equal(report.diagnostics.some((item) => item.code === 2304), !skipLibCheck);
      assert.equal(report.complete, true);
    } finally { context.dispose(); }
  }
});

test("구문·전역·config/options 오류를 성공이나 완전한 의미 검사로 기록하지 않는다", () => {
  for (const [files, options, code] of [
    [{ "entry.ts": "const broken: = ; const other: string = 1;" }, {}, 1110],
    [{}, { noLib: true }, 2318],
    [{}, { target: "not-a-target" }, 6046],
    [{}, { module: "NodeNext", moduleResolution: "Classic" }, 5109],
  ]) {
    const context = fixture(files, options);
    try {
      const report = verifyInShards(optionsFor(context), fixtureRunner(context));
      assert.ok(report.diagnostics.some((item) => item.code === code), JSON.stringify(report.diagnostics));
      if (code !== 6046) assert.equal(report.complete, false);
    } finally { context.dispose(); }
  }
});

test("미검사·중복·범위 밖 coverage를 거부한다", () => {
  assert.throws(() => assertCompleteCoverage(["a", "b"], [["a"]]), /끝나지/u);
  assert.throws(() => assertCompleteCoverage(["a", "b"], [["a", "a", "b"]]), /중복/u);
  assert.throws(() => assertCompleteCoverage(["a"], [["a", "x"]]), /알 수 없는/u);
});

test("메모리 실패만 작은 그룹으로 재시도하고 단일 파일 실패를 통과로 처리하지 않는다", () => {
  const identity = { version: "fixture", options: {}, files: ["a", "b", "c"].map((path) => ({ path, bytes: 1 })) };
  const calls = [];
  const worker = (job) => {
    calls.push(job);
    if (job.phase === "inventory") return { identity, fingerprint: "same" };
    if (job.phase === "preflight") return { fingerprint: "same", semanticAllowed: true, diagnostics: [] };
    if (job.files.length > 1) return { failed: true, memoryFailure: true, exit: 134 };
    return { checked: job.files, fingerprint: "same", diagnostics: [], elapsedMs: 1, peakRssBytes: 1 };
  };
  const report = verifyInShards({ maxBytes: 100 }, worker);
  assert.equal(report.complete, true);
  assert.equal(report.phases.semantic.checkedFiles, 3);
  assert.ok(report.workers.some((item) => item.retry === "bisect"));
  const failed = verifyInShards({ maxBytes: 1 }, (job) => job.phase === "semantic" ? { failed: true, memoryFailure: true } : worker(job));
  assert.equal(failed.complete, false);
  assert.ok(failed.failure);
});

test("샤드 응답 누락과 worker snapshot 불일치를 거부한다", () => {
  const identity = { version: "fixture", options: {}, files: [{ path: "a", bytes: 1 }] };
  for (const response of [{ fingerprint: "different", checked: ["a"] }, { fingerprint: "same", checked: [] }]) {
    assert.throws(() => verifyInShards({ maxBytes: 10 }, (job) => {
      if (job.phase === "inventory") return { identity, fingerprint: "same" };
      if (job.phase === "preflight") return { fingerprint: "same", semanticAllowed: true, diagnostics: [] };
      return response;
    }), /fingerprint|끝나지/u);
  }
});

test("내용이 바뀌면 같은 파일 목록이어도 worker가 stale 검사 증거를 거부한다", () => {
  const context = fixture({});
  try {
    const before = runWorker({ ...context, cwd: context.root, phase: "inventory" });
    writeFileSync(join(context.root, "entry.ts"), "export const changed = 1;");
    assert.throws(() => runWorker({ ...context, cwd: context.root, phase: "semantic", fingerprint: before.fingerprint, files: [join(context.root, "entry.ts")] }), /바뀌/u);
  } finally { context.dispose(); }
});

test("emit·incremental 프로젝트를 조용히 약화해 검사하지 않는다", () => {
  for (const option of [{ noEmit: false }, { declaration: true }, { incremental: true }, { composite: true }]) {
    const context = fixture({}, option);
    try { assert.throws(() => runWorker({ ...context, cwd: context.root, phase: "inventory" }), /전용/u); }
    finally { context.dispose(); }
  }
});

test("CLI는 독립 프로세스로 검사해 manifest와 진단 실패 종료 코드를 남긴다", () => {
  const context = fixture({ "entry.ts": "const n: string = 1; export {n};" }, { skipLibCheck: true });
  try {
    const reportPath = join(context.root, "report.json");
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./typecheck-shards.mjs", import.meta.url)),
      "--project", context.project, "--report", reportPath, "--heap-mb", "1024"], { encoding: "utf8" });
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(readFileSync(reportPath));
    assert.equal(report.complete, true);
    assert.ok(report.diagnostics.some((item) => item.code === 2322));
    assert.equal(report.phases.semantic.checkedFiles, report.identity.files.length);
    const cli = spawnSync(process.execPath, [fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url)),
      "--project", context.project, "--pretty", "false"], { encoding: "utf8", cwd: context.root });
    assert.equal(cli.status, 2);
    const cliCodes = [...`${cli.stdout}${cli.stderr}`.matchAll(/error TS(\d+):/gu)].map((match) => Number(match[1])).sort();
    assert.deepEqual(report.diagnostics.map((item) => item.code).sort(), cliCodes);
  } finally { context.dispose(); }
});

test("CLI 인자와 바이트 예산은 검증하고 모든 파일을 한 번씩 분할한다", () => {
  assert.throws(() => parseArguments(["--heap-mb", "0"]), /1024/u);
  assert.throws(() => parseArguments(["--project"]), /지정/u);
  assert.throws(() => parseArguments(["--skip-errors"]), /알 수 없는/u);
  const identity = { options: { skipLibCheck: true }, files: [{ path: "lib", declaration: true, bytes: 1000 }, { path: "a", bytes: 4 }, { path: "b", bytes: 4 }] };
  const groups = partitionFiles(identity, 4);
  assert.deepEqual(groups, [["lib", "a"], ["b"]]);
  assertCompleteCoverage(identity.files.map((item) => item.path), groups);
});
