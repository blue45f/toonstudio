import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

// 선행 조건: 클라우드에서 Vite 개발 서버를 실행한다. 인증·서버·월드 전체를 대체하지 않는다.
const baseUrl = process.env.VIRTUAL_STUDIO_REVIEW_URL ?? "http://127.0.0.1:5173";
const output = await mkdtemp(path.join(tmpdir(), "virtual-studio-characters-"));
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL("/tools/browser-harnesses/virtual-studio-character-consistency.html", baseUrl).href, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { level: 1 }).waitFor();
  for (const style of ["sky-island", "webtoon", "pastel", "retro", "ink", "neon"]) {
    const source = await page.locator(`[data-review-style="${style}"] img`).getAttribute("src");
    assert(source?.includes(`/style-packs-v5/${style}/`), `${style}: ${source}`);
  }
  assert.equal(await page.locator("[data-review-office] [data-office-character]").count(), 1);
  assert.equal(await page.locator("[data-space-theme]").count(), 13);
  assert.equal(await page.locator(".studio-theme-picker__characters").count(), 13);
  for (const button of await page.locator("[data-space-theme]").all()) {
    await button.scrollIntoViewIfNeeded();
    await button.click();
    assert.equal(await button.getAttribute("aria-pressed"), "true");
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(output, "desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "미디어 디렉터 캐릭터 선택", exact: true }).click();
  const sheets = await page.locator("[data-review-style] [data-character-sheet]")
    .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-character-sheet")));
  assert.equal(sheets.length, 6);
  assert.equal(new Set(sheets).size, 1);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px 가로 넘침`);
    await page.screenshot({ path: path.join(output, `${width}-light.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log(`통과: 작화 6종·추천/선택 13종·네이티브 유지·기본 2D 초상화·390/768/1440px. 화면 증거: ${output}`);
} finally {
  await browser.close();
}
