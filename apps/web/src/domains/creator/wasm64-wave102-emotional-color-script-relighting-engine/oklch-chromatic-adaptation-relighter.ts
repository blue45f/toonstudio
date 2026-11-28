/**
 * Wave 102 — OKLCH 색순응(Chromatic Adaptation) 장면 재조명 & 피부색 기억색 보존 엔진.
 *
 * - Anti-Mud 암부 색상각 이동(채도 유지율 >= 0.65)과 피부색 기억색 앵커 보호(`skinHueDriftDeg <= 한계`)를
 *   수학적 불변식으로 강제한다.
 * - 캐릭터·배경 플랫 팔레트 4단 톤(`lit / midtone / shadow / rim`) 재조명 및 소형 RGBA 타일
 *   결정론적 재조명을 제공한다.
 */

import {
  LIGHTING_MOOD_PRESETS,
  LIGHTING_MOOD_PRESET_IDS,
  clampFinite,
  computeOklabDeltaE,
  findMaxInGamutChroma,
  formatOklchCss,
  gamutMapOklch,
  getLightingMoodPreset,
  interpolateHueDeg,
  linearChannelToSRgb,
  linearRgbToOklab,
  linearToSRgb,
  normalizeHueDeg,
  oklabToLinearRgbUnclamped,
  oklabToOklch,
  oklabToSRgb,
  oklchToOklab,
  oklchToSRgb,
  sRgbChannelToLinear,
  sRgbToLinear,
  sRgbToOklab,
  sRgbToOklch,
  shortestHueDeltaDeg,
  type ColorMathInput,
  type FlatColorSwatch,
  type FlatSwatchRole,
  type LightingMoodPreset,
  type LightingMoodPresetId,
  type LinearRgbColor,
  type OklabColor,
  type OklchColor,
  type SrgbColor,
} from "./oklch-color-math-and-presets";

export {
  LIGHTING_MOOD_PRESETS,
  LIGHTING_MOOD_PRESET_IDS,
  computeOklabDeltaE,
  findMaxInGamutChroma,
  formatOklchCss,
  gamutMapOklch,
  getLightingMoodPreset,
  interpolateHueDeg,
  linearChannelToSRgb,
  linearRgbToOklab,
  linearToSRgb,
  normalizeHueDeg,
  oklabToLinearRgbUnclamped,
  oklabToOklch,
  oklabToSRgb,
  oklchToOklab,
  oklchToSRgb,
  sRgbChannelToLinear,
  sRgbToLinear,
  sRgbToOklab,
  sRgbToOklch,
  shortestHueDeltaDeg,
  type ColorMathInput,
  type FlatColorSwatch,
  type FlatSwatchRole,
  type LightingMoodPreset,
  type LightingMoodPresetId,
  type LinearRgbColor,
  type OklabColor,
  type OklchColor,
  type SrgbColor,
};

export interface RelightPaletteOptions {
  readonly intensity?: number;
  readonly skinAnchorStrength?: number;
  readonly maxAllowedSkinHueDriftDeg?: number;
  readonly minShadowChromaRetention?: number;
}

export interface RelitColorSwatch {
  readonly swatchId: string;
  readonly labelKo: string;
  readonly role: FlatSwatchRole;
  readonly baseSrgb: SrgbColor;
  readonly baseOklch: OklchColor;
  readonly litSrgb: SrgbColor;
  readonly litOklch: OklchColor;
  readonly midtoneSrgb: SrgbColor;
  readonly midtoneOklch: OklchColor;
  readonly shadowSrgb: SrgbColor;
  readonly shadowOklch: OklchColor;
  readonly rimSrgb: SrgbColor;
  readonly rimOklch: OklchColor;
  readonly naiveBlackShadowSrgb: SrgbColor;
  readonly naiveBlackShadowOklch: OklchColor;
  readonly shadowChromaRetention: number;
  readonly shadowHueShiftDeg: number;
  readonly midtoneHueDriftDeg: number;
  readonly skinHueDriftDeg: number | null;
  readonly skinAnchorApplied: boolean;
  readonly skinProtected: boolean;
  readonly antiMudPassed: boolean;
}

export interface RelitPaletteResult {
  readonly preset: LightingMoodPreset;
  readonly intensity: number;
  readonly appliedSkinAnchorStrength: number;
  readonly appliedMaxSkinHueDriftDeg: number;
  readonly appliedMinShadowChromaRetention: number;
  readonly swatches: readonly RelitColorSwatch[];
  readonly maxSkinHueDriftDeg: number;
  readonly allSkinProtected: boolean;
  readonly minShadowChromaRetention: number;
  readonly allAntiMudPassed: boolean;
  readonly meanMidtoneLightness: number;
  readonly meanMidtoneChroma: number;
  readonly warmthIndex: number;
}

export interface RelightRgbaTileOptions extends RelightPaletteOptions {
  readonly width: number;
  readonly height: number;
  readonly keyLightDirection?: { readonly x: number; readonly y: number };
  readonly protectSkinHeuristic?: boolean;
}

export interface RelitRgbaTileResult {
  readonly presetId: LightingMoodPresetId;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly pixelCount: number;
  readonly opaquePixelCount: number;
  readonly skinDetectedPixelCount: number;
  readonly meanDeltaE: number;
  readonly hasNonFinite: boolean;
}

const ROLE_ADAPTATION_WEIGHT: Readonly<Record<FlatSwatchRole, number>> = {
  skin: 1.0,
  hair: 0.86,
  costume: 0.9,
  prop: 0.94,
  background: 1.0,
};

const ACHROMATIC_CHROMA_EPSILON = 0.02;
const NAIVE_SHADOW_RGB_MULTIPLIER = 0.52;
const SKIN_SUBSURFACE_WARM_HUE_DEG = 40;

function clampHueAroundAnchor(
  candidateHueDeg: number,
  anchorHueDeg: number,
  maxDriftDeg: number,
): number {
  const drift = shortestHueDeltaDeg(anchorHueDeg, candidateHueDeg);
  if (Math.abs(drift) <= maxDriftDeg) {
    return normalizeHueDeg(candidateHueDeg);
  }
  const sign = drift >= 0 ? 1 : -1;
  return normalizeHueDeg(anchorHueDeg + sign * maxDriftDeg);
}

interface RelitSingleToneSet {
  readonly lit: OklchColor;
  readonly midtone: OklchColor;
  readonly shadow: OklchColor;
  readonly rim: OklchColor;
}

function relightSingleOklch(
  baseOklch: OklchColor,
  role: FlatSwatchRole,
  preset: LightingMoodPreset,
  intensity: number,
  skinAnchorStrength: number,
  maxSkinHueDriftDeg: number,
  minShadowChromaRetention: number,
): RelitSingleToneSet {
  const isSkin = role === "skin";
  const isAchromatic = baseOklch.c < ACHROMATIC_CHROMA_EPSILON;
  const roleWeight = ROLE_ADAPTATION_WEIGHT[role];
  const adaptFactor = isSkin
    ? Math.max(0.12, (1 - skinAnchorStrength) * 0.95) * intensity
    : roleWeight * intensity;

  const baseLab = oklchToOklab(baseOklch);
  const keyLab = oklchToOklab(preset.keyLightOklch);
  const fillLab = oklchToOklab(preset.ambientFillOklch);
  const rimLab = oklchToOklab(preset.rimLightOklch);

  // 1) 미드톤: 색온도 순응 + 장면 대비/노출 조정
  const contrastScaledL = 0.52 + (baseOklch.l - 0.52) * (1 + (preset.contrastGain - 1) * intensity);
  const midL = clampFinite(
    contrastScaledL + preset.midtoneLightnessBias * intensity * (isSkin ? 0.72 : 1.0),
    0.09,
    0.94,
  );

  const effectiveChromaScale = isSkin
    ? 1 + (preset.chromaScale - 1) * (preset.id === "flashback-sepia-memory" ? 0.85 : 0.45)
    : 1 + (preset.chromaScale - 1) * intensity;

  const midKeyPull = clampFinite(preset.keyTintStrength * adaptFactor * 0.65, 0, 0.78);
  const midFillPull = clampFinite(preset.shadowShiftStrength * adaptFactor * 0.22, 0, 0.35);

  const rawMidLch = oklabToOklch({
    l: midL,
    a:
      baseLab.a * effectiveChromaScale * (1 - midKeyPull * 0.55) +
      keyLab.a * midKeyPull * 0.85 +
      fillLab.a * midFillPull * 0.45,
    b:
      baseLab.b * effectiveChromaScale * (1 - midKeyPull * 0.55) +
      keyLab.b * midKeyPull * 0.85 +
      fillLab.b * midFillPull * 0.45,
  });
  const midHue = isSkin
    ? clampHueAroundAnchor(rawMidLch.h, baseOklch.h, maxSkinHueDriftDeg)
    : rawMidLch.h;
  const midtone = gamutMapOklch({
    l: midL,
    c: isSkin ? Math.max(rawMidLch.c, baseOklch.c * Math.min(0.82, effectiveChromaScale)) : rawMidLch.c,
    h: midHue,
  });

  // 2) 하이라이트(Lit): 주광 방향 명도 상승 + 주광 색온도 편이
  const litL = clampFinite(
    midtone.l + preset.litLightnessLift * intensity * (0.62 + 0.38 * (1 - midtone.l)),
    0.15,
    0.97,
  );
  const litKeyPull = clampFinite(preset.keyTintStrength * adaptFactor * 0.92, 0, 0.85);
  const midLabMapped = oklchToOklab(midtone);
  const rawLitLch = oklabToOklch({
    l: litL,
    a: midLabMapped.a * (1 - litKeyPull * 0.4) + keyLab.a * litKeyPull * 0.9,
    b: midLabMapped.b * (1 - litKeyPull * 0.4) + keyLab.b * litKeyPull * 0.9,
  });
  const litHue = isSkin
    ? clampHueAroundAnchor(rawLitLch.h, baseOklch.h, maxSkinHueDriftDeg)
    : rawLitLch.h;
  const lit = gamutMapOklch({ l: litL, c: rawLitLch.c, h: litHue });

  // 3) Anti-Mud 암부(Shadow): 흑색 곱셈 금지, 환경광 색상각으로 회전 + 채도 보존
  let shadowL = clampFinite(
    midtone.l - preset.shadowLightnessDrop * intensity * (0.72 + 0.28 * midtone.l),
    0.1,
    0.82,
  );

  let shadowHue: number;
  if (isAchromatic) {
    shadowHue = preset.ambientFillOklch.h;
  } else if (isSkin) {
    const sssHue = interpolateHueDeg(baseOklch.h, SKIN_SUBSURFACE_WARM_HUE_DEG, 0.22 * intensity);
    const ambientKiss = interpolateHueDeg(
      sssHue,
      preset.ambientFillOklch.h,
      clampFinite(preset.shadowShiftStrength * (1 - skinAnchorStrength) * 0.75 * intensity, 0, 0.35),
    );
    shadowHue = clampHueAroundAnchor(ambientKiss, baseOklch.h, maxSkinHueDriftDeg);
  } else {
    const shiftWeight = clampFinite(preset.shadowShiftStrength * roleWeight * 0.72 * intensity, 0.14, 0.62);
    shadowHue = interpolateHueDeg(midtone.h, preset.ambientFillOklch.h, shiftWeight);
  }

  const requiredRetention = Math.max(minShadowChromaRetention, preset.shadowChromaFloorRatio);
  const sepiaMode = preset.id === "flashback-sepia-memory";
  const targetShadowChroma = isAchromatic
    ? preset.ambientFillOklch.c * preset.shadowShiftStrength * 0.48 * intensity
    : Math.max(
        midtone.c * (sepiaMode ? 0.92 : 0.98),
        baseOklch.c * (sepiaMode ? Math.min(requiredRetention, 0.68) : requiredRetention + 0.06),
      );

  if (!isAchromatic) {
    let maxChromaAtShadow = findMaxInGamutChroma(shadowL, shadowHue);
    const floorChroma = baseOklch.c * (sepiaMode ? 0.54 : requiredRetention + 0.01);
    for (let step = 0; step < 6 && maxChromaAtShadow < floorChroma && shadowL < 0.56; step += 1) {
      shadowL = clampFinite(shadowL + 0.025, 0.1, 0.58);
      maxChromaAtShadow = findMaxInGamutChroma(shadowL, shadowHue);
    }
  }
  const shadow = gamutMapOklch({ l: shadowL, c: targetShadowChroma, h: shadowHue });

  // 4) 림 라이트(Rim): 실루엣 윤곽 분리용 강세 악센트광
  const rimPull = clampFinite(preset.rimStrength * (isSkin ? 0.48 : 0.85) * intensity, 0, 0.88);
  const rimL = clampFinite(
    Math.max(lit.l + 0.05, preset.rimLightOklch.l * 0.72 + midtone.l * 0.28),
    0.34,
    0.98,
  );
  const rawRimLch = oklabToOklch({
    l: rimL,
    a: midLabMapped.a * (1 - rimPull * 0.65) + rimLab.a * rimPull * 1.05,
    b: midLabMapped.b * (1 - rimPull * 0.65) + rimLab.b * rimPull * 1.05,
  });
  const rim = gamutMapOklch({
    l: rimL,
    c: Math.max(rawRimLch.c, preset.rimLightOklch.c * rimPull * 0.72),
    h: rawRimLch.h,
  });

  return { lit, midtone, shadow, rim };
}

/**
 * 캐릭터·배경 플랫 원색 팔레트를 지정된 조명 분위기 프리셋으로 재조명한다.
 * Anti-Mud 암부 채도 유지와 피부색 기억색 보호 불변식을 함께 검증해 반환한다.
 */
export function relightFlatPaletteForMood(
  swatches: readonly FlatColorSwatch[],
  moodPresetId: LightingMoodPresetId,
  options?: RelightPaletteOptions,
): RelitPaletteResult {
  const preset = LIGHTING_MOOD_PRESETS[moodPresetId];
  const intensity = clampFinite(options?.intensity ?? 1.0, 0, 1.5);
  const skinAnchorStrength = clampFinite(
    options?.skinAnchorStrength ?? preset.defaultSkinAnchorStrength,
    0,
    1,
  );
  const maxAllowedSkinHueDriftDeg = clampFinite(
    options?.maxAllowedSkinHueDriftDeg ?? preset.maxAllowedSkinHueDriftDeg,
    4,
    45,
  );
  const minShadowChromaRetention = clampFinite(options?.minShadowChromaRetention ?? 0.65, 0.4, 1.0);

  const relitSwatches: RelitColorSwatch[] = [];
  let maxSkinHueDriftDeg = 0;
  let allSkinProtected = true;
  let minObservedRetention = 1;
  let allAntiMudPassed = true;
  let sumMidL = 0;
  let sumMidC = 0;
  let sumWarmth = 0;

  for (let i = 0; i < swatches.length; i += 1) {
    const swatch = swatches[i];
    const baseSrgb: SrgbColor = {
      r: Math.round(clampFinite(swatch.srgb.r, 0, 255)),
      g: Math.round(clampFinite(swatch.srgb.g, 0, 255)),
      b: Math.round(clampFinite(swatch.srgb.b, 0, 255)),
    };
    const baseOklch = sRgbToOklch(baseSrgb);

    const tones = relightSingleOklch(
      baseOklch,
      swatch.role,
      preset,
      intensity,
      skinAnchorStrength,
      maxAllowedSkinHueDriftDeg,
      minShadowChromaRetention,
    );

    const litSrgb = oklchToSRgb(tones.lit);
    const midtoneSrgb = oklchToSRgb(tones.midtone);
    const shadowSrgb = oklchToSRgb(tones.shadow);
    const rimSrgb = oklchToSRgb(tones.rim);

    const litOklch = sRgbToOklch(litSrgb);
    const midtoneOklch = sRgbToOklch(midtoneSrgb);
    const shadowOklch = sRgbToOklch(shadowSrgb);
    const rimOklch = sRgbToOklch(rimSrgb);

    const naiveBlackShadowSrgb: SrgbColor = {
      r: Math.round(baseSrgb.r * NAIVE_SHADOW_RGB_MULTIPLIER),
      g: Math.round(baseSrgb.g * NAIVE_SHADOW_RGB_MULTIPLIER),
      b: Math.round(baseSrgb.b * NAIVE_SHADOW_RGB_MULTIPLIER),
    };
    const naiveBlackShadowOklch = sRgbToOklch(naiveBlackShadowSrgb);

    const isAchromatic = baseOklch.c < ACHROMATIC_CHROMA_EPSILON;
    const shadowChromaRetention = isAchromatic ? 1 : shadowOklch.c / Math.max(1e-6, baseOklch.c);
    const shadowHueShiftDeg = isAchromatic ? 0 : shortestHueDeltaDeg(baseOklch.h, shadowOklch.h);
    const midtoneHueDriftDeg = isAchromatic
      ? 0
      : Math.abs(shortestHueDeltaDeg(baseOklch.h, midtoneOklch.h));

    const isSkin = swatch.role === "skin";
    const skinHueDriftDeg = isSkin
      ? Math.max(
          Math.abs(shortestHueDeltaDeg(baseOklch.h, midtoneOklch.h)),
          Math.abs(shortestHueDeltaDeg(baseOklch.h, litOklch.h)),
          Math.abs(shortestHueDeltaDeg(baseOklch.h, shadowOklch.h)),
        )
      : null;
    const skinProtected = !isSkin || (skinHueDriftDeg ?? 0) <= maxAllowedSkinHueDriftDeg + 0.5;

    const effectiveRetentionGate =
      preset.id === "flashback-sepia-memory"
        ? Math.min(minShadowChromaRetention, 0.52)
        : minShadowChromaRetention;
    const antiMudPassed =
      isAchromatic ||
      (shadowChromaRetention >= effectiveRetentionGate &&
        (preset.id === "flashback-sepia-memory" ||
          shadowOklch.c >= naiveBlackShadowOklch.c - 1e-4));

    if (isSkin && skinHueDriftDeg !== null) {
      maxSkinHueDriftDeg = Math.max(maxSkinHueDriftDeg, skinHueDriftDeg);
    }
    if (!skinProtected) {
      allSkinProtected = false;
    }
    if (!isAchromatic) {
      minObservedRetention = Math.min(minObservedRetention, shadowChromaRetention);
    }
    if (!antiMudPassed) {
      allAntiMudPassed = false;
    }

    const midLab = oklchToOklab(midtoneOklch);
    const litLab = oklchToOklab(litOklch);
    sumMidL += midtoneOklch.l;
    sumMidC += midtoneOklch.c;
    sumWarmth += (midLab.a + litLab.a) * 0.5 + (midLab.b + litLab.b) * 0.45;

    relitSwatches.push({
      swatchId: swatch.swatchId,
      labelKo: swatch.labelKo,
      role: swatch.role,
      baseSrgb,
      baseOklch,
      litSrgb,
      litOklch,
      midtoneSrgb,
      midtoneOklch,
      shadowSrgb,
      shadowOklch,
      rimSrgb,
      rimOklch,
      naiveBlackShadowSrgb,
      naiveBlackShadowOklch,
      shadowChromaRetention,
      shadowHueShiftDeg,
      midtoneHueDriftDeg,
      skinHueDriftDeg,
      skinAnchorApplied: isSkin,
      skinProtected,
      antiMudPassed,
    });
  }

  const count = Math.max(1, relitSwatches.length);
  return {
    preset,
    intensity,
    appliedSkinAnchorStrength: skinAnchorStrength,
    appliedMaxSkinHueDriftDeg: maxAllowedSkinHueDriftDeg,
    appliedMinShadowChromaRetention: minShadowChromaRetention,
    swatches: relitSwatches,
    maxSkinHueDriftDeg,
    allSkinProtected,
    minShadowChromaRetention: relitSwatches.length === 0 ? 1 : minObservedRetention,
    allAntiMudPassed,
    meanMidtoneLightness: sumMidL / count,
    meanMidtoneChroma: sumMidC / count,
    warmthIndex: sumWarmth / count,
  };
}

function estimateSkinHeuristicMask(lch: OklchColor): number {
  if (lch.l < 0.28 || lch.l > 0.94 || lch.c < 0.025 || lch.c > 0.16) {
    return 0;
  }
  const hueDist = Math.abs(shortestHueDeltaDeg(52, lch.h));
  if (hueDist > 30) {
    return 0;
  }
  const hueScore = 1 - hueDist / 30;
  const chromaScore = lch.c <= 0.125 ? 1 : clampFinite(1 - (lch.c - 0.125) / 0.035, 0, 1);
  return clampFinite(hueScore * chromaScore, 0, 1);
}

function lerpOklab(a: OklabColor, b: OklabColor, t: number): OklabColor {
  return {
    l: a.l + (b.l - a.l) * t,
    a: a.a + (b.a - a.a) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

/**
 * 소형 RGBA 래스터 타일을 결정론적으로 재조명한다.
 * 알파 채널을 비트 단위로 보존하며 `NaN`/`Infinity` 출력을 원천 차단한다.
 */
export function relightCompactRgbaTile(
  rgba: Uint8ClampedArray,
  moodPresetId: LightingMoodPresetId,
  options: RelightRgbaTileOptions,
): RelitRgbaTileResult {
  const width = Math.max(0, Math.floor(Number.isFinite(options.width) ? options.width : 0));
  const height = Math.max(0, Math.floor(Number.isFinite(options.height) ? options.height : 0));
  const pixelCount = width * height;
  const expectedLength = pixelCount * 4;
  if (rgba.length < expectedLength) {
    throw new Error(
      `RGBA buffer length (${String(rgba.length)}) is smaller than ${String(width)}x${String(height)}x4 (${String(expectedLength)})`,
    );
  }

  const preset = LIGHTING_MOOD_PRESETS[moodPresetId];
  const intensity = clampFinite(options.intensity ?? 1.0, 0, 1.5);
  const skinAnchorStrength = clampFinite(
    options.skinAnchorStrength ?? preset.defaultSkinAnchorStrength,
    0,
    1,
  );
  const maxSkinHueDriftDeg = clampFinite(
    options.maxAllowedSkinHueDriftDeg ?? preset.maxAllowedSkinHueDriftDeg,
    4,
    45,
  );
  const minShadowChromaRetention = clampFinite(options.minShadowChromaRetention ?? 0.65, 0.4, 1.0);
  const protectSkin = options.protectSkinHeuristic !== false;

  const dirX = options.keyLightDirection?.x ?? -0.6;
  const dirY = options.keyLightDirection?.y ?? -0.8;
  const dirMag = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
  const nx = dirX / dirMag;
  const ny = dirY / dirMag;

  const out = new Uint8ClampedArray(expectedLength);
  let opaquePixelCount = 0;
  let skinDetectedPixelCount = 0;
  let totalDeltaE = 0;
  let hasNonFinite = false;

  for (let y = 0; y < height; y += 1) {
    const vy = height <= 1 ? 0 : (y / (height - 1)) * 2 - 1;
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      const a = rgba[idx + 3];

      if (a === 0) {
        out[idx] = r;
        out[idx + 1] = g;
        out[idx + 2] = b;
        out[idx + 3] = 0;
        continue;
      }

      opaquePixelCount += 1;
      const vx = width <= 1 ? 0 : (x / (width - 1)) * 2 - 1;
      const lightProjection = clampFinite((vx * nx + vy * ny) * 0.5 + 0.5, 0, 1);

      const baseOklch = sRgbToOklch({ r, g, b });
      const skinWeight = protectSkin ? estimateSkinHeuristicMask(baseOklch) : 0;
      const effectiveRole: FlatSwatchRole = skinWeight >= 0.45 ? "skin" : "costume";
      if (effectiveRole === "skin") {
        skinDetectedPixelCount += 1;
      }

      const tones = relightSingleOklch(
        baseOklch,
        effectiveRole,
        preset,
        intensity,
        skinAnchorStrength * (effectiveRole === "skin" ? skinWeight : 1),
        maxSkinHueDriftDeg,
        minShadowChromaRetention,
      );

      let blendedLab: OklabColor;
      if (lightProjection < 0.45) {
        blendedLab = lerpOklab(oklchToOklab(tones.shadow), oklchToOklab(tones.midtone), lightProjection / 0.45);
      } else if (lightProjection < 0.88) {
        blendedLab = lerpOklab(oklchToOklab(tones.midtone), oklchToOklab(tones.lit), (lightProjection - 0.45) / 0.43);
      } else {
        blendedLab = lerpOklab(oklchToOklab(tones.lit), oklchToOklab(tones.rim), (lightProjection - 0.88) / 0.12);
      }

      const finalSrgb = oklabToSRgb(blendedLab);
      if (
        !Number.isFinite(finalSrgb.r) ||
        !Number.isFinite(finalSrgb.g) ||
        !Number.isFinite(finalSrgb.b)
      ) {
        hasNonFinite = true;
      }

      out[idx] = finalSrgb.r;
      out[idx + 1] = finalSrgb.g;
      out[idx + 2] = finalSrgb.b;
      out[idx + 3] = a;
      totalDeltaE += computeOklabDeltaE(baseOklch, sRgbToOklch(finalSrgb));
    }
  }

  return {
    presetId: moodPresetId,
    width,
    height,
    rgba: out,
    pixelCount,
    opaquePixelCount,
    skinDetectedPixelCount,
    meanDeltaE: opaquePixelCount === 0 ? 0 : totalDeltaE / opaquePixelCount,
    hasNonFinite,
  };
}
