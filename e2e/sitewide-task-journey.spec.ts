import AxeBuilder from "@axe-core/playwright";

import { THEME_STORAGE_KEY } from "../apps/web/src/shared/lib/theme-presets";

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

async function bodyPalette(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("계산된 UI 색상 검증에 필요한 Canvas2D를 열지 못했습니다.");
    const rgba = (color: string) => {
      if (!CSS.supports("color", color)) throw new Error(`해석할 수 없는 UI 색상: ${color}`);
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    const luminance = (color: readonly number[]) => color.slice(0, 3).reduce((sum, value, index) => {
      const channel = value / 255;
      return sum + (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
    }, 0);
    const root = getComputedStyle(document.documentElement), body = getComputedStyle(document.body);
    const background = rgba(body.backgroundColor), foreground = rgba(body.color);
    const paletteBackground = rgba(root.getPropertyValue("--color-canvas").trim());
    const paletteForeground = rgba(root.getPropertyValue("--color-fg").trim());
    const backgroundLuminance = luminance(background), foregroundLuminance = luminance(foreground);
    return {
      background, foreground, backgroundLuminance, foregroundLuminance,
      followsPalette: background.every((value, index) => value === paletteBackground[index])
        && foreground.every((value, index) => value === paletteForeground[index]),
      contrast: (Math.max(backgroundLuminance, foregroundLuminance) + 0.05) / (Math.min(backgroundLuminance, foregroundLuminance) + 0.05),
    };
  });
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
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "none", contrast: "no-preference" });
  for (const [path, title] of [["/settings", "설정"], ["/settings/api-keys", "API 키 허브"], ["/developers", "개발자 플랫폼"], ["/about/technology/story", "기술 이름이 아니라, 문제와 판단의 순서로 설명합니다."]]) {
    await ready(page, path, title);
    const palettes = new Set<string>();
    for (const mode of ["dark", "light", "contrast"]) {
      await page.evaluate(({ key, mode }) => {
        const oldValue = localStorage.getItem(key);
        const newValue = JSON.stringify({ state: { preference: mode, studioPreference: "inherit" }, version: 0 });
        localStorage.setItem(key, newValue);
        window.dispatchEvent(new StorageEvent("storage", { key, oldValue, newValue, storageArea: localStorage }));
      }, { key: THEME_STORAGE_KEY, mode });
      await expect(page.locator("html")).toHaveAttribute("data-design-theme", mode);
      await expect(page.locator("html")).toHaveAttribute("data-theme", mode === "light" ? "light" : "dark");
      await expect(page.locator("html")).toHaveAttribute("data-contrast", mode === "contrast" ? "more" : "standard");
      await expect.poll(async () => (await bodyPalette(page)).followsPalette).toBe(true);
      const palette = await bodyPalette(page);
      expect(palette.background[3]).toBe(255);
      expect(palette.foreground[3]).toBe(255);
      expect(palette.contrast, `${path} ${mode} 본문 전경/배경 대비`).toBeGreaterThanOrEqual(mode === "contrast" ? 7 : 4.5);
      expect(palette.backgroundLuminance > palette.foregroundLuminance).toBe(mode === "light");
      palettes.add(JSON.stringify([palette.background, palette.foreground]));
      const result = await new AxeBuilder({ page }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(result.violations, `${path} ${mode}`).toEqual([]);
      await bounded(page);
    }
    expect(palettes.size, `${path}의 세 테마가 서로 다른 실제 팔레트인지`).toBe(3);
  }
});
