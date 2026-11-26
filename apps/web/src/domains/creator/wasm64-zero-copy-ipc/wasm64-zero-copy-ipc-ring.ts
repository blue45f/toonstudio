/**
 * SharedArrayBuffer 기반 락프리 SPSC(Single-Producer Single-Consumer) 제로-카피 IPC 링 버퍼.
 *
 * - Producer `head`(64B)와 Consumer `tail`(128B)을 독립 64바이트 캐시라인에 격리해 False Sharing을
 *   제거하고 `Atomics.load`/`Atomics.store`(Acquire-Release)로 동기화한다.
 * - 고정 64바이트 바이너리 커맨드(`PointerStrokeBatch`, `TileDirtyCommit`,
 *   `CameraTransformUpdate`, `FrameTelemetrySample`)로 JSON 직렬화와 structured-clone을 제거한다.
 * - `!crossOriginIsolated` 또는 SAB 비활성 환경에서는 `ArrayBuffer` 링으로 자동 폴백한다.
 */

import {
  isPowerOfTwo,
  isSharedArrayBufferSupported,
  isSharedBufferInstance,
  WASM64_CACHE_LINE_BYTES,
  type Wasm64ArenaBackingMode,
} from "./wasm64-shared-arena";

export const WASM64_IPC_MAGIC = 0x54534950; // "TSIP"
export const WASM64_IPC_VERSION = 1;
export const WASM64_IPC_SLOT_STRIDE_BYTES = WASM64_CACHE_LINE_BYTES;
export const WASM64_IPC_SLOT_WORDS = WASM64_IPC_SLOT_STRIDE_BYTES / 4;
export const WASM64_IPC_HEAD_BYTE_OFFSET = 64;
export const WASM64_IPC_TAIL_BYTE_OFFSET = 128;
export const WASM64_IPC_DATA_BYTE_OFFSET = 256;

const CTRL = {
  MAGIC: 0, VERSION: 1, CAPACITY: 2, STRIDE: 3, FLAGS: 4,
  HEAD: WASM64_IPC_HEAD_BYTE_OFFSET / 4, // 16 (캐시라인 1)
  DROPPED: WASM64_IPC_HEAD_BYTE_OFFSET / 4 + 1,
  TAIL: WASM64_IPC_TAIL_BYTE_OFFSET / 4, // 32 (캐시라인 2)
  CONSUMED: WASM64_IPC_TAIL_BYTE_OFFSET / 4 + 1,
} as const;

export const Wasm64IpcOpcode = {
  Empty: 0, PointerStrokeBatch: 1, TileDirtyCommit: 2, CameraTransformUpdate: 3, FrameTelemetrySample: 4,
} as const;

export type Wasm64IpcOpcodeValue = (typeof Wasm64IpcOpcode)[keyof typeof Wasm64IpcOpcode];

export interface PointerStrokeBatchCommand {
  readonly opcode: typeof Wasm64IpcOpcode.PointerStrokeBatch;
  readonly sequence: number; readonly timestampMs: number; readonly layerId: number; readonly strokeId: number;
  readonly pointCount: number; readonly arenaByteOffset: number; readonly brushRadiusPx: number;
  readonly pressureMean: number; readonly minX: number; readonly minY: number;
  readonly maxX: number; readonly maxY: number; readonly flags: number;
}

export interface TileDirtyCommitCommand {
  readonly opcode: typeof Wasm64IpcOpcode.TileDirtyCommit;
  readonly sequence: number; readonly timestampMs: number; readonly layerId: number;
  readonly tileX: number; readonly tileY: number; readonly generation: number;
  readonly tileArenaOffset: number; readonly byteLength: number; readonly dirtyRectX: number;
  readonly dirtyRectY: number; readonly dirtyRectW: number; readonly dirtyRectH: number; readonly compressionKind: number;
}

export interface CameraTransformUpdateCommand {
  readonly opcode: typeof Wasm64IpcOpcode.CameraTransformUpdate;
  readonly sequence: number; readonly timestampMs: number; readonly panX: number; readonly panY: number;
  readonly zoom: number; readonly rotationRad: number; readonly viewportWidth: number;
  readonly viewportHeight: number; readonly devicePixelRatio: number; readonly flags: number;
}

export interface FrameTelemetrySampleCommand {
  readonly opcode: typeof Wasm64IpcOpcode.FrameTelemetrySample;
  readonly sequence: number; readonly timestampMs: number; readonly frameIndex: number;
  readonly frameTimeMs: number; readonly wasmKernelMs: number; readonly gpuSubmitMs: number;
  readonly dirtyTileCount: number; readonly arenaUsedBytes: number;
  readonly undoCompressedBytes: number; readonly ringDepth: number;
}

export type Wasm64IpcCommand =
  | PointerStrokeBatchCommand | TileDirtyCommitCommand | CameraTransformUpdateCommand | FrameTelemetrySampleCommand;

/** 핫패스 제로-할당 디코드용 재사용 스크래치 레코드. */
export interface Wasm64IpcScratchCommand {
  opcode: Wasm64IpcOpcodeValue; sequence: number; timestampMs: number;
  u0: number; u1: number; u2: number; u3: number; u4: number; u5: number; u6: number; u7: number;
  i0: number; i1: number; f0: number; f1: number; f2: number; f3: number; f4: number; f5: number; f6: number;
}

export interface Wasm64ZeroCopyIpcRingOptions {
  readonly capacitySlots: number; readonly preferShared?: boolean; readonly crossOriginIsolatedOverride?: boolean;
}

export interface Wasm64IpcRingStats {
  readonly backingMode: Wasm64ArenaBackingMode; readonly isShared: boolean;
  readonly capacitySlots: number; readonly slotStrideBytes: number; readonly totalByteLength: number;
  readonly headByteOffset: number; readonly tailByteOffset: number; readonly dataByteOffset: number;
  readonly pendingCount: number; readonly availableSlots: number;
  readonly droppedCount: number; readonly consumedCount: number;
}

export function createIpcScratchCommand(): Wasm64IpcScratchCommand {
  return {
    opcode: Wasm64IpcOpcode.Empty, sequence: 0, timestampMs: 0,
    u0: 0, u1: 0, u2: 0, u3: 0, u4: 0, u5: 0, u6: 0, u7: 0,
    i0: 0, i1: 0, f0: 0, f1: 0, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0,
  };
}

export function computeIpcRingByteLength(capacitySlots: number): number {
  if (!isPowerOfTwo(capacitySlots) || capacitySlots < 2) {
    throw new RangeError(`capacitySlots must be a power of two >= 2 (got ${capacitySlots})`);
  }
  return WASM64_IPC_DATA_BYTE_OFFSET + capacitySlots * WASM64_IPC_SLOT_STRIDE_BYTES;
}

export class Wasm64ZeroCopyIpcRing {
  readonly buffer: ArrayBufferLike;
  readonly isShared: boolean;
  readonly backingMode: Wasm64ArenaBackingMode;
  readonly capacitySlots: number;

  private readonly mask: number;
  private readonly ctrl: Int32Array;
  private readonly u32: Uint32Array;
  private readonly i32: Int32Array;
  private readonly f32: Float32Array;
  private readonly f64: Float64Array;
  private reservedHead = 0;

  private constructor(buffer: ArrayBufferLike, capacitySlots: number) {
    this.buffer = buffer;
    this.isShared = isSharedBufferInstance(buffer);
    this.backingMode = this.isShared ? "shared-array-buffer" : "array-buffer-fallback";
    this.capacitySlots = capacitySlots;
    this.mask = capacitySlots - 1;
    this.ctrl = new Int32Array(buffer, 0, WASM64_IPC_DATA_BYTE_OFFSET / 4);
    this.u32 = new Uint32Array(buffer);
    this.i32 = new Int32Array(buffer);
    this.f32 = new Float32Array(buffer);
    this.f64 = new Float64Array(buffer);
  }

  static create(options: Wasm64ZeroCopyIpcRingOptions): Wasm64ZeroCopyIpcRing {
    const byteLength = computeIpcRingByteLength(options.capacitySlots);
    const useShared =
      (options.preferShared ?? true) &&
      isSharedArrayBufferSupported(options.crossOriginIsolatedOverride);
    const buffer: ArrayBufferLike = useShared
      ? new SharedArrayBuffer(byteLength)
      : new ArrayBuffer(byteLength);
    const ring = new Wasm64ZeroCopyIpcRing(buffer, options.capacitySlots);
    ring.ctrl[CTRL.MAGIC] = WASM64_IPC_MAGIC;
    ring.ctrl[CTRL.VERSION] = WASM64_IPC_VERSION;
    ring.ctrl[CTRL.CAPACITY] = options.capacitySlots;
    ring.ctrl[CTRL.STRIDE] = WASM64_IPC_SLOT_STRIDE_BYTES;
    ring.ctrl[CTRL.FLAGS] = useShared ? 1 : 0;
    ring.storeCursor(CTRL.HEAD, 0);
    ring.storeCursor(CTRL.DROPPED, 0);
    ring.storeCursor(CTRL.TAIL, 0);
    ring.storeCursor(CTRL.CONSUMED, 0);
    return ring;
  }

  /** 워커·렌더러가 기존 공유 버퍼에 제로-카피로 직접 부착한다. */
  static attach(buffer: ArrayBufferLike): Wasm64ZeroCopyIpcRing {
    if (buffer.byteLength < WASM64_IPC_DATA_BYTE_OFFSET + 2 * WASM64_IPC_SLOT_STRIDE_BYTES) {
      throw new RangeError(`Buffer too small for Wasm64ZeroCopyIpcRing (${buffer.byteLength}B)`);
    }
    const header = new Int32Array(buffer, 0, 8);
    if (header[CTRL.MAGIC] !== WASM64_IPC_MAGIC || header[CTRL.VERSION] !== WASM64_IPC_VERSION) {
      throw new RangeError(`Invalid IPC ring header (magic=0x${(header[CTRL.MAGIC] >>> 0).toString(16)})`);
    }
    const capacitySlots = header[CTRL.CAPACITY];
    if (header[CTRL.STRIDE] !== WASM64_IPC_SLOT_STRIDE_BYTES || !isPowerOfTwo(capacitySlots)) {
      throw new RangeError(`Corrupt IPC ring layout: capacity=${capacitySlots}`);
    }
    const required = computeIpcRingByteLength(capacitySlots);
    if (buffer.byteLength < required) {
      throw new RangeError(`IPC ring buffer truncated: ${buffer.byteLength}B < ${required}B`);
    }
    return new Wasm64ZeroCopyIpcRing(buffer, capacitySlots);
  }

  private loadCursor(index: number): number {
    return this.isShared ? Atomics.load(this.ctrl, index) : this.ctrl[index];
  }

  private storeCursor(index: number, value: number): void {
    if (this.isShared) Atomics.store(this.ctrl, index, value);
    else this.ctrl[index] = value;
  }

  private reserveSlot(opcode: Wasm64IpcOpcodeValue, sequence: number, timestampMs: number): number {
    const head = this.loadCursor(CTRL.HEAD);
    const tail = this.loadCursor(CTRL.TAIL);
    if (((head - tail) >>> 0) >= this.capacitySlots) {
      this.storeCursor(CTRL.DROPPED, (this.loadCursor(CTRL.DROPPED) + 1) | 0);
      return -1;
    }
    this.reservedHead = head;
    const w = (WASM64_IPC_DATA_BYTE_OFFSET >> 2) + (head & this.mask) * WASM64_IPC_SLOT_WORDS;
    this.u32[w] = opcode;
    this.u32[w + 1] = sequence >>> 0;
    this.f64[(w + 2) >> 1] = timestampMs;
    return w;
  }

  private commitSlot(): void {
    this.storeCursor(CTRL.HEAD, (this.reservedHead + 1) | 0);
  }

  pushPointerStrokeBatch(
    sequence: number, timestampMs: number, layerId: number, strokeId: number,
    pointCount: number, arenaByteOffset: number, brushRadiusPx: number, pressureMean: number,
    minX: number, minY: number, maxX: number, maxY: number, flags: number,
  ): boolean {
    const w = this.reserveSlot(Wasm64IpcOpcode.PointerStrokeBatch, sequence, timestampMs);
    if (w < 0) return false;
    this.u32[w + 4] = layerId >>> 0; this.u32[w + 5] = strokeId >>> 0;
    this.u32[w + 6] = pointCount >>> 0; this.u32[w + 7] = arenaByteOffset >>> 0;
    this.f32[w + 8] = brushRadiusPx; this.f32[w + 9] = pressureMean;
    this.f32[w + 10] = minX; this.f32[w + 11] = minY;
    this.f32[w + 12] = maxX; this.f32[w + 13] = maxY;
    this.u32[w + 14] = flags >>> 0; this.u32[w + 15] = 0;
    this.commitSlot();
    return true;
  }

  pushTileDirtyCommit(
    sequence: number, timestampMs: number, layerId: number, tileX: number, tileY: number,
    generation: number, tileArenaOffset: number, byteLength: number,
    dirtyRectX: number, dirtyRectY: number, dirtyRectW: number, dirtyRectH: number,
    compressionKind: number,
  ): boolean {
    const w = this.reserveSlot(Wasm64IpcOpcode.TileDirtyCommit, sequence, timestampMs);
    if (w < 0) return false;
    this.u32[w + 4] = layerId >>> 0; this.i32[w + 5] = tileX | 0; this.i32[w + 6] = tileY | 0;
    this.u32[w + 7] = generation >>> 0; this.u32[w + 8] = tileArenaOffset >>> 0;
    this.u32[w + 9] = byteLength >>> 0; this.u32[w + 10] = dirtyRectX >>> 0;
    this.u32[w + 11] = dirtyRectY >>> 0; this.u32[w + 12] = dirtyRectW >>> 0;
    this.u32[w + 13] = dirtyRectH >>> 0; this.u32[w + 14] = compressionKind >>> 0; this.u32[w + 15] = 0;
    this.commitSlot();
    return true;
  }

  pushCameraTransformUpdate(
    sequence: number, timestampMs: number, panX: number, panY: number, zoom: number,
    rotationRad: number, viewportWidth: number, viewportHeight: number,
    devicePixelRatio: number, flags: number,
  ): boolean {
    const w = this.reserveSlot(Wasm64IpcOpcode.CameraTransformUpdate, sequence, timestampMs);
    if (w < 0) return false;
    this.f32[w + 4] = panX; this.f32[w + 5] = panY; this.f32[w + 6] = zoom;
    this.f32[w + 7] = rotationRad; this.f32[w + 8] = viewportWidth; this.f32[w + 9] = viewportHeight;
    this.f32[w + 10] = devicePixelRatio; this.u32[w + 11] = flags >>> 0;
    this.u32[w + 12] = 0; this.u32[w + 13] = 0; this.u32[w + 14] = 0; this.u32[w + 15] = 0;
    this.commitSlot();
    return true;
  }

  pushFrameTelemetrySample(
    sequence: number, timestampMs: number, frameIndex: number, frameTimeMs: number,
    wasmKernelMs: number, gpuSubmitMs: number, dirtyTileCount: number,
    arenaUsedBytes: number, undoCompressedBytes: number, ringDepth: number,
  ): boolean {
    const w = this.reserveSlot(Wasm64IpcOpcode.FrameTelemetrySample, sequence, timestampMs);
    if (w < 0) return false;
    this.u32[w + 4] = frameIndex >>> 0; this.f32[w + 5] = frameTimeMs;
    this.f32[w + 6] = wasmKernelMs; this.f32[w + 7] = gpuSubmitMs;
    this.u32[w + 8] = dirtyTileCount >>> 0; this.u32[w + 9] = arenaUsedBytes >>> 0;
    this.u32[w + 10] = undoCompressedBytes >>> 0; this.u32[w + 11] = ringDepth >>> 0;
    this.u32[w + 12] = 0; this.u32[w + 13] = 0; this.u32[w + 14] = 0; this.u32[w + 15] = 0;
    this.commitSlot();
    return true;
  }

  pushCommand(c: Wasm64IpcCommand): boolean {
    if (c.opcode === Wasm64IpcOpcode.PointerStrokeBatch) {
      return this.pushPointerStrokeBatch(
        c.sequence, c.timestampMs, c.layerId, c.strokeId, c.pointCount, c.arenaByteOffset,
        c.brushRadiusPx, c.pressureMean, c.minX, c.minY, c.maxX, c.maxY, c.flags,
      );
    }
    if (c.opcode === Wasm64IpcOpcode.TileDirtyCommit) {
      return this.pushTileDirtyCommit(
        c.sequence, c.timestampMs, c.layerId, c.tileX, c.tileY, c.generation, c.tileArenaOffset,
        c.byteLength, c.dirtyRectX, c.dirtyRectY, c.dirtyRectW, c.dirtyRectH, c.compressionKind,
      );
    }
    if (c.opcode === Wasm64IpcOpcode.CameraTransformUpdate) {
      return this.pushCameraTransformUpdate(
        c.sequence, c.timestampMs, c.panX, c.panY, c.zoom, c.rotationRad,
        c.viewportWidth, c.viewportHeight, c.devicePixelRatio, c.flags,
      );
    }
    return this.pushFrameTelemetrySample(
      c.sequence, c.timestampMs, c.frameIndex, c.frameTimeMs, c.wasmKernelMs, c.gpuSubmitMs,
      c.dirtyTileCount, c.arenaUsedBytes, c.undoCompressedBytes, c.ringDepth,
    );
  }

  /** 힙 할당 0건으로 호출자 `scratch`에 다음 바이너리 커맨드 1건을 디코드한다. */
  popInto(s: Wasm64IpcScratchCommand): Wasm64IpcOpcodeValue {
    const tail = this.loadCursor(CTRL.TAIL);
    const head = this.loadCursor(CTRL.HEAD);
    if (head === tail) {
      s.opcode = Wasm64IpcOpcode.Empty;
      return Wasm64IpcOpcode.Empty;
    }
    const w = (WASM64_IPC_DATA_BYTE_OFFSET >> 2) + (tail & this.mask) * WASM64_IPC_SLOT_WORDS;
    const opcode = this.u32[w] as Wasm64IpcOpcodeValue;
    s.opcode = opcode; s.sequence = this.u32[w + 1]; s.timestampMs = this.f64[(w + 2) >> 1];

    if (opcode === Wasm64IpcOpcode.PointerStrokeBatch) {
      s.u0 = this.u32[w + 4]; s.u1 = this.u32[w + 5]; s.u2 = this.u32[w + 6]; s.u3 = this.u32[w + 7];
      s.f0 = this.f32[w + 8]; s.f1 = this.f32[w + 9]; s.f2 = this.f32[w + 10]; s.f3 = this.f32[w + 11];
      s.f4 = this.f32[w + 12]; s.f5 = this.f32[w + 13]; s.u4 = this.u32[w + 14];
    } else if (opcode === Wasm64IpcOpcode.TileDirtyCommit) {
      s.u0 = this.u32[w + 4]; s.i0 = this.i32[w + 5]; s.i1 = this.i32[w + 6]; s.u1 = this.u32[w + 7];
      s.u2 = this.u32[w + 8]; s.u3 = this.u32[w + 9]; s.u4 = this.u32[w + 10]; s.u5 = this.u32[w + 11];
      s.u6 = this.u32[w + 12]; s.u7 = this.u32[w + 13]; s.f0 = this.u32[w + 14];
    } else if (opcode === Wasm64IpcOpcode.CameraTransformUpdate) {
      s.f0 = this.f32[w + 4]; s.f1 = this.f32[w + 5]; s.f2 = this.f32[w + 6]; s.f3 = this.f32[w + 7];
      s.f4 = this.f32[w + 8]; s.f5 = this.f32[w + 9]; s.f6 = this.f32[w + 10]; s.u0 = this.u32[w + 11];
    } else if (opcode === Wasm64IpcOpcode.FrameTelemetrySample) {
      s.u0 = this.u32[w + 4]; s.f0 = this.f32[w + 5]; s.f1 = this.f32[w + 6]; s.f2 = this.f32[w + 7];
      s.u1 = this.u32[w + 8]; s.u2 = this.u32[w + 9]; s.u3 = this.u32[w + 10]; s.u4 = this.u32[w + 11];
    }

    this.storeCursor(CTRL.CONSUMED, (this.loadCursor(CTRL.CONSUMED) + 1) | 0);
    this.storeCursor(CTRL.TAIL, (tail + 1) | 0);
    return opcode;
  }

  pop(): Wasm64IpcCommand | null {
    const s = createIpcScratchCommand();
    const opcode = this.popInto(s);
    if (opcode === Wasm64IpcOpcode.PointerStrokeBatch) {
      return {
        opcode, sequence: s.sequence, timestampMs: s.timestampMs, layerId: s.u0, strokeId: s.u1,
        pointCount: s.u2, arenaByteOffset: s.u3, brushRadiusPx: s.f0, pressureMean: s.f1,
        minX: s.f2, minY: s.f3, maxX: s.f4, maxY: s.f5, flags: s.u4,
      };
    }
    if (opcode === Wasm64IpcOpcode.TileDirtyCommit) {
      return {
        opcode, sequence: s.sequence, timestampMs: s.timestampMs, layerId: s.u0, tileX: s.i0, tileY: s.i1,
        generation: s.u1, tileArenaOffset: s.u2, byteLength: s.u3,
        dirtyRectX: s.u4, dirtyRectY: s.u5, dirtyRectW: s.u6, dirtyRectH: s.u7, compressionKind: s.f0,
      };
    }
    if (opcode === Wasm64IpcOpcode.CameraTransformUpdate) {
      return {
        opcode, sequence: s.sequence, timestampMs: s.timestampMs, panX: s.f0, panY: s.f1, zoom: s.f2,
        rotationRad: s.f3, viewportWidth: s.f4, viewportHeight: s.f5, devicePixelRatio: s.f6, flags: s.u0,
      };
    }
    if (opcode === Wasm64IpcOpcode.FrameTelemetrySample) {
      return {
        opcode, sequence: s.sequence, timestampMs: s.timestampMs, frameIndex: s.u0, frameTimeMs: s.f0,
        wasmKernelMs: s.f1, gpuSubmitMs: s.f2, dirtyTileCount: s.u1, arenaUsedBytes: s.u2,
        undoCompressedBytes: s.u3, ringDepth: s.u4,
      };
    }
    return null;
  }

  drainInto(
    scratch: Wasm64IpcScratchCommand, visitor: (cmd: Wasm64IpcScratchCommand) => void, maxCount = this.capacitySlots,
  ): number {
    let drained = 0;
    while (drained < maxCount && this.popInto(scratch) !== Wasm64IpcOpcode.Empty) {
      visitor(scratch); drained += 1;
    }
    return drained;
  }

  get pendingCount(): number { return (this.loadCursor(CTRL.HEAD) - this.loadCursor(CTRL.TAIL)) >>> 0; }
  get isEmpty(): boolean { return this.pendingCount === 0; }
  get isFull(): boolean { return this.pendingCount >= this.capacitySlots; }

  getStats(): Wasm64IpcRingStats {
    const pendingCount = this.pendingCount;
    return {
      backingMode: this.backingMode, isShared: this.isShared, capacitySlots: this.capacitySlots,
      slotStrideBytes: WASM64_IPC_SLOT_STRIDE_BYTES, totalByteLength: this.buffer.byteLength,
      headByteOffset: WASM64_IPC_HEAD_BYTE_OFFSET, tailByteOffset: WASM64_IPC_TAIL_BYTE_OFFSET,
      dataByteOffset: WASM64_IPC_DATA_BYTE_OFFSET, pendingCount,
      availableSlots: this.capacitySlots - pendingCount,
      droppedCount: this.loadCursor(CTRL.DROPPED) >>> 0,
      consumedCount: this.loadCursor(CTRL.CONSUMED) >>> 0,
    };
  }
}
