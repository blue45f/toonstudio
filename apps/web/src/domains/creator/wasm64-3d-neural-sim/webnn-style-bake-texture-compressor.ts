/**
 * WebNN 실행 프로바이더 탐지 기반 2× 에지-디렉티드 초해상도 업스케일러,
 * 120fps 모바일 렌더링용 아티스트 NPR 스타일·셀 섀도우·Cavity AO UV 아틀라스 베이커
 * 및 4×4 블록 텍스처 코덱 통합 파사드.
 */

import {
  compressBlockTexture,
  type BlockCodecMode,
  type CompressedBlockTexture,
  type RgbTuple,
  type RgbaTextureBuffer,
  type WebNnExecutionProviderKind,
} from "./block-texture-codec";
import type { Vec3 } from "./mesh-qem-decimator-retargeter";

export {
  compressBlockTexture,
  computeTexturePsnrMetrics,
  decompressBlockTexture,
  probeWebNnExecutionProviders,
  type BlockCodecMode,
  type BlockCompressionTelemetry,
  type CompressedBlockTexture,
  type RgbTuple,
  type RgbaTextureBuffer,
  type WebNnExecutionProviderKind,
  type WebNnExecutionProviderReport,
} from "./block-texture-codec";

export interface WebNnUpscaleHook {
  readonly provider: WebNnExecutionProviderKind;
  upscale2x(input: RgbaTextureBuffer): Uint8ClampedArray;
}

export interface EdgeDirectedUpscaleOptions {
  readonly edgeSharpenStrength?: number;
  readonly anisotropyStrength?: number;
  readonly webNnHook?: WebNnUpscaleHook | null;
}

export interface EdgeDirectedUpscaleResult {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly provider: WebNnExecutionProviderKind;
  readonly edgePixelRatio: number;
  readonly averageGradient: number;
}

export interface StylizedUvBakeInput {
  readonly width: number;
  readonly height: number;
  readonly albedoRgba: Uint8ClampedArray;
  readonly normalMapRgba?: Uint8ClampedArray;
  readonly cavityAo?: Float32Array | Uint8Array;
  readonly uvCoverageMask?: Uint8Array;
}

export interface StylizedUvBakeOptions {
  readonly keyLightDirection?: Vec3;
  readonly rimLightDirection?: Vec3;
  readonly rimIntensity?: number;
  readonly rimPower?: number;
  readonly rimTintRgb?: RgbTuple;
  readonly celBandCount?: 2 | 3 | 4;
  readonly celSoftness?: number;
  readonly shadowTintRgb?: RgbTuple;
  readonly shadowTintStrength?: number;
  readonly aoStrength?: number;
  readonly palette?: readonly RgbTuple[];
  readonly paletteBlend?: number;
  readonly brushGrainStrength?: number;
  readonly brushGrainScale?: number;
  readonly seamDilationPx?: number;
  readonly compressMode?: BlockCodecMode | "none";
}

export interface StylizedUvBakeResult {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly compressed?: CompressedBlockTexture;
  readonly celBandHistogram: readonly number[];
  readonly averageAo: number;
  readonly rimLitTexelRatio: number;
  readonly dilatedSeamTexels: number;
  readonly paletteSnappedRatio: number;
}

const EPS = 1e-6;

function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function normalize3(v: Vec3, fallback: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(len) || len <= EPS) return fallback;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function sampleBilinearRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  fx: number,
  fy: number,
): [number, number, number, number] {
  const x = clamp(fx, 0, width - 1);
  const y = clamp(fy, 0, height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  return [
    rgba[i00] * w00 + rgba[i10] * w10 + rgba[i01] * w01 + rgba[i11] * w11,
    rgba[i00 + 1] * w00 + rgba[i10 + 1] * w10 + rgba[i01 + 1] * w01 + rgba[i11 + 1] * w11,
    rgba[i00 + 2] * w00 + rgba[i10 + 2] * w10 + rgba[i01 + 2] * w01 + rgba[i11 + 2] * w11,
    rgba[i00 + 3] * w00 + rgba[i10 + 3] * w10 + rgba[i01 + 3] * w01 + rgba[i11 + 3] * w11,
  ];
}

/**
 * Sobel 구조 텐서 방향성 보간 + 안티-링잉 클램프 샤프닝으로 텍스처를 2× 초해상도 업스케일한다.
 */
export function upscaleTexture2xEdgeDirected(
  input: RgbaTextureBuffer,
  options: EdgeDirectedUpscaleOptions = {},
): EdgeDirectedUpscaleResult {
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(1, Math.floor(input.height));
  const outWidth = width * 2;
  const outHeight = height * 2;

  if (options.webNnHook) {
    return {
      width: outWidth,
      height: outHeight,
      rgba: options.webNnHook.upscale2x(input),
      provider: options.webNnHook.provider,
      edgePixelRatio: 0,
      averageGradient: 0,
    };
  }

  const sharpen = clamp(options.edgeSharpenStrength ?? 0.32, 0, 1);
  const aniso = clamp(options.anisotropyStrength ?? 0.45, 0, 1);
  const luma = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    luma[i] = (0.299 * input.rgba[o] + 0.587 * input.rgba[o + 1] + 0.114 * input.rgba[o + 2]) / 255;
  }

  const gradX = new Float32Array(width * height);
  const gradY = new Float32Array(width * height);
  const gradMag = new Float32Array(width * height);
  let edgePixels = 0;
  let gradSum = 0;
  const lumaAt = (x: number, y: number): number =>
    luma[clamp(y, 0, height - 1) * width + clamp(x, 0, width - 1)];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const gx =
        -lumaAt(x - 1, y - 1) + lumaAt(x + 1, y - 1) -
        2 * lumaAt(x - 1, y) + 2 * lumaAt(x + 1, y) -
        lumaAt(x - 1, y + 1) + lumaAt(x + 1, y + 1);
      const gy =
        -lumaAt(x - 1, y - 1) - 2 * lumaAt(x, y - 1) - lumaAt(x + 1, y - 1) +
        lumaAt(x - 1, y + 1) + 2 * lumaAt(x, y + 1) + lumaAt(x + 1, y + 1);
      const mag = Math.hypot(gx, gy) * 0.25;
      gradX[idx] = gx;
      gradY[idx] = gy;
      gradMag[idx] = mag;
      gradSum += mag;
      if (mag > 0.12) edgePixels += 1;
    }
  }

  const outRgba = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let oy = 0; oy < outHeight; oy += 1) {
    const sy = (oy + 0.5) * 0.5 - 0.5;
    const ny = clamp(Math.round(sy), 0, height - 1);
    for (let ox = 0; ox < outWidth; ox += 1) {
      const sx = (ox + 0.5) * 0.5 - 0.5;
      const nx = clamp(Math.round(sx), 0, width - 1);
      const sIdx = ny * width + nx;
      const mag = gradMag[sIdx];
      let [r, g, b, a] = sampleBilinearRgba(input.rgba, width, height, sx, sy);

      if (mag > 0.05 && aniso > 0) {
        const gLen = Math.hypot(gradX[sIdx], gradY[sIdx]) || 1;
        const tx = -gradY[sIdx] / gLen;
        const ty = gradX[sIdx] / gLen;
        const pPos = sampleBilinearRgba(input.rgba, width, height, sx + tx * 0.32, sy + ty * 0.32);
        const pNeg = sampleBilinearRgba(input.rgba, width, height, sx - tx * 0.32, sy - ty * 0.32);
        const wEdge = clamp(mag * 1.6, 0, 1) * aniso;
        r = r * (1 - wEdge) + 0.5 * (pPos[0] + pNeg[0]) * wEdge;
        g = g * (1 - wEdge) + 0.5 * (pPos[1] + pNeg[1]) * wEdge;
        b = b * (1 - wEdge) + 0.5 * (pPos[2] + pNeg[2]) * wEdge;
        a = a * (1 - wEdge) + 0.5 * (pPos[3] + pNeg[3]) * wEdge;
      }

      if (sharpen > 0) {
        let minR = 255;
        let minG = 255;
        let minB = 255;
        let maxR = 0;
        let maxG = 0;
        let maxB = 0;
        let avgR = 0;
        let avgG = 0;
        let avgB = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const cy = clamp(ny + dy, 0, height - 1);
          for (let dx = -1; dx <= 1; dx += 1) {
            const cx = clamp(nx + dx, 0, width - 1);
            const so = (cy * width + cx) * 4;
            const cr = input.rgba[so];
            const cg = input.rgba[so + 1];
            const cb = input.rgba[so + 2];
            if (cr < minR) minR = cr;
            if (cg < minG) minG = cg;
            if (cb < minB) minB = cb;
            if (cr > maxR) maxR = cr;
            if (cg > maxG) maxG = cg;
            if (cb > maxB) maxB = cb;
            avgR += cr;
            avgG += cg;
            avgB += cb;
          }
        }
        const k = sharpen * (0.4 + 0.6 * clamp(mag * 2, 0, 1));
        r = clamp(r + (r - avgR / 9) * k, minR, maxR);
        g = clamp(g + (g - avgG / 9) * k, minG, maxG);
        b = clamp(b + (b - avgB / 9) * k, minB, maxB);
      }

      const dst = (oy * outWidth + ox) * 4;
      outRgba[dst] = clampByte(r);
      outRgba[dst + 1] = clampByte(g);
      outRgba[dst + 2] = clampByte(b);
      outRgba[dst + 3] = clampByte(a);
    }
  }

  return {
    width: outWidth,
    height: outHeight,
    rgba: outRgba,
    provider: "cpu-deterministic",
    edgePixelRatio: edgePixels / (width * height),
    averageGradient: gradSum / (width * height),
  };
}

function hash2d(ix: number, iy: number): number {
  let h = (ix * 374761393 + iy * 668265263) ^ 0x5bf03635;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function directionalBrushGrain(x: number, y: number, scale: number): number {
  const sx = (x * 0.72 + y * 0.28) / Math.max(1, scale);
  const sy = (-x * 0.28 + y * 0.72) / Math.max(1, scale * 0.35);
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2d(x0, y0);
  const b = hash2d(x0 + 1, y0);
  const c = hash2d(x0, y0 + 1);
  const d = hash2d(x0 + 1, y0 + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v - 0.5;
}

function quantizeCelBand(
  ndotl: number,
  bands: 2 | 3 | 4,
  softness: number,
): { readonly level: number; readonly bandIndex: number } {
  const scaled = clamp(ndotl, 0, 1) * bands;
  const rawIdx = Math.min(bands - 1, Math.floor(scaled));
  const frac = scaled - rawIdx;
  const bandStep = 1 / (bands - 1);
  const lowLevel = rawIdx * bandStep;
  const highLevel = Math.min(1, (rawIdx + 1) * bandStep);
  if (softness <= EPS || rawIdx >= bands - 1 || frac <= 1 - softness) {
    return { level: lowLevel, bandIndex: rawIdx };
  }
  const t = clamp((frac - (1 - softness)) / softness, 0, 1);
  return { level: lowLevel + (highLevel - lowLevel) * t * t * (3 - 2 * t), bandIndex: rawIdx };
}

function estimateFallbackAo(
  albedo: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  baseLuma: number,
  nz: number,
): number {
  const sampleLuma = (cx: number, cy: number): number => {
    const o = (cy * width + cx) * 4;
    return (0.299 * albedo[o] + 0.587 * albedo[o + 1] + 0.114 * albedo[o + 2]) / 255;
  };
  const avgNbr =
    0.25 *
    (sampleLuma(Math.max(0, x - 1), y) +
      sampleLuma(Math.min(width - 1, x + 1), y) +
      sampleLuma(x, Math.max(0, y - 1)) +
      sampleLuma(x, Math.min(height - 1, y + 1)));
  return clamp(1 - Math.max(0, avgNbr - baseLuma) * 1.4 - (1 - clamp(nz, 0, 1)) * 0.22, 0.25, 1);
}

function dilateUvSeams(
  outRgba: Uint8ClampedArray,
  initialMask: Uint8Array,
  width: number,
  height: number,
  passes: number,
): number {
  let dilated = 0;
  let mask = new Uint8Array(initialMask.subarray(0, width * height));
  for (let pass = 0; pass < passes; pass += 1) {
    const nextMask = new Uint8Array(mask);
    const snapshot = new Uint8ClampedArray(outRgba);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (mask[idx] > 0) continue;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let sumA = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const nIdx = ny * width + nx;
            if (mask[nIdx] > 0) {
              const no = nIdx * 4;
              sumR += snapshot[no];
              sumG += snapshot[no + 1];
              sumB += snapshot[no + 2];
              sumA += snapshot[no + 3];
              count += 1;
            }
          }
        }
        if (count > 0) {
          const o = idx * 4;
          outRgba[o] = Math.round(sumR / count);
          outRgba[o + 1] = Math.round(sumG / count);
          outRgba[o + 2] = Math.round(sumB / count);
          outRgba[o + 3] = Math.round(sumA / count);
          nextMask[idx] = 1;
          dilated += 1;
        }
      }
    }
    mask = nextMask;
  }
  return dilated;
}

/**
 * 방향성 키/림 라이팅, Cavity AO, 셀 셰이딩 밴드, 아티스트 팔레트 양자화 및 붓결 그레인을
 * 120fps 모바일 렌더링용 재사용 UV 아틀라스 텍스처로 직접 베이크한다.
 */
export function bakeStylizedUvTexture(
  input: StylizedUvBakeInput,
  options: StylizedUvBakeOptions = {},
): StylizedUvBakeResult {
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(1, Math.floor(input.height));
  const pixelCount = width * height;
  const keyDir = normalize3(options.keyLightDirection ?? [0.55, 0.65, 0.52], [0.55, 0.65, 0.52]);
  const rimDir = normalize3(options.rimLightDirection ?? [-0.6, 0.45, -0.66], [-0.6, 0.45, -0.66]);
  const rimIntensity = clamp(options.rimIntensity ?? 0.35, 0, 2);
  const rimPower = clamp(options.rimPower ?? 2.4, 0.5, 8);
  const rimTint = options.rimTintRgb ?? [0.96, 0.94, 0.88];
  const celBands: 2 | 3 | 4 = options.celBandCount ?? 3;
  const celSoftness = clamp(options.celSoftness ?? 0.08, 0, 0.45);
  const shadowTint = options.shadowTintRgb ?? [0.22, 0.24, 0.36];
  const shadowTintStrength = clamp(options.shadowTintStrength ?? 0.38, 0, 1);
  const aoStrength = clamp(options.aoStrength ?? 0.65, 0, 1);
  const palette = options.palette && options.palette.length > 0 ? options.palette : null;
  const paletteBlend = clamp(options.paletteBlend ?? 0.45, 0, 1);
  const brushGrainStrength = clamp(options.brushGrainStrength ?? 0.07, 0, 0.4);
  const brushGrainScale = clamp(options.brushGrainScale ?? 6, 1, 32);
  const seamDilationPx = Math.max(0, Math.min(8, Math.floor(options.seamDilationPx ?? 2)));

  const outRgba = new Uint8ClampedArray(pixelCount * 4);
  const bandHist = new Array<number>(celBands).fill(0);
  let aoSum = 0;
  let rimLitCount = 0;
  let paletteSnapped = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const o = idx * 4;
      const baseR = input.albedoRgba[o] / 255;
      const baseG = input.albedoRgba[o + 1] / 255;
      const baseB = input.albedoRgba[o + 2] / 255;

      let nx = 0;
      let ny = 0;
      let nz = 1;
      if (input.normalMapRgba && input.normalMapRgba.length >= pixelCount * 4) {
        const norm = normalize3(
          [(input.normalMapRgba[o] / 255) * 2 - 1, (input.normalMapRgba[o + 1] / 255) * 2 - 1, (input.normalMapRgba[o + 2] / 255) * 2 - 1],
          [0, 0, 1],
        );
        nx = norm[0];
        ny = norm[1];
        nz = norm[2];
      }

      const ao =
        input.cavityAo && input.cavityAo.length > idx
          ? input.cavityAo instanceof Uint8Array
            ? input.cavityAo[idx] / 255
            : clamp(input.cavityAo[idx], 0, 1)
          : estimateFallbackAo(input.albedoRgba, width, height, x, y, 0.299 * baseR + 0.587 * baseG + 0.114 * baseB, nz);
      aoSum += ao;

      const rawDot = clamp(nx * keyDir[0] + ny * keyDir[1] + nz * keyDir[2], 0, 1);
      const cel = quantizeCelBand(clamp(rawDot * (1 - aoStrength * (1 - ao)), 0, 1), celBands, celSoftness);
      bandHist[cel.bandIndex] = (bandHist[cel.bandIndex] ?? 0) + 1;

      const aoFactor = 1 - aoStrength * 0.65 * (1 - ao);
      let r = baseR * (0.45 + 0.55 * cel.level) * aoFactor;
      let g = baseG * (0.45 + 0.55 * cel.level) * aoFactor;
      let b = baseB * (0.45 + 0.55 * cel.level) * aoFactor;

      const tintW = (1 - cel.level) * shadowTintStrength;
      r = r * (1 - tintW) + baseR * shadowTint[0] * tintW;
      g = g * (1 - tintW) + baseG * shadowTint[1] * tintW;
      b = b * (1 - tintW) + baseB * shadowTint[2] * tintW;

      const rimAmt =
        Math.pow(clamp(1 - Math.abs(nz), 0, 1), rimPower) *
        clamp((nx * rimDir[0] + ny * rimDir[1] + nz * rimDir[2]) * 0.5 + 0.5, 0, 1) *
        rimIntensity;
      if (rimAmt > 0.05) rimLitCount += 1;
      r += rimTint[0] * rimAmt;
      g += rimTint[1] * rimAmt;
      b += rimTint[2] * rimAmt;

      if (brushGrainStrength > 0) {
        const grain = directionalBrushGrain(x, y, brushGrainScale) * brushGrainStrength;
        r += grain;
        g += grain;
        b += grain;
      }

      if (palette && paletteBlend > 0) {
        let bestColor = palette[0] ?? [r, g, b];
        let bestDist = Number.POSITIVE_INFINITY;
        for (const swatch of palette) {
          const dr = r - swatch[0];
          const dg = g - swatch[1];
          const db = b - swatch[2];
          const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
          if (d < bestDist) {
            bestDist = d;
            bestColor = swatch;
          }
        }
        r = r * (1 - paletteBlend) + bestColor[0] * paletteBlend;
        g = g * (1 - paletteBlend) + bestColor[1] * paletteBlend;
        b = b * (1 - paletteBlend) + bestColor[2] * paletteBlend;
        paletteSnapped += 1;
      }

      outRgba[o] = clampByte(r * 255);
      outRgba[o + 1] = clampByte(g * 255);
      outRgba[o + 2] = clampByte(b * 255);
      outRgba[o + 3] = input.albedoRgba[o + 3];
    }
  }

  const dilatedSeamTexels =
    input.uvCoverageMask && input.uvCoverageMask.length >= pixelCount && seamDilationPx > 0
      ? dilateUvSeams(outRgba, input.uvCoverageMask, width, height, seamDilationPx)
      : 0;
  const compressMode = options.compressMode ?? "none";
  const compressed =
    compressMode === "none" ? undefined : compressBlockTexture({ width, height, rgba: outRgba }, compressMode);

  return {
    width,
    height,
    rgba: outRgba,
    compressed,
    celBandHistogram: bandHist,
    averageAo: pixelCount > 0 ? aoSum / pixelCount : 1,
    rimLitTexelRatio: pixelCount > 0 ? rimLitCount / pixelCount : 0,
    dilatedSeamTexels,
    paletteSnappedRatio: pixelCount > 0 ? paletteSnapped / pixelCount : 0,
  };
}
