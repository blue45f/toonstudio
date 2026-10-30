import { describe, expect, it } from "vitest";

import { createStudioEditableMeshFromPolygons, createStudioUnitCubeMesh, hashStudioEditableMesh, serializeStudioEditableMesh, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";

import { decodeStudioMeshUvLayer, deriveStudioMeshUvIslands, hashStudioMeshUvTopology, type StudioMeshUvLayer } from "./studio-mesh-uv-authority";
import { packStudioMeshCornerUvs, STUDIO_MESH_UV_PACK_MIN_EFFECTIVE_MARGIN, StudioMeshUvPackError } from "./studio-mesh-uv-pack";

interface Rect { readonly width: number; readonly height: number; readonly x?: number; readonly y?: number }
function rects(rectangles: readonly Rect[]): StudioEditableMesh {
  const positions = rectangles.flatMap((_, index) => [
    { x: index * 2, y: 0, z: 0 }, { x: index * 2 + 1, y: 0, z: 0 },
    { x: index * 2 + 1, y: 1, z: 0 }, { x: index * 2, y: 1, z: 0 },
  ]);
  const mesh = createStudioEditableMeshFromPolygons(positions, rectangles.map((_, index) => [0, 1, 2, 3].map((id) => index * 4 + id)));
  const corners = rectangles.flatMap((r, index) => [
    [r.x ?? 0, r.y ?? 0], [(r.x ?? 0) + r.width, r.y ?? 0],
    [(r.x ?? 0) + r.width, (r.y ?? 0) + r.height], [r.x ?? 0, (r.y ?? 0) + r.height],
  ].map(([u, v], corner) => ({ halfEdgeId: index * 4 + corner, u: Math.fround(u!), v: Math.fround(v!) })));
  return { ...mesh, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(mesh), corners }, mesh) };
}
function bounds(layer: StudioMeshUvLayer, ids: readonly number[]) {
  const points = ids.map((id) => layer.corners[id]!);
  return { minU: Math.min(...points.map(({ u }) => u)), maxU: Math.max(...points.map(({ u }) => u)),
    minV: Math.min(...points.map(({ v }) => v)), maxV: Math.max(...points.map(({ v }) => v)) };
}
function expectCode(run: () => unknown, code: StudioMeshUvPackError["code"]) {
  let cause: unknown;
  try { run(); } catch (error) { cause = error; }
  expect(cause).toBeInstanceOf(StudioMeshUvPackError); expect(cause).toMatchObject({ code });
}

describe("정본 코너 UV의 결정적 rectangle 정리", () => {
  it("음수·다른 타일의 모든 island를 여백이 있는 0..1로 옮기고 원본 mesh/hash는 보존한다", () => {
    const source = rects([{ width: 2, height: 1, x: -3, y: 8 }, { width: 1, height: 3, x: 2, y: -4 }, { width: 0.5, height: 2 }]);
    const before = serializeStudioEditableMesh(source); const hash = hashStudioEditableMesh(source);
    const result = packStudioMeshCornerUvs(source);
    expect(result.islandCount).toBe(3); expect(result.rotatedIslandCount).toBe(2);
    expect(result.scale).toBeGreaterThan(0); expect(result.effectiveMargin).toBe(0.02);
    const boxes = deriveStudioMeshUvIslands(source).map(({ cornerIds }) => bounds(result.uvLayer, cornerIds));
    for (const b of boxes) {
      expect(b.minU).toBeGreaterThanOrEqual(0.02); expect(b.minV).toBeGreaterThanOrEqual(0.02);
      expect(b.maxU).toBeLessThanOrEqual(0.98); expect(b.maxV).toBeLessThanOrEqual(0.98);
    }
    boxes.forEach((a, index) => boxes.slice(index + 1).forEach((b) => {
      expect(Math.max(b.minU - a.maxU, a.minU - b.maxU, b.minV - a.maxV, a.minV - b.maxV)).toBeGreaterThanOrEqual(0.02);
    }));
    expect(serializeStudioEditableMesh(source)).toEqual(before); expect(hashStudioEditableMesh(source)).toBe(hash);
    expect(result.uvLayer.topologyHash).toBe(source.uvLayer!.topologyHash);
    expect(packStudioMeshCornerUvs(source)).toEqual(result);
  });

  it.each([false, true])("rotate=%s에서도 모든 island에 공통 scale을 적용해 비율·내부 각을 유지한다", (rotate) => {
    const source = rects([{ width: 4, height: 1 }, { width: 1, height: 4 }]);
    const result = packStudioMeshCornerUvs(source, { margin: 0.02, rotate });
    expect(result.rotatedIslandCount).toBe(rotate ? 1 : 0);
    for (let chart = 0; chart < 2; chart += 1) {
      const a = result.uvLayer.corners[chart * 4]!; const b = result.uvLayer.corners[chart * 4 + 1]!; const c = result.uvLayer.corners[chart * 4 + 3]!;
      const ab = [b.u - a.u, b.v - a.v]; const ac = [c.u - a.u, c.v - a.v];
      expect(Math.hypot(...ab)).toBeCloseTo((chart === 0 ? 4 : 1) * result.scale, 6);
      expect(Math.hypot(...ac)).toBeCloseTo((chart === 0 ? 1 : 4) * result.scale, 6);
      expect(ab[0]! * ac[0]! + ab[1]! * ac[1]!).toBeCloseTo(0, 7);
      expect(ab[0]! * ac[1]! - ab[1]! * ac[0]!).toBeGreaterThan(0);
    }
  });

  it("여백 0에서도 표현 가능한 양수 간격을 두고 반복 정리는 같은 레이어를 반환한다", () => {
    const source = rects(Array.from({ length: 6 }, () => ({ width: 1, height: 1 })));
    const first = packStudioMeshCornerUvs(source, { margin: 0, rotate: true });
    expect(first.effectiveMargin).toBe(STUDIO_MESH_UV_PACK_MIN_EFFECTIVE_MARGIN);
    const nextSource = { ...source, uvLayer: first.uvLayer };
    const second = packStudioMeshCornerUvs(nextSource, { margin: 0, rotate: true });
    expect(second.uvLayer).toBe(first.uvLayer); expect(second.scale).toBe(1);
    expect(deriveStudioMeshUvIslands(nextSource)).toHaveLength(6);
  });

  it("연결된 shared corner는 같은 Float32값을 유지하고 기존 UV seam도 합치지 않는다", () => {
    const mesh = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 2, y: 1, z: 0 },
    ], [[0, 1, 4, 3], [1, 2, 5, 4]]);
    for (const seam of [false, true]) {
      const corners = mesh.halfEdges.map((edge) => {
        const p = mesh.vertices[mesh.halfEdges[edge.prev]!.vertex]!.position;
        return { halfEdgeId: edge.id, u: p.x + (seam && edge.face === 1 ? 4 : 0), v: p.y };
      });
      const source = { ...mesh, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(mesh), corners }, mesh) };
      const result = packStudioMeshCornerUvs(source, { margin: 0, rotate: true });
      expect(deriveStudioMeshUvIslands({ ...mesh, uvLayer: result.uvLayer })).toHaveLength(seam ? 2 : 1);
      if (!seam) expect(result.uvLayer.corners[1]!.u).toBe(result.uvLayer.corners[4]!.u);
    }
  });

  it("다른 면 경로로 같은 island인 내부의 미세 UV seam도 Float32 정리로 합치지 않는다", () => {
    const mesh = createStudioUnitCubeMesh();
    const corners = mesh.halfEdges.map((edge) => {
      const p = mesh.vertices[mesh.halfEdges[edge.prev]!.vertex]!.position;
      return { halfEdgeId: edge.id, u: p.x + 0.5, v: p.y + 0.5 };
    });
    const corner = mesh.faces[0]!.he;
    expect(corners[corner]!.u).toBe(0);
    corners[corner] = { ...corners[corner]!, u: Math.fround(1e-10) };
    const source = { ...mesh, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(mesh), corners }, mesh) };
    expect(deriveStudioMeshUvIslands(source)).toHaveLength(1);
    const before = serializeStudioEditableMesh(source);
    expectCode(() => packStudioMeshCornerUvs(source), "precision-limit");
    expect(() => packStudioMeshCornerUvs(source)).toThrow(/UV 경계/u);
    expect(serializeStudioEditableMesh(source)).toEqual(before);
  });

  it.each([-0.001, 0.25001, Infinity, NaN])("잘못된 margin %s를 원본 수정 전에 거부한다", (margin) => {
    const source = rects([{ width: 1, height: 1 }]);
    expectCode(() => packStudioMeshCornerUvs(source, { margin, rotate: true }), "invalid-options");
  });

  it("0.25는 허용하되 너무 많은 고정 여백·0너비·Float32 형태 소실은 명시적으로 거부한다", () => {
    expect(packStudioMeshCornerUvs(rects([{ width: 1, height: 1 }]), { margin: 0.25, rotate: false }).uvLayer.corners).toHaveLength(4);
    expectCode(() => packStudioMeshCornerUvs(rects(Array.from({ length: 9 }, () => ({ width: 1, height: 1 }))), { margin: 0.25, rotate: false }), "margin-infeasible");
    expectCode(() => packStudioMeshCornerUvs(rects([{ width: 0, height: 1 }])), "collapsed-island");
    expectCode(() => packStudioMeshCornerUvs(rects([{ width: 1e30, height: 1e30 }, { width: 1e-30, height: 1e-30 }]), { margin: 0, rotate: false }), "precision-limit");
  });

  it("단일 극대·극소 Float32 chart는 정규화 계산으로 정상 정리한다", () => {
    const max = 3.4028234663852886e38;
    for (const source of [rects([{ width: max * 2, height: max * 2, x: -max, y: -max }]), rects([{ width: 1e-40, height: 2e-40 }])]) {
      const result = packStudioMeshCornerUvs(source);
      expect(result.uvLayer.corners.every(({ u, v }) => Number.isFinite(u) && Number.isFinite(v) && u >= 0 && u <= 1 && v >= 0 && v <= 1)).toBe(true);
      expect(result.scale).toBeGreaterThan(0);
    }
  });

  it("원본 bowtie UV는 그대로 배치하고 Float32 반올림으로 새로 접히는 UV 모서리는 거부한다", () => {
    const crossed = rects([{ width: 1, height: 1 }]);
    const crossPoints = [[0, 0], [1, 1], [0, 1], [1, 0]];
    const bowtie = { ...crossed, uvLayer: { ...crossed.uvLayer!, corners: crossPoints.map(([u, v], id) => ({ halfEdgeId: id, u: u!, v: v! })) } };
    const result = packStudioMeshCornerUvs(bowtie, { margin: 0.02, rotate: false });
    const a = result.uvLayer.corners[0]!; const b = result.uvLayer.corners[1]!;
    expect(b.u - a.u).toBeCloseTo(result.scale, 6); expect(b.v - a.v).toBeCloseTo(result.scale, 6);
    const mesh = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2, 3, 4]]);
    const points = [[0, 0], [1e-30, 0], [1, 0], [1, 1], [0, 1]];
    const source = { ...mesh, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(mesh),
      corners: points.map(([u, v], id) => ({ halfEdgeId: id, u: Math.fround(u!), v: Math.fround(v!) })),
    }, mesh) };
    expectCode(() => packStudioMeshCornerUvs(source), "precision-limit");
  });

  it("4096개 island/16384개 corner를 임의 island cap 없이 제한된 선형 배치 패스로 처리한다", () => {
    const source = rects(Array.from({ length: 4096 }, () => ({ width: 1, height: 1 })));
    const result = packStudioMeshCornerUvs(source, { margin: 0, rotate: true });
    expect(result.islandCount).toBe(4096); expect(result.uvLayer.corners).toHaveLength(16384);
    expect(deriveStudioMeshUvIslands({ ...source, uvLayer: result.uvLayer })).toHaveLength(4096);
  });

  it("원본 UV 누락과 잘못된 위상 결합을 거부한다", () => {
    const source = rects([{ width: 1, height: 1 }]);
    const { uvLayer: _uv, ...plain } = source;
    expectCode(() => packStudioMeshCornerUvs(plain), "invalid-source");
    expectCode(() => packStudioMeshCornerUvs({ ...source, uvLayer: { ...source.uvLayer!, topologyHash: "foreign" } }), "invalid-source");
  });
});
