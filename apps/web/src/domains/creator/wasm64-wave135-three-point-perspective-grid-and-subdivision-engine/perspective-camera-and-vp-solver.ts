/**
 * Wave 135 — 사영기하 3점 투시 핀홀 카메라 모델, 수심=주점 검증, 왜곡 경보 및
 * 가이드 선분 소실점 역추정 파사드.
 */

import {
  PERSPECTIVE_DEG_TO_RAD,
  PERSPECTIVE_RAD_TO_DEG,
  buildLineFromCoefficients,
  buildLineThroughHomogeneousPoints,
  clampFinitePerspective,
  computeSegmentToVpAngleErrorDeg,
  mulMat3,
  normalizeVec2,
  type EstimateVanishingPointsOptions,
  type EstimatedVanishingPointCluster,
  type GuideSegment2D,
  type HomogeneousVec3,
  type LineEquation2D,
  type Matrix3x3,
  type OrthocenterPrincipalPointCheck,
  type PerspectiveAxisId,
  type PerspectiveDistortionAlert,
  type PerspectiveDistortionSeverity,
  type PerspectiveMode,
  type ThreePointPerspectiveRig,
  type ThreePointPerspectiveRigInput,
  type VanishingPoint2D,
  type VanishingPointEstimationResult,
  type Vec2D,
  type Vec3D,
} from "./perspective-types-and-math";
import { estimateVanishingPointsFromGuidesCore } from "./perspective-vp-estimator";

export {
  buildLineThroughHomogeneousPoints,
  clampFinitePerspective,
  computeSegmentToVpAngleErrorDeg,
  type EstimateVanishingPointsOptions,
  type EstimatedVanishingPointCluster,
  type GuideSegment2D,
  type HomogeneousVec3,
  type LineEquation2D,
  type Matrix3x3,
  type OrthocenterPrincipalPointCheck,
  type PerspectiveAxisId,
  type PerspectiveDistortionAlert,
  type PerspectiveDistortionSeverity,
  type PerspectiveMode,
  type ThreePointPerspectiveRig,
  type ThreePointPerspectiveRigInput,
  type VanishingPoint2D,
  type VanishingPointEstimationResult,
  type Vec2D,
  type Vec3D,
};

const INFINITE_Z_EPSILON = 1e-6;
const DEFAULT_SENSOR_WIDTH_MM = 36;
const DEFAULT_FOCAL_LENGTH_MM = 35;

function buildWorldToCameraRotation(yawDeg: number, pitchDeg: number, rollDeg: number): Matrix3x3 {
  const yaw = yawDeg * PERSPECTIVE_DEG_TO_RAD;
  const pitch = pitchDeg * PERSPECTIVE_DEG_TO_RAD;
  const roll = rollDeg * PERSPECTIVE_DEG_TO_RAD;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const ry: Matrix3x3 = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const rx: Matrix3x3 = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  const rz: Matrix3x3 = [cr, sr, 0, -sr, cr, 0, 0, 0, 1];
  return mulMat3(rz, mulMat3(rx, ry));
}

function projectDirectionToVanishingPoint(
  id: PerspectiveAxisId,
  worldAxis: "X" | "Y" | "Z",
  dirCam: Vec3D,
  focalLengthPx: number,
  principalPoint: Vec2D,
): VanishingPoint2D {
  if (Math.abs(dirCam.z) < INFINITE_Z_EPSILON) {
    const dir2d = normalizeVec2(dirCam.x, -dirCam.y);
    return {
      id,
      worldAxis,
      x: principalPoint.x + dir2d.x * 1e9,
      y: principalPoint.y + dir2d.y * 1e9,
      isFinite: false,
      direction2d: dir2d,
      homogeneous: [dir2d.x, dir2d.y, 0],
      distanceFromPrincipalPx: Number.POSITIVE_INFINITY,
    };
  }
  const u = principalPoint.x + focalLengthPx * (dirCam.x / dirCam.z);
  const v = principalPoint.y - focalLengthPx * (dirCam.y / dirCam.z);
  const dx = u - principalPoint.x;
  const dy = v - principalPoint.y;
  const dist = Math.hypot(dx, dy);
  return {
    id,
    worldAxis,
    x: u,
    y: v,
    isFinite: true,
    direction2d: dist > 1e-9 ? { x: dx / dist, y: dy / dist } : normalizeVec2(dirCam.x, -dirCam.y),
    homogeneous: [u, v, 1],
    distanceFromPrincipalPx: dist,
  };
}

/** 3D 월드 좌표를 리깅된 핀홀 카메라 2D 캔버스 픽셀 좌표로 사영한다. */
export function projectWorldPointToCanvas(
  rig: ThreePointPerspectiveRig,
  point: Vec3D,
): { readonly x: number; readonly y: number; readonly depthCam: number; readonly inFront: boolean } {
  const r = rig.worldToCameraRotation;
  const xc = r[0] * point.x + r[1] * point.y + r[2] * point.z;
  const yc = r[3] * point.x + r[4] * point.y + r[5] * point.z;
  const zc = r[6] * point.x + r[7] * point.y + r[8] * point.z;
  const safeZ = Math.abs(zc) < 1e-7 ? (zc >= 0 ? 1e-7 : -1e-7) : zc;
  return {
    x: rig.principalPoint.x + rig.focalLengthPx * (xc / safeZ),
    y: rig.principalPoint.y - rig.focalLengthPx * (yc / safeZ),
    depthCam: zc,
    inFront: zc > 1e-6,
  };
}

/**
 * 3점 투시 삼각형(VP1-VP2-VP3)의 수심(Orthocenter) = 주점(Principal Point) 기하 정리를 검증한다.
 */
export function verifyOrthocenterPrincipalPoint(
  vp1: VanishingPoint2D,
  vp2: VanishingPoint2D,
  vp3: VanishingPoint2D,
  principalPoint: Vec2D,
  expectedFocalLengthPx?: number,
  tolerancePx = 1e-2,
): OrthocenterPrincipalPointCheck {
  if (!vp1.isFinite || !vp2.isFinite || !vp3.isFinite) {
    return {
      applicable: false,
      isAcuteTriangle: false,
      orthocenter: null,
      principalPoint,
      errorPx: 0,
      impliedFocalLengthPx: null,
      focalLengthMismatchPx: null,
      valid: true,
      reasonKo: "무한 소실점이 포함된 1점·2점 투시 배치이므로 3점 수심 검증 대상이 아닙니다.",
    };
  }

  const a11 = vp2.x - vp3.x;
  const a12 = vp2.y - vp3.y;
  const b1 = vp1.x * a11 + vp1.y * a12;
  const a21 = vp3.x - vp1.x;
  const a22 = vp3.y - vp1.y;
  const b2 = vp2.x * a21 + vp2.y * a22;
  const det = a11 * a22 - a12 * a21;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) {
    return {
      applicable: true,
      isAcuteTriangle: false,
      orthocenter: null,
      principalPoint,
      errorPx: Number.POSITIVE_INFINITY,
      impliedFocalLengthPx: null,
      focalLengthMismatchPx: null,
      valid: false,
      reasonKo: "세 소실점이 일직선상에 놓여 3점 투시 삼각형을 구성할 수 없습니다.",
    };
  }

  const hx = (b1 * a22 - b2 * a12) / det;
  const hy = (a11 * b2 - a21 * b1) / det;
  const orthocenter: Vec2D = { x: hx, y: hy };

  const d12 = (vp1.x - hx) * (vp2.x - hx) + (vp1.y - hy) * (vp2.y - hy);
  const d23 = (vp2.x - hx) * (vp3.x - hx) + (vp2.y - hy) * (vp3.y - hy);
  const d31 = (vp3.x - hx) * (vp1.x - hx) + (vp3.y - hy) * (vp1.y - hy);
  const fSq = -(d12 + d23 + d31) / 3;
  const isAcuteTriangle = d12 < -1e-6 && d23 < -1e-6 && d31 < -1e-6 && fSq > 0;
  const impliedFocalLengthPx = isAcuteTriangle ? Math.sqrt(fSq) : null;
  const errorPx = Math.hypot(hx - principalPoint.x, hy - principalPoint.y);
  const focalLengthMismatchPx =
    impliedFocalLengthPx !== null &&
    expectedFocalLengthPx !== undefined &&
    Number.isFinite(expectedFocalLengthPx)
      ? Math.abs(impliedFocalLengthPx - expectedFocalLengthPx)
      : null;

  const valid = isAcuteTriangle && errorPx <= tolerancePx;
  const reasonKo = !isAcuteTriangle
    ? "세 소실점이 둔각·직각 삼각형을 이루어 직교 핀홀 3점 투시로 성립하지 않습니다."
    : valid
      ? "세 소실점 삼각형의 수심이 캔버스 주점과 일치하며 직교 3점 투시가 성립합니다."
      : `수심과 주점 사이에 ${errorPx.toFixed(2)}px 편차가 발생해 구도 중심 보정이 필요합니다.`;

  return {
    applicable: true,
    isAcuteTriangle,
    orthocenter,
    principalPoint,
    errorPx,
    impliedFocalLengthPx,
    focalLengthMismatchPx,
    valid,
    reasonKo,
  };
}

function evaluateDistortionAlerts(
  canvasWidth: number,
  canvasHeight: number,
  focalLengthMm: number,
  pitchDeg: number,
  rollDeg: number,
  vp1: VanishingPoint2D,
  vp2: VanishingPoint2D,
  vp3: VanishingPoint2D,
  orthocenterCheck: OrthocenterPrincipalPointCheck,
): {
  readonly severity: PerspectiveDistortionSeverity;
  readonly alerts: readonly PerspectiveDistortionAlert[];
} {
  const alerts: PerspectiveDistortionAlert[] = [];

  if (focalLengthMm < 18) {
    alerts.push({
      code: "EXTREME_WIDE_ANGLE",
      severity: "CRITICAL",
      messageKo: `초광각 초점거리(${focalLengthMm.toFixed(1)}mm)로 화면 외곽 건축물 늘어짐이 심합니다.`,
      measuredValue: focalLengthMm,
      thresholdValue: 18,
    });
  } else if (focalLengthMm < 24) {
    alerts.push({
      code: "EXTREME_WIDE_ANGLE",
      severity: "WARN",
      messageKo: `광각 초점거리(${focalLengthMm.toFixed(1)}mm) 구간이므로 외곽 모서리 비율을 점검하십시오.`,
      measuredValue: focalLengthMm,
      thresholdValue: 24,
    });
  }

  if (vp1.isFinite && vp2.isFinite) {
    const vpSpan = Math.hypot(vp2.x - vp1.x, vp2.y - vp1.y);
    if (vpSpan < canvasWidth * 1.1) {
      alerts.push({
        code: "CLOSE_HORIZONTAL_VPS",
        severity: "CRITICAL",
        messageKo: `좌·우 소실점 간격(${vpSpan.toFixed(0)}px)이 캔버스 폭의 1.1배 미만으로 건물이 과도하게 꺾입니다.`,
        measuredValue: vpSpan,
        thresholdValue: canvasWidth * 1.1,
      });
    } else if (vpSpan < canvasWidth * 1.6) {
      alerts.push({
        code: "CLOSE_HORIZONTAL_VPS",
        severity: "WARN",
        messageKo: `좌·우 소실점 간격(${vpSpan.toFixed(0)}px)이 좁아 코너 투시 왜곡이 도드라질 수 있습니다.`,
        measuredValue: vpSpan,
        thresholdValue: canvasWidth * 1.6,
      });
    }
  }

  const horizontalVps: readonly VanishingPoint2D[] = [vp1, vp2];
  for (let i = 0; i < horizontalVps.length; i += 1) {
    const vp = horizontalVps[i];
    if (
      vp.isFinite &&
      vp.x >= 0 &&
      vp.x <= canvasWidth &&
      vp.y >= 0 &&
      vp.y <= canvasHeight &&
      vp1.isFinite &&
      vp2.isFinite
    ) {
      alerts.push({
        code: "VP_INSIDE_CANVAS",
        severity: "WARN",
        messageKo: `${vp.id} 소실점이 캔버스 안쪽(${vp.x.toFixed(0)}, ${vp.y.toFixed(0)})에 위치해 광각 꺾임이 강합니다.`,
        measuredValue: vp.distanceFromPrincipalPx,
        thresholdValue: canvasWidth * 0.5,
      });
    }
  }

  if (Math.abs(pitchDeg) > 55) {
    alerts.push({
      code: "EXTREME_PITCH",
      severity: "CRITICAL",
      messageKo: `카메라 앙각/부감(${pitchDeg.toFixed(1)}°)이 55°를 넘어 수직선 수렴이 급격합니다.`,
      measuredValue: Math.abs(pitchDeg),
      thresholdValue: 55,
    });
  } else if (Math.abs(pitchDeg) > 38) {
    alerts.push({
      code: "EXTREME_PITCH",
      severity: "WARN",
      messageKo: `카메라 앙각/부감(${pitchDeg.toFixed(1)}°)이 커서 고층부 창문 압축을 유의해야 합니다.`,
      measuredValue: Math.abs(pitchDeg),
      thresholdValue: 38,
    });
  }

  if (Math.abs(rollDeg) > 25) {
    alerts.push({
      code: "STEEP_ROLL",
      severity: "WARN",
      messageKo: `지평선 롤(${rollDeg.toFixed(1)}°)이 25°를 넘어 독자 시선 안정도가 떨어질 수 있습니다.`,
      measuredValue: Math.abs(rollDeg),
      thresholdValue: 25,
    });
  }

  if (orthocenterCheck.applicable && !orthocenterCheck.valid) {
    alerts.push({
      code: "NON_ORTHOGONAL_VP_TRIANGLE",
      severity: "CRITICAL",
      messageKo: orthocenterCheck.reasonKo,
      measuredValue: orthocenterCheck.errorPx,
      thresholdValue: 1,
    });
  }

  if (
    vp3.isFinite &&
    vp3.x >= 0 &&
    vp3.x <= canvasWidth &&
    vp3.y >= 0 &&
    vp3.y <= canvasHeight &&
    Math.abs(pitchDeg) <= 55
  ) {
    alerts.push({
      code: "VP_INSIDE_CANVAS",
      severity: "WARN",
      messageKo: "수직 소실점(VP3)이 캔버스 내부에 들어와 강한 탑뷰/앙각 연출이 형성됩니다.",
      measuredValue: vp3.distanceFromPrincipalPx,
      thresholdValue: canvasHeight * 0.5,
    });
  }

  let severity: PerspectiveDistortionSeverity = "SAFE";
  for (let i = 0; i < alerts.length; i += 1) {
    if (alerts[i].severity === "CRITICAL") {
      severity = "CRITICAL";
      break;
    }
    if (alerts[i].severity === "WARN") severity = "WARN";
  }
  return { severity, alerts };
}

/**
 * 3D 핀홀 카메라 파라미터로부터 정확한 3점 투시 소실점(VP1·VP2·VP3), 지평선,
 * 수심=주점 검증, 왜곡 위험 경보를 계산한다.
 */
export function solveThreePointPerspectiveRig(
  input: ThreePointPerspectiveRigInput,
): ThreePointPerspectiveRig {
  const canvasWidth = clampFinitePerspective(input.canvasWidth, 64, 16384, 1200);
  const canvasHeight = clampFinitePerspective(input.canvasHeight, 64, 16384, 800);
  const sensorWidthMm = clampFinitePerspective(
    input.sensorWidthMm ?? DEFAULT_SENSOR_WIDTH_MM,
    8,
    120,
    DEFAULT_SENSOR_WIDTH_MM,
  );
  const focalLengthMm = clampFinitePerspective(
    input.focalLengthMm ?? DEFAULT_FOCAL_LENGTH_MM,
    8,
    300,
    DEFAULT_FOCAL_LENGTH_MM,
  );
  const yawDeg = clampFinitePerspective(input.yawDeg, -180, 180, 35);
  const pitchDeg = clampFinitePerspective(input.pitchDeg, -89.5, 89.5, -20);
  const rollDeg = clampFinitePerspective(input.rollDeg ?? 0, -180, 180, 0);
  const offsetX = clampFinitePerspective(
    input.principalPointOffsetPx?.x ?? 0,
    -canvasWidth,
    canvasWidth,
    0,
  );
  const offsetY = clampFinitePerspective(
    input.principalPointOffsetPx?.y ?? 0,
    -canvasHeight,
    canvasHeight,
    0,
  );
  const principalPoint: Vec2D = { x: canvasWidth * 0.5 + offsetX, y: canvasHeight * 0.5 + offsetY };

  const focalLengthPx = (focalLengthMm / sensorWidthMm) * canvasWidth;
  const horizontalFovDeg = 2 * Math.atan(canvasWidth / (2 * focalLengthPx)) * PERSPECTIVE_RAD_TO_DEG;
  const verticalFovDeg = 2 * Math.atan(canvasHeight / (2 * focalLengthPx)) * PERSPECTIVE_RAD_TO_DEG;

  const rot = buildWorldToCameraRotation(yawDeg, pitchDeg, rollDeg);
  const colX: Vec3D = { x: rot[0], y: rot[3], z: rot[6] };
  const colY: Vec3D = { x: rot[1], y: rot[4], z: rot[7] };
  const colZ: Vec3D = { x: rot[2], y: rot[5], z: rot[8] };

  const rawVpX = projectDirectionToVanishingPoint("VP1", "X", colX, focalLengthPx, principalPoint);
  const rawVpZ = projectDirectionToVanishingPoint("VP2", "Z", colZ, focalLengthPx, principalPoint);
  const vp3 = projectDirectionToVanishingPoint("VP3", "Y", colY, focalLengthPx, principalPoint);

  let vp1: VanishingPoint2D;
  let vp2: VanishingPoint2D;
  if (rawVpX.isFinite && rawVpZ.isFinite) {
    const xLeft = rawVpX.x <= rawVpZ.x;
    vp1 = { ...(xLeft ? rawVpX : rawVpZ), id: "VP1" };
    vp2 = { ...(xLeft ? rawVpZ : rawVpX), id: "VP2" };
  } else if (rawVpX.isFinite && !rawVpZ.isFinite) {
    vp1 = { ...rawVpZ, id: "VP1" };
    vp2 = { ...rawVpX, id: "VP2" };
  } else {
    vp1 = { ...rawVpX, id: "VP1" };
    vp2 = { ...rawVpZ, id: "VP2" };
  }

  const horizonLine = buildLineFromCoefficients(
    colY.x,
    -colY.y,
    -colY.x * principalPoint.x + colY.y * principalPoint.y + focalLengthPx * colY.z,
    principalPoint.x,
  );
  const finiteCount = (vp1.isFinite ? 1 : 0) + (vp2.isFinite ? 1 : 0) + (vp3.isFinite ? 1 : 0);
  const mode: PerspectiveMode =
    finiteCount >= 3 ? "3-point" : finiteCount === 2 ? "2-point" : "1-point";

  const orthocenterCheck = verifyOrthocenterPrincipalPoint(
    vp1,
    vp2,
    vp3,
    principalPoint,
    focalLengthPx,
    1e-2,
  );
  const { severity: distortionSeverity, alerts: distortionAlerts } = evaluateDistortionAlerts(
    canvasWidth,
    canvasHeight,
    focalLengthMm,
    pitchDeg,
    rollDeg,
    vp1,
    vp2,
    vp3,
    orthocenterCheck,
  );

  return {
    canvasWidth,
    canvasHeight,
    focalLengthMm,
    sensorWidthMm,
    focalLengthPx,
    horizontalFovDeg,
    verticalFovDeg,
    yawDeg,
    pitchDeg,
    rollDeg,
    principalPoint,
    worldToCameraRotation: rot,
    mode,
    vp1,
    vp2,
    vp3,
    horizonLine,
    orthocenterCheck,
    distortionSeverity,
    distortionAlerts,
  };
}

/** 가이드 선분 집합에서 결정론적 RANSAC/MSAC + IRLS로 1·2·3점 소실점과 지평선을 역추정한다. */
export function estimateVanishingPointsFromGuides(
  segments: readonly GuideSegment2D[],
  options: EstimateVanishingPointsOptions,
): VanishingPointEstimationResult {
  return estimateVanishingPointsFromGuidesCore(
    segments,
    options,
    verifyOrthocenterPrincipalPoint,
  );
}
