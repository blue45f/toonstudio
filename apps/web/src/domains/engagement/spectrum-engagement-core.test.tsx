// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Title } from "@/shared/lib/types";

import { AvailabilityHistoryPanel } from "./AvailabilityHistoryPanel";
import { useEngagement } from "./engagement-store";
import { NotificationCenterPage } from "./NotificationCenterPage";
import { PublicCollectionPage } from "./PublicCollectionPage";
import { encodePublicCollectionSnapshot } from "./public-list-share";
import { TasteOnboardingPage } from "./TasteOnboardingPage";

const apiFetchMock = vi.fn();
vi.mock("@/platform/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: () => undefined,
  useMetaRobots: () => undefined,
  usePageSocialMeta: () => undefined,
}));

function makeTitle(overrides: Partial<Title> = {}): Title {
  return {
    id: "title-eng-1",
    slug: "title-eng-1",
    type: "webtoon",
    title: "복귀 전설",
    author: "테스트 작가",
    genres: ["판타지"],
    tags: ["회귀"],
    synopsis: "회귀 판타지 테스트 작품",
    cover: ["oklch(0.6 0.15 45)", "oklch(0.3 0.08 70)"],
    status: "ongoing",
    ageRating: "all",
    releaseYear: 2025,
    updateDays: ["월"],
    availability: [
      { platformId: "naver-webtoon", pricing: "paid", url: "https://comic.naver.com/test" },
    ],
    stats: {
      views: 500_000,
      likes: 20_000,
      bookmarks: 15_000,
      ratingAvg: 4.7,
      ratingCount: 900,
      ratingDist: [10, 20, 50, 220, 600],
      rankDelta: 1,
      trendingScore: 80,
      completionRate: 78,
      bingeIndex: 82,
    },
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  useEngagement.getState().resetEngagementData();
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      items: [
        makeTitle({ id: "t-reg", slug: "t-reg", title: "회귀 아카데미", genres: ["판타지"], tags: ["회귀"] }),
        makeTitle({ id: "t-horror", slug: "t-horror", title: "공포 괴담집", genres: ["판타지"], tags: ["공포"] }),
        makeTitle({ id: "t-rom", slug: "t-rom", title: "다정 로맨스", genres: ["로맨스"], tags: ["힐링"] }),
      ],
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Spectrum 차별화 코어 인게이지먼트 검증 (AC-013 ②·④·⑤·⑥)", () => {
  it("② 5문항 취향 테스트 온보딩에서 전개 코드·회피 태그 필터가 추천 미리보기에 실제 반영된다", async () => {
    render(
      <MemoryRouter initialEntries={["/onboarding/taste"]}>
        <Routes>
          <Route path="/onboarding/taste" element={<TasteOnboardingPage />} />
          <Route path="/recommend" element={<div>추천 도착</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "판타지" }));
    fireEvent.click(screen.getByRole("button", { name: "로맨스" }));
    fireEvent.click(screen.getByRole("button", { name: "#회귀·환생" }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));

    fireEvent.click(await screen.findByRole("button", { name: /다음/ }));
    fireEvent.click(await screen.findByRole("button", { name: "공포" }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));

    expect(await screen.findByText("회귀 아카데미")).toBeTruthy();
    expect(screen.queryByText("공포 괴담집")).toBeNull();
  });

  it("④ 휴재에서 연재중으로 바뀐 작품은 휴재 복귀 알림을 생성해 알림 센터에 배지와 함께 표시된다", () => {
    const hiatusTitle = makeTitle({ id: "t-resume", slug: "t-resume", title: "복귀 전설", status: "hiatus" });
    const ongoingTitle = makeTitle({ id: "t-resume", slug: "t-resume", title: "복귀 전설", status: "ongoing" });

    useEngagement.getState().observeAvailability(hiatusTitle, "2026-11-10T00:00:00.000Z");
    useEngagement.getState().observeAvailability(ongoingTitle, "2026-11-21T01:00:00.000Z");

    render(
      <MemoryRouter initialEntries={["/notifications"]}>
        <NotificationCenterPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/복귀 전설 휴재 복귀/u)).toBeTruthy();
    expect(screen.getByTestId("notification-hiatus-resume-badge").textContent).toBe("휴재 복귀");
  });

  it("⑤ PublicCollectionPage가 공개 스냅샷 URL을 검증해 제목·링크·복제 동작을 제공한다", async () => {
    const token = encodePublicCollectionSnapshot({
      version: 1,
      name: "주말 정주행 명작",
      emoji: "bookmark",
      description: "테스트 공개 컬렉션",
      titleIds: ["t-reg"],
      createdAt: "2026-11-21T00:00:00.000Z",
    });
    render(
      <MemoryRouter initialEntries={[`/lists/weekend?snapshot=${encodeURIComponent(token)}`]}>
        <Routes>
          <Route path="/lists/:slug" element={<PublicCollectionPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "주말 정주행 명작" })).toBeTruthy();
    expect(screen.getByTestId("public-collection-share-url").textContent).toContain("/lists/");
    expect(screen.getByTestId("public-collection-share-url").textContent).toContain("snapshot=");
  });

  it("⑥ AvailabilityHistoryPanel이 스냅샷 가격 변동(유료→무료) 하이라이트 배지를 표시한다", () => {
    const paidTitle = makeTitle({
      id: "t-free-conv",
      availability: [{ platformId: "naver-webtoon", pricing: "paid", url: "https://comic.naver.com/a" }],
    });
    const freeTitle = makeTitle({
      id: "t-free-conv",
      availability: [{ platformId: "naver-webtoon", pricing: "free", url: "https://comic.naver.com/a" }],
    });
    useEngagement.getState().observeAvailability(paidTitle, "2026-11-01T00:00:00.000Z");
    useEngagement.getState().observeAvailability(freeTitle, "2026-11-18T00:00:00.000Z");

    render(<AvailabilityHistoryPanel title={freeTitle} />);
    expect(screen.getByTestId("availability-history-pricing-highlights").textContent).toContain(
      "건별 유료 → 완전 무료",
    );
  });
});
