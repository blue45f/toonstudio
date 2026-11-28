/**
 * Wave 135 — 3점 투시 사영기하 공통 타입 및 고정밀 수학 프리미티브.
 *
 * - `atan2(|cross|, |dot|)` 기반 선분→소실점 각도 오차 계산으로 `acos(1 - eps)`의
 *   제곱근 정밀도 손실 없이 `< 1e-13°` 수준 정확도를 유지한다.
 */

export type PerspectiveAxisId = "VP1" | "VP2" | "VP3";
export type PerspectiveMode = "1-point" | "2-point" | "3-point";
export type PerspectiveDistortionSeverity = "SAFE" | "WARN" | "CRITICAL";

export interface Vec2D {
  readonly x: number;
  readonly y: number;
}

export interface Vec3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type HomogeneousVec3 = readonly [number, number, number];
export type Matrix3x3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface LineEquation2D {
  /** 정규화된 직선 계수 (`a*x + b*y + c = 0`, `hypot(a, b) === 1`). */
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly isAtInfinity: boolean;
  /** 지평선 기울기(도). 수평이면 0°, 시계 방향 기울어짐이 양수. */
  readonly tiltDeg: number;
  /** 캔버스 중심 X에서의 지평선 Y 좌표(무한 지평선이면 null). */
  readonly yAtCenterX: number | null;
}

export interface VanishingPoint2D {
  readonly id: PerspectiveAxisId;
  readonly worldAxis: "X" | "Y" | "Z";
  readonly x: number;
  readonly y: number;
  readonly isFinite: boolean;
  /** 무한 소실점일 때 평행선 진행 단위 벡터, 유한 소실점일 때 주점→소실점 단위 벡터. */
  readonly direction2d: Vec2D;
  /** 동차 좌표 `[u, v, w]` (`isFinite`이면 `w === 1`, 무한 소실점이면 `w === 0`). */
  readonly homogeneous: HomogeneousVec3;
  /** 주점으로부터의 픽셀 거리(무한 소실점이면 `Number.POSITIVE_INFINITY`). */
  readonly distanceFromPrincipalPx: number;
}

export interface ThreePointPerspectiveRigInput {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** 35mm 풀프레임 환산 초점거리(mm). 기본값 35mm. */
  readonly focalLengthMm?: number;
  /** 35mm 센서 가로 폭(mm). 기본값 36mm. */
  readonly sensorWidthMm?: number;
  /** 좌우 회전각(도). */
  readonly yawDeg: number;
  /** 상하 앙각/부감(도). 양수=올려다보기(천정 VP3), 음수=내려다보기(지하 VP3), 0°=2점 투시. */
  readonly pitchDeg: number;
  /** 카메라 롤(더치 앵글, 도). 기본값 0°. */
  readonly rollDeg?: number;
  /** 주점(Principal Point) 오프셋(px). 기본값 (0, 0) = 캔버스 정중앙. */
  readonly principalPointOffsetPx?: Vec2D;
}

export interface OrthocenterPrincipalPointCheck {
  readonly applicable: boolean;
  readonly isAcuteTriangle: boolean;
  readonly orthocenter: Vec2D | null;
  readonly principalPoint: Vec2D;
  readonly errorPx: number;
  readonly impliedFocalLengthPx: number | null;
  readonly focalLengthMismatchPx: number | null;
  readonly valid: boolean;
  readonly reasonKo: string;
}

export interface PerspectiveDistortionAlert {
  readonly code:
    | "EXTREME_WIDE_ANGLE"
    | "CLOSE_HORIZONTAL_VPS"
    | "VP_INSIDE_CANVAS"
    | "EXTREME_PITCH"
    | "STEEP_ROLL"
    | "NON_ORTHOGONAL_VP_TRIANGLE";
  readonly severity: PerspectiveDistortionSeverity;
  readonly messageKo: string;
  readonly measuredValue: number;
  readonly thresholdValue: number;
}

export interface ThreePointPerspectiveRig {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly focalLengthMm: number;
  readonly sensorWidthMm: number;
  readonly focalLengthPx: number;
  readonly horizontalFovDeg: number;
  readonly verticalFovDeg: number;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly rollDeg: number;
  readonly principalPoint: Vec2D;
  /** 월드→카메라 3×3 직교 회전 행렬 (행 우선). */
  readonly worldToCameraRotation: Matrix3x3;
  readonly mode: PerspectiveMode;
  readonly vp1: VanishingPoint2D;
  readonly vp2: VanishingPoint2D;
  readonly vp3: VanishingPoint2D;
  readonly horizonLine: LineEquation2D;
  readonly orthocenterCheck: OrthocenterPrincipalPointCheck;
  readonly distortionSeverity: PerspectiveDistortionSeverity;
  readonly distortionAlerts: readonly PerspectiveDistortionAlert[];
}

export interface GuideSegment2D {
  readonly id?: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly axisHint?: PerspectiveAxisId | "auto";
  readonly weight?: number;
}

export interface EstimateVanishingPointsOptions {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly principalPoint?: Vec2D;
  readonly perspectiveMode?: PerspectiveMode | "auto";
  /** 인라이어 판정 최대 각도 오차(도). 기본값 2.5°. */
  readonly inlierAngleThresholdDeg?: number;
  /** IRLS 가중 최소제곱 반복 횟수. 기본값 8. */
  readonly maxIrlsIterations?: number;
}

export interface EstimatedVanishingPointCluster {
  readonly id: PerspectiveAxisId;
  readonly vanishingPoint: VanishingPoint2D;
  readonly inlierSegmentIds: readonly string[];
  readonly inlierCount: number;
  readonly meanAngleErrorDeg: number;
  readonly maxInlierAngleErrorDeg: number;
}

export interface VanishingPointEstimationResult {
  readonly detectedMode: PerspectiveMode;
  readonly clusters: readonly EstimatedVanishingPointCluster[];
  readonly vp1: VanishingPoint2D | null;
  readonly vp2: VanishingPoint2D | null;
  readonly vp3: VanishingPoint2D | null;
  readonly horizonLine: LineEquation2D | null;
  readonly orthocenterCheck: OrthocenterPrincipalPointCheck | null;
  readonly totalValidSegments: number;
  readonly totalInlierCount: number;
  readonly inlierRatio: number;
  readonly outlierSegmentIds: readonly string[];
  readonly overallMeanInlierAngleErrorDeg: number;
}

export const PERSPECTIVE_DEG_TO_RAD = Math.PI / 180;
export const PERSPECTIVE_RAD_TO_DEG = 180 / Math.PI;

export function clampFinitePerspective(
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function normalizeVec2(x: number, y: number): Vec2D {
  const len = Math.hypot(x, y);
  if (!Number.isFinite(len) || len < 1e-12) {
    return { x: 1, y: 0 };
  }
  return { x: x / len, y: y / len };
}

export function mulMat3(a: Matrix3x3, b: Matrix3x3): Matrix3x3 {
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

/**
 * 선분 중점에서 동차 소실점으로 향하는 광선과 선분 방향 사이의 각도 오차(0°..90°)를 계산한다.
 * `atan2(|cross|, |dot|)`을 사용해 0° 부근 부동소수점 정밀도를 `< 1e-13°`로 유지한다.
 */
export function computeSegmentToVpAngleErrorDeg(
  seg: Pick<GuideSegment2D, "x1" | "y1" | "x2" | "y2">,
  vpHomogeneous: HomogeneousVec3,
): number {
  const vx = seg.x2 - seg.x1;
  const vy = seg.y2 - seg.y1;
  const len = Math.hypot(vx, vy);
  if (!Number.isFinite(len) || len < 1e-9) return 0;
  const dx = vx / len;
  const dy = vy / len;
  const mx = (seg.x1 + seg.x2) * 0.5;
  const my = (seg.y1 + seg.y2) * 0.5;

  let rx: number;
  let ry: number;
  if (Math.abs(vpHomogeneous[2]) > 1e-9) {
    rx = vpHomogeneous[0] / vpHomogeneous[2] - mx;
    ry = vpHomogeneous[1] / vpHomogeneous[2] - my;
  } else {
    rx = vpHomogeneous[0];
    ry = vpHomogeneous[1];
  }
  const rLen = Math.hypot(rx, ry);
  if (!Number.isFinite(rLen) || rLen < 1e-9) return 0;
  const urx = rx / rLen;
  const ury = ry / rLen;
  const sinTheta = Math.abs(dx * ury - dy * urx);
  const cosTheta = Math.abs(dx * urx + dy * ury);
  return Math.atan2(sinTheta, cosTheta) * PERSPECTIVE_RAD_TO_DEG;
}

/** 두 무향 단위 벡터 사이의 끼인각(0°..90°)을 고정밀 `atan2`로 계산한다. */
export function angleBetweenUndirectedUnitVectorsDeg(a: Vec2D, b: Vec2D): number {
  const sinTheta = Math.abs(a.x * b.y - a.y * b.x);
  const cosTheta = Math.abs(a.x * b.x + a.y * b.y);
  return Math.atan2(sinTheta, cosTheta) * PERSPECTIVE_RAD_TO_DEG;
}

export function buildLineFromCoefficients(
  rawA: number,
  rawB: number,
  rawC: number,
  centerX: number,
): LineEquation2D {
  const norm = Math.hypot(rawA, rawB);
  if (!Number.isFinite(norm) || norm < 1e-10) {
    return { a: 0, b: 0, c: 1, isAtInfinity: true, tiltDeg: 0, yAtCenterX: null };
  }
  let a = rawA / norm;
  let b = rawB / norm;
  let c = rawC / norm;
  if (b < -1e-12 || (Math.abs(b) <= 1e-12 && a < 0)) {
    a = -a;
    b = -b;
    c = -c;
  }
  const tiltDeg = Math.atan2(-a, b) * PERSPECTIVE_RAD_TO_DEG;
  const yAtCenterX = Math.abs(b) > 1e-9 ? -(a * centerX + c) / b : null;
  return { a, b, c, isAtInfinity: false, tiltDeg, yAtCenterX };
}

/** 두 동차 소실점을 잇는 지평선(Horizon Line) 방정식을 계산한다. */
export function buildLineThroughHomogeneousPoints(
  p1: HomogeneousVec3,
  p2: HomogeneousVec3,
  centerX: number,
): LineEquation2D {
  const a = p1[1] * p2[2] - p1[2] * p2[1];
  const b = p1[2] * p2[0] - p1[0] * p2[2];
  const c = p1[0] * p2[1] - p1[1] * p2[0];
  return buildLineFromCoefficients(a, b, c, centerX);
}

/** 대칭 3×3 행렬의 최소 고유값에 해당하는 단위 고유벡터를 자코비 회전으로 계산한다. */
export function smallestEigenvectorSymmetric3x3(mat: readonly number[]): HomogeneousVec3 {
  const a = [mat[0], mat[1], mat[2], mat[3], mat[4], mat[5], mat[6], mat[7], mat[8]];
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const pairs: readonly (readonly [number, number])[] = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];

  for (let sweep = 0; sweep < 24; sweep += 1) {
    let maxOff = 0;
    let p = 0;
    let q = 1;
    for (let k = 0; k < pairs.length; k += 1) {
      const i = pairs[k][0];
      const j = pairs[k][1];
      const val = Math.abs(a[i * 3 + j]);
      if (val > maxOff) {
        maxOff = val;
        p = i;
        q = j;
      }
    }
    if (maxOff < 1e-14) break;
    const app = a[p * 3 + p];
    const aqq = a[q * 3 + q];
    const apq = a[p * 3 + q];
    const tau = (aqq - app) / (2 * apq);
    const t =
      tau >= 0 ? 1 / (tau + Math.sqrt(1 + tau * tau)) : -1 / (-tau + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    a[p * 3 + p] = app - t * apq;
    a[q * 3 + q] = aqq + t * apq;
    a[p * 3 + q] = 0;
    a[q * 3 + p] = 0;
    for (let r = 0; r < 3; r += 1) {
      if (r !== p && r !== q) {
        const arp = a[r * 3 + p];
        const arq = a[r * 3 + q];
        a[r * 3 + p] = c * arp - s * arq;
        a[p * 3 + r] = a[r * 3 + p];
        a[r * 3 + q] = s * arp + c * arq;
        a[q * 3 + r] = a[r * 3 + q];
      }
      const vrp = v[r * 3 + p];
      const vrq = v[r * 3 + q];
      v[r * 3 + p] = c * vrp - s * vrq;
      v[r * 3 + q] = s * vrp + c * vrq;
    }
  }

  let minIdx = 0;
  let minVal = a[0];
  if (a[4] < minVal) {
    minVal = a[4];
    minIdx = 1;
  }
  if (a[8] < minVal) minIdx = 2;
  const ex = v[minIdx];
  const ey = v[3 + minIdx];
  const ez = v[6 + minIdx];
  const norm = Math.hypot(ex, ey, ez);
  if (!Number.isFinite(norm) || norm < 1e-12) return [1, 0, 0];
  return [ex / norm, ey / norm, ez / norm];
}

export function homogeneousToVanishingPoint(
  id: PerspectiveAxisId,
  worldAxis: "X" | "Y" | "Z",
  h: HomogeneousVec3,
  principalPoint: Vec2D,
): VanishingPoint2D {
  if (Math.abs(h[2]) < 1e-8) {
    const dir = normalizeVec2(h[0], h[1]);
    return {
      id,
      worldAxis,
      x: principalPoint.x + dir.x * 1e9,
      y: principalPoint.y + dir.y * 1e9,
      isFinite: false,
      direction2d: dir,
      homogeneous: [dir.x, dir.y, 0],
      distanceFromPrincipalPx: Number.POSITIVE_INFINITY,
    };
  }
  const x = h[0] / h[2];
  const y = h[1] / h[2];
  const dx = x - principalPoint.x;
  const dy = y - principalPoint.y;
  const dist = Math.hypot(dx, dy);
  return {
    id,
    worldAxis,
    x,
    y,
    isFinite: true,
    direction2d: dist > 1e-9 ? { x: dx / dist, y: dy / dist } : { x: 1, y: 0 },
    homogeneous: [x, y, 1],
    distanceFromPrincipalPx: dist,
  };
}
