/**
 * 세대 기반(Generational) 안전 메모리 풀 · 실시간 단편화 압축기 및 정렬 SIMD 바이너리 프레임 직렬화.
 *
 * - `(index, generation)` 세대 핸들 검증으로 WASM 선형 메모리 UAF/ABA/이중 해제를 원천 차단한다.
 * - `GenerationalArenaCompactor.compact()`는 핸들 간접 테이블을 유지한 채 활성 슬랩을 저주소로
 *   밀착 이동하여 외부 단편화율을 `0%`로 되돌린다.
 * - WebGPU À-Trous 에지 보존 디노이저 API(`./webgpu-atrous-denoiser`)를 함께 재노출한다.
 */

export {
  ATROUS_UNIFORM_BYTES,
  ATROUS_WORKGROUP_X,
  ATROUS_WORKGROUP_Y,
  WGSL_ATROUS_BILATERAL_DENOISER,
  computeAtrousWorkgroups,
  createAtrousDenoiserPipelineDescriptor,
  denoiseRgbaAtrousCpu,
  packAtrousDenoiserUniforms,
  validateAtrousDenoiserWgsl,
  type AtrousDenoiseCpuResult,
  type AtrousDenoiserConfig,
  type AtrousPipelineDescriptor,
  type AtrousWgslValidation,
  type AtrousWorkgroupGrid,
  type PackedAtrousUniforms,
} from "./webgpu-atrous-denoiser";

export const ARENA_SIMD_FRAME_MAGIC = 0x54534136 as const; // "TSA6"
export const ARENA_SIMD_FRAME_VERSION = 1 as const;
export const ARENA_DEFAULT_ALIGNMENT_BYTES = 16 as const;
const MAX_SLOT_INDEX = 0x00ffffff;
const MAX_GENERATION = 0x0fffffff;
const GENERATION_MULTIPLIER = 0x01000000;

export interface GenerationalHandle {
  readonly index: number;
  readonly generation: number;
  readonly packedId: number;
}

export type ArenaAccessError =
  | "invalid-handle"
  | "freed-handle"
  | "stale-handle"
  | "invalid-size"
  | "payload-exceeds-allocation"
  | "out-of-memory";

export type ArenaAllocResult =
  | {
      readonly ok: true;
      readonly handle: GenerationalHandle;
      readonly offset: number;
      readonly alignedBytes: number;
    }
  | {
      readonly ok: false;
      readonly error: "invalid-size" | "out-of-memory";
      readonly needsCompaction: boolean;
    };

export type ArenaReadResult =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly offset: number }
  | { readonly ok: false; readonly error: "invalid-handle" | "freed-handle" | "stale-handle" };

export type ArenaMutationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: ArenaAccessError };

export interface ArenaCompactorOptions {
  readonly capacityBytes: number;
  readonly alignmentBytes?: number;
  readonly autoCompactOnOom?: boolean;
  readonly zeroOnFree?: boolean;
}

export interface ArenaMemoryStats {
  readonly capacityBytes: number;
  readonly alignmentBytes: number;
  readonly liveHandles: number;
  readonly liveRequestedBytes: number;
  readonly liveAlignedBytes: number;
  readonly freeBytes: number;
  readonly freeBlockCount: number;
  readonly largestFreeBlockBytes: number;
  readonly fragmentationRatio: number;
  readonly staleAccessRejections: number;
  readonly compactionCount: number;
}

export interface ArenaCompactionReport {
  readonly movedAllocations: number;
  readonly bytesMoved: number;
  readonly freeBlocksBefore: number;
  readonly freeBlocksAfter: number;
  readonly largestFreeBlockBefore: number;
  readonly largestFreeBlockAfter: number;
  readonly fragmentationRatioBefore: number;
  readonly fragmentationRatioAfter: number;
  readonly liveBytesPreserved: number;
}

export interface SerializedArenaRecord {
  readonly handle: GenerationalHandle;
  readonly relativeOffset: number;
  readonly byteLength: number;
  readonly payload: Uint8Array;
}

export interface DeserializedArenaSimdFrame {
  readonly ok: true;
  readonly version: number;
  readonly alignmentBytes: number;
  readonly checksumHex: string;
  readonly totalFrameBytes: number;
  readonly records: readonly SerializedArenaRecord[];
}

export interface DeserializedArenaSimdFrameError {
  readonly ok: false;
  readonly error:
    | "frame-too-short"
    | "invalid-magic"
    | "unsupported-version"
    | "invalid-alignment"
    | "checksum-mismatch"
    | "bounds-error";
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

/**
 * `(index, generation)` 세대 핸들을 IEEE-754 안전 정수(52비트)로 패킹한다.
 */
export function packGenerationalHandle(index: number, generation: number): GenerationalHandle {
  const safeIndex = Math.max(0, Math.min(MAX_SLOT_INDEX, Math.floor(index)));
  const safeGen = Math.max(1, Math.min(MAX_GENERATION, Math.floor(generation)));
  return {
    index: safeIndex,
    generation: safeGen,
    packedId: safeGen * GENERATION_MULTIPLIER + safeIndex,
  };
}

/**
 * 패킹된 52비트 정수에서 `(index, generation)` 세대 핸들을 복원한다.
 */
export function unpackGenerationalHandle(packedId: number): GenerationalHandle {
  const safe = Math.max(GENERATION_MULTIPLIER, Math.floor(packedId));
  const index = safe % GENERATION_MULTIPLIER;
  const generation = Math.floor(safe / GENERATION_MULTIPLIER);
  return { index, generation, packedId: safe };
}

interface ArenaSlotRecord {
  alive: boolean;
  generation: number;
  offset: number;
  requestedBytes: number;
  alignedBytes: number;
  tag: string;
}

interface ArenaFreeBlock {
  offset: number;
  size: number;
}

function alignUp(size: number, alignment: number): number {
  const rem = size % alignment;
  return rem === 0 ? size : size + (alignment - rem);
}

function computeFnv1a32(bytes: Uint8Array, startOffset = 0): number {
  let hash = 0x811c9dc5;
  for (let i = startOffset; i < bytes.byteLength; i += 1) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * 세대 핸들(`(index, generation)`) 검증 + 16바이트 SIMD 정렬 슬랩 할당 +
 * 실시간 단편화 압축(Defragmentation Compactor)을 제공하는 WASM 안전 메모리 풀.
 */
export class GenerationalArenaCompactor {
  private readonly capacityBytes: number;
  private readonly alignmentBytes: number;
  private readonly autoCompactOnOom: boolean;
  private readonly zeroOnFree: boolean;
  private readonly heap: Uint8Array;
  private readonly slots: ArenaSlotRecord[] = [];
  private readonly freeSlotIndices: number[] = [];
  private freeBlocks: ArenaFreeBlock[];

  private liveHandles = 0;
  private liveRequestedBytes = 0;
  private liveAlignedBytes = 0;
  private staleAccessRejections = 0;
  private compactionCount = 0;

  constructor(options: ArenaCompactorOptions) {
    const alignment = options.alignmentBytes ?? ARENA_DEFAULT_ALIGNMENT_BYTES;
    if (!Number.isInteger(alignment) || alignment < 4 || (alignment & (alignment - 1)) !== 0) {
      throw new RangeError(`정렬 바이트는 4 이상의 2의 거듭제곱이어야 합니다: ${alignment}`);
    }
    this.alignmentBytes = alignment;
    this.capacityBytes = Math.max(alignment * 4, alignUp(Math.floor(options.capacityBytes), alignment));
    this.autoCompactOnOom = options.autoCompactOnOom ?? false;
    this.zeroOnFree = options.zeroOnFree ?? true;
    this.heap = new Uint8Array(this.capacityBytes);
    this.freeBlocks = [{ offset: 0, size: this.capacityBytes }];
  }

  allocate(sizeBytes: number, initialData?: Uint8Array, tag = "slab"): ArenaAllocResult {
    const requestedBytes = Math.floor(sizeBytes);
    if (!Number.isFinite(requestedBytes) || requestedBytes <= 0) {
      return { ok: false, error: "invalid-size", needsCompaction: false };
    }
    if (initialData && initialData.byteLength > requestedBytes) {
      return { ok: false, error: "invalid-size", needsCompaction: false };
    }

    const alignedBytes = alignUp(requestedBytes, this.alignmentBytes);
    let blockIdx = this.findFirstFitFreeBlock(alignedBytes);

    if (blockIdx < 0) {
      const totalFree = this.capacityBytes - this.liveAlignedBytes;
      const canRecoverByCompact = totalFree >= alignedBytes;
      if (canRecoverByCompact && this.autoCompactOnOom) {
        this.compact();
        blockIdx = this.findFirstFitFreeBlock(alignedBytes);
      } else {
        return { ok: false, error: "out-of-memory", needsCompaction: canRecoverByCompact };
      }
    }

    const block = blockIdx >= 0 ? this.freeBlocks[blockIdx] : undefined;
    if (!block) return { ok: false, error: "out-of-memory", needsCompaction: false };

    const offset = block.offset;
    if (block.size === alignedBytes) {
      this.freeBlocks.splice(blockIdx, 1);
    } else {
      block.offset += alignedBytes;
      block.size -= alignedBytes;
    }

    let slotIndex: number;
    let generation: number;
    const recycled = this.freeSlotIndices.pop();
    if (recycled !== undefined) {
      slotIndex = recycled;
      const existing = this.slots[slotIndex];
      if (!existing) return { ok: false, error: "out-of-memory", needsCompaction: false };
      existing.alive = true;
      existing.offset = offset;
      existing.requestedBytes = requestedBytes;
      existing.alignedBytes = alignedBytes;
      existing.tag = tag;
      generation = existing.generation;
    } else {
      slotIndex = this.slots.length;
      generation = 1;
      this.slots.push({ alive: true, generation, offset, requestedBytes, alignedBytes, tag });
    }

    if (initialData) {
      this.heap.set(initialData, offset);
      if (alignedBytes > initialData.byteLength) {
        this.heap.fill(0, offset + initialData.byteLength, offset + alignedBytes);
      }
    } else {
      this.heap.fill(0, offset, offset + alignedBytes);
    }

    this.liveHandles += 1;
    this.liveRequestedBytes += requestedBytes;
    this.liveAlignedBytes += alignedBytes;

    return { ok: true, handle: packGenerationalHandle(slotIndex, generation), offset, alignedBytes };
  }

  isHandleAlive(handle: GenerationalHandle): boolean {
    const slot = this.slots[handle.index];
    return Boolean(slot && slot.alive && slot.generation === handle.generation);
  }

  read(handle: GenerationalHandle): ArenaReadResult {
    const validation = this.validateHandle(handle);
    if (!validation.ok) return validation;
    const { slot } = validation;
    return {
      ok: true,
      bytes: this.heap.slice(slot.offset, slot.offset + slot.requestedBytes),
      offset: slot.offset,
    };
  }

  write(handle: GenerationalHandle, payload: Uint8Array): ArenaMutationResult {
    const validation = this.validateHandle(handle);
    if (!validation.ok) return validation;
    const { slot } = validation;
    if (payload.byteLength > slot.requestedBytes) {
      return { ok: false, error: "payload-exceeds-allocation" };
    }
    this.heap.set(payload, slot.offset);
    return { ok: true };
  }

  free(handle: GenerationalHandle): ArenaMutationResult {
    const validation = this.validateHandle(handle);
    if (!validation.ok) return validation;
    const { slot } = validation;

    if (this.zeroOnFree) this.heap.fill(0, slot.offset, slot.offset + slot.alignedBytes);

    this.insertAndCoalesceFreeBlock(slot.offset, slot.alignedBytes);
    this.liveHandles -= 1;
    this.liveRequestedBytes -= slot.requestedBytes;
    this.liveAlignedBytes -= slot.alignedBytes;

    slot.alive = false;
    slot.offset = 0;
    slot.requestedBytes = 0;
    slot.alignedBytes = 0;
    slot.generation = slot.generation >= MAX_GENERATION ? 1 : slot.generation + 1;
    this.freeSlotIndices.push(handle.index);
    return { ok: true };
  }

  compact(): ArenaCompactionReport {
    const beforeStats = this.getStats();
    const liveSlots = this.slots.filter((slot) => slot.alive).sort((a, b) => a.offset - b.offset);

    let writeCursor = 0;
    let movedAllocations = 0;
    let bytesMoved = 0;

    for (const slot of liveSlots) {
      if (slot.offset !== writeCursor) {
        this.heap.copyWithin(writeCursor, slot.offset, slot.offset + slot.alignedBytes);
        slot.offset = writeCursor;
        movedAllocations += 1;
        bytesMoved += slot.alignedBytes;
      }
      writeCursor += slot.alignedBytes;
    }

    if (this.zeroOnFree && writeCursor < this.capacityBytes) {
      this.heap.fill(0, writeCursor, this.capacityBytes);
    }

    const remaining = this.capacityBytes - writeCursor;
    this.freeBlocks = remaining > 0 ? [{ offset: writeCursor, size: remaining }] : [];
    this.compactionCount += 1;

    const afterStats = this.getStats();
    return {
      movedAllocations,
      bytesMoved,
      freeBlocksBefore: beforeStats.freeBlockCount,
      freeBlocksAfter: afterStats.freeBlockCount,
      largestFreeBlockBefore: beforeStats.largestFreeBlockBytes,
      largestFreeBlockAfter: afterStats.largestFreeBlockBytes,
      fragmentationRatioBefore: beforeStats.fragmentationRatio,
      fragmentationRatioAfter: afterStats.fragmentationRatio,
      liveBytesPreserved: afterStats.liveRequestedBytes,
    };
  }

  getStats(): ArenaMemoryStats {
    const freeBytes = this.capacityBytes - this.liveAlignedBytes;
    let largestFreeBlockBytes = 0;
    for (const block of this.freeBlocks) {
      if (block.size > largestFreeBlockBytes) largestFreeBlockBytes = block.size;
    }
    const fragmentationRatio = freeBytes <= 0 ? 0 : clampNumber(1 - largestFreeBlockBytes / freeBytes, 0, 1);

    return {
      capacityBytes: this.capacityBytes,
      alignmentBytes: this.alignmentBytes,
      liveHandles: this.liveHandles,
      liveRequestedBytes: this.liveRequestedBytes,
      liveAlignedBytes: this.liveAlignedBytes,
      freeBytes,
      freeBlockCount: this.freeBlocks.length,
      largestFreeBlockBytes,
      fragmentationRatio,
      staleAccessRejections: this.staleAccessRejections,
      compactionCount: this.compactionCount,
    };
  }

  serializeSimdFrame(): Uint8Array {
    const activeEntries: { readonly index: number; readonly slot: ArenaSlotRecord }[] = [];
    for (let i = 0; i < this.slots.length; i += 1) {
      const slot = this.slots[i];
      if (slot && slot.alive) activeEntries.push({ index: i, slot });
    }

    const headerBytes = 32;
    const payloadSectionOffset = alignUp(headerBytes + activeEntries.length * 16, this.alignmentBytes);
    let payloadSectionBytes = 0;
    for (const entry of activeEntries) {
      payloadSectionBytes += alignUp(entry.slot.requestedBytes, this.alignmentBytes);
    }

    const totalFrameBytes = payloadSectionOffset + payloadSectionBytes;
    const frame = new Uint8Array(totalFrameBytes);
    const view = new DataView(frame.buffer);

    let recordCursor = headerBytes;
    let payloadRelCursor = 0;
    for (const entry of activeEntries) {
      const alignedPayload = alignUp(entry.slot.requestedBytes, this.alignmentBytes);
      view.setUint32(recordCursor, entry.index, true);
      view.setUint32(recordCursor + 4, entry.slot.generation, true);
      view.setUint32(recordCursor + 8, payloadRelCursor, true);
      view.setUint32(recordCursor + 12, entry.slot.requestedBytes, true);
      recordCursor += 16;

      frame.set(
        this.heap.subarray(entry.slot.offset, entry.slot.offset + entry.slot.requestedBytes),
        payloadSectionOffset + payloadRelCursor,
      );
      payloadRelCursor += alignedPayload;
    }

    const checksum = computeFnv1a32(frame, headerBytes);
    view.setUint32(0, ARENA_SIMD_FRAME_MAGIC, true);
    view.setUint32(4, ARENA_SIMD_FRAME_VERSION, true);
    view.setUint32(8, this.alignmentBytes, true);
    view.setUint32(12, activeEntries.length, true);
    view.setUint32(16, payloadSectionOffset, true);
    view.setUint32(20, payloadSectionBytes, true);
    view.setUint32(24, totalFrameBytes, true);
    view.setUint32(28, checksum, true);

    return frame;
  }

  private validateHandle(
    handle: GenerationalHandle,
  ):
    | { readonly ok: true; readonly slot: ArenaSlotRecord }
    | { readonly ok: false; readonly error: "invalid-handle" | "freed-handle" | "stale-handle" } {
    if (
      !Number.isInteger(handle.index) ||
      handle.index < 0 ||
      handle.index >= this.slots.length ||
      !Number.isInteger(handle.generation) ||
      handle.generation <= 0
    ) {
      this.staleAccessRejections += 1;
      return { ok: false, error: "invalid-handle" };
    }
    const slot = this.slots[handle.index];
    if (!slot) {
      this.staleAccessRejections += 1;
      return { ok: false, error: "invalid-handle" };
    }
    if (slot.generation !== handle.generation) {
      this.staleAccessRejections += 1;
      return { ok: false, error: "stale-handle" };
    }
    if (!slot.alive) {
      this.staleAccessRejections += 1;
      return { ok: false, error: "freed-handle" };
    }
    return { ok: true, slot };
  }

  private findFirstFitFreeBlock(alignedBytes: number): number {
    for (let i = 0; i < this.freeBlocks.length; i += 1) {
      const block = this.freeBlocks[i];
      if (block && block.size >= alignedBytes) return i;
    }
    return -1;
  }

  private insertAndCoalesceFreeBlock(offset: number, size: number): void {
    this.freeBlocks.push({ offset, size });
    this.freeBlocks.sort((a, b) => a.offset - b.offset);

    const merged: ArenaFreeBlock[] = [];
    for (const block of this.freeBlocks) {
      const prev = merged[merged.length - 1];
      if (prev && prev.offset + prev.size === block.offset) {
        prev.size += block.size;
      } else {
        merged.push({ offset: block.offset, size: block.size });
      }
    }
    this.freeBlocks = merged;
  }
}

/**
 * 정렬 SIMD 바이너리 프레임을 매직·정렬·경계·체크섬 검증과 함께 역직렬화한다.
 */
export function deserializeArenaSimdFrame(
  frame: Uint8Array,
): DeserializedArenaSimdFrame | DeserializedArenaSimdFrameError {
  if (frame.byteLength < 32) return { ok: false, error: "frame-too-short" };
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  if (view.getUint32(0, true) !== ARENA_SIMD_FRAME_MAGIC) return { ok: false, error: "invalid-magic" };
  const version = view.getUint32(4, true);
  if (version !== ARENA_SIMD_FRAME_VERSION) return { ok: false, error: "unsupported-version" };
  const alignmentBytes = view.getUint32(8, true);
  if (alignmentBytes < 4 || (alignmentBytes & (alignmentBytes - 1)) !== 0) {
    return { ok: false, error: "invalid-alignment" };
  }

  const recordCount = view.getUint32(12, true);
  const payloadSectionOffset = view.getUint32(16, true);
  const payloadSectionBytes = view.getUint32(20, true);
  const totalFrameBytes = view.getUint32(24, true);
  const expectedChecksum = view.getUint32(28, true);

  if (
    totalFrameBytes !== frame.byteLength ||
    payloadSectionOffset % alignmentBytes !== 0 ||
    payloadSectionOffset + payloadSectionBytes > frame.byteLength ||
    32 + recordCount * 16 > payloadSectionOffset
  ) {
    return { ok: false, error: "bounds-error" };
  }

  if (computeFnv1a32(frame, 32) !== expectedChecksum) return { ok: false, error: "checksum-mismatch" };

  const records: SerializedArenaRecord[] = [];
  for (let i = 0; i < recordCount; i += 1) {
    const recOffset = 32 + i * 16;
    const index = view.getUint32(recOffset, true);
    const generation = view.getUint32(recOffset + 4, true);
    const relativeOffset = view.getUint32(recOffset + 8, true);
    const byteLength = view.getUint32(recOffset + 12, true);
    const absStart = payloadSectionOffset + relativeOffset;
    if (relativeOffset % alignmentBytes !== 0 || absStart + byteLength > frame.byteLength) {
      return { ok: false, error: "bounds-error" };
    }
    records.push({
      handle: packGenerationalHandle(index, generation),
      relativeOffset,
      byteLength,
      payload: frame.slice(absStart, absStart + byteLength),
    });
  }

  return {
    ok: true,
    version,
    alignmentBytes,
    checksumHex: expectedChecksum.toString(16).padStart(8, "0"),
    totalFrameBytes,
    records,
  };
}
