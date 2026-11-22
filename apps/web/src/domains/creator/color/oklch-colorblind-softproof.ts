/**
 * 색약 3종(제1색약 protanopia · 제2색약 deuteranopia · 제3색약 tritanopia) 실시간 소프트프루프 변환 행렬 및
 * WCAG 2.1 + OKLCH 명도 대비 검증 엔진.
 *
 * - 행렬 계수는 `studio-color-vision-model.ts`와 동일한 Viénot, Brettel & Mollon (1999) linearRGB 근사 행렬을 사용한다.
 * - 반드시 감마 해제된 linearRGB 색공간에서 행렬을 곱한 뒤 sRGB로 재인코딩한다(sRGB 직접 곱셈 왜곡 금지).
 * - 순수 TypeScript 모듈(DOM·Storage 의존성 0, 결정론 출력).
 */

import {
  formatRgbToHex,
  linearChannelToSrgb255,
  normalizeHexInput,
  parseHexToRgb,
  rgbToOklch,
  srgbChannelToLinear,
  type RgbTuple,
} from "./oklch-scene-temperature-palette";

export type ColorVisionDeficiencyType = "protanopia" | "deuteranopia" | "tritanopia";

export type ColorVisionSoftProofMode = "none" | ColorVisionDeficiencyType;

export type Matrix3x3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

export interface ColorVisionSoftProofMeta {
  readonly id: ColorVisionSoftProofMode;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly descriptionKo: string;
}

/** Viénot, Brettel & Mollon (1999) linearRGB 3×3 색각이상 변환 행렬. */
export const COLOR_VISION_SOFTPROOF_MATRICES: Readonly<Record<ColorVisionDeficiencyType, Matrix3x3>> = Object.freeze({
  protanopia: Object.freeze([
    Object.freeze([0.10889, 0.89111, 0.0] as const),
    Object.freeze([0.10889, 0.89111, 0.0] as const),
    Object.freeze([0.00447, -0.00447, 1.0] as const),
  ] as const),
  deuteranopia: Object.freeze([
    Object.freeze([0.29031, 0.70969, 0.0] as const),
    Object.freeze([0.29031, 0.70969, 0.0] as const),
    Object.freeze([-0.02197, 0.02197, 1.0] as const),
  ] as const),
  tritanopia: Object.freeze([
    Object.freeze([1.0, 0.15236, -0.15236] as const),
    Object.freeze([0.0, 0.86717, 0.13283] as const),
    Object.freeze([0.0, 0.86717, 0.13283] as const),
  ] as const),
});

export const COLOR_VISION_DEFICIENCY_TYPES: readonly ColorVisionDeficiencyType[] = Object.freeze([
  "protanopia",
  "deuteranopia",
  "tritanopia",
]);

export const COLOR_VISION_SOFTPROOF_MODES: readonly ColorVisionSoftProofMeta[] = Object.freeze([
  { id: "none", labelKo: "일반 색각 (원본)", shortLabelKo: "원본", descriptionKo: "보정 없이 원본 sRGB 색상 표시" },
  { id: "protanopia", labelKo: "제1색약 (적색약 · Protanopia)", shortLabelKo: "적색약", descriptionKo: "장파장(L-cone) 결손 실시간 소프트프루프" },
  { id: "deuteranopia", labelKo: "제2색약 (녹색약 · Deuteranopia)", shortLabelKo: "녹색약", descriptionKo: "중파장(M-cone) 결손 실시간 소프트프루프" },
  { id: "tritanopia", labelKo: "제3색약 (청황색약 · Tritanopia)", shortLabelKo: "청황색약", descriptionKo: "단파장(S-cone) 결손 실시간 소프트프루프" },
]);

export interface ColorPairContrastEvaluation {
  readonly colorA: string;
  readonly colorB: string;
  readonly wcagRatio: number;
  readonly oklchDeltaL: number;
  readonly passesAaText: boolean;
  readonly passesAaUi: boolean;
  readonly passesToneSeparation: boolean;
  readonly perceptualDeltaOk: number;
}

export interface CvdModeContrastAudit {
  readonly mode: ColorVisionDeficiencyType;
  readonly labelKo: string;
  readonly simulatedColors: readonly string[];
  readonly minWcagRatio: number;
  readonly minOklchDeltaL: number;
  readonly collapsedPairIndices: readonly (readonly [number, number])[];
  readonly passesDistinguishability: boolean;
}

export interface PaletteLuminanceContrastAudit {
  readonly colors: readonly string[];
  readonly minWcagRatio: number;
  readonly maxWcagRatio: number;
  readonly minOklchDeltaL: number;
  readonly passesValueHierarchy: boolean;
  readonly pairs: readonly ColorPairContrastEvaluation[];
  readonly cvdAudits: Readonly<Record<ColorVisionDeficiencyType, CvdModeContrastAudit>>;
  readonly passesAllCvdReadability: boolean;
  readonly warningKo: string | null;
}

function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** linearRGB 공간에서 색각이상 변환 행렬을 적용한다. */
export function simulateColorVisionRgb(rgb: RgbTuple, mode: ColorVisionSoftProofMode): RgbTuple {
  if (mode === "none") {
    return [
      Math.round(Math.min(255, Math.max(0, rgb[0]))),
      Math.round(Math.min(255, Math.max(0, rgb[1]))),
      Math.round(Math.min(255, Math.max(0, rgb[2]))),
    ];
  }
  const matrix = COLOR_VISION_SOFTPROOF_MATRICES[mode];
  const rLin = srgbChannelToLinear(rgb[0]);
  const gLin = srgbChannelToLinear(rgb[1]);
  const bLin = srgbChannelToLinear(rgb[2]);

  const outR = clamp01(matrix[0][0] * rLin + matrix[0][1] * gLin + matrix[0][2] * bLin);
  const outG = clamp01(matrix[1][0] * rLin + matrix[1][1] * gLin + matrix[1][2] * bLin);
  const outB = clamp01(matrix[2][0] * rLin + matrix[2][1] * gLin + matrix[2][2] * bLin);

  return [
    linearChannelToSrgb255(outR),
    linearChannelToSrgb255(outG),
    linearChannelToSrgb255(outB),
  ];
}

export function simulateColorVisionHex(hex: string, mode: ColorVisionSoftProofMode): string {
  const normalized = normalizeHexInput(hex);
  if (mode === "none") return normalized;
  return formatRgbToHex(simulateColorVisionRgb(parseHexToRgb(normalized), mode));
}

/**
 * RGBA8 픽셀 버퍼 전체에 실시간 색약 소프트프루프 변환을 적용한다.
 * 원본 버퍼를 변경하지 않으며 알파 채널(투명도)을 100% 보존한다.
 */
export function softProofRgbaForColorVision(
  input: Uint8ClampedArray | Uint8Array,
  mode: ColorVisionSoftProofMode,
): Uint8ClampedArray<ArrayBuffer> {
  const output = new Uint8ClampedArray(input.length);
  if (mode === "none") {
    output.set(input);
    return output;
  }
  const matrix = COLOR_VISION_SOFTPROOF_MATRICES[mode];
  const m00 = matrix[0][0];
  const m01 = matrix[0][1];
  const m02 = matrix[0][2];
  const m10 = matrix[1][0];
  const m11 = matrix[1][1];
  const m12 = matrix[1][2];
  const m20 = matrix[2][0];
  const m21 = matrix[2][1];
  const m22 = matrix[2][2];

  for (let i = 0; i + 3 < input.length; i += 4) {
    const alpha = input[i + 3] ?? 0;
    output[i + 3] = alpha;
    if (alpha === 0) {
      output[i] = 0;
      output[i + 1] = 0;
      output[i + 2] = 0;
      continue;
    }
    const rLin = srgbChannelToLinear(input[i] ?? 0);
    const gLin = srgbChannelToLinear(input[i + 1] ?? 0);
    const bLin = srgbChannelToLinear(input[i + 2] ?? 0);

    output[i] = linearChannelToSrgb255(clamp01(m00 * rLin + m01 * gLin + m02 * bLin));
    output[i + 1] = linearChannelToSrgb255(clamp01(m10 * rLin + m11 * gLin + m12 * bLin));
    output[i + 2] = linearChannelToSrgb255(clamp01(m20 * rLin + m21 * gLin + m22 * bLin));
  }
  return output;
}

/** WCAG 2.1 상대 휘도 (0 ~ 1). */
export function computeRelativeLuminance(rgb: RgbTuple): number {
  const r = srgbChannelToLinear(rgb[0]);
  const g = srgbChannelToLinear(rgb[1]);
  const b = srgbChannelToLinear(rgb[2]);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 명도 대비비 (1.0 ~ 21.0). */
export function computeWcagContrastRatio(hexA: string, hexB: string): number {
  const lumA = computeRelativeLuminance(parseHexToRgb(hexA));
  const lumB = computeRelativeLuminance(parseHexToRgb(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return round3((lighter + 0.05) / (darker + 0.05));
}

function oklabPerceptualDistance(rgbA: RgbTuple, rgbB: RgbTuple): number {
  const a = rgbToOklch(rgbA);
  const b = rgbToOklch(rgbB);
  const radA = (a.h * Math.PI) / 180;
  const radB = (b.h * Math.PI) / 180;
  const dL = a.l - b.l;
  const da = a.c * Math.cos(radA) - b.c * Math.cos(radB);
  const db = a.c * Math.sin(radA) - b.c * Math.sin(radB);
  return round3(Math.hypot(dL, da, db));
}

export function evaluateColorPairContrast(hexA: string, hexB: string): ColorPairContrastEvaluation {
  const a = normalizeHexInput(hexA);
  const b = normalizeHexInput(hexB);
  const rgbA = parseHexToRgb(a);
  const rgbB = parseHexToRgb(b);
  const oklchA = rgbToOklch(rgbA);
  const oklchB = rgbToOklch(rgbB);
  const wcagRatio = computeWcagContrastRatio(a, b);
  const oklchDeltaL = round3(Math.abs(oklchA.l - oklchB.l));
  const perceptualDeltaOk = oklabPerceptualDistance(rgbA, rgbB);

  return {
    colorA: a,
    colorB: b,
    wcagRatio,
    oklchDeltaL,
    passesAaText: wcagRatio >= 4.5,
    passesAaUi: wcagRatio >= 3.0,
    passesToneSeparation: oklchDeltaL >= 0.1,
    perceptualDeltaOk,
  };
}

/**
 * 스와치 팔레트(예: OKLCH 3-톤)의 원색 명도 대비와 색약 3종 하에서의 변별력 붕괴 여부를 일괄 검증한다.
 */
export function auditPaletteLuminanceContrast(
  rawColors: readonly string[],
  options?: { readonly minDeltaL?: number; readonly minCvdDeltaOk?: number },
): PaletteLuminanceContrastAudit {
  const colors = rawColors.map(normalizeHexInput);
  const minDeltaLThreshold = options?.minDeltaL ?? 0.08;
  const minCvdDeltaOkThreshold = options?.minCvdDeltaOk ?? 0.075;

  const pairs: ColorPairContrastEvaluation[] = [];
  let minWcagRatio = Number.POSITIVE_INFINITY;
  let maxWcagRatio = 1;
  let minOklchDeltaL = Number.POSITIVE_INFINITY;

  for (let i = 0; i < colors.length; i += 1) {
    for (let j = i + 1; j < colors.length; j += 1) {
      const evaluation = evaluateColorPairContrast(colors[i]!, colors[j]!);
      pairs.push(evaluation);
      if (evaluation.wcagRatio < minWcagRatio) minWcagRatio = evaluation.wcagRatio;
      if (evaluation.wcagRatio > maxWcagRatio) maxWcagRatio = evaluation.wcagRatio;
      if (evaluation.oklchDeltaL < minOklchDeltaL) minOklchDeltaL = evaluation.oklchDeltaL;
    }
  }

  if (pairs.length === 0) {
    minWcagRatio = 1;
    minOklchDeltaL = 0;
  }

  const cvdAuditsMap = {} as Record<ColorVisionDeficiencyType, CvdModeContrastAudit>;
  const failedLabels: string[] = [];

  for (const mode of COLOR_VISION_DEFICIENCY_TYPES) {
    const simulated = colors.map((hex) => simulateColorVisionHex(hex, mode));
    let modeMinWcag = Number.POSITIVE_INFINITY;
    let modeMinDeltaL = Number.POSITIVE_INFINITY;
    const collapsedPairIndices: (readonly [number, number])[] = [];

    for (let i = 0; i < simulated.length; i += 1) {
      for (let j = i + 1; j < simulated.length; j += 1) {
        const pair = evaluateColorPairContrast(simulated[i]!, simulated[j]!);
        if (pair.wcagRatio < modeMinWcag) modeMinWcag = pair.wcagRatio;
        if (pair.oklchDeltaL < modeMinDeltaL) modeMinDeltaL = pair.oklchDeltaL;
        if (pair.perceptualDeltaOk < minCvdDeltaOkThreshold && pair.oklchDeltaL < minDeltaLThreshold) {
          collapsedPairIndices.push([i, j]);
        }
      }
    }

    if (simulated.length < 2) {
      modeMinWcag = 1;
      modeMinDeltaL = 0;
    }
    const meta = COLOR_VISION_SOFTPROOF_MODES.find((item) => item.id === mode);
    const labelKo = meta?.shortLabelKo ?? mode;
    const passesDistinguishability = collapsedPairIndices.length === 0;
    if (!passesDistinguishability) {
      failedLabels.push(labelKo);
    }

    cvdAuditsMap[mode] = {
      mode,
      labelKo,
      simulatedColors: simulated,
      minWcagRatio: round3(modeMinWcag),
      minOklchDeltaL: round3(modeMinDeltaL),
      collapsedPairIndices,
      passesDistinguishability,
    };
  }

  const passesValueHierarchy = colors.length < 2 || minOklchDeltaL >= minDeltaLThreshold;
  const passesAllCvdReadability = failedLabels.length === 0;

  let warningKo: string | null = null;
  if (!passesAllCvdReadability) {
    warningKo = `${failedLabels.join("·")} 소프트프루프에서 인접 톤 변별력이 낮아집니다. 명도 차(ΔL)를 더 벌려 주세요.`;
  } else if (!passesValueHierarchy) {
    warningKo = `톤 간 명도 차(최소 ΔL ${round3(minOklchDeltaL)})가 좁습니다. 대비를 높이면 흑백·색약 가독성이 개선됩니다.`;
  }

  return {
    colors,
    minWcagRatio: round3(minWcagRatio),
    maxWcagRatio: round3(maxWcagRatio),
    minOklchDeltaL: round3(minOklchDeltaL),
    passesValueHierarchy,
    pairs,
    cvdAudits: cvdAuditsMap,
    passesAllCvdReadability,
    warningKo,
  };
}
