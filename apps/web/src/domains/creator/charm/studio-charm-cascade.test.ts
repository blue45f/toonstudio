import { describe, expect, it } from "vitest";

import { createStudioCharmCascade } from "./studio-charm-cascade";

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
