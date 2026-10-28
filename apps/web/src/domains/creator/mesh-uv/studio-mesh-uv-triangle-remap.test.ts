import { describe, expect, it } from "vitest";

import { createStudioEditableMeshFromPolygons, serializeStudioEditableMesh, studioEditableMeshToTriangleSoup, validateStudioEditableMeshSerializableAuthority, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";

import { decodeStudioMeshUvLayer, deriveStudioMeshUvIslands, hashStudioMeshUvTopology } from "./studio-mesh-uv-authority";
import { remapStudioMeshUvTriangleSoup } from "./studio-mesh-uv-triangle-remap";

function sourceMesh(): StudioEditableMesh {
  const plain = createStudioEditableMeshFromPolygons([
    { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 2, y: 1, z: 0 },
  ], [[1, 4, 3, 0], [1, 2, 5, 4]]);
  const mesh = { ...plain, vertices: plain.vertices.map((vertex) => ({ ...vertex, crease: vertex.id / 8 })),
    halfEdges: plain.halfEdges.map((edge) => ({ ...edge, crease: (edge.id + 1) / 16 })),
    faces: plain.faces.map((face) => ({ ...face, smooth: face.id === 1, materialSlot: face.id + 2 })) };
  return { ...mesh, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(mesh),
    corners: mesh.halfEdges.map(({ id }) => ({ halfEdgeId: id, u: id * id / 8 - 3, v: id * id * id / 16 + 0.25 })) }, mesh) };
}

function triangleMesh(source: StudioEditableMesh) {
  const soup = studioEditableMeshToTriangleSoup(source);
  const vertices = source.vertices.map(({ position }) => ({ ...position, z: 0.25 }));
  const triangles: number[][] = [];
  for (let index = 0; index < soup.indices.length; index += 3) triangles.push(Array.from(soup.indices.slice(index, index + 3)));
  return { soup, result: createStudioEditableMeshFromPolygons(vertices, triangles) };
}

describe("삼각형 soup의 검증된 원본 UV 코너 대응", () => {
  it("source.he origin fan의 실제 soup 순서로 비선형 UV·seam·면·crease 속성을 보존한다", () => {
    const source = sourceMesh(); const before = serializeStudioEditableMesh(source);
    const { soup, result } = triangleMesh(source);
    expect(Array.from(soup.indices)).toEqual([1, 4, 3, 1, 3, 0, 1, 2, 5, 1, 5, 4]);
    const mapped = remapStudioMeshUvTriangleSoup(source, result, soup.indices);
    const sourceIds = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
    expect(mapped.uvLayer?.corners.map(({ u, v }) => [u, v])).toEqual(sourceIds.map((id) => {
      const uv = source.uvLayer?.corners[id]; if (!uv) throw new Error("UV 코너가 없습니다."); return [uv.u, uv.v];
    }));
    expect(mapped.vertices.map(({ crease }) => crease)).toEqual(source.vertices.map(({ crease }) => crease));
    expect(mapped.faces.map(({ materialSlot, smooth }) => [materialSlot, smooth])).toEqual([[2, false], [2, false], [3, true], [3, true]]);
    expect(mapped.halfEdges.map(({ crease }) => crease)).toEqual([1 / 16, 2 / 16, 0, 0, 3 / 16, 4 / 16, 5 / 16, 6 / 16, 0, 0, 7 / 16, 8 / 16]);
    expect(deriveStudioMeshUvIslands(mapped).map(({ faceIds }) => faceIds)).toEqual([[0, 1], [2, 3]]);
    expect(validateStudioEditableMeshSerializableAuthority(mapped).ok).toBe(true);
    expect(serializeStudioEditableMesh(source)).toEqual(before);
    expect(result.uvLayer).toBeUndefined();
  });

  it("원본이 없는 정점·삼각형 순서·face anchor·UV topology의 재사용을 거부한다", () => {
    const source = sourceMesh(); const { soup, result } = triangleMesh(source);
    const reversed = new Uint32Array(soup.indices); reversed.set(soup.indices.slice(3, 6)); reversed.set(soup.indices.slice(0, 3), 3);
    expect(() => remapStudioMeshUvTriangleSoup(source, result, reversed)).toThrow(/대응/u);
    const anchored = { ...result, faces: result.faces.map((face) => face.id === 0 ? { ...face, he: 1 } : face) };
    expect(() => remapStudioMeshUvTriangleSoup(source, anchored, soup.indices)).toThrow(/정본/u);
    const missing = { ...result, vertices: result.vertices.slice(1) };
    expect(() => remapStudioMeshUvTriangleSoup(source, missing, soup.indices)).toThrow(/정본/u);
    const stale = { ...source, uvLayer: { ...source.uvLayer, revision: 1 as const, topologyHash: "uv-topology:stale", corners: source.uvLayer?.corners ?? [] } };
    expect(() => remapStudioMeshUvTriangleSoup(stale, result, soup.indices)).toThrow(/정본/u);
    const incomplete = soup.indices.slice(0, -3);
    expect(() => remapStudioMeshUvTriangleSoup(source, result, incomplete)).toThrow(/코너 수/u);
  });

  it("UV가 없는 입력은 기존 결과 객체를 검증·속성 변경 없이 반환한다", () => {
    const { uvLayer: _uv, ...source } = sourceMesh(); const { result, soup } = triangleMesh(source);
    expect(remapStudioMeshUvTriangleSoup(source, result, soup.indices)).toBe(result);
  });
});
