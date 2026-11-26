/**
 * WASM64 워커 격리 렌더러 · 28B 바이너리 P2P CRDT 스트로크 델타 ·
 * 우선순위 예측 에셋 프리페처 및 SQLite-WASM 커넥션 풀 공개 진입점.
 *
 * 주의: 이 모듈은 Studio 초기 진입 그래프(`main.tsx`, `studio-legacy-editor-adapter.tsx`)에서
 * 정적으로 import하지 않고, 워커·협업·OPFS 스토리지 초기화 시점에 지연 로드한다.
 */

export {
  DEFAULT_MAX_BATCH_POINTS,
  DEFAULT_TARGET_FPS,
  detectOffscreenRendererCapability,
  OffscreenRendererWorkerBridge,
  POINTER_POINT_STRIDE_BYTES,
  POINTER_POINT_STRIDE_FLOATS,
  type AttachCanvasOptions,
  type Canvas2DContextLike,
  type CoalescedStylusPoint,
  type DispatchedPointerBatch,
  type OffscreenCanvasLike,
  type OffscreenRendererCapability,
  type OffscreenRendererMode,
  type OffscreenRendererTelemetry,
  type OffscreenRendererWorkerBridgeOptions,
  type OffscreenWorkerInboundMessage,
  type OffscreenWorkerLike,
  type OffscreenWorkerOutboundMessage,
  type PointerEventCoalescableLike,
  type TransferableCanvasLike,
  type WorkerMessageEventLike,
} from "./offscreen-renderer-worker-bridge";

export {
  compareCrdtStrokeOps,
  CRDT_BRUSH_WIDTH_SCALE,
  CRDT_MAX_BRUSH_WIDTH,
  CRDT_PACKET_VERSION,
  CRDT_PRESSURE_SCALE,
  CRDT_STROKE_OP_BYTE_LENGTH,
  CrdtStrokeOpKind,
  decodeCrdtStrokeBatch,
  decodeCrdtStrokeOp,
  encodeCrdtStrokeBatch,
  encodeCrdtStrokeOp,
  getCrdtStrokeOpKey,
  LightweightCrdtStrokeLog,
  measureCrdtBandwidthSavings,
  serializeCrdtOpAsJsonBaseline,
  type CrdtBandwidthReport,
  type CrdtLocalStrokeOpInput,
  type CrdtMaterializedPoint,
  type CrdtMaterializedStroke,
  type CrdtStrokeOp,
  type CrdtStrokeOpKindValue,
} from "./lightweight-p2p-crdt-delta";

export {
  PREFETCH_PRIORITY_RANK,
  PredictiveAssetPrefetcher,
  SqliteWasmConnectionPool,
  type PersistentAssetCacheAdapter,
  type PrefetchAssetOptions,
  type PrefetchAssetResult,
  type PrefetchPriority,
  type PredictiveAssetPrefetcherOptions,
  type PredictiveAssetPrefetcherStats,
  type SqlitePoolSlot,
  type SqliteWasmConnectionPoolOptions,
  type SqliteWasmPoolStats,
} from "./predictive-asset-prefetch-and-sqlite-pool";
