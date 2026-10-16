import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { readHomeContentHrefs } from "./public-home-content-hrefs.mjs";
import { assertPublicSiteNavigation } from "./public-navigation-browser-contract.mjs";

const hrefsOf = (locator) => locator.evaluateAll((links) => links.map((link) => link.getAttribute("href")));

/**
 * 공개 홈은 BLUEPRINT §3.3 의 4밴드(히어로 · 이어하기 · 작품 발견 · 더 알아보기)다.
 * 개인 작업공간(/home)과 다른 실제 동선을 검증하며, 이 함수는 홈을 벗어나는 이동을 하지 않는다.
 */
export async function assertPublicCreatorHome(page) {
  const home = page.locator('[data-home-view="dashboard"]');
  const dashboard = home.locator('[data-reference-dashboard="true"]');
  await expect(dashboard).toBeVisible({ timeout: 30000 });
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(dashboard.locator("#creator-hero-title")).toBeVisible();
  await expect(page.locator('[data-workspace-surface="home"], video')).toHaveCount(0);
  await assertPublicSiteNavigation(page, "/");
  assert.deepEqual(await dashboard.locator("[data-home-band]").evaluateAll((bands) => bands.map((band) => band.getAttribute("data-home-band"))),
    ["hero", "continue", "discover", "more"], "홈은 히어로·이어하기·작품 발견·더 알아보기 순서의 4밴드다");
  await assertPublicHomeInput(dashboard);
  await assertPublicHomeLuna(dashboard);
  await expect(dashboard.locator(".rd-examples-heading a")).toHaveAttribute("href", "/studio");
  await assertPublicHomeMore(dashboard);
  await assertPublicHomeSamples(dashboard);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Public home must not overflow horizontally");
}

/** 통합 입력: 기본은 이야기 만들기, 작품 찾기로 바꿔도 입력한 문장은 유지된다(제출 이동은 verify-public-site-experience 가 본다). */
async function assertPublicHomeInput(dashboard) {
  const modes = dashboard.locator(".rd-idea-modes button");
  const input = dashboard.locator("#rd-idea-input");
  await expect(modes).toHaveCount(2);
  await expect(modes.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(modes.nth(1)).toHaveAttribute("aria-pressed", "false");
  await expect(input).toHaveAttribute("placeholder", /아이디어/u);
  await input.fill("비 오는 날의 첫사랑");
  await modes.nth(1).click();
  await expect(modes.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(modes.nth(0)).toHaveAttribute("aria-pressed", "false");
  await expect(input).toHaveAttribute("placeholder", /작품명/u);
  await expect(input).toHaveValue("비 오는 날의 첫사랑");
  await modes.nth(0).click();
  await expect(modes.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(input).toHaveValue("비 오는 날의 첫사랑");
  await input.fill("");
  await expect(dashboard.locator(".rd-idea-submit")).toBeVisible();
}

/** Luna 제안 칩은 대화형 AI 흉내가 아니라 실제 시작 동선으로 가는 링크다. */
async function assertPublicHomeLuna(dashboard) {
  const luna = dashboard.getByRole("complementary", { name: "Luna 창작 안내" });
  await expect(luna).toBeVisible();
  await expect(luna.getByRole("log", { name: "Luna와의 대화" })).toBeVisible();
  assert.deepEqual(await hrefsOf(luna.locator(".rd-luna-chips a")), readHomeContentHrefs("HOME_LUNA_SUGGESTIONS"));
}

/** 시작 카드·핵심 작업실·편집기 미리보기는 접힌 "더 알아보기" 밴드 아래에 있다. 키보드로 펼쳐서 본다. */
async function assertPublicHomeMore(dashboard) {
  const more = dashboard.locator("details.rd-more");
  await expect(more).not.toHaveAttribute("open");
  const summary = more.locator("summary");
  await summary.scrollIntoViewIfNeeded();
  await summary.focus();
  await summary.press("Enter");
  await expect(more).toHaveAttribute("open");
  const starts = more.locator(".rd-quick-grid > a");
  assert.deepEqual(await hrefsOf(starts), readHomeContentHrefs("HOME_QUICK_STARTS"));
  const studios = more.locator(".rd-core-card");
  await expect(studios).toHaveCount(4);
  const studioLinks = studios.locator(".rd-core-primary, .rd-core-secondary");
  await expect(studioLinks).toHaveCount(8);
  await expect(more.locator(".rd-editor-heading a")).toHaveAttribute("href", "/studio/canvas");
  await expect(more.locator("#rd-editor-caption")).toContainText("편집기 콘셉트");
  for (const control of await starts.or(studioLinks).all()) {
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeVisible();
    await expect.poll(async () => (await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
}

/** 시안의 편집기 미리보기는 실제 프로젝트를 건드리지 않고 로컬 예시만 바꾼다. */
async function assertPublicHomeSamples(dashboard) {
  const frames = dashboard.getByRole("group", { name: "예시 컷 선택" });
  await frames.getByRole("button", { name: "예시 컷 3 선택" }).click();
  await expect(dashboard.locator("[data-editor-selected-frame]")).toHaveAttribute("src", /character-blue-640\.webp$/u);
  await expect(frames.getByRole("button", { name: "예시 컷 3 선택" })).toHaveAttribute("aria-pressed", "true");
  const dialogue = dashboard.getByLabel("예시 대사 편집");
  await dialogue.fill("새로운 장면을 함께 그려요.");
  await expect(dashboard.locator(".rd-editor-bubble")).toHaveText("새로운 장면을 함께 그려요.");
  await frames.getByRole("button", { name: "예시 컷 1 선택" }).click();
  await dialogue.fill("…아직 끝나지 않았어.");
}
