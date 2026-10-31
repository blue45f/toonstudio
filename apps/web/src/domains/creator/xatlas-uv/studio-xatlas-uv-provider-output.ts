/** atlas 출력 복사·예산·원본 정점 대응 검증을 provider 실행 수명과 분리한다. */
import type {
  StudioXAtlasUvArtifact,
  StudioXAtlasUvAtlasReceipt,
  StudioXAtlasUvCapabilityReceipt,
  StudioXAtlasUvFailureReason,
  StudioXAtlasUvMeshRange,
  StudioXAtlasUvProviderLimits,
  StudioXAtlasUvRuntimeAtlas,
  StudioXAtlasUvRuntimeMeshInput,
  StudioXAtlasUvRuntimeMeshOutput,
} from "./studio-xatlas-uv-provider";

type OutputLimits = Required<Pick<StudioXAtlasUvProviderLimits,
  "maxVerticesPerMesh" | "maxOutputVertices" | "maxOutputTriangles"
  | "maxOutputBytes" | "maxAtlasResolution" | "maxAtlasCount" | "maxTexelsPerUnit"
>>;
type SourceMesh = Pick<StudioXAtlasUvRuntimeMeshInput, "id" | "positions"> & {
  readonly sourceVertexCount: number;
};
type Stop = (reason: StudioXAtlasUvFailureReason, detail: string) => never;

function checkedAdd(left: number, right: number, label: string, stop: Stop): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) stop("budget-exceeded", `${label}가 안전한 정수 범위를 넘었습니다.`);
  return result;
}

function parseAtlasMetadata(
  atlas: StudioXAtlasUvRuntimeAtlas,
  expectedMeshCount: number,
  limits: OutputLimits,
  stop: Stop,
): StudioXAtlasUvAtlasReceipt {
  if (!Number.isSafeInteger(atlas.width) || atlas.width <= 0 || atlas.width > limits.maxAtlasResolution
    || !Number.isSafeInteger(atlas.height) || atlas.height <= 0 || atlas.height > limits.maxAtlasResolution
    || !Number.isSafeInteger(atlas.atlasCount) || atlas.atlasCount <= 0 || atlas.atlasCount > limits.maxAtlasCount
    || atlas.meshCount !== expectedMeshCount
    || !Number.isFinite(atlas.texelsPerUnit) || atlas.texelsPerUnit <= 0
    || atlas.texelsPerUnit > limits.maxTexelsPerUnit) {
    stop("invalid-provider-output", "xatlas 출력 atlas 메타데이터가 올바르지 않습니다.");
  }
  return Object.freeze({
    width: atlas.width,
    height: atlas.height,
    count: atlas.atlasCount,
    texelsPerUnit: atlas.texelsPerUnit,
  });
}

function alignedLength(value: number | undefined, multiple: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value % multiple === 0;
}

function float32Value(value: number | undefined, label: string, stop: Stop): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
    stop("invalid-provider-output", `${label}에 유한 Float32로 표현할 수 없는 값이 있습니다.`);
  }
  return Math.fround(value);
}

function vertexIndex(value: number | undefined, count: number, label: string, stop: Stop): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value >= count) {
    stop("invalid-provider-output", `${label}에 범위를 벗어난 정점 인덱스가 있습니다.`);
  }
  return value;
}

/** map 값에는 vertexOffset을 더하지 않는다. 각 입력 mesh 안의 local 인덱스다. */
export function buildStudioXAtlasUvArtifact(
  atlas: StudioXAtlasUvRuntimeAtlas,
  sourceMeshes: readonly SourceMesh[],
  limits: OutputLimits,
  receipt: StudioXAtlasUvCapabilityReceipt,
  version: StudioXAtlasUvArtifact["version"],
  stop: Stop,
): StudioXAtlasUvArtifact {
  if (!Array.isArray(atlas.meshes) || atlas.meshes.length !== sourceMeshes.length) {
    stop("invalid-provider-output", "xatlas 출력 mesh 개수가 요청과 다릅니다.");
  }
  const atlasReceipt = parseAtlasMetadata(atlas, sourceMeshes.length, limits, stop);
  const outputsById = new Map<string, StudioXAtlasUvRuntimeMeshOutput>();
  for (const output of atlas.meshes) {
    if (typeof output !== "object" || output === null || typeof output.id !== "string"
      || outputsById.has(output.id)) {
      stop("invalid-provider-output", "xatlas 출력 mesh 메타데이터가 올바르지 않습니다.");
    }
    outputsById.set(output.id, output);
  }
  let declaredVertices = 0;
  let declaredTriangles = 0;
  let declaredBytes = 0;
  const layouts = new Map<string, { readonly vertexCount: number; readonly indexCount: number }>();
  for (const input of sourceMeshes) {
    const output = outputsById.get(input.id);
    if (!output) stop("invalid-provider-output", `xatlas 출력에서 mesh ${input.id}가 누락되었습니다.`);
    const positionLength = output.positions?.length;
    const uvLength = output.uv?.length;
    const indexLength = output.indices?.length;
    const mapLength = output.originalInputVertexIndices?.length;
    if (!alignedLength(positionLength, 3) || !alignedLength(indexLength, 3)
      || uvLength !== positionLength / 3 * 2 || mapLength !== positionLength / 3) {
      stop("invalid-provider-output", `${input.id} 출력 위치·UV·인덱스·원본 대응표의 크기가 올바르지 않습니다.`);
    }
    const vertexCount = positionLength / 3;
    layouts.set(input.id, { vertexCount, indexCount: indexLength });
    declaredVertices = checkedAdd(declaredVertices, vertexCount, "출력 정점 수", stop);
    declaredTriangles = checkedAdd(declaredTriangles, indexLength / 3, "출력 삼각형 수", stop);
    // positions 3개·UV 2개·원본 대응표 1개를 정점마다 각각 4바이트로 계산한다.
    declaredBytes = checkedAdd(declaredBytes, vertexCount * 24, "출력 바이트 수", stop);
    declaredBytes = checkedAdd(declaredBytes, indexLength * 4, "출력 바이트 수", stop);
    if (vertexCount > limits.maxVerticesPerMesh || declaredVertices > limits.maxOutputVertices
      || declaredTriangles > limits.maxOutputTriangles || declaredBytes > limits.maxOutputBytes) {
      stop("budget-exceeded", "xatlas 출력이 정점·삼각형·바이트 예산을 넘었습니다.");
    }
  }
  const positions = new Float32Array(declaredVertices * 3);
  const uv = new Float32Array(declaredVertices * 2);
  const indices = new Uint32Array(declaredTriangles * 3);
  const originalInputVertexIndices = new Uint32Array(declaredVertices);
  const ranges: StudioXAtlasUvMeshRange[] = [];
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const input of sourceMeshes) {
    const output = outputsById.get(input.id);
    if (!output) stop("invalid-provider-output", `xatlas 출력에서 mesh ${input.id}가 누락되었습니다.`);
    const layout = layouts.get(input.id);
    if (!layout) stop("invalid-provider-output", `${input.id} 출력 크기의 검증 기록이 없습니다.`);
    const { vertexCount, indexCount } = layout;
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const original = vertexIndex(
        output.originalInputVertexIndices[vertex], input.sourceVertexCount,
        `${input.id} 원본 대응표`, stop,
      );
      originalInputVertexIndices[vertexOffset + vertex] = original;
      for (let axis = 0; axis < 3; axis += 1) {
        const item = output.positions[vertex * 3 + axis];
        const source = input.positions[original * 3 + axis];
        const copied = float32Value(item, `${input.id} 위치`, stop);
        if (item !== source) {
          stop("invalid-provider-output", `${input.id} 출력 위치가 대응표의 원본 Float32 위치와 다릅니다.`);
        }
        positions[(vertexOffset + vertex) * 3 + axis] = copied;
      }
      for (let axis = 0; axis < 2; axis += 1) {
        uv[(vertexOffset + vertex) * 2 + axis] = float32Value(
          output.uv[vertex * 2 + axis], `${input.id} UV`, stop,
        );
      }
    }
    for (let index = 0; index < indexCount; index += 1) {
      indices[indexOffset + index] = vertexIndex(output.indices[index], vertexCount, `${input.id} 출력 인덱스`, stop) + vertexOffset;
    }
    if (output.positions.length !== vertexCount * 3 || output.uv.length !== vertexCount * 2
      || output.originalInputVertexIndices.length !== vertexCount || output.indices.length !== indexCount) {
      stop("invalid-provider-output", `${input.id} 출력 크기가 복사 중 바뀌었습니다.`);
    }
    const segments = (output.atlasSegments ?? []).map((segment) => {
      if (typeof segment !== "object" || segment === null
        || !Number.isSafeInteger(segment.index) || segment.index < 0
        || !Number.isSafeInteger(segment.count) || segment.count <= 0
        || segment.index + segment.count > indexCount
        || !Number.isSafeInteger(segment.atlasIndex) || segment.atlasIndex < 0
        || segment.atlasIndex >= atlasReceipt.count) {
        stop("invalid-provider-output", `${input.id} atlas segment가 올바르지 않습니다.`);
      }
      return Object.freeze({
        indexOffset: indexOffset + segment.index,
        indexCount: segment.count,
        atlasIndex: segment.atlasIndex,
      });
    });
    ranges.push(Object.freeze({
      id: input.id,
      sourceVertexCount: input.sourceVertexCount,
      vertexOffset,
      vertexCount,
      indexOffset,
      indexCount,
      atlasSegments: Object.freeze(segments),
    }));
    vertexOffset += vertexCount;
    indexOffset += indexCount;
  }
  return Object.freeze({
    kind: "studio-xatlas-uv-atlas",
    version,
    positions,
    uv,
    indices,
    originalInputVertexIndices,
    meshes: Object.freeze(ranges),
    atlas: atlasReceipt,
    receipt,
  });
}
