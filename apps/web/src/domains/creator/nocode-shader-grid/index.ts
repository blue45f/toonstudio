/**
 * 노코드 시각 커스텀 WGSL 셰이더 빌더 · 분산 타일 캐시·워커 그리드 스케줄러 ·
 * 비의료 인체공학 작업 리듬 코치 통합 진입점 (Wave 33 Track C).
 */

export {
  NOCODE_SHADER_PRESETS,
  NOCODE_SHADER_UNIFORM_BYTES,
  NOCODE_SHADER_WORKGROUP_SIZE,
  REFERENCE_SWATCH_PRESETS,
  buildNoCodeWgslShader,
  createStudioPreviewBaseRgba,
  generateNoCodeComputeWgsl,
  generateNoCodeFragmentWgsl,
  packNoCodeUniformBuffer,
  parseNoCodeShaderPrompt,
  renderNoCodeShaderCpuPreview,
  validateGeneratedWgsl,
} from "./nocode-wgsl-shader-builder";
export type {
  BuiltNoCodeShaderBundle,
  LightingStyleKind,
  NoCodeShaderCpuPreview,
  NoCodeShaderPreset,
  NoCodeShaderPreviewStats,
  NoCodeShaderPromptInput,
  NoCodeShaderUniformSpec,
  ParsedNoCodeShaderRecipe,
  ReferenceColorSwatch,
  ReferenceSwatchPalettePreset,
  ShaderStageMode,
  SwatchColorRole,
  TextureStyleKind,
  UnitRgb,
  WgslValidationResult,
} from "./nocode-wgsl-shader-builder";

export {
  DistributedTileCache,
  computeFnv1a64Hex,
  computeSha256SyncHex,
  createTileContentKey,
  executeDistributedTileGrid,
} from "./distributed-tile-grid-scheduler";
export type {
  CachedTileEntry,
  DistributedTileCacheStats,
  DistributedTileGridInput,
  NodeFailoverEvent,
  TileContentDescriptor,
  TileExecutionResult,
  TileGridExecutionReport,
  TileHashAlgorithm,
  TileWorkloadKind,
  WorkStealEvent,
  WorkerNodeConfig,
  WorkerNodeStatus,
  WorkerNodeSummary,
} from "./distributed-tile-grid-scheduler";

export {
  ERGONOMIC_COACH_CONTRACT,
  GENTLE_STRETCH_ROUTINES,
  analyzeErgonomicCadence,
  createDemoCadenceScenario,
  createLocalCadenceTracker,
} from "./ergonomic-cadence-coach";
export type {
  CadencePrivacyGuarantee,
  CadenceRhythmLevel,
  CadenceScenarioId,
  CadenceSignalItem,
  CadenceWindowSample,
  ErgonomicCadenceInput,
  ErgonomicCadenceReport,
  GentleStretchRoutine,
  LocalCadenceSessionTracker,
  StretchFocusArea,
} from "./ergonomic-cadence-coach";

export { StudioNoCodeShaderGridPanel } from "./StudioNoCodeShaderGridPanel";
export type {
  NoCodeShaderGridTab,
  StudioNoCodeShaderGridPanelProps,
} from "./StudioNoCodeShaderGridPanel";
