import { describe, expect, it } from "vitest";

import { StrokeBudgetExceededError } from "../../engine/core/errors";

import { describeLaneError } from "./draw-error-text";

describe("describeLaneError", () => {
  it("stroke-budget-exceeded는 원인과 대처를 한글로 설명하고 원문을 남긴다", () => {
    const text = describeLaneError(new StrokeBudgetExceededError(67, 66));
    expect(text).toContain("너무 빨라");
    expect(text).toContain("천천히");
    expect(text).toContain("requested 67, capacity 66");
  });

  it("그 밖의 오류는 '레인 오류' 접두와 원문 그대로", () => {
    expect(describeLaneError(new Error("장치 손실"))).toBe("레인 오류: 장치 손실");
  });
});
