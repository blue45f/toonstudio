/**
 * 2D 러프 스케치 -> 3D VRM 휴머노이드 13관절 전신 포즈 역산 및 생체각도 클램프 모듈.
 */

import type {
  DetectedBodyLandmarks,
  JointBiomechanicalBoundsDeg,
  JointClampEvent,
  Quaternion,
  RotationAxis,
  SketchPoint2D,
  SketchStageDocument,
  SketchStroke2D,
  SketchVrmBoneName,
  SolvedVrmBoneTransform,
  SolvedVrmHumanoidPose,
  Vec3,
} from "./sketch-to-3d-stage-types";

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;
export const DEFAULT_ASPECT_RATIO = 16 / 9;
export const EPSILON = 1e-6;

export interface IsoPoint {
  readonly u: number;
  readonly v: number;
}

export const SKETCH_VRM_BONE_NAMES: readonly SketchVrmBoneName[] = Object.freeze([
  "hips",
  "spine",
  "head",
  "leftShoulder",
  "rightShoulder",
  "leftUpperArm",
  "rightUpperArm",
  "leftLowerArm",
  "rightLowerArm",
  "leftUpperLeg",
  "rightUpperLeg",
  "leftLowerLeg",
  "rightLowerLeg",
]);

/** VRM 정규화 관절 생체각도 한계 테이블 (deg, XYZ 내재 오일러 기준). */
export const VRM_BIOMECHANICAL_LIMITS_DEG: Readonly<
  Record<SketchVrmBoneName, JointBiomechanicalBoundsDeg>
> = Object.freeze({
  hips: { x: { minDeg: -45, maxDeg: 45 }, y: { minDeg: -60, maxDeg: 60 }, z: { minDeg: -35, maxDeg: 35 } },
  spine: { x: { minDeg: -45, maxDeg: 60 }, y: { minDeg: -45, maxDeg: 45 }, z: { minDeg: -35, maxDeg: 35 } },
  head: { x: { minDeg: -45, maxDeg: 50 }, y: { minDeg: -70, maxDeg: 70 }, z: { minDeg: -35, maxDeg: 35 } },
  leftShoulder: { x: { minDeg: -35, maxDeg: 35 }, y: { minDeg: -40, maxDeg: 40 }, z: { minDeg: -45, maxDeg: 30 } },
  rightShoulder: { x: { minDeg: -35, maxDeg: 35 }, y: { minDeg: -40, maxDeg: 40 }, z: { minDeg: -30, maxDeg: 45 } },
  leftUpperArm: { x: { minDeg: -120, maxDeg: 120 }, y: { minDeg: -95, maxDeg: 95 }, z: { minDeg: -165, maxDeg: 95 } },
  rightUpperArm: { x: { minDeg: -120, maxDeg: 120 }, y: { minDeg: -95, maxDeg: 95 }, z: { minDeg: -95, maxDeg: 165 } },
  // 왼팔꿈치 굴곡은 -Z(-150~0), 오른팔꿈치 굴곡은 +Z(0~150) — 역꺾임(과신전) 차단
  leftLowerArm: { x: { minDeg: -95, maxDeg: 95 }, y: { minDeg: -18, maxDeg: 18 }, z: { minDeg: -150, maxDeg: 0 } },
  rightLowerArm: { x: { minDeg: -95, maxDeg: 95 }, y: { minDeg: -18, maxDeg: 18 }, z: { minDeg: 0, maxDeg: 150 } },
  leftUpperLeg: { x: { minDeg: -125, maxDeg: 45 }, y: { minDeg: -50, maxDeg: 50 }, z: { minDeg: -55, maxDeg: 35 } },
  rightUpperLeg: { x: { minDeg: -125, maxDeg: 45 }, y: { minDeg: -50, maxDeg: 50 }, z: { minDeg: -35, maxDeg: 55 } },
  // 무릎 굴곡은 +X(0~150) — 역꺾임(-X) 차단
  leftLowerLeg: { x: { minDeg: 0, maxDeg: 150 }, y: { minDeg: -18, maxDeg: 18 }, z: { minDeg: -12, maxDeg: 12 } },
  rightLowerLeg: { x: { minDeg: 0, maxDeg: 150 }, y: { minDeg: -18, maxDeg: 18 }, z: { minDeg: -12, maxDeg: 12 } },
});

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function roundTo(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function toIso(pt: SketchPoint2D, aspect: number): IsoPoint {
  return { u: (pt.x - 0.5) * aspect, v: 0.5 - pt.y };
}

export function fromIso(iso: IsoPoint, aspect: number): SketchPoint2D {
  return { x: roundTo(0.5 + iso.u / aspect, 4), y: roundTo(0.5 - iso.v, 4) };
}

/** 픽셀 좌표를 정규화 캔버스 좌표([0,1]x[0,1])로 변환한다. */
export function normalizeCanvasPoint(
  px: number,
  py: number,
  width: number,
  height: number,
): SketchPoint2D {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  return {
    x: roundTo(clampNumber(px / safeW, 0, 1), 4),
    y: roundTo(clampNumber(py / safeH, 0, 1), 4),
  };
}

/** 내재 XYZ 오일러 각도(deg)를 정규화 단위 쿼터니언(w >= 0)으로 변환한다. */
export function eulerDegToQuaternion(eulerDeg: Vec3): Quaternion {
  const rx = eulerDeg.x * DEG_TO_RAD * 0.5;
  const ry = eulerDeg.y * DEG_TO_RAD * 0.5;
  const rz = eulerDeg.z * DEG_TO_RAD * 0.5;

  const c1 = Math.cos(rx);
  const s1 = Math.sin(rx);
  const c2 = Math.cos(ry);
  const s2 = Math.sin(ry);
  const c3 = Math.cos(rz);
  const s3 = Math.sin(rz);

  let x = s1 * c2 * c3 + c1 * s2 * s3;
  let y = c1 * s2 * c3 - s1 * c2 * s3;
  let z = c1 * c2 * s3 + s1 * s2 * c3;
  let w = c1 * c2 * c3 - s1 * s2 * s3;

  const norm = Math.hypot(x, y, z, w) || 1;
  x /= norm;
  y /= norm;
  z /= norm;
  w /= norm;

  if (w < 0) {
    x = -x;
    y = -y;
    z = -z;
    w = -w;
  }

  return { x: roundTo(x, 5), y: roundTo(y, 5), z: roundTo(z, 5), w: roundTo(w, 5) };
}

/** 단일 VRM 휴머노이드 본 오일러 각도(deg)에 생체각도 클램프를 적용하고 쿼터니언을 산출한다. */
export function clampVrmHumanoidBone(
  bone: SketchVrmBoneName,
  rawEulerDeg: Vec3,
): { readonly transform: SolvedVrmBoneTransform; readonly events: readonly JointClampEvent[] } {
  const bounds = VRM_BIOMECHANICAL_LIMITS_DEG[bone];
  const axes: readonly RotationAxis[] = ["x", "y", "z"];
  const clampedDeg = { x: 0, y: 0, z: 0 };
  const clampedAxes: RotationAxis[] = [];
  const events: JointClampEvent[] = [];

  for (const axis of axes) {
    const req = Number.isFinite(rawEulerDeg[axis]) ? rawEulerDeg[axis] : 0;
    const { minDeg, maxDeg } = bounds[axis];
    const next = clampNumber(req, minDeg, maxDeg);
    clampedDeg[axis] = roundTo(next, 2);
    if (Math.abs(next - req) > 0.05) {
      clampedAxes.push(axis);
      events.push({
        bone,
        axis,
        requestedDeg: roundTo(req, 2),
        clampedDeg: roundTo(next, 2),
        minDeg,
        maxDeg,
      });
    }
  }

  const eulerDeg: Vec3 = { x: clampedDeg.x, y: clampedDeg.y, z: clampedDeg.z };
  const eulerRad: Vec3 = {
    x: roundTo(eulerDeg.x * DEG_TO_RAD, 5),
    y: roundTo(eulerDeg.y * DEG_TO_RAD, 5),
    z: roundTo(eulerDeg.z * DEG_TO_RAD, 5),
  };

  return {
    transform: {
      bone,
      rawEulerDeg: {
        x: roundTo(rawEulerDeg.x, 2),
        y: roundTo(rawEulerDeg.y, 2),
        z: roundTo(rawEulerDeg.z, 2),
      },
      eulerDeg,
      eulerRad,
      quaternion: eulerDegToQuaternion(eulerDeg),
      clamped: clampedAxes.length > 0,
      clampedAxes,
    },
    events,
  };
}

/** 2D 신체 랜드마크(머리 중심/반지름, 목, 골반, 캐릭터 중심 및 높이)를 추출한다. */
export function detectBodyLandmarks(
  strokes: readonly SketchStroke2D[],
  aspect: number,
): {
  readonly landmarks: DetectedBodyLandmarks;
  readonly hasHead: boolean;
  readonly hasSpine: boolean;
  readonly hasLegs: boolean;
} {
  const headPts = strokes.filter((s) => s.kind === "head").flatMap((s) => s.points);
  const spineStrokes = strokes.filter((s) => s.kind === "spine" && s.points.length >= 2);
  const legStrokes = strokes.filter(
    (s) => (s.kind === "leg" || s.kind === "leftLeg" || s.kind === "rightLeg") && s.points.length >= 2,
  );
  const bodyPts = strokes
    .filter((s) => s.kind !== "vanishingPairA" && s.kind !== "vanishingPairB" && s.kind !== "shadowHatch")
    .flatMap((s) => s.points);

  const hasHead = headPts.length >= 2;
  const hasSpine = spineStrokes.length > 0;
  const hasLegs = legStrokes.length > 0;

  let headCenter: SketchPoint2D = { x: 0.5, y: 0.3 };
  let headRadiusNormalized = 0.07;

  if (hasHead) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const p of headPts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    headCenter = { x: (minX + maxX) * 0.5, y: (minY + maxY) * 0.5 };
    const radiusY = (maxY - minY) * 0.5;
    const radiusXAsY = ((maxX - minX) * 0.5) * aspect;
    headRadiusNormalized = clampNumber((radiusY + radiusXAsY) * 0.5, 0.025, 0.32);
  }

  let neck: SketchPoint2D = { x: headCenter.x, y: clampNumber(headCenter.y + headRadiusNormalized, 0.05, 0.95) };
  let pelvis: SketchPoint2D = {
    x: headCenter.x,
    y: clampNumber(neck.y + headRadiusNormalized * 3.4, 0.1, 0.98),
  };

  const primarySpine = spineStrokes[0];
  if (primarySpine) {
    const first = primarySpine.points[0] ?? neck;
    const last = primarySpine.points[primarySpine.points.length - 1] ?? pelvis;
    const dFirst = Math.hypot((first.x - headCenter.x) * aspect, first.y - headCenter.y);
    const dLast = Math.hypot((last.x - headCenter.x) * aspect, last.y - headCenter.y);
    if (dFirst <= dLast) {
      neck = first;
      pelvis = last;
    } else {
      neck = last;
      pelvis = first;
    }
    if (!hasHead) {
      const spineLen = Math.hypot((pelvis.x - neck.x) * aspect, pelvis.y - neck.y);
      headRadiusNormalized = clampNumber(spineLen / 4.8, 0.03, 0.25);
      headCenter = { x: neck.x, y: clampNumber(neck.y - headRadiusNormalized, 0.05, 0.9) };
    }
  }

  let figureHeightNormalized = headRadiusNormalized * 10;
  if (bodyPts.length >= 2) {
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const p of bodyPts) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    figureHeightNormalized = clampNumber(maxY - minY, headRadiusNormalized * 2, 1);
  }

  return {
    landmarks: {
      headCenter: { x: roundTo(headCenter.x, 4), y: roundTo(headCenter.y, 4) },
      headRadiusNormalized: roundTo(headRadiusNormalized, 4),
      neck: { x: roundTo(neck.x, 4), y: roundTo(neck.y, 4) },
      pelvis: { x: roundTo(pelvis.x, 4), y: roundTo(pelvis.y, 4) },
      characterCenter: {
        x: roundTo((headCenter.x + neck.x + pelvis.x) / 3, 4),
        y: roundTo((headCenter.y + neck.y + pelvis.y) / 3, 4),
      },
      figureHeightNormalized: roundTo(figureHeightNormalized, 4),
    },
    hasHead,
    hasSpine,
    hasLegs,
  };
}

function decomposeLimbPolyline(
  points: readonly SketchPoint2D[],
  anchor: SketchPoint2D,
  aspect: number,
): { readonly root: IsoPoint; readonly mid: IsoPoint; readonly tip: IsoPoint } {
  const first = points[0] ?? anchor;
  const last = points[points.length - 1] ?? anchor;
  const dFirst = Math.hypot((first.x - anchor.x) * aspect, first.y - anchor.y);
  const dLast = Math.hypot((last.x - anchor.x) * aspect, last.y - anchor.y);
  const ordered = dFirst <= dLast ? points : [...points].reverse();

  const root = toIso(ordered[0] ?? anchor, aspect);
  const tip = toIso(ordered[ordered.length - 1] ?? anchor, aspect);
  if (ordered.length === 2) {
    return { root, mid: { u: (root.u + tip.u) * 0.5, v: (root.v + tip.v) * 0.5 }, tip };
  }

  const chordU = tip.u - root.u;
  const chordV = tip.v - root.v;
  const chordLen = Math.hypot(chordU, chordV) || EPSILON;
  let bestIdx = Math.floor(ordered.length / 2);
  let bestDist = -1;
  for (let i = 1; i < ordered.length - 1; i += 1) {
    const p = ordered[i];
    if (!p) continue;
    const iso = toIso(p, aspect);
    const dist = Math.abs((iso.u - root.u) * chordV - (iso.v - root.v) * chordU) / chordLen;
    if (dist > bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return { root, mid: toIso(ordered[bestIdx] ?? ordered[0] ?? anchor, aspect), tip };
}

function vectorAngleDeg(a: Vec3, b: Vec3): number {
  const la = Math.hypot(a.x, a.y, a.z);
  const lb = Math.hypot(b.x, b.y, b.z);
  if (la < EPSILON || lb < EPSILON) return 0;
  return Math.acos(clampNumber((a.x * b.x + a.y * b.y + a.z * b.z) / (la * lb), -1, 1)) * RAD_TO_DEG;
}

/** ① 2D 제스처 스트로크에서 3D VRM 휴머노이드 전신 포즈(오일러·쿼터니언·관절 생체각도 클램프)를 역산한다. */
export function solvePoseFromSketch(
  doc: SketchStageDocument,
  cameraPitchDeg = 0,
): SolvedVrmHumanoidPose {
  const aspect = doc.aspectRatio && doc.aspectRatio > 0.2 ? doc.aspectRatio : DEFAULT_ASPECT_RATIO;
  const { landmarks, hasHead, hasSpine, hasLegs } = detectBodyLandmarks(doc.strokes, aspect);

  const headIso = toIso(landmarks.headCenter, aspect);
  const neckIso = toIso(landmarks.neck, aspect);
  const pelvisIso = toIso(landmarks.pelvis, aspect);
  const headUnit = Math.max(0.05, landmarks.headRadiusNormalized * 2);

  const spineDu = neckIso.u - pelvisIso.u;
  const spineDv = neckIso.v - pelvisIso.v;
  const spineLen = Math.hypot(spineDu, spineDv);
  const foreshortenRatio = clampNumber(spineLen / Math.max(EPSILON, headUnit * 2.35), 0.25, 1.25);

  const spineRollDeg = -Math.atan2(spineDu, Math.max(0.03, Math.abs(spineDv))) * RAD_TO_DEG * 0.7;
  const forwardPitchMag =
    foreshortenRatio < 0.96
      ? Math.acos(clampNumber(foreshortenRatio, 0.25, 1)) * RAD_TO_DEG * 0.85
      : -(foreshortenRatio - 0.96) * 40;
  const spinePitchDeg = forwardPitchMag + (cameraPitchDeg < -8 ? 8 : cameraPitchDeg > 8 ? 14 : 0);

  let spineYawDeg = 0;
  const spineStroke = doc.strokes.find((s) => s.kind === "spine" && s.points.length >= 3);
  if (spineStroke) {
    const midPt = spineStroke.points[Math.floor(spineStroke.points.length / 2)];
    if (midPt) {
      const midIso = toIso(midPt, aspect);
      spineYawDeg = clampNumber(((midIso.u - (neckIso.u + pelvisIso.u) * 0.5) / headUnit) * 32, -40, 40);
    }
  }

  const headOffsetU = headIso.u - neckIso.u;
  const headOffsetV = headIso.v - neckIso.v;
  const headYawDeg = clampNumber((headOffsetU / headUnit) * 48 + spineYawDeg * 0.3, -65, 65);
  const headPitchDeg = clampNumber(
    ((headUnit * 0.52 - headOffsetV) / headUnit) * 36 - cameraPitchDeg * 0.25,
    -42,
    45,
  );
  const headRollDeg = clampNumber(
    -Math.atan2(headOffsetU, Math.max(0.03, headOffsetV)) * RAD_TO_DEG * 0.45,
    -30,
    30,
  );

  let leftArmStroke = doc.strokes.find((s) => s.kind === "leftArm" && s.points.length >= 2);
  let rightArmStroke = doc.strokes.find((s) => s.kind === "rightArm" && s.points.length >= 2);
  for (const s of doc.strokes.filter((item) => item.kind === "arm" && item.points.length >= 2)) {
    const avgU = s.points.reduce((acc, p) => acc + toIso(p, aspect).u, 0) / s.points.length;
    if (avgU >= neckIso.u && !leftArmStroke) leftArmStroke = s;
    else if (avgU < neckIso.u && !rightArmStroke) rightArmStroke = s;
  }

  let leftLegStroke = doc.strokes.find((s) => s.kind === "leftLeg" && s.points.length >= 2);
  let rightLegStroke = doc.strokes.find((s) => s.kind === "rightLeg" && s.points.length >= 2);
  for (const s of doc.strokes.filter((item) => item.kind === "leg" && item.points.length >= 2)) {
    const avgU = s.points.reduce((acc, p) => acc + toIso(p, aspect).u, 0) / s.points.length;
    if (avgU >= pelvisIso.u && !leftLegStroke) leftLegStroke = s;
    else if (avgU < pelvisIso.u && !rightLegStroke) rightLegStroke = s;
  }

  const solveArmSide = (
    side: "left" | "right",
    stroke: SketchStroke2D | undefined,
  ): { readonly shoulder: Vec3; readonly upperArm: Vec3; readonly lowerArm: Vec3 } => {
    const sign = side === "left" ? 1 : -1;
    if (!stroke) {
      return {
        shoulder: { x: 0, y: 0, z: -4 * sign },
        upperArm: { x: 4, y: 0, z: -62 * sign },
        lowerArm: { x: 0, y: 0, z: -12 * sign },
      };
    }

    const { root, mid, tip } = decomposeLimbPolyline(stroke.points, landmarks.neck, aspect);
    const ua2dU = mid.u - root.u;
    const ua2dV = mid.v - root.v;
    const fa2dU = tip.u - mid.u;
    const fa2dV = tip.v - mid.v;
    const expectedUa = headUnit * 1.25;
    const expectedFa = headUnit * 1.15;

    const uaDz = Math.sqrt(Math.max(0, expectedUa * expectedUa - (ua2dU * ua2dU + ua2dV * ua2dV)));
    const faDz = Math.sqrt(Math.max(0, expectedFa * expectedFa - (fa2dU * fa2dU + fa2dV * fa2dV)));
    const reachingInward = fa2dU * sign < 0;
    const uaForwardZ = reachingInward ? uaDz * 0.85 : uaDz * 0.55;
    const faForwardZ = reachingInward ? faDz : faDz * 0.65;

    const elevationDeg = Math.atan2(ua2dV, Math.max(0.02, ua2dU * sign)) * RAD_TO_DEG;
    const forwardSwingDeg = Math.atan2(uaForwardZ, Math.max(0.04, Math.hypot(ua2dU, ua2dV))) * RAD_TO_DEG;
    const elbowBendDeg = vectorAngleDeg(
      { x: ua2dU, y: ua2dV, z: uaForwardZ },
      { x: fa2dU, y: fa2dV, z: faForwardZ },
    );

    const shoulderZ = clampNumber(elevationDeg * 0.22 * sign, -32, 32);
    const shoulderY = clampNumber(-forwardSwingDeg * 0.25 * sign, -28, 28);

    return {
      shoulder: { x: 0, y: shoulderY, z: shoulderZ },
      upperArm: {
        x: clampNumber((fa2dV / Math.max(0.04, expectedFa)) * 42, -90, 90),
        y: -forwardSwingDeg * sign,
        z: (elevationDeg - shoulderZ * sign) * sign,
      },
      lowerArm: {
        x: clampNumber((fa2dU / Math.max(0.04, expectedFa)) * -25 * sign, -65, 65),
        y: 0,
        z: -clampNumber(elbowBendDeg, 0, 148) * sign,
      },
    };
  };

  const solveLegSide = (
    side: "left" | "right",
    stroke: SketchStroke2D | undefined,
  ): { readonly upperLeg: Vec3; readonly lowerLeg: Vec3 } => {
    const sign = side === "left" ? 1 : -1;
    if (!stroke) {
      return { upperLeg: { x: -4, y: 0, z: 3 * sign }, lowerLeg: { x: 6, y: 0, z: 0 } };
    }
    const { root, mid, tip } = decomposeLimbPolyline(stroke.points, landmarks.pelvis, aspect);
    const th2dU = mid.u - root.u;
    const th2dV = mid.v - root.v;
    const sh2dU = tip.u - mid.u;
    const sh2dV = tip.v - mid.v;
    const expectedThigh = headUnit * 1.75;
    const expectedShin = headUnit * 1.65;

    const thDz = Math.sqrt(Math.max(0, expectedThigh * expectedThigh - (th2dU * th2dU + th2dV * th2dV)));
    const shDz = -Math.sqrt(Math.max(0, expectedShin * expectedShin - (sh2dU * sh2dU + sh2dV * sh2dV))) * 0.55;

    return {
      upperLeg: {
        x: -Math.atan2(thDz + Math.max(0, th2dV), Math.max(0.04, -th2dV)) * RAD_TO_DEG,
        y: clampNumber((th2dU / headUnit) * 14, -35, 35),
        z: Math.atan2(th2dU, Math.max(0.05, Math.abs(th2dV))) * RAD_TO_DEG * 0.75,
      },
      lowerLeg: {
        x: vectorAngleDeg({ x: th2dU, y: th2dV, z: thDz }, { x: sh2dU, y: sh2dV, z: shDz }),
        y: 0,
        z: clampNumber((sh2dU - th2dU) * 8 * sign, -10, 10),
      },
    };
  };

  const leftArm = solveArmSide("left", leftArmStroke);
  const rightArm = solveArmSide("right", rightArmStroke);
  const leftLeg = solveLegSide("left", leftLegStroke);
  const rightLeg = solveLegSide("right", rightLegStroke);

  const rawByBone: Record<SketchVrmBoneName, Vec3> = {
    hips: { x: spinePitchDeg * 0.32, y: spineYawDeg * 0.45, z: spineRollDeg * 0.35 },
    spine: { x: spinePitchDeg * 0.68, y: spineYawDeg * 0.55, z: spineRollDeg * 0.65 },
    head: { x: headPitchDeg, y: headYawDeg, z: headRollDeg },
    leftShoulder: leftArm.shoulder,
    rightShoulder: rightArm.shoulder,
    leftUpperArm: leftArm.upperArm,
    rightUpperArm: rightArm.upperArm,
    leftLowerArm: leftArm.lowerArm,
    rightLowerArm: rightArm.lowerArm,
    leftUpperLeg: leftLeg.upperLeg,
    rightUpperLeg: rightLeg.upperLeg,
    leftLowerLeg: leftLeg.lowerLeg,
    rightLowerLeg: rightLeg.lowerLeg,
  };

  const bones = {} as Record<SketchVrmBoneName, SolvedVrmBoneTransform>;
  const clampEvents: JointClampEvent[] = [];
  for (const boneName of SKETCH_VRM_BONE_NAMES) {
    const clamped = clampVrmHumanoidBone(boneName, rawByBone[boneName]);
    bones[boneName] = clamped.transform;
    clampEvents.push(...clamped.events);
  }

  const limbHits =
    (leftArmStroke ? 1 : 0) +
    (rightArmStroke ? 1 : 0) +
    (leftLegStroke ? 1 : 0) +
    (rightLegStroke ? 1 : 0);
  const confidence = clampNumber(
    0.15 + (hasHead ? 0.25 : 0) + (hasSpine ? 0.22 : 0) + limbHits * 0.095 + (hasLegs ? 0 : 0.02),
    0.15,
    0.98,
  );

  return { bones, clampEvents, landmarks, confidence: roundTo(confidence, 2) };
}
