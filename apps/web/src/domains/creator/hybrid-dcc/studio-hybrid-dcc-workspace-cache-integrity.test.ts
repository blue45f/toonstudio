import { describe, expect, it } from "vitest";

import {
  restoreStudioHybridDccStateFromSnapshot,
  snapshotStudioHybridDccState,
} from "./studio-hybrid-dcc-document";
import {
  workspaceAddActiveModifier,
  workspaceRedoWithModifierPreviews,
  workspaceRefreshModifierPreviews,
  workspaceUndoWithModifierPreviews,
} from "./studio-hybrid-dcc-modifier-workspace";
import {
  createStudioHybridDccWorkspace,
  workspaceAddUnitCube,
  workspaceCommitActiveObjectTransform,
  workspaceExportActiveMesh,
} from "./studio-hybrid-dcc-workspace";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "./studio-hybrid-dcc-workfile";
import { createStudioHybridDccDefaultToonMaterial } from "./materials/studio-hybrid-dcc-toon-material";
import { workspaceSetStudioHybridDccToonMaterial } from "./materials/studio-hybrid-dcc-toon-workspace";

describe("Hybrid DCC modifier cache workspace integrity", () => {
  it("preserves the validated presentation hash across common bridge sync and deterministic restore", async () => {
    let workspace = workspaceAddUnitCube(
      createStudioHybridDccWorkspace("cache-sync"),
      "hero",
    );
    workspace = await workspaceAddActiveModifier(workspace, "array");
    const previewRecord = workspace.session.state.geometry.records.hero!;
    const previewHash = previewRecord.renderCache!.derivedFromHash;
    const authorityRevision = previewRecord.revision;
    const stateHash = workspace.session.state.stateHash;

    workspace = workspaceCommitActiveObjectTransform(workspace, {
      revision: 1,
      position: [3, 1, -2],
      rotationEulerRad: [0, 0.5, 0],
      scale: [1, 1, 1],
    });
    expect(workspace.session.state.geometry.records.hero!.revision).toBe(authorityRevision);
    expect(workspace.bridge.set.objects.find(({ id }) => id === "hero")?.geometryHash)
      .toBe(previewHash);

    const undone = await workspaceUndoWithModifierPreviews(workspace);
    expect(undone.session.state.stateHash).toBe(stateHash);
    expect(undone.session.state.geometry.records.hero!.revision).toBe(authorityRevision);
    expect(undone.session.state.geometry.records.hero!.renderCache?.derivedFromHash).toBe(previewHash);
    expect(undone.bridge.set.objects.find(({ id }) => id === "hero")?.geometryHash)
      .toBe(previewHash);

    const redone = await workspaceRedoWithModifierPreviews(undone);
    expect(redone.session.state.geometry.records.hero!.revision).toBe(authorityRevision);
    expect(redone.session.state.geometry.records.hero!.renderCache?.derivedFromHash).toBe(previewHash);
    expect(redone.bridge.set.objects.find(({ id }) => id === "hero")?.geometryHash)
      .toBe(previewHash);

    const snapshot = snapshotStudioHybridDccState(redone.session.state);
    const restoredState = restoreStudioHybridDccStateFromSnapshot(snapshot);
    expect(restoredState.geometry.records.hero!.renderCache).toBeNull();
    const cold = await workspaceRefreshModifierPreviews({
      ...redone,
      session: { ...redone.session, state: restoredState },
    });
    expect(cold.session.state.stateHash).toBe(restoredState.stateHash);
    expect(cold.session.state.geometry.records.hero!.revision).toBe(authorityRevision);
    expect(cold.session.state.geometry.records.hero!.renderCache?.derivedFromHash).toBe(previewHash);
    expect(cold.bridge.set.objects.find(({ id }) => id === "hero")?.geometryHash)
      .toBe(previewHash);
  });

  it("blocks synchronous mesh export instead of silently exporting the source cage", async () => {
    let workspace = workspaceAddUnitCube(
      createStudioHybridDccWorkspace("cache-export-gate"),
      "array-prop",
    );
    workspace = await workspaceAddActiveModifier(workspace, "array");

    expect(() => workspaceExportActiveMesh(workspace, "obj"))
      .toThrow(/비파괴 변형.*원본 케이지/u);
    expect(workspace.lastExport).toBeNull();
  });

  it("표시 메타데이터는 문서·권리·재질 정본을 바꾸지 않고 작업파일에서 폐기한 뒤 동일하게 재생성한다", async () => {
    const original = workspaceSetStudioHybridDccToonMaterial(
      workspaceAddUnitCube(createStudioHybridDccWorkspace("surface-cache-file"), "cube"),
      "cube", [0], createStudioHybridDccDefaultToonMaterial(),
    );
    const workspace = await workspaceAddActiveModifier(original, "array");
    const record = workspace.session.state.geometry.records.cube;
    const surface = record?.renderCache?.surface;
    if (!record || !surface) throw new Error("평가 표시 속성이 없습니다.");
    const refreshed = await workspaceRefreshModifierPreviews(workspace);
    expect(refreshed.session.state.stateHash).toBe(workspace.session.state.stateHash);
    expect(refreshed.session.state.materials).toEqual(original.session.state.materials);
    expect(refreshed.session.state.rightsBom).toEqual(workspace.session.state.rightsBom);
    expect(record.mesh).toBe(original.session.state.geometry.records.cube?.mesh);
    const bytes = encodeStudioHybridDccWorkfile(refreshed);
    const text = new TextDecoder().decode(bytes);
    expect(text).not.toContain("cornerNormals"); expect(text).not.toContain("triangleMaterialSlots");
    const reopened = decodeStudioHybridDccWorkfile(bytes, { documentId: "surface-cache-reopened" });
    expect(reopened.session.state.geometry.records.cube?.renderCache).toBeNull();
    expect(reopened.session.state.materials).toEqual(workspace.session.state.materials);
    expect(reopened.session.state.geometry.records.cube?.meshHash).toBe(record.meshHash);
    const restored = await workspaceRefreshModifierPreviews(reopened);
    expect(restored.session.state.geometry.records.cube?.renderCache?.surface).toEqual(surface);
    const undone = await workspaceUndoWithModifierPreviews(restored);
    expect(undone.session.state.geometry.records.cube?.modifierStack.modifiers).toHaveLength(0);
    expect(undone.session.state.materials).toEqual(original.session.state.materials);
    const redone = await workspaceRedoWithModifierPreviews(undone);
    expect(redone.session.state.geometry.records.cube?.renderCache?.surface).toEqual(surface);
  });
});
