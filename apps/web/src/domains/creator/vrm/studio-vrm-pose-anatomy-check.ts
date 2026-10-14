import {
  canonicalizeStudioVrmJointRotation,
  getStudioVrmJointLimit,
  type StudioVrmJointAxis,
  type StudioVrmJointRotation,
} from "./studio-vrm-joint-limits";
import { getEffectiveStudioVrmJointLimit } from "./studio-vrm-rig-profile";

/**
 * 대표 포즈 프리셋 해부학 검수 — 셰이퍼 1단계(pose-preset-anatomy-check).
 *
 * 포즈 프리셋은 코드 상수라 적용 전에 아무도 검사하지 않으면, 관절 리밋을 넘는 값이나
 * 팔이 몸통을 관통하는 포즈가 그대로 사용자에게 닿는다. 이 모듈은 프리셋 1건을 받아
 * ① 관절 리밋 위반(soft/hard 구분, 리그 프로파일 neutral 기준 병기)과
 * ② 표준 골격 FK 근사 기반 자기 관통 의심 구간을 자동 검출한다.
 *
 * ②는 실제 VRM 메쉬·정점 검사가 아니라 대표적인 체형(키 약 1.6m)의 관절 위치와
 * 부위별 캡슐 반경으로 근사한 스크리닝이다. "suspect" 판정은 확정 위반이 아니라
 * 사람이 눈으로 확인할 후보이며, 실제 모델의 체형·의상에 따라 달라질 수 있다.
 * 리밋 판정도 리그 프로파일 모듈과 마찬가지로 의료적 판단이 아닌 드로잉 보조용 근사다.
 */

export interface StudioVrmPoseAnatomyCheckInput {
  readonly id: string;
  readonly label?: string;
  /** 관절 이름 → Euler 회전(라디안). */
  readonly jointRotations: Readonly<Record<string, readonly number[]>>;
}

export type StudioVrmPoseLimitSeverity = "soft" | "hard";

export interface StudioVrmPoseLimitFinding {
  readonly bone: string;
  readonly axis: StudioVrmJointAxis;
  readonly valueDeg: number;
  readonly softMinDeg: number;
  readonly softMaxDeg: number;
  readonly hardMinDeg: number;
  readonly hardMaxDeg: number;
  readonly severity: StudioVrmPoseLimitSeverity;
  /** neutral 프로파일 실효 리밋으로도 위반인지. */
  readonly exceedsNeutralProfile: boolean;
}

export interface StudioVrmPosePenetrationFinding {
  readonly boneA: string;
  readonly boneB: string;
  readonly distance: number;
  readonly clearance: number;
}

export interface StudioVrmPoseAnatomyCheckResult {
  readonly poseId: string;
  readonly limitFindings: readonly StudioVrmPoseLimitFinding[];
  readonly penetrationFindings: readonly StudioVrmPosePenetrationFinding[];
  readonly ok: boolean;
}

const AXES = ["x", "y", "z"] as const satisfies readonly StudioVrmJointAxis[];
const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function checkStudioVrmPoseJointLimits(
  pose: StudioVrmPoseAnatomyCheckInput,
): StudioVrmPoseLimitFinding[] {
  const findings: StudioVrmPoseLimitFinding[] = [];
  for (const [bone, rotation] of Object.entries(pose.jointRotations)) {
    const canonical = canonicalizeStudioVrmJointRotation(rotation);
    const base = getStudioVrmJointLimit(bone);
    const neutral = getEffectiveStudioVrmJointLimit(bone, "neutral") ?? base;
    for (const [index, axis] of AXES.entries()) {
      const value = canonical[index];
      const limit = base[axis];
      let severity: StudioVrmPoseLimitSeverity | null = null;
      if (value > limit.hardMax || value < limit.hardMin) severity = "hard";
      else if (value > limit.softMax || value < limit.softMin) severity = "soft";
      if (!severity) continue;
      const neutralLimit = neutral[axis];
      findings.push(Object.freeze({
        bone,
        axis,
        valueDeg: round1(value * RAD_TO_DEG),
        softMinDeg: round1(limit.softMin * RAD_TO_DEG),
        softMaxDeg: round1(limit.softMax * RAD_TO_DEG),
        hardMinDeg: round1(limit.hardMin * RAD_TO_DEG),
        hardMaxDeg: round1(limit.hardMax * RAD_TO_DEG),
        severity,
        exceedsNeutralProfile: value > neutralLimit.softMax || value < neutralLimit.softMin,
      }));
    }
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* 표준 골격 FK 근사                                                    */
/* ------------------------------------------------------------------ */

type Vec3 = readonly [number, number, number];
type Mat3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

const IDENTITY: Mat3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

function matMul(a: Mat3, b: Mat3): Mat3 {
  const row = (r: number): readonly [number, number, number] => [
    a[r][0] * b[0][0] + a[r][1] * b[1][0] + a[r][2] * b[2][0],
    a[r][0] * b[0][1] + a[r][1] * b[1][1] + a[r][2] * b[2][1],
    a[r][0] * b[0][2] + a[r][1] * b[1][2] + a[r][2] * b[2][2],
  ];
  return [row(0), row(1), row(2)];
}

function matVec(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/** Euler XYZ(R = Rx·Ry·Rz) — 프리셋 표기와 같은 축 순서의 근사다. */
function eulerToMat3([x, y, z]: StudioVrmJointRotation): Mat3 {
  const cx = Math.cos(x); const sx = Math.sin(x);
  const cy = Math.cos(y); const sy = Math.sin(y);
  const cz = Math.cos(z); const sz = Math.sin(z);
  const rx: Mat3 = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]];
  const ry: Mat3 = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
  const rz: Mat3 = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]];
  return matMul(rx, matMul(ry, rz));
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

interface SkeletonBone {
  readonly parent: string | null;
  /** 부모 관절 좌표계에서의 rest 오프셋(m). */
  readonly offset: Vec3;
  /** 말단 방향 rest 오프셋(자식이 없을 때 캡슐 끝점). */
  readonly endOffset?: Vec3;
  readonly radius: number;
}

/**
 * 대표 체형 rest 골격(T포즈, +Y 위, 팔은 ±X). 수치는 VRM 표준 휴머노이드의
 * 대략적인 비례를 단순화한 것으로, 특정 모델의 실측이 아니다.
 */
const SKELETON: Readonly<Record<string, SkeletonBone>> = Object.freeze({
  hips: { parent: null, offset: [0, 0.95, 0], radius: 0.115 },
  spine: { parent: "hips", offset: [0, 0.12, 0], radius: 0.11 },
  chest: { parent: "spine", offset: [0, 0.14, 0], radius: 0.115 },
  upperChest: { parent: "chest", offset: [0, 0.13, 0], radius: 0.11 },
  neck: { parent: "upperChest", offset: [0, 0.14, 0], radius: 0.05 },
  head: { parent: "neck", offset: [0, 0.09, 0], endOffset: [0, 0.17, 0], radius: 0.1 },
  leftShoulder: { parent: "upperChest", offset: [0.07, 0.07, 0], radius: 0.05 },
  leftUpperArm: { parent: "leftShoulder", offset: [0.12, 0.01, 0], radius: 0.045 },
  leftLowerArm: { parent: "leftUpperArm", offset: [0.27, 0, 0], radius: 0.04 },
  leftHand: { parent: "leftLowerArm", offset: [0.26, 0, 0], endOffset: [0.16, 0, 0], radius: 0.035 },
  rightShoulder: { parent: "upperChest", offset: [-0.07, 0.07, 0], radius: 0.05 },
  rightUpperArm: { parent: "rightShoulder", offset: [-0.12, 0.01, 0], radius: 0.045 },
  rightLowerArm: { parent: "rightUpperArm", offset: [-0.27, 0, 0], radius: 0.04 },
  rightHand: { parent: "rightLowerArm", offset: [-0.26, 0, 0], endOffset: [-0.16, 0, 0], radius: 0.035 },
  leftUpperLeg: { parent: "hips", offset: [0.09, -0.04, 0], radius: 0.07 },
  leftLowerLeg: { parent: "leftUpperLeg", offset: [0, -0.42, 0], radius: 0.055 },
  leftFoot: { parent: "leftLowerLeg", offset: [0, -0.42, 0], endOffset: [0, -0.05, 0.11], radius: 0.04 },
  rightUpperLeg: { parent: "hips", offset: [-0.09, -0.04, 0], radius: 0.07 },
  rightLowerLeg: { parent: "rightUpperLeg", offset: [0, -0.42, 0], radius: 0.055 },
  rightFoot: { parent: "rightLowerLeg", offset: [0, -0.42, 0], endOffset: [0, -0.05, 0.11], radius: 0.04 },
});

const SKELETON_ORDER: readonly string[] = Object.freeze([
  "hips", "spine", "chest", "upperChest", "neck", "head",
  "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
  "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
  "leftUpperLeg", "leftLowerLeg", "leftFoot",
  "rightUpperLeg", "rightLowerLeg", "rightFoot",
]);

/** 트리에서 두 관절 사이의 거리(간선 수). 인접·근접 쌍은 관통 판정에서 제외한다. */
function skeletonTreeDistance(a: string, b: string): number {
  const ancestors = new Map<string, number>();
  let current: string | null = a;
  let distance = 0;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    ancestors.set(current, distance);
    current = SKELETON[current]?.parent ?? null;
    distance += 1;
  }
  current = b;
  distance = 0;
  const seenB = new Set<string>();
  while (current && !seenB.has(current)) {
    seenB.add(current);
    const fromA = ancestors.get(current);
    if (fromA !== undefined) return fromA + distance;
    current = SKELETON[current]?.parent ?? null;
    distance += 1;
  }
  return Number.POSITIVE_INFINITY;
}

interface Segment {
  readonly bone: string;
  readonly start: Vec3;
  readonly end: Vec3;
  readonly radius: number;
}

function computeSkeletonSegments(
  jointRotations: Readonly<Record<string, readonly number[]>>,
): Segment[] {
  const worldRotation = new Map<string, Mat3>();
  const worldPosition = new Map<string, Vec3>();
  for (const bone of SKELETON_ORDER) {
    const definition = SKELETON[bone];
    const local = eulerToMat3(
      canonicalizeStudioVrmJointRotation(jointRotations[bone] ?? [0, 0, 0]),
    );
    if (!definition.parent) {
      worldRotation.set(bone, local);
      worldPosition.set(bone, definition.offset);
      continue;
    }
    const parentRotation = worldRotation.get(definition.parent) ?? IDENTITY;
    const parentPosition = worldPosition.get(definition.parent) ?? ([0, 0, 0] as Vec3);
    worldRotation.set(bone, matMul(parentRotation, local));
    worldPosition.set(bone, add(parentPosition, matVec(parentRotation, definition.offset)));
  }
  const segments: Segment[] = [];
  for (const bone of SKELETON_ORDER) {
    const definition = SKELETON[bone];
    const start = worldPosition.get(bone);
    if (!start) continue;
    const rotation = worldRotation.get(bone) ?? IDENTITY;
    // 캡슐 끝점: 대표 자식 관절 위치, 없으면 endOffset.
    const child = SKELETON_ORDER.find((candidate) => SKELETON[candidate].parent === bone);
    const end = child
      ? worldPosition.get(child)
      : definition.endOffset
        ? add(start, matVec(rotation, definition.endOffset))
        : undefined;
    if (!end) continue;
    segments.push({ bone, start, end, radius: definition.radius });
  }
  return segments;
}

/** 두 선분의 최단 거리(표준 closest-point 알고리즘). */
export function segmentSegmentDistance(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3): number {
  const d1: Vec3 = [q1[0] - p1[0], q1[1] - p1[1], q1[2] - p1[2]];
  const d2: Vec3 = [q2[0] - p2[0], q2[1] - p2[1], q2[2] - p2[2]];
  const r: Vec3 = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  let s: number;
  let t: number;
  if (a <= 1e-12 && e <= 1e-12) {
    return Math.hypot(r[0], r[1], r[2]);
  }
  if (a <= 1e-12) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = dot(d1, r);
    if (e <= 1e-12) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const closest: Vec3 = [
    p1[0] + d1[0] * s - (p2[0] + d2[0] * t),
    p1[1] + d1[1] * s - (p2[1] + d2[1] * t),
    p1[2] + d1[2] * s - (p2[2] + d2[2] * t),
  ];
  return Math.hypot(closest[0], closest[1], closest[2]);
}

/** 합 반경의 이 비율 미만으로 가까워지면 "관통 의심"으로 본다(근사 여유). */
export const STUDIO_VRM_POSE_PENETRATION_CLEARANCE_RATIO = 0.85;

function isLegChainBone(bone: string): boolean {
  return bone.includes("UpperLeg") || bone.includes("LowerLeg") || bone.includes("Foot");
}

function boneSide(bone: string): "left" | "right" | "center" {
  if (bone.startsWith("left")) return "left";
  if (bone.startsWith("right")) return "right";
  return "center";
}

export function checkStudioVrmPoseSelfPenetration(
  pose: StudioVrmPoseAnatomyCheckInput,
): StudioVrmPosePenetrationFinding[] {
  const segments = computeSkeletonSegments(pose.jointRotations);
  const findings: StudioVrmPosePenetrationFinding[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const a = segments[i];
      const b = segments[j];
      // 인접(부모-자식·조부모) 쌍은 구조적으로 닿아 있어 판정에서 제외한다.
      // 단, 좌우 다리 체인끼리는 꼬기·교차가 실제로 일어나므로 검사한다.
      const crossSideLegPair = isLegChainBone(a.bone) && isLegChainBone(b.bone)
        && boneSide(a.bone) !== boneSide(b.bone);
      if (skeletonTreeDistance(a.bone, b.bone) <= 2 && !crossSideLegPair) continue;
      const clearance = (a.radius + b.radius) * STUDIO_VRM_POSE_PENETRATION_CLEARANCE_RATIO;
      const distance = segmentSegmentDistance(a.start, a.end, b.start, b.end);
      if (distance < clearance) {
        findings.push(Object.freeze({
          boneA: a.bone,
          boneB: b.bone,
          distance: round3(distance),
          clearance: round3(clearance),
        }));
      }
    }
  }
  return findings;
}

export function checkStudioVrmPoseAnatomy(
  pose: StudioVrmPoseAnatomyCheckInput,
): StudioVrmPoseAnatomyCheckResult {
  const limitFindings = checkStudioVrmPoseJointLimits(pose);
  const penetrationFindings = checkStudioVrmPoseSelfPenetration(pose);
  const hasHardViolation = limitFindings.some((finding) => finding.severity === "hard");
  return Object.freeze({
    poseId: pose.id,
    limitFindings: Object.freeze(limitFindings),
    penetrationFindings: Object.freeze(penetrationFindings),
    ok: !hasHardViolation && penetrationFindings.length === 0,
  });
}

/** 관절 목록형 프리셋(웹툰 포즈 어드밴스드 라이브러리 형태)을 검사 입력으로 바꾼다. */
export function studioVrmPoseJointListToCheckInput(
  id: string,
  joints: readonly { readonly joint: string; readonly rotationEulerDeg: readonly number[] }[],
  label?: string,
): StudioVrmPoseAnatomyCheckInput {
  const jointRotationsDeg: Record<string, readonly number[]> = {};
  for (const entry of joints) {
    jointRotationsDeg[entry.joint] = entry.rotationEulerDeg;
  }
  return studioVrmPoseDegreesToCheckInput(id, jointRotationsDeg, label);
}

/** 도(deg) 표기 프리셋을 검사 입력으로 바꾸는 헬퍼(정적 검사·스크립트 공용). */
export function studioVrmPoseDegreesToCheckInput(
  id: string,
  jointRotationsDeg: Readonly<Record<string, readonly number[]>>,
  label?: string,
): StudioVrmPoseAnatomyCheckInput {
  const jointRotations: Record<string, readonly number[]> = {};
  for (const [bone, rotation] of Object.entries(jointRotationsDeg)) {
    jointRotations[bone] = rotation.map((value) => value * DEG_TO_RAD);
  }
  return Object.freeze({ id, label, jointRotations: Object.freeze(jointRotations) });
}
