/**
 * 64바이트 캐시라인 정렬 공유 메모리(SharedArrayBuffer) Bump + Fixed-Slab 아레나 할당기.
 *
 * - `crossOriginIsolated` 또는 Node 런타임에서는 `SharedArrayBuffer`를 사용하고,
 *   SAB 비활성 환경에서는 동일 API로 `ArrayBuffer`로 자동 폴백한다.
 * - `resetFrame()`은 O(1) 제로-GC 프레임 리셋을 수행하며, `pinPersistentBoundary()`로
 *   영속 SoA 구조를 리셋 영역 밖으로 고정할 수 있다.
 */

export const WASM64_CACHE_LINE_BYTES = 64;

export type Wasm64ArenaBackingMode = "shared-array-buffer" | "array-buffer-fallback";

export interface Wasm64SharedArenaOptions {
  readonly capacityBytes: number;
  readonly slabCount?: number;
  readonly slabSizeBytes?: number;
  readonly preferShared?: boolean;
  readonly crossOriginIsolatedOverride?: boolean;
  readonly backingBuffer?: ArrayBufferLike;
}

export interface Wasm64ArenaSlice {
  readonly buffer: ArrayBufferLike;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly alignment: number;
  readonly paddingBytes: number;
  readonly bytes: Uint8Array;
}

export interface Wasm64SlabHandle {
  readonly slabIndex: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
}

export interface Wasm64ArenaStats {
  readonly backingMode: Wasm64ArenaBackingMode;
  readonly isShared: boolean;
  readonly capacityBytes: number;
  readonly bumpCapacityBytes: number;
  readonly usedBytes: number;
  readonly frameBaseOffset: number;
  readonly frameUsedBytes: number;
  readonly availableBumpBytes: number;
  readonly peakHighWaterBytes: number;
  readonly allocationCount: number;
  readonly totalAllocationCount: number;
  readonly frameResetCount: number;
  readonly paddingWasteBytes: number;
  readonly internalFragmentationRatio: number;
  readonly slabCount: number;
  readonly slabSizeBytes: number;
  readonly slabsInUse: number;
  readonly peakSlabsInUse: number;
  readonly slabFreeCount: number;
}

export class Wasm64ArenaOverflowError extends RangeError {
  readonly region: "bump" | "slab";
  readonly requestedBytes: number;
  readonly alignedOffset: number;
  readonly availableBytes: number;
  readonly capacityBytes: number;

  constructor(params: {
    readonly region: "bump" | "slab";
    readonly requestedBytes: number;
    readonly alignedOffset: number;
    readonly availableBytes: number;
    readonly capacityBytes: number;
  }) {
    super(
      `Wasm64SharedArena ${params.region} overflow: requested ${params.requestedBytes}B at aligned offset ${params.alignedOffset}B (available ${params.availableBytes}B / capacity ${params.capacityBytes}B)`,
    );
    this.name = "Wasm64ArenaOverflowError";
    this.region = params.region;
    this.requestedBytes = params.requestedBytes;
    this.alignedOffset = params.alignedOffset;
    this.availableBytes = params.availableBytes;
    this.capacityBytes = params.capacityBytes;
  }
}

export function isPowerOfTwo(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

export function alignUp(offset: number, alignment: number = WASM64_CACHE_LINE_BYTES): number {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError(`alignUp offset must be a non-negative safe integer (got ${offset})`);
  }
  if (!isPowerOfTwo(alignment)) {
    throw new RangeError(`alignment must be a positive power of two (got ${alignment})`);
  }
  if (offset <= 0x7fffffff && alignment <= 0x40000000) {
    const mask = alignment - 1;
    return (offset + mask) & ~mask;
  }
  const remainder = offset % alignment;
  return remainder === 0 ? offset : offset + (alignment - remainder);
}

export function isSharedArrayBufferSupported(crossOriginIsolatedOverride?: boolean): boolean {
  if (typeof SharedArrayBuffer !== "function") return false;
  const isolated =
    typeof crossOriginIsolatedOverride === "boolean"
      ? crossOriginIsolatedOverride
      : typeof globalThis.crossOriginIsolated === "boolean"
        ? globalThis.crossOriginIsolated
        : true;
  if (!isolated) return false;
  try {
    new SharedArrayBuffer(0);
    return true;
  } catch {
    return false;
  }
}

export function isSharedBufferInstance(buffer: ArrayBufferLike): buffer is SharedArrayBuffer {
  return typeof SharedArrayBuffer === "function" && buffer instanceof SharedArrayBuffer;
}

function createBackingBuffer(
  byteLength: number,
  preferShared: boolean,
  crossOriginIsolatedOverride?: boolean,
): { readonly buffer: ArrayBufferLike; readonly isShared: boolean } {
  if (preferShared && isSharedArrayBufferSupported(crossOriginIsolatedOverride)) {
    return { buffer: new SharedArrayBuffer(byteLength), isShared: true };
  }
  return { buffer: new ArrayBuffer(byteLength), isShared: false };
}

export class Wasm64SharedArena {
  readonly buffer: ArrayBufferLike;
  readonly isShared: boolean;
  readonly backingMode: Wasm64ArenaBackingMode;
  readonly capacityBytes: number;
  readonly bumpCapacityBytes: number;
  readonly slabRegionOffset: number;
  readonly slabCount: number;
  readonly slabSizeBytes: number;

  private cursor = 0;
  private frameBaseOffset = 0;
  private peakHighWaterBytes = 0;
  private allocationCount = 0;
  private totalAllocationCount = 0;
  private frameResetCount = 0;
  private paddingWasteBytes = 0;
  private readonly slabFreeStack: Int32Array;
  private readonly slabInUseFlags: Uint8Array;
  private slabFreeTop = 0;
  private peakSlabsInUse = 0;

  constructor(options: Wasm64SharedArenaOptions) {
    if (!Number.isSafeInteger(options.capacityBytes) || options.capacityBytes <= 0) {
      throw new RangeError(`capacityBytes must be a positive integer (got ${options.capacityBytes})`);
    }
    const requestedSlabCount = options.slabCount ?? 0;
    const requestedSlabSize = options.slabSizeBytes ?? 0;
    if (!Number.isSafeInteger(requestedSlabCount) || requestedSlabCount < 0) {
      throw new RangeError(`slabCount must be a non-negative integer (got ${requestedSlabCount})`);
    }
    if (requestedSlabCount > 0 && (!Number.isSafeInteger(requestedSlabSize) || requestedSlabSize <= 0)) {
      throw new RangeError(`slabSizeBytes must be > 0 when slabCount > 0 (got ${requestedSlabSize})`);
    }

    const alignedSlabSize =
      requestedSlabCount > 0 ? alignUp(requestedSlabSize, WASM64_CACHE_LINE_BYTES) : 0;
    const totalSlabBytes = requestedSlabCount * alignedSlabSize;

    if (options.backingBuffer) {
      if (options.backingBuffer.byteLength < options.capacityBytes) {
        throw new RangeError(
          `backingBuffer (${options.backingBuffer.byteLength}B) < capacityBytes (${options.capacityBytes}B)`,
        );
      }
      this.buffer = options.backingBuffer;
      this.isShared = isSharedBufferInstance(options.backingBuffer);
      this.capacityBytes = options.backingBuffer.byteLength;
    } else {
      const normalizedCapacity = alignUp(options.capacityBytes, WASM64_CACHE_LINE_BYTES);
      const created = createBackingBuffer(
        normalizedCapacity,
        options.preferShared ?? true,
        options.crossOriginIsolatedOverride,
      );
      this.buffer = created.buffer;
      this.isShared = created.isShared;
      this.capacityBytes = normalizedCapacity;
    }

    if (totalSlabBytes > this.capacityBytes) {
      throw new RangeError(`Slab pool (${totalSlabBytes}B) exceeds arena capacity (${this.capacityBytes}B)`);
    }

    this.backingMode = this.isShared ? "shared-array-buffer" : "array-buffer-fallback";
    this.slabCount = requestedSlabCount;
    this.slabSizeBytes = alignedSlabSize;
    this.bumpCapacityBytes = this.capacityBytes - totalSlabBytes;
    this.slabRegionOffset = this.bumpCapacityBytes;
    this.slabFreeStack = new Int32Array(requestedSlabCount);
    this.slabInUseFlags = new Uint8Array(requestedSlabCount);
    for (let i = 0; i < requestedSlabCount; i += 1) {
      this.slabFreeStack[i] = requestedSlabCount - 1 - i;
    }
    this.slabFreeTop = requestedSlabCount;
  }

  /** 현재 Bump 커서를 프레임 리셋 기준선으로 고정해 영속 구조체를 보존한다. */
  pinPersistentBoundary(): number {
    this.frameBaseOffset = Math.min(alignUp(this.cursor, WASM64_CACHE_LINE_BYTES), this.bumpCapacityBytes);
    this.cursor = this.frameBaseOffset;
    if (this.cursor > this.peakHighWaterBytes) this.peakHighWaterBytes = this.cursor;
    return this.frameBaseOffset;
  }

  /** 64바이트 기본 캐시라인 정렬로 Bump 영역에서 연속 슬라이스를 할당한다. */
  allocAligned(byteLength: number, alignment: number = WASM64_CACHE_LINE_BYTES): Wasm64ArenaSlice {
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
      throw new RangeError(`byteLength must be a non-negative integer (got ${byteLength})`);
    }
    const alignedOffset = alignUp(this.cursor, alignment);
    const nextCursor = alignedOffset + byteLength;
    if (nextCursor > this.bumpCapacityBytes) {
      throw new Wasm64ArenaOverflowError({
        region: "bump",
        requestedBytes: byteLength,
        alignedOffset,
        availableBytes: Math.max(0, this.bumpCapacityBytes - alignedOffset),
        capacityBytes: this.bumpCapacityBytes,
      });
    }
    const paddingBytes = alignedOffset - this.cursor;
    this.cursor = nextCursor;
    this.paddingWasteBytes += paddingBytes;
    this.allocationCount += 1;
    this.totalAllocationCount += 1;
    if (nextCursor > this.peakHighWaterBytes) this.peakHighWaterBytes = nextCursor;
    return {
      buffer: this.buffer,
      byteOffset: alignedOffset,
      byteLength,
      alignment,
      paddingBytes,
      bytes: new Uint8Array(this.buffer, alignedOffset, byteLength),
    };
  }

  allocUint8(count: number, alignment: number = WASM64_CACHE_LINE_BYTES): Uint8Array {
    this.assertCount(count, "allocUint8");
    return this.allocAligned(count, alignment).bytes;
  }

  allocInt32(count: number, alignment: number = WASM64_CACHE_LINE_BYTES): Int32Array {
    this.assertCount(count, "allocInt32");
    this.assertTypedAlignment(alignment, Int32Array.BYTES_PER_ELEMENT);
    const slice = this.allocAligned(count * Int32Array.BYTES_PER_ELEMENT, alignment);
    return new Int32Array(this.buffer, slice.byteOffset, count);
  }

  allocUint32(count: number, alignment: number = WASM64_CACHE_LINE_BYTES): Uint32Array {
    this.assertCount(count, "allocUint32");
    this.assertTypedAlignment(alignment, Uint32Array.BYTES_PER_ELEMENT);
    const slice = this.allocAligned(count * Uint32Array.BYTES_PER_ELEMENT, alignment);
    return new Uint32Array(this.buffer, slice.byteOffset, count);
  }

  allocFloat32(count: number, alignment: number = WASM64_CACHE_LINE_BYTES): Float32Array {
    this.assertCount(count, "allocFloat32");
    this.assertTypedAlignment(alignment, Float32Array.BYTES_PER_ELEMENT);
    const slice = this.allocAligned(count * Float32Array.BYTES_PER_ELEMENT, alignment);
    return new Float32Array(this.buffer, slice.byteOffset, count);
  }

  /** 고정 슬랩 풀에서 O(1) 제로-GC로 64바이트 정렬 슬랩 1개를 대여한다. */
  allocSlab(): Wasm64SlabHandle {
    if (this.slabCount === 0 || this.slabFreeTop <= 0) {
      throw new Wasm64ArenaOverflowError({
        region: "slab",
        requestedBytes: this.slabSizeBytes,
        alignedOffset: this.slabRegionOffset,
        availableBytes: 0,
        capacityBytes: this.slabCount * this.slabSizeBytes,
      });
    }
    this.slabFreeTop -= 1;
    const slabIndex = this.slabFreeStack[this.slabFreeTop];
    this.slabInUseFlags[slabIndex] = 1;
    const inUse = this.slabCount - this.slabFreeTop;
    if (inUse > this.peakSlabsInUse) this.peakSlabsInUse = inUse;
    const byteOffset = this.slabRegionOffset + slabIndex * this.slabSizeBytes;
    return {
      slabIndex,
      byteOffset,
      byteLength: this.slabSizeBytes,
      bytes: new Uint8Array(this.buffer, byteOffset, this.slabSizeBytes),
    };
  }

  /** 대여한 고정 슬랩을 O(1)으로 풀에 반납한다. */
  freeSlab(slabIndex: number): void {
    if (!Number.isSafeInteger(slabIndex) || slabIndex < 0 || slabIndex >= this.slabCount) {
      throw new RangeError(`Invalid slabIndex: ${slabIndex} (slabCount=${this.slabCount})`);
    }
    if (this.slabInUseFlags[slabIndex] === 0) {
      throw new RangeError(`Double free detected for slabIndex=${slabIndex}`);
    }
    this.slabInUseFlags[slabIndex] = 0;
    this.slabFreeStack[this.slabFreeTop] = slabIndex;
    this.slabFreeTop += 1;
  }

  /** 프레임 임시 할당을 O(1)으로 즉시 되감는다(버퍼 재할당·GC 없음). */
  resetFrame(): void {
    this.cursor = this.frameBaseOffset;
    this.allocationCount = 0;
    this.paddingWasteBytes = 0;
    this.frameResetCount += 1;
  }

  /** 영속 경계까지 포함해 Bump 영역 전체를 0으로 초기화한다. */
  resetAll(): void {
    this.frameBaseOffset = 0;
    this.cursor = 0;
    this.allocationCount = 0;
    this.paddingWasteBytes = 0;
    this.frameResetCount += 1;
  }

  getStats(): Wasm64ArenaStats {
    const usedBytes = this.cursor;
    const slabsInUse = this.slabCount - this.slabFreeTop;
    return {
      backingMode: this.backingMode,
      isShared: this.isShared,
      capacityBytes: this.capacityBytes,
      bumpCapacityBytes: this.bumpCapacityBytes,
      usedBytes,
      frameBaseOffset: this.frameBaseOffset,
      frameUsedBytes: usedBytes - this.frameBaseOffset,
      availableBumpBytes: this.bumpCapacityBytes - usedBytes,
      peakHighWaterBytes: this.peakHighWaterBytes,
      allocationCount: this.allocationCount,
      totalAllocationCount: this.totalAllocationCount,
      frameResetCount: this.frameResetCount,
      paddingWasteBytes: this.paddingWasteBytes,
      internalFragmentationRatio: usedBytes > 0 ? this.paddingWasteBytes / usedBytes : 0,
      slabCount: this.slabCount,
      slabSizeBytes: this.slabSizeBytes,
      slabsInUse,
      peakSlabsInUse: this.peakSlabsInUse,
      slabFreeCount: this.slabFreeTop,
    };
  }

  private assertCount(count: number, name: string): void {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError(`${name} count must be a non-negative integer (got ${count})`);
    }
  }

  private assertTypedAlignment(alignment: number, elementBytes: number): void {
    if (!isPowerOfTwo(alignment) || alignment < elementBytes) {
      throw new RangeError(`alignment must be a power of two >= ${elementBytes} (got ${alignment})`);
    }
  }
}
