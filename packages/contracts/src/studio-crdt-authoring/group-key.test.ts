import { describe, expect, it } from "vitest";

import { studioCrdtProjectionGroupKey as legacyGroupKey } from "@toonstudio/contracts/studio-crdt-authoring/element-projection";
import { studioCrdtProjectionGroupKey } from "@toonstudio/contracts/studio-crdt-authoring/group-key";

describe("담당 원고 그룹 키의 식별·공개 경로 계약", () => {
  it("기존 투영 경로와 새 focused 경로가 같은 함수를 제공한다", () => {
    expect(legacyGroupKey).toBe(studioCrdtProjectionGroupKey);
  });

  it("연결한 문자열이 같아도 페이지와 그룹 경계가 다른 식별자를 구분한다", () => {
    const first = studioCrdtProjectionGroupKey("ab", "c");
    const second = studioCrdtProjectionGroupKey("a", "bc");

    expect(first).toBe("2:ab1:c");
    expect(second).toBe("1:a2:bc");
    expect(first).not.toBe(second);
  });

  it.each([
    { pageId: "원고", id: "그룹", expected: "2:원고2:그룹" },
    { pageId: "😀", id: "가", expected: "2:😀1:가" },
    { pageId: "가", id: "😀", expected: "1:가2:😀" },
  ])("한글과 보조 평면 문자의 UTF-16 식별 형식을 유지한다: %j", ({ pageId, id, expected }) => {
    expect(studioCrdtProjectionGroupKey(pageId, id)).toBe(expected);
  });

  it.each([
    { pageId: " p ", id: " g ", expected: "3: p 3: g " },
    { pageId: " ", id: " ", expected: "1: 1: " },
  ])("원래 식별자의 공백을 제거하거나 정규화하지 않는다: %j", ({ pageId, id, expected }) => {
    expect(studioCrdtProjectionGroupKey(pageId, id)).toBe(expected);
  });

  it.each([
    { pageId: "", id: "group" },
    { pageId: "page", id: "" },
    { pageId: "page", id: "page-root" },
  ])("빈 식별자와 예약된 그룹은 기존 Error 메시지로 거부한다: %j", ({ pageId, id }) => {
    expect(() => studioCrdtProjectionGroupKey(pageId, id)).toThrowError(
      new Error("레이어 그룹 식별자가 올바르지 않습니다."),
    );
  });
});
