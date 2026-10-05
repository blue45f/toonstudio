/**
 * wikimedia-interest.ts
 *
 * Wikimedia 관심 신호(한국어 위키백과 일별 조회수)의 표시 계산.
 * 모든 수치는 제공처가 실제로 돌려준 dailyViews 시계열에서만 계산한다 —
 * 시계열이 없으면 요약을 만들지 않고(null), 비교할 이전 기간이 없으면
 * 증감률을 지어내지 않는다(null).
 */
import type { ResourceDailyViews } from "@/shared/lib/creator-resources";

export interface DailyViewsSummary {
  /** 기간 총 조회수 */
  total: number;
  /** 일평균 조회수 (반올림) */
  average: number;
  /** 가장 많이 본 날 (동률이면 가장 이른 날) */
  peak: ResourceDailyViews;
  /** 시계열 첫날 (YYYY-MM-DD) */
  start: string;
  /** 시계열 마지막 날 (YYYY-MM-DD) */
  end: string;
  /** 시계열 일수 */
  days: number;
  /** 전반부 대비 후반부 증감률(%). 비교 불가면 null */
  changePct: number | null;
  /** 비교에 쓴 전반부·후반부 일수 (changePct가 있을 때만 의미) */
  halfDays: number;
}

export function summarizeDailyViews(points: readonly ResourceDailyViews[]): DailyViewsSummary | null {
  if (points.length === 0) return null;
  const total = points.reduce((sum, point) => sum + point.views, 0);
  const peak = points.reduce((best, point) => (point.views > best.views ? point : best), points[0]);
  // 전반/후반 비교는 같은 길이끼리만 공정하다 — 홀수면 가운데 하루를 양쪽에서 제외한다.
  const half = Math.floor(points.length / 2);
  let changePct: number | null = null;
  if (half >= 1) {
    const previousTotal = points.slice(0, half).reduce((sum, point) => sum + point.views, 0);
    const recentTotal = points.slice(points.length - half).reduce((sum, point) => sum + point.views, 0);
    // 이전 기간이 0이면 나눗셈으로 비율을 만들 수 없다 — 지어내지 않고 비교 없음으로 둔다.
    if (previousTotal > 0) changePct = Math.round(((recentTotal - previousTotal) / previousTotal) * 100);
  }
  return {
    total,
    average: Math.round(total / points.length),
    peak,
    start: points[0].date,
    end: points[points.length - 1].date,
    days: points.length,
    changePct,
    halfDays: half,
  };
}

export interface TrendBar {
  date: string;
  views: number;
  /** 최고일 대비 높이(%) — 0인 날도 흔적이 남도록 최소 높이를 둔다 */
  heightPct: number;
  isPeak: boolean;
  /** 스펙트럼 그라디언트 슬라이스 — 막대가 자기 위치의 색을 드러내게 하는 배경 크기·위치 */
  backgroundSize: string;
  backgroundPosition: string;
}

const MIN_HEIGHT_PCT = 4;

export function buildTrendBars(points: readonly ResourceDailyViews[]): TrendBar[] {
  const max = points.reduce((highest, point) => Math.max(highest, point.views), 0);
  const count = points.length;
  return points.map((point, index) => ({
    date: point.date,
    views: point.views,
    heightPct: max > 0 ? Math.max(MIN_HEIGHT_PCT, Math.round((point.views / max) * 100)) : MIN_HEIGHT_PCT,
    isPeak: max > 0 && point.views === max,
    backgroundSize: `${count * 100}% 100%`,
    backgroundPosition: count > 1 ? `${Math.round((index / (count - 1)) * 100)}% 100%` : "0% 100%",
  }));
}

export function formatViews(value: number): string {
  return value.toLocaleString("ko-KR");
}

/** "2026-09-23" → "9월 23일" */
export function formatDateLabel(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}
