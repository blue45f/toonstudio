/**
 * Clip Studio Paint 5.1.5 내장 색조 보정(Tonal Correction) 및 선화/경계 효과 픽셀 커널 12종.
 *
 * REA `inspect_sqlite_database` (`presetMac_1.spws` → `workspaceshortcutmenu`,
 * Evidence ID: `ev_d480a3e839a1c471e3be17599d5e8a04f7a21c76554b848c70e1b23da61bcb08`)에서 확인된
 * 모든 색조 보정 명령(`filterbrightnessandcontrast`, `filterhsv`, `filterposterize`, `filterinvert`,
 * `filterlevel`, `filtertonecurve`, `filtercolorbalance`, `filterbinarization`, `filtergradientmap`)과
 * 편집/레이어 효과(`editbrightnesstoalpha`, `editchangelinecolor`, `border-effect`)의
 * 결정론적 클린룸 RGBA 픽셀 구현체다.
 */

export interface CspTonalRgbaBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface CspBrightnessContrastParams {
  /** -100 ~ +100 */
  readonly brightness: number;
  /** -100 ~ +100 */
  readonly contrast: number;
  /** CSP '기존 방식으로 사용(Legacy)' vs 선형/S-커브 대비 */
  readonly legacyMode?: boolean;
}

export interface CspHsvTonalParams {
  /** -180 ~ +180 */
  readonly hueDeg: number;
  /** -100 ~ +100 */
  readonly saturation: number;
  /** -100 ~ +100 */
  readonly luminosity: number;
}

export interface CspPosterizeParams {
  /** 2 ~ 20 계조 단계 */
  readonly levels: number;
}

export interface CspLevelChannelSpec {
  readonly inputBlack: number;
  readonly gamma: number;
  readonly inputWhite: number;
  readonly outputBlack: number;
  readonly outputWhite: number;
}

export interface CspLevelCorrectionParams {
  readonly rgb?: CspLevelChannelSpec;
  readonly red?: CspLevelChannelSpec;
  readonly green?: CspLevelChannelSpec;
  readonly blue?: CspLevelChannelSpec;
}

export interface CspToneCurvePoint {
  readonly x: number;
  readonly y: number;
}

export interface CspToneCurveParams {
  readonly master?: readonly CspToneCurvePoint[];
  readonly red?: readonly CspToneCurvePoint[];
  readonly green?: readonly CspToneCurvePoint[];
  readonly blue?: readonly CspToneCurvePoint[];
}

export interface CspColorBalanceTriplet {
  /** -100 (Cyan) ~ +100 (Red) */
  readonly cyanRed: number;
  /** -100 (Magenta) ~ +100 (Green) */
  readonly magentaGreen: number;
  /** -100 (Yellow) ~ +100 (Blue) */
  readonly yellowBlue: number;
}

export interface CspColorBalanceParams {
  readonly shadows?: CspColorBalanceTriplet;
  readonly midtones?: CspColorBalanceTriplet;
  readonly highlights?: CspColorBalanceTriplet;
  readonly preserveLuminosity?: boolean;
}

export interface CspBinarizationParams {
  /** 0 ~ 255 임계값 */
  readonly threshold: number;
  readonly preserveAlpha?: boolean;
}

export interface CspGradientMapStop {
  readonly position01: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a?: number;
}

export interface CspGradientMapParams {
  readonly stops: readonly CspGradientMapStop[];
  /** 0 ~ 1 원본과 그라데이션 맵 혼합 비율 */
  readonly mixRate01?: number;
  readonly reverse?: boolean;
}

export interface CspChangeLineColorParams {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** 알파 임계값(기본 1): 해당 알파 초과 픽셀의 색을 변경 */
  readonly minAlpha?: number;
}

export interface CspBorderEffectParams {
  readonly mode: "edge" | "watercolor-edge";
  readonly thicknessPx: number;
  readonly borderR: number;
  readonly borderG: number;
  readonly borderB: number;
  readonly opacity01?: number;
  readonly darkness01?: number;
  readonly blurWidthPx?: number;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function clampByte(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

function rgbToHsl(r255: number, g255: number, b255: number): readonly [number, number, number] {
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) * 0.5;
  const d = max - min;
  if (d < 1e-6) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(hDeg: number, s: number, l: number): readonly [number, number, number] {
  const h = (((hDeg % 360) + 360) % 360) / 360;
  const sat = clamp(s, 0, 1);
  const lig = clamp(l, 0, 1);
  if (sat < 1e-6) {
    const v = clampByte(lig * 255);
    return [v, v, v];
  }
  const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
  const p = 2 * lig - q;
  const hue2rgb = (tIn: number): number => {
    let t = tIn;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 0.5) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    clampByte(hue2rgb(h + 1 / 3) * 255),
    clampByte(hue2rgb(h) * 255),
    clampByte(hue2rgb(h - 1 / 3) * 255),
  ];
}

/** 1. 밝기·대비 (`filterbrightnessandcontrast`) */
export function applyCspBrightnessContrastFilter(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  params: CspBrightnessContrastParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const b = clamp(params.brightness, -100, 100);
  const c = clamp(params.contrast, -100, 100);
  const lut = new Uint8Array(256);

  if (params.legacyMode) {
    const factor = (259 * (c * 2.55 + 255)) / (255 * (259 - c * 2.55));
    const offset = b * 2.55;
    for (let i = 0; i < 256; i += 1) {
      lut[i] = clampByte(factor * (i + offset - 128) + 128);
    }
  } else {
    const bNorm = b / 100;
    const cSlope = c >= 0 ? 1 + (c / 100) * 1.85 : 1 + (c / 100) * 0.8;
    for (let i = 0; i < 256; i += 1) {
      const u = i / 255;
      const lit = bNorm >= 0 ? u + bNorm * (1 - u) * 0.72 : u + bNorm * u * 0.72;
      const contrasted = (lit - 0.5) * cSlope + 0.5;
      lut[i] = clampByte(contrasted * 255);
    }
  }

  for (let i = 0; i < out.length; i += 4) {
    out[i] = lut[src[i] ?? 0]!;
    out[i + 1] = lut[src[i + 1] ?? 0]!;
    out[i + 2] = lut[src[i + 2] ?? 0]!;
    out[i + 3] = src[i + 3] ?? 255;
  }
  return out;
}

/** 2. 색조·채도·명도 (`filterhsv`) */
export function applyCspHsvTonalFilter(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  params: CspHsvTonalParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const hueShift = clamp(params.hueDeg, -180, 180);
  const satShift = clamp(params.saturation, -100, 100) / 100;
  const lumShift = clamp(params.luminosity, -100, 100) / 100;

  for (let i = 0; i < out.length; i += 4) {
    const [h, s, l] = rgbToHsl(src[i] ?? 0, src[i + 1] ?? 0, src[i + 2] ?? 0);
    const nextS = satShift >= 0 ? s + (1 - s) * satShift : s * (1 + satShift);
    const nextL = lumShift >= 0 ? l + (1 - l) * lumShift : l * (1 + lumShift);
    const [r, g, b] = hslToRgb(h + hueShift, nextS, nextL);
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = src[i + 3] ?? 255;
  }
  return out;
}

/** 3. 계조화 (`filterposterize`) */
export function applyCspPosterizeFilter(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  params: CspPosterizeParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const levels = clamp(Math.round(params.levels), 2, 20);
  const step = 255 / (levels - 1);
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) {
    const bucket = Math.floor((i / 256) * levels);
    lut[i] = clampByte(bucket * step);
  }
  for (let i = 0; i < out.length; i += 4) {
    out[i] = lut[src[i] ?? 0]!;
    out[i + 1] = lut[src[i + 1] ?? 0]!;
    out[i + 2] = lut[src[i + 2] ?? 0]!;
    out[i + 3] = src[i + 3] ?? 255;
  }
  return out;
}

/** 4. 역그라데이션 (`filterinvert`) */
export function applyCspReverseGradientFilter(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = 255 - (src[i] ?? 0);
    out[i + 1] = 255 - (src[i + 1] ?? 0);
    out[i + 2] = 255 - (src[i + 2] ?? 0);
    out[i + 3] = src[i + 3] ?? 255;
  }
  return out;
}

function buildLevelLut(spec?: CspLevelChannelSpec): Uint8Array {
  const lut = new Uint8Array(256);
  if (!spec) {
    for (let i = 0; i < 256; i += 1) lut[i] = i;
    return lut;
  }
  const inB = clamp(spec.inputBlack, 0, 254);
  const inW = clamp(spec.inputWhite, inB + 1, 255);
  const invRange = 1 / (inW - inB);
  const invGamma = 1 / clamp(spec.gamma, 0.1, 9.99);
  const outB = clamp(spec.outputBlack, 0, 255);
  const outW = clamp(spec.outputWhite, 0, 255);

  for (let i = 0; i < 256; i += 1) {
    const norm = clamp((i - inB) * invRange, 0, 1);
    const gammaCorrected = Math.pow(norm, invGamma);
    lut[i] = clampByte(outB + gammaCorrected * (outW - outB));
  }
  return lut;
}

/** 5. 레벨 보정 (`filterlevel`) */
export function applyCspLevelCorrectionFilter(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  params: CspLevelCorrectionParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const mLut = buildLevelLut(params.rgb);
  const rLut = buildLevelLut(params.red);
  const gLut = buildLevelLut(params.green);
  const bLut = buildLevelLut(params.blue);

  for (let i = 0; i < out.length; i += 4) {
    out[i] = rLut[mLut[src[i] ?? 0]!]!;
    out[i + 1] = gLut[mLut[src[i + 1] ?? 0]!]!;
    out[i + 2] = bLut[mLut[src[i + 2] ?? 0]!]!;
    out[i + 3] = src[i + 3] ?? 255;
  }
  return out;
}

/** Monotone Cubic Hermite (Fritsch-Carlson) 보간으로 CSP 톤 커브 256-LUT 생성 */
export function buildCspToneCurveLut(
  points?: readonly CspToneCurvePoint[],
): Uint8Array {
  const lut = new Uint8Array(256);
  if (!points || points.length < 2) {
    for (let i = 0; i < 256; i += 1) lut[i] = i;
    return lut;
  }
  const sorted = [...points]
    .map((p) => ({ x: clamp(p.x, 0, 255), y: clamp(p.y, 0, 255) }))
    .sort((a, b) => a.x - b.x);
  // Deduplicate identical x
  const pts: { x: number; y: number }[] = [];
  for (const p of sorted) {
    const last = pts[pts.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01) {
      last.y = p.y;
    } else {
      pts.push({ ...p });
    }
  }
  if (pts.length < 2) {
    for (let i = 0; i < 256; i += 1) lut[i] = i;
    return lut;
  }

  const n = pts.length;
  const dx = new Float64Array(n - 1);
  const slope = new Float64Array(n - 1);
  const tangent = new Float64Array(n);
  for (let i = 0; i < n - 1; i += 1) {
    dx[i] = pts[i + 1]!.x - pts[i]!.x;
    slope[i] = (pts[i + 1]!.y - pts[i]!.y) / Math.max(1e-6, dx[i]!);
  }
  tangent[0] = slope[0]!;
  tangent[n - 1] = slope[n - 2]!;
  for (let i = 1; i < n - 1; i += 1) {
    const sPrev = slope[i - 1]!;
    const sNext = slope[i]!;
    if (sPrev * sNext <= 0) {
      tangent[i] = 0;
    } else {
      tangent[i] = (sPrev + sNext) * 0.5;
    }
  }
  // Fritsch-Carlson overshoot clamp
  for (let i = 0; i < n - 1; i += 1) {
    const s = slope[i]!;
    if (Math.abs(s) < 1e-8) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
    } else {
      const a = tangent[i]! / s;
      const b = tangent[i + 1]! / s;
      const h = Math.hypot(a, b);
      if (h > 3) {
        const scale = 3 / h;
        tangent[i] = scale * a * s;
        tangent[i + 1] = scale * b * s;
      }
    }
  }

  for (let x = 0; x < 256; x += 1) {
    if (x <= pts[0]!.x) {
      lut[x] = clampByte(pts[0]!.y);
      continue;
    }
    if (x >= pts[n - 1]!.x) {
      lut[x] = clampByte(pts[n - 1]!.y);
      continue;
    }
    let seg = 0;
    while (seg < n - 2 && x > pts[seg + 1]!.x) seg += 1;
    const h = dx[seg]!;
    const t = (x - pts[seg]!.x) / Math.max(1e-6, h);
    const t2 = t * t;
    const t3 = t2 * t;
    const y =
      (2 * t3 - 3 * t2 + 1) * pts[seg]!.y +
      (t3 - 2 * t2 + t) * h * tangent[seg]! +
      (-2 * t3 + 3 * t2) * pts[seg + 1]!.y +
      (t3 - t2) * h * tangent[seg + 1]!;
    lut[x] = clampByte(y);
  }
  return lut;
}

/** 6. 톤 커브 (`filtertonecurve`) */
export function applyCspToneCurveFilter(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  params: CspToneCurveParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const mLut = buildCspToneCurveLut(params.master);
  const rLut = buildCspToneCurveLut(params.red);
  const gLut = buildCspToneCurveLut(params.green);
  const bLut = buildCspToneCurveLut(params.blue);

  for (let i = 0; i < out.length; i += 4) {
    out[i] = rLut[mLut[src[i] ?? 0]!]!;
    out[i + 1] = gLut[mLut[src[i + 1] ?? 0]!]!;
    out[i + 2] = bLut[mLut[src[i + 2] ?? 0]!]!;
    out[i + 3] = src[i + 3] ?? 255;
  }
  return out;
}

/** 7. 컬러 밸런스 (`filtercolorbalance`) */
export function applyCspColorBalanceFilter(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  params: CspColorBalanceParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const sh = params.shadows ?? { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 };
  const mid = params.midtones ?? { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 };
  const hi = params.highlights ?? { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 };
  const preserveLuma = params.preserveLuminosity ?? true;

  for (let i = 0; i < out.length; i += 4) {
    const r0 = src[i] ?? 0;
    const g0 = src[i + 1] ?? 0;
    const b0 = src[i + 2] ?? 0;
    const l0 = (0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0) / 255;

    const wShadow = Math.max(0, 1 - Math.min(1, l0 * 1.8));
    const wHighlight = Math.max(0, Math.min(1, (l0 - 0.45) * 1.8));
    const wMidtone = Math.max(0, 1 - Math.abs(l0 - 0.5) * 2);

    const dR = (sh.cyanRed * wShadow + mid.cyanRed * wMidtone + hi.cyanRed * wHighlight) * 1.25;
    const dG =
      (sh.magentaGreen * wShadow + mid.magentaGreen * wMidtone + hi.magentaGreen * wHighlight) *
      1.25;
    const dB =
      (sh.yellowBlue * wShadow + mid.yellowBlue * wMidtone + hi.yellowBlue * wHighlight) * 1.25;

    let r = clamp(r0 + dR, 0, 255);
    let g = clamp(g0 + dG, 0, 255);
    let b = clamp(b0 + dB, 0, 255);

    if (preserveLuma) {
      const [, , origL] = rgbToHsl(r0, g0, b0);
      const [hNext, sNext] = rgbToHsl(r, g, b);
      const [pr, pg, pb] = hslToRgb(hNext, sNext, origL);
      r = pr;
      g = pg;
      b = pb;
    }

    out[i] = clampByte(r);
    out[i + 1] = clampByte(g);
    out[i + 2] = clampByte(b);
    out[i + 3] = src[i + 3] ?? 255;
  }
  return out;
}

/** 8. 이진화 (`filterbinarization`) */
export function applyCspBinarizationFilter(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  params: CspBinarizationParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const threshold = clamp(params.threshold, 0, 255);
  const preserveAlpha = params.preserveAlpha ?? true;

  for (let i = 0; i < out.length; i += 4) {
    const lum =
      0.299 * (src[i] ?? 0) + 0.587 * (src[i + 1] ?? 0) + 0.114 * (src[i + 2] ?? 0);
    const v = lum >= threshold ? 255 : 0;
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = preserveAlpha ? (src[i + 3] ?? 255) : ((src[i + 3] ?? 255) >= threshold ? 255 : 0);
  }
  return out;
}

/** 9. 그라데이션 맵 (`filtergradientmap`) — 다중 스톱 LUT 매핑 */
export function applyCspGradientMapFilter(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  params: CspGradientMapParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const mixRate = clamp(params.mixRate01 ?? 1, 0, 1);
  const sortedStops: readonly CspGradientMapStop[] =
    params.stops.length >= 2
      ? [...params.stops].sort((a, b) => a.position01 - b.position01)
      : [
          { position01: 0, r: 24, g: 18, b: 36, a: 255 },
          { position01: 0.5, r: 168, g: 98, b: 78, a: 255 },
          { position01: 1, r: 248, g: 236, b: 214, a: 255 },
        ];

  const lutR = new Uint8Array(256);
  const lutG = new Uint8Array(256);
  const lutB = new Uint8Array(256);

  for (let idx = 0; idx < 256; idx += 1) {
    const t = params.reverse ? 1 - idx / 255 : idx / 255;
    let left = sortedStops[0]!;
    let right = sortedStops[sortedStops.length - 1]!;
    for (let s = 0; s < sortedStops.length - 1; s += 1) {
      const curr = sortedStops[s]!;
      const next = sortedStops[s + 1]!;
      if (t >= curr.position01 && t <= next.position01) {
        left = curr;
        right = next;
        break;
      }
    }
    const span = Math.max(1e-6, right.position01 - left.position01);
    const localT = clamp((t - left.position01) / span, 0, 1);
    lutR[idx] = clampByte(left.r + (right.r - left.r) * localT);
    lutG[idx] = clampByte(left.g + (right.g - left.g) * localT);
    lutB[idx] = clampByte(left.b + (right.b - left.b) * localT);
  }

  for (let i = 0; i < out.length; i += 4) {
    const r = src[i] ?? 0;
    const g = src[i + 1] ?? 0;
    const b = src[i + 2] ?? 0;
    const lumIdx = clampByte(0.2126 * r + 0.7152 * g + 0.0722 * b);
    out[i] = clampByte(r * (1 - mixRate) + lutR[lumIdx]! * mixRate);
    out[i + 1] = clampByte(g * (1 - mixRate) + lutG[lumIdx]! * mixRate);
    out[i + 2] = clampByte(b * (1 - mixRate) + lutB[lumIdx]! * mixRate);
    out[i + 3] = src[i + 3] ?? 255;
  }
  return out;
}

/** 10. 휘도를 투명도로 변환 (`editbrightnesstoalpha`) */
export function applyCspBrightnessToOpacityFilter(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < out.length; i += 4) {
    const r = src[i] ?? 0;
    const g = src[i + 1] ?? 0;
    const b = src[i + 2] ?? 0;
    const a = src[i + 3] ?? 255;
    const lum01 = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const inkAlpha = clampByte((1 - lum01) * a);
    out[i] = 0;
    out[i + 1] = 0;
    out[i + 2] = 0;
    out[i + 3] = inkAlpha;
  }
  return out;
}

/** 11. 선 색을 그리기 색으로 변경 (`editchangelinecolor`) */
export function applyCspChangeLineColorToDrawingFilter(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  params: CspChangeLineColorParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const tr = clampByte(params.r);
  const tg = clampByte(params.g);
  const tb = clampByte(params.b);
  const minAlpha = clampByte(params.minAlpha ?? 1);

  for (let i = 0; i < out.length; i += 4) {
    const a = src[i + 3] ?? 0;
    if (a >= minAlpha) {
      out[i] = tr;
      out[i + 1] = tg;
      out[i + 2] = tb;
      out[i + 3] = a;
    } else {
      out[i] = src[i] ?? 0;
      out[i + 1] = src[i + 1] ?? 0;
      out[i + 2] = src[i + 2] ?? 0;
      out[i + 3] = a;
    }
  }
  return out;
}

/** 12. 경계 효과 (`Border Effect`: 테두리 경계 + 수채 경계) */
export function applyCspBorderEffectFilter(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  params: CspBorderEffectParams,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  const radius = clamp(Math.round(params.thicknessPx), 1, 24);
  const opacity = clamp(params.opacity01 ?? 1, 0, 1);

  if (params.mode === "watercolor-edge") {
    const darkness = clamp(params.darkness01 ?? 0.45, 0, 1);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4;
        const a = src[idx + 3] ?? 0;
        if (a === 0) continue;
        let minNeighborA = a;
        for (let dy = -radius; dy <= radius; dy += 1) {
          const ny = clamp(y + dy, 0, height - 1);
          for (let dx = -radius; dx <= radius; dx += 1) {
            if (dx * dx + dy * dy > radius * radius) continue;
            const nx = clamp(x + dx, 0, width - 1);
            const na = src[(ny * width + nx) * 4 + 3] ?? 0;
            if (na < minNeighborA) minNeighborA = na;
          }
        }
        const edgeRatio = (a - minNeighborA) / 255;
        if (edgeRatio > 0.02) {
          const darken = 1 - edgeRatio * darkness * opacity;
          out[idx] = clampByte((src[idx] ?? 0) * darken);
          out[idx + 1] = clampByte((src[idx + 1] ?? 0) * darken);
          out[idx + 2] = clampByte((src[idx + 2] ?? 0) * darken);
        }
      }
    }
    return out;
  }

  // Edge border outline around non-transparent silhouette
  const br = clampByte(params.borderR);
  const bg = clampByte(params.borderG);
  const bb = clampByte(params.borderB);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const srcA = src[idx + 3] ?? 0;
      if (srcA >= 250) continue;

      let maxNeighborA = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dy * dy > radius * radius) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const na = src[(ny * width + nx) * 4 + 3] ?? 0;
          if (na > maxNeighborA) maxNeighborA = na;
        }
      }
      if (maxNeighborA > srcA) {
        const borderAlpha = clampByte(maxNeighborA * opacity);
        const srcRatio = srcA / 255;
        out[idx] = clampByte((src[idx] ?? 0) * srcRatio + br * (1 - srcRatio));
        out[idx + 1] = clampByte((src[idx + 1] ?? 0) * srcRatio + bg * (1 - srcRatio));
        out[idx + 2] = clampByte((src[idx + 2] ?? 0) * srcRatio + bb * (1 - srcRatio));
        out[idx + 3] = Math.max(srcA, borderAlpha);
      }
    }
  }
  return out;
}
