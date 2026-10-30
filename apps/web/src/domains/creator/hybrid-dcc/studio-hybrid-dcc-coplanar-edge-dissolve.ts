/** 선택한 공유 모서리만 지워 공면인 두 면을 합친다. 원본과 표시 캐시는 수정하지 않는다. */
import {
  createStudioEditableMeshFromPolygons,
  hashStudioEditableMesh,
  STUDIO_EDITABLE_MESH_LIMITS,
  validateStudioEditableMeshSerializableAuthority,
  type StudioEditableHalfEdge,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";
import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import { STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET } from "../mesh-surface/studio-mesh-surface-interactive-budget";
import { planStudioMeshSurface, type StudioMeshSurfacePlan } from "../mesh-surface/studio-mesh-surface-plan";
import { verifyStudioCoplanarEdgeDissolveFields } from "./studio-hybrid-dcc-coplanar-edge-fields";
import {
  buildStudioPlanarFrame, describeStudioPlanarPolygon, projectToStudioPlanarFrame,
} from "./studio-hybrid-dcc-face-modeling-geometry";

export interface StudioCoplanarEdgeDissolveSource {
  readonly mesh: StudioEditableMesh;
  readonly meshHash: string;
  /** 스키마 revision과 별개인 실제 geometry record의 편집 버전이다. */
  readonly meshRevision: number;
}
export interface StudioCoplanarEdgeDissolveRequest {
  readonly sourceMeshHash: string;
  readonly sourceMeshRevision: number;
  readonly halfEdgeIds: readonly number[];
}
export type StudioCoplanarEdgeDissolveFailureCode = "invalid-source" | "stale-source" | "invalid-selection"
  | "non-manifold" | "non-coplanar" | "unselected-seam" | "unsupported-boundary" | "attribute-conflict"
  | "unsupported-uv" | "unsupported-normal-field" | "unrenderable-source" | "unrenderable-result"
  | "budget-exceeded" | "invalid-result";
export interface StudioCoplanarEdgeDissolveVertexRemap {
  readonly sourceVertexId: number;
  readonly resultVertexIds: readonly number[];
}
export interface StudioCoplanarEdgeDissolveFaceRemap {
  readonly sourceFaceId: number;
  readonly resultFaceIds: readonly number[];
}
export interface StudioCoplanarEdgeDissolveHalfEdgeRemap {
  readonly sourceHalfEdgeId: number;
  readonly resultHalfEdgeIds: readonly number[];
}
export type StudioCoplanarEdgeDissolveResult = {
  readonly ok: true;
  readonly mesh: StudioEditableMesh;
  readonly sourceMeshHash: string;
  readonly sourceMeshRevision: number;
  readonly resultMeshHash: string;
  readonly sourceFaceIds: readonly [number, number];
  readonly mergedFaceId: number;
  readonly removedHalfEdgeIds: readonly number[];
  readonly vertexRemap: readonly StudioCoplanarEdgeDissolveVertexRemap[];
  readonly faceRemap: readonly StudioCoplanarEdgeDissolveFaceRemap[];
  readonly halfEdgeRemap: readonly StudioCoplanarEdgeDissolveHalfEdgeRemap[];
} | { readonly ok: false; readonly code: StudioCoplanarEdgeDissolveFailureCode; readonly detail: string };

class DissolveFailure extends Error {
  constructor(readonly code: StudioCoplanarEdgeDissolveFailureCode, detail: string) { super(detail); }
}
function stop(code: StudioCoplanarEdgeDissolveFailureCode, detail: string): never {
  throw new DissolveFailure(code, detail);
}
function need<T>(value: T | undefined, detail: string): T {
  if (value === undefined) stop("invalid-result", detail);
  return value;
}
function edge(mesh: StudioEditableMesh, id: number): StudioEditableHalfEdge {
  return need(mesh.halfEdges[id], "대응하는 원본 half-edge가 없습니다.");
}
function origin(mesh: StudioEditableMesh, id: number): number {
  return edge(mesh, edge(mesh, id).prev).vertex;
}
function position(mesh: StudioEditableMesh, id: number): StudioMeshVec3 {
  return need(mesh.vertices[id], "대응하는 원본 정점이 없습니다.").position;
}
function surface(mesh: StudioEditableMesh, phase: "source" | "result"): StudioMeshSurfacePlan {
  // 현재 hash를 통과한 뒤에도 같은 root identity의 과거 표시 cache를 검증 근거로 쓰지 않는다.
  // 동기 계산 동안 배열·코너를 수정하지 않으므로 새 root로 현재 값의 계획을 만들 수 있다.
  const current: StudioEditableMesh = { ...mesh };
  const planned = planStudioMeshSurface(current, STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET,
    { allowCreaseMetadata: true, topologyPolicy: "editable" });
  if (!planned.ok) {
    const code = planned.issue.code;
    stop(code === "mesh-budget-exceeded" || code === "surface-budget-exceeded" || code === "face-corner-budget-exceeded"
      ? "budget-exceeded" : phase === "source" ? "unrenderable-source" : "unrenderable-result", planned.issue.detail);
  }
  // 표면 계획뿐 아니라 실제 viewport의 smooth/crease 조합 제한도 그대로 적용한다.
  const interactive = inspectStudioMeshSurfaceForInteractiveProjection(current);
  if (!interactive.ok) stop(phase === "source" ? "unrenderable-source" : "unrenderable-result", interactive.message);
  return interactive.value.plan;
}
function faceEdges(plan: StudioMeshSurfacePlan, faceId: number): readonly number[] {
  const mesh = plan.validated.sourceMesh;
  const face = need(plan.validated.faceById.get(faceId), "현재 면의 실제 외곽 루프가 없습니다.");
  const loop: number[] = [];
  let current = face.he;
  for (let index = 0; index < mesh.halfEdges.length; index += 1) {
    const halfEdge = edge(mesh, current);
    if (halfEdge.face !== faceId) stop("invalid-result", "면 외곽의 half-edge 소유자가 다릅니다.");
    loop.push(current); current = halfEdge.next;
    if (current === face.he) return loop;
  }
  return stop("invalid-result", "면의 실제 half-edge 루프가 닫히지 않습니다.");
}

interface Seam {
  readonly faces: readonly [number, number];
  readonly removed: ReadonlySet<number>;
}
function selectedSeam(mesh: StudioEditableMesh, plan: StudioMeshSurfacePlan, ids: readonly number[]): Seam {
  if (!Array.isArray(ids) || ids.length === 0) stop("invalid-selection", "삭제할 공유 모서리를 선택해 주세요.");
  if (ids.length > STUDIO_EDITABLE_MESH_LIMITS.maxSelection) stop("budget-exceeded", "모서리 선택 예산을 초과했습니다.");
  const removed = new Set<number>(), selectedKeys = new Set<string>();
  let faces: readonly [number, number] | undefined;
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (!Object.hasOwn(ids, index) || id === undefined || !Number.isSafeInteger(id) || id < 0 || id >= mesh.halfEdges.length) {
      stop("invalid-selection", "선택한 half-edge ID가 현재 메시의 모서리가 아닙니다.");
    }
    const first = edge(mesh, id), twin = mesh.halfEdges[first.twin];
    if (!twin || twin.twin !== first.id || first.face === twin.face || first.face < 0 || twin.face < 0
      || origin(mesh, first.id) !== twin.vertex || origin(mesh, twin.id) !== first.vertex) {
      stop("non-manifold", "서로 반대 방향인 두 면의 공유 모서리만 삭제할 수 있습니다.");
    }
    const pair: readonly [number, number] = first.face < twin.face ? [first.face, twin.face] : [twin.face, first.face];
    if (faces && (faces[0] !== pair[0] || faces[1] !== pair[1])) {
      stop("invalid-selection", "선택한 모든 모서리는 같은 두 면 사이의 경계여야 합니다.");
    }
    faces = pair;
    removed.add(first.id); removed.add(twin.id);
    selectedKeys.add(`${Math.min(first.vertex, twin.vertex)}|${Math.max(first.vertex, twin.vertex)}`);
  }
  const pair = need(faces, "공유 모서리의 두 면을 찾지 못했습니다.");
  let covered = 0;
  for (const use of plan.validated.edgeUses) {
    if (!selectedKeys.has(use.key)) continue;
    if (use.halfEdges.length !== 2 || use.halfEdges.some((halfEdge) => !removed.has(halfEdge.id))) {
      stop("non-manifold", "선택한 모서리에 두 면을 넘는 사용 또는 다른 half-edge가 있습니다.");
    }
    covered += 1;
  }
  if (covered !== selectedKeys.size) stop("non-manifold", "선택한 모서리의 실제 표면 사용을 확인하지 못했습니다.");
  for (const id of faceEdges(plan, pair[0])) {
    const halfEdge = edge(mesh, id), twin = mesh.halfEdges[halfEdge.twin];
    if (twin?.face === pair[1] && (!removed.has(id) || !removed.has(twin.id))) {
      stop("unselected-seam", "두 면 사이에 선택하지 않은 공유 모서리가 남아 있습니다. 함께 삭제할 경계를 명시해 주세요.");
    }
  }
  return { faces: pair, removed };
}

/** 삭제된 seam을 제외한 유향 경계가 한 개의 단순 cycle인지 확인한다. 홀은 연결선으로 위장하지 않는다. */
function exterior(mesh: StudioEditableMesh, plan: StudioMeshSurfacePlan, seam: Seam): readonly number[] {
  const remaining = [...faceEdges(plan, seam.faces[0]), ...faceEdges(plan, seam.faces[1])]
    .filter((id) => !seam.removed.has(id));
  if (remaining.length < 3) stop("unsupported-boundary", "합친 면에 유효한 외곽이 남지 않습니다.");
  if (remaining.length > STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET.maxFaceCorners) {
    stop("budget-exceeded", "합친 면의 코너 수가 실제 viewport 예산을 초과합니다.");
  }
  const outgoing = new Map<number, number>(), incoming = new Map<number, number>();
  for (const id of remaining) {
    const from = origin(mesh, id), to = edge(mesh, id).vertex;
    if (from === to || outgoing.has(from) || incoming.has(to)) {
      stop("unsupported-boundary", "자기접촉하거나 분기하는 외곽은 한 면의 단일 루프로 표현할 수 없습니다.");
    }
    outgoing.set(from, id); incoming.set(to, id);
  }
  for (const vertex of outgoing.keys()) {
    if (!incoming.has(vertex)) stop("unsupported-boundary", "합친 면의 외곽이 닫히지 않습니다.");
  }
  let firstVertex = Number.POSITIVE_INFINITY;
  for (const vertex of outgoing.keys()) firstVertex = Math.min(firstVertex, vertex);
  const first = need(outgoing.get(firstVertex), "외곽의 시작 half-edge가 없습니다.");
  const loop: number[] = [], seen = new Set<number>();
  let current = first;
  while (!seen.has(current)) {
    seen.add(current); loop.push(current);
    current = need(outgoing.get(edge(mesh, current).vertex), "외곽의 다음 half-edge가 없습니다.");
    if (loop.length > remaining.length) stop("unsupported-boundary", "외곽 추적 범위를 초과했습니다.");
  }
  if (current !== first || loop.length !== remaining.length) {
    stop("unsupported-boundary", "홀 또는 분리된 여러 외곽은 현재 단일 루프 면으로 합칠 수 없습니다.");
  }
  return loop;
}

interface Area {
  readonly vector: StudioMeshVec3;
  readonly magnitude: number;
  readonly workScale: number;
}
/** 원점에서 먼 메시도 공통 이동값을 먼저 빼고 합산하여 면적 계산의 불필요한 상쇄를 줄인다. */
function area(mesh: StudioEditableMesh, loop: readonly number[]): Area {
  const anchor = position(mesh, origin(mesh, need(loop[0], "면적을 계산할 외곽이 없습니다.")));
  const sums = [0, 0, 0], compensation = [0, 0, 0];
  let workScale = 0;
  for (const id of loop) {
    const a = position(mesh, origin(mesh, id)), b = position(mesh, edge(mesh, id).vertex);
    const ax = a.x - anchor.x, ay = a.y - anchor.y, az = a.z - anchor.z;
    const bx = b.x - anchor.x, by = b.y - anchor.y, bz = b.z - anchor.z;
    const cross = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
    workScale += Math.abs(ay * bz) + Math.abs(az * by) + Math.abs(az * bx)
      + Math.abs(ax * bz) + Math.abs(ax * by) + Math.abs(ay * bx);
    for (let axis = 0; axis < 3; axis += 1) {
      const previous = need(sums[axis], "면적 합산 축이 없습니다."), correction = need(compensation[axis], "면적 보정 축이 없습니다.");
      const term = need(cross[axis], "면적 외적 축이 없습니다.") - correction, next = previous + term;
      compensation[axis] = (next - previous) - term; sums[axis] = next;
    }
  }
  const vector = { x: need(sums[0], "면적 X가 없습니다."), y: need(sums[1], "면적 Y가 없습니다."), z: need(sums[2], "면적 Z가 없습니다.") };
  const magnitude = Math.hypot(vector.x, vector.y, vector.z);
  if (![vector.x, vector.y, vector.z, magnitude, workScale].every(Number.isFinite) || magnitude <= 0) {
    stop("non-coplanar", "면적과 방향을 유한 정밀도에서 안정적으로 계산할 수 없습니다.");
  }
  return { vector, magnitude, workScale };
}
function coplanarCoverage(mesh: StudioEditableMesh, plan: StudioMeshSurfacePlan, seam: Seam, loop: readonly number[]): void {
  const firstLoop = faceEdges(plan, seam.faces[0]), secondLoop = faceEdges(plan, seam.faces[1]);
  const first = area(mesh, firstLoop), second = area(mesh, secondLoop), combined = area(mesh, loop);
  const normal = { x: first.vector.x / first.magnitude, y: first.vector.y / first.magnitude, z: first.vector.z / first.magnitude };
  const normalError = first.workScale / first.magnitude * firstLoop.length * Number.EPSILON * 64;
  if (!Number.isFinite(normalError)) stop("non-coplanar", "기준 평면의 법선을 안정적으로 계산할 수 없습니다.");
  if (normal.x * second.vector.x + normal.y * second.vector.y + normal.z * second.vector.z <= 0) {
    stop("non-coplanar", "반대 방향이거나 겹쳐 접히는 두 면은 합칠 수 없습니다.");
  }
  const anchor = position(mesh, origin(mesh, need(firstLoop[0], "기준 면의 시작점이 없습니다.")));
  for (const id of [...firstLoop, ...secondLoop]) {
    const p = position(mesh, origin(mesh, id)), dx = p.x - anchor.x, dy = p.y - anchor.y, dz = p.z - anchor.z;
    const distance = dx * normal.x + dy * normal.y + dz * normal.z;
    // 공통 이동에 무관한 차이 좌표로 오차를 제한한다. 큰 월드 좌표를 비공면 허용폭으로 사용하지 않는다.
    const roundoff = (Math.abs(dx * normal.x) + Math.abs(dy * normal.y) + Math.abs(dz * normal.z)) * Number.EPSILON * 8
      + (Math.abs(dx) + Math.abs(dy) + Math.abs(dz)) * normalError;
    if (!Number.isFinite(distance) || !Number.isFinite(roundoff) || Math.abs(distance) > roundoff) {
      stop("non-coplanar", "두 면의 모든 코너가 같은 평면에 있지 않습니다.");
    }
  }
  const boundaryPoints = loop.map((id) => position(mesh, origin(mesh, id)));
  const frame = buildStudioPlanarFrame(boundaryPoints);
  if (!frame) stop("unsupported-boundary", "합친 면의 평면 외곽을 안정적으로 계산할 수 없습니다.");
  const projected = boundaryPoints.map((point) => projectToStudioPlanarFrame(frame, point));
  if (projected.some((point) => point.some((value) => !Number.isFinite(value)))) {
    stop("unsupported-boundary", "합친 외곽의 평면 좌표가 유한하지 않습니다.");
  }
  const shape = describeStudioPlanarPolygon(projected);
  if (!shape.simple || shape.spikeCorners.length > 0 || shape.selfContact !== null) {
    stop("unsupported-boundary", "자체 교차·자기접촉·되접힘이 있는 외곽은 단일 면으로 합칠 수 없습니다.");
  }
  const difference = Math.hypot(combined.vector.x - first.vector.x - second.vector.x,
    combined.vector.y - first.vector.y - second.vector.y, combined.vector.z - first.vector.z - second.vector.z);
  const bound = (first.workScale + second.workScale + combined.workScale) * Number.EPSILON
    * (firstLoop.length + secondLoop.length + loop.length) * 32;
  if (!Number.isFinite(bound) || !Number.isFinite(difference) || difference > bound
    || Math.abs(combined.magnitude - first.magnitude - second.magnitude) > bound
    || normal.x * combined.vector.x + normal.y * combined.vector.y + normal.z * combined.vector.z <= 0) {
    stop("invalid-result", "선택 경계 삭제 전후의 면적·방향·외곽 coverage가 일치하지 않습니다.");
  }
}

interface OutputLoop {
  readonly sourceFaceId: number;
  readonly edges: readonly number[];
}
interface Built {
  readonly mesh: StudioEditableMesh;
  readonly mergedFaceId: number;
  readonly sourceFaceToOutput: readonly number[];
  readonly sourceHalfEdgeToOutput: readonly number[];
  readonly outputHalfEdgeToSource: readonly number[];
}
function rebuild(source: StudioEditableMesh, plan: StudioMeshSurfacePlan, seam: Seam, boundary: readonly number[]): Built {
  const keepFace = need(source.faces[seam.faces[0]], "합칠 원본 면이 없습니다.");
  const otherFace = need(source.faces[seam.faces[1]], "합칠 이웃 면이 없습니다.");
  if (keepFace.materialSlot !== otherFace.materialSlot || keepFace.smooth !== otherFace.smooth) {
    stop("attribute-conflict", "두 면의 재질 또는 smooth가 달라 한 면 속성으로 보존할 수 없습니다.");
  }
  const loops: OutputLoop[] = [], sourceFaceToOutput = new Array<number>(source.faces.length).fill(-1);
  for (const face of source.faces) {
    if (face.id === otherFace.id) continue;
    const outputId = loops.length;
    sourceFaceToOutput[face.id] = outputId;
    if (face.id === keepFace.id) sourceFaceToOutput[otherFace.id] = outputId;
    loops.push({ sourceFaceId: face.id, edges: face.id === keepFace.id ? boundary : faceEdges(plan, face.id) });
  }
  const positions = source.vertices.map(({ position: p }) => ({ x: p.x, y: p.y, z: p.z }));
  const polygons = loops.map((entry) => entry.edges.map((id) => origin(source, id)));
  const generated = createStudioEditableMeshFromPolygons(positions, polygons);
  const sourceHalfEdgeToOutput = new Array<number>(source.halfEdges.length).fill(-1);
  const outputHalfEdgeToSource = new Array<number>(generated.halfEdges.length).fill(-1);
  for (const [faceId, entry] of loops.entries()) {
    const face = need(generated.faces[faceId], "생성한 실제 면의 ID가 없습니다.");
    let next = face.he;
    for (const oldId of entry.edges) {
      const actual = edge(generated, next), original = edge(source, oldId);
      if (actual.face !== face.id || origin(generated, actual.id) !== origin(source, oldId) || actual.vertex !== original.vertex
        || need(sourceHalfEdgeToOutput[oldId], "원본 대응이 없습니다.") !== -1
        || need(outputHalfEdgeToSource[actual.id], "결과 대응이 없습니다.") !== -1) {
        stop("invalid-result", "살아남는 유향 half-edge를 원본과 일대일로 대응시키지 못했습니다.");
      }
      sourceHalfEdgeToOutput[oldId] = actual.id; outputHalfEdgeToSource[actual.id] = oldId;
      next = actual.next;
    }
    if (next !== face.he) stop("invalid-result", "생성한 면과 원본 외곽의 코너 수가 다릅니다.");
  }
  const base: StudioEditableMesh = {
    ...generated,
    vertices: generated.vertices.map((vertex) => ({ ...vertex, crease: need(source.vertices[vertex.id], "원본 정점 속성이 없습니다.").crease })),
    halfEdges: generated.halfEdges.map((halfEdge) => ({ ...halfEdge,
      crease: edge(source, need(outputHalfEdgeToSource[halfEdge.id], "유향 모서리 속성의 원본이 없습니다.")).crease })),
    faces: generated.faces.map((face) => {
      const original = need(source.faces[need(loops[face.id], "면 속성 대응이 없습니다.").sourceFaceId], "원본 면 속성이 없습니다.");
      return { ...face, materialSlot: original.materialSlot, smooth: original.smooth };
    }),
  };
  const mesh: StudioEditableMesh = source.uvLayer === undefined ? base : { ...base,
    uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(base),
      corners: base.halfEdges.map((halfEdge) => {
        const oldId = need(outputHalfEdgeToSource[halfEdge.id], "UV 원본 half-edge가 없습니다.");
        const uv = need(source.uvLayer?.corners[oldId], "살아남는 원본 UV 코너가 없습니다.");
        return { halfEdgeId: halfEdge.id, u: uv.u, v: uv.v };
      }) }, base) };
  for (const original of source.halfEdges) {
    const target = need(sourceHalfEdgeToOutput[original.id], "전체 half-edge 대응이 없습니다.");
    if ((target === -1) !== seam.removed.has(original.id)) stop("invalid-result", "명시하지 않은 모서리가 삭제되었거나 선택 seam이 남았습니다.");
    if (target >= 0) {
      const actual = edge(mesh, target), twinTarget = original.twin < 0 ? -1
        : need(sourceHalfEdgeToOutput[original.twin], "반대 방향 대응이 없습니다.");
      if (actual.twin !== twinTarget) stop("invalid-result", "살아남는 모서리의 twin 연결이 달라졌습니다.");
    }
  }
  return { mesh, mergedFaceId: need(sourceFaceToOutput[keepFace.id], "합친 면의 결과 ID가 없습니다."),
    sourceFaceToOutput, sourceHalfEdgeToOutput, outputHalfEdgeToSource };
}

export function dissolveStudioHybridDccCoplanarEdges(
  source: StudioCoplanarEdgeDissolveSource,
  request: StudioCoplanarEdgeDissolveRequest,
): StudioCoplanarEdgeDissolveResult {
  try {
    const authority = validateStudioEditableMeshSerializableAuthority(source.mesh);
    if (!authority.ok) stop(authority.code === "budget-exceeded" ? "budget-exceeded" : "invalid-source", authority.detail);
    if (!Number.isSafeInteger(source.meshRevision) || source.meshRevision < 1) stop("invalid-source", "현재 geometry 편집 버전이 유효하지 않습니다.");
    if (source.meshHash !== hashStudioEditableMesh(source.mesh)
      || request.sourceMeshHash !== source.meshHash || request.sourceMeshRevision !== source.meshRevision) {
      stop("stale-source", "현재 geometry의 hash 또는 편집 버전이 요청과 다릅니다.");
    }
    const sourcePlan = surface(source.mesh, "source"), seam = selectedSeam(source.mesh, sourcePlan, request.halfEdgeIds);
    const boundary = exterior(source.mesh, sourcePlan, seam);
    coplanarCoverage(source.mesh, sourcePlan, seam, boundary);
    const built = rebuild(source.mesh, sourcePlan, seam, boundary);
    const canonical = validateStudioEditableMeshSerializableAuthority(built.mesh);
    if (!canonical.ok) stop("invalid-result", canonical.detail);
    const resultPlan = surface(built.mesh, "result"), resultEdges = faceEdges(resultPlan, built.mergedFaceId);
    if (built.mesh.faces.length !== source.mesh.faces.length - 1
      || built.mesh.halfEdges.length !== source.mesh.halfEdges.length - seam.removed.size
      || built.mesh.vertices.length !== source.mesh.vertices.length || resultEdges.length !== boundary.length) {
      stop("invalid-result", "두 면 병합의 전체 정점·면·half-edge coverage가 다릅니다.");
    }
    const fields = verifyStudioCoplanarEdgeDissolveFields(source.mesh, built.mesh, seam.faces, built.mergedFaceId);
    if (!fields.ok) stop(fields.code, fields.detail);
    if (hashStudioEditableMesh(source.mesh) !== source.meshHash) stop("stale-source", "병합을 준비하는 동안 원본 geometry가 바뀌었습니다.");
    const resultMeshHash = hashStudioEditableMesh(built.mesh);
    if (resultMeshHash === source.meshHash) stop("invalid-result", "공유 모서리가 삭제되지 않은 결과입니다.");
    return {
      ok: true, mesh: built.mesh, sourceMeshHash: source.meshHash, sourceMeshRevision: source.meshRevision,
      resultMeshHash, sourceFaceIds: seam.faces, mergedFaceId: built.mergedFaceId,
      removedHalfEdgeIds: [...seam.removed].sort((a, b) => a - b),
      vertexRemap: source.mesh.vertices.map(({ id }) => ({ sourceVertexId: id, resultVertexIds: [id] })),
      faceRemap: source.mesh.faces.map(({ id }) => ({ sourceFaceId: id,
        resultFaceIds: [need(built.sourceFaceToOutput[id], "전체 면 대응이 없습니다.")] })),
      halfEdgeRemap: source.mesh.halfEdges.map(({ id }) => {
        const output = need(built.sourceHalfEdgeToOutput[id], "전체 half-edge 대응이 없습니다.");
        return { sourceHalfEdgeId: id, resultHalfEdgeIds: output < 0 ? [] : [output] };
      }),
    };
  } catch (error) {
    return error instanceof DissolveFailure ? { ok: false, code: error.code, detail: error.message }
      : { ok: false, code: "invalid-result", detail: error instanceof Error ? error.message : "두 면의 공유 경계를 합치지 못했습니다." };
  }
}
