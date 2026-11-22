/**
 * 해부학 관절 과신전 방지 클램프 (#027) + 의상-신체 바운딩 캡슐 관통 경고 및 2mm Push-Out (#029).
 *
 * - 어깨(`leftShoulder`/`rightShoulder`, `leftUpperArm`/`rightUpperArm`),
 *   팔꿈치(`leftLowerArm`/`rightLowerArm`), 무릎(`leftLowerLeg`/`rightLowerLeg`)의
 *   해부학적 과신전(역꺾임·탈구 회전)을 정규화 본 오일러(rad) 수준에서 차단한다.
 * - 의상 정점 또는 의상 바운딩 캡슐이 신체 캡슐을 관통하거나 최소 여유 간격(`0.002 m` = 2mm)
 *   안쪽으로 들어오면 관통 경고를 기록하고 캡슐 표면 바깥 `0.002 m` 위치로 자동 밀어낸다(Push-Out).
 * - 드로잉·포즈 보조용 기하학 가드이며 의료적 진단이 아니다.
 */
import * as THREE from "three";

import {
  canonicalizeStudioVrmJointRotation,
  clampStudioVrmJointRotation,
  getStudioVrmJointLimit,
  type StudioVrmJointAxis,
  type StudioVrmJointRotation,
} from "./studio-vrm-joint-limits";

import type { PoseBoneMap } from "./studio-vrm-poser-utils";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const AXES = ["x", "y", "z"] as const satisfies readonly StudioVrmJointAxis[];
const EPSILON = 1e-7;

/** 의상-신체 캡슐 관통 자동 밀어내기(Push-Out) 기본 오프셋: 0.002 m (2mm). */
export const VRM_GARMENT_PUSHOUT_OFFSET_M = 0.002;

export type VrmVec3 = readonly [x: number, y: number, z: number];

export type VrmAnatomicalGuardBone =
  | "leftShoulder"
  | "rightShoulder"
  | "leftUpperArm"
  | "rightUpperArm"
  | "leftLowerArm"
  | "rightLowerArm"
  | "leftLowerLeg"
  | "rightLowerLeg";

export const VRM_ANATOMICAL_GUARD_BONES: readonly VrmAnatomicalGuardBone[] = Object.freeze([
  "leftShoulder",
  "rightShoulder",
  "leftUpperArm",
  "rightUpperArm",
  "leftLowerArm",
  "rightLowerArm",
  "leftLowerLeg",
  "rightLowerLeg",
]);

export interface VrmAnatomicalAxisBound {
  readonly minRad: number;
  readonly maxRad: number;
  /** 과신전(역꺾임) 판정 방향: min 쪽 초과 또는 max 쪽 초과. */
  readonly hyperextensionSide?: "min" | "max" | "both";
}

export interface VrmAnatomicalJointGuardRange {
  readonly x: VrmAnatomicalAxisBound;
  readonly y: VrmAnatomicalAxisBound;
  readonly z: VrmAnatomicalAxisBound;
}

function degBound(
  minDeg: number,
  maxDeg: number,
  hyperextensionSide?: "min" | "max" | "both",
): VrmAnatomicalAxisBound {
  return Object.freeze({
    minRad: minDeg * DEG_TO_RAD,
    maxRad: maxDeg * DEG_TO_RAD,
    ...(hyperextensionSide ? { hyperextensionSide } : {}),
  });
}

function mirrorBound(bound: VrmAnatomicalAxisBound): VrmAnatomicalAxisBound {
  const mirroredSide =
    bound.hyperextensionSide === "min"
      ? "max"
      : bound.hyperextensionSide === "max"
        ? "min"
        : bound.hyperextensionSide;
  return Object.freeze({
    minRad: -bound.maxRad,
    maxRad: -bound.minRad,
    ...(mirroredSide ? { hyperextensionSide: mirroredSide } : {}),
  });
}

function mirrorRange(range: VrmAnatomicalJointGuardRange): VrmAnatomicalJointGuardRange {
  return Object.freeze({
    x: range.x,
    y: mirrorBound(range.y),
    z: mirrorBound(range.z),
  });
}

const LEFT_SHOULDER_GUARD: VrmAnatomicalJointGuardRange = Object.freeze({
  x: degBound(-35, 35, "both"),
  y: degBound(-40, 40, "both"),
  z: degBound(-45, 30, "max"),
});

const LEFT_UPPER_ARM_GUARD: VrmAnatomicalJointGuardRange = Object.freeze({
  x: degBound(-120, 120, "both"),
  y: degBound(-95, 95, "both"),
  z: degBound(-165, 95, "max"),
});

// VRM 정규화 왼팔꿈치: 굴곡은 -Z(-150°까지), 역꺾임(과신전)은 +Z(> 0°).
const LEFT_LOWER_ARM_GUARD: VrmAnatomicalJointGuardRange = Object.freeze({
  x: degBound(-95, 95),
  y: degBound(-18, 18),
  z: degBound(-150, 0, "max"),
});

// VRM 정규화 무릎: 굴곡은 +X(+150°까지), 역꺾임(과신전)은 -X(< 0°).
const LEFT_LOWER_LEG_GUARD: VrmAnatomicalJointGuardRange = Object.freeze({
  x: degBound(0, 150, "min"),
  y: degBound(-18, 18),
  z: degBound(-12, 12),
});

/** 어깨·팔꿈치·무릎 과신전 방지 해부학 범위 테이블(우측은 X/-Y/-Z 미러 규약으로 파생). */
export const VRM_ANATOMICAL_HYPEREXTENSION_LIMITS: Readonly<
  Record<VrmAnatomicalGuardBone, VrmAnatomicalJointGuardRange>
> = Object.freeze({
  leftShoulder: LEFT_SHOULDER_GUARD,
  rightShoulder: mirrorRange(LEFT_SHOULDER_GUARD),
  leftUpperArm: LEFT_UPPER_ARM_GUARD,
  rightUpperArm: mirrorRange(LEFT_UPPER_ARM_GUARD),
  leftLowerArm: LEFT_LOWER_ARM_GUARD,
  rightLowerArm: mirrorRange(LEFT_LOWER_ARM_GUARD),
  leftLowerLeg: LEFT_LOWER_LEG_GUARD,
  rightLowerLeg: mirrorRange(LEFT_LOWER_LEG_GUARD),
});

export interface VrmAnatomicalClampViolation {
  readonly bone: string;
  readonly axis: StudioVrmJointAxis;
  readonly requestedDeg: number;
  readonly clampedDeg: number;
  readonly kind: "hyperextension" | "range-limit";
  readonly message: string;
}

export interface VrmAnatomicalJointClampResult {
  readonly rotation: StudioVrmJointRotation;
  readonly clamped: boolean;
  readonly violations: readonly VrmAnatomicalClampViolation[];
}

export interface VrmPoseAnatomicalClampOptions {
  /** `true`(기본값)이면 어깨·팔꿈치·무릎 외 다른 휴머노이드 관절도 일반 하드 리밋으로 클램프한다. */
  readonly clampAllHumanoidBones?: boolean;
  /** 팔꿈치·무릎 과신전 허용 여유 각도(deg, 기본 0° = 완전 역꺾임 차단). */
  readonly hyperextensionSlackDeg?: number;
}

export interface VrmPoseAnatomicalClampResult {
  readonly bones: PoseBoneMap;
  readonly violations: readonly VrmAnatomicalClampViolation[];
  readonly wasClamped: boolean;
  readonly hyperextensionCount: number;
}

const GUARD_BONE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  leftShoulder: "왼 쇄골/어깨",
  rightShoulder: "오른 쇄골/어깨",
  leftUpperArm: "왼 어깨",
  rightUpperArm: "오른 어깨",
  leftLowerArm: "왼 팔꿈치",
  rightLowerArm: "오른 팔꿈치",
  leftLowerLeg: "왼 무릎",
  rightLowerLeg: "오른 무릎",
});

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function cleanZero(value: number): number {
  return Object.is(value, -0) || Math.abs(value) < 1e-12 ? 0 : value;
}

function isGuardBone(boneName: string): boneName is VrmAnatomicalGuardBone {
  return Object.hasOwn(VRM_ANATOMICAL_HYPEREXTENSION_LIMITS, boneName);
}

/**
 * 단일 관절의 오일러 회전(rad)을 해부학 과신전 방지 범위로 클램프한다.
 * 어깨·팔꿈치·무릎은 과신전 전용 한계를 우선 적용하고, 기타 관절은 VRM 하드 리밋을 적용한다.
 */
export function clampVrmAnatomicalJointRotation(
  boneName: string,
  rotation: readonly number[],
  options: { readonly hyperextensionSlackDeg?: number } = {},
): VrmAnatomicalJointClampResult {
  const canonical = canonicalizeStudioVrmJointRotation(rotation);
  const slackRad = Math.max(0, Math.min(10, options.hyperextensionSlackDeg ?? 0)) * DEG_TO_RAD;
  const violations: VrmAnatomicalClampViolation[] = [];

  if (isGuardBone(boneName)) {
    const guardRange = VRM_ANATOMICAL_HYPEREXTENSION_LIMITS[boneName];
    const baseLimit = getStudioVrmJointLimit(boneName);
    const out: [number, number, number] = [canonical[0], canonical[1], canonical[2]];

    for (const [axisIndex, axis] of AXES.entries()) {
      const bound = guardRange[axis];
      const baseAxis = baseLimit[axis];
      const minRad = Math.max(
        baseAxis.hardMin,
        bound.minRad - (bound.hyperextensionSide === "min" || bound.hyperextensionSide === "both" ? slackRad : 0),
      );
      const maxRad = Math.min(
        baseAxis.hardMax,
        bound.maxRad + (bound.hyperextensionSide === "max" || bound.hyperextensionSide === "both" ? slackRad : 0),
      );
      const requested = canonical[axisIndex];
      const clampedVal = cleanZero(Math.min(maxRad, Math.max(minRad, requested)));
      out[axisIndex] = clampedVal;

      if (Math.abs(clampedVal - requested) > EPSILON) {
        const hitMin = requested < minRad - EPSILON;
        const hitMax = requested > maxRad + EPSILON;
        const isHyper =
          (hitMin && (bound.hyperextensionSide === "min" || bound.hyperextensionSide === "both"))
          || (hitMax && (bound.hyperextensionSide === "max" || bound.hyperextensionSide === "both"));
        const label = GUARD_BONE_LABELS[boneName] ?? boneName;
        const reqDeg = round1(requested * RAD_TO_DEG);
        const clampedDeg = round1(clampedVal * RAD_TO_DEG);
        violations.push(Object.freeze({
          bone: boneName,
          axis,
          requestedDeg: reqDeg,
          clampedDeg,
          kind: isHyper ? "hyperextension" : "range-limit",
          message: isHyper
            ? `${label}(${axis.toUpperCase()}축) 과신전(${reqDeg}°)을 ${clampedDeg}°로 제한했습니다.`
            : `${label}(${axis.toUpperCase()}축) 관절 한계(${reqDeg}°)를 ${clampedDeg}°로 보정했습니다.`,
        }));
      }
    }

    return Object.freeze({
      rotation: Object.freeze(out) as StudioVrmJointRotation,
      clamped: violations.length > 0,
      violations: Object.freeze(violations),
    });
  }

  const hardClamped = clampStudioVrmJointRotation(boneName, canonical);
  for (const [axisIndex, axis] of AXES.entries()) {
    if (Math.abs(hardClamped[axisIndex] - canonical[axisIndex]) > EPSILON) {
      const reqDeg = round1(canonical[axisIndex] * RAD_TO_DEG);
      const clampedDeg = round1(hardClamped[axisIndex] * RAD_TO_DEG);
      violations.push(Object.freeze({
        bone: boneName,
        axis,
        requestedDeg: reqDeg,
        clampedDeg,
        kind: "range-limit",
        message: `${boneName}(${axis.toUpperCase()}축) 회전(${reqDeg}°)을 해부학 안전 범위(${clampedDeg}°)로 보정했습니다.`,
      }));
    }
  }
  return Object.freeze({
    rotation: Object.freeze([
      cleanZero(hardClamped[0]),
      cleanZero(hardClamped[1]),
      cleanZero(hardClamped[2]),
    ] as const),
    clamped: violations.length > 0,
    violations: Object.freeze(violations),
  });
}

/**
 * 포즈 본 맵(`PoseBoneMap`) 전체에 해부학 관절 과신전 방지 클램프를 적용한다.
 * 원본 객체를 변경하지 않고 새 `PoseBoneMap`과 위반 리포트를 반환한다.
 */
export function clampVrmPoseAnatomicalJoints(
  bones: PoseBoneMap,
  options: VrmPoseAnatomicalClampOptions = {},
): VrmPoseAnatomicalClampResult {
  const clampAll = options.clampAllHumanoidBones ?? true;
  const nextBones: PoseBoneMap = {};
  const violations: VrmAnatomicalClampViolation[] = [];

  for (const [boneName, poseBone] of Object.entries(bones)) {
    if (!poseBone) continue;
    if (!("rotation" in poseBone) || !poseBone.rotation) {
      nextBones[boneName as keyof PoseBoneMap] = poseBone;
      continue;
    }
    if (!clampAll && !isGuardBone(boneName)) {
      nextBones[boneName as keyof PoseBoneMap] = {
        rotation: [poseBone.rotation[0], poseBone.rotation[1], poseBone.rotation[2]],
      };
      continue;
    }
    const clamped = clampVrmAnatomicalJointRotation(boneName, poseBone.rotation, options);
    nextBones[boneName as keyof PoseBoneMap] = {
      rotation: [clamped.rotation[0], clamped.rotation[1], clamped.rotation[2]],
    };
    violations.push(...clamped.violations);
  }

  const hyperextensionCount = violations.filter((v) => v.kind === "hyperextension").length;
  return Object.freeze({
    bones: nextBones,
    violations: Object.freeze(violations),
    wasClamped: violations.length > 0,
    hyperextensionCount,
  });
}

/* ------------------------------------------------------------------ */
/* #029 의상-신체 바운딩 캡슐 관통 탐지 + 경고 + 2mm (0.002 m) Push-Out */
/* ------------------------------------------------------------------ */

export interface VrmBodyCapsule {
  readonly id: string;
  readonly bone: string;
  readonly start: VrmVec3;
  readonly end: VrmVec3;
  /** 신체 바운딩 캡슐 반경(m). */
  readonly radius: number;
}

export interface VrmCapsulePointQuery {
  readonly closestOnAxis: VrmVec3;
  readonly normal: VrmVec3;
  readonly axisDistance: number;
  /** 양수면 캡슐 바깥, 음수면 캡슐 내부 관통 깊이. */
  readonly signedDistanceToSurface: number;
}

export interface VrmGarmentCapsuleCollisionWarning {
  readonly garmentId: string;
  readonly capsuleId: string;
  readonly bone: string;
  readonly affectedVertexCount: number;
  readonly maxPenetrationDepthM: number;
  readonly appliedPushOutM: number;
  readonly severity: "warning" | "critical";
  readonly message: string;
}

export interface VrmGarmentCapsuleGuardOptions {
  readonly garmentId?: string;
  /** 의상을 신체 캡슐 표면 바깥으로 유지할 최소 밀어내기 거리(m, 기본 0.002 m = 2mm). */
  readonly pushOutOffsetM?: number;
  /** 다중 캡슐 겹침 영역 수렴 반복 횟수(기본 3회). */
  readonly maxIterations?: number;
  /** 정점이 캡슐 중심축과 완전히 일치할 때 사용할 대체 법선 버퍼. */
  readonly garmentNormals?: Float32Array;
}

export interface VrmGarmentCapsuleGuardResult {
  readonly positions: Float32Array;
  readonly penetratedVertexCount: number;
  readonly pushedVertexCount: number;
  readonly remainingPenetrationCount: number;
  readonly maxPenetrationDepthM: number;
  readonly appliedPushOutOffsetM: number;
  readonly hasClipping: boolean;
  readonly warnings: readonly VrmGarmentCapsuleCollisionWarning[];
}

export interface VrmCapsuleOverlapGuardResult {
  readonly hasClipping: boolean;
  readonly penetrationDepthM: number;
  readonly pushOutVector: VrmVec3;
  readonly appliedPushOutOffsetM: number;
  readonly collidingCapsuleId: string | null;
  readonly warning: VrmGarmentCapsuleCollisionWarning | null;
}

const CAPSULE_SPECS: readonly {
  readonly id: string;
  readonly bone: VRMHumanBoneName;
  readonly endBone: VRMHumanBoneName;
  readonly radius: number;
}[] = Object.freeze([
  { id: "torso-lower", bone: "hips", endBone: "chest", radius: 0.115 },
  { id: "torso-upper", bone: "chest", endBone: "neck", radius: 0.115 },
  { id: "left-upper-arm", bone: "leftUpperArm", endBone: "leftLowerArm", radius: 0.046 },
  { id: "left-lower-arm", bone: "leftLowerArm", endBone: "leftHand", radius: 0.038 },
  { id: "right-upper-arm", bone: "rightUpperArm", endBone: "rightLowerArm", radius: 0.046 },
  { id: "right-lower-arm", bone: "rightLowerArm", endBone: "rightHand", radius: 0.038 },
  { id: "left-upper-leg", bone: "leftUpperLeg", endBone: "leftLowerLeg", radius: 0.072 },
  { id: "left-lower-leg", bone: "leftLowerLeg", endBone: "leftFoot", radius: 0.054 },
  { id: "right-upper-leg", bone: "rightUpperLeg", endBone: "rightLowerLeg", radius: 0.072 },
  { id: "right-lower-leg", bone: "rightLowerLeg", endBone: "rightFoot", radius: 0.054 },
]);

/** 표준 휴머노이드 rest 관절 위치(m) — VRM 씬이 없을 때의 결정론적 캡슐 생성용. */
const STANDARD_REST_JOINT_POSITIONS: Readonly<Record<string, VrmVec3>> = Object.freeze({
  hips: [0, 0.95, 0],
  spine: [0, 1.07, 0],
  chest: [0, 1.21, 0],
  neck: [0, 1.48, 0],
  head: [0, 1.57, 0],
  leftUpperArm: [0.19, 1.42, 0],
  leftLowerArm: [0.46, 1.42, 0],
  leftHand: [0.72, 1.42, 0],
  rightUpperArm: [-0.19, 1.42, 0],
  rightLowerArm: [-0.46, 1.42, 0],
  rightHand: [-0.72, 1.42, 0],
  leftUpperLeg: [0.09, 0.91, 0],
  leftLowerLeg: [0.09, 0.49, 0],
  leftFoot: [0.09, 0.07, 0],
  rightUpperLeg: [-0.09, 0.91, 0],
  rightLowerLeg: [-0.09, 0.49, 0],
  rightFoot: [-0.09, 0.07, 0],
});

/** 표준 체형 기준 신체 바운딩 캡슐 세트를 생성한다. */
export function buildStandardVrmBodyCapsules(
  radiusScale = 1,
): readonly VrmBodyCapsule[] {
  const safeScale = Number.isFinite(radiusScale) && radiusScale > 0.25 && radiusScale < 3
    ? radiusScale
    : 1;
  const capsules: VrmBodyCapsule[] = [];
  for (const spec of CAPSULE_SPECS) {
    const start = STANDARD_REST_JOINT_POSITIONS[spec.bone];
    const end = STANDARD_REST_JOINT_POSITIONS[spec.endBone];
    if (!start || !end) continue;
    capsules.push(Object.freeze({
      id: spec.id,
      bone: spec.bone,
      start,
      end,
      radius: spec.radius * safeScale,
    }));
  }
  return Object.freeze(capsules);
}

/** 로드된 VRM 휴머노이드의 실제 월드 관절 좌표로 신체 바운딩 캡슐을 구성한다. */
export function buildVrmBodyCapsulesFromVrm(
  vrm: Pick<VRM, "humanoid" | "scene"> | null | undefined,
  radiusScale = 1,
): readonly VrmBodyCapsule[] {
  if (!vrm?.humanoid) return buildStandardVrmBodyCapsules(radiusScale);
  const safeScale = Number.isFinite(radiusScale) && radiusScale > 0.25 && radiusScale < 3
    ? radiusScale
    : 1;
  vrm.scene?.updateMatrixWorld(true);
  const capsules: VrmBodyCapsule[] = [];
  const startVec = new THREE.Vector3();
  const endVec = new THREE.Vector3();

  for (const spec of CAPSULE_SPECS) {
    const startNode = vrm.humanoid.getNormalizedBoneNode(spec.bone);
    const endNode = vrm.humanoid.getNormalizedBoneNode(spec.endBone);
    if (!startNode || !endNode) continue;
    startNode.getWorldPosition(startVec);
    endNode.getWorldPosition(endVec);
    if (
      ![startVec.x, startVec.y, startVec.z, endVec.x, endVec.y, endVec.z].every(Number.isFinite)
    ) {
      continue;
    }
    capsules.push(Object.freeze({
      id: spec.id,
      bone: spec.bone,
      start: Object.freeze([startVec.x, startVec.y, startVec.z] as const),
      end: Object.freeze([endVec.x, endVec.y, endVec.z] as const),
      radius: spec.radius * safeScale,
    }));
  }

  return capsules.length > 0 ? Object.freeze(capsules) : buildStandardVrmBodyCapsules(safeScale);
}

function perpendicularFallbackNormal(axisX: number, axisY: number, axisZ: number): VrmVec3 {
  const axisLen = Math.hypot(axisX, axisY, axisZ);
  if (axisLen < 1e-8) return [0, 0, 1];
  const ux = axisX / axisLen;
  const uy = axisY / axisLen;
  const uz = axisZ / axisLen;
  // 캡슐 축과 수직인 결정론적 단위 벡터(+Z 우선)
  const refX = Math.abs(uz) < 0.9 ? 0 : 1;
  const refY = 0;
  const refZ = Math.abs(uz) < 0.9 ? 1 : 0;
  const cx = uy * refZ - uz * refY;
  const cy = uz * refX - ux * refZ;
  const cz = ux * refY - uy * refX;
  const cLen = Math.hypot(cx, cy, cz);
  return cLen > 1e-8 ? [cx / cLen, cy / cLen, cz / cLen] : [0, 0, 1];
}

/** 3D 점과 바운딩 캡슐 축 선분 사이의 최단 거리·외향 법선·표면 부호 거리를 계산한다. */
export function pointToCapsuleSurfaceDistance(
  point: VrmVec3,
  capsule: VrmBodyCapsule,
  fallbackNormal?: VrmVec3,
): VrmCapsulePointQuery {
  const abx = capsule.end[0] - capsule.start[0];
  const aby = capsule.end[1] - capsule.start[1];
  const abz = capsule.end[2] - capsule.start[2];
  const abLenSq = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (abLenSq > 1e-12) {
    const apx = point[0] - capsule.start[0];
    const apy = point[1] - capsule.start[1];
    const apz = point[2] - capsule.start[2];
    t = Math.min(1, Math.max(0, (apx * abx + apy * aby + apz * abz) / abLenSq));
  }
  const cx = capsule.start[0] + abx * t;
  const cy = capsule.start[1] + aby * t;
  const cz = capsule.start[2] + abz * t;

  const dx = point[0] - cx;
  const dy = point[1] - cy;
  const dz = point[2] - cz;
  const axisDistance = Math.hypot(dx, dy, dz);

  // Float32 정점 버퍼의 양자화 오차(~1e-7)를 넘겨 중심축 퇴화 정점을 안전하게 판정한다.
  let normal: VrmVec3;
  if (axisDistance > 1e-5) {
    normal = [dx / axisDistance, dy / axisDistance, dz / axisDistance];
  } else if (fallbackNormal) {
    const fLen = Math.hypot(fallbackNormal[0], fallbackNormal[1], fallbackNormal[2]);
    normal = fLen > 1e-8
      ? [fallbackNormal[0] / fLen, fallbackNormal[1] / fLen, fallbackNormal[2] / fLen]
      : perpendicularFallbackNormal(abx, aby, abz);
  } else {
    normal = perpendicularFallbackNormal(abx, aby, abz);
  }

  return Object.freeze({
    closestOnAxis: Object.freeze([cx, cy, cz] as const),
    normal: Object.freeze(normal),
    axisDistance,
    signedDistanceToSurface: axisDistance - capsule.radius,
  });
}

function formatMm(meters: number): string {
  const mm = Math.max(0.1, Math.round(meters * 10000) / 10);
  return `${mm}mm`;
}

/**
 * 의상 정점 버퍼와 신체 바운딩 캡슐 집합의 관통을 탐지해 경고를 생성하고,
 * 관통하거나 여유 간격이 부족한 정점을 캡슐 표면 바깥 `0.002 m`(2mm) 오프셋으로 자동 밀어낸다.
 */
export function detectAndGuardGarmentCapsuleClipping(
  garmentPositions: Float32Array,
  bodyCapsules: readonly VrmBodyCapsule[],
  options: VrmGarmentCapsuleGuardOptions = {},
): VrmGarmentCapsuleGuardResult {
  const out = new Float32Array(garmentPositions);
  const garmentId = options.garmentId?.trim() || "garment";
  const pushOutOffsetM =
    typeof options.pushOutOffsetM === "number"
    && Number.isFinite(options.pushOutOffsetM)
    && options.pushOutOffsetM >= 0
      ? options.pushOutOffsetM
      : VRM_GARMENT_PUSHOUT_OFFSET_M;
  const maxIterations = Math.max(1, Math.min(8, Math.floor(options.maxIterations ?? 3)));
  const garmentNormals = options.garmentNormals;

  if (bodyCapsules.length === 0 || out.length < 3) {
    return Object.freeze({
      positions: out,
      penetratedVertexCount: 0,
      pushedVertexCount: 0,
      remainingPenetrationCount: 0,
      maxPenetrationDepthM: 0,
      appliedPushOutOffsetM: pushOutOffsetM,
      hasClipping: false,
      warnings: Object.freeze([]),
    });
  }

  const vertexCount = Math.floor(out.length / 3);
  const penetratedVertices = new Set<number>();
  const pushedVertices = new Set<number>();
  const capsuleStats = new Map<
    string,
    { bone: string; vertices: Set<number>; maxPenetrationM: number; maxPushM: number }
  >();
  let maxPenetrationDepthM = 0;

  for (let iter = 0; iter < maxIterations; iter += 1) {
    let anyMoved = false;
    for (let v = 0; v < vertexCount; v += 1) {
      const i3 = v * 3;
      const fallbackNormal: VrmVec3 | undefined =
        garmentNormals && i3 + 2 < garmentNormals.length
          ? [garmentNormals[i3]!, garmentNormals[i3 + 1]!, garmentNormals[i3 + 2]!]
          : undefined;

      for (const capsule of bodyCapsules) {
        if (!Number.isFinite(capsule.radius) || capsule.radius <= 0) continue;
        const point: VrmVec3 = [out[i3]!, out[i3 + 1]!, out[i3 + 2]!];
        const query = pointToCapsuleSurfaceDistance(point, capsule, fallbackNormal);
        const requiredRadius = capsule.radius + pushOutOffsetM;
        if (query.axisDistance >= requiredRadius - 1e-7) continue;

        const penetrationDepth = Math.max(0, capsule.radius - query.axisDistance);
        const pushDistance = requiredRadius - query.axisDistance;

        if (penetrationDepth > 1e-7) {
          penetratedVertices.add(v);
          if (penetrationDepth > maxPenetrationDepthM) {
            maxPenetrationDepthM = penetrationDepth;
          }
        }
        pushedVertices.add(v);

        out[i3] = query.closestOnAxis[0] + query.normal[0] * requiredRadius;
        out[i3 + 1] = query.closestOnAxis[1] + query.normal[1] * requiredRadius;
        out[i3 + 2] = query.closestOnAxis[2] + query.normal[2] * requiredRadius;
        anyMoved = true;

        let stat = capsuleStats.get(capsule.id);
        if (!stat) {
          stat = {
            bone: capsule.bone,
            vertices: new Set<number>(),
            maxPenetrationM: 0,
            maxPushM: 0,
          };
          capsuleStats.set(capsule.id, stat);
        }
        stat.vertices.add(v);
        if (penetrationDepth > stat.maxPenetrationM) stat.maxPenetrationM = penetrationDepth;
        if (pushDistance > stat.maxPushM) stat.maxPushM = pushDistance;
      }
    }
    if (!anyMoved) break;
  }

  let remainingPenetrationCount = 0;
  for (let v = 0; v < vertexCount; v += 1) {
    const i3 = v * 3;
    const point: VrmVec3 = [out[i3]!, out[i3 + 1]!, out[i3 + 2]!];
    for (const capsule of bodyCapsules) {
      if (!Number.isFinite(capsule.radius) || capsule.radius <= 0) continue;
      const query = pointToCapsuleSurfaceDistance(point, capsule);
      if (query.signedDistanceToSurface < -1e-4) {
        remainingPenetrationCount += 1;
        break;
      }
    }
  }

  const warnings: VrmGarmentCapsuleCollisionWarning[] = [];
  for (const [capsuleId, stat] of capsuleStats) {
    const severity = stat.maxPenetrationM >= 0.005 ? "critical" : "warning";
    const pushMm = formatMm(pushOutOffsetM);
    const depthText = stat.maxPenetrationM > 1e-7
      ? `최대 ${formatMm(stat.maxPenetrationM)} 관통`
      : `최소 여유 간격(${pushMm}) 미달`;
    warnings.push(Object.freeze({
      garmentId,
      capsuleId,
      bone: stat.bone,
      affectedVertexCount: stat.vertices.size,
      maxPenetrationDepthM: stat.maxPenetrationM,
      appliedPushOutM: Math.max(pushOutOffsetM, stat.maxPushM),
      severity,
      message: `${garmentId} 의상이 ${stat.bone} 신체 캡슐과 충돌(${depthText}, ${stat.vertices.size}정점)하여 표면 바깥 ${pushMm} 자동 Push-Out을 적용했습니다.`,
    }));
  }

  return Object.freeze({
    positions: out,
    penetratedVertexCount: penetratedVertices.size,
    pushedVertexCount: pushedVertices.size,
    remainingPenetrationCount,
    maxPenetrationDepthM,
    appliedPushOutOffsetM: pushOutOffsetM,
    hasClipping: penetratedVertices.size > 0 || pushedVertices.size > 0,
    warnings: Object.freeze(warnings),
  });
}

/**
 * 의상 부위 바운딩 캡슐과 신체 캡슐 간 관통을 탐지해
 * 가장 깊은 관통 쌍에 대한 `0.002 m`(2mm) 자동 Push-Out 변위 벡터와 경고를 계산한다.
 */
export function guardVrmGarmentCapsuleOverlap(
  garmentCapsule: VrmBodyCapsule,
  bodyCapsules: readonly VrmBodyCapsule[],
  options: { readonly garmentId?: string; readonly pushOutOffsetM?: number } = {},
): VrmCapsuleOverlapGuardResult {
  const pushOutOffsetM =
    typeof options.pushOutOffsetM === "number"
    && Number.isFinite(options.pushOutOffsetM)
    && options.pushOutOffsetM >= 0
      ? options.pushOutOffsetM
      : VRM_GARMENT_PUSHOUT_OFFSET_M;
  const garmentId = options.garmentId?.trim() || garmentCapsule.id;
  const garmentMid: VrmVec3 = [
    (garmentCapsule.start[0] + garmentCapsule.end[0]) * 0.5,
    (garmentCapsule.start[1] + garmentCapsule.end[1]) * 0.5,
    (garmentCapsule.start[2] + garmentCapsule.end[2]) * 0.5,
  ];

  let worstDepth = 0;
  let worstPush = 0;
  let worstCapsule: VrmBodyCapsule | null = null;
  let worstNormal: VrmVec3 = [0, 0, 1];

  for (const body of bodyCapsules) {
    if (!Number.isFinite(body.radius) || body.radius <= 0) continue;
    const samples: readonly VrmVec3[] = [garmentCapsule.start, garmentMid, garmentCapsule.end];
    for (const sample of samples) {
      const query = pointToCapsuleSurfaceDistance(sample, body);
      const minClearDistance = body.radius + garmentCapsule.radius + pushOutOffsetM;
      const deficit = minClearDistance - query.axisDistance;
      if (deficit <= 1e-7) continue;
      const depth = Math.max(0, body.radius + garmentCapsule.radius - query.axisDistance);
      if (deficit > worstPush) {
        worstPush = deficit;
        worstDepth = depth;
        worstCapsule = body;
        worstNormal = query.normal;
      }
    }
  }

  if (!worstCapsule) {
    return Object.freeze({
      hasClipping: false,
      penetrationDepthM: 0,
      pushOutVector: Object.freeze([0, 0, 0] as const),
      appliedPushOutOffsetM: pushOutOffsetM,
      collidingCapsuleId: null,
      warning: null,
    });
  }

  const pushOutVector: VrmVec3 = Object.freeze([
    cleanZero(worstNormal[0] * worstPush),
    cleanZero(worstNormal[1] * worstPush),
    cleanZero(worstNormal[2] * worstPush),
  ] as const);

  const warning: VrmGarmentCapsuleCollisionWarning = Object.freeze({
    garmentId,
    capsuleId: worstCapsule.id,
    bone: worstCapsule.bone,
    affectedVertexCount: 1,
    maxPenetrationDepthM: worstDepth,
    appliedPushOutM: worstPush,
    severity: worstDepth >= 0.005 ? "critical" : "warning",
    message: `${garmentId} 의상 캡슐이 ${worstCapsule.bone} 신체 캡슐을 ${formatMm(worstDepth)} 관통해 ${formatMm(pushOutOffsetM)} 여유를 포함한 Push-Out을 계산했습니다.`,
  });

  return Object.freeze({
    hasClipping: true,
    penetrationDepthM: worstDepth,
    pushOutVector,
    appliedPushOutOffsetM: pushOutOffsetM,
    collidingCapsuleId: worstCapsule.id,
    warning,
  });
}
