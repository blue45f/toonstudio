/**
 * Wave 152 — 기울기 이방성·배럴 롤 언랩 재노출, 속도 적응 One-Euro 지터 보정기,
 * 고정 EMA 대조 벤치마크 및 통합 캘리브레이션 번들 빌더.
 */

import {
  computeChiselNibStampGeometry,
  normalizeAngle360,
  resolveEffectiveNibRotationDeg,
  shortestAngularDeltaDeg,
  tiltXYToAltitudeAzimuthDeg,
  unwrapBarrelRollAnglesDeg,
} from "./stylus-barrel-and-chisel-geometry";
import {
  DEFAULT_ONE_EURO_CONFIG,
  STYLUS_PRESSURE_CURVE_PRESETS,
  type BarrelRollFallbackPolicy,
  type BarrelRollUnwrapResult,
  type ChiselNibStampGeometry,
  type ChiselNibStampInput,
  type ChiselNibStyle,
  type EffectiveNibRotationInput,
  type EffectiveNibRotationResult,
  type FilteredStylusStrokeSample,
  type FixedEmaBaselineResult,
  type FixedEmaVsOneEuroComparison,
  type NibRotationSource,
  type OneEuroFilterConfig,
  type OneEuroFilterResult,
  type ResolvedOneEuroFilterConfig,
  type StylusCalibrationBundle,
  type StylusCalibrationBundleInput,
  type StylusRawStrokeSample,
  type TiltAltitudeAzimuthResult,
} from "./stylus-calibration-types";
import {
  auditPressureCurveMonotonicity,
  buildMonotonePressureCurve,
  measureDeviceRoundTripAccuracy,
  resolveStylusHardwareProfile,
} from "./stylus-hardware-and-pressure-curve";
import { computeCalibrationManifestSha256Hex } from "./stylus-sha256-and-canonical";

export {
  computeChiselNibStampGeometry,
  DEFAULT_ONE_EURO_CONFIG,
  normalizeAngle360,
  resolveEffectiveNibRotationDeg,
  shortestAngularDeltaDeg,
  tiltXYToAltitudeAzimuthDeg,
  unwrapBarrelRollAnglesDeg,
  type BarrelRollFallbackPolicy,
  type BarrelRollUnwrapResult,
  type ChiselNibStampGeometry,
  type ChiselNibStampInput,
  type ChiselNibStyle,
  type EffectiveNibRotationInput,
  type EffectiveNibRotationResult,
  type FilteredStylusStrokeSample,
  type FixedEmaBaselineResult,
  type FixedEmaVsOneEuroComparison,
  type NibRotationSource,
  type OneEuroFilterConfig,
  type OneEuroFilterResult,
  type ResolvedOneEuroFilterConfig,
  type StylusCalibrationBundle,
  type StylusCalibrationBundleInput,
  type StylusRawStrokeSample,
  type TiltAltitudeAzimuthResult,
};

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function resolveOneEuroConfig(config: OneEuroFilterConfig = {}): ResolvedOneEuroFilterConfig {
  return {
    minCutoffHz: clampNumber(
      config.minCutoffHz ?? DEFAULT_ONE_EURO_CONFIG.minCutoffHz,
      0.05,
      60,
    ),
    beta: clampNumber(config.beta ?? DEFAULT_ONE_EURO_CONFIG.beta, 0, 2),
    dCutoffHz: clampNumber(config.dCutoffHz ?? DEFAULT_ONE_EURO_CONFIG.dCutoffHz, 0.1, 60),
    defaultPollingHz: clampNumber(
      config.defaultPollingHz ?? DEFAULT_ONE_EURO_CONFIG.defaultPollingHz,
      30,
      1000,
    ),
    slowSpeedThresholdPxPerSec: clampNumber(
      config.slowSpeedThresholdPxPerSec ?? DEFAULT_ONE_EURO_CONFIG.slowSpeedThresholdPxPerSec,
      10,
      2000,
    ),
    highSpeedThresholdPxPerSec: clampNumber(
      config.highSpeedThresholdPxPerSec ?? DEFAULT_ONE_EURO_CONFIG.highSpeedThresholdPxPerSec,
      50,
      10000,
    ),
  };
}

function computeSmoothingAlpha(cutoffHz: number, dtSec: number): number {
  const twoPiFcDt = 2 * Math.PI * cutoffHz * dtSec;
  return twoPiFcDt / (1 + twoPiFcDt);
}

function computeSecondDiffJitterRms(
  points: readonly { readonly x: number; readonly y: number }[],
  includeMask?: readonly boolean[],
): number {
  if (points.length < 3) return 0;
  let sumSq = 0;
  let count = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    if (includeMask !== undefined && includeMask[i] !== true) continue;
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    if (prev === undefined || curr === undefined || next === undefined) continue;
    const midX = 0.5 * (prev.x + next.x);
    const midY = 0.5 * (prev.y + next.y);
    const dx = curr.x - midX;
    const dy = curr.y - midY;
    sumSq += dx * dx + dy * dy;
    count += 1;
  }
  return count > 0 ? Math.sqrt(sumSq / count) : 0;
}

/**
 * 속도 적응 One-Euro 저역 통과 필터로 스타일러스 스트로크의 손떨림 지터를 보정한다.
 */
export function filterStylusStrokeOneEuro(
  samples: readonly StylusRawStrokeSample[],
  config: OneEuroFilterConfig = {},
): OneEuroFilterResult {
  const resolved = resolveOneEuroConfig(config);
  if (samples.length === 0) {
    return {
      config: resolved,
      filteredSamples: [],
      rawJitterRmsPx: 0,
      filteredJitterRmsPx: 0,
      jitterReductionPercent: 0,
      lowSpeedRawJitterRmsPx: 0,
      lowSpeedFilteredJitterRmsPx: 0,
      lowSpeedJitterReductionPercent: 0,
      highSpeedLagPx: 0,
      meanTrackingDeviationPx: 0,
      maxTrackingDeviationPx: 0,
      sanitizedFieldCount: 0,
      nonMonotonicTimestampCount: 0,
    };
  }

  const defaultDtMs = 1000 / resolved.defaultPollingHz;
  let sanitizedFieldCount = 0;
  let nonMonotonicTimestampCount = 0;

  const sanitized: {
    x: number;
    y: number;
    timestampMs: number;
    pressure: number;
    barrelRollDeg: number | null;
  }[] = [];

  let lastX = 0;
  let lastY = 0;
  let lastTimeMs = 0;
  let lastPressure = 0.5;
  const validBarrelIndices: number[] = [];
  const validBarrelAngles: number[] = [];

  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (s === undefined) continue;

    let x = s.x;
    if (!Number.isFinite(x)) {
      sanitizedFieldCount += 1;
      x = lastX;
    } else {
      lastX = x;
    }

    let y = s.y;
    if (!Number.isFinite(y)) {
      sanitizedFieldCount += 1;
      y = lastY;
    } else {
      lastY = y;
    }

    let timestampMs = s.timestampMs;
    if (!Number.isFinite(timestampMs)) {
      sanitizedFieldCount += 1;
      timestampMs = i === 0 ? 0 : lastTimeMs + defaultDtMs;
    } else if (i > 0 && timestampMs <= lastTimeMs) {
      nonMonotonicTimestampCount += 1;
      timestampMs = lastTimeMs + defaultDtMs;
    }
    lastTimeMs = timestampMs;

    let pressure = lastPressure;
    if (s.pressure !== undefined) {
      if (!Number.isFinite(s.pressure)) {
        sanitizedFieldCount += 1;
      } else {
        pressure = clampNumber(s.pressure, 0, 1);
        lastPressure = pressure;
      }
    }

    let barrelRollDeg: number | null = null;
    if (s.barrelRollDeg !== undefined) {
      if (Number.isFinite(s.barrelRollDeg)) {
        barrelRollDeg = s.barrelRollDeg;
        validBarrelIndices.push(i);
        validBarrelAngles.push(s.barrelRollDeg);
      } else {
        sanitizedFieldCount += 1;
      }
    }

    sanitized.push({ x, y, timestampMs, pressure, barrelRollDeg });
  }

  const unwrappedBarrelMap = new Map<number, number>();
  if (validBarrelAngles.length > 0) {
    const unwrapped = unwrapBarrelRollAnglesDeg(validBarrelAngles);
    for (let i = 0; i < validBarrelIndices.length; i += 1) {
      const idx = validBarrelIndices[i];
      const angle = unwrapped.unwrappedAnglesDeg[i];
      if (idx !== undefined && angle !== undefined) {
        unwrappedBarrelMap.set(idx, angle);
      }
    }
  }

  const first = sanitized[0];
  if (first === undefined) {
    return {
      config: resolved,
      filteredSamples: [],
      rawJitterRmsPx: 0,
      filteredJitterRmsPx: 0,
      jitterReductionPercent: 0,
      lowSpeedRawJitterRmsPx: 0,
      lowSpeedFilteredJitterRmsPx: 0,
      lowSpeedJitterReductionPercent: 0,
      highSpeedLagPx: 0,
      meanTrackingDeviationPx: 0,
      maxTrackingDeviationPx: 0,
      sanitizedFieldCount,
      nonMonotonicTimestampCount,
    };
  }

  let xHat = first.x;
  let yHat = first.y;
  let pHat = first.pressure;
  let dxHat = 0;
  let dyHat = 0;
  let dpHat = 0;

  const filteredSamples: FilteredStylusStrokeSample[] = [
    {
      x: xHat,
      y: yHat,
      rawX: first.x,
      rawY: first.y,
      timestampMs: first.timestampMs,
      pressure: pHat,
      speedPxPerSec: 0,
      effectiveCutoffHz: resolved.minCutoffHz,
      alpha: 1,
      unwrappedBarrelRollDeg: unwrappedBarrelMap.get(0) ?? null,
      trackingDeltaPx: 0,
    },
  ];

  let trackingDeltaSum = 0;
  let maxTrackingDeviationPx = 0;
  let highSpeedLagSum = 0;
  let highSpeedCount = 0;
  const lowSpeedMask: boolean[] = [true];

  for (let i = 1; i < sanitized.length; i += 1) {
    const prev = sanitized[i - 1];
    const curr = sanitized[i];
    if (prev === undefined || curr === undefined) continue;

    const dtSec = Math.max(1e-4, (curr.timestampMs - prev.timestampMs) / 1000);
    const alphaD = computeSmoothingAlpha(resolved.dCutoffHz, dtSec);

    const rawDx = (curr.x - prev.x) / dtSec;
    const rawDy = (curr.y - prev.y) / dtSec;
    const rawDp = (curr.pressure - prev.pressure) / dtSec;

    dxHat = alphaD * rawDx + (1 - alphaD) * dxHat;
    dyHat = alphaD * rawDy + (1 - alphaD) * dyHat;
    dpHat = alphaD * rawDp + (1 - alphaD) * dpHat;

    const speedPxPerSec = Math.hypot(dxHat, dyHat);
    const cutoffHz = resolved.minCutoffHz + resolved.beta * speedPxPerSec;
    const alphaX = computeSmoothingAlpha(cutoffHz, dtSec);

    xHat = alphaX * curr.x + (1 - alphaX) * xHat;
    yHat = alphaX * curr.y + (1 - alphaX) * yHat;

    const pCutoffHz = resolved.minCutoffHz + resolved.beta * 150 * Math.abs(dpHat);
    const alphaP = computeSmoothingAlpha(pCutoffHz, dtSec);
    pHat = clampNumber(alphaP * curr.pressure + (1 - alphaP) * pHat, 0, 1);

    const trackingDeltaPx = Math.hypot(curr.x - xHat, curr.y - yHat);
    trackingDeltaSum += trackingDeltaPx;
    if (trackingDeltaPx > maxTrackingDeviationPx) {
      maxTrackingDeviationPx = trackingDeltaPx;
    }

    lowSpeedMask.push(speedPxPerSec <= resolved.slowSpeedThresholdPxPerSec);
    if (speedPxPerSec >= resolved.highSpeedThresholdPxPerSec) {
      highSpeedLagSum += trackingDeltaPx;
      highSpeedCount += 1;
    }

    filteredSamples.push({
      x: xHat,
      y: yHat,
      rawX: curr.x,
      rawY: curr.y,
      timestampMs: curr.timestampMs,
      pressure: pHat,
      speedPxPerSec,
      effectiveCutoffHz: cutoffHz,
      alpha: alphaX,
      unwrappedBarrelRollDeg: unwrappedBarrelMap.get(i) ?? null,
      trackingDeltaPx,
    });
  }

  const rawPoints = filteredSamples.map((s) => ({ x: s.rawX, y: s.rawY }));
  const filteredPoints = filteredSamples.map((s) => ({ x: s.x, y: s.y }));

  const rawJitterRmsPx = computeSecondDiffJitterRms(rawPoints);
  const filteredJitterRmsPx = computeSecondDiffJitterRms(filteredPoints);
  const jitterReductionPercent =
    rawJitterRmsPx > 1e-9
      ? clampNumber((1 - filteredJitterRmsPx / rawJitterRmsPx) * 100, 0, 100)
      : 0;

  const lowSpeedRawJitterRmsPx = computeSecondDiffJitterRms(rawPoints, lowSpeedMask);
  const lowSpeedFilteredJitterRmsPx = computeSecondDiffJitterRms(filteredPoints, lowSpeedMask);
  const lowSpeedJitterReductionPercent =
    lowSpeedRawJitterRmsPx > 1e-9
      ? clampNumber((1 - lowSpeedFilteredJitterRmsPx / lowSpeedRawJitterRmsPx) * 100, 0, 100)
      : jitterReductionPercent;

  const meanTrackingDeviationPx =
    filteredSamples.length > 1 ? trackingDeltaSum / (filteredSamples.length - 1) : 0;
  const highSpeedLagPx =
    highSpeedCount > 0 ? highSpeedLagSum / highSpeedCount : meanTrackingDeviationPx;

  return {
    config: resolved,
    filteredSamples,
    rawJitterRmsPx,
    filteredJitterRmsPx,
    jitterReductionPercent,
    lowSpeedRawJitterRmsPx,
    lowSpeedFilteredJitterRmsPx,
    lowSpeedJitterReductionPercent,
    highSpeedLagPx,
    meanTrackingDeviationPx,
    maxTrackingDeviationPx,
    sanitizedFieldCount,
    nonMonotonicTimestampCount,
  };
}

/**
 * 단순 고정 알파 EMA와 속도 적응 One-Euro 필터를 동일 스트로크에서 비교한다.
 */
export function compareFixedEmaVsOneEuroStylus(
  samples: readonly StylusRawStrokeSample[],
  options: {
    readonly oneEuroConfig?: OneEuroFilterConfig;
    readonly fixedEmaAlpha?: number;
  } = {},
): FixedEmaVsOneEuroComparison {
  const oneEuro = filterStylusStrokeOneEuro(samples, options.oneEuroConfig);
  const fixedAlpha = clampNumber(options.fixedEmaAlpha ?? 0.08, 0.01, 0.99);

  if (oneEuro.filteredSamples.length === 0) {
    return {
      oneEuro,
      fixedEma: {
        fixedAlpha,
        filteredPoints: [],
        rawJitterRmsPx: 0,
        filteredJitterRmsPx: 0,
        jitterReductionPercent: 0,
        lowSpeedFilteredJitterRmsPx: 0,
        highSpeedLagPx: 0,
        meanTrackingDeviationPx: 0,
      },
      highSpeedLagReductionPercent: 0,
      highSpeedLagRatio: 1,
      oneEuroOutperformsFixedEma: false,
    };
  }

  const first = oneEuro.filteredSamples[0];
  let emaX = first?.rawX ?? 0;
  let emaY = first?.rawY ?? 0;
  const fixedPoints: { readonly x: number; readonly y: number }[] = [{ x: emaX, y: emaY }];
  const lowSpeedMask = oneEuro.filteredSamples.map(
    (s) => s.speedPxPerSec <= oneEuro.config.slowSpeedThresholdPxPerSec,
  );

  let deltaSum = 0;
  let highSpeedLagSum = 0;
  let highSpeedCount = 0;

  for (let i = 1; i < oneEuro.filteredSamples.length; i += 1) {
    const s = oneEuro.filteredSamples[i];
    if (s === undefined) continue;
    emaX = fixedAlpha * s.rawX + (1 - fixedAlpha) * emaX;
    emaY = fixedAlpha * s.rawY + (1 - fixedAlpha) * emaY;
    fixedPoints.push({ x: emaX, y: emaY });

    const lag = Math.hypot(s.rawX - emaX, s.rawY - emaY);
    deltaSum += lag;
    if (s.speedPxPerSec >= oneEuro.config.highSpeedThresholdPxPerSec) {
      highSpeedLagSum += lag;
      highSpeedCount += 1;
    }
  }

  const rawJitterRmsPx = oneEuro.rawJitterRmsPx;
  const fixedFilteredJitterRmsPx = computeSecondDiffJitterRms(fixedPoints);
  const fixedJitterReductionPercent =
    rawJitterRmsPx > 1e-9
      ? clampNumber((1 - fixedFilteredJitterRmsPx / rawJitterRmsPx) * 100, 0, 100)
      : 0;
  const lowSpeedFilteredJitterRmsPx = computeSecondDiffJitterRms(fixedPoints, lowSpeedMask);
  const meanTrackingDeviationPx =
    oneEuro.filteredSamples.length > 1
      ? deltaSum / (oneEuro.filteredSamples.length - 1)
      : 0;
  const fixedHighSpeedLagPx =
    highSpeedCount > 0 ? highSpeedLagSum / highSpeedCount : meanTrackingDeviationPx;

  const highSpeedLagReductionPercent =
    fixedHighSpeedLagPx > 1e-9
      ? clampNumber((1 - oneEuro.highSpeedLagPx / fixedHighSpeedLagPx) * 100, 0, 100)
      : 0;
  const highSpeedLagRatio =
    oneEuro.highSpeedLagPx > 1e-9 ? fixedHighSpeedLagPx / oneEuro.highSpeedLagPx : 1;

  const oneEuroOutperformsFixedEma =
    oneEuro.highSpeedLagPx < fixedHighSpeedLagPx &&
    oneEuro.lowSpeedJitterReductionPercent >= 50;

  return {
    oneEuro,
    fixedEma: {
      fixedAlpha,
      filteredPoints: fixedPoints,
      rawJitterRmsPx,
      filteredJitterRmsPx: fixedFilteredJitterRmsPx,
      jitterReductionPercent: fixedJitterReductionPercent,
      lowSpeedFilteredJitterRmsPx,
      highSpeedLagPx: fixedHighSpeedLagPx,
      meanTrackingDeviationPx,
    },
    highSpeedLagReductionPercent,
    highSpeedLagRatio,
    oneEuroOutperformsFixedEma,
  };
}

/**
 * 결정론적 합성 2단 속도 테스트 스트로크(저속 정밀 선화 + 고속 휘두름)를 생성한다.
 */
export function buildSyntheticBenchmarkStylusStroke(
  pollingHz = 240,
): readonly StylusRawStrokeSample[] {
  const safeHz = clampNumber(pollingHz, 60, 500);
  const dtMs = 1000 / safeHz;
  const samples: StylusRawStrokeSample[] = [];
  let x = 20;
  let y = 120;
  let tMs = 0;

  const slowSteps = Math.round(safeHz * 0.45);
  for (let i = 0; i < slowSteps; i += 1) {
    samples.push({
      x: x + Math.sin(i * 1.9) * 1.4,
      y: y + Math.cos(i * 2.3) * 2.1,
      timestampMs: tMs,
      pressure: clampNumber(0.3 + 0.25 * (i / Math.max(1, slowSteps - 1)), 0, 1),
      altitudeDeg: 78,
      azimuthDeg: 35,
      barrelRollDeg: normalizeAngle360(350 + i * 0.6),
    });
    x += 60 / safeHz;
    y += 12 / safeHz;
    tMs += dtMs;
  }

  const fastSteps = Math.round(safeHz * 0.28);
  for (let i = 0; i < fastSteps; i += 1) {
    samples.push({
      x,
      y: y + Math.sin(i * 2.1) * 0.4,
      timestampMs: tMs,
      pressure: clampNumber(0.55 - 0.35 * (i / Math.max(1, fastSteps - 1)), 0.05, 1),
      altitudeDeg: 42,
      azimuthDeg: 45,
      barrelRollDeg: normalizeAngle360(355 + i * 2.2),
    });
    x += 1750 / safeHz;
    y -= 280 / safeHz;
    tMs += dtMs;
  }

  return samples;
}

/**
 * 4종 하드웨어 프로파일·단조 필압 곡선·배럴 롤 언랩·치즐 닙 기하·One-Euro 지터 필터를 통합 실행하고
 * 순수 ES2017 동기 FIPS 180-4 SHA-256 캘리브레이션 매니페스트 지문을 생성한다.
 */
export function buildStylusCalibrationBundle(
  input: StylusCalibrationBundleInput,
): StylusCalibrationBundle {
  const sourceProfile = resolveStylusHardwareProfile(input.sourceDevice);
  const targetProfile = resolveStylusHardwareProfile(input.targetDevice);

  const curvePoints =
    input.pressureCurvePoints ?? STYLUS_PRESSURE_CURVE_PRESETS["g-pen-ink-snap"];
  const pressureCurve = buildMonotonePressureCurve(curvePoints, {
    name: input.pressureCurveName ?? "studio-ink-curve",
    ensureUnitEndpoints: true,
  });
  const monotonicityAudit = auditPressureCurveMonotonicity(pressureCurve, 1000);
  const roundTripReport = measureDeviceRoundTripAccuracy(sourceProfile, targetProfile, 200);

  const barrelRollSamples = input.barrelRollSamplesDeg ?? [
    346, 352, 358, 2, 8, 14, 6, 359, 353,
  ];
  const barrelRollUnwrap = unwrapBarrelRollAnglesDeg(barrelRollSamples);

  const sampleSizePx = input.sampleBaseBrushSizePx ?? 14;
  const samplePressure = input.samplePressure ?? 0.65;
  const sampleAzimuth = input.sampleTiltAzimuthDeg ?? 42;
  const sampleTangent = input.sampleStrokeTangentDeg ?? 18;
  const sampleBarrel = barrelRollSamples[2] ?? 358;
  const nibStyle = input.nibStyle ?? "flat-chisel";

  const verticalStamp = computeChiselNibStampGeometry({
    device: targetProfile,
    baseBrushSizePx: sampleSizePx,
    pressure: samplePressure,
    altitudeDeg: 90,
    azimuthDeg: sampleAzimuth,
    barrelRollDeg: sampleBarrel,
    strokeTangentDeg: sampleTangent,
    nibStyle,
  });
  const midTiltStamp = computeChiselNibStampGeometry({
    device: targetProfile,
    baseBrushSizePx: sampleSizePx,
    pressure: samplePressure,
    altitudeDeg: 55,
    azimuthDeg: sampleAzimuth,
    barrelRollDeg: sampleBarrel,
    strokeTangentDeg: sampleTangent,
    nibStyle,
  });
  const lowTiltStamp = computeChiselNibStampGeometry({
    device: targetProfile,
    baseBrushSizePx: sampleSizePx,
    pressure: samplePressure,
    altitudeDeg: 24,
    azimuthDeg: sampleAzimuth,
    barrelRollDeg: sampleBarrel,
    strokeTangentDeg: sampleTangent,
    nibStyle,
  });

  const strokeSamples =
    input.strokeSamples ?? buildSyntheticBenchmarkStylusStroke(targetProfile.pollingHz);
  const filterComparison = compareFixedEmaVsOneEuroStylus(strokeSamples, {
    oneEuroConfig: input.oneEuroConfig,
    fixedEmaAlpha: input.fixedEmaAlpha,
  });

  const manifestPayload = {
    schemaVersion: "wave152.stylus-calibration.v1",
    sourceDevice: {
      id: sourceProfile.id,
      iafGf: sourceProfile.initialActivationForceGf,
      maxForceGf: sourceProfile.maxForceGf,
      levels: sourceProfile.pressureLevels,
      gamma: sourceProfile.nativeForceGamma,
    },
    targetDevice: {
      id: targetProfile.id,
      iafGf: targetProfile.initialActivationForceGf,
      maxForceGf: targetProfile.maxForceGf,
      levels: targetProfile.pressureLevels,
      gamma: targetProfile.nativeForceGamma,
      supportsBarrelRoll: targetProfile.supportsBarrelRoll,
      supportsSqueeze: targetProfile.supportsSqueeze,
    },
    pressureCurve: {
      name: pressureCurve.name,
      knots: pressureCurve.knots,
      monotone: monotonicityAudit.isGloballyMonotoneNonDecreasing,
    },
    roundTripMaxError: roundTripReport.maxRoundTripError,
    barrelRollFlipGlitches: barrelRollUnwrap.flipGlitchCount,
    nibGeometry: {
      nibStyle,
      verticalAspectRatio: verticalStamp.aspectRatio,
      lowTiltAspectRatio: lowTiltStamp.aspectRatio,
      rotationSource: lowTiltStamp.rotationSource,
    },
    oneEuroConfig: filterComparison.oneEuro.config,
  };

  const calibrationManifestSha256Hex = computeCalibrationManifestSha256Hex(manifestPayload);

  return {
    sourceProfile,
    targetProfile,
    pressureCurve,
    monotonicityAudit,
    roundTripReport,
    barrelRollUnwrap,
    verticalStamp,
    midTiltStamp,
    lowTiltStamp,
    filterComparison,
    calibrationManifestSha256Hex,
  };
}
