/**
 * 차세대 웹 플랫폼 런타임 (`webgpu-nextgen-runtime`) 공개 진입점.
 * - Zero-Copy 선형 메모리 · SharedArrayBuffer SPSC 링버퍼 타일 버스
 * - 적응형 스크린-스페이스 3D LOD · 절두체 컬링 · 프레임 예산 거버너
 * - P2P Vector-Clock CRDT 델타 메시 · 런타임 카나리 자동 롤백 오라클
 * - Calm Atelier 단독 콘솔 패널
 */

export {
  RING_HEADER_OFFSET,
  SLOT_META_OFFSET,
  SLOT_STATE,
  TILE_RING_CACHE_LINE_BYTES,
  TILE_RING_HEADER_BYTES,
  TILE_RING_HEADER_WORDS,
  TILE_RING_MAGIC,
  TILE_RING_VERSION,
  TILE_SLOT_META_BYTES,
  TILE_SLOT_META_WORDS,
  ZeroCopyTileRingBus,
  computeCrc32,
  computeFnv1a32,
  computeTileIntegrityChecksums,
  isCrossOriginIsolatedRuntime,
  type MemoryPressureLevel,
  type MemoryPressureReclaimOptions,
  type MemoryPressureReclaimReport,
  type TileConsumeResult,
  type TileFrameDescriptor,
  type TileIntegrityChecksums,
  type TileRingBackingMode,
  type TileRingBackingPreference,
  type TileRingConfig,
  type TileRingTelemetrySnapshot,
  type TileWriteResult,
} from "./zero-copy-tile-ring";

export {
  runZeroCopyTileRingBenchmark,
  type ZeroCopyRingBenchmarkOptions,
  type ZeroCopyRingBenchmarkReport,
} from "./zero-copy-tile-ring-benchmark";

export {
  AdaptiveLodGovernor,
  CATEGORY_ERROR_WEIGHT,
  FRAME_BUDGET_MS_BY_HZ,
  GPU_TIER_PROFILES,
  computeProjectedScreenSpaceErrorPx,
  createDefaultWebtoonSceneAssets,
  evaluateAssetFrustumVisibility,
  type AssetLodDecision,
  type AssetLodLevelSpec,
  type CameraFrustumState,
  type FrameRateTargetHz,
  type GpuDeviceTier,
  type GpuTierBudgetProfile,
  type LodGovernorConfig,
  type LodGovernorFrameReport,
  type LodLevel,
  type SceneAssetCategory,
  type SceneLodAsset,
  type Vec3Tuple,
} from "./adaptive-lod-governor";

export {
  CANARY_TELEMETRY_PRESETS,
  DEFAULT_CANARY_SLO_THRESHOLDS,
  P2pCrdtDeltaMesh,
  compactCrdtOperations,
  decodeCrdtDeltaPacket,
  encodeCrdtDeltaPacket,
  evaluateCanaryReleaseHealth,
  runP2pMeshConvergenceScenario,
  type CanaryDerivedMetrics,
  type CanaryHealthEvaluation,
  type CanaryMetricKey,
  type CanaryPresetScenario,
  type CanaryReleaseDecision,
  type CanarySloThresholds,
  type CanaryTelemetrySnapshot,
  type CanaryTriggerReason,
  type CanaryTriggerSeverity,
  type CompactBatchResult,
  type ConvergedSceneNodeState,
  type ConvergedStrokeState,
  type CrdtApplyOutcome,
  type CrdtDeltaPacket,
  type CrdtEntityStamp,
  type CrdtSyncOperation,
  type DecodedCrdtWireResult,
  type EncodedCrdtWireFrame,
  type P2pMeshConvergenceReport,
  type P2pMeshPeerSnapshot,
  type P2pTransportKind,
} from "./p2p-canary-guard";

export {
  StudioWebGpuNextgenRuntimePanel,
  type StudioWebGpuNextgenRuntimePanelProps,
  type WebGpuNextgenRuntimeTabId,
} from "./StudioWebGpuNextgenRuntimePanel";
