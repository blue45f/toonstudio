// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchExplorer } from "./search-explorer";
import type { SearchResponse } from "@/platform/search-client";
import type { Title } from "@/shared/lib/types";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn<(query: URLSearchParams, signal: AbortSignal) => Promise<SearchResponse>>(),
  saved: new Set<string>(),
  recentSearches: [] as string[],
  addRecentSearch: vi.fn(), removeRecentSearch: vi.fn(), clearRecentSearches: vi.fn(),
}));

// 검색기·실제 페이지 훅·요약은 실행하고 원격 전송과 결과 카드 내부만 격리한다.
vi.mock("@/platform/search-client", () => ({
  fetchSearchResponse: mocks.fetch,
  isSearchAbortError: (error: unknown) => error instanceof Error && error.name === "AbortError",
}));
vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: typeof mocks) => unknown) => selector(mocks),
  useSavedTitleIds: () => mocks.saved,
}));
vi.mock("@/shared/lib/i18n", async () => {
  const { default: dictionaries } = await import("@/shared/i18n/generated/i18n-search-builtins.json");
  const ko: Record<string, string> = { ...dictionaries.ko, "common.retry.short": "재시도" };
  return {
    useT: () => (key: string) => ko[key] ?? key,
    registerI18nLocaleEntries: () => undefined,
    registerI18nEnglishSourceEntries: () => undefined,
  };
});
vi.mock("./title-card", () => ({
  TitleCard: ({ title }: { title: Title }) => <article aria-label={title.title}>{title.title}</article>,
  TitleRow: ({ title }: { title: Title }) => <article aria-label={title.title}>{title.title}</article>,
}));

function response(page = 1, total = 0): SearchResponse {
  const start = (page - 1) * 24;
  const items: Title[] = Array.from({ length: Math.min(24, Math.max(0, total - start)) }, (_, index) => ({
    id: `fixture-${start + index}`, slug: `fixture-${start + index}`, title: `검증 작품 ${start + index}`,
    type: "webtoon", author: "검증 작가", artist: "검증 작가", genres: ["판타지"], tags: [],
    synopsis: "테스트 전용 작품", cover: ["#000000", "#ffffff"], status: "ongoing",
    ageRating: "all", releaseYear: 2026,
    availability: [{ platformId: "naver-webtoon", pricing: "free" }],
    stats: { views: 1, likes: 0, bookmarks: 0, ratingAvg: 4, ratingCount: 1,
      ratingDist: [0, 0, 0, 1, 0], rankDelta: 0, trendingScore: 1, completionRate: 50, bingeIndex: 50 },
  }));
  const hasMore = page * 24 < total;
  return { items, typeCount: { webtoon: total, webnovel: 0 }, topTags: [],
    pagination: { page, pageSize: 24, total, hasMore, nextPage: hasMore ? page + 1 : null } };
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname}{location.search}</output>;
}
function renderExplorer(entry = "/search?q=검증") {
  return render(<MemoryRouter initialEntries={[entry]}><SearchExplorer /><LocationProbe /></MemoryRouter>);
}
function summary() { return screen.getByRole("status", { name: "" }); }
function expectUnknownCount() {
  expect(summary().textContent).not.toContain("결과가 없어요");
  expect(summary().textContent).not.toContain("유형 없음");
}
beforeEach(() => { mocks.fetch.mockReset(); });
afterEach(() => { cleanup(); document.body.style.overflow = ""; });

describe("검색 응답과 요약의 일치", () => {
  it("로딩은 응답 없는 0건과 유형 없음으로 읽히지 않는다", () => {
    mocks.fetch.mockImplementation(() => new Promise<SearchResponse>(() => undefined));
    renderExplorer();
    expect(summary().getAttribute("data-search-result-state")).toBe("loading");
    expectUnknownCount();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each(["HTTP 503", "HTTP 404", "오프라인"])("%s 전송 실패는 결과 없음이 아니라 오류로 표시한다", async (failure) => {
    mocks.fetch.mockRejectedValue(new Error(failure));
    renderExplorer();
    await waitFor(() => expect(summary().getAttribute("data-search-result-state")).toBe("error"));
    expectUnknownCount();
    expect(summary().textContent).toContain("검색 데이터를 불러오지 못했어요");
    expect(within(screen.getByRole("alert")).getByRole("button", { name: "재시도" })).not.toBeNull();
    expect(screen.queryByText("조건에 맞는 작품이 없어요.")).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("사용자가 재시도한 뒤 성공한 빈 응답만 0건으로 확정하고 URL을 유지한다", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("HTTP 503")).mockResolvedValueOnce(response());
    renderExplorer("/search?q=검증&types=webtoon");
    await waitFor(() => expect(summary().getAttribute("data-search-result-state")).toBe("error"));
    const location = screen.getByLabelText("location").textContent;
    fireEvent.click(within(screen.getByRole("alert")).getByRole("button", { name: "재시도" }));
    await waitFor(() => expect(summary().getAttribute("data-search-result-state")).toBe("notfound"));
    expect(summary().textContent).toContain("결과가 없어요");
    expect(summary().textContent).toContain("유형 없음");
    expect(screen.getByText("조건에 맞는 작품이 없어요.")).not.toBeNull();
    expect(screen.getByLabelText("location").textContent).toBe(location);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[1]?.[0].get("q")).toBe("검증");
    expect(mocks.fetch.mock.calls[1]?.[0].get("types")).toBe("webtoon");
  });

  it("검색어·필터가 없는 성공 0건은 empty로 구분한다", async () => {
    mocks.fetch.mockResolvedValue(response());
    renderExplorer("/search");
    await waitFor(() => expect(summary().getAttribute("data-search-result-state")).toBe("empty"));
    expect(summary().textContent).toContain("결과가 없어요");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each(["/search?types=webtoon", "/search?savedOnly=true"])("조건만 있는 성공 0건(%s)은 notfound로 구분한다", async (entry) => {
    mocks.fetch.mockResolvedValue(response());
    renderExplorer(entry);
    await waitFor(() => expect(summary().getAttribute("data-search-result-state")).toBe("notfound"));
    expect(summary().textContent).toContain("결과가 없어요");
  });

  it("성공 응답은 실제 수와 유형 및 결과 카드를 유지한다", async () => {
    mocks.fetch.mockResolvedValue(response(1, 2));
    renderExplorer();
    await waitFor(() => expect(summary().getAttribute("data-search-result-state")).toBe("success"));
    expectUnknownCount();
    expect(summary().textContent).toContain("2");
    expect(summary().textContent).toContain("웹툰 2");
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("더 보기 실패·재시도 동안 이미 받은 카드와 집계를 유지한다", async () => {
    mocks.fetch.mockResolvedValueOnce(response(1, 26)).mockRejectedValueOnce(new Error("HTTP 503"))
      .mockResolvedValueOnce(response(2, 26));
    renderExplorer();
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(24));
    const beforeText = summary().textContent;
    const firstCard = screen.getByRole("article", { name: "검증 작품 0" });
    fireEvent.click(screen.getByRole("button", { name: /더 보기/ }));
    await waitFor(() => expect(summary().getAttribute("data-search-result-state")).toBe("moreError"));
    expect(summary().textContent).toBe(beforeText);
    expect(screen.getAllByRole("article")).toHaveLength(24);
    expect(screen.getByRole("article", { name: "검증 작품 0" })).toBe(firstCard);
    expect(screen.getByRole("alert")).not.toBeNull();
    expectUnknownCount();
    fireEvent.click(screen.getByRole("button", { name: /다시 시도/ }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(26));
    expect(screen.getByRole("article", { name: "검증 작품 0" })).toBe(firstCard);
    expect(summary().getAttribute("data-search-result-state")).toBe("success");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mocks.fetch.mock.calls.map(([params]) => params.get("page"))).toEqual(["1", "2", "2"]);
  });
});
