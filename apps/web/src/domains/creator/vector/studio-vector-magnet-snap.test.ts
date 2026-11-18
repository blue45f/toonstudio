import { describe, expect, it } from "vitest";

import {
  buildVectorMagnetGrid,
  queryNearestVectorMagnetTarget,
  snapStrokeWithVectorMagnet,
} from "./studio-vector-magnet-snap";

import type { DrawEl } from "../studio-element-model";

function freehand(id: string, points: number[]): DrawEl {
  return {
    id,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    brush: "gpen",
    points,
    stroke: "#000000",
    strokeWidth: 3,
  };
}

describe("studio-vector-magnet-snap", () => {
  it("균일 격자 공간 해시가 반경 안의 끝점을 곡선 내부 선분보다 우선 선택한다", () => {
    const existingA = freehand("a", [100, 100, 160, 100]);
    const existingB = freehand("b", [80, 104, 140, 104]);
    const grid = buildVectorMagnetGrid([existingA, existingB], 24);

    // (103, 104)는 b의 선분까지 거리 0이지만 a의 끝점(100,100)까지 거리 5이고 우선순위 비율을 높이면 끝점 스냅 확인 가능
    const nearEnd = queryNearestVectorMagnetTarget(
      grid,
      { x: 102, y: 101 },
      { magnetRadiusPx: 16, endpointPriorityRatio: 1.5 },
    );
    expect(nearEnd).not.toBeNull();
    expect(nearEnd!.kind).toBe("endpoint");
    expect(nearEnd!.strokeId).toBe("a");
    expect(nearEnd!.x).toBe(100);
    expect(nearEnd!.y).toBe(100);
  });

  it("근처에 끝점이 없으면 가장 가까운 선분 투영점으로 스냅한다", () => {
    const rail = freehand("rail", [0, 50, 200, 50]);
    const grid = buildVectorMagnetGrid([rail], 32);

    const hit = queryNearestVectorMagnetTarget(
      grid,
      { x: 95, y: 58 },
      { magnetRadiusPx: 15 },
    );
    expect(hit).not.toBeNull();
    expect(hit!.kind).toBe("segment");
    expect(hit!.x).toBeCloseTo(95, 5);
    expect(hit!.y).toBeCloseTo(50, 5);
  });

  it("snapStrokeWithVectorMagnet는 양 끝을 스냅하고 주변 k개 샘플에 단조 Hermite 감쇠를 적용한다", () => {
    const leftAnchor = freehand("left", [0, 0, 50, 100]);
    const rightAnchor = freehand("right", [250, 100, 300, 0]);
    const grid = buildVectorMagnetGrid([leftAnchor, rightAnchor], 32);

    const drawn = freehand("new", [
      54, 94,
      80, 94,
      110, 94,
      150, 94,
      190, 94,
      220, 94,
      246, 94,
    ]);

    const snapped = snapStrokeWithVectorMagnet(drawn, grid, {
      useVectorMagnet: true,
      magnetPower: 80,
      magnetRadiusPx: 14,
      falloffSamples: 3,
    });

    expect(snapped.startSnap?.strokeId).toBe("left");
    expect(snapped.endSnap?.strokeId).toBe("right");
    expect(snapped.stroke.points.slice(0, 2)).toEqual([50, 100]);
    expect(snapped.stroke.points.slice(-2)).toEqual([250, 100]);

    // Hermite 감쇠에 의해 첫 샘플(100) → 두 번째 → 세 번째 → 중앙(94) 순으로 단조 감소해야 한다.
    const y0 = snapped.stroke.points[1]!;
    const y1 = snapped.stroke.points[3]!;
    const y2 = snapped.stroke.points[5]!;
    const yMid = snapped.stroke.points[7]!;
    expect(y0).toBeGreaterThan(y1);
    expect(y1).toBeGreaterThan(y2);
    expect(y2).toBeGreaterThan(yMid);
    expect(yMid).toBeCloseTo(94, 5);
  });

  it("자석이 꺼져 있거나 자기 자신 획만 있을 때는 원본 좌표를 그대로 보존한다", () => {
    const self = freehand("self", [10, 10, 40, 10, 80, 10]);
    const grid = buildVectorMagnetGrid([self], 32);

    const disabled = snapStrokeWithVectorMagnet(self, grid, {
      useVectorMagnet: false,
      magnetPower: 100,
    });
    expect(disabled.stroke).toBe(self);

    const excludedSelf = snapStrokeWithVectorMagnet(self, grid, {
      useVectorMagnet: true,
      magnetPower: 100,
      magnetRadiusPx: 20,
    });
    expect(excludedSelf.startSnap).toBeNull();
    expect(excludedSelf.endSnap).toBeNull();
    expect(excludedSelf.stroke).toBe(self);
  });
});
