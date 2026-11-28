/**
 * Wave 140 — VRAM 타일 캐시 스냅샷·페이지 테이블·SLRU 축출 선택 순수 헬퍼.
 */

import {
  clampTileMipLevel,
  computeMipGridDimensions,
  encodeTileKey,
  type MultiPageCanvasSpec,
  type TileKey,
  type TileKeyId,
  type TileMipLevel,
  type TilePriorityClass,
  type ViewportTilePrefetchPlan,
} from "./tile-pyramid-and-prefetch";
import type {
  AtlasSlotLocation,
  CacheSegment,
  IndirectionTableEntrySnapshot,
  ResidentTileEntry,
  TileVisualSnapshotCell,
  TileVisualState,
} from "./vram-tile-cache-types";

export interface MutableResidentTileEntry {
  readonly key: TileKey;
  readonly keyId: TileKeyId;
  readonly atlasSlot: AtlasSlotLocation;
  readonly byteSize: number;
  segment: CacheSegment;
  pinnedVisible: boolean;
  pinnedDirty: boolean;
  priorityClass: TilePriorityClass;
  lastPriorityScore: number;
  readonly insertedFrame: number;
  lastTouchedFrame: number;
  hitCount: number;
}

/** 가변 캐시 엔트리를 불변 공개 스냅샷으로 변환한다. */
export function toReadonlyResidentEntry(found: MutableResidentTileEntry): ResidentTileEntry {
  return {
    key: found.key,
    keyId: found.keyId,
    atlasSlot: found.atlasSlot,
    byteSize: found.byteSize,
    segment: found.segment,
    pinnedVisible: found.pinnedVisible,
    pinnedDirty: found.pinnedDirty,
    priorityClass: found.priorityClass,
    lastPriorityScore: found.lastPriorityScore,
    insertedFrame: found.insertedFrame,
    lastTouchedFrame: found.lastTouchedFrame,
    hitCount: found.hitCount,
  };
}

/** 선형 아틀라스 슬롯 인덱스를 `(layerIndex, slotX, slotY)` 좌표로 복원한다. */
export function decodeAtlasSlotLocation(
  slotIndex: number,
  slotsPerRow: number,
  slotsPerCol: number,
): AtlasSlotLocation {
  const slotsPerLayer = slotsPerRow * slotsPerCol;
  const layerIndex = Math.floor(slotIndex / slotsPerLayer);
  const inLayer = slotIndex % slotsPerLayer;
  return {
    slotIndex,
    layerIndex,
    slotX: inLayer % slotsPerRow,
    slotY: Math.floor(inLayer / slotsPerRow),
  };
}

/**
 * 비가시·비Dirty 후보 가운데 SLRU 우선순위가 가장 낮은 축출 대상 1건을 결정론적으로 고른다.
 *
 * 우선순위: `probation` 우선 → 최상위 MIP 폴백 앵커 보존 → 오래된 `lastTouchedFrame` → 낮은 점수 → 사전순 키.
 */
export function selectSlruEvictionVictim(
  entries: ReadonlyMap<TileKeyId, MutableResidentTileEntry>,
  maxMipLevel: TileMipLevel,
  preserveCoarseAnchors: boolean,
): MutableResidentTileEntry | null {
  let victim: MutableResidentTileEntry | null = null;
  entries.forEach((candidate) => {
    if (candidate.pinnedVisible || candidate.pinnedDirty) return;
    if (victim === null || isBetterEvictionVictim(candidate, victim, maxMipLevel, preserveCoarseAnchors)) {
      victim = candidate;
    }
  });
  return victim;
}

function isBetterEvictionVictim(
  candidate: MutableResidentTileEntry,
  current: MutableResidentTileEntry,
  maxMipLevel: TileMipLevel,
  preserveCoarseAnchors: boolean,
): boolean {
  if (candidate.segment !== current.segment) return candidate.segment === "probation";
  if (preserveCoarseAnchors) {
    const candCoarse = candidate.key.mipLevel === maxMipLevel;
    const currCoarse = current.key.mipLevel === maxMipLevel;
    if (candCoarse !== currCoarse) return !candCoarse;
  }
  if (candidate.lastTouchedFrame !== current.lastTouchedFrame) {
    return candidate.lastTouchedFrame < current.lastTouchedFrame;
  }
  if (candidate.lastPriorityScore !== current.lastPriorityScore) {
    return candidate.lastPriorityScore < current.lastPriorityScore;
  }
  return candidate.keyId < current.keyId;
}

/** 현재 프레임 기준 SVG 히트맵용 타일 상태 셀 스냅샷을 구성한다. */
export function captureTileVisualSnapshotFromCache(params: {
  readonly entries: ReadonlyMap<TileKeyId, MutableResidentTileEntry>;
  readonly lastPlan: ViewportTilePrefetchPlan | null;
  readonly lastFallbackKeyIds: ReadonlySet<TileKeyId>;
  readonly lastEvictedKeys: readonly TileKeyId[];
  readonly maxCells: number;
}): readonly TileVisualSnapshotCell[] {
  const { entries, lastPlan, lastFallbackKeyIds, lastEvictedKeys, maxCells } = params;
  const cells: TileVisualSnapshotCell[] = [];
  const seen = new Set<TileKeyId>();

  if (lastPlan) {
    for (let i = 0; i < lastPlan.entries.length && cells.length < maxCells; i += 1) {
      const req = lastPlan.entries[i];
      if (seen.has(req.keyId)) continue;
      seen.add(req.keyId);
      const resident = entries.get(req.keyId);
      let state: TileVisualState;
      if (resident?.pinnedDirty) {
        state = "pinned-dirty";
      } else if (req.priorityClass === "visible-critical") {
        if (resident) state = "visible-hit";
        else if (lastFallbackKeyIds.has(req.keyId)) state = "coarse-fallback";
        else state = "blank-miss";
      } else if (req.priorityClass === "coarse-mip-fallback") {
        state = "coarse-fallback";
      } else {
        state = resident ? "predictive-prefetch" : "evicted";
      }
      cells.push({
        keyId: req.keyId,
        pageIndex: req.key.pageIndex,
        mipLevel: req.key.mipLevel,
        tx: req.key.tx,
        ty: req.key.ty,
        state,
      });
    }
  }

  entries.forEach((entry) => {
    if (cells.length >= maxCells || seen.has(entry.keyId) || !entry.pinnedDirty) return;
    seen.add(entry.keyId);
    cells.push({
      keyId: entry.keyId,
      pageIndex: entry.key.pageIndex,
      mipLevel: entry.key.mipLevel,
      tx: entry.key.tx,
      ty: entry.key.ty,
      state: "pinned-dirty",
    });
  });

  for (let i = 0; i < lastEvictedKeys.length && cells.length < maxCells; i += 1) {
    const keyId = lastEvictedKeys[i];
    if (seen.has(keyId)) continue;
    seen.add(keyId);
    const match = /^p(\d+):m([0-4]):x(\d+):y(\d+)$/.exec(keyId);
    if (!match) continue;
    cells.push({
      keyId,
      pageIndex: Number(match[1]),
      mipLevel: clampTileMipLevel(Number(match[2])),
      tx: Number(match[3]),
      ty: Number(match[4]),
      state: "evicted",
    });
  }

  return cells;
}

/** 지정 페이지의 WebGPU 페이지 테이블(Indirection Buffer) 스냅샷을 빌드한다. */
export function buildIndirectionTableFromCache(
  spec: MultiPageCanvasSpec,
  entries: ReadonlyMap<TileKeyId, MutableResidentTileEntry>,
  pageIndex: number,
): readonly IndirectionTableEntrySnapshot[] {
  const page = spec.pages[pageIndex];
  if (!page) return [];
  const rows: IndirectionTableEntrySnapshot[] = [];
  for (let mip = 0; mip <= spec.maxMipLevel; mip += 1) {
    const typedMip = clampTileMipLevel(mip, spec.maxMipLevel);
    const grid = computeMipGridDimensions(page, typedMip, spec.tileSizePx);
    for (let ty = 0; ty < grid.tilesY; ty += 1) {
      for (let tx = 0; tx < grid.tilesX; tx += 1) {
        const keyId = encodeTileKey({ pageIndex: page.pageIndex, mipLevel: typedMip, tx, ty });
        const entry = entries.get(keyId);
        rows.push({
          keyId,
          resident: entry !== undefined,
          atlasSlotIndex: entry ? entry.atlasSlot.slotIndex : 0,
          mipLevel: typedMip,
          dirty: entry ? entry.pinnedDirty : false,
        });
      }
    }
  }
  return rows;
}
