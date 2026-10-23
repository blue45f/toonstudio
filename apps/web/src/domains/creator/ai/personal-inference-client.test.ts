import { describe, expect, it } from "vitest";

import {
  isPersonalInferenceRequestPath,
  PersonalInferenceError,
  validatePersonalInferenceJob,
} from "./personal-inference-client";

describe("personal inference request path", () => {
  it("accepts only bounded absolute API segments", () => {
    expect(isPersonalInferenceRequestPath("/capabilities")).toBe(true);
    expect(isPersonalInferenceRequestPath("/uploads/0123456789abcdef0123456789abcdef/chunks/12")).toBe(true);
    expect(isPersonalInferenceRequestPath("/jobs/a_b-c.1/cancel")).toBe(true);
  });

  it.each([
    "", "/", "capabilities", "/uploads//chunks/1", "/uploads/../secret",
    "/uploads/%2e%2e/secret", "/jobs/id?admin=1", "/jobs/id#fragment",
    `/jobs/${"-".repeat(129)}`, `/jobs/${"a".repeat(513)}`,
  ])("rejects unsafe or unbounded path %s", (path) => {
    expect(isPersonalInferenceRequestPath(path)).toBe(false);
  });
});

describe("personal inference error codes (T3)", () => {
  it("검증 실패는 PersonalInferenceError + code로 던져지고 메시지는 기존 한국어 문구다", () => {
    let caught: unknown;
    try {
      validatePersonalInferenceJob(null);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(PersonalInferenceError);
    expect(caught).toBeInstanceOf(Error);
    expect((caught as PersonalInferenceError).code).toBe("invalid_job");
    expect((caught as PersonalInferenceError).message).toBe("클라우드 추론 작업 응답이 올바르지 않습니다.");
  });
});
