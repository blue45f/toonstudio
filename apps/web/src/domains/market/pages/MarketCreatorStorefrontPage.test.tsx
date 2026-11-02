// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketCreatorStorefrontPage } from "./MarketCreatorStorefrontPage";

import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-starter-catalog";

const OFFICIAL_ID = "00000000-0000-4000-8000-000000000001";

const resourceMocks = vi.hoisted(() => ({
  useMarketResources: vi.fn(),
}));

vi.mock("../hooks/use-market-resources", () => ({
  useMarketResources: resourceMocks.useMarketResources,
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
  useMetaDescription: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  resourceMocks.useMarketResources.mockReturnValue({
    items: CREATOR_MARKETPLACE_STARTER_RECORDS.filter(
      (record) => record.publisher.id === OFFICIAL_ID,
    ).slice(0, 3),
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
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("MarketCreatorStorefrontPage", () => {
  it("배급자 카탈로그를 서버 필터와 연동하고 팔로우 토글을 지원한다", () => {
    render(
      <MemoryRouter initialEntries={[`/market/creator/${OFFICIAL_ID}`]}>
        <Routes>
          <Route path="/market/creator/:publisherId" element={<MarketCreatorStorefrontPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "ToonStudio 공식" })).toBeTruthy();
    expect(screen.getByText("공식 스타터 배급자")).toBeTruthy();

    const followButton = screen.getByRole("button", { name: "배급자 팔로우" });
    expect(followButton.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(followButton);
    expect(screen.getByRole("button", { name: "팔로잉 중" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "AI 미포함만" }));
    expect(resourceMocks.useMarketResources).toHaveBeenLastCalledWith(
      expect.objectContaining({
        publisher: OFFICIAL_ID,
        containsAi: false,
      }),
    );
  });

  it("잘못된 UUID 형식이면 요청을 보내지 않고 안내 화면을 표시한다", () => {
    render(
      <MemoryRouter initialEntries={["/market/creator/not-a-valid-uuid"]}>
        <Routes>
          <Route path="/market/creator/:publisherId" element={<MarketCreatorStorefrontPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "올바르지 않은 배급자 주소입니다" })).toBeTruthy();
    expect(resourceMocks.useMarketResources).toHaveBeenCalledWith(null);
  });
});
