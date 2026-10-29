import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { studioVirtualCampusManifest } from "../studio-virtual-space-campus-world";
import type { StudioVirtualSpaceWorldManifest } from "../studio-virtual-space-world-manifest";
import { createStudioThreeActorLoader } from "./studio-virtual-space-three-actor-loader";
import { loadStudioThreeModelProps } from "./studio-virtual-space-three-asset-loader";
import { loadStudioThreeZoneDioramas, STUDIO_THREE_ZONE_DIORAMAS } from "./studio-virtual-space-three-dioramas";
import { studioThreeGeneratedProps } from "./studio-virtual-space-three-generated-assets";
import { createStylized3DCharacterNode, loadStudioThreeAssets, STUDIO_THREE_PROPS, STUDIO_THREE_SCALE } from "./studio-virtual-space-three-scene";

function deferredLoads() {
  const requests: { readonly url: string; readonly complete: (gltf: GLTF) => void; readonly fail: () => void }[] = [];
  vi.spyOn(GLTFLoader.prototype, "load").mockImplementation((url, complete, _progress, error) => {
    requests.push({ url, complete, fail: () => error?.(new Error("controlled core load failure")) });
  });
  const request = (index: number) => {
    const value = requests[index]; if (!value) throw new Error(`대기 모델이 없습니다: ${index}`); return value;
  };
  return { requests, request };
}
async function sourceModel() {
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [] }] }), "");
  const texture = new THREE.Texture(), material = new THREE.MeshStandardMaterial({ map: texture });
  const geometry = new THREE.BoxGeometry(2, 2, 2), mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>(geometry, material);
  mesh.name = "Ivory plaster";
  gltf.scene.add(mesh);
  return { gltf, mesh, material, geometryDispose: vi.spyOn(geometry, "dispose"), materialDispose: vi.spyOn(material, "dispose"), textureDispose: vi.spyOn(texture, "dispose") };
}
afterEach(() => vi.restoreAllMocks());

describe("기존 3D core 모델의 실제 pending 수명", () => {
  it("actor 응답·설치·종료 뒤 late 해제까지 끝나기 전에는 idle을 보고하지 않는다", async () => {
    const deferred = deferredLoads(), loader = new GLTFLoader(), scene = new THREE.Scene();
    const self = createStylized3DCharacterNode("self", 0x44aaff, true), peer = createStylized3DCharacterNode("peer:a", 0xffaa44, false);
    const actors = new Map([["self", self], ["peer:a", peer]]); scene.add(self.group, peer.group);
    const controller = createStudioThreeActorLoader(loader, actors, () => false, {
      resolveUrl: (index) => `/fixture-${index}.vrm`, isVerifiedUrl: () => true, applyPosture: () => undefined,
    });
    controller.load("self", 0); controller.load("peer:a", 1);
    expect(controller.getPendingCount()).toBe(2);
    let idle = false; const waiting = controller.whenIdle().then(() => { idle = true; });
    const first = await sourceModel(); deferred.request(0).complete(first.gltf);
    expect(self.vrmLoaded).toBe(true); expect(controller.getPendingCount()).toBe(1);
    await Promise.resolve(); expect(idle).toBe(false);
    controller.dispose(); expect(controller.getPendingCount()).toBe(1);
    const late = await sourceModel(); deferred.request(1).complete(late.gltf);
    await waiting;
    expect(idle).toBe(true); expect(controller.getPendingCount()).toBe(0); expect(scene.children).toHaveLength(0);
    for (const source of [first, late]) {
      expect(source.geometryDispose).toHaveBeenCalledTimes(1); expect(source.materialDispose).toHaveBeenCalledTimes(1);
      expect(source.textureDispose).toHaveBeenCalledTimes(1);
    }
  });

  it("공유 URL 소품은 fetch 완료 뒤에도 clone·설치까지 기다리고 종료 시 원본 해제 작업도 기다린다", async () => {
    const deferred = deferredLoads(), scene = new THREE.Scene(), source = await sourceModel();
    const controller = loadStudioThreeModelProps(scene, new GLTFLoader(), ["a", "b"].map((id) => ({ id, url: "/shared.glb", x: 100, y: 100, heightMeters: 1 })), () => false);
    expect(deferred.requests).toHaveLength(1); expect(controller.getPendingCount()).toBe(2);
    deferred.request(0).complete(source.gltf);
    expect(controller.getPendingCount()).toBe(2); expect(scene.children).toHaveLength(0);
    await controller.whenIdle();
    expect(controller.getPendingCount()).toBe(0); expect(scene.children).toHaveLength(2);
    expect(source.geometryDispose).not.toHaveBeenCalled();
    controller.dispose(); expect(controller.getPendingCount()).toBe(1);
    await controller.whenIdle();
    expect(controller.getPendingCount()).toBe(0); expect(scene.children).toHaveLength(0);
    expect(source.geometryDispose).toHaveBeenCalledTimes(1); expect(source.textureDispose).toHaveBeenCalledTimes(1);
  });

  it("비동기 원본 해제가 실패해도 다른 자원은 해제하고 whenIdle에서 실패를 숨기지 않는다", async () => {
    const deferred = deferredLoads(), scene = new THREE.Scene(), source = await sourceModel();
    const controller = loadStudioThreeModelProps(scene, new GLTFLoader(), [{ id: "source", url: "/source.glb", x: 100, y: 100, heightMeters: 1 }], () => false);
    deferred.request(0).complete(source.gltf); await controller.whenIdle();
    source.geometryDispose.mockImplementation(() => { throw new Error("source release failed"); });
    controller.dispose();
    await expect(controller.whenIdle()).rejects.toThrow("3D 소품 원본 해제");
    expect(controller.getPendingCount()).toBe(0); expect(scene.children).toHaveLength(0);
    expect(source.geometryDispose).toHaveBeenCalledTimes(1); expect(source.materialDispose).toHaveBeenCalledTimes(1); expect(source.textureDispose).toHaveBeenCalledTimes(1);
  });

  it("공유 소품의 복제 InstancedMesh는 개별 instance buffer를 해제하고 원본 자원은 한 번 해제한다", async () => {
    const deferred = deferredLoads(), scene = new THREE.Scene(), source = await sourceModel();
    const original = new THREE.InstancedMesh(source.mesh.geometry, source.material, 1);
    original.setMatrixAt(0, new THREE.Matrix4()); source.mesh.removeFromParent(); source.gltf.scene.add(original);
    const originalDispose = vi.spyOn(original, "dispose");
    const controller = loadStudioThreeModelProps(scene, new GLTFLoader(), ["a", "b"].map((id) => ({ id, url: "/instanced.glb", x: 100, y: 100, heightMeters: 1 })), () => false);
    deferred.request(0).complete(source.gltf); await controller.whenIdle();
    const clones: THREE.InstancedMesh[] = [];
    scene.traverse((node) => { if (node instanceof THREE.InstancedMesh) clones.push(node); });
    expect(clones).toHaveLength(2); expect(new Set(clones).size).toBe(2);
    const disposes = clones.map((clone) => { expect(clone).not.toBe(original); return vi.spyOn(clone, "dispose"); });
    controller.dispose(); await controller.whenIdle(); controller.dispose();
    for (const dispose of disposes) expect(dispose).toHaveBeenCalledTimes(1);
    expect(originalDispose).toHaveBeenCalledTimes(1); expect(source.geometryDispose).toHaveBeenCalledTimes(1);
    expect(source.materialDispose).toHaveBeenCalledTimes(1); expect(source.textureDispose).toHaveBeenCalledTimes(1);
  });

  it("숨긴 디오라마 mesh도 소유하며 표시 크기는 기존 제거 동작과 동일하게 계산한다", async () => {
    const deferred = deferredLoads(), scene = new THREE.Scene(), source = await sourceModel();
    const spec = STUDIO_THREE_ZONE_DIORAMAS[0], pattern = spec?.hiddenNodeSubstrings?.[0];
    if (!spec || !pattern) throw new Error("숨김 node가 있는 기존 디오라마 fixture가 없습니다.");
    const hiddenGeometry = new THREE.BoxGeometry(200, 200, 200), hiddenTexture = new THREE.Texture();
    const hiddenMaterial = new THREE.MeshStandardMaterial({ map: hiddenTexture }), hidden = new THREE.Mesh(hiddenGeometry, hiddenMaterial);
    hidden.name = pattern; hidden.position.set(1_000, 0, 0); source.gltf.scene.add(hidden);
    const hiddenGeometryDispose = vi.spyOn(hiddenGeometry, "dispose"), hiddenMaterialDispose = vi.spyOn(hiddenMaterial, "dispose"), hiddenTextureDispose = vi.spyOn(hiddenTexture, "dispose");
    const controller = loadStudioThreeZoneDioramas(scene, new GLTFLoader(), () => false);
    expect(controller.getPendingCount()).toBe(STUDIO_THREE_ZONE_DIORAMAS.length);
    deferred.request(0).complete(source.gltf);
    for (const request of deferred.requests.slice(1)) request.fail();
    await controller.whenIdle(); scene.updateMatrixWorld(true);
    const wrapper = scene.getObjectByName(`zone-diorama-${spec.roomId}`);
    if (!wrapper) throw new Error("완료한 디오라마가 설치되지 않았습니다.");
    expect(wrapper.getObjectByName(pattern)).toBe(hidden); expect(hidden.parent).toBe(source.gltf.scene); expect(hidden.visible).toBe(false);
    const visibleBounds = new THREE.Box3().setFromObject(source.mesh);
    expect(visibleBounds.getSize(new THREE.Vector3()).x).toBeCloseTo(spec.targetWidthMeters);
    expect(visibleBounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(spec.x * STUDIO_THREE_SCALE);
    expect(visibleBounds.min.y).toBeCloseTo(spec.elevationMeters);
    expect(source.material.envMapIntensity).toBe(1.15); expect(source.mesh.castShadow).toBe(true);
    expect(hiddenGeometryDispose).not.toHaveBeenCalled();
    controller.dispose(); controller.dispose();
    expect(scene.children).toHaveLength(0);
    for (const dispose of [source.geometryDispose, source.materialDispose, source.textureDispose, hiddenGeometryDispose, hiddenMaterialDispose, hiddenTextureDispose]) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("종료 뒤 도착한 10개 디오라마는 GPU 자원을 해제하고 scene을 되살리지 않는다", async () => {
    const deferred = deferredLoads(), scene = new THREE.Scene();
    const controller = loadStudioThreeZoneDioramas(scene, new GLTFLoader(), () => false);
    controller.dispose(); expect(controller.getPendingCount()).toBe(STUDIO_THREE_ZONE_DIORAMAS.length);
    for (const request of deferred.requests) {
      const source = await sourceModel(); request.complete(source.gltf);
      expect(source.geometryDispose).toHaveBeenCalledTimes(1); expect(source.materialDispose).toHaveBeenCalledTimes(1); expect(source.textureDispose).toHaveBeenCalledTimes(1);
    }
    await controller.whenIdle(); controller.dispose();
    expect(scene.children).toHaveLength(0); expect(controller.getPendingCount()).toBe(0);
  });

  it("통로 필터가 교체한 원래 geometry도 마지막 소유 mesh와 함께 한 번 해제한다", async () => {
    const deferred = deferredLoads(), scene = new THREE.Scene(), source = await sourceModel();
    const spec = STUDIO_THREE_ZONE_DIORAMAS[0], box = spec?.clearLocalBoxes?.[0];
    if (!spec || !box) throw new Error("기존 통로 필터 fixture가 없습니다.");
    source.mesh.geometry.dispose();
    const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2, cz = (box.minZ + box.maxZ) / 2;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([
      cx, cy, cz, cx + 0.01, cy, cz, cx, cy + 0.01, cz,
      10_000, 10_000, 10_000, 10_001, 10_000, 10_000, 10_000, 10_001, 10_001,
    ], 3));
    geometry.setIndex([0, 1, 2, 3, 4, 5]); geometry.computeVertexNormals();
    source.mesh.geometry = geometry; source.mesh.name = "fixture-furniture";
    const originalDispose = vi.spyOn(geometry, "dispose");
    const controller = loadStudioThreeZoneDioramas(scene, new GLTFLoader(), () => false);
    deferred.request(0).complete(source.gltf); for (const request of deferred.requests.slice(1)) request.fail();
    await controller.whenIdle();
    expect(source.mesh.geometry).not.toBe(geometry); expect(source.mesh.geometry.getIndex()?.count).toBe(3);
    expect(originalDispose).not.toHaveBeenCalled();
    const filteredDispose = vi.spyOn(source.mesh.geometry, "dispose"); controller.dispose(); controller.dispose();
    expect(originalDispose).toHaveBeenCalledTimes(1); expect(filteredDispose).toHaveBeenCalledTimes(1);
    expect(source.materialDispose).toHaveBeenCalledTimes(1); expect(scene.children).toHaveLength(0);
  });

  it("통합 core의 actor·10디오라마·공유 소품과 대기 중 새 아바타 요청을 모두 합산한다", async () => {
    const deferred = deferredLoads(), scene = new THREE.Scene(), manifest = studioVirtualCampusManifest(false);
    const npcId = manifest.npcs[0]?.id;
    if (!npcId) throw new Error("기존 캠퍼스 NPC가 없습니다.");
    const self = createStylized3DCharacterNode("self", 0x44aaff, true), npc = createStylized3DCharacterNode(npcId, 0xffaa44, false);
    scene.add(self.group, npc.group);
    const core = loadStudioThreeAssets(scene, new Map([["self", self], [npcId, npc]]), () => false, 0, manifest);
    expect(core.getPendingCount()).toBe(2 + STUDIO_THREE_ZONE_DIORAMAS.length + STUDIO_THREE_PROPS.length + studioThreeGeneratedProps(manifest).length);
    let idle = false; const waiting = core.whenIdle().then(() => { idle = true; });
    const initialRequests = [...deferred.requests];
    for (const request of initialRequests) { const source = await sourceModel(); request.complete(source.gltf); }
    core("self", 3);
    const latest = deferred.requests.at(-1);
    if (!latest || initialRequests.includes(latest)) throw new Error("새 아바타 요청이 없습니다.");
    await Promise.resolve(); expect(idle).toBe(false); expect(core.getPendingCount()).toBeGreaterThan(0);
    core.dispose();
    const late = await sourceModel(); latest.complete(late.gltf); await waiting;
    expect(core.getPendingCount()).toBe(0); expect(scene.children).toHaveLength(0);
    expect(late.geometryDispose).toHaveBeenCalledTimes(1); expect(late.textureDispose).toHaveBeenCalledTimes(1);
  });

  it("먼저 끝난 소품 idle 뒤 새 cleanup 실패가 생겨도 마지막 actor를 기다린 후 재검사한다", async () => {
    const deferred = deferredLoads(), scene = new THREE.Scene();
    const manifest: StudioVirtualSpaceWorldManifest = {
      id: "core-idle-race", version: 1, width: 500, height: 500, backgroundAssetKey: "fixture", backgroundUrl: "/fixture.webp",
      rooms: [{ id: "room", x: 0, y: 0, width: 500, height: 500, labelKo: "방", labelEn: "Room" }],
      props: [], colliders: [], portals: [], spawns: [], npcs: [],
      interactions: [{ id: "tool", zoneId: "room", point: { x: 100, y: 100 }, radius: 48, labelKo: "작업대", labelEn: "Tool", action: "canvas" }],
    };
    const self = createStylized3DCharacterNode("self", 0x44aaff, true); scene.add(self.group);
    const core = loadStudioThreeAssets(scene, new Map([["self", self]]), () => false, 0, manifest);
    expect(deferred.requests).toHaveLength(2);
    const prop = await sourceModel(); deferred.request(1).complete(prop.gltf);
    await vi.waitFor(() => expect(core.getPendingCount()).toBe(1));
    prop.geometryDispose.mockImplementation(() => { throw new Error("late source release failure"); });
    const waiting = core.whenIdle(), rejected = expect(waiting).rejects.toThrow("3D core 작업 종료");
    await Promise.resolve();
    core.dispose();
    await vi.waitFor(() => expect(core.getPendingCount()).toBe(1));
    const lateActor = await sourceModel(); deferred.request(0).complete(lateActor.gltf);
    await rejected;
    expect(core.getPendingCount()).toBe(0); expect(scene.children).toHaveLength(0);
    expect(prop.geometryDispose).toHaveBeenCalledTimes(1); expect(prop.materialDispose).toHaveBeenCalledTimes(1);
    expect(prop.textureDispose).toHaveBeenCalledTimes(1); expect(lateActor.geometryDispose).toHaveBeenCalledTimes(1);
  });
});
