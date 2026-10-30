import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { planStudioMeshSurface } from "../mesh-surface/studio-mesh-surface-plan";
import { projectStudioMeshSurfaceForRender } from "../mesh-surface/studio-mesh-surface-render";
import { createStudioEditableMeshFromPolygons, hashStudioEditableMesh, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";

import { deriveStudioHybridDccViewportSnapshot } from "./StudioHybridDccViewportCore";
import { mapStudioHybridDccRayFaceIndex } from "./studio-hybrid-dcc-component-selection";
import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import { exportStudioHybridDccMeshGlb } from "./studio-hybrid-dcc-glb-export";
import { resolveStudioHybridDccScreenComponentCandidate } from "./studio-hybrid-dcc-screen-selection";
import { createStudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

function fixture(uv = false) {
  const base = createStudioEditableMeshFromPolygons([
    { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
    { x: 3, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 3, y: 1, z: 0 },
  ], [[0, 1, 2, 3, 4], [5, 6, 7]]);
  const mesh = { ...base, faces: base.faces.map((face) => ({ ...face, smooth: false, materialSlot: face.id ? Number.MAX_SAFE_INTEGER : 7 })) };
  if (!uv) return mesh;
  return { ...mesh, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(mesh),
    corners: mesh.halfEdges.map(({ id }) => ({ halfEdgeId: id, u: id / 8, v: id === 1 ? .25 : id / 16 })) }, mesh) };
}
function hit(mesh: StudioEditableMesh, faceIndex: number) {
  const result = mapStudioHybridDccRayFaceIndex({ assetId: "surface", mesh, meshRevision: 7, sourceHash: hashStudioEditableMesh(mesh) }, faceIndex);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics)); return result.value;
}
interface ExportJson {
  readonly meshes: readonly { readonly primitives: readonly { readonly indices: number; readonly extras: { readonly toonSpectrum: {
    readonly outputSourceVertexIds: readonly number[]; readonly sourceFaceIdsByTriangle: readonly number[];
  } } }[] }[];
  readonly accessors: readonly { readonly bufferView: number; readonly count: number; readonly byteOffset?: number }[];
  readonly bufferViews: readonly { readonly byteOffset: number }[];
}
function exportedTriangles(mesh: StudioEditableMesh) {
  const exported = exportStudioHybridDccMeshGlb({ assetId: "surface", mesh, sourceRevision: 7, sourceHash: hashStudioEditableMesh(mesh) });
  if (!exported.ok) throw new Error(JSON.stringify(exported.report));
  const view = new DataView(exported.bytes.buffer, exported.bytes.byteOffset, exported.bytes.byteLength); const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(exported.bytes.subarray(20, 20 + jsonLength))) as ExportJson;
  const primitive = json.meshes[0]?.primitives[0], accessor = primitive ? json.accessors[primitive.indices] : undefined;
  const buffer = accessor ? json.bufferViews[accessor.bufferView] : undefined;
  if (!primitive || !accessor || !buffer) throw new Error("실제 GLB의 index가 없습니다.");
  const ids = Array.from({ length: accessor.count }, (_, index) => primitive.extras.toonSpectrum.outputSourceVertexIds[
    view.getUint32(28 + jsonLength + buffer.byteOffset + (accessor.byteOffset ?? 0) + index * 4, true)]);
  return { ids, faces: primitive.extras.toonSpectrum.sourceFaceIdsByTriangle };
}

describe("공유 surface의 정확한 faceIndex 선택", () => {
  it("collinear 생략 후 실제 GLB·표시 stream의 triangle 수와 stable face를 읽고 이후 면을 앞 면으로 오인하지 않는다", () => {
    const mesh = fixture(); const hash = hashStudioEditableMesh(mesh); const plan = planStudioMeshSurface(mesh);
    if (!plan.ok) throw new Error(plan.issue.detail);
    expect(plan.value.triangles).toHaveLength(3); expect(hit(mesh, 0).triangleVertexIds).toEqual([4, 0, 2]);
    expect(hit(mesh, 2)).toMatchObject({ faceId: 1, triangleIndexWithinFace: 0, materialSlot: Number.MAX_SAFE_INTEGER });
    const projection = projectStudioMeshSurfaceForRender(mesh, plan.value); const glb = exportedTriangles(mesh);
    const workspace = createStudioHybridDccWorkspace("shared-surface-pick");
    const snapshot = deriveStudioHybridDccViewportSnapshot({ ...workspace, session: hybridDccRegisterAsset(workspace.session, "surface", mesh, {
      source: "primitive", creator: "studio", license: "CC0-1.0", useScope: "commercial", derivative: "original",
    }) }, "face");
    expect(snapshot.errors).toEqual([]); expect(snapshot.totalTriangles).toBe(3);
    expect(Array.from(snapshot.assets[0]?.indices ?? [])).toEqual(Array.from(projection.indices));
    for (let index = 0; index < plan.value.triangles.length; index += 1) {
      const mapping = hit(mesh, index);
      expect(mapping.triangleVertexIds).toEqual(glb.ids.slice(index * 3, index * 3 + 3)); expect(mapping.faceId).toBe(glb.faces[index]);
      expect(Array.from(projection.indices.slice(index * 3, index * 3 + 3))).toEqual(mapping.triangleVertexIds);
    }
    const outside = mapStudioHybridDccRayFaceIndex({ assetId: "surface", mesh, meshRevision: 7, sourceHash: hash }, 3);
    expect(outside.ok).toBe(false); expect(hashStudioEditableMesh(mesh)).toBe(hash);
  });

  it("생략 collinear 원본 점과 boundary edge는 실제 screen refinement로 고를 수 있고 표시 대각선은 edge가 아니다", () => {
    const mesh = fixture(); const mapping = hit(mesh, 0);
    expect(mapping.vertexCandidateIds).toEqual([0, 1, 2, 3, 4]); expect(mapping.triangleVertexIds).not.toContain(1);
    expect(mapping.triangleBoundaryEdgeIds).toEqual([4, null, null]); expect(mapping.edgeCandidates.map(({ id }) => id)).toEqual([0, 1, 2, 3, 4]);
    const camera = new THREE.PerspectiveCamera(45, 1, .1, 100); camera.position.set(1, .5, 5); camera.lookAt(1, .5, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const point = (x: number, y: number) => { const p = new THREE.Vector3(x, y, 0).project(camera); return new THREE.Vector2(p.x, p.y); };
    const candidates = { vertexIds: mapping.vertexCandidateIds, edges: mapping.edgeCandidates };
    expect(resolveStudioHybridDccScreenComponentCandidate(mesh, "vertex", candidates, point(1, 0), camera, new THREE.Matrix4(), { width: 1000, height: 1000 })).toBe(1);
    expect(resolveStudioHybridDccScreenComponentCandidate(mesh, "edge", candidates, point(.5, 0), camera, new THREE.Matrix4(), { width: 1000, height: 1000 })).toBe(0);
    expect(resolveStudioHybridDccScreenComponentCandidate(mesh, "edge", candidates, point(1, .5), camera, new THREE.Matrix4(), { width: 1000, height: 1000 })).toBeNull();
  });

  it("UV가 있는 collinear 코너는 생략하지 않고 정확한 origin halfedge와 UV를 전달한다", () => {
    const mesh = fixture(true); const original = mesh.uvLayer; const plan = planStudioMeshSurface(mesh);
    if (!plan.ok) throw new Error(plan.issue.detail);
    expect(plan.value.triangles).toHaveLength(4); expect(hit(mesh, 0).triangleVertexIds).toEqual([4, 0, 1]);
    const projection = projectStudioMeshSurfaceForRender(mesh, plan.value);
    const seen = new Set<number>();
    for (let triangle = 0; triangle < plan.value.triangles.length; triangle += 1) {
      const mapping = hit(mesh, triangle);
      for (let corner = 0; corner < 3; corner += 1) {
        const id = mapping.triangleCornerHalfEdgeIds[corner]; if (id === undefined) throw new Error("원본 코너가 없습니다.");
        const uv = mesh.uvLayer?.corners[id]; seen.add(id);
        expect(mesh.halfEdges[mesh.halfEdges[id]!.prev]!.vertex).toBe(mapping.triangleVertexIds[corner]);
        expect(Array.from(projection.cornerUvs?.slice((triangle * 3 + corner) * 2, (triangle * 3 + corner + 1) * 2) ?? [])).toEqual([uv?.u, uv?.v]);
      }
    }
    expect(seen.has(1)).toBe(true); expect(mesh.uvLayer).toBe(original);
  });

  it("선택 provenance·음수/범위 밖 faceIndex를 검증하고 반환 tuple을 통한 파생 cache 변조를 막는다", () => {
    const mesh = fixture(); const mapping = hit(mesh, 0);
    expect(mapping.provenance).toEqual({ assetId: "surface", meshRevision: 7, sourceHash: hashStudioEditableMesh(mesh) });
    expect(Object.isFrozen(mapping.triangleVertexIds)).toBe(true); expect(Object.isFrozen(mapping.triangleCornerHalfEdgeIds)).toBe(true);
    for (const faceIndex of [-1, 1.5, 99]) expect(mapStudioHybridDccRayFaceIndex({ assetId: "surface", mesh, meshRevision: 7, sourceHash: hashStudioEditableMesh(mesh) }, faceIndex).ok).toBe(false);
    expect(mapStudioHybridDccRayFaceIndex({ assetId: "surface", mesh, meshRevision: 7, sourceHash: "stale" }, 0).ok).toBe(false);
  });
});
