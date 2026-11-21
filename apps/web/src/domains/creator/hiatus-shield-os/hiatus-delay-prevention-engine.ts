/**
 * 웹툰 휴재·지각 방지 OS 핵심 엔진 (퍼사드).
 * - 1. 비축 원고(Buffer) 건강도 & 번아웃 조기 경보 레이더
 * - 2. 결원 발생 시 1클릭 10분 긴급 대타(SOS) 자동 매칭 & 컷 슬라이스 즉시 이관
 * - 3. 10분 작화 통일 인계 키트(Style-Lock Continuity Handoff Kit)
 * - 4. 스마트 마이크로 슬라이스(25컷→8/8/9컷) 자동 재분배 & 3단계 비상 연재 방어 플랜
 */

import {
  ABSENCE_REASON_LABELS,
  STAGE_LABELS,
  clampNum,
  computeHiatusOklchDeltaE,
  round1,
  round2,
  verifyCutCoverageInvariant,
  type AbsenceReason,
  type AbsenceReleaseResult,
  type ActiveCutSlice,
  type BufferAndBurnoutAssessment,
  type BufferHealthTier,
  type EarlyWarningAlert,
  type EpisodeRiskInput,
  type LeaseTransferResult,
  type MemberBurnoutEvaluation,
  type PipelineStageKey,
  type RankedStandbyMatch,
  type StandbyArtistCandidate,
  type StyleTargetSpec,
  type TeamMemberHealthSnapshot,
} from "./hiatus-shield-types";

export {
  ABSENCE_REASON_LABELS,
  STAGE_LABELS,
  computeHiatusOklchDeltaE,
  formatHiatusOklchCss,
  verifyCutCoverageInvariant,
  type AbsenceReason,
  type AbsenceReleaseResult,
  type ActiveCutSlice,
  type ArtBiblePaletteSwatch,
  type Bg3dCameraPreset,
  type BrushLineSpec,
  type BufferAndBurnoutAssessment,
  type BufferHealthTier,
  type CutCoverageInvariantReport,
  type DefenseScenarioCode,
  type EarlyWarningAlert,
  type EmergencyDefensePlanReport,
  type EmergencyDefenseScenario,
  type EpisodeRiskInput,
  type ForbiddenStyleRule,
  type HiatusShieldStudioState,
  type LeaseTransferResult,
  type MemberBurnoutEvaluation,
  type MicroSliceAssignee,
  type MicroSlicePacket,
  type MicroSliceSplitResult,
  type OklchSample,
  type PipelineStageKey,
  type PreviousCutReference,
  type RankedStandbyMatch,
  type SliceLockStatus,
  type SosAuditEvent,
  type StandbyArtistCandidate,
  type StandbyRegionCode,
  type StyleLockHandoffKit,
  type StyleLockKitValidation,
  type StyleTargetSpec,
  type TeamMemberHealthSnapshot,
} from "./hiatus-shield-types";

export {
  buildStyleLockHandoffKit,
  formatHandoffKitChecklistText,
  generateEmergencyDefenseScenarios,
  serializeHandoffKitToJson,
  splitBottleneckSliceIntoMicroSlices,
  validateStyleLockHandoffKit,
} from "./hiatus-handoff-and-defense";

export { createInitialHiatusShieldState } from "./hiatus-shield-seed";

const KST_UTC_OFFSET = 9;
const WORK_HOURS_PER_DAY = 8;

/** 1. 비축 원고(Buffer) 건강도 & 번아웃 조기 경보 레이더 평가 */
export function assessBufferAndBurnoutRisk(input: EpisodeRiskInput): BufferAndBurnoutAssessment {
  const safeBufferWeeks = Math.max(0, input.bufferWeeks);
  const safeHoursUntilDeadline = Math.max(0, input.hoursUntilDeadline);
  const safeRemainingCuts = Math.max(0, input.remainingCuts);

  const bufferTier: BufferHealthTier =
    safeBufferWeeks >= 3 ? "green" : safeBufferWeeks >= 1 ? "amber" : "red";

  const memberRisks: MemberBurnoutEvaluation[] = input.members.map((member) => {
    const overtimeScore = clampNum((Math.max(0, member.overtimeHoursThisWeek) / 20) * 100, 0, 100);
    const wristScore = clampNum(member.wristFatigueScore, 0, 100);
    const neckScore = clampNum(member.neckFatigueScore, 0, 100);
    const baseline = Math.max(1, member.baselineDailyVelocity);
    const velocityRatio = clampNum(member.dailyCutVelocity / baseline, 0, 1.5);
    const velocityDropScore = clampNum((1 - Math.min(1, velocityRatio)) * 100, 0, 100);

    const burnoutIndex = round1(
      clampNum(
        overtimeScore * 0.3 +
          wristScore * 0.3 +
          neckScore * 0.25 +
          velocityDropScore * 0.15,
        0,
        100,
      ),
    );

    const alertTier: BufferHealthTier =
      member.status === "absent" || burnoutIndex >= 75
        ? "red"
        : burnoutIndex >= 50
          ? "amber"
          : "green";

    const efficiencyMultiplier =
      member.status === "absent"
        ? 0
        : burnoutIndex >= 75
          ? 0.75
          : burnoutIndex >= 50
            ? 0.9
            : 1;

    const effectiveDailyCuts = round1(Math.max(0, member.dailyCutVelocity) * efficiencyMultiplier);

    const guidanceKo =
      member.status === "absent"
        ? "결원 상태 — 미완료 컷을 즉시 긴급 대타 풀로 이관하세요."
        : burnoutIndex >= 75
          ? "손목·야근 피로 고위험 — 당일 컷 30% 분산 및 야간 작업 중단 권고"
          : burnoutIndex >= 50
            ? "피로 누적 주의 — 다음 회차 비축 여유분 배정 필요"
            : "안정 속도 유지 중";

    const guidanceEn =
      member.status === "absent"
        ? "Absent — transfer remaining cuts to emergency standby pool immediately."
        : burnoutIndex >= 75
          ? "High wrist/overtime fatigue — offload 30% cuts and halt night overtime."
          : burnoutIndex >= 50
            ? "Fatigue building — rebalance next sprint workload."
            : "Steady output velocity";

    return {
      memberId: member.memberId,
      name: member.name,
      stage: member.stage,
      status: member.status,
      burnoutIndex,
      velocityRatioPct: Math.round(velocityRatio * 100),
      effectiveDailyCuts,
      alertTier,
      guidanceKo,
      guidanceEn,
    };
  });

  memberRisks.sort((a, b) => {
    if (a.status === "absent" && b.status !== "absent") return -1;
    if (b.status === "absent" && a.status !== "absent") return 1;
    if (b.burnoutIndex !== a.burnoutIndex) return b.burnoutIndex - a.burnoutIndex;
    return a.memberId.localeCompare(b.memberId);
  });

  const absentMemberCount = memberRisks.filter((m) => m.status === "absent").length;
  const uncoveredAbsenceCount = Math.max(
    0,
    absentMemberCount - Math.max(0, input.coveredAbsenceCount ?? 0),
  );
  const highBurnoutMemberCount = memberRisks.filter(
    (m) => m.status !== "absent" && m.burnoutIndex >= 75,
  ).length;
  const maxBurnoutIndex = memberRisks.reduce((acc, m) => Math.max(acc, m.burnoutIndex), 0);

  const activeMembers = memberRisks.filter((m) => m.status !== "absent");
  const totalEffectiveDailyCuts = round1(
    activeMembers.reduce((sum, m) => sum + m.effectiveDailyCuts, 0) +
      Math.max(0, input.reliefDailyCuts ?? 0),
  );
  // 5개 공정 파이프라인 병렬 효율 계수(0.32) 적용해 회차 최종 완성 속도 산출
  const effectiveEpisodeDailyCuts = round1(totalEffectiveDailyCuts * 0.32);
  const effectiveHourlyCuts = effectiveEpisodeDailyCuts / WORK_HOURS_PER_DAY;

  const estimatedHoursNeeded =
    safeRemainingCuts === 0
      ? 0
      : effectiveHourlyCuts > 0
        ? round1(safeRemainingCuts / effectiveHourlyCuts)
        : round1(safeRemainingCuts * 2.5);

  const projectedDelayHours = round1(Math.max(0, estimatedHoursNeeded - safeHoursUntilDeadline));

  const bufferBaseRisk = bufferTier === "red" ? 42 : bufferTier === "amber" ? 18 : 3;
  const delayRisk = projectedDelayHours > 0 ? Math.min(38, projectedDelayHours * 1.8) : 0;
  const absenceRisk = uncoveredAbsenceCount * 16;
  const burnoutRisk = maxBurnoutIndex >= 75 ? 14 : maxBurnoutIndex >= 50 ? 6 : 0;
  const hiatusProbabilityPct = Math.round(
    clampNum(bufferBaseRisk + delayRisk + absenceRisk + burnoutRisk, 0, 100),
  );

  const overallTier: BufferHealthTier =
    bufferTier === "red" ||
    projectedDelayHours >= 8 ||
    hiatusProbabilityPct >= 65 ||
    uncoveredAbsenceCount > 0
      ? "red"
      : bufferTier === "amber" ||
          projectedDelayHours > 0 ||
          hiatusProbabilityPct >= 30 ||
          maxBurnoutIndex >= 60
        ? "amber"
        : "green";

  const earlyWarnings: EarlyWarningAlert[] = [];
  if (bufferTier === "red") {
    earlyWarnings.push({
      id: "warn-buffer-zero",
      tier: "red",
      titleKo: "비축 원고 0주 — 당일 지연이 곧바로 휴재로 직결됩니다",
      titleEn: "0 Weeks Buffer — Any delay directly causes hiatus",
      detailKo: "긴급 대타 투입 또는 비상 연재 방어 플랜(B/C안)을 사전 대기 상태로 전환하세요.",
      detailEn: "Pre-stage standby relief or activate Emergency Defense Plan B/C.",
    });
  } else if (bufferTier === "amber") {
    earlyWarnings.push({
      id: "warn-buffer-low",
      tier: "amber",
      titleKo: `비축 원고 ${safeBufferWeeks}주 — 안전선(3주) 미달`,
      titleEn: `${safeBufferWeeks}w Buffer — Below 3-week safety threshold`,
      detailKo: "주간 추가 비축 0.5화 확보와 야근 상한 관리가 필요합니다.",
      detailEn: "Rebuild +0.5 ep/week buffer and cap team overtime.",
    });
  }

  if (uncoveredAbsenceCount > 0) {
    earlyWarnings.push({
      id: "warn-member-absent",
      tier: "red",
      titleKo: `미대체 결원 ${uncoveredAbsenceCount}명 발생 — 10분 긴급 대타(SOS) 호출 필요`,
      titleEn: `${uncoveredAbsenceCount} Uncovered Absence(s) — Trigger 10-Min SOS Relief`,
      detailKo: "해제된 미완료 컷 슬라이스를 Top-1 대타에게 즉시 이관하고 인계 키트를 발송하세요.",
      detailEn: "Transfer unlocked cut slices to Top-1 standby artist with Style-Lock kit.",
    });
  }

  if (highBurnoutMemberCount > 0) {
    const topBurnout = memberRisks.find((m) => m.status !== "absent" && m.burnoutIndex >= 75);
    earlyWarnings.push({
      id: "warn-burnout-peak",
      tier: "amber",
      titleKo: `${topBurnout?.name ?? "팀원"} 번아웃 위험(${topBurnout?.burnoutIndex ?? maxBurnoutIndex}점)`,
      titleEn: `${topBurnout?.name ?? "Member"} Burnout Alert (${topBurnout?.burnoutIndex ?? maxBurnoutIndex})`,
      detailKo: "손목·목 피로와 야근 누적이 임계치를 넘었습니다. 병목 슬라이스 3분할을 권장합니다.",
      detailEn: "Wrist/neck strain and overtime crossed threshold; split bottleneck slice.",
    });
  }

  if (projectedDelayHours > 0) {
    earlyWarnings.push({
      id: "warn-deadline-delay",
      tier: projectedDelayHours >= 8 ? "red" : "amber",
      titleKo: `마감 D-Day 기준 +${projectedDelayHours}시간 지연 예측`,
      titleEn: `Projected +${projectedDelayHours}h Deadline Slip`,
      detailKo: `잔여 ${safeRemainingCuts}컷 예상 소요 ${estimatedHoursNeeded}시간 / 마감까지 ${safeHoursUntilDeadline}시간 남음.`,
      detailEn: `${safeRemainingCuts} cuts need ~${estimatedHoursNeeded}h with ${safeHoursUntilDeadline}h left.`,
    });
  }

  return {
    episodeId: input.episodeId,
    bufferWeeks: safeBufferWeeks,
    bufferTier,
    overallTier,
    projectedDelayHours,
    estimatedHoursNeeded,
    teamEffectiveDailyCuts: effectiveEpisodeDailyCuts,
    hiatusProbabilityPct,
    absentMemberCount,
    uncoveredAbsenceCount,
    highBurnoutMemberCount,
    maxBurnoutIndex,
    memberRisks,
    earlyWarnings,
  };
}

/** 2-A. 결원 선언 시 완료 컷은 보존하고 미완료 Cut-Slice만 무손실·무중복 잠금 해제 */
export function declareMemberAbsenceAndReleaseSlices(params: {
  readonly members: readonly TeamMemberHealthSnapshot[];
  readonly slices: readonly ActiveCutSlice[];
  readonly targetTotalCuts: number;
  readonly memberId: string;
  readonly reason: AbsenceReason;
  readonly nowIso: string;
}): AbsenceReleaseResult {
  const targetMember = params.members.find((m) => m.memberId === params.memberId);
  const nextMembers = params.members.map((member) =>
    member.memberId === params.memberId
      ? { ...member, status: "absent" as const, absenceReason: params.reason }
      : member,
  );

  const releasedSliceIds: string[] = [];
  let preservedCompletedCuts = 0;
  let releasedUnfinishedCuts = 0;
  const nextSlices: ActiveCutSlice[] = [];

  for (const slice of params.slices) {
    if (slice.holderId !== params.memberId || slice.lockStatus === "completed_locked") {
      nextSlices.push(slice);
      continue;
    }
    const sliceLen = Math.max(0, slice.endCut - slice.startCut + 1);
    const doneCount = clampNum(slice.completedCount, 0, sliceLen);

    if (doneCount >= sliceLen) {
      preservedCompletedCuts += doneCount;
      nextSlices.push({ ...slice, lockStatus: "completed_locked" });
      continue;
    }

    if (doneCount > 0) {
      const doneEndCut = slice.startCut + doneCount - 1;
      const unfinishedStartCut = doneEndCut + 1;
      preservedCompletedCuts += doneCount;
      releasedUnfinishedCuts += slice.endCut - unfinishedStartCut + 1;

      nextSlices.push({
        ...slice,
        sliceId: `${slice.sliceId}-done`,
        endCut: doneEndCut,
        completedCount: doneCount,
        lockStatus: "completed_locked",
        parentSliceId: slice.sliceId,
      });

      const sosSliceId = `${slice.sliceId}-sos`;
      releasedSliceIds.push(sosSliceId);
      nextSlices.push({
        ...slice,
        sliceId: sosSliceId,
        startCut: unfinishedStartCut,
        endCut: slice.endCut,
        completedCount: 0,
        holderId: null,
        holderName: null,
        lockStatus: "released_sos",
        leaseToken: null,
        leaseExpiresAtIso: null,
        handoffKitId: null,
        parentSliceId: slice.sliceId,
      });
    } else {
      releasedUnfinishedCuts += sliceLen;
      releasedSliceIds.push(slice.sliceId);
      nextSlices.push({
        ...slice,
        holderId: null,
        holderName: null,
        lockStatus: "released_sos",
        leaseToken: null,
        leaseExpiresAtIso: null,
        handoffKitId: null,
      });
    }
  }

  const invariant = verifyCutCoverageInvariant(nextSlices, params.targetTotalCuts);
  const reasonLabel = ABSENCE_REASON_LABELS[params.reason];
  const memberName = targetMember?.name ?? params.memberId;

  return {
    ok: targetMember !== undefined && invariant.preserved,
    absentMemberId: params.memberId,
    releasedSliceIds,
    preservedCompletedCuts,
    releasedUnfinishedCuts,
    members: nextMembers,
    slices: nextSlices,
    invariant,
    auditEvent: {
      eventId: `sos-abs-${params.memberId}-${params.nowIso}`,
      occurredAtIso: params.nowIso,
      kind: "absence_declared",
      summaryKo: `${memberName} 결원(${reasonLabel.ko}) — 완료 ${preservedCompletedCuts}컷 보존, 미완료 ${releasedUnfinishedCuts}컷 잠금 해제`,
      summaryEn: `${memberName} absent (${reasonLabel.en}) — preserved ${preservedCompletedCuts} done cuts, unlocked ${releasedUnfinishedCuts} cuts`,
    },
  };
}

/** 2-B. 국내 + 동남아/글로벌 검증 예비 작가 풀에서 Top-N 긴급 대타 결정론적 랭킹 */
export function rankEmergencyStandbyArtists(params: {
  readonly pool: readonly StandbyArtistCandidate[];
  readonly neededStage: PipelineStageKey;
  readonly remainingCuts: number;
  readonly styleTarget: StyleTargetSpec;
  readonly topN?: number;
  readonly regionFilter?: "all" | "domestic" | "global_sea";
}): readonly RankedStandbyMatch[] {
  const safeRemainingCuts = Math.max(1, params.remainingCuts);
  const topN = params.topN ?? 5;
  const regionFilter = params.regionFilter ?? "all";

  const filtered = params.pool.filter((candidate) => {
    if (!candidate.stages.includes(params.neededStage)) return false;
    if (regionFilter !== "all" && candidate.regionGroup !== regionFilter) return false;
    return true;
  });

  const ranked: RankedStandbyMatch[] = filtered.map((candidate) => {
    const isPrimaryStage = candidate.stages[0] === params.neededStage;
    const stageMatchScore = isPrimaryStage ? 100 : 82;

    const lineWidthDeltaPx = round2(
      Math.abs(candidate.avgLineWidthPx - params.styleTarget.targetLineWidthPx),
    );
    const lineScore = clampNum(100 - lineWidthDeltaPx * 45, 0, 100);

    const oklchDeltaE = computeHiatusOklchDeltaE(
      candidate.paletteSampleOklch,
      params.styleTarget.targetPaletteOklch,
    );
    const colorScore = clampNum(100 - oklchDeltaE * 5.5, 0, 100);
    const toneScore = clampNum(candidate.toneMatchScore, 0, 100);
    const styleCompatibilityScore = round1(
      lineScore * 0.35 + colorScore * 0.35 + toneScore * 0.3,
    );

    const timezoneDiffFromKstHours = Math.abs(candidate.timezoneOffsetHours - KST_UTC_OFFSET);
    const tzBonus = timezoneDiffFromKstHours <= 2 ? 10 : timezoneDiffFromKstHours <= 4 ? 5 : 0;
    const baseReady = candidate.availableNow
      ? clampNum(100 - Math.max(0, candidate.responseEtaMinutes - 5) * 4, 55, 100)
      : 22;
    const readinessScore = round1(clampNum(baseReady * 0.9 + tzBonus, 0, 100));

    const krwRatio =
      params.styleTarget.maxBudgetKrwPerHour > 0
        ? candidate.hourlyRateKrw / params.styleTarget.maxBudgetKrwPerHour
        : 1;
    const usdRatio =
      params.styleTarget.maxBudgetUsdPerHour > 0
        ? candidate.hourlyRateUsd / params.styleTarget.maxBudgetUsdPerHour
        : 1;
    const budgetRatio = Math.max(krwRatio, usdRatio);
    const budgetFitScore = round1(
      budgetRatio <= 1
        ? clampNum(88 + (1 - budgetRatio) * 18, 88, 100)
        : clampNum(100 - (budgetRatio - 1) * 120, 10, 88),
    );

    const totalScore = round1(
      stageMatchScore * 0.3 +
        styleCompatibilityScore * 0.35 +
        readinessScore * 0.2 +
        budgetFitScore * 0.15,
    );

    const cutsPerHour = Math.max(0.5, candidate.maxDailyCuts / WORK_HOURS_PER_DAY);
    const estimatedCompletionHours = round1(safeRemainingCuts / cutsPerHour);
    const estimatedTotalKrw = Math.round(estimatedCompletionHours * candidate.hourlyRateKrw);
    const estimatedTotalUsd = Math.round(estimatedCompletionHours * candidate.hourlyRateUsd);
    const canDeployInTenMinutes = candidate.availableNow && candidate.responseEtaMinutes <= 10;

    return {
      candidate,
      totalScore,
      stageMatchScore,
      styleCompatibilityScore,
      readinessScore,
      budgetFitScore,
      oklchDeltaE,
      lineWidthDeltaPx,
      timezoneDiffFromKstHours,
      canDeployInTenMinutes,
      estimatedCompletionHours,
      estimatedTotalKrw,
      estimatedTotalUsd,
    };
  });

  ranked.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (a.candidate.responseEtaMinutes !== b.candidate.responseEtaMinutes) {
      return a.candidate.responseEtaMinutes - b.candidate.responseEtaMinutes;
    }
    return a.candidate.artistId.localeCompare(b.candidate.artistId);
  });

  return ranked.slice(0, Math.max(1, topN));
}

/** 2-C. 1클릭 리스 이관 (해제된 미완료 슬라이스를 선택 대타에게 원자적 이관) */
export function transferSliceLeaseToStandby(params: {
  readonly slices: readonly ActiveCutSlice[];
  readonly targetTotalCuts: number;
  readonly sliceId: string;
  readonly candidate: StandbyArtistCandidate;
  readonly handoffKitId: string;
  readonly nowIso: string;
  readonly leaseTtlHours?: number;
}): LeaseTransferResult {
  const target = params.slices.find((s) => s.sliceId === params.sliceId);
  if (!target) {
    return {
      ok: false,
      reasonKo: `대상 슬라이스(${params.sliceId})를 찾을 수 없습니다.`,
      reasonEn: `Slice ${params.sliceId} not found.`,
      transferredSliceId: null,
      leaseToken: null,
      slices: params.slices,
      invariant: verifyCutCoverageInvariant(params.slices, params.targetTotalCuts),
      auditEvent: null,
    };
  }
  if (target.lockStatus !== "released_sos") {
    return {
      ok: false,
      reasonKo: `잠금 해제(SOS) 상태인 슬라이스만 긴급 이관할 수 있습니다(현재: ${target.lockStatus}).`,
      reasonEn: `Only unlocked SOS slices can be transferred (current: ${target.lockStatus}).`,
      transferredSliceId: null,
      leaseToken: null,
      slices: params.slices,
      invariant: verifyCutCoverageInvariant(params.slices, params.targetTotalCuts),
      auditEvent: null,
    };
  }
  if (!params.candidate.stages.includes(target.stage)) {
    return {
      ok: false,
      reasonKo: `${params.candidate.name} 작가는 ${STAGE_LABELS[target.stage].ko} 공정 매칭 대상이 아닙니다.`,
      reasonEn: `${params.candidate.name} is not qualified for ${STAGE_LABELS[target.stage].en}.`,
      transferredSliceId: null,
      leaseToken: null,
      slices: params.slices,
      invariant: verifyCutCoverageInvariant(params.slices, params.targetTotalCuts),
      auditEvent: null,
    };
  }

  const ttlMs = (params.leaseTtlHours ?? 12) * 3600 * 1000;
  const expiresAtIso = new Date(Date.parse(params.nowIso) + ttlMs).toISOString();
  const leaseToken = `sos-lease-${target.episodeId}-${target.sliceId}-${params.candidate.artistId}`;

  const nextSlices = params.slices.map((slice) =>
    slice.sliceId === params.sliceId
      ? {
          ...slice,
          holderId: params.candidate.artistId,
          holderName: params.candidate.name,
          holderRegion: params.candidate.region,
          lockStatus: "transferred" as const,
          leaseToken,
          leaseExpiresAtIso: expiresAtIso,
          handoffKitId: params.handoffKitId,
        }
      : slice,
  );

  const invariant = verifyCutCoverageInvariant(nextSlices, params.targetTotalCuts);
  const cutRangeLabel = `${target.startCut}~${target.endCut}컷`;

  return {
    ok: invariant.preserved,
    reasonKo: `${cutRangeLabel} 리스를 ${params.candidate.name}(${params.candidate.regionLabelKo})에게 이관 완료`,
    reasonEn: `Transferred cuts ${target.startCut}-${target.endCut} to ${params.candidate.name} (${params.candidate.regionLabelEn})`,
    transferredSliceId: target.sliceId,
    leaseToken,
    slices: nextSlices,
    invariant,
    auditEvent: {
      eventId: `sos-xfer-${target.sliceId}-${params.candidate.artistId}`,
      occurredAtIso: params.nowIso,
      kind: "lease_transferred",
      summaryKo: `${cutRangeLabel} 긴급 리스 → ${params.candidate.name} (${params.candidate.responseEtaMinutes}분 투입)`,
      summaryEn: `Cuts ${target.startCut}-${target.endCut} leased to ${params.candidate.name} (${params.candidate.responseEtaMinutes}m ETA)`,
    },
  };
}
