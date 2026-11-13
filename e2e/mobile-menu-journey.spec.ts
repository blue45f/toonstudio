import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures/non-studio-test";

import type { Page } from "@playwright/test";


test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("toonstudio-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 }));
  });
});

async function ready(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("main h1").first()).toBeVisible();
  if (path.startsWith("/sitemap") && !path.startsWith("/sitemap/all")) {
    await expect(page.locator("[data-sitemap-view]")).toBeVisible();
  }
  await page.evaluate(async () => { await document.fonts.ready; });
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test("목적 선택부터 작품 시작·전문 화면·뒤로가기까지 연결한다", async ({ page }) => {
  await ready(page, "/sitemap");
  await expect(page.locator('[data-sitemap-view="hub"]')).toBeVisible();
  await expect(page.locator(".site-footer__more")).not.toHaveAttribute("open", "");
  await page.locator('.sitemap-menu-sections a[href="/sitemap/create"]').click();
  await expect(page).toHaveURL(/\/sitemap\/create$/u);
  await expect(page.locator("main h1")).toHaveText("만들기");
  await expect(page.locator(".sitemap-menu-destinations > a")).toHaveCount(8);
  await page.locator('.sitemap-menu-destinations a[href="/create"]').click();
  await expect(page.getByTestId("create-start-persona-guide")).toBeVisible();
  await expect(page.getByTestId("create-rea-story-pipeline")).toHaveCount(0);
  await page.getByTestId("create-start-section-pipeline").click();
  await expect(page).toHaveURL(/section=pipeline/u);
  await expect(page.getByTestId("create-start-persona-guide")).toHaveCount(0);
  await expect(page.getByTestId("create-rea-story-pipeline")).toBeVisible();
  await expect(page.locator("main h1")).toBeFocused();
  await page.goBack();
  await expect(page.getByTestId("create-start-persona-guide")).toBeVisible();
  await expect(page.locator("main h1")).toBeFocused();
  await noOverflow(page);
});

test("전체 메뉴는 검색·빈 결과 복구·Escape 초점 복귀를 제공한다", async ({ page }) => {
  await ready(page, "/sitemap");
  const trigger = page.locator('[data-site-menu-entry="available"]');
  await trigger.click();
  const menu = page.locator("[data-site-menu-panel]");
  await expect(menu).toBeVisible();
  await menu.getByRole("searchbox").fill("/studio/bg3d");
  await expect(menu.locator('.site-menu-results a[href="/studio/bg3d"]')).toBeVisible();
  await expect(menu.locator(".site-menu-task")).toHaveCount(0);
  await menu.getByRole("searchbox").fill("없는메뉴123456");
  await expect(menu.getByRole("status")).toContainText("0");
  await menu.getByRole("button", { name: "목적별 메뉴 보기" }).click();
  await expect(menu.locator(".site-menu-task")).toHaveCount(7);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});

test("일곱 목적·전체 기능·푸터의 기존 목적지를 열 수 있다", async ({ page }) => {
  for (const section of ["discover", "create", "grow", "publish", "connect", "rest", "personal"]) {
    await ready(page, `/sitemap/${section}`);
    const links = page.locator(".sitemap-menu-destinations > a");
    expect(await links.count()).toBeGreaterThan(1);
    expect(await links.count()).toBeLessThanOrEqual(8);
    await noOverflow(page);
    await page.locator(".sitemap-menu-back").click();
    await expect(page).toHaveURL(/\/sitemap$/u);
  }
  await page.locator(".sitemap-menu-directory").click();
  await expect(page).toHaveURL(/\/sitemap\/all$/u);
  await expect(page.locator("#sitemap-directory")).toBeVisible();
  const footer = page.getByRole("contentinfo");
  await footer.locator(".site-footer__more > summary").click();
  await expect(footer.getByRole("navigation", { name: "자료·성장" }).getByRole("link", { name: "제작 기술" })).toBeVisible();
});

test("마켓은 목적 화면 하나만 표시하고 뒤로가기로 이전 선택을 복원한다", async ({ page }) => {
  await ready(page, "/market?context=kept");
  const tasks = page.getByRole("navigation", { name: "마켓 작업 선택" });
  await tasks.getByRole("link", { name: "이용 안내" }).click();
  await expect(page).toHaveURL(/context=kept.*section=guide/u);
  await expect(page.locator("main h1")).toHaveText("소재를 사용하기 전에");
  await expect(page.locator("main h1")).toBeFocused();
  await expect(page.locator('main input[type="search"]')).toHaveCount(0);
  await page.goBack();
  await expect(page.locator("main h1")).toHaveText("장면에 필요한 소재");
  await noOverflow(page);
});

test("새 목적 화면과 검색은 dark·light·contrast에서 접근할 수 있다", async ({ page }) => {
  for (const path of ["/sitemap", "/sitemap/create", "/create", "/market?section=guide"]) {
    await ready(page, path);
    for (const theme of ["dark", "light", "contrast"]) {
      await page.evaluate((selected) => { document.documentElement.dataset.theme = selected; }, theme);
      const result = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(result.violations, `${path} ${theme}`).toEqual([]);
      await noOverflow(page);
    }
  }
});

test("탐색 검색과 짧은 소재 검색어도 손가락으로 누를 크기를 유지한다", async ({ page }) => {
  await ready(page, "/discover");
  const search = page.getByRole("button", { name: "작품 검색", exact: true });
  await expect(search).toBeVisible();
  const searchBox = await search.boundingBox();
  expect(searchBox?.width).toBeGreaterThanOrEqual(48);
  expect(searchBox?.height).toBeGreaterThanOrEqual(48);
  await ready(page, "/market");
  const idea = page.getByRole("navigation", { name: "소재 검색 시작점" }).getByRole("link", { name: "펜선 ↗" });
  await expect(idea).toBeVisible();
  const ideaBox = await idea.boundingBox();
  expect(ideaBox?.width).toBeGreaterThanOrEqual(44);
  expect(ideaBox?.height).toBeGreaterThanOrEqual(44);
});
