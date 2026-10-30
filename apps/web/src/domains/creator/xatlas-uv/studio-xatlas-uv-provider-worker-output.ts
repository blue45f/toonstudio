/** Worker 결과를 승인한 입력 복사본과 대조한다. 원본 위치는 transfer한 배열과 별도로 소유한다. */
import { STUDIO_XATLAS_UV_PROVIDER_LIMITS, type StudioXAtlasUvProviderLimits } from "./studio-xatlas-uv-provider";
import { studioXAtlasUvResultHash, type StudioXAtlasUvWorkerOutboundMessage } from "./studio-xatlas-uv-provider-protocol";
import { isStudioXAtlasUvOwnedWorkerArray } from "./studio-xatlas-uv-provider-worker-data";

export interface StudioXAtlasUvWorkerResultAdmission {
  readonly requestEpoch: number;
  readonly documentEpoch: number;
  readonly requestHash: `sha256:${string}`;
  readonly meshes: readonly Readonly<{
    readonly id: string;
    readonly sourceVertexCount: number;
    readonly positions: Float32Array;
  }>[];
}

export function boundStudioXAtlasUvWorkerSuccessMatches(
  message: Extract<StudioXAtlasUvWorkerOutboundMessage, { readonly type: "studio-xatlas-uv/result" }>,
  pending: StudioXAtlasUvWorkerResultAdmission,
  limits: StudioXAtlasUvProviderLimits | undefined,
): boolean {
  if (!message.result.ok || message.binding === undefined) return false;
  const { artifact } = message.result;
  if (message.binding.requestEpoch !== pending.requestEpoch
    || message.binding.documentEpoch !== pending.documentEpoch
    || message.binding.requestHash !== pending.requestHash
    || !isStudioXAtlasUvOwnedWorkerArray(artifact.positions, "Float32Array")
    || !isStudioXAtlasUvOwnedWorkerArray(artifact.uv, "Float32Array")
    || !isStudioXAtlasUvOwnedWorkerArray(artifact.indices, "Uint32Array")
    || !isStudioXAtlasUvOwnedWorkerArray(artifact.originalInputVertexIndices, "Uint32Array")
    || artifact.positions.length === 0 || artifact.positions.length % 3 !== 0
    || artifact.uv.length !== artifact.positions.length / 3 * 2
    || artifact.originalInputVertexIndices.length !== artifact.positions.length / 3
    || artifact.indices.length === 0 || artifact.indices.length % 3 !== 0
    || artifact.meshes.length !== pending.meshes.length) return false;
  const vertexCount = artifact.positions.length / 3;
  const triangleCount = artifact.indices.length / 3;
  const outputBytes = artifact.positions.byteLength + artifact.uv.byteLength
    + artifact.indices.byteLength + artifact.originalInputVertexIndices.byteLength;
  if (!Number.isSafeInteger(outputBytes)
    || vertexCount > (limits?.maxOutputVertices ?? STUDIO_XATLAS_UV_PROVIDER_LIMITS.maxOutputVertices)
    || triangleCount > (limits?.maxOutputTriangles ?? STUDIO_XATLAS_UV_PROVIDER_LIMITS.maxOutputTriangles)
    || outputBytes > (limits?.maxOutputBytes ?? STUDIO_XATLAS_UV_PROVIDER_LIMITS.maxOutputBytes)
    || artifact.atlas.width > (limits?.maxAtlasResolution ?? STUDIO_XATLAS_UV_PROVIDER_LIMITS.maxAtlasResolution)
    || artifact.atlas.height > (limits?.maxAtlasResolution ?? STUDIO_XATLAS_UV_PROVIDER_LIMITS.maxAtlasResolution)
    || artifact.atlas.count > (limits?.maxAtlasCount ?? STUDIO_XATLAS_UV_PROVIDER_LIMITS.maxAtlasCount)) return false;
  for (const value of artifact.positions) if (!Number.isFinite(value)) return false;
  for (const value of artifact.uv) if (!Number.isFinite(value)) return false;
  let expectedVertexOffset = 0;
  let expectedIndexOffset = 0;
  for (let index = 0; index < pending.meshes.length; index += 1) {
    const expected = pending.meshes[index];
    const range = artifact.meshes[index];
    if (!range || !expected || range.id !== expected.id
      || range.sourceVertexCount !== expected.sourceVertexCount
      || !isStudioXAtlasUvOwnedWorkerArray(expected.positions, "Float32Array")
      || expected.positions.length !== expected.sourceVertexCount * 3
      || range.vertexOffset !== expectedVertexOffset || range.indexOffset !== expectedIndexOffset
      || range.vertexCount > (limits?.maxVerticesPerMesh ?? STUDIO_XATLAS_UV_PROVIDER_LIMITS.maxVerticesPerMesh)
      || range.vertexOffset + range.vertexCount > vertexCount
      || range.indexOffset + range.indexCount > artifact.indices.length
      || range.indexCount % 3 !== 0
      || range.atlasSegments.some((segment) => segment.indexOffset < range.indexOffset
        || segment.indexOffset + segment.indexCount > range.indexOffset + range.indexCount
        || segment.indexOffset % 3 !== 0 || segment.indexCount % 3 !== 0
        || segment.atlasIndex >= artifact.atlas.count)) return false;
    const vertexEnd = range.vertexOffset + range.vertexCount;
    for (let vertex = range.vertexOffset; vertex < vertexEnd; vertex += 1) {
      const original = artifact.originalInputVertexIndices[vertex];
      if (original === undefined || original >= expected.sourceVertexCount) return false;
      for (let axis = 0; axis < 3; axis += 1) {
        if (artifact.positions[vertex * 3 + axis] !== expected.positions[original * 3 + axis]) return false;
      }
    }
    const indexEnd = range.indexOffset + range.indexCount;
    for (let offset = range.indexOffset; offset < indexEnd; offset += 1) {
      const vertex = artifact.indices[offset];
      if (vertex === undefined || vertex < range.vertexOffset || vertex >= vertexEnd) return false;
    }
    expectedVertexOffset = vertexEnd;
    expectedIndexOffset = indexEnd;
  }
  if (expectedVertexOffset !== vertexCount || expectedIndexOffset !== artifact.indices.length) return false;
  // 예산·타입·원본 대응 검사를 마친 뒤에만 전체 출력 바이트를 해시한다.
  return message.binding.resultHash === studioXAtlasUvResultHash(message.result);
}
