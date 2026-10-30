/** 치유 Worker의 데이터 경계다. checksum·digest는 바이트/요청 결합이며 계산 실행의 독립 인증이 아니다. */
import { hashStudioEditableMesh, validateStudioEditableMeshSerializableAuthority, STUDIO_EDITABLE_MESH_LIMITS } from "../studio-editable-half-edge-mesh";
import { sha256HexPortable } from "../studio-sha256";
import { hasSupportedStudioCoplanarEdgeDissolveChannels } from "./studio-hybrid-dcc-coplanar-edge-dissolve-channels";
import {
  hasValidStudioHybridDccPackedMeshChecksums, isStudioHybridDccPackedMeshPayloadEnvelope,
  packStudioHybridDccGlbExportInput, unpackStudioHybridDccGlbExportInput,
  type StudioHybridDccPackedMeshPayload,
} from "./studio-hybrid-dcc-glb-export-packed-mesh";

import type { StudioCoplanarEdgeDissolveSource, StudioCoplanarEdgeDissolveRequest, StudioCoplanarEdgeDissolveResult } from "./studio-hybrid-dcc-coplanar-edge-dissolve";

type Success = Extract<StudioCoplanarEdgeDissolveResult, { readonly ok: true }>;
type Refusal = Exclude<StudioCoplanarEdgeDissolveResult, { readonly ok: true }>;
export interface StudioCoplanarEdgeDissolveWorkerScope {
  readonly assetId: string;
  readonly generation: number;
}
export interface StudioCoplanarEdgeDissolveWorkerRequest {
  readonly version: 1;
  readonly kind: "coplanar-edge-dissolve";
  readonly requestId: number;
  readonly generation: number;
  readonly requestDigest: string;
  readonly payload: StudioHybridDccPackedMeshPayload;
  readonly request: StudioCoplanarEdgeDissolveRequest;
}
interface Scope extends StudioCoplanarEdgeDissolveWorkerScope {
  readonly requestId: number;
  readonly requestDigest: string;
  readonly sourceMeshHash: string;
  readonly sourceMeshRevision: number;
}
interface PackedResult {
  readonly ok: true;
  readonly payload: StudioHybridDccPackedMeshPayload;
  readonly resultMeshHash: string;
  readonly sourceFaceIds: Success["sourceFaceIds"];
  readonly mergedFaceId: number;
  readonly removedHalfEdgeIds: Success["removedHalfEdgeIds"];
  readonly vertexRemap: Success["vertexRemap"];
  readonly faceRemap: Success["faceRemap"];
  readonly halfEdgeRemap: Success["halfEdgeRemap"];
}
export type StudioCoplanarEdgeDissolveWorkerResponse =
  | (Scope & { readonly version: 1; readonly kind: "result"; readonly result: PackedResult | Refusal })
  | { readonly version: 1; readonly kind: "error"; readonly requestId: number; readonly generation: number;
      readonly requestDigest: string; readonly code: "protocol" | "compute-failed" };
export interface StudioCoplanarEdgeDissolveWorkerExpected extends Scope {
  readonly counts: { readonly vertices: number; readonly halfEdges: number; readonly faces: number };
}
const FAILURE_CODES = new Set<Refusal["code"]>(["invalid-source", "stale-source", "invalid-selection", "non-manifold",
  "non-coplanar", "unselected-seam", "unsupported-boundary", "attribute-conflict", "unsupported-uv",
  "unsupported-normal-field", "unrenderable-source", "unrenderable-result", "budget-exceeded", "invalid-result"]);
function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && own.every((key) => {
    if (typeof key !== "string" || !keys.includes(key)) return false;
    const property = Object.getOwnPropertyDescriptor(value, key);
    return property?.enumerable === true && Object.hasOwn(property, "value");
  });
}
function list(value: unknown, maximum: number): value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) return false;
  if (Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index++) {
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    if (!property?.enumerable || !Object.hasOwn(property, "value")) return false;
  }
  return true;
}
function uint(value: unknown, minimum = 0): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum; }
function text(value: unknown, maximum = 160): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum; }
function digest(value: unknown): value is string { return typeof value === "string" && /^coplanar-edge-request:sha256:[0-9a-f]{64}$/u.test(value); }
function ids(value: unknown, maximum: number, minimum = 0): value is readonly number[] {
  return list(value, maximum) && value.length >= minimum && value.every((id) => uint(id));
}
/** manifest getter를 codec 전에 차단한다. native ArrayBuffer만 허용하며 추가 own property도 받지 않는다. */
function plainTree(value: unknown, depth = 0, seen = new Set<object>()): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 4096;
  if (typeof value === "boolean" || value === null) return true;
  if (value instanceof ArrayBuffer) return Object.getPrototypeOf(value) === ArrayBuffer.prototype && Reflect.ownKeys(value).length === 0;
  if (typeof value !== "object" || depth > 8 || seen.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value); if (keys.length > 64) return false;
  seen.add(value);
  for (const key of keys) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !property?.enumerable || !Object.hasOwn(property, "value") || !plainTree(property.value, depth + 1, seen)) return false;
  }
  seen.delete(value); return true;
}
function packed(value: unknown): value is StudioHybridDccPackedMeshPayload {
  return plainTree(value) && isStudioHybridDccPackedMeshPayloadEnvelope(value)
    && value.manifest.toonMaterials === undefined && value.manifest.toonMaterialsHash === undefined
    && hasValidStudioHybridDccPackedMeshChecksums(value);
}
function request(value: unknown): value is StudioCoplanarEdgeDissolveRequest {
  return record(value, ["sourceMeshHash", "sourceMeshRevision", "halfEdgeIds"])
    && text(value.sourceMeshHash) && uint(value.sourceMeshRevision, 1) && ids(value.halfEdgeIds, STUDIO_EDITABLE_MESH_LIMITS.maxSelection, 1);
}
function requestDigest(requestId: number, generation: number, assetId: string, input: StudioCoplanarEdgeDissolveRequest): string {
  const canonical = JSON.stringify([1, "coplanar-edge-dissolve", requestId, generation, assetId, input.sourceMeshHash, input.sourceMeshRevision, input.halfEdgeIds]);
  return `coplanar-edge-request:sha256:${sha256HexPortable(new TextEncoder().encode(canonical))}`;
}
export function isStudioCoplanarEdgeDissolveWorkerRequest(value: unknown): value is StudioCoplanarEdgeDissolveWorkerRequest {
  try {
    if (!(record(value, ["version", "kind", "requestId", "generation", "requestDigest", "payload", "request"])
      && value.version === 1 && value.kind === "coplanar-edge-dissolve" && uint(value.requestId, 1) && uint(value.generation)
      && digest(value.requestDigest) && packed(value.payload) && request(value.request))) return false;
    const manifest = value.payload.manifest;
    return manifest.sourceHash === value.request.sourceMeshHash && manifest.sourceRevision === value.request.sourceMeshRevision
      && value.request.halfEdgeIds.every((id) => id < manifest.counts.halfEdges)
      && value.requestDigest === requestDigest(value.requestId, value.generation, manifest.assetId, value.request);
  } catch { return false; }
}
function remap(value: unknown, sourceKey: string, targetKey: string, maximum: number, minimum: number): boolean {
  return list(value, maximum) && value.every((entry) => record(entry, [sourceKey, targetKey])
    && uint(entry[sourceKey]) && ids(entry[targetKey], 1, minimum));
}
function result(value: unknown): value is PackedResult | Refusal {
  if (record(value, ["ok", "code", "detail"])) return value.ok === false && typeof value.code === "string"
    && [...FAILURE_CODES].some((code) => code === value.code) && text(value.detail, 4096);
  return record(value, ["ok", "payload", "resultMeshHash", "sourceFaceIds", "mergedFaceId", "removedHalfEdgeIds", "vertexRemap", "faceRemap", "halfEdgeRemap"])
    && value.ok === true && packed(value.payload) && text(value.resultMeshHash)
    && ids(value.sourceFaceIds, 2, 2) && value.sourceFaceIds[0] < value.sourceFaceIds[1]
    && uint(value.mergedFaceId) && ids(value.removedHalfEdgeIds, STUDIO_EDITABLE_MESH_LIMITS.maxEdges * 2, 2)
    && value.removedHalfEdgeIds.length % 2 === 0
    && value.removedHalfEdgeIds.every((id, index, all) => index === 0 || id > all[index - 1])
    && remap(value.vertexRemap, "sourceVertexId", "resultVertexIds", STUDIO_EDITABLE_MESH_LIMITS.maxVertices, 1)
    && remap(value.faceRemap, "sourceFaceId", "resultFaceIds", STUDIO_EDITABLE_MESH_LIMITS.maxFaces, 1)
    && remap(value.halfEdgeRemap, "sourceHalfEdgeId", "resultHalfEdgeIds", STUDIO_EDITABLE_MESH_LIMITS.maxEdges * 2, 0);
}
export function isStudioCoplanarEdgeDissolveWorkerResponse(value: unknown): value is StudioCoplanarEdgeDissolveWorkerResponse {
  try {
    if (record(value, ["version", "kind", "requestId", "generation", "requestDigest", "code"])) return value.version === 1 && value.kind === "error"
      && uint(value.requestId, 1) && uint(value.generation) && digest(value.requestDigest) && (value.code === "protocol" || value.code === "compute-failed");
    return record(value, ["version", "kind", "requestId", "generation", "requestDigest", "assetId", "sourceMeshHash", "sourceMeshRevision", "result"])
      && value.version === 1 && value.kind === "result" && uint(value.requestId, 1) && uint(value.generation)
      && digest(value.requestDigest) && text(value.assetId) && text(value.sourceMeshHash) && uint(value.sourceMeshRevision, 1) && result(value.result);
  } catch { return false; }
}
export function createStudioCoplanarEdgeDissolveWorkerRequest(source: StudioCoplanarEdgeDissolveSource, input: StudioCoplanarEdgeDissolveRequest,
  scope: StudioCoplanarEdgeDissolveWorkerScope, requestId: number): StudioCoplanarEdgeDissolveWorkerRequest | null {
  try {
    if (!uint(requestId, 1) || !uint(scope.generation) || !text(scope.assetId) || !request(input)
      || !hasSupportedStudioCoplanarEdgeDissolveChannels(source.mesh)
      || !validateStudioEditableMeshSerializableAuthority(source.mesh).ok || hashStudioEditableMesh(source.mesh) !== source.meshHash
      || source.meshHash !== input.sourceMeshHash || source.meshRevision !== input.sourceMeshRevision) return null;
    const copied = Object.freeze({ sourceMeshHash: input.sourceMeshHash, sourceMeshRevision: input.sourceMeshRevision,
      halfEdgeIds: Object.freeze([...input.halfEdgeIds]) });
    const value: StudioCoplanarEdgeDissolveWorkerRequest = { version: 1, kind: "coplanar-edge-dissolve", requestId, generation: scope.generation,
      requestDigest: requestDigest(requestId, scope.generation, scope.assetId, copied), request: copied,
      payload: packStudioHybridDccGlbExportInput({ assetId: scope.assetId, mesh: source.mesh, sourceRevision: source.meshRevision, sourceHash: source.meshHash }) };
    return isStudioCoplanarEdgeDissolveWorkerRequest(value) ? value : null;
  } catch { return null; }
}
export function captureStudioCoplanarEdgeDissolveWorkerScope(value: StudioCoplanarEdgeDissolveWorkerRequest): StudioCoplanarEdgeDissolveWorkerExpected {
  const manifest = value.payload.manifest;
  return Object.freeze({ requestId: value.requestId, generation: value.generation, requestDigest: value.requestDigest,
    assetId: manifest.assetId, sourceMeshHash: manifest.sourceHash, sourceMeshRevision: manifest.sourceRevision,
    counts: Object.freeze({ ...manifest.counts }) });
}
export function createStudioCoplanarEdgeDissolveWorkerResponse(value: StudioCoplanarEdgeDissolveWorkerRequest,
  computed: StudioCoplanarEdgeDissolveResult): StudioCoplanarEdgeDissolveWorkerResponse {
  const captured = captureStudioCoplanarEdgeDissolveWorkerScope(value);
  const scope = { version: 1, kind: "result", requestId: captured.requestId, generation: captured.generation,
    requestDigest: captured.requestDigest, assetId: captured.assetId, sourceMeshHash: captured.sourceMeshHash, sourceMeshRevision: captured.sourceMeshRevision } satisfies Scope & { readonly version: 1; readonly kind: "result" };
  if (!computed.ok) return { ...scope, result: { ok: false, code: computed.code, detail: computed.detail } };
  if (!hasSupportedStudioCoplanarEdgeDissolveChannels(computed.mesh)) throw new Error("치유로 보존할 수 없는 추가 메시 채널이 있습니다.");
  const resultMeshHash = hashStudioEditableMesh(computed.mesh);
  if (computed.sourceMeshHash !== scope.sourceMeshHash || computed.sourceMeshRevision !== scope.sourceMeshRevision || computed.resultMeshHash !== resultMeshHash) throw new Error("치유 계산 결과의 원본 또는 결과 hash가 다릅니다.");
  return { ...scope, result: { ok: true, resultMeshHash,
    payload: packStudioHybridDccGlbExportInput({ assetId: scope.assetId, mesh: computed.mesh, sourceRevision: scope.sourceMeshRevision, sourceHash: resultMeshHash }),
    sourceFaceIds: [computed.sourceFaceIds[0], computed.sourceFaceIds[1]], mergedFaceId: computed.mergedFaceId,
    removedHalfEdgeIds: [...computed.removedHalfEdgeIds],
    vertexRemap: computed.vertexRemap.map((entry) => ({ sourceVertexId: entry.sourceVertexId, resultVertexIds: [...entry.resultVertexIds] })),
    faceRemap: computed.faceRemap.map((entry) => ({ sourceFaceId: entry.sourceFaceId, resultFaceIds: [...entry.resultFaceIds] })),
    halfEdgeRemap: computed.halfEdgeRemap.map((entry) => ({ sourceHalfEdgeId: entry.sourceHalfEdgeId, resultHalfEdgeIds: [...entry.resultHalfEdgeIds] })),
  } };
}
/** 기본 수량·정본·바이트를 복원한다. 전체 remap·속성 admission과 private plan 발급은 작업공간이 소유한다. */
export function restoreStudioCoplanarEdgeDissolveWorkerResult(response: StudioCoplanarEdgeDissolveWorkerResponse,
  expected: StudioCoplanarEdgeDissolveWorkerExpected): StudioCoplanarEdgeDissolveResult | null {
  if (response.kind !== "result" || response.requestId !== expected.requestId || response.generation !== expected.generation
    || response.requestDigest !== expected.requestDigest || response.assetId !== expected.assetId
    || response.sourceMeshHash !== expected.sourceMeshHash || response.sourceMeshRevision !== expected.sourceMeshRevision) return null;
  if (!response.result.ok) return response.result;
  const value = response.result, unpacked = unpackStudioHybridDccGlbExportInput(value.payload);
  if (!unpacked || unpacked.assetId !== expected.assetId || unpacked.sourceRevision !== expected.sourceMeshRevision
    || unpacked.sourceHash !== value.resultMeshHash || value.resultMeshHash === expected.sourceMeshHash
    || !validateStudioEditableMeshSerializableAuthority(unpacked.mesh).ok || hashStudioEditableMesh(unpacked.mesh) !== value.resultMeshHash) return null;
  const mesh = unpacked.mesh, counts = expected.counts;
  if (mesh.vertices.length !== counts.vertices || mesh.faces.length !== counts.faces - 1
    || mesh.halfEdges.length !== counts.halfEdges - value.removedHalfEdgeIds.length
    || value.sourceFaceIds.some((id) => id >= counts.faces) || value.mergedFaceId >= mesh.faces.length
    || value.removedHalfEdgeIds.some((id) => id >= counts.halfEdges)
    || value.vertexRemap.length !== counts.vertices || value.faceRemap.length !== counts.faces || value.halfEdgeRemap.length !== counts.halfEdges
    || value.vertexRemap.some((entry, index) => entry.sourceVertexId !== index || entry.resultVertexIds.some((id) => id >= mesh.vertices.length))
    || value.faceRemap.some((entry, index) => entry.sourceFaceId !== index || entry.resultFaceIds.some((id) => id >= mesh.faces.length))
    || value.halfEdgeRemap.some((entry, index) => entry.sourceHalfEdgeId !== index || entry.resultHalfEdgeIds.some((id) => id >= mesh.halfEdges.length))) return null;
  return { ok: true, mesh, sourceMeshHash: expected.sourceMeshHash, sourceMeshRevision: expected.sourceMeshRevision,
    resultMeshHash: value.resultMeshHash, sourceFaceIds: value.sourceFaceIds, mergedFaceId: value.mergedFaceId,
    removedHalfEdgeIds: value.removedHalfEdgeIds, vertexRemap: value.vertexRemap, faceRemap: value.faceRemap, halfEdgeRemap: value.halfEdgeRemap };
}
