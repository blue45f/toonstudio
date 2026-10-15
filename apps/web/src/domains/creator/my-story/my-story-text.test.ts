import { describe, expect, it } from "vitest";

import {
  cleanMyStoryAnswer,
  clampMyStoryText,
  detectMyStorySensitiveKinds,
  extractMyStoryQuotes,
  mergeMyStorySensitiveKinds,
  splitMyStoryNarration,
} from "./my-story-text";

describe("cleanMyStoryAnswer / clampMyStoryText", () => {
  it("제어 문자를 버리고 공백·줄바꿈을 한 칸으로 접되 낱말은 바꾸지 않는다", () => {
    expect(cleanMyStoryAnswer("  수돗가에서\n\n수박을\t나눠   먹었다 \u0000\u0007 ")).toBe("수돗가에서 수박을 나눠 먹었다");
  });

  it("코드 포인트 기준으로 자르므로 이모지가 반쪽으로 깨지지 않는다", () => {
    expect(clampMyStoryText("가나다😀라마", 4)).toBe("가나다😀");
    expect(clampMyStoryText("가나", 4)).toBe("가나");
    expect(cleanMyStoryAnswer("😀".repeat(10), 3)).toBe("😀😀😀");
  });
});

describe("splitMyStoryNarration", () => {
  it("한도 안의 답변은 한 상자 그대로다", () => {
    expect(splitMyStoryNarration("열두 살 여름", 40)).toEqual(["열두 살 여름"]);
  });

  it("빈 답변이면 빈 배열이다(빈칸으로 남긴다)", () => {
    expect(splitMyStoryNarration("   ", 40)).toEqual([]);
    expect(splitMyStoryNarration("", 40)).toEqual([]);
  });

  it("문장 경계에서 나누고 한 상자에 들어가는 문장은 묶는다", () => {
    const text = "수돗가에 모였다. 수박을 나눠 먹었다. 동생이 웃었다.";
    expect(splitMyStoryNarration(text, 12)).toEqual(["수돗가에 모였다.", "수박을 나눠 먹었다.", "동생이 웃었다."]);
    // 한 상자에 들어가는 이웃 문장은 하나로 묶인다.
    expect(splitMyStoryNarration(text, 20)).toEqual(["수돗가에 모였다.", "수박을 나눠 먹었다. 동생이 웃었다."]);
    expect(splitMyStoryNarration(text, 60)).toEqual([text]);
  });

  it("한 문장이 한도보다 길면 띄어쓰기에서 나눈다 — 글자를 빼거나 붙이지 않는다", () => {
    const text = "아주 오래전 여름방학에 외갓집 마당에서 수박을 먹었다";
    const chunks = splitMyStoryNarration(text, 14);
    expect(chunks.every((chunk) => Array.from(chunk).length <= 14)).toBe(true);
    expect(chunks.join(" ")).toBe(text);
  });

  it("띄어쓰기 없는 긴 낱말은 글자 수로 나눈다", () => {
    const chunks = splitMyStoryNarration("가나다라마바사아자차", 4);
    expect(chunks).toEqual(["가나다라", "마바사아", "자차"]);
  });
});

describe("extractMyStoryQuotes", () => {
  it("사용자가 직접 따옴표로 묶은 말만 순서대로 뽑는다", () => {
    expect(extractMyStoryQuotes("할머니가 “많이 먹어라” 하셨고 동생은 \"내 거야\"라고 했다 「그래」"))
      .toEqual(["많이 먹어라", "내 거야", "그래"]);
  });

  it("따옴표가 없으면 대사를 만들지 않는다", () => {
    expect(extractMyStoryQuotes("할머니가 많이 먹으라고 하셨다")).toEqual([]);
    expect(extractMyStoryQuotes("")).toEqual([]);
  });

  it("빈 따옴표와 영어 축약형 아포스트로피는 대사로 보지 않는다", () => {
    expect(extractMyStoryQuotes("“ ” and don't stop")).toEqual([]);
  });
});

describe("detectMyStorySensitiveKinds", () => {
  it("휴대폰·유선 번호를 찾는다", () => {
    expect(detectMyStorySensitiveKinds("연락은 010-1234-5678로")).toEqual(["phone"]);
    expect(detectMyStorySensitiveKinds("집 전화 02-123-4567")).toEqual(["phone"]);
    expect(detectMyStorySensitiveKinds("01012345678")).toEqual(["phone"]);
  });

  it("이메일과 주민등록번호 형태를 찾는다", () => {
    expect(detectMyStorySensitiveKinds("mail me: someone@example.com")).toEqual(["email"]);
    expect(detectMyStorySensitiveKinds("901231-1234567")).toEqual(["resident-id"]);
  });

  it("긴 숫자열(계좌 형태)을 찾되 날짜·연도·짧은 숫자는 잡지 않는다", () => {
    expect(detectMyStorySensitiveKinds("계좌 110-123-456789")).toEqual(["account"]);
    expect(detectMyStorySensitiveKinds("1998-05-12 생일, 2019년 3월, 열두 살, 3000원")).toEqual([]);
    expect(detectMyStorySensitiveKinds("2024-03-15")).toEqual([]);
  });

  it("여러 종류를 한 번에 알리고, 칸을 합칠 때는 안정된 순서로 중복을 없앤다", () => {
    expect(detectMyStorySensitiveKinds("010-1234-5678 a@b.co")).toEqual(["email", "phone"]);
    expect(mergeMyStorySensitiveKinds([["email"], ["phone", "email"], []])).toEqual(["phone", "email"]);
  });

  it("같은 입력에 몇 번을 호출해도 결과가 같다(전역 정규식 상태가 새지 않는다)", () => {
    const input = "010-1234-5678";
    expect(detectMyStorySensitiveKinds(input)).toEqual(["phone"]);
    expect(detectMyStorySensitiveKinds(input)).toEqual(["phone"]);
    expect(detectMyStorySensitiveKinds("평범한 문장")).toEqual([]);
  });
});
