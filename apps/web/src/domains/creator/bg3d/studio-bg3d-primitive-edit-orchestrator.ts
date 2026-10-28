import { applyStudioBg3dFaceEditOperation } from "./studio-bg3d-face-edit-orchestrator";
import type { StudioBg3dFaceEditOrchestratorHost, StudioBg3dFaceEditApplyResult } from "./studio-bg3d-face-edit-orchestrator";
import { exportStudioBg3dFaceEditAsset } from "./studio-bg3d-face-edit-export";
import { revalidateStudioBg3dPrimitiveEditSource } from "./studio-bg3d-primitive-edit-source";
import { replaceStudioBg3dPrimitiveEditSource } from "./studio-bg3d-primitive-edit-replacement";
import type { StudioBg3dPrimitiveEditWorkspace } from "./studio-bg3d-primitive-edit-workspace";
import type { StudioHybridDccWorkspace } from "../hybrid-dcc/studio-hybrid-dcc-workspace";

export type StudioBg3dPrimitiveEditOrchestratorHost = StudioBg3dFaceEditOrchestratorHost;
export type StudioBg3dPrimitiveFaceApplyResult = StudioBg3dFaceEditApplyResult;

/** 기본 상자 source 권위를 공통 저장·보상 경계에 연결한다. */
export function applyStudioBg3dPrimitiveEditWorkspace(
  host: StudioBg3dPrimitiveEditOrchestratorHost,
  context: StudioBg3dPrimitiveEditWorkspace,
  workspace: StudioHybridDccWorkspace,
  signal: AbortSignal,
): Promise<StudioBg3dPrimitiveFaceApplyResult> {
  return applyStudioBg3dFaceEditOperation(host, {
    modalSession: context.source.modalSession, sourceNodeId: context.source.sourceNodeId,
    name: context.source.canonicalNode.name,
    rights: { status: "owned", commercialUse: true, attributionRequired: false },
    readSource: () => revalidateStudioBg3dPrimitiveEditSource(host, context.source),
    exportAsset: () => exportStudioBg3dFaceEditAsset(context, workspace, context.source.primitive.color),
    replaceAsset: (asset) => replaceStudioBg3dPrimitiveEditSource(host, context.source, asset),
  }, signal);
}
