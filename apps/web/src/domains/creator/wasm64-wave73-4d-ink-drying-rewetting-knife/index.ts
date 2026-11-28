/**
 * Wasm64 Wave 73 공개 배럴 진입점 (`wasm64-wave73-4d-ink-drying-rewetting-knife`).
 *
 * - `temporal-ink-drying-field`: 4D 시공간 잉크 건조 상태장(`TemporalInkCanvasField`),
 *   4대 매체 물리 프로파일(`TEMPORAL_MEDIA_PROFILES`), 대시간 증발·경화 적분기 및
 *   비트 동일 타임-트래블 스크러빙 엔진
 * - `rewetting-bloom-and-knife-scraper`: 매체 선택적 물리 재습윤·콜리플라워 블룸 커널 및
 *   팔레트 나이프 스크래핑·스그라피토·비드 퇴적 커널
 * - `temporal-drying-wgsl-shaders`: WebGPU 3종 컴퓨트 WGSL 셰이더, 16-byte 정렬 유니폼 패커 및
 *   정적 WGSL 계약 검증기
 */

export {
  TEMPORAL_MEDIA_PROFILES,
  TEMPORAL_MEDIUM_ORDER,
  advanceTemporalDryingState,
  captureTemporalInkSnapshot,
  clamp01,
  clampRange,
  computeFieldPigmentMetrics,
  computeTemporalFieldBitHash,
  createTemporalInkCanvasField,
  depositTemporalInkStroke,
  generateDeterministicPaperTooth,
  getTemporalMediaProfileByIndex,
  paintUnderpaintingLayer,
  restoreTemporalInkSnapshot,
  sanitizePositive,
  scrubTemporalDryingTimeline,
  type DryingEnvironmentConfig,
  type Rgb3Tuple,
  type Rgba4Tuple,
  type SpatialTemporalStrokeEvent,
  type StrokeDepositResult,
  type TemporalDryingStepResult,
  type TemporalFieldPigmentMetrics,
  type TemporalInkCanvasField,
  type TemporalInkCanvasInitOptions,
  type TemporalInkSnapshot,
  type TemporalMediaProfile,
  type TemporalMediumId,
  type TemporalScrubResult,
  type TemporalStrokePoint,
} from "./temporal-ink-drying-field";

export {
  applyCleanWaterRewetBrush,
  applyPaletteKnifeScrape,
  sampleCompositedSurfaceRgba,
  type AccumulatedKnifeBead,
  type CleanWaterRewetParams,
  type CleanWaterRewetResult,
  type CompositedSurfaceSample,
  type PaletteKnifePoint,
  type PaletteKnifeScrapeParams,
  type PaletteKnifeScrapeResult,
  type RewetBrushPoint,
  type RewetSolventType,
} from "./rewetting-bloom-and-knife-scraper";

export {
  PALETTE_KNIFE_SGRAFFITO_WGSL,
  REWETTING_BLOOM_SOLUBILITY_WGSL,
  TEMPORAL_DRYING_EVAPORATION_WGSL,
  TEMPORAL_INK_WGSL_CONTRACTS,
  packPaletteKnifeUniforms,
  packRewettingBloomUniforms,
  packTemporalDryingUniforms,
  validateSingleTemporalWgslContract,
  validateTemporalInkWgslContracts,
  type PaletteKnifeUniformInput,
  type RewettingBloomUniformInput,
  type TemporalDryingUniformInput,
  type TemporalWgslBindingDescriptor,
  type TemporalWgslShaderContract,
  type TemporalWgslSuiteValidationResult,
  type TemporalWgslValidationReport,
} from "./temporal-drying-wgsl-shaders";
