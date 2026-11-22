/**
 * 장시간 연속 작화용 델타 압축 + OPFS 자동 스필(Spill) 히스토리 저장소.
 *
 * - 단계별 상태 변화를 순방향/역방향 희소 패치(Delta)로 압축해 Undo/Redo를 O(delta)로 유지한다.
 * - RAM 사용량이 예산(`maxRamBytes`)을 넘으면 가장 오래된 델타 배치를 CompressionStream으로
 *   압축해 OPFS(또는 명시적 메모리 어댑터)에 자동 스필한다.
 * - 체크포인트 메타데이터(`checkpoint.json`) + 앵커 스냅샷(`anchor.bin`) + 핫 테일(`hot-tail.json`)을
 *   원자적 쓰기와 CRC-32 검증으로 보관해 강제 새로고침 뒤에도 0손실로 복원한다.
 * - 제품 기본 경로는 OPFS 전용이며 브라우저 KV 저장소를 직접 호출하지 않는다.
 */

import { calculateStudioCrc32 } from "../studio-crc32";
import {
  decompressStudioOpfsBytes,
  encodeStudioOpfsPayload,
  studioOpfsCompressionSupport,
  type StudioOpfsCodec,
  type StudioOpfsCompressionScope,
} from "../studio-opfs-compression";
import {
  createStudioOpfsMemoryFileSystem,
  selectStudioOpfsFileSystem,
  StudioOpfsError,
  type StudioOpfsFileSystem,
  type StudioOpfsFileSystemProbeScope,
} from "../studio-opfs-filesystem";
import {
  applyHistoryStatePatch,
  buildSafeHistorySessionSlug,
  cloneHistoryStateRecord,
  computeHistoryStateDelta,
  decodeHistoryJsonBytes,
  encodeHistoryJsonBytes,
  HISTORY_SPILL_DEFAULT_BATCH_SIZE,
  HISTORY_SPILL_DEFAULT_MAX_HYDRATED_SEGMENTS,
  HISTORY_SPILL_DEFAULT_MAX_RAM_BYTES,
  HISTORY_SPILL_DEFAULT_MIN_HOT_STEPS,
  HISTORY_SPILL_RAM_CRITICAL_RATIO,
  HISTORY_SPILL_RAM_WARNING_RATIO,
  HISTORY_SPILL_SCHEMA_VERSION,
  parseHistoryCheckpointMetadata,
  parseHistoryDeltaEntries,
  parseHistoryStateRecord,
  type HistoryCheckpointMetadata,
  type HistoryDeltaEntry,
  type HistoryOpfsSpillSnapshot,
  type HistoryOpfsSpillStore,
  type HistoryOpfsSpillStoreOptions,
  type HistorySpillDurability,
  type HistorySpillHealthStatus,
  type HistorySpillSegmentMeta,
  type HistorySpillStateRecord,
} from "./history-opfs-spill-codec";

export * from "./history-opfs-spill-codec";

function defaultNow(): number {
  return Date.now();
}

export function createHistoryOpfsSpillStore(
  options: HistoryOpfsSpillStoreOptions = {},
): HistoryOpfsSpillStore {
  const sessionId = options.sessionId?.trim() || "studio-default-session";
  const slug = buildSafeHistorySessionSlug(sessionId);
  const checkpointPath = `h/${slug}/checkpoint.json`;
  const anchorPath = `h/${slug}/anchor.bin`;
  const hotTailPath = `h/${slug}/hot-tail.json`;

  const fs: StudioOpfsFileSystem = options.fs ?? createStudioOpfsMemoryFileSystem();
  const durability: HistorySpillDurability =
    options.durability ?? (fs.kind === "opfs" ? "durable" : "memory-only");
  const durabilityReason =
    options.durabilityReason
    ?? (durability === "durable"
      ? "OPFS 영구 스필 저장소를 사용 중입니다."
      : "메모리 어댑터에서 동작 중입니다(OPFS 선택 시 강제 새로고침 뒤에도 유지).");

  const maxRamBytes = Math.max(4_096, Math.round(options.maxRamBytes ?? HISTORY_SPILL_DEFAULT_MAX_RAM_BYTES));
  const spillBatchSize = Math.max(2, Math.floor(options.spillBatchSize ?? HISTORY_SPILL_DEFAULT_BATCH_SIZE));
  const minHotSteps = Math.max(1, Math.floor(options.minHotSteps ?? HISTORY_SPILL_DEFAULT_MIN_HOT_STEPS));
  const maxHydratedColdSegments = Math.max(
    1,
    Math.floor(options.maxHydratedColdSegments ?? HISTORY_SPILL_DEFAULT_MAX_HYDRATED_SEGMENTS),
  );
  const autoCheckpoint = options.autoCheckpoint ?? true;
  const compressionScope = options.compressionScope ?? (globalThis as StudioOpfsCompressionScope);
  const compressionSupport = studioOpfsCompressionSupport(compressionScope);
  const now = options.now ?? defaultNow;

  let currentState: HistorySpillStateRecord = cloneHistoryStateRecord(options.initialState ?? {});
  let anchorState: HistorySpillStateRecord = cloneHistoryStateRecord(currentState);
  let anchorSequence = 0;
  let cursorSequence = 0;
  let latestSequence = 0;
  let nextSegmentId = 1;

  let anchorCodec: StudioOpfsCodec = "identity";
  let anchorOriginalBytes = 0;
  let anchorStoredBytes = 0;
  let anchorCrc32 = 0;
  let anchorPersisted = false;

  const hotEntries: HistoryDeltaEntry[] = [];
  let hotRamBytes = 0;
  const segments: HistorySpillSegmentMeta[] = [];
  const hydratedColdCache = new Map<number, { readonly entries: readonly HistoryDeltaEntry[]; readonly bytes: number }>();
  let hydratedCacheBytes = 0;

  let spillCount = 0;
  let hydrateCount = 0;
  let lastCheckpointAtMs: number | null = null;

  const listeners = new Set<() => void>();
  let cachedSnapshot: HistoryOpfsSpillSnapshot | null = null;

  const emit = (): void => {
    cachedSnapshot = null;
    for (const listener of listeners) listener();
  };

  const evictHydratedColdCacheToFit = (extraBytes: number): void => {
    while (
      hydratedColdCache.size > 0
      && (hydratedColdCache.size >= maxHydratedColdSegments
        || hotRamBytes + hydratedCacheBytes + extraBytes > maxRamBytes)
    ) {
      const oldestKey = hydratedColdCache.keys().next().value;
      if (oldestKey === undefined) break;
      const evicted = hydratedColdCache.get(oldestKey);
      hydratedColdCache.delete(oldestKey);
      if (evicted) hydratedCacheBytes = Math.max(0, hydratedCacheBytes - evicted.bytes);
    }
  };

  const clearHydratedColdCache = (): void => {
    hydratedColdCache.clear();
    hydratedCacheBytes = 0;
  };

  const persistAnchor = async (): Promise<void> => {
    const rawBytes = encodeHistoryJsonBytes(anchorState);
    const encoded = await encodeStudioOpfsPayload(
      rawBytes,
      "application/json",
      compressionSupport,
      compressionScope,
    );
    await fs.write(anchorPath, encoded.bytes);
    anchorCodec = encoded.codec;
    anchorOriginalBytes = rawBytes.byteLength;
    anchorStoredBytes = encoded.bytes.byteLength;
    anchorCrc32 = calculateStudioCrc32(encoded.bytes);
    anchorPersisted = true;
  };

  const persistCheckpointInternal = async (): Promise<HistoryCheckpointMetadata> => {
    if (!anchorPersisted) await persistAnchor();
    const hotBytes = encodeHistoryJsonBytes(hotEntries);
    const hotTailCrc32 = calculateStudioCrc32(hotBytes);
    await fs.write(hotTailPath, hotBytes);

    const savedAtMs = now();
    const metadata: HistoryCheckpointMetadata = Object.freeze({
      schemaVersion: HISTORY_SPILL_SCHEMA_VERSION,
      sessionId,
      cursorSequence,
      latestSequence,
      anchorSequence,
      nextSegmentId,
      anchorPath,
      anchorCodec,
      anchorOriginalBytes,
      anchorStoredBytes,
      anchorCrc32,
      hotTailPath,
      hotTailCrc32,
      hotTailStepCount: hotEntries.length,
      segments: Object.freeze([...segments]),
      savedAtMs,
    });
    const manifestCrc32 = calculateStudioCrc32(encodeHistoryJsonBytes(metadata));
    await fs.write(checkpointPath, encodeHistoryJsonBytes({ payload: metadata, manifestCrc32 }));
    lastCheckpointAtMs = savedAtMs;
    return metadata;
  };

  const loadSegmentEntries = async (
    segment: HistorySpillSegmentMeta,
  ): Promise<{ readonly entries: readonly HistoryDeltaEntry[]; readonly fromOpfs: boolean }> => {
    const cached = hydratedColdCache.get(segment.segmentId);
    if (cached) {
      hydratedColdCache.delete(segment.segmentId);
      hydratedColdCache.set(segment.segmentId, cached);
      return { entries: cached.entries, fromOpfs: false };
    }
    const raw = await fs.read(segment.path);
    if (!raw) {
      throw new StudioOpfsError("READ_FAILED", `OPFS 스필 세그먼트를 찾을 수 없습니다: ${segment.path}`);
    }
    if (calculateStudioCrc32(raw) !== segment.crc32) {
      throw new StudioOpfsError(
        "INTEGRITY_FAILED",
        `OPFS 스필 세그먼트(${segment.segmentId})의 무결성(CRC-32) 검증에 실패했습니다.`,
      );
    }
    const plain = await decompressStudioOpfsBytes(raw, segment.codec, compressionScope);
    const entries = parseHistoryDeltaEntries(
      decodeHistoryJsonBytes(plain, "OPFS 스필 세그먼트 JSON 복호화에 실패했습니다."),
    );
    const bytes = entries.reduce((sum, entry) => sum + entry.estimatedBytes, 0);
    evictHydratedColdCacheToFit(bytes);
    if (hotRamBytes + hydratedCacheBytes + bytes <= maxRamBytes) {
      hydratedColdCache.set(segment.segmentId, { entries, bytes });
      hydratedCacheBytes += bytes;
    }
    hydrateCount += 1;
    return { entries, fromOpfs: true };
  };

  const findSegmentContaining = (sequence: number): HistorySpillSegmentMeta | null => {
    let lo = 0;
    let hi = segments.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const seg = segments[mid]!;
      if (sequence < seg.fromSequence) hi = mid - 1;
      else if (sequence > seg.toSequence) lo = mid + 1;
      else return seg;
    }
    return null;
  };

  const spillHotOverflowIfNeeded = async (): Promise<number> => {
    let spilledStepsTotal = 0;
    let anchorChanged = false;

    while (hotRamBytes + hydratedCacheBytes > maxRamBytes && hydratedColdCache.size > 0) {
      evictHydratedColdCacheToFit(maxRamBytes);
    }

    while (hotRamBytes > maxRamBytes && hotEntries.length > 1) {
      const maxSpillable = Math.max(1, hotEntries.length - minHotSteps);
      const count = Math.min(spillBatchSize, maxSpillable, hotEntries.length - 1);
      if (count <= 0) break;

      const batch = hotEntries.slice(0, count);
      const rawBytes = encodeHistoryJsonBytes(batch);
      const encoded = await encodeStudioOpfsPayload(
        rawBytes,
        "application/json",
        compressionSupport,
        compressionScope,
      );
      const segId = nextSegmentId;
      nextSegmentId += 1;
      const segPath = `h/${slug}/seg-${String(segId).padStart(5, "0")}.bin`;
      await fs.write(segPath, encoded.bytes);

      const meta: HistorySpillSegmentMeta = Object.freeze({
        segmentId: segId,
        path: segPath,
        fromSequence: batch[0]!.sequence,
        toSequence: batch[batch.length - 1]!.sequence,
        stepCount: batch.length,
        codec: encoded.codec,
        originalBytes: rawBytes.byteLength,
        storedBytes: encoded.bytes.byteLength,
        crc32: calculateStudioCrc32(encoded.bytes),
      });
      segments.push(meta);

      let batchEstimatedBytes = 0;
      for (const entry of batch) {
        anchorState = applyHistoryStatePatch(anchorState, entry.forward);
        batchEstimatedBytes += entry.estimatedBytes;
      }
      anchorSequence = meta.toSequence;
      hotEntries.splice(0, count);
      hotRamBytes = Math.max(0, hotRamBytes - batchEstimatedBytes);
      spillCount += 1;
      spilledStepsTotal += count;
      anchorChanged = true;
    }

    if (anchorChanged) await persistAnchor();
    return spilledStepsTotal;
  };

  const truncateFutureAfterCursor = async (): Promise<void> => {
    if (cursorSequence >= latestSequence) return;
    if (cursorSequence >= anchorSequence) {
      const removed = hotEntries.splice(cursorSequence - anchorSequence);
      for (const entry of removed) hotRamBytes = Math.max(0, hotRamBytes - entry.estimatedBytes);
      latestSequence = cursorSequence;
      return;
    }

    hotEntries.length = 0;
    hotRamBytes = 0;
    let splitEntries: HistoryDeltaEntry[] = [];
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const seg = segments[i]!;
      if (seg.fromSequence > cursorSequence) {
        segments.pop();
        hydratedColdCache.delete(seg.segmentId);
        await fs.remove(seg.path);
      } else if (seg.toSequence > cursorSequence) {
        const { entries } = await loadSegmentEntries(seg);
        splitEntries = entries.filter((entry) => entry.sequence <= cursorSequence);
        segments.pop();
        hydratedColdCache.delete(seg.segmentId);
        await fs.remove(seg.path);
        break;
      } else {
        break;
      }
    }

    clearHydratedColdCache();
    anchorSequence = segments.length > 0 ? segments[segments.length - 1]!.toSequence : 0;
    let reconstructedAnchor = cloneHistoryStateRecord(currentState);
    for (let i = splitEntries.length - 1; i >= 0; i -= 1) {
      reconstructedAnchor = applyHistoryStatePatch(reconstructedAnchor, splitEntries[i]!.inverse);
    }
    anchorState = reconstructedAnchor;
    for (const entry of splitEntries) {
      hotEntries.push(entry);
      hotRamBytes += entry.estimatedBytes;
    }
    latestSequence = cursorSequence;
    await persistAnchor();
  };

  const resolveEntryBySequence = async (
    sequence: number,
  ): Promise<{ readonly entry: HistoryDeltaEntry; readonly hydratedFromOpfs: boolean }> => {
    if (sequence > anchorSequence) {
      const found = hotEntries[sequence - anchorSequence - 1];
      if (!found || found.sequence !== sequence) {
        throw new StudioOpfsError("CORRUPT_ENTRY", `히스토리 단계(${sequence})를 핫 버퍼에서 찾지 못했습니다.`);
      }
      return { entry: found, hydratedFromOpfs: false };
    }
    const seg = findSegmentContaining(sequence);
    if (!seg) {
      throw new StudioOpfsError("READ_FAILED", `히스토리 단계(${sequence})의 스필 세그먼트가 없습니다.`);
    }
    const { entries, fromOpfs } = await loadSegmentEntries(seg);
    const found = entries[sequence - seg.fromSequence];
    if (!found || found.sequence !== sequence) {
      throw new StudioOpfsError("CORRUPT_ENTRY", `스필 세그먼트 내 단계(${sequence}) 인덱스가 일치하지 않습니다.`);
    }
    return { entry: found, hydratedFromOpfs: fromOpfs };
  };

  const buildSnapshot = (): HistoryOpfsSpillSnapshot => {
    let spilledBytes = 0;
    let spilledOriginalBytes = 0;
    let spilledStepCount = 0;
    for (const seg of segments) {
      spilledBytes += seg.storedBytes;
      spilledOriginalBytes += seg.originalBytes;
      spilledStepCount += seg.stepCount;
    }
    const ramBytes = hotRamBytes + hydratedCacheBytes;
    const ramUtilizationRatio = Math.min(1, ramBytes / maxRamBytes);
    const compressionSavingRatio =
      spilledOriginalBytes > 0 ? Math.max(0, 1 - spilledBytes / spilledOriginalBytes) : 0;
    const status: HistorySpillHealthStatus =
      ramUtilizationRatio >= HISTORY_SPILL_RAM_CRITICAL_RATIO
        ? "critical"
        : ramUtilizationRatio >= HISTORY_SPILL_RAM_WARNING_RATIO
          ? "warning"
          : "healthy";

    return Object.freeze({
      sessionId,
      durability,
      durabilityReason,
      ramBytes,
      hotRamBytes,
      hydratedCacheBytes,
      ramBudgetBytes: maxRamBytes,
      ramUtilizationRatio,
      spilledBytes,
      spilledOriginalBytes,
      compressionSavingRatio,
      hotStepCount: hotEntries.length,
      spilledStepCount,
      segmentCount: segments.length,
      totalStepCount: latestSequence,
      cursorSequence,
      canUndo: cursorSequence > 0,
      canRedo: cursorSequence < latestSequence,
      spillCount,
      hydrateCount,
      lastCheckpointAtMs,
      status,
    });
  };

  return {
    async pushStep(input) {
      await truncateFutureAfterCursor();
      const nextState = cloneHistoryStateRecord(input.nextState);
      const { forward, inverse } = computeHistoryStateDelta(currentState, nextState);
      const sequence = cursorSequence + 1;
      const baseEntry = {
        sequence,
        label: input.label.trim() || `작업 #${sequence}`,
        cutId: input.cutId ?? null,
        timestampMs: input.timestampMs ?? now(),
        forward,
        inverse,
      };
      const estimatedBytes = encodeHistoryJsonBytes(baseEntry).byteLength + 32;
      const entry: HistoryDeltaEntry = Object.freeze({ ...baseEntry, estimatedBytes });

      hotEntries.push(entry);
      hotRamBytes += estimatedBytes;
      currentState = nextState;
      cursorSequence = sequence;
      latestSequence = sequence;

      const spilledInThisPush = await spillHotOverflowIfNeeded();
      if (autoCheckpoint) await persistCheckpointInternal();
      emit();

      return Object.freeze({
        sequence,
        label: entry.label,
        spilledInThisPush,
        deltaBytes: estimatedBytes,
        ramBytes: hotRamBytes + hydratedCacheBytes,
      });
    },

    async undo() {
      if (cursorSequence <= 0) {
        return Object.freeze({
          moved: false,
          sequence: 0,
          label: null,
          hydratedFromOpfs: false,
          state: cloneHistoryStateRecord(currentState),
        });
      }
      const { entry, hydratedFromOpfs } = await resolveEntryBySequence(cursorSequence);
      currentState = applyHistoryStatePatch(currentState, entry.inverse);
      cursorSequence -= 1;
      if (autoCheckpoint) await persistCheckpointInternal();
      emit();
      return Object.freeze({
        moved: true,
        sequence: cursorSequence,
        label: entry.label,
        hydratedFromOpfs,
        state: cloneHistoryStateRecord(currentState),
      });
    },

    async redo() {
      if (cursorSequence >= latestSequence) {
        return Object.freeze({
          moved: false,
          sequence: cursorSequence,
          label: null,
          hydratedFromOpfs: false,
          state: cloneHistoryStateRecord(currentState),
        });
      }
      const nextSeq = cursorSequence + 1;
      const { entry, hydratedFromOpfs } = await resolveEntryBySequence(nextSeq);
      currentState = applyHistoryStatePatch(currentState, entry.forward);
      cursorSequence = nextSeq;
      if (autoCheckpoint) await persistCheckpointInternal();
      emit();
      return Object.freeze({
        moved: true,
        sequence: cursorSequence,
        label: entry.label,
        hydratedFromOpfs,
        state: cloneHistoryStateRecord(currentState),
      });
    },

    async flushCheckpoint() {
      const metadata = await persistCheckpointInternal();
      emit();
      return metadata;
    },

    async restoreFromCheckpoint() {
      const manifestRaw = await fs.read(checkpointPath);
      if (!manifestRaw) {
        return Object.freeze({
          restored: false,
          reason: "no-checkpoint" as const,
          restoredSteps: 0,
          cursorSequence: 0,
          spilledSteps: 0,
          state: cloneHistoryStateRecord(currentState),
        });
      }

      const metadata = parseHistoryCheckpointMetadata(
        decodeHistoryJsonBytes(manifestRaw, "체크포인트 메타데이터를 해석하지 못했습니다."),
      );
      const anchorRaw = await fs.read(metadata.anchorPath);
      if (!anchorRaw) throw new StudioOpfsError("READ_FAILED", "히스토리 앵커 스냅샷 파일이 누락됐습니다.");
      if (calculateStudioCrc32(anchorRaw) !== metadata.anchorCrc32) {
        throw new StudioOpfsError("INTEGRITY_FAILED", "히스토리 앵커 스냅샷 무결성(CRC-32) 검증에 실패했습니다.");
      }
      const anchorPlain = await decompressStudioOpfsBytes(anchorRaw, metadata.anchorCodec, compressionScope);
      const restoredAnchor = parseHistoryStateRecord(
        decodeHistoryJsonBytes(anchorPlain, "히스토리 앵커 스냅샷 JSON 복호화에 실패했습니다."),
      );

      const hotRaw = await fs.read(metadata.hotTailPath);
      if (!hotRaw) throw new StudioOpfsError("READ_FAILED", "히스토리 핫 테일 파일이 누락됐습니다.");
      if (calculateStudioCrc32(hotRaw) !== metadata.hotTailCrc32) {
        throw new StudioOpfsError("INTEGRITY_FAILED", "히스토리 핫 테일 무결성(CRC-32) 검증에 실패했습니다.");
      }
      const restoredHot = parseHistoryDeltaEntries(
        decodeHistoryJsonBytes(hotRaw, "히스토리 핫 테일 JSON 해석에 실패했습니다."),
      );

      segments.length = 0;
      for (const seg of metadata.segments) segments.push(seg);
      clearHydratedColdCache();

      hotEntries.length = 0;
      hotRamBytes = 0;
      for (const entry of restoredHot) {
        hotEntries.push(entry);
        hotRamBytes += entry.estimatedBytes;
      }

      anchorState = restoredAnchor;
      anchorSequence = metadata.anchorSequence;
      anchorCodec = metadata.anchorCodec;
      anchorOriginalBytes = metadata.anchorOriginalBytes;
      anchorStoredBytes = metadata.anchorStoredBytes;
      anchorCrc32 = metadata.anchorCrc32;
      anchorPersisted = true;
      cursorSequence = metadata.cursorSequence;
      latestSequence = metadata.latestSequence;
      nextSegmentId = metadata.nextSegmentId;
      lastCheckpointAtMs = metadata.savedAtMs;

      let restoredCurrent = cloneHistoryStateRecord(anchorState);
      if (cursorSequence > anchorSequence) {
        for (let i = 0; i < cursorSequence - anchorSequence; i += 1) {
          const entry = hotEntries[i];
          if (!entry) throw new StudioOpfsError("CORRUPT_ENTRY", "체크포인트 복원 중 핫 테일 단계가 누락됐습니다.");
          restoredCurrent = applyHistoryStatePatch(restoredCurrent, entry.forward);
        }
      } else if (cursorSequence < anchorSequence) {
        for (let seq = anchorSequence; seq > cursorSequence; seq -= 1) {
          const { entry } = await resolveEntryBySequence(seq);
          restoredCurrent = applyHistoryStatePatch(restoredCurrent, entry.inverse);
        }
      }
      currentState = restoredCurrent;
      emit();

      return Object.freeze({
        restored: true,
        reason: "restored" as const,
        restoredSteps: latestSequence,
        cursorSequence,
        spilledSteps: segments.reduce((sum, seg) => sum + seg.stepCount, 0),
        state: cloneHistoryStateRecord(currentState),
      });
    },

    getCurrentState() {
      return cloneHistoryStateRecord(currentState);
    },

    getSnapshot() {
      cachedSnapshot ??= buildSnapshot();
      return cachedSnapshot;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async clear() {
      for (const seg of segments) await fs.remove(seg.path);
      await fs.remove(checkpointPath);
      await fs.remove(anchorPath);
      await fs.remove(hotTailPath);
      segments.length = 0;
      hotEntries.length = 0;
      clearHydratedColdCache();
      hotRamBytes = 0;
      currentState = cloneHistoryStateRecord(options.initialState ?? {});
      anchorState = cloneHistoryStateRecord(currentState);
      anchorSequence = 0;
      cursorSequence = 0;
      latestSequence = 0;
      nextSegmentId = 1;
      anchorPersisted = false;
      spillCount = 0;
      hydrateCount = 0;
      lastCheckpointAtMs = null;
      emit();
    },
  };
}

/**
 * 제품 기본 OPFS 히스토리 스필 저장소 선택기.
 * OPFS가 가능하면 영구 저장 어댑터를, 불가능하면 손실 가능성이 드러나는 메모리 전용 어댑터를 연다.
 */
export async function createDefaultHistoryOpfsSpillStore(
  options: Omit<HistoryOpfsSpillStoreOptions, "fs" | "durability" | "durabilityReason"> = {},
  scope: StudioOpfsFileSystemProbeScope = globalThis as StudioOpfsFileSystemProbeScope,
): Promise<HistoryOpfsSpillStore> {
  const selection = await selectStudioOpfsFileSystem(scope, {
    rootName: "toonstudio-session-history-spill",
  });
  return createHistoryOpfsSpillStore({
    ...options,
    fs: selection.fs,
    durability: selection.durability,
    durabilityReason: selection.reason,
  });
}

let sharedHistoryStore: HistoryOpfsSpillStore | null = null;

/** 스튜디오 자가 진단 HUD·세션이 공유하는 기본 히스토리 스필 저장소. */
export function getSharedHistoryOpfsSpillStore(): HistoryOpfsSpillStore {
  sharedHistoryStore ??= createHistoryOpfsSpillStore({
    sessionId: "studio-active-session",
  });
  return sharedHistoryStore;
}

/** 테스트 격리용 공유 히스토리 스필 저장소 초기화. */
export function resetSharedHistoryOpfsSpillStore(): void {
  sharedHistoryStore = null;
}
