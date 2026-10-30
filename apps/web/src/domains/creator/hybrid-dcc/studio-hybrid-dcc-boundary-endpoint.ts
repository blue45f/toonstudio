/** 실제 viewport callsite의 source/hit/투영 인자를 쓰는 제품 미연결 endpoint 후보. */
import { Matrix4, OrthographicCamera, PerspectiveCamera, Vector4, WebGLCoordinateSystem, WebGPUCoordinateSystem } from "three";
import { hashStudioEditableMesh, validateStudioEditableMeshSerializableAuthority } from "../studio-editable-half-edge-mesh";
import {
  mapStudioHybridDccRayFaceIndex, validateStudioHybridDccComponentSelection,
  type StudioHybridDccComponentSelection, type StudioHybridDccMeshSelectionSource,
  type StudioHybridDccRayHitMapping, type StudioHybridDccSelectionProvenance,
} from "./studio-hybrid-dcc-component-selection";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import type { resolveStudioHybridDccScreenComponentCandidate } from "./studio-hybrid-dcc-screen-selection";
import type { StudioBoundaryChordAnchor } from "./studio-hybrid-dcc-boundary-chord";

type ScreenArguments = Parameters<typeof resolveStudioHybridDccScreenComponentCandidate>;
export interface StudioBoundaryEndpointProjection {
  readonly pointerNdc: ScreenArguments[3];
  readonly camera: ScreenArguments[4];
  readonly matrixWorld: ScreenArguments[5];
  readonly viewportSize: ScreenArguments[6];
  readonly thresholdPx?: ScreenArguments[7];
}
export interface StudioBoundaryEndpointLease {
  readonly provenance: StudioHybridDccSelectionProvenance;
  readonly sourceMesh: StudioHybridDccMeshSelectionSource["mesh"];
  readonly faceId: number;
  readonly anchor: StudioBoundaryChordAnchor;
}
export type StudioBoundaryEndpointFailureCode = "invalid-source" | "stale-source" | "selection-stale"
  | "stale-hit" | "outside-face" | "invalid-projection" | "outside-view" | "outside-boundary"
  | "degenerate-projection" | "untrusted-endpoint" | "stale-endpoint";
export type StudioBoundaryEndpointResult<T> = { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: StudioBoundaryEndpointFailureCode; readonly messageKo: string };
const issued = new WeakSet<StudioBoundaryEndpointLease>();
class EndpointFailure extends Error {
  constructor(readonly code: StudioBoundaryEndpointFailureCode, message: string) { super(message); }
}
function stop(code: StudioBoundaryEndpointFailureCode, message: string): never { throw new EndpointFailure(code, message); }
function need<T>(value: T | undefined): T { if (value === undefined) stop("invalid-source", "현재 메시의 경계 ID를 찾지 못했습니다."); return value; }
function failed<T>(error: unknown): StudioBoundaryEndpointResult<T> {
  return error instanceof EndpointFailure ? { ok: false, code: error.code, messageKo: error.message }
    : { ok: false, code: "invalid-source", messageKo: error instanceof Error ? error.message : "endpoint 입력을 읽지 못했습니다." };
}
function sameProvenance(a: StudioHybridDccSelectionProvenance, b: StudioHybridDccSelectionProvenance): boolean {
  return a.assetId === b.assetId && a.meshRevision === b.meshRevision && a.sourceHash === b.sourceHash;
}
function selectedFace(source: StudioHybridDccMeshSelectionSource, selection: StudioHybridDccComponentSelection): number {
  const canonical = validateStudioEditableMeshSerializableAuthority(source.mesh);
  if (!canonical.ok) stop("invalid-source", canonical.detail);
  if (hashStudioEditableMesh(source.mesh) !== source.sourceHash) stop("stale-source", "현재 geometry와 source hash가 다릅니다.");
  const valid = validateStudioHybridDccComponentSelection(selection, source);
  if (!valid.ok || selection.mode !== "face" || selection.elementIds.length !== 1) stop("selection-stale", "현재 원본과 일치하는 한 면 선택이 필요합니다.");
  const surface = inspectStudioMeshSurfaceForInteractiveProjection(source.mesh);
  if (!surface.ok) stop("invalid-source", surface.message);
  return need(selection.elementIds[0]);
}
interface Projection {
  readonly matrix: Matrix4;
  readonly zeroToOneDepth: boolean;
  readonly width: number;
  readonly height: number;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly radiusSquared: number;
}
function prepareProjection(input: StudioBoundaryEndpointProjection): Projection {
  const { camera, matrixWorld, viewportSize, pointerNdc } = input, threshold = input.thresholdPx ?? 10;
  if (!(camera instanceof PerspectiveCamera || camera instanceof OrthographicCamera)
    || (camera.coordinateSystem !== WebGLCoordinateSystem && camera.coordinateSystem !== WebGPUCoordinateSystem)
    || ![viewportSize.width, viewportSize.height, pointerNdc.x, pointerNdc.y, threshold].every(Number.isFinite)
    || viewportSize.width <= 0 || viewportSize.height <= 0 || threshold < 1 || threshold > 64) stop("invalid-projection", "실제 카메라와 유효한 CSS viewport·근접 반경이 필요합니다.");
  if (Math.abs(pointerNdc.x) > 1 || Math.abs(pointerNdc.y) > 1) stop("outside-view", "포인터가 현재 viewport 밖입니다.");
  for (const matrix of [matrixWorld, camera.matrixWorldInverse, camera.projectionMatrix]) {
    if (!matrix.elements.every(Number.isFinite) || !Number.isFinite(matrix.determinant()) || matrix.determinant() === 0) stop("invalid-projection", "카메라 또는 물체 행렬이 유한한 가역 행렬이 아닙니다.");
  }
  if (matrixWorld.elements[3] !== 0 || matrixWorld.elements[7] !== 0 || matrixWorld.elements[11] !== 0 || matrixWorld.elements[15] !== 1) stop("invalid-projection", "물체 world 행렬은 affine TRS여야 합니다.");
  const matrix = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(matrixWorld);
  if (!matrix.elements.every(Number.isFinite)) stop("invalid-projection", "합성 투영 행렬이 유한 범위를 벗어났습니다.");
  return { matrix, zeroToOneDepth: camera.coordinateSystem === WebGPUCoordinateSystem || camera.reversedDepth,
    width: viewportSize.width, height: viewportSize.height,
    pointerX: (pointerNdc.x + 1) * viewportSize.width / 2, pointerY: (1 - pointerNdc.y) * viewportSize.height / 2,
    radiusSquared: threshold * threshold };
}
function clipPoint(source: StudioHybridDccMeshSelectionSource, id: number, projection: Projection): Vector4 {
  const position = need(source.mesh.vertices[id]).position;
  const clip = new Vector4(position.x, position.y, position.z, 1).applyMatrix4(projection.matrix);
  if (![clip.x, clip.y, clip.z, clip.w].every(Number.isFinite)) stop("invalid-projection", "정점의 clip 좌표가 유한 범위를 벗어났습니다.");
  return clip;
}
function planes(point: Vector4, projection: Projection): readonly number[] {
  return [point.w + point.x, point.w - point.x, point.w + point.y, point.w - point.y,
    projection.zeroToOneDepth ? point.z : point.w + point.z, point.w - point.z];
}
function screen(point: Vector4, projection: Projection): { readonly x: number; readonly y: number } {
  if (!(point.w > 0)) stop("invalid-projection", "보이는 endpoint의 homogeneous w가 양수가 아닙니다.");
  const x = (point.x / point.w + 1) * projection.width / 2, y = (1 - point.y / point.w) * projection.height / 2;
  if (![x, y].every(Number.isFinite)) stop("invalid-projection", "endpoint 화면 좌표가 유한 범위를 벗어났습니다.");
  return { x, y };
}
/** homogeneous 선분 clipping은 원본 방향의 [t0,t1]을 보존한다. 뒤쪽/near 교차를 화면 반전으로 오인하지 않는다. */
function clippedInterval(a: Vector4, b: Vector4, projection: Projection): readonly [number, number] | null {
  const valuesA = planes(a, projection), valuesB = planes(b, projection); let lower = 0, upper = 1;
  for (let index = 0; index < valuesA.length; index++) {
    const start = need(valuesA[index]), end = need(valuesB[index]), delta = end - start;
    if (![start, end, delta].every(Number.isFinite)) stop("invalid-projection", "clip plane 계산이 유한 범위를 벗어났습니다.");
    if (delta === 0) { if (start < 0) return null; continue; }
    const crossing = -start / delta;
    if (delta > 0) lower = Math.max(lower, crossing); else upper = Math.min(upper, crossing);
    if (lower > upper) return null;
  }
  return [lower, upper];
}
interface Candidate { readonly anchor: StudioBoundaryChordAnchor; readonly distanceSquared: number; readonly tieId: number }
function edgeCandidate(source: StudioHybridDccMeshSelectionSource, halfEdgeId: number, projection: Projection): Candidate | null {
  const edge = need(source.mesh.halfEdges[halfEdgeId]), origin = need(source.mesh.halfEdges[edge.prev]).vertex;
  const a = clipPoint(source, origin, projection), b = clipPoint(source, edge.vertex, projection);
  const interval = clippedInterval(a, b, projection); if (!interval) return null;
  const [t0, t1] = interval, start = a.clone().lerp(b, t0), end = a.clone().lerp(b, t1);
  if (!(start.w > 0 && end.w > 0)) return null;
  const p = screen(start, projection), q = screen(end, projection), dx = q.x - p.x, dy = q.y - p.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!Number.isFinite(lengthSquared)) stop("invalid-projection", "모서리 화면 길이를 계산할 수 없습니다.");
  if (lengthSquared === 0) return null;
  const lambda = Math.min(1, Math.max(0, ((projection.pointerX - p.x) * dx + (projection.pointerY - p.y) * dy) / lengthSquared));
  const px = p.x + lambda * dx, py = p.y + lambda * dy;
  const distanceSquared = (projection.pointerX - px) ** 2 + (projection.pointerY - py) ** 2;
  // 화면 lambda를 그대로 t로 쓰지 않는다. clip w의 역가중 보간 뒤 원본 t구간으로 되돌린다.
  const scale = Math.max(start.w, end.w), wa = start.w / scale, wb = end.w / scale;
  const denominator = (1 - lambda) * wb + lambda * wa;
  if (!(denominator > 0)) stop("invalid-projection", "원근 보간 분모가 양수가 아닙니다.");
  const localT = lambda === 0 ? 0 : lambda === 1 ? 1 : lambda * wa / denominator;
  const t = localT === 0 ? t0 : localT === 1 ? t1 : t0 + (t1 - t0) * localT;
  if (!Number.isFinite(t) || t < 0 || t > 1) stop("invalid-projection", "원본 모서리 매개변수가 0~1 범위를 벗어났습니다.");
  const anchor: StudioBoundaryChordAnchor = t === 0 ? { kind: "vertex", vertexId: origin }
    : t === 1 ? { kind: "vertex", vertexId: edge.vertex } : { kind: "edge", halfEdgeId, t };
  return { anchor, distanceSquared, tieId: halfEdgeId };
}

/** mode/투영 값은 기존 screen-selection callsite 그대로이며 source와 hit는 실제 선택 권위로 재검증한다. */
export function collectStudioHybridDccBoundaryEndpoint(source: StudioHybridDccMeshSelectionSource,
  selection: StudioHybridDccComponentSelection, hit: StudioHybridDccRayHitMapping,
  mode: "vertex" | "edge", input: StudioBoundaryEndpointProjection): StudioBoundaryEndpointResult<StudioBoundaryEndpointLease> {
  try {
    const faceId = selectedFace(source, selection), projection = prepareProjection(input);
    if (!sameProvenance(hit.provenance, source)) stop("stale-hit", "표시 hit의 원본·버전이 현재 선택과 다릅니다.");
    const remapped = mapStudioHybridDccRayFaceIndex(source, hit.faceIndex);
    if (!remapped.ok) stop("stale-hit", "표시 hit를 현재 원본 surface로 다시 찾지 못했습니다.");
    if (hit.faceId !== remapped.value.faceId || remapped.value.faceId !== faceId) stop("outside-face", "현재 선택한 면의 실제 boundary에서 endpoint를 골라 주세요.");
    const candidates: Candidate[] = [];
    if (mode === "vertex") {
      for (const id of remapped.value.vertexCandidateIds) {
        const point = clipPoint(source, id, projection);
        if (point.w <= 0 || planes(point, projection).some((distance) => distance < 0)) continue;
        const projected = screen(point, projection);
        candidates.push({ anchor: { kind: "vertex", vertexId: id }, tieId: id,
          distanceSquared: (projection.pointerX - projected.x) ** 2 + (projection.pointerY - projected.y) ** 2 });
      }
    } else if (mode === "edge") {
      for (const edge of remapped.value.edgeCandidates) {
        const candidate = edgeCandidate(source, edge.id, projection); if (candidate) candidates.push(candidate);
      }
    } else stop("invalid-projection", "지원하지 않는 endpoint 선택 모드입니다.");
    if (candidates.length === 0) stop("degenerate-projection", "현재 clip 범위에서 선택할 수 있는 boundary가 없습니다.");
    const nearest = need(candidates.toSorted((a, b) => a.distanceSquared - b.distanceSquared || a.tieId - b.tieId)[0]);
    if (nearest.distanceSquared > projection.radiusSquared) stop("outside-boundary", "실제 경계의 근접 반경 밖입니다. 면 내부의 임의 점을 만들지 않습니다.");
    const lease: StudioBoundaryEndpointLease = Object.freeze({ sourceMesh: source.mesh, faceId,
      provenance: Object.freeze({ assetId: source.assetId, meshRevision: source.meshRevision, sourceHash: source.sourceHash }),
      anchor: Object.freeze(nearest.anchor) });
    issued.add(lease); return { ok: true, value: lease };
  } catch (error) { return failed<StudioBoundaryEndpointLease>(error); }
}

/** async preview/commit 전후 caller가 최신 source/selection을 전달한다. DTO 복사로 lease 권위를 복제하지 못한다. */
export function admitStudioHybridDccBoundaryEndpoint(lease: StudioBoundaryEndpointLease,
  currentSource: StudioHybridDccMeshSelectionSource, currentSelection: StudioHybridDccComponentSelection): StudioBoundaryEndpointResult<StudioBoundaryChordAnchor> {
  try {
    if (!issued.has(lease)) stop("untrusted-endpoint", "이 수집기에서 발급한 endpoint lease가 아닙니다.");
    if (lease.sourceMesh !== currentSource.mesh || !sameProvenance(lease.provenance, currentSource)) stop("stale-endpoint", "endpoint를 수집한 자산·geometry·hash·편집 버전이 바뀌었습니다.");
    if (selectedFace(currentSource, currentSelection) !== lease.faceId) stop("stale-endpoint", "endpoint를 수집한 면 선택이 바뀌었습니다.");
    return { ok: true, value: lease.anchor };
  } catch (error) { return failed<StudioBoundaryChordAnchor>(error); }
}

interface Marker { readonly key: number; readonly position: readonly [number, number, number] }
type SourceAsset = Pick<StudioHybridDccMeshSelectionSource, "assetId" | "mesh" | "meshRevision"> & { readonly meshHash: string };
/** 원본 mesh와 선택에서 발급 권위를 다시 확인한다. 화면 좌표나 Float32 표시 stream을 역산하지 않는다. */
export function studioHybridDccBoundaryEndpointMarkerPositions(asset: SourceAsset,
  selection: StudioHybridDccComponentSelection | undefined, leases: readonly StudioBoundaryEndpointLease[]): readonly Marker[] {
  if (!selection || leases.length > 2) return [];
  const source = { assetId: asset.assetId, mesh: asset.mesh, sourceHash: asset.meshHash, meshRevision: asset.meshRevision };
  const markers: Marker[] = [];
  leases.forEach((lease, key) => {
    const admitted = admitStudioHybridDccBoundaryEndpoint(lease, source, selection);
    if (!admitted.ok) return;
    const anchor = admitted.value;
    if (anchor.kind === "vertex") {
      const p = asset.mesh.vertices[anchor.vertexId]?.position;
      if (p) markers.push({ key, position: [p.x, p.y, p.z] });
      return;
    }
    const edge = asset.mesh.halfEdges[anchor.halfEdgeId], origin = edge && asset.mesh.halfEdges[edge.prev]?.vertex;
    if (!edge || origin === undefined) return;
    const low = Math.min(origin, edge.vertex), high = Math.max(origin, edge.vertex);
    const a = asset.mesh.vertices[low]?.position, b = asset.mesh.vertices[high]?.position;
    if (!a || !b) return;
    // 커널과 같은 canonical 방향·f64 연산으로 반대쪽 twin에서도 같은 위치를 얻는다.
    const t = origin === low ? anchor.t : 1 - anchor.t;
    const position: readonly [number, number, number] = [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t];
    if (position.every(Number.isFinite)) markers.push({ key, position });
  });
  return markers;
}
export const studioHybridDccBoundaryEndpointMarkerRaycast = (): undefined => undefined;
