/**
 * Studio 3D 데생 인형 — 전신 바닥 접촉·접지 계층(순수).
 *
 * 포즈 프리셋은 그동안 골반 높이를 "기본 체형(170cm) 기준 미터"로 박아 두었다. 그래서
 * 체형이 바뀌면 무릎 꿇기·앉기가 뜨거나 바닥을 뚫었고, 골반 오프셋이 아예 없는 웹툰
 * 프리셋(히어로 3점 착지·무릎 꿇기)은 서 있는 높이에서 공중에 떴다.
 *
 * 이 모듈은 씬이 실제로 그리는 프리미티브(구·캡슐·테이퍼 원기둥·박스)를 FK 로 월드에
 * 올려 전신의 가장 낮은 점과 부위별 최저점을 정확히 잰다. 프리셋은 "어떻게 지지되는가"
 * (서기·앉기·무릎·바닥·눕기·공중)만 메타데이터로 선언하고, 적용 시점에 현재 체형으로
 * 골반 높이를 다시 계산한다 — 체형과 무관하게 접촉점이 바닥(y=0)에 정확히 닿는다.
 *
 * Three.js 를 import 하지 않는 결정적 모듈이라 전 프리셋 품질 검사(단위 테스트)와
 * 2인 구도 접지·자동 접지 분류가 같은 계산을 공유한다.
 */

import {
  computeStudioMannequinJointFrames,
  studioMannequinMat3Apply,
  studioMannequinMat3Multiply,
  studioMannequinVecAdd,
  type StudioMannequinJointFrame,
  type StudioMannequinMat3,
} from "./studio-mannequin-forward-kinematics";
import {
  solveStudioMannequinTwoBoneIk,
  studioMannequinEulerXyzFromMatrix,
} from "./studio-mannequin-ik";
import {
  buildStudioMannequinSpec,
  clampStudioMannequinJointRotation,
  getStudioMannequinJointLimit,
  type StudioMannequinChainId,
  type StudioMannequinJointId,
  type StudioMannequinPrimitiveSpec,
  type StudioMannequinSpec,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import { normalizeStudioMannequinPose, type StudioMannequinPose } from "./studio-mannequin-poses";

// ── 부위 ─────────────────────────────────────────────────────────────────────

export const STUDIO_MANNEQUIN_CONTACT_REGIONS = [
  "leftFoot",
  "rightFoot",
  "leftKnee",
  "rightKnee",
  "leftThigh",
  "rightThigh",
  "hips",
  "torso",
  "head",
  "leftUpperArm",
  "rightUpperArm",
  "leftForearm",
  "rightForearm",
  "leftHand",
  "rightHand",
] as const;

/** 바닥 접촉을 판정하는 몸 부위. 무릎(Knee)은 정강이 전체, 손(Hand)은 손바닥·손가락이다. */
export type StudioMannequinContactRegion = (typeof STUDIO_MANNEQUIN_CONTACT_REGIONS)[number];

/** UI·진단 문구용 한글 부위 이름. */
export const STUDIO_MANNEQUIN_CONTACT_REGION_LABELS: Readonly<
  Record<StudioMannequinContactRegion, string>
> = Object.freeze({
  leftFoot: "왼발",
  rightFoot: "오른발",
  leftKnee: "왼무릎",
  rightKnee: "오른무릎",
  leftThigh: "왼허벅지",
  rightThigh: "오른허벅지",
  hips: "엉덩이",
  torso: "몸통",
  head: "머리",
  leftUpperArm: "왼위팔",
  rightUpperArm: "오른위팔",
  leftForearm: "왼아래팔",
  rightForearm: "오른아래팔",
  leftHand: "왼손",
  rightHand: "오른손",
});

const REGION_BY_JOINT: Readonly<Record<StudioMannequinJointId, StudioMannequinContactRegion>> =
  Object.freeze({
    pelvis: "hips",
    spine: "torso",
    chest: "torso",
    neck: "head",
    head: "head",
    leftShoulder: "torso",
    leftUpperArm: "leftUpperArm",
    leftLowerArm: "leftForearm",
    leftHand: "leftHand",
    rightShoulder: "torso",
    rightUpperArm: "rightUpperArm",
    rightLowerArm: "rightForearm",
    rightHand: "rightHand",
    leftUpperLeg: "leftThigh",
    leftLowerLeg: "leftKnee",
    leftFoot: "leftFoot",
    rightUpperLeg: "rightThigh",
    rightLowerLeg: "rightKnee",
    rightFoot: "rightFoot",
  });

export function studioMannequinContactRegionOfJoint(
  jointId: StudioMannequinJointId,
): StudioMannequinContactRegion {
  return REGION_BY_JOINT[jointId];
}

// ── 프리미티브 최저점(씬 메시 생성 계약을 그대로 재현) ─────────────────────────

function worldPoint(frame: StudioMannequinJointFrame, local: StudioMannequinVec3): StudioMannequinVec3 {
  return studioMannequinVecAdd(frame.position, studioMannequinMat3Apply(frame.rotation, local));
}

/** 회전 행렬의 월드 Y 행 — 로컬 축 i 가 월드 높이에 기여하는 비율. */
function yRow(rotation: StudioMannequinMat3): readonly [number, number, number] {
  return [rotation[3], rotation[4], rotation[5]];
}

function subtract(a: StudioMannequinVec3, b: StudioMannequinVec3): StudioMannequinVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function length(a: StudioMannequinVec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

/**
 * 프리미티브 하나의 월드 최저 높이. 구(타원체)는 관절 회전을 반영한 정확한 최저점,
 * 박스는 모서리 최저점(둥근 모서리는 무시해 보수적), 캡슐은 반구 중심 −반지름,
 * 테이퍼 원기둥은 양 끝 원판 테두리의 최저점이다.
 */
export function studioMannequinPrimitiveLowestY(
  primitive: StudioMannequinPrimitiveSpec,
  frame: StudioMannequinJointFrame,
): number {
  const row = yRow(frame.rotation);
  if (primitive.kind === "sphere") {
    const center = worldPoint(frame, primitive.center);
    const scale = primitive.scale ?? [1, 1, 1];
    const reach = Math.hypot(
      row[0] * primitive.radius * scale[0],
      row[1] * primitive.radius * scale[1],
      row[2] * primitive.radius * scale[2],
    );
    return center[1] - reach;
  }
  if (primitive.kind === "box") {
    const center = worldPoint(frame, primitive.center);
    const reach =
      Math.abs(row[0]) * primitive.size[0] * 0.5
      + Math.abs(row[1]) * primitive.size[1] * 0.5
      + Math.abs(row[2]) * primitive.size[2] * 0.5;
    return center[1] - reach;
  }
  const from = worldPoint(frame, primitive.from);
  const to = worldPoint(frame, primitive.to);
  const segment = subtract(to, from);
  const segmentLength = length(segment);
  const direction: StudioMannequinVec3 = segmentLength > 1e-9
    ? [segment[0] / segmentLength, segment[1] / segmentLength, segment[2] / segmentLength]
    : [0, 1, 0];
  const endRadius = primitive.endRadius;
  const tapered = typeof endRadius === "number"
    && Number.isFinite(endRadius)
    && endRadius > 0
    && Math.abs(endRadius - primitive.radius) > 1e-6;
  if (tapered) {
    // 원판 테두리 최저점: 중심 높이 − r·√(1 − d_y²).
    const rim = Math.sqrt(Math.max(0, 1 - direction[1] * direction[1]));
    return Math.min(from[1] - primitive.radius * rim, to[1] - endRadius * rim);
  }
  // 캡슐은 from..to 를 양 끝 반구까지 포함해 정확히 덮는다(씬의 middleLength = 길이 − 2r).
  const capOffset = Math.max(0.0005, segmentLength / 2 - primitive.radius);
  const middleY = (from[1] + to[1]) / 2;
  return Math.min(middleY + direction[1] * capOffset, middleY - direction[1] * capOffset)
    - primitive.radius;
}

export interface StudioMannequinBodyFloorReport {
  /** 전신 최저점의 월드 높이(m). 0 이면 바닥에 닿아 있다. */
  readonly lowestY: number;
  /** 부위별 최저점(m). */
  readonly regionLowestY: Readonly<Record<StudioMannequinContactRegion, number>>;
}

/**
 * 포즈의 전신 최저점과 부위별 최저점을 잰다. rootOffset/rootYawRad 는 2인 구도의 상대처럼
 * 원점이 아닌 곳에 놓인 인형을 잴 때 쓴다(높이만 보므로 수평 위치는 결과에 영향이 없다).
 */
export function measureStudioMannequinBodyFloor(
  spec: StudioMannequinSpec,
  pose: StudioMannequinPose,
  rootOffset: StudioMannequinVec3 = [0, 0, 0],
  rootYawRad = 0,
): StudioMannequinBodyFloorReport {
  const frames = computeStudioMannequinJointFrames(spec, pose, rootOffset, rootYawRad);
  const regionLowestY = Object.fromEntries(
    STUDIO_MANNEQUIN_CONTACT_REGIONS.map((region) => [region, Number.POSITIVE_INFINITY]),
  ) as Record<StudioMannequinContactRegion, number>;
  let lowestY = Number.POSITIVE_INFINITY;
  for (const primitive of spec.primitives) {
    const frame = frames.get(primitive.jointId);
    if (!frame) continue;
    const y = studioMannequinPrimitiveLowestY(primitive, frame);
    const region = REGION_BY_JOINT[primitive.jointId];
    if (y < regionLowestY[region]) regionLowestY[region] = y;
    if (y < lowestY) lowestY = y;
  }
  return {
    lowestY: Number.isFinite(lowestY) ? lowestY : 0,
    regionLowestY,
  };
}

/** 바닥 접촉 허용 오차(m) — 1.5cm 안이면 닿은 것으로 본다. */
export const STUDIO_MANNEQUIN_FLOOR_CONTACT_TOLERANCE_M = 0.015;

/** 바닥(groundY) 허용 오차 안에 있는 부위 목록(부위 정의 순서). */
export function listStudioMannequinFloorContacts(
  report: StudioMannequinBodyFloorReport,
  options: { readonly groundY?: number; readonly toleranceM?: number } = {},
): StudioMannequinContactRegion[] {
  const groundY = options.groundY ?? 0;
  const tolerance = options.toleranceM ?? STUDIO_MANNEQUIN_FLOOR_CONTACT_TOLERANCE_M;
  return STUDIO_MANNEQUIN_CONTACT_REGIONS.filter(
    (region) => report.regionLowestY[region] - groundY <= tolerance,
  );
}

// ── 지지 방식 메타데이터 + 적용 시점 접지 ─────────────────────────────────────

/**
 * 포즈가 무엇으로 지지되는가.
 * - standing: 발로 선 자세(걷기·달리기·한 발 서기 포함).
 * - seated: 보이지 않는 받침(의자·소파·계단·조종석)에 앉은 자세. 발이 바닥이다.
 * - floor: 바닥에 앉은 자세(양반다리·정좌 등). 엉덩이·다리가 바닥이다.
 * - kneeling: 무릎을 바닥에 댄 자세.
 * - lying: 누운·엎드린 자세.
 * - airborne: 점프·공중 부유 — 바닥에서 띄운다(예외 포즈).
 */
export type StudioMannequinPoseSupport =
  | "standing"
  | "seated"
  | "floor"
  | "kneeling"
  | "lying"
  | "airborne";

export type StudioMannequinFootSide = "left" | "right";

export interface StudioMannequinPoseGroundSpec {
  readonly support: StudioMannequinPoseSupport;
  /** 반드시 바닥에 닿아야 하는 부위(품질 검사가 검증한다). */
  readonly contacts?: readonly StudioMannequinContactRegion[];
  /** 발바닥으로 체중을 싣는 발 — 평평하거나 앞꿈치로 바닥을 짚어야 한다. */
  readonly soleFeet?: readonly StudioMannequinFootSide[];
  /** airborne 전용: 최저점과 바닥 사이 간격(두신 단위). 기본 0.5 두신. */
  readonly clearanceHeads?: number;
}

export const STUDIO_MANNEQUIN_DEFAULT_GROUND_SPEC: StudioMannequinPoseGroundSpec = Object.freeze({
  support: "standing",
});

export const STUDIO_MANNEQUIN_DEFAULT_AIRBORNE_CLEARANCE_HEADS = 0.5;

function withPelvisLift(pose: StudioMannequinPose, lift: number): StudioMannequinPose {
  return normalizeStudioMannequinPose({
    joints: pose.joints,
    pelvisOffset: [pose.pelvisOffset[0], pose.pelvisOffset[1] + lift, pose.pelvisOffset[2]],
  });
}

/** 손·발 접촉을 팔다리 IK 로 맞출 때의 체인. 무릎·엉덩이 같은 몸통 접촉은 골반 높이로 맞춘다. */
const LIMB_CHAIN_BY_REGION: Readonly<Partial<Record<StudioMannequinContactRegion, StudioMannequinChainId>>> =
  Object.freeze({
    leftHand: "leftArm",
    rightHand: "rightArm",
    leftFoot: "leftLeg",
    rightFoot: "rightLeg",
  });

/** 이보다 작은 접촉 어긋남(m)은 저작값을 존중해 그대로 둔다. */
const CONTACT_RETARGET_THRESHOLD_M = 0.01;

/**
 * 팔다리 끝(손목·발목)을 인형 로컬 좌표의 목표점으로 옮기도록 2본 IK 를 다시 푼다(접지
 * 리타깃·2인 구도 손 접촉 공용). 팔꿈치·무릎의 굽힘 방향은 현재 위치를 폴로 써서 유지한다.
 * preserveEndWorldRotation 이면 손·발의 월드 방향도 유지해(로컬 회전 재계산) 바닥을 짚은
 * 손바닥·발바닥 모양이 체형이 바뀌어도 그대로 남게 하고, 아니면 저작한 손목 회전을 그대로 둔다.
 * 닿지 않는 목표는 IK 가 팔다리를 그 방향으로 최대한 뻗은 자세를 돌려준다.
 */
export function reachStudioMannequinLimbEnd(
  spec: StudioMannequinSpec,
  pose: StudioMannequinPose,
  chainId: StudioMannequinChainId,
  localTarget: StudioMannequinVec3,
  options: { readonly preserveEndWorldRotation?: boolean } = {},
): StudioMannequinPose {
  const chain = spec.chains[chainId];
  const upperSpec = spec.joints.find((joint) => joint.id === chain.rootJointId);
  if (!upperSpec?.parentId) return pose;
  const frames = computeStudioMannequinJointFrames(spec, pose);
  const parent = frames.get(upperSpec.parentId);
  const mid = frames.get(chain.midJointId);
  const end = frames.get(chain.effectorJointId);
  if (!parent || !mid || !end) return pose;
  const inverse = transposeMat3(parent.rotation);
  const toParentLocal = (world: StudioMannequinVec3): StudioMannequinVec3 =>
    studioMannequinMat3Apply(inverse, subtract(world, parent.position));
  const upperLimit = getStudioMannequinJointLimit(chain.rootJointId);
  const lowerLimit = getStudioMannequinJointLimit(chain.midJointId);
  const solved = solveStudioMannequinTwoBoneIk(
    {
      root: upperSpec.offset,
      target: toParentLocal(localTarget),
      pole: toParentLocal(mid.position),
      upperLength: chain.upperLength,
      lowerLength: chain.lowerLength,
      hingeSign: chain.hingeSign,
    },
    {
      upper: { x: upperLimit.x, y: upperLimit.y, z: upperLimit.z },
      lower: { x: lowerLimit.x, y: lowerLimit.y, z: lowerLimit.z },
    },
  );
  const joints = {
    ...pose.joints,
    [chain.rootJointId]: solved.upperEuler,
    [chain.midJointId]: solved.lowerEuler,
  };
  const moved = normalizeStudioMannequinPose({ joints, pelvisOffset: pose.pelvisOffset });
  if (!options.preserveEndWorldRotation) return moved;
  const movedMid = computeStudioMannequinJointFrames(spec, moved).get(chain.midJointId);
  if (!movedMid) return moved;
  const endLocal = studioMannequinMat3Multiply(transposeMat3(movedMid.rotation), end.rotation);
  return normalizeStudioMannequinPose({
    joints: {
      ...moved.joints,
      [chain.effectorJointId]: clampStudioMannequinJointRotation(
        chain.effectorJointId,
        studioMannequinEulerXyzFromMatrix(endLocal),
      ),
    },
    pelvisOffset: moved.pelvisOffset,
  });
}

/** 팔다리 끝을 수직으로 dy 만큼 옮긴다 — 바닥을 짚은 손바닥·발바닥 모양은 그대로 둔다. */
function shiftLimbEndVertically(
  spec: StudioMannequinSpec,
  pose: StudioMannequinPose,
  chainId: StudioMannequinChainId,
  dy: number,
): StudioMannequinPose {
  const end = computeStudioMannequinJointFrames(spec, pose).get(spec.chains[chainId].effectorJointId);
  if (!end) return pose;
  return reachStudioMannequinLimbEnd(
    spec,
    pose,
    chainId,
    [end.position[0], end.position[1] + dy, end.position[2]],
    { preserveEndWorldRotation: true },
  );
}

function transposeMat3(m: StudioMannequinMat3): StudioMannequinMat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

const FOOT_JOINT_BY_REGION: Readonly<Partial<Record<StudioMannequinContactRegion, StudioMannequinJointId>>> =
  Object.freeze({ leftFoot: "leftFoot", rightFoot: "rightFoot" });

/**
 * 발목 IK 로도 바닥 아래에서 빼낼 수 없는 발(정강이에 비해 발이 아주 긴 SD 체형의 세운
 * 발끝 등)은 발목 굽힘(X)만 한계 안에서 훑어 발의 최저점이 가장 높아지는 각도로 눕힌다.
 */
function raiseFootByAnkleRotation(
  spec: StudioMannequinSpec,
  pose: StudioMannequinPose,
  region: StudioMannequinContactRegion,
): StudioMannequinPose {
  const footJoint = FOOT_JOINT_BY_REGION[region];
  if (!footJoint) return pose;
  const current = pose.joints[footJoint] ?? [0, 0, 0];
  const limit = getStudioMannequinJointLimit(footJoint).x;
  let best = pose;
  let bestY = measureStudioMannequinBodyFloor(spec, pose).regionLowestY[region];
  const steps = 24;
  for (let step = 0; step <= steps; step += 1) {
    const x = limit[0] + ((limit[1] - limit[0]) * step) / steps;
    const candidate = normalizeStudioMannequinPose({
      joints: { ...pose.joints, [footJoint]: [x, current[1], current[2]] },
      pelvisOffset: pose.pelvisOffset,
    });
    const y = measureStudioMannequinBodyFloor(spec, candidate).regionLowestY[region];
    if (y > bestY + 1e-4) {
      best = candidate;
      bestY = y;
    }
  }
  return best;
}

/**
 * 선언한 접촉을 현재 체형에서 다시 맞춘다. 무릎·엉덩이 같은 몸통 접촉(앵커)이 있으면 앵커가
 * 바닥에 닿도록 골반 높이를 정하고, 손·발은 팔다리 IK 로 맞춘다 — 선언한 손·발은 바닥까지
 * 내리거나 올리고, 선언하지 않은 손·발도 바닥을 뚫으면 몸 전체 대신 그 팔다리만 들어 올린다.
 * 마지막에는 전신 최저점을 다시 바닥에 맞춰 어떤 부위도 바닥을 뚫지 않게 한다.
 */
function retargetDeclaredContacts(
  spec: StudioMannequinSpec,
  pose: StudioMannequinPose,
  contacts: readonly StudioMannequinContactRegion[],
): StudioMannequinPose {
  const declared = new Set(contacts);
  const anchors = contacts.filter((region) => LIMB_CHAIN_BY_REGION[region] === undefined);
  const limbRegions = Object.keys(LIMB_CHAIN_BY_REGION) as StudioMannequinContactRegion[];
  let current = pose;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const report = measureStudioMannequinBodyFloor(spec, current);
    const anchorY = anchors.length > 0
      ? Math.min(...anchors.map((region) => report.regionLowestY[region]))
      : Math.min(...contacts.map((region) => report.regionLowestY[region]));
    current = withPelvisLift(current, -anchorY);
    let changed = false;
    for (const region of limbRegions) {
      const chainId = LIMB_CHAIN_BY_REGION[region];
      if (!chainId) continue;
      const gap = measureStudioMannequinBodyFloor(spec, current).regionLowestY[region];
      const needsLower = declared.has(region) && gap > CONTACT_RETARGET_THRESHOLD_M;
      const needsRaise = gap < -CONTACT_RETARGET_THRESHOLD_M;
      if (!needsLower && !needsRaise) continue;
      current = shiftLimbEndVertically(spec, current, chainId, -gap);
      if (needsRaise && measureStudioMannequinBodyFloor(spec, current).regionLowestY[region] < -CONTACT_RETARGET_THRESHOLD_M) {
        current = raiseFootByAnkleRotation(spec, current, region);
      }
      changed = true;
    }
    current = withPelvisLift(current, -measureStudioMannequinBodyFloor(spec, current).lowestY);
    if (!changed) break;
  }
  return current;
}

/**
 * 지지 방식대로 골반 높이를 다시 계산한다. 공중 포즈가 아니면 전신 최저점을 바닥(y=0)에
 * 정확히 맞추고, 공중 포즈는 최저점을 clearanceHeads × 두신만큼 띄운다. 선언한 접촉
 * (무릎·손·발·엉덩이)이 체형 차이로 1cm 넘게 어긋나면 팔다리 IK 로 다시 맞춘다 — 저작
 * 체형에서는 관절 회전을 바꾸지 않고, 다른 체형에서도 같은 부위가 바닥에 닿는다.
 */
export function groundStudioMannequinPoseForSupport(
  spec: StudioMannequinSpec,
  pose: StudioMannequinPose,
  ground: StudioMannequinPoseGroundSpec = STUDIO_MANNEQUIN_DEFAULT_GROUND_SPEC,
): StudioMannequinPose {
  const normalized = normalizeStudioMannequinPose(pose);
  if (ground.support === "airborne") {
    const clearance = Math.max(0, ground.clearanceHeads ?? STUDIO_MANNEQUIN_DEFAULT_AIRBORNE_CLEARANCE_HEADS)
      * spec.headUnit;
    return withPelvisLift(normalized, clearance - measureStudioMannequinBodyFloor(spec, normalized).lowestY);
  }
  const grounded = withPelvisLift(normalized, -measureStudioMannequinBodyFloor(spec, normalized).lowestY);
  const contacts = ground.contacts ?? [];
  if (contacts.length === 0) return grounded;
  const report = measureStudioMannequinBodyFloor(spec, grounded);
  const misaligned = contacts.some(
    (region) => report.regionLowestY[region] > CONTACT_RETARGET_THRESHOLD_M,
  );
  if (!misaligned) return grounded;
  const retargeted = retargetDeclaredContacts(spec, grounded, contacts);
  // 리타깃이 오히려 선언 접촉을 더 벌리면(도달 불가 체형) 단순 접지 결과를 쓴다.
  const spread = (candidate: StudioMannequinPose) => {
    const heights = measureStudioMannequinBodyFloor(spec, candidate).regionLowestY;
    return contacts.reduce((sum, region) => sum + Math.max(0, heights[region]), 0);
  };
  return spread(retargeted) <= spread(grounded) ? retargeted : grounded;
}

/**
 * 프리셋 적용 진입점: 체형 파라미터로 스펙을 만들어 지지 방식대로 접지한다.
 * 프리셋에 저장된 골반 높이(기본 체형 기준 미터)를 쓰지 않으므로 120cm SD 체형이든
 * 200cm 거인 체형이든 같은 접촉(발·무릎·손·엉덩이)이 바닥에 닿는다.
 */
export function groundStudioMannequinPresetPoseForBody(
  pose: StudioMannequinPose,
  bodyParams: unknown,
  ground: StudioMannequinPoseGroundSpec | undefined,
): StudioMannequinPose {
  return groundStudioMannequinPoseForSupport(
    buildStudioMannequinSpec(bodyParams),
    pose,
    ground ?? STUDIO_MANNEQUIN_DEFAULT_GROUND_SPEC,
  );
}

// ── 발바닥 분석(접지 분류·품질 검사 공용) ─────────────────────────────────────

export type StudioMannequinFootContact = "flat" | "toe" | "heel" | "air";

export interface StudioMannequinFootSoleState {
  /** 뒤꿈치 발바닥점의 월드 높이(m). */
  readonly heelY: number;
  /** 앞꿈치 발바닥점의 월드 높이(m). */
  readonly toeY: number;
  readonly contact: StudioMannequinFootContact;
  /** 발바닥 앞뒤 기울기(도). 뒤꿈치가 들리면 +, 발끝이 들리면 −. */
  readonly pitchDeg: number;
  /** 발바닥 좌우 기울기(도, 절댓값) — 발 옆날로 서면 커진다. */
  readonly rollDeg: number;
  /** 골반 정면 대비 발끝 방향의 수평 각도(도, 절댓값). */
  readonly yawFromPelvisDeg: number;
}

const RAD_TO_DEG = 180 / Math.PI;

/**
 * 발 관절 프레임에서 발바닥 앞뒤 점을 잡는다. 발바닥 높이는 발 타원체의 실제 바닥
 * (−0.5·발목높이·(1+발크기))이고, 앞뒤는 타원체 길이(z ∈ [−0.28, 0.72]·발길이)의 안쪽
 * 끝점이다 — rest 자세에서 두 점이 정확히 바닥(y=0)에 놓인다.
 */
export function studioMannequinFootSoleLocalPoints(spec: StudioMannequinSpec): {
  readonly heel: StudioMannequinVec3;
  readonly toe: StudioMannequinVec3;
} {
  const footScale = spec.params.footScale ?? 1;
  const ankleHeight = 0.32 * spec.headUnit;
  const footLength = 0.95 * spec.headUnit * footScale;
  const soleY = -0.5 * ankleHeight * (1 + footScale);
  return {
    heel: [0, soleY, -0.26 * footLength],
    toe: [0, soleY, 0.72 * footLength],
  };
}

function horizontalAngleDeg(a: StudioMannequinVec3, b: StudioMannequinVec3): number {
  const al = Math.hypot(a[0], a[2]);
  const bl = Math.hypot(b[0], b[2]);
  if (al < 1e-6 || bl < 1e-6) return 0;
  const cos = (a[0] * b[0] + a[2] * b[2]) / (al * bl);
  return Math.acos(Math.min(1, Math.max(-1, cos))) * RAD_TO_DEG;
}

export function analyzeStudioMannequinFootSole(
  spec: StudioMannequinSpec,
  frames: ReadonlyMap<StudioMannequinJointId, StudioMannequinJointFrame>,
  side: StudioMannequinFootSide,
  options: { readonly groundY?: number; readonly toleranceM?: number } = {},
): StudioMannequinFootSoleState {
  const foot = frames.get(side === "left" ? "leftFoot" : "rightFoot");
  const pelvis = frames.get("pelvis");
  if (!foot || !pelvis) {
    return { heelY: 0, toeY: 0, contact: "air", pitchDeg: 0, rollDeg: 0, yawFromPelvisDeg: 0 };
  }
  const groundY = options.groundY ?? 0;
  const tolerance = options.toleranceM ?? STUDIO_MANNEQUIN_FLOOR_CONTACT_TOLERANCE_M;
  const sole = studioMannequinFootSoleLocalPoints(spec);
  const heelY = worldPoint(foot, sole.heel)[1];
  const toeY = worldPoint(foot, sole.toe)[1];
  const forward = studioMannequinMat3Apply(foot.rotation, [0, 0, 1]);
  const lateral = studioMannequinMat3Apply(foot.rotation, [1, 0, 0]);
  const pelvisForward = studioMannequinMat3Apply(pelvis.rotation, [0, 0, 1]);
  const heelDown = heelY - groundY <= tolerance;
  const toeDown = toeY - groundY <= tolerance;
  const contact: StudioMannequinFootContact = heelDown && toeDown
    ? "flat"
    : toeDown
      ? "toe"
      : heelDown
        ? "heel"
        : "air";
  return {
    heelY,
    toeY,
    contact,
    pitchDeg: -Math.asin(Math.min(1, Math.max(-1, forward[1]))) * RAD_TO_DEG,
    rollDeg: Math.abs(Math.asin(Math.min(1, Math.max(-1, lateral[1]))) * RAD_TO_DEG),
    yawFromPelvisDeg: horizontalAngleDeg(forward, pelvisForward),
  };
}
