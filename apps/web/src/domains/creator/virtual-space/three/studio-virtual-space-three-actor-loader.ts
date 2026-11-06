import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import type { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { disposeStudioThreeOwnedModel } from "./studio-virtual-space-three-asset-loader";
import { StudioThreeActorLifetimes, StudioThreePendingLoads, type StudioThreePendingController } from "./studio-virtual-space-three-runtime-policy";
import type { StudioThreeActorNode } from "./studio-virtual-space-three-scene";

export interface StudioThreeActorController extends StudioThreePendingController {
  readonly load: (actorId: string, index: number, forceReplace?: boolean) => void;
  readonly prunePeerActors: (activePeerActorIds: ReadonlySet<string>) => void;
  readonly dispose: () => void;
}

interface StudioThreeActorLoaderOptions {
  readonly resolveUrl: (index: number) => string;
  readonly isVerifiedUrl: (url: string) => boolean;
  readonly applyPosture: (node: StudioThreeActorNode, scene: THREE.Object3D, vrm?: VRM) => void;
}

function clearVrmBones(node: StudioThreeActorNode): void {
  node.vrmLeftUpperArm = undefined;
  node.vrmRightUpperArm = undefined;
  node.vrmLeftLowerArm = undefined;
  node.vrmRightLowerArm = undefined;
  node.vrmLeftUpperLeg = undefined;
  node.vrmRightUpperLeg = undefined;
  node.armDownZLeft = undefined;
  node.armDownZRight = undefined;
}

function copyVrmBones(target: StudioThreeActorNode, source: StudioThreeActorNode): void {
  target.vrmLeftUpperArm = source.vrmLeftUpperArm;
  target.vrmRightUpperArm = source.vrmRightUpperArm;
  target.vrmLeftLowerArm = source.vrmLeftLowerArm;
  target.vrmRightLowerArm = source.vrmRightLowerArm;
  target.vrmLeftUpperLeg = source.vrmLeftUpperLeg;
  target.vrmRightUpperLeg = source.vrmRightUpperLeg;
  target.armDownZLeft = source.armDownZLeft;
  target.armDownZRight = source.armDownZRight;
}

/** actor GLTF는 캐시 clone이 아닌 독립 로드다. 이 controller가 본문과 fallback을 단독 소유한다. */
export function createStudioThreeActorLoader(
  loader: GLTFLoader,
  actorNodes: Map<string, StudioThreeActorNode>,
  isDisposed: () => boolean,
  options: StudioThreeActorLoaderOptions,
): StudioThreeActorController {
  const pending = new StudioThreePendingLoads();
  const lifetimes = new StudioThreeActorLifetimes(actorNodes, (node) => {
    node.group.removeFromParent();
    try { disposeStudioThreeOwnedModel(node.group); } finally {
      node.group.clear();
      clearVrmBones(node);
      node.vrm = undefined;
    }
  });
  const releaseLoaded = (root: THREE.Object3D) => {
    root.removeFromParent();
    disposeStudioThreeOwnedModel(root);
  };

  const load = (actorId: string, index: number, forceReplace = false) => {
    const node = actorNodes.get(actorId);
    if (isDisposed() || !node || (node.vrmLoaded && !forceReplace)) return;
    const url = options.resolveUrl(index);
    if (!options.isVerifiedUrl(url)) return;
    const ticket = lifetimes.begin(actorId);
    if (!ticket) return;
    const finish = pending.begin();
    const accept = (gltf: GLTF) => {
      const vrmScene = gltf.scene;
      if (isDisposed() || !lifetimes.isCurrent(ticket)) {
        releaseLoaded(vrmScene);
        return;
      }

      // 기존 보조 기계팔·재질·정면·1.86m 정규화 동작을 그대로 유지한다.
      vrmScene.traverse((child) => {
        if (child.name && /robo_/i.test(child.name)) {
          child.visible = false;
          child.scale.setScalar(0);
        }
      });
      const extensions: unknown = gltf.parser?.json?.extensions;
      const isVrm1 = typeof extensions === "object" && extensions !== null
        && "VRMC_vrm" in extensions && Boolean(extensions.VRMC_vrm);
      vrmScene.rotation.y = isVrm1 ? 0 : Math.PI;
      vrmScene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.castShadow = false;
        child.receiveShadow = false;
        child.frustumCulled = false;
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
          if (material instanceof THREE.MeshBasicMaterial) {
            if (material.map) {
              material.map.colorSpace = THREE.SRGBColorSpace;
              material.color.setRGB(0.84, 0.84, 0.88);
            }
            material.needsUpdate = true;
          } else if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
            material.envMapIntensity = 0.22;
            material.roughness = Math.max(0.85, material.roughness);
            material.metalness = 0;
            if (material.map) {
              material.map.colorSpace = THREE.SRGBColorSpace;
              material.color.setRGB(0.82, 0.82, 0.84);
            }
            material.needsUpdate = true;
          }
        }
      });

      const rawVrm: unknown = gltf.userData?.vrm;
      const vrm = typeof rawVrm === "object" && rawVrm !== null ? (rawVrm as VRM) : undefined;

      // 준비 실패·늦은 응답이 현재 avatar의 본 참조와 모션을 손상시키지 않는다.
      const preparedNode: StudioThreeActorNode = { ...node, vrm };
      clearVrmBones(preparedNode);
      try {
        options.applyPosture(preparedNode, vrmScene, vrm);
        vrmScene.updateMatrixWorld(true);
        const size = new THREE.Box3().setFromObject(vrmScene).getSize(new THREE.Vector3());
        vrmScene.scale.setScalar(1.86 / Math.max(0.1, size.y));
        vrmScene.updateMatrixWorld(true);
        const scaledBox = new THREE.Box3().setFromObject(vrmScene);
        vrmScene.position.set(0, -scaledBox.min.y, 0);
      } catch (error) {
        releaseLoaded(vrmScene);
        throw error;
      }

      // 자세 처리 도중 actor가 바뀌어도 낡은 body를 설치하지 않는다.
      if (isDisposed() || !lifetimes.isCurrent(ticket)) {
        releaseLoaded(vrmScene);
        return;
      }
      const previousRig = new THREE.Group();
      for (const child of [...node.rigGroup.children]) previousRig.add(child);
      node.rigGroup.add(vrmScene);
      copyVrmBones(node, preparedNode);
      node.vrm = preparedNode.vrm;
      node.vrmLoaded = true;
      // ring·shadow는 actor 전체 수명까지 유지하고 교체한 body만 해제한다.
      disposeStudioThreeOwnedModel(previousRig);
      previousRig.clear();
    };
    try {
      loader.load(url, (gltf) => {
        try { accept(gltf); } finally { finish(); }
      }, undefined, finish);
      // 로드 실패 시 현재 body(초회에는 즉시 표시용 리그)를 유지한다.
    } catch (error) { finish(); throw error; }
  };
  return {
    load,
    getPendingCount: () => pending.getPendingCount(),
    getPendingRevision: () => pending.getPendingRevision(),
    whenIdle: () => pending.whenIdle(),
    prunePeerActors: (activePeerActorIds) => lifetimes.prunePeers(activePeerActorIds),
    dispose: () => lifetimes.dispose(),
  };
}
