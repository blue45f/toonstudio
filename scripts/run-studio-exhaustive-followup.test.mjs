import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ROOT, SOURCE_MODES, SUITES, diskCleanupPlan, execute, initialize, parseInputs, planFor, publish, runCases,
  validateBuild, validateChangedPaths, validateDiskSpace, validateFreshSource, validateMetadata, validateReport,
} from "./run-studio-exhaustive-followup.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const sha = "a".repeat(40);
const build = { gitSha: sha, buildId: "0123456789ab" };
const input = { sourceSha: sha, runId: 123, artifactId: 456, repository: "owner/project", repositoryId: 789 };
const workflow = readFileSync(join(ROOT, ".github/workflows/studio-exhaustive-regressions.yml"), "utf8");
const followupJob = workflow.split(/^ {2}followup:/mu)[1];
const capture = () => { let text = ""; return { output: { write: value => { text += String(value); } }, text: () => text }; };

function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), "studio-followup-test-"));
  const cleanup = () => rmSync(directory, { recursive: true, force: true });
  if (typeof t.after === "function") t.after(cleanup); else t.onTestFinished(cleanup);
  return directory;
}

function metadata() {
  return {
    run: { id: input.runId, status: "completed", conclusion: "success", event: "push", head_branch: "main",
      path: ".github/workflows/studio-brush-filter-stability.yml", repository: { id: input.repositoryId, full_name: input.repository },
      head_repository: { id: input.repositoryId }, head_sha: sha, html_url: "https://github.com/owner/project/actions/runs/123" },
    artifact: { id: input.artifactId, name: "studio-stability-dist", expired: false,
      expires_at: "2099-01-01T00:00:00Z", digest: `sha256:${"b".repeat(64)}`, size_in_bytes: 4567032214,
      workflow_run: { id: input.runId, head_sha: sha, repository_id: input.repositoryId, head_repository_id: input.repositoryId } },
  };
}

function reportFor(item) {
  if (item.kind === "sw") return { ok: true, phase: "complete", failures: [], pageErrors: [], workerState: { buildId: build.buildId } };
  if (item.kind === "matrix") return { hardFailures: 0, locale: "ko-KR", colorScheme: "light", reducedMotion: "no-preference",
    results: [{ scope: item.scope, failures: [], pageErrors: [], consoleErrors: [], previewFixture: { unexpectedResponses: [] } }] };
  return { ok: true, violations: [], scenarios: [{ evidence: { id: item.scenario, status: "passed",
    undo: { attempted: true, restored: true, retainedEditableRasterWhenExpected: true,
      selectionStateCleared: item.scenario.startsWith("selection-") ? true : null,
      durableSnapshotRetained: item.scenario.startsWith("selection-") ? true : null }, browserErrors: [], failedResponses: [] } }] };
}

function readyState(t, suite = "followup", deadline = Date.now() + 10_000) {
  const directory = temporary(t);
  const state = initialize(directory, suite, deadline);
  state.provenance = { ...input, runnerSha: "c".repeat(40) };
  state.build = build;
  for (const [file, value] of [["provenance.json", state.provenance], ["build.json", build]]) writeFileSync(join(directory, file), JSON.stringify(value));
  return { directory, state };
}

test("기본11gate와 상호 배타적인 수동20·40분 job만 사용하고 새 저장 비용은 만들지 않는다", () => {
  assert.equal([...workflow.matchAll(/^ {4}runs-on: /gmu)].length, 2);
  assert.match(workflow, /default: regressions/u);
  assert.match(followupJob, /if: github\.event_name == 'workflow_dispatch' && \(inputs\.suite == 'followup' \|\| inputs\.suite == 'native-representatives'\)/u);
  assert.match(followupJob, /runs-on: ubuntu-24\.04\n {4}timeout-minutes: \$\{\{ inputs\.source_mode == 'fresh-source' && 40 \|\| 20 \}\}/u);
  assert.match(followupJob, /STUDIO_FOLLOWUP_SOURCE_MODE === 'fresh-source' \? 39 : 19/u);
  assert.match(followupJob, /Date\.now\(\) \+ minutes \* 60_000/u);
  assert.deepEqual(SOURCE_MODES, { artifact: { jobMinutes: 20, workMinutes: 19 }, "fresh-source": { jobMinutes: 40, workMinutes: 39 } });
  assert.match(workflow, /source_mode:[\s\S]*default: artifact/u);
  assert.match(followupJob, /permissions:\n {6}contents: read\n {6}actions: read/u);
  assert.match(followupJob, /actions\/download-artifact@v8/u);
  assert.match(followupJob, /artifact-ids: \$\{\{ inputs\.artifact_id \}\}/u);
  assert.match(followupJob, /run-id: \$\{\{ inputs\.producer_run_id \}\}/u);
  assert.match(followupJob, /digest-mismatch: error/u);
  assert.match(followupJob, /timeout-minutes: \$\{\{ fromJSON\(steps\.provenance\.outputs\.download_minutes \|\| '6'\) \}\}/u);
  assert.match(followupJob, /if: inputs\.source_mode != 'fresh-source'\n {8}uses: actions\/download-artifact/u);
  for (const command of ["prepare-disk", "hydrate", "build"]) assert.match(followupJob,
    new RegExp(`if: inputs\\.source_mode == 'fresh-source'\\n(?: {8}env:[\\s\\S]*?)? {8}run: node scripts/run-studio-exhaustive-followup\\.mjs --${command}`, "u"));
  assert.match(followupJob, /if: always\(\)[\s\S]*run-studio-exhaustive-followup\.mjs --publish/u);
  assert.doesNotMatch(workflow, /continue-on-error|actions\/(?:upload-artifact|cache)|cache:|matrix:|pnpm (?:run )?build\b/u);
  assert.doesNotMatch(workflow, /^ {2}(?:push|schedule|workflow_run|merge_group):/mu);
  assert.ok(followupJob.indexOf("--init") < followupJob.indexOf("--provenance"));
  assert.ok(followupJob.indexOf("--provenance") < followupJob.indexOf("download-artifact@"));
  assert.ok(followupJob.indexOf("--dist") < followupJob.indexOf("--install"));
  assert.ok(followupJob.indexOf("--prepare-disk") < followupJob.indexOf("--hydrate"));
  assert.ok(followupJob.indexOf("--hydrate") < followupJob.indexOf("--install"));
  assert.ok(followupJob.indexOf("--install") < followupJob.indexOf("--build"));
  assert.ok(followupJob.indexOf("--build") < followupJob.lastIndexOf("--dist"));
  assert.doesNotMatch(followupJob, /43971954502|14279822839|a2cf3525/u);
});

test("고정된 원래4case와 별도native3case만 선택하며 임의 명령·전체matrix를 받지 않는다", () => {
  assert.deepEqual(Object.keys(SUITES), ["followup", "native-representatives"]);
  assert.deepEqual(planFor("followup").map(item => item.id), ["service-worker", "webkit-kakaotalk-android-360-animation", "chromium-tablet-768-animation", "native-paint-bucket"]);
  assert.deepEqual(planFor("native-representatives").map(item => item.scenario), ["paint-bucket", "selection-rect", "filter-inside"]);
  assert.deepEqual(SUITES.followup[0].args, ["exec", "tsx", "scripts/verify-studio-service-worker.mts"]);
  assert.throws(() => planFor("")); assert.throws(() => planFor("all")); assert.throws(() => planFor("toString"));
  for (const item of Object.values(SUITES).flat()) {
    assert.doesNotMatch(JSON.stringify(item), /--deep|--skip|reducedMotion|force|timeout=/u);
  }
});

test("산출물 입력의 SHA·ID와 fork·실패run·잘못된workflow·만료·digest 연결을 거부한다", () => {
  const env = { STUDIO_FOLLOWUP_SOURCE_SHA: sha, STUDIO_FOLLOWUP_RUN_ID: "123", STUDIO_FOLLOWUP_ARTIFACT_ID: "456", GITHUB_REPOSITORY: input.repository, GITHUB_REPOSITORY_ID: "789" };
  assert.deepEqual(parseInputs(env), input);
  for (const bad of ["", "-1", "1;echo unsafe", "9".repeat(30)]) assert.throws(() => parseInputs({ ...env, STUDIO_FOLLOWUP_ARTIFACT_ID: bad }));
  assert.throws(() => parseInputs({ ...env, STUDIO_FOLLOWUP_SOURCE_SHA: "main" }));
  const good = metadata();
  assert.equal(validateMetadata(input, good.run, good.artifact).digest, good.artifact.digest);
  for (const change of [
    value => { value.run.conclusion = "failure"; }, value => { value.run.status = "in_progress"; },
    value => { value.run.path = ".github/workflows/ci.yml"; }, value => { value.run.event = "pull_request"; },
    value => { value.run.head_repository.id = 1; }, value => { value.run.head_sha = "d".repeat(40); },
    value => { value.artifact.workflow_run.id += 1; }, value => { value.artifact.workflow_run.head_repository_id = 1; },
    value => { value.artifact.name = "core-build-attempt-1"; }, value => { value.artifact.id += 1; },
    value => { value.artifact.digest = null; }, value => { value.artifact.expired = true; },
    value => { value.artifact.expires_at = "2000-01-01T00:00:00Z"; }, value => { value.artifact.size_in_bytes = 7 * 1024 ** 3; },
  ]) { const value = metadata(); change(value); assert.throws(() => validateMetadata(input, value.run, value.artifact)); }
});

test("앱·verifier·lockfile·빌드설정이 달라지면 기존dist 재사용을 거부한다", () => {
  assert.deepEqual(validateChangedPaths([]), []);
  validateChangedPaths(["scripts/run-studio-exhaustive-followup.mjs", ".github/workflows/studio-exhaustive-regressions.yml"]);
  for (const path of ["apps/web/src/app/main.tsx", "apps/web/vite.config.ts", "pnpm-lock.yaml", ".env.production",
    "config/http-response-headers.json", "scripts/verify-studio-service-worker.mts", "docs/changed-build-input.md"]) {
    assert.throws(() => validateChangedPaths([path]), /새 빌드/u);
  }
});

test("fresh-source는 입력·checkout·event의 정확한 SHA와 빌드 전후 깨끗한 추적 파일을 요구한다", t => {
  validateFreshSource(sha, sha, sha, "");
  for (const values of [["main", sha, sha, ""], [sha, "b".repeat(40), sha, ""], [sha, sha, "b".repeat(40), ""],
    [sha, sha, undefined, ""], [sha, sha, sha, " M apps/web/src/catalog.generated.ts"], [sha, sha, sha, undefined]]) {
    assert.throws(() => validateFreshSource(...values));
  }
  const directory = temporary(t);
  assert.equal(initialize(directory, "followup", Date.now() + 39 * 60_000, "fresh-source").sourceMode, "fresh-source");
  assert.throws(() => initialize(directory, "followup", Date.now() + 1000, "arbitrary-mode"));
});

test("SDK 계획은 hosted Ubuntu24의 고정 두 경로만 허용하고 실제 삭제를 하지 않는다", () => {
  const env = { GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted", RUNNER_OS: "Linux", ImageOS: "ubuntu24",
    TOONSTUDIO_CI_RUNNER_ENVIRONMENT: "github-hosted", TOONSTUDIO_CI_RUNNER_OS: "Linux", GITHUB_WORKSPACE: "/home/runner/work/project/project" };
  const visited = [];
  const inspect = { platform: "linux", realpath: path => path, lstat: path => { visited.push(path); return { isSymbolicLink: () => false }; } };
  assert.deepEqual(diskCleanupPlan(env, inspect), { workspace: env.GITHUB_WORKSPACE,
    targets: ["/usr/local/lib/android/sdk", "/usr/share/dotnet/sdk"], minimumFreeBytes: 20 * 1024 ** 3 });
  for (const path of ["/home", "/home/runner/work", "/usr", "/usr/local/lib/android", "/usr/share/dotnet"]) assert.ok(visited.includes(path));
  for (const key of ["GITHUB_ACTIONS", "RUNNER_ENVIRONMENT", "RUNNER_OS", "ImageOS", "TOONSTUDIO_CI_RUNNER_ENVIRONMENT", "TOONSTUDIO_CI_RUNNER_OS"]) {
    assert.throws(() => diskCleanupPlan({ ...env, [key]: "unexpected" }, inspect));
  }
  assert.throws(() => diskCleanupPlan(env, { ...inspect, platform: "darwin" }));
  assert.throws(() => diskCleanupPlan(env, { ...inspect, realpath: () => "/different/workspace" }));
  for (const workspace of ["", "/", "relative", "/home/runner/../other", "/usr", "/usr/share/dotnet/sdk", "/usr/local/lib/android/sdk/nested"]) {
    assert.throws(() => diskCleanupPlan({ ...env, GITHUB_WORKSPACE: workspace }, inspect));
  }
  for (const linked of ["/home", env.GITHUB_WORKSPACE, "/usr/local", "/usr/share/dotnet/sdk"]) {
    assert.throws(() => diskCleanupPlan(env, { ...inspect, lstat: path => ({ isSymbolicLink: () => path === linked }) }));
  }
  validateDiskSpace(20 * 1024 ** 3);
  for (const bytes of [20 * 1024 ** 3 - 1, -1, NaN, Infinity, "21474836480"]) assert.throws(() => validateDiskSpace(bytes));
});

test("실제build-meta·manifest·SW 일치와 진입파일 존재를 요구한다", t => {
  const directory = temporary(t);
  mkdirSync(join(directory, ".vite")); mkdirSync(join(directory, "assets"));
  writeFileSync(join(directory, ".vite/build-meta.json"), JSON.stringify(build));
  writeFileSync(join(directory, ".vite/manifest.json"), JSON.stringify({ "index.html": { file: "assets/app.js" } }));
  writeFileSync(join(directory, "index.html"), "<html></html>"); writeFileSync(join(directory, "assets/app.js"), "export {};");
  writeFileSync(join(directory, "sw.js"), `const manifest={buildId:"${build.buildId}"};`);
  assert.equal(validateBuild(directory, sha).buildId, build.buildId);
  writeFileSync(join(directory, "sw.js"), `const manifest={"buildId":"${build.buildId}"};`);
  assert.equal(validateBuild(directory, sha).buildId, build.buildId);
  assert.throws(() => validateBuild(directory, "d".repeat(40)));
  writeFileSync(join(directory, "sw.js"), 'const manifest={buildId:"ffffffffffff"};');
  assert.throws(() => validateBuild(directory, sha), /sw.js/u);
  rmSync(join(directory, "sw.js")); assert.throws(() => validateBuild(directory, sha), /파일/u);
});

test("exit0이어도 빈·다른scope·pageerror·SW미완료·native실패 report는 통과하지 않는다", () => {
  for (const item of SUITES.followup) {
    validateReport(item, reportFor(item), build);
    assert.throws(() => validateReport(item, {}, build));
  }
  for (const item of SUITES.followup.filter(value => value.kind === "matrix")) {
    for (const mutate of [report => { report.results = []; }, report => { report.results.push(report.results[0]); },
      report => { report.results[0].scope = "chromium/desktop/home"; }, report => { report.results[0].pageErrors.push("ResizeObserver loop"); },
      report => { report.results[0].navigationError = "body hidden after 20000ms"; }, report => { delete report.results[0].previewFixture; },
      report => { report.reducedMotion = "reduce"; }, report => { report.locale = "en-US"; }, report => { report.colorScheme = "dark"; }]) {
      const report = reportFor(item); mutate(report); assert.throws(() => validateReport(item, report, build));
    }
  }
  const sw = reportFor(SUITES.followup[0]); sw.workerState.buildId = "other";
  assert.throws(() => validateReport(SUITES.followup[0], sw, build));
  const raster = reportFor(SUITES.followup[3]); raster.scenarios[0].evidence.status = "failed";
  assert.throws(() => validateReport(SUITES.followup[3], raster, build));
  for (const item of SUITES["native-representatives"]) {
    validateReport(item, reportFor(item), build);
    for (const mutate of [
      evidence => { delete evidence.undo; }, evidence => { evidence.undo.attempted = false; },
      evidence => { evidence.undo.restored = false; }, evidence => { evidence.undo.retainedEditableRasterWhenExpected = false; },
      evidence => { evidence.failurePhase = "setup"; }, evidence => { evidence.failure = "operation failed"; },
      evidence => { evidence.browserErrors.push("page error"); }, evidence => { evidence.failedResponses.push("HTTP 500"); },
    ]) {
      const report = reportFor(item); mutate(report.scenarios[0].evidence);
      assert.throws(() => validateReport(item, report, build));
    }
    if (item.scenario.startsWith("selection-")) {
      for (const key of ["selectionStateCleared", "durableSnapshotRetained"]) {
        const report = reportFor(item); report.scenarios[0].evidence.undo[key] = false;
        assert.throws(() => validateReport(item, report, build));
      }
    }
  }
});

test("한case 실패와 누락report를 남기고 후속case는 계속 실행한다", async t => {
  const { directory, state } = readyState(t);
  let count = 0;
  await runCases(directory, state, { env: { GH_TOKEN: "test-fixture-token", TOONSPECTRUM_VERIFY_ORIGIN: "https://example.invalid", TOONSPECTRUM_VERIFY_REDUCED_MOTION: "reduce" },
    run: async (_command, _args, options) => {
      const item = SUITES.followup[count++];
      assert.equal(options.env.GH_TOKEN, undefined); assert.equal(options.env.TOONSPECTRUM_VERIFY_ORIGIN, undefined);
      if (item.kind === "matrix") assert.equal(options.env.TOONSPECTRUM_VERIFY_REDUCED_MOTION, "no-preference");
      if (count !== 2) writeFileSync(join(options.env.TOONSPECTRUM_VERIFY_DIR, item.report), JSON.stringify(reportFor(item)));
      return { exitCode: 0, reason: null };
    } });
  assert.equal(count, 4); assert.equal(state.status, "failed");
  assert.deepEqual(state.cases.map(item => item.status), ["passed", "failed", "passed", "passed"]);
  const captured = capture();
  assert.equal(publish(directory, state, { output: captured.output }).status, "failed");
  assert.match(captured.text(), /ENOENT/u);
});

test("예산이 소진되면 어떤case도 실행하지 않고 not_run을 보존한다", async t => {
  const { directory, state } = readyState(t, "followup", Date.now() - 1);
  let calls = 0;
  await runCases(directory, state, { run: async () => { calls += 1; } });
  assert.equal(calls, 0); assert.ok(state.cases.every(item => item.status === "not_run"));
  assert.equal(publish(directory, state, { output: capture().output }).status, "failed");
});

test("setup 실패·게시 전 원본누락·JSON예산 초과를 성공으로 숨기지 않는다", async t => {
  const { directory, state } = readyState(t);
  let index = 0;
  await runCases(directory, state, { run: async (_command, _args, options) => {
    const item = SUITES.followup[index++];
    writeFileSync(join(options.env.TOONSPECTRUM_VERIFY_DIR, item.report), JSON.stringify(reportFor(item)));
    return { exitCode: 0, reason: null };
  } });
  assert.equal(publish(directory, state, { output: capture().output }).status, "passed");
  assert.equal(publish(directory, state, { output: capture().output, maxJsonBytes: 10 }).status, "failed");
  const reportPath = join(directory, "evidence", SUITES.followup[0].id, SUITES.followup[0].report);
  const original = readFileSync(reportPath, "utf8");
  writeFileSync(reportPath, `${original}\n`);
  assert.equal(publish(directory, state, { output: capture().output }).status, "failed");
  writeFileSync(reportPath, original);
  rmSync(join(directory, "evidence", SUITES.followup[0].id, SUITES.followup[0].report));
  assert.equal(publish(directory, state, { output: capture().output }).status, "failed");
  const setup = initialize(temporary(t), "followup", Date.now() + 10_000);
  assert.equal(publish(temporary(t), setup, { output: capture().output }).status, "failed");
});

test("실제자식 프로세스의 시간초과와 취소를 실패로 회수한다", async () => {
  const args = ["-e", "setInterval(() => {}, 1000)"];
  const timed = await execute(process.execPath, args, { env: process.env, deadlineMs: Date.now() + 40, output: capture().output });
  assert.equal(timed.reason, "time_budget_exhausted"); assert.notEqual(timed.exitCode, 0);
  const controller = new AbortController(); controller.abort();
  const cancelled = await execute(process.execPath, args, { env: process.env, deadlineMs: Date.now() + 1000, signal: controller.signal });
  assert.equal(cancelled.reason, "budget_or_cancellation_before_start");
});

test("부모가 먼저 종료해도 SIGTERM을 무시하는 손자 프로세스를 종료한다", async t => {
  const directory = temporary(t);
  const pidPath = join(directory, "descendant.pid");
  const descendant = `process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(process.argv[1], String(process.pid)); setInterval(() => {}, 1000);`;
  const parent = `require('node:child_process').spawn(process.execPath, ['-e', process.argv[1], process.argv[2]], {stdio:'ignore'}); process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 1000);`;
  const result = await execute(process.execPath, ["-e", parent, descendant, pidPath], {
    env: process.env, deadlineMs: Date.now() + 1000, output: capture().output,
  });
  assert.equal(result.reason, "time_budget_exhausted");
  const pid = Number(readFileSync(pidPath, "utf8"));
  const isRunning = () => {
    try {
      process.kill(pid, 0);
      return process.platform !== "linux" || !/\) Z /u.test(readFileSync(`/proc/${pid}/stat`, "utf8"));
    } catch (error) { if (["ESRCH", "ENOENT"].includes(error.code)) return false; throw error; }
  };
  for (let attempt = 0; attempt < 20 && isRunning(); attempt += 1) await new Promise(done => setTimeout(done, 10));
  assert.equal(isRunning(), false);
});
