// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Title } from "@/shared/lib/types";

import { AuthorsPage } from "./AuthorsPage";
import { DiscoverHubPage } from "./DiscoverHubPage";
import { DiscoverShelves } from "./DiscoverShelves";
import { ExplorePage } from "./ExplorePage";
import { SearchPage } from "./SearchPage";
import type { DiscoverHomeSnapshot } from "./discover-home";
import { collectDiscoverLocalMatches, filterTitlesByLocalQuery } from "./local-catalog-fallback";

const resource = vi.hoisted(() => ({ read: vi.fn(), reload: vi.fn() }));
vi.mock("@/platform/use-api-resource", () => ({ useApiResource: resource.read }));
vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
  useJsonLd: vi.fn(),
  useMetaDescription: vi.fn(),
  useMetaRobots: vi.fn(),
  usePageSocialMeta: vi.fn(),
}));
vi.mock("@/shared/components/page-entrance/PageEntrance", () => ({
  PageEntrance: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/shared/components/stagger-reveal", () => ({
  StaggerReveal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/shared/components/site-contextual-subnav", () => ({
  SiteContextualSubNav: () => <nav aria-label="문맥 안내" />,
}));
vi.mock("@/shared/components/site-experience/SiteArtSurfaceSpotlight", () => ({
  SiteArtSurfaceSpotlight: () => <div data-testid="guide-art" />,
}));
vi.mock("@/shared/components/section", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/components/section")>()),
  Rail: ({ children, ariaLabel }: { children: ReactNode; ariaLabel?: string }) => (
    <div role="list" aria-label={ariaLabel}>{children}</div>
  ),
}));
vi.mock("@/shared/components/title-card", () => ({
  TitleCard: ({
    title,
    size,
    className,
  }: {
    title: Title;
    size?: "sm" | "md" | "lg";
    className?: string;
  }) => (
    <a
      href={`/title/${title.slug}`}
      data-testid="title-card"
      data-compact={size === "sm" ? "true" : "false"}
      className={className}
    >
      {title.title}
    </a>
  ),
}));

function makeTitle(id: string, overrides: Partial<Title> = {}): Title {
  return {
    id,
    slug: `slug-${id}`,
    type: "webtoon",
    title: `작품-${id}`,
    author: "작가A",
    genres: ["판타지"],
    tags: ["회귀"],
    synopsis: "줄거리 요약",
    cover: ["oklch(0.45 0.14 35)", "oklch(0.28 0.1 75)"],
    status: "ongoing",
    ageRating: "all",
    releaseYear: 2025,
    availability: [],
    stats: {
      views: 1000,
      likes: 100,
      bookmarks: 50,
      ratingAvg: 4.7,
      ratingCount: 25,
      ratingDist: [0, 0, 0, 5, 20],
      rankDelta: 0,
      trendingScore: 80,
      completionRate: 0.7,
      bingeIndex: 0.8,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("탐색 페이지 간격·검색·카드 밀도·이미지 fallback 개선 검증", () => {
  it("filterTitlesByLocalQuery와 collectDiscoverLocalMatches가 제목·작가·장르·태그 다중 토큰을 정확히 필터링한다", () => {
    const items = [
      makeTitle("1", { title: "달빛 조각사", author: "남희성", genres: ["판타지", "액션"], tags: ["성장", "가상현실"] }),
      makeTitle("2", { title: "로맨스 정원", author: "김작가", genres: ["로맨스"], tags: ["힐링"] }),
    ];
    expect(filterTitlesByLocalQuery(items, "달빛 가상현실").map((item) => item.id)).toEqual(["1"]);
    expect(filterTitlesByLocalQuery(items, "김작가 힐링").map((item) => item.id)).toEqual(["2"]);
    expect(filterTitlesByLocalQuery(items, "없는키워드")).toEqual([]);

    const snap: DiscoverHomeSnapshot = {
      spotlight: items[0],
      featured: [items[0], items[1]],
      topRated: [items[1]],
      waitFree: [],
      newest: [],
      todayDay: "금",
      todayReleases: [],
      genres: ["판타지", "로맨스"],
      stats: { titles: 2, platforms: 1, genres: 2 },
      generatedAt: "2026-11-07T00:00:00.000Z",
    };
    const matches = collectDiscoverLocalMatches(snap, "판타지");
    expect(matches.titles.map((item) => item.id)).toEqual(["1"]);
    expect(matches.genres).toEqual(["판타지"]);
  });

  it("ExplorePage에서 로컬 키워드 즉시 필터링, 카드 밀도(표준/조밀) 전환, 빈 상태 이미지 에러 fallback이 동작한다", () => {
    const items = [
      makeTitle("1", { title: "검술명가 막내아들", author: "황제펭귄", genres: ["판타지"] }),
      makeTitle("2", { title: "사내맞선", author: "해화", genres: ["로맨스"] }),
    ];
    resource.read.mockReturnValue({
      data: {
        results: items,
        shown: items,
        showCount: 40,
        pageSize: 2,
        hasMore: false,
        tags: [],
        genres: ["판타지", "로맨스"],
      },
      loading: false,
      error: null,
      reload: resource.reload,
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/explore"]}>
        <Routes>
          <Route path="/explore" element={<ExplorePage />} />
        </Routes>
      </MemoryRouter>,
    );

    const results = container.querySelector(".explore-page-results");
    expect(results?.getAttribute("data-density")).toBe("comfortable");
    expect(screen.getAllByTestId("title-card")).toHaveLength(2);
    expect(screen.getAllByTestId("title-card")[0]?.getAttribute("data-compact")).toBe("false");

    // 카드 밀도를 조밀(compact)로 전환
    const densityGroup = screen.getByRole("group", { name: "카드 밀도" });
    fireEvent.click(within(densityGroup).getByRole("button", { name: "조밀" }));
    expect(results?.getAttribute("data-density")).toBe("compact");
    expect(screen.getAllByTestId("title-card")[0]?.getAttribute("data-compact")).toBe("true");

    // 로컬 검색어로 즉시 필터링
    const searchInput = screen.getByRole("searchbox", { name: "결과 내 제목·작가·태그 필터" });
    fireEvent.change(searchInput, { target: { value: "해화" } });
    expect(screen.getAllByTestId("title-card")).toHaveLength(1);
    expect(screen.getByText("사내맞선")).toBeTruthy();

    // 일치 결과 없음 상태에서 이미지 로드 실패 시 fallback 배지 노출
    fireEvent.change(searchInput, { target: { value: "존재하지않는작품명" } });
    const emptyImg = container.querySelector('img[src="/images/empty-generic.webp"]') as HTMLImageElement;
    expect(emptyImg).not.toBeNull();
    fireEvent.error(emptyImg);
    expect(emptyImg.getAttribute("data-fallback-active")).toBe("true");
    expect(screen.getByTestId("explore-empty-art-fallback")).toBeTruthy();

    // 검색어 지우기 버튼으로 복원
    fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
    expect(screen.getAllByTestId("title-card")).toHaveLength(2);
  });

  it("DiscoverShelves가 가로 레일 내 TitleCard에 compact 밀도를 전달하고 DiscoverHubPage가 로컬 검색 미리보기와 이미지 fallback을 제공한다", () => {
    const snap: DiscoverHomeSnapshot = {
      spotlight: makeTitle("lead", { title: "나 혼자만 레벨업" }),
      featured: [makeTitle("f1", { title: "전지적 독자 시점" })],
      topRated: [makeTitle("r1", { title: "나 혼자만 레벨업" })],
      waitFree: [],
      newest: [],
      todayDay: "금",
      todayReleases: [makeTitle("t1", { title: "금요웹툰" })],
      genres: ["판타지"],
      stats: { titles: 60229, platforms: 20, genres: 18 },
      generatedAt: "2026-11-07T00:00:00.000Z",
    };

    const { unmount } = render(
      <MemoryRouter>
        <DiscoverShelves snapshot={snap} loading={false} error={null} onRetry={vi.fn()} />
      </MemoryRouter>,
    );
    const shelfCards = screen.getAllByTestId("title-card");
    expect(shelfCards.length).toBeGreaterThan(0);
    expect(shelfCards.every((card) => card.getAttribute("data-compact") === "true")).toBe(true);
    unmount();

    resource.read.mockReturnValue({
      data: snap,
      loading: false,
      error: null,
      reload: resource.reload,
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/discover"]}>
        <DiscoverHubPage />
      </MemoryRouter>,
    );

    const searchbox = screen.getByRole("searchbox");
    fireEvent.change(searchbox, { target: { value: "레벨업" } });
    expect(screen.getByTestId("discover-local-matches")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
    expect(screen.queryByTestId("discover-local-matches")).toBeNull();

    const trackImg = container.querySelector("#discover-track-panel img") as HTMLImageElement;
    expect(trackImg).not.toBeNull();
    fireEvent.error(trackImg);
    expect(trackImg.getAttribute("data-fallback-active")).toBe("true");
    expect(screen.getAllByTestId("discover-art-fallback").length).toBeGreaterThan(0);
  });

  it("SearchPage 보조 안내 일러스트와 AuthorsPage 작가 아바타 fallback 및 장르/이름 검색이 정상 동작한다", () => {
    const { container, unmount } = render(
      <MemoryRouter initialEntries={["/search?q=판타지"]}>
        <SearchPage />
      </MemoryRouter>,
    );
    const tools = screen.getByTestId("search-page-tools");
    const toolsImg = tools.querySelector("img") as HTMLImageElement;
    expect(toolsImg).not.toBeNull();
    fireEvent.error(toolsImg);
    expect(toolsImg.getAttribute("data-fallback-active")).toBe("true");
    expect(within(tools).getByTestId("search-tools-art-fallback")).toBeTruthy();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/brand/illustrated-20260928/blank-canvas.webp");
    unmount();

    resource.read.mockReturnValue({
      data: {
        total: 2,
        authors: [
          {
            name: "추공",
            workCount: 3,
            totalViews: 50000,
            avgRating: 4.8,
            topGenres: ["판타지", "액션"],
            types: ["webtoon"],
            cover: ["#112233", "#223344"],
          },
          {
            name: "해화",
            workCount: 2,
            totalViews: 30000,
            avgRating: 4.6,
            topGenres: ["로맨스"],
            types: ["webtoon"],
            cover: ["#332211", "#443322"],
          },
        ],
      },
      loading: false,
      error: null,
      reload: resource.reload,
    });

    render(
      <MemoryRouter initialEntries={["/authors"]}>
        <AuthorsPage />
      </MemoryRouter>,
    );

    expect(screen.getAllByTestId("author-avatar-fallback").map((el) => el.textContent)).toEqual(["추", "해"]);
    const authorSearch = screen.getByRole("searchbox");
    fireEvent.change(authorSearch, { target: { value: "로맨스" } });
    expect(screen.getByText("해화")).toBeTruthy();
    expect(screen.queryByText("추공")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "작가 검색어 지우기" }));
    expect(screen.getByText("추공")).toBeTruthy();
  });
});
