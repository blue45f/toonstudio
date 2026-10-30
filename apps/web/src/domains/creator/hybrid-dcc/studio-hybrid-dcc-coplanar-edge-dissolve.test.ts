import { describe, expect, it } from "vitest";

import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import {
  createStudioEditableMeshFromPolygons,
  createStudioUnitCubeMesh,
  deserializeStudioEditableMesh,
  hashStudioEditableMesh,
  serializeStudioEditableMesh,
  validateStudioEditableMeshSerializableAuthority,
  type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";

import { dissolveStudioHybridDccCoplanarEdges } from "./studio-hybrid-dcc-coplanar-edge-dissolve";
import {
  analyzeStudioEditableMeshIntegrity,
  readStudioMeshFaceLoops,
} from "./studio-hybrid-dcc-face-modeling-mesh";

type Outcome = ReturnType<typeof dissolveStudioHybridDccCoplanarEdges>;
type Success = Extract<Outcome, { readonly ok: true }>;

function success(outcome: Outcome): Success {
  if (!outcome.ok) throw new Error(`${outcome.code}: ${outcome.detail}`);
  return outcome;
}

function edgeBetween(mesh: StudioEditableMesh, from: number, to: number): number {
  const edge = mesh.halfEdges.find((item) => mesh.halfEdges[item.prev]?.vertex === from && item.vertex === to);
  if (!edge) throw new Error(`경계 ${from}→${to}가 없습니다.`);
  return edge.id;
}

function dissolve(mesh: StudioEditableMesh, halfEdgeIds: readonly number[], revision = 17): Outcome {
  const meshHash = hashStudioEditableMesh(mesh);
  return dissolveStudioHybridDccCoplanarEdges({ mesh, meshHash, meshRevision: revision }, {
    sourceMeshHash: meshHash, sourceMeshRevision: revision, halfEdgeIds,
  });
}

/** 알려진 단위 cube의 +Z 사각형만 두 삼각형으로 나눈 닫힌 입력이다. */
function splitCube(): StudioEditableMesh {
  const cube = createStudioUnitCubeMesh();
  const loops = readStudioMeshFaceLoops(cube);
  if (!loops) throw new Error("cube 경계를 읽을 수 없습니다.");
  const mesh = createStudioEditableMeshFromPolygons(
    cube.vertices.map(({ position }) => ({ ...position })),
    [...loops.map((loop) => loop.id === 1 ? [4, 5, 6] : loop.vertexIds), [4, 6, 7]],
  );
  return { ...mesh, faces: mesh.faces.map((face) => ({
    ...face, smooth: false, materialSlot: face.id === 1 || face.id === 6 ? 7 : face.id + 10,
  })) };
}

function flatPatch(points: readonly (readonly [number, number])[], loops: readonly (readonly number[])[]): StudioEditableMesh {
  const mesh = createStudioEditableMeshFromPolygons(points.map(([x, y]) => ({ x, y, z: 0 })), loops);
  return { ...mesh, faces: mesh.faces.map((face) => ({ ...face, smooth: false, materialSlot: 5 })) };
}

function cubeUv(mesh: StudioEditableMesh, changedCorner = -1): StudioEditableMesh {
  return { ...mesh, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(mesh),
    corners: mesh.halfEdges.map((edge) => {
      const p = mesh.vertices[mesh.halfEdges[edge.prev]?.vertex ?? -1]?.position;
      if (!p) throw new Error("원본 UV 코너가 없습니다.");
      return { halfEdgeId: edge.id, u: Math.fround(p.x + 0.5 + (edge.id === changedCorner ? 0.5 : 0)), v: Math.fround(p.y + 0.5) };
    }),
  }, mesh) };
}

function expectRejectedWithoutMutation(mesh: StudioEditableMesh, run: () => Outcome, code: string): void {
  const before = serializeStudioEditableMesh(mesh), beforeHash = hashStudioEditableMesh(mesh);
  const outcome = run();
  expect(outcome.ok).toBe(false);
  if (outcome.ok) throw new Error("거부할 입력이 확정됐습니다.");
  expect(outcome.code).toBe(code);
  expect(serializeStudioEditableMesh(mesh)).toEqual(before);
  expect(hashStudioEditableMesh(mesh)).toBe(beforeHash);
}

function expectCompleteRemap(source: StudioEditableMesh, outcome: Success): void {
  expect(outcome.vertexRemap.map((entry) => entry.sourceVertexId)).toEqual(source.vertices.map(({ id }) => id));
  expect(outcome.faceRemap.map((entry) => entry.sourceFaceId)).toEqual(source.faces.map(({ id }) => id));
  expect(outcome.halfEdgeRemap.map((entry) => entry.sourceHalfEdgeId)).toEqual(source.halfEdges.map(({ id }) => id));
  for (const entry of outcome.vertexRemap) expect(entry.resultVertexIds).toEqual([entry.sourceVertexId]);
  for (const entry of outcome.halfEdgeRemap) {
    if (outcome.removedHalfEdgeIds.includes(entry.sourceHalfEdgeId)) {
      expect(entry.resultHalfEdgeIds).toEqual([]);
      continue;
    }
    expect(entry.resultHalfEdgeIds).toHaveLength(1);
    const oldEdge = source.halfEdges[entry.sourceHalfEdgeId];
    const newId = entry.resultHalfEdgeIds[0];
    const newEdge = newId === undefined ? undefined : outcome.mesh.halfEdges[newId];
    if (!oldEdge || !newEdge) throw new Error("남은 모서리의 대응이 없습니다.");
    expect(outcome.mesh.halfEdges[newEdge.prev]?.vertex).toBe(source.halfEdges[oldEdge.prev]?.vertex);
    expect(newEdge.vertex).toBe(oldEdge.vertex);
    expect(newEdge.crease).toBe(oldEdge.crease);
  }
}

describe("선택한 coplanar 공유 모서리의 면 치유", () => {
  it("단위 cube의 분할선만 지워 F7→F6을 만들고 닫힘·면적·방향·전체 대응을 보존한다", () => {
    const mesh = splitCube(), before = serializeStudioEditableMesh(mesh);
    const seam = edgeBetween(mesh, 4, 6), twin = mesh.halfEdges[seam]?.twin;
    if (twin === undefined) throw new Error("선택 seam의 twin이 없습니다.");
    const outcome = success(dissolve(mesh, [seam]));
    expect(outcome.mesh.faces).toHaveLength(6);
    expect(outcome.mesh.halfEdges).toHaveLength(24);
    expect(outcome.sourceFaceIds).toEqual([1, 6]);
    expect(outcome.removedHalfEdgeIds).toEqual([seam, twin].sort((a, b) => a - b));
    const merged = readStudioMeshFaceLoops(outcome.mesh)?.find((face) => face.id === outcome.mergedFaceId);
    expect(merged?.vertexIds).toEqual([4, 5, 6, 7]);
    expect(merged?.materialSlot).toBe(7);
    expect(merged?.smooth).toBe(false);
    const report = analyzeStudioEditableMeshIntegrity(outcome.mesh);
    expect(report.canonical).toBe(true);
    expect(report.closed).toBe(true);
    expect(report.totalArea).toBeCloseTo(6, 12);
    expect(report.signedVolume).toBeCloseTo(1, 12);
    expect(report.nonManifoldEdges).toBe(0);
    expect(report.orientationConflicts).toBe(0);
    expect(report.zeroAreaFaces).toEqual([]);
    expect(outcome.resultMeshHash).toBe(hashStudioEditableMesh(outcome.mesh));
    expectCompleteRemap(mesh, outcome);
    expect(serializeStudioEditableMesh(mesh)).toEqual(before);
  });

  it("twin 어느 쪽을 골라도 같은 결과를 만들고 두 방향 중복 선택도 같은 삭제로 정규화한다", () => {
    const mesh = splitCube(), seam = edgeBetween(mesh, 4, 6), twin = mesh.halfEdges[seam]?.twin;
    if (twin === undefined) throw new Error("선택 seam의 twin이 없습니다.");
    const first = success(dissolve(mesh, [seam]));
    expect(success(dissolve(mesh, [twin])).resultMeshHash).toBe(first.resultMeshHash);
    expect(success(dissolve(mesh, [twin, seam, twin])).resultMeshHash).toBe(first.resultMeshHash);
  });

  it("삭제 seam의 crease는 의도대로 제거하고 외곽 각 방향·정점 crease와 다른 면 속성은 유지한다", () => {
    const base = splitCube(), seam = edgeBetween(base, 4, 6), outer = edgeBetween(base, 4, 5);
    const seamTwin = base.halfEdges[seam]?.twin, outerTwin = base.halfEdges[outer]?.twin;
    const mesh: StudioEditableMesh = { ...base,
      vertices: base.vertices.map((vertex) => ({ ...vertex, crease: vertex.id === 3 ? 0.375 : 0 })),
      halfEdges: base.halfEdges.map((edge) => ({ ...edge,
        crease: edge.id === seam ? 0.75 : edge.id === seamTwin ? 0.625
          : edge.id === outer ? 0.25 : edge.id === outerTwin ? 0.5 : 0,
      })),
    };
    const outcome = success(dissolve(mesh, [seam]));
    expectCompleteRemap(mesh, outcome);
    expect(outcome.mesh.vertices.map(({ position, crease }) => ({ position, crease })))
      .toEqual(mesh.vertices.map(({ position, crease }) => ({ position, crease })));
    for (const remap of outcome.faceRemap) {
      const from = mesh.faces[remap.sourceFaceId], target = remap.resultFaceIds[0];
      if (!from || target === undefined) throw new Error("원본 면의 대응이 없습니다.");
      expect(outcome.mesh.faces[target]?.materialSlot).toBe(from.materialSlot);
      expect(outcome.mesh.faces[target]?.smooth).toBe(from.smooth);
    }
  });

  it("오목하지만 단순한 L자 외곽도 볼록 도형으로 바꾸지 않고 합친다", () => {
    const mesh = flatPatch([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], [[0, 1, 2, 3], [0, 3, 4, 5]]);
    const outcome = success(dissolve(mesh, [edgeBetween(mesh, 0, 3)]));
    expect(outcome.mesh.faces).toHaveLength(1);
    expect(readStudioMeshFaceLoops(outcome.mesh)?.[0]?.vertexIds).toEqual([0, 1, 2, 3, 4, 5]);
    expect(analyzeStudioEditableMeshIntegrity(outcome.mesh).totalArea).toBeCloseTo(3, 12);
    expectCompleteRemap(mesh, outcome);
  });

  it("연속 seam 중 고르지 않은 모서리를 몰래 지우지 않는다", () => {
    const mesh = flatPatch([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]], [[0, 1, 2, 4], [0, 4, 2, 3]]);
    const seam = edgeBetween(mesh, 4, 0);
    expectRejectedWithoutMutation(mesh, () => dissolve(mesh, [seam]), "unselected-seam");
  });

  it("같은 두 면 사이의 연속 seam을 모두 선택하면 외곽과 f64 정점을 보존한다", () => {
    const mesh = flatPatch([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]], [[0, 1, 2, 4], [0, 4, 2, 3]]);
    const outcome = success(dissolve(mesh, [edgeBetween(mesh, 4, 0), edgeBetween(mesh, 2, 4)]));
    expect(outcome.mesh.faces).toHaveLength(1);
    expect(readStudioMeshFaceLoops(outcome.mesh)?.[0]?.vertexIds).toEqual([0, 1, 2, 3]);
    expect(outcome.mesh.vertices.map(({ position }) => position)).toEqual(mesh.vertices.map(({ position }) => position));
    expect(outcome.removedHalfEdgeIds).toHaveLength(4);
    expectCompleteRemap(mesh, outcome);
  });

  it("구멍이 남는 두 외곽을 bridge로 위장해 한 면으로 만들지 않는다", () => {
    const mesh = flatPatch([[0, 0], [3, 0], [3, 3], [0, 3], [1, 1], [2, 1], [2, 2], [1, 2]],
      [[0, 1, 2, 6, 5, 4], [0, 4, 7, 6, 2, 3]]);
    const seams = [edgeBetween(mesh, 2, 6), edgeBetween(mesh, 4, 0)];
    expectRejectedWithoutMutation(mesh, () => dissolve(mesh, seams), "unsupported-boundary");
  });

  it("실제 corner UV를 새 half-edge 대응으로 옮기고 새 topology hash로 결합한다", () => {
    const mesh = cubeUv(splitCube());
    const outcome = success(dissolve(mesh, [edgeBetween(mesh, 4, 6)]));
    expect(outcome.mesh.uvLayer?.topologyHash).toBe(hashStudioMeshUvTopology(outcome.mesh));
    expect(outcome.mesh.uvLayer?.topologyHash).not.toBe(mesh.uvLayer?.topologyHash);
    for (const remap of outcome.halfEdgeRemap) {
      const target = remap.resultHalfEdgeIds[0];
      if (target === undefined) continue;
      const before = mesh.uvLayer?.corners[remap.sourceHalfEdgeId];
      const after = outcome.mesh.uvLayer?.corners[target];
      expect(after?.u).toBe(before?.u);
      expect(after?.v).toBe(before?.v);
    }
    const restored = deserializeStudioEditableMesh(serializeStudioEditableMesh(outcome.mesh));
    expect(hashStudioEditableMesh(restored)).toBe(outcome.resultMeshHash);
    expect(restored.uvLayer).toEqual(outcome.mesh.uvLayer);
  });

  it("삭제될 corner의 UV라도 기존 필드가 달라지면 한쪽 값으로 덮어 성공시키지 않는다", () => {
    const base = splitCube(), seam = edgeBetween(base, 4, 6), mesh = cubeUv(base, seam);
    expectRejectedWithoutMutation(mesh, () => dissolve(mesh, [seam]), "unsupported-uv");
  });

  it("치유와 무관한 coincident shell 두 개를 원본 ID로 구분해 각각 보존한다", () => {
    const base = splitCube(), loops = readStudioMeshFaceLoops(base);
    if (!loops) throw new Error("분할 cube의 경계가 없습니다.");
    const extra = [{ x: 3, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 3, y: 1, z: 0 }];
    const generated = createStudioEditableMeshFromPolygons(
      [...base.vertices.map(({ position }) => ({ ...position })), ...extra, ...extra].map((p) => ({ ...p })),
      [...loops.map((loop) => loop.vertexIds), [8, 9, 10], [11, 12, 13]],
    );
    const mesh = { ...generated, faces: generated.faces.map((face) => ({ ...face, smooth: false,
      materialSlot: base.faces[face.id]?.materialSlot ?? (face.id === 7 ? 21 : 23),
    })) };
    expect(validateStudioEditableMeshSerializableAuthority(mesh).ok).toBe(true);
    expect(inspectStudioMeshSurfaceForInteractiveProjection(mesh).ok).toBe(true);
    const outcome = success(dissolve(mesh, [edgeBetween(mesh, 4, 6)]));
    expect(inspectStudioMeshSurfaceForInteractiveProjection(outcome.mesh).ok).toBe(true);
    expect(outcome.mesh.faces.slice(-2).map(({ materialSlot }) => materialSlot)).toEqual([21, 23]);
    expectCompleteRemap(mesh, outcome);
  });

  it("서로 다른 평면의 cube 모서리를 치유로 오인하지 않는다", () => {
    const mesh = createStudioUnitCubeMesh();
    expectRejectedWithoutMutation(mesh, () => dissolve(mesh, [0]), "non-coplanar");
  });

  it("외곽 edge에는 두 incident face가 없으므로 원본을 바꾸지 않는다", () => {
    const mesh = flatPatch([[0, 0], [1, 0], [0, 1]], [[0, 1, 2]]);
    expectRejectedWithoutMutation(mesh, () => dissolve(mesh, [0]), "non-manifold");
  });

  it.each(["material", "smooth"] as const)("충돌하는 %s를 한쪽 값으로 조용히 덮지 않는다", (kind) => {
    const base = splitCube();
    const mesh = { ...base, faces: base.faces.map((face) => face.id !== 6 ? face
      : kind === "material" ? { ...face, materialSlot: 8 } : { ...face, smooth: true }) };
    expectRejectedWithoutMutation(mesh, () => dissolve(mesh, [edgeBetween(mesh, 4, 6)]), "attribute-conflict");
  });

  it("현재 해시와 동적 revision을 모두 검사하고 ABA revision을 같은 hash로 대체하지 않는다", () => {
    const mesh = splitCube(), meshHash = hashStudioEditableMesh(mesh), halfEdgeIds = [edgeBetween(mesh, 4, 6)];
    for (const request of [
      { sourceMeshHash: "foreign", sourceMeshRevision: 17, halfEdgeIds },
      { sourceMeshHash: meshHash, sourceMeshRevision: 18, halfEdgeIds },
    ]) expectRejectedWithoutMutation(mesh, () => dissolveStudioHybridDccCoplanarEdges({ mesh, meshHash, meshRevision: 17 }, request), "stale-source");
  });

  it("같은 root의 현재 속성이 바뀌면 과거 cache의 표시 성공으로 source admission을 우회하지 않는다", () => {
    const base = splitCube(), outer = edgeBetween(base, 4, 5);
    const mesh = { ...base,
      faces: base.faces.map((face) => ({ ...face })),
      halfEdges: base.halfEdges.map((edge) => ({ ...edge, crease: edge.id === outer ? 0.5 : 0 })),
    };
    expect(inspectStudioMeshSurfaceForInteractiveProjection(mesh).ok).toBe(true);
    for (const face of mesh.faces) face.smooth = true;
    expectRejectedWithoutMutation(mesh, () => dissolve(mesh, [edgeBetween(mesh, 4, 6)]), "unrenderable-source");
  });

  it.for([[], [-1], [0.5], [Number.NaN], [Number.MAX_SAFE_INTEGER]])("유효하지 않은 선택 %j를 거부한다", (halfEdgeIds) => {
    const mesh = splitCube();
    expectRejectedWithoutMutation(mesh, () => dissolve(mesh, halfEdgeIds), "invalid-selection");
  });

  it("치유 결과를 정상 저장·재읽기해도 f64 위치·속성·hash와 dense 권위가 같다", () => {
    const base = splitCube();
    const mesh = { ...base, vertices: base.vertices.map((vertex) => ({ ...vertex,
      position: { x: vertex.position.x + 1_048_576.125, y: vertex.position.y + 0.25, z: vertex.position.z - 0.125 },
    })) };
    const outcome = success(dissolve(mesh, [edgeBetween(mesh, 4, 6)]));
    const snapshot = serializeStudioEditableMesh(outcome.mesh), restored = deserializeStudioEditableMesh(snapshot);
    expect(validateStudioEditableMeshSerializableAuthority(restored).ok).toBe(true);
    expect(serializeStudioEditableMesh(restored)).toEqual(snapshot);
    expect(hashStudioEditableMesh(restored)).toBe(outcome.resultMeshHash);
    expect(restored.vertices.map(({ position }) => position)).toEqual(mesh.vertices.map(({ position }) => position));
  });
});
