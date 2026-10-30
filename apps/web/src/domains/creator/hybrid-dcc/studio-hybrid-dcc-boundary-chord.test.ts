/** 복원한 미실행 회귀 소스. 실제 UI·Worker·Undo·GPU 성공 증거로 사용하지 않는다. */
import { describe, expect, it } from "vitest";
import {
  createStudioEditableMeshFromPolygons, createStudioUnitCubeMesh, deserializeStudioEditableMesh,
  hashStudioEditableMesh, serializeStudioEditableMesh, type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";
import {
  analyzeStudioEditableMeshIntegrity, readStudioMeshFaceLoops, type StudioMeshFaceLoop,
} from "./studio-hybrid-dcc-face-modeling-mesh";
import { hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import { planStudioMeshSurface } from "../mesh-surface/studio-mesh-surface-plan";
import { splitStudioEditableFaceBoundaryChord, type StudioBoundaryChordAnchor, type StudioBoundaryChordRequest, type StudioBoundaryChordResult, type StudioBoundaryChordSource } from "./studio-hybrid-dcc-boundary-chord";

function need<T>(value: T | undefined): T { if (value === undefined) throw new Error("회귀 입력의 실제 ID가 없습니다."); return value; }
function loops(mesh: StudioEditableMesh): StudioMeshFaceLoop[] { const value = readStudioMeshFaceLoops(mesh); if (!value) throw new Error("회귀 입력의 면 루프가 없습니다."); return value; }
function top(mesh: StudioEditableMesh): StudioMeshFaceLoop {
  return need(loops(mesh).find((loop) => loop.vertexIds.every((id) => need(mesh.vertices[id]).position.y === 0.5)));
}
function source(mesh = createStudioUnitCubeMesh()): StudioBoundaryChordSource { return { mesh, meshHash: hashStudioEditableMesh(mesh), meshRevision: 17 }; }
function request(value: StudioBoundaryChordSource, face: StudioMeshFaceLoop, start: StudioBoundaryChordAnchor, end: StudioBoundaryChordAnchor): StudioBoundaryChordRequest {
  return { sourceMeshHash: value.meshHash, sourceMeshRevision: value.meshRevision, faceId: face.id, start, end };
}
function success(result: StudioBoundaryChordResult): Extract<StudioBoundaryChordResult, { ok: true }> {
  if (!result.ok) throw new Error(`${result.code}: ${result.messageKo}`); return result;
}
function vertex(id: number): StudioBoundaryChordAnchor { return { kind: "vertex", vertexId: id }; }
function edge(id: number, t = 0.5): StudioBoundaryChordAnchor { return { kind: "edge", halfEdgeId: id, t }; }
function diagonal(value: StudioBoundaryChordSource): StudioBoundaryChordRequest {
  const face = top(value.mesh); return request(value, face, vertex(need(face.vertexIds[0])), vertex(need(face.vertexIds[2])));
}
function oppositeEdges(value: StudioBoundaryChordSource): StudioBoundaryChordRequest {
  const face = top(value.mesh); return request(value, face, edge(need(face.halfEdgeIds[0])), edge(need(face.halfEdgeIds[2])));
}
function attributedCube(): StudioEditableMesh {
  const mesh = createStudioUnitCubeMesh();
  return { ...mesh, faces: mesh.faces.map((face) => ({ ...face, materialSlot: face.id + 3, smooth: false })),
    halfEdges: mesh.halfEdges.map((halfEdge) => ({ ...halfEdge, crease: (halfEdge.id % 7) / 8 })),
    vertices: mesh.vertices.map((value) => ({ ...value, crease: (value.id % 4) / 4 })) };
}
function expectCubeConservation(original: StudioEditableMesh, next: StudioEditableMesh, vertices: number, edges: number): void {
  const before = analyzeStudioEditableMeshIntegrity(original), after = analyzeStudioEditableMeshIntegrity(next);
  expect(next.vertices).toHaveLength(vertices); expect(next.halfEdges.length / 2).toBe(edges);
  expect(next.faces).toHaveLength(7); expect(vertices - edges + next.faces.length).toBe(2);
  expect(after.totalArea).toBeCloseTo(6, 12); expect(after.signedVolume).toBeCloseTo(1, 12);
  expect(after.signedVolume).toBeCloseTo(before.signedVolume, 12);
}
function expectCompleteEdgeRemap(original: StudioEditableMesh, result: Extract<StudioBoundaryChordResult, { ok: true }>): void {
  expect(result.halfEdgeRemap.map(({ sourceHalfEdgeId }) => sourceHalfEdgeId)).toEqual(original.halfEdges.map(({ id }) => id));
  for (const mapping of result.halfEdgeRemap) {
    const sourceEdge = need(original.halfEdges[mapping.sourceHalfEdgeId]);
    const chain = mapping.resultHalfEdgeIds.map((id) => need(result.mesh.halfEdges[id]));
    expect([1, 2]).toContain(chain.length);
    expect(need(result.mesh.halfEdges[need(chain[0]).prev]).vertex).toBe(need(original.halfEdges[sourceEdge.prev]).vertex);
    expect(need(chain[chain.length - 1]).vertex).toBe(sourceEdge.vertex);
    const faceIds = need(result.faceRemap.find(({ sourceFaceId }) => sourceFaceId === sourceEdge.face)).resultFaceIds;
    for (const [index, next] of chain.entries()) {
      expect(next.crease).toBe(sourceEdge.crease); expect(faceIds).toContain(next.face);
      if (index > 0) expect(need(result.mesh.halfEdges[next.prev]).vertex).toBe(need(chain[index - 1]).vertex);
    }
    if (sourceEdge.twin >= 0) {
      const twinChain = need(result.halfEdgeRemap.find(({ sourceHalfEdgeId }) => sourceHalfEdgeId === sourceEdge.twin)).resultHalfEdgeIds;
      expect(chain.map(({ twin }) => twin)).toEqual([...twinChain].reverse());
    }
  }
}
function expectStableFaceIds(original: StudioEditableMesh, selectedFaceId: number, result: Extract<StudioBoundaryChordResult, { ok: true }>): void {
  const appendedFaceId = original.faces.length;
  expect(result.faceRemap).toEqual(original.faces.map(({ id }) => ({ sourceFaceId: id,
    resultFaceIds: id === selectedFaceId ? [id, appendedFaceId] : [id] })));
  expect(result.selectionFaceIds).toEqual([selectedFaceId, appendedFaceId]);
  expect(result.mesh.faces.slice(0, appendedFaceId).map(({ id }) => id)).toEqual(original.faces.map(({ id }) => id));
  expect(need(result.mesh.faces[appendedFaceId]).id).toBe(appendedFaceId);
  const before = need(loops(original).find(({ id }) => id === selectedFaceId));
  const retained = need(loops(result.mesh).find(({ id }) => id === selectedFaceId));
  expect(retained.vertexIds[0]).toBe(before.vertexIds[0]);
  expect(result.mesh.nextVertexId).toBe(result.mesh.vertices.length);
  expect(result.mesh.nextHalfEdgeId).toBe(result.mesh.halfEdges.length);
  expect(result.mesh.nextFaceId).toBe(result.mesh.faces.length);
}
function expectReciprocal(mesh: StudioEditableMesh): void {
  for (const halfEdge of mesh.halfEdges) {
    if (halfEdge.twin < 0) continue;
    const twin = need(mesh.halfEdges[halfEdge.twin]); expect(twin.twin).toBe(halfEdge.id);
    expect(need(mesh.halfEdges[halfEdge.prev]).vertex).toBe(twin.vertex);
    expect(need(mesh.halfEdges[twin.prev]).vertex).toBe(halfEdge.vertex);
  }
}
/** 선택 사각형의 공유 모서리에 접한 128코너 반원. 원본은 상한 안이고 분할 뒤 이웃은 129코너다. */
function neighborCornerBudgetFixture(): StudioEditableMesh {
  const positions = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }], neighbor = [1, 0];
  for (let index = 1; index <= 126; index++) {
    const angle = Math.PI + Math.PI * index / 127;
    neighbor.push(positions.length); positions.push({ x: 0.5 + 0.5 * Math.cos(angle), y: 0.5 * Math.sin(angle), z: 0 });
  }
  const mesh = createStudioEditableMeshFromPolygons(positions, [[0, 1, 2, 3], neighbor]);
  return { ...mesh, faces: mesh.faces.map((face) => ({ ...face, smooth: false })) };
}

describe("선택 convex 면의 authoritative boundary chord durable 후보", () => {
  it("cube의 대각 정점 chord는 V8/E13/F7이며 닫힘·면적·signed volume·원본을 보존한다", () => {
    const value = source(), before = serializeStudioEditableMesh(value.mesh);
    const result = success(splitStudioEditableFaceBoundaryChord(value, diagonal(value)));
    expect(result.addedVertexIds).toEqual([]); expect(result.selectionFaceIds).toHaveLength(2);
    expect(result.faceRemap).toHaveLength(6); expect(result.halfEdgeRemap).toHaveLength(24);
    expect(analyzeStudioEditableMeshIntegrity(result.mesh).closed).toBe(true);
    expectCubeConservation(value.mesh, result.mesh, 8, 13); expectCompleteEdgeRemap(value.mesh, result);
    expectStableFaceIds(value.mesh, top(value.mesh).id, result);
    expectReciprocal(result.mesh); expect(serializeStudioEditableMesh(value.mesh)).toEqual(before);
  });

  it("flat+crease 공유 edge 두 개를 나누면 V10/E15/F7과 같은 새 VID·양방향 속성·전체 remap을 보존한다", () => {
    const value = source(attributedCube()), face = top(value.mesh), before = serializeStudioEditableMesh(value.mesh);
    const result = success(splitStudioEditableFaceBoundaryChord(value, oppositeEdges(value))), resultLoops = loops(result.mesh);
    expect(result.addedVertexIds).toHaveLength(2); expect(analyzeStudioEditableMeshIntegrity(result.mesh).closed).toBe(true);
    expectCubeConservation(value.mesh, result.mesh, 10, 15); expectCompleteEdgeRemap(value.mesh, result); expectReciprocal(result.mesh);
    expectStableFaceIds(value.mesh, face.id, result);
    for (const [index, sourceEdgeId] of [need(face.halfEdgeIds[0]), need(face.halfEdgeIds[2])].entries()) {
      const sourceEdge = need(value.mesh.halfEdges[sourceEdgeId]), twin = need(value.mesh.halfEdges[sourceEdge.twin]);
      const splitVertex = need(result.addedVertexIds[index]);
      const neighborMapping = need(result.faceRemap.find((mapping) => mapping.sourceFaceId === twin.face));
      expect(need(resultLoops.find((loop) => loop.id === need(neighborMapping.resultFaceIds[0]))).vertexIds).toContain(splitVertex);
      for (const sourceId of [sourceEdge.id, twin.id]) expect(need(result.halfEdgeRemap.find((item) => item.sourceHalfEdgeId === sourceId)).resultHalfEdgeIds).toHaveLength(2);
    }
    for (const mapping of result.faceRemap) for (const id of mapping.resultFaceIds) {
      const original = need(value.mesh.faces[mapping.sourceFaceId]), next = need(result.mesh.faces[id]);
      expect([next.materialSlot, next.smooth]).toEqual([original.materialSlot, original.smooth]);
    }
    expect(result.mesh.vertices.slice(0, 8).map(({ crease }) => crease)).toEqual(value.mesh.vertices.map(({ crease }) => crease));
    expect(serializeStudioEditableMesh(value.mesh)).toEqual(before);
  });

  it("선택 반변의 t와 이웃 twin의 1-t는 같은 authoritative 결과를 만든다", () => {
    const value = source(), face = top(value.mesh), sourceEdge = need(value.mesh.halfEdges[need(face.halfEdgeIds[0])]);
    const end = vertex(need(face.vertexIds[2]));
    const a = success(splitStudioEditableFaceBoundaryChord(value, request(value, face, edge(sourceEdge.id, 0.25), end)));
    const b = success(splitStudioEditableFaceBoundaryChord(value, request(value, face, edge(sourceEdge.twin, 0.75), end)));
    expectStableFaceIds(value.mesh, face.id, a); expectStableFaceIds(value.mesh, face.id, b);
    expect(serializeStudioEditableMesh(a.mesh)).toEqual(serializeStudioEditableMesh(b.mesh));
  });

  it("smooth와 zero-crease 원본은 실제 interactive source/result admission을 통과한다", () => {
    const mesh = createStudioUnitCubeMesh(), value = source({ ...mesh, faces: mesh.faces.map((face) => ({ ...face, smooth: true })) });
    expect(inspectStudioMeshSurfaceForInteractiveProjection(value.mesh).ok).toBe(true);
    const result = success(splitStudioEditableFaceBoundaryChord(value, oppositeEdges(value))), inspected = inspectStudioMeshSurfaceForInteractiveProjection(result.mesh);
    if (!inspected.ok) throw new Error(inspected.message);
    expect(inspected.value.normalMode).toBe("smooth");
    expectStableFaceIds(value.mesh, top(value.mesh).id, result);
    expectCubeConservation(value.mesh, result.mesh, 10, 15); expectCompleteEdgeRemap(value.mesh, result);
  });

  it("일반 planner 성공이어도 smooth+nonzero crease 원본은 시작 전에 atomic 거부한다", () => {
    const mesh = attributedCube(), value = source({ ...mesh, faces: mesh.faces.map((face) => ({ ...face, smooth: true })) });
    const before = serializeStudioEditableMesh(value.mesh);
    expect(planStudioMeshSurface(value.mesh, undefined, { allowCreaseMetadata: true, topologyPolicy: "editable" }).ok).toBe(true);
    expect(inspectStudioMeshSurfaceForInteractiveProjection(value.mesh).ok).toBe(false);
    expect(splitStudioEditableFaceBoundaryChord(value, oppositeEdges(value))).toMatchObject({ ok: false, code: "unsupported-source" });
    expect(serializeStudioEditableMesh(value.mesh)).toEqual(before);
  });

  it("허용된 128코너 이웃이 split으로 129코너가 되면 결과를 노출하지 않고 원본을 보존한다", () => {
    const value = source(neighborCornerBudgetFixture()), face = need(loops(value.mesh)[0]), before = serializeStudioEditableMesh(value.mesh);
    expect(need(loops(value.mesh)[1]).vertexIds).toHaveLength(128); expect(inspectStudioMeshSurfaceForInteractiveProjection(value.mesh).ok).toBe(true);
    const rejected = splitStudioEditableFaceBoundaryChord(value, request(value, face, edge(need(face.halfEdgeIds[0])), edge(need(face.halfEdgeIds[2]))));
    expect(rejected).toMatchObject({ ok: false, code: "invalid-result" });
    if (rejected.ok) throw new Error("interactive 상한 밖 결과를 반환했습니다.");
    expect(rejected.messageKo).toContain("편집 뷰포트"); expect(rejected.messageKo).toContain("예산");
    expect(serializeStudioEditableMesh(value.mesh)).toEqual(before);
    // 같은 split topology를 독립 입력으로 만들어 일반 planner와 실제 표시 수용을 구분한다.
    const positions = value.mesh.vertices.map(({ position }) => ({ ...position })), bottom = positions.length, upper = bottom + 1;
    positions.push({ x: 0.5, y: 0, z: 0 }, { x: 0.5, y: 1, z: 0 });
    const neighbor = need(loops(value.mesh)[1]).vertexIds;
    const overBase = createStudioEditableMeshFromPolygons(positions, [[0, bottom, upper, 3], [need(neighbor[0]), bottom, ...neighbor.slice(1)], [bottom, 1, 2, upper]]);
    const over: StudioEditableMesh = { ...overBase, faces: overBase.faces.map((record) => ({ ...record, smooth: false })) };
    expect(need(loops(over)[1]).vertexIds).toHaveLength(129);
    expect(planStudioMeshSurface(over, undefined, { allowCreaseMetadata: true, topologyPolicy: "editable" }).ok).toBe(true);
    expect(inspectStudioMeshSurfaceForInteractiveProjection(over).ok).toBe(false);
    const overSource = source(over), overFace = need(loops(over)[0]), overBefore = serializeStudioEditableMesh(over);
    expect(splitStudioEditableFaceBoundaryChord(overSource, request(overSource, overFace, vertex(need(overFace.vertexIds[0])), vertex(need(overFace.vertexIds[2]))))).toMatchObject({ ok: false, code: "unsupported-source" });
    expect(serializeStudioEditableMesh(over)).toEqual(overBefore);
  });

  it("기존 double 좌표와 새 lerp 위치는 Float32 정본 저장을 거치지 않는다", () => {
    const original = createStudioUnitCubeMesh();
    const mesh: StudioEditableMesh = { ...original, vertices: original.vertices.map((value) => ({ ...value,
      position: { x: value.position.x + 0.123456789012345, y: value.position.y, z: value.position.z + 0.234567890123456 } })) };
    const value = source(mesh), face = top(mesh), halfEdge = need(mesh.halfEdges[need(face.halfEdgeIds[0])]);
    const result = success(splitStudioEditableFaceBoundaryChord(value, request(value, face, edge(halfEdge.id, 0.37), vertex(need(face.vertexIds[2])))));
    expect(result.mesh.vertices.slice(0, 8).map(({ position }) => position)).toEqual(mesh.vertices.map(({ position }) => position));
    const origin = need(mesh.halfEdges[halfEdge.prev]).vertex, low = Math.min(origin, halfEdge.vertex), high = Math.max(origin, halfEdge.vertex);
    const a = need(mesh.vertices[low]).position, b = need(mesh.vertices[high]).position, t = origin === low ? 0.37 : 1 - 0.37;
    const point = need(result.mesh.vertices[need(result.addedVertexIds[0])]).position;
    expect(point).toEqual({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    expect([point.x, point.y, point.z].some((coordinate) => Math.fround(coordinate) !== coordinate)).toBe(true);
  });

  it("해시·dynamic revision 불일치와 잘못된 dense counter는 결과 없이 atomic 거부한다", () => {
    const value = source(), input = diagonal(value), before = serializeStudioEditableMesh(value.mesh);
    for (const next of [{ ...input, sourceMeshHash: "stale" }, { ...input, sourceMeshRevision: 16 }]) expect(splitStudioEditableFaceBoundaryChord(value, next)).toMatchObject({ ok: false, code: "stale-source" });
    expect(splitStudioEditableFaceBoundaryChord({ ...value, meshHash: "stale" }, { ...input, sourceMeshHash: "stale" })).toMatchObject({ ok: false, code: "stale-source" });
    const keys: readonly ("nextVertexId" | "nextHalfEdgeId" | "nextFaceId")[] = ["nextVertexId", "nextHalfEdgeId", "nextFaceId"];
    for (const key of keys) for (const delta of [-1, 1]) {
      const malformed: StudioEditableMesh = { ...value.mesh, [key]: value.mesh[key] + delta }, rawBefore = JSON.stringify(malformed);
      const rejected = splitStudioEditableFaceBoundaryChord({ ...value, mesh: malformed }, input);
      expect(rejected).toMatchObject({ ok: false, code: "invalid-source" });
      if (rejected.ok) throw new Error("잘못된 counter에서 결과를 반환했습니다.");
      expect(rejected.messageKo).toContain(key); expect(JSON.stringify(malformed)).toBe(rawBefore);
    }
    expect(serializeStudioEditableMesh(value.mesh)).toEqual(before);
  });

  it("같은 정점·인접 정점·같은 모서리 두 점·짧은 segment는 atomic 거부한다", () => {
    const value = source(), face = top(value.mesh), before = serializeStudioEditableMesh(value.mesh);
    const a = need(face.vertexIds[0]), b = need(face.vertexIds[1]), he = need(face.halfEdgeIds[0]);
    const cases: readonly (readonly [StudioBoundaryChordAnchor, StudioBoundaryChordAnchor])[] = [[vertex(a), vertex(a)], [vertex(a), vertex(b)], [edge(he, 0.25), edge(he, 0.75)], [edge(he, 1e-8), vertex(need(face.vertexIds[2]))]];
    for (const [start, end] of cases) expect(splitStudioEditableFaceBoundaryChord(value, request(value, face, start, end))).toMatchObject({ ok: false, code: "degenerate-chord" });
    expect(serializeStudioEditableMesh(value.mesh)).toEqual(before);
  });

  it("열린 quad의 boundary 분할은 경계 반변 두 개 증가만 허용하고 phantom twin을 만들지 않는다", () => {
    const mesh = createStudioEditableMeshFromPolygons([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }], [[0, 1, 2, 3]]);
    const value = source(mesh), face = need(loops(mesh)[0]);
    const result = success(splitStudioEditableFaceBoundaryChord(value, request(value, face, edge(need(face.halfEdgeIds[0])), edge(need(face.halfEdgeIds[2])))));
    const report = analyzeStudioEditableMeshIntegrity(result.mesh);
    expect(report.boundaryHalfEdges).toBe(6); expect(report.totalArea).toBeCloseTo(1, 12);
    expect(result.mesh.halfEdges.filter(({ twin }) => twin >= 0)).toHaveLength(2); expectReciprocal(result.mesh); expectCompleteEdgeRemap(value.mesh, result);
  });

  it("UV authority가 있으면 새 코너를 임의 보간하거나 버리지 않고 명시 거부한다", () => {
    const original = createStudioUnitCubeMesh();
    const mesh: StudioEditableMesh = { ...original, uvLayer: { revision: 1, topologyHash: hashStudioMeshUvTopology(original), corners: original.halfEdges.map(({ id }) => ({ halfEdgeId: id, u: Math.fround(id / 8), v: 0 })) } };
    const value = source(mesh), before = serializeStudioEditableMesh(mesh);
    expect(splitStudioEditableFaceBoundaryChord(value, diagonal(value))).toMatchObject({ ok: false, code: "unsupported-uv" }); expect(serializeStudioEditableMesh(mesh)).toEqual(before);
  });

  it("성공 결과 직렬화·재열기에서도 geometry·crease·material authority를 유지한다", () => {
    const value = source(attributedCube()), result = success(splitStudioEditableFaceBoundaryChord(value, oppositeEdges(value)));
    const snapshot = serializeStudioEditableMesh(result.mesh), reopened = deserializeStudioEditableMesh(snapshot);
    expect(serializeStudioEditableMesh(reopened)).toEqual(snapshot); expect(hashStudioEditableMesh(reopened)).toBe(hashStudioEditableMesh(result.mesh));
  });
});
