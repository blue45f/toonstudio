import { compareHlc, compareTileStrokeOp, formatHlc, tickHlcLocal, receiveHlcRemote, fnv1a32Hex, fnv1a64Hex, serializeDeltaPacket, assertOperationBatch, assertLocalStrokeText, collectUniqueOps, assertTileOp, CRDT_SYNC_LIMITS, isPeerId } from "./crdt-sync-boundaries";

export { compareHlc, compareTileStrokeOp, formatHlc, tickHlcLocal, receiveHlcRemote, fnv1a32Hex, fnv1a64Hex, serializeDeltaPacket, deserializeDeltaPacket } from "./crdt-sync-boundaries";

/**
 * Wave 56B — 메모리 CRDT 메타데이터 예제와 타일 병합 비용 모형.
 *
 * - 하이브리드 논리 시계(HLC) 전순서 + 256×256 타일 단위 LWW-Element-Set / 정규 Op-Log CRDT
 * - 유효·고유 ID를 가진 예제 집합의 순서·중복 병합 해시 비교(일반 수학 증명 아님)
 * - GPU 패스 수와 전송량 추정이며 실제 렌더·전송·저장·지연을 측정하지 않는다.
 * - 구분자 텍스트 메타데이터 직렬화 및 JSON 스냅샷 내보내기(압축 구현 아님)
 */

export type PeerId = "lead-artist" | "lineart-assist" | "color-assist" | "lettering-assist";
export type StudioLayerId = "layer-storyboard" | "layer-ink" | "layer-color" | "layer-sfx-text";
export type TileKey = `tile:${number}:${number}`;
export type StrokeOpKind = "stroke-add" | "stroke-erase" | "tile-fill";
export type SyncTransportChannel = "webrtc-datachannel" | "websocket-relay" | "opfs-offline-queue";
export type CrdtNetworkScenarioId = "lan-normal" | "jitter-reorder" | "offline-partition" | "same-tile-conflict";

export interface HlcTimestamp { readonly physicalMs: number; readonly logical: number; readonly nodeId: PeerId; }
export interface CrdtPeerRoleSpec {
  readonly peerId: PeerId; readonly roleLabelKo: string; readonly roleLabelEn: string;
  readonly shortBadgeKo: string; readonly shortBadgeEn: string; readonly defaultLayerId: StudioLayerId;
  readonly defaultBrushCode: string; readonly homeTileX: number; readonly homeTileY: number;
}
export interface CrdtNetworkScenarioSpec {
  readonly id: CrdtNetworkScenarioId; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string; readonly primaryTransport: SyncTransportChannel;
  readonly simulatedRttMs: number; readonly reorderPackets: boolean; readonly injectDuplicates: boolean;
  readonly partitionedPeers: readonly PeerId[];
}
export interface TileStrokeOp {
  readonly opId: string; readonly authorId: PeerId; readonly layerId: StudioLayerId;
  readonly tileX: number; readonly tileY: number; readonly tileKey: TileKey;
  readonly hlc: HlcTimestamp; readonly kind: StrokeOpKind; readonly brushCode: string;
  readonly strokeHash: string; readonly pointCount: number; readonly opacityQ8: number;
  readonly rawJsonBytes: number; readonly payloadBytes: number;
}
export interface TileLayerLwwEntry {
  readonly layerId: StudioLayerId; readonly addHlc: HlcTimestamp | null; readonly addOpId: string | null;
  readonly addAuthorId: PeerId | null; readonly addBrushCode: string | null; readonly addStrokeHash: string | null;
  readonly addOpacityQ8: number; readonly removeHlc: HlcTimestamp | null; readonly removeOpId: string | null;
  readonly isVisible: boolean;
}
export interface CrdtTileCellState {
  readonly tileKey: TileKey; readonly tileX: number; readonly tileY: number;
  readonly appliedOpCount: number; readonly appliedOpIds: readonly string[];
  readonly activeLayers: Readonly<Record<StudioLayerId, TileLayerLwwEntry>>;
  readonly visibleLayerCount: number; readonly distinctAuthors: readonly PeerId[];
  readonly winningHlc: HlcTimestamp | null; readonly winningAuthorId: PeerId | null;
  readonly winningOpId: string | null; readonly concurrentConflictCount: number; readonly tileDigest: string;
}
export interface CoalescedDirtyTile {
  readonly tileKey: TileKey; readonly tileX: number; readonly tileY: number;
  readonly opCount: number; readonly compositePassCount: 1;
  readonly distinctLayers: readonly StudioLayerId[]; readonly distinctAuthors: readonly PeerId[];
  readonly coalescedUploadBytes: number; readonly naiveUploadBytes: number;
}
export interface DirtyTileCoalesceReport {
  readonly tileSizePx: number; readonly inputOpCount: number; readonly uniqueOpCount: number;
  readonly duplicateInFrameCount: number; readonly naiveDrawCalls: number; readonly coalescedDrawCalls: number;
  readonly savedDrawCalls: number; readonly coalescingReductionPct: number; readonly optimisticLocalLatencyMs: 0;
  readonly frameBudgetMs: number; readonly estimatedGpuCompositeMs: number; readonly naiveGpuCompositeMs: number;
  readonly withinFrameBudget: boolean; readonly measurementKind: "deterministic-tile-model"; readonly gpuExecutionVerified: false; readonly latencyMeasured: false;
  readonly dirtyTiles: readonly CoalescedDirtyTile[];
}
export interface CrdtPeerMetrics {
  readonly localOptimisticLatencyMs: 0; readonly localOpsAuthored: number; readonly remoteOpsMerged: number;
  readonly duplicateOpsIgnored: number; readonly outOfOrderOpsAccepted: number; readonly conflictAutoResolvedCount: number;
  readonly rawJsonBytesSent: number; readonly compressedDeltaBytesSent: number;
  readonly lastCoalescedFrame: DirtyTileCoalesceReport | null;
}
export interface CrdtPeerState {
  readonly peerId: PeerId; readonly roleLabelKo: string; readonly roleLabelEn: string;
  readonly defaultLayerId: StudioLayerId; readonly clock: HlcTimestamp; readonly localSeq: number;
  readonly transportChannel: SyncTransportChannel; readonly isOffline: boolean;
  readonly opLog: readonly TileStrokeOp[]; readonly tiles: Readonly<Record<TileKey, CrdtTileCellState>>;
  readonly offlineOutbox: readonly TileStrokeOp[]; readonly pendingDirtyOps: readonly TileStrokeOp[];
  readonly peerVectorCounts: Readonly<Record<PeerId, number>>;
  readonly metrics: CrdtPeerMetrics; readonly stateHash: string;
}
export interface CreateCrdtPeerOptions {
  readonly initialPhysicalMs?: number; readonly transportChannel?: SyncTransportChannel; readonly isOffline?: boolean;
}
export interface LocalStrokeOpInput {
  readonly tileX: number; readonly tileY: number; readonly layerId?: StudioLayerId; readonly kind?: StrokeOpKind;
  readonly brushCode?: string; readonly pointCount?: number; readonly opacityQ8?: number;
  readonly physicalNowMs?: number; readonly strokeSeed?: string;
}
export interface CrdtDeltaPacket {
  readonly packetVersion: "toonstudio.crdt-delta.v1"; readonly transportChannel: SyncTransportChannel;
  readonly opCount: number; readonly rawJsonBytes: number; readonly compressedDeltaBytes: number;
  readonly fullTileRawBytes: number; readonly compressionRatio: number;
  readonly packetHash: string; readonly encodedPayload: string; readonly compressionApplied: false; readonly accountingKind: "modeled-uncompressed-metadata"; readonly encodedPayloadBytes: number;
}
export interface LocalStrokeOpResult {
  readonly peer: CrdtPeerState; readonly op: TileStrokeOp; readonly packet: CrdtDeltaPacket;
  readonly optimisticRenderLatencyMs: 0; readonly syncPath: SyncTransportChannel;
}
export interface MergeRemoteOpsOptions { readonly physicalNowMs?: number; readonly clearMatchingOutbox?: boolean; }
export interface MergeRemoteOpsResult {
  readonly peer: CrdtPeerState; readonly acceptedOps: readonly TileStrokeOp[];
  readonly duplicateCount: number; readonly outOfOrderCount: number;
  readonly affectedTileKeys: readonly TileKey[]; readonly stateHashChanged: boolean;
}
export interface CoalesceFrameOptions { readonly targetFps?: 60 | 120; }
export interface BandwidthBudgetSummary {
  readonly transportChannel: SyncTransportChannel; readonly totalOps: number; readonly rawJsonBytes: number;
  readonly compressedDeltaBytes: number; readonly fullTileNaiveBytes: number; readonly jsonSavingsPct: number;
  readonly tileUploadSavingsPct: number; readonly estimatedKbpsAt60Hz: number;
  readonly budgetCapKbps: number; readonly withinBudget: boolean; readonly accountingKind: "modeled-delta-per-frame-at-60hz";
}
export interface CrdtConvergenceProof {
  readonly canonicalHash: string; readonly commutativePassed: boolean; readonly associativePassed: boolean;
  readonly idempotentPassed: boolean; readonly outOfOrderAndDuplicatePassed: boolean;
  readonly allLawsVerified: boolean; readonly peerHashes: Readonly<Record<PeerId, string>>;
  readonly verifiedOpCount: number; readonly testedPermutations: number; readonly verificationScope: "provided-op-set-hash-comparison";
}
export interface CrdtClusterStepResult {
  readonly peers: readonly CrdtPeerState[]; readonly coalesceReport: DirtyTileCoalesceReport;
  readonly totalDuplicatesIgnored: number; readonly totalOutOfOrderAccepted: number; readonly allPeersConverged: boolean;
}
export interface CrdtSyncExportSnapshot {
  readonly schema: "toonstudio.crdt-tile-sync-snapshot.v1"; readonly scenarioId: CrdtNetworkScenarioId;
  readonly tileGrid: { readonly cols: number; readonly rows: number; readonly tileSizePx: number };
  readonly runtimeBoundary: { readonly networkConnected: false; readonly opfsPersistenceVerified: false; readonly gpuExecutionVerified: false; readonly latencyMeasured: false; readonly conflictClassification: "adjacent-author-250ms-heuristic"; readonly currentKo: string; readonly targetKo: string; readonly currentEn: string; readonly targetEn: string };
  readonly convergence: { readonly allPeersConverged: boolean; readonly activePeerCount: number; readonly canonicalStateHash: string; readonly proof: CrdtConvergenceProof | null };
  readonly transportBreakdown: Readonly<Record<SyncTransportChannel, number>>;
  readonly totalOfflineQueueDepth: number; readonly totalConflictAutoResolved: number;
  readonly coalescing: { readonly inputOpCount: number; readonly coalescedDrawCalls: number; readonly savedDrawCalls: number; readonly coalescingReductionPct: number; readonly optimisticLocalLatencyMs: 0 };
  readonly bandwidthBudget: BandwidthBudgetSummary;
  readonly peers: readonly {
    readonly peerId: PeerId; readonly roleLabelKo: string; readonly transportChannel: SyncTransportChannel;
    readonly isOffline: boolean; readonly offlineQueueDepth: number; readonly appliedOpCount: number;
    readonly duplicateOpsIgnored: number; readonly outOfOrderOpsAccepted: number;
    readonly conflictAutoResolvedCount: number; readonly hlc: string; readonly stateHash: string;
  }[];
  readonly hotTiles: readonly {
    readonly tileKey: TileKey; readonly appliedOpCount: number; readonly visibleLayerCount: number;
    readonly concurrentConflictCount: number; readonly winningAuthorId: PeerId | null; readonly tileDigest: string;
  }[];
}

export const TILE_GRID_COLS = 4;
export const TILE_GRID_ROWS = 4;
export const TILE_SIZE_PX = 256;
export const TILE_RGBA_BYTES = TILE_SIZE_PX * TILE_SIZE_PX * 4;
export const BASE_STUDIO_EPOCH_MS = 1764067200000;
const CONCURRENCY_WINDOW_MS = 250;

export const STUDIO_LAYER_IDS: readonly StudioLayerId[] = ["layer-storyboard", "layer-ink", "layer-color", "layer-sfx-text"];

export const CRDT_PEER_ROLES: readonly CrdtPeerRoleSpec[] = [
  { peerId: "lead-artist", roleLabelKo: "메인 작가", roleLabelEn: "Lead Artist", shortBadgeKo: "메인", shortBadgeEn: "Lead", defaultLayerId: "layer-storyboard", defaultBrushCode: "gpen-0.6", homeTileX: 1, homeTileY: 1 },
  { peerId: "lineart-assist", roleLabelKo: "선화 어시", roleLabelEn: "Lineart Assist", shortBadgeKo: "선화", shortBadgeEn: "Ink", defaultLayerId: "layer-ink", defaultBrushCode: "ink-0.35", homeTileX: 2, homeTileY: 1 },
  { peerId: "color-assist", roleLabelKo: "채색 어시", roleLabelEn: "Color Assist", shortBadgeKo: "채색", shortBadgeEn: "Color", defaultLayerId: "layer-color", defaultBrushCode: "cel-wash-12", homeTileX: 1, homeTileY: 2 },
  { peerId: "lettering-assist", roleLabelKo: "식자 담당", roleLabelEn: "Lettering Assist", shortBadgeKo: "식자", shortBadgeEn: "Type", defaultLayerId: "layer-sfx-text", defaultBrushCode: "sfx-bold-18", homeTileX: 2, homeTileY: 2 },
];

export const CRDT_NETWORK_SCENARIOS: readonly CrdtNetworkScenarioSpec[] = [
  { id: "lan-normal", labelKo: "정상 LAN", labelEn: "Normal LAN", summaryKo: "[가상 시나리오] WebRTC DataChannel 직접 연결 · 순서 보장 · 지연 4ms 기준 동기화", summaryEn: "[Modeled scenario] WebRTC DataChannel direct sync · ordered delivery · 4ms LAN baseline", primaryTransport: "webrtc-datachannel", simulatedRttMs: 4, reorderPackets: false, injectDuplicates: false, partitionedPeers: [] },
  { id: "jitter-reorder", labelKo: "지연·패킷 역전", labelEn: "Jitter & Reorder", summaryKo: "[가상 시나리오] WebSocket Relay 경유 · 68ms 변동 지연 · 역순 도착 및 중복 패킷 주입", summaryEn: "[Modeled scenario] WebSocket Relay path · 68ms jitter · out-of-order and duplicate injection", primaryTransport: "websocket-relay", simulatedRttMs: 68, reorderPackets: true, injectDuplicates: true, partitionedPeers: [] },
  { id: "offline-partition", labelKo: "오프라인 분기 후 재연결", labelEn: "Offline Partition & Reconnect", summaryKo: "[가상 시나리오] 채색·식자 피어를 OPFS Offline Queue로 분리 작업한 뒤 역순·중복 병합으로 재연결", summaryEn: "[Modeled scenario] Partition Color & Type peers on OPFS Offline Queue, then reconcile via reversed merge", primaryTransport: "opfs-offline-queue", simulatedRttMs: 0, reorderPackets: true, injectDuplicates: true, partitionedPeers: ["color-assist", "lettering-assist"] },
  { id: "same-tile-conflict", labelKo: "동일 타일 동시 충돌 테스트", labelEn: "Same-Tile Concurrent Conflict", summaryKo: "[가상 시나리오] 4피어 전원이 같은 256×256 타일(1,1)에 동시 필기 · HLC LWW 무충돌 자동 수렴", summaryEn: "[Modeled scenario] All 4 peers draw on tile (1,1) concurrently · HLC LWW deterministic convergence", primaryTransport: "webrtc-datachannel", simulatedRttMs: 18, reorderPackets: true, injectDuplicates: true, partitionedPeers: [] },
];

export const getPeerRoleSpec = (peerId: PeerId): CrdtPeerRoleSpec =>
  CRDT_PEER_ROLES.find((r) => r.peerId === peerId) ?? CRDT_PEER_ROLES[0];
export const getNetworkScenarioSpec = (id: CrdtNetworkScenarioId): CrdtNetworkScenarioSpec =>
  CRDT_NETWORK_SCENARIOS.find((s) => s.id === id) ?? CRDT_NETWORK_SCENARIOS[0];

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const n = Math.trunc(value);
  return n < min ? min : n > max ? max : n;
}
const round1 = (v: number): number => Math.round(v * 10) / 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;

export const makeTileKey = (tileX: number, tileY: number): TileKey =>
  `tile:${clampInt(tileX, 0, TILE_GRID_COLS - 1)}:${clampInt(tileY, 0, TILE_GRID_ROWS - 1)}`;

export const ALL_TILE_KEYS: readonly TileKey[] = Array.from({ length: TILE_GRID_ROWS * TILE_GRID_COLS }, (_, idx) =>
  makeTileKey(idx % TILE_GRID_COLS, Math.floor(idx / TILE_GRID_COLS)),
);

const emptyLayer = (layerId: StudioLayerId): TileLayerLwwEntry => ({
  layerId, addHlc: null, addOpId: null, addAuthorId: null, addBrushCode: null,
  addStrokeHash: null, addOpacityQ8: 0, removeHlc: null, removeOpId: null, isVisible: false,
});

function isHlcNewer(candHlc: HlcTimestamp, candId: string, curHlc: HlcTimestamp | null, curId: string | null): boolean {
  if (!curHlc || !curId) return true;
  const cmp = compareHlc(candHlc, curHlc);
  return cmp !== 0 ? cmp > 0 : candId > curId;
}

export function reduceTileFromOps(tileX: number, tileY: number, tileOps: readonly TileStrokeOp[]): CrdtTileCellState {
  assertOperationBatch(tileOps);
  const cx = clampInt(tileX, 0, TILE_GRID_COLS - 1);
  const cy = clampInt(tileY, 0, TILE_GRID_ROWS - 1);
  const tileKey = makeTileKey(cx, cy);
  const seen = new Set<string>();
  const deduped: TileStrokeOp[] = [];
  for (const op of tileOps) {
    if (op.tileKey === tileKey && !seen.has(op.opId)) { seen.add(op.opId); deduped.push(op); }
  }
  deduped.sort(compareTileStrokeOp);
  const layerMap: Record<StudioLayerId, TileLayerLwwEntry> = {
    "layer-storyboard": emptyLayer("layer-storyboard"), "layer-ink": emptyLayer("layer-ink"),
    "layer-color": emptyLayer("layer-color"), "layer-sfx-text": emptyLayer("layer-sfx-text"),
  };
  const authorSet = new Set<PeerId>();
  for (const op of deduped) {
    authorSet.add(op.authorId);
    const prev = layerMap[op.layerId];
    if (op.kind === "stroke-erase" && isHlcNewer(op.hlc, op.opId, prev.removeHlc, prev.removeOpId)) {
      layerMap[op.layerId] = { ...prev, removeHlc: op.hlc, removeOpId: op.opId, isVisible: prev.addHlc !== null && compareHlc(prev.addHlc, op.hlc) >= 0 };
    } else if (op.kind !== "stroke-erase" && isHlcNewer(op.hlc, op.opId, prev.addHlc, prev.addOpId)) {
      layerMap[op.layerId] = {
        ...prev, addHlc: op.hlc, addOpId: op.opId, addAuthorId: op.authorId, addBrushCode: op.brushCode,
        addStrokeHash: op.strokeHash, addOpacityQ8: op.opacityQ8, isVisible: prev.removeHlc === null || compareHlc(op.hlc, prev.removeHlc) >= 0,
      };
    }
  }
  let concurrentConflictCount = 0;
  for (let i = 1; i < deduped.length; i += 1) {
    const p = deduped[i - 1];
    const c = deduped[i];
    if (p && c && p.authorId !== c.authorId && Math.abs(c.hlc.physicalMs - p.hlc.physicalMs) <= CONCURRENCY_WINDOW_MS) concurrentConflictCount += 1;
  }
  const winningOp = deduped[deduped.length - 1] ?? null;
  let visibleLayerCount = 0;
  const sigParts = STUDIO_LAYER_IDS.map((lid) => {
    const e = layerMap[lid];
    if (e.isVisible) visibleLayerCount += 1;
    return `${lid}:${e.isVisible ? "1" : "0"}:${e.addOpId ?? "-"}:${e.addStrokeHash ?? "-"}:${e.addOpacityQ8}:${e.removeOpId ?? "-"}`;
  });
  const tileDigest = fnv1a32Hex(`${tileKey}|${sigParts.join("|")}|${deduped.map((o) => `${o.opId}:${o.strokeHash}`).join(",")}`);
  return {
    tileKey, tileX: cx, tileY: cy, appliedOpCount: deduped.length, appliedOpIds: deduped.map((o) => o.opId),
    activeLayers: layerMap, visibleLayerCount, distinctAuthors: Array.from(authorSet).sort(),
    winningHlc: winningOp?.hlc ?? null, winningAuthorId: winningOp?.authorId ?? null,
    winningOpId: winningOp?.opId ?? null, concurrentConflictCount, tileDigest,
  };
}

function buildTilesFromOpLog(opLog: readonly TileStrokeOp[]): Record<TileKey, CrdtTileCellState> {
  const grouped: Record<string, TileStrokeOp[]> = {};
  for (const op of opLog) {
    const list = grouped[op.tileKey];
    if (list) list.push(op); else grouped[op.tileKey] = [op];
  }
  const tiles = {} as Record<TileKey, CrdtTileCellState>;
  for (let y = 0; y < TILE_GRID_ROWS; y += 1) {
    for (let x = 0; x < TILE_GRID_COLS; x += 1) {
      const key = makeTileKey(x, y);
      tiles[key] = reduceTileFromOps(x, y, grouped[key] ?? []);
    }
  }
  return tiles;
}

function buildPeerVectorCounts(opLog: readonly TileStrokeOp[]): Record<PeerId, number> {
  const counts: Record<PeerId, number> = { "lead-artist": 0, "lineart-assist": 0, "color-assist": 0, "lettering-assist": 0 };
  for (const op of opLog) counts[op.authorId] += 1;
  return counts;
}

export const computePeerStateHash = (tiles: Readonly<Record<TileKey, CrdtTileCellState>>): string =>
  `fnv1a-${fnv1a64Hex(ALL_TILE_KEYS.map((k) => `${k}=${tiles[k]?.tileDigest ?? "empty"}`).join(";"))}`;

function computeTotalConflicts(tiles: Readonly<Record<TileKey, CrdtTileCellState>>): number {
  let total = 0;
  for (const k of ALL_TILE_KEYS) total += tiles[k]?.concurrentConflictCount ?? 0;
  return total;
}

const estimateDeltaBytes = (points: number, kind: StrokeOpKind): number => 22 + clampInt(points, 1, 512) * (kind === "tile-fill" ? 1 : 3);
const estimateRawJsonBytes = (points: number): number => 184 + clampInt(points, 1, 512) * 26;

export function createCrdtPeerState(peerId: PeerId, options?: CreateCrdtPeerOptions): CrdtPeerState {
  if (!isPeerId(peerId)) throw new Error("invalid-peer-id");
  const spec = getPeerRoleSpec(peerId);
  const initialPhysicalMs = clampInt(options?.initialPhysicalMs ?? BASE_STUDIO_EPOCH_MS, 0, 9007199254740991);
  const isOffline = options?.isOffline ?? false;
  const transportChannel: SyncTransportChannel = isOffline ? "opfs-offline-queue" : (options?.transportChannel ?? "webrtc-datachannel");
  const tiles = buildTilesFromOpLog([]);
  return {
    peerId, roleLabelKo: spec.roleLabelKo, roleLabelEn: spec.roleLabelEn, defaultLayerId: spec.defaultLayerId,
    clock: { physicalMs: initialPhysicalMs, logical: 0, nodeId: peerId },
    localSeq: 0, transportChannel, isOffline, opLog: [], tiles, offlineOutbox: [], pendingDirtyOps: [],
    peerVectorCounts: buildPeerVectorCounts([]),
    metrics: {
      localOptimisticLatencyMs: 0, localOpsAuthored: 0, remoteOpsMerged: 0, duplicateOpsIgnored: 0,
      outOfOrderOpsAccepted: 0, conflictAutoResolvedCount: 0, rawJsonBytesSent: 0, compressedDeltaBytesSent: 0, lastCoalescedFrame: null,
    },
    stateHash: computePeerStateHash(tiles),
  };
}

export const setPeerNetworkLink = (peer: CrdtPeerState, transportChannel: SyncTransportChannel, isOffline: boolean): CrdtPeerState =>
  ({ ...peer, transportChannel: isOffline ? "opfs-offline-queue" : transportChannel, isOffline });

export function applyLocalStrokeOp(peer: CrdtPeerState, input: LocalStrokeOpInput): LocalStrokeOpResult {
  if (peer.opLog.length >= CRDT_SYNC_LIMITS.maxOps || !Number.isSafeInteger(peer.localSeq + 1)) throw new RangeError("peer-capacity-exceeded");
  const role = getPeerRoleSpec(peer.peerId);
  const tileX = clampInt(input.tileX, 0, TILE_GRID_COLS - 1);
  const tileY = clampInt(input.tileY, 0, TILE_GRID_ROWS - 1);
  const tileKey = makeTileKey(tileX, tileY);
  const layerId = input.layerId ?? peer.defaultLayerId;
  const kind = input.kind ?? "stroke-add";
  const brushCode = input.brushCode ?? role.defaultBrushCode;
  assertLocalStrokeText(brushCode, input.strokeSeed);
  const pointCount = clampInt(input.pointCount ?? 18, 1, 512);
  const opacityQ8 = clampInt(input.opacityQ8 ?? 232, 0, 255);
  const nextSeq = peer.localSeq + 1;
  const nextClock = tickHlcLocal(peer.clock, input.physicalNowMs ?? peer.clock.physicalMs + 1);
  const opId = `${peer.peerId}:${nextSeq}:${nextClock.physicalMs}:${nextClock.logical}`;
  const rawJsonBytes = estimateRawJsonBytes(pointCount);
  const payloadBytes = estimateDeltaBytes(pointCount, kind);
  const op: TileStrokeOp = Object.freeze({
    opId, authorId: peer.peerId, layerId, tileX, tileY, tileKey, hlc: Object.freeze(nextClock), kind, brushCode,
    strokeHash: fnv1a32Hex(`${opId}|${tileKey}|${layerId}|${kind}|${brushCode}|${pointCount}|${opacityQ8}|${input.strokeSeed ?? "std"}`),
    pointCount, opacityQ8, rawJsonBytes, payloadBytes,
  });
  assertTileOp(op);
  const nextOpLog = [...peer.opLog, op].sort(compareTileStrokeOp);
  const nextTiles = buildTilesFromOpLog(nextOpLog);
  const syncPath: SyncTransportChannel = peer.isOffline ? "opfs-offline-queue" : peer.transportChannel;
  const nextPeer: CrdtPeerState = {
    ...peer, clock: nextClock, localSeq: nextSeq, opLog: nextOpLog, tiles: nextTiles,
    offlineOutbox: peer.isOffline ? [...peer.offlineOutbox, op] : peer.offlineOutbox,
    pendingDirtyOps: [...peer.pendingDirtyOps, op], peerVectorCounts: buildPeerVectorCounts(nextOpLog),
    metrics: {
      ...peer.metrics, localOptimisticLatencyMs: 0, localOpsAuthored: peer.metrics.localOpsAuthored + 1,
      conflictAutoResolvedCount: computeTotalConflicts(nextTiles),
      rawJsonBytesSent: peer.metrics.rawJsonBytesSent + rawJsonBytes,
      compressedDeltaBytesSent: peer.metrics.compressedDeltaBytesSent + payloadBytes,
    },
    stateHash: computePeerStateHash(nextTiles),
  };
  return { peer: nextPeer, op, packet: serializeDeltaPacket([op], syncPath), optimisticRenderLatencyMs: 0, syncPath };
}

export function mergeRemoteOps(peer: CrdtPeerState, incomingOps: readonly TileStrokeOp[], options?: MergeRemoteOpsOptions): MergeRemoteOpsResult {
  assertOperationBatch(incomingOps);
  assertOperationBatch(peer.opLog);
  const existingById = new Map(peer.opLog.map((op) => [op.opId, op]));
  for (const op of incomingOps) {
    const existing = existingById.get(op.opId);
    if (existing) assertOperationBatch([existing, op]);
  }
  const existingIds = new Set(existingById.keys());
  let maxSeenHlc: HlcTimestamp | null = peer.opLog[peer.opLog.length - 1]?.hlc ?? null;
  let nextClock = peer.clock;
  const acceptedOps: TileStrokeOp[] = [];
  let duplicateCount = 0;
  let outOfOrderCount = 0;
  const affected = new Set<TileKey>();
  for (const op of incomingOps) {
    if (existingIds.has(op.opId)) { duplicateCount += 1; continue; }
    existingIds.add(op.opId);
    if (maxSeenHlc !== null && compareHlc(op.hlc, maxSeenHlc) < 0) outOfOrderCount += 1;
    if (maxSeenHlc === null || compareHlc(op.hlc, maxSeenHlc) > 0) maxSeenHlc = op.hlc;
    nextClock = receiveHlcRemote(nextClock, op.hlc, options?.physicalNowMs ?? nextClock.physicalMs);
    if (existingIds.size > CRDT_SYNC_LIMITS.maxOps) throw new RangeError("peer-capacity-exceeded");
    acceptedOps.push(Object.freeze({ ...op, hlc: Object.freeze({ ...op.hlc }) }));
    affected.add(op.tileKey);
  }
  const hasNew = acceptedOps.length > 0;
  const nextOpLog = hasNew ? [...peer.opLog, ...acceptedOps].sort(compareTileStrokeOp) : peer.opLog;
  const nextTiles = hasNew ? buildTilesFromOpLog(nextOpLog) : peer.tiles;
  const nextHash = hasNew ? computePeerStateHash(nextTiles) : peer.stateHash;
  const nextPeer: CrdtPeerState = {
    ...peer, clock: nextClock, opLog: nextOpLog, tiles: nextTiles,
    offlineOutbox: options?.clearMatchingOutbox ? peer.offlineOutbox.filter((op) => !incomingOps.some((incoming) => incoming.opId === op.opId)) : peer.offlineOutbox,
    pendingDirtyOps: hasNew ? [...peer.pendingDirtyOps, ...acceptedOps] : peer.pendingDirtyOps,
    peerVectorCounts: hasNew ? buildPeerVectorCounts(nextOpLog) : peer.peerVectorCounts,
    metrics: {
      ...peer.metrics, remoteOpsMerged: peer.metrics.remoteOpsMerged + acceptedOps.length,
      duplicateOpsIgnored: peer.metrics.duplicateOpsIgnored + duplicateCount,
      outOfOrderOpsAccepted: peer.metrics.outOfOrderOpsAccepted + outOfOrderCount,
      conflictAutoResolvedCount: computeTotalConflicts(nextTiles),
    },
    stateHash: nextHash,
  };
  return { peer: nextPeer, acceptedOps, duplicateCount, outOfOrderCount, affectedTileKeys: Array.from(affected).sort(), stateHashChanged: nextHash !== peer.stateHash };
}

export function coalesceDirtyTileFrame(ops: readonly TileStrokeOp[], options?: CoalesceFrameOptions): DirtyTileCoalesceReport {
  assertOperationBatch(ops);
  const frameBudgetMs = options?.targetFps === 120 ? 8.33 : 16.67;
  const seen = new Set<string>();
  const uniqueOps: TileStrokeOp[] = [];
  for (const op of ops) {
    if (!seen.has(op.opId)) { seen.add(op.opId); uniqueOps.push(op); }
  }
  const grouped = new Map<TileKey, TileStrokeOp[]>();
  for (const op of uniqueOps) {
    const list = grouped.get(op.tileKey);
    if (list) list.push(op); else grouped.set(op.tileKey, [op]);
  }
  const dirtyTiles: CoalescedDirtyTile[] = [];
  for (const key of ALL_TILE_KEYS) {
    const bucket = grouped.get(key);
    const sample = bucket?.[0];
    if (!bucket || !sample) continue;
    dirtyTiles.push({
      tileKey: key, tileX: sample.tileX, tileY: sample.tileY, opCount: bucket.length, compositePassCount: 1,
      distinctLayers: Array.from(new Set(bucket.map((o) => o.layerId))).sort(),
      distinctAuthors: Array.from(new Set(bucket.map((o) => o.authorId))).sort(),
      coalescedUploadBytes: TILE_RGBA_BYTES, naiveUploadBytes: bucket.length * TILE_RGBA_BYTES,
    });
  }
  const naiveDrawCalls = uniqueOps.length;
  const coalescedDrawCalls = dirtyTiles.length;
  const savedDrawCalls = Math.max(0, naiveDrawCalls - coalescedDrawCalls);
  const estimatedGpuCompositeMs = round2((coalescedDrawCalls > 0 ? 0.15 : 0) + coalescedDrawCalls * 0.38);
  const naiveGpuCompositeMs = round2((naiveDrawCalls > 0 ? 0.15 : 0) + naiveDrawCalls * 0.38);
  return {
    tileSizePx: TILE_SIZE_PX, inputOpCount: ops.length, uniqueOpCount: uniqueOps.length,
    duplicateInFrameCount: ops.length - uniqueOps.length, naiveDrawCalls, coalescedDrawCalls,
    savedDrawCalls, coalescingReductionPct: naiveDrawCalls > 0 ? round1((savedDrawCalls / naiveDrawCalls) * 100) : 0,
    optimisticLocalLatencyMs: 0, frameBudgetMs, estimatedGpuCompositeMs, naiveGpuCompositeMs,
    withinFrameBudget: estimatedGpuCompositeMs <= frameBudgetMs, measurementKind: "deterministic-tile-model", gpuExecutionVerified: false, latencyMeasured: false, dirtyTiles,
  };
}

export function flushPeerCoalescedFrame(peer: CrdtPeerState, options?: CoalesceFrameOptions): { readonly peer: CrdtPeerState; readonly report: DirtyTileCoalesceReport } {
  const report = coalesceDirtyTileFrame(peer.pendingDirtyOps, options);
  return { peer: { ...peer, pendingDirtyOps: [], metrics: { ...peer.metrics, lastCoalescedFrame: report } }, report };
}

export function calculateBandwidthBudget(ops: readonly TileStrokeOp[], transportChannel: SyncTransportChannel, budgetCapKbps = 512): BandwidthBudgetSummary {
  const packet = serializeDeltaPacket(ops, transportChannel);
  if (!Number.isFinite(budgetCapKbps) || budgetCapKbps < 0) throw new RangeError("invalid-bandwidth-budget");
  const estimatedKbpsAt60Hz = round2((packet.compressedDeltaBytes * 8 * 60) / 1000);
  return {
    accountingKind: "modeled-delta-per-frame-at-60hz",
    transportChannel, totalOps: packet.opCount, rawJsonBytes: packet.rawJsonBytes,
    compressedDeltaBytes: packet.compressedDeltaBytes, fullTileNaiveBytes: packet.fullTileRawBytes,
    jsonSavingsPct: packet.rawJsonBytes > 0 ? round1(((packet.rawJsonBytes - packet.compressedDeltaBytes) / packet.rawJsonBytes) * 100) : 0,
    tileUploadSavingsPct: packet.fullTileRawBytes > 0 ? round1(((packet.fullTileRawBytes - packet.compressedDeltaBytes) / packet.fullTileRawBytes) * 100) : 0,
    estimatedKbpsAt60Hz, budgetCapKbps, withinBudget: estimatedKbpsAt60Hz <= budgetCapKbps,
  };
}

export function createDeterministicReversedDuplicateStream(ops: readonly TileStrokeOp[]): readonly TileStrokeOp[] {
  const out: TileStrokeOp[] = [];
  for (let i = ops.length - 1, idx = 0; i >= 0; i -= 1, idx += 1) {
    const item = ops[i];
    if (!item) continue;
    out.push(item);
    if (idx % 2 === 0) out.push(item);
  }
  return out;
}

export function createClusterForScenario(scenarioId: CrdtNetworkScenarioId, peerCount: 2 | 3 | 4 = 4): readonly CrdtPeerState[] {
  const spec = getNetworkScenarioSpec(scenarioId);
  const roles = CRDT_PEER_ROLES.slice(0, clampInt(peerCount, 2, 4));
  let peers = roles.map((role, idx) => {
    const isPart = spec.partitionedPeers.includes(role.peerId);
    const channel: SyncTransportChannel = isPart ? "opfs-offline-queue" : spec.primaryTransport === "opfs-offline-queue" ? "webrtc-datachannel" : spec.primaryTransport;
    return createCrdtPeerState(role.peerId, { initialPhysicalMs: BASE_STUDIO_EPOCH_MS + idx * 14, transportChannel: channel, isOffline: isPart });
  });
  const seededOps: TileStrokeOp[] = [];
  peers = peers.map((peer, idx) => {
    const role = getPeerRoleSpec(peer.peerId);
    const r = applyLocalStrokeOp(peer, {
      tileX: scenarioId === "same-tile-conflict" ? 1 : role.homeTileX,
      tileY: scenarioId === "same-tile-conflict" ? 1 : role.homeTileY,
      pointCount: 16 + idx * 4, physicalNowMs: BASE_STUDIO_EPOCH_MS + 100 + idx * 18, strokeSeed: `init-${scenarioId}-${idx}`,
    });
    if (!peer.isOffline) seededOps.push(r.op);
    return r.peer;
  });
  const delivery = spec.reorderPackets ? createDeterministicReversedDuplicateStream(seededOps) : seededOps;
  return peers.map((p) => (p.isOffline ? flushPeerCoalescedFrame(p).peer : flushPeerCoalescedFrame(mergeRemoteOps(p, delivery).peer).peer));
}

export function runConcurrentBurstOnCluster(peers: readonly CrdtPeerState[], scenarioId: CrdtNetworkScenarioId, burstCount = 40): CrdtClusterStepResult {
  const spec = getNetworkScenarioSpec(scenarioId);
  const count = clampInt(burstCount, 4, 80);
  const nextPeers = [...peers];
  const onlineOps: TileStrokeOp[] = [];
  const allBurstOps: TileStrokeOp[] = [];
  const hotCoords: readonly (readonly [number, number])[] = scenarioId === "same-tile-conflict" ? [[1, 1], [1, 1], [2, 1], [1, 1]] : [[1, 1], [2, 1], [1, 2], [2, 2]];
  for (let i = 0; i < count; i += 1) {
    const pIdx = i % nextPeers.length;
    const targetPeer = nextPeers[pIdx];
    if (!targetPeer) continue;
    const coord = hotCoords[i % hotCoords.length] ?? [1, 1];
    const res = applyLocalStrokeOp(targetPeer, {
      tileX: coord[0], tileY: coord[1], layerId: scenarioId === "same-tile-conflict" ? "layer-ink" : targetPeer.defaultLayerId,
      pointCount: 14 + (i % 5) * 3, physicalNowMs: targetPeer.clock.physicalMs + 3, strokeSeed: `burst-${scenarioId}-${i}`,
    });
    nextPeers[pIdx] = res.peer;
    allBurstOps.push(res.op);
    if (!targetPeer.isOffline) onlineOps.push(res.op);
  }
  const delivery = spec.reorderPackets ? createDeterministicReversedDuplicateStream(onlineOps) : onlineOps;
  let totalDuplicatesIgnored = 0;
  let totalOutOfOrderAccepted = 0;
  const updated = nextPeers.map((p) => {
    if (p.isOffline) return p;
    const m = mergeRemoteOps(p, delivery);
    totalDuplicatesIgnored += m.duplicateCount;
    totalOutOfOrderAccepted += m.outOfOrderCount;
    return m.peer;
  });
  const coalesceReport = coalesceDirtyTileFrame(allBurstOps);
  const flushed = updated.map((p) => ({ ...p, pendingDirtyOps: [], metrics: { ...p.metrics, lastCoalescedFrame: coalesceReport } }));
  const firstHash = flushed[0]?.stateHash ?? "";
  return { peers: flushed, coalesceReport, totalDuplicatesIgnored, totalOutOfOrderAccepted, allPeersConverged: flushed.every((p) => p.stateHash === firstHash) };
}

export function reconcileClusterOutOfOrder(peers: readonly CrdtPeerState[], targetTransport: SyncTransportChannel = "webrtc-datachannel"): CrdtClusterStepResult {
  const combined = [...collectUniqueOps(peers.flatMap((peer) => [peer.opLog, peer.offlineOutbox]))].sort(compareTileStrokeOp);
  const reversedDup = createDeterministicReversedDuplicateStream(combined);
  const resolvedTransport: SyncTransportChannel = targetTransport === "opfs-offline-queue" ? "webrtc-datachannel" : targetTransport;
  let totalDuplicatesIgnored = 0;
  let totalOutOfOrderAccepted = 0;
  const reconciled = peers.map((peer) => {
    const merged = mergeRemoteOps(setPeerNetworkLink(peer, resolvedTransport, false), reversedDup, { clearMatchingOutbox: true });
    totalDuplicatesIgnored += merged.duplicateCount;
    totalOutOfOrderAccepted += merged.outOfOrderCount;
    return merged.peer;
  });
  const coalesceReport = coalesceDirtyTileFrame(combined);
  const flushed = reconciled.map((p) => ({ ...p, pendingDirtyOps: [], metrics: { ...p.metrics, lastCoalescedFrame: coalesceReport } }));
  const firstHash = flushed[0]?.stateHash ?? "";
  return { peers: flushed, coalesceReport, totalDuplicatesIgnored, totalOutOfOrderAccepted, allPeersConverged: flushed.every((p) => p.stateHash === firstHash) };
}

export function verifyCrdtConvergenceLaws(sourceOps: readonly TileStrokeOp[]): CrdtConvergenceProof {
  const peerIds: readonly PeerId[] = ["lead-artist", "lineart-assist", "color-assist", "lettering-assist"];
  assertOperationBatch(sourceOps);
  const opsToTest = sourceOps;
  const groupA = opsToTest.filter((_, idx) => idx % 3 === 0);
  const groupB = opsToTest.filter((_, idx) => idx % 3 === 1);
  const groupC = opsToTest.filter((_, idx) => idx % 3 === 2);

  const commAB = mergeRemoteOps(mergeRemoteOps(createCrdtPeerState("lead-artist"), groupA).peer, groupB).peer;
  const commBA = mergeRemoteOps(mergeRemoteOps(createCrdtPeerState("lineart-assist"), groupB).peer, groupA).peer;
  const commutativePassed = commAB.stateHash === commBA.stateHash;

  const assocLeft = mergeRemoteOps(mergeRemoteOps(mergeRemoteOps(createCrdtPeerState("lead-artist"), groupA).peer, groupB).peer, groupC).peer;
  const bcMerged = mergeRemoteOps(mergeRemoteOps(createCrdtPeerState("color-assist"), groupB).peer, groupC).peer;
  const assocRight = mergeRemoteOps(mergeRemoteOps(createCrdtPeerState("lettering-assist"), groupA).peer, bcMerged.opLog).peer;
  const associativePassed = assocLeft.stateHash === assocRight.stateHash;

  const idem1 = mergeRemoteOps(createCrdtPeerState("lead-artist"), opsToTest).peer;
  const idem2 = mergeRemoteOps(idem1, opsToTest).peer;
  const idem3 = mergeRemoteOps(idem2, opsToTest).peer;
  const idempotentPassed = idem1.stateHash === idem2.stateHash && idem1.stateHash === idem3.stateHash && idem2.opLog.length === idem1.opLog.length;

  const revDup = createDeterministicReversedDuplicateStream(opsToTest);
  const mid = Math.floor(opsToTest.length / 2);
  const rotated = [...opsToTest.slice(mid), ...opsToTest.slice(0, mid)];
  const deliveries: Record<PeerId, readonly TileStrokeOp[]> = {
    "lead-artist": opsToTest, "lineart-assist": revDup, "color-assist": rotated, "lettering-assist": [...revDup, ...rotated],
  };
  const peerHashes = {} as Record<PeerId, string>;
  for (const pid of peerIds) peerHashes[pid] = mergeRemoteOps(createCrdtPeerState(pid), deliveries[pid]).peer.stateHash;
  const canonicalHash = peerHashes["lead-artist"];
  const outOfOrderAndDuplicatePassed =
    peerIds.every((pid) => peerHashes[pid] === canonicalHash) && assocLeft.stateHash === canonicalHash && idem1.stateHash === canonicalHash;

  return {
    canonicalHash, commutativePassed, associativePassed, idempotentPassed, outOfOrderAndDuplicatePassed,
    allLawsVerified: commutativePassed && associativePassed && idempotentPassed && outOfOrderAndDuplicatePassed,
    peerHashes, verifiedOpCount: opsToTest.length, testedPermutations: 4, verificationScope: "provided-op-set-hash-comparison",
  };
}

export function exportCrdtSyncSnapshotJson(input: {
  readonly scenarioId: CrdtNetworkScenarioId; readonly peers: readonly CrdtPeerState[];
  readonly lastCoalesceReport: DirtyTileCoalesceReport | null; readonly proof: CrdtConvergenceProof | null;
}): { readonly json: string; readonly snapshot: CrdtSyncExportSnapshot } {
  const { scenarioId, peers, lastCoalesceReport, proof } = input;
  const firstHash = peers[0]?.stateHash ?? computePeerStateHash(buildTilesFromOpLog([]));
  const allPeersConverged = peers.length > 0 && peers.every((p) => p.stateHash === firstHash);
  const transportBreakdown: Record<SyncTransportChannel, number> = { "webrtc-datachannel": 0, "websocket-relay": 0, "opfs-offline-queue": 0 };
  let totalOfflineQueueDepth = 0;
  let totalConflictAutoResolved = 0;

  for (const peer of peers) {
    transportBreakdown[peer.transportChannel] += 1;
    totalOfflineQueueDepth += peer.offlineOutbox.length;
    totalConflictAutoResolved = Math.max(totalConflictAutoResolved, peer.metrics.conflictAutoResolvedCount);

  }
  const allUniqueOps = collectUniqueOps(peers.map((peer) => peer.opLog));
  const bandwidthBudget = calculateBandwidthBudget(allUniqueOps, getNetworkScenarioSpec(scenarioId).primaryTransport);
  const coalesce = lastCoalesceReport ?? coalesceDirtyTileFrame(allUniqueOps);
  const primaryPeer = peers[0];
  const hotTiles = ALL_TILE_KEYS.map((k) => primaryPeer?.tiles[k])
    .filter((c): c is CrdtTileCellState => c !== undefined && c.appliedOpCount > 0)
    .map((c) => ({
      tileKey: c.tileKey, appliedOpCount: c.appliedOpCount, visibleLayerCount: c.visibleLayerCount,
      concurrentConflictCount: c.concurrentConflictCount, winningAuthorId: c.winningAuthorId, tileDigest: c.tileDigest,
    }));

  const snapshot: CrdtSyncExportSnapshot = {
    schema: "toonstudio.crdt-tile-sync-snapshot.v1", scenarioId,
    tileGrid: { cols: TILE_GRID_COLS, rows: TILE_GRID_ROWS, tileSizePx: TILE_SIZE_PX },
    runtimeBoundary: {
      networkConnected: false, opfsPersistenceVerified: false, gpuExecutionVerified: false, latencyMeasured: false, conflictClassification: "adjacent-author-250ms-heuristic",
      currentKo: "현재: 브라우저 메모리의 레이어별 최신 메타데이터 LWW 모형·예제 해시 비교·타일 패스/압축량 추정. 실제 전송·OPFS 저장·GPU 실행 없음, 픽셀·필기 데이터 없음",
      targetKo: "목표: 실전 WebRTC DataChannel · Cloudflare Realtime WebSocket Relay · OPFS SQLite 오프라인 영속 큐 자동 연동",
      currentEn: "Current: In-memory per-layer LWW metadata model and sample hash comparison. No network transport, OPFS persistence, GPU execution, pixels or stroke geometry; latency is unmeasured.",
      targetEn: "Target: Production WebRTC DataChannel, Cloudflare Realtime WebSocket Relay, and OPFS SQLite offline queue persistence",
    },
    convergence: { allPeersConverged, activePeerCount: peers.length, canonicalStateHash: firstHash, proof },
    transportBreakdown, totalOfflineQueueDepth, totalConflictAutoResolved,
    coalescing: {
      inputOpCount: coalesce.inputOpCount, coalescedDrawCalls: coalesce.coalescedDrawCalls,
      savedDrawCalls: coalesce.savedDrawCalls, coalescingReductionPct: coalesce.coalescingReductionPct, optimisticLocalLatencyMs: 0,
    },
    bandwidthBudget,
    peers: peers.map((p) => ({
      peerId: p.peerId, roleLabelKo: p.roleLabelKo, transportChannel: p.transportChannel,
      isOffline: p.isOffline, offlineQueueDepth: p.offlineOutbox.length, appliedOpCount: p.opLog.length,
      duplicateOpsIgnored: p.metrics.duplicateOpsIgnored, outOfOrderOpsAccepted: p.metrics.outOfOrderOpsAccepted,
      conflictAutoResolvedCount: p.metrics.conflictAutoResolvedCount, hlc: formatHlc(p.clock), stateHash: p.stateHash,
    })),
    hotTiles,
  };
  return { json: JSON.stringify(snapshot, null, 2), snapshot };
}
