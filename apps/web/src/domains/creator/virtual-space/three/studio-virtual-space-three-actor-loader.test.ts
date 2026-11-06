import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it, vi } from "vitest";

import { createStudioThreeActorLoader } from "./studio-virtual-space-three-actor-loader";
import { disposeStudioThreeOwnedModel, loadStudioThreeModelProps } from "./studio-virtual-space-three-asset-loader";
import { createStylized3DCharacterNode, type StudioThreeActorNode } from "./studio-virtual-space-three-scene";

interface PendingModel {
  readonly url: string;
  readonly complete: (gltf: GLTF) => void;
  readonly fail: () => void;
}

function deferredLoader() {
  const loader = new GLTFLoader();
  const pending: PendingModel[] = [];
  const load = vi.spyOn(loader, "load").mockImplementation((url, onLoad, _onProgress, onError) => {
    pending.push({ url, complete: onLoad, fail: () => onError?.(new Error("GLB load failed")) });
  });
  const request = (index: number) => {
    const value = pending[index];
    if (!value) throw new Error(`대기 중인 모델 요청이 없습니다: ${index}`);
    return value;
  };
  return { loader, load, pending, request };
}

async function loadedModel(name: string, vrm1 = false) {
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify({
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [] }],
    ...(vrm1 ? { extensions: { VRMC_vrm: {} } } : {}),
  }), "");
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ map: texture, metalness: 0.5, roughness: 0.4 });
  const mesh = new THREE.Mesh(geometry, material);
  gltf.scene.name = name;
  gltf.scene.add(mesh);
  return {
    gltf, mesh, texture, material,
    geometryDispose: vi.spyOn(geometry, "dispose"),
    materialDispose: vi.spyOn(material, "dispose"),
    textureDispose: vi.spyOn(texture, "dispose"),
  };
}

function actorWorld(ids: readonly string[]) {
  const scene = new THREE.Scene();
  const actors = new Map<string, StudioThreeActorNode>();
  for (const id of ids) {
    const actor = createStylized3DCharacterNode(id, 0x38bdf8, id === "self");
    actors.set(id, actor);
    scene.add(actor.group);
  }
  const actor = (id: string) => {
    const value = actors.get(id);
    if (!value) throw new Error(`actor가 없습니다: ${id}`);
    return value;
  };
  return { scene, actors, actor };
}

const options = {
  resolveUrl: (index: number) => `/verified-${index}.vrm`,
  isVerifiedUrl: (url: string) => url.startsWith("/verified-"),
  applyPosture: (_node: StudioThreeActorNode, _scene: THREE.Object3D) => undefined,
};

describe("독립 소유 3D 모델 해제", () => {
  it("여러 텍스처가 공유하는 독립 소유 ImageBitmap도 정확히 한 번 닫는다", () => {
    class OwnedBitmap implements ImageBitmap {
      readonly width = 1;
      readonly height = 1;
      readonly close = vi.fn();
    }
    vi.stubGlobal("ImageBitmap", OwnedBitmap);
    try {
      const bitmap = new OwnedBitmap();
      const root = new THREE.Group();
      for (let index = 0; index < 2; index += 1) {
        const texture = new THREE.Texture(bitmap);
        root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: texture })));
      }
      disposeStudioThreeOwnedModel(root);
      expect(bitmap.close).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });

  it("공유 geometry·material·map·skeleton·bone texture를 한 번씩만 해제한다", () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    const skeleton = new THREE.Skeleton([new THREE.Bone()]);
    skeleton.computeBoneTexture();
    const boneTexture = skeleton.boneTexture;
    if (!boneTexture) throw new Error("bone texture가 생성되지 않았습니다.");
    const secondSkeleton = new THREE.Skeleton([new THREE.Bone()]);
    secondSkeleton.boneTexture = boneTexture;
    const material = new THREE.MeshStandardMaterial({ map: boneTexture });
    for (const boundSkeleton of [skeleton, skeleton, secondSkeleton]) {
      const mesh = new THREE.SkinnedMesh(geometry, material);
      mesh.skeleton = boundSkeleton;
      root.add(mesh);
    }
    const receipts = [geometry, material, boneTexture, skeleton, secondSkeleton]
      .map((resource) => vi.spyOn(resource, "dispose"));
    disposeStudioThreeOwnedModel(root);
    for (const dispose of receipts) expect(dispose).toHaveBeenCalledTimes(1);
    expect(skeleton.boneTexture).toBeNull();
    expect(secondSkeleton.boneTexture).toBeNull();
  });

  it("소품 clone 둘은 공유 원본을 유지하고 controller 반복 해제도 원본을 한 번만 해제한다", async () => {
    const model = await loadedModel("shared-prop");
    const loader = new GLTFLoader();
    vi.spyOn(loader, "loadAsync").mockResolvedValue(model.gltf);
    const scene = new THREE.Scene();
    const controller = loadStudioThreeModelProps(scene, loader, ["a", "b"].map((id) => ({
      id, url: "/shared.glb", x: 100, y: 100, heightMeters: 1,
    })), () => false);
    await vi.waitFor(() => expect(scene.children).toHaveLength(2));
    expect(model.geometryDispose).not.toHaveBeenCalled();
    controller.dispose();
    controller.dispose();
    await vi.waitFor(() => expect(model.geometryDispose).toHaveBeenCalledTimes(1));
    expect(model.materialDispose).toHaveBeenCalledTimes(1);
    expect(model.textureDispose).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
  });
});

describe("실제 Three actor와 지연 GLB 응답 수명", () => {
  it("퇴장 peer를 제거하고 늦은 GLB를 해제하며 self·NPC·현재 peer는 보존한다", async () => {
    const world = actorWorld(["self", "helper", "peer:stay", "peer:leave"]);
    const departed = world.actor("peer:leave");
    const fallbackDispose = vi.spyOn(departed.leftLeg.geometry, "dispose");
    const deferred = deferredLoader();
    const controller = createStudioThreeActorLoader(deferred.loader, world.actors, () => false, options);
    controller.load("peer:leave", 0);
    controller.prunePeerActors(new Set(["peer:stay"]));
    expect(world.scene.children).not.toContain(departed.group);
    expect([...world.actors.keys()]).toEqual(["self", "helper", "peer:stay"]);
    expect(fallbackDispose).toHaveBeenCalledTimes(1);
    const late = await loadedModel("departed-response");
    deferred.request(0).complete(late.gltf);
    expect(late.gltf.scene.parent).toBeNull();
    expect(late.geometryDispose).toHaveBeenCalledTimes(1);
    expect(late.textureDispose).toHaveBeenCalledTimes(1);
    controller.dispose();
    controller.dispose();
    expect(fallbackDispose).toHaveBeenCalledTimes(1);
    expect(world.scene.children).toHaveLength(0);
  });

  it("같은 session ID로 재입장한 새 actor에 이전 요청을 설치하지 않는다", async () => {
    const world = actorWorld(["peer:one"]);
    const deferred = deferredLoader();
    const controller = createStudioThreeActorLoader(deferred.loader, world.actors, () => false, options);
    controller.load("peer:one", 0);
    controller.prunePeerActors(new Set());
    const replacement = createStylized3DCharacterNode("peer:one", 0xffaa22, false);
    world.actors.set("peer:one", replacement);
    world.scene.add(replacement.group);
    controller.load("peer:one", 1);
    const old = await loadedModel("old-session");
    const current = await loadedModel("current-session");
    deferred.request(0).complete(old.gltf);
    expect(replacement.vrmLoaded).toBe(false);
    expect(old.geometryDispose).toHaveBeenCalledTimes(1);
    deferred.request(1).complete(current.gltf);
    expect(replacement.rigGroup.children).toEqual([current.gltf.scene]);
    expect(current.geometryDispose).not.toHaveBeenCalled();
    controller.dispose();
    expect(current.geometryDispose).toHaveBeenCalledTimes(1);
  });

  it("최신 avatar만 설치하고 뒤늦은 이전 avatar 응답과 무효화된 본 참조를 폐기한다", async () => {
    const world = actorWorld(["self"]);
    const actor = world.actor("self");
    const deferred = deferredLoader();
    const posture = vi.fn((node: StudioThreeActorNode, root: THREE.Object3D) => {
      node.vrmLeftUpperArm = root;
      node.armDownZLeft = 1.16;
    });
    const controller = createStudioThreeActorLoader(deferred.loader, world.actors, () => false, { ...options, applyPosture: posture });
    controller.load("self", 0);
    controller.load("self", 1, true);
    const old = await loadedModel("old-avatar");
    const current = await loadedModel("current-avatar");
    deferred.request(1).complete(current.gltf);
    deferred.request(0).complete(old.gltf);
    expect(posture).toHaveBeenCalledTimes(1);
    expect(actor.rigGroup.children).toEqual([current.gltf.scene]);
    expect(actor.vrmLeftUpperArm).toBe(current.gltf.scene);
    expect(old.geometryDispose).toHaveBeenCalledTimes(1);
    expect(current.geometryDispose).not.toHaveBeenCalled();
    controller.dispose();
    expect(current.geometryDispose).toHaveBeenCalledTimes(1);
    expect(actor.vrmLeftUpperArm).toBeUndefined();
  });

  it("body 교체 시 이전 body만 해제하고 ring·shadow와 재질·정면·높이를 보존한다", async () => {
    const world = actorWorld(["self"]);
    const actor = world.actor("self");
    const fallbackDispose = vi.spyOn(actor.leftLeg.geometry, "dispose");
    const ringDispose = vi.spyOn(actor.ring.geometry, "dispose");
    const shadow = actor.group.children.find((child) => child !== actor.ring && child !== actor.rigGroup);
    if (!(shadow instanceof THREE.Mesh)) throw new Error("actor 그림자가 없습니다.");
    const shadowDispose = vi.spyOn(shadow.geometry, "dispose");
    const deferred = deferredLoader();
    const controller = createStudioThreeActorLoader(deferred.loader, world.actors, () => false, options);
    const first = await loadedModel("vrm0");
    const second = await loadedModel("vrm1", true);
    const helper = new THREE.Object3D(); helper.name = "robo_arm";
    first.gltf.scene.add(helper);
    controller.load("self", 0);
    deferred.request(0).complete(first.gltf);
    expect(fallbackDispose).toHaveBeenCalledTimes(1);
    expect(ringDispose).not.toHaveBeenCalled();
    expect(shadowDispose).not.toHaveBeenCalled();
    expect(helper.visible).toBe(false);
    expect(helper.scale.toArray()).toEqual([0, 0, 0]);
    expect(first.gltf.scene.rotation.y).toBe(Math.PI);
    expect(first.mesh.castShadow).toBe(false);
    expect(first.mesh.receiveShadow).toBe(false);
    expect(first.mesh.frustumCulled).toBe(false);
    expect(first.material.envMapIntensity).toBe(0.22);
    expect(first.material.roughness).toBe(0.85);
    expect(first.material.metalness).toBe(0);
    expect(first.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(new THREE.Box3().setFromObject(first.gltf.scene).getSize(new THREE.Vector3()).y).toBeCloseTo(1.86);
    controller.load("self", 1, true);
    deferred.request(1).complete(second.gltf);
    expect(first.geometryDispose).toHaveBeenCalledTimes(1);
    expect(first.materialDispose).toHaveBeenCalledTimes(1);
    expect(first.textureDispose).toHaveBeenCalledTimes(1);
    expect(second.gltf.scene.rotation.y).toBe(0);
    expect(actor.rigGroup.children).toEqual([second.gltf.scene]);
    expect(ringDispose).not.toHaveBeenCalled();
    controller.dispose();
    expect(second.geometryDispose).toHaveBeenCalledTimes(1);
    expect(ringDispose).toHaveBeenCalledTimes(1);
    expect(shadowDispose).toHaveBeenCalledTimes(1);
  });

  it("stage 종료 후 도착한 GLB를 해제하고 종료한 controller는 새 요청을 시작하지 않는다", async () => {
    const world = actorWorld(["self"]);
    let disposed = false;
    const deferred = deferredLoader();
    const controller = createStudioThreeActorLoader(deferred.loader, world.actors, () => disposed, options);
    controller.load("self", 0);
    disposed = true;
    const late = await loadedModel("late-stage");
    deferred.request(0).complete(late.gltf);
    expect(late.geometryDispose).toHaveBeenCalledTimes(1);
    expect(world.actor("self").vrmLoaded).toBe(false);
    controller.dispose();
    disposed = false;
    controller.load("self", 1, true);
    expect(deferred.load).toHaveBeenCalledTimes(1);
    expect(world.scene.children).toHaveLength(0);
  });

  it("controller 해제 뒤 도착한 GLB와 이미 제거된 fallback을 각각 한 번 해제한다", async () => {
    const world = actorWorld(["peer:one"]);
    const fallbackDispose = vi.spyOn(world.actor("peer:one").leftLeg.geometry, "dispose");
    const deferred = deferredLoader();
    const controller = createStudioThreeActorLoader(deferred.loader, world.actors, () => false, options);
    controller.load("peer:one", 0);
    controller.dispose();
    const late = await loadedModel("late-controller");
    deferred.request(0).complete(late.gltf);
    controller.dispose();
    expect(late.geometryDispose).toHaveBeenCalledTimes(1);
    expect(late.materialDispose).toHaveBeenCalledTimes(1);
    expect(late.textureDispose).toHaveBeenCalledTimes(1);
    expect(fallbackDispose).toHaveBeenCalledTimes(1);
    expect(world.scene.children).toHaveLength(0);
  });

  it("준비 중 퇴장한 actor는 설치 직전 ticket 검사로 되살아나지 않는다", async () => {
    const world = actorWorld(["peer:one"]);
    const actor = world.actor("peer:one");
    const deferred = deferredLoader();
    const controller = createStudioThreeActorLoader(deferred.loader, world.actors, () => false, {
      ...options, applyPosture: () => { controller.prunePeerActors(new Set()); },
    });
    const late = await loadedModel("left-during-preparation");
    controller.load("peer:one", 0);
    deferred.request(0).complete(late.gltf);
    expect(world.actors.size).toBe(0);
    expect(actor.vrmLoaded).toBe(false);
    expect(late.gltf.scene.parent).toBeNull();
    expect(late.geometryDispose).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("설치된 actor의 기본 no-op 호출이 진행 중인 강제 교체 ticket을 무효화하지 않는다", async () => {
    const world = actorWorld(["self"]);
    const deferred = deferredLoader();
    const controller = createStudioThreeActorLoader(deferred.loader, world.actors, () => false, options);
    const first = await loadedModel("initial");
    controller.load("self", 0);
    deferred.request(0).complete(first.gltf);
    controller.load("self", 1, true);
    controller.load("self", 0);
    expect(deferred.load).toHaveBeenCalledTimes(2);
    const next = await loadedModel("replacement");
    deferred.request(1).complete(next.gltf);
    expect(world.actor("self").rigGroup.children).toEqual([next.gltf.scene]);
    expect(first.geometryDispose).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("로드 실패는 현재 body를 유지하며 비승인 URL과 이미 설치된 기본 요청은 읽지 않는다", async () => {
    const world = actorWorld(["self"]);
    const actor = world.actor("self");
    const fallback = [...actor.rigGroup.children];
    const deferred = deferredLoader();
    const controller = createStudioThreeActorLoader(deferred.loader, world.actors, () => false, options);
    controller.load("self", 0);
    deferred.request(0).fail();
    expect(actor.rigGroup.children).toEqual(fallback);
    const model = await loadedModel("loaded");
    controller.load("self", 1);
    deferred.request(1).complete(model.gltf);
    controller.load("self", 2);
    expect(deferred.load).toHaveBeenCalledTimes(2);
    controller.dispose();
    const blockedWorld = actorWorld(["self"]);
    const blocked = createStudioThreeActorLoader(deferred.loader, blockedWorld.actors, () => false, {
      ...options, isVerifiedUrl: () => false,
    });
    blocked.load("self", 0);
    expect(deferred.load).toHaveBeenCalledTimes(2);
    blocked.dispose();
  });

  it("준비 실패 시 새 GLB를 해제하고 이전 body·본·모션 참조를 유지한다", async () => {
    const world = actorWorld(["self"]);
    const actor = world.actor("self");
    const previousBone = new THREE.Bone();
    actor.vrmLeftUpperArm = previousBone;
    actor.armDownZLeft = 1.16;
    const fallback = [...actor.rigGroup.children];
    const deferred = deferredLoader();
    const controller = createStudioThreeActorLoader(deferred.loader, world.actors, () => false, {
      ...options, applyPosture: () => { throw new Error("posture failed"); },
    });
    const bad = await loadedModel("bad-posture");
    controller.load("self", 0, true);
    expect(() => deferred.request(0).complete(bad.gltf)).toThrow("posture failed");
    expect(bad.geometryDispose).toHaveBeenCalledTimes(1);
    expect(actor.rigGroup.children).toEqual(fallback);
    expect(actor.vrmLeftUpperArm).toBe(previousBone);
    expect(actor.armDownZLeft).toBe(1.16);
    controller.dispose();
  });

  it("gltf.userData.vrm이 존재하면 applyPosture의 3번째 인자로 전달하고 node.vrm에 연결한다", async () => {
    const world = actorWorld(["self"]);
    const actor = world.actor("self");
    const deferred = deferredLoader();
    const applyPosture = vi.fn();
    const controller = createStudioThreeActorLoader(deferred.loader, world.actors, () => false, {
      ...options, applyPosture,
    });
    const model = await loadedModel("with-vrm", true);
    const mockVrm = { humanoid: { update: vi.fn() }, update: vi.fn() };
    model.gltf.userData = { vrm: mockVrm };
    controller.load("self", 0);
    deferred.request(0).complete(model.gltf);
    expect(applyPosture).toHaveBeenCalledTimes(1);
    expect(applyPosture.mock.calls[0]?.[1]).toBe(model.gltf.scene);
    expect(applyPosture.mock.calls[0]?.[2]).toBe(mockVrm);
    expect(actor.vrm).toBe(mockVrm);
    controller.dispose();
    expect(actor.vrm).toBeUndefined();
  });
});

