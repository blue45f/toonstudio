import { expect, test } from "./fixtures/non-studio-test";

// UI·권한 안내 fixture다. 운영 관리자 로그인이나 데이터 변경 성공으로 집계하지 않는다.
for (const theme of ["light", "dark", "contrast"] as const) {
  test(`관리자 모바일 탐색과 명령 검색의 포커스·닫기·크기 전환: ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((selectedTheme) => {
      localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
      localStorage.setItem("toonstudio-theme", JSON.stringify({ state: { preference: selectedTheme, studioPreference: "inherit", theme: selectedTheme }, version: 0 }));
    }, theme);
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const user = { id: "ux-admin-fixture", name: "검증용 관리자", email: "ux-admin@example.test", image: null, role: "admin" };
      const session = path === "/api/auth/session";
      const me = path === "/api/admin/me";
      await route.fulfill({ status: session || me ? 200 : 503, json: session ? { authenticated: true, user } : me ? user : { error: "의도적인 조회 장애 fixture" } });
    });
    await page.goto("/admin/overview", { waitUntil: "domcontentloaded" });
    const shell = page.locator('[data-admin-shell="true"]');
    await expect(shell).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-design-theme", theme);
    const trigger = shell.getByRole("button", { name: "관리자 메뉴 열기", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "관리자 메뉴", exact: true });
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole("button", { name: "관리자 메뉴 닫기", exact: true });
    await expect(close).toBeFocused();
    await close.press("Shift+Tab");
    await expect(dialog.getByRole("link", { name: "사이트", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    const ids = await page.locator("[id]").evaluateAll((elements) => elements.map((element) => element.id));
    expect(new Set(ids).size).toBe(ids.length);
    await page.screenshot({ path: info.outputPath(`admin-mobile-${theme}.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
    await page.setViewportSize({ width: 390, height: 844 });
    const command = shell.locator('[data-admin-command-trigger="true"]');
    await expect(command).toHaveAccessibleName(/\S/u);
    const size = await command.boundingBox();
    expect(size?.width).toBeGreaterThanOrEqual(44);
    expect(size?.height).toBeGreaterThanOrEqual(44);
    await command.click();
    const palette = page.getByRole("dialog");
    const input = palette.getByRole("combobox");
    await expect(input).toBeFocused();
    await expect(input).toHaveAccessibleName(/\S/u);
    await input.press("Shift+Tab");
    await expect(palette.getByRole("button", { name: "명령 팔레트 닫기" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(palette).toHaveCount(0);
    await expect(command).toBeFocused();
    await page.keyboard.press("Control+k");
    await expect(input).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(palette).toHaveCount(0);
    await expect(command).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  });
}

test("비로그인 관리자 진입은 접근 안내이고 내부 기능 성공이 아니다", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ status: 200, json: { authenticated: false, user: null } }));
  await page.goto("/admin/overview");
  await expect(page.locator('[data-admin-access-state="guest"]')).toBeVisible();
  await expect(page.locator('[data-admin-shell="true"]')).toHaveCount(0);
});
