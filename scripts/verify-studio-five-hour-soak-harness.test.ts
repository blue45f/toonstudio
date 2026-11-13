import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createStudioSoakCheckpoint } from "./lib/studio-five-hour-soak-checkpoint.mjs";
import { isExpectedLocalPreviewRuntimeNoise } from "./lib/studio-five-hour-soak-runtime-noise.mjs";

const source = readFileSync(new URL("./verify-studio-five-hour-soak.mts", import.meta.url), "utf8");
const desktopPen = readFileSync(new URL("./lib/studio-soak-desktop-pen.ts", import.meta.url), "utf8");
const pointerRoute = readFileSync(new URL("./lib/studio-soak-pointer-route.ts", import.meta.url), "utf8");
const layerCountUi = readFileSync(new URL("./lib/studio-soak-layer-count.ts", import.meta.url), "utf8");

function sliceFunction(name: string, nextName: string): string {
  const start = source.indexOf(`async function ${name}`);
  const end = source.indexOf(`async function ${nextName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Studio five-hour soak browser state isolation", () => {
  it("closes every brush surface that can cover mobile or desktop drawing", () => {
    const close = sliceFunction("closeBrushSurfaces", "openMobileBrushLibrary");
    expect(close).toContain('[data-studio-brush-catalog-session="true"]');
    expect(close).toContain('[data-studio-brush-library="true"]');
    expect(close).toContain('[data-studio-mobile-sheet="draw"]');
    expect(close).toContain('page.keyboard.press("Escape")');
    expect(close).toContain('data-studio-brush-workbench-dock="true"');
    expect(close).toContain('[role="dialog"][data-studio-brush-floating]:visible');
    expect(close).toContain('floating.getByRole("button", { name: / 닫기$/u })');
    expect(close).toContain('if (docked) continue');
    expect(close).toContain('state: "hidden"');
    expect(close).toContain(".catch(() => false)");
  });

  it("모바일 카탈로그는 공통 실제 설정 진입과 같은 잔여 예산을 사용한다", () => {
    const open = sliceFunction("openMobileBrushLibrary", "selectBrush");
    expect(open).toContain('await openMobileBrushSettings(page, dock, remaining())');
    expect(open).toContain('page.locator("#studio-mobile-draw-settings")');
    expect(open).toContain(`sheet.locator('[data-studio-open-brush-library="true"]')`);
    expect(open).toContain('opener.click({ timeout: remaining() })');
    expect(open).toContain('library.waitFor({ state: "visible", timeout: remaining() })');
    expect(open).not.toContain('name: "브러시 설정 (굵기·색·프리셋)"');
  });

  it("keeps mobile and desktop brush selection on their actual surfaces", () => {
    const select = sliceFunction("selectBrush", "ensurePenReady");
    expect(select).toContain("await openMobileBrushLibrary(page)");
    expect(select).toContain('library.getByRole("searchbox")');
    expect(select).toContain('[data-studio-brush-workbench-dock="true"] [data-studio-brush-library="true"]');
    expect(select).toContain('dockedLibrary.getByRole("searchbox")');
    expect(select).toContain('data-studio-brush-selection-pending');
    expect(select).toContain('if (active && !pending) return true');
    expect(select).toContain("await ensurePenReady(page)");
    expect(select).toContain('dockedLibrary.waitFor({ state: "visible"');
    expect(select).toContain('option.click({ timeout: 5_000 })');
    expect(select).toContain('[data-studio-brush-active-pill="true"]');
    expect(select).toContain("return closeBrushSurfaces(page)");
  });

  it("uses direct pen controls before the desktop shortcut fallback", () => {
    const pen = sliceFunction("ensurePenReady", "drawEvidenceStroke");
    expect(pen).toContain('[data-studio-mobile-editing-dock="true"]');
    expect(pen).toContain('getByRole("button", { name: /^(?:펜|Pen)$/u })');
    expect(desktopPen).toContain('[data-studio-rail-tool-id="pen"]');
    expect(desktopPen).toContain('[data-studio-current-tool-id="pen"]');
    expect(pen).toContain('getAttribute("aria-pressed", { timeout: remaining() })');
    expect(desktopPen).toContain("active.blur()");
    expect(desktopPen).toContain('page.keyboard.press("b")');
  });

  it("공통 PC 진입에 기존 30초 준비 예산의 남은 시간만 전달한다", () => {
    const pen = sliceFunction("ensurePenReady", "acknowledgeStudioBetaNoticeIfPresent");
    const ready = sliceFunction("waitForPenReady", "readStudioAvailableLayerCount");
    expect(desktopPen).toContain('[data-studio-drawing-clarity="true"]');
    expect(desktopPen).toContain("await activateDesktopPen(page, remaining())");
    expect(pen).toContain("return ensureStudioSoakDesktopPen(page, timeoutMs)");
    expect(ready).toContain("timeoutMs = 30_000");
    expect(ready).toContain("const remaining = deadline - Date.now()");
    expect(ready).toContain("await ensurePenReady(page, remaining) && Date.now() < deadline");
    expect(ready).toContain("Math.min(250, deadline - Date.now())");
    expect(desktopPen).not.toContain("activateDesktopPen(page)");
  });

  it("실제 PC 도크를 열고 브러시 선택 적용을 확인한 뒤 그리기를 시작한다", () => {
    const select = sliceFunction("selectBrush", "ensurePenReady");
    const desktop = select.slice(select.indexOf("if (!(await closeBrushSurfaces(page))) return false;"));
    expect(desktop.indexOf("await pill.click")).toBeLessThan(desktop.indexOf("dockedLibrary.waitFor"));
    expect(desktop.indexOf("dockedLibrary.waitFor")).toBeLessThan(desktop.indexOf('dockedLibrary.getByRole("searchbox")'));
    expect(desktop).toContain('getAttribute("aria-pressed") === "true"');
    expect(desktop).toContain('getAttribute("data-studio-brush-selection-pending") === "true"');
    expect(desktop).toContain("if (active && !pending) return true");
    expect(desktop).not.toContain("force: true");
  });

  it("never measures ink while a brush surface is covering the canvas", () => {
    const draw = sliceFunction("drawEvidenceStroke", "spawnPreview");
    const closeIndex = draw.indexOf("await closeBrushSurfaces(page)");
    const beforeShotIndex = draw.indexOf("const before = await page.screenshot");
    expect(closeIndex).toBeGreaterThanOrEqual(0);
    expect(closeIndex).toBeLessThan(beforeShotIndex);
    expect(draw).toContain("brush surfaces stayed open before drawing evidence");
  });

  it("routes every raster probe through the shared pressure-aware input driver", () => {
    const draw = sliceFunction("drawEvidenceStroke", "spawnPreview");
    expect(draw).toContain("prepareStudioSoakPointerRoute(page, cycle)");
    expect(pointerRoute).toContain("createStudioPointerStrokePoints(box, cycle");
    expect(pointerRoute).toContain("stage.evaluate(measureStudioSmartShapeCanvasSpace)");
    expect(pointerRoute).toContain("hit instanceof HTMLCanvasElement && stage.contains(hit)");
    expect(draw.indexOf("await assertStudioSoakPointerRoute(page, points)")).toBeGreaterThan(draw.indexOf("const before = await page.screenshot"));
    expect(draw.indexOf("await assertStudioSoakPointerRoute(page, points)")).toBeLessThan(draw.indexOf("await dispatchStudioPointerStroke"));
    expect(draw).not.toContain("visibleBox.width * 0.2");
    expect(draw).toContain("dispatchStudioPointerStroke({");
    expect(draw).toContain("mode: inputMode");
    expect(draw).toContain("cdp");
    expect(draw).not.toContain("page.mouse.down()");
  });

  it("uses layer commits to distinguish a covered stroke from missing ink", () => {
    expect(layerCountUi).toContain('[data-studio-layer-available-count]');
    expect(source).toContain("layerCountBefore: evidence.layerCountBefore");
    expect(source).toContain("layerCountAfter: evidence.layerCountAfter");
    expect(source).toContain("const acceptedByLayer = evidence.layerCountBefore !== null");
    expect(source).toContain("evidence.layerCountAfter > evidence.layerCountBefore");
    expect(source).toContain("report.visuallyCoveredStrokes += 1");
    expect(source).toContain("else if (!visuallyChanged)");
  });

  it("keeps document size bounded while repeatedly exercising real undo and redo controls", () => {
    expect(source).toContain("HISTORY_CHURN_INTERVAL = 10");
    expect(source).toContain("clickStudioHistoryAction(");
    expect(source).toContain('[data-studio-primary-action="');
    expect(source).toContain('[data-studio-command-bar-command="');
    expect(source).toContain("N strokes == N layer rows");
    expect(source).toContain('clickStudioHistoryAction(page, "undo")');
    expect(source).toContain('clickStudioHistoryAction(page, "redo")');
    expect(source).toContain("Bounded undo ended at");
    expect(source).toContain("Bounded history churn ended at");
    expect(source).toContain("strokesSinceHistoryChurn = 0");
    expect(source).toContain('kind: "final-history-churn"');
  });

  it("enters the current drawing canvas route before waiting for the editor", () => {
    expect(source).toContain('page.goto(`${preview.origin}/studio/canvas`');
    expect(source).toContain('page.locator(\'[data-studio-editor="true"]\').waitFor');
  });

  it("refuses to downgrade pen or touch soak evidence when CDP is unavailable", () => {
    expect(source).toContain('if (inputMode !== "mouse" && !cdp)');
    expect(source).toContain("refusing a mouse downgrade");
    expect(source).toContain("pointerInputResolved: inputMode");
    expect(source).toContain("physicalDeviceCertified: false");
  });
});

describe("Studio five-hour soak checkpoint telemetry", () => {
  const MiB = 1024 * 1024;
  type HeapPoint = { atMs: number; usedBytes: number };
  const sample = (atHours: number, usedMiB: number): HeapPoint => ({
    atMs: atHours * 3_600_000,
    usedBytes: usedMiB * MiB,
  });
  const checkpoint = (heapSamples: HeapPoint[]) => createStudioSoakCheckpoint({
    atMs: 7_200_000,
    cycle: 21,
    heap: heapSamples.at(-1) ?? null,
    heapSamples,
    failures: 2,
  });

  it.each<{ name: string; samples: HeapPoint[] }>([
    { name: "empty", samples: [] },
    { name: "one sample", samples: [sample(0, 100)] },
    { name: "non-finite timestamp", samples: [sample(0, 100), { atMs: Number.NaN, usedBytes: 110 * MiB }] },
    { name: "non-finite heap", samples: [sample(0, 100), { atMs: 3_600_000, usedBytes: Number.POSITIVE_INFINITY }] },
    { name: "zero time window", samples: [sample(0, 100), sample(0, 110)] },
  ])("serializes an explicit null until a usable finite sample window exists: $name", ({ samples }) => {
    const report = { checkpoints: [checkpoint(samples)] };
    expect(report.checkpoints[0]?.heapSlopeBytesPerHour).toBeNull();
    expect(JSON.parse(JSON.stringify(report)).checkpoints[0].heapSlopeBytesPerHour).toBeNull();
  });

  it("serializes the shared regression result after enough samples and preserves checkpoint fields", () => {
    const row = checkpoint([sample(0, 100), sample(1, 108), sample(2, 116)]);
    expect(row).toEqual({
      atMs: 7_200_000,
      cycle: 21,
      heapBytes: 116 * MiB,
      heapSlopeBytesPerHour: 8 * MiB,
      domNodes: null,
      eventListeners: null,
      failures: 2,
    });
    const serialized = JSON.parse(JSON.stringify({ checkpoints: [row] }));
    expect(Number.isFinite(serialized.checkpoints[0].heapSlopeBytesPerHour)).toBe(true);
    expect(serialized.checkpoints[0].heapSlopeBytesPerHour).toBe(8 * MiB);
  });

  it("filters invalid telemetry without mutating samples used for policy evaluation", () => {
    const samples = [
      sample(0, 100),
      { atMs: Number.NaN, usedBytes: 0 },
      sample(1, 108),
      { atMs: 3_600_001, usedBytes: Number.NEGATIVE_INFINITY },
    ];
    const original = structuredClone(samples);
    expect(checkpoint(samples).heapSlopeBytesPerHour).toBe(8 * MiB);
    expect(samples).toEqual(original);
  });

  it.each([
    [100, 100, 0],
    [108, 100, -8 * MiB],
  ])("reports finite flat and decreasing slopes (%s to %s MiB)", (first, last, slope) => {
    expect(checkpoint([sample(0, first), sample(1, last)]).heapSlopeBytesPerHour).toBe(slope);
  });

  it("does not expose a non-finite regression result even with finite extreme inputs", () => {
    expect(checkpoint([
      { atMs: 0, usedBytes: Number.MAX_VALUE },
      { atMs: 3_600_000, usedBytes: -Number.MAX_VALUE },
    ]).heapSlopeBytesPerHour).toBeNull();
  });

  it("wires the tested checkpoint builder into the browser harness", () => {
    expect(source).toContain("report.checkpoints.push(createStudioSoakCheckpoint({");
    expect(source).toContain("heapSamples: report.heapSamples");
  });
});


describe("Studio five-hour soak local-preview runtime noise", () => {
  const ticket502 = {
    channel: "console",
    text: "Failed to load resource: the server responded with a status of 502 (Bad Gateway) @ http://127.0.0.1:4173/api/studio-realtime/tickets:0",
  };

  it("classifies only the absent local-preview ticket proxy as environment noise", () => {
    expect(isExpectedLocalPreviewRuntimeNoise(ticket502, {
      origin: "http://127.0.0.1:4173",
      spawnedPreview: true,
    })).toBe(true);
  });

  it("classifies the absent local-preview capabilities probe as environment noise", () => {
    expect(isExpectedLocalPreviewRuntimeNoise({
      channel: "console",
      text: "Failed to load resource: the server responded with a status of 502 (Bad Gateway) @ http://127.0.0.1:4173/api/health/capabilities:0",
    }, {
      origin: "http://127.0.0.1:4173",
      spawnedPreview: true,
    })).toBe(true);
  });

  it("still fails the capabilities probe when the preview was not spawned here", () => {
    expect(isExpectedLocalPreviewRuntimeNoise({
      channel: "console",
      text: "Failed to load resource: the server responded with a status of 502 (Bad Gateway) @ http://127.0.0.1:4173/api/health/capabilities:0",
    }, {
      origin: "http://127.0.0.1:4173",
      spawnedPreview: false,
    })).toBe(false);
  });

  it.each(["401 (Unauthorized)", "403 (Forbidden)"])(
    "classifies local-preview ticket auth rejection %s as environment noise",
    (status) => {
      expect(isExpectedLocalPreviewRuntimeNoise({
        ...ticket502,
        text: ticket502.text.replace("502 (Bad Gateway)", status),
      }, {
        origin: "http://127.0.0.1:4173",
        spawnedPreview: true,
      })).toBe(true);
    },
  );

  it.each([
    ["external origin", ticket502, { origin: "https://studio.example.com", spawnedPreview: true }],
    ["existing preview", ticket502, { origin: "http://127.0.0.1:4173", spawnedPreview: false }],
    ["page exception", { ...ticket502, channel: "pageerror" }, { origin: "http://127.0.0.1:4173", spawnedPreview: true }],
    ["different status", {
      ...ticket502,
      text: ticket502.text.replace("502 (Bad Gateway)", "500 (Internal Server Error)"),
    }, { origin: "http://127.0.0.1:4173", spawnedPreview: true }],
    ["different endpoint", {
      ...ticket502,
      text: ticket502.text.replace("studio-realtime/tickets", "projects"),
    }, { origin: "http://127.0.0.1:4173", spawnedPreview: true }],
  ])("never suppresses %s", (_name, error, options) => {
    expect(isExpectedLocalPreviewRuntimeNoise(error, options)).toBe(false);
  });

  it("wires the classification before runtime failures are recorded", () => {
    const classification = source.indexOf("isExpectedLocalPreviewRuntimeNoise(error");
    const failure = source.indexOf("kind: `runtime-${error.channel}`");
    expect(classification).toBeGreaterThanOrEqual(0);
    expect(classification).toBeLessThan(failure);
    expect(source).toContain("report.environmentNoise.push(error)");
  });
});

describe("Studio five-hour soak layer navigator admission", () => {
  it("레이어 관측은 실제 UI 수명과 같은 reader를 사용하고 모바일 시트를 되열지 않는다", () => {
    expect(source).toContain("return readStudioSoakLayerCount(page, timeoutMs)");
    expect(source).toContain("return waitForStudioSoakLayerCount(page, predicate, timeoutMs)");
    expect(source).toContain("return withStudioSoakLayerNavigator(page, timeoutMs");
    expect(layerCountUi).toContain('getByRole("button", { name: "레이어 열기", exact: true })');
    expect(layerCountUi).toContain('getByRole("button", { name: "작업 패널", exact: true })');
    expect(layerCountUi).toContain('[data-studio-inspector-primary-tab="layers"]:visible');
    expect(layerCountUi).toContain('counter.getAttribute("data-studio-layer-available-count", { timeout: remaining() })');
    expect(layerCountUi).toContain('counter.count() === 0');
    expect(layerCountUi).toContain('button[data-inspector-control-id="panel.chrome.close"]');
    expect(layerCountUi).toContain('state: "hidden"');
    expect(layerCountUi).toContain("finally");
    expect(source).not.toContain("if (surviving === null)");
    const draw = sliceFunction("drawEvidenceStroke", "spawnPreview");
    expect(draw.indexOf("await readStudioAvailableLayerCount(page)")).toBeLessThan(draw.indexOf("await prepareStudioSoakPointerRoute(page, cycle)"));
  });

  it("gates preflight and history churn on the mounted navigator instead of the raw count", () => {
    expect(source).toContain("boundedLayerBaseline = await ensureStudioLayerNavigatorCount(page);");
    expect(source).not.toContain("boundedLayerBaseline = await readStudioAvailableLayerCount(page);");
    const churnEnsure = source.indexOf("await ensureStudioLayerNavigatorCount(page);\n        report.historyActions += await exerciseBoundedHistoryChurn(");
    expect(churnEnsure).toBeGreaterThanOrEqual(0);
  });
});

describe("Studio five-hour soak commit separation diagnostics", () => {
  it("records the editor shell's retention diagnostics around every stroke", () => {
    expect(source).toContain('read("data-studio-history-budget-evicted-steps")');
    expect(source).toContain('read("data-studio-history-last-measured-retained-bytes")');
    expect(source).toContain('read("data-studio-history-last-measured-entry-bytes")');
    expect(source).toContain('read("data-studio-history-total-appends")');
    expect(source).toContain('read("data-studio-rejected-stroke-count")');
    expect(source).toContain("historyTotalAppendsAfter: evidence.historyTotalAppendsAfter");
    expect(source).toContain("rejectedStrokeCountAfter: evidence.rejectedStrokeCountAfter");
    const draw = sliceFunction("drawEvidenceStroke", "spawnPreview");
    expect(draw).toContain("const diagnosticsBefore = await readStudioHistoryDiagnostics(page);");
    expect(draw).toContain("const diagnosticsAfter = await readStudioHistoryDiagnostics(page);");
    expect(draw).toContain("historyEvictedStepsBefore: diagnosticsBefore.evictedSteps");
    expect(draw).toContain("historyRetainedBytesAfter: diagnosticsAfter.retainedBytes");
    expect(source).toContain("historyEvictedStepsBefore: evidence.historyEvictedStepsBefore");
    expect(source).toContain("historyRetainedBytesAfter: evidence.historyRetainedBytesAfter");
  });

  it("captures the visible commit-gate error and keeps per-stroke heap sampling opt-in", () => {
    expect(source).toContain("readStudioVisibleCommitError(page)");
    expect(source).toContain("[data-studio-status-error-dismiss]");
    expect(source).toContain("commitErrorText: evidence.commitErrorText");
    expect(source).toContain('process.env.TOONSPECTRUM_SOAK_SAMPLE_HEAP_PER_STROKE === "1"');
    expect(source).toContain("heapUsedBytesAfter: heapAfter?.usedBytes ?? null");
    expect(source).toContain("sampleHeapPerStroke: SAMPLE_HEAP_PER_STROKE");
  });
});

describe("Studio five-hour soak beta notice admission", () => {
  it("acknowledges the visible product notice through its action before drawing", () => {
    expect(source).toContain("acknowledgeStudioBetaNoticeIfPresent(page)");
    expect(source).toContain("data-studio-beta-notice");
    expect(source).toContain('[data-studio-beta-notice-acknowledge="true"]');
    expect(source).toContain('notice.waitFor({ state: "hidden"');

    const navigation = source.indexOf("page.goto(`${preview.origin}/studio/canvas`");
    const acknowledgement = source.lastIndexOf("await acknowledgeStudioBetaNoticeIfPresent(page)");
    const editorWait = source.indexOf('page.locator(\'[data-studio-editor="true"]\')');
    expect(navigation).toBeGreaterThanOrEqual(0);
    expect(acknowledgement).toBeGreaterThan(navigation);
    expect(editorWait).toBeGreaterThan(acknowledgement);
  });
});
