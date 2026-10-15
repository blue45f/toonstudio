import { describe, expect, it } from "vitest";

import { marbleDropWarp, marbleWarpJacobianDet } from "./marbling";

import type { MarbleDrop } from "./marbling";

describe("수미나가시 방울 워프", () => {
  it("단일 방울: 반경 r인 점은 √(r² + a²)로 밀려난다", () => {
    const drops: MarbleDrop[] = [{ x: 0, y: 0, radiusPx: 3 }];
    const q = marbleDropWarp(4, 0, drops);
    expect(q.x).toBeCloseTo(5, 12);
    expect(q.y).toBeCloseTo(0, 12);
    const q2 = marbleDropWarp(0, 4, drops);
    expect(q2.x).toBeCloseTo(0, 12);
    expect(q2.y).toBeCloseTo(5, 12);
  });

  it("중심점은 방울 반경만큼 정해진 방향(+x)으로 밀려난다(결정적)", () => {
    const drops: MarbleDrop[] = [{ x: 10, y: 10, radiusPx: 2 }];
    expect(marbleDropWarp(10, 10, drops)).toEqual({ x: 12, y: 10 });
    expect(marbleDropWarp(10, 10, drops)).toEqual(marbleDropWarp(10, 10, drops));
  });

  it("면적보존: 특이점 밖 야코비 행렬식은 1이다", () => {
    const drops: MarbleDrop[] = [
      { x: 0, y: 0, radiusPx: 5 },
      { x: 30, y: -10, radiusPx: 3 },
    ];
    for (const [x, y] of [[12, 4], [-20, 15], [40, 40], [7, -25]] as const) {
      expect(marbleWarpJacobianDet(x, y, drops)).toBeCloseTo(1, 3);
    }
  });

  it("여러 방울은 순서대로 합성된다", () => {
    const a: MarbleDrop[] = [{ x: 0, y: 0, radiusPx: 3 }];
    const b: MarbleDrop[] = [{ x: 100, y: 0, radiusPx: 4 }];
    const both = marbleDropWarp(4, 0, [...a, ...b]);
    const step = marbleDropWarp(4, 0, a);
    expect(both.x).toBeCloseTo(marbleDropWarp(step.x, step.y, b).x, 12);
    expect(both.y).toBeCloseTo(marbleDropWarp(step.x, step.y, b).y, 12);
  });

  it("유효하지 않은 입력은 RangeError다(무음 보정 없음)", () => {
    expect(() => marbleDropWarp(Number.NaN, 0, [])).toThrow(RangeError);
    expect(() => marbleDropWarp(0, 0, [{ x: 0, y: 0, radiusPx: 0 }])).toThrow(RangeError);
    expect(() => marbleDropWarp(0, 0, [{ x: 0, y: 0, radiusPx: -1 }])).toThrow(RangeError);
  });
});
