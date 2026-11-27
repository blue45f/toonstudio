/**
 * Wasm64 Wave 33: 256×256 더티 타일 분할, 32-bit Morton Z-order 정렬·중복 제거,
 * WebGPU `dispatchWorkgroupsIndirect` 간접 디스패치 및 256-byte 정렬 스테이징 링 버퍼 할당기.
 */

export const WEBGPU_DIRTY_TILE_SIZE_PX = 256 as const;
export const WEBGPU_BUFFER_ALIGNMENT_BYTES = 256 as const;
export const WEBGPU_DEFAULT_WORKGROUP_SIZE_XY = 8 as const;
export const MAX_MORTON_TILE_COORD = 0xffff as const;
export const INDIRECT_DISPATCH_U32_LENGTH = 3 as const;

export type LayerBlendMode = "add" | "multiply" | "normal" | "screen";
export type StagingRingOverflowReason =
  | "INVALID_REQUEST_SIZE"
  | "RING_CAPACITY_EXCEEDED"
  | "VRAM_BUDGET_EXCEEDED";

export interface MortonTileCoord {
  readonly tileX: number;
  readonly tileY: number;
}

export interface DirtyTilePixelBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StrokeDirtyRectInput {
  readonly layerId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly blendMode?: LayerBlendMode;
}

export interface MortonDirtyTileEntry {
  readonly layerId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly mortonCode: number;
  readonly pixelBounds: DirtyTilePixelBounds;
  readonly sourceRectHitCount: number;
}

export interface CoalescedDirtyTileSpan {
  readonly layerId: string;
  readonly tileY: number;
  readonly startTileX: number;
  readonly endTileX: number;
  readonly tileCount: number;
  readonly mortonCodes: readonly number[];
  readonly pixelBounds: DirtyTilePixelBounds;
}

export interface StagingRingSliceRecord {
  readonly fenceSeq: number;
  readonly offsetBytes: number;
  readonly requestedByteLength: number;
  readonly alignedByteLength: number;
  readonly paddingBeforeBytes: number;
  readonly wrappedAround: boolean;
}

export interface StagingRingBufferState {
  readonly capacityBytes: number;
  readonly vramBudgetBytes: number;
  readonly headOffsetBytes: number;
  readonly tailOffsetBytes: number;
  readonly inFlightBytes: number;
  readonly reservedSpanBytes: number;
  readonly wrapAroundCount: number;
  readonly nextFenceSeq: number;
  readonly inFlightSlices: readonly StagingRingSliceRecord[];
}

export type StagingRingAllocationResult =
  | { readonly ok: true; readonly slice: StagingRingSliceRecord; readonly nextState: StagingRingBufferState }
  | {
      readonly ok: false;
      readonly reason: StagingRingOverflowReason;
      readonly requestedByteLength: number;
      readonly alignedByteLength: number;
      readonly availableVramBudgetBytes: number;
      readonly nextState: StagingRingBufferState;
    };

export interface LayerDirtyTileDispatchPlan {
  readonly layerId: string;
  readonly blendMode: LayerBlendMode;
  readonly rawTileHitCount: number;
  readonly uniqueTileCount: number;
  readonly deduplicatedTileCount: number;
  readonly tiles: readonly MortonDirtyTileEntry[];
  readonly coalescedSpans: readonly CoalescedDirtyTileSpan[];
  readonly indirectDispatchArgs: Uint32Array;
  readonly uniformStagingSlice: StagingRingSliceRecord | null;
  readonly pixelStagingSlice: StagingRingSliceRecord | null;
}

export interface DirtyTileCompositePlanOptions {
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly dirtyRects: readonly StrokeDirtyRectInput[];
  readonly tileSizePx?: number;
  readonly workgroupSizeX?: number;
  readonly workgroupSizeY?: number;
  readonly bytesPerPixel?: number;
  readonly stagingRing?: StagingRingBufferState;
  readonly ringCapacityBytes?: number;
  readonly vramBudgetBytes?: number;
}

export interface DirtyTileCompositePlanResult {
  readonly ok: boolean;
  readonly overflowReason: StagingRingOverflowReason | null;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly tileSizePx: number;
  readonly gridColumns: number;
  readonly gridRows: number;
  readonly totalUniqueDirtyTiles: number;
  readonly totalDeduplicatedTiles: number;
  readonly totalCoalescedSpans: number;
  readonly combinedIndirectDispatchArgs: Uint32Array;
  readonly layerPlans: readonly LayerDirtyTileDispatchPlan[];
  readonly stagingRingState: StagingRingBufferState;
}

function clampMortonAxis16(coord: number): number {
  if (!Number.isFinite(coord)) return 0;
  return Math.max(0, Math.min(MAX_MORTON_TILE_COORD, Math.floor(coord))) >>> 0;
}

function part1By1(coord16: number): number {
  let x = (coord16 & MAX_MORTON_TILE_COORD) >>> 0;
  x = ((x | (x << 8)) & 0x00ff00ff) >>> 0;
  x = ((x | (x << 4)) & 0x0f0f0f0f) >>> 0;
  x = ((x | (x << 2)) & 0x33333333) >>> 0;
  x = ((x | (x << 1)) & 0x55555555) >>> 0;
  return x >>> 0;
}

function compact1By1(interleaved: number): number {
  let x = (interleaved & 0x55555555) >>> 0;
  x = ((x ^ (x >>> 1)) & 0x33333333) >>> 0;
  x = ((x ^ (x >>> 2)) & 0x0f0f0f0f) >>> 0;
  x = ((x ^ (x >>> 4)) & 0x00ff00ff) >>> 0;
  x = ((x ^ (x >>> 8)) & 0x0000ffff) >>> 0;
  return x >>> 0;
}

/** 16-bit 타일 격자 좌표 `(tileX, tileY)`를 부호 없는 32-bit Morton Z-order 코드로 인코딩한다. */
export function encodeMorton2D(tileX: number, tileY: number): number {
  return (part1By1(clampMortonAxis16(tileX)) | ((part1By1(clampMortonAxis16(tileY)) << 1) >>> 0)) >>> 0;
}

/** 부호 없는 32-bit Morton Z-order 코드를 원래 타일 좌표 `(tileX, tileY)`로 복원한다. */
export function decodeMorton2D(mortonCode: number): MortonTileCoord {
  const safeCode = Number.isFinite(mortonCode) ? mortonCode >>> 0 : 0;
  return { tileX: compact1By1(safeCode), tileY: compact1By1(safeCode >>> 1) };
}

/** 요청 바이트 길이를 WebGPU 표준 256-byte 경계(`minUniformBufferOffsetAlignment`)로 올림 정렬한다. */
export function alignToWebGpu256(byteLength: number): number {
  if (!Number.isFinite(byteLength) || byteLength <= 0) return 0;
  return Math.ceil(Math.ceil(byteLength) / WEBGPU_BUFFER_ALIGNMENT_BYTES) * WEBGPU_BUFFER_ALIGNMENT_BYTES;
}

function alignDownToWebGpu256(byteLength: number): number {
  if (!Number.isFinite(byteLength) || byteLength < WEBGPU_BUFFER_ALIGNMENT_BYTES) return WEBGPU_BUFFER_ALIGNMENT_BYTES;
  return Math.floor(byteLength / WEBGPU_BUFFER_ALIGNMENT_BYTES) * WEBGPU_BUFFER_ALIGNMENT_BYTES;
}

/** 활성 더티 타일 개수와 타일·워크그룹 크기로부터 WebGPU `dispatchWorkgroupsIndirect`(`Uint32Array(3)`)를 생성한다. */
export function computeIndirectDispatchArgs(
  activeTileCount: number,
  tileSizePx: number = WEBGPU_DIRTY_TILE_SIZE_PX,
  workgroupSizeX: number = WEBGPU_DEFAULT_WORKGROUP_SIZE_XY,
  workgroupSizeY: number = WEBGPU_DEFAULT_WORKGROUP_SIZE_XY,
): Uint32Array {
  const safeTileCount = Math.max(0, Math.floor(activeTileCount));
  if (safeTileCount === 0) return new Uint32Array([0, 0, 0]);
  const safeTilePx = Math.max(1, Math.floor(tileSizePx));
  return new Uint32Array([
    Math.ceil(safeTilePx / Math.max(1, Math.floor(workgroupSizeX))),
    Math.ceil(safeTilePx / Math.max(1, Math.floor(workgroupSizeY))),
    safeTileCount,
  ]);
}

/** 256-byte 정렬 스테이징 링 버퍼 초기 상태를 만든다. */
export function createStagingRingBufferState(capacityBytes: number, vramBudgetBytes?: number): StagingRingBufferState {
  const alignedCapacity = alignDownToWebGpu256(capacityBytes);
  const resolvedBudget =
    vramBudgetBytes === undefined
      ? alignedCapacity
      : Math.max(0, Math.min(alignedCapacity, Math.floor(vramBudgetBytes)));
  return {
    capacityBytes: alignedCapacity,
    vramBudgetBytes: resolvedBudget,
    headOffsetBytes: 0,
    tailOffsetBytes: 0,
    inFlightBytes: 0,
    reservedSpanBytes: 0,
    wrapAroundCount: 0,
    nextFenceSeq: 1,
    inFlightSlices: [],
  };
}

function failStagingAllocation(
  reason: StagingRingOverflowReason,
  requestedByteLength: number,
  alignedByteLength: number,
  availableVramBudgetBytes: number,
  nextState: StagingRingBufferState,
): StagingRingAllocationResult {
  return { ok: false, reason, requestedByteLength, alignedByteLength, availableVramBudgetBytes, nextState };
}

/**
 * 스테이징 링 버퍼에서 256-byte 정렬된 연속 슬라이스를 할당한다.
 * 끝단 여유 공간이 부족하면 오프셋 `0`으로 래핑하며, VRAM 예산 또는 링 용량을 넘으면 상태를 보존한 채 거부한다.
 */
export function allocateStagingRingSlice(
  state: StagingRingBufferState,
  requestedByteLength: number,
): StagingRingAllocationResult {
  const available = Math.max(0, state.vramBudgetBytes - state.inFlightBytes);
  if (!Number.isFinite(requestedByteLength) || requestedByteLength <= 0) {
    return failStagingAllocation("INVALID_REQUEST_SIZE", requestedByteLength, 0, available, state);
  }
  const aligned = alignToWebGpu256(requestedByteLength);
  if (state.inFlightBytes + aligned > state.vramBudgetBytes) {
    return failStagingAllocation("VRAM_BUDGET_EXCEEDED", requestedByteLength, aligned, available, state);
  }
  if (aligned > state.capacityBytes) {
    return failStagingAllocation("RING_CAPACITY_EXCEEDED", requestedByteLength, aligned, available, state);
  }

  let offsetBytes: number;
  let paddingBeforeBytes = 0;
  let wrappedAround = false;

  if (state.inFlightSlices.length === 0) {
    if (aligned <= state.capacityBytes - state.headOffsetBytes) {
      offsetBytes = state.headOffsetBytes;
    } else {
      offsetBytes = 0;
      wrappedAround = state.headOffsetBytes > 0;
    }
  } else if (state.headOffsetBytes > state.tailOffsetBytes) {
    const endSpace = state.capacityBytes - state.headOffsetBytes;
    if (aligned <= endSpace) {
      offsetBytes = state.headOffsetBytes;
    } else if (aligned <= state.tailOffsetBytes) {
      offsetBytes = 0;
      paddingBeforeBytes = endSpace;
      wrappedAround = true;
    } else {
      return failStagingAllocation("RING_CAPACITY_EXCEEDED", requestedByteLength, aligned, available, state);
    }
  } else if (aligned <= state.tailOffsetBytes - state.headOffsetBytes) {
    offsetBytes = state.headOffsetBytes;
  } else {
    return failStagingAllocation("RING_CAPACITY_EXCEEDED", requestedByteLength, aligned, available, state);
  }

  const slice: StagingRingSliceRecord = {
    fenceSeq: state.nextFenceSeq,
    offsetBytes,
    requestedByteLength: Math.ceil(requestedByteLength),
    alignedByteLength: aligned,
    paddingBeforeBytes,
    wrappedAround,
  };
  const nextSlices = [...state.inFlightSlices, slice];
  const nextReservedSpan =
    state.inFlightSlices.length === 0 ? aligned : state.reservedSpanBytes + paddingBeforeBytes + aligned;

  return {
    ok: true,
    slice,
    nextState: {
      capacityBytes: state.capacityBytes,
      vramBudgetBytes: state.vramBudgetBytes,
      headOffsetBytes: offsetBytes + aligned,
      tailOffsetBytes: nextSlices[0]?.offsetBytes ?? offsetBytes,
      inFlightBytes: state.inFlightBytes + aligned,
      reservedSpanBytes: nextReservedSpan,
      wrapAroundCount: state.wrapAroundCount + (wrappedAround ? 1 : 0),
      nextFenceSeq: state.nextFenceSeq + 1,
      inFlightSlices: nextSlices,
    },
  };
}

/** GPU 큐 제출 완료 펜스(`completedUpToFenceSeq`) 이하의 슬라이스와 래핑 꼬리 패딩을 회수한다. */
export function reclaimCompletedStagingSlices(
  state: StagingRingBufferState,
  completedUpToFenceSeq: number,
): StagingRingBufferState {
  if (state.inFlightSlices.length === 0) return state;
  const remaining = state.inFlightSlices.filter((s) => s.fenceSeq > completedUpToFenceSeq);
  if (remaining.length === state.inFlightSlices.length) return state;
  if (remaining.length === 0) {
    const cursor = state.headOffsetBytes === state.capacityBytes ? 0 : state.headOffsetBytes;
    return { ...state, tailOffsetBytes: cursor, headOffsetBytes: cursor, inFlightBytes: 0, reservedSpanBytes: 0, inFlightSlices: [] };
  }

  const normalized = remaining.map((s, idx) => (idx === 0 && s.paddingBeforeBytes !== 0 ? { ...s, paddingBeforeBytes: 0 } : s));
  let inFlightBytes = 0;
  let reservedSpanBytes = 0;
  for (const s of normalized) {
    inFlightBytes += s.alignedByteLength;
    reservedSpanBytes += s.alignedByteLength + s.paddingBeforeBytes;
  }
  return { ...state, tailOffsetBytes: normalized[0]?.offsetBytes ?? 0, inFlightBytes, reservedSpanBytes, inFlightSlices: normalized };
}

function computeTilePixelBounds(
  tileX: number,
  tileY: number,
  tileSizePx: number,
  canvasWidthPx: number,
  canvasHeightPx: number,
): DirtyTilePixelBounds {
  const x = tileX * tileSizePx;
  const y = tileY * tileSizePx;
  return {
    x,
    y,
    width: Math.max(0, Math.min(canvasWidthPx, x + tileSizePx) - x),
    height: Math.max(0, Math.min(canvasHeightPx, y + tileSizePx) - y),
  };
}

/** 같은 레이어 안에서 같은 행(`tileY`)에 가로로 맞닿은 더티 타일들을 연속 업로드 스팬으로 병합한다. */
export function coalesceLayerDirtyTiles(
  tiles: readonly MortonDirtyTileEntry[],
  canvasWidthPx: number,
  canvasHeightPx: number,
  tileSizePx: number = WEBGPU_DIRTY_TILE_SIZE_PX,
): readonly CoalescedDirtyTileSpan[] {
  if (tiles.length === 0) return [];
  const rowSorted = [...tiles].sort((a, b) => (a.tileY !== b.tileY ? a.tileY - b.tileY : a.tileX - b.tileX));
  const first = rowSorted[0];
  if (!first) return [];

  const spans: CoalescedDirtyTileSpan[] = [];
  let currentStart = first;
  let currentEndX = first.tileX;
  let currentCodes: number[] = [first.mortonCode];

  const flushSpan = (startEntry: MortonDirtyTileEntry, endTileX: number, codes: number[]): void => {
    const x = startEntry.tileX * tileSizePx;
    const y = startEntry.tileY * tileSizePx;
    spans.push({
      layerId: startEntry.layerId,
      tileY: startEntry.tileY,
      startTileX: startEntry.tileX,
      endTileX,
      tileCount: endTileX - startEntry.tileX + 1,
      mortonCodes: codes,
      pixelBounds: {
        x,
        y,
        width: Math.max(0, Math.min(canvasWidthPx, (endTileX + 1) * tileSizePx) - x),
        height: Math.max(0, Math.min(canvasHeightPx, (startEntry.tileY + 1) * tileSizePx) - y),
      },
    });
  };

  for (let i = 1; i < rowSorted.length; i += 1) {
    const next = rowSorted[i];
    if (!next) continue;
    if (next.layerId === currentStart.layerId && next.tileY === currentStart.tileY && next.tileX === currentEndX + 1) {
      currentEndX = next.tileX;
      currentCodes.push(next.mortonCode);
    } else {
      flushSpan(currentStart, currentEndX, currentCodes);
      currentStart = next;
      currentEndX = next.tileX;
      currentCodes = [next.mortonCode];
    }
  }
  flushSpan(currentStart, currentEndX, currentCodes);
  return spans;
}

/** 다중 레이어 스트로크 더티 사각형 목록으로부터 Morton Z-order 타일 합성 계획과 간접 디스패치·스테이징 할당을 생성한다. */
export function buildDirtyTileIndirectCompositePlan(
  options: DirtyTileCompositePlanOptions,
): DirtyTileCompositePlanResult {
  const canvasWidthPx = Math.max(1, Math.floor(options.canvasWidthPx));
  const canvasHeightPx = Math.max(1, Math.floor(options.canvasHeightPx));
  const tileSizePx = Math.max(1, Math.floor(options.tileSizePx ?? WEBGPU_DIRTY_TILE_SIZE_PX));
  const wgX = Math.max(1, Math.floor(options.workgroupSizeX ?? WEBGPU_DEFAULT_WORKGROUP_SIZE_XY));
  const wgY = Math.max(1, Math.floor(options.workgroupSizeY ?? WEBGPU_DEFAULT_WORKGROUP_SIZE_XY));
  const tileByteSize = alignToWebGpu256(tileSizePx * tileSizePx * Math.max(1, Math.floor(options.bytesPerPixel ?? 4)));
  const gridColumns = Math.ceil(canvasWidthPx / tileSizePx);
  const gridRows = Math.ceil(canvasHeightPx / tileSizePx);

  const defaultRingCap = Math.max(WEBGPU_BUFFER_ALIGNMENT_BYTES * 64, gridColumns * gridRows * tileByteSize);
  let ringState =
    options.stagingRing ?? createStagingRingBufferState(options.ringCapacityBytes ?? defaultRingCap, options.vramBudgetBytes);

  const layerOrder: string[] = [];
  const layerBlendModes = new Map<string, LayerBlendMode>();
  const layerTileHitMaps = new Map<string, Map<number, { tileX: number; tileY: number; hits: number }>>();
  const layerRawHits = new Map<string, number>();

  for (const rect of options.dirtyRects) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    const minX = Math.max(0, Math.min(canvasWidthPx, rect.x));
    const minY = Math.max(0, Math.min(canvasHeightPx, rect.y));
    const maxX = Math.max(0, Math.min(canvasWidthPx, rect.x + rect.width));
    const maxY = Math.max(0, Math.min(canvasHeightPx, rect.y + rect.height));
    if (maxX <= minX || maxY <= minY) continue;

    if (!layerTileHitMaps.has(rect.layerId)) {
      layerOrder.push(rect.layerId);
      layerTileHitMaps.set(rect.layerId, new Map());
      layerRawHits.set(rect.layerId, 0);
    }
    if (rect.blendMode) layerBlendModes.set(rect.layerId, rect.blendMode);

    const startTileX = Math.max(0, Math.floor(minX / tileSizePx));
    const endTileX = Math.min(gridColumns - 1, Math.ceil(maxX / tileSizePx) - 1);
    const startTileY = Math.max(0, Math.floor(minY / tileSizePx));
    const endTileY = Math.min(gridRows - 1, Math.ceil(maxY / tileSizePx) - 1);
    const hitMap = layerTileHitMaps.get(rect.layerId);
    if (!hitMap) continue;

    let addedRawHits = 0;
    for (let ty = startTileY; ty <= endTileY; ty += 1) {
      for (let tx = startTileX; tx <= endTileX; tx += 1) {
        addedRawHits += 1;
        const morton = encodeMorton2D(tx, ty);
        const existing = hitMap.get(morton);
        if (existing) existing.hits += 1;
        else hitMap.set(morton, { tileX: tx, tileY: ty, hits: 1 });
      }
    }
    layerRawHits.set(rect.layerId, (layerRawHits.get(rect.layerId) ?? 0) + addedRawHits);
  }

  const layerPlans: LayerDirtyTileDispatchPlan[] = [];
  let totalUniqueDirtyTiles = 0;
  let totalDeduplicatedTiles = 0;
  let totalCoalescedSpans = 0;
  let overflowReason: StagingRingOverflowReason | null = null;

  for (const layerId of layerOrder) {
    const hitMap = layerTileHitMaps.get(layerId);
    if (!hitMap || hitMap.size === 0) continue;

    const tiles: MortonDirtyTileEntry[] = [];
    for (const mortonCode of [...hitMap.keys()].sort((a, b) => a - b)) {
      const cell = hitMap.get(mortonCode);
      if (!cell) continue;
      tiles.push({
        layerId,
        tileX: cell.tileX,
        tileY: cell.tileY,
        mortonCode,
        pixelBounds: computeTilePixelBounds(cell.tileX, cell.tileY, tileSizePx, canvasWidthPx, canvasHeightPx),
        sourceRectHitCount: cell.hits,
      });
    }

    const rawTileHitCount = layerRawHits.get(layerId) ?? tiles.length;
    const uniqueTileCount = tiles.length;
    const deduplicatedTileCount = Math.max(0, rawTileHitCount - uniqueTileCount);
    const coalescedSpans = coalesceLayerDirtyTiles(tiles, canvasWidthPx, canvasHeightPx, tileSizePx);
    const indirectDispatchArgs = computeIndirectDispatchArgs(uniqueTileCount, tileSizePx, wgX, wgY);

    let uniformStagingSlice: StagingRingSliceRecord | null = null;
    let pixelStagingSlice: StagingRingSliceRecord | null = null;
    if (overflowReason === null) {
      const uniformAlloc = allocateStagingRingSlice(ringState, uniqueTileCount * 16);
      if (!uniformAlloc.ok) {
        overflowReason = uniformAlloc.reason;
      } else {
        ringState = uniformAlloc.nextState;
        uniformStagingSlice = uniformAlloc.slice;
        const pixelAlloc = allocateStagingRingSlice(ringState, uniqueTileCount * tileByteSize);
        if (!pixelAlloc.ok) overflowReason = pixelAlloc.reason;
        else {
          ringState = pixelAlloc.nextState;
          pixelStagingSlice = pixelAlloc.slice;
        }
      }
    }

    totalUniqueDirtyTiles += uniqueTileCount;
    totalDeduplicatedTiles += deduplicatedTileCount;
    totalCoalescedSpans += coalescedSpans.length;
    layerPlans.push({
      layerId,
      blendMode: layerBlendModes.get(layerId) ?? "normal",
      rawTileHitCount,
      uniqueTileCount,
      deduplicatedTileCount,
      tiles,
      coalescedSpans,
      indirectDispatchArgs,
      uniformStagingSlice,
      pixelStagingSlice,
    });
  }

  return {
    ok: overflowReason === null,
    overflowReason,
    canvasWidthPx,
    canvasHeightPx,
    tileSizePx,
    gridColumns,
    gridRows,
    totalUniqueDirtyTiles,
    totalDeduplicatedTiles,
    totalCoalescedSpans,
    combinedIndirectDispatchArgs: computeIndirectDispatchArgs(totalUniqueDirtyTiles, tileSizePx, wgX, wgY),
    layerPlans,
    stagingRingState: ringState,
  };
}
