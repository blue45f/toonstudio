/**
 * revenue-source-presentation.ts
 *
 * 수익원 표시용 상수 — 고정 색상 팔레트와 구성비 계산.
 * 장르 스펙트럼과 같은 oklch 시그니처 팔레트를 수익원에도 적용한다.
 */
import type { RevenueSourceId } from "../models/revenue-model";

const SOURCE_COLORS: Record<RevenueSourceId, string> = {
  tips: "oklch(0.7 0.17 295)",
  membership: "oklch(0.68 0.13 235)",
  "early-access": "oklch(0.7 0.17 350)",
  market: "oklch(0.72 0.13 165)",
  custom: "oklch(0.72 0.1 85)",
};

export function revenueSourceColor(sourceId: RevenueSourceId): string {
  return SOURCE_COLORS[sourceId];
}

/** 전체 대비 구성비(%). 반올림한 정수이며, 총액이 0이면 0. */
export function sharePercent(amount: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((amount / total) * 100);
}
