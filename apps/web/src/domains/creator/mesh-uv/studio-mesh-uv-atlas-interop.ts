/**
 * 미통합 연결 초안: 정본 코너 계획과 provider v2의 mesh-local 원본 대응을 연결한다.
 * 실제 WASM UV 축의 판정은 호출자가 해야 하며 이 모듈은 기본 축이나 검증 표시를 만들지 않는다.
 */
import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import type {
  StudioXAtlasUvArtifact,
  StudioXAtlasUvChartOptions,
  StudioXAtlasUvMeshRange,
  StudioXAtlasUvOptions,
  StudioXAtlasUvRequest,
} from "../xatlas-uv/studio-xatlas-uv-provider";

import {
  applyStudioMeshUvAtlasProvenance,
  type StudioMeshUvAtlasProvenancePrepared,
} from "./studio-mesh-uv-atlas-provenance";

export type StudioMeshUvAtlasInteropOptions = Omit<StudioXAtlasUvOptions, "useNormals" | "chart"> & {
  readonly chart?: Omit<StudioXAtlasUvChartOptions, "fixWinding" | "useInputMeshUvs">;
};
export type StudioMeshUvAtlasInteropUvBasis = "v-up" | "v-down";
export type StudioMeshUvAtlasInteropErrorCode =
  | "invalid-request"
  | "policy-override"
  | "invalid-artifact"
  | "mesh-id-ambiguous"
  | "mesh-range-invalid"
  | "uv-basis-invalid";

export class StudioMeshUvAtlasInteropError extends Error {
  constructor(readonly code: StudioMeshUvAtlasInteropErrorCode, message: string) {
    super(message);
    this.name = "StudioMeshUvAtlasInteropError";
  }
}

function fail(code: StudioMeshUvAtlasInteropErrorCode, message: string): never {
  throw new StudioMeshUvAtlasInteropError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeCount(value: number, minimum = 0): boolean {
  return Number.isSafeInteger(value) && value >= minimum;
}

/** provider v2와 같은 식별자 code unit 경계를 확인한다. */
function validAssetId(value: string): boolean {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && value.trim() === value;
}

function dataKeys(value: object, allowed: readonly string[], policy: readonly string[]): void {
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail("invalid-request", "UV atlas 옵션에는 문자열 키만 사용할 수 있습니다.");
    if (policy.includes(key)) fail("policy-override", "UV atlas의 정본 연결 정책은 변경할 수 없습니다.");
    if (!allowed.includes(key)) fail("invalid-request", `알 수 없는 UV atlas 옵션 ${key}가 있습니다.`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      fail("invalid-request", "UV atlas 옵션은 열거 가능한 일반 데이터여야 합니다.");
    }
  }
}

function finiteOption(value: number | undefined, label: string, minimum: number, integer: boolean): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum
    || (integer && !Number.isSafeInteger(value))) {
    fail("invalid-request", `${label} 옵션 값이 올바르지 않습니다.`);
  }
}

function requestOptions(options?: StudioMeshUvAtlasInteropOptions): StudioXAtlasUvOptions {
  if (options !== undefined && !isRecord(options)) fail("invalid-request", "UV atlas pack 옵션은 일반 객체여야 합니다.");
  if (options !== undefined) {
    dataKeys(options, ["resolution", "padding", "rotateCharts", "texelsPerUnit", "chart"], ["useNormals"]);
    finiteOption(options.resolution, "해상도", 1, true);
    finiteOption(options.padding, "여백", 0, true);
    finiteOption(options.texelsPerUnit, "텍셀 밀도", Number.MIN_VALUE, false);
    if (options.rotateCharts !== undefined && typeof options.rotateCharts !== "boolean") {
      fail("invalid-request", "UV atlas 회전 옵션은 boolean이어야 합니다.");
    }
  }
  const chart = options?.chart;
  if (chart !== undefined) {
    if (!isRecord(chart)) fail("invalid-request", "UV atlas chart 옵션은 일반 객체여야 합니다.");
    dataKeys(chart, [
      "maxBoundaryLength", "maxChartArea", "maxCost", "maxIterations", "normalDeviationWeight",
      "normalSeamWeight", "roundnessWeight", "straightnessWeight", "textureSeamWeight",
    ], ["fixWinding", "useInputMeshUvs"]);
    finiteOption(chart.maxIterations, "chart 반복 수", 0, true);
    for (const value of [chart.maxBoundaryLength, chart.maxChartArea, chart.maxCost,
      chart.normalDeviationWeight, chart.normalSeamWeight, chart.roundnessWeight,
      chart.straightnessWeight, chart.textureSeamWeight]) finiteOption(value, "chart 가중치", 0, false);
  }
  return Object.freeze({
    ...(options ?? {}),
    useNormals: false,
    chart: Object.freeze({ ...(chart ?? {}), fixWinding: false, useInputMeshUvs: false }),
  });
}

/**
 * prepared 메타데이터를 mesh에 펼치지 않는다. provider/client가 기존 계약대로 입력을 복사한다.
 * 이 함수는 buffer를 전송하거나 detach하지 않으며 provider의 나머지 예산 검증을 대체하지 않는다.
 */
export function createStudioMeshUvAtlasInteropRequest(
  assetId: string,
  prepared: StudioMeshUvAtlasProvenancePrepared,
  requestEpoch: number,
  documentEpoch: number,
  options?: StudioMeshUvAtlasInteropOptions,
): StudioXAtlasUvRequest {
  if (!validAssetId(assetId) || !safeCount(requestEpoch) || !safeCount(documentEpoch)) {
    fail("invalid-request", "UV atlas 자산 ID와 요청·문서 epoch를 확인하세요.");
  }
  if (prepared.useNormals !== false) fail("policy-override", "정본 UV atlas 입력에는 렌더 법선을 강제하지 않습니다.");
  if (!(prepared.positions instanceof Float32Array) || !(prepared.positions.buffer instanceof ArrayBuffer)
    || !(prepared.indices instanceof Uint32Array) || !(prepared.indices.buffer instanceof ArrayBuffer)
    || prepared.positions.length === 0 || prepared.positions.length % 3 !== 0
    || prepared.indices.length === 0 || prepared.indices.length % 3 !== 0) {
    fail("invalid-request", "UV atlas 준비 위치·삼각형 배열이 올바르지 않습니다.");
  }
  const normalizedOptions = requestOptions(options);
  return {
    operation: "unwrap-atlas",
    requestEpoch,
    documentEpoch,
    meshes: [{ id: assetId, positions: prepared.positions, indices: prepared.indices }],
    options: normalizedOptions,
  };
}

function selectedRange(artifact: StudioXAtlasUvArtifact, assetId: string): StudioXAtlasUvMeshRange {
  if (!Array.isArray(artifact.meshes) || artifact.meshes.length === 0) {
    fail("invalid-artifact", "UV atlas 결과의 mesh 범위가 없습니다.");
  }
  const vertexCount = artifact.positions.length / 3;
  const ids = new Set<string>();
  let vertexOffset = 0;
  let indexOffset = 0;
  let selected: StudioXAtlasUvMeshRange | undefined;
  for (const range of artifact.meshes) {
    if (typeof range !== "object" || range === null || !validAssetId(range.id)) {
      fail("mesh-range-invalid", "UV atlas 결과의 mesh ID가 올바르지 않습니다.");
    }
    if (ids.has(range.id)) fail("mesh-id-ambiguous", "UV atlas 결과에 같은 mesh ID가 두 번 있습니다.");
    ids.add(range.id);
    if (!safeCount(range.sourceVertexCount, 1) || !safeCount(range.vertexOffset)
      || !safeCount(range.vertexCount, 1) || !safeCount(range.indexOffset)
      || !safeCount(range.indexCount, 1) || range.indexCount % 3 !== 0
      || range.vertexOffset !== vertexOffset || range.indexOffset !== indexOffset
      || !Number.isSafeInteger(range.vertexOffset + range.vertexCount)
      || !Number.isSafeInteger(range.indexOffset + range.indexCount)
      || range.vertexOffset + range.vertexCount > vertexCount
      || range.indexOffset + range.indexCount > artifact.indices.length) {
      fail("mesh-range-invalid", "UV atlas 결과의 mesh 범위가 겹치거나 배열 범위를 벗어났습니다.");
    }
    if (!Array.isArray(range.atlasSegments)) fail("mesh-range-invalid", "UV atlas page 범위 형식이 올바르지 않습니다.");
    for (const segment of range.atlasSegments) {
      if (typeof segment !== "object" || segment === null || !safeCount(segment.indexOffset)
        || !safeCount(segment.indexCount, 1) || !safeCount(segment.atlasIndex)
        || !Number.isSafeInteger(segment.indexOffset + segment.indexCount)
        || segment.indexOffset < range.indexOffset
        || segment.indexOffset + segment.indexCount > range.indexOffset + range.indexCount
        || segment.atlasIndex >= artifact.atlas.count) {
        fail("mesh-range-invalid", "UV atlas 결과의 page segment 범위가 올바르지 않습니다.");
      }
    }
    if (range.id === assetId) selected = range;
    vertexOffset += range.vertexCount;
    indexOffset += range.indexCount;
  }
  if (vertexOffset !== vertexCount || indexOffset !== artifact.indices.length) {
    fail("mesh-range-invalid", "UV atlas 결과 배열을 덮지 않는 mesh 범위가 있습니다.");
  }
  if (!selected) fail("mesh-range-invalid", "UV atlas 결과에 요청한 자산 ID가 없습니다.");
  return selected;
}

function finiteOutput(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || Math.fround(value) !== value) {
    fail("invalid-artifact", "UV atlas 결과에는 유한 Float32 값만 사용할 수 있습니다.");
  }
  return value;
}

/** 선택 range의 global 출력 인덱스만 local화하고 원본 대응표 값은 그대로 유지한다. */
export function applyStudioMeshUvAtlasInteropArtifact(
  mesh: StudioEditableMesh,
  prepared: StudioMeshUvAtlasProvenancePrepared,
  artifact: StudioXAtlasUvArtifact,
  assetId: string,
  uvBasis: StudioMeshUvAtlasInteropUvBasis,
): StudioEditableMesh {
  if (uvBasis !== "v-up" && uvBasis !== "v-down") {
    fail("uv-basis-invalid", "실제 provider UV의 V축 방향을 명시해야 합니다.");
  }
  if (!validAssetId(assetId) || artifact.kind !== "studio-xatlas-uv-atlas" || artifact.version !== 2
    || !(artifact.positions instanceof Float32Array) || !(artifact.positions.buffer instanceof ArrayBuffer)
    || !(artifact.uv instanceof Float32Array) || !(artifact.uv.buffer instanceof ArrayBuffer)
    || !(artifact.indices instanceof Uint32Array) || !(artifact.indices.buffer instanceof ArrayBuffer)
    || !(artifact.originalInputVertexIndices instanceof Uint32Array)
    || !(artifact.originalInputVertexIndices.buffer instanceof ArrayBuffer)
    || artifact.positions.length === 0 || artifact.positions.length % 3 !== 0
    || artifact.uv.length !== artifact.positions.length / 3 * 2
    || artifact.originalInputVertexIndices.length !== artifact.positions.length / 3
    || artifact.indices.length === 0 || artifact.indices.length % 3 !== 0
    || !artifact.atlas || !safeCount(artifact.atlas.width, 1) || !safeCount(artifact.atlas.height, 1)
    || !safeCount(artifact.atlas.count, 1) || !Number.isFinite(artifact.atlas.texelsPerUnit)
    || artifact.atlas.texelsPerUnit <= 0) {
    fail("invalid-artifact", "원본 정점 대응을 포함한 provider v2 UV atlas 결과가 필요합니다.");
  }
  const range = selectedRange(artifact, assetId);
  if (range.sourceVertexCount !== prepared.positions.length / 3
    || range.indexCount !== prepared.indices.length
    || range.vertexCount > prepared.positions.length / 3 + prepared.indices.length) {
    fail("mesh-range-invalid", "UV atlas 선택 범위가 준비한 원본 정점·삼각형 수와 다릅니다.");
  }
  const positions = new Float32Array(range.vertexCount * 3);
  const uv = new Float32Array(range.vertexCount * 2);
  const indices = new Uint32Array(range.indexCount);
  const originalInputVertexIndices = new Uint32Array(range.vertexCount);
  for (let vertex = 0; vertex < range.vertexCount; vertex += 1) {
    const source = artifact.originalInputVertexIndices[range.vertexOffset + vertex];
    if (source === undefined || !safeCount(source) || source >= range.sourceVertexCount) {
      fail("mesh-range-invalid", "UV atlas 선택 범위의 원본 대응표가 local 정점 범위를 벗어났습니다.");
    }
    originalInputVertexIndices[vertex] = source;
    for (let axis = 0; axis < 3; axis += 1) {
      positions[vertex * 3 + axis] = finiteOutput(artifact.positions[(range.vertexOffset + vertex) * 3 + axis]);
    }
    const uValue = finiteOutput(artifact.uv[(range.vertexOffset + vertex) * 2]);
    const vValue = finiteOutput(artifact.uv[(range.vertexOffset + vertex) * 2 + 1]);
    if (uValue < 0 || uValue > 1 || vValue < 0 || vValue > 1) {
      fail("invalid-artifact", "UV atlas 좌표가 정규화된 0 이상 1 이하 범위를 벗어났습니다.");
    }
    uv[vertex * 2] = uValue;
    uv[vertex * 2 + 1] = uvBasis === "v-down" ? Math.fround(1 - vValue) : vValue;
  }
  for (let offset = 0; offset < range.indexCount; offset += 1) {
    const index = artifact.indices[range.indexOffset + offset];
    if (index === undefined || !safeCount(index) || index < range.vertexOffset
      || index >= range.vertexOffset + range.vertexCount) {
      fail("mesh-range-invalid", "UV atlas 삼각형이 선택한 mesh의 정점 범위를 벗어났습니다.");
    }
    indices[offset] = index - range.vertexOffset;
  }
  return applyStudioMeshUvAtlasProvenance(mesh, prepared, {
    uvSpace: "canonical-v-up-normalized",
    atlasCount: artifact.atlas.count,
    positions,
    uv,
    indices,
    originalInputVertexIndices,
  });
}
