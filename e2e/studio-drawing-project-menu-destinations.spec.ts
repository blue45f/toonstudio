import { expect, test } from "@playwright/test";

import { openStudioMainMenu } from "../scripts/lib/studio-shell-interactions";

test("원고 메뉴에서 빠른 시작, 캔버스 문서 설정, 내 브러시를 직접 연다", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/studio/draft/drawing-project-menu-destinations", { waitUntil: "domcontentloaded" });
  const rail = page.getByRole("toolbar", { name: "그리기 도구", exact: true });
  await expect(rail).toBeVisible({ timeout: 90_000 });
  await rail.locator('[data-studio-rail-tool-id="eraser"]').click();

  const file = await openStudioMainMenu(page, "file");
  await file.locator('[data-studio-menu-item-id="quick-start"]').click();
  const steps = page.locator('[data-studio-quickstart-workflow]');
  await expect(steps).toBeVisible();
  await steps.locator('[data-studio-quickstart-step="draw"] button').click();
  await expect(steps).toBeHidden();
  await expect(rail.locator('[data-studio-rail-tool-id="pen"]')).toHaveAttribute("aria-pressed", "true");

  const canvas = await openStudioMainMenu(page, "canvas");
  await canvas.locator('[data-studio-menu-item-id="canvas-settings"]').click();
  const inspector = page.locator("#studio-drawing-clarity-panel-layers");
  await expect(inspector).toBeVisible();
  await expect(inspector.locator('[data-studio-inspector-primary-tab="document"]')).toHaveAttribute("aria-selected", "true");
  const height = inspector.getByLabel(/^높이 [\d,]+px$/u);
  const initial = Number((await height.innerText()).replaceAll(",", ""));
  await inspector.getByRole("button", { name: "높이 240px 늘리기" }).click();
  await expect(height).toHaveText(String(initial + 240));
  await inspector.getByRole("button", { name: "높이 240px 줄이기" }).click();
  await expect(height).toHaveText(String(initial));

  const brush = await openStudioMainMenu(page, "brush");
  await brush.locator('[data-studio-menu-item-id="my-brushes"]').click();
  const library = page.getByRole("dialog", { name: "서브 도구 팝업" });
  await expect(library).toBeVisible();
  await expect(library.getByRole("searchbox", { name: "내 브러시 검색" })).toBeVisible();
});
