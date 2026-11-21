/** 38-band (380..750nm, 10nm) CIE 1931 2deg D65 Kubelka-Munk spectral pigment mixer. */
export const SPECTRAL_38BAND_COUNT = 38 as const;
export const SPECTRAL_38BAND_MIN_NM = 380 as const;
export const SPECTRAL_38BAND_STEP_NM = 10 as const;
const EPS = 1e-4;

export const CIE_1931_D65_WEIGHTS_X: readonly number[] = Object.freeze([
  .000065,.000219,.001121,.003768,.011884,.023294,.03457,.037235,.032428,.02124,.010494,.003297,.000507,.000949,.006276,.01687,.028698,.042688,.056272,.069492,.083079,.086153,.090494,.08503,.070928,.050644,.035485,.021475,.01252,.006807,.003466,.001498,.00077,.000407,.000169,.000095,.000049,.00002,
]);
export const CIE_1931_D65_WEIGHTS_Y: readonly number[] = Object.freeze([
  .000002,.000006,.000031,.000105,.000354,.000951,.002282,.004207,.006689,.009888,.015249,.021418,.033423,.05131,.070402,.087839,.094249,.097957,.094152,.086781,.078857,.063527,.053741,.042646,.031617,.020885,.01386,.008103,.00463,.002491,.001259,.000542,.000278,.000147,.000061,.000034,.000018,.000007,
]);
export const CIE_1931_D65_WEIGHTS_Z: readonly number[] = Object.freeze([
  .000305,.001038,.005318,.01797,.057126,.113748,.173506,.196373,.18624,.140069,.08925,.047937,.02817,.016151,.007766,.0043,.002007,.000862,.000369,.000192,.00015,.000092,.000068,.000029,.000016,.000004,.000002,0,0,0,0,0,0,0,0,0,0,0,
]);

const BC: readonly number[] = Object.freeze([
  .975855,.975858,.975872,.975935,.976157,.976847,.978275,.980348,.982546,.984425,.985815,.986714,.987202,.98728,.986889,.985892,.983976,.980433,.973184,.954867,.889433,.605982,.208067,.063489,.026327,.015325,.011419,.009753,.008979,.008615,.008449,.008378,.008345,.008332,.008328,.008328,.008329,.008329,
]);
const BM: readonly number[] = Object.freeze([
  .972425,.97242,.972389,.972203,.971471,.968824,.962923,.958114,.94718,.918662,.828057,.571968,.287997,.135094,.068667,.040233,.028519,.025781,.032324,.060995,.170299,.477461,.791248,.919825,.960595,.974388,.980025,.982538,.983729,.984294,.984552,.984663,.984712,.984732,.984736,.984736,.984734,.984733,
]);
const BY: readonly number[] = Object.freeze([
  .020908,.020913,.020931,.021021,.021357,.022522,.025657,.03329,.051652,.100436,.239053,.535743,.798797,.911964,.954037,.971345,.97933,.983354,.985388,.986313,.986562,.98638,.985976,.985498,.985061,.984725,.984493,.984352,.984272,.98423,.98421,.9842,.984195,.984193,.984192,.984191,.984191,.984191,
]);
const comp = (a: readonly number[]): readonly number[] => Object.freeze(a.map((v) => Math.round((1 - v) * 1e6) / 1e6));
export const SPECTRAL_38BAND_BASIS = Object.freeze({ C: BC, M: BM, Y: BY, R: comp(BC), G: comp(BM), B: comp(BY) });

export interface SpectralRgb01 { readonly r: number; readonly g: number; readonly b: number }
export interface Spectral38KmMixInput {
  readonly colorASrgb01: SpectralRgb01;
  readonly colorBSrgb01: SpectralRgb01;
  readonly factorA: number;
  readonly factorB: number;
  readonly tintingStrengthA?: number;
  readonly tintingStrengthB?: number;
}
export interface Spectral38KmMixOutput {
  readonly mixedSrgb01: SpectralRgb01;
  readonly mixedLinearRgb01: SpectralRgb01;
  readonly oklabLCh: { readonly L: number; readonly C: number; readonly hDeg: number };
  readonly spectralReflectance38: readonly number[];
  readonly chromaPreservationDeltaC: number;
  readonly chromaPreservationGain01: number;
}

const clamp01 = (v: number): number => (!Number.isFinite(v) || v <= 0 ? 0 : v >= 1 ? 1 : v);
export const spectralSrgbToLinear01 = (x: number): number => { const c = clamp01(x); return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export const spectralLinearToSrgb01 = (x: number): number => { const c = clamp01(x); return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };

export function linearRgbToSpectralReflectance38(rgb: SpectralRgb01, out = new Float32Array(38)): Float32Array {
  let r = clamp01(rgb.r), g = clamp01(rgb.g), b = clamp01(rgb.b);
  const w = Math.min(r, g, b); r -= w; g -= w; b -= w;
  const c = Math.min(g, b), m = Math.min(r, b), y = Math.min(r, g);
  const pr = Math.min(Math.max(0, r - b), Math.max(0, r - g));
  const pg = Math.min(Math.max(0, g - b), Math.max(0, g - r));
  const pb = Math.min(Math.max(0, b - g), Math.max(0, b - r));
  const { C, M, Y, R, G, B } = SPECTRAL_38BAND_BASIS;
  for (let i = 0; i < 38; i += 1) {
    const v = w + c * C[i]! + m * M[i]! + y * Y[i]! + pr * R[i]! + pg * G[i]! + pb * B[i]!;
    out[i] = v < EPS ? EPS : v > 1 ? 1 : v;
  }
  return out;
}

export function spectralReflectance38ToLinearRgb(refl: ArrayLike<number>): SpectralRgb01 {
  let X = 0, Y = 0, Z = 0;
  for (let i = 0; i < 38; i += 1) {
    const r = refl[i] ?? EPS;
    X += r * CIE_1931_D65_WEIGHTS_X[i]!; Y += r * CIE_1931_D65_WEIGHTS_Y[i]!; Z += r * CIE_1931_D65_WEIGHTS_Z[i]!;
  }
  return {
    r: clamp01(3.2409699419045213 * X - 1.5373831775700935 * Y - 0.4986107602930033 * Z),
    g: clamp01(-0.9692436362808798 * X + 1.8759675015077206 * Y + 0.04155505740717561 * Z),
    b: clamp01(0.05563007969699361 * X - 0.20397695888897657 * Y + 1.0569715142428786 * Z),
  };
}

function oklabLCh(rgb: SpectralRgb01) {
  const l = Math.cbrt(0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b);
  const m = Math.cbrt(0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b);
  const s = Math.cbrt(0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, C: Math.hypot(a, b), hDeg: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

const RA = new Float32Array(38), RB = new Float32Array(38), RM = new Float32Array(38);

function kmBlendInto(linA: SpectralRgb01, linB: SpectralRgb01, fA: number, fB: number, tsA: number, tsB: number) {
  linearRgbToSpectralReflectance38(linA, RA); linearRgbToSpectralReflectance38(linB, RB);
  let lumA = 0, lumB = 0;
  for (let i = 0; i < 38; i += 1) { lumA += RA[i]! * CIE_1931_D65_WEIGHTS_Y[i]!; lumB += RB[i]! * CIE_1931_D65_WEIGHTS_Y[i]!; }
  const cA = fA * fA * tsA * tsA * Math.max(EPS, lumA), cB = fB * fB * tsB * tsB * Math.max(EPS, lumB);
  const inv = 1 / Math.max(EPS, cA + cB);
  for (let i = 0; i < 38; i += 1) {
    const rA = RA[i]!, rB = RB[i]!;
    const ks = ((((1 - rA) * (1 - rA)) / (2 * rA)) * cA + (((1 - rB) * (1 - rB)) / (2 * rB)) * cB) * inv;
    RM[i] = Math.max(EPS, 1 + ks - Math.sqrt(ks * ks + 2 * ks));
  }
  return spectralReflectance38ToLinearRgb(RM);
}

export function mixSpectral38BandKubelkaMunk(input: Spectral38KmMixInput): Spectral38KmMixOutput {
  const fA = Math.max(0, Number.isFinite(input.factorA) ? input.factorA : 0);
  const fB = Math.max(0, Number.isFinite(input.factorB) ? input.factorB : 0);
  const tsA = Math.max(0.1, Number.isFinite(input.tintingStrengthA) ? (input.tintingStrengthA ?? 1) : 1);
  const tsB = Math.max(0.1, Number.isFinite(input.tintingStrengthB) ? (input.tintingStrengthB ?? 1) : 1);
  const linA = { r: spectralSrgbToLinear01(input.colorASrgb01.r), g: spectralSrgbToLinear01(input.colorASrgb01.g), b: spectralSrgbToLinear01(input.colorASrgb01.b) };
  const linB = { r: spectralSrgbToLinear01(input.colorBSrgb01.r), g: spectralSrgbToLinear01(input.colorBSrgb01.g), b: spectralSrgbToLinear01(input.colorBSrgb01.b) };
  const mixedLinear = kmBlendInto(linA, linB, fA, fB, tsA, tsB);
  const ok = oklabLCh(mixedLinear);
  const t = fB / Math.max(EPS, fA + fB);
  const naiveOk = oklabLCh({
    r: spectralSrgbToLinear01((1 - t) * clamp01(input.colorASrgb01.r) + t * clamp01(input.colorBSrgb01.r)),
    g: spectralSrgbToLinear01((1 - t) * clamp01(input.colorASrgb01.g) + t * clamp01(input.colorBSrgb01.g)),
    b: spectralSrgbToLinear01((1 - t) * clamp01(input.colorASrgb01.b) + t * clamp01(input.colorBSrgb01.b)),
  });
  const dC = Math.max(0, ok.C - naiveOk.C);
  return {
    mixedSrgb01: { r: +spectralLinearToSrgb01(mixedLinear.r).toFixed(4), g: +spectralLinearToSrgb01(mixedLinear.g).toFixed(4), b: +spectralLinearToSrgb01(mixedLinear.b).toFixed(4) },
    mixedLinearRgb01: { r: +mixedLinear.r.toFixed(4), g: +mixedLinear.g.toFixed(4), b: +mixedLinear.b.toFixed(4) },
    oklabLCh: { L: +ok.L.toFixed(4), C: +ok.C.toFixed(4), hDeg: +ok.hDeg.toFixed(2) },
    spectralReflectance38: Array.from(RM, (v) => +v.toFixed(4)),
    chromaPreservationDeltaC: +dC.toFixed(4),
    chromaPreservationGain01: +(ok.C > EPS ? clamp01(dC / ok.C) : 0).toFixed(4),
  };
}

export function mixSpectral38BandSrgb8(
  a: { readonly r: number; readonly g: number; readonly b: number },
  b: { readonly r: number; readonly g: number; readonly b: number },
  t: number, tsA = 1, tsB = 1,
): { r: number; g: number; b: number } {
  const mt = clamp01(t);
  if (mt <= 0) return { r: a.r, g: a.g, b: a.b };
  if (mt >= 1) return { r: b.r, g: b.g, b: b.b };
  const out = kmBlendInto(
    { r: spectralSrgbToLinear01(a.r / 255), g: spectralSrgbToLinear01(a.g / 255), b: spectralSrgbToLinear01(a.b / 255) },
    { r: spectralSrgbToLinear01(b.r / 255), g: spectralSrgbToLinear01(b.g / 255), b: spectralSrgbToLinear01(b.b / 255) },
    1 - mt, mt, tsA, tsB,
  );
  return { r: spectralLinearToSrgb01(out.r) * 255, g: spectralLinearToSrgb01(out.g) * 255, b: spectralLinearToSrgb01(out.b) * 255 };
}
