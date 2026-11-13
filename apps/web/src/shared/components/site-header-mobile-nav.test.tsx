// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef, useCallback, useRef, useState } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MobileHeaderNavigation } from "./site-header-mobile-nav";
import { SITE_UTILITY_NAVIGATION, siteNavigationGroupsForPath } from "./site-navigation";

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "ko" }),
  useT: () => (key: string) => key,
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function menu(menuOpen = true, closeMenu = vi.fn(), pathname = "/market") {
  return <MemoryRouter initialEntries={[pathname]}>
    <button data-testid="page-action">페이지 작업</button>
    <MobileHeaderNavigation
      menuOpen={menuOpen}
      menuId="site-menu"
      panelRef={createRef<HTMLDivElement>()}
      closeMenu={closeMenu}
      isActive={(href) => href === pathname}
      isPurposeActive={(href) => href === "/discover"}
    />
  </MemoryRouter>;
}

function StatefulMenuOwner() {
  const [open, setOpen] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const closeMenu = useCallback(() => setOpen(false), []);
  return <>
    <output data-testid="menu-route">{location.pathname}{location.search}</output>
    <MobileHeaderNavigation
      menuOpen={open}
      menuId="stateful-site-menu"
      panelRef={panelRef}
      closeMenu={closeMenu}
      isActive={(href) => href === location.pathname}
      isPurposeActive={() => false}
    />
  </>;
}

function renderStatefulMenu() {
  return render(<MemoryRouter initialEntries={["/community"]}><StatefulMenuOwner /></MemoryRouter>);
}

function rankingMenuLink() {
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByRole("searchbox"), { target: { value: "랭킹" } });
  const link = dialog.querySelector<HTMLAnchorElement>('a[href="/ranking"]');
  if (!link) throw new Error("전체 메뉴의 랭킹 링크가 없습니다.");
  const group = link.closest("details");
  if (group) group.open = true;
  return link;
}

describe("모바일 전체 메뉴", () => {
  it("실제 메뉴를 닫아도 RouterLink 이동을 먼저 처리하고 본문을 유지한다", async () => {
    renderStatefulMenu();
    const link = rankingMenuLink();
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    fireEvent(link, click);
    await waitFor(() => expect(screen.getByTestId("menu-route").textContent).toBe("/ranking"));
    expect(click.defaultPrevented).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("링크의 이동 취소 가드가 실행되면 메뉴와 현재 경로를 유지한다", () => {
    renderStatefulMenu();
    const link = rankingMenuLink();
    const guard = vi.fn((event: Event) => {
      expect(link.isConnected).toBe(true);
      event.preventDefault();
    });
    link.addEventListener("click", guard);
    fireEvent.click(link);
    expect(guard).toHaveBeenCalledOnce();
    expect(screen.getByTestId("menu-route").textContent).toBe("/community");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it.each([
    { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 },
  ])("수정키·보조 클릭 %j는 현재 메뉴를 닫거나 경로를 바꾸지 않는다", (modifier) => {
    renderStatefulMenu();
    const link = rankingMenuLink();
    // RouterLink 뒤에서 jsdom의 네이티브 탐색만 막아 수정키 처리를 방해하지 않는다.
    const preventNativeNavigation = (event: Event) => event.preventDefault();
    document.addEventListener("click", preventNativeNavigation);
    try { fireEvent.click(link, modifier); }
    finally { document.removeEventListener("click", preventNativeNavigation); }
    expect(screen.getByTestId("menu-route").textContent).toBe("/community");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("일곱 목적을 별도 페이지로 연결하고 전체 목록을 메뉴에 반복하지 않는다", () => {
    render(menu());
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelectorAll("details")).toHaveLength(0);
    expect([...dialog.querySelectorAll(".site-menu-task")].map((link) => link.getAttribute("href"))).toEqual([
      "/sitemap/discover", "/sitemap/create", "/sitemap/grow", "/sitemap/publish",
      "/sitemap/connect", "/sitemap/rest", "/sitemap/personal",
    ]);
    expect(dialog.querySelector('a[href="/play"]')).toBeNull();
  });

  it("작품 시작하기와 내 작업을 앞에 두고 상세 디렉터리·도움말로 연결한다", () => {
    render(menu());
    const navigation = within(screen.getByRole("dialog")).getByRole("navigation", { name: "전체 서비스 메뉴" });
    expect(within(navigation).getByRole("link", { name: "작품 시작하기" }).getAttribute("href")).toBe("/create");
    expect(within(navigation).getByRole("link", { name: "내 작업" }).getAttribute("href")).toBe("/studio");
    expect(within(navigation).getByRole("link", { name: "전체 기능" }).getAttribute("href")).toBe("/sitemap/all");
    expect(navigation.querySelector('a[href="/help"]')).not.toBeNull();
  });

  it("모든 기존 목적지를 메뉴 이름 검색으로 직접 찾고 중복 결과를 만들지 않는다", () => {
    render(menu());
    const dialog = screen.getByRole("dialog");
    const destinations = [
      ...siteNavigationGroupsForPath("/market").flatMap((group) => group.items),
      ...SITE_UTILITY_NAVIGATION,
    ];
    for (const item of destinations) {
      fireEvent.change(within(dialog).getByRole("searchbox"), { target: { value: item.label.ko } });
      const hrefs = [...dialog.querySelectorAll(".site-menu-results a")].map((link) => link.getAttribute("href"));
      expect(hrefs, item.id).toContain(item.href);
      expect(new Set(hrefs).size, item.id).toBe(hrefs.length);
    }
  });

  it.each([
    ["/market", "자료·성장", "/sitemap/grow"],
    ["/team/people", "함께 보기", "/sitemap/connect"],
    ["/studio/publish", "연재·내보내기", "/sitemap/publish"],
  ])("%s에서 현재 목적 하나를 강조하고 해당 기능 페이지를 연다", (pathname, groupLabel, href) => {
    render(menu(true, vi.fn(), pathname));
    const dialog = screen.getByRole("dialog");
    const highlighted = dialog.querySelectorAll('[data-current-journey="true"]');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]?.textContent).toContain(groupLabel);
    expect(highlighted[0]?.getAttribute("href")).toBe(href);
    expect(dialog.querySelectorAll(".site-menu-task")).toHaveLength(7);
  });

  it("키보드 포커스를 메뉴 안에 유지하고 닫힐 때 배경 조작을 복원한다", async () => {
    const closeMenu = vi.fn();
    const view = render(menu(true, closeMenu));
    const dialog = screen.getByRole("dialog");
    const close = within(dialog).getByRole("button", { name: "nav.allMenu common.close" });
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(screen.getByTestId("page-action").hasAttribute("inert")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    const links = within(dialog).getAllByRole("link");
    const last = links[links.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Escape" });
    expect(closeMenu).toHaveBeenCalledOnce();

    view.rerender(menu(false, closeMenu));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("page-action").hasAttribute("inert")).toBe(false);
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByRole("navigation", { name: "nav.quickAccess" })).toBeTruthy();
  });

  it("하단 탭바는 모바일 뷰포트에서만 렌더하고 canonical 경로를 유지한다", () => {
    const tabs = (isMobileViewport?: boolean) => (
      <MemoryRouter initialEntries={["/market"]}>
        <MobileHeaderNavigation
          menuOpen={false}
          menuId="site-menu"
          panelRef={createRef<HTMLDivElement>()}
          closeMenu={vi.fn()}
          isActive={(href) => href === "/market"}
          isPurposeActive={() => false}
          isMobileViewport={isMobileViewport}
        />
      </MemoryRouter>
    );

    const { unmount } = render(tabs(true));
    const navigation = screen.getByRole("navigation", { name: "nav.quickAccess" });
    const hrefs = within(navigation).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/studio", "/discover", "/market", "/my", "/sitemap"]);
    for (const href of hrefs) {
      expect(href).not.toMatch(/^\/(new|more)(\/|$)/u);
    }
    unmount();

    render(tabs(false));
    expect(screen.queryByRole("navigation", { name: "nav.quickAccess" })).toBeNull();
  });

  it("현재 경로를 가리키는 링크를 눌러도 전체 메뉴를 닫고 도움 링크 이름은 자르지 않는다", () => {
    const closeMenu = vi.fn();
    render(menu(true, closeMenu, "/market"));
    const dialog = screen.getByRole("dialog", { name: "nav.allMenu" });
    expect(dialog.parentElement?.className).toContain("z-[110]");

    fireEvent.change(within(dialog).getByRole("searchbox"), { target: { value: "소재 찾기" } });
    const currentRouteLink = dialog.querySelector<HTMLAnchorElement>('a[href="/market"]');
    expect(currentRouteLink).not.toBeNull();
    expect(currentRouteLink?.getAttribute("aria-current")).toBe("page");
    fireEvent.click(currentRouteLink!);
    expect(closeMenu).toHaveBeenCalledOnce();

    const notificationsLink = dialog.querySelector<HTMLAnchorElement>('a[href="/notifications"]');
    const labelSpan = notificationsLink?.querySelector("span");
    expect(labelSpan?.className).toContain("min-w-0");
    expect(labelSpan?.className).not.toContain("truncate");
    expect(labelSpan?.textContent).toBe(notificationsLink?.getAttribute("aria-label"));
  });
});


describe("모바일의 공통 네 목적 현재 위치", () => {
  it("목적별 하위 메뉴에서도 엄지로 전체 메뉴에 돌아가고 현재 탭을 읽는다", () => {
    render(<MemoryRouter initialEntries={["/sitemap/create"]}><MobileHeaderNavigation
      menuOpen={false} menuId="section-menu" panelRef={createRef<HTMLDivElement>()}
      closeMenu={() => {}} isActive={() => false} isPurposeActive={() => false}
      currentPurposeHref={null} /></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "nav.quickAccess" });
    expect(within(nav).getAllByRole("link")).toHaveLength(5);
    const current = nav.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute("href")).toBe("/sitemap");
  });

  it.each(["/studio", "/discover", "/market", "/my"] as const)("정본 목적 %s를 현재 탭 하나로 표시한다", (href) => {
    render(<MemoryRouter initialEntries={["/production/projects"]}><MobileHeaderNavigation
      menuOpen={false} menuId="purpose-menu" panelRef={createRef<HTMLDivElement>()}
      closeMenu={() => {}} isActive={() => false} isPurposeActive={() => false}
      currentPurposeHref={href} /></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "nav.quickAccess" });
    const current = nav.querySelectorAll('a[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute("href")).toBe(href);
  });
  it("목적 외 안내 페이지는 네 목적 중 하나를 거짓으로 활성화하지 않는다", () => {
    render(<MemoryRouter initialEntries={["/about"]}><MobileHeaderNavigation
      menuOpen={false} menuId="outside-purpose" panelRef={createRef<HTMLDivElement>()}
      closeMenu={() => {}} isActive={() => false} isPurposeActive={() => true}
      currentPurposeHref={null} /></MemoryRouter>);
    expect(screen.getByRole("navigation", { name: "nav.quickAccess" }).querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });
});
