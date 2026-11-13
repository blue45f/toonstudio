import { assertPublicDashboardHeader } from "./public-dashboard-header-contract.mjs";
import assert from "node:assert/strict";
import { expect } from "@playwright/test";

// These four public destinations gained the task shell; other public pages rely on the single primary navigation.
const TASK_ROUTES = Object.freeze({
  "/market": { title: "소재 찾기", parent: "/hub", active: "/hub" },
  "/showcase": { title: "창작 작품", parent: "/hub", active: "/hub" },
  "/discover": { title: "작품 찾기", parent: "/hub", active: "/hub" },
  "/help": { title: "도움말", parent: "/home", active: null },
});
const DESTINATIONS = ["/home", "/studio", "/team", "/hub"];
const PUBLIC_MOBILE_DESTINATIONS = ["/studio", "/discover", "/market", "/my", "/sitemap"];
const MENU_GROUP_DESTINATIONS = ["discover", "create", "grow", "publish", "connect", "rest", "personal"]
  .map((group) => `/sitemap/${group}`);

// 목록·작품 카드가 많은 화면(/discover 등)은 소프트웨어 렌더링 러너에서 한 번의 레이아웃에도 5초를 넘길 수 있다.
// 여기서 보는 것은 배치와 초점이지 속도가 아니므로(속도는 CWV 게이트의 몫) 기다림 한도만 넉넉히 둔다.
const LAYOUT_WAIT = Object.freeze({ timeout: 20_000 });

/** 개수만 맞춘 대체 내비가 아니라 순서·출처·현재 목적지를 함께 검사한다. */
export function assertPublicMobileNavigationSnapshot(snapshot, route, origin) {
  const path = (href) => {
    const url = new URL(href, origin);
    assert.equal(url.origin, new URL(origin).origin, "모바일 목적지는 같은 출처를 유지해야 한다");
    return url.pathname;
  };
  assert.deepEqual(snapshot.links.map((item) => path(item.href)), PUBLIC_MOBILE_DESTINATIONS,
    "모바일은 네 작업 목적지와 다섯 번째 전체 메뉴를 정본 순서로 제공한다");
  const expectedCurrent = /^\/sitemap(?:\/|$)/u.test(route) ? "/sitemap"
    : ["/research", "/research/assets", "/market", "/market/browse"].includes(route)
      ? "/market" : ["/discover", "/showcase"].includes(route) ? "/discover" : null;
  assert.deepEqual(snapshot.links.filter((item) => item.current === "page").map((item) => path(item.href)),
    expectedCurrent ? [expectedCurrent] : [], "현재 작업 목적지만 선택하고 목적 밖 페이지에는 선택을 강제하지 않는다");
}

/** 좁은 화면의 다섯 목적지와 목적별 페이지·검색으로 연결되는 전체 메뉴를 검사한다. */
export async function assertPublicMobileNavigation(page, route) {
  const currentUrl = page.url();
  const quick = page.getByRole("navigation", { name: "빠른 이동", exact: true });
  await expect(quick).toBeVisible(LAYOUT_WAIT);
  const links = quick.locator("a");
  await expect(links).toHaveCount(5, LAYOUT_WAIT);
  const snapshot = await links.evaluateAll((items) => ({ links: items.map((item) => ({
    href: item.getAttribute("href"), current: item.getAttribute("aria-current"),
  })) }));
  assertPublicMobileNavigationSnapshot(snapshot, route, page.url());
  for (const link of await links.all()) {
    await expect(link).toBeVisible(LAYOUT_WAIT);
    await expect.poll(async () => (await link.boundingBox())?.height ?? 0, LAYOUT_WAIT).toBeGreaterThanOrEqual(44);
  }
  const trigger = page.locator('[data-site-chrome="header"] button[data-site-mobile-menu-trigger="true"][data-site-menu-entry="available"]');
  await expect(trigger).toHaveCount(1, LAYOUT_WAIT);
  await expect(trigger).toHaveAccessibleName(/전체 메뉴/u);
  await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "전체 메뉴", exact: true });
  await expect(dialog).toHaveCount(1, LAYOUT_WAIT);
  await expect(dialog).toBeVisible(LAYOUT_WAIT);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const menuId = await dialog.getAttribute("id");
  assert(menuId, "전체 메뉴는 dialog ID를 제공한다");
  await expect(trigger).toHaveAttribute("aria-controls", menuId);
  assert(await dialog.evaluate((element) => element.contains(document.activeElement)), "The full menu must receive focus");
  // 작품 시작 항목은 시작 시트(/create)를 가리킨다. /studio/new 는 시트에서 빈 작품을 골랐을 때 닿는 2단계 양식이다.
  for (const href of ["/create", "/studio", "/sitemap/all", ...MENU_GROUP_DESTINATIONS]) {
    const destination = dialog.locator(`a[href="${href}"]`);
    await expect(destination).toHaveCount(1, LAYOUT_WAIT);
    await destination.scrollIntoViewIfNeeded();
    await expect(destination).toBeVisible(LAYOUT_WAIT);
    await destination.click({ trial: true });
    await destination.focus(); await expect(destination).toBeFocused(LAYOUT_WAIT);
  }
  const search = dialog.getByRole("searchbox", { name: "어떤 작업을 찾으세요?", exact: true });
  await search.fill("/learn");
  const learningResult = dialog.locator('a[href="/learn"]');
  await expect(learningResult).toHaveCount(1, LAYOUT_WAIT);
  await expect(learningResult).toBeVisible(LAYOUT_WAIT);
  await dialog.getByRole("button", { name: "메뉴 검색 지우기", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused(LAYOUT_WAIT);
  // 목적 카드와 실제 기능이 별도 화면에서도 이어지는지 확인한 뒤 원래 기록으로 돌아온다.
  await dialog.locator('a[href="/sitemap/grow"]').click();
  await expect(page).toHaveURL(/\/sitemap\/grow$/u);
  await expect(dialog).toHaveCount(0, LAYOUT_WAIT);
  const growth = page.getByRole("navigation", { name: "자료·성장", exact: true });
  await growth.getByRole("link", { name: "배우기", exact: true }).click();
  await expect(page).toHaveURL(/\/learn$/u);
  await page.goBack();
  await expect(page).toHaveURL(/\/sitemap\/grow$/u);
  await page.goBack();
  await expect(page).toHaveURL(currentUrl);
  await trigger.click();
  await expect(dialog).toBeVisible(LAYOUT_WAIT);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement)), LAYOUT_WAIT).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0, LAYOUT_WAIT);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused(LAYOUT_WAIT);
  await expect(quick).toBeVisible(LAYOUT_WAIT);
  assert.equal(new URL(page.url()).pathname, route, "Menu inspection must preserve the current page");
  assert.equal(page.url(), currentUrl, "전체 메뉴 검사는 query와 hash도 유지한다");
}

/** Validate the actual DOM snapshot, not a generic replacement container's presence. */
export function assertPublicTaskNavigationSnapshot(snapshot, route, origin) {
  const expected = TASK_ROUTES[route];
  assert(expected, `Task-shell ownership is not declared for ${route}`);
  const path = (href) => {
    const url = new URL(href, origin);
    assert.equal(url.origin, new URL(origin).origin, "Workspace navigation must remain same-origin");
    return url.pathname;
  };
  assert.deepEqual(snapshot.links.map((link) => path(link.href)), DESTINATIONS, "Keep all four exact workspace destinations");
  assert.deepEqual(snapshot.links.map((link) => link.label), ["스튜디오", "작품", "팀", "둘러보기"]);
  assert.deepEqual(snapshot.links.filter((link) => link.current === "page").map((link) => path(link.href)),
    expected.active ? [expected.active] : [], "Only the matching destination is current");
  assert.equal(snapshot.title, expected.title, "Breadcrumb identifies the actual current page");
  assert.equal(path(snapshot.parentHref), expected.parent, "Breadcrumb parent stays accurate");
  assert.equal(path(snapshot.returnHref), "/home", "The current page keeps its studio-return action");
}

/** Support each explicit navigation owner without accepting missing or duplicated navigation. */
export async function assertPublicSiteNavigation(page, route) {
  const task = page.locator('[data-workspace-surface="task"]');
  if (route === "/") {
    await assertPublicDashboardHeader(page);
    if (page.viewportSize().width < 768) await assertPublicMobileNavigation(page, route);
    return "public-dashboard-header";
  }
  // 헤더 아래 두 번째 단계 탐색 줄은 주 메뉴와 선택 표시가 겹쳐 제거했다.
  await expect(page.locator(".public-site-journey")).toHaveCount(0);
  if (await task.count() === 0) {
    if (page.viewportSize().width < 768) {
      await assertPublicMobileNavigation(page, route);
      return "public-mobile-navigation";
    }
    const primary = page.getByRole("navigation", { name: "주요 메뉴", exact: true });
    await expect(primary).toBeVisible();
    const current = await primary.locator(".site-header__primary-link[aria-current]").count();
    assert.ok(current <= 1, `${route}: 주 메뉴 현재 위치가 ${current}곳에 표시됩니다`);
    return "public-primary-navigation";
  }
  await expect(task).toBeVisible();
  const links = task.locator(".workspace-nav a");
  await expect(links).toHaveCount(4);
  for (const link of await links.all()) await expect(link).toBeVisible();
  const breadcrumb = task.getByRole("navigation", { name: "현재 위치", exact: true });
  await expect(breadcrumb).toBeVisible();
  await expect(breadcrumb.locator('[aria-current="page"]')).toHaveCount(1);
  const returnLink = task.locator(".workspace-task-purpose").getByRole("link", { name: "가상 스튜디오", exact: true });
  await expect(returnLink).toBeVisible();
  const search = task.getByRole("button", { name: "작품·도구·메뉴 검색", exact: true });
  await expect(search).toHaveCount(1);
  await expect(search).toBeVisible();
  await expect(search).toBeEnabled();
  // Actionability and real focus checks still fail on a blocking overlay or a hidden control.
  await search.click({ trial: true });
  await search.focus();
  await expect(search).toBeFocused();
  const snapshot = await task.evaluate((root) => ({
    links: Array.from(root.querySelectorAll(".workspace-nav a"), (link) => ({
      href: link.getAttribute("href"), label: link.textContent.trim(), current: link.getAttribute("aria-current"),
    })),
    title: root.querySelector('.workspace-task-breadcrumb [aria-current="page"]')?.textContent.trim(),
    parentHref: root.querySelector(".workspace-task-breadcrumb a")?.getAttribute("href"),
    returnHref: root.querySelector(".workspace-task-purpose a")?.getAttribute("href"),
  }));
  assertPublicTaskNavigationSnapshot(snapshot, route, page.url());
  assert.equal(new URL(page.url()).pathname, route, "Navigation checks must preserve the current page");
  return "workspace-task";
}
