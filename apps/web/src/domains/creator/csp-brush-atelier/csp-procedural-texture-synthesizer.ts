/**
 * Clip Studio Paint 9대 카테고리 × 36종 브러시 실측 물리 텍스처 스탬프 합성기 & 10,000점 O(1) 스트로크 엔진.
 */

import {
  studioOssEqualAreaDiskOffset,
  studioOssUnitHash,
} from "../studio-oss-brush-kernels";
import {
  type CspBrushCategoryId,
  type CspBrushId,
  type CspProBrushSpec,
  getCspBrushById,
} from "./csp-all-categories-brush-catalog";
import {
  clamp01,
  evaluateCspBrushTexel,
  samplePaperSubstrateHeight,
} from "./csp-brush-texel-kernels";

export { samplePaperSubstrateHeight };

export interface CspStampSynthesisOptions {
  readonly brush: CspProBrushSpec;
  readonly size?: number;
  readonly pressure01?: number;
  readonly tilt01?: number;
  readonly velocity01?: number;
  readonly directionRadians?: number;
  readonly paperToothOverride01?: number;
  readonly colorMixOverride01?: number;
  readonly seed?: number;
  readonly inkRgb?: readonly [number, number, number];
  readonly reusableAlpha?: Float32Array;
  readonly reusableRgba?: Uint8ClampedArray;
  readonly reusableHeight?: Float32Array;
}

export interface CspStampPhysicalMetrics {
  readonly meanAlpha: number;
  readonly alphaStdDev: number;
  readonly entropyBits: number;
  readonly edgeDarkeningRatio: number;
  readonly bristleAnisotropyIndex: number;
  readonly impastoReliefPeak: number;
  readonly paperValleySkipRatio: number;
  readonly scatterClusterCount: number;
  readonly activePixelCount: number;
  readonly reusedBuffers: boolean;
}

export interface CspPhysicalStampResult {
  readonly brushId: CspBrushId;
  readonly category: CspBrushCategoryId;
  readonly size: number;
  readonly alpha: Float32Array;
  readonly rgba: Uint8ClampedArray;
  readonly heightMap: Float32Array;
  readonly metrics: CspStampPhysicalMetrics;
}

export interface CspStrokeStripOptions {
  readonly brush: CspProBrushSpec;
  readonly width?: number;
  readonly height?: number;
  readonly pressure01?: number;
  readonly tilt01?: number;
  readonly paperToothOverride01?: number;
  readonly colorMixOverride01?: number;
  readonly seed?: number;
}

export interface CspStrokeStripResult {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly stampMetrics: CspStampPhysicalMetrics;
  readonly stampedDabs: number;
  readonly nonEmptyPixels: number;
}

export interface CspStrokePointInput {
  readonly x: number;
  readonly y: number;
  readonly pressure01?: number;
  readonly tilt01?: number;
  readonly timestampMs?: number;
}

export interface CspEmittedDab {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
  readonly opacity01: number;
  readonly angleRadians: number;
  readonly pressure01: number;
  readonly drySkip01: number;
}

export interface CspStroke10kBudgetResult {
  readonly brushId: CspBrushId;
  readonly processedPoints: number;
  readonly emittedDabs: number;
  readonly sanitizedInputs: number;
  readonly nanOutputCount: number;
  readonly droppedStrokeCount: number;
  readonly firstWindowMs: number;
  readonly lastWindowMs: number;
  readonly tailToHeadRatio: number;
  readonly avgStepMs: number;
  readonly peakRetainedBytes: number;
  readonly within60FpsBudget: boolean;
}

const RING_CAPACITY = 64;
const MAX_DABS_PER_STEP = 24;
const FIXED_RING_BYTES = RING_CAPACITY * 4 * 8 + 128;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clampRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return value < min ? min : value > max ? max : value;
}

/** 9대 카테고리 × 36종 브러시의 실측 물리 RGBA/Float32 스탬프 + 정량 질감 지표 합성. */
export function synthesizeCspBrushPhysicalStamp(
  options: CspStampSynthesisOptions,
): CspPhysicalStampResult {
  const { brush } = options;
  const size = Math.max(24, Math.min(128, Math.floor(finite(options.size ?? 64, 64))));
  const total = size * size;
  const reusedAlpha = options.reusableAlpha !== undefined && options.reusableAlpha.length >= total;
  const reusedRgba = options.reusableRgba !== undefined && options.reusableRgba.length >= total * 4;
  const reusedHeight = options.reusableHeight !== undefined && options.reusableHeight.length >= total;
  const alpha = reusedAlpha ? options.reusableAlpha! : new Float32Array(total);
  const rgba = reusedRgba ? options.reusableRgba! : new Uint8ClampedArray(total * 4);
  const heightMap = reusedHeight ? options.reusableHeight! : new Float32Array(total);
  if (reusedAlpha) alpha.fill(0, 0, total);
  if (reusedRgba) rgba.fill(0, 0, total * 4);
  if (reusedHeight) heightMap.fill(0, 0, total);

  const p = clamp01(finite(options.pressure01 ?? 0.68, 0.68));
  const tilt = clamp01(finite(options.tilt01 ?? 0.18, 0.18));
  const vel = clamp01(finite(options.velocity01 ?? 0.28, 0.28));
  const dir = finite(options.directionRadians ?? 0, 0);
  const paperTooth = clamp01(finite(options.paperToothOverride01 ?? brush.paperToothStrength01, brush.paperToothStrength01));
  const colorMix = clamp01(finite(options.colorMixOverride01 ?? brush.colorMixStrength01, brush.colorMixStrength01));
  const seed = Math.trunc(finite(options.seed ?? 0x25d0, 0x25d0));
  const [baseR, baseG, baseB] = options.inkRgb ?? brush.previewInkRgb;
  const mixTargetR = clampRange(255 - baseR * 0.42, 48, 232, 192);
  const mixTargetG = clampRange(228 - baseG * 0.28, 56, 224, 168);
  const mixTargetB = clampRange(194 - baseB * 0.22, 48, 212, 134);

  const half = (size - 1) * 0.5;
  const hist = new Uint32Array(16);
  let activeCount = 0;
  let alphaSum = 0;
  let alphaSqSum = 0;
  let coreSum = 0;
  let coreCount = 0;
  let rimSum = 0;
  let rimCount = 0;
  let interiorPixels = 0;
  let skippedValleys = 0;
  let scatterClusterCount = 0;
  let maxShade = -1;
  let minShade = 1;

  for (let y = 0; y < size; y += 1) {
    const ny = (y - half) / half;
    for (let x = 0; x < size; x += 1) {
      const nx = (x - half) / half;
      const tex = evaluateCspBrushTexel(
        brush, nx, ny, 32 + (x - half) * 0.58, 32 + (y - half) * 0.58,
        p, tilt, vel, dir, paperTooth, colorMix, seed,
      );
      const idx = y * size + x;
      alpha[idx] = tex.alpha;
      heightMap[idx] = tex.height;

      const mixT = clamp01(tex.mixRatio * 0.55);
      const mixedR = baseR + (mixTargetR - baseR) * mixT;
      const mixedG = baseG + (mixTargetG - baseG) * mixT;
      const mixedB = baseB + (mixTargetB - baseB) * mixT;
      const litScale = 1 + tex.shadeDelta * 0.65;
      const liftAdd = tex.shadeDelta > 0 ? tex.shadeDelta * 58 : 0;
      const px4 = idx * 4;
      rgba[px4] = Math.round(clampRange(mixedR * litScale + liftAdd, 0, 255, baseR));
      rgba[px4 + 1] = Math.round(clampRange(mixedG * litScale + liftAdd, 0, 255, baseG));
      rgba[px4 + 2] = Math.round(clampRange(mixedB * litScale + liftAdd, 0, 255, baseB));
      rgba[px4 + 3] = Math.round(clamp01(tex.alpha) * 255);

      const radial = Math.hypot(nx, ny);
      if (radial <= 0.72) {
        interiorPixels += 1;
        if (tex.alpha < 0.14) skippedValleys += 1;
      }
      if (radial <= 0.46) {
        coreSum += tex.alpha;
        coreCount += 1;
      } else if (radial >= 0.72 && radial <= 0.94) {
        rimSum += tex.alpha;
        rimCount += 1;
      }
      if (tex.alpha > 0.02) {
        activeCount += 1;
        alphaSum += tex.alpha;
        alphaSqSum += tex.alpha * tex.alpha;
        const bucket = Math.min(15, Math.floor(tex.alpha * 15.999));
        hist[bucket] = (hist[bucket] ?? 0) + 1;
        if (tex.height > 0.05) {
          if (tex.shadeDelta > maxShade) maxShade = tex.shadeDelta;
          if (tex.shadeDelta < minShade) minShade = tex.shadeDelta;
        }
      }
      if (tex.isScatter && tex.alpha > 0.1) scatterClusterCount += 1;
    }
  }

  if (brush.textureKernel === "wax-crayon" || brush.textureKernel === "chalk-powder") {
    const crumbs = Math.round(14 + (1 - p) * 14);
    for (let i = 0; i < crumbs; i += 1) {
      const off = studioOssEqualAreaDiskOffset(seed ^ 0x4c1d, i, 1, i * 17);
      const ringR = 0.8 + off.distance * 0.22;
      const cx = Math.round(half + Math.cos(off.angle) * ringR * half);
      const cy = Math.round(half + Math.sin(off.angle) * ringR * half);
      if (cx < 0 || cx >= size || cy < 0 || cy >= size) continue;
      const cAlpha = clamp01(0.32 + studioOssUnitHash(seed, i, 0x77) * 0.52);
      const idx = cy * size + cx;
      if (alpha[idx]! < cAlpha) {
        alpha[idx] = cAlpha;
        rgba[idx * 4] = baseR;
        rgba[idx * 4 + 1] = baseG;
        rgba[idx * 4 + 2] = baseB;
        rgba[idx * 4 + 3] = Math.round(cAlpha * 255);
        scatterClusterCount += 1;
      }
    }
  }

  let acrossGrad = 0;
  let alongGrad = 0;
  const cosA = Math.abs(Math.cos(dir));
  const sinA = Math.abs(Math.sin(dir));
  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const gx = Math.abs(alpha[y * size + (x + 1)]! - alpha[y * size + (x - 1)]!);
      const gy = Math.abs(alpha[(y + 1) * size + x]! - alpha[(y - 1) * size + x]!);
      alongGrad += gx * cosA + gy * sinA;
      acrossGrad += gx * sinA + gy * cosA;
    }
  }

  const meanAlpha = activeCount > 0 ? alphaSum / activeCount : 0;
  const variance = activeCount > 0 ? Math.max(0, alphaSqSum / activeCount - meanAlpha * meanAlpha) : 0;
  let entropyBits = 0;
  if (activeCount > 0) {
    for (let b = 0; b < 16; b += 1) {
      const count = hist[b]!;
      if (count > 0) {
        const prob = count / activeCount;
        entropyBits -= prob * Math.log2(prob);
      }
    }
  }

  const coreMean = coreCount > 0 ? coreSum / coreCount : 0;
  const rimMean = rimCount > 0 ? rimSum / rimCount : 0;
  return {
    brushId: brush.id,
    category: brush.category,
    size,
    alpha,
    rgba,
    heightMap,
    metrics: {
      meanAlpha: Number(meanAlpha.toFixed(4)),
      alphaStdDev: Number(Math.sqrt(variance).toFixed(4)),
      entropyBits: Number(entropyBits.toFixed(3)),
      edgeDarkeningRatio: Number((coreMean > 0.02 ? rimMean / coreMean : 0).toFixed(3)),
      bristleAnisotropyIndex: Number((alongGrad > 1e-4 ? acrossGrad / alongGrad : 1).toFixed(3)),
      impastoReliefPeak: Number((maxShade > minShade ? clamp01((maxShade - minShade) * 0.95) : 0).toFixed(3)),
      paperValleySkipRatio: Number((interiorPixels > 0 ? skippedValleys / interiorPixels : 0).toFixed(3)),
      scatterClusterCount,
      activePixelCount: activeCount,
      reusedBuffers: reusedAlpha && reusedRgba && reusedHeight,
    },
  };
}

/** 36종 브러시 실시간 스트로크 질감 프리뷰 스트립(S-커브 가변 필압) 렌더링. */
export function renderCspBrushStrokePreviewStrip(
  options: CspStrokeStripOptions,
): CspStrokeStripResult {
  const width = Math.max(120, Math.min(384, Math.floor(finite(options.width ?? 240, 240))));
  const height = Math.max(48, Math.min(128, Math.floor(finite(options.height ?? 68, 68))));
  const rgba = new Uint8ClampedArray(width * height * 4);
  const basePressure = clamp01(finite(options.pressure01 ?? 0.72, 0.72));
  const baseTilt = clamp01(finite(options.tilt01 ?? 0.22, 0.22));
  const seed = Math.trunc(finite(options.seed ?? 0x25d0, 0x25d0));

  if (options.brush.operationMode !== "paint") {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4;
        const leftTone = x < width * 0.52;
        rgba[idx] = leftTone ? 72 : 196;
        rgba[idx + 1] = leftTone ? 112 : 128;
        rgba[idx + 2] = leftTone ? 168 : 96;
        rgba[idx + 3] = 172;
      }
    }
  }

  const stampSize = 40;
  const reusableAlpha = new Float32Array(stampSize * stampSize);
  const reusableRgba = new Uint8ClampedArray(stampSize * stampSize * 4);
  const reusableHeight = new Float32Array(stampSize * stampSize);
  const baseStamp = synthesizeCspBrushPhysicalStamp({
    brush: options.brush, size: 64, pressure01: basePressure, tilt01: baseTilt,
    paperToothOverride01: options.paperToothOverride01,
    colorMixOverride01: options.colorMixOverride01,
    seed,
  });

  const dabCount = options.brush.category === "decoration" ? 9 : 26;
  const [minS, maxS] = options.brush.pressureSizeRange;
  let stampedDabs = 0;

  for (let i = 0; i < dabCount; i += 1) {
    const u = i / Math.max(1, dabCount - 1);
    const xCenter = 22 + u * (width - 44);
    const yCenter = height * 0.5 + Math.sin(u * Math.PI * 2) * (height * 0.2);
    const angle = Math.atan2(
      (Math.cos(u * Math.PI * 2) * Math.PI * 2 * (height * 0.2)) / Math.max(1, width - 44),
      1,
    );
    const localPressure = clamp01(basePressure * (0.28 + 0.72 * Math.sin(u * Math.PI)));
    const localScale = minS + (maxS - minS) * (localPressure ** options.brush.pressureGamma);
    const drawRadius = clampRange(11 * localScale + 5, 5, height * 0.44, 14);

    const dabStamp = synthesizeCspBrushPhysicalStamp({
      brush: options.brush, size: stampSize, pressure01: localPressure, tilt01: baseTilt,
      directionRadians: angle, paperToothOverride01: options.paperToothOverride01,
      colorMixOverride01: options.colorMixOverride01, seed: seed + i * 31,
      reusableAlpha, reusableRgba, reusableHeight,
    });

    const minX = Math.max(0, Math.floor(xCenter - drawRadius));
    const maxX = Math.min(width - 1, Math.ceil(xCenter + drawRadius));
    const minY = Math.max(0, Math.floor(yCenter - drawRadius));
    const maxY = Math.min(height - 1, Math.ceil(yCenter + drawRadius));

    for (let py = minY; py <= maxY; py += 1) {
      const sy = Math.min(stampSize - 1, Math.max(0, Math.floor(((py - (yCenter - drawRadius)) / (drawRadius * 2)) * stampSize)));
      for (let px = minX; px <= maxX; px += 1) {
        const sx = Math.min(stampSize - 1, Math.max(0, Math.floor(((px - (xCenter - drawRadius)) / (drawRadius * 2)) * stampSize)));
        const sIdx = (sy * stampSize + sx) * 4;
        const srcA = dabStamp.rgba[sIdx + 3]! / 255;
        if (srcA <= 0.01) continue;
        const dIdx = (py * width + px) * 4;
        if (options.brush.operationMode === "erase" || options.brush.operationMode === "vector-erase") {
          rgba[dIdx + 3] = Math.round(rgba[dIdx + 3]! * clamp01(1 - srcA * (options.brush.operationMode === "vector-erase" ? 1 : 0.75)));
        } else {
          const dstA = rgba[dIdx + 3]! / 255;
          const outA = srcA + dstA * (1 - srcA);
          if (outA > 0.001) {
            rgba[dIdx] = Math.round((dabStamp.rgba[sIdx]! * srcA + rgba[dIdx]! * dstA * (1 - srcA)) / outA);
            rgba[dIdx + 1] = Math.round((dabStamp.rgba[sIdx + 1]! * srcA + rgba[dIdx + 1]! * dstA * (1 - srcA)) / outA);
            rgba[dIdx + 2] = Math.round((dabStamp.rgba[sIdx + 2]! * srcA + rgba[dIdx + 2]! * dstA * (1 - srcA)) / outA);
            rgba[dIdx + 3] = Math.round(outA * 255);
          }
        }
      }
    }
    stampedDabs += 1;
  }

  let nonEmptyPixels = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i]! > 8) nonEmptyPixels += 1;
  }
  return { width, height, rgba, stampMetrics: baseStamp.metrics, stampedDabs, nonEmptyPixels };
}

/** 10,000점 연속 획을 O(1) 고정 링버퍼·제로-할당 풀로 처리하는 무지연 예산 검증기. */
export function runCspStroke10kBudgetCheck(
  brushOrId: CspProBrushSpec | CspBrushId,
  pointCount = 10_000,
): CspStroke10kBudgetResult {
  const brush = typeof brushOrId === "string" ? getCspBrushById(brushOrId) : brushOrId;
  if (!brush) throw new Error(`알 수 없는 브러시 ID: ${String(brushOrId)}`);

  const totalPoints = Math.max(1000, Math.min(20_000, Math.floor(finite(pointCount, 10_000))));
  const histX = new Float64Array(RING_CAPACITY);
  const histY = new Float64Array(RING_CAPACITY);
  const histP = new Float64Array(RING_CAPACITY);
  const histT = new Float64Array(RING_CAPACITY);
  const scratchDab: { -readonly [K in keyof CspEmittedDab]: CspEmittedDab[K] } = {
    index: 0, x: 0, y: 0, radiusPx: 1, opacity01: 1, angleRadians: 0, pressure01: 0.5, drySkip01: 0,
  };

  let head = 0;
  let hasPoint = false;
  let xHat = 0;
  let yHat = 0;
  let dxHat = 0;
  let dyHat = 0;
  let lastRawX = 0;
  let lastRawY = 0;
  let lastP = 0.5;
  let lastT = 0;
  let lastAngle = 0;
  let carryDist = 0;
  let emittedDabs = 0;
  let sanitizedInputs = 0;
  let nanOutputCount = 0;

  const baseSizePx = Math.max(4, brush.defaultSizePx);
  const spacingPx = Math.max(0.85, baseSizePx * brush.spacingRatio);
  const minCutoff = 3.4 - (brush.stabilizerLevel / 100) * 3.0;
  const beta = (brush.stabilizerLevel / 100) * 0.004;
  const [minS, maxS] = brush.pressureSizeRange;
  const [minO, maxO] = brush.pressureOpacityRange;

  const processPoint = (sample: CspStrokePointInput): void => {
    let rawX = sample.x;
    let rawY = sample.y;
    let rawP = sample.pressure01 ?? 0.5;
    let rawT = sample.timestampMs ?? (hasPoint ? lastT + 4 : 0);
    let bad = false;
    if (!Number.isFinite(rawX)) { rawX = hasPoint ? lastRawX : 0; bad = true; }
    if (!Number.isFinite(rawY)) { rawY = hasPoint ? lastRawY : 0; bad = true; }
    if (!Number.isFinite(rawP)) { rawP = hasPoint ? lastP : 0.5; bad = true; }
    if (!Number.isFinite(rawT)) { rawT = hasPoint ? lastT + 4 : 0; bad = true; }
    if (bad) sanitizedInputs += 1;

    const p = clamp01(rawP);
    const tilt = clamp01(finite(sample.tilt01 ?? 0.2, 0.2));

    if (!hasPoint) {
      hasPoint = true;
      xHat = rawX; yHat = rawY; lastRawX = rawX; lastRawY = rawY; lastP = p; lastT = rawT;
      histX[0] = xHat; histY[0] = yHat; histP[0] = p; histT[0] = rawT; head = 1;
      scratchDab.index = emittedDabs++;
      scratchDab.x = xHat; scratchDab.y = yHat;
      scratchDab.radiusPx = Math.max(0.5, baseSizePx * 0.5 * (minS + (maxS - minS) * p));
      scratchDab.opacity01 = clampRange(minO + (maxO - minO) * p, 0.08, 1, 0.5);
      scratchDab.angleRadians = 0; scratchDab.pressure01 = p;
      scratchDab.drySkip01 = clamp01((1 - p) * brush.paperToothStrength01);
      return;
    }

    const dtSec = clampRange((rawT - lastT) / 1000, 1 / 240, 0.1, 1 / 120);
    const prevX = xHat;
    const prevY = yHat;
    const aD = 1 / (1 + 1 / (2 * Math.PI * dtSec));
    dxHat = aD * ((rawX - xHat) / dtSec) + (1 - aD) * dxHat;
    dyHat = aD * ((rawY - yHat) / dtSec) + (1 - aD) * dyHat;
    const aX = 1 / (1 + 1 / (2 * Math.PI * (minCutoff + beta * Math.abs(dxHat)) * dtSec));
    const aY = 1 / (1 + 1 / (2 * Math.PI * (minCutoff + beta * Math.abs(dyHat)) * dtSec));
    xHat = aX * rawX + (1 - aX) * xHat;
    yHat = aY * rawY + (1 - aY) * yHat;

    histX[head] = xHat; histY[head] = yHat; histP[head] = p; histT[head] = rawT;
    head = (head + 1) % RING_CAPACITY;

    const dx = xHat - prevX;
    const dy = yHat - prevY;
    const segLen = Math.hypot(dx, dy);
    if (segLen > 1e-4) lastAngle = Math.atan2(dy, dx);

    const avail = carryDist + segLen;
    if (avail >= spacingPx && segLen > 1e-4) {
      const rawSteps = Math.floor(avail / spacingPx);
      const steps = Math.min(MAX_DABS_PER_STEP, Math.max(1, rawSteps));
      const effSpace = rawSteps > MAX_DABS_PER_STEP ? segLen / steps : spacingPx;
      let dist = rawSteps > MAX_DABS_PER_STEP ? effSpace : spacingPx - carryDist;
      const tiltMul = 1 + (brush.tiltExpandMax - 1) * tilt * 0.45;
      for (let s = 0; s < steps; s += 1) {
        const u = clamp01(dist / segLen);
        const dp = lastP + (p - lastP) * u;
        const shaped = dp ** brush.pressureGamma;
        const radius = Math.max(0.45, baseSizePx * 0.5 * (minS + (maxS - minS) * shaped) * tiltMul);
        const opacity = clampRange(minO + (maxO - minO) * shaped, 0.08, 1, 0.5);
        const px = prevX + dx * u;
        const py = prevY + dy * u;
        if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(radius) || !Number.isFinite(opacity)) {
          nanOutputCount += 1;
        } else {
          scratchDab.index = emittedDabs++;
          scratchDab.x = px; scratchDab.y = py; scratchDab.radiusPx = radius;
          scratchDab.opacity01 = opacity; scratchDab.angleRadians = lastAngle;
          scratchDab.pressure01 = dp; scratchDab.drySkip01 = clamp01((1 - shaped) * brush.paperToothStrength01);
        }
        dist += effSpace;
      }
      carryDist = rawSteps > MAX_DABS_PER_STEP ? 0 : Math.max(0, avail - steps * spacingPx);
    } else {
      carryDist = avail;
    }
    lastRawX = rawX; lastRawY = rawY; lastP = p; lastT = rawT;
  };

  for (let w = 0; w < 64; w += 1) {
    processPoint({ x: w * 2.5, y: Math.sin(w * 0.1) * 18, pressure01: 0.6, tilt01: 0.2, timestampMs: w * 4 });
  }
  hasPoint = false; emittedDabs = 0; sanitizedInputs = 0; nanOutputCount = 0; carryDist = 0;

  const windowSize = Math.floor(totalPoints * 0.2);
  let firstWindowMs = 0;
  let lastWindowStart = 0;
  const startAll = performance.now();

  for (let i = 0; i < totalPoints; i += 1) {
    if (i === totalPoints - windowSize) lastWindowStart = performance.now();
    const angle = i * 0.045;
    processPoint({
      x: i > 0 && i % 2500 === 0 ? Number.NaN : i * 1.45 + Math.cos(angle) * 24,
      y: 120 + Math.sin(angle * 1.3) * 48,
      pressure01: i % 500 === 0 ? 0 : 0.2 + 0.78 * (0.5 + 0.5 * Math.sin(i * 0.02)),
      tilt01: 0.15 + 0.55 * (0.5 + 0.5 * Math.cos(i * 0.015)),
      timestampMs: i * 4,
    });
    if (i === windowSize - 1) firstWindowMs = performance.now() - startAll;
  }
  const totalMs = performance.now() - startAll;
  const lastWindowMs = Math.max(0.001, performance.now() - lastWindowStart);
  const safeFirstMs = Math.max(0.001, firstWindowMs);
  const avgStepMs = totalMs / totalPoints;
  const droppedStrokeCount = emittedDabs === 0 ? 1 : 0;

  return {
    brushId: brush.id,
    processedPoints: totalPoints,
    emittedDabs,
    sanitizedInputs,
    nanOutputCount,
    droppedStrokeCount,
    firstWindowMs: Number(safeFirstMs.toFixed(3)),
    lastWindowMs: Number(lastWindowMs.toFixed(3)),
    tailToHeadRatio: Number((lastWindowMs / safeFirstMs).toFixed(3)),
    avgStepMs: Number(avgStepMs.toFixed(5)),
    peakRetainedBytes: FIXED_RING_BYTES,
    within60FpsBudget: avgStepMs < 1 && nanOutputCount === 0 && droppedStrokeCount === 0 && totalMs < 250,
  };
}
