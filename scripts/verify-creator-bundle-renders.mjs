#!/usr/bin/env node
/** 격리된 로컬 검수 화면에서 실제 소재 로딩·미리보기·canvas 삽입을 확인한다. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("사용법: node scripts/verify-creator-bundle-renders.mjs --origin http://127.0.0.1:5192 --out /tmp/bundle-runtime-review");
  process.exit(0);
}
function value(flag, fallback) {
  const index = args.indexOf(flag);
  return index < 0 ? fallback : args[index + 1];
}
assert(args.every((arg, index) => index % 2 === 1 || ["--origin", "--out"].includes(arg)), "알 수 없는 옵션입니다.");
const origin = new URL(value("--origin", "http://127.0.0.1:5192"));
assert(["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) && origin.protocol === "http:", "로컬 검수 서버만 사용할 수 있습니다.");
assert(!origin.username && !origin.password && origin.pathname === "/" && !origin.search && !origin.hash, "origin에는 경로·자격증명·쿼리를 넣을 수 없습니다.");
const output = resolve(value("--out", "/tmp/toonstudio-bundle-runtime-review"));
mkdirSync(output, { recursive: true });
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "apps/web/public/assets/studio/bundle-renders-v1/manifest.json"), "utf8"));
const expected = manifest.assets.filter(asset => asset.visualReviewed && asset.rights?.serve === "allow");
assert(expected.length > 0, "실물 소재가 없는 상태를 검증 성공으로 처리할 수 없습니다.");
const browser = await chromium.launch({ headless: true });
const report = { expected: expected.length, imageContract: null, insertions: [], errors: [], screenshots: [], databasePersistenceVerified: false };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(60_000);
  page.on("pageerror", error => report.errors.push(error.message));
  await page.goto(`${origin.origin}/tools/browser-harnesses/bundle-renders-runtime.html`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.getByRole("button", { name: "전체 렌더 무결성 검사", exact: true }).click();
  const integrity = page.locator("[data-bundle-integrity-phase]");
  await page.locator("[data-bundle-integrity-phase='completed']").waitFor({ timeout: 240_000 });
  report.imageContract = await integrity.evaluate(element => ({
    successes: Number(element.getAttribute("data-bundle-integrity-success")),
    failures: Number(element.getAttribute("data-bundle-integrity-failures")),
    text: element.textContent,
  }));
  assert.equal(report.imageContract.successes, expected.length);
  assert.equal(report.imageContract.failures, 0);
  await page.locator("[data-studio-bundle-library] summary").click();
  const cards = page.locator("[data-bundle-asset-id]");
  await cards.first().waitFor();
  assert.equal(await cards.count(), Math.min(24, expected.length));
  async function useFirstCard() {
    const card = cards.first();
    const id = await card.getAttribute("data-bundle-asset-id");
    await card.getByRole("button", { name: /확대 미리보기$/u }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.locator("img").evaluate(async image => { await image.decode(); });
    assert.equal(await dialog.locator("img").evaluate(image => image.naturalWidth), 1536);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await card.getByRole("button", { name: "캔버스에 삽입", exact: true }).click();
    const canvasResult = page.locator("[data-bundle-canvas-status='drawn']");
    await canvasResult.waitFor();
    const inserted = page.locator(`[data-bundle-inserted-id="bundle:${id}"]`);
    await inserted.waitFor();
    report.insertions.push({ id, text: await inserted.innerText() });
  }
  await useFirstCard();
  await page.locator("[data-studio-bundle-library]").scrollIntoViewIfNeeded();
  const desktop = resolve(output, "desktop-library.png");
  await page.screenshot({ path: desktop });
  report.screenshots.push(desktop);
  await page.getByRole("searchbox").fill("물약");
  await page.getByText("검색 결과 3종 · 1/1페이지", { exact: true }).waitFor();
  await useFirstCard();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("searchbox").fill("벤치");
  await page.getByText("검색 결과 2종 · 1/1페이지", { exact: true }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "모바일 화면이 가로로 넘칩니다.");
  await useFirstCard();
  await page.locator("[data-bundle-canvas-status='drawn']").scrollIntoViewIfNeeded();
  const mobile = resolve(output, "mobile-canvas.png");
  await page.screenshot({ path: mobile });
  report.screenshots.push(mobile);
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify({ expected: report.expected, imageContract: report.imageContract, insertions: report.insertions.length, errors: report.errors }));
} finally {
  writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
