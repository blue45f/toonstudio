// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useSearchParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseCatalogDiscoveryState } from "@/shared/lib/catalog-discovery-state";
import { useI18n } from "@/shared/lib/i18n-core";
import { useApp } from "@/shared/lib/store";
import { buildThreeCutRemixBlueprint } from "@/shared/lib/title-to-three-cut-remix-bridge";
import type { ReadState, Title } from "@/shared/lib/types";

import { CalendarTodayPulseRibbon } from "./CalendarTodayPulseRibbon";
import { LibraryReadingMomentumBar } from "./LibraryReadingMomentumBar";
import { SearchSmartIntentRibbon } from "./SearchSmartIntentRibbon";
import { TitleDetailQuickDecisionRibbon } from "./TitleDetailQuickDecisionRibbon";
import {
  buildCalendarTodayPulse,
  CALENDAR_WEEKDAY_SPECTRUM,
} from "./calendar-today-pulse-model";
import {
  buildLibraryFilterSearchParams,
  buildLibraryMomentumSummary,
} from "./library-momentum-model";
import {
  buildSearchIntentSearchParams,
  matchActiveSearchIntent,
  SEARCH_SMART_INTENTS,
} from "./search-smart-intent-model";
import { buildTitleQuickDecision } from "./title-detail-decision-model";

const initialLang = useI18n.getState().lang;

function sampleTitle(overrides: Partial<Title> = {}): Title {
  return {
    id: "title-alpha",
    slug: "chronicle-of-dawn",
    type: "webtoon",
    title: "새벽의 연대기",
    author: "김작가",
    genres: ["판타지", "액션"],
    tags: ["회빙환"],
    synopsis: "시간을 거슬러 오른 주인공의 이야기.",
    cover: ["oklch(0.3 0.05 260)", "oklch(0.2 0.03 240)"],
    status: "completed",
    ageRating: "12",
    releaseYear: 2025,
    totalEpisodes: 40,
    updateDays: ["수"],
    availability: [
      {
        platformId: "naver-webtoon",
        pricing: "free",
        isOriginal: true,
        url: "https://comic.naver.com/webtoon/list?titleId=100",
      },
    ],
    stats: {
      views: 12000,
      likes: 1200,
      bookmarks: 900,
      ratingAvg: 4.8,
      ratingCount: 300,
      ratingDist: [2, 3, 10, 45, 240],
      rankDelta: 2,
      trendingScore: 84,
      completionRate: 78,
      bingeIndex: 82,
    },
    ...overrides,
  };
}

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="test-location">{pathname}{search}</output>;
}

function SearchRibbonHarness() {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = parseCatalogDiscoveryState(searchParams);
  return (
    <>
      <SearchSmartIntentRibbon
        searchParams={searchParams}
        state={state}
        onApplyParams={(next) => setSearchParams(next, { replace: false, preventScrollReset: true })}
      />
      <LocationProbe />
    </>
  );
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  useApp.setState({ reads: {}, recentlyViewed: [] });
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLang });
  useApp.setState({ reads: {}, recentlyViewed: [] });
  vi.restoreAllMocks();
});

describe("Wave 4 #1: /title/:slug 3초 작품 결정 & 페이스 리본", () => {
  it("실제 회차 수 기반 3분 추정 완독 시간, 페이스 전환, 1화 읽기·3컷 리믹스 브리지를 제공한다", () => {
    const title = sampleTitle({ totalEpisodes: 40, status: "completed" });
    const remixBlueprint = buildThreeCutRemixBlueprint({ slug: title.slug, genres: title.genres });

    const model = buildTitleQuickDecision({
      title,
      episodes: [{ number: 1, title: "1화", status: "published" }],
      showAvailability: true,
      firstEpisodeHref: "/title/chronicle-of-dawn/read/1",
      remixBlueprint,
    });
    expect(model.episodeCount).toBe(40);
    expect(model.estimatedMinutes).toBe(120);
    expect(model.durationLabelKo).toBe("약 2시간 (추정)");
    expect(model.recommendedPaceId).toBe("weekend-binge");

    render(
      <MemoryRouter>
        <TitleDetailQuickDecisionRibbon
          title={title}
          episodes={[{ number: 1, title: "1화", status: "published" }]}
          showAvailability
          firstEpisodeHref="/title/chronicle-of-dawn/read/1"
          remixBlueprint={remixBlueprint}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("title-decision-duration").textContent).toContain("약 2시간 (추정)");
    expect(screen.getByTestId("title-decision-free-badge").textContent).toContain("무료 회차 시작 가능");
    expect(screen.getByTestId("title-pace-option-weekend-binge").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("title-decision-pace-summary").textContent).toContain("주말 약 2시간");

    fireEvent.click(screen.getByTestId("title-pace-option-commute-10m"));
    expect(screen.getByTestId("title-pace-option-commute-10m").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("title-decision-pace-summary").textContent).toContain("출퇴근 14회");

    expect(screen.getByTestId("title-decision-read-first").getAttribute("href")).toBe(
      "/title/chronicle-of-dawn/read/1",
    );
    expect(screen.getByTestId("title-decision-three-cut-remix").getAttribute("href")).toBe(
      remixBlueprint.studioLaunchHref,
    );
  });

  it("회차 수가 미공개인 작품은 수치를 지어내지 않고 정직한 추정 기준과 안전한 1화 이동을 제공한다", () => {
    const title = sampleTitle({
      totalEpisodes: undefined,
      status: "ongoing",
      availability: [{ platformId: "kakao-page", pricing: "wait-free", url: "https://page.kakao.com/content/1" }],
    });
    const remixBlueprint = buildThreeCutRemixBlueprint({ slug: title.slug, genres: title.genres });

    useI18n.setState({ lang: "en" });
    render(
      <MemoryRouter>
        <TitleDetailQuickDecisionRibbon
          title={title}
          showAvailability
          firstEpisodeHref={null}
          remixBlueprint={remixBlueprint}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("title-decision-duration").textContent).toContain("3m/ep baseline (est.)");
    expect(screen.getByTestId("title-decision-free-badge").textContent).toContain("Wait-free entry");
    expect(screen.getByTestId("title-pace-option-commute-10m").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("title-decision-read-first").getAttribute("href")).toContain("/api/go/kakao-page");
  });
});

describe("Wave 4 #2: /search 제로-막막함 6종 스마트 의도 칩 바", () => {
  it("6종 의도 칩을 클릭하면 실제 검색어·필터 URL 파라미터를 채우고 재클릭 시 해제한다", () => {
    expect(SEARCH_SMART_INTENTS).toHaveLength(6);

    render(
      <MemoryRouter initialEntries={["/search?utm_source=hero"]}>
        <SearchRibbonHarness />
      </MemoryRouter>,
    );

    const actionChip = screen.getByTestId("search-intent-chip-regression-action");
    expect(actionChip.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(actionChip);

    const afterAction = new URL(
      screen.getByTestId("test-location").textContent ?? "",
      "https://example.test",
    );
    expect(afterAction.searchParams.get("q")).toBe("회귀");
    expect(afterAction.searchParams.get("genres")).toBe("액션");
    expect(afterAction.searchParams.get("utm_source")).toBe("hero");
    expect(actionChip.getAttribute("aria-pressed")).toBe("true");

    const freeChip = screen.getByTestId("search-intent-chip-free-start");
    fireEvent.click(freeChip);
    const afterFree = new URL(
      screen.getByTestId("test-location").textContent ?? "",
      "https://example.test",
    );
    expect(afterFree.searchParams.get("pricing")).toBe("free,wait-free");
    expect(afterFree.searchParams.has("q")).toBe(false);
    expect(freeChip.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("search-smart-intent-clear"));
    const afterClear = new URL(
      screen.getByTestId("test-location").textContent ?? "",
      "https://example.test",
    );
    expect(afterClear.searchParams.has("pricing")).toBe(false);
    expect(afterClear.searchParams.get("utm_source")).toBe("hero");
  });

  it("모든 6종 의도 칩의 생성 URL이 역파싱 시 자기 자신으로 매칭된다", () => {
    for (const intent of SEARCH_SMART_INTENTS) {
      const params = buildSearchIntentSearchParams(new URLSearchParams(), intent);
      const state = parseCatalogDiscoveryState(params);
      expect(matchActiveSearchIntent(state)).toBe(intent.id);
    }
  });

  it("영어 로케일에서도 6종 의도 칩과 안내 문구를 영문으로 표시한다", () => {
    useI18n.setState({ lang: "en" });
    render(
      <MemoryRouter initialEntries={["/search"]}>
        <SearchRibbonHarness />
      </MemoryRouter>,
    );
    expect(screen.getByText("One-tap mood & genre search")).toBeTruthy();
    expect(screen.getByTestId("search-intent-chip-free-start").textContent).toContain("Start free now");
  });
});

describe("Wave 4 #3: /library 읽기 모멘텀 & 완독 마라톤 바", () => {
  it("빈 서재에서는 가짜 수치 없이 0%와 /discover·/random 원클릭 이동을 제공한다", () => {
    const emptySummary = buildLibraryMomentumSummary({ reads: {}, recentlyViewed: [] });
    expect(emptySummary.isEmpty).toBe(true);
    expect(emptySummary.completionPercent).toBe(0);
    expect(emptySummary.counts.totalTracked).toBe(0);

    render(
      <MemoryRouter initialEntries={["/library"]}>
        <LibraryReadingMomentumBar />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("library-momentum-ratio").textContent).toContain("0%");
    expect(screen.getByTestId("library-momentum-ratio").textContent).toContain("(0/0)");
    expect(screen.getByTestId("library-empty-discover-link").getAttribute("href")).toBe("/discover");
    expect(screen.getByTestId("library-empty-random-link").getAttribute("href")).toBe("/random");
  });

  it("실제 서재 상태 카운트로 완독률, 오늘 이어 볼 1편, 1탭 상태 필터 전환을 제공한다", () => {
    const reads: Record<string, ReadState> = {
      "t-reading-1": "reading",
      "t-reading-2": "reading",
      "t-want-1": "want",
      "t-done-1": "done",
      "t-hiatus-1": "hiatus",
    };
    useApp.setState({ reads, recentlyViewed: ["t-reading-2", "t-want-1"] });

    expect(buildLibraryFilterSearchParams("?tab=rated", "reading")).toBe("?tab=shelf&libraryRead=reading");

    render(
      <MemoryRouter initialEntries={["/library?tab=shelf&libraryRead=want"]}>
        <LibraryReadingMomentumBar
          titlesById={{
            "t-reading-2": {
              id: "t-reading-2",
              slug: "night-blade",
              title: "밤의 검객",
              genres: ["액션"],
              status: "ongoing",
            },
          }}
        />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("library-momentum-ratio").textContent).toContain("20%");
    expect(screen.getByTestId("library-momentum-ratio").textContent).toContain("(1/5)");
    expect(screen.getByTestId("library-momentum-continue-card").textContent).toContain("밤의 검객");
    expect(screen.getByTestId("library-continue-title-link").getAttribute("href")).toBe("/title/night-blade");

    const readingBtn = screen.getByTestId("library-momentum-filter-reading");
    expect(readingBtn.textContent).toContain("2");
    fireEvent.click(readingBtn);
    expect(screen.getByTestId("test-location").textContent).toBe("/library?tab=shelf&libraryRead=reading");
    expect(readingBtn.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("Wave 4 #4: /calendar 오늘의 연재 펄스 & 7요일 OKLCH 컬러 리본", () => {
  it("KST 오늘 점프, 내 서재만 보기 토글, 7요일 OKLCH 리듬 스트립 선택을 제공한다", () => {
    const rawDays = CALENDAR_WEEKDAY_SPECTRUM.map((spec, idx) => ({
      day: spec.day,
      items:
        idx === 0
          ? [{ id: "mon-1" }]
          : idx === 2
            ? [{ id: "wed-1" }, { id: "wed-2" }]
            : idx === 4
              ? [{ id: "fri-1" }, { id: "fri-2" }, { id: "fri-3" }]
              : [],
    }));
    const savedIds = new Set(["wed-2", "fri-1"]);
    const onSelectDay = vi.fn();
    const onJumpToToday = vi.fn();
    const onToggleSavedOnly = vi.fn();

    const model = buildCalendarTodayPulse({
      days: rawDays,
      rawDays,
      todayIdx: 2,
      selectedDayIdx: 0,
      savedIds,
      savedOnly: false,
    });
    expect(model.todayLabelKo).toBe("수요일");
    expect(model.todayCount).toBe(2);
    expect(model.savedTodayCount).toBe(1);
    expect(model.savedWeekCount).toBe(2);
    expect(model.daySlots).toHaveLength(7);
    expect(model.daySlots.every((slot) => slot.toneOklch.startsWith("oklch("))).toBe(true);

    render(
      <CalendarTodayPulseRibbon
        days={rawDays}
        rawDays={rawDays}
        todayIdx={2}
        selectedDayIdx={0}
        savedIds={savedIds}
        savedOnly={false}
        onSelectDay={onSelectDay}
        onJumpToToday={onJumpToToday}
        onToggleSavedOnly={onToggleSavedOnly}
      />,
    );

    expect(screen.getByTestId("calendar-today-pulse-summary").textContent).toContain("수요일 새 회차 2편");
    expect(screen.getByTestId("calendar-today-pulse-summary").textContent).toContain("내 서재 1편");
    expect(screen.queryAllByRole("tab")).toHaveLength(0);

    fireEvent.click(screen.getByTestId("calendar-pulse-today-jump"));
    expect(onJumpToToday).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("calendar-pulse-saved-only-toggle"));
    expect(onToggleSavedOnly).toHaveBeenCalledTimes(1);

    const rail = screen.getByTestId("calendar-weekday-rhythm-rail");
    expect(within(rail).getAllByRole("button")).toHaveLength(7);
    fireEvent.click(screen.getByTestId("calendar-rhythm-day-4"));
    expect(onSelectDay).toHaveBeenCalledWith(4);
  });

  it("영어 로케일에서도 KST 오늘 펄스와 7요일 약어·서재 토글을 영문으로 표시한다", () => {
    useI18n.setState({ lang: "en" });
    const rawDays = CALENDAR_WEEKDAY_SPECTRUM.map((spec) => ({ day: spec.day, items: [] }));
    render(
      <CalendarTodayPulseRibbon
        days={rawDays}
        rawDays={rawDays}
        todayIdx={2}
        selectedDayIdx={2}
        savedIds={new Set()}
        savedOnly={false}
        onSelectDay={vi.fn()}
        onJumpToToday={vi.fn()}
        onToggleSavedOnly={vi.fn()}
      />,
    );
    expect(screen.getByTestId("calendar-today-pulse-summary").textContent).toContain("KST Wednesday");
    expect(screen.getByTestId("calendar-pulse-saved-only-toggle").textContent).toContain("My library titles only");
    expect(screen.getByTestId("calendar-rhythm-day-2").textContent).toContain("Wed");
  });
});

describe("Wave 4 품질 가드레일 (CSS OKLCH · reduced-motion · 금지 규칙 0건)", () => {
  it("신규 CSS와 컴포넌트에 하드코딩 HEX, transition-all, 금지 모션, any가 없다", () => {
    const css = readFileSync(resolve(import.meta.dirname, "catalog-wave4-fresh-ideas.css"), "utf8");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toContain("transition: all");
    expect(css).not.toContain("transition-all");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("scroll-snap-type: x mandatory");
    expect(css).toContain(':root[data-design-theme="contrast"]');
    expect(css).toContain("@media (forced-colors: active)");

    const componentFiles = [
      "TitleDetailQuickDecisionRibbon.tsx",
      "SearchSmartIntentRibbon.tsx",
      "LibraryReadingMomentumBar.tsx",
      "CalendarTodayPulseRibbon.tsx",
    ];
    for (const fileName of componentFiles) {
      const src = readFileSync(resolve(import.meta.dirname, fileName), "utf8");
      expect(src, fileName).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, fileName).not.toContain("transition-all");
      expect(src, fileName).not.toMatch(/\banimate-(?:bounce|ping|spin)\b/);
      expect(src, fileName).not.toContain("@ts-nocheck");
      expect(src, fileName).not.toMatch(/:\s*any\b|\bas\s+any\b/);
      expect(src.split("\n").length, fileName).toBeLessThanOrEqual(800);
    }
  });
});
