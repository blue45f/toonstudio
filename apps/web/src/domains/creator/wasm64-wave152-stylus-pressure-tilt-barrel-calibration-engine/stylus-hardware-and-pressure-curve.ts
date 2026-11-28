/**
 * Wave 152 — 4종 스타일러스 하드웨어 프로파일, Fritsch-Carlson 단조 3차 에르미트 필압 곡선,
 * 기기 간 물리 하중(gf) 기반 필압 일관성 변환기.
 *
 * - Wacom Pro Pen 3(8192단계·IAF 1g), Apple Pencil Pro(배럴 롤·스퀴즈), Samsung S-Pen(4096단계),
 *   Huion PW550(8192단계) 정본 프로파일을 제공한다.
 * - Fritsch-Carlson 단조 3차 에르미트 스플라인으로 전역 단조 비감소와 오버슈트 0건을 보장한다.
 * - 소스 기기 필압 → 물리 하중(gf) 복원 → 타깃 기기 정규화 필압 역매핑을 수행한다.
 */

import {
  STYLUS_HARDWARE_IDS,
  STYLUS_HARDWARE_PROFILES,
  STYLUS_PRESSURE_CURVE_PRESETS,
  type BuildMonotonePressureCurveOptions,
  type CrossDevicePressureTranslation,
  type DeviceRoundTripAccuracyReport,
  type MonotonePressureCurve,
  type PressureCurveMonotonicityAudit,
  type PressureCurvePoint,
  type PressureCurvePresetId,
  type StylusHardwareId,
  type StylusHardwareProfile,
  type TranslateStylusPressureOptions,
} from "./stylus-calibration-types";

export {
  STYLUS_HARDWARE_IDS,
  STYLUS_HARDWARE_PROFILES,
  STYLUS_PRESSURE_CURVE_PRESETS,
  type BuildMonotonePressureCurveOptions,
  type CrossDevicePressureTranslation,
  type DeviceRoundTripAccuracyReport,
  type MonotonePressureCurve,
  type PressureCurveMonotonicityAudit,
  type PressureCurvePoint,
  type PressureCurvePresetId,
  type StylusHardwareId,
  type StylusHardwareProfile,
  type TranslateStylusPressureOptions,
};

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function clampUnit(value: number): number {
  return clampNumber(value, 0, 1);
}

/**
 * ID로 정본 스타일러스 하드웨어 프로파일을 조회한다.
 */
export function getStylusHardwareProfile(id: StylusHardwareId): StylusHardwareProfile {
  return STYLUS_HARDWARE_PROFILES[id];
}

/**
 * 등록된 4종 스타일러스 하드웨어 프로파일 목록을 고정 순서로 반환한다.
 */
export function listStylusHardwareProfiles(): readonly StylusHardwareProfile[] {
  return STYLUS_HARDWARE_IDS.map((id) => STYLUS_HARDWARE_PROFILES[id]);
}

/**
 * ID 또는 사용자 정의 프로파일을 안전한 유효 프로파일로 정규화한다.
 */
export function resolveStylusHardwareProfile(
  device: StylusHardwareId | StylusHardwareProfile,
): StylusHardwareProfile {
  if (typeof device === "string") {
    return STYLUS_HARDWARE_PROFILES[device];
  }
  const safeIaf = clampNumber(device.initialActivationForceGf, 0.1, 100);
  const safeMax = Math.max(safeIaf + 10, clampNumber(device.maxForceGf, 20, 2000));
  const safeLevels = Math.max(256, Math.round(clampNumber(device.pressureLevels, 256, 65536)));
  const safeGamma = clampNumber(device.nativeForceGamma, 0.2, 5.0);
  const safeMaxTilt = clampNumber(device.maxTiltDeg, 10, 85);
  const safePolling = clampNumber(device.pollingHz, 30, 1000);
  const safeHover = clampNumber(device.typicalHoverHeightMm, 0, 30);
  return {
    ...device,
    initialActivationForceGf: safeIaf,
    maxForceGf: safeMax,
    pressureLevels: safeLevels,
    nativeForceGamma: safeGamma,
    maxTiltDeg: safeMaxTilt,
    pollingHz: safePolling,
    typicalHoverHeightMm: safeHover,
  };
}

/**
 * 스타일러스의 정규화 필압(`[0, 1]`)을 물리 하중(gram-force)으로 복원한다.
 */
export function normalizedPressureToForceGf(
  normalizedPressure: number,
  device: StylusHardwareId | StylusHardwareProfile,
): number {
  const profile = resolveStylusHardwareProfile(device);
  if (!Number.isFinite(normalizedPressure) || normalizedPressure <= 0) {
    return 0;
  }
  const p = clampUnit(normalizedPressure);
  const span = profile.maxForceGf - profile.initialActivationForceGf;
  return profile.initialActivationForceGf + span * Math.pow(p, profile.nativeForceGamma);
}

/**
 * 물리 하중(gram-force)을 대상 스타일러스의 정규화 필압(`[0, 1]`)으로 매핑한다.
 */
export function forceGfToNormalizedPressure(
  forceGf: number,
  device: StylusHardwareId | StylusHardwareProfile,
): number {
  const profile = resolveStylusHardwareProfile(device);
  if (!Number.isFinite(forceGf) || forceGf <= profile.initialActivationForceGf) {
    return 0;
  }
  if (forceGf >= profile.maxForceGf) {
    return 1;
  }
  const span = profile.maxForceGf - profile.initialActivationForceGf;
  const normalizedSpan = (forceGf - profile.initialActivationForceGf) / span;
  return clampUnit(Math.pow(normalizedSpan, 1 / profile.nativeForceGamma));
}

/**
 * 연속 필압(`[0, 1]`)을 하드웨어 ADC 해상도(`pressureLevels`)로 양자화한다.
 */
export function quantizeStylusPressure(
  normalizedPressure: number,
  pressureLevels: number,
): { readonly quantizedPressure: number; readonly discreteStep: number } {
  const safeLevels = Math.max(2, Math.round(clampNumber(pressureLevels, 2, 65536)));
  const maxStep = safeLevels - 1;
  const clamped = clampUnit(normalizedPressure);
  const discreteStep = Math.round(clamped * maxStep);
  return {
    quantizedPressure: discreteStep / maxStep,
    discreteStep,
  };
}

/**
 * Fritsch-Carlson(1980) 단조 3차 에르미트 필압 전송 곡선을 구축한다.
 * - 입력 제어점을 `[0, 1]^2`로 정규화·정렬하고 중복 x 좌표를 병합하며 비감소 y를 강제한다.
 * - 반경 3 조건(`alpha^2 + beta^2 <= 9`)으로 구간 내부 오버슈트와 역전 기울기 0건을 보장한다.
 */
export function buildMonotonePressureCurve(
  controlPoints: readonly PressureCurvePoint[],
  options: BuildMonotonePressureCurveOptions = {},
): MonotonePressureCurve {
  const name = options.name ?? "custom-monotone-curve";
  const ensureUnitEndpoints = options.ensureUnitEndpoints ?? true;

  let sanitizedInputCount = 0;
  const rawValid: PressureCurvePoint[] = [];

  for (let i = 0; i < controlPoints.length; i += 1) {
    const pt = controlPoints[i];
    if (pt === undefined) continue;
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      sanitizedInputCount += 1;
      continue;
    }
    const cx = clampUnit(pt.x);
    const cy = clampUnit(pt.y);
    if (cx !== pt.x || cy !== pt.y) {
      sanitizedInputCount += 1;
    }
    rawValid.push({ x: cx, y: cy });
  }

  rawValid.sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));

  const deduped: PressureCurvePoint[] = [];
  const xEps = 1e-7;
  for (let i = 0; i < rawValid.length; i += 1) {
    const pt = rawValid[i];
    if (pt === undefined) continue;
    const prev = deduped[deduped.length - 1];
    if (prev !== undefined && Math.abs(pt.x - prev.x) <= xEps) {
      deduped[deduped.length - 1] = { x: prev.x, y: Math.max(prev.y, pt.y) };
      sanitizedInputCount += 1;
    } else {
      deduped.push(pt);
    }
  }

  if (ensureUnitEndpoints) {
    const first = deduped[0];
    if (first === undefined) {
      deduped.push({ x: 0, y: 0 }, { x: 1, y: 1 });
    } else {
      if (first.x > xEps) {
        deduped.unshift({ x: 0, y: 0 });
      } else {
        deduped[0] = { x: 0, y: first.y };
      }
      const last = deduped[deduped.length - 1];
      if (last === undefined || last.x < 1 - xEps) {
        deduped.push({ x: 1, y: 1 });
      } else {
        deduped[deduped.length - 1] = { x: 1, y: last.y };
      }
    }
  } else if (deduped.length < 2) {
    deduped.length = 0;
    deduped.push({ x: 0, y: 0 }, { x: 1, y: 1 });
  }

  let enforcedMonotonicityCount = 0;
  const knots: PressureCurvePoint[] = [];
  for (let i = 0; i < deduped.length; i += 1) {
    const pt = deduped[i];
    if (pt === undefined) continue;
    const prev = knots[knots.length - 1];
    if (prev !== undefined && pt.y < prev.y) {
      enforcedMonotonicityCount += 1;
      knots.push({ x: pt.x, y: prev.y });
    } else {
      knots.push(pt);
    }
  }

  const n = knots.length;
  const segmentCount = n - 1;
  const h: number[] = new Array<number>(segmentCount);
  const delta: number[] = new Array<number>(segmentCount);

  for (let k = 0; k < segmentCount; k += 1) {
    const p0 = knots[k];
    const p1 = knots[k + 1];
    if (p0 === undefined || p1 === undefined) {
      h[k] = 1;
      delta[k] = 0;
      continue;
    }
    const width = Math.max(xEps, p1.x - p0.x);
    h[k] = width;
    delta[k] = Math.max(0, (p1.y - p0.y) / width);
  }

  const tangents: number[] = new Array<number>(n);

  if (n === 2) {
    const d0 = delta[0] ?? 0;
    tangents[0] = d0;
    tangents[1] = d0;
  } else {
    for (let k = 1; k < n - 1; k += 1) {
      const dPrev = delta[k - 1] ?? 0;
      const dNext = delta[k] ?? 0;
      if (dPrev <= 0 || dNext <= 0) {
        tangents[k] = 0;
      } else {
        const hPrev = h[k - 1] ?? xEps;
        const hNext = h[k] ?? xEps;
        const w1 = 2 * hNext + hPrev;
        const w2 = hNext + 2 * hPrev;
        tangents[k] = (w1 + w2) / (w1 / dPrev + w2 / dNext);
      }
    }

    const h0 = h[0] ?? xEps;
    const h1 = h[1] ?? xEps;
    const d0 = delta[0] ?? 0;
    const d1 = delta[1] ?? 0;
    let m0 = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (d0 <= 0 || m0 < 0) {
      m0 = 0;
    } else if (m0 > 3 * d0) {
      m0 = 3 * d0;
    }
    tangents[0] = m0;

    const hLast = h[segmentCount - 1] ?? xEps;
    const hPrevLast = h[segmentCount - 2] ?? xEps;
    const dLast = delta[segmentCount - 1] ?? 0;
    const dPrevLast = delta[segmentCount - 2] ?? 0;
    let mLast = ((2 * hLast + hPrevLast) * dLast - hLast * dPrevLast) / (hLast + hPrevLast);
    if (dLast <= 0 || mLast < 0) {
      mLast = 0;
    } else if (mLast > 3 * dLast) {
      mLast = 3 * dLast;
    }
    tangents[n - 1] = mLast;
  }

  for (let k = 0; k < segmentCount; k += 1) {
    const dk = delta[k] ?? 0;
    if (dk <= 0) {
      tangents[k] = 0;
      tangents[k + 1] = 0;
      continue;
    }
    const mk = Math.max(0, tangents[k] ?? 0);
    const mk1 = Math.max(0, tangents[k + 1] ?? 0);
    const alpha = mk / dk;
    const beta = mk1 / dk;
    const radiusSq = alpha * alpha + beta * beta;
    if (radiusSq > 9) {
      const tau = 3 / Math.sqrt(radiusSq);
      tangents[k] = tau * alpha * dk;
      tangents[k + 1] = tau * beta * dk;
    } else {
      tangents[k] = mk;
      tangents[k + 1] = mk1;
    }
  }

  return {
    name,
    knots,
    tangents,
    segmentWidths: h,
    secantSlopes: delta,
    sanitizedInputCount,
    enforcedMonotonicityCount,
  };
}

/**
 * 내장 프리셋 ID로 단조 3차 에르미트 필압 곡선을 즉시 생성한다.
 */
export function buildPresetPressureCurve(presetId: PressureCurvePresetId): MonotonePressureCurve {
  return buildMonotonePressureCurve(STYLUS_PRESSURE_CURVE_PRESETS[presetId], {
    name: presetId,
    ensureUnitEndpoints: true,
  });
}

/**
 * Fritsch-Carlson 단조 3차 에르미트 곡선에서 입력 필압 `rawPressure ∈ [0, 1]`의 출력값을 평가한다.
 */
export function evaluatePressureCurve(
  curve: MonotonePressureCurve,
  rawPressure: number,
): number {
  if (!Number.isFinite(rawPressure)) return 0;
  const knots = curve.knots;
  const n = knots.length;
  if (n === 0) return clampUnit(rawPressure);
  if (n === 1) return clampUnit(knots[0]?.y ?? 0);

  const x = clampUnit(rawPressure);
  const first = knots[0];
  const last = knots[n - 1];
  if (first === undefined || last === undefined) return x;
  if (x <= first.x) return clampUnit(first.y);
  if (x >= last.x) return clampUnit(last.y);

  let lo = 0;
  let hi = n - 2;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const left = knots[mid];
    const right = knots[mid + 1];
    if (left === undefined || right === undefined) break;
    if (x < left.x) {
      hi = mid - 1;
    } else if (x > right.x) {
      lo = mid + 1;
    } else {
      lo = mid;
      break;
    }
  }

  const k = Math.min(Math.max(lo, 0), n - 2);
  const p0 = knots[k];
  const p1 = knots[k + 1];
  if (p0 === undefined || p1 === undefined) return x;

  const hk = Math.max(1e-12, curve.segmentWidths[k] ?? p1.x - p0.x);
  const t = clampUnit((x - p0.x) / hk);
  const t2 = t * t;
  const t3 = t2 * t;

  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  const m0 = curve.tangents[k] ?? 0;
  const m1 = curve.tangents[k + 1] ?? 0;

  const rawY = h00 * p0.y + h10 * hk * m0 + h01 * p1.y + h11 * hk * m1;
  const boundedY = clampNumber(rawY, Math.min(p0.y, p1.y), Math.max(p0.y, p1.y));
  return clampUnit(boundedY);
}

/**
 * 지정된 샘플 수(기본 1000점)에 대해 필압 곡선의 전역 단조 비감소 및 오버슈트 0건 여부를 감사한다.
 */
export function auditPressureCurveMonotonicity(
  curve: MonotonePressureCurve,
  sampleCount = 1000,
): PressureCurveMonotonicityAudit {
  const safeCount = Math.max(2, Math.round(clampNumber(sampleCount, 2, 20000)));
  let prev = evaluatePressureCurve(curve, 0);
  let violationCount = 0;
  let overshootCount = prev < 0 || prev > 1 ? 1 : 0;
  let minOutput = prev;
  let maxOutput = prev;
  let maxNegativeStep = 0;

  for (let i = 1; i < safeCount; i += 1) {
    const x = i / (safeCount - 1);
    const y = evaluatePressureCurve(curve, x);
    if (y < 0 || y > 1 || !Number.isFinite(y)) {
      overshootCount += 1;
    }
    if (y < prev - 1e-12) {
      violationCount += 1;
      maxNegativeStep = Math.max(maxNegativeStep, prev - y);
    }
    if (y < minOutput) minOutput = y;
    if (y > maxOutput) maxOutput = y;
    prev = y;
  }

  return {
    sampleCount: safeCount,
    isGloballyMonotoneNonDecreasing: violationCount === 0 && overshootCount === 0,
    violationCount,
    overshootCount,
    minOutput,
    maxOutput,
    maxNegativeStep,
  };
}

/**
 * 소스 스타일러스의 정규화 필압을 물리 하중(gf)으로 복원한 뒤 타깃 스타일러스의 정규화 필압으로 변환한다.
 */
export function translateStylusPressureAcrossDevices(
  options: TranslateStylusPressureOptions,
): CrossDevicePressureTranslation {
  const sourceProfile = resolveStylusHardwareProfile(options.sourceDevice);
  const targetProfile = resolveStylusHardwareProfile(options.targetDevice);
  const clampedSource = clampUnit(options.sourcePressure);

  const physicalForceGf = normalizedPressureToForceGf(clampedSource, sourceProfile);
  const targetPressure = forceGfToNormalizedPressure(physicalForceGf, targetProfile);
  const { quantizedPressure, discreteStep } = quantizeStylusPressure(
    targetPressure,
    targetProfile.pressureLevels,
  );

  const sharedForceMinGf = Math.max(
    sourceProfile.initialActivationForceGf,
    targetProfile.initialActivationForceGf,
  );
  const sharedForceMaxGf = Math.min(sourceProfile.maxForceGf, targetProfile.maxForceGf);

  const clampedBelowIaf =
    physicalForceGf > 0 && physicalForceGf < targetProfile.initialActivationForceGf;
  const clampedAboveMaxForce = physicalForceGf > targetProfile.maxForceGf;
  const deadZoneDeficitGf = clampedBelowIaf
    ? targetProfile.initialActivationForceGf - physicalForceGf
    : 0;
  const inSharedForceRange =
    physicalForceGf >= sharedForceMinGf && physicalForceGf <= sharedForceMaxGf;

  const roundTripForceGf = normalizedPressureToForceGf(targetPressure, targetProfile);
  const roundTripSourcePressure = forceGfToNormalizedPressure(roundTripForceGf, sourceProfile);
  const roundTripError = Math.abs(roundTripSourcePressure - clampedSource);

  const effectiveBrushPressure =
    options.artistCurve !== undefined
      ? evaluatePressureCurve(options.artistCurve, targetPressure)
      : targetPressure;

  return {
    sourceDeviceId: sourceProfile.id,
    targetDeviceId: targetProfile.id,
    sourcePressure: clampedSource,
    physicalForceGf,
    targetPressure,
    targetPressureQuantized: quantizedPressure,
    targetPressureStep: discreteStep,
    effectiveBrushPressure,
    inSharedForceRange,
    clampedBelowIaf,
    clampedAboveMaxForce,
    deadZoneDeficitGf,
    sharedForceMinGf,
    sharedForceMaxGf,
    roundTripSourcePressure,
    roundTripError,
  };
}

/**
 * 두 기기 간 공유 물리 하중 구간 전체에 대해 왕복(`A → B → A`) 필압 보존 정확도를 측정한다.
 */
export function measureDeviceRoundTripAccuracy(
  sourceDevice: StylusHardwareId | StylusHardwareProfile,
  targetDevice: StylusHardwareId | StylusHardwareProfile,
  sampleCount = 200,
): DeviceRoundTripAccuracyReport {
  const sourceProfile = resolveStylusHardwareProfile(sourceDevice);
  const targetProfile = resolveStylusHardwareProfile(targetDevice);
  const sharedForceMinGf = Math.max(
    sourceProfile.initialActivationForceGf,
    targetProfile.initialActivationForceGf,
  );
  const sharedForceMaxGf = Math.min(sourceProfile.maxForceGf, targetProfile.maxForceGf);
  const safeSamples = Math.max(5, Math.round(clampNumber(sampleCount, 5, 5000)));

  if (sharedForceMaxGf <= sharedForceMinGf) {
    return {
      sourceDeviceId: sourceProfile.id,
      targetDeviceId: targetProfile.id,
      sharedForceMinGf,
      sharedForceMaxGf,
      testedSampleCount: 0,
      maxRoundTripError: 1,
      meanRoundTripError: 1,
      passesStrictThreshold: false,
    };
  }

  let maxRoundTripError = 0;
  let sumError = 0;
  const span = sharedForceMaxGf - sharedForceMinGf;

  for (let i = 0; i < safeSamples; i += 1) {
    const ratio = 0.005 + (0.99 * i) / (safeSamples - 1);
    const forceGf = sharedForceMinGf + span * ratio;
    const sourcePressure = forceGfToNormalizedPressure(forceGf, sourceProfile);
    const translated = translateStylusPressureAcrossDevices({
      sourceDevice: sourceProfile,
      targetDevice: targetProfile,
      sourcePressure,
    });
    if (translated.roundTripError > maxRoundTripError) {
      maxRoundTripError = translated.roundTripError;
    }
    sumError += translated.roundTripError;
  }

  const meanRoundTripError = sumError / safeSamples;
  return {
    sourceDeviceId: sourceProfile.id,
    targetDeviceId: targetProfile.id,
    sharedForceMinGf,
    sharedForceMaxGf,
    testedSampleCount: safeSamples,
    maxRoundTripError,
    meanRoundTripError,
    passesStrictThreshold: maxRoundTripError < 1e-4,
  };
}
