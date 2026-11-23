/**
 * 수채/잉크 모세관 스며들기 & 웨트 엣지 · 2.5D 임파스토 Sobel 실시간 광원 셰이딩 ·
 * 이종 매체 물리 상호작용(왁스 레지스트 / 떡지우개 / 찰필) · 256×256 더티 타일 증분 합성 풀.
 */

import {
  PAPER_PRESETS, getWorldPaperHeightfieldTile, samplePaperHeightFast,
  type DualBrushDabStampParams, type PaperPresetId,
} from "./world-paper-heightfield";

export const DIRTY_TILE_SIZE = 256;
const DIRTY_TILE_BYTES = DIRTY_TILE_SIZE * DIRTY_TILE_SIZE * 4;

export type CrossMediaInteractionMode = "wax-resist" | "kneaded-eraser" | "blending-stump";
export type TileLayerBlendMode = "normal" | "multiply";

export interface CapillarySoakOptions {
  readonly paperPreset: PaperPresetId; readonly paperScale?: number; readonly paperSeed?: number;
  readonly wetnessMap?: Float32Array; readonly soakStrength?: number; readonly wetEdgeStrength?: number;
  readonly granulationStrength?: number; readonly iterations?: number;
  readonly paperBackground?: readonly [number, number, number];
}

export interface CapillarySoakResult {
  readonly rgba: Uint8ClampedArray; readonly wetness: Float32Array;
  readonly diffusedPixelCount: number; readonly wetEdgePixelCount: number;
  readonly meanInteriorOpticalDensity: number; readonly meanEdgeOpticalDensity: number;
  readonly wetEdgeRingRatio: number;
}

export interface ImpastoLightingOptions {
  readonly lightAzimuthDeg: number; readonly lightElevationDeg?: number; readonly reliefDepth?: number;
  readonly specularStrength?: number; readonly shadowStrength?: number;
  readonly paperPreset?: PaperPresetId; readonly ambientPaperInfluence?: number; readonly paperSeed?: number;
}

export interface ImpastoLightingResult {
  readonly rgba: Uint8ClampedArray; readonly litPixelCount: number;
  readonly highlightPixelCount: number; readonly shadowPixelCount: number;
  readonly maxLuminanceBoost: number; readonly maxShadowDrop: number;
}

export interface ImpastoBristleRidgeParams {
  readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number;
  readonly radiusPx: number; readonly pigmentRgb: readonly [number, number, number];
  readonly thickness?: number; readonly bristleCount?: number; readonly opacity?: number;
}

export interface CrossMediaInteractionInput {
  readonly mode: CrossMediaInteractionMode; readonly baseRgba: Uint8ClampedArray;
  readonly width: number; readonly height: number; readonly paperPreset: PaperPresetId;
  readonly paperScale?: number; readonly paperSeed?: number;
  readonly paperBackground?: readonly [number, number, number];
  readonly waxMask?: Float32Array; readonly watercolorRgba?: Uint8ClampedArray;
  readonly watercolorColor?: readonly [number, number, number]; readonly watercolorMask?: Float32Array;
  readonly watercolorCoverage?: number; readonly resistStrength?: number;
  readonly toolMask?: Float32Array; readonly strength?: number; readonly smudgeRadiusPx?: number;
}

export interface CrossMediaInteractionResult {
  readonly mode: CrossMediaInteractionMode; readonly rgba: Uint8ClampedArray;
  readonly affectedPixelCount: number; readonly waxProtectedPixels: number;
  readonly openValleyPaintedPixels: number; readonly waxResistRejectionRatio: number;
  readonly peakLiftDelta: number; readonly valleyLiftDelta: number; readonly valleyFillDelta: number;
  readonly toothVarianceBefore: number; readonly toothVarianceAfter: number;
}

export interface DirtyTileFlushResult {
  readonly flushedTileCount: number; readonly skippedTileCount: number;
  readonly elapsedMs: number; readonly msPerTile: number;
}

export interface DirtyTileCompositorMetrics {
  readonly canvasWidth: number; readonly canvasHeight: number;
  readonly tilesX: number; readonly tilesY: number; readonly totalTiles: number;
  readonly allocatedLayerTiles: number; readonly allocatedCompositeTiles: number;
  readonly pendingDirtyTiles: number; readonly flushCount: number; readonly totalTilesFlushed: number;
  readonly lastFlushedTileCount: number; readonly lastFlushMs: number;
  readonly avgTileMs: number; readonly p50TileMs: number; readonly p95TileMs: number; readonly maxTileMs: number;
}

interface InternalTileLayer {
  readonly id: string; blendMode: TileLayerBlendMode; opacity: number; visible: boolean;
  readonly tiles: Map<number, Uint8ClampedArray>;
}

const clamp01 = (v: number): number => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const clampByte = (v: number): number => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));
const pixelLuminance = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function opticalDensity(r: number, g: number, b: number, a: number, paperRgb: readonly [number, number, number]): number {
  if (a <= 0) return 0;
  const dr = Math.abs(paperRgb[0] - r) / 255;
  const dg = Math.abs(paperRgb[1] - g) / 255;
  const db = Math.abs(paperRgb[2] - b) / 255;
  return clamp01((0.3 * dr + 0.5 * dg + 0.2 * db + Math.max(dr, dg, db) * 0.55) * (a / 255));
}

/** 수채/잉크 모세관 스며들기와 웨트 엣지(마르는 가장자리 안료 농축)를 실제 RGBA 버퍼에서 시뮬레이션한다. */
export function simulateCapillarySoakAndWetEdge(
  rgba: Uint8ClampedArray, width: number, height: number, options: CapillarySoakOptions,
): CapillarySoakResult {
  const pixelCount = width * height;
  const outRgba = new Uint8ClampedArray(rgba);
  const spec = PAPER_PRESETS[options.paperPreset];
  const paperRgb = options.paperBackground ?? spec.basePaperRgb;
  const paperTile = getWorldPaperHeightfieldTile(options.paperPreset, options.paperSeed ?? 1337);
  const invScale = 1 / Math.max(0.1, options.paperScale ?? 1);
  const soakStrength = clamp01(options.soakStrength ?? 0.65);
  const wetEdgeStrength = clamp01(options.wetEdgeStrength ?? 0.75);
  const granulationStrength = clamp01(options.granulationStrength ?? 0.45);
  const iterations = Math.max(1, Math.min(8, Math.round(options.iterations ?? 3)));

  const paperHeights = new Float32Array(pixelCount);
  let [curDens, nxtDens] = [new Float32Array(pixelCount), new Float32Array(pixelCount)];
  let [curWet, nxtWet] = [new Float32Array(pixelCount), new Float32Array(pixelCount)];
  let [curR, nxtR] = [new Float32Array(pixelCount), new Float32Array(pixelCount)];
  let [curG, nxtG] = [new Float32Array(pixelCount), new Float32Array(pixelCount)];
  let [curB, nxtB] = [new Float32Array(pixelCount), new Float32Array(pixelCount)];

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      const off = idx * 4;
      const r = rgba[off] ?? paperRgb[0];
      const g = rgba[off + 1] ?? paperRgb[1];
      const b = rgba[off + 2] ?? paperRgb[2];
      paperHeights[idx] = samplePaperHeightFast(paperTile, x + 0.5, y + 0.5, invScale);
      const dens = opticalDensity(r, g, b, rgba[off + 3] ?? 255, paperRgb);
      curDens[idx] = dens;
      curWet[idx] = options.wetnessMap ? clamp01(options.wetnessMap[idx] ?? 0) : clamp01(dens * 1.45);
      const invMix = dens > 0.015 ? 1 / Math.max(0.25, Math.min(1, dens * 1.25)) : 0;
      curR[idx] = invMix > 0 ? clampByte(paperRgb[0] + (r - paperRgb[0]) * invMix) : paperRgb[0];
      curG[idx] = invMix > 0 ? clampByte(paperRgb[1] + (g - paperRgb[1]) * invMix) : paperRgb[1];
      curB[idx] = invMix > 0 ? clampByte(paperRgb[2] + (b - paperRgb[2]) * invMix) : paperRgb[2];
    }
  }

  const baseTransfer = soakStrength * (0.28 + 0.52 * spec.absorbency) * 0.24;
  const massR = new Float32Array(pixelCount);
  const massG = new Float32Array(pixelCount);
  const massB = new Float32Array(pixelCount);

  for (let iter = 0; iter < iterations; iter += 1) {
    nxtDens.set(curDens); nxtWet.set(curWet); nxtR.set(curR); nxtG.set(curG); nxtB.set(curB);
    for (let i = 0; i < pixelCount; i += 1) {
      const m = curDens[i] ?? 0;
      massR[i] = (curR[i] ?? paperRgb[0]) * m;
      massG[i] = (curG[i] ?? paperRgb[1]) * m;
      massB[i] = (curB[i] ?? paperRgb[2]) * m;
    }
    for (let y = 1; y < height - 1; y += 1) {
      const row = y * width;
      for (let x = 1; x < width - 1; x += 1) {
        const idx = row + x;
        const w = curWet[idx] ?? 0;
        const d = curDens[idx] ?? 0;
        if (w <= 0.02 || d <= 0.005) continue;
        const nIds = [idx - 1, idx + 1, idx - width, idx + width];
        const nW = nIds.map((nid) => 0.25 + 0.75 * (1 - (paperHeights[nid] ?? 0.5)));
        const invWSum = 1 / ((nW[0] ?? 0.25) + (nW[1] ?? 0.25) + (nW[2] ?? 0.25) + (nW[3] ?? 0.25));
        const outFlow = baseTransfer * w;
        const lostD = d * outFlow;
        const lostW = w * outFlow * 0.85;
        const [cR, cG, cB] = [curR[idx] ?? paperRgb[0], curG[idx] ?? paperRgb[1], curB[idx] ?? paperRgb[2]];
        nxtDens[idx] = (nxtDens[idx] ?? 0) - lostD;
        nxtWet[idx] = (nxtWet[idx] ?? 0) - lostW;
        massR[idx] = (massR[idx] ?? 0) - cR * lostD;
        massG[idx] = (massG[idx] ?? 0) - cG * lostD;
        massB[idx] = (massB[idx] ?? 0) - cB * lostD;
        for (let k = 0; k < 4; k += 1) {
          const nIdx = nIds[k] ?? idx;
          const share = (nW[k] ?? 0.25) * invWSum;
          const addD = lostD * share;
          nxtDens[nIdx] = (nxtDens[nIdx] ?? 0) + addD;
          nxtWet[nIdx] = Math.min(1, (nxtWet[nIdx] ?? 0) + lostW * share);
          massR[nIdx] = (massR[nIdx] ?? 0) + cR * addD;
          massG[nIdx] = (massG[nIdx] ?? 0) + cG * addD;
          massB[nIdx] = (massB[nIdx] ?? 0) + cB * addD;
        }
      }
    }
    for (let i = 0; i < pixelCount; i += 1) {
      const m = nxtDens[i] ?? 0;
      if (m > 0.004) {
        nxtR[i] = clampByte((massR[i] ?? 0) / m);
        nxtG[i] = clampByte((massG[i] ?? 0) / m);
        nxtB[i] = clampByte((massB[i] ?? 0) / m);
      }
    }
    [curDens, nxtDens] = [nxtDens, curDens];
    [curWet, nxtWet] = [nxtWet, curWet];
    [curR, nxtR] = [nxtR, curR];
    [curG, nxtG] = [nxtG, curG];
    [curB, nxtB] = [nxtB, curB];
  }

  let diffusedPixelCount = 0;
  let wetEdgePixelCount = 0;
  let interiorDensitySum = 0;
  let interiorCount = 0;
  let edgeDensitySum = 0;
  let edgeCount = 0;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      const dens = curDens[idx] ?? 0;
      const wet = curWet[idx] ?? 0;
      if (dens <= 0.005) continue;
      const origOff = idx * 4;
      const origDens = opticalDensity(
        rgba[origOff] ?? paperRgb[0], rgba[origOff + 1] ?? paperRgb[1],
        rgba[origOff + 2] ?? paperRgb[2], rgba[origOff + 3] ?? 255, paperRgb,
      );
      if (origDens <= 0.01 && dens > 0.015) diffusedPixelCount += 1;

      const wL = x > 0 ? (curWet[idx - 1] ?? 0) : 0;
      const wR = x < width - 1 ? (curWet[idx + 1] ?? 0) : 0;
      const wT = y > 0 ? (curWet[idx - width] ?? 0) : 0;
      const wB = y < height - 1 ? (curWet[idx + width] ?? 0) : 0;
      const minW = Math.min(wL, wR, wT, wB);
      const edgeFactor = clamp01(Math.max(Math.hypot(wR - wL, wB - wT) * 0.775, clamp01((wet - minW) * 1.45)));
      const isWetEdge = wet > 0.07 && edgeFactor > 0.22 && minW < wet * 0.85;

      let finalDens = dens;
      if (isWetEdge && wetEdgeStrength > 0) {
        finalDens = dens * (1 + wetEdgeStrength * edgeFactor * 0.92);
        wetEdgePixelCount += 1;
      } else if (wet > 0.18 && wetEdgeStrength > 0) {
        finalDens = dens * (1 - wetEdgeStrength * 0.16);
      }
      finalDens *= 1 + granulationStrength * (0.5 - (paperHeights[idx] ?? 0.5)) * 0.48;

      const absorbAlpha = clamp01(1 - Math.exp(-finalDens * 2.05));
      const deepen = finalDens > 0.42 ? Math.max(0.58, 1 - (finalDens - 0.42) * 0.38) : 1;
      const outR = clampByte(paperRgb[0] * (1 - absorbAlpha) + (curR[idx] ?? paperRgb[0]) * deepen * absorbAlpha);
      const outG = clampByte(paperRgb[1] * (1 - absorbAlpha) + (curG[idx] ?? paperRgb[1]) * deepen * absorbAlpha);
      const outB = clampByte(paperRgb[2] * (1 - absorbAlpha) + (curB[idx] ?? paperRgb[2]) * deepen * absorbAlpha);
      const outA = Math.max(rgba[origOff + 3] ?? 255, clampByte(absorbAlpha * 255));
      outRgba[origOff] = outR;
      outRgba[origOff + 1] = outG;
      outRgba[origOff + 2] = outB;
      outRgba[origOff + 3] = outA;

      const measured = opticalDensity(outR, outG, outB, outA, paperRgb);
      if (isWetEdge) { edgeDensitySum += measured; edgeCount += 1; }
      else if (wet > 0.25) { interiorDensitySum += measured; interiorCount += 1; }
    }
  }
  const meanInterior = interiorCount > 0 ? interiorDensitySum / interiorCount : 0;
  const meanEdge = edgeCount > 0 ? edgeDensitySum / edgeCount : meanInterior;
  return {
    rgba: outRgba, wetness: curWet, diffusedPixelCount, wetEdgePixelCount,
    meanInteriorOpticalDensity: meanInterior, meanEdgeOpticalDensity: meanEdge,
    wetEdgeRingRatio: meanInterior > 1e-4 ? meanEdge / meanInterior : 1,
  };
}

/** 유화/아크릴/두꺼운 크레파스 붓모 고랑을 RGBA와 Float32 높이 채널에 동시 기록한다. */
export function depositImpastoBristleRidge(
  rgba: Uint8ClampedArray, heightField: Float32Array, width: number, height: number, params: ImpastoBristleRidgeParams,
): number {
  const dx = params.x1 - params.x0;
  const dy = params.y1 - params.y0;
  const length = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(length * 1.4));
  const nx = length > 1e-4 ? -dy / length : 0;
  const ny = length > 1e-4 ? dx / length : 1;
  const radius = Math.max(1.5, params.radiusPx);
  const thickness = Math.max(0.1, params.thickness ?? 0.9);
  const bristles = Math.max(3, Math.round(params.bristleCount ?? 7));
  const opacity = clamp01(params.opacity ?? 0.94);
  const [pigR, pigG, pigB] = params.pigmentRgb;
  const rCeil = Math.ceil(radius) + 1;
  let touched = 0;

  for (let s = 0; s <= steps; s += 1) {
    const cx = params.x0 + dx * (s / steps);
    const cy = params.y0 + dy * (s / steps);
    const minX = Math.max(0, Math.floor(cx - rCeil));
    const maxX = Math.min(width - 1, Math.ceil(cx + rCeil));
    const minY = Math.max(0, Math.floor(cy - rCeil));
    const maxY = Math.min(height - 1, Math.ceil(cy + rCeil));
    for (let py = minY; py <= maxY; py += 1) {
      const row = py * width;
      for (let px = minX; px <= maxX; px += 1) {
        const rx = px + 0.5 - cx;
        const ry = py + 0.5 - cy;
        const dist = Math.hypot(rx, ry);
        if (dist > radius) continue;
        const norm = dist / radius;
        const furrow = 0.62 + 0.38 * Math.cos(((rx * nx + ry * ny) / radius) * Math.PI * bristles);
        const shoulder = 1 - norm * norm * 0.55 + Math.exp(-Math.pow((norm - 0.72) / 0.16, 2)) * 0.45;
        const localHeight = thickness * shoulder * furrow * (1 - smoothstep(0.86, 1.0, norm));
        const alpha = opacity * (1 - smoothstep(0.78, 1.0, norm));
        if (alpha <= 0.01) continue;
        const idx = row + px;
        if (localHeight > (heightField[idx] ?? 0)) heightField[idx] = Math.min(2.5, localHeight);
        const off = idx * 4;
        rgba[off] = clampByte(pigR * alpha + (rgba[off] ?? 255) * (1 - alpha));
        rgba[off + 1] = clampByte(pigG * alpha + (rgba[off + 1] ?? 255) * (1 - alpha));
        rgba[off + 2] = clampByte(pigB * alpha + (rgba[off + 2] ?? 255) * (1 - alpha));
        rgba[off + 3] = 255;
        touched += 1;
      }
    }
  }
  return touched;
}

/** 2.5D 임파스토 높이 채널에서 3×3 Sobel 법선을 계산해 광원 기준 스페큘러 하이라이트와 그림자를 1패스로 합성한다. */
export function applyImpastoReliefLighting(
  rgba: Uint8ClampedArray, heightField: Float32Array, width: number, height: number, options: ImpastoLightingOptions,
): ImpastoLightingResult {
  const outRgba = new Uint8ClampedArray(rgba);
  const azRad = (options.lightAzimuthDeg * Math.PI) / 180;
  const elRad = (Math.max(12, Math.min(82, options.lightElevationDeg ?? 38)) * Math.PI) / 180;
  const reliefDepth = Math.max(0.1, options.reliefDepth ?? 1.0);
  const specularStrength = clamp01(options.specularStrength ?? 0.72);
  const shadowStrength = clamp01(options.shadowStrength ?? 0.78);
  const paperInfluence = clamp01(options.ambientPaperInfluence ?? 0.08);
  const paperTile = options.paperPreset ? getWorldPaperHeightfieldTile(options.paperPreset, options.paperSeed ?? 1337) : null;

  const lx = Math.cos(elRad) * Math.cos(azRad);
  const ly = Math.cos(elRad) * Math.sin(azRad);
  const lz = Math.sin(elRad);
  const hLen = Math.hypot(lx, ly, lz + 1);
  const hx = lx / hLen;
  const hy = ly / hLen;
  const hz = (lz + 1) / hLen;
  const reliefScale = 2.6 * reliefDepth;

  let litPixelCount = 0;
  let highlightPixelCount = 0;
  let shadowPixelCount = 0;
  let maxLuminanceBoost = 0;
  let maxShadowDrop = 0;

  const sampleH = (sx: number, sy: number): number => {
    const cx = sx < 0 ? 0 : sx >= width ? width - 1 : sx;
    const cy = sy < 0 ? 0 : sy >= height ? height - 1 : sy;
    const baseH = heightField[cy * width + cx] ?? 0;
    return !paperTile || paperInfluence <= 0 || baseH <= 0.01
      ? baseH
      : baseH + samplePaperHeightFast(paperTile, cx + 0.5, cy + 0.5, 1) * paperInfluence;
  };

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      const centerH = heightField[idx] ?? 0;
      const gx = sampleH(x + 1, y - 1) + 2 * sampleH(x + 1, y) + sampleH(x + 1, y + 1)
        - (sampleH(x - 1, y - 1) + 2 * sampleH(x - 1, y) + sampleH(x - 1, y + 1));
      const gy = sampleH(x - 1, y + 1) + 2 * sampleH(x, y + 1) + sampleH(x + 1, y + 1)
        - (sampleH(x - 1, y - 1) + 2 * sampleH(x, y - 1) + sampleH(x + 1, y - 1));
      const slopeMag = Math.hypot(gx, gy);
      if (centerH <= 0.002 && slopeMag <= 0.002) continue;

      const invN = 1 / Math.hypot(-gx * reliefScale, -gy * reliefScale, 1);
      const nx = -gx * reliefScale * invN;
      const ny = -gy * reliefScale * invN;
      const diffuseDelta = clamp01(nx * lx + ny * ly + invN * lz) - lz;
      const spec = Math.pow(clamp01(nx * hx + ny * hy + invN * hz), 22) * specularStrength * clamp01(slopeMag * 1.45) * clamp01(centerH * 1.35 + 0.15);
      const shift = (diffuseDelta >= 0 ? diffuseDelta * 68 : diffuseDelta * 82 * shadowStrength) * reliefDepth + spec * 104;

      const off = idx * 4;
      const srcR = rgba[off] ?? 0;
      const srcG = rgba[off + 1] ?? 0;
      const srcB = rgba[off + 2] ?? 0;
      const outR = clampByte(srcR + shift);
      const outG = clampByte(srcG + shift);
      const outB = clampByte(srcB + shift);
      outRgba[off] = outR;
      outRgba[off + 1] = outG;
      outRgba[off + 2] = outB;

      const lumaDiff = pixelLuminance(outR, outG, outB) - pixelLuminance(srcR, srcG, srcB);
      litPixelCount += 1;
      if (lumaDiff > 2.5) { highlightPixelCount += 1; if (lumaDiff > maxLuminanceBoost) maxLuminanceBoost = lumaDiff; }
      else if (lumaDiff < -2.5) { shadowPixelCount += 1; if (-lumaDiff > maxShadowDrop) maxShadowDrop = -lumaDiff; }
    }
  }
  return { rgba: outRgba, litPixelCount, highlightPixelCount, shadowPixelCount, maxLuminanceBoost, maxShadowDrop };
}

/** 이종 매체 물리 상호작용 3종: 왁스 레지스트 · 떡지우개(봉우리 리프트) · 찰필(골짜기 문지르기). */
export function applyCrossMediaInteraction(input: CrossMediaInteractionInput): CrossMediaInteractionResult {
  const { width, height, baseRgba, mode } = input;
  const pixelCount = width * height;
  const outRgba = new Uint8ClampedArray(baseRgba);
  const paperRgb = input.paperBackground ?? PAPER_PRESETS[input.paperPreset].basePaperRgb;
  const paperTile = getWorldPaperHeightfieldTile(input.paperPreset, input.paperSeed ?? 1337);
  const invScale = 1 / Math.max(0.1, input.paperScale ?? 1);

  if (mode === "wax-resist") {
    const waxMask = input.waxMask ?? new Float32Array(pixelCount);
    const resistStrength = clamp01(input.resistStrength ?? 0.94);
    const defRgb = input.watercolorColor ?? ([38, 108, 178] as const);
    const defCov = clamp01(input.watercolorCoverage ?? 0.72);
    let [affectedPixelCount, waxProtectedPixels, openValleyPaintedPixels] = [0, 0, 0];
    let [waxDepositSum, waxSampleCount, openDepositSum, openSampleCount] = [0, 0, 0, 0];

    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        const idx = row + x;
        const off = idx * 4;
        const pH = samplePaperHeightFast(paperTile, x + 0.5, y + 0.5, invScale);
        const wax = clamp01(waxMask[idx] ?? 0);
        const wR = input.watercolorRgba ? (input.watercolorRgba[off] ?? defRgb[0]) : defRgb[0];
        const wG = input.watercolorRgba ? (input.watercolorRgba[off + 1] ?? defRgb[1]) : defRgb[1];
        const wB = input.watercolorRgba ? (input.watercolorRgba[off + 2] ?? defRgb[2]) : defRgb[2];
        const wCov = input.watercolorRgba
          ? ((input.watercolorRgba[off + 3] ?? 0) / 255) * (input.watercolorMask ? clamp01(input.watercolorMask[idx] ?? 1) : 1)
          : input.watercolorMask ? clamp01(input.watercolorMask[idx] ?? 0) : defCov;
        if (wCov <= 0.005) continue;

        let nMaxWax = 0;
        if (wax < 0.12) {
          if (x > 0) nMaxWax = Math.max(nMaxWax, waxMask[idx - 1] ?? 0);
          if (x < width - 1) nMaxWax = Math.max(nMaxWax, waxMask[idx + 1] ?? 0);
          if (y > 0) nMaxWax = Math.max(nMaxWax, waxMask[idx - width] ?? 0);
          if (y < height - 1) nMaxWax = Math.max(nMaxWax, waxMask[idx + width] ?? 0);
        }
        const repel = clamp01(wax * resistStrength * (0.88 + 0.22 * pH));
        const accepted = clamp01(wCov * (1 - repel) * (0.72 + 0.52 * (1 - pH) + (nMaxWax > 0.35 ? 0.16 : 0)));
        const [baseR, baseG, baseB] = [baseRgba[off] ?? paperRgb[0], baseRgba[off + 1] ?? paperRgb[1], baseRgba[off + 2] ?? paperRgb[2]];
        outRgba[off] = clampByte(baseR * (1 - accepted) + (wR * 0.45 + ((baseR * wR) / 255) * 0.55) * accepted);
        outRgba[off + 1] = clampByte(baseG * (1 - accepted) + (wG * 0.45 + ((baseG * wG) / 255) * 0.55) * accepted);
        outRgba[off + 2] = clampByte(baseB * (1 - accepted) + (wB * 0.45 + ((baseB * wB) / 255) * 0.55) * accepted);
        outRgba[off + 3] = Math.max(baseRgba[off + 3] ?? 255, clampByte(accepted * 255));

        const deposit = (Math.abs((outRgba[off] ?? baseR) - baseR) + Math.abs((outRgba[off + 1] ?? baseG) - baseG) + Math.abs((outRgba[off + 2] ?? baseB) - baseB)) / 765;
        if (deposit > 0.004) affectedPixelCount += 1;
        if (wax >= 0.45) { waxDepositSum += deposit; waxSampleCount += 1; if (repel >= 0.5) waxProtectedPixels += 1; }
        else if (wax <= 0.08) { openDepositSum += deposit; openSampleCount += 1; if (accepted >= 0.25) openValleyPaintedPixels += 1; }
      }
    }
    const meanOpen = openSampleCount > 0 ? openDepositSum / openSampleCount : 0;
    const rejection = meanOpen > 1e-4 ? clamp01(1 - (waxSampleCount > 0 ? waxDepositSum / waxSampleCount : 0) / meanOpen) : 0;
    return { mode, rgba: outRgba, affectedPixelCount, waxProtectedPixels, openValleyPaintedPixels, waxResistRejectionRatio: rejection, peakLiftDelta: 0, valleyLiftDelta: 0, valleyFillDelta: 0, toothVarianceBefore: 0, toothVarianceAfter: 0 };
  }

  const toolMask = input.toolMask ?? new Float32Array(pixelCount).fill(1);
  const strength = clamp01(input.strength ?? 0.78);
  if (mode === "kneaded-eraser") {
    let [affectedPixelCount, peakLiftSum, peakCount, valleyLiftSum, valleyCount] = [0, 0, 0, 0, 0];
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        const idx = row + x;
        const m = clamp01(toolMask[idx] ?? 0);
        if (m <= 0.01) continue;
        const pH = samplePaperHeightFast(paperTile, x + 0.5, y + 0.5, invScale);
        const lift = clamp01(m * strength * (0.12 + 0.88 * smoothstep(0.18, 0.84, pH)));
        const off = idx * 4;
        const [srcR, srcG, srcB] = [baseRgba[off] ?? paperRgb[0], baseRgba[off + 1] ?? paperRgb[1], baseRgba[off + 2] ?? paperRgb[2]];
        const outR = clampByte(srcR + (paperRgb[0] - srcR) * lift);
        const outG = clampByte(srcG + (paperRgb[1] - srcG) * lift);
        const outB = clampByte(srcB + (paperRgb[2] - srcB) * lift);
        outRgba[off] = outR; outRgba[off + 1] = outG; outRgba[off + 2] = outB;
        const gain = pixelLuminance(outR, outG, outB) - pixelLuminance(srcR, srcG, srcB);
        if (Math.abs(gain) > 0.5) affectedPixelCount += 1;
        if (pH >= 0.65) { peakLiftSum += gain; peakCount += 1; }
        else if (pH <= 0.35) { valleyLiftSum += gain; valleyCount += 1; }
      }
    }
    return { mode, rgba: outRgba, affectedPixelCount, waxProtectedPixels: 0, openValleyPaintedPixels: 0, waxResistRejectionRatio: 0, peakLiftDelta: peakCount > 0 ? peakLiftSum / peakCount : 0, valleyLiftDelta: valleyCount > 0 ? valleyLiftSum / valleyCount : 0, valleyFillDelta: 0, toothVarianceBefore: 0, toothVarianceAfter: 0 };
  }

  // mode === "blending-stump" (찰필: 주변 봉우리 흑연을 종이 골짜기로 밀어 넣어 매끈하게 펴기)
  const radius = Math.max(1, Math.min(6, Math.round(input.smudgeRadiusPx ?? 3)));
  const beforeLuma = new Float32Array(pixelCount);
  const paperHeights = new Float32Array(pixelCount);
  let [beforeMean, maskCount, varBefore] = [0, 0, 0];
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      const off = idx * 4;
      const l = pixelLuminance(baseRgba[off] ?? 255, baseRgba[off + 1] ?? 255, baseRgba[off + 2] ?? 255);
      beforeLuma[idx] = l;
      paperHeights[idx] = samplePaperHeightFast(paperTile, x + 0.5, y + 0.5, invScale);
      if ((toolMask[idx] ?? 0) > 0.1) { beforeMean += l; maskCount += 1; }
    }
  }
  beforeMean = maskCount > 0 ? beforeMean / maskCount : 0;
  for (let i = 0; i < pixelCount; i += 1) {
    if ((toolMask[i] ?? 0) > 0.1) { const d = (beforeLuma[i] ?? beforeMean) - beforeMean; varBefore += d * d; }
  }

  let [affectedPixelCount, valleyDarkenSum, valleyCount, afterMean, varAfter] = [0, 0, 0, 0, 0];
  const afterLuma = new Float32Array(pixelCount);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      const m = clamp01(toolMask[idx] ?? 0);
      if (m <= 0.01) { afterLuma[idx] = beforeLuma[idx] ?? 255; continue; }
      const pH = paperHeights[idx] ?? 0.5;
      const valleyAffinity = 1 - pH;
      let [sumR, sumG, sumB, wTotal] = [0, 0, 0, 0];
      for (let ky = -radius; ky <= radius; ky += 1) {
        const sRow = Math.max(0, Math.min(height - 1, y + ky)) * width;
        for (let kx = -radius; kx <= radius; kx += 1) {
          const dist2 = kx * kx + ky * ky;
          if (dist2 > radius * radius + 0.5) continue;
          const nIdx = sRow + Math.max(0, Math.min(width - 1, x + kx));
          const nOff = nIdx * 4;
          const weight = (1 / (1 + dist2 * 0.45)) * (1 + clamp01(1 - (beforeLuma[nIdx] ?? 255) / 255) * valleyAffinity * 6.5);
          sumR += (baseRgba[nOff] ?? paperRgb[0]) * weight;
          sumG += (baseRgba[nOff + 1] ?? paperRgb[1]) * weight;
          sumB += (baseRgba[nOff + 2] ?? paperRgb[2]) * weight;
          wTotal += weight;
        }
      }
      const off = idx * 4;
      const [srcR, srcG, srcB] = [baseRgba[off] ?? paperRgb[0], baseRgba[off + 1] ?? paperRgb[1], baseRgba[off + 2] ?? paperRgb[2]];
      const blend = clamp01(m * strength * (0.55 + 0.45 * valleyAffinity));
      const outR = clampByte(srcR * (1 - blend) + (wTotal > 0 ? sumR / wTotal : srcR) * blend);
      const outG = clampByte(srcG * (1 - blend) + (wTotal > 0 ? sumG / wTotal : srcG) * blend);
      const outB = clampByte(srcB * (1 - blend) + (wTotal > 0 ? sumB / wTotal : srcB) * blend);
      outRgba[off] = outR; outRgba[off + 1] = outG; outRgba[off + 2] = outB;
      const lAfter = pixelLuminance(outR, outG, outB);
      afterLuma[idx] = lAfter;
      if (m > 0.1) afterMean += lAfter;
      const diff = (beforeLuma[idx] ?? lAfter) - lAfter;
      if (Math.abs(diff) > 0.4) affectedPixelCount += 1;
      if (pH <= 0.35) { valleyDarkenSum += diff; valleyCount += 1; }
    }
  }
  afterMean = maskCount > 0 ? afterMean / maskCount : 0;
  for (let i = 0; i < pixelCount; i += 1) {
    if ((toolMask[i] ?? 0) > 0.1) { const d = (afterLuma[i] ?? afterMean) - afterMean; varAfter += d * d; }
  }
  return {
    mode, rgba: outRgba, affectedPixelCount, waxProtectedPixels: 0, openValleyPaintedPixels: 0,
    waxResistRejectionRatio: 0, peakLiftDelta: 0, valleyLiftDelta: 0,
    valleyFillDelta: valleyCount > 0 ? valleyDarkenSum / valleyCount : 0,
    toothVarianceBefore: maskCount > 0 ? varBefore / maskCount : 0,
    toothVarianceAfter: maskCount > 0 ? varAfter / maskCount : 0,
  };
}

/** 대형 캔버스에서 변경된 256×256 타일만 O(1) 증분 합성하는 더티 타일 합성 풀. */
export class DirtyTileCompositor256 {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly totalTiles: number;
  private readonly paperTileTemplate: Uint8ClampedArray;
  private readonly layers: InternalTileLayer[] = [];
  private readonly layerIndexById = new Map<string, InternalTileLayer>();
  private readonly compositedTiles = new Map<number, Uint8ClampedArray>();
  private readonly dirtyTileIndices = new Set<number>();
  private readonly tileLatencySamplesMs: number[] = [];
  private flushCount = 0;
  private totalTilesFlushed = 0;
  private lastFlushedTileCount = 0;
  private lastFlushMs = 0;

  constructor(canvasWidth: number, canvasHeight: number, paperBackground: readonly [number, number, number] = [248, 244, 236]) {
    this.canvasWidth = Math.max(DIRTY_TILE_SIZE, Math.round(canvasWidth));
    this.canvasHeight = Math.max(DIRTY_TILE_SIZE, Math.round(canvasHeight));
    this.tilesX = Math.ceil(this.canvasWidth / DIRTY_TILE_SIZE);
    this.tilesY = Math.ceil(this.canvasHeight / DIRTY_TILE_SIZE);
    this.totalTiles = this.tilesX * this.tilesY;
    this.paperTileTemplate = new Uint8ClampedArray(DIRTY_TILE_BYTES);
    const [bgR, bgG, bgB] = paperBackground;
    for (let i = 0; i < DIRTY_TILE_BYTES; i += 4) {
      this.paperTileTemplate[i] = bgR;
      this.paperTileTemplate[i + 1] = bgG;
      this.paperTileTemplate[i + 2] = bgB;
      this.paperTileTemplate[i + 3] = 255;
    }
  }

  ensureLayer(id: string, blendMode: TileLayerBlendMode = "normal", opacity = 1): void {
    const existing = this.layerIndexById.get(id);
    if (existing) { existing.blendMode = blendMode; existing.opacity = clamp01(opacity); return; }
    const created: InternalTileLayer = { id, blendMode, opacity: clamp01(opacity), visible: true, tiles: new Map() };
    this.layers.push(created);
    this.layerIndexById.set(id, created);
  }

  markDirtyRect(x: number, y: number, width: number, height: number): number {
    if (width <= 0 || height <= 0) return 0;
    const tx0 = Math.max(0, Math.floor(x / DIRTY_TILE_SIZE));
    const ty0 = Math.max(0, Math.floor(y / DIRTY_TILE_SIZE));
    const tx1 = Math.min(this.tilesX - 1, Math.floor((x + width - 1) / DIRTY_TILE_SIZE));
    const ty1 = Math.min(this.tilesY - 1, Math.floor((y + height - 1) / DIRTY_TILE_SIZE));
    let marked = 0;
    for (let ty = ty0; ty <= ty1; ty += 1) {
      const row = ty * this.tilesX;
      for (let tx = tx0; tx <= tx1; tx += 1) { this.dirtyTileIndices.add(row + tx); marked += 1; }
    }
    return marked;
  }

  markDirtyPoint(cx: number, cy: number, radiusPx: number): number {
    const r = Math.max(1, Math.ceil(radiusPx));
    return this.markDirtyRect(cx - r, cy - r, r * 2 + 1, r * 2 + 1);
  }

  paintBrushDab(layerId: string, params: DualBrushDabStampParams, blendMode: TileLayerBlendMode = "normal"): number {
    this.ensureLayer(layerId, blendMode);
    const layer = this.layerIndexById.get(layerId);
    if (!layer) return 0;
    const radius = Math.max(1, params.dabRadiusPx);
    const reach = Math.ceil(radius * 2.2) + 2;
    const minX = Math.max(0, Math.floor(params.dabX - reach));
    const maxX = Math.min(this.canvasWidth - 1, Math.ceil(params.dabX + reach));
    const minY = Math.max(0, Math.floor(params.dabY - reach));
    const maxY = Math.min(this.canvasHeight - 1, Math.ceil(params.dabY + reach));
    if (minX > maxX || minY > maxY) return 0;

    const tx0 = Math.floor(minX / DIRTY_TILE_SIZE);
    const tx1 = Math.floor(maxX / DIRTY_TILE_SIZE);
    const ty0 = Math.floor(minY / DIRTY_TILE_SIZE);
    const ty1 = Math.floor(maxY / DIRTY_TILE_SIZE);
    const paperTile = getWorldPaperHeightfieldTile(params.paperPreset, params.seed ?? 1337);
    const invScale = 1 / Math.max(0.1, params.paperScale ?? 1);
    const flow = clamp01(params.flow ?? 0.82) * clamp01(params.pressure);
    const [pigR, pigG, pigB] = params.pigmentRgb;
    const invRadius = 1 / radius;
    const toothStrength = clamp01(params.paperToothStrength ?? 0.8);
    let dirtyAdded = 0;

    for (let ty = ty0; ty <= ty1; ty += 1) {
      const originY = ty * DIRTY_TILE_SIZE;
      const lMinY = Math.max(0, minY - originY);
      const lMaxY = Math.min(DIRTY_TILE_SIZE - 1, maxY - originY);
      for (let tx = tx0; tx <= tx1; tx += 1) {
        const tileIndex = ty * this.tilesX + tx;
        let tileBuf = layer.tiles.get(tileIndex);
        if (!tileBuf) { tileBuf = new Uint8ClampedArray(DIRTY_TILE_BYTES); layer.tiles.set(tileIndex, tileBuf); }
        const originX = tx * DIRTY_TILE_SIZE;
        const lMinX = Math.max(0, minX - originX);
        const lMaxX = Math.min(DIRTY_TILE_SIZE - 1, maxX - originX);
        for (let ly = lMinY; ly <= lMaxY; ly += 1) {
          const wy = originY + ly + 0.5;
          const dy = (wy - params.dabY) * invRadius;
          const dy2 = dy * dy;
          if (dy2 >= 1) continue;
          const rowOff = ly * DIRTY_TILE_SIZE;
          for (let lx = lMinX; lx <= lMaxX; lx += 1) {
            const wx = originX + lx + 0.5;
            const dx = (wx - params.dabX) * invRadius;
            const d2 = dx * dx + dy2;
            if (d2 >= 1) continue;
            const alpha = clamp01((1 - d2) * flow * (1 - toothStrength + toothStrength * samplePaperHeightFast(paperTile, wx, wy, invScale)));
            if (alpha <= 0.005) continue;
            const off = (rowOff + lx) * 4;
            const dstA = (tileBuf[off + 3] ?? 0) / 255;
            const outA = alpha + dstA * (1 - alpha);
            if (outA > 1e-4) {
              const invOut = 1 / outA;
              tileBuf[off] = clampByte((pigR * alpha + (tileBuf[off] ?? 0) * dstA * (1 - alpha)) * invOut);
              tileBuf[off + 1] = clampByte((pigG * alpha + (tileBuf[off + 1] ?? 0) * dstA * (1 - alpha)) * invOut);
              tileBuf[off + 2] = clampByte((pigB * alpha + (tileBuf[off + 2] ?? 0) * dstA * (1 - alpha)) * invOut);
              tileBuf[off + 3] = clampByte(outA * 255);
            }
          }
        }
        if (!this.dirtyTileIndices.has(tileIndex)) { this.dirtyTileIndices.add(tileIndex); dirtyAdded += 1; }
      }
    }
    return dirtyAdded;
  }

  flushDirtyTiles(): DirtyTileFlushResult {
    const flushedCount = this.dirtyTileIndices.size;
    if (flushedCount === 0) {
      this.lastFlushedTileCount = 0; this.lastFlushMs = 0;
      return { flushedTileCount: 0, skippedTileCount: this.totalTiles, elapsedMs: 0, msPerTile: 0 };
    }
    const startMs = performance.now();
    for (const tileIndex of this.dirtyTileIndices) {
      let dst = this.compositedTiles.get(tileIndex);
      if (!dst) { dst = new Uint8ClampedArray(DIRTY_TILE_BYTES); this.compositedTiles.set(tileIndex, dst); }
      dst.set(this.paperTileTemplate);
      for (let li = 0; li < this.layers.length; li += 1) {
        const layer = this.layers[li];
        if (!layer || !layer.visible || layer.opacity <= 0) continue;
        const src = layer.tiles.get(tileIndex);
        if (!src) continue;
        const layerOpacity = layer.opacity;
        const isMultiply = layer.blendMode === "multiply";
        for (let i = 0; i < DIRTY_TILE_BYTES; i += 4) {
          const rawA = src[i + 3] ?? 0;
          if (rawA === 0) continue;
          const a = (rawA / 255) * layerOpacity;
          const invA = 1 - a;
          const dR = dst[i] ?? 255;
          const dG = dst[i + 1] ?? 255;
          const dB = dst[i + 2] ?? 255;
          const sR = src[i] ?? 0;
          const sG = src[i + 1] ?? 0;
          const sB = src[i + 2] ?? 0;
          dst[i] = (dR * invA + (isMultiply ? (dR * sR) / 255 : sR) * a) | 0;
          dst[i + 1] = (dG * invA + (isMultiply ? (dG * sG) / 255 : sG) * a) | 0;
          dst[i + 2] = (dB * invA + (isMultiply ? (dB * sB) / 255 : sB) * a) | 0;
        }
      }
    }
    const elapsedMs = performance.now() - startMs;
    const msPerTile = elapsedMs / flushedCount;
    this.dirtyTileIndices.clear();
    this.flushCount += 1; this.totalTilesFlushed += flushedCount;
    this.lastFlushedTileCount = flushedCount; this.lastFlushMs = elapsedMs;
    this.tileLatencySamplesMs.push(msPerTile);
    return { flushedTileCount: flushedCount, skippedTileCount: this.totalTiles - flushedCount, elapsedMs, msPerTile };
  }

  getTileRgba(tx: number, ty: number): Uint8ClampedArray {
    return tx < 0 || ty < 0 || tx >= this.tilesX || ty >= this.tilesY
      ? this.paperTileTemplate
      : (this.compositedTiles.get(ty * this.tilesX + tx) ?? this.paperTileTemplate);
  }

  getMetrics(): DirtyTileCompositorMetrics {
    let allocatedLayerTiles = 0;
    for (const layer of this.layers) allocatedLayerTiles += layer.tiles.size;
    const sorted = [...this.tileLatencySamplesMs].sort((a, b) => a - b);
    const avgTileMs = sorted.length > 0 ? sorted.reduce((acc, v) => acc + v, 0) / sorted.length : 0;
    const p50TileMs = sorted.length > 0 ? (sorted[Math.floor(sorted.length * 0.5)] ?? 0) : 0;
    const p95TileMs = sorted.length > 0 ? (sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0) : 0;
    const maxTileMs = sorted.length > 0 ? (sorted[sorted.length - 1] ?? 0) : 0;
    return {
      canvasWidth: this.canvasWidth, canvasHeight: this.canvasHeight, tilesX: this.tilesX, tilesY: this.tilesY,
      totalTiles: this.totalTiles, allocatedLayerTiles, allocatedCompositeTiles: this.compositedTiles.size,
      pendingDirtyTiles: this.dirtyTileIndices.size, flushCount: this.flushCount, totalTilesFlushed: this.totalTilesFlushed,
      lastFlushedTileCount: this.lastFlushedTileCount, lastFlushMs: this.lastFlushMs, avgTileMs, p50TileMs, p95TileMs, maxTileMs,
    };
  }
}
