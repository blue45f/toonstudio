// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Title } from "@/shared/lib/types";

import { TitleEpisodeSection } from "./TitleEpisodeSection";
import type { TitleEpisode } from "./title-episodes";

import { useI18n } from "@/shared/lib/i18n-core";

const appConfigState = vi.hoisted(() => ({ showAvailability: true }));

vi.mock("@/platform/environment/use-app-config", () => ({
  useAppConfig: () => ({
    monetizationEnabled: false,
    showCovers: true,
    showPricing: true,
    showAvailability: appConfigState.showAvailability,
    showSynopsis: true,
    showRelatedInfo: true,
    loading: false,
  }),
}));

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
  appConfigState.showAvailability = true;
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
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href") ?? "");
    expect(hrefs.some((href) => href.includes("/read/"))).toBe(false);
  });

  it("총 회차 수가 메타에 있으면 빈 상태에도 총수를 표기한다", () => {
    renderSection(makeTitle({ totalEpisodes: 128 }));
    expect(screen.getByText("총 128화")).toBeTruthy();
  });

  it("빈 배열([])도 빈 <ol>이 아니라 빈 상태 안내를 그린다", () => {
    renderSection(makeTitle(), []);
    expect(screen.getByTestId("title-episodes-empty")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText("회차별 목록은 아직 제공되지 않아요")).toBeTruthy();
  });
});

describe("TitleEpisodeSection — 빈 상태의 외부 플랫폼 안내 (D-9)", () => {
  const NAVER_URL = "https://comic.naver.com/webtoon/list?titleId=123";

  it("연재처 URL이 있으면 빈 상태 안에 외부 플랫폼 버튼이 직접 이어진다", () => {
    renderSection(
      makeTitle({
        availability: [{ platformId: "naver-webtoon", pricing: "free", url: NAVER_URL }],
      }),
    );
    expect(screen.getByText("외부 플랫폼에서 보기")).toBeTruthy();
    const cta = screen.getByRole("link", { name: "네이버 웹툰에서 보기 (새 탭)" });
    expect(cta.getAttribute("href")).toBe(
      `/api/go/naver-webtoon?to=${encodeURIComponent(NAVER_URL)}`,
    );
    expect(cta.getAttribute("target")).toBe("_blank");
    expect(cta.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText("무료 공개")).toBeTruthy();
  });

  it("플랫폼이 4곳을 넘으면 앞 3곳만 버튼으로, 나머지는 상세 플랫폼 안내 앵커로 잇는다", () => {
    renderSection(
      makeTitle({
        availability: [
          { platformId: "munpia", pricing: "paid", url: "https://novel.munpia.com/1" },
          { platformId: "ridi", pricing: "paid", url: "https://ridibooks.com/books/1" },
          { platformId: "lezhin", pricing: "subscription", url: "https://www.lezhin.com/ko/comic/x" },
          { platformId: "kakao-page", pricing: "wait-free", url: "https://page.kakao.com/content/1" },
          { platformId: "naver-webtoon", pricing: "free", url: NAVER_URL },
        ],
      }),
    );
    // 무료 → 기다무 → 구독 순으로 앞 3곳
    expect(screen.getByRole("link", { name: "네이버 웹툰에서 보기 (새 탭)" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "카카오페이지에서 보기 (새 탭)" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "레진코믹스에서 보기 (새 탭)" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /리디에서 보기/ })).toBeNull();
    const more = screen.getByRole("link", { name: "다른 플랫폼 2곳 더 보기" });
    expect(more.getAttribute("href")).toBe("#title-availability");
  });

  it("연재처는 알지만 URL이 없으면 링크를 지어내지 않고 준비 중 + 내부 동선을 제공한다", () => {
    renderSection(
      makeTitle({ availability: [{ platformId: "naver-webtoon", pricing: "free" }] }),
    );
    expect(screen.getByText("외부 플랫폼에서 보기")).toBeTruthy();
    expect(screen.getByText(/네이버 웹툰/)).toBeTruthy();
    expect(screen.getByText("링크 준비 중")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /네이버 웹툰에서 보기/ })).toBeNull();
    // 막다른 화면이 되지 않게 내부 동선은 항상 있다
    expect(
      screen.getByRole("link", { name: "김작가의 다른 작품" }).getAttribute("href"),
    ).toBe(`/author/${encodeURIComponent("김작가")}`);
    expect(screen.getByRole("link", { name: "비슷한 작품 탐색하기" }).getAttribute("href")).toBe(
      "/explore",
    );
  });

  it("플랫폼 정보가 전혀 없어도 내부 동선으로 흐름이 이어진다", () => {
    renderSection(makeTitle({ availability: [] }));
    expect(screen.getByText("아직 연결된 연재 플랫폼이 없어요.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "비슷한 작품 탐색하기" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "김작가의 다른 작품" })).toBeTruthy();
  });

  it("플랫폼 노출 킬스위치가 꺼져 있으면 외부 링크·플랫폼명을 빈 상태에도 노출하지 않는다", () => {
    appConfigState.showAvailability = false;
    renderSection(
      makeTitle({
        availability: [{ platformId: "naver-webtoon", pricing: "free", url: NAVER_URL }],
      }),
    );
    expect(screen.queryByRole("link", { name: /네이버 웹툰에서 보기/ })).toBeNull();
    expect(screen.queryByText(/네이버 웹툰/)).toBeNull();
    expect(screen.getByRole("link", { name: "비슷한 작품 탐색하기" })).toBeTruthy();
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
    expect(screen.getByTestId("episodes-binge-estimate").textContent).toContain("예상 정주행 약 12분");

    const searchInput = screen.getByTestId("episodes-search-input");
    fireEvent.change(searchInput, { target: { value: "마지막" } });
    const filteredItems = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(filteredItems).toHaveLength(1);
    expect(filteredItems[0]?.textContent).toContain("마지막 전파");
  });
});

