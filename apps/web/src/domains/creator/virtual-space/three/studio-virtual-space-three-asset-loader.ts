import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import type { StudioThreeModelProp } from "./studio-virtual-space-three-generated-assets";
import { worldToThree } from "./studio-virtual-space-three-scene";
import { StudioThreePendingLoads, type StudioThreePendingController } from "./studio-virtual-space-three-runtime-policy";

/** 이 모듈 전체가 선택형 3D stage 안에 있으므로 decoder WASM도 3D 선택 시에만 내려받는다. */
export function createStudioThreeGlbLoader(): GLTFLoader {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.register((parser) => new VRMLoaderPlugin(parser));
  return loader;
}

export interface StudioThreeModelController extends StudioThreePendingController {
  readonly update: (deltaSeconds: number) => void;
  readonly dispose: () => void;
}

/** 이 root가 단독 소유하는 모델만 해제한다. 공유 clone의 geometry/material에는 사용하지 않는다. */
export function disposeStudioThreeOwnedModel(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const bitmaps = new Set<ImageBitmap>();
  const skeletons = new Set<THREE.Skeleton>();
  const instances = new Set<THREE.InstancedMesh>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    geometries.add(child.geometry);
    if (child instanceof THREE.SkinnedMesh) skeletons.add(child.skeleton);
    if (child instanceof THREE.InstancedMesh) instances.add(child);
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  // boneTexture가 material 또는 다른 skeleton과 공유돼도 정확히 한 번 해제한다.
  for (const skeleton of skeletons) {
    if (skeleton.boneTexture) textures.add(skeleton.boneTexture);
    skeleton.boneTexture = null;
  }
  for (const instance of instances) {
    if (instance.morphTexture) textures.add(instance.morphTexture);
    instance.morphTexture = null;
  }
  for (const texture of textures) {
    const image: unknown = texture.image;
    if (typeof ImageBitmap === "function" && image instanceof ImageBitmap) bitmaps.add(image);
  }
  const failures: unknown[] = [];
  const release = (resource: { dispose(): void }) => {
    try { resource.dispose(); } catch (error) { failures.push(error); }
  };
  for (const geometry of geometries) release(geometry);
  for (const material of materials) release(material);
  for (const texture of textures) release(texture);
  for (const skeleton of skeletons) release(skeleton);
  for (const instance of instances) release(instance);
  // Texture.dispose는 GPU 자원만 해제한다. 독립 소유한 디코딩 bitmap도 함께 닫는다.
  for (const bitmap of bitmaps) {
    try { bitmap.close(); } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, "3D 모델 자원 해제에 실패했습니다.");
}

/** 전송 최적화된 실제 GLB·PBR 텍스처·스키닝과 내장 모션을 보존하며 장면에 배치한다. */
export function loadStudioThreeModelProps(
  scene: THREE.Scene,
  loader: GLTFLoader,
  props: readonly StudioThreeModelProp[],
  isDisposed: () => boolean,
  onAssetError?: (url: string) => void,
): StudioThreeModelController {
  const roots: THREE.Group[] = [];
  const mixers: THREE.AnimationMixer[] = [];
  const skeletons = new Set<THREE.Skeleton>();
  const instances = new Set<THREE.InstancedMesh>();
  const pending = new StudioThreePendingLoads();
  const cleanupFailures: unknown[] = [];
  const reducedMotion = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  let stopped = false;
  // 같은 의자·테이블 URL은 fetch를 공유한다. Skeleton은 GLTF 원본을 공유하지 않도록 별도로 복제한다.
  const sources = new Map<string, Promise<Awaited<ReturnType<GLTFLoader["loadAsync"]>>>>();
  const load = (url: string) => {
    const existing = sources.get(url);
    if (existing) return existing;
    const task = loader.loadAsync(url);
    sources.set(url, task);
    return task;
  };
  for (const prop of props) {
    const finish = pending.begin();
    void load(prop.url).then(async (gltf) => {
      if (isDisposed() || stopped) return;
      const { clone } = await import("three/examples/jsm/utils/SkeletonUtils.js");
      if (isDisposed() || stopped) return;
      const model = clone(gltf.scene);
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; }
        if (child instanceof THREE.SkinnedMesh && child.skeleton) skeletons.add(child.skeleton);
        if (child instanceof THREE.InstancedMesh) instances.add(child);
      });
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
      model.scale.setScalar(prop.heightMeters / Math.max(0.05, size.y));
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const wrapper = new THREE.Group();
      wrapper.name = `prop-${prop.id}`;
      model.position.set(-center.x, -box.min.y + 0.05 + (prop.elevationMeters ?? 0), -center.z);
      wrapper.add(model);
      wrapper.position.copy(worldToThree({ x: prop.x, y: prop.y }, 0));
      wrapper.rotation.y = prop.rotationY ?? 0;
      roots.push(wrapper);
      scene.add(wrapper);
      if (prop.animated && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) mixer.clipAction(clip).play();
        mixer.update(0);
        mixers.push(mixer);
      }
    }).catch(() => {
      // 오류는 화면에 전달하고, 원격 재생성·자동 재시도 없이 기존 방과 정상 모델을 유지한다.
      if (!isDisposed() && !stopped) onAssetError?.(prop.url);
    }).finally(finish);
  }
  return {
    getPendingCount: () => pending.getPendingCount(),
    getPendingRevision: () => pending.getPendingRevision(),
    async whenIdle() {
      await pending.whenIdle();
      if (cleanupFailures.length) throw new AggregateError([...cleanupFailures], "3D 소품 원본 해제에 실패했습니다.");
    },
    update(deltaSeconds) {
      if (reducedMotion?.matches) return;
      for (const mixer of mixers) mixer.update(Math.min(0.1, Math.max(0, deltaSeconds)));
    },
    dispose() {
      if (stopped) return;
      stopped = true;
      const failures: unknown[] = [];
      const release = (action: () => void) => { try { action(); } catch (error) { failures.push(error); } };
      for (const mixer of mixers) release(() => { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()); });
      for (const skeleton of skeletons) release(() => skeleton.dispose());
      skeletons.clear();
      for (const instance of instances) release(() => instance.dispose());
      instances.clear();
      for (const root of roots) release(() => root.removeFromParent());
      for (const task of sources.values()) {
        const finish = pending.begin();
        // 로드 실패는 위에서 보고했다. 성공한 원본의 해제 실패는 whenIdle에서 숨기지 않는다.
        void task.then((gltf) => disposeStudioThreeOwnedModel(gltf.scene), () => undefined)
          .catch((error: unknown) => { cleanupFailures.push(error); }).finally(finish);
      }
      roots.length = 0;
      mixers.length = 0;
      if (failures.length) throw new AggregateError(failures, "3D 소품 인스턴스 해제에 실패했습니다.");
    },
  };
}
