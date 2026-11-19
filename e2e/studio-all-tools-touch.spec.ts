import { expect, test } from "@playwright/test";

import { openStudioAllTools } from "../scripts/lib/studio-bg3d-ui-interactions";
import { openStudioMainMenu } from "../scripts/lib/studio-shell-interactions";

test.describe("원고 도구 카탈로그의 터치 조작", () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const [width, height, zoom] of [[390, 844, 100], [320, 700, 200]]) {
    test(`${width}px · 글꼴 ${zoom}%에서 분류·별칭과 마지막 도구를 터치할 수 있다`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height });
      await page.goto("/studio/draft/catalog-touch", { waitUntil: "domcontentloaded" });
      await page.locator('[data-studio-drawing-clarity-mobile-header=true]').filter({ visible: true }).waitFor({ state: "visible", timeout: 60_000 });
      const catalog = await openStudioAllTools(page);
      await catalog.locator('[data-studio-tool-category="all"]').waitFor();
      await page.evaluate(size => { document.documentElement.style.fontSize = `${size}%`; }, zoom);
      const targets = catalog.locator("[data-studio-tool-alias-chip], [data-studio-tool-category]");
      await expect(targets).toHaveCount(17);
      for (const button of await targets.all()) {
        const hit = await button.evaluate(el => {
          el.scrollIntoView({ behavior: "instant", block: "center" });
          const box = el.getBoundingClientRect();
          const own = (x: number) => el.contains(document.elementFromPoint(x, box.top + box.height / 2));
          return { height: box.height, width: box.width, center: own(box.left + box.width / 2), edge: own(box.right - 4) };
        });
        expect(hit.height).toBeGreaterThanOrEqual(44);
        expect(hit.width).toBeGreaterThanOrEqual(44);
        expect(hit.center && hit.edge).toBe(true);
      }
      await catalog.locator('[data-studio-tool-category="view"]').tap();
      const bottom = catalog.locator('[data-studio-catalog-tool-id="rotate-view"]');
      await bottom.scrollIntoViewIfNeeded();
      await expect(bottom).toBeVisible();
      await expect(catalog.getByRole("button", { name: "모든 도구 고정" })).toBeVisible();
      const geometry = await bottom.evaluate(el => {
        const popup = el.closest('[role="dialog"]');
        const box = el.getBoundingClientRect();
        const footer = popup?.querySelector("footer")?.getBoundingClientRect();
        const popupBox = popup?.getBoundingClientRect();
        return {
          centerHit: el.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)),
          aboveFooter: footer !== undefined && box.bottom <= footer.top + 1,
          fits: popupBox !== undefined && popupBox.left >= 0 && popupBox.right <= innerWidth + 1,
        };
      });
      expect(geometry).toEqual({ centerHit: true, aboveFooter: true, fits: true });
      await bottom.tap();
      await expect(catalog).toBeHidden();
      await expect(page.locator("#studio-view-tools-hud-rotate").filter({ visible: true })).toBeVisible();
    });
  }
});

test("도구 메뉴에서 숫자로 시작하는 3D 분류를 열고 등록되지 않은 식별자를 거절한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/studio/draft/registered-menus", { waitUntil: "domcontentloaded" });
  await page.locator('[data-studio-drawing-clarity-header=true]').filter({ visible: true }).waitFor({ state: "visible", timeout: 60_000 });
  const menu = await openStudioMainMenu(page, "3d");
  await expect(menu.locator('[data-studio-menu-item-id="mannequin3d"]')).toBeVisible();
  await expect(openStudioMainMenu(page, "미등록-메뉴")).rejects.toThrow(/등록된 Studio 메뉴가 하나/);
});
