import type { StudioHybridDccWorkspace } from "../hybrid-dcc/studio-hybrid-dcc-workspace";
import type { StudioBg3dFaceEditWorkspaceBase } from "./studio-bg3d-face-edit-workspace-base";
import type { StudioBg3dPrimitiveEditAuthoringValue } from "./studio-bg3d-primitive-edit-authoring";
import { createStudioBg3dPrimitiveEditAuthoring } from "./studio-bg3d-primitive-edit-authoring";
import { writeStudioBg3dPrimitiveEditAuthoringToGlb } from "./studio-bg3d-primitive-edit-authoring-glb";
import { writeStudioBg3dPrimitiveEditMaterialGlb } from "./studio-bg3d-primitive-edit-material";
import { exportStudioBg3dPrimitiveEditWorkspace } from "./studio-bg3d-primitive-edit-workspace";

export type StudioBg3dFaceEditExportResult = {
  readonly ok: true;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly authoring: StudioBg3dPrimitiveEditAuthoringValue;
} | { readonly ok: false; readonly stage: "export" | "material" | "authoring"; readonly messageKo: string };

/** 렌더 형상·단색과 정확한 편집 메시가 함께 보존된 자산만 저장 경계로 보낸다. */
export function exportStudioBg3dFaceEditAsset(
  context: StudioBg3dFaceEditWorkspaceBase,
  workspace: StudioHybridDccWorkspace,
  colorSrgb: string,
): StudioBg3dFaceEditExportResult {
  const exported = exportStudioBg3dPrimitiveEditWorkspace(context, workspace);
  if (!exported.ok) return { ...exported, stage: "export" };
  const material = writeStudioBg3dPrimitiveEditMaterialGlb(exported.bytes, colorSrgb);
  if (!material.ok) return { ok: false, stage: "material", messageKo: material.messageKo };
  const record = workspace.session.state.geometry.records[context.assetId];
  if (!record) return { ok: false, stage: "authoring", messageKo: "확정한 원본 메시의 권위를 찾지 못했습니다." };
  const authoring = createStudioBg3dPrimitiveEditAuthoring({ assetId: context.assetId,
    revision: exported.sourceRevision, mesh: record.mesh, objectTransformAtExport: context.initialTransform, colorSrgb });
  if (!authoring.ok) return { ok: false, stage: "authoring", messageKo: authoring.messageKo };
  const encoded = writeStudioBg3dPrimitiveEditAuthoringToGlb(material.bytes, authoring.value.envelope);
  return encoded.ok ? { ok: true, bytes: encoded.value, authoring: authoring.value }
    : { ok: false, stage: "authoring", messageKo: encoded.messageKo };
}
