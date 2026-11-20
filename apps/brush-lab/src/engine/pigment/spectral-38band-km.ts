/**
 * Brush Lab 순수 엔진용 38밴드(380~750nm) CIE 1931 2° × D65 Kubelka-Munk 분광 혼색 커널.
 * (`apps/brush-lab/src/engine/**` 제로-외부의존 경계 규율 준수;
 *  `packages/studio-brush-platform/src/pigment/spectral-38band-km.ts`와 비트 단위 동일 수식·테이블)
 */

import type { Rgb } from "../core/types";

const SPECTRAL_COUNT = 38;
const SPECTRAL_EPS = 1e-4;

const WX: readonly number[] = [
  0.000065, 0.000219, 0.001121, 0.003768, 0.011884, 0.023294, 0.03457, 0.037235,
  0.032428, 0.02124, 0.010494, 0.003297, 0.000507, 0.000949, 0.006276, 0.01687,
  0.028698, 0.042688, 0.056272, 0.069492, 0.083079, 0.086153, 0.090494, 0.08503,
  0.070928, 0.050644, 0.035485, 0.021475, 0.01252, 0.006807, 0.003466, 0.001498,
  0.00077, 0.000407, 0.000169, 0.000095, 0.000049, 0.00002,
];
const WY: readonly number[] = [
  0.000002, 0.000006, 0.000031, 0.000105, 0.000354, 0.000951, 0.002282, 0.004207,
  0.006689, 0.009888, 0.015249, 0.021418, 0.033423, 0.05131, 0.070402, 0.087839,
  0.094249, 0.097957, 0.094152, 0.086781, 0.078857, 0.063527, 0.053741, 0.042646,
  0.031617, 0.020885, 0.01386, 0.008103, 0.00463, 0.002491, 0.001259, 0.000542,
  0.000278, 0.000147, 0.000061, 0.000034, 0.000018, 0.000007,
];
const WZ: readonly number[] = [
  0.000305, 0.001038, 0.005318, 0.01797, 0.057126, 0.113748, 0.173506, 0.196373,
  0.18624, 0.140069, 0.08925, 0.047937, 0.02817, 0.016151, 0.007766, 0.0043,
  0.002007, 0.000862, 0.000369, 0.000192, 0.00015, 0.000092, 0.000068, 0.000029,
  0.000016, 0.000004, 0.000002, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];
const BC: readonly number[] = [
  0.975855, 0.975858, 0.975872, 0.975935, 0.976157, 0.976847, 0.978275, 0.980348,
  0.982546, 0.984425, 0.985815, 0.986714, 0.987202, 0.98728, 0.986889, 0.985892,
  0.983976, 0.980433, 0.973184, 0.954867, 0.889433, 0.605982, 0.208067, 0.063489,
  0.026327, 0.015325, 0.011419, 0.009753, 0.008979, 0.008615, 0.008449, 0.008378,
  0.008345, 0.008332, 0.008328, 0.008328, 0.008329, 0.008329,
];
const BM: readonly number[] = [
  0.972425, 0.97242, 0.972389, 0.972203, 0.971471, 0.968824, 0.962923, 0.958114,
  0.94718, 0.918662, 0.828057, 0.571968, 0.287997, 0.135094, 0.068667, 0.040233,
  0.028519, 0.025781, 0.032324, 0.060995, 0.170299, 0.477461, 0.791248, 0.919825,
  0.960595, 0.974388, 0.980025, 0.982538, 0.983729, 0.984294, 0.984552, 0.984663,
  0.984712, 0.984732, 0.984736, 0.984736, 0.984734, 0.984733,
];
const BY: readonly number[] = [
  0.020908, 0.020913, 0.020931, 0.021021, 0.021357, 0.022522, 0.025657, 0.03329,
  0.051652, 0.100436, 0.239053, 0.535743, 0.798797, 0.911964, 0.954037, 0.971345,
  0.97933, 0.983354, 0.985388, 0.986313, 0.986562, 0.98638, 0.985976, 0.985498,
  0.985061, 0.984725, 0.984493, 0.984352, 0.984272, 0.98423, 0.98421, 0.9842,
  0.984195, 0.984193, 0.984192, 0.984191, 0.984191, 0.984191,
];
const BR: readonly number[] = [
  0.024145, 0.024142, 0.024128, 0.024065, 0.023843, 0.023153, 0.021725, 0.019652,
  0.017454, 0.015575, 0.014185, 0.013286, 0.012798, 0.01272, 0.013111, 0.014108,
  0.016024, 0.019567, 0.026816, 0.045133, 0.110567, 0.394018, 0.791933, 0.936511,
  0.973673, 0.984675, 0.988581, 0.990247, 0.991021, 0.991385, 0.991551, 0.991622,
  0.991655, 0.991668, 0.991672, 0.991672, 0.991671, 0.991671,
];
const BG: readonly number[] = [
  0.027575, 0.02758, 0.027611, 0.027797, 0.028529, 0.031176, 0.037077, 0.041886,
  0.05282, 0.081338, 0.171943, 0.428032, 0.712003, 0.864906, 0.931333, 0.959767,
  0.971481, 0.974219, 0.967676, 0.939005, 0.829701, 0.522539, 0.208752, 0.080175,
  0.039405, 0.025612, 0.019975, 0.017462, 0.016271, 0.015706, 0.015448, 0.015337,
  0.015288, 0.015268, 0.015264, 0.015264, 0.015266, 0.015267,
];
const BB: readonly number[] = [
  0.979092, 0.979087, 0.979069, 0.978979, 0.978643, 0.977478, 0.974343, 0.96671,
  0.948348, 0.899564, 0.760947, 0.464257, 0.201203, 0.088036, 0.045963, 0.028655,
  0.02067, 0.016646, 0.014612, 0.013687, 0.013438, 0.01362, 0.014024, 0.014502,
  0.014939, 0.015275, 0.015507, 0.015648, 0.015728, 0.01577, 0.01579, 0.0158,
  0.015805, 0.015807, 0.015808, 0.015809, 0.015809, 0.015809,
];

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v <= 0 ? 0 : v >= 1 ? 1 : v;
}

function srgbToLinear(c: number): number {
  const x = clamp01(c);
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const x = clamp01(c);
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function oklabLCh(rgb: Rgb): { readonly L: number; readonly C: number; readonly hDeg: number } {
  const l = Math.cbrt(0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b);
  const m = Math.cbrt(0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b);
  const s = Math.cbrt(0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(a, b), hDeg: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

function linearToReflectance38(rgb: Rgb, out: Float32Array): void {
  let r = clamp01(rgb.r);
  let g = clamp01(rgb.g);
  let b = clamp01(rgb.b);
  const w = Math.min(r, g, b);
  r -= w;
  g -= w;
  b -= w;
  const c = Math.min(g, b);
  const m = Math.min(r, b);
  const y = Math.min(r, g);
  const pr = Math.min(Math.max(0, r - b), Math.max(0, r - g));
  const pg = Math.min(Math.max(0, g - b), Math.max(0, g - r));
  const pb = Math.min(Math.max(0, b - g), Math.max(0, b - r));
  for (let i = 0; i < SPECTRAL_COUNT; i += 1) {
    const val = w + c * BC[i]! + m * BM[i]! + y * BY[i]! + pr * BR[i]! + pg * BG[i]! + pb * BB[i]!;
    out[i] = val < SPECTRAL_EPS ? SPECTRAL_EPS : val > 1 ? 1 : val;
  }
}

const RA = new Float32Array(SPECTRAL_COUNT);
const RB = new Float32Array(SPECTRAL_COUNT);

export function runSpectral38BandKubelkaMunkMix(params: {
  readonly colorASrgb01: Rgb;
  readonly colorBSrgb01: Rgb;
  readonly factorA: number;
  readonly factorB: number;
  readonly tintingStrengthA?: number;
  readonly tintingStrengthB?: number;
}): {
  readonly mixedSrgb01: Rgb;
  readonly mixedLinearRgb01: Rgb;
  readonly oklabLCh: { readonly L: number; readonly C: number; readonly hDeg: number };
  readonly spectralReflectance38: readonly number[];
  readonly chromaPreservationDeltaC: number;
  readonly chromaPreservationGain01: number;
} {
  linearToReflectance38(
    {
      r: srgbToLinear(params.colorASrgb01.r),
      g: srgbToLinear(params.colorASrgb01.g),
      b: srgbToLinear(params.colorASrgb01.b),
    },
    RA,
  );
  linearToReflectance38(
    {
      r: srgbToLinear(params.colorBSrgb01.r),
      g: srgbToLinear(params.colorBSrgb01.g),
      b: srgbToLinear(params.colorBSrgb01.b),
    },
    RB,
  );

  let lumA = 0;
  let lumB = 0;
  for (let i = 0; i < SPECTRAL_COUNT; i += 1) {
    lumA += RA[i]! * WY[i]!;
    lumB += RB[i]! * WY[i]!;
  }
  const fA = Math.max(0, params.factorA);
  const fB = Math.max(0, params.factorB);
  const tA = Math.max(0.1, params.tintingStrengthA ?? 1);
  const tB = Math.max(0.1, params.tintingStrengthB ?? 1);
  const concA = fA * fA * tA * tA * Math.max(SPECTRAL_EPS, lumA);
  const concB = fB * fB * tB * tB * Math.max(SPECTRAL_EPS, lumB);
  const invTot = 1 / Math.max(SPECTRAL_EPS, concA + concB);

  const reflectance38: number[] = new Array(SPECTRAL_COUNT);
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let i = 0; i < SPECTRAL_COUNT; i += 1) {
    const rA = RA[i]!;
    const rB = RB[i]!;
    const ksA = ((1 - rA) * (1 - rA)) / (2 * rA);
    const ksB = ((1 - rB) * (1 - rB)) / (2 * rB);
    const ksMix = (ksA * concA + ksB * concB) * invTot;
    const rMix = Math.max(SPECTRAL_EPS, clamp01(1 + ksMix - Math.sqrt(ksMix * ksMix + 2 * ksMix)));
    reflectance38[i] = Number(rMix.toFixed(4));
    X += rMix * WX[i]!;
    Y += rMix * WY[i]!;
    Z += rMix * WZ[i]!;
  }

  const mixedLin: Rgb = {
    r: clamp01(3.2409699419045213 * X - 1.5373831775700935 * Y - 0.4986107602930033 * Z),
    g: clamp01(-0.9692436362808798 * X + 1.8759675015077206 * Y + 0.04155505740717561 * Z),
    b: clamp01(0.05563007969699361 * X - 0.20397695888897657 * Y + 1.0569715142428786 * Z),
  };
  const ok = oklabLCh(mixedLin);

  const t = fB / Math.max(SPECTRAL_EPS, fA + fB);
  const naiveOk = oklabLCh({
    r: srgbToLinear((1 - t) * clamp01(params.colorASrgb01.r) + t * clamp01(params.colorBSrgb01.r)),
    g: srgbToLinear((1 - t) * clamp01(params.colorASrgb01.g) + t * clamp01(params.colorBSrgb01.g)),
    b: srgbToLinear((1 - t) * clamp01(params.colorASrgb01.b) + t * clamp01(params.colorBSrgb01.b)),
  });
  const deltaC = Math.max(0, ok.C - naiveOk.C);
  const relGain = ok.C > SPECTRAL_EPS ? clamp01(deltaC / ok.C) : 0;

  return {
    mixedSrgb01: {
      r: Number(linearToSrgb(mixedLin.r).toFixed(4)),
      g: Number(linearToSrgb(mixedLin.g).toFixed(4)),
      b: Number(linearToSrgb(mixedLin.b).toFixed(4)),
    },
    mixedLinearRgb01: {
      r: Number(mixedLin.r.toFixed(4)),
      g: Number(mixedLin.g.toFixed(4)),
      b: Number(mixedLin.b.toFixed(4)),
    },
    oklabLCh: {
      L: Number(ok.L.toFixed(4)),
      C: Number(ok.C.toFixed(4)),
      hDeg: Number(ok.hDeg.toFixed(2)),
    },
    spectralReflectance38: reflectance38,
    chromaPreservationDeltaC: Number(deltaC.toFixed(4)),
    chromaPreservationGain01: Number(relGain.toFixed(4)),
  };
}
