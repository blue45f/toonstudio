// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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

describe("홈 발견 미리보기", () => {
  it("스포트라이트 1장과 오늘 요일 레일 1줄을 실제 스냅샷으로 보여 준다", () => {
    mockResource({ data: snapshot(currentKstWeekDay()) });
    renderPreview();

    const section = screen.getByRole("region", { name: "읽을 이야기 미리보기" });
    expect(section).toBeTruthy();
    // 스포트라이트: 대표 작품이 작품 상세로 이어진다.
    expect(screen.getByRole("link", { name: /작품-spot/u }).getAttribute("href")).toBe("/title/spot");
    expect(screen.getByText("오늘의 추천")).toBeTruthy();
    // 요일 레일: 스냅샷 요일이 오늘(KST)과 같으면 "오늘 업데이트"로 부른다.
    expect(screen.getByRole("heading", { name: "오늘 업데이트되는 웹툰" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "작품-today" }).getAttribute("href")).toBe("/title/today");
    // 레일은 요일 줄 하나뿐이다 — 나머지 레일은 /discover의 몫이다.
    expect(screen.queryByRole("heading", { name: "평점 랭킹 상위 작품" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "최근 공개된 작품" })).toBeNull();
  });

  it("스냅샷 요일이 오늘이 아니면 '오늘'이라 부르지 않고 해당 요일 연재로 표기한다", () => {
    const day = otherWeekDay();
    mockResource({ data: snapshot(day) });
    renderPreview();

    expect(screen.queryByRole("heading", { name: "오늘 업데이트되는 웹툰" })).toBeNull();
    expect(screen.getByRole("heading", { name: `${day}요일 연재 인기작` })).toBeTruthy();
  });

  it("불러오기에 실패하면 오류 블록 없이 구간 자체를 만들지 않는다", () => {
    mockResource({ data: null, error: "추천 작품을 불러오지 못했습니다." });
    const { container } = renderPreview();
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("region", { name: "읽을 이야기 미리보기" })).toBeNull();
  });

  it("보여 줄 작품이 없는 스냅샷이면 구간을 만들지 않는다", () => {
    mockResource({
      data: {
        topRated: [],
        waitFree: [],
        newest: [],
        todayDay: currentKstWeekDay(),
        todayReleases: [],
        genres: [],
        stats: { titles: 0, platforms: 0, genres: 0 },
        generatedAt: "2026-10-05T00:00:00.000Z",
      },
    });
    const { container } = renderPreview();
    expect(container.firstChild).toBeNull();
  });

  it("불러오는 동안에는 스포트라이트·레일 모양 스켈레톤을 같은 자리에 둔다", () => {
    mockResource({ data: null, loading: true });
    renderPreview();
    expect(screen.getByRole("status", { name: "대표 작품을 불러오는 중" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "추천 작품을 불러오는 중" })).toBeTruthy();
  });

  it("구간 제목을 눈에 보이는 제목으로 두고, 옆에 탐색 허브로 가는 전체 보기 출구를 표기한다", () => {
    mockResource({ data: snapshot(currentKstWeekDay()) });
    renderPreview();

    // 제목: aria-label에만 있던 구간 이름이 실제 제목 요소로 보인다.
    expect(screen.getByRole("heading", { name: "읽을 이야기 미리보기" })).toBeTruthy();
    // 출구: 보이는 문구는 "전체 보기", 접근명에는 구간 제목이 붙고, 도착지는 레일 전체를 소유한 /discover다.
    const exit = screen.getByRole("link", { name: "읽을 이야기 미리보기 전체 보기" });
    expect(exit.textContent).toContain("전체 보기");
    expect(exit.getAttribute("href")).toBe("/discover");
  });

  it("요일 레일은 자기 제목 옆에 전체 보기를 두고, 도착지는 레일의 실제 전체 목록(연재 캘린더)을 쓴다", () => {
    mockResource({ data: snapshot(currentKstWeekDay()) });
    renderPreview();

    const railExit = screen.getByRole("link", { name: "오늘 업데이트되는 웹툰 전체 보기" });
    expect(railExit.textContent).toContain("전체 보기");
    expect(railExit.getAttribute("href")).toBe("/calendar");
    // 미리보기에서는 목적지 이름("연재 캘린더")이 아니라 전체 보기로 통일한다.
    expect(screen.queryByRole("link", { name: /연재 캘린더/u })).toBeNull();
  });

  it("스포트라이트만 있으면 요일 레일 출구는 만들지 않고, 미리보기 출구만 남긴다", () => {
    mockResource({ data: { ...snapshot(currentKstWeekDay()), todayReleases: [] } });
    renderPreview();

    expect(screen.getByRole("link", { name: /작품-spot/u })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "오늘 업데이트되는 웹툰" })).toBeNull();
    expect(screen.getAllByRole("link").some((link) => link.getAttribute("href") === "/calendar")).toBe(false);
    expect(screen.getAllByRole("link", { name: /전체 보기/u })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "읽을 이야기 미리보기 전체 보기" }).getAttribute("href")).toBe("/discover");
  });

  it("요일 레일만 있어도 두 출구가 각자의 실제 도착지를 가리킨다", () => {
    mockResource({
      data: { ...snapshot(currentKstWeekDay()), spotlight: null, featured: [], topRated: [] },
    });
    renderPreview();

    expect(screen.queryByRole("link", { name: /작품-spot/u })).toBeNull();
    expect(screen.getByRole("link", { name: "읽을 이야기 미리보기 전체 보기" }).getAttribute("href")).toBe("/discover");
    expect(screen.getByRole("link", { name: "오늘 업데이트되는 웹툰 전체 보기" }).getAttribute("href")).toBe("/calendar");
  });

  it("불러오기 실패·빈 스냅샷에서는 제목도 출구도 남기지 않는다", () => {
    mockResource({ data: null, error: "추천 작품을 불러오지 못했습니다." });
    const failed = renderPreview();
    expect(screen.queryByRole("heading", { name: "읽을 이야기 미리보기" })).toBeNull();
    expect(screen.queryByRole("link", { name: /전체 보기/u })).toBeNull();
    failed.unmount();

    mockResource({
      data: {
        topRated: [],
        waitFree: [],
        newest: [],
        todayDay: currentKstWeekDay(),
        todayReleases: [],
        genres: [],
        stats: { titles: 0, platforms: 0, genres: 0 },
        generatedAt: "2026-10-05T00:00:00.000Z",
      },
    });
    renderPreview();
    expect(screen.queryByRole("heading", { name: "읽을 이야기 미리보기" })).toBeNull();
    expect(screen.queryByRole("link", { name: /전체 보기/u })).toBeNull();
  });

  it("불러오는 동안에도 제목과 전체 보기 출구가 먼저 같은 자리에 있다", () => {
    mockResource({ data: null, loading: true });
    renderPreview();

    expect(screen.getByRole("heading", { name: "읽을 이야기 미리보기" })).toBeTruthy();
    // 레일은 아직 스켈레톤이라 출구는 미리보기 출구 하나뿐이다.
    const exits = screen.getAllByRole("link", { name: /전체 보기/u });
    expect(exits).toHaveLength(1);
    expect(exits[0]?.getAttribute("href")).toBe("/discover");
  });

  it("영어에서는 제목과 출구 문구가 영어로 바뀐다", () => {
    useI18n.setState({ lang: "en" });
    mockResource({ data: snapshot(currentKstWeekDay()) });
    renderPreview();

    expect(screen.getByRole("heading", { name: "Stories to read" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Stories to read View all" }).getAttribute("href")).toBe("/discover");
    expect(screen.getByRole("link", { name: "Webtoons updating today View all" }).getAttribute("href")).toBe("/calendar");
  });
});
