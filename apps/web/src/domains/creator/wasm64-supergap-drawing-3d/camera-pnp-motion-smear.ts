/**
 * Super-Gap Pillar B (#7 & #8):
 * 7) 2D Rough Vanishing Guides → 3D Camera PnP Perspective Solver (`solveCameraFromVanishingGuides`)
 *    - 2점·3점 러프 투시 가이드 선 쌍으로부터 소실점(VP)을 최소제곱 교차 추정하고,
 *      직교 소실점 제약(`v1·v2 + f² = 0`)과 직교 정규 회전행렬 복원으로
 *      카메라 pitch/yaw/roll · 수평선(horizon) · 35mm 환산 초점거리(24~135mm)를 <1ms 내 해법한다.
 * 8) 3D Bone Motion-Vector Smear Frame & Radial Speedline Synthesizer
 *    (`synthesizeMotionSmearAndSpeedlines`)
 *    - 이전→현재 스켈레톤 관절 속도로부터 스미어 프레임 압출 쿼드(smear extrusion quads)와
 *      타격 중심 방사 집중선(impact radial speedlines)을 ₩0 로컬로 합성한다.
 */

import type { Point2D } from "./curved-msdf-sfx";
import type { Vec3Tuple } from "./sh-3dgs-relight-weather";

// ---------------------------------------------------------------------------
// #7. 2D Rough Vanishing Guides -> 3D Camera PnP Perspective Solver
// ---------------------------------------------------------------------------

export interface PerspectiveGuideLine {
  readonly id?: string;
  readonly start: Point2D;
  readonly end: Point2D;
  readonly weight?: number;
}

export interface VanishingPointEstimate {
  readonly point: Point2D;
  readonly isAtInfinity: boolean;
  readonly direction: Point2D;
  readonly meanResidualPx: number;
  readonly lineCount: number;
}

export interface VanishingGuideCameraInput {
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly principalPoint?: Point2D;
  readonly xAxisGuides: readonly PerspectiveGuideLine[];
  readonly zAxisGuides: readonly PerspectiveGuideLine[];
  readonly yAxisGuides?: readonly PerspectiveGuideLine[];
  readonly minFocalLength35mm?: number;
  readonly maxFocalLength35mm?: number;
}

export interface HorizonLineSolution {
  /** 정규화 직선 방정식 a*x + b*y + c = 0 */
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly yAtLeft: number;
  readonly yAtCenter: number;
  readonly yAtRight: number;
  readonly tiltDeg: number;
}

export interface SolvedPerspectiveCamera {
  readonly perspectiveMode: "2-point" | "3-point";
  readonly principalPoint: Point2D;
  readonly vanishingPointX: VanishingPointEstimate;
  readonly vanishingPointZ: VanishingPointEstimate;
  readonly vanishingPointY: VanishingPointEstimate | null;
  readonly focalLengthPx: number;
  readonly rawFocalLength35mm: number;
  readonly focalLength35mm: number;
  readonly horizontalFovDeg: number;
  readonly verticalFovDeg: number;
  readonly yawRad: number;
  readonly pitchRad: number;
  readonly rollRad: number;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly rollDeg: number;
  readonly horizon: HorizonLineSolution;
  /** 월드→카메라 3x3 회전행렬 (열: 월드 X/Y/Z 축의 카메라 공간 단위벡터) */
  readonly rotationWorldToCamera: readonly [Vec3Tuple, Vec3Tuple, Vec3Tuple];
  readonly cameraForwardWorld: Vec3Tuple;
  readonly meanGuideResidualPx: number;
  readonly solveTimeMs: number;
}

const RAD_TO_DEG = 180 / Math.PI;

function clampRange(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function normalize3(v: Vec3Tuple): Vec3Tuple {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len <= 1e-10) return [0, 0, -1];
  return [v[0] / len, v[1] / len, v[2] / len];
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

/**
 * 2개 이상의 러프 2D 투시 가이드 선으로부터 가중 최소제곱 소실점(VP)을 추정한다.
 */
export function estimateVanishingPointFromLines(
  lines: readonly PerspectiveGuideLine[],
): VanishingPointEstimate {
  if (lines.length === 0) {
    return {
      point: { x: 0, y: 0 },
      isAtInfinity: true,
      direction: { x: 1, y: 0 },
      meanResidualPx: 0,
      lineCount: 0,
    };
  }

  let sAA = 0;
  let sAB = 0;
  let sBB = 0;
  let sAC = 0;
  let sBC = 0;
  let sumDirX = 0;
  let sumDirY = 0;
  let refDirX = 0;
  let refDirY = 0;

  interface NormLine {
    readonly a: number;
    readonly b: number;
    readonly c: number;
  }
  const normLines: NormLine[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const ln = lines[i];
    const dx = ln.end.x - ln.start.x;
    const dy = ln.end.y - ln.start.y;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-6) continue;

    const ux = dx / len;
    const uy = dy / len;
    if (normLines.length === 0) {
      refDirX = ux;
      refDirY = uy;
    }
    const alignSign = ux * refDirX + uy * refDirY >= 0 ? 1 : -1;
    sumDirX += ux * alignSign;
    sumDirY += uy * alignSign;

    // 단위 법선 (a, b) with a*x + b*y + c = 0
    const a = -uy;
    const b = ux;
    const c = -(a * ln.start.x + b * ln.start.y);
    const w = Math.max(0.05, ln.weight ?? 1) * Math.sqrt(len);
    sAA += w * a * a;
    sAB += w * a * b;
    sBB += w * b * b;
    sAC += w * a * c;
    sBC += w * b * c;
    normLines.push({ a, b, c });
  }

  const dirLen = Math.hypot(sumDirX, sumDirY);
  const avgDir: Point2D = dirLen > 1e-6 ? { x: sumDirX / dirLen, y: sumDirY / dirLen } : { x: 1, y: 0 };
  const det = sAA * sBB - sAB * sAB;
  const trace = sAA + sBB;

  if (normLines.length < 2 || trace <= 1e-12 || Math.abs(det) / (trace * trace) < 1e-7) {
    return {
      point: { x: avgDir.x * 1e6, y: avgDir.y * 1e6 },
      isAtInfinity: true,
      direction: avgDir,
      meanResidualPx: 0,
      lineCount: normLines.length,
    };
  }

  // [sAA sAB; sAB sBB] * [vx; vy] = [-sAC; -sBC]
  const vx = (-sAC * sBB + sBC * sAB) / det;
  const vy = (-sAA * sBC + sAB * sAC) / det;
  const isVeryFar = Math.hypot(vx, vy) > 5e5;

  let residualSum = 0;
  for (let i = 0; i < normLines.length; i += 1) {
    const nl = normLines[i];
    residualSum += Math.abs(nl.a * vx + nl.b * vy + nl.c);
  }

  return {
    point: { x: vx, y: vy },
    isAtInfinity: isVeryFar,
    direction: avgDir,
    meanResidualPx: normLines.length > 0 ? residualSum / normLines.length : 0,
    lineCount: normLines.length,
  };
}

function backProjectVanishingRay(
  vp: VanishingPointEstimate,
  cx: number,
  cy: number,
  focalPx: number,
): Vec3Tuple {
  if (vp.isAtInfinity) {
    return normalize3([vp.direction.x, -vp.direction.y, 0]);
  }
  return normalize3([vp.point.x - cx, -(vp.point.y - cy), -focalPx]);
}

/**
 * 2점/3점 2D 투시 가이드 선으로부터 3D 카메라 intrinsics(35mm 24~135mm) 및
 * extrinsics(yaw/pitch/roll/horizon)를 <1ms 내 PnP 기하 해법으로 복원한다.
 */
export function solveCameraFromVanishingGuides(
  input: VanishingGuideCameraInput,
): SolvedPerspectiveCamera {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const width = Math.max(16, input.imageWidth);
  const height = Math.max(16, input.imageHeight);
  const minMm = Math.max(12, input.minFocalLength35mm ?? 24);
  const maxMm = Math.max(minMm, input.maxFocalLength35mm ?? 135);
  const cx = input.principalPoint ? input.principalPoint.x : width * 0.5;
  const cy = input.principalPoint ? input.principalPoint.y : height * 0.5;

  const vpX = estimateVanishingPointFromLines(input.xAxisGuides);
  const vpZ = estimateVanishingPointFromLines(input.zAxisGuides);
  const vpYRaw =
    input.yAxisGuides && input.yAxisGuides.length >= 2
      ? estimateVanishingPointFromLines(input.yAxisGuides)
      : null;
  const hasFiniteVpY = vpYRaw !== null && !vpYRaw.isAtInfinity;
  const perspectiveMode: "2-point" | "3-point" = hasFiniteVpY ? "3-point" : "2-point";

  // 직교 소실점 쌍에서 f² = -((vx1-cx)(vx2-cx) + (vy1-cy)(vy2-cy)) 산출
  const focalSqCandidates: number[] = [];
  const tryPair = (a: VanishingPointEstimate | null, b: VanishingPointEstimate | null): void => {
    if (!a || !b || a.isAtInfinity || b.isAtInfinity) return;
    const negDot =
      -((a.point.x - cx) * (b.point.x - cx) + (a.point.y - cy) * (b.point.y - cy));
    if (negDot > 100) {
      focalSqCandidates.push(negDot);
    }
  };
  tryPair(vpX, vpZ);
  if (hasFiniteVpY) {
    tryPair(vpX, vpYRaw);
    tryPair(vpZ, vpYRaw);
  }

  const defaultFocalPx = (50 / 36) * width;
  let rawFocalPx = defaultFocalPx;
  if (focalSqCandidates.length > 0) {
    let sumF = 0;
    for (let i = 0; i < focalSqCandidates.length; i += 1) {
      sumF += Math.sqrt(focalSqCandidates[i]);
    }
    rawFocalPx = sumF / focalSqCandidates.length;
  }

  const rawFocalLength35mm = (rawFocalPx / width) * 36;
  const focalLength35mm = clampRange(rawFocalLength35mm, minMm, maxMm);
  const focalLengthPx = (focalLength35mm / 36) * width;

  // 3축 직교 정규 회전행렬 R_wc = [rX, rY, rZ] 복원
  let rX = backProjectVanishingRay(vpX, cx, cy, focalLengthPx);
  if (rX[0] < 0) {
    rX = [-rX[0], -rX[1], -rX[2]];
  }

  const rZRaw = backProjectVanishingRay(vpZ, cx, cy, focalLengthPx);
  // Gram-Schmidt 직교화 (rZ를 rX에 직교 투영)
  const projXZ = dot3(rZRaw, rX);
  let rZ = normalize3([
    rZRaw[0] - projXZ * rX[0],
    rZRaw[1] - projXZ * rX[1],
    rZRaw[2] - projXZ * rX[2],
  ]);

  let rY: Vec3Tuple;
  if (hasFiniteVpY && vpYRaw) {
    let yCand = backProjectVanishingRay(vpYRaw, cx, cy, focalLengthPx);
    if (yCand[1] < 0) {
      yCand = [-yCand[0], -yCand[1], -yCand[2]];
    }
    const yCross = normalize3(cross3(rZ, rX));
    const yAlign = dot3(yCand, yCross) >= 0 ? yCross : ([-yCross[0], -yCross[1], -yCross[2]] as Vec3Tuple);
    // 측정된 수직 소실점과 X×Z 교차축을 혼합 후 재직교화
    rY = normalize3([
      yCand[0] * 0.5 + yAlign[0] * 0.5,
      yCand[1] * 0.5 + yAlign[1] * 0.5,
      yCand[2] * 0.5 + yAlign[2] * 0.5,
    ]);
  } else {
    rY = normalize3(cross3(rZ, rX));
    if (rY[1] < 0) {
      rY = [-rY[0], -rY[1], -rY[2]];
    }
  }

  // 오른손 좌표계 보장: rZ = normalize(cross(rX, rY))
  rZ = normalize3(cross3(rX, rY));
  if (rZ[2] < 0) {
    // 카메라가 -Z 방향(전방)을 바라볼 때 월드 +Z는 카메라 뒤쪽(+z_cam)이 되도록 부호 정규화
    rZ = [-rZ[0], -rZ[1], -rZ[2]];
    rX = normalize3(cross3(rY, rZ));
  }

  const cameraForwardWorld: Vec3Tuple = normalize3([-rX[2], -rY[2], -rZ[2]]);
  const pitchRad = Math.asin(clampRange(cameraForwardWorld[1], -1, 1));
  const yawRad = Math.atan2(cameraForwardWorld[0], -cameraForwardWorld[2]);
  const rollRad = Math.atan2(rY[0], Math.max(1e-6, Math.abs(rY[1])) * (rY[1] >= 0 ? 1 : -1));

  // 수평선 방정식: dot([x - cx, -(y - cy), -f], rY) = 0
  // => rY[0]*x - rY[1]*y + (-rY[0]*cx + rY[1]*cy - rY[2]*f) = 0
  const rawA = rY[0];
  const rawB = -rY[1];
  const rawC = -rY[0] * cx + rY[1] * cy - rY[2] * focalLengthPx;
  const lineNorm = Math.max(1e-8, Math.hypot(rawA, rawB));
  const hA = rawA / lineNorm;
  const hB = rawB / lineNorm;
  const hC = rawC / lineNorm;

  const evalHorizonY = (x: number): number =>
    Math.abs(hB) > 1e-6 ? -(hA * x + hC) / hB : cy;
  const yAtLeft = evalHorizonY(0);
  const yAtCenter = evalHorizonY(cx);
  const yAtRight = evalHorizonY(width);
  const tiltDeg = Math.atan2(yAtRight - yAtLeft, width) * RAD_TO_DEG;

  const horizontalFovDeg = 2 * Math.atan(width / (2 * focalLengthPx)) * RAD_TO_DEG;
  const verticalFovDeg = 2 * Math.atan(height / (2 * focalLengthPx)) * RAD_TO_DEG;

  const residuals = [vpX.meanResidualPx, vpZ.meanResidualPx];
  if (vpYRaw) residuals.push(vpYRaw.meanResidualPx);
  let resSum = 0;
  for (let i = 0; i < residuals.length; i += 1) {
    resSum += residuals[i];
  }

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    perspectiveMode,
    principalPoint: { x: cx, y: cy },
    vanishingPointX: vpX,
    vanishingPointZ: vpZ,
    vanishingPointY: vpYRaw,
    focalLengthPx,
    rawFocalLength35mm,
    focalLength35mm,
    horizontalFovDeg,
    verticalFovDeg,
    yawRad,
    pitchRad,
    rollRad,
    yawDeg: yawRad * RAD_TO_DEG,
    pitchDeg: pitchRad * RAD_TO_DEG,
    rollDeg: rollRad * RAD_TO_DEG,
    horizon: {
      a: hA,
      b: hB,
      c: hC,
      yAtLeft,
      yAtCenter,
      yAtRight,
      tiltDeg,
    },
    rotationWorldToCamera: [rX, rY, rZ],
    cameraForwardWorld,
    meanGuideResidualPx: resSum / residuals.length,
    solveTimeMs: Math.max(0, t1 - t0),
  };
}

// ---------------------------------------------------------------------------
// #8. 3D Bone Motion-Vector Smear Frame & Radial Speedline Synthesizer
// ---------------------------------------------------------------------------

export interface SkeletonBoneSample {
  readonly boneId: string;
  readonly parentId?: string;
  readonly worldPos: Vec3Tuple;
  readonly screenPos: Point2D;
  readonly radiusPx: number;
  readonly importance?: number;
}

export interface MotionSmearSynthesisInput {
  readonly previousPose: readonly SkeletonBoneSample[];
  readonly currentPose: readonly SkeletonBoneSample[];
  readonly deltaTimeSec: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly smearSpeedThresholdPxPerSec?: number;
  readonly smearArcSubdivisions?: number;
  readonly speedlineCount?: number;
  readonly focusOverride?: Point2D;
  readonly seed?: number;
}

export interface BoneMotionVector {
  readonly boneId: string;
  readonly worldVelocity: Vec3Tuple;
  readonly worldSpeedMPerSec: number;
  readonly screenDisplacement: Point2D;
  readonly screenDisplacementPx: number;
  readonly screenVelocity: Point2D;
  readonly screenSpeedPxPerSec: number;
  readonly motionAngleRad: number;
  readonly triggersSmear: boolean;
}

export interface SmearExtrusionQuad {
  readonly boneId: string;
  readonly segmentIndex: number;
  /** [trailLeft, leadLeft, leadRight, trailRight] 4정점 스크린 폴리곤 */
  readonly vertices: readonly [Point2D, Point2D, Point2D, Point2D];
  readonly speedPxPerSec: number;
  readonly motionAngleRad: number;
  readonly leadingOpacity: number;
  readonly trailingOpacity: number;
  readonly streakWidthPx: number;
}

export interface RadialSpeedlineSegment {
  readonly index: number;
  readonly angleRad: number;
  readonly outerPoint: Point2D;
  readonly innerTipPoint: Point2D;
  readonly outerWidthPx: number;
  readonly innerWidthPx: number;
  readonly lengthPx: number;
  readonly opacity: number;
}

export interface MotionSmearSynthesisResult {
  readonly boneVelocities: readonly BoneMotionVector[];
  readonly peakBoneId: string | null;
  readonly peakSpeedPxPerSec: number;
  readonly impactCenter: Point2D;
  readonly smearQuads: readonly SmearExtrusionQuad[];
  readonly speedlines: readonly RadialSpeedlineSegment[];
  readonly actionIntensity01: number;
  readonly elapsedMs: number;
}

function hashUnit(index: number, salt: number, seed: number): number {
  let n = Math.imul(index + 11, 374761393) + Math.imul(salt + 3, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967295;
}

function rayToCanvasEdgeDistance(
  origin: Point2D,
  dirX: number,
  dirY: number,
  width: number,
  height: number,
): number {
  let bestT = Math.hypot(width, height);
  if (Math.abs(dirX) > 1e-6) {
    const tRight = (width - origin.x) / dirX;
    const tLeft = (0 - origin.x) / dirX;
    if (tRight > 0 && tRight < bestT) bestT = tRight;
    if (tLeft > 0 && tLeft < bestT) bestT = tLeft;
  }
  if (Math.abs(dirY) > 1e-6) {
    const tBottom = (height - origin.y) / dirY;
    const tTop = (0 - origin.y) / dirY;
    if (tBottom > 0 && tBottom < bestT) bestT = tBottom;
    if (tTop > 0 && tTop < bestT) bestT = tTop;
  }
  return Math.max(12, bestT);
}

/**
 * 3D 본 모션 벡터 기반 스미어 프레임 압출 쿼드 및 방사 집중선 합성.
 */
export function synthesizeMotionSmearAndSpeedlines(
  input: MotionSmearSynthesisInput,
): MotionSmearSynthesisResult {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const dt = Math.max(1e-4, input.deltaTimeSec);
  const threshold = Math.max(20, input.smearSpeedThresholdPxPerSec ?? 320);
  const subdivisions = Math.max(1, Math.min(8, Math.floor(input.smearArcSubdivisions ?? 3)));
  const seed = input.seed ?? 9001;

  const prevById = new Map<string, SkeletonBoneSample>();
  for (let i = 0; i < input.previousPose.length; i += 1) {
    prevById.set(input.previousPose[i].boneId, input.previousPose[i]);
  }
  const currById = new Map<string, SkeletonBoneSample>();
  for (let i = 0; i < input.currentPose.length; i += 1) {
    currById.set(input.currentPose[i].boneId, input.currentPose[i]);
  }

  const boneVelocities: BoneMotionVector[] = [];
  const smearQuads: SmearExtrusionQuad[] = [];
  let peakBoneId: string | null = null;
  let peakSpeed = 0;
  let focusWeightSum = 0;
  let focusSumX = 0;
  let focusSumY = 0;

  for (let i = 0; i < input.currentPose.length; i += 1) {
    const curr = input.currentPose[i];
    const prev = prevById.get(curr.boneId);
    if (!prev) continue;

    const wVx = (curr.worldPos[0] - prev.worldPos[0]) / dt;
    const wVy = (curr.worldPos[1] - prev.worldPos[1]) / dt;
    const wVz = (curr.worldPos[2] - prev.worldPos[2]) / dt;
    const worldSpeed = Math.hypot(wVx, wVy, wVz);

    const sDx = curr.screenPos.x - prev.screenPos.x;
    const sDy = curr.screenPos.y - prev.screenPos.y;
    const dispPx = Math.hypot(sDx, sDy);
    const sVx = sDx / dt;
    const sVy = sDy / dt;
    const screenSpeed = dispPx / dt;
    const angle = Math.atan2(sDy, sDx);
    const triggersSmear = screenSpeed >= threshold && dispPx >= 4;

    boneVelocities.push({
      boneId: curr.boneId,
      worldVelocity: [wVx, wVy, wVz],
      worldSpeedMPerSec: worldSpeed,
      screenDisplacement: { x: sDx, y: sDy },
      screenDisplacementPx: dispPx,
      screenVelocity: { x: sVx, y: sVy },
      screenSpeedPxPerSec: screenSpeed,
      motionAngleRad: angle,
      triggersSmear,
    });

    const importance = Math.max(0.1, curr.importance ?? 1);
    const wFocus = screenSpeed * screenSpeed * importance;
    focusWeightSum += wFocus;
    focusSumX += curr.screenPos.x * wFocus;
    focusSumY += curr.screenPos.y * wFocus;

    if (screenSpeed > peakSpeed) {
      peakSpeed = screenSpeed;
      peakBoneId = curr.boneId;
    }

    if (!triggersSmear) continue;

    // 부모 관절이 있으면 호(arc) 궤적 곡률을 근사하고, 없으면 직선 스미어 세그먼트를 생성한다.
    const parentCurr = curr.parentId ? currById.get(curr.parentId) : undefined;
    const midControl: Point2D = parentCurr
      ? (() => {
          const midX = 0.5 * (prev.screenPos.x + curr.screenPos.x);
          const midY = 0.5 * (prev.screenPos.y + curr.screenPos.y);
          const armPrev = Math.hypot(
            prev.screenPos.x - parentCurr.screenPos.x,
            prev.screenPos.y - parentCurr.screenPos.y,
          );
          const armCurr = Math.hypot(
            curr.screenPos.x - parentCurr.screenPos.x,
            curr.screenPos.y - parentCurr.screenPos.y,
          );
          const targetR = 0.5 * (armPrev + armCurr);
          const midDist = Math.hypot(midX - parentCurr.screenPos.x, midY - parentCurr.screenPos.y);
          if (midDist <= 1e-4 || targetR <= midDist) {
            return { x: midX, y: midY };
          }
          const scale = targetR / midDist;
          return {
            x: parentCurr.screenPos.x + (midX - parentCurr.screenPos.x) * scale,
            y: parentCurr.screenPos.y + (midY - parentCurr.screenPos.y) * scale,
          };
        })()
      : {
          x: 0.5 * (prev.screenPos.x + curr.screenPos.x),
          y: 0.5 * (prev.screenPos.y + curr.screenPos.y),
        };

    const evalArc = (u: number): Point2D => {
      const inv = 1 - u;
      return {
        x: inv * inv * prev.screenPos.x + 2 * inv * u * midControl.x + u * u * curr.screenPos.x,
        y: inv * inv * prev.screenPos.y + 2 * inv * u * midControl.y + u * u * curr.screenPos.y,
      };
    };

    const baseRad = Math.max(2, curr.radiusPx);
    const speedFactor = clampRange((screenSpeed - threshold) / (threshold * 2.5), 0.15, 1);

    for (let seg = 0; seg < subdivisions; seg += 1) {
      const u0 = seg / subdivisions;
      const u1 = (seg + 1) / subdivisions;
      const p0 = evalArc(u0);
      const p1 = evalArc(u1);
      const segDx = p1.x - p0.x;
      const segDy = p1.y - p0.y;
      const segLen = Math.max(1e-4, Math.hypot(segDx, segDy));
      const perpX = -segDy / segLen;
      const perpY = segDx / segLen;

      // 꼬리는 가늘고 투명하게, 선단은 본 반지름에 맞춰 선명하게 테이퍼링한다.
      const r0 = baseRad * (0.42 + 0.58 * u0);
      const r1 = baseRad * (0.42 + 0.58 * u1);
      const leadOpacity = clampRange((0.28 + 0.62 * u1) * (0.5 + 0.5 * speedFactor), 0.1, 0.95);
      const trailOpacity = clampRange((0.06 + 0.45 * u0) * (0.5 + 0.5 * speedFactor), 0.02, leadOpacity);

      smearQuads.push({
        boneId: curr.boneId,
        segmentIndex: seg,
        vertices: [
          { x: p0.x + perpX * r0, y: p0.y + perpY * r0 },
          { x: p1.x + perpX * r1, y: p1.y + perpY * r1 },
          { x: p1.x - perpX * r1, y: p1.y - perpY * r1 },
          { x: p0.x - perpX * r0, y: p0.y - perpY * r0 },
        ],
        speedPxPerSec: screenSpeed,
        motionAngleRad: Math.atan2(segDy, segDx),
        leadingOpacity: leadOpacity,
        trailingOpacity: trailOpacity,
        streakWidthPx: r0 + r1,
      });
    }
  }

  const impactCenter: Point2D = input.focusOverride
    ? input.focusOverride
    : focusWeightSum > 1e-6
      ? { x: focusSumX / focusWeightSum, y: focusSumY / focusWeightSum }
      : { x: input.canvasWidth * 0.5, y: input.canvasHeight * 0.5 };

  const actionIntensity01 = clampRange(peakSpeed / (threshold * 3.0), 0, 1);
  const requestedLines = Math.max(0, Math.floor(input.speedlineCount ?? 48));
  const activeLineCount =
    actionIntensity01 < 0.08
      ? 0
      : Math.max(12, Math.round(requestedLines * (0.35 + 0.65 * actionIntensity01)));

  const speedlines: RadialSpeedlineSegment[] = [];
  const baseSafeRadius = Math.min(input.canvasWidth, input.canvasHeight) * (0.24 - 0.08 * actionIntensity01);

  for (let i = 0; i < activeLineCount; i += 1) {
    const jitterAngle = (hashUnit(i, 1, seed) - 0.5) * ((2 * Math.PI) / Math.max(8, activeLineCount)) * 0.72;
    const angle = (i / activeLineCount) * Math.PI * 2 + jitterAngle;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    const edgeDist = rayToCanvasEdgeDistance(
      impactCenter,
      dirX,
      dirY,
      input.canvasWidth,
      input.canvasHeight,
    );
    const innerJitter = 0.72 + hashUnit(i, 2, seed) * 0.62;
    const innerDist = Math.min(edgeDist * 0.78, Math.max(24, baseSafeRadius * innerJitter));
    const outerDist = edgeDist * (1.02 + hashUnit(i, 3, seed) * 0.08);
    const lengthPx = Math.max(8, outerDist - innerDist);

    const outerWidthPx = (1.6 + hashUnit(i, 4, seed) * 3.8) * (0.6 + 0.6 * actionIntensity01);
    const opacity = clampRange((0.35 + hashUnit(i, 5, seed) * 0.55) * (0.45 + 0.55 * actionIntensity01), 0.15, 0.98);

    speedlines.push({
      index: i,
      angleRad: angle,
      outerPoint: {
        x: impactCenter.x + dirX * outerDist,
        y: impactCenter.y + dirY * outerDist,
      },
      innerTipPoint: {
        x: impactCenter.x + dirX * innerDist,
        y: impactCenter.y + dirY * innerDist,
      },
      outerWidthPx,
      innerWidthPx: 0.25,
      lengthPx,
      opacity,
    });
  }

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    boneVelocities,
    peakBoneId,
    peakSpeedPxPerSec: peakSpeed,
    impactCenter,
    smearQuads,
    speedlines,
    actionIntensity01,
    elapsedMs: Math.max(0, t1 - t0),
  };
}
