import { hybridDccRegisterAsset } from "../hybrid-dcc/studio-hybrid-dcc-document";
import { createStudioHybridDccComponentSelection, mutateStudioHybridDccComponentSelection } from "../hybrid-dcc/studio-hybrid-dcc-component-selection";
import { createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority, workspaceComponentSelectionSource } from "../hybrid-dcc/studio-hybrid-dcc-workspace";
import { exportStudioHybridDccMeshGlb } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";
import { convertStudioBg3dPrimitiveToEditableMesh } from "./studio-bg3d-primitive-edit-mesh";

import type { StudioHybridDccWorkspace } from "../hybrid-dcc/studio-hybrid-dcc-workspace";
import type { StudioHybridDccComponentSelection } from "../hybrid-dcc/studio-hybrid-dcc-component-selection";
import type { StudioHybridDccObjectTransform } from "../hybrid-dcc/studio-hybrid-dcc-object-transform";
import type { StudioBg3dPrimitiveEditSourceSnapshot } from "./studio-bg3d-primitive-edit-source";
import type { StudioBg3dPrimitiveEditMeshValue } from "./studio-bg3d-primitive-edit-mesh";

export interface StudioBg3dPrimitiveEditWorkspace {
  readonly source: StudioBg3dPrimitiveEditSourceSnapshot;
  readonly workspace: StudioHybridDccWorkspace;
  readonly selection: StudioHybridDccComponentSelection;
  readonly geometry: StudioBg3dPrimitiveEditMeshValue;
  readonly assetId: string;
  readonly initialMeshHash: string;
  readonly initialTransform: StudioHybridDccObjectTransform;
  readonly initialUndoDepth: number;
}

type Failure = { readonly ok: false; readonly messageKo: string };
export type StudioBg3dPrimitiveEditWorkspaceResult = Failure | { readonly ok: true; readonly value: StudioBg3dPrimitiveEditWorkspace };

/** 원본 형상·TRS를 가진 독립 작업공간을 만든다. 기존 DCC 작업·복구 저장소에는 쓰지 않는다. */
export function createStudioBg3dPrimitiveEditWorkspace(source: StudioBg3dPrimitiveEditSourceSnapshot): StudioBg3dPrimitiveEditWorkspaceResult {
  try {
    const converted = convertStudioBg3dPrimitiveToEditableMesh(source.primitive);
    if (!converted.ok || !converted.value.closed || converted.value.primitiveKind !== "box") {
      return { ok: false, messageKo: "선택한 상자의 실제 형상을 편집 가능한 닫힌 메시로 옮기지 못했습니다." };
    }
    const assetId = source.sourceNodeId;
    const empty = createStudioHybridDccWorkspace(`primitive-edit-${assetId}`);
    const primitive = source.primitive;
    const registered = hybridDccRegisterAsset(empty.session, assetId, converted.value.mesh, {
      source: "ToonStudio BG3D 기본 도형", creator: "사용자", license: "사용자 제작",
      useScope: "원본 장면과 동일", derivative: "기본 도형의 면 편집",
    }, { revision: 1, position: [...primitive.position], rotationEulerRad: [...primitive.rotation], scale: [...primitive.scale] });
    const workspace: StudioHybridDccWorkspace = { ...synchronizeWorkspaceGeometryAuthority(empty, registered), activeAssetId: assetId };
    const record = workspace.session.state.geometry.records[assetId];
    const initialTransform = workspace.session.state.objectTransforms[assetId];
    const selectionSource = workspaceComponentSelectionSource(workspace);
    if (!record || !initialTransform || !selectionSource) return { ok: false, messageKo: "원본 도형의 편집 권위를 준비하지 못했습니다." };
    const selected = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
      mode: "face", operation: "replace", ids: [], activeId: null, source: selectionSource,
    });
    if (!selected.ok) return { ok: false, messageKo: "원본 도형의 면 선택을 준비하지 못했습니다." };
    return { ok: true, value: { source, workspace, selection: selected.value, geometry: converted.value,
      assetId, initialMeshHash: record.meshHash, initialTransform, initialUndoDepth: workspace.session.undoStack.length } };
  } catch {
    return { ok: false, messageKo: "원본 도형의 편집 작업공간을 만들지 못했습니다. 장면을 확인한 뒤 다시 시도하세요." };
  }
}

export type StudioBg3dPrimitiveEditExportResult = Failure | {
  readonly ok: true;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly sourceHash: string;
  readonly sourceRevision: number;
};

/** 면 편집의 확정된 권위만 내보낸다. 다른 오브젝트·변형 스택·오브젝트 변환은 조용히 버리지 않는다. */
export function exportStudioBg3dPrimitiveEditWorkspace(context: StudioBg3dPrimitiveEditWorkspace, workspace: StudioHybridDccWorkspace): StudioBg3dPrimitiveEditExportResult {
  try {
    const records = workspace.session.state.geometry.records;
    const record = records[context.assetId];
    const transforms = workspace.session.state.objectTransforms;
    if (workspace.activeAssetId !== context.assetId || Object.keys(records).length !== 1 || !record
      || Object.keys(transforms).length !== 1 || JSON.stringify(transforms[context.assetId]) !== JSON.stringify(context.initialTransform)
      || record.modifierStack.modifiers.length !== 0) {
      return { ok: false, messageKo: "원본 도형의 면 편집만 반영할 수 있습니다. 오브젝트 추가·변환·절차 변형은 되돌려 주세요." };
    }
    if (record.meshHash === context.initialMeshHash) return { ok: false, messageKo: "원본에 반영할 면 편집 변경이 없습니다." };
    const exported = exportStudioHybridDccMeshGlb({ assetId: context.assetId, mesh: record.mesh,
      sourceHash: record.meshHash, sourceRevision: record.revision });
    return exported.ok ? { ok: true, bytes: exported.bytes, sourceHash: record.meshHash, sourceRevision: record.revision }
      : { ok: false, messageKo: "확정한 면 편집을 검증된 GLB로 만들지 못했습니다. 메시 상태를 확인해 주세요." };
  } catch {
    return { ok: false, messageKo: "면 편집 결과를 내보내지 못했습니다. 원본 장면은 변경하지 않았습니다." };
  }
}
