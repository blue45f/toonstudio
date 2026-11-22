/**
 * WebGPU/WASM64 256×256px Dirty-Tile Pyramid LRU 캐시 매니저.
 *
 * - `WebGpuMemoryFailSafeGuard` VRAM 프로필과 연동된 `maxResidentTiles` 상한을 유지한다.
 * - 변경 영역(`dirtyRect`)과 1px 인접 apron만 마킹(`markDirtyRect`)·부분 커밋(`commitDirtyTiles`)한다.
 * - 가시 컷 ±1컷 프리페치(`applyVisibleCutPrefetch`)와 비가시 유휴 스왑(`evictIdleOffscreenTiles`)을 통합한다.
 */

import {
  WEBGPU_DIRTY_TILE_APRON_PX,
  WEBGPU_DIRTY_TILE_BYTES_PER_PIXEL_RGBA8,
  WEBGPU_DIRTY_TILE_DEFAULT_IDLE_EVICT_MS,
  WEBGPU_DIRTY_TILE_DEFAULT_MAX_MIP_LEVELS,
  WEBGPU_DIRTY_TILE_DEFAULT_VRAM_SHARE,
  WEBGPU_DIRTY_TILE_MIN_RESIDENT_TILES,
  WEBGPU_DIRTY_TILE_SIZE_PX,
  buildOpfsTilePath,
  clampRectToBounds,
  computeMaxResidentTilesFromVramProfile,
  computeTileApronBounds,
  distanceToViewportCenter,
  formatDirtyTileKey,
  intersectRects,
  sanitizeNonNegativeInt,
  sanitizePositiveInt,
  unionRects,
  type DirtyTileCanvasDimensions,
  type DirtyTileCoordinate,
  type DirtyTileRect,
  type TileApronBounds,
} from "./dirty-tile-apron-math";
import {
  evictIdleOffscreenTiles,
  planVisibleCutTilePrefetch,
  type DirtyTileSwapDescriptor,
  type DirtyTileSwapInDescriptor,
  type DirtyTileSwapReason,
  type OffscreenIdleTileCandidate,
  type PlanVisibleCutTilePrefetchInput,
} from "./dirty-tile-prefetch-scheduler";
import {
  WEBGPU_VRAM_DEFAULT_BUDGET_BYTES,
  type WebGpuMemoryFailSafeEvent,
  type WebGpuMemoryFailSafeGuard,
} from "./webgpu-memory-failsafe-guard";

import type {
  DirtyTileCommitBatch,
  DirtyTileCommitEntry,
  DirtyTileCommitOptions,
  DirtyTileMarkResult,
  DirtyTilePrefetchSyncOptions,
  DirtyTilePrefetchSyncResult,
  DirtyTileResidencyState,
  DirtyTileStateView,
  DirtyTileSwapAdapter,
  MarkDirtyRectInput,
  WebGpuDirtyTilePyramidOptions,
  WebGpuDirtyTilePyramidSnapshot,
} from "./dirty-tile-pyramid-types";

export * from "./dirty-tile-apron-math";
export * from "./dirty-tile-prefetch-scheduler";
export type * from "./dirty-tile-pyramid-types";

interface MutableTileRecord {
  readonly tileKey: string;
  readonly coord: DirtyTileCoordinate;
  coreRect: DirtyTileRect;
  apronRect: DirtyTileRect;
  byteSize: number;
  residency: DirtyTileResidencyState;
  dirty: boolean;
  dirtyRect: DirtyTileRect | null;
  revision: number;
  persistedRevision: number;
  pinned: boolean;
  lastUsedAtMs: number;
  lastAccessSeq: number;
  opfsPath: string | null;
}

export class WebGpuDirtyTilePyramidCache {
  private canvasWidth: number;
  private canvasHeight: number;
  private readonly tileSizePx: number;
  private readonly apronPx: number;
  private readonly bytesPerPixel: number;
  private readonly maxMipLevels: number;
  private readonly vramGuard: WebGpuMemoryFailSafeGuard | null;
  private readonly vramBudgetBytes: number;
  private readonly vramTilePoolShare: number;
  private readonly explicitMaxResidentTiles?: number;
  private readonly minResidentTiles: number;
  private readonly defaultIdleEvictMs: number;
  private readonly allocationIdPrefix: string;
  private readonly now: () => number;
  private readonly swapAdapter?: DirtyTileSwapAdapter;
  private readonly unsubscribeVramGuard: (() => void) | null;

  private readonly tiles = new Map<string, MutableTileRecord>();
  private accessSeq = 0;
  private residentTileCount = 0;
  private residentBytes = 0;
  private totalCommittedTiles = 0;
  private totalPartialCommits = 0;
  private totalEvictedTiles = 0;
  private totalSwappedOutToOpfs = 0;
  private totalSwapIns = 0;
  private cacheHitCount = 0;
  private cacheMissCount = 0;
  private isSyncingVramGuard = false;

  constructor(options: WebGpuDirtyTilePyramidOptions = {}) {
    this.canvasWidth = sanitizePositiveInt(options.canvas?.width, 800);
    this.canvasHeight = sanitizePositiveInt(options.canvas?.height, 20_000);
    this.tileSizePx = sanitizePositiveInt(options.tileSizePx, WEBGPU_DIRTY_TILE_SIZE_PX);
    this.apronPx = sanitizeNonNegativeInt(options.apronPx, WEBGPU_DIRTY_TILE_APRON_PX);
    this.bytesPerPixel = sanitizePositiveInt(options.bytesPerPixel, WEBGPU_DIRTY_TILE_BYTES_PER_PIXEL_RGBA8);
    this.maxMipLevels = sanitizePositiveInt(options.maxMipLevels, WEBGPU_DIRTY_TILE_DEFAULT_MAX_MIP_LEVELS);
    this.vramGuard = options.vramGuard ?? null;
    this.vramBudgetBytes = sanitizePositiveInt(
      options.vramBudgetBytes ?? this.vramGuard?.getSnapshot().budgetBytes,
      WEBGPU_VRAM_DEFAULT_BUDGET_BYTES,
      1024,
    );
    this.vramTilePoolShare = options.vramTilePoolShare ?? WEBGPU_DIRTY_TILE_DEFAULT_VRAM_SHARE;
    this.explicitMaxResidentTiles = options.maxResidentTiles;
    this.minResidentTiles = sanitizePositiveInt(options.minResidentTiles, WEBGPU_DIRTY_TILE_MIN_RESIDENT_TILES, 1);
    this.defaultIdleEvictMs = sanitizeNonNegativeInt(options.defaultIdleEvictMs, WEBGPU_DIRTY_TILE_DEFAULT_IDLE_EVICT_MS);
    this.allocationIdPrefix = options.allocationIdPrefix?.trim() || "dirty-tile-pyramid";
    this.now = options.now ?? (() => Date.now());
    this.swapAdapter = options.swapAdapter;
    this.unsubscribeVramGuard = this.vramGuard
      ? this.vramGuard.subscribe((event) => this.handleVramGuardEvent(event))
      : null;
  }

  getCanvasDimensions(): DirtyTileCanvasDimensions {
    return Object.freeze({ width: this.canvasWidth, height: this.canvasHeight });
  }

  resizeCanvas(canvas: DirtyTileCanvasDimensions): void {
    this.canvasWidth = sanitizePositiveInt(canvas.width, this.canvasWidth);
    this.canvasHeight = sanitizePositiveInt(canvas.height, this.canvasHeight);
  }

  /** 현재 `WebGpuMemoryFailSafeGuard` VRAM 프로필을 반영한 유효 최대 상주 타일 수. */
  getEffectiveMaxResidentTiles(): number {
    return this.computeVramCap(this.vramGuard?.getSnapshot().tier ?? "nominal");
  }

  private computeVramCap(tier: "nominal" | "soft-evict" | "warning-scale-down" | "critical-fallback"): number {
    return computeMaxResidentTilesFromVramProfile({
      budgetBytes: this.vramGuard?.getSnapshot().budgetBytes ?? this.vramBudgetBytes,
      tier,
      vramTilePoolShare: this.vramTilePoolShare,
      tileSizePx: this.tileSizePx,
      apronPx: this.apronPx,
      bytesPerPixel: this.bytesPerPixel,
      minResidentTiles: this.minResidentTiles,
      explicitMaxResidentTiles: this.explicitMaxResidentTiles,
    });
  }

  /** 변경 영역(`dirtyRect`)에 걸치는 타일과 1px 인접 apron만 피라미드 레벨별로 마킹한다. */
  markDirtyRect(input: MarkDirtyRectInput): DirtyTileMarkResult {
    const clampedDirtyRect = clampRectToBounds(input.rect, this.canvasWidth, this.canvasHeight);
    if (clampedDirtyRect.width <= 0 || clampedDirtyRect.height <= 0) {
      return Object.freeze({
        affectedTileKeys: Object.freeze([]),
        markedCount: 0,
        mipLevelsTouched: Object.freeze([]),
        clampedDirtyRect,
      });
    }

    const layerId = input.layerId?.trim() || "base";
    const pad = input.expandByApron === false ? 0 : this.apronPx;
    const targetMips = this.resolveTargetMipLevels(input.includeMipLevels);
    const affectedTileKeys: string[] = [];
    const mipLevelsTouched: number[] = [];
    const nowMs = this.now();

    for (const mipLevel of targetMips) {
      const mipScale = 2 ** mipLevel;
      const mipWidth = Math.max(1, Math.ceil(this.canvasWidth / mipScale));
      const mipHeight = Math.max(1, Math.ceil(this.canvasHeight / mipScale));
      const minX = Math.max(0, Math.floor(clampedDirtyRect.x / mipScale));
      const minY = Math.max(0, Math.floor(clampedDirtyRect.y / mipScale));
      const maxX = Math.min(mipWidth, Math.ceil((clampedDirtyRect.x + clampedDirtyRect.width) / mipScale));
      const maxY = Math.min(mipHeight, Math.ceil((clampedDirtyRect.y + clampedDirtyRect.height) / mipScale));
      if (maxX <= minX || maxY <= minY) continue;

      const mipDirtyRect: DirtyTileRect = Object.freeze({
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      });
      const startCol = Math.floor(Math.max(0, minX - pad) / this.tileSizePx);
      const endCol = Math.floor((Math.min(mipWidth, maxX + pad) - 1) / this.tileSizePx);
      const startRow = Math.floor(Math.max(0, minY - pad) / this.tileSizePx);
      const endRow = Math.floor((Math.min(mipHeight, maxY + pad) - 1) / this.tileSizePx);

      let touchedThisMip = false;
      for (let row = startRow; row <= endRow; row += 1) {
        for (let col = startCol; col <= endCol; col += 1) {
          const bounds = computeTileApronBounds({
            col,
            row,
            canvasWidth: this.canvasWidth,
            canvasHeight: this.canvasHeight,
            tileSizePx: this.tileSizePx,
            apronPx: this.apronPx,
            mipLevel,
          });
          if (bounds.isEmpty) continue;
          const clippedDirty = intersectRects(bounds.apronRect, mipDirtyRect);
          if (clippedDirty === null) continue;

          const record = this.getOrCreateRecord(layerId, mipLevel, col, row, bounds, nowMs);
          record.dirty = true;
          record.dirtyRect = unionRects(record.dirtyRect, clippedDirty);
          record.revision += 1;
          affectedTileKeys.push(record.tileKey);
          touchedThisMip = true;
        }
      }
      if (touchedThisMip) mipLevelsTouched.push(mipLevel);
    }

    return Object.freeze({
      affectedTileKeys: Object.freeze(affectedTileKeys),
      markedCount: affectedTileKeys.length,
      mipLevelsTouched: Object.freeze(mipLevelsTouched),
      clampedDirtyRect,
    });
  }

  /**
   * 더티 상태인 타일만 부분 영역(`uploadSubRect`) 단위로 커밋하고,
   * `maxResidentTiles` 상한 및 VRAM 압박 초과분을 LRU 스왑 퇴거한다.
   */
  commitDirtyTiles(options: DirtyTileCommitOptions = {}): DirtyTileCommitBatch {
    const nowMs = this.now();
    const mipFilter = options.mipLevels ? new Set(options.mipLevels) : null;
    const viewportBounds = options.viewport
      ? clampRectToBounds(options.viewport, this.canvasWidth, this.canvasHeight)
      : null;
    const maxPerCommit =
      options.maxTilesPerCommit !== undefined && Number.isFinite(options.maxTilesPerCommit)
        ? Math.max(0, Math.floor(options.maxTilesPerCommit))
        : Number.POSITIVE_INFINITY;

    const dirtyCandidates: MutableTileRecord[] = [];
    let skippedCleanTileCount = 0;

    for (const record of this.tiles.values()) {
      if (options.layerId && record.coord.layerId !== options.layerId) continue;
      if (mipFilter && !mipFilter.has(record.coord.mipLevel)) continue;
      if (options.tileKeys && !options.tileKeys.has(record.tileKey)) continue;
      if (!record.dirty) {
        skippedCleanTileCount += 1;
        continue;
      }
      if (viewportBounds !== null && intersectRects(this.projectToCanvas(record), viewportBounds) === null) {
        continue;
      }
      dirtyCandidates.push(record);
    }

    dirtyCandidates.sort((left, right) => {
      if (left.coord.mipLevel !== right.coord.mipLevel) {
        return left.coord.mipLevel - right.coord.mipLevel;
      }
      if (viewportBounds !== null) {
        const diff =
          distanceToViewportCenter(this.projectToCanvas(left), viewportBounds) -
          distanceToViewportCenter(this.projectToCanvas(right), viewportBounds);
        if (diff !== 0) return diff;
      }
      return left.coord.row - right.coord.row || left.coord.col - right.coord.col;
    });

    const committedTiles: DirtyTileCommitEntry[] = [];
    let committedBytes = 0;

    for (const record of dirtyCandidates) {
      if (committedTiles.length >= maxPerCommit) break;
      const apronBounds = computeTileApronBounds({
        col: record.coord.col,
        row: record.coord.row,
        canvasWidth: this.canvasWidth,
        canvasHeight: this.canvasHeight,
        tileSizePx: this.tileSizePx,
        apronPx: this.apronPx,
        mipLevel: record.coord.mipLevel,
        transform: options.transform,
      });
      if (apronBounds.isEmpty) continue;

      const wasSwappedIn = record.residency === "swapped-out" && record.opfsPath !== null;
      if (wasSwappedIn && record.opfsPath !== null) {
        this.emitSwapIn(record, record.opfsPath);
      }

      const targetSubRect =
        (record.dirtyRect ? intersectRects(apronBounds.apronRect, record.dirtyRect) : null) ??
        apronBounds.apronRect;
      const subRectBytes = targetSubRect.width * targetSubRect.height * this.bytesPerPixel;
      const tileByteSize =
        apronBounds.apronRect.width * apronBounds.apronRect.height * this.bytesPerPixel;

      const prevResident = record.residency === "resident";
      const prevBytes = record.byteSize;
      record.coreRect = apronBounds.coreRect;
      record.apronRect = apronBounds.apronRect;
      record.byteSize = tileByteSize;
      record.residency = "resident";
      record.dirty = false;
      record.dirtyRect = null;
      this.markAccessed(record, nowMs);

      this.residentBytes += prevResident ? tileByteSize - prevBytes : tileByteSize;
      if (!prevResident) this.residentTileCount += 1;

      this.syncTrackAllocation(record);
      this.totalCommittedTiles += 1;
      committedBytes += subRectBytes;

      committedTiles.push(
        Object.freeze({
          tileKey: record.tileKey,
          coord: record.coord,
          revision: record.revision,
          apronBounds,
          uploadSubRect: Object.freeze({
            mipRect: targetSubRect,
            localX: targetSubRect.x - apronBounds.apronRect.x,
            localY: targetSubRect.y - apronBounds.apronRect.y,
            width: targetSubRect.width,
            height: targetSubRect.height,
            byteSize: subRectBytes,
          }),
          tileByteSize,
          wasSwappedIn,
        }),
      );
    }

    if (committedTiles.length > 0) this.totalPartialCommits += 1;

    const evictedDescriptors = this.vramGuard
      ? this.reconcileWithVramGuard(options.protectedTileKeys ?? new Set<string>())
      : this.enforceResidentLimit(options.protectedTileKeys, nowMs);

    return Object.freeze({
      committedTiles: Object.freeze(committedTiles),
      skippedCleanTileCount,
      evictedDescriptors,
      residentTileCount: this.residentTileCount,
      residentBytes: this.residentBytes,
      effectiveMaxResidentTiles: this.getEffectiveMaxResidentTiles(),
      committedBytes,
    });
  }

  /** 가시 컷 ±1컷 프리페치 계획을 적용해 캐시 히트/OPFS 스왑인/유휴 퇴거를 조율한다. */
  applyVisibleCutPrefetch(
    input: Omit<PlanVisibleCutTilePrefetchInput, "canvas"> & {
      readonly canvas?: DirtyTileCanvasDimensions;
    },
    options: DirtyTilePrefetchSyncOptions = {},
  ): DirtyTilePrefetchSyncResult {
    const plan = planVisibleCutTilePrefetch({
      ...input,
      canvas: input.canvas ?? this.getCanvasDimensions(),
      tileSizePx: input.tileSizePx ?? this.tileSizePx,
      apronPx: input.apronPx ?? this.apronPx,
    });
    const nowMs = this.now();
    const visibleKeySet = new Set(plan.visibleTiles.map((entry) => entry.key));

    if (options.pinVisibleTiles !== false) {
      for (const record of this.tiles.values()) {
        if (record.coord.mipLevel !== plan.mipLevel) continue;
        const shouldPin = visibleKeySet.has(record.tileKey);
        if (record.pinned !== shouldPin) {
          record.pinned = shouldPin;
          this.vramGuard?.setAllocationPinned(this.allocationId(record.tileKey), shouldPin);
        }
      }
    }

    const residentHitKeys: string[] = [];
    const swapInDescriptors: DirtyTileSwapInDescriptor[] = [];
    const coldMissKeys: string[] = [];

    for (const entry of plan.orderedTiles) {
      const record = this.tiles.get(entry.key);
      if (record && record.residency === "resident") {
        this.markAccessed(record, nowMs);
        this.vramGuard?.touchAllocation(this.allocationId(record.tileKey), nowMs);
        this.cacheHitCount += 1;
        residentHitKeys.push(entry.key);
      } else if (record && record.residency === "swapped-out" && record.opfsPath !== null) {
        this.cacheMissCount += 1;
        swapInDescriptors.push(this.emitSwapIn(record, record.opfsPath));
        record.residency = "resident";
        this.markAccessed(record, nowMs);
        this.residentTileCount += 1;
        this.residentBytes += record.byteSize;
        this.syncTrackAllocation(record);
      } else {
        this.cacheMissCount += 1;
        coldMissKeys.push(entry.key);
      }
    }

    const evictedDescriptors =
      options.evictOffscreen === false
        ? this.vramGuard
          ? this.reconcileWithVramGuard(plan.protectedTileKeys)
          : this.enforceResidentLimit(plan.protectedTileKeys, nowMs)
        : this.evictIdleOffscreenTiles({
            protectedTileKeys: plan.protectedTileKeys,
            nowMs,
            idleThresholdMs: options.idleThresholdMs,
            maxEvictions: options.maxEvictions,
          });

    return Object.freeze({
      plan,
      residentHitKeys: Object.freeze(residentHitKeys),
      swapInDescriptors: Object.freeze(swapInDescriptors),
      coldMissKeys: Object.freeze(coldMissKeys),
      evictedDescriptors,
    });
  }

  /** 현재 상주 중인 비가시 유휴 타일과 상한 초과 타일을 퇴거하고 스왑 디스크립터를 반환한다. */
  evictIdleOffscreenTiles(options: {
    readonly protectedTileKeys?: ReadonlySet<string>;
    readonly nowMs?: number;
    readonly idleThresholdMs?: number;
    readonly maxEvictions?: number;
    readonly reason?: DirtyTileSwapReason;
  } = {}): readonly DirtyTileSwapDescriptor[] {
    const nowMs = options.nowMs ?? this.now();
    const protectedTileKeys = options.protectedTileKeys ?? new Set<string>();
    const residentCandidates: OffscreenIdleTileCandidate[] = [];
    for (const record of this.tiles.values()) {
      if (record.residency === "resident") residentCandidates.push(record);
    }

    const descriptors = evictIdleOffscreenTiles({
      tiles: residentCandidates,
      protectedTileKeys,
      nowMs,
      idleThresholdMs: options.idleThresholdMs ?? this.defaultIdleEvictMs,
      maxEvictions: options.maxEvictions,
      targetMaxResidentTiles: this.getEffectiveMaxResidentTiles(),
      reason: options.reason,
    });

    for (const descriptor of descriptors) {
      this.applyEvictionDescriptor(descriptor, true);
    }
    return descriptors;
  }

  touchTile(tileKey: string, atMs?: number): boolean {
    const record = this.tiles.get(tileKey);
    if (!record || record.residency !== "resident") return false;
    const timestamp = atMs !== undefined && Number.isFinite(atMs) ? atMs : this.now();
    this.markAccessed(record, timestamp);
    this.vramGuard?.touchAllocation(this.allocationId(tileKey), timestamp);
    return true;
  }

  setTilePinned(tileKey: string, pinned: boolean): boolean {
    const record = this.tiles.get(tileKey);
    if (!record) return false;
    record.pinned = pinned;
    if (record.residency === "resident") {
      this.vramGuard?.setAllocationPinned(this.allocationId(tileKey), pinned);
    }
    return true;
  }

  markTilePersisted(tileKey: string, revision?: number): boolean {
    const record = this.tiles.get(tileKey);
    if (!record) return false;
    record.persistedRevision = Math.max(record.persistedRevision, revision ?? record.revision);
    return true;
  }

  getTileState(tileKey: string): DirtyTileStateView | null {
    const record = this.tiles.get(tileKey);
    return record ? this.freezeTileView(record) : null;
  }

  listResidentTiles(): readonly DirtyTileStateView[] {
    return Object.freeze(
      [...this.tiles.values()]
        .filter((record) => record.residency === "resident")
        .map((record) => this.freezeTileView(record)),
    );
  }

  listDirtyTiles(): readonly DirtyTileStateView[] {
    return Object.freeze(
      [...this.tiles.values()]
        .filter((record) => record.dirty)
        .map((record) => this.freezeTileView(record)),
    );
  }

  /** 외부 VRAM 압박 이벤트 이후 `WebGpuMemoryFailSafeGuard`와 상주 목록을 정합화한다. */
  reconcileWithVramGuard(
    protectedTileKeys: ReadonlySet<string> = new Set<string>(),
  ): readonly DirtyTileSwapDescriptor[] {
    const guard = this.vramGuard;
    if (!guard) return Object.freeze([]);
    const nowMs = this.now();
    const guardSnap = guard.getSnapshot();
    const reason: DirtyTileSwapReason =
      guardSnap.tier === "critical-fallback" ? "vram-pressure-critical" : "vram-pressure-soft";
    const reconciled: DirtyTileSwapDescriptor[] = [];

    for (const record of this.tiles.values()) {
      if (record.residency !== "resident") continue;
      // 기존 lastUsedAtMs를 그대로 전달해 타임스탬프 변경 없이 할당 생존 여부만 확인한다.
      if (!guard.touchAllocation(this.allocationId(record.tileKey), record.lastUsedAtMs)) {
        const requiresPersist = record.dirty || record.revision > record.persistedRevision;
        const descriptor: DirtyTileSwapDescriptor = Object.freeze({
          tileKey: record.tileKey,
          coord: record.coord,
          opfsPath: buildOpfsTilePath(record.coord, record.revision),
          target: requiresPersist ? "opfs-cold-store" : "sleep-discard-clean",
          reason,
          coreRect: record.coreRect,
          apronRect: record.apronRect,
          byteSize: record.byteSize,
          revision: record.revision,
          idleDurationMs: Math.max(0, nowMs - record.lastUsedAtMs),
          lastUsedAtMs: record.lastUsedAtMs,
          requiresPersist,
        });
        this.applyEvictionDescriptor(descriptor, false);
        reconciled.push(descriptor);
      }
    }

    const overflow = this.enforceResidentLimit(protectedTileKeys, nowMs, reason);
    return Object.freeze([...reconciled, ...overflow]);
  }

  getSnapshot(): WebGpuDirtyTilePyramidSnapshot {
    const guardSnap = this.vramGuard?.getSnapshot();
    let swappedOutTileCount = 0;
    let dirtyTileCount = 0;
    let pinnedTileCount = 0;
    for (const record of this.tiles.values()) {
      if (record.residency === "swapped-out") swappedOutTileCount += 1;
      if (record.dirty) dirtyTileCount += 1;
      if (record.pinned) pinnedTileCount += 1;
    }

    const lookups = this.cacheHitCount + this.cacheMissCount;
    return Object.freeze({
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      tileSizePx: this.tileSizePx,
      apronPx: this.apronPx,
      maxMipLevels: this.maxMipLevels,
      residentTileCount: this.residentTileCount,
      swappedOutTileCount,
      dirtyTileCount,
      pinnedTileCount,
      residentBytes: this.residentBytes,
      effectiveMaxResidentTiles: this.getEffectiveMaxResidentTiles(),
      configuredMaxResidentTiles: this.computeVramCap("nominal"),
      vramTier: guardSnap?.tier ?? "nominal",
      vramUtilizationRatio: guardSnap?.utilizationRatio ?? 0,
      totalCommittedTiles: this.totalCommittedTiles,
      totalPartialCommits: this.totalPartialCommits,
      totalEvictedTiles: this.totalEvictedTiles,
      totalSwappedOutToOpfs: this.totalSwappedOutToOpfs,
      totalSwapIns: this.totalSwapIns,
      cacheHitCount: this.cacheHitCount,
      cacheMissCount: this.cacheMissCount,
      cacheHitRate: lookups > 0 ? Number((this.cacheHitCount / lookups).toFixed(4)) : 0,
    });
  }

  dispose(): void {
    this.unsubscribeVramGuard?.();
    this.isSyncingVramGuard = true;
    try {
      for (const record of this.tiles.values()) {
        if (record.residency === "resident") {
          this.vramGuard?.releaseAllocation(this.allocationId(record.tileKey));
        }
      }
    } finally {
      this.isSyncingVramGuard = false;
    }
    this.tiles.clear();
    this.residentTileCount = 0;
    this.residentBytes = 0;
  }

  private projectToCanvas(record: MutableTileRecord): DirtyTileRect {
    const scale = 2 ** record.coord.mipLevel;
    return {
      x: record.coreRect.x * scale,
      y: record.coreRect.y * scale,
      width: record.coreRect.width * scale,
      height: record.coreRect.height * scale,
    };
  }

  private emitSwapIn(record: MutableTileRecord, opfsPath: string): DirtyTileSwapInDescriptor {
    const swapIn: DirtyTileSwapInDescriptor = Object.freeze({
      tileKey: record.tileKey,
      coord: record.coord,
      opfsPath,
      revision: record.revision,
      byteSize: record.byteSize,
    });
    this.totalSwapIns += 1;
    this.swapAdapter?.onSwapIn?.(swapIn);
    return swapIn;
  }

  private markAccessed(record: MutableTileRecord, nowMs: number): void {
    this.accessSeq += 1;
    record.lastAccessSeq = this.accessSeq;
    record.lastUsedAtMs = nowMs;
  }

  private resolveTargetMipLevels(includeMipLevels?: boolean | readonly number[]): readonly number[] {
    if (includeMipLevels === false) return [0];
    if (Array.isArray(includeMipLevels)) {
      const unique = new Set<number>();
      for (const level of includeMipLevels) {
        if (Number.isFinite(level)) {
          unique.add(Math.min(this.maxMipLevels - 1, Math.max(0, Math.floor(level))));
        }
      }
      return unique.size > 0 ? [...unique].sort((a, b) => a - b) : [0];
    }
    return Array.from({ length: this.maxMipLevels }, (_, index) => index);
  }

  private getOrCreateRecord(
    layerId: string,
    mipLevel: number,
    col: number,
    row: number,
    bounds: TileApronBounds,
    nowMs: number,
  ): MutableTileRecord {
    const coord: DirtyTileCoordinate = Object.freeze({ layerId, mipLevel, col, row });
    const tileKey = formatDirtyTileKey(coord);
    const existing = this.tiles.get(tileKey);
    if (existing) {
      existing.coreRect = bounds.coreRect;
      existing.apronRect = bounds.apronRect;
      return existing;
    }
    const created: MutableTileRecord = {
      tileKey, coord, coreRect: bounds.coreRect, apronRect: bounds.apronRect,
      byteSize: bounds.apronRect.width * bounds.apronRect.height * this.bytesPerPixel,
      residency: "pending", dirty: false, dirtyRect: null, revision: 0,
      persistedRevision: 0, pinned: false, lastUsedAtMs: nowMs, lastAccessSeq: 0, opfsPath: null,
    };
    this.tiles.set(tileKey, created);
    return created;
  }

  private allocationId(tileKey: string): string {
    return `${this.allocationIdPrefix}:${tileKey}`;
  }

  private syncTrackAllocation(record: MutableTileRecord): void {
    if (!this.vramGuard) return;
    this.isSyncingVramGuard = true;
    try {
      this.vramGuard.trackAllocation({
        id: this.allocationId(record.tileKey),
        kind: "texture",
        bytes: record.byteSize,
        label: record.tileKey,
        evictableTile: true,
        pinned: record.pinned,
        lastUsedAtMs: record.lastUsedAtMs,
      });
    } finally {
      this.isSyncingVramGuard = false;
    }
  }

  private handleVramGuardEvent(event: WebGpuMemoryFailSafeEvent): void {
    if (this.isSyncingVramGuard) return;
    if (
      event.kind === "lru-cache-evicted" ||
      event.kind === "preview-scale-reduced" ||
      event.kind === "out-of-memory" ||
      event.kind === "fallback-to-cpu-safe"
    ) {
      this.reconcileWithVramGuard();
    }
  }

  private enforceResidentLimit(
    protectedTileKeys?: ReadonlySet<string>,
    nowMs: number = this.now(),
    reason: DirtyTileSwapReason = "lru-capacity-limit",
  ): readonly DirtyTileSwapDescriptor[] {
    if (this.residentTileCount <= this.getEffectiveMaxResidentTiles()) return Object.freeze([]);
    return this.evictIdleOffscreenTiles({
      protectedTileKeys,
      nowMs,
      idleThresholdMs: Number.MAX_SAFE_INTEGER,
      reason,
    });
  }

  private applyEvictionDescriptor(
    descriptor: DirtyTileSwapDescriptor,
    releaseFromGuard: boolean,
  ): void {
    const record = this.tiles.get(descriptor.tileKey);
    if (!record || record.residency !== "resident") return;

    record.residency = "swapped-out";
    record.opfsPath = descriptor.requiresPersist ? descriptor.opfsPath : null;
    this.residentTileCount = Math.max(0, this.residentTileCount - 1);
    this.residentBytes = Math.max(0, this.residentBytes - record.byteSize);
    this.totalEvictedTiles += 1;
    if (descriptor.requiresPersist) this.totalSwappedOutToOpfs += 1;

    if (releaseFromGuard && this.vramGuard) {
      this.isSyncingVramGuard = true;
      try {
        this.vramGuard.releaseAllocation(this.allocationId(record.tileKey));
      } finally {
        this.isSyncingVramGuard = false;
      }
    }
    this.swapAdapter?.onSwapOut?.(descriptor);
  }

  private freezeTileView(r: MutableTileRecord): DirtyTileStateView {
    return Object.freeze({
      tileKey: r.tileKey, coord: r.coord, coreRect: r.coreRect, apronRect: r.apronRect,
      byteSize: r.byteSize, residency: r.residency, dirty: r.dirty, dirtyRect: r.dirtyRect,
      revision: r.revision, persistedRevision: r.persistedRevision, pinned: r.pinned,
      lastUsedAtMs: r.lastUsedAtMs, opfsPath: r.opfsPath,
    });
  }
}
