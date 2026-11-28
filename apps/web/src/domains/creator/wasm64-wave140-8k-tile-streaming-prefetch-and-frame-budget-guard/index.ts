/**
 * Wasm64 Wave 140 공개 배럴 진입점 (`wasm64-wave140-8k-tile-streaming-prefetch-and-frame-budget-guard`).
 *
 * - `tile-streaming-sha256`: 순수 동기 ES2017 FIPS 180-4 SHA-256 및 수치 가드 유틸리티
 * - `tile-pyramid-and-prefetch`: 8K 멀티페이지 타일 피라미드(MIP 0..4) 주소 체계, 줌 히스테리시스 MIP 선택,
 *   뷰포트 속도·줌 가속 기반 150~300ms 선행 프리페치 우선순위 큐
 * - `vram-tile-cache-and-budget-guard`: VRAM 하드 캡·가시/Dirty 핀 보호 SLRU 캐시·Graceful LOD 완화,
 *   60fps/120fps 프레임 업로드 버짓 스로틀링, Naive vs Wave 140 정량 비교 시뮬레이터
 * - `virtual-tile-atlas-wgsl`: 16바이트 정렬 WebGPU 가상 타일 페이지 테이블·MIP 폴백 체인 WGSL 생성/검증기
 * - `tile-streaming-svg-and-report`: 순수 OKLCH 타일 히트맵·프레임 타임라인·VRAM 곡선 SVG 및 한국어 QA 브리프
 */

export {
  clampFinite,
  clampInt,
  roundDeterministic,
  sha256TileStreamingHex,
} from "./tile-streaming-sha256";

export {
  DEFAULT_BYTES_PER_PIXEL,
  DEFAULT_LOOK_AHEAD_MAX_MS,
  DEFAULT_LOOK_AHEAD_MIN_MS,
  DEFAULT_MIP_HYSTERESIS_BAND,
  DEFAULT_TILE_SIZE_PX,
  MAX_TILE_MIP_LEVEL,
  MIN_TILE_MIP_LEVEL,
  clampTileMipLevel,
  computeMipGridDimensions,
  computePyramidTotals,
  computeTileByteSize,
  computeViewportWorldRect,
  createMultiPage8kManuscriptSpec,
  createWebtoon8kVerticalSpec,
  encodeTileKey,
  getCoarseFallbackChain,
  getParentTileKey,
  getTileWorldBounds,
  parseTileKey,
  planViewportTilePrefetch,
  selectTargetMipLevel,
  type CanvasPageGeometry,
  type MipGridDimensions,
  type MipSelectionOptions,
  type MipSelectionResult,
  type MultiPageCanvasSpec,
  type PlannedTileRequest,
  type TileKey,
  type TileKeyId,
  type TileMipLevel,
  type TilePrefetchPlanOptions,
  type TilePriorityClass,
  type ViewportCameraState,
  type ViewportTilePrefetchPlan,
  type WorldRect2D,
} from "./tile-pyramid-and-prefetch";

export {
  DEFAULT_UPLOAD_BUDGET_120FPS_MS,
  DEFAULT_UPLOAD_BUDGET_60FPS_MS,
  DEFAULT_UPLOAD_COST_PER_TILE_MS,
  FRAME_BUDGET_120FPS_MS,
  FRAME_BUDGET_60FPS_MS,
  VramTileStreamingCache,
  buildCanvasPanZoomTrajectory,
  compareNaiveVsPredictiveTileStreaming,
  computePercentile,
  simulateCanvasPanZoomSession,
  type AtlasSlotLocation,
  type BuildTrajectoryOptions,
  type CacheSegment,
  type DirtyPinResult,
  type FrameRateTarget,
  type FrameStepOptions,
  type FrameStreamingTelemetry,
  type IndirectionTableEntrySnapshot,
  type NaiveVsPredictiveComparisonResult,
  type PanZoomScenarioPreset,
  type PanZoomSessionConfig,
  type PanZoomSessionMetrics,
  type PanZoomSessionResult,
  type PanZoomTrajectoryFrame,
  type ResidentTileEntry,
  type TileVisualSnapshotCell,
  type TileVisualState,
  type VramCacheInvariantAudit,
  type VramTileCacheConfig,
} from "./vram-tile-cache-and-budget-guard";

export {
  buildVirtualTileAtlasWgsl,
  validateVirtualTileAtlasWgsl,
  type BuildVirtualTileAtlasWgslOptions,
  type VirtualTileAtlasWgslArtifact,
  type VirtualTileAtlasWgslValidationResult,
} from "./virtual-tile-atlas-wgsl";

export {
  escapeTileStreamingXml,
  renderTileStreamingTelemetrySvg,
  summarizeTileStreamingSessionKo,
  type TileStreamingSummaryKoOptions,
  type TileStreamingTelemetrySvgOptions,
} from "./tile-streaming-svg-and-report";
