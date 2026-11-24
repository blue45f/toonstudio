/**
 * OKLab/OKLCH · CIE Lab · CIEDE2000(ΔE00) · McCamy 색온도 · Sobel 선화 굵기 · 스크린톤 자기상관 순수 연산 모듈.
 *
 * - 외부 API·스토리지 의존 0건, 100% 온디바이스 결정론적 TypedArray 연산.
 */

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

export interface CieLabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export interface LineartWidthBucket {
  readonly bucketLabel: string;
  readonly minPx: number;
  readonly maxPx: number;
  readonly ratio01: number;
}

export interface LineartWidthDistribution {
  readonly meanPx: number;
  readonly medianPx: number;
  readonly p10Px: number;
  readonly p90Px: number;
  readonly edgeDensity01: number;
  readonly sampleCount: number;
  readonly histogram: readonly LineartWidthBucket[];
}

export interface ScreentonePitchProfile {
  readonly detected: boolean;
  readonly pitchPx: number;
  readonly estimatedLpi: number;
  readonly coverage01: number;
  readonly peakCorrelation: number;
}

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const POW_25_7 = Math.pow(25, 7);

export function clampNum(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function srgbUnitToLinear(c: number): number {
  const u = clampNum(c, 0, 1);
  return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
}

export function linearToSrgbUnit(c: number): number {
  const u = clampNum(c, 0, 1);
  return u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055;
}

/** sRGB [0..255] -> OKLab (Björn Ottosson 표준 행렬). */
export function srgbToOklab(r: number, g: number, b: number): OklabColor {
  const lr = srgbUnitToLinear(r / 255);
  const lg = srgbUnitToLinear(g / 255);
  const lb = srgbUnitToLinear(b / 255);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToOklch(lab: OklabColor): OklchColor {
  const c = Math.hypot(lab.a, lab.b);
  const h = c < 1e-6 ? 0 : (Math.atan2(lab.b, lab.a) * RAD_TO_DEG + 360) % 360;
  return { l: clampNum(lab.l, 0, 1), c, h };
}

export function oklchToOklab(lch: OklchColor): OklabColor {
  const rad = lch.h * DEG_TO_RAD;
  const c = Math.max(0, lch.c);
  return { l: clampNum(lch.l, 0, 1), a: c * Math.cos(rad), b: c * Math.sin(rad) };
}

function oklabToLinearRgbRaw(lVal: number, aVal: number, bVal: number): [number, number, number] {
  const l_ = lVal + 0.3963377774 * aVal + 0.2158037573 * bVal;
  const m_ = lVal - 0.1055613458 * aVal - 0.0638541728 * bVal;
  const s_ = lVal - 0.0894841775 * aVal - 1.291485548 * bVal;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLab -> 색역 안전 sRGB [0..255] (이진 탐색으로 L·색조 유지 채도 축소). */
export function oklabToSrgb(lab: OklabColor): readonly [number, number, number] {
  const lClamped = clampNum(lab.l, 0, 1);
  const [r0, g0, b0] = oklabToLinearRgbRaw(lClamped, lab.a, lab.b);
  if (r0 >= 0 && r0 <= 1 && g0 >= 0 && g0 <= 1 && b0 >= 0 && b0 <= 1) {
    return [
      Math.round(linearToSrgbUnit(r0) * 255),
      Math.round(linearToSrgbUnit(g0) * 255),
      Math.round(linearToSrgbUnit(b0) * 255),
    ];
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 8; i += 1) {
    const mid = (lo + hi) * 0.5;
    const [rm, gm, bm] = oklabToLinearRgbRaw(lClamped, lab.a * mid, lab.b * mid);
    if (rm >= 0 && rm <= 1 && gm >= 0 && gm <= 1 && bm >= 0 && bm <= 1) lo = mid;
    else hi = mid;
  }
  const [rf, gf, bf] = oklabToLinearRgbRaw(lClamped, lab.a * lo, lab.b * lo);
  return [
    Math.round(linearToSrgbUnit(rf) * 255),
    Math.round(linearToSrgbUnit(gf) * 255),
    Math.round(linearToSrgbUnit(bf) * 255),
  ];
}

export function srgbToOklch(r: number, g: number, b: number): OklchColor {
  return oklabToOklch(srgbToOklab(r, g, b));
}

export function oklchToSrgb(lch: OklchColor): readonly [number, number, number] {
  return oklabToSrgb(oklchToOklab(lch));
}

/** sRGB [0..255] -> CIE Lab (D65 2°). */
export function srgbToCieLab(r: number, g: number, b: number): CieLabColor {
  const lr = srgbUnitToLinear(r / 255);
  const lg = srgbUnitToLinear(g / 255);
  const lb = srgbUnitToLinear(b / 255);
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047;
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb;
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Sharma et al. (2005) 표준 CIEDE2000(ΔE00) 지각 색차 계산. */
export function computeCiede2000(lab1: CieLabColor, lab2: CieLabColor): number {
  const c1 = Math.hypot(lab1.a, lab1.b);
  const c2 = Math.hypot(lab2.a, lab2.b);
  const cBar7 = Math.pow((c1 + c2) * 0.5, 7);
  const gFactor = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + POW_25_7)));
  const a1p = (1 + gFactor) * lab1.a;
  const a2p = (1 + gFactor) * lab2.a;
  const c1p = Math.hypot(a1p, lab1.b);
  const c2p = Math.hypot(a2p, lab2.b);
  const hueDeg = (ap: number, b: number): number =>
    Math.abs(ap) < 1e-9 && Math.abs(b) < 1e-9 ? 0 : (Math.atan2(b, ap) * RAD_TO_DEG + 360) % 360;
  const h1p = hueDeg(a1p, lab1.b);
  const h2p = hueDeg(a2p, lab2.b);

  const dLp = lab2.l - lab1.l;
  const dCp = c2p - c1p;
  let dhp = 0;
  if (c1p * c2p !== 0) {
    const diff = h2p - h1p;
    dhp = Math.abs(diff) <= 180 ? diff : diff > 180 ? diff - 360 : diff + 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(dhp * 0.5 * DEG_TO_RAD);

  const lBarP = (lab1.l + lab2.l) * 0.5;
  const cBarP = (c1p + c2p) * 0.5;
  let hBarP = h1p + h2p;
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hBarP = (h1p + h2p) * 0.5;
    else hBarP = h1p + h2p < 360 ? (h1p + h2p + 360) * 0.5 : (h1p + h2p - 360) * 0.5;
  }

  const tFactor =
    1 -
    0.17 * Math.cos((hBarP - 30) * DEG_TO_RAD) +
    0.24 * Math.cos(2 * hBarP * DEG_TO_RAD) +
    0.32 * Math.cos((3 * hBarP + 6) * DEG_TO_RAD) -
    0.2 * Math.cos((4 * hBarP - 63) * DEG_TO_RAD);
  const dTheta = 30 * Math.exp(-Math.pow((hBarP - 275) / 25, 2));
  const cBarP7 = Math.pow(cBarP, 7);
  const rC = 2 * Math.sqrt(cBarP7 / (cBarP7 + POW_25_7));
  const lBarMinus50Sq = Math.pow(lBarP - 50, 2);
  const sL = 1 + (0.015 * lBarMinus50Sq) / Math.sqrt(20 + lBarMinus50Sq);
  const sC = 1 + 0.045 * cBarP;
  const sH = 1 + 0.015 * cBarP * tFactor;
  const rT = -Math.sin(2 * dTheta * DEG_TO_RAD) * rC;

  const tL = dLp / sL;
  const tC = dCp / sC;
  const tH = dHp / sH;
  return Math.sqrt(tL * tL + tC * tC + tH * tH + rT * tC * tH);
}

/** McCamy (1992) 근사식으로 CIE XYZ 합에서 상관 색온도(Kelvin) 추정. */
export function estimateKelvinFromXyz(xSum: number, ySum: number, zSum: number): number {
  const total = xSum + ySum + zSum;
  if (total <= 1e-6) return 6500;
  const x = xSum / total;
  const y = ySum / total;
  const denom = 0.1858 - y;
  const safeDenom = Math.abs(denom) < 1e-4 ? -0.14 : denom;
  const n = (x - 0.332) / safeDenom;
  const cct = 449 * n * n * n + 3525 * n * n + 6823.3 * n + 5520.33;
  return Math.round(clampNum(cct, 2600, 11000));
}

export function quantileSorted(sorted: Float32Array, q: number): number {
  if (sorted.length === 0) return 0;
  const idx = clampNum(Math.floor(q * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx] ?? 0;
}

export function computeSobelMagnitude(luma: Float32Array, w: number, h: number): Float32Array {
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y += 1) {
    const rU = (y - 1) * w;
    const rM = y * w;
    const rD = (y + 1) * w;
    for (let x = 1; x < w - 1; x += 1) {
      const gx =
        -(luma[rU + x - 1] ?? 0) + (luma[rU + x + 1] ?? 0) -
        2 * (luma[rM + x - 1] ?? 0) + 2 * (luma[rM + x + 1] ?? 0) -
        (luma[rD + x - 1] ?? 0) + (luma[rD + x + 1] ?? 0);
      const gy =
        -(luma[rU + x - 1] ?? 0) - 2 * (luma[rU + x] ?? 0) - (luma[rU + x + 1] ?? 0) +
        (luma[rD + x - 1] ?? 0) + 2 * (luma[rD + x] ?? 0) + (luma[rD + x + 1] ?? 0);
      mag[rM + x] = Math.hypot(gx, gy);
    }
  }
  return mag;
}

export function analyzeLineartWidth(luma: Float32Array, edgeMag: Float32Array, w: number, h: number): LineartWidthDistribution {
  const runs: number[] = [];
  let edgeCount = 0;
  const inkLumaMax = 0.27;
  const edgeThresh = 0.45;
  const maxRunPx = 14;

  const scanAxis = (outerMax: number, innerMax: number, indexAt: (o: number, i: number) => number, countEdge: boolean): void => {
    for (let o = 1; o < outerMax - 1; o += 1) {
      let run = 0;
      let hasEdge = false;
      for (let i = 1; i < innerMax - 1; i += 1) {
        const idx = indexAt(o, i);
        const isEdge = (edgeMag[idx] ?? 0) >= edgeThresh;
        if (countEdge && isEdge) edgeCount += 1;
        if ((luma[idx] ?? 1) <= inkLumaMax) {
          run += 1;
          if (isEdge) hasEdge = true;
        } else {
          if (run >= 1 && run <= maxRunPx && hasEdge) runs.push(run);
          run = 0;
          hasEdge = false;
        }
      }
      if (run >= 1 && run <= maxRunPx && hasEdge) runs.push(run);
    }
  };

  scanAxis(h, w, (y, x) => y * w + x, true);
  scanAxis(w, h, (x, y) => y * w + x, false);

  const edgeDensity01 = round3(edgeCount / Math.max(1, (w - 2) * (h - 2)));
  if (runs.length === 0) {
    return {
      meanPx: 1.5, medianPx: 1.5, p10Px: 1, p90Px: 2, edgeDensity01, sampleCount: 0,
      histogram: [
        { bucketLabel: "세선 (1–2px)", minPx: 1, maxPx: 2, ratio01: 1 },
        { bucketLabel: "표준 (2–4px)", minPx: 2, maxPx: 4, ratio01: 0 },
        { bucketLabel: "강약 (4–7px)", minPx: 4, maxPx: 7, ratio01: 0 },
        { bucketLabel: "굵은 먹선 (7px+)", minPx: 7, maxPx: 14, ratio01: 0 },
      ],
    };
  }

  const sorted = Float32Array.from(runs).sort();
  let sum = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    const v = sorted[i] ?? 1;
    sum += v;
    if (v <= 2) b1 += 1;
    else if (v <= 4) b2 += 1;
    else if (v <= 7) b3 += 1;
    else b4 += 1;
  }
  const n = sorted.length;
  return {
    meanPx: round2(sum / n),
    medianPx: round2(quantileSorted(sorted, 0.5)),
    p10Px: round2(quantileSorted(sorted, 0.1)),
    p90Px: round2(quantileSorted(sorted, 0.9)),
    edgeDensity01,
    sampleCount: n,
    histogram: [
      { bucketLabel: "세선 (1–2px)", minPx: 1, maxPx: 2, ratio01: round3(b1 / n) },
      { bucketLabel: "표준 (2–4px)", minPx: 2, maxPx: 4, ratio01: round3(b2 / n) },
      { bucketLabel: "강약 (4–7px)", minPx: 4, maxPx: 7, ratio01: round3(b3 / n) },
      { bucketLabel: "굵은 먹선 (7px+)", minPx: 7, maxPx: 14, ratio01: round3(b4 / n) },
    ],
  };
}

/** 중간톤 영역의 로컬 고주파 자기상관으로 스크린톤 피치(px/LPI) 탐지. */
export function detectScreentonePitch(luma: Float32Array, w: number, h: number): ScreentonePitchProfile {
  const minLag = 3;
  const maxLag = Math.min(12, Math.floor(Math.min(w, h) / 4));
  if (maxLag < minLag) {
    return { detected: false, pitchPx: 0, estimatedLpi: 0, coverage01: 0, peakCorrelation: 0 };
  }

  const hp = new Float32Array(w * h);
  let midCount = 0;
  let hpVar = 0;
  let toneActive = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const idx = y * w + x;
      const v = luma[idx] ?? 0;
      if (v < 0.2 || v > 0.85) continue;
      midCount += 1;
      const localAvg = ((luma[idx - 1] ?? v) + (luma[idx + 1] ?? v) + (luma[idx - w] ?? v) + (luma[idx + w] ?? v)) * 0.25;
      const diff = v - localAvg;
      hp[idx] = diff;
      hpVar += diff * diff;
      if (Math.abs(diff) > 0.045) toneActive += 1;
    }
  }
  if (midCount < 32 || hpVar < 0.05 || toneActive / midCount < 0.05) {
    return { detected: false, pitchPx: 0, estimatedLpi: 0, coverage01: 0, peakCorrelation: 0 };
  }

  let bestLag = 0;
  let bestCorr = -1;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let dot = 0;
    let norm = 0;
    for (let y = 1; y < h - 1 - lag; y += 1) {
      for (let x = 1; x < w - 1 - lag; x += 1) {
        const a = hp[y * w + x] ?? 0;
        dot += a * ((hp[y * w + x + lag] ?? 0) + (hp[(y + lag) * w + x] ?? 0));
        norm += 2 * a * a;
      }
    }
    const corr = norm > 1e-6 ? dot / norm : 0;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  const detected = bestCorr >= 0.28 && bestLag >= minLag;
  return {
    detected,
    pitchPx: detected ? bestLag : 0,
    estimatedLpi: detected ? Math.round(300 / bestLag) : 0,
    coverage01: detected ? round3(clampNum(toneActive / midCount, 0, 1)) : 0,
    peakCorrelation: round3(Math.max(0, bestCorr)),
  };
}
