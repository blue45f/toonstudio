/**
 * Wave 133 — 웹툰 3-심도 대기 원근·Beer-Lambert 산란 안개·5종 날씨 파티클 &
 * 주인공 얼굴·말풍선 무가림 연출 엔진 배럴 모듈.
 */

export {
  DEPTH_LAYER_BOUNDS_METERS,
  DEPTH_LAYER_IDS,
  WEATHER_PRESETS,
  WEATHER_PRESET_IDS,
  canonicalizeWeatherManifestJson,
  clampFinite,
  formatOklchCss,
  formatSafeDecimal,
  getWeatherPreset,
  isWeatherPresetId,
  listWeatherPresets,
  sha256Wave133Hex,
  type AtmosphericFogBand,
  type AtmosphericTransmittanceSample,
  type AtmosphericWeatherFieldRequest,
  type AtmosphericWeatherFieldResult,
  type AtmosphericWeatherInvariants,
  type AtmosphericWeatherParticle,
  type DepthLayerId,
  type DepthLayerRangeMeters,
  type DepthLayerSummaryMetrics,
  type KeepOutBoxInput,
  type KeepOutOcclusionAudit,
  type NormalizedKeepOutBox,
  type OklchColorSpec,
  type WeatherParticleShape,
  type WeatherPresetId,
  type WeatherPresetSpec,
} from "./atmospheric-weather-types";

export {
  auditKeepOutOcclusions,
  computeAtmosphericTransmittance,
  doesSegmentIntersectExpandedBox,
  sampleTransmittanceCurve,
  synthesizeAtmosphericWeatherField,
} from "./atmospheric-weather-field-solver";

export {
  buildAtmosphericWeatherWgsl,
  validateAtmosphericWeatherWgsl,
  type AtmosphericWeatherWgslArtifact,
  type AtmosphericWeatherWgslOptions,
  type AtmosphericWeatherWgslValidation,
  type AtmosphericWgslBindingDescriptor,
} from "./atmospheric-weather-wgsl";

export {
  escapeWeatherSvgXml,
  renderAtmosphericWeatherSvg,
  summarizeAtmosphericWeatherKo,
  type AtmosphericWeatherDirectorBriefKo,
  type AtmosphericWeatherSvgOptions,
} from "./atmospheric-weather-svg-and-report";
