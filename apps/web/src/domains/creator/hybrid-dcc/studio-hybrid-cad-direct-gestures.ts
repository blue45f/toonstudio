/**
 * Plasticity · Shapr3D 클린룸 CAD 다이렉트 제스처·스마트 엣지 루프·라이브 커터 불리언 엔진.
 *
 * - Alt+클릭 탄젠트 연속 엣지 루프/링 자동 선택 및 호버 프리뷰 메타데이터 생성
 * - B(필렛) / C(챔퍼) 모달 드래그 제스처 상태 머신(C 전환, V 가변 반경, 숫자 패드 입력, Backspace, Enter, Escape)
 * - 최신 요청 우선(latest-wins) 디바운스 OCCT 워커 디스패치 큐 + 즉시 근사 베벨 스트립 생성
 * - Q(합집합) / W(차집합) / E(교집합) 라이브 커터 와이어프레임 고스트 세션 및 매니폴드 검증
 */

export type Vec3Tuple = readonly [number, number, number];
export interface CadMeshVertex { readonly id: string; readonly x: number; readonly y: number; readonly z: number }
export interface CadMeshEdge {
  readonly id: string;
  readonly v0: string;
  readonly v1: string;
  readonly adjacentFaceNormals: readonly [Vec3Tuple, Vec3Tuple];
}
export interface CadTopologyMesh {
  readonly vertices: readonly CadMeshVertex[];
  readonly edges: readonly CadMeshEdge[];
}
export interface TangentEdgeChainResult {
  readonly seedEdgeId: string;
  readonly orderedEdgeIds: readonly string[];
  readonly isClosedLoop: boolean;
  readonly maxObservedTurnDeg: number;
  readonly totalLengthM: number;
  readonly hoverHighlightEdgeIds: readonly string[];
}

export type CadBevelOperationMode = "fillet" | "chamfer";
export type CadGestureStateKind = "idle" | "dragging" | "committed" | "cancelled";

export interface CadOcctWorkerDispatchItem {
  readonly requestId: number;
  readonly revision: number;
  readonly mode: CadBevelOperationMode;
  readonly edgeIds: readonly string[];
  readonly startRadiusM: number;
  readonly endRadiusM: number;
  readonly variableRadius: boolean;
  readonly segments: number;
  readonly queuedAtMs: number;
}

export interface CadApproxBevelStrip {
  readonly edgeId: string;
  readonly mode: CadBevelOperationMode;
  readonly startRadiusM: number;
  readonly endRadiusM: number;
  readonly ribbonVertices: readonly Vec3Tuple[];
}

export interface CadDirectGestureSession {
  readonly status: CadGestureStateKind;
  readonly mode: CadBevelOperationMode;
  readonly selectedEdgeIds: readonly string[];
  readonly maxSafeRadiusM: number;
  readonly startRadiusM: number;
  readonly endRadiusM: number;
  readonly variableRadius: boolean;
  readonly numericInputBuffer: string;
  readonly numericInputActive: boolean;
  readonly pointerAnchorX: number;
  readonly dragSensitivityMPerPx: number;
  readonly revision: number;
  readonly nextRequestId: number;
  readonly debounceMs: number;
  readonly lastPointerMoveAtMs: number;
  readonly pendingDispatch: CadOcctWorkerDispatchItem | null;
  readonly previewStrips: readonly CadApproxBevelStrip[];
}

export type CadBooleanOpKind = "union" | "subtract" | "intersect";
export interface CadSolidOperandSummary {
  readonly id: string;
  readonly label: string;
  readonly isManifold: boolean;
  readonly volumeM3: number;
  readonly triangleCount: number;
  readonly boundsMin: Vec3Tuple;
  readonly boundsMax: Vec3Tuple;
}
export interface CadTransform3D {
  readonly positionM: Vec3Tuple;
  readonly rotationDeg: Vec3Tuple;
  readonly scale: Vec3Tuple;
}
export type CadBooleanValidationCode =
  | "OK"
  | "NON_MANIFOLD_TARGET"
  | "NON_MANIFOLD_CUTTER"
  | "EMPTY_VOLUME"
  | "SAME_SOLID"
  | "NO_AABB_OVERLAP";

export interface CadLiveBooleanSession {
  readonly status: "idle" | "preview-ghost" | "committed" | "cancelled";
  readonly op: CadBooleanOpKind;
  readonly targetSolidId: string;
  readonly cutterSolidId: string;
  readonly cutterWireframeGhost: boolean;
  readonly cutterTransform: CadTransform3D;
  readonly validation: {
    readonly valid: boolean;
    readonly code: CadBooleanValidationCode;
    readonly message: string;
  };
}

export type CadBooleanCommitResult =
  | {
      readonly ok: true;
      readonly session: CadLiveBooleanSession;
      readonly occtCommand: {
        readonly kind: "occt-boolean";
        readonly op: CadBooleanOpKind;
        readonly targetSolidId: string;
        readonly cutterSolidId: string;
        readonly cutterTransform: CadTransform3D;
      };
    }
  | { readonly ok: false; readonly code: CadBooleanValidationCode; readonly message: string };

const MIN_BEVEL_RADIUS_M = 0.0005;

const clamp = (v: number, min: number, max: number): number =>
  !Number.isFinite(v) ? min : v < min ? min : v > max ? max : v;
const subVec3 = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addVec3 = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scaleVec3 = (a: Vec3Tuple, s: number): Vec3Tuple => [a[0] * s, a[1] * s, a[2] * s];
const lenVec3 = (a: Vec3Tuple): number => Math.hypot(a[0], a[1], a[2]);
const dotVec3 = (a: Vec3Tuple, b: Vec3Tuple): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normVec3 = (a: Vec3Tuple): Vec3Tuple => {
  const len = lenVec3(a);
  return len <= 1e-7 ? [0, 1, 0] : [a[0] / len, a[1] / len, a[2] / len];
};
const crossVec3 = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

function indexVertices(mesh: CadTopologyMesh): Map<string, Vec3Tuple> {
  return new Map(mesh.vertices.map((v) => [v.id, [v.x, v.y, v.z] as Vec3Tuple]));
}

function edgeDirectionFrom(
  edge: CadMeshEdge,
  fromVertexId: string,
  vertexMap: ReadonlyMap<string, Vec3Tuple>,
): { readonly dir: Vec3Tuple; readonly lengthM: number; readonly otherVertexId: string } {
  const otherVertexId = edge.v0 === fromVertexId ? edge.v1 : edge.v0;
  const delta = subVec3(vertexMap.get(otherVertexId) ?? [0, 0, 0], vertexMap.get(fromVertexId) ?? [0, 0, 0]);
  const lengthM = lenVec3(delta);
  return { dir: lengthM > 1e-7 ? scaleVec3(delta, 1 / lengthM) : [1, 0, 0], lengthM, otherVertexId };
}

/**
 * Alt+클릭 스마트 탄젠트 연속 엣지 루프/체인 선택기.
 */
export function selectTangentEdgeChain(
  mesh: CadTopologyMesh,
  seedEdgeId: string,
  options?: { readonly angleToleranceDeg?: number },
): TangentEdgeChainResult {
  const angleTolDeg = clamp(options?.angleToleranceDeg ?? 25, 1, 89);
  const edgeMap = new Map(mesh.edges.map((e) => [e.id, e]));
  const seed = edgeMap.get(seedEdgeId);
  if (!seed) {
    return { seedEdgeId, orderedEdgeIds: [], isClosedLoop: false, maxObservedTurnDeg: 0, totalLengthM: 0, hoverHighlightEdgeIds: [] };
  }

  const vertexMap = indexVertices(mesh);
  const vertexToEdges = new Map<string, CadMeshEdge[]>();
  for (const edge of mesh.edges) {
    for (const vid of [edge.v0, edge.v1]) {
      const list = vertexToEdges.get(vid) ?? [];
      list.push(edge);
      vertexToEdges.set(vid, list);
    }
  }

  const visited = new Set<string>([seed.id]);
  const forwardIds: string[] = [];
  const backwardIds: string[] = [];
  let maxObservedTurnDeg = 0;
  let isClosedLoop = false;

  const walk = (startVid: string, initDir: Vec3Tuple, stopVid: string, out: string[]): void => {
    let currVid = startVid;
    let currDir = initDir;
    while (true) {
      let bestEdge: CadMeshEdge | null = null;
      let bestDeg = angleTolDeg + 1;
      let bestDir = currDir;
      let bestNextVid = currVid;

      for (const cand of vertexToEdges.get(currVid) ?? []) {
        if (visited.has(cand.id)) continue;
        const step = edgeDirectionFrom(cand, currVid, vertexMap);
        const turnDeg = (Math.acos(clamp(dotVec3(currDir, step.dir), -1, 1)) * 180) / Math.PI;
        if (turnDeg <= angleTolDeg && turnDeg < bestDeg) {
          bestDeg = turnDeg;
          bestEdge = cand;
          bestDir = step.dir;
          bestNextVid = step.otherVertexId;
        }
      }

      if (!bestEdge) break;
      visited.add(bestEdge.id);
      out.push(bestEdge.id);
      maxObservedTurnDeg = Math.max(maxObservedTurnDeg, bestDeg);
      currVid = bestNextVid;
      currDir = bestDir;
      if (currVid === stopVid) {
        isClosedLoop = true;
        break;
      }
    }
  };

  walk(seed.v1, edgeDirectionFrom(seed, seed.v0, vertexMap).dir, seed.v0, forwardIds);
  if (!isClosedLoop) {
    walk(seed.v0, edgeDirectionFrom(seed, seed.v1, vertexMap).dir, seed.v1, backwardIds);
  }

  const orderedEdgeIds = [...backwardIds.reverse(), seed.id, ...forwardIds];
  let totalLengthM = 0;
  for (const id of orderedEdgeIds) {
    const edge = edgeMap.get(id);
    if (edge) totalLengthM += edgeDirectionFrom(edge, edge.v0, vertexMap).lengthM;
  }

  return {
    seedEdgeId,
    orderedEdgeIds,
    isClosedLoop,
    maxObservedTurnDeg: Number(maxObservedTurnDeg.toFixed(3)),
    totalLengthM: Number(totalLengthM.toFixed(6)),
    hoverHighlightEdgeIds: orderedEdgeIds,
  };
}

/**
 * 선택 엣지 최소 길이를 기준으로 자가교차를 방지하는 안전 최대 베벨 반경(m)을 계산한다.
 */
export function computeSafeMaxBevelRadius(
  mesh: CadTopologyMesh,
  edgeIds: readonly string[],
): number {
  const vertexMap = indexVertices(mesh);
  const edgeMap = new Map(mesh.edges.map((e) => [e.id, e]));
  let minLength = Number.POSITIVE_INFINITY;
  for (const id of edgeIds) {
    const edge = edgeMap.get(id);
    if (!edge) continue;
    const len = edgeDirectionFrom(edge, edge.v0, vertexMap).lengthM;
    if (len > 1e-6 && len < minLength) minLength = len;
  }
  return Number.isFinite(minLength)
    ? Math.max(MIN_BEVEL_RADIUS_M * 2, Number((minLength * 0.45).toFixed(6)))
    : 0.05;
}

function buildApproxBevelStrips(
  mesh: CadTopologyMesh,
  edgeIds: readonly string[],
  mode: CadBevelOperationMode,
  startRadiusM: number,
  endRadiusM: number,
): readonly CadApproxBevelStrip[] {
  const vertexMap = indexVertices(mesh);
  const edgeMap = new Map(mesh.edges.map((e) => [e.id, e]));
  const strips: CadApproxBevelStrip[] = [];

  for (const edgeId of edgeIds) {
    const edge = edgeMap.get(edgeId);
    const p0 = edge ? vertexMap.get(edge.v0) : undefined;
    const p1 = edge ? vertexMap.get(edge.v1) : undefined;
    if (!edge || !p0 || !p1) continue;

    const bisector = normVec3(addVec3(normVec3(edge.adjacentFaceNormals[0]), normVec3(edge.adjacentFaceNormals[1])));
    const side = normVec3(crossVec3(normVec3(subVec3(p1, p0)), bisector));
    const r0 = Math.max(MIN_BEVEL_RADIUS_M, startRadiusM);
    const r1 = Math.max(MIN_BEVEL_RADIUS_M, endRadiusM);

    const aL = addVec3(p0, scaleVec3(side, r0));
    const aR = addVec3(p0, scaleVec3(side, -r0));
    const bL = addVec3(p1, scaleVec3(side, r1));
    const bR = addVec3(p1, scaleVec3(side, -r1));

    strips.push({
      edgeId,
      mode,
      startRadiusM: r0,
      endRadiusM: r1,
      ribbonVertices:
        mode === "fillet"
          ? [aL, addVec3(p0, scaleVec3(bisector, -r0 * 0.28)), aR, bL, addVec3(p1, scaleVec3(bisector, -r1 * 0.28)), bR]
          : [aL, aR, bL, bR],
    });
  }
  return strips;
}

function makePendingDispatch(
  s: Pick<CadDirectGestureSession, "nextRequestId" | "revision" | "mode" | "selectedEdgeIds" | "startRadiusM" | "endRadiusM" | "variableRadius">,
  nowMs: number,
): CadOcctWorkerDispatchItem {
  return {
    requestId: s.nextRequestId,
    revision: s.revision,
    mode: s.mode,
    edgeIds: s.selectedEdgeIds,
    startRadiusM: s.startRadiusM,
    endRadiusM: s.endRadiusM,
    variableRadius: s.variableRadius,
    segments: s.mode === "fillet" ? 6 : 1,
    queuedAtMs: nowMs,
  };
}

function withUpdatedPreview(
  session: CadDirectGestureSession,
  mesh: CadTopologyMesh,
  patch: Partial<CadDirectGestureSession>,
  nowMs: number,
): CadDirectGestureSession {
  const next: CadDirectGestureSession = {
    ...session,
    ...patch,
    revision: session.revision + 1,
    lastPointerMoveAtMs: nowMs,
  };
  return {
    ...next,
    pendingDispatch: makePendingDispatch(next, nowMs),
    previewStrips: buildApproxBevelStrips(mesh, next.selectedEdgeIds, next.mode, next.startRadiusM, next.endRadiusM),
  };
}

/**
 * B(필렛) 또는 C(챔퍼) 단축키로 모달 드래그 베벨 제스처 세션을 시작한다.
 */
export function startCadDirectGestureSession(
  mesh: CadTopologyMesh,
  selectedEdgeIds: readonly string[],
  triggerKey: "B" | "C",
  pointerAnchorX: number,
  nowMs: number,
  options?: { readonly dragSensitivityMPerPx?: number; readonly debounceMs?: number; readonly initialRadiusM?: number },
): CadDirectGestureSession {
  const mode: CadBevelOperationMode = triggerKey === "B" ? "fillet" : "chamfer";
  const maxSafeRadiusM = computeSafeMaxBevelRadius(mesh, selectedEdgeIds);
  const initR = clamp(options?.initialRadiusM ?? Math.min(0.01, maxSafeRadiusM * 0.25), MIN_BEVEL_RADIUS_M, maxSafeRadiusM);

  const base: CadDirectGestureSession = {
    status: "dragging",
    mode,
    selectedEdgeIds: [...selectedEdgeIds],
    maxSafeRadiusM,
    startRadiusM: initR,
    endRadiusM: initR,
    variableRadius: false,
    numericInputBuffer: "",
    numericInputActive: false,
    pointerAnchorX,
    dragSensitivityMPerPx: clamp(options?.dragSensitivityMPerPx ?? 0.0005, 1e-5, 0.05),
    revision: 1,
    nextRequestId: 1,
    debounceMs: clamp(options?.debounceMs ?? 45, 0, 500),
    lastPointerMoveAtMs: nowMs,
    pendingDispatch: null,
    previewStrips: buildApproxBevelStrips(mesh, selectedEdgeIds, mode, initR, initR),
  };

  return {
    ...base,
    pendingDispatch: selectedEdgeIds.length > 0 ? makePendingDispatch(base, nowMs) : null,
  };
}

/**
 * 모달 드래그 중 포인터 이동을 반경(m)으로 매핑하고 최신 우선 디바운스 큐와 근사 프리뷰를 갱신한다.
 */
export function updateCadDirectGesturePointer(
  session: CadDirectGestureSession,
  mesh: CadTopologyMesh,
  pointerX: number,
  nowMs: number,
): CadDirectGestureSession {
  if (session.status !== "dragging" || session.numericInputActive) return session;
  const computed = clamp(
    Math.abs(pointerX - session.pointerAnchorX) * session.dragSensitivityMPerPx + MIN_BEVEL_RADIUS_M,
    MIN_BEVEL_RADIUS_M,
    session.maxSafeRadiusM,
  );
  return withUpdatedPreview(
    session,
    mesh,
    { startRadiusM: session.variableRadius ? session.startRadiusM : computed, endRadiusM: computed },
    nowMs,
  );
}

/**
 * 드래그 세션을 닫지 않고 모달 단축키(C, V, 0-9, ., Backspace, Enter, Escape)를 체이닝 처리한다.
 */
export function handleCadDirectGestureKey(
  session: CadDirectGestureSession,
  mesh: CadTopologyMesh,
  key: string,
  nowMs: number,
): CadDirectGestureSession {
  if (session.status !== "dragging") return session;

  if (key === "Escape") {
    return { ...session, status: "cancelled", pendingDispatch: null, previewStrips: [] };
  }
  if (key === "Enter") {
    const finalized: CadDirectGestureSession = {
      ...session,
      status: "committed",
      revision: session.revision + 1,
      lastPointerMoveAtMs: nowMs,
    };
    return { ...finalized, pendingDispatch: makePendingDispatch(finalized, nowMs) };
  }

  const upper = key.toUpperCase();
  if (upper === "C") {
    return withUpdatedPreview(
      session,
      mesh,
      { mode: session.mode === "fillet" ? "chamfer" : "fillet" },
      nowMs,
    );
  }
  if (upper === "V") {
    const nextVar = !session.variableRadius;
    const nextEnd = nextVar
      ? clamp(session.startRadiusM * 0.5, MIN_BEVEL_RADIUS_M, session.maxSafeRadiusM)
      : session.startRadiusM;
    return withUpdatedPreview(session, mesh, { variableRadius: nextVar, endRadiusM: nextEnd }, nowMs);
  }

  if (/^[0-9]$/.test(key) || (key === "." && !session.numericInputBuffer.includes("."))) {
    const nextBuffer = `${session.numericInputBuffer}${key}`;
    const parsed = Number.parseFloat(nextBuffer);
    const radius = Number.isFinite(parsed) && parsed > 0
      ? clamp(parsed, MIN_BEVEL_RADIUS_M, session.maxSafeRadiusM)
      : session.endRadiusM;
    return withUpdatedPreview(
      session,
      mesh,
      {
        numericInputBuffer: nextBuffer,
        numericInputActive: true,
        startRadiusM: session.variableRadius ? session.startRadiusM : radius,
        endRadiusM: radius,
      },
      nowMs,
    );
  }

  if (key === "Backspace" && session.numericInputBuffer.length > 0) {
    const nextBuffer = session.numericInputBuffer.slice(0, -1);
    const nextActive = nextBuffer.length > 0;
    const parsed = Number.parseFloat(nextBuffer);
    const radius = nextActive && Number.isFinite(parsed) && parsed > 0
      ? clamp(parsed, MIN_BEVEL_RADIUS_M, session.maxSafeRadiusM)
      : session.endRadiusM;
    return withUpdatedPreview(
      session,
      mesh,
      {
        numericInputBuffer: nextBuffer,
        numericInputActive: nextActive,
        startRadiusM: session.variableRadius ? session.startRadiusM : radius,
        endRadiusM: radius,
      },
      nowMs,
    );
  }

  return session;
}

/**
 * 디바운스 간격이 지난 최신 요청(또는 확정 상태 요청)만 OCCT 워커로 방출한다. (latest-wins 병합)
 */
export function flushDebouncedOcctDispatch(
  session: CadDirectGestureSession,
  nowMs: number,
): { readonly readyDispatch: CadOcctWorkerDispatchItem | null; readonly nextSession: CadDirectGestureSession } {
  if (!session.pendingDispatch) return { readyDispatch: null, nextSession: session };
  const ready = session.status === "committed" || nowMs - session.lastPointerMoveAtMs >= session.debounceMs;
  if (!ready) return { readyDispatch: null, nextSession: session };

  return {
    readyDispatch: session.pendingDispatch,
    nextSession: { ...session, pendingDispatch: null, nextRequestId: session.nextRequestId + 1 },
  };
}

function transformedBounds(
  operand: CadSolidOperandSummary,
  transform: CadTransform3D,
): { readonly min: Vec3Tuple; readonly max: Vec3Tuple } {
  const min: [number, number, number] = [0, 0, 0];
  const max: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    const a = operand.boundsMin[i] * transform.scale[i] + transform.positionM[i];
    const b = operand.boundsMax[i] * transform.scale[i] + transform.positionM[i];
    min[i] = Math.min(a, b);
    max[i] = Math.max(a, b);
  }
  return { min, max };
}

function aabbOverlaps(aMin: Vec3Tuple, aMax: Vec3Tuple, bMin: Vec3Tuple, bMax: Vec3Tuple): boolean {
  return aMin[0] <= bMax[0] && aMax[0] >= bMin[0] && aMin[1] <= bMax[1] && aMax[1] >= bMin[1] && aMin[2] <= bMax[2] && aMax[2] >= bMin[2];
}

function validateBooleanOperands(
  op: CadBooleanOpKind,
  target: CadSolidOperandSummary,
  cutter: CadSolidOperandSummary,
  cutterTransform: CadTransform3D,
): { readonly valid: boolean; readonly code: CadBooleanValidationCode; readonly message: string } {
  if (target.id === cutter.id) {
    return { valid: false, code: "SAME_SOLID", message: "동일한 솔리드끼리는 불리언 연산을 수행할 수 없습니다." };
  }
  if (!target.isManifold) {
    return { valid: false, code: "NON_MANIFOLD_TARGET", message: "대상 메시가 비-매니폴드 상태여서 OCCT 불리언 연산을 중단합니다." };
  }
  if (!cutter.isManifold) {
    return { valid: false, code: "NON_MANIFOLD_CUTTER", message: "커터 메시가 비-매니폴드 상태여서 OCCT 불리언 연산을 중단합니다." };
  }
  if (target.volumeM3 <= 1e-9 || cutter.volumeM3 <= 1e-9 || target.triangleCount < 4 || cutter.triangleCount < 4) {
    return { valid: false, code: "EMPTY_VOLUME", message: "유효 부피가 없는 빈 피연산자로는 불리언을 실행할 수 없습니다." };
  }
  if (op === "subtract" || op === "intersect") {
    const moved = transformedBounds(cutter, cutterTransform);
    if (!aabbOverlaps(target.boundsMin, target.boundsMax, moved.min, moved.max)) {
      return { valid: false, code: "NO_AABB_OVERLAP", message: "커터와 대상 솔리드의 경계 상자가 겹치지 않습니다." };
    }
  }
  return { valid: true, code: "OK", message: "매니폴드 및 교차 영역 검증을 통과했습니다." };
}

/**
 * Q(합집합) / W(차집합) / E(교집합) 라이브 커터 와이어프레임 고스트 불리언 세션을 시작한다.
 */
export function startCadLiveBooleanSession(
  key: "Q" | "W" | "E",
  target: CadSolidOperandSummary,
  cutter: CadSolidOperandSummary,
): CadLiveBooleanSession {
  const op: CadBooleanOpKind = key === "Q" ? "union" : key === "W" ? "subtract" : "intersect";
  const initialTransform: CadTransform3D = { positionM: [0, 0, 0], rotationDeg: [0, 0, 0], scale: [1, 1, 1] };
  return {
    status: "preview-ghost",
    op,
    targetSolidId: target.id,
    cutterSolidId: cutter.id,
    cutterWireframeGhost: true,
    cutterTransform: initialTransform,
    validation: validateBooleanOperands(op, target, cutter, initialTransform),
  };
}

/**
 * 라이브 고스트 커터의 위치·회전·스케일을 이동하며 매니폴드·교차 상태를 실시간 재검증한다.
 */
export function updateCadLiveBooleanCutterTransform(
  session: CadLiveBooleanSession,
  target: CadSolidOperandSummary,
  cutter: CadSolidOperandSummary,
  patch: Partial<CadTransform3D>,
): CadLiveBooleanSession {
  if (session.status !== "preview-ghost") return session;
  const nextTransform: CadTransform3D = {
    positionM: patch.positionM ?? session.cutterTransform.positionM,
    rotationDeg: patch.rotationDeg ?? session.cutterTransform.rotationDeg,
    scale: patch.scale ?? session.cutterTransform.scale,
  };
  return {
    ...session,
    cutterTransform: nextTransform,
    validation: validateBooleanOperands(session.op, target, cutter, nextTransform),
  };
}

/**
 * 검증을 통과한 라이브 불리언 세션을 OCCT B-Rep 명령으로 확정한다.
 */
export function commitCadLiveBooleanSession(session: CadLiveBooleanSession): CadBooleanCommitResult {
  if (!session.validation.valid) {
    return { ok: false, code: session.validation.code, message: session.validation.message };
  }
  const committed: CadLiveBooleanSession = { ...session, status: "committed", cutterWireframeGhost: false };
  return {
    ok: true,
    session: committed,
    occtCommand: {
      kind: "occt-boolean",
      op: committed.op,
      targetSolidId: committed.targetSolidId,
      cutterSolidId: committed.cutterSolidId,
      cutterTransform: committed.cutterTransform,
    },
  };
}
