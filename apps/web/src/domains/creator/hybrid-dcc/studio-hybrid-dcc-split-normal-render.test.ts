import { describe, expect, it } from "vitest";

import { createStudioUnitCubeMesh, hashStudioEditableMesh, studioEditableMeshToTriangleSoup } from "../studio-editable-half-edge-mesh";

import { createStudioHybridDccGeometryResource } from "./studio-hybrid-dcc-geometry-resource";
import { deriveStudioHybridDccSplitCornerNormals } from "./studio-hybrid-dcc-split-normal-render";
import { exportStudioHybridDccMeshGlb } from "./studio-hybrid-dcc-glb-export";

interface Glb {
  readonly meshes: readonly { readonly primitives: readonly {
    readonly attributes: { readonly NORMAL: number };
    readonly indices: number;
    readonly extras: { readonly toonSpectrum: { readonly outputSourceVertexIds: readonly number[]; readonly sourceFaceIdsByTriangle: readonly number[] } };
  }[] }[];
  readonly accessors: readonly { readonly bufferView: number; readonly count: number }[];
  readonly bufferViews: readonly { readonly byteOffset: number }[];
}

describe("원본 면의 실제 코너 법선", () => {
  it.each([false, true])("모든 면 smooth=%s일 때 원본 fan 법선이 GLB와 실제 Three geometry에 일치한다", (allSmooth) => {
    const base = createStudioUnitCubeMesh();
    const mesh = { ...base, faces: base.faces.map((face) => ({ ...face, smooth: allSmooth || face.id < 3 })) };
    const hash = hashStudioEditableMesh(mesh);
    const normals = deriveStudioHybridDccSplitCornerNormals(mesh);
    const exported = exportStudioHybridDccMeshGlb({ assetId: "mixed", mesh, sourceHash: hash, sourceRevision: 1 });
    if (!exported.ok) throw new Error(JSON.stringify(exported.report.errors));
    const view = new DataView(exported.bytes.buffer, exported.bytes.byteOffset, exported.bytes.byteLength);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(exported.bytes.subarray(20, 20 + jsonLength))) as Glb;
    const primitive = json.meshes[0]?.primitives[0];
    const accessor = primitive ? json.accessors[primitive.attributes.NORMAL] : undefined;
    const buffer = accessor ? json.bufferViews[accessor.bufferView] : undefined;
    if (!primitive || !accessor || !buffer) throw new Error("GLB 법선이 없습니다.");
    const output = Array.from({ length: accessor.count }, (_, index) => [0, 1, 2].map((axis) => view.getFloat32(20 + jsonLength + 8 + buffer.byteOffset + (index * 3 + axis) * 4, true)));
    const indexAccessor = json.accessors[primitive.indices];
    const indexBuffer = indexAccessor ? json.bufferViews[indexAccessor.bufferView] : undefined;
    if (!indexAccessor || !indexBuffer) throw new Error("GLB 삼각형 인덱스가 없습니다.");
    const byCorner = new Map<string, readonly number[]>();
    for (let index = 0; index < indexAccessor.count; index += 1) {
      const outputId = view.getUint32(20 + jsonLength + 8 + indexBuffer.byteOffset + index * 4, true);
      const vertexId = primitive.extras.toonSpectrum.outputSourceVertexIds[outputId];
      const faceId = primitive.extras.toonSpectrum.sourceFaceIdsByTriangle[Math.floor(index / 3)];
      const normal = output[outputId]; if (!normal) throw new Error("출력 코너 법선이 없습니다.");
      byCorner.set(`${faceId}:${vertexId}`, normal);
    }
    let offset = 0;
    for (const face of mesh.faces) {
      const loop = [face.he, face.he + 1, face.he + 2, face.he + 3];
      for (const id of [loop[0], loop[1], loop[2], loop[0], loop[2], loop[3]]) {
        const edge = id === undefined ? undefined : mesh.halfEdges[id];
        const vertex = edge ? mesh.halfEdges[edge.prev]?.vertex : undefined;
        expect(byCorner.get(`${face.id}:${vertex}`)).toEqual(Array.from(normals.subarray(offset, offset + 3)));
        offset += 3;
      }
    }
    expect(normals).toHaveLength(108); expect(hashStudioEditableMesh(mesh)).toBe(hash);
    expect(deriveStudioHybridDccSplitCornerNormals(mesh)).toBe(normals);
    const resource = createStudioHybridDccGeometryResource({ ...studioEditableMeshToTriangleSoup(mesh), normalMode: allSmooth ? "smooth" : "split", cornerNormals: normals });
    try { expect(resource.geometry.getAttribute("normal").array).toEqual(normals); expect(resource.geometry.index).toBeNull(); }
    finally { resource.dispose(); }
  });

  it("잘못된 분리 법선 배열은 GPU 자원 생성 전에 거부한다", () => {
    const mesh = studioEditableMeshToTriangleSoup(createStudioUnitCubeMesh());
    expect(() => createStudioHybridDccGeometryResource({ ...mesh, normalMode: "split" })).toThrow(/분리 법선/u);
    expect(() => createStudioHybridDccGeometryResource({ ...mesh, normalMode: "split", cornerNormals: new Float32Array(2) })).toThrow(/분리 법선/u);
    expect(() => createStudioHybridDccGeometryResource({ ...mesh, normalMode: "split", cornerNormals: new Float32Array(108) })).toThrow(/단위 벡터/u);
    const normals = new Float32Array(108); normals[0] = Infinity;
    expect(() => createStudioHybridDccGeometryResource({ ...mesh, normalMode: "split", cornerNormals: normals })).toThrow(/분리 법선/u);
    const valid = deriveStudioHybridDccSplitCornerNormals(createStudioUnitCubeMesh());
    expect(() => createStudioHybridDccGeometryResource({ ...mesh, normalMode: "flat", cornerNormals: valid })).toThrow(/flat/u);
  });
});
