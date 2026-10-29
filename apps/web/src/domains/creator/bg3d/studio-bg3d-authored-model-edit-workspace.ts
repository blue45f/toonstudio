import { createStudioBg3dFaceEditWorkspaceBase } from "./studio-bg3d-face-edit-workspace-base";
import type { StudioBg3dFaceEditWorkspaceBase } from "./studio-bg3d-face-edit-workspace-base";
import type { StudioBg3dAuthoredModelEditSourceSnapshot } from "./studio-bg3d-authored-model-edit-source";

export interface StudioBg3dAuthoredModelEditWorkspace extends StudioBg3dFaceEditWorkspaceBase {
  readonly kind: "authored-model";
  readonly source: StudioBg3dAuthoredModelEditSourceSnapshot;
}

/** 렌더 좌표를 재구성하지 않고 검증한 원본 메시와 현재 인스턴스 배치로 새 로컬 세션을 연다. */
export function createStudioBg3dAuthoredModelEditWorkspace(source: StudioBg3dAuthoredModelEditSourceSnapshot):
  { readonly ok: true; readonly value: StudioBg3dAuthoredModelEditWorkspace } | { readonly ok: false; readonly messageKo: string } {
  const rights = source.recordIdentity.rights;
  const common = createStudioBg3dFaceEditWorkspaceBase({ kind: "authored-model",
    assetId: source.sourceNodeId, displayName: source.canonicalNode.name,
    mesh: source.authoring.mesh, transform: source.objectTransform,
    rights: { source: "원본 메시 권위가 보관된 BG3D 모델", creator: "원본 모델 권리 정보 참조",
      license: rights.licenseName || rights.status, useScope: "현재 원본과 같은 권리 범위", derivative: "모델의 면 편집" },
  });
  if (!common.ok) return common;
  if (common.value.initialMeshHash !== source.authoring.envelope.source.meshHash) {
    return { ok: false, messageKo: "로컬 편집기의 원본 메시 지문이 저장된 정밀 형상과 다릅니다." };
  }
  return { ok: true, value: { ...common.value, kind: "authored-model", source } };
}
