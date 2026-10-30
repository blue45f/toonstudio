import { applyStudioBg3dFaceEditOperation } from "./studio-bg3d-face-edit-orchestrator";
import type { StudioBg3dFaceEditApplyResult, StudioBg3dFaceEditOrchestratorHost } from "./studio-bg3d-face-edit-orchestrator";
import { exportStudioBg3dFaceEditAsset } from "./studio-bg3d-face-edit-export";
import { revalidateStudioBg3dAuthoredModelEditSource, rereadStudioBg3dAuthoredModelEditSource } from "./studio-bg3d-authored-model-edit-source";
import type { StudioBg3dAuthoredModelEditSourceHost } from "./studio-bg3d-authored-model-edit-source";
import { replaceStudioBg3dAuthoredModelEditSource } from "./studio-bg3d-authored-model-edit-replacement";
import type { StudioBg3dAuthoredModelEditWorkspace } from "./studio-bg3d-authored-model-edit-workspace";
import type { StudioHybridDccWorkspace } from "../hybrid-dcc/studio-hybrid-dcc-workspace";

export type StudioBg3dAuthoredModelEditOrchestratorHost = StudioBg3dFaceEditOrchestratorHost & StudioBg3dAuthoredModelEditSourceHost;

/** 현재 인스턴스·원본 record의 권리와 지문을 유지하고 기존 자산은 덮지 않는다. */
export function applyStudioBg3dAuthoredModelEditWorkspace(
  host: StudioBg3dAuthoredModelEditOrchestratorHost,
  context: StudioBg3dAuthoredModelEditWorkspace,
  workspace: StudioHybridDccWorkspace,
  signal: AbortSignal,
): Promise<StudioBg3dFaceEditApplyResult> {
  return applyStudioBg3dFaceEditOperation(host, {
    modalSession: context.source.modalSession, sourceNodeId: context.source.sourceNodeId,
    name: context.source.canonicalNode.name, rights: context.source.recordIdentity.rights,
    sourceRecordIdentity: { id: context.source.recordIdentity.storageModelId,
      contentHash: context.source.recordIdentity.contentHash, byteSize: context.source.recordIdentity.byteSize,
      mime: context.source.recordIdentity.mime, rights: context.source.recordIdentity.rights,
      ...(context.source.recordIdentity.sourceRestriction ? { sourceRestriction: context.source.recordIdentity.sourceRestriction } : {}) },
    readSource: () => revalidateStudioBg3dAuthoredModelEditSource(host, context.source),
    rereadSource: (readSignal) => rereadStudioBg3dAuthoredModelEditSource(host, context.source, readSignal),
    exportAsset: () => exportStudioBg3dFaceEditAsset(context, workspace, context.source.sourceColorSrgb),
    replaceAsset: (asset) => replaceStudioBg3dAuthoredModelEditSource(host, context.source, asset),
  }, signal);
}
