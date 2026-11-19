import { expect, test } from "@playwright/test";

test.describe("터치 휴대폰", () => {
  test.use({ isMobile: true, hasTouch: true });
  test("390px 원고에서 분류를 거치지 않고 브러시를 검색해 열고 닫는다", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/studio/draft/mobile-command-search", { waitUntil: "domcontentloaded" });
    const more = page.locator('[data-studio-clarity-more-trigger="true"]:visible');
    await expect(more).toBeVisible({ timeout: 90_000 });
    await more.tap();
    const tools = page.getByRole("dialog", { name: "원고 도구", exact: true });
    const categories = tools.getByRole("navigation", { name: "원고 도구 목적 고르기" });
    await expect(categories.getByRole("button")).toHaveCount(4);
    await expect(categories.locator("img[data-ready]")).toHaveCount(4);
    const geometry = await categories.getByRole("button").evaluateAll(buttons => buttons.map(item => {
      const { x, width, height } = item.getBoundingClientRect();
      return { x, width, height };
    }));
    for (const row of geometry) {
      expect(row.height).toBeGreaterThanOrEqual(44);
      expect(row.x).toBe(geometry[0].x);
      expect(row.x + row.width).toBeLessThanOrEqual(390);
    }
    await testInfo.attach("원고-도구-390", { body: await page.screenshot(), contentType: "image/png" });
    const search = tools.getByRole("searchbox", { name: "원고 명령 검색" });
    await search.fill("없는도구이름");
    await expect(tools.getByText("일치하는 도구나 필터가 없습니다.")).toBeVisible();
    await search.fill("모자이크");
    await expect(tools.getByRole("button", { name: /모자이크/u })).toBeVisible();
    await search.fill("브러시");
    await tools.getByRole("button", { name: "내 브러시 관리", exact: true }).tap();
    const library = page.getByRole("dialog", { name: "내 브러시 관리", exact: true });
    await expect(library.getByRole("searchbox", { name: "내 브러시 검색" })).toBeVisible({ timeout: 45_000 });
    await library.getByRole("button", { name: "브러시 관리 닫기" }).tap();
    await expect(library).toBeHidden();
    await expect(more).toBeVisible();
  });

  test("390px에서 전문 도구를 펼쳐 그림과 이름을 보고 같은 작품의 3D 배경을 연다", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/studio/assets?project=art-navigation", { waitUntil: "domcontentloaded" });
    const suite = page.getByTestId("studio-specialist-suite-bar");
    const toggle = suite.getByRole("button", { name: "전문 도구 전체" });
    await toggle.tap();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const entries = suite.getByRole("link");
    await expect(entries).toHaveCount(11);
    const rows = await entries.evaluateAll(links => links.map(link => {
      const { x, right, height } = link.getBoundingClientRect();
      return { x, right, height };
    }));
    for (const row of rows) {
      expect(row.x).toBeGreaterThanOrEqual(0);
      expect(row.right).toBeLessThanOrEqual(390);
      expect(row.height).toBeGreaterThanOrEqual(44);
    }
    await expect(suite.locator('img[data-ready]')).toHaveCount(9);
    await testInfo.attach("전문-도구-390", { body: await suite.screenshot(), contentType: "image/png" });
    const stage = suite.getByRole("link", { name: "3D 배경 편집기" });
    await stage.tap();
    await expect(page).toHaveURL(/\/studio\/bg3d\?project=art-navigation/u);
    await expect(page.locator('[data-scene-goal="background"]')).toBeVisible({ timeout: 100_000 });
    const goals = page.locator("[data-scene-goal]");
    await expect(goals.locator('img[data-ready]')).toHaveCount(3);
    const badge = page.getByTestId("studio-bg3d-active-engine-badge");
    await expect(badge).toHaveAttribute("data-readiness", "ready", { timeout: 120_000 });
    const steps = page.getByRole("navigation", { name: "장면 제작 단계" });
    for (const label of ["선택", "배치", "구도", "적용"]) {
      await expect(steps.getByText(label, { exact: true })).toBeVisible();
    }
    await testInfo.attach("배경-작업대-390", { body: await page.screenshot(), contentType: "image/png" });
    const handle = page.locator(".scene-assistant__sheet-handle");
    if (await handle.isVisible() && (await handle.getAttribute("aria-label"))?.includes("펼치기")) await handle.tap();
    await goals.first().scrollIntoViewIfNeeded();
    await goals.locator('img[data-ready]').first().waitFor();
    await testInfo.attach("배경-소재-390", { body: await page.screenshot(), contentType: "image/png" });
  });

});

test("태블릿과 PC에서 전문 도구의 순서와 프로젝트가 같고 키보드로 이동한다", async ({ page }, testInfo) => {
  await page.goto("/studio/assets?project=keyboard-art", { waitUntil: "domcontentloaded" });
  const suite = page.getByTestId("studio-specialist-suite-bar");
  for (const width of [820, 1440]) {
    await page.setViewportSize({ width, height: width === 820 ? 1180 : 960 });
    await expect(suite.getByRole("button", { name: "전문 도구 전체" })).toBeHidden();
    const stage = suite.getByRole("link", { name: "3D 배경 편집기" });
    await stage.focus();
    await page.keyboard.press("Tab");
    const character = suite.getByRole("link", { name: "3D 캐릭터 셰이퍼" });
    await expect(character).toBeFocused();
    await expect(character).toHaveAttribute("href", "/studio/assets/characters/new?project=keyboard-art");
    await expect(character.locator('[data-studio-tool-art="performer"] img[data-ready]')).toBeVisible();
    await testInfo.attach(`전문-도구-${width}`, { body: await page.screenshot(), contentType: "image/png" });
  }
});
