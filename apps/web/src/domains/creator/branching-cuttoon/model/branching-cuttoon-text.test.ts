import { describe, expect, it } from "vitest";

import {
  choiceLabelKey,
  countCodePoints,
  hasUnsafeText,
  isBlankText,
  isValidBranchingId,
  nextFreeId,
} from "./branching-cuttoon-text";

describe("식별자 규칙", () => {
  it.each(["a", "start", "n1", "Scene_2", "end-1", "A".repeat(48), "0", "x_y-z"])("%s 는 유효하다", (id) => {
    expect(isValidBranchingId(id)).toBe(true);
  });

  it.each([
    ["빈 문자열", ""],
    ["밑줄로 시작", "_a"],
    ["붙임표로 시작", "-a"],
    ["공백 포함", "a b"],
    ["한글 포함", "장면"],
    ["49자", "A".repeat(49)],
    ["점 포함", "a.b"],
    ["줄바꿈 포함", "a\nb"],
    ["__proto__", "__proto__"],
  ])("%s 는 유효하지 않다", (_name, id) => {
    expect(isValidBranchingId(id)).toBe(false);
  });
});

describe("코드 포인트 세기", () => {
  it("한글과 영문은 한 글자에 하나다", () => {
    expect(countCodePoints("")).toBe(0);
    expect(countCodePoints("가나다")).toBe(3);
    expect(countCodePoints("abc")).toBe(3);
  });

  it("서로게이트 쌍으로 된 이모지는 하나로 센다", () => {
    expect(countCodePoints("😀")).toBe(1);
    expect(countCodePoints("a😀b")).toBe(3);
    expect("😀".length).toBe(2);
  });

  it("짝이 없는 서로게이트도 던지지 않고 센다", () => {
    expect(countCodePoints("\ud83d")).toBe(1);
  });
});

describe("안전하지 않은 문자", () => {
  it("평범한 한글·영문·기호·이모지 결합 문자는 안전하다", () => {
    expect(hasUnsafeText("우산을 건네 준다 (1)", false)).toBe(false);
    expect(hasUnsafeText("👨‍👩‍👧", false)).toBe(false);
  });

  it.each([
    ["NUL", "\u0000"],
    ["BEL", "\u0007"],
    ["수직 탭", "\u000b"],
    ["폼 피드", "\u000c"],
    ["이스케이프", "\u001b"],
    ["DEL", "\u007f"],
    ["C1 제어", "\u0085"],
    ["제로폭 공백", "​"],
    ["왼쪽→오른쪽 표시", "‎"],
    ["방향 덮어쓰기", "‮"],
    ["방향 격리", "⁦"],
    ["줄 구분자", " "],
    ["문단 구분자", " "],
    ["단어 결합자", "⁠"],
    ["BOM", "﻿"],
  ])("%s 가 들어 있으면 한 줄 글에서도 여러 줄 글에서도 거절한다", (_name, character) => {
    expect(hasUnsafeText(`가${character}나`, false)).toBe(true);
    expect(hasUnsafeText(`가${character}나`, true)).toBe(true);
  });

  it("한 줄 글은 줄바꿈·CR·탭을 거절한다", () => {
    expect(hasUnsafeText("가\n나", false)).toBe(true);
    expect(hasUnsafeText("가\r나", false)).toBe(true);
    expect(hasUnsafeText("가\t나", false)).toBe(true);
  });

  it("여러 줄 글은 LF 만 허용한다", () => {
    expect(hasUnsafeText("가\n나", true)).toBe(false);
    expect(hasUnsafeText("가\r\n나", true)).toBe(true);
    expect(hasUnsafeText("가\t나", true)).toBe(true);
  });
});

describe("선택지 이름 비교 키", () => {
  it("공백·대소문자·전각 문자를 같게 본다", () => {
    expect(choiceLabelKey("  Open   Door ")).toBe("open door");
    expect(choiceLabelKey("OPEN DOOR")).toBe("open door");
    expect(choiceLabelKey("ＯＰＥＮ　ＤＯＯＲ")).toBe("open door");
  });

  it("글이 다르면 키도 다르다", () => {
    expect(choiceLabelKey("문을 연다")).not.toBe(choiceLabelKey("문을 닫는다"));
  });

  it("줄바꿈도 공백 하나로 접는다", () => {
    expect(choiceLabelKey("가\n\n나")).toBe("가 나");
  });
});

describe("빈 글 판정", () => {
  it("공백뿐인 글은 비어 있다", () => {
    expect(isBlankText("")).toBe(true);
    expect(isBlankText("  \t\n ")).toBe(true);
    expect(isBlankText("가")).toBe(false);
  });
});

describe("다음 빈 식별자", () => {
  it("가장 작은 빈 번호를 고른다", () => {
    expect(nextFreeId("n", new Set())).toBe("n1");
    expect(nextFreeId("n", new Set(["n1", "n2"]))).toBe("n3");
    expect(nextFreeId("n", new Set(["n1", "n3"]))).toBe("n2");
  });

  it("접두사가 달라도 서로 간섭하지 않는다", () => {
    expect(nextFreeId("c", new Set(["n1", "c1"]))).toBe("c2");
  });

  it("식별자 길이 안에서 만들 수 없으면 null 이다", () => {
    expect(nextFreeId("x".repeat(48), new Set())).toBeNull();
  });
});
