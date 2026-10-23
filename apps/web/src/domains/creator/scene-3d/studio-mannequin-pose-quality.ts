/**
 * Studio 3D 데생 인형 — 포즈 품질 감사(순수 계층).
 *
 * 프리셋 포즈를 FK 로 세워 다음 결함을 찾는다. 품질 단위 테스트와 접촉 시트 점검이 같은
 * 기준을 쓰도록 판정을 한곳에 모았다.
 * - 관절 한계 위반: 저작한 각도가 한계 밖이라 조용히 잘리는 경우(팔꿈치가 펴지는 등).
 * - 공중부양·바닥 관통: 지지 방식대로 접지한 뒤 전신 최저점이 바닥에서 벗어난 경우.
 * - 접촉 누락: 무릎·손·엉덩이처럼 "닿아야 하는" 부위가 바닥에 닿지 않는 경우.
 * - 발 방향 어긋남: 체중을 싣는 발이 옆날로 서거나(롤) 몸과 반대로 돌아간(요) 경우.
 * - 대칭 깨짐: 좌우 대칭이어야 할 포즈가 미러와 다른 경우.
 *
 * 예외(점프·공중 부유)는 포즈 메타데이터의 지지 방식(airborne)으로만 명시한다.
 */

import { computeStudioMannequinJointFrames } from "./studio-mannequin-forward-kinematics";
import {
  STUDIO_MANNEQUIN_JOINT_IDS,
  clampStudioMannequinJointRotation,
  isStudioMannequinJointId,
  type StudioMannequinSpec,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import {
  STUDIO_MANNEQUIN_DEFAULT_AIRBORNE_CLEARANCE_HEADS,
  STUDIO_MANNEQUIN_DEFAULT_GROUND_SPEC,
  analyzeStudioMannequinFootSole,
  measureStudioMannequinBodyFloor,
  type StudioMannequinContactRegion,
  type StudioMannequinFootSide,
  type StudioMannequinPoseGroundSpec,
} from "./studio-mannequin-pose-ground-contact";
import {
  mirrorStudioMannequinPose,
  normalizeStudioMannequinPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";

export type StudioMannequinPoseQualityIssueKind =
  | "joint-limit"
  | "floating"
  | "penetration"
  | "contact-missing"
  | "airborne-touching"
  | "foot-orientation"
  | "asymmetric";

export interface StudioMannequinPoseQualityIssue {
  readonly kind: StudioMannequinPoseQualityIssueKind;
  readonly detail: string;
}

export interface StudioMannequinPoseQualityInput {
  readonly spec: StudioMannequinSpec;
  /** 적용 시점 접지까지 끝난 포즈(씬에 실제로 들어가는 값). */
  readonly pose: StudioMannequinPose;
  readonly ground?: StudioMannequinPoseGroundSpec;
  readonly symmetric?: boolean;
  /** 저작 원본 관절 각도(rad). 주면 한계 밖이라 잘리는 값을 찾는다. */
  readonly authoredJoints?: Readonly<Record<string, StudioMannequinVec3 | undefined>>;
  /** true(기본)면 선언한 접촉 부위가 전부 닿아야 한다. false 면 지지 방식의 대표 접촉만 본다(다른 체형 검사용). */
  readonly strictContacts?: boolean;
  /** 접촉 허용 오차(m). 기본 2cm. */
  readonly contactToleranceM?: number;
}

/** 저작 체형에서 선언 접촉을 판정하는 기본 허용 오차(m) — 정수 도 반올림 여유를 포함한다. */
export const STUDIO_MANNEQUIN_POSE_QUALITY_CONTACT_TOLERANCE_M = 0.02;
const GROUND_EPSILON_M = 0.002;
const SOLE_MAX_ROLL_DEG = 20;
const SOLE_MAX_YAW_DEG = 60;
const STANDING_FOOT_MAX_ROLL_DEG = 25;
const STANDING_FOOT_MAX_YAW_DEG = 75;
const SYMMETRY_TOLERANCE_DEG = 0.5;
const RAD_TO_DEG = 180 / Math.PI;

const SUPPORT_PRIMARY_REGIONS: Readonly<
  Record<StudioMannequinPoseGroundSpec["support"], readonly StudioMannequinContactRegion[]>
> = Object.freeze({
  standing: ["leftFoot", "rightFoot"],
  seated: ["leftFoot", "rightFoot"],
  kneeling: ["leftKnee", "rightKnee"],
  floor: ["hips", "torso"],
  lying: ["torso", "hips", "head"],
  airborne: [],
});

function auditJointLimits(
  authored: Readonly<Record<string, StudioMannequinVec3 | undefined>>,
  issues: StudioMannequinPoseQualityIssue[],
): void {
  for (const [jointId, rotation] of Object.entries(authored)) {
    if (!rotation) continue;
    if (!isStudioMannequinJointId(jointId)) {
      issues.push({ kind: "joint-limit", detail: `${jointId}: 데생 인형에 없는 관절` });
      continue;
    }
    const clamped = clampStudioMannequinJointRotation(jointId, rotation);
    for (let axis = 0; axis < 3; axis += 1) {
      const authoredValue = rotation[axis] ?? 0;
      if (Math.abs((clamped[axis] ?? 0) - authoredValue) > 1e-5) {
        issues.push({
          kind: "joint-limit",
          detail: `${jointId}[${"xyz"[axis]}] ${(authoredValue * RAD_TO_DEG).toFixed(1)}° → ${((clamped[axis] ?? 0) * RAD_TO_DEG).toFixed(1)}°`,
        });
      }
    }
  }
}

function auditSymmetry(pose: StudioMannequinPose, issues: StudioMannequinPoseQualityIssue[]): void {
  const normalized = normalizeStudioMannequinPose(pose);
  const mirrored = normalizeStudioMannequinPose(mirrorStudioMannequinPose(normalized));
  for (const jointId of STUDIO_MANNEQUIN_JOINT_IDS) {
    const a = normalized.joints[jointId] ?? [0, 0, 0];
    const b = mirrored.joints[jointId] ?? [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      const errorDeg = Math.abs((a[axis] ?? 0) - (b[axis] ?? 0)) * RAD_TO_DEG;
      if (errorDeg > SYMMETRY_TOLERANCE_DEG) {
        issues.push({
          kind: "asymmetric",
          detail: `${jointId}[${"xyz"[axis]}] 미러 오차 ${errorDeg.toFixed(1)}°`,
        });
      }
    }
  }
}

/** 포즈 하나를 감사해 결함 목록을 돌려준다. 빈 배열이면 통과다. */
export function auditStudioMannequinPose(
  input: StudioMannequinPoseQualityInput,
): StudioMannequinPoseQualityIssue[] {
  const issues: StudioMannequinPoseQualityIssue[] = [];
  const ground = input.ground ?? STUDIO_MANNEQUIN_DEFAULT_GROUND_SPEC;
  const tolerance = input.contactToleranceM ?? STUDIO_MANNEQUIN_POSE_QUALITY_CONTACT_TOLERANCE_M;
  if (input.authoredJoints) auditJointLimits(input.authoredJoints, issues);
  if (input.symmetric) auditSymmetry(input.pose, issues);

  const report = measureStudioMannequinBodyFloor(input.spec, input.pose);
  const regionHeight = (region: StudioMannequinContactRegion) => report.regionLowestY[region];
  if (ground.support === "airborne") {
    const clearance = (ground.clearanceHeads ?? STUDIO_MANNEQUIN_DEFAULT_AIRBORNE_CLEARANCE_HEADS)
      * input.spec.headUnit;
    if (report.lowestY < clearance - GROUND_EPSILON_M) {
      issues.push({
        kind: "airborne-touching",
        detail: `공중 포즈 최저점 ${(report.lowestY * 100).toFixed(1)}cm < 간격 ${(clearance * 100).toFixed(1)}cm`,
      });
    }
    return issues;
  }
  if (report.lowestY > GROUND_EPSILON_M) {
    issues.push({ kind: "floating", detail: `전신 최저점이 ${(report.lowestY * 100).toFixed(1)}cm 떠 있음` });
  } else if (report.lowestY < -GROUND_EPSILON_M) {
    issues.push({ kind: "penetration", detail: `바닥을 ${(-report.lowestY * 100).toFixed(1)}cm 관통` });
  }

  const strict = input.strictContacts ?? true;
  if (strict) {
    for (const region of ground.contacts ?? []) {
      const height = regionHeight(region);
      if (height > tolerance) {
        issues.push({ kind: "contact-missing", detail: `${region} 이(가) 바닥에서 ${(height * 100).toFixed(1)}cm` });
      }
    }
  }
  const primary = SUPPORT_PRIMARY_REGIONS[ground.support];
  if (primary.length > 0 && !primary.some((region) => regionHeight(region) <= tolerance)) {
    issues.push({
      kind: "contact-missing",
      detail: `${ground.support} 지지 부위(${primary.join("/")})가 바닥에 닿지 않음`,
    });
  }

  const frames = computeStudioMannequinJointFrames(input.spec, input.pose);
  const soleFeet = new Set<StudioMannequinFootSide>(ground.soleFeet ?? []);
  for (const side of ["left", "right"] as const) {
    const sole = analyzeStudioMannequinFootSole(input.spec, frames, side, { toleranceM: tolerance });
    if (soleFeet.has(side) && strict) {
      if (sole.contact !== "flat" && sole.contact !== "toe") {
        issues.push({ kind: "foot-orientation", detail: `${side} 발바닥이 바닥을 딛지 않음(${sole.contact})` });
      }
      if (sole.rollDeg > SOLE_MAX_ROLL_DEG || sole.yawFromPelvisDeg > SOLE_MAX_YAW_DEG) {
        issues.push({
          kind: "foot-orientation",
          detail: `${side} 발 롤 ${sole.rollDeg.toFixed(0)}° · 요 ${sole.yawFromPelvisDeg.toFixed(0)}°`,
        });
      }
    }
    const footBearing = ground.support === "standing" || ground.support === "seated";
    if (footBearing && sole.contact !== "air" && (
      sole.rollDeg > STANDING_FOOT_MAX_ROLL_DEG || sole.yawFromPelvisDeg > STANDING_FOOT_MAX_YAW_DEG
    )) {
      issues.push({
        kind: "foot-orientation",
        detail: `${side} 발이 옆날·반대 방향으로 디딤(롤 ${sole.rollDeg.toFixed(0)}° · 요 ${sole.yawFromPelvisDeg.toFixed(0)}°)`,
      });
    }
  }
  return issues;
}
