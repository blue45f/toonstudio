import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import {
  assertCompleteCoverage,
  extractReusableCheckpoint,
  mergeDiagnostics,
  parseArguments,
  partitionFiles,
  resolveAdaptiveTypecheckLimits,
  resolveRuntimeExecutionBudget,
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
    const larger = verifyInShards(optionsFor(context), fixtureRunner(context));
    assert.notEqual(report.workers.length, larger.workers.length);
    assert.equal(larger.complete, true);
    assert.deepEqual(larger.diagnostics, report.diagnostics);
    assert.deepEqual(larger.phases.semantic, report.phases.semantic);
    assert.equal(larger.fingerprint, report.fingerprint);
    assert.equal(larger.phases.finalSnapshot.fingerprint, report.fingerprint);
    assert.equal(report.phases.finalSnapshot.fingerprint, report.fingerprint);
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

test("stderr 없는 worker 중단도 단계·종료 코드·signal을 보존한다", () => {
  const identity = { version: "fixture", options: {}, files: [{ path: "a", bytes: 1 }] };
  for (const failedPhase of ["inventory", "preflight", "finalSnapshot"]) {
    let inventoryCount = 0;
    assert.throws(() => verifyInShards({ maxBytes: 100 }, (job) => {
      const phase = job.phase === "inventory" && inventoryCount++ > 0 ? "finalSnapshot" : job.phase;
      if (phase === failedPhase) return { failed: true, memoryFailure: true, exit: null, signal: "SIGKILL", message: "" };
      if (job.phase === "inventory") return { identity, fingerprint: "same" };
      if (job.phase === "preflight") return { fingerprint: "same", semanticAllowed: true, diagnostics: [] };
      return { checked: job.files, fingerprint: "same", diagnostics: [], elapsedMs: 1, peakRssBytes: 1 };
    }), /exit=null.*signal=SIGKILL/u, failedPhase);
  }
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

test("호스트 메모리 적응형 튜닝은 CI 7~16GB 러너를 8192MB로 보호하고 32GB+ 로컬 머신의 OOM 분할을 줄인다", () => {
  const GiB = 1024 ** 3;
  assert.deepEqual(resolveAdaptiveTypecheckLimits({ totalMemoryBytes: 7 * GiB, isCi: true }), {
    heapMb: 8192, maxBytes: 4 * 1024 * 1024, tier: "ci-safe", totalMemoryGiB: 7,
  });
  assert.deepEqual(resolveAdaptiveTypecheckLimits({ totalMemoryBytes: 16 * GiB, isCi: true }), {
    heapMb: 8192, maxBytes: 4 * 1024 * 1024, tier: "ci-safe", totalMemoryGiB: 16,
  });
  assert.deepEqual(resolveAdaptiveTypecheckLimits({ totalMemoryBytes: 32 * GiB, isCi: true }), {
    heapMb: 8192, maxBytes: 4 * 1024 * 1024, tier: "ci-safe", totalMemoryGiB: 32,
  });
  assert.deepEqual(resolveAdaptiveTypecheckLimits({ totalMemoryBytes: 24 * GiB, isCi: false }), {
    heapMb: 12288, maxBytes: 16 * 1024 * 1024, tier: "local-24g", totalMemoryGiB: 24,
  });
  assert.deepEqual(resolveAdaptiveTypecheckLimits({ totalMemoryBytes: 32 * GiB, isCi: false }), {
    heapMb: 16384, maxBytes: 32 * 1024 * 1024, tier: "local-32g", totalMemoryGiB: 32,
  });
  assert.deepEqual(resolveAdaptiveTypecheckLimits({ totalMemoryBytes: 64 * GiB, isCi: false }), {
    heapMb: 24576, maxBytes: 64 * 1024 * 1024, tier: "local-48g+", totalMemoryGiB: 64,
  });

  // 명시 --heap-mb 미지정 시 로컬 32GB는 자동 확장, CI는 안전 8192MB 유지
  const localDefault = parseArguments([], { totalMemoryBytes: 32 * GiB, isCi: false, env: {} });
  assert.equal(localDefault.heapMb, 16384);
  assert.equal(localDefault.maxBytes, 32 * 1024 * 1024);
  assert.equal(localDefault.tuningTier, "local-32g");

  const ciDefault = parseArguments([], { totalMemoryBytes: 16 * GiB, isCi: true, env: { CI: "1" } });
  assert.equal(ciDefault.heapMb, 8192);
  assert.equal(ciDefault.tuningTier, "ci-safe");

  // 명시 --heap-mb 1024 단독 지정은 그대로 존중하고, --auto-tune 지정 시 로컬만 확장·CI는 8192MB 상한
  const explicit = parseArguments(["--heap-mb", "1024"], { totalMemoryBytes: 32 * GiB, isCi: false, env: {} });
  assert.equal(explicit.heapMb, 1024);
  assert.equal(explicit.tuningTier, "explicit");

  const localAuto = parseArguments(["--heap-mb", "8192", "--max-source-bytes", "12582912", "--auto-tune"], {
    totalMemoryBytes: 32 * GiB, isCi: false, env: {},
  });
  assert.equal(localAuto.heapMb, 16384);
  assert.equal(localAuto.maxBytes, 32 * 1024 * 1024);

  const ciAuto = parseArguments(["--heap-mb", "16384", "--auto-tune"], {
    totalMemoryBytes: 32 * GiB, isCi: true, env: { CI: "1" },
  });
  assert.equal(ciAuto.heapMb, 8192);
  assert.equal(ciAuto.tuningTier, "ci-safe");
});

test("동일 fingerprint 완료 체크포인트는 의미 워커 재실행 없이 재사용하고 1바이트 변경이나 --no-cache 시 즉시 무효화한다", () => {
  const context = fixture({ "entry.ts": "export const broken: number = 'oops';" }, { skipLibCheck: true });
  try {
    const firstCalls = [];
    const trackingRunner = (calls) => (job) => {
      calls.push(job.phase);
      return fixtureRunner(context)(job);
    };
    const first = verifyInShards({ ...optionsFor(context), maxBytes: 40 }, trackingRunner(firstCalls));
    assert.equal(first.complete, true);
    assert.ok(first.diagnostics.some((item) => item.code === 2322));
    assert.ok(firstCalls.includes("semantic"));

    // 1) 동일 fingerprint 재실행: inventory 1회만으로 완료 체크포인트 재사용 + 실패 진단 100% 보존
    const reuseCalls = [];
    const reused = verifyInShards(
      { ...optionsFor(context), maxBytes: 40, resumeCheckpoint: first },
      trackingRunner(reuseCalls),
    );
    assert.deepEqual(reuseCalls, ["inventory"]);
    assert.equal(reused.complete, true);
    assert.equal(reused.cacheReuse?.mode, "complete");
    assert.deepEqual(reused.diagnostics, first.diagnostics);

    // 2) --no-cache 지정 시 체크포인트를 우회해 전체 재검사
    const freshCalls = [];
    const fresh = verifyInShards(
      { ...optionsFor(context), maxBytes: 40, resumeCheckpoint: first, noCache: true },
      trackingRunner(freshCalls),
    );
    assert.ok(freshCalls.includes("preflight"));
    assert.ok(freshCalls.includes("semantic"));
    assert.equal(fresh.cacheReuse, undefined);

    // 3) 1바이트 수정 시 fingerprint가 달라져 캐시 즉시 무효화 및 정상 통과 확인
    writeFileSync(join(context.root, "entry.ts"), "export const fixed: number = 42;");
    const afterEditCalls = [];
    const afterEdit = verifyInShards(
      { ...optionsFor(context), maxBytes: 40, resumeCheckpoint: first },
      trackingRunner(afterEditCalls),
    );
    assert.ok(afterEditCalls.includes("preflight"));
    assert.ok(afterEditCalls.includes("semantic"));
    assert.equal(afterEdit.complete, true);
    assert.deepEqual(afterEdit.diagnostics, []);
  } finally { context.dispose(); }
});

test("중단된 동일 fingerprint 부분 체크포인트는 이미 검증한 샤드를 건너뛰고 남은 파일만 이어 검사한다", () => {
  const identity = {
    version: "fixture-ts",
    options: { skipLibCheck: true },
    files: [
      { path: "a.ts", bytes: 10 },
      { path: "b.ts", bytes: 10 },
      { path: "c.ts", bytes: 10 },
    ],
  };
  const partialCheckpoint = {
    schemaVersion: 1,
    project: "/repo/tsconfig.json",
    typescriptVersion: "fixture-ts",
    fingerprint: "fp-same",
    complete: false,
    phases: {
      preflight: { fingerprint: "fp-same", semanticAllowed: true, diagnostics: [] },
      semantic: { checkedFiles: 1, expectedFiles: 3 },
    },
    workers: [
      {
        files: ["a.ts"],
        checked: 1,
        fingerprint: "fp-same",
        diagnostics: [{ code: 2322, category: 1, message: "from-a", file: "a.ts" }],
        elapsedMs: 5,
        peakRssBytes: 1024,
      },
      { files: ["b.ts"], failed: true, memoryFailure: true, exit: 137 },
    ],
    diagnostics: [{ code: 2322, category: 1, message: "from-a", file: "a.ts" }],
  };

  const semanticCalls = [];
  const phases = [];
  const worker = (job) => {
    phases.push(job.phase);
    if (job.phase === "inventory") return { identity, fingerprint: "fp-same" };
    if (job.phase === "preflight") throw new Error("부분 재사용 시 preflight를 중복 실행하면 안 됩니다.");
    semanticCalls.push(job.files);
    return {
      fingerprint: "fp-same",
      checked: job.files,
      diagnostics: job.files.includes("c.ts") ? [{ code: 2304, category: 1, message: "from-c", file: "c.ts" }] : [],
      elapsedMs: 2,
      peakRssBytes: 2048,
    };
  };

  const report = verifyInShards(
    { project: "/repo/tsconfig.json", heapMb: 8192, maxBytes: 10, resumeCheckpoint: partialCheckpoint },
    worker,
  );
  assert.equal(report.complete, true);
  assert.equal(report.cacheReuse?.mode, "partial");
  assert.equal(report.cacheReuse?.reusedFiles, 1);
  assert.deepEqual(semanticCalls, [["b.ts"], ["c.ts"]]);
  assert.deepEqual(phases, ["inventory", "semantic", "semantic", "inventory"]);
  assert.equal(report.phases.semantic.checkedFiles, 3);
  assert.deepEqual(report.diagnostics.map((d) => d.code).sort(), [2304, 2322]);

  // 프로젝트·fingerprint 불일치 체크포인트는 거부한다
  assert.equal(
    extractReusableCheckpoint(partialCheckpoint, { project: "/other/tsconfig.json", identity, fingerprint: "fp-same" }).mode,
    "none",
  );
  assert.equal(
    extractReusableCheckpoint(partialCheckpoint, { project: "/repo/tsconfig.json", identity, fingerprint: "fp-other" }).mode,
    "none",
  );
});

test("CLI 연속 실행은 동일 fingerprint 완료 리포트를 재사용하고 종료 코드를 보존한다", () => {
  const context = fixture({ "entry.ts": "export const ok: number = 123;" }, { skipLibCheck: true });
  try {
    const reportPath = join(context.root, "report.json");
    const scriptPath = fileURLToPath(new URL("./typecheck-shards.mjs", import.meta.url));
    const cold = spawnSync(process.execPath, [scriptPath, "--project", context.project, "--report", reportPath, "--heap-mb", "1024"], {
      encoding: "utf8",
    });
    assert.equal(cold.status, 0, cold.stderr);
    const coldReport = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(coldReport.complete, true);
    assert.equal(coldReport.cacheReuse, undefined);

    const warm = spawnSync(process.execPath, [scriptPath, "--project", context.project, "--report", reportPath, "--heap-mb", "1024"], {
      encoding: "utf8",
    });
    assert.equal(warm.status, 0, warm.stderr);
    assert.match(warm.stdout, /완료 체크포인트 재사용/u);
    const warmReport = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(warmReport.complete, true);
    assert.equal(warmReport.cacheReuse?.mode, "complete");
  } finally { context.dispose(); }
});

test("호스팅 CI의 초기 바이트 예산은 명시된 경우에만 기본 CLI 값을 덮어쓴다", () => {
  const args = ["--heap-mb", "8192", "--max-source-bytes", "12582912"];
  const local = parseArguments(args, {});
  assert.equal(local.maxBytes, 12582912);
  for (const maxBytes of [3145728, 6291456]) {
    const hosted = parseArguments(args, { TOONSTUDIO_TYPECHECK_MAX_SOURCE_BYTES: String(maxBytes) });
    assert.deepEqual(hosted, { ...local, maxBytes });
  }
  assert.equal(parseArguments([], {}).maxBytes, 4 * 1024 * 1024);
  for (const value of ["", "0", "-1", "2.5", "NaN", "Infinity", "9007199254740992"]) {
    assert.throws(() => parseArguments(args, { TOONSTUDIO_TYPECHECK_MAX_SOURCE_BYTES: value }),
      /TOONSTUDIO_TYPECHECK_MAX_SOURCE_BYTES/u);
  }
  assert.throws(() => parseArguments(["--max-source-bytes", "0"], { TOONSTUDIO_TYPECHECK_MAX_SOURCE_BYTES: "6291456" }),
    /--max-source-bytes/u);
});

test("16GiB CI 러너에서 NODE_OPTIONS 12GiB가 주어지면 물리 메모리 72% 상한 내에서 워커 힙과 샤드 예산을 안전하게 확장한다", () => {
  const base = parseArguments(
    ["--heap-mb", "8192", "--max-source-bytes", "12582912"],
    { CI: "1", TOONSTUDIO_TYPECHECK_MAX_SOURCE_BYTES: "6291456" },
  );
  const runner16g = resolveRuntimeExecutionBudget(base, {
    env: { NODE_OPTIONS: "--max-old-space-size=12288" },
    totalMemoryBytes: 16 * 1024 ** 3,
  });
  assert.equal(runner16g.heapMb, Math.floor(16 * 1024 * 0.72));
  assert.equal(runner16g.maxBytes, 18 * 1024 * 1024);

  // 7GiB 러너나 NODE_OPTIONS 상향이 없는 경우는 기존 8192MB·6MiB 예산을 유지한다.
  const runner7g = resolveRuntimeExecutionBudget(base, {
    env: { NODE_OPTIONS: "--max-old-space-size=12288" },
    totalMemoryBytes: 7 * 1024 ** 3,
  });
  assert.deepEqual(runner7g, base);

  const unchanged = resolveRuntimeExecutionBudget(base, {
    env: { NODE_OPTIONS: "--max-old-space-size=8192" },
    totalMemoryBytes: 16 * 1024 ** 3,
  });
  assert.deepEqual(unchanged, base);
});

test("메모리 실패 발생 시 남은 큐 샤드도 즉시 안전한 절반 상한으로 분할해 반복 OOM 재시도를 방지한다", () => {
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"].map((path) => ({ path, bytes: 10 }));
  const identity = { version: "fixture", options: {}, files };
  const semanticBatches = [];
  const worker = (job) => {
    if (job.phase === "inventory") return { identity, fingerprint: "same" };
    if (job.phase === "preflight") return { fingerprint: "same", semanticAllowed: true, diagnostics: [] };
    semanticBatches.push(job.files);
    if (job.files.length > 2) return { failed: true, memoryFailure: true, exit: 134 };
    return { checked: job.files, fingerprint: "same", diagnostics: [], elapsedMs: 1, peakRssBytes: 1 };
  };
  const report = verifyInShards({ maxBytes: 40 }, worker);
  assert.equal(report.complete, true);
  assert.equal(report.phases.semantic.checkedFiles, 8);
  // 첫 4개 그룹만 OOM 1회 발생하고, 두 번째 4개 그룹은 미리 2개씩 분할돼 OOM 없이 통과한다.
  const oomRetries = report.workers.filter((item) => item.retry === "bisect");
  assert.equal(oomRetries.length, 1);
  assert.deepEqual(semanticBatches, [
    ["a", "b", "c", "d"],
    ["a", "b"],
    ["c", "d"],
    ["e", "f"],
    ["g", "h"],
  ]);
});
