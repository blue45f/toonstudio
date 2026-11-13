// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { SitemapPage, SitemapSectionPage } from "./SitemapPage";

import { SITE_NAVIGATION_GROUPS } from "@/shared/components/site-navigation";
import { isPublicCreativeRoute } from "@/shared/components/site-public-routes";
import { useI18n } from "@/shared/lib/i18n-core";
import { resolveSiteRouteMetadata } from "@/shared/lib/site-route-metadata";
import { useUi } from "@/shared/lib/ui-store";

function DirectoryLocation() {
  const { pathname, search, hash } = useLocation();
  return <output>{pathname}{search}{hash}</output>;
}

function renderMenu(path = "/sitemap") {
  return render(<MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/sitemap" element={<SitemapPage />} />
      <Route path="/sitemap/all" element={<DirectoryLocation />} />
      <Route path="/sitemap/:section" element={<SitemapSectionPage />} />
    </Routes>
  </MemoryRouter>);
}

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
  useUi.getState().closeCommandPalette();
});

describe("모바일 목적별 메뉴", () => {
  it.each(["/sitemap/all", ...SITE_NAVIGATION_GROUPS.map((group) => `/sitemap/${group.id}`)])(
    "%s는 공개 문서 셸과 기존 접근 조건을 유지한다", (path) => {
      expect(isPublicCreativeRoute(path)).toBe(true);
      expect(resolveSiteRouteMetadata(path)).toMatchObject({
        product: "docs", purpose: "trust", access: "public", device: "responsive", projectContext: "none",
      });
    },
  );

  it("첫 화면은 두 고정 행동과 일곱 목적만 제공하고 전체 목록은 별도 화면에 둔다", () => {
    renderMenu();
    expect(screen.getByRole("heading", { level: 1, name: "무엇을 하고 싶으세요?" })).toBeTruthy();
    const start = screen.getByRole("navigation", { name: "바로 시작" });
    expect(within(start).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/create", "/studio"]);
    const sections = screen.getByRole("navigation", { name: "목적별 메뉴" });
    expect(within(sections).getAllByRole("link").map((link) => link.getAttribute("href")))
      .toEqual(SITE_NAVIGATION_GROUPS.map((group) => `/sitemap/${group.id}`));
    expect(document.querySelector('a[href="/studio/bg3d"]')).toBeNull();
    expect(screen.getByRole("link", { name: "전체 기능 목록 보기" }).getAttribute("href")).toBe("/sitemap/all");
  });

  it("목적을 고르면 해당 목적지만 보여주고 전체 메뉴로 돌아올 수 있다", () => {
    renderMenu();
    const sections = screen.getByRole("navigation", { name: "목적별 메뉴" });
    fireEvent.click(within(sections).getByRole("link", { name: /만들기/u }));
    expect(screen.getByRole("heading", { level: 1, name: "만들기" })).toBeTruthy();
    const destinations = screen.getByRole("navigation", { name: "만들기" });
    expect(within(destinations).getAllByRole("link").map((link) => link.getAttribute("href")))
      .toEqual(SITE_NAVIGATION_GROUPS.find((group) => group.id === "create")?.items.map((item) => item.href));
    expect(document.querySelector('a[href="/ranking"]')).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "전체 메뉴" }));
    expect(screen.getByRole("navigation", { name: "목적별 메뉴" })).toBeTruthy();
  });

  it.each(SITE_NAVIGATION_GROUPS.map((group) => [group.id, group.label.ko, group.items.map((item) => item.href)] as const))(
    "%s 딥링크는 정본 목적지를 빠짐없이 표시한다", (id, title, hrefs) => {
      renderMenu(`/sitemap/${id}`);
      expect(within(screen.getByRole("navigation", { name: title })).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(hrefs);
    },
  );

  it("알 수 없는 목적은 오류 안내와 복귀 링크를 제공한다", () => {
    renderMenu("/sitemap/missing");
    expect(screen.getByRole("heading", { name: "메뉴를 찾을 수 없어요" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "전체 메뉴" }).getAttribute("href")).toBe("/sitemap");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("라우터와 같은 대소문자 규칙으로 목적별 메뉴를 연다", () => {
    renderMenu("/SITEMAP/CREATE/");
    expect(screen.getByRole("heading", { level: 1, name: "만들기" })).toBeTruthy();
  });

  it.each([
    ["/sitemap?menu=brush&tier=core#sitemap-directory", "/sitemap/all?menu=brush&tier=core#sitemap-directory"],
    ["/sitemap#sitemap-core-title", "/sitemap/all#sitemap-core-title"],
  ])("기존 주소 %s의 검색·필터·앵커를 보존한다", (path, target) => {
    renderMenu(path);
    expect(screen.getByRole("status").textContent).toBe(target);
  });

  it("메뉴 검색은 기존 통합 검색을 연다", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "메뉴 이름으로 검색" }));
    expect(useUi.getState().commandPaletteOpen).toBe(true);
  });

  it("영문에서도 같은 목적 경로와 시작 행동을 제공한다", () => {
    useI18n.getState().setLang("en");
    renderMenu("/sitemap/publish");
    expect(screen.getByRole("heading", { level: 1, name: "Publish" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "All menus" }).getAttribute("href")).toBe("/sitemap");
  });
});
