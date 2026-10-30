/** 툰 재질은 geometry 정본을 바꾸지 않고 별도 문서 명령으로 적용한다. */
import { hybridDccSetAssetToonMaterial } from "../studio-hybrid-dcc-document";
import { synchronizeWorkspaceGeometryAuthority, type StudioHybridDccWorkspace } from "../studio-hybrid-dcc-workspace";

import type { StudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";

export function workspaceSetStudioHybridDccToonMaterial(
  workspace: StudioHybridDccWorkspace,
  assetId: string,
  slots: readonly number[],
  material: StudioHybridDccToonMaterial | null,
): StudioHybridDccWorkspace {
  const session = hybridDccSetAssetToonMaterial(workspace.session, assetId, slots, material);
  return session === workspace.session ? workspace : synchronizeWorkspaceGeometryAuthority(workspace, session);
}
