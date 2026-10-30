/** canonical codec·실제 surface를 쓰는 미실행 회귀. full UV/제품 UI/GPU 증거가 아니다. */
import { describe, expect, it } from "vitest";
import {
  createStudioUnitCubeMesh, deserializeStudioEditableMesh, hashStudioEditableMesh, serializeStudioEditableMesh,
  type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";
import {
  decodeStudioMeshUvLayer, deriveStudioMeshUvIslands, hashStudioMeshUvTopology, hashStudioMeshUvLayer,
} from "../mesh-uv/studio-mesh-uv-authority";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import { readStudioMeshFaceLoops } from "./studio-hybrid-dcc-face-modeling-mesh";
import type { StudioBoundaryChordRequest, StudioBoundaryChordSource } from "./studio-hybrid-dcc-boundary-chord";
import { splitStudioEditableFaceBoundaryChordWithUv, type StudioBoundaryChordUvResult } from "./studio-hybrid-dcc-boundary-chord-uv";

function need<T>(value: T | undefined): T { if (value === undefined) throw new Error("실제 UV fixture 대응이 없습니다."); return value; }
function ok(result: StudioBoundaryChordUvResult): Extract<StudioBoundaryChordUvResult, { ok: true }> {
  if (!result.ok) throw new Error(`${result.code}: ${result.messageKo}`); return result;
}
function loops(mesh: StudioEditableMesh) { const result = readStudioMeshFaceLoops(mesh); if (!result) throw new Error("face loop가 없습니다."); return result; }
function uvCube(seams = false): StudioEditableMesh {
  const plain = createStudioUnitCubeMesh();
  const base: StudioEditableMesh = { ...plain,
    faces: plain.faces.map((face) => ({ ...face, materialSlot: face.id + 2, smooth: false })),
    halfEdges: plain.halfEdges.map((edge) => ({ ...edge, crease: (edge.id % 4) / 4 })),
    vertices: plain.vertices.map((vertex) => ({ ...vertex, crease: (vertex.id % 4) / 4 })) };
  const corners = base.halfEdges.map((edge) => {
    const p = need(base.vertices[need(base.halfEdges[edge.prev]).vertex]).position, shift = seams ? edge.face * 4 : 0;
    return { halfEdgeId: edge.id, u: Math.fround(-2 * (p.x + 0.5) + shift), v: Math.fround(2 * (p.z + 0.5) - shift) };
  });
  return { ...base, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(base), corners }, base) };
}
function source(mesh = uvCube()): StudioBoundaryChordSource { return { mesh, meshHash: hashStudioEditableMesh(mesh), meshRevision: 23 }; }
function request(input: StudioBoundaryChordSource, t = 0.5): StudioBoundaryChordRequest {
  const face = need(loops(input.mesh).find(({ id }) => id === 3));
  return { sourceMeshHash: input.meshHash, sourceMeshRevision: input.meshRevision, faceId: face.id,
    start: { kind: "edge", halfEdgeId: need(face.halfEdgeIds[0]), t }, end: { kind: "edge", halfEdgeId: need(face.halfEdgeIds[2]), t: 0.5 } };
}
function assertOriginalCorners(mesh: StudioEditableMesh, result: Extract<StudioBoundaryChordUvResult, { ok: true }>): void {
  const before = need(mesh.uvLayer), after = need(result.mesh.uvLayer);
  for (const mapping of result.halfEdgeRemap) {
    const old = need(before.corners[mapping.sourceHalfEdgeId]), next = need(after.corners[need(mapping.resultHalfEdgeIds[0])]);
    expect([next.u, next.v]).toEqual([old.u, old.v]);
  }
  const sourceFace = new Map(result.faceRemap.flatMap((entry) => entry.resultFaceIds.map((id): readonly [number, number] => [id, entry.sourceFaceId])));
  for (const edge of result.mesh.halfEdges) {
    const origin = need(result.mesh.halfEdges[edge.prev]).vertex;
    if (origin >= mesh.vertices.length) continue;
    const loop = need(loops(mesh).find(({ id }) => id === sourceFace.get(edge.face))), index = loop.vertexIds.indexOf(origin);
    const old = need(before.corners[need(loop.halfEdgeIds[index])]), next = need(after.corners[edge.id]);
    expect([next.u, next.v]).toEqual([old.u, old.v]);
  }
}
function withNonAffineFace(mesh: StudioEditableMesh, faceId: number): StudioEditableMesh {
  const layer = need(mesh.uvLayer), face = need(loops(mesh).find(({ id }) => id === faceId)), cornerId = need(face.halfEdgeIds[2]);
  return { ...mesh, uvLayer: decodeStudioMeshUvLayer({ ...layer,
    corners: layer.corners.map((corner) => corner.halfEdgeId === cornerId ? { ...corner, u: corner.u + 0.25 } : corner) }, mesh) };
}

describe("경계 chord의 단일 canonical UV 부분 보존 후보", () => {
  it("공유 VID와 방향별 코너 UV·재질·crease를 보존하고 연속 seam을 새로 만들지 않는다", () => {
    const input = source(), before = serializeStudioEditableMesh(input.mesh), result = ok(splitStudioEditableFaceBoundaryChordWithUv(input, request(input)));
    expect(result.mesh.vertices).toHaveLength(10); expect(result.mesh.faces).toHaveLength(7); expect(result.selectionFaceIds).toEqual([3, 6]);
    expect(deriveStudioMeshUvIslands(input.mesh)).toHaveLength(1); expect(deriveStudioMeshUvIslands(result.mesh)).toHaveLength(1);
    assertOriginalCorners(input.mesh, result);
    for (const mapping of result.halfEdgeRemap) for (const id of mapping.resultHalfEdgeIds) expect(need(result.mesh.halfEdges[id]).crease).toBe(need(input.mesh.halfEdges[mapping.sourceHalfEdgeId]).crease);
    for (const mapping of result.faceRemap) for (const id of mapping.resultFaceIds) expect([need(result.mesh.faces[id]).materialSlot, need(result.mesh.faces[id]).smooth]).toEqual([need(input.mesh.faces[mapping.sourceFaceId]).materialSlot, need(input.mesh.faces[mapping.sourceFaceId]).smooth]);
    expect(result.mesh.vertices.slice(0, 8).map(({ position, crease }) => ({ position, crease }))).toEqual(input.mesh.vertices.map(({ position, crease }) => ({ position, crease })));
    expect(result.sourceMeshHash).toBe(input.meshHash); expect(serializeStudioEditableMesh(input.mesh)).toEqual(before);
  });

  it("면별 UV seam은 같은 새 geometry vertex에서도 독립 보간하고 새 chord 양쪽은 연속이다", () => {
    const input = source(uvCube(true)), result = ok(splitStudioEditableFaceBoundaryChordWithUv(input, request(input, 0.25)));
    expect(deriveStudioMeshUvIslands(input.mesh)).toHaveLength(6); expect(deriveStudioMeshUvIslands(result.mesh)).toHaveLength(6);
    assertOriginalCorners(input.mesh, result);
    const newId = need(result.addedVertexIds[0]), occurrences = result.mesh.halfEdges.filter((edge) => need(result.mesh.halfEdges[edge.prev]).vertex === newId);
    const pairs = occurrences.map((edge) => { const uv = need(need(result.mesh.uvLayer).corners[edge.id]); return [uv.u, uv.v]; });
    expect(new Set(pairs.map((uv) => JSON.stringify(uv))).size).toBe(2);
    expect(occurrences.some(({ face }) => face === 3)).toBe(true); expect(occurrences.some(({ face }) => face === 6)).toBe(true);
    for (const edge of occurrences) {
      const mapping = need(result.faceRemap.find(({ resultFaceIds }) => resultFaceIds.includes(edge.face)));
      const expectedShift = mapping.sourceFaceId * 4, p = need(result.mesh.vertices[newId]).position, uv = need(need(result.mesh.uvLayer).corners[edge.id]);
      expect([uv.u, uv.v]).toEqual([-2 * (p.x + 0.5) + expectedShift, 2 * (p.z + 0.5) - expectedShift]);
    }
  });

  it("twin 방향의 1-t는 원본과 같은 low→high f64 보간·최종 Float32 결과를 만든다", () => {
    const input = source(uvCube(true)), forward = request(input, 0.25), anchor = forward.start;
    if (anchor.kind !== "edge") throw new Error("edge endpoint가 아닙니다.");
    const twin = need(input.mesh.halfEdges[anchor.halfEdgeId]).twin;
    const a = ok(splitStudioEditableFaceBoundaryChordWithUv(input, forward));
    const b = ok(splitStudioEditableFaceBoundaryChordWithUv(input, { ...forward, start: { kind: "edge", halfEdgeId: twin, t: 0.75 } }));
    expect(serializeStudioEditableMesh(a.mesh)).toEqual(serializeStudioEditableMesh(b.mesh));
  });

  it("건드리지 않는 non-affine 면은 UV 값·triangle 표를 그대로 두고 허용한다", () => {
    const input = source(withNonAffineFace(uvCube(true), 0)), before = serializeStudioEditableMesh(input.mesh);
    const result = ok(splitStudioEditableFaceBoundaryChordWithUv(input, request(input)));
    assertOriginalCorners(input.mesh, result);
    const oldSurface = inspectStudioMeshSurfaceForInteractiveProjection(input.mesh), newSurface = inspectStudioMeshSurfaceForInteractiveProjection(result.mesh);
    if (!oldSurface.ok || !newSurface.ok) throw new Error("실제 표면이 없습니다.");
    expect(newSurface.value.plan.triangles.filter(({ faceId }) => faceId === 0).map(({ vertexIds }) => vertexIds)).toEqual(oldSurface.value.plan.triangles.filter(({ faceId }) => faceId === 0).map(({ vertexIds }) => vertexIds));
    expect(serializeStudioEditableMesh(input.mesh)).toEqual(before);
  });

  it("선택 면 또는 split 이웃의 non-affine UV는 코너만 복사해 성공하지 않고 atomic 거부한다", () => {
    for (const faceId of [3, 4]) {
      const input = source(withNonAffineFace(uvCube(true), faceId)), before = serializeStudioEditableMesh(input.mesh);
      expect(splitStudioEditableFaceBoundaryChordWithUv(input, request(input))).toMatchObject({ ok: false, code: "unsupported-uv-mapping" });
      expect(serializeStudioEditableMesh(input.mesh)).toEqual(before);
    }
  });

  it("UV 반올림과 f64 midpoint/실제 Float32 위치 차이는 임의 epsilon으로 덮지 않는다", () => {
    const base = uvCube(), translated: StudioEditableMesh = { ...base, vertices: base.vertices.map((vertex) => ({ ...vertex,
      position: { ...vertex.position, z: vertex.position.z + 2 ** -25 } })) };
    const cases: readonly { readonly mesh: StudioEditableMesh; readonly t: number }[] = [{ mesh: base, t: 0.37 }, { mesh: translated, t: 0.5 }];
    for (const entry of cases) {
      const input = source(entry.mesh), before = serializeStudioEditableMesh(input.mesh);
      expect(splitStudioEditableFaceBoundaryChordWithUv(input, request(input, entry.t))).toMatchObject({ ok: false, code: "unsupported-uv-precision" });
      expect(serializeStudioEditableMesh(input.mesh)).toEqual(before);
    }
  });

  it("UV revision은 유지하고 topology hash는 실제 결과에 다시 결합하며 직렬화·재열기를 보존한다", () => {
    const input = source(uvCube(true)), result = ok(splitStudioEditableFaceBoundaryChordWithUv(input, request(input))), layer = need(result.mesh.uvLayer);
    expect(layer.revision).toBe(1); expect(layer.topologyHash).toBe(hashStudioMeshUvTopology(result.mesh));
    expect(layer.topologyHash).not.toBe(need(input.mesh.uvLayer).topologyHash); expect(layer.corners).toHaveLength(result.mesh.halfEdges.length);
    const snapshot = serializeStudioEditableMesh(result.mesh), reopened = deserializeStudioEditableMesh(snapshot);
    expect(serializeStudioEditableMesh(reopened)).toEqual(snapshot); expect(hashStudioMeshUvLayer(need(reopened.uvLayer))).toBe(hashStudioMeshUvLayer(layer));
  });

  it("미노출 다중 UV channel·Q metadata를 조용히 버리지 않고 canonical schema에서 거부한다", () => {
    const input = source(), layer = need(input.mesh.uvLayer);
    const extraLayer = { ...layer, channel: 1 }, extraCorner = { ...layer, corners: layer.corners.map((corner) => ({ ...corner, q: 1 })) };
    for (const uvLayer of [extraLayer, extraCorner]) {
      const malformed = { ...input.mesh, uvLayer }, before = JSON.stringify(malformed);
      expect(splitStudioEditableFaceBoundaryChordWithUv({ ...input, mesh: malformed }, request(input))).toMatchObject({ ok: false, code: "invalid-source" });
      expect(JSON.stringify(malformed)).toBe(before);
    }
  });

  it("UV hash 또는 dynamic revision이 stale이면 geometry 계산으로 scope를 바꿔 우회하지 못한다", () => {
    const input = source(), before = serializeStudioEditableMesh(input.mesh), base = request(input);
    for (const next of [{ ...base, sourceMeshHash: "stale" }, { ...base, sourceMeshRevision: 22 }]) expect(splitStudioEditableFaceBoundaryChordWithUv(input, next)).toMatchObject({ ok: false, code: "stale-source" });
    expect(serializeStudioEditableMesh(input.mesh)).toEqual(before);
  });

  it("무UV 원본은 기존 v2 계약으로 위임하며 UV channel을 새로 생성하지 않는다", () => {
    const input = source(createStudioUnitCubeMesh()), result = ok(splitStudioEditableFaceBoundaryChordWithUv(input, request(input)));
    expect(result.mesh.uvLayer).toBeUndefined(); expect(result.sourceMeshHash).toBe(input.meshHash); expect(result.selectionFaceIds).toEqual([3, 6]);
  });
});
