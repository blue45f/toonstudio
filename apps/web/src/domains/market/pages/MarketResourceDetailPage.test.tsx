// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMarketResourceDetail } from "../hooks/use-market-resource-detail";
import { useMarketResources } from "../hooks/use-market-resources";

import { MarketResourceDetailPage } from "./MarketResourceDetailPage";

vi.mock("../hooks/use-market-resource-detail", () => ({
  useMarketResourceDetail: vi.fn(),
}));

vi.mock("../hooks/use-market-resources", () => ({
  useMarketResources: vi.fn(),
}));

vi.mock("../components/MarketResourceDetailArticle", () => ({
  MarketResourceDetailArticle: () => <article>상세 본문</article>,
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
  useJsonLd: vi.fn(),
  useMetaDescription: vi.fn(),
  usePageSocialMeta: vi.fn(),
}));

const useDetail = vi.mocked(useMarketResourceDetail);
const useResources = vi.mocked(useMarketResources);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MarketResourceDetailPage", () => {
  it("announces detail skeleton loading and hides its decorative placeholders", () => {
    useDetail.mockReturnValue({
      record: null,
      loading: true,
      notFound: false,
      error: null,
      staleSavedAt: null,
      reload: vi.fn(),
    });
    useResources.mockReturnValue({
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
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/market/resource/test-id"]}>
        <Routes>
          <Route path="/market/resource/:id" element={<MarketResourceDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole("status").textContent).toContain("상세 정보를 불러오는 중");
    expect(container.querySelector("[aria-hidden='true'] .skeleton")).toBeTruthy();
  });

  it("shows a dedicated not-found state for a missing resource id (F-B09-3)", () => {
    useDetail.mockReturnValue({
      record: null,
      loading: false,
      notFound: true,
      error: null,
      staleSavedAt: null,
      reload: vi.fn(),
    });
    useResources.mockReturnValue({
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
    });

    render(
      <MemoryRouter initialEntries={["/market/resource/missing-id"]}>
        <Routes>
          <Route path="/market/resource/:id" element={<MarketResourceDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("리소스를 찾을 수 없어요")).toBeTruthy();
    expect(screen.getByRole("link", { name: "다른 리소스 찾아보기" }).getAttribute("href"))
      .toBe("/market/browse");
    // 없는 id는 재시도로 해결되지 않으므로 재시도 버튼을 내놓지 않는다.
    expect(screen.queryByRole("button", { name: "재시도" })).toBeNull();
  });

  it("keeps the retryable error state for non-404 load failures (F-B09-3)", () => {
    useDetail.mockReturnValue({
      record: null,
      loading: false,
      notFound: false,
      error: "일시적인 오류",
      staleSavedAt: null,
      reload: vi.fn(),
    });
    useResources.mockReturnValue({
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
    });

    render(
      <MemoryRouter initialEntries={["/market/resource/some-id"]}>
        <Routes>
          <Route path="/market/resource/:id" element={<MarketResourceDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("지금은 리소스 정보를 불러올 수 없어요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "재시도" })).toBeTruthy();
    expect(screen.queryByText("리소스를 찾을 수 없어요")).toBeNull();
  });
});
