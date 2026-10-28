import { describe, expect, it } from "vitest";

import { createStudioUnitCubeMesh, hashStudioEditableMesh } from "../../studio-editable-half-edge-mesh";
import { sha256HexPortable } from "../../studio-sha256";
import { createStudioHybridDccSession, hybridDccCommitGeometry, hybridDccDuplicateAsset, hybridDccRedo, hybridDccRegisterAsset, hybridDccRemoveAsset,
  hybridDccSetAssetToonMaterial, hybridDccUndo, restoreStudioHybridDccStateFromSnapshot, snapshotStudioHybridDccState } from "../studio-hybrid-dcc-document";
import { unwrapStudioMeshCornerUvs } from "../studio-hybrid-dcc-uv-edit";

import { createStudioHybridDccDefaultToonMaterial, hashStudioHybridDccToonMaterial } from "./studio-hybrid-dcc-toon-material";

import type { StudioHybridDccMaterials } from "./studio-hybrid-dcc-material-table";

const RIGHTS = { source: "primitive", creator: "studio", license: "CC0-1.0", useScope: "commercial", derivative: "original" };
const MATERIAL = createStudioHybridDccDefaultToonMaterial();
function session() {
  const base = createStudioUnitCubeMesh();
  const mesh = { ...base, faces: base.faces.map((face) => ({ ...face, materialSlot: face.id < 3 ? 0 : 2 })), uvLayer: unwrapStudioMeshCornerUvs(base) };
  return hybridDccRegisterAsset(createStudioHybridDccSession("material-document"), "cube", mesh, RIGHTS);
}

describe("툰 재질 문서 정본·명령", () => {
  it("여러 실제 slot을 내용 ID 하나에 단일 undo로 결합하며 geometry·UV 권위는 바꾸지 않는다", () => {
    const before = session(); const record = before.state.geometry.records.cube;
    const applied = hybridDccSetAssetToonMaterial(before, "cube", [0, 2], MATERIAL);
    const id = hashStudioHybridDccToonMaterial(MATERIAL);
    expect(applied.state.materials).toEqual({ revision: 1, definitions: { [id]: MATERIAL }, bindings: { cube: { "0": id, "2": id } } });
    expect(applied.state.stateHash).not.toBe(before.state.stateHash);
    expect(applied.state.geometry).toBe(before.state.geometry); expect(applied.state.geometry.records.cube).toBe(record);
    expect(hashStudioEditableMesh(applied.state.geometry.records.cube!.mesh)).toBe(record?.meshHash);
    expect(applied.state.geometry.records.cube?.mesh.uvLayer).toBe(record?.mesh.uvLayer);
    expect(applied.undoStack.length).toBe(before.undoStack.length + 1);
    expect(applied.journal.length).toBe(before.journal.length + 1); expect(before.state.materials).toBeUndefined();
    expect(hybridDccUndo(applied).state.materials).toBeUndefined();
    expect(hybridDccRedo(hybridDccUndo(applied)).state.stateHash).toBe(applied.state.stateHash);
    expect(applied.state.dirtyNodeIds).toContain("shot:*");
  });

  it("내용이 같은 재적용·이미 해제된 slot은 session/journal/undo identity를 보존한다", () => {
    const before = session(); expect(hybridDccSetAssetToonMaterial(before, "cube", [0], null)).toBe(before);
    const applied = hybridDccSetAssetToonMaterial(before, "cube", [0], MATERIAL);
    expect(hybridDccSetAssetToonMaterial(applied, "cube", [0], { ...MATERIAL })).toBe(applied);
    expect(hybridDccSetAssetToonMaterial(applied, "cube", [0, 0], MATERIAL)).toBe(applied);
    expect(hybridDccSetAssetToonMaterial(applied, "cube", [2], null)).toBe(applied);
    const removed = hybridDccSetAssetToonMaterial(applied, "cube", [0], null);
    expect(Object.hasOwn(removed.state, "materials")).toBe(false);
    expect(hybridDccUndo(removed).state.materials).toEqual(applied.state.materials);
  });

  it("복제 binding·정의 재사용과 삭제·수정 후 orphan GC를 undo/redo로 복원한다", () => {
    const original = hybridDccSetAssetToonMaterial(session(), "cube", [0, 2], MATERIAL);
    const duplicate = hybridDccDuplicateAsset(original, "cube", "copy");
    expect(duplicate.state.materials?.bindings.copy).toEqual(duplicate.state.materials?.bindings.cube);
    expect(Object.keys(duplicate.state.materials?.definitions ?? {})).toHaveLength(1);
    const changed = hybridDccSetAssetToonMaterial(duplicate, "cube", [0, 2], { ...MATERIAL, shadingShift: .5 });
    expect(Object.keys(changed.state.materials?.definitions ?? {})).toHaveLength(2);
    const removed = hybridDccRemoveAsset(changed, "cube");
    expect(Object.keys(removed.state.materials?.definitions ?? {})).toHaveLength(1); expect(removed.state.materials?.bindings.cube).toBeUndefined();
    expect(hybridDccUndo(removed).state.materials).toEqual(changed.state.materials);
    expect(hybridDccRedo(hybridDccUndo(removed)).state.stateHash).toBe(removed.state.stateHash);
    expect(hybridDccRemoveAsset(removed, "copy").state.materials).toBeUndefined();
  });

  it("geometry가 실제 slot을 없애면 남은 binding만 유지하고 undo에서 원래 표도 복구한다", () => {
    const before = hybridDccSetAssetToonMaterial(session(), "cube", [0, 2], MATERIAL);
    const mesh = before.state.geometry.records.cube!.mesh;
    const next = hybridDccCommitGeometry(before, "cube", { ...mesh, faces: mesh.faces.map((face) => ({ ...face, materialSlot: 0 })) });
    expect(Object.keys(next.state.materials?.bindings.cube ?? {})).toEqual(["0"]);
    expect(hybridDccUndo(next).state.materials).toEqual(before.state.materials);
  });

  it("존재하지 않는 자산·slot·상속 이름·잘못된 DTO는 원본과 journal을 보존한다", () => {
    const before = session(); const state = before.state; const journal = before.journal;
    for (const [asset, slots] of [["missing", [0]], ["toString", [0]], ["cube", [1]], ["cube", [-1]], ["cube", []]] satisfies readonly (readonly [string, readonly number[]])[]) {
      expect(() => hybridDccSetAssetToonMaterial(before, asset, slots, MATERIAL)).toThrow();
    }
    expect(() => hybridDccSetAssetToonMaterial(before, "cube", [0], { ...MATERIAL, shadingShift: Infinity })).toThrow();
    expect(before.state).toBe(state); expect(before.journal).toBe(journal); expect(before.state.materials).toBeUndefined();
  });

  it("snapshot의 내용 ID·실제 slot·own-key·엄격 DTO를 검증하고 빈 표는 legacy로 정규화한다", () => {
    const before = session(); const applied = hybridDccSetAssetToonMaterial(before, "cube", [0], MATERIAL);
    const snapshot = snapshotStudioHybridDccState(applied.state); const id = hashStudioHybridDccToonMaterial(MATERIAL);
    const table = snapshot.materials; if (!table) throw new Error("재질 표가 없습니다.");
    expect(restoreStudioHybridDccStateFromSnapshot(JSON.parse(JSON.stringify(snapshot))).stateHash).toBe(applied.state.stateHash);
    const extra = { ...MATERIAL, injected: true };
    const invalid: readonly StudioHybridDccMaterials[] = [
      { ...table, definitions: { [id]: { ...MATERIAL, shadingShift: .2 } } },
      { ...table, bindings: { cube: { "0": "constructor" } } },
      { ...table, bindings: { toString: { "0": id } } },
      { ...table, bindings: { cube: { "1": id } } },
      { ...table, bindings: { cube: { "00": id } } },
      { ...table, definitions: { [id]: extra } },
    ];
    for (const materials of invalid) expect(() => restoreStudioHybridDccStateFromSnapshot({ ...snapshot, materials })).toThrow();
    for (const version of [1, 2] as const) expect(() => restoreStudioHybridDccStateFromSnapshot({ ...snapshot, version })).toThrow(/이전 문서/u);
    const clean = snapshotStudioHybridDccState(before.state);
    const empty = restoreStudioHybridDccStateFromSnapshot({ ...clean, materials: { revision: 1, definitions: {}, bindings: {} } });
    expect(empty.stateHash).toBe(before.state.stateHash); expect(JSON.stringify(snapshotStudioHybridDccState(empty))).toBe(JSON.stringify(clean));
  });

  it("7ccb2684의 무재질 snapshot bytes·stateHash를 그대로 보존한다", () => {
    let value = createStudioHybridDccSession("toon-material-legacy");
    expect(value.state.stateHash).toBe("sha256:0ea1d6b56a6a77d3ae34e948a0ba0a8c426681cc3209de29aeb373a37b0ea0f1");
    value = hybridDccRegisterAsset(value, "cube", createStudioUnitCubeMesh(), RIGHTS);
    const bytes = new TextEncoder().encode(JSON.stringify(snapshotStudioHybridDccState(value.state)));
    expect(value.state.stateHash).toBe("sha256:4b70145e17fc78345613507da0be4b29c85473d5ba766ffb008ee3423844da1f");
    expect(sha256HexPortable(bytes)).toBe("7990c9bdc2ff95659757db68d7d8e503513f413a809f069948be26251dc76a2b");
  });
});
