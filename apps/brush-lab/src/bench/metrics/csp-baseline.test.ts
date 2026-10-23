import { describe, expect, it } from "vitest";

import {
  canvasKey,
  canvasScaleFactor,
  cspMetricTableFor,
  cspScoreOf,
  cspOverallScore,
  cspSuperiorityRatioOf,
  validateCspBaseline,
  CSP_BASELINE_VALID,
  CSP_BASELINE,
  CSP_BASELINE_DEFAULT,
  CSP_REFERENCE_FEATURE_PROFILE,
  DEFAULT_TOONSTUDIO_FEATURE_PROFILE,
} from "./csp-baseline";

import type { BrushFamily } from "../../engine/presets/program-schema";

describe("CSP 기준선 수치", () => {
  it("canvasKey: 폭×높이 문자열", () => {
    expect(canvasKey(512, 512)).toBe("512x512");
    expect(canvasKey(1024, 1024)).toBe("1024x1024");
  });

  it("canvasScaleFactor: 512²=1.0, 1024²=2.0", () => {
    expect(canvasScaleFactor(512, 512)).toBe(1);
    expect(canvasScaleFactor(1024, 1024)).toBe(2);
  });

  it("cspMetricTableFor: 가족·캔버스별 테이블 반환, 없으면 기본 테이블", () => {
    const pencil512 = cspMetricTableFor("pencil", 512, 512);
    expect(pencil512.deltaE99.target).toBe(0);
    expect(pencil512.frameP95Ms.target).toBe(16.67);

    const pencil1024 = cspMetricTableFor("pencil", 1024, 1024);
    expect(pencil1024.frameP95Ms.target).toBeCloseTo(16.67 * 2, 9);

    const unknown = cspMetricTableFor("ink", 256, 256);
    // ink에 256x256 테이블이 없으면 기본 테이블 fallback
    expect(unknown.deltaE99.target).toBe(CSP_BASELINE_DEFAULT.deltaE99.target);
  });

  it("validateCspBaseline: 모든 target ≥ 0", () => {
    const errors = validateCspBaseline();
    expect(errors).toEqual([]);
    expect(CSP_BASELINE_VALID).toBe(true);
  });

  it("CSP_BASELINE에 등록된 가족이 기본 테이블을 fallback하지 않음", () => {
    const registeredFamilies: BrushFamily[] = [
      "pencil",
      "ink",
      "watercolor",
      "oil",
      "texture",
      "special",
    ];
    for (const family of registeredFamilies) {
      expect(CSP_BASELINE[family]).toBeDefined();
      const table = cspMetricTableFor(family, 512, 512);
      expect(table.deltaE99.target).toBeDefined();
    }
  });

  describe("cspScoreOf", () => {
    it("deltaE99: target 이하면 1, 초과하면 낮아짐", () => {
      const scores = cspScoreOf("pencil", 512, 512, { deltaE99: 0 } as Record<string, number | null>);
      expect(scores.deltaE99).toBe(1);

      const scores2 = cspScoreOf("pencil", 512, 512, { deltaE99: 2 } as Record<string, number | null>);
      expect(scores2.deltaE99).toBeLessThan(1);
      expect(scores2.deltaE99).toBeGreaterThanOrEqual(0);
    });

    it("frameP95Ms: target 이하면 1", () => {
      const scores = cspScoreOf("pencil", 512, 512, { frameP95Ms: 10 } as Record<string, number | null>);
      expect(scores.frameP95Ms).toBe(1);
    });

    it("신호 없음(null)는 null 스코어", () => {
      const scores = cspScoreOf("pencil", 512, 512, {} as Record<string, number | null>);
      expect(scores.deltaE99).toBeNull();
      expect(scores.frameP95Ms).toBeNull();
    });

    it("dabsPerSecond: target 이상이면 1", () => {
      const scores = cspScoreOf("pencil", 512, 512, { dabsPerSecond: 200_000 } as Record<string, number | null>);
      expect(scores.dabsPerSecond).toBe(1);
    });
  });

  describe("cspOverallScore", () => {
    it("유효 스코어 평균", () => {
      const score = cspOverallScore({
        deltaE99: 1,
        frameP95Ms: 0.5,
      } as Record<string, number | null>);
      expect(score).toBeCloseTo(0.75, 9);
    });

    it("유효 스코어 없으면 null", () => {
      const score = cspOverallScore({} as Record<string, number | null>);
      expect(score).toBeNull();
    });

    it("null 값은 평균에서 제외", () => {
      const score = cspOverallScore({
        deltaE99: null,
        frameP95Ms: 1,
      } as Record<string, number | null>);
      expect(score).toBe(1);
    });
  });

  describe("cspSuperiorityRatioOf (CSP 대비 2배 우위 배율)", () => {
    it("고도화된 ToonStudio 엔진 지표와 기능 프로파일에서 성능·품질·기능 모두 2.0배 이상을 달성한다", () => {
      const ratios = cspSuperiorityRatioOf(
        "pencil",
        512,
        512,
        {
          deltaE99: 0,
          fuzzyMismatchPct: 0,
          frameP95Ms: 5.5,
          dabsPerSecond: 240_000,
          grainContrastPreservation: 0.99,
          seamScore: 0,
          edgeStaircaseEnergy: 0,
          pressureMonotonicity: 0.99,
          edgeTransitionWidthPx: 0.65,
          taperWidthError: 0.035,
        },
        DEFAULT_TOONSTUDIO_FEATURE_PROFILE,
      );
      expect(ratios.performanceRatio).toBeGreaterThanOrEqual(2.0);
      expect(ratios.qualityRatio).toBeGreaterThanOrEqual(2.0);
      expect(ratios.featureRatio).toBeGreaterThanOrEqual(2.0);
      expect(ratios.compositeSuperiorityRatio).toBeGreaterThanOrEqual(2.0);
      expect(ratios.meetsTwoXTarget).toBe(true);
    });

    it("CSP 기본 레퍼런스 프로파일과 기준선 수치에서는 2.0배 미달로 판별된다", () => {
      const baselineRatios = cspSuperiorityRatioOf(
        "pencil",
        512,
        512,
        {
          deltaE99: 1.2,
          frameP95Ms: 16.67,
          dabsPerSecond: 100_000,
          grainContrastPreservation: 0.65,
        },
        CSP_REFERENCE_FEATURE_PROFILE,
      );
      expect(baselineRatios.performanceRatio).toBeCloseTo(1.0, 5);
      expect(baselineRatios.featureRatio).toBeCloseTo(1.0, 5);
      expect(baselineRatios.meetsTwoXTarget).toBe(false);
    });
  });
});

