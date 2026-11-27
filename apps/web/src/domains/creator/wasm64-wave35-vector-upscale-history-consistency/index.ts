/**
 * Wasm64 Wave 35 공개 배럴 엔트리 (`wasm64-wave35-vector-upscale-history-consistency`).
 *
 * - `vector-curvature-lineart-upscaler`: 의도된 만화 펜선 예각·직각 모서리는 고정하고 곡선 구간만
 *   구심성(Centripetal) Catmull-Rom + 단조 3차 Hermite 필압 보간으로 재잉킹하는 2x·4x 선화 업스케일러
 * - `semantic-dag-history-branch-tracker`: 연속 미세 편집을 창작 단계별 체크포인트로 병합하고
 *   콘텐츠 주소 지정(CAS) 타일 해시 제로카피 공유·정밀 레이어 차분·선택적 복원을 제공하는 히스토리 DAG 엔진
 * - `episode-model-sheet-consistency-guard`: 캐릭터 공식 설정표 대비 Oklab 색차, 미보정 좌우 반전 컷의
 *   비대칭 특징 오류, 배경 그라데이션 밴딩, 말풍선 식자 명도 대비를 일괄 검증하는 출고 전 품질 가드
 */

export {
  DEFAULT_BANDING_SEVERITY_THRESHOLD,
  DEFAULT_MAX_PALETTE_DELTA_E_OKLAB,
  DEFAULT_MIN_BODY_TEXT_CONTRAST,
  DEFAULT_MIN_LARGE_TEXT_CONTRAST,
  auditEpisodeQualityAndConsistency,
  deltaEOklab,
  detectGradientBanding,
  srgbToOklab,
  wcagContrastRatio,
  type AsymmetricTraitKind,
  type AsymmetryDefectCause,
  type AsymmetryFlipDefect,
  type CanonicalAsymmetricTrait,
  type CharacterModelSheet,
  type CutCameraFacing,
  type CutCharacterAppearance,
  type CutLightingTintSpec,
  type EpisodeAuditRequest,
  type EpisodeCutAuditInput,
  type EpisodeQualityAuditReport,
  type GradientBandingAnalysis,
  type GradientBandingDefect,
  type GradientRegionAuditInput,
  type OklabColor,
  type PaletteDriftDefect,
  type SrgbColor8,
  type TextBalloonContrastInput,
  type TextContrastDefect,
  type TraitAnatomicalSide,
  type TraitScreenSide,
} from "./episode-model-sheet-consistency-guard";

export {
  DEFAULT_COALESCE_WINDOW_MS,
  DEFAULT_MAIN_BRANCH_NAME,
  DEFAULT_MAX_COALESCED_OPS,
  SemanticHistoryDagTracker,
  diffHistoryCheckpoints,
  type CreativeHistoryStage,
  type DagStorageDeduplicationStats,
  type HistoryCheckpointDiff,
  type HistoryCheckpointNode,
  type HistoryCoalescePolicy,
  type HistoryLayerBlendMode,
  type HistoryLayerSnapshot,
  type HistoryTileRef,
  type LayerStructuralModification,
  type MicroEditOperation,
  type SelectiveLayerRestoreRequest,
  type SemanticDagInitOptions,
} from "./semantic-dag-history-branch-tracker";

export {
  DEFAULT_BASE_STROKE_WIDTH_PX,
  DEFAULT_CENTRIPETAL_ALPHA,
  DEFAULT_MITER_LIMIT,
  DEFAULT_SHARP_CORNER_MIN_TURN_DEG,
  detectSharpInkCorners,
  evaluateCatmullRomCentripetal,
  upscaleLineartPolylines,
  type CentripetalEvalSample,
  type CornerDetectionOptions,
  type DetectedInkCorner,
  type InkPoint2D,
  type InkStrokePolyline,
  type InkStrokeSample,
  type LineartUpscaleOptions,
  type StrokeWidthScaleMode,
  type UpscaledInkSample,
  type UpscaledInkStroke,
  type UpscaledLineartReport,
} from "./vector-curvature-lineart-upscaler";
