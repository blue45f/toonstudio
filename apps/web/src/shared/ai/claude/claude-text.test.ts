import { describe, expect, it } from "vitest";

import { cleanMultilineText, cleanMultilineTextDetailed, cleanSingleLineText, cleanSingleLineTextDetailed } from "./claude-text";

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

  it("C1 제어 문자와 줄·문단 구분 문자도 공백으로 바꾼다", () => {
    expect(cleanSingleLineText("가\u0085나\u009f다 라 마", 100)).toBe("가 나 다 라 마");
  });

  it("글자 순서를 뒤집거나 보이지 않는 서식 문자는 지운다", () => {
    expect(cleanSingleLineText("abc‮def⁦x⁩y‏z", 100)).toBe("abcdefxyz");
    expect(cleanSingleLineText("a​b﻿c­d⁠e؜f᠎g", 100)).toBe("abcdefg");
    expect(cleanSingleLineText("a\u{E0041}\u{E0062}b", 100)).toBe("ab");
  });

  it("이모지와 문자 체계에 쓰이는 ZWJ·ZWNJ·변이 선택자는 남긴다", () => {
    const family = "👨‍👩‍👧";
    expect(cleanSingleLineText(family, 100)).toBe(family);
    expect(cleanSingleLineText("می‌خواهم", 100)).toBe("می‌خواهم");
    expect(cleanSingleLineText("❤️", 100)).toBe("❤️");
  });

  it("잘라야 할 때 이모지 가족·피부색·결합 문자 같은 글자 덩어리를 쪼개지 않는다", () => {
    const family = "👨‍👩‍👧‍👦";
    expect(cleanSingleLineText(`가나다${family}`, 5)).toBe("가나다");
    expect(cleanSingleLineText(`가나다${family}`, 10)).toBe(`가나다${family}`);
    expect(cleanSingleLineText("가👍🏽나", 2)).toBe("가");
    expect(cleanSingleLineText("가👍🏽나", 3)).toBe("가👍🏽");
    expect(cleanSingleLineText("éx", 2)).toBe("é");
  });

  it("첫 덩어리부터 한도를 넘는 입력은 코드 포인트 기준으로 자르고 끝의 ZWJ를 남기지 않는다", () => {
    const clipped = cleanSingleLineText("👨‍👩‍👧‍👦", 2);
    expect(clipped.endsWith("‍")).toBe(false);
    expect([...clipped].length).toBeLessThanOrEqual(2);
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

  it("U+0085·U+2028·U+2029는 줄바꿈으로 보고 방향 제어·BOM은 지운다", () => {
    expect(cleanMultilineText("가\u0085나 다 라", 100)).toBe("가\n나\n다\n라");
    expect(cleanMultilineText("﻿가‮나⁦다⁩", 100)).toBe("가나다");
    expect(cleanMultilineText("첫째   둘째", 100)).toBe("첫째\n\n둘째");
  });

  it("자를 때 글자 덩어리를 쪼개지 않는다", () => {
    const family = "👨‍👩‍👧";
    expect(cleanMultilineText(`가\n${family}`, 3)).toBe("가");
  });
});

describe("잘렸는지 알려 주는 정리 함수", () => {
  it("한도 안이면 잘리지 않았다고 알린다", () => {
    expect(cleanSingleLineTextDetailed("  가나다  ", 3)).toEqual({ text: "가나다", clipped: false });
    expect(cleanMultilineTextDetailed("가\n나", 10)).toEqual({ text: "가\n나", clipped: false });
  });

  it("한도를 넘어 잘렸으면 그 사실과 잘린 글을 함께 돌려준다", () => {
    expect(cleanSingleLineTextDetailed("가나다라", 3)).toEqual({ text: "가나다", clipped: true });
    expect(cleanMultilineTextDetailed("가나다\n라마바", 4)).toEqual({ text: "가나다", clipped: true });
    expect(cleanSingleLineTextDetailed("가나다", 0)).toEqual({ text: "", clipped: true });
  });

  it("공백 정리로 줄어든 것은 잘린 것으로 치지 않는다", () => {
    expect(cleanSingleLineTextDetailed("가    나    다", 5)).toEqual({ text: "가 나 다", clipped: false });
  });
});
