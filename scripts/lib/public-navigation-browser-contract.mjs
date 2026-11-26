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
const MOBILE_TABS = [
  { id: "home", tag: "A", href: "/", label: "홈" },
  { id: "make", tag: "A", href: "/create", label: "만들기" },
  { id: "studio", tag: "A", href: "/studio", label: "내 작업" },
  { id: "all-menu", tag: "BUTTON", href: null, label: "더보기" },
];
const MENU_GROUPS = [
  { id: "discover", label: "작품 찾기", links: ["/discover"] },
  { id: "create", label: "만들기", links: ["/production"] },
  { id: "grow", label: "자료·성장", links: ["/learn", "/market"] },
  { id: "publish", label: "연재·내보내기", links: ["/studio/publish"] },
  { id: "connect", label: "함께 보기", links: ["/community", "/showcase"] },
  { id: "rest", label: "쉬어가기", links: ["/play"] },
  { id: "personal", label: "내 기록", links: ["/home"] },
];
const ROUTE_MENU_GROUPS = new Map([
  ["/create", "create"], ["/studio", "create"], ["/discover", "discover"],
  ["/research", "grow"], ["/research/assets", "grow"], ["/learn", "grow"],
  ["/market", "grow"], ["/market/browse", "grow"], ["/showcase", "connect"], ["/community", "connect"],
]);
const LINK_TAB_BY_ROUTE = new Map([["/", "home"], ["/create", "make"], ["/studio", "studio"]]);
const MENU_ONLY_ROUTES = new Set(["/my", "/settings", "/notifications"]);

// 목록·작품 카드가 많은 화면(/discover 등)은 소프트웨어 렌더링 러너에서 한 번의 레이아웃에도 5초를 넘길 수 있다.
// 여기서 보는 것은 배치와 초점이지 속도가 아니므로(속도는 CWV 게이트의 몫) 기다림 한도만 넉넉히 둔다.
const LAYOUT_WAIT = Object.freeze({ timeout: 20_000 });

/** 모바일 고정 링크와 더보기 버튼의 역할, 순서, 출처, 현재 표시를 함께 검사한다. */
export function assertPublicMobileNavigationSnapshot(snapshot, route, origin) {
  const controls = snapshot.controls.map(({ id, tag, href, label }) => {
    assert(href === null || href.trim(), "모바일 링크에 비어 있는 주소를 허용하지 않는다");
    const url = href === null ? null : new URL(href, origin);
    if (url) {
      assert.equal(url.origin, new URL(origin).origin, "모바일 링크는 같은 출처를 유지해야 한다");
      assert.equal(url.search + url.hash, "", "모바일 링크는 고정 목적지를 가리켜야 한다");
    }
    return { id, tag, href: url?.pathname ?? null, label };
  });
  assert.deepEqual(controls, MOBILE_TABS, "모바일은 홈·만들기·내 작업 링크와 더보기 버튼을 정본 순서로 제공한다");
  const activeLink = LINK_TAB_BY_ROUTE.get(route);
  const menuCurrent = ROUTE_MENU_GROUPS.has(route) || MENU_ONLY_ROUTES.has(route) || /^\/sitemap(?:\/|$)/u.test(route);
  const expected = activeLink ? [[activeLink, "page"]] : menuCurrent ? [["all-menu", "true"]] : [];
  const actual = snapshot.controls.filter((tab) => tab.current !== null).map(({ id, current }) => [id, current]);
  assert.deepEqual(actual, expected, "현재 링크나 더보기만 표시하며 별도 메뉴가 없는 페이지에 선택을 강제하지 않는다");
}

async function assertMobileTouchTarget(control) {
  await expect(control).toBeVisible(LAYOUT_WAIT);
  await expect.poll(async () => {
    const box = await control.boundingBox();
    return box ? Math.min(box.height, box.width) : 0;
  }, LAYOUT_WAIT).toBeGreaterThanOrEqual(44);
}

async function assertMobileMenuLink(link) {
  await expect(link).toHaveCount(1, LAYOUT_WAIT);
  await link.scrollIntoViewIfNeeded();
  await assertMobileTouchTarget(link);
  await link.click({ trial: true });
  await link.focus();
  await expect(link).toBeFocused(LAYOUT_WAIT);
}

async function expandMenuGroup(group, menuId, groupId) {
  const summary = group.locator(":scope > summary");
  const bodyId = menuId + "-group-" + groupId;
  const body = group.locator(".site-menu-group__body");
  await expect(summary).toHaveAttribute("aria-controls", bodyId);
  await expect(body).toHaveAttribute("id", bodyId);
  await summary.scrollIntoViewIfNeeded();
  await assertMobileTouchTarget(summary);
  await summary.focus();
  await expect(summary).toBeFocused(LAYOUT_WAIT);
  if (await group.getAttribute("open") !== null) {
    await summary.press("Enter");
    await expect(group).not.toHaveAttribute("open");
  }
  await expect(summary).toHaveAttribute("aria-expanded", "false");
  await expect(body).toBeHidden(LAYOUT_WAIT);
  await summary.press("Enter");
  await expect(group).toHaveAttribute("open");
  await expect(summary).toHaveAttribute("aria-expanded", "true");
  await expect(body).toBeVisible(LAYOUT_WAIT);
}

/** 빠른 이동과 더보기를 열어 실제 목적지·검색·키보드 복귀를 검사한다. */
export async function assertPublicMobileNavigation(page, route) {
  const currentUrl = page.url();
  const quick = page.getByRole("navigation", { name: "빠른 이동", exact: true });
  await expect(quick).toBeVisible(LAYOUT_WAIT);
  const tabs = quick.locator("a, button");
  await expect(tabs).toHaveCount(4, LAYOUT_WAIT);
  const snapshot = await tabs.evaluateAll((items) => ({ controls: items.map((item) => ({
    id: item.getAttribute("data-mobile-tab"), tag: item.tagName, href: item.getAttribute("href"),
    label: item.getAttribute("aria-label"), current: item.getAttribute("aria-current"),
  })) }));
  assertPublicMobileNavigationSnapshot(snapshot, route, currentUrl);
  for (const tab of await tabs.all()) await assertMobileTouchTarget(tab);

  // 메뉴가 열리면 빠른 이동은 hidden/inert이므로 버튼의 같은 DOM 노드를 계속 추적한다.
  const trigger = page.locator('nav.site-bottom-tabs button[data-mobile-tab="all-menu"]');
  await expect(quick.getByRole("button", { name: "더보기", exact: true })).toHaveCount(1, LAYOUT_WAIT);
  await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.focus();
  await expect(trigger).toBeFocused(LAYOUT_WAIT);
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog", { name: "전체 메뉴", exact: true });
  await expect(dialog).toHaveCount(1, LAYOUT_WAIT);
  await expect(dialog).toBeVisible(LAYOUT_WAIT);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(quick).toBeHidden(LAYOUT_WAIT);
  const menuId = await dialog.getAttribute("id");
  assert(menuId, "전체 메뉴는 dialog ID를 제공한다");
  await expect(trigger).toHaveAttribute("aria-controls", menuId);
  const close = dialog.getByRole("button", { name: "전체 메뉴 닫기", exact: true });
  const last = dialog.locator('a[href="/my"]');
  await expect(close).toBeFocused(LAYOUT_WAIT);
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused(LAYOUT_WAIT);
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused(LAYOUT_WAIT);

  // 새 작품은 시작 시트로 들어가며 일곱 그룹의 정본은 실제로 펼쳐야 사용할 수 있다.
  const menuLink = (href) => dialog.locator('a[href="' + href + '"]');
  for (const href of ["/create", "/studio", "/sitemap/all", "/my"]) await assertMobileMenuLink(menuLink(href));
  const groups = dialog.locator("details[data-menu-group]");
  await expect(groups).toHaveCount(MENU_GROUPS.length, LAYOUT_WAIT);
  assert.deepEqual(await groups.evaluateAll((items) => items.map((item) => item.getAttribute("data-menu-group"))),
    MENU_GROUPS.map(({ id }) => id));
  const expandedGroups = dialog.locator("details[data-menu-group][open]");
  const initialGroup = ROUTE_MENU_GROUPS.get(route);
  assert.deepEqual(await expandedGroups.evaluateAll((items) => items.map((item) => item.getAttribute("data-menu-group"))),
    initialGroup ? [initialGroup] : [], "첫 메뉴는 현재 경로 그룹만 열고 홈에서는 모두 접는다");
  const menuGroup = (id) => dialog.locator('details[data-menu-group="' + id + '"]');
  for (const { id, label, links } of MENU_GROUPS) {
    const group = menuGroup(id);
    await expect(group.locator("summary strong")).toHaveText(label);
    await expect(group.locator("summary small")).toHaveText(/\S/u);
    await expandMenuGroup(group, menuId, id);
    await expect(expandedGroups).toHaveCount(1, LAYOUT_WAIT);
    for (const href of [...links, "/sitemap/" + id]) {
      const link = menuLink(href);
      await expect(group.locator('a[href="' + href + '"]')).toHaveCount(1, LAYOUT_WAIT);
      await assertMobileMenuLink(link);
    }
  }

  const search = dialog.getByRole("searchbox", { name: "어떤 작업을 찾으세요?", exact: true });
  await search.fill("/learn");
  await assertMobileMenuLink(menuLink("/learn"));
  await search.fill("/sitemap");
  await assertMobileMenuLink(menuLink("/sitemap"));
  await dialog.getByRole("button", { name: "메뉴 검색 지우기", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused(LAYOUT_WAIT);
  await expect(groups).toHaveCount(7, LAYOUT_WAIT);
  // 실제 그룹 페이지와 안쪽 기능으로 이동한 뒤 원래 쿼리와 해시까지 돌아온다.
  await expandMenuGroup(menuGroup("grow"), menuId, "grow");
  await menuLink("/sitemap/grow").click();
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
  await expect(close).toBeFocused(LAYOUT_WAIT);
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
