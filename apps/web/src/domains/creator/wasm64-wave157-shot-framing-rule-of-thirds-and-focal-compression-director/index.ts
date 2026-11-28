/**
 * Wasm64 Wave 157 공개 배럴 진입점
 * (`wasm64-wave157-shot-framing-rule-of-thirds-and-focal-compression-director`).
 *
 * - `shot-framing-types`: 35mm 광학·DoF·인체 랜드마크·5대 결함·자동 리프레이밍 계약 타입
 * - `shot-framing-sha256`: 순수 ES2017 동기 FIPS 180-4 SHA-256 및 정규 매니페스트 지문
 * - `optical-lens-dof-and-compression`: 7종 시네마 렌즈(18~200mm) 화각, 배경 압축률, 박렌즈 피사계 심도(CoC)
 * - `shot-framing-and-reframe-auditor`: 관절 절단·헤드룸·리드룸·교점 감사 및 삼분할/황금비 자동 리프레이밍 솔버
 * - `shot-framing-svg-and-report`: 순수 `oklch(...)` 구도·DoF 비교 SVG 렌더러 및 한국어 촬영 감독 QA 브리프
 */

export {
  BOKEH_GRADE_LABELS_KO,
  CROP_EDGE_LABELS_KO,
  FRAMING_DEFECT_LABELS_KO,
  FULL_FRAME_35MM_SENSOR,
  GAZE_DIRECTION_LABELS_KO,
  JOINT_LABELS_KO,
  SAFE_CUT_ZONE_LABELS_KO,
  STANDARD_FOCAL_LENGTHS_MM,
  type BokehSeparationGrade,
  type CinemaLensPreset,
  type CompositionGridMode,
  type CompositionPowerPoint,
  type CropBoundaryEdge,
  type DepthOfFieldInput,
  type DepthOfFieldResult,
  type FocalBackgroundCompressionInput,
  type FocalBackgroundCompressionResult,
  type GazeDirection,
  type JointLandmarkKind,
  type JointLandmarkSet,
  type LensFieldOfView,
  type NormalizedCropRect,
  type NormalizedPoint2D,
  type SafeCutZoneKind,
  type SafeCutZonesY,
  type SensorDimensionsMm,
  type ShotDirectorPlanInput,
  type ShotDirectorPlanResult,
  type ShotFramingAuditOptions,
  type ShotFramingAuditResult,
  type ShotFramingDefect,
  type ShotFramingDefectCode,
  type ShotFramingGrade,
  type ShotFramingPanelInput,
  type ShotFramingSeverity,
  type ShotFramingSvgOptions,
  type ShotReframeOutcome,
  type ShotReframeSolverOptions,
  type ShotScaleKind,
  type StandardFocalLengthMm,
  type SubjectBodyLandmarks,
  type TangentJointCropDetail,
} from "./shot-framing-types";

export {
  canonicalizeShotFramingManifestJson,
  computeDirectorPlanManifestSha256Hex,
  computeShotFramingManifestSha256Hex,
  encodeShotFramingUtf8Bytes,
  sha256ShotFramingBytesHex,
  sha256ShotFramingUtf8Hex,
} from "./shot-framing-sha256";

export {
  CINEMA_LENS_PRESETS,
  compareFocalCompressionAcrossPresets,
  computeBlurCircleMmAtDistance,
  computeDepthOfFieldBounds,
  computeFocalBackgroundCompression,
  computeLensFieldOfView,
  findNearestCinemaLensPreset,
  listCinemaLensPresets,
} from "./optical-lens-dof-and-compression";

export {
  DEFAULT_JOINT_EXCLUSION_MARGIN_NORM,
  DEFAULT_MAX_HEADROOM_RATIO,
  DEFAULT_MAX_POWER_POINT_DISTANCE_NORM,
  DEFAULT_MIN_HEADROOM_RATIO,
  GOLDEN_RATIO_MAJOR,
  GOLDEN_RATIO_MINOR,
  GOLDEN_RATIO_PHI,
  RULE_OF_THIRDS_MAJOR,
  RULE_OF_THIRDS_MINOR,
  auditPanelShotFraming,
  createStandingSubjectLandmarks,
  directPanelShotFraming,
  flattenJointLandmarks,
  listCompositionPowerPoints,
  normalizeCropRect,
  resolveSafeCutZones,
  solveOptimalShotReframe,
} from "./shot-framing-and-reframe-auditor";

export {
  buildGoldenSpiralSvgPath,
  escapeShotFramingXml,
  renderShotFramingAuditSvg,
  summarizeShotFramingAuditKo,
} from "./shot-framing-svg-and-report";
