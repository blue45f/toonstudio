// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { MemoryRouter } from "react-router-dom";
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

describe("모바일 전체 메뉴", () => {
  it("작품 시작하기와 내 프로젝트를 앞에 두고 전체 기능·계정까지 연결한다", () => {
    render(menu());
    const dialog = screen.getByRole("dialog", { name: "nav.allMenu" });
    const navigation = within(dialog).getByRole("navigation", { name: "전체 서비스 메뉴" });
    expect(within(navigation).getByRole("link", { name: /작품 시작하기/u }).getAttribute("href")).toBe("/create");
    expect(within(navigation).getByRole("link", { name: "내 프로젝트" }).getAttribute("href")).toBe("/studio");
    expect(within(navigation).getByRole("link", { name: "전체 기능" }).getAttribute("href")).toBe("/sitemap");
    for (const href of ["/market", "/learn", "/help", "/settings", "/notifications"]) {
      expect(navigation.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
    expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(navigation.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe("/market");
  });

  it.each(["/market", "/home", "/studio", "/my", "/notifications"])("%s에서 목적지를 중복하지 않고 모든 작업 경로를 보존한다", (pathname) => {
    render(menu(true, vi.fn(), pathname));
    const navigation = within(screen.getByRole("dialog")).getByRole("navigation", { name: "전체 서비스 메뉴" });
    const hrefs = [...navigation.querySelectorAll("a[href]")].map((link) => link.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs.slice(0, 2)).toEqual(["/create", "/studio"]);
    const destinations = [
      ...siteNavigationGroupsForPath(pathname).flatMap((group) => group.items),
      ...SITE_UTILITY_NAVIGATION,
    ];
    for (const item of destinations) expect(hrefs).toContain(item.href);
    expect(hrefs).toContain("/sitemap");
    expect(navigation.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it.each([
    ["/market", "자료·성장"],
    ["/team/people", "함께 보기"],
    ["/studio/publish", "연재·내보내기"],
  ])("%s에서는 현재 여정 구간 하나만 강조하고 지도는 그대로다", (pathname, groupLabel) => {
    render(menu(true, vi.fn(), pathname));
    const dialog = screen.getByRole("dialog");
    const highlighted = dialog.querySelectorAll('[data-current-journey="true"]');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]?.textContent).toContain(groupLabel);
    expect(highlighted[0]?.textContent).toContain("현재 여정");
    // 지도 자체는 컨텍스트마다 달라지지 않는다: 구간 수는 항상 같다.
    expect(dialog.querySelectorAll(".site-menu-group")).toHaveLength(6);
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
    expect(hrefs).toEqual(["/", "/studio", "/discover", "/community", "/sitemap"]);
    for (const href of hrefs) {
      expect(href).not.toMatch(/^\/(new|more)(\/|$)/u);
    }
    unmount();

    render(tabs(false));
    expect(screen.queryByRole("navigation", { name: "nav.quickAccess" })).toBeNull();
  });
});
