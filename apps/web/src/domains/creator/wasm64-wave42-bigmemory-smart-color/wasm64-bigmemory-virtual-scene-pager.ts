/**
 * Wave 42: WASM64 빅메모리 64비트 가상 장면 페이저 (`wasm64-bigmemory-virtual-scene-pager`).
 * `> 4 GiB ~ 64 GiB` `BigInt` 가상 주소 매핑, `64B` SIMD 정렬 디스크립터, 스트로크 핀 보호,
 * 스캔 저항성 `LRU-2 / Clock-Pro` 교체, OPFS 더티 구간 병합, 온라인 물리 파편화 압축을 수행한다.
 */

const ZERO_64 = BigInt(0);
const ONE_64 = BigInt(1);
const MASK_64 = (ONE_64 << BigInt(64)) - ONE_64;
const FNV1A_64_OFFSET = BigInt("0xcbf29ce484222325");
const FNV1A_64_PRIME = BigInt("0x100000001b3");

/** 기존 WASM32 선형 메모리 상한 (`4 GiB` = `0x1_0000_0000`). */
export const WASM32_LEGACY_CEILING_BYTES = BigInt("0x100000000");
/** WASM64 가상 장면 주소 공간 상한 (`64 GiB` = `0x10_0000_0000`). */
export const WASM64_MAX_VIRTUAL_ADDRESS_BYTES = BigInt("0x1000000000");
/** SIMD 캐시라인 및 가상·물리 오프셋 정렬 경계 (`64 B`). */
export const WASM64_SIMD_ALIGNMENT_BYTES = BigInt(64);
/** 이진 페이지 디스크립터 고정 바이트 크기 (`64 B`). */
export const WASM64_SIMD_DESCRIPTOR_BYTES = 64 as const;
/** 기본 WASM64 장면 페이지 크기 (`64 KiB`). */
export const DEFAULT_WASM64_PAGE_SIZE_BYTES = 65_536 as const;

export type Wasm64SceneSegmentKind = "vertex-slab" | "tile-atlas" | "history-snapshot";

/** 세그먼트별 기본 64비트 가상 기저 주소 (`> 4 GiB ~ 64 GiB` 구간 매핑). */
export const WASM64_SEGMENT_BASE_OFFSETS: Readonly<Record<Wasm64SceneSegmentKind, bigint>> = {
  "vertex-slab": BigInt("0x140000000"),
  "tile-atlas": BigInt("0x400000000"),
  "history-snapshot": BigInt("0xc00000000"),
};

const SEGMENT_LIMIT_OFFSETS: Readonly<Record<Wasm64SceneSegmentKind, bigint>> = {
  "vertex-slab": BigInt("0x400000000"),
  "tile-atlas": BigInt("0xc00000000"),
  "history-snapshot": WASM64_MAX_VIRTUAL_ADDRESS_BYTES,
};

const SEGMENT_CODE_TO_KIND: readonly Wasm64SceneSegmentKind[] = ["vertex-slab", "tile-atlas", "history-snapshot"];

export type Wasm64PagerErrorCode =
  | "ADDRESS_OUT_OF_RANGE"
  | "DESCRIPTOR_CHECKSUM_MISMATCH"
  | "DESCRIPTOR_SIZE_INVALID"
  | "INVALID_BYTE_RANGE"
  | "PINNED_CAPACITY_EXHAUSTED"
  | "STALE_OR_UNKNOWN_HANDLE";

export class Wasm64PagerError extends Error {
  readonly code: Wasm64PagerErrorCode;
  constructor(code: Wasm64PagerErrorCode, message: string) {
    super(message);
    this.name = "Wasm64PagerError";
    this.code = code;
  }
}

export interface ScenePageHandle { readonly handleId: number; readonly generation: number; readonly segment: Wasm64SceneSegmentKind }

export interface PackedSimdPageDescriptor {
  readonly virtualOffset: bigint; readonly physicalOffset: bigint;
  readonly byteLength: number; readonly handleId: number; readonly pinCount: number;
  readonly resident: boolean; readonly dirty: boolean; readonly hotLru2: boolean; readonly clockRef: boolean;
  readonly segment: Wasm64SceneSegmentKind;
  readonly penultimateAccessTick: bigint; readonly lastAccessTick: bigint;
  readonly dirtyStartByte: number; readonly dirtyEndByte: number; readonly checksum64: bigint;
}

export interface OpfsWriteCoalescedBatch {
  readonly startVirtualOffset: bigint; readonly endVirtualOffset: bigint;
  readonly byteLength: number; readonly mergedHandleIds: readonly number[]; readonly payload: Uint8Array;
}

export interface Wasm64OpfsBackingStore {
  writeRange(virtualOffset: bigint, payload: Uint8Array): Promise<void>;
  readRange(virtualOffset: bigint, byteLength: number): Promise<Uint8Array>;
}

export interface Wasm64ScenePagerOptions {
  readonly maxResidentBytes: number; readonly pageSizeBytes?: number;
  readonly reuseWindowTicks?: number; readonly ghostHistoryCapacity?: number;
  readonly coalesceGapBytes?: number; readonly backingStore?: Wasm64OpfsBackingStore;
}

export interface PageCompactionReport {
  readonly movedPageCount: number; readonly reclaimedHoleBytes: number;
  readonly fragmentationRatioBefore: number; readonly fragmentationRatioAfter: number;
  readonly activePhysicalTailBytes: bigint;
}

export interface ScenePageStatsSnapshot {
  readonly activePageCount: number; readonly residentPageCount: number;
  readonly hotPageCount: number; readonly coldPageCount: number; readonly pinnedPageCount: number;
  readonly ghostEntryCount: number; readonly residentBytes: number; readonly maxResidentBytes: number;
  readonly evictionCount: number; readonly ghostPromotionCount: number; readonly fragmentationRatio: number;
}

interface InternalPageEntry {
  handleId: number; generation: number; alive: boolean; segment: Wasm64SceneSegmentKind;
  virtualOffset: bigint; physicalOffset: bigint; byteLength: number; pinCount: number;
  resident: boolean; dirty: boolean; hotLru2: boolean; clockRef: boolean; accessCount: number;
  penultimateAccessTick: bigint; lastAccessTick: bigint; dirtyStartByte: number; dirtyEndByte: number;
  residentBuffer: Uint8Array | null; swappedShadowBuffer: Uint8Array | null;
}

/** 64비트 정수를 `64B` SIMD 정렬 경계로 올림한다. */
export function alignUp64BigInt(rawValue: bigint): bigint {
  const clamped = rawValue < ZERO_64 ? ZERO_64 : rawValue;
  const mask = WASM64_SIMD_ALIGNMENT_BYTES - ONE_64;
  return (clamped + mask) & ~mask;
}

/** 바이트 배열의 결정론적 64비트 FNV-1a 무결성 해시를 계산한다 (`ES2017` `BigInt` 호환). */
export function computeFnv1a64(bytes: Uint8Array, endExclusive = bytes.byteLength): bigint {
  let hash = FNV1A_64_OFFSET;
  const limit = Math.min(bytes.byteLength, Math.max(0, endExclusive));
  for (let i = 0; i < limit; i += 1) {
    hash = ((hash ^ BigInt(bytes[i])) * FNV1A_64_PRIME) & MASK_64;
  }
  return hash;
}

/** 페이지 메타데이터를 정확히 `64B` SIMD 캐시라인 정렬 이진 디스크립터로 직렬화한다. */
export function packPageDescriptor64B(input: Omit<PackedSimdPageDescriptor, "checksum64">): Uint8Array {
  const bytes = new Uint8Array(WASM64_SIMD_DESCRIPTOR_BYTES);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const segCode = input.segment === "vertex-slab" ? 0 : input.segment === "tile-atlas" ? 1 : 2;
  const flags = (input.resident ? 1 : 0) | (input.dirty ? 2 : 0) | (input.hotLru2 ? 4 : 0) | (input.clockRef ? 8 : 0) | ((segCode & 0x3) << 4);
  view.setBigUint64(0, input.virtualOffset, true);
  view.setBigUint64(8, input.physicalOffset, true);
  view.setUint32(16, input.byteLength >>> 0, true);
  view.setUint32(20, input.handleId >>> 0, true);
  view.setUint32(24, input.pinCount >>> 0, true);
  view.setUint32(28, flags >>> 0, true);
  view.setBigUint64(32, input.penultimateAccessTick, true);
  view.setBigUint64(40, input.lastAccessTick, true);
  view.setUint32(48, input.dirtyStartByte >>> 0, true);
  view.setUint32(52, input.dirtyEndByte >>> 0, true);
  view.setBigUint64(56, computeFnv1a64(bytes, 56), true);
  return bytes;
}

/** `64B` 이진 페이지 디스크립터를 역직렬화하고 64비트 체크섬 무결성을 검증한다. */
export function unpackPageDescriptor64B(bytes: Uint8Array): PackedSimdPageDescriptor {
  if (bytes.byteLength !== WASM64_SIMD_DESCRIPTOR_BYTES) {
    throw new Wasm64PagerError("DESCRIPTOR_SIZE_INVALID", `디스크립터 크기 오류(${bytes.byteLength}B)`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const checksum64 = view.getBigUint64(56, true);
  if (computeFnv1a64(bytes, 56) !== checksum64) {
    throw new Wasm64PagerError("DESCRIPTOR_CHECKSUM_MISMATCH", "64B 디스크립터 체크섬 불일치");
  }
  const flags = view.getUint32(28, true);
  return {
    virtualOffset: view.getBigUint64(0, true), physicalOffset: view.getBigUint64(8, true),
    byteLength: view.getUint32(16, true), handleId: view.getUint32(20, true), pinCount: view.getUint32(24, true),
    resident: (flags & 1) !== 0, dirty: (flags & 2) !== 0, hotLru2: (flags & 4) !== 0, clockRef: (flags & 8) !== 0,
    segment: SEGMENT_CODE_TO_KIND[Math.min((flags >>> 4) & 0x3, SEGMENT_CODE_TO_KIND.length - 1)],
    penultimateAccessTick: view.getBigUint64(32, true), lastAccessTick: view.getBigUint64(40, true),
    dirtyStartByte: view.getUint32(48, true), dirtyEndByte: view.getUint32(52, true), checksum64,
  };
}

/** `> 4 GiB ~ 64 GiB` 가상 장면 주소 공간을 관리하는 스캔 저항성 WASM64 빅메모리 페이저. */
export class Wasm64BigMemoryScenePager {
  private readonly maxResidentBytes: number;
  private readonly defaultPageSizeBytes: number;
  private readonly reuseWindowTicks: bigint;
  private readonly ghostHistoryCapacity: number;
  private readonly coalesceGapBytes: bigint;
  private readonly backingStore: Wasm64OpfsBackingStore | null;
  private readonly handleTable: InternalPageEntry[] = [];
  private readonly segmentCursors = new Map<Wasm64SceneSegmentKind, bigint>([
    ["vertex-slab", WASM64_SEGMENT_BASE_OFFSETS["vertex-slab"]],
    ["tile-atlas", WASM64_SEGMENT_BASE_OFFSETS["tile-atlas"]],
    ["history-snapshot", WASM64_SEGMENT_BASE_OFFSETS["history-snapshot"]],
  ]);
  private readonly ghostRing: number[] = [];
  private readonly ghostSet = new Set<number>();
  private logicalTick = ONE_64;
  private residentBytes = 0;
  private physicalHighWaterBytes = ZERO_64;
  private clockHandIndex = 0;
  private evictionCount = 0;
  private ghostPromotionCount = 0;

  constructor(options: Wasm64ScenePagerOptions) {
    const rawPage = Math.max(64, Math.trunc(options.pageSizeBytes ?? DEFAULT_WASM64_PAGE_SIZE_BYTES));
    this.defaultPageSizeBytes = Number(alignUp64BigInt(BigInt(rawPage)));
    this.maxResidentBytes = Math.max(this.defaultPageSizeBytes, Math.trunc(options.maxResidentBytes));
    this.reuseWindowTicks = BigInt(Math.max(2, Math.trunc(options.reuseWindowTicks ?? 16)));
    this.ghostHistoryCapacity = Math.max(4, Math.trunc(options.ghostHistoryCapacity ?? 64));
    this.coalesceGapBytes = alignUp64BigInt(BigInt(Math.max(0, Math.trunc(options.coalesceGapBytes ?? 0))));
    this.backingStore = options.backingStore ?? null;
  }

  allocatePage(params: {
    readonly segment: Wasm64SceneSegmentKind; readonly byteLength?: number;
    readonly explicitVirtualOffset?: bigint; readonly pinForActiveStroke?: boolean; readonly initialPayload?: Uint8Array;
  }): ScenePageHandle {
    const alignedLength = Number(alignUp64BigInt(BigInt(Math.max(64, Math.trunc(params.byteLength ?? this.defaultPageSizeBytes)))));
    if (alignedLength > this.maxResidentBytes) {
      throw new Wasm64PagerError("INVALID_BYTE_RANGE", "페이지 크기가 상주 한도를 초과합니다.");
    }
    let virtualOffset: bigint;
    if (params.explicitVirtualOffset !== undefined) {
      virtualOffset = alignUp64BigInt(params.explicitVirtualOffset);
      if (virtualOffset < ZERO_64 || virtualOffset + BigInt(alignedLength) > WASM64_MAX_VIRTUAL_ADDRESS_BYTES) {
        throw new Wasm64PagerError("ADDRESS_OUT_OF_RANGE", "가상 주소가 64 GiB 범위를 벗어났습니다.");
      }
    } else {
      virtualOffset = alignUp64BigInt(this.segmentCursors.get(params.segment)!);
      const nextCursor = virtualOffset + BigInt(alignedLength);
      if (nextCursor > SEGMENT_LIMIT_OFFSETS[params.segment]) {
        throw new Wasm64PagerError("ADDRESS_OUT_OF_RANGE", `세그먼트 ${params.segment} 공간 소진`);
      }
      this.segmentCursors.set(params.segment, nextCursor);
    }

    this.ensureResidentHeadroom(alignedLength);
    const physicalOffset = alignUp64BigInt(this.physicalHighWaterBytes);
    this.physicalHighWaterBytes = physicalOffset + BigInt(alignedLength);
    const buffer = new Uint8Array(alignedLength);
    if (params.initialPayload) buffer.set(params.initialPayload.subarray(0, alignedLength), 0);
    const isInitialDirty = Boolean(params.initialPayload && params.initialPayload.byteLength > 0);
    const handleId = this.handleTable.length;
    const entry: InternalPageEntry = {
      handleId, generation: 1, alive: true, segment: params.segment, virtualOffset, physicalOffset,
      byteLength: alignedLength, pinCount: params.pinForActiveStroke ? 1 : 0,
      resident: true, dirty: isInitialDirty, hotLru2: false, clockRef: true, accessCount: 1,
      penultimateAccessTick: ZERO_64, lastAccessTick: this.nextTick(),
      dirtyStartByte: 0, dirtyEndByte: isInitialDirty ? Math.min(alignedLength, params.initialPayload!.byteLength) : 0,
      residentBuffer: buffer, swappedShadowBuffer: null,
    };
    this.handleTable.push(entry);
    this.residentBytes += alignedLength;
    return { handleId, generation: entry.generation, segment: entry.segment };
  }

  pinPage(handle: ScenePageHandle): number {
    const entry = this.resolveLiveEntry(handle);
    if (!entry.resident) this.faultInEntry(entry);
    entry.pinCount += 1;
    return entry.pinCount;
  }

  unpinPage(handle: ScenePageHandle): number {
    const entry = this.resolveLiveEntry(handle);
    entry.pinCount = Math.max(0, entry.pinCount - 1);
    return entry.pinCount;
  }

  freePage(handle: ScenePageHandle): void {
    const entry = this.resolveLiveEntry(handle);
    if (entry.pinCount > 0) throw new Wasm64PagerError("PINNED_CAPACITY_EXHAUSTED", "핀 고정 페이지는 해제할 수 없습니다.");
    if (entry.resident) this.residentBytes = Math.max(0, this.residentBytes - entry.byteLength);
    entry.alive = false;
    entry.resident = false;
    entry.residentBuffer = null;
    entry.swappedShadowBuffer = null;
    entry.generation += 1;
    this.ghostSet.delete(entry.handleId);
  }

  readSlice(handle: ScenePageHandle, byteOffset = 0, byteLength?: number): Uint8Array {
    const entry = this.resolveLiveEntry(handle);
    if (!entry.resident) this.faultInEntry(entry);
    else this.recordAccess(entry, false);
    const len = byteLength ?? (entry.byteLength - byteOffset);
    if (!entry.residentBuffer || byteOffset < 0 || len < 0 || byteOffset + len > entry.byteLength) {
      throw new Wasm64PagerError("INVALID_BYTE_RANGE", "읽기 범위 초과");
    }
    return entry.residentBuffer.slice(byteOffset, byteOffset + len);
  }

  writeSlice(handle: ScenePageHandle, byteOffset: number, data: Uint8Array): void {
    const entry = this.resolveLiveEntry(handle);
    if (!entry.resident) this.faultInEntry(entry);
    else this.recordAccess(entry, false);
    const endByte = byteOffset + data.byteLength;
    if (!entry.residentBuffer || byteOffset < 0 || endByte > entry.byteLength) {
      throw new Wasm64PagerError("INVALID_BYTE_RANGE", "쓰기 범위 초과");
    }
    entry.residentBuffer.set(data, byteOffset);
    if (data.byteLength > 0) {
      entry.dirtyStartByte = entry.dirty ? Math.min(entry.dirtyStartByte, byteOffset) : byteOffset;
      entry.dirtyEndByte = entry.dirty ? Math.max(entry.dirtyEndByte, endByte) : endByte;
      entry.dirty = true;
    }
  }

  exportDescriptor64B(handle: ScenePageHandle): Uint8Array {
    const e = this.resolveLiveEntry(handle);
    return packPageDescriptor64B({
      virtualOffset: e.virtualOffset, physicalOffset: e.physicalOffset, byteLength: e.byteLength,
      handleId: e.handleId, pinCount: e.pinCount, resident: e.resident, dirty: e.dirty,
      hotLru2: e.hotLru2, clockRef: e.clockRef, segment: e.segment,
      penultimateAccessTick: e.penultimateAccessTick, lastAccessTick: e.lastAccessTick,
      dirtyStartByte: e.dirtyStartByte, dirtyEndByte: e.dirtyEndByte,
    });
  }

  inspectPage(handle: ScenePageHandle): PackedSimdPageDescriptor {
    return unpackPageDescriptor64B(this.exportDescriptor64B(handle));
  }

  coalesceDirtyWriteBatches(): readonly OpfsWriteCoalescedBatch[] {
    const dirtyEntries = this.handleTable
      .filter((entry) => entry.alive && entry.dirty && entry.dirtyEndByte > entry.dirtyStartByte)
      .sort((a, b) => {
        const sa = a.virtualOffset + BigInt(a.dirtyStartByte);
        const sb = b.virtualOffset + BigInt(b.dirtyStartByte);
        return sa < sb ? -1 : sa > sb ? 1 : 0;
      });
    if (dirtyEntries.length === 0) return [];
    const batches: OpfsWriteCoalescedBatch[] = [];
    let group: InternalPageEntry[] = [dirtyEntries[0]];
    let start = dirtyEntries[0].virtualOffset + BigInt(dirtyEntries[0].dirtyStartByte);
    let end = dirtyEntries[0].virtualOffset + BigInt(dirtyEntries[0].dirtyEndByte);

    const emit = () => {
      const byteLength = Number(end - start);
      const payload = new Uint8Array(byteLength);
      const mergedHandleIds: number[] = [];
      for (const item of group) {
        mergedHandleIds.push(item.handleId);
        const src = item.residentBuffer ?? item.swappedShadowBuffer;
        if (src) payload.set(src.subarray(item.dirtyStartByte, item.dirtyEndByte), Number(item.virtualOffset + BigInt(item.dirtyStartByte) - start));
      }
      batches.push({ startVirtualOffset: start, endVirtualOffset: end, byteLength, mergedHandleIds, payload });
    };

    for (let i = 1; i < dirtyEntries.length; i += 1) {
      const cur = dirtyEntries[i];
      const cs = cur.virtualOffset + BigInt(cur.dirtyStartByte);
      const ce = cur.virtualOffset + BigInt(cur.dirtyEndByte);
      if (cs <= end + this.coalesceGapBytes) {
        group.push(cur);
        if (ce > end) end = ce;
      } else {
        emit();
        group = [cur];
        start = cs;
        end = ce;
      }
    }
    emit();
    return batches;
  }

  async flushDirtyBatchesToOpfs(): Promise<readonly OpfsWriteCoalescedBatch[]> {
    const batches = this.coalesceDirtyWriteBatches();
    if (this.backingStore) {
      for (const batch of batches) await this.backingStore.writeRange(batch.startVirtualOffset, batch.payload);
    }
    for (const batch of batches) {
      for (const id of batch.mergedHandleIds) {
        const entry = this.handleTable[id];
        if (entry?.alive) {
          entry.dirty = false;
          entry.dirtyStartByte = 0;
          entry.dirtyEndByte = 0;
        }
      }
    }
    return batches;
  }

  compactPhysicalArena(): PageCompactionReport {
    const fragmentationRatioBefore = this.computeFragmentationRatio();
    const residentPages = this.handleTable
      .filter((entry) => entry.alive && entry.resident)
      .sort((a, b) => (a.physicalOffset < b.physicalOffset ? -1 : a.physicalOffset > b.physicalOffset ? 1 : 0));
    let cursor = ZERO_64;
    let movedPageCount = 0;
    for (const entry of residentPages) {
      const aligned = alignUp64BigInt(cursor);
      if (entry.physicalOffset !== aligned) {
        entry.physicalOffset = aligned;
        movedPageCount += 1;
      }
      cursor = aligned + BigInt(entry.byteLength);
    }
    const prevTail = this.physicalHighWaterBytes;
    this.physicalHighWaterBytes = cursor;
    return {
      movedPageCount, reclaimedHoleBytes: prevTail > cursor ? Number(prevTail - cursor) : 0,
      fragmentationRatioBefore, fragmentationRatioAfter: this.computeFragmentationRatio(), activePhysicalTailBytes: cursor,
    };
  }

  getStats(): ScenePageStatsSnapshot {
    let active = 0, resident = 0, hot = 0, cold = 0, pinned = 0;
    for (const entry of this.handleTable) {
      if (!entry.alive) continue;
      active += 1;
      if (entry.pinCount > 0) pinned += 1;
      if (entry.resident) {
        resident += 1;
        if (entry.hotLru2) hot += 1;
        else cold += 1;
      }
    }
    return {
      activePageCount: active, residentPageCount: resident, hotPageCount: hot, coldPageCount: cold, pinnedPageCount: pinned,
      ghostEntryCount: this.ghostRing.length, residentBytes: this.residentBytes, maxResidentBytes: this.maxResidentBytes,
      evictionCount: this.evictionCount, ghostPromotionCount: this.ghostPromotionCount,
      fragmentationRatio: this.computeFragmentationRatio(),
    };
  }

  private computeFragmentationRatio(): number {
    const highWater = Number(this.physicalHighWaterBytes);
    return highWater <= 0 || this.residentBytes >= highWater ? 0 : Math.max(0, (highWater - this.residentBytes) / highWater);
  }

  private nextTick(): bigint {
    const cur = this.logicalTick;
    this.logicalTick += ONE_64;
    return cur;
  }

  private resolveLiveEntry(handle: ScenePageHandle): InternalPageEntry {
    const entry = this.handleTable[handle.handleId];
    if (!entry || !entry.alive || entry.generation !== handle.generation) {
      throw new Wasm64PagerError("STALE_OR_UNKNOWN_HANDLE", `유효하지 않은 핸들(${handle.handleId})`);
    }
    return entry;
  }

  private recordAccess(entry: InternalPageEntry, promotedFromGhost: boolean): void {
    const tick = this.nextTick();
    const prev = entry.lastAccessTick;
    entry.penultimateAccessTick = prev;
    entry.lastAccessTick = tick;
    entry.accessCount += 1;
    entry.clockRef = true;
    if (promotedFromGhost || (prev > ZERO_64 && tick - prev <= this.reuseWindowTicks)) {
      entry.hotLru2 = true;
      if (promotedFromGhost) this.ghostPromotionCount += 1;
    }
  }

  private faultInEntry(entry: InternalPageEntry): void {
    this.ensureResidentHeadroom(entry.byteLength);
    const physicalOffset = alignUp64BigInt(this.physicalHighWaterBytes);
    this.physicalHighWaterBytes = physicalOffset + BigInt(entry.byteLength);
    const restored = new Uint8Array(entry.byteLength);
    if (entry.swappedShadowBuffer) restored.set(entry.swappedShadowBuffer.subarray(0, entry.byteLength), 0);
    if (this.ghostSet.delete(entry.handleId)) {
      const idx = this.ghostRing.indexOf(entry.handleId);
      if (idx >= 0) this.ghostRing.splice(idx, 1);
      entry.hotLru2 = true;
      this.ghostPromotionCount += 1;
    }
    entry.physicalOffset = physicalOffset;
    entry.resident = true;
    entry.residentBuffer = restored;
    this.residentBytes += entry.byteLength;
    this.recordAccess(entry, false);
  }

  private ensureResidentHeadroom(requiredBytes: number): void {
    while (this.residentBytes + requiredBytes > this.maxResidentBytes) {
      const victim = this.selectVictimEntry();
      if (!victim) throw new Wasm64PagerError("PINNED_CAPACITY_EXHAUSTED", "모든 상주 페이지가 핀 고정 상태입니다.");
      this.evictEntry(victim);
    }
  }

  private selectVictimEntry(): InternalPageEntry | null {
    const total = this.handleTable.length;
    if (total === 0) return null;
    const cold: InternalPageEntry[] = [];
    const hot: InternalPageEntry[] = [];
    for (let step = 0; step < total * 2; step += 1) {
      const idx = (this.clockHandIndex + step) % total;
      const entry = this.handleTable[idx];
      if (!entry || !entry.alive || !entry.resident || entry.pinCount > 0) continue;
      if (!entry.hotLru2) {
        if (!entry.clockRef) {
          this.clockHandIndex = (idx + 1) % total;
          return entry;
        }
        entry.clockRef = false;
        cold.push(entry);
      } else {
        hot.push(entry);
      }
    }
    if (cold.length > 0) return cold.sort((a, b) => (a.lastAccessTick < b.lastAccessTick ? -1 : 1))[0];
    if (hot.length > 0) {
      hot.sort((a, b) => (a.penultimateAccessTick !== b.penultimateAccessTick ? (a.penultimateAccessTick < b.penultimateAccessTick ? -1 : 1) : (a.lastAccessTick < b.lastAccessTick ? -1 : 1)));
      hot[0].hotLru2 = false;
      hot[0].clockRef = false;
      return hot[0];
    }
    return null;
  }

  private evictEntry(victim: InternalPageEntry): void {
    victim.swappedShadowBuffer = victim.residentBuffer ? victim.residentBuffer.slice() : null;
    victim.residentBuffer = null;
    victim.resident = false;
    victim.clockRef = false;
    this.residentBytes = Math.max(0, this.residentBytes - victim.byteLength);
    this.evictionCount += 1;
    if (!this.ghostSet.has(victim.handleId)) {
      if (this.ghostRing.length >= this.ghostHistoryCapacity) {
        const oldest = this.ghostRing.shift();
        if (oldest !== undefined) this.ghostSet.delete(oldest);
      }
      this.ghostRing.push(victim.handleId);
      this.ghostSet.add(victim.handleId);
    }
  }
}
