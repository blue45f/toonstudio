// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n-core";
import type { Title } from "@/shared/lib/types";

import type { DiscoverHomeSnapshot } from "./discover-home";
import { curateStoriesForMood } from "./discover-mood-curator";
import { DiscoverMoodTempoCurator } from "./DiscoverMoodTempoCurator";

function makeTitle(id: string, title: string, genres: string[], status: Title["status"], ratingAvg: number): Title {
  return {
    id,
    slug: `slug-${id}`,
    type: "webtoon",
    title,
    author: "작가",
    genres,
    tags: [],
    synopsis: "줄거리",
    cover: ["var(--color-accent)", "var(--color-cool)"],
    status,
    ageRating: "all",
    releaseYear: 2026,
    availability: [],
    stats: {
      views: 1000,
      likes: 100,
      bookmarks: 50,
      ratingAvg,
      ratingCount: 20,
      ratingDist: [0, 0, 0, 5, 15],
      rankDelta: 0,
      trendingScore: 10,
      completionRate: 80,
      bingeIndex: 80,
    },
  };
}

const SAMPLE_SNAPSHOT: DiscoverHomeSnapshot = {
  spotlight: makeTitle("t1", "봄비 아래 고백", ["로맨스", "드라마"], "ongoing", 4.8),
  featured: [
    makeTitle("t2", "철검의 귀환", ["액션", "판타지"], "completed", 4.9),
    makeTitle("t3", "골목길 고양이 빵집", ["일상", "힐링"], "ongoing", 4.7),
    makeTitle("t4", "자정의 밀실 기록", ["스릴러", "미스터리"], "completed", 4.85),
  ],
  topRated: [],
  waitFree: [],
  newest: [],
  todayDay: "금",
  todayReleases: [],
  genres: [],
  stats: { titles: 4, platforms: 2, genres: 4 },
  generatedAt: "2026-11-20T00:00:00.000Z",
};

beforeEach(() => {
  localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

describe("DiscoverMoodTempoCurator 무드×시간 큐레이터", () => {
  it("무드와 읽기 시간에 따라 실제 스냅샷 작품을 우선순위대로 매칭한다", () => {
    const thrillerBinge = curateStoriesForMood(SAMPLE_SNAPSHOT, {
      moodId: "thrill",
      tempoId: "binge-complete",
    });
    expect(thrillerBinge[0]?.title.id).toBe("t4");

    const ciderPick = curateStoriesForMood(SAMPLE_SNAPSHOT, {
      moodId: "cider",
      tempoId: "binge-complete",
    });
    expect(ciderPick[0]?.title.id).toBe("t2");
  });

  it("UI에서 무드·시간을 전환하면 매칭 카드가 즉시 바뀌고 로컬 저장소에서 복원된다", () => {
    const { unmount } = render(
      <MemoryRouter>
        <DiscoverMoodTempoCurator snapshot={SAMPLE_SNAPSHOT} loading={false} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("discover-mood-healing"));
    fireEvent.click(screen.getByTestId("discover-tempo-quick-5m"));

    expect(screen.getByTestId("discover-mood-healing").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("discover-mood-results").textContent).toContain("골목길 고양이 빵집");

    unmount();
    render(
      <MemoryRouter>
        <DiscoverMoodTempoCurator snapshot={SAMPLE_SNAPSHOT} loading={false} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("discover-mood-healing").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("discover-tempo-quick-5m").getAttribute("aria-pressed")).toBe("true");
  });

  it("스냅샷이 없을 때 가짜 작품을 만들지 않고 정직한 대체 안내와 탐색 링크를 표시한다", () => {
    render(
      <MemoryRouter>
        <DiscoverMoodTempoCurator snapshot={null} loading={false} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("discover-mood-empty")).toBeTruthy();
  });

  it("영문 로케일(en)에서 한글이 누출되지 않는다", () => {
    useI18n.setState({ lang: "en" });
    render(
      <MemoryRouter>
        <DiscoverMoodTempoCurator snapshot={null} loading={false} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("discover-mood-tempo-curator").textContent).not.toMatch(/[가-힣]/u);
  });
});
