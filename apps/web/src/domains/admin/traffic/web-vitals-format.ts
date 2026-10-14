import type { WebVitalRating } from "./web-vitals-types";

/** LCP/INP read as seconds once they pass a second; CLS is a bare ratio. */
export function formatWebVitalValue(
  metric: "LCP" | "CLS" | "INP",
  value: number | null,
): string {
  if (value === null) return "—";
  if (metric === "CLS") return value.toFixed(2);
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}초`;
  return `${Math.round(value)}ms`;
}

export function webVitalRatingLabel(rating: WebVitalRating | null): string {
  if (rating === "good") return "좋음";
  if (rating === "needs-improvement") return "개선 필요";
  if (rating === "poor") return "나쁨";
  return "표본 부족";
}

/** Badge tone per rating; insufficient data stays neutral grey. */
export function webVitalRatingTone(
  rating: WebVitalRating | null,
): "good" | "warn" | "bad" | "muted" {
  if (rating === "good") return "good";
  if (rating === "needs-improvement") return "warn";
  if (rating === "poor") return "bad";
  return "muted";
}
