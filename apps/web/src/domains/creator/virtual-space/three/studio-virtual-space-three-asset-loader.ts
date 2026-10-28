import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

import type { StudioThreeModelProp } from "./studio-virtual-space-three-generated-assets";
import { worldToThree } from "./studio-virtual-space-three-scene";

/** 이 모듈 전체가 선택형 3D stage 안에 있으므로 decoder WASM도 3D 선택 시에만 내려받는다. */
export function createStudioThreeGlbLoader(): GLTFLoader {
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}

export interface StudioThreeModelController {
  readonly update: (deltaSeconds: number) => void;
  readonly dispose: () => void;
}

function disposeModel(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    geometries.add(child.geometry);
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
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
    void load(prop.url).then(async (gltf) => {
      if (isDisposed() || stopped) return;
      const { clone } = await import("three/examples/jsm/utils/SkeletonUtils.js");
      if (isDisposed() || stopped) return;
      const model = clone(gltf.scene);
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; }
        if (child instanceof THREE.SkinnedMesh && child.skeleton) skeletons.add(child.skeleton);
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
    });
  }
  return {
    update(deltaSeconds) {
      if (reducedMotion?.matches) return;
      for (const mixer of mixers) mixer.update(Math.min(0.1, Math.max(0, deltaSeconds)));
    },
    dispose() {
      stopped = true;
      for (const mixer of mixers) { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()); }
      for (const skeleton of skeletons) skeleton.dispose();
      skeletons.clear();
      for (const root of roots) root.removeFromParent();
      for (const task of sources.values()) void task.then((gltf) => disposeModel(gltf.scene)).catch(() => undefined);
      roots.length = 0;
      mixers.length = 0;
    },
  };
}
