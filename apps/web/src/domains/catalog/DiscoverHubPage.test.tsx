// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReactNode } from "react";
import type { Title } from "@/shared/lib/types";

import { DiscoverHubPage } from "./DiscoverHubPage";
import { ExploreReaDirectoryBar } from "./ExploreReaDirectoryBar";
import { currentKstWeekDay, type DiscoverHomeSnapshot } from "./discover-home";
import { EMPTY_TITLE_FILTERS } from "@/shared/lib/title-filters";

const resource = vi.hoisted(() => ({ read: vi.fn(), reload: vi.fn() }));
vi.mock("@/platform/use-api-resource", () => ({ useApiResource: resource.read }));
vi.mock("@/shared/seo/use-document-title", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("@/shared/components/title-card", () => ({
  TitleCard: ({ title }: { title: Title }) => <a href={`/title/${title.slug}`}>{title.title}</a>,
}));
vi.mock("@/shared/components/section", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/components/section")>()),
  Rail: ({ children, ariaLabel }: { children: ReactNode; ariaLabel?: string }) => (
    <div role="list" aria-label={ariaLabel}>{children}</div>
  ),
}));

function title(id: string): Title {
  return {
    id,
    slug: id,
    type: "webtoon",
    title: `작품-${id}`,
    author: "작가",
    genres: ["판타지"],
    tags: [],
    synopsis: "",
    cover: ["#000000", "#111111"],
    status: "ongoing",
    ageRating: "all",
    releaseYear: 2024,
    availability: [],
    stats: {
      views: 0,
      likes: 0,
      bookmarks: 0,
      ratingAvg: 4.5,
      ratingCount: 10,
      ratingDist: [0, 0, 0, 0, 10],
      rankDelta: 0,
      trendingScore: 0,
      completionRate: 0,
      bingeIndex: 0,
    },
  };
}

function snapshot(todayDay: string): DiscoverHomeSnapshot {
  return {
    topRated: [title("rated")],
    waitFree: [title("free")],
    newest: [title("new")],
    todayDay,
    todayReleases: [title("today")],
    genres: ["판타지"],
    stats: { titles: 60229, platforms: 20, genres: 18 },
    generatedAt: "2026-09-30T16:49:46.858Z",
  };
}

function mockResource(state: { data?: DiscoverHomeSnapshot | null; loading?: boolean; error?: string | null }) {
  resource.read.mockReturnValue({
    data: state.data ?? null,
    loading: state.loading ?? false,
    error: state.error ?? null,
    reload: resource.reload,
  });
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/discover"]}>
      <Routes>
        <Route path="/discover" element={<DiscoverHubPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function openDiscoveryTools() {
  const tools = screen.getByText("더 많은 탐색 도구").closest("details");
  if (!tools) throw new Error("탐색 도구 접기가 없습니다.");
  expect(tools.open).toBe(false);
  tools.open = true;
  fireEvent(tools, new Event("toggle"));
  expect(tools.open).toBe(true);
  return tools;
}

beforeEach(() => {
  resource.read.mockReset();
  resource.reload.mockReset();
});
afterEach(cleanup);

describe("DiscoverHubPage", () => {
  it("reads the public catalog snapshot and shows real story shelves with their full-view links", async () => {
    mockResource({ data: snapshot(currentKstWeekDay()) });
    renderPage();

    expect(resource.read).toHaveBeenCalledWith("/data/home.json", expect.any(String));
    expect(screen.getByRole("heading", { level: 1, name: "다음 이야기를 찾아요" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "오늘 업데이트되는 웹툰" }, { timeout: 4000 })).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "평점 랭킹 상위 작품" })).getByRole("link", { name: "작품-rated" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /무료 작품 더 보기/ }).getAttribute("href")).toBe("/search?pricing=free,wait-free");
    expect(screen.getByText("60,229")).toBeTruthy();
    expect(screen.getByText(/2026-10-01 기준 공개 카탈로그/)).toBeTruthy();
  });

  it("features a spotlight story in the hero with a link to its detail page", async () => {
    mockResource({ data: { ...snapshot(currentKstWeekDay()), spotlight: { ...title("lead"), title: "스포트라이트 작품" }, featured: [title("f1")] } });
    renderPage();

    const spotlight = screen.getByRole("article", { name: "스포트라이트 작품" });
    expect(within(spotlight).getByRole("link", { name: "스포트라이트 작품 작품 보기" }).getAttribute("href")).toBe("/title/lead");
    fireEvent.click(within(spotlight).getByText("함께 추천하는 작품"));
    expect(within(spotlight).getByRole("link", { name: /작품-f1/ }).getAttribute("href")).toBe("/title/f1");
    // 대표 작품 카드는 히어로 제목 뒤, 첫 레일보다 앞에 온다.
    const heading = screen.getByRole("heading", { level: 1 });
    const firstShelf = await screen.findByRole("heading", { name: "오늘 업데이트되는 웹툰" });
    expect(heading.compareDocumentPosition(spotlight) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(spotlight.compareDocumentPosition(firstShelf) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does not call a stale snapshot weekday 'today'", async () => {
    const today = currentKstWeekDay();
    const otherDay = today === "월" ? "화" : "월";
    mockResource({ data: snapshot(otherDay) });
    renderPage();

    expect(screen.queryByRole("heading", { name: "오늘 업데이트되는 웹툰" })).toBeNull();
    expect(await screen.findByRole("heading", { name: `${otherDay}요일 연재 인기작` })).toBeTruthy();
  });

  it("검색어 지우기 버튼이 생겨도 입력의 접근성 이름을 유지한다", () => {
    mockResource({ data: snapshot(currentKstWeekDay()) });
    renderPage();
    const field = screen.getByRole("searchbox", { name: "작품명·작가·태그 검색" });
    fireEvent.change(field, { target: { value: "화산귀환" } });
    expect(screen.getByRole("searchbox", { name: "작품명·작가·태그 검색" })).toBe(field);
    fireEvent.click(screen.getByRole("button", { name: "검색어 지우기" }));
    expect(screen.getByRole("searchbox", { name: "작품명·작가·태그 검색" })).toBe(field);
  });

  it("keeps search usable while picks load and sends the query to the search page", async () => {
    mockResource({ loading: true });
    renderPage();

    expect((await screen.findAllByRole("status", { name: "추천 작품을 불러오는 중" })).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "  나 혼자만 레벨업 " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(screen.getByTestId("location").textContent).toBe(`/search?q=${encodeURIComponent("나 혼자만 레벨업")}`);
  });

  it("offers a retry when the snapshot fails and keeps the discovery tools reachable", async () => {
    mockResource({ error: "추천 작품을 불러오지 못했습니다." });
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("추천 작품을 불러오지 못했어요");
    fireEvent.click(within(alert).getByRole("button"));
    expect(resource.reload).toHaveBeenCalledTimes(1);
    openDiscoveryTools();
    expect(screen.getByRole("link", { name: /두 작품 비교/ }).getAttribute("href")).toBe("/compare");
    fireEvent.click(screen.getByText("장르 바로 찾기"));
    expect(screen.getByRole("link", { name: "#로맨스" }).getAttribute("href")).toBe(`/explore?genre=${encodeURIComponent("로맨스")}`);
  });

  it("continues from discovery into the community and the research desk, and folds the first-visit guide", () => {
    mockResource({ data: snapshot(currentKstWeekDay()) });
    renderPage();

    openDiscoveryTools();
    // 작품을 찾은 뒤의 다음 행동: 이야기 나누기(커뮤니티)와 내 장면의 참고자료(리서치 데스크).
    expect(screen.getByRole("link", { name: /작품 이야기 나누기/ }).getAttribute("href")).toBe("/community");
    // 중복 머리말 행동 대신 펼친 도구 타일 하나로 리서치 목적지를 유지한다.
    const researchLinks = screen.getAllByRole("link", { name: /참고자료 찾기/ });
    expect(researchLinks).toHaveLength(1);
    expect(researchLinks.every((link) => link.getAttribute("href") === "/research")).toBe(true);
    // 30초 안내는 처음에는 접혀 있다(모바일 길이 관리).
    const guide = screen.getByText("처음이라면 30초 안내").closest("details") as HTMLDetailsElement;
    expect(guide.open).toBe(false);
    guide.open = true;
    fireEvent(guide, new Event("toggle"));
    expect(guide.open).toBe(true);
    expect(within(guide).getAllByRole("listitem")).toHaveLength(3);
    // 상황별 빠른 탐색 프리셋 바에서 완결 정주행·숏폼 컷츠·AI 캐릭터 토크로 바로 진입한다.
    const presetNav = screen.getByRole("navigation", { name: "상황별 빠른 탐색" });
    expect(within(presetNav).getByRole("link", { name: "완결 정주행" }).getAttribute("href")).toBe(
      "/explore?status=completed&sort=binge",
    );
    expect(within(presetNav).getByRole("link", { name: "숏폼 컷츠" }).getAttribute("href")).toBe(
      "/cuts",
    );
  });
  it("보조 도구를 펼치면 모든 목적지와 빠른 조건에 접근할 수 있다", () => {
    mockResource({ data: snapshot(currentKstWeekDay()) });
    renderPage();
    openDiscoveryTools();
    const destinations = [
      ["정확히 검색", "/search"], ["장르·조건", "/explore"],
      ["맞춤 추천", "/recommend"], ["인기", "/ranking"],
      ["요일별", "/calendar"], ["랜덤 발견", "/random"],
      ["두 작품 비교", "/compare"], ["내 서재", "/library"],
      ["숏폼 컷츠", "/cuts"], ["캐릭터 토크", "/character-chat"],
      ["작품 이야기 나누기", "/community"], ["참고자료 찾기", "/research"],
    ];
    for (const [label, href] of destinations) {
      const links = screen.getAllByRole("link", { name: new RegExp(label) });
      expect(links.some((link) => link.getAttribute("href") === href)).toBe(true);
    }
    const presets = within(screen.getByRole("navigation", { name: "상황별 빠른 탐색" }));
    for (const [label, href] of [
      ["연재중 인기작", "/explore?status=ongoing&sort=popular"],
      ["완결 정주행", "/explore?status=completed&sort=binge"],
      ["평점 4.5+ 명작", "/explore?minRating=4.5&sort=rating"],
      ["숏폼 컷츠", "/cuts"], ["AI 캐릭터 토크", "/character-chat"],
    ]) {
      expect(presets.getByRole("link", { name: label }).getAttribute("href")).toBe(href);
    }
    fireEvent.click(screen.getByText("카탈로그 출처와 집계"));
    expect(screen.getByRole("link", { name: "데이터 출처" }).getAttribute("href")).toBe("/about/data");
  });

  it("folds the memory finder and only loads it once the reader opens it", async () => {
    mockResource({ data: snapshot(currentKstWeekDay()) });
    renderPage();

    const finder = screen.getByText("제목이 기억나지 않으세요?").closest("details") as HTMLDetailsElement;
    // 접혀 있는 동안에는 폼도, 그것을 담은 지연 청크도 없다(탐색 허브 첫 화면을 가볍게 둔다).
    expect(finder.open).toBe(false);
    expect(document.querySelector("[data-memory-finder]")).toBeNull();
    // 약속을 접은 줄에서도 읽을 수 있다: 확인된 것과 짐작한 것을 나눠 말한다.
    expect(within(finder).getByText(/확인된 것과 짐작한 것을 나눠서 말해요/)).toBeTruthy();

    finder.open = true;
    fireEvent(finder, new Event("toggle"));

    expect(await screen.findByRole("radio", { name: /전혀 기억나지 않아요/ }, { timeout: 4000 })).toBeTruthy();
    await waitFor(() => expect(document.querySelector("[data-memory-finder]")).not.toBeNull());
    expect(within(finder).getByRole("button", { name: /작품 찾기/ })).toBeTruthy();
  });

  it("renders the REA serialization track switcher and ExploreReaDirectoryBar filter callbacks", () => {
    mockResource({ data: snapshot(currentKstWeekDay()) });
    renderPage();

    fireEvent.click(screen.getByText("연재 방식으로 찾기"));
    const switcher = screen.getByTestId("discover-serialization-track-switcher");
    const canvasTab = within(switcher).getByRole("tab", {
      name: /오픈 연재 \(CANVAS · 베스트도전\)/u,
    });
    fireEvent.click(canvasTab);
    expect(canvasTab.getAttribute("aria-selected")).toBe("true");

    const onApplyFilters = vi.fn();
    const onChangeSort = vi.fn();
    render(
      <ExploreReaDirectoryBar
        filters={EMPTY_TITLE_FILTERS}
        sort="popular"
        onApplyFilters={onApplyFilters}
        onChangeSort={onChangeSort}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /완결 \(Completed\)/u }));
    expect(onApplyFilters).toHaveBeenCalledWith({
      ...EMPTY_TITLE_FILTERS,
      status: ["completed"],
    });
    expect(onChangeSort).toHaveBeenCalledWith("rating");
    const readingTempoBar = screen.getByTestId("explore-rea-reading-tempo-bar");
    fireEvent.click(within(readingTempoBar).getByRole("button", {
      name: "Tapas·WEBTOON·MANGA Plus 글로벌 동시연재 (30~45컷)",
    }));
    expect(onApplyFilters).toHaveBeenLastCalledWith({
      ...EMPTY_TITLE_FILTERS,
      status: ["ongoing"],
    });
    expect(onChangeSort).toHaveBeenLastCalledWith("newest");
  });
});
