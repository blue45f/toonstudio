import { describe, expect, it } from "vitest";

import { serializeStudioCommandJournal } from "../studio-command-journal";
import { createStudioEditableMeshFromPolygons, serializeStudioEditableMesh } from "../studio-editable-half-edge-mesh";

import { hybridDccRegisterAsset } from "./studio-hybrid-dcc-document";
import { exportStudioHybridDccMeshGlb } from "./studio-hybrid-dcc-glb-export";
import { workspaceAddActiveModifier, workspaceApplyActiveModifierStack } from "./studio-hybrid-dcc-modifier-workspace";
import { createStudioHybridDccUvSelection, workspaceTransformUvIslands, workspaceUnwrapUvActive } from "./studio-hybrid-dcc-uv-edit";
import { workspacePackUvActive } from "./studio-hybrid-dcc-uv-pack-workspace";
import { createStudioHybridDccWorkspace, synchronizeWorkspaceGeometryAuthority, workspaceAddUnitCube, workspaceRedo, workspaceUndo, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "./studio-hybrid-dcc-workfile";

function source() { return workspaceUnwrapUvActive(workspaceAddUnitCube(createStudioHybridDccWorkspace("uv-pack"), "cube")); }
function record(workspace: StudioHybridDccWorkspace) { return workspace.session.state.geometry.records.cube!; }
function glb(workspace: StudioHybridDccWorkspace) {
  const r = record(workspace);
  const result = exportStudioHybridDccMeshGlb({ mesh: r.mesh, sourceHash: r.meshHash, sourceRevision: r.revision, assetId: r.assetId });
  if (!result.ok) throw new Error(JSON.stringify(result.report));
  return result.bytes;
}
interface Gltf {
  readonly meshes: readonly { readonly primitives: readonly { readonly attributes: Readonly<Record<string, number>> }[] }[];
  readonly accessors: readonly { readonly count: number; readonly bufferView: number }[];
  readonly bufferViews: readonly { readonly byteOffset: number }[];
}
function stream(bytes: Uint8Array, attribute: "POSITION" | "TEXCOORD_0"): readonly number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + jsonLength))) as Gltf;
  const index = json.meshes[0]?.primitives[0]?.attributes[attribute];
  if (index === undefined) throw new Error(`GLB ${attribute} 누락`);
  const accessor = json.accessors[index]!; const buffer = json.bufferViews[accessor.bufferView]!;
  const offset = 20 + jsonLength + 8 + buffer.byteOffset;
  return Array.from({ length: accessor.count * (attribute === "POSITION" ? 3 : 2) }, (_, component) => view.getFloat32(offset + component * 4, true));
}

describe("실제 작업공간의 UV pack 명령", () => {
  it("UV외 메시 권위·원본 journal은 보존하고 단일 undo/redo하며 동일 재정리는 no-op이다", () => {
    const original = source(); const r = record(original);
    const before = serializeStudioEditableMesh(r.mesh); const journal = serializeStudioCommandJournal(original.session.journal);
    const packed = workspacePackUvActive(original);
    expect(packed.session.undoStack).toHaveLength(original.session.undoStack.length + 1);
    expect(record(packed).mesh.uvLayer).not.toEqual(r.mesh.uvLayer);
    expect(record(packed).mesh.vertices).toBe(r.mesh.vertices); expect(record(packed).mesh.halfEdges).toBe(r.mesh.halfEdges); expect(record(packed).mesh.faces).toBe(r.mesh.faces);
    expect(record(packed).mesh.nextVertexId).toBe(r.mesh.nextVertexId); expect(record(packed).mesh.nextHalfEdgeId).toBe(r.mesh.nextHalfEdgeId); expect(record(packed).mesh.nextFaceId).toBe(r.mesh.nextFaceId);
    expect(serializeStudioEditableMesh(r.mesh)).toEqual(before); expect(serializeStudioCommandJournal(original.session.journal)).toBe(journal);
    expect(workspaceUndo(packed).session.state.stateHash).toBe(original.session.state.stateHash);
    expect(workspaceRedo(workspaceUndo(packed)).session.state.stateHash).toBe(packed.session.state.stateHash);
    expect(workspacePackUvActive(packed)).toBe(packed);
  });

  it("다른 documentId로 작업파일을 열고 UV/이력을 복원하며 GLB에는 UV 변화만 전달한다", () => {
    const original = source(); const packed = workspacePackUvActive(original);
    const reopened = decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(packed), { documentId: "uv-pack-reopened" });
    expect(record(reopened).mesh.uvLayer).toEqual(record(packed).mesh.uvLayer);
    expect(record(workspaceUndo(reopened)).mesh.uvLayer).toEqual(record(original).mesh.uvLayer);
    expect(record(workspaceRedo(workspaceUndo(reopened))).mesh.uvLayer).toEqual(record(packed).mesh.uvLayer);
    const before = glb(original); const after = glb(reopened);
    expect(stream(after, "POSITION")).toEqual(stream(before, "POSITION"));
    expect(stream(after, "TEXCOORD_0")).not.toEqual(stream(before, "TEXCOORD_0"));
    expect(glb(packed)).toEqual(after);
  });

  it("접힌 UV·잘못된 margin·오래된 source hash 실패는 원본과 편집 이력을 바꾸지 않는다", () => {
    const original = source();
    const selection = createStudioHybridDccUvSelection(original, [], record(original).mesh.uvLayer!.corners.map(({ halfEdgeId }) => halfEdgeId));
    const collapsed = workspaceTransformUvIslands(original, selection, { kind: "scale", value: { x: 0, y: 0 } }).workspace;
    const state = collapsed.session.state; const undo = collapsed.session.undoStack; const journal = serializeStudioCommandJournal(collapsed.session.journal);
    expect(() => workspacePackUvActive(collapsed)).toThrow(/접힌 UV/u);
    expect(collapsed.session.state).toBe(state); expect(collapsed.session.undoStack).toBe(undo); expect(serializeStudioCommandJournal(collapsed.session.journal)).toBe(journal);
    expect(() => workspacePackUvActive(original, { margin: NaN, rotate: true })).toThrow(/여백/u);
    const corrupt = { ...original, session: { ...original.session, state: { ...original.session.state,
      geometry: { ...original.session.state.geometry, records: { ...original.session.state.geometry.records, cube: { ...record(original), meshHash: "stale" } } },
    } } };
    expect(() => workspacePackUvActive(corrupt)).toThrow(/해시/u);
    expect(original.session.state.geometry.records.cube!.meshHash).not.toBe("stale");
  });

  it("선택이 없거나 UV가 없는 오브젝트는 정리하지 않는다", () => {
    expect(() => workspacePackUvActive(createStudioHybridDccWorkspace("empty-pack"))).toThrow(/오브젝트/u);
    expect(() => workspacePackUvActive(workspaceAddUnitCube(createStudioHybridDccWorkspace("plain-pack"), "cube"))).toThrow(/UV/u);
  });

  it("Solidify 적용의 접힌 rim UV 면을 포함한 양수 bounds island도 형태 그대로 정리한다", async () => {
    const empty = createStudioHybridDccWorkspace("pack-solidify-rim");
    const quad = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
    ], [[0, 1, 2, 3]]);
    const registered = synchronizeWorkspaceGeometryAuthority({ ...empty, activeAssetId: "cube" }, hybridDccRegisterAsset(empty.session, "cube", quad, {
      source: "primitive", creator: "studio", license: "CC0-1.0", useScope: "commercial", derivative: "original",
    }));
    const uv = workspaceUnwrapUvActive(registered, "planar-xy");
    const solid = await workspaceApplyActiveModifierStack(await workspaceAddActiveModifier(uv, "solidify"));
    const before = record(solid).mesh.uvLayer!;
    const packed = workspacePackUvActive(solid);
    const after = record(packed).mesh.uvLayer!;
    expect(after.corners).toHaveLength(before.corners.length);
    let collapsedEdges = 0;
    for (const edge of record(solid).mesh.halfEdges) {
      const a = before.corners[edge.id]!; const b = before.corners[edge.next]!;
      if (a.u === b.u && a.v === b.v) {
        collapsedEdges += 1;
        expect(after.corners[edge.id]!.u).toBe(after.corners[edge.next]!.u);
        expect(after.corners[edge.id]!.v).toBe(after.corners[edge.next]!.v);
      }
    }
    expect(collapsedEdges).toBeGreaterThan(0);
    expect(record(workspaceUndo(packed)).mesh.uvLayer).toEqual(before);
  });
});
