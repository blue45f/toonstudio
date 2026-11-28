/**
 * Wave 134 — 웹툰 주간 연재 마감 임계 경로(CPM)·어시스턴트 부하 평준화·번아웃/지각 경보 계약 타입.
 *
 * - 5단계 웹툰 제작 공정(2단계 3D 배경·선화 병렬 포함 6종 공정 ID)
 * - 비의료 공정 스케줄 기준의 건강 작업 한계(기본 일 8시간 × 가용 일수)
 * - 순환 의존성·미존재 참조·자격 외 배정 fail-closed 검증 계약
 */

export type ProductionStageId =
  | "story-conti"
  | "bg3d-layout"
  | "lineart-ink"
  | "flat-color"
  | "shading-vfx"
  | "lettering-final-qa";

export const PRODUCTION_STAGE_ORDER: readonly ProductionStageId[] = [
  "story-conti",
  "bg3d-layout",
  "lineart-ink",
  "flat-color",
  "shading-vfx",
  "lettering-final-qa",
] as const;

/**
 * 5단계 파이프라인 번호 매핑 (2단계는 3D 배경·선화 병렬 공정).
 */
export const PRODUCTION_STAGE_PHASE: Readonly<Record<ProductionStageId, 1 | 2 | 3 | 4 | 5>> = {
  "story-conti": 1,
  "bg3d-layout": 2,
  "lineart-ink": 2,
  "flat-color": 3,
  "shading-vfx": 4,
  "lettering-final-qa": 5,
};

export const PRODUCTION_STAGE_LABELS_KO: Readonly<Record<ProductionStageId, string>> = {
  "story-conti": "스토리 콘티",
  "bg3d-layout": "3D 배경·레이아웃",
  "lineart-ink": "선화·펜선",
  "flat-color": "밑색",
  "shading-vfx": "채색·이펙트",
  "lettering-final-qa": "식자·최종 QA",
};

export const PRODUCTION_STAGE_SHORT_KO: Readonly<Record<ProductionStageId, string>> = {
  "story-conti": "콘티",
  "bg3d-layout": "3D배경",
  "lineart-ink": "선화",
  "flat-color": "밑색",
  "shading-vfx": "채색·FX",
  "lettering-final-qa": "식자·QA",
};

export const DEFAULT_MAX_HEALTHY_HOURS_PER_DAY = 8.0;
export const DEFAULT_SPEED_MULTIPLIER = 1.0;
export const MIN_SPEED_MULTIPLIER = 0.25;
export const MAX_SPEED_MULTIPLIER = 4.0;
export const ON_TRACK_MARGIN_THRESHOLD_HR = 12.0;
export const CRUNCH_WINDOW_HOURS = 24.0;
export const CRUNCH_WORK_SHARE_THRESHOLD = 0.4;
export const CRITICAL_PATH_FLOAT_EPSILON_HR = 1e-6;

export interface EpisodeTaskItem {
  readonly taskId: string;
  readonly stage: ProductionStageId;
  readonly cutRangeLabel: string;
  readonly estimatedBaseHours: number;
  readonly dependsOnTaskIds: readonly string[];
  readonly assignedMemberId: string;
  readonly lockedAssignment?: boolean;
}

export interface StudioTeamMember {
  readonly memberId: string;
  readonly nameKo: string;
  readonly eligibleStages: readonly ProductionStageId[];
  readonly speedMultiplier: number;
  /** 비의료 공정 운영 기준 1일 권장 최대 작업 시간 (기본값 8.0시간). */
  readonly maxHealthyHoursPerDay?: number;
  readonly availableDays: number;
}

export interface EpisodeScheduleInput {
  readonly episodeId: string;
  readonly episodeTitleKo?: string;
  readonly deadlineBudgetHr: number;
  readonly tasks: readonly EpisodeTaskItem[];
  readonly teamMembers: readonly StudioTeamMember[];
}

export interface NormalizedStudioTeamMember {
  readonly memberId: string;
  readonly nameKo: string;
  readonly eligibleStages: readonly ProductionStageId[];
  readonly speedMultiplier: number;
  readonly maxHealthyHoursPerDay: number;
  readonly availableDays: number;
  readonly healthyBudgetHr: number;
}

export type DeadlineStatus = "on-track" | "tight-buffer" | "late-risk-red";

export type ScheduleValidationErrorCode =
  | "INVALID_TASK_ID"
  | "DUPLICATE_TASK_ID"
  | "INVALID_MEMBER_ID"
  | "DUPLICATE_MEMBER_ID"
  | "MISSING_DEPENDENCY"
  | "UNKNOWN_MEMBER"
  | "INELIGIBLE_STAGE_ASSIGNMENT"
  | "CYCLE_DETECTED";

export interface ScheduleValidationError {
  readonly code: ScheduleValidationErrorCode;
  readonly taskId?: string;
  readonly memberId?: string;
  readonly detailKo: string;
}

export interface ScheduledEpisodeTask {
  readonly taskId: string;
  readonly stage: ProductionStageId;
  readonly stagePhaseNumber: 1 | 2 | 3 | 4 | 5;
  readonly cutRangeLabel: string;
  readonly estimatedBaseHours: number;
  readonly effectiveDurationHr: number;
  readonly dependsOnTaskIds: readonly string[];
  readonly resourcePredecessorTaskId: string | null;
  readonly assignedMemberId: string;
  readonly assignedMemberNameKo: string;
  readonly lockedAssignment: boolean;
  readonly earliestStartHr: number;
  readonly earliestFinishHr: number;
  readonly latestStartHr: number;
  readonly latestFinishHr: number;
  readonly totalFloatHr: number;
  readonly freeFloatHr: number;
  readonly isCriticalPath: boolean;
}

export interface MemberWorkloadSummary {
  readonly memberId: string;
  readonly nameKo: string;
  readonly eligibleStages: readonly ProductionStageId[];
  readonly speedMultiplier: number;
  readonly maxHealthyHoursPerDay: number;
  readonly availableDays: number;
  readonly healthyBudgetHr: number;
  readonly assignedTaskCount: number;
  readonly assignedTaskIds: readonly string[];
  readonly assignedBaseHours: number;
  readonly assignedEffectiveHours: number;
  readonly finishTimeHr: number;
  readonly overloadHours: number;
  readonly utilizationRatio: number;
  readonly isOverloaded: boolean;
}

export type BurnoutAlertSeverity = "caution" | "critical";

export interface BurnoutOverloadAlert {
  readonly memberId: string;
  readonly memberNameKo: string;
  readonly assignedEffectiveHours: number;
  readonly healthyBudgetHr: number;
  readonly overloadHours: number;
  readonly utilizationRatio: number;
  readonly severity: BurnoutAlertSeverity;
  readonly messageKo: string;
}

export interface CrunchWindowMetrics {
  readonly windowStartHr: number;
  readonly windowEndHr: number;
  readonly workInFinal24hHr: number;
  readonly totalEffectiveWorkHr: number;
  readonly final24hWorkShare: number;
  readonly thresholdShare: number;
  readonly crunchBottleneckDetected: boolean;
}

export interface EpisodeCpmScheduleResult {
  readonly ok: boolean;
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly deadlineBudgetHr: number;
  readonly cycleDetected: boolean;
  readonly cycleTaskIds: readonly string[];
  readonly validationErrors: readonly ScheduleValidationError[];
  readonly sanitizationWarnings: readonly string[];
  readonly topologicalOrderTaskIds: readonly string[];
  readonly scheduledTasks: readonly ScheduledEpisodeTask[];
  readonly criticalPathTaskIds: readonly string[];
  readonly projectMakespanHr: number;
  readonly unconstrainedDagMakespanHr: number;
  readonly deadlineMarginHr: number;
  readonly deadlineStatus: DeadlineStatus;
  readonly totalEffectiveWorkHr: number;
  readonly memberWorkloads: readonly MemberWorkloadSummary[];
  readonly maxMemberLoadHr: number;
  readonly minMemberLoadHr: number;
  readonly loadSpreadHr: number;
  readonly loadStdDevHr: number;
  readonly burnoutOverloadAlerts: readonly BurnoutOverloadAlert[];
  readonly crunchWindow: CrunchWindowMetrics;
  readonly crunchBottleneckDetected: boolean;
  readonly manifestSha256Hex: string;
}

export interface TaskReassignmentRecord {
  readonly taskId: string;
  readonly stage: ProductionStageId;
  readonly cutRangeLabel: string;
  readonly fromMemberId: string;
  readonly fromMemberNameKo: string;
  readonly toMemberId: string;
  readonly toMemberNameKo: string;
  readonly beforeDurationHr: number;
  readonly afterDurationHr: number;
}

export interface RebalanceWorkloadOptions {
  /** 최대 국소 탐색 반복 횟수 (기본 24회). */
  readonly maxRefinementPasses?: number;
}

export interface WorkloadRebalanceResult {
  readonly ok: boolean;
  readonly improved: boolean;
  readonly algorithm: "lpt-mct-dag";
  readonly beforeSchedule: EpisodeCpmScheduleResult;
  readonly afterSchedule: EpisodeCpmScheduleResult;
  readonly rebalancedTasks: readonly EpisodeTaskItem[];
  readonly reassignments: readonly TaskReassignmentRecord[];
  readonly beforeMakespanHr: number;
  readonly afterMakespanHr: number;
  readonly makespanSavedHr: number;
  readonly beforeLoadSpreadHr: number;
  readonly afterLoadSpreadHr: number;
  readonly loadSpreadReducedHr: number;
  readonly beforeOverloadCount: number;
  readonly afterOverloadCount: number;
  readonly deadlineRecovered: boolean;
  readonly beforeManifestSha256Hex: string;
  readonly afterManifestSha256Hex: string;
  readonly rejectionReasons: readonly string[];
}

export interface EpisodeScheduleGanttSvgOptions {
  readonly widthPx?: number;
  readonly titleOverrideKo?: string;
}
