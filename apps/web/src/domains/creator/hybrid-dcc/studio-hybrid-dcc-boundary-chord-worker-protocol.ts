/** 경계 chord 전용 Worker DTO. 기존 f64/UV packed codec과 원본 전체 대응을 재검증한다. */
import { hashStudioEditableMesh, validateStudioEditableMeshSerializableAuthority, STUDIO_EDITABLE_MESH_LIMITS, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import {
  hasValidStudioHybridDccPackedMeshChecksums, isStudioHybridDccPackedMeshPayloadEnvelope,
  packStudioHybridDccGlbExportInput, unpackStudioHybridDccGlbExportInput,
  type StudioHybridDccPackedMeshPayload,
} from "./studio-hybrid-dcc-glb-export-packed-mesh";
import type { StudioBoundaryChordAnchor, StudioBoundaryChordRequest } from "./studio-hybrid-dcc-boundary-chord";
import type { StudioBoundaryChordUvResult } from "./studio-hybrid-dcc-boundary-chord-uv";

export const STUDIO_BOUNDARY_CHORD_WORKER_VERSION = 1;
type Success = Extract<StudioBoundaryChordUvResult, { readonly ok: true }>;
type Refusal = Exclude<StudioBoundaryChordUvResult, { readonly ok: true }>;
export interface StudioBoundaryChordWorkerInput {
  readonly assetId: string;
  readonly mesh: StudioEditableMesh;
  readonly meshHash: string;
  readonly meshRevision: number;
  readonly generation: number;
  readonly request: StudioBoundaryChordRequest;
}
export interface StudioBoundaryChordWorkerRequest {
  readonly version: 1;
  readonly kind: "boundary-chord";
  readonly requestId: number;
  readonly generation: number;
  readonly payload: StudioHybridDccPackedMeshPayload;
  readonly request: StudioBoundaryChordRequest;
}
interface Scope {
  readonly requestId: number;
  readonly generation: number;
  readonly assetId: string;
  readonly sourceMeshHash: string;
  readonly sourceMeshRevision: number;
}
interface PackedResult {
  readonly ok: true;
  readonly payload: StudioHybridDccPackedMeshPayload;
  readonly resultMeshHash: string;
  readonly selectionFaceIds: Success["selectionFaceIds"];
  readonly faceRemap: Success["faceRemap"];
  readonly halfEdgeRemap: Success["halfEdgeRemap"];
  readonly addedVertexIds: Success["addedVertexIds"];
}
export type StudioBoundaryChordWorkerResponse =
  | (Scope & { readonly version: 1; readonly kind: "result"; readonly result: PackedResult | Refusal })
  | { readonly version: 1; readonly kind: "error"; readonly requestId: number; readonly generation: number; readonly code: "protocol" | "compute-failed" };

const FAILURE_CODES = new Set<Refusal["code"]>(["invalid-source", "stale-source", "unsupported-uv", "unsupported-source", "unsupported-face",
  "invalid-anchor", "degenerate-chord", "budget-exceeded", "invalid-result", "unsupported-uv-mapping", "unsupported-uv-precision"]);
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
    if (!property || !property.enumerable || !Object.hasOwn(property, "value")) return false;
  }
  return true;
}
function uint(value: unknown, minimum = 0): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum; }
function text(value: unknown, maximum = 160): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum; }
function ids(value: unknown, maximum: number): value is readonly number[] {
  if (!list(value, maximum)) return false;
  for (const id of value) if (!uint(id)) return false;
  return true;
}
/** packed manifest는 작은 일반 데이터 트리다. 검사 전에 getter·cycle을 실행하지 않는다. */
function plainTree(value: unknown, depth = 0, seen = new Set<object>()): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= 4096;
  if (typeof value === "boolean" || value === null || value instanceof ArrayBuffer) return true;
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
function anchor(value: unknown): value is StudioBoundaryChordAnchor {
  return (record(value, ["kind", "vertexId"]) && value.kind === "vertex" && uint(value.vertexId))
    || (record(value, ["kind", "halfEdgeId", "t"]) && value.kind === "edge" && uint(value.halfEdgeId)
      && typeof value.t === "number" && Number.isFinite(value.t) && value.t >= 0 && value.t <= 1);
}
function chordRequest(value: unknown): value is StudioBoundaryChordRequest {
  return record(value, ["sourceMeshHash", "sourceMeshRevision", "faceId", "start", "end"])
    && text(value.sourceMeshHash) && uint(value.sourceMeshRevision, 1) && uint(value.faceId) && anchor(value.start) && anchor(value.end);
}
export function isStudioBoundaryChordWorkerRequest(value: unknown): value is StudioBoundaryChordWorkerRequest {
  try {
    return record(value, ["version", "kind", "requestId", "generation", "payload", "request"])
      && value.version === 1 && value.kind === "boundary-chord" && uint(value.requestId, 1) && uint(value.generation, 1)
      && packed(value.payload) && chordRequest(value.request)
      && value.payload.manifest.sourceHash === value.request.sourceMeshHash
      && value.payload.manifest.sourceRevision === value.request.sourceMeshRevision;
  } catch { return false; }
}
function remap(value: unknown, sourceKey: "sourceFaceId" | "sourceHalfEdgeId", targetKey: "resultFaceIds" | "resultHalfEdgeIds", maximum: number): boolean {
  if (!list(value, maximum)) return false;
  for (const entry of value) if (!record(entry, [sourceKey, targetKey]) || !uint(entry[sourceKey]) || !ids(entry[targetKey], 2)) return false;
  return true;
}
function result(value: unknown): value is PackedResult | Refusal {
  if (record(value, ["ok", "code", "messageKo"])) return value.ok === false && typeof value.code === "string"
    && [...FAILURE_CODES].some((code) => code === value.code) && text(value.messageKo, 4096);
  return record(value, ["ok", "payload", "resultMeshHash", "selectionFaceIds", "faceRemap", "halfEdgeRemap", "addedVertexIds"])
    && value.ok === true && packed(value.payload) && text(value.resultMeshHash) && ids(value.selectionFaceIds, 2) && ids(value.addedVertexIds, 2)
    && remap(value.faceRemap, "sourceFaceId", "resultFaceIds", STUDIO_EDITABLE_MESH_LIMITS.maxFaces)
    && remap(value.halfEdgeRemap, "sourceHalfEdgeId", "resultHalfEdgeIds", STUDIO_EDITABLE_MESH_LIMITS.maxEdges);
}
export function isStudioBoundaryChordWorkerResponse(value: unknown): value is StudioBoundaryChordWorkerResponse {
  try {
    if (record(value, ["version", "kind", "requestId", "generation", "code"])) return value.version === 1 && value.kind === "error"
      && uint(value.requestId, 1) && uint(value.generation, 1) && (value.code === "protocol" || value.code === "compute-failed");
    return record(value, ["version", "kind", "requestId", "generation", "assetId", "sourceMeshHash", "sourceMeshRevision", "result"])
      && value.version === 1 && value.kind === "result" && uint(value.requestId, 1) && uint(value.generation, 1)
      && text(value.assetId) && text(value.sourceMeshHash) && uint(value.sourceMeshRevision, 1) && result(value.result);
  } catch { return false; }
}
export function createStudioBoundaryChordWorkerRequest(input: StudioBoundaryChordWorkerInput, requestId: number): StudioBoundaryChordWorkerRequest | null {
  try {
    if (!validateStudioEditableMeshSerializableAuthority(input.mesh).ok || hashStudioEditableMesh(input.mesh) !== input.meshHash) return null;
    const request: StudioBoundaryChordWorkerRequest = { version: 1, kind: "boundary-chord", requestId, generation: input.generation,
      request: input.request, payload: packStudioHybridDccGlbExportInput({ assetId: input.assetId, mesh: input.mesh, sourceRevision: input.meshRevision, sourceHash: input.meshHash }) };
    return isStudioBoundaryChordWorkerRequest(request) ? request : null;
  } catch { return null; }
}
export function createStudioBoundaryChordWorkerResponse(request: StudioBoundaryChordWorkerRequest, computed: StudioBoundaryChordUvResult): StudioBoundaryChordWorkerResponse {
  const manifest = request.payload.manifest;
  const scope: Scope & { readonly version: 1; readonly kind: "result" } = { version: STUDIO_BOUNDARY_CHORD_WORKER_VERSION, kind: "result", requestId: request.requestId, generation: request.generation,
    assetId: manifest.assetId, sourceMeshHash: manifest.sourceHash, sourceMeshRevision: manifest.sourceRevision };
  if (!computed.ok) return { ...scope, result: computed };
  const resultMeshHash = hashStudioEditableMesh(computed.mesh);
  return { ...scope, result: { ok: true, resultMeshHash,
    payload: packStudioHybridDccGlbExportInput({ assetId: manifest.assetId, mesh: computed.mesh, sourceRevision: manifest.sourceRevision, sourceHash: resultMeshHash }),
    selectionFaceIds: computed.selectionFaceIds, faceRemap: computed.faceRemap, halfEdgeRemap: computed.halfEdgeRemap, addedVertexIds: computed.addedVertexIds } };
}

function sameIds(a: readonly number[], b: readonly number[]): boolean { return a.length === b.length && a.every((id, index) => id === b[index]); }
function edgeKey(a: number, b: number): string { return `${Math.min(a, b)}|${Math.max(a, b)}`; }
interface ExpectedSplit { readonly id: number; readonly low: number; readonly high: number; readonly t: number }
function validMutation(input: StudioBoundaryChordWorkerInput, output: Success): boolean {
  const source = input.mesh, next = output.mesh, selected = source.faces[input.request.faceId];
  if (!selected || next.faces.length !== source.faces.length + 1 || !sameIds(output.selectionFaceIds, [selected.id, source.faces.length])
    || output.faceRemap.length !== source.faces.length || output.halfEdgeRemap.length !== source.halfEdges.length) return false;
  const selectedVertices = new Set(source.halfEdges.filter(({ face }) => face === selected.id).map(({ vertex }) => vertex));
  const splits = new Map<string, ExpectedSplit>();
  const resolve = (endpoint: StudioBoundaryChordAnchor): number | null => {
    if (endpoint.kind === "vertex") return selectedVertices.has(endpoint.vertexId) ? endpoint.vertexId : null;
    const edge = source.halfEdges[endpoint.halfEdgeId]; if (!edge) return null;
    if (edge.face !== selected.id && source.halfEdges[edge.twin]?.face !== selected.id) return null;
    const origin = source.halfEdges[edge.prev]?.vertex; if (origin === undefined) return null;
    if (endpoint.t === 0) return origin; if (endpoint.t === 1) return edge.vertex;
    const key = edgeKey(origin, edge.vertex); if (splits.has(key)) return null;
    const split = { id: source.vertices.length + splits.size, low: Math.min(origin, edge.vertex), high: Math.max(origin, edge.vertex), t: origin < edge.vertex ? endpoint.t : 1 - endpoint.t };
    splits.set(key, split); return split.id;
  };
  const start = resolve(input.request.start), end = resolve(input.request.end);
  if (start === null || end === null || start === end || next.vertices.length !== source.vertices.length + splits.size
    || !sameIds(output.addedVertexIds, [...splits.values()].map(({ id }) => id))) return false;
  for (const vertex of source.vertices) {
    const other = next.vertices[vertex.id];
    if (!other || vertex.crease !== other.crease || vertex.position.x !== other.position.x || vertex.position.y !== other.position.y || vertex.position.z !== other.position.z) return false;
  }
  for (const split of splits.values()) {
    const a = source.vertices[split.low]?.position, b = source.vertices[split.high]?.position, vertex = next.vertices[split.id];
    if (!a || !b || !vertex || vertex.crease !== 0 || vertex.position.x !== a.x + (b.x - a.x) * split.t
      || vertex.position.y !== a.y + (b.y - a.y) * split.t || vertex.position.z !== a.z + (b.z - a.z) * split.t) return false;
  }
  const faceSources = new Map<number, number>();
  for (const face of source.faces) {
    const mapping = output.faceRemap[face.id], expected = face.id === selected.id ? [face.id, source.faces.length] : [face.id];
    if (!mapping || mapping.sourceFaceId !== face.id || !sameIds(mapping.resultFaceIds, expected)) return false;
    for (const id of mapping.resultFaceIds) {
      const other = next.faces[id]; if (!other || other.materialSlot !== face.materialSlot || other.smooth !== face.smooth) return false;
      faceSources.set(id, face.id);
    }
    const originalAnchor = source.halfEdges[source.halfEdges[face.he]?.prev ?? -1]?.vertex;
    const retained = next.faces[face.id], resultAnchor = retained ? next.halfEdges[next.halfEdges[retained.he]?.prev ?? -1]?.vertex : undefined;
    if (originalAnchor !== resultAnchor) return false;
  }
  const claimed = new Set<number>();
  for (const edge of source.halfEdges) {
    const mapping = output.halfEdgeRemap[edge.id], origin = source.halfEdges[edge.prev]?.vertex;
    if (!mapping || mapping.sourceHalfEdgeId !== edge.id || origin === undefined) return false;
    const split = splits.get(edgeKey(origin, edge.vertex)), path = split ? [origin, split.id, edge.vertex] : [origin, edge.vertex];
    if (mapping.resultHalfEdgeIds.length !== path.length - 1) return false;
    for (const [index, id] of mapping.resultHalfEdgeIds.entries()) {
      const other = next.halfEdges[id];
      if (!other || claimed.has(id) || next.halfEdges[other.prev]?.vertex !== path[index] || other.vertex !== path[index + 1]
        || other.crease !== edge.crease || faceSources.get(other.face) !== edge.face) return false;
      claimed.add(id);
    }
    if (edge.twin >= 0) {
      const twin = output.halfEdgeRemap[edge.twin]; if (!twin) return false;
      const actual = mapping.resultHalfEdgeIds.map((id) => next.halfEdges[id]?.twin);
      if (!actual.every((id, index) => id === twin.resultHalfEdgeIds[twin.resultHalfEdgeIds.length - 1 - index])) return false;
    }
  }
  const chord = next.halfEdges.filter(({ id }) => !claimed.has(id));
  if (chord.length !== 2 || chord[0]?.twin !== chord[1]?.id || chord[1]?.twin !== chord[0]?.id) return false;
  for (const edge of chord) if (edge.crease !== 0 || faceSources.get(edge.face) !== selected.id
    || ![start, end].includes(edge.vertex) || ![start, end].includes(next.halfEdges[edge.prev]?.vertex ?? -1)) return false;
  if ((source.uvLayer === undefined) !== (next.uvLayer === undefined)) return false;
  if (source.uvLayer && next.uvLayer) {
    const originalCorners = new Map<string, { readonly u: number; readonly v: number }>();
    for (const edge of source.halfEdges) {
      const origin = source.halfEdges[edge.prev]?.vertex, uv = source.uvLayer.corners[edge.id];
      if (origin === undefined || !uv) return false; originalCorners.set(`${edge.face}|${origin}`, uv);
    }
    for (const edge of next.halfEdges) {
      const face = faceSources.get(edge.face), origin = next.halfEdges[edge.prev]?.vertex, uv = next.uvLayer.corners[edge.id];
      if (face === undefined || origin === undefined || !uv) return false;
      let expected = originalCorners.get(`${face}|${origin}`);
      if (!expected) {
        const split = [...splits.values()].find(({ id }) => id === origin); if (!split) return false;
        const low = originalCorners.get(`${face}|${split.low}`), high = originalCorners.get(`${face}|${split.high}`);
        if (!low || !high) return false;
        expected = { u: Math.fround(low.u * (1 - split.t) + high.u * split.t), v: Math.fround(low.v * (1 - split.t) + high.v * split.t) };
      }
      if (uv.u !== expected.u || uv.v !== expected.v) return false;
    }
  }
  return true;
}

/** 원본 레코드는 main에 남기며 전송한 개인 buffer와 혼동하지 않는다. */
export function restoreStudioBoundaryChordWorkerResult(response: StudioBoundaryChordWorkerResponse, input: StudioBoundaryChordWorkerInput, requestId: number): StudioBoundaryChordUvResult | null {
  if (response.requestId !== requestId || response.generation !== input.generation || response.kind !== "result"
    || response.assetId !== input.assetId || response.sourceMeshHash !== input.meshHash || response.sourceMeshRevision !== input.meshRevision) return null;
  if (!response.result.ok) return response.result;
  const restored = unpackStudioHybridDccGlbExportInput(response.result.payload);
  if (!restored || restored.assetId !== input.assetId || restored.sourceRevision !== input.meshRevision
    || restored.sourceHash !== response.result.resultMeshHash || !validateStudioEditableMeshSerializableAuthority(restored.mesh).ok
    || hashStudioEditableMesh(restored.mesh) !== response.result.resultMeshHash) return null;
  const restoredResult: Success = { ok: true, mesh: restored.mesh, sourceMeshHash: input.meshHash, sourceMeshRevision: input.meshRevision,
    selectionFaceIds: response.result.selectionFaceIds, faceRemap: response.result.faceRemap,
    halfEdgeRemap: response.result.halfEdgeRemap, addedVertexIds: response.result.addedVertexIds };
  return validMutation(input, restoredResult) ? restoredResult : null;
}
