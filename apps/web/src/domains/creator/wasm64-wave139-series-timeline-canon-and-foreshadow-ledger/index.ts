/**
 * Wasm64 Wave 139 공개 배럴 진입점 (`wasm64-wave139-series-timeline-canon-and-foreshadow-ledger`).
 *
 * - `timeline-canon-types`: 장편 웹툰 세계관 연표·캐릭터·지역·복선·감사 리포트 계약
 * - `timeline-canon-crypto-and-calendar`: 윤년·생일 전후 정밀 만 나이(`computeExactAgeYears`),
 *   북/남반구 월별 계절 판정, 순수 ES2017 동기 FIPS 180-4 SHA-256 원장 해시
 * - `timeline-canon-auditor`: 6대 설정 붕괴 자동 탐지(`auditSeriesTimelineCanon`) 및
 *   캐릭터 생애 궤적 빌더(`buildCharacterLifecycleTrace`)
 * - `timeline-canon-svg-and-report`: 순수 OKLCH 가로 스윔레인·복선 아크 SVG 렌더러 및
 *   한국어 스토리 PD 검수 보고서
 */

export {
  ALL_CANON_ISSUE_CODES,
  CANON_ISSUE_CODE_LABEL_KO,
  FORESHADOW_IMPORTANCE_LABEL_KO,
  HEMISPHERE_LABEL_KO,
  SEASON_LABEL_KO,
  TRANSITION_KIND_LABEL_KO,
  type CanonIssueCode,
  type CanonIssueSeverity,
  type CanonIssueSubCode,
  type CharacterCanonSpec,
  type CharacterLifeStatus,
  type CharacterLifecycleTrace,
  type CharacterLifecycleTransition,
  type CharacterTracePoint,
  type CharacterTransitionKind,
  type DepictedSeason,
  type EpisodeTimelineEvent,
  type ForeshadowImportance,
  type ForeshadowLedgerSummary,
  type ForeshadowThreadAuditEntry,
  type ForeshadowThreadSpec,
  type ForeshadowThreadStatus,
  type LocationTransitRule,
  type SeriesTimelineCanonAuditResult,
  type SeriesTimelineCanonInput,
  type TimelineCanonIssue,
  type TimelineCanonVerdict,
  type TimelineEventSnapshot,
  type WorldHemisphere,
  type WorldLocationSpec,
} from "./timeline-canon-types";

export {
  canonicalizeCanonLedgerJson,
  civilDateToEpochDay,
  classifySeasonCalendarCompatibility,
  computeExactAgeYears,
  daysInGregorianMonth,
  formatCivilDateIso,
  inferExpectedSeasonForMonth,
  isCorePeakSeasonMonth,
  isGregorianLeapYear,
  isValidCivilDate,
  parseWorldDateIso,
  sha256CanonLedgerHex,
  type BirthDateParts,
  type ParsedWorldDate,
  type SeasonMismatchKind,
} from "./timeline-canon-crypto-and-calendar";

export {
  auditSeriesTimelineCanon,
  buildCharacterLifecycleTrace,
} from "./timeline-canon-auditor";

export {
  escapeTimelineXml,
  renderSeriesTimelineCanonSvg,
  summarizeSeriesTimelineCanonKo,
  type SeriesTimelineCanonReportKo,
  type TimelineCanonSvgOptions,
  type TimelineCanonSvgTheme,
} from "./timeline-canon-svg-and-report";
