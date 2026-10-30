import { BufferGeometry, Float32BufferAttribute, Matrix4, OrthographicCamera, Points, PointsMaterial, Raycaster, Vector2, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createStudioUnitCubeMesh, hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import { collectStudioHybridDccBoundaryEndpoint, studioHybridDccBoundaryEndpointMarkerPositions, studioHybridDccBoundaryEndpointMarkerRaycast, type StudioBoundaryEndpointLease } from "./studio-hybrid-dcc-boundary-endpoint";
import { createStudioHybridDccComponentSelection, mapStudioHybridDccRayFaceIndex, mutateStudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import { readStudioMeshFaceLoops } from "./studio-hybrid-dcc-face-modeling-mesh";
import { splitStudioEditableFaceBoundaryChordWithUv } from "./studio-hybrid-dcc-boundary-chord-uv";

function need<T>(value: T | null | undefined): T { if (value === null || value === undefined) throw new Error("marker 실제 fixture 값이 없습니다."); return value; }
function fixture() {
  const cube = createStudioUnitCubeMesh();
  const mesh = { ...cube, vertices: cube.vertices.map((vertex) => ({ ...vertex, position: { ...vertex.position, x: vertex.position.x + 2 ** -30 } })) };
  const source = { assetId: "marker-cube", mesh, meshRevision: 1, sourceHash: hashStudioEditableMesh(mesh) };
  const face = need(readStudioMeshFaceLoops(mesh)?.find((loop) => loop.vertexIds.every((id) => mesh.vertices[id]?.position.z === 0.5)));
  const selected = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), { mode: "face", operation: "replace", ids: [face.id], source });
  if (!selected.ok) throw new Error("실제 한 면 선택이 없습니다.");
  const surface = inspectStudioMeshSurfaceForInteractiveProjection(mesh);
  if (!surface.ok) throw new Error(surface.message);
  const mapping = mapStudioHybridDccRayFaceIndex(source, surface.value.plan.triangles.findIndex((triangle) => triangle.faceId === face.id));
  if (!mapping.ok) throw new Error("실제 surface mapping이 없습니다.");
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.set(0, 0, 3); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const collect = (index: number, t: number): StudioBoundaryEndpointLease => {
    const edge = need(mesh.halfEdges[need(face.halfEdgeIds[index])]);
    const a = need(mesh.vertices[need(mesh.halfEdges[edge.prev]).vertex]).position, b = need(mesh.vertices[edge.vertex]).position;
    const point = new Vector3(a.x, a.y, a.z).lerp(new Vector3(b.x, b.y, b.z), t).project(camera);
    const result = collectStudioHybridDccBoundaryEndpoint(source, selected.value, mapping.value, "edge", {
      pointerNdc: new Vector2(point.x, point.y), camera, matrixWorld: new Matrix4(), viewportSize: { width: 600, height: 600 },
    });
    if (!result.ok) throw new Error(result.messageKo); return result.value;
  };
  const asset = { assetId: source.assetId, mesh, meshHash: source.sourceHash, meshRevision: source.meshRevision };
  return { source, asset, selection: selected.value, collect, camera };
}
describe("실제 opaque endpoint의 표시 위치와 비선택 marker", () => {
  it("원본 f64 anchor를 사용하고 vertex/edge의 실제 위치를 Float32로 저장하지 않는다", () => {
    const f = fixture(), edge = f.collect(0, 0.25), vertex = f.collect(0, 0);
    const points = studioHybridDccBoundaryEndpointMarkerPositions(f.asset, f.selection, [edge, vertex]);
    expect(points).toHaveLength(2); const p = need(points[0]).position;
    expect(p[0]).toBe(-0.25 + 2 ** -30); expect(p[0]).not.toBe(Math.fround(p[0]));
    expect(need(points[1]).position).toEqual([-0.5 + 2 ** -30, -0.5, 0.5]);
  });
  it("다른 asset·선택·복제 lease·stale revision과 ready preview의 다른 mesh에는 표시하지 않는다", () => {
    const f = fixture(), start = f.collect(0, 0.25), end = f.collect(2, 0.75);
    expect(studioHybridDccBoundaryEndpointMarkerPositions({ ...f.asset, assetId: "other" }, f.selection, [start])).toEqual([]);
    expect(studioHybridDccBoundaryEndpointMarkerPositions({ ...f.asset, meshRevision: 2 }, f.selection, [start])).toEqual([]);
    expect(studioHybridDccBoundaryEndpointMarkerPositions(f.asset, createStudioHybridDccComponentSelection(), [start])).toEqual([]);
    expect(studioHybridDccBoundaryEndpointMarkerPositions(f.asset, f.selection, [{ ...start }])).toEqual([]);
    const result = splitStudioEditableFaceBoundaryChordWithUv({ mesh: f.source.mesh, meshHash: f.source.sourceHash, meshRevision: 1 }, {
      sourceMeshHash: f.source.sourceHash, sourceMeshRevision: 1, faceId: start.faceId, start: start.anchor, end: end.anchor,
    });
    if (!result.ok) throw new Error(result.messageKo);
    expect(studioHybridDccBoundaryEndpointMarkerPositions({ ...f.asset, mesh: result.mesh, meshHash: hashStudioEditableMesh(result.mesh) }, f.selection, [start])).toEqual([]);
  });
  it("실제 Three raycaster가 원점을 맞혀도 marker raycast는 다음 endpoint 선택을 가로채지 않는다", () => {
    const geometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute([0, 0, 0], 3));
    const material = new PointsMaterial(), points = new Points(geometry, material);
    try {
      const { camera } = fixture(), ray = new Raycaster();
      points.updateMatrixWorld(true); ray.setFromCamera(new Vector2(0, 0), camera);
      expect(ray.intersectObject(points)).toHaveLength(1);
      points.raycast = studioHybridDccBoundaryEndpointMarkerRaycast;
      expect(ray.intersectObject(points)).toEqual([]);
    } finally { geometry.dispose(); material.dispose(); }
  });
});
