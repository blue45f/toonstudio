/**
 * Wave 118 — 생체역학 무게중심(CoM) 균형 & 실루엣 가독성·접선(Tangent) 충돌 감사기 및 자동 교정 포즈 생성기.
 *
 * - Winter(2009) 인체 세그먼트 질량 분포(합계 1.000)로 3D CoM 및 지면 투영점 계산
 * - 양발 지지 다각형(baseOfSupportXMin..XMax) 대비 static-balanced / dynamic-action-lean / unintentional-tip-risk 분류
 * - 몸통 실루엣 내부 팔꿈치·손목 파묻힘(tucked-limb-muddy) 및 사지 끝단 2D 접선 충돌(silhouette-tangent-clash <= 12px) 검출
 * - 실루엣 가독성 점수(0..100) 및 단조 개선 교정 포즈(suggestSilhouetteRefinementPose) 산출
 */

import {
  buildWebtoonAnatomyPose,
  projectAnatomyForeshortening,
  type AnatomyForeshorteningProjection,
  type AnatomyJointId,
  type AnatomyPoseAngleOverrides,
  type ForeshorteningCameraInput,
  type Vec2,
  type Vec3,
  type WebtoonAnatomyPose,
} from "./anatomy-rig-and-foreshortening";

export type BalanceClassification =
  | "static-balanced"
  | "dynamic-action-lean"
  | "unintentional-tip-risk";

export type SilhouetteIssueKind = "tucked-limb-muddy" | "silhouette-tangent-clash";

export interface WinterSegmentMassSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly startJoint: AnatomyJointId;
  readonly endJoint: AnatomyJointId;
  readonly massFraction: number;
  readonly comRatioFromStart: number;
}

/**
 * Winter(2009) 표준 인체 분절 질량비 (합계 정확히 1.000).
 */
export const WINTER_SEGMENT_MASS_SPECS: readonly WinterSegmentMassSpec[] = [
  { id: "headNeck", labelKo: "머리·목", startJoint: "neck", endJoint: "head", massFraction: 0.081, comRatioFromStart: 0.56 },
  { id: "upperTorso", labelKo: "상체(흉곽)", startJoint: "spine", endJoint: "chest", massFraction: 0.216, comRatioFromStart: 0.50 },
  { id: "lowerTorso", labelKo: "하체(복부·골반)", startJoint: "pelvis", endJoint: "spine", massFraction: 0.281, comRatioFromStart: 0.45 },
  { id: "leftUpperArm", labelKo: "왼상완", startJoint: "leftShoulder", endJoint: "leftElbow", massFraction: 0.028, comRatioFromStart: 0.436 },
  { id: "rightUpperArm", labelKo: "오른상완", startJoint: "rightShoulder", endJoint: "rightElbow", massFraction: 0.028, comRatioFromStart: 0.436 },
  { id: "leftForearmHand", labelKo: "왼전완·손", startJoint: "leftElbow", endJoint: "leftWrist", massFraction: 0.022, comRatioFromStart: 0.43 },
  { id: "rightForearmHand", labelKo: "오른전완·손", startJoint: "rightElbow", endJoint: "rightWrist", massFraction: 0.022, comRatioFromStart: 0.43 },
  { id: "leftThigh", labelKo: "왼대퇴", startJoint: "leftHip", endJoint: "leftKnee", massFraction: 0.10, comRatioFromStart: 0.433 },
  { id: "rightThigh", labelKo: "오른대퇴", startJoint: "rightHip", endJoint: "rightKnee", massFraction: 0.10, comRatioFromStart: 0.433 },
  { id: "leftShinFoot", labelKo: "왼하퇴·발", startJoint: "leftKnee", endJoint: "leftAnkle", massFraction: 0.061, comRatioFromStart: 0.433 },
  { id: "rightShinFoot", labelKo: "오른하퇴·발", startJoint: "rightKnee", endJoint: "rightAnkle", massFraction: 0.061, comRatioFromStart: 0.433 },
] as const;

export const TANGENT_CLASH_THRESHOLD_PX = 12;
export const TUCKED_LIMB_CLEARANCE_THRESHOLD_PX = 6;

export interface CenterOfMassBalanceAudit {
  readonly massWeightSum: number;
  readonly centerOfMass3DM: Vec3;
  readonly groundProjection3DM: Vec3;
  readonly comScreen2D: Vec2;
  readonly comGroundScreen2D: Vec2;
  readonly groundedFootCount: number;
  readonly groundedFeet: readonly ("leftAnkle" | "rightAnkle")[];
  readonly baseOfSupportXMin: number;
  readonly baseOfSupportXMax: number;
  readonly baseOfSupportZMin: number;
  readonly baseOfSupportZMax: number;
  readonly supportLeftScreen2D: Vec2;
  readonly supportRightScreen2D: Vec2;
  readonly lateralOffsetFromSupportM: number;
  readonly sagittalOffsetFromSupportM: number;
  readonly distanceOutsideSupportM: number;
  readonly stanceWidthM: number;
  readonly classification: BalanceClassification;
  readonly classificationLabelKo: string;
}

export interface SilhouetteAuditIssue {
  readonly kind: SilhouetteIssueKind;
  readonly primaryJoint: AnatomyJointId;
  readonly secondaryJoint?: AnatomyJointId;
  readonly clearancePx: number;
  readonly screenPoint: Vec2;
  readonly severity: "error" | "warn";
  readonly messageKo: string;
}

export interface PoseBalanceAndSilhouetteAudit {
  readonly balance: CenterOfMassBalanceAudit;
  readonly silhouetteClarityScore: number;
  readonly tuckedLimbCount: number;
  readonly tangentClashCount: number;
  readonly averageArmTorsoClearancePx: number;
  readonly silhouetteIssues: readonly SilhouetteAuditIssue[];
  readonly isSilhouetteClean: boolean;
}

export interface SilhouetteRefinementResult {
  readonly originalClarityScore: number;
  readonly refinedClarityScore: number;
  readonly clarityScoreDelta: number;
  readonly originalIssueCount: number;
  readonly refinedIssueCount: number;
  readonly refinedPose: WebtoonAnatomyPose;
  readonly refinedProjection: AnatomyForeshorteningProjection;
  readonly refinedAudit: PoseBalanceAndSilhouetteAudit;
  readonly appliedOverrides: AnatomyPoseAngleOverrides;
  readonly appliedAdjustmentsKo: readonly string[];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function projectWorldToScreen(
  projection: AnatomyForeshorteningProjection,
  worldPosM: Vec3,
): Vec2 {
  const rx = worldPosM.x - projection.cameraPositionM.x;
  const ry = worldPosM.y - projection.cameraPositionM.y;
  const rz = worldPosM.z - projection.cameraPositionM.z;
  const xCam =
    rx * projection.cameraRight.x +
    ry * projection.cameraRight.y +
    rz * projection.cameraRight.z;
  const yCam =
    rx * projection.cameraUp.x +
    ry * projection.cameraUp.y +
    rz * projection.cameraUp.z;
  const depthM = Math.max(
    0.08,
    rx * projection.cameraForward.x +
      ry * projection.cameraForward.y +
      rz * projection.cameraForward.z,
  );
  const scale = projection.focalLengthPx / depthM;
  return {
    x: projection.viewportWidthPx * 0.5 + xCam * scale,
    y: projection.viewportHeightPx * 0.5 - yCam * scale,
  };
}

function pointToSegmentDistance2D(p: Vec2, a: Vec2, b: Vec2): { readonly distPx: number; readonly t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-8) {
    return { distPx: Math.hypot(p.x - a.x, p.y - a.y), t: 0 };
  }
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq, 0, 1);
  const closestX = a.x + abx * t;
  const closestY = a.y + aby * t;
  return { distPx: Math.hypot(p.x - closestX, p.y - closestY), t };
}

function computeCenterOfMassBalance(
  projection: AnatomyForeshorteningProjection,
): CenterOfMassBalanceAudit {
  const { pose } = projection;
  let weightSum = 0;
  let comX = 0;
  let comY = 0;
  let comZ = 0;

  for (const spec of WINTER_SEGMENT_MASS_SPECS) {
    const start = pose.joints[spec.startJoint];
    const end = pose.joints[spec.endJoint];
    const r = spec.comRatioFromStart;
    const segX = start.x + (end.x - start.x) * r;
    const segY = start.y + (end.y - start.y) * r;
    const segZ = start.z + (end.z - start.z) * r;
    comX += segX * spec.massFraction;
    comY += segY * spec.massFraction;
    comZ += segZ * spec.massFraction;
    weightSum += spec.massFraction;
  }

  const invWeight = weightSum > 1e-8 ? 1 / weightSum : 1;
  const centerOfMass3DM: Vec3 = {
    x: comX * invWeight,
    y: comY * invWeight,
    z: comZ * invWeight,
  };
  const groundProjection3DM: Vec3 = { x: centerOfMass3DM.x, y: 0, z: centerOfMass3DM.z };

  const heightScale = pose.profile.totalHeightM / 1.75;
  const footHalfWidthM = 0.065 * heightScale;
  const footHeelBackM = 0.085 * heightScale;
  const footToeFrontM = 0.165 * heightScale;
  const groundToleranceM = pose.profile.footSoleHeightM + 0.095 * Math.max(0.5, heightScale);

  const groundedFeet: ("leftAnkle" | "rightAnkle")[] = [];
  if (pose.grounded) {
    if (pose.joints.leftAnkle.y <= groundToleranceM) groundedFeet.push("leftAnkle");
    if (pose.joints.rightAnkle.y <= groundToleranceM) groundedFeet.push("rightAnkle");
  }

  const supportAnchors: readonly ("leftAnkle" | "rightAnkle")[] =
    groundedFeet.length > 0 ? groundedFeet : ["leftAnkle", "rightAnkle"];

  let baseOfSupportXMin = Number.POSITIVE_INFINITY;
  let baseOfSupportXMax = Number.NEGATIVE_INFINITY;
  let baseOfSupportZMin = Number.POSITIVE_INFINITY;
  let baseOfSupportZMax = Number.NEGATIVE_INFINITY;

  for (const footId of supportAnchors) {
    const foot = pose.joints[footId];
    baseOfSupportXMin = Math.min(baseOfSupportXMin, foot.x - footHalfWidthM);
    baseOfSupportXMax = Math.max(baseOfSupportXMax, foot.x + footHalfWidthM);
    baseOfSupportZMin = Math.min(baseOfSupportZMin, foot.z - footHeelBackM);
    baseOfSupportZMax = Math.max(baseOfSupportZMax, foot.z + footToeFrontM);
  }

  const lateralOffsetFromSupportM =
    centerOfMass3DM.x < baseOfSupportXMin
      ? baseOfSupportXMin - centerOfMass3DM.x
      : centerOfMass3DM.x > baseOfSupportXMax
        ? centerOfMass3DM.x - baseOfSupportXMax
        : 0;
  const sagittalOffsetFromSupportM =
    centerOfMass3DM.z < baseOfSupportZMin
      ? baseOfSupportZMin - centerOfMass3DM.z
      : centerOfMass3DM.z > baseOfSupportZMax
        ? centerOfMass3DM.z - baseOfSupportZMax
        : 0;
  const distanceOutsideSupportM = Math.hypot(
    lateralOffsetFromSupportM,
    sagittalOffsetFromSupportM,
  );

  const stanceWidthM = Math.hypot(
    pose.joints.leftAnkle.x - pose.joints.rightAnkle.x,
    pose.joints.leftAnkle.z - pose.joints.rightAnkle.z,
  );

  const totalForwardLeanDeg =
    Math.abs(pose.appliedAngles.pelvisPitchDeg) +
    Math.abs(pose.appliedAngles.spinePitchDeg);
  const hasAthleticActionStance =
    stanceWidthM >= 0.34 * heightScale ||
    (groundedFeet.length === 1 &&
      Math.max(pose.joints.leftAnkle.y, pose.joints.rightAnkle.y) >= pose.profile.totalHeightM * 0.35) ||
    (totalForwardLeanDeg >= 16 &&
      Math.abs(pose.joints.leftAnkle.z - pose.joints.rightAnkle.z) >= 0.16 * heightScale);

  let classification: BalanceClassification;
  if (!pose.grounded || groundedFeet.length === 0) {
    classification = "dynamic-action-lean";
  } else if (distanceOutsideSupportM <= 0.025 * Math.max(0.5, heightScale)) {
    classification = "static-balanced";
  } else if (
    hasAthleticActionStance &&
    distanceOutsideSupportM <= 0.32 * Math.max(0.55, heightScale) &&
    lateralOffsetFromSupportM <= 0.24 * Math.max(0.55, heightScale)
  ) {
    classification = "dynamic-action-lean";
  } else {
    classification = "unintentional-tip-risk";
  }

  const classificationLabelKo =
    classification === "static-balanced"
      ? "정적 균형 안정"
      : classification === "dynamic-action-lean"
        ? "역동적 액션 기울기"
        : "비의도적 넘어짐 위험";

  const supportMidZ = (baseOfSupportZMin + baseOfSupportZMax) * 0.5;
  return {
    massWeightSum: weightSum,
    centerOfMass3DM,
    groundProjection3DM,
    comScreen2D: projectWorldToScreen(projection, centerOfMass3DM),
    comGroundScreen2D: projectWorldToScreen(projection, groundProjection3DM),
    groundedFootCount: groundedFeet.length,
    groundedFeet,
    baseOfSupportXMin,
    baseOfSupportXMax,
    baseOfSupportZMin,
    baseOfSupportZMax,
    supportLeftScreen2D: projectWorldToScreen(projection, {
      x: baseOfSupportXMin,
      y: 0,
      z: supportMidZ,
    }),
    supportRightScreen2D: projectWorldToScreen(projection, {
      x: baseOfSupportXMax,
      y: 0,
      z: supportMidZ,
    }),
    lateralOffsetFromSupportM,
    sagittalOffsetFromSupportM,
    distanceOutsideSupportM,
    stanceWidthM,
    classification,
    classificationLabelKo,
  };
}

const JOINT_LABELS_KO: Readonly<Record<AnatomyJointId, string>> = {
  pelvis: "골반",
  spine: "허리",
  chest: "가슴",
  neck: "목",
  head: "머리",
  leftShoulder: "왼어깨",
  leftElbow: "왼팔꿈치",
  leftWrist: "왼손목",
  rightShoulder: "오른어깨",
  rightElbow: "오른팔꿈치",
  rightWrist: "오른손목",
  leftHip: "왼고관절",
  leftKnee: "왼무릎",
  leftAnkle: "왼발목",
  rightHip: "오른고관절",
  rightKnee: "오른무릎",
  rightAnkle: "오른발목",
};

const LIMB_CHAIN_OF_JOINT: Readonly<Record<AnatomyJointId, string>> = {
  pelvis: "torso",
  spine: "torso",
  chest: "torso",
  neck: "head",
  head: "head",
  leftShoulder: "leftArm",
  leftElbow: "leftArm",
  leftWrist: "leftArm",
  rightShoulder: "rightArm",
  rightElbow: "rightArm",
  rightWrist: "rightArm",
  leftHip: "leftLeg",
  leftKnee: "leftLeg",
  leftAnkle: "leftLeg",
  rightHip: "rightLeg",
  rightKnee: "rightLeg",
  rightAnkle: "rightLeg",
};

const TORSO_ENVELOPE_BONES = [
  { start: "pelvis" as const, end: "spine" as const },
  { start: "spine" as const, end: "chest" as const },
  { start: "chest" as const, end: "neck" as const },
  { start: "neck" as const, end: "head" as const },
];

const ARM_CHECK_JOINTS: readonly AnatomyJointId[] = [
  "leftElbow",
  "leftWrist",
  "rightElbow",
  "rightWrist",
];

const TANGENT_CANDIDATE_JOINTS: readonly AnatomyJointId[] = [
  "leftWrist",
  "rightWrist",
  "leftElbow",
  "rightElbow",
  "leftKnee",
  "rightKnee",
  "leftAnkle",
  "rightAnkle",
  "head",
];

const EXTREMITY_JOINTS = new Set<AnatomyJointId>([
  "leftWrist",
  "rightWrist",
  "leftAnkle",
  "rightAnkle",
  "head",
]);

function computeTorsoClearancePx(
  projection: AnatomyForeshorteningProjection,
  jointId: AnatomyJointId,
): number {
  const pt = projection.joints2D[jointId];
  const point2D: Vec2 = { x: pt.screenX, y: pt.screenY };
  let minClearance = Number.POSITIVE_INFINITY;

  for (const seg of TORSO_ENVELOPE_BONES) {
    const a = projection.joints2D[seg.start];
    const b = projection.joints2D[seg.end];
    const { distPx, t } = pointToSegmentDistance2D(
      point2D,
      { x: a.screenX, y: a.screenY },
      { x: b.screenX, y: b.screenY },
    );
    const torsoRadiusAtT = a.radiusPx + (b.radiusPx - a.radiusPx) * t;
    const clearance = distPx - torsoRadiusAtT - pt.radiusPx;
    if (clearance < minClearance) minClearance = clearance;
  }
  return minClearance;
}

/**
 * 투영된 3D 포즈의 생체역학 무게중심(CoM) 균형과 2D 실루엣 가독성·접선 충돌을 통합 감사한다.
 */
export function auditPoseBalanceAndSilhouette(
  projection: AnatomyForeshorteningProjection,
): PoseBalanceAndSilhouetteAudit {
  const balance = computeCenterOfMassBalance(projection);
  const issues: SilhouetteAuditIssue[] = [];

  let tuckedLimbCount = 0;
  let armClearanceSum = 0;

  for (const jointId of ARM_CHECK_JOINTS) {
    const clearancePx = computeTorsoClearancePx(projection, jointId);
    armClearanceSum += clamp(clearancePx, -25, 48);
    if (clearancePx <= TUCKED_LIMB_CLEARANCE_THRESHOLD_PX) {
      tuckedLimbCount += 1;
      const joint2D = projection.joints2D[jointId];
      issues.push({
        kind: "tucked-limb-muddy",
        primaryJoint: jointId,
        clearancePx,
        screenPoint: { x: joint2D.screenX, y: joint2D.screenY },
        severity: clearancePx < -4 ? "error" : "warn",
        messageKo: `${JOINT_LABELS_KO[jointId]}이(가) 몸통 윤곽선 안쪽으로 파묻혀 실루엣이 뭉개진다(여유 ${Math.round(clearancePx * 10) / 10}px).`,
      });
    }
  }

  let tangentClashCount = 0;
  for (let i = 0; i < TANGENT_CANDIDATE_JOINTS.length; i += 1) {
    const jointA = TANGENT_CANDIDATE_JOINTS[i];
    if (!jointA) continue;
    for (let j = i + 1; j < TANGENT_CANDIDATE_JOINTS.length; j += 1) {
      const jointB = TANGENT_CANDIDATE_JOINTS[j];
      if (!jointB) continue;
      if (LIMB_CHAIN_OF_JOINT[jointA] === LIMB_CHAIN_OF_JOINT[jointB]) continue;

      const a2D = projection.joints2D[jointA];
      const b2D = projection.joints2D[jointB];
      const centerDistPx = Math.hypot(a2D.screenX - b2D.screenX, a2D.screenY - b2D.screenY);
      const rimGapPx = Math.abs(centerDistPx - (a2D.radiusPx + b2D.radiusPx));
      const bothExtremities = EXTREMITY_JOINTS.has(jointA) && EXTREMITY_JOINTS.has(jointB);
      const isCenterTangent = centerDistPx <= TANGENT_CLASH_THRESHOLD_PX;
      const isRimGrazeTangent = bothExtremities && rimGapPx <= 3.5 && centerDistPx <= a2D.radiusPx + b2D.radiusPx + 6;

      if (isCenterTangent || isRimGrazeTangent) {
        tangentClashCount += 1;
        const reportedGap = isCenterTangent ? centerDistPx : rimGapPx;
        issues.push({
          kind: "silhouette-tangent-clash",
          primaryJoint: jointA,
          secondaryJoint: jointB,
          clearancePx: reportedGap,
          screenPoint: {
            x: (a2D.screenX + b2D.screenX) * 0.5,
            y: (a2D.screenY + b2D.screenY) * 0.5,
          },
          severity: reportedGap <= 6 ? "error" : "warn",
          messageKo: `${JOINT_LABELS_KO[jointA]}과(와) ${JOINT_LABELS_KO[jointB]}이(가) 화면에서 ${Math.round(reportedGap * 10) / 10}px 간격으로 어색하게 스친다(접선 충돌).`,
        });
      }
    }
  }

  const averageArmTorsoClearancePx = armClearanceSum / ARM_CHECK_JOINTS.length;
  let score = 84;

  // 몸통 대비 팔 여백 가산/감점 (연속적 단조 점수)
  const clearanceBonus = clamp(averageArmTorsoClearancePx / 28, -0.5, 1) * 16;
  score += clearanceBonus;

  for (const issue of issues) {
    if (issue.kind === "tucked-limb-muddy") {
      score -= 13 + clamp((TUCKED_LIMB_CLEARANCE_THRESHOLD_PX - issue.clearancePx) * 0.35, 0, 10);
    } else {
      score -= 16 + clamp((TANGENT_CLASH_THRESHOLD_PX - issue.clearancePx) * 0.5, 0, 8);
    }
  }

  if (projection.pose.romAudit.hyperextensionViolationCount > 0) {
    score -= Math.min(12, projection.pose.romAudit.hyperextensionViolationCount * 4);
  }
  if (balance.classification === "unintentional-tip-risk") {
    score -= 6;
  }

  const silhouetteClarityScore = Math.round(clamp(score, 0, 100) * 10) / 10;

  return {
    balance,
    silhouetteClarityScore,
    tuckedLimbCount,
    tangentClashCount,
    averageArmTorsoClearancePx: Math.round(averageArmTorsoClearancePx * 10) / 10,
    silhouetteIssues: issues,
    isSilhouetteClean: tuckedLimbCount === 0 && tangentClashCount === 0,
  };
}

/**
 * 실루엣 파묻힘·접선 충돌·비의도적 넘어짐·ROM 역꺾임을 자동 교정하여
 * silhouetteClarityScore를 단조 개선하는 포즈를 생성한다.
 */
export function suggestSilhouetteRefinementPose(
  pose: WebtoonAnatomyPose,
  camera: ForeshorteningCameraInput,
  initialAudit?: PoseBalanceAndSilhouetteAudit,
): SilhouetteRefinementResult {
  const baseProjection = projectAnatomyForeshortening(pose, camera);
  const baseAudit = initialAudit ?? auditPoseBalanceAndSilhouette(baseProjection);

  const tuckedSet = new Set<AnatomyJointId>();
  const tangentSet = new Set<AnatomyJointId>();
  for (const issue of baseAudit.silhouetteIssues) {
    if (issue.kind === "tucked-limb-muddy") tuckedSet.add(issue.primaryJoint);
    if (issue.kind === "silhouette-tangent-clash") {
      tangentSet.add(issue.primaryJoint);
      if (issue.secondaryJoint) tangentSet.add(issue.secondaryJoint);
    }
  }

  const leftArmAffected =
    tuckedSet.has("leftElbow") ||
    tuckedSet.has("leftWrist") ||
    tangentSet.has("leftElbow") ||
    tangentSet.has("leftWrist");
  const rightArmAffected =
    tuckedSet.has("rightElbow") ||
    tuckedSet.has("rightWrist") ||
    tangentSet.has("rightElbow") ||
    tangentSet.has("rightWrist");
  const legsTangent =
    tangentSet.has("leftKnee") ||
    tangentSet.has("rightKnee") ||
    tangentSet.has("leftAnkle") ||
    tangentSet.has("rightAnkle");
  const tipRisk = baseAudit.balance.classification === "unintentional-tip-risk";

  const clampedBase = pose.romAudit.clampedAngles;
  const candidateMagnitudes = [0, 18, 30, 44, 58];
  const yawTweaks = [0, 12, -12];

  let bestScore = baseAudit.silhouetteClarityScore;
  let bestIssues = baseAudit.silhouetteIssues.length;
  let bestPose = pose;
  let bestProjection = baseProjection;
  let bestAudit = baseAudit;
  let bestOverrides: AnatomyPoseAngleOverrides = {};
  let bestNotes: string[] = [];

  for (const mag of candidateMagnitudes) {
    for (const yawDelta of yawTweaks) {
      if (mag === 0 && yawDelta === 0 && pose.romAudit.isAnatomicallyValid && !tipRisk) {
        continue;
      }
      const notes: string[] = [];
      const leftAbductionDelta = leftArmAffected ? mag : Math.round(mag * 0.45);
      const rightAbductionDelta = rightArmAffected ? mag : Math.round(mag * 0.45);
      const leftPitchDelta = tangentSet.has("leftWrist") ? Math.round(mag * 0.5) : 0;
      const rightPitchDelta = tangentSet.has("rightWrist") ? -Math.round(mag * 0.45) : 0;

      const overrides: AnatomyPoseAngleOverrides = {
        pelvisYawDeg: clamp(clampedBase.pelvisYawDeg + yawDelta, -60, 60),
        pelvisRollDeg: tipRisk ? Math.round(clampedBase.pelvisRollDeg * 0.25) : clampedBase.pelvisRollDeg,
        spineRollDeg: tipRisk ? Math.round(clampedBase.spineRollDeg * 0.25) : clampedBase.spineRollDeg,
        pelvisPitchDeg: tipRisk ? clamp(clampedBase.pelvisPitchDeg * 0.35, -18, 22) : clampedBase.pelvisPitchDeg,
        leftShoulder: {
          pitchDeg: clamp(clampedBase.leftShoulder.pitchDeg + leftPitchDelta, -65, 175),
          abductionDeg: clamp(clampedBase.leftShoulder.abductionDeg + leftAbductionDelta, -35, 165),
          twistDeg: clampedBase.leftShoulder.twistDeg,
        },
        leftElbowFlexDeg: clamp(
          clampedBase.leftElbowFlexDeg + (leftArmAffected && mag > 0 ? 14 : 0),
          0,
          150,
        ),
        rightShoulder: {
          pitchDeg: clamp(clampedBase.rightShoulder.pitchDeg + rightPitchDelta, -65, 175),
          abductionDeg: clamp(clampedBase.rightShoulder.abductionDeg + rightAbductionDelta, -35, 165),
          twistDeg: clampedBase.rightShoulder.twistDeg,
        },
        rightElbowFlexDeg: clamp(
          clampedBase.rightElbowFlexDeg + (rightArmAffected && mag > 0 ? 14 : 0),
          0,
          150,
        ),
        leftHip: {
          pitchDeg: clampedBase.leftHip.pitchDeg,
          abductionDeg: clamp(
            clampedBase.leftHip.abductionDeg + (legsTangent || tipRisk ? Math.max(10, Math.round(mag * 0.35)) : 0),
            -25,
            65,
          ),
          twistDeg: clampedBase.leftHip.twistDeg,
        },
        rightHip: {
          pitchDeg: clampedBase.rightHip.pitchDeg,
          abductionDeg: clamp(
            clampedBase.rightHip.abductionDeg + (legsTangent || tipRisk ? Math.max(10, Math.round(mag * 0.35)) : 0),
            -25,
            65,
          ),
          twistDeg: clampedBase.rightHip.twistDeg,
        },
        leftKneeFlexDeg: clampedBase.leftKneeFlexDeg,
        rightKneeFlexDeg: clampedBase.rightKneeFlexDeg,
      };

      const candidatePose = buildWebtoonAnatomyPose({
        proportionPreset: pose.proportionPreset,
        posePreset: pose.posePreset,
        customAngles: {
          ...clampedBase,
          ...overrides,
        },
        clampToRom: true,
      });
      const candidateProjection = projectAnatomyForeshortening(candidatePose, camera);
      const candidateAudit = auditPoseBalanceAndSilhouette(candidateProjection);

      const strictlyBetter =
        candidateAudit.silhouetteClarityScore > bestScore + 1e-4 ||
        (Math.abs(candidateAudit.silhouetteClarityScore - bestScore) <= 1e-4 &&
          candidateAudit.silhouetteIssues.length < bestIssues);

      if (strictlyBetter) {
        if (!pose.romAudit.isAnatomicallyValid) {
          notes.push("역꺾임·과회전 관절을 해부학 정상 가동 범위로 보정");
        }
        if (leftAbductionDelta > 0) {
          notes.push(`왼어깨 외전 +${leftAbductionDelta}°로 몸통 측면 여백 확보`);
        }
        if (rightAbductionDelta > 0) {
          notes.push(`오른어깨 외전 +${rightAbductionDelta}°로 팔 윤곽선 분리`);
        }
        if (yawDelta !== 0) {
          notes.push(`골반 ${yawDelta > 0 ? `+${yawDelta}` : yawDelta}° 반측면 회전으로 사지 겹침 해소`);
        }
        if (legsTangent || tipRisk) {
          notes.push("양발 스탠스 확장 및 상체 기울기 복원으로 무게중심 안정화");
        }

        bestScore = candidateAudit.silhouetteClarityScore;
        bestIssues = candidateAudit.silhouetteIssues.length;
        bestPose = candidatePose;
        bestProjection = candidateProjection;
        bestAudit = candidateAudit;
        bestOverrides = overrides;
        bestNotes = notes;
      }
    }
  }

  return {
    originalClarityScore: baseAudit.silhouetteClarityScore,
    refinedClarityScore: bestAudit.silhouetteClarityScore,
    clarityScoreDelta:
      Math.round((bestAudit.silhouetteClarityScore - baseAudit.silhouetteClarityScore) * 10) / 10,
    originalIssueCount: baseAudit.silhouetteIssues.length,
    refinedIssueCount: bestAudit.silhouetteIssues.length,
    refinedPose: bestPose,
    refinedProjection: bestProjection,
    refinedAudit: bestAudit,
    appliedOverrides: bestOverrides,
    appliedAdjustmentsKo: bestNotes,
  };
}
