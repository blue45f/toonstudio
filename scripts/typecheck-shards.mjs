#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const WORKER_PATH = fileURLToPath(new URL("./typecheck-shards-worker.mjs", import.meta.url));

export function diagnosticKey(diagnostic) {
  return JSON.stringify(diagnostic);
}

export function mergeDiagnostics(groups) {
  const records = new Map(groups.flat().map((record) => [diagnosticKey(record), record]));
  return [...records.values()].sort((left, right) => diagnosticKey(left).localeCompare(diagnosticKey(right), "en"));
}

/** 모든 Program SourceFile을 한 번씩 배정한다. skipLibCheck도 컴파일러가 직접 적용한다. */
export function partitionFiles(identity, maxBytes) {
  const groups = [];
  let group = [];
  let bytes = 0;
  for (const file of identity.files) {
    const cost = (identity.options.skipLibCheck && file.declaration)
      || (identity.options.skipDefaultLibCheck && file.defaultLibrary) ? 0 : file.bytes;
    if (group.length > 0 && bytes + cost > maxBytes) {
      groups.push(group);
      group = [];
      bytes = 0;
    }
    group.push(file.path);
    bytes += cost;
  }
  if (group.length > 0) groups.push(group);
  return groups;
}

export function assertCompleteCoverage(expected, groups) {
  const remaining = new Set(expected);
  if (remaining.size !== expected.length) throw new Error("전체 프로그램 목록에 중복 파일이 있습니다.");
  for (const files of groups) {
    for (const file of files) {
      if (!remaining.delete(file)) throw new Error(`중복 또는 알 수 없는 검사 파일: ${file}`);
    }
  }
  if (remaining.size > 0) throw new Error(`의미 검사가 끝나지 않은 파일이 ${remaining.size}개 있습니다.`);
}

function numericOption(value, name, minimum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) throw new Error(`${name}는 ${minimum} 이상의 정수여야 합니다.`);
  return number;
}

export function parseArguments(args) {
  const options = {
    project: resolve(REPOSITORY_ROOT, "tsconfig.json"),
    report: resolve(REPOSITORY_ROOT, "node_modules/.cache/typecheck-shards/report.json"),
    heapMb: 8192,
    maxBytes: 4 * 1024 * 1024,
    list: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--list" || arg === "--dry-run") options.list = true;
    else if (["--project", "--report", "--heap-mb", "--max-source-bytes"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} 값을 지정하세요.`);
      if (arg === "--project") options.project = resolve(REPOSITORY_ROOT, value);
      else if (arg === "--report") options.report = resolve(REPOSITORY_ROOT, value);
      else if (arg === "--heap-mb") options.heapMb = numericOption(value, arg, 1024);
      else options.maxBytes = numericOption(value, arg, 1);
    } else throw new Error(`알 수 없는 인자: ${arg}`);
  }
  return options;
}

function withoutHeapOption(value = "") {
  return value.replace(/(?:^|\s)--max[-_]old[-_]space[-_]size(?:=|\s+)\d+/gu, " ").trim();
}

function createWorkerRunner(options, scratch) {
  let sequence = 0;
  return (job) => {
    const id = sequence++;
    const input = resolve(scratch, `${id}.input.json`);
    const output = resolve(scratch, `${id}.output.json`);
    writeFileSync(input, JSON.stringify({ project: options.project, cwd: REPOSITORY_ROOT, ...job, output }));
    const processResult = spawnSync(process.execPath, [`--max-old-space-size=${options.heapMb}`, WORKER_PATH, input], {
      cwd: REPOSITORY_ROOT,
      env: { ...process.env, NODE_OPTIONS: withoutHeapOption(process.env.NODE_OPTIONS) },
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (processResult.error) throw processResult.error;
    if (processResult.status !== 0) {
      const memoryFailure = [134, 137].includes(processResult.status)
        || ["SIGABRT", "SIGKILL"].includes(processResult.signal);
      return { failed: true, memoryFailure, exit: processResult.status, signal: processResult.signal,
        message: String(processResult.stderr).slice(-3000) };
    }
    return JSON.parse(readFileSync(output, "utf8"));
  };
}

/** Worker 실패·중복·미검사·입력 변경을 통과로 취급하지 않는다. */
export function verifyInShards(options, runWorker, onProgress = () => {}, onCheckpoint = () => {}) {
  const inventory = runWorker({ phase: "inventory" });
  if (inventory.failed) throw new Error(`전체 프로그램 목록 생성 실패: ${inventory.message}`);
  const { identity, fingerprint } = inventory;
  const report = {
    schemaVersion: 1,
    project: options.project,
    typescriptVersion: identity.version,
    limits: { workerConcurrency: 1, heapMb: options.heapMb, maxSourceBytes: options.maxBytes },
    fingerprint,
    identity,
    phases: {},
    workers: [],
    diagnostics: [],
    complete: false,
  };
  const preflight = runWorker({ phase: "preflight", fingerprint });
  if (preflight.failed) throw new Error(`전역·구문 검사 실패: ${preflight.message}`);
  if (preflight.fingerprint !== fingerprint) throw new Error("Preflight 입력 fingerprint가 일치하지 않습니다.");
  report.phases.preflight = preflight;
  report.diagnostics = preflight.diagnostics;
  onCheckpoint(report);
  if (!preflight.semanticAllowed) return report;
  const pending = partitionFiles(identity, options.maxBytes);
  const checked = [];
  const diagnostics = [preflight.diagnostics];
  while (pending.length > 0) {
    const files = pending.shift();
    onProgress(`의미 검사: ${checked.flat().length}/${identity.files.length}개 완료, 다음 ${files.length}개`);
    const result = runWorker({ phase: "semantic", fingerprint, files });
    if (result.failed) {
      if (result.memoryFailure && files.length > 1) {
        const middle = Math.ceil(files.length / 2);
        pending.unshift(files.slice(0, middle), files.slice(middle));
        report.workers.push({ files, ...result, retry: "bisect" });
        onCheckpoint(report);
        onProgress(`메모리 한도로 ${files.length}개 그룹을 ${middle}/${files.length - middle}개로 나눠 다시 검사합니다.`);
        continue;
      }
      report.failure = { files, ...result };
      report.diagnostics = mergeDiagnostics(diagnostics);
      report.phases.semantic = { checkedFiles: checked.flat().length, expectedFiles: identity.files.length };
      return report;
    }
    if (result.fingerprint !== fingerprint) throw new Error("Worker 입력 fingerprint가 일치하지 않습니다.");
    assertCompleteCoverage(files, [result.checked]);
    checked.push(result.checked);
    diagnostics.push(result.diagnostics);
    report.workers.push({ files, checked: result.checked.length, elapsedMs: result.elapsedMs, peakRssBytes: result.peakRssBytes });
    report.phases.semantic = { checkedFiles: checked.flat().length, expectedFiles: identity.files.length };
    report.diagnostics = mergeDiagnostics(diagnostics);
    onCheckpoint(report);
    onProgress(`샤드 완료: ${result.checked.length}개, ${(result.elapsedMs / 1000).toFixed(1)}초, peak RSS ${(result.peakRssBytes / 1024 ** 3).toFixed(2)}GiB, 진단 ${result.diagnostics.length}개`);
  }
  assertCompleteCoverage(identity.files.map((file) => file.path), checked);
  const finalInventory = runWorker({ phase: "inventory", fingerprint });
  if (finalInventory.failed || finalInventory.fingerprint !== fingerprint) {
    throw new Error("최종 입력 확인 실패: 검사 중 파일이 바뀌었거나 전체 프로그램을 다시 읽지 못했습니다.");
  }
  report.phases.semantic = { checkedFiles: checked.flat().length, expectedFiles: identity.files.length };
  report.phases.finalSnapshot = { fingerprint: finalInventory.fingerprint };
  report.diagnostics = mergeDiagnostics(diagnostics);
  report.complete = true;
  return report;
}

export function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const scratch = mkdtempSync(resolve(tmpdir(), "toonstudio-typecheck-shards-"));
  try {
    const runWorker = createWorkerRunner(options, scratch);
    if (options.list) {
      const inventory = runWorker({ phase: "inventory" });
      if (inventory.failed) throw new Error(inventory.message);
      partitionFiles(inventory.identity, options.maxBytes).forEach((files, index) => {
        process.stdout.write(`${index + 1}: ${files.length}개 파일\n`);
      });
      return 0;
    }
    mkdirSync(dirname(options.report), { recursive: true });
    writeFileSync(options.report, `${JSON.stringify({ schemaVersion: 1, project: options.project, complete: false, status: "running" })}\n`);
    const report = verifyInShards(options, runWorker, (message) => process.stdout.write(`${message}\n`),
      (checkpoint) => writeFileSync(options.report, `${JSON.stringify(checkpoint, null, 2)}\n`));
    mkdirSync(dirname(options.report), { recursive: true });
    writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`);
    for (const diagnostic of report.diagnostics) {
      const location = diagnostic.file ? `${relative(REPOSITORY_ROOT, diagnostic.file)}(${diagnostic.line ?? 1},${diagnostic.column ?? 1})` : "전역";
      process.stderr.write(`${location} TS${diagnostic.code}: ${diagnostic.message}\n`);
    }
    const passed = report.complete && report.diagnostics.length === 0;
    process.stdout.write(`전체 타입 검사 ${passed ? "통과" : "실패"}: ${report.phases.semantic?.checkedFiles ?? 0}/${report.identity.files.length}개, 진단 ${report.diagnostics.length}개. ${options.report}\n`);
    if (report.failure) process.stderr.write(`${report.failure.message}\n`);
    return passed ? 0 : 1;
  } catch (error) {
    if (!options.list) {
      mkdirSync(dirname(options.report), { recursive: true });
      writeFileSync(options.report, `${JSON.stringify({ schemaVersion: 1, project: options.project, complete: false,
        failure: error instanceof Error ? error.message : String(error) }, null, 2)}\n`);
    }
    throw error;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`전체 타입 검사 실패: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
