import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { Image, encodePng } from "image-js";
import { parse } from "yaml";

import { compareGraphiteScreenshots } from "./verify-studio-graphite-coverage.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

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
  const regression = browser.steps.find((step) => step.run === "node scripts/verify-studio-graphite-coverage.mjs");
  assert.equal(regression?.if, "${{ !cancelled() && matrix.suite == 'desktop' }}");
  assert.notEqual(regression?.["continue-on-error"], true);
  const ui = browser.steps.find((step) => step.name === "Brush catalogue, long strokes, geometry, touch targets and save recovery");
  assert.equal(ui.run, "pnpm run verify:studio-brushes");
  assert.equal(ui.env.TOONSPECTRUM_BRUSH_STABILITY_ROUNDS, "2");
  assert.equal(ui.env.TOONSPECTRUM_BRUSH_SURVEY, "1");
  assert.equal(ui.env.TOONSPECTRUM_ALL_BRUSH_LONG_MATRIX, "1");
});
