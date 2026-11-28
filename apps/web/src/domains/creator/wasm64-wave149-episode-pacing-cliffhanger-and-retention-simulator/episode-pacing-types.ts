/**
 * Wave 149 — 웹툰 에피소드 모바일 스크롤 체류·이탈(Scroll Retention) 시뮬레이터 및
 * 클리프행어(Cliffhanger) 페이싱 옵티마이저 핵심 계약 타입.
 *
 * - 모든 체류·이탈·완독률 수치는 실측 독자 로그가 아닌 결정론적 인지 피로·주의력 모델의
 *   시뮬레이션 추정치(`isSimulationEstimate: true`)로 명시한다.
 * - 순수 ES2017 strict TypeScript(`verbatimModuleSyntax` 준수).
 */

export type NarrativeBeatKind =
  | "opening-hook"
  | "exposition"
  | "dialogue-exchange"
  | "action-surge"
  | "emotional-pause"
  | "mid-twist"
  | "cliffhanger-reveal"
  | "epilogue-fade";

export const NARRATIVE_BEAT_KINDS: readonly NarrativeBeatKind[] = [
  "opening-hook",
  "exposition",
  "dialogue-exchange",
  "action-surge",
  "emotional-pause",
  "mid-twist",
  "cliffhanger-reveal",
  "epilogue-fade",
];

export const NARRATIVE_BEAT_LABELS_KO: Readonly<Record<NarrativeBeatKind, string>> = {
  "opening-hook": "도입 훅",
  exposition: "상황 설명",
  "dialogue-exchange": "대화 전개",
  "action-surge": "액션 고조",
  "emotional-pause": "감정 여백",
  "mid-twist": "중반 반전",
  "cliffhanger-reveal": "클리프행어 절정",
  "epilogue-fade": "여운 마무리",
};

export type PacingBottleneckCode =
  | "text-density-fatigue-wall"
  | "missing-opening-hook"
  | "mid-episode-sag"
  | "weak-cliffhanger-ending"
  | "cramped-gutter-rhythm";

export const PACING_BOTTLENECK_CODES: readonly PacingBottleneckCode[] = [
  "text-density-fatigue-wall",
  "missing-opening-hook",
  "mid-episode-sag",
  "weak-cliffhanger-ending",
  "cramped-gutter-rhythm",
];

export const PACING_BOTTLENECK_LABELS_KO: Readonly<Record<PacingBottleneckCode, string>> = {
  "text-density-fatigue-wall": "대사 과밀 피로벽",
  "missing-opening-hook": "도입부 훅 부족",
  "mid-episode-sag": "중반부 서사 늘어짐",
  "weak-cliffhanger-ending": "클리프행어 결말 약화",
  "cramped-gutter-rhythm": "컷 간 여백 압박",
};

export type PacingBottleneckSeverity = "high" | "medium" | "low";

export type PacingGrade = "S" | "A" | "B" | "C" | "D";

export type GutterAdjustmentReason =
  | "fatigue-wall-breath-gutter"
  | "cramped-transition-breath"
  | "cliffhanger-dramatic-pause-gutter"
  | "dense-text-relief-gutter";

export const DEFAULT_VIEWPORT_WIDTH_PX = 390;
export const DEFAULT_VIEWPORT_HEIGHT_PX = 844;
export const DEFAULT_CHARS_PER_SEC = 11.5;

export const FATIGUE_WALL_CHARS_PER_SCREEN_THRESHOLD = 95;
export const FATIGUE_WALL_MIN_CONSECUTIVE_CUTS = 3;
export const FATIGUE_WALL_BREATH_BREAK_GUTTER_PX = 220;

export const OPENING_HOOK_WINDOW_END = 0.15;
export const OPENING_HOOK_MIN_TENSION = 0.62;
export const OPENING_HOOK_LABELED_MIN_TENSION = 0.55;
export const OPENING_HOOK_UNLABELED_MIN_TENSION = 0.68;

export const MID_EPISODE_WINDOW_START = 0.35;
export const MID_EPISODE_WINDOW_END = 0.65;
export const MID_EPISODE_PEAK_MIN_TENSION = 0.68;
export const MID_EPISODE_TWIST_MIN_TENSION = 0.55;

export const CLIFFHANGER_WINDOW_START = 0.9;
export const CLIFFHANGER_MIN_TENSION = 0.72;

export const CRAMPED_GUTTER_CLIFFHANGER_MIN_PX = 160;
export const CRAMPED_GUTTER_ACTION_MIN_PX = 140;
export const CRAMPED_GUTTER_TRANSITION_MIN_PX = 120;
export const CRAMPED_GUTTER_BASELINE_MIN_PX = 60;

export const OPTIMIZED_BREATH_GUTTER_PX = 260;
export const OPTIMIZED_DRAMATIC_PAUSE_GUTTER_PX = 360;
export const OPTIMIZED_ACTION_GUTTER_PX = 180;
export const OPTIMIZED_TRANSITION_GUTTER_PX = 160;
export const OPTIMIZED_MAX_GUTTER_PX = 520;

export const SIMULATION_ESTIMATE_NOTICE_KO =
  "시뮬레이션 추정치(Simulation Estimate): 결정론적 인지 피로·주의력 물리 모델 계산값이며 실측 독자 이탈 로그가 아닙니다.";

export interface EpisodePacingCutSpec {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly heightPx: number;
  readonly gutterAfterPx: number;
  readonly characterCountKo: number;
  readonly balloonCount: number;
  readonly visualComplexity: number;
  readonly narrativeBeatKind: NarrativeBeatKind;
  readonly tensionScore: number;
  readonly isSilentBreathCut?: boolean;
}

export interface MobileViewportConfig {
  readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number;
  readonly charsPerSec?: number;
}

export interface NormalizedMobileViewportConfig {
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly charsPerSec: number;
}

export interface EpisodePacingInput {
  readonly episodeId: string;
  readonly episodeTitle?: string;
  readonly cuts: readonly EpisodePacingCutSpec[];
  readonly viewport?: MobileViewportConfig;
}

export interface CutRetentionSimulationPoint {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly narrativeBeatKind: NarrativeBeatKind;
  readonly isSilentBreathCut: boolean;
  readonly heightPx: number;
  readonly gutterAfterPx: number;
  readonly characterCountKo: number;
  readonly balloonCount: number;
  readonly visualComplexity: number;
  readonly tensionScore: number;
  readonly scrollStartPx: number;
  readonly scrollEndPx: number;
  readonly scrollProgressStart: number;
  readonly scrollProgressCenter: number;
  readonly scrollProgressEnd: number;
  readonly dwellSeconds: number;
  readonly charsPerViewportScreen: number;
  readonly cognitiveFatigue: number;
  readonly engagementIndex: number;
  readonly retentionBeforeCut: number;
  readonly retentionAfterCut: number;
  readonly estimatedDropOffDelta: number;
}

export interface RetentionCurveSample {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly scrollProgress: number;
  readonly estimatedRetention: number;
  readonly cognitiveFatigue: number;
  readonly tensionScore: number;
  readonly engagementIndex: number;
  readonly isSimulationEstimate: true;
}

export interface EpisodeScrollRetentionSimulation {
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly isSimulationEstimate: true;
  readonly simulationNoticeKo: string;
  readonly viewport: NormalizedMobileViewportConfig;
  readonly totalCutCount: number;
  readonly totalScrollHeightPx: number;
  readonly totalViewportScreens: number;
  readonly totalEstimatedDwellSeconds: number;
  readonly averageTensionScore: number;
  readonly averageCharsPerViewportScreen: number;
  readonly maxCharsPerViewportScreen: number;
  readonly peakCognitiveFatigue: number;
  readonly averageCognitiveFatigue: number;
  readonly averageEngagementIndex: number;
  readonly estimatedCompletionRetention: number;
  readonly estimatedNextEpisodeClickPropensity: number;
  readonly cutPoints: readonly CutRetentionSimulationPoint[];
  readonly estimatedRetentionCurve: readonly RetentionCurveSample[];
  readonly warnings: readonly string[];
  readonly simulationSha256Hex: string;
}

export interface PacingBottleneckFinding {
  readonly code: PacingBottleneckCode;
  readonly severity: PacingBottleneckSeverity;
  readonly titleKo: string;
  readonly descriptionKo: string;
  readonly affectedCutIds: readonly string[];
  readonly affectedCutIndices: readonly number[];
  readonly scrollRangeStart: number;
  readonly scrollRangeEnd: number;
  readonly metricValue: number;
  readonly thresholdValue: number;
  readonly recommendationKo: string;
}

export interface EpisodePacingAuditResult {
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly isSimulationEstimate: true;
  readonly simulationNoticeKo: string;
  readonly simulation: EpisodeScrollRetentionSimulation;
  readonly findings: readonly PacingBottleneckFinding[];
  readonly findingCountsByCode: Readonly<Record<PacingBottleneckCode, number>>;
  readonly pacingHealthScore: number;
  readonly pacingGrade: PacingGrade;
  readonly openingHookTensionPeak: number;
  readonly midEpisodeTensionPeak: number;
  readonly cliffhangerTensionPeak: number;
  readonly hasMidTwistOrPeak: boolean;
  readonly hasStrongCliffhanger: boolean;
  readonly pacingAuditSha256Hex: string;
}

export interface OptimizeGutterPacingOptions {
  readonly breathGutterPx?: number;
  readonly dramaticPauseGutterPx?: number;
  readonly transitionMinGutterPx?: number;
  readonly actionMinGutterPx?: number;
  readonly maxGutterPx?: number;
}

export interface GutterOptimizationAdjustment {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly originalGutterPx: number;
  readonly optimizedGutterPx: number;
  readonly deltaPx: number;
  readonly reason: GutterAdjustmentReason;
  readonly reasonKo: string;
}

export interface EpisodeGutterOptimizationResult {
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly isSimulationEstimate: true;
  readonly simulationNoticeKo: string;
  readonly beforeAudit: EpisodePacingAuditResult;
  readonly afterAudit: EpisodePacingAuditResult;
  readonly optimizedCuts: readonly EpisodePacingCutSpec[];
  readonly adjustments: readonly GutterOptimizationAdjustment[];
  readonly totalAddedGutterPx: number;
  readonly peakFatigueDelta: number;
  readonly peakFatigueReduction: number;
  readonly completionRetentionDelta: number;
  readonly pacingHealthScoreDelta: number;
  readonly crampedGutterFindingsBefore: number;
  readonly crampedGutterFindingsAfter: number;
  readonly optimizationSha256Hex: string;
}

export interface PacingCurveSvgOptions {
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly titleOverride?: string;
  readonly optimizedComparison?: EpisodeGutterOptimizationResult;
}
