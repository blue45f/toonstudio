import { describe, expect, it } from "vitest";

import {
  evaluateStudioCspBenchmarkScorecard,
  measureLivePigmentEngineBenchmark,
  resolveStudioDeviceFormFactor,
} from "../studio-csp-benchmark-scorecard";

describe("studio-csp-benchmark-scorecard (클립스튜디오 대비 2배 우위 검증)", () => {
  it("뷰포트 폭과 포인터 특성에 따라 데스크톱·태블릿·모바일(compact) 폼팩터를 판별한다", () => {
    expect(resolveStudioDeviceFormFactor(1440, false)).toBe("desktop");
    expect(resolveStudioDeviceFormFactor(1024, false)).toBe("tablet");
    expect(resolveStudioDeviceFormFactor(1366, true)).toBe("tablet");
    expect(resolveStudioDeviceFormFactor(390, true)).toBe("compact");
  });

  it("실시간 잠재 안료 혼합 벤치마크가 선형 평균 대비 2배 이상의 녹색 채도 보존과 캐시 히트율을 기록한다", () => {
    const pigment = measureLivePigmentEngineBenchmark();
    expect(pigment.greenChromaGainOverLinear).toBeGreaterThanOrEqual(2.0);
    expect(pigment.cacheHitRateAfterWarmup).toBeGreaterThan(0.7);
    expect(pigment.impastoSpecularContrastRatio).toBeGreaterThanOrEqual(2.15);
    expect(pigment.glazeOpticalDepthSteps).toBeGreaterThanOrEqual(5);
    expect(pigment.stylusTiltBroadeningRatio).toBeGreaterThan(1.4);
  });

  it("데스크톱·태블릿·모바일 모든 기기 프로파일에서 성능·품질·기능·종합 점수가 CSP 대비 2.0배 이상을 달성한다", () => {
    for (const deviceFormFactor of ["desktop", "tablet", "compact"] as const) {
      const scorecard = evaluateStudioCspBenchmarkScorecard({
        deviceFormFactor,
        strokeWidthPx: 24,
        brushOpacity: 0.9,
        stabilizerLevel: 4,
        wetMixEnabled: true,
        grainDepth: 0.72,
        bristleCount: 32,
        colorMixingMode: "latent-pigment",
      });

      expect(scorecard.performanceRatio).toBeGreaterThanOrEqual(2.0);
      expect(scorecard.qualityRatio).toBeGreaterThanOrEqual(2.0);
      expect(scorecard.featureRatio).toBeGreaterThanOrEqual(2.4);
      expect(scorecard.compositeRatio).toBeGreaterThanOrEqual(2.0);
      expect(scorecard.meetsTwoXTarget).toBe(true);
      expect(scorecard.internalizedEngines).toHaveLength(4);
      expect(
        scorecard.featureMetrics.some((metric) => metric.id === "stylus-tilt-dual-brush-engine"),
      ).toBe(true);
    }
  });
});
