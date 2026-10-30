import type { StudioHybridDccWorkspace } from "../hybrid-dcc/studio-hybrid-dcc-workspace";
import type { StudioHybridDccComponentSelection } from "../hybrid-dcc/studio-hybrid-dcc-component-selection";
import type { StudioHybridDccObjectTransform } from "../hybrid-dcc/studio-hybrid-dcc-object-transform";
import type { StudioRightsBomRecord } from "../hybrid-dcc/studio-hybrid-dcc-document";
import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { hybridDccRegisterAsset } from "../hybrid-dcc/studio-hybrid-dcc-document";
import { createStudioHybridDccComponentSelection, mutateStudioHybridDccComponentSelection } from "../hybrid-dcc/studio-hybrid-dcc-component-selection";
import { createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority, workspaceComponentSelectionSource } from "../hybrid-dcc/studio-hybrid-dcc-workspace";
import { hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";

/** 면 편집기의 로컬 권위다. source snapshot의 종류와 검증은 각 진입 명령이 소유한다. */
export interface StudioBg3dFaceEditWorkspaceBase {
  readonly kind: "primitive" | "authored-model";
  readonly displayName: string;
  readonly workspace: StudioHybridDccWorkspace;
  readonly selection: StudioHybridDccComponentSelection;
  readonly assetId: string;
  readonly initialMeshHash: string;
  readonly initialTransform: StudioHybridDccObjectTransform;
  readonly initialUndoDepth: number;
}

/** 원본을 공유하지 않고 같은 면 선택·history 경계로 독립 세션을 초기화한다. */
export function createStudioBg3dFaceEditWorkspaceBase(input: {
  readonly kind: StudioBg3dFaceEditWorkspaceBase["kind"];
  readonly displayName: string;
  readonly assetId: string;
  readonly mesh: StudioEditableMesh;
  readonly transform: StudioHybridDccObjectTransform;
  readonly rights: Omit<StudioRightsBomRecord, "assetId" | "contentHash">;
}): { readonly ok: true; readonly value: StudioBg3dFaceEditWorkspaceBase } | { readonly ok: false; readonly messageKo: string } {
  try {
    const initialHash = hashStudioEditableMesh(input.mesh);
    const empty = createStudioHybridDccWorkspace(`bg3d-face-edit-${input.assetId}`);
    const registered = hybridDccRegisterAsset(empty.session, input.assetId, structuredClone(input.mesh), input.rights, input.transform);
    const workspace: StudioHybridDccWorkspace = { ...synchronizeWorkspaceGeometryAuthority(empty, registered), activeAssetId: input.assetId };
    const record = workspace.session.state.geometry.records[input.assetId];
    const initialTransform = workspace.session.state.objectTransforms[input.assetId];
    const source = workspaceComponentSelectionSource(workspace);
    if (!record || !initialTransform || !source || record.meshHash !== initialHash
      || JSON.stringify(initialTransform) !== JSON.stringify(input.transform)) {
      return { ok: false, messageKo: "원본 메시와 배치를 변경하지 않고 면 편집 권위를 준비하지 못했습니다." };
    }
    const selection = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
      mode: "face", operation: "replace", ids: [], activeId: null, source,
    });
    if (!selection.ok) return { ok: false, messageKo: "원본 메시의 면 선택을 준비하지 못했습니다." };
    return { ok: true, value: { kind: input.kind, displayName: input.displayName, workspace, selection: selection.value,
      assetId: input.assetId, initialMeshHash: initialHash, initialTransform, initialUndoDepth: workspace.session.undoStack.length } };
  } catch { return { ok: false, messageKo: "원본 메시의 독립 면 편집 작업공간을 만들지 못했습니다." }; }
}
