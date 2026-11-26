/**
 * Super-Gap Pillars G & H 통합 진입점(#25~#32, 전 기능 ₩0 로컬 완결).
 *
 * - #25 스트로크 이력 기반 마감 ETA·병목 예측기(`predictDeadlineEtaFromHistory`)
 * - #26 다중 에피소드 글로벌 스마트 심볼 인스턴스 전파기(`GlobalSmartSymbolRegistry`)
 * - #27 무설치 암호화 P2P 일회성 레드라인 검수 링크(`EphemeralP2pRedlineReviewSession`)
 * - #28 제로-오버헤드 XOR+RLE Undo-Log 타임랩스 릴스 생성기(`buildTimelapseScheduleFromUndoLog`)
 * - #29/#30/#31/#32 컴패니언 폰 자이로/다이얼 · WebHID/WebMIDI 매퍼 ·
 *   외부 DCC(.psd/.glb) 핫싱크 · 제로-네트워크 콜드부트 감사(`HardwareCompanionAndColdBootSuite`)
 */

export {
  predictDeadlineEtaFromHistory,
  PRODUCTION_STAGES,
  type CutStageHistoryEntry,
  type DeadlineEtaInput,
  type DeadlineEtaPredictionReport,
  type DeadlineRiskLevel,
  type DeadlineShortcutRecommendation,
  type ProductionStage,
  type RemainingCutWorkItem,
  type StageEtaBreakdown,
} from "./deadline-eta-predictor";

export {
  applyHomographyToPoint,
  composeHomographies,
  computeHomographyDeterminant,
  GlobalSmartSymbolRegistry,
  IDENTITY_HOMOGRAPHY_3X3,
  solveHomographyFromQuads,
  type GlobalSymbolPropagationReport,
  type HomographyMatrix3x3,
  type LinkedSymbolInstanceState,
  type LinkSymbolInstanceInput,
  type MasterSymbolDefinitionInput,
  type MasterSymbolPatch,
  type MasterSymbolRecord,
  type PerspectiveQuad2D,
  type SymbolPoint2D,
  type SymbolVectorPath,
} from "./global-smart-symbols";

export {
  EphemeralP2pRedlineReviewSession,
  parseZeroInstallReviewLink,
  type BaseArtLayerSnapshot,
  type CreateRedlineSessionOptions,
  type EncryptedRedlineReviewPacket,
  type EphemeralRedlineReviewLink,
  type ParsedRedlineReviewLink,
  type RedlineAnnotationItem,
  type RedlineDialogueCommentAnnotation,
  type RedlineOverlaySnapshot,
  type RedlinePacketIngestResult,
  type RedlinePinAnnotation,
  type RedlineReviewPacketPayload,
  type RedlineSemanticTone,
  type RedlineStrokeAnnotation,
  type RedlineStrokePoint,
} from "./ephemeral-redline-review";

export {
  buildTimelapseScheduleFromUndoLog,
  decodeUndoXorRleDelta,
  encodeUndoXorRleDelta,
  type BuildTimelapseScheduleInput,
  type TimelapseArtStage,
  type TimelapseReelSchedule,
  type TimelapseScheduledFrame,
  type TimelapseSpeedCurve,
  type UndoTimelapseEvent,
  type XorRleDeltaEncodingResult,
} from "./timelapse-undo-reels";

export {
  CompanionGyroDialController,
  ExternalDccHotSyncManager,
  HardwareCompanionAndColdBootSuite,
  HardwareHidMidiMapper,
  validateExternalDccHeader,
  ZeroNetworkColdBootAuditor,
  type CachedAssetVerificationRecord,
  type ColdBootCheckId,
  type ColdBootCheckResult,
  type ColdBootCheckSeverity,
  type ColdBootEnvironmentSnapshot,
  type ColdBootReadinessReport,
  type CompanionDialMode,
  type CompanionGyroDialConfig,
  type CompanionGyroDialSample,
  type CompanionStudioGestureAction,
  type ExternalDccAssetLinkInput,
  type ExternalDccFormat,
  type ExternalDccHotSyncPlan,
  type ExternalDccManifestEntry,
  type ExternalDccSyncStatus,
  type HardwareCompanionSuiteOptions,
  type HardwareControlBinding,
  type HardwareResponseCurve,
  type HardwareStudioCommandId,
  type MappedHardwareCommand,
} from "./hardware-companion-coldboot";
