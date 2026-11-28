/**
 * Wave 145 — 액션 컷 모션 호(Motion Arc) 궤적, 면적 보존 스쿼시&스트레치,
 * 속도 연동 부채꼴 스미어 폴리곤(Smear Fan) 및 지수 감쇠 잔상 고스트(Afterimage Ghosts) 커널.
 *
 * - 2차·3차 베지어 및 3점 원호 궤적을 호 길이(Arc-Length) 파라미터로 단조 재샘플링
 * - 디즈니 12원칙(Slow-in → Snap → Follow-through) 속도 프로파일 및 면적 보존 변형(`scaleParallel * scalePerp === 1`)
 * - 순간 선속도·각속도에 비례하는 양수 면적 스미어 팬과 알파 단조 감소 잔상 생성
 */

import {
  MOTION_ARC_EPSILON,
  clampMotionScalar,
  evaluateActionCurveRaw,
  evaluateDisneySpeedWeight,
  normalizeMotionVec2,
  sanitizeMotionPoint,
  solveCircularArcFromThreePoints,
  type ActionCurveKind,
  type ActionMotionArcInput,
  type ActionMotionArcResult,
  type ActionPoint2D,
  type ActionWeaponProfile,
  type AfterimageGhost,
  type AfterimageGhostOptions,
  type AfterimageGhostSetResult,
  type MotionArcSample,
  type SmearFanOptions,
  type SmearFanPolygonResult,
  type SquashStretchInput,
  type SquashStretchPhaseMode,
  type SquashStretchResult,
} from "./motion-arc-types-and-curves";

export type {
  ActionCurveKind,
  ActionMotionArcInput,
  ActionMotionArcResult,
  ActionPoint2D,
  ActionWeaponProfile,
  AfterimageGhost,
  AfterimageGhostOptions,
  AfterimageGhostSetResult,
  MotionArcSample,
  SmearFanOptions,
  SmearFanPolygonResult,
  SquashStretchInput,
  SquashStretchPhaseMode,
  SquashStretchResult,
};

const LUT_RESOLUTION = 256;

const GHOST_TINT_OKLCH: Record<"lead-hot" | "mid-trail" | "deep-echo", string> = {
  "lead-hot": "oklch(0.68 0.16 42)",
  "mid-trail": "oklch(0.62 0.14 240)",
  "deep-echo": "oklch(0.48 0.11 258)",
};

/**
 * 디즈니 스쿼시&스트레치 면적 보존 법칙(`scaleParallel * scalePerp === 1.0`)을
 * 최대 연신율 클램프와 함께 계산한다.
 */
export function computeVolumePreservingSquashStretch(
  input: SquashStretchInput,
): SquashStretchResult {
  const maxStretch = clampMotionScalar(input.maxStretchRatio ?? 1.85, 1.05, 2.5);
  const minParallel = 1 / maxStretch;
  const phaseMode = input.phaseMode ?? "snap-stretch";

  if (phaseMode === "neutral") {
    return {
      scaleParallel: 1,
      scalePerp: 1,
      areaProduct: 1,
      areaConservationError: 0,
      clamped: false,
      phaseMode,
    };
  }

  let rawParallel: number;
  if (phaseMode === "impact-squash" || phaseMode === "anticipation-squash") {
    const compression = clampMotionScalar(
      input.impactCompression ?? (phaseMode === "impact-squash" ? 0.34 : 0.22),
      0,
      0.85,
    );
    rawParallel = 1 / (1 + compression * (maxStretch - 1));
  } else {
    const speed = Math.max(0, Number.isFinite(input.speedPxPerSec) ? input.speedPxPerSec : 0);
    const refSpeed = Math.max(
      1,
      Number.isFinite(input.referenceSpeedPxPerSec) ? input.referenceSpeedPxPerSec : 1000,
    );
    const ratio = speed / refSpeed;
    const smoothCurve = ratio / (0.65 + ratio);
    rawParallel = 1 + (maxStretch - 1) * smoothCurve * 1.15;
  }

  const clamped = rawParallel > maxStretch || rawParallel < minParallel;
  const scaleParallel = clampMotionScalar(rawParallel, minParallel, maxStretch);
  const scalePerp = 1 / scaleParallel;
  const areaProduct = scaleParallel * scalePerp;
  const areaConservationError = Math.abs(areaProduct - 1);

  return {
    scaleParallel,
    scalePerp,
    areaProduct,
    areaConservationError,
    clamped,
    phaseMode,
  };
}

/**
 * 검격·주먹·발차기의 2차/3차 베지어 또는 3점 원호 궤적을 호 길이 파라미터로
 * 재샘플링해 접선·법선·곡률·속도 프로파일·스쿼시&스트레치를 산출한다.
 */
export function buildActionMotionArc(input: ActionMotionArcInput): ActionMotionArcResult {
  const p0 = sanitizeMotionPoint(input.start, { x: 40, y: 180 });
  const p1 = sanitizeMotionPoint(input.control1, { x: 180, y: 60 });
  const p3 = sanitizeMotionPoint(input.end, { x: 340, y: 150 });
  const p2 =
    input.control2 !== undefined
      ? sanitizeMotionPoint(input.control2, {
          x: (p1.x + p3.x) * 0.5,
          y: (p1.y + p3.y) * 0.5,
        })
      : {
          x: p1.x + (p3.x - p0.x) * 0.25,
          y: p1.y + (p3.y - p0.y) * 0.25,
        };

  const sampleCount = Math.round(clampMotionScalar(input.sampleCount ?? 32, 12, 128));
  const durationSec = clampMotionScalar(input.durationSec ?? 0.18, 0.04, 1.5);
  const weaponWidthPx = clampMotionScalar(input.weaponWidthPx ?? 18, 4, 96);
  const weaponProfile: ActionWeaponProfile = input.weaponProfile ?? "blade-slash";
  const peakBias = clampMotionScalar(input.peakVelocityBias ?? 0.62, 0.35, 0.85);
  const maxStretchRatio = clampMotionScalar(input.maxStretchRatio ?? 1.85, 1.05, 2.5);

  const circle =
    input.curveKind === "circular-arc"
      ? solveCircularArcFromThreePoints(p0, p1, p3)
      : null;
  const resolvedCurveKind: ActionCurveKind =
    input.curveKind === "circular-arc" && circle === null
      ? "quadratic-bezier"
      : input.curveKind;

  const lutT = new Float64Array(LUT_RESOLUTION + 1);
  const lutS = new Float64Array(LUT_RESOLUTION + 1);
  let prevPos = evaluateActionCurveRaw(resolvedCurveKind, p0, p1, p2, p3, circle, 0).position;
  let cumulativeS = 0;
  lutT[0] = 0;
  lutS[0] = 0;

  for (let i = 1; i <= LUT_RESOLUTION; i += 1) {
    const t = i / LUT_RESOLUTION;
    const pos = evaluateActionCurveRaw(resolvedCurveKind, p0, p1, p2, p3, circle, t).position;
    const segLen = Math.hypot(pos.x - prevPos.x, pos.y - prevPos.y);
    cumulativeS += Number.isFinite(segLen) ? segLen : 0;
    lutT[i] = t;
    lutS[i] = cumulativeS;
    prevPos = pos;
  }

  const totalArcLengthPx = Math.max(MOTION_ARC_EPSILON, cumulativeS);

  const mapArcLengthToT = (targetS: number): number => {
    if (targetS <= 0) return 0;
    if (targetS >= totalArcLengthPx) return 1;
    let lo = 0;
    let hi = LUT_RESOLUTION;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if ((lutS[mid] ?? 0) <= targetS) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    const sLo = lutS[lo] ?? 0;
    const sHi = lutS[hi] ?? totalArcLengthPx;
    const span = Math.max(MOTION_ARC_EPSILON, sHi - sLo);
    const alpha = clampMotionScalar((targetS - sLo) / span, 0, 1);
    return (lutT[lo] ?? 0) + ((lutT[hi] ?? 1) - (lutT[lo] ?? 0)) * alpha;
  };

  const weights: number[] = [];
  let weightSum = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const w = evaluateDisneySpeedWeight(i / (sampleCount - 1), peakBias);
    weights.push(w);
    weightSum += w;
  }
  const meanWeight = Math.max(MOTION_ARC_EPSILON, weightSum / sampleCount);
  const meanSpeedPxPerSec = totalArcLengthPx / durationSec;
  const referenceSpeedPxPerSec = meanSpeedPxPerSec * 1.15;

  const rawTimes: number[] = [0];
  const segmentLength = totalArcLengthPx / (sampleCount - 1);
  for (let i = 1; i < sampleCount; i += 1) {
    const speedPrev = ((weights[i - 1] ?? meanWeight) / meanWeight) * meanSpeedPxPerSec;
    const speedCurr = ((weights[i] ?? meanWeight) / meanWeight) * meanSpeedPxPerSec;
    rawTimes.push((rawTimes[i - 1] ?? 0) + segmentLength / Math.max(1, (speedPrev + speedCurr) * 0.5));
  }
  const rawTotalTime = Math.max(MOTION_ARC_EPSILON, rawTimes[sampleCount - 1] ?? durationSec);

  const rawSpeeds: number[] = [];
  let peakSpeedPxPerSec = 0;
  let peakSampleIndex = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const speed = ((weights[i] ?? meanWeight) / meanWeight) * meanSpeedPxPerSec;
    rawSpeeds.push(speed);
    if (speed > peakSpeedPxPerSec) {
      peakSpeedPxPerSec = speed;
      peakSampleIndex = i;
    }
  }

  const samples: MotionArcSample[] = [];
  let peakAngularSpeedRadPerSec = 0;
  let maxAreaConservationError = 0;
  let arcLengthMonotonic = true;
  let fallbackTangent = normalizeMotionVec2({ x: p3.x - p0.x, y: p3.y - p0.y });

  for (let i = 0; i < sampleCount; i += 1) {
    const u = i / (sampleCount - 1);
    const arcLengthPx = u * totalArcLengthPx;
    if (i > 0 && arcLengthPx <= (samples[i - 1]?.arcLengthPx ?? -1)) {
      arcLengthMonotonic = false;
    }

    const t = mapArcLengthToT(arcLengthPx);
    const raw = evaluateActionCurveRaw(resolvedCurveKind, p0, p1, p2, p3, circle, t);
    const tangent = normalizeMotionVec2(raw.d1, fallbackTangent);
    fallbackTangent = tangent;
    const normal: ActionPoint2D = { x: -tangent.y, y: tangent.x };

    const d1SpeedSq = raw.d1.x * raw.d1.x + raw.d1.y * raw.d1.y;
    const cross = raw.d1.x * raw.d2.y - raw.d1.y * raw.d2.x;
    const signedCurvature =
      d1SpeedSq > MOTION_ARC_EPSILON
        ? clampMotionScalar(cross / Math.pow(d1SpeedSq, 1.5), -0.25, 0.25)
        : 0;

    const speedPxPerSec = rawSpeeds[i] ?? meanSpeedPxPerSec;
    const angularSpeedRadPerSec = Math.abs(signedCurvature) * speedPxPerSec;
    if (angularSpeedRadPerSec > peakAngularSpeedRadPerSec) {
      peakAngularSpeedRadPerSec = angularSpeedRadPerSec;
    }

    const normalizedSpeed =
      peakSpeedPxPerSec > MOTION_ARC_EPSILON
        ? clampMotionScalar(speedPxPerSec / peakSpeedPxPerSec, 0, 1)
        : 0;
    const timeSec = ((rawTimes[i] ?? 0) / rawTotalTime) * durationSec;
    const phaseMode: SquashStretchPhaseMode =
      u < 0.14 ? "anticipation-squash" : u > 0.94 ? "impact-squash" : "snap-stretch";

    const squashStretch = computeVolumePreservingSquashStretch({
      speedPxPerSec,
      referenceSpeedPxPerSec,
      maxStretchRatio,
      phaseMode,
    });
    if (squashStretch.areaConservationError > maxAreaConservationError) {
      maxAreaConservationError = squashStretch.areaConservationError;
    }

    samples.push({
      index: i,
      u,
      arcLengthPx,
      timeSec,
      position: raw.position,
      tangent,
      normal,
      signedCurvature,
      speedPxPerSec,
      angularSpeedRadPerSec,
      normalizedSpeed,
      squashStretch,
    });
  }

  const lastSample = samples[samples.length - 1];
  const impactPoint = lastSample?.position ?? p3;
  const impactDirection = lastSample?.tangent ?? fallbackTangent;
  const impactNormal = lastSample?.normal ?? { x: -impactDirection.y, y: impactDirection.x };

  return {
    curveKind: input.curveKind,
    resolvedCurveKind,
    weaponProfile,
    weaponWidthPx,
    totalArcLengthPx,
    durationSec,
    peakSpeedPxPerSec,
    peakAngularSpeedRadPerSec,
    peakSampleIndex,
    impactPoint,
    impactDirection,
    impactNormal,
    samples,
    arcLengthMonotonic,
    maxAreaConservationError,
  };
}

/** 호 길이 파라미터 `u ∈ [0, 1]`에서 선형 보간된 모션 호 샘플을 조회한다. */
export function sampleActionMotionArcAt(arc: ActionMotionArcResult, u: number): MotionArcSample {
  const samples = arc.samples;
  if (samples.length === 0) {
    const neutral = computeVolumePreservingSquashStretch({
      speedPxPerSec: 0,
      referenceSpeedPxPerSec: 1,
      phaseMode: "neutral",
    });
    return {
      index: 0,
      u: 0,
      arcLengthPx: 0,
      timeSec: 0,
      position: { x: 0, y: 0 },
      tangent: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
      signedCurvature: 0,
      speedPxPerSec: 0,
      angularSpeedRadPerSec: 0,
      normalizedSpeed: 0,
      squashStretch: neutral,
    };
  }
  const clampedU = clampMotionScalar(u, 0, 1);
  const scaled = clampedU * (samples.length - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(samples.length - 1, lo + 1);
  const a = samples[lo] ?? samples[0];
  const b = samples[hi] ?? a;
  if (!a || !b || lo === hi) {
    return a ?? b ?? samples[0];
  }
  const alpha = scaled - lo;
  const tangent = normalizeMotionVec2(
    {
      x: a.tangent.x + (b.tangent.x - a.tangent.x) * alpha,
      y: a.tangent.y + (b.tangent.y - a.tangent.y) * alpha,
    },
    a.tangent,
  );
  const normal: ActionPoint2D = { x: -tangent.y, y: tangent.x };
  const speedPxPerSec = a.speedPxPerSec + (b.speedPxPerSec - a.speedPxPerSec) * alpha;
  const signedCurvature = a.signedCurvature + (b.signedCurvature - a.signedCurvature) * alpha;
  const squashStretch = computeVolumePreservingSquashStretch({
    speedPxPerSec,
    referenceSpeedPxPerSec: Math.max(1, arc.peakSpeedPxPerSec * 0.72),
    phaseMode:
      clampedU < 0.14 ? "anticipation-squash" : clampedU > 0.94 ? "impact-squash" : "snap-stretch",
  });

  return {
    index: Math.round(scaled),
    u: clampedU,
    arcLengthPx: a.arcLengthPx + (b.arcLengthPx - a.arcLengthPx) * alpha,
    timeSec: a.timeSec + (b.timeSec - a.timeSec) * alpha,
    position: {
      x: a.position.x + (b.position.x - a.position.x) * alpha,
      y: a.position.y + (b.position.y - a.position.y) * alpha,
    },
    tangent,
    normal,
    signedCurvature,
    speedPxPerSec,
    angularSpeedRadPerSec: Math.abs(signedCurvature) * speedPxPerSec,
    normalizedSpeed: a.normalizedSpeed + (b.normalizedSpeed - a.normalizedSpeed) * alpha,
    squashStretch,
  };
}

function computePolygonAreaAndCentroid(points: readonly ActionPoint2D[]): {
  readonly areaPx2: number;
  readonly centroid: ActionPoint2D;
} {
  if (points.length < 3) {
    return { areaPx2: 0, centroid: points[0] ?? { x: 0, y: 0 } };
  }
  let doubleSignedArea = 0;
  let cxAcc = 0;
  let cyAcc = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    if (!p || !q) continue;
    const cross = p.x * q.y - q.x * p.y;
    doubleSignedArea += cross;
    cxAcc += (p.x + q.x) * cross;
    cyAcc += (p.y + q.y) * cross;
  }
  const areaPx2 = Math.abs(doubleSignedArea) * 0.5;
  if (Math.abs(doubleSignedArea) < MOTION_ARC_EPSILON) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < points.length; i += 1) {
      sx += points[i]?.x ?? 0;
      sy += points[i]?.y ?? 0;
    }
    return {
      areaPx2,
      centroid: { x: sx / points.length, y: sy / points.length },
    };
  }
  const factor = 1 / (3 * doubleSignedArea);
  return {
    areaPx2,
    centroid: { x: cxAcc * factor, y: cyAcc * factor },
  };
}

/**
 * 검날·주먹의 순간 선속도와 각속도에 비례하는 닫힌 부채꼴 스미어 폴리곤(Smear Fan)을 생성한다.
 */
export function generateSmearFanPolygon(
  arc: ActionMotionArcResult,
  options: SmearFanOptions = {},
): SmearFanPolygonResult {
  const peakSample = arc.samples[arc.peakSampleIndex] ?? arc.samples[0];
  const defaultFocalU = peakSample ? clampMotionScalar(peakSample.u + 0.14, 0.25, 0.96) : 0.78;
  const focalU = clampMotionScalar(options.focalU ?? defaultFocalU, 0.18, 1);
  const focalSample = sampleActionMotionArcAt(arc, focalU);

  const speedNorm = clampMotionScalar(focalSample.speedPxPerSec / 1400, 0.25, 2.2);
  const angularNorm = clampMotionScalar(focalSample.angularSpeedRadPerSec / 6, 0, 1.5);
  const speedBoostGain = clampMotionScalar(options.speedBoostGain ?? 0.58, 0.1, 1.4);
  const speedCouplingFactor = 1 + speedBoostGain * (0.65 * speedNorm + 0.35 * angularNorm);

  const baseSweep = clampMotionScalar(options.baseSweepFraction ?? 0.36, 0.12, 0.72);
  const effectiveSweep = clampMotionScalar(
    baseSweep * (0.7 + 0.32 * speedCouplingFactor),
    0.14,
    0.86,
  );
  const uEnd = focalU;
  const uStart = clampMotionScalar(uEnd - effectiveSweep, 0, Math.max(0, uEnd - 0.08));

  const subdivisions = Math.round(clampMotionScalar(options.subdivisions ?? 16, 6, 48));
  const outerMult = clampMotionScalar(options.outerWidthMultiplier ?? 1.15, 0.4, 2.8);
  const innerMult = clampMotionScalar(options.innerWidthMultiplier ?? 0.72, 0.2, 2.0);
  const baseHalfW = Math.max(3, arc.weaponWidthPx * 0.5);

  const outerEdge: ActionPoint2D[] = [];
  const innerEdge: ActionPoint2D[] = [];
  let peakWidthPx = 0;
  let angularSweepRad = 0;
  let prevTangent: ActionPoint2D | null = null;

  for (let i = 0; i <= subdivisions; i += 1) {
    const frac = i / subdivisions;
    const u = uStart + (uEnd - uStart) * frac;
    const sample = sampleActionMotionArcAt(arc, u);

    if (prevTangent !== null) {
      const dot = clampMotionScalar(
        prevTangent.x * sample.tangent.x + prevTangent.y * sample.tangent.y,
        -1,
        1,
      );
      angularSweepRad += Math.acos(dot);
    }
    prevTangent = sample.tangent;

    const leadingEnvelope = Math.pow(frac, 0.72) * (1 - 0.22 * Math.pow(frac, 4));
    const speedScale = 0.55 + 0.45 * sample.normalizedSpeed;
    const outerOffset = Math.max(
      1.2,
      baseHalfW * outerMult * speedCouplingFactor * speedScale * (0.18 + 0.82 * leadingEnvelope),
    );
    const innerOffset = Math.max(
      0.8,
      baseHalfW *
        innerMult *
        (0.75 + 0.25 * speedCouplingFactor) *
        (0.14 + 0.86 * leadingEnvelope),
    );
    const localWidth = outerOffset + innerOffset;
    if (localWidth > peakWidthPx) {
      peakWidthPx = localWidth;
    }

    outerEdge.push({
      x: sample.position.x + sample.normal.x * outerOffset,
      y: sample.position.y + sample.normal.y * outerOffset,
    });
    innerEdge.push({
      x: sample.position.x - sample.normal.x * innerOffset,
      y: sample.position.y - sample.normal.y * innerOffset,
    });
  }

  const polygon: ActionPoint2D[] = [];
  for (let i = 0; i < outerEdge.length; i += 1) {
    const pt = outerEdge[i];
    if (pt) polygon.push(pt);
  }
  for (let i = innerEdge.length - 1; i >= 0; i -= 1) {
    const pt = innerEdge[i];
    if (pt) polygon.push(pt);
  }

  const { areaPx2, centroid } = computePolygonAreaAndCentroid(polygon);
  return {
    polygon,
    outerEdge,
    innerEdge,
    uStart,
    uEnd,
    sweepLengthPx: (uEnd - uStart) * arc.totalArcLengthPx,
    angularSweepRad,
    peakWidthPx,
    areaPx2,
    centroid,
    speedCouplingFactor,
    isPositiveArea: areaPx2 > 0,
  };
}

/**
 * 지수 감쇠 알파와 시간 오프셋을 가진 다중 잔상 고스트(Afterimage Ghosts)를 생성하고
 * 알파 단조 감소 불변량을 검증한다.
 */
export function generateAfterimageGhosts(
  arc: ActionMotionArcResult,
  options: AfterimageGhostOptions = {},
): AfterimageGhostSetResult {
  const ghostCount = Math.round(clampMotionScalar(options.ghostCount ?? 5, 1, 12));
  const focalU = clampMotionScalar(options.focalU ?? 0.9, 0.25, 1);
  const trailArcFraction = clampMotionScalar(options.trailArcFraction ?? 0.56, 0.12, 0.88);
  const initialAlpha = clampMotionScalar(options.initialAlpha ?? 0.78, 0.15, 0.95);
  const alphaDecayRate = clampMotionScalar(options.alphaDecayRate ?? 0.42, 0.12, 1.5);
  const timeStepScale = clampMotionScalar(options.timeStepScale ?? 1.0, 0.4, 2.0);

  const focalSample = sampleActionMotionArcAt(arc, focalU);
  const ghosts: AfterimageGhost[] = [];
  let alphaMonotonicallyDecreasing = true;

  for (let i = 0; i < ghostCount; i += 1) {
    const ghostIndex = i + 1;
    const stepFrac = ghostIndex / (ghostCount + 0.5);
    const u = clampMotionScalar(focalU - trailArcFraction * stepFrac, 0, focalU);
    const sample = sampleActionMotionArcAt(arc, u);

    const rawDeltaMs = (sample.timeSec - focalSample.timeSec) * 1000 * timeStepScale;
    const fallbackDeltaMs = -ghostIndex * 16.667 * timeStepScale;
    const timeOffsetMs = rawDeltaMs < -0.5 ? rawDeltaMs : fallbackDeltaMs;

    const alpha = clampMotionScalar(initialAlpha * Math.exp(-alphaDecayRate * i), 0.02, 0.98);
    if (i > 0 && alpha >= (ghosts[i - 1]?.alpha ?? 1)) {
      alphaMonotonicallyDecreasing = false;
    }

    const tintPhase: "lead-hot" | "mid-trail" | "deep-echo" =
      i === 0 ? "lead-hot" : i < Math.ceil(ghostCount * 0.6) ? "mid-trail" : "deep-echo";

    ghosts.push({
      ghostIndex,
      timeOffsetMs,
      u,
      position: sample.position,
      tangent: sample.tangent,
      normal: sample.normal,
      speedPxPerSec: sample.speedPxPerSec,
      alpha,
      squashStretch: sample.squashStretch,
      tintPhase,
      oklchTint: GHOST_TINT_OKLCH[tintPhase],
    });
  }

  return {
    ghosts,
    alphaMonotonicallyDecreasing,
    maxAlpha: ghosts[0]?.alpha ?? 0,
    minAlpha: ghosts[ghosts.length - 1]?.alpha ?? 0,
    totalTrailSpanMs: Math.abs(ghosts[ghosts.length - 1]?.timeOffsetMs ?? 0),
  };
}
