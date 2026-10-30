import { describe, expect, it } from "vitest";

import { serializeStudioCommandJournal } from "../studio-command-journal";
import { createStudioEditableMeshFromPolygons } from "../studio-editable-half-edge-mesh";
import type { StudioOpfsRecoveryJournalAdapter } from "../studio-opfs-recovery-journal";
import { hashStudioMeshUvLayer } from "../mesh-uv/studio-mesh-uv-authority";

import { createStudioHybridDccComponentSelection, mutateStudioHybridDccComponentSelection } from "./studio-hybrid-dcc-component-selection";
import { workspaceTransformComponents } from "./studio-hybrid-dcc-component-transform";
import { createStudioHybridDccOpfsPorts, hybridDccRecoverFromJournal, hybridDccRegisterAsset, restoreStudioHybridDccStateFromSnapshot, snapshotStudioHybridDccState } from "./studio-hybrid-dcc-document";
import { createStudioHybridDccUvSelection, deriveStudioHybridDccUvEditorModel, workspaceTransformUvIslands, workspaceUnwrapUvActive } from "./studio-hybrid-dcc-uv-edit";
import { createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority, workspaceAddUnitCube, workspaceComponentSelectionSource, workspaceExtrudeActive, workspaceRedo, workspaceSelectAsset, workspaceUndo, workspaceUvUnwrapActive, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";
import { createStudioHybridDccWorkspacePersistence } from "./studio-hybrid-dcc-workspace-persistence";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "./studio-hybrid-dcc-workfile";

function cube() { return workspaceAddUnitCube(createStudioHybridDccWorkspace("uv-edit"), "cube"); }
function mesh(ws: StudioHybridDccWorkspace) { return ws.session.state.geometry.records[ws.activeAssetId!]!.mesh; }
function model(ws: StudioHybridDccWorkspace) {
  const value = deriveStudioHybridDccUvEditorModel(ws);
  if (!value) throw new Error("테스트 UV가 없습니다.");
  return value;
}
function translated(ws: StudioHybridDccWorkspace, x = 2) {
  const selection = createStudioHybridDccUvSelection(ws, [model(ws).islands[0]!.id]);
  return workspaceTransformUvIslands(ws, selection, { kind: "translate", value: { x, y: -1 } });
}

class MemoryJournalAdapter implements StudioOpfsRecoveryJournalAdapter {
  readonly kind = "fake-opfs" as const;
  readonly files = new Map<string, Uint8Array>();
  async read(path: string) { return this.files.get(path)?.slice() ?? null; }
  async writeAtomic(path: string, bytes: Uint8Array) { this.files.set(path, bytes.slice()); }
  async remove(path: string) { this.files.delete(path); }
  async list(prefix: string) { return [...this.files.keys()].filter((path) => path.startsWith(prefix)); }
  async size(path: string) { return this.files.get(path)?.byteLength ?? null; }
  async estimateQuota() { return { usage: [...this.files.values()].reduce((total, bytes) => total + bytes.byteLength, 0), quota: 100_000_000 }; }
  async withExclusiveLock<T>(_name: string, _signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> { return operation(); }
}

describe("UV 작업공간 편집", () => {
  it("기존 UV 버튼도 정본 UV를 만들며 한 번 undo하면 UV가 없어지고 redo로 동일 UV를 복원한다", () => {
    const original = cube();
    const beforeHash = original.session.state.stateHash;
    const unwrapped = workspaceUvUnwrapActive(original);
    expect(mesh(original).uvLayer).toBeUndefined();
    expect(mesh(unwrapped).uvLayer?.corners).toHaveLength(24);
    expect(unwrapped.session.undoStack).toHaveLength(original.session.undoStack.length + 1);
    expect(unwrapped.session.state.stateHash).not.toBe(beforeHash);
    expect(mesh(workspaceUndo(unwrapped)).uvLayer).toBeUndefined();
    expect(mesh(workspaceRedo(workspaceUndo(unwrapped))).uvLayer).toEqual(mesh(unwrapped).uvLayer);
    expect(workspaceUnwrapUvActive(unwrapped)).toBe(unwrapped);
  });

  it("한 섬의 코너만 이동하고 source positions·원본 journal·미선택 UV는 보존한다", () => {
    const original = workspaceUnwrapUvActive(cube());
    const before = model(original);
    const oldJournal = serializeStudioCommandJournal(original.session.journal);
    const result = translated(original);
    expect(mesh(result.workspace).vertices).toBe(mesh(original).vertices);
    expect(serializeStudioCommandJournal(original.session.journal)).toBe(oldJournal);
    expect(result.workspace.session.undoStack).toHaveLength(original.session.undoStack.length + 1);
    const selected = new Set(before.islands[0]!.cornerIds);
    model(result.workspace).corners.forEach((corner, index) => {
      const previous = before.corners[index]!;
      expect(corner.u).toBe(selected.has(index) ? Math.fround(previous.u + 2) : previous.u);
      expect(corner.v).toBe(selected.has(index) ? Math.fround(previous.v - 1) : previous.v);
    });
    expect(result.selection.uvHash).toBe(model(result.workspace).uvHash);
    expect(result.selection.sourceRevision).toBe(before.sourceRevision + 1);
    expect(workspaceUndo(result.workspace).session.state.stateHash).toBe(original.session.state.stateHash);
    expect(workspaceRedo(workspaceUndo(result.workspace)).session.state.stateHash).toBe(result.workspace.session.state.stateHash);
    // 미리보기 복사본을 버리는 취소는 원본 문서·선택·이력에 영향을 주지 않는다.
    expect(model(original)).toEqual(before);
  });

  it("단일 corner 선택은 공유 3D 정점의 다른 면 UV를 바꾸지 않는다", () => {
    const original = workspaceUnwrapUvActive(cube());
    const selection = createStudioHybridDccUvSelection(original, [], [0]);
    const result = workspaceTransformUvIslands(original, selection, { kind: "translate", value: { x: -3, y: 4 } });
    expect(result.selection.cornerIds).toEqual([0]);
    model(result.workspace).corners.forEach((corner, index) => {
      if (index) expect(corner).toEqual(model(original).corners[index]);
      else expect(corner.u).toBe(Math.fround(model(original).corners[0]!.u - 3));
    });
  });

  it("같은 위치의 다른 loop를 각자 평균에 포함하여 90도 회전한다", () => {
    const empty = createStudioHybridDccWorkspace("uv-pivot");
    const sourceMesh = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2], [0, 2, 3]]);
    const source = synchronizeWorkspaceGeometryAuthority({ ...empty, activeAssetId: "quad" }, hybridDccRegisterAsset(empty.session, "quad", sourceMesh, {
      source: "primitive", creator: "studio", license: "CC0-1.0", useScope: "commercial", derivative: "original",
    }));
    const original = workspaceUnwrapUvActive(source, "planar-xy");
    const selectedCorners = [0, 1, 3]; // (0,0), (1,0), (0,0) → pivot (1/3,0).
    const selection = createStudioHybridDccUvSelection(original, [], selectedCorners);
    const result = workspaceTransformUvIslands(original, selection, { kind: "rotate", angleRad: Math.PI / 2 });
    expect(model(result.workspace).corners[0]!.u).toBeCloseTo(1 / 3, 6);
    expect(model(result.workspace).corners[0]!.v).toBeCloseTo(-1 / 3, 6);
    expect(model(result.workspace).corners[1]!.v).toBeCloseTo(2 / 3, 6);
  });

  it("음수·0 UV 배율과 범위 밖 타일을 허용하고 후속 선택·편집을 계속한다", () => {
    const original = workspaceUnwrapUvActive(cube());
    const selection = createStudioHybridDccUvSelection(original, [0]);
    const collapsed = workspaceTransformUvIslands(original, selection, { kind: "scale", value: { x: 0, y: -2 } });
    const selected = new Set(model(original).islands[0]!.cornerIds);
    expect(new Set(model(collapsed.workspace).corners.filter(({ halfEdgeId }) => selected.has(halfEdgeId)).map(({ u }) => u)).size).toBe(1);
    const next = workspaceTransformUvIslands(collapsed.workspace, collapsed.selection, { kind: "translate", value: { x: -4, y: 5 } });
    expect(model(next.workspace).corners[0]!.u).toBeLessThan(-3);
  });

  it("no-op은 command를 추가하지 않고 잘못된 입력·stale selection은 원본을 바꾸지 않는다", () => {
    const original = workspaceUnwrapUvActive(cube());
    const selection = createStudioHybridDccUvSelection(original, [0]);
    const saved = JSON.stringify(original.session.state);
    expect(workspaceTransformUvIslands(original, selection, { kind: "scale", value: { x: 1, y: 1 } }).workspace).toBe(original);
    expect(() => workspaceTransformUvIslands(original, selection, { kind: "translate", value: { x: Infinity, y: 0 } })).toThrow(/유한/u);
    expect(() => workspaceTransformUvIslands(original, selection, { kind: "translate", value: { x: 1e40, y: 0 } })).toThrow(/Float32/u);
    const changed = translated(original).workspace;
    expect(() => workspaceTransformUvIslands(changed, selection, { kind: "rotate", angleRad: 1 })).toThrow(/다릅니다/u);
    expect(() => createStudioHybridDccUvSelection(original, [999])).toThrow(/없는/u);
    expect(JSON.stringify(original.session.state)).toBe(saved);
  });

  it("다른 자산·문서·위상으로 선택을 재사용하지 않는다", () => {
    const original = workspaceUnwrapUvActive(cube());
    const selection = createStudioHybridDccUvSelection(original, [0]);
    const other = workspaceUnwrapUvActive(workspaceAddUnitCube(original, "other"));
    expect(() => workspaceTransformUvIslands(other, selection, { kind: "rotate", angleRad: 1 })).toThrow(/다릅니다/u);
    const imported = decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(original), { documentId: "new-doc" });
    expect(() => workspaceTransformUvIslands(imported, selection, { kind: "rotate", angleRad: 1 })).toThrow(/다릅니다/u);
    const topologyChanged = workspaceExtrudeActive(original, 0.2);
    const changedMesh = mesh(topologyChanged);
    expect(changedMesh.uvLayer).toBeDefined();
    expect(changedMesh.uvLayer!.topologyHash).not.toBe(mesh(original).uvLayer!.topologyHash);
    expect(changedMesh.uvLayer!.corners).toHaveLength(changedMesh.halfEdges.length);
    expect(() => workspaceTransformUvIslands(topologyChanged, selection, { kind: "rotate", angleRad: 1 })).toThrow(/다릅니다/u);
  });

  it("3D 위치 편집은 코너 UV를 보존하며 old UV selection fence는 새 geometry revision을 거부한다", () => {
    const original = workspaceUnwrapUvActive(cube());
    const source = workspaceComponentSelectionSource(original)!;
    const selected = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
      mode: "vertex", operation: "replace", ids: source.mesh.vertices.map(({ id }) => id), source,
    });
    if (!selected.ok) throw new Error("컴포넌트 선택 실패");
    const moved = workspaceTransformComponents(original, selected.value, { kind: "translate", value: { x: 3, y: 2, z: 1 } }).workspace;
    expect(mesh(moved).uvLayer).toBe(mesh(original).uvLayer);
    expect(model(moved).uvHash).toBe(model(original).uvHash);
    expect(() => workspaceTransformUvIslands(moved, createStudioHybridDccUvSelection(original, [0]), { kind: "rotate", angleRad: 1 })).toThrow(/다릅니다/u);
  });

  it("UV를 포함한 snapshot에 과거 무UV fingerprint나 다른 UVhash를 붙여 복원할 수 없다", () => {
    const original = workspaceUnwrapUvActive(cube());
    const snapshot = snapshotStudioHybridDccState(original.session.state);
    for (const hash of ["mesh:1d31fe58", cube().session.state.geometry.records.cube!.meshHash]) {
      expect(() => restoreStudioHybridDccStateFromSnapshot({
        ...snapshot, assets: snapshot.assets.map((asset) => ({ ...asset, meshHash: hash })),
      })).toThrow(/mesh hash mismatch/u);
    }
    const corrupted = { ...original, session: { ...original.session, state: {
      ...original.session.state, geometry: { ...original.session.state.geometry, records: {
        ...original.session.state.geometry.records, cube: { ...original.session.state.geometry.records.cube!, meshHash: "mesh:1d31fe58" },
      } },
    } } };
    expect(() => encodeStudioHybridDccWorkfile(corrupted)).toThrow();
  });

  it("UV 정본이 있는 OPFS checkpoint 복원 뒤에도 파일 재진입·후속 편집을 계속한다", async () => {
    const original = translated(workspaceUnwrapUvActive(cube())).workspace;
    let token = 0;
    const ports = createStudioHybridDccOpfsPorts({
      adapter: new MemoryJournalAdapter(), documentId: original.session.state.documentId,
      now: () => 100, randomToken: () => (++token).toString(16).padStart(32, "0"),
    });
    const recovered = await hybridDccRecoverFromJournal(original.session, ports);
    expect(recovered.checkpointFound).toBe(true);
    expect(recovered.session.journal.length).toBe(0);
    const restored = synchronizeWorkspaceGeometryAuthority(original, recovered.session);
    expect(model(restored).uvHash).toBe(model(original).uvHash);
    const imported = decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(restored), { documentId: "uv-checkpoint" });
    const edited = translated(imported, 2).workspace;
    expect(model(workspaceUndo(edited)).uvHash).toBe(model(imported).uvHash);
    expect(model(workspaceRedo(workspaceUndo(edited))).uvHash).toBe(model(edited).uvHash);
  });

  it("OPFS 저널의 메모리 포트 저장·복원과 다른 documentId 작업파일에서 UV·이력·후속편집을 복원한다", async () => {
    const original = translated(workspaceUnwrapUvActive(cube())).workspace;
    let token = 0;
    const store = createStudioHybridDccWorkspacePersistence({
      adapter: new MemoryJournalAdapter(), scope: { userId: "uv-user", workId: "uv-work" },
      now: () => 100, randomToken: () => (++token).toString(16).padStart(32, "0"),
    });
    await store.save(original);
    const loaded = await store.load();
    expect(loaded.status).toBe("restored");
    if (loaded.status !== "restored") throw new Error("UV 저장 복원 실패");
    expect(mesh(loaded.workspace).uvLayer).toEqual(mesh(original).uvLayer);
    expect(serializeStudioCommandJournal(loaded.workspace.session.journal)).toBe(serializeStudioCommandJournal(original.session.journal));
    const imported = decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(loaded.workspace), { documentId: "uv-import" });
    expect(model(imported).documentId).toBe("uv-import");
    expect(model(imported).uvHash).toBe(model(original).uvHash);
    const undone = workspaceUndo(imported);
    expect(model(undone).uvHash).not.toBe(model(imported).uvHash);
    expect(mesh(workspaceRedo(undone)).uvLayer).toEqual(mesh(imported).uvLayer);
    const edited = translated(imported, 1).workspace;
    expect(hashStudioMeshUvLayer(mesh(workspaceUndo(edited)).uvLayer!)).toBe(model(imported).uvHash);
    expect(mesh(workspaceRedo(workspaceUndo(edited))).uvLayer).toEqual(mesh(edited).uvLayer);
    expect(deriveStudioHybridDccUvEditorModel(workspaceSelectAsset(workspaceAddUnitCube(imported, "second"), "second"))).toBeNull();
  });
});
