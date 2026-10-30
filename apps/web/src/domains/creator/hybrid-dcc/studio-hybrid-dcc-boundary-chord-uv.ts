/** 단일 canonical UV layer의 엄격한 부분 보존 후보. 제품/기존 chord 파일은 바꾸지 않는다. */
import {
  hashStudioEditableMesh, validateStudioEditableMeshSerializableAuthority,
  type StudioEditableMesh, type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";
import {
  decodeStudioMeshUvLayer, hashStudioMeshUvTopology, type StudioMeshUvCorner, type StudioMeshUvLayer,
} from "../mesh-uv/studio-mesh-uv-authority";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import { readStudioMeshFaceLoops, type StudioMeshFaceLoop } from "./studio-hybrid-dcc-face-modeling-mesh";
import {
  splitStudioEditableFaceBoundaryChord, type StudioBoundaryChordSource, type StudioBoundaryChordRequest,
  type StudioBoundaryChordResult, type StudioBoundaryChordFailureCode,
} from "./studio-hybrid-dcc-boundary-chord";

type FailureCode = StudioBoundaryChordFailureCode | "unsupported-uv-mapping" | "unsupported-uv-precision";
export type StudioBoundaryChordUvResult = Extract<StudioBoundaryChordResult, { ok: true }>
  | { readonly ok: false; readonly code: FailureCode; readonly messageKo: string };
class UvFailure extends Error { constructor(readonly code: FailureCode, message: string) { super(message); } }
function fail(code: FailureCode, message: string): never { throw new UvFailure(code, message); }
function need<T>(value: T | undefined): T { if (value === undefined) fail("invalid-result", "UV 원본 코너의 정확한 대응이 없습니다."); return value; }
function key(a: number, b: number): string { return `${Math.min(a, b)}|${Math.max(a, b)}`; }
type Uv = Pick<StudioMeshUvCorner, "u" | "v">;

// IEEE754 입력의 dyadic 값을 그대로 계산한다. 허용 오차로 non-affine/반올림 오차를 숨기지 않는다.
interface D { readonly n: bigint; readonly e: number }
const BIGINT_ZERO = BigInt(0), BIGINT_ONE = BigInt(1), BIGINT_WORD_BITS = BigInt(32), BIGINT_MANTISSA_BITS = BigInt(52);
function exact(value: number): D {
  if (!Number.isFinite(value)) fail("unsupported-uv-precision", "UV 검증 값이 유한 범위를 벗어났습니다.");
  if (value === 0) return { n: BIGINT_ZERO, e: 0 };
  const bytes = new DataView(new ArrayBuffer(8)); bytes.setFloat64(0, value, false);
  const high = bytes.getUint32(0, false), low = bytes.getUint32(4, false), exponent = (high >>> 20) & 2047;
  const mantissa = (BigInt(high & 0xfffff) << BIGINT_WORD_BITS) + BigInt(low) + (exponent === 0 ? BIGINT_ZERO : BIGINT_ONE << BIGINT_MANTISSA_BITS);
  return { n: high >>> 31 ? -mantissa : mantissa, e: exponent === 0 ? -1074 : exponent - 1023 - 52 };
}
function add(a: D, b: D): D { const e = Math.min(a.e, b.e); return { n: (a.n << BigInt(a.e - e)) + (b.n << BigInt(b.e - e)), e }; }
function negate(a: D): D { return { n: -a.n, e: a.e }; }
function sub(a: D, b: D): D { return add(a, negate(b)); }
function mul(a: D, b: D): D { return { n: a.n * b.n, e: a.e + b.e }; }
function same(a: D, b: D): boolean { return sub(a, b).n === BIGINT_ZERO; }
function cross(a: readonly [D, D], b: readonly [D, D]): D { return sub(mul(a[0], b[1]), mul(a[1], b[0])); }
type Point = readonly [D, D, D];
function point(value: StudioMeshVec3): Point { return [exact(value.x), exact(value.y), exact(value.z)]; }
function delta(a: Point, b: Point): Point { return [sub(a[0], b[0]), sub(a[1], b[1]), sub(a[2], b[2])]; }
interface Field { readonly accepts: (position: StudioMeshVec3, uv: Uv) => boolean }
function affineField(mesh: StudioEditableMesh, layer: StudioMeshUvLayer, loop: StudioMeshFaceLoop,
  triangle: readonly [number, number, number], rendered = false): Field {
  // 표시 stream과 같은 파생 Float32 좌표도 별도로 검증하되 source/결과의 정본 위치는 바꾸지 않는다.
  const coordinates = (p: StudioMeshVec3): StudioMeshVec3 => rendered ? { x: Math.fround(p.x), y: Math.fround(p.y), z: Math.fround(p.z) } : p;
  const uvByVertex = new Map(loop.vertexIds.map((id, index): readonly [number, StudioMeshUvCorner] => [id, need(layer.corners[need(loop.halfEdgeIds[index])])]));
  const p0 = point(coordinates(need(mesh.vertices[triangle[0]]).position)), p1 = point(coordinates(need(mesh.vertices[triangle[1]]).position)), p2 = point(coordinates(need(mesh.vertices[triangle[2]]).position));
  const d1 = delta(p1, p0), d2 = delta(p2, p0);
  const normal: Point = [cross([d1[1], d1[2]], [d2[1], d2[2]]), negate(cross([d1[0], d1[2]], [d2[0], d2[2]])), cross([d1[0], d1[1]], [d2[0], d2[1]])];
  const axes: readonly (readonly [0 | 1 | 2, 0 | 1 | 2])[] = [[0, 1], [0, 2], [1, 2]];
  const axis = need(axes.find(([x, y]) => cross([d1[x], d1[y]], [d2[x], d2[y]]).n !== BIGINT_ZERO)), [x, y] = axis;
  const determinant = cross([d1[x], d1[y]], [d2[x], d2[y]]);
  const a = need(uvByVertex.get(triangle[0])), b = need(uvByVertex.get(triangle[1])), c = need(uvByVertex.get(triangle[2]));
  const accepts = (position: StudioMeshVec3, uv: Uv): boolean => {
    const d = delta(point(coordinates(position)), p0);
    if (add(add(mul(normal[0], d[0]), mul(normal[1], d[1])), mul(normal[2], d[2])).n !== BIGINT_ZERO) return false;
    const w1 = cross([d[x], d[y]], [d2[x], d2[y]]), w2 = cross([d1[x], d1[y]], [d[x], d[y]]), w0 = sub(sub(determinant, w1), w2);
    const matches = (field: "u" | "v") => same(mul(exact(uv[field]), determinant),
      add(add(mul(w0, exact(a[field])), mul(w1, exact(b[field]))), mul(w2, exact(c[field]))));
    return matches("u") && matches("v");
  };
  for (const id of loop.vertexIds) if (!accepts(need(mesh.vertices[id]).position, need(uvByVertex.get(id)))) {
    fail("unsupported-uv-mapping", `면 ${loop.id}의 ${rendered ? "실제 Float32 표시" : "f64 정본"} 표면은 단일 exact planar/affine UV가 아닙니다. 원래 삼각형 overlay 보존이 필요합니다.`);
  }
  return { accepts };
}
interface Split { readonly low: number; readonly high: number; readonly t: number }

/** 값·seam·재삼각분할 field를 모두 보존하는 경우만 성공한다. 일반 비선형 UV 지원을 의미하지 않는다. */
export function splitStudioEditableFaceBoundaryChordWithUv(source: StudioBoundaryChordSource, request: StudioBoundaryChordRequest): StudioBoundaryChordUvResult {
  try {
    const mesh = source.mesh, canonical = validateStudioEditableMeshSerializableAuthority(mesh);
    if (!canonical.ok) fail("invalid-source", canonical.detail);
    if (!Number.isSafeInteger(source.meshRevision) || source.meshRevision < 1 || source.meshRevision !== request.sourceMeshRevision
      || source.meshHash !== request.sourceMeshHash || hashStudioEditableMesh(mesh) !== source.meshHash) fail("stale-source", "UV 원본의 해시 또는 동적 편집 버전이 바뀌었습니다.");
    if (mesh.uvLayer === undefined) return splitStudioEditableFaceBoundaryChord(source, request);
    const layer = decodeStudioMeshUvLayer(mesh.uvLayer, mesh), inspected = inspectStudioMeshSurfaceForInteractiveProjection(mesh);
    if (!inspected.ok) fail("unsupported-source", inspected.message);
    const loops = readStudioMeshFaceLoops(mesh); if (!loops) fail("invalid-source", "UV 원본의 face loop가 닫히지 않습니다.");
    const sourceLoops = new Map(loops.map((loop): readonly [number, StudioMeshFaceLoop] => [loop.id, loop]));
    // 원본 UV를 덮지 않는 개인 geometry 계산이다. 내부 hash를 바꾸되 반환 scope는 원본 UV hash로 유지한다.
    const { uvLayer: omittedUv, ...plainMesh } = mesh;
    if (omittedUv !== mesh.uvLayer) fail("invalid-source", "UV 원본 identity가 바뀌었습니다.");
    const geometryHash = hashStudioEditableMesh(plainMesh);
    const result = splitStudioEditableFaceBoundaryChord({ mesh: plainMesh, meshHash: geometryHash, meshRevision: source.meshRevision }, { ...request, sourceMeshHash: geometryHash });
    if (!result.ok) return result;
    const splits = new Map<number, Split>();
    for (const anchor of [request.start, request.end]) {
      if (anchor.kind !== "edge" || anchor.t === 0 || anchor.t === 1) continue;
      const edge = need(mesh.halfEdges[anchor.halfEdgeId]), origin = need(mesh.halfEdges[edge.prev]).vertex;
      const low = Math.min(origin, edge.vertex), high = Math.max(origin, edge.vertex), t = origin === low ? anchor.t : 1 - anchor.t;
      const mapping = need(result.halfEdgeRemap.find(({ sourceHalfEdgeId }) => sourceHalfEdgeId === edge.id));
      if (mapping.resultHalfEdgeIds.length !== 2) fail("invalid-result", "UV split 모서리의 두 segment 대응이 없습니다.");
      const newVertex = need(result.mesh.halfEdges[need(mapping.resultHalfEdgeIds[0])]).vertex;
      if (!result.addedVertexIds.includes(newVertex)) fail("invalid-result", "UV split이 실제 새 vertex와 다릅니다.");
      splits.set(newVertex, { low, high, t });
    }
    if (splits.size !== result.addedVertexIds.length) fail("invalid-result", "새 UV 정점과 geometry split의 전체 대응이 다릅니다.");
    const sourceFaceByOutput = new Map<number, number>(), affected = new Set<number>();
    for (const mapping of result.faceRemap) {
      if (mapping.resultFaceIds.length > 1) affected.add(mapping.sourceFaceId);
      for (const id of mapping.resultFaceIds) sourceFaceByOutput.set(id, mapping.sourceFaceId);
    }
    const resultLoops = readStudioMeshFaceLoops(result.mesh); if (!resultLoops) fail("invalid-result", "결과 UV face loop가 없습니다.");
    for (const loop of resultLoops) if (loop.vertexIds.some((id) => splits.has(id))) affected.add(need(sourceFaceByOutput.get(loop.id)));
    const fields = new Map<number, { readonly source: Field; readonly rendered: Field }>();
    for (const id of affected) {
      const triangle = need(inspected.value.plan.triangles.find((entry) => entry.faceId === id));
      const loop = need(sourceLoops.get(id));
      fields.set(id, { source: affineField(mesh, layer, loop, triangle.vertexIds), rendered: affineField(mesh, layer, loop, triangle.vertexIds, true) });
    }
    const corners: StudioMeshUvCorner[] = [];
    for (const edge of result.mesh.halfEdges) {
      const sourceFace = need(sourceFaceByOutput.get(edge.face)), loop = need(sourceLoops.get(sourceFace));
      const origin = need(result.mesh.halfEdges[edge.prev]).vertex;
      const oldIndex = loop.vertexIds.indexOf(origin); let uv: Uv;
      if (oldIndex >= 0) uv = need(layer.corners[need(loop.halfEdgeIds[oldIndex])]);
      else {
        const split = need(splits.get(origin));
        const sourceEdge = need(loop.halfEdgeIds.map((id) => need(mesh.halfEdges[id])).find((entry) => key(need(mesh.halfEdges[entry.prev]).vertex, entry.vertex) === key(split.low, split.high)));
        const sourceOrigin = need(mesh.halfEdges[sourceEdge.prev]).vertex, start = need(layer.corners[sourceEdge.id]), end = need(layer.corners[sourceEdge.next]);
        const low = sourceOrigin === split.low ? start : end, high = sourceOrigin === split.low ? end : start;
        // 면별 seam을 섞지 않고 양쪽에서 같은 low→high t를 한 번만 쓴다. 마지막에 canonical Float32로 만든다.
        uv = { u: Math.fround(low.u * (1 - split.t) + high.u * split.t), v: Math.fround(low.v * (1 - split.t) + high.v * split.t) };
        if (![uv.u, uv.v].every(Number.isFinite)) fail("unsupported-uv-precision", "새 UV 코너가 finite Float32를 벗어났습니다.");
      }
      const field = fields.get(sourceFace);
      const position = need(result.mesh.vertices[origin]).position;
      if (field && (!field.source.accepts(position, uv) || !field.rendered.accepts(position, uv))) fail("unsupported-uv-precision", "새 정본/실제 Float32 표시 위치·UV가 원본 affine field를 정확히 보존하지 못합니다.");
      corners.push({ halfEdgeId: edge.id, u: uv.u, v: uv.v });
    }
    const attributed: StudioEditableMesh = { ...result.mesh, uvLayer: decodeStudioMeshUvLayer({ revision: layer.revision, topologyHash: hashStudioMeshUvTopology(result.mesh), corners }, result.mesh) };
    const finalSurface = inspectStudioMeshSurfaceForInteractiveProjection(attributed);
    if (!finalSurface.ok) fail("invalid-result", finalSurface.message);
    // 건드리지 않은 비선형 면은 허용하되 실제 source triangle의 순서/vertex ID까지 동일해야 한다.
    for (const loop of loops) if (!affected.has(loop.id)) {
      const before = inspected.value.plan.triangles.filter(({ faceId }) => faceId === loop.id).map(({ vertexIds }) => vertexIds);
      const after = finalSurface.value.plan.triangles.filter(({ faceId }) => faceId === loop.id).map(({ vertexIds }) => vertexIds);
      if (JSON.stringify(before) !== JSON.stringify(after)) fail("unsupported-uv-mapping", "무관한 면의 원래 UV triangle 표가 바뀌었습니다.");
    }
    return { ...result, mesh: attributed, sourceMeshHash: source.meshHash };
  } catch (error) {
    return error instanceof UvFailure ? { ok: false, code: error.code, messageKo: error.message }
      : { ok: false, code: "invalid-source", messageKo: error instanceof Error ? error.message : "원본 UV를 보존하지 못했습니다." };
  }
}
