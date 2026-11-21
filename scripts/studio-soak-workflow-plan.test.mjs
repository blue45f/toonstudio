import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  renameSync, rmSync, symlinkSync, truncateSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

import { createStudioSoakWorkflowPlan, STUDIO_SOAK_PROFILES } from "./studio-soak-workflow-plan.mjs";
import { collectStudioSoakDiagnosticAssets } from "./collect-studio-soak-diagnostic-assets.mjs";

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

const DIAGNOSTIC_SHA = "a".repeat(40);
const DIAGNOSTIC_BUILD_ID = "b".repeat(16);
const REQUIRED_ASSETS = ["studio-legacy-editor-adapter", "studio-konva-runtime", "react-runtime"];
const OPTIONAL_ASSETS = ["StudioShellFloatingLayoutHost", "StudioEdgeQuickSlidersAndHoldEyedropper"];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function withDiagnosticFixture(run) {
  const directory = mkdtempSync(join(tmpdir(), "studio-soak-diagnostic-assets-"));
  const distDirectory = join(directory, "dist");
  const evidenceDirectory = join(directory, "evidence");
  const assetsDirectory = join(distDirectory, "assets");
  const output = join(evidenceDirectory, "diagnostic-assets");
  const metadataPath = join(distDirectory, ".vite", "build-meta.json");
  const indexPath = join(distDirectory, "index.html");
  const reportPath = join(evidenceDirectory, "report.json");
  mkdirSync(assetsDirectory, { recursive: true });
  mkdirSync(join(distDirectory, ".vite"));
  mkdirSync(evidenceDirectory);
  const metadata = { gitSha: DIAGNOSTIC_SHA, buildId: DIAGNOSTIC_BUILD_ID };
  const metadataBytes = Buffer.from(JSON.stringify(metadata) + "\n");
  const indexBytes = Buffer.from("<!doctype html><title>진단 fixture</title>\n");
  writeFileSync(metadataPath, metadataBytes);
  writeFileSync(indexPath, indexBytes);
  const assetName = (prefix) => `${prefix}-fixture123.js`;
  const expectedAssets = new Map(REQUIRED_ASSETS.map((prefix) => [
    assetName(prefix), Buffer.from(`export const 이름 = ${JSON.stringify(prefix)};\n`),
  ]));
  for (const [file, bytes] of expectedAssets) writeFileSync(join(assetsDirectory, file), bytes);
  const report = {
    sourceCommit: DIAGNOSTIC_SHA, sourceDirty: false, sessionId: "fixture-session-123",
    cpuDiagnostic: { requested: true, diagnosticOnly: true, captured: false },
    build: { source: "owned-preview", gitSha: DIAGNOSTIC_SHA, buildId: DIAGNOSTIC_BUILD_ID,
      verified: true, metadataSha256: sha256(metadataBytes), indexSha256: sha256(indexBytes) },
  };
  const saveReport = () => writeFileSync(reportPath, JSON.stringify(report));
  saveReport();
  const collect = (overrides = {}) => collectStudioSoakDiagnosticAssets({
    distDirectory, evidenceDirectory, expectedSourceCommit: DIAGNOSTIC_SHA, ...overrides,
  });
  const rejectBeforeOutput = (pattern, overrides) => {
    assert.throws(() => collect(overrides), pattern);
    assert.equal(existsSync(output), false, "검증 실패로 일부 파일·정상 manifest를 만들면 안 된다");
  };
  const writeSizedAsset = (prefix, bytes) => {
    const path = join(assetsDirectory, assetName(prefix));
    writeFileSync(path, "// 크기 경계 fixture");
    truncateSync(path, bytes);
  };
  try {
    return run({ directory, distDirectory, evidenceDirectory, assetsDirectory, output,
      metadataPath, indexPath, reportPath, metadata, metadataBytes, indexBytes,
      report, saveReport, assetName, expectedAssets, collect, rejectBeforeOutput, writeSizedAsset });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("진단 자산은 실제 JS 바이트·해시·세션·빌드 식별자를 묶고 선택 파일만 복사한다", () => {
  withDiagnosticFixture((fixture) => {
    for (const prefix of OPTIONAL_ASSETS) {
      const name = fixture.assetName(prefix);
      const bytes = Buffer.from(`export const optional = ${JSON.stringify(prefix)};\n`);
      fixture.expectedAssets.set(name, bytes);
      writeFileSync(join(fixture.assetsDirectory, name), bytes);
    }
    writeFileSync(join(fixture.assetsDirectory, "unrelated-unused.js"), "외부 파일");
    writeFileSync(join(fixture.assetsDirectory, "studio-konva-runtime-fixture123.js.map"), "별도 map");
    const manifest = fixture.collect();
    assert.deepEqual(manifest, JSON.parse(readFileSync(join(fixture.output, "manifest.json"), "utf8")));
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.diagnosticOnly, true);
    assert.equal(manifest.source, "verified-production-dist-files");
    assert.equal(manifest.sourceCommit, DIAGNOSTIC_SHA);
    assert.equal(manifest.sessionId, fixture.report.sessionId);
    assert.equal(manifest.buildId, DIAGNOSTIC_BUILD_ID);
    assert.equal(manifest.metadataSha256, sha256(fixture.metadataBytes));
    assert.equal(manifest.indexSha256, sha256(fixture.indexBytes));
    assert.match(manifest.limitation, /HTTP 응답 캡처나 성능 수락 증거가 아니다/u);
    const expected = [...fixture.expectedAssets].map(([file, bytes]) => ({
      file, bytes: bytes.length, sha256: sha256(bytes),
    }));
    assert.deepEqual(manifest.files, expected);
    assert.equal(manifest.totalBytes, expected.reduce((total, file) => total + file.bytes, 0));
    assert.deepEqual(readdirSync(fixture.output).sort(), [...fixture.expectedAssets.keys(), "manifest.json"].sort());
    for (const [file, bytes] of fixture.expectedAssets) {
      assert.deepEqual(readFileSync(join(fixture.output, file)), bytes);
    }
  });
});

test("선택 진단 청크가 없는 빌드도 필수 세 청크가 있으면 보존한다", () => {
  withDiagnosticFixture((fixture) => assert.equal(fixture.collect().files.length, 3));
});

test("한 빌드의 Konva runtime과 facade를 이름과 바이트 그대로 함께 보존한다", () => {
  withDiagnosticFixture((fixture) => {
    rmSync(join(fixture.assetsDirectory, fixture.assetName("studio-konva-runtime")));
    const assets = new Map([
      ["studio-konva-runtime-CgWvCJDQ.js", Buffer.from('export { 도형 } from "./studio-konva-runtime-Dq2AFIuE.js";\n')],
      ["studio-konva-runtime-Dq2AFIuE.js", Buffer.from('export const 도형 = "실제 runtime fixture";\n')],
    ]);
    for (const [name, bytes] of assets) writeFileSync(join(fixture.assetsDirectory, name), bytes);
    const manifest = fixture.collect();
    const selected = manifest.files.filter((file) => file.file.startsWith("studio-konva-runtime-"));
    assert.deepEqual(selected, [...assets].map(([file, bytes]) => ({
      file, bytes: bytes.length, sha256: sha256(bytes),
    })));
    assert.equal(manifest.files.length, 4);
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.totalBytes, manifest.files.reduce((total, file) => total + file.bytes, 0));
    for (const [name, bytes] of assets) assert.deepEqual(readFileSync(join(fixture.output, name)), bytes);
  });
});

for (const [label, mutate] of [
  ["일반 실행", (report) => { report.cpuDiagnostic.diagnosticOnly = false; }],
  ["요청하지 않은 계측", (report) => { report.cpuDiagnostic.requested = false; }],
  ["문자열 true", (report) => { report.cpuDiagnostic.diagnosticOnly = "true"; }],
  ["dirty 소스", (report) => { report.sourceDirty = true; }],
  ["다른 source SHA", (report) => { report.sourceCommit = "c".repeat(40); }],
  ["다른 build SHA", (report) => { report.build.gitSha = "c".repeat(40); }],
  ["미검증 build", (report) => { report.build.verified = false; }],
]) {
  test(`진단 자산 수집은 ${label} 보고서를 거절한다`, () => {
    withDiagnosticFixture((fixture) => {
      mutate(fixture.report);
      fixture.saveReport();
      fixture.rejectBeforeOutput(/진단 실행|source SHA/u);
    });
  });
}

test("짧거나 여러 줄인 기대 SHA는 빌드 파일을 신뢰하기 전에 거절한다", () => {
  withDiagnosticFixture((fixture) => {
    for (const expectedSourceCommit of [undefined, "a".repeat(7), DIAGNOSTIC_SHA + "\n"]) {
      fixture.rejectBeforeOutput(/정확한 source SHA/u, { expectedSourceCommit });
    }
  });
});

for (const field of ["index", "metadata"]) {
  test(`검사 후 바뀐 ${field} 실제 바이트는 보고서 SHA256과 일치하지 않아 거절한다`, () => {
    withDiagnosticFixture((fixture) => {
      const path = field === "index" ? fixture.indexPath : fixture.metadataPath;
      writeFileSync(path, readFileSync(path, "utf8") + " \n");
      fixture.rejectBeforeOutput(/출처 파일이 바뀌었습니다/u);
    });
  });
}

test("보고서 해시만 갱신해도 실제 metadata의 다른 source SHA를 숨길 수 없다", () => {
  withDiagnosticFixture((fixture) => {
    const changed = Buffer.from(JSON.stringify({ ...fixture.metadata, gitSha: "c".repeat(40) }));
    writeFileSync(fixture.metadataPath, changed);
    fixture.report.build.metadataSha256 = sha256(changed);
    fixture.saveReport();
    fixture.rejectBeforeOutput(/출처 파일이 바뀌었습니다/u);
  });
});

for (const value of [undefined, "", "  ", 17]) {
  test(`진단 sessionId가 ${JSON.stringify(value)}이면 manifest를 만들지 않는다`, () => {
    withDiagnosticFixture((fixture) => {
      fixture.report.sessionId = value;
      fixture.saveReport();
      fixture.rejectBeforeOutput(/세션과 실제 빌드 식별자/u);
    });
  });
}

for (const value of [undefined, "", "  ", 17]) {
  test(`실제 buildId가 ${JSON.stringify(value)}이면 일치하는 보고서·해시도 거절한다`, () => {
    withDiagnosticFixture((fixture) => {
      const metadata = Buffer.from(JSON.stringify({ ...fixture.metadata, buildId: value }));
      writeFileSync(fixture.metadataPath, metadata);
      fixture.report.build.buildId = value;
      fixture.report.build.metadataSha256 = sha256(metadata);
      fixture.saveReport();
      fixture.rejectBeforeOutput(/세션과 실제 빌드 식별자/u);
    });
  });
}

test("유효한 source SHA라도 보고서와 실제 buildId가 다르면 거절한다", () => {
  withDiagnosticFixture((fixture) => {
    fixture.report.build.buildId = "c".repeat(16);
    fixture.saveReport();
    fixture.rejectBeforeOutput(/세션과 실제 빌드 식별자/u);
  });
});

test("기존 출력의 다른 JS·manifest와 새 진단 증거를 섞거나 덮어쓰지 않는다", () => {
  withDiagnosticFixture((fixture) => {
    mkdirSync(fixture.output);
    writeFileSync(join(fixture.output, "previous-build.js"), "기존 원본");
    writeFileSync(join(fixture.output, "manifest.json"), "기존 manifest");
    assert.throws(() => fixture.collect(), { code: "EEXIST" });
    assert.deepEqual(readdirSync(fixture.output).sort(), ["manifest.json", "previous-build.js"]);
    assert.equal(readFileSync(join(fixture.output, "manifest.json"), "utf8"), "기존 manifest");
    assert.equal(readFileSync(join(fixture.output, "previous-build.js"), "utf8"), "기존 원본");
  });
});

test("같은 출력을 두 번 수집하려 해도 첫 성공의 파일·manifest를 보존한다", () => {
  withDiagnosticFixture((fixture) => {
    fixture.collect();
    const before = readFileSync(join(fixture.output, "manifest.json"));
    const name = fixture.assetName(REQUIRED_ASSETS[0]);
    const firstBytes = readFileSync(join(fixture.output, name));
    writeFileSync(join(fixture.assetsDirectory, name), "수집 이후의 다른 JS");
    assert.throws(() => fixture.collect(), { code: "EEXIST" });
    assert.deepEqual(readFileSync(join(fixture.output, "manifest.json")), before);
    assert.deepEqual(readFileSync(join(fixture.output, name)), firstBytes);
  });
});

test("출력 symlink를 따라 다른 디렉터리에 파일을 쓰지 않는다", () => {
  withDiagnosticFixture((fixture) => {
    const target = join(fixture.directory, "other-output");
    mkdirSync(target);
    writeFileSync(join(target, "keep.txt"), "유지");
    symlinkSync(target, fixture.output, "dir");
    assert.throws(() => fixture.collect(), { code: "EEXIST" });
    assert.deepEqual(readdirSync(target), ["keep.txt"]);
    assert.equal(readFileSync(join(target, "keep.txt"), "utf8"), "유지");
  });
});

for (const prefix of REQUIRED_ASSETS) {
  test(`필수 진단 청크 ${prefix} 누락은 출력 전에 거절한다`, () => {
    withDiagnosticFixture((fixture) => {
      rmSync(join(fixture.assetsDirectory, fixture.assetName(prefix)));
      fixture.rejectBeforeOutput(/필수 진단 번들이 누락/u);
    });
  });
}

for (const prefix of [...REQUIRED_ASSETS, ...OPTIONAL_ASSETS]) {
  test(`진단 이름군 ${prefix}는 서로 다른 해시의 파일 네 개까지 모두 보존한다`, () => {
    withDiagnosticFixture((fixture) => {
      rmSync(join(fixture.assetsDirectory, fixture.assetName(prefix)), { force: true });
      const names = Array.from({ length: 4 }, (_, index) => `${prefix}-part${index}.js`);
      for (const name of names) writeFileSync(join(fixture.assetsDirectory, name), `export const 이름 = ${JSON.stringify(name)};`);
      const selected = fixture.collect().files.filter((file) => file.file.startsWith(prefix + "-"));
      assert.deepEqual(selected.map((file) => file.file), names);
      for (const file of selected) {
        const source = readFileSync(join(fixture.assetsDirectory, file.file));
        assert.deepEqual(readFileSync(join(fixture.output, file.file)), source);
        assert.equal(file.sha256, sha256(source));
      }
    });
  });
  test(`진단 이름군 ${prefix}의 다섯 번째 파일은 출력 전에 거절한다`, () => {
    withDiagnosticFixture((fixture) => {
      rmSync(join(fixture.assetsDirectory, fixture.assetName(prefix)), { force: true });
      for (let index = 0; index < 5; index += 1) {
        writeFileSync(join(fixture.assetsDirectory, `${prefix}-part${index}.js`), `청크 ${index}`);
      }
      fixture.rejectBeforeOutput(/파일 수가 4개를 넘었습니다/u);
    });
  });
}

for (const sameFamily of [true, false]) {
  test(`${sameFamily ? "같은" : "다른 필수"} 이름군의 하드링크로 동일 파일을 중복 보존하지 않는다`, () => {
    withDiagnosticFixture((fixture) => {
      const source = join(fixture.assetsDirectory, fixture.assetName(REQUIRED_ASSETS[0]));
      const alias = join(fixture.assetsDirectory, sameFamily
        ? `${REQUIRED_ASSETS[0]}-alias456.js` : fixture.assetName(REQUIRED_ASSETS[1]));
      if (!sameFamily) rmSync(alias);
      linkSync(source, alias);
      fixture.rejectBeforeOutput(/동일한 진단 파일을 중복/u);
    });
  });
}

for (const kind of ["empty", "directory", "symlink"]) {
  test(`${kind} JS 경로는 일반 진단 파일로 보존하지 않는다`, () => {
    withDiagnosticFixture((fixture) => {
      const asset = join(fixture.assetsDirectory, fixture.assetName(REQUIRED_ASSETS[0]));
      rmSync(asset);
      if (kind === "empty") writeFileSync(asset, "");
      if (kind === "directory") mkdirSync(asset);
      if (kind === "symlink") {
        const target = join(fixture.directory, "outside.js");
        writeFileSync(target, "외부 원본");
        symlinkSync(target, asset, "file");
      }
      fixture.rejectBeforeOutput(/일반 JS 파일/u);
    });
  });
}

test("assets 디렉터리 자체가 symlink이면 빌드 내부 파일로 간주하지 않는다", () => {
  withDiagnosticFixture((fixture) => {
    const target = join(fixture.directory, "moved-assets");
    renameSync(fixture.assetsDirectory, target);
    symlinkSync(target, fixture.assetsDirectory, "dir");
    fixture.rejectBeforeOutput(/실제 빌드 안/u);
  });
});

test("개별 16MiB·합계 32MiB 경계값은 원본 크기와 해시 그대로 보존한다", () => {
  withDiagnosticFixture((fixture) => {
    const limit = 16 * 1024 * 1024;
    fixture.writeSizedAsset(REQUIRED_ASSETS[0], limit);
    fixture.writeSizedAsset(REQUIRED_ASSETS[1], limit - 1);
    fixture.writeSizedAsset(REQUIRED_ASSETS[2], 1);
    const manifest = fixture.collect();
    assert.equal(manifest.totalBytes, 32 * 1024 * 1024);
    assert.deepEqual(manifest.files.map((file) => file.bytes), [limit, limit - 1, 1]);
    for (const file of manifest.files) {
      const bytes = readFileSync(join(fixture.output, file.file));
      assert.equal(bytes.length, file.bytes);
      assert.equal(sha256(bytes), file.sha256);
    }
  });
});

test("개별 파일이 16MiB보다 1바이트 커도 복사하지 않는다", () => {
  withDiagnosticFixture((fixture) => {
    fixture.writeSizedAsset(REQUIRED_ASSETS[0], 16 * 1024 * 1024 + 1);
    fixture.rejectBeforeOutput(/16MiB/u);
  });
});

test("개별 한도 안에서도 합계가 32MiB보다 1바이트 크면 일부 파일조차 복사하지 않는다", () => {
  withDiagnosticFixture((fixture) => {
    fixture.writeSizedAsset(REQUIRED_ASSETS[0], 16 * 1024 * 1024);
    fixture.writeSizedAsset(REQUIRED_ASSETS[1], 16 * 1024 * 1024);
    fixture.writeSizedAsset(REQUIRED_ASSETS[2], 1);
    fixture.rejectBeforeOutput(/합계가 32MiB/u);
  });
});

test("같은 이름군의 여러 해시 파일도 합계 32MiB 한도를 공유한다", () => {
  withDiagnosticFixture((fixture) => {
    fixture.writeSizedAsset(REQUIRED_ASSETS[0], 16 * 1024 * 1024);
    const second = join(fixture.assetsDirectory, `${REQUIRED_ASSETS[0]}-another456.js`);
    writeFileSync(second, "두 번째 청크");
    truncateSync(second, 16 * 1024 * 1024);
    fixture.rejectBeforeOutput(/합계가 32MiB/u);
  });
});

test("실제 수집 CLI는 다른 cwd에서도 같은 fixture 빌드의 진단 증거를 보존한다", () => {
  withDiagnosticFixture((fixture) => {
    const scripts = join(fixture.directory, "scripts");
    const elsewhere = join(fixture.directory, "elsewhere");
    mkdirSync(scripts);
    mkdirSync(elsewhere);
    const script = join(scripts, "collect-studio-soak-diagnostic-assets.mjs");
    copyFileSync(new URL("./collect-studio-soak-diagnostic-assets.mjs", import.meta.url), script);
    const result = spawnSync(process.execPath, [script], { cwd: elsewhere, encoding: "utf8",
      env: { ...process.env, GITHUB_SHA: DIAGNOSTIC_SHA, TOONSPECTRUM_SOAK_OUT: "evidence" } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /진단 JS 3개/u);
    const manifest = JSON.parse(readFileSync(join(fixture.output, "manifest.json"), "utf8"));
    assert.equal(manifest.sourceCommit, DIAGNOSTIC_SHA);
    assert.equal(manifest.files.length, 3);
  });
});

test("workflow는 diagnostic-only 자산을 실패 증거 업로드 전에 같은 profile 경로에 연결한다", () => {
  const steps = workflow.jobs["overnight-full-soak"].steps;
  const matches = steps.filter((step) => step.run === "node scripts/collect-studio-soak-diagnostic-assets.mjs");
  assert.equal(matches.length, 1);
  const collect = matches[0];
  const soak = steps.find((step) => step.name === "Long-session Studio soak");
  const upload = steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
  assert.equal(collect.if, "${{ !cancelled() && needs.production-build.outputs.diagnostic == '1' && steps.restore_dist.outcome == 'success' }}");
  assert.equal(collect.env.TOONSPECTRUM_SOAK_OUT, soak.env.TOONSPECTRUM_SOAK_OUT);
  assert.equal(upload.with.path, `${collect.env.TOONSPECTRUM_SOAK_OUT}/`);
  assert.equal(upload.if, "always()");
  assert.ok(steps.indexOf(soak) < steps.indexOf(collect));
  assert.ok(steps.indexOf(collect) < steps.indexOf(upload));
  assert.equal(collect["continue-on-error"], undefined);
  assert.equal(workflow.jobs["production-build"].steps.some((step) => step.run === collect.run), false);
});
