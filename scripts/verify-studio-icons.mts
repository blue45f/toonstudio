/** 기본값은 dist 미리보기다. STUDIO_QA_BASE_URL을 지정하면 해당 웹과 격리된 CDP :9223 컨텍스트를 사용한다. */
import assert from "node:assert/strict";

import { chromium, expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

import { openStudioAllTools } from "./lib/studio-bg3d-ui-interactions";
import { openStudioMainMenu, showStudioProjectWindowTools } from "./lib/studio-shell-interactions";
import { findFreePort, spawnVitePreview, stopChildProcess, waitForServer } from "./lib/studio-verify-preview-harness.mjs";

import type { ChildProcess } from "node:child_process";

const toolbarTools = {
  select: "선택", pen: "펜", eraser: "지우개", color: "색상", layers: "레이어", fill: "채우기",
  frame: "컷 분할", bubble: "말풍선", bg3d: "3D 배경", pin: "핀 댓글", tools: "전체 도구",
} as const;
const headerTools = {
  search: "기능·도구 검색", history: "수정이력", save: "초안 저장", bubble: "댓글", export: "출고", share: "공유·초대",
} as const;

const log = (message: string) => console.log(`[verify-icons] ${message}`);

/** 실제 CSS 크롭이 그리는 한 칸을 읽어 비어 있거나 찌그러지거나 숨은 아트를 검출한다. */
async function checkArtwork(art: Locator) {
  await expect(art).toBeInViewport();
  await expect(art).toHaveAttribute("aria-hidden", "true");
  await expect(art.locator("img")).toHaveAttribute("data-ready", "true");
  await expect(art.locator("svg")).toBeHidden();
  const receipt = await art.evaluate(async (element) => {
    const image = element.querySelector("img");
    if (!image) throw new Error("아트 이미지 누락");
    await image.decode();
    const tile = element.getBoundingClientRect(), sheet = image.getBoundingClientRect();
    const column = (tile.left - sheet.left) / tile.width, row = (tile.top - sheet.top) / tile.height;
    const aligned = [column, row].every(value => Math.abs(value - Math.round(value)) < .01);
    const painted = image.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    const cellWidth = image.naturalWidth / 4, cellHeight = image.naturalHeight / 3;
    const canvas = document.createElement("canvas");
    canvas.width = cellWidth;
    canvas.height = cellHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("아이콘 픽셀을 읽을 수 없습니다.");
    ctx.drawImage(image, Math.round(column) * cellWidth, Math.round(row) * cellHeight, cellWidth, cellHeight,
      0, 0, cellWidth, cellHeight);
    const pixels = ctx.getImageData(0, 0, cellWidth, cellHeight).data;
    let ink = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] >= 128) ink++;
    return { tool: element.getAttribute("data-studio-tool-art"), size: tile.width,
      displayed: painted && getComputedStyle(element).overflow === "hidden",
      geometry: tile.width === tile.height && cellWidth === cellHeight && aligned &&
        column >= -.01 && column <= 3.01 && row >= -.01 && row <= 2.01 &&
        Math.abs(sheet.width - tile.width * 4) < 1 && Math.abs(sheet.height - tile.height * 3) < 1,
      coverage: ink / (cellWidth * cellHeight) };
  });
  assert(receipt.displayed && receipt.geometry && receipt.size >= 10 && receipt.coverage >= .02,
    `아이콘 표시·위치·픽셀 검사 실패 ${JSON.stringify(receipt)}`);
}

async function checkNamedArtwork(region: Locator, entries: Readonly<Record<string, string>>) {
  for (const [tool, label] of Object.entries(entries)) {
    const control = region.getByRole("button", { name: label, exact: true });
    await expect(control).toHaveCount(1);
    await checkArtwork(control.locator(`[data-studio-tool-art="${tool}"]`));
  }
}

async function checkControls(region: Locator) {
  for (const control of await region.locator("button, summary").filter({ visible: true }).all()) {
    await expect(control).toHaveAccessibleName(/\S/u);
  }
  const tiny = await region.locator("button svg, summary svg").evaluateAll(nodes => nodes.filter(svg => {
    const rect = svg.getBoundingClientRect();
    return svg.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
      rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight &&
      Math.min(rect.width, rect.height) < 10;
  }).length);
  assert(tiny <= 2, `10px 미만으로 표시된 선 아이콘 ${tiny}개`);
}

async function checkBrushOptions(page: Page, rail: Locator) {
  const options = page.locator('[data-studio-quick-ergonomics="true"]');
  const brush = options.locator('[data-studio-core-draw-control="brush"]');
  for (const [tool, label] of [["eraser", "지우개"], ["pen", "펜"]]) {
    const button = rail.getByRole("button", { name: label, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(options).toHaveAttribute("data-studio-active-draw-mode", tool);
    await checkArtwork(brush.locator(`[data-studio-tool-art="${tool === "eraser" ? "eraser" : "brush"}"]`));
  }
  for (const label of ["브러시 크기 줄이기", "브러시 크기 키우기"]) {
    const svg = options.getByRole("button", { name: label, exact: true }).locator("svg");
    await expect(svg).toBeInViewport();
    const box = await svg.boundingBox();
    assert(box && Math.min(box.width, box.height) >= 10, `${label} 아이콘 크기`);
  }
  await checkControls(options);
  await brush.click();
  const library = page.locator('[data-studio-brush-catalog-session="true"]').filter({ visible: true });
  const presets = library.locator("[data-studio-brush-select]");
  await expect(presets.nth(2)).toBeVisible();
  for (const preset of (await presets.all()).slice(0, 3)) {
    await expect(preset).toHaveAccessibleName(/.+ 선택$/u);
    await preset.scrollIntoViewIfNeeded();
    await expect(preset.locator("svg, canvas, img").filter({ visible: true }).first()).toBeInViewport();
  }
  log(`펜·지우개 전환, 두께 아이콘, 브러시 선택 ${await presets.count()}개`);
  await brush.click();
  await expect(library).toBeHidden();
}

async function checkCatalog(page: Page) {
  const dialog = await openStudioAllTools(page);
  const groups = dialog.locator("[data-studio-tool-category]:not([data-studio-tool-category=all])");
  await expect(groups).toHaveCount(8);
  const verified = new Set<string>();
  for (const group of await groups.all()) {
    const id = await group.getAttribute("data-studio-tool-category");
    assert(id);
    await expect(group).toHaveAccessibleName(/\S/u);
    await group.scrollIntoViewIfNeeded();
    await checkArtwork(group.locator("[data-studio-tool-art]"));
    await group.click();
    await expect(group).toHaveAttribute("aria-pressed", "true");
    const tools = dialog.locator("[data-studio-catalog-tool-id]");
    await expect(tools.first()).toBeVisible();
    for (const tool of await tools.all()) {
      const toolId = await tool.getAttribute("data-studio-catalog-tool-id");
      assert(toolId && !verified.has(toolId), `분류에서 중복된 도구 ${toolId}`);
      verified.add(toolId);
      await expect(tool).toHaveAccessibleName(/.+ 사용$/u);
      await tool.scrollIntoViewIfNeeded();
      await checkArtwork(tool.locator("[data-studio-tool-art]"));
    }
    await dialog.getByRole("button", { name: "도구 분류로 돌아가기" }).click();
  }
  const all = dialog.locator('[data-studio-tool-category="all"]');
  await expect(all).toHaveAccessibleName(`전체 ${verified.size}개 한눈에`);
  assert(verified.size >= 35, `검사한 기본 도구 ${verified.size}개`);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  log(`전체 도구 8개 분류, ${verified.size}개 버튼의 이름·그림 확인`);
}

async function checkProjectMenus(page: Page) {
  await showStudioProjectWindowTools(page);
  const panel = page.locator('[data-studio-drawing-project-tools="true"]');
  const triggers = panel.locator("[data-studio-main-menu-trigger]");
  await expect(triggers.first()).toBeVisible();
  const count = await triggers.count();
  assert(count > 0);
  await page.setViewportSize({ width: 1600, height: 1100 });
  for (const trigger of await triggers.all()) {
    await expect(trigger).toHaveAccessibleName(/\S/u);
    await expect(trigger.locator("[data-studio-main-menu-chevron]")).toBeInViewport();
  }
  const menu = await openStudioMainMenu(page, "brush");
  assert(await menu.getByRole("menuitem").count() >= 4, "그리기 메뉴 항목 누락");
  await expect(menu.getByRole("menuitem", { name: /^펜(?:\s|$)/u }).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  log(`프로젝트 메뉴 ${count}개 펼침 표시·그리기 메뉴 키보드 열기/닫기`);
}

async function main() {
  const existing = process.env.STUDIO_QA_BASE_URL?.trim() || process.env.TOONSPECTRUM_VERIFY_BASE_URL?.trim();
  let preview: ChildProcess | undefined, browser: Browser | undefined, context: BrowserContext | undefined;
  try {
    let base = existing;
    if (!base) {
      const port = await findFreePort();
      preview = spawnVitePreview({ port, runner: "node-vite-bin", outDir: process.env.TOONSPECTRUM_VERIFY_DIST?.trim() || undefined });
      base = `http://127.0.0.1:${port}`;
    }
    const url = new URL("/studio/canvas", base);
    await waitForServer(url.origin);
    browser = existing ? await chromium.connectOverCDP("http://127.0.0.1:9223", { noDefaults: true, isLocal: true }) :
      await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: "ko-KR", reducedMotion: "reduce" });
    await context.addInitScript(() => {
      localStorage.setItem("toonstudio-studio-quick-start-dismissed", "1");
      localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const rail = page.getByRole("toolbar", { name: "그리기 도구", exact: true });
    await rail.waitFor({ timeout: 120_000 });
    const header = page.locator('[data-studio-drawing-clarity-header="true"]').filter({ visible: true });
    await checkNamedArtwork(rail, toolbarTools);
    await checkNamedArtwork(header, headerTools);
    await checkControls(header);
    await checkControls(rail);
    log(`이름과 픽셀을 확인한 기본 레일 ${Object.keys(toolbarTools).length}개, 상단 명령 ${Object.keys(headerTools).length}개`);
    await checkBrushOptions(page, rail);
    await checkCatalog(page);
    await checkProjectMenus(page);
    assert.deepEqual(errors, [], "원고 실행 오류");
    log(`PASS ${url.origin} 원고 아이콘·이름·선택 경로`);
  } finally {
    await context?.close();
    await browser?.close();
    if (preview) await stopChildProcess(preview);
  }
}
main().catch(error => { console.error("[verify-icons]", error); process.exitCode = 1; });
