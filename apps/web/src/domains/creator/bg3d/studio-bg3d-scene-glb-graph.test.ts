import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectStudioBg3dThreeJoints, collectStudioBg3dThreeMorphTargets, loadVerifiedStudioBg3dGlbWithThree } from "../studio-background-3d-model";
import { makeGeometry } from "../studio-background-3d-primitives";
import { readStudioVrmExportGlb, writeStudioVrmExportGlb } from "../vrm/studio-vrm-export-glb-container";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, validateStudioBg3dGlb } from "./studio-bg3d-glb-validation";
import { clearStudioBg3dCc0PbrTextureCache, loadStudioBg3dCc0PbrTextureSet, setStudioBg3dCc0PbrTextureFactoryForTest } from "./studio-bg3d-cc0-pbr-texture-loader";
import { buildStudioBg3dCc0SurfaceMaterialOverride } from "./studio-bg3d-cc0-surface-material-catalog";
import { DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE, STUDIO_BG3D_PRIMITIVE_KINDS, type StudioBg3dModelNode, type StudioBg3dPrimitiveNode, type StudioBg3dSceneDocument } from "./studio-bg3d-scene-document-types";
import { buildStudioBg3dSceneGlbGraph, type StudioBg3dSceneGlbGraphResult, type StudioBg3dSceneGlbModelRoot } from "./studio-bg3d-scene-glb-graph";
import { createSceneGlbFixture, disposeSceneGlbFixtures } from "./studio-bg3d-scene-glb.test-fixture";

class ExportFileReader {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) { void blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.(); }, () => this.onerror?.()); }
}
const cleanups: (() => void)[] = [];
beforeEach(() => vi.stubGlobal("FileReader", ExportFileReader));
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); disposeSceneGlbFixtures(); setStudioBg3dCc0PbrTextureFactoryForTest(null); clearStudioBg3dCc0PbrTextureCache(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function success(result: StudioBg3dSceneGlbGraphResult) {
  if (!result.ok) throw Error(`${result.code}: ${result.reason}`); cleanups.push(result.dispose); return result;
}
function node(root: THREE.Object3D, id: string): THREE.Object3D {
  let result: THREE.Object3D | undefined;
  root.traverse((object) => { const marker: unknown = object.userData.toonstudioSceneNode;
    if (marker && typeof marker === "object" && "id" in marker && marker.id === id) result = object;
  });
  if (!result) throw Error(`출력 노드 ${id} 필요`); return result;
}
function meshes(root: THREE.Object3D): THREE.Mesh[] { const result: THREE.Mesh[] = []; root.traverse((object) => { if (object instanceof THREE.Mesh) result.push(object); }); return result; }
function mesh(root: THREE.Object3D): THREE.Mesh { const result = meshes(root)[0]; if (!result) throw Error("실제 메시 필요"); return result; }
function standard(root: THREE.Object3D): THREE.MeshStandardMaterial {
  const material = mesh(root).material; if (!(material instanceof THREE.MeshStandardMaterial)) throw Error("단일 PBR 재질 필요"); return material;
}
function sameMatrix(a: THREE.Matrix4, b: THREE.Matrix4) { a.elements.forEach((value, index) => expect(value).toBeCloseTo(b.elements[index], 11)); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function record(value: unknown): Record<string, unknown> { if (!isRecord(value)) throw Error("객체 필요"); return value; }
async function fixture() {
  const f = await createSceneGlbFixture(), document = f.runtime.current.document;
  const primitive = document.nodes.find((value): value is StudioBg3dPrimitiveNode => value.kind === "primitive");
  const model = document.nodes.find((value): value is StudioBg3dModelNode => value.kind === "model");
  if (!primitive || !model || !f.entry || !f.record) throw Error("실제 원본 fixture 필요");
  const source: StudioBg3dSceneGlbModelRoot = { root: f.entry.root, animations: f.entry.animations, sourceBytes: new Uint8Array(await f.record.blob.arrayBuffer()) };
  return { ...f, document, primitive, model, source, modelRoots: new Map([[model.attachmentId, source]]) };
}
async function sourceFromScene(root: THREE.Object3D, animations: THREE.AnimationClip[], document: StudioBg3dSceneDocument) {
  const exported = await new GLTFExporter().parseAsync(root, { binary: true, animations, onlyVisible: false, includeCustomExtensions: true });
  if (!(exported instanceof ArrayBuffer)) throw Error("실제 binary exporter 필요");
  const bytes = new Uint8Array(exported), digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash: `sha256:${string}` = `sha256:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")}`;
  const verified = await validateStudioBg3dGlb(bytes, { profile: "desktop", budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
    declared: { sha256: hash, byteSize: bytes.byteLength, mimeType: "model/gltf-binary" }, cumulative: { usedBytes: 0, maximumBytes: 100 * 1024 * 1024 } });
  if (!verified.ok) throw Error(verified.code);
  const loaded = await loadVerifiedStudioBg3dGlbWithThree(verified, document.budgets); if (!loaded.ok) throw Error(loaded.code);
  cleanups.push(loaded.dispose);
  return { source: { root: loaded.root, animations: loaded.animations, sourceBytes: bytes }, hash, byteSize: bytes.byteLength };
}
async function rigFixture() {
  const f = await fixture(), root = new THREE.Group(), geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0.2, 1, 0, 0, 2, 0], 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0], 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  geometry.setIndex([0, 1, 2]); geometry.morphTargetsRelative = true;
  const morph = new THREE.Float32BufferAttribute([0, 0, 0.2, 0, 0, 0.2, 0, 0, 0.2], 3); morph.name = "깜박임"; geometry.morphAttributes.position = [morph];
  const material = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3 });
  const skin = new THREE.SkinnedMesh(geometry, material); skin.name = "동일한 메시 이름";
  const bones = [new THREE.Bone(), new THREE.Bone(), new THREE.Bone()]; bones.forEach((bone, index) => { bone.name = `관절${index}`; });
  const [upper, middle, end] = bones; if (!upper || !middle || !end) throw Error("관절 필요");
  middle.position.y = 1; end.position.y = 1; upper.add(middle); middle.add(end); skin.add(upper); root.add(skin);
  skin.bind(new THREE.Skeleton(bones)); if (!skin.morphTargetInfluences) throw Error("morph 필요"); skin.morphTargetInfluences[0] = 0.1;
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const clip = new THREE.AnimationClip("원본 동작", 1, [new THREE.QuaternionKeyframeTrack(`${middle.uuid}.quaternion`, [0, 1], [0, 0, 0, 1, ...q.toArray()]),
    new THREE.NumberKeyframeTrack(`${skin.uuid}.morphTargetInfluences`, [0, 1], [0.1, 0.5])]);
  const loaded = await sourceFromScene(root, [clip], f.document); geometry.dispose(); material.dispose();
  const document = { ...f.document, nodes: [f.model], attachments: f.document.attachments.map((attachment) => ({ ...attachment, hash: loaded.hash, byteSize: loaded.byteSize })) };
  return { ...f, ...loaded, document, modelRoots: new Map([[f.model.attachmentId, loaded.source]]) };
}

describe("실제 현재 장면의 독립 geometry/material 그래프", () => {
  it("모든 13종 도형을 runtime makeGeometry와 동일한 위치·법선·인덱스로 만든다", async () => {
    const f = await fixture(), nodes = STUDIO_BG3D_PRIMITIVE_KINDS.map((primitiveKind, index) => ({ ...f.primitive,
      id: `primitive-${index}`, primitiveKind, transform: { position: [index * 2, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } } satisfies StudioBg3dPrimitiveNode));
    const graph = success(await buildStudioBg3dSceneGlbGraph({ document: { ...f.document, nodes, attachments: [] }, modelRoots: new Map() }));
    for (const primitive of nodes) {
      const actual = mesh(node(graph.scene, primitive.id)).geometry, expected = makeGeometry(primitive.primitiveKind);
      expect(actual.getAttribute("position").array).toEqual(expected.getAttribute("position").array);
      expect(actual.getAttribute("normal").array).toEqual(expected.getAttribute("normal").array); expect(actual.index?.array).toEqual(expected.index?.array);
      expected.dispose();
    }
    expect(graph.scene.children).toHaveLength(STUDIO_BG3D_PRIMITIVE_KINDS.length); expect(graph.sourceMetadata).toEqual([]);
  });
  it("부모 local TRS·유효 태그 숨김을 적용하며 모델 cache k를 한 번만 유지한다", async () => {
    const f = await fixture(), parent = f.primitive, child = { ...f.model, parentId: parent.id };
    const hidden = { ...parent, id: "hidden-parent", tags: ["미표시"] }, hiddenChild = { ...child, id: "hidden-child", parentId: hidden.id };
    const document = { ...f.document, nodes: [parent, child, hidden, hiddenChild], meta: { hiddenTags: ["미표시"] } };
    const graph = success(await buildStudioBg3dSceneGlbGraph({ document, modelRoots: f.modelRoots }));
    const actual = node(graph.scene, child.id), sourceClone = actual.children[0]; if (!sourceClone) throw Error("캐시 root 복제 필요");
    expect(actual.parent).toBe(node(graph.scene, parent.id)); expect(sourceClone.scale.toArray()).toEqual(f.source.root.scale.toArray());
    const expected = new THREE.Group(); expected.position.fromArray(parent.transform.position); expected.rotation.fromArray([...parent.transform.rotation, "XYZ"]); expected.scale.fromArray(parent.transform.scale);
    const expectedChild = new THREE.Group(); expectedChild.position.fromArray(child.transform.position); expectedChild.rotation.fromArray([...child.transform.rotation, "XYZ"]); expectedChild.scale.fromArray(child.transform.scale);
    expected.add(expectedChild); expectedChild.add(f.source.root.clone(true)); expected.updateMatrixWorld(true);
    sameMatrix(mesh(actual).matrixWorld, mesh(expectedChild).matrixWorld); expect(graph.hiddenNodeIds).toEqual([hidden.id, hiddenChild.id]);
  });
  it("현재 override와 cache 원본을 분리하고 geometry/material/texture/runtime metadata를 정리한다", async () => {
    const f = await fixture(), originalMesh = mesh(f.source.root), originalMaterial = standard(f.source.root);
    const image = { data: new Uint8Array([13, 71, 205, 255]), width: 1, height: 1 }, texture = new THREE.DataTexture(image.data, 1, 1);
    texture.center.set(0.5, 0.5); texture.rotation = 0.2; texture.offset.set(0.13, -0.2); texture.repeat.set(-0.7, 0.7);
    const sourceMatrix = texture.matrix.toArray(), expectedUv = new THREE.Matrix3().setUvTransform(0.13, -0.2, -0.7, 0.7, 0.2, 0.5, 0.5);
    texture.needsUpdate = true; texture.userData = { mimeType: "image/jpeg", runtimeToken: "private-cache-value" }; originalMaterial.map = texture;
    f.source.root.userData.runtimeToken = "private-cache-value"; originalMesh.geometry.userData.storageModelId = "private-cache-key";
    originalMaterial.userData.runtimeToken = "private-cache-value";
    const initial = { sourceVersion: texture.source.version, textureVersion: texture.version, materialVersion: originalMaterial.version, data: [...image.data] };
    const disposeGeo = vi.spyOn(originalMesh.geometry, "dispose"), disposeMaterial = vi.spyOn(originalMaterial, "dispose"), disposeTexture = vi.spyOn(texture, "dispose");
    const model = { ...f.model, materialOverride: { ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE, color: "#64a8e2", colorMode: "replace", roughness: 0.23, metalness: 0.7 } } satisfies StudioBg3dModelNode;
    const graph = success(await buildStudioBg3dSceneGlbGraph({ document: { ...f.document, nodes: [model] }, modelRoots: f.modelRoots }));
    const ownedMesh = mesh(graph.scene), ownedMaterial = standard(graph.scene), ownedTexture = ownedMaterial.map; if (!ownedTexture) throw Error("독립 텍스처 필요");
    expect(ownedMesh.geometry).not.toBe(originalMesh.geometry); expect(ownedMaterial).not.toBe(originalMaterial); expect(ownedTexture).not.toBe(texture);
    expect(ownedTexture).toBeInstanceOf(THREE.DataTexture); expect(ownedTexture.source).not.toBe(texture.source); expect(ownedTexture.image).toBe(texture.image);
    expect(ownedTexture.userData).toEqual({ mimeType: "image/png" }); expect(ownedMaterial.roughness).toBe(0.23); expect(ownedMaterial.metalness).toBe(0.7);
    expect(ownedTexture.center.toArray()).toEqual([0, 0]); ownedTexture.matrix.elements.forEach((value, index) => expect(value).toBeCloseTo(expectedUv.elements[index], 13));
    expect(texture.center.toArray()).toEqual([0.5, 0.5]); expect(texture.matrix.toArray()).toEqual(sourceMatrix);
    expect(ownedMaterial.color.getHexString()).toBe("64a8e2"); expect(originalMaterial.roughness).toBe(1); expect(originalMaterial.metalness).toBe(0);
    expect(ownedMesh.geometry.userData).toEqual({}); expect(JSON.stringify(graph.scene.toJSON())).not.toContain("private-cache-value");
    expect(texture.source.version).toBe(initial.sourceVersion); expect(texture.version).toBe(initial.textureVersion); expect(originalMaterial.version).toBe(initial.materialVersion);
    const disposeOwnedGeometry = vi.spyOn(ownedMesh.geometry, "dispose"), disposeOwnedMaterial = vi.spyOn(ownedMaterial, "dispose"), disposeOwnedTexture = vi.spyOn(ownedTexture, "dispose");
    graph.dispose(); graph.dispose(); expect(disposeOwnedGeometry).toHaveBeenCalledTimes(1); expect(disposeOwnedMaterial).toHaveBeenCalledTimes(1); expect(disposeOwnedTexture).toHaveBeenCalledTimes(1);
    expect(disposeGeo).not.toHaveBeenCalled(); expect(disposeMaterial).not.toHaveBeenCalled(); expect(disposeTexture).not.toHaveBeenCalled(); expect([...image.data]).toEqual(initial.data);
    originalMaterial.map = null; texture.dispose();
  });
  it("원본 extras·extension을 별도 metadata에 보존하고 같은 source는 한 번만 담는다", async () => {
    const f = await fixture(), container = readStudioVrmExportGlb(f.source.sourceBytes);
    const scenes = container.json.scenes; if (!Array.isArray(scenes)) throw Error("원본 scene 필요");
    record(scenes[0]).extras = { originalAuthoring: { precision: 0.123456789012345, source: "자기 제작" } };
    const bytes = writeStudioVrmExportGlb(container), digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash: `sha256:${string}` = `sha256:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")}`;
    const document = { ...f.document, nodes: [f.model, { ...f.model, id: "second-instance" }], attachments: f.document.attachments.map((attachment) => ({ ...attachment, hash, byteSize: bytes.byteLength })) };
    const graph = success(await buildStudioBg3dSceneGlbGraph({ document, modelRoots: new Map([[f.model.attachmentId, { ...f.source, sourceBytes: bytes }]]) }));
    expect(graph.sourceMetadata).toHaveLength(1); expect(graph.sourceMetadata[0]).toMatchObject({ attachmentHash: hash, metadata: { format: "toonstudio.original-glb-metadata", version: 1,
      indexed: { scenes: [{ index: 0, extras: { originalAuthoring: { precision: 0.123456789012345 } } }] } } });
    expect(graph.scene.userData).toEqual({}); expect(JSON.stringify(node(graph.scene, f.model.id).userData)).not.toContain("originalAuthoring");
  });
  it("primitive의 실제 CC0 PBR cache도 독립 Source로 분리하고 URL·내부정보를 내보내지 않는다", async () => {
    const f = await fixture();
    setStudioBg3dCc0PbrTextureFactoryForTest((url) => { const texture = new THREE.DataTexture(new Uint8Array([128, 96, 64, 255]), 1, 1); texture.name = url;
      texture.center.set(0.5, 0.5); texture.rotation = 0.2; texture.offset.set(-0.1, 0.3); return texture; });
    const cached = loadStudioBg3dCc0PbrTextureSet("polyhaven-wood-floor"); if (!cached) throw Error("실제 PBR cache 필요");
    const before = cached.baseColorMap.source.version, disposeCache = vi.spyOn(cached.baseColorMap, "dispose");
    const materialOverride = buildStudioBg3dCc0SurfaceMaterialOverride("polyhaven-wood-floor"); if (!materialOverride) throw Error("실제 PBR override 필요");
    const primitive = { ...f.primitive, materialOverride };
    const graph = success(await buildStudioBg3dSceneGlbGraph({ document: { ...f.document, nodes: [primitive], attachments: [] }, modelRoots: new Map() }));
    const material = standard(graph.scene); if (!material.map || !material.roughnessMap || !material.normalMap || !material.aoMap) throw Error("실제 4채널 필요");
    expect(material.map).not.toBe(cached.baseColorMap); expect(material.map.source).not.toBe(cached.baseColorMap.source);
    expect(material.map.image).toBe(cached.baseColorMap.image); material.map.repeat.toArray().forEach((value, index) => expect(value).toBeCloseTo(cached.baseColorMap.repeat.toArray()[index], 13));
    expect(material.map.colorSpace).toBe(THREE.SRGBColorSpace); expect(material.roughnessMap.colorSpace).toBe(THREE.NoColorSpace);
    expect(material.map.name).toBe(""); expect(material.map.userData).toEqual({ mimeType: "image/png" });
    for (const [actual, original] of [[material.map, cached.baseColorMap], [material.roughnessMap, cached.roughnessMap], [material.normalMap, cached.normalMap], [material.aoMap, cached.aoMap]]) {
      if (!actual || !original) throw Error("4개 독립 map 필요");
      const expected = new THREE.Matrix3().setUvTransform(original.offset.x, original.offset.y, original.repeat.x, original.repeat.y, original.rotation, original.center.x, original.center.y);
      expect(actual.center.toArray()).toEqual([0, 0]); actual.matrix.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index], 13));
      expect(original.center.toArray()).toEqual([0.5, 0.5]);
    }
    const exporterCopy = material.map.clone(); exporterCopy.dispose();
    graph.dispose(); expect(disposeCache).not.toHaveBeenCalled(); expect(cached.baseColorMap.source.version).toBe(before);
  });
  it("실제 exporter→strict 검증→loader의 skin/morph/clip을 인스턴스별 현재 시각·가산 포즈로 보존한다", async () => {
    const f = await rigFixture(), joints = collectStudioBg3dThreeJoints(f.source.root), targets = collectStudioBg3dThreeMorphTargets(f.source.root);
    const joint = joints[1], target = targets[0]; if (!joint || !target) throw Error("실제 관절/morph 필요");
    const offset = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 8);
    const first: StudioBg3dModelNode = { ...f.model, animation: { clipIndex: 0, playing: true, loop: "once", timeSeconds: 0, timeScale: 1, weight: 1 },
      pose: { enabled: true, weight: 1, joints: [{ jointKey: joint.key, rotationOffset: offset.toArray() }] },
      morph: { enabled: true, weight: 0.5, targets: [{ targetKey: target.key, weightOffset: 0.25 }] } };
    const second = { ...first, id: "second-instance", pose: undefined, morph: undefined };
    const graph = success(await buildStudioBg3dSceneGlbGraph({ document: { ...f.document, nodes: [first, second] }, modelRoots: f.modelRoots,
      animationTimeSecondsByNodeId: new Map([[first.id, 0.5], [second.id, 0.75]]) }));
    const a = mesh(node(graph.scene, first.id)), b = mesh(node(graph.scene, second.id));
    if (!(a instanceof THREE.SkinnedMesh) || !(b instanceof THREE.SkinnedMesh)) throw Error("독립 skeleton 필요");
    const boneA = a.skeleton.bones[1], boneB = b.skeleton.bones[1]; if (!boneA || !boneB) throw Error("중간 관절 필요");
    expect(boneA).not.toBe(boneB); expect(boneA.quaternion.clone().normalize().angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 3 * Math.PI / 8))).toBeLessThan(1e-6);
    expect(boneB.quaternion.clone().normalize().angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 3 * Math.PI / 8))).toBeLessThan(1e-6);
    expect(a.morphTargetInfluences?.[0]).toBeCloseTo(0.425, 6); expect(b.morphTargetInfluences?.[0]).toBeCloseTo(0.4, 6);
    expect(mesh(f.source.root).morphTargetInfluences?.[0]).toBeCloseTo(0.1, 6);
    expect(graph.animations).toHaveLength(2); expect(graph.animations[0]?.tracks[0]?.name).not.toBe(graph.animations[1]?.tracks[0]?.name);
    expect(graph.animationState).toEqual([{ nodeId: first.id, sampledTimeSeconds: 0.5, clipCount: 1, playback: "original-clips-retargeted", composedPlaybackBaked: false },
      { nodeId: second.id, sampledTimeSeconds: 0.75, clipCount: 1, playback: "original-clips-retargeted", composedPlaybackBaked: false }]);
  });
  it("현재 실행 시각·대상 binding 없는 동작은 노드 ID와 함께 명시 실패한다", async () => {
    const f = await rigFixture(), playing = { ...f.model, animation: { clipIndex: 0, playing: true, loop: "once", timeSeconds: 0, timeScale: 1, weight: 1 } } satisfies StudioBg3dModelNode;
    expect(await buildStudioBg3dSceneGlbGraph({ document: { ...f.document, nodes: [playing] }, modelRoots: f.modelRoots }))
      .toMatchObject({ ok: false, code: "animation-unavailable", nodeIds: [playing.id], reason: "current-animation-time-missing" });
    const invalid = { ...f.source, animations: [new THREE.AnimationClip("누락", 1, [new THREE.NumberKeyframeTrack("없는대상.opacity", [0, 1], [0, 1])])] };
    expect(await buildStudioBg3dSceneGlbGraph({ document: f.document, modelRoots: new Map([[f.model.attachmentId, invalid]]) }))
      .toMatchObject({ ok: false, code: "animation-unavailable", nodeIds: [f.model.id], reason: "animation-target-missing" });
  });
  it("현재 조인트 제약을 runtime solver로 적용하고 해석 불가한 대상은 실패한다", async () => {
    const f = await rigFixture(), joint = collectStudioBg3dThreeJoints(f.source.root)[1]; if (!joint) throw Error("관절 필요");
    const model: StudioBg3dModelNode = { ...f.model, transform: { position: [3, 2, 1], rotation: [0, 0, 0], scale: [1, 1, 1] },
      constraints: { enabled: true, twoBoneIks: [], aims: [{ jointKey: joint.key, target: [2, 1, 0], axis: "+y", weight: 1 }] } };
    const graph = success(await buildStudioBg3dSceneGlbGraph({ document: { ...f.document, nodes: [model] }, modelRoots: f.modelRoots }));
    const skin = mesh(graph.scene); if (!(skin instanceof THREE.SkinnedMesh)) throw Error("실제 skeleton 필요");
    const middle = skin.skeleton.bones[1]; if (!middle) throw Error("중간 관절 필요");
    const sourceRoot = node(graph.scene, model.id).children[0]; if (!sourceRoot) throw Error("모델 root 필요");
    const targetWorld = new THREE.Vector3(2, 1, 0).applyMatrix4(sourceRoot.matrixWorld);
    const actualAxis = new THREE.Vector3(0, 1, 0).transformDirection(middle.matrixWorld);
    expect(actualAxis.dot(targetWorld.sub(middle.getWorldPosition(new THREE.Vector3())).normalize())).toBeCloseTo(1, 8);
    const broken = { ...model, constraints: { enabled: true, twoBoneIks: [], aims: [{ jointKey: "skin-0:joint-99", target: [2, 1, 0], axis: "+y", weight: 1 }] } } satisfies StudioBg3dModelNode;
    expect(await buildStudioBg3dSceneGlbGraph({ document: { ...f.document, nodes: [broken] }, modelRoots: f.modelRoots }))
      .toMatchObject({ ok: false, code: "animation-unavailable", nodeIds: [model.id], reason: "constraint-solve-unavailable" });
  });
  it("페인트 canvas가 없는 환경과 실제 모델의 누락 UV 대상은 획을 버리고 성공하지 않는다", async () => {
    const f = await fixture(), paint = { version: 1, strokes: [{ color: "#ff0000", size: 0.2, opacity: 1, points: [[0.25, 0.5]] }] } as const;
    const primitive = { ...f.primitive, texturePaint: paint };
    expect(await buildStudioBg3dSceneGlbGraph({ document: { ...f.document, nodes: [primitive], attachments: [] }, modelRoots: new Map() }))
      .toMatchObject({ ok: false, code: "paint-unavailable", nodeIds: [primitive.id] });
    const model = { ...f.model, modelTexturePaint: { version: 1, targets: [{ targetKey: "mesh-99", paint }] } } satisfies StudioBg3dModelNode;
    expect(await buildStudioBg3dSceneGlbGraph({ document: { ...f.document, nodes: [model] }, modelRoots: f.modelRoots }))
      .toMatchObject({ ok: false, code: "paint-unavailable", nodeIds: [model.id], reason: "paint-target-missing" });
  });
  it("wireframe Mesh는 손상된 LINES로 저장하지 않고 원래 LineSegments는 유지한다", async () => {
    const f = await fixture(); standard(f.source.root).wireframe = true;
    expect(await buildStudioBg3dSceneGlbGraph({ document: { ...f.document, nodes: [f.model] }, modelRoots: f.modelRoots }))
      .toMatchObject({ ok: false, code: "unsupported-feature", nodeIds: [f.model.id], reason: "wireframe-mesh-requires-edge-indices" });
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 2, 3)]), lineMaterial = new THREE.LineBasicMaterial({ color: "#ab3723" });
    const line = new THREE.LineSegments(lineGeometry, lineMaterial), source = await sourceFromScene(line, [], f.document);
    const document = { ...f.document, nodes: [f.model], attachments: f.document.attachments.map((attachment) => ({ ...attachment, hash: source.hash, byteSize: source.byteSize })) };
    const graph = success(await buildStudioBg3dSceneGlbGraph({ document, modelRoots: new Map([[f.model.attachmentId, source.source]]) }));
    let lines = 0; graph.scene.traverse((object) => { if (object instanceof THREE.LineSegments) { lines++; expect(object.geometry.getAttribute("position").count).toBe(2); } });
    expect(lines).toBe(1); lineGeometry.dispose(); lineMaterial.dispose();
  });
  it("instanced morph는 원본 Source.version을 바꾸기 전에 거부한다", async () => {
    const f = await fixture(), instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 1);
    instanced.morphTexture = new THREE.DataTexture(new Float32Array([1, 0]), 2, 1, THREE.RedFormat, THREE.FloatType);
    const texture = instanced.morphTexture, version = texture.source.version;
    const result = await buildStudioBg3dSceneGlbGraph({ document: { ...f.document, nodes: [f.model] }, modelRoots: new Map([[f.model.attachmentId, { ...f.source, root: instanced }]]) });
    expect(result).toMatchObject({ ok: false, code: "unsupported-feature", nodeIds: [f.model.id], reason: "instanced-morph-texture-not-exported" });
    expect(texture.source.version).toBe(version); instanced.dispose(); instanced.geometry.dispose(); if (!Array.isArray(instanced.material)) instanced.material.dispose();
  });
  it("RGBA float 데이터는 PNG byte로 잘못 저장하지 않는다", async () => {
    const f = await fixture(), material = standard(f.source.root), texture = new THREE.DataTexture(new Float32Array([0.3, 0.5, 0.7, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    material.map = texture;
    expect(await buildStudioBg3dSceneGlbGraph({ document: { ...f.document, nodes: [f.model] }, modelRoots: f.modelRoots }))
      .toMatchObject({ ok: false, code: "unsupported-feature", nodeIds: [f.model.id], reason: "data-texture-storage-not-exported" });
    material.map = null; texture.dispose();
  });
  it("수동 shear UV는 개인 정점 UV에 굽고 cache 행렬·UV·Source를 유지한다", async () => {
    const f = await fixture(), geometry = new THREE.BoxGeometry(), initialMaterial = new THREE.MeshStandardMaterial();
    const loaded = await sourceFromScene(new THREE.Mesh(geometry, initialMaterial), [], f.document);
    geometry.dispose(); initialMaterial.dispose();
    const document = { ...f.document, nodes: [f.model], attachments: f.document.attachments.map((attachment) => ({ ...attachment, hash: loaded.hash, byteSize: loaded.byteSize })) };
    const material = standard(loaded.source.root), texture = new THREE.DataTexture(new Uint8Array([1, 2, 3, 255]), 1, 1);
    texture.matrixAutoUpdate = false; texture.matrix.set(1, 0.2, 0.3, 0, 1, 0.4, 0, 0, 1); material.map = texture;
    const original = texture.matrix.toArray(), version = texture.source.version;
    const sourceUv = mesh(loaded.source.root).geometry.getAttribute("uv"); if (!sourceUv) throw Error("실제 GLB의 UV 필요");
    const uvBefore = Array.from(sourceUv.array);
    const graph = success(await buildStudioBg3dSceneGlbGraph({ document, modelRoots: new Map([[f.model.attachmentId, loaded.source]]) }));
    const output = mesh(graph.scene), map = standard(graph.scene).map; if (!map) throw Error("개인 map 필요");
    const actual = output.geometry.getAttribute(map.channel === 0 ? "uv" : `uv${map.channel}`);
    for (let index = 0; index < sourceUv.count; index++) {
      const expected = new THREE.Vector2(sourceUv.getX(index), sourceUv.getY(index)).applyMatrix3(texture.matrix);
      expect(actual.getX(index)).toBeCloseTo(expected.x, 6); expect(actual.getY(index)).toBeCloseTo(expected.y, 6);
    }
    expect(map.matrix.equals(new THREE.Matrix3())).toBe(true); expect(Array.from(sourceUv.array)).toEqual(uvBefore);
    expect(texture.matrix.toArray()).toEqual(original); expect(texture.matrixAutoUpdate).toBe(false); expect(texture.source.version).toBe(version);
    material.map = null; texture.dispose();
  });
  it("서로 다른 metal/rough map을 한 sampler로 손상시키지 않고 공유 ORM은 보존한다", async () => {
    const f = await fixture(), material = standard(f.source.root);
    const metal = new THREE.DataTexture(new Uint8Array([17, 53, 209, 64]), 1, 1);
    const rough = new THREE.DataTexture(new Uint8Array([103, 167, 71, 128]), 1, 1);
    material.metalnessMap = metal; material.roughnessMap = rough;
    const versions = [metal.source.version, rough.source.version];
    const originalDisposals = [vi.spyOn(metal, "dispose"), vi.spyOn(rough, "dispose")];
    // 같은 UV라도 stock canvas 합성이 alpha와 색 변환을 바꿀 수 있으므로 개인 packing 전에는 실패한다.
    expect(await buildStudioBg3dSceneGlbGraph({ document: { ...f.document, nodes: [f.model] }, modelRoots: f.modelRoots }))
      .toMatchObject({ ok: false, code: "unsupported-feature", nodeIds: [f.model.id], reason: "separate-metal-rough-textures-require-owned-packing" });
    rough.channel = 1; rough.repeat.set(2, 2); rough.flipY = !metal.flipY;
    expect(await buildStudioBg3dSceneGlbGraph({ document: { ...f.document, nodes: [f.model] }, modelRoots: f.modelRoots }))
      .toMatchObject({ ok: false, code: "unsupported-feature", reason: "separate-metal-rough-textures-require-owned-packing" });
    material.roughnessMap = metal;
    const graph = success(await buildStudioBg3dSceneGlbGraph({ document: { ...f.document, nodes: [f.model] }, modelRoots: f.modelRoots }));
    const actual = standard(graph.scene);
    expect(actual.metalnessMap).toBe(actual.roughnessMap); expect(actual.metalnessMap).not.toBe(metal);
    graph.dispose(); expect([metal.source.version, rough.source.version]).toEqual(versions);
    for (const dispose of originalDisposals) expect(dispose).not.toHaveBeenCalled();
    material.metalnessMap = null; material.roughnessMap = null; metal.dispose(); rough.dispose();
  });
  it("투명도를 낮춘 cutout의 alpha cutoff를 버리지 않고 명시 실패한다", async () => {
    const f = await fixture(), material = standard(f.source.root);
    material.alphaTest = 0.5;
    const model: StudioBg3dModelNode = { ...f.model, materialOverride: { ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE, opacityMultiplier: 0.4 } };
    expect(await buildStudioBg3dSceneGlbGraph({ document: { ...f.document, nodes: [model] }, modelRoots: f.modelRoots }))
      .toMatchObject({ ok: false, code: "unsupported-feature", nodeIds: [model.id], reason: "blend-with-alpha-cutoff-requires-bake" });
    expect(material.alphaTest).toBe(0.5); expect(material.transparent).toBe(false); expect(material.opacity).toBe(1);
    const graph = success(await buildStudioBg3dSceneGlbGraph({ document: { ...f.document, nodes: [f.model] }, modelRoots: f.modelRoots }));
    expect(standard(graph.scene).alphaTest).toBe(0.5); expect(standard(graph.scene).transparent).toBe(false);
  });
  it("손상 원본·모델 누락·취소는 부분 장면을 성공으로 돌려주지 않는다", async () => {
    const f = await fixture(), corrupted = Uint8Array.from(f.source.sourceBytes); corrupted[corrupted.length - 1] ^= 1;
    expect(await buildStudioBg3dSceneGlbGraph({ document: f.document, modelRoots: new Map([[f.model.attachmentId, { ...f.source, sourceBytes: corrupted }]]) })).toMatchObject({ ok: false, code: "asset-mismatch", nodeIds: [f.model.id] });
    expect(await buildStudioBg3dSceneGlbGraph({ document: f.document, modelRoots: new Map() })).toMatchObject({ ok: false, code: "model-unavailable", nodeIds: [f.model.id] });
    const controller = new AbortController(); controller.abort();
    expect(await buildStudioBg3dSceneGlbGraph({ document: f.document, modelRoots: f.modelRoots, signal: controller.signal })).toMatchObject({ ok: false, code: "aborted" });
  });
});
