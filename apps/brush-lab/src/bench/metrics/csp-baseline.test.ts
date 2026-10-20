import { describe, expect, it } from "vitest";

import {
  canvasKey,
  canvasScaleFactor,
  cspMetricTableFor,
  cspScoreOf,
  cspOverallScore,
  validateCspBaseline,
  CSP_BASELINE_VALID,
  CSP_BASELINE,
  CSP_BASELINE_DEFAULT,
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
});
