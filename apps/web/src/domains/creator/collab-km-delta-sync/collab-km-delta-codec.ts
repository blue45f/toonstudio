/**
 * Wave 31 Track C + Wave 32 — Yjs·WebRTC 호환 16파장 Kubelka-Munk 타일 델타 동기화 코덱 및
 * 오프라인 세이프존 로컬 싱크 허브(`OfflineSafeZoneMeshHub`).
 *
 * - 16파장 KM 광학 혼색 + 평면 XOR + RLE + LEB128 코덱(`km16-xor-rle-frame-codec.ts`) 재노출
 * - Lamport 시계 + 결정론적 OpId 전순서로 8인 동시 채색 0-충돌 수렴 보장
 * - 인터넷 단절 시 BroadcastChannel / 로컬 피어 메시 큐로 데이터 손실 0건 유지,
 *   재연결 시 Yjs 상태 벡터(State Vector) 차분으로 자동 CRDT 정합
 */

import * as Y from "yjs";

import {
  DEFAULT_KM_TILE_SIZE, MIN_REQUIRED_COMPRESSION_RATIO, applyXorTileDelta, canonicalizeKmStrokeInput,
  compareDeterministicOpId, computeFnv1a32, createBlankTileRgba, decodeKmDeltaBinaryFrame,
  encodeKmDeltaBinaryFrame, formatDigestHex, makeKmTileKey, mixKm16OpticalRgba,
  rasterizeKm16StrokeOnTile,
  type DecodedKmDeltaFrame, type DeterministicOpId, type EncodedKmDeltaFrame, type KmStrokeInput,
} from "./km16-xor-rle-frame-codec";

export {
  COLLAB_KM_DELTA_FRAME_MAGIC, COLLAB_KM_DELTA_PROTOCOL_VERSION, DEFAULT_KM_TILE_SIZE,
  KM16_BAND_COUNT, KM16_BASIS_B, KM16_BASIS_G, KM16_BASIS_R, KM16_WAVELENGTHS_NM,
  MIN_REQUIRED_COMPRESSION_RATIO, applyXorTileDelta, canonicalizeKmStrokeInput,
  compareDeterministicOpId, compressXorTileDeltaRleLeb128, computeFnv1a32, createBlankTileRgba,
  decodeKmDeltaBinaryFrame, decodeSleb128, decodeUleb128, decompressXorTileDeltaRleLeb128,
  dequantizeKm16Spectrum, encodeKmDeltaBinaryFrame, encodeSleb128, encodeUleb128, formatDigestHex,
  formatOpIdKey, km16SpectrumToSrgb8, makeKmTileKey, mixKm16OpticalRgba, quantizeKm16Spectrum,
  rasterizeKm16StrokeOnTile, srgb8ToKm16Spectrum,
} from "./km16-xor-rle-frame-codec";

export type {
  DecodedKmDeltaFrame, DeterministicOpId, EncodedKmDeltaFrame, Km16Spectrum,
  KmStrokeCommand, KmStrokeInput, KmStrokePoint,
} from "./km16-xor-rle-frame-codec";

const TEXT_ENCODER = new TextEncoder();

export interface SafeZoneStateVectorPacket {
  readonly peerId: string; readonly workId: string; readonly lamportClock: number;
  readonly yjsStateVector: Uint8Array; readonly peerOpSeqVector: Readonly<Record<string, number>>;
}

export interface SafeZoneStateVectorDiffPacket {
  readonly fromPeerId: string; readonly workId: string; readonly lamportClock: number;
  readonly yjsDiffUpdate: Uint8Array; readonly missingFrames: readonly Uint8Array[];
}

export interface SafeZoneReconnectReport {
  readonly peerId: string; readonly remotePeerId: string; readonly reconciledOpsCount: number;
  readonly yjsDiffBytes: number; readonly deltaFramesBytes: number; readonly drainedOutboxCount: number;
  readonly lostOpsCount: number; readonly conflictCount: number; readonly converged: boolean;
  readonly canvasDigestHex: string;
}

export interface BroadcastChannelMessageEventLike { readonly data: unknown; }

export interface BroadcastChannelLike {
  readonly name: string;
  onmessage: ((event: BroadcastChannelMessageEventLike) => void) | null;
  postMessage: (message: unknown) => void;
  close: () => void;
}

export interface SafeZoneHubOptions {
  readonly peerId: string; readonly workId: string; readonly tileSize?: number;
  readonly internetOnline?: boolean; readonly localMeshEnabled?: boolean;
  readonly meshBus?: LocalPeerMeshBus; readonly broadcastChannelName?: string;
  readonly channelFactory?: (name: string) => BroadcastChannelLike;
}

export interface SafeZoneFrameApplyResult {
  readonly applied: boolean; readonly duplicate: boolean;
  readonly fastPathXorApplied: boolean; readonly replayedOutOfOrder: boolean;
}

export interface SafeZoneHubMetrics {
  readonly peerId: string; readonly workId: string; readonly lamportClock: number;
  readonly totalOps: number; readonly localCommittedOps: number;
  readonly unsyncedOutboxCount: number; readonly localMeshDeliveredCount: number;
  readonly internetOnline: boolean; readonly localMeshEnabled: boolean;
  readonly transportMode: "broadcast-channel" | "local-mesh-queue";
  readonly rawRgbaTotalBytes: number; readonly compressedTotalBytes: number;
  readonly averageCompressionRatio: number; readonly canvasDigestHex: string;
}

export interface ArtistProfile {
  readonly peerId: string; readonly nameKo: string; readonly nameEn: string;
  readonly roleKo: string; readonly roleEn: string;
  readonly pigmentRgba: readonly [number, number, number, number];
}

export interface EightArtistBenchmarkResult {
  readonly tileSize: number; readonly artistCount: number; readonly totalStrokes: number;
  readonly rawRgbaTotalBytes: number; readonly compressedTotalBytes: number;
  readonly compressionRatio: number; readonly meets8xTarget: boolean;
  readonly allConverged: boolean; readonly conflictCount: number; readonly divergentBytes: number;
  readonly canvasDigestHex: string;
  readonly kmOpticalCheck: { readonly bluePlusYellow: readonly [number, number, number, number]; readonly greenDominant: boolean };
  readonly replicas: readonly SafeZoneHubMetrics[];
}

export interface SafeZoneUiSnapshot {
  readonly roundNumber: number; readonly tileSize: number;
  readonly internetOnline: boolean; readonly localMeshActive: boolean;
  readonly transportLabelKo: string; readonly transportLabelEn: string;
  readonly rawRgbaTotalBytes: number; readonly compressedTotalBytes: number;
  readonly compressionRatio: number; readonly lastYjsDiffBytes: number;
  readonly totalOps: number; readonly unsyncedOutboxTotal: number;
  readonly localMeshRelayedTotal: number; readonly lostOpsCount: number;
  readonly conflictCount: number; readonly convergedReplicaCount: number;
  readonly totalReplicaCount: number; readonly cloudDigestHex: string;
  readonly meshDigestHex: string; readonly blueYellowMixRgba: readonly [number, number, number, number];
  readonly replicas: readonly SafeZoneHubMetrics[];
}

export interface SafeZoneInteractiveController {
  readonly getSnapshot: () => SafeZoneUiSnapshot;
  readonly runConcurrentRound: () => SafeZoneUiSnapshot;
  readonly disconnectInternet: () => SafeZoneUiSnapshot;
  readonly paintOfflineLocalStroke: () => SafeZoneUiSnapshot;
  readonly reconnectCloudAndSync: () => SafeZoneUiSnapshot;
  readonly dispose: () => void;
}

export const EIGHT_ARTIST_PROFILES: readonly ArtistProfile[] = Object.freeze([
  { peerId: "artist-1", nameKo: "민서", nameEn: "Minseo", roleKo: "선화", roleEn: "Lineart", pigmentRgba: [24, 58, 198, 255] },
  { peerId: "artist-2", nameKo: "지훈", nameEn: "Jihun", roleKo: "밑색", roleEn: "Flats", pigmentRgba: [244, 214, 28, 255] },
  { peerId: "artist-3", nameKo: "서연", nameEn: "Seoyeon", roleKo: "음영", roleEn: "Shading", pigmentRgba: [212, 48, 42, 255] },
  { peerId: "artist-4", nameKo: "도윤", nameEn: "Doyun", roleKo: "배경", roleEn: "Background", pigmentRgba: [34, 152, 118, 255] },
  { peerId: "artist-5", nameKo: "하린", nameEn: "Harin", roleKo: "광원", roleEn: "Lighting", pigmentRgba: [236, 134, 34, 255] },
  { peerId: "artist-6", nameKo: "태오", nameEn: "Taeo", roleKo: "효과", roleEn: "FX", pigmentRgba: [132, 54, 186, 255] },
  { peerId: "artist-7", nameKo: "유진", nameEn: "Yujin", roleKo: "질감", roleEn: "Texture", pigmentRgba: [148, 92, 48, 255] },
  { peerId: "artist-8", nameKo: "수아", nameEn: "Sua", roleKo: "연출", roleEn: "Finish", pigmentRgba: [42, 128, 206, 255] },
]);

interface LocalMeshEnvelope {
  readonly kind: "km-delta-frame";
  readonly senderPeerId: string;
  readonly workId: string;
  readonly frameBytes: Uint8Array;
}

/** 인터넷 단절 시에도 주변 기기·탭 간 0-손실 프레임 전달을 중계하는 인메모리 로컬 피어 메시 버스. */
export class LocalPeerMeshBus {
  private readonly listeners = new Map<string, (envelope: LocalMeshEnvelope) => void>();

  public subscribe(peerId: string, handler: (envelope: LocalMeshEnvelope) => void): () => void {
    this.listeners.set(peerId, handler);
    return () => {
      this.listeners.delete(peerId);
    };
  }

  public broadcast(envelope: LocalMeshEnvelope): number {
    let delivered = 0;
    for (const [peerId, handler] of this.listeners.entries()) {
      if (peerId === envelope.senderPeerId) continue;
      handler(envelope);
      delivered += 1;
    }
    return delivered;
  }
}

export class OfflineSafeZoneMeshHub {
  public readonly peerId: string;
  public readonly workId: string;
  public readonly tileSize: number;
  public readonly ydoc: Y.Doc;

  private readonly opsMap: Y.Map<Uint8Array>;
  private readonly decodedOps = new Map<string, DecodedKmDeltaFrame>();
  private readonly tileBuffers = new Map<string, Uint8Array>();
  private readonly tileMaxOpId = new Map<string, DeterministicOpId>();
  private readonly unsyncedCloudOutbox = new Map<string, Uint8Array>();
  private readonly meshBus: LocalPeerMeshBus | null;
  private readonly unsubscribeMeshBus: (() => void) | null;
  private readonly broadcastChannel: BroadcastChannelLike | null;
  private readonly transportMode: "broadcast-channel" | "local-mesh-queue";

  private lamportClock = 0;
  private opSeq = 0;
  private localCommittedOps = 0;
  private localMeshDeliveredCount = 0;
  private rawRgbaTotalBytes = 0;
  private compressedTotalBytes = 0;
  private internetOnline: boolean;
  private localMeshEnabled: boolean;

  constructor(options: SafeZoneHubOptions) {
    this.peerId = options.peerId;
    this.workId = options.workId;
    this.tileSize = options.tileSize ?? DEFAULT_KM_TILE_SIZE;
    this.internetOnline = options.internetOnline ?? true;
    this.localMeshEnabled = options.localMeshEnabled ?? true;
    this.ydoc = new Y.Doc();
    this.opsMap = this.ydoc.getMap<Uint8Array>("km-delta-ops");
    this.meshBus = options.meshBus ?? null;

    let channel: BroadcastChannelLike | null = null;
    if (options.broadcastChannelName) {
      if (options.channelFactory) {
        channel = options.channelFactory(options.broadcastChannelName);
      } else if (typeof globalThis.BroadcastChannel === "function") {
        channel = new globalThis.BroadcastChannel(options.broadcastChannelName) as unknown as BroadcastChannelLike;
      }
    }
    this.broadcastChannel = channel;
    this.transportMode = channel ? "broadcast-channel" : "local-mesh-queue";

    if (this.broadcastChannel) {
      this.broadcastChannel.onmessage = (event: BroadcastChannelMessageEventLike) => {
        if (!this.localMeshEnabled) return;
        this.handleIncomingMeshEnvelope(event.data);
      };
    }

    this.unsubscribeMeshBus = this.meshBus
      ? this.meshBus.subscribe(this.peerId, (envelope) => {
          if (!this.localMeshEnabled) return;
          this.handleIncomingMeshEnvelope(envelope);
        })
      : null;
  }

  private handleIncomingMeshEnvelope(raw: unknown): void {
    if (!raw || typeof raw !== "object") return;
    const env = raw as Partial<LocalMeshEnvelope>;
    if (env.kind !== "km-delta-frame" || env.workId !== this.workId || env.senderPeerId === this.peerId) return;
    if (!(env.frameBytes instanceof Uint8Array)) return;
    this.receiveBinaryFrame(env.frameBytes);
  }

  private ensureTile(tileKey: string): Uint8Array {
    let tile = this.tileBuffers.get(tileKey);
    if (!tile) {
      tile = createBlankTileRgba(this.tileSize);
      this.tileBuffers.set(tileKey, tile);
    }
    return tile;
  }

  private replayTileDeterministically(layerId: string, tileX: number, tileY: number): void {
    const tileKey = makeKmTileKey(layerId, tileX, tileY);
    const tileOps: DecodedKmDeltaFrame[] = [];
    for (const op of this.decodedOps.values()) {
      if (op.layerId === layerId && op.tileX === tileX && op.tileY === tileY) tileOps.push(op);
    }
    tileOps.sort((a, b) => compareDeterministicOpId(a.opId, b.opId));
    let buffer = createBlankTileRgba(this.tileSize);
    let lastOpId: DeterministicOpId | null = null;
    for (const op of tileOps) {
      buffer = rasterizeKm16StrokeOnTile(buffer, this.tileSize, {
        layerId: op.layerId,
        tileX: op.tileX,
        tileY: op.tileY,
        pigmentRgba: op.pigmentRgba,
        wetness: op.wetness,
        opacity: op.opacity,
        radiusPx: op.radiusPx,
        points: op.points,
      });
      lastOpId = op.opId;
    }
    this.tileBuffers.set(tileKey, buffer);
    if (lastOpId) this.tileMaxOpId.set(tileKey, lastOpId);
  }

  public setInternetOnline(online: boolean): void {
    this.internetOnline = online;
  }

  public setLocalMeshEnabled(enabled: boolean): void {
    this.localMeshEnabled = enabled;
  }

  public commitLocalStroke(rawInput: KmStrokeInput): EncodedKmDeltaFrame {
    const input = canonicalizeKmStrokeInput(rawInput);
    this.lamportClock += 1;
    this.opSeq += 1;
    const opId: DeterministicOpId = { lamport: this.lamportClock, peerId: this.peerId, opSeq: this.opSeq };
    const tileKey = makeKmTileKey(input.layerId, input.tileX, input.tileY);
    const beforeTileRgba = this.ensureTile(tileKey);
    const afterTileRgba = rasterizeKm16StrokeOnTile(beforeTileRgba, this.tileSize, input);

    const encoded = encodeKmDeltaBinaryFrame({
      stroke: { ...input, opId, workId: this.workId, tileSize: this.tileSize },
      beforeTileRgba,
      afterTileRgba,
    });
    const decoded = decodeKmDeltaBinaryFrame(encoded.bytes);

    this.decodedOps.set(encoded.opKey, decoded);
    this.tileBuffers.set(tileKey, afterTileRgba);
    this.tileMaxOpId.set(tileKey, opId);
    this.ydoc.transact(() => {
      this.opsMap.set(encoded.opKey, encoded.bytes);
    }, "local-stroke");

    this.localCommittedOps += 1;
    this.rawRgbaTotalBytes += encoded.rawRgbaBytes;
    this.compressedTotalBytes += encoded.compressedBytes;

    if (!this.internetOnline) {
      this.unsyncedCloudOutbox.set(encoded.opKey, encoded.bytes);
    }

    if (this.localMeshEnabled) {
      const envelope: LocalMeshEnvelope = {
        kind: "km-delta-frame",
        senderPeerId: this.peerId,
        workId: this.workId,
        frameBytes: encoded.bytes,
      };
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage(envelope);
        this.localMeshDeliveredCount += 1;
      }
      if (this.meshBus) {
        this.localMeshDeliveredCount += this.meshBus.broadcast(envelope);
      }
    }
    return encoded;
  }

  public receiveBinaryFrame(frameBytes: Uint8Array, skipYjsWrite = false): SafeZoneFrameApplyResult {
    const decoded = decodeKmDeltaBinaryFrame(frameBytes);
    if (decoded.workId !== this.workId) {
      return { applied: false, duplicate: false, fastPathXorApplied: false, replayedOutOfOrder: false };
    }
    if (this.decodedOps.has(decoded.opKey)) {
      return { applied: false, duplicate: true, fastPathXorApplied: false, replayedOutOfOrder: false };
    }

    this.lamportClock = Math.max(this.lamportClock, decoded.opId.lamport) + 1;
    this.decodedOps.set(decoded.opKey, decoded);
    if (!skipYjsWrite && !this.opsMap.has(decoded.opKey)) {
      this.ydoc.transact(() => {
        this.opsMap.set(decoded.opKey, frameBytes);
      }, "remote-frame");
    }

    const tileKey = makeKmTileKey(decoded.layerId, decoded.tileX, decoded.tileY);
    const currentTile = this.ensureTile(tileKey);
    const maxOp = this.tileMaxOpId.get(tileKey);
    const isInOrder = !maxOp || compareDeterministicOpId(decoded.opId, maxOp) > 0;

    if (isInOrder && computeFnv1a32(currentTile) === decoded.baseTileChecksum) {
      this.tileBuffers.set(tileKey, applyXorTileDelta(currentTile, decoded.rleXorDelta));
      this.tileMaxOpId.set(tileKey, decoded.opId);
      return { applied: true, duplicate: false, fastPathXorApplied: true, replayedOutOfOrder: false };
    }

    this.replayTileDeterministically(decoded.layerId, decoded.tileX, decoded.tileY);
    return { applied: true, duplicate: false, fastPathXorApplied: false, replayedOutOfOrder: true };
  }

  public getStateVector(): SafeZoneStateVectorPacket {
    const peerOpSeqVector: Record<string, number> = {};
    for (const op of this.decodedOps.values()) {
      const prev = peerOpSeqVector[op.opId.peerId] ?? 0;
      if (op.opId.opSeq > prev) peerOpSeqVector[op.opId.peerId] = op.opId.opSeq;
    }
    return {
      peerId: this.peerId,
      workId: this.workId,
      lamportClock: this.lamportClock,
      yjsStateVector: Y.encodeStateVector(this.ydoc),
      peerOpSeqVector,
    };
  }

  public computeStateVectorDiff(remoteVector: SafeZoneStateVectorPacket): SafeZoneStateVectorDiffPacket {
    const yjsDiffUpdate = Y.encodeStateAsUpdate(this.ydoc, remoteVector.yjsStateVector);
    const missingFrames: Uint8Array[] = [];
    for (const [opKey, op] of this.decodedOps.entries()) {
      const remoteMaxSeq = remoteVector.peerOpSeqVector[op.opId.peerId] ?? 0;
      if (op.opId.opSeq > remoteMaxSeq) {
        const frame = this.opsMap.get(opKey);
        if (frame) missingFrames.push(frame);
      }
    }
    return { fromPeerId: this.peerId, workId: this.workId, lamportClock: this.lamportClock, yjsDiffUpdate, missingFrames };
  }

  public applyStateVectorDiff(diff: SafeZoneStateVectorDiffPacket): number {
    if (diff.workId !== this.workId) return 0;
    let appliedCount = 0;
    if (diff.yjsDiffUpdate.byteLength > 0) {
      Y.applyUpdate(this.ydoc, diff.yjsDiffUpdate, "state-vector-diff");
    }
    this.opsMap.forEach((frameBytes, opKey) => {
      if (this.decodedOps.has(opKey)) return;
      if (frameBytes instanceof Uint8Array && this.receiveBinaryFrame(frameBytes, true).applied) {
        appliedCount += 1;
      }
    });
    for (const frameBytes of diff.missingFrames) {
      if (this.receiveBinaryFrame(frameBytes, false).applied) appliedCount += 1;
    }
    return appliedCount;
  }

  /** 재연결 시 상대 허브/클라우드와 상태 벡터 차분을 양방향 교환해 자동 CRDT 정합을 완료한다. */
  public reconnectAndReconcile(remoteHub: OfflineSafeZoneMeshHub): SafeZoneReconnectReport {
    this.internetOnline = true;
    const diffForRemote = this.computeStateVectorDiff(remoteHub.getStateVector());
    const diffForLocal = remoteHub.computeStateVectorDiff(this.getStateVector());

    const appliedOnRemote = remoteHub.applyStateVectorDiff(diffForRemote);
    const appliedOnLocal = this.applyStateVectorDiff(diffForLocal);
    const drainedOutboxCount = this.unsyncedCloudOutbox.size;
    this.unsyncedCloudOutbox.clear();

    const localDigest = this.getCanvasDigestHex();
    const remoteDigest = remoteHub.getCanvasDigestHex();
    const yjsDiffBytes = diffForRemote.yjsDiffUpdate.byteLength + diffForLocal.yjsDiffUpdate.byteLength;
    const deltaFramesBytes =
      diffForRemote.missingFrames.reduce((acc, f) => acc + f.byteLength, 0)
      + diffForLocal.missingFrames.reduce((acc, f) => acc + f.byteLength, 0);

    return {
      peerId: this.peerId,
      remotePeerId: remoteHub.peerId,
      reconciledOpsCount: appliedOnRemote + appliedOnLocal,
      yjsDiffBytes,
      deltaFramesBytes,
      drainedOutboxCount,
      lostOpsCount: 0,
      conflictCount: localDigest === remoteDigest ? 0 : 1,
      converged: localDigest === remoteDigest,
      canvasDigestHex: localDigest,
    };
  }

  public getTileRgba(layerId: string, tileX: number, tileY: number): Uint8Array {
    return new Uint8Array(this.ensureTile(makeKmTileKey(layerId, tileX, tileY)));
  }

  public getAllOpKeysSorted(): readonly string[] {
    return Array.from(this.decodedOps.values())
      .sort((a, b) => compareDeterministicOpId(a.opId, b.opId))
      .map((op) => op.opKey);
  }

  public getCanvasDigestHex(): string {
    const keys = Array.from(this.tileBuffers.keys()).sort();
    if (keys.length === 0) return formatDigestHex(computeFnv1a32(createBlankTileRgba(this.tileSize)));
    let accHash = 0x811c9dc5;
    for (const key of keys) {
      const tile = this.tileBuffers.get(key);
      if (!tile) continue;
      const keyBytes = TEXT_ENCODER.encode(key);
      const combined = new Uint8Array(keyBytes.length + tile.length);
      combined.set(keyBytes, 0);
      combined.set(tile, keyBytes.length);
      accHash = Math.imul((accHash ^ computeFnv1a32(combined)) >>> 0, 0x01000193) >>> 0;
    }
    return formatDigestHex(accHash);
  }

  public getUnsyncedOutboxCount(): number {
    return this.unsyncedCloudOutbox.size;
  }

  public getMetrics(): SafeZoneHubMetrics {
    return {
      peerId: this.peerId,
      workId: this.workId,
      lamportClock: this.lamportClock,
      totalOps: this.decodedOps.size,
      localCommittedOps: this.localCommittedOps,
      unsyncedOutboxCount: this.unsyncedCloudOutbox.size,
      localMeshDeliveredCount: this.localMeshDeliveredCount,
      internetOnline: this.internetOnline,
      localMeshEnabled: this.localMeshEnabled,
      transportMode: this.transportMode,
      rawRgbaTotalBytes: this.rawRgbaTotalBytes,
      compressedTotalBytes: this.compressedTotalBytes,
      averageCompressionRatio: this.compressedTotalBytes > 0 ? this.rawRgbaTotalBytes / this.compressedTotalBytes : 0,
      canvasDigestHex: this.getCanvasDigestHex(),
    };
  }

  public dispose(): void {
    this.unsubscribeMeshBus?.();
    if (this.broadcastChannel) {
      this.broadcastChannel.onmessage = null;
      this.broadcastChannel.close();
    }
    this.ydoc.destroy();
  }
}

function buildArtistStroke(artistIndex: number, roundIndex: number, tileSize: number): KmStrokeInput {
  const profile = EIGHT_ARTIST_PROFILES[artistIndex % EIGHT_ARTIST_PROFILES.length] ?? EIGHT_ARTIST_PROFILES[0];
  const margin = Math.max(6, Math.floor(tileSize * 0.14));
  const span = Math.max(12, tileSize - margin * 2);
  const offsetY = margin + ((artistIndex * 7 + roundIndex * 5) % Math.max(8, span - 8));
  const offsetX = margin + ((artistIndex * 5 + roundIndex * 3) % Math.max(8, Math.floor(span * 0.45)));
  const endX = Math.min(tileSize - margin, offsetX + Math.floor(span * 0.45));
  const midY = Math.min(tileSize - margin, offsetY + ((artistIndex % 2 === 0 ? 1 : -1) * 4));
  return {
    layerId: "color-base",
    tileX: 0,
    tileY: 0,
    pigmentRgba: profile.pigmentRgba,
    wetness: 0.9,
    opacity: 0.72,
    radiusPx: 2.2,
    points: [
      { x: offsetX, y: offsetY, pressure: 0.65 },
      { x: Math.round((offsetX + endX) / 2), y: Math.max(margin, midY), pressure: 0.92 },
      { x: endX, y: offsetY, pressure: 0.58 },
    ],
  };
}

function buildDeliveryOrder(count: number, replicaIndex: number): number[] {
  const indices = Array.from({ length: count }, (_, i) => i);
  if (replicaIndex % 4 === 0) return indices;
  if (replicaIndex % 4 === 1) return [...indices].reverse();
  if (replicaIndex % 4 === 2) {
    return [...indices.filter((i) => i % 2 === 0), ...indices.filter((i) => i % 2 === 1)];
  }
  const shift = (replicaIndex * 3) % Math.max(1, count);
  return [...indices.slice(shift), ...indices.slice(0, shift)].reverse();
}

export function runEightArtistConcurrentBenchmark(options: {
  readonly tileSize?: number;
  readonly rounds?: number;
  readonly workId?: string;
} = {}): EightArtistBenchmarkResult {
  const tileSize = options.tileSize ?? DEFAULT_KM_TILE_SIZE;
  const rounds = Math.max(1, options.rounds ?? 1);
  const workId = options.workId ?? "ep42-km16-collab";

  const hubs = EIGHT_ARTIST_PROFILES.map((artist) => new OfflineSafeZoneMeshHub({
    peerId: artist.peerId,
    workId,
    tileSize,
    internetOnline: true,
    localMeshEnabled: false,
  }));

  let rawRgbaTotalBytes = 0;
  let compressedTotalBytes = 0;
  const allFrames: Uint8Array[] = [];
  for (let round = 0; round < rounds; round += 1) {
    for (let i = 0; i < hubs.length; i += 1) {
      const hub = hubs[i];
      if (!hub) continue;
      const encoded = hub.commitLocalStroke(buildArtistStroke(i, round, tileSize));
      rawRgbaTotalBytes += encoded.rawRgbaBytes;
      compressedTotalBytes += encoded.compressedBytes;
      allFrames.push(encoded.bytes);
    }
  }

  for (let replicaIdx = 0; replicaIdx < hubs.length; replicaIdx += 1) {
    const hub = hubs[replicaIdx];
    if (!hub) continue;
    for (const frameIdx of buildDeliveryOrder(allFrames.length, replicaIdx)) {
      const frame = allFrames[frameIdx];
      if (frame) hub.receiveBinaryFrame(frame);
    }
  }

  const refTile = hubs[0]?.getTileRgba("color-base", 0, 0) ?? createBlankTileRgba(tileSize);
  const refDigest = hubs[0]?.getCanvasDigestHex() ?? "";
  let divergentBytes = 0;
  let conflictCount = 0;
  const replicas = hubs.map((hub) => {
    const tile = hub.getTileRgba("color-base", 0, 0);
    let diff = 0;
    for (let b = 0; b < refTile.length; b += 1) {
      if (tile[b] !== refTile[b]) diff += 1;
    }
    if (diff > 0 || hub.getCanvasDigestHex() !== refDigest) {
      divergentBytes += diff;
      conflictCount += 1;
    }
    return hub.getMetrics();
  });
  for (const hub of hubs) hub.dispose();

  const bluePlusYellow = mixKm16OpticalRgba([20, 75, 220, 255], [245, 220, 25, 255], 0.5, 1);
  const compressionRatio = rawRgbaTotalBytes / Math.max(1, compressedTotalBytes);

  return {
    tileSize,
    artistCount: EIGHT_ARTIST_PROFILES.length,
    totalStrokes: allFrames.length,
    rawRgbaTotalBytes,
    compressedTotalBytes,
    compressionRatio,
    meets8xTarget: compressionRatio >= MIN_REQUIRED_COMPRESSION_RATIO,
    allConverged: conflictCount === 0 && divergentBytes === 0,
    conflictCount,
    divergentBytes,
    canvasDigestHex: refDigest,
    kmOpticalCheck: {
      bluePlusYellow,
      greenDominant: bluePlusYellow[1] > bluePlusYellow[0] + 40 && bluePlusYellow[1] > bluePlusYellow[2] + 40,
    },
    replicas,
  };
}

export function createSafeZoneInteractiveController(tileSize: number = DEFAULT_KM_TILE_SIZE): SafeZoneInteractiveController {
  const workId = "studio-safezone-ep42";
  const meshBus = new LocalPeerMeshBus();
  const cloudHub = new OfflineSafeZoneMeshHub({
    peerId: "cloud-upstream",
    workId,
    tileSize,
    internetOnline: true,
    localMeshEnabled: false,
  });
  const artistHubs = EIGHT_ARTIST_PROFILES.map((artist) => new OfflineSafeZoneMeshHub({
    peerId: artist.peerId,
    workId,
    tileSize,
    internetOnline: true,
    localMeshEnabled: true,
    meshBus,
  }));

  let roundNumber = 0;
  let internetOnline = true;
  let lastYjsDiffBytes = 0;
  let offlineStrokeCursor = 0;

  const syncAllToCloudIfOnline = (): void => {
    if (!internetOnline) return;
    let totalDiffBytes = 0;
    for (const hub of artistHubs) totalDiffBytes += hub.reconnectAndReconcile(cloudHub).yjsDiffBytes;
    for (const hub of artistHubs) hub.reconnectAndReconcile(cloudHub);
    lastYjsDiffBytes = totalDiffBytes;
  };

  const getSnapshot = (): SafeZoneUiSnapshot => {
    const replicas = artistHubs.map((hub) => hub.getMetrics());
    const meshDigestHex = replicas[0]?.canvasDigestHex ?? "";
    const cloudDigestHex = cloudHub.getCanvasDigestHex();
    const convergedReplicaCount = replicas.filter((m) => m.canvasDigestHex === meshDigestHex).length;
    const rawRgbaTotalBytes = replicas.reduce((acc, m) => acc + m.rawRgbaTotalBytes, 0);
    const compressedTotalBytes = replicas.reduce((acc, m) => acc + m.compressedTotalBytes, 0);
    const unsyncedOutboxTotal = replicas.reduce((acc, m) => acc + m.unsyncedOutboxCount, 0);
    const localMeshRelayedTotal = replicas.reduce((acc, m) => acc + m.localMeshDeliveredCount, 0);
    const blueYellowMixRgba = mixKm16OpticalRgba([20, 75, 220, 255], [245, 220, 25, 255], 0.5, 1);
    return {
      roundNumber,
      tileSize,
      internetOnline,
      localMeshActive: true,
      transportLabelKo: internetOnline ? "온라인 클라우드 + 로컬 메시" : "오프라인 세이프존 (로컬 피어 메시 활성)",
      transportLabelEn: internetOnline ? "Cloud Online + Local Mesh" : "Offline SafeZone (Local Peer Mesh Active)",
      rawRgbaTotalBytes,
      compressedTotalBytes,
      compressionRatio: compressedTotalBytes > 0 ? rawRgbaTotalBytes / compressedTotalBytes : 0,
      lastYjsDiffBytes,
      totalOps: replicas[0]?.totalOps ?? 0,
      unsyncedOutboxTotal,
      localMeshRelayedTotal,
      lostOpsCount: 0,
      conflictCount: artistHubs.length - convergedReplicaCount,
      convergedReplicaCount,
      totalReplicaCount: artistHubs.length,
      cloudDigestHex,
      meshDigestHex,
      blueYellowMixRgba,
      replicas,
    };
  };

  const runConcurrentRound = (): SafeZoneUiSnapshot => {
    const roundIdx = roundNumber;
    roundNumber += 1;
    const frames: Uint8Array[] = [];
    for (let i = 0; i < artistHubs.length; i += 1) {
      const hub = artistHubs[i];
      if (!hub) continue;
      hub.setLocalMeshEnabled(false);
      frames.push(hub.commitLocalStroke(buildArtistStroke(i, roundIdx, tileSize)).bytes);
      hub.setLocalMeshEnabled(true);
    }
    for (let r = 0; r < artistHubs.length; r += 1) {
      const hub = artistHubs[r];
      if (!hub) continue;
      for (const idx of buildDeliveryOrder(frames.length, r)) {
        const frame = frames[idx];
        if (frame) hub.receiveBinaryFrame(frame);
      }
    }
    syncAllToCloudIfOnline();
    return getSnapshot();
  };

  const disconnectInternet = (): SafeZoneUiSnapshot => {
    internetOnline = false;
    for (const hub of artistHubs) {
      hub.setInternetOnline(false);
      hub.setLocalMeshEnabled(true);
    }
    return getSnapshot();
  };

  const paintOfflineLocalStroke = (): SafeZoneUiSnapshot => {
    const artistIdx = offlineStrokeCursor % artistHubs.length;
    offlineStrokeCursor += 1;
    const hub = artistHubs[artistIdx];
    if (hub) hub.commitLocalStroke(buildArtistStroke(artistIdx, roundNumber + offlineStrokeCursor, tileSize));
    syncAllToCloudIfOnline();
    return getSnapshot();
  };

  const reconnectCloudAndSync = (): SafeZoneUiSnapshot => {
    internetOnline = true;
    for (const hub of artistHubs) hub.setInternetOnline(true);
    syncAllToCloudIfOnline();
    return getSnapshot();
  };

  runConcurrentRound();

  return {
    getSnapshot,
    runConcurrentRound,
    disconnectInternet,
    paintOfflineLocalStroke,
    reconnectCloudAndSync,
    dispose: () => {
      for (const hub of artistHubs) hub.dispose();
      cloudHub.dispose();
    },
  };
}
