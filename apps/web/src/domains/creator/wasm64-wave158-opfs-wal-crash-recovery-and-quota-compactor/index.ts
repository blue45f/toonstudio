/**
 * Wasm64 Wave 158 공개 배럴 진입점 (`wasm64-wave158-opfs-wal-crash-recovery-and-quota-compactor`).
 *
 * - `wal-binary-crc32c-codec`: Castagnoli CRC-32C(`0x82f63b78`) 바이너리 WAL 프레임 코덱 및
 *   순수 TypeScript FIPS 180-4 SHA-256 무결성 증명
 * - `wal-replay-and-compactor`: 트랜잭션 원자 격리 WAL 재생 엔진, 끝단 잘림 절단,
 *   중간 손상 Fail-Closed 차단, 상태 해시 동치 체크포인트 압축기
 * - `opfs-quota-gc-governor`: 미동기화 원고·활성 세션 절대 보호 OPFS/SQLite 할당량 GC 플래너
 * - `wal-recovery-report`: 순수 OKLCH SVG 진단 차트 및 자연스러운 한국어 QA 보고서
 */

import {
  computeSha256Hex,
  encodeJsonPayload,
  encodeWalStream,
} from "./wal-binary-crc32c-codec";
import { planOpfsQuotaGarbageCollection } from "./opfs-quota-gc-governor";
import { compactWalStream, replayWalStream } from "./wal-replay-and-compactor";
import { buildWalRecoveryReport } from "./wal-recovery-report";
import type {
  OpfsStorageEntry,
  OpfsWalRecoveryOrchestrationInput,
  OpfsWalRecoveryOrchestrationResult,
  WalFrameInput,
} from "./wal-recovery-types";

export {
  WAL_CODE_TO_OP_TYPE,
  WAL_CRC_FOOTER_BYTES,
  WAL_FORMAT_VERSION,
  WAL_FRAME_MAGIC,
  WAL_FRAME_OVERHEAD_BYTES,
  WAL_HEADER_BYTES,
  WAL_MAX_PAYLOAD_BYTES,
  WAL_OP_TYPE_TO_CODE,
  type MaterializedEpisodeState,
  type MaterializedLayer,
  type MaterializedPanel,
  type MaterializedStroke,
  type OpfsEvictionPlan,
  type OpfsQuotaGcInput,
  type OpfsQuotaPolicy,
  type OpfsStorageBucketKind,
  type OpfsStorageEntry,
  type OpfsWalRecoveryOrchestrationInput,
  type OpfsWalRecoveryOrchestrationResult,
  type QuotaPressureTier,
  type WalCheckpointPayload,
  type WalCompactionOptions,
  type WalCompactionResult,
  type WalCorruptionFault,
  type WalDecodeFailureReason,
  type WalFrameDecodeFailure,
  type WalFrameDecodeResult,
  type WalFrameDecodeSuccess,
  type WalFrameInput,
  type WalFrameRecord,
  type WalHealthStatus,
  type WalLayerPatchPayload,
  type WalOpType,
  type WalPanelUpdatePayload,
  type WalRecoveryReport,
  type WalReplayOptions,
  type WalReplayResult,
  type WalStreamScanResult,
  type WalStrokeAppendPayload,
  type WalTransactionAudit,
  type WalTransactionStatus,
  type WalTxMetaPayload,
} from "./wal-recovery-types";

export {
  canonicalJsonStringify,
  computeCrc32c,
  computeSha256Hex,
  computeSha256Utf8Hex,
  decodeJsonPayload,
  decodeWalFrameAt,
  encodeJsonPayload,
  encodeWalFrame,
  encodeWalStream,
  scanWalStream,
} from "./wal-binary-crc32c-codec";

export {
  compactWalStream,
  computeMaterializedStateSha256Hex,
  replayWalStream,
} from "./wal-replay-and-compactor";

export {
  DEFAULT_OPFS_QUOTA_POLICY,
  classifyQuotaPressureTier,
  isProtectedOpfsEntry,
  planOpfsQuotaGarbageCollection,
} from "./opfs-quota-gc-governor";

export {
  buildWalRecoveryReport,
  renderWalQuotaDiagnosticSvg,
  type BuildWalRecoveryReportInput,
} from "./wal-recovery-report";

/**
 * 로컬 OPFS/SQLite WAL 크래시 복구, 체크포인트 압축, 미동기화 원고 보호 기반 할당량 GC,
 * OKLCH 진단 보고서 및 FIPS 180-4 SHA-256 복구 증명을 일괄 실행한다.
 */
export function runOpfsWalCrashRecoveryAndQuotaPlan(
  input: OpfsWalRecoveryOrchestrationInput
): OpfsWalRecoveryOrchestrationResult {
  const rawWalSha256Hex = computeSha256Hex(input.walStream);
  const replay = replayWalStream(input.walStream, input.replayOptions);
  const compaction = input.skipCompaction
    ? null
    : compactWalStream(input.walStream, {
        defaultEpisodeId: input.replayOptions?.defaultEpisodeId,
        ...input.compactionOptions,
      });
  const quotaPlan = planOpfsQuotaGarbageCollection(input.quotaInput);
  const report = buildWalRecoveryReport({
    replay,
    compaction,
    quotaPlan,
    rawWalSha256Hex,
  });

  const walHealthy =
    replay.corruptedMiddleFrame === null &&
    (compaction === null || compaction.stateHashEquivalent);
  const quotaHealthy =
    quotaPlan.targetHeadroomMet &&
    quotaPlan.pressureTierAfter !== "critical" &&
    quotaPlan.pressureTierAfter !== "emergency";

  return {
    replay,
    compaction,
    quotaPlan,
    report,
    overallHealthy: walHealthy && quotaHealthy,
    recoveryProofSha256Hex: report.recoveryProofSha256Hex,
  };
}

/**
 * `/studio` 런타임 허브 자가 점검과 데모 검증에 쓰는 결정론적 시나리오 픽스처를 생성한다.
 * - 반복 패치 + 중단 트랜잭션 + 끝단 잘림이 섞인 실제 웹툰 작업 WAL 스트림
 * - 88% 용량 압박 하에서 미동기화 원고를 보호하고 고아 WAL·만료 캐시를 정리하는 OPFS 인벤토리
 */
export function createSampleOpfsWalRecoveryScenario(): OpfsWalRecoveryOrchestrationInput {
  const episodeId = "ep-042-seoul-rooftop";
  const t0 = 1764300000000;
  const frames: WalFrameInput[] = [
    {
      lsn: 1,
      txId: 101,
      opType: "TX_BEGIN",
      timestampMs: t0,
      payload: encodeJsonPayload({ episodeId }),
    },
    {
      lsn: 2,
      txId: 101,
      opType: "LAYER_PATCH",
      timestampMs: t0 + 10,
      payload: encodeJsonPayload({
        layerId: "layer-ink",
        name: "선화 초안",
        opacity: 0.7,
        visible: true,
        blendMode: "normal",
        zIndex: 1,
      }),
    },
    {
      lsn: 3,
      txId: 101,
      opType: "PANEL_UPDATE",
      timestampMs: t0 + 20,
      payload: encodeJsonPayload({
        panelId: "cut-01",
        orderIndex: 0,
        heightPx: 1400,
        gutterPx: 48,
        caption: "옥상 도입부 초안",
      }),
    },
    {
      lsn: 4,
      txId: 101,
      opType: "STROKE_APPEND",
      timestampMs: t0 + 30,
      payload: encodeJsonPayload({
        strokeId: "stroke-001",
        layerId: "layer-ink",
        pointCount: 48,
        colorToken: "oklch(0.18 0.02 250)",
        widthPx: 2.4,
      }),
    },
    {
      lsn: 5,
      txId: 101,
      opType: "TX_COMMIT",
      timestampMs: t0 + 40,
      payload: encodeJsonPayload({ episodeId }),
    },
    {
      lsn: 6,
      txId: 102,
      opType: "TX_BEGIN",
      timestampMs: t0 + 100,
      payload: encodeJsonPayload({ episodeId }),
    },
    {
      lsn: 7,
      txId: 102,
      opType: "LAYER_PATCH",
      timestampMs: t0 + 110,
      payload: encodeJsonPayload({
        layerId: "layer-ink",
        name: "선화 정리",
        opacity: 0.85,
      }),
    },
    {
      lsn: 8,
      txId: 102,
      opType: "LAYER_PATCH",
      timestampMs: t0 + 120,
      payload: encodeJsonPayload({
        layerId: "layer-ink",
        name: "선화 최종",
        opacity: 1,
      }),
    },
    {
      lsn: 9,
      txId: 102,
      opType: "PANEL_UPDATE",
      timestampMs: t0 + 130,
      payload: encodeJsonPayload({
        panelId: "cut-01",
        orderIndex: 0,
        heightPx: 1520,
        gutterPx: 56,
        caption: "옥상 도입부 최종",
      }),
    },
    {
      lsn: 10,
      txId: 102,
      opType: "TX_COMMIT",
      timestampMs: t0 + 140,
      payload: encodeJsonPayload({ episodeId }),
    },
    {
      lsn: 11,
      txId: 103,
      opType: "TX_BEGIN",
      timestampMs: t0 + 200,
      payload: encodeJsonPayload({ episodeId }),
    },
    {
      lsn: 12,
      txId: 103,
      opType: "STROKE_APPEND",
      timestampMs: t0 + 210,
      payload: encodeJsonPayload({
        strokeId: "stroke-aborted",
        layerId: "layer-ink",
        pointCount: 99,
        colorToken: "oklch(0.55 0.16 26)",
        widthPx: 6,
      }),
    },
    {
      lsn: 13,
      txId: 103,
      opType: "TX_ABORT",
      timestampMs: t0 + 220,
      payload: encodeJsonPayload({ episodeId }),
    },
    {
      lsn: 14,
      txId: 104,
      opType: "TX_BEGIN",
      timestampMs: t0 + 300,
      payload: encodeJsonPayload({ episodeId }),
    },
    {
      lsn: 15,
      txId: 104,
      opType: "STROKE_APPEND",
      timestampMs: t0 + 310,
      payload: encodeJsonPayload({
        strokeId: "stroke-torn-tail",
        layerId: "layer-ink",
        pointCount: 64,
        colorToken: "oklch(0.42 0.08 156)",
        widthPx: 3.2,
      }),
    },
  ];

  const fullStream = encodeWalStream(frames);
  // 마지막 미커밋 스트로크 프레임의 끝 10바이트가 정전·브라우저 강제 종료로 잘린 상황을 모사
  const tornWalStream = fullStream.slice(0, fullStream.length - 10);

  const mb = 1024 * 1024;
  const entries: OpfsStorageEntry[] = [
    {
      id: "ep-042-sqlite-main",
      episodeId,
      labelKo: "42화 미동기화 SQLite 원고 DB",
      bucket: "unsynced_episode_db",
      bytes: 280 * mb,
      lastAccessedMs: t0 + 500,
      unsyncedDirty: true,
      pinnedActive: true,
    },
    {
      id: "ep-042-wal-active",
      episodeId,
      labelKo: "42화 활성 바이너리 WAL 세그먼트",
      bucket: "active_wal_segment",
      bytes: 60 * mb,
      lastAccessedMs: t0 + 510,
      unsyncedDirty: true,
      pinnedActive: true,
    },
    {
      id: "orphan-wal-039",
      episodeId: "ep-039",
      labelKo: "39화 고아 WAL 잔여 청크",
      bucket: "orphan_wal_chunk",
      bytes: 110 * mb,
      lastAccessedMs: t0 - 86400000 * 6,
      unsyncedDirty: false,
      pinnedActive: false,
    },
    {
      id: "cache-render-040",
      episodeId: "ep-040",
      labelKo: "40화 만료 8K 타일 렌더 캐시",
      bucket: "expired_render_cache",
      bytes: 140 * mb,
      lastAccessedMs: t0 - 86400000 * 4,
      unsyncedDirty: false,
      pinnedActive: false,
    },
    {
      id: "snapshot-cold-038",
      episodeId: "ep-038",
      labelKo: "38화 동기화 완료 콜드 스냅샷",
      bucket: "synced_cold_snapshot",
      bytes: 180 * mb,
      lastAccessedMs: t0 - 86400000 * 10,
      unsyncedDirty: false,
      pinnedActive: false,
    },
    {
      id: "preview-tile-041",
      episodeId: "ep-041",
      labelKo: "41화 동기화 완료 썸네일 타일",
      bucket: "synced_preview_tile",
      bytes: 110 * mb,
      lastAccessedMs: t0 - 86400000 * 1,
      unsyncedDirty: false,
      pinnedActive: false,
    },
  ];

  return {
    walStream: tornWalStream,
    quotaInput: {
      quotaBytes: 1000 * mb,
      entries,
    },
    replayOptions: {
      defaultEpisodeId: episodeId,
    },
    compactionOptions: {
      defaultEpisodeId: episodeId,
      checkpointTimestampMs: t0 + 1000,
    },
  };
}
