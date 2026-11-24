/**
 * 2D 러프 스케치 -> 3D VRM 휴머노이드 포즈 · 카메라 화각(24~85mm) · 3점 조명(Key/Fill/Rim) 동시 역산 엔진.
 * 2점 투시 소실점 포토그래메트리 + 그림자 빗금 무게중심 반대편 광원 역산 + 포즈 솔버 통합 오케스트레이션.
 */

import {
  clampNumber,
  clampVrmHumanoidBone,
  DEFAULT_ASPECT_RATIO,
  DEG_TO_RAD,
  detectBodyLandmarks,
  EPSILON,
  eulerDegToQuaternion,
  fromIso,
  normalizeCanvasPoint,
  RAD_TO_DEG,
  roundTo,
  SKETCH_VRM_BONE_NAMES,
  solvePoseFromSketch,
  toIso,
  VRM_BIOMECHANICAL_LIMITS_DEG,
  type IsoPoint,
} from "./sketch-to-3d-stage-pose";
import { getSketchStagePreset, SKETCH_STAGE_PRESETS } from "./sketch-to-3d-stage-presets";
import type {
  CameraAngleCategory,
  CameraShotCategory,
  DetectedBodyLandmarks,
  LightingMoodCategory,
  SketchPoint2D,
  SketchStageDocument,
  SketchStroke2D,
  SketchTo3dStageResult,
  SolvedCameraStage,
  SolvedLightSource,
  SolvedThreePointLighting,
  StandardLensFocalMm,
  ThreePointLightRole,
} from "./sketch-to-3d-stage-types";

export {
  clampVrmHumanoidBone,
  eulerDegToQuaternion,
  getSketchStagePreset,
  normalizeCanvasPoint,
  SKETCH_STAGE_PRESETS,
  SKETCH_VRM_BONE_NAMES,
  solvePoseFromSketch,
  VRM_BIOMECHANICAL_LIMITS_DEG,
};
export type * from "./sketch-to-3d-stage-types";

const FULL_FRAME_SENSOR_WIDTH_MM = 36;
const STANDARD_HEAD_HEIGHT_METERS = 0.23;

export const STANDARD_LENS_FOCAL_MM: readonly StandardLensFocalMm[] = Object.freeze([24, 35, 50, 85]);

interface Line2D {
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

function wrapDeg180(deg: number): number {
  let wrapped = (((deg + 180) % 360) + 360) % 360 - 180;
  if (wrapped <= -180) wrapped += 360;
  return wrapped;
}

/** 2D 스트로크 포인트에 Total Least Squares 직선(a*u + b*v + c = 0)을 피팅한다. */
function fitLineIso(points: readonly SketchPoint2D[], aspect: number): Line2D | null {
  if (points.length < 2) return null;
  const iso = points.map((p) => toIso(p, aspect));
  let mu = 0;
  let mv = 0;
  for (const p of iso) {
    mu += p.u;
    mv += p.v;
  }
  mu /= iso.length;
  mv /= iso.length;

  let suu = 0;
  let svv = 0;
  let suv = 0;
  for (const p of iso) {
    const du = p.u - mu;
    const dv = p.v - mv;
    suu += du * du;
    svv += dv * dv;
    suv += du * dv;
  }
  if (suu + svv < EPSILON) return null;

  const angleRad = 0.5 * Math.atan2(2 * suv, suu - svv);
  const a = -Math.sin(angleRad);
  const b = Math.cos(angleRad);
  const c = -(a * mu + b * mv);
  return { a, b, c };
}

/** 소실선 쌍(2개 이상 직선)의 가중 교점(소실점)과 평균 수렴각을 계산한다. */
function estimateVanishingPoint(
  strokes: readonly SketchStroke2D[],
  aspect: number,
): { readonly vp: IsoPoint | null; readonly convergenceDeg: number } {
  const lines = strokes
    .map((s) => fitLineIso(s.points, aspect))
    .filter((l): l is Line2D => l !== null);
  if (lines.length < 2) return { vp: null, convergenceDeg: 0 };

  let sumW = 0;
  let sumU = 0;
  let sumV = 0;
  let sumAngleDeg = 0;
  let pairCount = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const l1 = lines[i];
    if (!l1) continue;
    for (let j = i + 1; j < lines.length; j += 1) {
      const l2 = lines[j];
      if (!l2) continue;
      const det = l1.a * l2.b - l2.a * l1.b;
      const absDet = Math.abs(det);
      sumAngleDeg += Math.asin(clampNumber(absDet, 0, 1)) * RAD_TO_DEG;
      pairCount += 1;
      if (absDet < 1e-4) continue;

      const u = (l1.b * l2.c - l2.b * l1.c) / det;
      const v = (l1.c * l2.a - l2.c * l1.a) / det;
      if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
      const weight = absDet * absDet;
      sumW += weight;
      sumU += u * weight;
      sumV += v * weight;
    }
  }

  const convergenceDeg = pairCount > 0 ? sumAngleDeg / pairCount : 0;
  if (sumW <= EPSILON) return { vp: null, convergenceDeg };
  return { vp: { u: sumU / sumW, v: sumV / sumW }, convergenceDeg };
}

function snapToStandardFocalMm(estimatedMm: number): StandardLensFocalMm {
  const safe = clampNumber(estimatedMm, 14, 150);
  let best: StandardLensFocalMm = 50;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const candidate of STANDARD_LENS_FOCAL_MM) {
    const dist = Math.abs(Math.log(safe) - Math.log(candidate));
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

/** ② 소실선 2쌍의 수렴각·직교 소실점 제약으로 카메라 화각(24~85mm)·앙각/부감·Yaw·프레이밍 거리를 역산한다. */
export function solveCameraFromSketch(
  doc: SketchStageDocument,
  landmarks?: DetectedBodyLandmarks,
  hasLegsOverride?: boolean,
): SolvedCameraStage {
  const aspect = doc.aspectRatio && doc.aspectRatio > 0.2 ? doc.aspectRatio : DEFAULT_ASPECT_RATIO;
  const detected = landmarks
    ? { landmarks, hasLegs: hasLegsOverride ?? true }
    : detectBodyLandmarks(doc.strokes, aspect);
  const body = detected.landmarks;

  const pairA = doc.strokes.filter((s) => s.kind === "vanishingPairA" && s.points.length >= 2);
  const pairB = doc.strokes.filter((s) => s.kind === "vanishingPairB" && s.points.length >= 2);
  const resA = estimateVanishingPoint(pairA, aspect);
  const resB = estimateVanishingPoint(pairB, aspect);

  const sensorH = FULL_FRAME_SENSOR_WIDTH_MM / aspect;
  const convergenceAngleDeg =
    resA.convergenceDeg > 0 && resB.convergenceDeg > 0
      ? (resA.convergenceDeg + resB.convergenceDeg) * 0.5
      : Math.max(resA.convergenceDeg, resB.convergenceDeg);

  let fNorm = 50 / sensorH;
  let horizonV = 0;
  let rollDeg = 0;
  let yawDeg = 0;
  let confidence = 0.25;

  if (resA.vp && resB.vp) {
    // 2점 투시: 지평선은 VP_A-VP_B 직선, 직교 소실점 제약 u_a*u_b + v_a*v_b + f^2 = 0
    const leftVp = resA.vp.u <= resB.vp.u ? resA.vp : resB.vp;
    const rightVp = resA.vp.u <= resB.vp.u ? resB.vp : resA.vp;
    const du = rightVp.u - leftVp.u;
    const dv = rightVp.v - leftVp.v;

    if (Math.abs(du) > EPSILON) {
      rollDeg = clampNumber(Math.atan2(dv, du) * RAD_TO_DEG, -35, 35);
      horizonV = leftVp.v - (dv / du) * leftVp.u;
    } else {
      horizonV = (leftVp.v + rightVp.v) * 0.5;
    }

    const negDot = -(leftVp.u * rightVp.u + leftVp.v * rightVp.v);
    if (negDot > 0.25) {
      fNorm = clampNumber(Math.sqrt(negDot), 18 / sensorH, 120 / sensorH);
      confidence = 0.94;
    } else {
      const convRad = clampNumber(convergenceAngleDeg * DEG_TO_RAD, 0.06, 1.0);
      fNorm = clampNumber(0.85 / Math.tan(convRad * 0.5), 20 / sensorH, 100 / sensorH);
      confidence = 0.72;
    }

    const alphaLeft = Math.atan2(leftVp.u, fNorm) * RAD_TO_DEG;
    const alphaRight = Math.atan2(rightVp.u, fNorm) * RAD_TO_DEG;
    yawDeg = clampNumber((alphaLeft + alphaRight) * 0.5, -65, 65);
  } else if (resA.vp || resB.vp) {
    const singleVp = resA.vp ?? resB.vp;
    if (singleVp) {
      horizonV = singleVp.v;
      const convRad = clampNumber(convergenceAngleDeg * DEG_TO_RAD, 0.06, 1.0);
      fNorm = clampNumber(0.85 / Math.tan(convRad * 0.5), 20 / sensorH, 100 / sensorH);
      yawDeg = clampNumber(Math.atan2(singleVp.u, fNorm) * RAD_TO_DEG, -65, 65);
      confidence = 0.68;
    }
  }

  const estimatedFocalLengthMm = clampNumber(fNorm * sensorH, 18, 120);
  const focalLengthMm = snapToStandardFocalMm(estimatedFocalLengthMm);
  const snappedFNorm = focalLengthMm / sensorH;

  // 지평선이 화면 위(horizonV > 0) -> 카메라가 아래를 내려다보는 부감(High-angle, 음수 pitch)
  const pitchDeg = clampNumber(-Math.atan2(horizonV, fNorm) * RAD_TO_DEG, -60, 60);
  const fovHorizontalDeg = 2 * Math.atan(FULL_FRAME_SENSOR_WIDTH_MM / (2 * focalLengthMm)) * RAD_TO_DEG;
  const fovVerticalDeg = 2 * Math.atan(sensorH / (2 * focalLengthMm)) * RAD_TO_DEG;

  const headDiameterNorm = Math.max(0.04, body.headRadiusNormalized * 2);
  const distanceMeters = clampNumber(
    (STANDARD_HEAD_HEIGHT_METERS * snappedFNorm) / headDiameterNorm,
    0.55,
    18,
  );

  const angleCategory: CameraAngleCategory =
    pitchDeg <= -8 ? "high-angle" : pitchDeg >= 8 ? "low-angle" : "eye-level";

  const shotCategory: CameraShotCategory =
    headDiameterNorm >= 0.42
      ? "extreme-close-up"
      : headDiameterNorm >= 0.24
        ? "close-up"
        : !detected.hasLegs || body.figureHeightNormalized < 0.56
          ? "medium-shot"
          : headDiameterNorm >= 0.1
            ? "full-shot"
            : "wide-shot";

  return {
    focalLengthMm,
    estimatedFocalLengthMm: roundTo(estimatedFocalLengthMm, 2),
    fovHorizontalDeg: roundTo(fovHorizontalDeg, 2),
    fovVerticalDeg: roundTo(fovVerticalDeg, 2),
    pitchDeg: roundTo(pitchDeg, 2),
    yawDeg: roundTo(yawDeg, 2),
    rollDeg: roundTo(rollDeg, 2),
    distanceMeters: roundTo(distanceMeters, 2),
    angleCategory,
    shotCategory,
    horizonYNormalized: roundTo(0.5 - horizonV, 4),
    convergenceAngleDeg: roundTo(convergenceAngleDeg, 2),
    vanishingPointA: resA.vp ? fromIso(resA.vp, aspect) : null,
    vanishingPointB: resB.vp ? fromIso(resB.vp, aspect) : null,
    confidence: roundTo(confidence, 2),
  };
}

function buildLightSource(
  role: ThreePointLightRole,
  azimuthDeg: number,
  elevationDeg: number,
  intensity: number,
  colorTempKelvin: number,
  softness: number,
): SolvedLightSource {
  const az = wrapDeg180(azimuthDeg);
  const el = clampNumber(elevationDeg, -35, 82);
  const azRad = az * DEG_TO_RAD;
  const elRad = el * DEG_TO_RAD;
  const cosEl = Math.cos(elRad);

  return {
    role,
    azimuthDeg: roundTo(az, 1),
    elevationDeg: roundTo(el, 1),
    direction: {
      x: roundTo(Math.sin(azRad) * cosEl, 4),
      y: roundTo(Math.sin(elRad), 4),
      z: roundTo(Math.cos(azRad) * cosEl, 4),
    },
    intensity: roundTo(clampNumber(intensity, 0.1, 2.0), 2),
    colorTempKelvin: Math.round(clampNumber(colorTempKelvin, 3000, 9000)),
    softness: roundTo(clampNumber(softness, 0.05, 1), 2),
  };
}

/** ③ 그림자 빗금 무게중심 반대편으로 주광원 방위각·고도를 역산하고 Key/Fill/Rim 3점 조명을 자동 배치한다. */
export function solveThreePointLightingFromSketch(
  doc: SketchStageDocument,
  landmarks?: DetectedBodyLandmarks,
): SolvedThreePointLighting {
  const aspect = doc.aspectRatio && doc.aspectRatio > 0.2 ? doc.aspectRatio : DEFAULT_ASPECT_RATIO;
  const body = landmarks ?? detectBodyLandmarks(doc.strokes, aspect).landmarks;
  const shadowStrokes = doc.strokes.filter((s) => s.kind === "shadowHatch" && s.points.length >= 2);

  if (shadowStrokes.length === 0) {
    const key = buildLightSource("key", -38, 34, 1.15, 5500, 0.45);
    const fill = buildLightSource("fill", 42, 16, 0.42, 6500, 0.78);
    const rim = buildLightSource("rim", 142, 46, 0.85, 6200, 0.35);
    return {
      key,
      fill,
      rim,
      contrastRatio: roundTo(key.intensity / fill.intensity, 2),
      mood: "rembrandt",
      shadowCentroid: null,
      shadowCoverage: 0,
      frontFaceShadowRatio: 0,
      confidence: 0.25,
    };
  }

  let totalWeight = 0;
  let sumU = 0;
  let sumV = 0;
  let totalSamples = 0;
  let frontFaceOverlapSamples = 0;

  const faceHalfX = Math.max(0.055, (body.headRadiusNormalized / aspect) * 1.15);
  const torsoTopY = body.headCenter.y - body.headRadiusNormalized * 1.05;
  const torsoBottomY = Math.max(body.pelvis.y, body.headCenter.y + body.headRadiusNormalized * 2.5);
  const torsoCenterX = body.characterCenter.x;

  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;

  for (const stroke of shadowStrokes) {
    for (let i = 0; i < stroke.points.length - 1; i += 1) {
      const p0 = stroke.points[i];
      const p1 = stroke.points[i + 1];
      if (!p0 || !p1) continue;
      const iso0 = toIso(p0, aspect);
      const iso1 = toIso(p1, aspect);
      const weight = Math.max(0.005, Math.hypot(iso1.u - iso0.u, iso1.v - iso0.v));
      const steps = 4;
      for (let s = 0; s < steps; s += 1) {
        const t = (s + 0.5) / steps;
        const px = p0.x + (p1.x - p0.x) * t;
        const py = p0.y + (p1.y - p0.y) * t;
        const pu = iso0.u + (iso1.u - iso0.u) * t;
        const pv = iso0.v + (iso1.v - iso0.v) * t;
        const sw = weight / steps;
        sumU += pu * sw;
        sumV += pv * sw;
        totalWeight += sw;
        totalSamples += 1;

        if (pu < minU) minU = pu;
        if (pu > maxU) maxU = pu;
        if (pv < minV) minV = pv;
        if (pv > maxV) maxV = pv;

        if (
          Math.abs(px - torsoCenterX) <= faceHalfX * 1.25 &&
          py >= torsoTopY &&
          py <= torsoBottomY
        ) {
          frontFaceOverlapSamples += 1;
        }
      }
    }
  }

  const shadowIso: IsoPoint =
    totalWeight > EPSILON ? { u: sumU / totalWeight, v: sumV / totalWeight } : toIso(body.characterCenter, aspect);
  const charIso = toIso(body.characterCenter, aspect);

  const shadowSpreadArea = Math.max(0, (maxU - minU) * (maxV - minV));
  const shadowDensity = clampNumber(totalWeight / Math.max(0.18, Math.sqrt(shadowSpreadArea) + 0.15), 0.15, 1);
  const shadowCoverage = clampNumber(shadowSpreadArea / (aspect * 0.42) + shadowStrokes.length * 0.035, 0.05, 1);
  const frontFaceShadowRatio = totalSamples > 0 ? frontFaceOverlapSamples / totalSamples : 0;

  const charScale = Math.max(0.18, body.figureHeightNormalized * 0.55);
  const nx = (shadowIso.u - charIso.u) / charScale;
  const ny = (shadowIso.v - charIso.v) / charScale;

  let lightX = -nx;
  let lightY = -ny;
  let lightZ: number;

  if (frontFaceShadowRatio >= 0.45) {
    const backStrength = clampNumber((frontFaceShadowRatio - 0.45) / 0.55, 0, 1);
    lightZ = -(0.55 + backStrength * 0.9);
    if (Math.hypot(lightX, lightY) < 0.18) {
      lightX = nx >= 0 ? -0.22 : 0.22;
      lightY = 0.58;
    } else if (lightY < 0.25) {
      lightY = 0.48;
    }
  } else {
    lightZ = clampNumber(0.95 - Math.abs(nx) * 0.35, 0.15, 0.95);
  }

  const vecLen = Math.hypot(lightX, lightY, lightZ) || 1;
  const keyAzimuthDeg = Math.atan2(lightX / vecLen, lightZ / vecLen) * RAD_TO_DEG;
  const keyElevationDeg = clampNumber(Math.asin(clampNumber(lightY / vecLen, -1, 1)) * RAD_TO_DEG, -25, 78);

  const isBacklit = Math.abs(keyAzimuthDeg) >= 115;
  const keyIntensity = clampNumber(1.0 + shadowDensity * 0.38 + (isBacklit ? 0.1 : 0), 1.0, 1.48);
  const keyTemp = keyElevationDeg < 18 ? 4400 : keyElevationDeg > 45 ? 5900 : 5300;
  const keySoftness = clampNumber(0.75 - shadowDensity * 0.48, 0.15, 0.85);

  const fillAzimuthDeg = isBacklit
    ? clampNumber(-Math.sign(keyAzimuthDeg || 1) * 18, -35, 35)
    : clampNumber(-keyAzimuthDeg * 0.72, -105, 105);
  const fillElevationDeg = clampNumber(Math.max(8, keyElevationDeg * 0.45), 6, 36);
  const fillIntensity = clampNumber(0.56 - shadowDensity * 0.3, 0.2, 0.58);

  const rimAzimuthDeg = isBacklit
    ? wrapDeg180(keyAzimuthDeg > 0 ? keyAzimuthDeg - 34 : keyAzimuthDeg + 34)
    : wrapDeg180(keyAzimuthDeg + 162);
  const rimElevationDeg = clampNumber(keyElevationDeg + 16, 24, 72);
  const rimIntensity = isBacklit
    ? clampNumber(1.15 + frontFaceShadowRatio * 0.3, 1.1, 1.45)
    : clampNumber(0.68 + shadowDensity * 0.35, 0.65, 1.15);

  const key = buildLightSource("key", keyAzimuthDeg, keyElevationDeg, keyIntensity, keyTemp, keySoftness);
  const fill = buildLightSource("fill", fillAzimuthDeg, fillElevationDeg, fillIntensity, keyTemp + 1150, 0.82);
  const rim = buildLightSource("rim", rimAzimuthDeg, rimElevationDeg, rimIntensity, isBacklit ? 4800 : 6400, 0.28);

  const contrastRatio = roundTo(key.intensity / fill.intensity, 2);
  const mood: LightingMoodCategory = isBacklit
    ? "backlight-rim"
    : keyElevationDeg < -5
      ? "under-lit"
      : Math.abs(keyAzimuthDeg) >= 65
        ? "dramatic-side"
        : contrastRatio <= 2.7
          ? "high-key"
          : "rembrandt";

  return {
    key,
    fill,
    rim,
    contrastRatio,
    mood,
    shadowCentroid: fromIso(shadowIso, aspect),
    shadowCoverage: roundTo(shadowCoverage, 3),
    frontFaceShadowRatio: roundTo(frontFaceShadowRatio, 3),
    confidence: roundTo(clampNumber(0.58 + Math.min(shadowStrokes.length, 6) * 0.06, 0.55, 0.95), 2),
  };
}

/** 2D 러프 스케치 문서에서 ① 3D VRM 포즈 ② 카메라 화각/구도 ③ 3점 조명을 동시에 역산한다. */
export function solveSketchTo3dStage(doc: SketchStageDocument): SketchTo3dStageResult {
  const aspectRatio = doc.aspectRatio && doc.aspectRatio > 0.2 ? doc.aspectRatio : DEFAULT_ASPECT_RATIO;
  const normalizedDoc: SketchStageDocument = { aspectRatio, strokes: doc.strokes };

  const detected = detectBodyLandmarks(normalizedDoc.strokes, aspectRatio);
  const camera = solveCameraFromSketch(normalizedDoc, detected.landmarks, detected.hasLegs);
  const pose = solvePoseFromSketch(normalizedDoc, camera.pitchDeg);
  const lighting = solveThreePointLightingFromSketch(normalizedDoc, pose.landmarks);

  return {
    aspectRatio: roundTo(aspectRatio, 4),
    strokeCount: normalizedDoc.strokes.length,
    pose,
    camera,
    lighting,
    overallConfidence: roundTo((pose.confidence + camera.confidence + lighting.confidence) / 3, 2),
  };
}
