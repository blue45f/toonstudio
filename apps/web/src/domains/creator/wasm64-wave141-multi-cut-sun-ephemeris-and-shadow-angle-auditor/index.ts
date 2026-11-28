/**
 * Wasm64 Wave 141 공개 배럴 진입점 (`wasm64-wave141-multi-cut-sun-ephemeris-and-shadow-angle-auditor`).
 *
 * - `solar-ephemeris-and-shadow-math`: 천문 태양·달 위치 계산기 및 3D→2D 카메라 그림자 투영 엔진
 * - `lighting-manifest-sha256`: 순수 ES2017 동기 FIPS 180-4 SHA-256 및 정규 JSON 직렬화
 * - `multi-cut-shadow-consistency-auditor`: 연속 컷 4종 그림자·조광 위반 감사 및 자동 교정 솔버
 * - `shadow-guide-wgsl`: WebGPU WGSL 컷 조광 가이드 오버레이 셰이더 생성기 및 정적 검증기
 * - `shadow-compass-svg-and-report`: 순수 OKLCH 태양 나침반·컷 비교 SVG 및 한국어 조명 QA 브리프
 */

export {
  angularDistanceDeg,
  clampFiniteNumber,
  computeSolarEphemeris,
  degToRad,
  estimateNaturalColorTemperatureK,
  normalizeDegrees360,
  normalizeSignedAngleDeg,
  projectWorldLightToCutScreen,
  radToDeg,
  type CelestialBody,
  type CutLightScreenProjectionInput,
  type CutLightScreenProjectionResult,
  type LightSourceType,
  type RimLightSide,
  type SolarEphemerisInput,
  type SolarEphemerisResult,
  type TimeOfDayBand,
  type Vec2,
  type Vec3Enu,
} from "./solar-ephemeris-and-shadow-math";

export {
  canonicalizeLightingJson,
  computeLightingManifestSha256Hex,
  encodeLightingUtf8Bytes,
  sha256LightingBytesHex,
  sha256LightingUtf8Hex,
} from "./lighting-manifest-sha256";

export {
  LIGHT_SOURCE_LABELS_KO,
  RIM_SIDE_LABELS_KO,
  VIOLATION_KIND_LABELS_KO,
  auditSceneLightingConsistency,
  correctCutShadowDirections,
  resolveShadowAuditOptions,
  type CutLightingEvaluation,
  type CutLightingInput,
  type CutShadowCorrectionPatch,
  type ResolvedShadowAuditOptions,
  type SceneLightingAuditReport,
  type SceneLightingBible,
  type ShadowAuditOptions,
  type ShadowAuditViolation,
  type ShadowAutoCorrectionResult,
  type ShadowViolationKind,
  type ShadowViolationSeverity,
} from "./multi-cut-shadow-consistency-auditor";

export {
  SHADOW_GUIDE_UNIFORM_BYTE_LENGTH,
  buildShadowGuideOverlayWgsl,
  packShadowGuideUniformBuffer,
  validateShadowGuideOverlayWgsl,
  type ShadowGuideWgslBundle,
  type ShadowGuideWgslCheck,
  type ShadowGuideWgslConfig,
  type ShadowGuideWgslValidationResult,
} from "./shadow-guide-wgsl";

export {
  escapeShadowXml,
  renderMultiCutShadowAuditSvg,
  summarizeMultiCutShadowAuditKo,
  type ShadowCompassSvgOptions,
} from "./shadow-compass-svg-and-report";
