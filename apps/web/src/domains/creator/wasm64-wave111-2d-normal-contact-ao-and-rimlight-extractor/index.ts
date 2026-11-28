/**
 * Wave 111 — 2D 실루엣 팽창 법선장(Normal)·접촉 앰비언트 오클루전(Contact AO)
 * 및 프레넬 림라이트 자동 추출 엔진 배럴 익스포트.
 */

export {
  binarizeSilhouetteMask,
  computeExactMaskInteriorEdt,
  computeInflated2dNormalField,
  encodeNormalFieldToRgba,
  evaluateBevelProfileHeight,
} from "./silhouette-sdf-normal-inflator";

export type {
  ExactMaskInteriorEdtResult,
  Inflated2dNormalField,
  InteriorEdtOptions,
  NormalInflationOptions,
  NormalInflationProfile,
} from "./silhouette-sdf-normal-inflator";

export {
  buildNormalAoRimWgsl,
  evaluateCelShadowRamp,
  normalizeVec3Safe,
  synthesizeCelShadowContactAoAndRimPass,
  validateNormalAoRimWgsl,
} from "./contact-ao-cel-rim-compositor-and-wgsl";

export type {
  CelBandCount,
  CelContactAoRimPassResult,
  CelLightingSpec,
  ContactAoOccluderLayer,
  LightingPassTelemetry,
  NormalAoRimWgslArtifact,
  NormalAoRimWgslBinding,
  NormalAoRimWgslValidationReport,
  RgbByteTuple,
  Vec3Tuple,
} from "./contact-ao-cel-rim-compositor-and-wgsl";

export {
  escapeLightingSvgXml,
  renderLightingPassBreakdownSvg,
  summarizeNormalAoRimPassKo,
} from "./lighting-pass-breakdown-svg-and-audit";

export type {
  LightingBreakdownSvgOptions,
  NormalAoRimQaSummaryKo,
} from "./lighting-pass-breakdown-svg-and-audit";
