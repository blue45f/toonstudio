/**
 * 단위 듀얼 쿼터니언(q_0 + ε q_e) 강체 대수, 반구 대척점 부호 정렬 및 스켈레톤 FK 평가기.
 */

export type Vec3 = readonly [number, number, number];

/** [x, y, z, w] 순서의 쿼터니언 (w가 스칼라부). */
export type QuatXYZW = readonly [number, number, number, number];

/** 단위 듀얼 쿼터니언 q_0 + ε q_e (ε² = 0, ||q_0|| = 1, q_0 · q_e = 0). */
export interface DualQuat {
  readonly real: QuatXYZW;
  readonly dual: QuatXYZW;
}

export interface RigidTransform3D {
  readonly rotation: QuatXYZW;
  readonly translation: Vec3;
}

export interface RigBoneBindSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly parentIndex: number;
  readonly bindLocalTransform: RigidTransform3D;
}

export interface VertexBoneInfluence {
  readonly boneIndex: number;
  readonly weight: number;
}

export const DQ_EPSILON = 1e-12;

export function quatIdentity(): QuatXYZW {
  return [0, 0, 0, 1];
}

export function quatDot(a: QuatXYZW, b: QuatXYZW): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

export function quatNormalize(q: QuatXYZW): QuatXYZW {
  const lenSq = quatDot(q, q);
  if (lenSq <= DQ_EPSILON) return [0, 0, 0, 1];
  const invLen = 1 / Math.sqrt(lenSq);
  return [q[0] * invLen, q[1] * invLen, q[2] * invLen, q[3] * invLen];
}

export function quatConjugate(q: QuatXYZW): QuatXYZW {
  return [-q[0], -q[1], -q[2], q[3]];
}

export function quatMultiply(a: QuatXYZW, b: QuatXYZW): QuatXYZW {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export function quatFromAxisAngle(axis: Vec3, angleRad: number): QuatXYZW {
  const axisLen = Math.hypot(axis[0], axis[1], axis[2]);
  if (axisLen <= DQ_EPSILON) return [0, 0, 0, 1];
  const half = angleRad * 0.5;
  const sinHalf = Math.sin(half) / axisLen;
  return quatNormalize([
    axis[0] * sinHalf,
    axis[1] * sinHalf,
    axis[2] * sinHalf,
    Math.cos(half),
  ]);
}

export function quatRotateVec3(q: QuatXYZW, v: Vec3): Vec3 {
  const tx = 2 * (q[1] * v[2] - q[2] * v[1]);
  const ty = 2 * (q[2] * v[0] - q[0] * v[2]);
  const tz = 2 * (q[0] * v[1] - q[1] * v[0]);
  return [
    v[0] + q[3] * tx + (q[1] * tz - q[2] * ty),
    v[1] + q[3] * ty + (q[2] * tx - q[0] * tz),
    v[2] + q[3] * tz + (q[0] * ty - q[1] * tx),
  ];
}

/** 반구 정렬된 단위 쿼터니언을 SO(3) 접공간 회전 벡터(axis * angle, rad)로 매핑한다. */
export function quatToRotationVector(qInput: QuatXYZW): Vec3 {
  const q = quatNormalize(qInput);
  const sign = q[3] < 0 ? -1 : 1;
  const vx = q[0] * sign;
  const vy = q[1] * sign;
  const vz = q[2] * sign;
  const w = Math.min(1, Math.max(-1, q[3] * sign));
  const sinHalf = Math.hypot(vx, vy, vz);
  if (sinHalf <= 1e-8) return [2 * vx, 2 * vy, 2 * vz];
  const scale = (2 * Math.atan2(sinHalf, w)) / sinHalf;
  return [vx * scale, vy * scale, vz * scale];
}

export function composeRigidTransforms(
  parent: RigidTransform3D,
  local: RigidTransform3D,
): RigidTransform3D {
  const rotatedOffset = quatRotateVec3(parent.rotation, local.translation);
  return {
    rotation: quatNormalize(quatMultiply(parent.rotation, local.rotation)),
    translation: [
      parent.translation[0] + rotatedOffset[0],
      parent.translation[1] + rotatedOffset[1],
      parent.translation[2] + rotatedOffset[2],
    ],
  };
}

export function invertRigidTransform(transform: RigidTransform3D): RigidTransform3D {
  const invRot = quatConjugate(quatNormalize(transform.rotation));
  const negRotated = quatRotateVec3(invRot, transform.translation);
  return {
    rotation: invRot,
    translation: [-negRotated[0], -negRotated[1], -negRotated[2]],
  };
}

export function computeSkinningRigidDelta(
  bindWorld: RigidTransform3D,
  poseWorld: RigidTransform3D,
): RigidTransform3D {
  return composeRigidTransforms(poseWorld, invertRigidTransform(bindWorld));
}

/** 강체 변환(단위 회전 q_0 + 이동 t)을 단위 듀얼 쿼터니언 q_0 + ε(0.5 * t_q ⊗ q_0)으로 변환한다. */
export function rigidTransformToDualQuat(transform: RigidTransform3D): DualQuat {
  const real = quatNormalize(transform.rotation);
  const pureTranslation: QuatXYZW = [
    transform.translation[0],
    transform.translation[1],
    transform.translation[2],
    0,
  ];
  const prod = quatMultiply(pureTranslation, real);
  return {
    real,
    dual: [prod[0] * 0.5, prod[1] * 0.5, prod[2] * 0.5, prod[3] * 0.5],
  };
}

/** 듀얼 쿼터니언을 스터디 이차곡면(||q_0|| = 1, q_0 · q_e = 0) 위의 단위 듀얼 쿼터니언으로 정규화한다. */
export function normalizeDualQuat(dq: DualQuat): DualQuat {
  const normSq = quatDot(dq.real, dq.real);
  if (normSq <= DQ_EPSILON) {
    return { real: [0, 0, 0, 1], dual: [0, 0, 0, 0] };
  }
  const invNorm = 1 / Math.sqrt(normSq);
  const r0 = dq.real[0] * invNorm;
  const r1 = dq.real[1] * invNorm;
  const r2 = dq.real[2] * invNorm;
  const r3 = dq.real[3] * invNorm;
  const d0 = dq.dual[0] * invNorm;
  const d1 = dq.dual[1] * invNorm;
  const d2 = dq.dual[2] * invNorm;
  const d3 = dq.dual[3] * invNorm;
  const proj = r0 * d0 + r1 * d1 + r2 * d2 + r3 * d3;
  return {
    real: [r0, r1, r2, r3],
    dual: [d0 - proj * r0, d1 - proj * r1, d2 - proj * r2, d3 - proj * r3],
  };
}

/** 단위 듀얼 쿼터니언에서 강체 회전과 이동 벡터 t = 2 * (q_e ⊗ q_0^*).xyz를 복원한다. */
export function dualQuatToRigidTransform(dqInput: DualQuat): RigidTransform3D {
  const dq = normalizeDualQuat(dqInput);
  const r = dq.real;
  const e = dq.dual;
  return {
    rotation: r,
    translation: [
      2 * (r[3] * e[0] - e[3] * r[0] + (r[1] * e[2] - r[2] * e[1])),
      2 * (r[3] * e[1] - e[3] * r[1] + (r[2] * e[0] - r[0] * e[2])),
      2 * (r[3] * e[2] - e[3] * r[2] + (r[0] * e[1] - r[1] * e[0])),
    ],
  };
}

/** 단위 듀얼 쿼터니언의 강체 역변환 켤레 (q_0^* + ε q_e^*)를 반환한다. */
export function dualQuatConjugate(dq: DualQuat): DualQuat {
  return { real: quatConjugate(dq.real), dual: quatConjugate(dq.dual) };
}

export function dualQuatMultiply(a: DualQuat, b: DualQuat): DualQuat {
  const real = quatMultiply(a.real, b.real);
  const left = quatMultiply(a.real, b.dual);
  const right = quatMultiply(a.dual, b.real);
  return {
    real,
    dual: [left[0] + right[0], left[1] + right[1], left[2] + right[2], left[3] + right[3]],
  };
}

/** 기준 실수부 쿼터니언(q_ref)과 같은 반구(dot(q_ref, q_i) >= 0)에 놓이도록 대척점 부호를 정렬한다. */
export function alignDualQuatHemisphere(
  referenceReal: QuatXYZW,
  candidate: DualQuat,
): { readonly aligned: DualQuat; readonly flipped: boolean } {
  if (quatDot(referenceReal, candidate.real) < 0) {
    return {
      aligned: {
        real: [-candidate.real[0], -candidate.real[1], -candidate.real[2], -candidate.real[3]],
        dual: [-candidate.dual[0], -candidate.dual[1], -candidate.dual[2], -candidate.dual[3]],
      },
      flipped: true,
    };
  }
  return { aligned: candidate, flipped: false };
}

/** 정점 본 가중치 목록에 대해 반구 부호 정렬 후 선형 결합·정규화된 단위 듀얼 쿼터니언을 구한다. */
export function blendUnitDualQuats(
  boneDualQuats: readonly DualQuat[],
  influences: readonly VertexBoneInfluence[],
): { readonly dualQuat: DualQuat; readonly antipodalFlips: number } {
  if (influences.length === 0) {
    return { dualQuat: { real: [0, 0, 0, 1], dual: [0, 0, 0, 0] }, antipodalFlips: 0 };
  }
  let weightSum = 0;
  let leadBoneIndex = influences[0].boneIndex;
  let leadWeight = -1;
  for (const inf of influences) {
    if (inf.weight <= 0) continue;
    weightSum += inf.weight;
    if (inf.weight > leadWeight || (inf.weight === leadWeight && inf.boneIndex < leadBoneIndex)) {
      leadWeight = inf.weight;
      leadBoneIndex = inf.boneIndex;
    }
  }
  if (weightSum <= DQ_EPSILON) {
    return { dualQuat: { real: [0, 0, 0, 1], dual: [0, 0, 0, 0] }, antipodalFlips: 0 };
  }

  const invWeightSum = 1 / weightSum;
  const referenceReal = (boneDualQuats[leadBoneIndex] ?? { real: [0, 0, 0, 1] }).real;
  let rx = 0;
  let ry = 0;
  let rz = 0;
  let rw = 0;
  let dx = 0;
  let dy = 0;
  let dz = 0;
  let dw = 0;
  let antipodalFlips = 0;

  for (const inf of influences) {
    if (inf.weight <= 0) continue;
    const boneDq = boneDualQuats[inf.boneIndex];
    if (!boneDq) continue;
    const w = inf.weight * invWeightSum;
    const { aligned, flipped } = alignDualQuatHemisphere(referenceReal, boneDq);
    if (flipped) antipodalFlips += 1;
    rx += w * aligned.real[0];
    ry += w * aligned.real[1];
    rz += w * aligned.real[2];
    rw += w * aligned.real[3];
    dx += w * aligned.dual[0];
    dy += w * aligned.dual[1];
    dz += w * aligned.dual[2];
    dw += w * aligned.dual[3];
  }

  return {
    dualQuat: normalizeDualQuat({ real: [rx, ry, rz, rw], dual: [dx, dy, dz, dw] }),
    antipodalFlips,
  };
}

export function dualQuatTransformPoint(dqInput: DualQuat, point: Vec3): Vec3 {
  const { rotation, translation } = dualQuatToRigidTransform(dqInput);
  const rotated = quatRotateVec3(rotation, point);
  return [rotated[0] + translation[0], rotated[1] + translation[1], rotated[2] + translation[2]];
}

export function dualQuatTransformNormal(dqInput: DualQuat, normal: Vec3): Vec3 {
  const dq = normalizeDualQuat(dqInput);
  const rotated = quatRotateVec3(dq.real, normal);
  const len = Math.hypot(rotated[0], rotated[1], rotated[2]);
  return len <= DQ_EPSILON ? [0, 1, 0] : [rotated[0] / len, rotated[1] / len, rotated[2] / len];
}

/** 계층 본 스켈레톤의 바인드/포즈 월드 변환, 스키닝 듀얼 쿼터니언, 로컬 회전 특징 벡터를 평가한다. */
export function evaluateSkeletonSkinningState(
  bones: readonly RigBoneBindSpec[],
  localPoseOverrides: Readonly<Record<string, Partial<RigidTransform3D>>>,
  driverBoneIds?: readonly string[],
): {
  readonly bindWorldTransforms: readonly RigidTransform3D[];
  readonly poseWorldTransforms: readonly RigidTransform3D[];
  readonly skinningTransforms: readonly RigidTransform3D[];
  readonly skinningDualQuats: readonly DualQuat[];
  readonly poseFeatures: readonly number[];
} {
  const bindWorld: RigidTransform3D[] = [];
  const poseWorld: RigidTransform3D[] = [];
  const skinTransforms: RigidTransform3D[] = [];
  const skinDualQuats: DualQuat[] = [];
  const localRotDeltaById = new Map<string, QuatXYZW>();

  for (let i = 0; i < bones.length; i += 1) {
    const bone = bones[i];
    const override = localPoseOverrides[bone.id];
    const poseLocal: RigidTransform3D = {
      rotation: override?.rotation
        ? quatNormalize(override.rotation)
        : bone.bindLocalTransform.rotation,
      translation: override?.translation ?? bone.bindLocalTransform.translation,
    };
    const bindLocalInv = quatConjugate(quatNormalize(bone.bindLocalTransform.rotation));
    localRotDeltaById.set(bone.id, quatNormalize(quatMultiply(bindLocalInv, poseLocal.rotation)));

    const bWorld =
      bone.parentIndex >= 0 && bone.parentIndex < i
        ? composeRigidTransforms(bindWorld[bone.parentIndex], bone.bindLocalTransform)
        : {
            rotation: quatNormalize(bone.bindLocalTransform.rotation),
            translation: bone.bindLocalTransform.translation,
          };
    const pWorld =
      bone.parentIndex >= 0 && bone.parentIndex < i
        ? composeRigidTransforms(poseWorld[bone.parentIndex], poseLocal)
        : poseLocal;

    bindWorld.push(bWorld);
    poseWorld.push(pWorld);
    const delta = computeSkinningRigidDelta(bWorld, pWorld);
    skinTransforms.push(delta);
    skinDualQuats.push(rigidTransformToDualQuat(delta));
  }

  const featureIds = driverBoneIds ?? bones.map((bone) => bone.id);
  const poseFeatures: number[] = [];
  for (const id of featureIds) {
    const rotVec = quatToRotationVector(localRotDeltaById.get(id) ?? [0, 0, 0, 1]);
    poseFeatures.push(rotVec[0], rotVec[1], rotVec[2]);
  }

  return {
    bindWorldTransforms: bindWorld,
    poseWorldTransforms: poseWorld,
    skinningTransforms: skinTransforms,
    skinningDualQuats: skinDualQuats,
    poseFeatures,
  };
}
