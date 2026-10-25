import { describe, expect, it } from "vitest";

import {
  endRetryRegionSelection,
  moveRetryRegionSelection,
  startRetryRegionSelection,
} from "./studio-ai-retry-region";

describe("studio-ai-retry-region", () => {
  it("역방향 드래그도 좌상단 기준 사각형으로 만든다", () => {
    const started = startRetryRegionSelection(0.8, 0.7);
    const moved = moveRetryRegionSelection(started, 0.2, 0.3);
    const ended = endRetryRegionSelection(moved);
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    expect(ended.region.x).toBeCloseTo(0.2);
    expect(ended.region.y).toBeCloseTo(0.3);
    expect(ended.region.width).toBeCloseTo(0.6);
    expect(ended.region.height).toBeCloseTo(0.4);
  });

  it("범위를 벗어난 좌표는 0~1로 고정하고 면적이 0이면 실패한다", () => {
    const started = startRetryRegionSelection(-1, 2);
    const moved = moveRetryRegionSelection(started, 0.5, 0.5);
    const ended = endRetryRegionSelection(moved);
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    expect(ended.region.x).toBe(0);
    expect(ended.region.y).toBe(0.5);
    const still = startRetryRegionSelection(0.4, 0.4);
    expect(endRetryRegionSelection(still)).toEqual({
      ok: false,
      reason: "empty_area",
    });
  });
});
