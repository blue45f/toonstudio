/**
 * Studio 3D 데생 인형 — 자동 접지(foot-contact) 어댑터.
 *
 * 접지 솔버(`studio-3d-foot-contact-lock.ts`)는 월드 좌표 스냅샷(골반·엉덩이·
 * 무릎·발목·발끝)을 입력으로 받는 순수 모듈이지만, 포저 패널의 진실 공급원은
 * 관절 오일러 + 골반 오프셋으로 표현되는 포즈(`StudioMannequinPose`)라 그동안
 * 솔버를 호출하는 곳이 없었다. 이 어댑터가 그 사이를 잇는다:
 *
 * 1. 스펙(관절 계층 오프셋)과 포즈로 다리 FK를 계산해 솔버 스냅샷을 만든다.
 * 2. 솔버를 실행한다.
 * 3. 솔버가 실제로 보정할 수 있는 것만 포즈에 되돌린다 — 골반 자동 오프셋
 *    (관통 깊이만큼 골반을 들어 발바닥을 지면에 밀착). 솔버는 발이 떠 있는
 *    포즈(점프)를 끌어내리지 않으므로 의도적인 공중 포즈는 그대로 둔다.
 *    toe roll 각도는 솔버가 산출하는 값이지만, 발 관절 회전을 임의로 더하면
 *    이미 잡힌 발 자세를 이중으로 기울이므로 포즈를 바꾸지 않고 결과
 *    (groundingState)에 담아 UI 상태 표시에만 쓴다.
 *
 * 지지 가드: 관통한 발의 발목까지 지면 아래에 있고 골반도 서 있는 높이의
 * 75%보다 낮으면, 그 포즈의 지지는 발이 아니라 의자·바닥·무릎이다(앉기·
 * 무릎앉기·바닥 앉기·웅크리기 프리셋이 실제로 이 형태다 — 전 프리셋 실측).
 * 그런 포즈를 골반만 들어 올리면 앉은 자세가 붕 떠 깨지므로, 보정하지
 * 않고 판정만 돌려준다(`supportGuardBlocked`). 반대로 발바닥만 잠겼거나
 * (발목은 지면 위) 서 있는 자세에서 전체가 가라앉은 경우는 발 접지가
 * 지지이므로 들어 올린다.
 *
 * Three.js를 import하지 않는 결정적 모듈이라 단위 테스트가 안전하다.
 */

import {
  Studio3DFootContactSolver,
  type CharacterRigPoseSnapshot,
  type FootGroundingState,
  type Vector3D,
} from "./studio-3d-foot-contact-lock";
import { studioMannequinMatrixFromEulerXyz } from "./studio-mannequin-ik";
import type {
  StudioMannequinJointId,
  StudioMannequinSpec,
  StudioMannequinVec3,
} from "./studio-mannequin-model";
import { normalizeStudioMannequinPose, type StudioMannequinPose } from "./studio-mannequin-poses";

type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

function matMul(a: Mat3, b: Mat3): Mat3 {
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

function matApply(m: Mat3, v: StudioMannequinVec3): StudioMannequinVec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

function addVec(a: StudioMannequinVec3, b: StudioMannequinVec3): StudioMannequinVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

interface JointWorldTransform {
  readonly position: StudioMannequinVec3;
  readonly rotation: Mat3;
}

/**
 * 포즈를 적용한 관절 월드 변환을 FK로 계산한다. 스펙의 관절 배열은 부모가
 * 자식보다 먼저 오는 계층 순서라 한 번의 순회로 충분하다. 골반은 rest
 * 오프셋에 포즈의 pelvisOffset을 더한 위치가 로컬 위치다(씬 계층과 동일).
 */
export function computeStudioMannequinJointWorldTransforms(
  spec: StudioMannequinSpec,
  pose: StudioMannequinPose,
): ReadonlyMap<StudioMannequinJointId, JointWorldTransform> {
  const transforms = new Map<StudioMannequinJointId, JointWorldTransform>();
  for (const jointSpec of spec.joints) {
    const localRotation = studioMannequinMatrixFromEulerXyz(
      pose.joints[jointSpec.id] ?? [0, 0, 0],
    ) as Mat3;
    const localOffset: StudioMannequinVec3 =
      jointSpec.id === "pelvis"
        ? addVec(jointSpec.offset, pose.pelvisOffset)
        : jointSpec.offset;
    const parent = jointSpec.parentId ? transforms.get(jointSpec.parentId) : undefined;
    if (!parent) {
      transforms.set(jointSpec.id, { position: localOffset, rotation: localRotation });
      continue;
    }
    transforms.set(jointSpec.id, {
      position: addVec(parent.position, matApply(parent.rotation, localOffset)),
      rotation: matMul(parent.rotation, localRotation),
    });
  }
  return transforms;
}

function toVector3D(v: StudioMannequinVec3): Vector3D {
  return { x: v[0], y: v[1], z: v[2] };
}

/**
 * 솔버 스냅샷을 만든다. 발끝점은 발 관절 프레임에서 발바닥 높이
 * (-ankleHeight = -0.32 headUnit)와 발 길이의 72% 지점이다 — rest 자세에서
 * 발끝점의 월드 y가 정확히 0(지면)이 되도록 발 프리미티브(구 중심
 * z=0.22·반경 0.5 footLen, 바닥 -ankleHeight)에서 도출한 값이다.
 */
export function buildStudioMannequinFootContactSnapshot(
  spec: StudioMannequinSpec,
  pose: StudioMannequinPose,
): CharacterRigPoseSnapshot {
  const transforms = computeStudioMannequinJointWorldTransforms(spec, pose);
  const ankleHeight = 0.32 * spec.headUnit;
  const footLength = 0.95 * spec.headUnit * (spec.params.footScale ?? 1);
  const toeLocal: StudioMannequinVec3 = [0, -ankleHeight, footLength * 0.72];

  const leg = (side: "left" | "right") => {
    const hip = transforms.get(`${side}UpperLeg` as StudioMannequinJointId);
    const knee = transforms.get(`${side}LowerLeg` as StudioMannequinJointId);
    const ankle = transforms.get(`${side}Foot` as StudioMannequinJointId);
    if (!hip || !knee || !ankle) {
      throw new Error(`마네킹 다리 관절이 스펙에 없습니다: ${side}`);
    }
    const toe = addVec(ankle.position, matApply(ankle.rotation, toeLocal));
    return {
      hip: toVector3D(hip.position),
      knee: toVector3D(knee.position),
      ankle: toVector3D(ankle.position),
      toe: toVector3D(toe),
    };
  };

  const pelvis = transforms.get("pelvis");
  if (!pelvis) throw new Error("마네킹 골반 관절이 스펙에 없습니다.");
  return {
    root: { x: 0, y: 0, z: 0 },
    pelvis: toVector3D(pelvis.position),
    leftLeg: leg("left"),
    rightLeg: leg("right"),
  };
}

export interface StudioMannequinFootGroundingResult {
  /** 접지 보정이 반영된 포즈. 보정이 없으면 입력 포즈와 같은 값이다. */
  readonly pose: StudioMannequinPose;
  /** 골반 오프셋이 실제로 바뀌었는지. */
  readonly applied: boolean;
  /** 골반을 들어 올린 양(m). 보정이 없으면 0. */
  readonly pelvisLiftMeters: number;
  /** 관통은 있지만 지지 가드가 보정을 막았는지(앉기·무릎 등 발이 지지가 아닌 자세). */
  readonly supportGuardBlocked: boolean;
  /** 솔버 판정 원본 — 접지 여부·관통 깊이·toe roll 각도를 UI 표시에 쓴다. */
  readonly groundingState: FootGroundingState;
  readonly summary: string;
}

/** 골반이 rest 높이의 이 비율 이상이면 "서 있는 자세"로 본다(지지 가드 기준). */
export const STUDIO_MANNEQUIN_FOOT_GROUNDING_STANDING_PELVIS_RATIO = 0.75;

export interface StudioMannequinFootGroundingOptions {
  /** 자동 접지 토글. false면 판정은 계산하되 포즈에 적용하지 않는다. */
  readonly enabled?: boolean;
  /** 지면 높이(m). 기본 0 — 씬의 그리드·그림자 캐처 평면과 같다. */
  readonly groundLevelY?: number;
}

/**
 * 포즈 변경·IK 드래그 종료 시점에 호출하는 자동 접지 진입점.
 * 관통이 있을 때만 골반을 들어 올리고(발바닥 밀착), 떠 있는 포즈와
 * 관절 회전은 건드리지 않는다. 반복 호출해도 추가 보정이 없어 멱등하다.
 */
export function groundStudioMannequinPose(
  pose: StudioMannequinPose,
  spec: StudioMannequinSpec,
  options: StudioMannequinFootGroundingOptions = {},
): StudioMannequinFootGroundingResult {
  const snapshot = buildStudioMannequinFootContactSnapshot(spec, pose);
  const solver = new Studio3DFootContactSolver({
    groundLevelY: options.groundLevelY ?? 0,
    autoLevelPelvis: true,
    toeRollEnabled: true,
  });
  const solved = solver.solve(snapshot);
  const lift = solved.groundingState.pelvisVerticalOffset;
  if (options.enabled === false || !(lift > 0)) {
    return {
      pose,
      applied: false,
      pelvisLiftMeters: 0,
      supportGuardBlocked: false,
      groundingState: solved.groundingState,
      summary: solved.summary,
    };
  }
  // 지지 가드 — 관통한 발의 발목이 지면 위에 있거나(발바닥만 잠김) 골반이
  // 서 있는 높이에 있을 때만 발 접지가 지지라고 보고 들어 올린다.
  const groundY = options.groundLevelY ?? 0;
  const soleOnlyPenetration =
    (solved.groundingState.leftPenetrationDepth <= 0 || snapshot.leftLeg.ankle.y >= groundY) &&
    (solved.groundingState.rightPenetrationDepth <= 0 || snapshot.rightLeg.ankle.y >= groundY);
  const restPelvis = spec.joints.find((joint) => joint.id === "pelvis");
  const standingLike =
    restPelvis !== undefined &&
    snapshot.pelvis.y >= restPelvis.offset[1] * STUDIO_MANNEQUIN_FOOT_GROUNDING_STANDING_PELVIS_RATIO;
  if (!soleOnlyPenetration && !standingLike) {
    return {
      pose,
      applied: false,
      pelvisLiftMeters: 0,
      supportGuardBlocked: true,
      groundingState: solved.groundingState,
      summary: solved.summary,
    };
  }
  const grounded = normalizeStudioMannequinPose({
    joints: pose.joints,
    pelvisOffset: [pose.pelvisOffset[0], pose.pelvisOffset[1] + lift, pose.pelvisOffset[2]],
  });
  return {
    pose: grounded,
    applied: true,
    pelvisLiftMeters: lift,
    supportGuardBlocked: false,
    groundingState: solved.groundingState,
    summary: solved.summary,
  };
}
