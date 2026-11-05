import { describe, expect, it } from "vitest";

import {
  DEFAULT_HAIR_COVERAGE_THRESHOLDS,
  evaluateHairCoverage,
  readHairCoverageThreshold,
  type HairCoverageSample,
} from "./studio-hair-coverage.mjs";

/**
 * 2026-10-23 실측(Apple M2 Max · ANGLE Metal, 카메라 '상반신' 정면, 정수리 띠 위 35%).
 * after = 머리 본 스킨 정점 실측 맞춤, before = HEAD 의 눈 간격 기반 반경(캡이 두피 속).
 */
const ORION_AFTER: HairCoverageSample = { model: "오리온 (로봇)", preset: "pixie", view: "front", crown: 0.0427 };
const AFTER: readonly HairCoverageSample[] = [
  { model: "루미", preset: "short", view: "front", crown: 0.1007 },
  { model: "비타", preset: "pixie", view: "front", crown: 0.0899 },
  { model: "쿼터니어스 캐주얼 (여성)", preset: "pixie", view: "front", crown: 0.0812 },
  ORION_AFTER,
  { model: "시드상 (마스코트)", preset: "bun", view: "front", crown: 0.1172 },
];

describe("헤어 덮임 판정", () => {
  it("기본 5% 임계에 미달한 로봇 실측은 실패로 보고한다", () => {
    expect(DEFAULT_HAIR_COVERAGE_THRESHOLDS).toEqual({ front: 0.05, back: 0.05 });
    const verdict = evaluateHairCoverage(AFTER);
    expect(verdict).toEqual({
      passed: false,
      checked: AFTER.length,
      failures: [{ ...ORION_AFTER, threshold: 0.05 }],
    });
  });

  it("임계를 넘은 나머지 실측은 통과한다", () => {
    const passingSamples = AFTER.filter((sample) => sample !== ORION_AFTER);
    expect(evaluateHairCoverage(passingSamples)).toEqual({
      passed: true,
      checked: 4,
      failures: [],
    });
  });

  it("민머리(캡이 두피 속)면 실패하고, 실패 항목과 임계를 그대로 보고한다", () => {
    const bald: HairCoverageSample = { model: "루미", preset: "pixie", view: "front", crown: 0.002 };
    const verdict = evaluateHairCoverage([...AFTER, bald]);
    expect(verdict.passed).toBe(false);
    expect(verdict.checked).toBe(AFTER.length + 1);
    expect(verdict.failures).toEqual([
      { ...ORION_AFTER, threshold: 0.05 },
      { ...bald, threshold: 0.05 },
    ]);
  });

  it("값이 없거나 숫자가 아니면 통과시키지 않는다(측정 실패를 덮지 않게)", () => {
    expect(evaluateHairCoverage([]).passed).toBe(false);
    expect(evaluateHairCoverage([{ model: "루미", preset: "bob", view: "front", crown: Number.NaN }]).passed).toBe(false);
  });

  it("임계 환경 변수는 백분율로 읽고, 잘못된 값은 기본값을 쓴다", () => {
    expect(readHairCoverageThreshold("4.5", 0.03)).toBeCloseTo(0.045, 9);
    expect(readHairCoverageThreshold(undefined, 0.03)).toBe(0.03);
    expect(readHairCoverageThreshold("abc", 0.03)).toBe(0.03);
    expect(readHairCoverageThreshold("0", 0.03)).toBe(0.03);
    expect(readHairCoverageThreshold("150", 0.03)).toBe(0.03);
  });
});
