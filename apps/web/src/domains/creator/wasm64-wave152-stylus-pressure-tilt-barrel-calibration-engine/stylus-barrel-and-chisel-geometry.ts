/**
 * Wave 152 — 배럴 롤 최단각 연속 언랩(360° 플립 0건), 미지원 기기 결정론적 폴백
 * 및 기울기-치즐 닙 이방성 기하 커널.
 */

import type {
  BarrelRollUnwrapResult,
  ChiselNibStampGeometry,
  ChiselNibStampInput,
  EffectiveNibRotationInput,
  EffectiveNibRotationResult,
  TiltAltitudeAzimuthResult,
} from "./stylus-calibration-types";
import { resolveStylusHardwareProfile } from "./stylus-hardware-and-pressure-curve";

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function positiveMod(value: number, modulus: number): number {
  const rem = value % modulus;
  return rem < 0 ? rem + modulus : rem;
}

/**
 * 임의 각도(도)를 `[0, 360)` 범위로 정규화한다. 비유한 값은 `0`으로 방어한다.
 */
export function normalizeAngle360(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const wrapped = positiveMod(deg, 360);
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

/**
 * 두 래핑 각도 사이의 부호 있는 최단 회전 차분(`[-180, 180)`)을 반환한다.
 */
export function shortestAngularDeltaDeg(fromDeg: number, toDeg: number): number {
  const a = normalizeAngle360(fromDeg);
  const b = normalizeAngle360(toDeg);
  const delta = positiveMod(b - a + 180, 360) - 180;
  return Object.is(delta, -0) ? 0 : delta;
}

/**
 * 배럴 롤 원시 각도 시퀀스를 최단각 연속 각도로 언랩한다.
 * - `358° → 2°`는 `358° → 362°`(+4°), `1° → 359°`는 `1° → -1°`(-2°)로 보간한다.
 * - 모든 연속 스텝의 절대 변화량을 `<= 180°`로 유지하여 360° 플립 글리치 0건을 보장한다.
 */
export function unwrapBarrelRollAnglesDeg(
  rawAnglesDeg: readonly number[],
): BarrelRollUnwrapResult {
  if (rawAnglesDeg.length === 0) {
    return {
      unwrappedAnglesDeg: [],
      stepDeltasDeg: [],
      maxAbsStepDeg: 0,
      rawWrapJumpCount: 0,
      flipGlitchCount: 0,
      totalRotationDeg: 0,
      sanitizedSampleCount: 0,
    };
  }

  let sanitizedSampleCount = 0;
  let lastValidWrapped = 0;
  const wrapped: number[] = [];

  for (let i = 0; i < rawAnglesDeg.length; i += 1) {
    const raw = rawAnglesDeg[i];
    if (raw === undefined || !Number.isFinite(raw)) {
      sanitizedSampleCount += 1;
      wrapped.push(lastValidWrapped);
    } else {
      const normalized = normalizeAngle360(raw);
      lastValidWrapped = normalized;
      wrapped.push(normalized);
    }
  }

  const firstWrapped = wrapped[0] ?? 0;
  const unwrappedAnglesDeg: number[] = [firstWrapped];
  const stepDeltasDeg: number[] = [];
  let maxAbsStepDeg = 0;
  let rawWrapJumpCount = 0;
  let flipGlitchCount = 0;

  for (let i = 1; i < wrapped.length; i += 1) {
    const prevWrapped = wrapped[i - 1] ?? 0;
    const currWrapped = wrapped[i] ?? 0;
    if (Math.abs(currWrapped - prevWrapped) > 180) {
      rawWrapJumpCount += 1;
    }
    const delta = shortestAngularDeltaDeg(prevWrapped, currWrapped);
    const prevUnwrapped = unwrappedAnglesDeg[i - 1] ?? 0;
    const nextUnwrapped = prevUnwrapped + delta;
    unwrappedAnglesDeg.push(nextUnwrapped);
    stepDeltasDeg.push(delta);

    const absStep = Math.abs(delta);
    if (absStep > maxAbsStepDeg) {
      maxAbsStepDeg = absStep;
    }
    if (absStep > 180 + 1e-9) {
      flipGlitchCount += 1;
    }
  }

  const lastUnwrapped = unwrappedAnglesDeg[unwrappedAnglesDeg.length - 1] ?? firstWrapped;
  return {
    unwrappedAnglesDeg,
    stepDeltasDeg,
    maxAbsStepDeg,
    rawWrapJumpCount,
    flipGlitchCount,
    totalRotationDeg: lastUnwrapped - firstWrapped,
    sanitizedSampleCount,
  };
}

/**
 * 스타일러스 하드웨어의 배럴 롤 지원 여부에 따라 유효 닙 회전각과 결정론적 폴백 출처를 산출한다.
 */
export function resolveEffectiveNibRotationDeg(
  input: EffectiveNibRotationInput,
): EffectiveNibRotationResult {
  const profile = resolveStylusHardwareProfile(input.device);
  const policy = input.fallbackPolicy ?? "azimuth-then-tangent";
  const fixedAngle = normalizeAngle360(input.fixedNibAngleDeg ?? 0);

  if (
    profile.supportsBarrelRoll &&
    input.barrelRollDeg !== undefined &&
    Number.isFinite(input.barrelRollDeg)
  ) {
    return {
      effectiveNibRotationDeg: normalizeAngle360(input.barrelRollDeg),
      rotationSource: "hardware-barrel-roll",
      usedFallback: false,
      supportsBarrelRoll: true,
    };
  }

  const isStrictlyVertical =
    input.altitudeDeg !== undefined &&
    Number.isFinite(input.altitudeDeg) &&
    input.altitudeDeg >= 89.5;
  const hasUsableAzimuth =
    !isStrictlyVertical &&
    input.tiltAzimuthDeg !== undefined &&
    Number.isFinite(input.tiltAzimuthDeg);
  const hasUsableTangent =
    input.strokeTangentDeg !== undefined && Number.isFinite(input.strokeTangentDeg);

  if (policy === "azimuth-then-tangent") {
    if (hasUsableAzimuth && input.tiltAzimuthDeg !== undefined) {
      return {
        effectiveNibRotationDeg: normalizeAngle360(input.tiltAzimuthDeg),
        rotationSource: "tilt-azimuth-fallback",
        usedFallback: true,
        supportsBarrelRoll: profile.supportsBarrelRoll,
      };
    }
    if (hasUsableTangent && input.strokeTangentDeg !== undefined) {
      return {
        effectiveNibRotationDeg: normalizeAngle360(input.strokeTangentDeg),
        rotationSource: "stroke-tangent-fallback",
        usedFallback: true,
        supportsBarrelRoll: profile.supportsBarrelRoll,
      };
    }
  } else if (policy === "tangent-then-azimuth") {
    if (hasUsableTangent && input.strokeTangentDeg !== undefined) {
      return {
        effectiveNibRotationDeg: normalizeAngle360(input.strokeTangentDeg),
        rotationSource: "stroke-tangent-fallback",
        usedFallback: true,
        supportsBarrelRoll: profile.supportsBarrelRoll,
      };
    }
    if (hasUsableAzimuth && input.tiltAzimuthDeg !== undefined) {
      return {
        effectiveNibRotationDeg: normalizeAngle360(input.tiltAzimuthDeg),
        rotationSource: "tilt-azimuth-fallback",
        usedFallback: true,
        supportsBarrelRoll: profile.supportsBarrelRoll,
      };
    }
  }

  return {
    effectiveNibRotationDeg: fixedAngle,
    rotationSource: "fixed-angle-fallback",
    usedFallback: true,
    supportsBarrelRoll: profile.supportsBarrelRoll,
  };
}

/**
 * Pointer Events 표준의 `tiltX`, `tiltY`(각 -90°..90°)를 구면 좌표 고도각(`altitudeDeg`)·방위각(`azimuthDeg`)으로 변환한다.
 */
export function tiltXYToAltitudeAzimuthDeg(
  tiltXDeg: number,
  tiltYDeg: number,
): TiltAltitudeAzimuthResult {
  const tx = clampNumber(tiltXDeg, -89.9, 89.9) * (Math.PI / 180);
  const ty = clampNumber(tiltYDeg, -89.9, 89.9) * (Math.PI / 180);
  const tanX = Math.tan(tx);
  const tanY = Math.tan(ty);
  const radial = Math.hypot(tanX, tanY);
  if (radial <= 1e-9) {
    return {
      altitudeDeg: 90,
      azimuthDeg: 0,
      tiltFromVerticalDeg: 0,
    };
  }
  const tiltFromVerticalDeg = (Math.atan(radial) * 180) / Math.PI;
  const altitudeDeg = clampNumber(90 - tiltFromVerticalDeg, 0, 90);
  const azimuthDeg = normalizeAngle360((Math.atan2(tanY, tanX) * 180) / Math.PI);
  return {
    altitudeDeg,
    azimuthDeg,
    tiltFromVerticalDeg,
  };
}

/**
 * 기울기 고도각·방위각·배럴 롤을 결합해 치즐/G펜 브러시 스탬프의 장축/단축 폭·회전각·종횡비를 산출한다.
 */
export function computeChiselNibStampGeometry(
  input: ChiselNibStampInput,
): ChiselNibStampGeometry {
  const profile = resolveStylusHardwareProfile(input.device ?? "apple-pencil-pro");
  const nibStyle = input.nibStyle ?? "flat-chisel";
  const safeBaseSize = clampNumber(input.baseBrushSizePx, 0.5, 500);
  const safePressure = clampNumber(input.pressure, 0, 1);
  const floorRatio = clampNumber(input.pressureSizeFloorRatio ?? 0.15, 0.02, 0.9);
  const clampedAltitudeDeg = clampNumber(input.altitudeDeg, 0, 90);
  const safeAzimuthDeg = normalizeAngle360(input.azimuthDeg);

  const tiltFromVerticalDeg = 90 - clampedAltitudeDeg;
  const tiltFactor = clampNumber(Math.sin((tiltFromVerticalDeg * Math.PI) / 180), 0, 1);
  const pressureDiameterPx = safeBaseSize * (floorRatio + (1 - floorRatio) * safePressure);

  let baseMajorMult = 1.0;
  let baseMinorMult = 1.0;
  let tiltBroadening = 2.2;
  let tiltThinning = 0.35;

  if (nibStyle === "g-pen") {
    tiltBroadening = 1.6;
    tiltThinning = 0.28;
  } else if (nibStyle === "graphite-shading") {
    tiltBroadening = 2.8;
    tiltThinning = 0.2;
  } else if (nibStyle === "calligraphy-broad") {
    baseMajorMult = 1.8;
    baseMinorMult = 0.65;
    tiltBroadening = 1.4;
    tiltThinning = 0.25;
  }

  const majorWidthPx = Math.max(
    0.5,
    pressureDiameterPx * baseMajorMult * (1 + tiltBroadening * tiltFactor),
  );
  const minorWidthPx = Math.max(
    0.4,
    pressureDiameterPx * baseMinorMult * Math.max(0.28, 1 - tiltThinning * tiltFactor),
  );
  const orderedMajor = Math.max(majorWidthPx, minorWidthPx);
  const orderedMinor = Math.min(majorWidthPx, minorWidthPx);
  const aspectRatio = orderedMajor / orderedMinor;

  const nibRotation = resolveEffectiveNibRotationDeg({
    device: profile,
    barrelRollDeg: input.barrelRollDeg,
    tiltAzimuthDeg: safeAzimuthDeg,
    altitudeDeg: clampedAltitudeDeg,
    strokeTangentDeg: input.strokeTangentDeg,
    fallbackPolicy: input.fallbackPolicy,
  });

  const contactAreaPx2 = (Math.PI / 4) * orderedMajor * orderedMinor;
  const shadingCoverageFactor = clampNumber(tiltFactor * (0.4 + 0.6 * safePressure), 0, 1);

  return {
    majorWidthPx: orderedMajor,
    minorWidthPx: orderedMinor,
    aspectRatio,
    stampRotationDeg: nibRotation.effectiveNibRotationDeg,
    effectiveNibRotationDeg: nibRotation.effectiveNibRotationDeg,
    rotationSource: nibRotation.rotationSource,
    tiltFactor,
    clampedAltitudeDeg,
    shadingCoverageFactor,
    contactAreaPx2,
    isNearCircular: aspectRatio <= 1.08,
  };
}
