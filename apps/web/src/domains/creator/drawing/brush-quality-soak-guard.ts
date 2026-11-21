/**
 * brush-quality-soak-guard.ts
 *
 * 전 브러시 12종(Krita 5.2 + Clip Studio Paint 3.0 기준)의:
 * 1) 다층 왁스-종이 요철 합성기(크레용 갈필 스킵·방향성 긁힘·가장자리 왁스 부스러기)
 * 2) 12종 전 브러시 실측 픽셀 버퍼 스탬프 렌더러(재사용 타깃 버퍼로 GC 억제)
 * 3) 장시간 10,000+ 포인트 연속 획 O(1) 링버퍼 성능 가드·입력 누락(Dead Stroke) 0건 보증기
 */

import {
  studioOssApplyMaterialColorChannel,
  studioOssChalkRotationRadians,
  studioOssDirectionalWaxSample,
  studioOssEqualAreaDiskOffset,
  studioOssFabricCrayonGrainAdhesion,
  studioOssKlecksChalkCoverage,
  studioOssOilBristleFilm,
  studioOssSprayTipCoverage,
  studioOssUnitHash,
  studioOssValueNoise2d,
  studioOssWatercolorTipCoverage,
} from "../studio-oss-brush-kernels";

export const BRUSH_SOAK_DEFAULT_MAX_HISTORY = 64;
export const BRUSH_SOAK_DEFAULT_MAX_DABS_PER_STEP = 24;
export const BRUSH_SOAK_MAX_RETAINED_DABS = 256;

export const BRUSH_QUALITY_12_FAMILIES = [
  "crayon",
  "pencil",
  "g-pen",
  "charcoal",
  "pastel",
  "chalk",
  "watercolor",
  "oil",
  "marker",
  "airbrush",
  "spray",
  "sumi-dry-rake",
] as const;

export type BrushQualityFamilyId = (typeof BRUSH_QUALITY_12_FAMILIES)[number];
export type BrushQualityDualTextureId = "paper" | "canvas-weave" | "sand" | "fibers" | "grain" | "mesh";

export interface BrushFamilyCompetitorSpec {
  readonly id: BrushQualityFamilyId;
  readonly labelKo: string;
  readonly minSpacingRatio: number;
  readonly pressureSizeRange: readonly [number, number];
  readonly pressureOpacityRange: readonly [number, number];
  readonly pressureGamma: number;
  readonly tiltWidthExpandMax: number;
  readonly exitTaperStrength: number;
  readonly stabilizerLevel: number;
  readonly minVisibleAlpha: number;
  readonly paperGrainBite: number;
  readonly anisotropyRatio: number;
  readonly crumbScatter: number;
  readonly dualTextureId: BrushQualityDualTextureId;
}

export const BRUSH_QUALITY_FAMILY_SPECS: Readonly<
  Record<BrushQualityFamilyId, BrushFamilyCompetitorSpec>
> = Object.freeze({
  crayon: { id: "crayon", labelKo: "왁스 크레용", minSpacingRatio: 0.11, pressureSizeRange: [0.36, 1.38], pressureOpacityRange: [0.22, 0.98], pressureGamma: 0.84, tiltWidthExpandMax: 1.85, exitTaperStrength: 0.58, stabilizerLevel: 26, minVisibleAlpha: 0.12, paperGrainBite: 0.95, anisotropyRatio: 2.3, crumbScatter: 0.88, dualTextureId: "paper" },
  pencil: { id: "pencil", labelKo: "흑연 연필 (2B)", minSpacingRatio: 0.12, pressureSizeRange: [0.28, 1.24], pressureOpacityRange: [0.18, 0.94], pressureGamma: 0.82, tiltWidthExpandMax: 2.15, exitTaperStrength: 0.68, stabilizerLevel: 24, minVisibleAlpha: 0.11, paperGrainBite: 0.84, anisotropyRatio: 1.9, crumbScatter: 0.42, dualTextureId: "paper" },
  "g-pen": { id: "g-pen", labelKo: "G펜 / 만화 잉크", minSpacingRatio: 0.08, pressureSizeRange: [0.12, 1.36], pressureOpacityRange: [0.68, 1.0], pressureGamma: 0.95, tiltWidthExpandMax: 1.22, exitTaperStrength: 0.86, stabilizerLevel: 54, minVisibleAlpha: 0.32, paperGrainBite: 0.08, anisotropyRatio: 1.15, crumbScatter: 0.04, dualTextureId: "mesh" },
  charcoal: { id: "charcoal", labelKo: "건식 목탄", minSpacingRatio: 0.12, pressureSizeRange: [0.34, 1.42], pressureOpacityRange: [0.2, 0.96], pressureGamma: 0.72, tiltWidthExpandMax: 2.25, exitTaperStrength: 0.56, stabilizerLevel: 22, minVisibleAlpha: 0.12, paperGrainBite: 0.94, anisotropyRatio: 2.0, crumbScatter: 0.82, dualTextureId: "grain" },
  pastel: { id: "pastel", labelKo: "소프트 파스텔", minSpacingRatio: 0.11, pressureSizeRange: [0.4, 1.35], pressureOpacityRange: [0.26, 0.94], pressureGamma: 0.76, tiltWidthExpandMax: 1.95, exitTaperStrength: 0.52, stabilizerLevel: 26, minVisibleAlpha: 0.15, paperGrainBite: 0.92, anisotropyRatio: 1.65, crumbScatter: 0.72, dualTextureId: "grain" },
  chalk: { id: "chalk", labelKo: "초크 (분필)", minSpacingRatio: 0.12, pressureSizeRange: [0.38, 1.34], pressureOpacityRange: [0.22, 0.95], pressureGamma: 0.8, tiltWidthExpandMax: 1.9, exitTaperStrength: 0.54, stabilizerLevel: 24, minVisibleAlpha: 0.13, paperGrainBite: 0.93, anisotropyRatio: 1.75, crumbScatter: 0.8, dualTextureId: "paper" },
  watercolor: { id: "watercolor", labelKo: "수채화 워시", minSpacingRatio: 0.1, pressureSizeRange: [0.36, 1.32], pressureOpacityRange: [0.2, 0.86], pressureGamma: 0.88, tiltWidthExpandMax: 1.65, exitTaperStrength: 0.6, stabilizerLevel: 38, minVisibleAlpha: 0.12, paperGrainBite: 0.52, anisotropyRatio: 1.2, crumbScatter: 0.18, dualTextureId: "paper" },
  oil: { id: "oil", labelKo: "유화 임파스토", minSpacingRatio: 0.1, pressureSizeRange: [0.38, 1.34], pressureOpacityRange: [0.36, 0.98], pressureGamma: 0.9, tiltWidthExpandMax: 1.75, exitTaperStrength: 0.55, stabilizerLevel: 34, minVisibleAlpha: 0.18, paperGrainBite: 0.64, anisotropyRatio: 2.5, crumbScatter: 0.22, dualTextureId: "canvas-weave" },
  marker: { id: "marker", labelKo: "알코올 마커", minSpacingRatio: 0.09, pressureSizeRange: [0.46, 1.24], pressureOpacityRange: [0.34, 0.88], pressureGamma: 0.86, tiltWidthExpandMax: 1.8, exitTaperStrength: 0.48, stabilizerLevel: 40, minVisibleAlpha: 0.18, paperGrainBite: 0.28, anisotropyRatio: 1.85, crumbScatter: 0.08, dualTextureId: "canvas-weave" },
  airbrush: { id: "airbrush", labelKo: "에어브러시", minSpacingRatio: 0.12, pressureSizeRange: [0.44, 1.3], pressureOpacityRange: [0.16, 0.84], pressureGamma: 0.92, tiltWidthExpandMax: 1.5, exitTaperStrength: 0.5, stabilizerLevel: 34, minVisibleAlpha: 0.1, paperGrainBite: 0.34, anisotropyRatio: 1.15, crumbScatter: 0.32, dualTextureId: "sand" },
  spray: { id: "spray", labelKo: "스프레이 스플래터", minSpacingRatio: 0.22, pressureSizeRange: [0.42, 1.36], pressureOpacityRange: [0.22, 0.92], pressureGamma: 0.94, tiltWidthExpandMax: 1.6, exitTaperStrength: 0.5, stabilizerLevel: 20, minVisibleAlpha: 0.14, paperGrainBite: 0.38, anisotropyRatio: 1.35, crumbScatter: 0.94, dualTextureId: "sand" },
  "sumi-dry-rake": { id: "sumi-dry-rake", labelKo: "갈필 먹붓", minSpacingRatio: 0.1, pressureSizeRange: [0.22, 1.4], pressureOpacityRange: [0.26, 0.98], pressureGamma: 0.8, tiltWidthExpandMax: 2.1, exitTaperStrength: 0.78, stabilizerLevel: 32, minVisibleAlpha: 0.14, paperGrainBite: 0.88, anisotropyRatio: 2.8, crumbScatter: 0.62, dualTextureId: "fibers" },
});

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clampRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return value < min ? min : value > max ? max : value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const diff = edge1 - edge0;
  if (Math.abs(diff) < 1e-6) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / diff);
  return t * t * (3 - 2 * t);
}

export interface CrayonWaxPaperTexelInput {
  readonly worldX: number;
  readonly worldY: number;
  readonly normalizedX: number;
  readonly normalizedY: number;
  readonly pressure01: number;
  readonly velocity01?: number;
  readonly tilt01?: number;
  readonly directionRadians?: number;
  readonly seed?: number;
  readonly paperScale?: number;
}

export interface CrayonWaxPaperTexelSample {
  readonly alpha: number;
  readonly paperPeak: number;
  readonly drySkip01: number;
  readonly groove: number;
  readonly crumbAlpha: number;
  readonly isCrumb: boolean;
}

/**
 * 크레용 4계층 왁스-종이 요철 물리 합성기:
 * (1) 2-옥타브 냉압지 산/골 높이장 → (2) 이방성 왁스 긁힘 →
 * (3) 저필압 갈필 스킵 vs 고필압 소성 왁스 골 메움 → (4) 외곽 왁스 부스러기 산란.
 */
export function evaluateCrayonWaxPaperTexel(
  input: CrayonWaxPaperTexelInput,
): CrayonWaxPaperTexelSample {
  const nx = finite(input.normalizedX);
  const ny = finite(input.normalizedY);
  const p = clamp01(finite(input.pressure01, 0.5));
  const v = clamp01(finite(input.velocity01 ?? 0.25, 0.25));
  const tilt = clamp01(finite(input.tilt01 ?? 0.2, 0.2));
  const dir = finite(input.directionRadians ?? 0, 0);
  const seed = Math.trunc(finite(input.seed ?? 0x51a7, 0x51a7));
  const scale = clampRange(input.paperScale ?? 1, 0.35, 3, 1);

  const cosD = Math.cos(dir);
  const sinD = Math.sin(dir);
  const along = nx * cosD + ny * sinD;
  const across = -nx * sinD + ny * cosD;
  const radial = Math.hypot(along / (1 + tilt * 0.65), across);

  const wx = finite(input.worldX) * scale;
  const wy = finite(input.worldY) * scale;
  const adhesion = studioOssFabricCrayonGrainAdhesion(wx, wy, p, v * 45, seed, dir);
  const directional = studioOssDirectionalWaxSample(along * 8.5, across * 16.5, 0, seed ^ 0x3b71, 1.25);
  // 스트로크 진행 방향(along)으로 길게 끌리고 횡방향(across)으로 미세 긁힘 홈이 생기는 이방성 왁스 리본
  const strandRib = studioOssValueNoise2d(along * 0.95, across * 18.5, seed ^ 0x71c3);
  const rimPerturb =
    (directional.wax - 0.5) * 0.34 + (adhesion.paperPeak - 0.5) * 0.26 + (strandRib - 0.5) * 0.16;
  const effectiveRadial = radial + rimPerturb;

  if (effectiveRadial > 0.96) {
    if (radial >= 0.76 && radial <= 1.08) {
      const crumbGate = studioOssValueNoise2d(wx * 1.35, wy * 1.35, seed ^ 0x99d1);
      const crumbThreshold = 0.66 - (1 - p) * 0.08;
      if (crumbGate > crumbThreshold && adhesion.paperPeak > 0.44) {
        const crumbAlpha = clamp01(
          ((crumbGate - crumbThreshold) / (1 - crumbThreshold))
            * (0.42 + p * 0.45)
            * (0.55 + adhesion.paperPeak * 0.45),
        );
        return { alpha: crumbAlpha, paperPeak: adhesion.paperPeak, drySkip01: adhesion.drySkip01, groove: adhesion.groove, crumbAlpha, isCrumb: true };
      }
    }
    return { alpha: 0, paperPeak: adhesion.paperPeak, drySkip01: 1, groove: adhesion.groove, crumbAlpha: 0, isCrumb: false };
  }

  const shoulder = smoothstep(0.98, 0.56, effectiveRadial);
  const valleyFill = p ** 1.35;
  const drySkipThreshold = clamp01((1 - valleyFill) * (0.48 + v * 0.14));
  const peakCatch = smoothstep(drySkipThreshold - 0.09, drySkipThreshold + 0.11, adhesion.paperPeak);
  const strandMod = 0.28 + 0.72 * strandRib;
  const grooveCut = 1 - directional.scrape * (0.54 - valleyFill * 0.3);
  // 저필압: 종이 산(peak)에 방향성 왁스 가닥이 선명하게 물리고 골(valley)은 여백 유지
  // 고필압: 소성 왁스가 골까지 밀려 들어가며 불투명하게 누적
  const dryBody = peakCatch * (0.54 + 0.46 * directional.wax) * strandMod * 1.18;
  const burnishBody = valleyFill * (0.76 + 0.24 * adhesion.deposit) * (0.78 + 0.22 * strandMod);
  const alpha = clamp01(shoulder * grooveCut * (dryBody * (1 - valleyFill * 0.45) + burnishBody));
  return { alpha, paperPeak: adhesion.paperPeak, drySkip01: clamp01(1 - peakCatch), groove: adhesion.groove, crumbAlpha: 0, isCrumb: false };
}

export interface CrayonWaxStampResult {
  readonly buffer: Float32Array;
  readonly size: number;
  readonly crumbCount: number;
  readonly drySkipFraction: number;
  readonly peakContrast: number;
  readonly reusedBuffer: boolean;
}

/** 크레용 다층 왁스-종이 요철 스탬프 버퍼(size×size Float32Array) 생성. */
export function synthesizeCrayonWaxPaperStamp(
  options: {
    readonly size?: number;
    readonly pressure01: number;
    readonly velocity01?: number;
    readonly tilt01?: number;
    readonly directionRadians?: number;
    readonly originX?: number;
    readonly originY?: number;
    readonly seed?: number;
  },
  reusableTarget?: Float32Array,
): CrayonWaxStampResult {
  const size = Math.max(16, Math.min(128, Math.floor(finite(options.size ?? 64, 64))));
  const total = size * size;
  const reusedBuffer = reusableTarget !== undefined && reusableTarget.length >= total;
  const buffer = reusedBuffer ? reusableTarget : new Float32Array(total);
  if (reusedBuffer) buffer.fill(0, 0, total);

  const half = (size - 1) * 0.5;
  const ox = finite(options.originX ?? 32, 32);
  const oy = finite(options.originY ?? 32, 32);
  const seed = Math.trunc(finite(options.seed ?? 0x51a7, 0x51a7));
  const p = clamp01(finite(options.pressure01, 0.5));
  const dir = finite(options.directionRadians ?? 0, 0);

  let interiorPixels = 0;
  let skippedValleys = 0;
  let peakSum = 0;
  let peakCount = 0;
  let valleySum = 0;
  let valleyCount = 0;
  let crumbCount = 0;

  for (let y = 0; y < size; y += 1) {
    const ny = (y - half) / half;
    for (let x = 0; x < size; x += 1) {
      const nx = (x - half) / half;
      const sample = evaluateCrayonWaxPaperTexel({
        worldX: ox + (x - half) * 0.55,
        worldY: oy + (y - half) * 0.55,
        normalizedX: nx,
        normalizedY: ny,
        pressure01: p,
        velocity01: options.velocity01,
        tilt01: options.tilt01,
        directionRadians: dir,
        seed,
      });
      buffer[y * size + x] = sample.alpha;
      const r = Math.hypot(nx, ny);
      if (r <= 0.76) {
        interiorPixels += 1;
        if (sample.alpha < 0.14) skippedValleys += 1;
        if (sample.paperPeak >= 0.62) {
          peakSum += sample.alpha;
          peakCount += 1;
        } else if (sample.paperPeak <= 0.38) {
          valleySum += sample.alpha;
          valleyCount += 1;
        }
      } else if (sample.isCrumb && sample.alpha > 0.08) {
        crumbCount += 1;
      }
    }
  }

  const targetCrumbs = Math.round(14 + (1 - p) * 14);
  for (let i = 0; i < targetCrumbs; i += 1) {
    const offset = studioOssEqualAreaDiskOffset(seed ^ 0x4c1d, i, 1, i * 17);
    const ringR = 0.8 + offset.distance * 0.24;
    const cx = Math.round(half + Math.cos(offset.angle) * ringR * half);
    const cy = Math.round(half + Math.sin(offset.angle) * ringR * half);
    if (cx < 0 || cx >= size || cy < 0 || cy >= size) continue;
    const crumbAlpha = clamp01(0.28 + studioOssUnitHash(seed, i, 0x77) * 0.52 * (0.55 + p * 0.45));
    const idx = cy * size + cx;
    if (buffer[idx]! < crumbAlpha) {
      buffer[idx] = crumbAlpha;
      crumbCount += 1;
    }
  }

  return {
    buffer,
    size,
    crumbCount,
    drySkipFraction: interiorPixels > 0 ? skippedValleys / interiorPixels : 0,
    peakContrast: Math.max(
      0,
      (peakCount > 0 ? peakSum / peakCount : 0) - (valleyCount > 0 ? valleySum / valleyCount : 0),
    ),
    reusedBuffer,
  };
}

export interface RenderBrushFamilyStampOptions {
  readonly familyId: BrushQualityFamilyId;
  readonly size?: number;
  readonly pressure01: number;
  readonly velocity01?: number;
  readonly tilt01?: number;
  readonly directionRadians?: number;
  readonly seed?: number;
}

/** 12종 전 브러시 패밀리의 실제 커널 기반 픽셀 알파/안료 버퍼(Float32Array) 생성. */
export function renderBrushFamilyStampBuffer(
  options: RenderBrushFamilyStampOptions,
  reusableTarget?: Float32Array,
): Readonly<{ buffer: Float32Array; size: number; reusedBuffer: boolean; crumbCount: number }> {
  const size = Math.max(16, Math.min(128, Math.floor(finite(options.size ?? 64, 64))));
  if (options.familyId === "crayon") {
    const res = synthesizeCrayonWaxPaperStamp(
      { size, pressure01: options.pressure01, velocity01: options.velocity01, tilt01: options.tilt01, directionRadians: options.directionRadians, seed: options.seed },
      reusableTarget,
    );
    return { buffer: res.buffer, size: res.size, reusedBuffer: res.reusedBuffer, crumbCount: res.crumbCount };
  }

  const total = size * size;
  const reusedBuffer = reusableTarget !== undefined && reusableTarget.length >= total;
  const buffer = reusedBuffer ? reusableTarget : new Float32Array(total);
  buffer.fill(0, 0, total);

  const half = (size - 1) * 0.5;
  const p = clamp01(finite(options.pressure01, 0.5));
  const v = clamp01(finite(options.velocity01 ?? 0.25, 0.25));
  const tilt = clamp01(finite(options.tilt01 ?? 0.15, 0.15));
  const dir = finite(options.directionRadians ?? 0, 0);
  const seed = Math.trunc(finite(options.seed ?? 0x2026, 0x2026));
  const cosD = Math.cos(dir);
  const sinD = Math.sin(dir);

  if (options.familyId === "spray") {
    const dropletCount = Math.round(48 + p * 64);
    let crumbs = 0;
    for (let i = 0; i < dropletCount; i += 1) {
      const d = studioOssEqualAreaDiskOffset(seed ^ 0x59a1, i, 0.94, i * 13);
      const cx = half + d.x * half;
      const cy = half + d.y * half;
      const dr = 0.8 + studioOssUnitHash(seed, i, 0x2b) * (1.8 + p * 1.4);
      const dropAlpha = clamp01(0.38 + p * 0.52 * studioOssUnitHash(seed, i, 0x6f));
      const minX = Math.max(0, Math.floor(cx - dr - 1));
      const maxX = Math.min(size - 1, Math.ceil(cx + dr + 1));
      const minY = Math.max(0, Math.floor(cy - dr - 1));
      const maxY = Math.min(size - 1, Math.ceil(cy + dr + 1));
      for (let py = minY; py <= maxY; py += 1) {
        for (let px = minX; px <= maxX; px += 1) {
          const dist = Math.hypot(px - cx, py - cy) / dr;
          if (dist >= 1) continue;
          const idx = py * size + px;
          buffer[idx] = clamp01(buffer[idx]! + (1 - buffer[idx]!) * (1 - dist * dist) * dropAlpha);
        }
      }
      if (d.distance > 0.72) crumbs += 1;
    }
    return { buffer, size, reusedBuffer, crumbCount: crumbs };
  }

  const chalkRot = studioOssChalkRotationRadians(seed * 0.37, p * 19.3);
  const cosChalk = Math.cos(chalkRot);
  const sinChalk = Math.sin(chalkRot);
  let crumbCount = 0;

  for (let y = 0; y < size; y += 1) {
    const ny = (y - half) / half;
    for (let x = 0; x < size; x += 1) {
      const nx = (x - half) / half;
      const along = nx * cosD + ny * sinD;
      const across = -nx * sinD + ny * cosD;
      const r = Math.hypot(nx, ny);
      let alpha = 0;

      switch (options.familyId) {
        case "g-pen": {
          const aaWidth = 2.1 / size;
          const penR = 0.72 + p * 0.22;
          alpha = smoothstep(penR + aaWidth, penR - aaWidth, r) * (0.86 + p * 0.14);
          break;
        }
        case "pencil": {
          const pr = Math.hypot(along, across / (1 + tilt * 0.75));
          const wax = studioOssDirectionalWaxSample(along * 11, across * 11, 0, seed ^ 0x2b, 1);
          const tooth = studioOssValueNoise2d(x * 0.42, y * 0.42, seed ^ 0x71);
          const edge = smoothstep(0.95, 0.45, pr + (tooth - 0.5) * 0.24);
          const dryGate = smoothstep((1 - p) * 0.52, (1 - p) * 0.52 + 0.22, tooth * 0.62 + wax.wax * 0.38);
          alpha = clamp01(edge * (dryGate * (0.55 + p * 0.45) + p * 0.24));
          break;
        }
        case "charcoal": {
          const powder = studioOssKlecksChalkCoverage(nx, ny, seed ^ 0xc4, 1.25);
          const wax = studioOssDirectionalWaxSample(along * 11, across * 11, 0, seed ^ 0xc8, 1);
          const tooth = studioOssValueNoise2d(x * 0.42, y * 0.42, seed ^ 0x5c);
          const carbonMicro = studioOssValueNoise2d(x * 0.96, y * 0.96, seed ^ 0x9e31);
          const gritField = tooth * 0.52 + carbonMicro * 0.48;
          const edge = smoothstep(1.0, 0.4, r + (wax.wax - 0.5) * 0.36);
          const catchFactor = smoothstep((1 - p) * 0.44, (1 - p) * 0.44 + 0.2, gritField * 0.65 + powder * 0.35);
          alpha = clamp01(edge * (0.22 * powder + 0.44 * wax.wax + 0.48 * carbonMicro) * (0.18 + catchFactor * 1.15) * (0.62 + p * 0.46));
          if (r > 0.78 && alpha > 0.08) crumbCount += 1;
          break;
        }
        case "pastel": {
          const cake = studioOssKlecksChalkCoverage(nx * 0.94, ny * 0.94, seed ^ 0xb7, 1);
          const grain = studioOssValueNoise2d(x * 0.35, y * 0.35, seed ^ 0x4a);
          const edge = smoothstep(0.98, 0.42, r + (grain - 0.5) * 0.28);
          const bite = smoothstep((1 - p) * 0.42, (1 - p) * 0.42 + 0.24, grain * 0.55 + cake * 0.45);
          alpha = clamp01(edge * (0.34 + 0.66 * bite) * (0.46 + 0.54 * cake) * (0.62 + p * 0.42));
          if (r > 0.78 && alpha > 0.08) crumbCount += 1;
          break;
        }
        case "chalk": {
          const rx = nx * cosChalk - ny * sinChalk;
          const ry = nx * sinChalk + ny * cosChalk;
          const flake = studioOssKlecksChalkCoverage(rx, ry, seed ^ 0x41, 1.15);
          const mineral = studioOssValueNoise2d(x * 0.48, y * 0.48, seed ^ 0x91);
          const edge = smoothstep(0.98, 0.46, r + (mineral - 0.5) * 0.32);
          const skip = smoothstep((1 - p) * 0.54, (1 - p) * 0.54 + 0.2, mineral * 0.6 + flake * 0.4);
          alpha = clamp01(edge * (flake * 0.52 + mineral * 0.48) * (0.25 + skip * 0.9) * (0.55 + p * 0.5));
          if (r > 0.78 && alpha > 0.08) crumbCount += 1;
          break;
        }
        case "watercolor": {
          const wobble = (studioOssValueNoise2d(x * 0.16, y * 0.16, seed ^ 0x33) - 0.5) * 0.14;
          const wr = Math.max(0, r + wobble);
          if (wr < 1) {
            const scaleR = wr / Math.max(1e-4, r);
            const cov = studioOssWatercolorTipCoverage(nx * scaleR, ny * scaleR, seed ^ 0xd4, 0.32);
            const wetRim = Math.exp(-((wr - 0.89) ** 2) / 0.005) * (0.26 + p * 0.18);
            alpha = clamp01(cov * (0.45 + p * 0.45) + wetRim);
          }
          break;
        }
        case "oil": {
          const film = studioOssOilBristleFilm(
            along * 18,
            across * 18,
            0,
            seed ^ 0x61,
            (coord, lane, s) => studioOssValueNoise2d(coord, lane * 0.37, s),
          );
          const edge = smoothstep(0.96, 0.62, Math.hypot(along, across / (1 + tilt * 0.35)));
          const pigmentFilm = studioOssApplyMaterialColorChannel(200, film.color, film.lift, "paint-film") / 255;
          alpha = clamp01(edge * film.alpha * (0.58 + 0.42 * pigmentFilm) * (0.5 + p * 0.52));
          break;
        }
        case "marker": {
          const mr = Math.hypot(along / (1.65 + tilt * 0.55), across * 1.18);
          const weave = studioOssValueNoise2d(x * 0.32, y * 0.32, seed ^ 0x82);
          alpha = clamp01(smoothstep(0.9, 0.74, mr) * (0.52 + p * 0.32) * (0.86 + weave * 0.18));
          break;
        }
        case "airbrush": {
          alpha = clamp01(studioOssSprayTipCoverage(nx, ny, seed ^ 0xa1, 0.78) * (0.72 + p * 0.28));
          break;
        }
        case "sumi-dry-rake": {
          const tineWave = 0.5 + 0.5 * Math.cos(across * 8 * Math.PI);
          const bristleNoise = studioOssValueNoise2d(along * 2.4, across * 16.5, seed ^ 0x55);
          const splitLo = 0.32 + (1 - p) * 0.24 + v * 0.1;
          const drySplit = smoothstep(splitLo, splitLo + 0.24, tineWave * 0.68 + bristleNoise * 0.32);
          const edge = smoothstep(0.98, 0.44, Math.hypot(along, across) + (bristleNoise - 0.5) * 0.24);
          alpha = clamp01(edge * (drySplit * 0.94 + p * 0.22 * tineWave) * (0.72 + p * 0.32));
          if (r > 0.78 && alpha > 0.08) crumbCount += 1;
          break;
        }
        default: {
          alpha = clamp01(smoothstep(1, 0.5, r) * 0.2);
        }
      }
      buffer[y * size + x] = alpha;
    }
  }
  return { buffer, size, reusedBuffer, crumbCount };
}

export interface BrushStrokeSoakInputPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure01?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly tilt01?: number;
  readonly timestampMs?: number;
}

export interface BrushStrokeEmittedDab {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
  readonly aspectRatio: number;
  readonly angleRadians: number;
  readonly opacity01: number;
  readonly effectivePressure01: number;
  readonly drySkip01: number;
}

export interface BrushStrokeSoakGuardOptions {
  readonly familyId: BrushQualityFamilyId;
  readonly baseSizePx?: number;
  readonly stabilizerLevel?: number;
  readonly maxHistoryPoints?: number;
  readonly maxDabsPerInputStep?: number;
  readonly retainDabs?: boolean;
  readonly seed?: number;
}

export interface BrushStrokeSoakDiagnostics {
  readonly familyId: BrushQualityFamilyId;
  readonly processedPoints: number;
  readonly emittedDabs: number;
  readonly sanitizedInputs: number;
  readonly nanOutputCount: number;
  readonly droppedStrokeCount: number;
  readonly maxDabsInSingleStep: number;
  readonly retainedHistoryPoints: number;
  readonly peakRetainedBytes: number;
  readonly scratchPoolReuseCount: number;
}

export interface BrushStrokeSoakGuard {
  push(sample: BrushStrokeSoakInputPoint, onDab?: (dab: BrushStrokeEmittedDab) => void): number;
  finish(onDab?: (dab: BrushStrokeEmittedDab) => void): number;
  reset(): void;
  getRecentDabs(): readonly BrushStrokeEmittedDab[];
  getDiagnostics(): BrushStrokeSoakDiagnostics;
}

/** O(1) 고정 링버퍼 기반 장시간 연속 획 성능·메모리·데드스트로크 방지 가드 생성. */
export function createBrushStrokeSoakGuard(
  options: BrushStrokeSoakGuardOptions,
): BrushStrokeSoakGuard {
  const spec = BRUSH_QUALITY_FAMILY_SPECS[options.familyId] ?? BRUSH_QUALITY_FAMILY_SPECS.crayon;
  const baseSizePx = clampRange(options.baseSizePx ?? 16, 1, 256, 16);
  const stabilizerLevel = clampRange(options.stabilizerLevel ?? spec.stabilizerLevel, 0, 100, spec.stabilizerLevel);
  const historyCapacity = Math.max(8, Math.min(128, Math.floor(finite(options.maxHistoryPoints ?? BRUSH_SOAK_DEFAULT_MAX_HISTORY, 64))));
  const maxDabsPerStep = Math.max(4, Math.min(64, Math.floor(finite(options.maxDabsPerInputStep ?? BRUSH_SOAK_DEFAULT_MAX_DABS_PER_STEP, 24))));
  const retainDabs = options.retainDabs ?? true;

  const histX = new Float64Array(historyCapacity);
  const histY = new Float64Array(historyCapacity);
  const histP = new Float64Array(historyCapacity);
  const histT = new Float64Array(historyCapacity);
  type MutableDab = { -readonly [K in keyof BrushStrokeEmittedDab]: BrushStrokeEmittedDab[K] };
  const retainedRing: MutableDab[] = [];
  let retainedCursor = 0;
  const scratchDab: MutableDab = {
    index: 0, x: 0, y: 0, radiusPx: 1, aspectRatio: 1, angleRadians: 0, opacity01: 1, effectivePressure01: 0.5, drySkip01: 0,
  };
  let historyCount = 0, historyHead = 0, processedPoints = 0, emittedDabs = 0;
  let sanitizedInputs = 0, nanOutputCount = 0, maxDabsInSingleStep = 0, scratchPoolReuseCount = 0;
  let hasPoint = false, xHat = 0, yHat = 0, dxHat = 0, dyHat = 0;
  let lastRawX = 0, lastRawY = 0, lastT = 0, lastPressure = 0.5, lastTilt = 0, lastAngle = 0;
  let smoothedSpeed = 0, carryDist = 0;
  const minCutoff = 3.5 - (stabilizerLevel / 100) * 3.2;
  const beta = (stabilizerLevel / 100) * 0.0045;
  const fixedRingBytes = historyCapacity * 32 + BRUSH_SOAK_MAX_RETAINED_DABS * 80;

  const writeSlot = (
    slot: MutableDab, index: number, x: number, y: number, radiusPx: number,
    aspectRatio: number, angleRadians: number, opacity01: number, effectivePressure01: number, drySkip01: number,
  ): void => {
    slot.index = index; slot.x = x; slot.y = y; slot.radiusPx = radiusPx;
    slot.aspectRatio = aspectRatio; slot.angleRadians = angleRadians;
    slot.opacity01 = opacity01; slot.effectivePressure01 = effectivePressure01; slot.drySkip01 = drySkip01;
  };

  const emitDab = (
    x: number, y: number, rawPressure: number, tilt01: number, angleRad: number,
    taperMultiplier: number, speedPxPerSec: number, onDab?: (dab: BrushStrokeEmittedDab) => void,
  ): void => {
    const p = clamp01(rawPressure);
    const shapedP = p ** spec.pressureGamma;
    const [minS, maxS] = spec.pressureSizeRange;
    const [minO, maxO] = spec.pressureOpacityRange;
    const tiltExpand = 1 + (spec.tiltWidthExpandMax - 1) * clamp01(tilt01);
    const velocityTaper = 1 - Math.min(0.28, (speedPxPerSec / 3600) * spec.exitTaperStrength * 0.35);
    const radiusPx = Math.max(0.45, baseSizePx * 0.5 * (minS + (maxS - minS) * shapedP) * tiltExpand * taperMultiplier * velocityTaper);
    const opacity01 = clampRange((minO + (maxO - minO) * shapedP) * (0.45 + 0.55 * taperMultiplier), spec.minVisibleAlpha, 1, spec.minVisibleAlpha);
    const drySkip01 = clamp01((1 - shapedP) * spec.paperGrainBite * (0.72 + Math.min(0.28, speedPxPerSec / 2800)));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radiusPx) || !Number.isFinite(opacity01)) {
      nanOutputCount += 1;
      return;
    }
    const aspectRatio = spec.anisotropyRatio * (1 + tilt01 * 0.45);
    let slot: MutableDab;
    if (retainDabs) {
      if (retainedRing.length < BRUSH_SOAK_MAX_RETAINED_DABS) {
        slot = { index: emittedDabs, x, y, radiusPx, aspectRatio, angleRadians: angleRad, opacity01, effectivePressure01: p, drySkip01 };
        retainedRing.push(slot);
      } else {
        slot = retainedRing[retainedCursor]!;
        writeSlot(slot, emittedDabs, x, y, radiusPx, aspectRatio, angleRad, opacity01, p, drySkip01);
        retainedCursor = (retainedCursor + 1) % BRUSH_SOAK_MAX_RETAINED_DABS;
        scratchPoolReuseCount += 1;
      }
    } else {
      slot = scratchDab;
      writeSlot(slot, emittedDabs, x, y, radiusPx, aspectRatio, angleRad, opacity01, p, drySkip01);
      scratchPoolReuseCount += 1;
    }
    emittedDabs += 1;
    if (onDab) onDab(retainDabs ? slot : { ...slot });
  };

  const resolveTilt = (sample: BrushStrokeSoakInputPoint): number => {
    if (typeof sample.tilt01 === "number" && Number.isFinite(sample.tilt01)) return clamp01(sample.tilt01);
    const mag = Math.hypot(finite(sample.tiltX ?? 0, 0), finite(sample.tiltY ?? 0, 0));
    return mag <= 1 ? clamp01(mag) : clamp01(mag / 60);
  };

  const push = (sample: BrushStrokeSoakInputPoint, onDab?: (dab: BrushStrokeEmittedDab) => void): number => {
    processedPoints += 1;
    let rawX = sample.x;
    let rawY = sample.y;
    let rawP = sample.pressure01 ?? 0.5;
    let rawT = sample.timestampMs ?? (hasPoint ? lastT + 8 : 0);
    let bad = false;
    if (!Number.isFinite(rawX)) { rawX = hasPoint ? lastRawX : 0; bad = true; }
    if (!Number.isFinite(rawY)) { rawY = hasPoint ? lastRawY : 0; bad = true; }
    if (!Number.isFinite(rawP)) { rawP = hasPoint ? lastPressure : 0.5; bad = true; }
    if (!Number.isFinite(rawT)) { rawT = hasPoint ? lastT + 8 : 0; bad = true; }
    if (bad) sanitizedInputs += 1;

    const p = clamp01(rawP);
    const tilt = resolveTilt(sample);
    let stepDabs = 0;

    if (!hasPoint) {
      hasPoint = true;
      xHat = rawX;
      yHat = rawY;
      dxHat = 0;
      dyHat = 0;
      lastRawX = rawX;
      lastRawY = rawY;
      lastT = rawT;
      lastPressure = p;
      lastTilt = tilt;
      histX[0] = xHat;
      histY[0] = yHat;
      histP[0] = p;
      histT[0] = rawT;
      historyCount = 1;
      historyHead = 1 % historyCapacity;
      emitDab(xHat, yHat, p, tilt, lastAngle, 0.85, 0, onDab);
      maxDabsInSingleStep = Math.max(maxDabsInSingleStep, 1);
      return 1;
    }

    const dtSec = clampRange((rawT - lastT) / 1000, 1 / 240, 0.1, 1 / 120);
    const prevX = xHat;
    const prevY = yHat;
    const prevP = lastPressure;

    if (stabilizerLevel > 0) {
      const aD = 1 / (1 + 1 / (2 * Math.PI * dtSec));
      dxHat = aD * ((rawX - xHat) / dtSec) + (1 - aD) * dxHat;
      dyHat = aD * ((rawY - yHat) / dtSec) + (1 - aD) * dyHat;
      const aX = 1 / (1 + 1 / (2 * Math.PI * (minCutoff + beta * Math.abs(dxHat)) * dtSec));
      const aY = 1 / (1 + 1 / (2 * Math.PI * (minCutoff + beta * Math.abs(dyHat)) * dtSec));
      xHat = aX * rawX + (1 - aX) * xHat;
      yHat = aY * rawY + (1 - aY) * yHat;
    } else {
      xHat = rawX;
      yHat = rawY;
    }

    const dx = xHat - prevX;
    const dy = yHat - prevY;
    const segLen = Math.hypot(dx, dy);
    smoothedSpeed = smoothedSpeed * 0.65 + (segLen / dtSec) * 0.35;
    if (segLen > 1e-4) lastAngle = Math.atan2(dy, dx);

    histX[historyHead] = xHat;
    histY[historyHead] = yHat;
    histP[historyHead] = p;
    histT[historyHead] = rawT;
    historyHead = (historyHead + 1) % historyCapacity;
    if (historyCount < historyCapacity) historyCount += 1;

    const spacingPx = Math.max(0.75, baseSizePx * spec.minSpacingRatio);
    const avail = carryDist + segLen;
    if (avail >= spacingPx && segLen > 1e-4) {
      const rawSteps = Math.floor(avail / spacingPx);
      const steps = Math.min(maxDabsPerStep, Math.max(1, rawSteps));
      const effectiveSpacing = rawSteps > maxDabsPerStep ? segLen / steps : spacingPx;
      let distOffset = rawSteps > maxDabsPerStep ? effectiveSpacing : spacingPx - carryDist;
      for (let s = 0; s < steps; s += 1) {
        const u = clamp01(distOffset / segLen);
        emitDab(prevX + dx * u, prevY + dy * u, prevP + (p - prevP) * u, lastTilt + (tilt - lastTilt) * u, lastAngle, 1, smoothedSpeed, onDab);
        stepDabs += 1;
        distOffset += effectiveSpacing;
      }
      carryDist = rawSteps > maxDabsPerStep ? 0 : Math.max(0, avail - steps * spacingPx);
    } else {
      carryDist = avail;
    }

    lastRawX = rawX;
    lastRawY = rawY;
    lastT = rawT;
    lastPressure = p;
    lastTilt = tilt;
    maxDabsInSingleStep = Math.max(maxDabsInSingleStep, stepDabs);
    return stepDabs;
  };

  const finish = (onDab?: (dab: BrushStrokeEmittedDab) => void): number => {
    if (!hasPoint) return 0;
    let tailDabs = 0;
    const dx = lastRawX - xHat;
    const dy = lastRawY - yHat;
    const fastTailPx = Math.min(baseSizePx * 1.4, (smoothedSpeed / 1200) * baseSizePx * spec.exitTaperStrength);
    const tailSteps = Math.hypot(dx, dy) > 0.5 || fastTailPx > 0.8 ? 4 : emittedDabs === 0 ? 1 : 0;
    for (let i = 1; i <= tailSteps; i += 1) {
      const u = i / tailSteps;
      const eased = 1 - (1 - u) * (1 - u);
      const tx = xHat + dx * eased + Math.cos(lastAngle) * fastTailPx * eased * 0.45;
      const ty = yHat + dy * eased + Math.sin(lastAngle) * fastTailPx * eased * 0.45;
      const taper = Math.max(0.18, 1 - u * spec.exitTaperStrength * 0.82);
      emitDab(tx, ty, lastPressure * (1 - u * 0.65), lastTilt, lastAngle, taper, smoothedSpeed, onDab);
      tailDabs += 1;
    }
    xHat = lastRawX;
    yHat = lastRawY;
    carryDist = 0;
    return tailDabs;
  };

  const reset = (): void => {
    historyCount = 0;
    historyHead = 0;
    processedPoints = 0;
    emittedDabs = 0;
    sanitizedInputs = 0;
    nanOutputCount = 0;
    maxDabsInSingleStep = 0;
    scratchPoolReuseCount = 0;
    retainedRing.length = 0;
    retainedCursor = 0;
    hasPoint = false;
    smoothedSpeed = 0;
    carryDist = 0;
  };

  return {
    push,
    finish,
    reset,
    getRecentDabs: () => retainedRing,
    getDiagnostics: () => ({
      familyId: spec.id,
      processedPoints,
      emittedDabs,
      sanitizedInputs,
      nanOutputCount,
      droppedStrokeCount: processedPoints > 0 && emittedDabs === 0 ? 1 : 0,
      maxDabsInSingleStep,
      retainedHistoryPoints: historyCount,
      peakRetainedBytes: fixedRingBytes,
      scratchPoolReuseCount,
    }),
  };
}
