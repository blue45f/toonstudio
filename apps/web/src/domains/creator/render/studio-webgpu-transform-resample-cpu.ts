/**
 * WebGPU 1패스 변형·선명 리샘플링 엔진의 결정적 CPU 동등성(parity) 수학 코어.
 *
 * - `Lanczos3` (3-lobe windowed sinc, 축소율 적응형 로우패스 폭), `Catmull-Rom Bicubic` (B=0, C=0.5),
 *   `Nearest-Sharp`, `Bilinear` 리샘플러를 프리멀티플라이드 알파 공간에서 수행한다.
 * - 아핀 회전·확대/축소, 3×3 원근 호모그래피 역변환, 격자 메쉬 워프(bilinear / bicubic),
 *   액화(Liquify 방사 변위)를 단일 패스로 계산해 이중 양선형 블러(double-bilinear blur)를 방지한다.
 */

import {
  evaluateCatmullRomWeight,
  evaluateLiquifyRadialSourcePoint,
  evaluateMeshInversePoint,
  normalizeLiquifyOpsToPacked,
  type StudioLiquifyRadialOp,
  type StudioMeshWarpConfig,
} from "./studio-webgpu-transform-warp-math";

import type { StudioImageDataLike } from "../studio-filters";
import type { StudioGpuMatrix3x3 } from "./studio-webgpu-zero-copy-pack";

export {
  evaluateCatmullRomWeight,
  evaluateLiquifyRadialSourcePoint,
  evaluateMeshForwardBicubic,
  evaluateMeshInversePoint,
  LIQUIFY_RADIAL_MODE_CODES,
  normalizeLiquifyOpsToPacked,
  STUDIO_LIQUIFY_RADIAL_MODES,
  type StudioLiquifyRadialMode,
  type StudioLiquifyRadialOp,
  type StudioMeshPatchInterpolation,
  type StudioMeshWarpConfig,
} from "./studio-webgpu-transform-warp-math";

export const STUDIO_TRANSFORM_RESAMPLE_MODES = [
  "nearest-sharp",
  "bilinear",
  "catmull-rom",
  "lanczos3",
] as const;

export type StudioTransformResampleMode = (typeof STUDIO_TRANSFORM_RESAMPLE_MODES)[number];

export const STUDIO_TRANSFORM_OPERATION_MODES = [
  "affine",
  "perspective",
  "mesh-warp",
  "liquify",
] as const;

export type StudioTransformOperationMode = (typeof STUDIO_TRANSFORM_OPERATION_MODES)[number];

export interface StudioAffineTransformParams {
  readonly angleDeg?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly translateX?: number;
  readonly translateY?: number;
  readonly pivotX?: number;
  readonly pivotY?: number;
  readonly shearX?: number;
  readonly shearY?: number;
}

export interface StudioTransformResampleRequest {
  readonly mode: StudioTransformOperationMode;
  readonly resampler: StudioTransformResampleMode;
  readonly outputWidth?: number;
  readonly outputHeight?: number;
  /** `affine` 모드 매개변수. */
  readonly affine?: StudioAffineTransformParams;
  /** `perspective` 모드 3×3 역변환 행렬 (`dst -> src`). */
  readonly inverseHomography?: StudioGpuMatrix3x3;
  /** `mesh-warp` 모드 제어점 격자. */
  readonly mesh?: StudioMeshWarpConfig;
  /** `liquify` 모드 방사 변위 연산 목록. */
  readonly liquifyOps?: readonly StudioLiquifyRadialOp[];
}

export interface StudioLineartSharpnessMetrics {
  /** 평균 제곱 Sobel 기울기 에너지 (높을수록 선화 경계가 선명). */
  readonly edgeEnergy: number;
  /** 수직/수평 최대 명암 대비 폭 (0..255). */
  readonly peakContrast: number;
  /** 선화 어두운 코어 최소 휘도 (낮을수록 검은 선이 흐려지지 않고 보존됨). */
  readonly minLuminance: number;
}

export const RESAMPLER_MODE_CODES: Readonly<Record<StudioTransformResampleMode, number>> = Object.freeze({
  "nearest-sharp": 0,
  bilinear: 1,
  "catmull-rom": 2,
  lanczos3: 3,
});

export const TRANSFORM_MODE_CODES: Readonly<Record<StudioTransformOperationMode, number>> = Object.freeze({
  affine: 0,
  perspective: 1,
  "mesh-warp": 2,
  liquify: 3,
});

const MAX_ADAPTIVE_FILTER_RADIUS = 12;

function clamp(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(clamp(value, 0, 255));
}

function zeroRgba(out: Uint8ClampedArray, outOffset: number): void {
  out[outOffset] = 0;
  out[outOffset + 1] = 0;
  out[outOffset + 2] = 0;
  out[outOffset + 3] = 0;
}

function copyRgba(
  src: Uint8ClampedArray,
  srcOffset: number,
  out: Uint8ClampedArray,
  outOffset: number,
): void {
  out[outOffset] = src[srcOffset]!;
  out[outOffset + 1] = src[srcOffset + 1]!;
  out[outOffset + 2] = src[srcOffset + 2]!;
  out[outOffset + 3] = src[srcOffset + 3]!;
}

/** 3-lobe Lanczos 커널 가중치 (`|x| < 3`). */
export function evaluateLanczos3Weight(x: number): number {
  const ax = Math.abs(x);
  if (ax >= 3) return 0;
  if (ax < 1e-7) return 1;
  const px = Math.PI * ax;
  const px3 = px / 3;
  return (Math.sin(px) / px) * (Math.sin(px3) / px3);
}

/**
 * 아핀 회전·확대/축소·기울임·이동 파라미터로부터 정확한 3×3 역변환 행렬(`dst -> src`)을 생성한다.
 */
export function buildInverseAffineMatrix3x3(
  params: StudioAffineTransformParams,
  srcWidth: number,
  srcHeight: number,
): StudioGpuMatrix3x3 {
  const rad = ((params.angleDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sx = Math.abs(params.scaleX ?? 1) < 1e-6 ? 1e-6 : (params.scaleX ?? 1);
  const sy = Math.abs(params.scaleY ?? 1) < 1e-6 ? 1e-6 : (params.scaleY ?? 1);
  const shx = params.shearX ?? 0;
  const shy = params.shearY ?? 0;
  const px = params.pivotX ?? (srcWidth - 1) * 0.5;
  const py = params.pivotY ?? (srcHeight - 1) * 0.5;
  const tx = params.translateX ?? 0;
  const ty = params.translateY ?? 0;

  const ss00 = sx;
  const ss01 = shx * sy;
  const ss10 = shy * sx;
  const ss11 = sy;

  const a00 = cos * ss00 - sin * ss10;
  const a01 = cos * ss01 - sin * ss11;
  const a10 = sin * ss00 + cos * ss10;
  const a11 = sin * ss01 + cos * ss11;

  const det = a00 * a11 - a01 * a10;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-10) {
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }
  const invDet = 1 / det;
  const i00 = a11 * invDet;
  const i01 = -a01 * invDet;
  const i10 = -a10 * invDet;
  const i11 = a00 * invDet;

  const dstOriginX = px + tx;
  const dstOriginY = py + ty;
  const i02 = px - (i00 * dstOriginX + i01 * dstOriginY);
  const i12 = py - (i10 * dstOriginX + i11 * dstOriginY);

  return [i00, i01, i02, i10, i11, i12, 0, 0, 1];
}

/**
 * 3×3 역호모그래피의 목적지 좌표 `(dx, dy)`에서 국소 자코비안 축소 배율 `(scaleX, scaleY)`를 계산한다.
 */
export function computeHomographyLocalScale(
  invH: StudioGpuMatrix3x3,
  dx: number,
  dy: number,
): readonly [number, number] {
  const denom = invH[6] * dx + invH[7] * dy + invH[8];
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-7) {
    return [1, 1];
  }
  const numX = invH[0] * dx + invH[1] * dy + invH[2];
  const numY = invH[3] * dx + invH[4] * dy + invH[5];
  const invDenom2 = 1 / (denom * denom);

  const dSxDx = (invH[0] * denom - numX * invH[6]) * invDenom2;
  const dSxDy = (invH[1] * denom - numX * invH[7]) * invDenom2;
  const dSyDx = (invH[3] * denom - numY * invH[6]) * invDenom2;
  const dSyDy = (invH[4] * denom - numY * invH[7]) * invDenom2;

  const scaleX = Math.hypot(dSxDx, dSyDx);
  const scaleY = Math.hypot(dSxDy, dSyDy);
  return [
    clamp(Number.isFinite(scaleX) ? scaleX : 1, 1, 4),
    clamp(Number.isFinite(scaleY) ? scaleY : 1, 1, 4),
  ];
}

/**
 * 프리멀티플라이드 알파 공간에서 `nearest-sharp` / `bilinear` / `catmull-rom` / `lanczos3`으로
 * 단일 RGBA 픽셀을 샘플링해 `out[outOffset..outOffset+3]`에 기록한다.
 */
export function sampleRgbaWithResampler(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sx: number,
  sy: number,
  out: Uint8ClampedArray,
  outOffset: number,
  resampler: StudioTransformResampleMode,
  filterScaleX = 1,
  filterScaleY = 1,
): void {
  if (
    !Number.isFinite(sx)
    || !Number.isFinite(sy)
    || sx < -0.5
    || sy < -0.5
    || sx > width - 0.5
    || sy > height - 0.5
  ) {
    zeroRgba(out, outOffset);
    return;
  }

  const clampedX = clamp(sx, 0, width - 1);
  const clampedY = clamp(sy, 0, height - 1);

  if (resampler === "nearest-sharp") {
    const nx = clamp(Math.floor(sx + 0.5), 0, width - 1);
    const ny = clamp(Math.floor(sy + 0.5), 0, height - 1);
    copyRgba(data, (ny * width + nx) * 4, out, outOffset);
    return;
  }

  const safeScaleX = clamp(Number.isFinite(filterScaleX) ? filterScaleX : 1, 1, 4);
  const safeScaleY = clamp(Number.isFinite(filterScaleY) ? filterScaleY : 1, 1, 4);

  if (safeScaleX <= 1.0001 && safeScaleY <= 1.0001) {
    const rx = Math.round(clampedX);
    const ry = Math.round(clampedY);
    if (Math.abs(clampedX - rx) < 1e-5 && Math.abs(clampedY - ry) < 1e-5) {
      copyRgba(data, (ry * width + rx) * 4, out, outOffset);
      return;
    }
  }

  if (resampler === "bilinear") {
    const x0 = Math.floor(clampedX);
    const y0 = Math.floor(clampedY);
    const x1 = Math.min(width - 1, x0 + 1);
    const y1 = Math.min(height - 1, y0 + 1);
    const fx = clampedX - x0;
    const fy = clampedY - y0;

    const w00 = (1 - fx) * (1 - fy);
    const w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy;
    const w11 = fx * fy;

    const i00 = (y0 * width + x0) * 4;
    const i10 = (y0 * width + x1) * 4;
    const i01 = (y1 * width + x0) * 4;
    const i11 = (y1 * width + x1) * 4;

    const a00 = data[i00 + 3]! / 255;
    const a10 = data[i10 + 3]! / 255;
    const a01 = data[i01 + 3]! / 255;
    const a11 = data[i11 + 3]! / 255;
    const outA = a00 * w00 + a10 * w10 + a01 * w01 + a11 * w11;

    if (outA <= 1e-4) {
      zeroRgba(out, outOffset);
      return;
    }
    const pw00 = w00 * a00;
    const pw10 = w10 * a10;
    const pw01 = w01 * a01;
    const pw11 = w11 * a11;

    out[outOffset] = clampByte((data[i00]! * pw00 + data[i10]! * pw10 + data[i01]! * pw01 + data[i11]! * pw11) / outA);
    out[outOffset + 1] = clampByte(
      (data[i00 + 1]! * pw00 + data[i10 + 1]! * pw10 + data[i01 + 1]! * pw01 + data[i11 + 1]! * pw11) / outA,
    );
    out[outOffset + 2] = clampByte(
      (data[i00 + 2]! * pw00 + data[i10 + 2]! * pw10 + data[i01 + 2]! * pw01 + data[i11 + 2]! * pw11) / outA,
    );
    out[outOffset + 3] = clampByte(outA * 255);
    return;
  }

  const lobeRadius = resampler === "lanczos3" ? 3 : 2;
  const rx = Math.min(MAX_ADAPTIVE_FILTER_RADIUS, Math.ceil(lobeRadius * safeScaleX));
  const ry = Math.min(MAX_ADAPTIVE_FILTER_RADIUS, Math.ceil(lobeRadius * safeScaleY));
  const minX = Math.max(0, Math.floor(clampedX) - rx + 1);
  const maxX = Math.min(width - 1, Math.floor(clampedX) + rx);
  const minY = Math.max(0, Math.floor(clampedY) - ry + 1);
  const maxY = Math.min(height - 1, Math.floor(clampedY) + ry);

  const invScaleX = 1 / safeScaleX;
  const invScaleY = 1 / safeScaleY;
  const evalWeight = resampler === "lanczos3" ? evaluateLanczos3Weight : evaluateCatmullRomWeight;

  let sumPremulR = 0;
  let sumPremulG = 0;
  let sumPremulB = 0;
  let sumA = 0;
  let sumW = 0;

  for (let py = minY; py <= maxY; py += 1) {
    const wy = evalWeight((py - clampedY) * invScaleY);
    if (wy === 0) continue;
    const rowBase = py * width;
    for (let px = minX; px <= maxX; px += 1) {
      const wx = evalWeight((px - clampedX) * invScaleX);
      if (wx === 0) continue;
      const w = wx * wy;
      const idx = (rowBase + px) * 4;
      const alpha = data[idx + 3]! / 255;
      const wa = w * alpha;
      sumPremulR += data[idx]! * wa;
      sumPremulG += data[idx + 1]! * wa;
      sumPremulB += data[idx + 2]! * wa;
      sumA += wa;
      sumW += w;
    }
  }

  if (Math.abs(sumW) < 1e-7) {
    zeroRgba(out, outOffset);
    return;
  }

  const normA = clamp(sumA / sumW, 0, 1);
  const alphaByte = clampByte(normA * 255);
  if (alphaByte === 0 || normA <= 1e-4) {
    zeroRgba(out, outOffset);
    return;
  }

  const premulMax = 255 * normA;
  out[outOffset] = clampByte(clamp(sumPremulR / sumW, 0, premulMax) / normA);
  out[outOffset + 1] = clampByte(clamp(sumPremulG / sumW, 0, premulMax) / normA);
  out[outOffset + 2] = clampByte(clamp(sumPremulB / sumW, 0, premulMax) / normA);
  out[outOffset + 3] = alphaByte;
}

/**
 * 1패스 변형 + 선명 리샘플링 CPU 결정적 실행기.
 */
export function executeTransformResampleCpu(
  source: StudioImageDataLike,
  request: StudioTransformResampleRequest,
): StudioImageDataLike {
  const { width: srcW, height: srcH, data: srcData } = source;
  const outW = Math.max(1, Math.trunc(request.outputWidth ?? srcW));
  const outH = Math.max(1, Math.trunc(request.outputHeight ?? srcH));
  const outData = new Uint8ClampedArray(outW * outH * 4);
  if (srcW <= 0 || srcH <= 0 || srcData.length < srcW * srcH * 4) {
    return { width: outW, height: outH, data: outData };
  }

  const invMatrix: StudioGpuMatrix3x3 = request.mode === "affine"
    ? buildInverseAffineMatrix3x3(request.affine ?? {}, srcW, srcH)
    : (request.inverseHomography ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]);

  const packedLiquify = request.mode === "liquify"
    ? normalizeLiquifyOpsToPacked(request.liquifyOps)
    : [];

  const affineScale = request.mode === "affine"
    ? computeHomographyLocalScale(invMatrix, 0, 0)
    : ([1, 1] as const);

  for (let dy = 0; dy < outH; dy += 1) {
    const rowBase = dy * outW;
    for (let dx = 0; dx < outW; dx += 1) {
      const outOffset = (rowBase + dx) * 4;
      let sx = dx;
      let sy = dy;
      let fsx = 1;
      let fsy = 1;

      if (request.mode === "affine") {
        sx = invMatrix[0] * dx + invMatrix[1] * dy + invMatrix[2];
        sy = invMatrix[3] * dx + invMatrix[4] * dy + invMatrix[5];
        fsx = affineScale[0];
        fsy = affineScale[1];
      } else if (request.mode === "perspective") {
        const denom = invMatrix[6] * dx + invMatrix[7] * dy + invMatrix[8];
        if (!Number.isFinite(denom) || Math.abs(denom) < 1e-7) continue;
        sx = (invMatrix[0] * dx + invMatrix[1] * dy + invMatrix[2]) / denom;
        sy = (invMatrix[3] * dx + invMatrix[4] * dy + invMatrix[5]) / denom;
        const localScale = computeHomographyLocalScale(invMatrix, dx, dy);
        fsx = localScale[0];
        fsy = localScale[1];
      } else if (request.mode === "mesh-warp") {
        if (!request.mesh) continue;
        const mapped = evaluateMeshInversePoint(request.mesh, dx, dy);
        if (!mapped) continue;
        sx = mapped[0];
        sy = mapped[1];
      } else if (request.mode === "liquify") {
        const mapped = evaluateLiquifyRadialSourcePoint(packedLiquify, dx, dy);
        sx = mapped[0];
        sy = mapped[1];
      }

      sampleRgbaWithResampler(
        srcData,
        srcW,
        srcH,
        sx,
        sy,
        outData,
        outOffset,
        request.resampler,
        fsx,
        fsy,
      );
    }
  }

  return { width: outW, height: outH, data: outData };
}

/**
 * 선화 축소·회전 결과의 선명도(Sobel 기울기 에너지 · 최대 대비 · 최소 휘도)를 정량 측정한다.
 */
export function measureLineartEdgeEnergy(image: StudioImageDataLike): StudioLineartSharpnessMetrics {
  const { width, height, data } = image;
  if (width < 3 || height < 3 || data.length < width * height * 4) {
    return { edgeEnergy: 0, peakContrast: 0, minLuminance: 255 };
  }

  const luma = new Float32Array(width * height);
  let minLum = 255;
  let maxLum = 0;

  for (let i = 0; i < width * height; i += 1) {
    const off = i * 4;
    const alpha = data[off + 3]! / 255;
    const r = data[off]! * alpha + 255 * (1 - alpha);
    const g = data[off + 1]! * alpha + 255 * (1 - alpha);
    const b = data[off + 2]! * alpha + 255 * (1 - alpha);
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luma[i] = y;
    if (y < minLum) minLum = y;
    if (y > maxLum) maxLum = y;
  }

  let energySum = 0;
  let interiorCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const tl = luma[(y - 1) * width + (x - 1)]!;
      const tc = luma[(y - 1) * width + x]!;
      const tr = luma[(y - 1) * width + (x + 1)]!;
      const ml = luma[y * width + (x - 1)]!;
      const mr = luma[y * width + (x + 1)]!;
      const bl = luma[(y + 1) * width + (x - 1)]!;
      const bc = luma[(y + 1) * width + x]!;
      const br = luma[(y + 1) * width + (x + 1)]!;

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      energySum += gx * gx + gy * gy;
      interiorCount += 1;
    }
  }

  return {
    edgeEnergy: interiorCount > 0 ? energySum / interiorCount : 0,
    peakContrast: Math.max(0, maxLum - minLum),
    minLuminance: minLum,
  };
}
