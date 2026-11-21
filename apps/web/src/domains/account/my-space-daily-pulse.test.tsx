// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { buildMySpaceDailyPulse } from "./my-space-daily-pulse";
import { MySpaceDailyPulseRibbon } from "./MySpaceDailyPulseRibbon";

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
  useI18n.getState().setLang("ko");
});

describe("my-space-daily-pulse 순수 모델 (가짜 통계 0건)", () => {
  it("신규 게스트(기록 0건)에게는 첫 10분 샘플을 안내하고 3대 영역 모두 솔직하게 기록 없음을 표시한다", () => {
    const pulse = buildMySpaceDailyPulse({
      hydrated: true,
      readsCount: 0,
      ratingsCount: 0,
      collectionsCount: 0,
      recentEntries: [],
      sessionStatus: "unauthenticated",
      activeCategory: "all",
    });

    expect(pulse.topAction.kind).toBe("start-sample");
    expect(pulse.topAction.href).toBe("/production/projects/sample-project/overview");
    expect(pulse.totalObservedSignals).toBe(0);
    expect(pulse.recommendedRole).toBe("creator");
    for (const domain of pulse.domains) {
      expect(domain.hasActivity).toBe(false);
      expect(domain.count).toBe(0);
      expect(domain.barRatio).toBe(0);
      expect(domain.summaryKo).toBe("아직 기록 없음 · 지금 시작");
    }
  });

  it("최근 스튜디오 방문이 있으면 스튜디오 이어가기를 1순위로, 창작 집중을 추천한다", () => {
    const pulse = buildMySpaceDailyPulse({
      hydrated: true,
      readsCount: 2,
      ratingsCount: 1,
      collectionsCount: 1,
      recentEntries: [
        { id: "studio", href: "/studio/p/proj-1/d/doc-1?resume=latest", visitedAt: 1_760_000_000_000 },
        { id: "market", href: "/market", visitedAt: 1_759_999_000_000 },
      ],
      sessionStatus: "authenticated",
      activeCategory: "creator",
    });

    expect(pulse.topAction.kind).toBe("resume-studio");
    expect(pulse.topAction.href).toBe("/studio/p/proj-1/d/doc-1?resume=latest");
    expect(pulse.recommendedRole).toBe("creator");
    expect(pulse.domains[0].summaryKo).toBe("서재 기록 4건");
    expect(pulse.domains[1].summaryKo).toBe("최근 창작 이동 2곳");
    expect(pulse.domains[1].isActiveFilter).toBe(true);
    expect(pulse.domains[2].summaryKo).toBe("계정 동기화 연결됨");
  });

  it("스튜디오 방문 없이 서재 기록만 있으면 서재 확인을 1순위로, 독자 집중을 추천한다", () => {
    const pulse = buildMySpaceDailyPulse({
      hydrated: true,
      readsCount: 3,
      ratingsCount: 0,
      collectionsCount: 2,
      recentEntries: [],
      sessionStatus: "unauthenticated",
      activeCategory: "all",
    });

    expect(pulse.topAction.kind).toBe("check-library");
    expect(pulse.topAction.href).toBe("/library");
    expect(pulse.recommendedRole).toBe("reader");
    expect(pulse.domains[0].isRecommended).toBe(true);
    expect(pulse.domains[0].count).toBe(5);
    expect(pulse.domains[1].summaryKo).toBe("아직 기록 없음 · 지금 시작");
  });

  it("로그인 상태이나 기록이 0건이면 계정·AI 점검 모드를 추천하고, 미하이드레이션 상태는 불러오는 중으로 표시한다", () => {
    const signedInEmpty = buildMySpaceDailyPulse({
      hydrated: true,
      readsCount: 0,
      ratingsCount: 0,
      collectionsCount: 0,
      recentEntries: [],
      sessionStatus: "authenticated",
      activeCategory: "all",
    });
    expect(signedInEmpty.recommendedRole).toBe("account");
    expect(signedInEmpty.domains[2].hasActivity).toBe(true);

    const loading = buildMySpaceDailyPulse({
      hydrated: false,
      readsCount: 9,
      ratingsCount: 9,
      collectionsCount: 9,
      recentEntries: [],
      sessionStatus: "loading",
      activeCategory: "all",
    });
    expect(loading.domains[0].count).toBe(0);
    expect(loading.domains[0].summaryKo).toBe("불러오는 중");
  });
});

describe("MySpaceDailyPulseRibbon UI", () => {
  it("3개 1탭 모드 버튼(44px 터치 타깃)이 역할 필터 전환과 재클릭 해제(all)를 수행한다", () => {
    const onSelectCategory = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <MySpaceDailyPulseRibbon
          hydrated
          readsCount={0}
          ratingsCount={0}
          collectionsCount={0}
          recentEntries={[]}
          sessionStatus="unauthenticated"
          activeCategory="all"
          onSelectCategory={onSelectCategory}
        />
      </MemoryRouter>,
    );

    const readerBtn = screen.getByTestId("my-space-pulse-mode-reader");
    const creatorBtn = screen.getByTestId("my-space-pulse-mode-creator");
    const accountBtn = screen.getByTestId("my-space-pulse-mode-account");

    for (const button of [readerBtn, creatorBtn, accountBtn]) {
      expect(button.className).toContain("min-h-11");
      expect(button.getAttribute("aria-pressed")).toBe("false");
    }

    expect(screen.getByTestId("my-space-pulse-top-cta").getAttribute("href")).toBe(
      "/production/projects/sample-project/overview",
    );

    fireEvent.click(readerBtn);
    expect(onSelectCategory).toHaveBeenLastCalledWith("reader");

    rerender(
      <MemoryRouter>
        <MySpaceDailyPulseRibbon
          hydrated
          readsCount={0}
          ratingsCount={0}
          collectionsCount={0}
          recentEntries={[]}
          sessionStatus="unauthenticated"
          activeCategory="reader"
          onSelectCategory={onSelectCategory}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("my-space-pulse-mode-reader").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("my-space-pulse-mode-reader"));
    expect(onSelectCategory).toHaveBeenLastCalledWith("all");
  });

  it("영문 로케일(en)에서 한글이 누출되지 않는다", () => {
    useI18n.getState().setLang("en");
    render(
      <MemoryRouter>
        <MySpaceDailyPulseRibbon
          hydrated
          readsCount={2}
          ratingsCount={1}
          collectionsCount={1}
          recentEntries={[{ id: "studio", href: "/studio/p/p1/d/d1?resume=latest", visitedAt: 1_760_000_000_000 }]}
          sessionStatus="authenticated"
          activeCategory="all"
          onSelectCategory={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("my-space-daily-pulse-ribbon").textContent).not.toMatch(/[가-힣]/u);
  });
});
