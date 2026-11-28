/**
 * Wasm64 Wave 136 공개 배럴 진입점 (`wasm64-wave136-kubelka-munk-subtractive-pigment-mixer-engine`).
 *
 * - `kubelka-munk-spectral-pigments`: 10-밴드(410~680nm) Kubelka-Munk K/S 감산 혼색, 8종 화방 안료,
 *   임의 sRGB 스펙트럼 업샘플링 및 감산 vs RGB 채도 비교
 * - `wet-medium-glazing-and-backrun`: 수채·과슈·알코올 마카 유한 두께 글레이징 및 보존형 2D 모세관 엣지 다크닝
 * - `subtractive-pigment-wgsl`: 16바이트 정렬 WebGPU WGSL(@compute/@fragment) 생성 및 정적 검증
 * - `pigment-swatch-svg-and-report`: 순수 OKLCH 진단 SVG 시트, 동기 FIPS 180-4 SHA-256 및 한국어 채색 QA 브리프
 */

export {
  circularHueDiffDeg,
  clampFinite,
  compareSubtractiveVsRgbMix,
  computeOklchDeltaE,
  formatOklchCss,
  getStudioPigmentPreset,
  ksToReflectance,
  liftSrgbToSpectralReflectance,
  linearChannelToSrgb,
  linearRgbToOklch,
  linearRgbToSrgb,
  MAX_PHYSICAL_REFLECTANCE,
  MIN_PHYSICAL_REFLECTANCE,
  mixSubtractivePigments,
  reflectanceToKs,
  SPECTRAL_BAND_COUNT,
  SPECTRAL_TO_XYZ_WEIGHTS,
  SPECTRAL_WAVELENGTHS_NM,
  spectralKsToReflectance,
  spectralReflectanceToLinearRgb,
  spectralReflectanceToOklch,
  spectralReflectanceToSrgb,
  spectralReflectanceToXyz,
  srgbChannelToLinear,
  srgbToLinearRgb,
  srgbToOklch,
  STUDIO_PIGMENT_IDS,
  STUDIO_PIGMENT_PRESETS,
  toTuple10,
  xyzToLinearRgb,
  type OklchColor,
  type PigmentMixInput,
  type PigmentMixOptions,
  type RgbTuple,
  type SpectralLiftingResult,
  type SpectralTuple10,
  type StudioPigmentId,
  type StudioPigmentPreset,
  type SubtractivePigmentMixResult,
  type SubtractiveVsRgbComparison,
  type SubtractiveVsRgbStop,
} from "./kubelka-munk-spectral-pigments";

export {
  buildMediumPigmentKs,
  compareMediumGlazingTriplet,
  evaluateKubelkaMunkBandOverSubstrate,
  evaluateKubelkaMunkLayerOverSubstrate,
  getPaperSubstrate,
  getWetMediumPreset,
  PAPER_SUBSTRATES,
  simulateMultiLayerGlazing,
  simulateWatercolorEdgeDarkening,
  WET_MEDIUM_PRESET_IDS,
  WET_MEDIUM_PRESETS,
  type EdgeDarkeningSimulationOptions,
  type GlazingCoatSample,
  type GlazingCoatSpec,
  type KubelkaMunkLayerResult,
  type MultiLayerGlazingResult,
  type PaperSubstrateId,
  type PaperSubstrateSpec,
  type RadialBackrunSample,
  type WatercolorEdgeDarkeningResult,
  type WetMediumPreset,
  type WetMediumPresetId,
} from "./wet-medium-glazing-and-backrun";

export {
  buildSubtractivePigmentWgsl,
  validateSubtractivePigmentWgsl,
  type BuildSubtractivePigmentWgslOptions,
  type SubtractivePigmentWgslArtifact,
  type SubtractivePigmentWgslValidationReport,
  type SubtractiveWgslBindingDescriptor,
} from "./subtractive-pigment-wgsl";

export {
  computePigmentRecipeManifestHash,
  escapePigmentXml,
  renderPigmentMixComparisonSvg,
  sha256HexSync,
  summarizePigmentMixAuditKo,
  type PigmentAuditCheckItem,
  type PigmentAuditGrade,
  type PigmentMixAuditReportKo,
  type PigmentMixSvgOptions,
  type PigmentRecipeManifestInput,
  type SummarizePigmentAuditInput,
} from "./pigment-swatch-svg-and-report";
