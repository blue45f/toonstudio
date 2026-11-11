// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { FloatingControls } from "./FloatingControls";
import { SiteContextualSubNav } from "./site-contextual-subnav";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

import { NORMALIZED_LOCALE_OPTIONS, useI18n } from "@/shared/lib/i18n";

const contextualSubnavCss = readFileSync(
  resolve(__dirname, "./site-contextual-subnav.css"),
  "utf8"
);

vi.mock("../../domains/auth/components/auth-menu-shell", () => ({
  AuthMenuShell: () => <button type="button">계정</button>,
}));

/**
 * 헤더 1차 메뉴 목적지 (S1-2): 상시 노출은 제작·탐색·커뮤니티·배우기·마켓 5개뿐이다.
 * 가상 스튜디오는 제작 드롭다운 자식으로 강등됐고, 협업은 협업 구역에서만 끼워 넣는 맥락형 항목이다.
 */
const PRIMARY_ENTRY_HREFS = ["/studio", "/discover", "/community", "/learn", "/market"];

const mediaMatches = new Map<string, boolean>();
const mediaListeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>();

/** Install a controllable mobile `matchMedia` test double. */
function installMobileMatchMedia(): void {
  mediaMatches.clear();
  mediaListeners.clear();
  mediaMatches.set("(max-width: 767px)", true);
  mediaMatches.set("(min-width: 1180px)", false);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => {
      const listeners = mediaListeners.get(query) ?? new Set();
      mediaListeners.set(query, listeners);
      return {
        get matches() {
          return mediaMatches.get(query) ?? false;
        },
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          listeners.add(listener);
        },
        removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          listeners.delete(listener);
        },
        addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
        removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
        dispatchEvent: vi.fn(),
      };
    }),
  });
}

function setMediaMatch(query: string, matches: boolean): void {
  mediaMatches.set(query, matches);
  const event = { matches, media: query } as MediaQueryListEvent;
  for (const listener of mediaListeners.get(query) ?? []) listener(event);
}

beforeEach(() => {
  installMobileMatchMedia();
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("mobile site shell accessibility", () => {
  it("isolates the page, loops focus, closes with Escape, and restores the full-menu trigger", async () => {
    const { container } = render(
      <MemoryRouter>
        <SiteHeader />
      </MemoryRouter>
    );

    const primaryNavigation = container.querySelector<HTMLElement>('nav[aria-label="주요 메뉴"]');
    expect(primaryNavigation?.querySelector('a[href="/about/technology"]')).toBeNull();
    expect(Array.from(primaryNavigation?.querySelectorAll("a[data-navigation-entry]") ?? []).map((link) => link.getAttribute("href"))).toEqual(PRIMARY_ENTRY_HREFS);

    const trigger = screen.getByRole("button", { name: "전체 메뉴" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "전체 메뉴" });
    expect(within(dialog).getByRole("link", { name: "리서치 데스크" }).getAttribute("href")).toBe("/research");
    expect(within(dialog).getByRole("link", { name: "소재 마켓" }).getAttribute("href")).toBe("/market");
    const technologyEntry = within(dialog).getByRole("link", { name: "제작 기술" });
    expect(technologyEntry.getAttribute("href")).toBe("/about/technology");
    const close = within(dialog).getByRole("button", { name: "전체 메뉴 닫기" });
    await waitFor(() => expect(document.activeElement).toBe(close));

    const quickNavigation = container.querySelector<HTMLElement>('nav[aria-label="빠른 이동"]');
    expect(quickNavigation?.hasAttribute("inert")).toBe(true);
    expect(quickNavigation?.getAttribute("aria-hidden")).toBe("true");

    const dialogLinks = within(dialog).getAllByRole("link");
    const lastLink = dialogLinks.at(-1);
    expect(lastLink).toBeDefined();
    lastLink?.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(lastLink);

    const backgroundHome = container.querySelector<HTMLElement>('header a[href="/"]');
    backgroundHome?.focus();
    await waitFor(() => expect(document.activeElement).toBe(close));

    expect(screen.queryByRole("button", { name: "설정 닫기" })).toBeNull();
    const backdrop = container.querySelector<HTMLElement>('[data-mobile-menu-backdrop="true"]');
    expect(backdrop?.tagName).toBe("DIV");
    expect(backdrop?.getAttribute("aria-hidden")).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "전체 메뉴" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(quickNavigation?.hasAttribute("inert")).toBe(false);
    expect(quickNavigation?.hasAttribute("aria-hidden")).toBe(false);
  });

  it("switches both desktop and mobile GNB to the reader context on discovery routes", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/discover"]}>
        <SiteHeader />
      </MemoryRouter>
    );

    const primaryNavigation = container.querySelector<HTMLElement>('nav[aria-label="주요 메뉴"]');
    expect(Array.from(primaryNavigation?.querySelectorAll("a[data-navigation-entry]") ?? []).map((link) => link.getAttribute("href"))).toEqual(PRIMARY_ENTRY_HREFS);

    const quickNavigation = container.querySelector<HTMLElement>('nav[aria-label="빠른 이동"]');
    expect(Array.from(quickNavigation?.querySelectorAll("a") ?? []).map((link) => link.getAttribute("href"))).toEqual(["/", "/studio", "/discover", "/community", "/sitemap"]);
    expect(quickNavigation?.querySelector(":scope > .grid")?.className).toContain("grid-cols-5");
    expect(within(quickNavigation as HTMLElement).getByRole("link", { name: "탐색" }).getAttribute("aria-current")).toBe("page");
  });

  it("shows Korean on the closed search-first language picker", () => {
    useI18n.getState().setLang("ko-KR");

    render(<FloatingControls placement="static" showTheme={false} />);

    const language = screen.getByRole("button", { name: "언어 선택" });
    expect(useI18n.getState().lang).toBe("ko");
    expect(language.textContent).toContain("한국어");
    expect(screen.queryByRole("listbox", { name: "언어 검색 결과" })).toBeNull();
  });

  it("searches the worldwide catalog without rendering every locale while closed", () => {
    useI18n.getState().setLang("ko");
    render(<FloatingControls placement="static" showTheme={false} />);

    const trigger = screen.getByRole("button", { name: "언어 선택" });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    fireEvent.click(trigger);

    const initialOptions = screen.getAllByRole("option");
    expect(initialOptions.length).toBeGreaterThan(1);
    expect(initialOptions.length).toBeLessThan(NORMALIZED_LOCALE_OPTIONS.length);

    fireEvent.change(screen.getByRole("searchbox", { name: "언어 검색" }), {
      target: { value: "tlh" },
    });
    const klingon = screen.getByRole("option", { name: /tlh/i });
    fireEvent.click(klingon);

    expect(useI18n.getState().lang).toBe("tlh");
    expect(screen.queryByRole("dialog", { name: "언어 선택" })).toBeNull();
  });


  it("releases the hidden dialog trap when the desktop navigation breakpoint takes over", async () => {
    const { container } = render(
      <MemoryRouter>
        <SiteHeader />
      </MemoryRouter>
    );

    const trigger = screen.getByRole("button", { name: "전체 메뉴" });
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "전체 메뉴" });
    const quickNavigation = container.querySelector<HTMLElement>('nav[aria-label="빠른 이동"]');
    expect(quickNavigation?.hasAttribute("inert")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    act(() => setMediaMatch("(min-width: 1180px)", true));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "전체 메뉴" })).toBeNull());
    expect(quickNavigation?.hasAttribute("inert")).toBe(false);
    expect(quickNavigation?.hasAttribute("aria-hidden")).toBe(false);
    expect(document.body.style.overflow).toBe("");
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.activeElement).not.toBe(trigger);
  });

  it("reserves the fixed quick-navigation height below the mobile footer", () => {
    const { container } = render(
      <MemoryRouter>
        <SiteFooter />
      </MemoryRouter>
    );

    const footer = container.querySelector("footer");
    // S1-3: 푸터도 전체 메뉴·⌘K와 같은 목적지 집합을 쓰므로 "제작 기술"을 더 이상 따로 빼지 않는다.
    expect(screen.getByRole("link", { name: "제작 기술" }).getAttribute("href")).toBe("/about/technology");
    expect(footer?.className).toContain(
      "pb-[calc(3.75rem+env(safe-area-inset-bottom))]"
    );
    expect(footer?.className).toContain("md:pb-0");
  });

  it("closes the mobile full-menu when clicking a link that points to the current pathname", async () => {
    render(
      <MemoryRouter initialEntries={["/market"]}>
        <SiteHeader />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "전체 메뉴" }));
    const dialog = await screen.findByRole("dialog", { name: "전체 메뉴" });
    const currentLink = within(dialog).getByRole("link", { name: "소재 마켓" });
    expect(currentLink.getAttribute("aria-current")).toBe("page");

    fireEvent.click(currentLink);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "전체 메뉴" })).toBeNull());
  });

  it("reopens a desktop primary nav submenu with ArrowDown after Escape and enforces 44px subnav touch targets", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/discover"]}>
        <SiteHeader />
        <SiteContextualSubNav pathnameOverride="/ranking" />
      </MemoryRouter>
    );

    const primaryNavigation = container.querySelector<HTMLElement>('nav[aria-label="주요 메뉴"]')!;
    const exploreTrigger = within(primaryNavigation).getByRole("link", { name: "탐색" });
    fireEvent.focus(exploreTrigger);
    expect(exploreTrigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(exploreTrigger, { key: "Escape" });
    expect(exploreTrigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(exploreTrigger);

    fireEvent.keyDown(exploreTrigger, { key: "ArrowDown" });
    expect(exploreTrigger.getAttribute("aria-expanded")).toBe("true");
    const firstSubmenuLink = exploreTrigger.parentElement?.querySelector<HTMLElement>("ul a");
    expect(document.activeElement).toBe(firstSubmenuLink);

    const subnav = container.querySelector<HTMLElement>('[data-contextual-subnav="discover-hub"]')!;
    expect(subnav).not.toBeNull();
    const subnavLinks = within(subnav).getAllByRole("link");
    expect(subnavLinks.length).toBeGreaterThan(0);
    for (const link of subnavLinks) {
      expect(link.classList.contains("site-contextual-subnav__link")).toBe(true);
    }
    expect(contextualSubnavCss).toContain("min-height: var(--site-control-size, 44px);");
    expect(contextualSubnavCss).toContain("flex-wrap: wrap;");
  });
});
