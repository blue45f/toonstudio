/**
 * 마스터 필터 레트로·글리치(5종) 및 종이질감·선화추출·스마트배경투명화(5종) RGBA 픽셀 커널.
 */

import {
  clamp01,
  clampByte,
  computeSobelMagnitude,
  extractLumaBuffer,
  fbm2d,
  hash2d,
  lerp,
  sampleRgbaClamped,
  separableGaussianBlurFloat,
  smoothstep,
  srgbLuma,
  valueNoise2d,
  type RgbTriple,
} from "./master-filter-color-kernels";
import type { MasterFilterId } from "./master-filter-lut-catalog";

export type RetroPaperFilterId = Extract<
  MasterFilterId,
  | "crt-scanline-monitor"
  | "vhs-tape-distortion"
  | "bayer-4x4-dither"
  | "rgb-datamosh-shift"
  | "dot-matrix-lcd"
  | "hanji-fiber-overlay"
  | "rough-watercolor-paper"
  | "linen-canvas-weave"
  | "sobel-dog-line-extract"
  | "smart-chroma-matte-key"
>;

const BAYER_4X4: readonly (readonly [number, number, number, number])[] = Object.freeze([
  [0 / 16, 8 / 16, 2 / 16, 10 / 16],
  [12 / 16, 4 / 16, 14 / 16, 6 / 16],
  [3 / 16, 11 / 16, 1 / 16, 9 / 16],
  [15 / 16, 7 / 16, 13 / 16, 5 / 16],
]);

const LCD_PALETTE: readonly RgbTriple[] = Object.freeze([
  [0.08, 0.19, 0.09],
  [0.2, 0.38, 0.21],
  [0.48, 0.65, 0.34],
  [0.74, 0.84, 0.52],
]);

function applyCrtScanlineMonitor(
  input: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const invW = 1 / Math.max(1, width - 1);
  const invH = 1 / Math.max(1, height - 1);

  for (let y = 0; y < height; y += 1) {
    const scanFactor = y % 2 === 0 ? 1.08 : 0.62;
    const ny = y * invH * 2 - 1;
    for (let x = 0; x < width; x += 1) {
      const nx = x * invW * 2 - 1;
      const curvatureShadow = clamp01(1 - (nx * nx + ny * ny) * 0.18);
      const subpixel = x % 3;
      const rMask = subpixel === 0 ? 1.12 : 0.9;
      const gMask = subpixel === 1 ? 1.12 : 0.9;
      const bMask = subpixel === 2 ? 1.12 : 0.9;

      const idx = (y * width + x) * 4;
      out[idx] = clampByte((input[idx] ?? 0) * scanFactor * rMask * curvatureShadow);
      out[idx + 1] = clampByte((input[idx + 1] ?? 0) * scanFactor * gMask * curvatureShadow);
      out[idx + 2] = clampByte((input[idx + 2] ?? 0) * scanFactor * bMask * curvatureShadow);
      out[idx + 3] = input[idx + 3] ?? 255;
    }
  }
  return out;
}

function applyVhsTapeDistortion(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  seed: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);

  for (let y = 0; y < height; y += 1) {
    const lineWave = Math.sin(y * 0.45 + seed * 0.1) * 1.4;
    const tearHash = hash2d(y, 7, seed + 17);
    const tearShift = tearHash > 0.88 ? (tearHash - 0.88) * 48 : 0;
    const lineShift = lineWave + tearShift;

    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const [lr, lg, lb] = sampleRgbaClamped(input, width, height, x + lineShift, y);
      const [cr] = sampleRgbaClamped(input, width, height, x + lineShift + 2.4, y);
      const [, , cb] = sampleRgbaClamped(input, width, height, x + lineShift - 2.4, y);

      const snow = (hash2d(x, y, seed + 83) - 0.5) * 34;
      const trackingNoise = tearHash > 0.93 ? 32 : 0;

      out[idx] = clampByte(lerp(lr, cr, 0.55) + snow + trackingNoise);
      out[idx + 1] = clampByte(lg * 0.97 + snow * 0.8 + trackingNoise);
      out[idx + 2] = clampByte(lerp(lb, cb, 0.55) + snow + trackingNoise);
      out[idx + 3] = input[idx + 3] ?? 255;
    }
  }
  return out;
}

function applyBayer4x4Dither(
  input: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const levels = 3;

  for (let y = 0; y < height; y += 1) {
    const row = BAYER_4X4[y % 4];
    for (let x = 0; x < width; x += 1) {
      const threshold = (row?.[x % 4] ?? 0.5) - 0.5;
      const idx = (y * width + x) * 4;

      const r0 = (input[idx] ?? 0) / 255;
      const g0 = (input[idx + 1] ?? 0) / 255;
      const b0 = (input[idx + 2] ?? 0) / 255;

      const qr = Math.round(clamp01(r0 + threshold / levels) * levels) / levels;
      const qg = Math.round(clamp01(g0 + threshold / levels) * levels) / levels;
      const qb = Math.round(clamp01(b0 + threshold / levels) * levels) / levels;

      out[idx] = clampByte(qr * 255);
      out[idx + 1] = clampByte(qg * 255);
      out[idx + 2] = clampByte(qb * 255);
      out[idx + 3] = input[idx + 3] ?? 255;
    }
  }
  return out;
}

function applyRgbDatamoshShift(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  seed: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const bandHeight = Math.max(2, Math.round(height / 10));

  for (let y = 0; y < height; y += 1) {
    const band = Math.floor(y / bandHeight);
    const hVal = hash2d(band, 13, seed + 41);
    const active = hVal > 0.32 || height <= 2;
    const shiftR = active ? Math.round((hVal - 0.5) * Math.max(4, width * 0.14)) : 1;
    const shiftG = active
      ? Math.round((hash2d(band, 29, seed + 41) - 0.5) * Math.max(2, width * 0.05))
      : 0;
    const shiftB = -shiftR;

    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const [sr] = sampleRgbaClamped(input, width, height, x + shiftR, y);
      const [, sg] = sampleRgbaClamped(input, width, height, x + shiftG, y);
      const [, , sb] = sampleRgbaClamped(input, width, height, x + shiftB, y);

      const boundaryBoost = y % bandHeight === 0 ? 18 : 0;
      out[idx] = clampByte(width === 1 ? Math.min(255, sr + 24) : sr + boundaryBoost);
      out[idx + 1] = clampByte(sg);
      out[idx + 2] = clampByte(width === 1 ? Math.max(0, sb - 24) : sb + boundaryBoost);
      out[idx + 3] = input[idx + 3] ?? 255;
    }
  }
  return out;
}

function applyDotMatrixLcd(
  input: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const cell = width >= 24 && height >= 24 ? 3 : 2;

  for (let y = 0; y < height; y += 1) {
    const cy = Math.floor(y / cell) * cell;
    const isGapY = height >= 4 && y % cell === cell - 1;
    for (let x = 0; x < width; x += 1) {
      const cx = Math.floor(x / cell) * cell;
      const isGapX = width >= 4 && x % cell === cell - 1;

      const [sr, sg, sb] = sampleRgbaClamped(input, width, height, cx, cy);
      const l = srgbLuma(sr / 255, sg / 255, sb / 255);
      const shadeIdx = Math.min(3, Math.max(0, Math.floor(l * 3.999)));
      const shade = LCD_PALETTE[shadeIdx] ?? LCD_PALETTE[0];
      const gridDim = isGapX || isGapY ? 0.78 : 1.0;

      const idx = (y * width + x) * 4;
      out[idx] = clampByte(shade[0] * gridDim * 255);
      out[idx + 1] = clampByte(shade[1] * gridDim * 255);
      out[idx + 2] = clampByte(shade[2] * gridDim * 255);
      out[idx + 3] = input[idx + 3] ?? 255;
    }
  }
  return out;
}

function applyHanjiFiberOverlay(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  seed: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r0 = (input[idx] ?? 0) / 255;
      const g0 = (input[idx + 1] ?? 0) / 255;
      const b0 = (input[idx + 2] ?? 0) / 255;

      const tooth = fbm2d(x * 0.24, y * 0.24, seed + 11, 3);
      const warpA = valueNoise2d(x * 0.05, y * 0.05, seed + 23) * 6;
      const fiberA = Math.pow(Math.abs(Math.sin((x * 0.22 + y * 0.08 + warpA) * 1.3)), 14);
      const fiberB = Math.pow(Math.abs(Math.sin((x * 0.09 - y * 0.26 + warpA * 0.7) * 1.1)), 16);
      const fiberHighlight = clamp01((fiberA + fiberB) * 0.55);

      const paperTintR = 0.96 - (tooth - 0.5) * 0.14 + fiberHighlight * 0.09;
      const paperTintG = 0.93 - (tooth - 0.5) * 0.15 + fiberHighlight * 0.08;
      const paperTintB = 0.85 - (tooth - 0.5) * 0.16 + fiberHighlight * 0.06;

      out[idx] = clampByte(clamp01(r0 * paperTintR + fiberHighlight * 0.06) * 255);
      out[idx + 1] = clampByte(clamp01(g0 * paperTintG + fiberHighlight * 0.05) * 255);
      out[idx + 2] = clampByte(clamp01(b0 * paperTintB + fiberHighlight * 0.03) * 255);
      out[idx + 3] = input[idx + 3] ?? 255;
    }
  }
  return out;
}

function applyRoughWatercolorPaper(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  seed: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const scale = 0.34;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r0 = (input[idx] ?? 0) / 255;
      const g0 = (input[idx + 1] ?? 0) / 255;
      const b0 = (input[idx + 2] ?? 0) / 255;

      const h0 = fbm2d(x * scale, y * scale, seed + 61, 3);
      const hx = fbm2d((x + 1) * scale, y * scale, seed + 61, 3);
      const hy = fbm2d(x * scale, (y + 1) * scale, seed + 61, 3);

      const relief = (h0 - hx) * 0.42 + (h0 - hy) * 0.42;
      const valleyPool = (0.5 - h0) * 0.18;
      const mod = 1 + relief + valleyPool;

      out[idx] = clampByte(clamp01(r0 * mod * 0.98 + 0.015) * 255);
      out[idx + 1] = clampByte(clamp01(g0 * mod * 0.97 + 0.012) * 255);
      out[idx + 2] = clampByte(clamp01(b0 * mod * 0.93 + 0.005) * 255);
      out[idx + 3] = input[idx + 3] ?? 255;
    }
  }
  return out;
}

function applyLinenCanvasWeave(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  seed: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const freq = 1.45;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const r0 = (input[idx] ?? 0) / 255;
      const g0 = (input[idx + 1] ?? 0) / 255;
      const b0 = (input[idx + 2] ?? 0) / 255;

      const jitter = (valueNoise2d(x * 0.18, y * 0.18, seed + 91) - 0.5) * 0.35;
      const warp = Math.cos((x + jitter) * freq);
      const weft = Math.cos((y - jitter) * freq);
      const overUnder = Math.sin(x * freq * 0.5) * Math.sin(y * freq * 0.5);
      const weaveRelief = (warp * 0.36 + weft * 0.36 + overUnder * 0.28) * 0.16;

      out[idx] = clampByte(clamp01(r0 * (0.98 + weaveRelief) + weaveRelief * 0.08) * 255);
      out[idx + 1] = clampByte(clamp01(g0 * (0.97 + weaveRelief) + weaveRelief * 0.07) * 255);
      out[idx + 2] = clampByte(clamp01(b0 * (0.94 + weaveRelief) + weaveRelief * 0.05) * 255);
      out[idx + 3] = input[idx + 3] ?? 255;
    }
  }
  return out;
}

function applySobelDogLineExtract(
  input: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const luma = extractLumaBuffer(input, width, height);
  const sobel = computeSobelMagnitude(luma, width, height);
  const blurSmall = separableGaussianBlurFloat(luma, width, height, 1, 0.9);
  const blurLarge = separableGaussianBlurFloat(luma, width, height, 2, 2.1);

  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    const dogResponse = Math.max(0, (blurLarge[i] ?? 0) - 0.96 * (blurSmall[i] ?? 0)) * 6.5;
    const sobelResponse = (sobel[i] ?? 0) * 1.15;
    const combined = Math.max(dogResponse, sobelResponse);

    const inkStrength = smoothstep(0.14, 0.52, combined);
    const paper = clamp01(1 - inkStrength * 0.94);
    const byte = clampByte(paper * 255);

    out[idx] = byte;
    out[idx + 1] = byte;
    out[idx + 2] = clampByte(Math.min(255, byte + 2));
    out[idx + 3] = input[idx + 3] ?? 255;
  }
  return out;
}

function sampleCornerBackdropColor(
  input: Uint8ClampedArray,
  width: number,
  height: number,
): RgbTriple {
  const coords: Array<readonly [number, number]> = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.min(1, width - 1), 0],
    [Math.max(0, width - 2), 0],
    [0, Math.min(1, height - 1)],
    [width - 1, Math.max(0, height - 2)],
  ];
  let sr = 0;
  let sg = 0;
  let sb = 0;
  for (let i = 0; i < coords.length; i += 1) {
    const pt = coords[i];
    if (!pt) continue;
    const [r, g, b] = sampleRgbaClamped(input, width, height, pt[0], pt[1]);
    sr += r / 255;
    sg += g / 255;
    sb += b / 255;
  }
  const n = Math.max(1, coords.length);
  return [sr / n, sg / n, sb / n];
}

function applySmartChromaMatteKey(
  input: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(input.length);
  const [keyR, keyG, keyB] = sampleCornerBackdropColor(input, width, height);
  const luma = extractLumaBuffer(input, width, height);
  const sobel = computeSobelMagnitude(luma, width, height);

  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    const r0 = (input[idx] ?? 0) / 255;
    const g0 = (input[idx + 1] ?? 0) / 255;
    const b0 = (input[idx + 2] ?? 0) / 255;
    const a0 = (input[idx + 3] ?? 255) / 255;

    const dr = r0 - keyR;
    const dg = g0 - keyG;
    const db = b0 - keyB;
    const colorDist = Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);

    const edgeBoost = clamp01((sobel[i] ?? 0) * 0.55);
    const matteAlpha = smoothstep(0.08, 0.24, colorDist + edgeBoost * 0.18);

    const fringe = matteAlpha > 0.02 && matteAlpha < 0.92 ? (1 - matteAlpha) * 0.28 : 0;
    const neutral = srgbLuma(r0, g0, b0);
    const r = clamp01(lerp(r0, neutral, fringe));
    const g = clamp01(lerp(g0, neutral, fringe));
    const b = clamp01(lerp(b0, neutral, fringe));

    out[idx] = clampByte(r * 255);
    out[idx + 1] = clampByte(g * 255);
    out[idx + 2] = clampByte(b * 255);
    out[idx + 3] = clampByte(a0 * matteAlpha * 255);
  }
  return out;
}

export function applyRetroPaperMasterFilter(
  input: Uint8ClampedArray,
  width: number,
  height: number,
  filterId: RetroPaperFilterId,
  seed: number,
): Uint8ClampedArray {
  switch (filterId) {
    case "crt-scanline-monitor":
      return applyCrtScanlineMonitor(input, width, height);
    case "vhs-tape-distortion":
      return applyVhsTapeDistortion(input, width, height, seed);
    case "bayer-4x4-dither":
      return applyBayer4x4Dither(input, width, height);
    case "rgb-datamosh-shift":
      return applyRgbDatamoshShift(input, width, height, seed);
    case "dot-matrix-lcd":
      return applyDotMatrixLcd(input, width, height);
    case "hanji-fiber-overlay":
      return applyHanjiFiberOverlay(input, width, height, seed);
    case "rough-watercolor-paper":
      return applyRoughWatercolorPaper(input, width, height, seed);
    case "linen-canvas-weave":
      return applyLinenCanvasWeave(input, width, height, seed);
    case "sobel-dog-line-extract":
      return applySobelDogLineExtract(input, width, height);
    case "smart-chroma-matte-key":
      return applySmartChromaMatteKey(input, width, height);
  }
}
