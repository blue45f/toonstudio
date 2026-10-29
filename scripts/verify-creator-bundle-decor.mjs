#!/usr/bin/env node
/** 격리된 localhost에서 실제 장소/Canvas·장식 캐시·이동·작업대·390px 화면을 검수한다. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "playwright";

const args = process.argv.slice(2);
const value = (flag, fallback) => { const index = args.indexOf(flag); return index < 0 ? fallback : args[index + 1]; };
assert(args.every((arg, index) => index % 2 === 1 || ["--origin", "--out"].includes(arg)), "알 수 없는 옵션입니다.");
const origin = new URL(value("--origin", "http://127.0.0.1:5192"));
assert(["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) && origin.protocol === "http:", "로컬 검수 서버만 사용할 수 있습니다.");
assert(!origin.username && !origin.password && origin.pathname === "/" && !origin.search && !origin.hash, "순수 localhost origin만 사용할 수 있습니다.");
const output = resolve(value("--out", "/tmp/toonstudio-bundle-decor-review"));
mkdirSync(output, { recursive: true });
const report = { scope: "actual-place-manifest-and-StudioOffice2dCanvas", cases: [], errors: [], databasePersistenceVerified: false };
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1100, 390]) {
    for (const place of ["garden", "tree-library", "creator-cafe"]) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 1000 } });
      page.setDefaultTimeout(60_000);
      const requests = [];
      page.on("pageerror", (error) => report.errors.push(error.message));
      page.on("request", (request) => { if (request.url().includes("/bundle-decor-v1/") || request.url().includes("/bundle-renders-v1/")) requests.push(request.url()); });
      await page.addInitScript(() => {
        const drawImage = CanvasRenderingContext2D.prototype.drawImage;
        window.__bundleDecorDraws = {};
        CanvasRenderingContext2D.prototype.drawImage = function (...values) {
          const source = values[0];
          if (source instanceof HTMLImageElement && source.src.includes("/bundle-decor-v1/")) {
            window.__bundleDecorDraws[source.src] = (window.__bundleDecorDraws[source.src] ?? 0) + 1;
          }
          return drawImage.apply(this, values);
        };
      });
      await page.goto(`${origin.origin}/tools/browser-harnesses/bundle-decor-runtime.html?place=${place}`, { waitUntil: "networkidle" });
      await page.locator("[data-office2d-stage='ready']").waitFor();
      await page.waitForFunction(() => Object.keys(window.__bundleDecorDraws).length === 2);
      const before = await page.evaluate(() => ({ ...window.__bundleDecorDraws }));
      const initial = await page.locator("[data-decor-position]").getAttribute("data-decor-position");
      const canvas = page.locator("canvas");
      await canvas.focus();
      await page.keyboard.down("KeyW");
      await page.waitForFunction((start) => document.querySelector("[data-decor-position]")?.getAttribute("data-decor-position") !== start, initial);
      await page.keyboard.up("KeyW");
      await page.getByRole("button", { name: "작업대로 이동", exact: true }).click();
      await page.waitForFunction(() => {
        const [x, y] = (document.querySelector("[data-decor-position]")?.getAttribute("data-decor-position") ?? "0,0").split(",").map(Number);
        return Math.hypot(x - 480, y - 312) < 25;
      });
      await page.getByRole("button", { name: "작업대 선택", exact: true }).click();
      await page.locator(`[data-decor-interaction='${place}-primary-action']`).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "화면이 가로로 넘칩니다.");
      const after = await page.evaluate(() => ({ ...window.__bundleDecorDraws }));
      assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
      assert(Object.keys(after).every((url) => after[url] > before[url]), "실제 Canvas가 캐시된 장식을 다시 그리지 않았습니다.");
      assert.equal(requests.length, 2, "장소의 두 장식 이외에 전체 원본이나 반복 요청을 읽었습니다.");
      assert(requests.every((url) => url.includes("/bundle-decor-v1/") && url.endsWith(".webp")));
      const screenshot = resolve(output, `${place}-${width}.png`);
      await page.screenshot({ path: screenshot });
      await canvas.hover();
      await page.mouse.wheel(0, 1200);
      await page.waitForFunction((previous) => Object.entries(previous).every(([url, count]) => window.__bundleDecorDraws[url] > count + 15), after);
      const overviewScreenshot = resolve(output, `${place}-${width}-overview.png`);
      await page.screenshot({ path: overviewScreenshot });
      report.cases.push({ place, width, uniqueDecorImages: Object.keys(after).length, imageRequests: requests.length,
        drawCounts: after, moved: true, workstationSelected: true, horizontalOverflow: false, screenshot, overviewScreenshot });
      await page.close();
    }
  }
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify({ cases: report.cases.length, errors: report.errors, imagesPerPlace: 2 }));
} finally {
  await browser.close();
  writeFileSync(resolve(output, "runtime-review.json"), `${JSON.stringify(report, null, 2)}\n`);
}
