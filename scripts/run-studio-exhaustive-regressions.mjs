#!/usr/bin/env node
/** 원래 품질 게이트를 순차 실행하고 시간 초과·미실행·증거 누락을 성공으로 숨기지 않는다. */
import { spawn } from "node:child_process";
import {
  appendFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync,
  statSync, writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
export const EXPECTED_HELPER_TESTS = 28;
export const MAX_LOG_JSON_BYTES = 4 * 1024 * 1024;
export const MAX_STEP_SUMMARY_BYTES = 512 * 1024;
export const SOURCE_GATE_IDS = Object.freeze([
  "gpu-committed-parity", "engine-webgpu-filter-parity", "canvaskit-quality-worker",
  "dynamic-dual-tip-webgpu", "dynamic-dual-tip-webgpu-v2", "engine-webgpu-textured-brush",
  "engine-webgpu-tile-provider", "engine-tile-storage-opfs-v2",
]);
export const REGRESSION_GATES = Object.freeze([
  Object.freeze({
    id: "ui-helpers", kind: "helpers", executable: "pnpm",
    args: Object.freeze(["exec", "playwright", "test", "--config", "playwright.studio-qa-helpers.config.ts", "--reporter=list,json"]),
  }),
  ...[...SOURCE_GATE_IDS, "engine-webgpu-presentation", "living-ink-execution"].map(id => Object.freeze({
    id, kind: SOURCE_GATE_IDS.includes(id) ? "source-harness" : "runtime",
    executable: "pnpm", args: Object.freeze(["run", `verify:studio-${id}`]),
    script: `scripts/verify-studio-${id}.${id === "gpu-committed-parity" ? "mts" : "mjs"}`,
    browserEntry: `scripts/studio-${id}-browser.ts`,
  })),
]);

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function saveState(directory, state) {
  writeJson(join(directory, "summary.json"), state);
  writeFileSync(join(directory, "results.tsv"), "gate\tstatus\texit\tduration_ms\n" + state.gates.map(gate =>
    `${gate.id}\t${gate.status}\t${gate.exitCode ?? ""}\t${gate.durationMs ?? ""}\n`).join(""));
}

export function initializeRun(directory, deadlineMs, gates = REGRESSION_GATES) {
  mkdirSync(directory, { recursive: true });
  const state = {
    startedAt: new Date().toISOString(), deadlineMs, status: "incomplete",
    expectedHelperTests: EXPECTED_HELPER_TESTS,
    sourceHarnesses: gates.filter(gate => gate.kind === "source-harness").length,
    gates: gates.map(gate => ({ id: gate.id, status: "not_run", exitCode: null, durationMs: null, reason: null })),
  };
  saveState(directory, state);
  return state;
}

/** Playwright의 exit 0만 믿지 않고 실제 28개 모두 처음 시도에서 성공했는지 확인한다. */
export function validateHelperReport(report, expected = EXPECTED_HELPER_TESTS) {
  const tests = [];
  const visit = suite => {
    for (const spec of suite.specs ?? []) tests.push(...(spec.tests ?? []));
    for (const nested of suite.suites ?? []) visit(nested);
  };
  for (const suite of report.suites ?? []) visit(suite);
  const stats = report.stats ?? {};
  if (report.errors?.length || tests.length !== expected || stats.expected !== expected
    || stats.unexpected !== 0 || stats.flaky !== 0 || stats.skipped !== 0
    || tests.some(test => test.expectedStatus !== "passed" || test.status !== "expected"
      || test.results?.length !== 1 || test.results[0].status !== "passed")) {
    throw new Error(`UI helper ${expected}개 전부 성공해야 합니다: 실제=${tests.length}, stats=${JSON.stringify(stats)}`);
  }
  return tests.length;
}

/** WebGL2 launch 실패가 빈 failures로 반환되어도 실제 두 백엔드 실행을 요구한다. */
export function validateLivingInkReport(report) {
  const failures = [];
  const emptyList = value => Array.isArray(value) && value.length === 0;
  if (report?.status !== "ok" || !emptyList(report?.failures)) {
    failures.push("최종 status/failures가 성공 계약과 다릅니다");
  }
  const backends = ["webgl2", "webgpu"];
  for (const id of backends) {
    const lane = report?.backends?.[id];
    const backend = `real-chromium-dedicated-worker-offscreen-${id}-half-float-v1`;
    if (lane?.id !== id || lane.status !== "ok" || lane.backend !== backend || !emptyList(lane.failures)) {
      failures.push(`${id} 실제 실행 증거가 없습니다: status=${lane?.status ?? "missing"}, backend=${lane?.backend ?? "missing"}, reason=${lane?.reason ?? "none"}`);
    }
  }
  const parity = report?.webgpuVisualParity;
  // repairedGates는 정상 보정이 아니라 기록된 미해결 gate의 통과이며, 원래 검증도 기록 갱신 전에는 실패한다.
  if (parity?.status !== "reached" || ["unresolvedGates", "regressedGates", "repairedGates", "recordedGap"]
    .some(key => !emptyList(parity?.[key]))) {
    failures.push("WebGPU parity가 원래의 빈 gap 계약에 도달하지 않았습니다");
  }
  if (failures.length) throw new Error(`LivingInk 두 백엔드의 실제 완료를 확인하세요: ${failures.join("; ")}`);
  return backends;
}

function stopProcessTree(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function executeGate(gate, directory, deadlineMs, { cwd, env, output, signal }) {
  return new Promise(resolveResult => {
    const log = createWriteStream(join(directory, "command.log"));
    const args = [...gate.args];
    if (gate.kind === "helpers") args.push(`--output=${join(directory, "playwright")}`);
    const child = spawn(gate.executable, args, {
      cwd, env: {
        ...env, TOONSPECTRUM_VERIFY_DIR: directory,
        TOONSPECTRUM_LIVING_INK_VERIFY_DIR: directory,
        TOONSPECTRUM_LIVING_INK_PROBE_RESULTS_PATH: join(directory, "living-ink-probe.json"),
        PLAYWRIGHT_JSON_OUTPUT_FILE: join(directory, "helper-results.json"),
      },
      shell: false, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
    });
    let reason = null;
    let forceKill;
    const stop = message => {
      if (reason) return;
      reason = message;
      stopProcessTree(child, "SIGTERM");
      forceKill = setTimeout(() => stopProcessTree(child, "SIGKILL"), 1_000);
    };
    const timeout = setTimeout(() => stop("global_budget_exhausted"), Math.max(1, deadlineMs - Date.now()));
    const abort = () => stop("cancelled");
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
      log.write(chunk);
      output.write(chunk);
    });
    log.on("error", error => stop(`log_write_failed: ${error.message}`));
    child.on("error", error => { reason = `spawn_failed: ${error.message}`; });
    child.once("close", (code, closeSignal) => {
      clearTimeout(timeout);
      clearTimeout(forceKill);
      signal?.removeEventListener("abort", abort);
      log.end(() => resolveResult({
        exitCode: reason === "global_budget_exhausted" ? 124 : code ?? 1,
        reason: reason ?? (closeSignal ? `signal: ${closeSignal}` : null),
      }));
    });
  });
}

export async function runRegressionPlan({
  directory, deadlineMs, gates = REGRESSION_GATES, cwd = REPOSITORY_ROOT,
  env = process.env, output = process.stdout, signal,
}) {
  const state = initializeRun(directory, deadlineMs, gates);
  for (const [index, gate] of gates.entries()) {
    const record = state.gates[index];
    if (Date.now() >= deadlineMs || signal?.aborted) {
      record.reason = signal?.aborted ? "cancelled_before_start" : "global_budget_exhausted_before_start";
      saveState(directory, state);
      continue;
    }
    const gateDirectory = join(directory, "evidence", gate.id);
    mkdirSync(gateDirectory, { recursive: true });
    record.status = "running";
    saveState(directory, state);
    output.write(`::group::Studio regression ${gate.id}\n`);
    const started = Date.now();
    const result = await executeGate(gate, gateDirectory, deadlineMs, { cwd, env, output, signal });
    Object.assign(record, result, { durationMs: Date.now() - started });
    if (gate.kind === "helpers" && record.exitCode === 0 && !record.reason) {
      try {
        record.executedTests = validateHelperReport(JSON.parse(readFileSync(join(gateDirectory, "helper-results.json"), "utf8")));
      } catch (error) {
        record.exitCode = 1;
        record.reason = `helper_report_failed: ${error.message}`;
      }
    }
    if (gate.id === "living-ink-execution" && record.exitCode === 0 && !record.reason) {
      try {
        record.executedBackends = validateLivingInkReport(JSON.parse(readFileSync(join(gateDirectory, "summary.json"), "utf8")));
      } catch (error) {
        record.exitCode = 1;
        record.reason = `living_ink_report_failed: ${error.message}`;
      }
    }
    record.status = record.exitCode === 0 && !record.reason ? "passed" : "failed";
    writeJson(join(gateDirectory, "gate-result.json"), record);
    saveState(directory, state);
    output.write(`\n[studio-regression] ${JSON.stringify(record)}\n::endgroup::\n`);
  }
  state.status = state.gates.every(gate => gate.status === "passed") ? "passed" : "failed";
  saveState(directory, state);
  return state;
}

function evidenceFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...evidenceFiles(path));
    else if (entry.isFile()) files.push({ path, bytes: statSync(path).size });
  }
  return files;
}

function buildStepSummary(state, documents, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1_024) throw new Error("step summary 예산은 1024 bytes 이상이어야 합니다.");
  const complete = state.publication.logComplete;
  let text = `## Studio focused regressions: ${state.status}\n\n${EXPECTED_HELPER_TESTS} DOM cases + 8 source harnesses + presentation + LivingInk. PNG/trace remain only on the runner; no artifact/cache upload.\n\n`
    + (complete ? "원본 JSON 전체는 Actions 로그의 파일별 그룹에 보존했습니다. 이 요약은 별도의 표시 예산에 맞춰 선별합니다.\n\n"
      : "원본 JSON 전체 보존에 실패했습니다. 실패 원인과 보존 가능한 진단은 Actions 로그를 확인하세요.\n\n");
  // 끝의 선택 개수 안내 공간을 남기며, JSON은 잘라내지 않고 완전한 문서 단위로 선택한다.
  const footerReserve = 256;
  const append = (block, fallback = "") => {
    if (Buffer.byteLength(text + block) + footerReserve <= maxBytes) { text += block; return true; }
    if (fallback && Buffer.byteLength(text + fallback) + footerReserve <= maxBytes) text += fallback;
    return false;
  };
  const table = state.gates.map(gate => `| ${gate.id} | ${gate.status} | ${gate.exitCode ?? "—"} | ${gate.durationMs ?? "—"} |`).join("\n");
  append(`| Gate | Status | Exit | ms |\n|---|---|---:|---:|\n${table}\n\n`, "게이트 전체 표는 Actions 로그의 Studio regression results에 있습니다.\n\n");
  const failures = { gates: state.gates.filter(gate => gate.status !== "passed"), publication: state.publication.failures };
  append(`### 실패 원인\n\n\`\`\`json\n${JSON.stringify(failures, null, 2)}\n\`\`\`\n\n`, "실패 원인 전체는 Actions 로그에 보존했습니다.\n\n");
  append(`### 증거 manifest\n\n\`\`\`json\n${JSON.stringify(state.publication.manifest, null, 2)}\n\`\`\`\n\n`,
    `증거 manifest ${state.publication.manifest.length}개 항목 전체는 Actions 로그에 있습니다.\n\n`);
  const priority = document => {
    const rank = ["failure.json", "gate-result.json", "browser-diagnostics.json", "summary.json"].indexOf(basename(document.path));
    const failedGate = state.gates.some(gate => gate.status !== "passed" && document.path.startsWith(`evidence/${gate.id}/`));
    return (rank < 0 ? 10 : rank) + (failedGate ? 0 : 20);
  };
  const includedFiles = [];
  const seen = new Set();
  for (const document of [...documents].sort((a, b) => priority(a) - priority(b) || a.path.localeCompare(b.path, "en"))) {
    if (seen.has(document.path)) continue;
    seen.add(document.path);
    if (append(`### ${document.path}\n\n\`\`\`json\n${document.raw}\n\`\`\`\n\n`)) includedFiles.push(document.path);
  }
  const omittedCount = documents.length - includedFiles.length;
  text += `요약 JSON: ${includedFiles.length}/${documents.length}개. 요약에서 생략한 ${omittedCount}개 문서는 위 Actions 로그 보존 상태를 따릅니다.\n`;
  return { text, includedFiles, omittedCount, bytes: Buffer.byteLength(text), limitBytes: maxBytes };
}

/** 로그의 원본 보존 예산과 요약 표시 예산은 별개다. 요약 선별만으로 품질 판정을 바꾸지 않는다. */
export function publishRun({ directory, output = process.stdout, summaryPath,
  maxLogJsonBytes = MAX_LOG_JSON_BYTES, maxSummaryBytes = MAX_STEP_SUMMARY_BYTES }) {
  const statePath = join(directory, "summary.json");
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : initializeRun(directory, Date.now());
  for (const record of state.gates) {
    if (record.status === "running") {
      record.status = "failed";
      record.reason = "interrupted_before_result";
    }
    if (record.status === "not_run" && !record.reason) record.reason = "setup_or_execution_did_not_complete";
  }
  const files = evidenceFiles(join(directory, "evidence"));
  const manifest = files.map(file => ({ path: relative(directory, file.path), bytes: file.bytes }));
  writeJson(join(directory, "evidence-manifest.json"), manifest);
  const jsonFiles = files.filter(file => file.path.endsWith(".json"));
  const jsonBytes = jsonFiles.reduce((sum, file) => sum + file.bytes, 0);
  const publicationFailures = [];
  const present = new Set(manifest.map(file => file.path));
  const expected = new Set([
    ...(state.publication?.expectedJsonFiles ?? []),
    ...(state.publication?.manifest ?? []).filter(file => file.path.endsWith(".json")).map(file => file.path),
    ...jsonFiles.map(file => relative(directory, file.path)),
    ...state.gates.filter(gate => ["passed", "failed"].includes(gate.status) && gate.exitCode !== null)
      .map(gate => `evidence/${gate.id}/gate-result.json`),
  ]);
  for (const file of expected) if (!present.has(file)) publicationFailures.push(`${file}: 원본 JSON 증거가 누락되었습니다.`);
  let selected = jsonFiles;
  if (jsonBytes > maxLogJsonBytes) {
    publicationFailures.push(`원본 JSON ${jsonBytes} bytes가 Actions 로그 보존 상한 ${maxLogJsonBytes} bytes를 넘었습니다. 원본은 runner 전용 디렉터리에 남기며 누락된 증거를 성공으로 처리하지 않습니다.`);
    let remaining = maxLogJsonBytes;
    selected = jsonFiles.filter(file => {
      if (!/^(?:failure|browser-diagnostics|gate-result)\.json$/u.test(basename(file.path)) || file.bytes > remaining) return false;
      remaining -= file.bytes;
      return true;
    });
  }
  const documents = [];
  for (const file of selected) {
    try {
      const raw = readFileSync(file.path, "utf8");
      documents.push({ path: relative(directory, file.path), raw });
      JSON.parse(raw);
    } catch (error) {
      publicationFailures.push(`${relative(directory, file.path)}: JSON 증거를 읽지 못했습니다: ${error.message}`);
    }
  }
  state.publication = { jsonBytes, limitBytes: maxLogJsonBytes, logComplete: publicationFailures.length === 0,
    failures: publicationFailures, manifest, expectedJsonFiles: [...expected].sort() };
  state.status = state.gates.every(gate => gate.status === "passed") && publicationFailures.length === 0 ? "passed" : "failed";
  const summary = buildStepSummary(state, documents, maxSummaryBytes);
  state.publication.summary = { bytes: summary.bytes, limitBytes: summary.limitBytes,
    includedFiles: summary.includedFiles, omittedCount: summary.omittedCount };
  saveState(directory, state);
  output.write(`::group::Studio regression results\n${JSON.stringify(state, null, 2)}\n::endgroup::\n`);
  for (const document of documents) output.write(`::group::${document.path}\n${document.raw}\n::endgroup::\n`);
  if (summaryPath) appendFileSync(summaryPath, summary.text);
  return state;
}

function checkPlan() {
  const scripts = JSON.parse(readFileSync(join(REPOSITORY_ROOT, "package.json"), "utf8")).scripts;
  for (const gate of REGRESSION_GATES.filter(gate => gate.script)) {
    const expectedCommand = `${gate.script.endsWith(".mts") ? "tsx" : "node"} ${gate.script}`;
    if (scripts[gate.args[1]] !== expectedCommand || !existsSync(join(REPOSITORY_ROOT, gate.browserEntry))) {
      throw new Error(`원래 검증 명령/브라우저 진입점이 없습니다: ${gate.id}`);
    }
  }
  return { helperTests: EXPECTED_HELPER_TESTS, sourceHarnesses: SOURCE_GATE_IDS.length, gates: REGRESSION_GATES };
}

async function main() {
  const command = process.argv[2];
  if (process.argv.length > 3 || !["--check", "--init", "--run", "--publish"].includes(command)) {
    throw new Error("node scripts/run-studio-exhaustive-regressions.mjs --check|--init|--run|--publish 로 실행하세요.");
  }
  if (command === "--check") {
    console.log(JSON.stringify(checkPlan(), null, 2));
    return 0;
  }
  const directory = resolve(process.env.TOONSPECTRUM_FOCUSED_VERIFY_DIR ?? join(REPOSITORY_ROOT, "artifacts/studio-exhaustive-regressions"));
  const deadlineMs = Number(process.env.STUDIO_QA_DEADLINE_MS ?? Date.now() + 14 * 60_000);
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0) throw new Error("STUDIO_QA_DEADLINE_MS는 유효한 절대 시간이어야 합니다.");
  if (command === "--init") { initializeRun(directory, deadlineMs); return 0; }
  if (command === "--publish") return publishRun({ directory, summaryPath: process.env.GITHUB_STEP_SUMMARY }).status === "passed" ? 0 : 1;
  checkPlan();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGTERM", cancel);
  process.once("SIGINT", cancel);
  try {
    const result = await runRegressionPlan({ directory, deadlineMs, signal: controller.signal });
    return result.status === "passed" ? 0 : 1;
  } finally {
    process.removeListener("SIGTERM", cancel);
    process.removeListener("SIGINT", cancel);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`Studio 회귀 검증 실패: ${error.message}`);
    process.exitCode = 1;
  });
}
