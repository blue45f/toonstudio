import { Box3, Group, Matrix4, Mesh, Object3D, OrthographicCamera, PerspectiveCamera } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStudioVrmExportGlb, writeStudioVrmExportGlb } from "../vrm/studio-vrm-export-glb-container";
import { createStudioBg3dSceneGlbArtifact } from "./studio-bg3d-scene-glb-artifact";
import { assertStudioBg3dSceneGlbSourceCurrent, captureStudioBg3dSceneGlbSource } from "./studio-bg3d-scene-glb-source";
import { createSceneGlbFixture, disposeSceneGlbFixtures, emptySceneGlbFixtureBundleCatalog } from "./studio-bg3d-scene-glb.test-fixture";
import { calculateStudioBg3dThreeWorldMatrix } from "./studio-bg3d-three-hierarchy";
import { validateStudioBg3dGlb } from "./studio-bg3d-glb-validation";
import { resetStudioBg3dBundleThemePacksCache } from "./studio-bg3d-bundle-theme-packs";

class ExportFileReader {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) { void blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.(); }, () => this.onerror?.()); }
}
beforeEach(() => {
  resetStudioBg3dBundleThemePacksCache(); vi.stubGlobal("FileReader", ExportFileReader);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(emptySceneGlbFixtureBundleCatalog()))));
});
afterEach(() => { disposeSceneGlbFixtures(); resetStudioBg3dBundleThemePacksCache(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function record(value: unknown): Record<string, unknown> { if (!isRecord(value)) throw Error("JSON 객체 필요"); return value; }
function exportedNode(scene: Object3D, id: string): Object3D {
  let found: Object3D | undefined;
  scene.traverse((object) => { const marker: unknown = object.userData.toonstudioSceneNode; if (typeof marker === "object" && marker !== null && "id" in marker && marker.id === id) found = object; });
  if (!found) throw Error(`실제 출력 노드 ${id} 필요`); return found;
}
function sameMatrix(actual: Matrix4, expected: Matrix4) { actual.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index], 11)); }
function sameBounds(actual: Box3, expected: Box3) { for (const key of ["min", "max"] as const) actual[key].toArray().forEach((value, index) => expect(value).toBeCloseTo(expected[key].toArray()[index], 6)); }

describe("현재 사용자 장면의 실제 GLB artifact 왕복", () => {
  it("부모의 비균일 TRS·자식 모델의 캐시 k·재질·권리·현재 직교 구도를 실제 파일에 보존한다", async () => {
    const f = await createSceneGlbFixture();
    const model = f.models[0], entry = f.entry;
    if (!model || !entry || !f.record) throw Error("실제 모델 fixture 필요");
    model.parentId = f.primitive.id; model.position = [1.25, 0.4, -2]; model.rotation = [0.13, -0.4, 0.22]; f.refresh();
    const signal = new AbortController().signal;
    const source = captureStudioBg3dSceneGlbSource(f.host, signal);
    const originalDocument = JSON.stringify(f.runtime.current.document), originalBlob = await f.record.blob.arrayBuffer();
    const originalRoot = entry.root.matrixWorld.toArray(), geometryDisposals: ReturnType<typeof vi.fn>[] = [];
    entry.root.traverse((node) => { if (node instanceof Mesh) geometryDisposals.push(vi.spyOn(node.geometry, "dispose")); });
    const artifact = await createStudioBg3dSceneGlbArtifact(source, { name: "학원/복도", signal, validationBackend: "direct", provenanceAuthority: f.authority,
      assertCurrent: () => assertStudioBg3dSceneGlbSourceCurrent(f.host, source, signal) });
    expect(artifact.fileName).toBe("학원 복도.glb"); expect(artifact.exportedNodeCount).toBe(2); expect(artifact.hiddenNodeCount).toBe(0);
    const actualHash = await crypto.subtle.digest("SHA-256", Uint8Array.from(artifact.bytes));
    expect(artifact.contentHash).toBe(`sha256:${Array.from(new Uint8Array(actualHash), (value) => value.toString(16).padStart(2, "0")).join("")}`);
    const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(artifact.bytes).buffer, ""); gltf.scene.updateMatrixWorld(true);
    const modelNode = exportedNode(gltf.scene, model.id), primitiveNode = exportedNode(gltf.scene, f.primitive.id);
    expect(modelNode.parent).toBe(primitiveNode);
    const expectedWorld = calculateStudioBg3dThreeWorldMatrix([...f.runtime.current.primitives, ...f.runtime.current.customModels], model.id);
    if (!expectedWorld) throw Error("실제 계층 행렬 필요"); sameMatrix(modelNode.matrixWorld, expectedWorld);
    const expected = new Group(); expected.matrix.copy(expectedWorld); expected.matrixAutoUpdate = false;
    expected.add(entry.root.clone(true)); expected.updateMatrixWorld(true);
    sameBounds(new Box3().setFromObject(modelNode), new Box3().setFromObject(expected));
    let meshCount = 0;
    modelNode.traverse((node) => { if (!(node instanceof Mesh)) return; meshCount++; const material = Array.isArray(node.material) ? node.material[0] : node.material;
      expect(material).toMatchObject({ roughness: 1, metalness: 0 }); if (!("color" in material)) throw Error("실제 PBR 색 필요"); });
    expect(meshCount).toBeGreaterThan(0);
    const camera = gltf.cameras[0]; if (!(camera instanceof OrthographicCamera)) throw Error("직교 카메라 필요");
    expect(camera.top - camera.bottom).toBe(4); expect(camera.right - camera.left).toBeCloseTo(64 / 9, 12);
    const json = readStudioVrmExportGlb(artifact.bytes).json;
    expect(record(json.asset).copyright).toBe("시험 원저작자");
    const scenes = json.scenes; if (!Array.isArray(scenes)) throw Error("실제 scene JSON 필요");
    const metadata = record(record(record(scenes[0]).extras).toonstudioSceneExport);
    expect(metadata).toMatchObject({ geometryScope: "effectively-visible", version: 1, units: "meters", upAxis: "Y" });
    expect(record(metadata.sceneDocument)).toMatchObject({ attachments: [{ rights: f.record.rights }] });
    expect(new TextDecoder().decode(artifact.bytes)).not.toContain(f.record.id);
    expect(JSON.stringify(f.runtime.current.document)).toBe(originalDocument); expect(await f.record.blob.arrayBuffer()).toEqual(originalBlob);
    expect(entry.root.matrixWorld.toArray()).toEqual(originalRoot); expect(entry.dispose).not.toHaveBeenCalled();
    for (const dispose of geometryDisposals) expect(dispose).not.toHaveBeenCalled();
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });
  it("숨긴 부모의 자식은 표시 장면에서 함께 제외하고 정본의 숨김 정보는 metadata에 보존한다", async () => {
    const f = await createSceneGlbFixture(), model = f.models[0]; if (!model) throw Error("모델 필요");
    const hidden = { ...f.primitive, id: "hidden-parent", visible: false, locked: false };
    const primitives = [...f.runtime.current.primitives, hidden]; model.parentId = hidden.id;
    f.runtime.current = { ...f.runtime.current, primitives }; f.refresh();
    const signal = new AbortController().signal, source = captureStudioBg3dSceneGlbSource(f.host, signal);
    expect(source.assets.size).toBe(0);
    const artifact = await createStudioBg3dSceneGlbArtifact(source, { name: "숨김 경계", signal, validationBackend: "direct", provenanceAuthority: f.authority, assertCurrent: () => assertStudioBg3dSceneGlbSourceCurrent(f.host, source, signal) });
    expect(artifact.exportedNodeCount).toBe(1); expect(artifact.hiddenNodeCount).toBe(2);
    const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(artifact.bytes).buffer, "");
    expect(() => exportedNode(gltf.scene, model.id)).toThrow(); expect(() => exportedNode(gltf.scene, hidden.id)).toThrow();
    const metadata = record(gltf.scene.userData.toonstudioSceneExport);
    expect(metadata.hiddenNodeIds).toEqual(expect.arrayContaining([hidden.id, model.id]));
    expect(record(metadata.sceneDocument).nodes).toHaveLength(3);
  });
  it("실제 원본 바이트 손상과 비영 렌즈 이동은 성공 파일을 반환하지 않는다", async () => {
    const f = await createSceneGlbFixture(); if (!f.framing.current || !f.entry || !f.record) throw Error("모델·카메라 필요");
    const signal = new AbortController().signal;
    f.framing.current = { ...f.framing.current, view: { ...f.framing.current.view, lensShift: [0.15, 0] } };
    const unsupported = captureStudioBg3dSceneGlbSource(f.host, signal);
    await expect(createStudioBg3dSceneGlbArtifact(unsupported, { name: "예외", signal, validationBackend: "direct", provenanceAuthority: f.authority, assertCurrent: () => undefined })).rejects.toMatchObject({ code: "unsupported-scene" });
    f.framing.current = { ...f.framing.current, view: { ...f.framing.current.view, lensShift: [0, 0] } };
    const source = captureStudioBg3dSceneGlbSource(f.host, signal), corrupted = new Uint8Array(await f.record.blob.arrayBuffer()); corrupted[corrupted.length - 1] ^= 1;
    const brokenEntry = { ...f.entry, record: { ...f.record, blob: new Blob([corrupted], { type: "model/gltf-binary" }) } };
    const changed = { ...source, assets: new Map([...source.assets].map(([key, value]) => [key, { ...value, entry: brokenEntry }])) };
    await expect(createStudioBg3dSceneGlbArtifact(changed, { name: "손상", signal, validationBackend: "direct", provenanceAuthority: f.authority, assertCurrent: () => undefined })).rejects.toBeDefined();
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });
  it("실제 원근 export에서도 zoom을 유효 화각으로 보존한다", async () => {
    const f = await createSceneGlbFixture(false); if (!f.framing.current) throw Error("카메라 필요");
    f.framing.current = { ...f.framing.current, view: { ...f.framing.current.view, projection: "perspective", zoom: 2.5, fovDegrees: 60 } };
    const signal = new AbortController().signal, source = captureStudioBg3dSceneGlbSource(f.host, signal);
    const artifact = await createStudioBg3dSceneGlbArtifact(source, { name: "원근", signal, validationBackend: "direct", provenanceAuthority: f.authority, assertCurrent: () => assertStudioBg3dSceneGlbSourceCurrent(f.host, source, signal) });
    const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(artifact.bytes).buffer, "");
    const camera = gltf.cameras[0]; if (!(camera instanceof PerspectiveCamera)) throw Error("원근 카메라 필요");
    expect(camera.fov * Math.PI / 180).toBeCloseTo(2 * Math.atan(Math.tan(Math.PI / 6) / 2.5), 13);
  });
  it("연결 캐릭터를 조용히 누락하지 않고 단면은 자르기 전 형상과 설정을 구분한다", async () => {
    const f = await createSceneGlbFixture(false), signal = new AbortController().signal;
    f.host.sharedCharacters = [{ id: "linked-character" }];
    expect(() => captureStudioBg3dSceneGlbSource(f.host, signal)).toThrow("캐릭터");
    f.host.sharedCharacters = [];
    f.host.sectionPlane = { enabled: true, axis: "y", offset: 0.3, flip: false };
    const source = captureStudioBg3dSceneGlbSource(f.host, signal);
    const artifact = await createStudioBg3dSceneGlbArtifact(source, { name: "단면 경계", signal, validationBackend: "direct", provenanceAuthority: f.authority, assertCurrent: () => assertStudioBg3dSceneGlbSourceCurrent(f.host, source, signal) });
    const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(artifact.bytes).buffer, "");
    expect(record(gltf.scene.userData.toonstudioSceneExport).sectionPlaneMetadataOnly).toEqual(f.host.sectionPlane);
    expect(new Box3().setFromObject(exportedNode(gltf.scene, f.primitive.id)).max.y).toBeGreaterThan(0.3);
    f.host.sectionPlane = { ...f.host.sectionPlane, offset: 0.8 };
    expect(() => assertStudioBg3dSceneGlbSourceCurrent(f.host, source, signal)).toThrow("상태가 바뀌었습니다");
    expect(f.replace).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
  });

  it("원본 extras의 __proto__ 데이터 키를 카메라·attribution 재기록 뒤에도 보존한다", async () => {
    const f = await createSceneGlbFixture(), signal = new AbortController().signal;
    const source = captureStudioBg3dSceneGlbSource(f.host, signal);
    const asset = [...source.assets.values()][0]; if (!asset) throw Error("실제 검증 원본 필요");
    const extra: unknown = JSON.parse('{"__proto__":{"author":"원본 데이터"},"constructor":{"keep":true}}');
    const original = readStudioVrmExportGlb(new Uint8Array(await asset.entry.record.blob.arrayBuffer()));
    const originalScenes = original.json.scenes; if (!Array.isArray(originalScenes)) throw Error("원본 장면 필요");
    record(originalScenes[0]).extras = extra;
    const input = writeStudioVrmExportGlb(original), digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(input));
    const hash: `sha256:${string}` = `sha256:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")}`;
    const verified = await validateStudioBg3dGlb(input, { profile: source.policy.profile, budgets: source.policy.budgets,
      declared: { byteSize: input.byteLength, sha256: hash, mimeType: "model/gltf-binary" },
      cumulative: { usedBytes: 0, maximumBytes: source.policy.budgets[source.policy.profile].complexity.maxModelBytes } });
    if (!verified.ok) throw Error(verified.code);
    const attachment = { ...asset.attachment, hash, byteSize: input.byteLength };
    const entry = { ...asset.entry, record: { ...asset.entry.record, contentHash: hash, byteSize: input.byteLength,
      validatorMetrics: verified.metrics,
      blob: new Blob([Uint8Array.from(input)], { type: "model/gltf-binary" }) } };
    f.setStoredRecord(entry.record);
    const artifact = await createStudioBg3dSceneGlbArtifact({ ...source,
      document: { ...source.document, attachments: [attachment] },
      assets: new Map([[attachment.id, { ...asset, attachment, entry }]]) },
    { name: "원본 키 보존", signal, validationBackend: "direct", provenanceAuthority: f.authority, assertCurrent: () => undefined });
    const json = readStudioVrmExportGlb(artifact.bytes).json;
    const scenes = json.scenes; if (!Array.isArray(scenes)) throw Error("실제 장면 JSON 필요");
    const metadata = record(record(record(scenes[0]).extras).toonstudioSceneExport);
    const originals = metadata.sourceMetadata; if (!Array.isArray(originals)) throw Error("원본 metadata 필요");
    const indexed = record(record(record(originals[0]).metadata).indexed).scenes;
    if (!Array.isArray(indexed)) throw Error("원본 장면 metadata 필요");
    const restored = record(indexed[0]).extras;
    expect(JSON.stringify(restored)).toBe('{"__proto__":{"author":"원본 데이터"},"constructor":{"keep":true}}');
    expect(record(json.asset).copyright).toBe("시험 원저작자");
    expect(Object.hasOwn(Object.prototype, "author")).toBe(false);
  });

});
