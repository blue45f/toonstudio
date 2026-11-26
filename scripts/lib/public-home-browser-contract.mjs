import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { readHomeContentHrefs } from "./public-home-content-hrefs.mjs";
import { assertPublicSiteNavigation } from "./public-navigation-browser-contract.mjs";

const hrefsOf = (locator) => locator.evaluateAll((links) => links.map((link) => link.getAttribute("href")));

async function assertHomeTouchTarget(control) {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  await expect.poll(async () => {
    const box = await control.boundingBox();
    return box ? Math.min(box.height, box.width) : 0;
  }).toBeGreaterThanOrEqual(44);
}

/**
 * 공개 홈은 히어로 · 작업 시작 · 작품 발견 · 작업실 소개 순으로 보여 준다.
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
    ["hero", "continue", "discover", "more"], "홈은 히어로·작업 시작·작품 발견·작업실 소개 순서다");
  await assertPublicHomeStart(dashboard);
  await assertPublicHomeInput(dashboard);
  await assertPublicHomeLuna(dashboard);
  await assertPublicHomeDiscover(dashboard);
  await assertPublicHomeMore(dashboard);
  // 시작 카드가 여러 구간으로 옮겨져도 기존 여섯 목적지는 모두 키보드와 터치로 들어갈 수 있어야 한다.
  for (const href of readHomeContentHrefs("HOME_QUICK_STARTS")) {
    const link = dashboard.locator(`a[href="${href}"]`).filter({ visible: true }).first();
    await assertHomeTouchTarget(link);
    await link.click({ trial: true });
    await link.focus();
    await expect(link).toBeFocused();
  }
  await assertPublicHomeSamples(dashboard);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Public home must not overflow horizontally");
}

async function assertPublicHomeStart(dashboard) {
  const hero = dashboard.locator(".vivid-hero-actions").getByRole("link");
  const artwork = dashboard.getByRole("img", { name: "선화에 색을 더하며 완성하는 웹툰 원고 예시", exact: true });
  await expect(artwork).toBeVisible();
  await expect.poll(() => artwork.evaluate((image) => image.complete && image.naturalWidth > 0), { timeout: 15000 }).toBe(true);
  const tasks = dashboard.locator("#creator-start").getByRole("link");
  const journey = dashboard.getByRole("navigation", { name: "작품을 만드는 순서", exact: true }).getByRole("link");
  assert.deepEqual(await hrefsOf(hero), ["/create", "/studio"]);
  assert.deepEqual(await hrefsOf(tasks), ["/studio/new?lane=blank", "/create?intent=my-story", "/production"]);
  assert.deepEqual(await hrefsOf(journey), ["/create?intent=my-story", "/studio/new?lane=blank", "/studio?view=exports"]);
  for (const link of await hero.or(tasks).or(journey).all()) await assertHomeTouchTarget(link);
}

/** 접힌 아이디어 입력을 실제 summary 키보드 동작으로 연다. 뒤로 가기로 열린 상태가 복원되면 그대로 둔다. */
export async function openPublicHomeIdeaInput(dashboard) {
  const help = dashboard.locator("details.rd-idea-help");
  const summary = help.locator(":scope > summary");
  const input = help.locator("#rd-idea-input");
  await expect(help).toBeVisible();
  if (await help.getAttribute("open") === null) {
    await expect(summary).toBeVisible();
    await summary.scrollIntoViewIfNeeded();
    await summary.focus();
    await expect(summary).toBeFocused();
    await summary.press("Enter");
  }
  await expect(help).toHaveAttribute("open");
  await expect(input).toBeVisible();
  return input;
}

/** 통합 입력은 접힌 채 시작하며 모드 전환과 Escape/Enter에서 입력을 보존한다. */
async function assertPublicHomeInput(dashboard) {
  const help = dashboard.locator("details.rd-idea-help");
  const summary = help.locator(":scope > summary");
  const modes = help.locator(".rd-idea-modes button");
  const input = help.locator("#rd-idea-input");
  await expect(help).not.toHaveAttribute("open");
  await expect(input).toBeHidden();
  await expect(summary).toHaveText(/아이디어 쓰기.*작품 찾기/u);
  await assertHomeTouchTarget(summary);
  await openPublicHomeIdeaInput(dashboard);
  await expect(modes).toHaveCount(2);
  await expect(modes.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(modes.nth(1)).toHaveAttribute("aria-pressed", "false");
  await expect(input).toHaveRole("textbox");
  await expect(input).toHaveAccessibleName("아이디어 입력");
  await expect(input).toHaveAttribute("placeholder", "예: 비 오는 날의 첫사랑");
  await expect(input).toHaveAttribute("maxlength", "200");
  await input.fill("비 오는 날의 첫사랑");
  await modes.nth(1).click();
  await expect(modes.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(modes.nth(0)).toHaveAttribute("aria-pressed", "false");
  await expect(input).toHaveAccessibleName("작품 검색");
  await expect(input).toHaveAttribute("placeholder", "작품명·작가·태그");
  await expect(input).toHaveAttribute("enterkeyhint", "search");
  await expect(input).toHaveValue("비 오는 날의 첫사랑");
  await modes.nth(0).click();
  await expect(modes.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(input).toHaveValue("비 오는 날의 첫사랑");
  await input.press("Escape");
  await expect(help).not.toHaveAttribute("open");
  await expect(summary).toBeFocused();
  await summary.press("Enter");
  await expect(help).toHaveAttribute("open");
  await expect(input).toHaveValue("비 오는 날의 첫사랑");
  await input.fill("");
  for (const control of await modes.or(help.locator(".rd-idea-submit")).all()) await assertHomeTouchTarget(control);
}

/** Luna 제안 칩은 기본 접힘으로 홈 노이즈를 줄이며, 열었을 때 실제 시작 동선으로 가는 링크를 제공한다. */
async function assertPublicHomeLuna(dashboard) {
  const help = dashboard.locator("details.rd-luna-help");
  const summary = help.locator(":scope > summary");
  const luna = help.getByRole("complementary", { name: "Luna 창작 안내" });
  await expect(help).not.toHaveAttribute("open");
  await expect(luna).toBeHidden();
  await expect(summary).toHaveText(/시작이 막막한가요/u);
  await assertHomeTouchTarget(summary);
  await summary.focus();
  await summary.press("Enter");
  await expect(help).toHaveAttribute("open");
  await expect(luna).toBeVisible();
  await expect(luna.getByRole("log", { name: "Luna와의 대화" })).toBeVisible();
  assert.deepEqual(await hrefsOf(luna.locator(".rd-luna-chips a")), readHomeContentHrefs("HOME_LUNA_SUGGESTIONS"));
  await summary.press("Escape");
  await expect(help).not.toHaveAttribute("open");
  await expect(luna).toBeHidden();
  await expect(summary).toBeFocused();
  await summary.press("Enter");
  await expect(help).toHaveAttribute("open");
  await expect(luna).toBeVisible();
}

async function assertPublicHomeDiscover(dashboard) {
  const discover = dashboard.locator("details.rd-discover");
  const summary = discover.locator(":scope > summary");
  const browse = discover.locator(".vivid-disclosure-link");
  await expect(discover).not.toHaveAttribute("open");
  await expect(browse).toBeHidden();
  await expect(summary).toContainText("다른 이야기가 궁금하다면");
  await assertHomeTouchTarget(summary);
  await summary.focus();
  await expect(summary).toBeFocused();
  await summary.press("Enter");
  await expect(discover).toHaveAttribute("open");
  await expect(browse).toHaveAccessibleName("작품 둘러보기");
  await expect(browse).toHaveAttribute("href", "/discover");
  await assertHomeTouchTarget(browse);
  await browse.click({ trial: true });
  await summary.press("Enter");
  await expect(discover).not.toHaveAttribute("open");
  await expect(browse).toBeHidden();
  await expect(summary).toBeFocused();
  await summary.press("Enter");
  await expect(discover).toHaveAttribute("open");
  await expect(browse).toBeVisible();
}

/** 예시 작품·핵심 작업실·편집기 미리보기는 접힌 작업실 소개를 키보드로 연 다음 확인한다. */
async function assertPublicHomeMore(dashboard) {
  const more = dashboard.locator("details.rd-more");
  await expect(more).not.toHaveAttribute("open");
  const summary = more.locator(":scope > summary");
  const examples = more.getByRole("region", { name: "예시 작품", exact: true });
  await expect(examples).toBeHidden();
  await expect(summary).toContainText("작업실 더 둘러보기");
  await assertHomeTouchTarget(summary);
  await summary.focus();
  await expect(summary).toBeFocused();
  await summary.press("Enter");
  await expect(more).toHaveAttribute("open");
  await summary.press("Enter");
  await expect(more).not.toHaveAttribute("open");
  await summary.press("Enter");
  await expect(more).toHaveAttribute("open");
  await expect(examples).toBeVisible();
  await expect(examples.locator("figure")).toHaveCount(3);
  const projects = examples.getByRole("link", { name: "내 프로젝트", exact: true });
  await expect(projects).toHaveAttribute("href", "/studio");
  const studios = more.locator(".rd-core-card");
  await expect(studios).toHaveCount(4);
  const studioLinks = studios.locator(".rd-core-primary, .rd-core-secondary");
  await expect(studioLinks).toHaveCount(8);
  const editor = more.locator(".rd-editor-heading a");
  await expect(editor).toHaveAttribute("href", "/studio/canvas");
  const sample = studios.getByRole("link", { name: "샘플 프로젝트 체험", exact: true });
  await expect(sample).toHaveAttribute("href", "/production/projects/sample-project/overview");
  await expect(more.locator("#rd-editor-caption")).toContainText("편집기 콘셉트");
  for (const control of await projects.or(studioLinks).or(editor).all()) await assertHomeTouchTarget(control);
  await editor.click({ trial: true });
  await sample.click({ trial: true });
}

/** 시안의 편집기 미리보기는 실제 프로젝트를 건드리지 않고 로컬 예시만 바꾼다. */
async function assertPublicHomeSamples(dashboard) {
  const frames = dashboard.getByRole("group", { name: "예시 컷 선택" });
  await expect(frames.getByRole("button")).toHaveCount(5);
  await frames.getByRole("button", { name: "예시 컷 3 선택" }).click();
  await expect(dashboard.locator("[data-editor-selected-frame]")).toHaveAttribute("src", /character-blue-640\.webp$/u);
  await expect(frames.getByRole("button", { name: "예시 컷 3 선택" })).toHaveAttribute("aria-pressed", "true");
  const dialogue = dashboard.getByLabel("예시 대사 편집");
  await dialogue.fill("새로운 장면을 함께 그려요.");
  await expect(dashboard.locator(".rd-editor-bubble")).toHaveText("새로운 장면을 함께 그려요.");
  await frames.getByRole("button", { name: "예시 컷 1 선택" }).click();
  await dialogue.fill("…아직 끝나지 않았어.");
}
