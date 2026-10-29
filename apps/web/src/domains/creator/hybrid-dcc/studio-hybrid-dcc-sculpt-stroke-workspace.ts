/** 여러 sample의 최종 메시만 기존 문서 명령·bridge 동기화 한 번으로 확정한다. */
import { hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";

import { hybridDccCommitGeometry } from "./studio-hybrid-dcc-document";
import {
  consumeStudioSculptStrokeReceipt,
  createStudioSculptStrokeSession,
  type StudioSculptStrokeBrush,
  type StudioSculptStrokeReceipt,
  type StudioSculptStrokeSession,
} from "./studio-hybrid-dcc-sculpt-stroke-session";
import { synchronizeWorkspaceGeometryAuthority, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

function activeRecord(workspace: StudioHybridDccWorkspace) {
  const assetId = workspace.activeAssetId;
  if (!assetId || !Object.hasOwn(workspace.session.state.geometry.records, assetId)) throw new Error("조형할 오브젝트를 먼저 선택하세요.");
  const record = workspace.session.state.geometry.records[assetId];
  if (!record) throw new Error("선택한 조형 오브젝트의 정본을 찾을 수 없습니다.");
  return record;
}

export function createStudioHybridDccSculptStrokeSession(
  workspace: StudioHybridDccWorkspace,
  brush: StudioSculptStrokeBrush,
  mask?: Float32Array | null,
): StudioSculptStrokeSession {
  const record = activeRecord(workspace);
  return createStudioSculptStrokeSession({
    documentId: workspace.session.state.documentId, workspaceIdentity: workspace,
    documentStateIdentity: workspace.session.state, assetId: record.assetId,
    mesh: record.mesh, meshHash: record.meshHash, meshRevision: record.revision,
  }, brush, mask);
}

export function commitStudioHybridDccSculptStroke(
  workspace: StudioHybridDccWorkspace,
  receipt: StudioSculptStrokeReceipt | null,
): StudioHybridDccWorkspace {
  if (receipt === null) return workspace;
  return consumeStudioSculptStrokeReceipt(receipt, ({ source, mesh, meshHash }) => {
    const record = activeRecord(workspace);
    if (source.workspaceIdentity !== workspace || source.documentStateIdentity !== workspace.session.state
      || source.documentId !== workspace.session.state.documentId || source.assetId !== workspace.activeAssetId
      || record.assetId !== source.assetId || record.mesh !== source.mesh || record.meshHash !== source.meshHash
      || record.revision !== source.meshRevision || hashStudioEditableMesh(record.mesh) !== source.meshHash) {
      throw new Error("조형을 시작한 작업대·문서·선택·메시 버전이 바뀌었습니다. 결과를 취소하고 다시 시작하세요.");
    }
    if (hashStudioEditableMesh(mesh) !== meshHash) throw new Error("조형 결과의 정본 해시가 발급된 내용과 다릅니다.");
    if (meshHash === source.meshHash) return workspace;
    return synchronizeWorkspaceGeometryAuthority(workspace, hybridDccCommitGeometry(workspace.session, source.assetId, mesh));
  });
}
