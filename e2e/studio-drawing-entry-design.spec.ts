import { expect, test } from "@playwright/test";

import { showStudioProjectWindowTools } from "../scripts/lib/studio-shell-interactions";

for (const size of [{ width: 1440, height: 960 }, { width: 390, height: 844 }]) {
  test(`드로잉 진입 경로가 달라도 같은 원고 도구와 캔버스 배치를 사용한다 (${size.width}px)`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(size);
    const manuscript = "/studio/draft/drawing-entry-design";
    const editor = page.locator("[data-studio-editor=true]");
    const canvas = editor.locator("[data-studio-canvas-viewport]").first();
    const header = editor.locator("[data-studio-drawing-clarity-header=true]");
    const eraser = editor.locator('[data-studio-rail-tool-id="eraser"], [data-studio-mobile-tool="eraser"]').filter({ visible: true });
    let initialCanvas: Awaited<ReturnType<typeof canvas.boundingBox>> = null;

    async function verifyEditor() {
      await expect(header).toBeVisible({ timeout: 60_000 });
      await expect(editor).toHaveAttribute("data-studio-drawing-presentation", "integrated");
      await expect(editor.locator("[data-studio-drawing-app-bar=true]")).toHaveCount(0);
      await expect(canvas).toBeVisible();
      await eraser.click();
      await expect(eraser).toHaveAttribute("aria-pressed", "true");
      const bounds = await canvas.boundingBox();
      expect(bounds).not.toBeNull();
      if (initialCanvas) expect(bounds).toEqual(initialCanvas);
      else initialCanvas = bounds;
    }

    for (const query of ["", "?drawingShell=integrated", "?drawingShell=app&uiMode=focus&startTool=draw"]) {
      await page.goto(manuscript + query, { waitUntil: "domcontentloaded" });
      await verifyEditor();
    }
    await page.goto("/studio?drawingShell=app&uiMode=focus&startTool=draw&source=pwa", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-studio-drawing-home-chrome=true]")).toBeVisible();
    await page.goto(manuscript, { waitUntil: "domcontentloaded" });
    await verifyEditor();

    if (size.width === 1440) {
      const bounds = await canvas.boundingBox();
      if (!bounds) throw new Error("원고 캔버스를 찾지 못했습니다.");
      await canvas.click({ button: "right", position: { x: Math.floor(bounds.width) - 10, y: Math.floor(bounds.height) - 10 } });
      const menu = page.getByRole("menu", { name: "캔버스 작업" });
      await expect(menu).toBeVisible();
      const menuBounds = await menu.boundingBox();
      expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(size.width);
      expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(size.height);
      const last = menu.getByRole("menuitem", { name: "스마트 도형 켜기" });
      const hitPoints = await last.evaluate(button => {
        const rect = button.getBoundingClientRect();
        const y = rect.top + rect.height / 2;
        return [rect.left + rect.width / 2, rect.right - 4].map(x => button.contains(document.elementFromPoint(x, y)));
      });
      expect(hitPoints).toEqual([true, true]);
      await last.click();
      await expect(menu).toHaveCount(0);
      await canvas.click({ button: "right", position: { x: Math.floor(bounds.width) - 10, y: Math.floor(bounds.height) - 10 } });
      await menu.getByRole("menuitem", { name: "펜으로 그리기" }).click();
      await expect(menu).toHaveCount(0);
      await expect(eraser).toHaveAttribute("aria-pressed", "false");
    }

    await showStudioProjectWindowTools(page);
    await page.goto(manuscript + "?drawingShell=app&uiMode=focus&startTool=draw", { waitUntil: "domcontentloaded" });
    await expect(canvas).toBeVisible({ timeout: 60_000 });
    await expect(editor.locator("[data-studio-clarity-entry]")).toBeVisible();
    await expect(header).toHaveCount(0);
  });
}

test("선화 역할 링크와 오래된 역할 링크로 같은 원고 도구를 연다", async ({ page }) => {
  const manuscript = "/studio/draft/drawing-role-entry";
  const editor = page.locator("[data-studio-editor=true]");
  const header = editor.locator("[data-studio-drawing-clarity-header=true]");
  const canvas = editor.locator("[data-studio-canvas-viewport]").first();
  await page.goto(manuscript, { waitUntil: "domcontentloaded" });
  await expect(header).toBeVisible({ timeout: 60_000 });
  await expect(canvas).toBeVisible();
  const pen = editor.locator('[data-studio-rail-tool-id="pen"]').filter({ visible: true }).first();
  await pen.click();
  await expect(pen).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();

  for (const role of ["lineart", "retired-workspace"]) {
    await page.goto(manuscript + "?roleWorkspace=" + role, { waitUntil: "domcontentloaded" });
    await expect(header).toBeVisible({ timeout: 60_000 });
    await expect(canvas).toBeVisible();
    await pen.click();
    await expect(pen).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => canvas.boundingBox()).toEqual(bounds);
  }

  await page.goto(manuscript + "?roleWorkspace=review", { waitUntil: "domcontentloaded" });
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect(header).toHaveCount(0);
  await page.goBack();
  await expect(header).toBeVisible({ timeout: 60_000 });
});

test("같은 원고에서 간단한 그리기와 퀵·일반 모드를 전환하고 방문 기록의 도구를 복원한다", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/create", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "캔버스 열기", exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/p\/[^/]+\/d\/[^?]+\?.*\broom=/, { timeout: 60_000 });
  const ownerUrl = new URL(page.url());
  const manuscript = ownerUrl.pathname;
  const ownerRoom = ownerUrl.searchParams.get("room");
  const editor = page.locator("[data-studio-editor=true]");
  const header = editor.locator("[data-studio-drawing-clarity-header=true]");
  const railTool = (tool: string) => editor.locator(`[data-studio-rail-tool-id="${tool}"]`).filter({ visible: true }).first();

  async function expectMode(density: string, tool: string, room = ownerRoom) {
    await expect(editor).toHaveAttribute("data-studio-ui-density", density, { timeout: 60_000 });
    await expect(railTool(tool)).toHaveAttribute("aria-pressed", "true");
    const url = new URL(page.url());
    expect(url.pathname).toBe(manuscript);
    expect(url.searchParams.get("room")).toBe(room);
    expect(url.hash).toBe("#canvas");
  }

  ownerUrl.searchParams.set("uiMode", "full");
  ownerUrl.searchParams.set("startTool", "select");
  ownerUrl.hash = "canvas";
  await page.goto(ownerUrl.href, { waitUntil: "domcontentloaded" });
  await expectMode("full", "select");
  const firstEditor = await editor.elementHandle();
  await editor.locator("[data-studio-clarity-entry]").filter({ visible: true }).first().click();
  await expect(header).toBeVisible();
  await expectMode("simple", "select");

  await page.getByRole("button", { name: "퀵모드", exact: true }).filter({ visible: true }).first().click();
  await expectMode("focus", "pen");
  await page.getByRole("button", { name: "일반 모드", exact: true }).filter({ visible: true }).first().click();
  await expectMode("simple", "select");
  await page.goBack();
  await expectMode("focus", "pen");
  await page.goForward();
  await expectMode("simple", "select");

  await railTool("eraser").click();
  await expectMode("simple", "eraser");
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.set("room", "qa-room-change");
    history.pushState(history.state, "", url);
    window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  });
  await expectMode("simple", "eraser", "qa-room-change");
  await page.goBack();
  await expectMode("simple", "eraser");
  expect(await firstEditor?.evaluate((node) => node === document.querySelector("[data-studio-editor=true]"))).toBe(true);
});
