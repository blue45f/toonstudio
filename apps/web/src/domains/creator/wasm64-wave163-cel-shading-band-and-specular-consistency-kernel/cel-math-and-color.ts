/**
 * Wave 163: 3D 벡터, 구면 좌표, OKLCH 지각 색상 보간·그림자 색상 이동 및 Schlick 프레넬 수학 유틸리티.
 */

import type {
  CelAuditThresholds,
  CelConsistencyDefectKind,
  CelRampConfig,
  OklchColor,
  PaintedHighlightAnnotation,
  StylizedLightSource,
  Vec3,
} from './cel-shading-types';

export const DEFAULT_CEL_AUDIT_THRESHOLDS: CelAuditThresholds = {
  maxSpecularAngleDeltaDeg: 22,
  minShadowChromaRatio: 0.72,
  minShadowHueShiftDeg: 8,
  minBandFeatherWidth: 0.015,
  maxRimKeyAlignmentDot: 0.7,
  maxDielectricTintByAlbedo: 0.15,
};

export const DEFAULT_CEL_RAMP_CONFIG: CelRampConfig = {
  bandCount: 3,
  terminatorThreshold: 0.08,
  midBandThreshold: -0.22,
  bandFeatherWidth: 0.045,
  shadowHueShiftDeg: 24,
  shadowChromaPreserveRatio: 0.96,
  shadowLightnessFactor: 0.62,
  midLightnessFactor: 0.82,
  litLightnessBoost: 1.04,
};

export function createEmptyDefectCounts(): Record<CelConsistencyDefectKind, number> {
  return {
    'specular-direction-mismatch': 0,
    'muddy-desaturated-shadow': 0,
    'dielectric-metallic-violation': 0,
    'rim-key-occlusion-clash': 0,
    'hard-banding-aliasing': 0,
  };
}

export function resolveCelAuditThresholds(
  partial?: Partial<CelAuditThresholds>,
): CelAuditThresholds {
  return {
    maxSpecularAngleDeltaDeg:
      partial?.maxSpecularAngleDeltaDeg ?? DEFAULT_CEL_AUDIT_THRESHOLDS.maxSpecularAngleDeltaDeg,
    minShadowChromaRatio:
      partial?.minShadowChromaRatio ?? DEFAULT_CEL_AUDIT_THRESHOLDS.minShadowChromaRatio,
    minShadowHueShiftDeg:
      partial?.minShadowHueShiftDeg ?? DEFAULT_CEL_AUDIT_THRESHOLDS.minShadowHueShiftDeg,
    minBandFeatherWidth:
      partial?.minBandFeatherWidth ?? DEFAULT_CEL_AUDIT_THRESHOLDS.minBandFeatherWidth,
    maxRimKeyAlignmentDot:
      partial?.maxRimKeyAlignmentDot ?? DEFAULT_CEL_AUDIT_THRESHOLDS.maxRimKeyAlignmentDot,
    maxDielectricTintByAlbedo:
      partial?.maxDielectricTintByAlbedo ?? DEFAULT_CEL_AUDIT_THRESHOLDS.maxDielectricTintByAlbedo,
  };
}

export function buildEffectiveCelRamp(
  baseRamp: CelRampConfig,
  annotation: PaintedHighlightAnnotation,
): CelRampConfig {
  const ov = annotation.celRampOverride;
  const feather =
    annotation.bandFeatherWidthOverride !== undefined
      ? annotation.bandFeatherWidthOverride
      : ov?.bandFeatherWidth !== undefined
        ? ov.bandFeatherWidth
        : baseRamp.bandFeatherWidth;
  return {
    bandCount: ov?.bandCount ?? baseRamp.bandCount,
    terminatorThreshold: ov?.terminatorThreshold ?? baseRamp.terminatorThreshold,
    midBandThreshold: ov?.midBandThreshold ?? baseRamp.midBandThreshold,
    bandFeatherWidth: feather,
    shadowHueShiftDeg: ov?.shadowHueShiftDeg ?? baseRamp.shadowHueShiftDeg,
    shadowChromaPreserveRatio: ov?.shadowChromaPreserveRatio ?? baseRamp.shadowChromaPreserveRatio,
    shadowLightnessFactor: ov?.shadowLightnessFactor ?? baseRamp.shadowLightnessFactor,
    midLightnessFactor: ov?.midLightnessFactor ?? baseRamp.midLightnessFactor,
    litLightnessBoost: ov?.litLightnessBoost ?? baseRamp.litLightnessBoost,
  };
}

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

export function clampValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clampValue(value, 0, 1);
}

export function smoothstepEdge(edge0: number, edge1: number, x: number): number {
  if (!Number.isFinite(x)) {
    return 0;
  }
  if (Math.abs(edge1 - edge0) <= 1e-8) {
    return x >= edge0 ? 1 : 0;
  }
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function scaleVec3(v: Vec3, scalar: number): Vec3 {
  return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
}

export function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function lengthVec3(v: Vec3): number {
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
    return 0;
  }
  return Math.hypot(v.x, v.y, v.z);
}

export function normalizeVec3(v: Vec3, fallback: Vec3 = { x: 0, y: 0, z: 1 }): Vec3 {
  const len = lengthVec3(v);
  if (len <= 1e-8) {
    const fbLen = lengthVec3(fallback);
    if (fbLen <= 1e-8) {
      return { x: 0, y: 0, z: 1 };
    }
    return { x: fallback.x / fbLen, y: fallback.y / fbLen, z: fallback.z / fbLen };
  }
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function directionFromSphericalDeg(azimuthDeg: number, elevationDeg: number): Vec3 {
  const az = azimuthDeg * DEG_TO_RAD;
  const el = clampValue(elevationDeg, -89.9, 89.9) * DEG_TO_RAD;
  const cosEl = Math.cos(el);
  return normalizeVec3({
    x: Math.sin(az) * cosEl,
    y: Math.sin(el),
    z: Math.cos(az) * cosEl,
  });
}

export function angleBetweenVec3Deg(a: Vec3, b: Vec3): number {
  const cosine = clampValue(dotVec3(normalizeVec3(a), normalizeVec3(b)), -1, 1);
  return Math.acos(cosine) * RAD_TO_DEG;
}

export function deriveOrthonormalTangent(normal: Vec3, hint?: Vec3): Vec3 {
  const n = normalizeVec3(normal);
  const candidate =
    hint && lengthVec3(hint) > 1e-6
      ? normalizeVec3(hint)
      : Math.abs(n.y) < 0.92
        ? { x: 0, y: 1, z: 0 }
        : { x: 1, y: 0, z: 0 };
  const ortho = addVec3(candidate, scaleVec3(n, -dotVec3(candidate, n)));
  if (lengthVec3(ortho) <= 1e-6) {
    return normalizeVec3(crossVec3(n, { x: 1, y: 0, z: 0 }), { x: 0, y: 1, z: 0 });
  }
  return normalizeVec3(ortho);
}

export function wrapHueDeg(hueDeg: number): number {
  if (!Number.isFinite(hueDeg)) {
    return 0;
  }
  const mod = hueDeg % 360;
  return mod < 0 ? mod + 360 : mod;
}

export function shortestHueDeltaDeg(fromDeg: number, toDeg: number): number {
  let delta = wrapHueDeg(toDeg) - wrapHueDeg(fromDeg);
  if (delta > 180) {
    delta -= 360;
  } else if (delta < -180) {
    delta += 360;
  }
  return delta;
}

export function absHueDeltaDeg(a: number, b: number): number {
  return Math.abs(shortestHueDeltaDeg(a, b));
}

export function sanitizeOklch(color: OklchColor): OklchColor {
  return {
    l: clamp01(color.l),
    c: clampValue(color.c, 0, 0.37),
    h: wrapHueDeg(color.h),
  };
}

export function blendOklch(a: OklchColor, b: OklchColor, weightB: number): OklchColor {
  const t = clamp01(weightB);
  const ca = sanitizeOklch(a);
  const cb = sanitizeOklch(b);
  const h =
    ca.c <= 0.002
      ? cb.h
      : cb.c <= 0.002
        ? ca.h
        : wrapHueDeg(ca.h + shortestHueDeltaDeg(ca.h, cb.h) * t);
  return {
    l: clamp01(ca.l + (cb.l - ca.l) * t),
    c: clampValue(ca.c + (cb.c - ca.c) * t, 0, 0.37),
    h,
  };
}

/**
 * OKLCH 지각 공간에서 탁한 회색 붕괴 없이 선명한 보색·한색 계열 그림자 색을 계산한다.
 */
export function computePerceptualShadowColor(
  baseColor: OklchColor,
  ramp: CelRampConfig,
  fillLight?: StylizedLightSource,
): OklchColor {
  const base = sanitizeOklch(baseColor);
  const shiftDeg = Number.isFinite(ramp.shadowHueShiftDeg) ? ramp.shadowHueShiftDeg : 22;
  const effectiveShift = Math.abs(shiftDeg) < 1e-4 ? 18 : shiftDeg;
  let shiftedHue = wrapHueDeg(base.h + effectiveShift);

  if (fillLight && (fillLight.enabled ?? true) && fillLight.intensity > 0.05) {
    const pull = clampValue(fillLight.intensity * 0.14, 0, 0.22);
    shiftedHue = wrapHueDeg(shiftedHue + shortestHueDeltaDeg(shiftedHue, fillLight.color.h) * pull);
  }

  const preserveRatio = clampValue(ramp.shadowChromaPreserveRatio, 0.76, 1.25);
  const preservedChroma =
    base.c >= 0.015 ? Math.max(base.c * preserveRatio, Math.min(0.035, base.c)) : base.c;
  const shadowL = clampValue(
    base.l * clampValue(ramp.shadowLightnessFactor, 0.28, 0.85),
    0.08,
    Math.max(0.08, base.l - 0.08),
  );

  return { l: shadowL, c: clampValue(preservedChroma, 0, 0.34), h: shiftedHue };
}

export function computePerceptualMidColor(
  baseColor: OklchColor,
  shadowColor: OklchColor,
  ramp: CelRampConfig,
): OklchColor {
  const base = sanitizeOklch(baseColor);
  const shadow = sanitizeOklch(shadowColor);
  const minMidL = Math.min(0.95, shadow.l + 0.035);
  const maxMidL = Math.max(minMidL, base.l - 0.02);
  const midL = clampValue(base.l * clampValue(ramp.midLightnessFactor, 0.55, 0.96), minMidL, maxMidL);
  const midC = clampValue(Math.max(base.c * 0.92, (base.c + shadow.c) * 0.5), 0, 0.35);
  const midH = wrapHueDeg(base.h + shortestHueDeltaDeg(base.h, shadow.h) * 0.45);
  return { l: midL, c: midC, h: midH };
}

export function computePerceptualLitColor(
  baseColor: OklchColor,
  keyLight: StylizedLightSource,
  ramp: CelRampConfig,
): OklchColor {
  const base = sanitizeOklch(baseColor);
  const boost = clampValue(ramp.litLightnessBoost, 1.0, 1.18);
  const litL = clampValue(Math.max(base.l * boost, base.l + 0.02), 0.14, 0.98);
  const keyPull = clampValue(keyLight.intensity * 0.08, 0, 0.14);
  const litH = wrapHueDeg(base.h + shortestHueDeltaDeg(base.h, keyLight.color.h) * keyPull);
  const litC = clampValue(base.c * 0.96 + keyLight.color.c * 0.05, 0, 0.36);
  return { l: litL, c: litC, h: litH };
}

export function computeSchlickFresnel(f0: number, cosTheta: number): number {
  const clampedF0 = clampValue(f0, 0.01, 0.99);
  const inv = 1 - clamp01(cosTheta);
  const inv2 = inv * inv;
  return clampedF0 + (1 - clampedF0) * (inv2 * inv2 * inv);
}
