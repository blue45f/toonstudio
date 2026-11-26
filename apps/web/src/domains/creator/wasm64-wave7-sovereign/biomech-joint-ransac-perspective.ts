/**
 * 해부학 스윙-트위스트 쿼터니언 관절 한계 가드 및 결정론적 RANSAC 1·2·3점 투시 소실점 추정기.
 *
 * - 3D 캐릭터 포징 시 어깨·팔꿈치·손목·목·고관절·무릎의 로컬 회전(`[qx, qy, qz, qw]`)을
 *   뼈 축 기준 스윙(Swing)과 트위스트(Twist)로 분해한 뒤 타원 원뿔(`rx, ry`)과 비틀림 구간을
 *   즉시 보정해 관절 과신전과 메쉬 캔디래퍼 꼬임을 0.1ms 안에 차단한다.
 * - 거친 스케치 선분 묶음에서 동차 사영 교점(`l_i × l_j`)과 각도 잔차 투표를 수행하고
 *   3×3 대칭 산포 행렬의 야코비 최소 고유벡터로 정밀 보정해 소실점·지평선·스냅 가이드를 산출한다.
 * - 외부 AI 토큰·서버 호출 0회(`₩0`), 브라우저 스토리지 전역 접근 0회.
 */

export type Vec2Tuple = readonly [number, number];
export type Vec3Tuple = readonly [number, number, number];
/** 단위 회전 쿼터니언 `[qx, qy, qz, qw]` (`qw`가 실수 스칼라부). */
export type QuatTuple = readonly [number, number, number, number];
export type BiomechJointId = "shoulder" | "elbow" | "wrist" | "neck" | "hip" | "knee";

export interface JointLimitSpec {
  readonly jointId: BiomechJointId; readonly labelKo: string;
  /** 뼈 길이 방향 단위 비틀림 축 및 직교 스윙 기저(`swingAxisX`, `swingAxisY`). */
  readonly twistAxis: Vec3Tuple; readonly swingAxisX: Vec3Tuple; readonly swingAxisY: Vec3Tuple;
  /** 주·부 스윙 방향 타원 반경 `rx, ry` (rad, `> 0`) 및 과신전 차단 중심 오프셋. */
  readonly swingRadiusXRad: number; readonly swingRadiusYRad: number;
  readonly swingCenterXRad?: number; readonly swingCenterYRad?: number;
  /** 허용 트위스트 각도 구간 `[minTwistRad, maxTwistRad]` (rad). */
  readonly minTwistRad: number; readonly maxTwistRad: number;
}

export interface SwingTwistDecomposition {
  readonly swingQuat: QuatTuple; readonly twistQuat: QuatTuple;
  readonly swingAngleXRad: number; readonly swingAngleYRad: number;
  readonly swingMagnitudeRad: number; readonly twistAngleRad: number;
  readonly antipodalCanonicalized: boolean;
}

export interface JointPoseGuardResult {
  readonly jointId: BiomechJointId; readonly labelKo: string;
  readonly inputQuat: QuatTuple; readonly guardedQuat: QuatTuple;
  readonly swingQuat: QuatTuple; readonly twistQuat: QuatTuple;
  readonly rawSwingAngleXRad: number; readonly rawSwingAngleYRad: number; readonly rawTwistAngleRad: number;
  readonly clampedSwingAngleXRad: number; readonly clampedSwingAngleYRad: number; readonly clampedTwistAngleRad: number;
  readonly swingClamped: boolean; readonly twistClamped: boolean; readonly antipodalCanonicalized: boolean;
  readonly elapsedMs: number; readonly serverCostKrw: 0;
}

export interface SkeletonJointPoseInput {
  readonly boneName: string; readonly jointId: BiomechJointId;
  readonly localQuat: QuatTuple;
  readonly customLimit?: Partial<Omit<JointLimitSpec, "jointId">>;
}

export interface SkeletonPoseBatchResult {
  readonly results: readonly (JointPoseGuardResult & { readonly boneName: string })[];
  readonly clampedBoneCount: number; readonly totalElapsedMs: number; readonly serverCostKrw: 0;
}

/**
 * 인체 해부학 가동 범위(ROM)에 맞춘 6종 핵심 관절 기본 한계 사전.
 * 팔꿈치·무릎은 굴곡 방향으로 타원 중심을 이동해 역방향 과신전(hyperextension)을 원천 차단한다.
 */
export const ANATOMICAL_JOINT_LIMITS: Readonly<Record<BiomechJointId, JointLimitSpec>> = Object.freeze({
  shoulder: {
    jointId: "shoulder", labelKo: "어깨 관절",
    twistAxis: [0, 1, 0], swingAxisX: [1, 0, 0], swingAxisY: [0, 0, 1],
    swingRadiusXRad: 1.65, swingRadiusYRad: 1.45, swingCenterXRad: 0.15, swingCenterYRad: 0,
    minTwistRad: -1.22, maxTwistRad: 1.48,
  },
  elbow: {
    jointId: "elbow", labelKo: "팔꿈치 관절",
    twistAxis: [0, 1, 0], swingAxisX: [1, 0, 0], swingAxisY: [0, 0, 1],
    swingRadiusXRad: 1.26, swingRadiusYRad: 0.09, swingCenterXRad: 1.24, swingCenterYRad: 0,
    minTwistRad: -1.4, maxTwistRad: 1.48,
  },
  wrist: {
    jointId: "wrist", labelKo: "손목 관절",
    twistAxis: [0, 1, 0], swingAxisX: [1, 0, 0], swingAxisY: [0, 0, 1],
    swingRadiusXRad: 1.22, swingRadiusYRad: 0.52, swingCenterXRad: 0, swingCenterYRad: 0,
    minTwistRad: -0.58, maxTwistRad: 0.58,
  },
  neck: {
    jointId: "neck", labelKo: "목 관절",
    twistAxis: [0, 1, 0], swingAxisX: [1, 0, 0], swingAxisY: [0, 0, 1],
    swingRadiusXRad: 0.95, swingRadiusYRad: 0.78, swingCenterXRad: 0.05, swingCenterYRad: 0,
    minTwistRad: -1.22, maxTwistRad: 1.22,
  },
  hip: {
    jointId: "hip", labelKo: "고관절",
    twistAxis: [0, 1, 0], swingAxisX: [1, 0, 0], swingAxisY: [0, 0, 1],
    swingRadiusXRad: 1.35, swingRadiusYRad: 0.78, swingCenterXRad: 0.45, swingCenterYRad: 0,
    minTwistRad: -0.7, maxTwistRad: 0.78,
  },
  knee: {
    jointId: "knee", labelKo: "무릎 관절",
    twistAxis: [0, 1, 0], swingAxisX: [1, 0, 0], swingAxisY: [0, 0, 1],
    swingRadiusXRad: 1.21, swingRadiusYRad: 0.08, swingCenterXRad: 1.19, swingCenterYRad: 0,
    minTwistRad: -0.35, maxTwistRad: 0.52,
  },
});

const EPSILON = 1e-9;

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function clampScalar(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function dot3(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalizeVec3(v: Vec3Tuple, fallback: Vec3Tuple): Vec3Tuple {
  const lenSq = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  if (!Number.isFinite(lenSq) || lenSq <= EPSILON * EPSILON) return fallback;
  const inv = 1 / Math.sqrt(lenSq);
  return [v[0] * inv, v[1] * inv, v[2] * inv];
}

function buildOrthonormalSwingBasis(
  rawTwist: Vec3Tuple,
  rawSwingX?: Vec3Tuple,
): { readonly twist: Vec3Tuple; readonly swingX: Vec3Tuple; readonly swingY: Vec3Tuple } {
  const twist = normalizeVec3(rawTwist, [0, 1, 0]);
  const ref: Vec3Tuple = rawSwingX ?? (Math.abs(twist[0]) < 0.85 ? [1, 0, 0] : [0, 0, 1]);
  const proj = dot3(ref, twist);
  const ortho: Vec3Tuple = [ref[0] - proj * twist[0], ref[1] - proj * twist[1], ref[2] - proj * twist[2]];
  const altRef: Vec3Tuple = Math.abs(twist[0]) < 0.85 ? [1, 0, 0] : [0, 0, 1];
  const altProj = dot3(altRef, twist);
  const altOrtho = normalizeVec3(
    [altRef[0] - altProj * twist[0], altRef[1] - altProj * twist[1], altRef[2] - altProj * twist[2]],
    [1, 0, 0],
  );
  const swingX = normalizeVec3(ortho, altOrtho);
  const swingY = normalizeVec3(cross3(twist, swingX), [0, 0, 1]);
  return { twist, swingX, swingY };
}

/** 임의 쿼터니언을 정규화하고 `qw >= 0` 반구로 정렬해 이중 피복 부호 반전을 막는다. */
export function normalizeCanonicalQuaternion(quat: QuatTuple): {
  readonly quat: QuatTuple; readonly antipodalCanonicalized: boolean;
} {
  const [qx, qy, qz, qw] = quat;
  const normSq = qx * qx + qy * qy + qz * qz + qw * qw;
  if (!Number.isFinite(normSq) || normSq <= EPSILON * EPSILON) {
    return { quat: [0, 0, 0, 1], antipodalCanonicalized: false };
  }
  const inv = 1 / Math.sqrt(normSq);
  return qw < 0
    ? { quat: [-qx * inv, -qy * inv, -qz * inv, -qw * inv], antipodalCanonicalized: true }
    : { quat: [qx * inv, qy * inv, qz * inv, qw * inv], antipodalCanonicalized: false };
}

/** 두 쿼터니언 `[qx, qy, qz, qw]`의 해밀턴 곱 `a ⊗ b`. */
export function multiplyQuaternions(a: QuatTuple, b: QuatTuple): QuatTuple {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** 쿼터니언으로 3차원 벡터 `v`를 회전시킨다 (`q v q*`). */
export function rotateVec3ByQuaternion(v: Vec3Tuple, q: QuatTuple): Vec3Tuple {
  const [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  return [
    v[0] + qw * tx + (qy * tz - qz * ty),
    v[1] + qw * ty + (qz * tx - qx * tz),
    v[2] + qw * tz + (qx * ty - qy * tx),
  ];
}

/** 로컬 회전을 해부학적 비틀림 축 기준 `q = q_swing ⊗ q_twist`로 분해한다. */
export function decomposeSwingTwist(
  quat: QuatTuple,
  twistAxis: Vec3Tuple,
  swingAxisX?: Vec3Tuple,
): SwingTwistDecomposition {
  const { quat: unitQ, antipodalCanonicalized } = normalizeCanonicalQuaternion(quat);
  const basis = buildOrthonormalSwingBasis(twistAxis, swingAxisX);
  const [qx, qy, qz, qw] = unitQ;
  const axialDot = qx * basis.twist[0] + qy * basis.twist[1] + qz * basis.twist[2];
  const px = axialDot * basis.twist[0];
  const py = axialDot * basis.twist[1];
  const pz = axialDot * basis.twist[2];
  const twistNorm = Math.hypot(px, py, pz, qw);

  let twistQuat: QuatTuple = [0, 0, 0, 1];
  let twistAngleRad = 0;
  if (twistNorm > EPSILON) {
    const invTwist = 1 / twistNorm;
    twistQuat = [px * invTwist, py * invTwist, pz * invTwist, qw * invTwist];
    twistAngleRad = 2 * Math.atan2(axialDot, qw);
  }

  const twistConj: QuatTuple = [-twistQuat[0], -twistQuat[1], -twistQuat[2], twistQuat[3]];
  const swingQuat = normalizeCanonicalQuaternion(multiplyQuaternions(unitQ, twistConj)).quat;
  const sVecNorm = Math.hypot(swingQuat[0], swingQuat[1], swingQuat[2]);

  let swingAngleXRad = 0;
  let swingAngleYRad = 0;
  let swingMagnitudeRad = 0;
  if (sVecNorm > EPSILON) {
    swingMagnitudeRad = 2 * Math.atan2(sVecNorm, swingQuat[3]);
    const scale = swingMagnitudeRad / sVecNorm;
    const rotVec: Vec3Tuple = [swingQuat[0] * scale, swingQuat[1] * scale, swingQuat[2] * scale];
    swingAngleXRad = dot3(rotVec, basis.swingX);
    swingAngleYRad = dot3(rotVec, basis.swingY);
  }

  return {
    swingQuat, twistQuat, swingAngleXRad, swingAngleYRad,
    swingMagnitudeRad, twistAngleRad, antipodalCanonicalized,
  };
}

function composeSwingTwist(
  swingAngleXRad: number,
  swingAngleYRad: number,
  twistAngleRad: number,
  basis: { readonly twist: Vec3Tuple; readonly swingX: Vec3Tuple; readonly swingY: Vec3Tuple },
): { readonly swingQuat: QuatTuple; readonly twistQuat: QuatTuple; readonly combined: QuatTuple } {
  const theta = Math.min(Math.PI, Math.hypot(swingAngleXRad, swingAngleYRad));
  let swingQuat: QuatTuple = [0, 0, 0, 1];
  if (theta > EPSILON) {
    const invTheta = 1 / theta;
    const ux = swingAngleXRad * invTheta;
    const uy = swingAngleYRad * invTheta;
    const sinH = Math.sin(theta * 0.5);
    swingQuat = [
      (ux * basis.swingX[0] + uy * basis.swingY[0]) * sinH,
      (ux * basis.swingX[1] + uy * basis.swingY[1]) * sinH,
      (ux * basis.swingX[2] + uy * basis.swingY[2]) * sinH,
      Math.cos(theta * 0.5),
    ];
  }
  const sinT = Math.sin(twistAngleRad * 0.5);
  const twistQuat: QuatTuple = [
    basis.twist[0] * sinT, basis.twist[1] * sinT, basis.twist[2] * sinT, Math.cos(twistAngleRad * 0.5),
  ];
  return {
    swingQuat, twistQuat,
    combined: normalizeCanonicalQuaternion(multiplyQuaternions(swingQuat, twistQuat)).quat,
  };
}

/** 단일 관절 로컬 쿼터니언을 타원 스윙 원뿔(`rx, ry`) 및 트위스트 한계 안으로 보정한다. */
export function guardJointPoseQuaternion(
  jointId: BiomechJointId,
  localQuat: QuatTuple,
  customLimit?: Partial<Omit<JointLimitSpec, "jointId">>,
): JointPoseGuardResult {
  const startMs = nowMs();
  const preset = ANATOMICAL_JOINT_LIMITS[jointId];
  const spec: JointLimitSpec = customLimit ? { ...preset, ...customLimit, jointId } : preset;

  const rx = Math.max(1e-4, Math.min(Math.PI, spec.swingRadiusXRad));
  const ry = Math.max(1e-4, Math.min(Math.PI, spec.swingRadiusYRad));
  const cx = spec.swingCenterXRad ?? 0;
  const cy = spec.swingCenterYRad ?? 0;
  const minTwist = Math.min(spec.minTwistRad, spec.maxTwistRad);
  const maxTwist = Math.max(spec.minTwistRad, spec.maxTwistRad);

  const basis = buildOrthonormalSwingBasis(spec.twistAxis, spec.swingAxisX);
  const dec = decomposeSwingTwist(localQuat, basis.twist, basis.swingX);

  const dx = dec.swingAngleXRad - cx;
  const dy = dec.swingAngleYRad - cy;
  const ellipseNorm = Math.hypot(dx / rx, dy / ry);
  const swingClamped = ellipseNorm > 1 + 1e-7;
  const clampedSwingX = swingClamped ? cx + dx / ellipseNorm : dec.swingAngleXRad;
  const clampedSwingY = swingClamped ? cy + dy / ellipseNorm : dec.swingAngleYRad;

  const twistClamped = dec.twistAngleRad < minTwist - 1e-7 || dec.twistAngleRad > maxTwist + 1e-7;
  const clampedTwist = twistClamped ? clampScalar(dec.twistAngleRad, minTwist, maxTwist) : dec.twistAngleRad;

  const out = swingClamped || twistClamped
    ? composeSwingTwist(clampedSwingX, clampedSwingY, clampedTwist, basis)
    : {
        swingQuat: dec.swingQuat,
        twistQuat: dec.twistQuat,
        combined: normalizeCanonicalQuaternion(localQuat).quat,
      };

  return {
    jointId, labelKo: spec.labelKo, inputQuat: localQuat, guardedQuat: out.combined,
    swingQuat: out.swingQuat, twistQuat: out.twistQuat,
    rawSwingAngleXRad: dec.swingAngleXRad, rawSwingAngleYRad: dec.swingAngleYRad, rawTwistAngleRad: dec.twistAngleRad,
    clampedSwingAngleXRad: clampedSwingX, clampedSwingAngleYRad: clampedSwingY, clampedTwistAngleRad: clampedTwist,
    swingClamped, twistClamped, antipodalCanonicalized: dec.antipodalCanonicalized,
    elapsedMs: Math.max(0, nowMs() - startMs), serverCostKrw: 0,
  };
}

/** 스켈레톤 관절 배열 전체의 회전을 한 번에 검증·클램프한다. */
export function guardSkeletonPoseBatch(joints: readonly SkeletonJointPoseInput[]): SkeletonPoseBatchResult {
  const startMs = nowMs();
  let clampedBoneCount = 0;
  const results = joints.map((item) => {
    const res = guardJointPoseQuaternion(item.jointId, item.localQuat, item.customLimit);
    if (res.swingClamped || res.twistClamped) clampedBoneCount += 1;
    return { ...res, boneName: item.boneName };
  });
  return { results, clampedBoneCount, totalElapsedMs: Math.max(0, nowMs() - startMs), serverCostKrw: 0 };
}

// ============================================================================
// 2. 결정론적 RANSAC 1·2·3점 투시 소실점 · 지평선 · 가이드 스냅 추정기
// ============================================================================

export type PerspectiveModeKind = "1-point" | "2-point" | "3-point" | "insufficient";

export interface SketchLineSegment {
  readonly id?: string;
  readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number;
  readonly weight?: number;
}

export interface PerspectiveEstimateOptions {
  readonly canvasWidth: number; readonly canvasHeight: number;
  readonly minSegmentLengthPx?: number; readonly inlierAngleDeg?: number; readonly snapAngleDeg?: number;
  readonly minInliersPerVp?: number; readonly maxVanishingPoints?: 1 | 2 | 3;
  readonly maxRansacIterations?: number; readonly randomSeed?: number;
}

export interface EstimatedVanishingPoint {
  readonly vpIndex: number; readonly homogeneous: Vec3Tuple; readonly isFinite: boolean;
  readonly positionPx: Vec2Tuple | null; readonly direction2d: Vec2Tuple;
  readonly role: "horizon" | "vertical";
  readonly inlierSegmentIndices: readonly number[]; readonly inlierCount: number;
  readonly meanAngularResidualDeg: number;
}

export interface HorizonLineModel {
  readonly normalA: number; readonly normalB: number; readonly offsetC: number;
  readonly tiltAngleDeg: number; readonly yAtCanvasCenterPx: number;
  readonly guideSegmentPx: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };
}

export interface SnappedPerspectiveRulerSegment {
  readonly segmentIndex: number; readonly id?: string; readonly assignedVpIndex: number | null;
  readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number;
  readonly snapped: boolean; readonly residualBeforeDeg: number; readonly residualAfterDeg: number;
}

export interface PerspectiveEstimationReport {
  readonly mode: PerspectiveModeKind;
  readonly vanishingPoints: readonly EstimatedVanishingPoint[];
  readonly finiteVanishingPointCount: number;
  readonly horizonLine: HorizonLineModel | null;
  readonly snappedRulers: readonly SnappedPerspectiveRulerSegment[];
  readonly validSegmentCount: number; readonly elapsedMs: number;
  readonly aiTokensUsed: 0; readonly serverCostKrw: 0;
}

interface PreparedSegment {
  readonly originalIndex: number; readonly id?: string;
  readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number;
  readonly midX: number; readonly midY: number; readonly normMid: Vec3Tuple;
  readonly dirX: number; readonly dirY: number; readonly lengthPx: number; readonly weight: number;
  readonly homogeneousLine: Vec3Tuple;
}

function nextXorShift32(state: number): number {
  let x = state | 0;
  if (x === 0) x = 0x6d2b79f5;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

function normalizeHomogeneous3(v: Vec3Tuple): Vec3Tuple | null {
  const norm = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(norm) || norm <= EPSILON) return null;
  const neg =
    v[2] < -EPSILON ||
    (Math.abs(v[2]) <= EPSILON && (v[0] < -EPSILON || (Math.abs(v[0]) <= EPSILON && v[1] < 0)));
  const inv = (neg ? -1 : 1) / norm;
  return [v[0] * inv, v[1] * inv, v[2] * inv];
}

function computeSegmentVpAngularResidualRad(seg: PreparedSegment, vp: Vec3Tuple): number {
  const rayLine = cross3(seg.normMid, vp);
  const rayNorm = Math.hypot(rayLine[0], rayLine[1]);
  if (rayNorm <= EPSILON) return 0;
  const cosTheta = Math.min(1, Math.abs((seg.dirX * -rayLine[1] + seg.dirY * rayLine[0]) / rayNorm));
  return Math.acos(cosTheta);
}

function refineVanishingPointLeastSquares(
  segments: readonly PreparedSegment[],
  inlierIndices: readonly number[],
  fallbackVp: Vec3Tuple,
): Vec3Tuple {
  if (inlierIndices.length < 2) return fallbackVp;
  let m00 = 0, m01 = 0, m02 = 0, m11 = 0, m12 = 0, m22 = 0;
  for (const idx of inlierIndices) {
    const seg = segments[idx];
    if (!seg) continue;
    const [lx, ly, lz] = seg.homogeneousLine;
    const w = seg.weight;
    m00 += w * lx * lx; m01 += w * lx * ly; m02 += w * lx * lz;
    m11 += w * ly * ly; m12 += w * ly * lz; m22 += w * lz * lz;
  }

  const a = [[m00, m01, m02], [m01, m11, m12], [m02, m12, m22]];
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const pairs: readonly (readonly [number, number])[] = [[0, 1], [0, 2], [1, 2]];

  for (let sweep = 0; sweep < 12; sweep += 1) {
    for (const [p, q] of pairs) {
      const apq = a[p]![q]!;
      if (Math.abs(apq) <= 1e-14) continue;
      const app = a[p]![p]!;
      const aqq = a[q]![q]!;
      const tau = (aqq - app) / (2 * apq);
      const t = tau >= 0 ? 1 / (tau + Math.hypot(1, tau)) : -1 / (-tau + Math.hypot(1, tau));
      const c = 1 / Math.hypot(1, t);
      const s = t * c;
      a[p]![p] = app - t * apq;
      a[q]![q] = aqq + t * apq;
      a[p]![q] = 0;
      a[q]![p] = 0;
      const r = 3 - p - q;
      const apr = a[p]![r]!;
      const aqr = a[q]![r]!;
      a[p]![r] = c * apr - s * aqr; a[r]![p] = a[p]![r]!;
      a[q]![r] = s * apr + c * aqr; a[r]![q] = a[q]![r]!;
      for (let row = 0; row < 3; row += 1) {
        const vpr = v[row]![p]!;
        const vqr = v[row]![q]!;
        v[row]![p] = c * vpr - s * vqr;
        v[row]![q] = s * vpr + c * vqr;
      }
    }
  }

  let minCol = a[1]![1]! < a[0]![0]! ? 1 : 0;
  if (a[2]![2]! < a[minCol]![minCol]!) minCol = 2;
  return normalizeHomogeneous3([v[0]![minCol]!, v[1]![minCol]!, v[2]![minCol]!]) ?? fallbackVp;
}

function buildHorizonFromLine(
  normalX: number, normalY: number, pointX: number, pointY: number,
  canvasWidth: number, canvasHeight: number,
): HorizonLineModel {
  const norm = Math.hypot(normalX, normalY);
  let a = norm > EPSILON ? normalX / norm : 0;
  let b = norm > EPSILON ? normalY / norm : 1;
  if (b < 0 || (Math.abs(b) <= EPSILON && a < 0)) { a = -a; b = -b; }
  const c = -(a * pointX + b * pointY);
  const centerX = canvasWidth * 0.5;
  const yAtCenter = Math.abs(b) > 1e-6 ? -(a * centerX + c) / b : canvasHeight * 0.5;
  const yLeft = Math.abs(b) > 1e-6 ? -c / b : yAtCenter;
  const yRight = Math.abs(b) > 1e-6 ? -(a * canvasWidth + c) / b : yAtCenter;
  return {
    normalA: a, normalB: b, offsetC: c,
    tiltAngleDeg: (Math.atan2(-a, b) * 180) / Math.PI,
    yAtCanvasCenterPx: yAtCenter,
    guideSegmentPx: { x1: 0, y1: yLeft, x2: canvasWidth, y2: yRight },
  };
}

/**
 * 거친 스케치 선분들로부터 결정론적 RANSAC으로 1·2·3점 투시 소실점과 지평선을 추출하고
 * 각 선분을 소실점 방사선에 정확히 정렬한 투시 자(Ruler) 가이드를 반환한다.
 */
export function estimatePerspectiveVanishingPointsRansac(
  segments: readonly SketchLineSegment[],
  options: PerspectiveEstimateOptions,
): PerspectiveEstimationReport {
  const startMs = nowMs();
  const canvasWidth = Math.max(1, options.canvasWidth);
  const canvasHeight = Math.max(1, options.canvasHeight);
  const cx = canvasWidth * 0.5;
  const cy = canvasHeight * 0.5;
  const scale = Math.max(canvasWidth, canvasHeight) * 0.5;

  const minLen = options.minSegmentLengthPx ?? 12;
  const inlierAngleRad = ((options.inlierAngleDeg ?? 3.5) * Math.PI) / 180;
  const snapAngleRad = ((options.snapAngleDeg ?? 8.0) * Math.PI) / 180;
  const minInliers = Math.max(2, options.minInliersPerVp ?? 3);
  const maxVps = options.maxVanishingPoints ?? 3;
  const maxIterations = Math.max(16, options.maxRansacIterations ?? 256);

  const prepared: PreparedSegment[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i]!;
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy);
    if (!Number.isFinite(len) || len < minLen) continue;
    const rawLine = cross3([(s.x1 - cx) / scale, (s.y1 - cy) / scale, 1], [(s.x2 - cx) / scale, (s.y2 - cy) / scale, 1]);
    const lineNorm = Math.hypot(rawLine[0], rawLine[1]);
    if (lineNorm <= EPSILON) continue;
    const midX = (s.x1 + s.x2) * 0.5;
    const midY = (s.y1 + s.y2) * 0.5;
    const userWeight = s.weight !== undefined && s.weight > 0 ? s.weight : 1;
    prepared.push({
      originalIndex: i, id: s.id, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, midX, midY,
      normMid: [(midX - cx) / scale, (midY - cy) / scale, 1],
      dirX: dx / len, dirY: dy / len, lengthPx: len,
      weight: userWeight * Math.log2(2 + len / minLen),
      homogeneousLine: [rawLine[0] / lineNorm, rawLine[1] / lineNorm, rawLine[2] / lineNorm],
    });
  }

  const unassigned = new Set<number>(prepared.map((_, idx) => idx));
  const rawModels: { vp: Vec3Tuple; inliers: number[]; meanResidualDeg: number }[] = [];
  let rngState = (options.randomSeed ?? 0x51f2_7a3d) >>> 0;

  for (let pass = 0; pass < maxVps; pass += 1) {
    const pool = [...unassigned];
    if (pool.length < minInliers) break;

    const totalPairs = (pool.length * (pool.length - 1)) / 2;
    const candidatePairs: (readonly [number, number])[] = [];
    if (totalPairs <= maxIterations) {
      for (let a = 0; a < pool.length; a += 1) {
        for (let b = a + 1; b < pool.length; b += 1) candidatePairs.push([pool[a]!, pool[b]!]);
      }
    } else {
      for (let iter = 0; iter < maxIterations; iter += 1) {
        rngState = nextXorShift32(rngState);
        const ia = rngState % pool.length;
        rngState = nextXorShift32(rngState);
        let ib = rngState % (pool.length - 1);
        if (ib >= ia) ib += 1;
        candidatePairs.push([pool[ia]!, pool[ib]!]);
      }
    }

    let bestScore = -1;
    let bestVp: Vec3Tuple | null = null;
    let bestInliers: number[] = [];

    for (const [idxA, idxB] of candidatePairs) {
      const candVp = normalizeHomogeneous3(cross3(prepared[idxA]!.homogeneousLine, prepared[idxB]!.homogeneousLine));
      if (!candVp) continue;
      let score = 0;
      const inliers: number[] = [];
      for (const k of pool) {
        const segK = prepared[k]!;
        const angleRad = computeSegmentVpAngularResidualRad(segK, candVp);
        if (angleRad <= inlierAngleRad) {
          const ratio = angleRad / inlierAngleRad;
          score += segK.weight * (1 - ratio * ratio);
          inliers.push(k);
        }
      }
      if (inliers.length >= minInliers && score > bestScore) {
        bestScore = score; bestVp = candVp; bestInliers = inliers;
      }
    }

    if (!bestVp || bestInliers.length < minInliers) break;

    const refinedVp = refineVanishingPointLeastSquares(prepared, bestInliers, bestVp);
    const refinedInliers: number[] = [];
    let residualSumRad = 0;
    for (const k of pool) {
      const angleRad = computeSegmentVpAngularResidualRad(prepared[k]!, refinedVp);
      if (angleRad <= inlierAngleRad) {
        refinedInliers.push(k);
        residualSumRad += angleRad;
      }
    }
    const useRefined = refinedInliers.length >= minInliers;
    const finalInliers = useRefined ? refinedInliers : bestInliers;
    const finalVp = useRefined ? refinedVp : bestVp;
    if (!useRefined) {
      residualSumRad = 0;
      for (const k of finalInliers) residualSumRad += computeSegmentVpAngularResidualRad(prepared[k]!, finalVp);
    }
    for (const k of finalInliers) unassigned.delete(k);
    rawModels.push({
      vp: finalVp, inliers: finalInliers,
      meanResidualDeg: ((residualSumRad / finalInliers.length) * 180) / Math.PI,
    });
  }

  const finiteThresholdVz = 1 / 30;
  const interimVps = rawModels.map((model, idx) => {
    const [vx, vy, vz] = model.vp;
    const isFinite = Math.abs(vz) >= finiteThresholdVz;
    const posPx: Vec2Tuple | null = isFinite ? [cx + scale * (vx / vz), cy + scale * (vy / vz)] : null;
    let dirX = 1, dirY = 0;
    if (!isFinite) {
      const n2 = Math.hypot(vx, vy);
      if (n2 > EPSILON) { dirX = vx / n2; dirY = vy / n2; }
    } else if (posPx) {
      const dxC = posPx[0] - cx, dyC = posPx[1] - cy;
      const nC = Math.hypot(dxC, dyC);
      if (nC > EPSILON) { dirX = dxC / nC; dirY = dyC / nC; }
    }
    return {
      vpIndex: idx, homogeneous: model.vp, isFinite, positionPx: posPx,
      direction2d: [dirX, dirY] as Vec2Tuple,
      inlierPreparedIndices: model.inliers,
      inlierSegmentIndices: model.inliers.map((k) => prepared[k]!.originalIndex),
      inlierCount: model.inliers.length, meanAngularResidualDeg: model.meanResidualDeg,
    };
  });

  const finiteVps = interimVps.filter((item) => item.isFinite && item.positionPx !== null);
  let verticalVpIndex = -1;
  if (finiteVps.length >= 3) {
    let maxAbsDy = -1;
    for (const fvp of finiteVps) {
      const dy = Math.abs(fvp.positionPx![1] - cy);
      if (dy > maxAbsDy) { maxAbsDy = dy; verticalVpIndex = fvp.vpIndex; }
    }
  } else {
    const vertInf = interimVps.find((ivp) => !ivp.isFinite && Math.abs(ivp.direction2d[1]) >= 0.85);
    if (vertInf) verticalVpIndex = vertInf.vpIndex;
  }

  const vanishingPoints: EstimatedVanishingPoint[] = interimVps.map((item) => ({
    vpIndex: item.vpIndex, homogeneous: item.homogeneous, isFinite: item.isFinite,
    positionPx: item.positionPx, direction2d: item.direction2d,
    role: item.vpIndex === verticalVpIndex ? "vertical" : "horizon",
    inlierSegmentIndices: item.inlierSegmentIndices, inlierCount: item.inlierCount,
    meanAngularResidualDeg: item.meanAngularResidualDeg,
  }));

  const horizonFiniteVps = vanishingPoints.filter((vp) => vp.isFinite && vp.positionPx !== null && vp.role === "horizon");
  let mode: PerspectiveModeKind = "insufficient";
  if (finiteVps.length >= 3) mode = "3-point";
  else if (finiteVps.length === 2) mode = "2-point";
  else if (vanishingPoints.length >= 1) mode = "1-point";

  let horizonLine: HorizonLineModel | null = null;
  const pairSource = horizonFiniteVps.length >= 2 ? horizonFiniteVps : finiteVps;
  if (pairSource.length >= 2) {
    const pA = pairSource[0]!.positionPx!;
    const pB = pairSource[1]!.positionPx!;
    horizonLine = buildHorizonFromLine(-(pB[1] - pA[1]), pB[0] - pA[0], pA[0], pA[1], canvasWidth, canvasHeight);
  } else if (finiteVps.length === 1) {
    const pOnly = finiteVps[0]!.positionPx!;
    const horizInf = vanishingPoints.find((vp) => !vp.isFinite && Math.abs(vp.direction2d[0]) >= 0.85);
    const nx = horizInf ? -horizInf.direction2d[1] : 0;
    const ny = horizInf ? horizInf.direction2d[0] : 1;
    horizonLine = buildHorizonFromLine(nx, ny, pOnly[0], pOnly[1], canvasWidth, canvasHeight);
  }

  const assignedMap = new Map<number, number>();
  for (let mIdx = 0; mIdx < interimVps.length; mIdx += 1) {
    for (const pIdx of interimVps[mIdx]!.inlierPreparedIndices) assignedMap.set(pIdx, mIdx);
  }

  const snappedRulers: SnappedPerspectiveRulerSegment[] = prepared.map((seg, pIdx) => {
    let targetVpIdx = assignedMap.get(pIdx) ?? null;
    let bestAngleRad = Infinity;
    if (targetVpIdx !== null) {
      bestAngleRad = computeSegmentVpAngularResidualRad(seg, vanishingPoints[targetVpIdx]!.homogeneous);
    } else {
      for (const vp of vanishingPoints) {
        const ang = computeSegmentVpAngularResidualRad(seg, vp.homogeneous);
        if (ang <= snapAngleRad && ang < bestAngleRad) { bestAngleRad = ang; targetVpIdx = vp.vpIndex; }
      }
    }
    if (targetVpIdx === null) {
      return {
        segmentIndex: seg.originalIndex, id: seg.id, assignedVpIndex: null,
        x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2,
        snapped: false, residualBeforeDeg: 0, residualAfterDeg: 0,
      };
    }

    const targetVp = vanishingPoints[targetVpIdx]!;
    const rayLine = cross3(seg.normMid, targetVp.homogeneous);
    const rayNorm = Math.hypot(rayLine[0], rayLine[1]);
    if (rayNorm <= EPSILON) {
      return {
        segmentIndex: seg.originalIndex, id: seg.id, assignedVpIndex: targetVpIdx,
        x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2,
        snapped: true, residualBeforeDeg: 0, residualAfterDeg: 0,
      };
    }
    let snapDirX = -rayLine[1] / rayNorm;
    let snapDirY = rayLine[0] / rayNorm;
    if (snapDirX * seg.dirX + snapDirY * seg.dirY < 0) { snapDirX = -snapDirX; snapDirY = -snapDirY; }
    const halfLen = seg.lengthPx * 0.5;
    const nx1 = seg.midX - snapDirX * halfLen, ny1 = seg.midY - snapDirY * halfLen;
    const nx2 = seg.midX + snapDirX * halfLen, ny2 = seg.midY + snapDirY * halfLen;
    const afterRad = computeSegmentVpAngularResidualRad(
      { ...seg, x1: nx1, y1: ny1, x2: nx2, y2: ny2, dirX: snapDirX, dirY: snapDirY },
      targetVp.homogeneous,
    );
    return {
      segmentIndex: seg.originalIndex, id: seg.id, assignedVpIndex: targetVpIdx,
      x1: nx1, y1: ny1, x2: nx2, y2: ny2, snapped: true,
      residualBeforeDeg: (bestAngleRad * 180) / Math.PI,
      residualAfterDeg: (afterRad * 180) / Math.PI,
    };
  });

  return {
    mode, vanishingPoints, finiteVanishingPointCount: finiteVps.length, horizonLine, snappedRulers,
    validSegmentCount: prepared.length, elapsedMs: Math.max(0, nowMs() - startMs),
    aiTokensUsed: 0, serverCostKrw: 0,
  };
}
