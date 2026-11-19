import { buffer } from "node:stream/consumers";

import { expect, test, type Page } from "@playwright/test";
import { decodePng } from "image-js";

import { STUDIO_FILTER_DIALOG_CATALOG } from "../apps/web/src/domains/creator/filter/studio-filter-catalog";
import { openStudioExportPanel, openStudioMainMenu, showStudioProjectWindowTools } from "../scripts/lib/studio-shell-interactions";

const singleFilters = STUDIO_FILTER_DIALOG_CATALOG.map(({ kind }) => kind);

async function downloadCurrentArtwork(page: Page) {
  const panel = await openStudioExportPanel(page);
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "현재 페이지 PNG 다운로드", exact: true }).click();
  const stream = await (await download).createReadStream();
  if (!stream) throw new Error("내보낸 원고 PNG를 읽을 수 없습니다.");
  const pixels = decodePng(await buffer(stream));
  const close = panel.getByRole("button", { name: "출력 설정 닫기" });
  if (await close.isVisible()) await close.click();
  return Buffer.from(pixels.getRawImage().data);
}

async function readPagePreview(page: Page) {
  const url = await page.locator("[data-studio-canvas-viewport] .konvajs-content").evaluate(stage => {
    const layers = [...stage.querySelectorAll("canvas")];
    if (!layers.length) throw new Error("표시 중인 원고 레이어가 없습니다.");
    const thumbnail = document.createElement("canvas");
    thumbnail.width = 320;
    thumbnail.height = Math.round(320 * layers[0].height / layers[0].width);
    const drawing = thumbnail.getContext("2d");
    if (!drawing) throw new Error("원고 픽셀을 읽지 못했습니다.");
    for (const layer of layers) drawing.drawImage(layer, 0, 0, thumbnail.width, thumbnail.height);
    return thumbnail.toDataURL();
  });
  return decodePng(Buffer.from(url.substring(url.indexOf(",") + 1), "base64"));
}

async function drawTestStroke(page: Page, mobile: boolean) {
  const pen = mobile
    ? page.locator('[data-studio-mobile-editing-dock="true"]').getByRole("button", { name: "펜", exact: true })
    : page.locator('[data-studio-rail-tool-id="pen"]');
  await expect(pen).toBeVisible({ timeout: 90_000 });
  const viewport = page.locator("[data-studio-canvas-viewport]").first();
  await expect(viewport).toHaveAttribute("data-studio-canvas-input-state", "ready", { timeout: 90_000 });
  if (await pen.getAttribute("aria-pressed") !== "true") await pen.click();
  const canvas = await viewport.boundingBox();
  if (!canvas) throw new Error("원고 작업 영역이 없습니다.");
  await page.mouse.move(canvas.x + canvas.width * 0.48, canvas.y + canvas.height * 0.43);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.56, canvas.y + canvas.height * 0.53, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "되돌리기 · 실행취소", exact: true }).filter({ visible: true })).toBeEnabled();
}

for (const width of [1440, 390]) {
  const mobile = width === 390;
  test(`${width}px 원고의 첫 필터 목록에서 선택을 바꾸고 적용·취소한다`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: mobile ? 844 : 960 });
    await page.goto("/studio/draft/drawing-filter-entry?uiMode=full", { waitUntil: "domcontentloaded" });
    await drawTestStroke(page, mobile);

    async function openMosaic() {
      if (mobile) {
        await page.locator('[data-studio-clarity-more-trigger="true"]').filter({ visible: true }).click();
        const tasks = page.getByRole("dialog", { name: "원고 도구" });
        await tasks.locator('[data-drawing-task-category="drawing"]').click();
        const list = tasks.getByRole("combobox", { name: "필터 선택" });
        const ids = await list.locator("option").evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
        expect(ids).toEqual(expect.arrayContaining(singleFilters));
        await expect(list.locator('option[value="mosaic"]')).toBeEnabled();
        await list.selectOption("mosaic");
      } else {
        const menuBar = page.getByRole("navigation", { name: "원고 빠른 메뉴" });
        await menuBar.getByRole("menuitem", { name: "필터", exact: true }).click();
        const list = page.getByRole("menu", { name: "필터", exact: true });
        await expect(page.locator("[data-studio-brush-active-pill]").filter({ visible: true })).toContainText("브러시");
        expect(await list.locator("[data-studio-menu-item-id]").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-studio-menu-item-id")))).toEqual(expect.arrayContaining(singleFilters));
        await list.locator('[data-studio-menu-item-id="mosaic"]').click();
      }
      const dialog = page.getByRole("dialog", { name: "모자이크 / 픽셀화", exact: true });
      await expect(dialog).toBeVisible({ timeout: 45_000 });
      return dialog;
    }

    const initial = await openMosaic();
    await initial.getByRole("button", { name: /다른 필터 둘러보기/u }).click();
    await expect(initial.locator("[data-studio-filter-gallery-card]")).toHaveCount(singleFilters.length);
    await initial.locator('[data-studio-filter-gallery-card="gaussian-blur"]').click();
    const blur = page.getByRole("dialog", { name: "가우시안 블러", exact: true });
    await expect(blur.getByRole("slider", { name: "반지름", exact: true })).toBeVisible();
    await blur.getByRole("button", { name: "취소", exact: true }).click();
    await expect(blur).toBeHidden();
    const apply = await openMosaic();
    await testInfo.attach(`filter-selected-${width}`, { body: await page.screenshot(), contentType: "image/png" });
    await apply.getByRole("button", { name: "적용", exact: true }).click();
    await expect(apply).toBeHidden({ timeout: 45_000 });
    await expect(page.getByRole("status").filter({ hasText: "원본을 보존한 페이지 필터 레이어를 추가했어요" }).first()).toBeVisible();
  });
}

test("가로 태블릿에서 선택한 이미지의 브러시와 필터를 키보드로 열고 늦은 엠보스 처리를 되돌린다", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/studio/draft/tablet-image-tools", { waitUntil: "domcontentloaded" });
  const layers = await openStudioMainMenu(page, "layer");
  const filePicker = page.waitForEvent("filechooser");
  await layers.getByRole("menuitem", { name: /^이미지…/u }).click();
  await (await filePicker).setFiles("apps/web/public/assets/studio/cc0-20260906/previews/kenney-watercraft-boat-speed-b.png");

  const tools = page.locator(".studio-drawing-selected-tools");
  const brush = tools.getByRole("button", { name: "브러시", exact: true });
  const filter = tools.getByRole("menuitem", { name: "필터", exact: true });
  await expect(brush).toBeInViewport();
  await expect(filter).toBeInViewport();
  await brush.click();
  await page.getByRole("button", { name: "펜·브러시 · 닫기" }).click();
  await expect(brush).toBeFocused();
  await brush.press("Tab");
  await expect(filter).toBeFocused();
  // 가져온 배의 모래색 선체에서 픽셀을 읽어 도구 초점이나 상태 알림에 영향을 받지 않는다.
  const hull = new Map<number, number>();
  await expect.poll(async () => {
    const image = await readPagePreview(page);
    hull.clear();
    for (let i = 0; i < image.size; i++) {
      const [r, g, b] = image.getPixelByIndex(i);
      if (r > 230 && g > 210 && g < 241 && b > 145 && b < 195) hull.set(i, (r << 16) | (g << 8) | b);
    }
    return hull.size;
  }).toBeGreaterThan(30);
  async function changedHullPixels() {
    const image = await readPagePreview(page);
    let different = 0;
    for (const [index, color] of hull) {
      const [r, g, b] = image.getPixelByIndex(index);
      if (((r << 16) | (g << 8) | b) !== color) different++;
    }
    return different;
  }
  await filter.press("ArrowDown");
  await page.getByRole("menu", { name: "필터", exact: true }).locator('[data-studio-menu-item-id="emboss"]').click();
  const dialog = page.getByRole("dialog", { name: /엠보스/u });
  await expect(dialog.getByText("선택한 이미지 레이어에 비파괴 필터로 적용합니다.")).toBeVisible();
  // SW가 모듈을 캐시해도 실제 Worker의 첫 처리 요청을 늦춘 뒤 원래 요청과 전송 버퍼를 그대로 보낸다.
  await page.evaluate(() => {
    const post = Worker.prototype.postMessage;
    const queued: Array<() => void> = [];
    Worker.prototype.postMessage = function (this: Worker, ...args: Parameters<Worker["postMessage"]>) {
      const [message] = args;
      if (typeof message?.type === "string" && message.type.startsWith("studio-image-filter/")) {
        queued.push(() => Reflect.apply(post, this, args));
        document.documentElement.dataset.heldFilterMessages = String(queued.length);
      } else {
        Reflect.apply(post, this, args);
      }
    };
    window.addEventListener("qa-release-filter-processing", () => {
      Worker.prototype.postMessage = post;
      for (const send of queued) send();
      delete document.documentElement.dataset.heldFilterMessages;
    }, { once: true });
  });
  const releaseWorker = () => page.evaluate(() => { window.dispatchEvent(new Event("qa-release-filter-processing")); });
  try {
    await dialog.getByRole("button", { name: "적용", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("html")).toHaveAttribute("data-held-filter-messages", /^[1-9]\d*$/);
    const progress = page.getByRole("progressbar", { name: "필터 렌더링" });
    await expect(progress).toBeVisible();
    await new Promise(resolve => setTimeout(resolve, 4_500));
    await expect(progress).toBeVisible();
    await releaseWorker();
    await expect(progress).toBeHidden({ timeout: 45_000 });
    await expect.poll(changedHullPixels).toBeGreaterThan(30);
    const filteredPixels = await downloadCurrentArtwork(page);
    await page.getByRole("button", { name: "되돌리기 · 실행취소", exact: true }).click();
    await expect.poll(changedHullPixels).toBe(0);
    const restoredPixels = await downloadCurrentArtwork(page);
    expect(restoredPixels.length).toBe(filteredPixels.length);
    expect(restoredPixels.equals(filteredPixels)).toBe(false);
  } finally {
    if (!page.isClosed()) await releaseWorker();
  }
});

test("여러 줄인 프로젝트 메뉴에서 포인터를 옮겨 필터를 열 수 있다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studio/draft/project-filter", { waitUntil: "domcontentloaded" });
  await drawTestStroke(page, true);
  await showStudioProjectWindowTools(page);
  const menus = page.getByRole("menubar", { name: "프로젝트 메뉴" });
  await menus.getByRole("menuitem", { name: "캔버스", exact: true }).hover();
  await expect(menus.getByRole("menuitem", { name: "캔버스", exact: true })).toHaveAccessibleDescription(/도우미/u);
  await menus.getByRole("menuitem", { name: "필터", exact: true }).click();
  await page.getByRole("menu", { name: "필터", exact: true }).getByRole("menuitem", { name: /^필터 갤러리/u }).click();
  const gallery = page.getByRole("dialog", { name: /필터 갤러리/u });
  await gallery.getByRole("searchbox", { name: "효과 검색" }).fill("명도 반전");
  await gallery.getByRole("list", { name: "효과 목록" }).getByRole("button", { name: /^명도 반전/u }).click();
  await expect(gallery.getByRole("list", { name: "쌓인 효과" }).getByRole("button", { name: "명도 반전 끄기" })).toBeVisible();
  await gallery.getByRole("button", { name: "적용", exact: true }).click();
  await expect(gallery).toBeHidden({ timeout: 45_000 });
});

test("첫 필터 엔진 수신이 늦어도 취소·다시 선택해 원고에 한 번만 적용한다", async ({ page, context }) => {
  let releaseAssets: (() => void) | undefined;
  const held = new Promise<void>(resolve => { releaseAssets = resolve; });
  let delayedWorkers = 0;
  await context.route(/\/studio-svg-export\.worker(?:-[^/?.]+)?\.(?:js|ts)(?:\?|$)/u, async (route) => {
    delayedWorkers++;
    await held;
    await route.continue().catch(error => {
      if (!page.isClosed() && !String(error).includes("Target closed")) throw error;
    });
  });
  try {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/studio/draft/slow-first-filter", { waitUntil: "domcontentloaded" });
    await drawTestStroke(page, false);
    const quick = page.getByRole("navigation", { name: "원고 빠른 메뉴" });
    const open = async () => {
      await quick.getByRole("menuitem", { name: "필터", exact: true }).click();
      await page.getByRole("menu", { name: "필터", exact: true }).locator('[data-studio-menu-item-id="mosaic"]').click();
    };
    const preparing = page.locator('[data-studio-filter-preparing="true"]');
    await open();
    await expect(preparing).toBeVisible();
    await expect.poll(() => delayedWorkers).toBeGreaterThan(0);
    await preparing.getByRole("button", { name: "취소" }).click();
    await expect(preparing).toBeHidden();
    await open();
    await expect(preparing).toBeVisible();
    // 이전 3초 제한을 넘어 실제 모듈 요청을 보류한 뒤 같은 요청을 재개한다.
    await new Promise(resolve => setTimeout(resolve, 4_500));
    await expect(preparing).toBeVisible();
    releaseAssets?.();
    const dialog = page.getByRole("dialog", { name: "모자이크 / 픽셀화", exact: true });
    await expect(dialog).toHaveCount(1, { timeout: 45_000 });
    await dialog.getByRole("button", { name: "적용", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: "원본을 보존한 페이지 필터 레이어를 추가했어요" }).first()).toBeVisible();
  } finally {
    releaseAssets?.();
    await context.unrouteAll({ behavior: "wait" });
  }
});
