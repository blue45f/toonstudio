/**
 * P2P 분산 그리드 타일 렌더 코디네이터 · 무서버 오프라인 오디오-비주얼 협업 동기화 ·
 * 스트림 기반 실시간 에셋 의존성 DAG 및 머클 자가치유 파이프라인.
 *
 * - `P2pGridRenderCoordinator`: LAN/WebRTC 피어 노드에 프레임·GI·필터 타일을 성능 가중치
 *   기반으로 분할하고, 유휴 피어의 꼬리 작업 훔치기(work-stealing), 워커 타임아웃 재할당,
 *   64비트 FNV-1a 타일 검증(손상 결과 자동 거부·격리), 무서버 AV 협업 패킷 동기화를 수행한다.
 * - `RealTimeAssetStreamPipeline`: `material -> prop3d -> cut -> episode` 반응형 DAG에
 *   버전 핀(floating/locked)과 증분 핫스왑 델타 이벤트를 결합하고, 로컬 캐시 손상 시
 *   64비트 FNV-1a + 머클 증명 검증을 거쳐 피어 복제본에서 자가치유한다.
 */

export const EMPTY_MERKLE_ROOT_HEX = "0000000000000000";
export const AV_COLLAB_PACKET_MAGIC = "TSAV";
export const AV_COLLAB_PACKET_VERSION = 1;
export const DEFAULT_TILE_TIMEOUT_MS = 4000;
export const DEFAULT_MAX_TILE_RETRIES = 3;
export const DEFAULT_QUARANTINE_REJECTION_LIMIT = 2;

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

/** 표준 64비트 FNV-1a 해시(16자리 소문자 hex). 16비트 림 연산으로 ES2017 호환성과 무할당을 보장한다. */
export function fnv1a64Hex(bytes: Uint8Array): string {
  let h0 = 0x2325, h1 = 0x8422, h2 = 0x9ce4, h3 = 0xcbf2;
  for (let i = 0; i < bytes.length; i += 1) {
    h0 ^= bytes[i];
    const p0 = h0 * 0x1b3;
    const p1 = h1 * 0x1b3 + (p0 >>> 16);
    const p2 = h2 * 0x1b3 + ((h0 & 0xff) << 8) + (p1 >>> 16);
    const p3 = h3 * 0x1b3 + (h0 >>> 8) + ((h1 & 0xff) << 8) + (p2 >>> 16);
    h0 = p0 & 0xffff; h1 = p1 & 0xffff; h2 = p2 & 0xffff; h3 = p3 & 0xffff;
  }
  return h3.toString(16).padStart(4, "0") + h2.toString(16).padStart(4, "0") +
    h1.toString(16).padStart(4, "0") + h0.toString(16).padStart(4, "0");
}

export function fnv1a64StringHex(input: string): string { return fnv1a64Hex(TEXT_ENCODER.encode(input)); }

/** 도메인 분리 헤더와 RGBA 픽셀 버퍼를 결합한 타일 전용 64비트 FNV-1a 체크섬을 계산한다. */
export function computeTileChecksum64(
  tileId: string, width: number, height: number, pixels: Uint8Array, renderPass: GridRenderPassKind,
): string {
  const header = TEXT_ENCODER.encode(`tile:${tileId}:${renderPass}:${width}x${height}:`);
  const combined = new Uint8Array(header.byteLength + pixels.byteLength);
  combined.set(header, 0);
  combined.set(pixels, header.byteLength);
  return fnv1a64Hex(combined);
}

/* -------------------------------------------------------------------------- */
/* 1. Merkle Integrity Tree & Proof Helpers                                   */
/* -------------------------------------------------------------------------- */

export interface MerkleProofStep { readonly siblingHash: string; readonly position: "left" | "right"; }

const hashMerkleLeaf = (leafHash: string): string => fnv1a64StringHex(`merkle:leaf:${leafHash}`);
const hashMerklePair = (left: string, right: string): string => fnv1a64StringHex(`merkle:node:${left}:${right}`);

function stepMerkleLevel(level: readonly string[]): string[] {
  const next: string[] = [];
  for (let i = 0; i < level.length; i += 2) {
    next.push(hashMerklePair(level[i], i + 1 < level.length ? level[i + 1] : level[i]));
  }
  return next;
}

/** 순서가 고정된 리프 해시 목록에서 64비트 FNV-1a 머클 루트를 계산한다. */
export function computeMerkleRootHex(leafHashes: readonly string[]): string {
  if (leafHashes.length === 0) return EMPTY_MERKLE_ROOT_HEX;
  let level = leafHashes.map(hashMerkleLeaf);
  while (level.length > 1) level = stepMerkleLevel(level);
  return level[0];
}

/** 특정 리프 인덱스의 머클 포함 증명을 생성한다. */
export function buildMerkleProof(leafHashes: readonly string[], targetIndex: number): readonly MerkleProofStep[] {
  if (targetIndex < 0 || targetIndex >= leafHashes.length) {
    throw new RangeError(`머클 증명 인덱스 범위 초과: ${targetIndex}`);
  }
  const steps: MerkleProofStep[] = [];
  let level = leafHashes.map(hashMerkleLeaf);
  let idx = targetIndex;
  while (level.length > 1) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    steps.push({ siblingHash: siblingIdx < level.length ? level[siblingIdx] : level[idx], position: isRight ? "left" : "right" });
    level = stepMerkleLevel(level);
    idx = Math.floor(idx / 2);
  }
  return steps;
}

/** 리프 해시와 머클 증명이 기대 머클 루트와 일치하는지 검증한다. */
export function verifyMerkleProof(leafHash: string, proof: readonly MerkleProofStep[], expectedRootHex: string): boolean {
  let acc = hashMerkleLeaf(leafHash);
  for (const step of proof) {
    acc = step.position === "left" ? hashMerklePair(step.siblingHash, acc) : hashMerklePair(acc, step.siblingHash);
  }
  return acc === expectedRootHex;
}

/* -------------------------------------------------------------------------- */
/* 2. P2P Distributed Grid Tile Render Coordinator & Offline AV Collab        */
/* -------------------------------------------------------------------------- */

export type GridRenderPassKind = "gi-diffuse" | "lineart-ink" | "screentone-filter" | "composite-rgba";
export type GridTileStatus = "queued" | "assigned" | "verified" | "failed";
export type TileRejectionReason =
  | "unknown-tile" | "not-assigned-to-peer" | "stale-attempt"
  | "dimension-mismatch" | "pass-mismatch" | "checksum-mismatch" | "oracle-checksum-mismatch";

export interface PeerNodeCapabilities {
  readonly peerId: string; readonly displayName: string; readonly computeScore: number;
  readonly maxConcurrentTiles: number; readonly supportsWebGpu: boolean; readonly rttMs: number; readonly online?: boolean;
}
export interface PeerRuntimeState {
  readonly peerId: string; readonly displayName: string; readonly computeScore: number;
  readonly maxConcurrentTiles: number; readonly supportsWebGpu: boolean; readonly rttMs: number;
  readonly online: boolean; readonly quarantined: boolean; readonly effectiveWeight: number;
  readonly inFlightTileIds: readonly string[]; readonly localQueueDepth: number;
  readonly completedTiles: number; readonly rejectedTiles: number;
  readonly timedOutTiles: number; readonly stolenTilesExecuted: number;
}
export interface GridTileDescriptor {
  readonly tileId: string; readonly jobId: string; readonly tileX: number; readonly tileY: number;
  readonly width: number; readonly height: number; readonly renderPass: GridRenderPassKind;
  readonly complexityWeight: number; readonly expectedChecksumHex?: string;
}
export interface GridTileAssignment {
  readonly tileId: string; readonly jobId: string; readonly peerId: string; readonly attempt: number;
  readonly assignedAtMs: number; readonly deadlineMs: number; readonly stolenFromPeerId: string | null;
}
export interface PeerTileSubmission {
  readonly tileId: string; readonly peerId: string; readonly attempt: number;
  readonly width: number; readonly height: number; readonly renderPass: GridRenderPassKind;
  readonly pixels: Uint8Array; readonly claimedChecksumHex: string; readonly renderDurationMs: number;
}
export interface TileSubmissionResult {
  readonly accepted: boolean; readonly tileId: string; readonly peerId: string;
  readonly verifiedChecksumHex: string | null; readonly reason: TileRejectionReason | null;
  readonly requeued: boolean; readonly peerQuarantined: boolean;
}
export interface TimeoutFailoverEvent {
  readonly tileId: string; readonly timedOutPeerId: string; readonly attempt: number;
  readonly requeued: boolean; readonly permanentlyFailed: boolean;
}
export interface GridCoordinatorStats {
  readonly totalTiles: number; readonly queuedTiles: number; readonly assignedTiles: number;
  readonly verifiedTiles: number; readonly failedTiles: number; readonly stealEventsCount: number;
  readonly timeoutFailoversCount: number; readonly rejectedSubmissionsCount: number;
}
export interface P2pGridCoordinatorOptions {
  readonly tileTimeoutMs?: number; readonly maxRetries?: number; readonly quarantineRejectionLimit?: number;
}
export interface OfflineAvCollabInput {
  readonly peerId: string; readonly cutId: string; readonly playheadMs: number; readonly playing: boolean;
  readonly audioCueId: string | null; readonly audioGainDb: number; readonly cursorX: number;
  readonly cursorY: number; readonly annotationHash: string; readonly lamportClock: number; readonly sentAtMs: number;
}
export interface OfflineAvCollabPacket extends OfflineAvCollabInput { readonly packetChecksumHex: string; }
export interface CollabApplyResult {
  readonly accepted: boolean; readonly reason: "ok" | "checksum-mismatch" | "stale-clock";
  readonly mergedLamportClock: number; readonly activePeerCount: number;
}

interface InternalPeerRecord {
  readonly peerId: string; readonly displayName: string; readonly computeScore: number;
  readonly maxConcurrentTiles: number; readonly supportsWebGpu: boolean;
  rttMs: number; online: boolean; quarantined: boolean;
  completedTiles: number; rejectedTiles: number; consecutiveRejections: number;
  timedOutTiles: number; stolenTilesExecuted: number;
  readonly inFlight: Set<string>; readonly localQueue: string[];
}
interface InternalTileRecord {
  readonly descriptor: GridTileDescriptor; status: GridTileStatus; attempt: number;
  assignedPeerId: string | null; assignedAtMs: number; deadlineMs: number; stolenFromPeerId: string | null;
  verifiedChecksumHex: string | null; verifiedPixels: Uint8Array | null; readonly avoidPeers: Set<string>;
}

const clampPositive = (v: number, fb: number): number => (Number.isFinite(v) && v > 0 ? v : fb);
function copyBytes(src: Uint8Array): Uint8Array { const out = new Uint8Array(src.byteLength); out.set(src); return out; }

function canonicalCollabBody(input: OfflineAvCollabInput): string {
  const r3 = (v: number): string => String(Math.round(v * 1000) / 1000);
  return [
    input.peerId, input.cutId, r3(input.playheadMs), input.playing ? "1" : "0", input.audioCueId ?? "",
    r3(input.audioGainDb), r3(input.cursorX), r3(input.cursorY), input.annotationHash,
    String(input.lamportClock), String(input.sentAtMs),
  ].join("|");
}

/** 오프라인 AV 협업 동기화 패킷을 64비트 FNV-1a 무결성 해시와 함께 봉인한다. */
export function createOfflineAvCollabPacket(input: OfflineAvCollabInput): OfflineAvCollabPacket {
  return { ...input, packetChecksumHex: fnv1a64StringHex(`av-collab:${canonicalCollabBody(input)}`) };
}

/** `TSAV` 컴팩트 바이너리 프레임으로 오프라인 AV 협업 패킷을 직렬화한다. */
export function encodeAvCollabPacketBinary(packet: OfflineAvCollabPacket): Uint8Array {
  const jsonBytes = TEXT_ENCODER.encode(JSON.stringify(packet));
  const out = new Uint8Array(10 + jsonBytes.byteLength);
  for (let i = 0; i < 4; i += 1) out[i] = AV_COLLAB_PACKET_MAGIC.charCodeAt(i);
  out[4] = AV_COLLAB_PACKET_VERSION;
  new DataView(out.buffer, out.byteOffset, out.byteLength).setUint32(6, jsonBytes.byteLength, true);
  out.set(jsonBytes, 10);
  return out;
}

/** `TSAV` 바이너리 프레임을 역직렬화하고 64비트 FNV-1a 체크섬 무결성을 검증한다. */
export function decodeAvCollabPacketBinary(bytes: Uint8Array): OfflineAvCollabPacket | null {
  if (bytes.byteLength < 10 || bytes[4] !== AV_COLLAB_PACKET_VERSION) return null;
  for (let i = 0; i < 4; i += 1) { if (bytes[i] !== AV_COLLAB_PACKET_MAGIC.charCodeAt(i)) return null; }
  const payloadLen = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(6, true);
  if (bytes.byteLength !== 10 + payloadLen) return null;
  try {
    const p = JSON.parse(TEXT_DECODER.decode(bytes.subarray(10))) as Partial<OfflineAvCollabPacket>;
    if (
      typeof p.peerId !== "string" || typeof p.cutId !== "string" || typeof p.playheadMs !== "number" ||
      typeof p.playing !== "boolean" || typeof p.audioGainDb !== "number" || typeof p.cursorX !== "number" ||
      typeof p.cursorY !== "number" || typeof p.annotationHash !== "string" ||
      typeof p.lamportClock !== "number" || typeof p.sentAtMs !== "number" || typeof p.packetChecksumHex !== "string"
    ) return null;
    const packet: OfflineAvCollabPacket = {
      peerId: p.peerId, cutId: p.cutId, playheadMs: p.playheadMs, playing: p.playing,
      audioCueId: typeof p.audioCueId === "string" ? p.audioCueId : null,
      audioGainDb: p.audioGainDb, cursorX: p.cursorX, cursorY: p.cursorY,
      annotationHash: p.annotationHash, lamportClock: p.lamportClock, sentAtMs: p.sentAtMs, packetChecksumHex: p.packetChecksumHex,
    };
    return fnv1a64StringHex(`av-collab:${canonicalCollabBody(packet)}`) === packet.packetChecksumHex ? packet : null;
  } catch { return null; }
}

/** 로컬 LAN/WebRTC 피어 간 작업 훔치기·타임아웃 장애조치·64비트 FNV-1a 검증·무서버 AV 협업 코디네이터. */
export class P2pGridRenderCoordinator {
  private readonly tileTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly quarantineLimit: number;
  private readonly peers = new Map<string, InternalPeerRecord>();
  private readonly tiles = new Map<string, InternalTileRecord>();
  private readonly recoveryQueue: string[] = [];
  private readonly collabByPeer = new Map<string, OfflineAvCollabPacket>();
  private lamportClock = 0;
  private stealEventsCount = 0;
  private timeoutFailoversCount = 0;
  private rejectedSubmissionsCount = 0;

  constructor(options: P2pGridCoordinatorOptions = {}) {
    this.tileTimeoutMs = clampPositive(options.tileTimeoutMs ?? DEFAULT_TILE_TIMEOUT_MS, DEFAULT_TILE_TIMEOUT_MS);
    this.maxRetries = Math.max(1, Math.floor(options.maxRetries ?? DEFAULT_MAX_TILE_RETRIES));
    this.quarantineLimit = Math.max(1, Math.floor(options.quarantineRejectionLimit ?? DEFAULT_QUARANTINE_REJECTION_LIMIT));
  }

  registerPeer(capabilities: PeerNodeCapabilities): void {
    const existing = this.peers.get(capabilities.peerId);
    if (existing) { existing.rttMs = Math.max(0.1, capabilities.rttMs); existing.online = capabilities.online ?? true; return; }
    this.peers.set(capabilities.peerId, {
      peerId: capabilities.peerId, displayName: capabilities.displayName,
      computeScore: clampPositive(capabilities.computeScore, 1),
      maxConcurrentTiles: Math.max(1, Math.floor(capabilities.maxConcurrentTiles)),
      supportsWebGpu: capabilities.supportsWebGpu, rttMs: Math.max(0.1, capabilities.rttMs),
      online: capabilities.online ?? true, quarantined: false,
      completedTiles: 0, rejectedTiles: 0, consecutiveRejections: 0, timedOutTiles: 0, stolenTilesExecuted: 0,
      inFlight: new Set<string>(), localQueue: [],
    });
  }

  setPeerOnline(peerId: string, online: boolean): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.online = online;
    if (!online) this.drainLocalQueueToRecovery(peer);
  }

  private drainLocalQueueToRecovery(peer: InternalPeerRecord): void {
    while (peer.localQueue.length > 0) {
      const id = peer.localQueue.pop();
      if (id !== undefined) this.recoveryQueue.push(id);
    }
  }

  private computeEffectiveWeight(peer: InternalPeerRecord): number {
    if (!peer.online || peer.quarantined) return 0;
    return peer.computeScore * (peer.supportsWebGpu ? 1.25 : 0.85) /
      ((1 + peer.rttMs / 100) * (1 + peer.rejectedTiles * 2 + peer.timedOutTiles * 0.75));
  }

  /** 프레임 영역을 타일 그리드로 분할하고 피어 성능 가중치에 따라 로컬 데크에 배분한다. */
  enqueueFrameGrid(params: {
    readonly jobId: string; readonly frameWidth: number; readonly frameHeight: number;
    readonly tileSize: number; readonly renderPass: GridRenderPassKind;
    readonly complexityWeights?: Readonly<Record<string, number>>;
    readonly expectedChecksums?: Readonly<Record<string, string>>;
  }): readonly GridTileDescriptor[] {
    const tileSize = Math.max(16, Math.floor(params.tileSize));
    const cols = Math.ceil(params.frameWidth / tileSize);
    const rows = Math.ceil(params.frameHeight / tileSize);
    const created: GridTileDescriptor[] = [];

    for (let ty = 0; ty < rows; ty += 1) {
      for (let tx = 0; tx < cols; tx += 1) {
        const tileId = `${params.jobId}:t_${tx}_${ty}`;
        const descriptor: GridTileDescriptor = {
          tileId, jobId: params.jobId, tileX: tx, tileY: ty,
          width: Math.min(tileSize, params.frameWidth - tx * tileSize),
          height: Math.min(tileSize, params.frameHeight - ty * tileSize),
          renderPass: params.renderPass,
          complexityWeight: clampPositive(params.complexityWeights?.[tileId] ?? 1, 1),
          expectedChecksumHex: params.expectedChecksums?.[tileId],
        };
        created.push(descriptor);
        this.tiles.set(tileId, {
          descriptor, status: "queued", attempt: 0, assignedPeerId: null, assignedAtMs: 0, deadlineMs: 0,
          stolenFromPeerId: null, verifiedChecksumHex: null, verifiedPixels: null, avoidPeers: new Set<string>(),
        });
      }
    }
    this.partitionTilesToPeerQueues(created);
    return created;
  }

  private partitionTilesToPeerQueues(tiles: readonly GridTileDescriptor[]): void {
    const eligible = Array.from(this.peers.values())
      .map((peer) => ({ peer, weight: this.computeEffectiveWeight(peer), assignedLoad: 0 }))
      .filter((entry) => entry.weight > 0)
      .sort((a, b) => b.weight - a.weight || a.peer.peerId.localeCompare(b.peer.peerId));
    if (eligible.length === 0) { for (const t of tiles) this.recoveryQueue.push(t.tileId); return; }

    const sortedTiles = [...tiles].sort((a, b) => b.complexityWeight - a.complexityWeight || a.tileId.localeCompare(b.tileId));
    for (const tile of sortedTiles) {
      let best = eligible[0];
      let bestRatio = (best.assignedLoad + tile.complexityWeight * 0.5) / best.weight;
      for (let j = 1; j < eligible.length; j += 1) {
        const ratio = (eligible[j].assignedLoad + tile.complexityWeight * 0.5) / eligible[j].weight;
        if (ratio < bestRatio) { bestRatio = ratio; best = eligible[j]; }
      }
      best.peer.localQueue.push(tile.tileId);
      best.assignedLoad += tile.complexityWeight;
    }
  }

  /** 유휴 피어에 복구 큐·로컬 데크·꼬리 작업 훔치기 순서로 타일을 배정한다. */
  dispatchAvailableWork(nowMs: number): readonly GridTileAssignment[] {
    const assignments: GridTileAssignment[] = [];
    const activePeers = Array.from(this.peers.values())
      .filter((peer) => peer.online && !peer.quarantined)
      .sort((a, b) => this.computeEffectiveWeight(b) - this.computeEffectiveWeight(a));

    for (const peer of activePeers) {
      while (peer.inFlight.size < peer.maxConcurrentTiles) {
        const picked = this.pickNextTileForPeer(peer);
        if (!picked) break;
        const { tile, stolenFromPeerId } = picked;
        tile.status = "assigned";
        tile.attempt += 1;
        tile.assignedPeerId = peer.peerId;
        tile.assignedAtMs = nowMs;
        tile.deadlineMs = nowMs + this.tileTimeoutMs;
        tile.stolenFromPeerId = stolenFromPeerId;
        peer.inFlight.add(tile.descriptor.tileId);
        if (stolenFromPeerId !== null) { this.stealEventsCount += 1; peer.stolenTilesExecuted += 1; }
        assignments.push({
          tileId: tile.descriptor.tileId, jobId: tile.descriptor.jobId, peerId: peer.peerId,
          attempt: tile.attempt, assignedAtMs: nowMs, deadlineMs: tile.deadlineMs, stolenFromPeerId,
        });
      }
    }
    return assignments;
  }

  private pickNextTileForPeer(
    peer: InternalPeerRecord,
  ): { readonly tile: InternalTileRecord; readonly stolenFromPeerId: string | null } | null {
    for (let i = 0; i < this.recoveryQueue.length; i += 1) {
      const record = this.tiles.get(this.recoveryQueue[i]);
      if (!record || record.status !== "queued") { this.recoveryQueue.splice(i, 1); i -= 1; continue; }
      if (!record.avoidPeers.has(peer.peerId) || !this.hasAlternativeHealthyPeer(peer.peerId, record.avoidPeers)) {
        this.recoveryQueue.splice(i, 1);
        return { tile: record, stolenFromPeerId: null };
      }
    }
    while (peer.localQueue.length > 0) {
      const tileId = peer.localQueue.shift();
      if (tileId === undefined) break;
      const record = this.tiles.get(tileId);
      if (record && record.status === "queued" && !record.avoidPeers.has(peer.peerId)) {
        return { tile: record, stolenFromPeerId: null };
      }
    }
    let victim: InternalPeerRecord | null = null;
    let maxBacklogScore = 0;
    for (const candidate of this.peers.values()) {
      if (candidate.peerId === peer.peerId || candidate.localQueue.length === 0) continue;
      const score = candidate.localQueue.length / Math.max(0.1, this.computeEffectiveWeight(candidate));
      if (score > maxBacklogScore) { maxBacklogScore = score; victim = candidate; }
    }
    if (!victim) return null;
    for (let idx = victim.localQueue.length - 1; idx >= 0; idx -= 1) {
      const record = this.tiles.get(victim.localQueue[idx]);
      if (!record || record.status !== "queued") { victim.localQueue.splice(idx, 1); continue; }
      if (!record.avoidPeers.has(peer.peerId)) {
        victim.localQueue.splice(idx, 1);
        return { tile: record, stolenFromPeerId: victim.peerId };
      }
    }
    return null;
  }

  private hasAlternativeHealthyPeer(currentPeerId: string, avoidPeers: ReadonlySet<string>): boolean {
    for (const peer of this.peers.values()) {
      if (peer.peerId !== currentPeerId && peer.online && !peer.quarantined && !avoidPeers.has(peer.peerId)) return true;
    }
    return false;
  }

  /** 마감 시각을 초과한 피어 작업을 회수해 복구 큐로 재할당한다. */
  sweepTimeouts(nowMs: number): readonly TimeoutFailoverEvent[] {
    const events: TimeoutFailoverEvent[] = [];
    for (const tile of this.tiles.values()) {
      if (tile.status !== "assigned" || nowMs < tile.deadlineMs || tile.assignedPeerId === null) continue;
      const timedOutPeerId = tile.assignedPeerId;
      const peer = this.peers.get(timedOutPeerId);
      if (peer) { peer.inFlight.delete(tile.descriptor.tileId); peer.timedOutTiles += 1; }
      tile.avoidPeers.add(timedOutPeerId);
      tile.assignedPeerId = null;
      this.timeoutFailoversCount += 1;
      const permanentlyFailed = tile.attempt >= this.maxRetries;
      tile.status = permanentlyFailed ? "failed" : "queued";
      if (!permanentlyFailed) this.recoveryQueue.push(tile.descriptor.tileId);
      events.push({ tileId: tile.descriptor.tileId, timedOutPeerId, attempt: tile.attempt, requeued: !permanentlyFailed, permanentlyFailed });
    }
    return events;
  }

  /** 피어가 제출한 타일 결과를 64비트 FNV-1a 체크섬으로 검증하고 손상 결과는 거부·격리한다. */
  submitTileResult(submission: PeerTileSubmission): TileSubmissionResult {
    const tile = this.tiles.get(submission.tileId);
    if (!tile) return this.rejectUnmatched(submission, "unknown-tile");
    if (tile.status !== "assigned" || tile.assignedPeerId !== submission.peerId) return this.rejectUnmatched(submission, "not-assigned-to-peer");
    if (tile.attempt !== submission.attempt) return this.rejectUnmatched(submission, "stale-attempt");

    const peer = this.peers.get(submission.peerId);
    peer?.inFlight.delete(submission.tileId);
    if (
      submission.width !== tile.descriptor.width || submission.height !== tile.descriptor.height ||
      submission.pixels.byteLength !== tile.descriptor.width * tile.descriptor.height * 4
    ) return this.handleRejectedTile(tile, peer, "dimension-mismatch");
    if (submission.renderPass !== tile.descriptor.renderPass) return this.handleRejectedTile(tile, peer, "pass-mismatch");

    const recomputed = computeTileChecksum64(submission.tileId, submission.width, submission.height, submission.pixels, submission.renderPass);
    if (recomputed !== submission.claimedChecksumHex) return this.handleRejectedTile(tile, peer, "checksum-mismatch");
    if (tile.descriptor.expectedChecksumHex !== undefined && recomputed !== tile.descriptor.expectedChecksumHex) {
      return this.handleRejectedTile(tile, peer, "oracle-checksum-mismatch");
    }

    tile.status = "verified";
    tile.verifiedChecksumHex = recomputed;
    tile.verifiedPixels = copyBytes(submission.pixels);
    if (peer) { peer.completedTiles += 1; peer.consecutiveRejections = 0; }
    return { accepted: true, tileId: submission.tileId, peerId: submission.peerId, verifiedChecksumHex: recomputed, reason: null, requeued: false, peerQuarantined: false };
  }

  private rejectUnmatched(submission: PeerTileSubmission, reason: TileRejectionReason): TileSubmissionResult {
    this.rejectedSubmissionsCount += 1;
    return { accepted: false, tileId: submission.tileId, peerId: submission.peerId, verifiedChecksumHex: null, reason, requeued: false, peerQuarantined: false };
  }

  private handleRejectedTile(tile: InternalTileRecord, peer: InternalPeerRecord | undefined, reason: TileRejectionReason): TileSubmissionResult {
    this.rejectedSubmissionsCount += 1;
    let peerQuarantined = false;
    if (peer) {
      peer.rejectedTiles += 1;
      peer.consecutiveRejections += 1;
      if (peer.consecutiveRejections >= this.quarantineLimit) {
        peer.quarantined = true;
        peerQuarantined = true;
        this.drainLocalQueueToRecovery(peer);
      }
      tile.avoidPeers.add(peer.peerId);
    }
    tile.assignedPeerId = null;
    const canRetry = tile.attempt < this.maxRetries;
    tile.status = canRetry ? "queued" : "failed";
    if (canRetry) this.recoveryQueue.push(tile.descriptor.tileId);
    return { accepted: false, tileId: tile.descriptor.tileId, peerId: peer?.peerId ?? "unknown", verifiedChecksumHex: null, reason, requeued: canRetry, peerQuarantined };
  }

  emitLocalCollabPacket(input: Omit<OfflineAvCollabInput, "lamportClock">): OfflineAvCollabPacket {
    this.lamportClock += 1;
    const packet = createOfflineAvCollabPacket({ ...input, lamportClock: this.lamportClock });
    this.collabByPeer.set(packet.peerId, packet);
    return packet;
  }

  applyCollabSyncPacket(packet: OfflineAvCollabPacket): CollabApplyResult {
    if (fnv1a64StringHex(`av-collab:${canonicalCollabBody(packet)}`) !== packet.packetChecksumHex) {
      return { accepted: false, reason: "checksum-mismatch", mergedLamportClock: this.lamportClock, activePeerCount: this.collabByPeer.size };
    }
    const prior = this.collabByPeer.get(packet.peerId);
    if (prior && packet.lamportClock <= prior.lamportClock) {
      return { accepted: false, reason: "stale-clock", mergedLamportClock: this.lamportClock, activePeerCount: this.collabByPeer.size };
    }
    this.lamportClock = Math.max(this.lamportClock, packet.lamportClock) + 1;
    this.collabByPeer.set(packet.peerId, packet);
    return { accepted: true, reason: "ok", mergedLamportClock: this.lamportClock, activePeerCount: this.collabByPeer.size };
  }

  getCollabSnapshot(): readonly OfflineAvCollabPacket[] {
    return Array.from(this.collabByPeer.values()).sort((a, b) => a.peerId.localeCompare(b.peerId));
  }

  getPeerStates(): readonly PeerRuntimeState[] {
    return Array.from(this.peers.values())
      .map((p) => ({
        peerId: p.peerId, displayName: p.displayName, computeScore: p.computeScore, maxConcurrentTiles: p.maxConcurrentTiles,
        supportsWebGpu: p.supportsWebGpu, rttMs: p.rttMs, online: p.online, quarantined: p.quarantined,
        effectiveWeight: this.computeEffectiveWeight(p), inFlightTileIds: Array.from(p.inFlight), localQueueDepth: p.localQueue.length,
        completedTiles: p.completedTiles, rejectedTiles: p.rejectedTiles, timedOutTiles: p.timedOutTiles, stolenTilesExecuted: p.stolenTilesExecuted,
      }))
      .sort((a, b) => a.peerId.localeCompare(b.peerId));
  }

  getVerifiedTilePixels(tileId: string): Uint8Array | null {
    const tile = this.tiles.get(tileId);
    return tile?.verifiedPixels ? copyBytes(tile.verifiedPixels) : null;
  }

  getStats(): GridCoordinatorStats {
    let queuedTiles = 0, assignedTiles = 0, verifiedTiles = 0, failedTiles = 0;
    for (const t of this.tiles.values()) {
      if (t.status === "queued") queuedTiles += 1;
      else if (t.status === "assigned") assignedTiles += 1;
      else if (t.status === "verified") verifiedTiles += 1;
      else failedTiles += 1;
    }
    return {
      totalTiles: this.tiles.size, queuedTiles, assignedTiles, verifiedTiles, failedTiles,
      stealEventsCount: this.stealEventsCount, timeoutFailoversCount: this.timeoutFailoversCount,
      rejectedSubmissionsCount: this.rejectedSubmissionsCount,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* 3. Stream-Based Real-Time Asset Dependency & Merkle Self-Healing Pipeline  */
/* -------------------------------------------------------------------------- */

export type AssetNodeKind = "material" | "prop3d" | "cut" | "episode";
export type DependencyPinMode = "floating" | "locked";
const ASSET_KIND_RANK: Readonly<Record<AssetNodeKind, number>> = { material: 0, prop3d: 1, cut: 2, episode: 3 };

export interface AssetDependencyPin {
  readonly dependencyId: string; readonly pinnedVersion: number;
  readonly expectedContentHash: string; readonly pinMode: DependencyPinMode;
}
export interface StreamAssetInput {
  readonly assetId: string; readonly kind: AssetNodeKind; readonly payload: Uint8Array;
  readonly dependencies?: readonly { readonly dependencyId: string; readonly pinMode?: DependencyPinMode }[];
  readonly replicaId?: string; readonly timestampMs?: number;
}
export interface StreamAssetNode {
  readonly assetId: string; readonly kind: AssetNodeKind; readonly version: number;
  readonly lamportClock: number; readonly contentHash: string; readonly byteLength: number;
  readonly dependencies: readonly AssetDependencyPin[]; readonly replicaId: string; readonly updatedAtMs: number;
}
export interface HotSwapDeltaEvent {
  readonly eventId: string; readonly sourceAssetId: string; readonly sourceKind: AssetNodeKind;
  readonly fromVersion: number; readonly toVersion: number; readonly newContentHash: string;
  readonly affectedAssetIds: readonly string[]; readonly skippedLockedAssetIds: readonly string[];
  readonly merkleRootHex: string; readonly emittedAtMs: number;
}
export interface AssetIntegrityAuditReport {
  readonly healthy: boolean; readonly expectedMerkleRootHex: string; readonly actualMerkleRootHex: string;
  readonly corruptedAssetIds: readonly string[]; readonly checkedCount: number;
}
export interface MerklePeerReplicaSource { readonly peerId: string; fetchAssetBytes(assetId: string): Uint8Array | null; }
export interface MerkleSelfHealReport {
  readonly healedAssetIds: readonly string[]; readonly unrecoverableAssetIds: readonly string[];
  readonly rejectedPeerPayloads: number; readonly recoveredFromPeerIds: Readonly<Record<string, string>>;
  readonly verifiedMerkleRootHex: string; readonly fullyHealed: boolean;
}

interface InternalAssetEntry {
  readonly assetId: string; readonly kind: AssetNodeKind; version: number; lamportClock: number;
  committedHash: string; localPayload: Uint8Array; dependencies: AssetDependencyPin[]; replicaId: string; updatedAtMs: number;
}

/** `material -> prop3d -> cut -> episode` 반응형 DAG · 버전 핀 핫스왑 · 머클 자가치유 파이프라인. */
export class RealTimeAssetStreamPipeline {
  private readonly nodes = new Map<string, InternalAssetEntry>();
  private readonly dependents = new Map<string, Set<string>>();
  private readonly listeners = new Set<(event: HotSwapDeltaEvent) => void>();
  private readonly replicaId: string;
  private lamportClock = 0;
  private eventSeq = 0;
  private committedMerkleRootHex = EMPTY_MERKLE_ROOT_HEX;

  constructor(replicaId = "local-studio") { this.replicaId = replicaId; }

  subscribeHotSwap(listener: (event: HotSwapDeltaEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  registerAsset(input: StreamAssetInput): StreamAssetNode {
    if (this.nodes.has(input.assetId)) throw new Error(`이미 등록된 에셋 ID입니다: ${input.assetId}`);
    const pins: AssetDependencyPin[] = [];
    for (const ref of input.dependencies ?? []) {
      if (ref.dependencyId === input.assetId) throw new Error(`자기 순환 의존성은 허용되지 않습니다: ${input.assetId}`);
      const depNode = this.nodes.get(ref.dependencyId);
      if (!depNode) throw new Error(`선행 의존 에셋이 존재하지 않습니다: ${ref.dependencyId}`);
      if (ASSET_KIND_RANK[depNode.kind] > ASSET_KIND_RANK[input.kind]) {
        throw new Error(`DAG 계층 위반(${depNode.kind} -> ${input.kind}): 상위 계층에 역의존할 수 없습니다.`);
      }
      pins.push({ dependencyId: depNode.assetId, pinnedVersion: depNode.version, expectedContentHash: depNode.committedHash, pinMode: ref.pinMode ?? "floating" });
    }
    this.lamportClock += 1;
    const payloadCopy = copyBytes(input.payload);
    const entry: InternalAssetEntry = {
      assetId: input.assetId, kind: input.kind, version: 1, lamportClock: this.lamportClock,
      committedHash: fnv1a64Hex(payloadCopy), localPayload: payloadCopy, dependencies: pins,
      replicaId: input.replicaId ?? this.replicaId, updatedAtMs: input.timestampMs ?? Date.now(),
    };
    this.nodes.set(input.assetId, entry);
    this.dependents.set(input.assetId, new Set<string>());
    for (const pin of pins) this.dependents.get(pin.dependencyId)?.add(input.assetId);
    this.committedMerkleRootHex = this.computeCommittedMerkleRoot();
    return this.toPublicNode(entry);
  }

  /** 에셋을 핫스왑 갱신하고 `floating` 핀 하위 DAG 노드로 증분 델타를 전파한다. */
  publishHotSwap(assetId: string, nextPayload: Uint8Array, timestampMs = Date.now()): HotSwapDeltaEvent {
    const source = this.nodes.get(assetId);
    if (!source) throw new Error(`존재하지 않는 에셋입니다: ${assetId}`);
    const fromVersion = source.version;
    this.lamportClock += 1;
    source.localPayload = copyBytes(nextPayload);
    source.committedHash = fnv1a64Hex(source.localPayload);
    source.version += 1;
    source.lamportClock = this.lamportClock;
    source.updatedAtMs = timestampMs;

    const affectedAssetIds: string[] = [];
    const skippedLockedAssetIds: string[] = [];
    const queue: string[] = [assetId];
    const visitedAffected = new Set<string>([assetId]);
    const visitedSkipped = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (currentId === undefined) break;
      const currentNode = this.nodes.get(currentId);
      const downstream = this.dependents.get(currentId);
      if (!currentNode || !downstream) continue;
      const sortedChildren = Array.from(downstream).sort((a, b) => {
        const na = this.nodes.get(a), nb = this.nodes.get(b);
        return ((na ? ASSET_KIND_RANK[na.kind] : 0) - (nb ? ASSET_KIND_RANK[nb.kind] : 0)) || a.localeCompare(b);
      });
      for (const childId of sortedChildren) {
        const child = this.nodes.get(childId);
        const pinIdx = child ? child.dependencies.findIndex((p) => p.dependencyId === currentId) : -1;
        if (!child || pinIdx < 0) continue;
        const pin = child.dependencies[pinIdx];
        if (pin.pinMode === "locked") {
          if (!visitedSkipped.has(childId)) { visitedSkipped.add(childId); skippedLockedAssetIds.push(childId); }
          continue;
        }
        child.dependencies[pinIdx] = { ...pin, pinnedVersion: currentNode.version, expectedContentHash: currentNode.committedHash };
        if (!visitedAffected.has(childId)) {
          visitedAffected.add(childId);
          child.version += 1;
          child.lamportClock = this.lamportClock;
          child.updatedAtMs = timestampMs;
          affectedAssetIds.push(childId);
          queue.push(childId);
        }
      }
    }

    this.committedMerkleRootHex = this.computeCommittedMerkleRoot();
    this.eventSeq += 1;
    const event: HotSwapDeltaEvent = {
      eventId: `hotswap-${this.eventSeq}`, sourceAssetId: source.assetId, sourceKind: source.kind,
      fromVersion, toVersion: source.version, newContentHash: source.committedHash,
      affectedAssetIds, skippedLockedAssetIds, merkleRootHex: this.committedMerkleRootHex, emittedAtMs: timestampMs,
    };
    for (const listener of this.listeners) listener(event);
    return event;
  }

  /** 원격 CRDT 복제본의 에셋 업데이트를 LWW(Lamport + replicaId) 및 해시 검증 후 병합한다. */
  mergeRemoteCrdtUpdate(remote: {
    readonly assetId: string; readonly lamportClock: number; readonly replicaId: string;
    readonly payload: Uint8Array; readonly claimedContentHash: string; readonly timestampMs?: number;
  }): { readonly applied: boolean; readonly event: HotSwapDeltaEvent | null; readonly reason: string } {
    const existing = this.nodes.get(remote.assetId);
    if (!existing) return { applied: false, event: null, reason: "unknown-asset" };
    if (fnv1a64Hex(remote.payload) !== remote.claimedContentHash) return { applied: false, event: null, reason: "hash-mismatch" };
    const wins = remote.lamportClock > existing.lamportClock || (remote.lamportClock === existing.lamportClock && remote.replicaId > existing.replicaId);
    if (!wins) return { applied: false, event: null, reason: "stale-crdt-clock" };
    this.lamportClock = Math.max(this.lamportClock, remote.lamportClock);
    existing.replicaId = remote.replicaId;
    return { applied: true, event: this.publishHotSwap(remote.assetId, remote.payload, remote.timestampMs ?? Date.now()), reason: "merged" };
  }

  writeRawLocalCacheForTest(assetId: string, corruptedPayload: Uint8Array): void {
    const entry = this.nodes.get(assetId);
    if (!entry) throw new Error(`존재하지 않는 에셋입니다: ${assetId}`);
    entry.localPayload = copyBytes(corruptedPayload);
  }

  /** 전체 로컬 캐시 버퍼의 64비트 FNV-1a와 머클 루트를 감사해 손상 에셋을 식별한다. */
  auditIntegrity(): AssetIntegrityAuditReport {
    const orderedIds = this.getOrderedAssetIds();
    const corruptedAssetIds: string[] = [];
    const actualLeafHashes: string[] = [];
    for (const id of orderedIds) {
      const entry = this.nodes.get(id);
      if (!entry) continue;
      const actualHash = fnv1a64Hex(entry.localPayload);
      actualLeafHashes.push(actualHash);
      if (actualHash !== entry.committedHash) corruptedAssetIds.push(entry.assetId);
    }
    const actualMerkleRootHex = computeMerkleRootHex(actualLeafHashes);
    return {
      healthy: corruptedAssetIds.length === 0 && actualMerkleRootHex === this.committedMerkleRootHex,
      expectedMerkleRootHex: this.committedMerkleRootHex, actualMerkleRootHex, corruptedAssetIds, checkedCount: orderedIds.length,
    };
  }

  /** 손상된 로컬 에셋을 피어 복제본에서 조회하고 64비트 FNV-1a + 머클 증명으로 검증해 자가치유한다. */
  selfHealFromPeers(peers: readonly MerklePeerReplicaSource[]): MerkleSelfHealReport {
    const audit = this.auditIntegrity();
    const orderedIds = this.getOrderedAssetIds();
    const committedLeafHashes = orderedIds.map((id) => this.nodes.get(id)?.committedHash ?? EMPTY_MERKLE_ROOT_HEX);
    const healedAssetIds: string[] = [];
    const unrecoverableAssetIds: string[] = [];
    const recoveredFromPeerIds: Record<string, string> = {};
    let rejectedPeerPayloads = 0;

    for (const assetId of audit.corruptedAssetIds) {
      const entry = this.nodes.get(assetId);
      const leafIndex = orderedIds.indexOf(assetId);
      if (!entry || leafIndex < 0) continue;
      const proof = buildMerkleProof(committedLeafHashes, leafIndex);
      let recovered = false;
      for (const peer of peers) {
        const candidateBytes = peer.fetchAssetBytes(assetId);
        if (!candidateBytes) continue;
        const candidateHash = fnv1a64Hex(candidateBytes);
        if (candidateHash === entry.committedHash && verifyMerkleProof(candidateHash, proof, this.committedMerkleRootHex)) {
          entry.localPayload = copyBytes(candidateBytes);
          healedAssetIds.push(assetId);
          recoveredFromPeerIds[assetId] = peer.peerId;
          recovered = true;
          break;
        }
        rejectedPeerPayloads += 1;
      }
      if (!recovered) unrecoverableAssetIds.push(assetId);
    }

    const postAudit = this.auditIntegrity();
    return {
      healedAssetIds, unrecoverableAssetIds, rejectedPeerPayloads, recoveredFromPeerIds,
      verifiedMerkleRootHex: postAudit.actualMerkleRootHex, fullyHealed: postAudit.healthy && unrecoverableAssetIds.length === 0,
    };
  }

  getAssetNode(assetId: string): StreamAssetNode | null { const e = this.nodes.get(assetId); return e ? this.toPublicNode(e) : null; }
  getLocalPayload(assetId: string): Uint8Array | null { const e = this.nodes.get(assetId); return e ? copyBytes(e.localPayload) : null; }
  getMerkleRootHex(): string { return this.committedMerkleRootHex; }
  private getOrderedAssetIds(): string[] { return Array.from(this.nodes.keys()).sort(); }
  private computeCommittedMerkleRoot(): string {
    return computeMerkleRootHex(this.getOrderedAssetIds().map((id) => this.nodes.get(id)?.committedHash ?? EMPTY_MERKLE_ROOT_HEX));
  }
  private toPublicNode(e: InternalAssetEntry): StreamAssetNode {
    return {
      assetId: e.assetId, kind: e.kind, version: e.version, lamportClock: e.lamportClock,
      contentHash: e.committedHash, byteLength: e.localPayload.byteLength,
      dependencies: e.dependencies.map((d) => ({ ...d })), replicaId: e.replicaId, updatedAtMs: e.updatedAtMs,
    };
  }
}
