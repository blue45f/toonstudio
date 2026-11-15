// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteContextualSubNav } from "./site-contextual-subnav";

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "ko" }),
}));

afterEach(cleanup);

describe("맥락 메뉴의 수평 1클릭 리본과 현재 위치 표시", () => {
  it("핵심 형제 탭을 상시 노출 리본으로 즉시 보여 주고 안내·초과 항목을 서랍으로 여닫을 수 있다", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/recommend"]}><SiteContextualSubNav /></MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: "작품 탐색 · 큐레이션" });
    const primaryList = nav.querySelector(".site-contextual-subnav__list--primary");
    expect(primaryList).not.toBeNull();
    expect(primaryList?.querySelector('a[href="/calendar"]')).not.toBeNull();
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(nav.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe("/recommend");
    const disclosure = container.querySelector("details");
    expect(disclosure?.open).toBe(false);
    const summary = disclosure?.querySelector("summary");
    expect(summary).not.toBeNull();
    if (summary) fireEvent.click(summary);
    expect(disclosure?.open).toBe(true);
    expect(screen.getByTestId("site-ux-simplicity-pill").textContent).toContain("이곳에서 할 수 있는 일");
    expect(nav.querySelectorAll("a").length).toBeGreaterThan(4);
    if (summary) fireEvent.click(summary);
    expect(disclosure?.open).toBe(false);
  });

  it.each([
    ["/library", "/library"],
    ["/library?tab=diary", "/library?tab=diary"],
    ["/library?tab=rated", "/library?tab=rated"],
    ["/library?tab=collections", "/library?tab=collections"],
  ])("%s의 쿼리 탭을 현재 위치 하나로 표시한다", (url, href) => {
    const { container } = render(
      <MemoryRouter initialEntries={[url]}><SiteContextualSubNav /></MemoryRouter>,
    );
    const current = container.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute("href")).toBe(href);
  });

  it.each([
    ["/publish", "게시 정보 준비", "/publish"],
    ["/studio/publish", "회차 게시", "/studio/publish"],
  ])("%s의 게시 목적과 현재 위치를 상단 가시 리본에 승격해 구분한다", (url, label, href) => {
    const { container } = render(
      <MemoryRouter initialEntries={[url]}><SiteContextualSubNav /></MemoryRouter>,
    );
    const current = container.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    const activeLink = screen.getByRole("link", { name: new RegExp(label, "u") });
    expect(activeLink.getAttribute("href")).toBe(href);
    expect(current[0]?.getAttribute("href")).toBe(href);
  });
});
