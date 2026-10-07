// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PromotionPost } from "@toonstudio/core/promotion";
import { PromotionBoardPage } from "./PromotionBoardPage";

vi.mock("@/shared/lib/store", () => ({
  useApp: (selector: (state: { userId: null }) => unknown) => selector({ userId: null }),
}));

const feedMock = vi.hoisted(() => ({ items: [] as PromotionPost[] }));

vi.mock("./use-promotion-feed", () => ({
  usePromotionFeed: () => ({
    page: { items: feedMock.items, nextCursor: null, hasMore: false, canModerate: false },
    loading: false,
    moreLoading: false,
    error: "",
    loadMore: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const post = (id: string, cover: string): PromotionPost => ({
  id,
  kind: "series",
  stage: "amateur",
  genre: "드라마",
  title: `소개 글 ${id}`,
  seriesTitle: `작품 ${id}`,
  description: "히어로 무대를 검증하기 위한 충분히 긴 작품 소개 문장입니다.",
  readingUrl: "",
  videoUrl: "",
  cover,
  tags: [],
  contentWarning: "",
  rightsConfirmed: true,
  author: { id: "author-A", name: "작가" },
  createdAt: "2026-09-22T00:00:00.000Z",
  updatedAt: "2026-09-22T00:00:00.000Z",
  version: 1,
  hidden: false,
  archived: false,
  saved: false,
});

afterEach(cleanup);

function renderBoard() {
  return render(
    <MemoryRouter>
      <PromotionBoardPage />
    </MemoryRouter>,
  );
}

describe("PromotionBoardPage hero spotlight", () => {
  it("표지가 있는 가장 최근 공개 소개를 첫 화면 무대에 세운다", () => {
    feedMock.items = [post("no-cover", ""), post("with-cover", "https://example.com/cover-a.png"), post("older-cover", "https://example.com/cover-b.png")];
    const { container } = renderBoard();
    const feature = container.querySelector(".pc-hero-feature");
    expect(feature).toBeTruthy();
    const coverImg = feature?.querySelector(".pc-hero-feature-cover img");
    expect(coverImg?.getAttribute("src")).toBe("https://example.com/cover-a.png");
    expect(screen.getByText("최신 표지 소개")).toBeTruthy();
    expect(screen.getByText("작품 with-cover")).toBeTruthy();
    const link = feature?.querySelector("a.pc-hero-feature-cover");
    expect(link?.getAttribute("href")).toBe("/community/promote/with-cover");
    // 무대가 서면 환영 노트는 물러난다.
    expect(screen.queryByText(/시작하는 작가도 환영해요/)).toBeNull();
  });

  it("표지가 있는 소개가 없으면 꾸민 대체재 없이 환영 노트를 유지한다", () => {
    feedMock.items = [post("no-cover", "")];
    const { container } = renderBoard();
    expect(container.querySelector(".pc-hero-feature")).toBeNull();
    expect(screen.getByText(/시작하는 작가도 환영해요/)).toBeTruthy();
  });
});
