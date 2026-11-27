// @vitest-environment jsdom
import { readFileSync } from "node:fs";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteHeader } from "@/shared/components/site-header";
import { useI18n } from "@/shared/lib/i18n";

const ROOT_HOME = "apps/web/src/domains/creator-resources/CreatorHomePage.tsx";
const HOME_EXPERIENCE = "apps/web/src/domains/marketing/CreatorHomeExperience.tsx";
const HOME_DASHBOARD = "apps/web/src/domains/marketing/ReferenceCreatorDashboard.tsx";
const HOME_INTRODUCTION = "apps/web/src/domains/marketing/CreatorStudioIntroduction.tsx";
const PRODUCT_INTENT = "apps/web/src/domains/creator-resources/ProductIntentStart.tsx";
const MAKE_HUB = "apps/web/src/domains/creator-resources/MakeHubPage.tsx";
const CREATOR_ROUTES = "apps/web/src/app/routes/groups/creator-resources.routes.tsx";
const CATALOG_ROUTES = "apps/web/src/app/routes/groups/catalog.routes.tsx";
const ACCOUNT_ROUTES = "apps/web/src/app/routes/groups/account.routes.tsx";
const SITE_NAVIGATION = "apps/web/src/shared/components/site-navigation.ts";
const COMMAND_PALETTE = "apps/web/src/shared/components/command-palette-data.ts";
const LEGAL_ROUTES = "apps/web/src/app/routes/groups/legal.routes.tsx";
const MARKET_NAV = "apps/web/src/domains/market/components/MarketNavHeader.tsx";
const RANDOM_PAGE = "apps/web/src/domains/catalog/RandomPage.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("purpose-first product UX foundation", () => {
  it("puts the task launcher before detailed creator guidance", () => {
    const root = readFileSync(ROOT_HOME, "utf8");
    const experience = readFileSync(HOME_EXPERIENCE, "utf8");
    const dashboard = readFileSync(HOME_DASHBOARD, "utf8");
    const introduction = readFileSync(HOME_INTRODUCTION, "utf8");
    expect(root).toContain("<CreatorHomeExperience />");
    expect(root).not.toContain("<StudioWorkspacePage");
    // 같은 컴포넌트가 홈(대시보드)과 소개(/about/studio)를 그린다. 시작 런처는 두 화면 모두에 있다.
    expect(experience).toContain("{!introduction && <ReferenceCreatorDashboard />}");
    expect(dashboard).toContain('id="creator-start"');
    expect(dashboard).toContain('id="creator-toolkit-title"');
    const routes = readFileSync("apps/web/src/app/routes/groups/marketing.routes.tsx", "utf8");
    expect(routes).toContain('path: "/about/studio"');
    // 소개 화면에서는 런처가 기능 브리지(상세 안내)보다 앞에 온다.
    const launcher = '<ProductIntentStart headingId="creator-toolkit-title" />';
    expect(introduction).toContain(launcher);
    expect(introduction.indexOf('id="creator-start"')).toBeLessThan(introduction.indexOf(launcher));
    expect(introduction.indexOf(launcher)).toBeLessThan(introduction.indexOf("<StudioIntroBridge />"));
    expect(introduction.match(/<ProductIntentStart\b/gu)).toHaveLength(1);
  });

  it("opens the true global command palette from the home search launcher", () => {
    const source = readFileSync(PRODUCT_INTENT, "utf8");
    expect(source).toContain("state.openCommandPalette");
    expect(source).toContain("onClick={openSearch}");
    expect(source).toContain('search: "프로젝트·컷·도구·소재를 바로 찾기"');
    expect(source).not.toContain('href="/search"\n              className="mt-6');
  });

  it("routes the unified Create hub without replacing direct Studio routes", () => {
    const hub = readFileSync(MAKE_HUB, "utf8");
    const routes = readFileSync(CREATOR_ROUTES, "utf8");
    expect(routes).toContain('path: "/make"');
    expect(hub).toContain('href="/studio"');
    expect(hub).toContain('/studio?preset=webtoon');
    expect(hub).toContain('/studio?preset=4cut');
    expect(hub).toContain('/studio?preset=illustration');
  });

  it("routes Discover as the global find destination while preserving specialist discovery pages", () => {
    const routes = readFileSync(CATALOG_ROUTES, "utf8");
    const navigation = readFileSync(SITE_NAVIGATION, "utf8");
    expect(routes).toContain('path: "/discover"');
    for (const path of ["/search", "/explore", "/ranking", "/recommend", "/calendar", "/random", "/compare"]) {
      expect(routes).toContain(`path: "${path}"`);
    }
    expect(navigation).toMatch(/explore:\s*item\(\s*"explore",\s*"\/discover"/u);
  });

  it("routes My Space as the global account destination while preserving detailed account pages", () => {
    const routes = readFileSync(ACCOUNT_ROUTES, "utf8");
    const navigation = readFileSync(SITE_NAVIGATION, "utf8");
    expect(routes).toMatch(/route\(\s*"account-my-space"\s*,\s*"\/my"/u);
    expect(routes).toMatch(/route\(\s*"account-me"\s*,\s*"\/me"/u);
    expect(navigation).toMatch(/me:\s*item\(\s*"me",\s*"\/my"/u);
  });

  it.each([
    { pathname: "/sitemap/all", dockLabel: "더보기", drawerLabel: "전체 기능", href: "/sitemap/all", current: "page" },
    { pathname: "/title/example", dockLabel: "더보기", drawerLabel: "전체 기능", href: "/sitemap/all", current: null },
    { pathname: "/studio/new", dockLabel: "내 작업", drawerLabel: "내 작업", href: "/studio", current: null },
  ])("keeps the $pathname dock purpose separate from the exact drawer destination", async ({ pathname, dockLabel, drawerLabel, href, current }) => {
    useI18n.getState().setLang("ko");
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query === "(max-width: 1179px)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(createElement(MemoryRouter, { initialEntries: [pathname] }, createElement(SiteHeader)));

    const dock = await screen.findByRole("navigation", { name: "빠른 이동" });
    const more = within(dock).getByRole("button", { name: "더보기" });
    const purpose = dockLabel === "더보기" ? more : within(dock).getByRole("link", { name: dockLabel });
    expect(dock.querySelectorAll("[aria-current]")).toHaveLength(1);
    expect(purpose.getAttribute("aria-current")).toBe(purpose === more ? "true" : "page");

    fireEvent.click(more);
    const drawer = await screen.findByRole("dialog", { name: "전체 메뉴" });
    const destination = within(drawer).getByRole("link", { name: drawerLabel });
    expect(destination.getAttribute("href")).toBe(href);
    expect(destination.getAttribute("aria-current")).toBe(current);

    const help = within(drawer).getByRole("link", { name: "도움말" });
    expect(help.getAttribute("href")).toBe("/help");
    expect(help.hasAttribute("aria-current")).toBe(false);

    fireEvent.change(within(drawer).getByRole("searchbox"), { target: { value: "내 작업" } });
    const studioResult = within(drawer).getByRole("link", { name: "내 작업" });
    expect(studioResult.getAttribute("href")).toBe("/studio");
    expect(studioResult.hasAttribute("aria-current")).toBe(false);
  });

  it("indexes the new purpose hubs in the global command palette", () => {
    const palette = readFileSync(COMMAND_PALETTE, "utf8");
    // 만들기 허브의 정문은 /create 시작 시트다. /make는 /studio/new로 넘기는 별칭이라
    // 팔레트가 가리키면 시작 시트를 건너뛰어 진입점이 다시 둘로 갈라진다.
    for (const href of ["/discover", "/create", "/my", "/help"]) {
      expect(palette).toContain(`href: "${href}"`);
    }
    expect(palette).not.toContain('href: "/make"');
  });

  it("exposes searchable help and accessibility destinations", () => {
    const routes = readFileSync(LEGAL_ROUTES, "utf8");
    expect(routes).toContain('path: "/help"');
    expect(routes).toContain('path: "/accessibility"');
  });

  it("keeps a single seller-center entrance in the marketplace header", () => {
    const source = readFileSync(MARKET_NAV, "utf8");
    // S1-5: 판매 진입은 판매자 센터 하나로 수렴했다(등록·관리는 센터의 탭). 정본 경로는
    // models/market-seller-center.ts의 SELLER_CENTER_PATH이고, 현재 위치 판정은
    // MarketNavHeader.test.tsx가 맡는다. 이 테스트는 내비에 구 진입이 다시 늘어나지 않게 막는다.
    expect(source).toContain("웹툰 소재 작업실");
    expect(source).toContain('href: "/market/seller"');
    expect(source).toContain('label: ["판매자 센터", "Seller center"]');
    expect(source).not.toContain("배포하기");
    expect(source).not.toContain('href: "/market/publish"');
    expect(source).not.toContain('href: "/market/manage"');
  });

  it("previews random picks instead of forcing a detail redirect", () => {
    const source = readFileSync(RANDOM_PAGE, "utf8");
    expect(source).toContain("다시 뽑기");
    expect(source).toContain("이 작품 보기");
    expect(source).not.toContain("router.replace");
  });
});
