// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlatformId, Title } from "@/shared/lib/types";

import { AuthorPage } from "./AuthorPage";
import { AuthorsPage } from "./AuthorsPage";
import { DiscoverHubPage } from "./DiscoverHubPage";
import { DiscoverShelves } from "./DiscoverShelves";
import { ExplorePage } from "./ExplorePage";
import { SearchPage } from "./SearchPage";
import { TagsPage } from "./TagsPage";
import type { DiscoverHomeSnapshot } from "./discover-home";
import {
  collectDiscoverLocalMatches,
  computeLocalPlatformCoverage,
  filterTitlesByLocalQuery,
  isPlaceholderAuthorName,
  matchesHangulAwareQuery,
  resetLocalCatalogFallbackCache,
  resolveFromLocalStaticCatalog,
  sanitizeCatalogApiData,
  sanitizeDiscoverHomeSnapshot,
  sanitizeTitleRecord,
} from "./local-catalog-fallback";
import { sanitizeTitleArray } from "./local-catalog-sanitize";
import { filterTagDirectory } from "./tag-directory";

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
  resetLocalCatalogFallbackCache();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetLocalCatalogFallbackCache();
});

describe("탐색 페이지 간격·검색·카드 밀도·이미지 fallback 및 Round 2 오프라인/손상 데이터 회귀 검증", () => {
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

  it("한글 조합 중(2벌식 자모·받침 전이·초성) 검색어가 작품·장르·태그를 오류 없이 매칭한다", () => {
    const items = [
      makeTitle("1", { title: "달빛 조각사", author: "남희성", genres: ["판타지"], tags: ["회귀"] }),
      makeTitle("2", { title: "사내맞선", author: "해화", genres: ["로맨스"], tags: ["오피스"] }),
    ];

    expect(matchesHangulAwareQuery("판타지", "ㅍ")).toBe(true);
    expect(matchesHangulAwareQuery("판타지", "판ㅌ")).toBe(true);
    expect(matchesHangulAwareQuery("판타지", "판타ㅈ")).toBe(true);
    expect(matchesHangulAwareQuery("판타지", "ㅍㅌㅈ")).toBe(true);
    expect(matchesHangulAwareQuery("달빛 조각사", "달ㅂ")).toBe(true);
    expect(matchesHangulAwareQuery("달빛 조각사", "닯")).toBe(true);
    expect(matchesHangulAwareQuery("사내맞선", "산")).toBe(true);

    expect(filterTitlesByLocalQuery(items, "판ㅌ").map((item) => item.id)).toEqual(["1"]);
    expect(filterTitlesByLocalQuery(items, "달ㅂ").map((item) => item.id)).toEqual(["1"]);
    expect(filterTitlesByLocalQuery(items, "산").map((item) => item.id)).toEqual(["2"]);

    const tags = filterTagDirectory(
      [
        { tag: "회귀", count: 12 },
        { tag: "로맨스판타지", count: 8 },
      ],
      "회ㄱ",
      "popular",
    );
    expect(tags.map((t) => t.tag)).toEqual(["회귀"]);
  });

  it("Availability.platformId 계약을 준수하고 author detail fallback의 platforms에 undefined가 포함되지 않는다", async () => {
    const worksFixture: Title[] = [
      makeTitle("solo-1", {
        title: "나 혼자만 레벨업",
        author: "추공",
        genres: ["판타지", "액션"],
        tags: ["헌터", "성장"],
        availability: [
          { platformId: "kakao-page", pricing: "wait-free" },
          { platformId: "naver-series", pricing: "paid" },
          { platformId: undefined as unknown as PlatformId, pricing: "free" },
        ],
      }),
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/data/home.json")) {
        return new Response(
          JSON.stringify({
            spotlight: worksFixture[0],
            featured: worksFixture,
            topRated: worksFixture,
            waitFree: [],
            newest: [],
            todayDay: "금",
            todayReleases: [],
            genres: ["판타지"],
            stats: { titles: 1, platforms: 2, genres: 1 },
            generatedAt: "2026-11-07T00:00:00.000Z",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/data/catalog/00.json")) {
        return new Response(JSON.stringify(worksFixture), {
          status: 200,
          headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/data/tags.json")) {
        return new Response(JSON.stringify({ tags: [{ tag: "헌터", count: 1 }] }), {
          status: 200,
          headers: { "content-type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const resolved = await resolveFromLocalStaticCatalog<{
      author: string;
      works: Title[];
      platforms: PlatformId[];
      genres: string[];
      avg: number;
      totalViews: number;
    }>("/api/authors/%EC%B6%94%EA%B3%B5");

    expect(resolved).not.toBeNull();
    expect(resolved?.author).toBe("추공");
    expect(resolved?.platforms).toEqual(["kakao-page", "naver-series"]);
    expect(resolved?.platforms.some((p) => p === undefined)).toBe(false);
    expect(resolved?.works[0]?.availability.map((a) => a.platformId)).toEqual([
      "kakao-page",
      "naver-series",
    ]);
  });

  it("API 연결 실패 후 재시도(reload) 시 캐시가 초기화되어 복구 응답을 정상 로드한다", async () => {
    let shouldFail = true;
    const fetchMock = vi.fn(async () => {
      if (shouldFail) {
        return new Response("offline", { status: 503, headers: { "content-type": "text/plain" } });
      }
      return new Response(
        JSON.stringify([makeTitle("recovered-1", { title: "복구된 작품" })]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const firstAttempt = await resolveFromLocalStaticCatalog<{ items: Title[]; total: number }>(
      "/api/titles",
    );
    expect(firstAttempt).toBeNull();

    shouldFail = false;
    const secondAttempt = await resolveFromLocalStaticCatalog<{ items: Title[]; total: number }>(
      "/api/titles",
    );
    expect(secondAttempt).not.toBeNull();
    expect(secondAttempt?.items.map((item) => item.id)).toEqual(["recovered-1"]);
  });

  it("JSON 일부 필드 누락·손상 데이터를 sanitize하고 화면 컴포넌트가 TypeError 없이 렌더링한다", () => {
    const corruptedTitle = sanitizeTitleRecord({
      id: "broken-1",
      title: "손상된 데이터 작품",
      genres: ["판타지", null, 123],
      tags: null,
      cover: ["only-one-color"],
      availability: [
        { pricing: "free" },
        { platformId: "naver-webtoon", pricing: "invalid" },
        { platform: "naver", pricing: "wait-free" },
        { platform: "kakao", pricing: "wait-free" },
        { platform: "legacy", pricing: "free" },
      ],
      stats: null,
    });
    expect(corruptedTitle).not.toBeNull();
    expect(corruptedTitle?.genres).toEqual(["판타지"]);
    expect(corruptedTitle?.tags).toEqual([]);
    expect(corruptedTitle?.cover).toHaveLength(2);
    expect(corruptedTitle?.availability).toEqual([
      { platformId: "naver-webtoon", pricing: "free" },
      { platformId: "kakao-page", pricing: "wait-free" },
    ]);
    expect(corruptedTitle?.stats.ratingAvg).toBe(0);

    const corruptedHome = sanitizeDiscoverHomeSnapshot({
      spotlight: { id: "sp-1", title: "스포트라이트 손상작" },
      topRated: null,
      waitFree: undefined,
      newest: [{ id: "new-1", title: "신작 손상작", releaseYear: 2025 }],
      todayDay: null,
      todayReleases: "invalid",
      stats: null,
    });
    expect(corruptedHome).not.toBeNull();
    expect(corruptedHome?.stats).toEqual({ titles: 0, platforms: 0, genres: 0 });
    expect(corruptedHome?.newest).toHaveLength(1);

    const corruptedAuthors = sanitizeCatalogApiData("/api/authors", {
      total: null,
      authors: [{ name: "손상작가", workCount: null, topGenres: [null, "판타지"], cover: null }],
    });
    expect(corruptedAuthors?.authors[0]?.topGenres).toEqual(["판타지"]);
    expect(corruptedAuthors?.authors[0]?.cover).toHaveLength(2);
  });

  it("ExplorePage에서 로컬 키워드 즉시 필터링, 빠른 검색 전환, 뒤로가기 복원, 빈 catalog 복구 동선이 동작한다", () => {
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

    function NavControls() {
      const navigate = useNavigate();
      const location = useLocation();
      return (
        <div>
          <output data-testid="explore-loc">{`${location.pathname}${location.search}`}</output>
          <button type="button" onClick={() => navigate("/discover")}>허브 이동</button>
          <button type="button" onClick={() => navigate(-1)}>뒤로 이동</button>
        </div>
      );
    }

    const { container, unmount } = render(
      <MemoryRouter initialEntries={["/explore"]}>
        <Routes>
          <Route path="/explore" element={<><ExplorePage /><NavControls /></>} />
          <Route path="/discover" element={<NavControls />} />
        </Routes>
      </MemoryRouter>,
    );

    const results = container.querySelector(".explore-page-results");
    expect(results?.getAttribute("data-density")).toBe("comfortable");
    expect(screen.getAllByTestId("title-card")).toHaveLength(2);

    fireEvent.click(within(screen.getByTestId("explore-page-view")).getByText("보기 설정", { selector: "summary" }));
    const densityGroup = screen.getByRole("group", { name: "카드 밀도" });
    fireEvent.click(within(densityGroup).getByRole("button", { name: "조밀" }));
    expect(results?.getAttribute("data-density")).toBe("compact");
    expect(screen.getAllByTestId("title-card")[0]?.getAttribute("data-compact")).toBe("true");

    const searchInput = screen.getByRole("searchbox", { name: "현재 목록에서 제목·작가·태그 찾기" });
    fireEvent.change(searchInput, { target: { value: "검술" } });
    expect(screen.getAllByTestId("title-card")).toHaveLength(1);
    fireEvent.change(searchInput, { target: { value: "해화" } });
    expect(screen.getAllByTestId("title-card")).toHaveLength(1);
    expect(screen.getByText("사내맞선")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "허브 이동" }));
    expect(screen.getByTestId("explore-loc").textContent).toBe("/discover");
    fireEvent.click(screen.getByRole("button", { name: "뒤로 이동" }));
    expect((screen.getByRole("searchbox", { name: "현재 목록에서 제목·작가·태그 찾기" }) as HTMLInputElement).value).toBe("해화");
    expect(screen.getAllByTestId("title-card")).toHaveLength(1);

    fireEvent.change(screen.getByRole("searchbox", { name: "현재 목록에서 제목·작가·태그 찾기" }), {
      target: { value: "존재하지않는작품명" },
    });
    const emptyImg = container.querySelector('img[src="/images/empty-generic.webp"]') as HTMLImageElement;
    expect(emptyImg).not.toBeNull();
    fireEvent.error(emptyImg);
    expect(emptyImg.getAttribute("data-fallback-active")).toBe("true");
    expect(screen.getByTestId("explore-empty-art-fallback")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
    expect(screen.getAllByTestId("title-card")).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "현재 목록에서 제목·작가·태그 찾기" }));
    unmount();
    resource.read.mockReturnValue({
      data: {
        results: [],
        shown: [],
        showCount: 40,
        pageSize: 40,
        hasMore: false,
        tags: [],
        genres: [],
      },
      loading: false,
      error: null,
      reload: resource.reload,
    });
    render(
      <MemoryRouter initialEntries={["/explore"]}>
        <ExplorePage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(resource.reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "작품 탐색 허브로 이동" }).getAttribute("href")).toBe("/discover");
  });

  it("DiscoverShelves 빈 catalog 복구 상태와 DiscoverHubPage 한글 조합 중 검색·이미지 fallback이 동작한다", () => {
    const emptySnap: DiscoverHomeSnapshot = {
      topRated: [],
      waitFree: [],
      newest: [],
      todayDay: "금",
      todayReleases: [],
      genres: [],
      stats: { titles: 0, platforms: 0, genres: 0 },
      generatedAt: "2026-11-07T00:00:00.000Z",
    };
    const retrySpy = vi.fn();
    const { unmount: unmountEmpty } = render(
      <MemoryRouter>
        <DiscoverShelves snapshot={emptySnap} loading={false} error={null} onRetry={retrySpy} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("discover-shelves-empty")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retrySpy).toHaveBeenCalledTimes(1);
    unmountEmpty();

    const snap: DiscoverHomeSnapshot = {
      spotlight: makeTitle("lead", { title: "나 혼자만 레벨업", genres: ["판타지"] }),
      featured: [makeTitle("f1", { title: "전지적 독자 시점", genres: ["판타지"] })],
      topRated: [makeTitle("r1", { title: "나 혼자만 레벨업", genres: ["판타지"] })],
      waitFree: [],
      newest: [],
      todayDay: "금",
      todayReleases: [makeTitle("t1", { title: "금요웹툰" })],
      genres: ["판타지"],
      stats: { titles: 60229, platforms: 20, genres: 18 },
      generatedAt: "2026-11-07T00:00:00.000Z",
    };

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
    fireEvent.compositionStart(searchbox);
    fireEvent.change(searchbox, { target: { value: "판ㅌ" } });
    expect(screen.getByTestId("discover-local-matches")).toBeTruthy();
    fireEvent.compositionEnd(searchbox, { currentTarget: { value: "판타지" } });
    fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
    expect(screen.queryByTestId("discover-local-matches")).toBeNull();

    const trackImg = container.querySelector("#discover-track-panel img") as HTMLImageElement;
    expect(trackImg).not.toBeNull();
    fireEvent.error(trackImg);
    expect(trackImg.getAttribute("data-fallback-active")).toBe("true");
    expect(screen.getAllByTestId("discover-art-fallback").length).toBeGreaterThan(0);
  });

  it("SearchPage, AuthorsPage, AuthorPage, TagsPage의 이미지 404 fallback 및 빈 검색 복구 동선이 동작한다", () => {
    const { unmount: unmountSearch } = render(
      <MemoryRouter initialEntries={["/search?q=판타지"]}>
        <SearchPage />
      </MemoryRouter>,
    );
    const tools = screen.getByTestId("search-page-tools");
    const toolsImg = tools.querySelector("img") as HTMLImageElement;
    fireEvent.error(toolsImg);
    expect(within(tools).getByTestId("search-tools-art-fallback")).toBeTruthy();
    unmountSearch();

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

    const { container: authorsContainer, unmount: unmountAuthors } = render(
      <MemoryRouter initialEntries={["/authors"]}>
        <AuthorsPage />
      </MemoryRouter>,
    );

    const sectionArtImg = authorsContainer.querySelector('img[src="/images/section-community.webp"]') as HTMLImageElement;
    expect(sectionArtImg).not.toBeNull();
    fireEvent.error(sectionArtImg);
    expect(screen.getByTestId("catalog-section-art-fallback")).toBeTruthy();

    const authorSearch = screen.getByRole("searchbox");
    fireEvent.change(authorSearch, { target: { value: "추ㄱ" } });
    expect(screen.getByText("추공")).toBeTruthy();
    expect(screen.queryByText("해화")).toBeNull();

    fireEvent.change(authorSearch, { target: { value: "존재하지않는작가" } });
    fireEvent.click(screen.getByRole("button", { name: "검색 초기화" }));
    expect(screen.getByText("추공")).toBeTruthy();
    unmountAuthors();

    resource.read.mockReturnValue({
      data: {
        author: "추공",
        works: [
          makeTitle("w1", { title: "작품1" }),
          makeTitle("w2", { title: "작품2" }),
          makeTitle("w3", { title: "작품3" }),
          makeTitle("w4", { title: "작품4" }),
          makeTitle("w5", { title: "작품5" }),
        ],
        totalViews: 5000,
        avg: 4.8,
        genres: ["판타지"],
        generatedAt: "2026-11-07T00:00:00.000Z",
        source: "test",
      },
      loading: false,
      error: null,
      reload: resource.reload,
    });
    const { unmount: unmountAuthorDetail } = render(
      <MemoryRouter initialEntries={["/author/추공"]}>
        <Routes>
          <Route path="/author/:name" element={<AuthorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const workSearch = screen.getByPlaceholderText("참여작 제목·장르·태그 검색");
    fireEvent.change(workSearch, { target: { value: "없는참여작" } });
    expect(screen.getByTestId("author-works-search-empty")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "참여작 검색 초기화" }));
    expect(screen.getAllByTestId("title-card")).toHaveLength(5);
    unmountAuthorDetail();

    resource.read.mockReturnValue({
      data: { tags: [] },
      loading: false,
      error: null,
      reload: resource.reload,
    });
    render(
      <MemoryRouter initialEntries={["/tags"]}>
        <TagsPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("등록된 태그가 없습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(resource.reload).toHaveBeenCalled();
  });

  it("Round 4: 로컬 크롤링 스냅샷의 실제 수집시점(generatedAt)·출처·플랫폼 커버리지와 작가→작품→원출처 연결을 보존하고 허위 실시간 시각을 만들지 않는다", async () => {
    resetLocalCatalogFallbackCache();
    const originalFetch = globalThis.fetch;
    const snapshotGeneratedAt = "2026-11-07T05:12:01.730Z";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/data/home.json")) {
        return new Response(
          JSON.stringify({
            featured: [
              makeTitle("work-multi", {
                slug: "moonlight-knight",
                title: "달빛 기사의 귀환",
                author: "채은, 고다고",
                availability: [
                  { platform: "naver", pricing: "paid" } as unknown as Title["availability"][number],
                  {
                    platformId: "naver-webtoon",
                    pricing: "wait-free",
                    isOriginal: true,
                    url: "https://comic.naver.com/webtoon/list?titleId=999",
                  },
                  {
                    platformId: "ridi",
                    pricing: "free",
                    url: "http://insecure.example.com/bad",
                  },
                ],
              }),
            ],
            topRated: [],
            waitFree: [],
            newest: [],
            todayDay: "토",
            todayReleases: [],
            genres: ["판타지"],
            stats: { titles: 1, platforms: 2, genres: 1 },
            generatedAt: snapshotGeneratedAt,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/data/catalog/00.json") || url.includes("/data/tags.json")) {
        return new Response(JSON.stringify(url.includes("tags") ? { tags: [] } : []), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    try {
      const exploreRes = await resolveFromLocalStaticCatalog<{
        generatedAt: string;
        source: string;
        catalog: { loadedAt: string | null; platformCoverage: { id: PlatformId; count: number }[] };
      }>("/api/explore");
      expect(exploreRes?.generatedAt).toBe(snapshotGeneratedAt);
      expect(exploreRes?.source).toBe("local-static-fallback");
      expect(exploreRes?.catalog.loadedAt).toBe(snapshotGeneratedAt);
      expect(exploreRes?.catalog.platformCoverage).toEqual([
        { id: "naver-webtoon", count: 1 },
        { id: "ridi", count: 1 },
      ]);

      const searchRes = await resolveFromLocalStaticCatalog<{
        total: number;
        generatedAt: string;
        catalog: { loadedAt: string | null; platformCoverage: { id: PlatformId; count: number }[] };
      }>("/api/search?q=달ㅂ&platforms=naver,undefined,,invalid-plat");
      expect(searchRes?.total).toBe(1);
      expect(searchRes?.generatedAt).toBe(snapshotGeneratedAt);
      expect(searchRes?.catalog.loadedAt).toBe(snapshotGeneratedAt);

      const authorRes = await resolveFromLocalStaticCatalog<{
        author: string;
        works: Title[];
        platforms: PlatformId[];
        generatedAt: string;
      }>("/api/authors/%EC%B1%84%EC%9D%80");
      expect(authorRes?.author).toBe("채은");
      expect(authorRes?.works).toHaveLength(1);
      expect(authorRes?.platforms).toEqual(["naver-webtoon", "ridi"]);
      expect(authorRes?.generatedAt).toBe(snapshotGeneratedAt);

      const unknownAuthorRes = await resolveFromLocalStaticCatalog("/api/authors/%EC%9E%91%EA%B0%80%20%EB%AF%B8%EC%83%81");
      expect(unknownAuthorRes).toBeNull();

      const titleDetailRes = await resolveFromLocalStaticCatalog<{
        title: Title;
        generatedAt: string;
        source: string;
      }>("/api/titles/moonlight-knight");
      expect(titleDetailRes?.generatedAt).toBe(snapshotGeneratedAt);
      expect(titleDetailRes?.source).toBe("local-static-fallback");
      expect(titleDetailRes?.title.availability).toEqual([
        {
          platformId: "naver-webtoon",
          pricing: "wait-free",
          isOriginal: true,
          url: "https://comic.naver.com/webtoon/list?titleId=999",
        },
        {
          platformId: "ridi",
          pricing: "free",
        },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      resetLocalCatalogFallbackCache();
    }
  });

  it("Round 4: 빈 작가·미상 필터링, 깨진 플랫폼 커버리지 방어, 1000작품 표본 UI 필터·렌더링 응답성 및 한글 IME를 검증한다", () => {
    expect(isPlaceholderAuthorName("")).toBe(true);
    expect(isPlaceholderAuthorName("작가 미상")).toBe(true);
    expect(isPlaceholderAuthorName("미상")).toBe(true);
    expect(isPlaceholderAuthorName("익명")).toBe(true);
    expect(isPlaceholderAuthorName("채은")).toBe(false);

    const sanitizedAuthors = sanitizeCatalogApiData("/api/authors", {
      total: 4,
      authors: [
        { name: "" },
        { name: "작가 미상" },
        { name: "미상" },
        { name: "초장문작가_" + "가".repeat(90), workCount: 4, totalViews: 1200, avgRating: 4.9 },
      ],
    });
    expect(sanitizedAuthors?.authors).toHaveLength(1);
    expect(sanitizedAuthors?.total).toBe(1);

    // 1000작품 합성 표본 생성(사용자 원본 불변) 및 정제·플랫폼 집계·한글 IME 검색 응답성 측정
    const rawThousand = Array.from({ length: 1000 }, (_, i) => ({
      id: `synth-${i}`,
      slug: `synth-${i}`,
      type: i % 3 === 0 ? "webnovel" : "webtoon",
      title:
        i === 0
          ? "초장문타이틀_" + "나".repeat(120)
          : i % 25 === 0
            ? `달빛 판타지 연대기 ${i}`
            : `합성 테스트 작품 ${i}`,
      author: i % 10 === 0 ? "작가 미상" : `작가_${i % 80}`,
      genres: i % 2 === 0 ? ["판타지", "액션"] : ["로맨스"],
      tags: ["회귀", `태그${i % 15}`],
      coverImage: i % 5 === 0 ? "https://broken.invalid/404.webp" : undefined,
      availability: [
        { platform: "naver", pricing: "paid" },
        {
          platformId: i % 2 === 0 ? "naver-webtoon" : "kakao-page",
          pricing: "wait-free",
          url: "https://comic.naver.com/webtoon/list?titleId=100",
        },
        { platformId: undefined, pricing: "free" },
      ],
    }));

    const startPerf = performance.now();
    const titles1000 = sanitizeTitleArray(rawThousand);
    const coverage = computeLocalPlatformCoverage(titles1000);
    const imeFiltered = filterTitlesByLocalQuery(titles1000, "달ㅂ ㅍㅌ");
    const elapsedMs = performance.now() - startPerf;

    expect(titles1000).toHaveLength(1000);
    expect(titles1000[0]?.availability).toHaveLength(1);
    expect(coverage.map((c) => c.id)).toEqual(["naver-webtoon", "kakao-page"]);
    expect(imeFiltered.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(350);

    resource.read.mockReturnValue({
      data: {
        filters: { sort: "popular" },
        current: {},
        results: titles1000,
        shown: titles1000.slice(0, 40),
        hasMore: true,
        showCount: 40,
        pageSize: 40,
        tags: [{ tag: "회귀", count: 1000 }],
        genres: ["판타지", "로맨스", "액션"],
        catalog: {
          platformCoverage: [
            { id: undefined as unknown as PlatformId, label: "", color: "", count: 10, share: 0.1 },
            { id: "naver" as unknown as PlatformId, label: "네이버", color: "#00d564", count: 1000, share: 1 },
            { id: "naver-webtoon", label: "네이버웹툰", color: "#00d564", count: 1000, share: 1 },
          ],
        },
        generatedAt: "2026-11-07T05:12:01.730Z",
        source: "local-static-fallback",
      },
      loading: false,
      error: null,
      reload: resource.reload,
    });

    render(
      <MemoryRouter initialEntries={["/explore?platforms=naver-webtoon"]}>
        <ExplorePage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("catalog-provenance-meta").textContent).toContain("2026-11-07");
    expect(screen.getAllByTestId("title-card")).toHaveLength(40);
  });
});
