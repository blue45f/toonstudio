/**
 * Wave 41: 대용량 에셋 대기 지연 `0ms` 달성을 위한 초경량 구면 조화/방향 주파수 요약
 * 절차적 프록시 밉맵 생성기 및 시선 중심·줌 우선순위 가상 밉맵 아틀라스 스트리머.
 *
 * - 고해상도 타일 도착 전 9계수 저차 조화 기저 요약만으로 폴백 프록시 밉맵을 즉시 인라인 합성한다.
 * - 뷰포트 프러스텀·시선 중심(Foveation)·줌 배율에 따라 상세 타일 스트리밍 우선순위를 산출하고,
 *   적응형 가상 아틀라스 슬롯 할당 및 시간축·타일 경계 크로스디졸브 가중치를 계산한다.
 */

/** 기본 가상 밉맵 타일 한 변 픽셀 크기 (`256px`). */
export const DEFAULT_VIRTUAL_TILE_SIZE_PX = 256 as const;
/** 고해상도 타일 도착 후 기본 시간축 크로스디졸브 지속 시간 (`180ms`). */
export const DEFAULT_TILE_DISSOLVE_DURATION_MS = 180 as const;
/** 동작 줄이기(`prefers-reduced-motion`) 활성 시 단축 디졸브 시간 (`40ms`). */
export const REDUCED_MOTION_DISSOLVE_DURATION_MS = 40 as const;

export interface ProceduralMipProxyDescriptor {
  readonly assetId: string;
  readonly dcLuma: number;
  readonly gradU: number;
  readonly gradV: number;
  readonly quadDiffUv: number;
  readonly quadCrossUv: number;
  readonly radialFalloff: number;
  readonly microGrainAmplitude: number;
  readonly dominantAngleRad: number;
  readonly warmCoolTint: number;
}

export interface ProceduralMipProxyPatch {
  readonly assetId: string;
  readonly mipLevel: number;
  readonly width: number;
  readonly height: number;
  readonly lumaField: Float32Array;
  readonly rgba8: Uint8ClampedArray;
}

export interface VirtualTileKey {
  readonly mipLevel: number;
  readonly tileX: number;
  readonly tileY: number;
}

export interface ViewportGazeStreamInput {
  readonly virtualWidthPx: number;
  readonly virtualHeightPx: number;
  readonly tileSizePx?: number;
  readonly viewportMinU: number;
  readonly viewportMinV: number;
  readonly viewportMaxU: number;
  readonly viewportMaxV: number;
  readonly gazeFocusU: number;
  readonly gazeFocusV: number;
  readonly zoom: number;
  readonly residentTileIds?: ReadonlySet<string>;
  readonly maxTilesPerFrame?: number;
  readonly uploadByteBudgetPerFrame?: number;
}

export interface VirtualMipStreamCandidate {
  readonly tileId: string;
  readonly mipLevel: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly centerU: number;
  readonly centerV: number;
  readonly inFrustum: boolean;
  readonly gazeDistanceUv: number;
  readonly estimatedBytes: number;
  readonly priorityScore: number;
}

export interface VirtualMipStreamPlan {
  readonly targetFovealMipLevel: number;
  readonly maxMipLevel: number;
  readonly scheduledUploads: readonly VirtualMipStreamCandidate[];
  readonly deferredCount: number;
  readonly scheduledBytes: number;
}

export interface AtlasSlotRect {
  readonly slotIndex: number;
  readonly tileId: string;
  readonly mipLevel: number;
  readonly pinnedFallback: boolean;
  readonly lastUsedTick: number;
  readonly xPx: number;
  readonly yPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface VirtualAtlasPackRequest {
  readonly atlasWidthPx: number;
  readonly atlasHeightPx: number;
  readonly slotSizePx: number;
  readonly gutterPx?: number;
  readonly existingSlots?: readonly AtlasSlotRect[];
  readonly incomingTiles: readonly {
    readonly tileId: string;
    readonly mipLevel: number;
    readonly pinnedFallback?: boolean;
  }[];
  readonly currentTick: number;
}

export interface VirtualAtlasPackResult {
  readonly slots: readonly AtlasSlotRect[];
  readonly allocatedTileIds: readonly string[];
  readonly evictedTileIds: readonly string[];
  readonly capacitySlots: number;
  readonly fallbackCoverageRatio: number;
}

export interface TileCrossDissolveInput {
  readonly loadedAtFrameMs: number;
  readonly currentFrameMs: number;
  readonly dissolveDurationMs?: number;
  readonly prefersReducedMotion?: boolean;
  readonly localTileU: number;
  readonly localTileV: number;
  readonly seamFeatherWidthUv?: number;
  readonly coarseNeighbors?: {
    readonly left?: boolean;
    readonly right?: boolean;
    readonly top?: boolean;
    readonly bottom?: boolean;
  };
}

export interface TileCrossDissolveWeights {
  readonly temporalWeight: number;
  readonly spatialSeamWeight: number;
  readonly detailWeight: number;
  readonly proxyFallbackWeight: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function smoothstep01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export function formatVirtualTileId(mipLevel: number, tileX: number, tileY: number): string {
  return `m${mipLevel}:${tileX}:${tileY}`;
}

/** 원본 휘도 버퍼에서 9계수 저차 조화 기저와 미세 입자 에너지를 추출해 초경량 프록시 기술자를 생성한다. */
export function extractProceduralMipProxyDescriptor(
  assetId: string,
  lumaBuffer: Float32Array,
  width: number,
  height: number,
  warmCoolTint = 0,
): ProceduralMipProxyDescriptor {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const count = w * h;
  if (lumaBuffer.length < count) {
    return {
      assetId,
      dcLuma: 0.5,
      gradU: 0,
      gradV: 0,
      quadDiffUv: 0,
      quadCrossUv: 0,
      radialFalloff: 0,
      microGrainAmplitude: 0.04,
      dominantAngleRad: 0,
      warmCoolTint: clamp(warmCoolTint, -1, 1),
    };
  }

  let sum = 0;
  let sumU = 0;
  let sumV = 0;
  let sumDiff = 0;
  let sumCross = 0;
  let sumRad = 0;
  let gxSq = 0;
  let gySq = 0;
  let gxy = 0;

  for (let y = 0; y < h; y += 1) {
    const nv = ((y + 0.5) / h) * 2 - 1;
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      const nu = ((x + 0.5) / w) * 2 - 1;
      const val = clamp(lumaBuffer[row + x], 0, 1);
      sum += val;
      sumU += val * nu;
      sumV += val * nv;
      sumDiff += val * (nu * nu - nv * nv);
      sumCross += val * (nu * nv);
      sumRad += val * (nu * nu + nv * nv - 2 / 3);
      if (x + 1 < w && y + 1 < h) {
        const dx = lumaBuffer[row + x + 1] - val;
        const dy = lumaBuffer[row + w + x] - val;
        gxSq += dx * dx;
        gySq += dy * dy;
        gxy += dx * dy;
      }
    }
  }

  const hfSamples = Math.max(1, (w - 1) * (h - 1));
  return {
    assetId,
    dcLuma: sum / count,
    gradU: (sumU / count) * 3,
    gradV: (sumV / count) * 3,
    quadDiffUv: (sumDiff / count) * 2.25,
    quadCrossUv: (sumCross / count) * 9,
    radialFalloff: (sumRad / count) * 2.25,
    microGrainAmplitude: clamp(Math.sqrt((gxSq + gySq) / hfSamples), 0, 0.35),
    dominantAngleRad: 0.5 * Math.atan2(2 * gxy, gxSq - gySq),
    warmCoolTint: clamp(warmCoolTint, -1, 1),
  };
}

/** 초경량 프록시 기술자만으로 대기 지연 없이(`0ms` I/O) 지정 밉 레벨의 시각 프록시 패치를 즉시 합성한다. */
export function generateInstantProceduralMipProxy(
  descriptor: ProceduralMipProxyDescriptor,
  mipLevel: number,
  baseSizePx = 128,
): ProceduralMipProxyPatch {
  const safeMip = Math.max(0, Math.min(10, Math.floor(mipLevel)));
  const dim = Math.max(1, Math.floor(baseSizePx / 2 ** Math.min(safeMip, 7)));
  const total = dim * dim;
  const lumaField = new Float32Array(total);
  const rgba8 = new Uint8ClampedArray(total * 4);
  const cosA = Math.cos(descriptor.dominantAngleRad);
  const sinA = Math.sin(descriptor.dominantAngleRad);
  const grainAtten = 1 / (1 + safeMip * 0.65);

  for (let y = 0; y < dim; y += 1) {
    const nv = ((y + 0.5) / dim) * 2 - 1;
    const row = y * dim;
    for (let x = 0; x < dim; x += 1) {
      const nu = ((x + 0.5) / dim) * 2 - 1;
      const lowOrder =
        descriptor.dcLuma +
        descriptor.gradU * nu +
        descriptor.gradV * nv +
        descriptor.quadDiffUv * (nu * nu - nv * nv) +
        descriptor.quadCrossUv * (nu * nv) +
        descriptor.radialFalloff * (nu * nu + nv * nv - 2 / 3);
      const grain =
        Math.sin((nu * cosA + nv * sinA) * Math.PI * 6) *
        Math.cos((-nu * sinA + nv * cosA) * Math.PI * 3) *
        descriptor.microGrainAmplitude *
        grainAtten;

      const luma = clamp(lowOrder + grain, 0, 1);
      const idx = row + x;
      lumaField[idx] = luma;
      rgba8[idx * 4] = Math.round(clamp(luma + descriptor.warmCoolTint * 0.06, 0, 1) * 255);
      rgba8[idx * 4 + 1] = Math.round(clamp(luma + descriptor.warmCoolTint * 0.01, 0, 1) * 255);
      rgba8[idx * 4 + 2] = Math.round(clamp(luma - descriptor.warmCoolTint * 0.06, 0, 1) * 255);
      rgba8[idx * 4 + 3] = 255;
    }
  }

  return { assetId: descriptor.assetId, mipLevel: safeMip, width: dim, height: dim, lumaField, rgba8 };
}

/** 뷰포트 프러스텀·시선 중심(`gazeFocus`)·줌 배율에 따라 프레임당 가상 밉맵 타일 업로드 계획을 산출한다. */
export function planVirtualMipmapStreamFrame(input: ViewportGazeStreamInput): VirtualMipStreamPlan {
  const tileSizePx = Math.max(16, Math.floor(input.tileSizePx ?? DEFAULT_VIRTUAL_TILE_SIZE_PX));
  const virtualW = Math.max(tileSizePx, Math.floor(input.virtualWidthPx));
  const virtualH = Math.max(tileSizePx, Math.floor(input.virtualHeightPx));
  const maxDimTiles = Math.max(Math.ceil(virtualW / tileSizePx), Math.ceil(virtualH / tileSizePx));
  const maxMipLevel = Math.max(0, Math.ceil(Math.log2(maxDimTiles)));

  const safeZoom = clamp(input.zoom, 0.0625, 16);
  const targetFovealMipLevel = clamp(Math.floor(Math.max(0, -Math.log2(safeZoom))), 0, maxMipLevel);

  const minU = clamp(Math.min(input.viewportMinU, input.viewportMaxU), 0, 1);
  const maxU = clamp(Math.max(input.viewportMinU, input.viewportMaxU), 0, 1);
  const minV = clamp(Math.min(input.viewportMinV, input.viewportMaxV), 0, 1);
  const maxV = clamp(Math.max(input.viewportMinV, input.viewportMaxV), 0, 1);
  const gazeU = clamp(input.gazeFocusU, 0, 1);
  const gazeV = clamp(input.gazeFocusV, 0, 1);
  const margin = 0.08;

  const tilesX = Math.max(1, Math.ceil(virtualW / (tileSizePx * 2 ** targetFovealMipLevel)));
  const tilesY = Math.max(1, Math.ceil(virtualH / (tileSizePx * 2 ** targetFovealMipLevel)));
  const bytesPerTile = tileSizePx * tileSizePx * 4;
  const deduped = new Map<string, VirtualMipStreamCandidate>();

  for (let ty = 0; ty < tilesY; ty += 1) {
    const tileMinV = ty / tilesY;
    const tileMaxV = (ty + 1) / tilesY;
    if (tileMaxV < minV - margin || tileMinV > maxV + margin) continue;
    for (let tx = 0; tx < tilesX; tx += 1) {
      const tileMinU = tx / tilesX;
      const tileMaxU = (tx + 1) / tilesX;
      if (tileMaxU < minU - margin || tileMinU > maxU + margin) continue;

      const centerU = (tileMinU + tileMaxU) * 0.5;
      const centerV = (tileMinV + tileMaxV) * 0.5;
      const gazeDistanceUv = Math.hypot(centerU - gazeU, centerV - gazeV);
      const desiredMip = clamp(targetFovealMipLevel + Math.floor(gazeDistanceUv * 2.5), 0, maxMipLevel);
      const shift = desiredMip - targetFovealMipLevel;
      const resolvedTx = tx >>> shift;
      const resolvedTy = ty >>> shift;
      const tileId = formatVirtualTileId(desiredMip, resolvedTx, resolvedTy);
      if (input.residentTileIds?.has(tileId)) continue;

      const inFrustum = tileMaxU >= minU && tileMinU <= maxU && tileMaxV >= minV && tileMinV <= maxV;
      const fovealWeight = 1 / (1 + gazeDistanceUv * gazeDistanceUv * 18);
      const priorityScore = (inFrustum ? 100 : 20) * fovealWeight + (maxMipLevel - desiredMip + 1) * 0.25;
      const prev = deduped.get(tileId);
      if (!prev || priorityScore > prev.priorityScore) {
        deduped.set(tileId, {
          tileId,
          mipLevel: desiredMip,
          tileX: resolvedTx,
          tileY: resolvedTy,
          centerU,
          centerV,
          inFrustum,
          gazeDistanceUv,
          estimatedBytes: bytesPerTile,
          priorityScore,
        });
      }
    }
  }

  const sorted = [...deduped.values()].sort((a, b) =>
    b.priorityScore !== a.priorityScore ? b.priorityScore - a.priorityScore : a.tileId.localeCompare(b.tileId),
  );
  const maxTiles = Math.max(1, Math.floor(input.maxTilesPerFrame ?? 8));
  const byteBudget = Math.max(bytesPerTile, Math.floor(input.uploadByteBudgetPerFrame ?? bytesPerTile * 8));

  const scheduledUploads: VirtualMipStreamCandidate[] = [];
  let scheduledBytes = 0;
  for (const item of sorted) {
    if (scheduledUploads.length >= maxTiles) break;
    if (scheduledBytes + item.estimatedBytes > byteBudget) continue;
    scheduledUploads.push(item);
    scheduledBytes += item.estimatedBytes;
  }

  return {
    targetFovealMipLevel,
    maxMipLevel,
    scheduledUploads,
    deferredCount: Math.max(0, sorted.length - scheduledUploads.length),
    scheduledBytes,
  };
}

/** 가상 밉맵 아틀라스에 타일 슬롯을 비겹침 패킹하고 고정 폴백을 보존하며 LRU 타일을 교체한다. */
export function allocateVirtualAtlasSlots(request: VirtualAtlasPackRequest): VirtualAtlasPackResult {
  const gutterPx = Math.max(0, Math.floor(request.gutterPx ?? 1));
  const slotSizePx = Math.max(8, Math.floor(request.slotSizePx));
  const stridePx = slotSizePx + gutterPx * 2;
  const cols = Math.max(1, Math.floor(request.atlasWidthPx / stridePx));
  const rows = Math.max(1, Math.floor(request.atlasHeightPx / stridePx));
  const capacitySlots = cols * rows;

  const slotsByIndex = new Map<number, AtlasSlotRect>();
  const tileToIndex = new Map<string, number>();
  for (const existing of request.existingSlots ?? []) {
    if (existing.slotIndex >= 0 && existing.slotIndex < capacitySlots) {
      slotsByIndex.set(existing.slotIndex, existing);
      tileToIndex.set(existing.tileId, existing.slotIndex);
    }
  }

  const allocatedTileIds: string[] = [];
  const evictedTileIds: string[] = [];
  const makeRect = (slotIndex: number, tileId: string, mipLevel: number, pinnedFallback: boolean): AtlasSlotRect => ({
    slotIndex,
    tileId,
    mipLevel,
    pinnedFallback,
    lastUsedTick: request.currentTick,
    xPx: (slotIndex % cols) * stridePx + gutterPx,
    yPx: Math.floor(slotIndex / cols) * stridePx + gutterPx,
    widthPx: slotSizePx,
    heightPx: slotSizePx,
  });

  for (const incoming of request.incomingTiles) {
    const pinned = incoming.pinnedFallback ?? false;
    const existingIdx = tileToIndex.get(incoming.tileId);
    if (existingIdx !== undefined) {
      const prev = slotsByIndex.get(existingIdx);
      if (prev) slotsByIndex.set(existingIdx, makeRect(existingIdx, incoming.tileId, incoming.mipLevel, prev.pinnedFallback || pinned));
      allocatedTileIds.push(incoming.tileId);
      continue;
    }

    let targetIndex: number | undefined;
    for (let idx = 0; idx < capacitySlots; idx += 1) {
      if (!slotsByIndex.has(idx)) {
        targetIndex = idx;
        break;
      }
    }
    if (targetIndex === undefined) {
      let oldestTick = Number.POSITIVE_INFINITY;
      let victimSlot: AtlasSlotRect | undefined;
      for (const slot of slotsByIndex.values()) {
        if (!slot.pinnedFallback && slot.lastUsedTick < oldestTick) {
          oldestTick = slot.lastUsedTick;
          victimSlot = slot;
        }
      }
      if (!victimSlot) continue;
      targetIndex = victimSlot.slotIndex;
      tileToIndex.delete(victimSlot.tileId);
      evictedTileIds.push(victimSlot.tileId);
    }

    slotsByIndex.set(targetIndex, makeRect(targetIndex, incoming.tileId, incoming.mipLevel, pinned));
    tileToIndex.set(incoming.tileId, targetIndex);
    allocatedTileIds.push(incoming.tileId);
  }

  const finalSlots = [...slotsByIndex.values()].sort((a, b) => a.slotIndex - b.slotIndex);
  const pinnedReq = request.incomingTiles.filter((t) => t.pinnedFallback).length;
  const pinnedRes = finalSlots.filter((s) => s.pinnedFallback).length;

  return {
    slots: finalSlots,
    allocatedTileIds,
    evictedTileIds,
    capacitySlots,
    fallbackCoverageRatio: pinnedReq === 0 ? 1 : clamp(pinnedRes / pinnedReq, 0, 1),
  };
}

/** 신규 상세 타일과 절차적 프록시 밉맵 사이의 시간축 크로스디졸브 및 경계 페더링 가중치를 계산한다. */
export function computeTileCrossDissolveWeights(input: TileCrossDissolveInput): TileCrossDissolveWeights {
  const defaultDuration = input.prefersReducedMotion ? REDUCED_MOTION_DISSOLVE_DURATION_MS : DEFAULT_TILE_DISSOLVE_DURATION_MS;
  const durationMs = Math.max(1, input.dissolveDurationMs ?? defaultDuration);
  const temporalWeight = smoothstep01(Math.max(0, input.currentFrameMs - input.loadedAtFrameMs) / durationMs);

  const u = clamp(input.localTileU, 0, 1);
  const v = clamp(input.localTileV, 0, 1);
  const feather = clamp(input.seamFeatherWidthUv ?? 0.08, 1e-4, 0.45);
  const nb = input.coarseNeighbors;

  let spatialSeamWeight = 1;
  if (nb?.left) spatialSeamWeight = Math.min(spatialSeamWeight, smoothstep01(u / feather));
  if (nb?.right) spatialSeamWeight = Math.min(spatialSeamWeight, smoothstep01((1 - u) / feather));
  if (nb?.top) spatialSeamWeight = Math.min(spatialSeamWeight, smoothstep01(v / feather));
  if (nb?.bottom) spatialSeamWeight = Math.min(spatialSeamWeight, smoothstep01((1 - v) / feather));

  const detailWeight = clamp(temporalWeight * spatialSeamWeight, 0, 1);
  return {
    temporalWeight,
    spatialSeamWeight,
    detailWeight,
    proxyFallbackWeight: 1 - detailWeight,
  };
}
