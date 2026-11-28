/**
 * Wave 139 — 장편 웹툰 세계관 연표(Timeline) · 캐릭터 나이·계절·복선 회수 무결성 원장 타입 계약.
 *
 * - 100~300화 장기 연재 웹툰에서 빈번한 설정 붕괴 6종(나이 오기, 사망자 비회상 재등장,
 *   계절·달력 모순, 인과 역전 및 순환, 동시 원거리 텔레포트, 미회수·선행 회수 복선)을
 *   결정론적 그래프·상태 머신으로 사전 차단하기 위한 정본 스키마를 정의한다.
 * - 순수 ES2017 strict TypeScript, 외부 의존성 0개.
 */

export type WorldHemisphere = "north" | "south";

export type DepictedSeason = "spring" | "summer" | "autumn" | "winter";

export type ForeshadowImportance = "main-arc" | "subplot" | "easter-egg";

export type CharacterTransitionKind =
  | "death"
  | "revival-canonical"
  | "travel"
  | "injury-permanent"
  | "memory-loss";

export type CharacterLifeStatus = "alive" | "deceased";

export type CanonIssueSeverity = "blocker" | "warning" | "info";

export type CanonIssueCode =
  | "character-age-mismatch"
  | "deceased-character-non-flashback"
  | "season-calendar-contradiction"
  | "causal-chronology-inversion"
  | "simultaneous-location-teleport"
  | "unpaid-foreshadow-chekhov-gun"
  | "payoff-before-setup"
  | "invalid-world-date"
  | "unknown-reference";

export type CanonIssueSubCode =
  | "age-value-diff"
  | "pre-birth-appearance"
  | "deceased-without-revival"
  | "opposite-season"
  | "peak-month-season-mismatch"
  | "adjacent-season-mismatch"
  | "effect-before-cause-date"
  | "causal-cycle"
  | "same-day-different-location"
  | "transit-days-insufficient"
  | "deadline-missed"
  | "series-completed-unpaid"
  | "payoff-earlier-world-date"
  | "malformed-date"
  | "missing-character"
  | "missing-event";

export type TimelineCanonVerdict = "clean" | "needs-review" | "blocked";

export type ForeshadowThreadStatus =
  | "paid-off"
  | "open-within-window"
  | "overdue-unpaid"
  | "intentionally-open-sequel"
  | "invalid-chronology";

export const ALL_CANON_ISSUE_CODES: readonly CanonIssueCode[] = [
  "character-age-mismatch",
  "deceased-character-non-flashback",
  "season-calendar-contradiction",
  "causal-chronology-inversion",
  "simultaneous-location-teleport",
  "unpaid-foreshadow-chekhov-gun",
  "payoff-before-setup",
  "invalid-world-date",
  "unknown-reference",
];

export const SEASON_LABEL_KO: Readonly<Record<DepictedSeason, string>> = {
  spring: "봄",
  summer: "여름",
  autumn: "가을",
  winter: "겨울",
};

export const HEMISPHERE_LABEL_KO: Readonly<Record<WorldHemisphere, string>> = {
  north: "북반구",
  south: "남반구",
};

export const FORESHADOW_IMPORTANCE_LABEL_KO: Readonly<Record<ForeshadowImportance, string>> = {
  "main-arc": "메인 아크",
  subplot: "서브 플롯",
  "easter-egg": "이스터에그",
};

export const TRANSITION_KIND_LABEL_KO: Readonly<Record<CharacterTransitionKind, string>> = {
  death: "사망",
  "revival-canonical": "정식 부활",
  travel: "지역 이동",
  "injury-permanent": "영구 부상",
  "memory-loss": "기억 상실",
};

export const CANON_ISSUE_CODE_LABEL_KO: Readonly<Record<CanonIssueCode, string>> = {
  "character-age-mismatch": "캐릭터 나이 불일치",
  "deceased-character-non-flashback": "사망 캐릭터 비회상 재등장",
  "season-calendar-contradiction": "계절·달력 모순",
  "causal-chronology-inversion": "인과 연대기 역전·순환",
  "simultaneous-location-teleport": "동시 원거리 텔레포트",
  "unpaid-foreshadow-chekhov-gun": "미회수 복선(체호프의 총)",
  "payoff-before-setup": "복선 선행 회수 모순",
  "invalid-world-date": "유효하지 않은 세계관 날짜",
  "unknown-reference": "미등록 개체 참조",
};

/**
 * 세계관 캐릭터 정본 프로필.
 */
export interface CharacterCanonSpec {
  readonly characterId: string;
  readonly nameKo: string;
  readonly birthYear: number;
  readonly birthMonth: number;
  readonly birthDay: number;
  readonly initialLocationId: string;
  readonly roleKo?: string;
}

/**
 * 선택적 세계관 지역 메타데이터(반구·생활권 클러스터·권역 이동 최소 일수).
 */
export interface WorldLocationSpec {
  readonly locationId: string;
  readonly nameKo: string;
  readonly regionCluster?: string;
  readonly hemisphere?: WorldHemisphere;
  readonly minInterRegionTransitDays?: number;
}

/**
 * 두 지역 간 물리적 최소 이동 일수 규칙.
 */
export interface LocationTransitRule {
  readonly fromLocationId: string;
  readonly toLocationId: string;
  readonly minTransitDays: number;
  readonly bidirectional?: boolean;
}

/**
 * 특정 씬에서 캐릭터에게 발생하는 정식 상태 전환.
 */
export interface CharacterLifecycleTransition {
  readonly characterId: string;
  readonly kind: CharacterTransitionKind;
  readonly targetLocationId?: string;
  readonly noteKo?: string;
}

/**
 * 화차별 씬 연표 이벤트 정본.
 */
export interface EpisodeTimelineEvent {
  readonly eventId: string;
  readonly titleKo?: string;
  readonly episodeNumber: number;
  readonly sceneIndex: number;
  readonly worldDateIso: string;
  readonly isFlashback?: boolean;
  readonly isDreamOrAlternate?: boolean;
  readonly locationId: string;
  readonly hemisphere?: WorldHemisphere;
  readonly depictedSeason?: DepictedSeason;
  readonly depictedAges?: Readonly<Record<string, number>>;
  readonly presentCharacterIds: readonly string[];
  readonly stateTransitions?: readonly CharacterLifecycleTransition[];
  readonly causesEventIds?: readonly string[];
}

/**
 * 장편 복선(Chekhov's Gun) 설치·회수 원장 항목.
 */
export interface ForeshadowThreadSpec {
  readonly threadId: string;
  readonly titleKo: string;
  readonly setupEventId: string;
  readonly setupEpisode: number;
  readonly targetPayoffDeadlineEpisode?: number;
  readonly payoffEventIds: readonly string[];
  readonly importance: ForeshadowImportance;
  readonly intentionallyOpenForSequel?: boolean;
}

/**
 * 세계관 연표 무결성 감사기 입력 계약.
 */
export interface SeriesTimelineCanonInput {
  readonly seriesId: string;
  readonly seriesTitleKo: string;
  readonly currentEpisodeNumber?: number;
  readonly seriesCompleted?: boolean;
  readonly defaultHemisphere?: WorldHemisphere;
  readonly characters: readonly CharacterCanonSpec[];
  readonly events: readonly EpisodeTimelineEvent[];
  readonly foreshadowThreads: readonly ForeshadowThreadSpec[];
  readonly locations?: readonly WorldLocationSpec[];
  readonly transitLinks?: readonly LocationTransitRule[];
}

/**
 * 탐지된 개별 설정 붕괴·검수 경고 레코드.
 */
export interface TimelineCanonIssue {
  readonly issueId: string;
  readonly code: CanonIssueCode;
  readonly subCode: CanonIssueSubCode;
  readonly severity: CanonIssueSeverity;
  readonly episodeNumber: number | null;
  readonly sceneIndex: number | null;
  readonly worldDateIso: string | null;
  readonly eventId: string | null;
  readonly relatedEventIds: readonly string[];
  readonly characterIds: readonly string[];
  readonly threadId: string | null;
  readonly messageKo: string;
  readonly fixHintKo: string;
}

/**
 * 캐릭터 생애 궤적의 단일 연표 지점.
 */
export interface CharacterTracePoint {
  readonly eventId: string;
  readonly episodeNumber: number;
  readonly sceneIndex: number;
  readonly worldDateIso: string;
  readonly locationId: string;
  readonly exactAgeYears: number | null;
  readonly depictedAgeYears: number | null;
  readonly isFlashback: boolean;
  readonly isDreamOrAlternate: boolean;
  readonly lifeStatusAfter: CharacterLifeStatus;
  readonly appliedTransitions: readonly CharacterTransitionKind[];
  readonly issueCodesAtPoint: readonly CanonIssueCode[];
}

/**
 * 캐릭터 1인의 전체 연재 기간 생애 궤적 요약.
 */
export interface CharacterLifecycleTrace {
  readonly characterId: string;
  readonly nameKo: string;
  readonly birthDateIso: string;
  readonly initialLocationId: string;
  readonly finalLifeStatus: CharacterLifeStatus;
  readonly deathEventIds: readonly string[];
  readonly revivalEventIds: readonly string[];
  readonly permanentInjuryNotesKo: readonly string[];
  readonly memoryLossEventIds: readonly string[];
  readonly firstAppearanceEpisode: number | null;
  readonly lastAppearanceEpisode: number | null;
  readonly totalAppearances: number;
  readonly flashbackAppearances: number;
  readonly points: readonly CharacterTracePoint[];
}

/**
 * 복선 1건의 회수 판정 상세.
 */
export interface ForeshadowThreadAuditEntry {
  readonly threadId: string;
  readonly titleKo: string;
  readonly importance: ForeshadowImportance;
  readonly setupEventId: string;
  readonly setupEpisode: number;
  readonly setupDateIso: string | null;
  readonly targetPayoffDeadlineEpisode: number | null;
  readonly payoffEventIds: readonly string[];
  readonly resolvedPayoffEpisodes: readonly number[];
  readonly status: ForeshadowThreadStatus;
  readonly intentionallyOpenForSequel: boolean;
  readonly spanEpisodes: number | null;
}

/**
 * 작품 전체 복선 회수율 및 잔여 복선 요약.
 */
export interface ForeshadowLedgerSummary {
  readonly totalThreads: number;
  readonly paidOffCount: number;
  readonly openWithinWindowCount: number;
  readonly overdueUnpaidCount: number;
  readonly intentionallyOpenSequelCount: number;
  readonly invalidChronologyCount: number;
  readonly payoffRateRatio: number;
  readonly remainingThreads: readonly ForeshadowThreadAuditEntry[];
  readonly entries: readonly ForeshadowThreadAuditEntry[];
}

/**
 * 연표 감사 결과에 포함되는 정규화 이벤트 스냅샷(렌더러·추적용).
 */
export interface TimelineEventSnapshot {
  readonly eventId: string;
  readonly titleKo: string;
  readonly episodeNumber: number;
  readonly sceneIndex: number;
  readonly worldDateIso: string;
  readonly epochDay: number | null;
  readonly isFlashback: boolean;
  readonly isDreamOrAlternate: boolean;
  readonly locationId: string;
  readonly hemisphere: WorldHemisphere;
  readonly depictedSeason: DepictedSeason | null;
  readonly expectedSeason: DepictedSeason | null;
  readonly presentCharacterIds: readonly string[];
}

/**
 * 장편 웹툰 세계관 연표·복선 무결성 감사 최종 산출물.
 */
export interface SeriesTimelineCanonAuditResult {
  readonly seriesId: string;
  readonly seriesTitleKo: string;
  readonly currentEpisodeNumber: number;
  readonly verdict: TimelineCanonVerdict;
  readonly totalCharacters: number;
  readonly totalEvents: number;
  readonly totalForeshadowThreads: number;
  readonly issues: readonly TimelineCanonIssue[];
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
  readonly issueCountsByCode: Readonly<Record<CanonIssueCode, number>>;
  readonly characterTraces: readonly CharacterLifecycleTrace[];
  readonly foreshadowSummary: ForeshadowLedgerSummary;
  readonly chronologicalEvents: readonly TimelineEventSnapshot[];
  readonly chronologicalEventIds: readonly string[];
  readonly canonLedgerSha256Hex: string;
}
