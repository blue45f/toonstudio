// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Title } from "@/shared/lib/types";

import { TitleEpisodeSection } from "./TitleEpisodeSection";
import type { TitleEpisode } from "./title-episodes";

import { useI18n } from "@/shared/lib/i18n-core";

vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => null,
}));
vi.mock("@/shared/components/cover-image", () => ({
  CoverImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const initialLanguage = useI18n.getState().lang;

function makeTitle(overrides: Partial<Title> = {}): Title {
  return {
    id: "title-1",
    slug: "fog-signal",
    type: "webtoon",
    title: "안개 속의 신호",
    author: "김작가",
    genres: ["미스터리"],
    tags: [],
    synopsis: "줄거리",
    cover: ["oklch(0.45 0.14 260)", "oklch(0.28 0.1 290)"],
    status: "ongoing",
    ageRating: "15",
    releaseYear: 2025,
    updateDays: ["월", "목"],
    availability: [],
    stats: {
      views: 1200000,
      likes: 34000,
      bookmarks: 12000,
      ratingAvg: 9.8,
      ratingCount: 4210,
      ratingDist: [1, 2, 5, 20, 72],
      rankDelta: 0,
      trendingScore: 88,
      completionRate: 86,
      bingeIndex: 92,
    },
    ...overrides,
  };
}

const EPISODES: TitleEpisode[] = [
  { number: 1, title: "신호의 시작", publishedAt: "2026-08-03", likes: 1200 },
  { number: 2, title: "안개가 짙어지면", publishedAt: "2026-08-10", likes: 980 },
  { number: 3, title: "마지막 전파", publishedAt: "2026-08-17", likes: 1500 },
  { number: 4, status: "scheduled" },
];

function renderSection(title: Title, episodes?: readonly TitleEpisode[]) {
  return render(
    <MemoryRouter>
      <TitleEpisodeSection title={title} episodes={episodes} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLanguage });
});

describe("TitleEpisodeSection — 회차 데이터가 없을 때 (현재 계약)", () => {
  it("행을 지어내지 않고 빈 상태와 연재 요약을 정직하게 보여준다", () => {
    renderSection(makeTitle());
    expect(screen.getByRole("heading", { name: /회차/ })).toBeTruthy();
    expect(screen.getByText("회차별 목록은 아직 제공되지 않아요")).toBeTruthy();
    expect(screen.getByText("연재중")).toBeTruthy();
    expect(screen.getByText("월·목 연재")).toBeTruthy();
    // 정렬 토글·회차 링크는 데이터가 있을 때만
    expect(screen.queryByRole("button", { name: "최신부터" })).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("총 회차 수가 메타에 있으면 빈 상태에도 총수를 표기한다", () => {
    renderSection(makeTitle({ totalEpisodes: 128 }));
    expect(screen.getByText("총 128화")).toBeTruthy();
  });
});

describe("TitleEpisodeSection — 회차 데이터가 있을 때", () => {
  it("최신부터 정렬로 행을 그리고 썸네일·제목·날짜·좋아요·배지를 보여준다", () => {
    renderSection(makeTitle(), EPISODES);
    const list = screen.getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    // 최신부터: 4(예정) → 3 → 2 → 1
    expect(items[0]?.textContent).toContain("공개 예정");
    expect(items[1]?.textContent).toContain("마지막 전파");
    expect(items[1]?.textContent).toContain("NEW");
    expect(items[1]?.textContent).toContain("1.5천");
    expect(items[3]?.textContent).toContain("신호의 시작");
    // 공개 예정 회차는 링크가 아니다
    expect(within(items[0]!).queryByRole("link")).toBeNull();
    const link = within(items[1]!).getByRole("link");
    expect(link.getAttribute("href")).toBe("/title/fog-signal/read/3");
  });

  it("정렬 토글로 첫 화부터로 바꿀 수 있다", () => {
    renderSection(makeTitle(), EPISODES);
    fireEvent.click(screen.getByRole("button", { name: "첫 화부터" }));
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items[0]?.textContent).toContain("신호의 시작");
    expect(screen.getByRole("button", { name: "첫 화부터" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("뷰어에서 남긴 진도가 있으면 이어보기 바와 읽음 배지가 붙는다", () => {
    window.localStorage.setItem(
      "toonstudio.reader-progress.v1.guest",
      JSON.stringify({ "fog-signal": { episode: 2, ratio: 0.82, updatedAt: Date.now() } }),
    );
    renderSection(makeTitle(), EPISODES);
    expect(screen.getByText("2화 · 82% 읽음")).toBeTruthy();
    const continueLink = screen.getByRole("link", { name: "이어서 읽기" });
    expect(continueLink.getAttribute("href")).toBe("/title/fog-signal/read/2");
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    const ep1 = items.find((item) => item.textContent?.includes("신호의 시작"));
    const ep2 = items.find((item) => item.textContent?.includes("안개가 짙어지면"));
    expect(ep1?.textContent).toContain("읽음");
    expect(ep2?.textContent).toContain("읽는 중 82%");
  });
});
