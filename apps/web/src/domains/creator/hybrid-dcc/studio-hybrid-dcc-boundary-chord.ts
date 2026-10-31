/** SK01 후보 복원본. 제품 Draw/Knife와 별개이며 동기·순수 경계 chord만 계산한다. */
import {
  hashStudioEditableMesh, STUDIO_EDITABLE_MESH_LIMITS, validateStudioEditableMeshSerializableAuthority,
  type StudioEditableMesh, type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";
import {
  createStudioFaceModelingContext, prepareStudioConvexFace, studioPolygonArea,
} from "./studio-hybrid-dcc-face-modeling-context";
import {
  analyzeStudioEditableMeshIntegrity, buildStudioEditableMeshFromFaceSpecs,
  type StudioFaceBuildSpec, type StudioMeshFaceLoop,
} from "./studio-hybrid-dcc-face-modeling-mesh";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";

export type StudioBoundaryChordAnchor =
  | { readonly kind: "vertex"; readonly vertexId: number }
  | { readonly kind: "edge"; readonly halfEdgeId: number; readonly t: number };
export interface StudioBoundaryChordSource {
  readonly mesh: StudioEditableMesh;
  readonly meshHash: string;
  /** geometry record의 동적 revision이다. schema인 mesh.revision=1로 대신하지 않는다. */
  readonly meshRevision: number;
}
export interface StudioBoundaryChordRequest {
  readonly sourceMeshHash: string;
  readonly sourceMeshRevision: number;
  readonly faceId: number;
  readonly start: StudioBoundaryChordAnchor;
  readonly end: StudioBoundaryChordAnchor;
}
export type StudioBoundaryChordFailureCode = "invalid-source" | "stale-source" | "unsupported-uv"
  | "unsupported-source" | "unsupported-face" | "invalid-anchor" | "degenerate-chord"
  | "budget-exceeded" | "invalid-result";
export type StudioBoundaryChordResult = {
  readonly ok: true;
  readonly mesh: StudioEditableMesh;
  readonly sourceMeshHash: string;
  readonly sourceMeshRevision: number;
  readonly selectionFaceIds: readonly number[];
  /** mesh DTO 밖의 group/조직 권위는 caller가 이 전체 대응으로 원자적으로 옮겨야 한다. */
  readonly faceRemap: readonly { readonly sourceFaceId: number; readonly resultFaceIds: readonly number[] }[];
  readonly halfEdgeRemap: readonly { readonly sourceHalfEdgeId: number; readonly resultHalfEdgeIds: readonly number[] }[];
  readonly addedVertexIds: readonly number[];
} | { readonly ok: false; readonly code: StudioBoundaryChordFailureCode; readonly messageKo: string };

class ChordFailure extends Error {
  constructor(readonly code: StudioBoundaryChordFailureCode, message: string) { super(message); }
}
function fail(code: StudioBoundaryChordFailureCode, message: string): never { throw new ChordFailure(code, message); }
function need<T>(value: T | undefined, message: string): T {
  if (value === undefined) fail("invalid-source", message);
  return value;
}
function edgeKey(a: number, b: number): string { return `${Math.min(a, b)}|${Math.max(a, b)}`; }
function directedKey(a: number, b: number): string { return `${a}|${b}`; }
function distance(a: StudioMeshVec3, b: StudioMeshVec3): number { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
interface Split { readonly vertexId: number; readonly boundary: boolean }
interface Endpoint { readonly vertexId: number; readonly splitKey: string | null }
interface Expanded { readonly vertices: readonly number[]; readonly creases: readonly number[] }

/** immutable geometry record를 읽는다. 원본 쓰기·Float32 정본 저장 없이 전체 결과가 준비된 경우에만 반환한다. */
export function splitStudioEditableFaceBoundaryChord(source: StudioBoundaryChordSource, request: StudioBoundaryChordRequest): StudioBoundaryChordResult {
  try {
    const { mesh } = source;
    // 공통 admission이 dense ID와 next*Id===각 배열 길이까지 보장한다. 별도 느슨한 counter 규칙을 만들지 않는다.
    const canonical = validateStudioEditableMeshSerializableAuthority(mesh);
    if (!canonical.ok) fail("invalid-source", canonical.detail);
    if (!Number.isSafeInteger(source.meshRevision) || source.meshRevision < 1
      || request.sourceMeshRevision !== source.meshRevision || request.sourceMeshHash !== source.meshHash
      || hashStudioEditableMesh(mesh) !== source.meshHash) fail("stale-source", "원본 메시의 해시 또는 편집 버전이 바뀌었습니다.");
    if (mesh.uvLayer !== undefined) fail("unsupported-uv", "새 경계 코너의 UV 대응을 보존하는 경로는 아직 없습니다.");
    // 정본 유효성과 현재 편집 뷰포트 수용은 별개다. 같은 실제 admission으로 원본부터 판정한다.
    const sourceSurface = inspectStudioMeshSurfaceForInteractiveProjection(mesh);
    if (!sourceSurface.ok) fail("unsupported-source", `현재 편집 뷰포트가 원본을 수용하지 않습니다: ${sourceSurface.message}`);
    const preparedContext = createStudioFaceModelingContext(mesh);
    if (!preparedContext.ok) fail("invalid-source", preparedContext.detail);
    const context = preparedContext.value, selected = context.loopById.get(request.faceId);
    if (!selected) fail("invalid-anchor", "선택 면이 현재 원본에 없습니다.");
    const face = prepareStudioConvexFace(context, selected);
    if (!face.ok) fail("unsupported-face", face.detail);
    const before = analyzeStudioEditableMeshIntegrity(mesh);
    if (before.nonManifoldEdges !== 0 || before.orientationConflicts !== 0) fail("invalid-source", "원본의 모서리 이웃 관계가 일관되지 않습니다.");
    // 정본의 dense vertex ID를 유지하며 새 점만 뒤에 붙인다. 기존 위치 객체도 복사한다.
    const positions: StudioMeshVec3[] = mesh.vertices.map(({ position }) => ({ ...position }));
    const vertexCreases = mesh.vertices.map(({ crease }) => crease), splits = new Map<string, Split>();
    const resolve = (anchor: StudioBoundaryChordAnchor): Endpoint => {
      if (anchor.kind === "vertex") {
        if (!Number.isSafeInteger(anchor.vertexId) || !selected.vertexIds.includes(anchor.vertexId)) fail("invalid-anchor", "선택 면 경계의 실제 정점만 사용할 수 있습니다.");
        return { vertexId: anchor.vertexId, splitKey: null };
      }
      if (anchor.kind !== "edge" || !Number.isSafeInteger(anchor.halfEdgeId) || !Number.isFinite(anchor.t) || anchor.t < 0 || anchor.t > 1) fail("invalid-anchor", "경계 모서리와 0~1 사이의 매개변수가 필요합니다.");
      const edge = need(mesh.halfEdges[anchor.halfEdgeId], "원본 반변이 없습니다.");
      const twin = edge.twin < 0 ? undefined : mesh.halfEdges[edge.twin];
      if (edge.face !== selected.id && twin?.face !== selected.id) fail("invalid-anchor", "선택 면에 접한 모서리만 분할할 수 있습니다.");
      // half-edge.vertex는 destination이다. origin을 edge.vertex로 잘못 읽지 않는다.
      const origin = need(mesh.halfEdges[edge.prev], "원본 반변의 시작점이 없습니다.").vertex, destination = edge.vertex;
      if (!selected.vertexIds.includes(origin) || !selected.vertexIds.includes(destination)) fail("invalid-anchor", "모서리 끝점이 선택 면 경계와 다릅니다.");
      if (anchor.t === 0 || anchor.t === 1) return { vertexId: anchor.t === 0 ? origin : destination, splitKey: null };
      const low = Math.min(origin, destination), high = Math.max(origin, destination);
      const t = origin === low ? anchor.t : 1 - anchor.t, key = edgeKey(low, high);
      const a = need(mesh.vertices[low], "모서리 시작 정점이 없습니다.").position, b = need(mesh.vertices[high], "모서리 끝 정점이 없습니다.").position;
      if (Math.min(t, 1 - t) * distance(a, b) < context.minFeature) fail("degenerate-chord", "새 점이 기존 경계 정점에 너무 가깝습니다.");
      if (splits.has(key)) fail("degenerate-chord", "같은 모서리 위 두 점은 면을 나누는 chord가 아닙니다.");
      if (positions.length >= STUDIO_EDITABLE_MESH_LIMITS.maxVertices) fail("budget-exceeded", "새 경계 정점이 메시 한도를 넘습니다.");
      const vertexId = positions.length;
      const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      if (![point.x, point.y, point.z].every(Number.isFinite)) fail("invalid-anchor", "새 점이 유한 좌표 범위를 벗어납니다.");
      positions.push(point); vertexCreases.push(0); splits.set(key, { vertexId, boundary: edge.twin < 0 });
      return { vertexId, splitKey: key };
    };
    const start = resolve(request.start), end = resolve(request.end);
    if (start.vertexId === end.vertexId || (start.splitKey !== null && start.splitKey === end.splitKey)
      || distance(need(positions[start.vertexId], "시작점 없음"), need(positions[end.vertexId], "끝점 없음")) < context.minFeature) fail("degenerate-chord", "서로 다른 두 경계점이 필요합니다.");
    const expand = (loop: StudioMeshFaceLoop): Expanded => {
      const vertices: number[] = [], creases: number[] = [];
      loop.vertexIds.forEach((origin, index) => {
        const destination = need(loop.vertexIds[(index + 1) % loop.vertexIds.length], "면 경계 끝점 없음");
        const crease = need(mesh.halfEdges[need(loop.halfEdgeIds[index], "면 반변 ID 없음")], "면 반변 없음").crease;
        vertices.push(origin); creases.push(crease);
        const split = splits.get(edgeKey(origin, destination));
        if (split) { vertices.push(split.vertexId); creases.push(crease); }
      });
      return { vertices, creases };
    };
    const specs: StudioFaceBuildSpec[] = [], faceRemap: Array<{ sourceFaceId: number; resultFaceIds: number[] }> = [];
    const append = (loop: StudioMeshFaceLoop, vertices: readonly number[], creases: readonly number[]): number => {
      const id = specs.length;
      specs.push({ loop: vertices, edgeCreases: creases, materialSlot: loop.materialSlot, smooth: loop.smooth }); return id;
    };
    const expanded = expand(selected), from = expanded.vertices.indexOf(start.vertexId), to = expanded.vertices.indexOf(end.vertexId);
    if (from < 0 || to < 0) fail("invalid-anchor", "경계 분할점이 선택 면에 없습니다.");
    const path = (first: number, last: number): Expanded => {
      const vertices: number[] = [], creases: number[] = []; let current = first;
      for (let steps = 0; steps <= expanded.vertices.length; steps++) {
        vertices.push(need(expanded.vertices[current], "chord 경계점 없음"));
        if (current === last) { creases.push(0); return { vertices, creases }; }
        creases.push(need(expanded.creases[current], "chord 경계 crease 없음")); current = (current + 1) % expanded.vertices.length;
      }
      return fail("invalid-result", "chord 경계 순환이 닫히지 않습니다.");
    };
    const first = path(from, to), second = path(to, from);
    for (const child of [first, second]) {
      if (child.vertices.length < 3 || studioPolygonArea(child.vertices.map((id) => need(positions[id], "분할 면 정점 없음"))) < context.minFeature ** 2) fail("degenerate-chord", "같은 경계선을 잇거나 넓이가 없는 chord입니다.");
    }
    // 기존 face ID는 원래 face.he의 origin을 포함한 child에 남긴다. 같은 origin부터 시작해 anchor도 유지한다.
    const sourceAnchor = need(selected.vertexIds[0], "원본 면의 첫 코너가 없습니다.");
    const primary = first.vertices.includes(sourceAnchor) ? first : second, secondary = primary === first ? second : first;
    const anchorIndex = primary.vertices.indexOf(sourceAnchor);
    if (anchorIndex < 0) fail("invalid-result", "원본 면의 첫 코너를 가진 child가 없습니다.");
    const retained: Expanded = { vertices: [...primary.vertices.slice(anchorIndex), ...primary.vertices.slice(0, anchorIndex)],
      creases: [...primary.creases.slice(anchorIndex), ...primary.creases.slice(0, anchorIndex)] };
    // 원래 반변 수 + split의 incident 반변 수 + chord 두 반변을 재조립 allocation 전에 확인한다.
    const addedCorners = [...splits.values()].reduce((count, split) => count + (split.boundary ? 1 : 2), 2);
    if (mesh.faces.length + 1 > STUDIO_EDITABLE_MESH_LIMITS.maxFaces || mesh.halfEdges.length + addedCorners > STUDIO_EDITABLE_MESH_LIMITS.maxEdges) fail("budget-exceeded", "분할 결과의 면 또는 반변 수가 한도를 넘습니다.");
    const appendedFaceId = mesh.faces.length;
    for (const loop of context.loops) {
      const output = loop.id === selected.id ? retained : expand(loop);
      if (append(loop, output.vertices, output.creases) !== loop.id) fail("invalid-result", "기존 면 ID를 유지하지 못했습니다.");
      faceRemap.push({ sourceFaceId: loop.id, resultFaceIds: loop.id === selected.id ? [loop.id, appendedFaceId] : [loop.id] });
    }
    if (append(selected, secondary.vertices, secondary.creases) !== appendedFaceId) fail("invalid-result", "새 child를 마지막 면으로 추가하지 못했습니다.");
    const selectionFaceIds = [selected.id, appendedFaceId];
    const built = buildStudioEditableMeshFromFaceSpecs(positions, vertexCreases, specs);
    if (!built.ok) fail("invalid-result", built.detail);
    const result = built.value, after = analyzeStudioEditableMeshIntegrity(result);
    const addedBoundary = [...splits.values()].filter(({ boundary }) => boundary).length;
    if (!after.canonical || after.nonManifoldEdges !== 0 || after.orientationConflicts !== 0
      || after.boundaryHalfEdges !== before.boundaryHalfEdges + addedBoundary
      || Math.abs(after.totalArea - before.totalArea) > Math.max(before.totalArea * 1e-9, context.minFeature ** 2 * 1e-3)) fail("invalid-result", "분할 결과의 이웃 관계 또는 면적이 원본과 다릅니다.");
    // 일반 planner의 256코너가 아니라 실제 편집 뷰포트의 128코너·smooth/crease 정책을 적용한다.
    const surface = inspectStudioMeshSurfaceForInteractiveProjection(result);
    if (!surface.ok) fail("invalid-result", `현재 편집 뷰포트가 분할 결과를 수용하지 않습니다: ${surface.message}`);
    const edgesByDirection = new Map<string, number>();
    for (const edge of result.halfEdges) {
      const origin = need(result.halfEdges[edge.prev], "결과 반변 시작점 없음").vertex, key = directedKey(origin, edge.vertex);
      if (edgesByDirection.has(key)) fail("invalid-result", "결과의 방향 반변이 중복됩니다.");
      edgesByDirection.set(key, edge.id);
    }
    const halfEdgeRemap = mesh.halfEdges.map((edge) => {
      const origin = need(mesh.halfEdges[edge.prev], "원본 반변 시작점 없음").vertex, split = splits.get(edgeKey(origin, edge.vertex));
      const chain = split ? [origin, split.vertexId, edge.vertex] : [origin, edge.vertex], resultHalfEdgeIds: number[] = [];
      for (let index = 0; index < chain.length - 1; index++) resultHalfEdgeIds.push(need(edgesByDirection.get(directedKey(need(chain[index], "시작 ID 없음"), need(chain[index + 1], "끝 ID 없음"))), "원본 모서리의 결과 대응 없음"));
      return { sourceHalfEdgeId: edge.id, resultHalfEdgeIds };
    });
    return { ok: true, mesh: result, sourceMeshHash: source.meshHash, sourceMeshRevision: source.meshRevision,
      selectionFaceIds, faceRemap, halfEdgeRemap, addedVertexIds: [...splits.values()].map(({ vertexId }) => vertexId) };
  } catch (error) {
    return error instanceof ChordFailure ? { ok: false, code: error.code, messageKo: error.message }
      : { ok: false, code: "invalid-source", messageKo: error instanceof Error ? error.message : "원본 chord 입력을 확인하지 못했습니다." };
  }
}
