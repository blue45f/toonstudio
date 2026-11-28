/**
 * Wave 118 — 17-관절 웹툰 해부학 리깅 · ROM 가동 범위 감사 · 핀홀 3D 원근 단축(Foreshortening) 투영기.
 */

import {
  ANATOMY_JOINT_IDS,
  DEG_TO_RAD,
  RAD_TO_DEG,
  WEBTOON_POSE_PRESETS,
  WEBTOON_PROPORTION_PROFILES,
  add3,
  applyMat3,
  buildBoneDefinitions,
  clampNum,
  cross3,
  dot3,
  eulerYXZ,
  finiteOr,
  len3,
  mergePoseAngles,
  mulMat3,
  normalize3,
  rotX,
  rotY,
  rotZ,
  scale3,
  sub3,
  type AnatomyBoneDefinition,
  type AnatomyBoneId,
  type AnatomyJointId,
  type AnatomyPoseAngleOverrides,
  type AnatomyPoseAngles,
  type LimbBallJointAngles,
  type Vec2,
  type Vec3,
  type WebtoonPosePreset,
  type WebtoonProportionPreset,
  type WebtoonProportionProfile,
} from "./anatomy-presets-and-math";

export {
  ANATOMY_JOINT_IDS,
  WEBTOON_POSE_PRESETS,
  WEBTOON_PROPORTION_PROFILES,
  mergePoseAngles,
  type AnatomyBoneDefinition,
  type AnatomyBoneId,
  type AnatomyJointId,
  type AnatomyPoseAngleOverrides,
  type AnatomyPoseAngles,
  type LimbBallJointAngles,
  type Vec2,
  type Vec3,
  type WebtoonPosePreset,
  type WebtoonProportionPreset,
  type WebtoonProportionProfile,
};

export type RomViolationKind =
  | "elbow-hyperextension"
  | "elbow-overflexion"
  | "knee-hyperextension"
  | "knee-overflexion"
  | "shoulder-pitch-limit"
  | "shoulder-abduction-limit"
  | "shoulder-twist-limit"
  | "hip-pitch-limit"
  | "hip-abduction-limit"
  | "hip-twist-limit"
  | "spine-range-limit"
  | "neck-range-limit";

export interface JointRomViolation {
  readonly jointId: AnatomyJointId;
  readonly axis: string;
  readonly kind: RomViolationKind;
  readonly rawDeg: number;
  readonly clampedDeg: number;
  readonly minDeg: number;
  readonly maxDeg: number;
  readonly severity: "error" | "warn";
  readonly messageKo: string;
}

export interface JointRomAuditResult {
  readonly isAnatomicallyValid: boolean;
  readonly totalViolationCount: number;
  readonly hyperextensionViolationCount: number;
  readonly twistViolationCount: number;
  readonly violations: readonly JointRomViolation[];
  readonly clampedAngles: AnatomyPoseAngles;
}

export interface WebtoonAnatomyPoseInput {
  readonly proportionPreset: WebtoonProportionPreset;
  readonly posePreset?: WebtoonPosePreset;
  readonly customAngles?: AnatomyPoseAngleOverrides;
  readonly clampToRom?: boolean;
}

export interface WebtoonAnatomyPose {
  readonly proportionPreset: WebtoonProportionPreset;
  readonly posePreset: WebtoonPosePreset;
  readonly profile: WebtoonProportionProfile;
  readonly rawAngles: AnatomyPoseAngles;
  readonly appliedAngles: AnatomyPoseAngles;
  readonly clampApplied: boolean;
  readonly grounded: boolean;
  readonly romAudit: JointRomAuditResult;
  readonly joints: Readonly<Record<AnatomyJointId, Vec3>>;
  readonly jointRadiiM: Readonly<Record<AnatomyJointId, number>>;
  readonly bones: readonly AnatomyBoneDefinition[];
  readonly standingHeadRatio: number;
  readonly boundsMinM: Vec3;
  readonly boundsMaxM: Vec3;
}

export type CameraDistanceMode = "focal-matched-framing" | "fixed-physical";

export interface ForeshorteningCameraInput {
  readonly focalLengthMm: number;
  readonly cameraYawDeg?: number;
  readonly cameraPitchDeg?: number;
  readonly cameraDistanceM?: number;
  readonly cameraDistanceMode?: CameraDistanceMode;
  readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number;
}

export interface ProjectedJoint2D {
  readonly jointId: AnatomyJointId;
  readonly worldPosM: Vec3;
  readonly screenX: number;
  readonly screenY: number;
  readonly depthM: number;
  readonly radiusPx: number;
  readonly scaleFactorPxPerM: number;
}

export interface ForeshorteningOverlapRing {
  readonly t: number;
  readonly cx: number;
  readonly cy: number;
  readonly rxPx: number;
  readonly ryPx: number;
  readonly axisAngleDeg: number;
  readonly depthM: number;
  readonly curvatureRatio: number;
  readonly nearJointId: AnatomyJointId;
  readonly farJointId: AnatomyJointId;
  readonly visibleArcDirection2D: Vec2;
  readonly enclosingOrder: "near-encloses-far";
}

export interface ProjectedLimbSegment {
  readonly boneId: AnatomyBoneId;
  readonly startJoint: AnatomyJointId;
  readonly endJoint: AnatomyJointId;
  readonly group: AnatomyBoneDefinition["group"];
  readonly length3DM: number;
  readonly projectedLengthPx: number;
  readonly unforeshortenedLengthPx: number;
  readonly foreshorteningRatio: number;
  readonly foreshorteningStrength: number;
  readonly minDepthM: number;
  readonly midDepthM: number;
  readonly maxDepthM: number;
  readonly nearEnd: "start" | "end";
  readonly nearToFarIndex: number;
  readonly startRadiusPx: number;
  readonly endRadiusPx: number;
  readonly overlapRings: readonly ForeshorteningOverlapRing[];
}

export interface AnatomyForeshorteningProjection {
  readonly pose: WebtoonAnatomyPose;
  readonly focalLengthMm: number;
  readonly lensCategoryKo: string;
  readonly cameraYawDeg: number;
  readonly cameraPitchDeg: number;
  readonly requestedCameraDistanceM: number;
  readonly effectiveCameraDistanceM: number;
  readonly cameraDistanceMode: CameraDistanceMode;
  readonly cameraPositionM: Vec3;
  readonly cameraTargetM: Vec3;
  readonly cameraRight: Vec3;
  readonly cameraUp: Vec3;
  readonly cameraForward: Vec3;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly focalLengthPx: number;
  readonly joints2D: Readonly<Record<AnatomyJointId, ProjectedJoint2D>>;
  readonly segmentsNearToFar: readonly ProjectedLimbSegment[];
  readonly segmentsFarToNear: readonly ProjectedLimbSegment[];
  readonly nearestWristJointId: "leftWrist" | "rightWrist";
  readonly wristToHeadScaleRatio: number;
  readonly projectedWristToHeadRadiusRatio: number;
  readonly ankleToHeadScaleRatio: number;
  readonly maxForeshorteningStrength: number;
  readonly mostForeshortenedBoneId: AnatomyBoneId;
}

const FULL_FRAME_SENSOR_HEIGHT_MM = 24;

/**
 * 해부학적 관절 가동 범위(ROM) 감사 및 안전한 클램핑 포즈 산출.
 * 팔꿈치·무릎 역꺾임(< 0°)과 비자연 관절 비틀림·과굴곡을 검출한다.
 */
export function auditJointRangeOfMotion(angles: AnatomyPoseAngles): JointRomAuditResult {
  const violations: JointRomViolation[] = [];
  let hyperextensionViolationCount = 0;
  let twistViolationCount = 0;

  const checkAxis = (
    jointId: AnatomyJointId,
    axis: string,
    rawDeg: number,
    minDeg: number,
    maxDeg: number,
    lowKind: RomViolationKind,
    highKind: RomViolationKind,
    labelKo: string,
  ): number => {
    const clampedDeg = clampNum(rawDeg, minDeg, maxDeg);
    if (rawDeg < minDeg - 1e-6) {
      const isHyper = lowKind === "elbow-hyperextension" || lowKind === "knee-hyperextension";
      const isTwist = lowKind === "shoulder-twist-limit" || lowKind === "hip-twist-limit";
      if (isHyper) hyperextensionViolationCount += 1;
      if (isTwist) twistViolationCount += 1;
      violations.push({
        jointId,
        axis,
        kind: lowKind,
        rawDeg,
        clampedDeg,
        minDeg,
        maxDeg,
        severity: isHyper ? "error" : "warn",
        messageKo: isHyper
          ? `${labelKo}이(가) ${Math.round(rawDeg * 10) / 10}°로 역꺾임 상태다(허용 ${minDeg}°~${maxDeg}°).`
          : `${labelKo} 각도(${Math.round(rawDeg * 10) / 10}°)가 해부학 하한(${minDeg}°)을 벗어났다.`,
      });
    } else if (rawDeg > maxDeg + 1e-6) {
      const isTwist = highKind === "shoulder-twist-limit" || highKind === "hip-twist-limit";
      if (isTwist) twistViolationCount += 1;
      violations.push({
        jointId,
        axis,
        kind: highKind,
        rawDeg,
        clampedDeg,
        minDeg,
        maxDeg,
        severity: "warn",
        messageKo: `${labelKo} 각도(${Math.round(rawDeg * 10) / 10}°)가 해부학 상한(${maxDeg}°)을 넘었다.`,
      });
    }
    return clampedDeg;
  };

  const clampedAngles: AnatomyPoseAngles = {
    pelvisOffsetM: angles.pelvisOffsetM,
    pelvisPitchDeg: angles.pelvisPitchDeg,
    pelvisYawDeg: angles.pelvisYawDeg,
    pelvisRollDeg: angles.pelvisRollDeg,
    spinePitchDeg: checkAxis("spine", "pitchDeg", angles.spinePitchDeg, -35, 65, "spine-range-limit", "spine-range-limit", "허리 전후 숙임"),
    spineYawDeg: checkAxis("spine", "yawDeg", angles.spineYawDeg, -45, 45, "spine-range-limit", "spine-range-limit", "허리 비틀림"),
    spineRollDeg: checkAxis("spine", "rollDeg", angles.spineRollDeg, -35, 35, "spine-range-limit", "spine-range-limit", "허리 측굴"),
    chestPitchDeg: checkAxis("chest", "pitchDeg", angles.chestPitchDeg, -25, 45, "spine-range-limit", "spine-range-limit", "흉곽 전후 숙임"),
    chestYawDeg: checkAxis("chest", "yawDeg", angles.chestYawDeg, -40, 40, "spine-range-limit", "spine-range-limit", "흉곽 비틀림"),
    chestRollDeg: checkAxis("chest", "rollDeg", angles.chestRollDeg, -30, 30, "spine-range-limit", "spine-range-limit", "흉곽 측굴"),
    neckPitchDeg: checkAxis("neck", "pitchDeg", angles.neckPitchDeg, -50, 55, "neck-range-limit", "neck-range-limit", "목 숙임"),
    neckYawDeg: checkAxis("neck", "yawDeg", angles.neckYawDeg, -75, 75, "neck-range-limit", "neck-range-limit", "목 회전"),
    neckRollDeg: checkAxis("neck", "rollDeg", angles.neckRollDeg, -40, 40, "neck-range-limit", "neck-range-limit", "목 기울임"),
    leftShoulder: {
      pitchDeg: checkAxis("leftShoulder", "pitchDeg", angles.leftShoulder.pitchDeg, -65, 175, "shoulder-pitch-limit", "shoulder-pitch-limit", "왼어깨 전후 스윙"),
      abductionDeg: checkAxis("leftShoulder", "abductionDeg", angles.leftShoulder.abductionDeg, -35, 175, "shoulder-abduction-limit", "shoulder-abduction-limit", "왼어깨 외전"),
      twistDeg: checkAxis("leftShoulder", "twistDeg", angles.leftShoulder.twistDeg, -95, 95, "shoulder-twist-limit", "shoulder-twist-limit", "왼어깨 축 비틀림"),
    },
    leftElbowFlexDeg: checkAxis("leftElbow", "flexDeg", angles.leftElbowFlexDeg, 0, 150, "elbow-hyperextension", "elbow-overflexion", "왼팔꿈치"),
    rightShoulder: {
      pitchDeg: checkAxis("rightShoulder", "pitchDeg", angles.rightShoulder.pitchDeg, -65, 175, "shoulder-pitch-limit", "shoulder-pitch-limit", "오른어깨 전후 스윙"),
      abductionDeg: checkAxis("rightShoulder", "abductionDeg", angles.rightShoulder.abductionDeg, -35, 175, "shoulder-abduction-limit", "shoulder-abduction-limit", "오른어깨 외전"),
      twistDeg: checkAxis("rightShoulder", "twistDeg", angles.rightShoulder.twistDeg, -95, 95, "shoulder-twist-limit", "shoulder-twist-limit", "오른어깨 축 비틀림"),
    },
    rightElbowFlexDeg: checkAxis("rightElbow", "flexDeg", angles.rightElbowFlexDeg, 0, 150, "elbow-hyperextension", "elbow-overflexion", "오른팔꿈치"),
    leftHip: {
      pitchDeg: checkAxis("leftHip", "pitchDeg", angles.leftHip.pitchDeg, -40, 130, "hip-pitch-limit", "hip-pitch-limit", "왼고관절 굴곡"),
      abductionDeg: checkAxis("leftHip", "abductionDeg", angles.leftHip.abductionDeg, -25, 75, "hip-abduction-limit", "hip-abduction-limit", "왼고관절 외전"),
      twistDeg: checkAxis("leftHip", "twistDeg", angles.leftHip.twistDeg, -55, 55, "hip-twist-limit", "hip-twist-limit", "왼고관절 비틀림"),
    },
    leftKneeFlexDeg: checkAxis("leftKnee", "flexDeg", angles.leftKneeFlexDeg, 0, 145, "knee-hyperextension", "knee-overflexion", "왼무릎"),
    rightHip: {
      pitchDeg: checkAxis("rightHip", "pitchDeg", angles.rightHip.pitchDeg, -40, 130, "hip-pitch-limit", "hip-pitch-limit", "오른고관절 굴곡"),
      abductionDeg: checkAxis("rightHip", "abductionDeg", angles.rightHip.abductionDeg, -25, 75, "hip-abduction-limit", "hip-abduction-limit", "오른고관절 외전"),
      twistDeg: checkAxis("rightHip", "twistDeg", angles.rightHip.twistDeg, -55, 55, "hip-twist-limit", "hip-twist-limit", "오른고관절 비틀림"),
    },
    rightKneeFlexDeg: checkAxis("rightKnee", "flexDeg", angles.rightKneeFlexDeg, 0, 145, "knee-hyperextension", "knee-overflexion", "오른무릎"),
    grounded: angles.grounded,
  };

  return {
    isAnatomicallyValid: violations.length === 0,
    totalViolationCount: violations.length,
    hyperextensionViolationCount,
    twistViolationCount,
    violations,
    clampedAngles,
  };
}

/**
 * 4종 웹툰 등신대 프리셋과 5종 포즈 프리셋을 기반으로 17-관절 3D 정규 해부학 포즈를 구축한다.
 */
export function buildWebtoonAnatomyPose(input: WebtoonAnatomyPoseInput): WebtoonAnatomyPose {
  const profile = WEBTOON_PROPORTION_PROFILES[input.proportionPreset];
  const posePreset: WebtoonPosePreset = input.posePreset ?? "standing-neutral";
  const rawAngles = mergePoseAngles(WEBTOON_POSE_PRESETS[posePreset], input.customAngles);
  const romAudit = auditJointRangeOfMotion(rawAngles);
  const clampApplied = Boolean(input.clampToRom);
  const appliedAngles = clampApplied ? romAudit.clampedAngles : rawAngles;

  const neutralPelvisY =
    profile.footSoleHeightM + profile.lowerLegM + profile.upperLegM + profile.hipToPelvisM;
  const pelvisOrigin: Vec3 = {
    x: appliedAngles.pelvisOffsetM.x,
    y: neutralPelvisY + appliedAngles.pelvisOffsetM.y,
    z: appliedAngles.pelvisOffsetM.z,
  };

  const rPelvis = eulerYXZ(appliedAngles.pelvisYawDeg, appliedAngles.pelvisPitchDeg, appliedAngles.pelvisRollDeg);
  const rSpine = mulMat3(rPelvis, eulerYXZ(appliedAngles.spineYawDeg, appliedAngles.spinePitchDeg, appliedAngles.spineRollDeg));
  const rChest = mulMat3(rSpine, eulerYXZ(appliedAngles.chestYawDeg, appliedAngles.chestPitchDeg, appliedAngles.chestRollDeg));
  const rNeck = mulMat3(rChest, eulerYXZ(appliedAngles.neckYawDeg, appliedAngles.neckPitchDeg, appliedAngles.neckRollDeg));

  const spine = add3(pelvisOrigin, applyMat3(rPelvis, { x: 0, y: profile.pelvisToSpineM, z: 0 }));
  const chest = add3(spine, applyMat3(rSpine, { x: 0, y: profile.spineToChestM, z: 0 }));
  const neck = add3(chest, applyMat3(rChest, { x: 0, y: profile.chestToNeckM, z: 0 }));
  const head = add3(neck, applyMat3(rNeck, { x: 0, y: profile.neckToHeadCenterM, z: 0 }));

  const solveArm = (side: 1 | -1, shoulderAngles: LimbBallJointAngles, elbowFlexDeg: number) => {
    const shoulder = add3(chest, applyMat3(rChest, { x: side * profile.shoulderHalfWidthM, y: 0, z: 0 }));
    const rUpper = mulMat3(
      mulMat3(mulMat3(rChest, rotX(-shoulderAngles.pitchDeg)), rotZ(side * shoulderAngles.abductionDeg)),
      rotY(side * shoulderAngles.twistDeg),
    );
    const elbow = add3(shoulder, applyMat3(rUpper, { x: 0, y: -profile.upperArmM, z: 0 }));
    const wrist = add3(elbow, applyMat3(mulMat3(rUpper, rotX(-elbowFlexDeg)), { x: 0, y: -profile.forearmM, z: 0 }));
    return { shoulder, elbow, wrist };
  };

  const solveLeg = (side: 1 | -1, hipAngles: LimbBallJointAngles, kneeFlexDeg: number) => {
    const hip = add3(pelvisOrigin, applyMat3(rPelvis, { x: side * profile.hipHalfWidthM, y: -profile.hipToPelvisM, z: 0 }));
    const rThigh = mulMat3(
      mulMat3(mulMat3(rPelvis, rotX(-hipAngles.pitchDeg)), rotZ(side * hipAngles.abductionDeg)),
      rotY(side * hipAngles.twistDeg),
    );
    const knee = add3(hip, applyMat3(rThigh, { x: 0, y: -profile.upperLegM, z: 0 }));
    const ankle = add3(knee, applyMat3(mulMat3(rThigh, rotX(kneeFlexDeg)), { x: 0, y: -profile.lowerLegM, z: 0 }));
    return { hip, knee, ankle };
  };

  const leftArm = solveArm(1, appliedAngles.leftShoulder, appliedAngles.leftElbowFlexDeg);
  const rightArm = solveArm(-1, appliedAngles.rightShoulder, appliedAngles.rightElbowFlexDeg);
  const leftLeg = solveLeg(1, appliedAngles.leftHip, appliedAngles.leftKneeFlexDeg);
  const rightLeg = solveLeg(-1, appliedAngles.rightHip, appliedAngles.rightKneeFlexDeg);

  const rawJoints: Record<AnatomyJointId, Vec3> = {
    pelvis: pelvisOrigin,
    spine,
    chest,
    neck,
    head,
    leftShoulder: leftArm.shoulder,
    leftElbow: leftArm.elbow,
    leftWrist: leftArm.wrist,
    rightShoulder: rightArm.shoulder,
    rightElbow: rightArm.elbow,
    rightWrist: rightArm.wrist,
    leftHip: leftLeg.hip,
    leftKnee: leftLeg.knee,
    leftAnkle: leftLeg.ankle,
    rightHip: rightLeg.hip,
    rightKnee: rightLeg.knee,
    rightAnkle: rightLeg.ankle,
  };

  const lowestAnkleY = Math.min(rawJoints.leftAnkle.y, rawJoints.rightAnkle.y);
  const groundShiftY = appliedAngles.grounded ? profile.footSoleHeightM - lowestAnkleY : 0;

  const joints = {} as Record<AnatomyJointId, Vec3>;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const jointId of ANATOMY_JOINT_IDS) {
    const p = rawJoints[jointId];
    const shifted: Vec3 = { x: p.x, y: p.y + groundShiftY, z: p.z };
    joints[jointId] = shifted;
    if (shifted.x < minX) minX = shifted.x;
    if (shifted.y < minY) minY = shifted.y;
    if (shifted.z < minZ) minZ = shifted.z;
    if (shifted.x > maxX) maxX = shifted.x;
    if (shifted.y > maxY) maxY = shifted.y;
    if (shifted.z > maxZ) maxZ = shifted.z;
  }

  const headRadiusY = profile.headHeightM * 0.5;
  const crownY = joints.head.y + headRadiusY;
  const groundRefY = appliedAngles.grounded
    ? 0
    : Math.min(joints.leftAnkle.y, joints.rightAnkle.y) - profile.footSoleHeightM;
  const standingHeadRatio = (crownY - groundRefY) / profile.headHeightM;

  const lR = profile.limbRadiusM;
  const tR = profile.torsoRadiusM;
  const jointRadiiM: Readonly<Record<AnatomyJointId, number>> = {
    pelvis: tR * 0.96,
    spine: tR * 0.84,
    chest: tR * 1.04,
    neck: tR * 0.36,
    head: profile.headWidthM * 0.52,
    leftShoulder: lR * 1.18,
    leftElbow: lR * 0.86,
    leftWrist: lR * 0.72,
    rightShoulder: lR * 1.18,
    rightElbow: lR * 0.86,
    rightWrist: lR * 0.72,
    leftHip: lR * 1.42,
    leftKnee: lR * 1.04,
    leftAnkle: lR * 0.78,
    rightHip: lR * 1.42,
    rightKnee: lR * 1.04,
    rightAnkle: lR * 0.78,
  };

  return {
    proportionPreset: input.proportionPreset,
    posePreset,
    profile,
    rawAngles,
    appliedAngles,
    clampApplied,
    grounded: appliedAngles.grounded,
    romAudit,
    joints,
    jointRadiiM,
    bones: buildBoneDefinitions(profile),
    standingHeadRatio,
    boundsMinM: { x: minX, y: Math.min(minY - profile.footSoleHeightM, 0), z: minZ },
    boundsMaxM: { x: maxX, y: Math.max(maxY, crownY), z: maxZ },
  };
}

function classifyLensKo(focalLengthMm: number): string {
  if (focalLengthMm <= 32) return `${Math.round(focalLengthMm)}mm 광각`;
  if (focalLengthMm >= 80) return `${Math.round(focalLengthMm)}mm 망원`;
  return `${Math.round(focalLengthMm)}mm 표준`;
}

/**
 * 3D 17-관절 해부학 포즈를 핀홀 카메라로 투영해 사지별 단축률, 깊이 정렬,
 * 단축 원통 겹침 링(근경이 원경을 감싸는 타원 방향) 및 근경 확대 비율을 계산한다.
 */
export function projectAnatomyForeshortening(
  pose: WebtoonAnatomyPose,
  camera: ForeshorteningCameraInput,
): AnatomyForeshorteningProjection {
  const focalLengthMm = clampNum(camera.focalLengthMm, 12, 300);
  const cameraYawDeg = clampNum(finiteOr(camera.cameraYawDeg, 0), -180, 180);
  const cameraPitchDeg = clampNum(finiteOr(camera.cameraPitchDeg, 0), -80, 80);
  const viewportWidthPx = clampNum(finiteOr(camera.viewportWidthPx, 480), 180, 2400);
  const viewportHeightPx = clampNum(finiteOr(camera.viewportHeightPx, 560), 180, 2400);
  const cameraDistanceMode: CameraDistanceMode = camera.cameraDistanceMode ?? "focal-matched-framing";
  const requestedCameraDistanceM = clampNum(
    finiteOr(camera.cameraDistanceM, pose.profile.totalHeightM * 1.65),
    0.7,
    25,
  );

  const yawRad = cameraYawDeg * DEG_TO_RAD;
  const pitchRad = cameraPitchDeg * DEG_TO_RAD;
  const orbitDir: Vec3 = {
    x: Math.cos(pitchRad) * Math.sin(yawRad),
    y: Math.sin(pitchRad),
    z: Math.cos(pitchRad) * Math.cos(yawRad),
  };

  const targetY = (pose.boundsMinM.y + pose.boundsMaxM.y) * 0.52;
  const cameraTargetM: Vec3 = { x: pose.joints.pelvis.x, y: targetY, z: pose.joints.pelvis.z };

  let maxForwardExtent = 0;
  for (const jointId of ANATOMY_JOINT_IDS) {
    const ext = dot3(sub3(pose.joints[jointId], cameraTargetM), orbitDir);
    if (ext > maxForwardExtent) maxForwardExtent = ext;
  }

  const nearSafetyMarginM = Math.max(0.32, pose.profile.headHeightM * 1.55);
  const scaledDistanceM =
    cameraDistanceMode === "focal-matched-framing"
      ? requestedCameraDistanceM * (focalLengthMm / 50)
      : requestedCameraDistanceM;
  const effectiveCameraDistanceM = Math.max(maxForwardExtent + nearSafetyMarginM, scaledDistanceM);

  const cameraPositionM = add3(cameraTargetM, scale3(orbitDir, effectiveCameraDistanceM));
  const cameraForward = normalize3(scale3(orbitDir, -1), { x: 0, y: 0, z: -1 });
  const cameraRight = normalize3(cross3(cameraForward, { x: 0, y: 1, z: 0 }), { x: 1, y: 0, z: 0 });
  const cameraUp = normalize3(cross3(cameraRight, cameraForward), { x: 0, y: 1, z: 0 });
  const focalLengthPx = (focalLengthMm / FULL_FRAME_SENSOR_HEIGHT_MM) * viewportHeightPx;

  const projectPoint = (worldPosM: Vec3, radiusM: number) => {
    const rel = sub3(worldPosM, cameraPositionM);
    const xCam = dot3(rel, cameraRight);
    const yCam = dot3(rel, cameraUp);
    const depthM = Math.max(0.08, dot3(rel, cameraForward));
    const scaleFactorPxPerM = focalLengthPx / depthM;
    return {
      screenX: viewportWidthPx * 0.5 + xCam * scaleFactorPxPerM,
      screenY: viewportHeightPx * 0.5 - yCam * scaleFactorPxPerM,
      depthM,
      radiusPx: radiusM * scaleFactorPxPerM,
      scaleFactorPxPerM,
    };
  };

  const joints2D = {} as Record<AnatomyJointId, ProjectedJoint2D>;
  for (const jointId of ANATOMY_JOINT_IDS) {
    const worldPosM = pose.joints[jointId];
    const proj = projectPoint(worldPosM, pose.jointRadiiM[jointId]);
    joints2D[jointId] = { jointId, worldPosM, ...proj };
  }

  const rawSegments: Omit<ProjectedLimbSegment, "nearToFarIndex">[] = [];
  for (const bone of pose.bones) {
    const pStart3D = pose.joints[bone.startJoint];
    const pEnd3D = pose.joints[bone.endJoint];
    const pStart2D = joints2D[bone.startJoint];
    const pEnd2D = joints2D[bone.endJoint];
    const length3DM = len3(sub3(pEnd3D, pStart3D));
    const midDepthM = (pStart2D.depthM + pEnd2D.depthM) * 0.5;
    const minDepthM = Math.min(pStart2D.depthM, pEnd2D.depthM);
    const maxDepthM = Math.max(pStart2D.depthM, pEnd2D.depthM);
    const projectedLengthPx = Math.hypot(pEnd2D.screenX - pStart2D.screenX, pEnd2D.screenY - pStart2D.screenY);
    const unforeshortenedLengthPx = (length3DM * focalLengthPx) / Math.max(0.08, midDepthM);
    const foreshorteningRatio =
      unforeshortenedLengthPx > 1e-6 ? clampNum(projectedLengthPx / unforeshortenedLengthPx, 0, 1) : 1;
    const foreshorteningStrength = clampNum(1 - foreshorteningRatio, 0, 1);

    const nearEnd: "start" | "end" = pEnd2D.depthM < pStart2D.depthM ? "end" : "start";
    const nearJointId = nearEnd === "end" ? bone.endJoint : bone.startJoint;
    const farJointId = nearEnd === "end" ? bone.startJoint : bone.endJoint;
    const near2D = joints2D[nearJointId];
    const far2D = joints2D[farJointId];
    const toFarX = far2D.screenX - near2D.screenX;
    const toFarY = far2D.screenY - near2D.screenY;
    const toFarLen = Math.hypot(toFarX, toFarY);
    const visibleArcDirection2D: Vec2 =
      toFarLen > 1e-5 ? { x: toFarX / toFarLen, y: toFarY / toFarLen } : { x: 0, y: 1 };
    const axisAngleDeg = Math.atan2(visibleArcDirection2D.y, visibleArcDirection2D.x) * RAD_TO_DEG;

    const curvatureRatio = clampNum(
      Math.sqrt(Math.max(0, 1 - foreshorteningRatio * foreshorteningRatio)),
      0.08,
      1,
    );
    const overlapRings: ForeshorteningOverlapRing[] = [];
    if (bone.drawOverlapRings) {
      for (const t of [0.25, 0.5, 0.75]) {
        const ringWorld: Vec3 = {
          x: pStart3D.x + (pEnd3D.x - pStart3D.x) * t,
          y: pStart3D.y + (pEnd3D.y - pStart3D.y) * t,
          z: pStart3D.z + (pEnd3D.z - pStart3D.z) * t,
        };
        const ringRadiusM = bone.startRadiusM + (bone.endRadiusM - bone.startRadiusM) * t;
        const ringProj = projectPoint(ringWorld, ringRadiusM);
        overlapRings.push({
          t,
          cx: ringProj.screenX,
          cy: ringProj.screenY,
          rxPx: ringProj.radiusPx,
          ryPx: ringProj.radiusPx * curvatureRatio,
          axisAngleDeg,
          depthM: ringProj.depthM,
          curvatureRatio,
          nearJointId,
          farJointId,
          visibleArcDirection2D,
          enclosingOrder: "near-encloses-far",
        });
      }
    }

    rawSegments.push({
      boneId: bone.id,
      startJoint: bone.startJoint,
      endJoint: bone.endJoint,
      group: bone.group,
      length3DM,
      projectedLengthPx,
      unforeshortenedLengthPx,
      foreshorteningRatio,
      foreshorteningStrength,
      minDepthM,
      midDepthM,
      maxDepthM,
      nearEnd,
      startRadiusPx: bone.startRadiusM * pStart2D.scaleFactorPxPerM,
      endRadiusPx: bone.endRadiusM * pEnd2D.scaleFactorPxPerM,
      overlapRings,
    });
  }

  rawSegments.sort((a, b) => {
    if (Math.abs(a.midDepthM - b.midDepthM) > 1e-6) return a.midDepthM - b.midDepthM;
    return a.boneId.localeCompare(b.boneId);
  });

  const segmentsNearToFar: ProjectedLimbSegment[] = rawSegments.map((seg, index) => ({
    ...seg,
    nearToFarIndex: index,
  }));
  const segmentsFarToNear: ProjectedLimbSegment[] = [...segmentsNearToFar].reverse();

  const nearestWristJointId: "leftWrist" | "rightWrist" =
    joints2D.rightWrist.depthM <= joints2D.leftWrist.depthM ? "rightWrist" : "leftWrist";
  const nearestWrist = joints2D[nearestWristJointId];
  const head2D = joints2D.head;
  const nearestAnkle =
    joints2D.rightAnkle.depthM <= joints2D.leftAnkle.depthM
      ? joints2D.rightAnkle
      : joints2D.leftAnkle;

  let mostForeshortenedBoneId: AnatomyBoneId = segmentsNearToFar[0]?.boneId ?? "rightForearm";
  let maxForeshorteningStrength = -1;
  for (const seg of segmentsNearToFar) {
    if (seg.foreshorteningStrength > maxForeshorteningStrength) {
      maxForeshorteningStrength = seg.foreshorteningStrength;
      mostForeshortenedBoneId = seg.boneId;
    }
  }

  return {
    pose,
    focalLengthMm,
    lensCategoryKo: classifyLensKo(focalLengthMm),
    cameraYawDeg,
    cameraPitchDeg,
    requestedCameraDistanceM,
    effectiveCameraDistanceM,
    cameraDistanceMode,
    cameraPositionM,
    cameraTargetM,
    cameraRight,
    cameraUp,
    cameraForward,
    viewportWidthPx,
    viewportHeightPx,
    focalLengthPx,
    joints2D,
    segmentsNearToFar,
    segmentsFarToNear,
    nearestWristJointId,
    wristToHeadScaleRatio: head2D.depthM / Math.max(0.08, nearestWrist.depthM),
    projectedWristToHeadRadiusRatio: nearestWrist.radiusPx / Math.max(1e-4, head2D.radiusPx),
    ankleToHeadScaleRatio: head2D.depthM / Math.max(0.08, nearestAnkle.depthM),
    maxForeshorteningStrength: Math.max(0, maxForeshorteningStrength),
    mostForeshortenedBoneId,
  };
}
