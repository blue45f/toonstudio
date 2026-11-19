import { expect, test } from "@playwright/test";

import { openStudioAllTools } from "../scripts/lib/studio-bg3d-ui-interactions";

const tools = [
  { id: "vrm3d", dialog: "3D 캐릭터 만들기", close: "닫기" },
  { id: "character-shaper", dialog: "캐릭터 셰이퍼", close: "닫기" },
  { id: "bg3d", dialog: "장면 도우미", close: "2D 원고로 복귀" },
] as const;

for (const mobile of [false, true]) {
  test.describe(mobile ? "모바일 원고" : "데스크톱 원고", () => {
    test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 }, hasTouch: mobile, isMobile: mobile });
    for (const tool of tools) test(`${tool.dialog} 닫기와 앞으로·뒤로가 같은 원고, 도구와 페이지를 복원한다`, async ({ page }) => {
      test.setTimeout(240_000);
      const path = "/studio/draft/qa-tool-return";
      await page.goto(path + "?workspace=draw&room=qa-tool-return&page=second&filter=ink#panel-two", { waitUntil: "domcontentloaded" });
      const header = page.locator(mobile ? "[data-studio-drawing-clarity-mobile-header]" : "[data-studio-drawing-clarity-header]").filter({ visible: true });
      await expect(header).toBeVisible({ timeout: 60_000 });
      const historyPosition = () => page.evaluate(() =>
        (window as Window & { navigation: { currentEntry: { index: number } } }).navigation.currentEntry.index);
      const originIndex = await historyPosition();
      const origin = page.url();
      const href = new URL(origin);
      expect(href.hash).toBe("#panel-two");
      expect(href.searchParams.get("page")).toBe("second");
      const catalog = await openStudioAllTools(page);
      await catalog.getByRole("searchbox").fill(tool.id);
      const row = catalog.locator(`[data-studio-catalog-tool-id="${tool.id}"]`);
      if (mobile) await row.tap();
      else await row.click();
      const modal = page.getByRole("dialog", { name: tool.dialog, exact: true });
      await expect(modal).toBeVisible({ timeout: 90_000 });
      await expect.poll(() => new URL(page.url()).searchParams.get("workspace")).toBe("3d");
      expect(new URL(page.url()).hash).toBe("#panel-two");
      expect(await historyPosition()).toBe(originIndex + 1);
      const close = tool.id === "bg3d"
        ? modal.getByTestId("studio-bg3d-header-return-2d")
        : modal.getByRole("button", { name: tool.close, exact: true }).filter({ visible: true }).last();
      await expect(close).toHaveAccessibleName(tool.close);
      if (mobile) await close.tap();
      else await close.click();
      await expect(modal).toBeHidden();
      await expect(page).toHaveURL(origin);
      expect(await historyPosition()).toBe(originIndex);
      await expect(header).toBeVisible();
      await expect(page.locator("[data-studio-canvas-viewport]").first()).toBeVisible();
      // 닫은 방문 기록에서 앞으로·뒤로 한 단계면 같은 도구와 같은 원고가 각각 열려야 한다.
      await page.goForward();
      await expect(modal).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(origin);
      expect(await historyPosition()).toBe(originIndex);
      await expect(modal).toBeHidden();
      await expect(header).toBeVisible();
    });
  });
}
