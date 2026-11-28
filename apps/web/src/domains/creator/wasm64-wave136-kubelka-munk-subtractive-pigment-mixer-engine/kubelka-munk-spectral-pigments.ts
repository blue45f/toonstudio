/**
 * Wave 136 — 10-밴드 가시광선(410nm~680nm) Kubelka-Munk 감산 안료 혼색 커널.
 *
 * - 반사율 R(λ) ↔ 흡수·산란 계수 K(λ)/S(λ) 무손실 왕복 변환 (유리화 수식, 오차 < 1e-12)
 * - 다중 안료 2상수 / 단일 상수 KM 감산 혼색 (`mixSubtractivePigments`)
 * - 디지털 RGB 선형 보간 대비 감산 혼색의 녹색 채도 우위 정량 대조 (`compareSubtractiveVsRgbMix`)
 */

import {
  circularHueDiffDeg,
  clampFinite,
  formatOklchCss,
  liftSrgbToSpectralReflectance,
  linearRgbToOklch,
  linearRgbToSrgb,
  MAX_PHYSICAL_REFLECTANCE,
  MIN_PHYSICAL_REFLECTANCE,
  SPECTRAL_BAND_COUNT,
  spectralReflectanceToSrgb,
  spectralReflectanceToXyz,
  srgbToOklch,
  STUDIO_PIGMENT_PRESETS,
  toTuple10,
  xyzToLinearRgb,
  type OklchColor,
  type RgbTuple,
  type SpectralTuple10,
  type StudioPigmentId,
} from "./spectral-colorimetry-and-presets";

export {
  circularHueDiffDeg,
  clampFinite,
  computeOklchDeltaE,
  formatOklchCss,
  getStudioPigmentPreset,
  liftSrgbToSpectralReflectance,
  linearChannelToSrgb,
  linearRgbToOklch,
  linearRgbToSrgb,
  MAX_PHYSICAL_REFLECTANCE,
  MIN_PHYSICAL_REFLECTANCE,
  SPECTRAL_BAND_COUNT,
  SPECTRAL_TO_XYZ_WEIGHTS,
  SPECTRAL_WAVELENGTHS_NM,
  spectralReflectanceToLinearRgb,
  spectralReflectanceToOklch,
  spectralReflectanceToSrgb,
  spectralReflectanceToXyz,
  srgbChannelToLinear,
  srgbToLinearRgb,
  srgbToOklch,
  STUDIO_PIGMENT_IDS,
  STUDIO_PIGMENT_PRESETS,
  toTuple10,
  xyzToLinearRgb,
  type OklchColor,
  type RgbTuple,
  type SpectralLiftingResult,
  type SpectralTuple10,
  type StudioPigmentId,
  type StudioPigmentPreset,
} from "./spectral-colorimetry-and-presets";

export interface PigmentMixInput {
  readonly pigmentId?: StudioPigmentId;
  readonly customReflectance?: SpectralTuple10;
  readonly customScatteringS?: SpectralTuple10;
  readonly customSrgb?: RgbTuple;
  readonly customLabelKo?: string;
  readonly weight: number;
  readonly tintingStrength?: number;
}

export interface PigmentMixOptions {
  /** true이면 2상수 KM(K와 S 각각 가중합), false이면 단일 상수 K/S 가중합을 적용한다. */
  readonly useTwoConstantKm?: boolean;
  /** 안료 고유 착색력(tintingStrength)을 혼합 비율에 곱할지 여부. 기본값 false(순수 부피비). */
  readonly applyTintingStrength?: boolean;
}

export interface SubtractivePigmentMixResult {
  readonly reflectance: SpectralTuple10;
  readonly ksRatio: SpectralTuple10;
  readonly absorptionK: SpectralTuple10;
  readonly scatteringS: SpectralTuple10;
  readonly xyz: RgbTuple;
  readonly linearRgb: RgbTuple;
  readonly srgb: RgbTuple;
  readonly srgb255: RgbTuple;
  readonly oklch: OklchColor;
  readonly oklchCss: string;
  readonly normalizedWeights: readonly number[];
  readonly totalWeight: number;
  readonly usedTwoConstantKm: boolean;
}

export interface SubtractiveVsRgbStop {
  readonly ratioB: number;
  readonly subtractiveOklch: OklchColor;
  readonly subtractiveOklchCss: string;
  readonly subtractiveSrgb: RgbTuple;
  readonly rgbLinearOklch: OklchColor;
  readonly rgbLinearOklchCss: string;
  readonly rgbLinearSrgb: RgbTuple;
  readonly chromaAdvantage: number;
}

export interface SubtractiveVsRgbComparison {
  readonly pigmentAId: StudioPigmentId;
  readonly pigmentBId: StudioPigmentId;
  readonly pigmentANameKo: string;
  readonly pigmentBNameKo: string;
  readonly midpointRatioB: number;
  readonly subtractiveMidpoint: SubtractivePigmentMixResult;
  readonly rgbLinearMidpointSrgb: RgbTuple;
  readonly rgbLinearMidpointOklch: OklchColor;
  readonly rgbLinearMidpointOklchCss: string;
  readonly chromaAdvantage: number;
  readonly chromaRatio: number;
  readonly hueShiftDeg: number;
  readonly isVividGreenMidpoint: boolean;
  readonly stops: readonly SubtractiveVsRgbStop[];
}

function uniformTuple10(value: number): SpectralTuple10 {
  return [value, value, value, value, value, value, value, value, value, value];
}

/** 단일 파장 반사율 R ∈ (0, 1]을 Kubelka-Munk K/S = (1 - R)² / (2R)로 변환한다. */
export function reflectanceToKs(reflectance: number): number {
  const r = clampFinite(reflectance, MIN_PHYSICAL_REFLECTANCE, MAX_PHYSICAL_REFLECTANCE);
  const oneMinusR = 1 - r;
  return (oneMinusR * oneMinusR) / (2 * r);
}

/**
 * Kubelka-Munk K/S ≥ 0을 무한 두께 반사율 R로 역변환한다.
 * 수치 소거 오차를 막기 위해 유리화 형태 1 / (1 + θ + sqrt(θ² + 2θ))를 사용한다.
 */
export function ksToReflectance(ksRatio: number): number {
  const theta = clampFinite(ksRatio, 0, 1e8);
  if (theta === 0) return 1;
  return clampFinite(1 / (1 + theta + Math.sqrt(theta * theta + 2 * theta)), 0, 1);
}

export function spectralReflectanceToKs(reflectance: SpectralTuple10): SpectralTuple10 {
  return toTuple10(reflectance.map((r) => reflectanceToKs(r)));
}

export function spectralKsToReflectance(ksRatio: SpectralTuple10): SpectralTuple10 {
  return toTuple10(ksRatio.map((ks) => ksToReflectance(ks)));
}

interface ResolvedPigmentEntry {
  readonly reflectance: SpectralTuple10;
  readonly scatteringS: SpectralTuple10;
  readonly effectiveWeight: number;
}

function resolvePigmentEntry(
  input: PigmentMixInput,
  applyTintingStrength: boolean,
): ResolvedPigmentEntry {
  const baseWeight = Math.max(0, Number.isFinite(input.weight) ? input.weight : 0);
  if (input.pigmentId !== undefined) {
    const preset = STUDIO_PIGMENT_PRESETS[input.pigmentId];
    const tint = input.tintingStrength ?? preset.tintingStrength;
    return {
      reflectance: preset.reflectance,
      scatteringS: input.customScatteringS ?? preset.scatteringS,
      effectiveWeight: applyTintingStrength ? baseWeight * tint : baseWeight,
    };
  }
  const tint = input.tintingStrength ?? 1.0;
  const reflectance =
    input.customReflectance ?? liftSrgbToSpectralReflectance(input.customSrgb ?? [0.5, 0.5, 0.5]).reflectance;
  return {
    reflectance,
    scatteringS: input.customScatteringS ?? uniformTuple10(1.0),
    effectiveWeight: applyTintingStrength ? baseWeight * tint : baseWeight,
  };
}

function packMixResult(
  reflectance: SpectralTuple10,
  ksRatio: SpectralTuple10,
  absorptionK: SpectralTuple10,
  scatteringS: SpectralTuple10,
  normalizedWeights: readonly number[],
  totalWeight: number,
  usedTwoConstantKm: boolean,
): SubtractivePigmentMixResult {
  const xyz = spectralReflectanceToXyz(reflectance);
  const linearRgb = xyzToLinearRgb(xyz);
  const srgb = linearRgbToSrgb(linearRgb);
  const oklch = linearRgbToOklch(linearRgb);
  return {
    reflectance,
    ksRatio,
    absorptionK,
    scatteringS,
    xyz,
    linearRgb,
    srgb,
    srgb255: [Math.round(srgb[0] * 255), Math.round(srgb[1] * 255), Math.round(srgb[2] * 255)],
    oklch,
    oklchCss: formatOklchCss(oklch),
    normalizedWeights,
    totalWeight,
    usedTwoConstantKm,
  };
}

/**
 * 다중 안료를 10-밴드 Kubelka-Munk 감산 모델로 가중 혼합한다.
 * - 2상수 KM: K_mix(λ) = Σ w_i K_i(λ), S_mix(λ) = Σ w_i S_i(λ), (K/S)_mix = K_mix / S_mix
 * - 단일 상수 KM: (K/S)_mix(λ) = Σ w_i (K_i / S_i)(λ)
 */
export function mixSubtractivePigments(
  entries: readonly PigmentMixInput[],
  options?: PigmentMixOptions,
): SubtractivePigmentMixResult {
  const useTwoConstantKm = options?.useTwoConstantKm ?? true;
  const applyTintingStrength = options?.applyTintingStrength ?? false;

  const resolved: ResolvedPigmentEntry[] = [];
  let totalWeight = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = resolvePigmentEntry(entries[i], applyTintingStrength);
    resolved.push(entry);
    totalWeight += entry.effectiveWeight;
  }

  if (resolved.length === 0 || totalWeight <= 1e-12) {
    const white = STUDIO_PIGMENT_PRESETS["titanium-white"];
    const ks = spectralReflectanceToKs(white.reflectance);
    const absK = toTuple10(ks.map((v, b) => v * white.scatteringS[b]));
    return packMixResult(white.reflectance, ks, absK, white.scatteringS, [], 0, useTwoConstantKm);
  }

  const normalizedWeights = resolved.map((r) => r.effectiveWeight / totalWeight);
  const mixedK: number[] = new Array<number>(SPECTRAL_BAND_COUNT).fill(0);
  const mixedS: number[] = new Array<number>(SPECTRAL_BAND_COUNT).fill(0);
  const mixedKs: number[] = new Array<number>(SPECTRAL_BAND_COUNT).fill(0);

  for (let i = 0; i < resolved.length; i += 1) {
    const w = normalizedWeights[i];
    if (w <= 0) continue;
    const item = resolved[i];
    for (let b = 0; b < SPECTRAL_BAND_COUNT; b += 1) {
      const ksBand = reflectanceToKs(item.reflectance[b]);
      const sBand = Math.max(0.05, item.scatteringS[b]);
      if (useTwoConstantKm) {
        mixedK[b] += w * ksBand * sBand;
        mixedS[b] += w * sBand;
      } else {
        mixedKs[b] += w * ksBand;
        mixedS[b] += w;
        mixedK[b] += w * ksBand;
      }
    }
  }

  if (useTwoConstantKm) {
    for (let b = 0; b < SPECTRAL_BAND_COUNT; b += 1) {
      mixedKs[b] = mixedK[b] / Math.max(1e-6, mixedS[b]);
    }
  }

  const ksTuple = toTuple10(mixedKs);
  const reflectance = spectralKsToReflectance(ksTuple);
  return packMixResult(
    reflectance,
    ksTuple,
    toTuple10(mixedK),
    toTuple10(mixedS),
    normalizedWeights,
    totalWeight,
    useTwoConstantKm,
  );
}

/**
 * 두 화방 안료의 Kubelka-Munk 감산 혼색과 일반 디지털 RGB 선형 보간 결과를
 * 다단계 그라데이션 및 중앙 비율(기본 50:50)에서 직접 대조한다.
 */
export function compareSubtractiveVsRgbMix(
  pigmentAId: StudioPigmentId,
  pigmentBId: StudioPigmentId,
  midpointRatioB = 0.5,
  gradientStops = 11,
): SubtractiveVsRgbComparison {
  const ratio = clampFinite(midpointRatioB, 0, 1);
  const presetA = STUDIO_PIGMENT_PRESETS[pigmentAId];
  const presetB = STUDIO_PIGMENT_PRESETS[pigmentBId];
  const srgbA = spectralReflectanceToSrgb(presetA.reflectance);
  const srgbB = spectralReflectanceToSrgb(presetB.reflectance);

  const mixRgbSrgb = (t: number): RgbTuple => [
    clampFinite(srgbA[0] * (1 - t) + srgbB[0] * t, 0, 1),
    clampFinite(srgbA[1] * (1 - t) + srgbB[1] * t, 0, 1),
    clampFinite(srgbA[2] * (1 - t) + srgbB[2] * t, 0, 1),
  ];

  const subtractiveMidpoint = mixSubtractivePigments([
    { pigmentId: pigmentAId, weight: 1 - ratio },
    { pigmentId: pigmentBId, weight: ratio },
  ]);
  const rgbLinearMidpointSrgb = mixRgbSrgb(ratio);
  const rgbLinearMidpointOklch = srgbToOklch(rgbLinearMidpointSrgb);

  const count = Math.max(3, Math.min(21, Math.floor(gradientStops)));
  const stops: SubtractiveVsRgbStop[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const sub = mixSubtractivePigments([
      { pigmentId: pigmentAId, weight: 1 - t },
      { pigmentId: pigmentBId, weight: t },
    ]);
    const rgbStopSrgb = mixRgbSrgb(t);
    const rgbStopOklch = srgbToOklch(rgbStopSrgb);
    stops.push({
      ratioB: t,
      subtractiveOklch: sub.oklch,
      subtractiveOklchCss: sub.oklchCss,
      subtractiveSrgb: sub.srgb,
      rgbLinearOklch: rgbStopOklch,
      rgbLinearOklchCss: formatOklchCss(rgbStopOklch),
      rgbLinearSrgb: rgbStopSrgb,
      chromaAdvantage: sub.oklch.c - rgbStopOklch.c,
    });
  }

  const chromaAdvantage = subtractiveMidpoint.oklch.c - rgbLinearMidpointOklch.c;
  const chromaRatio = subtractiveMidpoint.oklch.c / Math.max(1e-6, rgbLinearMidpointOklch.c);
  const hueShiftDeg = circularHueDiffDeg(subtractiveMidpoint.oklch.h, rgbLinearMidpointOklch.h);
  const isVividGreenMidpoint =
    subtractiveMidpoint.oklch.h >= 115 &&
    subtractiveMidpoint.oklch.h <= 165 &&
    subtractiveMidpoint.oklch.c > 0.08;

  return {
    pigmentAId,
    pigmentBId,
    pigmentANameKo: presetA.nameKo,
    pigmentBNameKo: presetB.nameKo,
    midpointRatioB: ratio,
    subtractiveMidpoint,
    rgbLinearMidpointSrgb,
    rgbLinearMidpointOklch,
    rgbLinearMidpointOklchCss: formatOklchCss(rgbLinearMidpointOklch),
    chromaAdvantage,
    chromaRatio,
    hueShiftDeg,
    isVividGreenMidpoint,
    stops,
  };
}
