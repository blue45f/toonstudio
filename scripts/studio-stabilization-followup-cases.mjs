/** 원래 검증기의 선택 실행과 완료 증거만 연결한다. 제품 판정·내부 timeout은 바꾸지 않는다. */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const gate = (id, kind, script, report, extra = {}) => Object.freeze({
  id, kind, command: "pnpm", args: ["exec", "tsx", `scripts/${script}.mts`], report,
  minutes: 35, env: {}, stabilization: true, ...extra,
});
const headed = (id, kind, script, report) => gate(id, kind, script, report, {
  command: "xvfb-run", args: ["-a", "--server-args=-screen 0 1920x1200x24", "pnpm", "exec", "tsx", `scripts/${script}.mts`],
});
export const ROTATION_TITLE = "WebGPU 기즈모 연속 회전은 이전 실루엣을 누적하지 않는다";
export const VISUAL_TITLES = Object.freeze([
  "3D 웹툰 제작의 구도·컷·출력과 실제 선화·바닥 충돌이 동작한다",
  "3D 캐릭터가 렌더되고 포즈가 캔버스에 붙는다",
]);
export const OPFS_GATES = Object.freeze([
  "focusedViteProductionBundle", "nativeNavigatorStorageGetDirectory", "nativeOriginWideWebLocks",
  "checkpointSurvivesPageReload", "sqliteMirrorSurvivesPageReload", "newerSqliteFallbackMigratesToOpfs",
  "durableClearTombstoneWins", "uniqueDocumentCleanup", "zeroConsoleErrors", "zeroPageErrors",
  "zeroRequestFailures", "zeroFiveHundredResponses", "zeroCspViolations",
]);
export const STABILIZATION_SUITES = Object.freeze({
  "interaction-followup": Object.freeze([
    gate("native-paint-bucket", "native", "verify-studio-native-raster-tools", "studio-native-raster-tools-report.json", {
      scenario: "paint-bucket", args: ["exec", "tsx", "scripts/verify-studio-native-raster-tools.mts", "--scenario=paint-bucket"],
    }),
    gate("living-ink-retired-admission", "living-ink-retired", "verify-studio-living-ink-integration", "studio-living-ink-integration.json"),
    gate("inapp-kakaotalk-android-360-comic", "inapp", "verify-studio-inapp-browser", "studio-inapp-browser-report.json", {
      profile: "kakaotalk-android-360", route: "comic",
      env: { TOONSPECTRUM_INAPP_VERIFY_PROFILES: "kakaotalk-android-360", TOONSPECTRUM_INAPP_VERIFY_ROUTES: "comic" },
    }),
    gate("chromium-desktop-1440-editor", "matrix", "unused", "report.json", {
      command: "node", args: ["scripts/qa/verify-studio-cross-browser-matrix.mjs"], scope: "chromium/desktop-1440/editor",
      env: { TOONSPECTRUM_VERIFY_ENGINES: "chromium", TOONSPECTRUM_VERIFY_PROFILES: "desktop-1440", TOONSPECTRUM_VERIFY_ROUTES: "editor",
        TOONSPECTRUM_VERIFY_LOCALE: "ko-KR", TOONSPECTRUM_VERIFY_COLOR_SCHEME: "light", TOONSPECTRUM_VERIFY_REDUCED_MOTION: "no-preference" },
    }),
    gate("studio-launch", "launch", "verify-studio-launch", "studio-launch-report.json"),
    gate("autosave-opfs-session", "opfs", "verify-studio-autosave-opfs-session", "summary.json", {
      evidenceScope: "original-focused-vite-production-bundle-and-native-opfs",
    }),
    gate("companion", "companion", "verify-studio-companion", "studio-companion-report.json"),
    gate("brush-latency-pen", "latency", "verify-studio-brush-latency", "studio-brush-latency-report.json", {
      env: { TOONSPECTRUM_BRUSH_LATENCY_IDS: "pen", TOONSPECTRUM_BRUSH_LATENCY_CPU_PROFILE: "1", TOONSPECTRUM_BRUSH_FRAME_DIAGNOSTICS: "pen" },
    }),
  ]),
  "3d-followup": Object.freeze([
    headed("studio-3d-console", "console", "verify-studio-3d-console", "terminal-evidence.json"),
    headed("bg3d-inapp-editor", "bg3d-inapp", "verify-studio-bg3d-inapp-editor", "summary.json"),
    gate("bg3d-physics", "physics", "verify-studio-bg3d-physics", "terminal-evidence.json"),
    gate("hybrid-dcc-integration", "hybrid", "verify-studio-hybrid-dcc-integration", "studio-hybrid-dcc-integration.json"),
    gate("bg3d-webgpu-rotation", "playwright-production", "unused", "playwright-results.json", {
      command: "xvfb-run", args: ["-a", "--server-args=-screen 0 1920x1200x24", "pnpm", "exec", "playwright", "test",
        "--config=playwright.bg3d-runtime.config.ts", "--reporter=list,json,./scripts/studio-bg3d-runtime-reporter.ts"],
      titles: [ROTATION_TITLE], env: { STUDIO_BG3D_WEBGPU_GIZMO: "1", PLAYWRIGHT_CHANNEL: "chromium" },
    }),
    gate("3d-visual-pro-vrm", "playwright-production", "unused", "playwright-results.json", {
      args: ["exec", "playwright", "test", "--config=playwright.studio-production-followup.config.ts"],
      titles: VISUAL_TITLES, env: { STUDIO_BG3D_WEBGPU_GIZMO: "0", PLAYWRIGHT_CHANNEL: "" },
    }),
  ]),
});
export const isStabilizationSuite = suite => Object.hasOwn(STABILIZATION_SUITES, suite);
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const empty = value => Array.isArray(value) && value.length === 0;
const finite = value => typeof value === "number" && Number.isFinite(value);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const readJson = path => JSON.parse(readFileSync(path, "utf8"));
const clean = (value, keys) => keys.every(key => empty(value?.[key]));
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

export function stabilizationRuntime(item, directory) {
  if (!item.stabilization) return { args: item.args, env: {} };
  const env = Object.fromEntries([
    "TOONSPECTRUM_LIVING_INK_INTEGRATION_DIR", "TOONSPECTRUM_AUTOSAVE_OPFS_VERIFY_DIR",
    "TOONSPECTRUM_COMPANION_VERIFY_DIR", "TOONSPECTRUM_BG3D_INAPP_VERIFY_DIR", "TOONSPECTRUM_BG3D_PHYSICS_VERIFY_DIR",
    "TOONSPECTRUM_HYBRID_DCC_VERIFY_DIR", "TOONSPECTRUM_BRUSH_LATENCY_VERIFY_DIR",
  ].map(key => [key, directory]));
  if (item.kind === "playwright-production") env.PLAYWRIGHT_JSON_OUTPUT_FILE = join(directory, item.report);
  return { env, args: item.kind === "playwright-production" ? [...item.args, `--output=${join(directory, "browser-output")}`] : item.args };
}

export function terminalEvidence(kind, raw) {
  const evidence = { kind: "original-terminal-evidence", schemaVersion: 1, sourceLogSha256: sha256(raw) };
  if (kind === "console") {
    const shards = [...raw.matchAll(/^\[verify-studio-3d-console\] WebGPU shard PASS ([a-z-]+)\r?$/gmu)].map(match => match[1]);
    const terminal = raw.match(/^\[verify-studio-3d-console\] PASS (http:\/\/127\.0\.0\.1:\d+\/studio\/canvas)\r?$/mu);
    requireValue(same(shards, ["babylon-artifact-parity", "magic-layer-alignment"]) && terminal, "3D console 원래 두 WebGPU proof와 최종 PASS가 없습니다.");
    return { ...evidence, shards, terminalPass: terminal[0], route: terminal[1] };
  }
  requireValue(kind === "physics" && /DESKTOP AND MOBILE BG3D PHYSICS RUNS OK/u.test(raw), "physics 원래 최종 PASS가 없습니다.");
  const candidate = [...raw.matchAll(/^\{\r?\n\s*"artifactDirectory"[\s\S]*?^\}\r?$/gmu)].map(match => JSON.parse(match[0]));
  requireValue(candidate.length === 1, "physics 원본 완료 JSON이 하나여야 합니다.");
  return { ...evidence, original: candidate[0], terminalPass: "DESKTOP AND MOBILE BG3D PHYSICS RUNS OK" };
}

export function finalizeStabilizationEvidence(item, directory, root) {
  if (["console", "physics"].includes(item.kind)) {
    const report = terminalEvidence(item.kind, readFileSync(join(directory, "process.log"), "utf8"));
    writeFileSync(join(directory, item.report), `${JSON.stringify(report, null, 2)}\n`);
  }
  if (item.id === "bg3d-webgpu-rotation") {
    copyFileSync(join(root, "test-results/bg3d-runtime-verdict.json"), join(directory, "original-runtime-verdict.json"));
  }
}

export function validateStabilizationReport(item, report) {
  requireValue(object(report), `${item.id}: 완료 JSON 객체가 없습니다.`);
  if (item.kind === "living-ink-retired") {
    requireValue(report.status === "ok" && report.schemaVersion === 1 && report.execution === "retired-living-ink-admission"
      && report.physicalMode === "retired" && same(report.profiles?.map(value => value.viewport), [{ width: 1440, height: 1000 }, { width: 390, height: 844 }])
      && report.profiles.every(value => value.controls === "absent" && value.physicalWorkerInitializes === 0
        && value.editableStrokeCount === 1 && value.undoRedo === "passed" && typeof value.screenshot === "string" && value.screenshot.endsWith(".png")),
    "Living Ink retired admission의 두 실제 입력·Undo/Redo 계약이 완료되지 않았습니다.");
  } else if (item.kind === "launch") {
    requireValue(report.runs?.length === 2 && report.runs.every(value => value.ok === true && value.errCount === 0
      && value.sqliteStorageFailureCount === 0 && value.workspaceMenu?.ok === true && value.stageInfo?.logicalW === "720"
      && value.stageInfo.hasKonvaSurface === true && finite(value.stageInfo.pageDelta) && value.stageInfo.pageDelta >= 2), "launch desktop 두 회차가 완료되지 않았습니다.");
    requireValue(report.mobile?.ok === true && report.mobile.errCount === 0 && report.mobile.dotRecorded === true
      && report.mobile.dotRendered === true && report.mobile.workspaceMenu?.ok === true
      && same(report.mobileDocks?.map(value => value.width), [320, 360, 390])
      && report.mobileDocks.every(value => value.ok === true && value.errCount === 0 && value.workspaceMenu?.ok === true
        && same(value.sheets?.map(sheet => sheet.id), ["pages", "props", "brushes"]) && value.sheets.every(sheet => sheet.ok === true)),
    "launch 원래 mobile drawing·세 폭·모든 sheet가 완료되지 않았습니다.");
  } else if (item.kind === "opfs") {
    requireValue(report.status === "ok" && object(report.gates) && same(Object.keys(report.gates).sort(), [...OPFS_GATES].sort())
      && OPFS_GATES.every(key => report.gates[key] === true), "OPFS 원래13개 production/native 계약이 완료되지 않았습니다.");
  } else if (item.kind === "companion") {
    requireValue(["companionConnected", "commandRoundTrip", "navigatorConnected", "navigatorPreviewReady", "navigatorReconnected", "workspaceReconnected", "sessionPreserved"]
      .every(key => report[key] === true) && report.screenshots?.length === 4
      && ["primary", "workspace", "navigator", "navigatorReopened", "workspaceReopened"].every(key =>
        clean(report.diagnostics?.[key], ["consoleErrors", "failedResponses", "pageErrors"])), "Companion 원래 연결·재연결·실제 preview/오류 계약이 완료되지 않았습니다.");
  } else if (item.kind === "latency") {
    const result = report.results?.[0];
    const pointer = result?.metrics?.pointerDown;
    requireValue(report.kind === "toonstudio-studio-brush-latency-browser-v3" && report.mode === "smoke" && report.ok === true
      && report.results?.length === 1 && result.id === "pen" && result.competitiveExecutionCase === null
      && empty(report.executionFailures) && empty(report.unexpectedBrowserErrors) && result.frameBudgetEvaluation?.ok === true
      && Array.isArray(result.frameBudgetEvaluation.findings) && result.frameBudgetEvaluation.findings.every(value => value.level !== "error")
      && pointer?.phase === "pointerdown" && pointer.sampleIndex === 0 && finite(pointer.latencyMs) && pointer.latencyMs >= 0
      && pointer.changedPixels >= 2 && pointer.maxChannelDelta >= 4 && pointer.timedOut === false
      && result.frameBudgetMetrics?.firstPixelMs === pointer.latencyMs
      && report.policy?.hardAcceptance?.firstPixelVsyncExcessMs === 8 && report.policy.inputTimeoutMs === 360
      && report.policy.settleObservationMs === 360 && report.policy.legacyTelemetryOnly === true,
    "pen 원래 첫 픽셀·frame budget 계약이 통과하지 않았습니다.");
  } else if (item.kind === "console") {
    requireValue(report.kind === "original-terminal-evidence" && report.schemaVersion === 1
      && same(report.shards, ["babylon-artifact-parity", "magic-layer-alignment"])
      && /^\[verify-studio-3d-console\] PASS http:\/\/127\.0\.0\.1:\d+\/studio\/canvas\r?$/u.test(report.terminalPass ?? ""), "3D console 완료 proof가 없습니다.");
  } else if (item.kind === "physics") {
    requireValue(report.kind === "original-terminal-evidence" && report.schemaVersion === 1
      && report.terminalPass === "DESKTOP AND MOBILE BG3D PHYSICS RUNS OK"
      && same(report.original?.results?.map(value => value.name), ["desktop", "mobile-390", "mobile-320"])
      && report.original.results.every(value => value.ok === true && !value.error && Array.isArray(value.screenshots) && value.screenshots.length > 0),
    "physics desktop·mobile 두 폭의 원래 전체 검사 완료 증거가 없습니다.");
  } else if (item.kind === "bg3d-inapp") {
    requireValue(report.status === "ok" && empty(report.failures) && same(report.profiles?.map(value => value.id),
      ["kakaotalk-android-360", "instagram-ios-390", "naver-android-412"])
      && report.profiles.every(value => value.opened === true && empty(value.failures) && empty(value.pageErrors)
        && value.canvas?.cssWidth > 0 && value.canvas?.cssHeight > 0 && value.canvas?.distinctColors >= 3
        && value.engine?.badge?.includes("WebGL2") && (value.engine.smallestTouchTargetPx === null || value.engine.smallestTouchTargetPx >= 44)
        && value.horizontalOverflowPx === 0 && empty(value.overlayOverlaps) && value.touchScroll?.trustedTouchStart === true
        && value.touchScroll.scrollTopAfter > value.touchScroll.scrollTopBefore), "3D 인앱 원래3개 profile의 렌더·복구·터치 계약이 완료되지 않았습니다.");
    requireValue(same(report.framingProfiles?.map(value => value.id), ["framing-desktop", "framing-mobile"])
      && report.framingProfiles.every(value => clean(value, ["failures", "pageErrors"]) && finite(value.fitMeanPixelDelta) && value.fitMeanPixelDelta > 0.5
        && finite(value.undoMeanPixelDelta) && value.undoMeanPixelDelta <= 1 && finite(value.guideAspectRatio)
        && Math.abs(value.guideAspectRatio - 9 / 16) <= 0.003), "3D framing의 원래 fit·Undo·9:16 픽셀 계약이 완료되지 않았습니다.");
  } else if (item.kind === "hybrid") {
    requireValue(report.status === "ok" && report.schemaVersion === 3 && report.execution === "vite-production-preview-shipped-studio-ui"
      && report.route === "/studio/canvas" && report.blocker === null && empty(report.issues)
      && ["blank", "selection", "trsHistory", "persistence", "workerExport", "bg3d"].every(key => object(report[key]))
      && report.blank.nativeLayerCount === 0 && report.blank.initialAssetCount === 0
      && report.trsHistory.stableIdThroughHistory === true && report.trsHistory.undoEnabled === true && report.trsHistory.redoEnabledAfterUndo === true
      && report.persistence.pageReloadObserved === true && report.persistence.recoveryStatus === "saved"
      && report.workerExport.requestCount === 1 && report.workerExport.responseCount === 1 && report.workerExport.workerErrorCount === 0
      && report.bg3d.hybridDccReopened === true && report.bg3d.renderedFraming?.fullyInsideViewport === true
      && clean(report.diagnostics, ["consoleErrors", "consoleWarnings", "pageErrors", "requestFailures", "fiveHundredResponses"]),
    "Hybrid 원래 schema3 전체 policy의 성공·TRS·OPFS·GLB·실제 handoff 증거가 없습니다.");
  } else if (item.kind === "playwright-production") {
    const specs = [];
    const visit = suite => { specs.push(...(suite.specs ?? [])); for (const nested of suite.suites ?? []) visit(nested); };
    for (const suite of report.suites ?? []) visit(suite);
    const tests = specs.flatMap(spec => spec.tests ?? []);
    requireValue(same(specs.map(spec => spec.title), item.titles) && empty(report.errors)
      && report.stats?.expected === item.titles.length && report.stats.unexpected === 0 && report.stats.flaky === 0 && report.stats.skipped === 0
      && tests.length === item.titles.length && tests.every(value => value.expectedStatus === "passed" && value.status === "expected"
        && value.results?.length === 1 && value.results[0].status === "passed"), "선택한 원래 production Playwright case가 전부 실제1회 통과해야 합니다.");
  } else if (item.kind === "matrix") {
    const metrics = report.results?.[0]?.metrics;
    requireValue(object(metrics) && finite(metrics.documentOverflowX) && metrics.documentOverflowX <= 1
      && empty(metrics.offscreen) && Array.isArray(metrics.smallTargets) && Array.isArray(metrics.unnamed), "선택 matrix의 원래 실제 audit 수치가 없습니다.");
  } else if (item.kind === "inapp") {
    requireValue(report.results?.[0]?.closedRouteModal === "스토리보드 컨트롤 룸" && report.results[0].returnDestination === "/studio",
      "Kakao comic의 원래 modal 닫기·Studio 돌아가기 증거가 없습니다.");
  } else requireValue(item.kind === "native", `지원하지 않는 stabilization kind: ${item.kind}`);
}

export function validateStabilizationFiles(item, directory, report) {
  if (!item.stabilization) return;
  const log = () => readFileSync(join(directory, "process.log"), "utf8");
  if (["console", "physics"].includes(item.kind)) requireValue(same(terminalEvidence(item.kind, log()), report), "원래 terminal 증거와 receipt가 다릅니다.");
  if (item.kind === "launch") requireValue(/DESKTOP AND MOBILE RUNS OK/u.test(log()), "launch 원래 최종 PASS가 없습니다.");
  if (item.kind === "companion") requireValue(/PASS · real popup transport, command round-trip, preview, and reconnect/u.test(log()), "Companion 원래 최종 PASS가 없습니다.");
  if (item.kind === "latency") {
    requireValue(/ALL REPRESENTATIVE BRUSH LATENCY GATES OK/u.test(log()), "pen latency 원래 최종 PASS가 없습니다.");
    const cpu = readJson(join(directory, "studio-brush-latency-pen-smoke-cpu-summary.json"));
    requireValue(cpu.kind === "toonstudio-studio-brush-first-contact-cpu-v1" && cpu.schemaVersion === 1 && cpu.caseId === "pen-smoke"
      && cpu.rawProfileSaved === false && ["complete", "unavailable"].includes(cpu.status), "pen 첫 입력 CPU 진단 summary가 없습니다.");
  }
  if (item.kind === "opfs") {
    const observations = readJson(join(directory, "observations.json"));
    const browser = readJson(join(directory, "browser-result.json"));
    const diagnostics = readJson(join(directory, "diagnostics.json"));
    requireValue(observations.status === "observed" && empty(observations.issues) && browser.status === "ok"
      && browser.execution === "focused-vite-production-build-and-preview"
      && clean(diagnostics, ["consoleErrors", "pageErrors", "requestFailures", "fiveHundredResponses", "cspViolations"]),
    "OPFS 원본 관측·브라우저·오류 JSON이 모두 완료되어야 합니다.");
  }
  if (item.id === "bg3d-webgpu-rotation") {
    const verdict = readJson(join(directory, "original-runtime-verdict.json"));
    requireValue(verdict.runStatus === "passed" && verdict.passed === true && empty(verdict.reasons)
      && verdict.tests?.length === 1 && verdict.tests[0].title === ROTATION_TITLE
      && verdict.tests[0].expectedStatus === "passed" && verdict.tests[0].outcome === "expected"
      && same(verdict.tests[0].results, [{ status: "passed" }])
      && /Rotation test executed and passed; no skips or retries accepted\./u.test(log()), "원래 rotation reporter의 skip 없는 최종 PASS가 없습니다.");
  }
}
