/**
 * Wasm64 Wave 14 마스터피스 렌더링·드로잉 물리 엔진 공개 진입점.
 *
 * - `bluenoise-screentone-temporal-upscaler`: Void-and-Cluster + IGN 다중 대역 블루노이즈 및
 *   FM/AM 무로제트 스크린톤 합성기, 서브픽셀 광학 흐름 + ETF 이방성 충격 복원 2× 모션툰 업스케일러
 * - `sss-skin-bristle-cinema-halation`: 사전 적분 표면하 산란(Pre-Integrated SSS) 따뜻 피부톤·귀/손끝
 *   역광 커널, 탄성 강모 갈필(`갈필`)·획 끝 모세관 먹물 고임(`먹물 고임`) 시뮬레이터,
 *   시네마 적색 유제층 할레이션·블룸·휘도 마스킹 유기 입자 피니셔
 *
 * 주의: 초기 진입 번들(`main.tsx` 등)에서 정적으로 import하지 않고 해당 고급 파이프라인 실행 시 지연 로드한다.
 */

export {
  computeEdgeTangentFlowField,
  computeHybridBandWeights,
  DEFAULT_BLUENOISE_TILE_SIZE,
  DEFAULT_MOBILE_DPI,
  DEFAULT_PRINT_DPI,
  estimateBlockSubpixelMotionField,
  evaluateInterleavedGradientNoise,
  measurePeriodicMoireBeatingIndex,
  SCREENTONE_PRESET_PROFILES,
  SpatiotemporalMotionToonUpscaler,
  synthesizeRosetteFreeScreentone,
  synthesizeVoidAndClusterBlueNoiseTile,
  WASM64_WAVE14_SLAB_ALIGNMENT_BYTES,
  WGSL_BLUENOISE_HYBRID_SCREENTONE_KERNEL,
  WGSL_ETF_TEMPORAL_UPSCALER_KERNEL,
  type BlueNoiseTileOptions,
  type BlueNoiseTileSpectrumSummary,
  type EdgeTangentFlowField,
  type HybridBandWeights,
  type MotionEstimationOptions,
  type MotionFieldResult,
  type MotionToonUpscalerOptions,
  type MotionVectorSample,
  type ScreentonePresetKind,
  type ScreentonePresetProfile,
  type ScreentoneSynthesisInput,
  type ScreentoneSynthesisResult,
  type SequenceUpscaleReport,
  type UpscaledToonFrameResult,
} from "./bluenoise-screentone-temporal-upscaler";

export {
  applyCinemaHalationBloomGrain,
  buildPreIntegratedSkinSssLut,
  DEFAULT_SSS_LUT_SIZE,
  samplePreIntegratedSkinLut,
  shadeSkinSubsurfaceBuffer,
  SKIN_SSS_PROFILES,
  SplitBristleInkPoolingSimulator,
  WASM64_WAVE14_RENDER_ALIGNMENT_BYTES,
  WGSL_CINEMA_HALATION_GRAIN_SHADER,
  WGSL_PREINTEGRATED_SKIN_SSS_SHADER,
  type BristleStrokeSample,
  type CinemaFinisherInput,
  type CinemaFinisherResult,
  type NibBristlePresetKind,
  type PreIntegratedSkinLut,
  type RgbTuple,
  type SkinSssPresetKind,
  type SkinSssProfile,
  type SkinSubsurfaceBufferInput,
  type SkinSubsurfaceBufferResult,
  type SplitBristleSimulatorOptions,
  type SplitBristleStrokeReport,
} from "./sss-skin-bristle-cinema-halation";
