import { readFileSync } from "node:fs";
import { join } from "node:path";

import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { expect, it } from "vitest";

import { buildStudioVrmSkinnedGarment, disposeStudioVrmSkinnedGarment } from "./studio-vrm-skinned-garment";
import { buildGarmentParts } from "./studio-vrm-wardrobe";
import { measureStudioVrmWardrobeMetrics } from "./StudioVrmWardrobePropsProjection";

async function loadFixtureVrm(filename: string): Promise<VRM> {
  (globalThis as unknown as { self: typeof globalThis }).self = globalThis;
  const bytes = readFileSync(join(process.cwd(), "apps/web/public/vrm", filename));
  const loader = new GLTFLoader();
  // 소매 변형만 측정하므로 브라우저 이미지 디코더 없이 재질을 읽는다.
  loader.register(() => ({ name: "fixture-no-texture-decode", loadTexture: async () => new THREE.Texture() }));
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "");
  const vrm = gltf.userData.vrm as VRM;
  if (vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
  vrm.humanoid.resetNormalizedPose();
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
  return vrm;
}

// 재배포가 허용된 CC0 시부를 사용한다. VRoidPreset의 AvatarSample_B는 LICENSES.md에 따라 제외했다.
it.each(["sample.vrm", "Sendagaya_Shibu.vrm"])("%s에서 팔을 내리면 반팔 소매 전체가 위팔을 따른다", async (filename) => {
  const vrm = await loadFixtureVrm(filename);
  const metrics = measureStudioVrmWardrobeMetrics(vrm);
  const parts = buildGarmentParts("tshirt", metrics, 1).filter((part) => (
    part.bone === "leftUpperArm" || part.bone === "rightUpperArm"
  ));
  expect(parts).toHaveLength(2);
  const materials = parts.map(() => new THREE.MeshBasicMaterial());
  const built = buildStudioVrmSkinnedGarment({
    name: "fixture-short-sleeves", root: vrm.scene, parts, materials,
    resolveBone: (bone) => vrm.humanoid.getRawBoneNode(bone),
  });
  expect(built.ok).toBe(true);
  const surface = built.surface!;
  const mesh = surface.mesh;
  vrm.scene.add(mesh);
  vrm.scene.updateMatrixWorld(true);
  const vertices = mesh.geometry.groups.map((group) => {
    const arm = vrm.humanoid.getRawBoneNode(parts[group.materialIndex!].bone)!;
    const indices = new Set<number>();
    for (let i = group.start; i < group.start + group.count; i += 1) indices.add(mesh.geometry.index!.getX(i));
    return [...indices].map((index) => ({
      index, arm,
      local: arm.worldToLocal(mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)),
    }));
  }).flat();
  for (const angle of [0.6, 1.25, 0]) {
    vrm.humanoid.getNormalizedBoneNode("leftUpperArm")!.rotation.z = -angle;
    vrm.humanoid.getNormalizedBoneNode("rightUpperArm")!.rotation.z = angle;
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    mesh.skeleton.update();
    for (const { index, arm, local } of vertices) {
      const actual = mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
      const expected = arm.localToWorld(local.clone());
      expect(actual.distanceTo(expected), `${filename}: vertex ${index}, arm angle ${angle}`).toBeLessThan(1e-5);
    }
  }
  disposeStudioVrmSkinnedGarment(surface);
  materials.forEach((material) => material.dispose());
  VRMUtils.deepDispose(vrm.scene);
});

it.each(["sample.vrm", "Sendagaya_Shino.vrm"])("%s에서 팔꿈치를 접고 손목을 돌려도 긴팔 소매가 팔에서 벗어나지 않는다", async (filename) => {
  const vrm = await loadFixtureVrm(filename);
  const metrics = measureStudioVrmWardrobeMetrics(vrm);
  for (const item of ["shirt", "blazer"] as const) {
    vrm.humanoid.resetNormalizedPose();
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    const parts = buildGarmentParts(item, metrics, 1);
    const materials = parts.map(() => new THREE.MeshBasicMaterial());
    const built = buildStudioVrmSkinnedGarment({
      name: item === "shirt" ? "wardrobe:top:shirt" : "wardrobe:outer:blazer",
      root: vrm.scene, parts, materials, resolveBone: (name) => vrm.humanoid.getRawBoneNode(name),
    });
    if (!built.surface) throw new Error(`${item} 소매 메시를 생성하지 못했습니다`);
    const mesh = built.surface.mesh;
    vrm.scene.add(mesh);
    vrm.scene.updateMatrixWorld(true);
    const index = mesh.geometry.index;
    if (!index) throw new Error("소매 인덱스가 없습니다");
    const samples: { index: number; bone: THREE.Object3D; local: THREE.Vector3 }[] = [];
    for (const side of ["left", "right"] as const) {
      for (const [boneName, endName, from, to] of [
        [`${side}UpperArm`, `${side}LowerArm`, 0.48, 0.70],
        [`${side}LowerArm`, `${side}Hand`, 0.65, 0.96],
      ] as const) {
        const bone = vrm.humanoid.getRawBoneNode(boneName);
        const end = vrm.humanoid.getRawBoneNode(endName);
        const group = mesh.geometry.groups.find((candidate) => parts[candidate.materialIndex ?? -1]?.bone === boneName);
        if (!bone || !end || !group) throw new Error(`${item}에 ${boneName} 소매가 없습니다`);
        const origin = bone.getWorldPosition(new THREE.Vector3());
        const axis = end.getWorldPosition(new THREE.Vector3()).sub(origin);
        const vertices = new Set<number>();
        for (let i = group.start; i < group.start + group.count; i++) vertices.add(index.getX(i));
        const before = samples.length;
        for (const vertex of vertices) {
          const world = mesh.localToWorld(mesh.getVertexPosition(vertex, new THREE.Vector3()));
          const alongArm = world.clone().sub(origin).dot(axis) / axis.lengthSq();
          if (alongArm >= from && alongArm <= to) samples.push({ index: vertex, bone, local: bone.worldToLocal(world) });
        }
        expect(samples.length).toBeGreaterThan(before);
      }
    }
    for (const bend of [Math.PI / 2, 2.2, 0]) {
      for (const side of ["left", "right"] as const) {
        const elbow = vrm.humanoid.getNormalizedBoneNode(`${side}LowerArm`);
        const hand = vrm.humanoid.getNormalizedBoneNode(`${side}Hand`);
        if (!elbow || !hand) throw new Error(`${side} 팔 리그가 없습니다`);
        elbow.rotation.y = side === "left" ? bend : -bend;
        hand.rotation.z = bend * 0.5;
      }
      vrm.update(0);
      vrm.scene.updateMatrixWorld(true);
      let maximumDrift = 0;
      for (const sample of samples) {
        const actual = mesh.localToWorld(mesh.getVertexPosition(sample.index, new THREE.Vector3()));
        maximumDrift = Math.max(maximumDrift, actual.distanceTo(sample.bone.localToWorld(sample.local.clone())));
      }
      expect(maximumDrift, `${item}, 팔꿈치 각도 ${bend}`).toBeLessThan(0.003);
    }
    mesh.removeFromParent();
    disposeStudioVrmSkinnedGarment(built.surface);
    materials.forEach((material) => material.dispose());
  }
  VRMUtils.deepDispose(vrm.scene);
});
