/**
 * Wasm64 Wave 84 공개 배럴 진입점 (`wasm64-wave84-8k-delta-tile-offline-sync`).
 *
 * - `content-addressed-tile-store`: 외부 무의존 순수 동기 FIPS 180-4 SHA-256,
 *   PackBits+XOR 델타 압축/복원 및 256×256 희소 머클 타일 저장소
 * - `offline-crdt-tile-sync-engine`: 비행기 모드·저속 LTE 멀티-디바이스 CRDT 타일 동기화,
 *   비파괴 충돌 보관함(`conflictArchive`) 및 뷰포트 우선·이어받기 청크 스케줄러
 * - `sync-telemetry-and-manifest-diff`: 매니페스트 차분 계획, 대역폭 절감률 계측 및
 *   Calm Atelier 한국어 동기화 상태 요약 포맷터
 */

export {
  BYTES_PER_PIXEL_RGBA,
  ContentAddressedTileCanvasStore,
  DEFAULT_CANVAS_HEIGHT_PX,
  DEFAULT_CANVAS_WIDTH_PX,
  DEFAULT_TILE_SIZE_PX,
  cloneDeltaBlob,
  compressTileDelta,
  computeTileManifestMerkleRoot,
  constantTimeEqualHex,
  decompressTileDelta,
  makeTileKey,
  parseTileKey,
  sha256Bytes,
  sha256TileHex,
  type BrushStrokeTileResult,
  type CompressedTileDeltaBlob,
  type StoreIntegrityAuditReport,
  type TileCanvasManifest,
  type TileCanvasStoreOptions,
  type TileCoord,
  type TileDecompressionResult,
  type TileIntegrityErrorCode,
  type TileReadResult,
  type TileWriteReceipt,
} from "./content-addressed-tile-store";

export {
  NETWORK_PROFILE_SPECS,
  OfflineMultiDeviceTileSyncNode,
  compareTileCausalPriority,
  compareVectorClocks,
  makeConflictArchiveId,
  makeTileTransferKey,
  mergeVectorClocks,
  planBandwidthConstrainedSyncBatch,
  type ApplyDeltaPacketResult,
  type BandwidthConstrainedBatchPlan,
  type BidirectionalSyncResult,
  type ConflictArchiveSyncItem,
  type NetworkProfileId,
  type NetworkProfileSpec,
  type OfflineSyncNodeOptions,
  type PeerSyncDigest,
  type RejectedCorruptTileRecord,
  type ResumableSyncCheckpoint,
  type ResumableSyncOptions,
  type ResumableTransferResult,
  type ScheduledSyncChunk,
  type SyncDeviceRole,
  type TileCausalMetadata,
  type TileConflictArchiveEntry,
  type TileEditCommit,
  type TileSyncDeltaItem,
  type TileSyncDeltaPacket,
  type VectorClockRelation,
  type ViewportBoundsPx,
} from "./offline-crdt-tile-sync-engine";

export {
  computeBandwidthSavingsMetrics,
  diffTileCanvasManifests,
  estimateTransferMatrix,
  estimateTransferTimeByProfile,
  formatByteSizeKo,
  formatOfflineSyncStatusSummaryKo,
  formatTransferDurationKo,
  type BandwidthSavingsInput,
  type BandwidthSavingsMetrics,
  type NetworkTransferEstimate,
  type OfflineSyncStatusSummaryInput,
  type OfflineSyncUiPhase,
  type TileManifestDiffReport,
} from "./sync-telemetry-and-manifest-diff";
