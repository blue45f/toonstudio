/**
 * Wasm64 Wave 126 공개 배럴 진입점 (`wasm64-wave126-scroll-sync-bgm-cue-and-crossfade-compiler`).
 *
 * - `scroll-sync-bgm-types`: 세로 스크롤 BGM 큐시트, 정전력 크로스페이드, 히스테리시스 세션, 카멜롯 화성·LUFS 타입
 * - `scroll-sync-bgm-cue-compiler`: 정전력 크로스페이드(`cos²+sin²=1`), 극적 무음 컷 완전 격리(`<= 0.001`, `>= 40ms`),
 *   독자 스크롤(정독·고속 플링·경계선 왕복 지터) 히스테리시스 스래싱 방어 시뮬레이터
 * - `bgm-harmony-and-loudness-auditor`: 카멜롯 휠 12시간 원형 화성 거리, 라우드니스 상한·급변·3중 겹침 혼탁 감사기,
 *   순수 ES2017 FIPS 180-4 SHA-256 큐시트 매니페스트 해시
 * - `bgm-cue-svg-and-report`: 인쇄 안전 순수 OKLCH BGM 큐시트 포락선 SVG 및 한국어 음악 감독 QA 브리프
 */

export {
  CAMELOT_MUSICAL_KEY_LABELS,
  DEFAULT_ABRUPT_CLICK_DELTA_THRESHOLD,
  DEFAULT_ANTICLICK_RAMP_MS,
  DEFAULT_CLASH_DISTANCE_THRESHOLD,
  DEFAULT_DRAMATIC_SILENCE_FLOOR_LINEAR,
  DEFAULT_FLING_HOLD_VELOCITY_PX_PER_SEC,
  DEFAULT_HIGH_SPEED_FLING_VELOCITY_PX_PER_SEC,
  DEFAULT_HYSTERESIS_DEADBAND_PX,
  DEFAULT_MAX_ADJACENT_LUFS_JUMP_DB,
  DEFAULT_MAX_ALLOWED_LUFS,
  DEFAULT_MIN_ANTICLICK_FADE_MS,
  DEFAULT_MIN_DWELL_MS,
  DEFAULT_REFERENCE_SCROLL_VELOCITY_PX_PER_SEC,
  SILENCE_FLOOR_DB,
} from "./scroll-sync-bgm-types";

export type {
  ActiveTrackGainEntry,
  AuditBgmCueSheetOptions,
  BgmCueAuditFinding,
  BgmCueAuditFindingCode,
  BgmCueAuditSeverity,
  BgmCueValidationIssue,
  BgmCueValidationIssueCode,
  BgmTrackCueSpec,
  CamelotCompatibilityLevel,
  CamelotHarmonicDistanceResult,
  CamelotKey,
  CamelotMode,
  CamelotNumber,
  CamelotRelationKind,
  CueSwitchEvent,
  EpisodeBgmAuditStatus,
  EpisodeBgmCueAuditReport,
  EqualPowerCrossfadePairInfo,
  EvaluateScrollBgmMixOptions,
  HarmonicTransitionAuditEntry,
  MuddyOverlapSpan,
  ParsedCamelotKey,
  ReaderScrollProfileKind,
  ReaderScrollTrajectoryPoint,
  ScrollAudioSessionResult,
  ScrollAudioSimulationFrame,
  ScrollBgmMixSnapshot,
  ScrollEngineSessionMetrics,
  ScrollSessionGuardOptions,
  TrackEnvelopePhase,
} from "./scroll-sync-bgm-types";

export {
  evaluateScrollBgmMixAtPosition,
  isValidCamelotKey,
  parseCamelotKey,
  sortBgmCuesDeterministically,
  validateBgmCueSheet,
} from "./scroll-sync-bgm-cue-compiler";

export {
  createBoundaryJitterScrollTrajectory,
  createConstantVelocityScrollTrajectory,
  simulateReaderScrollAudioSession,
} from "./scroll-session-hysteresis-simulator";

export {
  auditEpisodeBgmCueSheet,
  canonicalizeBgmCueJson,
  computeCamelotHarmonicDistance,
  sha256BgmCueHex,
} from "./bgm-harmony-and-loudness-auditor";

export {
  escapeBgmSvgXml,
  renderScrollSyncBgmCueSvg,
  summarizeScrollSyncBgmCueKo,
} from "./bgm-cue-svg-and-report";

export type {
  BgmDirectorBriefOptions,
  ScrollSyncBgmSvgOptions,
} from "./bgm-cue-svg-and-report";
