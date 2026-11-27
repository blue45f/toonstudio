// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReactNode } from "react";
import type { Title } from "@/shared/lib/types";
import { useI18n } from "@/shared/lib/i18n";
import { WEEK_DAYS } from "@/shared/lib/taxonomy";

import { currentKstWeekDay, type DiscoverHomeSnapshot } from "./discover-home";
import { DiscoverHomePreview } from "./public/DiscoverHomePreview";

const resource = vi.hoisted(() => ({ read: vi.fn(), reload: vi.fn() }));
vi.mock("@/platform/use-api-resource", () => ({ useApiResource: resource.read }));
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
    synopsis: "줄거리",
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
    spotlight: title("spot"),
    featured: [title("spot"), title("pick")],
    topRated: [title("rated")],
    waitFree: [title("free")],
    newest: [title("new")],
    todayDay,
    todayReleases: [title("today")],
    genres: ["판타지"],
    stats: { titles: 60229, platforms: 20, genres: 18 },
    generatedAt: "2026-10-05T00:00:00.000Z",
  };
}

function otherWeekDay(): string {
  const today = currentKstWeekDay();
  return WEEK_DAYS.find((day) => day !== today) ?? "월";
}

function mockResource(state: { data?: DiscoverHomeSnapshot | null; loading?: boolean; error?: string | null }) {
  resource.read.mockReturnValue({
    data: state.data ?? null,
    loading: state.loading ?? false,
    error: state.error ?? null,
    reload: resource.reload,
  });
}

const initialLanguage = useI18n.getState().lang;

beforeEach(() => {
  resource.read.mockReset();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLanguage });
});

function renderPreview() {
  return render(
    <MemoryRouter>
      <DiscoverHomePreview />
    </MemoryRouter>,
  );
}

function openWeekdayRail(summaryName = "요일 연재 보기") {
  const summary = screen.getByText(summaryName).closest("summary");
  const disclosure = summary?.closest("details");
  if (!summary || !disclosure) throw new Error("요일 연재 메뉴가 필요합니다.");
  fireEvent.click(summary);
  expect(disclosure.open).toBe(true);
  return disclosure;
}

describe("홈 발견 미리보기", () => {
  it("실제 스냅샷의 대표작과 중복 없는 추천을 최대 세 장으로 표시한다", () => {
    mockResource({ data: snapshot(currentKstWeekDay()) });
    renderPreview();

    const section = screen.getByRole("region", { name: "읽을 이야기 미리보기" });
    const cards = within(section).getAllByRole("listitem");
    expect(cards.map((item) => item.querySelector("a")?.getAttribute("href"))).toEqual([
      "/title/spot", "/title/pick", "/title/rated",
    ]);
    expect(cards[0]?.textContent).toContain("작가");
    expect(screen.queryByRole("heading", { name: "오늘 업데이트되는 웹툰" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "평점 랭킹 상위 작품" })).toBeNull();
  });

  it("요일 연재를 직접 펼치면 현재 요일로 이동하고 기존 캘린더 출구를 유지한다", async () => {
    mockResource({ data: snapshot(currentKstWeekDay()) });
    renderPreview();

    const disclosure = openWeekdayRail();
    expect(await within(disclosure).findByRole("heading", { name: "오늘 업데이트되는 웹툰" })).toBeTruthy();
    expect(within(disclosure).getByRole("link", { name: "작품-today" }).getAttribute("href")).toBe("/title/today");
    expect(within(disclosure).getByRole("link", { name: "오늘 업데이트되는 웹툰 전체 보기" }).getAttribute("href")).toBe("/calendar");
  });

  it("스냅샷 요일이 오늘이 아니면 해당 요일 연재로 표기한다", async () => {
    const day = otherWeekDay();
    mockResource({ data: snapshot(day) });
    renderPreview();

    const disclosure = openWeekdayRail();
    expect(await within(disclosure).findByRole("heading", { name: `${day}요일 연재 인기작` })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "오늘 업데이트되는 웹툰" })).toBeNull();
  });

  it("불러오기에 실패하면 오류와 빈 구간을 남기지 않는다", () => {
    mockResource({ data: null, error: "추천 작품을 불러오지 못했습니다." });
    const { container } = renderPreview();
    expect(container.firstChild).toBeNull();
  });

  it("보여 줄 작품이 없는 스냅샷이면 구간을 만들지 않는다", () => {
    mockResource({ data: { ...snapshot(currentKstWeekDay()), spotlight: null, featured: [], topRated: [], todayReleases: [] } });
    const { container } = renderPreview();
    expect(container.firstChild).toBeNull();
  });

  it("불러오는 동안 제목과 탐색 출구를 유지하며 작품 카드만 기다린다", () => {
    mockResource({ data: null, loading: true });
    renderPreview();

    expect(screen.getByRole("heading", { name: "읽을 이야기 미리보기" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "추천 작품을 불러오는 중" })).toBeTruthy();
    const exit = screen.getByRole("link", { name: "읽을 이야기 미리보기 전체 보기" });
    expect(exit.getAttribute("href")).toBe("/discover");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("스포트라이트만 있으면 빈 요일 연재 메뉴를 만들지 않는다", () => {
    mockResource({ data: { ...snapshot(currentKstWeekDay()), todayReleases: [] } });
    renderPreview();

    expect(screen.getByRole("link", { name: /^작품-spot/u }).getAttribute("href")).toBe("/title/spot");
    expect(screen.queryByText("요일 연재 보기")).toBeNull();
    expect(screen.getByRole("link", { name: "읽을 이야기 미리보기 전체 보기" }).getAttribute("href")).toBe("/discover");
  });

  it("요일 작품만 있어도 작품 상세와 탐색으로 이어진다", async () => {
    mockResource({ data: { ...snapshot(currentKstWeekDay()), spotlight: null, featured: [], topRated: [] } });
    renderPreview();

    expect(screen.getByRole("link", { name: /^작품-today/u }).getAttribute("href")).toBe("/title/today");
    expect(screen.getByRole("link", { name: "읽을 이야기 미리보기 전체 보기" }).getAttribute("href")).toBe("/discover");
    const disclosure = openWeekdayRail();
    expect((await within(disclosure).findByRole("link", { name: "오늘 업데이트되는 웹툰 전체 보기" })).getAttribute("href")).toBe("/calendar");
  });

  it("성인 작품은 홈 카드에서 제목과 연령 표시를 사용하고 표지 파일을 요청하지 않는다", () => {
    const restricted = { ...title("restricted"), ageRating: "19" as const, coverImage: "/restricted.webp" };
    mockResource({ data: { ...snapshot(currentKstWeekDay()), spotlight: restricted } });
    renderPreview();
    const card = screen.getByRole("link", { name: /^19\+\s*작품-restricted/u });
    expect(card.getAttribute("href")).toBe("/title/restricted");
    expect(within(card).getByText("19+")).toBeTruthy();
    expect(card.querySelector("img")).toBeNull();
  });

  it("영어에서는 제목과 각 출구의 접근성 이름도 영어로 제공한다", async () => {
    useI18n.setState({ lang: "en" });
    mockResource({ data: snapshot(currentKstWeekDay()) });
    renderPreview();

    expect(screen.getByRole("heading", { name: "Stories to read" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Stories to read View all" }).getAttribute("href")).toBe("/discover");
    const disclosure = openWeekdayRail("Show weekday series");
    expect((await within(disclosure).findByRole("link", { name: "Webtoons updating today View all" })).getAttribute("href")).toBe("/calendar");
  });
});
