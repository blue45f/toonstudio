// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { useMarketResourceDetail } from "../hooks/use-market-resource-detail";
import { useMarketResources } from "../hooks/use-market-resources";

import { MarketResourceDetailPage } from "./MarketResourceDetailPage";

vi.mock("../hooks/use-market-resource-detail", () => ({
  useMarketResourceDetail: vi.fn(),
}));

vi.mock("../hooks/use-market-resources", () => ({
  useMarketResources: vi.fn(),
}));

vi.mock("../components/MarketNavHeader", () => ({
  MarketNavHeader: () => <nav aria-label="마켓 내비게이션" />,
}));

vi.mock("../components/MarketProductionFitWorkbench", () => ({
  MarketProductionFitWorkbench: () => <section>제작 적합성 워크벤치</section>,
}));

vi.mock("../components/MarketResourceDetailArticle", () => ({
  MarketResourceDetailArticle: () => <article>상세 본문</article>,
}));

vi.mock("../components/MarketSceneCompletionJourney", () => ({
  MarketSceneCompletionJourney: () => <section>장면 완성 여정</section>,
}));

vi.mock("../models/market-jsonld", () => ({
  marketResourceJsonLd: () => null,
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
  useJsonLd: vi.fn(),
  useMetaDescription: vi.fn(),
  usePageSocialMeta: vi.fn(),
}));

const useDetail = vi.mocked(useMarketResourceDetail);
const useResources = vi.mocked(useMarketResources);

const emptyResources = {
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
};

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
    useResources.mockReturnValue(emptyResources);

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
    useResources.mockReturnValue(emptyResources);

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
    useResources.mockReturnValue(emptyResources);

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

  it("surfaces Rights BOM provenance status and direct Studio Asset Hub bridge in quick actions", () => {
    const sampleRecord = {
      id: "brush-ink-pro",
      name: "프로 먹선 브러시 팩",
      description: "웹툰 선화용 고해상도 먹선 브러시",
      kind: "brush",
      publisher: { id: "pub-1", name: "스튜디오 랩" },
    } as unknown as CreatorMarketplaceResourceRecord;

    useDetail.mockReturnValue({
      record: sampleRecord,
      loading: false,
      notFound: false,
      error: null,
      staleSavedAt: null,
      reload: vi.fn(),
    });
    useResources.mockReturnValue(emptyResources);

    render(
      <MemoryRouter initialEntries={["/market/resource/brush-ink-pro"]}>
        <Routes>
          <Route path="/market/resource/:id" element={<MarketResourceDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    const actions = screen.getByTestId("market-detail-quick-actions");
    expect(within(actions).getByTestId("market-detail-rights-bom-pill").textContent).toContain("Rights BOM");
    expect(within(actions).getByRole("link", { name: "원고 위 시험 (Fit Lab)" }).getAttribute("href"))
      .toBe("/market/fit-lab?slug=brush-ink-pro");
    expect(within(actions).getByRole("link", { name: "Studio 에셋 허브 열기" }).getAttribute("href"))
      .toBe("/studio/assets");
  });
});
