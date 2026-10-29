import { describe, expect, it } from "vitest";

import { STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET } from "../mesh-surface/studio-mesh-surface-interactive-budget";
import { planStudioMeshSurface } from "../mesh-surface/studio-mesh-surface-plan";
import { createStudioEditableMeshFromPolygons, createStudioUnitCubeMesh, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";

import { deriveStudioHybridDccViewportSnapshot } from "./StudioHybridDccViewportCore";
import { validateStudioHybridDccComponentRenderAdmission } from "./studio-hybrid-dcc-component-render-admission";
import { createStudioHybridDccComponentSelection, mutateStudioHybridDccComponentSelection, validateStudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import { workspaceTransformComponents } from "./studio-hybrid-dcc-component-transform";
import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import { workspaceUnwrapUvActive } from "./studio-hybrid-dcc-uv-edit";
import { createStudioHybridDccWorkspace, workspaceComponentSelectionSource, workspaceRedo, workspaceUndo, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

function workspace(mesh: StudioEditableMesh) {
  const empty = createStudioHybridDccWorkspace("shared-admission");
  return { ...empty, activeAssetId: "mesh", session: hybridDccRegisterAsset(empty.session, "mesh", mesh, {
    source: "primitive", creator: "studio", license: "CC0-1.0", useScope: "commercial", derivative: "original",
  }) };
}
function sourceMesh(value: StudioHybridDccWorkspace) {
  const record = value.session.state.geometry.records.mesh;
  if (!record) throw new Error("회귀 검증용 원본 메시가 없습니다."); return record.mesh;
}
function vertexSelection(value: StudioHybridDccWorkspace, id: number) {
  const source = workspaceComponentSelectionSource(value); if (!source) throw new Error("원본 선택 범위가 없습니다.");
  const result = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "vertex", operation: "replace", ids: [id], activeId: id, source,
  });
  if (!result.ok) throw new Error("회귀 검증용 선택을 만들지 못했습니다."); return result.value;
}
function move(mesh: StudioEditableMesh, id: number, x: number, y: number, z = 0): StudioEditableMesh {
  return { ...mesh, vertices: mesh.vertices.map((vertex) => vertex.id === id ? { ...vertex, position: { x, y, z } } : vertex) };
}
function square() {
  const base = createStudioEditableMeshFromPolygons([
    { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
  ], [[0, 1, 2, 3]]);
  return { ...base, faces: base.faces.map((face) => ({ ...face, smooth: false })) };
}

describe("컴포넌트 편집의 공유 surface 적용 경계", () => {
  it("새로 지원한 오목 면을 preview·실제 snapshot·단일 undo/redo에서 보존하며 원본 선택·UV를 바꾸지 않는다", () => {
    const before = workspaceUnwrapUvActive(workspace(createStudioUnitCubeMesh()));
    const original = sourceMesh(before), selection = vertexSelection(before, 0);
    const hash = before.session.stateHash, journal = before.session.journal.records;
    const preview = workspaceTransformComponents(before, selection, { kind: "translate", value: { x: .75, y: .75, z: 0 } });
    const next = sourceMesh(preview.workspace);
    expect(next.vertices[0]?.position).toEqual({ x: .25, y: .25, z: -.5 });
    expect(next.halfEdges).toBe(original.halfEdges); expect(next.faces).toBe(original.faces); expect(next.uvLayer).toBe(original.uvLayer);
    expect(before.session.stateHash).toBe(hash); expect(before.session.journal.records).toEqual(journal);
    const snapshot = deriveStudioHybridDccViewportSnapshot(preview.workspace, "vertex");
    expect(snapshot.errors).toEqual([]); expect(snapshot.assets).toHaveLength(1); expect(snapshot.totalTriangles).toBe(12);
    expect(snapshot.assets[0]?.cornerUvs).toHaveLength(72);
    const source = workspaceComponentSelectionSource(preview.workspace); if (!source) throw new Error("적용한 원본 선택이 없습니다.");
    expect(validateStudioHybridDccComponentSelection(selection, source).ok).toBe(false);
    expect(validateStudioHybridDccComponentSelection(preview.selection, source).ok).toBe(true);
    expect(preview.selection.elementIds).toEqual(selection.elementIds);
    const applied = workspaceTransformComponents(before, selection, { kind: "translate", value: { x: .75, y: .75, z: 0 } }).workspace;
    expect(applied.session.undoStack).toHaveLength(before.session.undoStack.length + 1);
    expect(applied.session.journal.records).toHaveLength(journal.length + 1);
    expect(sourceMesh(workspaceUndo(applied))).toEqual(original);
    expect(sourceMesh(workspaceRedo(workspaceUndo(applied)))).toEqual(next);
  });

  it("source는 예산에 맞아도 결과의 실제 ear 작업량이 상한을 넘으면 적용 전에 거부한다", () => {
    const source = square(), result = move(source, 0, .75, .75);
    const budget = { ...STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET, maxEarTests: 2 };
    expect(planStudioMeshSurface(source, budget).ok).toBe(true);
    const next = planStudioMeshSurface(result, budget);
    expect(next.ok).toBe(false); if (next.ok) throw new Error("결과는 ear 예산을 넘어야 합니다.");
    expect(next.issue.code).toBe("surface-budget-exceeded");
    expect(() => validateStudioHybridDccComponentRenderAdmission(source, result, budget)).toThrow(/변형 후 화면에 표시될 수 없습니다/u);
    expect(source.vertices[0]?.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("이미 face-corner 예산을 넘은 면은 무관한 정상 면의 작은 편집을 막지 않는다", () => {
    const points = Array.from({ length: 129 }, (_, index) => ({ x: Math.cos(index * Math.PI * 2 / 129), y: Math.sin(index * Math.PI * 2 / 129), z: 0 }));
    const source = createStudioEditableMeshFromPolygons([...points, { x: 3, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 3, y: 1, z: 0 }],
      [points.map((_, index) => index), [129, 130, 131]]);
    expect(planStudioMeshSurface(source, STUDIO_MESH_SURFACE_INTERACTIVE_BUDGET).ok).toBe(false);
    expect(() => validateStudioHybridDccComponentRenderAdmission(source, move(source, 130, 4.1, 0))).not.toThrow();
  });

  it("기존 비평면 n-gon이 다른 정상 면의 새 자기 교차를 가리지 않는다", () => {
    const source = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1.5, y: 1, z: .5 }, { x: .5, y: 2, z: 0 }, { x: -.5, y: 1, z: 0 },
      { x: 3, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 1, z: 0 }, { x: 3, y: 1, z: 0 },
    ], [[0, 1, 2, 3, 4], [5, 6, 7, 8]]);
    expect(planStudioMeshSurface(source).ok).toBe(false);
    expect(() => validateStudioHybridDccComponentRenderAdmission(source, move(source, 5, 2.9, 0))).not.toThrow();
    expect(() => validateStudioHybridDccComponentRenderAdmission(source, move(source, 5, 4.25, .5))).toThrow(/면 1가 변형 후 화면에 표시될 수 없습니다/u);
  });

  it("flat crease는 선택·좌표 편집에서 유지하고 엄격 GLB 정책과 cache를 섞지 않는다", () => {
    const base = square(), mesh = { ...base, halfEdges: base.halfEdges.map((edge) => ({ ...edge, crease: edge.id === 0 ? .75 : 0 })) };
    expect(planStudioMeshSurface(mesh).ok).toBe(false);
    const before = workspace(mesh), result = workspaceTransformComponents(before, vertexSelection(before, 0), { kind: "translate", value: { x: -.1, y: 0, z: 0 } });
    expect(sourceMesh(result.workspace).halfEdges).toBe(mesh.halfEdges);
    expect(deriveStudioHybridDccViewportSnapshot(result.workspace, "vertex").errors).toEqual([]);
    expect(planStudioMeshSurface(mesh).ok).toBe(false);
  });

  it("double에서는 유효해도 새 Float32 표시 접힘을 만드는 preview·적용은 원본·저널·undo 전에 거부한다", () => {
    const source = createStudioEditableMeshFromPolygons([
      { x: 999999, y: 0, z: 0 }, { x: 1000000, y: 0, z: 0 }, { x: 999999, y: 1, z: 0 },
    ], [[0, 1, 2]]);
    const before = workspace(source), selection = vertexSelection(before, 1);
    const hash = before.session.stateHash, journal = before.session.journal.records, undo = before.session.undoStack;
    expect(planStudioMeshSurface(source).ok).toBe(true);
    expect(() => workspaceTransformComponents(before, selection, { kind: "translate", value: { x: -.99999999, y: 0, z: 0 } }))
      .toThrow(/변형 후 화면에 표시될 수 없습니다/u);
    expect(before.session.stateHash).toBe(hash); expect(before.session.journal.records).toEqual(journal); expect(before.session.undoStack).toBe(undo);
    expect(sourceMesh(before)).toBe(source); expect(selection.elementIds).toEqual([1]);
  });

  it("다른 legacy 면의 실패가 새 Float32 접힘을 가리지 않고 이미 접힌 원본 예외는 유지한다", () => {
    const source = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1.5, y: 1, z: .5 }, { x: .5, y: 2, z: 0 }, { x: -.5, y: 1, z: 0 },
      { x: 999999, y: 0, z: 0 }, { x: 1000000, y: 0, z: 0 }, { x: 999999, y: 1, z: 0 },
    ], [[0, 1, 2, 3, 4], [5, 6, 7]]);
    const collapsed = move(source, 6, 999999.00000001, 0);
    expect(() => validateStudioHybridDccComponentRenderAdmission(source, collapsed)).toThrow(/면 1가 변형 후 화면에 표시될 수 없습니다/u);
    expect(() => validateStudioHybridDccComponentRenderAdmission(collapsed, move(collapsed, 6, 999999.00000002, 0))).not.toThrow();
  });
});
