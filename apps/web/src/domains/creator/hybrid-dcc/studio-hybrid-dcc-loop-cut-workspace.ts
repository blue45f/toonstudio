/** 절단 전 표시되던 원본이 새 Float32 표면에서 사라지는 결과는 문서 확정 전에 거부한다. */
import { loopCutStudioEditableMesh, type StudioEditableMesh, type StudioEditableMeshFailureCode } from "../studio-editable-half-edge-mesh";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";

import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

type CommitWorkspaceMesh = (
  workspace: StudioHybridDccWorkspace,
  assetId: string,
  mesh: StudioEditableMesh,
) => StudioHybridDccWorkspace;

export type StudioHybridDccLoopCutFailureCode = StudioEditableMeshFailureCode
  | "no-active-asset"
  | "missing-asset"
  | "no-edge"
  | "surface-unavailable";

/** 사용자 문구는 화면에서 code로 만들고 원본 detail/message는 진단 계약으로 보존한다. */
export class StudioHybridDccLoopCutError extends Error {
  constructor(readonly code: StudioHybridDccLoopCutFailureCode, readonly detail: string) {
    super(detail);
    this.name = "StudioHybridDccLoopCutError";
  }
}

export function applyStudioHybridDccLoopCut(
  workspace: StudioHybridDccWorkspace,
  factor: number,
  startHalfEdgeId: number | undefined,
  commit: CommitWorkspaceMesh,
): StudioHybridDccWorkspace {
  const assetId = workspace.activeAssetId;
  if (!assetId) throw new StudioHybridDccLoopCutError("no-active-asset", "no active asset");
  const record = workspace.session.state.geometry.records[assetId];
  if (!record) throw new StudioHybridDccLoopCutError("missing-asset", `missing ${assetId}`);
  const selected = startHalfEdgeId ?? record.mesh.halfEdges[0]?.id;
  if (selected === undefined) throw new StudioHybridDccLoopCutError("no-edge", "mesh has no edge to cut");
  const result = loopCutStudioEditableMesh(record.mesh, selected, factor);
  if (!result.ok) throw new StudioHybridDccLoopCutError(result.code, result.detail);

  // 이미 표시할 수 없던 입력의 편집 범위는 유지하고, 이번 편집이 새로 만드는 표시 유실만 막는다.
  if (inspectStudioMeshSurfaceForInteractiveProjection(record.mesh).ok) {
    const projection = inspectStudioMeshSurfaceForInteractiveProjection(result.value);
    if (!projection.ok) {
      throw new StudioHybridDccLoopCutError("surface-unavailable", `절단 결과를 화면에 표시할 수 없어 취소했습니다. 원본과 편집 이력은 그대로입니다. ${projection.message}`);
    }
  }
  return commit(workspace, assetId, result.value);
}
