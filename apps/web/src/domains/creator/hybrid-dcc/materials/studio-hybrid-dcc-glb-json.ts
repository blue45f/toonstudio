/** 검증된 원본 정점 스트림을 glTF JSON으로 옮긴다. 무재질 필드·순서는 기존 bytes 호환 계약이다. */
import type { StudioEditableFace } from "../../studio-editable-half-edge-mesh";
import type { StudioHybridDccGlbBinaryGeometry } from "../studio-hybrid-dcc-glb-binary";
import type { StudioHybridDccMeshGlbExportInput } from "../studio-hybrid-dcc-glb-export";
import type { StudioHybridDccGlbMaterialPlan } from "./studio-hybrid-dcc-toon-export";
import { hashStudioHybridDccToonMaterialSlots } from "./studio-hybrid-dcc-toon-export";

const GLTF_COMPONENT_FLOAT = 5126, GLTF_COMPONENT_UNSIGNED_INT = 5125, GLTF_ARRAY_BUFFER = 34962, GLTF_ELEMENT_ARRAY_BUFFER = 34963, GLTF_TRIANGLES = 4;
interface JsonValidatedMesh { readonly faces: readonly { readonly face: StudioEditableFace; readonly halfEdgeIds: readonly number[]; readonly vertexIds: readonly number[] }[]; readonly boundaryEdgeCount: number }
interface JsonBuiltGeometry { readonly indices: readonly number[]; readonly texcoords?: readonly number[]; readonly outputSourceVertexIds: readonly number[]; readonly outputSourceNormalFaceIds: readonly (number | null)[]; readonly triangleSourceFaceIds: readonly number[] }
function minimumNumber(values: readonly number[]): number { let result = Infinity; for (const value of values) result = Math.min(result, value); return result; }
function maximumNumber(values: readonly number[]): number { let result = -Infinity; for (const value of values) result = Math.max(result, value); return result; }

export function buildStudioHybridDccGltfJson(
  input: StudioHybridDccMeshGlbExportInput,
  mesh: JsonValidatedMesh,
  geometry: JsonBuiltGeometry,
  binary: StudioHybridDccGlbBinaryGeometry,
  generator: string,
  materialPlan?: StudioHybridDccGlbMaterialPlan,
): Record<string, unknown> {
  const source = {
    authority: "editable-half-edge-mesh",
    assetId: input.assetId,
    sourceHash: input.sourceHash,
    sourceRevision: input.sourceRevision,
    meshSchemaRevision: input.mesh.revision,
    ...(input.toonMaterials === undefined ? {} : { toonMaterialsHash: hashStudioHybridDccToonMaterialSlots(input.toonMaterials) }),
  } as const;
  const faceTopology = mesh.faces.map((entry) => ({
    faceId: entry.face.id,
    halfEdgeIds: entry.halfEdgeIds,
    materialSlot: entry.face.materialSlot,
    smooth: entry.face.smooth,
    vertexIds: entry.vertexIds,
  }));
  const outputVertexCount = geometry.outputSourceVertexIds.length;
  const json = {
    asset: {
      version: "2.0",
      generator,
      extras: { toonSpectrum: { provenance: source } },
    },
    scene: 0,
    scenes: [{ name: input.assetId, nodes: [0] }],
    nodes: [{
      name: input.assetId,
      mesh: 0,
      extras: { toonSpectrum: { sourceAssetId: input.assetId, sourceRevision: input.sourceRevision } },
    }],
    meshes: [{
      name: input.assetId,
      extras: { toonSpectrum: { provenance: source, sourceFaceTopology: faceTopology } },
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, ...(geometry.texcoords ? { TEXCOORD_0: 3 } : {}) },
        indices: 2,
        mode: GLTF_TRIANGLES,
        extras: {
          toonSpectrum: {
            outputSourceNormalFaceIds: geometry.outputSourceNormalFaceIds,
            outputSourceVertexIds: geometry.outputSourceVertexIds,
            sourceFaceIdsByTriangle: geometry.triangleSourceFaceIds,
          },
        },
      }],
    }],
    buffers: [{ byteLength: binary.bytes.byteLength }],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: binary.positionOffset,
        byteLength: binary.positionByteLength,
        target: GLTF_ARRAY_BUFFER,
      },
      {
        buffer: 0,
        byteOffset: binary.normalOffset,
        byteLength: binary.normalByteLength,
        target: GLTF_ARRAY_BUFFER,
      },
      {
        buffer: 0,
        byteOffset: binary.indexOffset,
        byteLength: binary.indexByteLength,
        target: GLTF_ELEMENT_ARRAY_BUFFER,
      },
      ...(binary.texcoordOffset === undefined ? [] : [{
        buffer: 0,
        byteOffset: binary.texcoordOffset,
        byteLength: binary.texcoordByteLength,
        target: GLTF_ARRAY_BUFFER,
      }]),
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: GLTF_COMPONENT_FLOAT,
        count: outputVertexCount,
        type: "VEC3",
        min: binary.boundsMin,
        max: binary.boundsMax,
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: GLTF_COMPONENT_FLOAT,
        count: outputVertexCount,
        type: "VEC3",
      },
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: GLTF_COMPONENT_UNSIGNED_INT,
        count: geometry.indices.length,
        type: "SCALAR",
        min: [minimumNumber(geometry.indices)],
        max: [maximumNumber(geometry.indices)],
      },
      ...(geometry.texcoords ? [{
        bufferView: 3,
        byteOffset: 0,
        componentType: GLTF_COMPONENT_FLOAT,
        count: outputVertexCount,
        type: "VEC2",
      }] : []),
    ],
    extras: {
      toonSpectrum: {
        provenance: source,
        sourceCounts: {
          vertices: input.mesh.vertices.length,
          halfEdges: input.mesh.halfEdges.length,
          faces: input.mesh.faces.length,
        },
        topology: {
          boundaryEdges: mesh.boundaryEdgeCount,
          triangles: geometry.indices.length / 3,
        },
      },
    },
  };
  if (!materialPlan) return json;
  const extraAccessors = materialPlan.primitives.map((primitive) => ({ bufferView: 2, byteOffset: primitive.start * 4,
    componentType: GLTF_COMPONENT_UNSIGNED_INT, count: primitive.indices.length, type: "SCALAR",
    min: [minimumNumber(primitive.indices)], max: [maximumNumber(primitive.indices)] }));
  const primitives = materialPlan.primitives.map((primitive, index) => ({
    attributes: { POSITION: 0, NORMAL: 1, ...(geometry.texcoords ? { TEXCOORD_0: 3 } : {}) },
    indices: json.accessors.length + index, mode: GLTF_TRIANGLES, ...(primitive.material === undefined ? {} : { material: primitive.material }),
    extras: { toonSpectrum: { outputSourceNormalFaceIds: geometry.outputSourceNormalFaceIds, outputSourceVertexIds: geometry.outputSourceVertexIds,
      sourceFaceIdsByTriangle: primitive.sourceFaceIds, sourceMaterialSlot: primitive.slot } },
  }));
  return { ...json, meshes: [{ ...json.meshes[0], primitives }], accessors: [...json.accessors, ...extraAccessors],
    ...(materialPlan.materials.length ? { materials: materialPlan.materials, extensionsUsed: ["VRMC_materials_mtoon"] } : {}) };
}
