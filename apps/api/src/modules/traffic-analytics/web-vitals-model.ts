import { BadRequestException } from "@nestjs/common";

/**
 * Server boundary for the Core Web Vitals field beacon (G6 성능 실측 체계).
 *
 * The client collector (`apps/web/src/app/traffic-analytics/web-vitals.ts`) already
 * bounds and rounds every value before sending; this module re-applies the exact
 * same bounds on the server so a hand-crafted beacon cannot smuggle unbounded or
 * identifying data into the measurement store. The two sides must stay in sync:
 *
 *   - metric milliseconds: integer, 0..600_000
 *   - CLS: 0..100, at most 4 decimal places
 *   - at least one metric must be present, otherwise the beacon is meaningless
 *
 * Thresholds are the BLUEPRINT §6.4 public-surface budgets — LCP p75 ≤ 2.5s,
 * CLS ≤ 0.1, INP ≤ 200ms — identical to the client `WEB_VITAL_THRESHOLDS`, so a
 * rating computed here means the same thing as the rating shown in the field.
 */

export const WEB_VITAL_NAMES = ["LCP", "CLS", "INP"] as const;
export type WebVitalName = (typeof WEB_VITAL_NAMES)[number];
export type WebVitalRating = "good" | "needs-improvement" | "poor";

/** §6.4 budget = the "good" ceiling; the second value is the "poor" floor. */
export const WEB_VITAL_THRESHOLDS: Record<
  WebVitalName,
  { good: number; poor: number }
> = {
  LCP: { good: 2_500, poor: 4_000 },
  CLS: { good: 0.1, poor: 0.25 },
  INP: { good: 200, poor: 500 },
};

export function rateWebVital(name: WebVitalName, value: number): WebVitalRating {
  const thresholds = WEB_VITAL_THRESHOLDS[name];
  if (value <= thresholds.good) return "good";
  if (value <= thresholds.poor) return "needs-improvement";
  return "poor";
}

export type WebVitalsPayload = {
  visitorId?: unknown;
  sessionId?: unknown;
  path?: unknown;
  lcpMs?: unknown;
  cls?: unknown;
  inpMs?: unknown;
};

export type WebVitalsMetrics = {
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
};

const MAX_VITAL_MS = 600_000;
const MAX_CLS = 100;

function boundedVitalMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.min(MAX_VITAL_MS, Math.round(parsed));
}

function boundedCls(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.min(MAX_CLS, Math.round(parsed * 10_000) / 10_000);
}

/**
 * Normalizes a raw beacon body into storable metrics. A metric that arrives as
 * garbage (negative, NaN, a string of text) is dropped to null rather than
 * rejected, mirroring the client's fail-soft collection; only a beacon with no
 * usable metric at all is a client error.
 */
export function normalizeWebVitalsMetrics(
  payload: WebVitalsPayload,
): WebVitalsMetrics {
  const metrics: WebVitalsMetrics = {
    lcpMs: boundedVitalMs(payload.lcpMs),
    cls: boundedCls(payload.cls),
    inpMs: boundedVitalMs(payload.inpMs),
  };
  if (metrics.lcpMs === null && metrics.cls === null && metrics.inpMs === null) {
    throw new BadRequestException("측정된 성능 지표가 없습니다.");
  }
  return metrics;
}

/**
 * Field CWV is only meaningful for the public surfaces the §6.4 budget governs.
 * The client already restricts collection to `/` and `/discover`; the server
 * enforces the same pool so studio or account vitals can never pollute the
 * public p75. The input is the already-normalized traffic path.
 */
export function isPublicWebVitalsPath(normalizedPath: string): boolean {
  return normalizedPath === "/" || normalizedPath === "/discover";
}
