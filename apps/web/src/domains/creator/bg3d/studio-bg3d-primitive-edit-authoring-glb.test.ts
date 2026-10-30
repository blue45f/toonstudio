import { createHash } from "node:crypto";
import { Color, FrontSide, Mesh, MeshStandardMaterial, type Object3D } from "three";
import { describe, expect, it } from "vitest";

import { exportStudioHybridDccMeshGlb } from "../hybrid-dcc/studio-hybrid-dcc-glb-export";
import { pushPullStudioEditableMeshFaces } from "../hybrid-dcc/studio-hybrid-dcc-face-pushpull";
import { hashStudioEditableMesh, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { createStudioBg3dEditableThreeClone, loadVerifiedStudioBg3dGlbWithThree } from "../studio-background-3d-model";
import { readStudioVrmExportGlb, writeStudioVrmExportGlb } from "../vrm/studio-vrm-export-glb-container";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, STUDIO_BG3D_GLB_MAX_JSON_BYTES, validateStudioBg3dGlb } from "./studio-bg3d-glb-validation";
import { createStudioBg3dPrimitiveEditAuthoring } from "./studio-bg3d-primitive-edit-authoring";
import {
  readStudioBg3dPrimitiveEditAuthoringGlb, writeStudioBg3dPrimitiveEditAuthoringToGlb,
  STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY,
  type StudioBg3dPrimitiveEditAuthoringGlbResult,
} from "./studio-bg3d-primitive-edit-authoring-glb";
import { writeStudioBg3dPrimitiveEditMaterialGlb } from "./studio-bg3d-primitive-edit-material";
import { STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY } from "./studio-bg3d-primitive-edit-material-runtime";
import { convertStudioBg3dPrimitiveToEditableMesh } from "./studio-bg3d-primitive-edit-mesh";
import { createDefaultStudioBg3dSceneDocument, DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE } from "./studio-bg3d-scene-document";

const KEY = STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_SCENE_KEY;
const COLOR = "#c9a876";
function value<T>(result: StudioBg3dPrimitiveEditAuthoringGlbResult<T>): T {
  if (!result.ok) throw new Error(`${result.code}: ${result.messageKo}`); return result.value;
}
function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
function record(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) throw new Error("객체가 필요합니다.");
  return input;
}
function first(input: unknown): unknown {
  if (!Array.isArray(input) || input.length === 0) throw new Error("항목이 필요합니다."); return input[0];
}
function scene(json: Record<string, unknown>) { return record(first(json.scenes)); }
function material(json: Record<string, unknown>) { return record(first(json.materials)); }
function pbr(json: Record<string, unknown>) { return record(material(json).pbrMetallicRoughness); }
function primitive(json: Record<string, unknown>) { return record(first(record(first(json.meshes)).primitives)); }
function originalMesh(): StudioEditableMesh {
  const source = convertStudioBg3dPrimitiveToEditableMesh({ id: "actual-authoring-box", kind: "box" });
  if (!source.ok) throw new Error(source.detail); return source.value.mesh;
}
function editedMesh(): StudioEditableMesh {
  const result = pushPullStudioEditableMeshFaces(originalMesh(), [2], 0.12345678901234566);
  if (!result.ok) throw new Error(result.detail); return result.value.mesh;
}
function exported(mesh: StudioEditableMesh, color = COLOR) {
  const created = createStudioBg3dPrimitiveEditAuthoring({ assetId: "actual-authoring-box", revision: 2, mesh, colorSrgb: color,
    objectTransformAtExport: { revision: 1, position: [2.25, 0.75, -3.5], rotationEulerRad: [0.31, -0.63, 0.24], scale: [1.8, 0.6, 2.2] } });
  if (!created.ok) throw new Error(created.messageKo);
  const plain = exportStudioHybridDccMeshGlb({ assetId: created.value.envelope.source.assetId, sourceRevision: 2,
    sourceHash: created.value.envelope.source.meshHash, mesh });
  if (!plain.ok) throw new Error("실제 메시 내보내기가 필요합니다.");
  const colored = writeStudioBg3dPrimitiveEditMaterialGlb(plain.bytes, color);
  if (!colored.ok) throw new Error(colored.messageKo);
  return { mesh, envelope: created.value.envelope, plain: plain.bytes, colored: colored.bytes };
}
function fixture() {
  const source = exported(editedMesh());
  return { ...source, bytes: value(writeStudioBg3dPrimitiveEditAuthoringToGlb(source.colored, source.envelope)) };
}
function mutate(bytes: Uint8Array, change: (root: Record<string, unknown>) => void): Uint8Array<ArrayBuffer> {
  const parsed = readStudioVrmExportGlb(bytes); change(parsed.json);
  return writeStudioVrmExportGlb({ json: parsed.json, binary: parsed.binary });
}
/** 키 순서와 독성 키가 canonical writer에 의해 바뀌지 않은 실제 외부 JSON 입력이다. */
function rawJsonGlb(root: Record<string, unknown>, binary: Uint8Array): Uint8Array<ArrayBuffer> {
  const json = new TextEncoder().encode(JSON.stringify(root)), jsonLength = Math.ceil(json.byteLength / 4) * 4;
  const binLength = Math.ceil(binary.byteLength / 4) * 4, output = new Uint8Array(28 + jsonLength + binLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, output.byteLength, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  output.fill(0x20, 20, 20 + jsonLength); output.set(json, 20);
  view.setUint32(20 + jsonLength, binLength, true); view.setUint32(24 + jsonLength, 0x004e4942, true);
  output.set(binary, 28 + jsonLength); return output;
}
function standard(root: Object3D): MeshStandardMaterial {
  let found: MeshStandardMaterial | null = null;
  root.traverse((object) => { if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) found = object.material; });
  if (!found) throw new Error("실제 GLB Standard 재질이 필요합니다."); return found;
}

describe("원본 면 편집 GLB와 단색 재질의 정확한 결합", () => {
  it("실제 box→Push/Pull→exporter→단색 writer에서 BIN과 모든 JSON을 보존하고 한 Scene 키만 추가한다", () => {
    const source = exported(editedMesh()), beforeBytes = Uint8Array.from(source.colored), beforeEnvelope = structuredClone(source.envelope);
    const bytes = value(writeStudioBg3dPrimitiveEditAuthoringToGlb(source.colored, source.envelope));
    const before = readStudioVrmExportGlb(source.colored), after = readStudioVrmExportGlb(bytes);
    expect(source.colored).toEqual(beforeBytes); expect(source.envelope).toEqual(beforeEnvelope);
    expect(after.binary).toEqual(before.binary);
    expect(scene(after.json).extras).toEqual({ [KEY]: source.envelope });
    delete scene(after.json).extras; expect(after.json).toEqual(before.json);
    const restored = value(readStudioBg3dPrimitiveEditAuthoringGlb(bytes));
    expect(restored.mesh).toEqual(source.mesh); expect(restored.envelope).toEqual(source.envelope);
    expect(restored.mesh.vertices.some(({ position }) => Math.fround(position.y) !== position.y)).toBe(true);
    expect(hashStudioEditableMesh(restored.mesh)).toBe(source.envelope.source.meshHash);
    expect(restored.envelope.objectTransformAtExport).toEqual(source.envelope.objectTransformAtExport);
    expect(value(writeStudioBg3dPrimitiveEditAuthoringToGlb(bytes, source.envelope))).toEqual(bytes);
  });

  it("기존 payload 없는 모델·root/node에만 복사한 payload는 편집 원본으로 추정하지 않는다", () => {
    const source = fixture();
    expect(readStudioBg3dPrimitiveEditAuthoringGlb(source.colored)).toMatchObject({ ok: false, code: "missing-authoring" });
    const rootOnly = mutate(source.colored, (root) => { root[KEY] = source.envelope; });
    const nodeOnly = mutate(source.colored, (root) => { record(first(root.nodes)).extras = { [KEY]: source.envelope }; });
    for (const bytes of [rootOnly, nodeOnly]) expect(readStudioBg3dPrimitiveEditAuthoringGlb(bytes)).toMatchObject({ ok: false, code: "missing-authoring" });
    expect(writeStudioBg3dPrimitiveEditAuthoringToGlb(source.plain, source.envelope)).toMatchObject({ ok: false, code: "render-mismatch" });
  });

  it("getter·미래 버전·한도 초과·거짓 지문은 기록 전에 strict parser로 거부한다", () => {
    const source = fixture(); let getterCalls = 0;
    const getter = { ...source.envelope };
    Object.defineProperty(getter, "mesh", { enumerable: true, get() { getterCalls += 1; return source.envelope.mesh; } });
    expect(writeStudioBg3dPrimitiveEditAuthoringToGlb(source.colored, getter)).toMatchObject({ ok: false, code: "invalid-json" });
    expect(getterCalls).toBe(0);
    expect(writeStudioBg3dPrimitiveEditAuthoringToGlb(source.colored, { ...source.envelope, version: 2 }))
      .toMatchObject({ ok: false, code: "unsupported-version" });
    expect(writeStudioBg3dPrimitiveEditAuthoringToGlb(source.colored, { ...source.envelope,
      source: { ...source.envelope.source, meshHash: `mesh:sha256:${"0".repeat(64)}` } })).toMatchObject({ ok: false, code: "hash-mismatch" });
    expect(writeStudioBg3dPrimitiveEditAuthoringToGlb(source.colored, { ...source.envelope, extra: "x".repeat(256 * 1024) }))
      .toMatchObject({ ok: false, code: "budget-exceeded" });
  });

  it("깨진 GLB·과대 JSON·미래 payload를 부분 성공이나 기존 파일 수정 없이 거부한다", () => {
    const source = fixture(), oversized = Uint8Array.from(source.bytes);
    new DataView(oversized.buffer).setUint32(12, STUDIO_BG3D_GLB_MAX_JSON_BYTES + 4, true);
    expect(readStudioBg3dPrimitiveEditAuthoringGlb(new Uint8Array(0))).toMatchObject({ ok: false, code: "invalid-glb" });
    expect(readStudioBg3dPrimitiveEditAuthoringGlb(new Uint8Array(20))).toMatchObject({ ok: false, code: "invalid-glb" });
    expect(readStudioBg3dPrimitiveEditAuthoringGlb(source.bytes.subarray(0, 50))).toMatchObject({ ok: false, code: "invalid-glb" });
    expect(readStudioBg3dPrimitiveEditAuthoringGlb(oversized)).toMatchObject({ ok: false, code: "budget-exceeded" });
    const future = mutate(source.bytes, (root) => { record(record(scene(root).extras)[KEY]).version = 2; });
    expect(readStudioBg3dPrimitiveEditAuthoringGlb(future)).toMatchObject({ ok: false, code: "unsupported-version" });
    expect(writeStudioBg3dPrimitiveEditAuthoringToGlb(future, source.envelope)).toMatchObject({ ok: false, code: "unsupported-version" });
  });

  const tamperCases: ReadonlyArray<readonly [string, (root: Record<string, unknown>) => void]> = [
    ["원본 색", (root) => { pbr(root).baseColorFactor = [1, 1, 1, 1]; }],
    ["roughness", (root) => { pbr(root).roughnessFactor = 0.4; }],
    ["metalness", (root) => { pbr(root).metallicFactor = 1; }],
    ["emissive", (root) => { material(root).emissiveFactor = [1, 0, 0]; }],
    ["opacity", (root) => { pbr(root).baseColorFactor = [0.1, 0.2, 0.3, 0.5]; }],
    ["alphaMode", (root) => { material(root).alphaMode = "BLEND"; }],
    ["doubleSide", (root) => { material(root).doubleSided = true; }],
    ["depth bias", (root) => { record(record(material(root).extras)[STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY]).polygonOffsetFactor = 2; }],
    ["depth marker version", (root) => { record(record(material(root).extras)[STUDIO_BG3D_PRIMITIVE_EDIT_MATERIAL_KEY]).version = 2; }],
    ["depth marker 누락", (root) => { delete material(root).extras; }],
    ["material extension", (root) => { material(root).extensions = { KHR_materials_unlit: {} }; }],
    ["texture 참조", (root) => { pbr(root).baseColorTexture = { index: 0 }; }],
    ["이미지·texture", (root) => { root.images = [{ uri: "data:image/png;base64,AA==" }]; root.textures = [{ source: 0 }]; }],
    ["UV", (root) => { record(primitive(root).attributes).TEXCOORD_0 = 0; }],
    ["추가 material", (root) => { root.materials = [material(root), {}]; }],
    ["material index", (root) => { primitive(root).material = 1; }],
    ["node transform", (root) => { record(first(root.nodes)).translation = [1, 0, 0]; }],
    ["animation", (root) => { root.animations = []; }],
    ["외부 Scene extras", (root) => { record(scene(root).extras).foreign = true; }],
    ["root provenance", (root) => { record(root.extras).foreign = true; }],
    ["source ID", (root) => { record(record(scene(root).extras)[KEY]).source = { ...record(record(record(scene(root).extras)[KEY]).source), assetId: "other-box" }; }],
    ["source revision", (root) => { record(record(record(scene(root).extras)[KEY]).source).revision = 3; }],
    ["source 색과 현재 override 혼합", (root) => { record(record(record(scene(root).extras)[KEY]).sourceMaterialAtExport).colorSrgb = "#2468ac"; }],
  ];
  it.each(tamperCases)("%s 변조를 제거하거나 무시해서 통과시키지 않는다", (_name, change) => {
    const source = fixture(), bytes = mutate(source.bytes, change), before = Uint8Array.from(bytes);
    expect(readStudioBg3dPrimitiveEditAuthoringGlb(bytes)).toMatchObject({ ok: false, code: "render-mismatch" });
    expect(writeStudioBg3dPrimitiveEditAuthoringToGlb(bytes, source.envelope).ok).toBe(false);
    expect(bytes).toEqual(before);
  });

  it("BIN bit·독성 JSON 키·비어 있는 외부 extras·추가 scene도 정확히 거부한다", () => {
    const source = fixture(), changed = readStudioVrmExportGlb(source.bytes);
    changed.binary[0] ^= 1;
    expect(readStudioBg3dPrimitiveEditAuthoringGlb(writeStudioVrmExportGlb(changed))).toMatchObject({ ok: false, code: "render-mismatch" });
    const toxic = readStudioVrmExportGlb(source.bytes);
    Object.defineProperty(toxic.json, "__proto__", { enumerable: true, value: {} });
    expect(readStudioBg3dPrimitiveEditAuthoringGlb(rawJsonGlb(toxic.json, toxic.binary))).toMatchObject({ ok: false, code: "render-mismatch" });
    const emptyExtras = mutate(source.colored, (root) => { scene(root).extras = {}; });
    expect(writeStudioBg3dPrimitiveEditAuthoringToGlb(emptyExtras, source.envelope)).toMatchObject({ ok: false, code: "render-mismatch" });
    const extraScene = mutate(source.bytes, (root) => { root.scenes = [scene(root), { nodes: [] }]; });
    expect(readStudioBg3dPrimitiveEditAuthoringGlb(extraScene)).toMatchObject({ ok: false, code: "render-mismatch" });
  });

  it("JSON key 순서·view offset은 허용하고 충돌하는 기존 과거 기록은 덮어쓰지 않는다", () => {
    const source = fixture(), parsed = readStudioVrmExportGlb(source.bytes);
    const reversed = Object.fromEntries(Object.entries(parsed.json).reverse());
    const padded = new Uint8Array(source.bytes.byteLength + 8); padded.set(source.bytes, 4);
    expect(value(readStudioBg3dPrimitiveEditAuthoringGlb(rawJsonGlb(reversed, parsed.binary))).mesh).toEqual(source.mesh);
    expect(value(readStudioBg3dPrimitiveEditAuthoringGlb(padded.subarray(4, -4))).mesh).toEqual(source.mesh);
    const changedHistorical = { ...source.envelope, objectTransformAtExport: { ...source.envelope.objectTransformAtExport, position: [0, 0, 0] } };
    expect(writeStudioBg3dPrimitiveEditAuthoringToGlb(source.bytes, changedHistorical)).toMatchObject({ ok: false, code: "render-mismatch" });
  });

  it("Float32가 같은 두 double 메시도 source 지문을 바꿔 끼우면 거부한다", () => {
    const original = originalMesh(), shifted: StudioEditableMesh = { ...original,
      vertices: original.vertices.map((vertex) => ({ ...vertex, position: { ...vertex.position, x: vertex.position.x * (1 + 1e-10) } })) };
    const a = exported(original), b = exported(shifted);
    expect(readStudioVrmExportGlb(a.colored).binary).toEqual(readStudioVrmExportGlb(b.colored).binary);
    expect(a.envelope.source.meshHash).not.toBe(b.envelope.source.meshHash);
    expect(writeStudioBg3dPrimitiveEditAuthoringToGlb(a.colored, b.envelope)).toMatchObject({ ok: false, code: "render-mismatch" });
  });

  it("일관되게 다시 만든 색상 파일은 새로운 content identity이며 원래 자산의 인증을 대신하지 않는다", () => {
    const source = fixture(), recolored = exported(source.mesh, "#2468ac");
    const bytes = value(writeStudioBg3dPrimitiveEditAuthoringToGlb(recolored.colored, recolored.envelope));
    expect(value(readStudioBg3dPrimitiveEditAuthoringGlb(bytes)).envelope.sourceMaterialAtExport.colorSrgb).toBe("#2468ac");
    expect(createHash("sha256").update(bytes).digest("hex")).not.toBe(createHash("sha256").update(source.bytes).digest("hex"));
  });

  it("실제 strict validator·loader·재배치 clone에서 원본 색/PBR/depth bias와 현재 override를 분리 보존한다", async () => {
    const source = fixture(), bytes = source.bytes, sha256 = createHash("sha256").update(bytes).digest("hex");
    const validated = await validateStudioBg3dGlb(bytes, { declared: { byteSize: bytes.byteLength, sha256 },
      cumulative: { usedBytes: 0, maximumBytes: 100 * 1024 * 1024 }, profile: "desktop", budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
      digest: async (input) => createHash("sha256").update(input).digest("hex") });
    if (!validated.ok) throw new Error(validated.code);
    const loaded = await loadVerifiedStudioBg3dGlbWithThree(validated, createDefaultStudioBg3dSceneDocument().budgets);
    if (!loaded.ok) throw new Error(loaded.code);
    const clone = await createStudioBg3dEditableThreeClone(loaded.root), sibling = await createStudioBg3dEditableThreeClone(loaded.root);
    try {
      clone.applyMaterialOverride({ ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE, colorMode: "replace", color: "#2468ac", colorStrength: 1,
        roughness: 0.37, metalness: 0.2, opacityMultiplier: 0.75 });
      expect(standard(clone.root).color.getHexString()).toBe("2468ac"); expect(standard(clone.root).roughness).toBe(0.37);
      for (const root of [loaded.root, sibling.root]) {
        const material = standard(root);
        expect(material.color.toArray()).toEqual(new Color(COLOR).toArray());
        expect(material.roughness).toBe(1); expect(material.metalness).toBe(0); expect(material.emissive.getHex()).toBe(0);
        expect(material.opacity).toBe(1); expect(material.side).toBe(FrontSide); expect(material.polygonOffset).toBe(true);
        expect(material.polygonOffsetFactor).toBe(1); expect(material.polygonOffsetUnits).toBe(1);
      }
      const read = value(readStudioBg3dPrimitiveEditAuthoringGlb(bytes));
      expect(read.envelope.sourceMaterialAtExport).toEqual({ kind: "plain-box-v1", colorSrgb: COLOR });
      expect(read.envelope).toEqual(source.envelope);
    } finally { clone.dispose(); sibling.dispose(); loaded.dispose(); }
  });
});
