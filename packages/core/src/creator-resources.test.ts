import { describe, expect, it } from "vitest";

import { parseResource } from "./creator-resources";

const baseWikimedia = {
  id: "wikimedia:%EA%B2%BD%EB%B3%B5%EA%B6%81",
  provider: "wikimedia",
  title: "경복궁 · 최근 30일 백과 조회",
  creator: "",
  description: "총 300회",
  sourceUrl: "https://ko.wikipedia.org/wiki/%EA%B2%BD%EB%B3%B5%EA%B6%81",
  credit: "Wikimedia Pageviews API · ko.wikipedia",
  license: "metadata-only",
  fetchedAt: "2026-09-25T00:00:00.000Z",
};

describe("parseResource dailyViews (일별 조회 시계열 계약)", () => {
  it("유효한 일별 시계열은 날짜·조회수 그대로 보존한다", () => {
    const parsed = parseResource({
      ...baseWikimedia,
      dailyViews: [
        { date: "2026-09-23", views: 120 },
        { date: "2026-09-24", views: 180 },
        { date: "2026-09-25", views: 0 },
      ],
    });
    expect(parsed?.dailyViews).toEqual([
      { date: "2026-09-23", views: 120 },
      { date: "2026-09-24", views: 180 },
      { date: "2026-09-25", views: 0 },
    ]);
  });

  it("dailyViews가 없는 기존 응답은 필드 없이 그대로 파싱된다", () => {
    const parsed = parseResource({ ...baseWikimedia });
    expect(parsed).not.toBeNull();
    expect(parsed?.dailyViews).toBeUndefined();
  });

  it("한 점이라도 깨지면 시계열 전체를 버리고 리소스 자체는 유지한다", () => {
    const broken: unknown[] = [
      [{ date: "2026-09-23", views: 120 }, { date: "2026-09-24", views: -1 }],
      [{ date: "2026-09-23", views: 120 }, { date: "2026-09-24", views: 1.5 }],
      [{ date: "2026-09-23", views: 120 }, { date: "2026-13-24", views: 10 }],
      [{ date: "2026-09-23", views: 120 }, { date: "2026-09-24", views: "180" }],
      [{ date: "2026-09-23", views: 120 }, { views: 180 }],
      "not-an-array",
      [],
    ];
    for (const dailyViews of broken) {
      const parsed = parseResource({ ...baseWikimedia, dailyViews });
      expect(parsed).not.toBeNull();
      expect(parsed?.dailyViews).toBeUndefined();
    }
  });

  it("날짜가 중복되거나 역순이면 시계열을 버린다", () => {
    const duplicated = parseResource({
      ...baseWikimedia,
      dailyViews: [
        { date: "2026-09-23", views: 120 },
        { date: "2026-09-23", views: 130 },
      ],
    });
    expect(duplicated?.dailyViews).toBeUndefined();
    const reversed = parseResource({
      ...baseWikimedia,
      dailyViews: [
        { date: "2026-09-24", views: 180 },
        { date: "2026-09-23", views: 120 },
      ],
    });
    expect(reversed?.dailyViews).toBeUndefined();
  });

  it("상한(366점)을 넘는 시계열은 버린다", () => {
    const tooMany = Array.from({ length: 367 }, (_, index) => {
      const day = new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10);
      return { date: day, views: 1 };
    });
    const parsed = parseResource({ ...baseWikimedia, dailyViews: tooMany });
    expect(parsed?.dailyViews).toBeUndefined();
  });
});
