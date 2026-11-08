import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import type { Title } from "../apps/web/src/shared/lib/types";

// 시안의 합성 작품명은 UI 검증에만 사용한다. 운영 카탈로그나 회차를 만들지 않는다.
const title: Title = {
  id: "qa-title-reference", slug: "qa-title-reference", type: "webtoon", title: "별을 잇는 서점",
  author: "예시 작가", artist: "예시 작가", genres: ["판타지"], tags: [],
  synopsis: "흩어진 별을 다시 잇는다는 전설을 품은 작은 서점. 잊힌 이야기를 찾아오는 이들과, 별을 둘러싼 비밀이 펼쳐진다.",
  cover: ["oklch(0.45 0.14 290)", "oklch(0.28 0.1 260)"],
  status: "ongoing", ageRating: "all", releaseYear: 2026, updateDays: ["월"],
  availability: [{ platformId: "naver-webtoon", pricing: "free", url: "https://comic.naver.com/" }],
  stats: { views: 0, likes: 0, bookmarks: 0, ratingAvg: 0, ratingCount: 0,
    ratingDist: [0, 0, 0, 0, 0], rankDelta: 0, trendingScore: 0, completionRate: 0, bingeIndex: 0 },
};
const payload = { title, original: title, reviews: [], similar: [], adaptations: [], hasFamily: false,
  reviewAvg: 0, reviewCount: 0, generatedAt: "2026-11-08", source: "UI 검증용 합성 데이터" };
const path = `/title/${title.slug}`;

async function setup(page: Page, override: Partial<Title> = {}) {
  const state = { status: 200 };
  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === `/api/titles/${title.slug}`) return route.fulfill({
      status: state.status,
      json: state.status === 200 ? { ...payload, title: { ...title, ...override } } : { message: "검증용 조회 실패" },
    });
    if (pathname === "/api/config") return route.fulfill({ json: {} });
    return route.fulfill({ status: 503, json: { message: "검증에서 사용하지 않는 API" } });
  });
  return state;
}

for (const width of [390, 834, 1440]) {
  test(`${width}px: 시안 동선·반복 조작·직접 링크·세 가지 테마`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await setup(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(path);
    const hero = page.getByRole("region", { name: "작품 소개", exact: true });
    await expect(hero.getByRole("heading", { level: 1, name: title.title })).toBeVisible();
    const related = page.getByTestId("title-detail-related-tools");
    await expect(related).not.toHaveAttribute("open");
    const synopsis = hero.locator("details");
    for (let repeat = 0; repeat < 2; repeat += 1) {
      await synopsis.locator("summary").click();
      await expect(synopsis).toHaveAttribute("open");
      await synopsis.locator("summary").click();
      await expect(synopsis).not.toHaveAttribute("open");
    }
    await hero.getByRole("button", { name: "서재에 담기", exact: true }).click();
    const saved = hero.getByRole("button", { name: "서재에 담김", exact: true });
    await expect(saved).toHaveAttribute("aria-pressed", "true");
    await saved.click();
    const save = hero.getByRole("button", { name: "서재에 담기", exact: true });
    await expect(save).toHaveAttribute("aria-pressed", "false");
    await page.getByTestId("title-detail-section-nav").getByRole("link", { name: "완독률·지표", exact: true }).click();
    await expect(related).toHaveAttribute("open");
    await expect(page.locator("#metrics")).toBeInViewport();
    await page.goBack();
    await expect(page).not.toHaveURL(/#metrics$/);
    await page.goForward();
    await expect(page.locator("#metrics")).toBeInViewport();
    await page.goto(`${path}#title-character-talk`);
    await expect(page.locator("#title-character-talk")).toBeInViewport();
    const relatedSummary = related.locator(":scope > summary");
    await relatedSummary.focus();
    await page.keyboard.press("Enter");
    await expect(related).not.toHaveAttribute("open");
    await page.keyboard.press("Space");
    await expect(related).toHaveAttribute("open");
    await page.keyboard.press("Enter");
    await expect(related).not.toHaveAttribute("open");

    for (const theme of ["dark", "light", "contrast"]) {
      // 실제 저장된 설정을 다시 읽게 해 색상·디자인 프리셋·고대비 계약을 함께 적용한다.
      await page.evaluate((value) => {
        localStorage.setItem("toonstudio-theme", JSON.stringify({ state: { preference: value, studioPreference: "inherit" }, version: 0 }));
      }, theme);
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-design-theme", theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "light" ? "light" : "dark");
      await expect(page.locator("html")).toHaveAttribute("data-contrast", theme === "contrast" ? "more" : "standard");
      await expect(hero.getByRole("heading", { level: 1, name: title.title })).toBeVisible();
      await hero.scrollIntoViewIfNeeded();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      for (const action of [hero.getByRole("link", { name: "첫 화부터 읽기", exact: true }), save]) {
        expect((await action.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      }
      const audit = await new AxeBuilder({ page }).include('[aria-label="작품 소개"]').include("#title-episodes-anchor")
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(audit.violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`title-${width}-${theme}.png`) });
    }
    expect(errors).toEqual([]);
  });
}

test("320px 긴 제목·표지 없음·외부 링크 없음에서도 동선을 보존한다", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const longTitle = "아주긴공백없는작품제목".repeat(12);
  await setup(page, { title: longTitle, author: "LongAuthor".repeat(20), availability: [], totalEpisodes: 0 });
  await page.goto(path);
  const hero = page.getByRole("region", { name: "작품 소개", exact: true });
  await expect(hero.getByRole("heading", { level: 1, name: longTitle })).toBeVisible();
  await expect(hero.getByRole("link", { name: "첫 화부터 읽기", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await expect(page.getByRole("link", { name: "비슷한 작품 탐색하기", exact: true })).toBeVisible();
});

test("조회 실패는 접기 밖에서 재시도하고 없는 작품은 탐색으로 돌아간다", async ({ page }) => {
  const state = await setup(page);
  state.status = 503;
  await page.goto(path);
  const retry = page.getByRole("button", { name: "재시도", exact: true });
  await expect(retry).toBeVisible();
  state.status = 200;
  await retry.click();
  await expect(page.getByRole("heading", { level: 1, name: title.title })).toBeVisible();
  state.status = 404;
  await page.reload();
  await expect(page.getByRole("navigation", { name: "작품 탐색 경로" }).getByRole("link", { name: "작품 목록" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: title.title })).toHaveCount(0);
});
