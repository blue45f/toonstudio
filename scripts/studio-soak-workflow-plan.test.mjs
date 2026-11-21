import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { createStudioSoakWorkflowPlan, STUDIO_SOAK_PROFILES } from "./studio-soak-workflow-plan.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const workflow = parse(readFileSync(new URL("../.github/workflows/studio-five-hour-soak.yml", import.meta.url), "utf8"));

test("정기 검사는 기존 다섯 환경·300분·history churn을 유지한다", () => {
  const plan = createStudioSoakWorkflowPlan({ GITHUB_EVENT_NAME: "schedule", SOAK_PROFILE: "desktop", SOAK_MINUTES: "3", SOAK_DIAGNOSTIC: "true" });
  assert.deepEqual(JSON.parse(plan.matrix).include, STUDIO_SOAK_PROFILES);
  assert.equal(plan.minutes, "300");
  assert.equal(plan.workload, "bounded-churn");
  assert.equal(plan.stop_on_failure, "0");
  assert.equal(plan.measure_pointer_latency, "0");
  assert.equal(plan.latency_profile, "none");
  assert.equal(plan.diagnostic, "0");
});

test("기본 수동 검사는 300분이며 CPU 계측과 GPU 비교 진단을 실행하지 않는다", () => {
  const plan = createStudioSoakWorkflowPlan({ GITHUB_EVENT_NAME: "workflow_dispatch" });
  assert.equal(plan.minutes, "300");
  assert.equal(plan.diagnostic, "0");
  assert.equal(plan.stop_on_failure, "1");
});

test("명시한 짧은 진단만 허용하고 장시간·대표 지연 검사와 혼합하지 않는다", () => {
  for (const minutes of ["1", "3"]) {
    const plan = createStudioSoakWorkflowPlan({ GITHUB_EVENT_NAME: "workflow_dispatch", SOAK_MINUTES: minutes, SOAK_DIAGNOSTIC: "true" });
    assert.equal(plan.diagnostic, "1");
    assert.equal(plan.minutes, minutes);
  }
  for (const overrides of [
    {}, { SOAK_MINUTES: "4" }, { SOAK_MINUTES: "300" },
    { SOAK_MINUTES: "3", SOAK_PROFILE: "desktop", SOAK_LATENCY_BASELINE: "true" },
  ]) {
    assert.throws(() => createStudioSoakWorkflowPlan({ GITHUB_EVENT_NAME: "workflow_dispatch", SOAK_DIAGNOSTIC: "true", ...overrides }));
  }
});

test("수동 누적 펜 검사는 선택한 한 환경과 계측 요청을 정확히 전달한다", () => {
  const plan = createStudioSoakWorkflowPlan({ GITHUB_EVENT_NAME: "workflow_dispatch",
    SOAK_PROFILE: "desktop", SOAK_MINUTES: "300", SOAK_WORKLOAD: "accumulate", SOAK_INPUT: "pen",
    SOAK_BRUSH_CYCLES: "1", SOAK_STOP_ON_FAILURE: "true", SOAK_MEASURE_POINTER_LATENCY: "true", SOAK_LATENCY_BASELINE: "true" });
  assert.deepEqual(JSON.parse(plan.matrix).include, [STUDIO_SOAK_PROFILES[0]]);
  assert.equal(plan.workload, "accumulate");
  assert.equal(plan.input, "pen");
  assert.equal(plan.brush_cycles, "1");
  assert.equal(plan.stop_on_failure, "1");
  assert.equal(plan.measure_pointer_latency, "1");
  assert.equal(plan.latency_profile, "desktop");
});

test("수동 false 값과 짧은 사전 검사 시간을 기본값으로 덮어쓰지 않는다", () => {
  const plan = createStudioSoakWorkflowPlan({ GITHUB_EVENT_NAME: "workflow_dispatch",
    SOAK_PROFILE: "desktop-webgpu", SOAK_MINUTES: "3", SOAK_STOP_ON_FAILURE: "false",
    SOAK_MEASURE_POINTER_LATENCY: "false", SOAK_LATENCY_BASELINE: "0" });
  assert.equal(plan.minutes, "3");
  assert.equal(plan.stop_on_failure, "0");
  assert.equal(plan.measure_pointer_latency, "0");
  assert.equal(plan.latency_profile, "none");
  assert.equal(JSON.parse(plan.matrix).include[0].webgpu, "1");
});

test("범위 밖 시간·선택값·여러 줄 입력은 실행 전에 거부한다", () => {
  for (const invalid of [
    { SOAK_MINUTES: "0" }, { SOAK_MINUTES: "301" }, { SOAK_MINUTES: "3.5" }, { SOAK_MINUTES: "NaN" },
    { SOAK_PROFILE: "desktop\ninput=mouse" }, { SOAK_WORKLOAD: "reset" }, { SOAK_INPUT: "keyboard" },
    { SOAK_BRUSH_CYCLES: "0" }, { SOAK_STOP_ON_FAILURE: "yes" }, { SOAK_SAMPLE_HEAP_PER_STROKE: "2" },
    { SOAK_DIAGNOSTIC: "yes" },
  ]) assert.throws(() => createStudioSoakWorkflowPlan({ GITHUB_EVENT_NAME: "workflow_dispatch", ...invalid }));
});

test("desktop mouse 지연 검사를 여러 환경·모바일·WebGPU의 통과 증거로 표시하지 않는다", () => {
  for (const profile of ["all", ...STUDIO_SOAK_PROFILES.map((entry) => entry.id).filter((id) => id !== "desktop")]) {
    assert.throws(() => createStudioSoakWorkflowPlan({ GITHUB_EVENT_NAME: "workflow_dispatch",
      SOAK_PROFILE: profile, SOAK_LATENCY_BASELINE: "true" }), /profile=desktop/u);
  }
});

test("실제 CLI가 현재 작업 디렉터리와 무관하게 검증된 Actions 출력을 만든다", () => {
  const directory = mkdtempSync(join(tmpdir(), "studio-soak-plan-"));
  try {
    const output = join(directory, "outputs");
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./studio-soak-workflow-plan.mjs", import.meta.url))], {
      cwd: directory, encoding: "utf8", env: { ...process.env, GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_OUTPUT: output, SOAK_PROFILE: "instagram-ios", SOAK_MINUTES: "3" },
    });
    assert.equal(result.status, 0, result.stderr);
    const lines = Object.fromEntries(readFileSync(output, "utf8").trim().split("\n").map((line) => {
      const equals = line.indexOf("=");
      return [line.slice(0, equals), line.slice(equals + 1)];
    }));
    assert.equal(lines.minutes, "3");
    assert.deepEqual(JSON.parse(lines.matrix).include, [STUDIO_SOAK_PROFILES[3]]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("워크플로는 같은 SHA의 산출물로 실제 검사를 실행하고 실패 증거를 보존한다", () => {
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.deepEqual(Object.keys(workflow.on).sort(), ["schedule", "workflow_dispatch"]);
  assert.ok(Object.keys(workflow.on.workflow_dispatch.inputs).length <= 10);
  assert.equal(workflow.on.workflow_dispatch.inputs.minutes.default, "300");
  assert.equal(workflow.on.workflow_dispatch.inputs.diagnostic.default, false);
  assert.equal(workflow.on.workflow_dispatch.inputs.stop_on_failure.default, true);
  const build = workflow.jobs["production-build"];
  const soak = workflow.jobs["overnight-full-soak"];
  assert.equal(build["runs-on"], "ubuntu-24.04");
  assert.equal(soak["runs-on"], "ubuntu-24.04");
  assert.equal(soak.needs, "production-build");
  assert.equal(soak.strategy["fail-fast"], false);
  assert.equal(soak.strategy.matrix, "${{ fromJSON(needs.production-build.outputs.matrix) }}");
  const plan = build.steps.find((step) => step.id === "plan");
  assert.equal(plan.run, "node scripts/studio-soak-workflow-plan.mjs");
  assert.equal(plan.env.SOAK_DIAGNOSTIC, "${{ github.event.inputs.diagnostic }}");
  assert.equal(build.outputs.diagnostic, "${{ steps.plan.outputs.diagnostic }}");
  assert.equal(soak["timeout-minutes"], "${{ needs.production-build.outputs.diagnostic == '1' && 25 || 345 }}");
  const run = soak.steps.find((step) => step.name === "Long-session Studio soak");
  assert.equal(run.run, "pnpm exec tsx scripts/verify-studio-five-hour-soak.mts");
  assert.equal(run.env.TOONSTUDIO_SOAK_DIAGNOSTIC_CPU, "${{ needs.production-build.outputs.diagnostic }}");
  const gpuDiagnostic = soak.steps.find((step) => step.id === "gpu_diagnostic");
  assert.equal(gpuDiagnostic.if, "${{ !cancelled() && needs.production-build.outputs.diagnostic == '1' && matrix.id == 'desktop-webgpu' && steps.restore_dist.outcome == 'success' }}");
  for (const key of ["WORKLOAD", "INPUT", "BRUSH_CYCLES", "STOP_ON_FAILURE", "MEASURE_POINTER_LATENCY"]) {
    assert.equal(run.env[`TOONSPECTRUM_SOAK_${key}`], `\${{ needs.production-build.outputs.${key.toLowerCase()} }}`);
  }
  const baseline = soak.steps.find((step) => step.name === "Measure fresh-document representative latency");
  assert.equal(baseline.if, "needs.production-build.outputs.latency_profile == matrix.id");
  assert.equal(baseline.run, "pnpm exec tsx scripts/verify-studio-brush-latency.mts");
  assert.equal(baseline.env.TOONSPECTRUM_BRUSH_LATENCY_IDS, undefined);
  const preflight = soak.steps.find((step) => step.id === "preflight");
  assert.equal(preflight.if, "github.event_name == 'workflow_dispatch' && needs.production-build.outputs.minutes == '300'");
  assert.equal(preflight.env.TOONSPECTRUM_SOAK_MINUTES, "3");
  assert.equal(preflight.env.TOONSPECTRUM_SOAK_STOP_ON_FAILURE, "1");
  assert.equal(preflight.env.TOONSPECTRUM_SOAK_WORKLOAD, run.env.TOONSPECTRUM_SOAK_WORKLOAD);
  assert.equal(preflight.env.TOONSPECTRUM_SOAK_INPUT, run.env.TOONSPECTRUM_SOAK_INPUT);
  assert.notEqual(preflight.env.TOONSPECTRUM_SOAK_OUT, run.env.TOONSPECTRUM_SOAK_OUT);
  assert.ok(soak.steps.indexOf(preflight) < soak.steps.indexOf(run));
  assert.equal(run.if, undefined, "사전 검사가 실패하면 본 검사를 실행하지 않는다");
  const download = soak.steps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
  assert.equal(download.with.name, "studio-five-hour-dist-${{ github.sha }}");
  const upload = soak.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
  assert.equal(upload.if, "always()");
  assert.equal(upload.with["if-no-files-found"], "error");
  assert.ok(![...build.steps, ...soak.steps].some((step) => step["continue-on-error"]));
});
