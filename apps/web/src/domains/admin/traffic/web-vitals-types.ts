/**
 * Mirror of the API report DTO built by
 * `apps/api/src/modules/traffic-analytics/web-vitals-report.ts`.
 * The web app cannot import API code, so the contract is restated here; the
 * API side is the source of truth and its tests pin the field names.
 */
export type WebVitalRating = "good" | "needs-improvement" | "poor";

export interface WebVitalMetricSummary {
  metric: "LCP" | "CLS" | "INP";
  samples: number;
  p75: number | null;
  rating: WebVitalRating | null;
  status: "pass" | "fail" | "insufficient-data";
}

export interface WebVitalsPathSummary {
  path: string;
  metrics: WebVitalMetricSummary[];
  status: "pass" | "fail" | "insufficient-data";
}

export interface WebVitalsAlert {
  kind: "rating-regression" | "p75-drift";
  severity: "warning" | "critical";
  path: string;
  metric: "LCP" | "CLS" | "INP";
  currentP75: number;
  previousP75: number;
  currentRating: WebVitalRating;
  previousRating: WebVitalRating;
  message: string;
}

export interface WebVitalsReport {
  generatedAt: string;
  windowDays: number;
  status: "ok" | "regressed" | "insufficient-data";
  paths: WebVitalsPathSummary[];
  alerts: WebVitalsAlert[];
}
