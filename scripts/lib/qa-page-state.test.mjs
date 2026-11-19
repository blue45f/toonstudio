import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";

import { classifyQaPageState, qaModuleFailures, recordQaScriptResponse, settleQaPage, snapshotQaDiagnostics } from "./qa-page-state.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const skeleton = { ready: true, bodyTextLength: 0, bodyPreview: "", visualCount: 0, loadingLike: true };
const content = { ready: true, bodyTextLength: 20, bodyPreview: "작업공간", visualCount: 1, loadingLike: false };
const htmlChunk = { url: "https://example.test/assets/old.js", status: 200, contentType: "text/html; charset=utf-8", fromServiceWorker: true };

function clock() {
  let elapsed = 0;
  return { now: () => elapsed, wait: async (ms) => { elapsed += ms; } };
}

test("220ms 이후에도 남은 스켈레톤을 정상 화면이 나타날 때까지 다시 측정한다", async () => {
  const time = clock();
  const result = await settleQaPage({
    ...time, timeoutMs: 1_000,
    inspect: async () => time.now() < 600 ? skeleton : content,
  });
  assert.equal(result.state, "ready");
  assert.equal(result.elapsedMs, 600);
  assert.equal(result.attempts, 4);
  assert.equal(result.dom, content);
});

test("영구 스켈레톤은 성공이나 빈 화면이 아닌 loading-timeout으로 남긴다", async () => {
  const result = await settleQaPage({ ...clock(), timeoutMs: 450, inspect: async () => skeleton });
  assert.equal(result.state, "loading-timeout");
  assert.equal(result.elapsedMs, 450);
  assert.equal(result.timedOut, true);
});

test("sr-only 제목이 있는 실제 route fallback은 기다리고 선택 패널의 로딩은 차단하지 않는다", async () => {
  const routeFallback = { ...content, bodyPreview: "Studio 작업 영역을 준비합니다", loadingLike: true, loadingOnly: false, routeLoading: true };
  const result = await settleQaPage({ ...clock(), timeoutMs: 400, inspect: async () => routeFallback });
  assert.equal(result.state, "loading-timeout");
  assert.equal(classifyQaPageState({ dom: { ...routeFallback, routeLoading: false } }), "ready");
});

test("로딩 문구와 SVG 스피너만 남은 화면도 성공으로 처리하지 않는다", () => {
  assert.equal(classifyQaPageState({ dom: { ...skeleton, bodyTextLength: 10, bodyPreview: "Loading..." } }), "loading");
  assert.equal(classifyQaPageState({ dom: { ...skeleton, visualCount: 1, loadingOnly: true } }), "loading");
});

test("검사 예외는 DOM 수치를 조작하지 않고 inspection-error로 남긴다", async () => {
  const result = await settleQaPage({ ...clock(), inspect: async () => { throw new Error("execution context destroyed"); } });
  assert.equal(result.state, "inspection-error");
  assert.equal(result.dom, null);
  assert.match(result.inspectError, /execution context destroyed/u);
  assert.equal(result.attempts, 1);
});

test("응답하지 않는 DOM 검사도 전체 제한 시간에 끝나며 검사 타이머를 정리한다", async () => {
  let elapsed = 0;
  let scheduledDelay;
  let pending = false;
  const timer = {};
  const result = await settleQaPage({
    timeoutMs: 25, now: () => elapsed, inspect: () => new Promise(() => {}),
    setTimer(callback, delay) {
      scheduledDelay = delay;
      pending = true;
      queueMicrotask(() => { elapsed += delay; callback(); });
      return timer;
    },
    clearTimer(handle) { assert.equal(handle, timer); pending = false; },
  });
  assert.equal(scheduledDelay, 25);
  assert.equal(result.elapsedMs, 25);
  assert.equal(result.state, "inspection-error");
  assert.equal(result.timedOut, true);
  assert.match(result.inspectError, /DOM 검사 제한 시간 25ms 초과/u);
  assert.equal(pending, false);
});

test("마지막 타이머가 일찍 깨어나도 새 검사를 예약하지 않고 마지막 DOM과 최신 오류를 분류한다", async () => {
  for (const fatalAtDeadline of [false, true]) {
    let elapsed = 0;
    const time = {
      now: () => elapsed,
      wait: async (ms) => { elapsed += elapsed === 400 && ms === 50 ? 49 : ms; },
    };
    let inspections = 0;
    const result = await settleQaPage({
      ...time, timeoutMs: 450, intervalMs: 200,
      inspect: async () => {
        inspections += 1;
        assert.ok(time.now() < 450, "만료 시점에는 새 검사를 시작하면 안 된다");
        return skeleton;
      },
      diagnostics: () => ({ scriptResponses: fatalAtDeadline && time.now() >= 450 ? [htmlChunk] : [] }),
    });
    assert.equal(inspections, 3);
    assert.equal(result.elapsedMs, 450);
    assert.equal(result.inspectError, null);
    assert.equal(result.state, fatalAtDeadline ? "runtime-error" : "loading-timeout");
  }
});

test("로딩 표식이 없는 빈 화면과 readiness 미충족을 각각 구분한다", async () => {
  const blank = await settleQaPage({ ...clock(), timeoutMs: 400, inspect: async () => ({ ...skeleton, loadingLike: false }) });
  const notReady = await settleQaPage({ ...clock(), timeoutMs: 400, inspect: async () => ({ ...content, ready: false }) });
  assert.equal(blank.state, "blank");
  assert.equal(notReady.state, "not-ready");
});

test("스켈레톤이 있어도 pageerror, MIME console 오류, HTML 청크 응답은 실패를 유지한다", async () => {
  for (const errors of [
    { pageErrors: ["TypeError: Importing a module script failed."] },
    { consoleErrors: ["TypeError: text/html is not a valid JavaScript MIME type."] },
    { scriptResponses: [htmlChunk] },
    { scriptResponses: [{ ...htmlChunk, status: 404, contentType: "text/plain" }] },
  ]) {
    const result = await settleQaPage({ ...clock(), inspect: async () => skeleton, diagnostics: () => errors });
    assert.equal(result.state, "runtime-error");
    assert.equal(result.attempts, 1);
  }
});

test("수명 주기 후반에 발생한 청크 오류도 새 측정에서 보존한다", async () => {
  const time = clock();
  const result = await settleQaPage({
    ...time, inspect: async () => skeleton,
    diagnostics: () => ({ scriptResponses: time.now() >= 400 ? [htmlChunk] : [] }),
  });
  assert.equal(result.state, "runtime-error");
  assert.equal(result.elapsedMs, 400);
});

test("측정 결과에 후속 단계의 오류 배열 변경이 섞이지 않는다", async () => {
  const pageErrors = [];
  const result = await settleQaPage({ ...clock(), inspect: async () => content, diagnostics: () => ({ pageErrors }) });
  pageErrors.push("later reload failed");
  assert.deepEqual(result.diagnostics.pageErrors, []);
  assert.equal(result.state, "ready");
});

test("정상 JavaScript와 일반 API console 오류는 module 오류로 과대 분류하지 않는다", () => {
  assert.deepEqual(qaModuleFailures({
    consoleErrors: ["GET /api/optional returned 404"],
    scriptResponses: [{ ...htmlChunk, contentType: "application/javascript", status: 200 }],
  }), []);
});

test("JS 리다이렉트의 중간 HTML은 제외하고 최종 HTML 및 404 실패는 유지한다", () => {
  const redirect = { ...htmlChunk, status: 302 };
  const javascript = { ...htmlChunk, url: "https://example.test/assets/final.js", contentType: "application/javascript" };
  assert.deepEqual(qaModuleFailures({ scriptResponses: [redirect, javascript] }), []);
  assert.equal(qaModuleFailures({ scriptResponses: [redirect, htmlChunk] }).length, 1);
  assert.equal(qaModuleFailures({ scriptResponses: [redirect, { ...htmlChunk, status: 404, contentType: "text/plain" }] }).length, 1);
});

test("응답 감시는 script 요청의 MIME과 SW 경유 여부를 보존한다", () => {
  const responses = [];
  const response = {
    request: () => ({ resourceType: () => "script" }),
    url: () => htmlChunk.url, status: () => 200,
    headers: () => ({ "content-type": htmlChunk.contentType }), fromServiceWorker: () => true,
  };
  recordQaScriptResponse(response, responses);
  recordQaScriptResponse({ ...response, request: () => ({ resourceType: () => "document" }) }, responses);
  assert.deepEqual(responses, [htmlChunk]);
});

// CLI의 최상위 Playwright 실행을 건드리지 않고 실제 분류 함수의 연결도 검증한다.
function readClassifier(file, nextFunction) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const start = source.indexOf("function classify(");
  const end = source.indexOf(`\nasync function ${nextFunction}(`, start);
  assert.ok(start >= 0 && end > start);
  return runInNewContext(`(${source.slice(start, end)})`, { qaModuleFailures }, { timeout: 1_000 });
}

test("legacy 최종 분류도 검사 실패와 영구 로딩을 빈 화면 또는 성공으로 바꾸지 않는다", async () => {
  const classify = readClassifier("qa-studio-cross-browser-soak.mjs", "runRoute");
  const dom = { ...skeleton, offscreen: [], smallTargets: [], unnamed: [], popupOnly: [], documentOverflowX: 0 };
  for (const [inspection, expected] of [
    [async () => dom, /loading timeout/u],
    [async () => { throw new Error("DOM unreadable"); }, /DOM inspection failed/u],
  ]) {
    const measurement = await settleQaPage({ ...clock(), timeoutMs: 0, inspect: inspection });
    const result = classify({ route: { id: "editor" }, status: 200, navigationError: null, measurement, interactions: {}, offlineRecovery: {} });
    assert.ok(result.failures.some((failure) => expected.test(failure)));
    assert.equal(result.failures.includes("blank page"), false);
  }
});

test("실제 soak가 forced-offline 오류를 보존하면서 온라인 복구 성공은 별도로 판정한다", async () => {
  const source = readFileSync(new URL("../qa-studio-cross-browser-soak.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function runRoute(");
  const end = source.indexOf("\nawait mkdir(REPORT_DIR", start);
  const listeners = new Map();
  let offline = false;
  let failRecovery = false;
  const dom = { ...content, offscreen: [], smallTargets: [], unnamed: [], popupOnly: [], documentOverflowX: 0 };
  const page = {
    on: (name, callback) => listeners.set(name, callback),
    addInitScript: async () => {}, goto: async () => ({ status: () => 200 }),
    reload: async () => {
      if (offline) listeners.get("pageerror")(new Error("forced offline module error"));
      else if (failRecovery) listeners.get("pageerror")(new Error("online recovery module error"));
      return { status: () => 200 };
    },
    locator: () => ({ evaluate: async () => true }),
    screenshot: async () => {}, evaluate: async () => null, close: async () => {},
  };
  const context = { newPage: async () => page, setOffline: async (value) => { offline = value; } };
  const runRoute = runInNewContext(`(${source.slice(start, end)})`, {
    BASE_URL: "https://example.test", READY_TIMEOUT_MS: 0, DEADLINE: Infinity,
    BROWSER_NAME: "webkit", PROFILE_ID: "fixture", EVIDENCE_DIR: "evidence", RESULTS_PATH: "cases.jsonl",
    path, Date, Set, Object, snapshotQaDiagnostics, settleQaPage, qaModuleFailures, recordQaScriptResponse,
    textError: String, inspectDom: async () => dom, probeInteractions: async () => ({}),
    classify: readClassifier("qa-studio-cross-browser-soak.mjs", "runRoute"),
    digest: () => "fixture", safeFilePart: (value) => value, appendFile: async () => {},
  }, { timeout: 1_000 });
  const result = await runRoute(context, 3, { id: "editor", pathname: "/studio", ready: "main" }, { viewport: {} }, new Set());
  assert.equal(result.offlineRecovery.recovered, true);
  assert.equal(result.pageState, "ready");
  assert.equal(result.pageErrors.length, 1);
  assert.equal(result.measurements.at(-1).diagnostics.pageErrors.length, 0);
  assert.ok(result.phaseFindings.find((finding) => finding.phase === "forced-offline").failures.length > 0);
  assert.equal(result.phaseFindings.find((finding) => finding.phase === "offline-recovery").failures.length, 0);
  assert.equal(result.failures.includes("failed to recover after offline reload"), false);
  failRecovery = true;
  const failed = await runRoute(context, 3, { id: "editor", pathname: "/studio", ready: "main" }, { viewport: {} }, new Set());
  assert.equal(failed.offlineRecovery.recovered, false);
  assert.equal(failed.measurements.at(-1).diagnostics.pageErrors.length, 1);
  assert.equal(failed.pageState, "runtime-error");
  assert.ok(failed.failures.includes("failed to recover after offline reload"));
});

test("v2는 기존 로딩 경고를 유지하면서 console 전용 MIME 오류와 HTML 응답을 실패로 남긴다", () => {
  const classify = readClassifier("qa-live-studio-cross-browser-audit-v2.mjs", "runCase");
  const input = {
    route: { id: "editor" }, profile: { hasTouch: false }, responseStatus: 200,
    navigationError: null, ready: true,
    dom: { ...skeleton, visualSurfaceCount: 0, offscreenControls: [], dialogsOutsideViewport: [], duplicateTestIds: [], unnamedControls: [] },
    pageErrors: [], consoleErrors: [], requestFailures: [], scriptResponses: [], workspaceProbe: {}, bg3dProbe: {},
  };
  const loading = classify(input);
  assert.equal(loading.hardFailures.length, 0);
  assert.ok(loading.warnings.includes("loading surface remained after retry window"));
  for (const errors of [
    { consoleErrors: ["TypeError: text/html is not a valid JavaScript MIME type."] },
    { scriptResponses: [htmlChunk] },
  ]) {
    const result = classify({ ...input, ...errors });
    assert.equal(result.ok, false);
    assert.ok(result.hardFailures.length > 0);
    assert.equal(result.warnings.includes("loading surface remained after retry window"), false);
  }
});
