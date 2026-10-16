/**
 * 면 단위 모델링 커널이 함께 쓰는 메시 배관: 결과 타입, 면 읽기, 속성을 지키는 재구성, 불변식 분석기.
 *
 * 순수 함수만 둔다. half-edge 권위 메시는 `createStudioEditableMeshFromPolygons`가 만든 조밀한 정규
 * 배치만 저장·복원할 수 있으므로, 토폴로지를 바꾸는 모든 연산은 면 목록을 다시 조립해 그 생성기를 거친다.
 * 불변식 분석기는 결과가 닫혀 있는지(경계 반변 없음), 방향이 한 방향으로 일관되는지, 면적이 0인 면이
 * 없는지, 뷰포트가 그릴 수 있는 볼록 평면인지를 한 번에 보고한다. 커널의 사후 조건과 시험이 같은 함수를 쓴다.
 */

import {
  createStudioEditableMeshFromPolygons,
  STUDIO_EDITABLE_MESH_LIMITS,
  validateStudioEditableMeshSerializableAuthority,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";

import {
  buildStudioPlanarFrame,
  describeStudioPlanarPolygon,
  projectToStudioPlanarFrame,
  studioPlanarFrameDistance,
} from "./studio-hybrid-dcc-face-modeling-geometry";
import { validateStudioHybridDccFanPolygon } from "./studio-hybrid-dcc-polygon-validation";

export const STUDIO_FACE_MODELING_LIMITS = Object.freeze({
  /** 이보다 작은 거리는 도구 해상도 밖이라 거부한다(0.1 mm). */
  minDistance: 1e-4,
  /** 한 번에 움직일 수 있는 최대 거리(1 km). */
  maxDistance: 1000,
  /** 뷰포트 동기 삼각화가 받아 주는 한 면의 최대 꼭짓점 수. */
  maxFaceCorners: 128,
  /** 면 그리기에서 찍을 수 있는 최대 점 수. */
  maxDrawPoints: 64,
  /** 한 번에 처리할 최대 선택 면 수와 같은 평면 영역의 최대 면 수. */
  maxSelectionFaces: 4096,
  maxRegionFaces: 4096,
  /** 이 면 수를 넘는 메시는 끌기 중 실시간 미리보기를 건너뛰고 놓을 때만 계산한다. */
  livePreviewFaceLimit: 4000,
});

export type StudioFaceModelingFailureCode =
  | "budget-exceeded"
  | "collapse"
  | "degenerate-input"
  | "empty-selection"
  | "invalid-mesh"
  | "invalid-parameter"
  | "no-active-asset"
  | "no-coplanar-region"
  | "non-convex"
  | "not-found"
  | "out-of-face"
  | "out-of-region"
  | "selection-required"
  | "selection-stale"
  | "self-intersection"
  | "single-face-required"
  | "unrenderable-result"
  | "unsupported-face"
  | "unsupported-region"
  | "would-collide";

export interface StudioFaceModelingFailure {
  readonly ok: false;
  readonly code: StudioFaceModelingFailureCode;
  /** 개발자용 영어 한 줄. 사용자에게 보이는 문구는 화면 쪽이 code와 숫자 필드로 만든다. */
  readonly detail: string;
  /** 거리 때문에 실패했을 때 허용되는 최대 거리(0 이상). */
  readonly maxDistance?: number;
  /** 문제가 된 면 또는 점의 색인. 종류는 code로 구분한다(점 그리기는 점 색인, 그 밖에는 면 ID). */
  readonly elementIds?: readonly number[];
}

export type StudioFaceModelingResult<T> =
  | { readonly ok: true; readonly value: T }
  | StudioFaceModelingFailure;

export type StudioFaceModelingOperation = "inset" | "offset" | "draw" | "push-pull";

export interface StudioFaceModelingOutcome {
  readonly operation: StudioFaceModelingOperation;
  readonly mesh: StudioEditableMesh;
  /** 결과 메시에서 새로 생긴 면 ID(오름차순). */
  readonly createdFaceIds: readonly number[];
  /** 이어서 편집하기 좋은 선택(결과 메시의 면 ID, 오름차순). */
  readonly selectionFaceIds: readonly number[];
  /** 원본 면 ID와 결과 면 ID 쌍. 대체되거나 사라진 면은 null. 원본 ID 오름차순. */
  readonly faceRemap: readonly (readonly [number, number | null])[];
  /** 밀기/당기기가 쓴 방식. 그 밖의 연산은 없다. */
  readonly method?: "extrude" | "stretch";
}

export function failStudioFaceModeling(
  code: StudioFaceModelingFailureCode,
  detail: string,
  extra: { readonly maxDistance?: number; readonly elementIds?: readonly number[] } = {},
): StudioFaceModelingFailure {
  return {
    ok: false,
    code,
    detail,
    ...(extra.maxDistance === undefined ? {} : { maxDistance: Math.max(0, extra.maxDistance) }),
    ...(extra.elementIds === undefined ? {} : { elementIds: extra.elementIds }),
  };
}

export function okStudioFaceModeling<T>(value: T): StudioFaceModelingResult<T> {
  return { ok: true, value };
}

/** 메시 바운딩 박스 대각선 길이. 정점이 없으면 1. */
export function studioFaceModelingExtent(mesh: StudioEditableMesh): number {
  if (mesh.vertices.length === 0) return 1;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const { position } of mesh.vertices) {
    minX = Math.min(minX, position.x);
    maxX = Math.max(maxX, position.x);
    minY = Math.min(minY, position.y);
    maxY = Math.max(maxY, position.y);
    minZ = Math.min(minZ, position.z);
    maxZ = Math.max(maxZ, position.z);
  }
  const diagonal = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
  return diagonal > 0 && Number.isFinite(diagonal) ? diagonal : 1;
}

/** 이보다 짧은 모서리·여유는 만들지 않는다. 메시 크기에 비례하되 1 마이크로미터보다 작아지지 않는다. */
export function studioFaceModelingMinFeature(extent: number): number {
  return Math.max(1e-6, extent * 1e-4);
}

export interface StudioMeshFaceLoop {
  readonly id: number;
  /** 면을 이루는 정점 ID 순서(반시계). */
  readonly vertexIds: readonly number[];
  /** `halfEdgeIds[k]`는 `vertexIds[k]`에서 `vertexIds[k + 1]`로 가는 반변이다. */
  readonly halfEdgeIds: readonly number[];
  readonly materialSlot: number;
  readonly smooth: boolean;
}

/** 모든 면의 정점 순환을 읽는다. 순환이 깨져 있으면 null. */
export function readStudioMeshFaceLoops(mesh: StudioEditableMesh): StudioMeshFaceLoop[] | null {
  const loops: StudioMeshFaceLoop[] = [];
  for (const face of mesh.faces) {
    const vertexIds: number[] = [];
    const halfEdgeIds: number[] = [];
    let halfEdgeId = face.he;
    let guard = 0;
    do {
      const halfEdge = mesh.halfEdges[halfEdgeId];
      const previous = halfEdge ? mesh.halfEdges[halfEdge.prev] : undefined;
      if (!halfEdge || !previous || halfEdge.face !== face.id) return null;
      vertexIds.push(previous.vertex);
      halfEdgeIds.push(halfEdgeId);
      halfEdgeId = halfEdge.next;
      guard += 1;
      if (guard > mesh.halfEdges.length) return null;
    } while (halfEdgeId !== face.he);
    loops.push({
      id: face.id,
      vertexIds,
      halfEdgeIds,
      materialSlot: face.materialSlot,
      smooth: face.smooth,
    });
  }
  return loops;
}

export function countStudioMeshBoundaryHalfEdges(mesh: StudioEditableMesh): number {
  let count = 0;
  for (const halfEdge of mesh.halfEdges) if (halfEdge.twin < 0) count += 1;
  return count;
}

/** 입력 메시가 연산해도 되는 정규 권위 배치인지 확인한다. */
export function preflightStudioFaceModelingMesh(
  mesh: StudioEditableMesh,
): StudioFaceModelingResult<readonly StudioMeshFaceLoop[]> {
  const canonical = validateStudioEditableMeshSerializableAuthority(mesh);
  if (!canonical.ok) return failStudioFaceModeling("invalid-mesh", canonical.detail);
  const loops = readStudioMeshFaceLoops(mesh);
  if (!loops) return failStudioFaceModeling("invalid-mesh", "face half-edge cycle is broken");
  return okStudioFaceModeling(loops);
}

export interface StudioFaceBuildSpec {
  /** 결합된 정점 배열(원본 정점 + 새 정점)에 대한 색인. 반시계. */
  readonly loop: readonly number[];
  readonly materialSlot: number;
  readonly smooth: boolean;
  /** 루프 모서리(k번째는 loop[k]→loop[k+1])의 접힘 값. 없으면 모두 0. */
  readonly edgeCreases?: readonly number[];
}

/**
 * 면 목록으로 메시를 다시 만든다. 같은 방향으로 두 번 쓰인 모서리(법선 불일치), 한 면 안에서 겹친 정점,
 * 예산 초과는 만들기 전에 거부하고 면 속성(재질 슬롯·부드러움·접힘)은 명세대로 입힌다.
 */
export function buildStudioEditableMeshFromFaceSpecs(
  positions: readonly StudioMeshVec3[],
  vertexCreases: readonly number[],
  specs: readonly StudioFaceBuildSpec[],
): StudioFaceModelingResult<StudioEditableMesh> {
  if (positions.length > STUDIO_EDITABLE_MESH_LIMITS.maxVertices
    || specs.length > STUDIO_EDITABLE_MESH_LIMITS.maxFaces) {
    return failStudioFaceModeling("budget-exceeded", "result exceeds the editable mesh budget");
  }
  let corners = 0;
  const directed = new Set<number>();
  const stride = Math.max(1, positions.length);
  for (const [specIndex, spec] of specs.entries()) {
    if (spec.loop.length < 3 || new Set(spec.loop).size !== spec.loop.length) {
      return failStudioFaceModeling("invalid-mesh", `face spec ${specIndex} repeats a vertex`);
    }
    corners += spec.loop.length;
    if (corners > STUDIO_EDITABLE_MESH_LIMITS.maxEdges) {
      return failStudioFaceModeling("budget-exceeded", "result exceeds the half-edge budget");
    }
    for (let index = 0; index < spec.loop.length; index += 1) {
      const from = spec.loop[index]!;
      const to = spec.loop[(index + 1) % spec.loop.length]!;
      if (!(from >= 0 && from < positions.length && to >= 0 && to < positions.length)) {
        return failStudioFaceModeling("invalid-mesh", `face spec ${specIndex} references a missing vertex`);
      }
      const key = from * stride + to;
      if (directed.has(key)) {
        return failStudioFaceModeling("invalid-mesh", "two faces use the same directed edge");
      }
      directed.add(key);
    }
  }
  let base: StudioEditableMesh;
  try {
    base = createStudioEditableMeshFromPolygons(positions, specs.map((spec) => spec.loop));
  } catch (error) {
    return failStudioFaceModeling(
      "invalid-mesh",
      error instanceof Error ? error.message : "mesh rebuild failed",
    );
  }
  const halfEdges = base.halfEdges.map((halfEdge) => halfEdge);
  base.faces.forEach((face, faceIndex) => {
    const creases = specs[faceIndex]?.edgeCreases;
    if (!creases) return;
    let halfEdgeId = face.he;
    for (let edge = 0; edge < creases.length; edge += 1) {
      const halfEdge = halfEdges[halfEdgeId];
      if (!halfEdge) return;
      halfEdges[halfEdgeId] = { ...halfEdge, crease: creases[edge] ?? 0 };
      halfEdgeId = halfEdge.next;
    }
  });
  return okStudioFaceModeling({
    ...base,
    vertices: base.vertices.map((vertex, index) => ({ ...vertex, crease: vertexCreases[index] ?? 0 })),
    halfEdges,
    faces: base.faces.map((face, index) => ({
      ...face,
      materialSlot: specs[index]?.materialSlot ?? 0,
      smooth: specs[index]?.smooth ?? true,
    })),
  });
}

/** 면의 3D 정점 위치. 정점 ID가 조밀한 정규 메시를 전제한다. */
export function studioFaceCornerPositions(
  mesh: StudioEditableMesh,
  loop: readonly number[],
): StudioMeshVec3[] {
  return loop.map((id) => mesh.vertices[id]!.position);
}

/** 주어진 꼭짓점 순서 그대로 뷰포트의 부채꼴 삼각분할 검증을 통과하는지. */
export function isStudioPolygonRenderable(points: readonly StudioMeshVec3[]): boolean {
  try {
    validateStudioHybridDccFanPolygon(points.map((point) => [point.x, point.y, point.z] as const), -1);
    return true;
  } catch {
    return false;
  }
}

/**
 * 뷰포트가 그릴 수 있는 시작 꼭짓점을 찾는다. 뷰포트는 0번 꼭짓점에서 부채꼴로 삼각분할하므로
 * 일직선 꼭짓점이 섞인 다각형은 시작점에 따라 넓이 0인 삼각형이 생긴다. 그리지 못하면 -1.
 */
export function findRenderableStartCorner(points: readonly StudioMeshVec3[]): number {
  for (let start = 0; start < points.length; start += 1) {
    const rotated = points.map((_, index) => points[(start + index) % points.length]!);
    if (isStudioPolygonRenderable(rotated)) return start;
  }
  return -1;
}

export interface StudioMeshIntegrityReport {
  readonly faceCount: number;
  readonly usedVertexCount: number;
  readonly isolatedVertexCount: number;
  readonly edgeCount: number;
  /** 짝이 없는 반변 수. 닫힌 메시는 0. */
  readonly boundaryHalfEdges: number;
  /** 세 면 이상이 쓰는 모서리 수. */
  readonly nonManifoldEdges: number;
  /** 같은 방향으로 두 번 쓰인 모서리 수(이웃 면 법선이 서로 반대를 보는 경우). */
  readonly orientationConflicts: number;
  readonly zeroAreaFaces: readonly number[];
  readonly nonPlanarFaces: readonly number[];
  readonly nonConvexFaces: readonly number[];
  readonly duplicateVertexFaces: readonly number[];
  /** 뷰포트의 부채꼴 삼각분할 검증을 통과하지 못하는 면. `renderableFaces` 옵션을 줄 때만 채운다. */
  readonly unrenderableFaces: readonly number[];
  /** 면 부채가 하나로 이어지지 않는 정점(나비넥타이) 수. */
  readonly bowTieVertices: number;
  readonly canonical: boolean;
  /** 정점 - 모서리 + 면. 구와 같은 닫힌 메시는 2. */
  readonly eulerCharacteristic: number;
  readonly signedVolume: number;
  readonly totalArea: number;
  /** 경계 반변도 비다양체 모서리도 방향 충돌도 없다. */
  readonly closed: boolean;
}

export interface StudioMeshIntegrityOptions {
  /** 뷰포트 렌더 가능성을 검사할 면. "all"이면 전부(대형 메시에서는 비싸다). */
  readonly renderableFaces?: "all" | readonly number[];
  /** 이 값 이하의 면적은 0으로 본다. 기본은 메시 크기 제곱의 1e-12. */
  readonly areaEpsilon?: number;
}

export function analyzeStudioEditableMeshIntegrity(
  mesh: StudioEditableMesh,
  options: StudioMeshIntegrityOptions = {},
): StudioMeshIntegrityReport {
  const canonical = validateStudioEditableMeshSerializableAuthority(mesh).ok;
  const loops = readStudioMeshFaceLoops(mesh) ?? [];
  const extent = studioFaceModelingExtent(mesh);
  const areaEpsilon = options.areaEpsilon ?? extent * extent * 1e-12;
  const stride = Math.max(1, mesh.vertices.length);
  const directedCounts = new Map<number, number>();
  const undirected = new Map<number, number[]>();
  const used = new Set<number>();
  const zeroAreaFaces: number[] = [];
  const nonPlanarFaces: number[] = [];
  const nonConvexFaces: number[] = [];
  const duplicateVertexFaces: number[] = [];
  const unrenderableFaces: number[] = [];
  const renderableSet = options.renderableFaces === "all"
    ? null
    : new Set(options.renderableFaces ?? []);
  let signedVolume = 0;
  let totalArea = 0;
  const reference = mesh.vertices[0]?.position ?? { x: 0, y: 0, z: 0 };

  for (const loop of loops) {
    const ids = loop.vertexIds;
    if (new Set(ids).size !== ids.length) duplicateVertexFaces.push(loop.id);
    for (let index = 0; index < ids.length; index += 1) {
      const from = ids[index]!;
      const to = ids[(index + 1) % ids.length]!;
      used.add(from);
      const directedKey = from * stride + to;
      directedCounts.set(directedKey, (directedCounts.get(directedKey) ?? 0) + 1);
      const low = Math.min(from, to);
      const high = Math.max(from, to);
      const undirectedKey = low * stride + high;
      const faces = undirected.get(undirectedKey);
      if (faces) faces.push(loop.id);
      else undirected.set(undirectedKey, [loop.id]);
    }
    const points = ids.map((id) => mesh.vertices[id]?.position ?? { x: 0, y: 0, z: 0 });
    const frame = buildStudioPlanarFrame(points);
    if (!frame || frame.area <= areaEpsilon) {
      zeroAreaFaces.push(loop.id);
    } else {
      totalArea += frame.area;
      const planarTolerance = Math.max(1e-7, extent * 1e-5);
      if (points.some((point) => Math.abs(studioPlanarFrameDistance(frame, point)) > planarTolerance)) {
        nonPlanarFaces.push(loop.id);
      }
      const shape = describeStudioPlanarPolygon(points.map((point) => projectToStudioPlanarFrame(frame, point)));
      if (!shape.convex) nonConvexFaces.push(loop.id);
    }
    if (options.renderableFaces !== undefined && (renderableSet === null || renderableSet.has(loop.id))) {
      if (!isStudioPolygonRenderable(points)) unrenderableFaces.push(loop.id);
    }
    // 첫 정점을 기준점으로 삼은 부호 있는 부피. 닫힌 메시에서는 기준점과 무관하고, 가까운 기준점이 반올림 오차를 줄인다.
    const anchor = points[0]!;
    for (let index = 1; index + 1 < points.length; index += 1) {
      const a = { x: anchor.x - reference.x, y: anchor.y - reference.y, z: anchor.z - reference.z };
      const b = { x: points[index]!.x - reference.x, y: points[index]!.y - reference.y, z: points[index]!.z - reference.z };
      const c = {
        x: points[index + 1]!.x - reference.x,
        y: points[index + 1]!.y - reference.y,
        z: points[index + 1]!.z - reference.z,
      };
      signedVolume += (
        a.x * (b.y * c.z - b.z * c.y)
        + a.y * (b.z * c.x - b.x * c.z)
        + a.z * (b.x * c.y - b.y * c.x)
      ) / 6;
    }
  }

  let orientationConflicts = 0;
  for (const count of directedCounts.values()) if (count > 1) orientationConflicts += 1;
  let boundaryHalfEdges = 0;
  let nonManifoldEdges = 0;
  for (const faces of undirected.values()) {
    if (faces.length === 1) boundaryHalfEdges += 1;
    else if (faces.length > 2) nonManifoldEdges += 1;
  }

  // 정점마다 둘러싼 면이 모서리를 통해 하나로 이어지는지 본다.
  const facesAtVertex = new Map<number, Set<number>>();
  const links = new Map<number, [number, number][]>();
  for (const loop of loops) {
    for (const id of loop.vertexIds) {
      const set = facesAtVertex.get(id);
      if (set) set.add(loop.id);
      else facesAtVertex.set(id, new Set([loop.id]));
    }
  }
  for (const [key, faces] of undirected) {
    if (faces.length !== 2) continue;
    const low = Math.floor(key / stride);
    const high = key - low * stride;
    for (const vertex of [low, high]) {
      const list = links.get(vertex);
      const pair: [number, number] = [faces[0]!, faces[1]!];
      if (list) list.push(pair);
      else links.set(vertex, [pair]);
    }
  }
  let bowTieVertices = 0;
  for (const [vertex, faces] of facesAtVertex) {
    if (faces.size <= 1) continue;
    const parent = new Map<number, number>([...faces].map((face) => [face, face]));
    const find = (face: number): number => {
      let root = face;
      while (parent.get(root) !== root) root = parent.get(root)!;
      return root;
    };
    for (const [first, second] of links.get(vertex) ?? []) {
      const rootFirst = find(first);
      const rootSecond = find(second);
      if (rootFirst !== rootSecond) parent.set(rootFirst, rootSecond);
    }
    if (new Set([...faces].map(find)).size > 1) bowTieVertices += 1;
  }

  return {
    faceCount: loops.length,
    usedVertexCount: used.size,
    isolatedVertexCount: mesh.vertices.length - used.size,
    edgeCount: undirected.size,
    boundaryHalfEdges,
    nonManifoldEdges,
    orientationConflicts,
    zeroAreaFaces,
    nonPlanarFaces,
    nonConvexFaces,
    duplicateVertexFaces,
    unrenderableFaces,
    bowTieVertices,
    canonical,
    eulerCharacteristic: used.size - undirected.size + loops.length,
    signedVolume,
    totalArea,
    closed: boundaryHalfEdges === 0 && nonManifoldEdges === 0 && orientationConflicts === 0,
  };
}

/** 사후 조건: 연산이 새 경계·비다양체·방향 충돌·퇴화 면을 만들지 않았는지 본다. 문제가 있으면 첫 이유를 돌려준다. */
export function verifyStudioFaceModelingResult(
  source: StudioEditableMesh,
  result: StudioEditableMesh,
  createdFaceIds: readonly number[],
): StudioFaceModelingFailure | null {
  const report = analyzeStudioEditableMeshIntegrity(result, { renderableFaces: createdFaceIds });
  if (!report.canonical) {
    return failStudioFaceModeling("invalid-mesh", "result is not a canonical editable mesh");
  }
  if (report.orientationConflicts > 0 || report.nonManifoldEdges > 0) {
    return failStudioFaceModeling("invalid-mesh", "result has inconsistent face orientation");
  }
  if (report.boundaryHalfEdges !== countStudioMeshBoundaryHalfEdges(source)) {
    return failStudioFaceModeling("invalid-mesh", "result changed the open boundary");
  }
  const created = new Set(createdFaceIds);
  const degenerate = report.zeroAreaFaces.filter((face) => created.has(face));
  if (degenerate.length > 0 || report.duplicateVertexFaces.some((face) => created.has(face))) {
    return failStudioFaceModeling("collapse", "result contains a zero-area face", { elementIds: degenerate });
  }
  if (report.unrenderableFaces.length > 0 || report.nonConvexFaces.some((face) => created.has(face))) {
    return failStudioFaceModeling(
      "unrenderable-result",
      "result contains a face the viewport cannot triangulate",
      { elementIds: report.unrenderableFaces },
    );
  }
  return null;
}
