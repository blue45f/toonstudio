/**
 * 웹툰 휴재·지각 방지 OS 공통 타입, 상수 및 순수 유틸리티 (OKLCH ΔE · 컷 무결성 검증).
 */

export type PipelineStageKey = "line" | "flat" | "shade" | "bg3d" | "lettering";

export type BufferHealthTier = "green" | "amber" | "red";

export type AbsenceReason =
  | "illness"
  | "injury"
  | "personal_emergency"
  | "unresponsive";

export type StandbyRegionCode =
  | "kr"
  | "sea_vn"
  | "sea_id"
  | "sea_th"
  | "sea_ph"
  | "global_jp";

export interface OklchSample {
  /** 명도 0..1 */
  readonly l: number;
  /** 채도 0..0.4 */
  readonly c: number;
  /** 색상각 0..360 deg */
  readonly h: number;
}

export interface TeamMemberHealthSnapshot {
  readonly memberId: string;
  readonly name: string;
  readonly stage: PipelineStageKey;
  readonly dailyCutVelocity: number;
  readonly baselineDailyVelocity: number;
  readonly overtimeHoursThisWeek: number;
  /** 손목 피로도 (0~100) */
  readonly wristFatigueScore: number;
  /** 목·어깨 피로도 (0~100) */
  readonly neckFatigueScore: number;
  readonly status: "active" | "warning" | "absent";
  readonly absenceReason: AbsenceReason | null;
}

export interface EpisodeRiskInput {
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly bufferWeeks: number;
  readonly hoursUntilDeadline: number;
  readonly remainingCuts: number;
  readonly targetTotalCuts: number;
  readonly members: readonly TeamMemberHealthSnapshot[];
  /** 투입된 긴급 대타의 일일 컷 처리량 보정값 */
  readonly reliefDailyCuts?: number;
  /** 긴급 대타로 커버 완료된 결원 인원 수 */
  readonly coveredAbsenceCount?: number;
}

export interface MemberBurnoutEvaluation {
  readonly memberId: string;
  readonly name: string;
  readonly stage: PipelineStageKey;
  readonly status: TeamMemberHealthSnapshot["status"];
  readonly burnoutIndex: number;
  readonly velocityRatioPct: number;
  readonly effectiveDailyCuts: number;
  readonly alertTier: BufferHealthTier;
  readonly guidanceKo: string;
  readonly guidanceEn: string;
}

export interface EarlyWarningAlert {
  readonly id: string;
  readonly tier: BufferHealthTier;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
}

export interface BufferAndBurnoutAssessment {
  readonly episodeId: string;
  readonly bufferWeeks: number;
  readonly bufferTier: BufferHealthTier;
  readonly overallTier: BufferHealthTier;
  readonly projectedDelayHours: number;
  readonly estimatedHoursNeeded: number;
  readonly teamEffectiveDailyCuts: number;
  readonly hiatusProbabilityPct: number;
  readonly absentMemberCount: number;
  readonly uncoveredAbsenceCount: number;
  readonly highBurnoutMemberCount: number;
  readonly maxBurnoutIndex: number;
  readonly memberRisks: readonly MemberBurnoutEvaluation[];
  readonly earlyWarnings: readonly EarlyWarningAlert[];
}

export type SliceLockStatus =
  | "locked"
  | "completed_locked"
  | "released_sos"
  | "transferred"
  | "micro_split";

export interface ActiveCutSlice {
  readonly sliceId: string;
  readonly episodeId: string;
  readonly stage: PipelineStageKey;
  readonly startCut: number;
  readonly endCut: number;
  readonly completedCount: number;
  readonly holderId: string | null;
  readonly holderName: string | null;
  readonly holderRegion: StandbyRegionCode;
  readonly lockStatus: SliceLockStatus;
  readonly leaseToken: string | null;
  readonly leaseExpiresAtIso: string | null;
  readonly handoffKitId: string | null;
  readonly parentSliceId: string | null;
}

export interface CutCoverageInvariantReport {
  readonly expectedTotalCuts: number;
  readonly coveredCutCount: number;
  readonly overlapCount: number;
  readonly gapCount: number;
  readonly overlappingCuts: readonly number[];
  readonly missingCuts: readonly number[];
  readonly preserved: boolean;
}

export interface StandbyArtistCandidate {
  readonly artistId: string;
  readonly name: string;
  readonly region: StandbyRegionCode;
  readonly regionGroup: "domestic" | "global_sea";
  readonly regionLabelKo: string;
  readonly regionLabelEn: string;
  /** UTC 기준 시차 (KST = +9, ICT/WIB = +7, PHT = +8, JST = +9) */
  readonly timezoneOffsetHours: number;
  readonly stages: readonly PipelineStageKey[];
  readonly verifiedTier: "S" | "A" | "B";
  readonly avgLineWidthPx: number;
  readonly paletteSampleOklch: OklchSample;
  /** 톤·명암 일관성 검증 점수 (0~100) */
  readonly toneMatchScore: number;
  readonly availableNow: boolean;
  readonly responseEtaMinutes: number;
  readonly hourlyRateKrw: number;
  readonly hourlyRateUsd: number;
  readonly maxDailyCuts: number;
  readonly completedSosCount: number;
}

export interface StyleTargetSpec {
  readonly targetLineWidthPx: number;
  readonly targetPaletteOklch: OklchSample;
  readonly maxBudgetKrwPerHour: number;
  readonly maxBudgetUsdPerHour: number;
}

export interface RankedStandbyMatch {
  readonly candidate: StandbyArtistCandidate;
  readonly totalScore: number;
  readonly stageMatchScore: number;
  readonly styleCompatibilityScore: number;
  readonly readinessScore: number;
  readonly budgetFitScore: number;
  readonly oklchDeltaE: number;
  readonly lineWidthDeltaPx: number;
  readonly timezoneDiffFromKstHours: number;
  readonly canDeployInTenMinutes: boolean;
  readonly estimatedCompletionHours: number;
  readonly estimatedTotalKrw: number;
  readonly estimatedTotalUsd: number;
}

export interface SosAuditEvent {
  readonly eventId: string;
  readonly occurredAtIso: string;
  readonly kind: "absence_declared" | "lease_transferred" | "micro_split" | "defense_selected";
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface AbsenceReleaseResult {
  readonly ok: boolean;
  readonly absentMemberId: string;
  readonly releasedSliceIds: readonly string[];
  readonly preservedCompletedCuts: number;
  readonly releasedUnfinishedCuts: number;
  readonly members: readonly TeamMemberHealthSnapshot[];
  readonly slices: readonly ActiveCutSlice[];
  readonly invariant: CutCoverageInvariantReport;
  readonly auditEvent: SosAuditEvent;
}

export interface LeaseTransferResult {
  readonly ok: boolean;
  readonly reasonKo: string;
  readonly reasonEn: string;
  readonly transferredSliceId: string | null;
  readonly leaseToken: string | null;
  readonly slices: readonly ActiveCutSlice[];
  readonly invariant: CutCoverageInvariantReport;
  readonly auditEvent: SosAuditEvent | null;
}

export interface ArtBiblePaletteSwatch {
  readonly chipId: string;
  readonly roleKo: string;
  readonly roleEn: string;
  readonly oklch: OklchSample;
  readonly cssOklch: string;
  readonly maxAllowedDeltaE: number;
}

export interface BrushLineSpec {
  readonly specId: string;
  readonly purposeKo: string;
  readonly purposeEn: string;
  readonly brushName: string;
  readonly minPx: number;
  readonly targetPx: number;
  readonly maxPx: number;
  readonly antiAlias: boolean;
  readonly pressureCurve: string;
}

export interface PreviousCutReference {
  readonly cutIndex: number;
  readonly isBoundaryFallback: boolean;
  readonly shotNoteKo: string;
  readonly shotNoteEn: string;
  readonly lightingOklch: OklchSample;
  readonly lightingCssOklch: string;
  readonly continuityNoteKo: string;
  readonly continuityNoteEn: string;
  readonly checksumRef: string;
}

export interface Bg3dCameraPreset {
  readonly presetId: string;
  readonly sceneNameKo: string;
  readonly sceneNameEn: string;
  readonly focalLengthMm: number;
  readonly fovDeg: number;
  readonly horizonRatio: number;
  readonly pitchDeg: number;
  readonly yawDeg: number;
  readonly lightingAzimuthDeg: number;
}

export interface ForbiddenStyleRule {
  readonly itemId: string;
  readonly severity: "blocker" | "warn";
  readonly ruleKo: string;
  readonly ruleEn: string;
  readonly checked: boolean;
}

export interface StyleLockKitValidation {
  readonly valid: boolean;
  readonly completenessPct: number;
  readonly missingSections: readonly string[];
}

export interface StyleLockHandoffKit {
  readonly kitId: string;
  readonly generatedAtIso: string;
  readonly episodeId: string;
  readonly sliceId: string;
  readonly stage: PipelineStageKey;
  readonly cutRange: { readonly startCut: number; readonly endCut: number };
  readonly targetArtistId: string;
  readonly targetArtistName: string;
  readonly onboardingBudgetMinutes: 10;
  readonly artBiblePalette: readonly ArtBiblePaletteSwatch[];
  readonly brushLineSpecs: readonly BrushLineSpec[];
  readonly previousTwoCuts: readonly PreviousCutReference[];
  readonly bg3dCameraPresets: readonly Bg3dCameraPreset[];
  readonly forbiddenChecklist: readonly ForbiddenStyleRule[];
  readonly validation: StyleLockKitValidation;
}

export interface MicroSliceAssignee {
  readonly assigneeId: string;
  readonly assigneeName: string;
  readonly roleTagKo: string;
  readonly roleTagEn: string;
  readonly region: StandbyRegionCode;
  readonly cutsPerHour: number;
}

export interface MicroSlicePacket {
  readonly microSliceId: string;
  readonly parentSliceId: string;
  readonly stage: PipelineStageKey;
  readonly startCut: number;
  readonly endCut: number;
  readonly cutCount: number;
  readonly previousCutContextIndex: number | null;
  readonly nextCutContextIndex: number | null;
  readonly assigneeId: string;
  readonly assigneeName: string;
  readonly roleTagKo: string;
  readonly roleTagEn: string;
  readonly estimatedHours: number;
}

export interface MicroSliceSplitResult {
  readonly ok: boolean;
  readonly parentSliceId: string;
  readonly microSlices: readonly MicroSlicePacket[];
  readonly updatedSlices: readonly ActiveCutSlice[];
  readonly integrityCheck: {
    readonly totalOriginalCuts: number;
    readonly totalSplitCuts: number;
    readonly overlapCount: number;
    readonly gapCount: number;
    readonly preserved: boolean;
  };
  readonly singleWorkerHours: number;
  readonly parallelCompletionHours: number;
  readonly parallelSpeedupFactor: number;
}

export type DefenseScenarioCode = "A" | "B" | "C";

export interface EmergencyDefenseScenario {
  readonly code: DefenseScenarioCode;
  readonly id: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly badgeKo: string;
  readonly badgeEn: string;
  readonly recommended: boolean;
  readonly feasibleBeforeDeadline: boolean;
  readonly mainCutsCount: number;
  readonly bonusCutsCount: number;
  readonly partTwoDeferredCuts: number;
  readonly projectedCompletionHours: number;
  readonly hiatusPrevented: boolean;
  readonly readerTrustScore: number;
  readonly actionStepsKo: readonly string[];
  readonly actionStepsEn: readonly string[];
  readonly readerNoticeDraftKo: string;
  readonly readerNoticeDraftEn: string;
}

export interface EmergencyDefensePlanReport {
  readonly isExtremeCrisis: boolean;
  readonly hoursUntilDeadline: number;
  readonly recommendedCode: DefenseScenarioCode;
  readonly scenarios: readonly EmergencyDefenseScenario[];
}

export interface HiatusShieldStudioState {
  readonly projectTitle: string;
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly targetTotalCuts: number;
  readonly bufferWeeks: number;
  readonly hoursUntilDeadline: number;
  readonly styleTarget: StyleTargetSpec;
  readonly members: readonly TeamMemberHealthSnapshot[];
  readonly slices: readonly ActiveCutSlice[];
  readonly standbyPool: readonly StandbyArtistCandidate[];
  readonly activeHandoffKit: StyleLockHandoffKit | null;
  readonly lastMicroSplit: MicroSliceSplitResult | null;
  readonly selectedDefenseCode: DefenseScenarioCode;
  readonly auditLog: readonly SosAuditEvent[];
}

export const STAGE_LABELS: Readonly<
  Record<PipelineStageKey, { readonly ko: string; readonly en: string }>
> = {
  line: { ko: "선화", en: "Line Art" },
  flat: { ko: "밑색", en: "Flat Color" },
  shade: { ko: "명암·보정", en: "Shade & Finish" },
  bg3d: { ko: "3D 배경", en: "3D Background" },
  lettering: { ko: "식자·효과음", en: "Lettering & SFX" },
};

export const ABSENCE_REASON_LABELS: Readonly<
  Record<AbsenceReason, { readonly ko: string; readonly en: string }>
> = {
  illness: { ko: "갑작스러운 질병", en: "Sudden Illness" },
  injury: { ko: "손목·신체 부상", en: "Wrist / Physical Injury" },
  personal_emergency: { ko: "긴급 개인 사정", en: "Urgent Personal Emergency" },
  unresponsive: { ko: "연락 두절", en: "Unresponsive" },
};

export function clampNum(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** OKLCH → OKLab 유클리드 색차 ΔE (100배 JND 스케일) */
export function computeHiatusOklchDeltaE(left: OklchSample, right: OklchSample): number {
  const radL = (left.h * Math.PI) / 180;
  const radR = (right.h * Math.PI) / 180;
  const a1 = left.c * Math.cos(radL);
  const b1 = left.c * Math.sin(radL);
  const a2 = right.c * Math.cos(radR);
  const b2 = right.c * Math.sin(radR);
  const dl = left.l - right.l;
  const da = a1 - a2;
  const db = b1 - b2;
  return round2(Math.sqrt(dl * dl + da * da + db * db) * 100);
}

/** OKLCH CSS 문자열 포맷 (원시 HEX 금지 정책 준수) */
export function formatHiatusOklchCss(color: OklchSample): string {
  return `oklch(${round2(clampNum(color.l, 0, 1))} ${round2(clampNum(color.c, 0, 0.4))} ${Math.round(color.h)})`;
}

/** 전체 슬라이스의 컷 구간 무손실·무중복·무누락 불변성 검증 */
export function verifyCutCoverageInvariant(
  slices: readonly ActiveCutSlice[],
  expectedTotalCuts: number,
): CutCoverageInvariantReport {
  const counts = new Map<number, number>();
  for (const slice of slices) {
    if (slice.endCut < slice.startCut) continue;
    for (let cut = slice.startCut; cut <= slice.endCut; cut += 1) {
      counts.set(cut, (counts.get(cut) ?? 0) + 1);
    }
  }
  const overlappingCuts: number[] = [];
  const missingCuts: number[] = [];
  for (let cut = 1; cut <= expectedTotalCuts; cut += 1) {
    const count = counts.get(cut) ?? 0;
    if (count === 0) missingCuts.push(cut);
    if (count > 1) overlappingCuts.push(cut);
  }
  return {
    expectedTotalCuts,
    coveredCutCount: counts.size,
    overlapCount: overlappingCuts.length,
    gapCount: missingCuts.length,
    overlappingCuts,
    missingCuts,
    preserved:
      overlappingCuts.length === 0 &&
      missingCuts.length === 0 &&
      counts.size === expectedTotalCuts,
  };
}
