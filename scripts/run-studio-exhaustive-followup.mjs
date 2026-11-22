#!/usr/bin/env node
/** 기존 production 산출물에서 정해진 후속 검사만 실행하고 미실행·증거 누락을 실패로 보존한다. */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statfsSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateHelperReport } from "./run-studio-exhaustive-regressions.mjs";
import { STABILIZATION_SUITES, finalizeStabilizationEvidence, isStabilizationSuite, stabilizationRuntime,
  validateStabilizationFiles, validateStabilizationReport } from "./studio-stabilization-followup-cases.mjs";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const MAX_JSON_BYTES = 4 * 1024 * 1024;
export const MAX_SUMMARY_BYTES = 256 * 1024;
export const SOURCE_MODES = Object.freeze({ artifact: { jobMinutes: 20, workMinutes: 19 }, "fresh-source": { jobMinutes: 40, workMinutes: 39 } });
const SDK_PATHS = Object.freeze(["/usr/local/lib/android/sdk", "/usr/share/dotnet/sdk"]);
const runnerPath = "scripts/run-studio-exhaustive-followup.mjs";
const workflowPath = ".github/workflows/studio-exhaustive-regressions.yml";
const matrix = (engine, profile) => Object.freeze({
  id: `${engine}-${profile}-animation`, kind: "matrix", command: "node",
  args: ["scripts/qa/verify-studio-cross-browser-matrix.mjs"], report: "report.json", minutes: 3,
  scope: `${engine}/${profile}/animation`,
  env: { TOONSPECTRUM_VERIFY_ENGINES: engine, TOONSPECTRUM_VERIFY_PROFILES: profile, TOONSPECTRUM_VERIFY_ROUTES: "animation",
    TOONSPECTRUM_VERIFY_LOCALE: "ko-KR", TOONSPECTRUM_VERIFY_COLOR_SCHEME: "light", TOONSPECTRUM_VERIFY_REDUCED_MOTION: "no-preference" },
});
const native = scenario => Object.freeze({
  id: `native-${scenario}`, kind: "native", command: "pnpm", minutes: 5,
  args: ["exec", "tsx", "scripts/verify-studio-native-raster-tools.mts", `--scenario=${scenario}`],
  report: "studio-native-raster-tools-report.json", scenario, env: {},
});
const pencil = Object.freeze({ id: "media-pencil-grain", kind: "media", command: "pnpm", minutes: 4,
  args: ["exec", "tsx", "scripts/verify-studio-brush-media.mts"], report: "studio-brush-media-report.json",
  medium: "pencil-grain", env: { TOONSPECTRUM_BRUSH_VERIFY_IDS: "pencil-grain" } });
const inappEditor = Object.freeze({ id: "inapp-kakaotalk-android-360-editor", kind: "inapp", command: "pnpm", minutes: 4,
  args: ["exec", "tsx", "scripts/verify-studio-inapp-browser.mts"], report: "studio-inapp-browser-report.json",
  profile: "kakaotalk-android-360", route: "editor",
  env: { TOONSPECTRUM_INAPP_VERIFY_PROFILES: "kakaotalk-android-360", TOONSPECTRUM_INAPP_VERIFY_ROUTES: "editor" } });
export const SUITES = Object.freeze({
  followup: Object.freeze([
    Object.freeze({ id: "service-worker", kind: "sw", command: "pnpm", minutes: 6,
      args: ["exec", "tsx", "scripts/verify-studio-service-worker.mts"], report: "service-worker-report.json", env: {} }),
    matrix("webkit", "kakaotalk-android-360"), matrix("chromium", "tablet-768"), native("paint-bucket"),
  ]),
  "native-representatives": Object.freeze([native("paint-bucket"), native("selection-rect"), native("filter-inside")]),
  residual: Object.freeze([
    matrix("webkit", "kakaotalk-android-360"), native("dodge-burn"),
    pencil,
    Object.freeze({ id: "hokusai-live-integration", kind: "hokusai", command: "pnpm", minutes: 6,
      args: ["exec", "tsx", "scripts/verify-studio-hokusai-live-integration.mts"], report: "studio-hokusai-live-integration.json", env: {} }),
    inappEditor,
  ]),
  "pencil-only": Object.freeze([pencil]),
  "canvas-layout": Object.freeze([
    Object.freeze({ id: "ui-helpers-and-chrome-layout", kind: "helpers", command: "pnpm", minutes: 3,
      args: ["exec", "playwright", "test", "--config", "config/playwright/playwright.studio-qa-helpers.config.ts", "--reporter=list,json"],
      report: "helper-results.json", env: {} }),
    pencil, inappEditor,
  ]),
  ...STABILIZATION_SUITES,
});
const json = path => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const digest = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const git = (args, cwd = ROOT) => execFileSync("git", args, { cwd, encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }).trim();
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
const empty = value => Array.isArray(value) && value.length === 0;
const save = (directory, state) => writeJson(join(directory, "summary.json"), state);

export function planFor(suite) {
  requireValue(Object.hasOwn(SUITES, suite), `지원하는 고정 suite만 선택하세요: ${Object.keys(SUITES).join(", ")}`);
  return SUITES[suite];
}

export function browsersFor(suite) {
  return ["chromium", ...(planFor(suite).some(item => item.env.TOONSPECTRUM_VERIFY_ENGINES === "webkit") ? ["webkit"] : [])];
}

export function initialize(directory, suite, deadlineMs, sourceMode = "artifact") {
  requireValue(Object.hasOwn(SOURCE_MODES, sourceMode), "source_mode는 artifact 또는 fresh-source여야 합니다.");
  requireValue(!isStabilizationSuite(suite) || sourceMode === "fresh-source", "새 stabilization suite는 정확한 현재 SHA의 fresh-source 빌드가 필요합니다.");
  requireValue(Number.isSafeInteger(deadlineMs) && deadlineMs > 0, `${SOURCE_MODES[sourceMode].workMinutes}분 작업 deadline이 필요합니다.`);
  mkdirSync(directory, { recursive: true });
  const state = { schema: 1, suite, sourceMode, scope: suite === "canvas-layout" ? "selected-original-cases-and-css-fixtures" : "selected-original-cases-only", startedAt: new Date().toISOString(),
    deadlineMs, phase: "setup", status: "incomplete", provenance: null, build: null, failures: [],
    cases: planFor(suite).map(item => ({ id: item.id, status: "not_run", exitCode: null, reason: null, durationMs: null })) };
  save(directory, state);
  return state;
}

export function parseInputs(env) {
  const sourceSha = env.STUDIO_FOLLOWUP_SOURCE_SHA;
  const runId = env.STUDIO_FOLLOWUP_RUN_ID;
  const artifactId = env.STUDIO_FOLLOWUP_ARTIFACT_ID;
  requireValue(/^[0-9a-f]{40}$/u.test(sourceSha ?? ""), "source_sha에 production 빌드의 정확한 40자리 SHA를 입력하세요.");
  for (const [label, value] of [["producer_run_id", runId], ["artifact_id", artifactId]]) {
    requireValue(/^[1-9][0-9]*$/u.test(value ?? "") && Number.isSafeInteger(Number(value)), `${label}에 유효한 숫자 ID를 입력하세요.`);
  }
  requireValue(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(env.GITHUB_REPOSITORY ?? ""), "GitHub 저장소 식별자가 없습니다.");
  const repositoryId = Number(env.GITHUB_REPOSITORY_ID);
  requireValue(Number.isSafeInteger(repositoryId) && repositoryId > 0, "GitHub 저장소 ID가 없습니다.");
  return { sourceSha, runId: Number(runId), artifactId: Number(artifactId), repository: env.GITHUB_REPOSITORY, repositoryId };
}

export function validateMetadata(input, run, artifact, now = Date.now()) {
  requireValue(run.id === input.runId && run.status === "completed" && run.conclusion === "success", "산출물 생산 실행이 완료·성공 상태가 아닙니다.");
  requireValue(run.path === ".github/workflows/studio-brush-filter-stability.yml" && run.event === "push" && run.head_branch === "main",
    "산출물은 main의 studio-brush-filter-stability.yml 성공 실행에서 받아야 합니다.");
  requireValue(run.repository?.id === input.repositoryId && run.head_repository?.id === input.repositoryId
    && run.repository?.full_name === input.repository && run.head_sha === input.sourceSha, "생산 실행의 저장소 또는 source SHA가 다릅니다.");
  requireValue(artifact.id === input.artifactId && artifact.name === "studio-stability-dist"
    && artifact.workflow_run?.id === input.runId && artifact.workflow_run?.head_sha === input.sourceSha
    && artifact.workflow_run?.repository_id === input.repositoryId && artifact.workflow_run?.head_repository_id === input.repositoryId,
  "산출물 ID·이름·생산 실행·저장소·SHA 연결이 일치하지 않습니다.");
  requireValue(artifact.expired === false && Date.parse(artifact.expires_at) > now, "산출물이 만료되었습니다. 새로운 성공 빌드의 ID를 지정하세요.");
  requireValue(/^sha256:[0-9a-f]{64}$/u.test(artifact.digest ?? "") && Number.isSafeInteger(artifact.size_in_bytes)
    && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 6 * 1024 ** 3, "산출물 digest 또는 6 GiB 다운로드 예산을 확인하세요.");
  return { ...input, workflow: run.path, artifactName: artifact.name, digest: artifact.digest,
    bytes: artifact.size_in_bytes, expiresAt: artifact.expires_at, runUrl: run.html_url };
}

export function validateChangedPaths(paths) {
  const allowed = new Set([workflowPath, runnerPath, "scripts/run-studio-exhaustive-followup.test.mjs",
    "scripts/run-studio-exhaustive-regressions.test.mjs", "scripts/studio-stabilization-followup-cases.mjs",
    "scripts/studio-stabilization-followup-cases.test.mjs", "config/playwright/playwright.studio-production-followup.config.ts"]);
  const rejected = paths.filter(path => !allowed.has(path));
  requireValue(rejected.length === 0, `기존 dist와 제품 입력이 다릅니다. 새 빌드가 필요합니다: ${rejected.join(", ")}`);
  return paths;
}

export function validateFreshSource(sourceSha, actualSha, eventSha, trackedStatus) {
  requireValue(/^[0-9a-f]{40}$/u.test(sourceSha ?? "") && sourceSha === actualSha && sourceSha === eventSha,
    "fresh-source는 source_sha·checkout HEAD·GITHUB_SHA가 정확히 일치해야 합니다.");
  requireValue(typeof trackedStatus === "string" && !trackedStatus, `추적된 제품 입력이 바뀌었습니다. 변경을 검토하고 새 SHA를 지정하세요: ${trackedStatus}`);
}

function verifySource(sourceSha, sourceMode = "artifact", env = process.env) {
  const runnerSha = git(["rev-parse", "HEAD"]);
  const trackedStatus = git(["status", "--porcelain", "--untracked-files=no"]);
  if (sourceMode === "fresh-source") {
    validateFreshSource(sourceSha, runnerSha, env.GITHUB_SHA, trackedStatus);
    return { runnerSha, sourceTree: git(["rev-parse", `${sourceSha}^{tree}`]), changedPaths: [] };
  }
  git(["merge-base", "--is-ancestor", sourceSha, "HEAD"]);
  // rename을 해제해야 제품 파일을 허용 경로로 옮기는 삭제도 검출한다.
  const changes = git(["diff", "--no-renames", "--name-only", "-z", sourceSha, "HEAD"]).split("\0").filter(Boolean);
  validateChangedPaths(changes);
  requireValue(!trackedStatus, "추적된 작업 파일이 바뀌었습니다. source 동일성을 먼저 복구하세요.");
  return { runnerSha, sourceTree: git(["rev-parse", `${sourceSha}^{tree}`]), changedPaths: changes };
}

async function provenance(directory, state, env) {
  if (state.sourceMode === "fresh-source") {
    requireValue(env.GITHUB_ACTIONS === "true" && env.GITHUB_EVENT_NAME === "workflow_dispatch", "fresh-source는 승인된 수동 GitHub Actions에서만 실행하세요.");
    state.provenance = { sourceMode: state.sourceMode, sourceSha: env.STUDIO_FOLLOWUP_SOURCE_SHA,
      ...verifySource(env.STUDIO_FOLLOWUP_SOURCE_SHA, state.sourceMode, env) };
    state.phase = "prepare-disk";
    save(directory, state); writeJson(join(directory, "provenance.json"), state.provenance);
    return;
  }
  const input = parseInputs(env);
  requireValue(env.GH_TOKEN, "산출물을 읽을 actions:read 토큰이 없습니다.");
  const get = async path => {
    const response = await fetch(`https://api.github.com/repos/${input.repository}/${path}`, {
      headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(Math.max(1, Math.min(30_000, state.deadlineMs - Date.now()))),
    });
    requireValue(response.ok, `GitHub 산출물 조회가 실패했습니다: HTTP ${response.status}`);
    return response.json();
  };
  const [run, artifact] = await Promise.all([get(`actions/runs/${input.runId}`), get(`actions/artifacts/${input.artifactId}`)]);
  state.provenance = { ...validateMetadata(input, run, artifact), ...verifySource(input.sourceSha) };
  state.phase = "artifact-download";
  save(directory, state);
  writeJson(join(directory, "provenance.json"), state.provenance);
  requireValue(state.deadlineMs - Date.now() > 60_000, "다운로드 전에 작업 예산이 소진됐습니다.");
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `download_minutes=${Math.min(6, Math.floor((state.deadlineMs - Date.now()) / 60_000))}\n`);
}

/** 계획 함수는 파일을 삭제하지 않는다. 실제 정리는 아래 고정 경로에만 적용한다. */
export function diskCleanupPlan(env, { platform = process.platform, realpath = realpathSync, lstat = lstatSync } = {}) {
  requireValue(env.GITHUB_ACTIONS === "true" && env.RUNNER_ENVIRONMENT === "github-hosted" && env.RUNNER_OS === "Linux"
    && env.ImageOS === "ubuntu24" && env.TOONSTUDIO_CI_RUNNER_ENVIRONMENT === "github-hosted"
    && env.TOONSTUDIO_CI_RUNNER_OS === "Linux" && platform === "linux", "SDK 정리는 GitHub-hosted Ubuntu 24.04에서만 허용합니다.");
  const workspace = env.GITHUB_WORKSPACE;
  requireValue(typeof workspace === "string" && isAbsolute(workspace) && workspace !== "/" && resolve(workspace) === workspace,
    "정규화된 절대 workspace 경로가 필요합니다.");
  for (const target of [workspace, ...SDK_PATHS]) {
    for (let component = target; component !== "/"; component = dirname(component)) {
      try { requireValue(!lstat(component).isSymbolicLink(), `심볼릭 링크 경로는 정리할 수 없습니다: ${component}`); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
    }
  }
  requireValue(realpath(workspace) === workspace, "workspace 실제 경로가 다릅니다.");
  for (const target of SDK_PATHS) requireValue(workspace !== target && !workspace.startsWith(`${target}/`) && !target.startsWith(`${workspace}/`),
    `workspace와 SDK 경로가 겹칩니다: ${target}`);
  return { workspace, targets: [...SDK_PATHS], minimumFreeBytes: 20 * 1024 ** 3 };
}

export function validateDiskSpace(bytes, minimumFreeBytes = 20 * 1024 ** 3) {
  requireValue(Number.isSafeInteger(bytes) && bytes >= minimumFreeBytes, "전체 assets와 빌드에 필요한 최소 20 GiB 여유가 없습니다.");
}

export function ensureDiskCapacity(plan, { available, cleanup, record }) {
  const receipt = { ...plan, beforeBytes: available(), afterBytes: null, cleanup: "not-started" };
  requireValue(Number.isSafeInteger(receipt.beforeBytes) && receipt.beforeBytes >= 0, "현재 디스크 여유 바이트를 확인하지 못했습니다.");
  if (receipt.beforeBytes >= plan.minimumFreeBytes) {
    receipt.afterBytes = receipt.beforeBytes;
    receipt.cleanup = "not-required";
    record(receipt);
    return receipt;
  }
  receipt.cleanup = "required";
  record(receipt);
  try { cleanup(plan.targets); }
  catch (error) {
    receipt.cleanup = "failed"; receipt.cleanupError = error.message; record(receipt); throw error;
  }
  receipt.afterBytes = available();
  receipt.cleanup = "completed";
  record(receipt);
  validateDiskSpace(receipt.afterBytes, plan.minimumFreeBytes);
  return receipt;
}

function prepareDisk(directory, state, env) {
  requireValue(state.sourceMode === "fresh-source" && state.provenance, "fresh-source 검증을 먼저 완료하세요.");
  const plan = diskCleanupPlan(env);
  const available = () => { const info = statfsSync(plan.workspace); return info.bavail * info.bsize; };
  const receipt = ensureDiskCapacity(plan, {
    available, record: value => writeJson(join(directory, "disk.json"), value),
    cleanup: targets => execFileSync("sudo", ["rm", "-rf", "--", ...targets], {
      stdio: "inherit", timeout: Math.max(1, Math.min(60_000, state.deadlineMs - Date.now())),
    }),
  });
  console.log(JSON.stringify(receipt));
  state.diskPrepared = true; save(directory, state);
}

async function freshWork(command, directory, state, env, signal) {
  requireValue(state.sourceMode === "fresh-source" && state.provenance && state.diskPrepared, "fresh-source와 SDK·디스크 검증을 먼저 완료하세요.");
  verifySource(state.provenance.sourceSha, state.sourceMode, env);
  state.phase = command.slice(2); save(directory, state);
  if (command === "--hydrate") {
    const result = await execute("git", ["sparse-checkout", "disable"], { env, signal,
      deadlineMs: Math.min(state.deadlineMs, Date.now() + 5 * 60_000) });
    requireValue(result.exitCode === 0 && !result.reason, `전체 asset 복원 실패: ${result.reason ?? result.exitCode}`);
    verifySource(state.provenance.sourceSha, state.sourceMode, env);
    state.fullCheckout = true; save(directory, state); return;
  }
  requireValue(state.fullCheckout, "production 빌드 전에 전체 assets·vrm를 복원하세요.");
  const started = Date.now();
  const result = await execute("pnpm", ["run", "build:bundle"], {
    env: { ...env, VITE_STUDIO_AUTOMERGE_OFFLINE_BRANCH: "true" }, signal, deadlineMs: state.deadlineMs,
  });
  state.buildAttempt = { command: ["pnpm", "run", "build:bundle"], env: { VITE_STUDIO_AUTOMERGE_OFFLINE_BRANCH: "true" },
    ...result, durationMs: Date.now() - started, trackedStatusAfterBuild: git(["status", "--porcelain", "--untracked-files=no"]) };
  writeJson(join(directory, "build-attempt.json"), state.buildAttempt); save(directory, state);
  verifySource(state.provenance.sourceSha, state.sourceMode, env);
  requireValue(result.exitCode === 0 && !result.reason, `production 빌드 실패: ${result.reason ?? result.exitCode}`);
}

export function validateBuild(directory, sourceSha) {
  for (const file of [".vite/build-meta.json", ".vite/manifest.json", "index.html", "sw.js"]) {
    requireValue(existsSync(join(directory, file)) && statSync(join(directory, file)).size > 0, `production dist 파일이 없습니다: ${file}`);
  }
  const meta = json(join(directory, ".vite/build-meta.json"));
  requireValue(meta.gitSha === sourceSha && /^[0-9a-f]{12,64}$/u.test(meta.buildId ?? ""), "production build-meta의 SHA 또는 buildId가 다릅니다.");
  const worker = readFileSync(join(directory, "sw.js"), "utf8");
  const workerBuildId = new RegExp("(?:\\bbuildId|[\"']buildId[\"'])\\s*:\\s*([\"'`])" + meta.buildId + "\\1(?=\\s*[,}])", "u");
  requireValue(workerBuildId.test(worker), "실제 sw.js와 build-meta의 buildId가 다릅니다.");
  const manifest = json(join(directory, ".vite/manifest.json"));
  const entry = manifest["index.html"]?.file;
  requireValue(typeof entry === "string" && entry.startsWith("assets/") && !entry.split("/").includes("..")
    && existsSync(join(directory, entry)), "production manifest의 앱 진입 파일이 없습니다.");
  return { ...meta, files: Object.fromEntries([".vite/build-meta.json", ".vite/manifest.json", "index.html", "sw.js"].map(file => [file, digest(join(directory, file))])) };
}

export function validateReport(item, report, build) {
  if (item.kind === "sw") {
    requireValue(report.ok === true && report.phase === "complete" && empty(report.failures) && empty(report.pageErrors)
      && report.workerState?.buildId === build.buildId, "SW 원래 전체 단계·page error·buildId 계약이 통과하지 않았습니다.");
  } else if (item.kind === "matrix") {
    const result = report.results?.[0];
    requireValue(report.hardFailures === 0 && report.locale === "ko-KR" && report.colorScheme === "light" && report.reducedMotion === "no-preference"
      && report.results?.length === 1 && result.scope === item.scope
      && !result.navigationError && empty(result.failures) && empty(result.pageErrors) && empty(result.consoleErrors)
      && empty(result.previewFixture?.unexpectedResponses), "정확한 browser/profile/route 한 행이 모두 통과하지 않았습니다.");
  } else if (item.kind === "native") {
    const evidence = report.scenarios?.[0]?.evidence;
    requireValue(report.ok === true && report.scenarios?.length === 1 && empty(report.violations)
      && evidence?.id === item.scenario && evidence.status === "passed" && evidence.failure == null && evidence.failurePhase == null
      && evidence.undo?.attempted === true && evidence.undo.restored === true && evidence.undo.retainedEditableRasterWhenExpected === true
      && (!item.scenario.startsWith("selection-") || (evidence.undo.selectionStateCleared === true && evidence.undo.durableSnapshotRetained === true))
      && empty(evidence.browserErrors) && empty(evidence.failedResponses), "선택한 native 시나리오의 원래 픽셀·Undo 계약이 통과하지 않았습니다.");
  } else if (item.kind === "media") {
    const entry = report.cases?.[0];
    const cleanFindings = value => Array.isArray(value) && value.every(finding => finding.level !== "error");
    requireValue(report.kind === "toonstudio-studio-brush-media-browser-quality-v2" && report.ok === true
      && report.cases?.length === 1 && entry.id === item.medium && entry.metrics?.id === item.medium
      && entry.evaluation?.ok === true && cleanFindings(entry.evaluation.findings)
      && report.suite?.ok === true && cleanFindings(report.suite.findings)
      && empty(report.executionFailures) && empty(report.unexpectedBrowserErrors)
      && ["console", "page", "responses"].every(key => empty(entry.browserErrors?.[key])),
    "선택한 매체의 원래 coverage·픽셀·Undo/Redo·누적 품질 계약이 통과하지 않았습니다.");
  } else if (item.kind === "hokusai") {
    requireValue(report.status === "ok" && report.schemaVersion === 3
      && report.execution === "vite-production-preview-shipped-studio-policy-and-explicit-inspector" && empty(report.issues)
      && JSON.stringify(report.shelf?.map(entry => entry.presetId)) === JSON.stringify(["pencil", "charcoal", "oil"])
      && report.explicitInspector?.sourceRestoredByUndo === true && report.explicitInspector.pairRestoredByRedo === true
      && report.explicitInspector.pairPreservedByReload === true
      && ["consoleErrors", "consoleWarnings", "pageErrors", "requestFailures", "fiveHundredResponses"].every(key => empty(report.diagnostics?.[key])),
    "Hokusai 원래 세 매체·실제 변환·Undo/Redo·재로드 통합 계약이 통과하지 않았습니다.");
  } else if (item.kind === "inapp") {
    const result = report.results?.[0];
    requireValue(report.kind === "toonstudio-studio-inapp-browser-v1" && report.scope === "selected" && report.ok === true
      && report.phase === "complete" && report.complete === true && report.selectionValid === true
      && report.activeCase === null && report.fatalFailure === null && empty(report.notRun)
      && report.totalEligible === 38 && report.excludedByFilter === 37 && empty(report.failures)
      && JSON.stringify(report.planned) === JSON.stringify([{ profile: item.profile, route: item.route }])
      && report.results?.length === 1 && result.profile === item.profile && result.route === item.route
      && result.ok === true && empty(result.hardFailures), "정확한 인앱 profile/route 한 행의 원래 접근성·이탈·오류 계약이 통과하지 않았습니다.");
  } else if (item.kind === "helpers") {
    validateHelperReport(report);
  } else if (!item.stabilization) throw new Error(`지원하지 않는 후속 검사 kind: ${item.kind}`);
  if (item.stabilization) validateStabilizationReport(item, report);
}

function terminate(child, signal) {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== "ESRCH") throw error; }
}

export function execute(command, args, { env, deadlineMs, logPath, signal, cwd = ROOT, output = process.stdout }) {
  return new Promise(done => {
    if (Date.now() >= deadlineMs || signal?.aborted) { done({ exitCode: 124, reason: "budget_or_cancellation_before_start" }); return; }
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    let reason = null;
    let forceKill;
    let logged = 0;
    const stop = message => {
      if (reason) return;
      reason = message;
      terminate(child, "SIGTERM");
      forceKill = setTimeout(() => terminate(child, "SIGKILL"), 1_000);
    };
    const timeout = setTimeout(() => stop("time_budget_exhausted"), Math.max(1, deadlineMs - Date.now()));
    const abort = () => stop("cancelled");
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
      logged += chunk.length;
      if (logged > 16 * 1024 * 1024) { stop("log_budget_exhausted"); return; }
      try { if (logPath) appendFileSync(logPath, chunk); output.write(chunk); }
      catch (error) { stop(`log_write_failed: ${error.message}`); }
    });
    child.on("error", error => { reason = `spawn_failed: ${error.message}`; });
    child.once("close", (code, closeSignal) => {
      // 부모만 먼저 종료해도 SIGTERM을 무시한 브라우저·손자 프로세스를 남기지 않는다.
      if (reason) terminate(child, "SIGKILL");
      clearTimeout(timeout); clearTimeout(forceKill); signal?.removeEventListener("abort", abort);
      done({ exitCode: reason ? 1 : code ?? 1, reason: reason ?? (closeSignal ? `signal: ${closeSignal}` : null) });
    });
  });
}

export async function runCases(directory, state, { env = process.env, signal, run = execute } = {}) {
  requireValue(state.provenance && state.build, "source 및 dist 검증을 먼저 완료하세요.");
  state.phase = "cases";
  for (const [index, item] of planFor(state.suite).entries()) {
    const record = state.cases[index];
    if (Date.now() >= state.deadlineMs || signal?.aborted) {
      record.reason = "budget_or_cancellation_before_start"; save(directory, state); continue;
    }
    const target = join(directory, "evidence", item.id);
    mkdirSync(target, { recursive: true });
    const runtime = stabilizationRuntime(item, target);
    Object.assign(record, { status: "running", startedAt: new Date().toISOString(), command: [item.command, ...runtime.args], env: item.env,
      ...(item.evidenceScope ? { evidenceScope: item.evidenceScope } : {}) });
    save(directory, state);
    const started = Date.now();
    const childEnv = { ...env, ...runtime.env, ...item.env, TOONSPECTRUM_VERIFY_DIR: target, TOONSPECTRUM_NATIVE_RASTER_VERIFY_DIR: target,
      TOONSPECTRUM_BRUSH_MEDIA_VERIFY_DIR: target, TOONSPECTRUM_HOKUSAI_LIVE_INTEGRATION_DIR: target, TOONSPECTRUM_INAPP_VERIFY_DIR: target };
    if (item.kind === "helpers") childEnv.PLAYWRIGHT_JSON_OUTPUT_FILE = join(target, item.report);
    for (const key of ["GH_TOKEN", "GITHUB_TOKEN", "TOONSPECTRUM_VERIFY_ORIGIN", "TOONSPECTRUM_VERIFY_BASE_URL"]) delete childEnv[key];
    if (item.stabilization) for (const key of ["PLAYWRIGHT_EXECUTABLE_PATH", "TOONSPECTRUM_BG3D_INAPP_VERIFY_ORIGIN"]) delete childEnv[key];
    const result = await run(item.command, runtime.args, { env: childEnv, signal,
      deadlineMs: Math.min(state.deadlineMs, Date.now() + item.minutes * 60_000), logPath: join(target, "process.log") });
    Object.assign(record, result, { durationMs: Date.now() - started, completedAt: new Date().toISOString() });
    try {
      requireValue(record.exitCode === 0 && !record.reason, record.reason ?? `검증 프로세스 exit ${record.exitCode}`);
      finalizeStabilizationEvidence(item, target, ROOT);
      validateReport(item, json(join(target, item.report)), state.build);
      validateStabilizationFiles(item, target, json(join(target, item.report)));
      record.reportSha256 = digest(join(target, item.report));
    } catch (error) { record.reason = error.message; record.exitCode = record.exitCode || 1; }
    record.status = record.exitCode === 0 && !record.reason ? "passed" : "failed";
    writeJson(join(target, "case-result.json"), record); save(directory, state);
  }
  state.status = state.cases.every(item => item.status === "passed") ? "passed" : "failed";
  save(directory, state);
  return state;
}

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))
    .flatMap(entry => entry.isDirectory() ? filesUnder(join(directory, entry.name)) : entry.isFile() ? [join(directory, entry.name)] : []);
}

export function publish(directory, state, { output = process.stdout, summaryPath, maxJsonBytes = MAX_JSON_BYTES } = {}) {
  for (const record of state.cases) {
    if (record.status === "running") { record.status = "failed"; record.reason = "interrupted_before_result"; }
    if (record.status === "not_run" && !record.reason) record.reason = `setup_incomplete: ${state.phase}`;
  }
  const expected = ["provenance.json", "build.json", ...(state.sourceMode === "fresh-source" ? ["disk.json", "build-attempt.json"] : []), ...planFor(state.suite).flatMap(item => {
    const record = state.cases.find(value => value.id === item.id);
    return record.status === "passed" ? [`evidence/${item.id}/${item.report}`, `evidence/${item.id}/case-result.json`] : [];
  })];
  const errors = expected.filter(file => !existsSync(join(directory, file))).map(file => `증거 누락: ${file}`);
  for (const item of planFor(state.suite)) {
    const record = state.cases.find(value => value.id === item.id);
    if (record.status !== "passed") continue;
    try {
      const path = join(directory, "evidence", item.id, item.report);
      requireValue(digest(path) === record.reportSha256, `${item.id}: 판정 뒤 원본 report가 바뀌었습니다.`);
      validateReport(item, json(path), state.build);
      validateStabilizationFiles(item, dirname(path), json(path));
    } catch (error) { errors.push(error.message); }
  }
  const documents = [];
  let bytes = 0;
  const paths = filesUnder(directory).filter(path => path.endsWith(".json") && !["summary.json", "evidence-manifest.json"].includes(relative(directory, path)));
  const manifest = paths.map(path => ({ path: relative(directory, path), bytes: statSync(path).size }));
  for (const [index, path] of paths.entries()) {
    if (bytes + manifest[index].bytes > maxJsonBytes) { errors.push(`로그 JSON 예산 초과: ${manifest[index].path}`); continue; }
    try { const raw = readFileSync(path, "utf8"); JSON.parse(raw); documents.push({ path: manifest[index].path, raw }); bytes += Buffer.byteLength(raw); }
    catch (error) { errors.push(`JSON 파손: ${manifest[index].path}: ${error.message}`); }
  }
  state.publication = { jsonBytes: bytes, maxJsonBytes, complete: errors.length === 0, errors, manifest };
  state.status = state.provenance && state.build && state.failures.length === 0 && errors.length === 0
    && state.cases.every(item => item.status === "passed") ? "passed" : "failed";
  save(directory, state); writeJson(join(directory, "evidence-manifest.json"), manifest);
  output.write(`::group::Studio selected follow-up results\n${JSON.stringify(state, null, 2)}\n::endgroup::\n`);
  for (const document of documents) output.write(`::group::${document.path}\n${document.raw}\n::endgroup::\n`);
  const scope = state.suite === "canvas-layout" ? "선택한 원래 production 시나리오 2개와 UI/CSS fixture 묶음 1개" : `선택한 원래 시나리오 ${state.cases.length}개`;
  let summary = `## Studio ${state.suite} / ${state.sourceMode}: ${state.status}\n\n${scope}만 검증합니다. 전체 exhaustive/native matrix 통과를 뜻하지 않습니다. 신규 artifact/cache 업로드 없음.\n\n`
    + `| 검사 | 상태 | 종료 코드 | ms |\n|---|---|---:|---:|\n${state.cases.map(item => `| ${item.id} | ${item.status} | ${item.exitCode ?? "—"} | ${item.durationMs ?? "—"} |`).join("\n")}\n\n`
    + `\`\`\`json\n${JSON.stringify(state, null, 2)}\n\`\`\`\n\n원본 JSON 전체 보존: ${state.publication.complete ? "성공" : "실패"}. 파일별 Actions 로그 그룹을 확인하세요.\n`;
  for (const document of documents) {
    const block = `\n### ${document.path}\n\n\`\`\`json\n${document.raw}\n\`\`\`\n`;
    if (Buffer.byteLength(summary + block) <= MAX_SUMMARY_BYTES) summary += block;
  }
  requireValue(Buffer.byteLength(summary) <= MAX_SUMMARY_BYTES, "결과 요약 표시 예산을 초과했습니다.");
  if (summaryPath) appendFileSync(summaryPath, summary);
  return state;
}

async function main() {
  const command = process.argv[2];
  requireValue(process.argv.length === 3 && ["--init", "--provenance", "--prepare-disk", "--hydrate", "--build", "--dist", "--install", "--browsers", "--run", "--publish", "--check"].includes(command),
    `node ${runnerPath} --init|--provenance|--prepare-disk|--hydrate|--build|--dist|--install|--browsers|--run|--publish|--check 로 실행하세요.`);
  const env = process.env;
  const suite = env.STUDIO_FOLLOWUP_SUITE ?? "followup";
  const sourceMode = env.STUDIO_FOLLOWUP_SOURCE_MODE || "artifact";
  if (command === "--check") { console.log(JSON.stringify({ suites: SUITES, sourceModes: SOURCE_MODES, artifactUpload: false, cacheUpload: false }, null, 2)); return; }
  const directory = resolve(env.TOONSPECTRUM_FOLLOWUP_VERIFY_DIR ?? join(ROOT, "artifacts/studio-exhaustive-followup"));
  const state = command === "--init" || !existsSync(join(directory, "summary.json"))
    ? initialize(directory, suite, Number(env.STUDIO_QA_DEADLINE_MS), sourceMode) : json(join(directory, "summary.json"));
  requireValue(state.suite === suite && state.sourceMode === sourceMode, "시작한 suite·source_mode와 현재 입력이 다릅니다.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGTERM", abort); process.once("SIGINT", abort);
  try {
    if (command === "--init") return;
    if (command === "--publish") { process.exitCode = publish(directory, state, { summaryPath: env.GITHUB_STEP_SUMMARY }).status === "passed" ? 0 : 1; return; }
    requireValue(Date.now() < state.deadlineMs, `${SOURCE_MODES[sourceMode].workMinutes}분 작업 예산이 소진됐습니다. 미실행 결과를 확인하세요.`);
    if (command === "--provenance") await provenance(directory, state, env);
    else if (command === "--prepare-disk") prepareDisk(directory, state, env);
    else if (["--hydrate", "--build"].includes(command)) await freshWork(command, directory, state, env, controller.signal);
    else if (command === "--dist") {
      requireValue(state.provenance, "먼저 생산 산출물과 source를 검증하세요.");
      if (sourceMode === "fresh-source") requireValue(state.buildAttempt?.exitCode === 0 && !state.buildAttempt.reason, "현재 source의 production 빌드가 완료되지 않았습니다.");
      requireValue(verifySource(state.provenance.sourceSha, sourceMode, env).runnerSha === state.provenance.runnerSha, "검증 도중 runner SHA가 바뀌었습니다.");
      state.build = { ...validateBuild(join(ROOT, "dist"), state.provenance.sourceSha),
        headerPolicySha256: digest(join(ROOT, "config/http-response-headers.json")) };
      writeJson(join(directory, "build.json"), state.build); save(directory, state);
    } else if (command === "--run") {
      verifySource(state.provenance?.sourceSha, sourceMode, env);
      process.exitCode = (await runCases(directory, state, { env, signal: controller.signal })).status === "passed" ? 0 : 1;
    } else {
      state.phase = command.slice(2); save(directory, state);
      const args = command === "--install" ? ["install", "--frozen-lockfile", "--prefer-offline"]
        : ["exec", "playwright", "install", "--with-deps", ...browsersFor(suite)];
      const result = await execute("pnpm", args, { env, deadlineMs: state.deadlineMs, signal: controller.signal });
      requireValue(result.exitCode === 0 && !result.reason, `검증 준비 실패: ${result.reason ?? result.exitCode}`);
    }
  } catch (error) {
    state.failures.push(`${command}: ${error.message}`); state.status = "failed"; save(directory, state); throw error;
  } finally { process.removeListener("SIGTERM", abort); process.removeListener("SIGINT", abort); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`[studio-followup] ${error.message}`); process.exitCode = 1; });
}
