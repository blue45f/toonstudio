import { describe, expect, it } from "vitest";
import {
  applyStudioBg3dShot, captureStudioBg3dShot, createDefaultStudioBg3dSceneDocument,
  migrateStudioBg3dSceneDocument, normalizeStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument, serializeStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import { DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS as SETTINGS, parseStudioBg3dSixPassLtSettings } from "../contracts/studio-bg3d-six-pass-settings";
import { planStudioBg3dLtLayers, STUDIO_BG3D_LT_LAYER_ROLES, type StudioBg3dLtImageElementLike } from "./studio-bg3d-lt-layer-plan";
import type { StudioBg3dSceneDocument } from "./studio-bg3d-scene-document-types";
import type { StudioBackground3DLtLayer } from "../scene-3d/studio-3d-insert-contract";
import { projectStudioBg3dDocumentToScene3d } from "../scene3d/studio-scene3d-bg3d-projection";
import { createStudioScene3dVersionedCut, validateStudioScene3dShotVersionCollection } from "../scene3d/studio-scene3d-shot-versions";

const PNG = "data:image/png;base64,TElORQ==";
function sixPassScene(): StudioBg3dSceneDocument {
  const base = createDefaultStudioBg3dSceneDocument();
  return normalizeStudioBg3dSceneDocument({ ...base, output: { ...base.output, sixPassLt: SETTINGS } });
}

describe("6패스 LT 저장 경계", () => {
  it("6패스가 없는 v3 장면과 직렬화 바이트를 그대로 보존한다", () => {
    const original = createDefaultStudioBg3dSceneDocument();
    const bytes = serializeStudioBg3dSceneDocument(original);
    expect(original.version).toBe(3);
    expect(original.output).not.toHaveProperty("sixPassLt");
    expect(bytes).not.toBeNull();
    expect(serializeStudioBg3dSceneDocument(migrateStudioBg3dSceneDocument(original))).toBe(bytes);
    expect(serializeStudioBg3dSceneDocument(normalizeStudioBg3dSceneDocument(original))).toBe(bytes);
  });

  it("설정이 있는 장면만 v4로 승격하고 같은 설정으로 재열기한다", () => {
    const scene = sixPassScene();
    expect(scene.version).toBe(4);
    const bytes = serializeStudioBg3dSceneDocument(scene);
    expect(bytes).not.toBeNull();
    expect(parseStudioBg3dSceneDocument(bytes ?? "")).toEqual(scene);
    expect(migrateStudioBg3dSceneDocument(scene)).toEqual(scene);
    expect(serializeStudioBg3dSceneDocument({ ...scene, version: 3 })).toBeNull();
    expect(serializeStudioBg3dSceneDocument({ ...createDefaultStudioBg3dSceneDocument(), version: 4 })).toBeNull();
    expect(parseStudioBg3dSceneDocument(JSON.stringify({ ...scene, version: 5 }))).toBeNull();
  });

  it("손상·미래 설정은 저장을 거부하고 이전 LT로 조용히 바꾸지 않는다", () => {
    const scene = sixPassScene();
    for (const sixPassLt of [null, { ...SETTINGS, version: 2 }, { ...SETTINGS, fogFarMeters: SETTINGS.fogNearMeters },
      { ...SETTINGS, shadowOpacity: 1.1 }, { ...SETTINGS, depthFogOpacity: -1 },
      { ...SETTINGS, fogTintHex: "#FED7AA" }, { ...SETTINGS, unknown: true }]) {
      expect(parseStudioBg3dSixPassLtSettings(sixPassLt)).toBeNull();
      expect(serializeStudioBg3dSceneDocument({ ...scene, output: { ...scene.output, sixPassLt } })).toBeNull();
      expect(() => normalizeStudioBg3dSceneDocument({ ...scene, output: { ...scene.output, sixPassLt } })).toThrow();
    }
  });

  it("저장한 컷의 6패스 설정을 왕복하고 재적용한다", () => {
    const captured = captureStudioBg3dShot(sixPassScene(), { id: "shot-six", name: "6패스 컷" });
    expect(captured?.shots?.[0]?.output?.sixPassLt).toEqual(SETTINGS);
    const bytes = serializeStudioBg3dSceneDocument(captured);
    const restored = parseStudioBg3dSceneDocument(bytes ?? "");
    expect(restored).not.toBeNull();
    expect(applyStudioBg3dShot(restored, "shot-six")?.output.sixPassLt).toEqual(SETTINGS);
  });

  it("기존 고정 컷의 v3 원본과 sourceHash를 외부 장면의 v4 승격 뒤에도 그대로 둔다", () => {
    const source = createDefaultStudioBg3dSceneDocument();
    const sourceBytes = serializeStudioBg3dSceneDocument(source);
    const cut = createStudioScene3dVersionedCut({ id: "cut:legacy-six", name: "기존 고정 컷",
      scene: projectStudioBg3dDocumentToScene3d({ documentId: "project:six", source, viewportAspectRatio: 1 }),
      characters: {}, legacyBg3d: source });
    const upgraded = normalizeStudioBg3dSceneDocument({ ...source, pinnedVersionedCut: cut,
      output: { ...source.output, sixPassLt: SETTINGS } });
    const restored = parseStudioBg3dSceneDocument(serializeStudioBg3dSceneDocument(upgraded) ?? "");
    expect(restored?.version).toBe(4);
    expect(restored?.pinnedVersionedCut?.sourceHash).toBe(cut.sourceHash);
    expect(serializeStudioBg3dSceneDocument(restored?.pinnedVersionedCut?.source.legacyBg3d)).toBe(sourceBytes);
    expect(validateStudioScene3dShotVersionCollection({ version: 1, cuts: [restored?.pinnedVersionedCut] }).cuts[0]?.sourceHash).toBe(cut.sourceHash);
  });

  it("6개 이미지와 합성 속성을 원자적으로 만들고 재캡처 때 같은 역할 ID를 재사용한다", () => {
    const scene = sixPassScene();
    const layers: StudioBackground3DLtLayer[] = STUDIO_BG3D_LT_LAYER_ROLES.map((role) => ({
      role, pngDataUrl: PNG, width: 20, height: 10,
      blendMode: role === "shadow" || role === "tone" ? "multiply" : role === "depth" ? "screen" : "normal",
      opacity: role === "shadow" ? SETTINGS.shadowOpacity : role === "depth" ? SETTINGS.depthFogOpacity : 1,
      visible: role !== "depth",
    }));
    const template: StudioBg3dLtImageElementLike<StudioBg3dSceneDocument> = {
      id: "template", type: "image", src: PNG, x: 0, y: 0, width: 20, height: 10,
    };
    const first = planStudioBg3dLtLayers<StudioBg3dLtImageElementLike<StudioBg3dSceneDocument>, StudioBg3dSceneDocument>({ elements: [], groups: [], render: {
      kind: "separated", width: 20, height: 10, layers, bg3dScene: scene,
    }, allocations: { bundleId: "bundle-six", groupId: "group-six",
      elementIds: Object.fromEntries(STUDIO_BG3D_LT_LAYER_ROLES.map((role) => [role, `layer-${role}`])),
    }, newElementTemplate: template });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.code);
    expect(first.layers.map(({ role }) => role)).toEqual(STUDIO_BG3D_LT_LAYER_ROLES);
    expect(first.nextElements).toHaveLength(6);
    expect(first.nextElements.filter((element) => element.bg3dScene)).toHaveLength(1);
    expect(first.nextElements.find((element) => element.bg3dLtRole === "shadow")).toMatchObject({ blendMode: "multiply", opacity: 0.68, hidden: false });
    expect(first.nextElements.find((element) => element.bg3dLtRole === "depth")).toMatchObject({ blendMode: "screen", opacity: 0.32, hidden: true });
    const edited = first.nextElements.map((element) => element.bg3dLtRole === "shadow"
      ? { ...element, hidden: true, opacity: 0.21, blendMode: "screen" } : element);
    const updatedPng = "data:image/png;base64,TkVXUA==";
    const recapturedLayers = layers.map((layer) => ({ ...layer, pngDataUrl: updatedPng }));
    const next = planStudioBg3dLtLayers({ elements: edited, groups: first.nextGroups,
      targetElementId: first.anchorElementId, render: { kind: "separated", width: 20, height: 10, layers: recapturedLayers, bg3dScene: scene } });
    expect(next.ok).toBe(true);
    if (!next.ok) throw new Error(next.code);
    expect(next.layers.map(({ elementId }) => elementId)).toEqual(first.layers.map(({ elementId }) => elementId));
    expect(next.createdElementIds).toEqual([]);
    expect(next.nextElements.find((element) => element.bg3dLtRole === "shadow")).toMatchObject({
      id: "layer-shadow", src: updatedPng, hidden: true, opacity: 0.21, blendMode: "screen",
    });
    const recreated = planStudioBg3dLtLayers({ elements: next.nextElements.filter((element) => element.bg3dLtRole !== "depth"), groups: next.nextGroups,
      targetElementId: next.anchorElementId, render: { kind: "separated", width: 20, height: 10, layers: recapturedLayers, bg3dScene: scene },
      allocations: { elementIds: { depth: "depth-recreated" } }, newElementTemplate: { ...template, src: updatedPng } });
    expect(recreated.ok).toBe(true);
    if (!recreated.ok) throw new Error(recreated.code);
    expect(recreated.createdElementIds).toEqual(["depth-recreated"]);
    expect(recreated.nextElements.find((element) => element.bg3dLtRole === "depth")).toMatchObject({
      id: "depth-recreated", src: updatedPng, hidden: true, opacity: 0.32, blendMode: "screen",
    });
    expect(recreated.nextElements.find((element) => element.bg3dLtRole === "shadow")).toMatchObject({
      id: "layer-shadow", src: updatedPng, hidden: true, opacity: 0.21, blendMode: "screen",
    });
  });
});
