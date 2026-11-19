import { expect, test } from "@playwright/test";

import { openStudioAllTools } from "../scripts/lib/studio-bg3d-ui-interactions";
import { openStudioLayerNavigator, runStudioClarityAction } from "../scripts/lib/studio-shell-interactions";

for (const width of [1440, 390]) {
  test(`${width}px 원고에서 다른 3D 캐릭터를 선택하고 취소·삽입·복원한다`, async ({ page }) => {
    test.setTimeout(360_000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const draftPath = `/studio/draft/character-selection-${width}`;
    await page.goto(draftPath, { waitUntil: "domcontentloaded" });
    const header = page.locator("[data-studio-drawing-clarity-header]:visible");
    await expect(header).toBeVisible({ timeout: 120_000 });
    const canvas = page.locator("[data-studio-canvas-viewport]").first();
    await expect(canvas).toHaveAttribute("data-studio-canvas-input-state", "ready", { timeout: 90_000 });
    await expect(page).toHaveURL((url) =>
      url.pathname === draftPath && url.searchParams.get("workspace") === "draw" && !url.searchParams.has("tool3d"));
    const manuscriptUrl = page.url();
    const historyPosition = () => page.evaluate(() =>
      (window as Window & { navigation: { currentEntry: { index: number } } }).navigation.currentEntry.index);
    const manuscriptPosition = await historyPosition();
    const dialog = page.locator('[data-studio-vrm-dialog="true"]');
    if (width === 390) {
      await runStudioClarityAction(page, "character3d");
    } else {
      const trigger = header.locator('[data-studio-main-menu-trigger="3d"]');
      await trigger.focus();
      await page.keyboard.press("Enter");
      const menu = page.getByRole("menu").filter({ visible: true }).last();
      await expect(menu.getByText("기본 데생 인형", { exact: true })).toBeVisible();
      await menu.getByText("인물·포즈 편집", { exact: true }).click();
    }

    const search = dialog.getByPlaceholder("캐릭터 이름 검색...");
    await expect(search).toBeVisible({ timeout: 120_000 });
    await search.fill("해당하는캐릭터없음");
    await expect(dialog.getByText(/일치하는 캐릭터가 없어요/u)).toBeVisible();
    await search.fill("레인저");
    const ranger = dialog.getByRole("button", { name: "쿼터니어스 레인저 (여성) 선택", exact: true });
    await ranger.click();
    await expect(ranger).toHaveAttribute("aria-pressed", "true");
    await expect.poll(historyPosition).toBe(manuscriptPosition + 1);
    await dialog.locator("footer").getByRole("button", { name: "닫기", exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 60_000 });
    await expect(page).toHaveURL(manuscriptUrl);
    expect(await historyPosition()).toBe(manuscriptPosition);
    await page.goForward();
    await expect(search).toBeVisible({ timeout: 90_000 });
    await page.goBack();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(manuscriptUrl);
    await expect(header).toBeVisible();
    await openStudioLayerNavigator(page, 30_000);
    const rows = page.locator("[data-studio-layer-row]:visible");
    await expect(rows).toHaveCount(0);
    if (width === 390) {
      await page.getByRole("dialog", { name: "작업 패널" }).getByRole("button", { name: "설정 닫기", exact: true }).click();
    }

    const catalog = await openStudioAllTools(page);
    await catalog.locator('button[data-studio-catalog-tool-id="vrm3d"]').click();
    await expect(search).toBeVisible({ timeout: 120_000 });
    await search.fill("농민");
    const model = dialog.getByRole("button", { name: "쿼터니어스 농민 (여성) 선택", exact: true });
    await model.click();
    await expect(model).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.locator("header").first()).toContainText("Quaternius Peasant (Female)", { timeout: 120_000 });
    const insert = dialog.getByRole("button", { name: "이 포즈로 추가", exact: true });
    await expect(insert).toBeEnabled({ timeout: 90_000 });
    await test.info().attach(`선택한 캐릭터 ${width}px`, { body: await dialog.screenshot(), contentType: "image/png" });
    await insert.click();
    await expect(dialog).toBeHidden({ timeout: 90_000 });
    await expect(page).toHaveURL((url) => url.pathname === draftPath && url.searchParams.get("workspace") === "draw");
    await openStudioLayerNavigator(page, 30_000);
    const actor = rows.filter({ hasText: "Quaternius Peasant (Female)" });
    await expect(actor).toHaveCount(1);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(header).toBeVisible({ timeout: 120_000 });
    await expect(canvas).toHaveAttribute("data-studio-canvas-input-state", "ready", { timeout: 90_000 });
    await openStudioLayerNavigator(page, 30_000);
    await expect(actor).toBeVisible({ timeout: 30_000 });
    await actor.click({ position: { x: 12, y: 18 } });
    await expect(actor).toHaveAttribute("aria-selected", "true");
    await test.info().attach(`복원한 원고 레이어 ${width}px`, { body: await page.screenshot(), contentType: "image/png" });
    expect(errors).toEqual([]);
  });
}
