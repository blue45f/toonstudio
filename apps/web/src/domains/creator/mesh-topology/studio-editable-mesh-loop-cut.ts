/** 사각 면 띠의 실제 분할. 커널 함수는 주입받아 메시 정본 모듈과 순환 참조하지 않는다. */
import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology, type StudioMeshUvCorner } from "../mesh-uv/studio-mesh-uv-authority";

import {
  STUDIO_HYBRID_DCC_MAX_FACE_LOOP_VERTICES,
  validateStudioHybridDccQuadPolygon,
  type StudioHybridDccPolygonPoint3,
} from "../mesh-surface/studio-mesh-surface-polygon";

import type { StudioEditableFace, StudioEditableHalfEdge, StudioEditableMesh, StudioEditableMeshFailureCode, StudioEditableMeshResult, StudioMeshVec3 } from "../studio-editable-half-edge-mesh";

export interface StudioEditableMeshLoopCutKernel {
  readonly createMeshFromPolygons: (positions: readonly StudioMeshVec3[], faces: readonly (readonly number[])[]) => StudioEditableMesh;
  readonly validateAuthority: (mesh: StudioEditableMesh) => StudioEditableMeshResult<unknown>;
  readonly validateManifold: (mesh: StudioEditableMesh) => StudioEditableMeshResult<unknown>;
  readonly limits: { readonly maxVertices: number; readonly maxEdges: number; readonly maxFaces: number };
}

class StudioLoopCutFailure extends Error {
  constructor(readonly code: StudioEditableMeshFailureCode, detail: string) { super(detail); }
}

function stop(code: StudioEditableMeshFailureCode, detail: string): never {
  throw new StudioLoopCutFailure(code, detail);
}

function required<T>(value: T | undefined, detail: string): T {
  if (value === undefined) stop("invalid-mesh", detail);
  return value;
}

interface FaceLoop {
  readonly source: StudioEditableFace;
  readonly edges: readonly StudioEditableHalfEdge[];
}

interface EdgeCut {
  readonly low: number;
  readonly high: number;
  /** seed의 출발→도착 방향을 최소 ID→최대 ID 방향으로 옮긴 반전 여부다. */
  readonly reversed: boolean;
  readonly vertex: number;
}

interface FaceCut {
  readonly firstEdge: number;
  readonly secondEdge: number;
  readonly normal: StudioHybridDccPolygonPoint3;
}
interface OutputCorner {
  readonly vertex: number;
  /** 이 코너에서 다음 코너로 나가는 segment의 원본 crease다. */
  readonly crease: number;
  readonly uv?: { readonly u: number; readonly v: number };
}
interface OutputFace { readonly source: StudioEditableFace; readonly corners: readonly OutputCorner[] }

function origin(mesh: StudioEditableMesh, edge: StudioEditableHalfEdge): number {
  return required(mesh.halfEdges[edge.prev], "절단선의 이전 반변이 없습니다.").vertex;
}

function edgeKey(a: number, b: number): string { return a < b ? `${a}|${b}` : `${b}|${a}`; }

function readFaceLoops(mesh: StudioEditableMesh): readonly FaceLoop[] {
  return mesh.faces.map((source) => {
    const edges: StudioEditableHalfEdge[] = [];
    let id = source.he;
    do {
      const edge = required(mesh.halfEdges[id], "절단선의 면 코너가 없습니다.");
      if (edge.face !== source.id || edges.length >= mesh.halfEdges.length) {
        stop("invalid-mesh", "절단선의 면 코너 순환이 닫히지 않습니다.");
      }
      edges.push(edge); id = edge.next;
    } while (id !== source.he);
    return { source, edges };
  });
}

/** 방향만 반전하고 수치에는 t 또는 1-t를 한 번만 적용해 긴 고리에서도 오차를 누적하지 않는다. */
function planCuts(mesh: StudioEditableMesh, faces: readonly FaceLoop[], seed: StudioEditableHalfEdge, kernel: StudioEditableMeshLoopCutKernel) {
  const edgeCuts = new Map<string, EdgeCut>();
  const faceCuts = new Map<number, FaceCut>();
  const register = (edge: StudioEditableHalfEdge, reversed: boolean) => {
    const a = origin(mesh, edge), b = edge.vertex, key = edgeKey(a, b);
    const canonicalReversed = (a > b) !== reversed;
    const previous = edgeCuts.get(key);
    if (previous) {
      if (previous.reversed !== canonicalReversed) stop("topology-failed", "절단 고리가 반대 방향으로 겹쳐 일관된 절단 위치를 만들 수 없습니다.");
      return;
    }
    if (mesh.vertices.length + edgeCuts.size >= kernel.limits.maxVertices) stop("budget-exceeded", "절단선의 새 정점 수가 편집 예산을 넘었습니다.");
    edgeCuts.set(key, { low: Math.min(a, b), high: Math.max(a, b), reversed: canonicalReversed, vertex: mesh.vertices.length + edgeCuts.size });
  };
  const walk = (initial: StudioEditableHalfEdge, reversed: boolean) => {
    let incoming = initial;
    for (let count = 0; count <= mesh.faces.length; count += 1) {
      const face = required(faces[incoming.face], "절단선의 입력 면이 없습니다.");
      // 삼각형·다각형에서는 면을 통과하지 않는다. 공유변의 새 코너는 결과 작성 때 반영한다.
      if (face.edges.length !== 4) return;
      register(incoming, reversed);
      const next = required(mesh.halfEdges[incoming.next], "절단선의 다음 반변이 없습니다.");
      const opposite = required(mesh.halfEdges[next.next], "절단선의 맞은편 반변이 없습니다.");
      register(opposite, !reversed);
      const previous = faceCuts.get(face.source.id);
      if (previous) {
        const samePair = (previous.firstEdge === incoming.id && previous.secondEdge === opposite.id)
          || (previous.firstEdge === opposite.id && previous.secondEdge === incoming.id);
        if (!samePair) stop("topology-failed", "절단선이 같은 사각 면을 서로 다른 방향으로 다시 통과합니다.");
        return;
      }
      const normal = validateStudioHybridDccQuadPolygon(face.edges.map((edge) => {
        const point = required(mesh.vertices[origin(mesh, edge)], "절단선 원본 면의 정점이 없습니다.").position;
        return [point.x, point.y, point.z] as const;
      }), face.source.id);
      if (mesh.faces.length + faceCuts.size >= kernel.limits.maxFaces) stop("budget-exceeded", "절단선의 새 면 수가 편집 예산을 넘었습니다.");
      faceCuts.set(face.source.id, { firstEdge: incoming.id, secondEdge: opposite.id, normal });
      if (opposite.twin < 0) return;
      incoming = required(mesh.halfEdges[opposite.twin], "절단선의 이웃 반변이 없습니다.");
    }
    stop("topology-failed", "절단 고리의 탐색이 입력 면 수 안에서 끝나지 않았습니다.");
  };
  register(seed, false);
  walk(seed, false);
  // 내부 seed에서 시작한 열린 띠도 양쪽 경계까지 자른다. 닫힌 고리는 같은 face pair에서 끝난다.
  if (seed.twin >= 0) walk(required(mesh.halfEdges[seed.twin], "절단선의 시작 이웃이 없습니다."), true);
  if (faceCuts.size === 0) stop("topology-failed", "선택한 변에 이어진 사각 면 띠가 없습니다.");
  let addedCorners = faceCuts.size * 2;
  for (const edge of mesh.halfEdges) if (edgeCuts.has(edgeKey(origin(mesh, edge), edge.vertex))) addedCorners += 1;
  if (mesh.halfEdges.length + addedCorners > kernel.limits.maxEdges) stop("budget-exceeded", "절단선의 반변 수가 편집 예산을 넘었습니다.");
  return { edgeCuts, faceCuts };
}

function cutPositions(mesh: StudioEditableMesh, edgeCuts: ReadonlyMap<string, EdgeCut>, factor: number): readonly StudioMeshVec3[] {
  const positions = mesh.vertices.map(({ position }) => position);
  for (const cut of edgeCuts.values()) {
    const a = required(mesh.vertices[cut.low], "절단선의 출발 정점이 없습니다.").position;
    const b = required(mesh.vertices[cut.high], "절단선의 도착 정점이 없습니다.").position;
    const t = cut.reversed ? 1 - factor : factor;
    // 양끝 가중합은 b-a가 overflow하는 유한 입력에도 중간 위치를 보존한다.
    const point = { x: a.x * (1 - t) + b.x * t, y: a.y * (1 - t) + b.y * t, z: a.z * (1 - t) + b.z * t };
    if (![point.x, point.y, point.z].every(Number.isFinite)
      || (point.x === a.x && point.y === a.y && point.z === a.z)
      || (point.x === b.x && point.y === b.y && point.z === b.z)) {
      stop("topology-failed", "절단 위치가 유한한 새 정점으로 표현되지 않습니다.");
    }
    positions.push(point);
  }
  return positions;
}

function sourceUv(mesh: StudioEditableMesh, id: number) {
  if (!mesh.uvLayer) return undefined;
  return required(mesh.uvLayer.corners[id], "절단선의 원본 UV 코너가 없습니다.");
}

function expandedFace(mesh: StudioEditableMesh, face: FaceLoop, edgeCuts: ReadonlyMap<string, EdgeCut>, factor: number): readonly OutputCorner[] {
  const corners: OutputCorner[] = [];
  for (const edge of face.edges) {
    const a = origin(mesh, edge), b = edge.vertex, uv = sourceUv(mesh, edge.id);
    corners.push({ vertex: a, crease: edge.crease, ...(uv ? { uv } : {}) });
    const cut = edgeCuts.get(edgeKey(a, b));
    if (!cut) continue;
    const t = cut.reversed ? 1 - factor : factor;
    // half-edge.vertex는 destination이지만 UV[edge.id]는 origin이다. 끝점 UV는 edge.next다.
    const end = sourceUv(mesh, edge.next);
    // 양쪽 면 모두 3D 절단점과 같은 low→high 순서로 계산한다. 역방향에서 t를 다시 보수하면
    // 끝점 가까운 값에 1-(1-t) 오차가 생겨 연속 UV를 거짓 seam으로 나눌 수 있다.
    const low = a === cut.low ? uv : end;
    const high = a === cut.low ? end : uv;
    const interpolated = low && high ? {
      u: Math.fround(low.u * (1 - t) + high.u * t),
      v: Math.fround(low.v * (1 - t) + high.v * t),
    } : undefined;
    if (interpolated && ![interpolated.u, interpolated.v].every(Number.isFinite)) stop("topology-failed", "절단선의 새 UV 코너가 유한 Float32 범위를 넘었습니다.");
    corners.push({ vertex: cut.vertex, crease: edge.crease, ...(interpolated ? { uv: interpolated } : {}) });
  }
  return corners;
}

function splitFace(face: FaceLoop, corners: readonly OutputCorner[], positions: readonly StudioMeshVec3[], mesh: StudioEditableMesh, sourceNormal: StudioHybridDccPolygonPoint3): readonly [readonly OutputCorner[], readonly OutputCorner[]] {
  const indices = corners.flatMap((corner, index) => corner.vertex >= mesh.vertices.length ? [index] : []);
  const [first, second] = indices;
  if (indices.length !== 2 || first === undefined || second === undefined) stop("topology-failed", "사각 면의 절단점 두 개를 확정할 수 없습니다.");
  const close = (path: readonly OutputCorner[]): readonly OutputCorner[] => path.map((corner, index) => index === path.length - 1 ? { ...corner, crease: 0 } : corner);
  const a = close(corners.slice(first, second + 1));
  const b = close([...corners.slice(second), ...corners.slice(0, first + 1)]);
  if (a.length !== 4 || b.length !== 4) stop("topology-failed", "절단선이 두 사각 면으로 이어지지 않습니다.");
  for (const path of [a, b]) {
    validateStudioHybridDccQuadPolygon(path.map(({ vertex }) => {
      const p = required(positions[vertex], "절단면의 정점이 없습니다."); return [p.x, p.y, p.z] as const;
    }), face.source.id, sourceNormal);
  }
  // 원본 face.he의 origin을 가진 child가 원본 face ID를 유지한다.
  return a.some(({ vertex }) => vertex === corners[0]?.vertex) ? [a, b] : [b, a];
}

function outputFaces(mesh: StudioEditableMesh, faces: readonly FaceLoop[], edgeCuts: ReadonlyMap<string, EdgeCut>, faceCuts: ReadonlyMap<number, FaceCut>, positions: readonly StudioMeshVec3[], factor: number): readonly OutputFace[] {
  const primary: OutputFace[] = [], children: OutputFace[] = [];
  for (const face of faces) {
    const corners = expandedFace(mesh, face, edgeCuts, factor);
    const cut = faceCuts.get(face.source.id);
    if (!cut) { primary.push({ source: face.source, corners }); continue; }
    const [first, second] = splitFace(face, corners, positions, mesh, cut.normal);
    const anchor = origin(mesh, required(face.edges[0], "원본 면의 시작 코너가 없습니다."));
    const start = first.findIndex(({ vertex }) => vertex === anchor);
    if (start < 0) stop("topology-failed", "절단면의 원본 시작 코너가 없습니다.");
    primary.push({ source: face.source, corners: [...first.slice(start), ...first.slice(0, start)] });
    children.push({ source: face.source, corners: second });
  }
  return [...primary, ...children];
}

function applyAttributes(mesh: StudioEditableMesh, base: StudioEditableMesh, faces: readonly OutputFace[]): StudioEditableMesh {
  const creases: number[] = [], corners: StudioMeshUvCorner[] = [];
  for (const face of faces) for (const corner of face.corners) {
    const id = creases.length; creases.push(corner.crease);
    if (mesh.uvLayer) {
      const uv = required(corner.uv, "절단면의 UV 코너가 누락됐습니다.");
      corners.push({ halfEdgeId: id, u: uv.u, v: uv.v });
    }
  }
  const attributed: StudioEditableMesh = {
    ...base,
    vertices: base.vertices.map((vertex) => ({ ...vertex, crease: mesh.vertices[vertex.id]?.crease ?? 0 })),
    halfEdges: base.halfEdges.map((edge) => ({ ...edge, crease: required(creases[edge.id], "절단면의 반변 속성이 누락됐습니다.") })),
    faces: base.faces.map((face) => {
      const source = required(faces[face.id], "절단면의 원본 면 속성이 누락됐습니다.").source;
      return { ...face, materialSlot: source.materialSlot, smooth: source.smooth };
    }),
  };
  return mesh.uvLayer ? { ...attributed, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(attributed), corners }, attributed) } : attributed;
}

export function loopCutEditableMesh(kernel: StudioEditableMeshLoopCutKernel, mesh: StudioEditableMesh, startHalfEdgeId: number, factor: number): StudioEditableMeshResult<StudioEditableMesh> {
  if (!Number.isFinite(factor) || factor <= 0 || factor >= 1) return { ok: false, code: "invalid-parameter", detail: "factor must be in (0,1)" };
  try {
    const admitted = kernel.validateAuthority(mesh); if (!admitted.ok) return admitted;
    const manifold = kernel.validateManifold(mesh); if (!manifold.ok) return manifold;
    const seed = mesh.halfEdges[startHalfEdgeId];
    if (!seed || !Number.isSafeInteger(startHalfEdgeId)) return { ok: false, code: "not-found", detail: `he ${startHalfEdgeId}` };
    const faces = readFaceLoops(mesh);
    const { edgeCuts, faceCuts } = planCuts(mesh, faces, seed, kernel);
    const positions = cutPositions(mesh, edgeCuts, factor);
    const output = outputFaces(mesh, faces, edgeCuts, faceCuts, positions, factor);
    for (const face of output) {
      // 비사각형 종단도 공유변의 새 코너를 받으므로 면별 동기 표시 예산을 따로 확인한다.
      if (face.corners.length > STUDIO_HYBRID_DCC_MAX_FACE_LOOP_VERTICES) {
        stop("budget-exceeded", `면 ${face.source.id}의 절단 결과가 동기 표시 코너 예산 ${STUDIO_HYBRID_DCC_MAX_FACE_LOOP_VERTICES}개를 넘었습니다.`);
      }
    }
    const base = kernel.createMeshFromPolygons(positions, output.map(({ corners }) => corners.map(({ vertex }) => vertex)));
    const result = applyAttributes(mesh, base, output);
    const valid = kernel.validateAuthority(result); if (!valid.ok) return valid;
    const closed = kernel.validateManifold(result); if (!closed.ok) return closed;
    return { ok: true, value: result };
  } catch (error) {
    return { ok: false, code: error instanceof StudioLoopCutFailure ? error.code : "topology-failed", detail: error instanceof Error ? error.message : "절단선을 만들 수 없습니다." };
  }
}
