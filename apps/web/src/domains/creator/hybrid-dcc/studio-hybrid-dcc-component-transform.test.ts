import { describe, expect, it } from "vitest";

import { createStudioEditableMeshFromPolygons, STUDIO_EDITABLE_MESH_LIMITS, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";

import {
  createStudioHybridDccComponentSelection,
  mutateStudioHybridDccComponentSelection,
  validateStudioHybridDccComponentSelection,
  type StudioHybridDccComponentMode,
  type StudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import { workspaceTransformComponents } from "./studio-hybrid-dcc-component-transform";
import { hybridDccRegisterAsset, snapshotStudioHybridDccState, restoreStudioHybridDccStateFromSnapshot } from "./studio-hybrid-dcc-document";
import { workspaceAddActiveModifier } from "./studio-hybrid-dcc-modifier-workspace";
import {
  createStudioHybridDccWorkspace,
  synchronizeWorkspaceGeometryAuthority,
  workspaceAddUnitCube,
  workspaceCommitActiveObjectTransform,
  workspaceComponentSelectionSource,
  workspaceRedo,
  workspaceUndo,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";

function cube(): StudioHybridDccWorkspace {
  return workspaceAddUnitCube(createStudioHybridDccWorkspace("component-transform"), "cube");
}

function select(
  workspace: StudioHybridDccWorkspace,
  mode: StudioHybridDccComponentMode,
  ids: readonly number[],
): StudioHybridDccComponentSelection {
  const source = workspaceComponentSelectionSource(workspace);
  if (!source) throw new Error("선택할 원본 메시가 없습니다.");
  const result = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode, operation: "replace", ids, activeId: ids.at(-1) ?? null, source,
  });
  if (!result.ok) throw new Error("테스트 선택을 만들지 못했습니다.");
  return result.value;
}

function mesh(workspace: StudioHybridDccWorkspace): StudioEditableMesh {
  return workspace.session.state.geometry.records.cube!.mesh;
}

function faceVertices(source: StudioEditableMesh, faceId: number): readonly number[] {
  const first = source.faces[faceId]!.he;
  const ids: number[] = [];
  let current = first;
  do {
    const edge = source.halfEdges[current]!;
    ids.push(edge.vertex);
    current = edge.next;
  } while (current !== first);
  return ids;
}

describe("선택 컴포넌트의 native 변환", () => {
  it("표시 가능했던 면을 자기 교차하게 만드는 이동은 원본·저널·선택을 바꾸기 전에 거부한다", () => {
    const before = cube();
    const selection = select(before, "vertex", [0]);
    const state = JSON.stringify(before.session.state);
    const journal = JSON.stringify(before.session.journal.records);
    const savedSelection = JSON.stringify(selection);
    const undo = before.session.undoStack;
    expect(() => workspaceTransformComponents(before, selection, {
      kind: "translate", value: { x: 1.25, y: 0.5, z: 0 },
    })).toThrow(/면 0가 변형 후 화면에 표시될 수 없습니다/u);
    expect(JSON.stringify(before.session.state)).toBe(state);
    expect(JSON.stringify(before.session.journal.records)).toBe(journal);
    expect(before.session.undoStack).toBe(undo);
    expect(JSON.stringify(selection)).toBe(savedSelection);
  });

  it("오목 n-gon이 있는 자산의 무관한 정점 이동을 거부하지 않는다", () => {
    const source = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 1, y: 0, z: 1 },
      { x: 2, y: 0, z: 2 }, { x: 0, y: 0, z: 2 },
      { x: 10, y: 0, z: 0 }, { x: 11, y: 0, z: 0 }, { x: 11, y: 1, z: 0 }, { x: 10, y: 1, z: 0 },
    ], [[0, 1, 2, 3, 4], [5, 6, 7, 8]]);
    const empty = createStudioHybridDccWorkspace("legacy-ngon-transform");
    const before = { ...empty, activeAssetId: "mixed", session: hybridDccRegisterAsset(empty.session, "mixed", source, {
      source: "primitive", creator: "studio", license: "CC0-1.0", useScope: "commercial", derivative: "original",
    }) };
    for (const id of [0, 5]) {
      const result = workspaceTransformComponents(before, select(before, "vertex", [id]), {
        kind: "translate", value: { x: -0.1, y: 0, z: 0 },
      });
      const mesh = result.workspace.session.state.geometry.records.mixed?.mesh;
      expect(mesh?.vertices[id]?.position.x).toBeCloseTo(source.vertices[id]!.position.x - 0.1);
      expect(mesh?.faces).toBe(source.faces);
      expect(mesh?.halfEdges).toBe(source.halfEdges);
    }
  });

  it("선택 정점만 로컬 거리만큼 이동하고 오브젝트 배치를 유지한다", () => {
    const before = workspaceCommitActiveObjectTransform(cube(), {
      revision: 1, position: [10, -3, 7], rotationEulerRad: [0.2, 0.4, 0.1], scale: [2, 3, 4],
    });
    const original = mesh(before);
    const selection = select(before, "vertex", [0]);
    const result = workspaceTransformComponents(before, selection, {
      kind: "translate", value: { x: -0.1, y: -0.2, z: -0.3 },
    });
    expect(mesh(result.workspace).vertices[0]!.position).toEqual({
      x: original.vertices[0]!.position.x - 0.1,
      y: original.vertices[0]!.position.y - 0.2,
      z: original.vertices[0]!.position.z - 0.3,
    });
    for (const vertex of original.vertices.slice(1)) {
      expect(mesh(result.workspace).vertices[vertex.id]).toBe(vertex);
    }
    expect(result.workspace.session.state.objectTransforms).toEqual(before.session.state.objectTransforms);
    expect(mesh(result.workspace).halfEdges).toBe(original.halfEdges);
    expect(mesh(result.workspace).faces).toBe(original.faces);
    expect(result.workspace.bridge.set.objects.find(({ id }) => id === "cube")?.geometryHash)
      .toBe(result.workspace.session.state.geometry.records.cube!.meshHash);
  });

  it("인접한 두 모서리의 공유 정점을 한 번만 이동한다", () => {
    const before = cube();
    const original = mesh(before);
    const selection = select(before, "edge", [0, 1]);
    const ids = new Set<number>();
    for (const id of selection.elementIds) {
      const edge = original.halfEdges[id]!;
      ids.add(edge.vertex);
      ids.add(original.halfEdges[edge.prev]!.vertex);
    }
    expect(ids.size).toBe(3);
    const result = workspaceTransformComponents(before, selection, {
      kind: "translate", value: { x: 0.05, y: -0.05, z: 0.05 },
    });
    for (const vertex of original.vertices) {
      const position = mesh(result.workspace).vertices[vertex.id]!.position;
      expect(position).toEqual(ids.has(vertex.id) ? {
        x: vertex.position.x + 0.05, y: vertex.position.y - 0.05, z: vertex.position.z + 0.05,
      } : vertex.position);
    }
  });

  it("면을 선택하면 그 면이 참조하는 정점만 변환한다", () => {
    const before = cube();
    const original = mesh(before);
    const ids = new Set(faceVertices(original, 0));
    const result = workspaceTransformComponents(before, select(before, "face", [0]), {
      kind: "translate", value: { x: 0, y: 0, z: -0.2 },
    });
    for (const vertex of original.vertices) {
      expect(mesh(result.workspace).vertices[vertex.id]!.position).toEqual({
        ...vertex.position, z: vertex.position.z - (ids.has(vertex.id) ? 0.2 : 0),
      });
    }
  });

  it("공유 모서리를 선택한 회전 중심은 중복을 뺀 정점 집합의 median이다", () => {
    const before = cube();
    const original = mesh(before);
    const selection = select(before, "edge", [0, 1]);
    const ids = new Set<number>();
    for (const id of selection.elementIds) {
      const edge = original.halfEdges[id]!;
      ids.add(edge.vertex); ids.add(original.halfEdges[edge.prev]!.vertex);
    }
    const pivot = { x: 0, y: 0 };
    for (const id of ids) {
      pivot.x += original.vertices[id]!.position.x / ids.size;
      pivot.y += original.vertices[id]!.position.y / ids.size;
    }
    const angle = Math.PI / 6;
    const result = workspaceTransformComponents(before, selection, {
      kind: "rotate", value: { x: 0, y: 0, z: angle },
    });
    for (const id of ids) {
      const point = original.vertices[id]!.position;
      const actual = mesh(result.workspace).vertices[id]!.position;
      expect(actual.x).toBeCloseTo(pivot.x + Math.cos(angle) * (point.x - pivot.x) - Math.sin(angle) * (point.y - pivot.y), 12);
      expect(actual.y).toBeCloseTo(pivot.y + Math.sin(angle) * (point.x - pivot.x) + Math.cos(angle) * (point.y - pivot.y), 12);
    }
    const equivalent = workspaceTransformComponents(before,
      select(before, "vertex", [...ids]), {
        kind: "rotate", value: { x: 0, y: 0, z: angle },
      });
    expect(equivalent.workspace.session.state.geometry.records.cube!.meshHash)
      .toBe(result.workspace.session.state.geometry.records.cube!.meshHash);
  });

  it("오프셋된 선택의 median을 중심으로 회전하고 좌표 원점 주위로 돌리지 않는다", () => {
    let before = cube();
    const all = mesh(before).vertices.map(({ id }) => id);
    const translated = workspaceTransformComponents(before, select(before, "vertex", all), {
      kind: "translate", value: { x: 3, y: 4, z: 5 },
    });
    before = translated.workspace;
    const result = workspaceTransformComponents(before, translated.selection, {
      kind: "rotate", value: { x: 0, y: 0, z: Math.PI / 2 },
    });
    for (const vertex of mesh(before).vertices) {
      const point = mesh(result.workspace).vertices[vertex.id]!.position;
      expect(point.x).toBeCloseTo(3 - (vertex.position.y - 4), 12);
      expect(point.y).toBeCloseTo(4 + (vertex.position.x - 3), 12);
      expect(point.z).toBeCloseTo(vertex.position.z, 12);
    }
  });

  it("복합 회전은 기존 뷰포트와 같은 intrinsic XYZ 순서를 사용한다", () => {
    const before = cube();
    const result = workspaceTransformComponents(before,
      select(before, "vertex", mesh(before).vertices.map(({ id }) => id)), {
        kind: "rotate", value: { x: Math.PI / 2, y: Math.PI / 2, z: 0 },
      });
    for (const vertex of mesh(before).vertices) {
      const point = mesh(result.workspace).vertices[vertex.id]!.position;
      expect(point.x).toBeCloseTo(vertex.position.z, 12);
      expect(point.y).toBeCloseTo(vertex.position.x, 12);
      expect(point.z).toBeCloseTo(vertex.position.y, 12);
    }
  });

  it("크기는 선택 median에서 각 축 배율로만 적용하고 후속 편집에 선택을 재결합한다", () => {
    const before = cube();
    const selection = select(before, "vertex", mesh(before).vertices.map(({ id }) => id));
    const result = workspaceTransformComponents(before, selection, {
      kind: "scale", value: { x: 2, y: 3, z: -4 },
    });
    for (const vertex of mesh(before).vertices) {
      expect(mesh(result.workspace).vertices[vertex.id]!.position).toEqual({
        x: vertex.position.x * 2, y: vertex.position.y * 3, z: vertex.position.z * -4,
      });
    }
    const source = workspaceComponentSelectionSource(result.workspace)!;
    expect(result.selection.elementIds).toEqual(selection.elementIds);
    expect(result.selection.activeElementId).toBe(selection.activeElementId);
    expect(result.selection.provenance).toMatchObject({
      meshRevision: source.meshRevision, sourceHash: source.sourceHash,
    });
    expect(validateStudioHybridDccComponentSelection(result.selection, source).ok).toBe(true);
    const second = workspaceTransformComponents(result.workspace, result.selection, {
      kind: "translate", value: { x: 1, y: 0, z: 0 },
    });
    expect(second.workspace.session.state.commandCount).toBe(result.workspace.session.state.commandCount + 1);
  });

  it("한 번의 명령으로 커밋하고 undo·redo·직렬화 복원에서 같은 메시를 유지한다", () => {
    const before = cube();
    const result = workspaceTransformComponents(before, select(before, "face", [0]), {
      kind: "scale", value: { x: 0.75, y: 0.75, z: 0.75 },
    });
    expect(result.workspace.session.undoStack).toHaveLength(before.session.undoStack.length + 1);
    expect(result.workspace.session.state.commandCount).toBe(before.session.state.commandCount + 1);
    expect(workspaceUndo(result.workspace).session.state.geometry.records.cube!.meshHash)
      .toBe(before.session.state.geometry.records.cube!.meshHash);
    const redone = workspaceRedo(workspaceUndo(result.workspace));
    expect(redone.session.state.geometry.records.cube!.meshHash)
      .toBe(result.workspace.session.state.geometry.records.cube!.meshHash);
    const restored = restoreStudioHybridDccStateFromSnapshot(JSON.parse(JSON.stringify(
      snapshotStudioHybridDccState(result.workspace.session.state),
    )));
    expect(restored.stateHash).toBe(result.workspace.session.state.stateHash);
    expect(restored.geometry.records.cube!.meshHash).toBe(result.workspace.session.state.geometry.records.cube!.meshHash);
  });

  it("미리보기 결과를 버리면 원본 메시·저널·undo 및 선택을 바꾸지 않는다", () => {
    const before = cube();
    const selection = select(before, "vertex", [0]);
    const snapshot = JSON.stringify(before.session.state);
    const journal = JSON.stringify(before.session.journal.records);
    const selectionSnapshot = JSON.stringify(selection);
    const preview = workspaceTransformComponents(before, selection, {
      kind: "translate", value: { x: -0.1, y: 0, z: 0 },
    });
    expect(preview.workspace.session.journal).not.toBe(before.session.journal);
    expect(JSON.stringify(before.session.state)).toBe(snapshot);
    expect(JSON.stringify(before.session.journal.records)).toBe(journal);
    expect(JSON.stringify(selection)).toBe(selectionSnapshot);
    const independent = workspaceTransformComponents(before, selection, {
      kind: "translate", value: { x: -0.2, y: 0, z: 0 },
    });
    expect(independent.workspace.session.state.commandCount).toBe(preview.workspace.session.state.commandCount);
    expect(mesh(independent.workspace).vertices[0]!.position.x).toBe(mesh(before).vertices[0]!.position.x - 0.2);
  });

  it("오래된 선택·다른 오브젝트·위조된 ID는 원본 변경 없이 거부한다", () => {
    const before = cube();
    const selection = select(before, "vertex", [0]);
    const request = { kind: "translate", value: { x: -0.1, y: 0, z: 0 } } as const;
    const result = workspaceTransformComponents(before, selection, request);
    expect(() => workspaceTransformComponents(result.workspace, selection, request)).toThrow(/stale/u);
    expect(() => workspaceTransformComponents(before, {
      ...selection, provenance: { ...selection.provenance!, assetId: "other" },
    }, request)).toThrow();
    expect(() => workspaceTransformComponents(before, {
      ...selection, elementIds: [999], activeElementId: 999,
    }, request)).toThrow(/element-not-found/u);
    expect(before.session.state.commandCount).toBe(1);
  });

  it.each([
    { kind: "translate", value: { x: Number.NaN, y: 0, z: 0 } },
    { kind: "rotate", value: { x: 0, y: Number.POSITIVE_INFINITY, z: 0 } },
    { kind: "scale", value: { x: 0, y: 1, z: 1 } },
    { kind: "scale", value: { x: 1e-12, y: 1, z: 1 } },
    { kind: "translate", value: { x: 1_000_000, y: 0, z: 0 } },
  ] as const)("유한 범위나 퇴화 제한을 벗어난 $kind 요청을 원자적으로 거부한다", (request) => {
    const before = cube();
    const snapshot = JSON.stringify(before.session.state);
    expect(() => workspaceTransformComponents(before,
      select(before, "vertex", mesh(before).vertices.map(({ id }) => id)), request)).toThrow();
    expect(JSON.stringify(before.session.state)).toBe(snapshot);
  });

  it("부분 이동으로 기존 변을 붕괴시키는 요청을 커밋하지 않는다", () => {
    const before = cube();
    const edge = mesh(before).halfEdges[0]!;
    const from = mesh(before).vertices[edge.vertex]!.position;
    const to = mesh(before).vertices[mesh(before).halfEdges[edge.prev]!.vertex]!.position;
    expect(() => workspaceTransformComponents(before, select(before, "vertex", [edge.vertex]), {
      kind: "translate", value: { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z },
    })).toThrow(/모서리/u);
    expect(before.session.state.commandCount).toBe(1);
  });

  it("변의 길이가 남아 있어도 면 전체가 일직선으로 퇴화하면 거부한다", () => {
    const initial = createStudioHybridDccWorkspace("triangle-degenerate");
    const triangle = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 2, z: 0 },
    ], [[0, 1, 2]]);
    const session = hybridDccRegisterAsset(initial.session, "cube", triangle, {
      source: "primitive", creator: "studio", license: "CC0-1.0", useScope: "commercial", derivative: "original",
    });
    const before = { ...synchronizeWorkspaceGeometryAuthority(initial, session), activeAssetId: "cube" };
    expect(() => workspaceTransformComponents(before, select(before, "vertex", [2]), {
      kind: "translate", value: { x: 1, y: -2, z: 0 },
    })).toThrow(/면의 넓이/u);
    expect(mesh(before)).toBe(triangle);
  });

  it("object 모드·빈 선택 및 원본 메시 예산 초과를 거부한다", () => {
    const before = cube();
    const request = { kind: "translate", value: { x: 1, y: 0, z: 0 } } as const;
    expect(() => workspaceTransformComponents(before, createStudioHybridDccComponentSelection(), request)).toThrow(/선택/u);
    const selection = select(before, "vertex", [0]);
    expect(() => workspaceTransformComponents(before, { ...selection, elementIds: [], activeElementId: null }, request)).toThrow(/선택/u);
    const oversized = { ...before, session: { ...before.session, state: { ...before.session.state,
      geometry: { ...before.session.state.geometry, records: { cube: {
        ...before.session.state.geometry.records.cube!, mesh: {
          ...mesh(before), vertices: Array.from({ length: STUDIO_EDITABLE_MESH_LIMITS.maxVertices + 1 }, () => mesh(before).vertices[0]!),
        },
      } } },
    } } };
    expect(() => workspaceTransformComponents(oversized, selection, request)).toThrow(/원본 메시/u);
  });

  it.each(["translate", "rotate", "scale"] as const)("%s 항등 변환은 명령과 revision을 추가하지 않는다", (kind) => {
    const before = cube();
    const selection = select(before, "vertex", [0]);
    const value = kind === "scale" ? 1 : 0;
    const result = workspaceTransformComponents(before, selection, { kind, value: { x: value, y: value, z: value } });
    expect(result.workspace).toBe(before);
    expect(result.selection).toBe(selection);
  });

  it("평가된 modifier cache가 있어도 원본 선택만 바꾸고 파생 cache를 무효화한다", async () => {
    const before = await workspaceAddActiveModifier(cube(), "array");
    const original = before.session.state.geometry.records.cube!;
    expect(original.renderCache!.positions.length / 3).toBeGreaterThan(original.mesh.vertices.length);
    const result = workspaceTransformComponents(before, select(before, "vertex", [0]), {
      kind: "translate", value: { x: -0.05, y: 0, z: 0 },
    });
    const record = result.workspace.session.state.geometry.records.cube!;
    expect(record.mesh.vertices).toHaveLength(original.mesh.vertices.length);
    expect(record.modifierStack.modifiers).toEqual(original.modifierStack.modifiers);
    expect(record.modifierStack.source).toBe(record.mesh);
    expect(record.renderCache).toBeNull();
    expect(original.renderCache).not.toBeNull();
  });
});
