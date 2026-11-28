/**
 * Wave 126 — 웹툰 세로 스크롤 동기화 BGM 큐시트·정전력 크로스페이드·
 * 히스테리시스 방어·카멜롯 화성·라우드니스(LUFS) 컴파일러 공용 타입 및 상수 정의.
 */

export type CamelotNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type CamelotMode = "A" | "B";

export type CamelotKey =
  | "1A"
  | "2A"
  | "3A"
  | "4A"
  | "5A"
  | "6A"
  | "7A"
  | "8A"
  | "9A"
  | "10A"
  | "11A"
  | "12A"
  | "1B"
  | "2B"
  | "3B"
  | "4B"
  | "5B"
  | "6B"
  | "7B"
  | "8B"
  | "9B"
  | "10B"
  | "11B"
  | "12B";

export interface ParsedCamelotKey {
  readonly raw: CamelotKey;
  readonly hour: CamelotNumber;
  readonly mode: CamelotMode;
  readonly musicalKeyName: string;
}

export interface BgmTrackCueSpec {
  readonly cueId: string;
  readonly trackId: string;
  readonly titleKo: string;
  readonly startYPx: number;
  readonly endYPx: number;
  readonly bpm: number;
  readonly musicalKeyCamelot: CamelotKey;
  readonly targetLufs: number;
  readonly fadeInPx: number;
  readonly fadeOutPx: number;
  readonly isDramaticSilenceCut?: boolean;
  readonly duckingForDialogueDb?: number;
}

export type BgmCueValidationIssueCode =
  | "empty-cue-sheet"
  | "invalid-cue-id"
  | "duplicate-cue-id"
  | "invalid-cue-range"
  | "invalid-fade-px"
  | "invalid-bpm"
  | "invalid-camelot-key"
  | "invalid-lufs"
  | "invalid-ducking-db";

export interface BgmCueValidationIssue {
  readonly code: BgmCueValidationIssueCode;
  readonly cueId?: string;
  readonly messageKo: string;
}

export type TrackEnvelopePhase =
  | "fade-in"
  | "sustain"
  | "fade-out"
  | "crossfade-out"
  | "crossfade-in"
  | "multi-overlap"
  | "silence-isolated";

export interface EvaluateScrollBgmMixOptions {
  readonly dialogueActive?: boolean;
  readonly scrollVelocityPxPerSec?: number;
  readonly minAntiClickFadeMs?: number;
  readonly dramaticSilenceFloorLinear?: number;
}

export interface ActiveTrackGainEntry {
  readonly cueId: string;
  readonly trackId: string;
  readonly titleKo: string;
  readonly baseLinearGain: number;
  readonly linearGain: number;
  readonly gainDb: number;
  readonly phase: TrackEnvelopePhase;
  readonly duckingAppliedDb: number;
}

export interface EqualPowerCrossfadePairInfo {
  readonly outgoingCueId: string;
  readonly incomingCueId: string;
  readonly overlapStartYPx: number;
  readonly overlapEndYPx: number;
  readonly progress: number;
  readonly outgoingGain: number;
  readonly incomingGain: number;
  readonly powerSum: number;
}

export interface ScrollBgmMixSnapshot {
  readonly ok: boolean;
  readonly yPx: number;
  readonly activeTracks: readonly ActiveTrackGainEntry[];
  readonly isCrossfadeZone: boolean;
  readonly crossfadePair: EqualPowerCrossfadePairInfo | null;
  readonly totalPowerSum: number;
  readonly isDramaticSilenceCore: boolean;
  readonly activeSilenceCutId: string | null;
  readonly effectiveAntiClickFadeMs: number;
  readonly maxActiveGainLinear: number;
  readonly validationIssues: readonly BgmCueValidationIssue[];
}

export interface ReaderScrollTrajectoryPoint {
  readonly timeMs: number;
  readonly yPx: number;
  readonly dialogueActive?: boolean;
}

export interface ScrollSessionGuardOptions {
  readonly hysteresisDeadbandPx?: number;
  readonly minDwellMs?: number;
  readonly minAntiClickFadeMs?: number;
  readonly antiClickRampMs?: number;
  readonly flingVelocityThresholdPxPerSec?: number;
  readonly abruptClickDeltaThreshold?: number;
  readonly dramaticSilenceFloorLinear?: number;
}

export interface CueSwitchEvent {
  readonly timeMs: number;
  readonly yPx: number;
  readonly fromCueId: string | null;
  readonly toCueId: string | null;
  readonly isRetriggerThrash: boolean;
}

export interface ScrollAudioSimulationFrame {
  readonly timeMs: number;
  readonly yPx: number;
  readonly velocityPxPerSec: number;
  readonly primaryCueId: string | null;
  readonly gainsByCueId: Readonly<Record<string, number>>;
  readonly maxFrameGainDelta: number;
  readonly isDramaticSilenceCore: boolean;
  readonly flingHoldActive: boolean;
}

export interface ScrollEngineSessionMetrics {
  readonly totalCueSwitches: number;
  readonly retriggerThrashCount: number;
  readonly abruptClickEventCount: number;
  readonly maxSingleFrameGainDelta: number;
  readonly minObservedTransitionRampMs: number;
  readonly dramaticSilenceCoreReached: boolean;
  readonly maxGainDuringSilenceCore: number;
  readonly finalPrimaryCueId: string | null;
  readonly switchEvents: readonly CueSwitchEvent[];
}

export type ReaderScrollProfileKind =
  | "steady-reading"
  | "high-speed-fling"
  | "boundary-jitter"
  | "mixed";

export interface ScrollAudioSessionResult {
  readonly ok: boolean;
  readonly profileKind: ReaderScrollProfileKind;
  readonly frameCount: number;
  readonly totalDurationMs: number;
  readonly peakScrollVelocityPxPerSec: number;
  readonly meanScrollVelocityPxPerSec: number;
  readonly guarded: ScrollEngineSessionMetrics;
  readonly naive: ScrollEngineSessionMetrics;
  readonly thrashPreventedCount: number;
  readonly clicksPreventedCount: number;
  readonly frames: readonly ScrollAudioSimulationFrame[];
  readonly validationIssues: readonly BgmCueValidationIssue[];
}

export type CamelotCompatibilityLevel =
  | "harmonic-compatible"
  | "energy-shift-caution"
  | "harmonic-clash-warning";

export type CamelotRelationKind =
  | "identical"
  | "adjacent-fifth"
  | "relative-major-minor"
  | "energy-boost-two-steps"
  | "diagonal-mode-shift"
  | "dissonant-clash";

export interface CamelotHarmonicDistanceResult {
  readonly keyA: CamelotKey;
  readonly keyB: CamelotKey;
  readonly hourDistance: number;
  readonly modeChanged: boolean;
  readonly distance: number;
  readonly compatibility: CamelotCompatibilityLevel;
  readonly relationKind: CamelotRelationKind;
  readonly recommendSilenceBridge: boolean;
  readonly recommendationKo: string;
}

export type BgmCueAuditFindingCode =
  | "excessive-loudness"
  | "abrupt-loudness-jump"
  | "muddy-triple-overlap"
  | "harmonic-clash-warning"
  | "short-silence-anticlick-ramp";

export type BgmCueAuditSeverity = "error" | "warning";

export interface BgmCueAuditFinding {
  readonly code: BgmCueAuditFindingCode;
  readonly severity: BgmCueAuditSeverity;
  readonly cueIds: readonly string[];
  readonly startYPx: number;
  readonly endYPx: number;
  readonly metricValue: number;
  readonly thresholdValue: number;
  readonly messageKo: string;
  readonly remediationKo: string;
}

export interface HarmonicTransitionAuditEntry {
  readonly fromCueId: string;
  readonly toCueId: string;
  readonly fromKey: CamelotKey;
  readonly toKey: CamelotKey;
  readonly transitionYPx: number;
  readonly hasOverlap: boolean;
  readonly overlapStartYPx: number | null;
  readonly overlapEndYPx: number | null;
  readonly separatedBySilenceCut: boolean;
  readonly silenceCutId: string | null;
  readonly mitigatedBySilenceBridge: boolean;
  readonly camelot: CamelotHarmonicDistanceResult;
  readonly lufsDeltaDb: number;
}

export interface MuddyOverlapSpan {
  readonly startYPx: number;
  readonly endYPx: number;
  readonly spanPx: number;
  readonly overlapCount: number;
  readonly overlappingCueIds: readonly string[];
}

export interface AuditBgmCueSheetOptions {
  readonly maxAllowedLufs?: number;
  readonly maxAdjacentLufsJumpDb?: number;
  readonly minAntiClickFadeMs?: number;
  readonly referenceReadingVelocityPxPerSec?: number;
  readonly clashDistanceThreshold?: number;
}

export type EpisodeBgmAuditStatus =
  | "pass"
  | "pass-with-warnings"
  | "fail"
  | "invalid-input";

export interface EpisodeBgmCueAuditReport {
  readonly inputValid: boolean;
  readonly releaseReady: boolean;
  readonly status: EpisodeBgmAuditStatus;
  readonly cueCount: number;
  readonly normalBgmCueCount: number;
  readonly dramaticSilenceCutCount: number;
  readonly episodeLengthYPx: number;
  readonly maxConcurrentBgmTracks: number;
  readonly maxAllowedLufs: number;
  readonly maxAdjacentLufsJumpDb: number;
  readonly maxTargetLufs: number | null;
  readonly minTargetLufs: number | null;
  readonly meanTargetLufs: number | null;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly transitions: readonly HarmonicTransitionAuditEntry[];
  readonly muddyOverlaps: readonly MuddyOverlapSpan[];
  readonly findings: readonly BgmCueAuditFinding[];
  readonly validationIssues: readonly BgmCueValidationIssue[];
  readonly cueSheetSha256Hex: string;
}

export const DEFAULT_REFERENCE_SCROLL_VELOCITY_PX_PER_SEC = 350;
export const DEFAULT_HIGH_SPEED_FLING_VELOCITY_PX_PER_SEC = 3600;
export const DEFAULT_MIN_ANTICLICK_FADE_MS = 40;
export const DEFAULT_ANTICLICK_RAMP_MS = 96;
export const DEFAULT_HYSTERESIS_DEADBAND_PX = 48;
export const DEFAULT_MIN_DWELL_MS = 320;
export const DEFAULT_FLING_HOLD_VELOCITY_PX_PER_SEC = 1800;
export const DEFAULT_ABRUPT_CLICK_DELTA_THRESHOLD = 0.22;
export const DEFAULT_DRAMATIC_SILENCE_FLOOR_LINEAR = 0.001;
export const DEFAULT_MAX_ALLOWED_LUFS = -14.0;
export const DEFAULT_MAX_ADJACENT_LUFS_JUMP_DB = 3.0;
export const DEFAULT_CLASH_DISTANCE_THRESHOLD = 3;
export const SILENCE_FLOOR_DB = -96.0;

export const CAMELOT_MUSICAL_KEY_LABELS: Readonly<Record<CamelotKey, string>> = {
  "1A": "A-flat minor",
  "2A": "E-flat minor",
  "3A": "B-flat minor",
  "4A": "F minor",
  "5A": "C minor",
  "6A": "G minor",
  "7A": "D minor",
  "8A": "A minor",
  "9A": "E minor",
  "10A": "B minor",
  "11A": "F-sharp minor",
  "12A": "D-flat minor",
  "1B": "B major",
  "2B": "F-sharp major",
  "3B": "D-flat major",
  "4B": "A-flat major",
  "5B": "E-flat major",
  "6B": "B-flat major",
  "7B": "F major",
  "8B": "C major",
  "9B": "G major",
  "10B": "D major",
  "11B": "A major",
  "12B": "E major",
};
