import { describe, expect, it } from "vitest";

import { rgbToHex } from "../studio-color-harmony-engine";

import {
  addNetworkSegment,
  addNetworkVertex,
  buildSortedNetworkHalfEdges,
  createEmptyVectorNetwork,
  extractVectorNetworkRegions,
  flattenVectorNetworkToDrawElSeeds,
  fromDrawElsToVectorNetwork,
  getVertexDegree,
  moveNetworkVertexIncremental,
  removeNetworkSegment,
  setVectorNetworkRegionFill,
  splitVectorNetworkIntersections,
  type StudioVectorNetworkV1,
} from "./studio-vector-network-graph";

function buildTwoCellGridNetwork(): StudioVectorNetworkV1 {
  // 2칸 붙은 사각형: 상단/하단 중앙 정점(v2, v5)이 각각 deg = 3 분기 정점
  let net = createEmptyVectorNetwork();
  const verts = [
    { id: "v1", x: 0, y: 0 },
    { id: "v2", x: 100, y: 0 },
    { id: "v3", x: 200, y: 0 },
    { id: "v4", x: 0, y: 100 },
    { id: "v5", x: 100, y: 100 },
    { id: "v6", x: 200, y: 100 },
  ];
  for (const v of verts) net = addNetworkVertex(net, v);

  const zero = { x: 0, y: 0 };
  const segs = [
    { id: "s1", start: "v1", end: "v2", tangentStart: zero, tangentEnd: zero },
    { id: "s2", start: "v2", end: "v3", tangentStart: zero, tangentEnd: zero },
    { id: "s3", start: "v3", end: "v6", tangentStart: zero, tangentEnd: zero },
    { id: "s4", start: "v6", end: "v5", tangentStart: zero, tangentEnd: zero },
    { id: "s5", start: "v5", end: "v4", tangentStart: zero, tangentEnd: zero },
    { id: "s6", start: "v4", end: "v1", tangentStart: zero, tangentEnd: zero },
    // 중앙 공유 분기 세그먼트
    { id: "s7", start: "v2", end: "v5", tangentStart: zero, tangentEnd: zero },
  ];
  for (const s of segs) net = addNetworkSegment(net, s);
  return extractVectorNetworkRegions(net);
}

describe("studio-vector-network-graph", () => {
  it("차수 deg >= 3 다중 분기 정점과 atan2 편각 정렬 반변으로 최소 순환 기저 2개 영역을 자동 추출한다", () => {
    const net = buildTwoCellGridNetwork();

    expect(getVertexDegree(net, "v2")).toBe(3);
    expect(getVertexDegree(net, "v5")).toBe(3);

    const { outgoingByVertex, halfEdges } = buildSortedNetworkHalfEdges(net);
    const v2Out = outgoingByVertex.get("v2") ?? [];
    expect(v2Out).toHaveLength(3);
    const angles = v2Out.map((id) => halfEdges.get(id)!.departureAngleRad);
    expect(angles[0]!).toBeLessThanOrEqual(angles[1]!);
    expect(angles[1]!).toBeLessThanOrEqual(angles[2]!);

    const regions = Object.values(net.regions);
    expect(regions).toHaveLength(2);
    expect(regions[0]!.area).toBeCloseTo(10_000, 0);
    expect(regions[1]!.area).toBeCloseTo(10_000, 0);
  });

  it("정점 드래그 증분 재계산 시 영향받는 인접 영역만 갱신하고 비영향 영역은 동일 참조로 보존한다", () => {
    let net = buildTwoCellGridNetwork();
    const fillBlue = rgbToHex(60, 120, 220);
    const regionIds = Object.keys(net.regions);
    const leftRegionId = regionIds.find((id) => net.regions[id]!.centroid.x < 100)!;
    const rightRegionId = regionIds.find((id) => net.regions[id]!.centroid.x > 100)!;
    net = setVectorNetworkRegionFill(net, leftRegionId, { kind: "solid", color: fillBlue });

    // 왼쪽 끝 정점 v1(0,0) -> (-50, 0) 이동: 왼쪽 영역만 변경, 오른쪽 영역은 비영향
    const moved = moveNetworkVertexIncremental(net, "v1", { x: -50, y: 0 });
    expect(moved.affectedRegionIds).toEqual([leftRegionId]);
    expect(moved.untouchedRegionIds).toEqual([rightRegionId]);
    expect(moved.network.regions[rightRegionId]).toBe(net.regions[rightRegionId]);
    // 사다리꼴(윗변 150, 아랫변 100, 높이 100) 면적 = 12,500
    expect(moved.network.regions[leftRegionId]!.area).toBeCloseTo(12_500, 0);
    expect(moved.network.regions[leftRegionId]!.fill.color).toBe(fillBlue);
  });

  it("교차하는 두 세그먼트를 자동 분할해 차수 4 교차 정점과 4분할 최소 영역을 생성한다", () => {
    // 외곽 사각형 + 대각선 X 교차 -> 4개 삼각형 최소 영역
    let net = createEmptyVectorNetwork();
    const zero = { x: 0, y: 0 };
    net = addNetworkVertex(net, { id: "a", x: 0, y: 0 });
    net = addNetworkVertex(net, { id: "b", x: 100, y: 0 });
    net = addNetworkVertex(net, { id: "c", x: 100, y: 100 });
    net = addNetworkVertex(net, { id: "d", x: 0, y: 100 });
    net = addNetworkSegment(net, { id: "top", start: "a", end: "b", tangentStart: zero, tangentEnd: zero });
    net = addNetworkSegment(net, { id: "right", start: "b", end: "c", tangentStart: zero, tangentEnd: zero });
    net = addNetworkSegment(net, { id: "bottom", start: "c", end: "d", tangentStart: zero, tangentEnd: zero });
    net = addNetworkSegment(net, { id: "left", start: "d", end: "a", tangentStart: zero, tangentEnd: zero });
    net = addNetworkSegment(net, { id: "diag1", start: "a", end: "c", tangentStart: zero, tangentEnd: zero });
    net = addNetworkSegment(net, { id: "diag2", start: "b", end: "d", tangentStart: zero, tangentEnd: zero });

    const split = splitVectorNetworkIntersections(net);
    expect(split.insertedVertexIds).toHaveLength(1);
    const centerVid = split.insertedVertexIds[0]!;
    expect(getVertexDegree(split.network, centerVid)).toBe(4);
    expect(Object.values(split.network.regions)).toHaveLength(4);
    for (const region of Object.values(split.network.regions)) {
      expect(region.area).toBeCloseTo(2500, 0);
    }
  });

  it("중앙 공유 세그먼트 제거 시 2개 칸이 1개 큰 영역으로 통합되고 DrawEl 양방향 변환이 동작한다", () => {
    const net = buildTwoCellGridNetwork();
    const merged = removeNetworkSegment(net, "s7");
    expect(Object.values(merged.regions)).toHaveLength(1);
    expect(Object.values(merged.regions)[0]!.area).toBeCloseTo(20_000, 0);

    const ink = rgbToHex(20, 20, 25);
    const paint = rgbToHex(235, 190, 95);
    const filled = setVectorNetworkRegionFill(merged, Object.keys(merged.regions)[0]!, {
      kind: "solid",
      color: paint,
    });
    const flattened = flattenVectorNetworkToDrawElSeeds(filled, { stroke: ink, strokeWidth: 2 });
    expect(flattened.regionFillSeeds).toHaveLength(1);
    expect(flattened.segmentStrokeSeeds).toHaveLength(6);

    const rebuilt = fromDrawElsToVectorNetwork(
      flattened.segmentStrokeSeeds.map((seed, idx) => ({ ...seed, id: `el-${idx}` })),
    );
    expect(Object.values(rebuilt.regions)).toHaveLength(1);
    expect(Object.values(rebuilt.regions)[0]!.area).toBeCloseTo(20_000, 0);
  });
});
