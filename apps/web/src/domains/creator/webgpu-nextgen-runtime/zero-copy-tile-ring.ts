/**
 * Zero-Copy 선형 메모리 · SharedArrayBuffer Lock-Free SPSC 링버퍼 타일 버스.
 *
 * - COOP/COEP(`crossOriginIsolated`) 환경에서는 `SharedArrayBuffer` + `Atomics` acquire/release로
 *   워커-메인 스레드 간 무잠금(lock-free) SPSC 타일 전송을 수행하고, 비격리 환경에서는
 *   동일 헤더 규격의 `ArrayBuffer` 선형 메모리로 자동 폴백한다.
 * - 모든 타일 쓰기/읽기는 사전 할당된 단일 버퍼의 `subarray()` 뷰로만 슬라이싱해
 *   전송 핫패스에서 힙 할당 0건을 보장한다.
 * - 모든 프레임에 IEEE 802.3 CRC32와 FNV-1a 32-bit 이중 무결성 체크섬을 부착·검증한다.
 * - 메모리 압박(Memory Pressure) 발생 시 고수위 워터마크 초과 슬롯을 결정론적으로 회수해
 *   GC 스파이크와 GPU 스테이징 버퍼 누수를 차단한다.
 */

export const TILE_RING_MAGIC = 0x54535242; // 'TSRB'
export const TILE_RING_VERSION = 1;
export const TILE_RING_CACHE_LINE_BYTES = 64;
export const TILE_RING_HEADER_WORDS = 16; // 16 * 4 = 64 bytes
export const TILE_RING_HEADER_BYTES = TILE_RING_HEADER_WORDS * 4;
export const TILE_SLOT_META_WORDS = 8; // 8 * 4 = 32 bytes
export const TILE_SLOT_META_BYTES = TILE_SLOT_META_WORDS * 4;

/** 링버퍼 헤더 Int32 워드 오프셋 규약. */
export const RING_HEADER_OFFSET = Object.freeze({
  MAGIC: 0,
  VERSION: 1,
  SLOT_COUNT: 2,
  SLOT_STRIDE_BYTES: 3,
  TILE_WIDTH: 4,
  TILE_HEIGHT: 5,
  WRITE_CURSOR: 6,
  READ_CURSOR: 7,
  DROPPED_OVERFLOW_COUNT: 8,
  RECLAIMED_SLOT_COUNT: 9,
  CHECKSUM_MISMATCH_COUNT: 10,
  HIGH_WATERMARK_SLOTS: 11,
  PRESSURE_EVICTION_COUNT: 12,
  EPOCH_GENERATION: 13,
  RESERVED_0: 14,
  RESERVED_1: 15,
});

/** 슬롯별 32바이트 메타데이터 헤더 Uint32 워드 오프셋 규약. */
export const SLOT_META_OFFSET = Object.freeze({
  FRAME_ID: 0,
  TILE_X: 1,
  TILE_Y: 2,
  LAYER_ID: 3,
  BYTE_LENGTH: 4,
  CRC32: 5,
  FNV1A32: 6,
  STATE_FLAGS: 7,
});

export const SLOT_STATE = Object.freeze({
  FREE: 0,
  WRITING: 1,
  READY: 2,
  READING: 3,
  RECLAIMED: 4,
});

export type TileRingBackingPreference = "auto" | "shared" | "arraybuffer";
export type TileRingBackingMode = "shared-array-buffer" | "array-buffer";
export type MemoryPressureLevel = "normal" | "elevated" | "critical";

export interface TileRingConfig {
  /** 슬롯 개수 (2의 거듭제곱으로 정규화, 최소 4, 최대 1024). */
  readonly slotCount?: number;
  /** 타일 가로 픽셀 수 (RGBA8, 기본 64). */
  readonly tileWidth?: number;
  /** 타일 세로 픽셀 수 (RGBA8, 기본 64). */
  readonly tileHeight?: number;
  /** 선형 메모리 백킹 선택 (`auto`는 COOP/COEP 격리 시 SharedArrayBuffer 자동 선택). */
  readonly backingMode?: TileRingBackingPreference;
  /** 메모리 압박 상한 임계 비율 (기본 0.75). */
  readonly highWaterRatio?: number;
  /** 압박 회수 목표 비율 (기본 0.5). */
  readonly targetWaterRatio?: number;
}

export interface TileFrameDescriptor {
  readonly frameId: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly layerId: number;
}

export interface TileIntegrityChecksums {
  readonly crc32: number;
  readonly fnv1a32: number;
}

export interface TileWriteResult {
  readonly ok: boolean;
  readonly status: "committed" | "ring-full" | "payload-too-large";
  readonly slotIndex: number;
  readonly frameId: number;
  readonly byteLength: number;
  readonly checksums: TileIntegrityChecksums | null;
  readonly zeroCopyBufferReuse: boolean;
}

export interface TileConsumeResult {
  readonly ok: boolean;
  readonly status: "ok" | "empty" | "checksum-mismatch";
  readonly slotIndex: number;
  readonly frameId: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly layerId: number;
  readonly byteLength: number;
  readonly payloadView: Uint8Array | null;
  readonly expectedChecksums: TileIntegrityChecksums | null;
  readonly actualChecksums: TileIntegrityChecksums | null;
  readonly zeroCopyBufferReuse: boolean;
}

export interface MemoryPressureReclaimOptions {
  readonly targetWaterRatio?: number;
  readonly forceReclaim?: boolean;
  readonly zeroReclaimedPayload?: boolean;
}

export interface MemoryPressureReclaimReport {
  readonly triggered: boolean;
  readonly pressureLevelBefore: MemoryPressureLevel;
  readonly pressureLevelAfter: MemoryPressureLevel;
  readonly reclaimedSlots: number;
  readonly reclaimedBytes: number;
  readonly remainingPendingSlots: number;
  readonly epochGeneration: number;
}

export interface TileRingTelemetrySnapshot {
  readonly backingMode: TileRingBackingMode;
  readonly crossOriginIsolated: boolean;
  readonly atomicsEnabled: boolean;
  readonly slotCount: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly maxPayloadBytes: number;
  readonly slotStrideBytes: number;
  readonly totalBufferBytes: number;
  readonly writeCursor: number;
  readonly readCursor: number;
  readonly pendingSlots: number;
  readonly freeSlots: number;
  readonly occupancyRatio: number;
  readonly highWatermarkSlots: number;
  readonly droppedOverflowCount: number;
  readonly reclaimedSlotCount: number;
  readonly pressureEvictionCount: number;
  readonly checksumMismatchCount: number;
  readonly epochGeneration: number;
  readonly pressureLevel: MemoryPressureLevel;
}

/** IEEE 802.3 CRC32 조회 테이블 (256 엔트리, 1회 초기화). */
const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

/** 결정론적 IEEE 802.3 CRC32 체크섬을 계산한다. */
export function computeCrc32(bytes: Uint8Array, length = bytes.byteLength): number {
  const limit = Math.max(0, Math.min(length, bytes.byteLength));
  let crc = 0xffffffff;
  for (let i = 0; i < limit; i += 1) {
    const byteVal = bytes[i] ?? 0;
    const tableVal = CRC32_TABLE[(crc ^ byteVal) & 0xff] ?? 0;
    crc = tableVal ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** 결정론적 32-bit FNV-1a 해시를 계산한다. */
export function computeFnv1a32(bytes: Uint8Array, length = bytes.byteLength): number {
  const limit = Math.max(0, Math.min(length, bytes.byteLength));
  let hash = 0x811c9dc5;
  for (let i = 0; i < limit; i += 1) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** 타일 페이로드에 대한 CRC32 + FNV-1a 이중 무결성 체크섬을 산출한다. */
export function computeTileIntegrityChecksums(
  bytes: Uint8Array,
  length = bytes.byteLength,
): TileIntegrityChecksums {
  return {
    crc32: computeCrc32(bytes, length),
    fnv1a32: computeFnv1a32(bytes, length),
  };
}

/** 현재 런타임이 COOP/COEP `crossOriginIsolated` 및 `SharedArrayBuffer`를 지원하는지 판정한다. */
export function isCrossOriginIsolatedRuntime(): boolean {
  const isolated =
    typeof globalThis === "object" &&
    globalThis !== null &&
    "crossOriginIsolated" in globalThis &&
    Boolean((globalThis as { readonly crossOriginIsolated?: unknown }).crossOriginIsolated);
  return isolated && typeof SharedArrayBuffer === "function";
}

function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function normalizePowerOfTwoSlots(raw: number | undefined): number {
  const clamped = Math.max(4, Math.min(1024, Math.floor(raw ?? 16)));
  let power = 4;
  while (power < clamped && power < 1024) {
    power <<= 1;
  }
  return power;
}

function classifyPressureLevel(occupancyRatio: number, highWaterRatio: number): MemoryPressureLevel {
  if (occupancyRatio >= Math.min(0.95, highWaterRatio + 0.15)) {
    return "critical";
  }
  if (occupancyRatio >= highWaterRatio) {
    return "elevated";
  }
  return "normal";
}

/**
 * Lock-free SPSC 선형 메모리 타일 링버퍼 버스.
 * - 단일 선형 버퍼를 헤더(64B) + N개 정렬 슬롯(32B 메타 + RGBA8 페이로드)으로 분할한다.
 * - `SharedArrayBuffer` 연결 시 `Atomics` 메모리 펜스로 스레드 간 가시성을 보장한다.
 */
export class ZeroCopyTileRingBus {
  readonly backingBuffer: ArrayBufferLike;
  readonly backingMode: TileRingBackingMode;
  readonly atomicsEnabled: boolean;
  readonly slotCount: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly maxPayloadBytes: number;
  readonly slotStrideBytes: number;
  readonly highWaterRatio: number;
  readonly targetWaterRatio: number;

  private readonly slotMask: number;
  private readonly headerWords: Int32Array;
  private readonly linearBytes: Uint8Array;
  private readonly slotMetaViews: readonly Uint32Array[];
  private readonly slotPayloadViews: readonly Uint8Array[];

  constructor(config: TileRingConfig = {}) {
    this.slotCount = normalizePowerOfTwoSlots(config.slotCount);
    this.slotMask = this.slotCount - 1;
    this.tileWidth = Math.max(8, Math.min(1024, Math.floor(config.tileWidth ?? 64)));
    this.tileHeight = Math.max(8, Math.min(1024, Math.floor(config.tileHeight ?? 64)));
    this.maxPayloadBytes = this.tileWidth * this.tileHeight * 4;
    this.slotStrideBytes = alignUp(
      TILE_SLOT_META_BYTES + this.maxPayloadBytes,
      TILE_RING_CACHE_LINE_BYTES,
    );
    this.highWaterRatio = Math.max(0.5, Math.min(0.95, config.highWaterRatio ?? 0.75));
    this.targetWaterRatio = Math.max(0.1, Math.min(this.highWaterRatio - 0.05, config.targetWaterRatio ?? 0.5));

    const totalBytes = TILE_RING_HEADER_BYTES + this.slotCount * this.slotStrideBytes;
    const pref: TileRingBackingPreference = config.backingMode ?? "auto";
    const canUseShared =
      typeof SharedArrayBuffer === "function" &&
      (pref === "shared" || (pref === "auto" && isCrossOriginIsolatedRuntime()));

    if (canUseShared) {
      this.backingBuffer = new SharedArrayBuffer(totalBytes);
      this.backingMode = "shared-array-buffer";
      this.atomicsEnabled = typeof Atomics === "object" && Atomics !== null;
    } else {
      this.backingBuffer = new ArrayBuffer(totalBytes);
      this.backingMode = "array-buffer";
      this.atomicsEnabled = false;
    }

    this.headerWords = new Int32Array(this.backingBuffer, 0, TILE_RING_HEADER_WORDS);
    this.linearBytes = new Uint8Array(this.backingBuffer);

    const metaViews: Uint32Array[] = [];
    const payloadViews: Uint8Array[] = [];
    for (let slot = 0; slot < this.slotCount; slot += 1) {
      const slotOffset = TILE_RING_HEADER_BYTES + slot * this.slotStrideBytes;
      metaViews.push(new Uint32Array(this.backingBuffer, slotOffset, TILE_SLOT_META_WORDS));
      const payloadStart = slotOffset + TILE_SLOT_META_BYTES;
      payloadViews.push(this.linearBytes.subarray(payloadStart, payloadStart + this.maxPayloadBytes));
    }
    this.slotMetaViews = metaViews;
    this.slotPayloadViews = payloadViews;

    this.initializeHeader();
  }

  private initializeHeader(): void {
    this.writeHeader(RING_HEADER_OFFSET.MAGIC, TILE_RING_MAGIC);
    this.writeHeader(RING_HEADER_OFFSET.VERSION, TILE_RING_VERSION);
    this.writeHeader(RING_HEADER_OFFSET.SLOT_COUNT, this.slotCount);
    this.writeHeader(RING_HEADER_OFFSET.SLOT_STRIDE_BYTES, this.slotStrideBytes);
    this.writeHeader(RING_HEADER_OFFSET.TILE_WIDTH, this.tileWidth);
    this.writeHeader(RING_HEADER_OFFSET.TILE_HEIGHT, this.tileHeight);
    this.writeHeader(RING_HEADER_OFFSET.WRITE_CURSOR, 0);
    this.writeHeader(RING_HEADER_OFFSET.READ_CURSOR, 0);
    this.writeHeader(RING_HEADER_OFFSET.DROPPED_OVERFLOW_COUNT, 0);
    this.writeHeader(RING_HEADER_OFFSET.RECLAIMED_SLOT_COUNT, 0);
    this.writeHeader(RING_HEADER_OFFSET.CHECKSUM_MISMATCH_COUNT, 0);
    this.writeHeader(RING_HEADER_OFFSET.HIGH_WATERMARK_SLOTS, 0);
    this.writeHeader(RING_HEADER_OFFSET.PRESSURE_EVICTION_COUNT, 0);
    this.writeHeader(RING_HEADER_OFFSET.EPOCH_GENERATION, 1);
  }

  private readHeader(wordIndex: number): number {
    if (this.atomicsEnabled) {
      return Atomics.load(this.headerWords, wordIndex);
    }
    return this.headerWords[wordIndex] ?? 0;
  }

  private writeHeader(wordIndex: number, value: number): void {
    if (this.atomicsEnabled) {
      Atomics.store(this.headerWords, wordIndex, value | 0);
      return;
    }
    this.headerWords[wordIndex] = value | 0;
  }

  private addHeader(wordIndex: number, delta: number): number {
    if (this.atomicsEnabled) {
      return Atomics.add(this.headerWords, wordIndex, delta | 0);
    }
    const prev = this.headerWords[wordIndex] ?? 0;
    this.headerWords[wordIndex] = (prev + delta) | 0;
    return prev;
  }

  /** 주어진 Uint8Array 뷰가 이 링버퍼의 동일 선형 메모리를 제로카피로 가리키는지 검증한다. */
  isZeroCopyView(view: Uint8Array | null): boolean {
    return view !== null && view.buffer === this.backingBuffer;
  }

  /**
   * 제로카피 타일 쓰기: 선형 메모리 내부 슬롯 `subarray` 뷰에 직접 채우고 체크섬과 커서를 커밋한다.
   * `fillPayload` 콜백은 링버퍼 슬롯을 가리키는 `Uint8Array`를 직접 받아 인플레이스 기록한다.
   */
  writeTileInPlace(
    descriptor: TileFrameDescriptor,
    byteLength: number,
    fillPayload: (targetView: Uint8Array) => void,
  ): TileWriteResult {
    const normalizedBytes = Math.floor(byteLength);
    if (normalizedBytes <= 0 || normalizedBytes > this.maxPayloadBytes) {
      return {
        ok: false,
        status: "payload-too-large",
        slotIndex: -1,
        frameId: descriptor.frameId,
        byteLength: normalizedBytes,
        checksums: null,
        zeroCopyBufferReuse: false,
      };
    }

    const writeCursor = this.readHeader(RING_HEADER_OFFSET.WRITE_CURSOR);
    const readCursor = this.readHeader(RING_HEADER_OFFSET.READ_CURSOR);
    const pending = writeCursor - readCursor;
    if (pending >= this.slotCount) {
      this.addHeader(RING_HEADER_OFFSET.DROPPED_OVERFLOW_COUNT, 1);
      return {
        ok: false,
        status: "ring-full",
        slotIndex: -1,
        frameId: descriptor.frameId,
        byteLength: normalizedBytes,
        checksums: null,
        zeroCopyBufferReuse: false,
      };
    }

    const slotIndex = writeCursor & this.slotMask;
    const meta = this.slotMetaViews[slotIndex];
    const fullSlotView = this.slotPayloadViews[slotIndex];
    if (!meta || !fullSlotView) {
      return {
        ok: false,
        status: "ring-full",
        slotIndex: -1,
        frameId: descriptor.frameId,
        byteLength: normalizedBytes,
        checksums: null,
        zeroCopyBufferReuse: false,
      };
    }
    const activeView =
      normalizedBytes === this.maxPayloadBytes
        ? fullSlotView
        : fullSlotView.subarray(0, normalizedBytes);

    meta[SLOT_META_OFFSET.STATE_FLAGS] = SLOT_STATE.WRITING;
    fillPayload(activeView);
    const checksums = computeTileIntegrityChecksums(activeView, normalizedBytes);

    meta[SLOT_META_OFFSET.FRAME_ID] = descriptor.frameId >>> 0;
    meta[SLOT_META_OFFSET.TILE_X] = descriptor.tileX >>> 0;
    meta[SLOT_META_OFFSET.TILE_Y] = descriptor.tileY >>> 0;
    meta[SLOT_META_OFFSET.LAYER_ID] = descriptor.layerId >>> 0;
    meta[SLOT_META_OFFSET.BYTE_LENGTH] = normalizedBytes >>> 0;
    meta[SLOT_META_OFFSET.CRC32] = checksums.crc32 >>> 0;
    meta[SLOT_META_OFFSET.FNV1A32] = checksums.fnv1a32 >>> 0;
    meta[SLOT_META_OFFSET.STATE_FLAGS] = SLOT_STATE.READY;

    const nextWriteCursor = writeCursor + 1;
    this.writeHeader(RING_HEADER_OFFSET.WRITE_CURSOR, nextWriteCursor);

    const nextPending = nextWriteCursor - readCursor;
    const prevWatermark = this.readHeader(RING_HEADER_OFFSET.HIGH_WATERMARK_SLOTS);
    if (nextPending > prevWatermark) {
      this.writeHeader(RING_HEADER_OFFSET.HIGH_WATERMARK_SLOTS, nextPending);
    }

    return {
      ok: true,
      status: "committed",
      slotIndex,
      frameId: descriptor.frameId,
      byteLength: normalizedBytes,
      checksums,
      zeroCopyBufferReuse: activeView.buffer === this.backingBuffer,
    };
  }

  /** 기존 소스 타일 바이트를 링 슬롯으로 커밋한다 (내부 복사 외 힙 할당 0건). */
  enqueueTileBytes(descriptor: TileFrameDescriptor, sourceBytes: Uint8Array): TileWriteResult {
    return this.writeTileInPlace(descriptor, sourceBytes.byteLength, (targetView) => {
      targetView.set(sourceBytes);
    });
  }

  /**
   * 제로카피 타일 소비: 슬롯의 `subarray` 뷰를 그대로 반환하며 CRC32 + FNV-1a 무결성을 검증한다.
   */
  consumeTileZeroCopy(visitor?: (payloadView: Uint8Array, meta: TileFrameDescriptor) => void): TileConsumeResult {
    const readCursor = this.readHeader(RING_HEADER_OFFSET.READ_CURSOR);
    const writeCursor = this.readHeader(RING_HEADER_OFFSET.WRITE_CURSOR);
    if (readCursor >= writeCursor) {
      return {
        ok: false,
        status: "empty",
        slotIndex: -1,
        frameId: -1,
        tileX: 0,
        tileY: 0,
        layerId: 0,
        byteLength: 0,
        payloadView: null,
        expectedChecksums: null,
        actualChecksums: null,
        zeroCopyBufferReuse: false,
      };
    }

    const slotIndex = readCursor & this.slotMask;
    const meta = this.slotMetaViews[slotIndex];
    const fullSlotView = this.slotPayloadViews[slotIndex];
    if (!meta || !fullSlotView) {
      return {
        ok: false,
        status: "empty",
        slotIndex: -1,
        frameId: -1,
        tileX: 0,
        tileY: 0,
        layerId: 0,
        byteLength: 0,
        payloadView: null,
        expectedChecksums: null,
        actualChecksums: null,
        zeroCopyBufferReuse: false,
      };
    }
    meta[SLOT_META_OFFSET.STATE_FLAGS] = SLOT_STATE.READING;

    const frameId = meta[SLOT_META_OFFSET.FRAME_ID] ?? 0;
    const tileX = meta[SLOT_META_OFFSET.TILE_X] ?? 0;
    const tileY = meta[SLOT_META_OFFSET.TILE_Y] ?? 0;
    const layerId = meta[SLOT_META_OFFSET.LAYER_ID] ?? 0;
    const byteLength = Math.min(this.maxPayloadBytes, meta[SLOT_META_OFFSET.BYTE_LENGTH] ?? 0);
    const expectedChecksums: TileIntegrityChecksums = {
      crc32: meta[SLOT_META_OFFSET.CRC32] ?? 0,
      fnv1a32: meta[SLOT_META_OFFSET.FNV1A32] ?? 0,
    };

    const payloadView =
      byteLength === this.maxPayloadBytes ? fullSlotView : fullSlotView.subarray(0, byteLength);
    const actualChecksums = computeTileIntegrityChecksums(payloadView, byteLength);
    const intact =
      actualChecksums.crc32 === expectedChecksums.crc32 &&
      actualChecksums.fnv1a32 === expectedChecksums.fnv1a32;

    if (!intact) {
      this.addHeader(RING_HEADER_OFFSET.CHECKSUM_MISMATCH_COUNT, 1);
    } else if (visitor) {
      visitor(payloadView, { frameId, tileX, tileY, layerId });
    }

    meta[SLOT_META_OFFSET.STATE_FLAGS] = SLOT_STATE.FREE;
    this.writeHeader(RING_HEADER_OFFSET.READ_CURSOR, readCursor + 1);

    return {
      ok: intact,
      status: intact ? "ok" : "checksum-mismatch",
      slotIndex,
      frameId,
      tileX,
      tileY,
      layerId,
      byteLength,
      payloadView,
      expectedChecksums,
      actualChecksums,
      zeroCopyBufferReuse: payloadView.buffer === this.backingBuffer,
    };
  }

  /**
   * 무결성 검출 검증용 1바이트 비트플립 주입기 (테스트·시뮬레이터 전용).
   * 슬롯 페이로드의 지정 바이트를 XOR `0x01` 변조한다.
   */
  injectSingleBitFlip(slotIndex: number, byteOffset = 0): boolean {
    if (slotIndex < 0 || slotIndex >= this.slotCount) return false;
    const view = this.slotPayloadViews[slotIndex];
    if (!view || view.byteLength === 0) return false;
    const safeOffset = Math.max(0, Math.min(view.byteLength - 1, Math.floor(byteOffset)));
    view[safeOffset] = ((view[safeOffset] ?? 0) ^ 0x01) & 0xff;
    return true;
  }

  /**
   * 메모리 압박 풀 회수(Memory Pressure Pool Reclamation):
   * - 점유율이 고수위 워터마크를 넘거나 `forceReclaim`이 지정되면 가장 오래된 미소비 슬롯부터
   *   목표 수위(`targetWaterRatio`)까지 회수하고, 필요 시 페이로드를 0으로 클리어해 누수를 차단한다.
   */
  reclaimUnderMemoryPressure(
    options: MemoryPressureReclaimOptions = {},
  ): MemoryPressureReclaimReport {
    const readCursor = this.readHeader(RING_HEADER_OFFSET.READ_CURSOR);
    const writeCursor = this.readHeader(RING_HEADER_OFFSET.WRITE_CURSOR);
    const pendingBefore = Math.max(0, writeCursor - readCursor);
    const ratioBefore = pendingBefore / this.slotCount;
    const pressureLevelBefore = classifyPressureLevel(ratioBefore, this.highWaterRatio);

    const targetRatio = Math.max(
      0,
      Math.min(this.highWaterRatio, options.targetWaterRatio ?? this.targetWaterRatio),
    );
    const shouldReclaim = Boolean(options.forceReclaim) || ratioBefore >= this.highWaterRatio;

    if (!shouldReclaim || pendingBefore === 0) {
      return {
        triggered: false,
        pressureLevelBefore,
        pressureLevelAfter: pressureLevelBefore,
        reclaimedSlots: 0,
        reclaimedBytes: 0,
        remainingPendingSlots: pendingBefore,
        epochGeneration: this.readHeader(RING_HEADER_OFFSET.EPOCH_GENERATION),
      };
    }

    const desiredPending = Math.floor(this.slotCount * targetRatio);
    const slotsToEvict = Math.max(
      options.forceReclaim ? Math.min(pendingBefore, Math.max(1, pendingBefore - desiredPending)) : 0,
      Math.max(0, pendingBefore - desiredPending),
    );

    let reclaimedBytes = 0;
    for (let i = 0; i < slotsToEvict; i += 1) {
      const slotIndex = (readCursor + i) & this.slotMask;
      const meta = this.slotMetaViews[slotIndex];
      const payloadView = this.slotPayloadViews[slotIndex];
      if (!meta || !payloadView) continue;
      reclaimedBytes += meta[SLOT_META_OFFSET.BYTE_LENGTH] || this.maxPayloadBytes;
      if (options.zeroReclaimedPayload !== false) {
        payloadView.fill(0);
      }
      meta[SLOT_META_OFFSET.BYTE_LENGTH] = 0;
      meta[SLOT_META_OFFSET.STATE_FLAGS] = SLOT_STATE.RECLAIMED;
    }

    const nextReadCursor = readCursor + slotsToEvict;
    this.writeHeader(RING_HEADER_OFFSET.READ_CURSOR, nextReadCursor);
    this.addHeader(RING_HEADER_OFFSET.RECLAIMED_SLOT_COUNT, slotsToEvict);
    this.addHeader(RING_HEADER_OFFSET.PRESSURE_EVICTION_COUNT, 1);
    this.addHeader(RING_HEADER_OFFSET.EPOCH_GENERATION, 1);

    const remainingPendingSlots = Math.max(0, writeCursor - nextReadCursor);
    const ratioAfter = remainingPendingSlots / this.slotCount;
    const pressureLevelAfter = classifyPressureLevel(ratioAfter, this.highWaterRatio);

    return {
      triggered: slotsToEvict > 0,
      pressureLevelBefore,
      pressureLevelAfter,
      reclaimedSlots: slotsToEvict,
      reclaimedBytes,
      remainingPendingSlots,
      epochGeneration: this.readHeader(RING_HEADER_OFFSET.EPOCH_GENERATION),
    };
  }

  /** 현재 링버퍼 제어 헤더와 점유·압박 상태 스냅샷을 반환한다. */
  getTelemetrySnapshot(): TileRingTelemetrySnapshot {
    const writeCursor = this.readHeader(RING_HEADER_OFFSET.WRITE_CURSOR);
    const readCursor = this.readHeader(RING_HEADER_OFFSET.READ_CURSOR);
    const pendingSlots = Math.max(0, writeCursor - readCursor);
    const freeSlots = Math.max(0, this.slotCount - pendingSlots);
    const occupancyRatio = pendingSlots / this.slotCount;

    return {
      backingMode: this.backingMode,
      crossOriginIsolated: isCrossOriginIsolatedRuntime(),
      atomicsEnabled: this.atomicsEnabled,
      slotCount: this.slotCount,
      tileWidth: this.tileWidth,
      tileHeight: this.tileHeight,
      maxPayloadBytes: this.maxPayloadBytes,
      slotStrideBytes: this.slotStrideBytes,
      totalBufferBytes: this.backingBuffer.byteLength,
      writeCursor,
      readCursor,
      pendingSlots,
      freeSlots,
      occupancyRatio,
      highWatermarkSlots: this.readHeader(RING_HEADER_OFFSET.HIGH_WATERMARK_SLOTS),
      droppedOverflowCount: this.readHeader(RING_HEADER_OFFSET.DROPPED_OVERFLOW_COUNT),
      reclaimedSlotCount: this.readHeader(RING_HEADER_OFFSET.RECLAIMED_SLOT_COUNT),
      pressureEvictionCount: this.readHeader(RING_HEADER_OFFSET.PRESSURE_EVICTION_COUNT),
      checksumMismatchCount: this.readHeader(RING_HEADER_OFFSET.CHECKSUM_MISMATCH_COUNT),
      epochGeneration: this.readHeader(RING_HEADER_OFFSET.EPOCH_GENERATION),
      pressureLevel: classifyPressureLevel(occupancyRatio, this.highWaterRatio),
    };
  }
}
