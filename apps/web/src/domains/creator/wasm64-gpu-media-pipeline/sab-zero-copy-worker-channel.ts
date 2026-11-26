/**
 * SharedArrayBuffer + Atomics 제로-카피 워커 직렬화 채널 (`SabZeroCopyWorkerChannel`).
 *
 * - FlatBuffers 스타일 64바이트 캐시라인 정렬 제어 헤더 + SoA(Structure-of-Arrays) 프레임 테이블 + 링 페이로드 슬랩
 * - WebAssembly `memory64`(>4 GiB) 가상 주소 공간을 위한 64비트(`BigInt`) 문서·타일 오프셋 지원
 * - SAB 경로에서는 `postMessage` structured-clone 오버헤드 0바이트(제로-카피),
 *   `crossOriginIsolated === false` 환경에서는 소유권 이전(`Transferable ArrayBuffer`) 패킷으로 안전 폴백
 * - 멀티 메시지 프레이밍(배치), 고수위(High-Water) 백프레셔, FNV-1a 32비트 체크섬 검증, 처리량 계측 제공
 */

export const SAB_CHANNEL_MAGIC = 0x54535a43; // "TSZC"
export const SAB_CHANNEL_VERSION = 1 as const;
export const SAB_CACHE_LINE_BYTES = 64 as const;
export const SAB_CONTROL_BLOCK_BYTES = 256 as const;
export const SAB_PAYLOAD_ALIGNMENT_BYTES = 8 as const;
export const SAB_WASM32_LIMIT_BYTES = BigInt("4294967296"); // 4 GiB

const ZERO_I64 = BigInt(0);
const MAX_UINT64 = (BigInt(1) << BigInt(64)) - BigInt(1);
const MASK_32_I64 = BigInt("0xffffffff");
const SHIFT_32_I64 = BigInt(32);
const SOA_BYTES_PER_SLOT = 60; // 3 * 8B (u64) + 9 * 4B (u32)
const PACKET_MAGIC = 0x54535450; // "TSTP"
const PACKET_HEADER_BYTES = 64;

const CTRL = {
  MAGIC: 0, VERSION: 1, FRAME_CAPACITY: 2, SLAB_BYTE_LENGTH: 3, SOA_BYTE_OFFSET: 4, SLAB_BYTE_OFFSET: 5, FLAGS: 6, HIGH_WATER_FRAMES: 7,
  HEAD_FRAME: 16, SLAB_WRITE_POS: 17, BACKPRESSURE_EVENTS: 18, NEXT_SEQUENCE: 19, NEXT_BATCH_ID: 20,
  TAIL_FRAME: 32, CHECKSUM_ERRORS: 33, FRAMES_CONSUMED: 34,
  SLAB_USED_BYTES: 48, CHANNEL_STATE: 49, WAKE_COUNTER: 50,
} as const;

const CHANNEL_STATE_OPEN = 0;
const CHANNEL_STATE_CLOSED = 1;

export const SabMessageKind = {
  TilePatch: 1, StrokeDelta: 2, AudioPcmBlock: 3, ShaderUniformSync: 4, CompositeCommit: 5, ControlFence: 6,
} as const;

export type SabMessageKindValue = (typeof SabMessageKind)[keyof typeof SabMessageKind];
export type SabTransportMode = "shared-array-buffer-zero-copy" | "array-buffer-transferable-fallback";
export type SabSendRejectReason = "ring-full" | "slab-full" | "payload-too-large" | "channel-closed" | "invalid-offset";

export interface SabChannelLayout {
  readonly frameCapacity: number; readonly slabByteLength: number; readonly soaByteOffset: number;
  readonly slabByteOffset: number; readonly totalByteLength: number; readonly highWaterFrames: number;
}

export interface SabZeroCopyChannelOptions {
  readonly frameCapacity: number; readonly slabByteLength: number; readonly highWaterRatio?: number;
  readonly preferShared?: boolean; readonly crossOriginIsolatedOverride?: boolean;
}

export interface SabFramePayloadInput {
  readonly kind: SabMessageKindValue; readonly docOffsetI64: bigint; readonly tileOffsetI64: bigint;
  readonly payload: Uint8Array; readonly timestampUsI64?: bigint; readonly batchId?: number;
  readonly batchPartIndex?: number; readonly batchPartCount?: number; readonly flags?: number;
}

export interface SabDecodedFrame {
  readonly kind: SabMessageKindValue; readonly sequence: number;
  readonly docOffsetI64: bigint; readonly tileOffsetI64: bigint; readonly timestampUsI64: bigint;
  readonly batchId: number; readonly batchPartIndex: number; readonly batchPartCount: number;
  readonly flags: number; readonly checksumFnv1a: number; readonly payloadByteLength: number;
  readonly payload: Uint8Array; readonly zeroCopyView: boolean;
}

export interface SabSendResult {
  readonly ok: boolean; readonly sequence: number; readonly batchId: number; readonly checksumFnv1a: number;
  readonly payloadBytes: number; readonly backpressured: boolean; readonly reason: SabSendRejectReason | null;
}

export interface SabReceiveResult {
  readonly ok: boolean; readonly frame: SabDecodedFrame | null;
  readonly reason: "empty" | "checksum-mismatch" | null;
  readonly expectedChecksum?: number; readonly actualChecksum?: number;
}

export interface SabBatchSendResult {
  readonly ok: boolean; readonly batchId: number; readonly framesSent: number; readonly totalPayloadBytes: number;
  readonly backpressured: boolean; readonly failedAtIndex: number | null; readonly reason: SabSendRejectReason | null;
}

export interface SabTransferableEnvelope {
  readonly transportMode: "array-buffer-transferable-fallback";
  readonly packet: ArrayBuffer; readonly transferList: readonly [ArrayBuffer];
  readonly frameCount: number; readonly totalPayloadBytes: number; readonly structuredCloneBytes: 0;
}

export interface SabChannelMetrics {
  readonly transportMode: SabTransportMode; readonly isShared: boolean; readonly crossOriginIsolated: boolean;
  readonly isClosed: boolean; readonly frameCapacity: number; readonly slabByteLength: number;
  readonly pendingFrames: number; readonly availableFrames: number; readonly slabUsedBytes: number;
  readonly slabUtilization: number; readonly highWaterFrames: number; readonly backpressured: boolean;
  readonly framesSent: number; readonly framesReceived: number; readonly bytesSent: number;
  readonly bytesReceived: number; readonly zeroCopyBytes: number; readonly structuredCloneBytes: number;
  readonly transferablePacketsEncoded: number; readonly backpressureEvents: number; readonly checksumErrors: number;
  readonly throughputMiBPerSec: number; readonly averageLatencyUs: number;
  readonly maxDocOffsetI64: bigint; readonly maxTileOffsetI64: bigint;
}

interface SoaViews {
  readonly docOffsets: BigUint64Array; readonly tileOffsets: BigUint64Array; readonly timestampsUs: BigUint64Array;
  readonly kinds: Uint32Array; readonly sequences: Uint32Array; readonly batchIds: Uint32Array;
  readonly batchMetas: Uint32Array; readonly slabOffsets: Uint32Array; readonly payloadLengths: Uint32Array;
  readonly slabReserved: Uint32Array; readonly checksums: Uint32Array; readonly flags: Uint32Array;
}

function alignUp(value: number, alignment: number): number {
  const mask = alignment - 1;
  return (value + mask) & ~mask;
}

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value >= 4 && (value & (value - 1)) === 0;
}

function nowMicrosI64(): bigint {
  const ms = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  return BigInt(Math.max(0, Math.round(ms * 1000)));
}

function isSharedBuffer(buffer: ArrayBufferLike): boolean {
  return typeof SharedArrayBuffer !== "undefined" && buffer instanceof SharedArrayBuffer;
}

function isValidUint64(value: bigint): boolean {
  return value >= ZERO_I64 && value <= MAX_UINT64;
}

function rejectSend(reason: SabSendRejectReason, payloadBytes: number, backpressured: boolean): SabSendResult {
  return { ok: false, sequence: 0, batchId: 0, checksumFnv1a: 0, payloadBytes, backpressured, reason };
}

export function detectSharedChannelSupport(crossOriginIsolatedOverride?: boolean): {
  readonly hasSharedArrayBuffer: boolean; readonly hasAtomics: boolean;
  readonly crossOriginIsolated: boolean; readonly canUseZeroCopySab: boolean;
} {
  const hasSharedArrayBuffer = typeof SharedArrayBuffer === "function";
  const hasAtomics = typeof Atomics === "object" && Atomics !== null;
  const hostGlobal = globalThis as { readonly crossOriginIsolated?: boolean };
  const crossOriginIsolated =
    typeof crossOriginIsolatedOverride === "boolean" ? crossOriginIsolatedOverride : Boolean(hostGlobal.crossOriginIsolated);
  return {
    hasSharedArrayBuffer, hasAtomics, crossOriginIsolated,
    canUseZeroCopySab: hasSharedArrayBuffer && hasAtomics && crossOriginIsolated,
  };
}

export function computeSabChannelLayout(
  frameCapacity: number,
  slabByteLength: number,
  highWaterRatio: number = 0.75,
): SabChannelLayout {
  if (!isPowerOfTwo(frameCapacity)) {
    throw new RangeError(`frameCapacity는 4 이상의 2의 거듭제곱이어야 합니다(입력: ${frameCapacity}).`);
  }
  if (!Number.isInteger(slabByteLength) || slabByteLength < 256) {
    throw new RangeError(`slabByteLength는 256바이트 이상 정수여야 합니다(입력: ${slabByteLength}).`);
  }
  const alignedSlab = alignUp(slabByteLength, SAB_CACHE_LINE_BYTES);
  const soaByteOffset = SAB_CONTROL_BLOCK_BYTES;
  const slabByteOffset = alignUp(soaByteOffset + frameCapacity * SOA_BYTES_PER_SLOT, SAB_CACHE_LINE_BYTES);
  const clampedRatio = Math.min(0.95, Math.max(0.25, highWaterRatio));
  const highWaterFrames = Math.max(1, Math.min(frameCapacity - 1, Math.floor(frameCapacity * clampedRatio)));
  return {
    frameCapacity, slabByteLength: alignedSlab, soaByteOffset, slabByteOffset,
    totalByteLength: slabByteOffset + alignedSlab, highWaterFrames,
  };
}

function fnvMixU32(hash: number, word: number): number {
  let h = Math.imul(hash ^ (word & 0xff), 0x01000193);
  h = Math.imul(h ^ ((word >>> 8) & 0xff), 0x01000193);
  h = Math.imul(h ^ ((word >>> 16) & 0xff), 0x01000193);
  return Math.imul(h ^ ((word >>> 24) & 0xff), 0x01000193) >>> 0;
}

/** 64비트 오프셋·메타데이터·페이로드 전체에 대한 결정적 FNV-1a 32비트 체크섬을 계산한다. */
export function computeSabFrameChecksum(
  kind: number, sequence: number, docOffsetI64: bigint, tileOffsetI64: bigint,
  batchId: number, batchMeta: number, flags: number, payload: Uint8Array,
): number {
  let h = 0x811c9dc5;
  h = fnvMixU32(h, kind >>> 0);
  h = fnvMixU32(h, sequence >>> 0);
  h = fnvMixU32(h, Number(docOffsetI64 & MASK_32_I64));
  h = fnvMixU32(h, Number((docOffsetI64 >> SHIFT_32_I64) & MASK_32_I64));
  h = fnvMixU32(h, Number(tileOffsetI64 & MASK_32_I64));
  h = fnvMixU32(h, Number((tileOffsetI64 >> SHIFT_32_I64) & MASK_32_I64));
  h = fnvMixU32(h, batchId >>> 0);
  h = fnvMixU32(h, batchMeta >>> 0);
  h = fnvMixU32(h, flags >>> 0);
  h = fnvMixU32(h, payload.byteLength >>> 0);
  for (let i = 0; i < payload.byteLength; i += 1) {
    h = Math.imul(h ^ payload[i], 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function bindSoaViews(buffer: ArrayBufferLike, soaByteOffset: number, n: number): SoaViews {
  let off = soaByteOffset;
  const docOffsets = new BigUint64Array(buffer, off, n); off += n * 8;
  const tileOffsets = new BigUint64Array(buffer, off, n); off += n * 8;
  const timestampsUs = new BigUint64Array(buffer, off, n); off += n * 8;
  const kinds = new Uint32Array(buffer, off, n); off += n * 4;
  const sequences = new Uint32Array(buffer, off, n); off += n * 4;
  const batchIds = new Uint32Array(buffer, off, n); off += n * 4;
  const batchMetas = new Uint32Array(buffer, off, n); off += n * 4;
  const slabOffsets = new Uint32Array(buffer, off, n); off += n * 4;
  const payloadLengths = new Uint32Array(buffer, off, n); off += n * 4;
  const slabReserved = new Uint32Array(buffer, off, n); off += n * 4;
  const checksums = new Uint32Array(buffer, off, n); off += n * 4;
  const flags = new Uint32Array(buffer, off, n);
  return {
    docOffsets, tileOffsets, timestampsUs, kinds, sequences, batchIds,
    batchMetas, slabOffsets, payloadLengths, slabReserved, checksums, flags,
  };
}

export class SabZeroCopyWorkerChannel {
  readonly buffer: ArrayBufferLike;
  readonly isShared: boolean;
  readonly crossOriginIsolated: boolean;
  readonly transportMode: SabTransportMode;
  readonly layout: SabChannelLayout;

  private readonly mask: number;
  private readonly ctrl: Int32Array;
  private readonly soa: SoaViews;
  private readonly slab: Uint8Array;
  private readonly startedAtUs: bigint;
  private framesSentCount = 0;
  private framesReceivedCount = 0;
  private bytesSentCount = 0;
  private bytesReceivedCount = 0;
  private zeroCopyBytesCount = 0;
  private transferablePacketsCount = 0;
  private latencySumUs = 0;
  private latencySamples = 0;
  private maxDocOffsetSeen = ZERO_I64;
  private maxTileOffsetSeen = ZERO_I64;

  private constructor(buffer: ArrayBufferLike, layout: SabChannelLayout, crossOriginIsolated: boolean) {
    this.buffer = buffer;
    this.isShared = isSharedBuffer(buffer);
    this.crossOriginIsolated = crossOriginIsolated;
    this.transportMode = this.isShared ? "shared-array-buffer-zero-copy" : "array-buffer-transferable-fallback";
    this.layout = layout;
    this.mask = layout.frameCapacity - 1;
    this.ctrl = new Int32Array(buffer, 0, SAB_CONTROL_BLOCK_BYTES / 4);
    this.soa = bindSoaViews(buffer, layout.soaByteOffset, layout.frameCapacity);
    this.slab = new Uint8Array(buffer, layout.slabByteOffset, layout.slabByteLength);
    this.startedAtUs = nowMicrosI64();
  }

  static create(options: SabZeroCopyChannelOptions): SabZeroCopyWorkerChannel {
    const layout = computeSabChannelLayout(options.frameCapacity, options.slabByteLength, options.highWaterRatio ?? 0.75);
    const caps = detectSharedChannelSupport(options.crossOriginIsolatedOverride);
    const useShared = (options.preferShared ?? true) && caps.canUseZeroCopySab;
    const buffer: ArrayBufferLike = useShared
      ? new SharedArrayBuffer(layout.totalByteLength)
      : new ArrayBuffer(layout.totalByteLength);

    const ch = new SabZeroCopyWorkerChannel(buffer, layout, caps.crossOriginIsolated);
    ch.ctrl[CTRL.MAGIC] = SAB_CHANNEL_MAGIC;
    ch.ctrl[CTRL.VERSION] = SAB_CHANNEL_VERSION;
    ch.ctrl[CTRL.FRAME_CAPACITY] = layout.frameCapacity;
    ch.ctrl[CTRL.SLAB_BYTE_LENGTH] = layout.slabByteLength;
    ch.ctrl[CTRL.SOA_BYTE_OFFSET] = layout.soaByteOffset;
    ch.ctrl[CTRL.SLAB_BYTE_OFFSET] = layout.slabByteOffset;
    ch.ctrl[CTRL.FLAGS] = useShared ? 1 : 0;
    ch.ctrl[CTRL.HIGH_WATER_FRAMES] = layout.highWaterFrames;
    ch.atomicStore(CTRL.HEAD_FRAME, 0);
    ch.atomicStore(CTRL.SLAB_WRITE_POS, 0);
    ch.atomicStore(CTRL.BACKPRESSURE_EVENTS, 0);
    ch.atomicStore(CTRL.NEXT_SEQUENCE, 1);
    ch.atomicStore(CTRL.NEXT_BATCH_ID, 1);
    ch.atomicStore(CTRL.TAIL_FRAME, 0);
    ch.atomicStore(CTRL.CHECKSUM_ERRORS, 0);
    ch.atomicStore(CTRL.FRAMES_CONSUMED, 0);
    ch.atomicStore(CTRL.SLAB_USED_BYTES, 0);
    ch.atomicStore(CTRL.CHANNEL_STATE, CHANNEL_STATE_OPEN);
    ch.atomicStore(CTRL.WAKE_COUNTER, 0);
    return ch;
  }

  /** 워커 측에서 동일한 `SharedArrayBuffer`(또는 폴백 버퍼)에 제로-카피로 직접 부착한다. */
  static attach(buffer: ArrayBufferLike, crossOriginIsolatedOverride?: boolean): SabZeroCopyWorkerChannel {
    if (buffer.byteLength < SAB_CONTROL_BLOCK_BYTES + 4 * SOA_BYTES_PER_SLOT + 256) {
      throw new RangeError(`채널 버퍼 크기가 너무 작습니다(${buffer.byteLength}B).`);
    }
    const header = new Int32Array(buffer, 0, SAB_CONTROL_BLOCK_BYTES / 4);
    const magic = header[CTRL.MAGIC] >>> 0;
    if (magic !== SAB_CHANNEL_MAGIC) throw new Error(`잘못된 채널 매직 헤더: 0x${magic.toString(16)}`);
    const version = header[CTRL.VERSION];
    if (version !== SAB_CHANNEL_VERSION) throw new Error(`지원하지 않는 채널 버전: ${version}`);
    const layout = computeSabChannelLayout(header[CTRL.FRAME_CAPACITY], header[CTRL.SLAB_BYTE_LENGTH]);
    if (buffer.byteLength < layout.totalByteLength) {
      throw new RangeError(`버퍼 길이 부족: 기대 ${layout.totalByteLength}B, 실제 ${buffer.byteLength}B`);
    }
    const caps = detectSharedChannelSupport(crossOriginIsolatedOverride);
    const hw = header[CTRL.HIGH_WATER_FRAMES];
    return new SabZeroCopyWorkerChannel(
      buffer,
      { ...layout, highWaterFrames: hw > 0 ? hw : layout.highWaterFrames },
      caps.crossOriginIsolated,
    );
  }

  private atomicLoad(index: number): number {
    return this.isShared ? Atomics.load(this.ctrl, index) : this.ctrl[index];
  }
  private atomicStore(index: number, value: number): void {
    if (this.isShared) Atomics.store(this.ctrl, index, value);
    else this.ctrl[index] = value;
  }
  private atomicAdd(index: number, delta: number): number {
    if (this.isShared) return Atomics.add(this.ctrl, index, delta);
    const prev = this.ctrl[index];
    this.ctrl[index] = (prev + delta) | 0;
    return prev;
  }
  private atomicSub(index: number, delta: number): number {
    if (this.isShared) return Atomics.sub(this.ctrl, index, delta);
    const prev = this.ctrl[index];
    this.ctrl[index] = (prev - delta) | 0;
    return prev;
  }
  private notifyConsumer(): void {
    this.atomicAdd(CTRL.WAKE_COUNTER, 1);
    if (this.isShared) Atomics.notify(this.ctrl, CTRL.WAKE_COUNTER, 1);
  }

  close(): void {
    this.atomicStore(CTRL.CHANNEL_STATE, CHANNEL_STATE_CLOSED);
    this.notifyConsumer();
  }
  isClosed(): boolean {
    return this.atomicLoad(CTRL.CHANNEL_STATE) === CHANNEL_STATE_CLOSED;
  }
  getPendingCount(): number {
    return ((this.atomicLoad(CTRL.HEAD_FRAME) >>> 0) - (this.atomicLoad(CTRL.TAIL_FRAME) >>> 0)) >>> 0;
  }
  isBackpressured(): boolean {
    return (
      this.getPendingCount() >= this.layout.highWaterFrames ||
      Math.max(0, this.atomicLoad(CTRL.SLAB_USED_BYTES)) >= Math.floor(this.layout.slabByteLength * 0.8)
    );
  }

  /** 단일 프레임을 SoA 테이블과 링 페이로드 슬랩에 락프리 기록한다. */
  send(input: SabFramePayloadInput): SabSendResult {
    if (this.isClosed()) return rejectSend("channel-closed", 0, true);
    if (!isValidUint64(input.docOffsetI64) || !isValidUint64(input.tileOffsetI64)) {
      return rejectSend("invalid-offset", 0, false);
    }

    const payloadLen = input.payload.byteLength;
    const alignedPayloadLen = payloadLen === 0 ? 0 : alignUp(payloadLen, SAB_PAYLOAD_ALIGNMENT_BYTES);
    if (alignedPayloadLen > this.layout.slabByteLength) {
      this.atomicAdd(CTRL.BACKPRESSURE_EVENTS, 1);
      return rejectSend("payload-too-large", payloadLen, true);
    }

    const head = this.atomicLoad(CTRL.HEAD_FRAME) >>> 0;
    const tail = this.atomicLoad(CTRL.TAIL_FRAME) >>> 0;
    if (((head - tail) >>> 0) >= this.layout.frameCapacity) {
      this.atomicAdd(CTRL.BACKPRESSURE_EVENTS, 1);
      return rejectSend("ring-full", payloadLen, true);
    }

    const slabCap = this.layout.slabByteLength;
    const slabUsed = Math.max(0, this.atomicLoad(CTRL.SLAB_USED_BYTES));
    // 소비가 끝난 빈 슬랩에는 랩어라운드 패딩을 남기지 않는다.
    const writePos = slabUsed === 0 ? 0 : this.atomicLoad(CTRL.SLAB_WRITE_POS) >>> 0;
    let targetOffset = writePos;
    let reservedBytes = alignedPayloadLen;
    if (alignedPayloadLen > 0 && writePos + alignedPayloadLen > slabCap) {
      targetOffset = 0;
      reservedBytes = (slabCap - writePos) + alignedPayloadLen;
    }
    if (slabUsed + reservedBytes > slabCap) {
      this.atomicAdd(CTRL.BACKPRESSURE_EVENTS, 1);
      return rejectSend("slab-full", payloadLen, true);
    }

    const sequence = this.atomicAdd(CTRL.NEXT_SEQUENCE, 1) >>> 0;
    const batchId = (input.batchId ?? 0) >>> 0;
    const batchMeta = (((Math.max(1, input.batchPartCount ?? 1) & 0xffff) << 16) | ((input.batchPartIndex ?? 0) & 0xffff)) >>> 0;
    const flags = (input.flags ?? 0) >>> 0;
    const timestampUs = input.timestampUsI64 ?? nowMicrosI64();
    const checksum = computeSabFrameChecksum(
      input.kind, sequence, input.docOffsetI64, input.tileOffsetI64, batchId, batchMeta, flags, input.payload,
    );

    if (payloadLen > 0) {
      this.slab.set(input.payload, targetOffset);
      this.atomicStore(CTRL.SLAB_WRITE_POS, (targetOffset + alignedPayloadLen) % slabCap);
      this.atomicAdd(CTRL.SLAB_USED_BYTES, reservedBytes);
    }

    const slot = (head & this.mask) >>> 0;
    this.soa.docOffsets[slot] = input.docOffsetI64;
    this.soa.tileOffsets[slot] = input.tileOffsetI64;
    this.soa.timestampsUs[slot] = timestampUs;
    this.soa.kinds[slot] = input.kind;
    this.soa.sequences[slot] = sequence;
    this.soa.batchIds[slot] = batchId;
    this.soa.batchMetas[slot] = batchMeta;
    this.soa.slabOffsets[slot] = targetOffset >>> 0;
    this.soa.payloadLengths[slot] = payloadLen >>> 0;
    this.soa.slabReserved[slot] = reservedBytes >>> 0;
    this.soa.checksums[slot] = checksum;
    this.soa.flags[slot] = flags;

    this.atomicStore(CTRL.HEAD_FRAME, (head + 1) | 0);
    this.notifyConsumer();

    this.framesSentCount += 1;
    this.bytesSentCount += payloadLen;
    if (this.isShared) this.zeroCopyBytesCount += payloadLen;
    if (input.docOffsetI64 > this.maxDocOffsetSeen) this.maxDocOffsetSeen = input.docOffsetI64;
    if (input.tileOffsetI64 > this.maxTileOffsetSeen) this.maxTileOffsetSeen = input.tileOffsetI64;

    const backpressured = this.isBackpressured();
    if (backpressured) this.atomicAdd(CTRL.BACKPRESSURE_EVENTS, 1);
    return { ok: true, sequence, batchId, checksumFnv1a: checksum, payloadBytes: payloadLen, backpressured, reason: null };
  }

  /** 다중 메시지를 단일 논리 배치 ID와 파트 인덱스(`partIndex/partCount`)로 프레이밍해 전송한다. */
  sendBatch(messages: readonly SabFramePayloadInput[]): SabBatchSendResult {
    const batchId = this.atomicAdd(CTRL.NEXT_BATCH_ID, 1) >>> 0;
    const totalParts = messages.length;
    let totalBytes = 0;
    let anyBackpressure = false;

    for (let i = 0; i < totalParts; i += 1) {
      const res = this.send({ ...messages[i], batchId, batchPartIndex: i, batchPartCount: totalParts });
      if (!res.ok) {
        return {
          ok: false, batchId, framesSent: i, totalPayloadBytes: totalBytes,
          backpressured: true, failedAtIndex: i, reason: res.reason,
        };
      }
      totalBytes += res.payloadBytes;
      if (res.backpressured) anyBackpressure = true;
    }
    return {
      ok: true, batchId, framesSent: totalParts, totalPayloadBytes: totalBytes,
      backpressured: anyBackpressure, failedAtIndex: null, reason: null,
    };
  }

  /** 제로-카피 스코프 소비: SAB 슬랩 뷰를 복사 없이 콜백에 전달하고 종료 직후 원자 해제한다. */
  consumeZeroCopy(
    handler: (frame: SabDecodedFrame) => void,
    options?: { readonly verifyChecksum?: boolean },
  ): SabReceiveResult {
    const verifyChecksum = options?.verifyChecksum ?? true;
    const head = this.atomicLoad(CTRL.HEAD_FRAME) >>> 0;
    const tail = this.atomicLoad(CTRL.TAIL_FRAME) >>> 0;
    if (head === tail) return { ok: false, frame: null, reason: "empty" };

    const slot = (tail & this.mask) >>> 0;
    const kind = this.soa.kinds[slot] as SabMessageKindValue;
    const sequence = this.soa.sequences[slot];
    const docOffsetI64 = this.soa.docOffsets[slot];
    const tileOffsetI64 = this.soa.tileOffsets[slot];
    const timestampUsI64 = this.soa.timestampsUs[slot];
    const batchId = this.soa.batchIds[slot];
    const batchMeta = this.soa.batchMetas[slot];
    const slabOffset = this.soa.slabOffsets[slot];
    const payloadLen = this.soa.payloadLengths[slot];
    const reservedBytes = this.soa.slabReserved[slot];
    const expectedChecksum = this.soa.checksums[slot];
    const flags = this.soa.flags[slot];

    const payloadView = this.slab.subarray(slabOffset, slabOffset + payloadLen);
    if (verifyChecksum) {
      const actualChecksum = computeSabFrameChecksum(
        kind, sequence, docOffsetI64, tileOffsetI64, batchId, batchMeta, flags, payloadView,
      );
      if (actualChecksum !== expectedChecksum) {
        this.atomicAdd(CTRL.CHECKSUM_ERRORS, 1);
        if (reservedBytes > 0) this.atomicSub(CTRL.SLAB_USED_BYTES, reservedBytes);
        this.atomicStore(CTRL.TAIL_FRAME, (tail + 1) | 0);
        return { ok: false, frame: null, reason: "checksum-mismatch", expectedChecksum, actualChecksum };
      }
    }

    const frame: SabDecodedFrame = {
      kind, sequence, docOffsetI64, tileOffsetI64, timestampUsI64, batchId,
      batchPartIndex: batchMeta & 0xffff, batchPartCount: (batchMeta >>> 16) & 0xffff,
      flags, checksumFnv1a: expectedChecksum, payloadByteLength: payloadLen,
      payload: payloadView, zeroCopyView: this.isShared,
    };

    try {
      handler(frame);
    } finally {
      if (reservedBytes > 0) this.atomicSub(CTRL.SLAB_USED_BYTES, reservedBytes);
      this.atomicStore(CTRL.TAIL_FRAME, (tail + 1) | 0);
      this.atomicAdd(CTRL.FRAMES_CONSUMED, 1);
    }

    const nowUs = nowMicrosI64();
    if (nowUs >= timestampUsI64) {
      const delta = Number(nowUs - timestampUsI64);
      if (Number.isFinite(delta) && delta >= 0) {
        this.latencySumUs += delta;
        this.latencySamples += 1;
      }
    }
    this.framesReceivedCount += 1;
    this.bytesReceivedCount += payloadLen;
    return { ok: true, frame, reason: null };
  }

  receive(options?: { readonly verifyChecksum?: boolean }): SabReceiveResult {
    let snapshotFrame: SabDecodedFrame | null = null;
    const result = this.consumeZeroCopy((borrowed) => {
      const owned = new Uint8Array(borrowed.payloadByteLength);
      owned.set(borrowed.payload);
      snapshotFrame = { ...borrowed, payload: owned, zeroCopyView: false };
    }, options);
    return result.ok ? { ok: true, frame: snapshotFrame, reason: null } : result;
  }

  receiveBatch(maxFrames: number = this.layout.frameCapacity, verifyChecksum: boolean = true): readonly SabDecodedFrame[] {
    const out: SabDecodedFrame[] = [];
    const limit = Math.max(0, Math.floor(maxFrames));
    for (let i = 0; i < limit; i += 1) {
      const res = this.receive({ verifyChecksum });
      if (!res.ok || !res.frame) {
        if (res.reason === "empty") break;
        continue;
      }
      out.push(res.frame);
    }
    return out;
  }

  encodeTransferableBatch(messages: readonly SabFramePayloadInput[]): SabTransferableEnvelope {
    const env = encodeTransferableFramePacket(messages);
    this.transferablePacketsCount += 1;
    this.framesSentCount += env.frameCount;
    this.bytesSentCount += env.totalPayloadBytes;
    for (const msg of messages) {
      if (msg.docOffsetI64 > this.maxDocOffsetSeen) this.maxDocOffsetSeen = msg.docOffsetI64;
      if (msg.tileOffsetI64 > this.maxTileOffsetSeen) this.maxTileOffsetSeen = msg.tileOffsetI64;
    }
    return env;
  }

  getMetrics(): SabChannelMetrics {
    const pending = this.getPendingCount();
    const slabUsed = Math.max(0, this.atomicLoad(CTRL.SLAB_USED_BYTES));
    const elapsedSec = Math.max(Number(nowMicrosI64() - this.startedAtUs) / 1_000_000, 1e-6);
    const totalBytes = this.bytesSentCount + this.bytesReceivedCount;
    return {
      transportMode: this.transportMode, isShared: this.isShared, crossOriginIsolated: this.crossOriginIsolated,
      isClosed: this.isClosed(), frameCapacity: this.layout.frameCapacity, slabByteLength: this.layout.slabByteLength,
      pendingFrames: pending, availableFrames: Math.max(0, this.layout.frameCapacity - pending),
      slabUsedBytes: slabUsed, slabUtilization: slabUsed / this.layout.slabByteLength,
      highWaterFrames: this.layout.highWaterFrames, backpressured: this.isBackpressured(),
      framesSent: this.framesSentCount, framesReceived: this.framesReceivedCount,
      bytesSent: this.bytesSentCount, bytesReceived: this.bytesReceivedCount,
      zeroCopyBytes: this.zeroCopyBytesCount, structuredCloneBytes: 0,
      transferablePacketsEncoded: this.transferablePacketsCount,
      backpressureEvents: this.atomicLoad(CTRL.BACKPRESSURE_EVENTS) >>> 0,
      checksumErrors: this.atomicLoad(CTRL.CHECKSUM_ERRORS) >>> 0,
      throughputMiBPerSec: totalBytes / (1024 * 1024) / elapsedSec,
      averageLatencyUs: this.latencySamples > 0 ? this.latencySumUs / this.latencySamples : 0,
      maxDocOffsetI64: this.maxDocOffsetSeen, maxTileOffsetI64: this.maxTileOffsetSeen,
    };
  }
}

/** `!crossOriginIsolated` 환경용 Transferable 정렬 SoA + 슬랩 패킷 인코더. */
export function encodeTransferableFramePacket(
  messages: readonly SabFramePayloadInput[],
  batchId: number = 1,
): SabTransferableEnvelope {
  const count = messages.length;
  let alignedSlabBytes = 0;
  let rawPayloadBytes = 0;
  for (const m of messages) {
    if (!isValidUint64(m.docOffsetI64) || !isValidUint64(m.tileOffsetI64)) {
      throw new RangeError("docOffsetI64/tileOffsetI64는 유효한 64비트 부호 없는 정수여야 합니다.");
    }
    rawPayloadBytes += m.payload.byteLength;
    alignedSlabBytes += m.payload.byteLength === 0 ? 0 : alignUp(m.payload.byteLength, SAB_PAYLOAD_ALIGNMENT_BYTES);
  }

  const soaOffset = PACKET_HEADER_BYTES;
  const slabOffset = alignUp(soaOffset + Math.max(1, count) * SOA_BYTES_PER_SLOT, SAB_CACHE_LINE_BYTES);
  const totalBytes = slabOffset + Math.max(SAB_CACHE_LINE_BYTES, alignUp(alignedSlabBytes, SAB_CACHE_LINE_BYTES));
  const packet = new ArrayBuffer(totalBytes);
  const hdr = new Uint32Array(packet, 0, PACKET_HEADER_BYTES / 4);
  hdr[0] = PACKET_MAGIC; hdr[1] = SAB_CHANNEL_VERSION; hdr[2] = count >>> 0;
  hdr[3] = soaOffset; hdr[4] = slabOffset; hdr[5] = rawPayloadBytes >>> 0;

  if (count > 0) {
    const soa = bindSoaViews(packet, soaOffset, count);
    const slab = new Uint8Array(packet, slabOffset);
    let cursor = 0;
    const nowUs = nowMicrosI64();
    for (let i = 0; i < count; i += 1) {
      const m = messages[i];
      const seq = i + 1;
      const batchMeta = ((((m.batchPartCount ?? count) & 0xffff) << 16) | ((m.batchPartIndex ?? i) & 0xffff)) >>> 0;
      const flags = (m.flags ?? 0) >>> 0;
      const effBatchId = (m.batchId ?? batchId) >>> 0;
      const checksum = computeSabFrameChecksum(
        m.kind, seq, m.docOffsetI64, m.tileOffsetI64, effBatchId, batchMeta, flags, m.payload,
      );
      if (m.payload.byteLength > 0) slab.set(m.payload, cursor);
      soa.docOffsets[i] = m.docOffsetI64; soa.tileOffsets[i] = m.tileOffsetI64;
      soa.timestampsUs[i] = m.timestampUsI64 ?? nowUs;
      soa.kinds[i] = m.kind; soa.sequences[i] = seq; soa.batchIds[i] = effBatchId; soa.batchMetas[i] = batchMeta;
      soa.slabOffsets[i] = cursor; soa.payloadLengths[i] = m.payload.byteLength >>> 0;
      soa.slabReserved[i] = alignUp(m.payload.byteLength, SAB_PAYLOAD_ALIGNMENT_BYTES);
      soa.checksums[i] = checksum; soa.flags[i] = flags;
      cursor += m.payload.byteLength === 0 ? 0 : alignUp(m.payload.byteLength, SAB_PAYLOAD_ALIGNMENT_BYTES);
    }
  }

  return {
    transportMode: "array-buffer-transferable-fallback", packet, transferList: [packet],
    frameCount: count, totalPayloadBytes: rawPayloadBytes, structuredCloneBytes: 0,
  };
}

export function decodeTransferableFramePacket(
  packet: ArrayBuffer,
  options?: { readonly verifyChecksum?: boolean },
): { readonly ok: boolean; readonly frames: readonly SabDecodedFrame[]; readonly checksumErrors: number } {
  if (packet.byteLength < PACKET_HEADER_BYTES) throw new RangeError(`Transferable 패킷 크기 부족(${packet.byteLength}B).`);
  const hdr = new Uint32Array(packet, 0, PACKET_HEADER_BYTES / 4);
  if (hdr[0] !== PACKET_MAGIC) throw new Error(`잘못된 Transferable 패킷 매직: 0x${hdr[0].toString(16)}`);
  const count = hdr[2];
  const verify = options?.verifyChecksum ?? true;
  if (count === 0) return { ok: true, frames: [], checksumErrors: 0 };

  const soa = bindSoaViews(packet, hdr[3], count);
  const slab = new Uint8Array(packet, hdr[4]);
  const frames: SabDecodedFrame[] = [];
  let checksumErrors = 0;

  for (let i = 0; i < count; i += 1) {
    const off = soa.slabOffsets[i];
    const len = soa.payloadLengths[i];
    const payloadView = slab.subarray(off, off + len);
    const kind = soa.kinds[i] as SabMessageKindValue;
    const seq = soa.sequences[i];
    const docOffsetI64 = soa.docOffsets[i];
    const tileOffsetI64 = soa.tileOffsets[i];
    const batchId = soa.batchIds[i];
    const batchMeta = soa.batchMetas[i];
    const flags = soa.flags[i];
    const expected = soa.checksums[i];
    if (verify) {
      const actual = computeSabFrameChecksum(kind, seq, docOffsetI64, tileOffsetI64, batchId, batchMeta, flags, payloadView);
      if (actual !== expected) {
        checksumErrors += 1;
        continue;
      }
    }
    frames.push({
      kind, sequence: seq, docOffsetI64, tileOffsetI64, timestampUsI64: soa.timestampsUs[i],
      batchId, batchPartIndex: batchMeta & 0xffff, batchPartCount: (batchMeta >>> 16) & 0xffff,
      flags, checksumFnv1a: expected, payloadByteLength: len, payload: payloadView, zeroCopyView: true,
    });
  }
  return { ok: checksumErrors === 0, frames, checksumErrors };
}
