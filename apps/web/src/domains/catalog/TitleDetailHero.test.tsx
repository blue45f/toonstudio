// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Title } from "@/shared/lib/types";

import { TitleDetailHero } from "./TitleDetailHero";

import { useI18n } from "@/shared/lib/i18n-core";
import { useApp } from "@/shared/lib/store";

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
    altTitles: ["Signal in the Fog"],
    author: "김작가",
    artist: "박화가",
    genres: ["미스터리", "스릴러"],
    tags: [],
    synopsis: "안개 낀 항구 도시에서 정체불명의 신호가 잡히기 시작한다.",
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

function renderHero(title: Title, firstEpisodeHref: string | null = "/title/fog-signal/read/1") {
  return render(
    <MemoryRouter>
      <TitleDetailHero
        title={title}
        reviewAvg={9.8}
        reviewCount={4210}
        estimated={false}
        showSynopsis
        firstEpisodeHref={firstEpisodeHref}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  useApp.setState({ reads: {} });
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLanguage });
});

describe("TitleDetailHero", () => {
  it("제목·작가·평점·장르·줄거리와 주 행동을 보여준다", () => {
    renderHero(makeTitle());
    expect(screen.getByRole("heading", { level: 1, name: "안개 속의 신호" })).toBeTruthy();
    expect(screen.getByText("Signal in the Fog")).toBeTruthy();
    expect(screen.getByRole("link", { name: "김작가" }).getAttribute("href")).toBe(
      "/author/%EA%B9%80%EC%9E%91%EA%B0%80",
    );
    expect(screen.getByText("9.8")).toBeTruthy();
    expect(screen.getByText("미스터리")).toBeTruthy();
    expect(screen.getByText(/안개 낀 항구 도시에서/)).toBeTruthy();
    const readLink = screen.getByRole("link", { name: /첫 화부터 읽기/ });
    expect(readLink.getAttribute("href")).toBe("/title/fog-signal/read/1");
  });

  it("서재에 담기는 읽기 상태를 토글하고 눌림 상태를 알린다", () => {
    renderHero(makeTitle());
    const saveButton = screen.getByRole("button", { name: /서재에 담기/ });
    expect(saveButton.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(saveButton);
    expect(useApp.getState().reads["title-1"]).toBe("want");
    const savedButton = screen.getByRole("button", { name: /서재에 담김/ });
    expect(savedButton.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(savedButton);
    expect(useApp.getState().reads["title-1"]).toBeUndefined();
  });

  it("이미 보는 중인 작품은 담김으로 표시하되 상태를 덮지 않는다", () => {
    useApp.setState({ reads: { "title-1": "reading" } });
    renderHero(makeTitle());
    const saveButton = screen.getByRole("button", { name: /서재에 담김/ });
    expect(saveButton.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(saveButton);
    expect(useApp.getState().reads["title-1"]).toBe("reading");
  });

  it("회차가 없다고 확정된 작품에서는 읽기 행동을 숨긴다", () => {
    renderHero(makeTitle(), null);
    expect(screen.queryByRole("link", { name: /첫 화부터 읽기/ })).toBeNull();
  });

  it("킬스위치가 꺼지면 줄거리를 그리지 않는다", () => {
    render(
      <MemoryRouter>
        <TitleDetailHero
          title={makeTitle()}
          reviewAvg={9.8}
          reviewCount={4210}
          estimated={false}
          showSynopsis={false}
          firstEpisodeHref="/title/fog-signal/read/1"
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/안개 낀 항구 도시에서/)).toBeNull();
  });
});
