/**
 * Wasm64 Wave 41 공개 진입점 (`wasm64-wave41-continuous-proxy-texture-relief`).
 *
 * - `aperiodic-stochastic-proxy-texture-synthesizer`: 정삼각형 심플렉스 확률 격자 + Wang 타일 코너 해싱,
 *   히스토그램 분산 보존 보간, `12.5%~800%` 연속 로그 배율(`log2(zoom)`) 시각 프록시 질감 합성기
 * - `micro-relief-metallic-coat-proxy-shader`: `Metallic` 이진(`0 | 1`) 규율, `Coat`·`Sheen`·`Anisotropy`·`Subsurface`
 *   물리 로브, Scharr/Sobel 단위 법선 + 수평선 공동 차폐(Horizon Cavity AO) 평가기 및 WebGPU `16B` 정렬 유니폼 직렬화기
 * - `progressive-virtual-mipmap-proxy-streamer`: `0ms` 구면 조화 요약 절차적 프록시 밉맵 생성기,
 *   시선 중심·줌 우선순위 가상 밉맵 스트리머, 적응형 아틀라스 패커 및 시간·경계 크로스디졸브 가중치 산출기
 */

export {
  blendSimplexVariancePreserving,
  computeContinuousZoomOctaveSchedule,
  computeWangTileCornerHash,
  DEFAULT_PROXY_BASE_TILE_PX,
  evaluateAperiodicProxySample,
  MAX_CONTINUOUS_PROXY_ZOOM,
  measureSpatialLagAutocorrelation,
  MIN_CONTINUOUS_PROXY_ZOOM,
  PROXY_SURFACE_PRESETS,
  resolveSimplexTriangleLattice,
  synthesizeAperiodicProxyTexturePatch,
  type AperiodicProxyEvalOptions,
  type AperiodicProxySampleValue,
  type AperiodicProxyTexturePatch,
  type AperiodicProxyTextureRequest,
  type AutocorrelationAuditReport,
  type ContinuousZoomGrainSchedule,
  type ContinuousZoomOctaveBand,
  type ProxyLatticeBlendMode,
  type ProxySurfacePresetId,
  type ProxySurfacePresetSpec,
  type ProxyTilingMode,
  type SimplexTriangleSample,
  type SimplexVertexDescriptor,
} from "./aperiodic-stochastic-proxy-texture-synthesizer";

export {
  computeMicroReliefNormalAndCavityField,
  DIELECTRIC_DEFAULT_F0,
  evaluateMicroReliefProxyShader,
  MICRO_RELIEF_UNIFORM_BYTE_LENGTH,
  MICRO_RELIEF_UNIFORM_FLOAT_COUNT,
  packMicroReliefUniformBuffer,
  sanitizeStudioMaterialParams,
  STUDIO_MICRO_RELIEF_PRESETS,
  unpackMicroReliefUniformBuffer,
  type LinearRgbColor,
  type MicroReliefFieldBuildOptions,
  type MicroReliefGradientKernel,
  type MicroReliefLightEnvironment,
  type MicroReliefNormalCavityField,
  type MicroReliefShaderEvaluation,
  type SanitizedStudioMaterialParams,
  type StudioMaterialClass,
  type StudioMicroReliefMaterialInput,
  type StudioMicroReliefPresetId,
  type Vec3Direction,
} from "./micro-relief-metallic-coat-proxy-shader";

export {
  allocateVirtualAtlasSlots,
  computeTileCrossDissolveWeights,
  DEFAULT_TILE_DISSOLVE_DURATION_MS,
  DEFAULT_VIRTUAL_TILE_SIZE_PX,
  extractProceduralMipProxyDescriptor,
  formatVirtualTileId,
  generateInstantProceduralMipProxy,
  planVirtualMipmapStreamFrame,
  REDUCED_MOTION_DISSOLVE_DURATION_MS,
  type AtlasSlotRect,
  type ProceduralMipProxyDescriptor,
  type ProceduralMipProxyPatch,
  type TileCrossDissolveInput,
  type TileCrossDissolveWeights,
  type ViewportGazeStreamInput,
  type VirtualAtlasPackRequest,
  type VirtualAtlasPackResult,
  type VirtualMipStreamCandidate,
  type VirtualMipStreamPlan,
  type VirtualTileKey,
} from "./progressive-virtual-mipmap-proxy-streamer";
