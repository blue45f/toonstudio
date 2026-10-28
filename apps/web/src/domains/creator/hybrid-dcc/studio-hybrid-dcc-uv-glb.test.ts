import { describe, expect, it } from "vitest";

import { createStudioEditableMeshFromPolygons, createStudioUnitCubeMesh, hashStudioEditableMesh, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { exportStudioHybridDccMeshGlb } from "./studio-hybrid-dcc-glb-export";
import { hasValidStudioHybridDccPackedMeshChecksums, packStudioHybridDccGlbExportInput, unpackStudioHybridDccGlbExportInput } from "./studio-hybrid-dcc-glb-export-packed-mesh";
import { isStudioHybridDccGlbExportWorkerRequest, isStudioHybridDccGlbExportWorkerResponse, STUDIO_HYBRID_DCC_GLB_EXPORT_WORKER_INPUT_TRANSPORT, STUDIO_HYBRID_DCC_GLB_EXPORT_WORKER_MAX_RESPONSE_BYTES, STUDIO_HYBRID_DCC_GLB_EXPORT_WORKER_PROTOCOL_VERSION } from "./studio-hybrid-dcc-glb-export-worker-protocol";
import { unwrapStudioMeshCornerUvs } from "./studio-hybrid-dcc-uv-edit";

interface GlbDocument {
  readonly accessors: readonly { readonly bufferView: number; readonly byteOffset?: number; readonly count: number; readonly componentType: number; readonly type: string }[];
  readonly bufferViews: readonly { readonly byteOffset: number; readonly byteLength: number }[];
  readonly meshes: readonly { readonly primitives: readonly {
    readonly attributes: Readonly<Record<string, number>>;
    readonly indices: number;
    readonly extras: { readonly toonSpectrum: { readonly outputSourceVertexIds: readonly number[]; readonly sourceFaceIdsByTriangle: readonly number[] } };
  }[] }[];
}
function source(mesh: StudioEditableMesh) { return { assetId: "uv-source", sourceRevision: 1, sourceHash: hashStudioEditableMesh(mesh), mesh }; }
function exported(mesh: StudioEditableMesh) {
  const result = exportStudioHybridDccMeshGlb(source(mesh));
  if (!result.ok) throw new Error(JSON.stringify(result.report.errors));
  return result;
}
function parse(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as GlbDocument;
  const binOffset = 20 + jsonLength + 8;
  const primitive = json.meshes[0]?.primitives[0];
  if (!primitive) throw new Error("GLB primitive가 없습니다.");
  const read = (accessorId: number | undefined): number[] => {
    const accessor = accessorId === undefined ? undefined : json.accessors[accessorId];
    if (!accessor) throw new Error("GLB accessor가 없습니다.");
    const buffer = json.bufferViews[accessor.bufferView];
    if (!buffer) throw new Error("GLB bufferView가 없습니다.");
    const components = accessor.type === "VEC3" ? 3 : accessor.type === "VEC2" ? 2 : 1;
    const offset = binOffset + buffer.byteOffset + (accessor.byteOffset ?? 0);
    return Array.from({ length: accessor.count * components }, (_, index) => accessor.componentType === 5126
      ? view.getFloat32(offset + index * 4, true) : view.getUint32(offset + index * 4, true));
  };
  return { primitive, read };
}
function cubeWithUvs(smooth = false): StudioEditableMesh {
  const cube = createStudioUnitCubeMesh();
  const mesh = smooth ? { ...cube, faces: cube.faces.map((face) => ({ ...face, smooth: true })) } : cube;
  return { ...mesh, uvLayer: unwrapStudioMeshCornerUvs(mesh) };
}

describe("정본 코너 UV의 실제 GLB/Worker 전달", () => {
  it("3D 경계가 직선이어도 비선형 UV를 가진 중간 코너를 삼각형에서 삭제하지 않는다", () => {
    const base = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 },
      { x: 2, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2, 3, 4]]);
    const points = [[0, 0], [0.5, 0.5], [1, 0], [1, 1], [0, 1]];
    const mesh: StudioEditableMesh = { ...base, uvLayer: { revision: 1, topologyHash: hashStudioMeshUvTopology(base),
      corners: base.halfEdges.map((edge) => {
        const point = points[base.halfEdges[edge.prev]?.vertex ?? -1];
        if (!point || point[0] === undefined || point[1] === undefined) throw new Error("테스트 UV가 없습니다.");
        return { halfEdgeId: edge.id, u: point[0], v: point[1] };
      }),
    } };
    const result = exported(mesh);
    const { primitive, read } = parse(result.bytes);
    expect(result.metrics.triangleCount).toBe(3);
    expect(new Set(primitive.extras.toonSpectrum.outputSourceVertexIds)).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(result.report.warnings.some(({ code }) => code === "face-collinear-corner-omitted")).toBe(false);
    const index = primitive.extras.toonSpectrum.outputSourceVertexIds.indexOf(1);
    expect(read(primitive.attributes.TEXCOORD_0).slice(index * 2, index * 2 + 2)).toEqual([0.5, 0.5]);
  });

  it.each([false, true])("flat/smooth=%s 출력의 모든 삼각형 코너가 원본 면 UV와 일치한다", (smooth) => {
    const mesh = cubeWithUvs(smooth);
    const before = hashStudioEditableMesh(mesh);
    const result = exported(mesh);
    const { primitive, read } = parse(result.bytes);
    const uvs = read(primitive.attributes.TEXCOORD_0);
    const positions = read(primitive.attributes.POSITION);
    const indices = read(primitive.indices);
    expect(result.metrics.outputVertexCount).toBe(24);
    expect(uvs).toHaveLength(result.metrics.outputVertexCount * 2);
    indices.forEach((outputId, index) => {
      const sourceId = primitive.extras.toonSpectrum.outputSourceVertexIds[outputId];
      const faceId = primitive.extras.toonSpectrum.sourceFaceIdsByTriangle[Math.floor(index / 3)];
      const edge = mesh.halfEdges.find((entry) => entry.face === faceId && mesh.halfEdges[entry.prev]?.vertex === sourceId);
      const corner = edge ? mesh.uvLayer?.corners[edge.id] : undefined;
      const vertex = sourceId === undefined ? undefined : mesh.vertices[sourceId];
      if (!corner || !vertex) throw new Error("출력 삼각형의 원본 코너를 찾지 못했습니다.");
      expect(uvs.slice(outputId * 2, outputId * 2 + 2)).toEqual([corner.u, Math.fround(1 - corner.v)]);
      expect(positions.slice(outputId * 3, outputId * 3 + 3)).toEqual([vertex.position.x, vertex.position.y, vertex.position.z].map(Math.fround));
    });
    expect(hashStudioEditableMesh(mesh)).toBe(before);
  });

  it("UV seam에서 출력 정점을 나누어도 기존 smooth 법선은 바뀌지 않는다", () => {
    const uvMesh = cubeWithUvs(true);
    const { uvLayer: _layer, ...mesh } = uvMesh;
    const original = parse(exported(mesh).bytes);
    const split = parse(exported(uvMesh).bytes);
    const normals = original.read(original.primitive.attributes.NORMAL);
    const splitNormals = split.read(split.primitive.attributes.NORMAL);
    const normalBySource = new Map(original.primitive.extras.toonSpectrum.outputSourceVertexIds.map((id, index) => [id, normals.slice(index * 3, index * 3 + 3)]));
    expect(original.primitive.extras.toonSpectrum.outputSourceVertexIds).toHaveLength(8);
    split.primitive.extras.toonSpectrum.outputSourceVertexIds.forEach((id, index) => {
      expect(splitNormals.slice(index * 3, index * 3 + 3)).toEqual(normalBySource.get(id));
    });
  });

  it("비대칭·음수·타일 밖 UV를 V-flip하며 clamp하지 않는다", () => {
    const original = cubeWithUvs();
    const layer = original.uvLayer;
    if (!layer) throw new Error("UV 레이어가 없습니다.");
    const mesh = { ...original, uvLayer: { ...layer, corners: layer.corners.map((corner) => ({
      ...corner, u: Math.fround(corner.halfEdgeId % 2 === 0 ? 0.1 : -0.25), v: Math.fround(corner.halfEdgeId % 2 === 0 ? 0.2 : 1.5),
    })) } };
    const { primitive, read } = parse(exported(mesh).bytes);
    const values = read(primitive.attributes.TEXCOORD_0);
    const pairs = Array.from({ length: values.length / 2 }, (_, index) => values.slice(index * 2, index * 2 + 2));
    expect(pairs).toContainEqual([Math.fround(0.1), Math.fround(0.8)]);
    expect(pairs).toContainEqual([-0.25, -0.5]);
  });

  it("transferable Worker payload 왕복에서 UV와 source hash를 보존하고 direct와 같은 GLB를 만든다", () => {
    const input = source(cubeWithUvs(true));
    const packed = packStudioHybridDccGlbExportInput(input);
    const wire = structuredClone(packed, { transfer: [packed.buffer] });
    expect(packed.buffer.byteLength).toBe(0);
    expect(hasValidStudioHybridDccPackedMeshChecksums(wire)).toBe(true);
    expect(isStudioHybridDccGlbExportWorkerRequest({
      version: STUDIO_HYBRID_DCC_GLB_EXPORT_WORKER_PROTOCOL_VERSION, kind: "export-batch", requestId: 1,
      inputTransport: STUDIO_HYBRID_DCC_GLB_EXPORT_WORKER_INPUT_TRANSPORT, payloads: [wire], maxResponseBytes: STUDIO_HYBRID_DCC_GLB_EXPORT_WORKER_MAX_RESPONSE_BYTES,
    })).toBe(true);
    const restored = unpackStudioHybridDccGlbExportInput(wire);
    if (!restored) throw new Error("Worker UV payload를 복원하지 못했습니다.");
    expect(restored.mesh.uvLayer).toEqual(input.mesh.uvLayer);
    expect(hashStudioEditableMesh(restored.mesh)).toBe(input.sourceHash);
    const output = exportStudioHybridDccMeshGlb(restored);
    if (!output.ok) throw new Error("Worker 복원 뒤 GLB를 만들지 못했습니다.");
    expect(output.bytes).toEqual(exported(input.mesh).bytes);
    expect(isStudioHybridDccGlbExportWorkerResponse({
      version: STUDIO_HYBRID_DCC_GLB_EXPORT_WORKER_PROTOCOL_VERSION, kind: "result", requestId: 1,
      results: [{ ...output, bytes: output.bytes.buffer }], totalByteLength: output.bytes.byteLength,
    })).toBe(true);
  });

  it("UV 없는 payload의 기존 section/길이를 유지하고 UV 바이트·위상·offset 변조는 거부한다", () => {
    const noUv = packStudioHybridDccGlbExportInput(source(createStudioUnitCubeMesh()));
    const uv = packStudioHybridDccGlbExportInput(source(cubeWithUvs()));
    expect(noUv.manifest).not.toHaveProperty("uvLayer");
    expect(uv.manifest.sections).toEqual(noUv.manifest.sections);
    expect(uv.buffer.byteLength - noUv.buffer.byteLength).toBe(24 * 8);
    const offset = uv.manifest.uvLayer?.offset;
    if (offset === undefined) throw new Error("UV 전송 section이 없습니다.");
    const bytes = new Uint8Array(uv.buffer); bytes[offset] = (bytes[offset] ?? 0) ^ 1;
    expect(unpackStudioHybridDccGlbExportInput(uv)).toBeNull();
    const changedTopology = packStudioHybridDccGlbExportInput(source(cubeWithUvs()));
    expect(unpackStudioHybridDccGlbExportInput({ ...changedTopology, manifest: { ...changedTopology.manifest,
      uvLayer: { ...changedTopology.manifest.uvLayer, revision: 1, topologyHash: `uv-topology:sha256:${"0".repeat(64)}`, offset: 0, byteLength: 192 },
    } })).toBeNull();
  });
});
