/**
 * Wave 146 — 증분 원고 스냅샷 금고 계약 타입 정의.
 */

import type {
  FastCdcChunkingOptions,
  FixedVsFastCdcComparisonReport,
  ResolvedFastCdcOptions,
} from "./fastcdc-rolling-chunker";
import type { DualParityHealStatus } from "./gf256-dual-parity-codec";

export interface SnapshotVaultOptions {
  readonly chunking?: FastCdcChunkingOptions;
  readonly stripeDataShards?: number;
}

export interface SnapshotCommitRecord {
  readonly snapshotId: string;
  readonly sequenceNumber: number;
  readonly episodeId: string;
  readonly revisionLabel: string;
  readonly logicalBytes: number;
  readonly chunkCount: number;
  readonly reusedChunkCount: number;
  readonly newChunkCount: number;
  readonly reusedBytes: number;
  readonly newStoredBytes: number;
  readonly dedupReusePercent: number;
  readonly chunkIds: readonly string[];
  readonly payloadSha256Hex: string;
  readonly snapshotRootSha256Hex: string;
  readonly createdStripeIds: readonly string[];
}

export interface SnapshotRestoreResult {
  readonly ok: boolean;
  readonly snapshotId: string;
  readonly bytes: Uint8Array | null;
  readonly logicalBytes: number;
  readonly expectedPayloadSha256Hex: string;
  readonly actualPayloadSha256Hex: string | null;
  readonly missingOrCorruptedChunkIds: readonly string[];
  readonly failureReason:
    | "none"
    | "snapshot-not-found"
    | "chunk-corrupted-or-missing"
    | "root-hash-mismatch";
}

export interface VaultStripeScrubEntry {
  readonly stripeId: string;
  readonly dataChunkIds: readonly string[];
  readonly status: DualParityHealStatus;
  readonly faultCount: number;
  readonly detectedFaultLabels: readonly string[];
  readonly healedShardLabels: readonly string[];
  readonly healedChunkIds: readonly string[];
}

export interface VaultScrubAndHealReport {
  readonly checkedStripeCount: number;
  readonly checkedChunkCount: number;
  readonly healthyStripeCount: number;
  readonly healedStripeCount: number;
  readonly unrecoverableStripeCount: number;
  readonly healedDataChunkCount: number;
  readonly healedParityShardCount: number;
  readonly healedChunkIds: readonly string[];
  readonly unrecoverableStripeIds: readonly string[];
  readonly unrecoverableChunkIds: readonly string[];
  readonly allDataIntact: boolean;
  readonly stripeEntries: readonly VaultStripeScrubEntry[];
  readonly reportSha256Hex: string;
}

export interface VaultCompactionReport {
  readonly reclaimedChunkCount: number;
  readonly reclaimedChunkBytes: number;
  readonly droppedStripeCount: number;
  readonly rebuiltStripeCount: number;
  readonly reclaimedParityBytes: number;
  readonly remainingChunkCount: number;
  readonly remainingStripeCount: number;
  readonly reclaimedChunkIds: readonly string[];
}

export interface VaultStripeHealthSummary {
  readonly stripeId: string;
  readonly dataShardCount: number;
  readonly shardSizeBytes: number;
  readonly parityBytes: number;
  readonly dataChunkIds: readonly string[];
  readonly lastStatus: DualParityHealStatus;
  readonly lastFaultCount: number;
  readonly lastHealedShardLabels: readonly string[];
}

export interface VaultHealthSnapshot {
  readonly chunkingOptions: ResolvedFastCdcOptions;
  readonly stripeDataShards: number;
  readonly activeSnapshotCount: number;
  readonly deletedSnapshotCount: number;
  readonly snapshots: readonly SnapshotCommitRecord[];
  readonly uniqueChunkCount: number;
  readonly unreferencedChunkCount: number;
  readonly stripeCount: number;
  readonly totalLogicalBytes: number;
  readonly totalUniqueChunkBytes: number;
  readonly totalParityBytes: number;
  readonly totalPhysicalBytes: number;
  readonly dedupSavedBytes: number;
  readonly dedupSavingsPercent: number;
  readonly effectiveSavingsAfterParityPercent: number;
  readonly stripes: readonly VaultStripeHealthSummary[];
  readonly lastScrubReport: VaultScrubAndHealReport | null;
  readonly shiftBenchmark: FixedVsFastCdcComparisonReport | null;
  readonly vaultManifestSha256Hex: string;
}
