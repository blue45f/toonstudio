/**
 * Wave-63: 펜촉 중심 가변 레이트 셰이딩(Cursor-Foveated VRS) 타일 스케줄러 및
 * 2.5D Radiance Cascades 실시간 간접광(반사광·컬러 블리딩·벽면 차폐) 솔버.
 */

export { RADIANCE_CASCADES_25D_WGSL } from "./webgpu-wgsl-shaders";

/** VRS 타일 셰이딩 레이트 등급. */
export type VrsShadingRateId = "1x1" | "2x2" | "4x4";

/** 하드웨어 VRS 어태치먼트 코드 (`0 = 1x1`, `1 = 2x2`, `2 = 4x4`). */
export type VrsRateCode = 0 | 1 | 2;

/** 보조 초점 앵커(예: 활성 선택 영역·시선 추적 포인트). */
export interface VrsFocalAnchor {
  readonly x: number;
  readonly y: number;
  readonly fullResRadiusPx?: number;
}

/** 펜촉 중심 가변 레이트 셰이딩 타일 맵 생성 입력. */
export interface CursorFoveatedVrsInput {
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly cursorX: number;
  readonly cursorY: number;
  readonly tileSizePx?: number;
  readonly innerFullResRadiusPx?: number;
  readonly midResRadiusPx?: number;
  readonly stylusVelocityX?: number;
  readonly stylusVelocityY?: number;
  readonly predictionLeadMs?: number;
  readonly extraAnchors?: readonly VrsFocalAnchor[];
}

/** 개별 VRS 타일 기술자. */
export interface FoveatedVrsTileDescriptor {
  readonly tileX: number;
  readonly tileY: number;
  readonly originX: number;
  readonly originY: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly rate: VrsShadingRateId;
  readonly rateCode: VrsRateCode;
  readonly sampleDivisor: 1 | 4 | 16;
  readonly distanceToFocusPx: number;
}

/** 생성된 펜촉 중심 Foveated VRS 타일 맵 및 연산량 절감 계측. */
export interface CursorFoveatedVrsTileMap {
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly tileSizePx: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly totalTiles: number;
  readonly predictedCursorX: number;
  readonly predictedCursorY: number;
  readonly tileRateGrid: Uint8Array;
  readonly tiles: readonly FoveatedVrsTileDescriptor[];
  readonly fullRateTileCount: number;
  readonly halfRateTileCount: number;
  readonly quarterRateTileCount: number;
  readonly baselineFullRateSamples: number;
  readonly effectiveShadedSamples: number;
  readonly shadingWorkReductionRatio: number;
  readonly estimatedSpeedupFactor: number;
}

/** 2.5D Radiance Cascades 실시간 간접광 솔버 입력. */
export interface RadianceCascades25dInput {
  readonly width: number;
  readonly height: number;
  readonly emissiveRgba: Uint8ClampedArray;
  readonly albedoRgba: Uint8ClampedArray;
  readonly occluderMask: Uint8Array;
  readonly heightMap?: Float32Array;
  readonly emitterElevation?: number;
  readonly cascadeCount?: number;
  readonly baseAngularRays?: number;
  readonly emissionGain?: number;
  readonly distanceFalloff?: number;
  readonly bounceReflectance?: number;
  readonly ambientFloor?: number;
}

/** 캐스케이드 계층별 계측 요약. */
export interface RadianceCascadeLevelSummary {
  readonly cascadeIndex: number;
  readonly probeStride: number;
  readonly probeCountX: number;
  readonly probeCountY: number;
  readonly angularRayCount: number;
  readonly intervalStartPx: number;
  readonly intervalEndPx: number;
  readonly raysCast: number;
}

/** 2.5D Radiance Cascades 간접광 계산 결과. */
export interface RadianceCascades25dResult {
  readonly width: number;
  readonly height: number;
  readonly litRgba: Uint8ClampedArray;
  readonly irradianceRgb: Float32Array;
  readonly bounceContributionRgb: Float32Array;
  readonly cascadeLevels: readonly RadianceCascadeLevelSummary[];
  readonly totalRaysCast: number;
  readonly occludedRayFraction: number;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function clampRange(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 1e-6) return Math.hypot(px - ax, py - ay);
  const t = clamp01(((px - ax) * abx + (py - ay) * aby) / abLenSq);
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

/**
 * 펜촉 위치 및 예측 이동 궤적을 중심으로 1x1(포비얼) / 2x2(중간) / 4x4(외곽)
 * 가변 레이트 셰이딩(VRS) 타일 맵을 생성한다.
 */
export function buildCursorFoveatedVrsTileMap(
  input: CursorFoveatedVrsInput,
): CursorFoveatedVrsTileMap {
  if (input.canvasWidthPx <= 0 || input.canvasHeightPx <= 0) {
    throw new RangeError("canvasWidthPx/canvasHeightPx는 양수여야 합니다.");
  }

  const tileSizePx = Math.max(4, Math.floor(input.tileSizePx ?? 16));
  const innerRadius = Math.max(tileSizePx, input.innerFullResRadiusPx ?? 144);
  const midRadius = Math.max(innerRadius + tileSizePx, input.midResRadiusPx ?? 340);
  const leadSeconds = Math.max(0, (input.predictionLeadMs ?? 16) / 1000);

  const cursorX = clampRange(input.cursorX, 0, input.canvasWidthPx);
  const cursorY = clampRange(input.cursorY, 0, input.canvasHeightPx);
  const predictedCursorX = clampRange(
    cursorX + (input.stylusVelocityX ?? 0) * leadSeconds,
    0,
    input.canvasWidthPx,
  );
  const predictedCursorY = clampRange(
    cursorY + (input.stylusVelocityY ?? 0) * leadSeconds,
    0,
    input.canvasHeightPx,
  );

  const tilesX = Math.ceil(input.canvasWidthPx / tileSizePx);
  const tilesY = Math.ceil(input.canvasHeightPx / tileSizePx);
  const totalTiles = tilesX * tilesY;
  const tileRateGrid = new Uint8Array(totalTiles);
  const tiles: FoveatedVrsTileDescriptor[] = [];
  const extraAnchors = input.extraAnchors ?? [];

  let fullRateTileCount = 0;
  let halfRateTileCount = 0;
  let quarterRateTileCount = 0;
  let effectiveShadedSamples = 0;

  for (let ty = 0; ty < tilesY; ty += 1) {
    const originY = ty * tileSizePx;
    const heightPx = Math.min(tileSizePx, input.canvasHeightPx - originY);
    const centerY = originY + heightPx * 0.5;

    for (let tx = 0; tx < tilesX; tx += 1) {
      const originX = tx * tileSizePx;
      const widthPx = Math.min(tileSizePx, input.canvasWidthPx - originX);
      const centerX = originX + widthPx * 0.5;

      let bestDist = pointToSegmentDistance(
        centerX,
        centerY,
        cursorX,
        cursorY,
        predictedCursorX,
        predictedCursorY,
      );
      let forceFullFromAnchor = false;
      for (const anchor of extraAnchors) {
        const d = Math.hypot(centerX - anchor.x, centerY - anchor.y);
        if (d < bestDist) bestDist = d;
        if (d <= (anchor.fullResRadiusPx ?? innerRadius * 0.6)) forceFullFromAnchor = true;
      }

      let rate: VrsShadingRateId;
      let rateCode: VrsRateCode;
      let sampleDivisor: 1 | 4 | 16;

      if (forceFullFromAnchor || bestDist <= innerRadius) {
        rate = "1x1";
        rateCode = 0;
        sampleDivisor = 1;
        fullRateTileCount += 1;
      } else if (bestDist <= midRadius) {
        rate = "2x2";
        rateCode = 1;
        sampleDivisor = 4;
        halfRateTileCount += 1;
      } else {
        rate = "4x4";
        rateCode = 2;
        sampleDivisor = 16;
        quarterRateTileCount += 1;
      }

      tileRateGrid[ty * tilesX + tx] = rateCode;
      effectiveShadedSamples += (widthPx * heightPx) / sampleDivisor;
      tiles.push({
        tileX: tx,
        tileY: ty,
        originX,
        originY,
        widthPx,
        heightPx,
        rate,
        rateCode,
        sampleDivisor,
        distanceToFocusPx: Number(bestDist.toFixed(2)),
      });
    }
  }

  const baselineFullRateSamples = input.canvasWidthPx * input.canvasHeightPx;
  return {
    canvasWidthPx: input.canvasWidthPx,
    canvasHeightPx: input.canvasHeightPx,
    tileSizePx,
    tilesX,
    tilesY,
    totalTiles,
    predictedCursorX: Number(predictedCursorX.toFixed(2)),
    predictedCursorY: Number(predictedCursorY.toFixed(2)),
    tileRateGrid,
    tiles,
    fullRateTileCount,
    halfRateTileCount,
    quarterRateTileCount,
    baselineFullRateSamples,
    effectiveShadedSamples: Number(effectiveShadedSamples.toFixed(2)),
    shadingWorkReductionRatio: Number(
      clamp01(1 - effectiveShadedSamples / Math.max(1, baselineFullRateSamples)).toFixed(4),
    ),
    estimatedSpeedupFactor: Number(
      (baselineFullRateSamples / Math.max(1, effectiveShadedSamples)).toFixed(3),
    ),
  };
}

interface CascadeProbeGrid {
  readonly stride: number;
  readonly countX: number;
  readonly countY: number;
  readonly angularRays: number;
  readonly directionalBins: Float32Array;
}

function sampleUpperCascadeDirectionalPair(
  upper: CascadeProbeGrid,
  worldX: number,
  worldY: number,
  lowerRayIdx: number,
  outRgb: [number, number, number],
): void {
  const gx = clampRange(
    (worldX - upper.stride * 0.5) / upper.stride,
    0,
    Math.max(0, upper.countX - 1),
  );
  const gy = clampRange(
    (worldY - upper.stride * 0.5) / upper.stride,
    0,
    Math.max(0, upper.countY - 1),
  );
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(upper.countX - 1, x0 + 1);
  const y1 = Math.min(upper.countY - 1, y0 + 1);
  const fx = gx - x0;
  const fy = gy - y0;

  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  const rA = lowerRayIdx * 2;
  const rB = rA + 1;
  const rays = upper.angularRays;
  const bins = upper.directionalBins;
  const p00 = (y0 * upper.countX + x0) * rays;
  const p10 = (y0 * upper.countX + x1) * rays;
  const p01 = (y1 * upper.countX + x0) * rays;
  const p11 = (y1 * upper.countX + x1) * rays;

  for (let c = 0; c < 3; c += 1) {
    const v00 = 0.5 * (bins[(p00 + rA) * 4 + c] + bins[(p00 + rB) * 4 + c]);
    const v10 = 0.5 * (bins[(p10 + rA) * 4 + c] + bins[(p10 + rB) * 4 + c]);
    const v01 = 0.5 * (bins[(p01 + rA) * 4 + c] + bins[(p01 + rB) * 4 + c]);
    const v11 = 0.5 * (bins[(p11 + rA) * 4 + c] + bins[(p11 + rB) * 4 + c]);
    outRgb[c] = v00 * w00 + v10 * w10 + v01 * w01 + v11 * w11;
  }
}

function runRadianceCascadePass(
  width: number,
  height: number,
  sourceRgb: Float32Array,
  occluderMask: Uint8Array,
  heightMap: Float32Array | undefined,
  emitterElevation: number,
  cascadeCount: number,
  baseAngularRays: number,
  distanceFalloff: number,
  captureSummaries: boolean,
): {
  readonly irradianceRgb: Float32Array;
  readonly cascadeLevels: RadianceCascadeLevelSummary[];
  readonly totalRaysCast: number;
  readonly occludedRays: number;
} {
  const maxDiag = Math.hypot(width, height);
  const grids: CascadeProbeGrid[] = [];
  const cascadeLevels: RadianceCascadeLevelSummary[] = [];
  let totalRaysCast = 0;
  let occludedRays = 0;
  const baseInterval = Math.max(3, maxDiag / Math.max(1, Math.pow(2.4, cascadeCount) - 1));

  for (let c = 0; c < cascadeCount; c += 1) {
    const stride = 1 << c;
    const countX = Math.max(1, Math.ceil(width / stride));
    const countY = Math.max(1, Math.ceil(height / stride));
    const angularRays = baseAngularRays * (1 << c);
    const intervalStart = c === 0 ? 0.5 : baseInterval * (Math.pow(2.4, c) - 1) * 0.92;
    const intervalEnd =
      c === cascadeCount - 1 ? maxDiag : baseInterval * (Math.pow(2.4, c + 1) - 1);

    const directionalBins = new Float32Array(countX * countY * angularRays * 4);
    const stepLen = Math.max(0.5, Math.min(1.0, (intervalEnd - intervalStart) / 16));
    const twoPiOverRays = (Math.PI * 2) / angularRays;
    let levelRays = 0;

    for (let py = 0; py < countY; py += 1) {
      const originY = Math.min(height - 1, py * stride + stride * 0.5);
      for (let px = 0; px < countX; px += 1) {
        const originX = Math.min(width - 1, px * stride + stride * 0.5);
        const probeBase = (py * countX + px) * angularRays;

        for (let r = 0; r < angularRays; r += 1) {
          const angle = (r + 0.5) * twoPiOverRays;
          const dx = Math.cos(angle);
          const dy = Math.sin(angle);
          let trans = 1.0;
          let rayR = 0;
          let rayG = 0;
          let rayB = 0;
          let hitOpaque = false;

          for (let dist = intervalStart; dist < intervalEnd && trans > 0.015; dist += stepLen) {
            const sx = Math.floor(originX + dx * dist);
            const sy = Math.floor(originY + dy * dist);
            if (sx < 0 || sy < 0 || sx >= width || sy >= height) break;

            const cell = sy * width + sx;
            const occRaw = occluderMask[cell] / 255;
            const cellHeight = heightMap ? heightMap[cell] : 1.0;
            const effectiveOcc =
              occRaw > 0 ? (cellHeight >= emitterElevation ? occRaw : occRaw * 0.12) : 0;

            const srcBase = cell * 3;
            const emR = sourceRgb[srcBase];
            const emG = sourceRgb[srcBase + 1];
            const emB = sourceRgb[srcBase + 2];
            if (emR > 0 || emG > 0 || emB > 0) {
              const weight = (1 / (1 + distanceFalloff * dist * dist)) * trans * stepLen;
              rayR += emR * weight;
              rayG += emG * weight;
              rayB += emB * weight;
            }
            if (effectiveOcc > 0) {
              trans *= 1 - effectiveOcc;
              if (trans <= 0.05) hitOpaque = true;
            }
          }

          const binOffset = (probeBase + r) * 4;
          directionalBins[binOffset] = rayR;
          directionalBins[binOffset + 1] = rayG;
          directionalBins[binOffset + 2] = rayB;
          directionalBins[binOffset + 3] = trans;
          levelRays += 1;
          if (hitOpaque) occludedRays += 1;
        }
      }
    }

    totalRaysCast += levelRays;
    grids.push({ stride, countX, countY, angularRays, directionalBins });
    if (captureSummaries) {
      cascadeLevels.push({
        cascadeIndex: c,
        probeStride: stride,
        probeCountX: countX,
        probeCountY: countY,
        angularRayCount: angularRays,
        intervalStartPx: Number(intervalStart.toFixed(2)),
        intervalEndPx: Number(intervalEnd.toFixed(2)),
        raysCast: levelRays,
      });
    }
  }

  const upperRgb: [number, number, number] = [0, 0, 0];
  for (let c = cascadeCount - 2; c >= 0; c -= 1) {
    const lower = grids[c];
    const upper = grids[c + 1];
    for (let py = 0; py < lower.countY; py += 1) {
      const worldY = py * lower.stride + lower.stride * 0.5;
      for (let px = 0; px < lower.countX; px += 1) {
        const worldX = px * lower.stride + lower.stride * 0.5;
        const probeBase = (py * lower.countX + px) * lower.angularRays;
        for (let r = 0; r < lower.angularRays; r += 1) {
          const binOffset = (probeBase + r) * 4;
          const trans = lower.directionalBins[binOffset + 3];
          if (trans <= 0.015) continue;
          sampleUpperCascadeDirectionalPair(upper, worldX, worldY, r, upperRgb);
          lower.directionalBins[binOffset] += upperRgb[0] * trans;
          lower.directionalBins[binOffset + 1] += upperRgb[1] * trans;
          lower.directionalBins[binOffset + 2] += upperRgb[2] * trans;
        }
      }
    }
  }

  const baseGrid = grids[0];
  const irradianceRgb = new Float32Array(width * height * 3);
  const invBaseRays = 1 / baseGrid.angularRays;
  for (let y = 0; y < height; y += 1) {
    const py = Math.min(baseGrid.countY - 1, y);
    for (let x = 0; x < width; x += 1) {
      const px = Math.min(baseGrid.countX - 1, x);
      const probeBase = (py * baseGrid.countX + px) * baseGrid.angularRays;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      for (let r = 0; r < baseGrid.angularRays; r += 1) {
        const binOffset = (probeBase + r) * 4;
        sumR += baseGrid.directionalBins[binOffset];
        sumG += baseGrid.directionalBins[binOffset + 1];
        sumB += baseGrid.directionalBins[binOffset + 2];
      }
      const dst = (y * width + x) * 3;
      irradianceRgb[dst] = sumR * invBaseRays;
      irradianceRgb[dst + 1] = sumG * invBaseRays;
      irradianceRgb[dst + 2] = sumB * invBaseRays;
    }
  }

  return { irradianceRgb, cascadeLevels, totalRaysCast, occludedRays };
}

/**
 * 2.5D Radiance Cascades 실시간 간접광 솔버 (1차 직접광·벽면 차폐 + 2차 확산 반사광·컬러 블리딩).
 */
export function solve25dRadianceCascadesLighting(
  input: RadianceCascades25dInput,
): RadianceCascades25dResult {
  const { width, height } = input;
  if (width <= 0 || height <= 0) throw new RangeError("width/height는 양수여야 합니다.");
  const pixelCount = width * height;
  if (
    input.emissiveRgba.length !== pixelCount * 4 ||
    input.albedoRgba.length !== pixelCount * 4 ||
    input.occluderMask.length !== pixelCount
  ) {
    throw new RangeError("emissiveRgba/albedoRgba/occluderMask 크기가 width*height와 불일치합니다.");
  }
  if (input.heightMap && input.heightMap.length !== pixelCount) {
    throw new RangeError("heightMap 길이가 width*height와 불일치합니다.");
  }

  const cascadeCount = clampRange(Math.floor(input.cascadeCount ?? 3), 1, 5);
  const baseAngularRays = clampRange(Math.floor(input.baseAngularRays ?? 8), 4, 32);
  const emissionGain = Math.max(0, input.emissionGain ?? 3.2);
  const distanceFalloff = Math.max(0.0005, input.distanceFalloff ?? 0.025);
  const bounceReflectance = clampRange(input.bounceReflectance ?? 0.68, 0, 0.95);
  const ambientFloor = clamp01(input.ambientFloor ?? 0.08);
  const emitterElevation = clamp01(input.emitterElevation ?? 0.55);

  const primarySourceRgb = new Float32Array(pixelCount * 3);
  for (let p = 0; p < pixelCount; p += 1) {
    const rgbaIdx = p * 4;
    const strength = (input.emissiveRgba[rgbaIdx + 3] / 255) * emissionGain;
    primarySourceRgb[p * 3] = (input.emissiveRgba[rgbaIdx] / 255) * strength;
    primarySourceRgb[p * 3 + 1] = (input.emissiveRgba[rgbaIdx + 1] / 255) * strength;
    primarySourceRgb[p * 3 + 2] = (input.emissiveRgba[rgbaIdx + 2] / 255) * strength;
  }

  const directPass = runRadianceCascadePass(
    width,
    height,
    primarySourceRgb,
    input.occluderMask,
    input.heightMap,
    emitterElevation,
    cascadeCount,
    baseAngularRays,
    distanceFalloff,
    true,
  );

  const bounceSourceRgb = new Float32Array(pixelCount * 3);
  for (let p = 0; p < pixelCount; p += 1) {
    const rgbaIdx = p * 4;
    const albedoA = input.albedoRgba[rgbaIdx + 3] / 255;
    bounceSourceRgb[p * 3] =
      directPass.irradianceRgb[p * 3] * (input.albedoRgba[rgbaIdx] / 255) * albedoA * bounceReflectance;
    bounceSourceRgb[p * 3 + 1] =
      directPass.irradianceRgb[p * 3 + 1] * (input.albedoRgba[rgbaIdx + 1] / 255) * albedoA * bounceReflectance;
    bounceSourceRgb[p * 3 + 2] =
      directPass.irradianceRgb[p * 3 + 2] * (input.albedoRgba[rgbaIdx + 2] / 255) * albedoA * bounceReflectance;
  }

  const bouncePass = runRadianceCascadePass(
    width,
    height,
    bounceSourceRgb,
    input.occluderMask,
    input.heightMap,
    emitterElevation,
    Math.max(1, cascadeCount - 1),
    baseAngularRays,
    distanceFalloff * 1.4,
    false,
  );

  const irradianceRgb = new Float32Array(pixelCount * 3);
  const bounceContributionRgb = bouncePass.irradianceRgb;
  const litRgba = new Uint8ClampedArray(pixelCount * 4);
  for (let p = 0; p < pixelCount; p += 1) {
    const rgbIdx = p * 3;
    const rgbaIdx = p * 4;
    const totalR = directPass.irradianceRgb[rgbIdx] + bounceContributionRgb[rgbIdx];
    const totalG = directPass.irradianceRgb[rgbIdx + 1] + bounceContributionRgb[rgbIdx + 1];
    const totalB = directPass.irradianceRgb[rgbIdx + 2] + bounceContributionRgb[rgbIdx + 2];
    irradianceRgb[rgbIdx] = totalR;
    irradianceRgb[rgbIdx + 1] = totalG;
    irradianceRgb[rgbIdx + 2] = totalB;

    const emStrength = input.emissiveRgba[rgbaIdx + 3] / 255;
    const rawR =
      (input.albedoRgba[rgbaIdx] / 255) * (ambientFloor + totalR) +
      (input.emissiveRgba[rgbaIdx] / 255) * emStrength;
    const rawG =
      (input.albedoRgba[rgbaIdx + 1] / 255) * (ambientFloor + totalG) +
      (input.emissiveRgba[rgbaIdx + 1] / 255) * emStrength;
    const rawB =
      (input.albedoRgba[rgbaIdx + 2] / 255) * (ambientFloor + totalB) +
      (input.emissiveRgba[rgbaIdx + 2] / 255) * emStrength;

    litRgba[rgbaIdx] = Math.round(clamp01(rawR / (1 + rawR * 0.25)) * 255);
    litRgba[rgbaIdx + 1] = Math.round(clamp01(rawG / (1 + rawG * 0.25)) * 255);
    litRgba[rgbaIdx + 2] = Math.round(clamp01(rawB / (1 + rawB * 0.25)) * 255);
    litRgba[rgbaIdx + 3] = Math.max(input.albedoRgba[rgbaIdx + 3], input.emissiveRgba[rgbaIdx + 3]);
  }

  const totalRaysCast = directPass.totalRaysCast + bouncePass.totalRaysCast;
  return {
    width,
    height,
    litRgba,
    irradianceRgb,
    bounceContributionRgb,
    cascadeLevels: directPass.cascadeLevels,
    totalRaysCast,
    occludedRayFraction:
      totalRaysCast > 0
        ? Number(((directPass.occludedRays + bouncePass.occludedRays) / totalRaysCast).toFixed(4))
        : 0,
  };
}
