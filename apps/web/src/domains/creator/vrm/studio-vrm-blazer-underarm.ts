import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";

import { collectStudioVrmCostumeMeshes } from "./studio-vrm-costume-runtime";
import { classifyMeshName } from "./studio-vrm-costume";

/** 원본 상의의 상완·겨드랑이와 같은 본/모프를 쓰는 재킷 안쪽 천. 팔을 들 때 넓은 반팔이 겉옷을 뚫지 않는다. */
export function attachStudioVrmBlazerUnderarm(vrm: VRM, jacket: THREE.SkinnedMesh, material: THREE.Material): void {
  const armRoots = new Set<THREE.Object3D>();
  const stops = new Set<THREE.Object3D>();
  for (const side of ["left", "right"] as const) {
    for (const name of ["Shoulder", "UpperArm"] as const) {
      const node = vrm.humanoid.getRawBoneNode(`${side}${name}`);
      if (node) armRoots.add(node);
    }
    const elbow = vrm.humanoid.getRawBoneNode(`${side}LowerArm`);
    if (elbow) stops.add(elbow);
  }
  const onUpperArm = (bone: THREE.Object3D): boolean => {
    for (let node: THREE.Object3D | null = bone; node; node = node.parent) {
      if (stops.has(node)) return false;
      if (armRoots.has(node)) return true;
    }
    return false;
  };
  for (const { slot, mesh } of collectStudioVrmCostumeMeshes(vrm)) {
    if (slot !== "tops" || !(mesh instanceof THREE.SkinnedMesh)) continue;
    const src: THREE.BufferGeometry = mesh.geometry;
    const joints = src.getAttribute("skinIndex"), weights = src.getAttribute("skinWeight");
    const normals = src.getAttribute("normal"), positions = src.getAttribute("position");
    if (!positions || !normals || !joints || !weights) continue;
    const selected = mesh.skeleton.bones.map(onUpperArm);
    const restShoulder = (side: "left" | "right") => {
      const upper = vrm.humanoid.getRawBoneNode(`${side}UpperArm`);
      const index = mesh.skeleton.bones.findIndex((bone) => bone === upper);
      return index < 0 ? null : new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.boneInverses[index]!.clone().invert());
    };
    const left = restShoulder("left"), right = restShoulder("right");
    const center = left && right ? left.clone().lerp(right, 0.5) : null;
    const across = left && right ? left.clone().sub(right).normalize() : null;
    const sideCut = left && right ? left.distanceTo(right) * 0.50 : 0;
    const point = new THREE.Vector3();
    const beyondNeckline = new Uint8Array(positions.count);
    const scores = new Float32Array(positions.count);
    for (let i = 0; i < scores.length; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.bindMatrix);
      beyondNeckline[i] = !center || !across || Math.abs(point.sub(center).dot(across)) >= sideCut ? 1 : 0;
      for (let k = 0; k < 4; k++) {
        if (selected[joints.getComponent(i, k)]) scores[i]! += weights.getComponent(i, k);
      }
    }
    const indices: number[] = [];
    const originals: number[] = [];
    const retained = new Map<number, number>();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = src.groups.length ? src.groups : [{ start: 0, count: src.index?.count ?? positions.count, materialIndex: 0 }];
    for (const group of groups) {
      const original = materials[group.materialIndex ?? 0];
      if (!original || original.name.includes("(Outline)") || ("isOutline" in original && original.isOutline)) continue;
      if (materials.length > 1 && classifyMeshName(original.name).slot !== "tops") continue;
      for (let face = group.start; face < group.start + group.count; face += 3) {
        const a = src.index?.getX(face) ?? face;
        const b = src.index?.getX(face + 1) ?? face + 1;
        const c = src.index?.getX(face + 2) ?? face + 2;
        if (!beyondNeckline[a] || !beyondNeckline[b] || !beyondNeckline[c] || scores[a]! + scores[b]! + scores[c]! < 0.54) continue;
        for (const v of [a, b, c]) {
          if (!retained.has(v)) {
            retained.set(v, originals.length);
            originals.push(v);
          }
          indices.push(retained.get(v)!);
        }
      }
    }
    if (!indices.length) continue;
    const geometry = new THREE.BufferGeometry();
    const copy = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, integer = false) => {
      const array = integer ? new Uint16Array(originals.length * attribute.itemSize) : new Float32Array(originals.length * attribute.itemSize);
      for (let i = 0; i < originals.length; i++) {
        for (let k = 0; k < attribute.itemSize; k++) array[i * attribute.itemSize + k] = attribute.getComponent(originals[i]!, k);
      }
      return new THREE.BufferAttribute(array, attribute.itemSize);
    };
    for (const key of ["position", "normal", "uv", "skinWeight", "skinIndex"]) {
      const attribute = src.getAttribute(key);
      if (attribute) geometry.setAttribute(key, copy(attribute, key === "skinIndex"));
    }
    for (const key of ["position", "normal"] as const) {
      if (src.morphAttributes[key]) geometry.morphAttributes[key] = src.morphAttributes[key].map((a) => copy(a));
    }
    geometry.morphTargetsRelative = src.morphTargetsRelative;
    geometry.setIndex(indices);
    const dst = geometry.getAttribute("position");
    const n = geometry.getAttribute("normal");
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const inverseScale = new THREE.Matrix3().setFromMatrix4(mesh.matrixWorld.clone().invert());
    const offset = new THREE.Vector3();
    for (let i = 0; i < dst.count; i++) {
      offset.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize().multiplyScalar(0.0015).applyMatrix3(inverseScale);
      dst.setXYZ(i, dst.getX(i) + offset.x, dst.getY(i) + offset.y, dst.getZ(i) + offset.z);
    }
    const patch = new THREE.SkinnedMesh(geometry, material);
    patch.name = "BlazerUnderarm";
    patch.bindMode = mesh.bindMode;
    patch.bind(mesh.skeleton.clone(), mesh.bindMatrix);
    patch.morphTargetInfluences = mesh.morphTargetInfluences;
    patch.matrix.copy(vrm.scene.matrixWorld).invert().multiply(mesh.matrixWorld);
    patch.matrixAutoUpdate = false;
    patch.frustumCulled = false;
    patch.onBeforeRender = () => geometry.setDrawRange(0, mesh.visible ? indices.length : 0);
    jacket.add(patch);
  }
}
