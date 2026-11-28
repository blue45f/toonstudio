/**
 * Wasm64 Wave 106 공개 배럴 진입점 (`wasm64-wave106-character-turnaround-rig-and-expression-sheet`).
 *
 * - `loomis-head-3d-turnaround-rig`: 3D 루미스 두상 360° 투영, 7종 표정 프리셋, 좌우 잠금 비대칭 특징점 백페이스 컬링
 * - `turnaround-sheet-and-offmodel-auditor`: 5각 턴어라운드 시트 정렬 검증, 캐논 SHA-256/FNV-1a 지문, 작붕 감사 엔진
 * - `turnaround-sheet-svg-and-audit`: 인쇄 안전 고대비 OKLCH SVG 시트 렌더러 및 한국어 작화 감독 QA 보고서
 */

export {
  ALL_EXPRESSION_PRESET_IDS,
  clampFinite,
  createDefaultCharacterHeadCanonSheet,
  dotVec3,
  EXPRESSION_PRESET_TABLE,
  normalizeVec3,
  normalizeYawDeg,
  projectCharacterHeadAtView,
  rotateHeadLocalToCamera,
  type AnatomicalSide,
  type AsymmetricFacialLandmark,
  type AsymmetricLandmarkKind,
  type CharacterHeadCanonSheet,
  type CharacterStyleArchetype,
  type ComicExpressionMarkerKind,
  type EarSpanCanon,
  type ExpressionPresetId,
  type ExpressionRigParameters,
  type HeadProjectionOptions,
  type HeadViewAngle,
  type ProjectedAsymmetricLandmark,
  type ProjectedBrowFeature,
  type ProjectedCanonGuideRails,
  type ProjectedCharacterHeadView,
  type ProjectedComicMarker,
  type ProjectedCranialBounds,
  type ProjectedEarFeature,
  type ProjectedEyeFeature,
  type ProjectedLoomisSidePlane,
  type ProjectedMouthFeature,
  type ProjectedNoseFeature,
  type ProjectedPoint3D,
  type ScreenSide,
  type Vec2,
  type Vec3,
} from "./loomis-head-3d-turnaround-rig";

export {
  auditDrawnPanelFaceAgainstCanon,
  buildFiveAngleTurnaroundSheet,
  CANONICAL_FIVE_TURNAROUND_ANGLES_DEG,
  computeCanonSheetFingerprints,
  computeFipsSha256Hex,
  computeFnv1a32Hex,
  DEFAULT_OFFMODEL_AUDIT_TOLERANCES,
  type CanonSheetFingerprints,
  type DrawnPanelFaceObservation,
  type FiveAngleTurnaroundSheet,
  type LandmarkChiralityAuditEntry,
  type ObservedAsymmetricLandmark,
  type OffModelAuditFinding,
  type OffModelAuditTolerances,
  type OffModelDriftAuditReport,
  type OffModelFindingCode,
  type OffModelFindingSeverity,
  type OffModelPassStatus,
  type ProportionDriftAuditEntry,
  type TurnaroundRailAlignmentAudit,
  type TurnaroundSheetBuildOptions,
  type TurnaroundSheetPanel,
  type TurnaroundSheetPanelBounds,
  type TurnaroundViewCode,
} from "./turnaround-sheet-and-offmodel-auditor";

export {
  escapeTurnaroundSvgXml,
  renderCharacterTurnaroundSheetSvg,
  summarizeCharacterTurnaroundAuditKo,
  type CharacterTurnaroundAuditSummaryKo,
  type TurnaroundSheetSvgOptions,
} from "./turnaround-sheet-svg-and-audit";
