import { describe, expect, it } from "vitest";

import { createStudioUnitCubeMesh, hashStudioEditableMesh } from "../../studio-editable-half-edge-mesh";
import { createStudioHybridDccDefaultToonMaterial, hashStudioHybridDccToonMaterial, studioToonMaterialObject, type StudioHybridDccToonMaterial } from "../materials/studio-hybrid-dcc-toon-material";
import { createStudioHybridDccSession, hybridDccRegisterAssets, snapshotStudioHybridDccState } from "../studio-hybrid-dcc-document";
import { exportStudioHybridDccMeshGlb } from "../studio-hybrid-dcc-glb-export";
import { createStudioHybridDccIdentityTransform } from "../studio-hybrid-dcc-object-transform";
import { unwrapStudioMeshCornerUvs } from "../studio-hybrid-dcc-uv-edit";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube, workspaceImportBytes, workspaceRedo, workspaceUndo } from "../studio-hybrid-dcc-workspace";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "../studio-hybrid-dcc-workfile";

import { decodeStudioNativeGlb } from "./studio-hybrid-dcc-native-glb";
import { decodeStudioNativeToonMaterial } from "./studio-hybrid-dcc-native-toon-material";

const A = createStudioHybridDccDefaultToonMaterial();
const B: StudioHybridDccToonMaterial = { ...A, baseColorSrgb: "#80c0ff", shadeColorSrgb: "#204080", shadingShift: .2,
  outline: { ...A.outline, mode: "screenCoordinates", width: .007 } };
const RIGHTS = { source: "fixture", creator: "studio", license: "CC0-1.0", useScope: "commercial", derivative: "original" };
function list(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error("fixture 배열이 없습니다."); return value; }
function fixture(partial = false, same = false): Uint8Array {
  const base = createStudioUnitCubeMesh();
  const mesh = { ...base, faces: base.faces.map((face) => ({ ...face, materialSlot: face.id < 3 ? 0 : 7 })), uvLayer: unwrapStudioMeshCornerUvs(base) };
  const toonMaterials: Record<string, StudioHybridDccToonMaterial> = { "0": A, ...(partial ? {} : { "7": same ? A : B }) };
  const result = exportStudioHybridDccMeshGlb({ assetId: "toon-fixture", mesh, sourceHash: hashStudioEditableMesh(mesh), sourceRevision: 1, toonMaterials });
  if (!result.ok) throw new Error(JSON.stringify(result.report)); return result.bytes;
}
function rewrite(bytes: Uint8Array, change: (root: Record<string, unknown>) => void): Uint8Array {
  const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const jsonLength = input.getUint32(12, true);
  const root = studioToonMaterialObject(JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as unknown);
  const bin = bytes.subarray(28 + jsonLength); change(root);
  const encoded = new TextEncoder().encode(JSON.stringify(root)); const padded = Math.ceil(encoded.length / 4) * 4;
  const output = new Uint8Array(28 + padded + bin.length); output.fill(32, 20, 20 + padded);
  const view = new DataView(output.buffer); view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, output.length, true);
  view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true); output.set(encoded, 20);
  view.setUint32(20 + padded, bin.length, true); view.setUint32(24 + padded, 0x004e4942, true); output.set(bin, 28 + padded); return output;
}
function firstMaterial(root: Record<string, unknown>) { return studioToonMaterialObject(list(root.materials)[0]); }
function metadata(material: Record<string, unknown>) { return studioToonMaterialObject(studioToonMaterialObject(material.extras).toonSpectrum); }
function failure(bytes: Uint8Array): void {
  const result = decodeStudioNativeGlb(bytes); expect(result.ok).toBe(false);
  if (result.ok) throw new Error("위조된 자체 재질을 받아들였습니다.");
  expect(result.issues.at(-1)?.code).toBe("INVALID_TOON_MATERIAL");
}

describe("자체 툰 GLB의 실제 편집 재질 복원", () => {
  it("실제 exporter의 두 재질·UV·mesh를 한 명령으로 가져오고 undo/redo·파일 재열기에서도 binding을 보존한다", () => {
    const bytes = fixture(); const original = bytes.slice(); const decoded = decodeStudioNativeGlb(bytes);
    expect(decoded.ok).toBe(true); if (!decoded.ok) throw new Error(JSON.stringify(decoded.issues));
    expect(decoded.value.assets).toHaveLength(2);
    expect(decoded.value.assets.map(({ initialMaterials }) => Object.values(initialMaterials ?? {}))).toEqual([[A], [B]]);
    expect(decoded.value.issues.some(({ code }) => code === "MATERIALS_NOT_IMPORTED" || code === "OPTIONAL_EXTENSION_DROPPED")).toBe(false);
    const before = workspaceAddUnitCube(createStudioHybridDccWorkspace("own-toon-import"), "existing");
    const next = workspaceImportBytes(before, "own-toon.glb", bytes);
    expect(next.session.undoStack.length).toBe(before.session.undoStack.length + 1); expect(next.session.journal.length).toBe(before.session.journal.length + 1);
    expect(Object.keys(next.session.state.materials?.definitions ?? {})).toHaveLength(2);
    for (const [index, asset] of Object.entries(decoded.value.assets)) {
      const record = Object.values(next.session.state.geometry.records).filter(({ assetId }) => assetId !== "existing")[Number(index)];
      if (!record) throw new Error("가져온 메시가 없습니다.");
      const slot = record.mesh.faces[0]?.materialSlot; const binding = next.session.state.materials?.bindings[record.assetId];
      expect(record.mesh.faces.every(({ materialSlot }) => materialSlot === slot)).toBe(true);
      expect(binding?.[String(slot)]).toBe(hashStudioHybridDccToonMaterial(index === "0" ? A : B));
      expect(record.mesh.uvLayer?.corners.length).toBe(record.mesh.halfEdges.length); expect(record.meshHash).toBe(hashStudioEditableMesh(asset.mesh));
    }
    expect(workspaceUndo(next).session.state.materials).toBeUndefined();
    expect(Object.keys(workspaceUndo(next).session.state.geometry.records)).toEqual(["existing"]);
    expect(workspaceRedo(workspaceUndo(next)).session.state.stateHash).toBe(next.session.state.stateHash);
    const reopened = decodeStudioHybridDccWorkfile(encodeStudioHybridDccWorkfile(next), { documentId: "own-toon-reopened" });
    expect(reopened.session.state.materials).toEqual(next.session.state.materials);
    expect(workspaceUndo(reopened).session.state.materials).toBeUndefined(); expect(bytes).toEqual(original);
  });

  it("같은 내용은 하나의 정의로 재사용하고 material이 없는 primitive에 선언 material0을 붙이지 않는다", () => {
    const shared = workspaceImportBytes(createStudioHybridDccWorkspace("same-toon"), "same.glb", fixture(false, true));
    expect(Object.keys(shared.session.state.materials?.definitions ?? {})).toHaveLength(1);
    const partial = decodeStudioNativeGlb(fixture(true));
    if (!partial.ok) throw new Error(JSON.stringify(partial.issues));
    expect(partial.value.assets).toHaveLength(2); expect(partial.value.assets[0]?.initialMaterials).toEqual({ "0": A });
    expect(partial.value.assets[1]?.initialMaterials).toBeUndefined();
    const next = workspaceImportBytes(createStudioHybridDccWorkspace("partial-toon"), "partial.glb", fixture(true));
    expect(Object.keys(next.session.state.materials?.bindings ?? {})).toHaveLength(1);
  });

  it("정규화 가능한 자체 DTO의 hex 표기도 실제 payload가 같으면 내용 ID로 복원한다", () => {
    const bytes = rewrite(fixture(), (root) => { studioToonMaterialObject(metadata(firstMaterial(root)).toonMaterial).baseColorSrgb = "#F2F2F2"; });
    const result = decodeStudioNativeGlb(bytes); if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value.assets[0]?.initialMaterials?.["0"]).toEqual(A);
  });

  it.each(["hash", "dto", "pbr", "mtoon", "texture", "missing-hash", "missing-extension"] as const)("%s 위조·불일치 metadata가 한 asset도 등록하지 못하게 거부한다", (kind) => {
    const bytes = rewrite(fixture(), (root) => {
      const material = firstMaterial(root); const meta = metadata(material);
      if (kind === "hash") meta.toonMaterialHash = `toon-material:sha256:${"0".repeat(64)}`;
      if (kind === "dto") studioToonMaterialObject(meta.toonMaterial).shadingShift = .8;
      if (kind === "pbr") studioToonMaterialObject(material.pbrMetallicRoughness).baseColorFactor = [1, 0, 0, 1];
      if (kind === "mtoon") studioToonMaterialObject(studioToonMaterialObject(material.extensions).VRMC_materials_mtoon).outlineWidthFactor = 9;
      if (kind === "texture") studioToonMaterialObject(material.pbrMetallicRoughness).baseColorTexture = { index: 0 };
      if (kind === "missing-hash") delete meta.toonMaterialHash;
      if (kind === "missing-extension") delete root.extensionsUsed;
    });
    failure(bytes);
    const before = workspaceAddUnitCube(createStudioHybridDccWorkspace("failed-toon"), "existing"); const state = before.session.state; const journal = before.session.journal;
    expect(() => workspaceImportBytes(before, "forged.glb", bytes)).toThrow();
    expect(before.session.state).toBe(state); expect(before.session.journal).toBe(journal);
    expect(Object.keys(before.session.state.geometry.records)).toEqual(["existing"]);
  });

  it("외부 MToon·일반 재질·이미지·rig 경고를 유지하며 자체 DTO 없는 payload를 복원했다고 하지 않는다", () => {
    const bytes = rewrite(fixture(), (root) => {
      for (const value of list(root.materials)) delete studioToonMaterialObject(value).extras;
      root.images = [{ uri: "https://example.invalid/never-fetched.png" }]; root.skins = [{}];
    });
    const result = decodeStudioNativeGlb(bytes); if (!result.ok) throw new Error(JSON.stringify(result.issues));
    expect(result.value.assets.every(({ initialMaterials }) => initialMaterials === undefined)).toBe(true);
    expect(result.value.issues.map(({ code }) => code)).toEqual(expect.arrayContaining(["MATERIALS_NOT_IMPORTED", "IMAGES_NOT_IMPORTED", "RIG_NOT_IMPORTED", "OPTIONAL_EXTENSION_DROPPED"]));
    expect(decodeStudioNativeToonMaterial({ extras: "external arbitrary JSON extras" }, "materials[0]")).toBeNull();
  });

  it("batch의 뒤쪽 초기 재질이 실제 slot에 없으면 앞 geometry·재질도 발행하지 않는다", () => {
    const before = createStudioHybridDccSession("invalid-initial-material"); const state = before.state; const journal = before.journal;
    const common = { mesh: createStudioUnitCubeMesh(), rights: RIGHTS, initialTransform: createStudioHybridDccIdentityTransform() };
    expect(() => hybridDccRegisterAssets(before, [{ ...common, assetId: "a", initialMaterials: { "0": A } }, { ...common, assetId: "b", initialMaterials: { "9": B } }])).toThrow();
    expect(before.state).toBe(state); expect(before.journal).toBe(journal); expect(Object.keys(before.state.geometry.records)).toEqual([]);
    const bare = hybridDccRegisterAssets(before, [{ ...common, assetId: "a" }]);
    const empty = hybridDccRegisterAssets(before, [{ ...common, assetId: "a", initialMaterials: {} }]);
    expect(snapshotStudioHybridDccState(bare.state)).toEqual(snapshotStudioHybridDccState(empty.state));
    expect(bare.state.materials).toBeUndefined(); expect(empty.state.materials).toBeUndefined();
  });
});
