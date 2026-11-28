/**
 * Wasm64 Wave 134 공개 배럴 진입점 (`wasm64-wave134-episode-deadline-cpm-and-assistant-load-balancer`).
 *
 * - `episode-schedule-types`: 5단계 웹툰 공정·팀원·CPM·부하 평준화·경보 계약 타입
 * - `schedule-sha256-and-canonical`: 순수 ES2017 동기 FIPS 180-4 SHA-256 및 키 순서 무관 매니페스트 지문
 * - `episode-deadline-cpm-solver`: 순환 의존성 fail-closed CPM 분석기 및 LPT+MCT 어시스턴트 부하 평준화 옵티마이저
 * - `deadline-schedule-svg-and-report`: 인쇄 안전 순수 OKLCH 간트·부하 비교 SVG 및 한국어 PD 브리프
 */

export {
  CRITICAL_PATH_FLOAT_EPSILON_HR,
  CRUNCH_WINDOW_HOURS,
  CRUNCH_WORK_SHARE_THRESHOLD,
  DEFAULT_MAX_HEALTHY_HOURS_PER_DAY,
  DEFAULT_SPEED_MULTIPLIER,
  MAX_SPEED_MULTIPLIER,
  MIN_SPEED_MULTIPLIER,
  ON_TRACK_MARGIN_THRESHOLD_HR,
  PRODUCTION_STAGE_LABELS_KO,
  PRODUCTION_STAGE_ORDER,
  PRODUCTION_STAGE_PHASE,
  PRODUCTION_STAGE_SHORT_KO,
  type BurnoutAlertSeverity,
  type BurnoutOverloadAlert,
  type CrunchWindowMetrics,
  type DeadlineStatus,
  type EpisodeCpmScheduleResult,
  type EpisodeScheduleGanttSvgOptions,
  type EpisodeScheduleInput,
  type EpisodeTaskItem,
  type MemberWorkloadSummary,
  type NormalizedStudioTeamMember,
  type ProductionStageId,
  type RebalanceWorkloadOptions,
  type ScheduleValidationError,
  type ScheduleValidationErrorCode,
  type ScheduledEpisodeTask,
  type StudioTeamMember,
  type TaskReassignmentRecord,
  type WorkloadRebalanceResult,
} from "./episode-schedule-types";

export {
  canonicalizeScheduleValue,
  computeScheduleManifestSha256Hex,
  encodeUtf8Bytes,
  sha256BytesHex,
  sha256Utf8Hex,
} from "./schedule-sha256-and-canonical";

export { computeEpisodeCpmSchedule } from "./episode-deadline-cpm-solver";

export { rebalanceAssistantWorkload } from "./assistant-workload-rebalancer";

export {
  escapeScheduleXml,
  renderEpisodeScheduleGanttSvg,
  summarizeEpisodeScheduleAuditKo,
} from "./deadline-schedule-svg-and-report";
