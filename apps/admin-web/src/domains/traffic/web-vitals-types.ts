/**
 * Web Vitals 리포트 DTO 타입 정의.
 * 백엔드 트래픽 분석 리포트 응답 구조와 동일한 필드 계약을 유지한다.
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
