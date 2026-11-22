/**
 * WebGPU 256×256px Dirty-Tile Pyramid LRU 캐시 계약 타입 모음.
 */

import type {
  DirtyTileCanvasDimensions,
  DirtyTileCanvasTransform,
  DirtyTileCoordinate,
  DirtyTileRect,
  TileApronBounds,
} from "./dirty-tile-apron-math";
import type {
  DirtyTileSwapDescriptor,
  DirtyTileSwapInDescriptor,
  VisibleCutPrefetchPlan,
} from "./dirty-tile-prefetch-scheduler";
import type {
  WebGpuMemoryFailSafeGuard,
  WebGpuVramPressureTier,
} from "./webgpu-memory-failsafe-guard";

export interface DirtyTileSwapAdapter {
  readonly onSwapOut?: (descriptor: DirtyTileSwapDescriptor) => void;
  readonly onSwapIn?: (descriptor: DirtyTileSwapInDescriptor) => void;
}

export type DirtyTileResidencyState = "pending" | "resident" | "swapped-out";

export interface DirtyTileStateView {
  readonly tileKey: string;
  readonly coord: DirtyTileCoordinate;
  readonly coreRect: DirtyTileRect;
  readonly apronRect: DirtyTileRect;
  readonly byteSize: number;
  readonly residency: DirtyTileResidencyState;
  readonly dirty: boolean;
  readonly dirtyRect: DirtyTileRect | null;
  readonly revision: number;
  readonly persistedRevision: number;
  readonly pinned: boolean;
  readonly lastUsedAtMs: number;
  readonly opfsPath: string | null;
}

export interface MarkDirtyRectInput {
  readonly rect: DirtyTileRect;
  readonly layerId?: string;
  /** true면 모든 피라미드 mip 레벨에 전파, 배열이면 지정 레벨만 마킹(기본 true). */
  readonly includeMipLevels?: boolean | readonly number[];
  /** 경계 1px 이내 수정 시 인접 타일의 1px apron도 함께 무효화(기본 true). */
  readonly expandByApron?: boolean;
}

export interface DirtyTileMarkResult {
  readonly affectedTileKeys: readonly string[];
  readonly markedCount: number;
  readonly mipLevelsTouched: readonly number[];
  readonly clampedDirtyRect: DirtyTileRect;
}

export interface DirtyTileCommitOptions {
  readonly layerId?: string;
  readonly mipLevels?: readonly number[];
  readonly tileKeys?: ReadonlySet<string>;
  readonly viewport?: DirtyTileRect;
  readonly maxTilesPerCommit?: number;
  readonly transform?: DirtyTileCanvasTransform;
  readonly protectedTileKeys?: ReadonlySet<string>;
}

export interface DirtyTileUploadSubRect {
  readonly mipRect: DirtyTileRect;
  readonly localX: number;
  readonly localY: number;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
}

export interface DirtyTileCommitEntry {
  readonly tileKey: string;
  readonly coord: DirtyTileCoordinate;
  readonly revision: number;
  readonly apronBounds: TileApronBounds;
  readonly uploadSubRect: DirtyTileUploadSubRect;
  readonly tileByteSize: number;
  readonly wasSwappedIn: boolean;
}

export interface DirtyTileCommitBatch {
  readonly committedTiles: readonly DirtyTileCommitEntry[];
  readonly skippedCleanTileCount: number;
  readonly evictedDescriptors: readonly DirtyTileSwapDescriptor[];
  readonly residentTileCount: number;
  readonly residentBytes: number;
  readonly effectiveMaxResidentTiles: number;
  readonly committedBytes: number;
}

export interface DirtyTilePrefetchSyncOptions {
  readonly pinVisibleTiles?: boolean;
  readonly evictOffscreen?: boolean;
  readonly idleThresholdMs?: number;
  readonly maxEvictions?: number;
}

export interface DirtyTilePrefetchSyncResult {
  readonly plan: VisibleCutPrefetchPlan;
  readonly residentHitKeys: readonly string[];
  readonly swapInDescriptors: readonly DirtyTileSwapInDescriptor[];
  readonly coldMissKeys: readonly string[];
  readonly evictedDescriptors: readonly DirtyTileSwapDescriptor[];
}

export interface WebGpuDirtyTilePyramidOptions {
  readonly canvas?: DirtyTileCanvasDimensions;
  readonly tileSizePx?: number;
  readonly apronPx?: number;
  readonly bytesPerPixel?: number;
  readonly maxMipLevels?: number;
  readonly vramGuard?: WebGpuMemoryFailSafeGuard;
  readonly vramBudgetBytes?: number;
  readonly vramTilePoolShare?: number;
  readonly maxResidentTiles?: number;
  readonly minResidentTiles?: number;
  readonly defaultIdleEvictMs?: number;
  readonly allocationIdPrefix?: string;
  readonly now?: () => number;
  readonly swapAdapter?: DirtyTileSwapAdapter;
}

export interface WebGpuDirtyTilePyramidSnapshot {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly tileSizePx: number;
  readonly apronPx: number;
  readonly maxMipLevels: number;
  readonly residentTileCount: number;
  readonly swappedOutTileCount: number;
  readonly dirtyTileCount: number;
  readonly pinnedTileCount: number;
  readonly residentBytes: number;
  readonly effectiveMaxResidentTiles: number;
  readonly configuredMaxResidentTiles: number;
  readonly vramTier: WebGpuVramPressureTier;
  readonly vramUtilizationRatio: number;
  readonly totalCommittedTiles: number;
  readonly totalPartialCommits: number;
  readonly totalEvictedTiles: number;
  readonly totalSwappedOutToOpfs: number;
  readonly totalSwapIns: number;
  readonly cacheHitCount: number;
  readonly cacheMissCount: number;
  readonly cacheHitRate: number;
}
