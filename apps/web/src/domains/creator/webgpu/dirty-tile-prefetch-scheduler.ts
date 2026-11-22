/**
 * 세로 스크롤 웹툰 원고용 가시 컷 ±1컷 프리페치 스케줄러 & 비가시 유휴 타일 스왑 산출기.
 *
 * - 800×20,000px 세로 원고에서 현재 뷰포트 및 ±1 인접 컷 타일을 우선 상주 보호 집합으로 산출한다.
 * - 스크롤 방향(`scrollVelocityY`)에 따라 진행 방향 컷의 프리페치 타일을 선행 배치한다.
 * - 가시 컷 ±1컷과 `pinned` 타일을 제외한 비가시 유휴 타일은 순수 메모리 기반 OPFS/슬립
 *   스왑 디스크립터로 산출해 브라우저 저장소 API 직접 호출 없이 외부 어댑터에 위임한다.
 */

import {
  WEBGPU_DIRTY_TILE_APRON_PX,
  WEBGPU_DIRTY_TILE_DEFAULT_IDLE_EVICT_MS,
  WEBGPU_DIRTY_TILE_SIZE_PX,
  buildOpfsTilePath,
  clampRectToBounds,
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

export interface DirtyTileCutBand {
  readonly cutId: string;
  readonly y: number;
  readonly height: number;
  readonly x?: number;
  readonly width?: number;
}

export interface PlanVisibleCutTilePrefetchInput {
  readonly canvas: DirtyTileCanvasDimensions;
  readonly viewport: DirtyTileRect;
  readonly layerId?: string;
  readonly mipLevel?: number;
  readonly tileSizePx?: number;
  readonly apronPx?: number;
  readonly cuts?: readonly DirtyTileCutBand[];
  /** 가시 컷 앞뒤로 프리페치할 인접 컷 수(기본 1 = ±1컷). */
  readonly cutMargin?: number;
  /** 세로 스크롤 속도(px/frame, >0 하향, <0 상향). 진행 방향 컷을 우선 정렬한다. */
  readonly scrollVelocityY?: number;
  readonly maxPrefetchTiles?: number;
}

export type DirtyTilePrefetchPriority = "visible" | "prefetch-adjacent";

export interface DirtyTilePrefetchEntry {
  readonly key: string;
  readonly coord: DirtyTileCoordinate;
  readonly priority: DirtyTilePrefetchPriority;
  readonly cutId: string | null;
  readonly distancePx: number;
  readonly coreRect: DirtyTileRect;
  readonly apronRect: DirtyTileRect;
}

export interface VisibleCutPrefetchPlan {
  readonly mipLevel: number;
  readonly visibleCutIds: readonly string[];
  readonly prefetchCutIds: readonly string[];
  readonly protectedCutIds: readonly string[];
  readonly visibleBounds: DirtyTileRect;
  readonly protectedBounds: DirtyTileRect;
  readonly visibleTiles: readonly DirtyTilePrefetchEntry[];
  readonly prefetchTiles: readonly DirtyTilePrefetchEntry[];
  readonly orderedTiles: readonly DirtyTilePrefetchEntry[];
  readonly protectedTileKeys: ReadonlySet<string>;
}

export type DirtyTileSwapReason =
  | "idle-offscreen"
  | "lru-capacity-limit"
  | "vram-pressure-soft"
  | "vram-pressure-critical";

export type DirtyTileSwapTarget = "opfs-cold-store" | "sleep-discard-clean";

export interface DirtyTileSwapDescriptor {
  readonly tileKey: string;
  readonly coord: DirtyTileCoordinate;
  /** 주입된 OPFS 스왑 어댑터가 사용할 결정론 상대 경로. */
  readonly opfsPath: string;
  readonly target: DirtyTileSwapTarget;
  readonly reason: DirtyTileSwapReason;
  readonly coreRect: DirtyTileRect;
  readonly apronRect: DirtyTileRect;
  readonly byteSize: number;
  readonly revision: number;
  readonly idleDurationMs: number;
  readonly lastUsedAtMs: number;
  readonly requiresPersist: boolean;
}

export interface DirtyTileSwapInDescriptor {
  readonly tileKey: string;
  readonly coord: DirtyTileCoordinate;
  readonly opfsPath: string;
  readonly revision: number;
  readonly byteSize: number;
}

export interface OffscreenIdleTileCandidate {
  readonly tileKey: string;
  readonly coord: DirtyTileCoordinate;
  readonly coreRect: DirtyTileRect;
  readonly apronRect: DirtyTileRect;
  readonly byteSize: number;
  readonly revision: number;
  readonly persistedRevision: number;
  readonly dirty: boolean;
  readonly pinned: boolean;
  readonly lastUsedAtMs: number;
  readonly lastAccessSeq?: number;
}

export interface EvictIdleOffscreenTilesInput {
  readonly tiles: readonly OffscreenIdleTileCandidate[];
  readonly protectedTileKeys: ReadonlySet<string>;
  readonly nowMs: number;
  readonly idleThresholdMs?: number;
  readonly maxEvictions?: number;
  readonly targetMaxResidentTiles?: number;
  readonly reason?: DirtyTileSwapReason;
}

function buildNormalizedCutBands(
  canvas: DirtyTileCanvasDimensions,
  viewport: DirtyTileRect,
  tileSizePx: number,
  cuts?: readonly DirtyTileCutBand[],
): readonly { readonly cutId: string; readonly rect: DirtyTileRect }[] {
  if (cuts && cuts.length > 0) {
    return cuts
      .map((cut) => ({
        cutId: cut.cutId,
        rect: clampRectToBounds(
          {
            x: cut.x ?? 0,
            y: cut.y,
            width: cut.width ?? canvas.width,
            height: cut.height,
          },
          canvas.width,
          canvas.height,
        ),
      }))
      .filter((entry) => entry.rect.width > 0 && entry.rect.height > 0)
      .sort((left, right) => left.rect.y - right.rect.y || left.cutId.localeCompare(right.cutId));
  }

  const bandHeight = Math.max(tileSizePx * 4, Math.ceil(viewport.height || tileSizePx * 4));
  const synthetic: { readonly cutId: string; readonly rect: DirtyTileRect }[] = [];
  for (let y = 0, index = 0; y < canvas.height; y += bandHeight, index += 1) {
    synthetic.push({
      cutId: `band-${index}`,
      rect: Object.freeze({
        x: 0,
        y,
        width: canvas.width,
        height: Math.min(bandHeight, canvas.height - y),
      }),
    });
  }
  return synthetic;
}

function collectTilesCoveringRect(
  rect: DirtyTileRect,
  canvas: DirtyTileCanvasDimensions,
  mipLevel: number,
  tileSizePx: number,
  apronPx: number,
): readonly TileApronBounds[] {
  if (rect.width <= 0 || rect.height <= 0) return [];
  const mipScale = 2 ** mipLevel;
  const mipWidth = Math.max(1, Math.ceil(canvas.width / mipScale));
  const mipHeight = Math.max(1, Math.ceil(canvas.height / mipScale));

  const minX = Math.max(0, Math.floor(rect.x / mipScale));
  const minY = Math.max(0, Math.floor(rect.y / mipScale));
  const maxX = Math.min(mipWidth, Math.ceil((rect.x + rect.width) / mipScale));
  const maxY = Math.min(mipHeight, Math.ceil((rect.y + rect.height) / mipScale));
  if (maxX <= minX || maxY <= minY) return [];

  const startCol = Math.floor(minX / tileSizePx);
  const endCol = Math.floor((maxX - 1) / tileSizePx);
  const startRow = Math.floor(minY / tileSizePx);
  const endRow = Math.floor((maxY - 1) / tileSizePx);

  const boundsList: TileApronBounds[] = [];
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const bounds = computeTileApronBounds({
        col,
        row,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        tileSizePx,
        apronPx,
        mipLevel,
      });
      if (!bounds.isEmpty) {
        boundsList.push(bounds);
      }
    }
  }
  return boundsList;
}

/**
 * 800×20,000px 세로 스크롤 원고 기준 현재 가시 컷 ±1컷 타일 우선 상주 계획을 산출한다.
 */
export function planVisibleCutTilePrefetch(
  input: PlanVisibleCutTilePrefetchInput,
): VisibleCutPrefetchPlan {
  const canvas: DirtyTileCanvasDimensions = {
    width: sanitizePositiveInt(input.canvas.width, WEBGPU_DIRTY_TILE_SIZE_PX),
    height: sanitizePositiveInt(input.canvas.height, WEBGPU_DIRTY_TILE_SIZE_PX),
  };
  const layerId = input.layerId?.trim() || "base";
  const mipLevel = sanitizeNonNegativeInt(input.mipLevel, 0);
  const tileSizePx = sanitizePositiveInt(input.tileSizePx, WEBGPU_DIRTY_TILE_SIZE_PX);
  const apronPx = sanitizeNonNegativeInt(input.apronPx, WEBGPU_DIRTY_TILE_APRON_PX);
  const cutMargin = sanitizeNonNegativeInt(input.cutMargin, 1);
  const scrollVelocityY =
    input.scrollVelocityY !== undefined && Number.isFinite(input.scrollVelocityY)
      ? input.scrollVelocityY
      : 0;

  const visibleBounds = clampRectToBounds(input.viewport, canvas.width, canvas.height);
  const bands = buildNormalizedCutBands(canvas, visibleBounds, tileSizePx, input.cuts);

  const visibleBandIndices: number[] = [];
  for (let index = 0; index < bands.length; index += 1) {
    if (intersectRects(bands[index].rect, visibleBounds) !== null) {
      visibleBandIndices.push(index);
    }
  }

  // 뷰포트가 컷 사이 여백(gutter)에 걸린 경우 가장 가까운 컷을 앵커로 선택한다.
  if (visibleBandIndices.length === 0 && bands.length > 0) {
    const viewCenterY = visibleBounds.y + visibleBounds.height * 0.5;
    let nearestIndex = 0;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (let index = 0; index < bands.length; index += 1) {
      const bandCenterY = bands[index].rect.y + bands[index].rect.height * 0.5;
      const dist = Math.abs(bandCenterY - viewCenterY);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIndex = index;
      }
    }
    visibleBandIndices.push(nearestIndex);
  }

  const firstVisibleIdx = visibleBandIndices.length > 0 ? visibleBandIndices[0] : -1;
  const lastVisibleIdx =
    visibleBandIndices.length > 0 ? visibleBandIndices[visibleBandIndices.length - 1] : -1;
  const prefetchStartIdx = firstVisibleIdx >= 0 ? Math.max(0, firstVisibleIdx - cutMargin) : -1;
  const prefetchEndIdx =
    lastVisibleIdx >= 0 ? Math.min(bands.length - 1, lastVisibleIdx + cutMargin) : -1;

  const visibleCutIds: string[] = [];
  const prefetchCutIds: string[] = [];
  const visibleMap = new Map<string, DirtyTilePrefetchEntry>();
  const prefetchMap = new Map<string, DirtyTilePrefetchEntry>();
  let protectedBounds: DirtyTileRect = visibleBounds;

  const addEntry = (
    target: Map<string, DirtyTilePrefetchEntry>,
    bounds: TileApronBounds,
    priority: DirtyTilePrefetchPriority,
    cutId: string | null,
  ) => {
    const coord: DirtyTileCoordinate = Object.freeze({
      layerId,
      mipLevel,
      col: bounds.col,
      row: bounds.row,
    });
    const key = formatDirtyTileKey(coord);
    if (visibleMap.has(key) || target.has(key)) return;
    target.set(
      key,
      Object.freeze({
        key,
        coord,
        priority,
        cutId,
        distancePx: distanceToViewportCenter(bounds.canvasCoreRect, visibleBounds),
        coreRect: bounds.coreRect,
        apronRect: bounds.apronRect,
      }),
    );
  };

  for (const bounds of collectTilesCoveringRect(
    visibleBounds,
    canvas,
    mipLevel,
    tileSizePx,
    apronPx,
  )) {
    const ownerBand = bands.find((band) => intersectRects(band.rect, bounds.canvasCoreRect) !== null);
    addEntry(visibleMap, bounds, "visible", ownerBand?.cutId ?? null);
  }

  for (const idx of visibleBandIndices) {
    const band = bands[idx];
    visibleCutIds.push(band.cutId);
    protectedBounds = unionRects(protectedBounds, band.rect);
    for (const bounds of collectTilesCoveringRect(band.rect, canvas, mipLevel, tileSizePx, apronPx)) {
      addEntry(visibleMap, bounds, "visible", band.cutId);
    }
  }

  if (prefetchStartIdx >= 0 && prefetchEndIdx >= 0) {
    for (let idx = prefetchStartIdx; idx <= prefetchEndIdx; idx += 1) {
      if (idx >= firstVisibleIdx && idx <= lastVisibleIdx) continue;
      const band = bands[idx];
      prefetchCutIds.push(band.cutId);
      protectedBounds = unionRects(protectedBounds, band.rect);
      for (const bounds of collectTilesCoveringRect(
        band.rect,
        canvas,
        mipLevel,
        tileSizePx,
        apronPx,
      )) {
        addEntry(prefetchMap, bounds, "prefetch-adjacent", band.cutId);
      }
    }
  }

  const visibleCenterY = visibleBounds.y + visibleBounds.height * 0.5;
  const visibleTiles = [...visibleMap.values()].sort(
    (left, right) =>
      left.distancePx - right.distancePx ||
      left.coord.row - right.coord.row ||
      left.coord.col - right.coord.col,
  );

  const prefetchTiles = [...prefetchMap.values()].sort((left, right) => {
    if (scrollVelocityY !== 0) {
      const scale = 2 ** mipLevel;
      const leftCenterY = (left.coreRect.y + left.coreRect.height * 0.5) * scale;
      const rightCenterY = (right.coreRect.y + right.coreRect.height * 0.5) * scale;
      const leftAhead =
        scrollVelocityY > 0 ? leftCenterY >= visibleCenterY : leftCenterY <= visibleCenterY;
      const rightAhead =
        scrollVelocityY > 0 ? rightCenterY >= visibleCenterY : rightCenterY <= visibleCenterY;
      if (leftAhead !== rightAhead) return leftAhead ? -1 : 1;
    }
    return (
      left.distancePx - right.distancePx ||
      left.coord.row - right.coord.row ||
      left.coord.col - right.coord.col
    );
  });

  const combined = [...visibleTiles, ...prefetchTiles];
  const maxPrefetch =
    input.maxPrefetchTiles !== undefined && Number.isFinite(input.maxPrefetchTiles)
      ? Math.max(0, Math.floor(input.maxPrefetchTiles))
      : combined.length;
  const orderedTiles = combined.slice(0, maxPrefetch);
  const protectedTileKeys = new Set<string>();
  for (const tile of combined) {
    protectedTileKeys.add(tile.key);
  }

  return Object.freeze({
    mipLevel,
    visibleCutIds: Object.freeze(visibleCutIds),
    prefetchCutIds: Object.freeze(prefetchCutIds),
    protectedCutIds: Object.freeze([...visibleCutIds, ...prefetchCutIds]),
    visibleBounds,
    protectedBounds,
    visibleTiles: Object.freeze(visibleTiles),
    prefetchTiles: Object.freeze(prefetchTiles),
    orderedTiles: Object.freeze(orderedTiles),
    protectedTileKeys,
  });
}

/**
 * 비가시 유휴 타일에서 OPFS/슬립 스왑 디스크립터를 산출하는 순수 스케줄러.
 *
 * - `protectedTileKeys`(가시 컷 ±1컷)와 `pinned` 타일은 절대 퇴거하지 않는다.
 * - 유휴 시간(`idleThresholdMs`) 이상 경과한 비가시 타일을 오래된 LRU 순으로 먼저 퇴거하며,
 *   `targetMaxResidentTiles` 초과 시 추가 비가시 타일을 LRU 순으로 정리한다.
 */
export function evictIdleOffscreenTiles(
  input: EvictIdleOffscreenTilesInput,
): readonly DirtyTileSwapDescriptor[] {
  const idleThresholdMs = sanitizeNonNegativeInt(
    input.idleThresholdMs,
    WEBGPU_DIRTY_TILE_DEFAULT_IDLE_EVICT_MS,
  );
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : 0;
  const maxEvictions =
    input.maxEvictions !== undefined && Number.isFinite(input.maxEvictions)
      ? Math.max(0, Math.floor(input.maxEvictions))
      : Number.POSITIVE_INFINITY;
  const baseReason: DirtyTileSwapReason = input.reason ?? "idle-offscreen";

  const unprotected = input.tiles
    .filter((tile) => !tile.pinned && !input.protectedTileKeys.has(tile.tileKey))
    .sort(
      (left, right) =>
        left.lastUsedAtMs - right.lastUsedAtMs ||
        (left.lastAccessSeq ?? 0) - (right.lastAccessSeq ?? 0) ||
        left.tileKey.localeCompare(right.tileKey),
    );

  const descriptors: DirtyTileSwapDescriptor[] = [];
  const emittedKeys = new Set<string>();

  const emit = (tile: OffscreenIdleTileCandidate, reason: DirtyTileSwapReason) => {
    const idleDurationMs = Math.max(0, nowMs - tile.lastUsedAtMs);
    const requiresPersist = tile.dirty || tile.revision > tile.persistedRevision;
    emittedKeys.add(tile.tileKey);
    descriptors.push(
      Object.freeze({
        tileKey: tile.tileKey,
        coord: tile.coord,
        opfsPath: buildOpfsTilePath(tile.coord, tile.revision),
        target: requiresPersist ? "opfs-cold-store" : "sleep-discard-clean",
        reason,
        coreRect: tile.coreRect,
        apronRect: tile.apronRect,
        byteSize: tile.byteSize,
        revision: tile.revision,
        idleDurationMs,
        lastUsedAtMs: tile.lastUsedAtMs,
        requiresPersist,
      }),
    );
  };

  for (const tile of unprotected) {
    if (descriptors.length >= maxEvictions) break;
    if (nowMs - tile.lastUsedAtMs >= idleThresholdMs) {
      emit(tile, baseReason);
    }
  }

  if (
    input.targetMaxResidentTiles !== undefined &&
    Number.isFinite(input.targetMaxResidentTiles)
  ) {
    const targetCap = Math.max(0, Math.floor(input.targetMaxResidentTiles));
    let remainingResident = input.tiles.length - descriptors.length;
    for (const tile of unprotected) {
      if (remainingResident <= targetCap || descriptors.length >= maxEvictions) break;
      if (emittedKeys.has(tile.tileKey)) continue;
      emit(tile, "lru-capacity-limit");
      remainingResident -= 1;
    }
  }

  return Object.freeze(descriptors);
}
