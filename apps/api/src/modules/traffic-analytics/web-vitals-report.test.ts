import { describe, expect, it } from "vitest";

import {
  normalizeWebVitalsMetrics,
  rateWebVital,
} from "./web-vitals-model";
import {
  buildWebVitalsReport,
  detectWebVitalsRegressions,
  MIN_WEB_VITALS_SAMPLES,
  percentileNearestRank,
  summarizeWebVitalsSamples,
  type WebVitalsSample,
} from "./web-vitals-report";

function samples(
  path: string,
  count: number,
  values: { lcpMs?: number | null; cls?: number | null; inpMs?: number | null },
): WebVitalsSample[] {
  return Array.from({ length: count }, () => ({
    path,
    lcpMs: values.lcpMs ?? null,
    cls: values.cls ?? null,
    inpMs: values.inpMs ?? null,
  }));
}

const ENOUGH = MIN_WEB_VITALS_SAMPLES;

describe("web vitals metric normalization (client beacon bounds)", () => {
  it("rounds and bounds values exactly like the client collector", () => {
    expect(
      normalizeWebVitalsMetrics({ lcpMs: 2_500.6, cls: 0.123456, inpMs: 180 }),
    ).toEqual({ lcpMs: 2_501, cls: 0.1235, inpMs: 180 });
    expect(
      normalizeWebVitalsMetrics({ lcpMs: 999_999_999, cls: 500, inpMs: null }),
    ).toEqual({ lcpMs: 600_000, cls: 100, inpMs: null });
  });

  it("drops garbage metrics to null instead of storing them", () => {
    expect(
      normalizeWebVitalsMetrics({ lcpMs: -5, cls: "fast", inpMs: 120 }),
    ).toEqual({ lcpMs: null, cls: null, inpMs: 120 });
  });

  it("rejects a beacon with no usable metric at all", () => {
    expect(() => normalizeWebVitalsMetrics({})).toThrow(
      "측정된 성능 지표가 없습니다.",
    );
    expect(() =>
      normalizeWebVitalsMetrics({ lcpMs: null, cls: null, inpMs: null }),
    ).toThrow("측정된 성능 지표가 없습니다.");
  });

  it("rates with the §6.4 thresholds shared with the client", () => {
    expect(rateWebVital("LCP", 2_500)).toBe("good");
    expect(rateWebVital("LCP", 2_501)).toBe("needs-improvement");
    expect(rateWebVital("CLS", 0.1)).toBe("good");
    expect(rateWebVital("CLS", 0.26)).toBe("poor");
    expect(rateWebVital("INP", 200)).toBe("good");
    expect(rateWebVital("INP", 501)).toBe("poor");
  });
});

describe("web vitals p75 summary", () => {
  it("computes nearest-rank percentiles", () => {
    expect(percentileNearestRank([], 75)).toBeNull();
    expect(percentileNearestRank([100], 75)).toBe(100);
    expect(percentileNearestRank([400, 100, 300, 200], 75)).toBe(300);
    expect(percentileNearestRank([1, 2, 3, 4, 5, 6, 7, 8], 75)).toBe(6);
  });

  it("marks a metric insufficient-data below the minimum sample count", () => {
    const [path] = summarizeWebVitalsSamples(
      samples("/", ENOUGH - 1, { lcpMs: 1_000 }),
    );
    expect(path?.status).toBe("insufficient-data");
    expect(path?.metrics[0]).toMatchObject({
      metric: "LCP",
      samples: ENOUGH - 1,
      p75: null,
      status: "insufficient-data",
    });
  });

  it("passes a path only when every measured metric is good at p75", () => {
    const [path] = summarizeWebVitalsSamples([
      ...samples("/", ENOUGH, { lcpMs: 2_000, cls: 0.05, inpMs: 150 }),
    ]);
    expect(path?.status).toBe("pass");

    const [failing] = summarizeWebVitalsSamples([
      ...samples("/", ENOUGH, { lcpMs: 3_000, cls: 0.05, inpMs: 150 }),
    ]);
    expect(failing?.status).toBe("fail");
    expect(failing?.metrics[0]).toMatchObject({
      metric: "LCP",
      p75: 3_000,
      rating: "needs-improvement",
      status: "fail",
    });
  });

  it("keeps paths in separate pools", () => {
    const summaries = summarizeWebVitalsSamples([
      ...samples("/", ENOUGH, { lcpMs: 1_500 }),
      ...samples("/discover", ENOUGH, { lcpMs: 5_000 }),
    ]);
    expect(summaries.map((summary) => summary.path)).toEqual(["/", "/discover"]);
    expect(summaries[0]?.metrics[0]?.rating).toBe("good");
    expect(summaries[1]?.metrics[0]?.rating).toBe("poor");
  });
});

describe("web vitals regression alerts", () => {
  it("alerts as critical when a rating falls to poor", () => {
    const alerts = detectWebVitalsRegressions({
      current: summarizeWebVitalsSamples(samples("/", ENOUGH, { lcpMs: 4_500 })),
      previous: summarizeWebVitalsSamples(samples("/", ENOUGH, { lcpMs: 2_000 })),
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      kind: "rating-regression",
      severity: "critical",
      path: "/",
      metric: "LCP",
      previousRating: "good",
      currentRating: "poor",
    });
  });

  it("alerts as warning on drift even when the rating holds", () => {
    const alerts = detectWebVitalsRegressions({
      current: summarizeWebVitalsSamples(samples("/", ENOUGH, { lcpMs: 3_600 })),
      previous: summarizeWebVitalsSamples(samples("/", ENOUGH, { lcpMs: 2_900 })),
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: "p75-drift", severity: "warning" });
  });

  it("stays silent for noise-level growth and for improvements", () => {
    expect(
      detectWebVitalsRegressions({
        current: summarizeWebVitalsSamples(samples("/", ENOUGH, { lcpMs: 2_050 })),
        previous: summarizeWebVitalsSamples(samples("/", ENOUGH, { lcpMs: 2_000 })),
      }),
    ).toEqual([]);
    expect(
      detectWebVitalsRegressions({
        current: summarizeWebVitalsSamples(samples("/", ENOUGH, { lcpMs: 1_200 })),
        previous: summarizeWebVitalsSamples(samples("/", ENOUGH, { lcpMs: 4_500 })),
      }),
    ).toEqual([]);
  });

  it("never alerts when either window lacks enough samples", () => {
    const alerts = detectWebVitalsRegressions({
      current: summarizeWebVitalsSamples(samples("/", ENOUGH, { lcpMs: 9_000 })),
      previous: summarizeWebVitalsSamples(samples("/", 3, { lcpMs: 1_000 })),
    });
    expect(alerts).toEqual([]);
  });

  it("builds a dashboard report whose status reflects the alerts", () => {
    const report = buildWebVitalsReport({
      currentSamples: samples("/", ENOUGH, { lcpMs: 4_500 }),
      previousSamples: samples("/", ENOUGH, { lcpMs: 2_000 }),
      generatedAt: new Date("2026-10-14T00:00:00.000Z"),
      windowDays: 30,
    });
    expect(report.status).toBe("regressed");
    expect(report.alerts).toHaveLength(1);
    expect(report.generatedAt).toBe("2026-10-14T00:00:00.000Z");

    const empty = buildWebVitalsReport({
      currentSamples: [],
      previousSamples: [],
      generatedAt: new Date("2026-10-14T00:00:00.000Z"),
      windowDays: 30,
    });
    expect(empty.status).toBe("insufficient-data");
    expect(empty.paths).toEqual([]);
  });
});
