import { describe, expect, it } from "vitest";

import { deriveStudioMeshUvIslands } from "../mesh-uv/studio-mesh-uv-authority";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";
import { serializeStudioCommandJournal } from "../studio-command-journal";
import { createStudioEditableMeshFromPolygons, hashStudioEditableMesh, loopCutStudioEditableMesh, studioEditableMeshStats } from "../studio-editable-half-edge-mesh";

import { hybridDccCommitGeometry } from "./studio-hybrid-dcc-document";
import { StudioHybridDccLoopCutError } from "./studio-hybrid-dcc-loop-cut-workspace";
import { workspaceUnwrapUvActive } from "./studio-hybrid-dcc-uv-edit";
import {
  createStudioHybridDccWorkspace,
  synchronizeWorkspaceGeometryAuthority,
  workspaceAddUnitCube,
  workspaceLoopCutActive,
  workspaceRedo,
  workspaceUndo,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "./studio-hybrid-dcc-workfile";

function record(workspace: StudioHybridDccWorkspace) {
  const value = workspace.session.state.geometry.records.cube;
  if (!value) throw new Error("시험용 정육면체가 없습니다.");
  return value;
}

function sourceWorkspace() {
  const cube = workspaceAddUnitCube(createStudioHybridDccWorkspace("loop-cut-uv-history"), "cube");
  const mesh = record(cube).mesh;
  const attributed = {
    ...mesh,
    vertices: mesh.vertices.map((vertex) => ({ ...vertex, crease: (vertex.id + 1) / 16 })),
    halfEdges: mesh.halfEdges.map((edge) => ({ ...edge, crease: 0.375 })),
    faces: mesh.faces.map((face) => ({ ...face, materialSlot: face.id, smooth: face.id % 2 === 0 })),
  };
  const session = hybridDccCommitGeometry(cube.session, "cube", attributed);
  return workspaceUnwrapUvActive(synchronizeWorkspaceGeometryAuthority(cube, session));
}

describe("루프 절단의 작업대·이력·작업파일 연결", () => {
  it("UV가 있는 정육면체를 실제 면으로 나누고 한 번의 되돌리기·다시 실행으로 속성까지 복원한다", () => {
    const source = sourceWorkspace();
    const before = record(source);
    const sourceState = JSON.stringify(source.session.state);
    const sourceJournal = serializeStudioCommandJournal(source.session.journal);
    const sourceBytes = encodeStudioHybridDccWorkfile(source);
    const cut = workspaceLoopCutActive(source, 0.2);
    const after = record(cut);

    expect(studioEditableMeshStats(after.mesh)).toEqual({
      vertexCount: 12, halfEdgeCount: 40, edgeCount: 20, faceCount: 10, boundaryEdgeCount: 0,
    });
    expect(after.mesh.uvLayer?.corners).toHaveLength(40);
    expect(deriveStudioMeshUvIslands(after.mesh)).toHaveLength(6);
    expect(after.revision).toBe(before.revision + 1);
    expect(cut.session.state.commandCount).toBe(source.session.state.commandCount + 1);
    expect(cut.session.undoStack).toHaveLength(source.session.undoStack.length + 1);
    expect(cut.bridge.set.objects.find(({ id }) => id === "cube")?.geometryHash).toBe(after.meshHash);
    expect(hashStudioEditableMesh(after.modifierStack.source)).toBe(after.meshHash);
    for (const face of before.mesh.faces) {
      expect(after.mesh.faces.find(({ id }) => id === face.id)).toMatchObject({
        materialSlot: face.materialSlot, smooth: face.smooth,
      });
    }

    const undone = workspaceUndo(cut);
    expect(record(undone).mesh).toEqual(before.mesh);
    expect(record(undone).meshHash).toBe(before.meshHash);
    const redone = workspaceRedo(undone);
    expect(record(redone).mesh).toEqual(after.mesh);
    expect(record(redone).meshHash).toBe(after.meshHash);
    expect(JSON.stringify(source.session.state)).toBe(sourceState);
    expect(serializeStudioCommandJournal(source.session.journal)).toBe(sourceJournal);
    expect(encodeStudioHybridDccWorkfile(source)).toEqual(sourceBytes);
  });

  it("절단 후 저장과 되돌린 뒤 저장 모두 새 문서에서 UV·재질·다음 이력을 유지한다", () => {
    const source = sourceWorkspace();
    const cut = workspaceLoopCutActive(source, 0.8);
    const reopened = decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(cut), {
      documentId: "reopened-loop-cut",
    });
    expect(record(reopened).mesh).toEqual(record(cut).mesh);
    expect(record(workspaceUndo(reopened)).mesh).toEqual(record(source).mesh);
    expect(record(workspaceRedo(workspaceUndo(reopened))).mesh).toEqual(record(cut).mesh);

    const undone = workspaceUndo(cut);
    const reopenedUndo = decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(undone), {
      documentId: "reopened-before-loop-cut",
    });
    expect(record(reopenedUndo).mesh).toEqual(record(source).mesh);
    expect(record(workspaceRedo(reopenedUndo)).mesh).toEqual(record(cut).mesh);
  });

  it.each([0, 1, Number.NaN, Number.POSITIVE_INFINITY])("유효하지 않은 절단 비율 %s는 원본과 이력을 바꾸지 않는다", (factor) => {
    const source = sourceWorkspace();
    const state = source.session.state;
    const before = encodeStudioHybridDccWorkfile(source);
    const journal = serializeStudioCommandJournal(source.session.journal);
    expect(() => workspaceLoopCutActive(source, factor)).toThrow();
    expect(source.session.state).toBe(state);
    expect(encodeStudioHybridDccWorkfile(source)).toEqual(before);
    expect(serializeStudioCommandJournal(source.session.journal)).toBe(journal);
  });

  it("표시 가능한 종단면을 129코너로 늘리는 절단은 UV·작업파일·이력을 확정 전에 보존한다", () => {
    const count = 128;
    const positions = Array.from({ length: count }, (_, index) => ({
      x: Math.cos((Math.PI * 2 * index) / count),
      y: Math.sin((Math.PI * 2 * index) / count),
      z: 0,
    }));
    const a = positions[0];
    const b = positions[1];
    if (!a || !b) throw new Error("시험용 다각형의 공유 변이 없습니다.");
    const dx = b.y - a.y;
    const dy = a.x - b.x;
    positions.push({ x: a.x + dx, y: a.y + dy, z: 0 }, { x: b.x + dx, y: b.y + dy, z: 0 });
    const mesh = createStudioEditableMeshFromPolygons(positions, [
      Array.from({ length: count }, (_, index) => index), [1, 0, count, count + 1],
    ]);
    const cube = workspaceAddUnitCube(createStudioHybridDccWorkspace("loop-cut-display-budget"), "cube");
    const source = workspaceUnwrapUvActive(synchronizeWorkspaceGeometryAuthority(
      cube, hybridDccCommitGeometry(cube.session, "cube", mesh),
    ));
    const before = encodeStudioHybridDccWorkfile(source);
    const journal = serializeStudioCommandJournal(source.session.journal);
    const state = source.session.state;
    const undo = source.session.undoStack;
    const redo = source.session.redoStack;

    const kernel = loopCutStudioEditableMesh(record(source).mesh, count, 0.5);
    if (kernel.ok) throw new Error("코너 예산을 넘는 원본 절단이 성공했습니다.");
    expect(kernel.code).toBe("budget-exceeded");
    let failure: unknown;
    try {
      workspaceLoopCutActive(source, 0.5, count);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(StudioHybridDccLoopCutError);
    if (!(failure instanceof StudioHybridDccLoopCutError)) throw new Error("실제 작업대가 typed 절단 오류를 반환하지 않았습니다.");
    expect(failure.code).toBe("budget-exceeded");
    expect(failure.detail).toBe(kernel.detail);
    expect(failure.message).toBe(kernel.detail);
    expect(failure.message).toMatch(/코너|예산/u);
    expect(source.session.state).toBe(state);
    expect(source.session.undoStack).toBe(undo);
    expect(source.session.redoStack).toBe(redo);
    expect(serializeStudioCommandJournal(source.session.journal)).toBe(journal);
    expect(encodeStudioHybridDccWorkfile(source)).toEqual(before);
  });

  it("Float64에서 유효해도 Float32 화면에서 접히는 절단은 확정 전에 원본을 유지한다", () => {
    const source = workspaceUnwrapUvActive(workspaceAddUnitCube(
      createStudioHybridDccWorkspace("loop-cut-float32-display"), "cube",
    ));
    const mesh = record(source).mesh;
    const factor = 1 - 1.5e-10;
    expect(inspectStudioMeshSurfaceForInteractiveProjection(mesh).ok).toBe(true);
    const geometric = loopCutStudioEditableMesh(mesh, 0, factor);
    if (!geometric.ok) throw new Error(geometric.detail);
    expect(inspectStudioMeshSurfaceForInteractiveProjection(geometric.value).ok).toBe(false);
    const before = encodeStudioHybridDccWorkfile(source);
    const journal = serializeStudioCommandJournal(source.session.journal);
    const state = source.session.state;
    const undo = source.session.undoStack;
    const redo = source.session.redoStack;

    expect(() => workspaceLoopCutActive(source, factor, 0)).toThrow(/표시|표면/u);
    expect(source.session.state).toBe(state);
    expect(source.session.undoStack).toBe(undo);
    expect(source.session.redoStack).toBe(redo);
    expect(serializeStudioCommandJournal(source.session.journal)).toBe(journal);
    expect(encodeStudioHybridDccWorkfile(source)).toEqual(before);
  });
});
