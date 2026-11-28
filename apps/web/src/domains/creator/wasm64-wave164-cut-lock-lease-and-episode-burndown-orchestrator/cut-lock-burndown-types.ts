/**
 * Wasm64 Wave 164 도메인 타입 계약:
 * 웹툰 연재 스튜디오 어시스턴트 실시간 작업 분할(Cut-Lock Lease)·충돌 제로 병합 및
 * 마감 진행률 번다운(Burndown) 오케스트레이터.
 */

export const STUDIO_PRODUCTION_STAGES = [
  "line-art",
  "flat-color",
  "shading",
  "background-3d",
  "lettering-sfx",
  "final-qa",
] as const;

export type StudioProductionStage = (typeof STUDIO_PRODUCTION_STAGES)[number];

export const STUDIO_STAGE_LABELS_KO: Readonly<Record<StudioProductionStage, string>> = {
  "line-art": "선화",
  "flat-color": "밑색",
  shading: "명암·채색",
  "background-3d": "3D 배경",
  "lettering-sfx": "식자·효과음",
  "final-qa": "최종 검수",
};

/**
 * 웹툰 제작 공정의 기본 선행 의존 관계.
 * `background-3d`는 `line-art`와 병렬 진행이 가능하며, `lettering-sfx`는 `line-art` 완료 후
 * `flat-color`/`shading`과 병렬로 진행할 수 있다.
 */
export const DEFAULT_STAGE_DEPENDENCIES: Readonly<
  Record<StudioProductionStage, readonly StudioProductionStage[]>
> = {
  "line-art": [],
  "background-3d": [],
  "flat-color": ["line-art"],
  shading: ["flat-color"],
  "lettering-sfx": ["line-art"],
  "final-qa": ["shading", "background-3d", "lettering-sfx"],
};

export type CutStageSlotKey = `${string}::${StudioProductionStage}`;

export function makeCutStageSlotKey(
  cutId: string,
  stage: StudioProductionStage,
): CutStageSlotKey {
  return `${cutId}::${stage}`;
}

export interface AssistantCapacityProfile {
  readonly assistantId: string;
  readonly nameKo: string;
  readonly skills: readonly StudioProductionStage[];
  readonly maxConcurrentLeases: number;
  readonly velocityHoursPerDay: number;
  readonly availabilityRatio?: number;
}

export interface CutStageLeaseRecord {
  readonly leaseId: string;
  readonly cutId: string;
  readonly stage: StudioProductionStage;
  readonly holderId: string;
  readonly fencingToken: number;
  readonly acquiredAtMs: number;
  readonly renewedAtMs: number;
  readonly expiresAtMs: number;
  readonly leaseDurationMs: number;
}

export type LeaseRejectionReason =
  | "already-locked-by-other"
  | "already-held-by-self"
  | "assistant-not-registered"
  | "assistant-lacks-stage-skill"
  | "wip-limit-reached"
  | "invalid-duration"
  | "lease-not-found"
  | "not-lease-holder"
  | "stale-fencing-token"
  | "lease-expired";

export type CutLockLeaseAuditKind =
  | "acquired"
  | "renewed"
  | "released"
  | "reclaimed-expired"
  | "rejected";

export interface CutLockLeaseAuditEntry {
  readonly seq: number;
  readonly timestampMs: number;
  readonly kind: CutLockLeaseAuditKind;
  readonly cutId: string;
  readonly stage: StudioProductionStage;
  readonly assistantId: string;
  readonly fencingToken: number;
  readonly leaseId?: string;
  readonly reason?: LeaseRejectionReason;
}

export interface CutLockLeaseState {
  readonly episodeId: string;
  readonly nextFencingToken: number;
  readonly nextEventSeq: number;
  readonly defaultLeaseTtlMs: number;
  readonly enforceSkillMatch: boolean;
  readonly assistants: Readonly<Record<string, AssistantCapacityProfile>>;
  readonly activeLeases: Readonly<Record<string, CutStageLeaseRecord>>;
  readonly highestGrantedTokenBySlot: Readonly<Record<string, number>>;
  readonly auditLog: readonly CutLockLeaseAuditEntry[];
}

export interface CreateCutLockLeaseStateOptions {
  readonly episodeId: string;
  readonly assistants: readonly AssistantCapacityProfile[];
  readonly defaultLeaseTtlMs?: number;
  readonly enforceSkillMatch?: boolean;
}

export interface AcquireCutStageLeaseRequest {
  readonly cutId: string;
  readonly stage: StudioProductionStage;
  readonly assistantId: string;
  readonly nowMs: number;
  readonly leaseDurationMs?: number;
}

export interface AcquireCutStageLeaseResult {
  readonly ok: boolean;
  readonly state: CutLockLeaseState;
  readonly lease: CutStageLeaseRecord | null;
  readonly reason: LeaseRejectionReason | null;
  readonly reclaimedPreviousLease: CutStageLeaseRecord | null;
}

export interface RenewCutStageLeaseRequest {
  readonly cutId: string;
  readonly stage: StudioProductionStage;
  readonly assistantId: string;
  readonly fencingToken: number;
  readonly nowMs: number;
  readonly extendDurationMs?: number;
}

export interface RenewCutStageLeaseResult {
  readonly ok: boolean;
  readonly state: CutLockLeaseState;
  readonly lease: CutStageLeaseRecord | null;
  readonly reason: LeaseRejectionReason | null;
}

export interface ReleaseCutStageLeaseRequest {
  readonly cutId: string;
  readonly stage: StudioProductionStage;
  readonly assistantId: string;
  readonly fencingToken: number;
  readonly nowMs: number;
}

export interface ReleaseCutStageLeaseResult {
  readonly ok: boolean;
  readonly state: CutLockLeaseState;
  readonly releasedLease: CutStageLeaseRecord | null;
  readonly reason: LeaseRejectionReason | null;
}

export interface ReclaimExpiredLeasesResult {
  readonly state: CutLockLeaseState;
  readonly reclaimedLeases: readonly CutStageLeaseRecord[];
  readonly reclaimedCount: number;
}

export type StagePatchMergeOutcome =
  | "merged-clean"
  | "rejected-stale-fencing-token"
  | "rejected-unowned-lease"
  | "rejected-lease-expired";

export type CutStagePatchOpKind =
  | "stroke-batch"
  | "flat-fill"
  | "cel-shading"
  | "background-render"
  | "balloon-typeset"
  | "qa-signoff";

export interface CutStagePatch {
  readonly patchId: string;
  readonly cutId: string;
  readonly stage: StudioProductionStage;
  readonly authorId: string;
  readonly fencingToken: number;
  readonly baseRevision: number;
  readonly submittedAtMs: number;
  readonly opKind: CutStagePatchOpKind;
  readonly layerPath: string;
  readonly payloadDigestHex: string;
  readonly progressDeltaHours: number;
  readonly completedRatio?: number;
  readonly summaryKo: string;
}

export interface MergedCutStageSlotState {
  readonly cutId: string;
  readonly stage: StudioProductionStage;
  readonly revision: number;
  readonly lastFencingToken: number;
  readonly lastAuthorId: string;
  readonly accumulatedProgressHours: number;
  readonly completedRatio: number;
  readonly appliedPatchIds: readonly string[];
  readonly layerDigests: Readonly<Record<string, string>>;
  readonly slotDigestHex: string;
}

export interface CutStagePatchDecision {
  readonly patchId: string;
  readonly cutId: string;
  readonly stage: StudioProductionStage;
  readonly authorId: string;
  readonly fencingToken: number;
  readonly outcome: StagePatchMergeOutcome;
  readonly expectedFencingToken: number | null;
  readonly reasonKo: string;
}

export interface MergeCutStagePatchesOptions {
  readonly nowMs: number;
  readonly initialMergedSlots?: Readonly<Record<string, MergedCutStageSlotState>>;
}

export interface CutStagePatchMergeResult {
  readonly mergedSlots: Readonly<Record<string, MergedCutStageSlotState>>;
  readonly decisions: readonly CutStagePatchDecision[];
  readonly mergedCleanCount: number;
  readonly rejectedCount: number;
  readonly staleTokenRejectionCount: number;
  readonly unownedRejectionCount: number;
  readonly expiredRejectionCount: number;
  readonly mergeStateSha256Hex: string;
}

export type DeadlineRiskTier =
  | "on-track"
  | "tight-buffer"
  | "at-risk"
  | "deadline-breach";

export type StudioQaVerdict = "PASS" | "WARN" | "FAIL";

export interface EpisodeCutStageWorkItem {
  readonly cutId: string;
  readonly stage: StudioProductionStage;
  readonly estimatedHours: number;
  readonly completedHours: number;
  readonly assignedAssistantId?: string;
  readonly dependsOnStages?: readonly StudioProductionStage[];
  readonly priorityWeight?: number;
}

export interface BurndownObservationPoint {
  readonly elapsedHours: number;
  readonly actualRemainingHours: number;
}

export interface BurndownTimelinePoint {
  readonly elapsedHours: number;
  readonly labelKo: string;
  readonly idealRemainingHours: number;
  readonly actualRemainingHours: number;
  readonly varianceHours: number;
  readonly isProjected: boolean;
}

export interface StageBacklogSummary {
  readonly stage: StudioProductionStage;
  readonly labelKo: string;
  readonly totalCuts: number;
  readonly completedCuts: number;
  readonly activeLeaseCount: number;
  readonly blockedByUpstreamCount: number;
  readonly estimatedHours: number;
  readonly completedHours: number;
  readonly remainingHours: number;
  readonly skilledAssistantCount: number;
  readonly stageVelocityHoursPerStudioHour: number;
  readonly projectedStageHours: number;
  readonly isBottleneck: boolean;
}

export interface AssistantLoadSnapshot {
  readonly assistantId: string;
  readonly nameKo: string;
  readonly skills: readonly StudioProductionStage[];
  readonly maxConcurrentLeases: number;
  readonly activeLeaseCount: number;
  readonly assignedTaskCount: number;
  readonly assignedRemainingHours: number;
  readonly ratePerStudioHour: number;
  readonly projectedFinishHours: number;
  readonly utilizationRatio: number;
  readonly isOverloaded: boolean;
  readonly isIdle: boolean;
}

export interface EpisodeBurndownInput {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly totalWindowHours: number;
  readonly elapsedHours: number;
  readonly deadlineRemainingHours: number;
  readonly workdayHours?: number;
  readonly assistants: readonly AssistantCapacityProfile[];
  readonly workItems: readonly EpisodeCutStageWorkItem[];
  readonly leaseState?: CutLockLeaseState;
  readonly nowMs?: number;
  readonly historicalObservations?: readonly BurndownObservationPoint[];
}

export interface EpisodeBurndownReport {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly totalEffortHours: number;
  readonly completedEffortHours: number;
  readonly remainingEffortHours: number;
  readonly completionRatio: number;
  readonly elapsedHours: number;
  readonly totalWindowHours: number;
  readonly deadlineRemainingHours: number;
  readonly workdayHours: number;
  readonly effectiveTeamVelocityPerStudioHour: number;
  readonly projectedFinishHours: number;
  readonly criticalPathHours: number;
  readonly deadlineMarginHours: number;
  readonly riskTier: DeadlineRiskTier;
  readonly bottleneckStages: readonly StudioProductionStage[];
  readonly unstaffedStages: readonly StudioProductionStage[];
  readonly stageBacklogs: readonly StageBacklogSummary[];
  readonly assistantLoads: readonly AssistantLoadSnapshot[];
  readonly timeline: readonly BurndownTimelinePoint[];
}

export interface AssistantRebalanceOptions {
  readonly maxSuggestions?: number;
  readonly minHoursSavedPerMove?: number;
  readonly respectActiveLeases?: boolean;
}

export interface AssistantRebalanceMove {
  readonly cutId: string;
  readonly stage: StudioProductionStage;
  readonly stageLabelKo: string;
  readonly remainingHours: number;
  readonly fromAssistantId: string;
  readonly fromAssistantNameKo: string;
  readonly toAssistantId: string;
  readonly toAssistantNameKo: string;
  readonly projectedBeforeHours: number;
  readonly projectedAfterHours: number;
  readonly incrementalHoursSaved: number;
  readonly rationaleKo: string;
}

export interface AssistantRebalancePlan {
  readonly baselineProjectedFinishHours: number;
  readonly rebalancedProjectedFinishHours: number;
  readonly hoursSaved: number;
  readonly baselineRiskTier: DeadlineRiskTier;
  readonly rebalancedRiskTier: DeadlineRiskTier;
  readonly bottleneckStagesDetected: readonly StudioProductionStage[];
  readonly overloadedAssistantIds: readonly string[];
  readonly suggestions: readonly AssistantRebalanceMove[];
  readonly rebalancedWorkItems: readonly EpisodeCutStageWorkItem[];
}

export interface BurndownManifestFingerprintInput {
  readonly leaseState: CutLockLeaseState;
  readonly mergeResult: CutStagePatchMergeResult;
  readonly burndownReport: EpisodeBurndownReport;
  readonly rebalancePlan?: AssistantRebalancePlan;
}

export interface StudioBurndownQaSummary {
  readonly verdict: StudioQaVerdict;
  readonly headlineKo: string;
  readonly metricsLinesKo: readonly string[];
  readonly riskNotesKo: readonly string[];
  readonly actionItemsKo: readonly string[];
  readonly fullReportKo: string;
}

export interface StudioBurndownScenario {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly nowMs: number;
  readonly totalWindowHours: number;
  readonly elapsedHours: number;
  readonly deadlineRemainingHours: number;
  readonly workdayHours: number;
  readonly defaultLeaseTtlMs: number;
  readonly assistants: readonly AssistantCapacityProfile[];
  readonly workItems: readonly EpisodeCutStageWorkItem[];
  readonly initialLeaseRequests: readonly AcquireCutStageLeaseRequest[];
  readonly submittedPatches: readonly CutStagePatch[];
  readonly historicalObservations?: readonly BurndownObservationPoint[];
}

export interface CutLockLeaseAndBurndownOrchestratorOutput {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly evaluatedAtMs: number;
  readonly leaseState: CutLockLeaseState;
  readonly leaseAcquisitions: readonly AcquireCutStageLeaseResult[];
  readonly reclaimedExpired: ReclaimExpiredLeasesResult;
  readonly mergeResult: CutStagePatchMergeResult;
  readonly burndownReport: EpisodeBurndownReport;
  readonly rebalancePlan: AssistantRebalancePlan;
  readonly postRebalanceBurndownReport: EpisodeBurndownReport;
  readonly manifestFingerprintSha256Hex: string;
  readonly burndownSvg: string;
  readonly qaSummary: StudioBurndownQaSummary;
}
