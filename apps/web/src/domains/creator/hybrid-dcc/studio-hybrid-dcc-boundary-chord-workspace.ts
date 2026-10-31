/** 경계 chord의 계산·표시·문서 확정을 잇는다. 표시용 메시와 명령 권위는 따로 보관한다. */
import {
  deserializeStudioEditableMesh, hashStudioEditableMesh, serializeStudioEditableMesh,
  type StudioEditableMesh, type StudioEditableMeshSnapshot,
} from "../studio-editable-half-edge-mesh";
import {
  admitStudioHybridDccBoundaryEndpoint,
  type StudioBoundaryEndpointLease, type StudioBoundaryEndpointFailureCode,
} from "./studio-hybrid-dcc-boundary-endpoint";
import {
  createStudioHybridDccComponentSelection, mutateStudioHybridDccComponentSelection,
  type StudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import { hybridDccCommitGeometry } from "./studio-hybrid-dcc-document";
import { computeStudioHybridDccBoundaryChordInWorker } from "./studio-hybrid-dcc-boundary-chord-worker-client";
import { studioBoundaryChordMessage } from "./studio-hybrid-dcc-boundary-chord-messages";
import { workspaceComponentSelectionSource, synchronizeWorkspaceGeometryAuthority, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

import type { StudioBoundaryChordRequest } from "./studio-hybrid-dcc-boundary-chord";
import type { StudioBoundaryChordUvResult } from "./studio-hybrid-dcc-boundary-chord-uv";
import type { StudioBoundaryChordWorkerInput } from "./studio-hybrid-dcc-boundary-chord-worker-protocol";
import type { StudioHybridDccWorkspaceEditResult } from "./studio-hybrid-dcc-face-modeling-workspace";

type Outcome = Extract<StudioBoundaryChordUvResult, { readonly ok: true }>;
export interface StudioBoundaryChordWorkspaceRequest {
  readonly tool: "boundary-chord";
  readonly endpoints: readonly [StudioBoundaryEndpointLease, StudioBoundaryEndpointLease];
}
export interface StudioBoundaryChordCurrent {
  readonly workspace: StudioHybridDccWorkspace;
  readonly selection: StudioHybridDccComponentSelection;
}
export interface StudioBoundaryChordPreparation {
  readonly generation: number;
  readonly signal?: AbortSignal;
  readonly readCurrent: () => StudioBoundaryChordCurrent;
  readonly isCurrent: () => boolean;
  /** 실행 경계만 교체한다. 기본값은 실제 전용 Worker이며 main 동기 fallback은 없다. */
  readonly compute?: (input: StudioBoundaryChordWorkerInput, options: { readonly signal?: AbortSignal }) => Promise<StudioBoundaryChordUvResult>;
}
export interface StudioBoundaryChordPlan {
  readonly tool: "boundary-chord";
  readonly assetId: string;
  readonly generation: number;
  readonly sourceMeshHash: string;
  readonly sourceMeshRevision: number;
  readonly resultMeshHash: string;
  readonly faceRemap: Outcome["faceRemap"];
  readonly halfEdgeRemap: Outcome["halfEdgeRemap"];
  readonly addedVertexIds: readonly number[];
  readonly selectionFaceIds: readonly number[];
  readonly faceCountBefore: number;
  readonly faceCountAfter: number;
}
export interface StudioBoundaryChordWorkspaceResult extends StudioHybridDccWorkspaceEditResult {
  readonly selection: StudioHybridDccComponentSelection;
  readonly plan: StudioBoundaryChordPlan;
}
export type StudioBoundaryChordWorkspaceErrorCode = StudioBoundaryEndpointFailureCode
  | Exclude<StudioBoundaryChordUvResult, { readonly ok: true }>["code"]
  | "aborted" | "stale-preview" | "untrusted-plan" | "selection-required";
export class StudioBoundaryChordWorkspaceError extends Error {
  constructor(readonly code: StudioBoundaryChordWorkspaceErrorCode, readonly reasonKo: string) {
    super(studioBoundaryChordMessage(code));
    this.name = code === "aborted" ? "AbortError" : "StudioBoundaryChordWorkspaceError";
  }
}
interface IssuedPlan {
  readonly source: StudioBoundaryChordCurrent;
  readonly request: StudioBoundaryChordWorkspaceRequest;
  readonly preparation: StudioBoundaryChordPreparation;
  readonly snapshot: StudioEditableMeshSnapshot;
}
const plans = new WeakMap<StudioBoundaryChordPlan, IssuedPlan>();
function stop(code: StudioBoundaryChordWorkspaceErrorCode, message: string): never { throw new StudioBoundaryChordWorkspaceError(code, message); }

function target(current: StudioBoundaryChordCurrent, request: StudioBoundaryChordWorkspaceRequest) {
  const source = workspaceComponentSelectionSource(current.workspace);
  if (!source) stop("selection-required", "경계를 나눌 현재 오브젝트와 한 면을 선택해 주세요.");
  const [start, end] = request.endpoints;
  for (const endpoint of [start, end]) {
    const admitted = admitStudioHybridDccBoundaryEndpoint(endpoint, source, current.selection);
    if (!admitted.ok) stop(admitted.code, admitted.messageKo);
  }
  if (start.faceId !== end.faceId) stop("selection-stale", "같은 선택면의 두 경계가 필요합니다.");
  const kernelRequest: StudioBoundaryChordRequest = {
    sourceMeshHash: source.sourceHash, sourceMeshRevision: source.meshRevision,
    faceId: start.faceId, start: start.anchor, end: end.anchor,
  };
  return { source, kernelRequest };
}
function guard(source: StudioBoundaryChordCurrent, request: StudioBoundaryChordWorkspaceRequest,
  preparation: StudioBoundaryChordPreparation, current = preparation.readCurrent()): void {
  if (preparation.signal?.aborted) stop("aborted", "면 나누기 미리보기를 취소했습니다.");
  if (!preparation.isCurrent() || current.workspace.session !== source.workspace.session
    || current.workspace.activeAssetId !== source.workspace.activeAssetId) {
    stop("stale-preview", "문서·선택 또는 미리보기 요청이 바뀌었습니다. 경계를 다시 선택해 주세요.");
  }
  // hash가 같은 Undo/Redo ABA도 동적 revision과 원본 mesh identity에서 거부한다.
  target(current, request);
}
function issued(plan: StudioBoundaryChordPlan, current: StudioBoundaryChordCurrent): IssuedPlan {
  const entry = plans.get(plan);
  if (!entry) stop("untrusted-plan", "이 작업공간에서 준비한 면 나누기 계획이 아닙니다.");
  guard(entry.source, entry.request, entry.preparation, current);
  guard(entry.source, entry.request, entry.preparation);
  return entry;
}
function resultMesh(plan: StudioBoundaryChordPlan, entry: IssuedPlan): StudioEditableMesh {
  const mesh = deserializeStudioEditableMesh(entry.snapshot);
  if (hashStudioEditableMesh(mesh) !== plan.resultMeshHash) stop("invalid-result", "보관한 면 나누기 결과가 바뀌었습니다.");
  return mesh;
}
function selectionFor(plan: StudioBoundaryChordPlan, mesh: StudioEditableMesh, revision: number): StudioHybridDccComponentSelection {
  const result = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "face", operation: "replace", ids: plan.selectionFaceIds, activeId: plan.selectionFaceIds.at(-1),
    source: { assetId: plan.assetId, mesh, meshRevision: revision, sourceHash: plan.resultMeshHash },
  });
  if (!result.ok) stop("invalid-result", "나뉜 두 면의 실제 선택 대응을 만들지 못했습니다.");
  return result.value;
}

/** endpoint는 main의 opaque lease로 유지하고 계산에 필요한 f64/UV 사본만 Worker로 보낸다. */
export async function prepareStudioHybridDccBoundaryChord(current: StudioBoundaryChordCurrent,
  request: StudioBoundaryChordWorkspaceRequest, preparation: StudioBoundaryChordPreparation): Promise<StudioBoundaryChordPlan> {
  const endpoints: readonly [StudioBoundaryEndpointLease, StudioBoundaryEndpointLease] = [request.endpoints[0], request.endpoints[1]];
  Object.freeze(endpoints);
  const captured: StudioBoundaryChordWorkspaceRequest = Object.freeze({ tool: "boundary-chord", endpoints });
  const original: StudioBoundaryChordCurrent = Object.freeze({ workspace: current.workspace, selection: current.selection });
  guard(original, captured, preparation);
  if (!Number.isSafeInteger(preparation.generation) || preparation.generation < 1) stop("stale-preview", "유효한 미리보기 세대가 필요합니다.");
  const { source, kernelRequest } = target(original, captured);
  const outcome = await (preparation.compute ?? computeStudioHybridDccBoundaryChordInWorker)({
    assetId: source.assetId, mesh: source.mesh, meshHash: source.sourceHash,
    meshRevision: source.meshRevision, generation: preparation.generation, request: kernelRequest,
  }, { signal: preparation.signal });
  guard(original, captured, preparation);
  if (!outcome.ok) stop(outcome.code, outcome.messageKo);
  if (outcome.sourceMeshHash !== source.sourceHash || outcome.sourceMeshRevision !== source.meshRevision) {
    stop("invalid-result", "미리보기 결과의 원본 해시 또는 편집 버전이 다릅니다.");
  }
  const snapshot = serializeStudioEditableMesh(outcome.mesh);
  const resultHash = hashStudioEditableMesh(deserializeStudioEditableMesh(snapshot));
  if (resultHash === source.sourceHash) stop("invalid-result", "면을 나누지 않은 결과는 확정할 수 없습니다.");
  const plan: StudioBoundaryChordPlan = Object.freeze({
    tool: "boundary-chord", assetId: source.assetId, generation: preparation.generation,
    sourceMeshHash: source.sourceHash, sourceMeshRevision: source.meshRevision, resultMeshHash: resultHash,
    faceRemap: Object.freeze(outcome.faceRemap.map((entry) => Object.freeze({ ...entry, resultFaceIds: Object.freeze([...entry.resultFaceIds]) }))),
    halfEdgeRemap: Object.freeze(outcome.halfEdgeRemap.map((entry) => Object.freeze({ ...entry, resultHalfEdgeIds: Object.freeze([...entry.resultHalfEdgeIds]) }))),
    selectionFaceIds: Object.freeze([...outcome.selectionFaceIds]), addedVertexIds: Object.freeze([...outcome.addedVertexIds]),
    faceCountBefore: source.mesh.faces.length, faceCountAfter: outcome.mesh.faces.length,
  });
  plans.set(plan, { source: original, request: captured, preparation, snapshot });
  return plan;
}

/** 매번 별도 표시 사본을 만든다. caller가 preview mesh를 바꿔도 보관한 확정 결과는 바뀌지 않는다. */
export function previewStudioHybridDccBoundaryChord(current: StudioBoundaryChordCurrent, plan: StudioBoundaryChordPlan): StudioBoundaryChordWorkspaceResult {
  const entry = issued(plan, current), mesh = resultMesh(plan, entry), geometry = current.workspace.session.state.geometry;
  const record = geometry.records[plan.assetId];
  if (!record) stop("stale-preview", "현재 geometry record가 없습니다.");
  return {
    plan, selection: selectionFor(plan, mesh, record.revision),
    workspace: { ...current.workspace, session: { ...current.workspace.session, state: { ...current.workspace.session.state,
      geometry: { ...geometry, records: { ...geometry.records, [plan.assetId]: { ...record, mesh, meshHash: plan.resultMeshHash, renderCache: null } } },
    } } },
  };
}

/** 기존 geometry.commit 한 번에 전체 f64·UV 스냅샷을 저장한다. extrude 전용 영수증으로 위장하지 않는다. */
export function commitStudioHybridDccBoundaryChord(current: StudioBoundaryChordCurrent, plan: StudioBoundaryChordPlan): StudioBoundaryChordWorkspaceResult {
  const entry = issued(plan, current), mesh = resultMesh(plan, entry);
  const session = hybridDccCommitGeometry(current.workspace.session, plan.assetId, mesh);
  const workspace = synchronizeWorkspaceGeometryAuthority(current.workspace, session);
  const record = session.state.geometry.records[plan.assetId];
  if (!record || record.meshHash !== plan.resultMeshHash) stop("invalid-result", "문서가 면 나누기 결과를 보존하지 못했습니다.");
  return { plan, workspace, selection: selectionFor(plan, record.mesh, record.revision) };
}
