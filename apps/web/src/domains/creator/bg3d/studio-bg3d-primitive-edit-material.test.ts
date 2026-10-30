import { createHash } from "node:crypto";
import { Color, FrontSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Material, type Object3D } from "three";
import { describe, expect, it, vi } from "vitest";

import { exportStudioHybridDccMeshGlb } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";
import { hashStudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { createStudioBg3dEditableThreeClone, loadBg3dCustomModelFromBlob, loadVerifiedStudioBg3dGlbWithThree } from "../studio-background-3d-model";
import { readStudioVrmExportGlb, writeStudioVrmExportGlb } from "../vrm/studio-vrm-export-glb-container";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, STUDIO_BG3D_GLB_MAX_JSON_BYTES, validateStudioBg3dGlb } from "./studio-bg3d-glb-validation";
import { convertStudioBg3dPrimitiveToEditableMesh } from "./studio-bg3d-primitive-edit-mesh";
import { writeStudioBg3dPrimitiveEditMaterialGlb } from "./studio-bg3d-primitive-edit-material";
import {
  createStudioBg3dPrimitiveEditLineArtAdapter,
  readStudioBg3dPrimitiveEditDepthBias,
  restoreStudioBg3dPrimitiveEditDepthBias,
  shouldRenderStudioBg3dPrimitiveEditLineArtIndividually,
  STUDIO_BG3D_PRIMITIVE_EDIT_DEPTH_BIAS,
  STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY,
} from "./studio-bg3d-primitive-edit-material-runtime";
import { createDefaultStudioBg3dSceneDocument, DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE } from "./studio-bg3d-scene-document";

const COLOR = "#c9a876";
function exportedBytes(): Uint8Array<ArrayBuffer> {
  const source = convertStudioBg3dPrimitiveToEditableMesh({ id: "original-box", kind: "box" });
  if (!source.ok) throw new Error(source.detail);
  const result = exportStudioHybridDccMeshGlb({ assetId: "original-box", sourceRevision: 2,
    sourceHash: hashStudioEditableMesh(source.value.mesh), mesh: source.value.mesh });
  if (!result.ok) throw new Error("실제 box mesh 내보내기가 필요합니다.");
  return result.bytes;
}
function materialBytes(color = COLOR): Uint8Array<ArrayBuffer> {
  const result = writeStudioBg3dPrimitiveEditMaterialGlb(exportedBytes(), color);
  if (!result.ok) throw new Error(result.messageKo);
  return result.bytes;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("객체가 필요합니다.");
  return value;
}
function first(value: unknown): unknown {
  if (!Array.isArray(value) || value.length === 0) throw new Error("배열이 필요합니다.");
  return value[0];
}
function mesh(root: Object3D): Mesh {
  let found: Mesh | null = null;
  root.traverse((object) => { if (object instanceof Mesh && !found) found = object; });
  if (!found) throw new Error("실제 GLB mesh가 필요합니다.");
  return found;
}
function standard(material: Material | Material[]): MeshStandardMaterial {
  if (!(material instanceof MeshStandardMaterial)) throw new Error("실제 Standard 재질이 필요합니다.");
  return material;
}
function expectBias(material: Material): void {
  expect(material.polygonOffset).toBe(true);
  expect(material.polygonOffsetFactor).toBe(1);
  expect(material.polygonOffsetUnits).toBe(1);
}
function expectSourceMaterial(material: Material | Material[], color = COLOR): void {
  const actual = standard(material), original = new MeshStandardMaterial({ color });
  expect(actual.color.toArray()).toEqual(original.color.toArray());
  expect(actual.roughness).toBe(1); expect(actual.metalness).toBe(0);
  expect(actual.emissive.getHex()).toBe(0); expect(actual.emissiveIntensity).toBe(1);
  expect(actual.opacity).toBe(1); expect(actual.transparent).toBe(false); expect(actual.side).toBe(FrontSide);
  expectBias(actual); original.dispose();
}
async function loaded(bytes: Uint8Array<ArrayBuffer>) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const verification = await validateStudioBg3dGlb(bytes, {
    declared: { byteSize: bytes.byteLength, sha256: hash }, cumulative: { usedBytes: 0, maximumBytes: 100 * 1024 * 1024 },
    profile: "desktop", budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
    digest: async (data) => createHash("sha256").update(data).digest("hex"),
  });
  if (!verification.ok) throw new Error(verification.code);
  const result = await loadVerifiedStudioBg3dGlbWithThree(verification, createDefaultStudioBg3dSceneDocument().budgets);
  if (!result.ok) throw new Error(result.code);
  return result;
}

describe("단색 box 편집 GLB 재질 보존", () => {
  it("실제 exporter의 BIN·topology·provenance·accessor는 그대로 두고 linear 색과 명시 PBR만 더한다", () => {
    const input = exportedBytes(), snapshot = Uint8Array.from(input);
    const result = writeStudioBg3dPrimitiveEditMaterialGlb(input, COLOR);
    if (!result.ok) throw new Error(result.messageKo);
    const before = readStudioVrmExportGlb(input), after = readStudioVrmExportGlb(result.bytes);
    expect(input).toEqual(snapshot); expect(after.binary).toEqual(before.binary);
    const expected = structuredClone(before.json);
    expected.materials = after.json.materials;
    record(first(record(first(expected.meshes)).primitives)).material = 0;
    expect(after.json).toEqual(expected);
    const material = record(first(after.json.materials)), pbr = record(material.pbrMetallicRoughness);
    expect(pbr.baseColorFactor).toEqual([...new Color(COLOR).toArray(), 1]);
    expect(pbr).toMatchObject({ roughnessFactor: 1, metallicFactor: 0 });
    expect(material).toMatchObject({ emissiveFactor: [0, 0, 0], alphaMode: "OPAQUE", doubleSided: false });
    expect(record(material.extras)[STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY]).toEqual(STUDIO_BG3D_PRIMITIVE_EDIT_DEPTH_BIAS);
    expect(writeStudioBg3dPrimitiveEditMaterialGlb(input, COLOR)).toEqual(result);
  });

  it.each(["#000000", "#ffffff", "#808080", "#010a0b", "#A0B0C0"])("%s를 전역 색 관리와 무관한 linear 값으로 기록한다", (color) => {
    const value = readStudioVrmExportGlb(materialBytes(color));
    const factor = record(record(first(value.json.materials)).pbrMetallicRoughness).baseColorFactor;
    expect(factor).toEqual([...new Color(color).toArray(), 1]);
  });

  it("잘못된 색·깨진 컨테이너·예산 초과·기존 재질을 가진 외부 GLB는 부분 성공 없이 거부한다", () => {
    expect(writeStudioBg3dPrimitiveEditMaterialGlb(exportedBytes(), "red")).toMatchObject({ ok: false, code: "invalid-color" });
    expect(writeStudioBg3dPrimitiveEditMaterialGlb(new Uint8Array(20), COLOR)).toMatchObject({ ok: false, code: "invalid-glb" });
    const oversized = Uint8Array.from(exportedBytes());
    new DataView(oversized.buffer).setUint32(12, STUDIO_BG3D_GLB_MAX_JSON_BYTES + 4, true);
    expect(writeStudioBg3dPrimitiveEditMaterialGlb(oversized, COLOR)).toMatchObject({ ok: false, code: "budget-exceeded" });
    const value = readStudioVrmExportGlb(exportedBytes()); value.json.materials = [{}];
    expect(writeStudioBg3dPrimitiveEditMaterialGlb(writeStudioVrmExportGlb({ json: value.json, binary: value.binary }), COLOR))
      .toMatchObject({ ok: false, code: "unsupported-export" });
    expect(writeStudioBg3dPrimitiveEditMaterialGlb(materialBytes(), COLOR)).toMatchObject({ ok: false, code: "unsupported-export" });
  });

  it("실제 verified loader·서로 다른 재배치·thumbnail 구조 clone·legacy GLB 로드가 자산의 색/PBR/depth bias를 유지한다", async () => {
    const bytes = materialBytes(), firstLoad = await loaded(bytes), secondLoad = await loaded(bytes);
    try {
      expectSourceMaterial(mesh(firstLoad.root).material); expectSourceMaterial(mesh(secondLoad.root).material);
      expect(shouldRenderStudioBg3dPrimitiveEditLineArtIndividually(firstLoad.root, false)).toBe(false);
      expect(shouldRenderStudioBg3dPrimitiveEditLineArtIndividually(firstLoad.root, true)).toBe(true);
      const thumbnailClone = firstLoad.root.clone(true);
      expectSourceMaterial(mesh(thumbnailClone).material);
      const instance = await createStudioBg3dEditableThreeClone(firstLoad.root);
      try { instance.applyMaterialOverride(undefined); expectSourceMaterial(mesh(instance.root).material); }
      finally { instance.dispose(); }
      const legacy = await loadBg3dCustomModelFromBlob(new Blob([bytes]), "glb");
      expectSourceMaterial(mesh(legacy).material);
      legacy.traverse((object) => { if (object instanceof Mesh) { object.geometry.dispose(); standard(object.material).dispose(); } });
    } finally { firstLoad.dispose(); secondLoad.dispose(); }
  });

  it("반복 line-art toggle은 흰색 Basic+같은 bias를 쓰고 override binding·캐시·다른 인스턴스는 변경하지 않는다", async () => {
    const source = await loaded(materialBytes());
    const editable = await createStudioBg3dEditableThreeClone(source.root);
    const sibling = await createStudioBg3dEditableThreeClone(source.root);
    const object = mesh(editable.root), original = standard(object.material), cached = standard(mesh(source.root).material);
    const disposeOriginal = vi.spyOn(original, "dispose"), disposeCached = vi.spyOn(cached, "dispose");
    const adapter = createStudioBg3dPrimitiveEditLineArtAdapter(editable.root);
    try {
      adapter.setEnabled(true);
      const basic = object.material;
      if (!(basic instanceof MeshBasicMaterial)) throw new Error("표식이 있는 모델의 선화는 Basic입니다.");
      const disposeBasic = vi.spyOn(basic, "dispose");
      expect(basic.color.getHexString()).toBe("ffffff"); expect(basic.side).toBe(FrontSide); expectBias(basic);
      editable.applyMaterialOverride({ ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE, colorMode: "replace", color: "#123456", roughness: 0.5 });
      expect(object.material).toBe(basic); expect(basic.color.getHexString()).toBe("ffffff");
      adapter.setEnabled(false); expect(object.material).toBe(original);
      expect(original.color.getHexString()).toBe("123456"); expect(original.roughness).toBe(0.5); expectBias(original);
      adapter.setEnabled(true); expect(object.material).toBe(basic);
      expectSourceMaterial(mesh(sibling.root).material); expectSourceMaterial(cached);
      adapter.dispose(); adapter.dispose(); adapter.setEnabled(true);
      expect(object.material).toBe(original); expect(disposeBasic).toHaveBeenCalledOnce();
      expect(disposeOriginal).not.toHaveBeenCalled(); expect(disposeCached).not.toHaveBeenCalled();
    } finally { adapter.dispose(); editable.dispose(); sibling.dispose(); source.dispose(); }
  });

  it("일반 GLB와 손상되거나 미래 버전인 표식은 재질·depth bias·line-art 표시를 바꾸지 않는다", () => {
    for (const marker of [undefined, null, { ...STUDIO_BG3D_PRIMITIVE_EDIT_DEPTH_BIAS, version: 2 },
      { ...STUDIO_BG3D_PRIMITIVE_EDIT_DEPTH_BIAS, polygonOffsetFactor: 2 },
      { ...STUDIO_BG3D_PRIMITIVE_EDIT_DEPTH_BIAS, extra: true }]) {
      expect(readStudioBg3dPrimitiveEditDepthBias(marker)).toBeNull();
      const root = new Group(), material = new MeshStandardMaterial({ color: "#123456" }), object = new Mesh(undefined, material);
      material.userData[STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY] = marker;
      root.add(object); restoreStudioBg3dPrimitiveEditDepthBias(root);
      expect(shouldRenderStudioBg3dPrimitiveEditLineArtIndividually(root, true)).toBe(false);
      const adapter = createStudioBg3dPrimitiveEditLineArtAdapter(root); adapter.setEnabled(true);
      expect(object.material).toBe(material); expect(material.polygonOffset).toBe(false);
      adapter.dispose(); material.dispose(); object.geometry.dispose();
    }
  });
});
