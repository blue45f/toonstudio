/**
 * 유화/아크릴 멀티-브리스틀 임파스토 커널, 측면 광원(Raking Light) 3×3 소벨 법선·스펙큘러 합성기,
 * 그리고 G펜/마루펜 비선형 슬릿 벌어짐 및 종이 모세관 미세 번짐 커널.
 */

import {
  PhysicalPaintCanvasBuffer,
  clamp01,
  clampRange,
  createBristleBundleState,
  createEmptyDirtyRect,
  linearToSrgbChannel,
  makeDirtyRect,
  mergeDirtyRects,
  mixPigmentsKubelkaMunk,
  stampMultiBristlePhysicalDab,
  type BristleBundleState,
  type LinearRgbTuple,
  type PhysicalCanvasDirtyRect,
} from "./three-channel-physical-canvas-buffer";

export interface StrokePointSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  /** 0 = 수직 필기, 1 = 심을 눕힌 광폭 음영 */
  readonly tiltMagnitude?: number;
  readonly tiltAzimuthRad?: number;
  readonly velocityPxPerSec?: number;
  readonly timestampMs?: number;
}

export interface OilImpastoStrokeOptions {
  readonly variant?: "oil" | "acrylic";
  readonly colorLinearRgb: LinearRgbTuple;
  readonly radiusPx: number;
  readonly bristleCount?: number;
  readonly thicknessDeposit?: number;
  readonly impastoPush?: number;
  readonly pickupRate?: number;
  readonly wetMixStrength?: number;
  readonly wetnessDeposit?: number;
  readonly ridgeCarveStrength?: number;
  readonly loadDepletionRate?: number;
  readonly opacity?: number;
  readonly seed?: number;
  readonly existingBristles?: BristleBundleState;
}

export interface OilImpastoStrokeResult {
  readonly dirtyRect: PhysicalCanvasDirtyRect;
  readonly pixelsTouched: number;
  readonly maxHeight: number;
  readonly meanHeight: number;
  readonly ridgeHeightStdDev: number;
  readonly bristleState: BristleBundleState;
}

export interface RakingLightCompositeOptions {
  readonly lightAzimuthDeg?: number;
  readonly lightElevationDeg?: number;
  readonly reliefStrength?: number;
  readonly paperReliefScale?: number;
  readonly ambientStrength?: number;
  readonly diffuseStrength?: number;
  readonly specularStrength?: number;
  readonly specularShininess?: number;
  readonly shadowOcclusionStrength?: number;
  readonly shadowMarchSteps?: number;
  readonly includePaperBackground?: boolean;
}

export interface DipPenConfig {
  readonly variant: "gpen" | "marupen";
  readonly colorLinearRgb?: LinearRgbTuple;
  readonly minWidthPx?: number;
  readonly maxWidthPx?: number;
  readonly flexExponent?: number;
  readonly nibAngleRad?: number;
  readonly nibAnisotropy?: number;
  readonly entryTaperRatio?: number;
  readonly exitTaperRatio?: number;
  readonly capillaryBleedStrength?: number;
  readonly inkDensity?: number;
}

export interface DipPenNibProfileSample {
  readonly widthPx: number;
  readonly slitSpreadRatio: number;
  readonly taperMultiplier: number;
  readonly effectiveOpacity: number;
}

export interface DipPenStrokeResult {
  readonly dirtyRect: PhysicalCanvasDirtyRect;
  readonly pixelsTouched: number;
  readonly minObservedWidthPx: number;
  readonly maxObservedWidthPx: number;
  readonly capillaryBleedPixels: number;
}

export function resampleStrokePoints(
  points: readonly StrokePointSample[],
  spacingPx: number,
): StrokePointSample[] {
  if (points.length <= 1) return points.length === 1 ? [points[0]] : [];
  const step = Math.max(0.5, spacingPx);
  const out: StrokePointSample[] = [points[0]];
  let carry = 0;

  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-5) continue;

    let dist = step - carry;
    while (dist <= segLen) {
      const t = dist / segLen;
      out.push({
        x: prev.x + dx * t,
        y: prev.y + dy * t,
        pressure: prev.pressure + (curr.pressure - prev.pressure) * t,
        tiltMagnitude: (prev.tiltMagnitude ?? 0) + ((curr.tiltMagnitude ?? 0) - (prev.tiltMagnitude ?? 0)) * t,
        tiltAzimuthRad: (prev.tiltAzimuthRad ?? 0) + ((curr.tiltAzimuthRad ?? 0) - (prev.tiltAzimuthRad ?? 0)) * t,
        velocityPxPerSec:
          (prev.velocityPxPerSec ?? 220) + ((curr.velocityPxPerSec ?? 220) - (prev.velocityPxPerSec ?? 220)) * t,
      });
      dist += step;
    }
    carry = segLen - (dist - step);
  }

  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > 0.25) out.push(last);
  return out;
}

/** 유화·아크릴 멀티-브리스틀 임파스토 스트로크 커널. */
export function stampOilImpastoStroke(
  buffer: PhysicalPaintCanvasBuffer,
  samples: readonly StrokePointSample[],
  options: OilImpastoStrokeOptions,
): OilImpastoStrokeResult {
  const isAcrylic = options.variant === "acrylic";
  const bristleState =
    options.existingBristles ??
    createBristleBundleState({
      bristleCount: options.bristleCount ?? (isAcrylic ? 42 : 52),
      seed: options.seed ?? 6230,
      baseColorLinearRgb: options.colorLinearRgb,
      initialLoad: 0.94,
      initialWetness: isAcrylic ? 0.55 : 0.84,
      stiffnessMean: isAcrylic ? 0.72 : 0.62,
      ridgeAmplitude: isAcrylic ? 0.42 : 0.58,
    });

  const resampled = resampleStrokePoints(samples, Math.max(1, options.radiusPx * 0.25));
  let dirtyRect = createEmptyDirtyRect();
  let pixelsTouched = 0;

  for (let i = 0; i < resampled.length; i += 1) {
    const curr = resampled[i];
    const prev = i > 0 ? resampled[i - 1] : curr;
    const next = i + 1 < resampled.length ? resampled[i + 1] : curr;
    const dirX = next.x - prev.x;
    const dirY = next.y - prev.y;
    const dab = stampMultiBristlePhysicalDab(buffer, bristleState, {
      x: curr.x,
      y: curr.y,
      dirX: Math.hypot(dirX, dirY) > 1e-4 ? dirX : 1,
      dirY: Math.hypot(dirX, dirY) > 1e-4 ? dirY : 0,
      radiusPx: options.radiusPx,
      pressure: curr.pressure,
      opacity: options.opacity ?? (isAcrylic ? 0.92 : 0.88),
      thicknessDeposit: options.thicknessDeposit ?? (isAcrylic ? 0.36 : 0.56),
      impastoPush: options.impastoPush ?? (isAcrylic ? 0.18 : 0.34),
      wetnessDeposit: options.wetnessDeposit ?? (isAcrylic ? 0.48 : 0.82),
      pickupRate: options.pickupRate ?? (isAcrylic ? 0.28 : 0.52),
      wetMixStrength: options.wetMixStrength ?? (isAcrylic ? 0.55 : 0.85),
      ridgeCarveStrength: options.ridgeCarveStrength ?? (isAcrylic ? 0.44 : 0.52),
      loadDepletionRate: options.loadDepletionRate ?? (isAcrylic ? 0.022 : 0.014),
    });
    dirtyRect = mergeDirtyRects(dirtyRect, dab.dirtyRect);
    pixelsTouched += dab.pixelsTouched;
  }

  let maxHeight = 0;
  let heightSum = 0;
  let heightCount = 0;
  if (!dirtyRect.empty) {
    for (let y = dirtyRect.minY; y <= dirtyRect.maxY; y += 1) {
      for (let x = dirtyRect.minX; x <= dirtyRect.maxX; x += 1) {
        const h = buffer.heightF32[y * buffer.width + x];
        if (h > 0.001) {
          heightSum += h;
          heightCount += 1;
          if (h > maxHeight) maxHeight = h;
        }
      }
    }
  }
  const meanHeight = heightCount > 0 ? heightSum / heightCount : 0;
  let variance = 0;
  if (!dirtyRect.empty && heightCount > 0) {
    for (let y = dirtyRect.minY; y <= dirtyRect.maxY; y += 1) {
      for (let x = dirtyRect.minX; x <= dirtyRect.maxX; x += 1) {
        const h = buffer.heightF32[y * buffer.width + x];
        if (h > 0.001) variance += (h - meanHeight) * (h - meanHeight);
      }
    }
  }
  return {
    dirtyRect,
    pixelsTouched,
    maxHeight,
    meanHeight,
    ridgeHeightStdDev: heightCount > 0 ? Math.sqrt(variance / heightCount) : 0,
    bristleState,
  };
}

/** 3×3 소벨 연산자로 물리 높이장의 단위 표면 법선 벡터 `(nx, ny, nz)`를 산출한다. */
export function computeHeightFieldSobelNormal(
  buffer: PhysicalPaintCanvasBuffer,
  x: number,
  y: number,
  options: { readonly reliefStrength?: number; readonly paperReliefScale?: number } = {},
): readonly [number, number, number] {
  const reliefStrength = Math.max(0.05, options.reliefStrength ?? 3.2);
  const paperReliefScale = Math.max(0, options.paperReliefScale ?? 0.14);
  const sampleH = (sx: number, sy: number): number => {
    const cx = clampRange(sx, 0, buffer.width - 1);
    const cy = clampRange(sy, 0, buffer.height - 1);
    const idx = cy * buffer.width + cx;
    return buffer.heightF32[idx] + buffer.paperToothF32[idx] * paperReliefScale;
  };
  const tl = sampleH(x - 1, y - 1);
  const tc = sampleH(x, y - 1);
  const tr = sampleH(x + 1, y - 1);
  const ml = sampleH(x - 1, y);
  const mr = sampleH(x + 1, y);
  const bl = sampleH(x - 1, y + 1);
  const bc = sampleH(x, y + 1);
  const br = sampleH(x + 1, y + 1);
  const dhdx = (tr + 2 * mr + br - (tl + 2 * ml + bl)) * 0.25;
  const dhdy = (bl + 2 * bc + br - (tl + 2 * tc + tr)) * 0.25;
  const nx = -dhdx * reliefStrength;
  const ny = -dhdy * reliefStrength;
  const invLen = 1 / Math.hypot(nx, ny, 1);
  return [nx * invLen, ny * invLen, invLen];
}

/** 측면 광원(Raking Light) 소벨 법선·자가 그림자·스펙큘러 임파스토 합성기. */
export function compositeRakingLightImpastoRgba(
  buffer: PhysicalPaintCanvasBuffer,
  options: RakingLightCompositeOptions = {},
): Float32Array {
  const azimuthRad = ((options.lightAzimuthDeg ?? 315) * Math.PI) / 180;
  const elevationRad = (clampRange(options.lightElevationDeg ?? 24, 5, 85) * Math.PI) / 180;
  const reliefStrength = Math.max(0.1, options.reliefStrength ?? 3.4);
  const paperReliefScale = Math.max(0, options.paperReliefScale ?? 0.12);
  const ambientStrength = clampRange(options.ambientStrength ?? 0.42, 0.05, 0.95);
  const diffuseStrength = clampRange(options.diffuseStrength ?? 0.78, 0.05, 1.5);
  const specularStrength = clampRange(options.specularStrength ?? 0.48, 0, 2);
  const specularShininess = clampRange(options.specularShininess ?? 36, 4, 160);
  const shadowOcclusionStrength = clampRange(options.shadowOcclusionStrength ?? 0.45, 0, 0.95);
  const shadowMarchSteps = Math.max(1, Math.min(8, Math.floor(options.shadowMarchSteps ?? 4)));
  const includeBg = options.includePaperBackground ?? true;

  const cosElev = Math.cos(elevationRad);
  const lx = Math.cos(azimuthRad) * cosElev;
  const ly = Math.sin(azimuthRad) * cosElev;
  const lz = Math.sin(elevationRad);
  const invHLen = 1 / Math.hypot(lx, ly, lz + 1);
  const hx = lx * invHLen;
  const hy = ly * invHLen;
  const hz = (lz + 1) * invHLen;

  const out = new Float32Array(buffer.pixelCount * 4);
  const [bgR, bgG, bgB] = buffer.backgroundLinearRgb;
  const flatDiffuse = Math.max(0.05, lz);

  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const idx = y * buffer.width + x;
      const p4 = idx * 4;
      const a = clamp01(buffer.rgbaLinearF32[p4 + 3]);
      const h = buffer.heightF32[idx];
      const wet = buffer.wetnessF32[idx];
      const tooth = buffer.paperToothF32[idx];

      let baseR = buffer.rgbaLinearF32[p4];
      let baseG = buffer.rgbaLinearF32[p4 + 1];
      let baseB = buffer.rgbaLinearF32[p4 + 2];
      let outA = a;
      if (includeBg) {
        const paperTint = 0.96 + 0.04 * tooth;
        const invA = 1 - a;
        baseR = baseR * a + bgR * paperTint * invA;
        baseG = baseG * a + bgG * paperTint * invA;
        baseB = baseB * a + bgB * paperTint * invA;
        outA = 1;
      }

      const [nx, ny, nz] = computeHeightFieldSobelNormal(buffer, x, y, {
        reliefStrength,
        paperReliefScale,
      });
      const nDotL = Math.max(0, nx * lx + ny * ly + nz * lz);
      const nDotH = Math.max(0, nx * hx + ny * hy + nz * hz);

      const centerSurface = h + tooth * paperReliefScale;
      let maxShadowExcess = 0;
      for (let step = 1; step <= shadowMarchSteps; step += 1) {
        const sx = clampRange(Math.round(x + lx * step * 1.45), 0, buffer.width - 1);
        const sy = clampRange(Math.round(y + ly * step * 1.45), 0, buffer.height - 1);
        const sIdx = sy * buffer.width + sx;
        const upstreamSurface = buffer.heightF32[sIdx] + buffer.paperToothF32[sIdx] * paperReliefScale;
        const excess = upstreamSurface - (centerSurface + step * lz * 0.45);
        if (excess > maxShadowExcess) maxShadowExcess = excess;
      }

      const shadowFactor = 1 - clamp01(maxShadowExcess * 1.8) * shadowOcclusionStrength;
      const lightingGain =
        (ambientStrength + diffuseStrength * (nDotL / flatDiffuse) * shadowFactor) /
        (ambientStrength + diffuseStrength);
      const paintGlossMask = clamp01(a * (0.28 + 0.72 * clamp01(h * 1.6 + wet * 0.55)));
      const specular =
        Math.pow(nDotH, specularShininess * (0.7 + 0.65 * wet)) *
        specularStrength *
        paintGlossMask *
        shadowFactor;

      out[p4] = clamp01(baseR * lightingGain + specular);
      out[p4 + 1] = clamp01(baseG * lightingGain + specular);
      out[p4 + 2] = clamp01(baseB * lightingGain + specular);
      out[p4 + 3] = outA;
    }
  }
  return out;
}

export function compositeRakingLightImpastoSrgbUint8(
  buffer: PhysicalPaintCanvasBuffer,
  options: RakingLightCompositeOptions = {},
): Uint8ClampedArray {
  const linear = compositeRakingLightImpastoRgba(buffer, options);
  const out = new Uint8ClampedArray(linear.length);
  for (let i = 0; i < buffer.pixelCount; i += 1) {
    const c4 = i * 4;
    out[c4] = Math.round(linearToSrgbChannel(linear[c4]) * 255);
    out[c4 + 1] = Math.round(linearToSrgbChannel(linear[c4 + 1]) * 255);
    out[c4 + 2] = Math.round(linearToSrgbChannel(linear[c4 + 2]) * 255);
    out[c4 + 3] = Math.round(clamp01(linear[c4 + 3]) * 255);
  }
  return out;
}

/** G펜/마루펜 강철 닙의 비선형 슬릿 벌어짐 및 진입/이탈 테이퍼 프로파일 계산기. */
export function evaluateDipPenNibProfile(
  sample: StrokePointSample,
  progress01: number,
  config: DipPenConfig,
  strokeTangentRad = 0,
): DipPenNibProfileSample {
  const isMaru = config.variant === "marupen";
  const minWidthPx = Math.max(0.3, config.minWidthPx ?? (isMaru ? 0.55 : 0.95));
  const maxWidthPx = Math.max(minWidthPx + 0.4, config.maxWidthPx ?? (isMaru ? 3.2 : 6.4));
  const flexExponent = clampRange(config.flexExponent ?? (isMaru ? 2.15 : 1.78), 1.1, 3.5);
  const nibAngleRad = config.nibAngleRad ?? Math.PI * 0.25;
  const nibAnisotropy = clampRange(config.nibAnisotropy ?? (isMaru ? 0.18 : 0.34), 0, 0.75);
  const entryTaperRatio = clampRange(config.entryTaperRatio ?? 0.16, 0.01, 0.45);
  const exitTaperRatio = clampRange(config.exitTaperRatio ?? 0.22, 0.01, 0.48);

  const p = clamp01(sample.pressure);
  const progress = clamp01(progress01);
  const slitThreshold = isMaru ? 0.16 : 0.12;
  const slitSpreadRatio = Math.pow(clamp01((p - slitThreshold) / (1 - slitThreshold)), flexExponent);

  const entryTaper = progress < entryTaperRatio ? Math.pow(progress / entryTaperRatio, 0.65) : 1;
  const exitTaper = progress > 1 - exitTaperRatio ? Math.pow((1 - progress) / exitTaperRatio, 0.78) : 1;
  const velocityScale = sample.velocityPxPerSec
    ? clampRange(1.06 - (sample.velocityPxPerSec / 1800) * 0.22, 0.72, 1.05)
    : 1;
  const taperMultiplier = clamp01(Math.min(entryTaper, exitTaper) * velocityScale);

  const angleFactor = 1 - nibAnisotropy * Math.pow(Math.cos(strokeTangentRad - nibAngleRad), 2);
  const baseWidth = minWidthPx + (maxWidthPx - minWidthPx) * slitSpreadRatio * angleFactor;
  return {
    widthPx: Math.max(minWidthPx * 0.65, baseWidth * (0.28 + 0.72 * taperMultiplier)),
    slitSpreadRatio,
    taperMultiplier,
    effectiveOpacity: clamp01((config.inkDensity ?? 0.98) * (0.72 + 0.28 * taperMultiplier)),
  };
}

/** G펜/마루펜 선화 잉킹 커널: 고밀도 잉크 코어 + 종이 섬유 골짜기 모세관 미세 번짐. */
export function stampDipPenInkStroke(
  buffer: PhysicalPaintCanvasBuffer,
  samples: readonly StrokePointSample[],
  config: DipPenConfig,
): DipPenStrokeResult {
  const inkColor: LinearRgbTuple = config.colorLinearRgb ?? [0.012, 0.013, 0.016];
  const capillaryBleedStrength = clamp01(config.capillaryBleedStrength ?? 0.38);
  const resampled = resampleStrokePoints(samples, 0.55);

  let dirtyRect = createEmptyDirtyRect();
  let pixelsTouched = 0;
  let capillaryBleedPixels = 0;
  let minObservedWidthPx = Number.POSITIVE_INFINITY;
  let maxObservedWidthPx = 0;

  for (let i = 0; i < resampled.length; i += 1) {
    const curr = resampled[i];
    const prev = i > 0 ? resampled[i - 1] : curr;
    const next = i + 1 < resampled.length ? resampled[i + 1] : curr;
    const tangentRad = Math.atan2(next.y - prev.y, next.x - prev.x);
    const progress = resampled.length > 1 ? i / (resampled.length - 1) : 0.5;
    const nib = evaluateDipPenNibProfile(curr, progress, config, tangentRad);
    if (nib.widthPx < minObservedWidthPx) minObservedWidthPx = nib.widthPx;
    if (nib.widthPx > maxObservedWidthPx) maxObservedWidthPx = nib.widthPx;

    const coreRadius = Math.max(0.35, nib.widthPx * 0.5);
    const bleedRadius = coreRadius + (capillaryBleedStrength > 0 ? 1.65 : 0);
    const xStart = Math.max(0, Math.floor(curr.x - bleedRadius - 1));
    const xEnd = Math.min(buffer.width - 1, Math.ceil(curr.x + bleedRadius + 1));
    const yStart = Math.max(0, Math.floor(curr.y - bleedRadius - 1));
    const yEnd = Math.min(buffer.height - 1, Math.ceil(curr.y + bleedRadius + 1));

    let localMinX = buffer.width;
    let localMinY = buffer.height;
    let localMaxX = -1;
    let localMaxY = -1;

    for (let py = yStart; py <= yEnd; py += 1) {
      const dy = py - curr.y;
      for (let px = xStart; px <= xEnd; px += 1) {
        const dist = Math.hypot(px - curr.x, dy);
        if (dist > bleedRadius) continue;
        const idx = py * buffer.width + px;
        const p4 = idx * 4;
        const tooth = buffer.paperToothF32[idx];
        let alpha = 0;
        if (dist <= coreRadius + 0.55) {
          alpha = clamp01((coreRadius + 0.55 - dist) / 0.85) * nib.effectiveOpacity;
        } else if (capillaryBleedStrength > 0) {
          const outerT = clamp01(1 - (dist - coreRadius) / Math.max(0.25, bleedRadius - coreRadius));
          const valleyWick = clamp01((0.58 - tooth) / 0.58);
          alpha = outerT * valleyWick * capillaryBleedStrength * 0.55 * nib.effectiveOpacity;
          if (alpha > 0.015) capillaryBleedPixels += 1;
        }
        if (alpha <= 0.002) continue;

        const dstA = buffer.rgbaLinearF32[p4 + 3];
        let outR = inkColor[0];
        let outG = inkColor[1];
        let outB = inkColor[2];
        if (dstA > 0.002) {
          const mixed = mixPigmentsKubelkaMunk(
            [buffer.rgbaLinearF32[p4], buffer.rgbaLinearF32[p4 + 1], buffer.rgbaLinearF32[p4 + 2]],
            inkColor,
            clamp01(alpha / Math.max(0.01, alpha + dstA * 0.5)),
          );
          outR = mixed[0];
          outG = mixed[1];
          outB = mixed[2];
        }
        buffer.rgbaLinearF32[p4] = outR;
        buffer.rgbaLinearF32[p4 + 1] = outG;
        buffer.rgbaLinearF32[p4 + 2] = outB;
        buffer.rgbaLinearF32[p4 + 3] = clamp01(dstA + alpha * (1 - dstA));
        buffer.wetnessF32[idx] = clamp01(Math.max(buffer.wetnessF32[idx], alpha * 0.22));
        buffer.heightF32[idx] = Math.max(buffer.heightF32[idx], alpha * 0.035);

        if (px < localMinX) localMinX = px;
        if (py < localMinY) localMinY = py;
        if (px > localMaxX) localMaxX = px;
        if (py > localMaxY) localMaxY = py;
        pixelsTouched += 1;
      }
    }
    dirtyRect = mergeDirtyRects(dirtyRect, makeDirtyRect(localMinX, localMinY, localMaxX, localMaxY));
  }

  return {
    dirtyRect,
    pixelsTouched,
    minObservedWidthPx: Number.isFinite(minObservedWidthPx) ? minObservedWidthPx : 0,
    maxObservedWidthPx,
    capillaryBleedPixels,
  };
}
