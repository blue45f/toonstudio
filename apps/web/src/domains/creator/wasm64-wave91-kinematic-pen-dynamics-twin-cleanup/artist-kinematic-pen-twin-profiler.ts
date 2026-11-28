/**
 * 작가 손목·필압 운동학 디지털 트윈 프로파일러 (100% 온디바이스 · 제로 클라우드).
 *
 * - 완성 펜선 샘플에서 미분기하(호길이 s, 속도 v, 접선 가속도 a, 부호 곡률 kappa),
 *   고주파 손떨림 에너지 비율, 진입 어택, 진출 플릭 테이퍼, 모서리 커스프를 추출한다.
 * - 표준화 Ridge/OLS 회귀로 작가 필압 전달 모델
 *   `P(v, |kappa|) = clamp(b0 + b1 * ln(1 + v) + b2 * |kappa|, minP, maxP)`를 보정하고,
 *   후보 펜선과의 잉크 DNA 일치도(0..100)를 계산한다.
 */

import {
  clampNumber,
  computeMean,
  computeMedian,
  computeSignedMengerCurvature,
  detectSharpCornerIndices,
  measureHighFrequencyTremor,
  type Point2D,
} from "./kinematic-geometry-primitives";
import {
  DEFAULT_RIDGE_LAMBDA,
  LOCAL_ONLY_KINEMATIC_PRIVACY_CONTRACT,
  buildArtistTwinProfileFingerprint,
  createBuiltInArtistTwinPreset,
  type ArtistPenDynamicsTwinProfile,
  type BuiltInArtistTwinPresetId,
  type CalibrateTwinOptions,
  type ExtractKinematicsOptions,
  type InkDnaSimilarityBreakdown,
  type KinematicPrivacyContract,
  type KinematicSampleDerived,
  type NominalWidthRangePx,
  type PressureTransferModel,
  type StrokeKinematicFeatureVector,
  type StylusKinematicStroke,
  type StylusSamplePoint,
  type StylusToolHint,
} from "./kinematic-twin-types-and-presets";

export {
  LOCAL_ONLY_KINEMATIC_PRIVACY_CONTRACT,
  clampNumber,
  computeMean,
  createBuiltInArtistTwinPreset,
  type ArtistPenDynamicsTwinProfile,
  type BuiltInArtistTwinPresetId,
  type CalibrateTwinOptions,
  type ExtractKinematicsOptions,
  type InkDnaSimilarityBreakdown,
  type KinematicPrivacyContract,
  type KinematicSampleDerived,
  type NominalWidthRangePx,
  type Point2D,
  type PressureTransferModel,
  type StrokeKinematicFeatureVector,
  type StylusKinematicStroke,
  type StylusSamplePoint,
  type StylusToolHint,
};

const DEFAULT_CORNER_ANGLE_DEG = 42;
const DEFAULT_MIN_CORNER_CHORD_PX = 6;
const FALLBACK_SAMPLE_DT_MS = 8;

export function sanitizeStylusPoints(
  rawPoints: readonly StylusSamplePoint[],
): StylusSamplePoint[] {
  const cleaned: StylusSamplePoint[] = [];
  let prevTime = 0;
  for (let i = 0; i < rawPoints.length; i += 1) {
    const pt = rawPoints[i];
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    const pressure = clampNumber(pt.pressure, 0.01, 1);
    const tiltX = pt.tiltX !== undefined && Number.isFinite(pt.tiltX) ? pt.tiltX : 0;
    const tiltY = pt.tiltY !== undefined && Number.isFinite(pt.tiltY) ? pt.tiltY : 0;
    const rawTime = Number.isFinite(pt.timestampMs)
      ? pt.timestampMs
      : prevTime + FALLBACK_SAMPLE_DT_MS;
    const timestampMs = cleaned.length === 0 ? rawTime : Math.max(prevTime, rawTime);
    const prev = cleaned[cleaned.length - 1];
    if (prev && Math.hypot(pt.x - prev.x, pt.y - prev.y) < 1e-5) continue;
    cleaned.push({ x: pt.x, y: pt.y, pressure, tiltX, tiltY, timestampMs });
    prevTime = timestampMs;
  }
  return cleaned;
}

export function extractStrokeKinematics(
  stroke: StylusKinematicStroke,
  options?: ExtractKinematicsOptions,
): StrokeKinematicFeatureVector {
  const cornerThresh = options?.cornerAngleDegThreshold ?? DEFAULT_CORNER_ANGLE_DEG;
  const minCornerChord = options?.minCornerChordPx ?? DEFAULT_MIN_CORNER_CHORD_PX;
  const cleaned = sanitizeStylusPoints(stroke.points);

  if (cleaned.length < 2) {
    const p0 = cleaned[0]?.pressure ?? 0;
    return {
      strokeId: stroke.id,
      pointCount: cleaned.length,
      totalArcLengthPx: 0,
      durationMs: 0,
      meanSpeedPxPerSec: 0,
      maxSpeedPxPerSec: 0,
      meanPressure: p0,
      bodyPressure: p0,
      minPressure: p0,
      maxPressure: p0,
      meanAbsCurvature: 0,
      maxAbsCurvature: 0,
      tremorEnergyRatio: 0,
      tremorRmsPx: 0,
      entryRampFraction: 0.05,
      entryAttackSlope: 0,
      entryInitialPressure: p0,
      exitTaperFraction: 0.05,
      exitFlickVelocityRatio: 1,
      exitTaperExponent: 1,
      exitTerminalPressure: p0,
      meanTiltMagnitudeRad: 0,
      tiltAnisotropyRatio: 0,
      cornerCuspIndices: [],
      samples: [],
    };
  }

  const n = cleaned.length;
  const arcLengths: number[] = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    const prev = cleaned[i - 1];
    const curr = cleaned[i];
    arcLengths[i] =
      (arcLengths[i - 1] ?? 0) +
      (prev && curr ? Math.hypot(curr.x - prev.x, curr.y - prev.y) : 0);
  }
  const totalArcLengthPx = arcLengths[n - 1] ?? 0;

  const dtBetween = (lo: number, hi: number): number => {
    const pLo = cleaned[lo];
    const pHi = cleaned[hi];
    const rawDtMs = pLo && pHi ? pHi.timestampMs - pLo.timestampMs : 0;
    return Math.max(
      rawDtMs > 0.05 ? rawDtMs / 1000 : ((hi - lo) * FALLBACK_SAMPLE_DT_MS) / 1000,
      1e-4,
    );
  };
  const speeds: number[] = new Array<number>(n).fill(0);
  const accels: number[] = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(n - 1, i + 1);
    speeds[i] = ((arcLengths[hi] ?? 0) - (arcLengths[lo] ?? 0)) / dtBetween(lo, hi);
  }
  for (let i = 0; i < n; i += 1) {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(n - 1, i + 1);
    accels[i] = ((speeds[hi] ?? 0) - (speeds[lo] ?? 0)) / dtBetween(lo, hi);
  }

  const curvatures: number[] = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i += 1) {
    const a = cleaned[i - 1];
    const b = cleaned[i];
    const c = cleaned[i + 1];
    if (a && b && c) curvatures[i] = computeSignedMengerCurvature(a, b, c);
  }
  if (n >= 3) {
    curvatures[0] = curvatures[1] ?? 0;
    curvatures[n - 1] = curvatures[n - 2] ?? 0;
  }

  const samples: KinematicSampleDerived[] = [];
  let sumAbsK = 0;
  let maxAbsK = 0;
  let sumTilt = 0;
  let sumTiltCross = 0;
  let minP = 1;
  let maxP = 0;
  let maxSpeed = 0;

  for (let i = 0; i < n; i += 1) {
    const pt = cleaned[i];
    if (!pt) continue;
    const prev = cleaned[Math.max(0, i - 1)] ?? pt;
    const next = cleaned[Math.min(n - 1, i + 1)] ?? pt;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const dLen = Math.hypot(dx, dy);
    const tangentX = dLen > 1e-9 ? dx / dLen : 1;
    const tangentY = dLen > 1e-9 ? dy / dLen : 0;

    const s = arcLengths[i] ?? 0;
    const u = totalArcLengthPx > 1e-9 ? s / totalArcLengthPx : 0;
    const spd = speeds[i] ?? 0;
    const kap = curvatures[i] ?? 0;
    const absK = Math.abs(kap);
    const tiltMag = Math.hypot(pt.tiltX ?? 0, pt.tiltY ?? 0);
    const tiltAng = tiltMag > 1e-9 ? Math.atan2(pt.tiltY ?? 0, pt.tiltX ?? 0) : 0;
    const crossSin =
      tiltMag > 1e-9
        ? Math.abs(tangentX * Math.sin(tiltAng) - tangentY * Math.cos(tiltAng))
        : 0;

    sumAbsK += absK;
    if (absK > maxAbsK) maxAbsK = absK;
    sumTilt += tiltMag;
    sumTiltCross += crossSin * tiltMag;
    if (pt.pressure < minP) minP = pt.pressure;
    if (pt.pressure > maxP) maxP = pt.pressure;
    if (spd > maxSpeed) maxSpeed = spd;

    samples.push({
      x: pt.x,
      y: pt.y,
      arcLengthPx: s,
      normalizedArc: u,
      speedPxPerSec: spd,
      tangentialAccelPxPerSec2: accels[i] ?? 0,
      signedCurvature: kap,
      tangentX,
      tangentY,
      pressure: pt.pressure,
      tiltMagnitudeRad: tiltMag,
      tiltAngleRad: tiltAng,
      timestampMs: pt.timestampMs,
    });
  }

  const cornerCuspIndices = detectSharpCornerIndices(
    cleaned,
    arcLengths,
    cornerThresh,
    minCornerChord,
  );
  const { tremorRmsPx, tremorEnergyRatio } = measureHighFrequencyTremor(
    cleaned,
    cornerCuspIndices,
  );

  const bodySamples = samples.filter((s) => s.normalizedArc >= 0.28 && s.normalizedArc <= 0.68);
  const effectiveBody = bodySamples.length >= 2 ? bodySamples : samples;
  const bodyPressure = computeMedian(effectiveBody.map((s) => s.pressure));
  const bodySpeed = Math.max(1e-3, computeMedian(effectiveBody.map((s) => s.speedPxPerSec)));

  const entryThreshold = bodyPressure * 0.85;
  const entryInitialPressure = samples[0]?.pressure ?? bodyPressure;
  let entryRampFraction = 0.02;
  if (entryInitialPressure < entryThreshold) {
    entryRampFraction = 0.45;
    for (let i = 1; i < samples.length; i += 1) {
      const sPrev = samples[i - 1];
      const sCurr = samples[i];
      if (!sPrev || !sCurr || sCurr.normalizedArc > 0.45) break;
      if (sCurr.pressure >= entryThreshold) {
        const frac = clampNumber(
          (entryThreshold - sPrev.pressure) / Math.max(sCurr.pressure - sPrev.pressure, 1e-6),
          0,
          1,
        );
        entryRampFraction = clampNumber(
          sPrev.normalizedArc + (sCurr.normalizedArc - sPrev.normalizedArc) * frac,
          0.01,
          0.45,
        );
        break;
      }
    }
  }
  const entryAttackSlope = Math.max(
    0,
    (bodyPressure - entryInitialPressure) / Math.max(entryRampFraction, 0.02),
  );

  const exitThreshold = bodyPressure * 0.85;
  const exitTerminalPressure = samples[samples.length - 1]?.pressure ?? bodyPressure;
  let exitTaperFraction = 0.02;
  if (exitTerminalPressure < exitThreshold) {
    exitTaperFraction = 0.45;
    for (let i = samples.length - 2; i >= 0; i -= 1) {
      const sCurr = samples[i];
      const sNext = samples[i + 1];
      if (!sCurr || !sNext || sCurr.normalizedArc < 0.55) break;
      if (sCurr.pressure >= exitThreshold) {
        const frac = clampNumber(
          (sCurr.pressure - exitThreshold) / Math.max(sCurr.pressure - sNext.pressure, 1e-6),
          0,
          1,
        );
        exitTaperFraction = clampNumber(
          1 - (sCurr.normalizedArc + (sNext.normalizedArc - sCurr.normalizedArc) * frac),
          0.01,
          0.45,
        );
        break;
      }
    }
  }

  const exitZoneStart = Math.min(0.85, Math.max(0.55, 1 - exitTaperFraction));
  const exitZoneSamples = samples.filter((s) => s.normalizedArc >= exitZoneStart);
  const exitFlickVelocityRatio = clampNumber(
    (exitZoneSamples.length > 0 ? computeMean(exitZoneSamples.map((s) => s.speedPxPerSec)) : bodySpeed) /
      bodySpeed,
    0.25,
    4.0,
  );

  let sumLnT2 = 0;
  let sumLnTLnY = 0;
  const pressureSpan = Math.max(bodyPressure - exitTerminalPressure, 0.05);
  const taperStartU = 1 - exitTaperFraction;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (!s || s.normalizedArc <= taperStartU || s.normalizedArc >= 0.995) continue;
    const t = (1 - s.normalizedArc) / Math.max(exitTaperFraction, 0.02);
    const y = (s.pressure - exitTerminalPressure) / pressureSpan;
    if (t > 0.05 && t < 0.95 && y > 0.04 && y < 0.96) {
      const lnT = Math.log(t);
      sumLnT2 += lnT * lnT;
      sumLnTLnY += lnT * Math.log(y);
    }
  }
  const exitTaperExponent = sumLnT2 > 1e-5 ? clampNumber(sumLnTLnY / sumLnT2, 0.25, 4.0) : 1.0;

  return {
    strokeId: stroke.id,
    pointCount: n,
    totalArcLengthPx,
    durationMs: Math.max(0, (cleaned[n - 1]?.timestampMs ?? 0) - (cleaned[0]?.timestampMs ?? 0)),
    meanSpeedPxPerSec: computeMean(samples.map((s) => s.speedPxPerSec)),
    maxSpeedPxPerSec: maxSpeed,
    meanPressure: computeMean(samples.map((s) => s.pressure)),
    bodyPressure,
    minPressure: minP,
    maxPressure: maxP,
    meanAbsCurvature: sumAbsK / n,
    maxAbsCurvature: maxAbsK,
    tremorEnergyRatio,
    tremorRmsPx,
    entryRampFraction,
    entryAttackSlope,
    entryInitialPressure,
    exitTaperFraction,
    exitFlickVelocityRatio,
    exitTaperExponent,
    exitTerminalPressure,
    meanTiltMagnitudeRad: sumTilt / n,
    tiltAnisotropyRatio: sumTilt > 1e-6 ? clampNumber(sumTiltCross / sumTilt, 0, 1) : 0,
    cornerCuspIndices,
    samples,
  };
}

/** 표준화 z-점수 기반 2특성 Ridge 회귀로 척도가 다른 ln(1+v)와 |kappa|를 공정하게 추정한다. */
function fitStandardizedRidge2D(
  samples: readonly KinematicSampleDerived[],
  ridgeLambda: number,
): { readonly b0: number; readonly b1: number; readonly b2: number } {
  const x1Arr: number[] = [];
  const x2Arr: number[] = [];
  const yArr: number[] = [];
  for (let i = 0; i < samples.length; i += 1) {
    const pt = samples[i];
    if (!pt) continue;
    x1Arr.push(Math.log(1 + Math.max(0, pt.speedPxPerSec)));
    x2Arr.push(Math.abs(pt.signedCurvature));
    yArr.push(pt.pressure);
  }
  const m = yArr.length;
  if (m === 0) return { b0: 0.5, b1: 0, b2: 0 };

  const mean1 = computeMean(x1Arr);
  const mean2 = computeMean(x2Arr);
  const meanY = computeMean(yArr);
  let var1 = 0;
  let var2 = 0;
  for (let i = 0; i < m; i += 1) {
    const d1 = (x1Arr[i] ?? mean1) - mean1;
    const d2 = (x2Arr[i] ?? mean2) - mean2;
    var1 += d1 * d1;
    var2 += d2 * d2;
  }
  const std1 = Math.sqrt(var1 / m);
  const std2 = Math.sqrt(var2 / m);
  const use1 = std1 > 1e-6;
  const use2 = std2 > 1e-6;
  if (!use1 && !use2) return { b0: meanY, b1: 0, b2: 0 };

  let a11 = 0;
  let a12 = 0;
  let a22 = 0;
  let rhs1 = 0;
  let rhs2 = 0;
  for (let i = 0; i < m; i += 1) {
    const z1 = use1 ? ((x1Arr[i] ?? mean1) - mean1) / std1 : 0;
    const z2 = use2 ? ((x2Arr[i] ?? mean2) - mean2) / std2 : 0;
    const yc = (yArr[i] ?? meanY) - meanY;
    a11 += z1 * z1;
    a12 += z1 * z2;
    a22 += z2 * z2;
    rhs1 += z1 * yc;
    rhs2 += z2 * yc;
  }
  a11 = a11 / m + ridgeLambda;
  a12 /= m;
  a22 = a22 / m + ridgeLambda;
  rhs1 /= m;
  rhs2 /= m;

  let beta1 = 0;
  let beta2 = 0;
  if (use1 && use2) {
    const det = Math.max(a11 * a22 - a12 * a12, 1e-12);
    beta1 = (a22 * rhs1 - a12 * rhs2) / det;
    beta2 = (a11 * rhs2 - a12 * rhs1) / det;
  } else if (use1) {
    beta1 = rhs1 / a11;
  } else {
    beta2 = rhs2 / a22;
  }

  const b1 = use1 ? beta1 / std1 : 0;
  const b2 = use2 ? beta2 / std2 : 0;
  return { b0: meanY - b1 * mean1 - b2 * mean2, b1, b2 };
}

export function evaluatePressureTransferModel(
  model: PressureTransferModel,
  speedPxPerSec: number,
  absCurvature: number,
): number {
  const safeSpeed = Math.max(0, Number.isFinite(speedPxPerSec) ? speedPxPerSec : 0);
  const safeKappa = Math.max(0, Number.isFinite(absCurvature) ? absCurvature : 0);
  const raw =
    model.b0 +
    model.b1LogSpeed * Math.log(1 + safeSpeed) +
    model.b2AbsCurvature * safeKappa;
  return clampNumber(raw, model.minPressure, model.maxPressure);
}

export function calibrateArtistKinematicTwin(
  artistId: string,
  referenceInkStrokes: readonly StylusKinematicStroke[],
  options?: CalibrateTwinOptions,
): ArtistPenDynamicsTwinProfile {
  const ridgeLambda = Math.max(1e-6, options?.ridgeLambda ?? DEFAULT_RIDGE_LAMBDA);
  const features: StrokeKinematicFeatureVector[] = [];
  const baseWidths: number[] = [];

  for (let i = 0; i < referenceInkStrokes.length; i += 1) {
    const stroke = referenceInkStrokes[i];
    if (!stroke) continue;
    const feat = extractStrokeKinematics(stroke, {
      cornerAngleDegThreshold: options?.cornerAngleDegThreshold,
    });
    if (feat.samples.length >= 2) {
      features.push(feat);
      if (stroke.baseWidthPx !== undefined && Number.isFinite(stroke.baseWidthPx) && stroke.baseWidthPx > 0) {
        baseWidths.push(stroke.baseWidthPx);
      }
    }
  }

  if (features.length === 0) {
    const fallback = createBuiltInArtistTwinPreset("korean-webtoon-gpen", artistId);
    return {
      ...fallback,
      profileName: options?.profileName ?? `${artistId} 기본 G펜 트윈`,
      sampleStrokeCount: 0,
      samplePointCount: 0,
    };
  }

  const entryRampFraction = computeMedian(features.map((f) => f.entryRampFraction));
  const exitTaperFraction = computeMedian(features.map((f) => f.exitTaperFraction));
  const bodyStart = Math.max(0.14, entryRampFraction + 0.03);
  const bodyEnd = Math.min(0.86, 1 - exitTaperFraction - 0.03);

  const regressionSamples: KinematicSampleDerived[] = [];
  const cornerDwellRatios: number[] = [];
  let totalPoints = 0;
  let obsMinP = 1;
  let obsMaxP = 0;

  for (let i = 0; i < features.length; i += 1) {
    const f = features[i];
    if (!f) continue;
    totalPoints += f.samples.length;
    const bodyPts = f.samples.filter(
      (s) => s.normalizedArc >= bodyStart && s.normalizedArc <= bodyEnd,
    );
    const chosen = bodyPts.length >= 3 ? bodyPts : f.samples;
    for (let j = 0; j < chosen.length; j += 1) {
      const s = chosen[j];
      if (!s) continue;
      regressionSamples.push(s);
      if (s.pressure < obsMinP) obsMinP = s.pressure;
      if (s.pressure > obsMaxP) obsMaxP = s.pressure;
    }
    for (let c = 0; c < f.cornerCuspIndices.length; c += 1) {
      const idx = f.cornerCuspIndices[c];
      const cs = idx !== undefined ? f.samples[idx] : undefined;
      if (cs) cornerDwellRatios.push(Math.max(0, cs.pressure - f.bodyPressure));
    }
  }

  const { b0, b1, b2 } = fitStandardizedRidge2D(regressionSamples, ridgeLambda);
  const minPressure = clampNumber(Math.min(obsMinP * 0.85, 0.35), 0.03, 0.6);
  const maxPressure = clampNumber(Math.max(obsMaxP * 1.05, minPressure + 0.15), 0.25, 1.0);
  const prelimModel: PressureTransferModel = {
    b0,
    b1LogSpeed: b1,
    b2AbsCurvature: b2,
    minPressure,
    maxPressure,
    ridgeLambda,
    residualRmse: 0,
  };
  let sqErr = 0;
  for (let i = 0; i < regressionSamples.length; i += 1) {
    const pt = regressionSamples[i];
    if (!pt) continue;
    const diff =
      evaluatePressureTransferModel(prelimModel, pt.speedPxPerSec, Math.abs(pt.signedCurvature)) -
      pt.pressure;
    sqErr += diff * diff;
  }
  const pressureModel: PressureTransferModel = {
    ...prelimModel,
    residualRmse: regressionSamples.length > 0 ? Math.sqrt(sqErr / regressionSamples.length) : 0,
  };

  const entryAttackSlope = computeMedian(features.map((f) => f.entryAttackSlope));
  const entryInitialPressure = computeMedian(features.map((f) => f.entryInitialPressure));
  const exitFlickVelocityRatio = computeMedian(features.map((f) => f.exitFlickVelocityRatio));
  const exitTaperExponent = computeMedian(features.map((f) => f.exitTaperExponent));
  const exitTerminalPressure = computeMedian(features.map((f) => f.exitTerminalPressure));
  const typicalMeanSpeedPxPerSec = Math.max(40, computeMedian(features.map((f) => f.meanSpeedPxPerSec)));
  const typicalAbsCurvature = computeMedian(features.map((f) => f.meanAbsCurvature));
  const bodyPressureMed = clampNumber(computeMedian(features.map((f) => f.bodyPressure)), 0.15, 0.95);

  const nominalBase =
    options?.nominalBaseWidthPx ?? (baseWidths.length > 0 ? computeMedian(baseWidths) : 3.2);
  const nominalWidthPx: NominalWidthRangePx = {
    min: Number(clampNumber(nominalBase * Math.max(0.12, minPressure * 0.65), 0.25, 4).toFixed(3)),
    typical: Number(clampNumber(nominalBase * bodyPressureMed, 0.5, 14).toFixed(3)),
    max: Number(clampNumber(nominalBase * Math.min(1.35, maxPressure * 1.15), 1.0, 24).toFixed(3)),
  };

  const medianTilt = computeMedian(features.map((f) => f.meanTiltMagnitudeRad));
  const medianTiltAniso = computeMedian(features.map((f) => f.tiltAnisotropyRatio));
  const tiltWidthAnisotropy = clampNumber(
    medianTilt > 0.05 ? medianTiltAniso * Math.min(1, medianTilt / 0.8) : 0.14,
    0.04,
    0.75,
  );
  const cornerMicroDwellBoost =
    cornerDwellRatios.length > 0 ? clampNumber(computeMedian(cornerDwellRatios), 0.02, 0.24) : 0.08;
  const tremorCutoffHz = Number(
    clampNumber(8.5 + (1 - computeMedian(features.map((f) => f.tremorEnergyRatio))) * 3.5, 6.5, 14).toFixed(2),
  );

  return {
    artistId,
    profileName: options?.profileName ?? `${artistId} 펜선 디지털 트윈`,
    sampleStrokeCount: features.length,
    samplePointCount: totalPoints,
    pressureModel,
    nominalWidthPx,
    entryRampFraction,
    entryAttackSlope,
    entryInitialPressure,
    exitTaperFraction,
    exitFlickVelocityRatio,
    exitTaperExponent,
    exitTerminalPressure,
    cornerMicroDwellBoost,
    tiltWidthAnisotropy,
    tremorCutoffHz,
    typicalMeanSpeedPxPerSec,
    typicalAbsCurvature,
    profileFingerprintHex: buildArtistTwinProfileFingerprint(
      artistId,
      pressureModel,
      nominalWidthPx,
      entryRampFraction,
      exitTaperFraction,
      exitTaperExponent,
      tiltWidthAnisotropy,
    ),
    privacyContract: LOCAL_ONLY_KINEMATIC_PRIVACY_CONTRACT,
  };
}

function gaussianSimilarity(delta: number, sigma: number): number {
  const scaled = delta / Math.max(sigma, 1e-6);
  return 100 * Math.exp(-0.5 * scaled * scaled);
}

export function computeInkDnaSimilarityScore(
  candidateStrokes: readonly StylusKinematicStroke[],
  twinProfile: ArtistPenDynamicsTwinProfile,
): InkDnaSimilarityBreakdown {
  const feats = candidateStrokes
    .map((stroke) => extractStrokeKinematics(stroke))
    .filter((f) => f.samples.length >= 2);

  if (feats.length === 0) {
    return {
      overallScore: 0,
      entryAttackScore: 0,
      exitTaperScore: 0,
      velocityPressureScore: 0,
      curvatureWeightScore: 0,
      evaluatedStrokeCount: 0,
      profileFingerprintHex: twinProfile.profileFingerprintHex,
    };
  }

  const entryAttackScore =
    0.4 * gaussianSimilarity(computeMedian(feats.map((f) => f.entryRampFraction)) - twinProfile.entryRampFraction, 0.08) +
    0.35 * gaussianSimilarity(computeMedian(feats.map((f) => f.entryInitialPressure)) - twinProfile.entryInitialPressure, 0.13) +
    0.25 * gaussianSimilarity(computeMedian(feats.map((f) => f.entryAttackSlope)) - twinProfile.entryAttackSlope, 3.2);

  const exitTaperScore =
    0.3 * gaussianSimilarity(computeMedian(feats.map((f) => f.exitTaperFraction)) - twinProfile.exitTaperFraction, 0.09) +
    0.25 * gaussianSimilarity(computeMedian(feats.map((f) => f.exitTerminalPressure)) - twinProfile.exitTerminalPressure, 0.1) +
    0.25 * gaussianSimilarity(computeMedian(feats.map((f) => f.exitTaperExponent)) - twinProfile.exitTaperExponent, 0.65) +
    0.2 * gaussianSimilarity(computeMedian(feats.map((f) => f.exitFlickVelocityRatio)) - twinProfile.exitFlickVelocityRatio, 0.42);

  const bodyStart = Math.max(0.15, twinProfile.entryRampFraction + 0.03);
  const bodyEnd = Math.min(0.85, 1 - twinProfile.exitTaperFraction - 0.03);
  let sqErr = 0;
  let bodyCount = 0;
  const highCurvResids: number[] = [];
  const lowCurvResids: number[] = [];

  for (let i = 0; i < feats.length; i += 1) {
    const f = feats[i];
    if (!f) continue;
    const body = f.samples.filter(
      (s) => s.normalizedArc >= bodyStart && s.normalizedArc <= bodyEnd,
    );
    const chosen = body.length >= 2 ? body : f.samples;
    for (let j = 0; j < chosen.length; j += 1) {
      const pt = chosen[j];
      if (!pt) continue;
      const absK = Math.abs(pt.signedCurvature);
      const err =
        pt.pressure -
        evaluatePressureTransferModel(twinProfile.pressureModel, pt.speedPxPerSec, absK);
      sqErr += err * err;
      bodyCount += 1;
      if (absK >= 0.008) highCurvResids.push(err);
      else lowCurvResids.push(err);
    }
  }

  const bodyRmse = bodyCount > 0 ? Math.sqrt(sqErr / bodyCount) : 1;
  const velocityPressureScore = gaussianSimilarity(bodyRmse, 0.14);
  const curvErr =
    highCurvResids.length > 0
      ? Math.sqrt(computeMean(highCurvResids.map((e) => e * e)))
      : lowCurvResids.length > 0
        ? Math.sqrt(computeMean(lowCurvResids.map((e) => e * e)))
        : bodyRmse;
  const curvatureWeightScore = gaussianSimilarity(curvErr, 0.13);
  const overallScore = clampNumber(
    0.25 * entryAttackScore +
      0.25 * exitTaperScore +
      0.3 * velocityPressureScore +
      0.2 * curvatureWeightScore,
    0,
    100,
  );

  return {
    overallScore: Number(overallScore.toFixed(2)),
    entryAttackScore: Number(clampNumber(entryAttackScore, 0, 100).toFixed(2)),
    exitTaperScore: Number(clampNumber(exitTaperScore, 0, 100).toFixed(2)),
    velocityPressureScore: Number(clampNumber(velocityPressureScore, 0, 100).toFixed(2)),
    curvatureWeightScore: Number(clampNumber(curvatureWeightScore, 0, 100).toFixed(2)),
    evaluatedStrokeCount: feats.length,
    profileFingerprintHex: twinProfile.profileFingerprintHex,
  };
}
