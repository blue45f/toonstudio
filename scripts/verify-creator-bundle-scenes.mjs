#!/usr/bin/env node
/** 격리된 실제 2D 선택기에서 완성 배경의 미리보기·배치·출처 보존을 검증한다. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "playwright";

const args = process.argv.slice(2);
assert(args.every((arg, index) => index % 2 === 1 || ["--origin", "--out"].includes(arg)), "알 수 없는 옵션입니다.");
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const origin = new URL(option("--origin", "http://127.0.0.1:5192"));
assert(origin.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)
  && !origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === "/", "격리된 로컬 검수 서버만 사용할 수 있습니다.");
const output = resolve(option("--out", "/tmp/toonstudio-bundle-scenes-review"));
mkdirSync(output, { recursive: true });
const report = { scenes: [], errors: [], screenshots: [], scope: "실제 2D 선택기·배치 함수·canvas 픽셀. 원격 저장과 프로젝트 전체 화면 검증은 별도다." };
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(60_000);
  page.on("pageerror", (error) => report.errors.push(error.message));
  await page.goto(`${origin.origin}/tools/browser-harnesses/bundle-scenes-runtime.html`, { waitUntil: "networkidle", timeout: 120_000 });
  for (const [index, id] of ["cbv1-scene-park-garden", "cbv1-scene-dungeon-study"].entries()) {
    if (index) await page.setViewportSize({ width: 390, height: 844 });
    const card = page.locator(`[data-studio-2d-asset="${id}"]`);
    await card.getByRole("button", { name: /확대 미리보기$/u }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const image = dialog.locator("img");
    await image.evaluate(async (element) => { await element.decode(); });
    assert.deepEqual(await image.evaluate((element) => [element.naturalWidth, element.naturalHeight]), [2048, 1152]);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await card.getByRole("button", { name: / 삽입$/u }).click();
    const inserted = page.locator(`[data-background-inserted="${id}"]`);
    await inserted.waitFor();
    const data = JSON.parse(await inserted.innerText());
    assert.equal(data.sourceWidth, 2048);
    assert.equal(data.sourceHeight, 1152);
    assert.equal(data.element.width, 720);
    assert.equal(data.element.height, 405);
    assert.equal(data.element.bundleSourceCredit.assetId, id);
    assert.equal(data.element.bundleSourceCredit.status, "public-domain");
    assert.match(data.element.bundleSourceCredit.contentHash, /^sha256:[a-f0-9]{64}$/u);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "배경 선택기가 모바일 화면을 가로로 넘습니다.");
    await page.locator("canvas").scrollIntoViewIfNeeded();
    const path = resolve(output, index ? "mobile-study.png" : "desktop-garden.png");
    await page.screenshot({ path });
    report.screenshots.push(path);
    report.scenes.push(data);
  }
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify({ scenes: report.scenes.length, errors: report.errors }));
} finally {
  writeFileSync(resolve(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  await browser.close();
}
