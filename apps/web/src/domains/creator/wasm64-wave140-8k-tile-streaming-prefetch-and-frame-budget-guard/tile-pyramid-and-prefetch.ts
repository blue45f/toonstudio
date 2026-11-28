/**
 * Wave 140 — 8K 멀티페이지 타일 피라미드 MIP 선택기(히스테리시스) 및 뷰포트 운동학 프리페치 예측기.
 *
 * - 줌 배율 히스테리시스 방어로 경계 흔들림(MIP thrashing)을 차단한다.
 * - 카메라 속도(`vx`, `vy`, `zoomVelocity`) 기반 `150ms~300ms` 선행 절두체(Look-ahead Frustum)를 산출해
 *   `visible-critical`, `coarse-mip-fallback`, `predictive-prefetch` 우선순위 큐를 결정론적으로 정렬한다.
 */

import {
  clampFinite,
  clampInt,
  roundDeterministic,
  sha256TileStreamingHex,
} from "./tile-streaming-sha256";
import {
  DEFAULT_BYTES_PER_PIXEL,
  DEFAULT_TILE_SIZE_PX,
  MAX_TILE_MIP_LEVEL,
  MIN_TILE_MIP_LEVEL,
  clampTileMipLevel,
  computeMipGridDimensions,
  computePyramidTotals,
  computeTileByteSize,
  createMultiPage8kManuscriptSpec,
  createWebtoon8kVerticalSpec,
  encodeTileKey,
  getCoarseFallbackChain,
  getParentTileKey,
  getTileWorldBounds,
  parseTileKey,
  type CanvasPageGeometry,
  type MipGridDimensions,
  type MultiPageCanvasSpec,
  type TileKey,
  type TileKeyId,
  type TileMipLevel,
  type TilePriorityClass,
  type WorldRect2D,
} from "./tile-pyramid-address";

export {
  DEFAULT_BYTES_PER_PIXEL,
  DEFAULT_TILE_SIZE_PX,
  MAX_TILE_MIP_LEVEL,
  MIN_TILE_MIP_LEVEL,
  clampTileMipLevel,
  computeMipGridDimensions,
  computePyramidTotals,
  computeTileByteSize,
  createMultiPage8kManuscriptSpec,
  createWebtoon8kVerticalSpec,
  encodeTileKey,
  getCoarseFallbackChain,
  getParentTileKey,
  getTileWorldBounds,
  parseTileKey,
  type CanvasPageGeometry,
  type MipGridDimensions,
  type MultiPageCanvasSpec,
  type TileKey,
  type TileKeyId,
  type TileMipLevel,
  type TilePriorityClass,
  type WorldRect2D,
};

export interface MipSelectionOptions {
  readonly devicePixelRatio?: number;
  readonly previousMipLevel?: TileMipLevel;
  readonly hysteresisBand?: number;
  readonly mipBias?: number;
  readonly maxMipLevel?: TileMipLevel;
}

export interface MipSelectionResult {
  readonly targetMipLevel: TileMipLevel;
  readonly baseMipLevel: TileMipLevel;
  readonly idealContinuousMip: number;
  readonly effectiveScale: number;
  readonly hysteresisHeld: boolean;
  readonly appliedMipBias: number;
  readonly reason: string;
}

export interface ViewportCameraState {
  readonly scrollX: number;
  readonly scrollY: number;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly zoom: number;
  readonly vxPxPerSec: number;
  readonly vyPxPerSec: number;
  readonly zoomVelocityPerSec: number;
  readonly devicePixelRatio?: number;
  readonly previousMipLevel?: TileMipLevel;
}

export interface TilePrefetchPlanOptions {
  readonly frameIndex?: number;
  readonly lookAheadMinMs?: number;
  readonly lookAheadMaxMs?: number;
  readonly hysteresisBand?: number;
  readonly mipBias?: number;
  readonly maxPrefetchTiles?: number;
  readonly includeImmediateParentFallback?: boolean;
  readonly enablePredictivePrefetch?: boolean;
  readonly enableCoarseFallback?: boolean;
  readonly sweepSampleSteps?: number;
}

export interface PlannedTileRequest {
  readonly key: TileKey;
  readonly keyId: TileKeyId;
  readonly priorityClass: TilePriorityClass;
  readonly priorityScore: number;
  readonly estimatedTimeToVisibleMs: number;
  readonly motionAlignment: number;
  readonly byteSize: number;
  readonly worldBounds: WorldRect2D;
}

export interface ViewportTilePrefetchPlan {
  readonly frameIndex: number;
  readonly targetMipLevel: TileMipLevel;
  readonly predictedMipLevel: TileMipLevel;
  readonly coarseFallbackMipLevel: TileMipLevel;
  readonly mipSelection: MipSelectionResult;
  readonly lookAheadMs: number;
  readonly speedPxPerSec: number;
  readonly currentBoundsWorld: WorldRect2D;
  readonly predictedBoundsWorld: WorldRect2D;
  readonly entries: readonly PlannedTileRequest[];
  readonly visibleKeys: readonly TileKeyId[];
  readonly prefetchKeys: readonly TileKeyId[];
  readonly fallbackKeys: readonly TileKeyId[];
  readonly planSha256Hex: string;
}

export const DEFAULT_LOOK_AHEAD_MIN_MS = 150;
export const DEFAULT_LOOK_AHEAD_MAX_MS = 300;
export const DEFAULT_MIP_HYSTERESIS_BAND = 0.15;

const PRIORITY_CLASS_RANK: Readonly<Record<TilePriorityClass, number>> = {
  "visible-critical": 3,
  "coarse-mip-fallback": 2,
  "predictive-prefetch": 1,
};

/**
 * 줌 배율과 DPR, 이전 MIP 레벨을 기반으로 최적 MIP 레벨을 선택한다.
 *
 * - `effectiveScale = zoom * devicePixelRatio`에서 연속 MIP `ideal = max(0, -log2(effectiveScale))`를 계산한다.
 * - `previousMipLevel`이 주어지면 `±hysteresisBand`(기본 `0.15`) 구간에서는 기존 MIP를 유지해 경계 진동을 막는다.
 * - VRAM 압박 시 전달되는 `mipBias`를 최종 레벨에 가산한다.
 */
export function selectTargetMipLevel(
  zoom: number,
  options?: MipSelectionOptions,
): MipSelectionResult {
  const maxMip = clampTileMipLevel(options?.maxMipLevel ?? MAX_TILE_MIP_LEVEL);
  const safeZoom = clampFinite(zoom, 0.02, 32, 1.0);
  const dpr = clampFinite(options?.devicePixelRatio ?? 1.0, 0.5, 4.0, 1.0);
  const effectiveScale = safeZoom * dpr;
  const idealContinuousMip = Math.max(0, -Math.log2(effectiveScale));
  const hysteresisBand = clampFinite(
    options?.hysteresisBand ?? DEFAULT_MIP_HYSTERESIS_BAND,
    0,
    0.45,
    DEFAULT_MIP_HYSTERESIS_BAND,
  );
  const appliedMipBias = clampInt(options?.mipBias ?? 0, 0, maxMip, 0);

  let baseMipNumber = Math.floor(idealContinuousMip + 0.0001);
  let hysteresisHeld = false;
  let reason = "줌 배율 기준 최적 MIP 선택";

  if (options?.previousMipLevel !== undefined) {
    const prevBase = clampInt(options.previousMipLevel - appliedMipBias, 0, maxMip, 0);
    const upperThreshold = prevBase + 1.0 + hysteresisBand;
    const lowerThreshold = prevBase - hysteresisBand;
    if (idealContinuousMip >= lowerThreshold && idealContinuousMip < upperThreshold) {
      baseMipNumber = prevBase;
      if (Math.floor(idealContinuousMip + 0.0001) !== prevBase) {
        hysteresisHeld = true;
        reason = "줌 경계 히스테리시스 구간으로 기존 MIP 유지";
      }
    }
  }

  const baseMipLevel = clampTileMipLevel(baseMipNumber, maxMip);
  const targetMipLevel = clampTileMipLevel(baseMipLevel + appliedMipBias, maxMip);
  if (appliedMipBias > 0) {
    reason = `VRAM 압박 완화용 LOD 바이어스(+${String(appliedMipBias)}) 적용`;
  }

  return {
    targetMipLevel,
    baseMipLevel,
    idealContinuousMip: roundDeterministic(idealContinuousMip, 4),
    effectiveScale: roundDeterministic(effectiveScale, 4),
    hysteresisHeld,
    appliedMipBias,
    reason,
  };
}

/** 현재 뷰포트 카메라 상태를 월드 좌표 사각형으로 변환한다. */
export function computeViewportWorldRect(viewport: ViewportCameraState): WorldRect2D {
  const safeZoom = clampFinite(viewport.zoom, 0.02, 32, 1.0);
  const safeW = clampFinite(viewport.viewportWidthPx, 16, 16384, 1280);
  const safeH = clampFinite(viewport.viewportHeightPx, 16, 16384, 720);
  const minX = clampFinite(viewport.scrollX, -1_000_000, 10_000_000, 0);
  const minY = clampFinite(viewport.scrollY, -1_000_000, 10_000_000, 0);
  return { minX, minY, maxX: minX + safeW / safeZoom, maxY: minY + safeH / safeZoom };
}

function rectsIntersect(a: WorldRect2D, b: WorldRect2D): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

function collectTilesIntersectingRect(
  spec: MultiPageCanvasSpec,
  rect: WorldRect2D,
  mipLevel: TileMipLevel,
): TileKey[] {
  const results: TileKey[] = [];
  const mip = clampTileMipLevel(mipLevel, spec.maxMipLevel);
  const tileSpanWorld = spec.tileSizePx * (1 << mip);

  for (let p = 0; p < spec.pages.length; p += 1) {
    const page = spec.pages[p];
    const pageRect: WorldRect2D = {
      minX: page.worldOffsetX,
      minY: page.worldOffsetY,
      maxX: page.worldOffsetX + page.widthPx,
      maxY: page.worldOffsetY + page.heightPx,
    };
    if (!rectsIntersect(rect, pageRect)) continue;
    const grid = computeMipGridDimensions(page, mip, spec.tileSizePx);
    const localMinX = Math.max(0, rect.minX - page.worldOffsetX);
    const localMinY = Math.max(0, rect.minY - page.worldOffsetY);
    const localMaxX = Math.min(page.widthPx, rect.maxX - page.worldOffsetX);
    const localMaxY = Math.min(page.heightPx, rect.maxY - page.worldOffsetY);
    if (localMaxX <= localMinX || localMaxY <= localMinY) continue;
    const txStart = clampInt(Math.floor(localMinX / tileSpanWorld), 0, grid.tilesX - 1, 0);
    const tyStart = clampInt(Math.floor(localMinY / tileSpanWorld), 0, grid.tilesY - 1, 0);
    const txEnd = clampInt(Math.floor((localMaxX - 0.0001) / tileSpanWorld), 0, grid.tilesX - 1, 0);
    const tyEnd = clampInt(Math.floor((localMaxY - 0.0001) / tileSpanWorld), 0, grid.tilesY - 1, 0);

    for (let ty = tyStart; ty <= tyEnd; ty += 1) {
      for (let tx = txStart; tx <= txEnd; tx += 1) {
        results.push({ pageIndex: page.pageIndex, mipLevel: mip, tx, ty });
      }
    }
  }
  return results;
}

function mergeRequestCandidate(
  bucket: Map<TileKeyId, PlannedTileRequest>,
  candidate: PlannedTileRequest,
): void {
  const existing = bucket.get(candidate.keyId);
  if (!existing) {
    bucket.set(candidate.keyId, candidate);
    return;
  }
  const existingRank = PRIORITY_CLASS_RANK[existing.priorityClass];
  const candidateRank = PRIORITY_CLASS_RANK[candidate.priorityClass];
  if (
    candidateRank > existingRank ||
    (candidateRank === existingRank && candidate.priorityScore > existing.priorityScore)
  ) {
    bucket.set(candidate.keyId, candidate);
  }
}

function comparePlannedRequests(a: PlannedTileRequest, b: PlannedTileRequest): number {
  const rankDiff = PRIORITY_CLASS_RANK[b.priorityClass] - PRIORITY_CLASS_RANK[a.priorityClass];
  if (rankDiff !== 0) return rankDiff;
  if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
  if (a.key.pageIndex !== b.key.pageIndex) return a.key.pageIndex - b.key.pageIndex;
  if (a.key.mipLevel !== b.key.mipLevel) return a.key.mipLevel - b.key.mipLevel;
  if (a.key.ty !== b.key.ty) return a.key.ty - b.key.ty;
  return a.key.tx - b.key.tx;
}

/**
 * 현재 뷰포트 위치·줌·속도(`vx`, `vy`, `zoomVelocity`)를 바탕으로
 * `visible-critical`, `coarse-mip-fallback`, `predictive-prefetch` 타일 우선순위 큐를 생성한다.
 */
export function planViewportTilePrefetch(
  spec: MultiPageCanvasSpec,
  viewport: ViewportCameraState,
  options?: TilePrefetchPlanOptions,
): ViewportTilePrefetchPlan {
  const frameIndex = clampInt(options?.frameIndex ?? 0, 0, 10_000_000, 0);
  const lookAheadMinMs = clampFinite(options?.lookAheadMinMs ?? DEFAULT_LOOK_AHEAD_MIN_MS, 50, 500, DEFAULT_LOOK_AHEAD_MIN_MS);
  const lookAheadMaxMs = Math.max(
    lookAheadMinMs,
    clampFinite(options?.lookAheadMaxMs ?? DEFAULT_LOOK_AHEAD_MAX_MS, lookAheadMinMs, 800, DEFAULT_LOOK_AHEAD_MAX_MS),
  );
  const maxPrefetchTiles = clampInt(options?.maxPrefetchTiles ?? 192, 0, 2048, 192);
  const enablePredictive = options?.enablePredictivePrefetch !== false;
  const enableCoarseFallback = options?.enableCoarseFallback !== false;
  const includeImmediateParent = options?.includeImmediateParentFallback !== false;
  const sweepSteps = clampInt(options?.sweepSampleSteps ?? 4, 1, 12, 4);

  const mipSelection = selectTargetMipLevel(viewport.zoom, {
    devicePixelRatio: viewport.devicePixelRatio,
    previousMipLevel: viewport.previousMipLevel,
    hysteresisBand: options?.hysteresisBand,
    mipBias: options?.mipBias,
    maxMipLevel: spec.maxMipLevel,
  });
  const targetMip = mipSelection.targetMipLevel;
  const coarseFallbackMip = spec.maxMipLevel;

  const vx = clampFinite(viewport.vxPxPerSec, -50_000, 50_000, 0);
  const vy = clampFinite(viewport.vyPxPerSec, -50_000, 50_000, 0);
  const zoomVel = clampFinite(viewport.zoomVelocityPerSec, -12, 12, 0);
  const speedPxPerSec = Math.hypot(vx, vy);

  const horizonBlend = Math.max(
    clampFinite(speedPxPerSec / 4500, 0, 1, 0),
    clampFinite(Math.abs(zoomVel) / 2.5, 0, 1, 0),
  );
  const lookAheadMs = roundDeterministic(lookAheadMinMs + (lookAheadMaxMs - lookAheadMinMs) * horizonBlend, 2);
  const lookAheadSec = lookAheadMs / 1000;

  const currentBounds = computeViewportWorldRect(viewport);
  const viewCenterX = (currentBounds.minX + currentBounds.maxX) * 0.5;
  const viewCenterY = (currentBounds.minY + currentBounds.maxY) * 0.5;
  const viewHalfDiag = Math.max(
    1,
    Math.hypot(currentBounds.maxX - currentBounds.minX, currentBounds.maxY - currentBounds.minY) * 0.5,
  );

  const safeZoom = clampFinite(viewport.zoom, 0.02, 32, 1.0);
  const safeViewW = clampFinite(viewport.viewportWidthPx, 16, 16384, 1280);
  const safeViewH = clampFinite(viewport.viewportHeightPx, 16, 16384, 720);
  const predictedZoom = clampFinite(safeZoom * Math.exp(zoomVel * lookAheadSec), 0.04, 16, safeZoom);
  const predictedMip = enablePredictive
    ? selectTargetMipLevel(predictedZoom, {
        devicePixelRatio: viewport.devicePixelRatio,
        hysteresisBand: 0,
        mipBias: options?.mipBias,
        maxMipLevel: spec.maxMipLevel,
      }).targetMipLevel
    : targetMip;

  const predictedCenterX = viewCenterX + vx * lookAheadSec;
  const predictedCenterY = viewCenterY + vy * lookAheadSec;
  const predHalfW = (safeViewW / predictedZoom) * 0.5;
  const predHalfH = (safeViewH / predictedZoom) * 0.5;
  const predictedBounds: WorldRect2D = {
    minX: predictedCenterX - predHalfW,
    minY: predictedCenterY - predHalfH,
    maxX: predictedCenterX + predHalfW,
    maxY: predictedCenterY + predHalfH,
  };

  const tileByteSize = computeTileByteSize(spec.tileSizePx, spec.bytesPerPixel);
  const requests = new Map<TileKeyId, PlannedTileRequest>();
  const velUnitX = speedPxPerSec > 1e-3 ? vx / speedPxPerSec : 0;
  const velUnitY = speedPxPerSec > 1e-3 ? vy / speedPxPerSec : 0;

  // 1) 현재 가시 영역 타일(visible-critical) 및 저해상도 폴백 조상
  const visibleTileKeys = collectTilesIntersectingRect(spec, currentBounds, targetMip);
  for (let i = 0; i < visibleTileKeys.length; i += 1) {
    const key = visibleTileKeys[i];
    const keyId = encodeTileKey(key);
    const bounds = getTileWorldBounds(spec, key);
    const normDist =
      Math.hypot((bounds.minX + bounds.maxX) * 0.5 - viewCenterX, (bounds.minY + bounds.maxY) * 0.5 - viewCenterY) /
      viewHalfDiag;
    mergeRequestCandidate(requests, {
      key,
      keyId,
      priorityClass: "visible-critical",
      priorityScore: roundDeterministic(1000 + Math.max(0, 120 - normDist * 100), 3),
      estimatedTimeToVisibleMs: 0,
      motionAlignment: 1,
      byteSize: tileByteSize,
      worldBounds: bounds,
    });

    if (enableCoarseFallback && targetMip < spec.maxMipLevel) {
      const chain = getCoarseFallbackChain(key, spec.maxMipLevel);
      for (let c = 0; c < chain.length; c += 1) {
        const ancestor = chain[c];
        const isTopAnchor = ancestor.mipLevel === coarseFallbackMip;
        if (!isTopAnchor && !(includeImmediateParent && ancestor.mipLevel === targetMip + 1)) {
          continue;
        }
        mergeRequestCandidate(requests, {
          key: ancestor,
          keyId: encodeTileKey(ancestor),
          priorityClass: "coarse-mip-fallback",
          priorityScore: isTopAnchor ? 860 : 810,
          estimatedTimeToVisibleMs: 0,
          motionAlignment: 1,
          byteSize: tileByteSize,
          worldBounds: getTileWorldBounds(spec, ancestor),
        });
      }
    }
  }

  // 2) 속도·줌 방향 선행 프리페치(predictive-prefetch) 및 선행 구간 폴백
  if (enablePredictive && maxPrefetchTiles > 0) {
    const prefetchCandidates: PlannedTileRequest[] = [];
    const seenPrefetch = new Set<TileKeyId>();
    const marginPx = speedPxPerSec > 10 ? 0 : spec.tileSizePx * (1 << targetMip) * 0.35;

    for (let step = 1; step <= sweepSteps; step += 1) {
      const ratio = step / sweepSteps;
      const stepTimeSec = lookAheadSec * ratio;
      const stepZoom = clampFinite(safeZoom * Math.exp(zoomVel * stepTimeSec), 0.04, 16, safeZoom);
      const stepMip =
        step === sweepSteps
          ? predictedMip
          : selectTargetMipLevel(stepZoom, {
              devicePixelRatio: viewport.devicePixelRatio,
              hysteresisBand: 0,
              mipBias: options?.mipBias,
              maxMipLevel: spec.maxMipLevel,
            }).targetMipLevel;
      const stepCx = viewCenterX + vx * stepTimeSec;
      const stepCy = viewCenterY + vy * stepTimeSec;
      const stepHalfW = (safeViewW / stepZoom) * 0.5;
      const stepHalfH = (safeViewH / stepZoom) * 0.5;
      const stepRect: WorldRect2D = {
        minX: stepCx - stepHalfW - marginPx,
        minY: stepCy - stepHalfH - marginPx,
        maxX: stepCx + stepHalfW + marginPx,
        maxY: stepCy + stepHalfH + marginPx,
      };

      const stepTiles = collectTilesIntersectingRect(spec, stepRect, stepMip);
      for (let i = 0; i < stepTiles.length; i += 1) {
        const key = stepTiles[i];
        const keyId = encodeTileKey(key);
        if (requests.has(keyId) || seenPrefetch.has(keyId)) continue;
        const bounds = getTileWorldBounds(spec, key);
        const dx = (bounds.minX + bounds.maxX) * 0.5 - viewCenterX;
        const dy = (bounds.minY + bounds.maxY) * 0.5 - viewCenterY;
        const dist = Math.hypot(dx, dy);
        let alignment = 0.5;
        if (speedPxPerSec > 10 && dist > 1e-3) {
          alignment = (dx / dist) * velUnitX + (dy / dist) * velUnitY;
          if (alignment < -0.15 && stepMip === targetMip) continue;
        }
        seenPrefetch.add(keyId);
        const etaMs = roundDeterministic(stepTimeSec * 1000, 2);
        const score = roundDeterministic(
          400 + Math.max(0, 1 - ratio) * 180 + (alignment + 1) * 90 + (stepMip !== targetMip ? 55 : 0),
          3,
        );
        prefetchCandidates.push({
          key,
          keyId,
          priorityClass: "predictive-prefetch",
          priorityScore: score,
          estimatedTimeToVisibleMs: etaMs,
          motionAlignment: roundDeterministic(alignment, 4),
          byteSize: tileByteSize,
          worldBounds: bounds,
        });

        if (enableCoarseFallback && stepMip < coarseFallbackMip) {
          const chain = getCoarseFallbackChain(key, spec.maxMipLevel);
          const topAnchor = chain[chain.length - 1];
          if (topAnchor) {
            mergeRequestCandidate(requests, {
              key: topAnchor,
              keyId: encodeTileKey(topAnchor),
              priorityClass: "coarse-mip-fallback",
              priorityScore: roundDeterministic(740 + (1 - ratio) * 40, 3),
              estimatedTimeToVisibleMs: etaMs,
              motionAlignment: roundDeterministic(alignment, 4),
              byteSize: tileByteSize,
              worldBounds: getTileWorldBounds(spec, topAnchor),
            });
          }
        }
      }
    }

    prefetchCandidates.sort(comparePlannedRequests);
    const cappedCount = Math.min(maxPrefetchTiles, prefetchCandidates.length);
    for (let i = 0; i < cappedCount; i += 1) {
      mergeRequestCandidate(requests, prefetchCandidates[i]);
    }
  }

  const entries = Array.from(requests.values()).sort(comparePlannedRequests);
  const visibleKeys: TileKeyId[] = [];
  const prefetchKeys: TileKeyId[] = [];
  const fallbackKeys: TileKeyId[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.priorityClass === "visible-critical") visibleKeys.push(entry.keyId);
    else if (entry.priorityClass === "predictive-prefetch") prefetchKeys.push(entry.keyId);
    else fallbackKeys.push(entry.keyId);
  }

  const planSha256Hex = sha256TileStreamingHex(
    JSON.stringify({
      frameIndex,
      targetMip,
      predictedMip,
      lookAheadMs,
      visibleKeys,
      fallbackKeys,
      prefetchKeys,
    }),
  );

  return {
    frameIndex,
    targetMipLevel: targetMip,
    predictedMipLevel: predictedMip,
    coarseFallbackMipLevel: coarseFallbackMip,
    mipSelection,
    lookAheadMs,
    speedPxPerSec: roundDeterministic(speedPxPerSec, 2),
    currentBoundsWorld: {
      minX: roundDeterministic(currentBounds.minX, 2),
      minY: roundDeterministic(currentBounds.minY, 2),
      maxX: roundDeterministic(currentBounds.maxX, 2),
      maxY: roundDeterministic(currentBounds.maxY, 2),
    },
    predictedBoundsWorld: {
      minX: roundDeterministic(predictedBounds.minX, 2),
      minY: roundDeterministic(predictedBounds.minY, 2),
      maxX: roundDeterministic(predictedBounds.maxX, 2),
      maxY: roundDeterministic(predictedBounds.maxY, 2),
    },
    entries,
    visibleKeys,
    prefetchKeys,
    fallbackKeys,
    planSha256Hex,
  };
}
