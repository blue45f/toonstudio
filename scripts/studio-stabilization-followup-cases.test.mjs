import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, SUITES, browsersFor, initialize, publish, runCases, validateReport } from "./run-studio-exhaustive-followup.mjs";
import { OPFS_GATES, STABILIZATION_SUITES, stabilizationRuntime, terminalEvidence, validateStabilizationFiles } from "./studio-stabilization-followup-cases.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const build = { gitSha: "a".repeat(40), buildId: "0123456789ab" };
const workflow = readFileSync(join(ROOT, ".github/workflows/studio-exhaustive-regressions.yml"), "utf8");
const quiet = { write() {} };
const consoleLog = "[verify-studio-3d-console] WebGPU shard PASS babylon-artifact-parity\n[verify-studio-3d-console] WebGPU shard PASS magic-layer-alignment\n[verify-studio-3d-console] PASS http://127.0.0.1:4173/studio/canvas\n";
const physicsLog = () => `${JSON.stringify({ artifactDirectory: "/tmp/proof", results: ["desktop", "mobile-390", "mobile-320"].map(name => ({ name, ok: true, screenshots: ["real.png"] })) }, null, 2)}\n[time] DESKTOP AND MOBILE BG3D PHYSICS RUNS OK\n`;

function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), "studio-stabilization-test-"));
  const cleanup = () => rmSync(directory, { recursive: true, force: true });
  if (typeof t.after === "function") t.after(cleanup); else t.onTestFinished(cleanup);
  return directory;
}

function fixture(item) {
  switch (item.kind) {
    case "native": return { ok: true, violations: [], scenarios: [{ evidence: { id: "paint-bucket", status: "passed", browserErrors: [], failedResponses: [],
      undo: { attempted: true, restored: true, retainedEditableRasterWhenExpected: true } } }] };
    case "matrix": return { hardFailures: 0, locale: "ko-KR", colorScheme: "light", reducedMotion: "no-preference", results: [{ scope: item.scope,
      failures: [], pageErrors: [], consoleErrors: [], previewFixture: { unexpectedResponses: [] },
      metrics: { controls: 10, documentOverflowX: 0, offscreen: [], smallTargets: [], unnamed: [] } }] };
    case "inapp": return { kind: "toonstudio-studio-inapp-browser-v1", scope: "selected", ok: true, phase: "complete", complete: true,
      selectionValid: true, activeCase: null, fatalFailure: null, notRun: [], totalEligible: 38, excludedByFilter: 37, failures: [],
      planned: [{ profile: item.profile, route: item.route }], results: [{ profile: item.profile, route: item.route, ok: true, hardFailures: [],
        closedRouteModal: "스토리보드 컨트롤 룸", returnDestination: "/studio" }] };
    case "living-ink-retired": return { status: "ok", schemaVersion: 1, execution: "retired-living-ink-admission", physicalMode: "retired",
      profiles: [{ width: 1440, height: 1000 }, { width: 390, height: 844 }].map(viewport => ({ viewport, controls: "absent",
        physicalWorkerInitializes: 0, editableStrokeCount: 1, undoRedo: "passed", screenshot: "stroke.png" })) };
    case "launch": return { runs: [0, 1].map(() => ({ ok: true, errCount: 0, sqliteStorageFailureCount: 0, workspaceMenu: { ok: true },
      stageInfo: { logicalW: "720", hasKonvaSurface: true, pageDelta: 2 } })), mobile: { ok: true, errCount: 0, dotRecorded: true, dotRendered: true, workspaceMenu: { ok: true } },
    mobileDocks: [320, 360, 390].map(width => ({ width, ok: true, errCount: 0, workspaceMenu: { ok: true }, sheets: ["pages", "props", "brushes"].map(id => ({ id, ok: true })) })) };
    case "opfs": return { status: "ok", gates: Object.fromEntries(OPFS_GATES.map(key => [key, true])) };
    case "companion": return { companionConnected: true, commandRoundTrip: true, navigatorConnected: true, navigatorPreviewReady: true,
      navigatorReconnected: true, workspaceReconnected: true, sessionPreserved: true, screenshots: ["a", "b", "c", "d"],
      diagnostics: Object.fromEntries(["primary", "workspace", "navigator", "navigatorReopened", "workspaceReopened"].map(key => [key,
        { consoleErrors: [], failedResponses: [], pageErrors: [], staticPreviewApiUnavailable: ["observed original allowed boundary"] }])) };
    case "latency": return { kind: "toonstudio-studio-brush-latency-browser-v3", mode: "smoke", ok: true, executionFailures: [], unexpectedBrowserErrors: [],
      policy: { hardAcceptance: { firstPixelVsyncExcessMs: 8 }, inputTimeoutMs: 360, settleObservationMs: 360, legacyTelemetryOnly: true },
      results: [{ id: "pen", competitiveExecutionCase: null, metrics: { pointerDown: { phase: "pointerdown", sampleIndex: 0, latencyMs: 12,
        changedPixels: 2, maxChannelDelta: 4, timedOut: false } }, frameBudgetMetrics: { firstPixelMs: 12 }, frameBudgetEvaluation: { ok: true, findings: [] } }] };
    case "console": return terminalEvidence("console", consoleLog);
    case "physics": return terminalEvidence("physics", physicsLog());
    case "bg3d-inapp": return { status: "ok", failures: [], profiles: ["kakaotalk-android-360", "instagram-ios-390", "naver-android-412"].map(id => ({ id,
      opened: true, failures: [], pageErrors: [], canvas: { cssWidth: 200, cssHeight: 100, distinctColors: 3 },
      engine: { badge: "WebGL2", smallestTouchTargetPx: 44 }, horizontalOverflowPx: 0, overlayOverlaps: [],
      touchScroll: { trustedTouchStart: true, scrollTopBefore: 0, scrollTopAfter: 20 } })),
    framingProfiles: ["framing-desktop", "framing-mobile"].map(id => ({ id, failures: [], pageErrors: [], fitMeanPixelDelta: 2, undoMeanPixelDelta: 0, guideAspectRatio: 9 / 16 })) };
    case "hybrid": return { status: "ok", schemaVersion: 3, execution: "vite-production-preview-shipped-studio-ui", route: "/studio/canvas", blocker: null, issues: [],
      blank: { nativeLayerCount: 0, initialAssetCount: 0 }, selection: {}, trsHistory: { stableIdThroughHistory: true, undoEnabled: true, redoEnabledAfterUndo: true },
      persistence: { pageReloadObserved: true, recoveryStatus: "saved" }, workerExport: { requestCount: 1, responseCount: 1, workerErrorCount: 0 },
      bg3d: { hybridDccReopened: true, renderedFraming: { fullyInsideViewport: true } },
      diagnostics: { consoleErrors: [], consoleWarnings: [], pageErrors: [], requestFailures: [], fiveHundredResponses: [] } };
    case "playwright-production": return { errors: [], stats: { expected: item.titles.length, unexpected: 0, flaky: 0, skipped: 0 },
      suites: [{ specs: item.titles.map(title => ({ title, tests: [{ expectedStatus: "passed", status: "expected", results: [{ status: "passed" }] }] })) }] };
    default: throw new Error(item.kind);
  }
}

test("새 고정 UI8·3D6gate는 fresh40분 안에서 원래35분/내부 판정을 유지한다", t => {
  assert.deepEqual(Object.keys(STABILIZATION_SUITES), ["interaction-followup", "3d-followup"]);
  assert.equal(SUITES["interaction-followup"].length, 8); assert.equal(SUITES["3d-followup"].length, 6);
  assert.deepEqual(SUITES["3d-followup"].map(item => item.id), ["studio-3d-console", "bg3d-inapp-editor", "bg3d-physics", "hybrid-dcc-integration", "bg3d-webgpu-rotation", "3d-visual-pro-vrm"]);
  for (const suite of Object.keys(STABILIZATION_SUITES)) {
    assert.throws(() => initialize(temporary(t), suite, Date.now() + 1000), /fresh-source/u);
    const state = initialize(temporary(t), suite, Date.now() + 39 * 60_000, "fresh-source");
    assert.ok(state.cases.every(item => item.status === "not_run"));
    assert.deepEqual(browsersFor(suite), ["chromium"]);
    for (const item of SUITES[suite]) { assert.equal(item.minutes, 35); assert.equal(item.stabilization, true); }
  }
  assert.deepEqual(Object.values(SUITES).slice(0, 5).map(items => items.length), [4, 3, 5, 1, 3]);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch' && format\('-\{0\}', inputs\.suite \|\| 'regressions'\)/u);
  assert.match(workflow, /STUDIO_FOLLOWUP_SOURCE_MODE:.*interaction-followup.*3d-followup.*'fresh-source'/u);
  assert.match(workflow, /scripts\/studio-exhaustive-evidence\.test\.mjs/u);
  assert.doesNotMatch(workflow, /actions\/(?:cache|upload-artifact)|cache:|continue-on-error/u);
});

test("모든 새 원본 report는 빈·다른 case·미완료·기능 실패를 거절한다", () => {
  for (const item of Object.values(STABILIZATION_SUITES).flat()) {
    validateReport(item, fixture(item), build);
    assert.throws(() => validateReport(item, {}, build), item.id);
  }
  const changes = {
    native: value => { value.scenarios[0].evidence.undo.restored = false; },
    matrix: value => { delete value.results[0].metrics; },
    inapp: value => { value.results[0].closedRouteModal = "wrong"; },
    "living-ink-retired": value => { value.profiles[0].undoRedo = "failed"; },
    launch: value => { value.mobile.dotRendered = false; },
    opfs: value => { delete value.gates.checkpointSurvivesPageReload; },
    companion: value => { value.diagnostics.navigator.pageErrors.push("abort"); },
    latency: value => { value.results[0].frameBudgetEvaluation.ok = false; },
    console: value => { value.shards.pop(); }, physics: value => { value.original.results.pop(); },
    "bg3d-inapp": value => { value.framingProfiles[0].undoMeanPixelDelta = 1.01; },
    hybrid: value => { value.persistence.pageReloadObserved = false; },
    "playwright-production": value => { value.suites[0].specs[0].tests[0].results.push({ status: "passed" }); },
  };
  for (const item of Object.values(STABILIZATION_SUITES).flat()) {
    const report = fixture(item); changes[item.kind](report);
    assert.throws(() => validateReport(item, report, build), item.id);
  }
  const latency = SUITES["interaction-followup"].at(-1);
  for (const mutate of [value => { value.mode = "competitive-long-stroke"; }, value => { value.results[0].metrics.pointerDown.latencyMs = null; },
    value => { value.results[0].frameBudgetMetrics.firstPixelMs = 33; }, value => { value.policy.hardAcceptance.firstPixelVsyncExcessMs = 34; },
    value => { delete value.results[0].metrics.pointerDown.sampleIndex; value.results[0].metrics.pointerDown.index = 0; }]) {
    const report = fixture(latency); mutate(report); assert.throws(() => validateReport(latency, report, build));
  }
});

test("production 원래 test제목·skip0·retry0와 preview만 허용한다", () => {
  const config = readFileSync(join(ROOT, "playwright.studio-production-followup.config.ts"), "utf8");
  assert.match(config, /pnpm exec vite preview --config apps\/web\/vite\.config\.ts/u);
  assert.match(config, /reuseExistingServer: false/u);
  for (const item of SUITES["3d-followup"].filter(value => value.kind === "playwright-production")) {
    for (const change of [value => { value.stats.skipped = 1; }, value => { value.stats.flaky = 1; },
      value => { value.suites[0].specs[0].title = "different test"; }, value => { value.suites[0].specs[0].tests[0].expectedStatus = "failed"; }]) {
      const report = fixture(item); change(report); assert.throws(() => validateReport(item, report, build));
    }
    const runtime = stabilizationRuntime(item, "/tmp/case");
    assert.equal(runtime.env.PLAYWRIGHT_JSON_OUTPUT_FILE, "/tmp/case/playwright-results.json");
    assert.equal(runtime.args.at(-1), "--output=/tmp/case/browser-output");
  }
});

test("console·physics는 원래 최종PASS·전체하위case와 원문해시를 확인한다", t => {
  for (const [kind, raw] of [["console", consoleLog], ["physics", physicsLog()]]) {
    const directory = temporary(t);
    const item = SUITES["3d-followup"].find(value => value.kind === kind);
    const report = terminalEvidence(kind, raw);
    writeFileSync(join(directory, "process.log"), raw);
    validateStabilizationFiles(item, directory, report);
    writeFileSync(join(directory, "process.log"), `${raw}changed\n`);
    assert.throws(() => validateStabilizationFiles(item, directory, report));
    assert.throws(() => terminalEvidence(kind, raw.replace(/PASS|RUNS OK/gu, "FAILED")));
  }
  assert.throws(() => terminalEvidence("console", `${consoleLog}[verify-studio-3d-console] WebGPU shard PASS magic-layer-alignment\n`));
});

test("누락된원본JSON과deadline초과를 성공으로 바꾸지않고 다음gate를 보존한다", async t => {
  const directory = temporary(t);
  const state = initialize(directory, "interaction-followup", Date.now() + 60_000, "fresh-source");
  state.provenance = { sourceSha: build.gitSha }; state.build = build;
  let calls = 0;
  await runCases(directory, state, { env: { TOONSPECTRUM_BG3D_INAPP_VERIFY_ORIGIN: "https://untrusted.invalid", PLAYWRIGHT_EXECUTABLE_PATH: "/unexpected" },
    run: async (_command, _args, options) => {
      calls += 1;
      assert.equal(options.env.TOONSPECTRUM_BG3D_INAPP_VERIFY_ORIGIN, undefined);
      assert.equal(options.env.PLAYWRIGHT_EXECUTABLE_PATH, undefined);
      if (calls === 2) state.deadlineMs = Date.now() - 1;
      return { exitCode: 0, reason: null };
    } });
  assert.equal(calls, 2); assert.equal(state.status, "failed");
  assert.deepEqual(state.cases.slice(0, 2).map(item => item.status), ["failed", "failed"]);
  assert.ok(state.cases.slice(2).every(item => item.status === "not_run"));
  assert.equal(publish(directory, state, { output: quiet }).status, "failed");
});

test("OPFS 보조원문이 없거나 runtime불가이면 성공summary만으로는 통과하지 않는다", t => {
  const directory = temporary(t);
  const item = SUITES["interaction-followup"].find(value => value.kind === "opfs");
  assert.throws(() => validateStabilizationFiles(item, directory, fixture(item)));
  for (const [name, value] of [["observations.json", { status: "observed", issues: [] }],
    ["browser-result.json", { status: "ok", execution: "focused-vite-production-build-and-preview" }],
    ["diagnostics.json", { consoleErrors: [], pageErrors: [], requestFailures: [], fiveHundredResponses: [], cspViolations: [] }]]) {
    writeFileSync(join(directory, name), JSON.stringify(value));
  }
  validateStabilizationFiles(item, directory, fixture(item));
  writeFileSync(join(directory, "browser-result.json"), JSON.stringify({ status: "unsupported" }));
  assert.throws(() => validateStabilizationFiles(item, directory, fixture(item)));
});

test("pen CPU진단 불가와 실제품질FAIL을 구분하고 큰rawprofile은 요구하지 않는다", t => {
  const directory = temporary(t);
  const item = SUITES["interaction-followup"].at(-1);
  const report = fixture(item);
  writeFileSync(join(directory, "process.log"), "ALL REPRESENTATIVE BRUSH LATENCY GATES OK\n");
  assert.throws(() => validateStabilizationFiles(item, directory, report));
  writeFileSync(join(directory, "studio-brush-latency-pen-smoke-cpu-summary.json"), JSON.stringify({
    kind: "toonstudio-studio-brush-first-contact-cpu-v1", schemaVersion: 1, caseId: "pen-smoke", rawProfileSaved: false,
    status: "unavailable", issues: ["profiling unavailable"],
  }));
  validateStabilizationFiles(item, directory, report);
  report.results[0].frameBudgetEvaluation.ok = false;
  assert.throws(() => validateReport(item, report, build));
});
