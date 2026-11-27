/**
 * Wasm64 Wave 48 공개 진입점 (`wasm64-wave48-perspective-proportion-lock`).
 *
 * 하이앵글·로우앵글 컷에서 캐릭터 등신대 비율 붕괴를 막는 3D 원근 인체 가이드 투영 커널:
 * - `character-proportion-canon-extractor`: 2D 정면 시트 또는 등신대 프리셋(6·7.5·8.5·3등신 SD)에서
 *   머리 높이(`headUnit`) 기준 3D 캐논 랜드마크, 단면 링, 허용 편차 테이블 추출
 * - `camera-perspective-rig-projector`: 4×4 뷰·투영 행렬로 3D 등신대 랜드마크와
 *   흉곽·골반 단축 원근 타원을 2D 캔버스 좌표로 투영하고 깊이 정렬(`depthOrder`) 산출
 * - `proportion-drift-validator-guide`: 작가의 2D 러프·선화와 투영 원근 가이드 간 편차를
 *   부위별 왜곡률(%)로 진단하고 보정 화살표 벡터(`correctionArrows`) 생성
 */

export {
  createProportionCanonFromPreset,
  extractProportionCanonFromFrontSheet,
  PROPORTION_CANON_PRESETS,
  verifyProportionCanonInvariants,
  type BodyProportionRegion,
  type CanonCrossSectionRing3D,
  type CanonInvariantReport,
  type CanonLandmark3D,
  type CanonLandmarkId,
  type CharacterProportionCanon,
  type CrossSectionRingId,
  type FrontCharacterSheetInput,
  type ProportionCanonPresetId,
  type ProportionCanonPresetSpec,
  type ProportionMetricId,
  type ProportionToleranceRule,
  type Vec2,
  type Vec3,
} from "./character-proportion-canon-extractor";

export {
  multiplyMat4,
  projectCharacterRigToCanvas,
  transformPointByMat4,
  type CanvasViewportSize,
  type CutCameraParams,
  type Mat4,
  type PerspectiveProjectionMetrics,
  type ProjectedCrossSectionEllipse2D,
  type ProjectedDepthOrderItem,
  type ProjectedHorizonLine,
  type ProjectedLandmark2D,
  type ProjectedPerspectiveRigResult,
  type ProjectedRingSample2D,
} from "./camera-perspective-rig-projector";

export {
  validateArtistProportionDrift,
  type AlignmentTransform2D,
  type ArtistDrawingLandmarksInput,
  type CorrectionArrowGuide,
  type DriftAlignmentMode,
  type DriftDirection,
  type DriftSeverity,
  type DriftValidationOptions,
  type ProportionDriftValidationReport,
  type RegionDriftDiagnosis,
} from "./proportion-drift-validator-guide";
