import { describe, expect, it } from "vitest";

import {
  buildStudioPlanarFrame,
  convexPolygonInsetMargin,
  describeStudioPlanarPolygon,
  maxInwardOffsetDistance,
  mergeStudioPlanarPolygons,
  mitreLengthRatio,
  offsetConvexPolygon,
  polygonCentroid,
  polygonSignedArea,
  projectToStudioPlanarFrame,
  studioPlanarFrameDistance,
  triangulateConvexAnnulus,
  unprojectFromStudioPlanarFrame,
  type StudioPlanarPoint,
} from "./studio-hybrid-dcc-face-modeling-geometry";

/** 시드를 고정한 의사 난수(mulberry32). 시험이 매번 같은 입력을 보게 한다. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 원 위의 점을 각도 순으로 놓으면 항상 엄격한 볼록 다각형이다. 최대 각도 간격이 pi 미만이어야 중심을 품는다. */
function randomConvexPolygon(
  random: () => number,
  corners: number,
  radius: number,
  center: StudioPlanarPoint = [0, 0],
  stretch: StudioPlanarPoint = [1, 1],
): StudioPlanarPoint[] {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const angles = Array.from({ length: corners }, () => random() * Math.PI * 2).sort((a, b) => a - b);
    let widest = angles[0]! + Math.PI * 2 - angles[corners - 1]!;
    for (let index = 1; index < corners; index += 1) {
      widest = Math.max(widest, angles[index]! - angles[index - 1]!);
    }
    const narrowest = Math.min(
      angles[0]! + Math.PI * 2 - angles[corners - 1]!,
      ...angles.slice(1).map((angle, index) => angle - angles[index]!),
    );
    if (widest < Math.PI * 0.85 && narrowest > 0.12) {
      return angles.map((angle) => [
        center[0] + Math.cos(angle) * radius * stretch[0],
        center[1] + Math.sin(angle) * radius * stretch[1],
      ] as const);
    }
  }
  throw new Error("could not generate a well-conditioned convex polygon");
}

function directedEdgeCounts(loops: readonly (readonly number[])[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const loop of loops) {
    for (let index = 0; index < loop.length; index += 1) {
      const key = `${loop[index]}|${loop[(index + 1) % loop.length]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/** 고리를 이루는 반시계 다각형 조각들이 빈틈·겹침 없이 경계를 정확히 채우는지 모서리 장부로 검사한다. */
function expectTilesAnnulus(
  loops: readonly (readonly number[])[],
  outerCount: number,
  innerCount: number,
): void {
  const counts = directedEdgeCounts(loops);
  for (let index = 0; index < outerCount; index += 1) {
    expect(counts.get(`${index}|${(index + 1) % outerCount}`)).toBe(1);
  }
  for (let index = 0; index < innerCount; index += 1) {
    const from = outerCount + index;
    const to = outerCount + ((index + 1) % innerCount);
    expect(counts.get(`${to}|${from}`)).toBe(1);
  }
  const boundary = new Set<string>();
  for (let index = 0; index < outerCount; index += 1) {
    boundary.add(`${index}|${(index + 1) % outerCount}`);
  }
  for (let index = 0; index < innerCount; index += 1) {
    boundary.add(`${outerCount + ((index + 1) % innerCount)}|${outerCount + index}`);
  }
  for (const [key, count] of counts) {
    expect(count).toBe(1);
    if (boundary.has(key)) continue;
    const [from, to] = key.split("|");
    expect(counts.get(`${to}|${from}`)).toBe(1);
  }
}

describe("평면 좌표계", () => {
  const square = [
    { x: 0, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 },
    { x: 2, y: 0, z: -1 },
    { x: 0, y: 0, z: -1 },
  ];

  it("정점 순서가 반시계로 보이는 쪽을 법선으로 삼고 첫 모서리를 가로축으로 둔다", () => {
    const frame = buildStudioPlanarFrame(square)!;
    expect(frame.normal.y).toBeCloseTo(1, 12);
    expect(frame.u.x).toBeCloseTo(1, 12);
    expect(frame.area).toBeCloseTo(2, 12);
    const reversed = buildStudioPlanarFrame([...square].reverse())!;
    expect(reversed.normal.y).toBeCloseTo(-1, 12);
    // u × v = normal (오른손 좌표계)
    const cross = {
      x: frame.u.y * frame.v.z - frame.u.z * frame.v.y,
      y: frame.u.z * frame.v.x - frame.u.x * frame.v.z,
      z: frame.u.x * frame.v.y - frame.u.y * frame.v.x,
    };
    expect(cross.y).toBeCloseTo(1, 12);
  });

  it("투영한 다각형은 양의 면적이고 되돌리면 원래 3D 점이 나온다", () => {
    const frame = buildStudioPlanarFrame(square)!;
    const planar = square.map((point) => projectToStudioPlanarFrame(frame, point));
    expect(polygonSignedArea(planar)).toBeCloseTo(2, 12);
    for (const [index, point] of planar.entries()) {
      const back = unprojectFromStudioPlanarFrame(frame, point);
      expect(back.x).toBeCloseTo(square[index]!.x, 12);
      expect(back.y).toBeCloseTo(square[index]!.y, 12);
      expect(back.z).toBeCloseTo(square[index]!.z, 12);
      expect(studioPlanarFrameDistance(frame, square[index]!)).toBeCloseTo(0, 12);
    }
  });

  it("점이 3개 미만이거나 면적이 0이면 좌표계를 만들지 않는다", () => {
    expect(buildStudioPlanarFrame(square.slice(0, 2))).toBeNull();
    expect(buildStudioPlanarFrame([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ])).toBeNull();
  });

  it("원점에서 아주 먼 면도 같은 가로·세로 크기를 유지한다", () => {
    const far = square.map((point) => ({ x: point.x + 1e5, y: point.y + 2e5, z: point.z - 3e5 }));
    const frame = buildStudioPlanarFrame(far)!;
    const planar = far.map((point) => projectToStudioPlanarFrame(frame, point));
    expect(polygonSignedArea(planar)).toBeCloseTo(2, 6);
  });
});

describe("다각형 형태 분석", () => {
  const square: StudioPlanarPoint[] = [[0, 0], [1, 0], [1, 1], [0, 1]];

  it("엄격한 볼록·일직선 꼭짓점·반사 꼭짓점·되접힘·자기 교차를 구분한다", () => {
    expect(describeStudioPlanarPolygon(square)).toMatchObject({
      convex: true,
      strictlyConvex: true,
      simple: true,
      signedArea: 1,
    });
    const withMidpoint: StudioPlanarPoint[] = [[0, 0], [0.5, 0], [1, 0], [1, 1], [0, 1]];
    expect(describeStudioPlanarPolygon(withMidpoint)).toMatchObject({
      convex: true,
      strictlyConvex: false,
      collinearCorners: [1],
    });
    const lShape: StudioPlanarPoint[] = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]];
    expect(describeStudioPlanarPolygon(lShape)).toMatchObject({ convex: false, simple: true });
    const bowTie: StudioPlanarPoint[] = [[0, 0], [1, 1], [1, 0], [0, 1]];
    expect(describeStudioPlanarPolygon(bowTie)).toMatchObject({ simple: false, convex: false });
    const spike: StudioPlanarPoint[] = [[0, 0], [2, 0], [1, 0], [1, 1]];
    expect(describeStudioPlanarPolygon(spike).spikeCorners.length).toBeGreaterThan(0);
    expect(describeStudioPlanarPolygon(spike).convex).toBe(false);
  });

  it("시계 방향 다각형은 음의 면적으로 알리고 두 바퀴 감기는 별은 볼록으로 보지 않는다", () => {
    expect(describeStudioPlanarPolygon([...square].reverse()).signedArea).toBe(-1);
    expect(describeStudioPlanarPolygon([...square].reverse()).convex).toBe(false);
    const pentagram: StudioPlanarPoint[] = [0, 2, 4, 1, 3].map((step) => {
      const angle = (step * 2 * Math.PI) / 5;
      return [Math.cos(angle), Math.sin(angle)] as const;
    });
    const shape = describeStudioPlanarPolygon(pentagram);
    expect(shape.convex).toBe(false);
    expect(shape.simple).toBe(false);
  });

  it("점이 중복되거나 3개 미만이면 모두 거부한다", () => {
    expect(describeStudioPlanarPolygon([[0, 0], [1, 0]]).convex).toBe(false);
    const duplicate: StudioPlanarPoint[] = [[0, 0], [0, 0], [1, 0], [1, 1]];
    expect(describeStudioPlanarPolygon(duplicate).convex).toBe(false);
    expect(describeStudioPlanarPolygon(duplicate).simple).toBe(false);
  });

  it("볼록 다각형 안쪽 여유를 모서리 직선까지의 최소 거리로 잰다", () => {
    expect(convexPolygonInsetMargin(square, [0.5, 0.5])).toBeCloseTo(0.5, 12);
    expect(convexPolygonInsetMargin(square, [0.1, 0.5])).toBeCloseTo(0.1, 12);
    expect(convexPolygonInsetMargin(square, [0, 0.5])).toBeCloseTo(0, 12);
    expect(convexPolygonInsetMargin(square, [-0.2, 0.5])).toBeCloseTo(-0.2, 12);
  });

  it("무게중심은 면적 가중이다", () => {
    const centroid = polygonCentroid([[0, 0], [4, 0], [4, 2], [0, 2]]);
    expect(centroid[0]).toBeCloseTo(2, 12);
    expect(centroid[1]).toBeCloseTo(1, 12);
  });
});

describe("mitre 오프셋과 붕괴 거리", () => {
  const rectangle: StudioPlanarPoint[] = [[0, 0], [2, 0], [2, 1], [0, 1]];

  it("직사각형을 안쪽으로 밀면 같은 모서리 수의 작은 직사각형이 된다", () => {
    const inner = offsetConvexPolygon(rectangle, 0.25);
    expect(inner).toEqual([[0.25, 0.25], [1.75, 0.25], [1.75, 0.75], [0.25, 0.75]]);
    const outer = offsetConvexPolygon(rectangle, -0.25);
    expect(outer).toEqual([[-0.25, -0.25], [2.25, -0.25], [2.25, 1.25], [-0.25, 1.25]]);
  });

  it("모서리가 사라지기 직전 거리를 정확히 계산한다", () => {
    // 2x1 직사각형은 짧은 변이 0.5에서 사라진다.
    expect(maxInwardOffsetDistance(rectangle, 0)).toBeCloseTo(0.5, 12);
    expect(maxInwardOffsetDistance(rectangle, 0.1)).toBeCloseTo(0.45, 12);
    // 정삼각형은 내접원 반지름에서 한 점으로 붕괴한다.
    const side = 3;
    const height = (Math.sqrt(3) / 2) * side;
    const triangle: StudioPlanarPoint[] = [[0, 0], [side, 0], [side / 2, height]];
    expect(maxInwardOffsetDistance(triangle, 0)).toBeCloseTo(side / (2 * Math.sqrt(3)), 12);
    // 일직선 꼭짓점만 있는 변은 줄어들지 않는다.
    const withMidpoint: StudioPlanarPoint[] = [[0, 0], [1, 0], [2, 0], [2, 1], [0, 1]];
    expect(maxInwardOffsetDistance(withMidpoint, 0)).toBeCloseTo(0.5, 12);
    expect(maxInwardOffsetDistance(rectangle, 5)).toBe(0);
  });

  it("mitre 길이 비는 직각 1.414, 정삼각형 2, 뾰족할수록 커진다", () => {
    expect(mitreLengthRatio(rectangle)).toBeCloseTo(Math.SQRT2, 12);
    const triangle: StudioPlanarPoint[] = [[0, 0], [1, 0], [0.5, Math.sqrt(3) / 2]];
    expect(mitreLengthRatio(triangle)).toBeCloseTo(2, 12);
    const needle: StudioPlanarPoint[] = [[0, 0], [10, 0], [10, 0.5]];
    expect(mitreLengthRatio(needle)).toBeGreaterThan(5);
  });

  it("무작위 볼록 다각형에서 새 꼭짓점은 두 이웃 모서리와 정확히 d만큼 떨어져 있다", () => {
    const random = seededRandom(20261016);
    for (let round = 0; round < 60; round += 1) {
      const polygon = randomConvexPolygon(
        random,
        3 + Math.floor(random() * 8),
        0.5 + random() * 3,
        [random() * 4 - 2, random() * 4 - 2],
        [0.6 + random() * 0.8, 0.6 + random() * 0.8],
      );
      const limit = maxInwardOffsetDistance(polygon, 0);
      expect(limit).toBeGreaterThan(0);
      const distance = limit * (0.2 + random() * 0.7);
      const inner = offsetConvexPolygon(polygon, distance);
      expect(inner).toHaveLength(polygon.length);
      expect(describeStudioPlanarPolygon(inner).strictlyConvex).toBe(true);
      expect(polygonSignedArea(inner)).toBeGreaterThan(0);
      expect(polygonSignedArea(inner)).toBeLessThan(polygonSignedArea(polygon));
      for (let index = 0; index < polygon.length; index += 1) {
        const before = polygon[(index + polygon.length - 1) % polygon.length]!;
        const here = polygon[index]!;
        const after = polygon[(index + 1) % polygon.length]!;
        const edgeDistance = (start: StudioPlanarPoint, end: StudioPlanarPoint) => {
          const edge: StudioPlanarPoint = [end[0] - start[0], end[1] - start[1]];
          const point = inner[index]!;
          return (edge[0] * (point[1] - start[1]) - edge[1] * (point[0] - start[0])) / Math.hypot(edge[0], edge[1]);
        };
        expect(edgeDistance(before, here)).toBeCloseTo(distance, 9);
        expect(edgeDistance(here, after)).toBeCloseTo(distance, 9);
      }
      // 한계 직전까지 밀어도 어떤 모서리도 뒤집히지 않는다.
      const nearLimit = offsetConvexPolygon(polygon, limit * 0.999);
      for (let index = 0; index < polygon.length; index += 1) {
        const start = polygon[index]!;
        const end = polygon[(index + 1) % polygon.length]!;
        const innerStart = nearLimit[index]!;
        const innerEnd = nearLimit[(index + 1) % nearLimit.length]!;
        const alongOriginal = (end[0] - start[0]) * (innerEnd[0] - innerStart[0])
          + (end[1] - start[1]) * (innerEnd[1] - innerStart[1]);
        expect(alongOriginal).toBeGreaterThan(-1e-9);
      }
    }
  });
});

describe("볼록 고리 삼각 분할", () => {
  it("정렬된 사각형 두 개는 방사선으로 이어져 사다리꼴 4개로 합쳐진다", () => {
    const outer: StudioPlanarPoint[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const inner: StudioPlanarPoint[] = [[4, 4], [6, 4], [6, 6], [4, 6]];
    const result = triangulateConvexAnnulus(outer, inner)!;
    expect(result.triangles).toHaveLength(8);
    expectTilesAnnulus(result.triangles, 4, 4);
    const points = [...outer, ...inner];
    const merged = mergeStudioPlanarPolygons(points, result.triangles, () => true);
    expect(merged).toHaveLength(4);
    expectTilesAnnulus(merged, 4, 4);
    for (const loop of merged) {
      expect(loop).toHaveLength(4);
      expect(describeStudioPlanarPolygon(loop.map((index) => points[index]!)).strictlyConvex).toBe(true);
    }
  });

  it("안쪽 도형이 한쪽 구석에 치우쳐도 연결선이 안쪽 도형을 가로지르지 않는다", () => {
    const outer: StudioPlanarPoint[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const inner: StudioPlanarPoint[] = [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5]];
    const result = triangulateConvexAnnulus(outer, inner)!;
    expectTilesAnnulus(result.triangles, 4, 4);
    const points = [...outer, ...inner];
    const total = result.triangles.reduce((sum, triangle) => (
      sum + polygonSignedArea(triangle.map((index) => points[index]!))
    ), 0);
    expect(total).toBeCloseTo(100 - 1, 9);
  });

  it("바깥 다각형에 일직선 꼭짓점이 있어도 모든 꼭짓점을 쓴다", () => {
    const outer: StudioPlanarPoint[] = [[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]];
    const inner: StudioPlanarPoint[] = [[3, 3], [7, 3], [5, 7]];
    const result = triangulateConvexAnnulus(outer, inner)!;
    expectTilesAnnulus(result.triangles, 5, 3);
    const used = new Set(result.triangles.flat());
    expect(used.size).toBe(8);
  });

  it("안쪽 도형이 바깥으로 삐져나오거나 면적이 더 크면 null이다", () => {
    const outer: StudioPlanarPoint[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(triangulateConvexAnnulus(outer, [[0, 0], [20, 0], [20, 20], [0, 20]])).toBeNull();
    expect(triangulateConvexAnnulus(outer, [[1, 1], [2, 1]])).toBeNull();
    expect(triangulateConvexAnnulus([...outer].reverse(), [[4, 4], [6, 4], [6, 6], [4, 6]])).toBeNull();
  });

  it("무작위 볼록 고리 200개를 빈틈·겹침 없이 삼각 분할하고 볼록 조각으로 합친다", () => {
    const random = seededRandom(7101);
    for (let round = 0; round < 200; round += 1) {
      const outerCount = 3 + Math.floor(random() * 9);
      const innerCount = 3 + Math.floor(random() * 8);
      const outerRadius = 2 + random() * 3;
      const outer = randomConvexPolygon(random, outerCount, outerRadius, [0, 0], [1, 0.7 + random() * 0.3]);
      // 바깥 다각형 안에서 원점이 모서리와 떨어진 최소 거리(내접 여유) 안에 안쪽 다각형을 둔다.
      const reach = convexPolygonInsetMargin(outer, [0, 0]);
      expect(reach).toBeGreaterThan(0);
      const innerRadius = reach * (0.1 + random() * 0.55);
      const shift = (reach - innerRadius) * 0.8;
      const inner = randomConvexPolygon(
        random,
        innerCount,
        innerRadius,
        [(random() * 2 - 1) * shift * 0.7, (random() * 2 - 1) * shift * 0.7],
      );
      for (const point of inner) {
        expect(convexPolygonInsetMargin(outer, point)).toBeGreaterThan(0);
      }
      const result = triangulateConvexAnnulus(outer, inner);
      expect(result, `round ${round}`).not.toBeNull();
      expectTilesAnnulus(result!.triangles, outerCount, innerCount);
      expect(result!.triangles).toHaveLength(outerCount + innerCount);
      const points = [...outer, ...inner];
      const merged = mergeStudioPlanarPolygons(points, result!.triangles, () => true);
      expect(merged.length).toBeLessThanOrEqual(result!.triangles.length);
      expectTilesAnnulus(merged, outerCount, innerCount);
      let area = 0;
      for (const loop of merged) {
        const shape = describeStudioPlanarPolygon(loop.map((index) => points[index]!));
        expect(shape.strictlyConvex).toBe(true);
        expect(shape.signedArea).toBeGreaterThan(0);
        area += shape.signedArea;
      }
      expect(area).toBeCloseTo(polygonSignedArea(outer) - polygonSignedArea(inner), 8);
    }
  });

  it("합치기는 accept가 거부한 조각을 만들지 않고 최대 꼭짓점 수를 지킨다", () => {
    const outer: StudioPlanarPoint[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const inner: StudioPlanarPoint[] = [[4, 4], [6, 4], [6, 6], [4, 6]];
    const points = [...outer, ...inner];
    const triangles = triangulateConvexAnnulus(outer, inner)!.triangles;
    expect(mergeStudioPlanarPolygons(points, triangles, () => false)).toHaveLength(8);
    expect(mergeStudioPlanarPolygons(points, triangles, () => true, 3)).toHaveLength(8);
    const merged = mergeStudioPlanarPolygons(points, triangles, () => true, 4);
    expect(Math.max(...merged.map((loop) => loop.length))).toBeLessThanOrEqual(4);
  });
});
