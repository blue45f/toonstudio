/**
 * Mixamo · VRM · FBX · Blender Rigify → ToonStudio 표준 휴머노이드 오토 리타게터.
 *
 * - 본 별칭 정규화 + T-pose/A-pose 레스트 포즈 델타 쿼터니언 전달 + 반구 연속성 정렬
 * - 사지 길이·골반 높이 정규화 및 Wave-2 Rust `humanoid_body_ik_kernel` 호환 힌트 생성
 */

export type Vec3 = readonly [number, number, number];
export type Quat4 = readonly [number, number, number, number];

export const TOONSTUDIO_HUMANOID_BONES = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "leftToes",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "rightToes",
] as const;

export type ToonStudioHumanoidBone = (typeof TOONSTUDIO_HUMANOID_BONES)[number];
export type HumanoidRestPoseKind = "T-pose" | "A-pose";
export type HumanoidSkeletonConvention = "mixamo" | "vrm" | "fbx" | "rigify" | "custom";

export interface SourceBoneRestSpec {
  readonly name: string;
  readonly parent: string | null;
  readonly restLocalPosition: Vec3;
  readonly restLocalRotation: Quat4;
}

export interface SourcePoseFrame {
  readonly timeSec: number;
  readonly rootTranslation?: Vec3;
  readonly localRotations: Readonly<Record<string, Quat4>>;
}

export interface TargetHumanoidRigSpec {
  readonly restPose: HumanoidRestPoseKind;
  readonly hipHeightMeters: number;
  readonly restLocalRotations?: Readonly<Partial<Record<ToonStudioHumanoidBone, Quat4>>>;
  readonly restWorldPositions?: Readonly<Partial<Record<ToonStudioHumanoidBone, Vec3>>>;
  readonly floorY?: number;
  readonly footSoleOffset?: number;
}

export interface HumanoidRetargetInput {
  readonly sourceBones: readonly SourceBoneRestSpec[];
  readonly sourceRestPose: HumanoidRestPoseKind;
  readonly frames: readonly SourcePoseFrame[];
  readonly targetRig: TargetHumanoidRigSpec;
  readonly aPoseArmAngleRad?: number;
}

export interface RetargetedPoseFrame {
  readonly timeSec: number;
  readonly rootTranslation: Vec3;
  readonly localRotations: Readonly<Partial<Record<ToonStudioHumanoidBone, Quat4>>>;
  readonly worldRotations: Readonly<Partial<Record<ToonStudioHumanoidBone, Quat4>>>;
}

export interface Wave2TwoBoneIkHint {
  readonly upperLength: number;
  readonly lowerLength: number;
  readonly softExtensionRatio: number;
  readonly minBendAngleRad: number;
  readonly floorY: number | null;
  readonly footSoleOffset: number;
}

export interface Wave2SpineCcdHint {
  readonly jointNames: readonly ToonStudioHumanoidBone[];
  readonly restBoneLengths: readonly number[];
  readonly maxJointBendRad: number;
  readonly damping: number;
}

export interface Wave2HumanoidIkKernelHints {
  readonly leftArm: Wave2TwoBoneIkHint;
  readonly rightArm: Wave2TwoBoneIkHint;
  readonly leftLeg: Wave2TwoBoneIkHint;
  readonly rightLeg: Wave2TwoBoneIkHint;
  readonly spineChain: Wave2SpineCcdHint;
}

export interface HumanoidRetargetResult {
  readonly sourceConvention: HumanoidSkeletonConvention;
  readonly mappedBones: Readonly<Record<string, ToonStudioHumanoidBone>>;
  readonly unmappedSourceBones: readonly string[];
  readonly missingTargetBones: readonly ToonStudioHumanoidBone[];
  readonly hipScaleRatio: number;
  readonly limbScaleRatios: {
    readonly leftArm: number;
    readonly rightArm: number;
    readonly leftLeg: number;
    readonly rightLeg: number;
    readonly spine: number;
  };
  readonly restPoseDeltaQuaternions: Readonly<Partial<Record<ToonStudioHumanoidBone, Quat4>>>;
  readonly frames: readonly RetargetedPoseFrame[];
  readonly ikKernelHints: Wave2HumanoidIkKernelHints;
}

const EPS = 1e-8;
const DEFAULT_APOSE_ARM_RAD = (38 * Math.PI) / 180;
const IDENTITY_QUAT: Quat4 = [0, 0, 0, 1];

export const HUMANOID_PARENT_MAP: Readonly<Record<ToonStudioHumanoidBone, ToonStudioHumanoidBone | null>> = {
  hips: null,
  spine: "hips",
  chest: "spine",
  upperChest: "chest",
  neck: "upperChest",
  head: "neck",
  leftShoulder: "upperChest",
  leftUpperArm: "leftShoulder",
  leftLowerArm: "leftUpperArm",
  leftHand: "leftLowerArm",
  rightShoulder: "upperChest",
  rightUpperArm: "rightShoulder",
  rightLowerArm: "rightUpperArm",
  rightHand: "rightLowerArm",
  leftUpperLeg: "hips",
  leftLowerLeg: "leftUpperLeg",
  leftFoot: "leftLowerLeg",
  leftToes: "leftFoot",
  rightUpperLeg: "hips",
  rightLowerLeg: "rightUpperLeg",
  rightFoot: "rightLowerLeg",
  rightToes: "rightFoot",
};

const DEFAULT_TOONSTUDIO_POSITIONS: Readonly<Record<ToonStudioHumanoidBone, Vec3>> = {
  hips: [0, 0.94, 0],
  spine: [0, 1.07, 0],
  chest: [0, 1.24, 0],
  upperChest: [0, 1.38, 0],
  neck: [0, 1.49, 0],
  head: [0, 1.61, 0],
  leftShoulder: [0.09, 1.42, 0],
  leftUpperArm: [0.18, 1.41, 0],
  leftLowerArm: [0.46, 1.41, 0],
  leftHand: [0.72, 1.41, 0],
  rightShoulder: [-0.09, 1.42, 0],
  rightUpperArm: [-0.18, 1.41, 0],
  rightLowerArm: [-0.46, 1.41, 0],
  rightHand: [-0.72, 1.41, 0],
  leftUpperLeg: [0.1, 0.9, 0],
  leftLowerLeg: [0.1, 0.49, 0],
  leftFoot: [0.1, 0.08, 0],
  leftToes: [0.1, 0.02, 0.14],
  rightUpperLeg: [-0.1, 0.9, 0],
  rightLowerLeg: [-0.1, 0.49, 0],
  rightFoot: [-0.1, 0.08, 0],
  rightToes: [-0.1, 0.02, 0.14],
};

const CANONICAL_BONE_ALIASES: Readonly<Record<string, ToonStudioHumanoidBone>> = {
  hips: "hips",
  pelvis: "hips",
  roothips: "hips",
  spine: "spine",
  spine01: "spine",
  spine1: "chest",
  chest: "chest",
  spine02: "chest",
  spine2: "upperChest",
  upperchest: "upperChest",
  spine03: "upperChest",
  spine001: "spine",
  spine002: "chest",
  spine003: "upperChest",
  spine004: "neck",
  spine005: "neck",
  spine006: "head",
  neck: "neck",
  neck01: "neck",
  head: "head",
  leftshoulder: "leftShoulder",
  shoulderl: "leftShoulder",
  claviclel: "leftShoulder",
  lclavicle: "leftShoulder",
  leftclavicle: "leftShoulder",
  leftarm: "leftUpperArm",
  leftupperarm: "leftUpperArm",
  upperarml: "leftUpperArm",
  lupperarm: "leftUpperArm",
  leftforearm: "leftLowerArm",
  leftlowerarm: "leftLowerArm",
  lowerarml: "leftLowerArm",
  forearml: "leftLowerArm",
  lforearm: "leftLowerArm",
  lefthand: "leftHand",
  handl: "leftHand",
  lhand: "leftHand",
  rightshoulder: "rightShoulder",
  shoulderr: "rightShoulder",
  clavicler: "rightShoulder",
  rclavicle: "rightShoulder",
  rightclavicle: "rightShoulder",
  rightarm: "rightUpperArm",
  rightupperarm: "rightUpperArm",
  upperarmr: "rightUpperArm",
  rupperarm: "rightUpperArm",
  rightforearm: "rightLowerArm",
  rightlowerarm: "rightLowerArm",
  lowerarmr: "rightLowerArm",
  forearmr: "rightLowerArm",
  rforearm: "rightLowerArm",
  righthand: "rightHand",
  handr: "rightHand",
  rhand: "rightHand",
  leftupleg: "leftUpperLeg",
  leftupperleg: "leftUpperLeg",
  leftthigh: "leftUpperLeg",
  thighl: "leftUpperLeg",
  lthigh: "leftUpperLeg",
  leftleg: "leftLowerLeg",
  leftlowerleg: "leftLowerLeg",
  leftcalf: "leftLowerLeg",
  calfl: "leftLowerLeg",
  shinl: "leftLowerLeg",
  lcalf: "leftLowerLeg",
  leftfoot: "leftFoot",
  footl: "leftFoot",
  lfoot: "leftFoot",
  lefttoebase: "leftToes",
  lefttoes: "leftToes",
  lefttoe: "leftToes",
  toel: "leftToes",
  balll: "leftToes",
  rightupleg: "rightUpperLeg",
  rightupperleg: "rightUpperLeg",
  rightthigh: "rightUpperLeg",
  thighr: "rightUpperLeg",
  rthigh: "rightUpperLeg",
  rightleg: "rightLowerLeg",
  rightlowerleg: "rightLowerLeg",
  rightcalf: "rightLowerLeg",
  calfr: "rightLowerLeg",
  shinr: "rightLowerLeg",
  rcalf: "rightLowerLeg",
  rightfoot: "rightFoot",
  footr: "rightFoot",
  rfoot: "rightFoot",
  righttoebase: "rightToes",
  righttoes: "rightToes",
  righttoe: "rightToes",
  toer: "rightToes",
  ballr: "rightToes",
};

function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
}

function v3Dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function v3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function qNormalize(q: Quat4): Quat4 {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  if (!Number.isFinite(len) || len <= EPS) return IDENTITY_QUAT;
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

function qConjugate(q: Quat4): Quat4 {
  const n = qNormalize(q);
  return [-n[0], -n[1], -n[2], n[3]];
}

export function multiplyQuaternions(a: Quat4, b: Quat4): Quat4 {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return qNormalize([
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]);
}

export function quaternionFromAxisAngle(axis: Vec3, angleRad: number): Quat4 {
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  if (!Number.isFinite(len) || len <= EPS || !Number.isFinite(angleRad)) return IDENTITY_QUAT;
  const half = angleRad * 0.5;
  const s = Math.sin(half) / len;
  return qNormalize([axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)]);
}

function qRotateVec3(q: Quat4, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = qNormalize(q);
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

function qAlignHemisphere(q: Quat4, ref: Quat4 | undefined): Quat4 {
  const n = qNormalize(q);
  if (!ref) return n;
  const dot = n[0] * ref[0] + n[1] * ref[1] + n[2] * ref[2] + n[3] * ref[3];
  return dot < 0 ? [-n[0], -n[1], -n[2], -n[3]] : n;
}

/** Mixamo / VRM / FBX / Blender Rigify 본 이름을 ToonStudio 표준 휴머노이드 본으로 정규화한다. */
export function resolveHumanoidBoneName(rawName: string): ToonStudioHumanoidBone | null {
  const stripped = rawName
    .trim()
    .replace(/^.*\|/, "")
    .replace(/^mixamorig\d*:/i, "")
    .replace(/^(?:DEF|ORG|MCH)[-_]/i, "")
    .replace(/^J_Bip_(?:C_|L_|R_)?/i, (m) => {
      if (m.toUpperCase().endsWith("L_")) return "left_";
      if (m.toUpperCase().endsWith("R_")) return "right_";
      return "";
    })
    .replace(/^(?:ValveBiped\.Bip01_|Bip01_|CC_Base_)/i, "");
  const compact = stripped.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return CANONICAL_BONE_ALIASES[compact] ?? null;
}

function detectSkeletonConvention(boneNames: readonly string[]): HumanoidSkeletonConvention {
  if (boneNames.some((n) => /^mixamorig\d*:/i.test(n))) return "mixamo";
  if (boneNames.some((n) => /^(?:DEF|ORG|MCH)[-_]/i.test(n) || /\.[LR]$/.test(n))) return "rigify";
  if (boneNames.some((n) => /^J_Bip_/i.test(n) || n === "upperChest" || n === "leftUpperArm")) {
    return "vrm";
  }
  if (boneNames.some((n) => /_(?:l|r|01|02)$/i.test(n) || /^Bip01_/i.test(n))) return "fbx";
  return "custom";
}

function buildCanonicalRestLocalRotations(
  restPose: HumanoidRestPoseKind,
  aPoseArmRad: number,
): Readonly<Partial<Record<ToonStudioHumanoidBone, Quat4>>> {
  if (restPose === "T-pose") return {};
  return {
    leftUpperArm: quaternionFromAxisAngle([0, 0, 1], -aPoseArmRad),
    rightUpperArm: quaternionFromAxisAngle([0, 0, 1], aPoseArmRad),
  };
}

function computeSourceWorldTransforms(
  bones: readonly SourceBoneRestSpec[],
  localOverride?: Readonly<Record<string, Quat4>>,
): { readonly worldRot: Map<string, Quat4>; readonly worldPos: Map<string, Vec3> } {
  const byName = new Map<string, SourceBoneRestSpec>();
  for (const b of bones) byName.set(b.name, b);

  const worldRot = new Map<string, Quat4>();
  const worldPos = new Map<string, Vec3>();

  const resolve = (name: string): void => {
    if (worldRot.has(name)) return;
    const spec = byName.get(name);
    if (!spec) return;
    const localRot = qNormalize(localOverride?.[name] ?? spec.restLocalRotation);
    if (spec.parent && byName.has(spec.parent)) {
      resolve(spec.parent);
      const pRot = worldRot.get(spec.parent) ?? IDENTITY_QUAT;
      const pPos = worldPos.get(spec.parent) ?? [0, 0, 0];
      worldRot.set(name, multiplyQuaternions(pRot, localRot));
      worldPos.set(name, v3Add(pPos, qRotateVec3(pRot, spec.restLocalPosition)));
    } else {
      worldRot.set(name, localRot);
      worldPos.set(name, spec.restLocalPosition);
    }
  };

  for (const b of bones) resolve(b.name);
  return { worldRot, worldPos };
}

function computeTargetRestWorldRotations(
  targetRig: TargetHumanoidRigSpec,
  aPoseArmRad: number,
): Map<ToonStudioHumanoidBone, Quat4> {
  const defaults = buildCanonicalRestLocalRotations(targetRig.restPose, aPoseArmRad);
  const world = new Map<ToonStudioHumanoidBone, Quat4>();
  for (const bone of TOONSTUDIO_HUMANOID_BONES) {
    const local = qNormalize(targetRig.restLocalRotations?.[bone] ?? defaults[bone] ?? IDENTITY_QUAT);
    const parent = HUMANOID_PARENT_MAP[bone];
    const parentRot = parent ? (world.get(parent) ?? IDENTITY_QUAT) : IDENTITY_QUAT;
    world.set(bone, multiplyQuaternions(parentRot, local));
  }
  return world;
}

/**
 * Mixamo/VRM/FBX/Rigify 휴머노이드 애니메이션을 T-pose/A-pose 델타 쿼터니언 및
 * 사지 길이 정규화와 함께 ToonStudio 표준 리그(+ Wave-2 Rust IK 힌트)로 리타게팅한다.
 */
export function retargetHumanoidAnimation(input: HumanoidRetargetInput): HumanoidRetargetResult {
  const aPoseArmRad = clamp(input.aPoseArmAngleRad ?? DEFAULT_APOSE_ARM_RAD, 0.1, Math.PI * 0.45);
  const sourceConvention = detectSkeletonConvention(input.sourceBones.map((b) => b.name));

  const mappedBones: Record<string, ToonStudioHumanoidBone> = {};
  const targetToSource = new Map<ToonStudioHumanoidBone, string>();
  const unmappedSourceBones: string[] = [];

  for (const bone of input.sourceBones) {
    const canonical = resolveHumanoidBoneName(bone.name);
    if (canonical && !targetToSource.has(canonical)) {
      mappedBones[bone.name] = canonical;
      targetToSource.set(canonical, bone.name);
    } else {
      unmappedSourceBones.push(bone.name);
    }
  }

  const missingTargetBones = TOONSTUDIO_HUMANOID_BONES.filter((b) => !targetToSource.has(b));
  const srcCanonicalDefaults = buildCanonicalRestLocalRotations(input.sourceRestPose, aPoseArmRad);
  const effectiveSourceRestLocals: Record<string, Quat4> = {};
  for (const b of input.sourceBones) {
    const mapped = mappedBones[b.name];
    const isIdentity =
      Math.abs(b.restLocalRotation[0]) +
        Math.abs(b.restLocalRotation[1]) +
        Math.abs(b.restLocalRotation[2]) <
      1e-5;
    effectiveSourceRestLocals[b.name] =
      isIdentity && mapped && srcCanonicalDefaults[mapped]
        ? srcCanonicalDefaults[mapped]
        : qNormalize(b.restLocalRotation);
  }

  const srcRest = computeSourceWorldTransforms(input.sourceBones, effectiveSourceRestLocals);
  const tgtRestWorldRot = computeTargetRestWorldRotations(input.targetRig, aPoseArmRad);

  const getSrcPos = (bone: ToonStudioHumanoidBone): Vec3 | null => {
    const srcName = targetToSource.get(bone);
    return srcName ? (srcRest.worldPos.get(srcName) ?? null) : null;
  };
  const getTgtPos = (bone: ToonStudioHumanoidBone): Vec3 =>
    input.targetRig.restWorldPositions?.[bone] ?? DEFAULT_TOONSTUDIO_POSITIONS[bone];

  const srcHipsY = Math.max(0.1, getSrcPos("hips")?.[1] ?? input.targetRig.hipHeightMeters);
  const tgtHipsY = Math.max(0.1, input.targetRig.hipHeightMeters);
  const hipScaleRatio = tgtHipsY / srcHipsY;

  const measureLimb = (
    a: ToonStudioHumanoidBone,
    b: ToonStudioHumanoidBone,
    c: ToonStudioHumanoidBone,
  ): { readonly upper: number; readonly lower: number; readonly ratio: number } => {
    const tUpper = Math.max(0.05, v3Dist(getTgtPos(a), getTgtPos(b)));
    const tLower = Math.max(0.05, v3Dist(getTgtPos(b), getTgtPos(c)));
    const sa = getSrcPos(a);
    const sb = getSrcPos(b);
    const sc = getSrcPos(c);
    const sTotal = sa && sb && sc ? Math.max(0.1, v3Dist(sa, sb) + v3Dist(sb, sc)) : tUpper + tLower;
    return { upper: tUpper, lower: tLower, ratio: (tUpper + tLower) / sTotal };
  };

  const leftArmM = measureLimb("leftUpperArm", "leftLowerArm", "leftHand");
  const rightArmM = measureLimb("rightUpperArm", "rightLowerArm", "rightHand");
  const leftLegM = measureLimb("leftUpperLeg", "leftLowerLeg", "leftFoot");
  const rightLegM = measureLimb("rightUpperLeg", "rightLowerLeg", "rightFoot");

  const spineJoints: readonly ToonStudioHumanoidBone[] = ["hips", "spine", "chest", "upperChest", "neck", "head"];
  const spineLengths: number[] = [];
  let targetSpineSum = 0;
  let sourceSpineSum = 0;
  for (let i = 0; i + 1 < spineJoints.length; i += 1) {
    const b0 = spineJoints[i];
    const b1 = spineJoints[i + 1];
    if (!b0 || !b1) continue;
    const tLen = Math.max(0.04, v3Dist(getTgtPos(b0), getTgtPos(b1)));
    spineLengths.push(tLen);
    targetSpineSum += tLen;
    const sp0 = getSrcPos(b0);
    const sp1 = getSrcPos(b1);
    sourceSpineSum += sp0 && sp1 ? Math.max(0.04, v3Dist(sp0, sp1)) : tLen;
  }

  const restPoseDeltaQuaternions: Partial<Record<ToonStudioHumanoidBone, Quat4>> = {};
  for (const bone of TOONSTUDIO_HUMANOID_BONES) {
    const srcName = targetToSource.get(bone);
    if (!srcName) continue;
    const srcR = srcRest.worldRot.get(srcName) ?? IDENTITY_QUAT;
    const tgtR = tgtRestWorldRot.get(bone) ?? IDENTITY_QUAT;
    restPoseDeltaQuaternions[bone] = multiplyQuaternions(tgtR, qConjugate(srcR));
  }

  const prevLocalByBone = new Map<ToonStudioHumanoidBone, Quat4>();
  const retargetedFrames: RetargetedPoseFrame[] = [];
  const floorY = input.targetRig.floorY ?? null;
  const soleOffset = Math.max(0, input.targetRig.footSoleOffset ?? 0);

  for (const frame of input.frames) {
    const animLocals: Record<string, Quat4> = { ...effectiveSourceRestLocals };
    for (const [boneName, rot] of Object.entries(frame.localRotations)) {
      animLocals[boneName] = qNormalize(rot);
    }
    const srcAnim = computeSourceWorldTransforms(input.sourceBones, animLocals);
    const tgtWorldRot: Partial<Record<ToonStudioHumanoidBone, Quat4>> = {};
    const tgtLocalRot: Partial<Record<ToonStudioHumanoidBone, Quat4>> = {};

    for (const bone of TOONSTUDIO_HUMANOID_BONES) {
      const parent = HUMANOID_PARENT_MAP[bone];
      const parentWorld = parent ? (tgtWorldRot[parent] ?? tgtRestWorldRot.get(parent) ?? IDENTITY_QUAT) : IDENTITY_QUAT;
      const tgtRest = tgtRestWorldRot.get(bone) ?? IDENTITY_QUAT;
      const srcName = targetToSource.get(bone);

      let worldQ: Quat4;
      if (srcName) {
        const srcRestQ = srcRest.worldRot.get(srcName) ?? IDENTITY_QUAT;
        const srcAnimQ = srcAnim.worldRot.get(srcName) ?? srcRestQ;
        const worldDelta = multiplyQuaternions(srcAnimQ, qConjugate(srcRestQ));
        worldQ = multiplyQuaternions(worldDelta, tgtRest);
      } else {
        const defaultLocals = buildCanonicalRestLocalRotations(input.targetRig.restPose, aPoseArmRad);
        const restLocal = qNormalize(input.targetRig.restLocalRotations?.[bone] ?? defaultLocals[bone] ?? IDENTITY_QUAT);
        worldQ = multiplyQuaternions(parentWorld, restLocal);
      }

      const alignedLocal = qAlignHemisphere(multiplyQuaternions(qConjugate(parentWorld), worldQ), prevLocalByBone.get(bone));
      prevLocalByBone.set(bone, alignedLocal);
      tgtWorldRot[bone] = worldQ;
      tgtLocalRot[bone] = alignedLocal;
    }

    const srcRoot = frame.rootTranslation ?? getSrcPos("hips") ?? [0, srcHipsY, 0];
    const minHipY = floorY !== null ? floorY + soleOffset : Number.NEGATIVE_INFINITY;
    retargetedFrames.push({
      timeSec: frame.timeSec,
      rootTranslation: [
        srcRoot[0] * hipScaleRatio,
        Math.max(minHipY, srcRoot[1] * hipScaleRatio),
        srcRoot[2] * hipScaleRatio,
      ],
      localRotations: tgtLocalRot,
      worldRotations: tgtWorldRot,
    });
  }

  return {
    sourceConvention,
    mappedBones,
    unmappedSourceBones,
    missingTargetBones,
    hipScaleRatio,
    limbScaleRatios: {
      leftArm: leftArmM.ratio,
      rightArm: rightArmM.ratio,
      leftLeg: leftLegM.ratio,
      rightLeg: rightLegM.ratio,
      spine: sourceSpineSum > EPS ? targetSpineSum / sourceSpineSum : 1,
    },
    restPoseDeltaQuaternions,
    frames: retargetedFrames,
    ikKernelHints: {
      leftArm: { upperLength: leftArmM.upper, lowerLength: leftArmM.lower, softExtensionRatio: 0.995, minBendAngleRad: 0.02, floorY: null, footSoleOffset: 0 },
      rightArm: { upperLength: rightArmM.upper, lowerLength: rightArmM.lower, softExtensionRatio: 0.995, minBendAngleRad: 0.02, floorY: null, footSoleOffset: 0 },
      leftLeg: { upperLength: leftLegM.upper, lowerLength: leftLegM.lower, softExtensionRatio: 0.995, minBendAngleRad: 0.02, floorY, footSoleOffset: soleOffset },
      rightLeg: { upperLength: rightLegM.upper, lowerLength: rightLegM.lower, softExtensionRatio: 0.995, minBendAngleRad: 0.02, floorY, footSoleOffset: soleOffset },
      spineChain: { jointNames: spineJoints, restBoneLengths: spineLengths, maxJointBendRad: 0.65, damping: 0.75 },
    },
  };
}
