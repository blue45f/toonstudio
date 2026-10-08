/**
 * 키트 스켈레톤 호환 검사와 재바인딩(계약 4.3). 모든 키트 GLB(베이스·파츠)는 같은 68 joint를 싣고, Babylon glTF 로더는
 * `Bone._index = skin.joints.indexOf(joint)`로 만들며 스킨 행렬을 그 인덱스로 조회한다(`glTFLoader.pure.js` _loadSkinAsync).
 * 그래서 파츠 GLB의 joint 이름 배열이 베이스와 **같으면** 파츠 메시의 `skeleton`만 베이스 스켈레톤으로 바꾸면 되고(JOINTS 재매핑 없음),
 * 이름 집합은 같고 순서만 다르면 JOINTS 값을 인덱스 표로 다시 쓴다. 집합이나 부모가 다르면 로드를 실패시킨다(호출자가 `kit-joint-mismatch`).
 *
 * 이 모듈은 Babylon 객체를 만지지만 리그 조립 정책(역할 그룹핑·가림·morph)은 모른다 — `kit-loader.ts`가 호출한다.
 */
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";

import { qMultiply, qNormalize } from "../../shared/math";

import { fromQuaternion, fromVector3 } from "./convert";

import type { RigBone } from "./character-rig";
import type { HumanoidBoneName, Quat } from "../../contracts";
import type { Bone } from "@babylonjs/core/Bones/bone.js";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";

/** 스켈레톤의 joint 한 개(Babylon `Bone`을 평문으로 옮긴 것) */
export interface SkeletonJoint {
  readonly name: string;
  /** 스킨 행렬 인덱스(= 해당 GLB `skin.joints`에서의 위치) */
  readonly index: number;
  readonly parent: string | null;
}

/** 스켈레톤의 joint를 스킨 인덱스 순으로 나열한다. */
export function listSkeletonJoints(skeleton: Skeleton): SkeletonJoint[] {
  return skeleton.bones.map((bone) => ({ name: bone.name, index: bone.getIndex(), parent: bone.getParent()?.name ?? null })).sort((a, b) => a.index - b.index);
}

export interface JointDiff {
  /** 기준에는 있는데 실제에 없는 joint */
  readonly missing: readonly string[];
  /** 실제에만 있는 joint */
  readonly extra: readonly string[];
  /** 부모가 기준과 다른 joint(`이름: 기대 부모 ≠ 실제 부모`) */
  readonly parentMismatches: readonly string[];
  /** 실제 인덱스가 기준 배열 순서와 원소별로 같은가 */
  readonly sameOrder: boolean;
}

/** 기준 joint 배열·부모 표와 실제 스켈레톤을 비교한다. */
export function diffJoints(reference: readonly string[], referenceParents: Readonly<Record<string, string | null>>, actual: readonly SkeletonJoint[]): JointDiff {
  const actualNames = new Set(actual.map((joint) => joint.name));
  const referenceNames = new Set(reference);
  const missing = reference.filter((name) => !actualNames.has(name));
  const extra = actual.filter((joint) => !referenceNames.has(joint.name)).map((joint) => joint.name);
  const parentMismatches: string[] = [];
  for (const joint of actual) {
    if (!referenceNames.has(joint.name)) continue;
    const expected = referenceParents[joint.name] ?? null;
    if (expected !== joint.parent) parentMismatches.push(`${joint.name}: ${expected ?? "(없음)"} ≠ ${joint.parent ?? "(없음)"}`);
  }
  const sameOrder = actual.length === reference.length && actual.every((joint, position) => joint.index === position && joint.name === reference[position]);
  return { missing, extra, parentMismatches, sameOrder };
}

/** 이름 집합과 부모 관계가 모두 맞으면(순서는 무관) 재바인딩할 수 있다. */
export function jointsCompatible(diff: JointDiff): boolean {
  return diff.missing.length === 0 && diff.extra.length === 0 && diff.parentMismatches.length === 0;
}

function listFew(items: readonly string[], limit = 5): string {
  return items.length <= limit ? items.join(", ") : `${items.slice(0, limit).join(", ")} 외 ${items.length - limit}개`;
}

/** `kit-joint-mismatch` 사유에 넣을 한글 요약(어긋난 이름 최대 5개) */
export function describeJointDiff(diff: JointDiff): string {
  const parts: string[] = [];
  if (diff.missing.length > 0) parts.push(`없는 joint ${diff.missing.length}개 [${listFew(diff.missing)}]`);
  if (diff.extra.length > 0) parts.push(`여분 joint ${diff.extra.length}개 [${listFew(diff.extra)}]`);
  if (diff.parentMismatches.length > 0) parts.push(`부모가 다른 joint ${diff.parentMismatches.length}개 [${listFew(diff.parentMismatches)}]`);
  return parts.join("; ");
}

/** 실제 인덱스 → 기준 인덱스 표(이름이 기준에 없으면 null). 배열 길이는 실제 인덱스의 최댓값 + 1이다. */
export function buildJointIndexRemap(reference: readonly string[], actual: readonly SkeletonJoint[]): Uint16Array | null {
  const position = new Map(reference.map((name, index) => [name, index] as const));
  let size = 0;
  for (const joint of actual) size = Math.max(size, joint.index + 1);
  const remap = new Uint16Array(size);
  for (const joint of actual) {
    const target = position.get(joint.name);
    if (target === undefined) return null;
    remap[joint.index] = target;
  }
  return remap;
}

/** 메시의 JOINTS_0 값을 표로 다시 쓴다(float 버퍼로 교체). 영향 5개 이상(JOINTS_1)은 키트에서 금지이므로 다루지 않는다. */
export function remapSkinIndices(mesh: Mesh, remap: Uint16Array): void {
  const source = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind);
  if (!source) return;
  const out = new Float32Array(source.length);
  for (let i = 0; i < source.length; i += 1) out[i] = remap[source[i] ?? 0] ?? 0;
  mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, out, false, 4);
}

/**
 * 스킨 속성을 정점 샘플로 점검한다(최대 `maxSamples`개를 균등 추출). 문제가 있으면 한글 사유, 없으면 null.
 * 전수 검사는 `scripts/verify-character-kit.mjs`(V8)가 한다 — 로드 시에는 비용을 제한한다.
 */
export function skinProblem(mesh: Mesh, jointCount: number, weightTolerance: number, maxSamples = 2000): string | null {
  if (!mesh.isVerticesDataPresent(VertexBuffer.MatricesIndicesKind) || !mesh.isVerticesDataPresent(VertexBuffer.MatricesWeightsKind) || mesh.skeleton === null) {
    return "스킨(JOINTS_0/WEIGHTS_0과 skin 참조)이 없습니다. 키트의 모든 메시는 베이스 스켈레톤에 스키닝해야 합니다.";
  }
  if (mesh.isVerticesDataPresent(VertexBuffer.MatricesIndicesExtraKind) || mesh.isVerticesDataPresent(VertexBuffer.MatricesWeightsExtraKind)) {
    return "정점당 영향 본이 4개를 넘습니다(JOINTS_1/WEIGHTS_1 사용). 키트는 정점당 최대 4개입니다.";
  }
  const indices = mesh.getVerticesData(VertexBuffer.MatricesIndicesKind);
  const weights = mesh.getVerticesData(VertexBuffer.MatricesWeightsKind);
  if (!indices || !weights) return "스킨 정점 데이터를 읽지 못했습니다.";
  const vertexCount = Math.floor(weights.length / 4);
  const step = Math.max(1, Math.floor(vertexCount / maxSamples));
  for (let v = 0; v < vertexCount; v += step) {
    let sum = 0;
    for (let k = 0; k < 4; k += 1) {
      const weight = weights[v * 4 + k] ?? 0;
      if (!Number.isFinite(weight) || weight < 0) return `정점 ${v}의 스킨 가중치가 올바르지 않습니다(${weight}).`;
      sum += weight;
      if (weight > 0 && (indices[v * 4 + k] ?? 0) >= jointCount) return `정점 ${v}의 joint 인덱스(${indices[v * 4 + k]})가 joint 수 ${jointCount}를 넘습니다.`;
    }
    if (Math.abs(sum - 1) > weightTolerance) return `정점 ${v}의 스킨 가중치 합이 1이 아닙니다(${sum.toFixed(4)}, 허용 오차 ${weightTolerance}).`;
  }
  return null;
}

/** 파츠 메시를 베이스 스켈레톤에 바인딩한다. `remap`이 있으면 JOINTS 값을 먼저 다시 쓴다. */
export function rebindMeshes(meshes: readonly Mesh[], baseSkeleton: Skeleton, remap: Uint16Array | null): void {
  for (const mesh of meshes) {
    if (remap) remapSkinIndices(mesh, remap);
    mesh.skeleton = baseSkeleton;
  }
}

/** 4 × 4 행렬이 항등인지(허용 오차 이내) */
export function isIdentityMatrix(elements: ArrayLike<number>, epsilon = 1e-5): boolean {
  for (let i = 0; i < 16; i += 1) {
    const expected = i % 5 === 0 ? 1 : 0;
    if (!(Math.abs((elements[i] ?? Number.NaN) - expected) <= epsilon)) return false;
  }
  return true;
}

/**
 * 베이스 스켈레톤에서 리그 본 표를 만든다(제작 패키지 로더와 같은 규칙: 링크된 TransformNode의 회전을 쿼터니언으로 고정하고
 * 모델 공간 rest 회전을 부모 쪽으로 누적한다). 링크된 노드가 없는 본은 건너뛰고 이름을 `skippedBones`에 담는다.
 */
export function buildRigBones(
  skeleton: Skeleton,
  boneMap: Readonly<Record<string, HumanoidBoneName>>,
): { readonly bones: Map<string, RigBone>; readonly humanoid: Map<HumanoidBoneName, RigBone>; readonly skippedBones: string[] } {
  const bones = new Map<string, RigBone>();
  const humanoid = new Map<HumanoidBoneName, RigBone>();
  const skippedBones: string[] = [];
  // 부모 회전 누적이 본 순회 순서에 좌우되지 않도록 먼저 모든 노드의 회전을 쿼터니언으로 고정한다.
  for (const bone of skeleton.bones) {
    const node = bone.getTransformNode();
    if (node && !node.rotationQuaternion) node.rotationQuaternion = node.rotation.toQuaternion();
  }
  const restWorldCache = new Map<Bone, Quat>();
  const restWorldOf = (bone: Bone): Quat => {
    const cached = restWorldCache.get(bone);
    if (cached) return cached;
    const node = bone.getTransformNode();
    const local = fromQuaternion(node?.rotationQuaternion);
    const parent = bone.getParent();
    const world: Quat = parent ? qNormalize(qMultiply(restWorldOf(parent), local)) : local;
    restWorldCache.set(bone, world);
    return world;
  };
  for (const bone of skeleton.bones) {
    const node = bone.getTransformNode();
    if (!node) {
      skippedBones.push(bone.name);
      continue;
    }
    const parent = bone.getParent();
    const humanoidName = boneMap[bone.name] ?? null;
    const rigBone: RigBone = {
      name: bone.name,
      humanoid: humanoidName,
      bone,
      node,
      parentName: parent ? parent.name : null,
      restLocal: fromQuaternion(node.rotationQuaternion),
      restWorld: restWorldOf(bone),
      restTranslation: fromVector3(node.position),
      auxiliary: humanoidName === null,
    };
    bones.set(bone.name, rigBone);
    if (humanoidName && !humanoid.has(humanoidName)) humanoid.set(humanoidName, rigBone);
  }
  return { bones, humanoid, skippedBones };
}
