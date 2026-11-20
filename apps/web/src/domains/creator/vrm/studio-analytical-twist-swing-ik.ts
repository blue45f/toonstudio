/**
 * SHAPER HybrIK / Tooning Plus 손 트래킹 클린룸 — 닫힌 형식 Swing-Twist IK + ROM 클램프 + 1-Euro 필터.
 *
 * - 임의 쿼터니언의 정확한 Swing-Twist 분해 (`q = q_swing * q_twist`)
 * - 2본 사지(어깨-팔꿈치-손목, 고관절-무릎-발목) 닫힌 형식 코사인 법칙 + 축 회전(Twist) 솔버
 * - 팔꿈치·무릎·어깨·손가락 해부학 가동범위(ROM) 클램프 (과신전·비틀림 붕괴 차단)
 * - 웹캠/핸드 트래킹 지터 제거용 1-Euro 적응형 로우패스 필터 (스칼라·Vec3·Quaternion)
 * - `Space` 키 즉시 적용(실행취소 스냅샷 포함) 커맨드 해석기
 */

export type Vec3Tuple = readonly [number, number, number];
/** `[x, y, z, w]` 순서의 단위 쿼터니언 튜플. */
export type QuatTuple = readonly [number, number, number, number];

export type AnatomicalJointId =
  | "leftElbow"
  | "rightElbow"
  | "leftKnee"
  | "rightKnee"
  | "leftShoulder"
  | "rightShoulder"
  | "fingerMcp"
  | "fingerPip"
  | "fingerDip";

export interface JointRomLimitSpec {
  readonly id: AnatomicalJointId;
  readonly labelKo: string;
  /** 허용 스윙 원뿔 최대 반각(rad). */
  readonly maxSwingConeRad: number;
  /** 주 힌지(굴곡) 축 (로컬 단위 벡터). */
  readonly hingeAxis: Vec3Tuple;
  /** 힌지 굴곡 최소/최대 각도(rad). */
  readonly minHingeRad: number;
  readonly maxHingeRad: number;
  /** 뼈 길이 방향 축 (트위스트 축). */
  readonly twistAxis: Vec3Tuple;
  /** 축 비틀림 최소/최대 각도(rad). */
  readonly minTwistRad: number;
  readonly maxTwistRad: number;
}

const DEG_TO_RAD = Math.PI / 180;
const EPS = 1e-8;

export const IDENTITY_QUAT: QuatTuple = Object.freeze([0, 0, 0, 1]);

export const ANATOMICAL_JOINT_ROM_LIMITS: Readonly<Record<AnatomicalJointId, JointRomLimitSpec>> = Object.freeze({
  leftElbow: {
    id: "leftElbow",
    labelKo: "왼팔꿈치",
    maxSwingConeRad: 148 * DEG_TO_RAD,
    hingeAxis: [0, 1, 0],
    minHingeRad: 0,
    maxHingeRad: 148 * DEG_TO_RAD,
    twistAxis: [1, 0, 0],
    minTwistRad: -85 * DEG_TO_RAD,
    maxTwistRad: 85 * DEG_TO_RAD,
  },
  rightElbow: {
    id: "rightElbow",
    labelKo: "오른팔꿈치",
    maxSwingConeRad: 148 * DEG_TO_RAD,
    hingeAxis: [0, -1, 0],
    minHingeRad: 0,
    maxHingeRad: 148 * DEG_TO_RAD,
    twistAxis: [-1, 0, 0],
    minTwistRad: -85 * DEG_TO_RAD,
    maxTwistRad: 85 * DEG_TO_RAD,
  },
  leftKnee: {
    id: "leftKnee",
    labelKo: "왼무릎",
    maxSwingConeRad: 145 * DEG_TO_RAD,
    hingeAxis: [1, 0, 0],
    minHingeRad: 0,
    maxHingeRad: 145 * DEG_TO_RAD,
    twistAxis: [0, -1, 0],
    minTwistRad: -12 * DEG_TO_RAD,
    maxTwistRad: 12 * DEG_TO_RAD,
  },
  rightKnee: {
    id: "rightKnee",
    labelKo: "오른무릎",
    maxSwingConeRad: 145 * DEG_TO_RAD,
    hingeAxis: [1, 0, 0],
    minHingeRad: 0,
    maxHingeRad: 145 * DEG_TO_RAD,
    twistAxis: [0, -1, 0],
    minTwistRad: -12 * DEG_TO_RAD,
    maxTwistRad: 12 * DEG_TO_RAD,
  },
  leftShoulder: {
    id: "leftShoulder",
    labelKo: "왼어깨",
    maxSwingConeRad: 135 * DEG_TO_RAD,
    hingeAxis: [0, 0, 1],
    minHingeRad: -135 * DEG_TO_RAD,
    maxHingeRad: 135 * DEG_TO_RAD,
    twistAxis: [1, 0, 0],
    minTwistRad: -75 * DEG_TO_RAD,
    maxTwistRad: 95 * DEG_TO_RAD,
  },
  rightShoulder: {
    id: "rightShoulder",
    labelKo: "오른어깨",
    maxSwingConeRad: 135 * DEG_TO_RAD,
    hingeAxis: [0, 0, -1],
    minHingeRad: -135 * DEG_TO_RAD,
    maxHingeRad: 135 * DEG_TO_RAD,
    twistAxis: [-1, 0, 0],
    minTwistRad: -75 * DEG_TO_RAD,
    maxTwistRad: 95 * DEG_TO_RAD,
  },
  fingerMcp: {
    id: "fingerMcp",
    labelKo: "손가락 기절관절(MCP)",
    maxSwingConeRad: 95 * DEG_TO_RAD,
    hingeAxis: [0, 0, 1],
    minHingeRad: -15 * DEG_TO_RAD,
    maxHingeRad: 95 * DEG_TO_RAD,
    twistAxis: [1, 0, 0],
    minTwistRad: -5 * DEG_TO_RAD,
    maxTwistRad: 5 * DEG_TO_RAD,
  },
  fingerPip: {
    id: "fingerPip",
    labelKo: "손가락 중절관절(PIP)",
    maxSwingConeRad: 105 * DEG_TO_RAD,
    hingeAxis: [0, 0, 1],
    minHingeRad: 0,
    maxHingeRad: 105 * DEG_TO_RAD,
    twistAxis: [1, 0, 0],
    minTwistRad: 0,
    maxTwistRad: 0,
  },
  fingerDip: {
    id: "fingerDip",
    labelKo: "손가락 말절관절(DIP)",
    maxSwingConeRad: 80 * DEG_TO_RAD,
    hingeAxis: [0, 0, 1],
    minHingeRad: 0,
    maxHingeRad: 80 * DEG_TO_RAD,
    twistAxis: [1, 0, 0],
    minTwistRad: 0,
    maxTwistRad: 0,
  },
});

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function dot3(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function sub3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function len3(v: Vec3Tuple): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize3(v: Vec3Tuple, fallback: Vec3Tuple = [0, 1, 0]): Vec3Tuple {
  const length = len3(v);
  if (length <= EPS) return fallback;
  return [v[0] / length, v[1] / length, v[2] / length];
}

export function normalizeQuat(q: QuatTuple): QuatTuple {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  if (len <= EPS) return IDENTITY_QUAT;
  const inv = 1 / len;
  return [q[0] * inv, q[1] * inv, q[2] * inv, q[3] * inv];
}

export function conjugateQuat(q: QuatTuple): QuatTuple {
  return [-q[0], -q[1], -q[2], q[3]];
}

export function multiplyQuat(a: QuatTuple, b: QuatTuple): QuatTuple {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return normalizeQuat([
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]);
}

export function quatFromAxisAngle(axis: Vec3Tuple, angleRad: number): QuatTuple {
  const unit = normalize3(axis);
  const half = angleRad * 0.5;
  const s = Math.sin(half);
  return normalizeQuat([unit[0] * s, unit[1] * s, unit[2] * s, Math.cos(half)]);
}

export function quatFromUnitVectors(from: Vec3Tuple, to: Vec3Tuple): QuatTuple {
  const u = normalize3(from);
  const v = normalize3(to);
  const d = clamp(dot3(u, v), -1, 1);
  if (d >= 1 - 1e-6) return IDENTITY_QUAT;
  if (d <= -1 + 1e-6) {
    const orthoBase: Vec3Tuple = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const axis = normalize3(cross3(u, orthoBase));
    return quatFromAxisAngle(axis, Math.PI);
  }
  const c = cross3(u, v);
  return normalizeQuat([c[0], c[1], c[2], 1 + d]);
}

export function rotateVecByQuat(v: Vec3Tuple, q: QuatTuple): Vec3Tuple {
  const [qx, qy, qz, qw] = normalizeQuat(q);
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

export interface SwingTwistDecomposition {
  readonly swing: QuatTuple;
  readonly twist: QuatTuple;
  readonly swingAngleRad: number;
  readonly twistAngleRad: number;
}

/**
 * 단위 쿼터니언을 `q = swing * twist` 형태로 닫힌 형식 분해한다.
 */
export function decomposeSwingTwist(
  quaternion: QuatTuple,
  twistAxis: Vec3Tuple,
): SwingTwistDecomposition {
  const q = normalizeQuat(quaternion);
  const canonical: QuatTuple = q[3] < 0 ? [-q[0], -q[1], -q[2], -q[3]] : q;
  const axis = normalize3(twistAxis);
  const proj = canonical[0] * axis[0] + canonical[1] * axis[1] + canonical[2] * axis[2];
  const twistRaw: QuatTuple = [axis[0] * proj, axis[1] * proj, axis[2] * proj, canonical[3]];
  const twistLen = Math.hypot(twistRaw[0], twistRaw[1], twistRaw[2], twistRaw[3]);
  const twist: QuatTuple = twistLen > EPS
    ? [twistRaw[0] / twistLen, twistRaw[1] / twistLen, twistRaw[2] / twistLen, twistRaw[3] / twistLen]
    : IDENTITY_QUAT;

  const swing = multiplyQuat(canonical, conjugateQuat(twist));
  const twistSin = twist[0] * axis[0] + twist[1] * axis[1] + twist[2] * axis[2];
  const twistAngleRad = 2 * Math.atan2(twistSin, twist[3]);
  const swingVecLen = Math.hypot(swing[0], swing[1], swing[2]);
  const swingAngleRad = 2 * Math.atan2(swingVecLen, Math.abs(swing[3]));

  return {
    swing,
    twist,
    swingAngleRad,
    twistAngleRad,
  };
}

/**
 * 관절 쿼터니언을 해부학 ROM 원뿔(Swing)과 비틀림(Twist) 한계 안으로 클램핑한다.
 */
export function clampJointRotationToRom(
  quaternion: QuatTuple,
  jointId: AnatomicalJointId,
): {
  readonly rotation: QuatTuple;
  readonly clamped: boolean;
  readonly swingAngleRad: number;
  readonly twistAngleRad: number;
} {
  const limit = ANATOMICAL_JOINT_ROM_LIMITS[jointId];
  const { swing, twistAngleRad, swingAngleRad } = decomposeSwingTwist(quaternion, limit.twistAxis);

  const clampedTwistRad = clamp(twistAngleRad, limit.minTwistRad, limit.maxTwistRad);
  const clampedTwist = quatFromAxisAngle(limit.twistAxis, clampedTwistRad);

  let clampedSwing = swing;
  let finalSwingRad = swingAngleRad;
  let clamped = Math.abs(clampedTwistRad - twistAngleRad) > 1e-5;

  if (swingAngleRad > limit.maxSwingConeRad && swingAngleRad > EPS) {
    const sAxis = normalize3([swing[0], swing[1], swing[2]], limit.hingeAxis);
    clampedSwing = quatFromAxisAngle(sAxis, limit.maxSwingConeRad);
    finalSwingRad = limit.maxSwingConeRad;
    clamped = true;
  }

  return {
    rotation: multiplyQuat(clampedSwing, clampedTwist),
    clamped,
    swingAngleRad: finalSwingRad,
    twistAngleRad: clampedTwistRad,
  };
}

export interface AnalyticalTwoBoneIkInput {
  readonly rootPosition: Vec3Tuple;
  readonly midPosition: Vec3Tuple;
  readonly endPosition: Vec3Tuple;
  readonly targetPosition: Vec3Tuple;
  readonly poleHint: Vec3Tuple;
  readonly midJointId: "leftElbow" | "rightElbow" | "leftKnee" | "rightKnee";
  /** HybrIK 스타일 상완/허벅지 축 비틀림 각도(rad). */
  readonly upperTwistRad?: number;
}

export interface AnalyticalTwoBoneIkResult {
  readonly upperRotation: QuatTuple;
  readonly midRotation: QuatTuple;
  readonly solvedMidPosition: Vec3Tuple;
  readonly solvedEndPosition: Vec3Tuple;
  readonly midFlexionRad: number;
  readonly targetClampedByReach: boolean;
  readonly romClamped: boolean;
}

/**
 * 닫힌 형식 2본 Swing-Twist IK 솔버.
 * 반복 최적화 없이 코사인 법칙으로 정확한 굴곡각과 폴 평면을 해석적으로 풀고,
 * 해부학 ROM 클램프를 적용한다.
 */
export function solveAnalyticalSwingTwistLimbIk(
  input: AnalyticalTwoBoneIkInput,
): AnalyticalTwoBoneIkResult {
  const restUpper = sub3(input.midPosition, input.rootPosition);
  const restLower = sub3(input.endPosition, input.midPosition);
  const l1 = Math.max(0.01, len3(restUpper));
  const l2 = Math.max(0.01, len3(restLower));
  const restUpperDir = normalize3(restUpper, [0, -1, 0]);
  const restLowerDir = normalize3(restLower, [0, -1, 0]);

  const toTarget = sub3(input.targetPosition, input.rootPosition);
  const rawDist = len3(toTarget);
  const minReach = Math.abs(l1 - l2) + 0.004;
  const maxReach = l1 + l2 - 0.002;
  const targetDist = clamp(rawDist, minReach, maxReach);
  const targetClampedByReach = Math.abs(targetDist - rawDist) > 1e-4;
  const targetDir = normalize3(toTarget, restUpperDir);

  // 코사인 법칙: 상완이 타깃 축과 이루는 각(alpha) 및 관절 굴곡각(flexion)
  const cosAlpha = clamp((l1 * l1 + targetDist * targetDist - l2 * l2) / (2 * l1 * targetDist), -1, 1);
  const alpha = Math.acos(cosAlpha);
  const cosInner = clamp((l1 * l1 + l2 * l2 - targetDist * targetDist) / (2 * l1 * l2), -1, 1);
  const rawFlexion = Math.PI - Math.acos(cosInner);

  const midLimit = ANATOMICAL_JOINT_ROM_LIMITS[input.midJointId];
  const midFlexionRad = clamp(rawFlexion, midLimit.minHingeRad, midLimit.maxHingeRad);
  const romClamped = Math.abs(midFlexionRad - rawFlexion) > 1e-5;

  // 폴 방향을 targetDir에 직교 투영해 굽힘 평면 법선 구성
  const toPole = sub3(input.poleHint, input.rootPosition);
  const proj = dot3(toPole, targetDir);
  const orthoPoleRaw: Vec3Tuple = [
    toPole[0] - targetDir[0] * proj,
    toPole[1] - targetDir[1] * proj,
    toPole[2] - targetDir[2] * proj,
  ];
  const bendPlaneDir = normalize3(
    orthoPoleRaw,
    Math.abs(targetDir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0],
  );
  const bendNormal = normalize3(cross3(targetDir, bendPlaneDir), [1, 0, 0]);

  // 해석적 상완 방향: targetDir를 bendNormal 주위로 alpha 회전 (bendPlaneDir 쪽으로 휨)
  const solvedUpperDir = normalize3([
    targetDir[0] * Math.cos(alpha) + bendPlaneDir[0] * Math.sin(alpha),
    targetDir[1] * Math.cos(alpha) + bendPlaneDir[1] * Math.sin(alpha),
    targetDir[2] * Math.cos(alpha) + bendPlaneDir[2] * Math.sin(alpha),
  ]);

  const solvedMidPosition: Vec3Tuple = [
    input.rootPosition[0] + solvedUpperDir[0] * l1,
    input.rootPosition[1] + solvedUpperDir[1] * l1,
    input.rootPosition[2] + solvedUpperDir[2] * l1,
  ];

  // 상완 Swing-Twist 결합
  const upperSwing = quatFromUnitVectors(restUpperDir, solvedUpperDir);
  const upperTwistAngle = clamp(input.upperTwistRad ?? 0, -Math.PI * 0.65, Math.PI * 0.65);
  const upperTwist = quatFromAxisAngle(restUpperDir, upperTwistAngle);
  const upperRotation = multiplyQuat(upperSwing, upperTwist);

  // 하완 힌지 회전 (로컬 굴곡각 기준)
  const midRawQuat = quatFromAxisAngle(midLimit.hingeAxis, midFlexionRad);
  const midClamped = clampJointRotationToRom(midRawQuat, input.midJointId);

  // 해결된 하완 방향 및 말단 좌표 재구성
  const solvedLowerDir = normalize3(
    rotateVecByQuat(
      solvedUpperDir,
      quatFromAxisAngle(bendNormal, -midFlexionRad),
    ),
    restLowerDir,
  );
  const solvedEndPosition: Vec3Tuple = [
    solvedMidPosition[0] + solvedLowerDir[0] * l2,
    solvedMidPosition[1] + solvedLowerDir[1] * l2,
    solvedMidPosition[2] + solvedLowerDir[2] * l2,
  ];

  return {
    upperRotation,
    midRotation: midClamped.rotation,
    solvedMidPosition,
    solvedEndPosition,
    midFlexionRad,
    targetClampedByReach,
    romClamped: romClamped || midClamped.clamped,
  };
}

export interface OneEuroFilterConfig {
  /** 정지 상태에서 지터를 억제하는 최소 컷오프 주파수(Hz). */
  readonly minCutoffHz: number;
  /** 빠른 동작에서 지연을 줄이는 속도 계수. */
  readonly beta: number;
  /** 도함수 저역통과 필터 컷오프 주파수(Hz). */
  readonly dCutoffHz: number;
}

export const DEFAULT_ONE_EURO_CONFIG: OneEuroFilterConfig = Object.freeze({
  minCutoffHz: 1.2,
  beta: 0.04,
  dCutoffHz: 1.0,
});

function smoothingFactor(dtSec: number, cutoffHz: number): number {
  const safeDt = Math.max(1e-4, dtSec);
  const safeCutoff = Math.max(1e-4, cutoffHz);
  const tau = 1 / (2 * Math.PI * safeCutoff);
  return 1 / (1 + tau / safeDt);
}

/** Casiez et al. 1-Euro 적응형 스칼라 필터. */
export class OneEuroScalarFilter {
  private readonly config: OneEuroFilterConfig;
  private initialized = false;
  private lastTimestampSec = 0;
  private lastFilteredValue = 0;
  private lastFilteredDerivative = 0;

  constructor(config: Partial<OneEuroFilterConfig> = {}) {
    this.config = {
      minCutoffHz: config.minCutoffHz ?? DEFAULT_ONE_EURO_CONFIG.minCutoffHz,
      beta: config.beta ?? DEFAULT_ONE_EURO_CONFIG.beta,
      dCutoffHz: config.dCutoffHz ?? DEFAULT_ONE_EURO_CONFIG.dCutoffHz,
    };
  }

  reset(): void {
    this.initialized = false;
    this.lastTimestampSec = 0;
    this.lastFilteredValue = 0;
    this.lastFilteredDerivative = 0;
  }

  filter(value: number, timestampSec: number): number {
    if (!Number.isFinite(value)) return this.lastFilteredValue;
    if (!this.initialized) {
      this.initialized = true;
      this.lastTimestampSec = timestampSec;
      this.lastFilteredValue = value;
      this.lastFilteredDerivative = 0;
      return value;
    }

    const dt = Math.max(1e-4, timestampSec - this.lastTimestampSec);
    const rawDerivative = (value - this.lastFilteredValue) / dt;
    const alphaD = smoothingFactor(dt, this.config.dCutoffHz);
    const filteredDerivative = alphaD * rawDerivative + (1 - alphaD) * this.lastFilteredDerivative;

    const adaptiveCutoff = this.config.minCutoffHz + this.config.beta * Math.abs(filteredDerivative);
    const alpha = smoothingFactor(dt, adaptiveCutoff);
    const filteredValue = alpha * value + (1 - alpha) * this.lastFilteredValue;

    this.lastTimestampSec = timestampSec;
    this.lastFilteredValue = filteredValue;
    this.lastFilteredDerivative = filteredDerivative;
    return filteredValue;
  }
}

/** 3D 벡터(웹캠 관절·손 랜드마크 좌표)용 1-Euro 필터. */
export class OneEuroVec3Filter {
  private readonly x: OneEuroScalarFilter;
  private readonly y: OneEuroScalarFilter;
  private readonly z: OneEuroScalarFilter;

  constructor(config: Partial<OneEuroFilterConfig> = {}) {
    this.x = new OneEuroScalarFilter(config);
    this.y = new OneEuroScalarFilter(config);
    this.z = new OneEuroScalarFilter(config);
  }

  reset(): void {
    this.x.reset();
    this.y.reset();
    this.z.reset();
  }

  filter(value: Vec3Tuple, timestampSec: number): Vec3Tuple {
    return [
      this.x.filter(value[0], timestampSec),
      this.y.filter(value[1], timestampSec),
      this.z.filter(value[2], timestampSec),
    ];
  }
}

/** 반구 연속성(hemisphere sign alignment)을 보장하는 쿼터니언용 1-Euro 필터. */
export class OneEuroQuatFilter {
  private readonly filters: readonly [
    OneEuroScalarFilter,
    OneEuroScalarFilter,
    OneEuroScalarFilter,
    OneEuroScalarFilter,
  ];
  private prevQuat: QuatTuple | null = null;

  constructor(config: Partial<OneEuroFilterConfig> = {}) {
    this.filters = [
      new OneEuroScalarFilter(config),
      new OneEuroScalarFilter(config),
      new OneEuroScalarFilter(config),
      new OneEuroScalarFilter(config),
    ];
  }

  reset(): void {
    this.prevQuat = null;
    for (const f of this.filters) f.reset();
  }

  filter(quat: QuatTuple, timestampSec: number): QuatTuple {
    let q = normalizeQuat(quat);
    if (this.prevQuat) {
      const dot =
        q[0] * this.prevQuat[0]
        + q[1] * this.prevQuat[1]
        + q[2] * this.prevQuat[2]
        + q[3] * this.prevQuat[3];
      if (dot < 0) {
        q = [-q[0], -q[1], -q[2], -q[3]];
      }
    }
    const filtered = normalizeQuat([
      this.filters[0].filter(q[0], timestampSec),
      this.filters[1].filter(q[1], timestampSec),
      this.filters[2].filter(q[2], timestampSec),
      this.filters[3].filter(q[3], timestampSec),
    ]);
    this.prevQuat = filtered;
    return filtered;
  }
}

export interface PoseCaptureShortcutEventLike {
  readonly code?: string;
  readonly key?: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly repeat?: boolean;
  readonly target?: {
    readonly tagName?: string;
    readonly isContentEditable?: boolean;
  } | null;
}

export interface WebcamPoseApplyCommand {
  readonly type: "apply-webcam-ik-pose";
  readonly appliedAtMs: number;
  readonly boneRotations: Readonly<Record<string, QuatTuple>>;
  readonly previousBoneRotations: Readonly<Record<string, QuatTuple>>;
}

/**
 * 웹캠/손 트래킹 실시간 프리뷰 중 `Space` 키를 누르면 즉시 현재 포즈를 확정 적용하는 단축키를 해석한다.
 */
export function isSpaceInstantApplyShortcut(event: PoseCaptureShortcutEventLike): boolean {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return false;
  }
  const tag = event.target?.tagName?.toUpperCase() ?? "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target?.isContentEditable) {
    return false;
  }
  return event.code === "Space" || event.key === " ";
}

/** 현재 필터링된 IK 본 회전을 실행취소 가능한 스냅샷 커맨드로 고정한다. */
export function createWebcamPoseApplyCommand(
  filteredRotations: Readonly<Record<string, QuatTuple>>,
  previousRotations: Readonly<Record<string, QuatTuple>>,
  appliedAtMs: number,
): WebcamPoseApplyCommand {
  const boneRotations: Record<string, QuatTuple> = {};
  const previousBoneRotations: Record<string, QuatTuple> = {};
  for (const [bone, quat] of Object.entries(filteredRotations)) {
    boneRotations[bone] = normalizeQuat(quat);
    previousBoneRotations[bone] = previousRotations[bone]
      ? normalizeQuat(previousRotations[bone])
      : IDENTITY_QUAT;
  }
  return {
    type: "apply-webcam-ik-pose",
    appliedAtMs,
    boneRotations,
    previousBoneRotations,
  };
}
