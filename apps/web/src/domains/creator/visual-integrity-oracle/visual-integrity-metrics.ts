/**
 * visual-integrity-metrics.ts
 *
 * 실제 RGBA8 타일 버퍼 대상 4대 핵심 시각 무결성 수학 커널 + 고주파 질감 에너지 측정기.
 * ① SSIM (0..1, Wang et al. 2004 — 휘도·대비·구조 3항)
 * ② CIEDE2000 ΔE (sRGB → D65 XYZ → CIELAB → Sharma et al. 2005 ΔE00 평균·p95·최대)
 * ③ PSNR (dB), RMSE, RGB RMSE, maxAbsDiff 및 채널별 편차
 * ④ 프리멀티플라이 알파 헤일로(어두운 테두리 아티팩트 · RGB>A 오버플로) 탐지기
 */

export type RgbaAlphaMode = "straight" | "premultiplied";

export interface RgbaTileBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
  readonly alphaMode?: RgbaAlphaMode;
  readonly label?: string;
}

export interface XyzColor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface LabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export interface SsimResult {
  readonly score: number;
  readonly luminance: number;
  readonly contrast: number;
  readonly structure: number;
  readonly minWindowSsim: number;
  readonly windowSize: number;
  readonly windowCount: number;
}

export interface Ciede2000TileResult {
  readonly meanDeltaE: number;
  readonly p95DeltaE: number;
  readonly maxDeltaE: number;
  readonly jndExceedCount: number;
  readonly jndExceedRatio: number;
  readonly worstPixel: Readonly<{ x: number; y: number; deltaE: number }>;
}

export interface PsnrPixelErrorResult {
  readonly psnrDb: number;
  readonly mse: number;
  readonly rmse: number;
  readonly rgbRmse: number;
  readonly maxAbsDiff: number;
  readonly alphaMaxAbsDiff: number;
  readonly channelMaxAbsDiff: Readonly<{ r: number; g: number; b: number; a: number }>;
  readonly changedPixelCount: number;
  readonly changedPixelRatio: number;
  readonly isBitExact: boolean;
}

export interface AlphaHaloHotspot {
  readonly x: number;
  readonly y: number;
  readonly alpha: number;
  readonly darkeningRatio: number;
  readonly luminanceDip: number;
}

export interface AlphaHaloAuditResult {
  readonly detected: boolean;
  readonly severity: "none" | "warn" | "fail";
  readonly edgePixelCount: number;
  readonly haloPixelCount: number;
  readonly haloPixelRatio: number;
  readonly meanDarkeningRatio: number;
  readonly maxLuminanceDip: number;
  readonly overflowPixelCount: number;
  readonly hotspotCoordinates: readonly AlphaHaloHotspot[];
}

export const ORACLE_DEFAULT_BACKDROP_RGB: readonly [number, number, number] = Object.freeze([255, 255, 255]);
export const ORACLE_HALO_RATIO_PASS_MAX = 0.02;
export const ORACLE_HALO_RATIO_WARN_MAX = 0.08;
export const ORACLE_HALO_DIP_WARN_MIN = 10;
export const ORACLE_HALO_DIP_FAIL_MIN = 22;

const SSIM_C1 = 6.5025; // (0.01 * 255)^2
const SSIM_C2 = 58.5225; // (0.03 * 255)^2
const SSIM_C3 = SSIM_C2 * 0.5;
const D65_XN = 0.95047;
const D65_YN = 1.0;
const D65_ZN = 1.08883;
const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;
const POW_25_7 = 25 ** 7;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const CIE_JND_DELTA_E = 2.3;

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function clampByte(value: number): number {
  return Math.round(clampNumber(value, 0, 255));
}

export function byteAt(data: Uint8Array | Uint8ClampedArray, index: number): number {
  return data[index] ?? 0;
}

export function assertValidTileBuffer(buffer: RgbaTileBuffer, name: string): void {
  if (!Number.isInteger(buffer.width) || buffer.width <= 0) {
    throw new Error(`${name}: width must be a positive integer (got ${buffer.width})`);
  }
  if (!Number.isInteger(buffer.height) || buffer.height <= 0) {
    throw new Error(`${name}: height must be a positive integer (got ${buffer.height})`);
  }
  const expected = buffer.width * buffer.height * 4;
  if (buffer.data.length !== expected) {
    throw new Error(`${name}: RGBA buffer length mismatch (expected ${expected}, got ${buffer.data.length})`);
  }
}

export function assertMatchingBuffers(reference: RgbaTileBuffer, candidate: RgbaTileBuffer): void {
  assertValidTileBuffer(reference, "reference");
  assertValidTileBuffer(candidate, "candidate");
  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    throw new Error(
      `Buffer dimensions mismatch: reference ${reference.width}x${reference.height} vs candidate ${candidate.width}x${candidate.height}`,
    );
  }
}

function compositePixelOverBackdrop(
  r: number,
  g: number,
  b: number,
  a: number,
  alphaMode: RgbaAlphaMode,
  backdrop: readonly [number, number, number],
): readonly [number, number, number] {
  const alpha01 = a / 255;
  const invAlpha = 1 - alpha01;
  if (alphaMode === "premultiplied") {
    return [
      clampNumber(r + backdrop[0] * invAlpha, 0, 255),
      clampNumber(g + backdrop[1] * invAlpha, 0, 255),
      clampNumber(b + backdrop[2] * invAlpha, 0, 255),
    ];
  }
  return [
    r * alpha01 + backdrop[0] * invAlpha,
    g * alpha01 + backdrop[1] * invAlpha,
    b * alpha01 + backdrop[2] * invAlpha,
  ];
}

function rgbToLuma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function buildLuminancePlane(
  buffer: RgbaTileBuffer,
  backdrop: readonly [number, number, number],
): Float64Array {
  const pixelCount = buffer.width * buffer.height;
  const luma = new Float64Array(pixelCount);
  const mode = buffer.alphaMode ?? "straight";
  const data = buffer.data;
  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    const [cr, cg, cb] = compositePixelOverBackdrop(
      byteAt(data, off),
      byteAt(data, off + 1),
      byteAt(data, off + 2),
      byteAt(data, off + 3),
      mode,
      backdrop,
    );
    luma[i] = rgbToLuma(cr, cg, cb);
  }
  return luma;
}

function buildGaussianWeights2d(winW: number, winH: number, sigma = 1.5): Float64Array {
  const weights = new Float64Array(winW * winH);
  const cx = (winW - 1) * 0.5;
  const cy = (winH - 1) * 0.5;
  const denom = 2 * sigma * sigma;
  let sum = 0;
  for (let y = 0; y < winH; y += 1) {
    for (let x = 0; x < winW; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const w = Math.exp(-(dx * dx + dy * dy) / denom);
      weights[y * winW + x] = w;
      sum += w;
    }
  }
  const invSum = sum > 0 ? 1 / sum : 1;
  for (let i = 0; i < weights.length; i += 1) {
    weights[i] = (weights[i] ?? 0) * invSum;
  }
  return weights;
}

function collectWindowStarts(extent: number, winSize: number, stride: number): readonly number[] {
  if (extent <= winSize) return [0];
  const starts: number[] = [];
  const last = extent - winSize;
  for (let p = 0; p < last; p += stride) starts.push(p);
  starts.push(last);
  return starts;
}

export function computeSsimOnSubrect(
  refLuma: Float64Array,
  candLuma: Float64Array,
  fullWidth: number,
  originX: number,
  originY: number,
  rectWidth: number,
  rectHeight: number,
  requestedWindowSize: number,
  requestedStride?: number,
): SsimResult {
  const winW = Math.max(1, Math.min(Math.trunc(requestedWindowSize), rectWidth));
  const winH = Math.max(1, Math.min(Math.trunc(requestedWindowSize), rectHeight));
  const stride = Math.max(1, Math.trunc(requestedStride ?? Math.max(1, Math.floor(Math.min(winW, winH) / 2))));
  const weights = buildGaussianWeights2d(winW, winH);
  const xs = collectWindowStarts(rectWidth, winW, stride);
  const ys = collectWindowStarts(rectHeight, winH, stride);

  let sumScore = 0;
  let sumL = 0;
  let sumC = 0;
  let sumS = 0;
  let minWindowSsim = 1;
  let count = 0;

  for (const wy of ys) {
    for (const wx of xs) {
      let muX = 0;
      let muY = 0;
      let wi = 0;
      for (let dy = 0; dy < winH; dy += 1) {
        const rowOff = (originY + wy + dy) * fullWidth + (originX + wx);
        for (let dx = 0; dx < winW; dx += 1) {
          const w = weights[wi] ?? 0;
          muX += w * (refLuma[rowOff + dx] ?? 0);
          muY += w * (candLuma[rowOff + dx] ?? 0);
          wi += 1;
        }
      }

      let varX = 0;
      let varY = 0;
      let covXY = 0;
      wi = 0;
      for (let dy = 0; dy < winH; dy += 1) {
        const rowOff = (originY + wy + dy) * fullWidth + (originX + wx);
        for (let dx = 0; dx < winW; dx += 1) {
          const w = weights[wi] ?? 0;
          const diffX = (refLuma[rowOff + dx] ?? 0) - muX;
          const diffY = (candLuma[rowOff + dx] ?? 0) - muY;
          varX += w * diffX * diffX;
          varY += w * diffY * diffY;
          covXY += w * diffX * diffY;
          wi += 1;
        }
      }

      const sigmaX = Math.sqrt(Math.max(0, varX));
      const sigmaY = Math.sqrt(Math.max(0, varY));
      const lTerm = (2 * muX * muY + SSIM_C1) / (muX * muX + muY * muY + SSIM_C1);
      const cTerm = (2 * sigmaX * sigmaY + SSIM_C2) / (varX + varY + SSIM_C2);
      const sTerm = (covXY + SSIM_C3) / (sigmaX * sigmaY + SSIM_C3);
      const ssimVal = clampNumber(lTerm * cTerm * sTerm, 0, 1);

      sumL += lTerm;
      sumC += cTerm;
      sumS += sTerm;
      sumScore += ssimVal;
      if (ssimVal < minWindowSsim) minWindowSsim = ssimVal;
      count += 1;
    }
  }

  const denom = Math.max(1, count);
  return {
    score: clampNumber(sumScore / denom, 0, 1),
    luminance: clampNumber(sumL / denom, 0, 1),
    contrast: clampNumber(sumC / denom, 0, 1),
    structure: clampNumber(sumS / denom, -1, 1),
    minWindowSsim: clampNumber(minWindowSsim, 0, 1),
    windowSize: Math.min(winW, winH),
    windowCount: count,
  };
}

/** ① 구조적 유사도 SSIM (0..1, 휘도·대비·구조 3항 분리 산출). */
export function computeSsim(
  reference: RgbaTileBuffer,
  candidate: RgbaTileBuffer,
  options?: Readonly<{
    windowSize?: number;
    stride?: number;
    backdropRgb?: readonly [number, number, number];
  }>,
): SsimResult {
  assertMatchingBuffers(reference, candidate);
  const backdrop = options?.backdropRgb ?? ORACLE_DEFAULT_BACKDROP_RGB;
  const refLuma = buildLuminancePlane(reference, backdrop);
  const candLuma = buildLuminancePlane(candidate, backdrop);
  return computeSsimOnSubrect(
    refLuma,
    candLuma,
    reference.width,
    0,
    0,
    reference.width,
    reference.height,
    options?.windowSize ?? 8,
    options?.stride,
  );
}

function srgbChannelToLinear(channel8: number): number {
  const c = clampNumber(channel8, 0, 255) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** sRGB (0..255) → CIE XYZ (D65, 2°). */
export function srgbToXyz(r: number, g: number, b: number): XyzColor {
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);
  return {
    x: 0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl,
    y: 0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl,
    z: 0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl,
  };
}

function labTransfer(t: number): number {
  return t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;
}

/** CIE XYZ (D65) → CIELAB (L*, a*, b*). */
export function xyzToLab(xyz: XyzColor): LabColor {
  const fx = labTransfer(xyz.x / D65_XN);
  const fy = labTransfer(xyz.y / D65_YN);
  const fz = labTransfer(xyz.z / D65_ZN);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** sRGB (0..255) → CIELAB (D65). */
export function srgbToLab(r: number, g: number, b: number): LabColor {
  return xyzToLab(srgbToXyz(r, g, b));
}

/** ② CIE/Sharma-Wu-Dalal (2005) 표준 CIEDE2000 ΔE00 계산. */
export function computeCiede2000(
  lab1: LabColor,
  lab2: LabColor,
  weights?: Readonly<{ kL?: number; kC?: number; kH?: number }>,
): number {
  const kL = weights?.kL ?? 1;
  const kC = weights?.kC ?? 1;
  const kH = weights?.kH ?? 1;

  const c1 = Math.hypot(lab1.a, lab1.b);
  const c2 = Math.hypot(lab2.a, lab2.b);
  const cBar = (c1 + c2) * 0.5;
  const cBar7 = cBar ** 7;
  const gFactor = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + POW_25_7)));

  const a1p = (1 + gFactor) * lab1.a;
  const a2p = (1 + gFactor) * lab2.a;
  const c1p = Math.hypot(a1p, lab1.b);
  const c2p = Math.hypot(a2p, lab2.b);

  const hueDeg = (bp: number, ap: number): number => {
    if (bp === 0 && ap === 0) return 0;
    const deg = Math.atan2(bp, ap) * RAD_TO_DEG;
    return deg >= 0 ? deg : deg + 360;
  };
  const h1p = hueDeg(lab1.b, a1p);
  const h2p = hueDeg(lab2.b, a2p);

  const deltaLp = lab2.l - lab1.l;
  const deltaCp = c2p - c1p;
  const cProd = c1p * c2p;

  let deltahp = 0;
  if (cProd !== 0) {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) deltahp = diff;
    else if (diff > 180) deltahp = diff - 360;
    else deltahp = diff + 360;
  }
  const deltaHp = 2 * Math.sqrt(cProd) * Math.sin((deltahp * 0.5) * DEG_TO_RAD);

  const lBarP = (lab1.l + lab2.l) * 0.5;
  const cBarP = (c1p + c2p) * 0.5;
  let hBarP = h1p + h2p;
  if (cProd !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hBarP = (h1p + h2p) * 0.5;
    else if (h1p + h2p < 360) hBarP = (h1p + h2p + 360) * 0.5;
    else hBarP = (h1p + h2p - 360) * 0.5;
  }

  const tVal =
    1
    - 0.17 * Math.cos((hBarP - 30) * DEG_TO_RAD)
    + 0.24 * Math.cos(2 * hBarP * DEG_TO_RAD)
    + 0.32 * Math.cos((3 * hBarP + 6) * DEG_TO_RAD)
    - 0.2 * Math.cos((4 * hBarP - 63) * DEG_TO_RAD);

  const deltaTheta = 30 * Math.exp(-(((hBarP - 275) / 25) ** 2));
  const cBarP7 = cBarP ** 7;
  const rC = 2 * Math.sqrt(cBarP7 / (cBarP7 + POW_25_7));
  const lBarOffsetSq = (lBarP - 50) ** 2;
  const sL = 1 + (0.015 * lBarOffsetSq) / Math.sqrt(20 + lBarOffsetSq);
  const sC = 1 + 0.045 * cBarP;
  const sH = 1 + 0.015 * cBarP * tVal;
  const rT = -Math.sin(2 * deltaTheta * DEG_TO_RAD) * rC;

  const termL = deltaLp / (kL * sL);
  const termC = deltaCp / (kC * sC);
  const termH = deltaHp / (kH * sH);
  return Math.sqrt(Math.max(0, termL * termL + termC * termC + termH * termH + rT * termC * termH));
}

function percentileLinear(sortedValues: Float64Array, p01: number): number {
  const n = sortedValues.length;
  if (n === 0) return 0;
  if (n === 1) return sortedValues[0] ?? 0;
  const pos = clampNumber(p01, 0, 1) * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(n - 1, Math.ceil(pos));
  const frac = pos - lo;
  return (sortedValues[lo] ?? 0) * (1 - frac) + (sortedValues[hi] ?? 0) * frac;
}

export function computeDeltaEMap(
  reference: RgbaTileBuffer,
  candidate: RgbaTileBuffer,
  backdrop: readonly [number, number, number],
): Float64Array {
  const pixelCount = reference.width * reference.height;
  const map = new Float64Array(pixelCount);
  const refMode = reference.alphaMode ?? "straight";
  const candMode = candidate.alphaMode ?? "straight";
  const sameMode = refMode === candMode;
  const rData = reference.data;
  const cData = candidate.data;

  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    const r1 = byteAt(rData, off);
    const g1 = byteAt(rData, off + 1);
    const b1 = byteAt(rData, off + 2);
    const a1 = byteAt(rData, off + 3);
    const r2 = byteAt(cData, off);
    const g2 = byteAt(cData, off + 1);
    const b2 = byteAt(cData, off + 2);
    const a2 = byteAt(cData, off + 3);
    if (sameMode && r1 === r2 && g1 === g2 && b1 === b2 && a1 === a2) {
      map[i] = 0;
      continue;
    }
    const [cr1, cg1, cb1] = compositePixelOverBackdrop(r1, g1, b1, a1, refMode, backdrop);
    const [cr2, cg2, cb2] = compositePixelOverBackdrop(r2, g2, b2, a2, candMode, backdrop);
    map[i] = computeCiede2000(srgbToLab(cr1, cg1, cb1), srgbToLab(cr2, cg2, cb2));
  }
  return map;
}

export function summarizeDeltaEMap(map: Float64Array, width: number): Ciede2000TileResult {
  const n = map.length;
  let sum = 0;
  let maxDeltaE = 0;
  let worstIndex = 0;
  let jndExceedCount = 0;
  for (let i = 0; i < n; i += 1) {
    const v = map[i] ?? 0;
    sum += v;
    if (v > CIE_JND_DELTA_E) jndExceedCount += 1;
    if (v > maxDeltaE) {
      maxDeltaE = v;
      worstIndex = i;
    }
  }
  const sorted = new Float64Array(map);
  sorted.sort();
  return {
    meanDeltaE: n > 0 ? sum / n : 0,
    p95DeltaE: percentileLinear(sorted, 0.95),
    maxDeltaE,
    jndExceedCount,
    jndExceedRatio: n > 0 ? jndExceedCount / n : 0,
    worstPixel: { x: worstIndex % width, y: Math.floor(worstIndex / width), deltaE: maxDeltaE },
  };
}

/** ② 타일 버퍼 단위 지각 색차 CIEDE2000 (평균·p95·최대·JND 초과율). */
export function evaluateCiede2000Tile(
  reference: RgbaTileBuffer,
  candidate: RgbaTileBuffer,
  options?: Readonly<{ backdropRgb?: readonly [number, number, number] }>,
): Ciede2000TileResult {
  assertMatchingBuffers(reference, candidate);
  const backdrop = options?.backdropRgb ?? ORACLE_DEFAULT_BACKDROP_RGB;
  return summarizeDeltaEMap(computeDeltaEMap(reference, candidate, backdrop), reference.width);
}

/** ③ PSNR (dB) 및 최대 절대 픽셀 오차(maxAbsDiff, RMSE). */
export function evaluatePsnrAndPixelError(
  reference: RgbaTileBuffer,
  candidate: RgbaTileBuffer,
): PsnrPixelErrorResult {
  assertMatchingBuffers(reference, candidate);
  const pixelCount = reference.width * reference.height;
  const rData = reference.data;
  const cData = candidate.data;

  let sumSqAll = 0;
  let sumSqRgb = 0;
  let maxR = 0;
  let maxG = 0;
  let maxB = 0;
  let maxA = 0;
  let changedPixelCount = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    const dr = Math.abs(byteAt(rData, off) - byteAt(cData, off));
    const dg = Math.abs(byteAt(rData, off + 1) - byteAt(cData, off + 1));
    const db = Math.abs(byteAt(rData, off + 2) - byteAt(cData, off + 2));
    const da = Math.abs(byteAt(rData, off + 3) - byteAt(cData, off + 3));

    if (dr > maxR) maxR = dr;
    if (dg > maxG) maxG = dg;
    if (db > maxB) maxB = db;
    if (da > maxA) maxA = da;
    if (dr !== 0 || dg !== 0 || db !== 0 || da !== 0) changedPixelCount += 1;

    const rgbSq = dr * dr + dg * dg + db * db;
    sumSqRgb += rgbSq;
    sumSqAll += rgbSq + da * da;
  }

  const mse = sumSqAll / (pixelCount * 4);
  const rmse = Math.sqrt(mse);
  const rgbRmse = Math.sqrt(sumSqRgb / (pixelCount * 3));
  const maxAbsDiff = Math.max(maxR, maxG, maxB, maxA);
  const psnrDb = mse === 0 ? Number.POSITIVE_INFINITY : 10 * Math.log10((255 * 255) / mse);

  return {
    psnrDb,
    mse,
    rmse,
    rgbRmse,
    maxAbsDiff,
    alphaMaxAbsDiff: maxA,
    channelMaxAbsDiff: { r: maxR, g: maxG, b: maxB, a: maxA },
    changedPixelCount,
    changedPixelRatio: changedPixelCount / pixelCount,
    isBitExact: maxAbsDiff === 0,
  };
}

function unpremultiplyLuma(
  data: Uint8Array | Uint8ClampedArray,
  off: number,
  mode: RgbaAlphaMode,
): number {
  const r = byteAt(data, off);
  const g = byteAt(data, off + 1);
  const b = byteAt(data, off + 2);
  const a = byteAt(data, off + 3);
  if (mode === "premultiplied" && a > 0) {
    const scale = 255 / a;
    return rgbToLuma(Math.min(255, r * scale), Math.min(255, g * scale), Math.min(255, b * scale));
  }
  return rgbToLuma(r, g, b);
}

/** ④ 프리멀티플라이 알파 헤일로(어두운 테두리 아티팩트) 탐지기. */
export function detectPremultipliedAlphaHalo(
  buffer: RgbaTileBuffer,
  options?: Readonly<{
    reference?: RgbaTileBuffer;
    darkeningRatioThreshold?: number;
    minCoreLuminance?: number;
    maxHotspots?: number;
    haloRatioPassMax?: number;
    haloRatioWarnMax?: number;
    haloDipWarnMin?: number;
    haloDipFailMin?: number;
  }>,
): AlphaHaloAuditResult {
  assertValidTileBuffer(buffer, "buffer");
  if (options?.reference) assertMatchingBuffers(options.reference, buffer);
  const { width, height, data } = buffer;
  const mode = buffer.alphaMode ?? "straight";
  const refData = options?.reference?.data;
  const refMode = options?.reference?.alphaMode ?? "straight";
  const darkeningThreshold = options?.darkeningRatioThreshold ?? 0.22;
  const minCoreLuma = options?.minCoreLuminance ?? 50;
  const maxHotspots = options?.maxHotspots ?? 12;
  const ratioPassMax = options?.haloRatioPassMax ?? ORACLE_HALO_RATIO_PASS_MAX;
  const ratioWarnMax = options?.haloRatioWarnMax ?? ORACLE_HALO_RATIO_WARN_MAX;
  const dipWarnMin = options?.haloDipWarnMin ?? ORACLE_HALO_DIP_WARN_MIN;
  const dipFailMin = options?.haloDipFailMin ?? ORACLE_HALO_DIP_FAIL_MIN;

  const pixelCount = width * height;
  const straightLuma = new Float64Array(pixelCount);
  const alphas = new Uint8Array(pixelCount);
  let overflowPixelCount = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    const r = byteAt(data, off);
    const g = byteAt(data, off + 1);
    const b = byteAt(data, off + 2);
    const a = byteAt(data, off + 3);
    alphas[i] = a;
    if (mode === "premultiplied" && (r > a + 1 || g > a + 1 || b > a + 1)) {
      overflowPixelCount += 1;
    }
    straightLuma[i] = unpremultiplyLuma(data, off, mode);
  }

  let edgePixelCount = 0;
  let haloPixelCount = 0;
  let darkeningSum = 0;
  let maxLuminanceDip = 0;
  const hotspots: AlphaHaloHotspot[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const a = alphas[idx] ?? 0;
      if (a < 10 || a > 235) continue;

      let coreWeightSum = 0;
      let coreLumaSum = 0;
      const minCoreNbrA = Math.max(150, Math.min(216, a + 36));
      for (let ny = Math.max(0, y - 2); ny <= Math.min(height - 1, y + 2); ny += 1) {
        for (let nx = Math.max(0, x - 2); nx <= Math.min(width - 1, x + 2); nx += 1) {
          if (nx === x && ny === y) continue;
          const nIdx = ny * width + nx;
          const na = alphas[nIdx] ?? 0;
          if (na < minCoreNbrA) continue;
          coreWeightSum += na;
          coreLumaSum += (straightLuma[nIdx] ?? 0) * na;
        }
      }
      if (coreWeightSum <= 0) continue;

      const coreLuma = coreLumaSum / coreWeightSum;
      if (coreLuma < minCoreLuma) continue;
      edgePixelCount += 1;

      const edgeLuma = straightLuma[idx] ?? 0;
      const lumaDrop = coreLuma - edgeLuma;
      const darkeningRatio = lumaDrop / coreLuma;
      const alpha01 = a / 255;
      const compWhiteLuma = alpha01 * edgeLuma + (1 - alpha01) * 255;
      const dipBelowCore = Math.max(0, coreLuma - compWhiteLuma);

      if (refData) {
        const refEdgeLuma = unpremultiplyLuma(refData, idx * 4, refMode);
        if (refEdgeLuma - edgeLuma < 12) continue;
      }

      if (darkeningRatio >= darkeningThreshold && lumaDrop >= 18) {
        haloPixelCount += 1;
        darkeningSum += darkeningRatio;
        if (dipBelowCore > maxLuminanceDip) maxLuminanceDip = dipBelowCore;
        hotspots.push({ x, y, alpha: a, darkeningRatio, luminanceDip: dipBelowCore });
      }
    }
  }

  hotspots.sort((a, b) => (b.luminanceDip - a.luminanceDip) || (b.darkeningRatio - a.darkeningRatio));
  const haloPixelRatio = edgePixelCount > 0 ? haloPixelCount / edgePixelCount : 0;
  const meanDarkeningRatio = haloPixelCount > 0 ? darkeningSum / haloPixelCount : 0;

  let severity: "none" | "warn" | "fail" = "none";
  if (
    overflowPixelCount > 0
    || haloPixelRatio > ratioWarnMax
    || maxLuminanceDip >= dipFailMin
    || (haloPixelCount >= 8 && meanDarkeningRatio >= 0.3)
  ) {
    severity = "fail";
  } else if (
    haloPixelCount > 0
    && (haloPixelRatio > ratioPassMax || maxLuminanceDip >= dipWarnMin || meanDarkeningRatio >= darkeningThreshold)
  ) {
    severity = "warn";
  }

  return {
    detected: severity !== "none",
    severity,
    edgePixelCount,
    haloPixelCount,
    haloPixelRatio,
    meanDarkeningRatio,
    maxLuminanceDip,
    overflowPixelCount,
    hotspotCoordinates: hotspots.slice(0, maxHotspots),
  };
}

/** 활성 스트로크 내부 고주파 미세 텍스처(종이결/브러시 입자) 에너지 산출. */
export function computeTextureGrainEnergy(buffer: RgbaTileBuffer): number {
  assertValidTileBuffer(buffer, "buffer");
  const { width, height, data } = buffer;
  if (width < 3 || height < 3) return 0;

  const luma = buildLuminancePlane(buffer, ORACLE_DEFAULT_BACKDROP_RGB);
  let energySum = 0;
  let activeCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      if (byteAt(data, idx * 4 + 3) < 16) continue;
      const center = luma[idx] ?? 0;
      const lap =
        4 * center
        - (luma[idx - 1] ?? center)
        - (luma[idx + 1] ?? center)
        - (luma[idx - width] ?? center)
        - (luma[idx + width] ?? center);
      energySum += Math.abs(lap);
      activeCount += 1;
    }
  }
  return activeCount > 0 ? energySum / activeCount : 0;
}
