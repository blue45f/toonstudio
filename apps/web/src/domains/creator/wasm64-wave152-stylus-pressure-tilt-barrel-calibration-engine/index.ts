/**
 * Wasm64 Wave 152 공개 배럴 진입점 (`wasm64-wave152-stylus-pressure-tilt-barrel-calibration-engine`).
 *
 * - `stylus-hardware-and-pressure-curve`: 4종 정본 스타일러스 프로파일, Fritsch-Carlson 단조 3차 에르미트
 *   필압 곡선, 물리 하중(gf) 기반 기기 간 필압 호환성 변환기
 * - `tilt-barrel-and-jitter-filter`: 배럴 롤 최단각 연속 언랩(360° 플립 0건), 미지원 기기 방위각/접선 폴백,
 *   기울기-치즐 닙 이방성, 속도 적응 One-Euro 지터 필터, 통합 캘리브레이션 번들 빌더
 * - `stylus-sha256-and-canonical`: 순수 ES2017 동기 FIPS 180-4 SHA-256 및 키 순서 무관 매니페스트 지문
 * - `stylus-calibration-svg-and-report`: 순수 OKLCH 감사 SVG 렌더러 및 한국어 캘리브레이션 QA 브리프
 */

export {
  auditPressureCurveMonotonicity,
  buildMonotonePressureCurve,
  buildPresetPressureCurve,
  evaluatePressureCurve,
  forceGfToNormalizedPressure,
  getStylusHardwareProfile,
  listStylusHardwareProfiles,
  measureDeviceRoundTripAccuracy,
  normalizedPressureToForceGf,
  quantizeStylusPressure,
  resolveStylusHardwareProfile,
  STYLUS_HARDWARE_IDS,
  STYLUS_HARDWARE_PROFILES,
  STYLUS_PRESSURE_CURVE_PRESETS,
  translateStylusPressureAcrossDevices,
  type BuildMonotonePressureCurveOptions,
  type CrossDevicePressureTranslation,
  type DeviceRoundTripAccuracyReport,
  type MonotonePressureCurve,
  type PressureCurveMonotonicityAudit,
  type PressureCurvePoint,
  type PressureCurvePresetId,
  type StylusHardwareId,
  type StylusHardwareProfile,
  type TranslateStylusPressureOptions,
} from "./stylus-hardware-and-pressure-curve";

export {
  buildStylusCalibrationBundle,
  buildSyntheticBenchmarkStylusStroke,
  compareFixedEmaVsOneEuroStylus,
  computeChiselNibStampGeometry,
  DEFAULT_ONE_EURO_CONFIG,
  filterStylusStrokeOneEuro,
  normalizeAngle360,
  resolveEffectiveNibRotationDeg,
  shortestAngularDeltaDeg,
  tiltXYToAltitudeAzimuthDeg,
  unwrapBarrelRollAnglesDeg,
  type BarrelRollFallbackPolicy,
  type BarrelRollUnwrapResult,
  type ChiselNibStampGeometry,
  type ChiselNibStampInput,
  type ChiselNibStyle,
  type EffectiveNibRotationInput,
  type EffectiveNibRotationResult,
  type FilteredStylusStrokeSample,
  type FixedEmaBaselineResult,
  type FixedEmaVsOneEuroComparison,
  type NibRotationSource,
  type OneEuroFilterConfig,
  type OneEuroFilterResult,
  type ResolvedOneEuroFilterConfig,
  type StylusCalibrationBundle,
  type StylusCalibrationBundleInput,
  type StylusRawStrokeSample,
  type TiltAltitudeAzimuthResult,
} from "./tilt-barrel-and-jitter-filter";

export {
  canonicalizeCalibrationValue,
  computeCalibrationManifestSha256Hex,
  encodeStylusUtf8Bytes,
  sha256StylusBytesHex,
  sha256StylusUtf8Hex,
} from "./stylus-sha256-and-canonical";

export {
  escapeStylusCalibrationXml,
  renderStylusCalibrationAuditSvg,
  summarizeStylusCalibrationKo,
  type StylusCalibrationQaStatusKo,
  type StylusCalibrationReportKo,
  type StylusCalibrationSvgOptions,
} from "./stylus-calibration-svg-and-report";
