import { describe, expect, it } from "vitest";

import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import {
  createStudioEditableMeshFromPolygons,
  createStudioUnitCubeMesh,
  serializeStudioEditableMesh,
  type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";

import { verifyStudioCoplanarEdgeDissolveFields } from "./studio-hybrid-dcc-coplanar-edge-fields";
import { readStudioMeshFaceLoops } from "./studio-hybrid-dcc-face-modeling-mesh";

const SQUARE = [
  { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
  { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
];

function patch(loops: readonly (readonly number[])[], smooth = false): StudioEditableMesh {
  const mesh = createStudioEditableMeshFromPolygons(SQUARE.map((point) => ({ ...point })), loops);
  return { ...mesh, faces: mesh.faces.map((face) => ({ ...face, smooth, materialSlot: 5 })) };
}

function withUv(mesh: StudioEditableMesh,
  read: (vertexId: number, faceId: number) => readonly [number, number]): StudioEditableMesh {
  const layer = decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(mesh),
    corners: mesh.halfEdges.map((edge) => {
      const vertexId = mesh.halfEdges[edge.prev]?.vertex;
      if (vertexId === undefined) throw new Error("UV 원본 코너가 없습니다.");
      const [u, v] = read(vertexId, edge.face);
      return { halfEdgeId: edge.id, u: Math.fround(u), v: Math.fround(v) };
    }),
  }, mesh);
  return { ...mesh, uvLayer: layer };
}

function affineUv(mesh: StudioEditableMesh): StudioEditableMesh {
  return withUv(mesh, (id) => {
    const p = mesh.vertices[id]?.position;
    if (!p) throw new Error("UV 원본 위치가 없습니다.");
    return [p.x * 2 - 0.25, p.y * 0.5 + 0.125];
  });
}

function targetTriangles(mesh: StudioEditableMesh): readonly (readonly [number, number, number])[] {
  const inspected = inspectStudioMeshSurfaceForInteractiveProjection(mesh);
  if (!inspected.ok) throw new Error(inspected.message);
  return inspected.value.plan.triangles.map((triangle) => triangle.vertexIds);
}

function nonAffineUv(mesh: StudioEditableMesh): StudioEditableMesh {
  const values: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [2, 1], [0, 1]];
  return withUv(mesh, (id) => {
    const value = values[id];
    if (!value) throw new Error("시험 UV 값이 없습니다.");
    return value;
  });
}

function expectFailure(source: StudioEditableMesh, target: StudioEditableMesh, code: string): void {
  const sourceBefore = serializeStudioEditableMesh(source), targetBefore = serializeStudioEditableMesh(target);
  const outcome = verifyStudioCoplanarEdgeDissolveFields(source, target, [0, 1], 0);
  expect(outcome.ok).toBe(false);
  if (outcome.ok) throw new Error("표현이 달라진 입력이 통과했습니다.");
  expect(outcome.code).toBe(code);
  expect(serializeStudioEditableMesh(source)).toEqual(sourceBefore);
  expect(serializeStudioEditableMesh(target)).toEqual(targetBefore);
}

describe("모서리 치유 전후의 실제 표면 필드", () => {
  it.each([false, true])("smooth=%s인 평면의 재삼각화에서 UV·실제 법선을 보존한다", (smooth) => {
    const source = affineUv(patch([[0, 1, 2], [0, 2, 3]], smooth));
    const target = affineUv(patch([[0, 1, 2, 3]], smooth));
    expect(verifyStudioCoplanarEdgeDissolveFields(source, target, [0, 1], 0)).toEqual({ ok: true });
  });

  it("유효한 상수·음수 타일 UV를 퇴화 필드라는 이유로 거부하지 않는다", () => {
    const source = withUv(patch([[0, 1, 2], [0, 2, 3]]), () => [-2, 0]);
    const target = withUv(patch([[0, 1, 2, 3]]), () => [-2, 0]);
    expect(verifyStudioCoplanarEdgeDissolveFields(source, target, [0, 1], 0)).toEqual({ ok: true });
  });

  it("공통 affine가 아니어도 실제 삼각분할의 piecewise 필드가 같으면 지원한다", () => {
    const target = nonAffineUv(patch([[0, 1, 2, 3]]));
    const source = nonAffineUv(patch(targetTriangles(target)));
    expect(verifyStudioCoplanarEdgeDissolveFields(source, target, [0, 1], 0)).toEqual({ ok: true });
  });

  it("모든 경계 UV가 같아도 반대 대각선 때문에 내부 보간이 달라지면 거부한다", () => {
    const target = nonAffineUv(patch([[0, 1, 2, 3]]));
    const triangles = targetTriangles(target);
    const first = triangles[0], second = triangles[1];
    if (!first || !second) throw new Error("사각형의 두 표면 삼각형이 없습니다.");
    const diagonal = first.filter((id) => second.includes(id)).sort((a, b) => a - b);
    const opposite = diagonal[0] === 0 && diagonal[1] === 2
      ? [[0, 1, 3], [1, 2, 3]] : [[0, 1, 2], [0, 2, 3]];
    const source = nonAffineUv(patch(opposite));
    expectFailure(source, target, "unsupported-uv");
  });

  it("공유 edge의 한쪽 UV seam을 평균 내거나 한쪽 값으로 덮지 않는다", () => {
    const source = withUv(patch([[0, 1, 2], [0, 2, 3]]), (id, faceId) => {
      const point = SQUARE[id];
      if (!point) throw new Error("시험 정점이 없습니다.");
      return [point.x + (faceId === 1 ? 4 : 0), point.y];
    });
    const target = withUv(patch([[0, 1, 2, 3]]), (id) => {
      const point = SQUARE[id];
      if (!point) throw new Error("시험 정점이 없습니다.");
      return [point.x, point.y];
    });
    expectFailure(source, target, "unsupported-uv");
  });

  it("UV 레이어 자체가 사라진 결과는 유효한 무UV 메시여도 거부한다", () => {
    const source = affineUv(patch([[0, 1, 2], [0, 2, 3]]));
    expectFailure(source, patch([[0, 1, 2, 3]]), "unsupported-uv");
  });

  it("같은 위치에 있는 별도 ID의 비대상 면들을 독립 속성·corner provenance로 구분한다", () => {
    const extra = [{ x: 3, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 3, y: 1, z: 0 }];
    const points = [...SQUARE, ...extra, ...extra].map((point) => ({ ...point }));
    const before = createStudioEditableMeshFromPolygons(points, [[0, 1, 2], [0, 2, 3], [4, 5, 6], [7, 8, 9]]);
    const after = createStudioEditableMeshFromPolygons(points, [[0, 1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    const source = { ...before, faces: before.faces.map((face) => ({ ...face, smooth: false,
      materialSlot: face.id < 2 ? 5 : face.id === 2 ? 11 : 13,
    })) };
    const target = { ...after, faces: after.faces.map((face) => ({ ...face, smooth: false,
      materialSlot: face.id === 0 ? 5 : face.id === 1 ? 11 : 13,
    })) };
    expect(inspectStudioMeshSurfaceForInteractiveProjection(source).ok).toBe(true);
    expect(inspectStudioMeshSurfaceForInteractiveProjection(target).ok).toBe(true);
    expect(verifyStudioCoplanarEdgeDissolveFields(source, target, [0, 1], 0)).toEqual({ ok: true });
    expect(target.faces.slice(1).map(({ materialSlot }) => materialSlot)).toEqual([11, 13]);
  });

  it("smooth 속성이 같아도 병합으로 cube의 실제 가중 법선이 바뀌면 거부한다", () => {
    const cube = createStudioUnitCubeMesh(), loops = readStudioMeshFaceLoops(cube);
    if (!loops) throw new Error("cube 경계가 없습니다.");
    const base = createStudioEditableMeshFromPolygons(cube.vertices.map(({ position }) => ({ ...position })),
      [...loops.map((loop) => loop.id === 1 ? [4, 5, 6] : loop.vertexIds), [4, 6, 7]]);
    const source = { ...base, faces: base.faces.map((face) => ({ ...face, smooth: true })) };
    const target = { ...cube, faces: cube.faces.map((face) => ({ ...face, smooth: true })) };
    const outcome = verifyStudioCoplanarEdgeDissolveFields(source, target, [1, 6], 1);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) throw new Error("법선 가중치 변화가 통과했습니다.");
    expect(outcome.code).toBe("unsupported-normal-field");
  });

  it("같은 mesh identity의 UV가 제자리 변경돼도 이전 표면 cache의 성공을 재사용하지 않는다", () => {
    const base = patch([[0, 1, 2], [0, 2, 3]]);
    const corners = base.halfEdges.map((edge) => {
      const vertex = base.vertices[base.halfEdges[edge.prev]?.vertex ?? -1];
      if (!vertex) throw new Error("시험 코너가 없습니다.");
      return { halfEdgeId: edge.id, u: vertex.position.x, v: vertex.position.y };
    });
    const source: StudioEditableMesh = { ...base,
      uvLayer: { revision: 1, topologyHash: hashStudioMeshUvTopology(base), corners },
    };
    const target = withUv(patch([[0, 1, 2, 3]]), (id) => {
      const point = SQUARE[id];
      if (!point) throw new Error("시험 정점이 없습니다.");
      return [point.x, point.y];
    });
    expect(verifyStudioCoplanarEdgeDissolveFields(source, target, [0, 1], 0)).toEqual({ ok: true });
    const first = corners[0];
    if (!first) throw new Error("변경할 UV 코너가 없습니다.");
    first.u += 1;
    expectFailure(source, target, "unsupported-uv");
  });

  it("f64에서는 구분돼도 실제 Float32 표시에서 무너지는 위치를 통과시키지 않는다", () => {
    const translate = (mesh: StudioEditableMesh): StudioEditableMesh => ({ ...mesh,
      vertices: mesh.vertices.map((vertex) => ({ ...vertex,
        position: { ...vertex.position, x: vertex.position.x + 1_073_741_824 },
      })),
    });
    expectFailure(translate(patch([[0, 1, 2], [0, 2, 3]])), translate(patch([[0, 1, 2, 3]])), "unrenderable-result");
  });
});
