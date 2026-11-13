import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { Image, encodePng } from "image-js";
import { parse } from "yaml";

import { assertGraphiteBrowserVersion, compareGraphiteScreenshots, readInstalledGraphiteBrowserPin, resolveGraphiteBrowserPin } from "./verify-studio-graphite-coverage.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

test("기본 Chromium은 frozen-lockfile의 실제 Playwright 의존성 메타데이터와 정확히 일치한다", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const lock = parse(readFileSync(new URL("../pnpm-lock.yaml", import.meta.url), "utf8"));
  const playwrightManifest = createRequire(import.meta.url).resolve("playwright/package.json");
  const coreManifest = createRequire(playwrightManifest).resolve("playwright-core/package.json");
  const metadata = JSON.parse(readFileSync(join(dirname(coreManifest), "browsers.json"), "utf8"));
  const chromium = metadata.browsers.find((entry) => entry.name === "chromium");
  const pin = readInstalledGraphiteBrowserPin();
  assert.equal(pin.playwrightVersion, manifest.devDependencies.playwright);
  assert.equal(pin.playwrightVersion, lock.importers["."].devDependencies.playwright.version);
  assert.equal(pin.coreVersion, pin.playwrightVersion);
  assert.equal(pin.version, chromium.browserVersion);
  assert.equal(pin.revision, chromium.revision);
  assert.equal(pin.source, "playwright-core/browsers.json");
  assert.match(pin.metadataSha256, /^[a-f0-9]{64}$/);
});

test("명시한 과거 실험 버전은 기본값보다 우선하며 다른 실제 버전은 거절한다", () => {
  const metadata = { browsers: [{ name: "chromium", browserVersion: "158.0.8127.18", revision: "1254" }] };
  const pin = resolveGraphiteBrowserPin(metadata, "156.0.8078.4");
  assert.deepEqual(pin, { version: "156.0.8078.4", source: "GRAPHITE_EXPECTED_BROWSER" });
  assert.doesNotThrow(() => assertGraphiteBrowserVersion("156.0.8078.4", pin.version));
  assert.throws(() => assertGraphiteBrowserVersion("158.0.8127.18", pin.version), /기대: 156.*실제: 158/);
  for (const override of ["", "156", "156.*", "latest", " 156.0.8078.4"]) {
    assert.throws(() => resolveGraphiteBrowserPin(metadata, override), /형식/);
  }
});

test("누락·중복·다른 channel·손상된 공식 메타데이터에는 기본 버전을 추측하지 않는다", () => {
  const chromium = { name: "chromium", browserVersion: "158.0.8127.18", revision: "1254" };
  for (const metadata of [null, {}, { browsers: [] }, { browsers: [chromium, chromium] },
    { browsers: [{ ...chromium, name: "chromium-headless-shell" }] },
    { browsers: [{ ...chromium, browserVersion: "158" }] }, { browsers: [{ ...chromium, revision: undefined }] }]) {
    assert.throws(() => resolveGraphiteBrowserPin(metadata), /메타데이터|버전·revision/);
  }
});

test("공식 기본값도 정확한 한 버전만 허용하고 패치 버전 차이를 거절한다", () => {
  const pin = resolveGraphiteBrowserPin({ browsers: [{ name: "chromium", browserVersion: "158.0.8127.18", revision: "1254" }] });
  assert.doesNotThrow(() => assertGraphiteBrowserVersion("158.0.8127.18", pin.version));
  for (const actual of ["154.0.0.0", "156.0.8078.4", "158.0.8127.19", ""]) {
    assert.throws(() => assertGraphiteBrowserVersion(actual, pin.version), /고정 Chromium/);
  }
});

function screenshot({ pixels = 0, delta = 0, width = 733, height = 769, alpha = 255 } = {}) {
  const data = new Uint8Array(width * height * 4).fill(255);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    data[pixel * 4] = 255 - delta;
    data[pixel * 4 + 3] = alpha;
  }
  return Buffer.from(encodePng(new Image(width, height, { data, colorModel: "RGBA" })));
}

test("빈 화면과 tolerance 2 이하 변화는 가시성 성공이 아니다", () => {
  const before = screenshot();
  for (const delta of [0, 1, 2]) {
    const result = compareGraphiteScreenshots(before, screenshot({ pixels: 128, delta }));
    assert.equal(result.changedPixels, 0);
    assert.equal(result.meaningful, false);
  }
});

test("많은 픽셀이 바뀌어도 최대 변화 3은 기존 가시성 기준에 실패한다", () => {
  const result = compareGraphiteScreenshots(screenshot(), screenshot({ pixels: 128, delta: 3 }));
  assert.equal(result.changedPixels, 128);
  assert.equal(result.maxChannelDelta, 3);
  assert.equal(result.meaningful, false);
});

test("채널 변화 4라도 3개 픽셀만 바뀌면 실패하고 4개부터 통과한다", () => {
  const before = screenshot();
  assert.equal(compareGraphiteScreenshots(before, screenshot({ pixels: 3, delta: 4 })).meaningful, false);
  const result = compareGraphiteScreenshots(before, screenshot({ pixels: 4, delta: 4 }));
  assert.equal(result.changedPixels, 4);
  assert.equal(result.maxChannelDelta, 4);
  assert.equal(result.meaningful, true);
});

test("크기·흰 baseline·최종 불투명 화면 계약이 다르면 거절한다", () => {
  assert.throws(() => compareGraphiteScreenshots(screenshot(), screenshot({ width: 732 })), /크기/);
  assert.throws(() => compareGraphiteScreenshots(screenshot({ pixels: 1, delta: 1 }), screenshot()), /white/);
  assert.throws(() => compareGraphiteScreenshots(screenshot(), screenshot({ pixels: 1, alpha: 254 })), /불투명/);
});

test("Graphite 실제 화면 회귀는 PR·main desktop에서 실패를 전파하고 기존 UI 검사를 유지한다", () => {
  const workflow = parse(readFileSync(new URL("../.github/workflows/studio-brush-filter-stability.yml", import.meta.url), "utf8"));
  for (const event of ["pull_request", "push"]) {
    for (const path of ["scripts/verify-studio-graphite-coverage.mjs", "scripts/studio-graphite-coverage-browser.mts", "scripts/verify-studio-graphite-coverage.test.mjs"]) {
      assert.ok(workflow.on[event].paths.includes(path));
    }
  }
  const browser = workflow.jobs.browser;
  assert.equal(browser["timeout-minutes"], 100);
  assert.ok(browser.steps.some((step) => step.run === "pnpm install --frozen-lockfile --prefer-offline"));
  assert.ok(browser.steps.some((step) => step.run === "pnpm exec playwright install --with-deps chromium"));
  const regression = browser.steps.find((step) => step.run === "node scripts/verify-studio-graphite-coverage.mjs");
  assert.equal(regression?.if, "${{ !cancelled() && matrix.suite == 'desktop' }}");
  assert.notEqual(regression?.["continue-on-error"], true);
  const ui = browser.steps.find((step) => step.name === "Brush catalogue, long strokes, geometry, touch targets and save recovery");
  assert.equal(ui.run, "pnpm run verify:studio-brushes");
  assert.equal(ui.env.TOONSPECTRUM_BRUSH_STABILITY_ROUNDS, "2");
  assert.equal(ui.env.TOONSPECTRUM_BRUSH_SURVEY, "1");
  assert.equal(ui.env.TOONSPECTRUM_ALL_BRUSH_LONG_MATRIX, "1");
});
