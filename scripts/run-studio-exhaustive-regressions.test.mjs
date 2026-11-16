import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  EXPECTED_HELPER_TESTS, REGRESSION_GATES, REPOSITORY_ROOT, SOURCE_GATE_IDS,
  initializeRun, publishRun, runRegressionPlan, validateHelperReport, validateLivingInkReport,
} from "./run-studio-exhaustive-regressions.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const workflow = readFileSync(join(REPOSITORY_ROOT, ".github/workflows/studio-exhaustive-regressions.yml"), "utf8");
const paths = [...workflow.matchAll(/^ {6}- (.+)$/gmu)].map(match => match[1]);
const covers = file => paths.some(pattern => new RegExp(`^${pattern.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("[^/]*")}$`, "u").test(file));

function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), "studio-regressions-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function capture() {
  let text = "";
  return { output: { write: chunk => { text += String(chunk); } }, text: () => text };
}

function helperReport(count = EXPECTED_HELPER_TESTS) {
  return {
    errors: [], stats: { expected: count, unexpected: 0, flaky: 0, skipped: 0 },
    suites: [{ suites: [{ specs: Array.from({ length: count }, () => ({ tests: [{
      expectedStatus: "passed", status: "expected", results: [{ status: "passed" }],
    }] })) }] }],
  };
}

function livingInkReport() {
  return {
    status: "ok", failures: [],
    backends: Object.fromEntries(["webgl2", "webgpu"].map(id => [id, {
      id, status: "ok", reason: null, failures: [],
      backend: `real-chromium-dedicated-worker-offscreen-${id}-half-float-v1`,
    }])),
    webgpuVisualParity: {
      status: "reached", unresolvedGates: [], regressedGates: [], repairedGates: [], recordedGap: [],
    },
  };
}

test("원래 source harness 8개와 presentation/LivingInk, DOM 19개를 정확히 실행한다", () => {
  assert.deepEqual(SOURCE_GATE_IDS, [
    "gpu-committed-parity", "engine-webgpu-filter-parity", "canvaskit-quality-worker",
    "dynamic-dual-tip-webgpu", "dynamic-dual-tip-webgpu-v2", "engine-webgpu-textured-brush",
    "engine-webgpu-tile-provider", "engine-tile-storage-opfs-v2",
  ]);
  assert.equal(EXPECTED_HELPER_TESTS, 19);
  assert.equal(REGRESSION_GATES.length, 11);
  assert.equal(new Set(REGRESSION_GATES.map(gate => gate.id)).size, 11);
  assert.deepEqual(REGRESSION_GATES.slice(-2).map(gate => gate.id), ["engine-webgpu-presentation", "living-ink-execution"]);
  const packageScripts = JSON.parse(readFileSync(join(REPOSITORY_ROOT, "package.json"), "utf8")).scripts;
  for (const gate of REGRESSION_GATES.slice(1)) {
    assert.deepEqual(gate.args, ["run", `verify:studio-${gate.id}`]);
    assert.equal(packageScripts[gate.args[1]], `${gate.script.endsWith(".mts") ? "tsx" : "node"} ${gate.script}`);
    assert.ok(existsSync(join(REPOSITORY_ROOT, gate.script)), gate.script);
    assert.ok(existsSync(join(REPOSITORY_ROOT, gate.browserEntry)), gate.browserEntry);
    assert.ok(covers(gate.script), `${gate.script}: PR 변경 감지 누락`);
    assert.ok(covers(gate.browserEntry), `${gate.browserEntry}: PR 변경 감지 누락`);
  }
  assert.deepEqual(REGRESSION_GATES[0].args, ["exec", "playwright", "test", "--config", "playwright.studio-qa-helpers.config.ts", "--reporter=list,json"]);
});

test("helper의 실제 두 파일/표시 selector/실패 계약을 유지하고 skip·force로 축소하지 않는다", () => {
  const config = readFileSync(join(REPOSITORY_ROOT, "playwright.studio-qa-helpers.config.ts"), "utf8");
  assert.match(config, /testMatch: \["studio-qa-interactions\.spec\.mts", "studio-qa-shell-interactions\.spec\.mts"\]/u);
  assert.match(config, /workers: 1/u);
  assert.match(config, /retries: 0/u);
  assert.match(config, /forbidOnly: Boolean\(process\.env\.CI\)/u);
  assert.doesNotMatch(config, /webServer|grep|testIgnore/u);
  const brush = readFileSync(join(REPOSITORY_ROOT, "e2e/studio-qa-interactions.spec.mts"), "utf8");
  const shell = readFileSync(join(REPOSITORY_ROOT, "e2e/studio-qa-shell-interactions.spec.mts"), "utf8");
  assert.match(brush, /\["direct", "dock", "mobile"\]/u);
  assert.match(brush, /setStudioPrimaryColorThroughUi\(page, "#A1B2C3"\)/u);
  assert.match(brush, /clickStudioToolThroughUi\(page, "select"\)\)\.rejects\.toThrow/u);
  assert.match(shell, /openStudioMainMenu\(page, "view"\)/u);
  assert.match(shell, /toHaveAttribute\("data-selection", "active"\)/u);
  assert.match(shell, /expect\(failures\)\.toHaveLength\(2\)/u);
  assert.doesNotMatch(`${brush}\n${shell}`, /test\.(?:skip|fixme|only)|force:\s*true/u);
});

test("UI report는 누락·추가·skip·retry·expected failure를 성공으로 승인하지 않는다", () => {
  assert.equal(validateHelperReport(helperReport()), 19);
  for (const count of [0, 18, 20]) assert.throws(() => validateHelperReport(helperReport(count)));
  for (const [key, value] of [["unexpected", 1], ["flaky", 1], ["skipped", 1], ["expected", 18]]) {
    const report = helperReport();
    report.stats[key] = value;
    assert.throws(() => validateHelperReport(report), key);
  }
  for (const mutate of [
    report => { report.errors = [{ message: "setup failed" }]; },
    report => { report.suites[0].suites[0].specs[0].tests[0].expectedStatus = "failed"; },
    report => { report.suites[0].suites[0].specs[0].tests[0].results.push({ status: "passed" }); },
    report => { report.suites[0].suites[0].specs[0].tests[0].results[0].status = "skipped"; },
  ]) {
    const report = helperReport(); mutate(report);
    assert.throws(() => validateHelperReport(report));
  }
});

test("LivingInk는 양 backend의 실제 완료·동일 backend·빈 parity gap 증거를 요구한다", () => {
  assert.deepEqual(validateLivingInkReport(livingInkReport()), ["webgl2", "webgpu"]);
  for (const report of [undefined, null, {}]) assert.throws(() => validateLivingInkReport(report));
  const mutations = [
    report => { report.status = "failed"; },
    report => { report.failures.push("quality failure"); },
    report => { delete report.failures; },
    report => { delete report.backends.webgl2; },
    report => { report.webgpuVisualParity.status = "unavailable"; },
    report => { delete report.webgpuVisualParity; },
  ];
  for (const id of ["webgl2", "webgpu"]) {
    mutations.push(
      report => { report.backends[id].status = "unavailable"; },
      report => { report.backends[id].backend = "canvas2d-fallback"; },
      report => { report.backends[id].id = "other-backend"; },
      report => { report.backends[id].failures.push("quality failure"); },
      report => { delete report.backends[id].failures; },
    );
  }
  for (const key of ["unresolvedGates", "regressedGates", "repairedGates", "recordedGap"]) {
    mutations.push(report => { report.webgpuVisualParity[key].push("unreviewed gap"); });
    mutations.push(report => { delete report.webgpuVisualParity[key]; });
  }
  for (const mutate of mutations) {
    const report = livingInkReport(); mutate(report);
    assert.throws(() => validateLivingInkReport(report), /LivingInk 두 백엔드/u);
  }
});

test("LivingInk exit 0도 실제 WebGL2 미실행·누락·파손된 summary이면 실패로 보존한다", async t => {
  const directory = temporary(t);
  const probe = join(directory, "living-ink-probe.mjs");
  writeFileSync(probe, `import { writeFileSync } from 'node:fs'; import { join } from 'node:path';
    if (process.argv[2] !== 'missing') writeFileSync(join(process.env.TOONSPECTRUM_LIVING_INK_VERIFY_DIR, 'summary.json'), process.argv[2]);`);
  const unavailable = livingInkReport();
  Object.assign(unavailable.backends.webgl2, {
    status: "unavailable", backend: null, reason: "Chromium could not launch for lane webgl2", failures: [],
  });
  for (const [index, summary] of [JSON.stringify(livingInkReport()), JSON.stringify(unavailable), "missing", "{broken"].entries()) {
    const runDirectory = join(directory, String(index));
    const gates = [{ id: "living-ink-execution", kind: "runtime", executable: process.execPath, args: [probe, summary] }];
    const state = await runRegressionPlan({ directory: runDirectory, gates, deadlineMs: Date.now() + 10_000, output: capture().output });
    const record = state.gates[0];
    if (index === 0) {
      assert.equal(state.status, "passed");
      assert.deepEqual(record.executedBackends, ["webgl2", "webgpu"]);
    } else {
      assert.equal(state.status, "failed");
      assert.equal(record.status, "failed");
      assert.equal(record.exitCode, 1);
      assert.match(record.reason, /living_ink_report_failed:/u);
      assert.equal(publishRun({ directory: runDirectory, output: capture().output }).status, "failed");
      if (index === 1) assert.match(record.reason, /Chromium could not launch for lane webgl2/u);
    }
  }
});

test("단일 표준 Linux 15분 job이고 PR/수동 외 trigger·빌드·저장 비용을 추가하지 않는다", () => {
  assert.match(workflow, /pull_request:\n {4}types: \[opened, reopened, synchronize, ready_for_review\]\n {4}branches: \[main\]/u);
  assert.match(workflow, /^ {2}workflow_dispatch:/mu);
  assert.doesNotMatch(workflow, /^ {2}(?:push|schedule|workflow_run|merge_group):/mu);
  assert.equal([...workflow.matchAll(/^ {4}runs-on: /gmu)].length, 1);
  assert.match(workflow, /runs-on: ubuntu-24\.04\n {4}timeout-minutes: 15/u);
  assert.match(workflow, /group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/u);
  assert.match(workflow, /cancel-in-progress: true/u);
  assert.match(workflow, /permissions:\n {2}contents: read/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.doesNotMatch(workflow, /continue-on-error|actions\/(?:upload-artifact|cache)|cache:|pnpm (?:run )?(?:build|test)\b|matrix:/u);
  assert.match(workflow, /pnpm exec playwright install --with-deps chromium\n/u);
  assert.doesNotMatch(workflow, /playwright install[^\n]*(?:firefox|webkit)/u);
  assert.match(workflow, /Date\.now\(\) \+ 14 \* 60_000/u);
  assert.match(workflow, /if: always\(\)\n {8}run: node scripts\/run-studio-exhaustive-regressions\.mjs --publish/u);
  assert.ok(workflow.indexOf("node --test") < workflow.indexOf("pnpm install"));
  assert.ok(covers(".github/workflows/studio-exhaustive-regressions.yml"));
  for (const relevant of [
    "scripts/lib/studio-shell-interactions.ts", "scripts/lib/studio-primary-color-interactions.ts",
    "scripts/lib/studio-bg3d-ui-interactions.ts", "scripts/verify-studio-lifecycle.mts",
    "scripts/verify-studio-service-worker.mts", "scripts/qa/verify-studio-cross-browser-matrix.mjs",
    "apps/web/src/domains/creator/studio-living-ink-wgsl-shaders.ts",
    "apps/web/src/domains/creator/render/studio-engine-webgpu-presentation-surface.ts",
  ]) assert.ok(covers(relevant), relevant);
  for (const unrelated of ["README.md", "apps/api/src/main.ts", "scripts/verify-studio-marketplace.mts", ".github/workflows/ci.yml"]) {
    assert.equal(covers(unrelated), false, unrelated);
  }
});

test("기존 required core와 nightly exhaustive의 실행 범위를 바꾸지 않는다", () => {
  const core = readFileSync(join(REPOSITORY_ROOT, ".github/workflows/ci.yml"), "utf8");
  assert.match(core, /needs: \[lint, typecheck, static, serial, a11y, build, database\]/u);
  const nightly = readFileSync(join(REPOSITORY_ROOT, ".github/workflows/main-full-qa-studio.yml"), "utf8");
  assert.doesNotMatch(nightly, /^ {2}(?:pull_request|push|workflow_run):/mu);
  assert.match(nightly, /cancel-in-progress: false/u);
});

test("job env에 runner context를 쓰지 않고 실제 초기화 단계가 RUNNER_TEMP를 후속 단계에 전달한다", t => {
  // GitHub의 jobs.<job_id>.env context에는 runner/steps/job/env가 허용되지 않는다.
  const jobEnv = workflow.match(/^ {4}env:\n((?: {6}[^\n]*\n)+)/mu)?.[1];
  assert.ok(jobEnv, "검토 대상 job env 블록이 없습니다.");
  assert.doesNotMatch(jobEnv, /\$\{\{\s*(?:runner|steps|job|env)\b/u);
  assert.doesNotMatch(jobEnv, /TOONSPECTRUM_FOCUSED_VERIFY_DIR/u);
  const initialization = workflow.match(/name: Reserve the final minute for failure evidence\n {8}run: \|\n([\s\S]*?)(?=\n {6}- uses:)/u)?.[1];
  assert.ok(initialization, "실제 workflow의 runner 초기화 단계를 찾지 못했습니다.");
  const directory = temporary(t);
  const environmentFile = join(directory, "github-env");
  const runnerTemp = join(directory, "runner temp");
  writeFileSync(environmentFile, "EXISTING_VALUE=preserved\n");
  const before = Date.now();
  const result = spawnSync("bash", ["-e", "-o", "pipefail", "-c", initialization.replace(/^ {10}/gmu, "")], {
    cwd: directory, encoding: "utf8",
    env: { ...process.env, RUNNER_TEMP: runnerTemp, GITHUB_ENV: environmentFile },
    timeout: 5_000,
  });
  const after = Date.now();
  assert.equal(result.status, 0, result.stderr);
  const values = Object.fromEntries(readFileSync(environmentFile, "utf8").trimEnd().split("\n").map(line => {
    const equals = line.indexOf("=");
    return [line.slice(0, equals), line.slice(equals + 1)];
  }));
  assert.equal(values.EXISTING_VALUE, "preserved");
  assert.equal(values.TOONSPECTRUM_FOCUSED_VERIFY_DIR, join(runnerTemp, "studio-exhaustive-regressions"));
  const deadline = Number(values.STUDIO_QA_DEADLINE_MS);
  assert.ok(deadline >= before + 14 * 60_000 && deadline <= after + 14 * 60_000);
});

test("실제 exit 2 이후에도 다음 독립 명령을 실행하고 JSON/원본 로그/최종 실패를 보존한다", async t => {
  const directory = temporary(t);
  const probe = join(directory, "probe.mjs");
  writeFileSync(probe, `import { writeFileSync } from 'node:fs'; import { join } from 'node:path';
    writeFileSync(join(process.env.TOONSPECTRUM_VERIFY_DIR, 'probe.json'), JSON.stringify({ id: process.argv[2], value: 'complete-result' }));
    console.log(process.argv[2]); process.exit(Number(process.argv[3]));`);
  const gates = [2, 0].map((exit, index) => ({ id: `case-${index}`, kind: "runtime", executable: process.execPath, args: [probe, `case-${index}`, String(exit)] }));
  const captured = capture();
  const state = await runRegressionPlan({ directory, gates, deadlineMs: Date.now() + 10_000, cwd: directory, output: captured.output });
  assert.equal(state.status, "failed");
  assert.deepEqual(state.gates.map(gate => gate.exitCode), [2, 0]);
  assert.deepEqual(state.gates.map(gate => gate.status), ["failed", "passed"]);
  for (const gate of gates) assert.match(readFileSync(join(directory, "evidence", gate.id, "command.log"), "utf8"), new RegExp(gate.id));
  const summaryPath = join(directory, "step-summary.md");
  assert.equal(publishRun({ directory, output: captured.output, summaryPath }).status, "failed");
  assert.match(captured.text(), /complete-result/u);
  assert.match(readFileSync(summaryPath, "utf8"), /case-1 \| passed/u);
});

test("전역 시간 초과는 현재 명령 124와 후속 미실행을 남기고 성공으로 바꾸지 않는다", async t => {
  const directory = temporary(t);
  const gates = ["waiting", "unstarted"].map(id => ({ id, kind: "runtime", executable: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"] }));
  const state = await runRegressionPlan({ directory, gates, deadlineMs: Date.now() + 250, output: capture().output });
  assert.equal(state.status, "failed");
  assert.equal(state.gates[0].exitCode, 124);
  assert.equal(state.gates[0].reason, "global_budget_exhausted");
  assert.equal(state.gates[1].status, "not_run");
  assert.equal(state.gates[1].reason, "global_budget_exhausted_before_start");
});

test("설정 중 실패·불완전한 실행은 최종 요약에서도 미실행으로 남는다", t => {
  const directory = temporary(t);
  initializeRun(directory, Date.now() + 1_000);
  const state = publishRun({ directory, output: capture().output });
  assert.equal(state.status, "failed");
  assert.equal(state.gates.length, 11);
  assert.ok(state.gates.every(gate => gate.status === "not_run" && gate.reason === "setup_or_execution_did_not_complete"));
});

test("JSON 출력 상한 초과는 manifest와 작은 실패 진단을 보존하며 원본을 자르지 않는다", t => {
  const directory = temporary(t);
  const state = initializeRun(directory, Date.now(), [{ id: "large", kind: "runtime" }]);
  state.gates[0].status = "passed";
  state.gates[0].exitCode = 0;
  writeFileSync(join(directory, "summary.json"), JSON.stringify(state));
  const evidence = join(directory, "evidence", "large");
  mkdirSync(evidence, { recursive: true });
  const original = JSON.stringify({ result: "x".repeat(2_000) });
  writeFileSync(join(evidence, "browser-result.json"), original);
  writeFileSync(join(evidence, "browser-diagnostics.json"), JSON.stringify({ failure: "original diagnostic" }));
  const captured = capture();
  const published = publishRun({ directory, output: captured.output, maxJsonBytes: 200 });
  assert.equal(published.status, "failed");
  assert.equal(published.publication.failures.length, 1);
  assert.equal(published.publication.manifest.length, 2);
  assert.match(captured.text(), /original diagnostic/u);
  assert.equal(readFileSync(join(evidence, "browser-result.json"), "utf8"), original);
});

test("check 모드는 호출 위치와 설치 dependency에 의존하지 않고 쓰기 없이 계획을 확인한다", t => {
  const cwd = temporary(t);
  const checked = spawnSync(process.execPath, [join(REPOSITORY_ROOT, "scripts/run-studio-exhaustive-regressions.mjs"), "--check"], { cwd, encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(JSON.parse(checked.stdout).gates.length, 11);
  assert.equal(existsSync(join(cwd, "artifacts")), false);
});
