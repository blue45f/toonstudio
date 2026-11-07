import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures/non-studio-test";

// 로컬 브라우저의 가상 알림만 사용한다. 계정·서버 알림은 읽거나 변경하지 않는다.
const LONG_TITLE = "notification-title-".repeat(12);
const LONG_BODY = "https://example.test/" + "long-notification-body-".repeat(18);

for (const width of [320, 390, 1440]) {
  for (const theme of ["starlight", "light", "contrast"]) {
    test(`${width}px ${theme}: 알림 필터·긴 문구·옵션 메뉴`, async ({ page }, testInfo) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(({ theme, title, body }) => {
        localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
        localStorage.setItem("toonstudio-theme", JSON.stringify({ state: { preference: theme, studioPreference: "inherit" }, version: 0 }));
        sessionStorage.setItem("toonstudio-compat-dismissed", "true");
        localStorage.setItem("toonstudio-engagement-v1", JSON.stringify({
          version: 1,
          state: {
            notifications: [{
              id: "notification-ux-fixture", category: "system", title, body, href: "/",
              createdAt: "2026-09-29T12:00:00.000Z", readAt: null, archivedAt: null,
              snoozedUntil: null, sourceKey: "test:notification-ux",
            }],
          },
        }));
      }, { theme, title: LONG_TITLE, body: LONG_BODY });
      await page.route("**/api/**", async (route) => {
        await route.fulfill(new URL(route.request().url()).pathname.endsWith("/auth/session")
          ? { status: 200, json: { authenticated: false, user: null } }
          : { status: 503, json: { message: "알림 센터 로컬 검증: 서버 미연결" } });
      });

      await page.goto("/notifications", { waitUntil: "domcontentloaded" });
      const card = page.getByRole("article", { name: LONG_TITLE });
      await expect(card).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-design-theme", theme);
      const filters = page.getByRole("group", { name: "알림 필터" });
      await expect(filters.getByRole("button")).toHaveCount(8);
      for (const button of await filters.getByRole("button").all()) {
        const bounds = await button.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
        expect(bounds?.x).toBeGreaterThanOrEqual(0);
        expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
      }
      expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await filters.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath("filters-and-notification.png"), fullPage: false });

      const trigger = card.getByRole("button", { name: "알림 옵션" });
      await trigger.focus();
      await trigger.press("ArrowDown");
      const menu = page.getByRole("menu", { name: "알림 옵션" });
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "읽음으로" })).toBeFocused();
      await page.keyboard.press("End");
      await expect(menu.getByRole("menuitem", { name: "보관", exact: true })).toBeFocused();
      const menuBounds = await menu.boundingBox();
      expect(menuBounds?.x).toBeGreaterThanOrEqual(0);
      expect((menuBounds?.x ?? 0) + (menuBounds?.width ?? 0)).toBeLessThanOrEqual(width);
      expect((menuBounds?.y ?? 0) + (menuBounds?.height ?? 0)).toBeLessThanOrEqual(1000);
      await page.screenshot({ path: testInfo.outputPath("notification-menu.png"), fullPage: false });
      const accessibility = await new AxeBuilder({ page })
        .include('[role="group"][aria-label="알림 필터"]')
        .include('article[aria-label]')
        .include('[role="menu"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(accessibility.violations).toEqual([]);
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();

      await trigger.press("ArrowDown");
      await menu.getByRole("menuitem", { name: "읽음으로" }).press("Enter");
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
      await expect(filters.getByRole("button", { name: "안 읽음 0" })).toBeVisible();
      await trigger.press("ArrowDown");
      await expect(menu.getByRole("menuitem", { name: "안 읽음으로" })).toBeVisible();
      await menu.getByRole("menuitem", { name: "보관", exact: true }).click();
      await expect(card).toBeHidden();
      await filters.getByRole("button", { name: "보관 1" }).click();
      await expect(card).toBeVisible();
      expect(pageErrors).toEqual([]);
    });
  }
}
