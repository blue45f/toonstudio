/**
 * SharedArrayBuffer 아레나 내부에 배치되는 64바이트 정렬 SoA(Struct-of-Arrays) 렌더 상태 트리.
 *
 * - 12개 64바이트 정렬 TypedArray 컬럼(`layerIds`, `parentIndex`, `flags`, `blendMode`, `opacity`,
 *   `boundsX`, `boundsY`, `boundsW`, `boundsH`, `zOrder`, `dirtyGeneration`, `tileArenaOffset`)을
 *   `Wasm64SharedArena`에 직접 할당해 메인 스레드·WASM 워커·WebGPU 렌더러가 0-직렬화로 공유한다.
 * - `commitGeneration()`은 `Atomics.add`로 세대를 원자 발행하며, 독립 캐시라인의 `Atomics`
 *   락프리 시퀀스 락(Seqlock: 홀수=쓰기 중, 짝수=안정 스냅샷)으로 락 경합 없는 0-카피 읽기를 보장한다.
 */

import {
  isSharedBufferInstance,
  WASM64_CACHE_LINE_BYTES,
  type Wasm64ArenaBackingMode,
  type Wasm64SharedArena,
} from "./wasm64-shared-arena";

export const WASM64_SOA_MAGIC = 0x5453534f; // "TSSO"
export const WASM64_SOA_VERSION = 1;
export const WASM64_SOA_NO_PARENT = -1;
export const WASM64_SOA_NO_TILE_OFFSET = 0xffffffff;
export const WASM64_SOA_HEADER_INT32_COUNT = 48; // 192B = 3 x 64B 캐시라인
export const WASM64_SOA_SEQLOCK_BYTE_OFFSET = 128; // 캐시라인 2 격리

const HDR = {
  MAGIC: 0, VERSION: 1, MAX_NODES: 2, TOTAL_BYTES: 3,
  COL_LAYER_IDS: 4, COL_PARENT_INDEX: 5, COL_FLAGS: 6, COL_BLEND_MODE: 7,
  COL_OPACITY: 8, COL_BOUNDS_X: 9, COL_BOUNDS_Y: 10, COL_BOUNDS_W: 11,
  COL_BOUNDS_H: 12, COL_Z_ORDER: 13, COL_DIRTY_GEN: 14, COL_TILE_OFFSET: 15,
  ACTIVE_COUNT: 16, COMMITTED_GEN: 17, LAST_DIRTY_COUNT: 18, // 캐시라인 1 (64..127B)
  SEQLOCK: WASM64_SOA_SEQLOCK_BYTE_OFFSET / 4, // 32 (캐시라인 2: 128..191B)
} as const;

export const Wasm64NodeFlag = {
  None: 0, Visible: 1 << 0, Locked: 1 << 1, ClippingMask: 1 << 2,
  AlphaLock: 1 << 3, IsGroup: 1 << 4, Dirty: 1 << 5, Active: 1 << 6,
} as const;

export const Wasm64BlendMode = {
  Normal: 0, Multiply: 1, Screen: 2, Overlay: 3, Darken: 4,
  Lighten: 5, ColorDodge: 6, ColorBurn: 7, SoftLight: 8, AddGlow: 9,
} as const;

export interface Wasm64SoaNodeInput {
  readonly layerId: number; readonly parentIndex?: number; readonly flags?: number;
  readonly blendMode?: number; readonly opacity?: number;
  readonly boundsX?: number; readonly boundsY?: number; readonly boundsW?: number; readonly boundsH?: number;
  readonly zOrder?: number; readonly tileArenaOffset?: number;
}

export interface Wasm64SoaNodeState {
  layerId: number; parentIndex: number; flags: number; blendMode: number; opacity: number;
  boundsX: number; boundsY: number; boundsW: number; boundsH: number;
  zOrder: number; dirtyGeneration: number; tileArenaOffset: number;
}

export interface Wasm64SoaCommitSnapshot {
  readonly generation: number;
  readonly activeNodeCount: number;
  readonly dirtyNodeCount: number;
  readonly seqlockVersion: number;
}

export interface Wasm64SeqlockReadResult<T> {
  readonly consistent: boolean;
  readonly seqlockVersion: number;
  readonly retries: number;
  readonly value: T | null;
}

export interface Wasm64SoaColumnOffsets {
  readonly baseByteOffset: number; readonly totalByteLength: number; readonly seqlockByteOffset: number;
  readonly layerIds: number; readonly parentIndex: number; readonly flags: number;
  readonly blendMode: number; readonly opacity: number;
  readonly boundsX: number; readonly boundsY: number; readonly boundsW: number; readonly boundsH: number;
  readonly zOrder: number; readonly dirtyGeneration: number; readonly tileArenaOffset: number;
}

interface SoaColumns {
  readonly layerIds: Uint32Array; readonly parentIndex: Int32Array; readonly flags: Uint32Array;
  readonly blendMode: Uint8Array; readonly opacity: Float32Array;
  readonly boundsX: Float32Array; readonly boundsY: Float32Array;
  readonly boundsW: Float32Array; readonly boundsH: Float32Array;
  readonly zOrder: Int32Array; readonly dirtyGeneration: Uint32Array; readonly tileArenaOffset: Uint32Array;
}

export function createSoaNodeStateScratch(): Wasm64SoaNodeState {
  return {
    layerId: 0, parentIndex: WASM64_SOA_NO_PARENT, flags: 0, blendMode: 0,
    opacity: 1, boundsX: 0, boundsY: 0, boundsW: 0, boundsH: 0,
    zOrder: 0, dirtyGeneration: 0, tileArenaOffset: WASM64_SOA_NO_TILE_OFFSET,
  };
}

export class Wasm64SoaRenderStateTree {
  readonly buffer: ArrayBufferLike;
  readonly isShared: boolean;
  readonly backingMode: Wasm64ArenaBackingMode;
  readonly baseByteOffset: number;
  readonly totalByteLength: number;
  readonly maxNodes: number;
  readonly layerIds: Uint32Array;
  readonly parentIndex: Int32Array;
  readonly flags: Uint32Array;
  readonly blendMode: Uint8Array;
  readonly opacity: Float32Array;
  readonly boundsX: Float32Array;
  readonly boundsY: Float32Array;
  readonly boundsW: Float32Array;
  readonly boundsH: Float32Array;
  readonly zOrder: Int32Array;
  readonly dirtyGeneration: Uint32Array;
  readonly tileArenaOffset: Uint32Array;
  private readonly header: Int32Array;

  private constructor(
    buffer: ArrayBufferLike, baseByteOffset: number, maxNodes: number,
    header: Int32Array, cols: SoaColumns, totalByteLength: number,
  ) {
    this.buffer = buffer;
    this.isShared = isSharedBufferInstance(buffer);
    this.backingMode = this.isShared ? "shared-array-buffer" : "array-buffer-fallback";
    this.baseByteOffset = baseByteOffset;
    this.totalByteLength = totalByteLength;
    this.maxNodes = maxNodes;
    this.header = header;
    this.layerIds = cols.layerIds; this.parentIndex = cols.parentIndex;
    this.flags = cols.flags; this.blendMode = cols.blendMode; this.opacity = cols.opacity;
    this.boundsX = cols.boundsX; this.boundsY = cols.boundsY;
    this.boundsW = cols.boundsW; this.boundsH = cols.boundsH;
    this.zOrder = cols.zOrder; this.dirtyGeneration = cols.dirtyGeneration;
    this.tileArenaOffset = cols.tileArenaOffset;
  }

  /** `Wasm64SharedArena` 내부에 12개 64바이트 정렬 SoA 컬럼을 연속 할당한다. */
  static allocate(arena: Wasm64SharedArena, maxNodes: number): Wasm64SoaRenderStateTree {
    if (!Number.isSafeInteger(maxNodes) || maxNodes <= 0) {
      throw new RangeError(`maxNodes must be a positive integer (got ${maxNodes})`);
    }
    const header = arena.allocInt32(WASM64_SOA_HEADER_INT32_COUNT, WASM64_CACHE_LINE_BYTES);
    const cols: SoaColumns = {
      layerIds: arena.allocUint32(maxNodes, WASM64_CACHE_LINE_BYTES),
      parentIndex: arena.allocInt32(maxNodes, WASM64_CACHE_LINE_BYTES),
      flags: arena.allocUint32(maxNodes, WASM64_CACHE_LINE_BYTES),
      blendMode: arena.allocUint8(maxNodes, WASM64_CACHE_LINE_BYTES),
      opacity: arena.allocFloat32(maxNodes, WASM64_CACHE_LINE_BYTES),
      boundsX: arena.allocFloat32(maxNodes, WASM64_CACHE_LINE_BYTES),
      boundsY: arena.allocFloat32(maxNodes, WASM64_CACHE_LINE_BYTES),
      boundsW: arena.allocFloat32(maxNodes, WASM64_CACHE_LINE_BYTES),
      boundsH: arena.allocFloat32(maxNodes, WASM64_CACHE_LINE_BYTES),
      zOrder: arena.allocInt32(maxNodes, WASM64_CACHE_LINE_BYTES),
      dirtyGeneration: arena.allocUint32(maxNodes, WASM64_CACHE_LINE_BYTES),
      tileArenaOffset: arena.allocUint32(maxNodes, WASM64_CACHE_LINE_BYTES),
    };
    cols.parentIndex.fill(WASM64_SOA_NO_PARENT);
    cols.opacity.fill(1);
    cols.tileArenaOffset.fill(WASM64_SOA_NO_TILE_OFFSET);

    const baseByteOffset = header.byteOffset;
    const totalByteLength = cols.tileArenaOffset.byteOffset + cols.tileArenaOffset.byteLength - baseByteOffset;
    header.fill(0);
    header[HDR.MAGIC] = WASM64_SOA_MAGIC; header[HDR.VERSION] = WASM64_SOA_VERSION;
    header[HDR.MAX_NODES] = maxNodes; header[HDR.TOTAL_BYTES] = totalByteLength;
    header[HDR.COL_LAYER_IDS] = cols.layerIds.byteOffset;
    header[HDR.COL_PARENT_INDEX] = cols.parentIndex.byteOffset;
    header[HDR.COL_FLAGS] = cols.flags.byteOffset;
    header[HDR.COL_BLEND_MODE] = cols.blendMode.byteOffset;
    header[HDR.COL_OPACITY] = cols.opacity.byteOffset;
    header[HDR.COL_BOUNDS_X] = cols.boundsX.byteOffset;
    header[HDR.COL_BOUNDS_Y] = cols.boundsY.byteOffset;
    header[HDR.COL_BOUNDS_W] = cols.boundsW.byteOffset;
    header[HDR.COL_BOUNDS_H] = cols.boundsH.byteOffset;
    header[HDR.COL_Z_ORDER] = cols.zOrder.byteOffset;
    header[HDR.COL_DIRTY_GEN] = cols.dirtyGeneration.byteOffset;
    header[HDR.COL_TILE_OFFSET] = cols.tileArenaOffset.byteOffset;
    return new Wasm64SoaRenderStateTree(arena.buffer, baseByteOffset, maxNodes, header, cols, totalByteLength);
  }

  /** 워커·WebGPU 렌더러가 동일 `SharedArrayBuffer`와 기준 오프셋만으로 직렬화 없이 부착한다. */
  static attach(buffer: ArrayBufferLike, baseByteOffset: number): Wasm64SoaRenderStateTree {
    if (baseByteOffset < 0 || baseByteOffset % WASM64_CACHE_LINE_BYTES !== 0) {
      throw new RangeError(`baseByteOffset must be 64-byte aligned (got ${baseByteOffset})`);
    }
    const header = new Int32Array(buffer, baseByteOffset, WASM64_SOA_HEADER_INT32_COUNT);
    if (header[HDR.MAGIC] !== WASM64_SOA_MAGIC || header[HDR.VERSION] !== WASM64_SOA_VERSION) {
      throw new RangeError(`Invalid SoA RenderStateTree header at offset ${baseByteOffset}`);
    }
    const n = header[HDR.MAX_NODES];
    const cols: SoaColumns = {
      layerIds: new Uint32Array(buffer, header[HDR.COL_LAYER_IDS], n),
      parentIndex: new Int32Array(buffer, header[HDR.COL_PARENT_INDEX], n),
      flags: new Uint32Array(buffer, header[HDR.COL_FLAGS], n),
      blendMode: new Uint8Array(buffer, header[HDR.COL_BLEND_MODE], n),
      opacity: new Float32Array(buffer, header[HDR.COL_OPACITY], n),
      boundsX: new Float32Array(buffer, header[HDR.COL_BOUNDS_X], n),
      boundsY: new Float32Array(buffer, header[HDR.COL_BOUNDS_Y], n),
      boundsW: new Float32Array(buffer, header[HDR.COL_BOUNDS_W], n),
      boundsH: new Float32Array(buffer, header[HDR.COL_BOUNDS_H], n),
      zOrder: new Int32Array(buffer, header[HDR.COL_Z_ORDER], n),
      dirtyGeneration: new Uint32Array(buffer, header[HDR.COL_DIRTY_GEN], n),
      tileArenaOffset: new Uint32Array(buffer, header[HDR.COL_TILE_OFFSET], n),
    };
    return new Wasm64SoaRenderStateTree(buffer, baseByteOffset, n, header, cols, header[HDR.TOTAL_BYTES]);
  }

  private loadAtomic(index: number): number {
    return this.isShared ? Atomics.load(this.header, index) : this.header[index];
  }

  private storeAtomic(index: number, value: number): void {
    if (this.isShared) Atomics.store(this.header, index, value);
    else this.header[index] = value;
  }

  private addAtomic(index: number, delta: number): number {
    if (this.isShared) return Atomics.add(this.header, index, delta);
    const prev = this.header[index];
    this.header[index] = (prev + delta) | 0;
    return prev;
  }

  private assertIndex(nodeIndex: number): void {
    if (!Number.isSafeInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= this.maxNodes) {
      throw new RangeError(`SoA nodeIndex out of range: ${nodeIndex} (maxNodes=${this.maxNodes})`);
    }
  }

  private pendingGeneration(): number { return ((this.loadAtomic(HDR.COMMITTED_GEN) >>> 0) + 1) >>> 0; }

  /** Seqlock 쓰기 시작: 짝수 -> 홀수 전환(리더에게 쓰기 중 상태 알림). */
  beginWrite(): number {
    const current = this.loadAtomic(HDR.SEQLOCK) >>> 0;
    if ((current & 1) !== 0) throw new Error(`Seqlock write already in progress (version=${current})`);
    return ((this.addAtomic(HDR.SEQLOCK, 1) >>> 0) + 1) >>> 0;
  }

  /** Seqlock 쓰기 종료: 홀수 -> 다음 짝수 전환(안정 스냅샷 공개). */
  endWrite(): number {
    const current = this.loadAtomic(HDR.SEQLOCK) >>> 0;
    if ((current & 1) === 0) throw new Error(`Seqlock endWrite called outside active write (version=${current})`);
    return ((this.addAtomic(HDR.SEQLOCK, 1) >>> 0) + 1) >>> 0;
  }

  /** 락프리 Seqlock 쓰기 트랜잭션을 수행하고 선택적으로 세대를 원자 커밋한다. */
  writeTransaction<T>(writer: (tree: Wasm64SoaRenderStateTree) => T, commit = false): T {
    this.beginWrite();
    try {
      const result = writer(this);
      if (commit) this.commitGeneration();
      return result;
    } finally {
      this.endWrite();
    }
  }

  /** 뮤텍스·락 경합 없이 0-카피 일관 스냅샷을 읽는다(홀수 또는 버전 변경 시 자동 재시도). */
  readConsistentSnapshot<T>(
    reader: (tree: Wasm64SoaRenderStateTree) => T,
    maxRetries = 64,
  ): Wasm64SeqlockReadResult<T> {
    if (!Number.isSafeInteger(maxRetries) || maxRetries <= 0) {
      throw new RangeError(`maxRetries must be a positive integer (got ${maxRetries})`);
    }
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const seqBefore = this.loadAtomic(HDR.SEQLOCK) >>> 0;
      if ((seqBefore & 1) !== 0) continue;
      const value = reader(this);
      const seqAfter = this.loadAtomic(HDR.SEQLOCK) >>> 0;
      if (seqBefore === seqAfter) {
        return { consistent: true, seqlockVersion: seqAfter, retries: attempt, value };
      }
    }
    return { consistent: false, seqlockVersion: this.loadAtomic(HDR.SEQLOCK) >>> 0, retries: maxRetries, value: null };
  }

  upsertNode(nodeIndex: number, input: Wasm64SoaNodeInput): void {
    this.assertIndex(nodeIndex);
    this.layerIds[nodeIndex] = input.layerId >>> 0;
    this.parentIndex[nodeIndex] = input.parentIndex ?? WASM64_SOA_NO_PARENT;
    this.flags[nodeIndex] =
      ((input.flags ?? Wasm64NodeFlag.Visible) | Wasm64NodeFlag.Active | Wasm64NodeFlag.Dirty) >>> 0;
    this.blendMode[nodeIndex] = (input.blendMode ?? Wasm64BlendMode.Normal) & 0xff;
    this.opacity[nodeIndex] = Math.min(1, Math.max(0, input.opacity ?? 1));
    this.boundsX[nodeIndex] = input.boundsX ?? 0; this.boundsY[nodeIndex] = input.boundsY ?? 0;
    this.boundsW[nodeIndex] = input.boundsW ?? 0; this.boundsH[nodeIndex] = input.boundsH ?? 0;
    this.zOrder[nodeIndex] = (input.zOrder ?? nodeIndex) | 0;
    this.tileArenaOffset[nodeIndex] = (input.tileArenaOffset ?? WASM64_SOA_NO_TILE_OFFSET) >>> 0;
    this.dirtyGeneration[nodeIndex] = this.pendingGeneration();
    if (nodeIndex + 1 > this.loadAtomic(HDR.ACTIVE_COUNT)) this.storeAtomic(HDR.ACTIVE_COUNT, nodeIndex + 1);
  }

  markNodeDirty(nodeIndex: number): void {
    this.assertIndex(nodeIndex);
    this.flags[nodeIndex] = (this.flags[nodeIndex] | Wasm64NodeFlag.Dirty) >>> 0;
    this.dirtyGeneration[nodeIndex] = this.pendingGeneration();
  }

  setNodeOpacity(nodeIndex: number, value: number): void {
    this.assertIndex(nodeIndex);
    this.opacity[nodeIndex] = Math.min(1, Math.max(0, value));
    this.markNodeDirty(nodeIndex);
  }

  setNodeBounds(nodeIndex: number, x: number, y: number, w: number, h: number): void {
    this.assertIndex(nodeIndex);
    this.boundsX[nodeIndex] = x; this.boundsY[nodeIndex] = y;
    this.boundsW[nodeIndex] = w; this.boundsH[nodeIndex] = h;
    this.markNodeDirty(nodeIndex);
  }

  setNodeTileArenaOffset(nodeIndex: number, tileArenaOffset: number): void {
    this.assertIndex(nodeIndex);
    this.tileArenaOffset[nodeIndex] = tileArenaOffset >>> 0;
    this.markNodeDirty(nodeIndex);
  }

  /** 노드 더티 스탬프 완료 후 `Atomics.add`로 세대 번호를 Release 발행한다. */
  commitGeneration(): Wasm64SoaCommitSnapshot {
    const targetGen = this.pendingGeneration();
    const activeNodeCount = this.loadAtomic(HDR.ACTIVE_COUNT);
    let dirtyNodeCount = 0;
    for (let i = 0; i < activeNodeCount; i += 1) {
      if ((this.flags[i] & Wasm64NodeFlag.Dirty) !== 0 || this.dirtyGeneration[i] === targetGen) {
        this.dirtyGeneration[i] = targetGen;
        this.flags[i] = (this.flags[i] & ~Wasm64NodeFlag.Dirty) >>> 0;
        dirtyNodeCount += 1;
      }
    }
    this.storeAtomic(HDR.LAST_DIRTY_COUNT, dirtyNodeCount);
    const generation = ((this.addAtomic(HDR.COMMITTED_GEN, 1) >>> 0) + 1) >>> 0;
    return { generation, activeNodeCount, dirtyNodeCount, seqlockVersion: this.seqlockVersion };
  }

  /** `sinceGeneration` 이후 커밋된 더티 노드 인덱스를 힙 할당 없이 `outIndices`에 채운다. */
  collectDirtyIndicesSince(sinceGeneration: number, outIndices: Int32Array): number {
    const committed = this.committedGeneration;
    const active = this.activeNodeCount;
    let count = 0;
    for (let i = 0; i < active && count < outIndices.length; i += 1) {
      const nodeGen = this.dirtyGeneration[i];
      if (nodeGen > sinceGeneration && nodeGen <= committed) {
        outIndices[count] = i;
        count += 1;
      }
    }
    return count;
  }

  readNodeInto(nodeIndex: number, out: Wasm64SoaNodeState): Wasm64SoaNodeState {
    this.assertIndex(nodeIndex);
    out.layerId = this.layerIds[nodeIndex]; out.parentIndex = this.parentIndex[nodeIndex];
    out.flags = this.flags[nodeIndex]; out.blendMode = this.blendMode[nodeIndex];
    out.opacity = this.opacity[nodeIndex]; out.boundsX = this.boundsX[nodeIndex];
    out.boundsY = this.boundsY[nodeIndex]; out.boundsW = this.boundsW[nodeIndex];
    out.boundsH = this.boundsH[nodeIndex]; out.zOrder = this.zOrder[nodeIndex];
    out.dirtyGeneration = this.dirtyGeneration[nodeIndex];
    out.tileArenaOffset = this.tileArenaOffset[nodeIndex];
    return out;
  }

  get activeNodeCount(): number { return this.loadAtomic(HDR.ACTIVE_COUNT); }
  get committedGeneration(): number { return this.loadAtomic(HDR.COMMITTED_GEN) >>> 0; }
  get lastCommitDirtyCount(): number { return this.loadAtomic(HDR.LAST_DIRTY_COUNT); }
  get seqlockVersion(): number { return this.loadAtomic(HDR.SEQLOCK) >>> 0; }
  get isWriteInProgress(): boolean { return (this.seqlockVersion & 1) === 1; }

  getColumnOffsets(): Wasm64SoaColumnOffsets {
    return {
      baseByteOffset: this.baseByteOffset, totalByteLength: this.totalByteLength,
      seqlockByteOffset: this.baseByteOffset + WASM64_SOA_SEQLOCK_BYTE_OFFSET,
      layerIds: this.layerIds.byteOffset, parentIndex: this.parentIndex.byteOffset,
      flags: this.flags.byteOffset, blendMode: this.blendMode.byteOffset, opacity: this.opacity.byteOffset,
      boundsX: this.boundsX.byteOffset, boundsY: this.boundsY.byteOffset,
      boundsW: this.boundsW.byteOffset, boundsH: this.boundsH.byteOffset,
      zOrder: this.zOrder.byteOffset, dirtyGeneration: this.dirtyGeneration.byteOffset,
      tileArenaOffset: this.tileArenaOffset.byteOffset,
    };
  }
}
