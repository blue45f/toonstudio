import { describe, expect, it, vi } from "vitest";

import { hashStudioEditableMesh, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import * as geometry from "../mesh-surface/studio-mesh-surface-geometry";
import { STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET } from "../mesh-surface/studio-mesh-surface-interactive-budget";
import { planStudioMeshSurface } from "../mesh-surface/studio-mesh-surface-plan";
import { projectStudioMeshSurfaceForRender } from "../mesh-surface/studio-mesh-surface-render";
import { surfaceRegressionInputs, surfaceTestQuad } from "../mesh-surface/studio-mesh-surface-test-fixtures";

import { exportStudioHybridDccMeshGlb } from "./studio-hybrid-dcc-glb-export";
import { deriveStudioHybridDccSplitCornerNormals } from "./studio-hybrid-dcc-split-normal-render";
import { deriveStudioHybridDccTriangleCornerUvs } from "./studio-hybrid-dcc-uv-render";

interface Glb {
  readonly meshes: readonly { readonly primitives: readonly { readonly attributes: { readonly TEXCOORD_0: number }; readonly indices: number;
    readonly extras: { readonly toonSpectrum: { readonly outputSourceVertexIds: readonly number[] } } }[] }[];
  readonly accessors: readonly { readonly bufferView: number; readonly byteOffset?: number; readonly count: number }[];
  readonly bufferViews: readonly { readonly byteOffset?: number }[];
}
function glbCorners(mesh: StudioEditableMesh) {
  const result = exportStudioHybridDccMeshGlb({ assetId: "uv-helper", mesh, sourceRevision: 1, sourceHash: hashStudioEditableMesh(mesh) });
  if (!result.ok) throw new Error(JSON.stringify(result.report));
  const view = new DataView(result.bytes.buffer), length = view.getUint32(12, true);
  const root: Glb = JSON.parse(new TextDecoder().decode(result.bytes.subarray(20, 20 + length)));
  const primitive = root.meshes[0]?.primitives[0]; if (!primitive) throw new Error("GLB primitive가 없습니다.");
  const indices = root.accessors[primitive.indices], uv = root.accessors[primitive.attributes.TEXCOORD_0]; if (!indices || !uv) throw new Error("GLB UV가 없습니다.");
  const offset = (accessor: Glb["accessors"][number]) => 28 + length + (root.bufferViews[accessor.bufferView]?.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const ids = Array.from({ length: indices.count }, (_, index) => view.getUint32(offset(indices) + index * 4, true));
  return { vertexIds: ids.map((id) => primitive.extras.toonSpectrum.outputSourceVertexIds[id]),
    // GLB 이미지 좌표 V-down을 원본 V-up으로 명시적으로 되돌린다.
    uv: ids.flatMap((id) => [view.getFloat32(offset(uv) + id * 8, true), 1 - view.getFloat32(offset(uv) + id * 8 + 4, true)]) };
}

describe("legacy UV helper의 공통 surface 재사용", () => {
  it.each(["quad", "warped-rotated", "concave-uv", "collinear-uv"])("%s 실제 GLB 삼각형과 원본 corner provenance를 같은 순서로 읽는다", (name) => {
    const input = surfaceRegressionInputs().find(({ assetId }) => assetId === name); if (!input) throw new Error("표면 입력이 없습니다.");
    const plan = planStudioMeshSurface(input.mesh, STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET, { allowCreaseMetadata: true, topologyPolicy: "editable" }); if (!plan.ok) throw new Error(plan.issue.detail);
    const uv = deriveStudioHybridDccTriangleCornerUvs(input.mesh), projection = projectStudioMeshSurfaceForRender(input.mesh, plan.value), glb = glbCorners(input.mesh);
    expect(uv).toBe(projection.cornerUvs); expect(deriveStudioHybridDccTriangleCornerUvs(input.mesh)).toBe(uv);
    expect(plan.value.triangles.flatMap(({ vertexIds }) => [...vertexIds])).toEqual(glb.vertexIds);
    const byId = new Map(input.mesh.uvLayer?.corners.map((corner) => [corner.halfEdgeId, corner]));
    const source = plan.value.triangles.flatMap(({ cornerHalfEdgeIds }) => cornerHalfEdgeIds.flatMap((id) => {
      const corner = byId.get(id); if (!corner) throw new Error("원본 UV corner가 없습니다."); return [corner.u, corner.v];
    }));
    expect(Array.from(uv ?? [])).toEqual(source);
    glb.uv.forEach((value, index) => expect(uv?.[index]).toBeCloseTo(value, 6));
  });

  it("UV와 normal helper가 같은 성공 plan과 projection을 재사용하며 새 fan을 만들지 않는다", () => {
    const mesh = surfaceTestQuad(); const build = vi.spyOn(geometry, "buildStudioMeshSurfaceGeometry");
    try {
      const uv = deriveStudioHybridDccTriangleCornerUvs(mesh), normal = deriveStudioHybridDccSplitCornerNormals(mesh);
      const plan = planStudioMeshSurface(mesh, STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET, { allowCreaseMetadata: true, topologyPolicy: "editable" }); if (!plan.ok) throw new Error(plan.issue.detail);
      expect(plan.value.triangles.map(({ vertexIds }) => vertexIds)).toEqual([[3, 0, 1], [1, 2, 3]]);
      const projection = projectStudioMeshSurfaceForRender(mesh, plan.value);
      expect(uv).toBe(projection.cornerUvs); expect(normal).toBe(projection.cornerNormals); expect(build).toHaveBeenCalledTimes(1);
    } finally { build.mockRestore(); }
  });

  it("UV 미지정 API와 flat crease metadata를 유지하고 잘못된 corner UV는 거부한다", () => {
    expect(deriveStudioHybridDccTriangleCornerUvs(surfaceTestQuad(0, undefined, false))).toBeUndefined();
    const mesh = surfaceTestQuad(), creased = { ...mesh, vertices: mesh.vertices.map((vertex, index) => index === 0 ? { ...vertex, crease: .5 } : vertex) };
    expect(deriveStudioHybridDccTriangleCornerUvs(creased)).toEqual(deriveStudioHybridDccTriangleCornerUvs(mesh));
    if (!mesh.uvLayer) throw new Error("UV 입력이 없습니다.");
    const invalid = { ...mesh, uvLayer: { ...mesh.uvLayer, corners: mesh.uvLayer.corners.map((corner, index) => index === 0 ? { ...corner, u: NaN } : corner) } };
    expect(() => deriveStudioHybridDccTriangleCornerUvs(invalid)).toThrow(/UV/u);
  });
});
