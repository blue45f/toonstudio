import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const ENTRY = fileURLToPath(new URL("./qa-studio-cross-browser-soak.mjs", import.meta.url));

// 실제 CLI를 실행하고 브라우저만 대체하므로 의존성 설치 전에도 집계·보고서·종료 연결을 검증한다.
const PRELOAD = `
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "playwright") {
      return { url: new URL("./playwright-fixture.mjs", import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
`;

const PLAYWRIGHT_FIXTURE = `
import { writeFile } from "node:fs/promises";

const scenario = process.env.TOONSTUDIO_QA_FIXTURE_SCENARIO;
let clock = 1_000_000;
Date.now = () => clock;
const listeners = new Map();
let inspections = 0;
const locator = { count: async () => 0, first() { return this; } };
const content = {
  bodyPreview: "준비된 Studio", bodyTextLength: 12, canvasCount: 0, controls: 1,
  documentOverflowX: 0, largestCanvas: null, loadingLike: false, loadingSurfaceCount: 0,
  loadingOnly: false, offscreen: [], popupOnly: [], smallTargets: [], unnamed: [],
  ready: true, routeLoading: false, visualCount: 0,
};
const skeleton = {
  ...content, bodyPreview: "", bodyTextLength: 0, controls: 0, loadingLike: true,
  loadingSurfaceCount: 1, loadingOnly: true, routeLoading: true,
};
const page = {
  on: (event, callback) => listeners.set(event, callback),
  addInitScript: async () => {},
  goto: async () => {
    if (scenario === "runtime-error") listeners.get("pageerror")(new Error("의도한 모듈 실행 실패"));
    if (scenario === "html-script") {
      listeners.get("response")({
        request: () => ({ resourceType: () => "script" }),
        url: () => "https://fixture.invalid/assets/previous.js", status: () => 200,
        headers: () => ({ "content-type": "text/html" }), fromServiceWorker: () => true,
      });
    }
    return { status: () => 200 };
  },
  evaluate: async (_callback, argument) => {
    if (!argument?.readySelector) return null;
    inspections += 1;
    clock += 250;
    if (scenario === "loading-timeout" || (scenario === "delayed-loading" && inspections === 1)) return skeleton;
    if (scenario === "warnings-only") return { ...content, smallTargets: [{ label: "작은 버튼" }] };
    return content;
  },
  locator: () => locator,
  keyboard: { press: async () => {} },
  screenshot: async ({ path }) => {
    await writeFile(path, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a75cAAAAASUVORK5CYII=", "base64"));
  },
  close: async () => { clock += 60_001; },
};
const browserType = {
  launch: async () => ({
    newContext: async () => ({ newPage: async () => page, close: async () => {} }),
    close: async () => {},
  }),
};
export const chromium = browserType;
export const firefox = browserType;
export const webkit = browserType;
`;

function runScenario(scenario) {
  const directory = mkdtempSync(path.join(tmpdir(), "toonstudio-soak-exit-"));
  try {
    const preload = path.join(directory, "preload.mjs");
    const reportDirectory = path.join(directory, "reports");
    writeFileSync(preload, PRELOAD);
    writeFileSync(path.join(directory, "playwright-fixture.mjs"), PLAYWRIGHT_FIXTURE);
    const child = spawnSync(process.execPath, ["--import", preload, ENTRY], {
      cwd: directory,
      encoding: "utf8",
      timeout: 5_000,
      env: {
        ...process.env,
        QA_BROWSER: "webkit", QA_PROFILE_ID: "exit-fixture", QA_SOAK_MINUTES: "1",
        QA_READY_TIMEOUT_MS: "1000", QA_REPORT_DIR: reportDirectory,
        QA_EVIDENCE_DIR: path.join(directory, "screenshots"),
        STUDIO_BASE_URL: "https://fixture.invalid", TOONSTUDIO_QA_FIXTURE_SCENARIO: scenario,
      },
    });
    assert.ifError(child.error);
    assert.equal(child.signal, null, child.stderr);
    const summary = JSON.parse(readFileSync(path.join(reportDirectory, "summary.json"), "utf8"));
    const cases = readFileSync(path.join(reportDirectory, "cases.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
    const report = readFileSync(path.join(reportDirectory, "report.md"), "utf8");
    assert.equal(summary.cases, 1, "실제 CLI는 한 사례를 실행하고 종료해야 한다");
    assert.equal(cases.length, summary.cases);
    assert.equal(summary.failedCases, cases.filter((result) => result.failures.length > 0).length);
    assert.equal(summary.warningCases, cases.filter((result) => result.warnings.length > 0).length);
    assert.ok(report.includes(`Cases with hard failures: ${summary.failedCases}`));
    const outputLines = child.stdout.trim().split(/\r?\n/u);
    assert.match(outputLines.shift(), /^\[soak\] /u);
    assert.deepEqual(JSON.parse(outputLines.join("\n")), summary, "표준 출력과 저장된 요약 전체가 같아야 한다");
    if (summary.failedCases > 0 || summary.warningCases > 0) {
      assert.ok(cases[0].screenshot, "실패와 경고의 화면 증거 경로를 남겨야 한다");
      assert.ok(statSync(cases[0].screenshot).size > 0, "종료 전에 화면 증거가 기록되어야 한다");
    }
    return { child, summary, result: cases[0] };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("정상 사례는 보고서를 보존하고 실제 프로세스가 0으로 종료한다", () => {
  const { child, summary, result } = runScenario("ready");
  assert.equal(summary.failedCases, 0);
  assert.equal(summary.warningCases, 0);
  assert.equal(result.pageState, "ready");
  assert.equal(child.status, 0, child.stderr);
});

test("경고만 있는 사례는 기존 의미를 유지하며 0으로 종료한다", () => {
  const { child, summary } = runScenario("warnings-only");
  assert.equal(summary.failedCases, 0);
  assert.equal(summary.warningCases, 1);
  assert.equal(child.status, 0, child.stderr);
});

test("실제 하드 실패는 집계와 증거를 기록한 뒤 1로 종료한다", () => {
  const { child, summary, result } = runScenario("runtime-error");
  assert.equal(summary.failedCases, 1);
  assert.equal(result.pageState, "runtime-error");
  assert.ok(result.failures.some((failure) => failure.includes("uncaught page errors")));
  assert.equal(child.status, 1, child.stdout + child.stderr);
});

test("정상 화면으로 회복한 로딩은 실패 집계나 비정상 종료를 만들지 않는다", () => {
  const { child, summary, result } = runScenario("delayed-loading");
  assert.ok(result.measurements[0].attempts > 1, "첫 로딩 이후 실제 재측정 경로를 거쳐야 한다");
  assert.equal(result.pageState, "ready");
  assert.equal(summary.failedCases, 0);
  assert.equal(child.status, 0, child.stderr);
});

test("영구 로딩은 blank 오탐 대신 loading-timeout 실패로 기록하고 1로 종료한다", () => {
  const { child, summary, result } = runScenario("loading-timeout");
  assert.equal(result.pageState, "loading-timeout");
  assert.equal(result.failures.includes("blank page"), false);
  assert.ok(result.failures.some((failure) => failure.startsWith("loading timeout:")));
  assert.equal(summary.failedCases, 1);
  assert.equal(child.status, 1, child.stdout + child.stderr);
});

test("HTML 청크 응답은 pageerror가 없어도 실패로 집계하고 1로 종료한다", () => {
  const { child, summary, result } = runScenario("html-script");
  assert.equal(result.pageErrors.length, 0);
  assert.equal(result.pageState, "runtime-error");
  assert.ok(result.failures.some((failure) => failure.includes("text/html")));
  assert.equal(summary.failedCases, 1);
  assert.equal(child.status, 1, child.stdout + child.stderr);
});
