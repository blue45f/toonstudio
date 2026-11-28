/**
 * Wasm64 Wave 129 공개 배럴 진입점 (`wasm64-wave129-redline-pin-markup-and-revision-consensus-engine`).
 *
 * - `redline-markup-types`: 7개 스튜디오 역할, 레드라인 핀, 상태 전이, 공간 군집, 라운드 차분, PD 승인 게이트 계약
 * - `redline-sha256-and-canonical`: 순수 ES2017 동기 FIPS 180-4 SHA-256 및 키 순서 무관 원장 직렬화
 * - `redline-pin-revision-engine`: 권한 분리(SoD) 상태 머신, 공간 군집·상충 감지기, 라운드 차분, 출고 승인 게이트
 * - `redline-markup-svg-and-report`: 인쇄 안전 순수 OKLCH 레드라인 보드 SVG 및 한국어 PD 검수 브리프
 */

export {
  REDLINE_CATEGORY_LABELS_KO,
  REDLINE_PIN_CATEGORIES,
  REDLINE_PIN_SEVERITIES,
  REDLINE_PIN_STATUSES,
  REDLINE_SEVERITY_BADGE_LABELS,
  REDLINE_SEVERITY_LABELS_KO,
  REDLINE_STATUS_LABELS_KO,
  STUDIO_COLLABORATOR_ROLES,
  STUDIO_ROLE_LABELS_KO,
  STUDIO_VERIFIER_ROLES,
  type EpisodeRevisionSignOffResult,
  type EpisodeSignOffBlockingCode,
  type EpisodeSignOffDecision,
  type EpisodeSignOffOptions,
  type RedlineClusterDetectionOptions,
  type RedlineOverlapDetectionResult,
  type RedlinePinCategory,
  type RedlinePinCluster,
  type RedlinePinItem,
  type RedlinePinSeverity,
  type RedlinePinStatus,
  type RedlinePinTransitionEvent,
  type RedlinePinTransitionInput,
  type RedlinePinTransitionResult,
  type RedlineRevisionBoardSvgOptions,
  type RedlineRevisionLedgerSession,
  type RedlineTransitionRejectionCode,
  type RevisionRoundDiffOptions,
  type RevisionRoundDiffResult,
  type RoleRemainingDetail,
  type StudioCollaboratorRole,
} from "./redline-markup-types";

export {
  canonicalizeJsonValue,
  canonicalizeRedlineLedgerJson,
  computeCanonicalObjectSha256Hex,
  computeRedlineLedgerSha256Hex,
  encodeUtf8Bytes,
  sha256BytesHex,
  sha256Utf8Hex,
} from "./redline-sha256-and-canonical";

export {
  DEFAULT_CLUSTER_RADIUS_NORM,
  MAX_CLUSTER_RADIUS_NORM,
  MIN_CLUSTER_RADIUS_NORM,
  canTransitionRedlineStatus,
  clampNormalizedCoord,
  computeRemainingWorkloadByRole,
  createRedlineRevisionSession,
  detectOverlappingRedlinePins,
  diffRevisionRounds,
  evaluateEpisodeRevisionSignOff,
  isVerifierRole,
  normalizeRedlinePin,
  normalizeRedlinePins,
  transitionRedlinePinStatus,
} from "./redline-pin-revision-engine";

export {
  escapeRedlineXml,
  renderRedlineRevisionBoardSvg,
  summarizeRedlineRevisionAuditKo,
} from "./redline-markup-svg-and-report";
