import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { expect, it } from "vitest";

import { attachStudioVrmBlazerUnderarm } from "./studio-vrm-blazer-underarm";

it("목·가슴은 노출하고 겨드랑이의 의상 보조 본과 모프 표면은 팔을 올린 뒤에도 그대로 따라간다", () => {
  const scene = new THREE.Group();
  const chest = new THREE.Bone();
  const left = new THREE.Bone(), right = new THREE.Bone(), helper = new THREE.Bone();
  scene.add(chest);
  chest.add(left, right);
  right.add(helper);
  left.position.x = 0.12;
  right.position.x = -0.12;
  scene.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([chest, left, right, helper]);
  const garment = new THREE.BufferGeometry();
  garment.setAttribute("position", new THREE.Float32BufferAttribute(
    [-0.02, 0, 0, 0.02, 0, 0, 0, 0.03, 0, -0.21, 0, 0, -0.18, 0, 0, -0.2, 0.04, 0], 3));
  garment.setAttribute("normal", new THREE.Float32BufferAttribute(Array.from({ length: 6 }, () => [0, 0, 1]).flat(), 3));
  garment.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(Array.from({ length: 6 }, () => [3, 0, 0, 0]).flat(), 4));
  garment.setAttribute("skinWeight", new THREE.Float32BufferAttribute(Array.from({ length: 6 }, () => [0.82, 0.18, 0, 0]).flat(), 4));
  garment.morphTargetsRelative = true;
  garment.morphAttributes.position = [new THREE.Float32BufferAttribute(Array.from({ length: 6 }, () => [0, 0, 0.01]).flat(), 3)];
  const source = new THREE.SkinnedMesh(garment, new THREE.MeshBasicMaterial());
  source.material.name = "Tops_01_CLOTH";
  source.bind(skeleton);
  scene.add(source);
  const jacket = new THREE.SkinnedMesh();
  scene.add(jacket);
  scene.updateMatrixWorld(true);
  const avatar = { scene, humanoid: { getRawBoneNode: (key: string) =>
    ({ leftUpperArm: left, rightUpperArm: right } as Record<string, THREE.Bone>)[key] ?? null } } as unknown as VRM;
  attachStudioVrmBlazerUnderarm(avatar, jacket, jacket.material as THREE.Material);
  const panel = jacket.getObjectByName("BlazerUnderarm") as THREE.SkinnedMesh;
  expect(panel.geometry.index?.count).toBe(3);
  expect(panel.geometry.getAttribute("position").count).toBe(3);
  expect(panel.skeleton).not.toBe(skeleton);
  expect(panel.skeleton.bones[3]).toBe(helper);
  expect(panel.morphTargetInfluences).toBe(source.morphTargetInfluences);
  helper.rotation.z = 1.55;
  source.morphTargetInfluences![0] = 0.8;
  scene.updateMatrixWorld(true);
  for (let i = 0; i < 3; i++) {
    const original = source.getVertexPosition(i + 3, new THREE.Vector3());
    expect(panel.getVertexPosition(i, new THREE.Vector3()).distanceTo(original)).toBeCloseTo(0.0015, 5);
  }
});
