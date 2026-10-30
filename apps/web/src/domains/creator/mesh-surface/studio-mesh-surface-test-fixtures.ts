/** 8e445의 GLB 바이트와 진단 우선순위를 보존하는 작은 표면 입력이다. */
import { createStudioEditableMeshFromPolygons, createStudioUnitCubeMesh, hashStudioEditableMesh, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { createStudioHybridDccDefaultToonMaterial } from "../hybrid-dcc/materials/studio-hybrid-dcc-toon-material";

import type { StudioHybridDccMeshGlbExportInput } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";

export function withSurfaceTestUvs(mesh: StudioEditableMesh, values?: readonly (readonly [number, number])[]): StudioEditableMesh {
  return { ...mesh, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(mesh), corners: mesh.halfEdges.map((edge) => {
    const vertex = mesh.vertices[mesh.halfEdges[edge.prev]?.vertex ?? -1]; if (!vertex) throw new Error("UV 원본 정점이 없습니다.");
    const uv = values?.[vertex.id] ?? [vertex.position.x, vertex.position.y];
    return { halfEdgeId: edge.id, u: Math.fround(uv[0]), v: Math.fround(uv[1]) };
  }) }, mesh) };
}
export function surfaceTestQuad(height = 0, loop: readonly number[] = [0, 1, 2, 3], withUv = true): StudioEditableMesh {
  const plain = createStudioEditableMeshFromPolygons([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: height }, { x: 0, y: 1, z: 0 }], [loop]);
  const mesh = { ...plain, faces: plain.faces.map((face) => ({ ...face, smooth: false })) };
  return withUv ? withSurfaceTestUvs(mesh, [[0, 0], [2, 0], [1, 1], [0, 1]]) : mesh;
}
export function surfaceRegressionInputs(): readonly StudioHybridDccMeshGlbExportInput[] {
  const cube = createStudioUnitCubeMesh();
  const input = (assetId: string, mesh: StudioEditableMesh): StudioHybridDccMeshGlbExportInput => ({ assetId, mesh, sourceRevision: 4, sourceHash: hashStudioEditableMesh(mesh) });
  const concave = createStudioEditableMeshFromPolygons([{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 2, z: 0 }, { x: 1, y: .8, z: 0 }, { x: 0, y: 2, z: 0 }], [[0, 1, 2, 3, 4]]);
  const collinear = createStudioEditableMeshFromPolygons([{ x: 0, y: 0, z: 0 }, { x: .5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }], [[0, 1, 2, 3, 4]]);
  const material = createStudioHybridDccDefaultToonMaterial();
  const slots = { ...cube, faces: cube.faces.map((face, index) => ({ ...face, materialSlot: [7, 3, 7, 0, 3, 7][index] ?? 0, smooth: index % 2 === 0 })) };
  const malformedUv = withSurfaceTestUvs(cube);
  const broken = { ...cube, halfEdges: cube.halfEdges.map((edge, index) => index === 0 ? { ...edge, next: 999 } : edge) };
  const over = createStudioEditableMeshFromPolygons(Array.from({ length: 257 }, (_, index) => ({ x: Math.cos(index * 2 * Math.PI / 257), y: Math.sin(index * 2 * Math.PI / 257), z: 0 })), [Array.from({ length: 257 }, (_, index) => index)]);
  const overflow = createStudioEditableMeshFromPolygons([{ x: 1e40, y: 0, z: 0 }, { x: 0, y: 1e40, z: 0 }, { x: 0, y: 0, z: 1e40 }], [[0, 1, 2]]);
  return [input("cube", cube), input("cube-uv", withSurfaceTestUvs(cube)), input("cube-mixed", { ...cube, faces: cube.faces.map((face, index) => ({ ...face, smooth: index % 2 === 0 })) }),
    { ...input("toon-slots", withSurfaceTestUvs(slots)), toonMaterials: { "0": { ...material, shadeColorSrgb: "#123456" }, "3": material, "7": material } },
    input("quad", surfaceTestQuad()), input("quad-no-uv", surfaceTestQuad(0, undefined, false)), input("shallow", surfaceTestQuad(1e-7)), input("warped", surfaceTestQuad(.25)), input("warped-rotated", surfaceTestQuad(.25, [1, 2, 3, 0])),
    input("concave", concave), input("concave-uv", withSurfaceTestUvs(concave)), input("collinear", collinear), input("collinear-uv", withSurfaceTestUvs(collinear, [[0, 0], [2, .4], [1, 0], [1, 1], [0, 1]])),
    { ...input("broken-before-stale", cube), mesh: broken, sourceHash: "mesh:stale" }, { ...input("uv-before-stale", cube), mesh: { ...malformedUv, uvLayer: { ...malformedUv.uvLayer, revision: 1, topologyHash: hashStudioMeshUvTopology(cube), corners: malformedUv.uvLayer?.corners.map((corner, index) => index === 0 ? { ...corner, u: NaN } : corner) ?? [] } }, sourceHash: "mesh:stale" },
    { ...input("stale-before-normal", cube), sourceHash: "mesh:stale" }, input("over-corners", over), input("overflow", overflow)];
}
