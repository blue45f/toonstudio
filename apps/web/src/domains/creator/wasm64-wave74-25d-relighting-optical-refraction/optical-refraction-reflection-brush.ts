/**
 * Wave 74: 물리 기반 2.5D 광학 굴절·반사 브러시 엔진.
 *
 * 2D 웹툰 컷 위에 4종 실물 광학 매질을 직접 칠해 실시간으로 굴절·색분산·이방성 반사를 합성한다.
 * 1. `raindrop-glass` (IOR 1.333): 구면 돔 법선 + 스넬 RGB 색분산 + 프레넬 하이라이트 + 미세 접촉 그림자
 * 2. `frosted-crystal` (IOR 1.52): 다면체 법선 지터 + 흐린 굴절 투과 + 가장자리 커스틱스
 * 3. `anisotropic-blade-metal`: 금속 프레넬 `F0=[0.88,0.90,0.94]` + 스트로크 접선 정렬 Ward/GGX 광택
 * 4. `wet-puddle-mirror`: 평면 상하 반전 반사 + 물결 법선 교란 + 스침각 프레넬 우세(`F0=0.02 -> 1.0`)
 */

import {
  clamp01,
  clampRange,
  lerp,
  linearToSrgbChannel,
  normalizeVec3,
  smoothstep,
  srgbToLinearChannel,
  type RgbTuple,
  type Vec3Tuple,
} from "./relighting-25d-lightfield-engine";

export type OpticalBrushMaterialId =
  | "raindrop-glass"
  | "frosted-crystal"
  | "anisotropic-blade-metal"
  | "wet-puddle-mirror";

export interface OpticalMaterialPreset {
  readonly id: OpticalBrushMaterialId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly ior: number;
  readonly iorRgb: RgbTuple;
  readonly f0Rgb: RgbTuple;
  readonly defaultThicknessPx: number;
  readonly defaultFrostBlurPx: number;
  readonly anisotropicAlphaT: number;
  readonly anisotropicAlphaB: number;
  readonly defaultPuddleTiltDeg: number;
}

export interface OpticalStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly radiusPx?: number;
  readonly pressure?: number;
}

export interface OpticalEnvironmentPalette {
  readonly skyRgb: RgbTuple;
  readonly horizonRgb: RgbTuple;
  readonly neonAccentRgb: RgbTuple;
}

export interface OpticalBrushStrokeOptions {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly material: OpticalBrushMaterialId;
  readonly points: readonly OpticalStrokePoint[];
  readonly defaultRadiusPx?: number;
  readonly lightDirection?: Vec3Tuple;
  readonly environmentPalette?: OpticalEnvironmentPalette;
  readonly thicknessPx?: number;
  readonly dispersionScale?: number;
  readonly frostBlurPx?: number;
  readonly anisotropyRatio?: number;
  readonly puddleTiltDeg?: number;
  readonly puddleWaterlineY?: number;
  readonly rippleAmplitude?: number;
  readonly rippleFrequency?: number;
  readonly opacity?: number;
  readonly seed?: number;
}

export interface SnellRefractionResult {
  readonly refractedDir: Vec3Tuple;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly totalInternalReflection: boolean;
}

export interface ChromaticDispersionResult {
  readonly red: SnellRefractionResult;
  readonly green: SnellRefractionResult;
  readonly blue: SnellRefractionResult;
  readonly dispersionSpreadPx: number;
}

export interface OpticalBrushDirtyBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface OpticalBrushResult {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly affectedPixelCount: number;
  readonly meanFresnel: number;
  readonly meanDispersionPx: number;
  readonly strokeTangent: readonly [number, number];
  readonly dirtyBounds: OpticalBrushDirtyBounds;
}

export const OPTICAL_BRUSH_MATERIALS: Readonly<Record<OpticalBrushMaterialId, OpticalMaterialPreset>> = {
  "raindrop-glass": {
    id: "raindrop-glass",
    labelKo: "물방울 유리 렌즈 (IOR 1.333)",
    summaryKo: "구면 돔 법선으로 배경을 굴절·확대하고 RGB 색분산과 미세 접촉 그림자를 만든다.",
    ior: 1.333,
    iorRgb: [1.324, 1.333, 1.348],
    f0Rgb: [0.0204, 0.0204, 0.0204],
    defaultThicknessPx: 14,
    defaultFrostBlurPx: 0,
    anisotropicAlphaT: 0.08,
    anisotropicAlphaB: 0.08,
    defaultPuddleTiltDeg: 0,
  },
  "frosted-crystal": {
    id: "frosted-crystal",
    labelKo: "서리 수정 다면체 (IOR 1.52)",
    summaryKo: "다면체 결정 법선 지터와 흐린 굴절 투과, 가장자리 커스틱스 반짝임을 표현한다.",
    ior: 1.52,
    iorRgb: [1.504, 1.52, 1.542],
    f0Rgb: [0.0426, 0.0426, 0.0426],
    defaultThicknessPx: 18,
    defaultFrostBlurPx: 2.6,
    anisotropicAlphaT: 0.16,
    anisotropicAlphaB: 0.16,
    defaultPuddleTiltDeg: 0,
  },
  "anisotropic-blade-metal": {
    id: "anisotropic-blade-metal",
    labelKo: "이방성 검신 메탈 (Brushed Blade)",
    summaryKo: "스트로크 접선 방향을 따라 결이 선 금속 프레넬 광택과 하늘·네온 띠 반사를 입힌다.",
    ior: 2.5,
    iorRgb: [2.5, 2.5, 2.5],
    f0Rgb: [0.88, 0.9, 0.94],
    defaultThicknessPx: 0,
    defaultFrostBlurPx: 0,
    anisotropicAlphaT: 0.09,
    anisotropicAlphaB: 0.48,
    defaultPuddleTiltDeg: 0,
  },
  "wet-puddle-mirror": {
    id: "wet-puddle-mirror",
    labelKo: "젖은 웅덩이 수면 거울",
    summaryKo: "컷 상단을 수면에 거꾸로 비추고 잔물결 굴곡과 스침각 프레넬 반사를 더한다.",
    ior: 1.333,
    iorRgb: [1.33, 1.333, 1.338],
    f0Rgb: [0.02, 0.02, 0.02],
    defaultThicknessPx: 8,
    defaultFrostBlurPx: 0,
    anisotropicAlphaT: 0.06,
    anisotropicAlphaB: 0.06,
    defaultPuddleTiltDeg: 74,
  },
};

const DEFAULT_ENV_PALETTE: OpticalEnvironmentPalette = {
  skyRgb: [0.68, 0.86, 1.0],
  horizonRgb: [0.98, 0.92, 0.84],
  neonAccentRgb: [0.18, 0.9, 1.0],
};

/** 슐릭(Schlick) 프레넬 근사식을 계산한다. 반환값은 항상 `[0, 1]` 범위를 보장한다. */
export function computeSchlickFresnel(cosTheta: number, f0: number): number {
  const safeF0 = clamp01(f0);
  const oneMinus = 1 - clamp01(cosTheta);
  const pow5 = oneMinus * oneMinus * oneMinus * oneMinus * oneMinus;
  return clamp01(safeF0 + (1 - safeF0) * pow5);
}

/** 3채널 RGB 슐릭 프레넬 반사율을 계산한다. */
export function computeSchlickFresnelRgb(cosTheta: number, f0Rgb: RgbTuple): RgbTuple {
  return [
    computeSchlickFresnel(cosTheta, f0Rgb[0]),
    computeSchlickFresnel(cosTheta, f0Rgb[1]),
    computeSchlickFresnel(cosTheta, f0Rgb[2]),
  ];
}

/**
 * 정확한 3D 스넬의 법칙(`n1 sin θ1 = n2 sin θ2`)으로 굴절 광선과 배경 UV 오프셋을 산출한다.
 */
export function computeSnellRefractedOffset(
  normal: Vec3Tuple,
  ior: number,
  thicknessPx: number,
  viewDir: Vec3Tuple = [0, 0, 1],
): SnellRefractionResult {
  const n = normalizeVec3(normal[0], normal[1], Math.max(0.01, normal[2]));
  const v = normalizeVec3(viewDir[0], viewDir[1], viewDir[2]);
  const ix = -v[0];
  const iy = -v[1];
  const iz = -v[2];

  const eta = 1.0 / clampRange(ior, 0.25, 4.0);
  const cosI = clamp01(-(ix * n[0] + iy * n[1] + iz * n[2]));
  const sin2T = eta * eta * Math.max(0, 1 - cosI * cosI);
  const safeThickness = clampRange(thicknessPx, 0, 128);

  if (sin2T >= 1.0 - 1e-6) {
    const dotIN = ix * n[0] + iy * n[1] + iz * n[2];
    const refDir = normalizeVec3(ix - 2 * dotIN * n[0], iy - 2 * dotIN * n[1], iz - 2 * dotIN * n[2]);
    return { refractedDir: refDir, offsetX: refDir[0] * safeThickness, offsetY: refDir[1] * safeThickness, totalInternalReflection: true };
  }

  const k = eta * cosI - Math.sqrt(Math.max(0, 1 - sin2T));
  const refractedDir = normalizeVec3(eta * ix + k * n[0], eta * iy + k * n[1], eta * iz + k * n[2]);
  const denom = Math.max(0.2, Math.abs(refractedDir[2]));
  const offsetX = (refractedDir[0] / denom) * safeThickness;
  const offsetY = (refractedDir[1] / denom) * safeThickness;
  return {
    refractedDir,
    offsetX: Number.isFinite(offsetX) ? offsetX : 0,
    offsetY: Number.isFinite(offsetY) ? offsetY : 0,
    totalInternalReflection: false,
  };
}

/** R/G/B 파장별 굴절률 차이(`iorRgb`)에 따른 스넬 색분산 오프셋을 산출한다. */
export function computeChromaticDispersionOffsets(
  normal: Vec3Tuple,
  iorRgb: RgbTuple,
  thicknessPx: number,
  viewDir: Vec3Tuple = [0, 0, 1],
): ChromaticDispersionResult {
  const red = computeSnellRefractedOffset(normal, iorRgb[0], thicknessPx, viewDir);
  const green = computeSnellRefractedOffset(normal, iorRgb[1], thicknessPx, viewDir);
  const blue = computeSnellRefractedOffset(normal, iorRgb[2], thicknessPx, viewDir);
  return { red, green, blue, dispersionSpreadPx: Math.hypot(red.offsetX - blue.offsetX, red.offsetY - blue.offsetY) };
}

/** 접선(T)·종접선(B) 기준 이방성 Ward + GGX 미세면 반사 강도를 평가한다. */
export function evaluateAnisotropicWardGgx(
  normal: Vec3Tuple,
  tangent: Vec3Tuple,
  bitangent: Vec3Tuple,
  viewDir: Vec3Tuple,
  lightDir: Vec3Tuple,
  alphaT: number,
  alphaB: number,
): number {
  const ndotL = Math.max(0, normal[0] * lightDir[0] + normal[1] * lightDir[1] + normal[2] * lightDir[2]);
  const ndotV = Math.max(0, normal[0] * viewDir[0] + normal[1] * viewDir[1] + normal[2] * viewDir[2]);
  if (ndotL <= 1e-4 || ndotV <= 1e-4) return 0;

  const h = normalizeVec3(viewDir[0] + lightDir[0], viewDir[1] + lightDir[1], viewDir[2] + lightDir[2]);
  const hdotN = Math.max(0.05, h[0] * normal[0] + h[1] * normal[1] + h[2] * normal[2]);
  const hdotT = h[0] * tangent[0] + h[1] * tangent[1] + h[2] * tangent[2];
  const hdotB = h[0] * bitangent[0] + h[1] * bitangent[1] + h[2] * bitangent[2];
  const aT = clampRange(alphaT, 0.03, 1.0);
  const aB = clampRange(alphaB, 0.03, 1.0);

  const expVal = -((hdotT / aT) * (hdotT / aT) + (hdotB / aB) * (hdotB / aB)) / (hdotN * hdotN);
  const ward = Math.exp(clampRange(expVal, -30, 0)) / (4 * Math.PI * aT * aB * Math.sqrt(ndotL * ndotV));
  const ggxTerm = (hdotT * hdotT) / (aT * aT) + (hdotB * hdotB) / (aB * aB) + hdotN * hdotN;
  const ggxD = 1 / (Math.PI * aT * aB * ggxTerm * ggxTerm + 1e-5);
  return clampRange(ward * 0.65 + ggxD * 0.25, 0, 8);
}

/** 픽셀 경계 밖 접근과 NaN을 차단하는 선형 색공간 이중선형 샘플러. */
export function sampleBilinearLinearRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) return [0, 0, 0, 0];
  const sx = Number.isFinite(x) ? clampRange(x, 0, width - 1) : 0;
  const sy = Number.isFinite(y) ? clampRange(y, 0, height - 1) : 0;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = sx - x0;
  const fy = sy - y0;
  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  const ch = (off: number): number =>
    srgbToLinearChannel(rgba[i00 + off] / 255) * w00 +
    srgbToLinearChannel(rgba[i10 + off] / 255) * w10 +
    srgbToLinearChannel(rgba[i01 + off] / 255) * w01 +
    srgbToLinearChannel(rgba[i11 + off] / 255) * w11;
  const a = (rgba[i00 + 3] * w00 + rgba[i10 + 3] * w10 + rgba[i01 + 3] * w01 + rgba[i11 + 3] * w11) / 255;
  return [ch(0), ch(1), ch(2), clamp01(a)];
}

function hash2d(ix: number, iy: number, seed: number): number {
  const n = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function sampleCrystalFacet(
  x: number,
  y: number,
  cellSizePx: number,
  seed: number,
): { readonly jitterX: number; readonly jitterY: number; readonly edgeCaustic: number } {
  const gx = x / cellSizePx;
  const gy = y / cellSizePx;
  const cx = Math.floor(gx);
  const cy = Math.floor(gy);
  let minD1 = 10;
  let minD2 = 10;
  let bestX = cx;
  let bestY = cy;

  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const nx = cx + ox;
      const ny = cy + oy;
      const d = Math.hypot(gx - (nx + 0.15 + 0.7 * hash2d(nx, ny, seed)), gy - (ny + 0.15 + 0.7 * hash2d(nx + 19, ny + 37, seed)));
      if (d < minD1) {
        minD2 = minD1;
        minD1 = d;
        bestX = nx;
        bestY = ny;
      } else if (d < minD2) {
        minD2 = d;
      }
    }
  }
  const angle = hash2d(bestX, bestY, seed + 101) * Math.PI * 2;
  const tilt = 0.32 + 0.42 * hash2d(bestX + 7, bestY + 13, seed + 211);
  return { jitterX: Math.cos(angle) * tilt, jitterY: Math.sin(angle) * tilt, edgeCaustic: clamp01(1 - smoothstep(0.02, 0.18, minD2 - minD1)) };
}

function sampleEnvironmentStrip(refDir: Vec3Tuple, tangent: Vec3Tuple, pal: OpticalEnvironmentPalette): RgbTuple {
  const skyMix = clamp01(0.5 - refDir[1] * 0.6 + refDir[2] * 0.2);
  const band = clamp01(Math.pow(1 - Math.abs(refDir[1]), 4)) * 0.55;
  const neon = smoothstep(0.55, 0.96, Math.abs(refDir[0] * tangent[0] + refDir[1] * tangent[1])) * 0.55;
  return [
    lerp(pal.horizonRgb[0] * 0.45, pal.skyRgb[0], skyMix) + pal.horizonRgb[0] * band + pal.neonAccentRgb[0] * neon,
    lerp(pal.horizonRgb[1] * 0.45, pal.skyRgb[1], skyMix) + pal.horizonRgb[1] * band + pal.neonAccentRgb[1] * neon,
    lerp(pal.horizonRgb[2] * 0.45, pal.skyRgb[2], skyMix) + pal.horizonRgb[2] * band + pal.neonAccentRgb[2] * neon,
  ];
}

interface ResampledDab {
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
  readonly pressure: number;
  readonly tx: number;
  readonly ty: number;
}

function buildStrokeDabs(
  points: readonly OpticalStrokePoint[],
  defaultRadiusPx: number,
): { readonly dabs: readonly ResampledDab[]; readonly meanTangent: readonly [number, number] } {
  if (points.length === 0) return { dabs: [], meanTangent: [1, 0] };
  if (points.length === 1) {
    const p = points[0];
    return {
      dabs: [{ x: p.x, y: p.y, radiusPx: clampRange(p.radiusPx ?? defaultRadiusPx, 1.5, 256), pressure: clampRange(p.pressure ?? 1, 0.1, 1), tx: 1, ty: 0 }],
      meanTangent: [1, 0],
    };
  }
  const dabs: ResampledDab[] = [];
  let sumTx = 0;
  let sumTy = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const segLen = Math.hypot(dx, dy);
    const tx = segLen > 1e-5 ? dx / segLen : 1;
    const ty = segLen > 1e-5 ? dy / segLen : 0;
    sumTx += tx;
    sumTy += ty;
    const r0 = clampRange(p0.radiusPx ?? defaultRadiusPx, 1.5, 256);
    const r1 = clampRange(p1.radiusPx ?? defaultRadiusPx, 1.5, 256);
    const pr0 = clampRange(p0.pressure ?? 1, 0.1, 1);
    const pr1 = clampRange(p1.pressure ?? 1, 0.1, 1);
    const count = Math.max(1, Math.ceil(segLen / Math.max(1.5, Math.min(r0, r1) * 0.35)));
    for (let s = 0; s <= count; s += 1) {
      if (i > 0 && s === 0) continue;
      const t = s / count;
      dabs.push({ x: lerp(p0.x, p1.x, t), y: lerp(p0.y, p1.y, t), radiusPx: lerp(r0, r1, t), pressure: lerp(pr0, pr1, t), tx, ty });
    }
  }
  const tLen = Math.hypot(sumTx, sumTy);
  return { dabs, meanTangent: tLen > 1e-5 ? [sumTx / tLen, sumTy / tLen] : [1, 0] };
}

/**
 * 2D 웹툰 컷 위에 4종 물리 기반 광학 매질(물방울 유리, 서리 수정, 이방성 검신 메탈, 젖은 웅덩이 거울)을
 * 브러시 스트로크로 직접 페인팅한다. 입력 버퍼는 변경하지 않는다.
 */
export function applyOpticalRefractionReflectionBrush(options: OpticalBrushStrokeOptions): OpticalBrushResult {
  const width = Math.max(0, Math.floor(options.width));
  const height = Math.max(0, Math.floor(options.height));
  const total = width * height;
  const emptyBounds: OpticalBrushDirtyBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  if (total === 0 || options.rgba.length < total * 4) {
    return { width, height, rgba: new Uint8ClampedArray(0), affectedPixelCount: 0, meanFresnel: 0, meanDispersionPx: 0, strokeTangent: [1, 0], dirtyBounds: emptyBounds };
  }

  const outRgba = new Uint8ClampedArray(options.rgba);
  const preset = OPTICAL_BRUSH_MATERIALS[options.material];
  const defaultRadiusPx = clampRange(options.defaultRadiusPx ?? 14, 2, 256);
  const { dabs, meanTangent } = buildStrokeDabs(options.points, defaultRadiusPx);
  if (dabs.length === 0) {
    return { width, height, rgba: outRgba, affectedPixelCount: 0, meanFresnel: 0, meanDispersionPx: 0, strokeTangent: meanTangent, dirtyBounds: emptyBounds };
  }

  const lightDir = options.lightDirection
    ? normalizeVec3(options.lightDirection[0], options.lightDirection[1], Math.max(0.1, options.lightDirection[2]))
    : normalizeVec3(-0.55, -0.58, 0.6);
  const palette = options.environmentPalette ?? DEFAULT_ENV_PALETTE;
  const opacity = clamp01(options.opacity ?? 0.96);
  const thicknessPx = clampRange(options.thicknessPx ?? preset.defaultThicknessPx, 0, 96);
  const dispersionScale = clampRange(options.dispersionScale ?? 1.0, 0, 3.5);
  const frostBlurPx = clampRange(options.frostBlurPx ?? preset.defaultFrostBlurPx, 0, 12);
  const anisotropyRatio = clampRange(options.anisotropyRatio ?? 1.0, 0.25, 3.0);
  const puddleTiltDeg = clampRange(options.puddleTiltDeg ?? preset.defaultPuddleTiltDeg, 0, 88);
  const rippleAmplitude = clampRange(options.rippleAmplitude ?? 0.16, 0, 0.75);
  const rippleFrequency = clampRange(options.rippleFrequency ?? 0.42, 0.05, 2.5);
  const seed = options.seed ?? 74;

  const iorRgb: RgbTuple = [
    preset.ior + (preset.iorRgb[0] - preset.ior) * dispersionScale,
    preset.ior,
    preset.ior + (preset.iorRgb[2] - preset.ior) * dispersionScale,
  ];

  const covField = new Float32Array(total);
  const nxField = new Float32Array(total);
  const nyField = new Float32Array(total);
  const nzField = new Float32Array(total);
  const txField = new Float32Array(total);
  const tyField = new Float32Array(total);
  const shadowField = new Float32Array(total);
  const centerDistField = new Float32Array(total);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let dIdx = 0; dIdx < dabs.length; dIdx += 1) {
    const dab = dabs[dIdx];
    const r = dab.radiusPx;
    const pad = options.material === "raindrop-glass" ? Math.ceil(r * 0.35) : 0;
    const x0 = Math.max(0, Math.floor(dab.x - r - pad));
    const x1 = Math.min(width - 1, Math.ceil(dab.x + r + pad));
    const y0 = Math.max(0, Math.floor(dab.y - r - pad));
    const y1 = Math.min(height - 1, Math.ceil(dab.y + r + pad));
    if (x0 > x1 || y0 > y1) continue;

    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
    const shCx = dab.x - lightDir[0] * r * 0.24;
    const shCy = dab.y - lightDir[1] * r * 0.24;

    for (let y = y0; y <= y1; y += 1) {
      const row = y * width;
      for (let x = x0; x <= x1; x += 1) {
        const idx = row + x;
        const dx = (x - dab.x) / r;
        const dy = (y - dab.y) / r;
        const distSq = dx * dx + dy * dy;

        if (options.material === "raindrop-glass") {
          const sDist = Math.hypot((x - shCx) / (r * 1.06), (y - shCy) / (r * 1.06));
          if (sDist < 1.0 && distSq >= 0.72) {
            const contact = (1 - smoothstep(0.68, 1.0, sDist)) * 0.42 * dab.pressure;
            if (contact > shadowField[idx]) shadowField[idx] = contact;
          }
        }
        if (distSq >= 1.0) continue;

        const dist = Math.sqrt(distSq);
        const cov = (1 - smoothstep(0.84, 1.0, dist)) * dab.pressure * opacity;
        if (cov <= covField[idx]) continue;

        covField[idx] = cov;
        centerDistField[idx] = dist;
        txField[idx] = dab.tx;
        tyField[idx] = dab.ty;

        let nVec: Vec3Tuple;
        if (options.material === "raindrop-glass") {
          nVec = normalizeVec3(dx * 0.96, dy * 0.96, Math.sqrt(Math.max(0.06, 1 - distSq)));
        } else if (options.material === "frosted-crystal") {
          const f = sampleCrystalFacet(x, y, Math.max(4, r * 0.35), seed);
          nVec = normalizeVec3(dx * 0.45 + f.jitterX, dy * 0.45 + f.jitterY, Math.sqrt(Math.max(0.12, 1 - distSq * 0.7)));
        } else if (options.material === "anisotropic-blade-metal") {
          const bx = -dab.ty;
          const by = dab.tx;
          const cross = dx * bx + dy * by;
          const slope = (cross >= 0 ? 1 : -1) * smoothstep(0.04, 0.75, Math.abs(cross)) * 0.48;
          nVec = normalizeVec3(bx * slope, by * slope, 0.88);
        } else {
          const w1 = Math.sin(dist * r * rippleFrequency + seed * 0.3);
          const w2 = Math.cos((x * 0.35 + y * 0.65) * rippleFrequency * 0.5);
          nVec = normalizeVec3((dx * w1 * 0.7 + w2 * 0.3) * rippleAmplitude, (dy * w1 * 0.7 - w2 * 0.3) * rippleAmplitude, 1.0);
        }
        nxField[idx] = nVec[0];
        nyField[idx] = nVec[1];
        nzField[idx] = nVec[2];
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { width, height, rgba: outRgba, affectedPixelCount: 0, meanFresnel: 0, meanDispersionPx: 0, strokeTangent: meanTangent, dirtyBounds: emptyBounds };
  }

  const waterlineY = options.puddleWaterlineY ?? minY;
  const viewDir: Vec3Tuple = [0, 0, 1];
  const halfLight = normalizeVec3(lightDir[0], lightDir[1], lightDir[2] + 1);
  const tiltRad = (puddleTiltDeg * Math.PI) / 180;
  const puddleViewDir = normalizeVec3(0, Math.sin(tiltRad), Math.cos(tiltRad));

  let affectedPixelCount = 0;
  let fresnelSum = 0;
  let dispersionSum = 0;

  for (let y = minY; y <= maxY; y += 1) {
    const row = y * width;
    for (let x = minX; x <= maxX; x += 1) {
      const idx = row + x;
      const o = idx * 4;
      const cov = covField[idx];
      const sh = shadowField[idx];
      const baseR = srgbToLinearChannel(options.rgba[o] / 255);
      const baseG = srgbToLinearChannel(options.rgba[o + 1] / 255);
      const baseB = srgbToLinearChannel(options.rgba[o + 2] / 255);

      if (cov <= 1e-4) {
        if (sh > 1e-4) {
          const dark = 1 - sh;
          outRgba[o] = Math.round(clamp01(linearToSrgbChannel(baseR * dark)) * 255);
          outRgba[o + 1] = Math.round(clamp01(linearToSrgbChannel(baseG * dark)) * 255);
          outRgba[o + 2] = Math.round(clamp01(linearToSrgbChannel(baseB * dark)) * 255);
          affectedPixelCount += 1;
        }
        continue;
      }

      const normal: Vec3Tuple = [nxField[idx], nyField[idx], nzField[idx]];
      let resR: number;
      let resG: number;
      let resB: number;

      if (options.material === "raindrop-glass") {
        const disp = computeChromaticDispersionOffsets(normal, iorRgb, thicknessPx, viewDir);
        dispersionSum += disp.dispersionSpreadPx;
        const rTap = sampleBilinearLinearRgba(options.rgba, width, height, x + disp.red.offsetX, y + disp.red.offsetY)[0];
        const gTap = sampleBilinearLinearRgba(options.rgba, width, height, x + disp.green.offsetX, y + disp.green.offsetY)[1];
        const bTap = sampleBilinearLinearRgba(options.rgba, width, height, x + disp.blue.offsetX, y + disp.blue.offsetY)[2];
        const fresnel = computeSchlickFresnel(clamp01(normal[2]), preset.f0Rgb[0]);
        fresnelSum += fresnel;
        const refDir = normalizeVec3(-2 * normal[2] * normal[0], -2 * normal[2] * normal[1], 1 - 2 * normal[2] * normal[2]);
        const env = sampleEnvironmentStrip(refDir, [1, 0, 0], palette);
        const glint = Math.pow(Math.max(0, normal[0] * halfLight[0] + normal[1] * halfLight[1] + normal[2] * halfLight[2]), 72) * 1.45;
        const caustic = Math.pow(Math.max(0, -(normal[0] * lightDir[0] + normal[1] * lightDir[1]) + 0.15), 2.5) * 0.28;
        resR = lerp(rTap * (1 + caustic), env[0], fresnel * 0.85) + glint;
        resG = lerp(gTap * (1 + caustic), env[1], fresnel * 0.85) + glint;
        resB = lerp(bTap * (1 + caustic), env[2], fresnel * 0.85) + glint;
      } else if (options.material === "frosted-crystal") {
        const disp = computeChromaticDispersionOffsets(normal, iorRgb, thicknessPx, viewDir);
        dispersionSum += disp.dispersionSpreadPx;
        const b = frostBlurPx;
        const taps: readonly (readonly [number, number])[] = [[0, 0], [b, 0], [-b, 0], [0, b], [0, -b]];
        let tR = 0;
        let tG = 0;
        let tB = 0;
        for (let t = 0; t < taps.length; t += 1) {
          const ox = taps[t][0];
          const oy = taps[t][1];
          tR += sampleBilinearLinearRgba(options.rgba, width, height, x + disp.red.offsetX + ox, y + disp.red.offsetY + oy)[0];
          tG += sampleBilinearLinearRgba(options.rgba, width, height, x + disp.green.offsetX + ox, y + disp.green.offsetY + oy)[1];
          tB += sampleBilinearLinearRgba(options.rgba, width, height, x + disp.blue.offsetX + ox, y + disp.blue.offsetY + oy)[2];
        }
        const facet = sampleCrystalFacet(x, y, Math.max(4, defaultRadiusPx * 0.35), seed);
        const fresnel = computeSchlickFresnel(clamp01(normal[2]), preset.f0Rgb[0]);
        fresnelSum += fresnel;
        const ndotH = Math.max(0, normal[0] * halfLight[0] + normal[1] * halfLight[1] + normal[2] * halfLight[2]);
        const sparkle = (Math.pow(ndotH, 36) * 0.85 + facet.edgeCaustic * 0.42) * (0.45 + 0.55 * centerDistField[idx]);
        resR = lerp((tR / 5) * 0.94 + 0.05, palette.skyRgb[0], fresnel * 0.65) + sparkle * 0.96;
        resG = lerp((tG / 5) * 0.96 + 0.06, palette.skyRgb[1], fresnel * 0.65) + sparkle * 0.99;
        resB = lerp((tB / 5) * 0.99 + 0.08, palette.skyRgb[2], fresnel * 0.65) + sparkle * 1.05;
      } else if (options.material === "anisotropic-blade-metal") {
        const tx = txField[idx];
        const ty = tyField[idx];
        const tDotN = tx * normal[0] + ty * normal[1];
        const T = normalizeVec3(tx - tDotN * normal[0], ty - tDotN * normal[1], -tDotN * normal[2]);
        const B = normalizeVec3(normal[1] * T[2] - normal[2] * T[1], normal[2] * T[0] - normal[0] * T[2], normal[0] * T[1] - normal[1] * T[0]);
        const alphaT = clampRange(preset.anisotropicAlphaT / anisotropyRatio, 0.03, 0.6);
        const alphaB = clampRange(preset.anisotropicAlphaB * anisotropyRatio, 0.08, 0.95);
        const spec = evaluateAnisotropicWardGgx(normal, T, B, viewDir, lightDir, alphaT, alphaB);
        const grain = 0.88 + 0.12 * Math.sin((x * B[0] + y * B[1]) * 1.85 + seed);
        const ndotV = clamp01(normal[2]);
        const fRgb = computeSchlickFresnelRgb(ndotV, preset.f0Rgb);
        fresnelSum += (fRgb[0] + fRgb[1] + fRgb[2]) / 3;
        const refDir = normalizeVec3(2 * ndotV * normal[0] + T[0] * 0.35, 2 * ndotV * normal[1] + T[1] * 0.35, 2 * ndotV * normal[2] - 1);
        const env = sampleEnvironmentStrip(refDir, T, palette);
        resR = (baseR * 0.22 + env[0] * fRgb[0] * 0.62 + fRgb[0] * spec * 0.55) * grain;
        resG = (baseG * 0.22 + env[1] * fRgb[1] * 0.62 + fRgb[1] * spec * 0.55) * grain;
        resB = (baseB * 0.22 + env[2] * fRgb[2] * 0.62 + fRgb[2] * spec * 0.55) * grain;
      } else {
        const reflY = clampRange(waterlineY - Math.max(0, y - waterlineY) + normal[1] * 18, 0, height - 1);
        const reflX = clampRange(x + normal[0] * 18, 0, width - 1);
        const refl = sampleBilinearLinearRgba(options.rgba, width, height, reflX, reflY);
        const cosT = clamp01(normal[0] * puddleViewDir[0] + normal[1] * puddleViewDir[1] + normal[2] * puddleViewDir[2]);
        const fresnel = computeSchlickFresnel(cosT, preset.f0Rgb[0]);
        fresnelSum += fresnel;
        const glint = Math.pow(Math.max(0, normal[0] * halfLight[0] + normal[1] * halfLight[1] + normal[2] * halfLight[2]), 54) * 0.55 * fresnel;
        resR = lerp(baseR * 0.68, refl[0], fresnel) + glint;
        resG = lerp(baseG * 0.7, refl[1], fresnel) + glint;
        resB = lerp(baseB * 0.74, refl[2], fresnel) + glint;
      }

      outRgba[o] = Math.round(clamp01(linearToSrgbChannel(lerp(baseR, resR, cov))) * 255);
      outRgba[o + 1] = Math.round(clamp01(linearToSrgbChannel(lerp(baseG, resG, cov))) * 255);
      outRgba[o + 2] = Math.round(clamp01(linearToSrgbChannel(lerp(baseB, resB, cov))) * 255);
      outRgba[o + 3] = options.rgba[o + 3];
      affectedPixelCount += 1;
    }
  }

  return {
    width,
    height,
    rgba: outRgba,
    affectedPixelCount,
    meanFresnel: affectedPixelCount > 0 ? fresnelSum / affectedPixelCount : 0,
    meanDispersionPx: affectedPixelCount > 0 ? dispersionSum / affectedPixelCount : 0,
    strokeTangent: meanTangent,
    dirtyBounds: { minX, minY, maxX, maxY },
  };
}
