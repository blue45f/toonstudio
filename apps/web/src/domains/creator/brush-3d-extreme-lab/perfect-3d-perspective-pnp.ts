/**
 * Wave 38F — 2D 러프 소실점 선분 2쌍 기반 Perspective PnP 카메라 역산기.
 * 두 직교 소실점에서 카메라 초점거리(mm)·수평선 높이·피치/요/롤 각도를 정확히 복원한다.
 */

import { clamp3d, dot3, norm3, type Vec3 } from "./perfect-3d-contact-ik";

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface LineSegment2D {
  readonly a: Vec2;
  readonly b: Vec2;
}

export interface PerspectiveCameraParams {
  readonly focalLengthMm: number;
  readonly sensorWidthMm: number;
  readonly pitchDeg: number;
  readonly yawDeg: number;
  readonly rollDeg: number;
  readonly horizonYRatio: number;
  readonly verticalFovDeg: number;
}

export interface PerspectiveGuidePairInput {
  readonly pairA: readonly [LineSegment2D, LineSegment2D];
  readonly pairB: readonly [LineSegment2D, LineSegment2D];
  readonly imageWidthPx: number;
  readonly imageHeightPx: number;
  readonly sensorWidthMm?: number;
}

export interface PerspectivePnPResult {
  readonly valid: boolean;
  readonly warningKo: string | null;
  readonly vanishingPointA: Vec2 | null;
  readonly vanishingPointB: Vec2 | null;
  readonly focalLengthPx: number;
  readonly focalLengthMm: number;
  readonly sensorWidthMm: number;
  readonly horizonYRatio: number;
  readonly pitchDeg: number;
  readonly yawDeg: number;
  readonly rollDeg: number;
  readonly verticalFovDeg: number;
  readonly residualOrthogonalityError: number;
}

export interface PerspectivePreset {
  readonly id: "wide-24mm" | "standard-50mm" | "portrait-85mm";
  readonly labelKo: string;
  readonly focalLengthMm: number;
  readonly pitchDeg: number;
  readonly yawDeg: number;
}

export const PERSPECTIVE_CAMERA_PRESETS: readonly PerspectivePreset[] = [
  { id: "wide-24mm", labelKo: "24mm 광각 액션", focalLengthMm: 24, pitchDeg: -8, yawDeg: 34 },
  { id: "standard-50mm", labelKo: "50mm 표준 웹툰", focalLengthMm: 50, pitchDeg: 4, yawDeg: 38 },
  { id: "portrait-85mm", labelKo: "85mm 망원 클로즈업", focalLengthMm: 85, pitchDeg: 2, yawDeg: 42 },
] as const;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function intersectLines2d(seg1: LineSegment2D, seg2: LineSegment2D): Vec2 | null {
  const x1 = seg1.a.x;
  const y1 = seg1.a.y;
  const x2 = seg1.b.x;
  const y2 = seg1.b.y;
  const x3 = seg2.a.x;
  const y3 = seg2.a.y;
  const x4 = seg2.b.x;
  const y4 = seg2.b.y;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-6) return null;

  const cross1 = x1 * y2 - y1 * x2;
  const cross2 = x3 * y4 - y3 * x4;
  const px = (cross1 * (x3 - x4) - (x1 - x2) * cross2) / denom;
  const py = (cross1 * (y3 - y4) - (y1 - y2) * cross2) / denom;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  return { x: px, y: py };
}

/**
 * 알려진 핀홀 카메라 파라미터에서 3D 직교 공간 박스의 2쌍 2D 러프 소실점 가이드를 정방향 투영한다.
 */
export function projectPerspectiveGuideLines(
  params: {
    readonly focalLengthMm: number;
    readonly pitchDeg: number;
    readonly yawDeg: number;
    readonly rollDeg?: number;
    readonly sensorWidthMm?: number;
  },
  imageWidthPx: number,
  imageHeightPx: number,
): PerspectiveGuidePairInput {
  const sensorW = clamp3d(params.sensorWidthMm ?? 36, 12, 70);
  const fPx = clamp3d(params.focalLengthMm, 12, 200) * (imageWidthPx / sensorW);
  const cx = imageWidthPx * 0.5;
  const cy = imageHeightPx * 0.5;

  const yaw = clamp3d(params.yawDeg, 12, 78) * DEG_TO_RAD;
  const pitch = clamp3d(params.pitchDeg, -38, 38) * DEG_TO_RAD;
  const roll = clamp3d(params.rollDeg ?? 0, -25, 25) * DEG_TO_RAD;

  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const cosR = Math.cos(roll);
  const sinR = Math.sin(roll);

  const projectWorld = (w: Vec3): Vec2 => {
    const x1 = cosY * w[0] - sinY * w[2];
    const y1 = w[1];
    const z1 = sinY * w[0] + cosY * w[2];

    const xc0 = x1;
    const yc0 = cosP * y1 - sinP * z1;
    const zc = Math.max(0.2, sinP * y1 + cosP * z1);

    const xc = cosR * xc0 - sinR * yc0;
    const yc = sinR * xc0 + cosR * yc0;

    return {
      x: cx + (fPx * xc) / zc,
      y: cy - (fPx * yc) / zc,
    };
  };

  const boxCenterX = sinY * 5.5;
  const boxCenterZ = cosY * 5.5;
  const halfW = 1.15;
  const halfH = 0.85;
  const halfD = 1.15;

  const p000 = projectWorld([boxCenterX - halfW, -halfH, boxCenterZ - halfD]);
  const p100 = projectWorld([boxCenterX + halfW, -halfH, boxCenterZ - halfD]);
  const p010 = projectWorld([boxCenterX - halfW, halfH, boxCenterZ - halfD]);
  const p110 = projectWorld([boxCenterX + halfW, halfH, boxCenterZ - halfD]);
  const p001 = projectWorld([boxCenterX - halfW, -halfH, boxCenterZ + halfD]);
  const p011 = projectWorld([boxCenterX - halfW, halfH, boxCenterZ + halfD]);

  return {
    pairA: [
      { a: p000, b: p100 },
      { a: p010, b: p110 },
    ],
    pairB: [
      { a: p000, b: p001 },
      { a: p010, b: p011 },
    ],
    imageWidthPx,
    imageHeightPx,
    sensorWidthMm: sensorW,
  };
}

/**
 * 2D 러프 소실점 선분 2쌍에서 카메라 초점거리(mm)·수평선 높이·피치/요/롤을 역산한다.
 */
export function solvePerspectivePnPFromVanishingLines(
  input: PerspectiveGuidePairInput,
): PerspectivePnPResult {
  const width = Math.max(64, input.imageWidthPx);
  const height = Math.max(64, input.imageHeightPx);
  const sensorWidthMm = clamp3d(input.sensorWidthMm ?? 36, 12, 70);
  const cx = width * 0.5;
  const cy = height * 0.5;

  const vpA = intersectLines2d(input.pairA[0], input.pairA[1]);
  const vpB = intersectLines2d(input.pairB[0], input.pairB[1]);

  if (!vpA || !vpB) {
    return {
      valid: false,
      warningKo: "소실점 선분이 평행하여 교점을 계산할 수 없습니다.",
      vanishingPointA: vpA,
      vanishingPointB: vpB,
      focalLengthPx: 0,
      focalLengthMm: 0,
      sensorWidthMm,
      horizonYRatio: 0.5,
      pitchDeg: 0,
      yawDeg: 0,
      rollDeg: 0,
      verticalFovDeg: 0,
      residualOrthogonalityError: 1,
    };
  }

  const ax = vpA.x - cx;
  const ay = cy - vpA.y;
  const bx = vpB.x - cx;
  const by = cy - vpB.y;

  const fSquared = -(ax * bx + ay * by);
  if (!Number.isFinite(fSquared) || fSquared <= 1) {
    return {
      valid: false,
      warningKo: "두 소실점이 주점 기준으로 예각 배치되어 유효한 직교 초점거리를 복원할 수 없습니다.",
      vanishingPointA: vpA,
      vanishingPointB: vpB,
      focalLengthPx: 0,
      focalLengthMm: 0,
      sensorWidthMm,
      horizonYRatio: 0.5,
      pitchDeg: 0,
      yawDeg: 0,
      rollDeg: 0,
      verticalFovDeg: 0,
      residualOrthogonalityError: 1,
    };
  }

  const focalLengthPx = Math.sqrt(fSquared);
  const focalLengthMm = focalLengthPx * (sensorWidthMm / width);
  const verticalFovDeg = 2 * Math.atan((height * 0.5) / focalLengthPx) * RAD_TO_DEG;

  const leftVp = vpA.x <= vpB.x ? vpA : vpB;
  const rightVp = vpA.x <= vpB.x ? vpB : vpA;
  const hDx = rightVp.x - leftVp.x;
  const hDy = rightVp.y - leftVp.y;
  const rollRad = Math.abs(hDx) > 1e-4 ? -Math.atan2(hDy, hDx) : 0;
  const horizonYAtCenter =
    Math.abs(hDx) > 1e-4
      ? leftVp.y + ((cx - leftVp.x) / hDx) * hDy
      : (leftVp.y + rightVp.y) * 0.5;
  const horizonYRatio = horizonYAtCenter / height;

  const cosR = Math.cos(-rollRad);
  const sinR = Math.sin(-rollRad);
  const aUnrollX = cosR * ax - sinR * ay;
  const aUnrollY = sinR * ax + cosR * ay;

  const horizonOffsetPerp = (horizonYAtCenter - cy) * Math.cos(rollRad);
  const pitchRad = Math.atan2(horizonOffsetPerp, focalLengthPx);

  const dirA = norm3([aUnrollX, aUnrollY, focalLengthPx], [1, 0, 0]);
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);
  const worldZ1 = -sinP * dirA[1] + cosP * dirA[2];
  const worldX1 = dirA[0];
  let yawDeg = Math.atan2(worldZ1, worldX1) * RAD_TO_DEG;
  if (yawDeg < 0) yawDeg += 180;
  if (yawDeg > 90) yawDeg = 180 - yawDeg;

  const vecA = norm3([ax, ay, focalLengthPx]);
  const vecB = norm3([bx, by, focalLengthPx]);
  const residualOrthogonalityError = Math.abs(dot3(vecA, vecB));

  return {
    valid: true,
    warningKo: null,
    vanishingPointA: vpA,
    vanishingPointB: vpB,
    focalLengthPx: Number(focalLengthPx.toFixed(2)),
    focalLengthMm: Number(focalLengthMm.toFixed(2)),
    sensorWidthMm,
    horizonYRatio: Number(horizonYRatio.toFixed(4)),
    pitchDeg: Number((pitchRad * RAD_TO_DEG).toFixed(2)),
    yawDeg: Number(yawDeg.toFixed(2)),
    rollDeg: Number((rollRad * RAD_TO_DEG).toFixed(2)),
    verticalFovDeg: Number(verticalFovDeg.toFixed(2)),
    residualOrthogonalityError: Number(residualOrthogonalityError.toFixed(6)),
  };
}
