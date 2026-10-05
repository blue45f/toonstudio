/**
 * PeriodDeltaBadge.tsx
 *
 * 이전 기간 대비 증감 배지. 비교는 같은 길이의 직전 기간 실집계끼리만 하고,
 * 이전 기간 기록이 없으면 비율을 지어내지 않고 그 사실을 그대로 표기한다.
 */
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import { computeRevenueDelta } from "../models/revenue-model";

export function PeriodDeltaBadge({
  current,
  previous,
  label,
  noPreviousLabel,
}: {
  readonly current: number;
  readonly previous: number;
  /** "전월 대비" / "이전 기간 대비" 같은 비교 라벨. */
  readonly label: string;
  /** 이전 기간에 기록이 없을 때의 중립 표기. */
  readonly noPreviousLabel: string;
}) {
  if (current <= 0 && previous <= 0) return null;

  const delta = computeRevenueDelta(current, previous);
  if (delta.percent === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted">
        {noPreviousLabel}
      </span>
    );
  }

  const Icon =
    delta.direction === "up" ? TrendingUp : delta.direction === "down" ? TrendingDown : Minus;
  const sign = delta.percent > 0 ? "+" : "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
        delta.direction === "up" && "bg-good/10 text-good",
        delta.direction === "down" && "bg-bad/10 text-bad",
        delta.direction === "flat" && "bg-fg/5 text-muted",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label} {sign}
      {delta.percent.toFixed(1)}%
    </span>
  );
}
