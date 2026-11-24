/**
 * Wave 40C — 실시간 엣지 보존 업스케일러 + 절차적 심리스 PBR·망점 텍스처 공개 배럴.
 */

export {
  DEFAULT_UPSCALE_OPTIONS,
  DEMO_WEBTOON_SCENE_PRESETS,
  WEBGPU_EDGE_UPSCALE_WGSL,
  bilinearUpscale,
  computePsnr,
  createDemoWebtoonSampleBuffer,
  detectUpscalerBackend,
  downsampleBox,
  measureEdgeSharpness,
  upscaleWebtoonBuffer,
  validateUpscalerWgsl,
  type DemoWebtoonSceneId,
  type DemoWebtoonScenePreset,
  type EdgeUpscaleMetrics,
  type ResolvedUpscaleOptions,
  type RgbaImageBuffer,
  type UpscaleFactor,
  type UpscalerRuntimeBackend,
  type UpscalerWgslValidationReport,
  type WebtoonUpscaleOptions,
  type WebtoonUpscaleResult,
} from "./edge-preserving-upscaler";

export {
  PROCEDURAL_MATERIAL_PRESETS,
  measureTileSeamContinuity,
  roughnessToRgbaBuffer,
  synthesizeProceduralTexture,
  type ProceduralMaterialId,
  type ProceduralMaterialPreset,
  type ProceduralTextureMetadata,
  type ProceduralTextureOptions,
  type ProceduralTextureResult,
  type ResolvedTextureOptions,
  type TileSeamContinuityReport,
} from "./procedural-texture-synth";

export {
  StudioNeuralUpscaleTexturesPanel,
  type NeuralUpscaleTexturesTabId,
  type StudioNeuralUpscaleTexturesPanelProps,
  type TexturePreviewChannel,
  type UpscalerPreviewMode,
} from "./StudioNeuralUpscaleTexturesPanel";
