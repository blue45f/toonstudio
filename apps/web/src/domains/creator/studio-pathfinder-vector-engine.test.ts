import { describe, expect, it } from "vitest";

import {
  StudioPathfinderVectorEngine,
  type StudioPathfinderBooleanResult,
  type StudioPathfinderPolygon,
} from "./studio-pathfinder-vector-engine";

// ---------------------------------------------------------------------------
// 기하 단언 헬퍼 — "점 개수" 같은 껍데기 단언이 아니라 면적·포함·자기교차로 검증한다
// ---------------------------------------------------------------------------

const rect = (x1: number, y1: number, x2: number, y2: number): StudioPathfinderPolygon => ({
  points: [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ],
});

const area = (result: StudioPathfinderBooleanResult): number =>
  StudioPathfinderVectorEngine.booleanResultArea(result);

function signedRingArea(points: readonly { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

function segmentsProperlyCross(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number },
): boolean {
  const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
  const d1 = cross(p2.x - p1.x, p2.y - p1.y, p3.x - p1.x, p3.y - p1.y);
  const d2 = cross(p2.x - p1.x, p2.y - p1.y, p4.x - p1.x, p4.y - p1.y);
  const d3 = cross(p4.x - p3.x, p4.y - p3.y, p1.x - p3.x, p1.y - p3.y);
  const d4 = cross(p4.x - p3.x, p4.y - p3.y, p2.x - p3.x, p2.y - p3.y);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

function ringSelfIntersects(points: readonly { x: number; y: number }[]): boolean {
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if ((i + 1) % n === j || (j + 1) % n === i) continue;
      if (
        segmentsProperlyCross(points[i]!, points[(i + 1) % n]!, points[j]!, points[(j + 1) % n]!)
      ) {
        return true;
      }
    }
  }
  return false;
}

function pointInRing(x: number, y: number, ring: readonly { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const pi = ring[i]!;
    const pj = ring[j]!;
    if ((pi.y > y) !== (pj.y > y) && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInResult(result: StudioPathfinderBooleanResult, x: number, y: number): boolean {
  return result.regions.some(
    (region) =>
      pointInRing(x, y, region.outer.points)
      && !region.holes.some((hole) => pointInRing(x, y, hole.points)),
  );
}

/** 모든 결과 링이 단순(자기교차 없음)하고 부호 규약(외곽 +, 구멍 −)을 지키는지. */
function expectCleanResult(result: StudioPathfinderBooleanResult): void {
  for (const region of result.regions) {
    expect(ringSelfIntersects(region.outer.points)).toBe(false);
    expect(signedRingArea(region.outer.points)).toBeGreaterThan(0);
    const keys = region.outer.points.map((p) => `${p.x},${p.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const hole of region.holes) {
      expect(ringSelfIntersects(hole.points)).toBe(false);
      expect(signedRingArea(hole.points)).toBeLessThan(0);
    }
  }
}

// ---------------------------------------------------------------------------

describe("StudioPathfinderVectorEngine.offsetPathOutline", () => {
  it("expands 2D point sequence into offset path outline polygon", () => {
    const points = [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 50 },
    ];
    const polygon = StudioPathfinderVectorEngine.offsetPathOutline(points, 5);
    expect(polygon.points.length).toBeGreaterThan(0);
  });

  it("keeps the endpoint offset when the last point is duplicated", () => {
    const polygon = StudioPathfinderVectorEngine.offsetPathOutline(
      [
        { x: 10, y: 10 },
        { x: 50, y: 10 },
        { x: 50, y: 10 },
      ],
      5,
    );
    expect(polygon.points.length).toBeGreaterThan(0);
  });

  it("does not poison coordinates with a NaN radius", () => {
    const polygon = StudioPathfinderVectorEngine.offsetPathOutline(
      [
        { x: 10, y: 10 },
        { x: 50, y: 10 },
      ],
      Number.NaN,
    );
    expect(polygon.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe("StudioPathfinderVectorEngine.offsetPathOutline joins", () => {
  // 직각으로 꺾이는 경로 — 정점 (10,0), 반경 2. 왼쪽은 안쪽 코너, 오른쪽은 바깥 코너.
  const elbow = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];
  const hasPoint = (
    points: readonly { x: number; y: number }[],
    x: number,
    y: number,
  ): boolean => points.some((p) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9);

  it("keeps straight-line output identical to the legacy outline", () => {
    const polygon = StudioPathfinderVectorEngine.offsetPathOutline(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      2,
    );
    expect(polygon.points).toEqual([
      { x: 0, y: 2 },
      { x: 10, y: 2 },
      { x: 10, y: -2 },
      { x: 0, y: -2 },
    ]);
  });

  it("miter (default) extends the outer corner to the offset-line intersection", () => {
    const polygon = StudioPathfinderVectorEngine.offsetPathOutline(elbow, 2);
    // 바깥 코너 miter 점 (12,-2), 안쪽 코너 교점 (8,2)
    expect(hasPoint(polygon.points, 12, -2)).toBe(true);
    expect(hasPoint(polygon.points, 8, 2)).toBe(true);
    expect(hasPoint(polygon.points, 10, -2)).toBe(false);
    expect(ringSelfIntersects(polygon.points)).toBe(false);
  });

  it("bevel cuts the outer corner straight between the two offset points", () => {
    const polygon = StudioPathfinderVectorEngine.offsetPathOutline(elbow, 2, { join: "bevel" });
    expect(hasPoint(polygon.points, 10, -2)).toBe(true);
    expect(hasPoint(polygon.points, 12, 0)).toBe(true);
    expect(hasPoint(polygon.points, 12, -2)).toBe(false);
    // 안쪽 코너는 조인과 무관하게 교점으로 동일하다
    expect(hasPoint(polygon.points, 8, 2)).toBe(true);
    expect(ringSelfIntersects(polygon.points)).toBe(false);
  });

  it("round interpolates the outer corner on a circle of radius |r| around the vertex", () => {
    const polygon = StudioPathfinderVectorEngine.offsetPathOutline(elbow, 2, { join: "round" });
    const arcPoints = polygon.points.filter((p) => p.y < 0 && p.x > 5);
    expect(arcPoints.length).toBeGreaterThanOrEqual(5);
    for (const p of arcPoints) {
      expect(Math.hypot(p.x - 10, p.y - 0)).toBeCloseTo(2, 9);
    }
    expect(hasPoint(polygon.points, 12, -2)).toBe(false);
    expect(ringSelfIntersects(polygon.points)).toBe(false);
  });

  it("falls back to bevel when the miter would exceed the miter limit (acute corner)", () => {
    const rad = (160 * Math.PI) / 180;
    const acute = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10 + 10 * Math.cos(rad), y: 10 * Math.sin(rad) },
    ];
    const polygon = StudioPathfinderVectorEngine.offsetPathOutline(acute, 2);
    // bevel 폴백: 바깥쪽 오프셋 끝점이 남아 있다(miter 였다면 교점 1개로 대체됨)
    expect(hasPoint(polygon.points, 10, -2)).toBe(true);
  });

  it("honours an explicit larger miter limit on the same acute corner", () => {
    const rad = (160 * Math.PI) / 180;
    const acute = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10 + 10 * Math.cos(rad), y: 10 * Math.sin(rad) },
    ];
    const limited = StudioPathfinderVectorEngine.offsetPathOutline(acute, 2, { miterLimit: 4 });
    const generous = StudioPathfinderVectorEngine.offsetPathOutline(acute, 2, { miterLimit: 20 });
    expect(generous.points.length).toBeLessThan(limited.points.length);
  });
});

describe("StudioPathfinderVectorEngine.booleanUnion", () => {
  const A = rect(0, 0, 10, 10);
  const B = rect(5, 5, 15, 15);

  it("computes the true union area of overlapping squares", () => {
    const result = StudioPathfinderVectorEngine.booleanUnion(A, B);
    expect(area(result)).toBeCloseTo(175, 6);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0]!.holes).toHaveLength(0);
    expect(pointInResult(result, 2, 2)).toBe(true);
    expect(pointInResult(result, 12, 12)).toBe(true);
    expect(pointInResult(result, 12, 2)).toBe(false);
    expectCleanResult(result);
  });

  it("returns two regions for disjoint squares", () => {
    const result = StudioPathfinderVectorEngine.booleanUnion(A, rect(20, 0, 30, 10));
    expect(area(result)).toBeCloseTo(200, 6);
    expect(result.regions).toHaveLength(2);
    expectCleanResult(result);
  });

  it("returns the outer square when one contains the other", () => {
    const result = StudioPathfinderVectorEngine.booleanUnion(A, rect(2, 2, 4, 4));
    expect(area(result)).toBeCloseTo(100, 6);
    expect(result.regions).toHaveLength(1);
  });

  it("removes the shared edge when squares touch along a full edge", () => {
    const result = StudioPathfinderVectorEngine.booleanUnion(A, rect(10, 0, 20, 10));
    expect(area(result)).toBeCloseTo(200, 6);
    expect(result.regions).toHaveLength(1);
    expectCleanResult(result);
  });

  it("merges squares sharing only part of an edge", () => {
    const result = StudioPathfinderVectorEngine.booleanUnion(A, rect(10, 2, 20, 8));
    expect(area(result)).toBeCloseTo(160, 6);
    expect(result.regions).toHaveLength(1);
    expectCleanResult(result);
  });

  it("keeps corner-touching squares as two regions", () => {
    const result = StudioPathfinderVectorEngine.booleanUnion(A, rect(10, 10, 20, 20));
    expect(area(result)).toBeCloseTo(200, 6);
    expect(result.regions).toHaveLength(2);
    expectCleanResult(result);
  });

  it("does not depend on input winding", () => {
    const reversedB: StudioPathfinderPolygon = { points: B.points.slice().reverse() };
    const result = StudioPathfinderVectorEngine.booleanUnion(A, reversedB);
    expect(area(result)).toBeCloseTo(175, 6);
  });
});

describe("StudioPathfinderVectorEngine.booleanIntersect", () => {
  const A = rect(0, 0, 10, 10);

  it("computes the overlap polygon of overlapping squares", () => {
    const result = StudioPathfinderVectorEngine.booleanIntersect(A, rect(5, 5, 15, 15));
    expect(area(result)).toBeCloseTo(25, 6);
    expect(result.regions).toHaveLength(1);
    const keys = result.regions[0]!.outer.points.map((p) => `${p.x},${p.y}`).sort();
    expect(keys).toEqual(["10,10", "10,5", "5,10", "5,5"]);
    expectCleanResult(result);
  });

  it("is empty for disjoint squares", () => {
    expect(
      StudioPathfinderVectorEngine.booleanIntersect(A, rect(20, 20, 30, 30)).regions,
    ).toHaveLength(0);
  });

  it("returns the inner square for containment", () => {
    const result = StudioPathfinderVectorEngine.booleanIntersect(A, rect(2, 2, 4, 4));
    expect(area(result)).toBeCloseTo(4, 6);
  });

  it("is empty when squares only share an edge or a corner", () => {
    expect(
      StudioPathfinderVectorEngine.booleanIntersect(A, rect(10, 0, 20, 10)).regions,
    ).toHaveLength(0);
    expect(
      StudioPathfinderVectorEngine.booleanIntersect(A, rect(10, 10, 20, 20)).regions,
    ).toHaveLength(0);
  });
});

describe("StudioPathfinderVectorEngine.booleanDifference", () => {
  const A = rect(0, 0, 10, 10);

  it("cuts the overlapping part out", () => {
    const result = StudioPathfinderVectorEngine.booleanDifference(A, rect(5, 5, 15, 15));
    expect(area(result)).toBeCloseTo(75, 6);
    expect(pointInResult(result, 2, 2)).toBe(true);
    expect(pointInResult(result, 7, 7)).toBe(false);
    expectCleanResult(result);
  });

  it("is empty when B covers A completely", () => {
    expect(
      StudioPathfinderVectorEngine.booleanDifference(A, rect(-5, -5, 15, 15)).regions,
    ).toHaveLength(0);
  });

  it("produces a hole when B is strictly inside A", () => {
    const result = StudioPathfinderVectorEngine.booleanDifference(A, rect(3, 3, 6, 6));
    expect(area(result)).toBeCloseTo(91, 6);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0]!.holes).toHaveLength(1);
    expect(pointInResult(result, 1, 1)).toBe(true);
    expect(pointInResult(result, 4.5, 4.5)).toBe(false);
    expectCleanResult(result);
  });

  it("keeps A unchanged for shared-edge and disjoint B", () => {
    expect(
      area(StudioPathfinderVectorEngine.booleanDifference(A, rect(10, 0, 20, 10))),
    ).toBeCloseTo(100, 6);
    expect(
      area(StudioPathfinderVectorEngine.booleanDifference(A, rect(20, 20, 30, 30))),
    ).toBeCloseTo(100, 6);
  });
});

describe("StudioPathfinderVectorEngine.booleanExclusion", () => {
  const A = rect(0, 0, 10, 10);

  it("keeps everything except the overlap", () => {
    const result = StudioPathfinderVectorEngine.booleanExclusion(A, rect(5, 5, 15, 15));
    expect(area(result)).toBeCloseTo(150, 6);
    expect(pointInResult(result, 2, 2)).toBe(true);
    expect(pointInResult(result, 12, 12)).toBe(true);
    expect(pointInResult(result, 7, 7)).toBe(false);
    expectCleanResult(result);
  });

  it("is just the union when squares only share an edge", () => {
    const result = StudioPathfinderVectorEngine.booleanExclusion(A, rect(10, 0, 20, 10));
    expect(area(result)).toBeCloseTo(200, 6);
  });

  it("is empty for identical squares", () => {
    expect(
      StudioPathfinderVectorEngine.booleanExclusion(A, rect(0, 0, 10, 10)).regions,
    ).toHaveLength(0);
  });

  it("produces a hole for containment", () => {
    const result = StudioPathfinderVectorEngine.booleanExclusion(A, rect(3, 3, 6, 6));
    expect(area(result)).toBeCloseTo(91, 6);
    expect(result.regions[0]!.holes).toHaveLength(1);
    expectCleanResult(result);
  });
});

describe("StudioPathfinderVectorEngine vertex-on-edge (T-junction)", () => {
  const A = rect(0, 0, 10, 10);
  const triangle: StudioPathfinderPolygon = {
    points: [
      { x: 5, y: 0 },
      { x: 15, y: 5 },
      { x: 5, y: 10 },
    ],
  };

  it("splits the edge at the touching vertex", () => {
    expect(area(StudioPathfinderVectorEngine.booleanIntersect(A, triangle))).toBeCloseTo(37.5, 6);
    const union = StudioPathfinderVectorEngine.booleanUnion(A, triangle);
    expect(area(union)).toBeCloseTo(112.5, 6);
    expectCleanResult(union);
  });
});

describe("StudioPathfinderVectorEngine degenerate inputs", () => {
  const A = rect(0, 0, 10, 10);
  const empty: StudioPathfinderPolygon = { points: [] };

  it("applies set-identity rules for empty operands", () => {
    expect(area(StudioPathfinderVectorEngine.booleanUnion(A, empty))).toBeCloseTo(100, 6);
    expect(StudioPathfinderVectorEngine.booleanIntersect(A, empty).regions).toHaveLength(0);
    expect(area(StudioPathfinderVectorEngine.booleanDifference(A, empty))).toBeCloseTo(100, 6);
    expect(StudioPathfinderVectorEngine.booleanDifference(empty, A).regions).toHaveLength(0);
    expect(area(StudioPathfinderVectorEngine.booleanExclusion(A, empty))).toBeCloseTo(100, 6);
  });

  it("treats a two-point polygon as empty", () => {
    const line: StudioPathfinderPolygon = {
      points: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
    };
    expect(area(StudioPathfinderVectorEngine.booleanUnion(A, line))).toBeCloseTo(100, 6);
  });

  it("throws on non-finite coordinates instead of corrupting silently", () => {
    const bad: StudioPathfinderPolygon = {
      points: [
        { x: 0, y: 0 },
        { x: Number.NaN, y: 1 },
        { x: 1, y: 1 },
      ],
    };
    expect(() => StudioPathfinderVectorEngine.booleanUnion(A, bad)).toThrow();
  });

  it("is deterministic", () => {
    const B = rect(5, 5, 15, 15);
    expect(JSON.stringify(StudioPathfinderVectorEngine.booleanUnion(A, B))).toBe(
      JSON.stringify(StudioPathfinderVectorEngine.booleanUnion(A, B)),
    );
  });

  it("stays accurate at large coordinate scales", () => {
    const big1 = rect(100000, 100000, 100100, 100100);
    const big2 = rect(100050, 100050, 100150, 100150);
    expect(area(StudioPathfinderVectorEngine.booleanUnion(big1, big2))).toBeCloseTo(17500, 4);
    expect(area(StudioPathfinderVectorEngine.booleanIntersect(big1, big2))).toBeCloseTo(2500, 4);
  });
});
