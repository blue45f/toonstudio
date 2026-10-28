import { describe, expect, it } from "vitest";

import { hybridDccApplyModifierStack } from "../hybrid-dcc/studio-hybrid-dcc-document";
import { workspaceAddActiveModifier } from "../hybrid-dcc/studio-hybrid-dcc-modifier-workspace";
import { workspaceUnwrapUvActive } from "../hybrid-dcc/studio-hybrid-dcc-uv-edit";
import {
  createStudioHybridDccWorkspace,
  workspaceAddUnitCube,
  workspaceBevelEdgesActive,
  workspaceClothStep,
  workspaceExtrudeActive,
  workspaceInsetActive,
  workspaceLoopCutActive,
  workspaceOrientOutwardActive,
  workspaceRepairActive,
  workspaceSculptActive,
  workspaceSubdivideActive,
  workspaceWeldActive,
  type StudioHybridDccWorkspace,
} from "../hybrid-dcc/studio-hybrid-dcc-workspace";
import { serializeStudioCommandJournal } from "../studio-command-journal";
import { hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { applyStudioGeometryAuthorityModifierStack, commitStudioGeometryAuthorityMesh } from "../studio-geometry-authority";
import { evaluateStudioMeshModifierStack, hashStudioMeshModifierStack } from "../studio-mesh-modifier-stack";

function cube() { return workspaceAddUnitCube(createStudioHybridDccWorkspace("uv-loss-guard"), "cube"); }
function record(workspace: StudioHybridDccWorkspace) { return workspace.session.state.geometry.records.cube!; }
function capture(workspace: StudioHybridDccWorkspace) {
  return {
    state: workspace.session.state,
    journal: serializeStudioCommandJournal(workspace.session.journal),
    undo: workspace.session.undoStack,
    redo: workspace.session.redoStack,
    bridge: workspace.bridge,
    mesh: record(workspace).mesh,
    uv: record(workspace).mesh.uvLayer,
  };
}

const unsupported: readonly { readonly name: string; readonly run: (workspace: StudioHybridDccWorkspace) => StudioHybridDccWorkspace }[] = [
  { name: "Inset", run: (workspace) => workspaceInsetActive(workspace, 0.2) },
  { name: "Bevel", run: (workspace) => workspaceBevelEdgesActive(workspace, 0.05) },
  { name: "Loop Cut", run: (workspace) => workspaceLoopCutActive(workspace, 0.5) },
  { name: "Subdivide", run: (workspace) => workspaceSubdivideActive(workspace, 1) },
  { name: "Cloth", run: workspaceClothStep },
  { name: "Repair", run: workspaceRepairActive },
  { name: "Outward", run: workspaceOrientOutwardActive },
];

describe("일반 지오메트리 편집의 UV 유실 거부", () => {
  it("Sculpt는 검증된 원본 fan 코너의 UV를 보존하며 무UV 경로도 계속 지원한다", () => {
    const source = workspaceUnwrapUvActive(cube()); const before = capture(source);
    const result = workspaceSculptActive(source, 0.1);
    expect(record(result).mesh.uvLayer?.corners).toHaveLength(36);
    expect(result.session.state.commandCount).toBe(source.session.state.commandCount + 1);
    expect(capture(source)).toEqual(before);
    const plain = workspaceSculptActive(cube(), 0.1);
    expect(record(plain).mesh.uvLayer).toBeUndefined();
  });
  it.each(unsupported)("$name은 UV를 버리는 편집을 원본·저널·undo 변경 전에 취소하고 무UV 입력은 유지한다", ({ run }) => {
    const source = workspaceUnwrapUvActive(cube());
    const before = capture(source);
    expect(() => run(source)).toThrow(/현재 UV를 보존할 수 없어 취소/u);
    expect(capture(source)).toEqual(before);
    expect(source.session.state).toBe(before.state);
    expect(source.session.undoStack).toBe(before.undo);
    expect(source.session.redoStack).toBe(before.redo);
    expect(record(source).mesh).toBe(before.mesh);
    expect(record(source).mesh.uvLayer).toBe(before.uv);
    const plain = cube();
    const result = run(plain);
    expect(result.session.state.commandCount).toBe(plain.session.state.commandCount + 1);
    expect(record(result).mesh.uvLayer).toBeUndefined();
  });

  it("외부 일반 authority commit도 UV 유실 Result를 반환하며 기존 registry를 바꾸지 않는다", () => {
    const workspace = workspaceUnwrapUvActive(cube());
    const registry = workspace.session.state.geometry;
    const source = record(workspace);
    const { uvLayer: _uv, ...withoutUv } = source.mesh;
    expect(commitStudioGeometryAuthorityMesh(registry, "cube", withoutUv)).toMatchObject({
      ok: false, code: "uv-layer-loss", detail: expect.stringContaining("현재 UV를 보존할 수 없어 취소"),
    });
    expect(registry.records.cube).toBe(source);
    const plain = cube();
    expect(commitStudioGeometryAuthorityMesh(plain.session.state.geometry, "cube", record(plain).mesh).ok).toBe(true);
  });

  it("hash가 맞는 외부 modifier promotion도 UV를 빼면 거부하고 문서 journal을 남기지 않는다", async () => {
    const original = workspaceUnwrapUvActive(cube());
    const workspace = await workspaceAddActiveModifier(original, "array");
    const source = record(workspace);
    const evaluation = await evaluateStudioMeshModifierStack(source.modifierStack);
    if (!evaluation.ok) throw new Error(evaluation.detail);
    const { uvLayer: _uv, ...withoutUv } = evaluation.value.mesh;
    const before = capture(workspace);
    expect(applyStudioGeometryAuthorityModifierStack(workspace.session.state.geometry, "cube", withoutUv)).toMatchObject({
      ok: false, code: "uv-layer-loss", detail: expect.stringContaining("현재 UV를 보존할 수 없어 적용을 취소"),
    });
    expect(() => hybridDccApplyModifierStack(workspace.session, "cube", {
      sourceHash: source.meshHash, stackHash: hashStudioMeshModifierStack(source.modifierStack),
      resultHash: hashStudioEditableMesh(withoutUv), mesh: withoutUv,
    })).toThrow(/현재 UV를 보존할 수 없어 적용을 취소/u);
    expect(capture(workspace)).toEqual(before);
    expect(workspace.session.state).toBe(before.state);
    expect(workspace.session.undoStack).toBe(before.undo);
    const plain = await workspaceAddActiveModifier(cube(), "array");
    const plainEvaluation = await evaluateStudioMeshModifierStack(record(plain).modifierStack);
    if (!plainEvaluation.ok) throw new Error(plainEvaluation.detail);
    expect(applyStudioGeometryAuthorityModifierStack(plain.session.state.geometry, "cube", plainEvaluation.value.mesh).ok).toBe(true);
    const applied = hybridDccApplyModifierStack(plain.session, "cube", {
      ...plainEvaluation.value, stackHash: hashStudioMeshModifierStack(record(plain).modifierStack),
    });
    expect(applied.state.commandCount).toBe(plain.session.state.commandCount + 1);
  });

  it("정확한 UV 대응을 제공하는 영역 밀기와 같은 위상 Weld는 계속 성공한다", () => {
    const source = workspaceUnwrapUvActive(cube());
    const extruded = workspaceExtrudeActive(source, 0.2);
    expect(record(extruded).mesh.uvLayer?.corners).toHaveLength(record(extruded).mesh.halfEdges.length);
    const welded = workspaceWeldActive(source, 0.00001);
    expect(record(welded).mesh.uvLayer).toEqual(record(source).mesh.uvLayer);
  });
});
