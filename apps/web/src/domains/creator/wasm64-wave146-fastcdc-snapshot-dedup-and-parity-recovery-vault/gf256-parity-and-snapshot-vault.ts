/**
 * Wave 146 — 웹툰 원고 증분 스냅샷 중복제거 & GF(256) 이중 패리티 자가 치유 금고.
 *
 * - FastCDC 콘텐츠 주소 지정 청킹으로 스냅샷 중복 청크는 참조 카운트만 증가시키고,
 *   신규 청크만 저장하며 즉시 GF(256) P+Q 이중 패리티 스트라이프를 부여한다.
 * - `scrubAndHealVault()`로 전체 청크·패리티 SHA-256을 스크럽해 최대 2-샤드 손상까지
 *   100% 비트 일치 복구하고, `compactUnreferencedChunks()`로 삭제된 스냅샷의 미참조 청크만
 *   안전 회수(혼합 스트라이프 재인코딩 포함)한다.
 */

import {
  chunkBufferFastCdc,
  computeVaultManifestSha256Hex,
  resolveFastCdcOptions,
  sha256VaultBytesHex,
  type FixedVsFastCdcComparisonReport,
  type ResolvedFastCdcOptions,
} from "./fastcdc-rolling-chunker";
import {
  MAX_DUAL_PARITY_DATA_SHARDS,
  decodeAndHealDualParityStripe,
  encodeDualParityStripe,
  type DualParityHealStatus,
  type DualParityStripe,
} from "./gf256-dual-parity-codec";
import type {
  SnapshotCommitRecord,
  SnapshotRestoreResult,
  SnapshotVaultOptions,
  VaultCompactionReport,
  VaultHealthSnapshot,
  VaultScrubAndHealReport,
  VaultStripeHealthSummary,
  VaultStripeScrubEntry,
} from "./vault-types";

export {
  GF256_PRIMITIVE_POLYNOMIAL,
  MAX_DUAL_PARITY_DATA_SHARDS,
  decodeAndHealDualParityStripe,
  encodeDualParityStripe,
  gf256Add,
  gf256Div,
  gf256GeneratorPow,
  gf256Inv,
  gf256Mul,
  type DualParityHealResult,
  type DualParityHealStatus,
  type DualParityStripe,
  type DualParityStripeMeta,
} from "./gf256-dual-parity-codec";

export type {
  SnapshotCommitRecord,
  SnapshotRestoreResult,
  SnapshotVaultOptions,
  VaultCompactionReport,
  VaultHealthSnapshot,
  VaultScrubAndHealReport,
  VaultStripeHealthSummary,
  VaultStripeScrubEntry,
} from "./vault-types";

export const DEFAULT_VAULT_STRIPE_DATA_SHARDS = 4;

interface StoredChunkEntry {
  readonly chunkId: string;
  readonly originalLength: number;
  bytes: Uint8Array | null;
  refCount: number;
}

interface StoredStripeEntry {
  readonly stripeId: string;
  readonly dataChunkIds: readonly string[];
  readonly stripe: DualParityStripe;
  parityPBytes: Uint8Array | null;
  parityQBytes: Uint8Array | null;
  lastStatus: DualParityHealStatus;
  lastFaultCount: number;
  lastHealedShardLabels: readonly string[];
}

function roundPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * FastCDC 콘텐츠 주소 지정 중복제거 + GF(256) 이중 패리티 자가 치유 원고 스냅샷 금고.
 */
export class ManuscriptSnapshotDedupVault {
  private readonly chunkingOptions: ResolvedFastCdcOptions;
  private readonly stripeDataShards: number;
  private readonly chunks = new Map<string, StoredChunkEntry>();
  private readonly snapshots = new Map<string, SnapshotCommitRecord>();
  private readonly stripes = new Map<string, StoredStripeEntry>();
  private snapshotSequence = 0;
  private stripeSequence = 0;
  private deletedSnapshotCount = 0;
  private lastScrubReport: VaultScrubAndHealReport | null = null;

  constructor(options?: SnapshotVaultOptions) {
    this.chunkingOptions = resolveFastCdcOptions(options?.chunking);
    const width = options?.stripeDataShards ?? DEFAULT_VAULT_STRIPE_DATA_SHARDS;
    if (!Number.isInteger(width) || width < 1 || width > MAX_DUAL_PARITY_DATA_SHARDS) {
      throw new RangeError(
        `stripeDataShards는 1~${MAX_DUAL_PARITY_DATA_SHARDS} 사이의 정수여야 합니다(입력: ${width}).`,
      );
    }
    this.stripeDataShards = width;
  }

  /** 원고 스냅샷을 FastCDC 청킹 후 중복 제거 저장하고 신규 청크에 GF(256) P+Q 패리티를 부여한다. */
  commitSnapshot(
    episodeId: string,
    revisionLabel: string,
    payloadBytes: Uint8Array,
  ): SnapshotCommitRecord {
    const cleanEpisodeId = episodeId.trim() || "ep-untitled";
    const cleanRevision = revisionLabel.trim() || "rev-unnamed";
    const chunked = chunkBufferFastCdc(payloadBytes, this.chunkingOptions);

    this.snapshotSequence += 1;
    const sequenceNumber = this.snapshotSequence;
    const snapshotId = `snap-${String(sequenceNumber).padStart(4, "0")}`;

    const chunkIds: string[] = [];
    const newChunkRecords: { readonly chunkId: string; readonly bytes: Uint8Array }[] = [];
    let reusedChunkCount = 0;
    let newChunkCount = 0;
    let reusedBytes = 0;
    let newStoredBytes = 0;

    for (let i = 0; i < chunked.chunks.length; i += 1) {
      const chunk = chunked.chunks[i];
      if (!chunk) continue;
      chunkIds.push(chunk.sha256Hex);
      const existing = this.chunks.get(chunk.sha256Hex);
      if (existing) {
        existing.refCount += 1;
        reusedChunkCount += 1;
        reusedBytes += chunk.byteLength;
      } else {
        const storedCopy = chunk.bytes.slice();
        this.chunks.set(chunk.sha256Hex, {
          chunkId: chunk.sha256Hex,
          originalLength: chunk.byteLength,
          bytes: storedCopy,
          refCount: 1,
        });
        newChunkRecords.push({ chunkId: chunk.sha256Hex, bytes: storedCopy });
        newChunkCount += 1;
        newStoredBytes += chunk.byteLength;
      }
    }

    const createdStripeIds: string[] = [];
    for (let start = 0; start < newChunkRecords.length; start += this.stripeDataShards) {
      const batch = newChunkRecords.slice(start, start + this.stripeDataShards);
      const stripeEntry = this.createStripeFromRecords(batch);
      this.stripes.set(stripeEntry.stripeId, stripeEntry);
      createdStripeIds.push(stripeEntry.stripeId);
    }

    const dedupReusePercent =
      chunked.totalBytes > 0 ? roundPercent((reusedBytes / chunked.totalBytes) * 100) : 0;
    const snapshotRootSha256Hex = computeVaultManifestSha256Hex({
      snapshotId,
      sequenceNumber,
      episodeId: cleanEpisodeId,
      revisionLabel: cleanRevision,
      logicalBytes: chunked.totalBytes,
      payloadSha256Hex: chunked.payloadSha256Hex,
      chunkIds,
    });

    const record: SnapshotCommitRecord = {
      snapshotId,
      sequenceNumber,
      episodeId: cleanEpisodeId,
      revisionLabel: cleanRevision,
      logicalBytes: chunked.totalBytes,
      chunkCount: chunked.chunkCount,
      reusedChunkCount,
      newChunkCount,
      reusedBytes,
      newStoredBytes,
      dedupReusePercent,
      chunkIds,
      payloadSha256Hex: chunked.payloadSha256Hex,
      snapshotRootSha256Hex,
      createdStripeIds,
    };

    this.snapshots.set(snapshotId, record);
    return record;
  }

  /** 전체 청크·패리티 스트라이프를 SHA-256으로 스크럽하고 손상·누락 샤드를 GF(256) 패리티로 자동 치유한다. */
  scrubAndHealVault(): VaultScrubAndHealReport {
    const stripeEntries: VaultStripeScrubEntry[] = [];
    const healedChunkIds: string[] = [];
    const unrecoverableStripeIds: string[] = [];
    const unrecoverableChunkIds: string[] = [];

    let checkedChunkCount = 0;
    let healthyStripeCount = 0;
    let healedStripeCount = 0;
    let unrecoverableStripeCount = 0;
    let healedDataChunkCount = 0;
    let healedParityShardCount = 0;

    this.stripes.forEach((entry) => {
      const candidateData: (Uint8Array | null)[] = [];
      for (let i = 0; i < entry.dataChunkIds.length; i += 1) {
        const cid = entry.dataChunkIds[i] ?? "";
        checkedChunkCount += 1;
        const stored = this.chunks.get(cid);
        candidateData.push(stored ? stored.bytes : null);
      }

      const healResult = decodeAndHealDualParityStripe(
        entry.stripe,
        candidateData,
        entry.parityPBytes,
        entry.parityQBytes,
      );

      entry.lastStatus = healResult.status;
      entry.lastFaultCount = healResult.faultCount;
      entry.lastHealedShardLabels = healResult.healedShardLabels;
      const stripeHealedChunkIds: string[] = [];

      if (healResult.status === "healthy") {
        healthyStripeCount += 1;
      } else if (healResult.status === "healed") {
        healedStripeCount += 1;
        for (let i = 0; i < entry.dataChunkIds.length; i += 1) {
          const cid = entry.dataChunkIds[i] ?? "";
          if (!healResult.healedShardLabels.includes(`data[${i}]`)) continue;
          const recoveredBytes = healResult.dataShards[i];
          if (!recoveredBytes) continue;
          const existing = this.chunks.get(cid);
          if (existing) {
            existing.bytes = recoveredBytes.slice();
          } else {
            this.chunks.set(cid, {
              chunkId: cid,
              originalLength: recoveredBytes.length,
              bytes: recoveredBytes.slice(),
              refCount: 0,
            });
          }
          healedDataChunkCount += 1;
          stripeHealedChunkIds.push(cid);
          healedChunkIds.push(cid);
        }
        if (healResult.healedShardLabels.includes("parity-P") && healResult.parityP) {
          entry.parityPBytes = healResult.parityP.slice();
          healedParityShardCount += 1;
        }
        if (healResult.healedShardLabels.includes("parity-Q") && healResult.parityQ) {
          entry.parityQBytes = healResult.parityQ.slice();
          healedParityShardCount += 1;
        }
      } else {
        unrecoverableStripeCount += 1;
        unrecoverableStripeIds.push(entry.stripeId);
        for (let i = 0; i < entry.dataChunkIds.length; i += 1) {
          if (healResult.dataShards[i] === null) {
            const cid = entry.dataChunkIds[i] ?? "";
            if (cid) unrecoverableChunkIds.push(cid);
          }
        }
      }

      stripeEntries.push({
        stripeId: entry.stripeId,
        dataChunkIds: entry.dataChunkIds,
        status: healResult.status,
        faultCount: healResult.faultCount,
        detectedFaultLabels: healResult.detectedFaultLabels,
        healedShardLabels: healResult.healedShardLabels,
        healedChunkIds: stripeHealedChunkIds,
      });
    });

    const reportPayload = {
      checkedStripeCount: stripeEntries.length,
      checkedChunkCount,
      healthyStripeCount,
      healedStripeCount,
      unrecoverableStripeCount,
      healedDataChunkCount,
      healedParityShardCount,
      healedChunkIds,
      unrecoverableStripeIds,
      unrecoverableChunkIds,
      allDataIntact: unrecoverableStripeCount === 0,
      stripeEntries,
    };

    const report: VaultScrubAndHealReport = {
      ...reportPayload,
      reportSha256Hex: computeVaultManifestSha256Hex(reportPayload),
    };
    this.lastScrubReport = report;
    return report;
  }

  /** 스냅샷 원본 바이트를 100% 비트 일치 복원하고 청크·루트 SHA-256을 재검증한다. */
  restoreSnapshotBytes(snapshotId: string): SnapshotRestoreResult {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      return this.buildRestoreFailure(snapshotId, 0, "", null, [], "snapshot-not-found");
    }

    const missingOrCorrupted: string[] = [];
    const output = new Uint8Array(snapshot.logicalBytes);
    let cursor = 0;

    for (let i = 0; i < snapshot.chunkIds.length; i += 1) {
      const cid = snapshot.chunkIds[i] ?? "";
      const stored = this.chunks.get(cid);
      if (
        !stored ||
        stored.bytes === null ||
        stored.bytes.length !== stored.originalLength ||
        sha256VaultBytesHex(stored.bytes) !== cid
      ) {
        missingOrCorrupted.push(cid);
        continue;
      }
      if (cursor + stored.bytes.length <= output.length) {
        output.set(stored.bytes, cursor);
      }
      cursor += stored.bytes.length;
    }

    if (missingOrCorrupted.length > 0 || cursor !== snapshot.logicalBytes) {
      return this.buildRestoreFailure(
        snapshotId,
        snapshot.logicalBytes,
        snapshot.payloadSha256Hex,
        null,
        missingOrCorrupted,
        "chunk-corrupted-or-missing",
      );
    }

    const actualSha = sha256VaultBytesHex(output);
    if (actualSha !== snapshot.payloadSha256Hex) {
      return this.buildRestoreFailure(
        snapshotId,
        snapshot.logicalBytes,
        snapshot.payloadSha256Hex,
        actualSha,
        [],
        "root-hash-mismatch",
      );
    }

    return {
      ok: true,
      snapshotId,
      bytes: output,
      logicalBytes: snapshot.logicalBytes,
      expectedPayloadSha256Hex: snapshot.payloadSha256Hex,
      actualPayloadSha256Hex: actualSha,
      missingOrCorruptedChunkIds: [],
      failureReason: "none",
    };
  }

  private buildRestoreFailure(
    snapshotId: string,
    logicalBytes: number,
    expectedPayloadSha256Hex: string,
    actualPayloadSha256Hex: string | null,
    missingOrCorruptedChunkIds: readonly string[],
    failureReason: SnapshotRestoreResult["failureReason"],
  ): SnapshotRestoreResult {
    return {
      ok: false,
      snapshotId,
      bytes: null,
      logicalBytes,
      expectedPayloadSha256Hex,
      actualPayloadSha256Hex,
      missingOrCorruptedChunkIds,
      failureReason,
    };
  }

  /** 스냅샷을 논리 삭제하고 참조 카운트를 차감한다(실제 청크 회수는 `compactUnreferencedChunks`). */
  deleteSnapshot(snapshotId: string): boolean {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) return false;
    for (let i = 0; i < snapshot.chunkIds.length; i += 1) {
      const stored = this.chunks.get(snapshot.chunkIds[i] ?? "");
      if (stored && stored.refCount > 0) stored.refCount -= 1;
    }
    this.snapshots.delete(snapshotId);
    this.deletedSnapshotCount += 1;
    return true;
  }

  /**
   * 삭제된 스냅샷의 미참조 청크만 안전하게 가비지 컬렉션하고, 혼합 스트라이프의 잔존 활성
   * 청크를 새 GF(256) P+Q 스트라이프로 재인코딩해 활성 스냅샷의 이중 패리티 보호를 유지한다.
   */
  compactUnreferencedChunks(): VaultCompactionReport {
    const deadChunkIds = new Set<string>();
    this.chunks.forEach((entry) => {
      if (entry.refCount <= 0) deadChunkIds.add(entry.chunkId);
    });

    let droppedStripeCount = 0;
    let rebuiltStripeCount = 0;
    let reclaimedParityBytes = 0;
    const stripesToDelete: string[] = [];
    const stripesToAdd: StoredStripeEntry[] = [];

    this.stripes.forEach((stripeEntry) => {
      if (!stripeEntry.dataChunkIds.some((cid) => deadChunkIds.has(cid))) return;
      const liveIds = stripeEntry.dataChunkIds.filter((cid) => !deadChunkIds.has(cid));
      const oldParityBytes = stripeEntry.stripe.shardSizeBytes * 2;

      if (liveIds.length === 0) {
        stripesToDelete.push(stripeEntry.stripeId);
        droppedStripeCount += 1;
        reclaimedParityBytes += oldParityBytes;
        return;
      }

      const liveRecords: { readonly chunkId: string; readonly bytes: Uint8Array }[] = [];
      for (let i = 0; i < liveIds.length; i += 1) {
        const cid = liveIds[i] ?? "";
        const stored = this.chunks.get(cid);
        if (!stored || stored.bytes === null || sha256VaultBytesHex(stored.bytes) !== cid) {
          for (let j = 0; j < stripeEntry.dataChunkIds.length; j += 1) {
            deadChunkIds.delete(stripeEntry.dataChunkIds[j] ?? "");
          }
          return;
        }
        liveRecords.push({ chunkId: cid, bytes: stored.bytes.slice() });
      }

      stripesToDelete.push(stripeEntry.stripeId);
      const rebuilt = this.createStripeFromRecords(liveRecords);
      stripesToAdd.push(rebuilt);
      rebuiltStripeCount += 1;
      reclaimedParityBytes += Math.max(0, oldParityBytes - rebuilt.stripe.shardSizeBytes * 2);
    });

    for (let i = 0; i < stripesToDelete.length; i += 1) {
      const sid = stripesToDelete[i];
      if (sid) this.stripes.delete(sid);
    }
    for (let i = 0; i < stripesToAdd.length; i += 1) {
      const added = stripesToAdd[i];
      if (added) this.stripes.set(added.stripeId, added);
    }

    const reclaimedChunkIds: string[] = [];
    let reclaimedChunkBytes = 0;
    deadChunkIds.forEach((cid) => {
      const stored = this.chunks.get(cid);
      if (stored) {
        reclaimedChunkBytes += stored.originalLength;
        reclaimedChunkIds.push(cid);
        this.chunks.delete(cid);
      }
    });

    return {
      reclaimedChunkCount: reclaimedChunkIds.length,
      reclaimedChunkBytes,
      droppedStripeCount,
      rebuiltStripeCount,
      reclaimedParityBytes,
      remainingChunkCount: this.chunks.size,
      remainingStripeCount: this.stripes.size,
      reclaimedChunkIds,
    };
  }

  /** 오프라인 저장소 비트 로트(Bit-Rot) 시뮬레이션: 지정 청크의 특정 바이트 비트를 반전한다. */
  injectChunkBitFlipForTest(chunkId: string, byteOffset: number = 0, bitMask: number = 0x01): boolean {
    const entry = this.chunks.get(chunkId);
    if (!entry || entry.bytes === null || entry.bytes.length === 0) return false;
    const safeOffset = Math.max(0, Math.min(entry.bytes.length - 1, Math.floor(byteOffset)));
    const safeMask = (bitMask & 0xff) === 0 ? 0x01 : bitMask & 0xff;
    entry.bytes[safeOffset] = (entry.bytes[safeOffset] ?? 0) ^ safeMask;
    return true;
  }

  /** 오프라인 저장소 청크 유실(Erasure) 시뮬레이션: 지정 청크의 본문 바이트를 제거한다. */
  dropChunkDataForTest(chunkId: string): boolean {
    const entry = this.chunks.get(chunkId);
    if (!entry) return false;
    entry.bytes = null;
    return true;
  }

  /** 패리티 샤드(`P` 또는 `Q`)의 비트 로트 시뮬레이션을 수행한다. */
  injectParityBitFlipForTest(
    stripeId: string,
    target: "P" | "Q",
    byteOffset: number = 0,
    bitMask: number = 0x80,
  ): boolean {
    const entry = this.stripes.get(stripeId);
    if (!entry) return false;
    const buf = target === "P" ? entry.parityPBytes : entry.parityQBytes;
    if (!buf || buf.length === 0) return false;
    const safeOffset = Math.max(0, Math.min(buf.length - 1, Math.floor(byteOffset)));
    const safeMask = (bitMask & 0xff) === 0 ? 0x80 : bitMask & 0xff;
    buf[safeOffset] = (buf[safeOffset] ?? 0) ^ safeMask;
    return true;
  }

  /** 패리티 샤드(`P` 또는 `Q`) 유실 시뮬레이션을 수행한다. */
  dropParityShardForTest(stripeId: string, target: "P" | "Q"): boolean {
    const entry = this.stripes.get(stripeId);
    if (!entry) return false;
    if (target === "P") entry.parityPBytes = null;
    else entry.parityQBytes = null;
    return true;
  }

  /** 현재 금고의 중복제거율·패리티 스트라이프 상태·무결성 지문을 스냅샷으로 반환한다. */
  getVaultHealthSnapshot(
    shiftBenchmark: FixedVsFastCdcComparisonReport | null = null,
  ): VaultHealthSnapshot {
    const snapshots = Array.from(this.snapshots.values());
    let totalLogicalBytes = 0;
    for (let i = 0; i < snapshots.length; i += 1) {
      totalLogicalBytes += snapshots[i]?.logicalBytes ?? 0;
    }

    let totalUniqueChunkBytes = 0;
    let unreferencedChunkCount = 0;
    this.chunks.forEach((entry) => {
      totalUniqueChunkBytes += entry.originalLength;
      if (entry.refCount <= 0) unreferencedChunkCount += 1;
    });

    let totalParityBytes = 0;
    const stripes: VaultStripeHealthSummary[] = [];
    this.stripes.forEach((entry) => {
      const parityBytes = entry.stripe.shardSizeBytes * 2;
      totalParityBytes += parityBytes;
      stripes.push({
        stripeId: entry.stripeId,
        dataShardCount: entry.stripe.dataShardCount,
        shardSizeBytes: entry.stripe.shardSizeBytes,
        parityBytes,
        dataChunkIds: entry.dataChunkIds,
        lastStatus: entry.lastStatus,
        lastFaultCount: entry.lastFaultCount,
        lastHealedShardLabels: entry.lastHealedShardLabels,
      });
    });

    const totalPhysicalBytes = totalUniqueChunkBytes + totalParityBytes;
    const dedupSavedBytes = Math.max(0, totalLogicalBytes - totalUniqueChunkBytes);
    const dedupSavingsPercent =
      totalLogicalBytes > 0 ? roundPercent((dedupSavedBytes / totalLogicalBytes) * 100) : 0;
    const effectiveSavingsAfterParityPercent =
      totalLogicalBytes > 0
        ? roundPercent(((totalLogicalBytes - totalPhysicalBytes) / totalLogicalBytes) * 100)
        : 0;

    const vaultManifestSha256Hex = computeVaultManifestSha256Hex({
      chunkingOptions: this.chunkingOptions,
      stripeDataShards: this.stripeDataShards,
      activeSnapshotCount: snapshots.length,
      deletedSnapshotCount: this.deletedSnapshotCount,
      snapshotRoots: snapshots.map((s) => s.snapshotRootSha256Hex),
      uniqueChunkCount: this.chunks.size,
      unreferencedChunkCount,
      stripeCount: stripes.length,
      totalLogicalBytes,
      totalUniqueChunkBytes,
      totalParityBytes,
      totalPhysicalBytes,
      dedupSavedBytes,
      dedupSavingsPercent,
      effectiveSavingsAfterParityPercent,
      stripeStatuses: stripes.map((st) => ({
        stripeId: st.stripeId,
        status: st.lastStatus,
        faults: st.lastFaultCount,
      })),
    });

    return {
      chunkingOptions: this.chunkingOptions,
      stripeDataShards: this.stripeDataShards,
      activeSnapshotCount: snapshots.length,
      deletedSnapshotCount: this.deletedSnapshotCount,
      snapshots,
      uniqueChunkCount: this.chunks.size,
      unreferencedChunkCount,
      stripeCount: stripes.length,
      totalLogicalBytes,
      totalUniqueChunkBytes,
      totalParityBytes,
      totalPhysicalBytes,
      dedupSavedBytes,
      dedupSavingsPercent,
      effectiveSavingsAfterParityPercent,
      stripes,
      lastScrubReport: this.lastScrubReport,
      shiftBenchmark,
      vaultManifestSha256Hex,
    };
  }

  private createStripeFromRecords(
    records: readonly { readonly chunkId: string; readonly bytes: Uint8Array }[],
  ): StoredStripeEntry {
    this.stripeSequence += 1;
    const stripeId = `stripe-${String(this.stripeSequence).padStart(4, "0")}`;
    const encoded = encodeDualParityStripe(
      records.map((r) => r.bytes),
      stripeId,
    );
    return {
      stripeId,
      dataChunkIds: records.map((r) => r.chunkId),
      stripe: encoded,
      parityPBytes: encoded.parityP.slice(),
      parityQBytes: encoded.parityQ.slice(),
      lastStatus: "healthy",
      lastFaultCount: 0,
      lastHealedShardLabels: [],
    };
  }
}
