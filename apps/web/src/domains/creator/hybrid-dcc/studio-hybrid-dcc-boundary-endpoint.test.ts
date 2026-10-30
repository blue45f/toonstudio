/** 실제 Three 수학·선택 권위로 구성한 미실행 회귀. 실제 raycast/GPU/UI 성공 증거가 아니다. */
import { Matrix4, OrthographicCamera, PerspectiveCamera, Quaternion, Vector2, Vector3, WebGPUCoordinateSystem } from "three";
import { describe, expect, it } from "vitest";
import {
  createStudioEditableMeshFromPolygons, createStudioUnitCubeMesh, deserializeStudioEditableMesh,
  hashStudioEditableMesh, serializeStudioEditableMesh, type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";
import {
  createStudioHybridDccComponentSelection, mapStudioHybridDccRayFaceIndex, mutateStudioHybridDccComponentSelection,
  type StudioHybridDccComponentSelection, type StudioHybridDccMeshSelectionSource, type StudioHybridDccRayHitMapping,
} from "./studio-hybrid-dcc-component-selection";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import { splitStudioEditableFaceBoundaryChord } from "./studio-hybrid-dcc-boundary-chord";
import {
  admitStudioHybridDccBoundaryEndpoint, collectStudioHybridDccBoundaryEndpoint,
  type StudioBoundaryEndpointProjection, type StudioBoundaryEndpointResult,
} from "./studio-hybrid-dcc-boundary-endpoint";

function need<T>(value: T | undefined): T { if (value === undefined) throw new Error("회귀 fixture의 실제 값이 없습니다."); return value; }
function value<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false }): T {
  if (!result.ok) throw new Error("실제 authority fixture가 실패했습니다."); return result.value;
}
function ok<T>(result: StudioBoundaryEndpointResult<T>): T {
  if (!result.ok) throw new Error(`${result.code}: ${result.messageKo}`); return result.value;
}
function mesh(z0 = -2, z1 = -8, reverse = false): StudioEditableMesh {
  return createStudioEditableMeshFromPolygons([
    { x: -1, y: -1, z: z0 }, { x: 1, y: -1, z: z1 }, { x: 1, y: 1, z: z1 }, { x: -1, y: 1, z: z0 },
  ], [reverse ? [1, 0, 3, 2] : [0, 1, 2, 3]]);
}
function source(input = mesh(), meshRevision = 19, assetId = "chord-source"): StudioHybridDccMeshSelectionSource {
  return { assetId, mesh: input, meshRevision, sourceHash: hashStudioEditableMesh(input) };
}
function selected(input: StudioHybridDccMeshSelectionSource, faceId = 0): StudioHybridDccComponentSelection {
  return value(mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "face", operation: "replace", ids: [faceId], source: input,
  }));
}
function hit(input: StudioHybridDccMeshSelectionSource, faceId = 0): StudioHybridDccRayHitMapping {
  const inspected = inspectStudioMeshSurfaceForInteractiveProjection(input.mesh);
  if (!inspected.ok) throw new Error(inspected.message);
  const index = inspected.value.plan.triangles.findIndex((triangle) => triangle.faceId === faceId);
  return value(mapStudioHybridDccRayFaceIndex(input, index));
}
function camera(): PerspectiveCamera { const result = new PerspectiveCamera(90, 1, 0.1, 100); result.updateMatrixWorld(); return result; }
function at(input: StudioHybridDccMeshSelectionSource, edgeId: number, t: number, cameraValue: StudioBoundaryEndpointProjection["camera"], world = new Matrix4()): Vector2 {
  const edge = need(input.mesh.halfEdges[edgeId]), a = need(input.mesh.vertices[need(input.mesh.halfEdges[edge.prev]).vertex]).position;
  const b = need(input.mesh.vertices[edge.vertex]).position;
  const point = new Vector3(a.x, a.y, a.z).lerp(new Vector3(b.x, b.y, b.z), t).applyMatrix4(world).project(cameraValue);
  return new Vector2(point.x, point.y);
}
function projection(cameraValue: StudioBoundaryEndpointProjection["camera"], pointerNdc: Vector2, matrixWorld = new Matrix4()): StudioBoundaryEndpointProjection {
  return { camera: cameraValue, pointerNdc, matrixWorld, viewportSize: { width: 600, height: 600 } };
}

describe("SK01 경계 endpoint 수집·lease 후보", () => {
  it("원근 화면의 lambda=.8인 edge 중간점은 원본 t=.5이며 source·카메라·행렬을 바꾸지 않는다", () => {
    const input = source(), selection = selected(input), mapping = hit(input), view = camera(), world = new Matrix4();
    const pointer = at(input, 0, 0.5, view, world), p0 = at(input, 0, 0, view), p1 = at(input, 0, 1, view);
    expect((pointer.x - p0.x) / (p1.x - p0.x)).toBeCloseTo(0.8, 14);
    const before = { mesh: serializeStudioEditableMesh(input.mesh), view: view.matrixWorldInverse.toArray(), project: view.projectionMatrix.toArray(), world: world.toArray(), pointer: pointer.toArray() };
    const lease = ok(collectStudioHybridDccBoundaryEndpoint(input, selection, mapping, "edge", projection(view, pointer, world)));
    expect(lease.anchor.kind).toBe("edge"); if (lease.anchor.kind !== "edge") throw new Error("edge가 아닙니다.");
    expect(lease.anchor.halfEdgeId).toBe(0); expect(lease.anchor.t).toBeCloseTo(0.5, 14);
    expect(ok(admitStudioHybridDccBoundaryEndpoint(lease, { ...input }, selection))).toBe(lease.anchor);
    expect(Object.isFrozen(lease)).toBe(true); expect(Object.isFrozen(lease.provenance)).toBe(true); expect(Object.isFrozen(lease.anchor)).toBe(true);
    expect({ mesh: serializeStudioEditableMesh(input.mesh), view: view.matrixWorldInverse.toArray(), project: view.projectionMatrix.toArray(), world: world.toArray(), pointer: pointer.toArray() }).toEqual(before);
  });

  it("직교와 음수·비균일 world TRS에서도 원본 방향의 t를 유지한다", () => {
    const input = source(), view = new OrthographicCamera(-4, 4, 4, -4, 0.1, 100); view.updateMatrixWorld();
    const world = new Matrix4().compose(new Vector3(0.2, -0.1, -3), new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.23), new Vector3(-1.7, 0.6, 1.3));
    const lease = ok(collectStudioHybridDccBoundaryEndpoint(input, selected(input), hit(input), "edge", projection(view, at(input, 0, 0.25, view, world), world)));
    expect(lease.anchor.kind).toBe("edge"); if (lease.anchor.kind !== "edge") throw new Error("edge가 아닙니다.");
    expect(lease.anchor.t).toBeCloseTo(0.25, 14);
  });

  it("같은 위치를 반대 origin→destination edge로 표현하면 t는 1-t가 된다", () => {
    const forward = source(), reverse = source(mesh(-2, -8, true)), view = camera(), pointer = at(forward, 0, 0.2, view);
    const a = ok(collectStudioHybridDccBoundaryEndpoint(forward, selected(forward), hit(forward), "edge", projection(view, pointer)));
    const b = ok(collectStudioHybridDccBoundaryEndpoint(reverse, selected(reverse), hit(reverse), "edge", projection(view, pointer)));
    if (a.anchor.kind !== "edge" || b.anchor.kind !== "edge") throw new Error("edge가 아닙니다.");
    expect(a.anchor.t).toBeCloseTo(0.2, 14); expect(b.anchor.t).toBeCloseTo(0.8, 14);
  });

  it("near plane을 가르는 edge는 visible 구간을 clip하되 t를 visible구간 비율로 재정의하지 않는다", () => {
    const input = source(mesh(-0.01, -4)), view = new PerspectiveCamera(90, 1, 1, 100); view.updateMatrixWorld();
    const lease = ok(collectStudioHybridDccBoundaryEndpoint(input, selected(input), hit(input), "edge", projection(view, at(input, 0, 0.6, view))));
    if (lease.anchor.kind !== "edge") throw new Error("edge가 아닙니다."); expect(lease.anchor.t).toBeCloseTo(0.6, 13);
  });

  it("WebGPU zero-to-one depth clip도 실제 public projection matrix와 같은 원본 t를 쓴다", () => {
    const input = source(mesh(-0.01, -4)), view = new PerspectiveCamera(90, 1, 1, 100);
    view.coordinateSystem = WebGPUCoordinateSystem; view.updateProjectionMatrix(); view.updateMatrixWorld();
    const lease = ok(collectStudioHybridDccBoundaryEndpoint(input, selected(input), hit(input), "edge", projection(view, at(input, 0, 0.6, view))));
    if (lease.anchor.kind !== "edge") throw new Error("edge가 아닙니다."); expect(lease.anchor.t).toBeCloseTo(0.6, 13);
  });

  it("vertex mode와 정확한 edge 끝점은 새 좌표 대신 실제 vertex ID를 사용한다", () => {
    const input = source(), view = camera(), endpoint = at(input, 0, 0, view);
    for (const mode of ["vertex", "edge"] satisfies readonly ("vertex" | "edge")[]) {
      const lease = ok(collectStudioHybridDccBoundaryEndpoint(input, selected(input), hit(input), mode, projection(view, endpoint)));
      expect(lease.anchor).toEqual({ kind: "vertex", vertexId: 0 });
    }
  });

  it("카메라 뒤·far 밖의 boundary는 투영을 뒤집어 임의 edge로 고르지 않는다", () => {
    for (const input of [source(mesh(2, 8)), source(mesh(-200, -208))]) {
      expect(collectStudioHybridDccBoundaryEndpoint(input, selected(input), hit(input), "edge", projection(camera(), new Vector2(0, 0)))).toMatchObject({ ok: false, code: "degenerate-projection" });
    }
  });

  it("viewport 밖과 face 내부의 근접 반경 밖은 endpoint를 만들지 않는다", () => {
    const input = source(), selection = selected(input), mapping = hit(input), view = camera();
    expect(collectStudioHybridDccBoundaryEndpoint(input, selection, mapping, "edge", projection(view, new Vector2(1.1, 0)))).toMatchObject({ ok: false, code: "outside-view" });
    expect(collectStudioHybridDccBoundaryEndpoint(input, selection, mapping, "edge", projection(view, new Vector2(0, 0)))).toMatchObject({ ok: false, code: "outside-boundary" });
  });

  it("zero-length source edge·singular world·잘못된 viewport는 명시 거부하고 원본을 유지한다", () => {
    const good = source(), view = camera(), mapping = hit(good);
    const badMesh: StudioEditableMesh = { ...good.mesh, vertices: good.mesh.vertices.map((vertex) => vertex.id === 1 ? { ...vertex, position: { ...need(good.mesh.vertices[0]).position } } : vertex) };
    const bad = source(badMesh), before = serializeStudioEditableMesh(badMesh);
    expect(collectStudioHybridDccBoundaryEndpoint(bad, selected(bad), mapping, "edge", projection(view, new Vector2()))).toMatchObject({ ok: false, code: "invalid-source" });
    expect(serializeStudioEditableMesh(badMesh)).toEqual(before);
    const input = projection(view, at(good, 0, 0.5, view));
    expect(collectStudioHybridDccBoundaryEndpoint(good, selected(good), mapping, "edge", { ...input, matrixWorld: new Matrix4().makeScale(0, 1, 1) })).toMatchObject({ ok: false, code: "invalid-projection" });
    expect(collectStudioHybridDccBoundaryEndpoint(good, selected(good), mapping, "edge", { ...input, viewportSize: { width: 0, height: 600 } })).toMatchObject({ ok: false, code: "invalid-projection" });
  });

  it("stale hit와 다른 face는 거부하며 hit의 위조 candidate 배열은 원본 boundary를 넓히지 못한다", () => {
    const input = source(), view = camera(), mapping = hit(input), pointer = at(input, 0, 0.5, view), next = { ...input, meshRevision: input.meshRevision + 1 };
    expect(collectStudioHybridDccBoundaryEndpoint(next, selected(next), mapping, "edge", projection(view, pointer))).toMatchObject({ ok: false, code: "stale-hit" });
    expect(collectStudioHybridDccBoundaryEndpoint(input, selected(input), { ...mapping, faceId: 99 }, "edge", projection(view, pointer))).toMatchObject({ ok: false, code: "outside-face" });
    const forged: StudioHybridDccRayHitMapping = { ...mapping, vertexCandidateIds: [999], edgeCandidates: [{ id: 999, vertexIds: [998, 999] }] };
    const lease = ok(collectStudioHybridDccBoundaryEndpoint(input, selected(input), forged, "edge", projection(view, pointer)));
    if (lease.anchor.kind !== "edge") throw new Error("edge가 아닙니다."); expect(lease.anchor.halfEdgeId).toBe(0);
  });

  it("복사 lease·asset/revision/hash/mesh identity 변경은 재입장하지 못한다", () => {
    const input = source(), selection = selected(input), view = camera();
    const lease = ok(collectStudioHybridDccBoundaryEndpoint(input, selection, hit(input), "edge", projection(view, at(input, 0, 0.5, view))));
    expect(admitStudioHybridDccBoundaryEndpoint({ ...lease }, input, selection)).toMatchObject({ ok: false, code: "untrusted-endpoint" });
    const changed = [source(input.mesh, input.meshRevision + 1), source(input.mesh, input.meshRevision, "another-asset"),
      source(deserializeStudioEditableMesh(serializeStudioEditableMesh(input.mesh))), { ...input, sourceHash: "stale" }];
    for (const current of changed) expect(admitStudioHybridDccBoundaryEndpoint(lease, current, selection)).toMatchObject({ ok: false, code: "stale-endpoint" });
    expect(admitStudioHybridDccBoundaryEndpoint(lease, { ...input }, selection).ok).toBe(true);
  });

  it("선택 face 변경은 같은 geometry의 endpoint도 폐기하며 실제 두 lease는 chord kernel 입력으로 연결된다", () => {
    const input = source(createStudioUnitCubeMesh()), selection = selected(input, 3), mapping = hit(input, 3), view = camera();
    view.position.set(2, 3, 4); view.lookAt(0, 0, 0); view.updateMatrixWorld();
    const face = need(input.mesh.faces[3]), first = face.he, second = need(input.mesh.halfEdges[need(input.mesh.halfEdges[first]).next]).next;
    const leases = [first, second].map((id) => ok(collectStudioHybridDccBoundaryEndpoint(input, selection, mapping, "edge", projection(view, at(input, id, 0.5, view)))));
    expect(admitStudioHybridDccBoundaryEndpoint(need(leases[0]), input, selected(input, 1))).toMatchObject({ ok: false, code: "stale-endpoint" });
    const start = ok(admitStudioHybridDccBoundaryEndpoint(need(leases[0]), input, selection)), end = ok(admitStudioHybridDccBoundaryEndpoint(need(leases[1]), input, selection));
    const result = splitStudioEditableFaceBoundaryChord({ mesh: input.mesh, meshHash: input.sourceHash, meshRevision: input.meshRevision },
      { faceId: 3, sourceMeshHash: input.sourceHash, sourceMeshRevision: input.meshRevision, start, end });
    expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.messageKo);
    expect(result.mesh.vertices).toHaveLength(10); expect(result.selectionFaceIds).toEqual([3, 6]);
  });
});
