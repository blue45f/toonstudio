import { describe, expect, it } from "vitest";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { captureStudioBg3dPrimitiveEditSource } from "./studio-bg3d-primitive-edit-source";
import { createStudioBg3dPrimitiveEditWorkspace, exportStudioBg3dPrimitiveEditWorkspace } from "./studio-bg3d-primitive-edit-workspace";
import { mutateStudioHybridDccComponentSelection } from "../hybrid-dcc/studio-hybrid-dcc-component-selection";
import { commitStudioHybridDccFaceModeling, previewStudioHybridDccFaceModeling } from "../hybrid-dcc/studio-hybrid-dcc-face-modeling-workspace";
import { workspaceCommitObjectTransform, workspaceComponentSelectionSource, workspaceRedo, workspaceUndo } from "../hybrid-dcc/studio-hybrid-dcc-workspace";
import type { BgPrimitive } from "../studio-background-3d-metadata";

function source() {
  const primitive: BgPrimitive = { id: "source-box", kind: "box", color: "#c9a876", name: "원본 상자",
    position: [2.25, 0.75, -3.5], rotation: [0.31, -0.63, 0.24], scale: [1.8, 0.6, 2.2] };
  const result = captureStudioBg3dPrimitiveEditSource({ open: true, selectedIdsRef: { current: new Set([primitive.id]) },
    modalAssetSessionRef: { current: {} }, isPrimitiveEditInteractionLocked: () => false,
    physicsRuntimeSourceRef: { current: { primitives: [primitive], customModels: [], document: createDefaultStudioBg3dSceneDocument() } },
    attachmentByStorageModelIdRef: { current: new Map() } });
  if (!result.ok) throw new Error(result.messageKo);
  const prepared = createStudioBg3dPrimitiveEditWorkspace(result.snapshot);
  if (!prepared.ok) throw new Error(prepared.messageKo);
  return prepared.value;
}

function edited(context: ReturnType<typeof source>) {
  const ws = context.workspace;
  const selectionSource = workspaceComponentSelectionSource(ws);
  if (!selectionSource) throw new Error("면 선택 원본이 필요합니다.");
  const selection = mutateStudioHybridDccComponentSelection(context.selection, { mode: "face", operation: "replace", ids: [2], activeId: 2, source: selectionSource });
  if (!selection.ok) throw new Error("면 선택에 실패했습니다.");
  const request = { tool: "push-pull", distance: 0.25 } as const;
  return { preview: previewStudioHybridDccFaceModeling(ws, selection.value, request),
    committed: commitStudioHybridDccFaceModeling(ws, selection.value, request) };
}

describe("실제 기본 상자의 독립 면 편집 작업공간", () => {
  it("대체 큐브 없이 실제 6개 면·원본 TRS·face mapping을 등록한다", () => {
    const context = source();
    expect(context.geometry.mesh.faces).toHaveLength(6);
    expect(context.geometry.faceSources.map((face) => face.sourceTriangleIds)).toEqual([[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11]]);
    expect(context.initialTransform).toEqual({ revision: 1, position: [2.25, 0.75, -3.5], rotationEulerRad: [0.31, -0.63, 0.24], scale: [1.8, 0.6, 2.2] });
    expect(context.selection.mode).toBe("face");
    expect(context.selection.objectIds).toEqual([context.assetId]);
    expect(context.initialUndoDepth).toBe(1);
    expect(context.workspace.session.state.rightsBom[0]?.license).toBe("사용자 제작");
  });

  it("미리보기는 원본을 바꾸지 않고 확정된 메시만 내보내며 Undo/Redo 뒤 같은 bytes를 만든다", () => {
    const context = source();
    const beforeHash = context.workspace.session.state.stateHash;
    const operation = edited(context);
    expect(operation.preview.ok).toBe(true);
    expect(context.workspace.session.state.stateHash).toBe(beforeHash);
    expect(exportStudioBg3dPrimitiveEditWorkspace(context, context.workspace).ok).toBe(false);
    const after = operation.committed.workspace;
    expect(after.session.undoStack).toHaveLength(context.initialUndoDepth + 1);
    const exported = exportStudioBg3dPrimitiveEditWorkspace(context, after);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.messageKo);
    expect(new DataView(exported.bytes.buffer).getUint32(0, true)).toBe(0x46546c67);
    expect(exported.sourceHash).not.toBe(context.initialMeshHash);
    const undone = workspaceUndo(after);
    expect(undone.session.state.stateHash).toBe(beforeHash);
    expect(exportStudioBg3dPrimitiveEditWorkspace(context, undone).ok).toBe(false);
    const redone = workspaceRedo(undone);
    const redoExport = exportStudioBg3dPrimitiveEditWorkspace(context, redone);
    expect(redoExport.ok).toBe(true);
    if (redoExport.ok) expect(redoExport.bytes).toEqual(exported.bytes);
  });

  it("오브젝트 변환이나 선택 권위를 조용히 버리고 면만 내보내지 않는다", () => {
    const context = source(), after = edited(context).committed.workspace;
    const moved = workspaceCommitObjectTransform(after, context.assetId, { ...context.initialTransform, position: [5, 0, 0] });
    expect(exportStudioBg3dPrimitiveEditWorkspace(context, moved).ok).toBe(false);
    expect(exportStudioBg3dPrimitiveEditWorkspace(context, { ...after, activeAssetId: null }).ok).toBe(false);
  });
});
