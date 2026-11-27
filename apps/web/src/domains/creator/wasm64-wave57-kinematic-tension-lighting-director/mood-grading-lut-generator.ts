/**
 * Wave 57: 무드 색보정 1D 톤 커브 및 3D OKLCH LUT 생성기·고속 RGBA 적용기.
 *
 * - 1D 톤 커브(`evaluateMoodToneCurve1D`)는 거듭제곱 미드톤 바이어스, 3차 에르미트 S-커브 대비,
 *   3차 필르믹 하이라이트 롤오프, 섀도 리프트를 순수 단조 증가 합성으로 구성해
 *   `0 <= curve[i] < curve[i + 1] <= 1` 단조성과 클리핑 방지를 수학적으로 보장한다.
 * - 3D LUT(`buildMoodColorGradingLut`)는 표준 OKLab/OKLCH 색공간에서 무드별 채도 배율과
 *   키/필 색온도 기반 온냉 시프트를 적용하고, 채도 이분법 색역 매핑으로 sRGB 색역을 안전하게 지킨다.
 * - `applyMoodGradingToRgba`는 3선형 보간(trilinear interpolation)으로 픽셀당 객체 할당 없이
 *   결정론적 색보정을 수행하며 알파 채널을 비트 단위로 보존한다.
 */

import type { SceneLightingMood } from "./creative-cadence-telemetry-analyzer";
import {
  NEUTRAL_DAYLIGHT_KELVIN,
  type DynamicThreePointLightingRig,
} from "./dynamic-three-point-lighting-solver";

/** 기본 3D LUT 격자 크기(`17×17×17` = 4,913 격자점). */
export const DEFAULT_MOOD_LUT_SIZE = 17 as const;
/** 1D 톤 커브 해상도(`256`단계). */
export const TONE_CURVE_1D_LENGTH = 256 as const;

/** 1D 톤 커브 제어 파라미터. */
export interface MoodToneCurveParams {
  /** S-커브 대비(`-0.5..0.85`, `0`=선형 항등). */
  readonly contrast: number;
  /** 섀도 리프트(`0..0.22`, 암부 바닥 들어올림). */
  readonly shadowLift: number;
  /** 하이라이트 롤오프(`0..0.35`, 명부 소프트 숄더 압축). */
  readonly highlightRolloff: number;
  /** 미드톤 노출 바이어스(`-0.25..0.25`, 양수=밝게, 음수=어둡게). */
  readonly midtoneBias: number;
}

/** 3D OKLCH 색보정 파라미터. */
export interface MoodOklchGradeParams {
  /** OKLCH 채도 배율(`0.4..1.5`). */
  readonly chromaScale: number;
  /** 온냉 색온도 시프트(`-0.12..0.12`, 양수=따뜻한 황금빛, 음수=서늘한 청색). */
  readonly temperatureShift: number;
  /** 그린-마젠타 틴트 보정(`-0.06..0.06`). */
  readonly tintShift: number;
  /** 암부 스플릿 토닝 OKLab b축 시프트(`-0.06..0.06`). */
  readonly shadowCoolBias: number;
  /** 명부 스플릿 토닝 OKLab b축 시프트(`-0.06..0.06`). */
  readonly highlightWarmBias: number;
}

/** 무드 LUT 생성 옵션. */
export interface MoodColorGradingLutOptions {
  /** 3D LUT 격자 크기(`5..33`, 기본 `17`). */
  readonly lutSize?: number;
  /** 전체 그레이딩 강도(`0..1`, 기본 `1`). */
  readonly intensity?: number;
  /** 톤 커브 세부 파라미터 덮어쓰기. */
  readonly toneCurveOverrides?: Partial<MoodToneCurveParams>;
  /** OKLCH 색보정 세부 파라미터 덮어쓰기. */
  readonly oklchOverrides?: Partial<MoodOklchGradeParams>;
  /** 접근성 저자극 모드 활성화 시 채도·대비 자극을 자동 완화한다. */
  readonly prefersReducedMotion?: boolean;
}

/** 생성된 1D 톤 커브 + 3D RGB LUT 패키지. */
export interface MoodColorGradingLut {
  readonly mood: SceneLightingMood;
  readonly tensionIndex: number;
  readonly lutSize: number;
  readonly reducedMotionMode: boolean;
  readonly toneCurveParams: MoodToneCurveParams;
  readonly oklchParams: MoodOklchGradeParams;
  /** `256`단계 단조 증가 1D 톤 커브(`[0, 1]`). */
  readonly toneCurve1D: Float32Array;
  /** `lutSize^3 * 3` 크기의 3D LUT(sRGB `[0, 1]`, B-major → G → R 순서). */
  readonly table3D: Float32Array;
}

/** RGBA 버퍼 LUT 적용 옵션. */
export interface ApplyMoodGradingOptions {
  /** 원본 대비 보정 혼합 비율(`0..1`, 기본 `1`). */
  readonly mix?: number;
  /** `true`이면 전달된 `Uint8ClampedArray`를 제자리(in-place)에서 갱신한다(기본 `false`). */
  readonly inPlace?: boolean;
  /** 알파 채널 원본 보존 여부(기본 `true`). */
  readonly preserveAlpha?: boolean;
  /** 완전 투명(`alpha === 0`) 픽셀 보정 생략 여부(기본 `true`). */
  readonly skipTransparentPixels?: boolean;
}

interface MoodGradingPreset {
  readonly tone: MoodToneCurveParams;
  readonly oklch: MoodOklchGradeParams;
}

const MOOD_GRADING_PRESETS: Readonly<Record<SceneLightingMood, MoodGradingPreset>> = {
  "calm-ambient": {
    tone: {
      contrast: 0.12,
      shadowLift: 0.035,
      highlightRolloff: 0.08,
      midtoneBias: 0.02,
    },
    oklch: {
      chromaScale: 0.94,
      temperatureShift: 0.006,
      tintShift: 0,
      shadowCoolBias: -0.008,
      highlightWarmBias: 0.008,
    },
  },
  "warm-intimate": {
    tone: {
      contrast: 0.22,
      shadowLift: 0.045,
      highlightRolloff: 0.14,
      midtoneBias: 0.04,
    },
    oklch: {
      chromaScale: 1.07,
      temperatureShift: 0.032,
      tintShift: 0.008,
      shadowCoolBias: 0.006,
      highlightWarmBias: 0.022,
    },
  },
  "dramatic-duel": {
    tone: {
      contrast: 0.56,
      shadowLift: 0.015,
      highlightRolloff: 0.18,
      midtoneBias: -0.03,
    },
    oklch: {
      chromaScale: 1.13,
      temperatureShift: -0.006,
      tintShift: 0.004,
      shadowCoolBias: -0.024,
      highlightWarmBias: 0.018,
    },
  },
  "noir-suspense": {
    tone: {
      contrast: 0.64,
      shadowLift: 0.028,
      highlightRolloff: 0.22,
      midtoneBias: -0.09,
    },
    oklch: {
      chromaScale: 0.72,
      temperatureShift: -0.034,
      tintShift: -0.006,
      shadowCoolBias: -0.028,
      highlightWarmBias: -0.008,
    },
  },
  "radiant-climax": {
    tone: {
      contrast: 0.44,
      shadowLift: 0.025,
      highlightRolloff: 0.16,
      midtoneBias: 0.08,
    },
    oklch: {
      chromaScale: 1.2,
      temperatureShift: 0.026,
      tintShift: 0.006,
      shadowCoolBias: -0.008,
      highlightWarmBias: 0.028,
    },
  },
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function safeFinite(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function srgbToLinear01(srgb01: number): number {
  const v = clamp(srgb01, 0, 1);
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb01(linear01: number): number {
  const v = clamp(linear01, 0, 1);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

function linearSrgbToOklab(
  r: number,
  g: number,
  b: number,
): { readonly L: number; readonly a: number; readonly b: number } {
  const lLin = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const mLin = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const sLin = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lCube = Math.cbrt(Math.max(0, lLin));
  const mCube = Math.cbrt(Math.max(0, mLin));
  const sCube = Math.cbrt(Math.max(0, sLin));

  return {
    L: 0.2104542553 * lCube + 0.793617785 * mCube - 0.0040720468 * sCube,
    a: 1.9779984951 * lCube - 2.428592205 * mCube + 0.4505937099 * sCube,
    b: 0.0259040371 * lCube + 0.7827717662 * mCube - 0.808675766 * sCube,
  };
}

function oklabToLinearSrgb(
  L: number,
  a: number,
  b: number,
): { readonly r: number; readonly g: number; readonly b: number } {
  const lCube = L + 0.3963377774 * a + 0.2158037573 * b;
  const mCube = L - 0.1055613458 * a - 0.0638541728 * b;
  const sCube = L - 0.0894841775 * a - 1.291485548 * b;

  const l = lCube * lCube * lCube;
  const m = mCube * mCube * mCube;
  const s = sCube * sCube * sCube;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function isInUnitLinearGamut(rgb: {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}): boolean {
  return (
    rgb.r >= -1e-6 &&
    rgb.r <= 1 + 1e-6 &&
    rgb.g >= -1e-6 &&
    rgb.g <= 1 + 1e-6 &&
    rgb.b >= -1e-6 &&
    rgb.b <= 1 + 1e-6
  );
}

/**
 * OKLab 색상이 sRGB 색역 밖일 때 명도(L)와 색상각을 유지하면서 채도만 이분법으로 부드럽게 압축한다.
 */
function gamutMapOklabToLinearSrgb(
  L: number,
  a: number,
  b: number,
): { readonly r: number; readonly g: number; readonly b: number } {
  const clampedL = clamp(L, 0, 1);
  const direct = oklabToLinearSrgb(clampedL, a, b);
  if (isInUnitLinearGamut(direct)) {
    return {
      r: clamp(direct.r, 0, 1),
      g: clamp(direct.g, 0, 1),
      b: clamp(direct.b, 0, 1),
    };
  }

  let low = 0;
  let high = 1;
  for (let iter = 0; iter < 12; iter += 1) {
    const mid = 0.5 * (low + high);
    const probe = oklabToLinearSrgb(clampedL, a * mid, b * mid);
    if (isInUnitLinearGamut(probe)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  const safe = oklabToLinearSrgb(clampedL, a * low, b * low);
  return {
    r: clamp(safe.r, 0, 1),
    g: clamp(safe.g, 0, 1),
    b: clamp(safe.b, 0, 1),
  };
}

/**
 * 단일 정규화 입력(`0..1`)에 대해 엄격히 단조 증가하는 1D 톤 커브 값을 계산한다.
 *
 * - 미드톤 거듭제곱, 3차 에르미트 S-커브 대비, 3차 하이라이트 롤오프, 섀도 리프트 모두
 *   도함수가 전 구간에서 엄격히 양수(`> 0`)이므로 역전·평탄 클리핑 없이 `[0, 1]`을 보존한다.
 */
export function evaluateMoodToneCurve1D(
  x01: number,
  params: MoodToneCurveParams,
): number {
  const x = clamp(x01, 0, 1);
  const contrast = clamp(safeFinite(params.contrast, 0), -0.5, 0.85);
  const shadowLift = clamp(safeFinite(params.shadowLift, 0), 0, 0.22);
  const highlightRolloff = clamp(safeFinite(params.highlightRolloff, 0), 0, 0.35);
  const midtoneBias = clamp(safeFinite(params.midtoneBias, 0), -0.25, 0.25);

  const gamma = 2 ** (-midtoneBias * 1.15);
  const x1 = x === 0 ? 0 : x === 1 ? 1 : x ** gamma;

  const smoothstep = x1 * x1 * (3 - 2 * x1);
  const x2 =
    contrast >= 0
      ? (1 - contrast) * x1 + contrast * smoothstep
      : x1 + -contrast * (x1 - smoothstep);

  const x3 = x2 - 0.25 * highlightRolloff * x2 * x2 * x2;
  const x4 = shadowLift + (1 - shadowLift) * x3;
  return clamp(x4, 0, 1);
}

/** 256단계 1D 톤 커브 LUT(`Float32Array`)를 생성한다. */
export function buildToneCurve1DTable(params: MoodToneCurveParams): Float32Array {
  const curve = new Float32Array(TONE_CURVE_1D_LENGTH);
  const denom = TONE_CURVE_1D_LENGTH - 1;
  for (let i = 0; i < TONE_CURVE_1D_LENGTH; i += 1) {
    curve[i] = evaluateMoodToneCurve1D(i / denom, params);
  }
  return curve;
}

function resolveGradingParameters(
  rig: DynamicThreePointLightingRig,
  options: MoodColorGradingLutOptions,
): {
  readonly toneCurveParams: MoodToneCurveParams;
  readonly oklchParams: MoodOklchGradeParams;
  readonly reducedMotionMode: boolean;
} {
  const preset = MOOD_GRADING_PRESETS[rig.mood];
  const intensity = clamp(safeFinite(options.intensity, 1), 0, 1);
  const reducedMotionMode = Boolean(options.prefersReducedMotion ?? rig.reducedMotionMode);
  const motionAttenuation = reducedMotionMode ? 0.55 : 1;
  const tensionBoost = 0.72 + 0.42 * clamp(rig.tensionIndex, 0, 1);
  const effectiveScale = intensity * motionAttenuation;

  // 조명 리깅의 실제 키/필 색온도를 OKLab 온냉 시프트에 물리적으로 연동한다.
  const keyWarmthNorm = clamp((NEUTRAL_DAYLIGHT_KELVIN - rig.key.kelvin) / 4_500, -1, 1);
  const fillWarmthNorm = clamp((NEUTRAL_DAYLIGHT_KELVIN - rig.fill.kelvin) / 4_500, -1, 1);

  const toneOverrides = options.toneCurveOverrides ?? {};
  const toneCurveParams: MoodToneCurveParams = {
    contrast: clamp(
      safeFinite(toneOverrides.contrast, preset.tone.contrast * tensionBoost) * effectiveScale,
      -0.5,
      0.85,
    ),
    shadowLift: clamp(
      safeFinite(toneOverrides.shadowLift, preset.tone.shadowLift) * effectiveScale,
      0,
      0.22,
    ),
    highlightRolloff: clamp(
      safeFinite(toneOverrides.highlightRolloff, preset.tone.highlightRolloff) * effectiveScale,
      0,
      0.35,
    ),
    midtoneBias: clamp(
      safeFinite(toneOverrides.midtoneBias, preset.tone.midtoneBias) * effectiveScale,
      -0.25,
      0.25,
    ),
  };

  const oklchOverrides = options.oklchOverrides ?? {};
  const baseChromaDelta =
    (safeFinite(oklchOverrides.chromaScale, preset.oklch.chromaScale) - 1) * effectiveScale;
  const rawTempShift =
    safeFinite(
      oklchOverrides.temperatureShift,
      preset.oklch.temperatureShift * 0.65 + keyWarmthNorm * 0.024,
    ) * effectiveScale;
  const rawShadowBias =
    safeFinite(
      oklchOverrides.shadowCoolBias,
      preset.oklch.shadowCoolBias * 0.65 + fillWarmthNorm * 0.014,
    ) * effectiveScale;
  const rawHighlightBias =
    safeFinite(
      oklchOverrides.highlightWarmBias,
      preset.oklch.highlightWarmBias * 0.65 + keyWarmthNorm * 0.014,
    ) * effectiveScale;

  const oklchParams: MoodOklchGradeParams = {
    chromaScale: clamp(1 + baseChromaDelta, 0.4, 1.5),
    temperatureShift: clamp(rawTempShift, -0.12, 0.12),
    tintShift: clamp(
      safeFinite(oklchOverrides.tintShift, preset.oklch.tintShift) * effectiveScale,
      -0.06,
      0.06,
    ),
    shadowCoolBias: clamp(rawShadowBias, -0.06, 0.06),
    highlightWarmBias: clamp(rawHighlightBias, -0.06, 0.06),
  };

  return { toneCurveParams, oklchParams, reducedMotionMode };
}

/**
 * 동적 3점 조명 리깅과 무드에 대응하는 1D 톤 커브 및 3D OKLCH 색보정 LUT를 생성한다.
 */
export function buildMoodColorGradingLut(
  rig: DynamicThreePointLightingRig,
  options: MoodColorGradingLutOptions = {},
): MoodColorGradingLut {
  const lutSize = Math.round(clamp(safeFinite(options.lutSize, DEFAULT_MOOD_LUT_SIZE), 5, 33));
  const { toneCurveParams, oklchParams, reducedMotionMode } = resolveGradingParameters(
    rig,
    options,
  );
  const toneCurve1D = buildToneCurve1DTable(toneCurveParams);
  const table3D = new Float32Array(lutSize * lutSize * lutSize * 3);
  const maxIndex = lutSize - 1;

  let offset = 0;
  for (let bi = 0; bi < lutSize; bi += 1) {
    const bIn = bi / maxIndex;
    const bTone = evaluateMoodToneCurve1D(bIn, toneCurveParams);
    const bLin = srgbToLinear01(bTone);

    for (let gi = 0; gi < lutSize; gi += 1) {
      const gIn = gi / maxIndex;
      const gTone = evaluateMoodToneCurve1D(gIn, toneCurveParams);
      const gLin = srgbToLinear01(gTone);

      for (let ri = 0; ri < lutSize; ri += 1) {
        const rIn = ri / maxIndex;
        const rTone = evaluateMoodToneCurve1D(rIn, toneCurveParams);
        const rLin = srgbToLinear01(rTone);

        const lab = linearSrgbToOklab(rLin, gLin, bLin);
        const chroma = Math.hypot(lab.a, lab.b);
        const hueRad = chroma > 1e-7 ? Math.atan2(lab.b, lab.a) : 0;

        // 명부 극단에서 채도가 부자연스럽게 번지지 않도록 부드러운 롤오프 가중을 둔다.
        const highlightDesat = 1 - 0.3 * Math.max(0, (lab.L - 0.8) / 0.2);
        const scaledChroma = chroma * oklchParams.chromaScale * highlightDesat;

        // 중간 톤에 가장 자연스럽게 반응하는 온냉·스플릿 토닝 엔벨로프.
        const midEnvelope = 4 * lab.L * (1 - lab.L);
        const shadowWeight = (1 - lab.L) * (1 - lab.L) * (1 - Math.exp(-lab.L * 9));
        const highlightWeight = lab.L * lab.L * (1 - Math.exp(-(1 - lab.L) * 9));

        const nextA =
          scaledChroma * Math.cos(hueRad) +
          (oklchParams.tintShift + oklchParams.temperatureShift * 0.22) * midEnvelope;
        const nextB =
          scaledChroma * Math.sin(hueRad) +
          oklchParams.temperatureShift * midEnvelope +
          oklchParams.shadowCoolBias * shadowWeight +
          oklchParams.highlightWarmBias * highlightWeight;

        const mappedLinear = gamutMapOklabToLinearSrgb(lab.L, nextA, nextB);
        table3D[offset] = linearToSrgb01(mappedLinear.r);
        table3D[offset + 1] = linearToSrgb01(mappedLinear.g);
        table3D[offset + 2] = linearToSrgb01(mappedLinear.b);
        offset += 3;
      }
    }
  }

  return {
    mood: rig.mood,
    tensionIndex: rig.tensionIndex,
    lutSize,
    reducedMotionMode,
    toneCurveParams,
    oklchParams,
    toneCurve1D,
    table3D,
  };
}

/**
 * 3D LUT를 3선형 보간으로 RGBA 8비트 픽셀 버퍼에 고속·결정론적으로 적용한다.
 */
export function applyMoodGradingToRgba(
  rgba: Uint8ClampedArray,
  lut: MoodColorGradingLut,
  options: ApplyMoodGradingOptions = {},
): Uint8ClampedArray {
  if (rgba.length % 4 !== 0) {
    throw new RangeError(
      `RGBA buffer length must be a multiple of 4 (received ${rgba.length}).`,
    );
  }

  const mix = clamp(safeFinite(options.mix, 1), 0, 1);
  const inPlace = Boolean(options.inPlace);
  const preserveAlpha = options.preserveAlpha ?? true;
  const skipTransparentPixels = options.skipTransparentPixels ?? true;
  const output = inPlace ? rgba : new Uint8ClampedArray(rgba);

  if (mix <= 0 || rgba.length === 0) {
    return output;
  }

  const n = lut.lutSize;
  const table = lut.table3D;
  const expectedLength = n * n * n * 3;
  if (n < 2 || table.length < expectedLength) {
    throw new RangeError(
      `Invalid 3D LUT table length ${table.length} for grid size ${n}.`,
    );
  }

  const scale = (n - 1) / 255;
  const maxIdx = n - 1;
  const rowStride = n * 3;
  const sliceStride = n * rowStride;
  const invMix = 1 - mix;

  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] ?? 255;
    if (skipTransparentPixels && a === 0) {
      if (!preserveAlpha) {
        output[i + 3] = 255;
      }
      continue;
    }

    const rByte = rgba[i] ?? 0;
    const gByte = rgba[i + 1] ?? 0;
    const bByte = rgba[i + 2] ?? 0;

    const rPos = rByte * scale;
    const gPos = gByte * scale;
    const bPos = bByte * scale;

    const r0 = Math.floor(rPos);
    const g0 = Math.floor(gPos);
    const b0 = Math.floor(bPos);
    const r1 = r0 < maxIdx ? r0 + 1 : maxIdx;
    const g1 = g0 < maxIdx ? g0 + 1 : maxIdx;
    const b1 = b0 < maxIdx ? b0 + 1 : maxIdx;

    const fr = rPos - r0;
    const fg = gPos - g0;
    const fb = bPos - b0;
    const ifr = 1 - fr;
    const ifg = 1 - fg;
    const ifb = 1 - fb;

    const c000 = b0 * sliceStride + g0 * rowStride + r0 * 3;
    const c100 = b0 * sliceStride + g0 * rowStride + r1 * 3;
    const c010 = b0 * sliceStride + g1 * rowStride + r0 * 3;
    const c110 = b0 * sliceStride + g1 * rowStride + r1 * 3;
    const c001 = b1 * sliceStride + g0 * rowStride + r0 * 3;
    const c101 = b1 * sliceStride + g0 * rowStride + r1 * 3;
    const c011 = b1 * sliceStride + g1 * rowStride + r0 * 3;
    const c111 = b1 * sliceStride + g1 * rowStride + r1 * 3;

    const w000 = ifr * ifg * ifb;
    const w100 = fr * ifg * ifb;
    const w010 = ifr * fg * ifb;
    const w110 = fr * fg * ifb;
    const w001 = ifr * ifg * fb;
    const w101 = fr * ifg * fb;
    const w011 = ifr * fg * fb;
    const w111 = fr * fg * fb;

    const gradedR =
      ((table[c000] ?? 0) * w000 +
        (table[c100] ?? 0) * w100 +
        (table[c010] ?? 0) * w010 +
        (table[c110] ?? 0) * w110 +
        (table[c001] ?? 0) * w001 +
        (table[c101] ?? 0) * w101 +
        (table[c011] ?? 0) * w011 +
        (table[c111] ?? 0) * w111) *
      255;

    const gradedG =
      ((table[c000 + 1] ?? 0) * w000 +
        (table[c100 + 1] ?? 0) * w100 +
        (table[c010 + 1] ?? 0) * w010 +
        (table[c110 + 1] ?? 0) * w110 +
        (table[c001 + 1] ?? 0) * w001 +
        (table[c101 + 1] ?? 0) * w101 +
        (table[c011 + 1] ?? 0) * w011 +
        (table[c111 + 1] ?? 0) * w111) *
      255;

    const gradedB =
      ((table[c000 + 2] ?? 0) * w000 +
        (table[c100 + 2] ?? 0) * w100 +
        (table[c010 + 2] ?? 0) * w010 +
        (table[c110 + 2] ?? 0) * w110 +
        (table[c001 + 2] ?? 0) * w001 +
        (table[c101 + 2] ?? 0) * w101 +
        (table[c011 + 2] ?? 0) * w011 +
        (table[c111 + 2] ?? 0) * w111) *
      255;

    output[i] = Math.round(rByte * invMix + gradedR * mix);
    output[i + 1] = Math.round(gByte * invMix + gradedG * mix);
    output[i + 2] = Math.round(bByte * invMix + gradedB * mix);
    output[i + 3] = preserveAlpha ? a : 255;
  }

  return output;
}
