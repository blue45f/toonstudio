/**
 * Wave 140 — VRAM 예산 엄수 핀(Pin)-보호 SLRU 타일 캐시 & 물리 아틀라스 슬롯 할당기 코어.
 *
 * 3대 절대 불변량:
 * 1. VRAM 하드 캡: 어떤 프레임·극한 플링에서도 `usedVramBytes <= vramBudgetBytes`를 1바이트도 초과하지 않는다.
 * 2. 가시·편집 타일 축출 금지: 현재 가시 타일(`pinnedVisible`)과 미저장 Dirty 편집 타일(`pinnedDirty`)은
 *    절대 축출하지 않으며, 과밀 압박 시 자동으로 `mipBias +1` Graceful LOD 다운그레이드를 발동해 OOM 0건을 유지한다.
 * 3. 프레임당 업로드 시간 버짓: `60fps <= 4.5ms`, `120fps <= 2.2ms` 내에서 업로드하고 미도착 고해상도 타일은
 *    상위 저해상도 MIP(`coarse-mip-fallback`)로 즉시 대체해 블랭크 체커보드 스톨을 억제한다.
 */

import {
  clampFinite,
  clampInt,
  roundDeterministic,
  sha256TileStreamingHex,
} from "./tile-streaming-sha256";
import {
  computeTileByteSize,
  encodeTileKey,
  getCoarseFallbackChain,
  planViewportTilePrefetch,
  type MultiPageCanvasSpec,
  type TileKey,
  type TileKeyId,
  type TileMipLevel,
  type TilePriorityClass,
  type ViewportCameraState,
  type ViewportTilePrefetchPlan,
} from "./tile-pyramid-and-prefetch";
import {
  DEFAULT_UPLOAD_BUDGET_120FPS_MS,
  DEFAULT_UPLOAD_BUDGET_60FPS_MS,
  DEFAULT_UPLOAD_COST_PER_TILE_MS,
  FRAME_BUDGET_120FPS_MS,
  FRAME_BUDGET_60FPS_MS,
  type AtlasSlotLocation,
  type CacheSegment,
  type DirtyPinResult,
  type FrameRateTarget,
  type FrameStepOptions,
  type FrameStreamingTelemetry,
  type IndirectionTableEntrySnapshot,
  type ResidentTileEntry,
  type TileVisualSnapshotCell,
  type TileVisualState,
  type VramCacheInvariantAudit,
  type VramTileCacheConfig,
} from "./vram-tile-cache-types";
import {
  buildIndirectionTableFromCache,
  captureTileVisualSnapshotFromCache,
  decodeAtlasSlotLocation,
  selectSlruEvictionVictim,
  toReadonlyResidentEntry as toReadonlyEntry,
  type MutableResidentTileEntry,
} from "./vram-tile-cache-helpers";

export {
  DEFAULT_UPLOAD_BUDGET_120FPS_MS,
  DEFAULT_UPLOAD_BUDGET_60FPS_MS,
  DEFAULT_UPLOAD_COST_PER_TILE_MS,
  FRAME_BUDGET_120FPS_MS,
  FRAME_BUDGET_60FPS_MS,
  type AtlasSlotLocation,
  type CacheSegment,
  type DirtyPinResult,
  type FrameRateTarget,
  type FrameStepOptions,
  type FrameStreamingTelemetry,
  type IndirectionTableEntrySnapshot,
  type ResidentTileEntry,
  type TileVisualSnapshotCell,
  type TileVisualState,
  type VramCacheInvariantAudit,
  type VramTileCacheConfig,
};

interface UploadCandidate {
  readonly key: TileKey;
  readonly keyId: TileKeyId;
  readonly priorityClass: TilePriorityClass;
  readonly priorityScore: number;
  readonly isCoarseFallback: boolean;
  readonly isVisibleCritical: boolean;
}

/**
 * 8K 멀티페이지 WebGPU 가상 타일 아틀라스용 핀-보호 SLRU 캐시 & 프레임 버짓 가드.
 */
export class VramTileStreamingCache {
  public readonly spec: MultiPageCanvasSpec;
  public readonly vramBudgetBytes: number;
  public readonly tileByteSize: number;
  public readonly maxAtlasSlots: number;
  public readonly targetFps: FrameRateTarget;
  public readonly frameBudgetMs: number;
  public readonly uploadBudgetMs: number;
  public readonly maxUploadBytesPerFrame: number;
  public readonly baseUploadCostMsPerTile: number;
  public readonly baseFrameOverheadMs: number;
  public readonly atlasSlotsPerRow: number;
  public readonly atlasSlotsPerCol: number;
  public readonly atlasLayerCount: number;
  public readonly mode: "wave140-predictive" | "naive-reactive";

  private readonly entries = new Map<TileKeyId, MutableResidentTileEntry>();
  private readonly freeSlots: number[] = [];
  private readonly lodRecoveryHysteresisFrames: number;
  private usedVramBytesInternal = 0;
  private maxObservedVramBytes = 0;
  private effectiveMipBiasInternal = 0;
  private lowPressureStreak = 0;
  private lastTargetMipLevel: TileMipLevel | undefined = undefined;
  private currentFrameIndex = 0;
  private totalEvictedCount = 0;
  private totalEvictedVisibleCount = 0;
  private totalEvictedDirtyCount = 0;
  private totalOomEvents = 0;
  private totalLodDegradations = 0;
  private maxObservedUploadTimeMs = 0;
  private lastEvictedKeys: TileKeyId[] = [];
  private lastPlan: ViewportTilePrefetchPlan | null = null;
  private lastFallbackKeyIds = new Set<TileKeyId>();

  public constructor(config: VramTileCacheConfig) {
    this.spec = config.spec;
    this.tileByteSize = computeTileByteSize(config.spec.tileSizePx, config.spec.bytesPerPixel);
    this.vramBudgetBytes = Math.max(
      0,
      Math.floor(clampFinite(config.vramBudgetBytes, 0, 16_000_000_000, 64 * 1024 * 1024)),
    );
    this.maxAtlasSlots = Math.floor(this.vramBudgetBytes / this.tileByteSize);
    this.targetFps = config.targetFps === 120 ? 120 : 60;
    this.frameBudgetMs = this.targetFps === 120 ? FRAME_BUDGET_120FPS_MS : FRAME_BUDGET_60FPS_MS;

    const defaultUploadCap =
      this.targetFps === 120 ? DEFAULT_UPLOAD_BUDGET_120FPS_MS : DEFAULT_UPLOAD_BUDGET_60FPS_MS;
    this.uploadBudgetMs = clampFinite(config.uploadBudgetMs ?? defaultUploadCap, 0.1, defaultUploadCap, defaultUploadCap);
    this.baseUploadCostMsPerTile = clampFinite(
      config.baseUploadCostMsPerTile ?? DEFAULT_UPLOAD_COST_PER_TILE_MS,
      0.05,
      4.0,
      DEFAULT_UPLOAD_COST_PER_TILE_MS,
    );
    const defaultOverhead = this.targetFps === 120 ? 1.75 : 2.6;
    this.baseFrameOverheadMs = clampFinite(
      config.baseFrameOverheadMs ?? defaultOverhead,
      0.5,
      this.frameBudgetMs * 0.5,
      defaultOverhead,
    );
    const defaultMaxBytes = Math.max(
      this.tileByteSize,
      Math.floor(this.uploadBudgetMs / this.baseUploadCostMsPerTile + 1) * this.tileByteSize * 2,
    );
    this.maxUploadBytesPerFrame = Math.max(
      this.tileByteSize,
      Math.floor(
        clampFinite(config.maxUploadBytesPerFrame ?? defaultMaxBytes, this.tileByteSize, 256 * 1024 * 1024, defaultMaxBytes),
      ),
    );
    this.atlasSlotsPerRow = clampInt(config.atlasSlotsPerRow ?? 16, 1, 64, 16);
    this.atlasSlotsPerCol = clampInt(config.atlasSlotsPerCol ?? 16, 1, 64, 16);
    const slotsPerLayer = this.atlasSlotsPerRow * this.atlasSlotsPerCol;
    this.atlasLayerCount = Math.max(1, Math.ceil(Math.max(1, this.maxAtlasSlots) / slotsPerLayer));
    this.lodRecoveryHysteresisFrames = clampInt(config.lodRecoveryHysteresisFrames ?? 6, 1, 60, 6);
    this.mode = config.mode ?? "wave140-predictive";

    for (let slot = this.maxAtlasSlots - 1; slot >= 0; slot -= 1) {
      this.freeSlots.push(slot);
    }
  }

  public get usedVramBytes(): number {
    return this.usedVramBytesInternal;
  }

  public get residentTileCount(): number {
    return this.entries.size;
  }

  public get effectiveMipBias(): number {
    return this.effectiveMipBiasInternal;
  }

  public get dirtyPinnedCount(): number {
    let count = 0;
    this.entries.forEach((entry) => {
      if (entry.pinnedDirty) count += 1;
    });
    return count;
  }

  public hasTile(keyId: TileKeyId): boolean {
    return this.entries.has(keyId);
  }

  public getEntry(keyId: TileKeyId): ResidentTileEntry | null {
    const found = this.entries.get(keyId);
    return found ? toReadonlyEntry(found) : null;
  }

  public listResidentEntries(): readonly ResidentTileEntry[] {
    const out: ResidentTileEntry[] = [];
    this.entries.forEach((found) => {
      out.push(toReadonlyEntry(found));
    });
    out.sort((a, b) => (a.keyId < b.keyId ? -1 : a.keyId > b.keyId ? 1 : 0));
    return out;
  }

  /** 브러시 편집이 발생한 타일을 미저장 Dirty 핀(`pinnedDirty = true`)으로 보호한다. */
  public pinDirtyTile(key: TileKey, frameIndex = this.currentFrameIndex): DirtyPinResult {
    const keyId = encodeTileKey(key);
    const existing = this.entries.get(keyId);
    if (existing) {
      existing.pinnedDirty = true;
      existing.segment = "protected";
      existing.lastTouchedFrame = frameIndex;
      return {
        keyId,
        pinned: true,
        newlyAllocated: false,
        usedVramBytes: this.usedVramBytesInternal,
        reason: "상주 타일에 Dirty 편집 핀을 설정했습니다.",
      };
    }

    const allocated = this.allocateAndInsertTile({
      key,
      keyId,
      priorityClass: "visible-critical",
      priorityScore: 1500,
      frameIndex,
      segment: "protected",
      pinnedVisible: false,
      pinnedDirty: true,
    });
    if (!allocated) {
      return {
        keyId,
        pinned: false,
        newlyAllocated: false,
        usedVramBytes: this.usedVramBytesInternal,
        reason: "모든 아틀라스 슬롯이 핀 보호 중이어서 VRAM 하드 캡을 유지하며 할당을 보류했습니다.",
      };
    }
    return {
      keyId,
      pinned: true,
      newlyAllocated: true,
      usedVramBytes: this.usedVramBytesInternal,
      reason: "새 아틀라스 슬롯에 Dirty 편집 타일을 고정했습니다.",
    };
  }

  /** OPFS/디스크 저장이 완료된 타일의 Dirty 핀을 해제한다. */
  public unpinDirtyTile(keyId: TileKeyId): boolean {
    const existing = this.entries.get(keyId);
    if (!existing || !existing.pinnedDirty) return false;
    existing.pinnedDirty = false;
    return true;
  }

  /** 단일 프레임을 진행해 프리페치, Graceful LOD, 핀 보호, 버짓 스로틀 업로드, 폴백 해석을 실행한다. */
  public stepFrame(
    viewport: ViewportCameraState,
    options?: FrameStepOptions,
  ): FrameStreamingTelemetry {
    const frameIndex = clampInt(
      options?.frameIndex ?? this.currentFrameIndex + 1,
      0,
      10_000_000,
      this.currentFrameIndex + 1,
    );
    this.currentFrameIndex = frameIndex;
    this.lastEvictedKeys = [];
    this.lastFallbackKeyIds = new Set<TileKeyId>();

    if (options?.dirtyKeysToFlush) {
      for (let i = 0; i < options.dirtyKeysToFlush.length; i += 1) {
        this.unpinDirtyTile(options.dirtyKeysToFlush[i]);
      }
    }
    if (options?.dirtyKeysToPin) {
      for (let i = 0; i < options.dirtyKeysToPin.length; i += 1) {
        this.pinDirtyTile(options.dirtyKeysToPin[i], frameIndex);
      }
    }

    const isPredictive = this.mode === "wave140-predictive";
    const viewportWithPrevMip: ViewportCameraState = {
      ...viewport,
      previousMipLevel: isPredictive ? (viewport.previousMipLevel ?? this.lastTargetMipLevel) : undefined,
    };

    const { plan, lodDegradationTriggered } = this.planWithGracefulLodGuard(
      viewportWithPrevMip,
      frameIndex,
      isPredictive,
      options,
    );
    this.lastTargetMipLevel = plan.targetMipLevel;
    this.lastPlan = plan;

    this.entries.forEach((entry) => {
      entry.pinnedVisible = false;
    });

    const visibleEntriesById = new Map<TileKeyId, TileKey>();
    for (let i = 0; i < plan.entries.length; i += 1) {
      const req = plan.entries[i];
      if (req.priorityClass === "visible-critical") visibleEntriesById.set(req.keyId, req.key);
    }

    let preResidentExactHits = 0;
    let preResidentExactMisses = 0;
    const missingVisibleCoarseMap = new Map<TileKeyId, UploadCandidate>();

    for (let i = 0; i < plan.visibleKeys.length; i += 1) {
      const keyId = plan.visibleKeys[i];
      const existing = this.entries.get(keyId);
      if (existing) {
        preResidentExactHits += 1;
        existing.pinnedVisible = true;
        existing.segment = "protected";
        existing.lastTouchedFrame = frameIndex;
        existing.hitCount += 1;
        continue;
      }
      preResidentExactMisses += 1;
      if (!isPredictive) continue;
      const key = visibleEntriesById.get(keyId);
      if (!key) continue;
      const residentAncestor = this.findNearestResidentCoarseAncestor(key);
      if (residentAncestor) {
        residentAncestor.pinnedVisible = true;
        residentAncestor.lastTouchedFrame = frameIndex;
      } else {
        const chain = getCoarseFallbackChain(key, this.spec.maxMipLevel);
        const topAnchor = chain[chain.length - 1];
        if (topAnchor) {
          const anchorId = encodeTileKey(topAnchor);
          if (!this.entries.has(anchorId) && !missingVisibleCoarseMap.has(anchorId)) {
            missingVisibleCoarseMap.set(anchorId, {
              key: topAnchor,
              keyId: anchorId,
              priorityClass: "coarse-mip-fallback",
              priorityScore: 2000,
              isCoarseFallback: true,
              isVisibleCritical: false,
            });
          }
        }
      }
    }

    const uploadQueue: UploadCandidate[] = [];
    const queuedIds = new Set<TileKeyId>();
    missingVisibleCoarseMap.forEach((candidate) => {
      queuedIds.add(candidate.keyId);
      uploadQueue.push(candidate);
    });
    for (let i = 0; i < plan.entries.length; i += 1) {
      const req = plan.entries[i];
      if (this.entries.has(req.keyId) || queuedIds.has(req.keyId)) continue;
      queuedIds.add(req.keyId);
      uploadQueue.push({
        key: req.key,
        keyId: req.keyId,
        priorityClass: req.priorityClass,
        priorityScore: req.priorityScore,
        isCoarseFallback: req.priorityClass === "coarse-mip-fallback",
        isVisibleCritical: req.priorityClass === "visible-critical",
      });
    }

    // Wave 140은 사전 디코딩된 타일을 업로드 버짓 내로 스로틀링하고,
    // Naive 반응형은 캐시 미스 시 동기 디코딩 + 비배치 업로드(약 3.15ms/타일)로 지연과 블랭크를 유발한다.
    const effectiveUploadCapMs = isPredictive ? this.uploadBudgetMs : this.frameBudgetMs * 1.02;
    const tileScale = this.tileByteSize / 262144;
    const perTileUploadCostBase = isPredictive
      ? this.baseUploadCostMsPerTile * tileScale
      : this.baseUploadCostMsPerTile * 7.5 * tileScale;

    let uploadTimeMs = 0;
    let uploadedBytes = 0;
    let uploadedTilesCount = 0;
    let throttledUploadCount = 0;
    let evictedThisFrame = 0;

    for (let i = 0; i < uploadQueue.length; i += 1) {
      const item = uploadQueue[i];
      const costMs = item.isCoarseFallback ? perTileUploadCostBase * 0.85 : perTileUploadCostBase;
      if (
        uploadTimeMs + costMs > effectiveUploadCapMs + 1e-6 ||
        (isPredictive && uploadedBytes + this.tileByteSize > this.maxUploadBytesPerFrame)
      ) {
        throttledUploadCount += uploadQueue.length - i;
        break;
      }

      const prevEvictions = this.totalEvictedCount;
      const inserted = this.allocateAndInsertTile({
        key: item.key,
        keyId: item.keyId,
        priorityClass: item.priorityClass,
        priorityScore: item.priorityScore,
        frameIndex,
        segment: item.isVisibleCritical || item.isCoarseFallback ? "protected" : "probation",
        pinnedVisible: item.isVisibleCritical || item.isCoarseFallback,
        pinnedDirty: false,
      });
      evictedThisFrame += this.totalEvictedCount - prevEvictions;

      if (!inserted) {
        throttledUploadCount += 1;
        continue;
      }
      uploadTimeMs += costMs;
      uploadedBytes += this.tileByteSize;
      uploadedTilesCount += 1;
    }

    if (uploadTimeMs > this.maxObservedUploadTimeMs) {
      this.maxObservedUploadTimeMs = uploadTimeMs;
    }

    let renderedExactCount = 0;
    let renderedFallbackCount = 0;
    let renderedBlankCount = 0;
    for (let i = 0; i < plan.visibleKeys.length; i += 1) {
      const keyId = plan.visibleKeys[i];
      const resident = this.entries.get(keyId);
      if (resident) {
        renderedExactCount += 1;
        resident.pinnedVisible = true;
        continue;
      }
      if (isPredictive) {
        const key = visibleEntriesById.get(keyId);
        const fallbackAncestor = key ? this.findNearestResidentCoarseAncestor(key) : null;
        if (fallbackAncestor) {
          renderedFallbackCount += 1;
          fallbackAncestor.pinnedVisible = true;
          this.lastFallbackKeyIds.add(keyId);
          continue;
        }
      }
      renderedBlankCount += 1;
    }

    const indirectionUpdateMs = uploadedTilesCount > 0 ? 0.12 + uploadedTilesCount * 0.015 : 0.05;
    const totalFrameTimeMs = roundDeterministic(
      this.baseFrameOverheadMs + uploadTimeMs + indirectionUpdateMs,
      3,
    );
    const visibleCount = plan.visibleKeys.length;

    return {
      frameIndex,
      targetFps: this.targetFps,
      frameBudgetMs: this.frameBudgetMs,
      uploadBudgetMs: this.uploadBudgetMs,
      targetMipLevel: plan.targetMipLevel,
      effectiveMipBias: this.effectiveMipBiasInternal,
      gracefulLodDegradationTriggered: lodDegradationTriggered,
      lookAheadMs: plan.lookAheadMs,
      visibleTileCount: visibleCount,
      preResidentExactHits,
      preResidentExactMisses,
      cacheHitRatio: visibleCount > 0 ? roundDeterministic(preResidentExactHits / visibleCount, 4) : 1,
      renderedExactCount,
      renderedFallbackCount,
      renderedBlankCount,
      uploadedTilesCount,
      uploadedBytes,
      throttledUploadCount,
      evictedTilesCount: evictedThisFrame,
      evictedVisibleCount: this.totalEvictedVisibleCount,
      evictedDirtyCount: this.totalEvictedDirtyCount,
      oomEventCount: this.totalOomEvents,
      uploadTimeMs: roundDeterministic(uploadTimeMs, 3),
      totalFrameTimeMs,
      withinFrameBudget: totalFrameTimeMs <= this.frameBudgetMs + 1e-6,
      usedVramBytes: this.usedVramBytesInternal,
      vramBudgetBytes: this.vramBudgetBytes,
      vramUtilizationRatio:
        this.vramBudgetBytes > 0 ? roundDeterministic(this.usedVramBytesInternal / this.vramBudgetBytes, 4) : 0,
      residentTileCount: this.entries.size,
      dirtyPinnedCount: this.dirtyPinnedCount,
      recentEvictedKeys: this.lastEvictedKeys.slice(),
      planSha256Hex: plan.planSha256Hex,
    };
  }

  /** 현재 프레임 기준 SVG 히트맵용 타일 상태 셀 스냅샷을 반환한다. */
  public captureTileVisualSnapshot(maxCells = 64): readonly TileVisualSnapshotCell[] {
    return captureTileVisualSnapshotFromCache({
      entries: this.entries,
      lastPlan: this.lastPlan,
      lastFallbackKeyIds: this.lastFallbackKeyIds,
      lastEvictedKeys: this.lastEvictedKeys,
      maxCells,
    });
  }

  /** 지정 페이지의 WebGPU 페이지 테이블(Indirection Buffer) 스냅샷을 빌드한다. */
  public buildIndirectionTableSnapshot(pageIndex = 0): readonly IndirectionTableEntrySnapshot[] {
    return buildIndirectionTableFromCache(this.spec, this.entries, pageIndex);
  }

  /** 3대 불변량 준수 여부와 결정론적 상태 지문(SHA-256)을 감사한다. */
  public auditInvariants(): VramCacheInvariantAudit {
    const residentIds = this.listResidentEntries().map(
      (e) => `${e.keyId}@${String(e.atlasSlot.slotIndex)}:${e.pinnedDirty ? "D" : ""}${e.pinnedVisible ? "V" : ""}`,
    );
    const stateSha256Hex = sha256TileStreamingHex(
      JSON.stringify({
        usedVramBytes: this.usedVramBytesInternal,
        vramBudgetBytes: this.vramBudgetBytes,
        effectiveMipBias: this.effectiveMipBiasInternal,
        residentIds,
      }),
    );
    return {
      vramHardCapRespected:
        this.usedVramBytesInternal <= this.vramBudgetBytes &&
        this.maxObservedVramBytes <= this.vramBudgetBytes,
      zeroVisibleEvictions: this.totalEvictedVisibleCount === 0,
      zeroDirtyEvictions: this.totalEvictedDirtyCount === 0,
      zeroOomEvents: this.totalOomEvents === 0,
      uploadBudgetRespected:
        this.mode === "naive-reactive" || this.maxObservedUploadTimeMs <= this.uploadBudgetMs + 1e-6,
      usedVramBytes: this.usedVramBytesInternal,
      vramBudgetBytes: this.vramBudgetBytes,
      maxObservedVramBytes: this.maxObservedVramBytes,
      residentTileCount: this.entries.size,
      maxAtlasSlots: this.maxAtlasSlots,
      dirtyPinnedCount: this.dirtyPinnedCount,
      totalEvictedCount: this.totalEvictedCount,
      totalLodDegradations: this.totalLodDegradations,
      stateSha256Hex,
    };
  }

  private planWithGracefulLodGuard(
    viewportWithPrevMip: ViewportCameraState,
    frameIndex: number,
    isPredictive: boolean,
    options?: FrameStepOptions,
  ): { readonly plan: ViewportTilePrefetchPlan; readonly lodDegradationTriggered: boolean } {
    const dirtyTotal = this.dirtyPinnedCount;
    let candidateBias = isPredictive ? this.effectiveMipBiasInternal : 0;
    let plan = planViewportTilePrefetch(this.spec, viewportWithPrevMip, {
      frameIndex,
      lookAheadMinMs: options?.lookAheadMinMs,
      lookAheadMaxMs: options?.lookAheadMaxMs,
      mipBias: candidateBias,
      maxPrefetchTiles: isPredictive ? options?.maxPrefetchTiles : 0,
      enablePredictivePrefetch: isPredictive,
      enableCoarseFallback: isPredictive,
      hysteresisBand: isPredictive ? undefined : 0,
    });

    let lodDegradationTriggered = false;
    if (isPredictive && this.maxAtlasSlots > 0) {
      while (
        candidateBias < this.spec.maxMipLevel &&
        plan.targetMipLevel < this.spec.maxMipLevel &&
        this.countRequiredSlotsForVisible(plan.visibleKeys, dirtyTotal) > this.maxAtlasSlots
      ) {
        candidateBias += 1;
        lodDegradationTriggered = true;
        plan = planViewportTilePrefetch(this.spec, viewportWithPrevMip, {
          frameIndex,
          lookAheadMinMs: options?.lookAheadMinMs,
          lookAheadMaxMs: options?.lookAheadMaxMs,
          mipBias: candidateBias,
          maxPrefetchTiles: options?.maxPrefetchTiles,
          enablePredictivePrefetch: true,
          enableCoarseFallback: true,
        });
      }

      if (lodDegradationTriggered) {
        this.effectiveMipBiasInternal = candidateBias;
        this.lowPressureStreak = 0;
        this.totalLodDegradations += 1;
      } else if (this.effectiveMipBiasInternal > 0) {
        const probePlan = planViewportTilePrefetch(this.spec, viewportWithPrevMip, {
          frameIndex,
          mipBias: this.effectiveMipBiasInternal - 1,
          enablePredictivePrefetch: false,
          enableCoarseFallback: false,
        });
        const neededLowerBias = this.countRequiredSlotsForVisible(probePlan.visibleKeys, dirtyTotal);
        if (neededLowerBias + Math.max(2, Math.ceil(this.maxAtlasSlots * 0.15)) <= this.maxAtlasSlots) {
          this.lowPressureStreak += 1;
          if (this.lowPressureStreak >= this.lodRecoveryHysteresisFrames) {
            this.effectiveMipBiasInternal = Math.max(0, this.effectiveMipBiasInternal - 1);
            this.lowPressureStreak = 0;
          }
        } else {
          this.lowPressureStreak = 0;
        }
      }
    }
    return { plan, lodDegradationTriggered };
  }

  private countRequiredSlotsForVisible(visibleKeys: readonly TileKeyId[], dirtyTotal: number): number {
    let overlapDirty = 0;
    for (let i = 0; i < visibleKeys.length; i += 1) {
      const existing = this.entries.get(visibleKeys[i]);
      if (existing && existing.pinnedDirty) overlapDirty += 1;
    }
    return visibleKeys.length + Math.max(0, dirtyTotal - overlapDirty);
  }

  private findNearestResidentCoarseAncestor(key: TileKey): MutableResidentTileEntry | null {
    const chain = getCoarseFallbackChain(key, this.spec.maxMipLevel);
    for (let i = 0; i < chain.length; i += 1) {
      const candidate = this.entries.get(encodeTileKey(chain[i]));
      if (candidate) return candidate;
    }
    return null;
  }

  private allocateAndInsertTile(params: {
    readonly key: TileKey;
    readonly keyId: TileKeyId;
    readonly priorityClass: TilePriorityClass;
    readonly priorityScore: number;
    readonly frameIndex: number;
    readonly segment: CacheSegment;
    readonly pinnedVisible: boolean;
    readonly pinnedDirty: boolean;
  }): boolean {
    if (this.entries.has(params.keyId)) return true;
    if (this.maxAtlasSlots <= 0 || this.tileByteSize > this.vramBudgetBytes) return false;

    while (
      this.freeSlots.length === 0 ||
      this.usedVramBytesInternal + this.tileByteSize > this.vramBudgetBytes
    ) {
      if (!this.evictOneUnpinnedTile()) return false;
    }

    const slotIndex = this.freeSlots.pop();
    if (slotIndex === undefined) return false;

    this.entries.set(params.keyId, {
      key: params.key,
      keyId: params.keyId,
      atlasSlot: decodeAtlasSlotLocation(slotIndex, this.atlasSlotsPerRow, this.atlasSlotsPerCol),
      byteSize: this.tileByteSize,
      segment: params.segment,
      pinnedVisible: params.pinnedVisible,
      pinnedDirty: params.pinnedDirty,
      priorityClass: params.priorityClass,
      lastPriorityScore: params.priorityScore,
      insertedFrame: params.frameIndex,
      lastTouchedFrame: params.frameIndex,
      hitCount: 0,
    });
    this.usedVramBytesInternal += this.tileByteSize;
    if (this.usedVramBytesInternal > this.maxObservedVramBytes) {
      this.maxObservedVramBytes = this.usedVramBytesInternal;
    }
    return true;
  }

  private evictOneUnpinnedTile(): MutableResidentTileEntry | null {
    const victim = selectSlruEvictionVictim(
      this.entries,
      this.spec.maxMipLevel,
      this.mode === "wave140-predictive",
    );
    if (victim === null) return null;
    this.entries.delete(victim.keyId);
    this.usedVramBytesInternal = Math.max(0, this.usedVramBytesInternal - victim.byteSize);
    this.freeSlots.push(victim.atlasSlot.slotIndex);
    this.totalEvictedCount += 1;
    this.lastEvictedKeys.push(victim.keyId);
    return victim;
  }
}
