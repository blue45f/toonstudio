/**
 * Wave 158 — 로컬 OPFS/SQLite 크래시 복구 바이너리 WAL(CRC-32C) 및
 * 스토리지 할당량(Quota) 가비지 컬렉터 도메인 타입 계약.
 *
 * - ES2017 strict 호환 (`any`·BigInt 리터럴 미사용, `verbatimModuleSyntax` 준수)
 * - 프레임 바이너리 레이아웃: 32바이트 헤더 + 가변 페이로드 + 4바이트 Castagnoli CRC-32C 푸터
 */

/** ToonStudio 바이너리 WAL 매직 넘버 (`TSW1` = 0x54535731). */
export const WAL_FRAME_MAGIC = 0x54535731;

/** 현재 지원하는 바이너리 WAL 포맷 버전. */
export const WAL_FORMAT_VERSION = 1;

/** 고정 바이너리 프레임 헤더 길이(바이트). */
export const WAL_HEADER_BYTES = 32;

/** 고정 Castagnoli CRC-32C 푸터 길이(바이트). */
export const WAL_CRC_FOOTER_BYTES = 4;

/** 프레임 오버헤드 총 바이트(헤더 + CRC 푸터). */
export const WAL_FRAME_OVERHEAD_BYTES = WAL_HEADER_BYTES + WAL_CRC_FOOTER_BYTES;

/** 단일 WAL 프레임 최대 허용 페이로드 길이(64 MiB, 헤더 손상 방어선). */
export const WAL_MAX_PAYLOAD_BYTES = 64 * 1024 * 1024;

/** 바이너리 WAL 연산 종류. */
export type WalOpType =
  | "TX_BEGIN"
  | "STROKE_APPEND"
  | "LAYER_PATCH"
  | "PANEL_UPDATE"
  | "TX_COMMIT"
  | "TX_ABORT"
  | "CHECKPOINT";

/** WAL 연산 종류별 바이너리 코드 매핑. */
export const WAL_OP_TYPE_TO_CODE: Readonly<Record<WalOpType, number>> = {
  TX_BEGIN: 1,
  STROKE_APPEND: 2,
  LAYER_PATCH: 3,
  PANEL_UPDATE: 4,
  TX_COMMIT: 5,
  TX_ABORT: 6,
  CHECKPOINT: 7,
};

/** 바이너리 코드에서 WAL 연산 종류로의 역매핑. */
export const WAL_CODE_TO_OP_TYPE: Readonly<Record<number, WalOpType>> = {
  1: "TX_BEGIN",
  2: "STROKE_APPEND",
  3: "LAYER_PATCH",
  4: "PANEL_UPDATE",
  5: "TX_COMMIT",
  6: "TX_ABORT",
  7: "CHECKPOINT",
};

/** WAL 프레임 인코딩 입력 레코드. */
export interface WalFrameInput {
  readonly lsn: number;
  readonly txId: number;
  readonly opType: WalOpType;
  readonly timestampMs: number;
  readonly payload: Uint8Array;
  readonly version?: number;
}

/** 디코딩 및 CRC-32C 검증을 통과한 단일 WAL 프레임 레코드. */
export interface WalFrameRecord {
  readonly version: number;
  readonly lsn: number;
  readonly txId: number;
  readonly opType: WalOpType;
  readonly timestampMs: number;
  readonly payload: Uint8Array;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly crc32c: number;
}

/** 단일 프레임 디코딩 실패 사유. */
export type WalDecodeFailureReason =
  | "truncated_header"
  | "magic_mismatch"
  | "unsupported_version"
  | "invalid_op_type"
  | "truncated_payload"
  | "truncated_crc"
  | "crc_mismatch";

/** 단일 프레임 디코딩 성공 결과. */
export interface WalFrameDecodeSuccess {
  readonly ok: true;
  readonly record: WalFrameRecord;
  readonly nextOffset: number;
}

/** 단일 프레임 디코딩 실패 결과. */
export interface WalFrameDecodeFailure {
  readonly ok: false;
  readonly reason: WalDecodeFailureReason;
  readonly byteOffset: number;
  readonly detail: string;
  readonly expectedCrc32c?: number;
  readonly actualCrc32c?: number;
}

/** 단일 프레임 디코딩 결과(판별 유니온). */
export type WalFrameDecodeResult = WalFrameDecodeSuccess | WalFrameDecodeFailure;

/** 스트림 중간 프레임 손상(Fail-Closed 중단) 상세 기록. */
export interface WalCorruptionFault {
  readonly reason: Exclude<
    WalDecodeFailureReason,
    "truncated_header" | "truncated_payload" | "truncated_crc"
  >;
  readonly byteOffset: number;
  readonly lsnBeforeCorruption: number;
  readonly detail: string;
  readonly expectedCrc32c?: number;
  readonly actualCrc32c?: number;
}

/** WAL 스트림 전체 스캔 결과. */
export interface WalStreamScanResult {
  readonly records: readonly WalFrameRecord[];
  readonly totalInputBytes: number;
  readonly validByteEndOffset: number;
  readonly truncatedTailBytes: number;
  readonly tornWriteDetected: boolean;
  readonly tornWriteReason: "truncated_header" | "truncated_payload" | "truncated_crc" | null;
  readonly corruptionStop: WalCorruptionFault | null;
}

/** 트랜잭션 시작/종료 메타 페이로드. */
export interface WalTxMetaPayload {
  readonly episodeId: string;
  readonly note?: string;
}

/** 스트로크 추가 페이로드. */
export interface WalStrokeAppendPayload {
  readonly strokeId: string;
  readonly layerId: string;
  readonly pointCount: number;
  readonly colorToken: string;
  readonly widthPx: number;
  readonly digestHex?: string;
}

/** 레이어 속성 패치 페이로드. */
export interface WalLayerPatchPayload {
  readonly layerId: string;
  readonly name?: string;
  readonly opacity?: number;
  readonly visible?: boolean;
  readonly blendMode?: string;
  readonly zIndex?: number;
}

/** 컷 패널 갱신 페이로드. */
export interface WalPanelUpdatePayload {
  readonly panelId: string;
  readonly orderIndex: number;
  readonly heightPx: number;
  readonly gutterPx: number;
  readonly caption?: string;
}

/** 체크포인트 메타 페이로드. */
export interface WalCheckpointPayload {
  readonly episodeId: string;
  readonly checkpointLsn: number;
  readonly stateSha256Hex: string;
  readonly committedTxCount: number;
}

/** 복원된 스트로크 상태. */
export interface MaterializedStroke {
  readonly strokeId: string;
  readonly layerId: string;
  readonly pointCount: number;
  readonly colorToken: string;
  readonly widthPx: number;
  readonly digestHex: string;
  readonly lastLsn: number;
}

/** 복원된 레이어 상태. */
export interface MaterializedLayer {
  readonly layerId: string;
  readonly name: string;
  readonly opacity: number;
  readonly visible: boolean;
  readonly blendMode: string;
  readonly zIndex: number;
  readonly lastLsn: number;
}

/** 복원된 패널 상태. */
export interface MaterializedPanel {
  readonly panelId: string;
  readonly orderIndex: number;
  readonly heightPx: number;
  readonly gutterPx: number;
  readonly caption: string;
  readonly lastLsn: number;
}

/** WAL 재생으로 구체화된 결정론적 회차 상태. */
export interface MaterializedEpisodeState {
  readonly episodeId: string;
  readonly layers: readonly MaterializedLayer[];
  readonly panels: readonly MaterializedPanel[];
  readonly strokes: readonly MaterializedStroke[];
}

/** 트랜잭션 격리 감사 기록. */
export type WalTransactionStatus = "committed" | "aborted" | "uncommitted_orphaned";

export interface WalTransactionAudit {
  readonly txId: number;
  readonly status: WalTransactionStatus;
  readonly beginLsn: number;
  readonly endLsn: number | null;
  readonly opCount: number;
  readonly appliedOpCount: number;
}

/** WAL 복구 건강 상태. */
export type WalHealthStatus =
  | "clean"
  | "recovered_torn_tail"
  | "halted_corrupted_frame";

/** WAL 재생 옵션. */
export interface WalReplayOptions {
  readonly defaultEpisodeId?: string;
}

/** WAL 재생 및 크래시 복구 결과. */
export interface WalReplayResult {
  readonly episodeId: string;
  readonly recoveredState: MaterializedEpisodeState;
  readonly stateSha256Hex: string;
  readonly totalBytesScanned: number;
  readonly validByteEndOffset: number;
  readonly truncatedTailBytes: number;
  readonly tornWriteTruncated: boolean;
  readonly tornWriteReason: "truncated_header" | "truncated_payload" | "truncated_crc" | null;
  readonly corruptedMiddleFrame: WalCorruptionFault | null;
  readonly lastValidLsn: number;
  readonly lastCheckpointLsn: number | null;
  readonly validFrameCount: number;
  readonly committedTxCount: number;
  readonly abortedTxCount: number;
  readonly uncommittedTxCount: number;
  readonly committedOpCount: number;
  readonly discardedOpCount: number;
  readonly transactions: readonly WalTransactionAudit[];
  readonly healthStatus: WalHealthStatus;
}

/** 체크포인트 압축 옵션. */
export interface WalCompactionOptions {
  readonly defaultEpisodeId?: string;
  readonly checkpointTimestampMs?: number;
  readonly startingLsn?: number;
}

/** 체크포인트 압축 결과. */
export interface WalCompactionResult {
  readonly originalBytes: number;
  readonly compactedBytes: number;
  readonly reclaimedBytes: number;
  readonly reductionRatio: number;
  readonly originalFrameCount: number;
  readonly compactedFrameCount: number;
  readonly checkpointLsn: number;
  readonly stateSha256Before: string;
  readonly stateSha256After: string;
  readonly stateHashEquivalent: boolean;
  readonly compactedStream: Uint8Array;
  readonly compactedReplay: WalReplayResult;
}

/** OPFS/SQLite 로컬 스토리지 버킷 분류. */
export type OpfsStorageBucketKind =
  | "orphan_wal_chunk"
  | "expired_render_cache"
  | "synced_cold_snapshot"
  | "synced_preview_tile"
  | "active_wal_segment"
  | "unsynced_episode_db";

/** 스토리지 할당량 압박 등급. */
export type QuotaPressureTier = "healthy" | "elevated" | "critical" | "emergency";

/** OPFS/SQLite 개별 스토리지 항목 메타데이터. */
export interface OpfsStorageEntry {
  readonly id: string;
  readonly episodeId: string;
  readonly labelKo: string;
  readonly bucket: OpfsStorageBucketKind;
  readonly bytes: number;
  readonly lastAccessedMs: number;
  readonly unsyncedDirty: boolean;
  readonly pinnedActive: boolean;
}

/** 할당량 가비지 컬렉션 정책. */
export interface OpfsQuotaPolicy {
  readonly elevatedThresholdRatio: number;
  readonly criticalThresholdRatio: number;
  readonly emergencyThresholdRatio: number;
  readonly targetFreeRatio: number;
  readonly dirtyUnsyncedWarningRatio: number;
  readonly bucketEvictionOrder: readonly OpfsStorageBucketKind[];
}

/** 할당량 가비지 컬렉션 입력. */
export interface OpfsQuotaGcInput {
  readonly quotaBytes: number;
  readonly entries: readonly OpfsStorageEntry[];
  readonly policy?: Partial<OpfsQuotaPolicy>;
}

/** 할당량 분석 및 미동기화 원고 보호 기반 회수 계획. */
export interface OpfsEvictionPlan {
  readonly quotaBytes: number;
  readonly usedBytesBefore: number;
  readonly usedBytesAfter: number;
  readonly freeBytesBefore: number;
  readonly freeBytesAfter: number;
  readonly utilizationBefore: number;
  readonly utilizationAfter: number;
  readonly pressureTierBefore: QuotaPressureTier;
  readonly pressureTierAfter: QuotaPressureTier;
  readonly targetUsedBytes: number;
  readonly targetFreeRatio: number;
  readonly bytesNeededToReclaim: number;
  readonly reclaimableTotalBytes: number;
  readonly plannedReclaimBytes: number;
  readonly shortfallBytes: number;
  readonly protectedDirtyBytes: number;
  readonly protectedActiveBytes: number;
  readonly evictEntries: readonly OpfsStorageEntry[];
  readonly keptEntries: readonly OpfsStorageEntry[];
  readonly protectedEntries: readonly OpfsStorageEntry[];
  readonly targetHeadroomMet: boolean;
  readonly dirtyBlocksHeadroom: boolean;
  readonly warningsKo: readonly string[];
  readonly operatorActionsKo: readonly string[];
  readonly bucketBreakdownBefore: Readonly<Record<OpfsStorageBucketKind, number>>;
  readonly bucketBreakdownAfter: Readonly<Record<OpfsStorageBucketKind, number>>;
}

/** 한국어 스튜디오 QA 진단 보고서 및 OKLCH SVG 시각화 산출물. */
export interface WalRecoveryReport {
  readonly headlineKo: string;
  readonly summaryLinesKo: readonly string[];
  readonly svgDiagram: string;
  readonly recoveryProofSha256Hex: string;
}

/** 통합 오케스트레이터 입력. */
export interface OpfsWalRecoveryOrchestrationInput {
  readonly walStream: Uint8Array;
  readonly quotaInput: OpfsQuotaGcInput;
  readonly replayOptions?: WalReplayOptions;
  readonly compactionOptions?: WalCompactionOptions;
  readonly skipCompaction?: boolean;
}

/** 통합 오케스트레이터 실행 결과. */
export interface OpfsWalRecoveryOrchestrationResult {
  readonly replay: WalReplayResult;
  readonly compaction: WalCompactionResult | null;
  readonly quotaPlan: OpfsEvictionPlan;
  readonly report: WalRecoveryReport;
  readonly overallHealthy: boolean;
  readonly recoveryProofSha256Hex: string;
}
