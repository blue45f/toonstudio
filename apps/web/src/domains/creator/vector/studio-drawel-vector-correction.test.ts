import { describe, expect, it } from "vitest";

import {
  adjustVectorStrokeWidth,
  connectDrawElStrokes,
  effectiveStrokePointWidthsPx,
  pinchDrawElStroke,
  redrawVectorStrokeSegment,
  redrawVectorStrokeWidth,
  splitVectorStrokeAtParameter,
  toggleVectorCornerSmooth,
} from "./studio-drawel-vector-correction";

import type { DrawEl } from "../studio-element-model";

function makeStroke(id: string, points: number[], pressures?: number[], strokeWidth = 4): DrawEl {
  return {
    id,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    brush: "gpen",
    points,
    pressures,
    stroke: "#111111",
    strokeWidth,
  };
}

function turningCosine(points: readonly number[], idx: number): number {
  const v1x = points[idx * 2]! - points[(idx - 1) * 2]!;
  const v1y = points[idx * 2 + 1]! - points[(idx - 1) * 2 + 1]!;
  const v2x = points[(idx + 1) * 2]! - points[idx * 2]!;
  const v2y = points[(idx + 1) * 2 + 1]! - points[idx * 2 + 1]!;
  return (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y));
}

describe("studio-drawel-vector-correction", () => {
  it("pinchDrawElStroke는 양 끝 고정(both) 시 시작점·끝점을 보존하고 중앙부를 탄성 이동시킨다", () => {
    const stroke = makeStroke("s1", [0, 0, 25, 0, 50, 0, 75, 0, 100, 0]);
    const pinched = pinchDrawElStroke(stroke, {
      from: { x: 50, y: 0 },
      to: { x: 50, y: 30 },
      pinchLevel: 7,
      fixEnds: "both",
    });

    expect(pinched.points.slice(0, 2)).toEqual([0, 0]);
    expect(pinched.points.slice(-2)).toEqual([100, 0]);
    expect(pinched.points[5]!).toBeGreaterThan(20);
    expect(pinched.points[3]!).toBeGreaterThan(0);
    expect(pinched.points[3]!).toBeLessThan(pinched.points[5]!);
  });

  it("pinchDrawElStroke는 fixEnds='none' 일 때 끝점도 함께 이동시킨다", () => {
    const stroke = makeStroke("s2", [0, 0, 20, 0, 40, 0]);
    const pinched = pinchDrawElStroke(stroke, {
      from: { x: 0, y: 0 },
      to: { x: 0, y: 15 },
      radiusPx: 50,
      fixEnds: "none",
    });
    expect(pinched.points[1]).toBeCloseTo(15, 5);
  });

  it("connectDrawElStrokes는 반대 방향으로 그려진 두 획의 가장 가까운 끝점을 자동 뒤집어 연결한다", () => {
    const a = makeStroke("a", [0, 0, 40, 0, 80, 0], [0.3, 0.5, 0.7]);
    // b는 오른쪽에서 왼쪽(82,0)으로 끝나므로 endA ↔ endB 가 최단(2px)이다.
    const b = makeStroke("b", [160, 0, 120, 0, 82, 0], [0.2, 0.6, 0.8]);

    const connected = connectDrawElStrokes(a, b, { maxGapPx: 10 });
    expect(connected).not.toBeNull();
    expect(connected!.points.slice(0, 2)).toEqual([0, 0]);
    expect(connected!.points.slice(-2)).toEqual([160, 0]);
    expect(connected!.pressures!.length).toBe(connected!.points.length / 2);

    const tooFar = connectDrawElStrokes(a, makeStroke("c", [200, 0, 240, 0]), { maxGapPx: 12 });
    expect(tooFar).toBeNull();
  });

  it("redrawVectorStrokeSegment는 역방향으로 덧그린 구간도 호길이 순으로 치환하고 이음매를 다듬는다", () => {
    const target = makeStroke(
      "t",
      [0, 0, 20, 0, 40, 0, 60, 0, 80, 0, 100, 0],
      [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    );
    // 70 → 30 역방향 아치 획
    const redraw = {
      points: [70, 2, 50, 24, 30, 2],
      pressures: [0.6, 0.9, 0.6],
    };

    const result = redrawVectorStrokeSegment(target, redraw, { maxSnapDistPx: 20 });
    expect(result.points.slice(0, 2)).toEqual([0, 0]);
    expect(result.points.slice(-2)).toEqual([100, 0]);
    const ys = result.points.filter((_, idx) => idx % 2 === 1);
    expect(Math.max(...ys)).toBeGreaterThan(15);
    expect(result.pressures!.length).toBe(result.points.length / 2);
  });

  it("redrawVectorStrokeWidth는 기하 좌표는 유지한 채 투영 구간의 필압만 갱신한다", () => {
    const target = makeStroke(
      "w",
      [0, 0, 25, 0, 50, 0, 75, 0, 100, 0],
      [0.3, 0.3, 0.3, 0.3, 0.3],
    );
    const guide = {
      points: [20, 3, 50, 3, 80, 3],
      pressures: [0.9, 0.95, 0.9],
    };

    const updated = redrawVectorStrokeWidth(target, guide, { featherPx: 4 });
    expect(updated.points).toEqual(target.points);
    expect(updated.pressures![0]).toBeCloseTo(0.3, 5);
    expect(updated.pressures![4]).toBeCloseTo(0.3, 5);
    expect(updated.pressures![2]!).toBeGreaterThan(0.85);
  });

  it("adjustVectorStrokeWidth는 add/subtract/multiply/constant 및 atLeastOnePixel 하한을 정확히 지킨다", () => {
    const base = makeStroke("adj", [0, 0, 50, 0, 100, 0], [0.5, 0.5, 0.5], 4);

    const added = adjustVectorStrokeWidth(base, { mode: "add", amount: 3 });
    expect(effectiveStrokePointWidthsPx(added)).toEqual([7, 7, 7]);

    const floored = adjustVectorStrokeWidth(base, {
      mode: "subtract",
      amount: 20,
      atLeastOnePixel: true,
    });
    expect(effectiveStrokePointWidthsPx(floored)).toEqual([1, 1, 1]);

    const varied = makeStroke("var", [0, 0, 50, 0, 100, 0], [0.25, 0.5, 1.0], 4);
    const doubled = adjustVectorStrokeWidth(varied, { mode: "multiply", amount: 2 });
    const widths = effectiveStrokePointWidthsPx(doubled);
    expect(widths[0]).toBeCloseTo(4, 4);
    expect(widths[1]).toBeCloseTo(8, 4);
    expect(widths[2]).toBeCloseTo(16, 4);

    const constant = adjustVectorStrokeWidth(varied, { mode: "constant", amount: 5 });
    expect(effectiveStrokePointWidthsPx(constant)).toEqual([5, 5, 5]);
  });

  it("splitVectorStrokeAtParameter는 호길이 비율 지점에서 두 개의 연속된 획으로 분할한다", () => {
    const stroke = makeStroke("sp", [0, 0, 50, 0, 100, 0], [0.2, 0.6, 1.0]);
    const split = splitVectorStrokeAtParameter(stroke, 0.25, ["left", "right"]);
    expect(split).not.toBeNull();
    const [left, right] = split!;
    expect(left.id).toBe("left");
    expect(right.id).toBe("right");
    expect(left.points.slice(-2)).toEqual([25, 0]);
    expect(right.points.slice(0, 2)).toEqual([25, 0]);
    expect(left.pressures!.at(-1)).toBeCloseTo(0.4, 5);
    expect(right.pressures![0]).toBeCloseTo(0.4, 5);
  });

  it("toggleVectorCornerSmooth는 직각 모서리를 둥글게 완화하고 평탄한 구간은 뾰족한 각으로 전환한다", () => {
    const sharp = makeStroke("corner", [0, 0, 50, 0, 50, 50]);
    const smoothed = toggleVectorCornerSmooth(sharp, 1, { mode: "auto" });
    expect(smoothed.points.length / 2).toBe(5);
    expect(turningCosine(smoothed.points, 2)).toBeGreaterThan(0.5);

    const straight = makeStroke("flat", [0, 0, 50, 1, 100, 0]);
    const cusped = toggleVectorCornerSmooth(straight, 1, { mode: "cusp", strength: 0.9 });
    expect(cusped.points[3]!).toBeGreaterThan(1.5);
  });
});
