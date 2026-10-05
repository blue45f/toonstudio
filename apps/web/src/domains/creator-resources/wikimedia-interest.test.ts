import { describe, expect, it } from "vitest";

import { buildTrendBars, formatDateLabel, formatViews, summarizeDailyViews } from "./wikimedia-interest";

import type { ResourceDailyViews } from "@/shared/lib/creator-resources";

const points = (views: number[]): ResourceDailyViews[] =>
  views.map((value, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, "0")}`,
    views: value,
  }));

describe("summarizeDailyViews", () => {
  it("빈 시계열이면 요약을 만들지 않는다", () => {
    expect(summarizeDailyViews([])).toBeNull();
  });

  it("총합·일평균·최고일·기간을 같은 시계열에서 계산한다", () => {
    const summary = summarizeDailyViews(points([120, 180, 90, 300]));
    expect(summary?.total).toBe(690);
    expect(summary?.average).toBe(173);
    expect(summary?.peak).toEqual({ date: "2026-09-04", views: 300 });
    expect(summary?.start).toBe("2026-09-01");
    expect(summary?.end).toBe("2026-09-04");
    expect(summary?.days).toBe(4);
  });

  it("전반부 대비 후반부 증감률을 같은 길이끼리 비교한다", () => {
    // 전반 2일 합 200, 후반 2일 합 300 → +50%
    const summary = summarizeDailyViews(points([100, 100, 150, 150]));
    expect(summary?.changePct).toBe(50);
    expect(summary?.halfDays).toBe(2);
  });

  it("홀수 길이면 가운데 하루를 비교에서 제외한다", () => {
    // 가운데 999를 빼고 전반 100 vs 후반 200 → +100%
    const summary = summarizeDailyViews(points([100, 999, 200]));
    expect(summary?.changePct).toBe(100);
    expect(summary?.halfDays).toBe(1);
  });

  it("이전 기간이 0이면 증감률을 지어내지 않는다", () => {
    const summary = summarizeDailyViews(points([0, 0, 120, 180]));
    expect(summary?.changePct).toBeNull();
  });

  it("하루짜리 시계열은 비교 없이 요약만 만든다", () => {
    const summary = summarizeDailyViews(points([42]));
    expect(summary?.total).toBe(42);
    expect(summary?.changePct).toBeNull();
  });
});

describe("buildTrendBars", () => {
  it("높이는 최고일 대비 비율이고, 0인 날도 최소 흔적을 남긴다", () => {
    const bars = buildTrendBars(points([0, 50, 100]));
    expect(bars.map((bar) => bar.heightPct)).toEqual([4, 50, 100]);
    expect(bars.map((bar) => bar.isPeak)).toEqual([false, false, true]);
  });

  it("전부 0이면 균일한 최소 높이로 그리고 최고 표시를 하지 않는다", () => {
    const bars = buildTrendBars(points([0, 0]));
    expect(bars.map((bar) => bar.heightPct)).toEqual([4, 4]);
    expect(bars.every((bar) => !bar.isPeak)).toBe(true);
  });

  it("스펙트럼 슬라이스는 처음과 끝 막대에서 그라디언트 양끝에 닿는다", () => {
    const bars = buildTrendBars(points([10, 20, 30]));
    expect(bars[0].backgroundSize).toBe("300% 100%");
    expect(bars[0].backgroundPosition).toBe("0% 100%");
    expect(bars[2].backgroundPosition).toBe("100% 100%");
  });
});

describe("표기", () => {
  it("조회수는 천 단위 구분으로, 날짜는 월·일로 표기한다", () => {
    expect(formatViews(1234567)).toBe("1,234,567");
    expect(formatDateLabel("2026-09-05")).toBe("9월 5일");
  });
});
