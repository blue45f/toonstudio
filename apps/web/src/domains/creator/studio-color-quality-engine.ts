/**
 * Studio color-quality specialist.
 *
 * Culori owns CSS Color 4 parsing and perceptual OKLCH ramp interpolation while pure W3C CSS Color 4
 * linear transfer functions, D65 matrices, OKLCH binary-search gamut mapping, and D50 CIEDE2000 own
 * scene-linear conversion and Delta-E. Only plain numbers cross this module boundary.
 */

import {
  converter as createCuloriConverter,
  interpolate as createCuloriInterpolator,
  parse as parseCuloriColor,
  type Color as CuloriColor,
} from "culori";

export type StudioLinearColorSpace =
  | "linear-srgb"
  | "linear-display-p3";

export interface StudioLinearColor {
  readonly space: StudioLinearColorSpace;
  readonly components: readonly [number, number, number, number];
}

export type StudioColorGamutMapping = "none" | "css";

export type StudioColorQualityFailureReason =
  | "invalid-color"
  | "invalid-linear-color"
  | "invalid-step-count"
  | "conversion-failed"
  | "oracle-divergence";

export type StudioColorQualityResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason: StudioColorQualityFailureReason;
      readonly detail: string;
    };

export interface StudioColorConversionReceipt {
  readonly color: StudioLinearColor;
  readonly sourceInTargetGamut: boolean;
  readonly gamutMapping: StudioColorGamutMapping;
  /** Maximum encoded-channel delta between linear-matrix conversion and Culori encoded oracle. */
  readonly oracleMaxEncodedChannelDelta: number;
}

export interface StudioPerceptualRampRequest {
  readonly stops: readonly string[];
  readonly steps: number;
  readonly targetSpace: StudioLinearColorSpace;
  readonly gamutMapping?: StudioColorGamutMapping;
}

const MAX_COLOR_TEXT_LENGTH = 8_192;
const MAX_RAMP_STOPS = 64;
const MAX_RAMP_STEPS = 4_096;
const ORACLE_CHANNEL_TOLERANCE = 2e-5;
const IN_GAMUT_EPSILON = 7.5e-5;
const CSS_GAMUT_JND = 0.02;
const CSS_GAMUT_EPSILON = 1e-4;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const POW_25_7 = 25 ** 7;

const culoriSrgb = createCuloriConverter("rgb");
const culoriP3 = createCuloriConverter("p3");
const culoriLrgb = createCuloriConverter("lrgb");
const culoriXyz65 = createCuloriConverter("xyz65");
const culoriOklab = createCuloriConverter("oklab");
const culoriOklch = createCuloriConverter("oklch");
const culoriLabD50 = createCuloriConverter("lab");

type Vec3 = readonly [number, number, number];

// W3C CSS Color 4 exact rational XYZ-D65 <-> linear RGB matrices.
const P3_LINEAR_TO_XYZ65 = [
  [608311 / 1250200, 189793 / 714400, 198249 / 1000160],
  [35783 / 156275, 247089 / 357200, 198249 / 2500400],
  [0 / 1, 32229 / 714400, 5220557 / 5000800],
] as const;

const XYZ65_TO_P3_LINEAR = [
  [446124 / 178915, -333277 / 357830, -72051 / 178915],
  [-14852 / 17905, 63121 / 35810, 423 / 17905],
  [11844 / 330415, -50337 / 660830, 316169 / 330415],
] as const;

const SRGB_LINEAR_TO_XYZ65 = [
  [506752 / 1228815, 87881 / 245763, 12673 / 70218],
  [87098 / 409605, 175762 / 245763, 12673 / 175545],
  [7918 / 409605, 87881 / 737289, 1001167 / 1053270],
] as const;

const XYZ65_TO_SRGB_LINEAR = [
  [12831 / 3959, -329 / 214, -1974 / 3959],
  [-851781 / 878810, 1648619 / 878810, 36519 / 878810],
  [705 / 12673, -2585 / 12673, 705 / 667],
] as const;

function matMul3(matrix: readonly (readonly [number, number, number])[], vector: Vec3): Vec3 {
  return [
    matrix[0]![0] * vector[0] + matrix[0]![1] * vector[1] + matrix[0]![2] * vector[2],
    matrix[1]![0] * vector[0] + matrix[1]![1] * vector[1] + matrix[1]![2] * vector[2],
    matrix[2]![0] * vector[0] + matrix[2]![1] * vector[1] + matrix[2]![2] * vector[2],
  ];
}

function srgbEncodedToLinear(channel: number): number {
  const sign = channel < 0 ? -1 : 1;
  const abs = Math.abs(channel);
  return abs <= 0.04045 ? channel / 12.92 : sign * ((abs + 0.055) / 1.055) ** 2.4;
}

function srgbLinearToEncoded(channel: number): number {
  const sign = channel < 0 ? -1 : 1;
  const abs = Math.abs(channel);
  return abs > 0.0031308 ? sign * (1.055 * (abs ** (1 / 2.4)) - 0.055) : 12.92 * channel;
}

function encodeLinearVec3(linear: Vec3): Vec3 {
  return [
    srgbLinearToEncoded(linear[0]),
    srgbLinearToEncoded(linear[1]),
    srgbLinearToEncoded(linear[2]),
  ];
}

function decodeEncodedVec3(encoded: Vec3): Vec3 {
  return [
    srgbEncodedToLinear(encoded[0]),
    srgbEncodedToLinear(encoded[1]),
    srgbEncodedToLinear(encoded[2]),
  ];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isVec3InGamut(channels: Vec3, epsilon = IN_GAMUT_EPSILON): boolean {
  return (
    channels[0] >= -epsilon && channels[0] <= 1 + epsilon
    && channels[1] >= -epsilon && channels[1] <= 1 + epsilon
    && channels[2] >= -epsilon && channels[2] <= 1 + epsilon
  );
}

function isFiniteVec3(channels: Vec3): boolean {
  return Number.isFinite(channels[0]) && Number.isFinite(channels[1]) && Number.isFinite(channels[2]);
}

function finiteAlpha(value: number): number | null {
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function isFiniteLinearColor(value: unknown): value is StudioLinearColor {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StudioLinearColor>;
  if (
    candidate.space !== "linear-srgb"
    && candidate.space !== "linear-display-p3"
  ) {
    return false;
  }
  if (!Array.isArray(candidate.components) || candidate.components.length !== 4) {
    return false;
  }
  return (
    candidate.components.slice(0, 3).every(Number.isFinite)
    && finiteAlpha(candidate.components[3]!) !== null
  );
}

function culoriFromLinear(color: StudioLinearColor): CuloriColor {
  const linear: Vec3 = [color.components[0], color.components[1], color.components[2]];
  if (color.space === "linear-srgb") {
    return {
      mode: "lrgb",
      r: linear[0],
      g: linear[1],
      b: linear[2],
      alpha: color.components[3],
    };
  }
  const xyz = matMul3(P3_LINEAR_TO_XYZ65, linear);
  return {
    mode: "xyz65",
    x: xyz[0],
    y: xyz[1],
    z: xyz[2],
    alpha: color.components[3],
  };
}

function culoriToLinearTarget(
  source: CuloriColor,
  targetSpace: StudioLinearColorSpace,
): Vec3 | null {
  if (targetSpace === "linear-srgb") {
    const lrgb = culoriLrgb(source);
    if (!lrgb) return null;
    const result: Vec3 = [lrgb.r, lrgb.g, lrgb.b];
    return isFiniteVec3(result) ? result : null;
  }
  const xyz = culoriXyz65(source);
  if (!xyz) return null;
  const xyzVec: Vec3 = [xyz.x, xyz.y, xyz.z];
  if (!isFiniteVec3(xyzVec)) return null;
  const linear = matMul3(XYZ65_TO_P3_LINEAR, xyzVec);
  return isFiniteVec3(linear) ? linear : null;
}

function encodedCuloriChannels(
  color: CuloriColor | undefined,
  targetSpace: StudioLinearColorSpace,
): Vec3 | null {
  if (!color) return null;
  const converted = targetSpace === "linear-srgb" ? culoriSrgb(color) : culoriP3(color);
  if (!converted) return null;
  const candidate = converted as { r?: number; g?: number; b?: number };
  if (
    !Number.isFinite(candidate.r)
    || !Number.isFinite(candidate.g)
    || !Number.isFinite(candidate.b)
  ) {
    return null;
  }
  return [candidate.r!, candidate.g!, candidate.b!];
}

function maxChannelDelta(left: readonly number[], right: readonly number[]): number {
  let max = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    max = Math.max(max, Math.abs(left[index]! - right[index]!));
  }
  return max;
}

/** W3C CSS Color 4 §13.2 binary-search OKLCH chroma reduction into target encoded gamut. */
function cssGamutMapToEncoded(
  source: CuloriColor,
  targetSpace: StudioLinearColorSpace,
): Vec3 | null {
  const oklch = culoriOklch(source);
  if (!oklch || !Number.isFinite(oklch.l) || !Number.isFinite(oklch.c)) {
    return null;
  }
  if (oklch.l >= 1) return [1, 1, 1];
  if (oklch.l <= 0) return [0, 0, 0];

  const initialLinear = culoriToLinearTarget(source, targetSpace);
  if (!initialLinear) return null;
  const initialEncoded = encodeLinearVec3(initialLinear);
  if (isVec3InGamut(initialEncoded, 0)) {
    return [clamp01(initialEncoded[0]), clamp01(initialEncoded[1]), clamp01(initialEncoded[2])];
  }

  const hue = Number.isFinite(oklch.h) ? oklch.h! : 0;
  let minChroma = 0;
  let maxChroma = Math.max(0, oklch.c);
  let minInGamut = true;
  let bestClipped: Vec3 = [
    clamp01(initialEncoded[0]),
    clamp01(initialEncoded[1]),
    clamp01(initialEncoded[2]),
  ];

  const encodedMode = targetSpace === "linear-srgb" ? "rgb" : "p3";
  while (maxChroma - minChroma > CSS_GAMUT_EPSILON) {
    const chroma = (minChroma + maxChroma) / 2;
    const candidate: CuloriColor = { mode: "oklch", l: oklch.l, c: chroma, h: hue };
    const candidateLinear = culoriToLinearTarget(candidate, targetSpace);
    if (!candidateLinear) return null;
    const candidateEncoded = encodeLinearVec3(candidateLinear);
    if (minInGamut && isVec3InGamut(candidateEncoded, 0)) {
      minChroma = chroma;
      bestClipped = [
        clamp01(candidateEncoded[0]),
        clamp01(candidateEncoded[1]),
        clamp01(candidateEncoded[2]),
      ];
      continue;
    }
    const clipped: Vec3 = [
      clamp01(candidateEncoded[0]),
      clamp01(candidateEncoded[1]),
      clamp01(candidateEncoded[2]),
    ];
    const clippedLab = culoriOklab({
      mode: encodedMode,
      r: clipped[0],
      g: clipped[1],
      b: clipped[2],
    });
    const candidateLab = culoriOklab(candidate);
    if (!clippedLab || !candidateLab) return null;
    const deltaE = Math.hypot(
      clippedLab.l - candidateLab.l,
      clippedLab.a - candidateLab.a,
      clippedLab.b - candidateLab.b,
    );
    if (deltaE < CSS_GAMUT_JND) {
      bestClipped = clipped;
      if (CSS_GAMUT_JND - deltaE < CSS_GAMUT_EPSILON) {
        return clipped;
      }
      minInGamut = false;
      minChroma = chroma;
    } else {
      maxChroma = chroma;
    }
  }
  return bestClipped;
}

function convertCuloriColor(
  source: CuloriColor,
  targetSpace: StudioLinearColorSpace,
  gamutMapping: StudioColorGamutMapping,
  oracleSource: CuloriColor | undefined,
): StudioColorQualityResult<StudioColorConversionReceipt> {
  try {
    const alpha = finiteAlpha(source.alpha ?? 1);
    const unmappedLinear = culoriToLinearTarget(source, targetSpace);
    if (alpha === null || !unmappedLinear) {
      return {
        ok: false,
        reason: "conversion-failed",
        detail: "색 변환 결과가 유한한 선형 RGBA가 아닙니다.",
      };
    }
    const encodedUnmapped = encodeLinearVec3(unmappedLinear);
    const sourceInTargetGamut = isVec3InGamut(encodedUnmapped);
    let encoded: Vec3 = encodedUnmapped;
    let linear: Vec3 = unmappedLinear;

    if (gamutMapping === "css") {
      const mappedEncoded = cssGamutMapToEncoded(source, targetSpace);
      if (!mappedEncoded) {
        return {
          ok: false,
          reason: "conversion-failed",
          detail: "색 공간 변환 또는 gamut mapping에 실패했습니다.",
        };
      }
      encoded = mappedEncoded;
      linear = decodeEncodedVec3(mappedEncoded);
    }

    if (!isFiniteVec3(linear)) {
      return {
        ok: false,
        reason: "conversion-failed",
        detail: "색 변환 결과가 유한한 선형 RGBA가 아닙니다.",
      };
    }

    let oracleMaxEncodedChannelDelta = 0;
    if (gamutMapping === "none" && oracleSource) {
      const oracle = encodedCuloriChannels(oracleSource, targetSpace);
      if (oracle) {
        oracleMaxEncodedChannelDelta = maxChannelDelta(encoded, oracle);
        if (oracleMaxEncodedChannelDelta > ORACLE_CHANNEL_TOLERANCE) {
          return {
            ok: false,
            reason: "oracle-divergence",
            detail:
              `선형 행렬/Culori 변환 차이가 허용치 ${ORACLE_CHANNEL_TOLERANCE}를 넘었습니다(${oracleMaxEncodedChannelDelta}).`,
          };
        }
      }
    }

    return {
      ok: true,
      value: {
        color: {
          space: targetSpace,
          components: [linear[0], linear[1], linear[2], alpha],
        },
        sourceInTargetGamut,
        gamutMapping,
        oracleMaxEncodedChannelDelta,
      },
    };
  } catch {
    return {
      ok: false,
      reason: "conversion-failed",
      detail: "색 공간 변환 또는 gamut mapping에 실패했습니다.",
    };
  }
}

/** Parses any CSS Color 4 string into explicit scene-linear RGBA. */
export function parseStudioColorToLinear(
  input: string,
  targetSpace: StudioLinearColorSpace,
  gamutMapping: StudioColorGamutMapping = "none",
): StudioColorQualityResult<StudioColorConversionReceipt> {
  if (
    typeof input !== "string"
    || input.trim().length === 0
    || input.length > MAX_COLOR_TEXT_LENGTH
  ) {
    return {
      ok: false,
      reason: "invalid-color",
      detail: "색 문자열이 비어 있거나 허용 길이를 넘었습니다.",
    };
  }
  try {
    const parsed = parseCuloriColor(input);
    if (!parsed) {
      return {
        ok: false,
        reason: "invalid-color",
        detail: "지원하지 않거나 잘못된 색 문자열입니다.",
      };
    }
    return convertCuloriColor(parsed, targetSpace, gamutMapping, parsed);
  } catch {
    return {
      ok: false,
      reason: "invalid-color",
      detail: "지원하지 않거나 잘못된 색 문자열입니다.",
    };
  }
}

/** Converts canonical linear data without silently clipping wide-gamut components. */
export function convertStudioLinearColor(
  input: StudioLinearColor,
  targetSpace: StudioLinearColorSpace,
  gamutMapping: StudioColorGamutMapping = "none",
): StudioColorQualityResult<StudioColorConversionReceipt> {
  if (!isFiniteLinearColor(input)) {
    return {
      ok: false,
      reason: "invalid-linear-color",
      detail: "선형 색은 유한한 RGB와 0..1 알파를 가져야 합니다.",
    };
  }
  if (gamutMapping === "none" && input.space === targetSpace) {
    const linear: Vec3 = [input.components[0], input.components[1], input.components[2]];
    return {
      ok: true,
      value: {
        color: {
          space: targetSpace,
          components: [linear[0], linear[1], linear[2], input.components[3]],
        },
        sourceInTargetGamut: isVec3InGamut(encodeLinearVec3(linear)),
        gamutMapping,
        oracleMaxEncodedChannelDelta: 0,
      },
    };
  }
  if (gamutMapping === "none") {
    const linearIn: Vec3 = [input.components[0], input.components[1], input.components[2]];
    const xyz = input.space === "linear-srgb"
      ? matMul3(SRGB_LINEAR_TO_XYZ65, linearIn)
      : matMul3(P3_LINEAR_TO_XYZ65, linearIn);
    const linearOut = targetSpace === "linear-srgb"
      ? matMul3(XYZ65_TO_SRGB_LINEAR, xyz)
      : matMul3(XYZ65_TO_P3_LINEAR, xyz);
    return {
      ok: true,
      value: {
        color: {
          space: targetSpace,
          components: [linearOut[0], linearOut[1], linearOut[2], input.components[3]],
        },
        sourceInTargetGamut: isVec3InGamut(encodeLinearVec3(linearOut)),
        gamutMapping,
        oracleMaxEncodedChannelDelta: 0,
      },
    };
  }
  return convertCuloriColor(culoriFromLinear(input), targetSpace, gamutMapping, undefined);
}

/**
 * Builds an OKLCH perceptual ramp with Culori, then converts every stop to scene-linear RGBA.
 * The endpoints are included exactly and output remains plain scene-linear RGBA.
 */
export function buildStudioPerceptualColorRamp(
  request: StudioPerceptualRampRequest,
): StudioColorQualityResult<readonly StudioLinearColor[]> {
  if (
    !Number.isInteger(request.steps)
    || request.steps < 2
    || request.steps > MAX_RAMP_STEPS
    || request.stops.length < 2
    || request.stops.length > MAX_RAMP_STOPS
  ) {
    return {
      ok: false,
      reason: "invalid-step-count",
      detail: `색상 램프는 2..${MAX_RAMP_STOPS}개 정지점과 2..${MAX_RAMP_STEPS}개 샘플이 필요합니다.`,
    };
  }
  if (
    request.stops.some(
      (stop) => typeof stop !== "string" || stop.length > MAX_COLOR_TEXT_LENGTH,
    )
  ) {
    return {
      ok: false,
      reason: "invalid-color",
      detail: "램프 정지점에 잘못된 색 문자열이 있습니다.",
    };
  }

  try {
    const interpolator = createCuloriInterpolator([...request.stops], "oklch");
    const colors: StudioLinearColor[] = [];
    for (let index = 0; index < request.steps; index += 1) {
      const t = index / (request.steps - 1);
      const interpolated = interpolator(t);
      if (
        !interpolated
        || interpolated.mode !== "oklch"
        || !Number.isFinite(interpolated.l)
        || !Number.isFinite(interpolated.c)
        || (interpolated.h !== undefined && !Number.isFinite(interpolated.h))
      ) {
        return {
          ok: false,
          reason: "conversion-failed",
          detail: `OKLCH 램프 ${index}번 샘플을 만들지 못했습니다.`,
        };
      }
      const color: CuloriColor = {
        mode: "oklch",
        l: interpolated.l,
        c: interpolated.c,
        h: interpolated.h ?? 0,
        alpha: interpolated.alpha ?? 1,
      };
      const converted = convertCuloriColor(
        color,
        request.targetSpace,
        request.gamutMapping ?? "none",
        undefined,
      );
      if (!converted.ok) return converted;
      colors.push(converted.value.color);
    }
    return { ok: true, value: colors };
  } catch {
    return {
      ok: false,
      reason: "invalid-color",
      detail: "램프 정지점 색을 해석하지 못했습니다.",
    };
  }
}

/** Sharma-Wu-Dalal (2005) CIEDE2000 on CIE Lab D50 coordinates (kL = kC = kH = 1). */
function ciede2000FromLab(
  l1: number,
  a1: number,
  b1: number,
  l2: number,
  a2: number,
  b2: number,
): number {
  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar = (c1 + c2) * 0.5;
  const cBar7 = cBar ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + POW_25_7)));
  const a1Prime = (1 + g) * a1;
  const a2Prime = (1 + g) * a2;
  const c1Prime = Math.hypot(a1Prime, b1);
  const c2Prime = Math.hypot(a2Prime, b2);

  const huePrime = (b: number, aPrime: number): number => {
    if (b === 0 && aPrime === 0) return 0;
    const deg = Math.atan2(b, aPrime) * RAD_TO_DEG;
    return deg >= 0 ? deg : deg + 360;
  };
  const h1Prime = huePrime(b1, a1Prime);
  const h2Prime = huePrime(b2, a2Prime);

  const deltaLPrime = l2 - l1;
  const deltaCPrime = c2Prime - c1Prime;
  const cProd = c1Prime * c2Prime;

  let deltahPrime = 0;
  if (cProd !== 0) {
    const diff = h2Prime - h1Prime;
    if (Math.abs(diff) <= 180) deltahPrime = diff;
    else if (diff > 180) deltahPrime = diff - 360;
    else deltahPrime = diff + 360;
  }
  const deltaHPrime = 2 * Math.sqrt(cProd) * Math.sin((deltahPrime * 0.5) * DEG_TO_RAD);

  const lBarPrime = (l1 + l2) * 0.5;
  const cBarPrime = (c1Prime + c2Prime) * 0.5;

  let hBarPrime: number;
  if (cProd === 0) {
    hBarPrime = h1Prime + h2Prime;
  } else if (Math.abs(h1Prime - h2Prime) <= 180) {
    hBarPrime = (h1Prime + h2Prime) * 0.5;
  } else if (h1Prime + h2Prime < 360) {
    hBarPrime = (h1Prime + h2Prime + 360) * 0.5;
  } else {
    hBarPrime = (h1Prime + h2Prime - 360) * 0.5;
  }

  const t =
    1
    - 0.17 * Math.cos((hBarPrime - 30) * DEG_TO_RAD)
    + 0.24 * Math.cos((2 * hBarPrime) * DEG_TO_RAD)
    + 0.32 * Math.cos((3 * hBarPrime + 6) * DEG_TO_RAD)
    - 0.2 * Math.cos((4 * hBarPrime - 63) * DEG_TO_RAD);

  const deltaTheta = 30 * Math.exp(-(((hBarPrime - 275) / 25) ** 2));
  const cBarPrime7 = cBarPrime ** 7;
  const rC = 2 * Math.sqrt(cBarPrime7 / (cBarPrime7 + POW_25_7));
  const lBarMinus50Sq = (lBarPrime - 50) ** 2;
  const sL = 1 + (0.015 * lBarMinus50Sq) / Math.sqrt(20 + lBarMinus50Sq);
  const sC = 1 + 0.045 * cBarPrime;
  const sH = 1 + 0.015 * cBarPrime * t;
  const rT = -Math.sin((2 * deltaTheta) * DEG_TO_RAD) * rC;

  const termL = deltaLPrime / sL;
  const termC = deltaCPrime / sC;
  const termH = deltaHPrime / sH;
  return Math.sqrt(termL * termL + termC * termC + termH * termH + rT * termC * termH);
}

/** Standards-oriented perceptual color difference for palette matching and regression gates. */
export function studioColorDeltaE2000(
  left: StudioLinearColor,
  right: StudioLinearColor,
): StudioColorQualityResult<number> {
  if (!isFiniteLinearColor(left) || !isFiniteLinearColor(right)) {
    return {
      ok: false,
      reason: "invalid-linear-color",
      detail: "Delta-E 입력은 유한한 정규 선형 색이어야 합니다.",
    };
  }
  try {
    const leftLab = culoriLabD50(culoriFromLinear(left));
    const rightLab = culoriLabD50(culoriFromLinear(right));
    if (!leftLab || !rightLab) {
      return {
        ok: false,
        reason: "conversion-failed",
        detail: "Delta-E 계산에 실패했습니다.",
      };
    }
    const delta = ciede2000FromLab(
      leftLab.l,
      leftLab.a,
      leftLab.b,
      rightLab.l,
      rightLab.a,
      rightLab.b,
    );
    return Number.isFinite(delta)
      ? { ok: true, value: delta }
      : {
          ok: false,
          reason: "conversion-failed",
          detail: "Delta-E 결과가 유한하지 않습니다.",
        };
  } catch {
    return {
      ok: false,
      reason: "conversion-failed",
      detail: "Delta-E 계산에 실패했습니다.",
    };
  }
}
