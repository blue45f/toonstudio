import { describe, expect, it } from "vitest";

import { studioExportAppearanceSummary } from "./studio-export-summary";

const signature = { enabled: true, text: "© 작가", opacity: 0.55 };

describe("다운로드 전 배경·문구 서명 안내", () => {
  it.each(["png", "webp"] as const)("%s의 투명 배경 요청을 표시한다", (format) => {
    expect(studioExportAppearanceSummary(format, true, signature).background).toBe("transparent");
  });
  it.each(["png", "webp"] as const)("%s의 기본 배경을 강제로 불투명이라 단정하지 않는다", (format) => {
    expect(studioExportAppearanceSummary(format, false, signature).background).toBe("preserve");
  });
  it.each([false, true])("JPG는 요청값 %s와 관계없이 투명 배경을 약속하지 않는다", (requested) => {
    expect(studioExportAppearanceSummary("jpg", requested, signature).background).toBe("unsupported");
  });
  it("서명 기능이 꺼졌다면 이전 문구가 있어도 사용 중으로 표시하지 않는다", () => {
    expect(studioExportAppearanceSummary("png", false, { ...signature, enabled: false }).signature).toBe("off");
  });
  it.each(["", "   ", "\n\t"])("빈 문구 %j를 실제 서명으로 안내하지 않는다", (text) => {
    expect(studioExportAppearanceSummary("png", false, { ...signature, text }).signature).toBe("empty");
  });
  it("문구가 있으면 서명 사용 상태를 표시한다", () => {
    expect(studioExportAppearanceSummary("png", true, signature).signature).toBe("active");
  });
  it.each([0, -1])("투명도 %s인 글자를 보이는 서명으로 안내하지 않는다", (opacity) => {
    expect(studioExportAppearanceSummary("png", false, { ...signature, opacity }).signature).toBe("invisible");
  });
  it.each([NaN, Infinity, -Infinity])("비정상 투명도 %s는 확인 필요로 분리한다", (opacity) => {
    expect(studioExportAppearanceSummary("png", false, { ...signature, opacity }).signature).toBe("invalid");
  });
  it("출력 설정을 바꾸지 않고 안내만 계산한다", () => {
    const original = Object.freeze({ ...signature });
    expect(studioExportAppearanceSummary("jpg", true, original)).toEqual({ background: "unsupported", signature: "active" });
    expect(original).toEqual(signature);
  });
});
