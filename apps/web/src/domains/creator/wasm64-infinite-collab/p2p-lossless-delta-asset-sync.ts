/**
 * 제로-코스트(₩0 서버 대역폭) WebRTC DataChannel P2P 무손실 델타 에셋·타일 동기화 엔진.
 *
 * - 64비트 FNV-1a(선택적 SHA-256) 콘텐츠 주소 지정 매니페스트로 미변경 타일은 0바이트 생략하고,
 *   변경·누락 타일만 기존 `Wasm64TileUndoCompressor`의 `compressTileXorDelta`/`applyTileXorDeltaInPlace`로
 *   무손실 XOR-Delta + 단색 배경 베이스라인 예측 + 확장 제로런 RLE 압축 전송한다.
 * - 모든 와이어 패킷은 WebRTC SCTP 안전 한계(16 KiB = 16,384B) 이하 바이너리 프레임(`"TSP2"`)으로
 *   청킹되며 슬라이딩 윈도우 배압(`bufferedAmount`), 순서 역전 재조립, ACK/NACK 재전송을 지원한다.
 * - `LightweightCrdtStrokeLog`와 결합해 다중 피어 동시 편집을 0-byte-diff 동일 상태로 수렴시킨다.
 */

import { computeFnv1a32 } from "../wasm64-webgpu-compute/opfs-streaming-tile-mmap";
import {
  LightweightCrdtStrokeLog,
  type CrdtLocalStrokeOpInput,
  type CrdtStrokeOp,
} from "../wasm64-worker-isolation/lightweight-p2p-crdt-delta";
import {
  applyTileXorDeltaInPlace,
  compressTileXorDelta,
} from "../wasm64-zero-copy-ipc/wasm64-tile-undo-compressor";

export const WEBRTC_SCTP_MAX_FRAME_BYTES = 16_384 as const;
export const P2P_FRAME_HEADER_BYTES = 32 as const;
export const P2P_MAX_CHUNK_PAYLOAD_BYTES = WEBRTC_SCTP_MAX_FRAME_BYTES - P2P_FRAME_HEADER_BYTES;
export const P2P_FRAME_MAGIC = 0x32505354 as const; // "TSP2"
export const P2P_PROTOCOL_VERSION = 1 as const;
export const DEFAULT_SLIDING_WINDOW_SIZE = 16;
export const DEFAULT_MAX_BUFFERED_AMOUNT_BYTES = 256 * 1024;
export const DEFAULT_RETRANSMIT_TIMEOUT_MS = 120;
export const DEFAULT_MAX_RETRANSMIT_ATTEMPTS = 24;

const FNV1A_64_OFFSET_BASIS = BigInt("0xcbf29ce484222325");
const FNV1A_64_PRIME = BigInt("0x100000001b3");
const FNV1A_64_MASK = BigInt("0xffffffffffffffff");
const BIG_32 = BigInt(32);
const BIG_MASK32 = BigInt(0xffffffff);
const TILE_DELTA_FIXED_HEADER_BYTES = 38;

export const P2pFrameType = {
  ManifestOffer: 0, ManifestRequest: 1, TileDeltaChunk: 2,
  CrdtOpBatch: 3, Ack: 4, Nack: 5, SyncComplete: 6,
} as const;
export type P2pFrameTypeCode = (typeof P2pFrameType)[keyof typeof P2pFrameType];

export interface TileAssetManifestEntry {
  readonly key: string; readonly byteLength: number; readonly fnv1a64Hex: string;
  readonly sha256Hex?: string; readonly revision: number;
  readonly authorPeerId: number; readonly lamportTs: number;
}
export interface TileManifestDiff {
  readonly missingKeys: readonly string[]; readonly changedKeys: readonly string[];
  readonly unchangedKeys: readonly string[]; readonly localNewerKeys: readonly string[];
}
export interface P2pWireFrame {
  readonly version: number; readonly frameType: P2pFrameTypeCode; readonly flags: number;
  readonly senderPeerId: number; readonly chunkIndex: number; readonly totalChunks: number;
  readonly windowCredit: number; readonly transferId: number; readonly seq: number;
  readonly payload: Uint8Array; readonly checksum: number;
}
export interface WebRtcDataChannelLike {
  readonly readyState: "connecting" | "open" | "closing" | "closed";
  readonly bufferedAmount: number;
  send(data: Uint8Array): void;
}
export interface P2pLosslessDeltaSyncNodeOptions {
  readonly peerId: number; readonly windowSize?: number; readonly maxBufferedAmountBytes?: number;
  readonly retransmitTimeoutMs?: number; readonly maxRetransmitAttempts?: number;
  readonly maxBaseHistoryPerKey?: number; readonly crdtLog?: LightweightCrdtStrokeLog;
}
export interface P2pSyncTelemetry {
  readonly peerId: number; readonly tileCount: number; readonly crdtOpCount: number;
  readonly framesSent: number; readonly framesReceived: number; readonly bytesSent: number; readonly bytesReceived: number;
  readonly rawTileBytesSynced: number; readonly compressedDeltaBytesSynced: number; readonly compressionSavingsPercent: number;
  readonly retransmits: number; readonly acksSent: number; readonly acksReceived: number;
  readonly nacksSent: number; readonly nacksReceived: number; readonly outOfOrderFrames: number;
  readonly duplicateFramesIgnored: number; readonly corruptFramesRejected: number;
  readonly backpressurePauses: number; readonly inFlightFrames: number; readonly queuedFrames: number;
  readonly serverBandwidthBytes: 0;
}

interface StoredTileAsset {
  readonly key: string; pixels: Uint8Array; entry: TileAssetManifestEntry;
  readonly baseSnapshots: Map<string, Uint8Array>;
}
interface QueuedFrame {
  readonly frameType: P2pFrameTypeCode; readonly transferId: number; readonly seq: number;
  readonly chunkIndex: number; readonly totalChunks: number; readonly wireBytes: Uint8Array;
}
interface InFlightFrame extends QueuedFrame { sentAtMs: number; attempts: number; }
interface ChunkReassemblyState {
  readonly frameType: P2pFrameTypeCode; readonly totalChunks: number; readonly chunks: Map<number, Uint8Array>;
}
interface PeerLinkState {
  readonly remotePeerId: number; channel: WebRtcDataChannelLike; nextSendSeq: number;
  readonly sendQueue: QueuedFrame[]; readonly inFlight: Map<number, InFlightFrame>;
  readonly receivedSeqs: Set<number>; highestReceivedSeq: number;
  readonly reassembly: Map<number, ChunkReassemblyState>;
}
interface ManifestOfferPayload {
  readonly manifest: readonly TileAssetManifestEntry[];
  readonly crdtVector: readonly (readonly [number, number])[];
}
interface ManifestRequestItem { readonly key: string; readonly baseFnv1a64Hex?: string; }
interface ManifestRequestPayload { readonly requests: readonly ManifestRequestItem[]; }

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** 64비트 FNV-1a 콘텐츠 주소 지정 해시를 계산한다(ES2017 BigInt 호환). */
export function computeFnv1a64(bytes: Uint8Array): bigint {
  let hash = FNV1A_64_OFFSET_BASIS;
  for (let i = 0; i < bytes.byteLength; i += 1) {
    hash ^= BigInt(bytes[i]!);
    hash = (hash * FNV1A_64_PRIME) & FNV1A_64_MASK;
  }
  return hash;
}
export function formatFnv1a64Hex(hash: bigint): string {
  return (hash & FNV1A_64_MASK).toString(16).padStart(16, "0");
}
export function parseFnv1a64Hex(hex: string): bigint {
  return BigInt(`0x${hex.trim() || "0"}`) & FNV1A_64_MASK;
}

/** WebCrypto `SubtleCrypto`를 이용한 선택적 SHA-256 16진 해시 계산. */
export async function computeSha256Hex(bytes: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = new Uint8Array(await subtle.digest("SHA-256", copy));
  let hex = "";
  for (let i = 0; i < digest.byteLength; i += 1) hex += digest[i]!.toString(16).padStart(2, "0");
  return hex;
}

/** 두 매니페스트 항목의 결정론적 전순서 비교(양수이면 `a`가 우선). */
export function compareManifestPrecedence(
  a: Pick<TileAssetManifestEntry, "lamportTs" | "authorPeerId" | "fnv1a64Hex">,
  b: Pick<TileAssetManifestEntry, "lamportTs" | "authorPeerId" | "fnv1a64Hex">,
): number {
  if (a.lamportTs !== b.lamportTs) return a.lamportTs - b.lamportTs;
  if (a.authorPeerId !== b.authorPeerId) return a.authorPeerId - b.authorPeerId;
  return a.fnv1a64Hex === b.fnv1a64Hex ? 0 : a.fnv1a64Hex > b.fnv1a64Hex ? 1 : -1;
}

/** 로컬·원격 콘텐츠 매니페스트 차집합을 계산해 최소 동기화 대상을 산출한다. */
export function computeManifestDiff(
  localEntries: ReadonlyMap<string, TileAssetManifestEntry>,
  remoteEntries: readonly TileAssetManifestEntry[],
): TileManifestDiff {
  const missingKeys: string[] = [], changedKeys: string[] = [], unchangedKeys: string[] = [], localNewerKeys: string[] = [];
  for (const remote of remoteEntries) {
    const local = localEntries.get(remote.key);
    if (!local) missingKeys.push(remote.key);
    else if (local.fnv1a64Hex === remote.fnv1a64Hex) unchangedKeys.push(remote.key);
    else if (compareManifestPrecedence(remote, local) > 0) changedKeys.push(remote.key);
    else localNewerKeys.push(remote.key);
  }
  return { missingKeys, changedKeys, unchangedKeys, localNewerKeys };
}

function writeU64LE(v: DataView, off: number, val: bigint): void {
  v.setUint32(off, Number(val & BIG_MASK32), true);
  v.setUint32(off + 4, Number((val >> BIG_32) & BIG_MASK32), true);
}
function readU64LE(v: DataView, off: number): bigint {
  return (BigInt(v.getUint32(off + 4, true)) << BIG_32) | BigInt(v.getUint32(off, true));
}
function sampleDominantRgba8(bytes: Uint8Array): number {
  if (bytes.byteLength < 4 || (bytes.byteLength & 3) !== 0) return 0;
  const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >>> 2);
  const n = words.length;
  const picks = [words[0]!, words[n >>> 2]!, words[n >>> 1]!, words[(n * 3) >>> 2]!, words[n - 1]!];
  let best = picks[0]!, bestCount = 0;
  for (const c of picks) {
    let count = 0;
    for (const o of picks) if (o === c) count += 1;
    if (count > bestCount) { bestCount = count; best = c; }
  }
  return best >>> 0;
}
function fillBaselineRgba8(target: Uint8Array, fillRgba8: number): void {
  if (fillRgba8 !== 0 && (target.byteLength & 3) === 0) {
    new Uint32Array(target.buffer, target.byteOffset, target.byteLength >>> 2).fill(fillRgba8 >>> 0);
  }
}
function computeFrameIntegrityCrc(frameBytes: Uint8Array): number {
  let hash = computeFnv1a32(frameBytes, 0, P2P_FRAME_HEADER_BYTES - 4);
  for (let i = P2P_FRAME_HEADER_BYTES; i < frameBytes.byteLength; i += 1) {
    hash = Math.imul(hash ^ frameBytes[i]!, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** 16 KiB SCTP 안전 바이너리 P2P 프레임을 인코딩한다. */
export function encodeP2pFrame(input: {
  readonly frameType: P2pFrameTypeCode; readonly senderPeerId: number; readonly transferId: number;
  readonly seq: number; readonly chunkIndex?: number; readonly totalChunks?: number;
  readonly windowCredit?: number; readonly flags?: number; readonly payload?: Uint8Array;
}): Uint8Array {
  const payload = input.payload ?? new Uint8Array(0);
  if (payload.byteLength > P2P_MAX_CHUNK_PAYLOAD_BYTES) {
    throw new RangeError(`P2P 프레임 페이로드(${payload.byteLength}B)가 SCTP 안전 상한(${P2P_MAX_CHUNK_PAYLOAD_BYTES}B) 초과.`);
  }
  const out = new Uint8Array(P2P_FRAME_HEADER_BYTES + payload.byteLength);
  const v = new DataView(out.buffer);
  v.setUint32(0, P2P_FRAME_MAGIC, true);
  v.setUint8(4, P2P_PROTOCOL_VERSION);
  v.setUint8(5, input.frameType & 0xff);
  v.setUint16(6, (input.flags ?? 0) & 0xffff, true);
  v.setUint16(8, input.senderPeerId & 0xffff, true);
  v.setUint16(10, (input.chunkIndex ?? 0) & 0xffff, true);
  v.setUint16(12, (input.totalChunks ?? 1) & 0xffff, true);
  v.setUint16(14, (input.windowCredit ?? DEFAULT_SLIDING_WINDOW_SIZE) & 0xffff, true);
  v.setUint32(16, input.transferId >>> 0, true);
  v.setUint32(20, input.seq >>> 0, true);
  v.setUint32(24, payload.byteLength >>> 0, true);
  if (payload.byteLength > 0) out.set(payload, P2P_FRAME_HEADER_BYTES);
  v.setUint32(28, computeFrameIntegrityCrc(out), true);
  return out;
}

/** 바이너리 P2P 프레임을 검증·디코딩한다. 손상 시 `null` 반환(NACK 유도). */
export function decodeP2pFrame(bytes: Uint8Array): P2pWireFrame | null {
  if (bytes.byteLength < P2P_FRAME_HEADER_BYTES || bytes.byteLength > WEBRTC_SCTP_MAX_FRAME_BYTES) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint32(0, true) !== P2P_FRAME_MAGIC || v.getUint8(4) !== P2P_PROTOCOL_VERSION) return null;
  const payloadLen = v.getUint32(24, true);
  if (P2P_FRAME_HEADER_BYTES + payloadLen !== bytes.byteLength) return null;
  const storedCrc = v.getUint32(28, true);
  if (storedCrc !== computeFrameIntegrityCrc(bytes)) return null;
  const rawType = v.getUint8(5);
  if (rawType > P2pFrameType.SyncComplete) return null;
  return {
    version: P2P_PROTOCOL_VERSION, frameType: rawType as P2pFrameTypeCode, flags: v.getUint16(6, true),
    senderPeerId: v.getUint16(8, true), chunkIndex: v.getUint16(10, true), totalChunks: v.getUint16(12, true),
    windowCredit: v.getUint16(14, true), transferId: v.getUint32(16, true), seq: v.getUint32(20, true),
    payload: bytes.slice(P2P_FRAME_HEADER_BYTES), checksum: storedCrc,
  };
}

function encodeTileDeltaEnvelope(
  entry: TileAssetManifestEntry, compressedPayload: Uint8Array, baseFnv1a64Hex: string | null, baseFillRgba8: number,
): Uint8Array {
  const keyBytes = textEncoder.encode(entry.key);
  const shaBytes = entry.sha256Hex ? textEncoder.encode(entry.sha256Hex) : null;
  const out = new Uint8Array(TILE_DELTA_FIXED_HEADER_BYTES + keyBytes.byteLength + (shaBytes ? 2 + shaBytes.byteLength : 0) + compressedPayload.byteLength);
  const v = new DataView(out.buffer);
  v.setUint16(0, keyBytes.byteLength, true);
  v.setUint8(2, baseFnv1a64Hex ? 1 : 0);
  v.setUint8(3, shaBytes ? 1 : 0);
  v.setUint32(4, entry.revision >>> 0, true);
  v.setUint16(8, entry.authorPeerId & 0xffff, true);
  v.setUint32(10, entry.lamportTs >>> 0, true);
  v.setUint32(14, entry.byteLength >>> 0, true);
  writeU64LE(v, 18, parseFnv1a64Hex(entry.fnv1a64Hex));
  writeU64LE(v, 26, baseFnv1a64Hex ? parseFnv1a64Hex(baseFnv1a64Hex) : BigInt(0));
  v.setUint32(34, baseFillRgba8 >>> 0, true);
  let off = TILE_DELTA_FIXED_HEADER_BYTES;
  out.set(keyBytes, off); off += keyBytes.byteLength;
  if (shaBytes) { v.setUint16(off, shaBytes.byteLength, true); off += 2; out.set(shaBytes, off); off += shaBytes.byteLength; }
  out.set(compressedPayload, off);
  return out;
}

function decodeTileDeltaEnvelope(bytes: Uint8Array): {
  readonly entry: TileAssetManifestEntry; readonly isBaseDelta: boolean;
  readonly baseFnv1a64Hex: string; readonly baseFillRgba8: number; readonly deltaPayload: Uint8Array;
} | null {
  if (bytes.byteLength < TILE_DELTA_FIXED_HEADER_BYTES) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const keyLen = v.getUint16(0, true);
  const isBaseDelta = v.getUint8(2) === 1;
  const hasSha = (v.getUint8(3) & 1) === 1;
  const revision = v.getUint32(4, true), authorPeerId = v.getUint16(8, true);
  const lamportTs = v.getUint32(10, true), byteLength = v.getUint32(14, true);
  const fnv1a64Hex = formatFnv1a64Hex(readU64LE(v, 18));
  const baseFnv1a64Hex = formatFnv1a64Hex(readU64LE(v, 26));
  const baseFillRgba8 = v.getUint32(34, true);
  let off = TILE_DELTA_FIXED_HEADER_BYTES;
  if (off + keyLen > bytes.byteLength) return null;
  const key = textDecoder.decode(bytes.subarray(off, off + keyLen));
  off += keyLen;
  let sha256Hex: string | undefined;
  if (hasSha) {
    if (off + 2 > bytes.byteLength) return null;
    const shaLen = v.getUint16(off, true); off += 2;
    if (off + shaLen > bytes.byteLength) return null;
    sha256Hex = textDecoder.decode(bytes.subarray(off, off + shaLen)); off += shaLen;
  }
  return {
    entry: { key, byteLength, fnv1a64Hex, ...(sha256Hex ? { sha256Hex } : {}), revision, authorPeerId, lamportTs },
    isBaseDelta, baseFnv1a64Hex, baseFillRgba8, deltaPayload: bytes.subarray(off),
  };
}

export class P2pLosslessDeltaSyncNode {
  readonly peerId: number;
  readonly windowSize: number;
  readonly maxBufferedAmountBytes: number;
  readonly retransmitTimeoutMs: number;
  readonly maxRetransmitAttempts: number;
  readonly crdtLog: LightweightCrdtStrokeLog;

  private readonly maxBaseHistoryPerKey: number;
  private readonly tiles = new Map<string, StoredTileAsset>();
  private readonly peers = new Map<number, PeerLinkState>();
  private lamportClock = 0;
  private nextTransferId = 1;
  private framesSent = 0; private framesReceived = 0; private bytesSent = 0; private bytesReceived = 0;
  private rawTileBytesSynced = 0; private compressedDeltaBytesSynced = 0;
  private retransmits = 0; private acksSent = 0; private acksReceived = 0;
  private nacksSent = 0; private nacksReceived = 0; private outOfOrderFrames = 0;
  private duplicateFramesIgnored = 0; private corruptFramesRejected = 0; private backpressurePauses = 0;

  constructor(options: P2pLosslessDeltaSyncNodeOptions) {
    if (!Number.isInteger(options.peerId) || options.peerId < 0 || options.peerId > 0xffff) {
      throw new RangeError(`peerId must be uint16 (got ${options.peerId})`);
    }
    this.peerId = options.peerId;
    this.windowSize = Math.max(1, options.windowSize ?? DEFAULT_SLIDING_WINDOW_SIZE);
    this.maxBufferedAmountBytes = Math.max(WEBRTC_SCTP_MAX_FRAME_BYTES, options.maxBufferedAmountBytes ?? DEFAULT_MAX_BUFFERED_AMOUNT_BYTES);
    this.retransmitTimeoutMs = Math.max(1, options.retransmitTimeoutMs ?? DEFAULT_RETRANSMIT_TIMEOUT_MS);
    this.maxRetransmitAttempts = Math.max(1, options.maxRetransmitAttempts ?? DEFAULT_MAX_RETRANSMIT_ATTEMPTS);
    this.maxBaseHistoryPerKey = Math.max(1, options.maxBaseHistoryPerKey ?? 4);
    this.crdtLog = options.crdtLog ?? new LightweightCrdtStrokeLog(this.peerId);
  }

  attachPeerChannel(remotePeerId: number, channel: WebRtcDataChannelLike): void {
    const existing = this.peers.get(remotePeerId);
    if (existing) { existing.channel = channel; return; }
    this.peers.set(remotePeerId, {
      remotePeerId, channel, nextSendSeq: 1, sendQueue: [], inFlight: new Map(),
      receivedSeqs: new Set(), highestReceivedSeq: 0, reassembly: new Map(),
    });
  }
  detachPeerChannel(remotePeerId: number): boolean { return this.peers.delete(remotePeerId); }
  getTilePixels(key: string): Uint8Array | null { return this.tiles.get(key)?.pixels ?? null; }
  getManifest(): ReadonlyMap<string, TileAssetManifestEntry> {
    const map = new Map<string, TileAssetManifestEntry>();
    for (const [k, asset] of this.tiles) map.set(k, asset.entry);
    return map;
  }

  putLocalTile(key: string, pixels: Uint8Array, sha256Hex?: string): TileAssetManifestEntry {
    this.lamportClock += 1;
    const copy = pixels.slice();
    const fnv1a64Hex = formatFnv1a64Hex(computeFnv1a64(copy));
    const existing = this.tiles.get(key);
    const entry: TileAssetManifestEntry = {
      key, byteLength: copy.byteLength, fnv1a64Hex, ...(sha256Hex ? { sha256Hex } : {}),
      revision: existing ? existing.entry.revision + 1 : 1, authorPeerId: this.peerId, lamportTs: this.lamportClock,
    };
    if (existing) {
      this.rememberBaseSnapshot(existing, existing.entry.fnv1a64Hex, existing.pixels);
      existing.pixels = copy; existing.entry = entry;
    } else {
      this.tiles.set(key, { key, pixels: copy, entry, baseSnapshots: new Map() });
    }
    return entry;
  }

  async putLocalTileWithSha256(key: string, pixels: Uint8Array): Promise<TileAssetManifestEntry> {
    return this.putLocalTile(key, pixels, (await computeSha256Hex(pixels)) ?? undefined);
  }

  recordLocalStrokeOp(input: CrdtLocalStrokeOpInput, nowMs = 0): CrdtStrokeOp {
    const { op, packet } = this.crdtLog.createLocalOp(input);
    if (op.lamportTs > this.lamportClock) this.lamportClock = op.lamportTs;
    for (const remotePeerId of this.peers.keys()) {
      this.enqueueReliableMessage(remotePeerId, P2pFrameType.CrdtOpBatch, packet);
      this.flushPeer(remotePeerId, nowMs);
    }
    return op;
  }

  initiateSyncWithPeer(remotePeerId: number, nowMs = 0): number {
    const offer: ManifestOfferPayload = {
      manifest: Array.from(this.tiles.values(), (a) => a.entry),
      crdtVector: Array.from(this.crdtLog.getPeerSeqVector().entries()),
    };
    const count = this.enqueueReliableMessage(remotePeerId, P2pFrameType.ManifestOffer, textEncoder.encode(JSON.stringify(offer)));
    this.flushPeer(remotePeerId, nowMs);
    return count;
  }

  initiateSyncAll(nowMs = 0): number {
    let total = 0;
    for (const remotePeerId of this.peers.keys()) total += this.initiateSyncWithPeer(remotePeerId, nowMs);
    return total;
  }

  receiveFrame(remotePeerId: number, rawBytes: Uint8Array, nowMs = 0): boolean {
    this.bytesReceived += rawBytes.byteLength;
    const link = this.peers.get(remotePeerId);
    if (!link) return false;
    const frame = decodeP2pFrame(rawBytes);
    if (!frame) {
      this.corruptFramesRejected += 1;
      if (rawBytes.byteLength >= P2P_FRAME_HEADER_BYTES) {
        const maybeSeq = new DataView(rawBytes.buffer, rawBytes.byteOffset, P2P_FRAME_HEADER_BYTES).getUint32(20, true);
        if (maybeSeq > 0 && !link.receivedSeqs.has(maybeSeq)) this.sendControlFrame(link, P2pFrameType.Nack, maybeSeq);
      }
      return false;
    }
    this.framesReceived += 1;

    if (frame.frameType === P2pFrameType.Ack) {
      this.acksReceived += 1;
      link.inFlight.delete(frame.seq);
      this.flushPeer(remotePeerId, nowMs);
      return true;
    }
    if (frame.frameType === P2pFrameType.Nack) {
      this.nacksReceived += 1;
      const pending = link.inFlight.get(frame.seq);
      if (pending && link.channel.readyState === "open") {
        if (link.channel.bufferedAmount < this.maxBufferedAmountBytes) {
          this.sendWireBytes(link, pending.wireBytes);
          pending.sentAtMs = nowMs; pending.attempts += 1; this.retransmits += 1;
        } else { this.backpressurePauses += 1; }
      }
      return true;
    }

    this.sendControlFrame(link, P2pFrameType.Ack, frame.seq);
    if (link.receivedSeqs.has(frame.seq)) { this.duplicateFramesIgnored += 1; return true; }

    if (frame.seq > link.highestReceivedSeq + 1) {
      this.outOfOrderFrames += 1;
      for (let m = link.highestReceivedSeq + 1; m < frame.seq; m += 1) {
        if (!link.receivedSeqs.has(m)) this.sendControlFrame(link, P2pFrameType.Nack, m);
      }
    } else if (frame.seq < link.highestReceivedSeq) {
      this.outOfOrderFrames += 1;
    }

    link.receivedSeqs.add(frame.seq);
    if (frame.seq > link.highestReceivedSeq) link.highestReceivedSeq = frame.seq;
    const assembled = this.reassembleChunk(link, frame);
    if (assembled) this.handleAssembledMessage(remotePeerId, assembled.frameType, assembled.payload, nowMs);
    return true;
  }

  tick(nowMs: number): number {
    let retransmitted = 0;
    for (const [remotePeerId, link] of this.peers) {
      if (link.channel.readyState !== "open") continue;
      for (const [seq, pending] of link.inFlight) {
        if (nowMs - pending.sentAtMs < this.retransmitTimeoutMs) continue;
        if (pending.attempts >= this.maxRetransmitAttempts) { link.inFlight.delete(seq); continue; }
        if (link.channel.bufferedAmount >= this.maxBufferedAmountBytes) { this.backpressurePauses += 1; break; }
        this.sendWireBytes(link, pending.wireBytes);
        pending.sentAtMs = nowMs; pending.attempts += 1; this.retransmits += 1; retransmitted += 1;
      }
      this.flushPeer(remotePeerId, nowMs);
    }
    return retransmitted;
  }

  isQuiescent(): boolean {
    for (const link of this.peers.values()) {
      if (link.sendQueue.length > 0 || link.inFlight.size > 0 || link.reassembly.size > 0) return false;
    }
    return true;
  }

  getTelemetry(): P2pSyncTelemetry {
    let inFlightFrames = 0, queuedFrames = 0;
    for (const link of this.peers.values()) { inFlightFrames += link.inFlight.size; queuedFrames += link.sendQueue.length; }
    return {
      peerId: this.peerId, tileCount: this.tiles.size, crdtOpCount: this.crdtLog.size(),
      framesSent: this.framesSent, framesReceived: this.framesReceived, bytesSent: this.bytesSent, bytesReceived: this.bytesReceived,
      rawTileBytesSynced: this.rawTileBytesSynced, compressedDeltaBytesSynced: this.compressedDeltaBytesSynced,
      compressionSavingsPercent: this.rawTileBytesSynced > 0 ? ((this.rawTileBytesSynced - this.compressedDeltaBytesSynced) / this.rawTileBytesSynced) * 100 : 0,
      retransmits: this.retransmits, acksSent: this.acksSent, acksReceived: this.acksReceived,
      nacksSent: this.nacksSent, nacksReceived: this.nacksReceived, outOfOrderFrames: this.outOfOrderFrames,
      duplicateFramesIgnored: this.duplicateFramesIgnored, corruptFramesRejected: this.corruptFramesRejected,
      backpressurePauses: this.backpressurePauses, inFlightFrames, queuedFrames, serverBandwidthBytes: 0,
    };
  }

  private handleAssembledMessage(remotePeerId: number, frameType: P2pFrameTypeCode, payload: Uint8Array, nowMs: number): void {
    if (frameType === P2pFrameType.ManifestOffer) {
      const offer = JSON.parse(textDecoder.decode(payload)) as ManifestOfferPayload;
      const diff = computeManifestDiff(this.getManifest(), offer.manifest);
      const requests: ManifestRequestItem[] = diff.missingKeys.map((key) => ({ key }));
      for (const key of diff.changedKeys) {
        const local = this.tiles.get(key);
        requests.push({ key, ...(local ? { baseFnv1a64Hex: local.entry.fnv1a64Hex } : {}) });
      }
      if (requests.length > 0) {
        this.enqueueReliableMessage(remotePeerId, P2pFrameType.ManifestRequest, textEncoder.encode(JSON.stringify({ requests } satisfies ManifestRequestPayload)));
      }
      const crdtDelta = this.crdtLog.exportDeltaForVector(new Map<number, number>(offer.crdtVector));
      if (crdtDelta.byteLength > 0) this.enqueueReliableMessage(remotePeerId, P2pFrameType.CrdtOpBatch, crdtDelta);
      this.flushPeer(remotePeerId, nowMs);
      return;
    }

    if (frameType === P2pFrameType.ManifestRequest) {
      const req = JSON.parse(textDecoder.decode(payload)) as ManifestRequestPayload;
      for (const item of req.requests) {
        const asset = this.tiles.get(item.key);
        if (!asset) continue;
        const matchedBase = item.baseFnv1a64Hex
          ? (asset.entry.fnv1a64Hex === item.baseFnv1a64Hex ? asset.pixels : asset.baseSnapshots.get(item.baseFnv1a64Hex) ?? null)
          : null;
        const useBase = matchedBase !== null && matchedBase.byteLength === asset.pixels.byteLength;
        let baseline: Uint8Array;
        let baseFillRgba8 = 0;
        if (useBase) {
          baseline = matchedBase;
        } else {
          baseFillRgba8 = sampleDominantRgba8(asset.pixels);
          baseline = new Uint8Array(asset.pixels.byteLength);
          fillBaselineRgba8(baseline, baseFillRgba8);
        }
        const compressed = compressTileXorDelta(baseline, asset.pixels);
        this.rawTileBytesSynced += compressed.rawByteLength;
        this.compressedDeltaBytesSynced += compressed.compressedByteLength;
        const envelope = encodeTileDeltaEnvelope(asset.entry, compressed.payload, useBase ? item.baseFnv1a64Hex ?? null : null, baseFillRgba8);
        this.enqueueReliableMessage(remotePeerId, P2pFrameType.TileDeltaChunk, envelope);
      }
      this.flushPeer(remotePeerId, nowMs);
      return;
    }

    if (frameType === P2pFrameType.TileDeltaChunk) {
      const env = decodeTileDeltaEnvelope(payload);
      if (!env) { this.corruptFramesRejected += 1; return; }
      const existing = this.tiles.get(env.entry.key);
      if (existing && compareManifestPrecedence(env.entry, existing.entry) <= 0) return;

      const target = new Uint8Array(env.entry.byteLength);
      if (env.isBaseDelta && existing) {
        const srcBase = existing.entry.fnv1a64Hex === env.baseFnv1a64Hex ? existing.pixels : existing.baseSnapshots.get(env.baseFnv1a64Hex);
        if (!srcBase || srcBase.byteLength !== env.entry.byteLength) {
          this.enqueueReliableMessage(remotePeerId, P2pFrameType.ManifestRequest, textEncoder.encode(JSON.stringify({ requests: [{ key: env.entry.key }] } satisfies ManifestRequestPayload)));
          this.flushPeer(remotePeerId, nowMs);
          return;
        }
        target.set(srcBase);
      } else {
        fillBaselineRgba8(target, env.baseFillRgba8);
      }

      try { applyTileXorDeltaInPlace(target, env.deltaPayload); } catch { this.corruptFramesRejected += 1; return; }
      if (formatFnv1a64Hex(computeFnv1a64(target)) !== env.entry.fnv1a64Hex) { this.corruptFramesRejected += 1; return; }
      if (env.entry.lamportTs > this.lamportClock) this.lamportClock = env.entry.lamportTs;
      if (existing) {
        this.rememberBaseSnapshot(existing, existing.entry.fnv1a64Hex, existing.pixels);
        existing.pixels = target; existing.entry = env.entry;
      } else {
        this.tiles.set(env.entry.key, { key: env.entry.key, pixels: target, entry: env.entry, baseSnapshots: new Map() });
      }
      return;
    }

    if (frameType === P2pFrameType.CrdtOpBatch) {
      this.crdtLog.applyRemoteBatch(payload);
      if (this.crdtLog.getLamportClock() > this.lamportClock) this.lamportClock = this.crdtLog.getLamportClock();
    }
  }

  private enqueueReliableMessage(remotePeerId: number, frameType: P2pFrameTypeCode, payload: Uint8Array): number {
    const link = this.peers.get(remotePeerId);
    if (!link) return 0;
    const transferId = this.nextTransferId++;
    const totalChunks = Math.max(1, Math.ceil(payload.byteLength / P2P_MAX_CHUNK_PAYLOAD_BYTES));
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const start = chunkIndex * P2P_MAX_CHUNK_PAYLOAD_BYTES;
      const slice = payload.subarray(start, Math.min(payload.byteLength, start + P2P_MAX_CHUNK_PAYLOAD_BYTES));
      const seq = link.nextSendSeq++;
      const wireBytes = encodeP2pFrame({ frameType, senderPeerId: this.peerId, transferId, seq, chunkIndex, totalChunks, windowCredit: this.windowSize, payload: slice });
      link.sendQueue.push({ frameType, transferId, seq, chunkIndex, totalChunks, wireBytes });
    }
    return totalChunks;
  }

  private flushPeer(remotePeerId: number, nowMs: number): void {
    const link = this.peers.get(remotePeerId);
    if (!link || link.channel.readyState !== "open") return;
    while (link.sendQueue.length > 0 && link.inFlight.size < this.windowSize) {
      if (link.channel.bufferedAmount >= this.maxBufferedAmountBytes) { this.backpressurePauses += 1; break; }
      const next = link.sendQueue.shift()!;
      this.sendWireBytes(link, next.wireBytes);
      link.inFlight.set(next.seq, { ...next, sentAtMs: nowMs, attempts: 1 });
    }
  }

  private sendControlFrame(link: PeerLinkState, frameType: typeof P2pFrameType.Ack | typeof P2pFrameType.Nack, targetSeq: number): void {
    if (link.channel.readyState !== "open") return;
    this.sendWireBytes(link, encodeP2pFrame({ frameType, senderPeerId: this.peerId, transferId: 0, seq: targetSeq, windowCredit: this.windowSize }));
    if (frameType === P2pFrameType.Ack) this.acksSent += 1; else this.nacksSent += 1;
  }

  private sendWireBytes(link: PeerLinkState, bytes: Uint8Array): void {
    link.channel.send(bytes); this.framesSent += 1; this.bytesSent += bytes.byteLength;
  }

  private reassembleChunk(link: PeerLinkState, frame: P2pWireFrame): { readonly frameType: P2pFrameTypeCode; readonly payload: Uint8Array } | null {
    if (frame.totalChunks <= 1) return { frameType: frame.frameType, payload: frame.payload };
    let state = link.reassembly.get(frame.transferId);
    if (!state) { state = { frameType: frame.frameType, totalChunks: frame.totalChunks, chunks: new Map() }; link.reassembly.set(frame.transferId, state); }
    state.chunks.set(frame.chunkIndex, frame.payload);
    if (state.chunks.size < state.totalChunks) return null;
    let totalLen = 0;
    for (let i = 0; i < state.totalChunks; i += 1) {
      const part = state.chunks.get(i);
      if (!part) return null;
      totalLen += part.byteLength;
    }
    const merged = new Uint8Array(totalLen);
    let off = 0;
    for (let i = 0; i < state.totalChunks; i += 1) { const part = state.chunks.get(i)!; merged.set(part, off); off += part.byteLength; }
    link.reassembly.delete(frame.transferId);
    return { frameType: state.frameType, payload: merged };
  }

  private rememberBaseSnapshot(asset: StoredTileAsset, hashHex: string, pixels: Uint8Array): void {
    if (asset.baseSnapshots.has(hashHex)) return;
    if (asset.baseSnapshots.size >= this.maxBaseHistoryPerKey) {
      const oldest = asset.baseSnapshots.keys().next().value;
      if (oldest !== undefined) asset.baseSnapshots.delete(oldest);
    }
    asset.baseSnapshots.set(hashHex, pixels);
  }
}

export function createP2pLosslessDeltaSyncNode(options: P2pLosslessDeltaSyncNodeOptions): P2pLosslessDeltaSyncNode {
  return new P2pLosslessDeltaSyncNode(options);
}
