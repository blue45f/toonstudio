// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { SiteMenuDestinations } from "./SiteMenuDestinations";
import { CREATOR_JOURNEY_STAGES, CORE_SURFACE_QUICK_LINKS } from "./workspace/page-role-journey-map";
import { resolveNavigationGroupsFor } from "./site-navigation";
import { searchSiteMenu } from "./site-menu-search";

afterEach(() => { cleanup(); useI18n.getState().setLang("ko"); });

describe("목적별 메뉴 검색", () => {
  it("한영 이름·설명·주소를 같은 정본에서 검색하고 공백과 대소문자를 정규화한다", () => {
    expect(searchSiteMenu("  ")).toEqual([]);
    expect(searchSiteMenu("/STUDIO/BG3D").some((item) => item.href === "/studio/bg3d")).toBe(true);
    expect(searchSiteMenu("리서치").some((item) => item.href === "/research")).toBe(true);
    expect(searchSiteMenu("research").some((item) => item.href === "/research")).toBe(true);
    expect(searchSiteMenu("전혀없는메뉴")).toEqual([]);
  });

  it.each(["ko", "en"] as const)("%s에서도 검색을 지우거나 빈 결과에서 목적 목록으로 돌아온다", (locale) => {
    useI18n.getState().setLang(locale);
    render(<MemoryRouter><SiteMenuDestinations locale={locale} currentGroupId={null} isActive={() => false} menuId="test-menu" /></MemoryRouter>);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "research" } });
    expect(screen.getByRole("status").textContent).toMatch(/[1-9]/u);
    expect(screen.getByRole("link", { name: locale === "ko" ? "리서치 데스크" : "Research desk" }).getAttribute("href")).toBe("/research");
    expect(document.querySelector(".site-menu-tasks")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: locale === "ko" ? "메뉴 검색 지우기" : "Clear menu search" }));
    expect(document.activeElement).toBe(input);
    expect(document.querySelectorAll(".site-menu-task")).toHaveLength(7);
    expect(document.querySelectorAll(".site-menu-task__sublink").length).toBeGreaterThan(20);
    fireEvent.change(input, { target: { value: "전혀없는메뉴" } });
    expect(screen.getByRole("status").textContent).toContain("0");
    fireEvent.click(screen.getByRole("button", { name: locale === "ko" ? "목적별 메뉴 보기" : "Browse tasks" }));
    expect(input).toHaveProperty("value", "");
    expect(document.querySelectorAll(".site-menu-task")).toHaveLength(7);
  });
  it.each(["/", "/community", "/research", "/about/studio", "/market", "/help"])("%s 전체 메뉴는 각 목적지를 한 번만 표시하고 모든 기능으로 연결한다", (pathname) => {
    const { container } = render(<MemoryRouter initialEntries={[pathname]}><SiteMenuDestinations locale="ko" currentGroupId={null} isActive={(href) => href === pathname} menuId="unique-menu" /></MemoryRouter>);
    const hrefs = Array.from(container.querySelectorAll("a[href]"), (link) => link.getAttribute("href"));
    expect(hrefs.filter((href) => href === "/studio")).toHaveLength(1);
    expect(hrefs.filter((href) => href === "/create")).toHaveLength(1);
    expect(hrefs).toHaveLength(new Set(hrefs).size);
    const expected = new Set(["/create", ...CREATOR_JOURNEY_STAGES.map((stage) => stage.primaryHref), ...CORE_SURFACE_QUICK_LINKS.map((item) => item.href), ...resolveNavigationGroupsFor().flatMap((group) => [`/sitemap/${group.id}`, ...group.items.map((item) => item.href)])]);
    for (const href of expected) expect(hrefs).toContain(href);
    expect(container.querySelectorAll(".site-menu-journey__card")).toHaveLength(5);
  });

});
