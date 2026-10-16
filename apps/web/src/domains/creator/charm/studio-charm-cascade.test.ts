import { describe, expect, it } from "vitest";

import { createStudioCharmBurst, createStudioCharmCascade } from "./studio-charm-cascade";

describe("연속 삽입 계단 카운터", () => {
  it("같은 대상에 5초 안에 이어 붙이면 늘고, 다른 대상이거나 시간이 지나면 처음부터다", () => {
    const next = createStudioCharmCascade();
    expect(next("a", 0)).toBe(0);
    expect(next("a", 1_000)).toBe(1);
    expect(next("a", 2_000)).toBe(2);
    expect(next("b", 2_500)).toBe(0);
    expect(next("b", 8_000)).toBe(0);
  });
});

describe("연속 삽입 선택 이어 받기", () => {
  interface Selection {
    readonly id?: string;
    readonly name: string;
  }
  const FRAME: Selection = { id: "frame-1", name: "컷" };
  const NEW_1: Selection = { id: "new-1", name: "방금 붙인 요소 1" };
  const NEW_2: Selection = { id: "new-2", name: "방금 붙인 요소 2" };
  const PHOTO: Selection = { id: "photo", name: "원래 있던 요소" };
  const EXISTING = ["frame-1", "photo"];

  it("첫 읽기는 세션의 선택 그대로다", () => {
    const resolve = createStudioCharmBurst<Selection>();
    expect(resolve(FRAME, EXISTING, 0)).toBe(FRAME);
  });

  it("직전에 읽은 뒤 새로 생긴 요소가 선택돼 있으면 붙이기 결과로 보고 직전 선택을 이어 받는다", () => {
    const resolve = createStudioCharmBurst<Selection>();
    expect(resolve(FRAME, EXISTING, 0)).toBe(FRAME);
    expect(resolve(NEW_1, [...EXISTING, "new-1"], 1_000)).toBe(FRAME);
    // 이어 받은 뒤에도 계속 이어진다: 세 번째 읽기에서 새로 생긴 요소는 두 번째 붙이기의 결과다.
    expect(resolve(NEW_2, [...EXISTING, "new-1", "new-2"], 2_000)).toBe(FRAME);
  });

  it("처음에 선택이 없었다면 없음을 이어 받는다(보이는 화면 중앙에서 계속)", () => {
    const resolve = createStudioCharmBurst<Selection>();
    expect(resolve(null, EXISTING, 0)).toBeNull();
    expect(resolve(NEW_1, [...EXISTING, "new-1"], 1_000)).toBeNull();
  });

  it("문서에 원래 있던 요소를 직접 고르면 이어 받지 않고 그 선택을 따른다", () => {
    const resolve = createStudioCharmBurst<Selection>();
    resolve(FRAME, EXISTING, 0);
    resolve(NEW_1, [...EXISTING, "new-1"], 1_000);
    expect(resolve(PHOTO, [...EXISTING, "new-1"], 2_000)).toBe(PHOTO);
  });

  it("선택을 풀면 이어 받지 않는다", () => {
    const resolve = createStudioCharmBurst<Selection>();
    resolve(FRAME, EXISTING, 0);
    expect(resolve(null, [...EXISTING, "new-1"], 1_000)).toBeNull();
  });

  it("직접 고른 요소가 바뀌면 그 요소가 새 출발점이다", () => {
    const resolve = createStudioCharmBurst<Selection>();
    resolve(FRAME, EXISTING, 0);
    resolve(PHOTO, [...EXISTING, "new-1"], 1_000);
    expect(resolve(NEW_2, [...EXISTING, "new-1", "new-2"], 2_000)).toBe(PHOTO);
  });

  it("5초가 지나면 이어 받지 않는다(방금 붙인 요소가 선택돼 있어도 그 선택을 따른다)", () => {
    const resolve = createStudioCharmBurst<Selection>();
    resolve(FRAME, EXISTING, 0);
    expect(resolve(NEW_1, [...EXISTING, "new-1"], 5_000)).toBe(NEW_1);
  });

  it("요소 목록을 모르거나 선택에 ID 가 없으면 이어 받지 않는다", () => {
    const unknownElements = createStudioCharmBurst<Selection>();
    unknownElements(FRAME, null, 0);
    expect(unknownElements(NEW_1, null, 1_000)).toBe(NEW_1);

    const withoutId = createStudioCharmBurst<Selection>();
    withoutId(FRAME, EXISTING, 0);
    const anonymous: Selection = { name: "ID 없는 선택" };
    expect(withoutId(anonymous, EXISTING, 1_000)).toBe(anonymous);
  });
});
