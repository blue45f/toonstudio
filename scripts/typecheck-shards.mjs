#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, totalmem } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const WORKER_PATH = fileURLToPath(new URL("./typecheck-shards-worker.mjs", import.meta.url));
const GIB = 1024 ** 3;
export const DEFAULT_HEAP_MB = 8192;
export const DEFAULT_MAX_SOURCE_BYTES = 4 * 1024 * 1024;

export function diagnosticKey(diagnostic) {
  return JSON.stringify(diagnostic);
}

export function mergeDiagnostics(groups) {
  const records = new Map(groups.flat().map((record) => [diagnosticKey(record), record]));
  return [...records.values()].sort((left, right) => diagnosticKey(left).localeCompare(diagnosticKey(right), "en"));
}

/**
 * 호스트 물리 메모리와 CI 여부에 맞춰 안전한 기본 heap·샤드 크기를 산출한다.
 * CI(7~16GiB) 러너는 기존 안전 상한(8192MB)을 유지하고, 32GiB+ 로컬 머신은 불필요한 OOM 분할을 줄인다.
 */
export function resolveAdaptiveTypecheckLimits({
  totalMemoryBytes = totalmem(),
  isCi = Boolean(process.env.CI || process.env.GITHUB_ACTIONS),
} = {}) {
  const totalGiB = Number.isFinite(totalMemoryBytes) && totalMemoryBytes > 0
    ? totalMemoryBytes / GIB
    : 0;
  const totalMemoryGiB = Number(totalGiB.toFixed(1));
  if (isCi || totalGiB < 22) {
    return {
      heapMb: DEFAULT_HEAP_MB,
      maxBytes: DEFAULT_MAX_SOURCE_BYTES,
      tier: isCi ? "ci-safe" : "standard",
      totalMemoryGiB,
    };
  }
  if (totalGiB < 30) {
    return {
      heapMb: 12288,
      maxBytes: 16 * 1024 * 1024,
      tier: "local-24g",
      totalMemoryGiB,
    };
  }
  if (totalGiB < 48) {
    return {
      heapMb: 16384,
      maxBytes: 32 * 1024 * 1024,
      tier: "local-32g",
      totalMemoryGiB,
    };
  }
  return {
    heapMb: 24576,
    maxBytes: 64 * 1024 * 1024,
    tier: "local-48g+",
    totalMemoryGiB,
  };
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

export function parseArguments(args, runtimeOrEnv) {
  const hasExplicitSecondArg = runtimeOrEnv !== undefined;
  const isRuntimeConfig = Boolean(
    runtimeOrEnv
    && typeof runtimeOrEnv === "object"
    && ("totalMemoryBytes" in runtimeOrEnv || "isCi" in runtimeOrEnv || "env" in runtimeOrEnv),
  );
  const env = isRuntimeConfig
    ? (runtimeOrEnv.env ?? process.env)
    : (runtimeOrEnv ?? process.env);
  const isCi = isRuntimeConfig
    ? (runtimeOrEnv.isCi ?? Boolean(env.CI || env.GITHUB_ACTIONS))
    : Boolean(env.CI || env.GITHUB_ACTIONS);
  const totalMemoryBytes = isRuntimeConfig
    ? (runtimeOrEnv.totalMemoryBytes ?? totalmem())
    : totalmem();
  let explicitHeapMb;
  let explicitMaxBytes;
  const options = {
    project: resolve(REPOSITORY_ROOT, "tsconfig.json"),
    report: resolve(REPOSITORY_ROOT, "node_modules/.cache/typecheck-shards/report.json"),
    heapMb: DEFAULT_HEAP_MB,
    maxBytes: DEFAULT_MAX_SOURCE_BYTES,
    list: false,
    autoTune: env.TOONSTUDIO_TYPECHECK_AUTO_TUNE === "1",
    noCache: env.TOONSTUDIO_TYPECHECK_NO_CACHE === "1",
    tuningTier: "explicit",
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--list" || arg === "--dry-run") options.list = true;
    else if (arg === "--auto-tune") options.autoTune = true;
    else if (arg === "--no-cache" || arg === "--fresh") options.noCache = true;
    else if (["--project", "--report", "--heap-mb", "--max-source-bytes"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} 값을 지정하세요.`);
      if (arg === "--project") options.project = resolve(REPOSITORY_ROOT, value);
      else if (arg === "--report") options.report = resolve(REPOSITORY_ROOT, value);
      else if (arg === "--heap-mb") explicitHeapMb = numericOption(value, arg, 1024);
      else explicitMaxBytes = numericOption(value, arg, 1);
    } else throw new Error(`알 수 없는 인자: ${arg}`);
  }

  const adaptive = resolveAdaptiveTypecheckLimits({ totalMemoryBytes, isCi });
  if (options.autoTune) {
    options.heapMb = isCi
      ? (explicitHeapMb !== undefined ? Math.min(explicitHeapMb, DEFAULT_HEAP_MB) : adaptive.heapMb)
      : (explicitHeapMb !== undefined ? Math.max(explicitHeapMb, adaptive.heapMb) : adaptive.heapMb);
    options.maxBytes = isCi
      ? (explicitMaxBytes ?? adaptive.maxBytes)
      : (explicitMaxBytes !== undefined ? Math.max(explicitMaxBytes, adaptive.maxBytes) : adaptive.maxBytes);
    options.tuningTier = adaptive.tier;
  } else if (hasExplicitSecondArg && !isRuntimeConfig) {
    options.heapMb = explicitHeapMb ?? DEFAULT_HEAP_MB;
    options.maxBytes = explicitMaxBytes ?? DEFAULT_MAX_SOURCE_BYTES;
    options.tuningTier = "explicit";
  } else {
    options.heapMb = explicitHeapMb ?? adaptive.heapMb;
    options.maxBytes = explicitMaxBytes ?? adaptive.maxBytes;
    options.tuningTier = explicitHeapMb === undefined ? adaptive.tier : "explicit";
  }
  // CI는 pnpm의 기존 명령을 그대로 호출한다. 설정된 환경값만 CLI의 기본 예산을 덮어쓴다.
  const maxSourceBytes = env.TOONSTUDIO_TYPECHECK_MAX_SOURCE_BYTES;
  if (maxSourceBytes !== undefined) {
    options.maxBytes = numericOption(maxSourceBytes, "TOONSTUDIO_TYPECHECK_MAX_SOURCE_BYTES", 1);
  }
  return options;
}

/**
 * 동일 입력 fingerprint의 기존 체크포인트를 검증해 완전 재사용 또는 미완료 샤드 이어달리기를 판정한다.
 * 입력·프로젝트·TS 버전 중 하나라도 달라지면 fail-closed로 캐시를 폐기한다.
 */
export function extractReusableCheckpoint(existingReport, { project, identity, fingerprint }) {
  if (!existingReport || typeof existingReport !== "object") return { mode: "none" };
  if (
    existingReport.schemaVersion !== 1
    || existingReport.project !== project
    || existingReport.typescriptVersion !== identity.version
    || existingReport.fingerprint !== fingerprint
    || !Array.isArray(existingReport.diagnostics)
  ) {
    return { mode: "none" };
  }

  const expectedCount = identity.files.length;
  if (
    existingReport.complete === true
    && !existingReport.failure
    && existingReport.phases?.finalSnapshot?.fingerprint === fingerprint
    && existingReport.phases?.preflight?.fingerprint === fingerprint
    && existingReport.phases?.semantic?.checkedFiles === expectedCount
    && existingReport.phases?.semantic?.expectedFiles === expectedCount
  ) {
    return { mode: "complete", report: existingReport };
  }

  const preflight = existingReport.phases?.preflight;
  if (
    !preflight
    || preflight.fingerprint !== fingerprint
    || preflight.semanticAllowed !== true
    || !Array.isArray(preflight.diagnostics)
  ) {
    return { mode: "none" };
  }

  const expectedSet = new Set(identity.files.map((file) => file.path));
  const checkedSet = new Set();
  const checkedGroups = [];
  const reusedWorkers = [];
  const shardDiagnostics = [];
  for (const worker of Array.isArray(existingReport.workers) ? existingReport.workers : []) {
    if (
      !worker
      || worker.failed
      || worker.retry
      || worker.fingerprint !== fingerprint
      || !Array.isArray(worker.files)
      || worker.checked !== worker.files.length
      || !Array.isArray(worker.diagnostics)
    ) {
      continue;
    }
    const valid = worker.files.length > 0
      && worker.files.every((filePath) => expectedSet.has(filePath) && !checkedSet.has(filePath));
    if (!valid) continue;
    for (const filePath of worker.files) checkedSet.add(filePath);
    checkedGroups.push(worker.files);
    shardDiagnostics.push(worker.diagnostics);
    reusedWorkers.push({ ...worker, reused: true });
  }

  if (reusedWorkers.length === 0) return { mode: "none" };
  return {
    mode: "partial",
    preflight,
    reusedWorkers,
    checkedGroups,
    checkedSet,
    shardDiagnostics,
  };
}

function readExistingCheckpoint(reportPath) {
  if (!reportPath || !existsSync(reportPath)) return null;
  try {
    return JSON.parse(readFileSync(reportPath, "utf8"));
  } catch {
    return null;
  }
}

function withoutHeapOption(value = "") {
  return value.replace(/(?:^|\s)--max[-_]old[-_]space[-_]size(?:=|\s+)\d+/gu, " ").trim();
}

function parseNodeOptionsHeapMb(value = "") {
  let highest = null;
  for (const match of String(value).matchAll(/(?:^|\s)--max[-_]old[-_]space[-_]size(?:=|\s+)(\d+)/gu)) {
    const parsed = Number(match[1]);
    if (Number.isSafeInteger(parsed) && parsed >= 1024) {
      highest = highest === null ? parsed : Math.max(highest, parsed);
    }
  }
  return highest;
}

/**
 * 호스트 물리 메모리(>= 14GiB)와 부모 프로세스의 NODE_OPTIONS(--max-old-space-size)를 고려해
 * 워커 힙과 초기 샤드 바이트 예산을 안전 범위(물리 메모리 72% 이하)로 상향한다.
 * 전체 프로그램·파일·진단 기준은 전혀 완화하지 않고 반복 OOM 분할·Program 재파싱만 줄인다.
 */
export function resolveRuntimeExecutionBudget(
  options,
  { env = process.env, totalMemoryBytes = totalmem() } = {},
) {
  const totalGiB = Number.isFinite(totalMemoryBytes) && totalMemoryBytes > 0
    ? totalMemoryBytes / GIB
    : 0;
  const nodeOptionsHeapMb = parseNodeOptionsHeapMb(env?.NODE_OPTIONS ?? "");
  if (nodeOptionsHeapMb === null || nodeOptionsHeapMb <= options.heapMb || totalGiB < 14) {
    return options;
  }
  const safeHostHeapMb = Math.floor((totalMemoryBytes / (1024 * 1024)) * 0.72);
  const heapMb = Math.max(options.heapMb, Math.min(nodeOptionsHeapMb, safeHostHeapMb));
  if (heapMb <= options.heapMb) return options;
  const maxBytes = heapMb >= 11264
    ? Math.max(options.maxBytes, 18 * 1024 * 1024)
    : options.maxBytes;
  return {
    ...options,
    heapMb,
    maxBytes,
    tuningTier: `${options.tuningTier ?? "explicit"}+host-heap`,
  };
}

function describeWorkerFailure(result) {
  const detail = result.message?.trim();
  return `exit=${result.exit ?? "null"}, signal=${result.signal ?? "none"}${detail ? `: ${detail}` : "; worker stderr가 없습니다."}\n종료 원인을 해결한 뒤 pnpm typecheck를 다시 실행하세요.`;
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
  if (inventory.failed) throw new Error(`전체 프로그램 목록 생성 실패: ${describeWorkerFailure(inventory)}`);
  const { identity, fingerprint } = inventory;
  const reuse = options.noCache
    ? { mode: "none" }
    : extractReusableCheckpoint(options.resumeCheckpoint, { project: options.project, identity, fingerprint });

  if (reuse.mode === "complete") {
    const reusedReport = {
      ...reuse.report,
      limits: {
        workerConcurrency: 1,
        heapMb: options.heapMb,
        maxSourceBytes: options.maxBytes,
        tuningTier: options.tuningTier ?? "explicit",
      },
      cacheReuse: {
        mode: "complete",
        reusedFiles: identity.files.length,
        skippedShards: Array.isArray(reuse.report.workers) ? reuse.report.workers.length : 0,
      },
    };
    onProgress(
      `동일 fingerprint(${fingerprint.slice(0, 12)}) 완료 체크포인트 재사용: `
        + `${identity.files.length}/${identity.files.length}개, 진단 ${reusedReport.diagnostics.length}개`,
    );
    onCheckpoint(reusedReport);
    return reusedReport;
  }

  const report = {
    schemaVersion: 1,
    project: options.project,
    typescriptVersion: identity.version,
    limits: {
      workerConcurrency: 1,
      heapMb: options.heapMb,
      maxSourceBytes: options.maxBytes,
      tuningTier: options.tuningTier ?? "explicit",
    },
    fingerprint,
    identity,
    phases: {},
    workers: [],
    diagnostics: [],
    complete: false,
  };

  let preflight;
  const checked = [];
  const diagnostics = [];
  let pending;

  if (reuse.mode === "partial") {
    preflight = reuse.preflight;
    report.phases.preflight = preflight;
    checked.push(...reuse.checkedGroups);
    diagnostics.push(preflight.diagnostics, ...reuse.shardDiagnostics);
    report.workers.push(...reuse.reusedWorkers);
    report.diagnostics = mergeDiagnostics(diagnostics);
    report.phases.semantic = { checkedFiles: checked.flat().length, expectedFiles: identity.files.length };
    report.cacheReuse = {
      mode: "partial",
      reusedFiles: reuse.checkedSet.size,
      reusedShards: reuse.reusedWorkers.length,
    };
    onCheckpoint(report);
    onProgress(
      `동일 fingerprint(${fingerprint.slice(0, 12)}) 부분 체크포인트 이어달리기: `
        + `${reuse.checkedSet.size}/${identity.files.length}개(${reuse.reusedWorkers.length}개 샤드) 재사용`,
    );
    const remainingIdentity = {
      ...identity,
      files: identity.files.filter((file) => !reuse.checkedSet.has(file.path)),
    };
    pending = partitionFiles(remainingIdentity, options.maxBytes);
  } else {
    preflight = runWorker({ phase: "preflight", fingerprint });
    if (preflight.failed) throw new Error(`전역·구문 검사 실패: ${describeWorkerFailure(preflight)}`);
    if (preflight.fingerprint !== fingerprint) throw new Error("Preflight 입력 fingerprint가 일치하지 않습니다.");
    report.phases.preflight = preflight;
    report.diagnostics = preflight.diagnostics;
    onCheckpoint(report);
    if (!preflight.semanticAllowed) return report;
    diagnostics.push(preflight.diagnostics);
    pending = partitionFiles(identity, options.maxBytes);
  }

  while (pending.length > 0) {
    const files = pending.shift();
    onProgress(`의미 검사: ${checked.flat().length}/${identity.files.length}개 완료, 다음 ${files.length}개`);
    const result = runWorker({ phase: "semantic", fingerprint, files });
    if (result.failed) {
      if (result.memoryFailure && files.length > 1) {
        const middle = Math.ceil(files.length / 2);
        const adaptedPending = [];
        for (const queued of pending) {
          if (queued.length <= middle) {
            adaptedPending.push(queued);
          } else {
            for (let offset = 0; offset < queued.length; offset += middle) {
              adaptedPending.push(queued.slice(offset, offset + middle));
            }
          }
        }
        pending = [files.slice(0, middle), files.slice(middle), ...adaptedPending];
        report.workers.push({ files, ...result, retry: "bisect" });
        onCheckpoint(report);
        onProgress(`메모리 한도로 ${files.length}개 그룹을 ${middle}/${files.length - middle}개로 나눠 다시 검사하고 남은 큐 상한도 ${middle}개로 조정합니다.`);
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
    report.workers.push({
      files,
      checked: result.checked.length,
      fingerprint,
      diagnostics: result.diagnostics,
      elapsedMs: result.elapsedMs,
      peakRssBytes: result.peakRssBytes,
    });
    report.phases.semantic = { checkedFiles: checked.flat().length, expectedFiles: identity.files.length };
    report.diagnostics = mergeDiagnostics(diagnostics);
    onCheckpoint(report);
    onProgress(`샤드 완료: ${result.checked.length}개, ${(result.elapsedMs / 1000).toFixed(1)}초, peak RSS ${(result.peakRssBytes / 1024 ** 3).toFixed(2)}GiB, 진단 ${result.diagnostics.length}개`);
  }
  assertCompleteCoverage(identity.files.map((file) => file.path), checked);
  const finalInventory = runWorker({ phase: "inventory", fingerprint });
  if (finalInventory.failed) throw new Error(`최종 입력 확인 실패: ${describeWorkerFailure(finalInventory)}`);
  if (finalInventory.fingerprint !== fingerprint) {
    throw new Error("최종 입력 확인 실패: 검사 중 파일이 바뀌었거나 전체 프로그램을 다시 읽지 못했습니다.");
  }
  report.phases.semantic = { checkedFiles: checked.flat().length, expectedFiles: identity.files.length };
  report.phases.finalSnapshot = { fingerprint: finalInventory.fingerprint };
  report.diagnostics = mergeDiagnostics(diagnostics);
  report.complete = true;
  return report;
}

export function main(args = process.argv.slice(2)) {
  const parsedOptions = parseArguments(args);
  const options = parsedOptions.list ? parsedOptions : resolveRuntimeExecutionBudget(parsedOptions);
  const scratch = mkdtempSync(resolve(tmpdir(), "toonstudio-typecheck-shards-"));
  try {
    const runWorker = createWorkerRunner(options, scratch);
    if (options.list) {
      const inventory = runWorker({ phase: "inventory" });
      if (inventory.failed) throw new Error(`전체 프로그램 목록 생성 실패: ${describeWorkerFailure(inventory)}`);
      partitionFiles(inventory.identity, options.maxBytes).forEach((files, index) => {
        process.stdout.write(`${index + 1}: ${files.length}개 파일\n`);
      });
      return 0;
    }
    const existingCheckpoint = options.noCache ? null : readExistingCheckpoint(options.report);
    mkdirSync(dirname(options.report), { recursive: true });
    writeFileSync(options.report, `${JSON.stringify({ schemaVersion: 1, project: options.project, complete: false, status: "running" })}\n`);
    const report = verifyInShards(
      { ...options, resumeCheckpoint: existingCheckpoint },
      runWorker,
      (message) => process.stdout.write(`${message}\n`),
      (checkpoint) => writeFileSync(options.report, `${JSON.stringify(checkpoint, null, 2)}\n`),
    );
    mkdirSync(dirname(options.report), { recursive: true });
    writeFileSync(options.report, `${JSON.stringify(report, null, 2)}\n`);
    for (const diagnostic of report.diagnostics) {
      const location = diagnostic.file ? `${relative(REPOSITORY_ROOT, diagnostic.file)}(${diagnostic.line ?? 1},${diagnostic.column ?? 1})` : "전역";
      process.stderr.write(`${location} TS${diagnostic.code}: ${diagnostic.message}\n`);
    }
    const passed = report.complete && report.diagnostics.length === 0;
    process.stdout.write(`전체 타입 검사 ${passed ? "통과" : "실패"}: ${report.phases.semantic?.checkedFiles ?? 0}/${report.identity.files.length}개, 진단 ${report.diagnostics.length}개. ${options.report}\n`);
    if (report.failure) process.stderr.write(`${describeWorkerFailure(report.failure)}\n`);
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
