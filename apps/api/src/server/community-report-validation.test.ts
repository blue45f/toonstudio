import { describe, expect, it } from "vitest";

import { validateFanPostReport } from "./community";

// 신고 사유 경계 검증 — 홍보 신고와 같은 10~1000자 기준을 계약으로 고정한다.
describe("validateFanPostReport", () => {
  it("10~1000자 사유를 개행 정규화해 받아들인다", () => {
    expect(validateFanPostReport({ reason: "  도용된 이미지가 올라와 있습니다.\r\n출처를 확인해 주세요.  " })).toEqual({
      reason: "도용된 이미지가 올라와 있습니다.\n출처를 확인해 주세요.",
    });
    expect(validateFanPostReport({ reason: "가".repeat(1000) }).reason).toHaveLength(1000);
  });

  it("너무 짧거나 긴 사유는 거부한다", () => {
    expect(validateFanPostReport({ reason: "스팸" }).error).toContain("10~1000자");
    expect(validateFanPostReport({ reason: "가".repeat(1001) }).error).toContain("10~1000자");
    expect(validateFanPostReport({ reason: "   " }).error).toContain("10~1000자");
  });

  it("객체가 아닌 입력과 사유 누락은 거부한다", () => {
    expect(validateFanPostReport(null).error).toBeTruthy();
    expect(validateFanPostReport("신고합니다").error).toBeTruthy();
    expect(validateFanPostReport({}).error).toBeTruthy();
    expect(validateFanPostReport({ reason: 42 }).error).toBeTruthy();
  });
});
