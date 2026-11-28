/**
 * Wave 151 — 만화·웹툰 도시 야경 창문(Interior Parallax) · 네온 간판 절차적 배치 &
 * 야간 색온도(OKLCH) 조화 엔진 공개 배럴.
 */

export {
  CITYSCAPE_NIGHT_PRESETS,
  DEPTH_BAND_DEFAULT_DISTANCES_M,
  clampFinite,
  createDeterministicRng,
  formatOklchCss,
  formatSafeDecimal,
  getCityscapeMoodPreset,
  hashSeed32,
  listCityscapeMoodPresets,
  normalizeHourOfNight,
  normalizeHueDeg,
  rectInsideBounds,
  rectOverlaps,
  type BuildingFacadeWindowsResult,
  type BuildingUsageKind,
  type CityscapeBuilding,
  type CityscapeDefaultSignSample,
  type CityscapeDepthBand,
  type CityscapeMoodPreset,
  type CityscapeNightMoodId,
  type CityscapeNightScene,
  type FacadeWindowCell,
  type InteriorParallaxOffset,
  type InteriorRoomStyle,
  type KeepOutBox2D,
  type NeonSignboardCandidate,
  type NeonSignboardPlacementResult,
  type OklchColor,
  type PlacedNeonSignboard,
  type Rect2D,
  type SignboardOrientation,
  type SignboardPreferredZone,
  type SignboardScript,
  type SkippedNeonSignboard,
} from "./cityscape-night-types";

export {
  computeInteriorParallaxOffset,
  computeNightOccupancyRatio,
  detectSignboardScript,
  generateBuildingFacadeWindows,
  generateCityscapeNightScene,
  placeFacadeNeonSignboards,
  type CityscapeNightSceneInput,
  type FacadeWindowGenerationInput,
  type InteriorParallaxInput,
  type NeonSignboardPlacementInput,
} from "./cityscape-window-and-sign-generator";

export {
  applyAtmosphericDepthAttenuation,
  auditCityscapeNightHarmony,
  cityscapeManifestSha256Hex,
  computeAtmosphericTransmittance,
  harmonizeCityscapeNightPalette,
  kelvinToOklch,
  oklchToLinearRgb,
  sha256Utf8Hex,
  type CityscapeHarmonyIssue,
  type CityscapeHarmonyIssueCode,
  type CityscapeNightHarmonizationResult,
  type CityscapeNightHarmonyAudit,
  type DepthBandColorMetrics,
  type LinearRgbTuple,
} from "./night-color-harmony-and-atmosphere";

export {
  buildCityscapeNightFacadeWgsl,
  validateCityscapeNightFacadeWgsl,
  type CityscapeNightFacadeWgslArtifact,
  type CityscapeNightFacadeWgslOptions,
  type CityscapeNightFacadeWgslValidation,
  type CityscapeWgslBindingDescriptor,
} from "./cityscape-night-facade-wgsl";

export {
  escapeCityscapeSvgXml,
  renderCityscapeNightAuditSvg,
  summarizeCityscapeNightAuditKo,
  type CityscapeNightDirectorBriefKo,
  type CityscapeNightSvgOptions,
} from "./cityscape-svg-and-report";
