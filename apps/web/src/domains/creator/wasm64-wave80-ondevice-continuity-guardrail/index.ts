/**
 * Wasm64 Wave 80 공개 배럴 진입점 (`wasm64-wave80-ondevice-continuity-guardrail`).
 *
 * - `local-episode-canon-index`: 100% 온디바이스 제로 업로드 연재 캐논 인덱스,
 *   타임라인 특징 진화, OKLCH→CIELAB→CIEDE2000 색차 수학, SHA-256 검증 로컬 스냅샷
 * - `continuity-drift-auditor`: 카메라 방향·거울 반사·장면 조명·작가 화풍 기준선(z-score)·
 *   소품 손상 회귀·장면 내 의상 변동을 검사하는 6대 작화 연속성 실시간 감사기
 * - `continuity-report-overlay-formatter`: Calm Atelier 비침습 캔버스 핀 오버레이(<= 9 예산)
 *   및 회차 마감 전 프리플라이트 요약 포매터
 */

export {
  ON_DEVICE_PRIVACY_CONTRACT,
  OnDeviceSeriesCanonIndex,
  assertOnDevicePrivacyContract,
  canonicalSerializeCanon,
  clamp01,
  compareEpisodeCutRef,
  computeCiede2000,
  computeLocalSha256Hex,
  computeOklchDeltaE00,
  formatOklchCss,
  normalizeAngleDeg,
  oklchToCieLab,
  resolveTraitLifecycleAt,
  verifySeriesCanonSnapshot,
  type AnatomicalSide,
  type AnthropometricSample,
  type BodyRegion,
  type CanonicalCharacterTrait,
  type CanonicalPaletteEntry,
  type CharacterCanonProfile,
  type CharacterCostumeState,
  type CieLabColor,
  type EpisodeCutRef,
  type EpisodeCutStateRecord,
  type OklchColor,
  type OnDevicePrivacyContract,
  type OnDeviceSeriesCanonIndexInit,
  type PaletteSlotKey,
  type PropIntegrityState,
  type PropStateRecord,
  type ProportionMetricBaseline,
  type ProportionMetricKey,
  type ResolvedTraitLifecycle,
  type SceneCostumeStateSnapshot,
  type SceneLightingMood,
  type ScenePropStateSnapshot,
  type SeriesCanonSnapshotPayload,
  type SignedSeriesCanonSnapshot,
  type TraitCategory,
  type TraitLifecycleStatus,
  type TraitStatusTransition,
} from "./local-episode-canon-index";

export {
  auditCutContinuityGuardrail,
  evaluateLightingAdaptedPaletteDeltaE,
  inferAnatomicalSideFromScreen,
  isTraitVisibleFromCamera,
  resolveExpectedScreenSide,
  type CameraFacingDirection,
  type ContinuityAuditFinding,
  type ContinuityAuditOptions,
  type ContinuityBlunderKind,
  type ContinuitySeverity,
  type CutContinuityAuditResult,
  type CutContinuityObservation,
  type NormalizedCanvasPoint,
  type ObservedCharacterInCut,
  type ObservedCharacterTrait,
  type ObservedCostumeInCut,
  type ObservedPaletteSample,
  type ObservedPropInCut,
  type ObservedProportions,
  type SuggestedContinuityFix,
  type SuggestedFixActionKind,
} from "./continuity-drift-auditor";

export {
  CONTINUITY_PIN_HIT_TARGET_PX,
  MAX_VISIBLE_CONTINUITY_PINS,
  buildContinuityCanvasPinOverlays,
  summarizeEpisodeContinuityReport,
  type BuildPinOverlayOptions,
  type ContinuityCanvasPinMarker,
  type ContinuityCanvasPinOverlaySet,
  type ContinuityPinOverflowGroup,
  type EpisodeContinuityPreflightSummary,
  type EpisodePreflightReadiness,
  type EpisodePriorityFindingRef,
  type SeverityBadgeVisualToken,
} from "./continuity-report-overlay-formatter";
