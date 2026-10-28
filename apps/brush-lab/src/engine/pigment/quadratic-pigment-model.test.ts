import { describe, expect, it } from "vitest";

import golden from "../../../test-data/quadratic-pigment-model-golden.json" with { type: "json" };

import { QUADRATIC_PIGMENT_MODEL, evaluateQuadraticPigmentMix } from "./quadratic-pigment-model";

describe("로컬 7채널 이차 안료 모델의 기존 출력 보존", () => {
  it.each(golden.cases)("$caseId: 분리 전 로컬 골든의 모든 채널과 출력이 같다", (sample) => {
    expect(evaluateQuadraticPigmentMix(sample.colorA, sample.colorB, sample.t01)).toEqual(sample.output);
  });

  it("계수 출처 미확인인 로컬 실험 모델로 분류하고 운영 승격을 허용하지 않는다", () => {
    expect(QUADRATIC_PIGMENT_MODEL).toEqual({
      id: "quadratic-pigment-7d-local",
      degree: 2,
      latentChannels: 7,
      coefficientOrigin: "unverified",
      maturity: "local-prototype",
      servicePromotionAllowed: false,
    });
    expect(Object.isFrozen(QUADRATIC_PIGMENT_MODEL)).toBe(true);
  });
});
