// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchPage } from "./SearchPage";

const child = vi.hoisted(() => ({ mounts: vi.fn(), props: vi.fn() }));
vi.mock("@/shared/components/search-explorer", async () => {
  const { useSearchQueryDraft } = await import("@/shared/components/use-search-query-draft");
  return {
    SearchExplorer: function Explorer(props: {
      initialQuery: string;
      initialFree: boolean;
      initialPlatforms: string[];
    }) {
      const { q, setQ } = useSearchQueryDraft(props.initialQuery);
      useEffect(() => { child.mounts(); }, []);
      child.props(props);
      return (
        <section aria-label="작품 검색">
          <div data-search-results="">
            <input type="search" aria-label="작품 검색어" value={q} onChange={(event) => setQ(event.target.value)} />
            <p>검색 결과 영역</p>
          </div>
        </section>
      );
    },
  };
});
vi.mock("@/shared/components/unified-search-sections", () => ({
  UnifiedSearchSections: ({ query }: { query: string }) => <section data-testid="unified-search" data-query={query}>다른 유형 결과</section>,
}));
vi.mock("@/shared/components/page-entrance/PageEntrance", () => ({
  PageEntrance: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/shared/components/site-contextual-subnav", () => ({
  SiteContextualSubNav: () => <nav aria-label="문맥 안내" />,
}));
vi.mock("@/shared/lib/i18n", () => ({
  useT: () => (key: string) => key,
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "ko" }),
  registerI18nLocaleEntries: () => undefined,
  registerI18nEnglishSourceEntries: () => undefined,
}));
vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string) => ko,
  useBilingualI18nRevision: () => undefined,
  translateBilingualValueForActiveLocale: (_namespace: string, ko: unknown) => ko,
}));

function Controls() {
  const navigate = useNavigate();
  const location = useLocation();
  return <>
    <button type="button" onClick={() => navigate("/search?q=둘째&free=1")}>다른 검색</button>
    <output aria-label="현재 주소">{location.pathname}{location.search}</output>
  </>;
}
function page(url = "/search?q=판타지") {
  return render(<MemoryRouter initialEntries={[url]}><SearchPage /><Controls /></MemoryRouter>);
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe("검색 페이지 결과 우선 배치", () => {
  it("실제 탐색기와 통합검색을 접힌 안내보다 먼저 배치한다", () => {
    page();
    expect(document.querySelector(".search-page-heading-shell > header")).toBeTruthy();
    const field = screen.getByRole("searchbox", { name: "작품 검색어" });
    const tools = screen.getByTestId("search-page-tools") as HTMLDetailsElement;
    const unified = screen.getByTestId("unified-search");
    expect(field.closest("details")).toBeNull();
    expect(tools.open).toBe(false);
    expect(field.compareDocumentPosition(unified) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(unified.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("네 가지 전용 검색 링크에 지원되는 검색어 계약을 적용한다", () => {
    page("/search?q=%20%ED%8C%90%ED%83%80%EC%A7%80%20%26%20%EB%8B%AC%20");
    const nav = screen.getByRole("navigation", { name: "유형별 검색 바로가기" });
    const urls = within(nav).getAllByRole("link").map((link) => new URL(link.getAttribute("href") ?? "", "https://example.test"));
    expect(urls.map((url) => url.pathname)).toEqual(["/learn", "/help", "/sitemap", "/market/browse"]);
    expect(urls[0].searchParams.get("q")).toBe("판타지 & 달");
    expect(urls[1].search).toBe("");
    expect(urls[2].searchParams.get("menu")).toBe("판타지 & 달");
    expect(urls[3].searchParams.get("q")).toBe("판타지 & 달");
  });

  it("세부 통합 결과를 접어도 작품 입력 초안과 기존 결과를 보존한다", () => {
    page();
    const details = screen.getByTestId("search-other-types-details") as HTMLDetailsElement;
    const field = screen.getByRole("searchbox") as HTMLInputElement;
    const summary = details.querySelector("summary") as HTMLElement;
    expect(details.open).toBe(false);
    expect(screen.getByTestId("unified-search").closest("details")).toBe(details);
    fireEvent.change(field, { target: { value: "작성 중인 검색" } });
    for (let index = 0; index < 3; index += 1) {
      fireEvent.click(summary);
      expect(details.open).toBe(true);
      fireEvent.click(summary);
      expect(details.open).toBe(false);
    }
    expect(field.value).toBe("작성 중인 검색");
    expect(child.mounts).toHaveBeenCalledTimes(1);
  });

  it("빈 검색어에서도 네 가지 목적지를 제공하고 빈 결과 접기는 만들지 않는다", () => {
    page("/search");
    expect(within(screen.getByRole("navigation", { name: "유형별 검색 바로가기" })).getAllByRole("link")).toHaveLength(4);
    expect(screen.queryByTestId("search-other-types-details")).toBeNull();
  });

  it("query·무료 조건·플랫폼 전달과 통합검색 query를 바꾸지 않는다", () => {
    page("/search?q=첫째&pricing=free,wait-free&platforms=naver-webtoon,kakao-page");
    expect(child.props).toHaveBeenLastCalledWith({
      fullWidthQuery: true,
      initialQuery: "첫째",
      initialFree: true,
      initialPlatforms: ["naver-webtoon", "kakao-page"],
    });
    expect(screen.getByTestId("unified-search").getAttribute("data-query")).toBe("첫째");
    fireEvent.click(screen.getByRole("button", { name: "다른 검색" }));
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("둘째");
    expect(screen.getByTestId("unified-search").getAttribute("data-query")).toBe("둘째");
    expect(child.mounts).toHaveBeenCalledTimes(1);
  });

  it("안내를 반복해서 열고 닫아도 입력 초안과 탐색기 인스턴스를 유지한다", () => {
    page();
    const field = screen.getByRole("searchbox") as HTMLInputElement;
    const tools = screen.getByTestId("search-page-tools") as HTMLDetailsElement;
    const summary = tools.querySelector("summary");
    expect(summary).not.toBeNull();
    fireEvent.change(field, { target: { value: "작성 중인 검색어" } });
    for (let index = 0; index < 3; index += 1) {
      fireEvent.click(summary as HTMLElement);
      expect(tools.open).toBe(true);
      fireEvent.click(summary as HTMLElement);
      expect(tools.open).toBe(false);
    }
    expect(screen.getByRole("searchbox")).toBe(field);
    expect(field.value).toBe("작성 중인 검색어");
    expect(child.mounts).toHaveBeenCalledTimes(1);
  });

  it("모드 링크가 기존 공유 URL 변환 계약을 유지한다", () => {
    page("/search?q=달&genres=판타지&status=completed&pricing=free&sort=rating&view=list&savedOnly=true");
    const nav = screen.getByRole("navigation", { name: "검색 방식" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0].getAttribute("aria-current")).toBe("page");
    const urls = links.map((link) => new URL(link.getAttribute("href") ?? "", "https://example.test"));
    expect(urls.map((url) => url.pathname)).toEqual(["/search", "/explore", "/recommend"]);
    for (const url of urls) {
      expect(url.searchParams.get("genres")).toBe("판타지");
      expect(url.searchParams.get("status")).toBe("completed");
      expect(url.searchParams.get("pricing")).toBe("free");
      expect(url.searchParams.get("savedOnly")).toBe("true");
    }
    expect(urls[0].searchParams.get("q")).toBe("달");
    expect(urls[0].searchParams.get("view")).toBe("list");
    expect(urls[1].searchParams.has("q")).toBe(false);
    expect(urls[1].searchParams.has("view")).toBe(false);
    expect(urls[1].searchParams.get("sort")).toBe("rating");
    expect(urls[2].searchParams.has("q")).toBe(false);
    expect(urls[2].searchParams.has("sort")).toBe(false);
  });

  it("보조 목적지와 추천 검색을 삭제하지 않고 원래 아트만 재사용한다", () => {
    page();
    const tools = screen.getByTestId("search-page-tools");
    const hrefs = Array.from(tools.querySelectorAll("a")).map((link) => link.getAttribute("href"));
    for (const href of ["/discover", "/cuts", "/character-chat", "/studio", "/market", "/ranking", "/search?q=로맨스판타지", "/search?q=회귀", "/search?q=일상", "/search?q=액션", "/search?q=스릴러", "/search?pricing=free"]) {
      expect(hrefs).toContain(href);
    }
    expect(tools.querySelector("img")?.getAttribute("src")).toBe("/brand/illustrated-20260928/blank-canvas.webp");
    expect(tools.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(tools.querySelector("img")?.getAttribute("aria-hidden")).toBe("true");
    expect(tools.querySelector('[aria-label="문맥 안내"]')).not.toBeNull();
  });

  it("native anchor와 초점 가능한 검색 목적지를 유지한다", () => {
    page();
    expect(screen.getByRole("link", { name: "search.filterButton" }).getAttribute("href")).toBe("#toonstudio-search-explorer-top");
    const destination = document.getElementById("toonstudio-search-explorer-top");
    expect(destination?.getAttribute("tabindex")).toBe("-1");
    expect(destination?.closest("details")).toBeNull();
  });

  it("검색 전용 CSS에 44px 목표와 반응형 최소 폭을 두고 동작 애니메이션을 추가하지 않는다", () => {
    const css = readFileSync(resolve(import.meta.dirname, "search-page-layout.css"), "utf8");
    expect(css).toContain("min-height: 2.75rem");
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(css).toContain("grid-template-columns: 16rem minmax(0, 1fr)");
    expect(css).toContain(":focus-visible");
    expect(css).not.toMatch(/(?:^|[;{])\s*(?:animation|transition)\s*:/);
  });
});
