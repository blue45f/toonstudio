import { describe, expect, it } from "vitest";

import { isAbortError } from "./submission-package-abort";

describe("취소 판별", () => {
  it("AbortError 이름을 가진 DOMException·Error 는 취소다", () => {
    expect(isAbortError(new DOMException("취소", "AbortError"))).toBe(true);
    const named = new Error("취소");
    named.name = "AbortError";
    expect(isAbortError(named)).toBe(true);
    expect(isAbortError({ name: "AbortError" })).toBe(true);
  });

  it("다른 오류와 오류가 아닌 값은 취소가 아니다", () => {
    expect(isAbortError(new Error("실패"))).toBe(false);
    expect(isAbortError(new DOMException("시간 초과", "TimeoutError"))).toBe(false);
    expect(isAbortError({ name: 1 })).toBe(false);
    expect(isAbortError({})).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});
