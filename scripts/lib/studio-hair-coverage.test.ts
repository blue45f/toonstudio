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
const AFTER: readonly HairCoverageSample[] = [
  { model: "루미", preset: "short", view: "front", crown: 0.1007 },
  { model: "비타", preset: "pixie", view: "front", crown: 0.0899 },
  { model: "쿼터니어스 캐주얼 (여성)", preset: "pixie", view: "front", crown: 0.0812 },
  { model: "오리온 (로봇)", preset: "pixie", view: "front", crown: 0.0427 },
  { model: "시드상 (마스코트)", preset: "bun", view: "front", crown: 0.1172 },
];

describe("헤어 덮임 판정", () => {
  it("실측 맞춤 결과(after)는 기본 임계를 넘는다", () => {
    const verdict = evaluateHairCoverage(AFTER);
    expect(verdict.passed).toBe(true);
    expect(verdict.checked).toBe(AFTER.length);
  });

  it("민머리(캡이 두피 속)면 실패하고, 실패 항목과 임계를 그대로 보고한다", () => {
    const bald: HairCoverageSample = { model: "루미", preset: "pixie", view: "front", crown: 0.002 };
    const verdict = evaluateHairCoverage([...AFTER, bald]);
    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toEqual([{ ...bald, threshold: DEFAULT_HAIR_COVERAGE_THRESHOLDS.front }]);
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
