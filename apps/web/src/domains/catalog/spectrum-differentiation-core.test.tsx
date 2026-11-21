// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdaptationGraph } from "@/shared/components/adaptation-graph";
import { AvailabilityRouter } from "@/shared/components/availability";
import { LibraryView } from "@/shared/components/library-view";
import { PriceCompare } from "@/shared/components/price-compare";
import { PriceTransitionTimeline } from "@/shared/components/price-transition-timeline";
import { RankRow } from "@/shared/components/rank-row";
import { ReadStateSelector } from "@/shared/components/read-state";
import { ReviewTrustCard } from "@/shared/components/review-trust-card";
import { buildPricingTransitionsFromSnapshots } from "@/shared/lib/pricing-transition-timeline";
import { evaluateReaderEcosystemTrustIndex } from "@/shared/lib/reader-trust-ecosystem";
import { computeReviewTrustSummary } from "@/shared/lib/review-trust-engine";
import { useApp } from "@/shared/lib/store";
import { universeFor } from "@/shared/lib/title-universe";
import type { Title } from "@/shared/lib/types";

import { DiscoverTagTriggerFinderCard } from "./DiscoverHubEnhancementCards";

const apiFetchMock = vi.fn();
vi.mock("@/platform/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/platform/environment/use-app-config", () => ({
  useAppConfig: () => ({ showAvailability: true, showPricing: true, showSynopsis: true }),
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: () => undefined,
  useMetaRobots: () => undefined,
  usePageSocialMeta: () => undefined,
  useJsonLd: () => undefined,
}));

function makeTitle(overrides: Partial<Title> = {}): Title {
  return {
    id: "title-1",
    slug: "title-1",
    type: "webtoon",
    title: "재벌집 막내아들",
    author: "산경",
    genres: ["판타지", "드라마"],
    tags: ["회귀", "사이다"],
    synopsis: "재벌가 비서가 막내아들로 회귀해 판을 뒤집는다.",
    cover: ["oklch(0.6 0.15 45)", "oklch(0.3 0.08 70)"],
    status: "ongoing",
    ageRating: "15",
    releaseYear: 2024,
    updateDays: ["월", "목"],
    availability: [
      { platformId: "naver-webtoon", pricing: "wait-free", url: "https://comic.naver.com/test", isOriginal: true },
      { platformId: "ridi", pricing: "paid", url: "https://ridibooks.com/test" },
    ],
    stats: {
      views: 1_200_000,
      likes: 85_000,
      bookmarks: 42_000,
      ratingAvg: 4.8,
      ratingCount: 3_400,
      ratingDist: [20, 30, 120, 600, 2630],
      rankDelta: 2,
      trendingScore: 91,
      completionRate: 84,
      bingeIndex: 88,
    },
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  useApp.getState().resetAll();
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ items: [makeTitle({ id: "t-hiatus", slug: "t-hiatus", title: "휴재 대기 테스트작" })] }),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Spectrum 차별화 코어 카탈로그·공용 UI 검증 (AC-013)", () => {
  it("① 랭킹 행에서 '왜 이 순위?'를 펼치면 8축 산식 분해 패널이 열리고 축 전환 시 공식이 즉시 바뀐다", () => {
    const title = makeTitle();
    render(
      <MemoryRouter>
        <RankRow
          ranked={{ title, rank: 1, delta: 2, score: 94.2 }}
          axis="popular"
        />
      </MemoryRouter>,
    );

    const whyButton = screen.getByTestId("rank-row-why-btn");
    expect(screen.queryByTestId("rank-row-score-breakdown")).toBeNull();
    fireEvent.click(whyButton);

    const breakdown = screen.getByTestId("rank-row-score-breakdown");
    expect(breakdown).toBeTruthy();
    const axisTabs = within(breakdown).getByTestId("score-breakdown-axis-tabs");
    expect(axisTabs.querySelectorAll("button")).toHaveLength(8);

    fireEvent.click(within(breakdown).getByTestId("score-breakdown-axis-hidden"));
    expect(within(breakdown).getByTestId("score-breakdown-panel").getAttribute("data-axis")).toBe("hidden");
  });

  it("③ '어디서 봐' AvailabilityRouter와 PriceCompare가 무료/기다무 우선 정렬 및 정직한 모델 추정가(≈)를 표시한다", () => {
    const availability = [
      { platformId: "ridi" as const, pricing: "paid" as const, url: "https://ridibooks.com/a" },
      { platformId: "naver-webtoon" as const, pricing: "free" as const, url: "https://comic.naver.com/a" },
    ];
    render(
      <MemoryRouter>
        <AvailabilityRouter availability={availability} />
        <PriceCompare availability={availability} />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("availability-router-signal").textContent).toContain("무료로 바로 볼 수 있는");
    const links = screen.getAllByRole("link");
    expect(links[0]?.getAttribute("href")).toContain("/api/go/naver-webtoon");
    expect(screen.getAllByText(/≈300원/u).length).toBeGreaterThan(0);
  });

  it("⑤ ReadStateSelector와 LibraryView가 'hiatus(휴재 대기)' 상태를 저장·카운트·필터·리로드 복원한다", async () => {
    const first = render(
      <MemoryRouter initialEntries={["/library?tab=shelf&libraryRead=hiatus"]}>
        <ReadStateSelector titleId="t-hiatus" />
        <LibraryView initialTab="shelf" />
      </MemoryRouter>,
    );

    const hiatusBtn = screen.getByTestId("read-state-btn-hiatus");
    expect(hiatusBtn.textContent).toContain("휴재 대기");
    fireEvent.click(hiatusBtn);
    expect(useApp.getState().reads["t-hiatus"]).toBe("hiatus");

    // 언마운트 후 재마운트(리로드 복원 확인)
    first.unmount();
    render(
      <MemoryRouter initialEntries={["/library?tab=shelf&libraryRead=hiatus"]}>
        <ReadStateSelector titleId="t-hiatus" />
        <LibraryView initialTab="shelf" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("read-state-btn-hiatus").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("tab", { name: /휴재 대기 1/u })).toBeTruthy();
    expect(await screen.findByText("휴재 대기 테스트작")).toBeTruthy();
  });

  it("⑥ AdaptationGraph 결말 차이, PriceTransitionTimeline 스냅샷 diff, 키워드/트리거워닝 파인더, ReviewTrustCard+reader-trust-ecosystem 실연결을 검증한다", () => {
    const original = makeTitle({
      id: "orig-1",
      slug: "orig-1",
      type: "webnovel",
      status: "completed",
      stats: { ...makeTitle().stats, ratingAvg: 4.9 },
    });
    const webtoon = makeTitle({
      id: "wt-1",
      slug: "wt-1",
      type: "webtoon",
      status: "ongoing",
      stats: { ...makeTitle().stats, ratingAvg: 4.6 },
    });
    const media = universeFor(original).adaptations;

    const transitions = buildPricingTransitionsFromSnapshots([
      {
        observedAt: "2026-11-01T00:00:00.000Z",
        status: "ongoing",
        availability: [{ platformId: "naver-webtoon", pricing: "paid", url: "https://comic.naver.com/a" }],
      },
      {
        observedAt: "2026-11-15T00:00:00.000Z",
        status: "completed",
        availability: [{ platformId: "naver-webtoon", pricing: "free", url: "https://comic.naver.com/a" }],
      },
    ]);

    const reviewSummary = computeReviewTrustSummary([
      { id: "r1", rating: 5, createdAt: "2026-11-01", verifiedReader: true },
      { id: "r2", rating: 5, createdAt: "2026-11-02", verifiedReader: true },
      { id: "r3", rating: 4, createdAt: "2026-11-03", verifiedReader: true },
      { id: "r4", rating: 5, createdAt: "2026-11-04", verifiedReader: true },
      { id: "r5", rating: 4, createdAt: "2026-11-05", verifiedReader: true },
    ]);
    const ecosystem = evaluateReaderEcosystemTrustIndex({
      sealActive: true,
      tenStageVerified: true,
      spoilerShieldEnabled: true,
      triggerTagsDeclared: true,
      dyslexiaSafeTypography: true,
      tdmRepHeaderEnforced: true,
      piracyMatchDetected: false,
    });

    render(
      <MemoryRouter>
        <AdaptationGraph
          original={original}
          adaptations={[webtoon]}
          externalMedia={media}
          endingDiffs={{
            "wt-1": { status: "ongoing", summaryKo: "웹툰 각색이 원작 중반부를 연재 중입니다." },
          }}
        />
        <PriceTransitionTimeline events={transitions} />
        <DiscoverTagTriggerFinderCard />
        <ReviewTrustCard summary={reviewSummary} ecosystemIndex={ecosystem} />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("adaptation-version-comparison").textContent).toContain("결말 차이");
    expect(screen.getByTestId("adaptation-ending-diff-wt-1").textContent).toBe("연재·방영 중");
    expect(screen.getByTestId("adaptation-ending-diff-media-drama").textContent).toBe("결말 상이");

    const timeline = screen.getByTestId("price-transition-timeline");
    expect(timeline.textContent).toContain("무료 전환");
    expect(timeline.textContent).toContain("완결 전환");

    fireEvent.click(screen.getByRole("button", { name: "회귀·환생" }));
    fireEvent.click(screen.getByRole("button", { name: "고어·유혈 제외" }));
    const applyHref = screen.getByTestId("discover-tag-trigger-apply").getAttribute("href");
    expect(applyHref).toContain("finderTags=regression");
    expect(applyHref).toContain("excludeTriggers=tw-gore");

    expect(screen.getByTestId("review-trust-ecosystem-tier").textContent).toBe("플래티넘 클린 IP");
    expect(screen.getByTestId("review-trust-ecosystem-strip").textContent).toContain("100/100");
  });
});
