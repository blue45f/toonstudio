/**
 * WASM64 무비용($0) 드로우콜 병합기 · 동적 Skyline 텍스처 아틀라스 패커 · 프레임 예산 셰이더/WASM 프리워머.
 *
 * 주의: Studio 초기 진입 그래프(`main.tsx`, `studio-legacy-editor-adapter.tsx`)에서
 * 정적으로 import하지 않고, 캔버스/WebGPU 렌더러 초기화 시점에 지연 로드(on-demand)한다.
 */

export {
  DEFAULT_COALESCER_CAPACITY,
  DEFAULT_MAX_LOOKBACK_BATCHES,
  DRAW_PRIMITIVE_STRIDE_BYTES,
  DrawBlendMode,
  DrawPrimitiveFlag,
  DrawPrimitiveKind,
  Wasm64DrawCallCoalescer,
  aabbOverlaps,
  resolveDrawPrimitiveKindCode,
  type CoalesceResult,
  type CoalescedDrawBatch,
  type DecodedDrawPrimitive,
  type DrawBatchBounds,
  type DrawBlendModeCode,
  type DrawCallCoalesceMetrics,
  type DrawPrimitiveInput,
  type DrawPrimitiveKindCode,
  type DrawPrimitiveKindName,
  type Wasm64DrawCallCoalescerOptions,
} from "./wasm64-draw-call-coalescer";

export {
  DEFAULT_ATLAS_HEIGHT,
  DEFAULT_ATLAS_WIDTH,
  MIN_ATLAS_PADDING,
  Wasm64TextureAtlasPacker,
  computeDirtyRectUnion,
  type AtlasAllocation,
  type AtlasDirtyBatch,
  type AtlasEvictionResult,
  type AtlasOccupancyTelemetry,
  type AtlasRect,
  type Wasm64TextureAtlasPackerOptions,
} from "./wasm64-texture-atlas-packer";

export {
  DEFAULT_PREWARM_MAX_SLICE_MS,
  Wasm64ShaderPrewarmer,
  type PrewarmArtifactKind,
  type PrewarmPriority,
  type PrewarmTaskDescriptor,
  type PrewarmTaskResult,
  type PrewarmTaskStatus,
  type PrewarmTelemetry,
  type PrewarmTerminalStatus,
  type PrewarmYieldContext,
  type Wasm64ShaderPrewarmerOptions,
} from "./wasm64-shader-prewarmer";
