/**
 * 전문가 드로잉 8선 공통 수치·색상 모델 +
 * 3. Kubelka-Munk 감산 물감 혼색 & OKLab 색온도/명도 보정 (`mixPigmentsAndAdjustTone`)
 * 5. 실시간 Rec.709 흑백 명도(밸류) & 좌우 반전 서브뷰 (`computeValueFlipSubView`)
 */

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface RectBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface OklabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function roundToDigits(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function normalizeHueDeg(hue: number): number {
  const wrapped = hue % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function srgbByteToLinear(channel: number): number {
  const c = clampNumber(channel, 0, 255) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbByte(linear: number): number {
  const c = clampNumber(linear, 0, 1);
  const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(clampNumber(encoded, 0, 1) * 255);
}

export function oklchToOklab(color: OklchColor): OklabColor {
  const rad = (normalizeHueDeg(color.h) * Math.PI) / 180;
  return {
    l: clampNumber(color.l, 0, 1),
    a: color.c * Math.cos(rad),
    b: color.c * Math.sin(rad),
  };
}

export function oklabToOklch(lab: OklabColor): OklchColor {
  const c = Math.hypot(lab.a, lab.b);
  const h = c < 1e-6 ? 0 : normalizeHueDeg((Math.atan2(lab.b, lab.a) * 180) / Math.PI);
  return {
    l: roundToDigits(clampNumber(lab.l, 0, 1), 4),
    c: roundToDigits(c, 4),
    h: roundToDigits(h, 2),
  };
}

export function rgbToOklab(rgb: RgbColor): OklabColor {
  const r = srgbByteToLinear(rgb.r);
  const g = srgbByteToLinear(rgb.g);
  const b = srgbByteToLinear(rgb.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lCbrt = Math.cbrt(Math.max(0, l));
  const mCbrt = Math.cbrt(Math.max(0, m));
  const sCbrt = Math.cbrt(Math.max(0, s));

  return {
    l: 0.2104542553 * lCbrt + 0.793617785 * mCbrt - 0.0040720468 * sCbrt,
    a: 1.9779984951 * lCbrt - 2.428592205 * mCbrt + 0.4505937099 * sCbrt,
    b: 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.808675766 * sCbrt,
  };
}

function oklabToLinearRgbRaw(lab: OklabColor): readonly [number, number, number] {
  const lCbrt = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mCbrt = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sCbrt = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;

  const l = lCbrt * lCbrt * lCbrt;
  const m = mCbrt * mCbrt * mCbrt;
  const s = sCbrt * sCbrt * sCbrt;

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function oklabToRgbGamutMapped(lab: OklabColor): RgbColor {
  const clampedL = clampNumber(lab.l, 0, 1);
  let [r, g, b] = oklabToLinearRgbRaw({ l: clampedL, a: lab.a, b: lab.b });
  const inGamut = (x: number, y: number, z: number) =>
    x >= -1e-4 && x <= 1.0001 && y >= -1e-4 && y <= 1.0001 && z >= -1e-4 && z <= 1.0001;

  if (!inGamut(r, g, b)) {
    let low = 0;
    let high = 1;
    for (let i = 0; i < 14; i += 1) {
      const mid = (low + high) * 0.5;
      const [tr, tg, tb] = oklabToLinearRgbRaw({ l: clampedL, a: lab.a * mid, b: lab.b * mid });
      if (inGamut(tr, tg, tb)) low = mid;
      else high = mid;
    }
    [r, g, b] = oklabToLinearRgbRaw({ l: clampedL, a: lab.a * low, b: lab.b * low });
  }
  return {
    r: linearToSrgbByte(r),
    g: linearToSrgbByte(g),
    b: linearToSrgbByte(b),
  };
}

export function rgbToOklch(rgb: RgbColor): OklchColor {
  return oklabToOklch(rgbToOklab(rgb));
}

export function oklchToRgb(color: OklchColor): RgbColor {
  return oklabToRgbGamutMapped(oklchToOklab(color));
}

export function formatOklchCss(color: OklchColor): string {
  const lPct = roundToDigits(clampNumber(color.l, 0, 1) * 100, 2);
  const cVal = roundToDigits(clampNumber(color.c, 0, 0.4), 4);
  const hVal = roundToDigits(normalizeHueDeg(color.h), 1);
  return `oklch(${lPct}% ${cVal} ${hVal})`;
}

// ============================================================================
// 3. 실제 물감 혼색 팔레트 (Kubelka-Munk 감산 혼색) & 색온도/명도 보정 브러시
// ============================================================================

export interface PigmentMixToneInput {
  readonly primary: RgbColor;
  readonly secondary: RgbColor;
  readonly ratio: number;
  readonly temperatureShift?: number;
  readonly lightnessShift?: number;
  readonly chromaScale?: number;
}

export interface PigmentMixToneResult {
  readonly mixedRgb: RgbColor;
  readonly mixedOklch: OklchColor;
  readonly mixedCssOklch: string;
  readonly adjustedRgb: RgbColor;
  readonly adjustedOklch: OklchColor;
  readonly adjustedCssOklch: string;
  readonly naiveAdditiveOklch: OklchColor;
  readonly naiveAdditiveCssOklch: string;
}

function reflectanceToKS(reflectance: number): number {
  const r = clampNumber(reflectance, 0.004, 0.996);
  return ((1 - r) * (1 - r)) / (2 * r);
}

function ksToReflectance(ks: number): number {
  const safeKs = Math.max(0, ks);
  return clampNumber(1 + safeKs - Math.sqrt(safeKs * safeKs + 2 * safeKs), 0, 1);
}

/**
 * 선형 sRGB를 6대역 가시광 반사율 스펙트럼(440/490/535/575/615/660nm)으로 투영.
 */
function linearRgbTo6BandSpectrum(r: number, g: number, b: number): readonly number[] {
  return [
    clampNumber(0.95 * b + 0.05 * g, 0.006, 0.994),
    clampNumber(0.62 * b + 0.38 * g, 0.006, 0.994),
    clampNumber(0.18 * b + 0.72 * g + 0.1 * r, 0.006, 0.994),
    clampNumber(0.48 * g + 0.52 * r, 0.006, 0.994),
    clampNumber(0.14 * g + 0.86 * r, 0.006, 0.994),
    clampNumber(0.03 * g + 0.97 * r, 0.006, 0.994),
  ];
}

function spectrum6BandToLinearRgb(bands: readonly number[]): readonly [number, number, number] {
  const r = clampNumber(0.18 * bands[3] + 0.38 * bands[4] + 0.44 * bands[5], 0, 1);
  const g = clampNumber(0.22 * bands[1] + 0.56 * bands[2] + 0.22 * bands[3], 0, 1);
  const b = clampNumber(0.68 * bands[0] + 0.32 * bands[1], 0, 1);
  return [r, g, b];
}

export function mixPigmentsAndAdjustTone(input: PigmentMixToneInput): PigmentMixToneResult {
  const t = clampNumber(input.ratio, 0, 1);
  const r1 = srgbByteToLinear(input.primary.r);
  const g1 = srgbByteToLinear(input.primary.g);
  const b1 = srgbByteToLinear(input.primary.b);
  const r2 = srgbByteToLinear(input.secondary.r);
  const g2 = srgbByteToLinear(input.secondary.g);
  const b2 = srgbByteToLinear(input.secondary.b);

  const naiveRgb: RgbColor = {
    r: linearToSrgbByte(r1 * (1 - t) + r2 * t),
    g: linearToSrgbByte(g1 * (1 - t) + g2 * t),
    b: linearToSrgbByte(b1 * (1 - t) + b2 * t),
  };
  const naiveAdditiveOklch = oklabToOklch(rgbToOklab(naiveRgb));

  let mixedRgb: RgbColor;
  if (t <= 1e-6) {
    mixedRgb = { ...input.primary };
  } else if (t >= 1 - 1e-6) {
    mixedRgb = { ...input.secondary };
  } else {
    const spec1 = linearRgbTo6BandSpectrum(r1, g1, b1);
    const spec2 = linearRgbTo6BandSpectrum(r2, g2, b2);
    const kmSpec = spec1.map((v1, idx) => {
      const ksMix = (1 - t) * reflectanceToKS(v1) + t * reflectanceToKS(spec2[idx]);
      return ksToReflectance(ksMix);
    });
    const [kmR, kmG, kmB] = spectrum6BandToLinearRgb(kmSpec);
    const midWeight = 4 * t * (1 - t);
    const [end1R, end1G, end1B] = spectrum6BandToLinearRgb(spec1);
    const [end2R, end2G, end2B] = spectrum6BandToLinearRgb(spec2);
    const residualR = (1 - t) * (r1 - end1R) + t * (r2 - end2R);
    const residualG = (1 - t) * (g1 - end1G) + t * (g2 - end2G);
    const residualB = (1 - t) * (b1 - end1B) + t * (b2 - end2B);
    const corrScale = 1 - midWeight * 0.85;

    mixedRgb = {
      r: linearToSrgbByte(kmR + residualR * corrScale),
      g: linearToSrgbByte(kmG + residualG * corrScale),
      b: linearToSrgbByte(kmB + residualB * corrScale),
    };
  }

  const mixedLab = rgbToOklab(mixedRgb);
  const mixedOklch = oklabToOklch(mixedLab);

  const tempShift = clampNumber(input.temperatureShift ?? 0, -1, 1);
  const lightShift = clampNumber(input.lightnessShift ?? 0, -0.5, 0.5);
  const chromaScale = clampNumber(input.chromaScale ?? 1, 0, 2);

  const adjustedLab: OklabColor = {
    l: clampNumber(mixedLab.l + lightShift, 0.02, 0.98),
    a: mixedLab.a * chromaScale + tempShift * 0.042,
    b: mixedLab.b * chromaScale + tempShift * 0.082,
  };
  const adjustedRgb = oklabToRgbGamutMapped(adjustedLab);
  const adjustedOklch = oklabToOklch(rgbToOklab(adjustedRgb));

  return {
    mixedRgb,
    mixedOklch,
    mixedCssOklch: formatOklchCss(mixedOklch),
    adjustedRgb,
    adjustedOklch,
    adjustedCssOklch: formatOklchCss(adjustedOklch),
    naiveAdditiveOklch,
    naiveAdditiveCssOklch: formatOklchCss(naiveAdditiveOklch),
  };
}

// ============================================================================
// 5. 실시간 흑백 명도(밸류) & 좌우 반전 서브뷰 상태기
// ============================================================================

export interface ValueFlipSubViewInput {
  readonly pixels: ReadonlyArray<RgbColor>;
  readonly width: number;
  readonly height: number;
  readonly grayscaleEnabled: boolean;
  readonly flipHorizontal: boolean;
  readonly flipVertical?: boolean;
  readonly zoom?: number;
}

export interface ValueFlipSubViewResult {
  readonly histogram16: readonly number[];
  readonly grayscaleSamples: readonly number[];
  readonly shadowRatio: number;
  readonly midtoneRatio: number;
  readonly highlightRatio: number;
  readonly meanLuminance: number;
  readonly dynamicRange: number;
  readonly contrastRatio: number;
  readonly balanceVerdictKo: string;
  readonly transformMatrix: readonly [number, number, number, number, number, number];
  readonly cssTransform: string;
  readonly cssFilter: string;
}

export function computeValueFlipSubView(input: ValueFlipSubViewInput): ValueFlipSubViewResult {
  const width = Math.max(1, input.width);
  const height = Math.max(1, input.height);
  const zoom = clampNumber(input.zoom ?? 1, 0.1, 4);
  const flipV = input.flipVertical === true;

  const scaleX = (input.flipHorizontal ? -1 : 1) * zoom;
  const scaleY = (flipV ? -1 : 1) * zoom;
  const translateX = input.flipHorizontal ? roundToDigits(width * zoom, 3) : 0;
  const translateY = flipV ? roundToDigits(height * zoom, 3) : 0;
  const transformMatrix: readonly [number, number, number, number, number, number] = [
    roundToDigits(scaleX, 4),
    0,
    0,
    roundToDigits(scaleY, 4),
    translateX,
    translateY,
  ];

  const histogram = new Array<number>(16).fill(0);
  const grayscaleSamples: number[] = [];
  let shadowCount = 0;
  let midtoneCount = 0;
  let lumSum = 0;
  let minLum = 255;
  let maxLum = 0;

  for (const px of input.pixels) {
    const r = clampNumber(px.r, 0, 255);
    const g = clampNumber(px.g, 0, 255);
    const b = clampNumber(px.b, 0, 255);
    const y = clampNumber(0.2126 * r + 0.7152 * g + 0.0722 * b, 0, 255);
    grayscaleSamples.push(roundToDigits(y, 2));
    lumSum += y;
    if (y < minLum) minLum = y;
    if (y > maxLum) maxLum = y;

    histogram[Math.min(15, Math.floor(y / 16))] += 1;
    if (y < 85) shadowCount += 1;
    else if (y < 170) midtoneCount += 1;
  }

  const count = input.pixels.length;
  const shadowRatio = count > 0 ? roundToDigits(shadowCount / count, 4) : 0;
  const midtoneRatio = count > 0 ? roundToDigits(midtoneCount / count, 4) : 0;
  const highlightRatio =
    count > 0 ? roundToDigits(Math.max(0, 1 - shadowRatio - midtoneRatio), 4) : 0;
  const meanLuminance = count > 0 ? roundToDigits(lumSum / count, 2) : 0;
  const dynamicRange = count > 0 ? roundToDigits(maxLum - minLum, 2) : 0;

  const relMax = count > 0 ? srgbByteToLinear(maxLum) : 0;
  const relMin = count > 0 ? srgbByteToLinear(minLum) : 0;
  const contrastRatio = count > 0 ? roundToDigits((relMax + 0.05) / (relMin + 0.05), 2) : 1;

  let balanceVerdictKo = "명암 3구간(암부·중간톤·명부)이 균형 잡혀 있습니다.";
  if (count === 0) {
    balanceVerdictKo = "분석할 픽셀 표본이 없습니다.";
  } else if (midtoneRatio > 0.7) {
    balanceVerdictKo = "중간톤 편중이 큽니다. 어두운 암부와 밝은 하이라이트를 더 분리해 주세요.";
  } else if (shadowRatio > 0.65) {
    balanceVerdictKo = "암부 비중이 높습니다. 주인공 실루엣 주변 명도 대비를 확보해 주세요.";
  } else if (highlightRatio > 0.65) {
    balanceVerdictKo = "명부 비중이 높습니다. 중심 컷의 무게를 잡아줄 암부 포인트를 보강해 주세요.";
  }

  return {
    histogram16: histogram,
    grayscaleSamples,
    shadowRatio,
    midtoneRatio,
    highlightRatio,
    meanLuminance,
    dynamicRange,
    contrastRatio,
    balanceVerdictKo,
    transformMatrix,
    cssTransform: `matrix(${transformMatrix.join(", ")})`,
    cssFilter: input.grayscaleEnabled ? "grayscale(1)" : "none",
  };
}
