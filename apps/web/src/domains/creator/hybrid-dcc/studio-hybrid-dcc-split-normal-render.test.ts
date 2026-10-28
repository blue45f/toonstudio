import { describe, expect, it } from "vitest";

import { createStudioUnitCubeMesh, hashStudioEditableMesh, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET } from "../mesh-surface/studio-mesh-surface-interactive-budget";
import { planStudioMeshSurface } from "../mesh-surface/studio-mesh-surface-plan";
import { projectStudioMeshSurfaceForRender } from "../mesh-surface/studio-mesh-surface-render";
import { surfaceRegressionInputs, surfaceTestQuad } from "../mesh-surface/studio-mesh-surface-test-fixtures";

import { createStudioHybridDccGeometryResource } from "./studio-hybrid-dcc-geometry-resource";
import { deriveStudioHybridDccSplitCornerNormals } from "./studio-hybrid-dcc-split-normal-render";
import { exportStudioHybridDccMeshGlb } from "./studio-hybrid-dcc-glb-export";

interface Glb {
  readonly meshes: readonly { readonly primitives: readonly {
    readonly attributes: { readonly NORMAL: number }; readonly indices: number;
    readonly extras: { readonly toonSpectrum: { readonly outputSourceVertexIds: readonly number[]; readonly sourceFaceIdsByTriangle: readonly number[] } };
  }[] }[];
  readonly accessors: readonly { readonly bufferView: number; readonly count: number; readonly byteOffset?: number }[];
  readonly bufferViews: readonly { readonly byteOffset?: number }[];
}
function actualGlbNormals(mesh: StudioEditableMesh) {
  const exported = exportStudioHybridDccMeshGlb({ assetId: "normal", mesh, sourceHash: hashStudioEditableMesh(mesh), sourceRevision: 1 });
  if (!exported.ok) throw new Error(JSON.stringify(exported.report.errors));
  const view = new DataView(exported.bytes.buffer), jsonLength = view.getUint32(12, true);
  const json: Glb = JSON.parse(new TextDecoder().decode(exported.bytes.subarray(20, 20 + jsonLength)));
  const primitive = json.meshes[0]?.primitives[0]; if (!primitive) throw new Error("GLB primitive가 없습니다.");
  const normal = json.accessors[primitive.attributes.NORMAL], indices = json.accessors[primitive.indices]; if (!normal || !indices) throw new Error("GLB 법선·index가 없습니다.");
  const offset = (accessor: Glb["accessors"][number]) => 28 + jsonLength + (json.bufferViews[accessor.bufferView]?.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const output = Array.from({ length: indices.count }, (_, index) => view.getUint32(offset(indices) + index * 4, true));
  return { normals: output.flatMap((id) => [0, 1, 2].map((axis) => view.getFloat32(offset(normal) + (id * 3 + axis) * 4, true))),
    vertexIds: output.map((id) => primitive.extras.toonSpectrum.outputSourceVertexIds[id]), faceIds: primitive.extras.toonSpectrum.sourceFaceIdsByTriangle };
}
function checkActualNormals(mesh: StudioEditableMesh, normalMode: "flat" | "smooth" | "split") {
  const hash = hashStudioEditableMesh(mesh), plan = planStudioMeshSurface(mesh, STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET, { allowCreaseMetadata: true, topologyPolicy: "editable" });
  if (!plan.ok) throw new Error(plan.issue.detail);
  const projection = projectStudioMeshSurfaceForRender(mesh, plan.value), normals = deriveStudioHybridDccSplitCornerNormals(mesh), glb = actualGlbNormals(mesh);
  expect(normals).toBe(projection.cornerNormals); expect(Array.from(normals)).toEqual(glb.normals);
  expect(plan.value.triangles.flatMap(({ vertexIds }) => [...vertexIds])).toEqual(glb.vertexIds);
  expect(plan.value.triangles.map(({ faceId }) => faceId)).toEqual(glb.faceIds);
  expect(deriveStudioHybridDccSplitCornerNormals(mesh)).toBe(normals);
  const resource = createStudioHybridDccGeometryResource({ ...projection, normalMode });
  try { expect(resource.geometry.getAttribute("normal").array).toEqual(normals); expect(resource.geometry.index).toBeNull(); }
  finally { resource.dispose(); }
  expect(hashStudioEditableMesh(mesh)).toBe(hash); return plan.value;
}

describe("공유 삼각형의 실제 corner normal", () => {
  it.each([false, true])("mixed/allSmooth=%s cube의 실제 GLB와 Three normal buffer를 동일 순서로 읽는다", (allSmooth) => {
    const base = createStudioUnitCubeMesh(), mesh = { ...base, faces: base.faces.map((face) => ({ ...face, smooth: allSmooth || face.id < 3 })) };
    const plan = checkActualNormals(mesh, allSmooth ? "smooth" : "split"); expect(plan.triangles).toHaveLength(12);
  });

  it.each([[1e-7, [0, 1, 2, 3]], [.25, [0, 1, 2, 3]], [.25, [1, 2, 3, 0]]] as const)("flat quad 높이 %s·loop %j에서도 실제 GLB normal 규칙과 일치한다", (height, loop) => {
    checkActualNormals(surfaceTestQuad(height, loop), "flat");
  });

  it.each(["concave-uv", "collinear", "collinear-uv"])("%s의 earclip·보존 corner 실제 순서를 재계산하지 않는다", (name) => {
    const input = surfaceRegressionInputs().find(({ assetId }) => assetId === name); if (!input) throw new Error("표면 입력이 없습니다.");
    const mesh = { ...input.mesh, faces: input.mesh.faces.map((face) => ({ ...face, smooth: false })) }; checkActualNormals(mesh, "flat");
  });

  it("flat crease metadata는 base surface를 유지하고 smooth+crease 표시 제한은 유지한다", () => {
    const base = surfaceTestQuad(), creased = { ...base, vertices: base.vertices.map((vertex, index) => index === 0 ? { ...vertex, crease: .5 } : vertex) };
    expect(deriveStudioHybridDccSplitCornerNormals(creased)).toEqual(deriveStudioHybridDccSplitCornerNormals(base));
    expect(() => deriveStudioHybridDccSplitCornerNormals({ ...creased, faces: creased.faces.map((face) => ({ ...face, smooth: true })) })).toThrow(/crease/u);
    expect(exportStudioHybridDccMeshGlb({ assetId: "crease", mesh: creased, sourceHash: hashStudioEditableMesh(creased), sourceRevision: 1 }).ok).toBe(false);
  });

  it("유효한 명시 flat normal은 허용하고 잘못된 배열은 GPU 자원 생성 전에 거부한다", () => {
    const mesh = surfaceTestQuad(), plan = planStudioMeshSurface(mesh); if (!plan.ok) throw new Error(plan.issue.detail);
    const projection = projectStudioMeshSurfaceForRender(mesh, plan.value), normals = deriveStudioHybridDccSplitCornerNormals(mesh);
    expect(() => createStudioHybridDccGeometryResource({ positions: projection.positions, indices: projection.indices, normalMode: "split" })).toThrow(/분리 법선/u);
    expect(() => createStudioHybridDccGeometryResource({ ...projection, normalMode: "flat", cornerNormals: new Float32Array(2) })).toThrow(/분리 법선/u);
    expect(() => createStudioHybridDccGeometryResource({ ...projection, normalMode: "flat", cornerNormals: new Float32Array(normals.length) })).toThrow(/단위 벡터/u);
    const invalid = normals.slice(); invalid[0] = Infinity;
    expect(() => createStudioHybridDccGeometryResource({ ...projection, normalMode: "split", cornerNormals: invalid })).toThrow(/분리 법선/u);
    const resource = createStudioHybridDccGeometryResource({ ...projection, normalMode: "flat", cornerNormals: normals });
    try { expect(resource.geometry.getAttribute("normal").array).toEqual(normals); }
    finally { resource.dispose(); }
  });
});
