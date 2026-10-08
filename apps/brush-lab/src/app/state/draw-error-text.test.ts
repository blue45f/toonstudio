import { describe, expect, it } from "vitest";

import { StrokeBudgetExceededError } from "../../engine/core/errors";

import { describeLaneError } from "./draw-error-text";

describe("describeLaneError", () => {
  it("stroke-budget-exceeded는 원인(비정상 도약·용량 한계)을 한글로 설명하고 원문을 남기며, 평범하게 빠른 획은 그려진다고 알린다", () => {
    const text = describeLaneError(new StrokeBudgetExceededError(67, 66));
    expect(text).toContain("dab 배치 상한");
    expect(text).toContain("비정상 입력");
    expect(text).toContain("평범하게 빠른 획은 그려진다");
    expect(text).not.toContain("너무 빨라");
    expect(text).toContain("requested 67, capacity 66");
  });

  it("엔진이 details.reasonKo를 붙였으면 그 사유를 함께 보여 준다", () => {
    const text = describeLaneError(new StrokeBudgetExceededError(400000, 262144, { reasonKo: "한 프레임에 5000000px를 건너뛰는 비정상 입력" }));
    expect(text).toContain("한 프레임에 5000000px를 건너뛰는 비정상 입력");
    expect(text).toContain("capacity 262144");
  });

  it("그 밖의 오류는 '레인 오류' 접두와 원문 그대로", () => {
    expect(describeLaneError(new Error("장치 손실"))).toBe("레인 오류: 장치 손실");
  });
});
