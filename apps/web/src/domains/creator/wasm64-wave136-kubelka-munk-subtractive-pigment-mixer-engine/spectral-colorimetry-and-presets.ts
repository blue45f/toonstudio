/**
 * Wave 136 — 10-밴드(410~680nm) CIE 1931 D65 분광 색채학, OKLCH 변환, 화방 안료 8종 프리셋 및
 * 최소 곡률 sRGB → 스펙트럼 업샘플링 커널.
 */

export const SPECTRAL_BAND_COUNT = 10;

/** 400nm~700nm 가시광선을 30nm 등간격으로 분할한 10개 중심 파장(nm). */
export const SPECTRAL_WAVELENGTHS_NM: readonly number[] = [
  410, 440, 470, 500, 530, 560, 590, 620, 650, 680,
];

export const MIN_PHYSICAL_REFLECTANCE = 0.0005;
export const MAX_PHYSICAL_REFLECTANCE = 0.9995;

export type SpectralTuple10 = readonly [
  number, number, number, number, number, number, number, number, number, number,
];

export type RgbTuple = readonly [number, number, number];

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export type StudioPigmentId =
  | "ultramarine-blue"
  | "cadmium-yellow"
  | "quinacridone-magenta"
  | "burnt-sienna"
  | "phthalo-cyan"
  | "titanium-white"
  | "carbon-black"
  | "vermilion-red";

export interface StudioPigmentPreset {
  readonly id: StudioPigmentId;
  readonly nameKo: string;
  readonly colorIndexCode: string;
  readonly opacityClass: "transparent" | "semi-transparent" | "semi-opaque" | "opaque";
  readonly reflectance: SpectralTuple10;
  readonly scatteringS: SpectralTuple10;
  readonly tintingStrength: number;
  readonly granulation: number;
}

export interface SpectralLiftingResult {
  readonly targetSrgb: RgbTuple;
  readonly reflectance: SpectralTuple10;
  readonly reprojectedSrgb: RgbTuple;
  readonly maxChannelError: number;
  readonly rmsChannelError: number;
  readonly oklchDeltaE: number;
  readonly roughnessScore: number;
  readonly iterations: number;
}

const D65_WHITE_X = 0.95047;
const D65_WHITE_Y = 1.0;
const D65_WHITE_Z = 1.08883;

const RAW_CIE_X_D65: SpectralTuple10 = [
  0.0435 * 91.49, 0.3483 * 104.86, 0.1954 * 114.86, 0.0049 * 109.35, 0.1655 * 107.69,
  0.5945 * 100.0, 1.0263 * 88.69, 0.8544 * 87.7, 0.2835 * 80.03, 0.0468 * 78.28,
];

const RAW_CIE_Y_D65: SpectralTuple10 = [
  0.0012 * 91.49, 0.023 * 104.86, 0.091 * 114.86, 0.323 * 109.35, 0.862 * 107.69,
  0.995 * 100.0, 0.757 * 88.69, 0.381 * 87.7, 0.107 * 80.03, 0.017 * 78.28,
];

const RAW_CIE_Z_D65: SpectralTuple10 = [
  0.2074 * 91.49, 1.7471 * 104.86, 1.2876 * 114.86, 0.272 * 109.35, 0.0422 * 107.69,
  0.0039 * 100.0, 0.0011 * 88.69, 0.0002 * 87.7, 0.0 * 80.03, 0.0 * 78.28,
];

export function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function toTuple10(values: readonly number[]): SpectralTuple10 {
  return [
    values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 0, values[4] ?? 0,
    values[5] ?? 0, values[6] ?? 0, values[7] ?? 0, values[8] ?? 0, values[9] ?? 0,
  ];
}

function normalizeWeights(raw: SpectralTuple10, targetSum: number): SpectralTuple10 {
  let sum = 0;
  for (let i = 0; i < SPECTRAL_BAND_COUNT; i += 1) sum += raw[i];
  const scale = sum > 0 ? targetSum / sum : 0;
  return toTuple10(raw.map((v) => v * scale));
}

/** 평탄 반사율 R(λ)=1이 정확한 D65 백색점(0.95047, 1.0, 1.08883)에 사상되는 10-밴드 적분 가중치. */
export const SPECTRAL_TO_XYZ_WEIGHTS: {
  readonly x: SpectralTuple10;
  readonly y: SpectralTuple10;
  readonly z: SpectralTuple10;
} = {
  x: normalizeWeights(RAW_CIE_X_D65, D65_WHITE_X),
  y: normalizeWeights(RAW_CIE_Y_D65, D65_WHITE_Y),
  z: normalizeWeights(RAW_CIE_Z_D65, D65_WHITE_Z),
};

const SPECTRAL_TO_LINEAR_RGB_ROWS: readonly [SpectralTuple10, SpectralTuple10, SpectralTuple10] = (
  (): readonly [SpectralTuple10, SpectralTuple10, SpectralTuple10] => {
    const rRow: number[] = [];
    const gRow: number[] = [];
    const bRow: number[] = [];
    for (let i = 0; i < SPECTRAL_BAND_COUNT; i += 1) {
      const wx = SPECTRAL_TO_XYZ_WEIGHTS.x[i];
      const wy = SPECTRAL_TO_XYZ_WEIGHTS.y[i];
      const wz = SPECTRAL_TO_XYZ_WEIGHTS.z[i];
      rRow.push(3.2404542 * wx - 1.5371385 * wy - 0.4985314 * wz);
      gRow.push(-0.969266 * wx + 1.8760108 * wy + 0.041556 * wz);
      bRow.push(0.0556434 * wx - 0.2040259 * wy + 1.0572252 * wz);
    }
    return [toTuple10(rRow), toTuple10(gRow), toTuple10(bRow)];
  }
)();

/**
 * 실제 화방 분광 반사율 특성을 반영한 8종 핵심 안료 프리셋.
 * 울트라마린 블루(PB29) + 카드뮴 옐로(PY35) 50:50 감산 혼색 시 500~560nm 녹색 투과창이 살아남는다.
 */
export const STUDIO_PIGMENT_PRESETS: Readonly<Record<StudioPigmentId, StudioPigmentPreset>> = {
  "ultramarine-blue": {
    id: "ultramarine-blue",
    nameKo: "울트라마린 블루",
    colorIndexCode: "PB29",
    opacityClass: "transparent",
    reflectance: [0.46, 0.72, 0.64, 0.34, 0.16, 0.042, 0.018, 0.016, 0.028, 0.085],
    scatteringS: [0.64, 0.72, 0.68, 0.60, 0.54, 0.48, 0.44, 0.44, 0.46, 0.50],
    tintingStrength: 0.92,
    granulation: 0.78,
  },
  "cadmium-yellow": {
    id: "cadmium-yellow",
    nameKo: "카드뮴 옐로",
    colorIndexCode: "PY35",
    opacityClass: "opaque",
    reflectance: [0.022, 0.028, 0.055, 0.32, 0.84, 0.92, 0.94, 0.94, 0.93, 0.92],
    scatteringS: [0.62, 0.68, 0.82, 1.15, 1.32, 1.38, 1.36, 1.32, 1.28, 1.24],
    tintingStrength: 1.05,
    granulation: 0.18,
  },
  "quinacridone-magenta": {
    id: "quinacridone-magenta",
    nameKo: "퀴나크리돈 마젠타",
    colorIndexCode: "PR122",
    opacityClass: "transparent",
    reflectance: [0.34, 0.42, 0.24, 0.055, 0.024, 0.032, 0.18, 0.68, 0.82, 0.84],
    scatteringS: [0.55, 0.58, 0.52, 0.45, 0.42, 0.44, 0.52, 0.66, 0.70, 0.70],
    tintingStrength: 1.15,
    granulation: 0.12,
  },
  "burnt-sienna": {
    id: "burnt-sienna",
    nameKo: "번트 시에나",
    colorIndexCode: "PBr7",
    opacityClass: "semi-transparent",
    reflectance: [0.032, 0.038, 0.048, 0.068, 0.11, 0.20, 0.36, 0.48, 0.54, 0.56],
    scatteringS: [0.58, 0.62, 0.66, 0.72, 0.78, 0.86, 0.94, 0.98, 0.98, 0.96],
    tintingStrength: 0.96,
    granulation: 0.64,
  },
  "phthalo-cyan": {
    id: "phthalo-cyan",
    nameKo: "프탈로 시안",
    colorIndexCode: "PB15:3",
    opacityClass: "transparent",
    reflectance: [0.18, 0.46, 0.66, 0.62, 0.32, 0.08, 0.022, 0.015, 0.016, 0.025],
    scatteringS: [0.50, 0.56, 0.62, 0.60, 0.52, 0.46, 0.42, 0.40, 0.40, 0.42],
    tintingStrength: 1.35,
    granulation: 0.08,
  },
  "titanium-white": {
    id: "titanium-white",
    nameKo: "티타늄 화이트",
    colorIndexCode: "PW6",
    opacityClass: "opaque",
    reflectance: [0.91, 0.945, 0.955, 0.96, 0.962, 0.962, 0.96, 0.958, 0.955, 0.952],
    scatteringS: [2.2, 2.35, 2.4, 2.42, 2.4, 2.36, 2.32, 2.28, 2.24, 2.2],
    tintingStrength: 1.4,
    granulation: 0.05,
  },
  "carbon-black": {
    id: "carbon-black",
    nameKo: "카본 블랙",
    colorIndexCode: "PBk7",
    opacityClass: "opaque",
    reflectance: [0.011, 0.011, 0.010, 0.010, 0.010, 0.010, 0.010, 0.011, 0.011, 0.012],
    scatteringS: [0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42],
    tintingStrength: 1.65,
    granulation: 0.35,
  },
  "vermilion-red": {
    id: "vermilion-red",
    nameKo: "버밀리온 레드",
    colorIndexCode: "PR108",
    opacityClass: "opaque",
    reflectance: [0.028, 0.032, 0.036, 0.042, 0.062, 0.14, 0.56, 0.84, 0.88, 0.88],
    scatteringS: [0.64, 0.68, 0.72, 0.78, 0.86, 1.05, 1.32, 1.42, 1.4, 1.36],
    tintingStrength: 1.08,
    granulation: 0.22,
  },
};

export const STUDIO_PIGMENT_IDS: readonly StudioPigmentId[] = [
  "ultramarine-blue",
  "cadmium-yellow",
  "quinacridone-magenta",
  "burnt-sienna",
  "phthalo-cyan",
  "titanium-white",
  "carbon-black",
  "vermilion-red",
];

export function getStudioPigmentPreset(id: StudioPigmentId): StudioPigmentPreset {
  return STUDIO_PIGMENT_PRESETS[id];
}

export function srgbChannelToLinear(channel: number): number {
  const c = clampFinite(channel, 0, 1);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearChannelToSrgb(channel: number): number {
  const c = clampFinite(channel, 0, 1);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function srgbToLinearRgb(srgb: RgbTuple): RgbTuple {
  return [srgbChannelToLinear(srgb[0]), srgbChannelToLinear(srgb[1]), srgbChannelToLinear(srgb[2])];
}

export function linearRgbToSrgb(linearRgb: RgbTuple): RgbTuple {
  return [
    linearChannelToSrgb(linearRgb[0]),
    linearChannelToSrgb(linearRgb[1]),
    linearChannelToSrgb(linearRgb[2]),
  ];
}

export function spectralReflectanceToXyz(reflectance: SpectralTuple10): RgbTuple {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let i = 0; i < SPECTRAL_BAND_COUNT; i += 1) {
    const r = clampFinite(reflectance[i], 0, 1);
    x += r * SPECTRAL_TO_XYZ_WEIGHTS.x[i];
    y += r * SPECTRAL_TO_XYZ_WEIGHTS.y[i];
    z += r * SPECTRAL_TO_XYZ_WEIGHTS.z[i];
  }
  return [x, y, z];
}

export function xyzToLinearRgb(xyz: RgbTuple): RgbTuple {
  const [x, y, z] = xyz;
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return [clampFinite(r, 0, 1), clampFinite(g, 0, 1), clampFinite(b, 0, 1)];
}

export function spectralReflectanceToLinearRgb(reflectance: SpectralTuple10): RgbTuple {
  return xyzToLinearRgb(spectralReflectanceToXyz(reflectance));
}

export function spectralReflectanceToSrgb(reflectance: SpectralTuple10): RgbTuple {
  return linearRgbToSrgb(spectralReflectanceToLinearRgb(reflectance));
}

/** Björn Ottosson OKLab 변환으로 선형 sRGB를 지각 균등 OKLCH(L: 0..1, C: 0..0.4, H: 0..360)로 계산한다. */
export function linearRgbToOklch(linearRgb: RgbTuple): OklchColor {
  const r = clampFinite(linearRgb[0], 0, 1);
  const g = clampFinite(linearRgb[1], 0, 1);
  const b = clampFinite(linearRgb[2], 0, 1);
  const lCube = Math.cbrt(Math.max(0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b));
  const mCube = Math.cbrt(Math.max(0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b));
  const sCube = Math.cbrt(Math.max(0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b));

  const lVal = 0.2104542553 * lCube + 0.793617785 * mCube - 0.0040720468 * sCube;
  const aVal = 1.9779984951 * lCube - 2.428592205 * mCube + 0.4505937099 * sCube;
  const bVal = 0.0259040371 * lCube + 0.7827717662 * mCube - 0.808675766 * sCube;

  const chroma = Math.sqrt(aVal * aVal + bVal * bVal);
  let hue = chroma < 1e-6 ? 0 : (Math.atan2(bVal, aVal) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return {
    l: clampFinite(lVal, 0, 1),
    c: clampFinite(chroma, 0, 0.5),
    h: clampFinite(hue, 0, 360),
  };
}

export function srgbToOklch(srgb: RgbTuple): OklchColor {
  return linearRgbToOklch(srgbToLinearRgb(srgb));
}

export function spectralReflectanceToOklch(reflectance: SpectralTuple10): OklchColor {
  return linearRgbToOklch(spectralReflectanceToLinearRgb(reflectance));
}

export function formatOklchCss(oklch: OklchColor, alpha?: number): string {
  const lStr = clampFinite(oklch.l, 0, 1).toFixed(4);
  const cStr = clampFinite(oklch.c, 0, 0.45).toFixed(4);
  const hStr = clampFinite(oklch.h, 0, 360).toFixed(2);
  if (alpha !== undefined) {
    return `oklch(${lStr} ${cStr} ${hStr} / ${clampFinite(alpha, 0, 1).toFixed(3)})`;
  }
  return `oklch(${lStr} ${cStr} ${hStr})`;
}

export function computeOklchDeltaE(a: OklchColor, b: OklchColor): number {
  const radA = (a.h * Math.PI) / 180;
  const radB = (b.h * Math.PI) / 180;
  const dL = a.l - b.l;
  const dA = a.c * Math.cos(radA) - b.c * Math.cos(radB);
  const dB = a.c * Math.sin(radA) - b.c * Math.sin(radB);
  return Math.sqrt(dL * dL + dA * dA + dB * dB);
}

export function circularHueDiffDeg(h1: number, h2: number): number {
  return clampFinite(Math.abs(((h1 - h2 + 540) % 360) - 180), 0, 180);
}

function solveLinearSystem(matrix: readonly (readonly number[])[], rhs: readonly number[]): number[] {
  const n = rhs.length;
  const aug: number[][] = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivotRow = col;
    let pivotAbs = Math.abs(aug[col][col]);
    for (let r = col + 1; r < n; r += 1) {
      const candidate = Math.abs(aug[r][col]);
      if (candidate > pivotAbs) {
        pivotAbs = candidate;
        pivotRow = r;
      }
    }
    if (pivotRow !== col) {
      const tmp = aug[col];
      aug[col] = aug[pivotRow];
      aug[pivotRow] = tmp;
    }
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) continue;
    for (let j = col; j <= n; j += 1) aug[col][j] /= pivot;
    for (let r = 0; r < n; r += 1) {
      if (r === col || aug[r][col] === 0) continue;
      const factor = aug[r][col];
      for (let j = col; j <= n; j += 1) aug[r][j] -= factor * aug[col][j];
    }
  }
  return aug.map((row) => row[n]);
}

const SMOOTH_LIFT_MATRIX_10X3: readonly (readonly [number, number, number])[] = ((): readonly (readonly [
  number,
  number,
  number,
])[] => {
  const n = SPECTRAL_BAND_COUNT;
  const wMat: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => (i === j ? 0.02 : 0)),
  );
  for (let k = 0; k < n - 2; k += 1) {
    const stencil: readonly [number, number][] = [[k, 1], [k + 1, -2], [k + 2, 1]];
    for (const [idxA, wA] of stencil) {
      for (const [idxB, wB] of stencil) {
        wMat[idxA][idxB] += 6.0 * wA * wB;
      }
    }
  }
  const wInvMt: number[][] = [0, 1, 2].map((c) => solveLinearSystem(wMat, SPECTRAL_TO_LINEAR_RGB_ROWS[c]));
  const gMat: number[][] = [0, 1, 2].map((r) =>
    [0, 1, 2].map((c) => {
      let acc = 0;
      for (let i = 0; i < n; i += 1) acc += SPECTRAL_TO_LINEAR_RGB_ROWS[r][i] * wInvMt[c][i];
      return acc;
    }),
  );
  const gInvCols: number[][] = [
    solveLinearSystem(gMat, [1, 0, 0]),
    solveLinearSystem(gMat, [0, 1, 0]),
    solveLinearSystem(gMat, [0, 0, 1]),
  ];
  return Array.from({ length: n }, (_, i): [number, number, number] => [
    wInvMt[0][i] * gInvCols[0][0] + wInvMt[1][i] * gInvCols[0][1] + wInvMt[2][i] * gInvCols[0][2],
    wInvMt[0][i] * gInvCols[1][0] + wInvMt[1][i] * gInvCols[1][1] + wInvMt[2][i] * gInvCols[1][2],
    wInvMt[0][i] * gInvCols[2][0] + wInvMt[1][i] * gInvCols[2][1] + wInvMt[2][i] * gInvCols[2][2],
  ]);
})();

function projectUnclampedLinearRgb(spec: readonly number[]): RgbTuple {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < SPECTRAL_BAND_COUNT; i += 1) {
    r += SPECTRAL_TO_LINEAR_RGB_ROWS[0][i] * spec[i];
    g += SPECTRAL_TO_LINEAR_RGB_ROWS[1][i] * spec[i];
    b += SPECTRAL_TO_LINEAR_RGB_ROWS[2][i] * spec[i];
  }
  return [r, g, b];
}

function measureSpectralRoughness(spec: SpectralTuple10): number {
  let sumSq = 0;
  for (let i = 0; i < SPECTRAL_BAND_COUNT - 2; i += 1) {
    const d2 = spec[i] - 2 * spec[i + 1] + spec[i + 2];
    sumSq += d2 * d2;
  }
  return Math.sqrt(sumSq / (SPECTRAL_BAND_COUNT - 2));
}

/** 임의의 sRGB 색상 [r, g, b] ∈ [0, 1]³을 매끄러운 10-밴드 반사율 스펙트럼으로 업샘플링한다. */
export function liftSrgbToSpectralReflectance(
  srgb: RgbTuple,
  maxIterations = 24,
): SpectralLiftingResult {
  const clampedTargetSrgb: RgbTuple = [
    clampFinite(srgb[0], 0, 1),
    clampFinite(srgb[1], 0, 1),
    clampFinite(srgb[2], 0, 1),
  ];
  const targetLin = srgbToLinearRgb(clampedTargetSrgb);
  const spectrum: number[] = Array.from({ length: SPECTRAL_BAND_COUNT }, (_, i) => {
    const init =
      SMOOTH_LIFT_MATRIX_10X3[i][0] * targetLin[0] +
      SMOOTH_LIFT_MATRIX_10X3[i][1] * targetLin[1] +
      SMOOTH_LIFT_MATRIX_10X3[i][2] * targetLin[2];
    return clampFinite(init, MIN_PHYSICAL_REFLECTANCE, MAX_PHYSICAL_REFLECTANCE);
  });

  let iterations = 1;
  const safeMaxIter = Math.max(1, Math.min(64, Math.floor(maxIterations)));
  for (let iter = 1; iter < safeMaxIter; iter += 1) {
    const cur = projectUnclampedLinearRgb(spectrum);
    const errR = targetLin[0] - cur[0];
    const errG = targetLin[1] - cur[1];
    const errB = targetLin[2] - cur[2];
    if (Math.max(Math.abs(errR), Math.abs(errG), Math.abs(errB)) < 1e-6) break;
    iterations = iter + 1;
    for (let i = 0; i < SPECTRAL_BAND_COUNT; i += 1) {
      const delta =
        SMOOTH_LIFT_MATRIX_10X3[i][0] * errR +
        SMOOTH_LIFT_MATRIX_10X3[i][1] * errG +
        SMOOTH_LIFT_MATRIX_10X3[i][2] * errB;
      spectrum[i] = clampFinite(
        spectrum[i] + 0.85 * delta,
        MIN_PHYSICAL_REFLECTANCE,
        MAX_PHYSICAL_REFLECTANCE,
      );
    }
  }

  const reflectance = toTuple10(spectrum);
  const reprojectedSrgb = spectralReflectanceToSrgb(reflectance);
  const dr = Math.abs(clampedTargetSrgb[0] - reprojectedSrgb[0]);
  const dg = Math.abs(clampedTargetSrgb[1] - reprojectedSrgb[1]);
  const db = Math.abs(clampedTargetSrgb[2] - reprojectedSrgb[2]);
  return {
    targetSrgb: clampedTargetSrgb,
    reflectance,
    reprojectedSrgb,
    maxChannelError: Math.max(dr, dg, db),
    rmsChannelError: Math.sqrt((dr * dr + dg * dg + db * db) / 3),
    oklchDeltaE: computeOklchDeltaE(srgbToOklch(clampedTargetSrgb), srgbToOklch(reprojectedSrgb)),
    roughnessScore: measureSpectralRoughness(reflectance),
    iterations,
  };
}
