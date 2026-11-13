// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { SiteFooter } from "./site-footer";
import { SITE_NAVIGATION_GROUPS, SITE_NAVIGATION_ITEMS, SITE_UTILITY_NAVIGATION, siteNavigationText } from "./site-navigation";

import { useI18n } from "@/shared/lib/i18n";

afterEach(() => { cleanup(); useI18n.getState().setLang("ko"); });

describe("공통 브랜드 푸터의 이동 계약", () => {
  it("긴 서비스 목록은 접어 두고 메뉴·도움말·정책은 바로 제공한다", () => {
    const view = render(<MemoryRouter><SiteFooter /></MemoryRouter>);
    const disclosure = view.container.querySelector("details");
    expect(disclosure?.open).toBe(false);
    const quick = screen.getByRole("navigation", { name: "메뉴와 도움말" });
    expect(within(quick).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/sitemap", "/help"]);
    expect(screen.getByRole("navigation", { name: "이용 정책" }).closest("details")).toBeNull();
    const summary = disclosure?.querySelector("summary");
    if (!summary) throw new Error("서비스 안내 펼치기가 없습니다.");
    fireEvent.click(summary);
    expect(disclosure?.open).toBe(true);
    expect(within(screen.getByRole("navigation", { name: "자료·성장" })).getByRole("link", { name: "제작 기술" }).getAttribute("href")).toBe("/about/technology");
  });

  it.each(["ko", "en"] as const)("%s에서도 기존 목적별 메뉴·계정·정책 목적지를 보존한다", (locale) => {
    useI18n.getState().setLang(locale);
    render(<MemoryRouter initialEntries={["/learn"]}><SiteFooter /></MemoryRouter>);
    const footer = screen.getByRole("contentinfo");
    const links = within(footer).getAllByRole("link");
    const hrefs = new Set(links.map((link) => link.getAttribute("href")));
    const expectedDestinations = [
      "/", "/about/principles", "/about", "/guide", "/sitemap", "/help", "/pricing", "/terms", "/privacy", "/copyright",
      SITE_NAVIGATION_ITEMS.make.href,
      SITE_NAVIGATION_ITEMS.research.href,
      ...SITE_UTILITY_NAVIGATION.map((item) => item.href),
      ...SITE_NAVIGATION_GROUPS.flatMap((group) => group.items.filter((item) => item.id !== "technology" && item.id !== "home").map((item) => item.href)),
    ];
    for (const href of expectedDestinations) expect(hrefs.has(href), href).toBe(true);
    for (const group of SITE_NAVIGATION_GROUPS) {
      const navigation = within(footer).getByRole("navigation", { name: siteNavigationText(group.label, locale) });
      for (const item of group.items.filter((item) => item.id !== "technology" && item.id !== "home")) {
        // 모든 목적지는 단일 지도의 정본 라벨 그대로 노출한다 (표면별 덮어씀 없음).
        const name = siteNavigationText(item.label, locale);
        expect(within(navigation).getByRole("link", { name }).getAttribute("href")).toBe(item.href);
      }
    }
    const brand = within(footer).getByRole("link", { name: locale === "ko" ? "ToonStudio 홈" : "ToonStudio home" });
    expect(brand.getAttribute("href")).toBe("/");
    expect(brand.textContent).toBe("ToonStudio");
    for (const link of links) expect(link.textContent?.trim()).not.toBe("");
  });
});
