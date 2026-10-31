/** Worker에서 계산한 atlas를 같은 정본 원본에만 한 번의 편집으로 적용한다. */
import { hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { hashStudioMeshUvLayer } from "../mesh-uv/studio-mesh-uv-authority";
import {
  applyStudioMeshUvAtlasInteropArtifact,
  type StudioMeshUvAtlasInteropUvBasis,
} from "../mesh-uv/studio-mesh-uv-atlas-interop";
import {
  prepareStudioMeshUvAtlasProvenance,
  type StudioMeshUvAtlasProvenancePrepared,
} from "../mesh-uv/studio-mesh-uv-atlas-provenance";

import { hybridDccCommitGeometry } from "./studio-hybrid-dcc-document";
import { synchronizeWorkspaceGeometryAuthority, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

import type { StudioXAtlasUvArtifact } from "../xatlas-uv/studio-xatlas-uv-provider";

export interface StudioHybridDccUvAtlasSnapshot {
  readonly documentId: string;
  readonly assetId: string;
  readonly sourceStateHash: string;
  readonly sourceRevision: number;
  readonly sourceMeshHash: string;
  readonly prepared: StudioMeshUvAtlasProvenancePrepared;
}

export type StudioHybridDccUvAtlasWorkspaceErrorCode = "invalid-source" | "stale-source" | "invalid-result";

export class StudioHybridDccUvAtlasWorkspaceError extends Error {
  constructor(readonly code: StudioHybridDccUvAtlasWorkspaceErrorCode, message: string) {
    super(message);
    this.name = "StudioHybridDccUvAtlasWorkspaceError";
  }
}

function activeSource(workspace: StudioHybridDccWorkspace) {
  const assetId = workspace.activeAssetId;
  const record = assetId ? workspace.session.state.geometry.records[assetId] : undefined;
  if (!assetId || !record) {
    throw new StudioHybridDccUvAtlasWorkspaceError("invalid-source", "자동 UV를 적용할 오브젝트를 먼저 선택하세요.");
  }
  if (record.assetId !== assetId || record.meshHash !== hashStudioEditableMesh(record.mesh)) {
    throw new StudioHybridDccUvAtlasWorkspaceError("invalid-source", "자동 UV 원본 메시의 정본 해시가 현재 편집 내용과 다릅니다.");
  }
  return { assetId, record };
}

/** 원본 배열의 소유권은 유지한다. Worker client가 요청을 별도로 복사한다. */
export function prepareStudioHybridDccUvAtlas(workspace: StudioHybridDccWorkspace): StudioHybridDccUvAtlasSnapshot {
  const { assetId, record } = activeSource(workspace);
  const prepared = prepareStudioMeshUvAtlasProvenance(record.mesh);
  return Object.freeze({
    documentId: workspace.session.state.documentId,
    assetId,
    sourceStateHash: workspace.session.state.stateHash,
    sourceRevision: record.revision,
    sourceMeshHash: record.meshHash,
    prepared,
  });
}

/** 계산한 결과를 발행하기 직전 원본만 다시 확인한다. 새 명령이나 파생 결과를 만들지 않는다. */
export function assertStudioHybridDccUvAtlasSnapshot(
  workspace: StudioHybridDccWorkspace,
  snapshot: StudioHybridDccUvAtlasSnapshot,
): void {
  const { assetId, record } = activeSource(workspace);
  if (workspace.session.state.documentId !== snapshot.documentId
    || assetId !== snapshot.assetId
    || workspace.session.state.stateHash !== snapshot.sourceStateHash
    || record.revision !== snapshot.sourceRevision
    || record.meshHash !== snapshot.sourceMeshHash
    || snapshot.prepared.sourceHash !== snapshot.sourceMeshHash) {
    throw new StudioHybridDccUvAtlasWorkspaceError("stale-source", "자동 UV를 계산한 뒤 문서·선택 또는 원본이 바뀌었습니다. 다시 계산하세요.");
  }
}

/** UV 축은 호출자가 명시한다. 이 경계는 provider의 축을 추측하거나 검증 표시를 만들지 않는다. */
export function workspaceApplyUvAtlas(
  workspace: StudioHybridDccWorkspace,
  snapshot: StudioHybridDccUvAtlasSnapshot,
  artifact: StudioXAtlasUvArtifact,
  uvBasis: StudioMeshUvAtlasInteropUvBasis,
): StudioHybridDccWorkspace {
  assertStudioHybridDccUvAtlasSnapshot(workspace, snapshot);
  const assetId = snapshot.assetId;
  const record = workspace.session.state.geometry.records[assetId];
  if (!record) {
    throw new StudioHybridDccUvAtlasWorkspaceError("invalid-source", "자동 UV를 적용할 오브젝트를 먼저 선택하세요.");
  }
  const mesh = applyStudioMeshUvAtlasInteropArtifact(record.mesh, snapshot.prepared, artifact, assetId, uvBasis);
  if (!mesh.uvLayer) {
    throw new StudioHybridDccUvAtlasWorkspaceError("invalid-result", "자동 UV 결과에 정본 코너 UV가 없습니다.");
  }
  if (record.mesh.uvLayer && hashStudioMeshUvLayer(record.mesh.uvLayer) === hashStudioMeshUvLayer(mesh.uvLayer)) {
    return workspace;
  }
  return synchronizeWorkspaceGeometryAuthority(workspace, hybridDccCommitGeometry(workspace.session, assetId, mesh));
}
