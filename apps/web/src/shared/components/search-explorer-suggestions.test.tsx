// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchExplorer } from "./search-explorer";
import { SearchEmptyQuerySuggestionsPanel } from "./search-explorer-suggestions-panel";

// useT 목: 템플릿 키 2종은 실제 문구 형태로 돌려 패널의 {query}/{genre} 치환까지 고정한다.
const t = (key: string) =>
  key === "search.explorer.suggestions.searchFor"
    ? "{query} 검색"
    : key === "search.explorer.suggestions.genreFilter"
      ? "장르 {genre}로 좁히기"
      : key;

vi.mock("@/shared/lib/i18n", () => ({
  useT: () => t,
}));

vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      recentSearches: [],
      addRecentSearch: vi.fn(),
      removeRecentSearch: vi.fn(),
      clearRecentSearches: vi.fn(),
    }),
  useSavedTitleIds: () => new Set<string>(),
}));

const paginated = vi.hoisted(() => ({
  topTags: ["회귀", "사이다", "먼치킨"],
  failed: false,
  loading: false,
}));

vi.mock("@/platform/use-paginated-search", () => ({
  usePaginatedSearch: () => ({
    items: [],
    total: 0,
    data: {
      typeCount: { webtoon: 0, webnovel: 0 },
      topTags: paginated.topTags,
      catalog: null,
    },
    loading: paginated.loading,
    loadingMore: false,
    failed: paginated.failed,
    moreFailed: false,
    hasMore: false,
    loadMore: vi.fn(),
  }),
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <output aria-label="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderExplorer(entry = "/search") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <SearchExplorer />
      <LocationProbe />
    </MemoryRouter>,
  );
}

afterEach(() => {
  document.body.style.overflow = "";
  paginated.topTags = ["회귀", "사이다", "먼치킨"];
  paginated.failed = false;
  paginated.loading = false;
  vi.restoreAllMocks();
});

describe("SearchExplorer 빈 쿼리 추천", () => {
  it("빈 쿼리에서 인기 검색어 칩과 장르 추천 태그를 표시한다", () => {
    renderExplorer();
    expect(screen.getByText("search.explorer.suggestions.popular")).not.toBeNull();
    expect(screen.getByText("search.explorer.suggestions.genres")).not.toBeNull();
    // 인기 칩은 서버 topTags에서 오고 순위 번호를 단다.
    expect(screen.getByRole("button", { name: "회귀 검색" }).textContent).toContain("1");
    expect(screen.getByRole("button", { name: "사이다 검색" })).not.toBeNull();
    // 장르 추천 태그는 taxonomy GENRES를 보여준다.
    expect(screen.getByRole("button", { name: "장르 로맨스로 좁히기" })).not.toBeNull();
  });

  it("인기 칩 클릭 시 그 검색어가 URL 쿼리로 실제 검색 실행된다", async () => {
    renderExplorer();
    fireEvent.click(screen.getByRole("button", { name: "회귀 검색" }));
    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toContain(
        `q=${encodeURIComponent("회귀")}`,
      );
    });
    // 검색어가 생기면 추천 패널은 사라진다(빈 쿼리 전용 표면).
    await waitFor(() => {
      expect(screen.queryByText("search.explorer.suggestions.popular")).toBeNull();
    });
  });

  it("장르 태그 클릭 시 장르 필터가 URL에 기록되어 결과를 좁힌다", async () => {
    renderExplorer();
    fireEvent.click(screen.getByRole("button", { name: "장르 로맨스로 좁히기" }));
    await waitFor(() => {
      expect(screen.getByLabelText("location").textContent).toContain(
        `genres=${encodeURIComponent("로맨스")}`,
      );
    });
  });

  it("쿼리가 있는 상태에서는 추천 패널을 표시하지 않는다", () => {
    renderExplorer(`/search?q=${encodeURIComponent("회귀")}`);
    expect(screen.queryByText("search.explorer.suggestions.popular")).toBeNull();
    expect(screen.queryByRole("button", { name: "사이다 검색" })).toBeNull();
  });

  it("검색 실패 시 추천 패널에 에러와 재시도를 표시한다", () => {
    paginated.failed = true;
    renderExplorer();
    expect(screen.getByText("search.explorer.suggestions.error")).not.toBeNull();
    expect(screen.getByRole("button", { name: "search.explorer.retry" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "회귀 검색" })).toBeNull();
  });
});

describe("SearchEmptyQuerySuggestionsPanel 상태", () => {
  const suggestions = { popularTerms: ["회귀"], genreTags: ["로맨스"] };

  it("로딩 상태에서는 칩 대신 스켈레톤을 보여준다", () => {
    render(
      <SearchEmptyQuerySuggestionsPanel
        t={t}
        state="loading"
        suggestions={suggestions}
        onPickTerm={vi.fn()}
        onPickGenre={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("search.explorer.suggestions.loading")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "회귀 검색" })).toBeNull();
  });

  it("에러 상태의 재시도 버튼이 onRetry를 1회 호출한다", () => {
    const onRetry = vi.fn();
    render(
      <SearchEmptyQuerySuggestionsPanel
        t={t}
        state="error"
        suggestions={suggestions}
        onPickTerm={vi.fn()}
        onPickGenre={vi.fn()}
        onRetry={onRetry}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "search.explorer.retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("추천이 비면 빈 상태 문구를 보여준다", () => {
    render(
      <SearchEmptyQuerySuggestionsPanel
        t={t}
        state="ready"
        suggestions={{ popularTerms: [], genreTags: [] }}
        onPickTerm={vi.fn()}
        onPickGenre={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("search.explorer.suggestions.empty")).not.toBeNull();
  });

  it("칩 클릭이 선택한 값을 그대로 콜백에 전달한다", () => {
    const onPickTerm = vi.fn();
    const onPickGenre = vi.fn();
    render(
      <SearchEmptyQuerySuggestionsPanel
        t={t}
        state="ready"
        suggestions={suggestions}
        onPickTerm={onPickTerm}
        onPickGenre={onPickGenre}
        onRetry={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "회귀 검색" }));
    fireEvent.click(screen.getByRole("button", { name: "장르 로맨스로 좁히기" }));
    expect(onPickTerm).toHaveBeenCalledWith("회귀");
    expect(onPickGenre).toHaveBeenCalledWith("로맨스");
  });
});
