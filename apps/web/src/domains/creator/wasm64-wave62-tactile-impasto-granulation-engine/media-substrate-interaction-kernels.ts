/**
 * 5대 실물 매체 종이-안료 물리 상호작용 커널.
 *
 * - 연필/목탄(`pencil` / `charcoal`): Contact-Tooth 모델 — 약한 필압은 종이 봉우리(Peak)만 거칠게 긁고,
 *   강한 필압은 골짜기(Valley)까지 압축 충진하며, 틸트 광폭 음영과 흑연 스펙큘러를 구현한다.
 * - 수채화(`watercolor`): 종이 골짜기 침착(Granulation) + 가장자리 안료 응집(Coffee-Ring / Backrun) +
 *   습윤 확산(Wet Diffusion) 및 Kubelka-Munk 감산 혼색.
 * - 유화/아크릴(`oil` / `acrylic`) 및 G펜/마루펜(`gpen` / `marupen`) 커널과 측면 광원 합성기를
 *   함께 재내보내 단일 진입점(`applyPhysicalMediaStroke`)을 제공한다.
 */

import {
  PhysicalPaintCanvasBuffer,
  clamp01,
  clampRange,
  createEmptyDirtyRect,
  makeDirtyRect,
  mergeDirtyRects,
  mixPigmentsKubelkaMunk,
  type LinearRgbTuple,
  type PhysicalCanvasDirtyRect,
} from "./three-channel-physical-canvas-buffer";
import {
  resampleStrokePoints,
  stampDipPenInkStroke,
  stampOilImpastoStroke,
  type StrokePointSample,
} from "./raking-light-impasto-compositor";

export {
  compositeRakingLightImpastoRgba,
  compositeRakingLightImpastoSrgbUint8,
  computeHeightFieldSobelNormal,
  evaluateDipPenNibProfile,
  stampDipPenInkStroke,
  stampOilImpastoStroke,
  type DipPenConfig,
  type DipPenNibProfileSample,
  type DipPenStrokeResult,
  type OilImpastoStrokeOptions,
  type OilImpastoStrokeResult,
  type RakingLightCompositeOptions,
  type StrokePointSample,
} from "./raking-light-impasto-compositor";

export type PhysicalMediumId =
  | "pencil"
  | "charcoal"
  | "watercolor"
  | "oil"
  | "acrylic"
  | "gpen"
  | "marupen";

export interface DryMediaKernelOptions {
  readonly variant: "pencil" | "charcoal";
  readonly colorLinearRgb: LinearRgbTuple;
  readonly radiusPx: number;
  readonly hardness?: number;
  readonly toothContrast?: number;
  readonly tiltBroadenFactor?: number;
  readonly graphiteSheenStrength?: number;
  readonly grainScatter?: number;
  readonly opacity?: number;
  readonly seed?: number;
}

export interface DryMediaStrokeResult {
  readonly dirtyRect: PhysicalCanvasDirtyRect;
  readonly pixelsTouched: number;
  readonly peakCoverageMean: number;
  readonly valleyCoverageMean: number;
  readonly meanGraphiteSheen: number;
  readonly effectiveAspectRatio: number;
}

export interface WatercolorDabOptions {
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
  readonly pressure: number;
  readonly colorLinearRgb: LinearRgbTuple;
  readonly waterLoad?: number;
  readonly pigmentLoad?: number;
  readonly granulationStrength?: number;
  readonly opacity?: number;
}

export interface WatercolorSimulationOptions {
  readonly iterations?: number;
  readonly diffusionRate?: number;
  readonly backrunEdgeStrength?: number;
  readonly granulationRate?: number;
  readonly evaporationRate?: number;
  readonly bounds?: PhysicalCanvasDirtyRect;
}

export interface WatercolorSimulationResult {
  readonly iterationsExecuted: number;
  readonly dirtyRect: PhysicalCanvasDirtyRect;
  readonly activeWetPixels: number;
  readonly meanValleyPigment: number;
  readonly meanPeakPigment: number;
}

export interface PhysicalMediaStrokeRequest {
  readonly medium: PhysicalMediumId;
  readonly points: readonly StrokePointSample[];
  readonly colorLinearRgb: LinearRgbTuple;
  readonly radiusPx: number;
  readonly opacity?: number;
  readonly seed?: number;
  readonly watercolorSimSteps?: number;
}

export interface PhysicalMediaStrokeSummary {
  readonly medium: PhysicalMediumId;
  readonly dirtyRect: PhysicalCanvasDirtyRect;
  readonly pixelsTouched: number;
  readonly paintedPixelsInBuffer: number;
  readonly maxImpastoHeight: number;
}

function hashCell(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2246822519);
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

/**
 * 연필·목탄 Contact-Tooth 물리 댑 스탬프.
 *
 * 약한 필압(`pressure ≈ 0.2`)에서는 접촉 임계값이 높아 종이 봉우리(`tooth >= 0.65`)만 거칠게 긁히며,
 * 강한 필압(`pressure ≈ 0.95`)에서는 심이 골짜기 깊이까지 압축 침투해 골짜기(`tooth <= 0.35`)도 밀도 높게 채운다.
 */
export function stampDryMediaContactToothDab(
  buffer: PhysicalPaintCanvasBuffer,
  sample: StrokePointSample,
  options: DryMediaKernelOptions,
): DryMediaStrokeResult {
  const isCharcoal = options.variant === "charcoal";
  const pressure = clamp01(sample.pressure);
  const tiltMag = clamp01(sample.tiltMagnitude ?? 0);
  const tiltAz = sample.tiltAzimuthRad ?? 0;
  const hardness = clamp01(options.hardness ?? (isCharcoal ? 0.18 : 0.48));
  const toothContrast = clampRange(options.toothContrast ?? (isCharcoal ? 1.45 : 1.15), 0.3, 2.5);
  const tiltBroaden = clampRange(options.tiltBroadenFactor ?? (isCharcoal ? 2.6 : 2.2), 1, 4);
  const graphiteSheenStrength = clamp01(options.graphiteSheenStrength ?? (isCharcoal ? 0.04 : 0.42));
  const grainScatter = clamp01(options.grainScatter ?? (isCharcoal ? 0.36 : 0.14));
  const opacity = clamp01(options.opacity ?? (isCharcoal ? 0.9 : 0.85));
  const seed = Math.floor(options.seed ?? 6210);

  const minorRadius = Math.max(0.9, options.radiusPx * (0.55 + 0.55 * pressure));
  const aspectRatio = 1 + tiltMag * (tiltBroaden - 1);
  const majorRadius = minorRadius * aspectRatio;
  const arealPressure = clamp01(pressure / Math.pow(aspectRatio, 0.42));

  // 흑연/목탄-종이 압축 접촉 깊이 모델 (압축 전이 폭 0.36 기준)
  const pressureCurve = Math.pow(arealPressure, 0.72 + hardness * 0.38);
  const contactThreshold = 0.86 - pressureCurve * 1.38;

  const cosA = Math.cos(tiltAz);
  const sinA = Math.sin(tiltAz);
  const boundR = Math.ceil(majorRadius + 2);
  const xStart = Math.max(0, Math.floor(sample.x - boundR));
  const xEnd = Math.min(buffer.width - 1, Math.ceil(sample.x + boundR));
  const yStart = Math.max(0, Math.floor(sample.y - boundR));
  const yEnd = Math.min(buffer.height - 1, Math.ceil(sample.y + boundR));

  let minX = buffer.width;
  let minY = buffer.height;
  let maxX = -1;
  let maxY = -1;
  let pixelsTouched = 0;
  let peakAlphaSum = 0;
  let peakCount = 0;
  let valleyAlphaSum = 0;
  let valleyCount = 0;
  let sheenAccum = 0;

  for (let py = yStart; py <= yEnd; py += 1) {
    const dy = py - sample.y;
    for (let px = xStart; px <= xEnd; px += 1) {
      const dx = px - sample.x;
      const localU = dx * cosA + dy * sinA;
      const localV = -dx * sinA + dy * cosA;
      const ellipDist = Math.hypot(localU / majorRadius, localV / minorRadius);
      if (ellipDist >= 1) continue;

      const idx = py * buffer.width + px;
      const p4 = idx * 4;
      const tooth = buffer.paperToothF32[idx];
      const effectiveTooth = clamp01(tooth + (hashCell(px, py, seed) - 0.5) * grainScatter * 0.34);

      const rawContact = clamp01((effectiveTooth - contactThreshold) / 0.36);
      const shapedContact = Math.pow(rawContact, toothContrast);
      const radialFalloff = Math.pow(1 - ellipDist * ellipDist, isCharcoal ? 1.0 : 1.15);
      const deposit = clamp01(shapedContact * radialFalloff * opacity * (0.3 + 0.7 * pressure));

      if (tooth >= 0.65) {
        peakCount += 1;
        peakAlphaSum += deposit;
      } else if (tooth <= 0.35) {
        valleyCount += 1;
        valleyAlphaSum += deposit;
      }
      if (deposit <= 0.001) continue;

      const dstA = buffer.rgbaLinearF32[p4 + 3];
      let outR = options.colorLinearRgb[0];
      let outG = options.colorLinearRgb[1];
      let outB = options.colorLinearRgb[2];
      if (dstA > 0.002) {
        const mixed = mixPigmentsKubelkaMunk(
          [buffer.rgbaLinearF32[p4], buffer.rgbaLinearF32[p4 + 1], buffer.rgbaLinearF32[p4 + 2]],
          options.colorLinearRgb,
          clamp01(deposit / Math.max(0.01, deposit + dstA * 0.7)),
        );
        outR = mixed[0];
        outG = mixed[1];
        outB = mixed[2];
      }

      const nextA = clamp01(dstA + deposit * (1 - dstA * 0.78));
      const burnishSheen =
        !isCharcoal && nextA > 0.52
          ? graphiteSheenStrength * clamp01((nextA - 0.52) / 0.48) * (0.35 + 0.65 * pressure)
          : 0;
      sheenAccum += burnishSheen;

      buffer.rgbaLinearF32[p4] = clamp01(outR + burnishSheen * 0.08);
      buffer.rgbaLinearF32[p4 + 1] = clamp01(outG + burnishSheen * 0.082);
      buffer.rgbaLinearF32[p4 + 2] = clamp01(outB + burnishSheen * 0.092);
      buffer.rgbaLinearF32[p4 + 3] = nextA;
      buffer.heightF32[idx] = Math.max(
        buffer.heightF32[idx],
        isCharcoal ? deposit * 0.055 * tooth : deposit * 0.02 + burnishSheen * 0.08,
      );
      buffer.wetnessF32[idx] = Math.max(0, buffer.wetnessF32[idx] - deposit * 0.15);

      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
      pixelsTouched += 1;
    }
  }

  return {
    dirtyRect: makeDirtyRect(minX, minY, maxX, maxY),
    pixelsTouched,
    peakCoverageMean: peakCount > 0 ? peakAlphaSum / peakCount : 0,
    valleyCoverageMean: valleyCount > 0 ? valleyAlphaSum / valleyCount : 0,
    meanGraphiteSheen: pixelsTouched > 0 ? sheenAccum / pixelsTouched : 0,
    effectiveAspectRatio: aspectRatio,
  };
}

export function strokeDryMediaContactTooth(
  buffer: PhysicalPaintCanvasBuffer,
  samples: readonly StrokePointSample[],
  options: DryMediaKernelOptions,
): DryMediaStrokeResult {
  const resampled = resampleStrokePoints(samples, Math.max(0.8, options.radiusPx * 0.32));
  let dirtyRect = createEmptyDirtyRect();
  let pixelsTouched = 0;
  let peakSum = 0;
  let valleySum = 0;
  let sheenSum = 0;
  let aspectSum = 0;

  for (let i = 0; i < resampled.length; i += 1) {
    const res = stampDryMediaContactToothDab(buffer, resampled[i], {
      ...options,
      seed: (options.seed ?? 6210) + i * 17,
    });
    dirtyRect = mergeDirtyRects(dirtyRect, res.dirtyRect);
    pixelsTouched += res.pixelsTouched;
    peakSum += res.peakCoverageMean;
    valleySum += res.valleyCoverageMean;
    sheenSum += res.meanGraphiteSheen;
    aspectSum += res.effectiveAspectRatio;
  }

  const count = Math.max(1, resampled.length);
  return {
    dirtyRect,
    pixelsTouched,
    peakCoverageMean: peakSum / count,
    valleyCoverageMean: valleySum / count,
    meanGraphiteSheen: sheenSum / count,
    effectiveAspectRatio: aspectSum / count,
  };
}

/** 수채화 습윤 댑 스탬프: 평탄한 메니스커스 수막과 초기 골짜기 침착(Granulation)을 도포한다. */
export function stampWatercolorWetDab(
  buffer: PhysicalPaintCanvasBuffer,
  options: WatercolorDabOptions,
): PhysicalCanvasDirtyRect {
  const radius = Math.max(1.5, options.radiusPx);
  const pressure = clamp01(options.pressure);
  const waterLoad = clamp01(options.waterLoad ?? 0.88);
  const pigmentLoad = clamp01(options.pigmentLoad ?? 0.56);
  const granulationStrength = clamp01(options.granulationStrength ?? 0.68);
  const opacity = clamp01(options.opacity ?? 0.5);

  const xStart = Math.max(0, Math.floor(options.x - radius - 1));
  const xEnd = Math.min(buffer.width - 1, Math.ceil(options.x + radius + 1));
  const yStart = Math.max(0, Math.floor(options.y - radius - 1));
  const yEnd = Math.min(buffer.height - 1, Math.ceil(options.y + radius + 1));

  let minX = buffer.width;
  let minY = buffer.height;
  let maxX = -1;
  let maxY = -1;

  for (let py = yStart; py <= yEnd; py += 1) {
    const dy = py - options.y;
    for (let px = xStart; px <= xEnd; px += 1) {
      const distNorm = Math.hypot(px - options.x, dy) / radius;
      if (distNorm >= 1) continue;

      const idx = py * buffer.width + px;
      const p4 = idx * 4;
      const tooth = buffer.paperToothF32[idx];
      // 수채화 안료는 종이 골짜기(1 - tooth)에 우선 침착
      const valleyAffinity = 1 - granulationStrength + granulationStrength * (0.42 + 1.16 * (1 - tooth));
      // 표면장력에 의한 평탄한 수막 메니스커스(외곽 직전까지 균일하게 젖음)
      const waterProfile = Math.pow(1 - Math.pow(distNorm, 5.5), 0.45);
      const depositAlpha = clamp01(
        waterProfile * opacity * pigmentLoad * (0.4 + 0.6 * pressure) * valleyAffinity,
      );
      if (depositAlpha <= 0.001) continue;

      const dstA = buffer.rgbaLinearF32[p4 + 3];
      let outR = options.colorLinearRgb[0];
      let outG = options.colorLinearRgb[1];
      let outB = options.colorLinearRgb[2];
      if (dstA > 0.002) {
        const mixed = mixPigmentsKubelkaMunk(
          [buffer.rgbaLinearF32[p4], buffer.rgbaLinearF32[p4 + 1], buffer.rgbaLinearF32[p4 + 2]],
          options.colorLinearRgb,
          clamp01(depositAlpha / Math.max(0.01, depositAlpha + dstA)),
        );
        outR = mixed[0];
        outG = mixed[1];
        outB = mixed[2];
      }

      buffer.rgbaLinearF32[p4] = outR;
      buffer.rgbaLinearF32[p4 + 1] = outG;
      buffer.rgbaLinearF32[p4 + 2] = outB;
      buffer.rgbaLinearF32[p4 + 3] = clamp01(dstA + depositAlpha * (1 - dstA * 0.72));
      buffer.wetnessF32[idx] = clamp01(
        Math.max(buffer.wetnessF32[idx], waterLoad * waterProfile * (0.65 + 0.35 * pressure)),
      );
      buffer.heightF32[idx] = Math.max(buffer.heightF32[idx], 0.015 * (1 - tooth) * depositAlpha);

      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
  }
  return makeDirtyRect(minX, minY, maxX, maxY);
}

/**
 * 수채화 3대 물리 시뮬레이션(습윤 확산 · Coffee-Ring/Backrun 가장자리 응집 · 종이 골짜기 침착).
 */
export function stepWatercolorSimulation(
  buffer: PhysicalPaintCanvasBuffer,
  options: WatercolorSimulationOptions = {},
): WatercolorSimulationResult {
  const iterations = Math.max(1, Math.min(32, Math.floor(options.iterations ?? 6)));
  const diffusionRate = clampRange(options.diffusionRate ?? 0.24, 0, 0.45);
  const backrunEdgeStrength = clampRange(options.backrunEdgeStrength ?? 0.46, 0, 0.95);
  const granulationRate = clampRange(options.granulationRate ?? 0.38, 0, 0.85);
  const evaporationRate = clampRange(options.evaporationRate ?? 0.035, 0, 0.3);

  const bounds =
    options.bounds && !options.bounds.empty
      ? makeDirtyRect(
          Math.max(1, options.bounds.minX - iterations),
          Math.max(1, options.bounds.minY - iterations),
          Math.min(buffer.width - 2, options.bounds.maxX + iterations),
          Math.min(buffer.height - 2, options.bounds.maxY + iterations),
        )
      : makeDirtyRect(1, 1, buffer.width - 2, buffer.height - 2);

  if (bounds.empty || buffer.width < 3 || buffer.height < 3) {
    return {
      iterationsExecuted: 0,
      dirtyRect: createEmptyDirtyRect(),
      activeWetPixels: 0,
      meanValleyPigment: 0,
      meanPeakPigment: 0,
    };
  }

  const nextRgba = new Float32Array(buffer.rgbaLinearF32);
  const nextWet = new Float32Array(buffer.wetnessF32);
  const deltaAlpha = new Float32Array(buffer.pixelCount);
  const offsets: readonly (readonly [number, number])[] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  let activeWetPixels = 0;

  for (let iter = 0; iter < iterations; iter += 1) {
    nextRgba.set(buffer.rgbaLinearF32);
    nextWet.set(buffer.wetnessF32);
    deltaAlpha.fill(0);
    activeWetPixels = 0;

    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const idx = y * buffer.width + x;
        const wet = buffer.wetnessF32[idx];
        if (wet <= 0.015) continue;
        activeWetPixels += 1;

        const p4 = idx * 4;
        const srcA = buffer.rgbaLinearF32[p4 + 3];
        const srcTooth = buffer.paperToothF32[idx];
        let mixR = buffer.rgbaLinearF32[p4];
        let mixG = buffer.rgbaLinearF32[p4 + 1];
        let mixB = buffer.rgbaLinearF32[p4 + 2];
        let wetAccum = wet;
        let minNeighborWet = wet;
        let diffColorWeight = 0;
        let edgeTargetIdx = -1;
        let bestEdgeDrop = 0;
        let valleyTargetIdx = -1;
        let bestValleyDrop = 0;

        for (let d = 0; d < 4; d += 1) {
          const nIdx = (y + offsets[d][1]) * buffer.width + (x + offsets[d][0]);
          const nWet = buffer.wetnessF32[nIdx];
          const n4 = nIdx * 4;
          const nA = buffer.rgbaLinearF32[n4 + 3];
          const nTooth = buffer.paperToothF32[nIdx];
          if (nWet < minNeighborWet) minNeighborWet = nWet;

          // 습윤 확산(Wet-in-Wet Diffusion): Kubelka-Munk 감산 혼색
          const sharedWet = Math.min(wet, nWet);
          if (sharedWet > 0.03 && nA > 0.005) {
            const blend = clampRange(diffusionRate * sharedWet * 0.45, 0, 0.25);
            const km = mixPigmentsKubelkaMunk(
              [mixR, mixG, mixB],
              [buffer.rgbaLinearF32[n4], buffer.rgbaLinearF32[n4 + 1], buffer.rgbaLinearF32[n4 + 2]],
              blend,
            );
            mixR = km[0];
            mixG = km[1];
            mixB = km[2];
            diffColorWeight += blend;
          }
          wetAccum += (nWet - wet) * diffusionRate * 0.22;

          const wetDrop = wet - nWet;
          if (wetDrop > bestEdgeDrop && nWet > 0.015) {
            bestEdgeDrop = wetDrop;
            edgeTargetIdx = nIdx;
          }
          const toothDrop = srcTooth - nTooth;
          if (toothDrop > bestValleyDrop && nWet > 0.05) {
            bestValleyDrop = toothDrop;
            valleyTargetIdx = nIdx;
          }
        }

        if (diffColorWeight > 0) {
          nextRgba[p4] = mixR;
          nextRgba[p4 + 1] = mixG;
          nextRgba[p4 + 2] = mixB;
        }

        // Coffee-Ring / Backrun 모세관 외향 이송: 내부에서 서서히 빠져나가 습윤-건조 경계 띠에 응집
        const isContactEdge = minNeighborWet < wet * 0.45;
        if (isContactEdge && srcA > 0.01) {
          deltaAlpha[idx] += srcA * backrunEdgeStrength * clamp01(wet - minNeighborWet) * 0.28;
        } else if (edgeTargetIdx >= 0 && srcA > 0.01) {
          const flux = srcA * backrunEdgeStrength * clamp01(bestEdgeDrop * 3.0) * wet * 0.65;
          deltaAlpha[idx] -= flux;
          deltaAlpha[edgeTargetIdx] += flux * 1.25;
        } else if (srcA > 0.01 && backrunEdgeStrength > 0) {
          // 내부 워시는 외곽 증발을 보충하는 모세관 펌핑으로 미세하게 묽어짐
          deltaAlpha[idx] -= srcA * backrunEdgeStrength * wet * 0.045;
        }

        // 종이 골짜기 침착(Granulation)
        if (valleyTargetIdx >= 0 && srcA > 0.01) {
          const settleFlux = srcA * granulationRate * clamp01(bestValleyDrop * 1.8) * wet * 0.48;
          deltaAlpha[idx] -= settleFlux;
          deltaAlpha[valleyTargetIdx] += settleFlux;
        }

        const edgeEvapBoost = 1 + clamp01((wet - minNeighborWet) * 2.8) * 1.25;
        nextWet[idx] = clamp01(wetAccum - evaporationRate * edgeEvapBoost);
      }
    }

    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const idx = y * buffer.width + x;
        const p4 = idx * 4;
        buffer.rgbaLinearF32[p4] = nextRgba[p4];
        buffer.rgbaLinearF32[p4 + 1] = nextRgba[p4 + 1];
        buffer.rgbaLinearF32[p4 + 2] = nextRgba[p4 + 2];
        buffer.rgbaLinearF32[p4 + 3] = clamp01(nextRgba[p4 + 3] + deltaAlpha[idx]);
        buffer.wetnessF32[idx] = nextWet[idx];
      }
    }
  }

  let valleySum = 0;
  let valleyCount = 0;
  let peakSum = 0;
  let peakCount = 0;
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const idx = y * buffer.width + x;
      const a = buffer.rgbaLinearF32[idx * 4 + 3];
      if (a <= 0.01) continue;
      const tooth = buffer.paperToothF32[idx];
      if (tooth <= 0.35) {
        valleySum += a;
        valleyCount += 1;
      } else if (tooth >= 0.65) {
        peakSum += a;
        peakCount += 1;
      }
    }
  }

  return {
    iterationsExecuted: iterations,
    dirtyRect: bounds,
    activeWetPixels,
    meanValleyPigment: valleyCount > 0 ? valleySum / valleyCount : 0,
    meanPeakPigment: peakCount > 0 ? peakSum / peakCount : 0,
  };
}

/** 5대 실물 매체 통합 디스패처. */
export function applyPhysicalMediaStroke(
  buffer: PhysicalPaintCanvasBuffer,
  request: PhysicalMediaStrokeRequest,
): PhysicalMediaStrokeSummary {
  let dirtyRect = createEmptyDirtyRect();
  let pixelsTouched = 0;

  if (request.medium === "pencil" || request.medium === "charcoal") {
    const res = strokeDryMediaContactTooth(buffer, request.points, {
      variant: request.medium,
      colorLinearRgb: request.colorLinearRgb,
      radiusPx: request.radiusPx,
      opacity: request.opacity,
      seed: request.seed,
    });
    dirtyRect = res.dirtyRect;
    pixelsTouched = res.pixelsTouched;
  } else if (request.medium === "watercolor") {
    const resampled = resampleStrokePoints(request.points, Math.max(1.2, request.radiusPx * 0.38));
    for (let i = 0; i < resampled.length; i += 1) {
      const pt = resampled[i];
      const rect = stampWatercolorWetDab(buffer, {
        x: pt.x,
        y: pt.y,
        radiusPx: request.radiusPx,
        pressure: pt.pressure,
        colorLinearRgb: request.colorLinearRgb,
        opacity: request.opacity ?? 0.48,
      });
      dirtyRect = mergeDirtyRects(dirtyRect, rect);
      pixelsTouched += rect.empty ? 0 : rect.width * rect.height;
    }
    const sim = stepWatercolorSimulation(buffer, {
      iterations: request.watercolorSimSteps ?? 5,
      bounds: dirtyRect,
    });
    dirtyRect = mergeDirtyRects(dirtyRect, sim.dirtyRect);
  } else if (request.medium === "oil" || request.medium === "acrylic") {
    const res = stampOilImpastoStroke(buffer, request.points, {
      variant: request.medium,
      colorLinearRgb: request.colorLinearRgb,
      radiusPx: request.radiusPx,
      opacity: request.opacity,
      seed: request.seed,
    });
    dirtyRect = res.dirtyRect;
    pixelsTouched = res.pixelsTouched;
  } else {
    const res = stampDipPenInkStroke(buffer, request.points, {
      variant: request.medium,
      colorLinearRgb: request.colorLinearRgb,
      maxWidthPx: Math.max(2, request.radiusPx * 2),
      inkDensity: request.opacity ?? 0.98,
    });
    dirtyRect = res.dirtyRect;
    pixelsTouched = res.pixelsTouched;
  }

  const metrics = buffer.getMetricsSnapshot();
  return {
    medium: request.medium,
    dirtyRect,
    pixelsTouched,
    paintedPixelsInBuffer: metrics.paintedPixelCount,
    maxImpastoHeight: metrics.maxHeight,
  };
}
