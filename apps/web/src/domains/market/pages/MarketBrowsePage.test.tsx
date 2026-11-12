// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMarketResources } from "../hooks/use-market-resources";

import { MarketBrowsePage } from "./MarketBrowsePage";

import type { MarketResourcesPage } from "../hooks/use-market-resources";

import { CREATOR_MARKETPLACE_RESOURCE_QUERY_SEARCH_MAX_CHARACTERS } from "@/shared/lib/creator-marketplace-resource-contract";

vi.mock("../hooks/use-market-resources", () => ({
  useMarketResources: vi.fn(),
}));

vi.mock("../components/MarketResourceCard", () => ({
  MarketResourceCard: ({ record }: { record: { id: string } }) => (
    <div data-testid={`resource-${record.id}`} />
  ),
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
  useJsonLd: vi.fn(),
  useMetaDescription: vi.fn(),
  usePageSocialMeta: vi.fn(),
}));

const useResources = vi.mocked(useMarketResources);

function marketPage(overrides: Partial<MarketResourcesPage> = {}): MarketResourcesPage {
  return {
    items: [],
    loading: false,
    loadingMore: false,
    error: null,
    loadMoreError: null,
    hasMore: false,
    stale: false,
    staleSavedAt: null,
    loadMore: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="현재 검색 쿼리">{location.search}</output>;
}

function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>뒤로</button>;
}

function openFilters() {
  const trigger = screen.getByRole("button", { name: /^필터(?:\s*\d+)?$/u });
  if (trigger.getAttribute("aria-expanded") !== "true") fireEvent.click(trigger);
  return trigger;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

beforeEach(() => {
  useResources.mockReturnValue(marketPage());
});

describe("MarketBrowsePage", () => {
  it("clears relevance and pending input from the no-results reset action", () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={["/market/browse?q=missing&sort=relevance&kind=brush"]}>
        <MarketBrowsePage />
        <LocationProbe />
      </MemoryRouter>
    );
    const search = screen.getByRole("searchbox", { name: "어떤 소재가 필요한가요?" }) as HTMLInputElement;
    fireEvent.change(search, { target: { value: "pending" } });
    fireEvent.click(screen.getByRole("button", { name: "검색어 초기화" }));
    act(() => vi.advanceTimersByTime(350));
    expect(search.value).toBe("");
    expect(screen.getByLabelText("현재 검색 쿼리").textContent).toBe("?kind=brush");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(useResources).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: "brush", sort: "newest", search: undefined,
    }));
  });

  it("atomically clears the draft and URL without a pending debounce restoring filters", () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={["/market/browse?q=seed&kind=brush"]}>
        <MarketBrowsePage />
        <LocationProbe />
      </MemoryRouter>
    );

    const search = screen.getByRole("searchbox", {
      name: "어떤 소재가 필요한가요?",
    }) as HTMLInputElement;
    fireEvent.change(search, { target: { value: "pending" } });
    fireEvent.click(screen.getByRole("button", { name: "조건 초기화" }));

    act(() => vi.advanceTimersByTime(350));
    expect(search.value).toBe("");
    expect(screen.getByLabelText("현재 검색 쿼리").textContent).toBe("");
  });

  it("syncs the draft from browser history and cancels the obsolete draft commit", () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter
        initialEntries={["/market/browse?q=alpha", "/market/browse?q=alpha&kind=brush"]}
        initialIndex={1}
      >
        <MarketBrowsePage />
        <BackButton />
        <LocationProbe />
      </MemoryRouter>
    );

    const search = screen.getByRole("searchbox", {
      name: "어떤 소재가 필요한가요?",
    }) as HTMLInputElement;
    expect(search.value).toBe("alpha");
    fireEvent.change(search, { target: { value: "obsolete draft" } });
    fireEvent.click(screen.getByRole("button", { name: "뒤로" }));

    act(() => vi.advanceTimersByTime(350));
    expect(search.value).toBe("alpha");
    expect(screen.getByLabelText("현재 검색 쿼리").textContent).toBe("?q=alpha");
  });

  it("keeps baseline controls reachable and hides the native cancel button", () => {
    render(
      <MemoryRouter initialEntries={["/market/browse?q=ink&kind=brush&license=cc0-1.0"]}>
        <MarketBrowsePage />
        <LocationProbe />
      </MemoryRouter>
    );

    const search = screen.getByRole("searchbox", { name: "어떤 소재가 필요한가요?" });
    expect(search.getAttribute("maxlength")).toBe(String(
      CREATOR_MARKETPLACE_RESOURCE_QUERY_SEARCH_MAX_CHARACTERS
    ));
    expect(search.className).toContain("h-12");
    expect(search.className).toContain("[&::-webkit-search-cancel-button]:hidden");

    expect(screen.getByRole("button", { name: "검색어 지우기" }).className)
      .toContain("size-12");
    const kind = screen.getByRole<HTMLSelectElement>("combobox", { name: "소재 종류 필터" });
    expect(kind.value).toBe("brush");
    // 소스 최소 크기 계약이다. 실제48px·가림·모바일 조작은 새 번들 브라우저에서 별도 검증한다.
    expect(kind.className).toContain("min-h-12");
    expect(kind.closest("[data-market-filter-panel]")).toBeNull();
    openFilters();
    const brushFamily = screen.getByRole("button", { name: "브러시" });
    expect(brushFamily.className).toContain("min-h-11");
    expect(brushFamily.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "브러시 필터 제거" })).toBeNull();
    expect(screen.getByRole("button", { name: "검색: “ink” 필터 제거" }).className)
      .toContain("min-h-12");
    expect(screen.getByRole("button", { name: "CC0 1.0 필터 제거" }).className)
      .toContain("min-h-12");
    expect(screen.getByRole("button", { name: "조건 초기화" }).className)
      .toContain("min-h-12");
    expect(screen.getByText(/현재/).closest("p")?.textContent).toContain("현재 0개 표시");
    // 이름 있는 필터에서 이전 작업군 버튼에 도달하고, 선택 효과도 원래 URL 계약으로 이어진다.
    fireEvent.click(screen.getByRole("button", { name: "3D" }));
    expect(Object.fromEntries(new URLSearchParams(screen.getByLabelText("현재 검색 쿼리").textContent ?? "")))
      .toEqual({ q: "ink", kind: "3d-asset", license: "cc0-1.0" });
    expect(kind.value).toBe("3d");
    expect(brushFamily.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(brushFamily);
    expect(Object.fromEntries(new URLSearchParams(screen.getByLabelText("현재 검색 쿼리").textContent ?? "")))
      .toEqual({ q: "ink", kind: "brush", license: "cc0-1.0" });
    expect(kind.value).toBe("brush");
    expect(brushFamily.getAttribute("aria-pressed")).toBe("true");
  });

  it("merges an immediate submitted search and sort change without dropping the selected kind", () => {
    render(
      <MemoryRouter initialEntries={["/market/browse?kind=brush"]}>
        <MarketBrowsePage />
        <LocationProbe />
      </MemoryRouter>
    );

    const search = screen.getByRole("searchbox", {
      name: "어떤 소재가 필요한가요?",
    }) as HTMLInputElement;
    const form = search.closest("form");
    expect(form).not.toBeNull();

    fireEvent.change(search, { target: { value: "잉크" } });
    act(() => {
      fireEvent.submit(form!);
      fireEvent.change(screen.getByRole("combobox", { name: "정렬 기준" }), {
        target: { value: "newest" },
      });
    });

    const params = new URLSearchParams(
      screen.getByLabelText("현재 검색 쿼리").textContent ?? "",
    );
    expect(Object.fromEntries(params)).toEqual({
      kind: "brush",
      q: "잉크",
      sort: "newest",
    });
    expect(useResources).toHaveBeenLastCalledWith(expect.objectContaining({
      kind: "brush",
      search: "잉크",
      sort: "newest",
    }));
  });

  it("uses relevance for search by default and keeps an explicit newest choice in the URL", () => {
    render(
      <MemoryRouter initialEntries={["/market/browse?q=ink"]}>
        <MarketBrowsePage />
        <LocationProbe />
      </MemoryRouter>
    );

    const sort = screen.getByRole("combobox", { name: "정렬 기준" }) as HTMLSelectElement;
    expect(sort.value).toBe("relevance");
    expect(useResources).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "ink", sort: "relevance" })
    );

    fireEvent.change(sort, { target: { value: "newest" } });

    expect(screen.getByLabelText("현재 검색 쿼리").textContent).toContain("sort=newest");
    expect(useResources).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "ink", sort: "newest" })
    );
  });

  it("pauses a relevance URL without a search term until the invalid condition is removed", () => {
    render(
      <MemoryRouter initialEntries={["/market/browse?sort=relevance"]}>
        <MarketBrowsePage />
      </MemoryRouter>
    );

    expect(useResources).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("alert").textContent).toContain(
      "관련도순 정렬에는 올바른 검색어가 필요"
    );
  });

  it("uses a human-readable fallback instead of exposing a publisher UUID", () => {
    const publisherId = ["123e4567", "e89b", "42d3", "a456", "426614174210"].join("-");
    render(
      <MemoryRouter initialEntries={[`/market/browse?publisher=${publisherId}`]}>
        <MarketBrowsePage />
      </MemoryRouter>
    );

    const publisherFilter = screen.getByRole("button", {
      name: "배급자: 선택한 배급자 필터 제거",
    });
    expect(publisherFilter.textContent).toContain("선택한 배급자");
    expect(publisherFilter.textContent).not.toContain(publisherId);
  });

  it("pauses malformed publisher queries until the user removes them without auto-navigation", () => {
    render(
      <MemoryRouter initialEntries={["/market/browse?publisher=not-a-uuid"]}>
        <MarketBrowsePage />
        <LocationProbe />
      </MemoryRouter>
    );

    expect(useResources).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("alert").textContent).toContain("배급자 식별자 형식");
    expect(screen.getByLabelText("현재 검색 쿼리").textContent)
      .toBe("?publisher=not-a-uuid");
    expect(
      screen.queryByRole("button", { name: /배급자: .* 필터 제거/u })
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "잘못된 조건 제거" }));
    expect(screen.getByLabelText("현재 검색 쿼리").textContent).toBe("");
    expect(useResources).toHaveBeenLastCalledWith(
      expect.objectContaining({ publisher: undefined })
    );
  });

  it("does not silently truncate an overlong URL search into different results", () => {
    const overlong = "q".repeat(
      CREATOR_MARKETPLACE_RESOURCE_QUERY_SEARCH_MAX_CHARACTERS + 1
    );
    render(
      <MemoryRouter initialEntries={[`/market/browse?q=${overlong}`]}>
        <MarketBrowsePage />
      </MemoryRouter>
    );

    const search = screen.getByRole("searchbox", {
      name: "어떤 소재가 필요한가요?",
    }) as HTMLInputElement;
    expect(search.value).toBe(overlong);
    expect(search.getAttribute("aria-invalid")).toBe("true");
    expect(useResources).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("alert").textContent).toContain("자동으로 자르지 않았어요");
  });

  it("announces browse skeleton loading while keeping placeholders decorative", () => {
    useResources.mockReturnValue(marketPage({ loading: true }));

    const { container } = render(
      <MemoryRouter initialEntries={["/market/browse"]}>
        <MarketBrowsePage />
      </MemoryRouter>
    );

    expect(screen.getByRole("status").textContent).toContain("탐색 결과를 불러오는 중");
    expect(container.querySelector("ul[aria-busy='true']")).toBeTruthy();
    expect(container.querySelectorAll("li[aria-hidden='true']")).toHaveLength(12);
  });

  it("renders a visible load-more failure and retries from the same action", () => {
    const loadMore = vi.fn();
    useResources.mockReturnValue(marketPage({
      hasMore: true,
      loadMoreError: "추가 리소스를 불러오지 못했어요.",
      loadMore,
    }));

    render(
      <MemoryRouter initialEntries={["/market/browse"]}>
        <MarketBrowsePage />
      </MemoryRouter>
    );

    expect(screen.getByRole("alert").textContent).toContain("추가 리소스를 불러오지 못했어요.");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(loadMore).toHaveBeenCalledOnce();
  });
});

describe("market discovery experience", () => {
  it("waits for Korean composition to finish before committing a search", () => {
    vi.useFakeTimers();
    render(<MemoryRouter initialEntries={["/market/browse?q=seed&kind=brush"]}><MarketBrowsePage /><LocationProbe /></MemoryRouter>);
    const input = screen.getByRole("searchbox", { name: "어떤 소재가 필요한가요?" });
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "잉" } });
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByLabelText("현재 검색 쿼리").textContent).toBe("?q=seed&kind=brush");
    fireEvent.compositionEnd(input, { target: { value: "잉크" } });
    act(() => vi.advanceTimersByTime(350));
    expect(useResources).toHaveBeenLastCalledWith(expect.objectContaining({ search: "잉크", kind: "brush" }));
  });

  it("preserves search and kind when changing URL-backed layouts", () => {
    render(<MemoryRouter initialEntries={["/market/browse?q=ink&kind=brush"]}><MarketBrowsePage /><LocationProbe /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "목록 보기" }));
    const params = new URLSearchParams(screen.getByLabelText("현재 검색 쿼리").textContent ?? "");
    expect(Object.fromEntries(params)).toEqual({ q: "ink", kind: "brush", layout: "list" });
    expect(screen.getByRole("button", { name: "목록 보기" }).getAttribute("aria-pressed")).toBe("true");
    expect(useResources.mock.lastCall?.[0]).not.toHaveProperty("layout");
    fireEvent.click(screen.getByRole("button", { name: "카드 보기" }));
    expect(screen.getByLabelText("현재 검색 쿼리").textContent).not.toContain("layout");
  });

  it("removes the kind independently of search and license", () => {
    render(<MemoryRouter initialEntries={["/market/browse?q=ink&kind=brush&license=cc0-1.0"]}><MarketBrowsePage /><LocationProbe /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "종류: 브러시 필터 제거" }));
    const params = new URLSearchParams(screen.getByLabelText("현재 검색 쿼리").textContent ?? "");
    expect(Object.fromEntries(params)).toEqual({ q: "ink", license: "cc0-1.0" });
  });
});


it("빈 공개 마켓에서 가입 없는 기본 소재로 이동할 수 있다", () => {
  useResources.mockReturnValue(marketPage());
  render(<MemoryRouter><MarketBrowsePage /></MemoryRouter>);
  expect(screen.getByRole("link", { name: "기본 무료 소재 사용하기" }).getAttribute("href"))
    .toBe("/studio/assets?view=essentials");
});

it("마켓에 없는 무료 CC0 재료는 리서치 데스크의 3D 자료 검색으로 이어진다", () => {
  useResources.mockReturnValue(marketPage());
  render(<MemoryRouter><MarketBrowsePage /></MemoryRouter>);
  openFilters();
  fireEvent.click(screen.getByText("마켓 메뉴·제작 도구"));
  expect(screen.getByRole("link", { name: "무료 CC0 재료 찾기" }).getAttribute("href")).toBe("/research/3d-assets");
  expect(screen.getByLabelText("라이선스 필터")).toBeTruthy();
});

it("웹툰 제작 공정별 원클릭 프리셋 필터 바로 종류와 사용권 조건을 즉시 전환한다", () => {
  useResources.mockReturnValue(marketPage());
  render(
    <MemoryRouter initialEntries={["/market/browse"]}>
      <MarketBrowsePage />
      <LocationProbe />
    </MemoryRouter>,
  );

  openFilters();
  fireEvent.click(screen.getByText("자주 쓰는 조건으로 찾기"));
  const presetSection = screen.getByRole("region", { name: "웹툰 제작 공정별 원클릭 프리셋" });
  expect(presetSection).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "3D 배경·소품" }));
  expect(screen.getByLabelText("현재 검색 쿼리").textContent).toBe("?kind=3d-asset");

  fireEvent.click(screen.getByRole("button", { name: "무료/즉시 사용" }));
  expect(screen.getByLabelText("현재 검색 쿼리").textContent).toBe("?license=cc0-1.0");

  fireEvent.click(screen.getByRole("button", { name: "전체 공정" }));
  expect(screen.getByLabelText("현재 검색 쿼리").textContent).toBe("");
});

it("AI 미포함·상업 연재 허용·렌더러 서버 패싯과 필터 프리셋 저장을 URL 쿼리와 연동한다", () => {
  localStorage.clear();
  useResources.mockReturnValue(marketPage());
  render(
    <MemoryRouter initialEntries={["/market/browse"]}>
      <MarketBrowsePage />
      <LocationProbe />
    </MemoryRouter>,
  );

  openFilters();
  fireEvent.click(screen.getByText("상업 이용·호환 조건"));
  fireEvent.click(screen.getByRole("button", { name: "AI 미포함만" }));
  fireEvent.click(screen.getByRole("button", { name: "상업 연재 허용" }));
  fireEvent.click(screen.getByRole("button", { name: "Canvas 2D 호환" }));

  const params = new URLSearchParams(screen.getByLabelText("현재 검색 쿼리").textContent ?? "");
  expect(Object.fromEntries(params)).toEqual({
    containsAi: "false",
    commercial: "true",
    engine: "canvas2d",
  });
  expect(useResources).toHaveBeenLastCalledWith(
    expect.objectContaining({
      containsAi: false,
      commercial: true,
      engine: "canvas2d",
    }),
  );

  fireEvent.click(screen.getByRole("button", { name: "필터 프리셋 저장" }));
  fireEvent.click(screen.getByRole("button", { name: "조건 초기화" }));
  expect(screen.getByLabelText("현재 검색 쿼리").textContent).toBe("");

  fireEvent.click(screen.getByRole("button", { name: "No-AI · 상업허용 · canvas2d" }));
  const restored = new URLSearchParams(screen.getByLabelText("현재 검색 쿼리").textContent ?? "");
  expect(Object.fromEntries(restored)).toEqual({
    containsAi: "false",
    commercial: "true",
    engine: "canvas2d",
  });
  localStorage.clear();
});




describe("소재 찾기의 기본·보조 작업 구분", () => {
  it("검색·종류·선택 조건을 먼저 보여주고 필터에서 이용 조건을 다시 찾을 수 있다", () => {
    const { container } = render(<MemoryRouter initialEntries={["/market/browse?q=ink&kind=brush&license=cc0-1.0"]}><MarketBrowsePage /></MemoryRouter>);
    const search = screen.getByRole("searchbox", { name: "어떤 소재가 필요한가요?" });
    expect(search.closest("details")).toBeNull();
    expect(screen.getByLabelText("어떤 소재가 필요한가요?")).toBe(search);
    const kind = screen.getByRole<HTMLSelectElement>("combobox", { name: "소재 종류 필터" });
    expect(kind.closest("details")).toBeNull(); expect(kind.value).toBe("brush");
    expect(screen.queryByRole("combobox", { name: "라이선스 필터" })).toBeNull();
    const panel = container.querySelector<HTMLElement>("[data-market-filter-panel]");
    expect(panel?.hidden).toBe(true);
    expect(screen.getByLabelText("적용된 조건").closest("details")).toBeNull();
    const menus = container.querySelectorAll<HTMLDetailsElement>("[data-market-tools], [data-market-quick-filters], [data-market-advanced-filters], [data-market-subcategories]");
    expect(menus.length).toBeGreaterThanOrEqual(3);
    for (const menu of menus) expect(menu.open).toBe(false);
    const tools = container.querySelector("[data-market-tools]");
    expect(search.compareDocumentPosition(tools as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const trigger = openFilters();
    const license = screen.getByRole<HTMLSelectElement>("combobox", { name: "라이선스 필터" });
    expect(license.value).toBe("cc0-1.0");
    expect(panel?.hidden).toBe(false);
    license.focus(); fireEvent.keyDown(license, { key: "Escape" });
    expect(panel?.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByLabelText("적용된 조건").closest("[data-market-filter-panel]")).toBeNull();
    expect(container.querySelector('[data-contextual-subnav="market-hub"]')).toBeNull();
    expect(screen.queryByRole("img", { name: /브랜드/u })).toBeNull();
  });

  it("마켓 메뉴의 원래 목적지를 찾을 수 있고 Escape 후 현재 입력과 초점을 보존한다", () => {
    const { container } = render(<MemoryRouter initialEntries={["/market/browse?q=ink&kind=brush"]}><MarketBrowsePage /><LocationProbe /></MemoryRouter>);
    openFilters();
    const menu = container.querySelector<HTMLDetailsElement>("[data-market-tools]");
    const summary = menu?.querySelector("summary");
    if (!menu || !summary) throw new Error("마켓 메뉴가 필요합니다.");
    const before = screen.getByLabelText("현재 검색 쿼리").textContent;
    fireEvent.click(summary);
    const hrefs = new Set([...menu.querySelectorAll("a[href]")].map(link => link.getAttribute("href")));
    for (const href of ["/market", "/market/browse", "/market/library", "/market/wishlist", "/market/seller", "/market/orders", "/studio/assets", "/studio/brushes", "/research", "/learn/paths/visual-finish", "/research/3d-assets"]) expect(hrefs.has(href), href).toBe(true);
    const link = within(menu).getByRole("link", { name: "브러시 만들기" });
    link.focus(); fireEvent.keyDown(link, { key: "Escape" });
    expect(menu.open).toBe(false); expect(document.activeElement).toBe(summary);
    expect(screen.getByLabelText("현재 검색 쿼리").textContent).toBe(before);
    expect((screen.getByRole("searchbox", { name: "어떤 소재가 필요한가요?" }) as HTMLInputElement).value).toBe("ink");
  });

  it("고급 조건을 닫아도 선택한 상업 이용 조건과 제거 행동은 남는다", () => {
    const { container } = render(<MemoryRouter initialEntries={["/market/browse?commercial=true&kind=brush"]}><MarketBrowsePage /><LocationProbe /></MemoryRouter>);
    openFilters();
    const menu = container.querySelector<HTMLDetailsElement>("[data-market-advanced-filters]");
    const summary = menu?.querySelector("summary");
    if (!menu || !summary) throw new Error("상업 이용 조건이 필요합니다.");
    expect(menu.open).toBe(false);
    const applied = screen.getByLabelText("적용된 조건");
    expect(within(applied).getByRole("button", { name: /상업 연재 허용 필터 제거/u })).toBeTruthy();
    fireEvent.click(summary); fireEvent.click(summary);
    fireEvent.click(within(applied).getByRole("button", { name: /상업 연재 허용 필터 제거/u }));
    expect(new URLSearchParams(screen.getByLabelText("현재 검색 쿼리").textContent ?? "").get("commercial")).toBeNull();
    expect(menu.open).toBe(false);
  });
});


it("모바일 종류 선택은 검색·사용권을 보존하고 전체 소재로 돌아갈 수 있다", () => {
  render(<MemoryRouter initialEntries={["/market/browse?q=ink&kind=brush&license=cc0-1.0"]}><MarketBrowsePage /><LocationProbe /></MemoryRouter>);
  const kind = screen.getByRole<HTMLSelectElement>("combobox", { name: "소재 종류 필터" });
  fireEvent.change(kind, { target: { value: "3d" } });
  const selected = new URLSearchParams(screen.getByLabelText("현재 검색 쿼리").textContent ?? "");
  expect(selected.get("kind")).toBe("3d-asset"); expect(selected.get("q")).toBe("ink"); expect(selected.get("license")).toBe("cc0-1.0");
  fireEvent.change(kind, { target: { value: "all" } });
  const reset = new URLSearchParams(screen.getByLabelText("현재 검색 쿼리").textContent ?? "");
  expect(reset.get("kind")).toBeNull(); expect(reset.get("q")).toBe("ink"); expect(reset.get("license")).toBe("cc0-1.0");
});
