/** 공유 모서리 치유 결과를 미리보기와 한 번의 정본 명령에 연결하는 작업공간 경계다. */
import { mutateStudioSharedObjectGeometry } from "../live/studio-live-2d3d-bridge";
import { createStudioMeshModifierStack } from "../studio-mesh-modifier-stack";
import {
  deserializeStudioEditableMesh,
  hashStudioEditableMesh,
  serializeStudioEditableMesh,
  validateStudioEditableMeshSerializableAuthority,
  type StudioEditableMesh,
  type StudioEditableMeshSnapshot,
} from "../studio-editable-half-edge-mesh";

import {
  createStudioHybridDccComponentSelection,
  mutateStudioHybridDccComponentSelection,
  snapshotStudioHybridDccComponentSelection,
  validateStudioHybridDccComponentSelection,
  type StudioHybridDccComponentSelection,
  type StudioHybridDccMeshSelectionSource,
} from "./studio-hybrid-dcc-component-selection";
import { hasSupportedStudioCoplanarEdgeDissolveChannels } from "./studio-hybrid-dcc-coplanar-edge-dissolve-channels";
import { hybridDccCommitGeometry, type StudioHybridDccSession } from "./studio-hybrid-dcc-document";
import {
  synchronizeWorkspaceGeometryAuthority,
  workspaceComponentSelectionSource,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";

import type {
  StudioCoplanarEdgeDissolveFailureCode,
  StudioCoplanarEdgeDissolveRequest,
  StudioCoplanarEdgeDissolveResult,
  StudioCoplanarEdgeDissolveSource,
} from "./studio-hybrid-dcc-coplanar-edge-dissolve";

export interface StudioHybridDccCoplanarEdgeDissolveCurrent {
  readonly workspace: StudioHybridDccWorkspace;
  readonly selection: StudioHybridDccComponentSelection;
}

export interface StudioHybridDccCoplanarEdgeDissolvePreparation {
  readonly generation: number;
  readonly signal?: AbortSignal;
  /** 미리보기가 아닌, 아직 발행되지 않은 원본 정본 작업공간과 현재 선택을 읽는다. */
  readonly readCurrent: () => StudioHybridDccCoplanarEdgeDissolveCurrent;
  /** 호출자가 소유한 요청·선택 세대다. 같은 선택으로 돌아오는 ABA도 여기서 거부한다. */
  readonly isCurrent: () => boolean;
  /** 내부 신뢰 계산 포트다. 이 경계는 커널/필드 검증을 다시 실행하거나 동기 fallback하지 않는다. */
  readonly compute: (
    source: StudioCoplanarEdgeDissolveSource,
    request: StudioCoplanarEdgeDissolveRequest,
    options: { readonly assetId: string; readonly generation: number; readonly signal?: AbortSignal },
  ) => Promise<StudioCoplanarEdgeDissolveResult>;
}

export interface StudioHybridDccCoplanarEdgeDissolvePlan {
  readonly operation: "coplanar-edge-dissolve";
  readonly assetId: string;
  readonly generation: number;
  readonly sourceMeshHash: string;
  readonly sourceMeshRevision: number;
  readonly resultMeshHash: string;
  readonly mergedFaceId: number;
}

export interface StudioHybridDccCoplanarEdgeDissolveWorkspaceResult {
  readonly workspace: StudioHybridDccWorkspace;
  readonly selection: StudioHybridDccComponentSelection;
  readonly plan: StudioHybridDccCoplanarEdgeDissolvePlan;
}

export type StudioCoplanarEdgeDissolveWorkspaceFailureCode = StudioCoplanarEdgeDissolveFailureCode
  | "aborted" | "stale-context" | "invalid-plan" | "plan-already-attempted";

export class StudioCoplanarEdgeDissolveWorkspaceError extends Error {
  constructor(readonly code: StudioCoplanarEdgeDissolveWorkspaceFailureCode, readonly detail: string) {
    super(detail);
    this.name = "StudioCoplanarEdgeDissolveWorkspaceError";
  }
}

export { StudioCoplanarEdgeDissolveWorkspaceError as StudioHybridDccCoplanarEdgeDissolveWorkspaceError };

interface CapturedSource {
  readonly assetId: string;
  readonly generation: number;
  readonly signal?: AbortSignal;
  readonly readCurrent: StudioHybridDccCoplanarEdgeDissolvePreparation["readCurrent"];
  readonly isCurrent: StudioHybridDccCoplanarEdgeDissolvePreparation["isCurrent"];
  readonly workspace: StudioHybridDccWorkspace;
  readonly session: StudioHybridDccSession;
  readonly stateHash: string;
  readonly selection: StudioHybridDccComponentSelection;
  readonly selectionSnapshot: string;
  readonly mesh: StudioEditableMesh;
  readonly sourceMeshHash: string;
  readonly sourceMeshRevision: number;
  readonly sourceSnapshot: StudioEditableMeshSnapshot;
}

interface ResultMetadata {
  readonly snapshot: StudioEditableMeshSnapshot;
  readonly meshHash: string;
  readonly mergedFaceId: number;
  readonly sourceFaceIds: readonly number[];
  readonly removedHalfEdgeIds: readonly number[];
  readonly faceIds: readonly number[];
  readonly halfEdgeIds: readonly number[];
}

interface IssuedPlan {
  readonly source: CapturedSource;
  readonly result: ResultMetadata;
  state: "prepared" | "candidate-created" | "failed";
}

const issuedPlans = new WeakMap<StudioHybridDccCoplanarEdgeDissolvePlan, IssuedPlan>();

function fail(code: StudioCoplanarEdgeDissolveWorkspaceFailureCode, detail: string): never {
  throw new StudioCoplanarEdgeDissolveWorkspaceError(code, detail);
}

function need<T>(value: T | undefined, detail: string): T {
  if (value === undefined) fail("invalid-result", detail);
  return value;
}

function normalizedError(error: unknown): StudioCoplanarEdgeDissolveWorkspaceError {
  return error instanceof StudioCoplanarEdgeDissolveWorkspaceError ? error
    : new StudioCoplanarEdgeDissolveWorkspaceError("invalid-result",
      error instanceof Error ? error.message : "공유 모서리 치유 결과를 작업공간에 연결하지 못했습니다.");
}

function selectionSnapshot(selection: StudioHybridDccComponentSelection): string {
  return JSON.stringify(snapshotStudioHybridDccComponentSelection(selection));
}

function selectionSource(current: StudioHybridDccCoplanarEdgeDissolveCurrent): StudioHybridDccMeshSelectionSource {
  const source = workspaceComponentSelectionSource(current.workspace);
  if (!source || current.selection.mode !== "edge" || current.selection.elementIds.length === 0) {
    fail("invalid-selection", "현재 오브젝트에서 치유할 공유 모서리를 선택해 주세요.");
  }
  const selected = validateStudioHybridDccComponentSelection(current.selection, source);
  if (!selected.ok) fail("invalid-selection", "현재 메시와 공유 모서리 선택의 버전 또는 ID가 다릅니다.");
  return source;
}

function canonicalCopy(mesh: StudioEditableMesh, expectedHash: string): {
  readonly snapshot: StudioEditableMeshSnapshot; readonly mesh: StudioEditableMesh;
} {
  if (!hasSupportedStudioCoplanarEdgeDissolveChannels(mesh)) {
    fail("unsupported-uv", "단일 코너 UV 외의 추가 메시 채널·메타데이터는 치유로 보존할 수 없습니다.");
  }
  const authority = validateStudioEditableMeshSerializableAuthority(mesh);
  if (!authority.ok) fail(authority.code === "budget-exceeded" ? "budget-exceeded" : "invalid-result", authority.detail);
  // serializer의 같은 root에 대한 과거 loop cache를 현재 복사의 근거로 쓰지 않는다.
  const snapshot = serializeStudioEditableMesh({ ...mesh });
  const copy = deserializeStudioEditableMesh(snapshot);
  if (hashStudioEditableMesh(mesh) !== expectedHash || hashStudioEditableMesh(copy) !== expectedHash) {
    fail("invalid-result", "정본 메시를 복사하는 동안 hash 또는 직렬화 결과가 달라졌습니다.");
  }
  return { snapshot, mesh: copy };
}

function assertCurrentState(source: CapturedSource, current: StudioHybridDccCoplanarEdgeDissolveCurrent): void {
  const workspace = current.workspace;
  if (workspace !== source.workspace || workspace.session !== source.session || workspace.session.state.stateHash !== source.stateHash
    || workspace.activeAssetId !== source.assetId || current.selection !== source.selection) {
    fail("stale-context", "요청 뒤 작업공간·오브젝트 또는 선택이 바뀌었습니다.");
  }
  const live = workspaceComponentSelectionSource(workspace);
  if (live && !hasSupportedStudioCoplanarEdgeDissolveChannels(live.mesh)) {
    fail("unsupported-uv", "단일 코너 UV 외의 추가 메시 채널·메타데이터는 치유로 보존할 수 없습니다.");
  }
  if (!live || live.mesh !== source.mesh || live.meshRevision !== source.sourceMeshRevision
    || live.sourceHash !== source.sourceMeshHash || hashStudioEditableMesh(live.mesh) !== source.sourceMeshHash) {
    fail("stale-context", "요청 뒤 원본 메시 또는 편집 버전이 바뀌었습니다.");
  }
  const selected = validateStudioHybridDccComponentSelection(current.selection, live);
  if (!selected.ok || selectionSnapshot(current.selection) !== source.selectionSnapshot) {
    fail("stale-context", "요청 뒤 공유 모서리 선택이 바뀌었습니다.");
  }
}

function assertLive(source: CapturedSource, provided?: StudioHybridDccCoplanarEdgeDissolveCurrent): void {
  if (source.signal?.aborted) fail("aborted", "공유 모서리 치유 요청을 취소했습니다.");
  if (!source.isCurrent()) fail("stale-context", "더 이상 현재 편집 요청이 아닙니다.");
  if (provided) assertCurrentState(source, provided);
  assertCurrentState(source, source.readCurrent());
  if (source.signal?.aborted) fail("aborted", "공유 모서리 치유 요청을 취소했습니다.");
  if (!source.isCurrent()) fail("stale-context", "더 이상 현재 편집 요청이 아닙니다.");
}

function origin(mesh: StudioEditableMesh, edgeId: number): number {
  const halfEdge = need(mesh.halfEdges[edgeId], "대응하는 half-edge가 없습니다.");
  return need(mesh.halfEdges[halfEdge.prev], "대응하는 원본 코너가 없습니다.").vertex;
}

function selectedSeam(mesh: StudioEditableMesh, ids: readonly number[]): {
  readonly faces: readonly [number, number]; readonly removed: ReadonlySet<number>;
} {
  const removed = new Set<number>(), faceIds = new Set<number>();
  for (const id of ids) {
    const edge = need(mesh.halfEdges[id], "선택한 원본 모서리가 없습니다.");
    const twin = mesh.halfEdges[edge.twin];
    if (!twin || twin.twin !== id || edge.face < 0 || twin.face < 0 || edge.face === twin.face) {
      fail("invalid-selection", "서로 다른 두 면이 공유한 모서리만 치유할 수 있습니다.");
    }
    faceIds.add(edge.face); faceIds.add(twin.face);
    removed.add(id); removed.add(twin.id);
  }
  const faces = [...faceIds].sort((a, b) => a - b), first = faces[0], second = faces[1];
  if (faces.length !== 2 || first === undefined || second === undefined) {
    fail("invalid-selection", "동일한 두 면 사이의 공유 모서리만 함께 선택해 주세요.");
  }
  for (const edge of mesh.halfEdges) {
    const twin = mesh.halfEdges[edge.twin];
    if (twin && ((edge.face === first && twin.face === second) || (edge.face === second && twin.face === first))
      && !removed.has(edge.id)) fail("unselected-seam", "두 면 사이의 공유 모서리를 모두 선택해 주세요.");
  }
  return { faces: [first, second], removed };
}

type ComputedSuccess = Extract<StudioCoplanarEdgeDissolveResult, { readonly ok: true }>;

function validateVertices(source: StudioEditableMesh, mesh: StudioEditableMesh, result: ComputedSuccess): void {
  if (mesh.vertices.length !== source.vertices.length || result.vertexRemap.length !== source.vertices.length) {
    fail("invalid-result", "치유 결과의 전체 정점 대응 수가 다릅니다.");
  }
  for (const before of source.vertices) {
    const after = need(mesh.vertices[before.id], "치유 결과의 정점이 없습니다.");
    const remap = need(result.vertexRemap[before.id], "전체 정점 대응이 없습니다.");
    if (remap.sourceVertexId !== before.id || remap.resultVertexIds.length !== 1 || remap.resultVertexIds[0] !== before.id
      || after.id !== before.id || after.crease !== before.crease || after.position.x !== before.position.x
      || after.position.y !== before.position.y || after.position.z !== before.position.z) {
      fail("invalid-result", "원본 정점의 ID·위치·crease를 그대로 보존하지 않은 결과입니다.");
    }
  }
}

function validateFaces(source: StudioEditableMesh, mesh: StudioEditableMesh, result: ComputedSuccess,
  pair: readonly [number, number]): readonly number[] {
  const [keep, drop] = pair;
  if (mesh.faces.length !== source.faces.length - 1 || result.faceRemap.length !== source.faces.length
    || result.sourceFaceIds.length !== 2 || result.sourceFaceIds[0] !== keep || result.sourceFaceIds[1] !== drop
    || result.mergedFaceId !== keep) fail("invalid-result", "두 원본 면과 병합 면의 전체 대응이 다릅니다.");
  const mapped: number[] = [];
  for (const before of source.faces) {
    const id = before.id === drop ? keep : before.id > drop ? before.id - 1 : before.id;
    const after = need(mesh.faces[id], "치유 결과의 면이 없습니다.");
    const remap = need(result.faceRemap[before.id], "전체 면 대응이 없습니다.");
    if (remap.sourceFaceId !== before.id || remap.resultFaceIds.length !== 1 || remap.resultFaceIds[0] !== id
      || after.materialSlot !== before.materialSlot || after.smooth !== before.smooth) {
      fail("invalid-result", "원본 면의 대응·재질·smooth를 보존하지 않은 결과입니다.");
    }
    mapped.push(id);
  }
  return Object.freeze(mapped);
}

function validateEdges(source: StudioEditableMesh, mesh: StudioEditableMesh, result: ComputedSuccess,
  removed: ReadonlySet<number>, faces: readonly number[], pair: readonly [number, number]): readonly number[] {
  const expectedRemoved = [...removed].sort((a, b) => a - b);
  if (result.halfEdgeRemap.length !== source.halfEdges.length
    || mesh.halfEdges.length !== source.halfEdges.length - removed.size
    || result.removedHalfEdgeIds.length !== expectedRemoved.length
    || expectedRemoved.some((id, index) => result.removedHalfEdgeIds[index] !== id)
    || (source.uvLayer === undefined) !== (mesh.uvLayer === undefined)) {
    fail("invalid-result", "전체 모서리 대응·명시한 삭제 범위 또는 UV 존재 여부가 다릅니다.");
  }
  const mapped: number[] = [], seen = new Set<number>();
  for (const before of source.halfEdges) {
    const remap = need(result.halfEdgeRemap[before.id], "전체 half-edge 대응이 없습니다.");
    if (remap.sourceHalfEdgeId !== before.id || remap.resultHalfEdgeIds.length !== (removed.has(before.id) ? 0 : 1)) {
      fail("invalid-result", "선택하지 않은 모서리가 삭제되었거나 전체 대응이 빠졌습니다.");
    }
    const id = removed.has(before.id) ? -1 : need(remap.resultHalfEdgeIds[0], "살아남는 모서리의 대응이 없습니다.");
    if (id >= 0 && (!Number.isSafeInteger(id) || !mesh.halfEdges[id] || seen.has(id))) {
      fail("invalid-result", "살아남는 모서리의 결과 대응이 중복되거나 범위를 벗어났습니다.");
    }
    if (!removed.has(before.id) && id < 0) fail("invalid-result", "살아남는 모서리가 삭제 ID를 가리킵니다.");
    if (id >= 0) seen.add(id);
    mapped.push(id);
  }
  if (seen.size !== mesh.halfEdges.length) fail("invalid-result", "대응하지 않는 결과 모서리가 있습니다.");
  for (const before of source.halfEdges) {
    const id = need(mapped[before.id], "원본 모서리 대응이 없습니다.");
    if (id < 0) continue;
    const after = need(mesh.halfEdges[id], "살아남는 결과 모서리가 없습니다.");
    const twin = before.twin < 0 ? -1 : need(mapped[before.twin], "원본 twin 대응이 없습니다.");
    if (origin(mesh, id) !== origin(source, before.id) || after.vertex !== before.vertex
      || after.face !== faces[before.face] || after.twin !== twin || after.crease !== before.crease) {
      fail("invalid-result", "생존 유향 모서리의 origin·끝점·면·twin·crease가 원본과 다릅니다.");
    }
    if (!pair.includes(before.face) && (after.next !== mapped[before.next] || after.prev !== mapped[before.prev])) {
      fail("invalid-result", "병합 대상 밖 원본 면의 코너 연결이 바뀌었습니다.");
    }
    if (source.uvLayer !== undefined) {
      const beforeUv = need(source.uvLayer.corners[before.id], "원본 UV 코너가 없습니다.");
      const afterUv = need(mesh.uvLayer?.corners[id], "결과 UV 코너가 없습니다.");
      if (beforeUv.halfEdgeId !== before.id || afterUv.halfEdgeId !== id
        || beforeUv.u !== afterUv.u || beforeUv.v !== afterUv.v) {
        fail("invalid-result", "살아남는 원본 origin 코너의 UV를 그대로 복사하지 않은 결과입니다.");
      }
    }
  }
  return Object.freeze(mapped);
}

function admitResult(source: CapturedSource, computed: ComputedSuccess): ResultMetadata {
  if (computed.sourceMeshHash !== source.sourceMeshHash || computed.sourceMeshRevision !== source.sourceMeshRevision
    || computed.resultMeshHash === source.sourceMeshHash) fail("invalid-result", "계산 결과가 요청한 원본 버전과 다릅니다.");
  const before = deserializeStudioEditableMesh(source.sourceSnapshot);
  const copied = canonicalCopy(computed.mesh, computed.resultMeshHash);
  const seam = selectedSeam(before, source.selection.elementIds);
  validateVertices(before, copied.mesh, computed);
  const faces = validateFaces(before, copied.mesh, computed, seam.faces);
  const edges = validateEdges(before, copied.mesh, computed, seam.removed, faces, seam.faces);
  return {
    snapshot: copied.snapshot, meshHash: computed.resultMeshHash, mergedFaceId: computed.mergedFaceId,
    sourceFaceIds: Object.freeze([...seam.faces]), removedHalfEdgeIds: Object.freeze([...seam.removed].sort((a, b) => a - b)),
    faceIds: faces, halfEdgeIds: edges,
  };
}

function privatePlan(plan: StudioHybridDccCoplanarEdgeDissolvePlan): IssuedPlan {
  const issued = issuedPlans.get(plan);
  if (!issued) fail("invalid-plan", "이 작업공간에서 준비하지 않은 치유 계획입니다.");
  return issued;
}

/** 실제 edge 선택을 동결해 외부 계산을 기다린다. 반환 계획은 복제한 DTO로 재발급할 수 없다. */
export async function prepareStudioHybridDccCoplanarEdgeDissolve(
  current: StudioHybridDccCoplanarEdgeDissolveCurrent,
  preparation: StudioHybridDccCoplanarEdgeDissolvePreparation,
): Promise<StudioHybridDccCoplanarEdgeDissolvePlan> {
  try {
    if (!Number.isSafeInteger(preparation.generation) || preparation.generation < 0) {
      fail("invalid-source", "편집 요청 세대가 올바르지 않습니다.");
    }
    if (preparation.signal?.aborted) fail("aborted", "공유 모서리 치유 요청을 취소했습니다.");
    if (!preparation.isCurrent()) fail("stale-context", "더 이상 현재 편집 요청이 아닙니다.");
    const original = selectionSource(current), copied = canonicalCopy(original.mesh, original.sourceHash);
    const source: CapturedSource = {
      assetId: original.assetId, generation: preparation.generation,
      ...(preparation.signal === undefined ? {} : { signal: preparation.signal }),
      readCurrent: preparation.readCurrent, isCurrent: preparation.isCurrent,
      workspace: current.workspace, session: current.workspace.session,
      stateHash: current.workspace.session.state.stateHash, selection: current.selection,
      selectionSnapshot: selectionSnapshot(current.selection), mesh: original.mesh,
      sourceMeshHash: original.sourceHash, sourceMeshRevision: original.meshRevision, sourceSnapshot: copied.snapshot,
    };
    assertLive(source, current);
    const request: StudioCoplanarEdgeDissolveRequest = Object.freeze({
      sourceMeshHash: source.sourceMeshHash, sourceMeshRevision: source.sourceMeshRevision,
      halfEdgeIds: Object.freeze([...current.selection.elementIds]),
    });
    let computed: StudioCoplanarEdgeDissolveResult;
    try {
      computed = await preparation.compute({ mesh: copied.mesh, meshHash: source.sourceMeshHash,
        meshRevision: source.sourceMeshRevision }, request, {
        assetId: source.assetId, generation: source.generation,
        ...(source.signal === undefined ? {} : { signal: source.signal }),
      });
    } catch (error) {
      assertLive(source);
      throw error;
    }
    assertLive(source);
    if (!computed.ok) fail(computed.code, computed.detail);
    const result = admitResult(source, computed);
    assertLive(source);
    const plan: StudioHybridDccCoplanarEdgeDissolvePlan = Object.freeze({
      operation: "coplanar-edge-dissolve", assetId: source.assetId, generation: source.generation,
      sourceMeshHash: source.sourceMeshHash, sourceMeshRevision: source.sourceMeshRevision,
      resultMeshHash: result.meshHash, mergedFaceId: result.mergedFaceId,
    });
    issuedPlans.set(plan, { source, result, state: "prepared" });
    return plan;
  } catch (error) {
    throw normalizedError(error);
  }
}

function faceSelection(assetId: string, mesh: StudioEditableMesh, revision: number, hash: string,
  mergedFaceId: number): StudioHybridDccComponentSelection {
  const selected = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "face", operation: "replace", ids: [mergedFaceId], activeId: mergedFaceId,
    source: { assetId, mesh, meshRevision: revision, sourceHash: hash },
  });
  if (!selected.ok) fail("invalid-result", "병합한 면의 선택을 만들지 못했습니다.");
  return selected.value;
}

/** 표시용 사본만 반환한다. 미리보기를 변경해도 비공개 확정 snapshot에는 영향을 주지 않는다. */
export function previewStudioHybridDccCoplanarEdgeDissolve(
  current: StudioHybridDccCoplanarEdgeDissolveCurrent,
  plan: StudioHybridDccCoplanarEdgeDissolvePlan,
): StudioHybridDccCoplanarEdgeDissolveWorkspaceResult {
  try {
    const issued = privatePlan(plan);
    if (issued.state !== "prepared") fail("plan-already-attempted", "이미 확정을 시도한 계획은 다시 사용할 수 없습니다.");
    assertLive(issued.source, current);
    const mesh = deserializeStudioEditableMesh(issued.result.snapshot), workspace = current.workspace;
    const geometry = workspace.session.state.geometry;
    const record = need(geometry.records[issued.source.assetId], "미리보기 원본 geometry가 없습니다.");
    const preview: StudioHybridDccWorkspace = {
      ...workspace,
      session: { ...workspace.session, state: { ...workspace.session.state,
        geometry: { ...geometry, records: { ...geometry.records, [record.assetId]: {
          ...record, mesh, meshHash: issued.result.meshHash, renderCache: null,
          modifierStack: createStudioMeshModifierStack(mesh, record.modifierStack.modifiers),
        } } },
      } },
      bridge: mutateStudioSharedObjectGeometry(workspace.bridge, record.assetId, issued.result.meshHash),
    };
    const selection = faceSelection(record.assetId, mesh, record.revision, issued.result.meshHash, issued.result.mergedFaceId);
    assertLive(issued.source, current);
    return { workspace: preview, selection, plan };
  } catch (error) {
    throw normalizedError(error);
  }
}

/** 후보 하나에 geometry.commit 한 번이다. 실제 발행과 modifier 대기 뒤 검사는 호출자가 맡는다. */
export function commitStudioHybridDccCoplanarEdgeDissolve(
  current: StudioHybridDccCoplanarEdgeDissolveCurrent,
  plan: StudioHybridDccCoplanarEdgeDissolvePlan,
): StudioHybridDccCoplanarEdgeDissolveWorkspaceResult {
  const issued = privatePlan(plan);
  if (issued.state !== "prepared") fail("plan-already-attempted", "이미 확정을 시도한 계획은 다시 사용할 수 없습니다.");
  // 실패해도 두 번째 후보를 만들지 않는다. 요청의 현재성 조회와는 별개인 단일 시도 상태다.
  issued.state = "failed";
  try {
    assertLive(issued.source, current);
    const mesh = deserializeStudioEditableMesh(issued.result.snapshot);
    const session = hybridDccCommitGeometry(current.workspace.session, issued.source.assetId, mesh);
    const workspace = synchronizeWorkspaceGeometryAuthority(current.workspace, session);
    const record = need(session.state.geometry.records[issued.source.assetId], "확정한 geometry가 없습니다.");
    const selection = faceSelection(record.assetId, record.mesh, record.revision, record.meshHash, issued.result.mergedFaceId);
    assertLive(issued.source, current);
    issued.state = "candidate-created";
    return { workspace, selection, plan };
  } catch (error) {
    throw normalizedError(error);
  }
}

/** 후보·실패 상태도 현재 요청이면 true다. Panel의 modifier 대기 뒤 및 catch 안내에 함께 쓰인다. */
export function canCommitStudioHybridDccCoplanarEdgeDissolve(plan: StudioHybridDccCoplanarEdgeDissolvePlan): boolean {
  const issued = issuedPlans.get(plan);
  if (!issued) return false;
  try {
    assertLive(issued.source);
    return true;
  } catch {
    return false;
  }
}
