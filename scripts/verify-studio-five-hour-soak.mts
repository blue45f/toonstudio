/**
 * Five-hour interactive Studio soak.
 *
 * This intentionally keeps one editor page alive. Short browser gates prove individual actions;
 * this gate proves that an artist can keep drawing after the 10-minute point where field reports
 * say GPU/state errors start accumulating. It exercises real drawing, brush switching and history
 * while sampling raster liveness, JS heap after GC, long tasks, runtime exceptions and WebGPU
 * device-loss/uncaptured errors.
 *
 * Environment:
 *   TOONSPECTRUM_SOAK_MINUTES=300
 *   TOONSPECTRUM_SOAK_PROFILE=desktop|kakaotalk-android-360|instagram-ios-390|naver-android-412
 *   TOONSPECTRUM_SOAK_WEBGPU=1
 *   TOONSPECTRUM_SOAK_INPUT=auto|mouse|pen|touch
 *   TOONSPECTRUM_SOAK_OUT=<directory>
 *   TOONSPECTRUM_SOAK_SAMPLE_HEAP_PER_STROKE=1  # 진단 실행 전용: 획마다 GC 힙을 샘플에 남긴다
 *   TOONSPECTRUM_VERIFY_ORIGIN=http://127.0.0.1:4173  # optional existing preview
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { decodePng } from "image-js";
import { chromium, type Browser, type CDPSession, type Locator, type Page } from "playwright";

import { STUDIO_ERASER_BRUSH_CATALOG_ITEMS, STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS, type StudioBrushCatalogItem } from "../apps/web/src/domains/creator/brush/studio-brush-catalog";

import { createStudioSoakCheckpoint } from "./lib/studio-five-hour-soak-checkpoint.mjs";
import { isExpectedLocalPreviewRuntimeNoise } from "./lib/studio-five-hour-soak-runtime-noise.mjs";
import { collectStudioInAppRuntimeErrors, installStudioInAppFirstRunState, installStudioInAppGuestBoundary, STUDIO_INAPP_PROFILES, type StudioInAppRuntimeError } from "./lib/studio-inapp-sweep-harness.mjs";
import { evaluateStudioSoakHeapGrowth, STUDIO_SOAK_HEAP_MAX_SLOPE_BYTES_PER_HOUR } from "./lib/studio-memory-growth-policy.mjs";
import { openMobileBrushSettings } from "./lib/studio-mobile-brush-settings";
import {
  dispatchStudioPointerStroke,
  parseStudioPointerInputMode,
  resolveStudioPointerInputMode,
} from "./lib/studio-pointer-input-driver.mjs";
import { ensureStudioSoakDesktopPen } from "./lib/studio-soak-desktop-pen";
import { readStudioSoakLayerCount, waitForStudioSoakLayerCount, withStudioSoakLayerNavigator } from "./lib/studio-soak-layer-count";
import { assertStudioSoakPointerRoute, prepareStudioSoakPointerRoute } from "./lib/studio-soak-pointer-route";
import { findFreePort, spawnVitePreview, stopChildProcess, waitForServer } from "./lib/studio-verify-preview-harness.mjs";

const MINUTES = Math.max(1, Number(process.env.TOONSPECTRUM_SOAK_MINUTES ?? "300") || 300);
const PROFILE_ID = process.env.TOONSPECTRUM_SOAK_PROFILE?.trim() || "desktop";
const WEBGPU = process.env.TOONSPECTRUM_SOAK_WEBGPU === "1";
const INPUT_MODE_REQUEST = parseStudioPointerInputMode(process.env.TOONSPECTRUM_SOAK_INPUT);
const OUT = process.env.TOONSPECTRUM_SOAK_OUT?.trim()
  || `artifacts/studio-five-hour-soak/${PROFILE_ID}${WEBGPU ? "-webgpu" : ""}`;
const CYCLE_TARGET_MS = Math.max(3_000, Number(process.env.TOONSPECTRUM_SOAK_CYCLE_MS ?? "30000") || 30_000);
const FORCED_BRUSH_ID = process.env.TOONSPECTRUM_SOAK_BRUSH_ID?.trim() || null;
const BRUSH_CYCLES = Math.max(1, Math.floor(Number(process.env.TOONSPECTRUM_SOAK_BRUSH_CYCLES ?? "5") || 5));
const STOP_ON_FAILURE = process.env.TOONSPECTRUM_SOAK_STOP_ON_FAILURE === "1";
/** 진단 실행 전용: 획마다 GC 후 힙을 재서 "획 수 대비 유지량" 곡선을 얻는다. 기본 소크는 끈다. */
const SAMPLE_HEAP_PER_STROKE = process.env.TOONSPECTRUM_SOAK_SAMPLE_HEAP_PER_STROKE === "1";
const BUILD_DIRECTORY = resolve(process.env.TOONSPECTRUM_SOAK_DIST_DIR?.trim() || "dist");
const INK_MIN_CHANGED_PIXELS = 120;
const HISTORY_CHURN_INTERVAL = 10;
const HISTORY_CHURN_REDO_PROBES = 3;
const CHECKPOINT_MS = 10 * 60_000;

interface HeapSample {
  readonly atMs: number;
  readonly usedBytes: number;
  readonly totalBytes: number;
  readonly embedderBytes: number;
  readonly backingStorageBytes: number;
  readonly documents: number | null;
  readonly nodes: number | null;
  readonly jsEventListeners: number | null;
}

interface GpuEvent {
  readonly atMs: number;
  readonly kind: "lost" | "uncaptured";
  readonly reason: string;
  readonly message: string;
}

interface LongTaskSample {
  readonly atMs: number;
  readonly durationMs: number;
}

interface PixelSample {
  readonly cycle: number;
  readonly atMs: number;
  readonly changedPixels: number;
  readonly brushId: string | null;
  readonly brushName: string | null;
  readonly inputMode: "mouse" | "pen" | "touch";
  readonly pointerPoints: number;
  readonly pressureMin: number;
  readonly pressureMax: number;
  readonly tiltXMin: number;
  readonly tiltXMax: number;
  readonly tiltYMin: number;
  readonly tiltYMax: number;
  readonly twistMin: number;
  readonly twistMax: number;
  readonly layerCountBefore: number | null;
  readonly layerCountAfter: number | null;
  readonly historyEntryCountBefore: number | null;
  readonly historyUndoDepthBefore: number | null;
  readonly historyEntryCount: number | null;
  readonly historyUndoDepth: number | null;
  readonly acceptedByDocument: boolean;
  readonly rejectedStrokeCount: number;
  /**
   * 커밋 분리 계측 — 에디터 셸이 이미 노출하는 히스토리 진단 속성을 획 전후로 읽는다.
   * 카운터가 평탄해도 append 자체가 일어났는지(유지 바이트·마지막 엔트리 바이트 변화),
   * 예산 퇴출이 카운터를 상쇄했는지(퇴출 단계 누계), 커밋 게이트가 오류를 띄웠는지
   * (오류 배너 원문)를 사후에 가를 수 있게 한다.
   */
  readonly historyEvictedStepsBefore: number | null;
  readonly historyEvictedStepsAfter: number | null;
  readonly historyRetainedBytesBefore: number | null;
  readonly historyRetainedBytesAfter: number | null;
  readonly historyLastEntryBytesAfter: number | null;
  /** append 총수와 복구 보관 획 수 — 카운터가 평탄한 획이 실제로는 어디로 갔는지를 가른다. */
  readonly historyTotalAppendsBefore: number | null;
  readonly historyTotalAppendsAfter: number | null;
  readonly rejectedStrokeCountBefore: number | null;
  readonly rejectedStrokeCountAfter: number | null;
  readonly commitErrorText: string | null;
  /** TOONSPECTRUM_SOAK_SAMPLE_HEAP_PER_STROKE=1 일 때만 채우는 획 직후 GC 힙(바이트). */
  readonly heapUsedBytesAfter: number | null;
}

interface SoakFailure {
  readonly atMs: number;
  readonly cycle: number;
  readonly kind: string;
  readonly detail: string;
}

function log(message: string): void {
  console.log(`[studio-five-hour-soak] ${message}`);
}

function nowMs(startedAt: number): number {
  return Date.now() - startedAt;
}

function isEraser(item: StudioBrushCatalogItem): boolean {
  return STUDIO_ERASER_BRUSH_CATALOG_ITEMS.some((entry) => entry.id === item.id);
}

const PAINT_BRUSHES = STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS.filter((item) => !isEraser(item));

function changedPixels(before: Buffer, after: Buffer): number {
  const left = decodePng(new Uint8Array(before.buffer, before.byteOffset, before.byteLength)).getRawImage();
  const right = decodePng(new Uint8Array(after.buffer, after.byteOffset, after.byteLength)).getRawImage();
  if (left.data.length !== right.data.length || left.channels !== right.channels) return -1;
  let changed = 0;
  for (let index = 0; index < left.data.length; index += left.channels) {
    if (
      Math.abs(left.data[index]! - right.data[index]!) > 10
      || Math.abs(left.data[index + 1]! - right.data[index + 1]!) > 10
      || Math.abs(left.data[index + 2]! - right.data[index + 2]!) > 10
    ) changed += 1;
  }
  return changed;
}

async function installGpuAndPerfCollector(page: Page): Promise<void> {
  await page.addInitScript(`(() => {
    window.__studioFiveHourTelemetry = { gpu: [], longTasks: [] };
    const telemetry = window.__studioFiveHourTelemetry;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration >= 50) telemetry.longTasks.push([performance.now(), entry.duration]);
        }
      });
      observer.observe({ type: "longtask", buffered: false });
    } catch {}
    try {
      const gpu = navigator.gpu;
      if (!gpu?.requestAdapter) return;
      const requestAdapter = gpu.requestAdapter.bind(gpu);
      gpu.requestAdapter = async (...args) => {
        const adapter = await requestAdapter(...args);
        if (!adapter?.requestDevice) return adapter;
        const requestDevice = adapter.requestDevice.bind(adapter);
        adapter.requestDevice = async (...deviceArgs) => {
          const device = await requestDevice(...deviceArgs);
          device?.lost?.then((info) => {
            telemetry.gpu.push([performance.now(), "lost", String(info?.reason ?? "unknown"), String(info?.message ?? "")]);
          });
          device?.addEventListener?.("uncapturederror", (event) => {
            telemetry.gpu.push([performance.now(), "uncaptured", "", String(event?.error?.message ?? "unknown GPU error")]);
          });
          return device;
        };
        return adapter;
      };
    } catch {}
  })();`);
}

async function drainGpuAndPerf(page: Page, startedAt: number): Promise<{
  gpu: GpuEvent[];
  longTasks: LongTaskSample[];
}> {
  const raw = await page.evaluate(`(() => {
    const telemetry = window.__studioFiveHourTelemetry || { gpu: [], longTasks: [] };
    const out = { gpu: telemetry.gpu.slice(), longTasks: telemetry.longTasks.slice() };
    telemetry.gpu.length = 0;
    telemetry.longTasks.length = 0;
    return out;
  })()`) as {
    gpu: Array<[number, string, string, string]>;
    longTasks: Array<[number, number]>;
  };
  const offset = nowMs(startedAt) - performance.now?.call(globalThis);
  void offset;
  return {
    gpu: raw.gpu.map(([, kind, reason, message]) => ({
      atMs: nowMs(startedAt),
      kind: kind === "uncaptured" ? "uncaptured" : "lost",
      reason,
      message,
    })),
    longTasks: raw.longTasks.map(([, durationMs]) => ({ atMs: nowMs(startedAt), durationMs })),
  };
}

async function gcHeap(cdp: CDPSession | null, startedAt: number): Promise<HeapSample | null> {
  if (!cdp) return null;
  try {
    await cdp.send("HeapProfiler.collectGarbage");
    const usage = await cdp.send("Runtime.getHeapUsage") as {
      usedSize: number;
      totalSize: number;
      embedderHeapUsedSize: number;
      backingStorageSize: number;
    };
    const dom = await cdp.send("Memory.getDOMCounters").catch(() => null) as {
      documents: number;
      nodes: number;
      jsEventListeners: number;
    } | null;
    return {
      atMs: nowMs(startedAt),
      usedBytes: usage.usedSize,
      totalBytes: usage.totalSize,
      embedderBytes: usage.embedderHeapUsedSize,
      backingStorageBytes: usage.backingStorageSize,
      documents: dom?.documents ?? null,
      nodes: dom?.nodes ?? null,
      jsEventListeners: dom?.jsEventListeners ?? null,
    };
  } catch {
    return null;
  }
}


async function closeBrushSurfaces(page: Page): Promise<boolean> {
  const floating = page.locator('[role="dialog"][data-studio-brush-floating]:visible');
  if (await floating.isVisible().catch(() => false)) {
    await floating.getByRole("button", { name: / 닫기$/u }).click({ timeout: 3_000 });
    if (!(await floating.waitFor({ state: "hidden", timeout: 3_000 })
      .then(() => true).catch(() => false))) return false;
  }
  const surfaces = [
    page.locator('[data-studio-brush-catalog-session="true"]'),
    page.locator('[data-studio-brush-library="true"]').first(),
    page.locator('[data-studio-mobile-sheet="draw"]'),
  ];
  for (const surface of surfaces) {
    if (!(await surface.isVisible().catch(() => false))) continue;
    const docked = await surface.evaluate((element) => Boolean(element.closest('[data-studio-brush-workbench-dock="true"]')))
      .catch(() => false);
    if (docked) continue;
    await page.keyboard.press("Escape").catch(() => undefined);
    const closed = await surface.waitFor({ state: "hidden", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    if (!closed) return false;
  }
  return true;
}

async function openMobileBrushLibrary(page: Page, timeoutMs = 10_000): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;
  const remaining = () => {
    const value = deadline - Date.now();
    if (value <= 0) throw new Error(`모바일 소크 브러시 열기의 ${timeoutMs}ms 예산을 초과했습니다.`);
    return value;
  };
  if (!(await closeBrushSurfaces(page))) return null;
  const dock = page.locator('[data-studio-mobile-editing-dock="true"]');
  await openMobileBrushSettings(page, dock, remaining());
  const sheet = page.locator("#studio-mobile-draw-settings");
  const opener = sheet.locator('[data-studio-open-brush-library="true"]');
  await opener.waitFor({ state: "visible", timeout: remaining() });
  await opener.click({ timeout: remaining() });
  const library = page.locator('[data-studio-brush-library="true"]').first();
  await library.waitFor({ state: "visible", timeout: remaining() });
  return library;
}

async function selectBrush(page: Page, item: StudioBrushCatalogItem): Promise<boolean> {
  const mobileDock = page.locator('[data-studio-mobile-editing-dock="true"]');
  const mobileDockVisible = await mobileDock.isVisible({ timeout: 250 }).catch(() => false);
  if (mobileDockVisible) {
    const library = await openMobileBrushLibrary(page);
    if (!library) return false;
    await library.getByRole("searchbox").fill(item.name);
    const option = library.getByRole("button", { name: `${item.name} 선택`, exact: true });
    if (!(await option.waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false))) {
      await closeBrushSurfaces(page);
      return false;
    }
    await option.scrollIntoViewIfNeeded();
    await option.click({ timeout: 5_000 });
    const deadline = Date.now() + 5_000;
    const remaining = () => {
      const value = deadline - Date.now();
      if (value <= 0) throw new Error("모바일 소크 브러시 활성 확인의 5000ms 예산을 초과했습니다.");
      return value;
    };
    // 모바일은 선택을 적용한 뒤 목록을 닫는다. 다시 열어 동일 ID의 실제 활성 상태를 읽는다.
    await library.waitFor({ state: "hidden", timeout: remaining() });
    const verification = await openMobileBrushLibrary(page, remaining());
    if (!verification) return false;
    await verification.getByRole("searchbox").fill(item.name, { timeout: remaining() });
    const selected = verification.locator(`button[data-studio-brush-select=${JSON.stringify(item.id)}]`);
    while (Date.now() < deadline) {
      const active = await selected.getAttribute("aria-pressed", { timeout: remaining() }) === "true";
      const pending = await verification.getAttribute("data-studio-brush-selection-pending", { timeout: remaining() }) === "true";
      if (active && !pending && Date.now() < deadline) return closeBrushSurfaces(page);
      await page.waitForTimeout(Math.min(50, remaining()));
    }
    return false;
  }

  if (!(await closeBrushSurfaces(page))) return false;
  if (!(await ensurePenReady(page))) return false;
  const dockedLibrary = page.locator('[data-studio-brush-workbench-dock="true"] [data-studio-brush-library="true"]').first();
  if (!(await dockedLibrary.isVisible({ timeout: 500 }).catch(() => false))) {
    const toolbar = page.locator('[data-studio-draw-options="true"]');
    const pill = toolbar.locator('[data-studio-brush-active-pill="true"]');
    if (!(await pill.isVisible().catch(() => false))) return false;
    await pill.click({ timeout: 5_000 });
    if (!(await dockedLibrary.waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true).catch(() => false))) return false;
  }
  // 현재 PC 진입점은 먼저 도킹 라이브러리를 연다. 실제 선택과 비동기 적용을 모두 확인한다.
  await dockedLibrary.getByRole("searchbox").fill(item.name);
  const option = dockedLibrary.getByRole("button", { name: `${item.name} 선택`, exact: true });
  if (!(await option.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false))) return false;
  await option.scrollIntoViewIfNeeded();
  await option.click({ timeout: 5_000 });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const active = await option.getAttribute("aria-pressed") === "true";
    const pending = await dockedLibrary.getAttribute("data-studio-brush-selection-pending") === "true";
    if (active && !pending) return true;
    await page.waitForTimeout(50);
  }
  return false;
}

async function ensurePenReady(page: Page, timeoutMs = 4_000): Promise<boolean> {
  const mobileDock = page.locator('[data-studio-mobile-editing-dock="true"]');
  if (await mobileDock.isVisible({ timeout: 250 }).catch(() => false)) {
    const deadline = Date.now() + timeoutMs;
    const remaining = () => {
      const value = deadline - Date.now();
      if (value <= 0) throw new Error("모바일 소크의 펜 준비 예산을 초과했습니다.");
      return value;
    };
    const pen = mobileDock.getByRole("button", { name: /^(?:펜|Pen)$/u });
    if (!(await pen.isVisible().catch(() => false))) return false;
    if (await pen.getAttribute("aria-pressed", { timeout: remaining() }) !== "true") await pen.click({ timeout: remaining() });
    await page.waitForTimeout(Math.min(80, remaining()));
    return await pen.getAttribute("aria-pressed", { timeout: remaining() }) === "true" && Date.now() < deadline;
  }

  return ensureStudioSoakDesktopPen(page, timeoutMs);
}

async function acknowledgeStudioBetaNoticeIfPresent(page: Page): Promise<boolean> {
  const notice = page.locator('[data-studio-beta-notice="true"]');
  const visible = await notice
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!visible) return false;

  const action = notice.locator(
    '[data-studio-beta-notice-acknowledge="true"]',
  );
  await action.click({ timeout: 10_000 });
  await notice.waitFor({ state: "hidden", timeout: 10_000 });
  return true;
}

async function waitForPenReady(page: Page, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + Math.max(1_000, timeoutMs);
  do {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    if (await ensurePenReady(page, remaining) && Date.now() < deadline) return true;
    await page.waitForTimeout(Math.max(0, Math.min(250, deadline - Date.now())));
  } while (Date.now() < deadline);
  return false;
}

async function readStudioAvailableLayerCount(page: Page, timeoutMs = 8_000): Promise<number | null> {
  return readStudioSoakLayerCount(page, timeoutMs);
}

async function readStudioHistoryDepth(page: Page, timeoutMs = 1_000): Promise<{
  entryCount: number | null;
  undoDepth: number | null;
}> {
  const editor = page.locator('[data-studio-history-entry-count]').first();
  const [entryRaw, undoRaw] = await Promise.all([
    editor.getAttribute("data-studio-history-entry-count", { timeout: timeoutMs }).catch(() => null),
    editor.getAttribute("data-studio-history-undo-depth", { timeout: timeoutMs }).catch(() => null),
  ]);
  const entryCount = entryRaw === null ? null : Number(entryRaw);
  const undoDepth = undoRaw === null ? null : Number(undoRaw);
  return {
    entryCount: Number.isFinite(entryCount) && entryCount! >= 0 ? entryCount : null,
    undoDepth: Number.isFinite(undoDepth) && undoDepth! >= 0 ? undoDepth : null,
  };
}

async function waitForStudioLayerCount(
  page: Page,
  predicate: (count: number) => boolean,
  timeoutMs = 5_000,
): Promise<number | null> {
  return waitForStudioSoakLayerCount(page, predicate, timeoutMs);
}

/** 에디터 셸이 노출하는 히스토리 유지 진단(퇴출 누계·계량 유지 바이트·마지막 엔트리 바이트·append 총수·복구 보관 획 수). */
async function readStudioHistoryDiagnostics(page: Page): Promise<{
  evictedSteps: number | null;
  retainedBytes: number | null;
  lastEntryBytes: number | null;
  totalAppends: number | null;
  rejectedStrokeCount: number | null;
}> {
  const editor = page.locator("[data-studio-editor]").first();
  const read = async (attribute: string): Promise<number | null> => {
    const raw = await editor.getAttribute(attribute).catch(() => null);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  const [evictedSteps, retainedBytes, lastEntryBytes, totalAppends, rejectedStrokeCount] = await Promise.all([
    read("data-studio-history-budget-evicted-steps"),
    read("data-studio-history-last-measured-retained-bytes"),
    read("data-studio-history-last-measured-entry-bytes"),
    read("data-studio-history-total-appends"),
    read("data-studio-rejected-stroke-count"),
  ]);
  return { evictedSteps, retainedBytes, lastEntryBytes, totalAppends, rejectedStrokeCount };
}

/** 커밋 게이트가 띄운 오류 배너 원문. 상태 레일이 접힌 밀도에서는 없을 수 있어 best-effort로 읽는다. */
async function readStudioVisibleCommitError(page: Page): Promise<string | null> {
  const alert = page.locator('div[role="alert"]:has([data-studio-status-error-dismiss])').first();
  const text = await alert.innerText({ timeout: 500 }).catch(() => null);
  if (text === null) return null;
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized.length > 0 ? normalized.slice(0, 300) : null;
}

/** count DOM의 마운트 수명에 의존하지 않고 실제 레이어 UI에서 baseline을 읽는다. */
async function ensureStudioLayerNavigatorCount(page: Page, timeoutMs = 8_000): Promise<number | null> {
  return readStudioSoakLayerCount(page, timeoutMs);
}

async function waitForStudioDocumentAdvance(
  page: Page,
  input: {
    layerCountBefore: number | null;
    historyUndoDepthBefore: number | null;
  },
  timeoutMs = 4_500,
): Promise<{
  layerCountAfter: number | null;
  historyEntryCount: number | null;
  historyUndoDepth: number | null;
  accepted: boolean;
}> {
  return withStudioSoakLayerNavigator(page, timeoutMs, async (readLayerCount, deadline) => {
    let layerCountAfter = await readLayerCount();
    let history = await readStudioHistoryDepth(page, Math.max(1, deadline - Date.now()));
    do {
      const acceptedByLayer = input.layerCountBefore !== null
        && layerCountAfter !== null
        && layerCountAfter > input.layerCountBefore;
      const acceptedByHistory = input.historyUndoDepthBefore !== null
        && history.undoDepth !== null
        && history.undoDepth > input.historyUndoDepthBefore;
      if ((acceptedByLayer || acceptedByHistory) && Date.now() < deadline) {
        return { layerCountAfter, historyEntryCount: history.entryCount, historyUndoDepth: history.undoDepth, accepted: true };
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await page.waitForTimeout(Math.min(75, remaining));
      if (Date.now() >= deadline) break;
      layerCountAfter = await readLayerCount();
      history = await readStudioHistoryDepth(page, Math.max(1, deadline - Date.now()));
    } while (Date.now() < deadline);
    // 기한 안의 마지막 실측은 실패 진단에만 남긴다. 과거 count로 성공을 대신하지 않는다.
    return { layerCountAfter, historyEntryCount: history.entryCount, historyUndoDepth: history.undoDepth, accepted: false };
  });
}

async function clickStudioHistoryAction(
  page: Page,
  action: "undo" | "redo",
): Promise<boolean> {
  const button = page.locator(
    `[data-studio-primary-action="${action}"]:visible, [data-studio-command-bar-command="${action}"]:visible`,
  ).first();
  if (!(await button.isVisible({ timeout: 1_000 }).catch(() => false))) return false;
  if (await button.isDisabled().catch(() => true)) return false;
  await button.click({ timeout: 5_000 });
  return true;
}

async function exerciseBoundedHistoryChurn(
  page: Page,
  strokeCount: number,
  baselineLayerCount: number | null,
): Promise<number> {
  const undoCount = Math.max(0, Math.floor(strokeCount));
  if (undoCount === 0) return 0;
  if (baselineLayerCount === null) {
    throw new Error("Layer navigator count is unavailable; cannot prove bounded history churn.");
  }

  // Some material brushes keep exact pixels on a retained surface before their canonical layer
  // settles, so "N strokes == N layer rows" is not a valid invariant. Exercise one Undo per accepted
  // stroke, then require the canonical document to return to the pre-block baseline.
  const peak = await readStudioAvailableLayerCount(page);
  if (peak === null || peak < baselineLayerCount) {
    throw new Error(`Layer count moved below bounded baseline before history churn: ${peak ?? "n/a"}.`);
  }

  let actions = 0;
  for (let index = 0; index < undoCount; index += 1) {
    if (!(await clickStudioHistoryAction(page, "undo"))) {
      throw new Error(`Undo became unavailable after ${actions} of ${undoCount} bounded actions.`);
    }
    actions += 1;
    await page.waitForTimeout(80);
  }

  const settledAfterUndo = await waitForStudioLayerCount(
    page,
    (count) => count === baselineLayerCount,
  );
  if (settledAfterUndo !== baselineLayerCount) {
    throw new Error(
      `Bounded undo ended at ${settledAfterUndo ?? "n/a"} layers instead of ${baselineLayerCount}.`,
    );
  }

  const redoCount = Math.min(HISTORY_CHURN_REDO_PROBES, undoCount);
  let completedRedo = 0;
  for (let index = 0; index < redoCount; index += 1) {
    if (!(await clickStudioHistoryAction(page, "redo"))) {
      throw new Error(`Redo became unavailable after ${completedRedo} of ${redoCount} probes.`);
    }
    completedRedo += 1;
    actions += 1;
    await page.waitForTimeout(80);
  }
  for (let index = 0; index < completedRedo; index += 1) {
    if (!(await clickStudioHistoryAction(page, "undo"))) {
      throw new Error("Undo became unavailable while returning redo probe to baseline.");
    }
    actions += 1;
    await page.waitForTimeout(80);
  }

  const settled = await waitForStudioLayerCount(page, (count) => count === baselineLayerCount);
  if (settled !== baselineLayerCount) {
    throw new Error(`Bounded history churn ended at ${settled ?? "n/a"} layers instead of ${baselineLayerCount}.`);
  }
  return actions;
}

async function drawEvidenceStroke(
  page: Page,
  cdp: CDPSession | null,
  cycle: number,
  inputMode: "mouse" | "pen" | "touch",
): Promise<{
  changed: number;
  shot: Buffer;
  pointer: {
    mode: "mouse" | "pen" | "touch";
    points: number;
    pressureMin: number;
    pressureMax: number;
    tiltXMin: number;
    tiltXMax: number;
    tiltYMin: number;
    tiltYMax: number;
    twistMin: number;
    twistMax: number;
  };
  layerCountBefore: number | null;
  layerCountAfter: number | null;
  historyEntryCountBefore: number | null;
  historyUndoDepthBefore: number | null;
  historyEntryCount: number | null;
  historyUndoDepth: number | null;
  acceptedByDocument: boolean;
  rejectedStrokeCount: number;
  historyEvictedStepsBefore: number | null;
  historyEvictedStepsAfter: number | null;
  historyRetainedBytesBefore: number | null;
  historyRetainedBytesAfter: number | null;
  historyLastEntryBytesAfter: number | null;
  historyTotalAppendsBefore: number | null;
  historyTotalAppendsAfter: number | null;
  rejectedStrokeCountBefore: number | null;
  rejectedStrokeCountAfter: number | null;
  commitErrorText: string | null;
  heapUsedBytesAfter: number | null;
}> {
  if (!(await closeBrushSurfaces(page))) {
    throw new Error("brush surfaces stayed open before drawing evidence");
  }
  const layerCountBefore = await readStudioAvailableLayerCount(page);
  const historyBefore = await readStudioHistoryDepth(page);
  const diagnosticsBefore = await readStudioHistoryDiagnostics(page);
  await page.waitForTimeout(80);
  const { box, points } = await prepareStudioSoakPointerRoute(page, cycle);
  const before = await page.screenshot({ clip: box, animations: "disabled" });
  await assertStudioSoakPointerRoute(page, points);
  const pointer = await dispatchStudioPointerStroke({
    page,
    cdp,
    mode: inputMode,
    points,
    stepDelayMs: inputMode === "mouse" ? 0 : 2,
  });
  await page.waitForTimeout(500);
  const advance = await waitForStudioDocumentAdvance(page, {
    layerCountBefore,
    historyUndoDepthBefore: historyBefore.undoDepth,
  });
  const rejectedStrokeCount = await page.locator("[data-studio-rejected-stroke-notice]").count();
  const diagnosticsAfter = await readStudioHistoryDiagnostics(page);
  const commitErrorText = await readStudioVisibleCommitError(page);
  const heapAfter = SAMPLE_HEAP_PER_STROKE ? await gcHeap(cdp, startedAt) : null;
  const after = await page.screenshot({ clip: box, animations: "disabled" });
  return {
    changed: changedPixels(before, after),
    shot: after,
    pointer,
    layerCountBefore,
    layerCountAfter: advance.layerCountAfter,
    historyEntryCountBefore: historyBefore.entryCount,
    historyUndoDepthBefore: historyBefore.undoDepth,
    historyEntryCount: advance.historyEntryCount,
    historyUndoDepth: advance.historyUndoDepth,
    acceptedByDocument: advance.accepted,
    rejectedStrokeCount,
    historyEvictedStepsBefore: diagnosticsBefore.evictedSteps,
    historyEvictedStepsAfter: diagnosticsAfter.evictedSteps,
    historyRetainedBytesBefore: diagnosticsBefore.retainedBytes,
    historyRetainedBytesAfter: diagnosticsAfter.retainedBytes,
    historyLastEntryBytesAfter: diagnosticsAfter.lastEntryBytes,
    historyTotalAppendsBefore: diagnosticsBefore.totalAppends,
    historyTotalAppendsAfter: diagnosticsAfter.totalAppends,
    rejectedStrokeCountBefore: diagnosticsBefore.rejectedStrokeCount,
    rejectedStrokeCountAfter: diagnosticsAfter.rejectedStrokeCount,
    commitErrorText,
    heapUsedBytesAfter: heapAfter?.usedBytes ?? null,
  };
}

async function spawnPreview(): Promise<{ origin: string; child: ReturnType<typeof spawnVitePreview> | null }> {
  const external = process.env.TOONSPECTRUM_VERIFY_ORIGIN?.trim();
  if (external) return { origin: external.replace(/\/$/u, ""), child: null };
  const port = await findFreePort({ unavailableMessage: "could not allocate five-hour soak preview port" });
  const child = spawnVitePreview({ port, runner: "pnpm-exec", outDir: BUILD_DIRECTORY });
  const origin = `http://127.0.0.1:${port}`;
  await waitForServer(origin, { timeoutMs: 30_000, notReadyMessage: "five-hour soak preview did not become ready" });
  return { origin, child };
}

mkdirSync(OUT, { recursive: true });
const startedAt = Date.now();
let sessionStartedAt: number | null = null;
let sessionEndedAt: number | null = null;
const profile = PROFILE_ID === "desktop"
  ? null
  : STUDIO_INAPP_PROFILES.find((candidate) => candidate.id === PROFILE_ID) ?? null;
if (PROFILE_ID !== "desktop" && !profile) throw new Error(`unknown in-app profile: ${PROFILE_ID}`);
const inputMode = resolveStudioPointerInputMode(INPUT_MODE_REQUEST, { mobile: profile !== null });

const report = {
  startedAt: new Date(startedAt).toISOString(),
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  buildLabel: process.env.TOONSPECTRUM_SOAK_BUILD_LABEL?.trim() || null,
  previewIndexSha256: existsSync(join(BUILD_DIRECTORY, "index.html"))
    ? createHash("sha256").update(readFileSync(join(BUILD_DIRECTORY, "index.html"))).digest("hex")
    : null,
  renderEnvironment: "chromium-swiftshader",
  requestedMinutes: MINUTES,
  brushCycles: BRUSH_CYCLES,
  stopOnFailure: STOP_ON_FAILURE,
  sampleHeapPerStroke: SAMPLE_HEAP_PER_STROKE,
  actionDurationMs: 0,
  scheduledRestMs: 0,
  profile: PROFILE_ID,
  webgpuRequested: WEBGPU,
  pointerInputRequested: INPUT_MODE_REQUEST,
  pointerInputResolved: inputMode,
  pointerInputEvidence: inputMode === "pen"
    ? "synthetic-cdp-pen-pressure-tilt-twist"
    : inputMode === "touch" ? "synthetic-cdp-touch-contact" : "playwright-mouse",
  physicalDeviceCertified: false,
  origin: "",
  cycles: 0,
  strokes: 0,
  brushSwitches: 0,
  historyActions: 0,
  visuallyCoveredStrokes: 0,
  pixelSamples: [] as PixelSample[],
  heapSamples: [] as HeapSample[],
  gpuEvents: [] as GpuEvent[],
  longTasks: [] as LongTaskSample[],
  runtimeErrors: [] as StudioInAppRuntimeError[],
  environmentNoise: [] as StudioInAppRuntimeError[],
  failures: [] as SoakFailure[],
  checkpoints: [] as Array<{
    atMs: number;
    cycle: number;
    heapBytes: number | null;
    heapSlopeBytesPerHour: number | null;
    domNodes: number | null;
    eventListeners: number | null;
    failures: number;
  }>,
};

const writeReport = (): void => {
  const coveredBrushIds = new Set(report.pixelSamples.map((sample) => sample.brushId).filter(Boolean));
  const temporaryPath = join(OUT, "report.json.tmp");
  writeFileSync(temporaryPath, JSON.stringify({
    ...report,
    elapsedMinutes: Number((nowMs(startedAt) / 60_000).toFixed(2)),
    sessionStartedAt: sessionStartedAt === null ? null : new Date(sessionStartedAt).toISOString(),
    sessionEndedAt: sessionEndedAt === null ? null : new Date(sessionEndedAt).toISOString(),
    sessionDurationMs: sessionStartedAt === null ? 0 : (sessionEndedAt ?? Date.now()) - sessionStartedAt,
    paintBrushCoverage: {
      total: PAINT_BRUSHES.length,
      exercised: [...coveredBrushIds],
      pending: PAINT_BRUSHES.filter((brush) => !coveredBrushIds.has(brush.id)).map((brush) => brush.id),
      erasersIncluded: false,
    },
  }, null, 2));
  renameSync(temporaryPath, join(OUT, "report.json"));
};

let browser: Browser | null = null;
let preview: Awaited<ReturnType<typeof spawnPreview>> | null = null;
let cdp: CDPSession | null = null;
let page: Page | null = null;
let baselineHeap: HeapSample | null = null;
let heapGrowthFailureRecorded = false;
let heapSlopeFailureRecorded = false;
let consecutiveNoInk = 0;
let consecutivePenBlocked = 0;
let strokesSinceHistoryChurn = 0;
let boundedLayerBaseline: number | null = null;
let nextCheckpoint = CHECKPOINT_MS;
let activeBrush: StudioBrushCatalogItem | null = null;

try {
  preview = await spawnPreview();
  report.origin = preview.origin;
  const args = ["--disable-dev-shm-usage", "--enable-unsafe-swiftshader", "--use-gl=swiftshader"];
  if (WEBGPU) args.push("--enable-unsafe-webgpu");
  browser = await chromium.launch({ args });
  const context = await browser.newContext({
    locale: "ko-KR",
    viewport: profile ? { width: profile.width, height: profile.height } : { width: 1440, height: 1100 },
    deviceScaleFactor: profile ? 2 : 1,
    isMobile: profile !== null,
    hasTouch: profile !== null,
    ...(profile ? { userAgent: profile.userAgent } : {}),
  });
  page = await context.newPage();
  await installStudioInAppGuestBoundary(page);
  await installStudioInAppFirstRunState(page);
  await installGpuAndPerfCollector(page);
  const errors = await collectStudioInAppRuntimeErrors(page);
  cdp = await context.newCDPSession(page).catch(() => null);
  if (inputMode !== "mouse" && !cdp) {
    throw new Error(`${inputMode} soak input requires Chromium CDP; refusing a mouse downgrade.`);
  }
  await page.goto(`${preview.origin}/studio/canvas`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await acknowledgeStudioBetaNoticeIfPresent(page);
  await page.locator('[data-studio-editor="true"]').waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(3_000);
  const canvasWelcome = page.locator('[data-studio-cinematic-canvas-welcome="true"]');
  if (await canvasWelcome.isVisible()) {
    await canvasWelcome.getByRole("button", { name: "시작 안내 닫기", exact: true }).click();
    await canvasWelcome.waitFor({ state: "hidden" });
  }
  if (!(await waitForPenReady(page))) {
    throw new Error("Studio pen tool did not become ready during the bounded preflight window.");
  }
  boundedLayerBaseline = await ensureStudioLayerNavigatorCount(page);
  if (boundedLayerBaseline === null) {
    throw new Error("Studio layer navigator count is unavailable during bounded soak preflight.");
  }

  log(`${PROFILE_ID} · ${MINUTES} min · input=${inputMode} · webgpu=${WEBGPU ? "on" : "off"} · ${preview.origin}`);

  // 준비·빌드·서버 대기 시간은 실제 편집 세션의 최소 시간에 포함하지 않는다.
  sessionStartedAt = Date.now();
  const deadline = sessionStartedAt + MINUTES * 60_000;
  writeReport();
  while (Date.now() < deadline) {
    const cycleStarted = Date.now();
    report.cycles += 1;
    const cycle = report.cycles;
    errors.setStep(`cycle-${cycle}`);

    try {
      const penReady = await ensurePenReady(page);
      consecutivePenBlocked = penReady ? 0 : consecutivePenBlocked + 1;
      if (!penReady) {
        report.failures.push({
          atMs: nowMs(startedAt), cycle, kind: "pen-blocked",
          detail: `Pen could not become active (${consecutivePenBlocked} consecutive cycles)`,
        });
      }

      if (penReady && (cycle - 1) % BRUSH_CYCLES === 0) {
        activeBrush = FORCED_BRUSH_ID
          ? PAINT_BRUSHES.find((brush) => brush.id === FORCED_BRUSH_ID) ?? null
          : PAINT_BRUSHES[Math.floor((cycle - 1) / BRUSH_CYCLES) % PAINT_BRUSHES.length] ?? null;
        if (FORCED_BRUSH_ID && !activeBrush) {
          throw new Error(`Unknown forced soak brush: ${FORCED_BRUSH_ID}`);
        }
        if (activeBrush && await selectBrush(page, activeBrush)) report.brushSwitches += 1;
        else if (activeBrush) {
          const failedBrush = activeBrush;
          activeBrush = null;
          throw new Error(`브러시 선택 실패: ${failedBrush.id} (${failedBrush.name}). 실제 선택되지 않은 브러시를 검증한 것으로 기록하지 않습니다.`);
        }
      }

      if (penReady) {
        const evidence = await drawEvidenceStroke(page, cdp, cycle, inputMode);
        report.strokes += 1;
        report.pixelSamples.push({
          cycle,
          atMs: nowMs(startedAt),
          changedPixels: evidence.changed,
          brushId: activeBrush?.id ?? null,
          brushName: activeBrush?.name ?? null,
          inputMode: evidence.pointer.mode,
          pointerPoints: evidence.pointer.points,
          pressureMin: evidence.pointer.pressureMin,
          pressureMax: evidence.pointer.pressureMax,
          tiltXMin: evidence.pointer.tiltXMin,
          tiltXMax: evidence.pointer.tiltXMax,
          tiltYMin: evidence.pointer.tiltYMin,
          tiltYMax: evidence.pointer.tiltYMax,
          twistMin: evidence.pointer.twistMin,
          twistMax: evidence.pointer.twistMax,
          layerCountBefore: evidence.layerCountBefore,
          layerCountAfter: evidence.layerCountAfter,
          historyEntryCountBefore: evidence.historyEntryCountBefore,
          historyUndoDepthBefore: evidence.historyUndoDepthBefore,
          historyEntryCount: evidence.historyEntryCount,
          historyUndoDepth: evidence.historyUndoDepth,
          acceptedByDocument: evidence.acceptedByDocument,
          rejectedStrokeCount: evidence.rejectedStrokeCount,
          historyEvictedStepsBefore: evidence.historyEvictedStepsBefore,
          historyEvictedStepsAfter: evidence.historyEvictedStepsAfter,
          historyRetainedBytesBefore: evidence.historyRetainedBytesBefore,
          historyRetainedBytesAfter: evidence.historyRetainedBytesAfter,
          historyLastEntryBytesAfter: evidence.historyLastEntryBytesAfter,
          historyTotalAppendsBefore: evidence.historyTotalAppendsBefore,
          historyTotalAppendsAfter: evidence.historyTotalAppendsAfter,
          rejectedStrokeCountBefore: evidence.rejectedStrokeCountBefore,
          rejectedStrokeCountAfter: evidence.rejectedStrokeCountAfter,
          commitErrorText: evidence.commitErrorText,
          heapUsedBytesAfter: evidence.heapUsedBytesAfter,
        });
        if (evidence.acceptedByDocument) strokesSinceHistoryChurn += 1;
        else report.failures.push({
          atMs: nowMs(startedAt),
          cycle,
          kind: "stroke-not-committed",
          detail: `Pointer input did not advance layer/history authority (history ${evidence.historyUndoDepthBefore ?? "n/a"}→${evidence.historyUndoDepth ?? "n/a"}, layers ${evidence.layerCountBefore ?? "n/a"}→${evidence.layerCountAfter ?? "n/a"}, rejected=${evidence.rejectedStrokeCount}).`,
        });
        const acceptedByLayer = evidence.layerCountBefore !== null
          && evidence.layerCountAfter !== null
          && evidence.layerCountAfter > evidence.layerCountBefore;
        const visuallyChanged = evidence.changed >= INK_MIN_CHANGED_PIXELS;
        consecutiveNoInk = visuallyChanged || acceptedByLayer ? 0 : consecutiveNoInk + 1;
        if (!visuallyChanged && acceptedByLayer) {
          report.visuallyCoveredStrokes += 1;
        } else if (!visuallyChanged) {
          report.failures.push({
            atMs: nowMs(startedAt), cycle, kind: "no-ink",
            detail: `stroke changed ${evidence.changed} px and layer count did not advance (${consecutiveNoInk} consecutive; min ${INK_MIN_CHANGED_PIXELS})`,
          });
          if (evidence.shot.byteLength > 0) {
            writeFileSync(join(OUT, `no-ink-cycle-${cycle}.png`), evidence.shot);
          }
        }
      }

      if (strokesSinceHistoryChurn >= HISTORY_CHURN_INTERVAL) {
        // 실행 중 기본 탭이 바뀌어 내비게이터가 내려갔으면 churn 판정 전에 다시 마운트한다.
        await ensureStudioLayerNavigatorCount(page);
        report.historyActions += await exerciseBoundedHistoryChurn(
          page,
          strokesSinceHistoryChurn,
          boundedLayerBaseline,
        );
        strokesSinceHistoryChurn = 0;
      }
    } catch (error) {
      report.failures.push({
        atMs: nowMs(startedAt), cycle, kind: "harness-or-product-action",
        detail: String(error instanceof Error ? error.stack ?? error.message : error).slice(0, 800),
      });
      await page.screenshot({ path: join(OUT, `action-error-cycle-${cycle}.png`) }).catch(() => undefined);
    }

    const runtime = errors.drain();
    for (const error of runtime) {
      if (isExpectedLocalPreviewRuntimeNoise(error, {
        origin: preview.origin,
        spawnedPreview: preview.child !== null,
      })) {
        report.environmentNoise.push(error);
        continue;
      }
      report.runtimeErrors.push(error);
      report.failures.push({
        atMs: nowMs(startedAt), cycle, kind: `runtime-${error.channel}`, detail: `${error.step}: ${error.text}`,
      });
    }

    const telemetry = await drainGpuAndPerf(page, startedAt).catch(() => ({ gpu: [], longTasks: [] }));
    report.gpuEvents.push(...telemetry.gpu);
    report.longTasks.push(...telemetry.longTasks);
    for (const event of telemetry.gpu) {
      const benignDestroy = event.kind === "lost" && event.reason === "destroyed";
      if (!benignDestroy) report.failures.push({
        atMs: event.atMs, cycle, kind: `gpu-${event.kind}`,
        detail: `${event.reason}: ${event.message}`,
      });
    }

    if (cycle === 1 || nowMs(startedAt) >= nextCheckpoint) {
      const heap = await gcHeap(cdp, startedAt);
      if (heap) {
        report.heapSamples.push(heap);
        if (!baselineHeap && cycle > 1) baselineHeap = heap;
        if (baselineHeap) {
          const assessment = evaluateStudioSoakHeapGrowth(
            report.heapSamples,
            baselineHeap,
          );
          if (assessment?.absoluteExceeded && !heapGrowthFailureRecorded) {
            heapGrowthFailureRecorded = true;
            report.failures.push({
              atMs: heap.atMs,
              cycle,
              kind: "heap-growth",
              detail: `GC heap grew ${Math.round(assessment.growthBytes / 1048576)} MiB from baseline; allowance ${Math.round(assessment.allowanceBytes / 1048576)} MiB`,
            });
          }
          if (assessment?.slopeExceeded && !heapSlopeFailureRecorded) {
            heapSlopeFailureRecorded = true;
            report.failures.push({
              atMs: heap.atMs,
              cycle,
              kind: "heap-growth-slope",
              detail: `GC heap retained-growth slope ${Math.round(assessment.slopeBytesPerHour / 1048576)} MiB/h exceeds ${Math.round(STUDIO_SOAK_HEAP_MAX_SLOPE_BYTES_PER_HOUR / 1048576)} MiB/h`,
            });
          }
        }
      }
      report.checkpoints.push(createStudioSoakCheckpoint({
        atMs: nowMs(startedAt),
        cycle,
        heap,
        heapSamples: report.heapSamples,
        failures: report.failures.length,
      }));
      await page.screenshot({ path: join(OUT, `checkpoint-${Math.round(nowMs(startedAt) / 60000)}m.png`) }).catch(() => undefined);
      writeReport();
      nextCheckpoint = (Math.floor(nowMs(startedAt) / CHECKPOINT_MS) + 1) * CHECKPOINT_MS;
      log(`checkpoint ${Math.round(nowMs(startedAt) / 60000)}m · cycle ${cycle} · failures ${report.failures.length} · heap ${heap ? Math.round(heap.usedBytes / 1048576) + " MiB" : "n/a"}`);
    }

    if (consecutivePenBlocked >= 3 || consecutiveNoInk >= 3) {
      log(`critical liveness regression persists at cycle ${cycle}; continuing soak to collect accumulation evidence`);
    }

    report.actionDurationMs += Date.now() - cycleStarted;
    writeReport();
    if (STOP_ON_FAILURE && report.failures.length > 0) {
      log("실패를 기록했습니다. 원인 수정과 재검증을 위해 장시간 실행을 중단합니다.");
      break;
    }
    const rest = Math.min(deadline - Date.now(), CYCLE_TARGET_MS - (Date.now() - cycleStarted));
    if (rest > 0) {
      const restStartedAt = Date.now();
      await page.waitForTimeout(rest);
      report.scheduledRestMs += Date.now() - restStartedAt;
    }
  }
} finally {
  sessionEndedAt = sessionStartedAt === null ? null : Date.now();
  if (page) {
    if (strokesSinceHistoryChurn > 0) {
      try {
        await ensureStudioLayerNavigatorCount(page);
        report.historyActions += await exerciseBoundedHistoryChurn(
          page,
          strokesSinceHistoryChurn,
          boundedLayerBaseline,
        );
        strokesSinceHistoryChurn = 0;
      } catch (error) {
        report.failures.push({
          atMs: nowMs(startedAt),
          cycle: report.cycles,
          kind: "final-history-churn",
          detail: String(error instanceof Error ? error.message : error).slice(0, 800),
        });
      }
    }
    const finalHeap = await gcHeap(cdp, startedAt);
    if (finalHeap) report.heapSamples.push(finalHeap);
    await page.screenshot({ path: join(OUT, "final.png") }).catch(() => undefined);
  }
  writeReport();
  await browser?.close().catch(() => undefined);
  if (preview?.child) await stopChildProcess(preview.child).catch(() => undefined);
}

const meaningfulFailures = report.failures.filter((failure) => {
  if (failure.kind === "no-ink") {
    const sample = report.pixelSamples.find((row) => row.cycle === failure.cycle);
    return (sample?.changedPixels ?? -1) < INK_MIN_CHANGED_PIXELS;
  }
  return true;
});
const worstLongTask = Math.max(0, ...report.longTasks.map((entry) => entry.durationMs));
const initialHeap = report.heapSamples[0]?.usedBytes ?? null;
const finalHeap = report.heapSamples.at(-1)?.usedBytes ?? null;
log(`${report.cycles} cycles · ${report.strokes} strokes · ${report.brushSwitches} brush switches · ${report.historyActions} history actions · ${report.visuallyCoveredStrokes} visually-covered strokes`);
log(`${report.runtimeErrors.length} runtime errors · ${report.environmentNoise.length} local-preview environment noises · ${report.gpuEvents.length} GPU events · ${report.longTasks.length} long tasks (worst ${Math.round(worstLongTask)} ms)`);
if (initialHeap !== null && finalHeap !== null) {
  log(`GC heap ${Math.round(initialHeap / 1048576)} MiB → ${Math.round(finalHeap / 1048576)} MiB`);
}
log(`${meaningfulFailures.length} recorded failures · report ${join(OUT, "report.json")}`);
if (meaningfulFailures.length > 0) process.exitCode = 1;
