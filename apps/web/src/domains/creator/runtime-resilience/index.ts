/**
 * 스튜디오 런타임 복원력(Runtime Resilience) 통합 진입점.
 *
 * - 초저대역 스트로크 델타 브로드캐스트 코덱(≤ 6 KB/s, ≤ 0.25px) 및 재연결·시퀀스 갭 재동기화
 * - SQLite WASM + OPFS 원고 페이지 SHA-256 백그라운드 스크럽·WAL 체크포인트·자동 롤백 복구
 * - requestIdleCallback 시간 슬라이스(≤ 6ms/slice) 3D 배경·VRM PBR/MToon 셰이더 유휴 사전 컴파일러
 * - ArrayBuffer Transferable 제로-카피 워커 익스포트 & 다중 모니터 디스플레이 경계 스냅·패널 고정
 */

import {
  STROKE_DELTA_BANDWIDTH_BUDGET_BYTES_PER_SEC,
  STROKE_DELTA_MAX_COORD_ERROR_PX,
} from "./stroke-delta-broadcast";
import { DEFAULT_WAL_CHECKPOINT_POLICY } from "./sqlite-opfs-wal-scrubber";
import { SHADER_IDLE_MAX_SLICE_BUDGET_MS } from "./shader-idle-prewarmer";
import { DEFAULT_PANEL_SNAP_OPTIONS } from "./zero-copy-export-and-layout-pin";

export {
  DEFAULT_STROKE_RECONNECT_POLICY,
  STROKE_DELTA_BANDWIDTH_BUDGET_BYTES_PER_SEC,
  STROKE_DELTA_DEFAULT_COORD_SCALE,
  STROKE_DELTA_MAX_COORD_ERROR_PX,
  STROKE_DELTA_MAX_POINTS_PER_PACKET,
  STROKE_DELTA_PACKET_MAGIC,
  StrokeDeltaTransportMachine,
  computeReconnectBackoffMs,
  createStrokeDeltaTransportMachine,
  decodeStrokeDeltaPacket,
  encodeStrokeDeltaPacket,
  measureStrokeDeltaBandwidth,
  measureStrokeQuantizationError,
} from "./stroke-delta-broadcast";

export type {
  StrokeBandwidthMetrics,
  StrokeDeltaEncodeOptions,
  StrokeDeltaPacket,
  StrokeDeltaTransportAdapter,
  StrokeDeltaTransportKind,
  StrokeDeltaTransportMachineOptions,
  StrokePointerSample,
  StrokeQuantizationErrorReport,
  StrokeReconnectPolicy,
  StrokeResyncRequest,
  StrokeTransportSnapshot,
  StrokeTransportState,
  StrokeTransportTimerAdapter,
} from "./stroke-delta-broadcast";

export {
  DEFAULT_WAL_CHECKPOINT_POLICY,
  SqliteOpfsWalScrubber,
  computePageSha256Hex,
  createInMemorySqliteOpfsPort,
  createSqliteOpfsWalScrubber,
  evaluateWalScheduleDecision,
  sha256HexSync,
  verifyCheckpointSnapshotIntegrity,
} from "./sqlite-opfs-wal-scrubber";

export type {
  CorruptedPageFinding,
  InMemorySqliteOpfsPort,
  IntegrityScrubReport,
  IntegrityScrubStatus,
  ManuscriptCheckpointRecord,
  ManuscriptPageDigestEntry,
  PageCorruptionReason,
  RollbackRecoveryReceipt,
  ScrubIntegrityOptions,
  SqliteOpfsManuscriptPort,
  SqliteOpfsWalScrubberOptions,
  SqliteWalCheckpointMode,
  SqliteWalStatus,
  WalCheckpointExecResult,
  WalCheckpointSchedulePolicy,
  WalScheduleActionKind,
  WalScheduleDecision,
  WalSchedulerTickResult,
} from "./sqlite-opfs-wal-scrubber";

export {
  SHADER_IDLE_DEFAULT_MAX_CACHE_ENTRIES,
  SHADER_IDLE_DEFAULT_SAFETY_MARGIN_MS,
  SHADER_IDLE_DEFAULT_SLICE_BUDGET_MS,
  SHADER_IDLE_MAX_SLICE_BUDGET_MS,
  ShaderIdlePrewarmer,
  computeShaderVariantCacheKey,
  createDefaultStudioShaderVariants,
  createShaderIdlePrewarmer,
} from "./shader-idle-prewarmer";

export type {
  CompiledShaderCacheEntry,
  EnqueueShaderVariantsOptions,
  ShaderDefineValue,
  ShaderIdleDeadlineLike,
  ShaderIdlePrewarmerOptions,
  ShaderIdleSchedulerAdapter,
  ShaderPipelineKind,
  ShaderPrewarmDrainResult,
  ShaderPrewarmPriority,
  ShaderPrewarmSnapshot,
  ShaderSliceTelemetry,
  ShaderVariantCompiler,
  ShaderVariantDomain,
  ShaderVariantSpec,
} from "./shader-idle-prewarmer";

export {
  DEFAULT_PANEL_SNAP_OPTIONS,
  ZeroCopyExportOrchestrator,
  capturePanelPinSnapshot,
  compositeRgba8LayersInPlace,
  createSimulatedTransferWorkerPort,
  createZeroCopyExportOrchestrator,
  findBestDisplayForPanel,
  prepareZeroCopyLayerTransfer,
  restoreMultiMonitorPanelBatch,
  restorePinnedPanelRect,
  snapAndClampPanelToDisplay,
} from "./zero-copy-export-and-layout-pin";

export type {
  DisplayMonitorBounds,
  ExportLayerBlendMode,
  HorizontalEdgeSnap,
  PanelClampResolution,
  PanelDisplayPinSnapshot,
  PanelRestoreResolution,
  PanelSnapOptions,
  PinnedPanelRect,
  SimulatedTransferWorkerPort,
  SimulatedTransferWorkerRecord,
  TransferableLayerBuffer,
  VerticalEdgeSnap,
  ZeroCopyExportOrchestratorOptions,
  ZeroCopyExportRequest,
  ZeroCopyExportResult,
  ZeroCopyExportTelemetry,
  ZeroCopyWorkerInboundLayer,
  ZeroCopyWorkerPort,
  ZeroCopyWorkerRequestMessage,
  ZeroCopyWorkerResponseMessage,
} from "./zero-copy-export-and-layout-pin";

export interface RuntimeResilienceReadiness {
  readonly strokeDeltaBandwidthBudgetKbPerSec: number;
  readonly strokeDeltaMaxCoordErrorPx: number;
  readonly walMaxRetainedCheckpoints: number;
  readonly shaderMaxIdleSliceMs: number;
  readonly displaySnapThresholdPx: number;
  readonly layoutPinGuard: "active";
  readonly zeroCopyExportReady: true;
  readonly zeroCloudCostKrw: 0;
}

/**
 * 스튜디오 UI 컨트롤에서 런타임 복원력 정책의 핵심 예산·안전 가드 상태를
 * 부작용 없이 즉시 조회하기 위한 순수 요약 생성기.
 */
export function inspectRuntimeResilienceReadiness(): RuntimeResilienceReadiness {
  return {
    strokeDeltaBandwidthBudgetKbPerSec: STROKE_DELTA_BANDWIDTH_BUDGET_BYTES_PER_SEC / 1024,
    strokeDeltaMaxCoordErrorPx: STROKE_DELTA_MAX_COORD_ERROR_PX,
    walMaxRetainedCheckpoints: DEFAULT_WAL_CHECKPOINT_POLICY.maxRetainedCheckpoints,
    shaderMaxIdleSliceMs: SHADER_IDLE_MAX_SLICE_BUDGET_MS,
    displaySnapThresholdPx: DEFAULT_PANEL_SNAP_OPTIONS.snapThresholdPx,
    layoutPinGuard: "active",
    zeroCopyExportReady: true,
    zeroCloudCostKrw: 0,
  };
}
