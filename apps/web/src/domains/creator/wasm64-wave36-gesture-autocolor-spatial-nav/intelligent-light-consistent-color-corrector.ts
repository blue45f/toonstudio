/**
 * Wave 36: 장면 주광원(방위각·고도각·색온도) 일관성 기반 컷 자동 밑색 보정 및 셀 그림자·림라이트 생성기.
 *
 * - 장면 주광원(`keyKelvin`)과 환경 채광(`ambientKelvin`)을 Kang et al.(2002) 흑체 궤적 기반
 *   선형 RGB 조도 틴트로 변환한다(`6500K` 중립 기준 `(1, 1, 1)`).
 * - 컷 내 캐릭터·소품·배경 밑색을 광원 입사각에 맞춰 자연스럽게 통일하고,
 *   광원 반대 방향의 1단 셀 그림자 스와치와 광원 방향 가장자리 림라이트 스와치를 일괄 산출한다.
 * - 피부(`kind === "skin"`) 영역은 극단적인 노을광·달빛 아래에서도 원래 피부 색상각 대비
 *   편차를 최대 `4°` 이내로 엄격히 고정해 황달·창백 왜곡을 원천 차단한다.
 */

/** 중립 주광 기준 색온도(`6,500 K`). */
export const NEUTRAL_DAYLIGHT_KELVIN = 6_500 as const;
/** 피부 톤 밑색 보정 시 허용하는 최대 색상각(Hue) 편차 상한(`4°`). */
export const MAX_SKIN_TONE_HUE_DRIFT_DEG = 4 as const;

export type CutColorRegionKind = "skin" | "hair" | "costume" | "prop" | "background";

export interface SrgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface LinearRgbTint {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly hDeg: number;
}

export interface SurfaceDirectionAngles {
  /** 화면 평면 방위각(`0°`=오른쪽 `+X`, `90°`=위쪽 `+Y`, `180°`=왼쪽 `-X`). */
  readonly azimuthDeg: number;
  /** 캔버스 평면 대비 고도각(`0°`=측면 역광/사광, `90°`=정면 수직광 `+Z`). */
  readonly elevationDeg: number;
}

export interface CutFlatColorRegionInput {
  readonly regionId: string;
  readonly labelKo: string;
  readonly kind: CutColorRegionKind;
  readonly baseSrgb: SrgbColor;
  readonly surfaceNormal?: SurfaceDirectionAngles;
  readonly lockSkinHue?: boolean;
}

export interface SceneKeyLightConfig {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly keyKelvin: number;
  readonly ambientKelvin?: number;
  readonly harmonizeStrength?: number;
  readonly shadowIntensity?: number;
  readonly rimIntensity?: number;
  readonly maxSkinHueDriftDeg?: number;
}

export interface HarmonizedCutRegionResult {
  readonly regionId: string;
  readonly labelKo: string;
  readonly kind: CutColorRegionKind;
  readonly originalBaseSrgb: SrgbColor;
  readonly harmonizedBaseSrgb: SrgbColor;
  readonly celShadowSrgb: SrgbColor;
  readonly rimLightSrgb: SrgbColor;
  readonly incidenceCosine: number;
  readonly oklchHueDriftDeg: number;
  readonly srgbHueDriftDeg: number;
  /** OKLCH·sRGB 두 색공간 중 더 큰 실제 색상각 변화량 (`skin`은 항상 `<= 4°`). */
  readonly baseHueDriftDeg: number;
  readonly skinHueClamped: boolean;
}

export interface CutLightHarmonizationReport {
  readonly keyLightVector3d: { readonly x: number; readonly y: number; readonly z: number };
  readonly shadowDirectionAngleDeg: number;
  readonly rimEdgeAngleDeg: number;
  readonly keyLinearTint: LinearRgbTint;
  readonly ambientLinearTint: LinearRgbTint;
  readonly regions: readonly HarmonizedCutRegionResult[];
  readonly maxObservedSkinHueDriftDeg: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeDeg360(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped === 0 ? 0 : wrapped;
}

function shortestSignedAngleDeltaDeg(fromDeg: number, toDeg: number): number {
  const diff = normalizeDeg360(toDeg) - normalizeDeg360(fromDeg);
  if (diff > 180) return diff - 360;
  if (diff < -180) return diff + 360;
  return diff;
}

/** sRGB 단일 채널(`0..255`)을 선형 광량(`0..1`)으로 변환한다. */
export function srgb8ToLinearChannel(channel255: number): number {
  const v = clamp(channel255 / 255, 0, 1);
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** 선형 광량(`0..1`)을 sRGB 단일 채널(`0..255`)로 변환한다. */
export function linearChannelToSrgb8(linear: number): number {
  const v = clamp(linear, 0, 1);
  const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return clamp(encoded * 255, 0, 255);
}

function srgbToLinear(color: SrgbColor): LinearRgbTint {
  return {
    r: srgb8ToLinearChannel(color.r),
    g: srgb8ToLinearChannel(color.g),
    b: srgb8ToLinearChannel(color.b),
  };
}

function linearToSrgb(linear: LinearRgbTint): SrgbColor {
  return {
    r: linearChannelToSrgb8(linear.r),
    g: linearChannelToSrgb8(linear.g),
    b: linearChannelToSrgb8(linear.b),
  };
}

/** 선형 sRGB 기준 상대 휘도(`Rec.709 Y`). */
export function computeRelativeLuminance(color: SrgbColor): number {
  const lin = srgbToLinear(color);
  return 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
}

/** 표준 육각 sRGB 색상각(`0..360°`)과 채도 폭을 계산한다. */
export function computeSrgbHueAndSpan(color: SrgbColor): {
  readonly hueDeg: number;
  readonly span255: number;
} {
  const r = clamp(color.r, 0, 255);
  const g = clamp(color.g, 0, 255);
  const b = clamp(color.b, 0, 255);
  const maxC = Math.max(r, g, b);
  const span = maxC - Math.min(r, g, b);
  if (span < 1e-5) return { hueDeg: 0, span255: 0 };

  let rawHue: number;
  if (maxC === r) {
    rawHue = ((g - b) / span) * 60;
  } else if (maxC === g) {
    rawHue = (2 + (b - r) / span) * 60;
  } else {
    rawHue = (4 + (r - g) / span) * 60;
  }
  return { hueDeg: normalizeDeg360(rawHue), span255: span };
}

function linearRgbToOklch(lin: LinearRgbTint): OklchColor {
  const r = Math.max(0, lin.r);
  const g = Math.max(0, lin.g);
  const b = Math.max(0, lin.b);

  const lCone = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mCone = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const sCone = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const okL = 0.2104542553 * lCone + 0.793617785 * mCone - 0.0040720468 * sCone;
  const okA = 1.9779984951 * lCone - 2.428592205 * mCone + 0.4505937099 * sCone;
  const okB = 0.0259040371 * lCone + 0.7827717662 * mCone - 0.808675766 * sCone;

  const c = Math.hypot(okA, okB);
  const hDeg = c > 1e-6 ? normalizeDeg360((Math.atan2(okB, okA) * 180) / Math.PI) : 0;
  return { l: clamp(okL, 0, 1), c, hDeg };
}

function oklchToRawLinearRgb(oklch: OklchColor): LinearRgbTint {
  const rad = (oklch.hDeg * Math.PI) / 180;
  const okA = oklch.c * Math.cos(rad);
  const okB = oklch.c * Math.sin(rad);

  const l = (oklch.l + 0.3963377774 * okA + 0.2158037573 * okB) ** 3;
  const m = (oklch.l - 0.1055613458 * okA - 0.0638541728 * okB) ** 3;
  const s = (oklch.l - 0.0894841775 * okA - 1.291485548 * okB) ** 3;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function isInLinearGamut(lin: LinearRgbTint): boolean {
  return (
    lin.r >= -1e-5 &&
    lin.r <= 1 + 1e-5 &&
    lin.g >= -1e-5 &&
    lin.g <= 1 + 1e-5 &&
    lin.b >= -1e-5 &&
    lin.b <= 1 + 1e-5
  );
}

function oklchToGamutLinearRgb(target: OklchColor): LinearRgbTint {
  const safeL = clamp(target.l, 0, 1);
  if (safeL <= 0.001) return { r: 0, g: 0, b: 0 };
  if (safeL >= 0.999) return { r: 1, g: 1, b: 1 };

  const direct = oklchToRawLinearRgb({ l: safeL, c: Math.max(0, target.c), hDeg: target.hDeg });
  if (isInLinearGamut(direct)) {
    return { r: clamp(direct.r, 0, 1), g: clamp(direct.g, 0, 1), b: clamp(direct.b, 0, 1) };
  }

  let lo = 0;
  let hi = Math.max(0, target.c);
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) * 0.5;
    if (isInLinearGamut(oklchToRawLinearRgb({ l: safeL, c: mid, hDeg: target.hDeg }))) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const fitted = oklchToRawLinearRgb({ l: safeL, c: lo, hDeg: target.hDeg });
  return { r: clamp(fitted.r, 0, 1), g: clamp(fitted.g, 0, 1), b: clamp(fitted.b, 0, 1) };
}

function unnormalizedPlanckianLinearRgb(kelvin: number): LinearRgbTint {
  const t = clamp(kelvin, 1_800, 20_000);
  const invT = 1_000 / t;
  const invT2 = invT * invT;
  const invT3 = invT2 * invT;

  const xc =
    t <= 4_000
      ? -0.2661239 * invT3 - 0.2343589 * invT2 + 0.8776956 * invT + 0.17991
      : -3.0258469 * invT3 + 2.1070379 * invT2 + 0.2226347 * invT + 0.24039;

  const xc2 = xc * xc;
  const xc3 = xc2 * xc;
  const yc =
    t <= 2_222
      ? -1.1063814 * xc3 - 1.3481102 * xc2 + 2.18555832 * xc - 0.20219683
      : t <= 4_000
        ? -0.9549476 * xc3 - 1.37418593 * xc2 + 2.09137015 * xc - 0.16748867
        : 3.081758 * xc3 - 5.8733867 * xc2 + 3.75112997 * xc - 0.37001483;

  const safeY = Math.max(1e-4, yc);
  const capX = xc / safeY;
  const capZ = (1 - xc - yc) / safeY;

  return {
    r: Math.max(0.03, 3.2404542 * capX - 1.5371385 - 0.4985314 * capZ),
    g: Math.max(0.03, -0.969266 * capX + 1.8760108 + 0.041556 * capZ),
    b: Math.max(0.03, 0.0556434 * capX - 0.2040259 + 1.0572252 * capZ),
  };
}

const REFERENCE_6500K_RAW = unnormalizedPlanckianLinearRgb(NEUTRAL_DAYLIGHT_KELVIN);

/** 색온도(`Kelvin`)를 `6500K` 백색 기준 `(1, 1, 1)`로 정규화된 선형 RGB 광원 틴트로 변환한다. */
export function kelvinToLinearRgbTint(kelvin: number): LinearRgbTint {
  const raw = unnormalizedPlanckianLinearRgb(kelvin);
  const relR = raw.r / REFERENCE_6500K_RAW.r;
  const relG = raw.g / REFERENCE_6500K_RAW.g;
  const relB = raw.b / REFERENCE_6500K_RAW.b;
  const peak = Math.max(1e-6, relR, relG, relB);
  return { r: relR / peak, g: relG / peak, b: relB / peak };
}

function anglesToUnitVector3d(angles: SurfaceDirectionAngles): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
} {
  const azRad = (normalizeDeg360(angles.azimuthDeg) * Math.PI) / 180;
  const elRad = (clamp(angles.elevationDeg, 0, 90) * Math.PI) / 180;
  const cosEl = Math.cos(elRad);
  return { x: cosEl * Math.cos(azRad), y: cosEl * Math.sin(azRad), z: Math.sin(elRad) };
}

function measureDualHueDrift(
  baseSrgb: SrgbColor,
  baseOklch: OklchColor,
  candidateLinear: LinearRgbTint,
): {
  readonly oklchDriftDeg: number;
  readonly srgbDriftDeg: number;
  readonly maxDriftDeg: number;
} {
  const candOklch = linearRgbToOklch(candidateLinear);
  const candSrgb = linearToSrgb(candidateLinear);
  const baseSrgbHue = computeSrgbHueAndSpan(baseSrgb);
  const candSrgbHue = computeSrgbHueAndSpan(candSrgb);

  const oklchDriftDeg =
    baseOklch.c > 0.006 && candOklch.c > 0.006
      ? Math.abs(shortestSignedAngleDeltaDeg(baseOklch.hDeg, candOklch.hDeg))
      : 0;
  const srgbDriftDeg =
    baseSrgbHue.span255 > 3 && candSrgbHue.span255 > 3
      ? Math.abs(shortestSignedAngleDeltaDeg(baseSrgbHue.hueDeg, candSrgbHue.hueDeg))
      : 0;

  return {
    oklchDriftDeg,
    srgbDriftDeg,
    maxDriftDeg: Math.max(oklchDriftDeg, srgbDriftDeg),
  };
}

function clampSkinToneHueDrift(
  baseSrgb: SrgbColor,
  baseLinear: LinearRgbTint,
  tintedLinear: LinearRgbTint,
  maxHueDriftDeg: number,
): {
  readonly clampedLinear: LinearRgbTint;
  readonly oklchHueDriftDeg: number;
  readonly srgbHueDriftDeg: number;
  readonly wasClamped: boolean;
} {
  const baseOklch = linearRgbToOklch(baseLinear);
  const initialDrift = measureDualHueDrift(baseSrgb, baseOklch, tintedLinear);
  if (initialDrift.maxDriftDeg <= maxHueDriftDeg) {
    return {
      clampedLinear: tintedLinear,
      oklchHueDriftDeg: initialDrift.oklchDriftDeg,
      srgbHueDriftDeg: initialDrift.srgbDriftDeg,
      wasClamped: false,
    };
  }

  const tintedOklch = linearRgbToOklch(tintedLinear);
  const signedDelta = shortestSignedAngleDeltaDeg(baseOklch.hDeg, tintedOklch.hDeg);
  const safeTargetMargin = Math.max(0.05, maxHueDriftDeg * 0.96);
  const clampedHue = normalizeDeg360(
    baseOklch.hDeg + clamp(signedDelta, -safeTargetMargin, safeTargetMargin),
  );
  const cappedChroma = Math.min(tintedOklch.c, Math.max(baseOklch.c * 1.15, 0.01));

  let candidateLinear = oklchToGamutLinearRgb({
    l: tintedOklch.l,
    c: cappedChroma,
    hDeg: clampedHue,
  });

  let check = measureDualHueDrift(baseSrgb, baseOklch, candidateLinear);
  if (check.maxDriftDeg > maxHueDriftDeg) {
    const targetLuma = Math.max(
      1e-4,
      0.2126 * candidateLinear.r + 0.7152 * candidateLinear.g + 0.0722 * candidateLinear.b,
    );
    const baseLuma = Math.max(
      1e-4,
      0.2126 * baseLinear.r + 0.7152 * baseLinear.g + 0.0722 * baseLinear.b,
    );
    const scale = targetLuma / baseLuma;
    const anchorLinear: LinearRgbTint = {
      r: clamp(baseLinear.r * scale, 0, 1),
      g: clamp(baseLinear.g * scale, 0, 1),
      b: clamp(baseLinear.b * scale, 0, 1),
    };

    let lo = 0;
    let hi = 1;
    let bestLinear = anchorLinear;
    for (let step = 0; step < 14; step += 1) {
      const t = (lo + hi) * 0.5;
      const blended: LinearRgbTint = {
        r: anchorLinear.r + (candidateLinear.r - anchorLinear.r) * t,
        g: anchorLinear.g + (candidateLinear.g - anchorLinear.g) * t,
        b: anchorLinear.b + (candidateLinear.b - anchorLinear.b) * t,
      };
      if (measureDualHueDrift(baseSrgb, baseOklch, blended).maxDriftDeg <= safeTargetMargin) {
        bestLinear = blended;
        lo = t;
      } else {
        hi = t;
      }
    }
    candidateLinear = bestLinear;
    check = measureDualHueDrift(baseSrgb, baseOklch, candidateLinear);
  }

  return {
    clampedLinear: candidateLinear,
    oklchHueDriftDeg: check.oklchDriftDeg,
    srgbHueDriftDeg: check.srgbDriftDeg,
    wasClamped: true,
  };
}

/**
 * 컷 내 캐릭터·소품·배경 밑색을 장면 주광원 방향과 색온도에 맞춰 조화 보정하고,
 * 일관된 1단 셀 그림자 및 림라이트 스와치를 생성한다.
 */
export function harmonizeCutFlatColorsToKeyLight(
  regions: readonly CutFlatColorRegionInput[],
  lightConfig: SceneKeyLightConfig,
): CutLightHarmonizationReport {
  const keyAzimuth = normalizeDeg360(lightConfig.azimuthDeg);
  const keyElevation = clamp(lightConfig.elevationDeg, 2, 90);
  const keyVector = anglesToUnitVector3d({ azimuthDeg: keyAzimuth, elevationDeg: keyElevation });

  const defaultAmbientKelvin =
    lightConfig.keyKelvin < NEUTRAL_DAYLIGHT_KELVIN
      ? clamp(lightConfig.keyKelvin + 1_800, 4_200, 9_500)
      : clamp(lightConfig.keyKelvin - 1_200, 3_800, 8_500);
  const keyLinearTint = kelvinToLinearRgbTint(lightConfig.keyKelvin);
  const ambientLinearTint = kelvinToLinearRgbTint(lightConfig.ambientKelvin ?? defaultAmbientKelvin);

  const harmonizeStrength = clamp(lightConfig.harmonizeStrength ?? 0.42, 0, 1);
  const shadowIntensity = clamp(lightConfig.shadowIntensity ?? 0.35, 0.05, 0.85);
  const rimIntensity = clamp(lightConfig.rimIntensity ?? 0.45, 0.05, 0.9);
  const maxSkinHueDriftDeg = clamp(
    lightConfig.maxSkinHueDriftDeg ?? MAX_SKIN_TONE_HUE_DRIFT_DEG,
    0.25,
    MAX_SKIN_TONE_HUE_DRIFT_DEG,
  );
  const grazingFactor = Math.cos((keyElevation * Math.PI) / 180);
  let maxObservedSkinHueDriftDeg = 0;

  const harmonizedRegions: HarmonizedCutRegionResult[] = regions.map((region) => {
    const baseLinear = srgbToLinear(region.baseSrgb);
    const baseOklch = linearRgbToOklch(baseLinear);
    const normalVec = anglesToUnitVector3d(
      region.surfaceNormal ?? { azimuthDeg: keyAzimuth, elevationDeg: 60 },
    );
    const incidenceCosine = clamp(
      normalVec.x * keyVector.x + normalVec.y * keyVector.y + normalVec.z * keyVector.z,
      -1,
      1,
    );
    const halfLambert = clamp(incidenceCosine * 0.5 + 0.5, 0, 1);

    const localTintR = ambientLinearTint.r + (keyLinearTint.r - ambientLinearTint.r) * halfLambert;
    const localTintG = ambientLinearTint.g + (keyLinearTint.g - ambientLinearTint.g) * halfLambert;
    const localTintB = ambientLinearTint.b + (keyLinearTint.b - ambientLinearTint.b) * halfLambert;

    const directionalExposure = 0.92 + 0.16 * halfLambert;
    const rawHarmonizedLinear: LinearRgbTint = {
      r: baseLinear.r + (clamp(baseLinear.r * localTintR * directionalExposure, 0, 1) - baseLinear.r) * harmonizeStrength,
      g: baseLinear.g + (clamp(baseLinear.g * localTintG * directionalExposure, 0, 1) - baseLinear.g) * harmonizeStrength,
      b: baseLinear.b + (clamp(baseLinear.b * localTintB * directionalExposure, 0, 1) - baseLinear.b) * harmonizeStrength,
    };

    const protectSkin = region.kind === "skin" || region.lockSkinHue === true;
    let finalBaseLinear: LinearRgbTint;
    let oklchHueDriftDeg: number;
    let srgbHueDriftDeg: number;
    let skinHueClamped = false;

    if (protectSkin) {
      const clamped = clampSkinToneHueDrift(
        region.baseSrgb,
        baseLinear,
        rawHarmonizedLinear,
        maxSkinHueDriftDeg,
      );
      finalBaseLinear = clamped.clampedLinear;
      oklchHueDriftDeg = clamped.oklchHueDriftDeg;
      srgbHueDriftDeg = clamped.srgbHueDriftDeg;
      skinHueClamped = clamped.wasClamped;
    } else {
      finalBaseLinear = rawHarmonizedLinear;
      const drift = measureDualHueDrift(region.baseSrgb, baseOklch, finalBaseLinear);
      oklchHueDriftDeg = drift.oklchDriftDeg;
      srgbHueDriftDeg = drift.srgbDriftDeg;
    }

    const baseHueDriftDeg = Math.max(oklchHueDriftDeg, srgbHueDriftDeg);
    if (region.kind === "skin" && baseHueDriftDeg > maxObservedSkinHueDriftDeg) {
      maxObservedSkinHueDriftDeg = baseHueDriftDeg;
    }

    const harmonizedOklch = linearRgbToOklch(finalBaseLinear);
    const shadowAmbientMix = protectSkin ? 0.14 : 0.28;
    const shadowSeedOklch = linearRgbToOklch({
      r: clamp(finalBaseLinear.r * (1 - shadowAmbientMix + shadowAmbientMix * ambientLinearTint.r), 0, 1),
      g: clamp(finalBaseLinear.g * (1 - shadowAmbientMix + shadowAmbientMix * ambientLinearTint.g), 0, 1),
      b: clamp(finalBaseLinear.b * (1 - shadowAmbientMix + shadowAmbientMix * ambientLinearTint.b), 0, 1),
    });
    const shadowDropL = 0.11 + 0.14 * shadowIntensity + 0.05 * grazingFactor;
    const celShadowLinear = oklchToGamutLinearRgb({
      l: clamp(harmonizedOklch.l - shadowDropL, 0.04, Math.max(0.04, harmonizedOklch.l - 0.04)),
      c: clamp(shadowSeedOklch.c * 1.06, 0, 0.32),
      hDeg: shadowSeedOklch.hDeg,
    });

    const rimTintMix = clamp(0.28 + 0.34 * rimIntensity + 0.18 * grazingFactor, 0, 0.85);
    const rimSeedOklch = linearRgbToOklch({
      r: clamp(finalBaseLinear.r + (keyLinearTint.r - finalBaseLinear.r) * rimTintMix, 0, 1),
      g: clamp(finalBaseLinear.g + (keyLinearTint.g - finalBaseLinear.g) * rimTintMix, 0, 1),
      b: clamp(finalBaseLinear.b + (keyLinearTint.b - finalBaseLinear.b) * rimTintMix, 0, 1),
    });
    const rimLiftL = 0.12 + 0.15 * rimIntensity + 0.08 * grazingFactor;
    const rimLightLinear = oklchToGamutLinearRgb({
      l: clamp(harmonizedOklch.l + rimLiftL, Math.min(0.985, harmonizedOklch.l + 0.04), 0.985),
      c: clamp(rimSeedOklch.c * 0.92, 0, 0.28),
      hDeg: rimSeedOklch.hDeg,
    });

    return {
      regionId: region.regionId,
      labelKo: region.labelKo,
      kind: region.kind,
      originalBaseSrgb: region.baseSrgb,
      harmonizedBaseSrgb: linearToSrgb(finalBaseLinear),
      celShadowSrgb: linearToSrgb(celShadowLinear),
      rimLightSrgb: linearToSrgb(rimLightLinear),
      incidenceCosine,
      oklchHueDriftDeg,
      srgbHueDriftDeg,
      baseHueDriftDeg,
      skinHueClamped,
    };
  });

  return {
    keyLightVector3d: keyVector,
    shadowDirectionAngleDeg: normalizeDeg360(keyAzimuth + 180),
    rimEdgeAngleDeg: keyAzimuth,
    keyLinearTint,
    ambientLinearTint,
    regions: harmonizedRegions,
    maxObservedSkinHueDriftDeg,
  };
}
