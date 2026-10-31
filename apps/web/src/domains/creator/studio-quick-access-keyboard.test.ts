import { describe, expect, it } from "vitest";

import {
  compareStudioQuickAccessTabOrder,
  studioQuickAccessKeyboardClaimed,
  studioQuickAccessTabBoundary,
} from "./studio-quick-access-keyboard";

describe("빠른 액세스의 키보드 경계", () => {
  it.each([
    ["비어 있음", 0, -1, false, -1],
    ["비어 있음·역방향", 0, -1, true, -1],
    ["컨테이너·정방향", 3, -1, false, 0],
    ["컨테이너·역방향", 3, -1, true, 2],
    ["마지막·정방향", 3, 2, false, 0],
    ["처음·역방향", 3, 0, true, 2],
    ["중간·정방향", 3, 1, false, null],
    ["중간·역방향", 3, 1, true, null],
    ["처음·정방향", 3, 0, false, null],
    ["마지막·역방향", 3, 2, true, null],
    ["하나·정방향", 1, 0, false, 0],
    ["하나·역방향", 1, 0, true, 0],
    ["사라진 항목", 2, 4, false, 0],
  ] as const)("%s일 때 필요한 경계만 처리한다", (_name, count, active, backwards, expected) => {
    expect(studioQuickAccessTabBoundary(count, active, backwards)).toBe(expected);
  });

  it.each([
    ["일반", false, false, 27, false],
    ["하위 입력 우선", true, false, 81, true],
    ["조합 중", false, true, 27, true],
    ["IME229", false, false, 229, true],
  ] as const)("%s 키의 소유를 존중한다", (_name, defaultPrevented, isComposing, keyCode, expected) => {
    expect(studioQuickAccessKeyboardClaimed({ defaultPrevented, isComposing, keyCode })).toBe(expected);
  });

  it("양수 tabindex를 앞에 두고 동순위의 문서 순서를 유지한다", () => {
    const entries = [{ id: "a", tabIndex: 0 }, { id: "b", tabIndex: 2 }, { id: "c", tabIndex: 1 },
      { id: "d", tabIndex: 0 }, { id: "e", tabIndex: 2 }];
    expect([...entries].sort((a, b) => compareStudioQuickAccessTabOrder(a.tabIndex, b.tabIndex))
      .map((entry) => entry.id)).toEqual(["c", "b", "e", "a", "d"]);
    expect(entries.map((entry) => entry.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
});
