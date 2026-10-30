/** 현재 오브젝트의 전체 UV 정리를 불변 명령 한 번으로 확정한다. */
import { hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { hashStudioMeshUvLayer } from "../mesh-uv/studio-mesh-uv-authority";
import { packStudioMeshCornerUvs, STUDIO_MESH_UV_PACK_DEFAULT_OPTIONS, type StudioMeshUvPackOptions } from "../mesh-uv/studio-mesh-uv-pack";

import { hybridDccCommitGeometry } from "./studio-hybrid-dcc-document";
import { synchronizeWorkspaceGeometryAuthority, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

export function workspacePackUvActive(
  workspace: StudioHybridDccWorkspace,
  options: StudioMeshUvPackOptions = STUDIO_MESH_UV_PACK_DEFAULT_OPTIONS,
): StudioHybridDccWorkspace {
  const assetId = workspace.activeAssetId;
  const record = assetId ? workspace.session.state.geometry.records[assetId] : undefined;
  if (!assetId || !record) throw new Error("UV를 정리할 오브젝트를 먼저 선택하세요.");
  if (record.meshHash !== hashStudioEditableMesh(record.mesh)) throw new Error("UV 원본 메시의 정본 해시가 현재 편집 내용과 다릅니다.");
  const packed = packStudioMeshCornerUvs(record.mesh, options);
  if (record.mesh.uvLayer && hashStudioMeshUvLayer(record.mesh.uvLayer) === hashStudioMeshUvLayer(packed.uvLayer)) return workspace;
  const mesh = { ...record.mesh, uvLayer: packed.uvLayer };
  return synchronizeWorkspaceGeometryAuthority(workspace, hybridDccCommitGeometry(workspace.session, assetId, mesh));
}
