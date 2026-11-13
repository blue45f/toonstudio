import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "./fixtures/non-studio-test";

import type { Page } from "@playwright/test";

async function ready(page: Page, path: string, title: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => [...document.querySelectorAll("h1")].some((heading) => heading.getBoundingClientRect().height >= 16 && heading.getBoundingClientRect().width >= 40));
  await expect(page.getByRole("heading", { name: title, level: 1, exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function bounded(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

test("설정의 목적 선택·편집·목록·Back이 단일 작업과 초점을 유지한다", async ({ page }) => {
  await ready(page, "/settings?project=keep", "설정");
  const choices = page.getByRole("navigation", { name: "바꾸려는 설정 선택" });
  await expect(choices.getByRole("link")).toHaveCount(5);
  await choices.getByRole("link", { name: "내 데이터" }).click();
  await expect(page).toHaveURL(/project=keep&view=data/u);
  await expect(page.getByRole("heading", { name: "설정", level: 1 })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toHaveCount(1);
  await page.getByRole("link", { name: "설정 목록으로" }).click();
  await expect(choices).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("tab", { name: "내 데이터", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "화면·음성", exact: true }).click();
  await expect(page).toHaveURL(/view=display/u);
  await expect(page.getByRole("tablist")).toBeVisible();
  await bounded(page);
});

test("API 키는 고른 서비스만 편집하고 미저장 입력과 복귀 문맥을 유지한다", async ({ page }) => {
  await ready(page, "/settings/api-keys?project=keep", "API 키 허브");
  await expect(page.locator('input[type="password"]:visible')).toHaveCount(0);
  await page.getByRole("link", { name: /Unsplash 키.*미연결/u }).click();
  const input = page.getByLabel("Access Key 붙여넣기");
  await input.fill("draft-placeholder-only");
  await expect(page.locator('input[type="password"]:visible')).toHaveCount(1);
  await page.getByRole("link", { name: "다른 서비스 선택" }).click();
  await page.goBack();
  await expect(input).toHaveValue("draft-placeholder-only");
  expect(new URL(page.url()).searchParams.get("project")).toBe("keep");
  await bounded(page);
});

test("전 페이지 공통 목적 화면은 세 테마에서 읽기·초점·접근성을 유지한다", async ({ page }) => {
  for (const [path, title] of [["/settings", "설정"], ["/settings/api-keys", "API 키 허브"], ["/developers", "개발자 플랫폼"], ["/about/technology/story", "기술 이름이 아니라, 문제와 판단의 순서로 설명합니다."]]) {
    await ready(page, path, title);
    for (const mode of ["dark", "light", "contrast"]) {
      await page.evaluate((mode) => {
        document.documentElement.dataset.theme = mode === "light" ? "light" : "dark";
        document.documentElement.dataset.contrast = mode === "contrast" ? "more" : "normal";
      }, mode);
      const result = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(result.violations, `${path} ${mode}`).toEqual([]);
      await bounded(page);
    }
  }
});
