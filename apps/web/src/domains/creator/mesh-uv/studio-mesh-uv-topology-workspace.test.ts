import { describe, expect, it } from "vitest";

import { createStudioEditableMeshFromPolygons, createStudioUnitCubeMesh, hashStudioEditableMesh, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { createStudioHybridDccComponentSelection, mutateStudioHybridDccComponentSelection } from "../hybrid-dcc/studio-hybrid-dcc-component-selection";
import { hybridDccCommitGeometry } from "../hybrid-dcc/studio-hybrid-dcc-document";
import { commitStudioHybridDccFaceModeling, studioHybridDccFaceModelingRange } from "../hybrid-dcc/studio-hybrid-dcc-face-modeling-workspace";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "../hybrid-dcc/studio-hybrid-dcc-workfile";
import {
  createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority, workspaceAddUnitCube,
  workspaceComponentSelectionSource, workspaceDiagnostics, workspaceExtrudeActive, workspaceExtrudeRegionActive,
  workspaceRedo, workspaceUndo, workspaceUvUnwrapActive, workspaceWeldActive, type StudioHybridDccWorkspace,
} from "../hybrid-dcc/studio-hybrid-dcc-workspace";

import { hashStudioMeshUvLayer } from "./studio-mesh-uv-authority";

function cube() { return workspaceUvUnwrapActive(workspaceAddUnitCube(createStudioHybridDccWorkspace("uv-topology-workspace"), "cube")); }
function mesh(workspace: StudioHybridDccWorkspace): StudioEditableMesh {
  const record = workspace.session.state.geometry.records.cube; if (!record) throw new Error("큐브가 없습니다."); return record.mesh;
}
function uvHash(workspace: StudioHybridDccWorkspace): string {
  const layer = mesh(workspace).uvLayer; if (!layer) throw new Error("정본 UV가 없습니다."); return hashStudioMeshUvLayer(layer);
}
function select(workspace: StudioHybridDccWorkspace, ids: readonly number[]) {
  const source = workspaceComponentSelectionSource(workspace); if (!source) throw new Error("선택 원본이 없습니다.");
  const result = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), { mode: "face", operation: "replace", ids, source });
  if (!result.ok) throw new Error("면 선택에 실패했습니다."); return result.value;
}

describe("UV를 가진 기존 모델링 명령의 문서·이력 연결", () => {
  it("영역 밀기는 UV 포함 result hash로 선택·bridge·journal을 결합하고 undo/redo·파일 복원도 유지한다", () => {
    const source = cube(); const beforeHash = hashStudioEditableMesh(mesh(source)); const beforeUv = uvHash(source);
    const result = workspaceExtrudeRegionActive(source, select(source, [0, 2]), 0.25);
    const next = result.workspace; const afterHash = hashStudioEditableMesh(mesh(next)); const afterUv = uvHash(next);
    expect(mesh(next).uvLayer?.corners).toHaveLength(mesh(next).halfEdges.length);
    expect(result.receipt.sourceMeshHash).toBe(beforeHash); expect(result.receipt.resultMeshHash).toBe(afterHash);
    expect(result.selection.provenance?.sourceHash).toBe(afterHash);
    expect(next.bridge.set.objects.find(({ id }) => id === "cube")?.geometryHash).toBe(afterHash);
    expect(next.session.undoStack).toHaveLength(source.session.undoStack.length + 1);
    expect(workspaceDiagnostics(next)).toMatchObject({ findings: [], errorCount: 0, warningCount: 0 });
    expect(JSON.stringify(next.session.journal.records)).toContain(afterHash);
    const undone = workspaceUndo(next); expect(uvHash(undone)).toBe(beforeUv); expect(hashStudioEditableMesh(mesh(undone))).toBe(beforeHash);
    const redone = workspaceRedo(undone); expect(uvHash(redone)).toBe(afterUv); expect(hashStudioEditableMesh(mesh(redone))).toBe(afterHash);
    const opened = decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(next), { documentId: "uv-topology-reopened" });
    expect(uvHash(opened)).toBe(afterUv); expect(uvHash(workspaceUndo(opened))).toBe(beforeUv);
    expect(uvHash(source)).toBe(beforeUv);
  });

  it("Weld의 무병합 경로는 UV를 보존하고 한 번의 undo/redo가 정확히 되돌린다", () => {
    const before = cube(); const beforeUv = uvHash(before); const next = workspaceWeldActive(before, 1e-5);
    expect(uvHash(next)).toBe(beforeUv); expect(mesh(next).uvLayer).toEqual(mesh(before).uvLayer);
    expect(uvHash(workspaceUndo(next))).toBe(beforeUv);
    expect(hashStudioEditableMesh(mesh(workspaceRedo(workspaceUndo(next))))).toBe(hashStudioEditableMesh(mesh(next)));
  });

  it("legacy extrude도 동일 발급 경로로 기존 UV를 보존한다", () => {
    const before = cube(); const expected = workspaceExtrudeRegionActive(before, select(before, [0]), 0.2).workspace;
    const legacy = workspaceExtrudeActive(before, 0.2, [0]);
    expect(mesh(legacy).uvLayer).toEqual(mesh(expected).uvLayer);
    expect(uvHash(workspaceUndo(legacy))).toBe(uvHash(before));
  });

  it("기울어진 기둥의 face push/pull extrude 분기도 UV를 유지한다", () => {
    const initial = workspaceAddUnitCube(createStudioHybridDccWorkspace("uv-oblique"), "cube"); const plain = createStudioUnitCubeMesh(); const top = new Set([2, 3, 6, 7]);
    const oblique = createStudioEditableMeshFromPolygons(plain.vertices.map((vertex) => top.has(vertex.id) ? { ...vertex.position, x: vertex.position.x + 0.3 } : vertex.position), [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]]);
    const before = workspaceUvUnwrapActive(synchronizeWorkspaceGeometryAuthority(initial, hybridDccCommitGeometry(initial.session, "cube", oblique)));
    const selected = select(before, [3]);
    expect(studioHybridDccFaceModelingRange(before, selected, "push-pull")).toMatchObject({ ok: true, value: { method: "extrude" } });
    const result = commitStudioHybridDccFaceModeling(before, selected, { tool: "push-pull", distance: 0.2 });
    expect(mesh(result.workspace).uvLayer?.corners).toHaveLength(mesh(result.workspace).halfEdges.length);
    expect(uvHash(workspaceUndo(result.workspace))).toBe(uvHash(before));
    expect(result.selection?.provenance?.sourceHash).toBe(hashStudioEditableMesh(mesh(result.workspace)));
    expect(workspaceDiagnostics(result.workspace).errorCount).toBe(0);
  });
});
