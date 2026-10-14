import {
  rateWebVital,
  WEB_VITAL_NAMES,
  type WebVitalName,
  type WebVitalRating,
} from "./web-vitals-model";

/**
 * CWV 실측 집계·회귀 판정 코어 (G6 성능 실측 체계).
 *
 * Pure functions only: the repository hands over raw field samples for two
 * adjacent windows (current vs previous) and this module produces the whole
 * dashboard report — per-path p75 per metric, the CWV pass/fail assessment,
 * and regression alerts. Keeping the math here (instead of in SQL JSON
 * aggregation like the traffic overview) means the bundle gate, the admin
 * dashboard, and these tests all read one definition of "regressed".
 *
 * Definitions (deliberately the published CWV ones):
 *   - A metric passes when its p75 is at or under the §6.4 "good" ceiling.
 *   - A path passes only when every metric with enough data passes.
 *   - A window with fewer than MIN_WEB_VITALS_SAMPLES samples for a metric is
 *     "insufficient-data" for that metric — it neither passes nor fails, and
 *     it never raises an alert. Field data is noisy; alarming on 3 samples
 *     would train operators to ignore the alarm.
 *
 * Regression alerts compare the current window against the previous window of
 * the same length:
 *   - rating-regression: the p75 rating got worse (good → needs-improvement is
 *     a warning, anything → poor is critical).
 *   - p75-drift: the rating held but the p75 still grew by at least
 *     REGRESSION_RELATIVE_THRESHOLD and at least the metric's noise floor —
 *     an early warning before the rating flips.
 */

export const MIN_WEB_VITALS_SAMPLES = 30;
export const REGRESSION_RELATIVE_THRESHOLD = 0.2;

/** Absolute growth below this is measurement noise, never a drift alert. */
const DRIFT_NOISE_FLOOR: Record<WebVitalName, number> = {
  LCP: 100,
  CLS: 0.02,
  INP: 20,
};

export type WebVitalsSample = {
  path: string;
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
};

export type WebVitalMetricSummary = {
  metric: WebVitalName;
  samples: number;
  p75: number | null;
  rating: WebVitalRating | null;
  status: "pass" | "fail" | "insufficient-data";
};

export type WebVitalsPathSummary = {
  path: string;
  metrics: WebVitalMetricSummary[];
  status: "pass" | "fail" | "insufficient-data";
};

export type WebVitalsAlert = {
  kind: "rating-regression" | "p75-drift";
  severity: "warning" | "critical";
  path: string;
  metric: WebVitalName;
  currentP75: number;
  previousP75: number;
  currentRating: WebVitalRating;
  previousRating: WebVitalRating;
  message: string;
};

export type WebVitalsReport = {
  generatedAt: string;
  windowDays: number;
  status: "ok" | "regressed" | "insufficient-data";
  paths: WebVitalsPathSummary[];
  alerts: WebVitalsAlert[];
};

/** Nearest-rank percentile, the same definition CrUX reports p75 with. */
export function percentileNearestRank(
  values: readonly number[],
  percentile: number,
): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((percentile / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? null;
}

function metricValues(
  samples: readonly WebVitalsSample[],
  metric: WebVitalName,
): number[] {
  const values: number[] = [];
  for (const sample of samples) {
    const value =
      metric === "LCP" ? sample.lcpMs : metric === "CLS" ? sample.cls : sample.inpMs;
    if (value !== null && Number.isFinite(value)) values.push(value);
  }
  return values;
}

function roundMetric(metric: WebVitalName, value: number): number {
  return metric === "CLS" ? Math.round(value * 10_000) / 10_000 : Math.round(value);
}

export function summarizeWebVitalsSamples(
  samples: readonly WebVitalsSample[],
): WebVitalsPathSummary[] {
  const byPath = new Map<string, WebVitalsSample[]>();
  for (const sample of samples) {
    const bucket = byPath.get(sample.path);
    if (bucket) bucket.push(sample);
    else byPath.set(sample.path, [sample]);
  }

  const summaries: WebVitalsPathSummary[] = [];
  for (const path of [...byPath.keys()].sort()) {
    const pathSamples = byPath.get(path) ?? [];
    const metrics: WebVitalMetricSummary[] = WEB_VITAL_NAMES.map((metric) => {
      const values = metricValues(pathSamples, metric);
      if (values.length < MIN_WEB_VITALS_SAMPLES) {
        return {
          metric,
          samples: values.length,
          p75: null,
          rating: null,
          status: "insufficient-data" as const,
        };
      }
      const p75 = roundMetric(metric, percentileNearestRank(values, 75) ?? 0);
      const rating = rateWebVital(metric, p75);
      return {
        metric,
        samples: values.length,
        p75,
        rating,
        status: rating === "good" ? ("pass" as const) : ("fail" as const),
      };
    });
    const status = metrics.some((metric) => metric.status === "fail")
      ? "fail"
      : metrics.some((metric) => metric.status === "insufficient-data")
        ? "insufficient-data"
        : "pass";
    summaries.push({ path, metrics, status });
  }
  return summaries;
}

const RATING_ORDER: Record<WebVitalRating, number> = {
  good: 0,
  "needs-improvement": 1,
  poor: 2,
};

function formatMetricValue(metric: WebVitalName, value: number): string {
  return metric === "CLS" ? value.toFixed(2) : `${Math.round(value)}ms`;
}

export function detectWebVitalsRegressions(input: {
  current: readonly WebVitalsPathSummary[];
  previous: readonly WebVitalsPathSummary[];
}): WebVitalsAlert[] {
  const previousByPath = new Map(
    input.previous.map((summary) => [summary.path, summary]),
  );
  const alerts: WebVitalsAlert[] = [];

  for (const currentPath of input.current) {
    const previousPath = previousByPath.get(currentPath.path);
    if (!previousPath) continue;
    for (const currentMetric of currentPath.metrics) {
      if (
        currentMetric.p75 === null
        || currentMetric.rating === null
        || currentMetric.status === "insufficient-data"
      ) {
        continue;
      }
      const previousMetric = previousPath.metrics.find(
        (metric) => metric.metric === currentMetric.metric,
      );
      if (
        !previousMetric
        || previousMetric.p75 === null
        || previousMetric.rating === null
        || previousMetric.status === "insufficient-data"
      ) {
        continue;
      }

      const ratingWorsened =
        RATING_ORDER[currentMetric.rating] > RATING_ORDER[previousMetric.rating];
      if (ratingWorsened) {
        alerts.push({
          kind: "rating-regression",
          severity: currentMetric.rating === "poor" ? "critical" : "warning",
          path: currentPath.path,
          metric: currentMetric.metric,
          currentP75: currentMetric.p75,
          previousP75: previousMetric.p75,
          currentRating: currentMetric.rating,
          previousRating: previousMetric.rating,
          message:
            `${currentPath.path} ${currentMetric.metric} p75가 ` +
            `${formatMetricValue(currentMetric.metric, previousMetric.p75)}에서 ` +
            `${formatMetricValue(currentMetric.metric, currentMetric.p75)}로 나빠졌어요.`,
        });
        continue;
      }

      const growth = currentMetric.p75 - previousMetric.p75;
      const relativeGrowth =
        previousMetric.p75 > 0 ? growth / previousMetric.p75 : 0;
      if (
        growth >= DRIFT_NOISE_FLOOR[currentMetric.metric]
        && relativeGrowth >= REGRESSION_RELATIVE_THRESHOLD
      ) {
        alerts.push({
          kind: "p75-drift",
          severity: "warning",
          path: currentPath.path,
          metric: currentMetric.metric,
          currentP75: currentMetric.p75,
          previousP75: previousMetric.p75,
          currentRating: currentMetric.rating,
          previousRating: previousMetric.rating,
          message:
            `${currentPath.path} ${currentMetric.metric} p75가 ` +
            `${formatMetricValue(currentMetric.metric, previousMetric.p75)}에서 ` +
            `${formatMetricValue(currentMetric.metric, currentMetric.p75)}로 ` +
            `${Math.round(relativeGrowth * 100)}% 느려졌어요.`,
        });
      }
    }
  }
  return alerts;
}

export function buildWebVitalsReport(input: {
  currentSamples: readonly WebVitalsSample[];
  previousSamples: readonly WebVitalsSample[];
  generatedAt: Date;
  windowDays: number;
}): WebVitalsReport {
  const paths = summarizeWebVitalsSamples(input.currentSamples);
  const previous = summarizeWebVitalsSamples(input.previousSamples);
  const alerts = detectWebVitalsRegressions({ current: paths, previous });
  const status =
    alerts.length > 0
      ? "regressed"
      : paths.length === 0 || paths.every((path) => path.status === "insufficient-data")
        ? "insufficient-data"
        : "ok";
  return {
    generatedAt: input.generatedAt.toISOString(),
    windowDays: input.windowDays,
    status,
    paths,
    alerts,
  };
}
