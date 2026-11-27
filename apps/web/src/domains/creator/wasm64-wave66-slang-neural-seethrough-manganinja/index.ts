/**
 * Wasm64 Wave 66 공개 진입점 (`wasm64-wave66-slang-neural-seethrough-manganinja`).
 *
 * - `slang-inline-neural-shader-compiler`: SIGGRAPH 2025/2026 `neural.slang` 패러다임 기반
 *   초소형 2계층 인라인 MLP(FP16/INT8) Slang·WebGPU WGSL 결정론적 컴파일러 및 CPU 정합성(`< 1e-4`) 검증기
 * - `seethrough-layer-decomposer-inpainter`: SIGGRAPH 2026 "See-Through" 기반 단일 평면 일러스트
 *   전경·중경·배경 자동 레이어 분해, Z-Order 추론, 가려진 구멍 다중스케일 구조-인식 인페인팅 및 2.5D 패럴랙스 합성기
 * - `manganinja-point-reference-colorizer`: CVPR 2025 MangaNinja 기반 레퍼런스 캐릭터 시트 +
 *   사용자 포인트 힌트(Point-Guided Correspondence) 닫힌 영역 그래프 분할 및 경계 침범 0%(Leak-Free) 선화 자동 채색기
 */

export {
  compileInlineNeuralShaderToWgsl,
  createDefaultWebtoonTactileBrushSpec,
  decodeFloat16,
  DEFAULT_INLINE_NEURAL_PARITY_TOLERANCE,
  emulateCompiledWgslInlineMlp,
  encodeFloat16,
  evaluateInlineNeuralTactileShader,
  MAX_INLINE_MLP_HIDDEN_DIM,
  MAX_INLINE_MLP_INPUT_DIM,
  MAX_INLINE_MLP_OUTPUT_DIM,
  packTactileBrushSampleToVector,
  SLANG_INLINE_TACTILE_BRUSH_SHADER,
  TACTILE_BRUSH_HIDDEN_DIM,
  TACTILE_BRUSH_INPUT_DIM,
  TACTILE_BRUSH_OUTPUT_DIM,
  validateTranspiledWgslContract,
  verifyInlineNeuralShaderParity,
  type CompiledInlineNeuralShaderArtifact,
  type DequantizedMlpWeights,
  type InlineNeuralBindingSpec,
  type InlineNeuralHiddenActivation,
  type InlineNeuralMlpSpec,
  type InlineNeuralOutputActivation,
  type InlineNeuralParityReport,
  type InlineNeuralQuantization,
  type QuantizedWeightBufferLayout,
  type TactileBrushFeatureSample,
  type TactileBrushShaderEvaluation,
  type WgslSyntaxContractReport,
} from "./slang-inline-neural-shader-compiler";

export {
  compositeSeeThroughLayers,
  computeImageSimilarityMetrics,
  decomposeIllustrationSeeThroughLayers,
  inpaintOccludedLayerRegion,
  type ImageSimilarityMetrics,
  type InpaintedRegionResult,
  type RgbaImageBuffer,
  type SeeThroughDecompositionOptions,
  type SeeThroughDecompositionResult,
  type SeeThroughInpaintOptions,
  type SeeThroughLayerRole,
  type SeeThroughLayerSlice,
  type SeeThroughRegionSummary,
  type SeeThroughSemanticSeed,
} from "./seethrough-layer-decomposer-inpainter";

export {
  auditLineartColorLeaks,
  colorizeLineartFromReferencePoints,
  extractLineartBarrierMask,
  segmentClosedLineartRegions,
  type AppliedPointHintSummary,
  type ClosedLineartRegion,
  type LineartLeakAuditReport,
  type LineartRegionGraph,
  type MangaNinjaColorizationResult,
  type MangaNinjaColorizeOptions,
  type PointCorrespondenceHint,
  type RegionColorAssignment,
  type RegionColorSource,
} from "./manganinja-point-reference-colorizer";
