/**
 * 미통합 초안: atlas 출력의 명시적인 원본 정점 대응으로 정본 면 코너 UV만 교체한다.
 * 현행 provider가 버리는 oldIndexes와 UV 단위·축 변환은 이 모듈 밖에서 검증해야 한다.
 */
import {
  hashStudioEditableMesh,
  validateStudioEditableMeshSerializableAuthority,
  type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";
import { planStudioMeshSurface } from "../mesh-surface/studio-mesh-surface-plan";

import {
  decodeStudioMeshUvLayer,
  hashStudioMeshUvTopology,
  type StudioMeshUvCorner,
} from "./studio-mesh-uv-authority";

type TriangleTuple = readonly [number, number, number];

export interface StudioMeshUvAtlasPreparedTriangle {
  readonly faceId: number;
  readonly inputVertexIndices: TriangleTuple;
  readonly cornerHalfEdgeIds: TriangleTuple;
}

export interface StudioMeshUvAtlasProvenancePrepared {
  readonly sourceHash: string;
  readonly topologyHash: string;
  readonly positions: Float32Array;
  readonly inputSourceVertexIds: Uint32Array;
  readonly useNormals: false;
  readonly indices: Uint32Array;
  readonly triangles: readonly StudioMeshUvAtlasPreparedTriangle[];
}

/** positions·indices·대응표는 한 입력 mesh의 local 인덱스 공간을 사용한다. */
export interface StudioMeshUvAtlasProvenanceOutput {
  readonly uvSpace: "canonical-v-up-normalized";
  readonly atlasCount: number;
  readonly positions: Float32Array;
  readonly uv: Float32Array;
  readonly indices: Uint32Array;
  readonly originalInputVertexIndices: Uint32Array;
}

export type StudioMeshUvAtlasProvenanceErrorCode =
  | "invalid-source"
  | "invalid-surface"
  | "corner-coverage"
  | "ambiguous-triangle"
  | "prepared-mismatch"
  | "stale-source"
  | "atlas-page-unsupported"
  | "uv-space-invalid"
  | "output-shape-invalid"
  | "output-provenance-invalid"
  | "triangle-coverage"
  | "corner-uv-conflict";

export class StudioMeshUvAtlasProvenanceError extends Error {
  constructor(
    readonly code: StudioMeshUvAtlasProvenanceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StudioMeshUvAtlasProvenanceError";
  }
}

function fail(code: StudioMeshUvAtlasProvenanceErrorCode, message: string): never {
  throw new StudioMeshUvAtlasProvenanceError(code, message);
}

function tuple(a: number, b: number, c: number): TriangleTuple {
  const values: [number, number, number] = [a, b, c];
  return Object.freeze(values);
}

function tupleAt(values: TriangleTuple, index: number): number {
  const value = values[index];
  if (value === undefined) fail("invalid-surface", "삼각형 코너 인덱스가 범위를 벗어났습니다.");
  return value;
}

function arrayValue(values: ArrayLike<number>, index: number): number {
  const value = values[index];
  if (value === undefined || !Number.isFinite(value)) {
    fail("invalid-surface", "공통 표면의 배열 값이 누락되었거나 유한하지 않습니다.");
  }
  return value;
}

function inputIndex(value: number, vertexCount: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= vertexCount) {
    fail("invalid-surface", "공통 표면의 정점 인덱스가 올바르지 않습니다.");
  }
  return value;
}

/** 뒤집힌 순서는 다른 키이며 순환 회전 세 가지에만 같은 키를 부여한다. */
function orientedKey(values: TriangleTuple): string {
  const [a, b, c] = values;
  if (a === b || b === c || c === a) {
    fail("ambiguous-triangle", "서로 다른 세 정점으로 구성된 삼각형만 대응할 수 있습니다.");
  }
  if (a < b && a < c) return `${a}:${b}:${c}`;
  if (b < a && b < c) return `${b}:${c}:${a}`;
  return `${c}:${a}:${b}`;
}

function ownedFloat32(value: Float32Array): boolean {
  return value instanceof Float32Array && value.buffer instanceof ArrayBuffer;
}

function ownedUint32(value: Uint32Array): boolean {
  return value instanceof Uint32Array && value.buffer instanceof ArrayBuffer;
}

function sameArray(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/**
 * 정본 정점 ID의 연결과 공통 triangle table을 함께 고정한다.
 * 렌더 표면의 flat normal·기존 UV 분리를 새 atlas의 seam으로 강제하지 않는다.
 * 기존 UV·crease 유무와 관계없이 모든 원본 면 코너를 보존하도록 공통 표면에 명시한다.
 */
export function prepareStudioMeshUvAtlasProvenance(
  mesh: StudioEditableMesh,
): StudioMeshUvAtlasProvenancePrepared {
  const authority = validateStudioEditableMeshSerializableAuthority(mesh);
  if (!authority.ok) fail("invalid-source", `UV atlas 원본 정본이 올바르지 않습니다: ${authority.detail}`);
  const sourceHash = hashStudioEditableMesh(mesh);
  const topologyHash = hashStudioMeshUvTopology(mesh);
  const surface = planStudioMeshSurface(mesh, undefined, {
    allowCreaseMetadata: true,
    topologyPolicy: "editable",
    preserveFaceCorners: true,
  });
  if (!surface.ok) fail("invalid-surface", `UV atlas 공통 표면을 만들 수 없습니다: ${surface.issue.detail}`);
  const { geometry, triangles: surfaceTriangles } = surface.value;
  const renderVertexCount = geometry.positions.length / 3;
  if (!Number.isSafeInteger(renderVertexCount) || renderVertexCount === 0
    || renderVertexCount > geometry.indices.length
    || geometry.indices.length !== surfaceTriangles.length * 3
    || geometry.indices.length === 0 || geometry.indices.length % 3 !== 0
    || geometry.indices.length > mesh.halfEdges.length * 3
    || geometry.normals.length !== geometry.positions.length
    || geometry.outputSourceVertexIds.length !== renderVertexCount
    || geometry.triangleSourceFaceIds.length !== surfaceTriangles.length) {
    fail("invalid-surface", "UV atlas 공통 표면의 배열 크기와 삼각형 표가 일치하지 않습니다.");
  }
  const vertexCount = mesh.vertices.length;
  const positions = new Float32Array(vertexCount * 3);
  const inputSourceVertexIds = new Uint32Array(vertexCount);
  const inputIndexBySourceId = new Map<number, number>();
  for (let index = 0; index < vertexCount; index += 1) {
    const vertex = mesh.vertices[index];
    if (!vertex || !Number.isSafeInteger(vertex.id) || vertex.id < 0
      || vertex.id > 0xffff_ffff || inputIndexBySourceId.has(vertex.id)) {
      fail("invalid-source", "UV atlas 정본 정점 ID가 중복되었거나 범위를 벗어났습니다.");
    }
    inputIndexBySourceId.set(vertex.id, index);
    inputSourceVertexIds[index] = vertex.id;
    const values = [vertex.position.x, vertex.position.y, vertex.position.z];
    for (let axis = 0; axis < 3; axis += 1) {
      const value = values[axis];
      if (value === undefined || !Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
        fail("invalid-source", "UV atlas 원본 위치를 유한 Float32로 표현할 수 없습니다.");
      }
      positions[index * 3 + axis] = value;
    }
  }
  const indices = new Uint32Array(geometry.indices.length);
  for (let index = 0; index < renderVertexCount; index += 1) {
    const sourceVertexId = geometry.outputSourceVertexIds[index];
    const sourceVertex = sourceVertexId === undefined ? undefined : mesh.vertices[sourceVertexId];
    if (!sourceVertex || sourceVertex.id !== sourceVertexId) {
      fail("invalid-surface", "UV atlas 표면 정점에 대응하는 원본 ID가 없습니다.");
    }
    const expected = [sourceVertex.position.x, sourceVertex.position.y, sourceVertex.position.z];
    for (let axis = 0; axis < 3; axis += 1) {
      const offset = index * 3 + axis;
      const value = arrayValue(geometry.positions, offset);
      const sourceValue = expected[axis];
      const normal = arrayValue(geometry.normals, offset);
      if (sourceValue === undefined || value !== sourceValue
        || !Number.isFinite(Math.fround(value)) || !Number.isFinite(Math.fround(normal))) {
        fail("invalid-surface", "UV atlas 표면의 위치·법선이 원본 또는 유한 Float32와 다릅니다.");
      }
    }
  }
  const triangles: StudioMeshUvAtlasPreparedTriangle[] = [];
  const keys = new Set<string>();
  const coveredCorners = new Uint8Array(mesh.halfEdges.length);
  for (let index = 0; index < surfaceTriangles.length; index += 1) {
    const triangle = surfaceTriangles[index];
    if (!triangle || mesh.faces[triangle.faceId]?.id !== triangle.faceId
      || geometry.triangleSourceFaceIds[index] !== triangle.faceId) {
      fail("invalid-surface", "UV atlas 삼각형의 원본 면 ID가 일치하지 않습니다.");
    }
    const canonicalIndex = (corner: number): number => {
      const sourceId = tupleAt(triangle.vertexIds, corner);
      const value = inputIndexBySourceId.get(sourceId);
      if (value === undefined) fail("invalid-surface", "UV atlas 삼각형이 원본 정점 ID를 참조하지 않습니다.");
      return value;
    };
    const a = canonicalIndex(0);
    const b = canonicalIndex(1);
    const c = canonicalIndex(2);
    const inputVertexIndices = tuple(a, b, c);
    const key = orientedKey(inputVertexIndices);
    if (keys.has(key)) fail("ambiguous-triangle", "동일한 원본 정점 순서의 삼각형을 구별할 수 없습니다.");
    keys.add(key);
    for (let corner = 0; corner < 3; corner += 1) {
      const halfEdgeId = tupleAt(triangle.cornerHalfEdgeIds, corner);
      const edge = mesh.halfEdges[halfEdgeId];
      const origin = edge === undefined ? undefined : mesh.halfEdges[edge.prev]?.vertex;
      const inputVertex = tupleAt(inputVertexIndices, corner);
      const sourceVertexId = tupleAt(triangle.vertexIds, corner);
      const renderIndex = inputIndex(arrayValue(geometry.indices, index * 3 + corner), renderVertexCount);
      if (!Number.isSafeInteger(halfEdgeId) || halfEdgeId < 0
        || !edge || edge.id !== halfEdgeId || edge.face !== triangle.faceId
        || origin !== sourceVertexId
        || inputSourceVertexIds[inputVertex] !== sourceVertexId
        || geometry.outputSourceVertexIds[renderIndex] !== sourceVertexId) {
        fail("invalid-surface", "UV atlas 삼각형·원본 정점·면 코너의 대응이 일치하지 않습니다.");
      }
      coveredCorners[halfEdgeId] = 1;
      indices[index * 3 + corner] = inputVertex;
    }
    triangles.push(Object.freeze({
      faceId: triangle.faceId,
      inputVertexIndices,
      cornerHalfEdgeIds: tuple(...triangle.cornerHalfEdgeIds),
    }));
  }
  for (let corner = 0; corner < coveredCorners.length; corner += 1) {
    if (coveredCorners[corner] !== 1) {
      fail("corner-coverage", `UV atlas 삼각화에서 원본 코너 ${corner}가 생략되었습니다.`);
    }
  }
  if (hashStudioEditableMesh(mesh) !== sourceHash) fail("stale-source", "UV atlas 준비 중 원본 메시가 바뀌었습니다.");
  const prepared: StudioMeshUvAtlasProvenancePrepared = {
    sourceHash, topologyHash, positions, inputSourceVertexIds, useNormals: false,
    indices, triangles: Object.freeze(triangles),
  };
  return Object.freeze(prepared);
}

function samePrepared(
  actual: StudioMeshUvAtlasProvenancePrepared,
  expected: StudioMeshUvAtlasProvenancePrepared,
): boolean {
  if (actual.sourceHash !== expected.sourceHash || actual.topologyHash !== expected.topologyHash
    || actual.useNormals !== false || !ownedFloat32(actual.positions)
    || !ownedUint32(actual.inputSourceVertexIds) || !ownedUint32(actual.indices)
    || !sameArray(actual.positions, expected.positions)
    || !sameArray(actual.inputSourceVertexIds, expected.inputSourceVertexIds)
    || !sameArray(actual.indices, expected.indices)
    || !Array.isArray(actual.triangles)
    || actual.triangles.length !== expected.triangles.length) return false;
  for (let index = 0; index < expected.triangles.length; index += 1) {
    const left = actual.triangles[index];
    const right = expected.triangles[index];
    if (!left || !right || left.faceId !== right.faceId
      || !sameArray(left.inputVertexIndices, right.inputVertexIndices)
      || !sameArray(left.cornerHalfEdgeIds, right.cornerHalfEdgeIds)) return false;
  }
  return true;
}

function outputValue(values: ArrayLike<number>, index: number): number {
  const value = values[index];
  if (value === undefined || !Number.isFinite(value)) {
    fail("output-provenance-invalid", "UV atlas 출력 배열에 유한하지 않은 값 또는 누락이 있습니다.");
  }
  return value;
}

function outputIndex(value: number, vertexCount: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= vertexCount) {
    fail("output-provenance-invalid", "UV atlas 출력 정점 인덱스 또는 원본 대응표가 범위를 벗어났습니다.");
  }
  return value;
}

/**
 * 모든 출력 대응을 검증한 뒤 UV 레이어 한 개만 돌려준다. 입력 mesh나 배열을 수정하지 않는다.
 * 여러 atlas page와 polygon 내부 코너 분할은 현재 정본 표현으로 임의 축약하지 않는다.
 */
export function applyStudioMeshUvAtlasProvenance(
  mesh: StudioEditableMesh,
  prepared: StudioMeshUvAtlasProvenancePrepared,
  output: StudioMeshUvAtlasProvenanceOutput,
): StudioEditableMesh {
  if (hashStudioEditableMesh(mesh) !== prepared.sourceHash) {
    fail("stale-source", "UV atlas를 계산한 뒤 원본 메시가 바뀌었습니다.");
  }
  const verified = prepareStudioMeshUvAtlasProvenance(mesh);
  if (!samePrepared(prepared, verified)) {
    fail("prepared-mismatch", "UV atlas의 준비 배열 또는 원본 코너 대응표가 바뀌었습니다.");
  }
  if (output.atlasCount !== 1) {
    fail("atlas-page-unsupported", "현재 정본 UV 레이어에는 atlas page 한 개만 적용할 수 있습니다.");
  }
  if (output.uvSpace !== "canonical-v-up-normalized") {
    fail("uv-space-invalid", "정규화된 V-up UV로 명시적으로 변환한 atlas 결과가 필요합니다.");
  }
  if (!ownedFloat32(output.positions) || !ownedFloat32(output.uv)
    || !ownedUint32(output.indices) || !ownedUint32(output.originalInputVertexIndices)) {
    fail("output-shape-invalid", "UV atlas 출력은 소유한 Float32·Uint32 배열이어야 합니다.");
  }
  const outputVertexCount = output.positions.length / 3;
  if (!Number.isSafeInteger(outputVertexCount) || outputVertexCount <= 0
    || outputVertexCount > verified.positions.length / 3 + verified.indices.length
    || output.uv.length !== outputVertexCount * 2
    || output.originalInputVertexIndices.length !== outputVertexCount
    || output.indices.length !== verified.indices.length) {
    fail("output-shape-invalid", "UV atlas 출력 위치·UV·삼각형·원본 대응표의 크기가 올바르지 않습니다.");
  }
  const inputVertexCount = verified.positions.length / 3;
  for (let vertex = 0; vertex < outputVertexCount; vertex += 1) {
    const original = outputIndex(outputValue(output.originalInputVertexIndices, vertex), inputVertexCount);
    for (let axis = 0; axis < 3; axis += 1) {
      if (outputValue(output.positions, vertex * 3 + axis) !== verified.positions[original * 3 + axis]) {
        fail("output-provenance-invalid", "UV atlas 출력 위치가 명시된 원본 정점 위치와 다릅니다.");
      }
    }
    for (let axis = 0; axis < 2; axis += 1) {
      const value = outputValue(output.uv, vertex * 2 + axis);
      if (Math.fround(value) !== value || value < 0 || value > 1) {
        fail("uv-space-invalid", "UV atlas 좌표는 0 이상 1 이하의 유한 Float32여야 합니다.");
      }
    }
  }
  const lookup = new Map<string, number>();
  for (let index = 0; index < verified.triangles.length; index += 1) {
    const triangle = verified.triangles[index];
    if (!triangle) fail("invalid-surface", "UV atlas 준비 삼각형이 누락되었습니다.");
    const key = orientedKey(triangle.inputVertexIndices);
    if (lookup.has(key)) fail("ambiguous-triangle", "UV atlas 원본 삼각형을 유일하게 구별할 수 없습니다.");
    lookup.set(key, index);
  }
  const coveredTriangles = new Uint8Array(verified.triangles.length);
  const corners: Array<StudioMeshUvCorner | undefined> = new Array(mesh.halfEdges.length);
  for (let offset = 0; offset < output.indices.length; offset += 3) {
    const a = outputIndex(outputValue(output.indices, offset), outputVertexCount);
    const b = outputIndex(outputValue(output.indices, offset + 1), outputVertexCount);
    const c = outputIndex(outputValue(output.indices, offset + 2), outputVertexCount);
    const outputVertices = tuple(a, b, c);
    const originalVertices = tuple(
      outputValue(output.originalInputVertexIndices, a),
      outputValue(output.originalInputVertexIndices, b),
      outputValue(output.originalInputVertexIndices, c),
    );
    const index = lookup.get(orientedKey(originalVertices));
    if (index === undefined) fail("output-provenance-invalid", "UV atlas 출력에 원본에 없는 삼각형 또는 반대 방향 삼각형이 있습니다.");
    if (coveredTriangles[index] === 1) fail("triangle-coverage", "UV atlas 출력에서 같은 원본 삼각형을 두 번 사용했습니다.");
    const triangle = verified.triangles[index];
    if (!triangle) fail("invalid-surface", "UV atlas 원본 삼각형 대응이 누락되었습니다.");
    coveredTriangles[index] = 1;
    const rotation = triangle.inputVertexIndices[0] === originalVertices[0] ? 0
      : triangle.inputVertexIndices[1] === originalVertices[0] ? 1 : 2;
    for (let corner = 0; corner < 3; corner += 1) {
      const sourceCorner = (rotation + corner) % 3;
      if (tupleAt(triangle.inputVertexIndices, sourceCorner) !== tupleAt(originalVertices, corner)) {
        fail("output-provenance-invalid", "UV atlas 삼각형의 순환 정점 대응이 일치하지 않습니다.");
      }
      const halfEdgeId = tupleAt(triangle.cornerHalfEdgeIds, sourceCorner);
      const outputVertex = tupleAt(outputVertices, corner);
      const uValue = outputValue(output.uv, outputVertex * 2);
      const vValue = outputValue(output.uv, outputVertex * 2 + 1);
      const u = uValue === 0 ? 0 : uValue;
      const v = vValue === 0 ? 0 : vValue;
      const previous = corners[halfEdgeId];
      if (previous && (previous.u !== u || previous.v !== v)) {
        fail("corner-uv-conflict", `UV atlas가 원본 polygon 코너 ${halfEdgeId}를 서로 다른 UV로 분할했습니다.`);
      }
      corners[halfEdgeId] = { halfEdgeId, u, v };
    }
  }
  for (let index = 0; index < coveredTriangles.length; index += 1) {
    if (coveredTriangles[index] !== 1) fail("triangle-coverage", `UV atlas 출력에 원본 삼각형 ${index}가 없습니다.`);
  }
  const complete: StudioMeshUvCorner[] = [];
  for (let index = 0; index < corners.length; index += 1) {
    const corner = corners[index];
    if (!corner || corner.halfEdgeId !== index) fail("corner-coverage", `UV atlas 출력에 원본 코너 ${index}가 없습니다.`);
    complete.push(corner);
  }
  const uvLayer = decodeStudioMeshUvLayer({ revision: 1, topologyHash: verified.topologyHash, corners: complete }, mesh);
  if (hashStudioEditableMesh(mesh) !== verified.sourceHash) fail("stale-source", "UV atlas 적용 중 원본 메시가 바뀌었습니다.");
  return { ...mesh, uvLayer };
}
