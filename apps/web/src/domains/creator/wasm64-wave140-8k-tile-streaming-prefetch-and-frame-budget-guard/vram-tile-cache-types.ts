/**
 * Wave 140 — VRAM 타일 스트리밍 캐시·아틀라스 할당기·프레임 텔레메트리 공통 타입 및 상수.
 */

import type {
  MultiPageCanvasSpec,
  TileKey,
  TileKeyId,
  TileMipLevel,
  TilePriorityClass,
} from "./tile-pyramid-and-prefetch";

export type FrameRateTarget = 60 | 120;
export type CacheSegment = "probation" | "protected";
export type TileVisualState =
  | "visible-hit"
  | "predictive-prefetch"
  | "coarse-fallback"
  | "pinned-dirty"
  | "evicted"
  | "blank-miss";

export interface AtlasSlotLocation {
  readonly slotIndex: number;
  readonly layerIndex: number;
  readonly slotX: number;
  readonly slotY: number;
}

export interface ResidentTileEntry {
  readonly key: TileKey;
  readonly keyId: TileKeyId;
  readonly atlasSlot: AtlasSlotLocation;
  readonly byteSize: number;
  readonly segment: CacheSegment;
  readonly pinnedVisible: boolean;
  readonly pinnedDirty: boolean;
  readonly priorityClass: TilePriorityClass;
  readonly lastPriorityScore: number;
  readonly insertedFrame: number;
  readonly lastTouchedFrame: number;
  readonly hitCount: number;
}

export interface VramTileCacheConfig {
  readonly spec: MultiPageCanvasSpec;
  readonly vramBudgetBytes: number;
  readonly targetFps?: FrameRateTarget;
  readonly uploadBudgetMs?: number;
  readonly maxUploadBytesPerFrame?: number;
  readonly baseUploadCostMsPerTile?: number;
  readonly baseFrameOverheadMs?: number;
  readonly atlasSlotsPerRow?: number;
  readonly atlasSlotsPerCol?: number;
  readonly lodRecoveryHysteresisFrames?: number;
  readonly mode?: "wave140-predictive" | "naive-reactive";
}

export interface DirtyPinResult {
  readonly keyId: TileKeyId;
  readonly pinned: boolean;
  readonly newlyAllocated: boolean;
  readonly usedVramBytes: number;
  readonly reason: string;
}

export interface FrameStepOptions {
  readonly frameIndex?: number;
  readonly dirtyKeysToPin?: readonly TileKey[];
  readonly dirtyKeysToFlush?: readonly TileKeyId[];
  readonly lookAheadMinMs?: number;
  readonly lookAheadMaxMs?: number;
  readonly maxPrefetchTiles?: number;
}

export interface TileVisualSnapshotCell {
  readonly keyId: TileKeyId;
  readonly pageIndex: number;
  readonly mipLevel: TileMipLevel;
  readonly tx: number;
  readonly ty: number;
  readonly state: TileVisualState;
}

export interface FrameStreamingTelemetry {
  readonly frameIndex: number;
  readonly targetFps: FrameRateTarget;
  readonly frameBudgetMs: number;
  readonly uploadBudgetMs: number;
  readonly targetMipLevel: TileMipLevel;
  readonly effectiveMipBias: number;
  readonly gracefulLodDegradationTriggered: boolean;
  readonly lookAheadMs: number;
  readonly visibleTileCount: number;
  readonly preResidentExactHits: number;
  readonly preResidentExactMisses: number;
  readonly cacheHitRatio: number;
  readonly renderedExactCount: number;
  readonly renderedFallbackCount: number;
  readonly renderedBlankCount: number;
  readonly uploadedTilesCount: number;
  readonly uploadedBytes: number;
  readonly throttledUploadCount: number;
  readonly evictedTilesCount: number;
  readonly evictedVisibleCount: number;
  readonly evictedDirtyCount: number;
  readonly oomEventCount: number;
  readonly uploadTimeMs: number;
  readonly totalFrameTimeMs: number;
  readonly withinFrameBudget: boolean;
  readonly usedVramBytes: number;
  readonly vramBudgetBytes: number;
  readonly vramUtilizationRatio: number;
  readonly residentTileCount: number;
  readonly dirtyPinnedCount: number;
  readonly recentEvictedKeys: readonly TileKeyId[];
  readonly planSha256Hex: string;
}

export interface IndirectionTableEntrySnapshot {
  readonly keyId: TileKeyId;
  readonly resident: boolean;
  readonly atlasSlotIndex: number;
  readonly mipLevel: TileMipLevel;
  readonly dirty: boolean;
}

export interface VramCacheInvariantAudit {
  readonly vramHardCapRespected: boolean;
  readonly zeroVisibleEvictions: boolean;
  readonly zeroDirtyEvictions: boolean;
  readonly zeroOomEvents: boolean;
  readonly uploadBudgetRespected: boolean;
  readonly usedVramBytes: number;
  readonly vramBudgetBytes: number;
  readonly maxObservedVramBytes: number;
  readonly residentTileCount: number;
  readonly maxAtlasSlots: number;
  readonly dirtyPinnedCount: number;
  readonly totalEvictedCount: number;
  readonly totalLodDegradations: number;
  readonly stateSha256Hex: string;
}

export const FRAME_BUDGET_60FPS_MS = 16.67;
export const FRAME_BUDGET_120FPS_MS = 8.33;
export const DEFAULT_UPLOAD_BUDGET_60FPS_MS = 4.5;
export const DEFAULT_UPLOAD_BUDGET_120FPS_MS = 2.2;
export const DEFAULT_UPLOAD_COST_PER_TILE_MS = 0.42;
