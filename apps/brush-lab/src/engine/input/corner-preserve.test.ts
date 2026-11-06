import { describe, expect, it } from "vitest";

import { CornerGuard } from "./corner-preserve";

import type { TimedPt } from "./corner-preserve";

describe("CornerGuard.pickVertex", () => {
  it("자기 교차 획에서 앵커에 tMs가 주어지면 같은 (x, y)의 이전·이후 방문과 혼동하지 않고 해당 tMs 앵커부터 정점을 찾는다", () => {
    const guard = new CornerGuard<TimedPt>();
    // (10, 10)을 tMs=10에 방문한 뒤 (30, 50, tMs=20) 정점을 거쳐 (10, 10, tMs=30)에 재방문한 자기 교차 이력
    const visit1: TimedPt = { x: 10, y: 10, tMs: 10 };
    const cornerPeak: TimedPt = { x: 30, y: 50, tMs: 20 };
    const visit2: TimedPt = { x: 10, y: 10, tMs: 30 };
    const afterVisit2: TimedPt = { x: 12, y: 11, tMs: 34 };
    guard.record(visit1);
    guard.record(cornerPeak);
    guard.record(visit2);
    guard.record(afterVisit2);

    // 앵커가 첫 방문(tMs=10)이면 이후 재방문(tMs=30)에 가로채이지 않고 실제 꺾임점 cornerPeak(tMs=20)를 골라야 한다.
    const pickedFromVisit1 = guard.pickVertex({ x: 10, y: 10, tMs: 10 }, { x: 50, y: 10 });
    expect(pickedFromVisit1).toBe(cornerPeak);

    // 이미 이력에서 밀려난 tMs=99 앵커가 (10, 10) 좌표를 공유하더라도 이전 방문(tMs=10, 30)과 잘못 매칭하지 않고 null을 돌려준다.
    const pickedEvicted = guard.pickVertex({ x: 10, y: 10, tMs: 99 }, { x: 50, y: 10 });
    expect(pickedEvicted).toBeNull();

    // tMs가 생략된 호출(하위 호환)은 가장 최근의 (x, y) 일치를 사용한다.
    const pickedWithoutTMs = guard.pickVertex({ x: 10, y: 10 }, { x: 50, y: 10 });
    expect(pickedWithoutTMs).toBe(afterVisit2);
  });
});
