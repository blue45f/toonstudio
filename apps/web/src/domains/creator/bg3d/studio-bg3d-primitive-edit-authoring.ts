/** 원본 면 편집 snapshot의 정규 JSON·mesh 경계다. 출처·소유권 인증은 저장 record와 현재 source 권위가 별도로 담당한다. */
import {
  deserializeStudioEditableMesh, hashStudioEditableMesh, serializeStudioEditableMesh,
  validateStudioEditableMeshSerializableAuthority,
} from "../studio-editable-half-edge-mesh";
import type { StudioEditableMesh, StudioEditableMeshSnapshot } from "../studio-editable-half-edge-mesh";
import { normalizeStudioHybridDccObjectTransform } from "../hybrid-dcc/studio-hybrid-dcc-object-transform";
import type { StudioHybridDccObjectTransform } from "../hybrid-dcc/studio-hybrid-dcc-object-transform";
import { canonicalStudioCommandJson } from "../studio-command-journal";
import { STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_FORMAT } from "./studio-bg3d-primitive-edit-authoring-keys";

export { STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_FORMAT } from "./studio-bg3d-primitive-edit-authoring-keys";
const textEncoder = new TextEncoder();

export interface StudioBg3dPrimitiveEditAuthoringLimits {
  readonly maxBytes: number;
  readonly maxVertices: number;
  readonly maxFaces: number;
  readonly maxCorners: number;
  readonly maxFaceCorners: number;
  readonly maxNodes: number;
  readonly maxDepth: number;
}
export const STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_LIMITS: StudioBg3dPrimitiveEditAuthoringLimits = Object.freeze({
  maxBytes: 256 * 1024, maxVertices: 4096, maxFaces: 8192, maxCorners: 32768,
  maxFaceCorners: 256, maxNodes: 131072, maxDepth: 24,
});

export type StudioBg3dPrimitiveEditAuthoringErrorCode = "invalid-json" | "invalid-schema" | "unsupported-version" | "budget-exceeded"
  | "mesh-invalid" | "hash-mismatch";
type AuthoringResult<T> = { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: StudioBg3dPrimitiveEditAuthoringErrorCode; readonly messageKo: string };

export interface StudioBg3dPrimitiveEditAuthoringEnvelope {
  readonly format: typeof STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_FORMAT;
  readonly version: 1;
  readonly coordinates: { readonly space: "object-local"; readonly units: "meters"; readonly upAxis: "Y"; readonly trsBaked: false };
  readonly source: { readonly assetId: string; readonly revision: number; readonly meshHash: string; readonly originPrimitiveKind: "box" };
  readonly mesh: StudioEditableMeshSnapshot;
  /** 과거의 정확한 기록이다. 현재 인스턴스의 위치·배율을 덮는 권위가 아니다. */
  readonly objectTransformAtExport: StudioHybridDccObjectTransform;
  readonly sourceMaterialAtExport: { readonly kind: "plain-box-v1"; readonly colorSrgb: string };
}
export interface StudioBg3dPrimitiveEditAuthoringValue { readonly envelope: StudioBg3dPrimitiveEditAuthoringEnvelope; readonly mesh: StudioEditableMesh; readonly byteLength: number }
export type StudioBg3dPrimitiveEditAuthoringResult = AuthoringResult<StudioBg3dPrimitiveEditAuthoringValue>;
export interface StudioBg3dCreatePrimitiveEditAuthoringInput {
  readonly assetId: string;
  readonly revision: number;
  readonly mesh: StudioEditableMesh;
  readonly objectTransformAtExport: StudioHybridDccObjectTransform;
  readonly colorSrgb: string;
}

const MESSAGES: Readonly<Record<StudioBg3dPrimitiveEditAuthoringErrorCode, string>> = {
  "invalid-json": "원본 면 편집 데이터에 안전하게 읽을 수 없는 값이 있습니다.",
  "invalid-schema": "원본 면 편집 데이터의 항목·좌표·재질 형식이 올바르지 않습니다.",
  "unsupported-version": "지원하지 않는 원본 면 편집 데이터 버전입니다.",
  "budget-exceeded": "원본 면 편집 데이터가 저장 용량 또는 형상 개수 한도를 넘었습니다.",
  "mesh-invalid": "원본 면 편집 메시를 정규 형상과 같은 ID로 복원할 수 없습니다.",
  "hash-mismatch": "복원한 원본 면 편집 메시가 저장된 형상 지문과 다릅니다.",
};

class AuthoringFailure extends Error {
  constructor(readonly code: StudioBg3dPrimitiveEditAuthoringErrorCode, detail: string) { super(detail); }
}
function fail(code: StudioBg3dPrimitiveEditAuthoringErrorCode, detail: string): never { throw new AuthoringFailure(code, detail); }
function result<T>(work: () => T): AuthoringResult<T> {
  try { return { ok: true, value: work() }; }
  catch (error) {
    const code = error instanceof AuthoringFailure ? error.code : "invalid-schema";
    return { ok: false, code, messageKo: MESSAGES[code] };
  }
}

/** descriptor만 읽어서 getter/toJSON을 호출하지 않고, JSON으로 잃는 값도 거부한다. */
function safeJsonCopy(input: unknown, limits: StudioBg3dPrimitiveEditAuthoringLimits): { readonly value: unknown; readonly byteLength: number } {
  let byteLength = 0, nodes = 0;
  const ancestors = new Set<object>();
  const spend = (token: string) => {
    byteLength += textEncoder.encode(token).byteLength;
    if (byteLength > limits.maxBytes) fail("budget-exceeded", "Authoring JSON byte budget exceeded");
  };
  const walk = (value: unknown, depth: number): unknown => {
    if (++nodes > limits.maxNodes || depth > limits.maxDepth) fail("budget-exceeded", "Authoring JSON traversal budget exceeded");
    if (value === null || typeof value === "boolean") { spend(value === null ? "null" : value ? "true" : "false"); return value; }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail("invalid-json", "JSON numbers must be finite");
      const normalized = Object.is(value, -0) ? 0 : value; spend(String(normalized)); return normalized;
    }
    if (typeof value === "string") {
      if (value.length > limits.maxBytes) fail("budget-exceeded", "String exceeds JSON byte budget");
      spend(JSON.stringify(value)); return value;
    }
    if (typeof value !== "object") fail("invalid-json", "Unsupported JSON value");
    if (ancestors.has(value)) fail("invalid-json", "Cyclic JSON is forbidden");
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype) fail("invalid-json", "Custom array prototypes are forbidden");
        if (value.length > Math.max(limits.maxVertices, limits.maxFaces, limits.maxCorners)) fail("budget-exceeded", "Array count budget exceeded");
        const ownKeys = Reflect.ownKeys(value);
        if (ownKeys.some((key) => key !== "length" && (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= value.length))) {
          fail("invalid-json", "Custom array properties are forbidden");
        }
        const output: unknown[] = []; spend("[");
        for (let index = 0; index < value.length; index += 1) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
          if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail("invalid-json", "Sparse arrays and accessors are forbidden");
          if (index > 0) spend(","); output.push(walk(descriptor.value, depth + 1));
        }
        spend("]"); return output;
      }
      const prototype: unknown = Object.getPrototypeOf(value);
      if (prototype !== null && prototype !== Object.prototype) fail("invalid-json", "Unsupported object prototype");
      const keys = Reflect.ownKeys(value);
      if (keys.length > 64 || keys.some((key) => typeof key !== "string")) fail("invalid-json", "Unsupported object keys");
      const output: Record<string, unknown> = {}; spend("{");
      let first = true;
      for (const key of keys) {
        if (typeof key !== "string") fail("invalid-json", "Symbol keys are forbidden");
        if (["__proto__", "prototype", "constructor"].includes(key)) fail("invalid-json", "Toxic JSON key");
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail("invalid-json", "Accessors and hidden properties are forbidden");
        if (!first) spend(","); first = false; spend(`${JSON.stringify(key)}:`);
        output[key] = walk(descriptor.value, depth + 1);
      }
      spend("}"); return output;
    } finally { ancestors.delete(value); }
  };
  return { value: walk(input, 0), get byteLength() { return byteLength; } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) fail("invalid-schema", "Object expected");
  return value;
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) fail("invalid-schema", "Missing or unknown schema keys");
}
function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value)) fail("invalid-schema", "Array expected");
  if (value.length > maximum) fail("budget-exceeded", "Schema array budget exceeded");
  return value;
}
function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) fail("invalid-schema", "Integer is outside the schema range");
  return value;
}
function finite(value: unknown, magnitude = 1_000_000): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > magnitude) fail("invalid-schema", "Coordinate is outside the finite authoring range");
  return value;
}
function tuple(value: unknown): readonly [number, number, number] {
  const items = array(value, 3); if (items.length !== 3) fail("invalid-schema", "vec3 expected");
  return [finite(items[0]), finite(items[1]), finite(items[2])];
}
function snapshot(value: unknown, limits: StudioBg3dPrimitiveEditAuthoringLimits): StudioEditableMeshSnapshot {
  const input = record(value);
  exactKeys(input, ["revision", "positions", "faces", "faceAttributes", "vertexCreases", "halfEdgeCreases", "authorityCounters"]);
  if (input.revision !== 1) fail("unsupported-version", "Unsupported half-edge snapshot revision");
  const positions = array(input.positions, limits.maxVertices).map(tuple);
  if (positions.length === 0) fail("mesh-invalid", "Empty authoring mesh");
  let corners = 0;
  const faces = array(input.faces, limits.maxFaces).map((value) => {
    const face = array(value, limits.maxFaceCorners);
    if (face.length < 3) fail("mesh-invalid", "Face has fewer than three corners");
    corners += face.length; if (corners > limits.maxCorners) fail("budget-exceeded", "Corner budget exceeded");
    return face.map((vertex) => integer(vertex, 0, positions.length - 1));
  });
  if (faces.length === 0) fail("mesh-invalid", "Authoring faces are required");
  const faceAttributes = array(input.faceAttributes, faces.length).map((value, index) => {
    const entry = record(value); exactKeys(entry, ["faceIndex", "materialSlot", "smooth"]);
    if (entry.faceIndex !== index || typeof entry.smooth !== "boolean") fail("invalid-schema", "Noncanonical face attributes");
    return { faceIndex: index, materialSlot: integer(entry.materialSlot, 0, 255), smooth: entry.smooth };
  });
  if (faceAttributes.length !== faces.length) fail("invalid-schema", "All face attributes are required in v1");
  const vertexCreases = array(input.vertexCreases, positions.length).map((value) => {
    const entry = record(value); exactKeys(entry, ["vertexIndex", "crease"]);
    const crease = finite(entry.crease, 1); if (crease <= 0) fail("invalid-schema", "Noncanonical vertex crease");
    return { vertexIndex: integer(entry.vertexIndex, 0, positions.length - 1), crease };
  });
  const halfEdgeCreases = array(input.halfEdgeCreases, corners).map((value) => {
    const entry = record(value); exactKeys(entry, ["faceIndex", "edgeIndex", "crease"]);
    const faceIndex = integer(entry.faceIndex, 0, faces.length - 1);
    const crease = finite(entry.crease, 1); if (crease <= 0) fail("invalid-schema", "Noncanonical edge crease");
    return { faceIndex, edgeIndex: integer(entry.edgeIndex, 0, faces[faceIndex].length - 1), crease };
  });
  const counters = record(input.authorityCounters); exactKeys(counters, ["nextVertexId", "nextHalfEdgeId", "nextFaceId"]);
  if (counters.nextVertexId !== positions.length || counters.nextHalfEdgeId !== corners || counters.nextFaceId !== faces.length) fail("mesh-invalid", "Authority counter mismatch");
  return { revision: 1, positions, faces, faceAttributes, vertexCreases, halfEdgeCreases,
    authorityCounters: { nextVertexId: positions.length, nextHalfEdgeId: corners, nextFaceId: faces.length } };
}
function historicalTransform(value: unknown): StudioHybridDccObjectTransform {
  const input = record(value); exactKeys(input, ["revision", "position", "rotationEulerRad", "scale"]);
  return normalizeStudioHybridDccObjectTransform(input);
}
function sourceMaterial(value: unknown): StudioBg3dPrimitiveEditAuthoringEnvelope["sourceMaterialAtExport"] {
  const input = record(value); exactKeys(input, ["kind", "colorSrgb"]);
  if (input.kind !== "plain-box-v1" || typeof input.colorSrgb !== "string" || !/^#[0-9a-f]{6}$/u.test(input.colorSrgb)) {
    fail("invalid-schema", "Canonical plain-box material expected");
  }
  return { kind: "plain-box-v1", colorSrgb: input.colorSrgb };
}
function decode(input: unknown): StudioBg3dPrimitiveEditAuthoringValue {
  const limits = STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_LIMITS, json = safeJsonCopy(input, limits), data = record(json.value);
  exactKeys(data, ["format", "version", "coordinates", "source", "mesh", "objectTransformAtExport", "sourceMaterialAtExport"]);
  if (data.format !== STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_FORMAT || data.version !== 1) fail("unsupported-version", "Unsupported authoring envelope");
  const coordinates = record(data.coordinates); exactKeys(coordinates, ["space", "units", "upAxis", "trsBaked"]);
  if (coordinates.space !== "object-local" || coordinates.units !== "meters" || coordinates.upAxis !== "Y" || coordinates.trsBaked !== false) fail("invalid-schema", "Coordinate authority mismatch");
  const source = record(data.source); exactKeys(source, ["assetId", "revision", "meshHash", "originPrimitiveKind"]);
  if (typeof source.assetId !== "string" || source.assetId.length === 0 || textEncoder.encode(source.assetId).byteLength > 160
    || [...source.assetId].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) fail("invalid-schema", "Invalid asset id");
  if (typeof source.meshHash !== "string" || !/^mesh:sha256:[a-f0-9]{64}$/u.test(source.meshHash)) fail("invalid-schema", "An exact SHA mesh hash is required");
  if (source.originPrimitiveKind !== "box") fail("invalid-schema", "Only box lineage is supported");
  const meshSnapshot = snapshot(data.mesh, limits);
  let mesh: StudioEditableMesh;
  try { mesh = deserializeStudioEditableMesh(meshSnapshot); }
  catch (error) { fail("mesh-invalid", error instanceof Error ? error.message : "Invalid half-edge snapshot"); }
  const authority = validateStudioEditableMeshSerializableAuthority(mesh);
  if (!authority.ok) fail("mesh-invalid", authority.detail);
  if (canonicalStudioCommandJson(serializeStudioEditableMesh(mesh), limits.maxBytes) !== canonicalStudioCommandJson(meshSnapshot, limits.maxBytes)) fail("mesh-invalid", "Snapshot did not round-trip exactly");
  if (hashStudioEditableMesh(mesh) !== source.meshHash) fail("hash-mismatch", "Exact source mesh hash differs");
  const envelope: StudioBg3dPrimitiveEditAuthoringEnvelope = { format: STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_FORMAT, version: 1,
    coordinates: { space: "object-local", units: "meters", upAxis: "Y", trsBaked: false },
    source: { assetId: source.assetId, revision: integer(source.revision, 1), meshHash: source.meshHash, originPrimitiveKind: "box" },
    mesh: meshSnapshot, objectTransformAtExport: historicalTransform(data.objectTransformAtExport),
    sourceMaterialAtExport: sourceMaterial(data.sourceMaterialAtExport) };
  return { envelope, mesh, byteLength: json.byteLength };
}

/** 외부 extras를 unknown으로 받고, 렌더용 Float32 좌표에서 원본 형상을 추측하지 않는다. */
export function parseStudioBg3dPrimitiveEditAuthoring(input: unknown): StudioBg3dPrimitiveEditAuthoringResult {
  return result(() => decode(input));
}

/** 확정된 정규 mesh만 저장한다. 연산 전후의 ID 연속성은 kernel의 remap이 별도로 담당한다. */
export function createStudioBg3dPrimitiveEditAuthoring(input: StudioBg3dCreatePrimitiveEditAuthoringInput): StudioBg3dPrimitiveEditAuthoringResult {
  return result(() => {
    const { mesh, colorSrgb } = input, limits = STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_LIMITS;
    if (!Array.isArray(mesh.vertices) || !Array.isArray(mesh.halfEdges) || !Array.isArray(mesh.faces)) fail("mesh-invalid", "Invalid authoring arrays");
    if (mesh.vertices.length > limits.maxVertices || mesh.faces.length > limits.maxFaces || mesh.halfEdges.length > limits.maxCorners) {
      fail("budget-exceeded", "Producer mesh budget exceeded");
    }
    const authority = validateStudioEditableMeshSerializableAuthority(mesh);
    if (!authority.ok) fail("mesh-invalid", authority.detail);
    if (typeof colorSrgb !== "string" || colorSrgb.length !== 7 || !/^#[0-9a-f]{6}$/iu.test(colorSrgb)) fail("invalid-schema", "Invalid source color");
    return decode({ format: STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_FORMAT, version: 1,
      coordinates: { space: "object-local", units: "meters", upAxis: "Y", trsBaked: false },
      source: { assetId: input.assetId, revision: input.revision, meshHash: hashStudioEditableMesh(mesh), originPrimitiveKind: "box" },
      mesh: serializeStudioEditableMesh(mesh), objectTransformAtExport: input.objectTransformAtExport,
      sourceMaterialAtExport: { kind: "plain-box-v1", colorSrgb: colorSrgb.toLowerCase() } });
  });
}
