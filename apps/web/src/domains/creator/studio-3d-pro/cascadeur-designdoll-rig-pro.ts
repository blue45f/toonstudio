/**
 * Cascadeur 물리 기반 AutoPosing(무게중심·지탱발·관통 해소) 및
 * DesignDoll 과장 원근(False Perspective)·10손가락 관절 프로 리깅 엔진.
 *
 * - T-026: 인체 부위 질량 비율 기반 무게중심(CoM) 계산, 지탱발 지지 다각형(Fulcrum) 균형 보정,
 *   주요 신체 부위 캡슐 간 자기 관통(Self-Collision) 자동 해소.
 * - T-027: 카메라 방향 과장 원근(False Perspective) 왜곡, 좌·우 10손가락 3관절(MCP·PIP·DIP)
 *   + 벌림(Splay) + 엄지 대립(Opposition) 생리학 범위 클램핑 및 웹툰 손 포즈 프리셋.
 */

export interface Vec3Meters {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type HumanoidJointKey =
  | "hips"
  | "chest"
  | "head"
  | "leftUpperArm"
  | "leftForearm"
  | "leftHand"
  | "rightUpperArm"
  | "rightForearm"
  | "rightHand"
  | "leftUpperLeg"
  | "leftLowerLeg"
  | "leftFoot"
  | "rightUpperLeg"
  | "rightLowerLeg"
  | "rightFoot";

export type HumanoidPoseMap = Readonly<Record<HumanoidJointKey, Vec3Meters>>;

export type FulcrumStanceMode = "both-feet" | "left-foot" | "right-foot";

export interface FulcrumSupportZone {
  readonly centerX: number;
  readonly centerZ: number;
  readonly halfWidthX: number;
  readonly halfDepthZ: number;
  readonly stanceMode: FulcrumStanceMode;
}

export interface AutoBalanceResult {
  readonly pose: HumanoidPoseMap;
  readonly beforeCom: Vec3Meters;
  readonly afterCom: Vec3Meters;
  readonly fulcrum: FulcrumSupportZone;
  readonly comShiftMeters: number;
  readonly stabilityScore: number;
  readonly isBalanced: boolean;
  readonly leanAngleDeg: number;
}

export interface SelfCollisionPairReport {
  readonly jointA: HumanoidJointKey;
  readonly jointB: HumanoidJointKey;
  readonly penetrationMeters: number;
  readonly resolvedDistanceMeters: number;
}

export interface SelfCollisionResolutionResult {
  readonly pose: HumanoidPoseMap;
  readonly resolvedCollisionCount: number;
  readonly pairs: readonly SelfCollisionPairReport[];
}

export interface FalsePerspectiveResult {
  readonly pose: HumanoidPoseMap;
  readonly nearLimbBoostRatio: number;
  readonly farLimbShrinkRatio: number;
  readonly focalJoint: HumanoidJointKey;
}

export type HandSide = "left" | "right";
export type FingerName = "thumb" | "index" | "middle" | "ring" | "pinky";

export interface FingerJointState {
  /** 손허리손가락관절 굽힘 (도) */
  readonly mcpCurlDeg: number;
  /** 근위지절관절 굽힘 (도) */
  readonly pipCurlDeg: number;
  /** 원위지절관절 굽힘 (도) */
  readonly dipCurlDeg: number;
  /** 손가락 벌림 각도 (도) */
  readonly splayDeg: number;
  /** 엄지 대립(마주보기) 회전각 (도, 엄지 전용 0..75) */
  readonly oppositionDeg: number;
}

export type SingleHandPose = Readonly<Record<FingerName, FingerJointState>>;

export interface TenFingerRigState {
  readonly left: SingleHandPose;
  readonly right: SingleHandPose;
}

export type HandGesturePresetId =
  | "relaxed-natural"
  | "sword-grip"
  | "pointing-dramatic"
  | "open-reach"
  | "cup-hold"
  | "fist-clench";

export interface HandGesturePreset {
  readonly id: HandGesturePresetId;
  readonly labelKo: string;
  readonly usageKo: string;
  readonly hand: SingleHandPose;
}

export type ActionPosePresetId =
  | "rofan-courtesy"
  | "hunter-slash"
  | "cafe-casual"
  | "noir-lean";

export interface ActionPosePreset {
  readonly id: ActionPosePresetId;
  readonly labelKo: string;
  readonly stanceMode: FulcrumStanceMode;
  readonly pose: HumanoidPoseMap;
}

/** 인체 공학 분절 질량 가중치(합계 1.0, Dempster/Winter 표준 비율 근사) */
const SEGMENT_MASS_WEIGHTS: Readonly<Record<HumanoidJointKey, number>> = Object.freeze({
  hips: 0.16,
  chest: 0.28,
  head: 0.08,
  leftUpperArm: 0.03,
  leftForearm: 0.02,
  leftHand: 0.01,
  rightUpperArm: 0.03,
  rightForearm: 0.02,
  rightHand: 0.01,
  leftUpperLeg: 0.10,
  leftLowerLeg: 0.06,
  leftFoot: 0.02,
  rightUpperLeg: 0.10,
  rightLowerLeg: 0.06,
  rightFoot: 0.02,
});

/** 신체 캡슐 충돌 판정 반경(m) */
const JOINT_COLLISION_RADII_M: Readonly<Record<HumanoidJointKey, number>> = Object.freeze({
  hips: 0.15,
  chest: 0.16,
  head: 0.11,
  leftUpperArm: 0.055,
  leftForearm: 0.045,
  leftHand: 0.045,
  rightUpperArm: 0.055,
  rightForearm: 0.045,
  rightHand: 0.045,
  leftUpperLeg: 0.08,
  leftLowerLeg: 0.055,
  leftFoot: 0.05,
  rightUpperLeg: 0.08,
  rightLowerLeg: 0.055,
  rightFoot: 0.05,
});

const SELF_COLLISION_PAIRS: readonly (readonly [HumanoidJointKey, HumanoidJointKey])[] = Object.freeze([
  ["leftHand", "chest"],
  ["rightHand", "chest"],
  ["leftHand", "hips"],
  ["rightHand", "hips"],
  ["leftForearm", "chest"],
  ["rightForearm", "chest"],
  ["leftHand", "head"],
  ["rightHand", "head"],
  ["leftLowerLeg", "rightLowerLeg"],
  ["leftHand", "rightHand"],
]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function dist3(a: Vec3Meters, b: Vec3Meters): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** 15관절 휴머노이드 질량 가중 무게중심(CoM)을 계산한다. */
export function computeCenterOfMass(pose: HumanoidPoseMap): Vec3Meters {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let totalWeight = 0;

  for (const key of Object.keys(SEGMENT_MASS_WEIGHTS) as HumanoidJointKey[]) {
    const w = SEGMENT_MASS_WEIGHTS[key];
    const p = pose[key];
    sx += p.x * w;
    sy += p.y * w;
    sz += p.z * w;
    totalWeight += w;
  }
  const inv = totalWeight > 0 ? 1 / totalWeight : 1;
  return {
    x: Number((sx * inv).toFixed(4)),
    y: Number((sy * inv).toFixed(4)),
    z: Number((sz * inv).toFixed(4)),
  };
}

/** 지탱발 배치에 따른 지지 다각형(Fulcrum Support Zone)을 산출한다. */
export function computeFulcrumSupportPolygon(
  pose: HumanoidPoseMap,
  stanceMode: FulcrumStanceMode = "both-feet",
): FulcrumSupportZone {
  const lf = pose.leftFoot;
  const rf = pose.rightFoot;
  const footMarginX = 0.065;
  const footMarginZ = 0.11;

  if (stanceMode === "left-foot") {
    return {
      centerX: lf.x,
      centerZ: lf.z,
      halfWidthX: footMarginX,
      halfDepthZ: footMarginZ,
      stanceMode,
    };
  }
  if (stanceMode === "right-foot") {
    return {
      centerX: rf.x,
      centerZ: rf.z,
      halfWidthX: footMarginX,
      halfDepthZ: footMarginZ,
      stanceMode,
    };
  }

  const minX = Math.min(lf.x, rf.x) - footMarginX;
  const maxX = Math.max(lf.x, rf.x) + footMarginX;
  const minZ = Math.min(lf.z, rf.z) - footMarginZ;
  const maxZ = Math.max(lf.z, rf.z) + footMarginZ;
  return {
    centerX: (minX + maxX) * 0.5,
    centerZ: (minZ + maxZ) * 0.5,
    halfWidthX: Math.max(footMarginX, (maxX - minX) * 0.5),
    halfDepthZ: Math.max(footMarginZ, (maxZ - minZ) * 0.5),
    stanceMode,
  };
}

function evaluateStabilityScore(com: Vec3Meters, fulcrum: FulcrumSupportZone): number {
  const normX = Math.abs(com.x - fulcrum.centerX) / Math.max(0.02, fulcrum.halfWidthX);
  const normZ = Math.abs(com.z - fulcrum.centerZ) / Math.max(0.02, fulcrum.halfDepthZ);
  const radial = Math.hypot(normX, normZ);
  return Number(clamp(1 - radial * 0.55, 0, 1).toFixed(3));
}

/**
 * Cascadeur 스타일 물리 기반 AutoPosing 균형 보정기.
 * 지탱발을 바닥에 고정한 채 골반·상체·반대쪽 팔을 보정해 무게중심을 지지면 안쪽으로 이동시킨다.
 */
export function solveCascadeurAutoBalance(
  pose: HumanoidPoseMap,
  options?: {
    readonly stanceMode?: FulcrumStanceMode;
    readonly balanceStrength?: number;
  },
): AutoBalanceResult {
  const stanceMode = options?.stanceMode ?? "both-feet";
  const strength = clamp(options?.balanceStrength ?? 0.96, 0.1, 1.0);
  const fulcrum = computeFulcrumSupportPolygon(pose, stanceMode);
  const beforeCom = computeCenterOfMass(pose);

  const errX = fulcrum.centerX - beforeCom.x;
  const errZ = fulcrum.centerZ - beforeCom.z;

  // 발·정강이 하단은 지탱점으로 고정하고 상체·골반에 가중 이동을 분배한다.
  const upperBodyFactor: Readonly<Record<HumanoidJointKey, number>> = {
    hips: 1.05,
    chest: 1.22,
    head: 1.30,
    leftUpperArm: 1.18,
    leftForearm: 1.12,
    leftHand: 1.05,
    rightUpperArm: 1.18,
    rightForearm: 1.12,
    rightHand: 1.05,
    leftUpperLeg: 0.62,
    leftLowerLeg: stanceMode === "right-foot" ? 0.45 : 0.14,
    leftFoot: stanceMode === "right-foot" ? 0.30 : 0.0,
    rightUpperLeg: 0.62,
    rightLowerLeg: stanceMode === "left-foot" ? 0.45 : 0.14,
    rightFoot: stanceMode === "left-foot" ? 0.30 : 0.0,
  };

  // 질량 가중 평균 분배계수 정규화 -> 정확히 CoM이 목표점에 수렴하도록 보정
  let effectiveMassGain = 0;
  for (const key of Object.keys(SEGMENT_MASS_WEIGHTS) as HumanoidJointKey[]) {
    effectiveMassGain += SEGMENT_MASS_WEIGHTS[key] * upperBodyFactor[key];
  }
  const scaleCorrection = effectiveMassGain > 1e-4 ? strength / effectiveMassGain : strength;

  const next: Record<HumanoidJointKey, Vec3Meters> = { ...pose };
  for (const key of Object.keys(pose) as HumanoidJointKey[]) {
    const f = upperBodyFactor[key] * scaleCorrection;
    const p = pose[key];
    next[key] = {
      x: Number((p.x + errX * f).toFixed(4)),
      y: p.y,
      z: Number((p.z + errZ * f).toFixed(4)),
    };
  }

  const afterCom = computeCenterOfMass(next);
  const stabilityScore = evaluateStabilityScore(afterCom, fulcrum);
  const insideX = Math.abs(afterCom.x - fulcrum.centerX) <= fulcrum.halfWidthX * 1.02;
  const insideZ = Math.abs(afterCom.z - fulcrum.centerZ) <= fulcrum.halfDepthZ * 1.02;
  const leanAngleDeg = Number(
    (
      Math.atan2(
        Math.hypot(next.chest.x - next.hips.x, next.chest.z - next.hips.z),
        Math.max(0.15, next.chest.y - next.hips.y),
      ) *
      (180 / Math.PI)
    ).toFixed(1),
  );

  return {
    pose: next,
    beforeCom,
    afterCom,
    fulcrum,
    comShiftMeters: Number(Math.hypot(afterCom.x - beforeCom.x, afterCom.z - beforeCom.z).toFixed(4)),
    stabilityScore,
    isBalanced: insideX && insideZ,
    leanAngleDeg,
  };
}

/**
 * 신체 관통(Self-Collision) 자동 해소기.
 * 손·팔뚝이 가슴·골반·머리를 뚫고 들어간 경우 캡슐 최소 안전 거리 밖으로 밀어낸다.
 */
export function resolveBodySelfCollisions(
  pose: HumanoidPoseMap,
  clearanceMarginMeters = 0.015,
): SelfCollisionResolutionResult {
  const mutable: Record<HumanoidJointKey, Vec3Meters> = { ...pose };
  const pairs: SelfCollisionPairReport[] = [];

  for (const [movableKey, anchorKey] of SELF_COLLISION_PAIRS) {
    const a = mutable[movableKey];
    const b = mutable[anchorKey];
    const minSafe =
      JOINT_COLLISION_RADII_M[movableKey] +
      JOINT_COLLISION_RADII_M[anchorKey] +
      clearanceMarginMeters;
    const d = dist3(a, b);

    if (d < minSafe) {
      const penetration = minSafe - d;
      // 겹침 중심이 완전히 같으면 좌우·전면 방향으로 자연스럽게 밀어낸다.
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let dz = a.z - b.z;
      let norm = Math.hypot(dx, dy, dz);
      if (norm < 1e-5) {
        dx = movableKey.startsWith("left") ? -0.8 : 0.8;
        dy = 0.1;
        dz = 0.6;
        norm = Math.hypot(dx, dy, dz);
      }
      const pushX = (dx / norm) * (penetration + 0.004);
      const pushY = (dy / norm) * (penetration + 0.004) * 0.45;
      const pushZ = (dz / norm) * (penetration + 0.004);

      const resolved: Vec3Meters = {
        x: Number((a.x + pushX).toFixed(4)),
        y: Number((a.y + pushY).toFixed(4)),
        z: Number((a.z + pushZ).toFixed(4)),
      };
      mutable[movableKey] = resolved;
      pairs.push({
        jointA: movableKey,
        jointB: anchorKey,
        penetrationMeters: Number(penetration.toFixed(4)),
        resolvedDistanceMeters: Number(dist3(resolved, b).toFixed(4)),
      });
    }
  }

  return {
    pose: mutable,
    resolvedCollisionCount: pairs.length,
    pairs,
  };
}

/**
 * DesignDoll 스타일 과장 원근(False Perspective) 변형기.
 * 카메라에 가까운 손·발은 역동적으로 확대하고 멀어진 신체 부위는 압축해 웹툰 액션 컷을 만든다.
 */
export function applyFalsePerspectiveExaggeration(
  pose: HumanoidPoseMap,
  cameraPosition: Vec3Meters,
  strength: number,
): FalsePerspectiveResult {
  const s = clamp(strength, 0, 1);
  const center = pose.chest;
  const baseDist = Math.max(0.4, dist3(center, cameraPosition));

  let minRatio = Number.POSITIVE_INFINITY;
  let maxRatio = 0;
  let closestJoint: HumanoidJointKey = "rightHand";
  let closestDist = Number.POSITIVE_INFINITY;

  const next: Record<HumanoidJointKey, Vec3Meters> = { ...pose };
  for (const key of Object.keys(pose) as HumanoidJointKey[]) {
    const p = pose[key];
    const d = Math.max(0.2, dist3(p, cameraPosition));
    if (d < closestDist) {
      closestDist = d;
      closestJoint = key;
    }
    // 가까운 부위(d < baseDist)는 > 1.0 확대, 먼 부위는 < 1.0 압축
    const relDepth = (baseDist - d) / baseDist;
    const scaleFactor = clamp(1 + relDepth * s * 0.72, 0.72, 1.55);
    minRatio = Math.min(minRatio, scaleFactor);
    maxRatio = Math.max(maxRatio, scaleFactor);

    next[key] = {
      x: Number((center.x + (p.x - center.x) * scaleFactor).toFixed(4)),
      y: Number((center.y + (p.y - center.y) * scaleFactor).toFixed(4)),
      z: Number((center.z + (p.z - center.z) * scaleFactor).toFixed(4)),
    };
  }

  return {
    pose: next,
    nearLimbBoostRatio: Number(maxRatio.toFixed(3)),
    farLimbShrinkRatio: Number(minRatio.toFixed(3)),
    focalJoint: closestJoint,
  };
}

// ---------------------------------------------------------------------------
// DesignDoll 10손가락(좌·우 × 5손가락 × 3관절+벌림+엄지대립) 컨트롤러
// ---------------------------------------------------------------------------

export const FINGER_ORDER: readonly FingerName[] = Object.freeze([
  "thumb",
  "index",
  "middle",
  "ring",
  "pinky",
]);

export const FINGER_LABELS_KO: Readonly<Record<FingerName, string>> = Object.freeze({
  thumb: "엄지",
  index: "검지",
  middle: "중지",
  ring: "약지",
  pinky: "새끼",
});

/** 손가락별 해부학 관절 가동 한계로 값을 안전하게 제한한다. */
export function clampFingerPose(
  finger: FingerName,
  state: Partial<FingerJointState>,
): FingerJointState {
  const isThumb = finger === "thumb";
  return {
    mcpCurlDeg: clamp(state.mcpCurlDeg ?? 0, isThumb ? -10 : -15, isThumb ? 65 : 95),
    pipCurlDeg: clamp(state.pipCurlDeg ?? 0, 0, isThumb ? 80 : 110),
    dipCurlDeg: clamp(state.dipCurlDeg ?? 0, 0, isThumb ? 70 : 85),
    splayDeg: clamp(state.splayDeg ?? 0, -25, 25),
    oppositionDeg: isThumb ? clamp(state.oppositionDeg ?? 20, 0, 75) : 0,
  };
}

function makeHand(
  thumb: Partial<FingerJointState>,
  index: Partial<FingerJointState>,
  middle: Partial<FingerJointState>,
  ring: Partial<FingerJointState>,
  pinky: Partial<FingerJointState>,
): SingleHandPose {
  return Object.freeze({
    thumb: clampFingerPose("thumb", thumb),
    index: clampFingerPose("index", index),
    middle: clampFingerPose("middle", middle),
    ring: clampFingerPose("ring", ring),
    pinky: clampFingerPose("pinky", pinky),
  });
}

export const HAND_GESTURE_PRESETS: Readonly<Record<HandGesturePresetId, HandGesturePreset>> =
  Object.freeze({
    "relaxed-natural": {
      id: "relaxed-natural",
      labelKo: "자연스러운 손",
      usageKo: "일상 대화·대기 컷",
      hand: makeHand(
        { mcpCurlDeg: 18, pipCurlDeg: 22, dipCurlDeg: 14, splayDeg: 12, oppositionDeg: 28 },
        { mcpCurlDeg: 16, pipCurlDeg: 24, dipCurlDeg: 16, splayDeg: 6 },
        { mcpCurlDeg: 22, pipCurlDeg: 32, dipCurlDeg: 20, splayDeg: 0 },
        { mcpCurlDeg: 28, pipCurlDeg: 38, dipCurlDeg: 24, splayDeg: -4 },
        { mcpCurlDeg: 34, pipCurlDeg: 44, dipCurlDeg: 28, splayDeg: -8 },
      ),
    },
    "sword-grip": {
      id: "sword-grip",
      labelKo: "검·무기 잡기",
      usageKo: "무협·헌터 무기 쥐기",
      hand: makeHand(
        { mcpCurlDeg: 42, pipCurlDeg: 52, dipCurlDeg: 34, splayDeg: -6, oppositionDeg: 62 },
        { mcpCurlDeg: 68, pipCurlDeg: 82, dipCurlDeg: 54, splayDeg: 2 },
        { mcpCurlDeg: 76, pipCurlDeg: 88, dipCurlDeg: 60, splayDeg: 0 },
        { mcpCurlDeg: 82, pipCurlDeg: 92, dipCurlDeg: 64, splayDeg: -2 },
        { mcpCurlDeg: 86, pipCurlDeg: 94, dipCurlDeg: 68, splayDeg: -4 },
      ),
    },
    "pointing-dramatic": {
      id: "pointing-dramatic",
      labelKo: "드라마틱 가리키기",
      usageKo: "지시·대결·선언 컷",
      hand: makeHand(
        { mcpCurlDeg: 36, pipCurlDeg: 44, dipCurlDeg: 28, splayDeg: 0, oppositionDeg: 52 },
        { mcpCurlDeg: 4, pipCurlDeg: 6, dipCurlDeg: 4, splayDeg: 8 },
        { mcpCurlDeg: 82, pipCurlDeg: 98, dipCurlDeg: 70, splayDeg: 0 },
        { mcpCurlDeg: 86, pipCurlDeg: 102, dipCurlDeg: 74, splayDeg: -2 },
        { mcpCurlDeg: 88, pipCurlDeg: 104, dipCurlDeg: 76, splayDeg: -4 },
      ),
    },
    "open-reach": {
      id: "open-reach",
      labelKo: "손 뻗기",
      usageKo: "로판 애절함·구출 컷",
      hand: makeHand(
        { mcpCurlDeg: 6, pipCurlDeg: 8, dipCurlDeg: 6, splayDeg: 22, oppositionDeg: 20 },
        { mcpCurlDeg: 6, pipCurlDeg: 10, dipCurlDeg: 8, splayDeg: 14 },
        { mcpCurlDeg: 8, pipCurlDeg: 12, dipCurlDeg: 10, splayDeg: 2 },
        { mcpCurlDeg: 12, pipCurlDeg: 16, dipCurlDeg: 12, splayDeg: -8 },
        { mcpCurlDeg: 14, pipCurlDeg: 18, dipCurlDeg: 14, splayDeg: -16 },
      ),
    },
    "cup-hold": {
      id: "cup-hold",
      labelKo: "찻잔·소품 들기",
      usageKo: "카페·티타임 컷",
      hand: makeHand(
        { mcpCurlDeg: 26, pipCurlDeg: 30, dipCurlDeg: 18, splayDeg: 14, oppositionDeg: 48 },
        { mcpCurlDeg: 42, pipCurlDeg: 52, dipCurlDeg: 36, splayDeg: 6 },
        { mcpCurlDeg: 48, pipCurlDeg: 58, dipCurlDeg: 40, splayDeg: 0 },
        { mcpCurlDeg: 44, pipCurlDeg: 50, dipCurlDeg: 32, splayDeg: -6 },
        { mcpCurlDeg: 20, pipCurlDeg: 24, dipCurlDeg: 16, splayDeg: -14 },
      ),
    },
    "fist-clench": {
      id: "fist-clench",
      labelKo: "주먹 쥐기",
      usageKo: "분노·결의·격투 컷",
      hand: makeHand(
        { mcpCurlDeg: 54, pipCurlDeg: 68, dipCurlDeg: 50, splayDeg: -10, oppositionDeg: 72 },
        { mcpCurlDeg: 90, pipCurlDeg: 106, dipCurlDeg: 80, splayDeg: 0 },
        { mcpCurlDeg: 92, pipCurlDeg: 108, dipCurlDeg: 82, splayDeg: 0 },
        { mcpCurlDeg: 92, pipCurlDeg: 108, dipCurlDeg: 82, splayDeg: 0 },
        { mcpCurlDeg: 94, pipCurlDeg: 108, dipCurlDeg: 84, splayDeg: 0 },
      ),
    },
  });

export const HAND_GESTURE_PRESET_LIST: readonly HandGesturePreset[] = Object.freeze(
  Object.values(HAND_GESTURE_PRESETS),
);

export function createInitialTenFingerRig(): TenFingerRigState {
  return {
    left: HAND_GESTURE_PRESETS["relaxed-natural"].hand,
    right: HAND_GESTURE_PRESETS["relaxed-natural"].hand,
  };
}

export function applyHandGesturePreset(
  rig: TenFingerRigState,
  side: HandSide,
  presetId: HandGesturePresetId,
): TenFingerRigState {
  const hand = HAND_GESTURE_PRESETS[presetId].hand;
  return side === "left" ? { ...rig, left: hand } : { ...rig, right: hand };
}

/** 10손가락 중 특정 손가락의 굽힘률(0..100%)을 자연스러운 3관절 연동 각도로 갱신한다. */
export function updateFingerCurlPercent(
  rig: TenFingerRigState,
  side: HandSide,
  finger: FingerName,
  curlPercent: number,
): TenFingerRigState {
  const ratio = clamp(curlPercent, 0, 100) / 100;
  const current = rig[side][finger];
  const updated = clampFingerPose(finger, {
    ...current,
    mcpCurlDeg: Math.round(ratio * (finger === "thumb" ? 60 : 92)),
    pipCurlDeg: Math.round(ratio * (finger === "thumb" ? 74 : 108)),
    dipCurlDeg: Math.round(ratio * (finger === "thumb" ? 62 : 82)),
  });
  const nextHand: SingleHandPose = { ...rig[side], [finger]: updated };
  return side === "left" ? { ...rig, left: nextHand } : { ...rig, right: nextHand };
}

/** 한쪽 손의 5손가락 포즈를 반대쪽 손으로 거울 복사한다. */
export function mirrorHandPose(rig: TenFingerRigState, fromSide: HandSide): TenFingerRigState {
  const source = rig[fromSide];
  const mirrored: SingleHandPose = {
    thumb: { ...source.thumb, splayDeg: -source.thumb.splayDeg },
    index: { ...source.index, splayDeg: -source.index.splayDeg },
    middle: { ...source.middle, splayDeg: -source.middle.splayDeg },
    ring: { ...source.ring, splayDeg: -source.ring.splayDeg },
    pinky: { ...source.pinky, splayDeg: -source.pinky.splayDeg },
  };
  return fromSide === "left" ? { ...rig, right: mirrored } : { ...rig, left: mirrored };
}

/** 손가락 3관절 평균 굽힘률(0..100%)을 읽어 슬라이더 표시용 정수로 반환한다. */
export function readFingerCurlPercent(finger: FingerName, state: FingerJointState): number {
  const maxSum = finger === "thumb" ? 60 + 74 + 62 : 92 + 108 + 82;
  const currentSum = Math.max(0, state.mcpCurlDeg) + state.pipCurlDeg + state.dipCurlDeg;
  return Math.round(clamp((currentSum / maxSum) * 100, 0, 100));
}

/** 4종 웹툰 액션·일상 기본 포즈 프리셋 (일부는 의도적 불균형/관통을 포함해 물리 보정 효과를 즉시 체감) */
export const WEBTOON_ACTION_POSE_PRESETS: readonly ActionPosePreset[] = Object.freeze([
  {
    id: "rofan-courtesy",
    labelKo: "로판 우아한 인사",
    stanceMode: "both-feet",
    pose: {
      hips: { x: 0.04, y: 0.94, z: 0.02 },
      chest: { x: 0.06, y: 1.32, z: 0.08 },
      head: { x: 0.07, y: 1.58, z: 0.12 },
      leftUpperArm: { x: -0.18, y: 1.34, z: 0.04 },
      leftForearm: { x: -0.22, y: 1.12, z: 0.16 },
      leftHand: { x: -0.06, y: 1.24, z: 0.12 },
      rightUpperArm: { x: 0.22, y: 1.34, z: 0.02 },
      rightForearm: { x: 0.30, y: 1.10, z: 0.14 },
      rightHand: { x: 0.34, y: 0.96, z: 0.24 },
      leftUpperLeg: { x: -0.10, y: 0.72, z: 0.04 },
      leftLowerLeg: { x: -0.12, y: 0.40, z: 0.06 },
      leftFoot: { x: -0.14, y: 0.04, z: 0.08 },
      rightUpperLeg: { x: 0.11, y: 0.72, z: -0.04 },
      rightLowerLeg: { x: 0.14, y: 0.40, z: -0.08 },
      rightFoot: { x: 0.16, y: 0.04, z: -0.10 },
    },
  },
  {
    id: "hunter-slash",
    labelKo: "헌터 검격 도약",
    stanceMode: "left-foot",
    pose: {
      hips: { x: 0.24, y: 0.90, z: 0.26 },
      chest: { x: 0.34, y: 1.26, z: 0.42 },
      head: { x: 0.36, y: 1.50, z: 0.48 },
      leftUpperArm: { x: 0.12, y: 1.28, z: 0.30 },
      leftForearm: { x: -0.02, y: 1.14, z: 0.20 },
      leftHand: { x: 0.28, y: 1.24, z: 0.40 },
      rightUpperArm: { x: 0.50, y: 1.30, z: 0.56 },
      rightForearm: { x: 0.62, y: 1.34, z: 0.82 },
      rightHand: { x: 0.70, y: 1.38, z: 1.08 },
      leftUpperLeg: { x: -0.04, y: 0.68, z: 0.08 },
      leftLowerLeg: { x: -0.10, y: 0.38, z: 0.02 },
      leftFoot: { x: -0.14, y: 0.04, z: 0.00 },
      rightUpperLeg: { x: 0.26, y: 0.74, z: -0.18 },
      rightLowerLeg: { x: 0.34, y: 0.48, z: -0.34 },
      rightFoot: { x: 0.42, y: 0.28, z: -0.48 },
    },
  },
  {
    id: "cafe-casual",
    labelKo: "루프탑 카페 휴식",
    stanceMode: "both-feet",
    pose: {
      hips: { x: -0.03, y: 0.92, z: -0.04 },
      chest: { x: -0.05, y: 1.30, z: -0.02 },
      head: { x: -0.04, y: 1.56, z: 0.02 },
      leftUpperArm: { x: -0.22, y: 1.30, z: 0.00 },
      leftForearm: { x: -0.26, y: 1.08, z: 0.16 },
      leftHand: { x: -0.16, y: 1.10, z: 0.28 },
      rightUpperArm: { x: 0.18, y: 1.30, z: 0.00 },
      rightForearm: { x: 0.24, y: 1.12, z: 0.18 },
      rightHand: { x: 0.16, y: 1.18, z: 0.32 },
      leftUpperLeg: { x: -0.12, y: 0.70, z: 0.02 },
      leftLowerLeg: { x: -0.14, y: 0.38, z: 0.04 },
      leftFoot: { x: -0.14, y: 0.04, z: 0.06 },
      rightUpperLeg: { x: 0.10, y: 0.70, z: -0.02 },
      rightLowerLeg: { x: 0.12, y: 0.38, z: -0.04 },
      rightFoot: { x: 0.14, y: 0.04, z: -0.04 },
    },
  },
  {
    id: "noir-lean",
    labelKo: "느와르 기대기",
    stanceMode: "right-foot",
    pose: {
      hips: { x: -0.16, y: 0.92, z: -0.12 },
      chest: { x: -0.24, y: 1.30, z: -0.18 },
      head: { x: -0.22, y: 1.56, z: -0.14 },
      leftUpperArm: { x: -0.36, y: 1.28, z: -0.14 },
      leftForearm: { x: -0.30, y: 1.04, z: -0.04 },
      leftHand: { x: -0.18, y: 0.94, z: -0.08 },
      rightUpperArm: { x: -0.04, y: 1.28, z: -0.16 },
      rightForearm: { x: 0.08, y: 1.08, z: 0.04 },
      rightHand: { x: 0.04, y: 1.00, z: 0.14 },
      leftUpperLeg: { x: -0.16, y: 0.70, z: 0.08 },
      leftLowerLeg: { x: -0.10, y: 0.40, z: 0.18 },
      leftFoot: { x: -0.06, y: 0.04, z: 0.24 },
      rightUpperLeg: { x: 0.08, y: 0.70, z: -0.06 },
      rightLowerLeg: { x: 0.12, y: 0.38, z: -0.06 },
      rightFoot: { x: 0.14, y: 0.04, z: -0.06 },
    },
  },
]);
