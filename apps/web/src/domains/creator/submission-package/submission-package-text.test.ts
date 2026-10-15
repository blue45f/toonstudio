import { describe, expect, it } from "vitest";

import {
  clampCodePoints,
  codePointLength,
  compareNaturalNames,
  escapeMarkdownInline,
  escapeMarkdownLine,
  normalizeSingleLine,
  normalizeUserText,
  toMarkdownQuote,
} from "./submission-package-text";

describe("사용자 글 정리", () => {
  it("제어 문자와 방향 전환 문자를 지우고 줄바꿈은 \\n 으로 통일한다", () => {
    expect(normalizeUserText("가\u0000나‮다\r\n라\r마\u007f")).toBe("가나다\n라\n마");
    expect(normalizeUserText("탭\t유지")).toBe("탭\t유지");
  });

  it("앞뒤 공백을 다듬고, 한 줄 값은 줄바꿈과 공백을 하나로 접는다", () => {
    expect(normalizeUserText("  \n 본문 \n ")).toBe("본문");
    expect(normalizeSingleLine("  제목\n둘째   줄\t끝 ")).toBe("제목 둘째 줄 끝");
  });

  it("NFD 로 들어온 한글도 NFC 로 합친다", () => {
    expect(normalizeUserText("한글".normalize("NFD"))).toBe("한글");
  });

  it("코드 포인트 단위로 세고 자른다", () => {
    expect(codePointLength("😀가")).toBe(2);
    expect(clampCodePoints("😀😀😀", 2)).toBe("😀😀");
    expect(clampCodePoints("abc", 10)).toBe("abc");
    expect(clampCodePoints("abc", 0)).toBe("");
  });
});

describe("Markdown 이스케이프", () => {
  it("HTML 과 강조·링크·표 구분 문자를 무력화한다", () => {
    expect(escapeMarkdownInline("<script>alert(1)</script>")).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(escapeMarkdownInline("*굵게* _기울임_ `코드` [링크](x) a|b ~~취소~~")).toBe(
      "\\*굵게\\* \\_기울임\\_ \\`코드\\` \\[링크\\](x) a\\|b \\~\\~취소\\~\\~",
    );
    expect(escapeMarkdownInline("A & B \\ C")).toBe("A &amp; B \\\\ C");
  });

  it("줄머리의 제목·목록·번호 표시는 문자로 남긴다", () => {
    expect(escapeMarkdownLine("# 제목처럼")).toBe("\\# 제목처럼");
    expect(escapeMarkdownLine("- 목록처럼")).toBe("\\- 목록처럼");
    expect(escapeMarkdownLine("1. 번호처럼")).toBe("\\1. 번호처럼");
    expect(escapeMarkdownLine("=== 밑줄처럼")).toBe("\\=== 밑줄처럼");
    expect(escapeMarkdownLine("가운데 - 하이픈")).toBe("가운데 - 하이픈");
  });

  it("여러 줄 글을 인용 블록으로 바꾸고 빈 줄(단락)을 보존한다", () => {
    expect(toMarkdownQuote("첫 문단\n\n# 둘째 문단")).toBe("> 첫 문단\n>\n> \\# 둘째 문단");
    expect(toMarkdownQuote("   ")).toBe("");
  });
});

describe("파일 이름 비교", () => {
  it("숫자를 크기로 비교해 p2 가 p10 앞에 온다", () => {
    const names = ["p10.png", "p2.png", "p1.png", "p03.png"];
    expect([...names].sort(compareNaturalNames)).toEqual(["p1.png", "p2.png", "p03.png", "p10.png"]);
  });
});
