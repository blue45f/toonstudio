/**
 * Wave 118 — 웹툰 해부학 공통 타입 · 3D 행렬 수학 · 4종 등신대 프로파일 · 5종 정규 포즈 프리셋.
 *
 * 좌표계 규약 (오른손 미터 단위, 1.0 = 1m):
 * - +Y: 수직 위쪽 (바닥면 y = 0)
 * - +Z: 캐릭터 정면(기본 카메라 방향)
 * - +X: 정면 카메라 기준 화면 오른쪽(캐릭터 해부학적 왼쪽)
 */

export const ANATOMY_JOINT_IDS = [
  "pelvis",
  "spine",
  "chest",
  "neck",
  "head",
  "leftShoulder",
  "leftElbow",
  "leftWrist",
  "rightShoulder",
  "rightElbow",
  "rightWrist",
  "leftHip",
  "leftKnee",
  "leftAnkle",
  "rightHip",
  "rightKnee",
  "rightAnkle",
] as const;

export type AnatomyJointId = (typeof ANATOMY_JOINT_IDS)[number];

export type WebtoonProportionPreset =
  | "action-8head"
  | "romance-7.5head"
  | "slice-of-life-6.5head"
  | "chibi-sd-3head";

export type WebtoonPosePreset =
  | "standing-neutral"
  | "hero-punch-toward-camera"
  | "high-kick-low-angle"
  | "crouch-ready-sprint"
  | "dramatic-fall-high-angle";

export type AnatomyBoneId =
  | "lowerTorso"
  | "upperTorso"
  | "neckBone"
  | "headBone"
  | "leftClavicle"
  | "leftUpperArm"
  | "leftForearm"
  | "rightClavicle"
  | "rightUpperArm"
  | "rightForearm"
  | "leftPelvisBridge"
  | "leftThigh"
  | "leftShin"
  | "rightPelvisBridge"
  | "rightThigh"
  | "rightShin";

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface LimbBallJointAngles {
  readonly pitchDeg: number;
  readonly abductionDeg: number;
  readonly twistDeg: number;
}

export interface AnatomyPoseAngles {
  readonly pelvisOffsetM: Vec3;
  readonly pelvisPitchDeg: number;
  readonly pelvisYawDeg: number;
  readonly pelvisRollDeg: number;
  readonly spinePitchDeg: number;
  readonly spineYawDeg: number;
  readonly spineRollDeg: number;
  readonly chestPitchDeg: number;
  readonly chestYawDeg: number;
  readonly chestRollDeg: number;
  readonly neckPitchDeg: number;
  readonly neckYawDeg: number;
  readonly neckRollDeg: number;
  readonly leftShoulder: LimbBallJointAngles;
  readonly leftElbowFlexDeg: number;
  readonly rightShoulder: LimbBallJointAngles;
  readonly rightElbowFlexDeg: number;
  readonly leftHip: LimbBallJointAngles;
  readonly leftKneeFlexDeg: number;
  readonly rightHip: LimbBallJointAngles;
  readonly rightKneeFlexDeg: number;
  readonly grounded: boolean;
}

export interface AnatomyPoseAngleOverrides {
  readonly pelvisOffsetM?: Partial<Vec3>;
  readonly pelvisPitchDeg?: number;
  readonly pelvisYawDeg?: number;
  readonly pelvisRollDeg?: number;
  readonly spinePitchDeg?: number;
  readonly spineYawDeg?: number;
  readonly spineRollDeg?: number;
  readonly chestPitchDeg?: number;
  readonly chestYawDeg?: number;
  readonly chestRollDeg?: number;
  readonly neckPitchDeg?: number;
  readonly neckYawDeg?: number;
  readonly neckRollDeg?: number;
  readonly leftShoulder?: Partial<LimbBallJointAngles>;
  readonly leftElbowFlexDeg?: number;
  readonly rightShoulder?: Partial<LimbBallJointAngles>;
  readonly rightElbowFlexDeg?: number;
  readonly leftHip?: Partial<LimbBallJointAngles>;
  readonly leftKneeFlexDeg?: number;
  readonly rightHip?: Partial<LimbBallJointAngles>;
  readonly rightKneeFlexDeg?: number;
  readonly grounded?: boolean;
}

export interface WebtoonProportionProfile {
  readonly preset: WebtoonProportionPreset;
  readonly labelKo: string;
  readonly headCount: number;
  readonly totalHeightM: number;
  readonly headHeightM: number;
  readonly headWidthM: number;
  readonly footSoleHeightM: number;
  readonly lowerLegM: number;
  readonly upperLegM: number;
  readonly hipToPelvisM: number;
  readonly hipHalfWidthM: number;
  readonly pelvisToSpineM: number;
  readonly spineToChestM: number;
  readonly chestToNeckM: number;
  readonly neckToHeadCenterM: number;
  readonly shoulderHalfWidthM: number;
  readonly upperArmM: number;
  readonly forearmM: number;
  readonly torsoRadiusM: number;
  readonly limbRadiusM: number;
}

export interface AnatomyBoneDefinition {
  readonly id: AnatomyBoneId;
  readonly startJoint: AnatomyJointId;
  readonly endJoint: AnatomyJointId;
  readonly group: "torso" | "head" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg";
  readonly startRadiusM: number;
  readonly endRadiusM: number;
  readonly drawOverlapRings: boolean;
}

export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

export function add3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale3(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function dot3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function len3(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function normalize3(v: Vec3, fallback: Vec3): Vec3 {
  const length = len3(v);
  if (length < 1e-8) return fallback;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

export function mulMat3(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

export function applyMat3(m: Mat3, v: Vec3): Vec3 {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  };
}

export function rotX(deg: number): Mat3 {
  const r = deg * DEG_TO_RAD;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}

export function rotY(deg: number): Mat3 {
  const r = deg * DEG_TO_RAD;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

export function rotZ(deg: number): Mat3 {
  const r = deg * DEG_TO_RAD;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

export function eulerYXZ(yawDeg: number, pitchDeg: number, rollDeg: number): Mat3 {
  return mulMat3(mulMat3(rotY(yawDeg), rotX(pitchDeg)), rotZ(rollDeg));
}

function buildProportionProfile(
  preset: WebtoonProportionPreset,
  labelKo: string,
  headCount: number,
  headHeightM: number,
  ratios: {
    readonly headWidthHeads: number;
    readonly footSoleHeads: number;
    readonly lowerLegHeads: number;
    readonly upperLegHeads: number;
    readonly hipToPelvisHeads: number;
    readonly hipHalfWidthHeads: number;
    readonly pelvisToSpineHeads: number;
    readonly spineToChestHeads: number;
    readonly chestToNeckHeads: number;
    readonly neckToHeadCenterHeads: number;
    readonly shoulderHalfWidthHeads: number;
    readonly upperArmHeads: number;
    readonly forearmHeads: number;
    readonly torsoRadiusHeads: number;
    readonly limbRadiusHeads: number;
  },
): WebtoonProportionProfile {
  return {
    preset,
    labelKo,
    headCount,
    totalHeightM: headCount * headHeightM,
    headHeightM,
    headWidthM: ratios.headWidthHeads * headHeightM,
    footSoleHeightM: ratios.footSoleHeads * headHeightM,
    lowerLegM: ratios.lowerLegHeads * headHeightM,
    upperLegM: ratios.upperLegHeads * headHeightM,
    hipToPelvisM: ratios.hipToPelvisHeads * headHeightM,
    hipHalfWidthM: ratios.hipHalfWidthHeads * headHeightM,
    pelvisToSpineM: ratios.pelvisToSpineHeads * headHeightM,
    spineToChestM: ratios.spineToChestHeads * headHeightM,
    chestToNeckM: ratios.chestToNeckHeads * headHeightM,
    neckToHeadCenterM: ratios.neckToHeadCenterHeads * headHeightM,
    shoulderHalfWidthM: ratios.shoulderHalfWidthHeads * headHeightM,
    upperArmM: ratios.upperArmHeads * headHeightM,
    forearmM: ratios.forearmHeads * headHeightM,
    torsoRadiusM: ratios.torsoRadiusHeads * headHeightM,
    limbRadiusM: ratios.limbRadiusHeads * headHeightM,
  };
}

export const WEBTOON_PROPORTION_PROFILES: Readonly<
  Record<WebtoonProportionPreset, WebtoonProportionProfile>
> = {
  "action-8head": buildProportionProfile("action-8head", "액션 8등신", 8.0, 0.23, {
    headWidthHeads: 0.72, footSoleHeads: 0.30, lowerLegHeads: 1.90, upperLegHeads: 1.90,
    hipToPelvisHeads: 0.10, hipHalfWidthHeads: 0.56, pelvisToSpineHeads: 0.90,
    spineToChestHeads: 1.05, chestToNeckHeads: 0.50, neckToHeadCenterHeads: 0.85,
    shoulderHalfWidthHeads: 1.15, upperArmHeads: 1.45, forearmHeads: 1.35,
    torsoRadiusHeads: 0.68, limbRadiusHeads: 0.25,
  }),
  "romance-7.5head": buildProportionProfile("romance-7.5head", "로맨스 7.5등신", 7.5, 0.224, {
    headWidthHeads: 0.72, footSoleHeads: 0.28, lowerLegHeads: 1.77, upperLegHeads: 1.80,
    hipToPelvisHeads: 0.10, hipHalfWidthHeads: 0.54, pelvisToSpineHeads: 0.85,
    spineToChestHeads: 0.95, chestToNeckHeads: 0.45, neckToHeadCenterHeads: 0.80,
    shoulderHalfWidthHeads: 0.90, upperArmHeads: 1.35, forearmHeads: 1.25,
    torsoRadiusHeads: 0.56, limbRadiusHeads: 0.21,
  }),
  "slice-of-life-6.5head": buildProportionProfile("slice-of-life-6.5head", "일상 6.5등신", 6.5, 0.24, {
    headWidthHeads: 0.76, footSoleHeads: 0.25, lowerLegHeads: 1.45, upperLegHeads: 1.45,
    hipToPelvisHeads: 0.10, hipHalfWidthHeads: 0.52, pelvisToSpineHeads: 0.75,
    spineToChestHeads: 0.85, chestToNeckHeads: 0.40, neckToHeadCenterHeads: 0.75,
    shoulderHalfWidthHeads: 0.86, upperArmHeads: 1.20, forearmHeads: 1.12,
    torsoRadiusHeads: 0.55, limbRadiusHeads: 0.22,
  }),
  "chibi-sd-3head": buildProportionProfile("chibi-sd-3head", "SD 3등신", 3.0, 0.30, {
    headWidthHeads: 0.92, footSoleHeads: 0.12, lowerLegHeads: 0.40, upperLegHeads: 0.43,
    hipToPelvisHeads: 0.05, hipHalfWidthHeads: 0.34, pelvisToSpineHeads: 0.35,
    spineToChestHeads: 0.40, chestToNeckHeads: 0.15, neckToHeadCenterHeads: 0.60,
    shoulderHalfWidthHeads: 0.62, upperArmHeads: 0.52, forearmHeads: 0.48,
    torsoRadiusHeads: 0.38, limbRadiusHeads: 0.17,
  }),
};

const ZERO_VEC3: Vec3 = { x: 0, y: 0, z: 0 };

export const WEBTOON_POSE_PRESETS: Readonly<Record<WebtoonPosePreset, AnatomyPoseAngles>> = {
  "standing-neutral": {
    pelvisOffsetM: ZERO_VEC3,
    pelvisPitchDeg: 0, pelvisYawDeg: 0, pelvisRollDeg: 0,
    spinePitchDeg: 0, spineYawDeg: 0, spineRollDeg: 0,
    chestPitchDeg: 0, chestYawDeg: 0, chestRollDeg: 0,
    neckPitchDeg: 0, neckYawDeg: 0, neckRollDeg: 0,
    leftShoulder: { pitchDeg: 4, abductionDeg: 22, twistDeg: 6 }, leftElbowFlexDeg: 18,
    rightShoulder: { pitchDeg: 4, abductionDeg: 22, twistDeg: 6 }, rightElbowFlexDeg: 18,
    leftHip: { pitchDeg: 0, abductionDeg: 6, twistDeg: 4 }, leftKneeFlexDeg: 4,
    rightHip: { pitchDeg: 0, abductionDeg: 6, twistDeg: 4 }, rightKneeFlexDeg: 4,
    grounded: true,
  },
  "hero-punch-toward-camera": {
    pelvisOffsetM: ZERO_VEC3,
    pelvisPitchDeg: 8, pelvisYawDeg: 14, pelvisRollDeg: -2,
    spinePitchDeg: 12, spineYawDeg: 14, spineRollDeg: -2,
    chestPitchDeg: 8, chestYawDeg: 10, chestRollDeg: 0,
    neckPitchDeg: -14, neckYawDeg: -34, neckRollDeg: 2,
    leftShoulder: { pitchDeg: -36, abductionDeg: 46, twistDeg: 16 }, leftElbowFlexDeg: 92,
    rightShoulder: { pitchDeg: 88, abductionDeg: 34, twistDeg: -14 }, rightElbowFlexDeg: 8,
    leftHip: { pitchDeg: 26, abductionDeg: 14, twistDeg: 10 }, leftKneeFlexDeg: 30,
    rightHip: { pitchDeg: -22, abductionDeg: 12, twistDeg: -10 }, rightKneeFlexDeg: 18,
    grounded: true,
  },
  "high-kick-low-angle": {
    pelvisOffsetM: ZERO_VEC3,
    pelvisPitchDeg: -14, pelvisYawDeg: -18, pelvisRollDeg: 12,
    spinePitchDeg: -12, spineYawDeg: 12, spineRollDeg: 8,
    chestPitchDeg: -6, chestYawDeg: 10, chestRollDeg: 4,
    neckPitchDeg: 14, neckYawDeg: -6, neckRollDeg: -8,
    leftShoulder: { pitchDeg: -22, abductionDeg: 74, twistDeg: 12 }, leftElbowFlexDeg: 44,
    rightShoulder: { pitchDeg: 34, abductionDeg: 62, twistDeg: -10 }, rightElbowFlexDeg: 66,
    leftHip: { pitchDeg: -6, abductionDeg: 8, twistDeg: -8 }, leftKneeFlexDeg: 8,
    rightHip: { pitchDeg: 112, abductionDeg: 28, twistDeg: 16 }, rightKneeFlexDeg: 12,
    grounded: true,
  },
  "crouch-ready-sprint": {
    pelvisOffsetM: ZERO_VEC3,
    pelvisPitchDeg: 28, pelvisYawDeg: -10, pelvisRollDeg: 0,
    spinePitchDeg: 22, spineYawDeg: 14, spineRollDeg: 0,
    chestPitchDeg: 10, chestYawDeg: 8, chestRollDeg: 0,
    neckPitchDeg: -34, neckYawDeg: -8, neckRollDeg: 0,
    leftShoulder: { pitchDeg: 62, abductionDeg: 36, twistDeg: 10 }, leftElbowFlexDeg: 88,
    rightShoulder: { pitchDeg: -50, abductionDeg: 42, twistDeg: -12 }, rightElbowFlexDeg: 74,
    leftHip: { pitchDeg: 78, abductionDeg: 16, twistDeg: 8 }, leftKneeFlexDeg: 94,
    rightHip: { pitchDeg: 34, abductionDeg: 16, twistDeg: -8 }, rightKneeFlexDeg: 82,
    grounded: true,
  },
  "dramatic-fall-high-angle": {
    pelvisOffsetM: { x: 0, y: 1.35, z: 0 },
    pelvisPitchDeg: -24, pelvisYawDeg: 12, pelvisRollDeg: -8,
    spinePitchDeg: -16, spineYawDeg: 10, spineRollDeg: -6,
    chestPitchDeg: -10, chestYawDeg: 8, chestRollDeg: -4,
    neckPitchDeg: 26, neckYawDeg: -12, neckRollDeg: 6,
    leftShoulder: { pitchDeg: 52, abductionDeg: 122, twistDeg: 16 }, leftElbowFlexDeg: 34,
    rightShoulder: { pitchDeg: 68, abductionDeg: 136, twistDeg: -12 }, rightElbowFlexDeg: 24,
    leftHip: { pitchDeg: 36, abductionDeg: 22, twistDeg: 12 }, leftKneeFlexDeg: 68,
    rightHip: { pitchDeg: -14, abductionDeg: 18, twistDeg: -10 }, rightKneeFlexDeg: 42,
    grounded: false,
  },
};

export function mergePoseAngles(
  base: AnatomyPoseAngles,
  overrides?: AnatomyPoseAngleOverrides,
): AnatomyPoseAngles {
  if (!overrides) return base;
  return {
    pelvisOffsetM: {
      x: finiteOr(overrides.pelvisOffsetM?.x, base.pelvisOffsetM.x),
      y: finiteOr(overrides.pelvisOffsetM?.y, base.pelvisOffsetM.y),
      z: finiteOr(overrides.pelvisOffsetM?.z, base.pelvisOffsetM.z),
    },
    pelvisPitchDeg: finiteOr(overrides.pelvisPitchDeg, base.pelvisPitchDeg),
    pelvisYawDeg: finiteOr(overrides.pelvisYawDeg, base.pelvisYawDeg),
    pelvisRollDeg: finiteOr(overrides.pelvisRollDeg, base.pelvisRollDeg),
    spinePitchDeg: finiteOr(overrides.spinePitchDeg, base.spinePitchDeg),
    spineYawDeg: finiteOr(overrides.spineYawDeg, base.spineYawDeg),
    spineRollDeg: finiteOr(overrides.spineRollDeg, base.spineRollDeg),
    chestPitchDeg: finiteOr(overrides.chestPitchDeg, base.chestPitchDeg),
    chestYawDeg: finiteOr(overrides.chestYawDeg, base.chestYawDeg),
    chestRollDeg: finiteOr(overrides.chestRollDeg, base.chestRollDeg),
    neckPitchDeg: finiteOr(overrides.neckPitchDeg, base.neckPitchDeg),
    neckYawDeg: finiteOr(overrides.neckYawDeg, base.neckYawDeg),
    neckRollDeg: finiteOr(overrides.neckRollDeg, base.neckRollDeg),
    leftShoulder: {
      pitchDeg: finiteOr(overrides.leftShoulder?.pitchDeg, base.leftShoulder.pitchDeg),
      abductionDeg: finiteOr(overrides.leftShoulder?.abductionDeg, base.leftShoulder.abductionDeg),
      twistDeg: finiteOr(overrides.leftShoulder?.twistDeg, base.leftShoulder.twistDeg),
    },
    leftElbowFlexDeg: finiteOr(overrides.leftElbowFlexDeg, base.leftElbowFlexDeg),
    rightShoulder: {
      pitchDeg: finiteOr(overrides.rightShoulder?.pitchDeg, base.rightShoulder.pitchDeg),
      abductionDeg: finiteOr(overrides.rightShoulder?.abductionDeg, base.rightShoulder.abductionDeg),
      twistDeg: finiteOr(overrides.rightShoulder?.twistDeg, base.rightShoulder.twistDeg),
    },
    rightElbowFlexDeg: finiteOr(overrides.rightElbowFlexDeg, base.rightElbowFlexDeg),
    leftHip: {
      pitchDeg: finiteOr(overrides.leftHip?.pitchDeg, base.leftHip.pitchDeg),
      abductionDeg: finiteOr(overrides.leftHip?.abductionDeg, base.leftHip.abductionDeg),
      twistDeg: finiteOr(overrides.leftHip?.twistDeg, base.leftHip.twistDeg),
    },
    leftKneeFlexDeg: finiteOr(overrides.leftKneeFlexDeg, base.leftKneeFlexDeg),
    rightHip: {
      pitchDeg: finiteOr(overrides.rightHip?.pitchDeg, base.rightHip.pitchDeg),
      abductionDeg: finiteOr(overrides.rightHip?.abductionDeg, base.rightHip.abductionDeg),
      twistDeg: finiteOr(overrides.rightHip?.twistDeg, base.rightHip.twistDeg),
    },
    rightKneeFlexDeg: finiteOr(overrides.rightKneeFlexDeg, base.rightKneeFlexDeg),
    grounded: overrides.grounded ?? base.grounded,
  };
}

export function buildBoneDefinitions(
  profile: WebtoonProportionProfile,
): readonly AnatomyBoneDefinition[] {
  const tR = profile.torsoRadiusM;
  const lR = profile.limbRadiusM;
  const headR = profile.headWidthM * 0.5;
  return [
    { id: "lowerTorso", startJoint: "pelvis", endJoint: "spine", group: "torso", startRadiusM: tR * 0.96, endRadiusM: tR * 0.84, drawOverlapRings: true },
    { id: "upperTorso", startJoint: "spine", endJoint: "chest", group: "torso", startRadiusM: tR * 0.86, endRadiusM: tR * 1.04, drawOverlapRings: true },
    { id: "neckBone", startJoint: "chest", endJoint: "neck", group: "head", startRadiusM: tR * 0.42, endRadiusM: tR * 0.36, drawOverlapRings: false },
    { id: "headBone", startJoint: "neck", endJoint: "head", group: "head", startRadiusM: headR * 0.65, endRadiusM: headR, drawOverlapRings: false },
    { id: "leftClavicle", startJoint: "chest", endJoint: "leftShoulder", group: "leftArm", startRadiusM: tR * 0.58, endRadiusM: lR * 1.18, drawOverlapRings: false },
    { id: "leftUpperArm", startJoint: "leftShoulder", endJoint: "leftElbow", group: "leftArm", startRadiusM: lR * 1.12, endRadiusM: lR * 0.88, drawOverlapRings: true },
    { id: "leftForearm", startJoint: "leftElbow", endJoint: "leftWrist", group: "leftArm", startRadiusM: lR * 0.86, endRadiusM: lR * 0.66, drawOverlapRings: true },
    { id: "rightClavicle", startJoint: "chest", endJoint: "rightShoulder", group: "rightArm", startRadiusM: tR * 0.58, endRadiusM: lR * 1.18, drawOverlapRings: false },
    { id: "rightUpperArm", startJoint: "rightShoulder", endJoint: "rightElbow", group: "rightArm", startRadiusM: lR * 1.12, endRadiusM: lR * 0.88, drawOverlapRings: true },
    { id: "rightForearm", startJoint: "rightElbow", endJoint: "rightWrist", group: "rightArm", startRadiusM: lR * 0.86, endRadiusM: lR * 0.66, drawOverlapRings: true },
    { id: "leftPelvisBridge", startJoint: "pelvis", endJoint: "leftHip", group: "leftLeg", startRadiusM: tR * 0.72, endRadiusM: lR * 1.42, drawOverlapRings: false },
    { id: "leftThigh", startJoint: "leftHip", endJoint: "leftKnee", group: "leftLeg", startRadiusM: lR * 1.44, endRadiusM: lR * 1.05, drawOverlapRings: true },
    { id: "leftShin", startJoint: "leftKnee", endJoint: "leftAnkle", group: "leftLeg", startRadiusM: lR * 1.02, endRadiusM: lR * 0.74, drawOverlapRings: true },
    { id: "rightPelvisBridge", startJoint: "pelvis", endJoint: "rightHip", group: "rightLeg", startRadiusM: tR * 0.72, endRadiusM: lR * 1.42, drawOverlapRings: false },
    { id: "rightThigh", startJoint: "rightHip", endJoint: "rightKnee", group: "rightLeg", startRadiusM: lR * 1.44, endRadiusM: lR * 1.05, drawOverlapRings: true },
    { id: "rightShin", startJoint: "rightKnee", endJoint: "rightAnkle", group: "rightLeg", startRadiusM: lR * 1.02, endRadiusM: lR * 0.74, drawOverlapRings: true },
  ];
}
