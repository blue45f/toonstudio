// 3D 배경 커스텀 모델의 리그 제어 — 관절 포즈 컨트롤러와 모프 컨트롤러.
// studio-background-3d-model.ts에서 분리한 자기완결 모듈로, 씬 문서 타입과
// two-bone IK 솔버에만 의존한다.
import * as THREE from "three";

import { bakeStudioBg3dRigPoseLayer } from "./studio-bg3d-rig-pose-bake";
import { isStudioBg3dThreeAnalyticIkMatrixSupported } from "./studio-bg3d-three-hierarchy";
import { solveTwoBoneTarget } from "../studio-rig-two-bone-ik";

import type {
  StudioBg3dConstraintLayer,
  StudioBg3dMorphLayer,
  StudioBg3dPoseLayer,
  StudioBg3dQuaternion,
} from "./studio-bg3d-scene-document";

export interface StudioBg3dThreeJointDescriptor {
  readonly key: string;
  /** First stable key for this physical bone across every skin that aliases it. */
  readonly canonicalKey: string;
  readonly name: string;
  readonly skinIndex: number;
  readonly jointIndex: number;
  /** Canonical parent ordinal when the parent belongs to the same skin. */
  readonly parentKey: string | null;
  /** Rest-pose joint origin in model-root local coordinates, for IK authoring defaults. */
  readonly restPosition: readonly [number, number, number];
}

interface StudioBg3dThreeJointBinding {
  readonly descriptor: StudioBg3dThreeJointDescriptor;
  readonly bone: THREE.Bone;
  readonly restRotation: THREE.Quaternion;
}

export interface StudioBg3dThreePoseController {
  readonly joints: readonly StudioBg3dThreeJointDescriptor[];
  restoreRestPose(): void;
  /** Removes the last additive layer while preserving the underlying animation/rest sample. */
  removeAppliedPoseOffsets(): void;
  /** Applies additive offsets to the current animation/rest sample. */
  applyToCurrentPose(pose: StudioBg3dPoseLayer | undefined): void;
  /** Applies analytic two-bone IK, then single-joint aims, after animation and additive pose. */
  applyConstraints(constraints: StudioBg3dConstraintLayer | undefined): void;
  /** Captures the last fully successful pose + constraint pass as weight-1 additive rotations. */
  captureConstraintBakePose(): StudioBg3dPoseLayer | null;
  /** Restores the cloned asset's original local rotations, then applies the pose layer. */
  applyFromRestPose(pose: StudioBg3dPoseLayer | undefined): void;
}

export interface StudioBg3dThreeMorphDescriptor {
  readonly key: string;
  readonly name: string;
  readonly meshIndex: number;
  readonly targetIndex: number;
}

interface StudioBg3dThreeMorphBinding {
  readonly descriptor: StudioBg3dThreeMorphDescriptor;
  readonly influences: number[];
  readonly restWeight: number;
}

export interface StudioBg3dThreeMorphController {
  readonly targets: readonly StudioBg3dThreeMorphDescriptor[];
  restoreRestWeights(): void;
  /** Removes the last additive layer while preserving the underlying animation/rest sample. */
  removeAppliedWeightOffsets(): void;
  applyToCurrentWeights(morph: StudioBg3dMorphLayer | undefined): void;
  applyFromRestWeights(morph: StudioBg3dMorphLayer | undefined): void;
}

/**
 * Samples a played Three action at an absolute clip-local time without advancing mixer time.
 *
 * Studio resolves repeat and ping-pong itself, so the action must stay paused and use LoopOnce.
 * Assigning `action.time` before `mixer.update(0)` is deliberate: `mixer.setTime()` resets every
 * action's local time and retained loop counter, which can snap paused clips to frame zero or
 * double-reflect a manually resolved ping-pong boundary.
 */
export function sampleStudioBg3dAnimationActionAtTime(
  mixer: THREE.AnimationMixer,
  action: THREE.AnimationAction,
  timeSeconds: number,
): number {
  const duration = action.getClip().duration;
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const safeTime = Number.isFinite(timeSeconds)
    ? Math.min(safeDuration, Math.max(0, timeSeconds))
    : 0;
  action.paused = true;
  action.time = safeTime;
  mixer.update(0);
  return safeTime;
}

function collectStudioBg3dThreeJointBindings(root: THREE.Object3D): StudioBg3dThreeJointBinding[] {
  const skeletons: THREE.Skeleton[] = [];
  const seen = new Set<THREE.Skeleton>();
  root.traverse((object) => {
    if (!(object as THREE.SkinnedMesh).isSkinnedMesh) return;
    const skeleton = (object as THREE.SkinnedMesh).skeleton;
    if (!(skeleton instanceof THREE.Skeleton) || seen.has(skeleton)) return;
    seen.add(skeleton);
    skeletons.push(skeleton);
  });
  root.updateWorldMatrix(true, true);
  const rootDeterminant = root.matrixWorld.determinant();
  const inverseRoot = Number.isFinite(rootDeterminant) && Math.abs(rootDeterminant) > 1e-12
    ? root.matrixWorld.clone().invert()
    : null;
  const jointWorld = new THREE.Vector3();
  const canonicalKeyByBone = new Map<THREE.Bone, string>();
  return skeletons.flatMap((skeleton, skinIndex) => {
    const indexByBone = new Map(skeleton.bones.map((bone, index) => [bone, index] as const));
    return skeleton.bones.map((bone, jointIndex) => {
      const key = `skin-${skinIndex}:joint-${jointIndex}`;
      const canonicalKey = canonicalKeyByBone.get(bone) ?? key;
      canonicalKeyByBone.set(bone, canonicalKey);
      const parentIndex = bone.parent instanceof THREE.Bone
        ? indexByBone.get(bone.parent) ?? null
        : null;
      const modelLocal = inverseRoot
        ? bone.getWorldPosition(jointWorld).applyMatrix4(inverseRoot)
        : jointWorld.set(0, 0, 0);
      return {
        descriptor: Object.freeze({
          key,
          canonicalKey,
          name: (bone.name || `Joint ${jointIndex + 1}`).slice(0, 128),
          skinIndex,
          jointIndex,
          parentKey: parentIndex === null ? null : `skin-${skinIndex}:joint-${parentIndex}`,
          restPosition: Object.freeze([
            Number.isFinite(modelLocal.x) ? modelLocal.x : 0,
            Number.isFinite(modelLocal.y) ? modelLocal.y : 0,
            Number.isFinite(modelLocal.z) ? modelLocal.z : 0,
          ] as const),
        }),
        bone,
        restRotation: bone.quaternion.clone(),
      };
    });
  });
}

export function collectStudioBg3dThreeJoints(
  root: THREE.Object3D,
): readonly StudioBg3dThreeJointDescriptor[] {
  return Object.freeze(collectStudioBg3dThreeJointBindings(root).map((binding) => binding.descriptor));
}

/**
 * Mirrors the pose controller's exact world-basis gate for one authored chain without mutating it.
 * `instanceWorldMatrix` is the canonical entity world transform that will parent the cloned model.
 */
export function isStudioBg3dThreeTwoBoneIkChainSupported(input: {
  readonly root: THREE.Object3D;
  readonly instanceWorldMatrix: THREE.Matrix4;
  readonly upperJointKey: string;
  readonly middleJointKey: string;
  readonly endJointKey: string;
}): boolean {
  const bindings = collectStudioBg3dThreeJointBindings(input.root);
  const byKey = new Map(bindings.map((binding) => [binding.descriptor.key, binding] as const));
  const upper = byKey.get(input.upperJointKey);
  const middle = byKey.get(input.middleJointKey);
  const end = byKey.get(input.endJointKey);
  if (
    !upper || !middle || !end ||
    upper.descriptor.skinIndex !== middle.descriptor.skinIndex ||
    upper.descriptor.skinIndex !== end.descriptor.skinIndex ||
    middle.bone.parent !== upper.bone || end.bone.parent !== middle.bone ||
    !isStudioBg3dThreeAnalyticIkMatrixSupported(input.instanceWorldMatrix)
  ) return false;

  input.root.updateWorldMatrix(true, true);
  const rootParentWorld = input.root.parent?.matrixWorld;
  if (rootParentWorld && Math.abs(rootParentWorld.determinant()) <= 1e-12) return false;
  const inverseRootParent = rootParentWorld
    ? rootParentWorld.clone().invert()
    : new THREE.Matrix4();
  return [input.root, upper.bone, middle.bone, end.bone].every((object) => {
    const relative = inverseRootParent.clone().multiply(object.matrixWorld);
    const effectiveWorld = input.instanceWorldMatrix.clone().multiply(relative);
    return isStudioBg3dThreeAnalyticIkMatrixSupported(effectiveWorld);
  });
}

export function createStudioBg3dThreePoseController(
  root: THREE.Object3D,
): StudioBg3dThreePoseController {
  const bindings = collectStudioBg3dThreeJointBindings(root);
  const byKey = new Map(bindings.map((binding) => [binding.descriptor.key, binding] as const));
  const keysByBone = new Map<THREE.Bone, string[]>();
  for (const binding of bindings) {
    const keys = keysByBone.get(binding.bone);
    if (keys) keys.push(binding.descriptor.key);
    else keysByBone.set(binding.bone, [binding.descriptor.key]);
  }
  const appliedBoneStates = new Map<THREE.Bone, {
    readonly base: THREE.Quaternion;
    readonly output: THREE.Quaternion;
  }>();
  let lastConstraintEvaluationHadEffectiveConstraint = false;
  let lastConstraintEvaluationSafe = false;
  const identity = new THREE.Quaternion();
  const weighted = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const targetWorld = new THREE.Vector3();
  const poleWorld = new THREE.Vector3();
  const startWorld = new THREE.Vector3();
  const middleWorld = new THREE.Vector3();
  const endWorld = new THREE.Vector3();
  const currentDirection = new THREE.Vector3();
  const desiredDirection = new THREE.Vector3();
  const boneWorld = new THREE.Vector3();
  const directionInParent = new THREE.Vector3();
  const inverseParentWorld = new THREE.Matrix4();
  const currentInverse = new THREE.Quaternion();
  const desired = new THREE.Quaternion();
  const currentWorldRotation = new THREE.Quaternion();
  const parentWorldRotation = new THREE.Quaternion();
  const worldDelta = new THREE.Quaternion();
  const nextLocalRotation = new THREE.Quaternion();
  const isFiniteQuaternion = (quaternion: THREE.Quaternion) =>
    Number.isFinite(quaternion.x) && Number.isFinite(quaternion.y) &&
    Number.isFinite(quaternion.z) && Number.isFinite(quaternion.w) &&
    quaternion.lengthSq() > 1e-12;
  const rotationsMatch = (left: THREE.Quaternion, right: THREE.Quaternion) => {
    if (!isFiniteQuaternion(left) || !isFiniteQuaternion(right)) return false;
    const normalizedDot = Math.abs(left.dot(right)) / Math.sqrt(left.lengthSq() * right.lengthSq());
    return normalizedDot >= 1 - 1e-7;
  };
  const recordAppliedOutput = (
    binding: StudioBg3dThreeJointBinding,
    baseBeforeWrite: THREE.Quaternion,
  ) => {
    const existing = appliedBoneStates.get(binding.bone);
    const base = existing && rotationsMatch(baseBeforeWrite, existing.output)
      ? existing.base
      : baseBeforeWrite.clone();
    appliedBoneStates.set(binding.bone, {
      base,
      output: binding.bone.quaternion.clone(),
    });
  };
  const applyWeightedLocalRotation = (
    binding: StudioBg3dThreeJointBinding,
    fullRotation: THREE.Quaternion,
    weight: number,
  ) => {
    if (!isFiniteQuaternion(fullRotation)) return false;
    const base = binding.bone.quaternion.clone();
    nextLocalRotation.copy(base).slerp(fullRotation, THREE.MathUtils.clamp(weight, 0, 1)).normalize();
    if (!isFiniteQuaternion(nextLocalRotation)) return false;
    binding.bone.quaternion.copy(nextLocalRotation);
    binding.bone.updateMatrix();
    binding.bone.updateWorldMatrix(true, true);
    recordAppliedOutput(binding, base);
    return true;
  };
  const aimedLocalRotation = (
    binding: StudioBg3dThreeJointBinding,
    segmentStart: THREE.Vector3,
    segmentEnd: THREE.Vector3,
    desiredEnd: THREE.Vector3,
  ): THREE.Quaternion | null => {
    currentDirection.copy(segmentEnd).sub(segmentStart);
    desiredDirection.copy(desiredEnd).sub(segmentStart);
    if (
      !Number.isFinite(currentDirection.lengthSq()) || currentDirection.lengthSq() < 1e-12 ||
      !Number.isFinite(desiredDirection.lengthSq()) || desiredDirection.lengthSq() < 1e-12
    ) return null;
    currentDirection.normalize();
    desiredDirection.normalize();
    binding.bone.getWorldQuaternion(currentWorldRotation);
    worldDelta.setFromUnitVectors(currentDirection, desiredDirection);
    desired.copy(worldDelta).multiply(currentWorldRotation).normalize();
    const parent = binding.bone.parent;
    if (!parent) return null;
    parent.getWorldQuaternion(parentWorldRotation);
    nextLocalRotation.copy(parentWorldRotation).invert().multiply(desired).normalize();
    return isFiniteQuaternion(nextLocalRotation) ? nextLocalRotation.clone() : null;
  };
  const supportsAnalyticIk = (objects: readonly THREE.Object3D[]) => objects.every((object) => {
    object.updateWorldMatrix(true, false);
    return isStudioBg3dThreeAnalyticIkMatrixSupported(object.matrixWorld);
  });
  const hierarchyDepthByBone = new Map<THREE.Bone, number>();
  const hierarchyDepth = (bone: THREE.Bone) => {
    const cached = hierarchyDepthByBone.get(bone);
    if (cached !== undefined) return cached;
    let depth = 0;
    let ancestor: THREE.Object3D | null = bone;
    while (ancestor && ancestor !== root) {
      depth += 1;
      ancestor = ancestor.parent;
    }
    // Detached/hostile skeletons are sorted after joints that actually belong to this model root.
    const resolved = ancestor === root ? depth : Number.MAX_SAFE_INTEGER;
    hierarchyDepthByBone.set(bone, resolved);
    return resolved;
  };
  const stableIkConstraintKey = (
    constraint: StudioBg3dConstraintLayer["twoBoneIks"][number],
  ) => JSON.stringify([
    constraint.upperJointKey,
    constraint.middleJointKey,
    constraint.endJointKey,
    constraint.target,
    constraint.poleTarget,
    constraint.weight,
  ]);
  const orderedTwoBoneIkConstraints = (constraints: StudioBg3dConstraintLayer) =>
    [...(constraints.twoBoneIks ?? [])].sort((left, right) => {
      const leftDepth = byKey.has(left.upperJointKey)
        ? hierarchyDepth(byKey.get(left.upperJointKey)!.bone)
        : Number.MAX_SAFE_INTEGER;
      const rightDepth = byKey.has(right.upperJointKey)
        ? hierarchyDepth(byKey.get(right.upperJointKey)!.bone)
        : Number.MAX_SAFE_INTEGER;
      if (leftDepth !== rightDepth) return leftDepth - rightDepth;
      const leftKey = stableIkConstraintKey(left);
      const rightKey = stableIkConstraintKey(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
  const removeAppliedPoseOffsets = () => {
    for (const [bone, applied] of appliedBoneStates) {
      // A later animation/tracking/physics owner wins; only undo output that is still ours.
      if (rotationsMatch(bone.quaternion, applied.output)) bone.quaternion.copy(applied.base);
      bone.updateMatrix();
    }
    appliedBoneStates.clear();
    lastConstraintEvaluationHadEffectiveConstraint = false;
    lastConstraintEvaluationSafe = false;
  };
  const restoreRestPose = () => {
    appliedBoneStates.clear();
    lastConstraintEvaluationHadEffectiveConstraint = false;
    lastConstraintEvaluationSafe = false;
    for (const binding of bindings) {
      binding.bone.quaternion.copy(binding.restRotation);
      binding.bone.updateMatrix();
    }
  };
  const applyToCurrentPose = (pose: StudioBg3dPoseLayer | undefined) => {
    lastConstraintEvaluationHadEffectiveConstraint = false;
    lastConstraintEvaluationSafe = false;
    if (!pose?.enabled || pose.weight <= 0) return;
    for (const override of pose.joints) {
      const binding = byKey.get(override.jointKey);
      if (!binding) continue;
      weighted.set(...override.rotationOffset);
      if (!Number.isFinite(weighted.lengthSq()) || weighted.lengthSq() < 1e-12) continue;
      weighted.normalize();
      if (pose.weight < 1) weighted.slerpQuaternions(identity, weighted, pose.weight);
      const base = binding.bone.quaternion.clone();
      binding.bone.quaternion.multiply(weighted).normalize();
      binding.bone.updateMatrix();
      recordAppliedOutput(binding, base);
    }
  };
  const applyConstraints = (constraints: StudioBg3dConstraintLayer | undefined) => {
    lastConstraintEvaluationHadEffectiveConstraint = false;
    lastConstraintEvaluationSafe = false;
    if (!constraints?.enabled) return;
    let hadFailure = false;
    root.updateWorldMatrix(true, true);
    const claimedIkBones = new Set<THREE.Bone>();
    const ikProtectedJointKeys = new Set<string>();
    // Parent chains must settle before descendant chains. Otherwise a later parent solve moves an
    // already-solved child end effector, making equivalent documents depend on array order.
    for (const constraint of orderedTwoBoneIkConstraints(constraints)) {
      if (constraint.weight <= 0) continue;
      lastConstraintEvaluationHadEffectiveConstraint = true;
      const upper = byKey.get(constraint.upperJointKey);
      const middle = byKey.get(constraint.middleJointKey);
      const end = byKey.get(constraint.endJointKey);
      if (
        !upper || !middle || !end ||
        upper.descriptor.skinIndex !== middle.descriptor.skinIndex ||
        upper.descriptor.skinIndex !== end.descriptor.skinIndex ||
        middle.bone.parent !== upper.bone || end.bone.parent !== middle.bone ||
        claimedIkBones.has(upper.bone) || claimedIkBones.has(middle.bone) ||
        claimedIkBones.has(end.bone) ||
        !supportsAnalyticIk([root, upper.bone, middle.bone, end.bone])
      ) {
        hadFailure = true;
        continue;
      }
      upper.bone.getWorldPosition(startWorld);
      middle.bone.getWorldPosition(middleWorld);
      end.bone.getWorldPosition(endWorld);
      targetWorld.set(...constraint.target).applyMatrix4(root.matrixWorld);
      poleWorld.set(...constraint.poleTarget).applyMatrix4(root.matrixWorld);
      const solution = solveTwoBoneTarget(
        startWorld,
        middleWorld,
        endWorld,
        targetWorld,
        poleWorld,
      );
      if (!solution) {
        hadFailure = true;
        continue;
      }
      const upperRotation = aimedLocalRotation(
        upper,
        startWorld,
        middleWorld,
        solution.elbow,
      );
      const upperBaseRotation = upper.bone.quaternion.clone();
      const upperAppliedBefore = appliedBoneStates.get(upper.bone);
      if (!upperRotation || !applyWeightedLocalRotation(upper, upperRotation, constraint.weight)) {
        hadFailure = true;
        continue;
      }
      root.updateWorldMatrix(true, true);
      middle.bone.getWorldPosition(middleWorld);
      end.bone.getWorldPosition(endWorld);
      const middleRotation = aimedLocalRotation(
        middle,
        middleWorld,
        endWorld,
        solution.end,
      );
      if (!middleRotation || !applyWeightedLocalRotation(middle, middleRotation, constraint.weight)) {
        // A chain is atomic: never leave a half-solved upper segment behind.
        upper.bone.quaternion.copy(upperBaseRotation);
        upper.bone.updateMatrix();
        if (upperAppliedBefore) appliedBoneStates.set(upper.bone, upperAppliedBefore);
        else appliedBoneStates.delete(upper.bone);
        root.updateWorldMatrix(true, true);
        hadFailure = true;
        continue;
      }
      claimedIkBones.add(upper.bone);
      claimedIkBones.add(middle.bone);
      claimedIkBones.add(end.bone);
      for (const key of keysByBone.get(middle.bone) ?? []) ikProtectedJointKeys.add(key);
      let ancestor: THREE.Object3D | null = upper.bone;
      while (ancestor instanceof THREE.Bone) {
        for (const key of keysByBone.get(ancestor) ?? []) ikProtectedJointKeys.add(key);
        ancestor = ancestor.parent;
      }
      root.updateWorldMatrix(true, true);
    }
    for (const constraint of constraints.aims) {
      // Re-aiming a solved segment or any of its joint ancestors would move the end effector.
      if (constraint.weight <= 0) continue;
      lastConstraintEvaluationHadEffectiveConstraint = true;
      if (ikProtectedJointKeys.has(constraint.jointKey)) continue;
      const binding = byKey.get(constraint.jointKey);
      const parent = binding?.bone.parent;
      if (!binding || !parent) {
        hadFailure = true;
        continue;
      }
      targetWorld.set(...constraint.target).applyMatrix4(root.matrixWorld);
      binding.bone.getWorldPosition(boneWorld);
      directionInParent.copy(targetWorld).sub(boneWorld);
      if (!Number.isFinite(directionInParent.lengthSq()) || directionInParent.lengthSq() < 1e-12) {
        hadFailure = true;
        continue;
      }
      parent.updateWorldMatrix(true, false);
      if (Math.abs(parent.matrixWorld.determinant()) < 1e-12) {
        hadFailure = true;
        continue;
      }
      inverseParentWorld.copy(parent.matrixWorld).invert();
      directionInParent.transformDirection(inverseParentWorld);
      switch (constraint.axis) {
        case "+x": axis.set(1, 0, 0); break;
        case "-x": axis.set(-1, 0, 0); break;
        case "+y": axis.set(0, 1, 0); break;
        case "-y": axis.set(0, -1, 0); break;
        case "+z": axis.set(0, 0, 1); break;
        case "-z": axis.set(0, 0, -1); break;
      }
      desired.setFromUnitVectors(axis, directionInParent);
      weighted.copy(currentInverse.copy(binding.bone.quaternion).invert().multiply(desired));
      if (constraint.weight < 1) weighted.slerpQuaternions(identity, weighted, constraint.weight);
      const base = binding.bone.quaternion.clone();
      binding.bone.quaternion.multiply(weighted).normalize();
      if (!isFiniteQuaternion(binding.bone.quaternion)) {
        binding.bone.quaternion.copy(base);
        binding.bone.updateMatrix();
        hadFailure = true;
        continue;
      }
      binding.bone.updateMatrix();
      binding.bone.updateWorldMatrix(false, true);
      recordAppliedOutput(binding, base);
    }
    lastConstraintEvaluationSafe = lastConstraintEvaluationHadEffectiveConstraint && !hadFailure;
  };
  const captureConstraintBakePose = () => {
    if (!lastConstraintEvaluationHadEffectiveConstraint || !lastConstraintEvaluationSafe) return null;
    const capturedBones = new Set<THREE.Bone>();
    const samples: Array<{
      jointKey: string;
      baseRotation: StudioBg3dQuaternion;
      outputRotation: StudioBg3dQuaternion;
    }> = [];
    for (const binding of bindings) {
      if (capturedBones.has(binding.bone)) continue;
      const applied = appliedBoneStates.get(binding.bone);
      if (!applied) continue;
      if (!rotationsMatch(binding.bone.quaternion, applied.output)) return null;
      const jointKey = keysByBone.get(binding.bone)?.[0];
      if (!jointKey) return null;
      capturedBones.add(binding.bone);
      samples.push({
        jointKey,
        baseRotation: [applied.base.x, applied.base.y, applied.base.z, applied.base.w],
        outputRotation: [applied.output.x, applied.output.y, applied.output.z, applied.output.w],
      });
    }
    return bakeStudioBg3dRigPoseLayer(samples);
  };
  return Object.freeze({
    joints: Object.freeze(bindings.map((binding) => binding.descriptor)),
    restoreRestPose,
    removeAppliedPoseOffsets,
    applyToCurrentPose,
    applyConstraints,
    captureConstraintBakePose,
    applyFromRestPose(pose: StudioBg3dPoseLayer | undefined) {
      restoreRestPose();
      applyToCurrentPose(pose);
    },
  });
}

function collectStudioBg3dThreeMorphBindings(root: THREE.Object3D): StudioBg3dThreeMorphBinding[] {
  const bindings: StudioBg3dThreeMorphBinding[] = [];
  let meshIndex = 0;
  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    const currentMeshIndex = meshIndex;
    meshIndex += 1;
    const influences = mesh.morphTargetInfluences;
    if (!Array.isArray(influences)) return;
    const namesByIndex = new Map<number, string>();
    for (const [name, targetIndex] of Object.entries(mesh.morphTargetDictionary ?? {})) {
      if (Number.isSafeInteger(targetIndex) && targetIndex >= 0 && targetIndex < influences.length) {
        namesByIndex.set(targetIndex, name);
      }
    }
    for (let targetIndex = 0; targetIndex < influences.length; targetIndex += 1) {
      const restWeight = influences[targetIndex];
      if (typeof restWeight !== "number" || !Number.isFinite(restWeight)) continue;
      bindings.push({
        descriptor: Object.freeze({
          key: `mesh-${currentMeshIndex}:target-${targetIndex}`,
          name: (namesByIndex.get(targetIndex) || `Morph ${targetIndex + 1}`).slice(0, 128),
          meshIndex: currentMeshIndex,
          targetIndex,
        }),
        influences,
        restWeight,
      });
    }
  });
  return bindings;
}

export function collectStudioBg3dThreeMorphTargets(
  root: THREE.Object3D,
): readonly StudioBg3dThreeMorphDescriptor[] {
  return Object.freeze(collectStudioBg3dThreeMorphBindings(root).map((binding) => binding.descriptor));
}

export function createStudioBg3dThreeMorphController(
  root: THREE.Object3D,
): StudioBg3dThreeMorphController {
  const bindings = collectStudioBg3dThreeMorphBindings(root);
  const byKey = new Map(bindings.map((binding) => [binding.descriptor.key, binding] as const));
  const weightsBeforeAppliedOffsets = new Map<StudioBg3dThreeMorphBinding, number>();
  const removeAppliedWeightOffsets = () => {
    for (const [binding, weight] of weightsBeforeAppliedOffsets) {
      binding.influences[binding.descriptor.targetIndex] = weight;
    }
    weightsBeforeAppliedOffsets.clear();
  };
  const restoreRestWeights = () => {
    weightsBeforeAppliedOffsets.clear();
    for (const binding of bindings) binding.influences[binding.descriptor.targetIndex] = binding.restWeight;
  };
  const applyToCurrentWeights = (morph: StudioBg3dMorphLayer | undefined) => {
    if (!morph?.enabled || morph.weight <= 0) return;
    for (const override of morph.targets) {
      const binding = byKey.get(override.targetKey);
      if (!binding) continue;
      const current = binding.influences[binding.descriptor.targetIndex] ?? binding.restWeight;
      if (!weightsBeforeAppliedOffsets.has(binding)) {
        weightsBeforeAppliedOffsets.set(binding, current);
      }
      binding.influences[binding.descriptor.targetIndex] = Math.max(
        0,
        Math.min(1, current + override.weightOffset * morph.weight),
      );
    }
  };
  return Object.freeze({
    targets: Object.freeze(bindings.map((binding) => binding.descriptor)),
    restoreRestWeights,
    removeAppliedWeightOffsets,
    applyToCurrentWeights,
    applyFromRestWeights(morph: StudioBg3dMorphLayer | undefined) {
      restoreRestWeights();
      applyToCurrentWeights(morph);
    },
  });
}
