import { describe, expect, it } from "vitest";

import { sanitizeLogValue } from "./log-safe";

describe("sanitizeLogValue", () => {
  it("줄바꿈과 제어 문자, 유니코드 줄 구분자를 공백으로 바꾼다", () => {
    expect(sanitizeLogValue("a\nb\r\nc\td e f\u0085g\u007fh")).toBe("a b  c d e f g h");
  });

  it("문자열이 아닌 값도 한 줄 문자열로 바꾼다", () => {
    expect(sanitizeLogValue(undefined)).toBe("");
    expect(sanitizeLogValue(null)).toBe("");
    expect(sanitizeLogValue(42)).toBe("42");
    expect(sanitizeLogValue(["a\nb", "c"])).toBe("a b,c");
  });

  it("길이 제한을 넘으면 잘라서 말줄임표를 붙인다", () => {
    expect(sanitizeLogValue("x".repeat(500))).toHaveLength(301);
    expect(sanitizeLogValue("abcdef", 3)).toBe("abc…");
    expect(sanitizeLogValue("abc", 3)).toBe("abc");
  });

  it("정상 문자(한글, 이모지, URL 기호)는 그대로 둔다", () => {
    const value = "https://toonstudio.com/작품?q=한글&x=1 🙂";
    expect(sanitizeLogValue(value)).toBe(value);
  });
});
