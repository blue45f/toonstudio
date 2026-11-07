// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketResourceFamilyExplorer } from "./MarketResourceFamilyExplorer";

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string, en: string) => document.documentElement.lang === "en" ? en : ko,
}));

afterEach(() => { cleanup(); document.documentElement.lang = "ko"; });
function show() { return render(<MemoryRouter><MarketResourceFamilyExplorer /></MemoryRouter>); }

describe("소재 탐색 안내 단순화", () => {
  it("사용 안내는 기본적으로 접혀 있고 실제 탐색 링크는 유지한다", () => {
    const { container } = show();
    const guide = screen.getByTestId("market-usage-guide");
    expect(guide.tagName).toBe("DETAILS");
    expect(guide.hasAttribute("open")).toBe(false);
    expect(screen.getByRole("link", {name:"전체 리소스 보기"}).getAttribute("href")).toBe("/market/browse");
    expect(screen.getByRole("link", {name:"캔버스 열기"}).getAttribute("href")).toBe("/studio/canvas");
    expect(container.querySelectorAll("article")).toHaveLength(5);
  });
  it("펼쳐도 허가를 보증하거나 계산하지 않는 선택 버튼은 보여 주지 않는다", () => {
    const { container } = show();
    const guide = screen.getByTestId("market-usage-guide");
    const summary = guide.querySelector("summary");
    expect(summary).not.toBeNull();
    if (summary) fireEvent.click(summary);
    expect(guide.hasAttribute("open")).toBe(true);
    expect(guide.textContent).toContain("사용 허가나 호환성을 보증하지 않아요");
    expect(container.querySelector('[data-testid^="market-license-tier-"]')).toBeNull();
    expect(container.querySelector('[data-testid^="market-preflight-spec-"]')).toBeNull();
    expect(container.textContent).not.toMatch(/REA 글로벌|VRAM|0px|1-Click|좌석 산정기/);
    if (summary) fireEvent.click(summary);
    expect(guide.hasAttribute("open")).toBe(false);
  });
  it("모바일 터치 여유와 초점 표시를 명시한다", () => {
    show();
    const summary = screen.getByTestId("market-usage-guide").querySelector("summary");
    expect(summary?.className).toContain("min-h-12");
    expect(summary?.className).toContain("focus-visible:outline");
    expect(screen.getByRole("link", {name:"캔버스 열기"}).className).toContain("min-h-[50px]");
    expect(screen.getByRole("link", {name:"캔버스 열기"}).className).toContain("sm:w-auto");
  });
  it("영문에서도 안내와 면책 및 캔버스 링크를 제공한다", () => {
    document.documentElement.lang = "en";
    show();
    const guide = screen.getByTestId("market-usage-guide");
    expect(guide.textContent).toContain("Before using an asset");
    expect(guide.textContent).toContain("does not guarantee");
    expect(screen.getByRole("link", {name:"Open canvas"})).toBeTruthy();
  });

  it("카드 공통 여백과 하단 CTA 정렬용 구조를 유지한다", () => {
    const { container } = show();
    for (const article of container.querySelectorAll("article")) {
      expect(article.className).toContain("flex-col");
      expect(article.className).toContain("p-4");
      expect(article.className).not.toContain("sm:p-5");
      const links = article.querySelectorAll("a");
      const cta = links[links.length - 1];
      expect(cta.parentElement?.className).toContain("mt-auto");
      expect(cta.parentElement?.className).toContain("pt-4");
      expect(cta.querySelector("svg")?.getAttribute("class")).toContain("shrink-0");
    }
  });

  it("추가 카테고리는 펼칠 수 있고 긴 이름을 숨기지 않는다", () => {
    const { container } = show();
    const categories = Array.from(container.querySelectorAll("article details"));
    expect(categories.length).toBeGreaterThan(0);
    for (const details of categories) {
      const summary = details.querySelector("summary");
      if (summary) fireEvent.click(summary);
      expect(details.hasAttribute("open")).toBe(true);
      for (const link of details.querySelectorAll("a")) {
        expect(link.getAttribute("href")).toMatch(/^\/market\/browse/);
        expect(link.className).toContain("py-2");
        expect(link.querySelector("span")?.className).toContain("overflow-wrap:anywhere");
      }
    }
  });
});
