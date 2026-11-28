/**
 * Wave 84 — 비행기 모드·저속망 LTE 멀티-디바이스 무손실 CRDT 타일 동기화 엔진.
 *
 * - 데스크톱(`desktop`)·아이패드 태블릿(`ipad-tablet`)·노트북(`laptop`) 피어의 오프라인 편집 지원
 * - 타일별 Lamport + Vector Clock 인과 버전(`TileCausalMetadata`)과 부모 타일 해시 계보 추적
 * - 서로 다른 타일 병렬 편집 시 변경 델타만 전송해 병합 순서와 무관한 비트 동일 수렴(교환·결합·멱등성)
 * - 동일 타일 동시 편집 시 결정론적 타이브레이커로 승자를 선정하고 패자는 `conflictArchive[]`에 무손실 보존
 * - 활성 뷰포트 우선·중단 이어받기(Resumable Checkpoint) 기반 저속망 적응형 청크 스케줄러
 */

import {
  ContentAddressedTileCanvasStore,
  cloneDeltaBlob,
  constantTimeEqualHex,
  makeTileKey,
  sha256TileHex,
  type CompressedTileDeltaBlob,
  type TileCanvasManifest,
  type TileCanvasStoreOptions,
  type TileCoord,
  type TileIntegrityErrorCode,
  type TileReadResult,
} from "./content-addressed-tile-store";

export type SyncDeviceRole = "desktop" | "ipad-tablet" | "laptop";
export type NetworkProfileId = "airplane-queued" | "subway-lte-1mbps" | "cafe-wifi-20mbps" | "lan-gigabit";
export type VectorClockRelation = "equal" | "after" | "before" | "concurrent";

export interface NetworkProfileSpec {
  readonly id: NetworkProfileId;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly bandwidthBps: number;
  readonly maxChunkBytes: number;
  readonly rttMs: number;
  readonly canTransferNow: boolean;
}

export const NETWORK_PROFILE_SPECS: Readonly<Record<NetworkProfileId, NetworkProfileSpec>> = {
  "airplane-queued": { id: "airplane-queued", labelKo: "비행기 모드 대기", shortLabelKo: "비행기 모드", bandwidthBps: 0, maxChunkBytes: 0, rttMs: 0, canTransferNow: false },
  "subway-lte-1mbps": { id: "subway-lte-1mbps", labelKo: "지하철 저속 LTE (1 Mbps)", shortLabelKo: "지하철 LTE", bandwidthBps: 1_000_000, maxChunkBytes: 32 * 1024, rttMs: 140, canTransferNow: true },
  "cafe-wifi-20mbps": { id: "cafe-wifi-20mbps", labelKo: "카페 Wi-Fi (20 Mbps)", shortLabelKo: "카페 Wi-Fi", bandwidthBps: 20_000_000, maxChunkBytes: 256 * 1024, rttMs: 35, canTransferNow: true },
  "lan-gigabit": { id: "lan-gigabit", labelKo: "스튜디오 유선 LAN (1 Gbps)", shortLabelKo: "유선 LAN", bandwidthBps: 1_000_000_000, maxChunkBytes: 2 * 1024 * 1024, rttMs: 2, canTransferNow: true },
};

export interface TileCausalMetadata {
  readonly tileKey: string;
  readonly coord: TileCoord;
  readonly tileHash: string;
  readonly parentTileHash: string;
  readonly lamportClock: number;
  readonly vectorClock: Readonly<Record<string, number>>;
  readonly authorDeviceId: string;
  readonly authorRole: SyncDeviceRole;
  readonly editedAtIso: string;
}

export interface TileConflictArchiveEntry {
  readonly conflictId: string;
  readonly tileKey: string;
  readonly coord: TileCoord;
  readonly winningTileHash: string;
  readonly winningAuthorDeviceId: string;
  readonly archivedMetadata: TileCausalMetadata;
  readonly recordedAtLamport: number;
}

export interface ViewportBoundsPx { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly activeLayerId?: string; }
export interface TileSyncDeltaItem { readonly transferKey: string; readonly metadata: TileCausalMetadata; readonly deltaBlob: CompressedTileDeltaBlob; readonly wireBytes: number; }
export interface ConflictArchiveSyncItem { readonly entry: TileConflictArchiveEntry; readonly deltaBlob: CompressedTileDeltaBlob; readonly wireBytes: number; }
export interface RejectedCorruptTileRecord { readonly tileKey: string; readonly expectedHash: string; readonly code: TileIntegrityErrorCode; readonly message: string; }
export interface TileEditCommit { readonly metadata: TileCausalMetadata; readonly deltaBlob: CompressedTileDeltaBlob; readonly compressedDeltaBytes: number; readonly merkleRoot: string; }

export interface PeerSyncDigest {
  readonly deviceId: string;
  readonly role: SyncDeviceRole;
  readonly canvasId: string;
  readonly merkleRoot: string;
  readonly lamportClock: number;
  readonly nodeVectorClock: Readonly<Record<string, number>>;
  readonly tileMetadataByKey: Readonly<Record<string, TileCausalMetadata>>;
  readonly conflictIds: readonly string[];
  readonly resolvedConflictIds: readonly string[];
}

export interface TileSyncDeltaPacket {
  readonly senderDeviceId: string;
  readonly senderRole: SyncDeviceRole;
  readonly senderLamportClock: number;
  readonly senderVectorClock: Readonly<Record<string, number>>;
  readonly items: readonly TileSyncDeltaItem[];
  readonly conflictItems: readonly ConflictArchiveSyncItem[];
  readonly resolvedConflictIds: readonly string[];
  readonly totalWireBytes: number;
}

export interface ScheduledSyncChunk {
  readonly chunkIndex: number;
  readonly items: readonly TileSyncDeltaItem[];
  readonly wireBytes: number;
  readonly containsViewportTile: boolean;
  readonly estimatedTransferMs: number;
}

export interface BandwidthConstrainedBatchPlan {
  readonly status: "ready" | "queued-offline" | "empty";
  readonly networkProfile: NetworkProfileId;
  readonly chunks: readonly ScheduledSyncChunk[];
  readonly orderedItems: readonly TileSyncDeltaItem[];
  readonly deferredTileCount: number;
  readonly skippedAckedTileCount: number;
  readonly totalWireBytes: number;
  readonly estimatedTotalTransferMs: number | null;
}

export interface ResumableSyncCheckpoint {
  readonly sessionId: string;
  readonly sourceDeviceId: string;
  readonly targetDeviceId: string;
  readonly ackedTransferKeys: readonly string[];
  readonly ackedTileHashes: readonly string[];
  readonly ackedConflictIds: readonly string[];
  readonly completedChunks: number;
  readonly totalPlannedChunks: number;
  readonly bytesTransferredSoFar: number;
  readonly isComplete: boolean;
}

export interface ApplyDeltaPacketResult {
  readonly ok: boolean;
  readonly acceptedTileCount: number;
  readonly skippedDuplicateCount: number;
  readonly conflictsRecorded: number;
  readonly appliedTransferKeys: readonly string[];
  readonly appliedTileHashes: readonly string[];
  readonly rejectedCorruptTiles: readonly RejectedCorruptTileRecord[];
  readonly resultingMerkleRoot: string;
}

export interface ResumableTransferResult {
  readonly status: "completed" | "partial" | "queued-offline" | "integrity-rejected";
  readonly checkpoint: ResumableSyncCheckpoint;
  readonly chunksDelivered: number;
  readonly transferredTileCount: number;
  readonly duplicateTransferCount: number;
  readonly transferredWireBytes: number;
  readonly conflictsRecorded: number;
  readonly rejectedCorruptTiles: readonly RejectedCorruptTileRecord[];
  readonly targetMerkleRoot: string;
}

export interface BidirectionalSyncResult {
  readonly status: "converged" | "queued-offline" | "partial" | "integrity-rejected";
  readonly outbound: ResumableTransferResult;
  readonly inbound: ResumableTransferResult;
  readonly totalTransferredTiles: number;
  readonly totalWireBytes: number;
  readonly merkleRootsMatch: boolean;
  readonly sharedMerkleRoot: string | null;
}

export interface OfflineSyncNodeOptions extends TileCanvasStoreOptions {
  readonly deviceId: string;
  readonly role: SyncDeviceRole;
  readonly networkProfile?: NetworkProfileId;
  readonly defaultTimestampIso?: string;
}

export interface ResumableSyncOptions {
  readonly networkProfile?: NetworkProfileId;
  readonly activeViewport?: ViewportBoundsPx | null;
  readonly resumeFrom?: ResumableSyncCheckpoint | null;
  readonly maxChunksThisAttempt?: number;
  readonly sessionId?: string;
}

function cloneVectorClock(vc: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  const keys = Object.keys(vc).sort();
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i] ?? "";
    const v = vc[k] ?? 0;
    if (v > 0) out[k] = v;
  }
  return out;
}

export function mergeVectorClocks(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  const merged: Record<string, number> = {};
  const sorted = Array.from(new Set<string>([...Object.keys(a), ...Object.keys(b)])).sort();
  for (let i = 0; i < sorted.length; i += 1) {
    const k = sorted[i] ?? "";
    const v = Math.max(a[k] ?? 0, b[k] ?? 0);
    if (v > 0) merged[k] = v;
  }
  return merged;
}

export function compareVectorClocks(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): VectorClockRelation {
  let aGreater = false;
  let bGreater = false;
  new Set<string>([...Object.keys(a), ...Object.keys(b)]).forEach((k) => {
    const va = a[k] ?? 0;
    const vb = b[k] ?? 0;
    if (va > vb) aGreater = true;
    if (vb > va) bGreater = true;
  });
  if (!aGreater && !bGreater) return "equal";
  if (aGreater && !bGreater) return "after";
  return !aGreater && bGreater ? "before" : "concurrent";
}

function cmpCodeUnit(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

/** 동시 편집 충돌 시 결정론적 전순서 타이브레이커(`lamportClock` -> `authorDeviceId` -> `tileHash`). */
export function compareTileCausalPriority(a: TileCausalMetadata, b: TileCausalMetadata): number {
  if (a.lamportClock !== b.lamportClock) return a.lamportClock - b.lamportClock;
  const devCmp = cmpCodeUnit(a.authorDeviceId, b.authorDeviceId);
  return devCmp !== 0 ? devCmp : cmpCodeUnit(a.tileHash, b.tileHash);
}

export function makeTileTransferKey(tileKey: string, tileHash: string): string {
  return `${tileKey}@${tileHash}`;
}

export function makeConflictArchiveId(meta: TileCausalMetadata): string {
  return `cf-${sha256TileHex(`wave84:conflict:${meta.tileKey}|${meta.tileHash}|${meta.authorDeviceId}|${meta.lamportClock}`).slice(0, 16)}`;
}

function scoreTileViewport(coord: TileCoord, tileSize: number, vp: ViewportBoundsPx): { readonly intersects: boolean; readonly distSq: number } {
  const left = coord.tileX * tileSize;
  const top = coord.tileY * tileSize;
  const intersects = left < vp.x + vp.width && left + tileSize > vp.x && top < vp.y + vp.height && top + tileSize > vp.y;
  const dx = left + tileSize * 0.5 - (vp.x + vp.width * 0.5);
  const dy = top + tileSize * 0.5 - (vp.y + vp.height * 0.5);
  return { intersects, distSq: dx * dx + dy * dy };
}

/** 저속망·비행기 모드 제약 하에서 활성 뷰포트 타일을 최우선 배치하고 ACK 타일은 건너뛰는 청크 스케줄러. */
export function planBandwidthConstrainedSyncBatch(params: {
  readonly pendingDeltas: readonly TileSyncDeltaItem[];
  readonly networkProfile: NetworkProfileId;
  readonly tileSize: number;
  readonly activeViewport?: ViewportBoundsPx | null;
  readonly ackedTransferKeys?: ReadonlySet<string>;
  readonly ackedTileHashes?: ReadonlySet<string>;
}): BandwidthConstrainedBatchPlan {
  const spec = NETWORK_PROFILE_SPECS[params.networkProfile];
  const ackedKeys = params.ackedTransferKeys ?? new Set<string>();
  const ackedHashes = params.ackedTileHashes ?? new Set<string>();
  const remaining: TileSyncDeltaItem[] = [];
  let skippedAckedTileCount = 0;

  for (let i = 0; i < params.pendingDeltas.length; i += 1) {
    const item = params.pendingDeltas[i];
    if (!item) continue;
    if (ackedKeys.has(item.transferKey) || ackedHashes.has(item.metadata.tileHash)) skippedAckedTileCount += 1;
    else remaining.push(item);
  }
  if (remaining.length === 0) {
    return { status: "empty", networkProfile: params.networkProfile, chunks: [], orderedItems: [], deferredTileCount: 0, skippedAckedTileCount, totalWireBytes: 0, estimatedTotalTransferMs: 0 };
  }

  const vp = params.activeViewport ?? null;
  const scored = remaining.map((item) => {
    if (vp === null) return { item, tier: 2, distSq: 0, inViewport: false };
    const { intersects, distSq } = scoreTileViewport(item.metadata.coord, params.tileSize, vp);
    const activeLayer = vp.activeLayerId === undefined || item.metadata.coord.layerId === vp.activeLayerId;
    return { item, tier: intersects ? (activeLayer ? 0 : 1) : 2, distSq, inViewport: intersects };
  });
  scored.sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : a.distSq !== b.distSq ? a.distSq - b.distSq : cmpCodeUnit(a.item.metadata.tileKey, b.item.metadata.tileKey)));

  const orderedItems = scored.map((entry) => entry.item);
  const totalWireBytes = orderedItems.reduce((sum, it) => sum + it.wireBytes, 0);
  if (!spec.canTransferNow) {
    return { status: "queued-offline", networkProfile: params.networkProfile, chunks: [], orderedItems, deferredTileCount: orderedItems.length, skippedAckedTileCount, totalWireBytes, estimatedTotalTransferMs: null };
  }

  const chunks: ScheduledSyncChunk[] = [];
  let curItems: TileSyncDeltaItem[] = [];
  let curBytes = 0;
  let curHasVp = false;
  let totalEstMs = 0;
  const flush = (): void => {
    if (curItems.length === 0) return;
    const estMs = Math.round(((spec.bandwidthBps > 0 ? ((curBytes * 8) / spec.bandwidthBps) * 1000 : 0) + spec.rttMs) * 100) / 100;
    totalEstMs += estMs;
    chunks.push({ chunkIndex: chunks.length, items: curItems, wireBytes: curBytes, containsViewportTile: curHasVp, estimatedTransferMs: estMs });
    curItems = []; curBytes = 0; curHasVp = false;
  };

  for (let i = 0; i < scored.length; i += 1) {
    const entry = scored[i];
    if (!entry) continue;
    if (curItems.length > 0 && curBytes + entry.item.wireBytes > spec.maxChunkBytes) flush();
    curItems.push(entry.item);
    curBytes += entry.item.wireBytes;
    if (entry.inViewport) curHasVp = true;
    if (curBytes >= spec.maxChunkBytes) flush();
  }
  flush();

  return {
    status: "ready", networkProfile: params.networkProfile, chunks, orderedItems,
    deferredTileCount: 0, skippedAckedTileCount, totalWireBytes, estimatedTotalTransferMs: Math.round(totalEstMs * 100) / 100,
  };
}

/** 오프라인·저속망 멀티-디바이스 CRDT 타일 동기화 노드. */
export class OfflineMultiDeviceTileSyncNode {
  public readonly deviceId: string;
  public readonly role: SyncDeviceRole;
  public readonly store: ContentAddressedTileCanvasStore;

  private networkProfile: NetworkProfileId;
  private lamportClock = 0;
  private nodeVectorClock: Record<string, number> = {};
  private readonly tileMetadata = new Map<string, TileCausalMetadata>();
  private readonly conflictArchive = new Map<string, TileConflictArchiveEntry>();
  private readonly resolvedConflictIds = new Set<string>();
  private readonly defaultTimestampIso: string;

  public constructor(options: OfflineSyncNodeOptions) {
    this.deviceId = options.deviceId;
    this.role = options.role;
    this.store = new ContentAddressedTileCanvasStore(options);
    this.networkProfile = options.networkProfile ?? "cafe-wifi-20mbps";
    this.defaultTimestampIso = options.defaultTimestampIso ?? "2026-11-28T00:00:00.000Z";
  }

  public getNetworkProfile(): NetworkProfileId { return this.networkProfile; }
  public setNetworkProfile(profile: NetworkProfileId): void { this.networkProfile = profile; }
  public getLamportClock(): number { return this.lamportClock; }
  public getNodeVectorClock(): Readonly<Record<string, number>> { return cloneVectorClock(this.nodeVectorClock); }
  public getManifest(): TileCanvasManifest { return this.store.getManifest(); }
  public getTileMetadata(coord: TileCoord): TileCausalMetadata | null { return this.tileMetadata.get(makeTileKey(coord.layerId, coord.tileX, coord.tileY)) ?? null; }

  public listTileMetadata(): readonly TileCausalMetadata[] {
    return Array.from(this.tileMetadata.keys()).sort().map((k) => this.tileMetadata.get(k)).filter((m): m is TileCausalMetadata => m !== undefined);
  }

  public getConflictArchive(): readonly TileConflictArchiveEntry[] {
    return Array.from(this.conflictArchive.keys()).sort().map((id) => this.conflictArchive.get(id)).filter((e): e is TileConflictArchiveEntry => e !== undefined);
  }

  /** 충돌 보관함에 보존된 패자 타일의 원본 픽셀을 SHA-256 검증 후 복원한다. */
  public readConflictTilePixels(conflictId: string): TileReadResult {
    const entry = this.conflictArchive.get(conflictId);
    if (!entry) return { ok: false, code: "BLOB_MISSING", message: `충돌 보관 ID(${conflictId})가 없습니다.` };
    return this.store.readBlobByHashVerified(entry.archivedMetadata.tileHash);
  }

  /** 로컬 타일을 편집하고 Lamport·Vector Clock 및 부모 타일 해시 계보를 갱신한다. */
  public editTile(coord: TileCoord, rgbaPixels: Uint8Array, editedAtIso?: string): TileEditCommit {
    const r = this.store.putTilePixels(coord, rgbaPixels);
    const metadata = this.commitCausalTileVersion(r.tileKey, r.coord, r.nextHash, r.previousHash, editedAtIso);
    return { metadata, deltaBlob: r.deltaBlob, compressedDeltaBytes: r.compressedDeltaBytes, merkleRoot: this.store.getManifest().merkleRoot };
  }

  /** 브러시 획을 교차 타일에만 반영하고 변경된 타일마다 인과 메타데이터를 기록한다. */
  public paintBrushStroke(params: {
    readonly layerId: string; readonly x0: number; readonly y0: number;
    readonly x1: number; readonly y1: number; readonly radiusPx: number;
    readonly rgba: readonly [number, number, number, number]; readonly editedAtIso?: string;
  }): readonly TileEditCommit[] {
    const strokeRes = this.store.applyBrushStrokeToLayer(params);
    const commits: TileEditCommit[] = [];
    for (let i = 0; i < strokeRes.touchedTiles.length; i += 1) {
      const r = strokeRes.touchedTiles[i];
      if (!r || !r.changed) continue;
      const metadata = this.commitCausalTileVersion(r.tileKey, r.coord, r.nextHash, r.previousHash, params.editedAtIso);
      commits.push({ metadata, deltaBlob: r.deltaBlob, compressedDeltaBytes: r.compressedDeltaBytes, merkleRoot: strokeRes.merkleRoot });
    }
    return commits;
  }

  /** 보관된 충돌 타일을 작가 선택(`keep-winner` 또는 `restore-archived`)으로 해결한다. */
  public resolveConflict(conflictId: string, resolution: "keep-winner" | "restore-archived", resolvedAtIso?: string): boolean {
    const entry = this.conflictArchive.get(conflictId);
    if (!entry) return false;
    if (resolution === "restore-archived") {
      const pixelsRes = this.store.readBlobByHashVerified(entry.archivedMetadata.tileHash);
      if (!pixelsRes.ok) return false;
      this.editTile(entry.coord, pixelsRes.pixels, resolvedAtIso);
    } else {
      this.lamportClock += 1;
      this.nodeVectorClock[this.deviceId] = (this.nodeVectorClock[this.deviceId] ?? 0) + 1;
    }
    this.conflictArchive.delete(conflictId);
    this.resolvedConflictIds.add(conflictId);
    return true;
  }

  /** 경량 동기화 핸드셰이크용 피어 다이제스트를 생성한다. */
  public exportSyncDigest(): PeerSyncDigest {
    const manifest = this.store.getManifest();
    const tileMetadataByKey: Record<string, TileCausalMetadata> = {};
    Array.from(this.tileMetadata.keys()).sort().forEach((k) => {
      const meta = this.tileMetadata.get(k);
      if (meta) tileMetadataByKey[k] = meta;
    });
    return {
      deviceId: this.deviceId, role: this.role, canvasId: manifest.canvasId, merkleRoot: manifest.merkleRoot,
      lamportClock: this.lamportClock, nodeVectorClock: cloneVectorClock(this.nodeVectorClock),
      tileMetadataByKey, conflictIds: Array.from(this.conflictArchive.keys()).sort(),
      resolvedConflictIds: Array.from(this.resolvedConflictIds).sort(),
    };
  }

  /** 원격 피어 다이제스트와 비교해 변경·동시편집 타일 델타 패킷만 추출한다. */
  public buildDeltaPacketForPeer(
    remoteDigest: PeerSyncDigest,
    options?: { readonly ackedTransferKeys?: ReadonlySet<string>; readonly ackedConflictIds?: ReadonlySet<string> },
  ): TileSyncDeltaPacket {
    const ackedKeys = options?.ackedTransferKeys ?? new Set<string>();
    const ackedConflicts = options?.ackedConflictIds ?? new Set<string>();
    const remoteConflicts = new Set<string>(remoteDigest.conflictIds);
    const remoteResolved = new Set<string>(remoteDigest.resolvedConflictIds);
    const items: TileSyncDeltaItem[] = [];

    const sortedKeys = Array.from(this.tileMetadata.keys()).sort();
    for (let i = 0; i < sortedKeys.length; i += 1) {
      const tileKey = sortedKeys[i] ?? "";
      const localMeta = this.tileMetadata.get(tileKey);
      if (!localMeta) continue;
      const remoteMeta = remoteDigest.tileMetadataByKey[tileKey] ?? null;
      if (remoteMeta !== null) {
        const rel = compareVectorClocks(localMeta.vectorClock, remoteMeta.vectorClock);
        if (rel === "before" || (rel === "equal" && constantTimeEqualHex(localMeta.tileHash, remoteMeta.tileHash))) continue;
      }
      const transferKey = makeTileTransferKey(tileKey, localMeta.tileHash);
      if (ackedKeys.has(transferKey)) continue;

      const baseHash = remoteMeta !== null && this.store.hasBlob(remoteMeta.tileHash)
        ? remoteMeta.tileHash
        : !constantTimeEqualHex(localMeta.parentTileHash, this.store.blankTileHash) &&
            remoteMeta !== null && constantTimeEqualHex(remoteMeta.tileHash, localMeta.parentTileHash)
          ? localMeta.parentTileHash
          : null;
      const deltaBlob = this.store.createWireDeltaBlob(localMeta.tileHash, baseHash);
      if (deltaBlob) items.push({ transferKey, metadata: localMeta, deltaBlob, wireBytes: deltaBlob.compressedBytes.byteLength });
    }

    const conflictItems: ConflictArchiveSyncItem[] = [];
    Array.from(this.conflictArchive.keys()).sort().forEach((cid) => {
      if (remoteConflicts.has(cid) || remoteResolved.has(cid) || ackedConflicts.has(cid)) return;
      const entry = this.conflictArchive.get(cid);
      if (!entry) return;
      const blob = this.store.createWireDeltaBlob(entry.archivedMetadata.tileHash, null);
      if (blob) conflictItems.push({ entry, deltaBlob: blob, wireBytes: blob.compressedBytes.byteLength });
    });

    const totalWireBytes = items.reduce((s, it) => s + it.wireBytes, 0) + conflictItems.reduce((s, ci) => s + ci.wireBytes, 0);
    return {
      senderDeviceId: this.deviceId, senderRole: this.role, senderLamportClock: this.lamportClock,
      senderVectorClock: cloneVectorClock(this.nodeVectorClock), items, conflictItems,
      resolvedConflictIds: Array.from(this.resolvedConflictIds).sort(), totalWireBytes,
    };
  }

  /** 원격 델타 패킷을 SHA-256 검증 후 CRDT 규칙으로 병합한다. 손상 블롭은 fail-closed 차단한다. */
  public applyDeltaPacket(packet: TileSyncDeltaPacket): ApplyDeltaPacketResult {
    const rejected: RejectedCorruptTileRecord[] = [];
    for (let i = 0; i < packet.items.length; i += 1) {
      const item = packet.items[i];
      if (!item) continue;
      if (!constantTimeEqualHex(item.deltaBlob.targetTileHash, item.metadata.tileHash)) {
        rejected.push({ tileKey: item.metadata.tileKey, expectedHash: item.metadata.tileHash, code: "TARGET_HASH_MISMATCH", message: "메타데이터 해시와 델타 대상 해시가 다릅니다." });
        continue;
      }
      const imp = this.store.importVerifiedDeltaBlob(item.deltaBlob);
      if (!imp.ok) rejected.push({ tileKey: item.metadata.tileKey, expectedHash: item.metadata.tileHash, code: imp.code, message: imp.message });
    }
    for (let i = 0; i < packet.conflictItems.length; i += 1) {
      const ci = packet.conflictItems[i];
      if (!ci) continue;
      const imp = this.store.importVerifiedDeltaBlob(ci.deltaBlob);
      if (!imp.ok) rejected.push({ tileKey: ci.entry.tileKey, expectedHash: ci.entry.archivedMetadata.tileHash, code: imp.code, message: imp.message });
    }
    if (rejected.length > 0) {
      return { ok: false, acceptedTileCount: 0, skippedDuplicateCount: 0, conflictsRecorded: 0, appliedTransferKeys: [], appliedTileHashes: [], rejectedCorruptTiles: rejected, resultingMerkleRoot: this.store.getManifest().merkleRoot };
    }

    let acceptedTileCount = 0; let skippedDuplicateCount = 0; let conflictsRecorded = 0;
    const appliedTransferKeys: string[] = [];
    const appliedTileHashes: string[] = [];

    packet.resolvedConflictIds.forEach((rid) => {
      if (rid.length > 0) { this.resolvedConflictIds.add(rid); this.conflictArchive.delete(rid); }
    });

    for (let i = 0; i < packet.items.length; i += 1) {
      const item = packet.items[i];
      if (!item) continue;
      const inc = item.metadata;
      const cur = this.tileMetadata.get(inc.tileKey) ?? null;
      appliedTransferKeys.push(item.transferKey);
      appliedTileHashes.push(inc.tileHash);

      if (cur === null) {
        this.store.bindTileToHash(inc.coord, inc.tileHash);
        this.tileMetadata.set(inc.tileKey, inc);
        acceptedTileCount += 1;
        continue;
      }
      const rel = compareVectorClocks(inc.vectorClock, cur.vectorClock);
      if (rel === "before" || (rel === "equal" && constantTimeEqualHex(inc.tileHash, cur.tileHash))) {
        skippedDuplicateCount += 1; continue;
      }
      if (rel === "after") {
        this.store.bindTileToHash(inc.coord, inc.tileHash);
        this.tileMetadata.set(inc.tileKey, inc);
        this.refreshConflictArchiveWinner(inc.tileKey, inc);
        acceptedTileCount += 1;
        continue;
      }
      const cmp = compareTileCausalPriority(inc, cur);
      if (cmp === 0) skippedDuplicateCount += 1;
      else if (cmp > 0) {
        if (this.recordConflictArchive(cur, inc)) conflictsRecorded += 1;
        this.store.bindTileToHash(inc.coord, inc.tileHash);
        this.tileMetadata.set(inc.tileKey, inc);
        this.refreshConflictArchiveWinner(inc.tileKey, inc);
        acceptedTileCount += 1;
      } else if (this.recordConflictArchive(inc, cur)) {
        conflictsRecorded += 1;
      }
    }

    for (let i = 0; i < packet.conflictItems.length; i += 1) {
      const entry = packet.conflictItems[i]?.entry;
      if (!entry || this.resolvedConflictIds.has(entry.conflictId) || this.conflictArchive.has(entry.conflictId)) continue;
      const win = this.tileMetadata.get(entry.tileKey) ?? null;
      if (win && constantTimeEqualHex(win.tileHash, entry.archivedMetadata.tileHash) && win.authorDeviceId === entry.archivedMetadata.authorDeviceId && win.lamportClock === entry.archivedMetadata.lamportClock) continue;
      this.conflictArchive.set(entry.conflictId, {
        ...entry,
        winningTileHash: win ? win.tileHash : entry.winningTileHash,
        winningAuthorDeviceId: win ? win.authorDeviceId : entry.winningAuthorDeviceId,
      });
      conflictsRecorded += 1;
    }

    this.lamportClock = Math.max(this.lamportClock, packet.senderLamportClock);
    this.nodeVectorClock = cloneVectorClock(mergeVectorClocks(this.nodeVectorClock, packet.senderVectorClock));
    return {
      ok: true, acceptedTileCount, skippedDuplicateCount, conflictsRecorded,
      appliedTransferKeys, appliedTileHashes, rejectedCorruptTiles: [],
      resultingMerkleRoot: this.store.getManifest().merkleRoot,
    };
  }

  /** 단방향 체크포인트 기반 이어받기(Resumable) 저속망 청크 전송을 수행한다. */
  public syncDeltaToPeerResumable(targetPeer: OfflineMultiDeviceTileSyncNode, options: ResumableSyncOptions = {}): ResumableTransferResult {
    const profile = options.networkProfile ?? this.networkProfile;
    const prev = options.resumeFrom ?? null;
    const sessionId = prev?.sessionId ?? options.sessionId ?? `${this.deviceId}->${targetPeer.deviceId}`;
    const ackedKeys = new Set<string>(prev?.ackedTransferKeys ?? []);
    const ackedHashes = new Set<string>(prev?.ackedTileHashes ?? []);
    const ackedCids = new Set<string>(prev?.ackedConflictIds ?? []);

    const makeCp = (doneChunks: number, plannedChunks: number, bytes: number, isComplete: boolean): ResumableSyncCheckpoint => ({
      sessionId, sourceDeviceId: this.deviceId, targetDeviceId: targetPeer.deviceId,
      ackedTransferKeys: Array.from(ackedKeys).sort(), ackedTileHashes: Array.from(ackedHashes).sort(),
      ackedConflictIds: Array.from(ackedCids).sort(), completedChunks: doneChunks,
      totalPlannedChunks: plannedChunks, bytesTransferredSoFar: bytes, isComplete,
    });

    const fullPacket = this.buildDeltaPacketForPeer(targetPeer.exportSyncDigest(), { ackedTransferKeys: ackedKeys, ackedConflictIds: ackedCids });
    const plan = planBandwidthConstrainedSyncBatch({
      pendingDeltas: fullPacket.items, networkProfile: profile, tileSize: this.store.tileSize,
      activeViewport: options.activeViewport ?? null, ackedTransferKeys: ackedKeys,
    });

    if (plan.status === "queued-offline" || !NETWORK_PROFILE_SPECS[profile].canTransferNow || !NETWORK_PROFILE_SPECS[targetPeer.getNetworkProfile()].canTransferNow) {
      return {
        status: "queued-offline",
        checkpoint: makeCp(prev?.completedChunks ?? 0, prev?.totalPlannedChunks ?? plan.chunks.length, prev?.bytesTransferredSoFar ?? 0, false),
        chunksDelivered: 0, transferredTileCount: 0, duplicateTransferCount: 0, transferredWireBytes: 0,
        conflictsRecorded: 0, rejectedCorruptTiles: [], targetMerkleRoot: targetPeer.getManifest().merkleRoot,
      };
    }

    const totalRem = plan.chunks.length;
    const maxChunks = options.maxChunksThisAttempt !== undefined ? Math.max(0, Math.min(options.maxChunksThisAttempt, totalRem)) : totalRem;
    let chunksDelivered = 0; let transferredTileCount = 0; let duplicateTransferCount = 0;
    let transferredWireBytes = 0; let conflictsRecorded = 0;

    for (let i = 0; i < maxChunks; i += 1) {
      const chunk = plan.chunks[i];
      if (!chunk) continue;
      chunk.items.forEach((it) => { if (ackedKeys.has(it.transferKey)) duplicateTransferCount += 1; });
      const isFinal = i === totalRem - 1;
      const conflictBytes = isFinal ? fullPacket.conflictItems.reduce((s, ci) => s + ci.wireBytes, 0) : 0;
      const res = targetPeer.applyDeltaPacket({
        senderDeviceId: this.deviceId, senderRole: this.role, senderLamportClock: this.lamportClock,
        senderVectorClock: cloneVectorClock(this.nodeVectorClock), items: chunk.items,
        conflictItems: isFinal ? fullPacket.conflictItems : [],
        resolvedConflictIds: isFinal ? fullPacket.resolvedConflictIds : [],
        totalWireBytes: chunk.wireBytes + conflictBytes,
      });
      if (!res.ok) {
        return {
          status: "integrity-rejected",
          checkpoint: makeCp((prev?.completedChunks ?? 0) + chunksDelivered, (prev?.completedChunks ?? 0) + totalRem, (prev?.bytesTransferredSoFar ?? 0) + transferredWireBytes, false),
          chunksDelivered, transferredTileCount, duplicateTransferCount, transferredWireBytes,
          conflictsRecorded, rejectedCorruptTiles: res.rejectedCorruptTiles, targetMerkleRoot: res.resultingMerkleRoot,
        };
      }
      chunksDelivered += 1;
      transferredTileCount += chunk.items.length;
      transferredWireBytes += chunk.wireBytes + conflictBytes;
      conflictsRecorded += res.conflictsRecorded;
      res.appliedTransferKeys.forEach((k) => ackedKeys.add(k));
      res.appliedTileHashes.forEach((h) => ackedHashes.add(h));
      if (isFinal) fullPacket.conflictItems.forEach((ci) => ackedCids.add(ci.entry.conflictId));
    }

    if (totalRem === 0 && (fullPacket.conflictItems.length > 0 || fullPacket.resolvedConflictIds.length > 0)) {
      const metaRes = targetPeer.applyDeltaPacket(fullPacket);
      if (!metaRes.ok) {
        return {
          status: "integrity-rejected",
          checkpoint: makeCp(prev?.completedChunks ?? 0, prev?.totalPlannedChunks ?? 0, prev?.bytesTransferredSoFar ?? 0, false),
          chunksDelivered: 0, transferredTileCount: 0, duplicateTransferCount: 0, transferredWireBytes: 0,
          conflictsRecorded: 0, rejectedCorruptTiles: metaRes.rejectedCorruptTiles, targetMerkleRoot: metaRes.resultingMerkleRoot,
        };
      }
      transferredWireBytes += fullPacket.totalWireBytes;
      conflictsRecorded += metaRes.conflictsRecorded;
      fullPacket.conflictItems.forEach((ci) => ackedCids.add(ci.entry.conflictId));
    }

    const done = maxChunks >= totalRem;
    return {
      status: done ? "completed" : "partial",
      checkpoint: makeCp((prev?.completedChunks ?? 0) + chunksDelivered, (prev?.completedChunks ?? 0) + totalRem, (prev?.bytesTransferredSoFar ?? 0) + transferredWireBytes, done),
      chunksDelivered, transferredTileCount, duplicateTransferCount, transferredWireBytes,
      conflictsRecorded, rejectedCorruptTiles: [], targetMerkleRoot: targetPeer.getManifest().merkleRoot,
    };
  }

  /** 두 피어 간 양방향 델타 동기화를 실행해 동일 머클 루트로 수렴시킨다. */
  public syncDeltaWithPeer(peer: OfflineMultiDeviceTileSyncNode, options: Omit<ResumableSyncOptions, "resumeFrom"> = {}): BidirectionalSyncResult {
    const outbound = this.syncDeltaToPeerResumable(peer, options);
    const inbound = peer.syncDeltaToPeerResumable(this, options);
    const localRoot = this.getManifest().merkleRoot;
    const merkleRootsMatch = constantTimeEqualHex(localRoot, peer.getManifest().merkleRoot);
    let status: BidirectionalSyncResult["status"] = "converged";
    if (outbound.status === "integrity-rejected" || inbound.status === "integrity-rejected") status = "integrity-rejected";
    else if (outbound.status === "queued-offline" || inbound.status === "queued-offline") status = "queued-offline";
    else if (outbound.status === "partial" || inbound.status === "partial" || !merkleRootsMatch) status = "partial";

    return {
      status, outbound, inbound,
      totalTransferredTiles: outbound.transferredTileCount + inbound.transferredTileCount,
      totalWireBytes: outbound.transferredWireBytes + inbound.transferredWireBytes,
      merkleRootsMatch, sharedMerkleRoot: merkleRootsMatch ? localRoot : null,
    };
  }

  private commitCausalTileVersion(tileKey: string, coord: TileCoord, tileHash: string, parentTileHash: string, editedAtIso?: string): TileCausalMetadata {
    this.lamportClock += 1;
    this.nodeVectorClock[this.deviceId] = (this.nodeVectorClock[this.deviceId] ?? 0) + 1;
    const metadata: TileCausalMetadata = {
      tileKey, coord, tileHash, parentTileHash, lamportClock: this.lamportClock,
      vectorClock: cloneVectorClock(this.nodeVectorClock), authorDeviceId: this.deviceId,
      authorRole: this.role, editedAtIso: editedAtIso ?? this.defaultTimestampIso,
    };
    this.tileMetadata.set(tileKey, metadata);
    return metadata;
  }

  private refreshConflictArchiveWinner(tileKey: string, winner: TileCausalMetadata): void {
    this.conflictArchive.forEach((entry, cid) => {
      if (entry.tileKey === tileKey) {
        this.conflictArchive.set(cid, { ...entry, winningTileHash: winner.tileHash, winningAuthorDeviceId: winner.authorDeviceId });
      }
    });
  }

  private recordConflictArchive(loser: TileCausalMetadata, winner: TileCausalMetadata): boolean {
    const conflictId = makeConflictArchiveId(loser);
    if (this.resolvedConflictIds.has(conflictId) || this.conflictArchive.has(conflictId)) return false;
    this.conflictArchive.set(conflictId, {
      conflictId, tileKey: loser.tileKey, coord: loser.coord,
      winningTileHash: winner.tileHash, winningAuthorDeviceId: winner.authorDeviceId,
      archivedMetadata: loser, recordedAtLamport: Math.max(winner.lamportClock, loser.lamportClock),
    });
    return true;
  }
}

export { cloneDeltaBlob };
