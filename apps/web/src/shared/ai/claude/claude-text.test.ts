import { describe, expect, it } from "vitest";

import { cleanMultilineText, cleanSingleLineText } from "./claude-text";

describe("cleanSingleLineText", () => {
  it("제어 문자와 줄바꿈·탭을 공백으로 바꿔 한 줄로 만든다", () => {
    expect(cleanSingleLineText("첫 줄\n둘째\u0007줄\t셋째\u0000", 100)).toBe("첫 줄 둘째 줄 셋째");
    expect(cleanSingleLineText("  앞뒤   공백  ", 100)).toBe("앞뒤 공백");
    expect(cleanSingleLineText("\u007f삭제\u001f문자", 100)).toBe("삭제 문자");
  });

  it("길이는 코드 포인트 기준으로 자르고 이모지를 반으로 자르지 않는다", () => {
    expect(cleanSingleLineText("😀😀😀😀", 2)).toBe("😀😀");
    expect(cleanSingleLineText("가나다라", 3)).toBe("가나다");
    expect(cleanSingleLineText("가나다 ", 3)).toBe("가나다");
  });

  it("0 이하의 길이는 빈 문자열이다", () => {
    expect(cleanSingleLineText("가나다", 0)).toBe("");
    expect(cleanSingleLineText("가나다", -5)).toBe("");
  });
});

describe("cleanMultilineText", () => {
  it("줄바꿈은 지키고 제어 문자는 공백으로 바꾼다", () => {
    expect(cleanMultilineText("첫 문단\u0000\n\n\n\n둘째\u0007 문단", 100)).toBe("첫 문단\n\n둘째 문단");
  });

  it("줄바꿈 둘레의 공백과 세 번 이상 이어진 줄바꿈을 정리한다", () => {
    expect(cleanMultilineText("가  \n  나 \t\n\n\n다", 100)).toBe("가\n나\n\n다");
    expect(cleanMultilineText("\r\n가\r\n나\r\n", 100)).toBe("가\n나");
  });

  it("길이는 코드 포인트 기준으로 자른다", () => {
    expect(cleanMultilineText("😀".repeat(10), 3)).toBe("😀😀😀");
    expect([...cleanMultilineText("가".repeat(50), 20)]).toHaveLength(20);
  });
});
