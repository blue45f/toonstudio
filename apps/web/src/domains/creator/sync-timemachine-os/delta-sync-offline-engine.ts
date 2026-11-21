/**
 * 글로벌 대용량 원고·3D 에셋 차분 동기화(256KB Content-Addressed Delta Sync),
 * 고지연 오프라인 큐 + 3-way 벡터 클록 충돌 해소, 크래시 제로 타임머신 스냅샷 엔진.
 */

export const DELTA_CHUNK_SIZE_BYTES = 262_144; // 256 KiB 고정 결정론 청크
export const JOURNAL_INTERVAL_SECONDS = 60;

export type SyncAssetKind = "manuscript-psd" | "scene-3d-glb" | "panel-layers" | "texture-atlas";
export type VectorClock = Readonly<Record<string, number>>;
export type VectorClockRelation = "equal" | "before" | "after" | "concurrent";
export type OfflineQueueStatus = "queued" | "retrying" | "synced" | "conflict-branched";
export type SnapshotTriggerKind =
  | "auto-60s-journal"
  | "manual-release-tag"
  | "emergency-memory-pressure"
  | "emergency-webgpu-lost"
  | "pre-rollback-safety";

export interface GlobalRegionProfile {
  readonly id: "kr-seoul" | "sea-singapore" | "us-west" | "eu-frankfurt" | "sea-remote";
  readonly labelKo: string;
  readonly rttMs: number;
  readonly uplinkMbps: number;
}

export const GLOBAL_REGION_PROFILES: readonly GlobalRegionProfile[] = Object.freeze([
  { id: "kr-seoul", labelKo: "서울 로컬 허브 (22ms)", rttMs: 22, uplinkMbps: 180 },
  { id: "sea-singapore", labelKo: "동남아 싱가포르 (285ms)", rttMs: 285, uplinkMbps: 42 },
  { id: "us-west", labelKo: "북미 서부 로스앤젤레스 (225ms)", rttMs: 225, uplinkMbps: 65 },
  { id: "eu-frankfurt", labelKo: "유럽 프랑크푸르트 (350ms)", rttMs: 350, uplinkMbps: 48 },
  { id: "sea-remote", labelKo: "해외 원격 로밍 회선 (430ms)", rttMs: 430, uplinkMbps: 18 },
]);

export interface ChunkDescriptor {
  readonly index: number;
  readonly offsetBytes: number;
  readonly byteLength: number;
  readonly hash: string;
}

export interface ContentAddressedAsset {
  readonly assetId: string;
  readonly labelKo: string;
  readonly kind: SyncAssetKind;
  readonly totalBytes: number;
  readonly chunks: readonly ChunkDescriptor[];
}

export interface DeltaTransferPlan {
  readonly assetId: string;
  readonly totalBytes: number;
  readonly totalChunks: number;
  readonly unchangedChunks: number;
  readonly dirtyChunks: readonly ChunkDescriptor[];
  readonly transferBytes: number;
  readonly savedBytes: number;
  readonly bandwidthSavingPct: number;
  readonly estimatedMsAtRtt: number;
}

export interface SyncLayerSlice {
  readonly cutId: string;
  readonly layerId: string;
  readonly layerName: string;
  readonly revision: number;
  readonly byteLength: number;
  readonly contentSeed: string;
  readonly updatedAtIso: string;
  readonly authorId: string;
}

export interface OfflineQueueEntry {
  readonly opId: string;
  readonly assetId: string;
  readonly cutId: string;
  readonly layerId: string;
  readonly layerName: string;
  readonly authorId: string;
  readonly clientClock: VectorClock;
  readonly payloadBytes: number;
  readonly contentSeed: string;
  readonly attemptCount: number;
  readonly nextRetryDelayMs: number;
  readonly status: OfflineQueueStatus;
  readonly queuedAtIso: string;
  readonly resolvedBranchName: string | null;
}

export interface ThreeWayConflictBranch {
  readonly branchId: string;
  readonly cutId: string;
  readonly layerId: string;
  readonly localAuthorId: string;
  readonly remoteAuthorId: string;
  readonly localSeed: string;
  readonly remoteSeed: string;
  readonly baseSeed: string;
  readonly createdAtIso: string;
  readonly summaryKo: string;
}

export interface ThreeWayMergeOutcome {
  readonly mergedLayers: readonly SyncLayerSlice[];
  readonly autoMergedCount: number;
  readonly conflictBranches: readonly ThreeWayConflictBranch[];
  readonly mergedClock: VectorClock;
  readonly statusKo: string;
}

export interface TimeMachineSnapshot {
  readonly snapshotId: string;
  readonly createdAtIso: string;
  readonly trigger: SnapshotTriggerKind;
  readonly releaseTag: string | null;
  readonly noteKo: string;
  readonly totalBytes: number;
  readonly layerCount: number;
  readonly cutCount: number;
  readonly contentRootHash: string;
  readonly layers: readonly SyncLayerSlice[];
}

export interface SnapshotLayerModification {
  readonly cutId: string;
  readonly layerId: string;
  readonly layerName: string;
  readonly beforeBytes: number;
  readonly afterBytes: number;
  readonly byteDelta: number;
}

export interface SnapshotDiffSummary {
  readonly fromSnapshotId: string;
  readonly toSnapshotId: string;
  readonly addedLayers: readonly SyncLayerSlice[];
  readonly removedLayers: readonly SyncLayerSlice[];
  readonly modifiedLayers: readonly SnapshotLayerModification[];
  readonly changedCutIds: readonly string[];
  readonly byteDelta: number;
  readonly summaryKo: string;
}

export interface CrashGuardSignal {
  readonly kind: "memory-pressure" | "webgpu-context-lost";
  readonly heapUsagePct?: number;
  readonly gpuDeviceLabel?: string;
  readonly detectedAtIso: string;
}

export interface TimeMachineTimelineState {
  readonly projectId: string;
  readonly journalIntervalSec: number;
  readonly activeSnapshotId: string;
  readonly currentLayers: readonly SyncLayerSlice[];
  readonly snapshots: readonly TimeMachineSnapshot[];
  readonly emergencyRecoveryCount: number;
}

export interface SyncWorkspaceAssetPreset {
  readonly assetId: string;
  readonly labelKo: string;
  readonly kind: SyncAssetKind;
  readonly totalBytes: number;
  readonly baseSeed: string;
  readonly initialDirtyChunks: readonly number[];
}

export interface SyncTimeMachineSeedState {
  readonly projectId: string;
  readonly assets: readonly SyncWorkspaceAssetPreset[];
  readonly baseLayers: readonly SyncLayerSlice[];
  readonly remoteLayers: readonly SyncLayerSlice[];
  readonly baseClock: VectorClock;
  readonly remoteClock: VectorClock;
  readonly timeline: TimeMachineTimelineState;
}

export interface ChunkAssetInput {
  readonly assetId: string;
  readonly labelKo: string;
  readonly kind: SyncAssetKind;
  readonly totalBytes: number;
  readonly baseSeed: string;
  readonly dirtyChunkIndices?: readonly number[];
  readonly dirtyRevisionTag?: string;
}

export type EnqueueOfflineOpInput = Omit<
  OfflineQueueEntry,
  "attemptCount" | "nextRetryDelayMs" | "status" | "resolvedBranchName"
>;

export interface ThreeWayMergeParams {
  readonly baseLayers: readonly SyncLayerSlice[];
  readonly localLayers: readonly SyncLayerSlice[];
  readonly remoteLayers: readonly SyncLayerSlice[];
  readonly baseClock: VectorClock;
  readonly localClock: VectorClock;
  readonly remoteClock: VectorClock;
  readonly nowIso: string;
}

export interface FlushOfflineQueueParams {
  readonly queue: readonly OfflineQueueEntry[];
  readonly baseLayers: readonly SyncLayerSlice[];
  readonly remoteLayers: readonly SyncLayerSlice[];
  readonly baseClock: VectorClock;
  readonly remoteClock: VectorClock;
  readonly region: GlobalRegionProfile;
  readonly networkHealthy: boolean;
  readonly nowIso: string;
}

export interface FlushOfflineQueueResult {
  readonly nextQueue: readonly OfflineQueueEntry[];
  readonly mergedLayers: readonly SyncLayerSlice[];
  readonly conflictBranches: readonly ThreeWayConflictBranch[];
  readonly syncedCount: number;
  readonly retriedCount: number;
  readonly mergedClock: VectorClock;
}

export interface CreateSnapshotParams {
  readonly snapshots: readonly TimeMachineSnapshot[];
  readonly layers: readonly SyncLayerSlice[];
  readonly trigger: SnapshotTriggerKind;
  readonly releaseTag?: string | null;
  readonly noteKo: string;
  readonly nowIso: string;
}

export interface RollbackSnapshotResult {
  readonly nextTimeline: TimeMachineTimelineState;
  readonly safetySnapshot: TimeMachineSnapshot;
  readonly restoredSnapshot: TimeMachineSnapshot;
}

export interface EmergencyRecoveryResult {
  readonly nextTimeline: TimeMachineTimelineState;
  readonly emergencySnapshot: TimeMachineSnapshot;
  readonly recoveryMessageKo: string;
}

function fnv1a32(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash >>> 0;
}

function layerKey(layer: Pick<SyncLayerSlice, "cutId" | "layerId">): string {
  return `${layer.cutId}::${layer.layerId}`;
}

function cloneFrozenLayer(layer: SyncLayerSlice): SyncLayerSlice {
  return Object.freeze({ ...layer });
}

function mergeVectorClocks(a: VectorClock, b: VectorClock): VectorClock {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const merged: Record<string, number> = {};
  for (const key of keys) merged[key] = Math.max(a[key] ?? 0, b[key] ?? 0);
  return Object.freeze(merged);
}

/** 256KB 청크의 콘텐츠 주소를 결정론적으로 계산한다(외부 런타임 의존 없음). */
export function hashChunkDeterministic(seed: string, chunkIndex: number, salt = "v1"): string {
  const hi = fnv1a32(`${seed}|${chunkIndex}|${salt}`, 0x811c9dc5).toString(16).padStart(8, "0");
  const lo = fnv1a32(`${salt}:${chunkIndex}:${seed}`, 0x9e3779b1).toString(16).padStart(8, "0");
  return `ca256-${hi}${lo}`;
}

/** 100MB~500MB 원고·3D 에셋을 256KB 결정론 청크 매니페스트로 분할한다. */
export function chunkLargeAssetDeterministically(input: ChunkAssetInput): ContentAddressedAsset {
  const safeTotalBytes = Math.max(1, Math.floor(input.totalBytes));
  const chunkCount = Math.ceil(safeTotalBytes / DELTA_CHUNK_SIZE_BYTES);
  const dirtySet = new Set(input.dirtyChunkIndices ?? []);
  const dirtyTag = input.dirtyRevisionTag ?? "dirty-r1";
  const chunks: ChunkDescriptor[] = [];

  for (let index = 0; index < chunkCount; index += 1) {
    const offsetBytes = index * DELTA_CHUNK_SIZE_BYTES;
    const byteLength = Math.min(DELTA_CHUNK_SIZE_BYTES, safeTotalBytes - offsetBytes);
    const hash = hashChunkDeterministic(input.baseSeed, index, dirtySet.has(index) ? dirtyTag : "base");
    chunks.push(Object.freeze({ index, offsetBytes, byteLength, hash }));
  }

  return Object.freeze({
    assetId: input.assetId,
    labelKo: input.labelKo,
    kind: input.kind,
    totalBytes: safeTotalBytes,
    chunks: Object.freeze(chunks),
  });
}

/** 기준 매니페스트와 신규 매니페스트를 비교해 실제 전송 청크·대역폭 절감률을 산출한다. */
export function computeDeltaTransferPlan(
  baseAsset: ContentAddressedAsset,
  nextAsset: ContentAddressedAsset,
  region: GlobalRegionProfile,
): DeltaTransferPlan {
  const baseHashesByIndex = new Map<number, string>();
  const baseHashPool = new Set<string>();
  for (const chunk of baseAsset.chunks) {
    baseHashesByIndex.set(chunk.index, chunk.hash);
    baseHashPool.add(chunk.hash);
  }

  const dirtyChunks: ChunkDescriptor[] = [];
  let transferBytes = 0;
  let unchangedChunks = 0;

  for (const chunk of nextAsset.chunks) {
    if (baseHashesByIndex.get(chunk.index) === chunk.hash || baseHashPool.has(chunk.hash)) {
      unchangedChunks += 1;
    } else {
      dirtyChunks.push(chunk);
      transferBytes += chunk.byteLength;
    }
  }

  const savedBytes = Math.max(0, nextAsset.totalBytes - transferBytes);
  const rawSavingPct = nextAsset.totalBytes > 0 ? (savedBytes / nextAsset.totalBytes) * 100 : 0;
  const bandwidthSavingPct = Math.round(rawSavingPct * 10) / 10;
  const pipelineBatches = dirtyChunks.length === 0 ? 1 : Math.ceil(dirtyChunks.length / 8);
  const bytesPerMs = Math.max(1, (region.uplinkMbps * 125_000) / 1000);
  const estimatedMsAtRtt = Math.round(
    region.rttMs * (1 + Math.min(pipelineBatches, 6) * 0.45) + transferBytes / bytesPerMs,
  );

  return Object.freeze({
    assetId: nextAsset.assetId,
    totalBytes: nextAsset.totalBytes,
    totalChunks: nextAsset.chunks.length,
    unchangedChunks,
    dirtyChunks: Object.freeze(dirtyChunks),
    transferBytes,
    savedBytes,
    bandwidthSavingPct,
    estimatedMsAtRtt,
  });
}

/** 두 벡터 클록의 인과 관계(equal / before / after / concurrent)를 판정한다. */
export function compareVectorClocks(left: VectorClock, right: VectorClock): VectorClockRelation {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  let leftGreater = false;
  let rightGreater = false;
  for (const key of keys) {
    const lVal = left[key] ?? 0;
    const rVal = right[key] ?? 0;
    if (lVal > rVal) leftGreater = true;
    if (rVal > lVal) rightGreater = true;
  }
  if (!leftGreater && !rightGreater) return "equal";
  if (leftGreater && !rightGreater) return "after";
  if (!leftGreater && rightGreater) return "before";
  return "concurrent";
}

/** 해외 고지연(200~450ms) 회선을 고려한 지수 백오프 대기 시간(ms)을 계산한다. */
export function computeExponentialBackoffMs(attemptCount: number, rttMs: number, maxDelayMs = 30_000): number {
  const safeAttempt = Math.max(1, Math.floor(attemptCount));
  const baseFloorMs = Math.max(400, Math.round(rttMs * 2));
  return Math.min(maxDelayMs, baseFloorMs * 2 ** (safeAttempt - 1));
}

/** 오프라인 상태에서 발생한 컷·레이어 변경을 안전 큐에 불변 적재한다. */
export function enqueueOfflineDeltaOp(
  queue: readonly OfflineQueueEntry[],
  op: EnqueueOfflineOpInput,
  rttMs: number,
): readonly OfflineQueueEntry[] {
  const nextEntry: OfflineQueueEntry = Object.freeze({
    ...op,
    attemptCount: 0,
    nextRetryDelayMs: computeExponentialBackoffMs(1, rttMs),
    status: "queued",
    resolvedBranchName: null,
  });
  const existingIdx = queue.findIndex((entry) => entry.opId === op.opId);
  if (existingIdx >= 0) {
    const updated = [...queue];
    updated[existingIdx] = nextEntry;
    return Object.freeze(updated);
  }
  return Object.freeze([...queue, nextEntry]);
}

/** 컷·레이어 단위 3-way 벡터 클록 병합을 수행하고 동시 충돌 시 무손실 안전 브랜치를 자동 생성한다. */
export function mergeLayersThreeWay(params: ThreeWayMergeParams): ThreeWayMergeOutcome {
  const baseMap = new Map(params.baseLayers.map((layer) => [layerKey(layer), layer]));
  const localMap = new Map(params.localLayers.map((layer) => [layerKey(layer), layer]));
  const remoteMap = new Map(params.remoteLayers.map((layer) => [layerKey(layer), layer]));
  const allKeys = [...new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()])].sort();

  const clockRelation = compareVectorClocks(params.localClock, params.remoteClock);
  const mergedLayers: SyncLayerSlice[] = [];
  const conflictBranches: ThreeWayConflictBranch[] = [];
  let autoMergedCount = 0;

  for (const key of allKeys) {
    const base = baseMap.get(key);
    const local = localMap.get(key);
    const remote = remoteMap.get(key);

    if (local && !remote) {
      mergedLayers.push(cloneFrozenLayer(local));
      if (!base || base.contentSeed !== local.contentSeed) autoMergedCount += 1;
      continue;
    }
    if (remote && !local) {
      mergedLayers.push(cloneFrozenLayer(remote));
      if (!base || base.contentSeed !== remote.contentSeed) autoMergedCount += 1;
      continue;
    }
    if (!local || !remote) continue;

    if (local.contentSeed === remote.contentSeed) {
      mergedLayers.push(cloneFrozenLayer(local.revision >= remote.revision ? local : remote));
      continue;
    }

    const localChanged = !base || base.contentSeed !== local.contentSeed;
    const remoteChanged = !base || base.contentSeed !== remote.contentSeed;

    if ((localChanged && !remoteChanged) || (localChanged && remoteChanged && clockRelation === "after")) {
      mergedLayers.push(cloneFrozenLayer(local));
      autoMergedCount += 1;
      continue;
    }
    if ((!localChanged && remoteChanged) || (localChanged && remoteChanged && clockRelation === "before")) {
      mergedLayers.push(cloneFrozenLayer(remote));
      autoMergedCount += 1;
      continue;
    }

    mergedLayers.push(cloneFrozenLayer(remote));
    const safeTag = hashChunkDeterministic(`${local.contentSeed}:${remote.contentSeed}`, conflictBranches.length, "cb").slice(6, 12);
    const branchId = `safe-branch/${local.cutId}-${local.layerId}-${local.authorId}-${safeTag}`;
    conflictBranches.push(
      Object.freeze({
        branchId,
        cutId: local.cutId,
        layerId: local.layerId,
        localAuthorId: local.authorId,
        remoteAuthorId: remote.authorId,
        localSeed: local.contentSeed,
        remoteSeed: remote.contentSeed,
        baseSeed: base?.contentSeed ?? "empty",
        createdAtIso: params.nowIso,
        summaryKo: `${local.cutId} · ${local.layerName} 동시 수정 감지 — 원격 유지 및 안전 브랜치(${branchId}) 자동 보존`,
      }),
    );
  }

  const mergedClock = mergeVectorClocks(mergeVectorClocks(params.baseClock, params.localClock), params.remoteClock);
  const statusKo =
    conflictBranches.length > 0
      ? `자동 병합 ${autoMergedCount}건 완료 · 동시 충돌 ${conflictBranches.length}건 안전 브랜치 보존`
      : `충돌 없음 · 컷·레이어 ${autoMergedCount}건 무손실 병합 완료`;

  return Object.freeze({
    mergedLayers: Object.freeze(mergedLayers),
    autoMergedCount,
    conflictBranches: Object.freeze(conflictBranches),
    mergedClock,
    statusKo,
  });
}

/** 재연결 시 오프라인 큐를 지수 백오프 또는 3-way 충돌 해소 흐름으로 처리한다. */
export function flushOfflineQueueOnReconnect(params: FlushOfflineQueueParams): FlushOfflineQueueResult {
  const pending = params.queue.filter((entry) => entry.status === "queued" || entry.status === "retrying");
  if (pending.length === 0) {
    return Object.freeze({
      nextQueue: params.queue,
      mergedLayers: params.remoteLayers,
      conflictBranches: Object.freeze([]),
      syncedCount: 0,
      retriedCount: 0,
      mergedClock: params.remoteClock,
    });
  }

  if (!params.networkHealthy) {
    let retriedCount = 0;
    const nextQueue = params.queue.map((entry) => {
      if (entry.status !== "queued" && entry.status !== "retrying") return entry;
      retriedCount += 1;
      const attemptCount = entry.attemptCount + 1;
      return Object.freeze({
        ...entry,
        attemptCount,
        nextRetryDelayMs: computeExponentialBackoffMs(attemptCount, params.region.rttMs),
        status: "retrying" as const,
      });
    });
    return Object.freeze({
      nextQueue: Object.freeze(nextQueue),
      mergedLayers: params.remoteLayers,
      conflictBranches: Object.freeze([]),
      syncedCount: 0,
      retriedCount,
      mergedClock: params.remoteClock,
    });
  }

  const localLayerMap = new Map(params.baseLayers.map((layer) => [layerKey(layer), layer]));
  let localClock: VectorClock = params.baseClock;

  for (const op of pending) {
    const key = layerKey(op);
    const prev = localLayerMap.get(key);
    localLayerMap.set(
      key,
      Object.freeze({
        cutId: op.cutId,
        layerId: op.layerId,
        layerName: op.layerName,
        revision: (prev?.revision ?? 0) + 1,
        byteLength: op.payloadBytes,
        contentSeed: op.contentSeed,
        updatedAtIso: op.queuedAtIso,
        authorId: op.authorId,
      }),
    );
    localClock = mergeVectorClocks(localClock, op.clientClock);
  }

  const mergeResult = mergeLayersThreeWay({
    baseLayers: params.baseLayers,
    localLayers: [...localLayerMap.values()],
    remoteLayers: params.remoteLayers,
    baseClock: params.baseClock,
    localClock,
    remoteClock: params.remoteClock,
    nowIso: params.nowIso,
  });

  const branchByKey = new Map(mergeResult.conflictBranches.map((branch) => [`${branch.cutId}::${branch.layerId}`, branch.branchId]));
  let syncedCount = 0;
  const nextQueue = params.queue.map((entry) => {
    if (entry.status !== "queued" && entry.status !== "retrying") return entry;
    const branchId = branchByKey.get(layerKey(entry)) ?? null;
    if (branchId) {
      return Object.freeze({
        ...entry,
        attemptCount: entry.attemptCount + 1,
        status: "conflict-branched" as const,
        resolvedBranchName: branchId,
      });
    }
    syncedCount += 1;
    return Object.freeze({ ...entry, attemptCount: entry.attemptCount + 1, status: "synced" as const, resolvedBranchName: null });
  });

  return Object.freeze({
    nextQueue: Object.freeze(nextQueue),
    mergedLayers: mergeResult.mergedLayers,
    conflictBranches: mergeResult.conflictBranches,
    syncedCount,
    retriedCount: 0,
    mergedClock: mergeResult.mergedClock,
  });
}

function computeLayersRootHash(layers: readonly SyncLayerSlice[]): string {
  const canonical = [...layers]
    .sort((a, b) => layerKey(a).localeCompare(layerKey(b)))
    .map((layer) => `${layer.cutId}:${layer.layerId}:${layer.revision}:${layer.byteLength}:${layer.contentSeed}`)
    .join("|");
  return hashChunkDeterministic(canonical || "empty-layers", layers.length, "snap");
}

/** 60초 자동 저널·릴리즈 태그·비상 복구용 불변 타임머신 스냅샷을 생성한다. */
export function createTimeMachineSnapshot(params: CreateSnapshotParams): TimeMachineSnapshot {
  const frozenLayers = Object.freeze(params.layers.map(cloneFrozenLayer));
  const totalBytes = frozenLayers.reduce((sum, layer) => sum + layer.byteLength, 0);
  const cutCount = new Set(frozenLayers.map((layer) => layer.cutId)).size;
  const contentRootHash = computeLayersRootHash(frozenLayers);
  const seq = params.snapshots.length + 1;
  const normalizedTag = params.releaseTag?.trim() ? params.releaseTag.trim() : null;

  return Object.freeze({
    snapshotId: `snap-${String(seq).padStart(4, "0")}-${contentRootHash.slice(6, 12)}`,
    createdAtIso: params.nowIso,
    trigger: params.trigger,
    releaseTag: normalizedTag,
    noteKo: params.noteKo,
    totalBytes,
    layerCount: frozenLayers.length,
    cutCount,
    contentRootHash,
    layers: frozenLayers,
  });
}

/** 두 스냅샷 사이의 추가·삭제·수정 레이어, 변경 컷, 바이트 델타를 비교 산출한다. */
export function diffTimeMachineSnapshots(
  fromSnapshot: TimeMachineSnapshot,
  toSnapshot: TimeMachineSnapshot,
): SnapshotDiffSummary {
  const fromMap = new Map(fromSnapshot.layers.map((layer) => [layerKey(layer), layer]));
  const toMap = new Map(toSnapshot.layers.map((layer) => [layerKey(layer), layer]));
  const addedLayers: SyncLayerSlice[] = [];
  const removedLayers: SyncLayerSlice[] = [];
  const modifiedLayers: SnapshotLayerModification[] = [];
  const changedCuts = new Set<string>();

  for (const [key, toLayer] of toMap.entries()) {
    const fromLayer = fromMap.get(key);
    if (!fromLayer) {
      addedLayers.push(cloneFrozenLayer(toLayer));
      changedCuts.add(toLayer.cutId);
    } else if (fromLayer.contentSeed !== toLayer.contentSeed || fromLayer.byteLength !== toLayer.byteLength) {
      modifiedLayers.push(
        Object.freeze({
          cutId: toLayer.cutId,
          layerId: toLayer.layerId,
          layerName: toLayer.layerName,
          beforeBytes: fromLayer.byteLength,
          afterBytes: toLayer.byteLength,
          byteDelta: toLayer.byteLength - fromLayer.byteLength,
        }),
      );
      changedCuts.add(toLayer.cutId);
    }
  }

  for (const [key, fromLayer] of fromMap.entries()) {
    if (!toMap.has(key)) {
      removedLayers.push(cloneFrozenLayer(fromLayer));
      changedCuts.add(fromLayer.cutId);
    }
  }

  const byteDelta = toSnapshot.totalBytes - fromSnapshot.totalBytes;
  const deltaKb = Math.round((byteDelta / 1024) * 10) / 10;
  const signedDeltaLabel = `${deltaKb >= 0 ? "+" : ""}${deltaKb} KB`;
  const changedCutIds = Object.freeze([...changedCuts].sort());
  const summaryKo =
    addedLayers.length === 0 && removedLayers.length === 0 && modifiedLayers.length === 0
      ? "두 스냅샷의 레이어와 바이트가 완전히 일치합니다."
      : `추가 ${addedLayers.length} · 삭제 ${removedLayers.length} · 수정 ${modifiedLayers.length} (영향 컷 ${changedCutIds.length}개 · ${signedDeltaLabel})`;

  return Object.freeze({
    fromSnapshotId: fromSnapshot.snapshotId,
    toSnapshotId: toSnapshot.snapshotId,
    addedLayers: Object.freeze(addedLayers),
    removedLayers: Object.freeze(removedLayers),
    modifiedLayers: Object.freeze(modifiedLayers),
    changedCutIds,
    byteDelta,
    summaryKo,
  });
}

/** 과거 스냅샷으로 원클릭 복원한다(직전 상태는 `pre-rollback-safety` 불변 백업으로 먼저 기록). */
export function rollbackToTimeMachineSnapshot(
  timeline: TimeMachineTimelineState,
  targetSnapshotId: string,
  nowIso: string,
): RollbackSnapshotResult {
  const target = timeline.snapshots.find((snap) => snap.snapshotId === targetSnapshotId);
  if (!target) throw new Error(`복원 대상 스냅샷(${targetSnapshotId})을 찾을 수 없습니다.`);

  const safetySnapshot = createTimeMachineSnapshot({
    snapshots: timeline.snapshots,
    layers: timeline.currentLayers,
    trigger: "pre-rollback-safety",
    releaseTag: null,
    noteKo: `${target.releaseTag ?? target.snapshotId} 복원 직전 자동 안전 백업`,
    nowIso,
  });
  const nextTimeline: TimeMachineTimelineState = Object.freeze({
    ...timeline,
    activeSnapshotId: target.snapshotId,
    currentLayers: Object.freeze(target.layers.map(cloneFrozenLayer)),
    snapshots: Object.freeze([...timeline.snapshots, safetySnapshot]),
  });

  return Object.freeze({ nextTimeline, safetySnapshot, restoredSnapshot: target });
}

/** 메모리 압박 또는 WebGPU 컨텍스트 손실 감지 시 즉시 비상 스냅샷을 영구 기록한다. */
export function handleCrashZeroEmergencySignal(
  timeline: TimeMachineTimelineState,
  signal: CrashGuardSignal,
): EmergencyRecoveryResult {
  const isMemory = signal.kind === "memory-pressure";
  const trigger: SnapshotTriggerKind = isMemory ? "emergency-memory-pressure" : "emergency-webgpu-lost";
  const detailKo = isMemory
    ? `메모리 사용량 ${signal.heapUsagePct ?? 92}% 임계치 도달 — 비상 스냅샷 즉시 보존`
    : `WebGPU 장치(${signal.gpuDeviceLabel ?? "primary-gpu"}) 컨텍스트 손실 감지 — 캔버스 상태 비상 보존`;

  const emergencySnapshot = createTimeMachineSnapshot({
    snapshots: timeline.snapshots,
    layers: timeline.currentLayers,
    trigger,
    releaseTag: null,
    noteKo: detailKo,
    nowIso: signal.detectedAtIso,
  });
  const nextTimeline: TimeMachineTimelineState = Object.freeze({
    ...timeline,
    activeSnapshotId: emergencySnapshot.snapshotId,
    snapshots: Object.freeze([...timeline.snapshots, emergencySnapshot]),
    emergencyRecoveryCount: timeline.emergencyRecoveryCount + 1,
  });

  return Object.freeze({ nextTimeline, emergencySnapshot, recoveryMessageKo: `${detailKo} (${emergencySnapshot.snapshotId})` });
}

/** 바이트 크기를 읽기 쉬운 MB/KB 단위로 표시한다. */
export function formatByteSizeLabel(bytes: number): string {
  const abs = Math.abs(bytes);
  const sign = bytes < 0 ? "-" : "";
  if (abs >= 1_048_576) return `${sign}${(abs / 1_048_576).toFixed(1)} MB`;
  if (abs >= 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`;
  return `${sign}${abs} B`;
}

/** 프로젝트별 초기 차분 동기화·타임머신 작업실 시드를 생성한다. */
export function createSyncTimeMachineWorkspaceSeed(projectId: string): SyncTimeMachineSeedState {
  const assets: readonly SyncWorkspaceAssetPreset[] = Object.freeze([
    {
      assetId: `${projectId}-ep12-manuscript`,
      labelKo: "12화 본편 원고 PSD (180 MB)",
      kind: "manuscript-psd",
      totalBytes: 180 * 1_048_576,
      baseSeed: `${projectId}:ep12:manuscript:v1`,
      initialDirtyChunks: [14, 15, 16, 128, 129, 402],
    },
    {
      assetId: `${projectId}-school-courtyard-3d`,
      labelKo: "학교 교정 3D 배경 GLB (320 MB)",
      kind: "scene-3d-glb",
      totalBytes: 320 * 1_048_576,
      baseSeed: `${projectId}:bg3d:courtyard:v3`,
      initialDirtyChunks: [8, 9, 512, 513, 514, 980, 981, 1024],
    },
  ]);

  const baseLayers: readonly SyncLayerSlice[] = Object.freeze([
    { cutId: "cut-01", layerId: "line-main", layerName: "주인공 선화", revision: 4, byteLength: 18_432_000, contentSeed: "ep12-c01-line-v4", updatedAtIso: "2026-11-21T09:10:00Z", authorId: "author-lead" },
    { cutId: "cut-02", layerId: "color-flat", layerName: "기본 채색 밑색", revision: 3, byteLength: 26_214_400, contentSeed: "ep12-c02-flat-v3", updatedAtIso: "2026-11-21T09:15:00Z", authorId: "assist-color" },
    { cutId: "cut-05", layerId: "bg-3d-bake", layerName: "교정 3D 배경 베이크", revision: 2, byteLength: 48_234_496, contentSeed: "ep12-c05-bg3d-v2", updatedAtIso: "2026-11-21T09:20:00Z", authorId: "bg3d-artist" },
    { cutId: "cut-08", layerId: "sfx-bubble", layerName: "말풍선·효과음 식자", revision: 2, byteLength: 6_291_456, contentSeed: "ep12-c08-sfx-v2", updatedAtIso: "2026-11-21T09:25:00Z", authorId: "letterer-kr" },
  ]);

  const remoteLayers: readonly SyncLayerSlice[] = Object.freeze([
    baseLayers[0],
    Object.freeze({ ...baseLayers[1], revision: 4, byteLength: 27_262_976, contentSeed: "ep12-c02-flat-remote-v4", updatedAtIso: "2026-11-21T09:32:00Z", authorId: "assist-color" }),
    baseLayers[2],
    baseLayers[3],
  ]);

  const snap1 = createTimeMachineSnapshot({ snapshots: [], layers: baseLayers.slice(0, 3), trigger: "manual-release-tag", releaseTag: "ep12-line-done", noteKo: "12화 메인 선화 및 3D 배경 배치 확정", nowIso: "2026-11-21T09:20:00Z" });
  const snap2 = createTimeMachineSnapshot({ snapshots: [snap1], layers: baseLayers, trigger: "auto-60s-journal", releaseTag: null, noteKo: "60초 자동 저널 체크포인트 (식자 레이어 추가)", nowIso: "2026-11-21T09:26:00Z" });
  const snap3 = createTimeMachineSnapshot({ snapshots: [snap1, snap2], layers: remoteLayers, trigger: "manual-release-tag", releaseTag: "ep12-ad-ok", noteKo: "담당 PD 1차 검수 통과본 릴리즈 태그", nowIso: "2026-11-21T09:35:00Z" });

  return Object.freeze({
    projectId,
    assets,
    baseLayers,
    remoteLayers,
    baseClock: Object.freeze({ "author-lead": 4, "assist-color": 3 }),
    remoteClock: Object.freeze({ "author-lead": 4, "assist-color": 4 }),
    timeline: Object.freeze({
      projectId,
      journalIntervalSec: JOURNAL_INTERVAL_SECONDS,
      activeSnapshotId: snap3.snapshotId,
      currentLayers: remoteLayers,
      snapshots: Object.freeze([snap1, snap2, snap3]),
      emergencyRecoveryCount: 0,
    }),
  });
}
