// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchPage } from "@/domains/catalog/SearchPage";

vi.mock("@/shared/components/unified-search-sections", () => ({ UnifiedSearchSections: () => null }));
vi.mock("@/shared/components/site-contextual-subnav", () => ({ SiteContextualSubNav: () => null }));
vi.mock("@/domains/legal/public/site-page-header", () => ({ SitePageHeader: () => null }));
vi.mock("@/shared/lib/i18n", () => ({
  useT: () => (key: string) => key,
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "en" }),
  // search-explorer가 side-effect로 평가하는 search-i18n.ts가 모듈 스코프에서 호출한다.
  registerI18nLocaleEntries: (_locale: string, _entries: Readonly<Record<string, string>>) => undefined,
  registerI18nEnglishSourceEntries: (_entries: Readonly<Record<string, string>>) => undefined,
}));

vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: Record<string, unknown>) => unknown) => selector({
    recentSearches: [],
    addRecentSearch: vi.fn(),
    removeRecentSearch: vi.fn(),
    clearRecentSearches: vi.fn(),
  }),
  useSavedTitleIds: () => new Set<string>(),
}));

vi.mock("@/platform/use-paginated-search", () => ({
  usePaginatedSearch: () => ({
    items: [],
    total: 0,
    data: { typeCount: { webtoon: 0, webnovel: 0 }, topTags: [], catalog: null },
    loading: false,
    loadingMore: false,
    failed: false,
    moreFailed: false,
    hasMore: false,
    loadMore: vi.fn(),
  }),
}));

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname}{location.search}</output>;
}

function NavigationControls() {
  const navigate = useNavigate();
  return <>
    <button onClick={() => { void navigate("/search?q=external"); }}>External query</button>
    <button onClick={() => { void navigate(-1); }}>Back</button>
  </>;
}

afterEach(() => {
  document.body.style.overflow = "";
  vi.restoreAllMocks();
});

describe("검색 URL 갱신과 필터 수명", () => {
  it("검색 입력 직후 연 모바일 필터가 debounce URL 갱신 후에도 열린 상태다", async () => {
    render(<MemoryRouter initialEntries={["/search?q=first"]}><SearchPage /><LocationProbe /></MemoryRouter>);
    const field = document.querySelector<HTMLInputElement>("#search-explorer-query");
    expect(field).not.toBeNull();
    fireEvent.change(field as HTMLInputElement, { target: { value: "second" } });
    fireEvent.click(screen.getByRole("button", { name: "search.explorer.filter" }));
    expect(screen.getByRole("dialog", { name: "search.explorer.filter" })).not.toBeNull();
    await waitFor(() => expect(screen.getByLabelText("location").textContent).toContain("q=second"));
    expect(screen.getByRole("dialog", { name: "search.explorer.filter" })).not.toBeNull();
  });
  it("외부 검색과 Back이 낡은 debounce로 되돌려지지 않고 입력·필터 상태를 보존한다", async () => {
    render(<MemoryRouter initialEntries={["/search?q=first"]}><NavigationControls /><SearchPage /><LocationProbe /></MemoryRouter>);
    const field = document.querySelector<HTMLInputElement>("#search-explorer-query") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "pending draft" } });
    fireEvent.click(screen.getByRole("button", { name: "search.explorer.filter" }));
    fireEvent.click(screen.getByRole("button", { name: "External query" }));
    expect(field.value).toBe("external");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 250)); });
    expect(screen.getByLabelText("location").textContent).toContain("q=external");
    expect(screen.getByRole("dialog", { name: "search.explorer.filter" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(field.value).toBe("first");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 250)); });
    expect(screen.getByLabelText("location").textContent).toContain("q=first");
    expect(field.value).toBe("first");
    fireEvent.change(field, { target: { value: "third" } });
    await waitFor(() => expect(screen.getByLabelText("location").textContent).toContain("q=third"));
    expect(document.querySelector("#search-explorer-query")).toBe(field);
    expect(screen.getByRole("dialog", { name: "search.explorer.filter" })).not.toBeNull();
  });

});
