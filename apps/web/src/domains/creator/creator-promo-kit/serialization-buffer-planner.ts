/**
 * 연재 체력·마감 버퍼 플래너 (2주 전 마감 병목 조기 경보 · 예비 원고 비축 버퍼 · 공지 초안)
 *
 * - 최근 일별 컷 완료 속도, 남은 마감일, 어시스턴트 분업 진척도를 종합해
 *   2주(14일) 창 기준 마감 병목 위험도(green / amber / red)를 조기 판별한다.
 * - 예비 원고 비축 버퍼 일수, 휴식일을 지키는 권장 주간 컷 할당, 휴재/완충 공지 초안을 결정론적으로 생성한다.
 */

export type BufferAlertLevel = "green" | "amber" | "red";

export type AssistantStageRole =
  | "lineart"
  | "base-color"
  | "shading"
  | "background"
  | "lettering";

export interface RecentCutVelocitySample {
  readonly dateIso: string;
  readonly completedCuts: number;
  readonly workHours?: number;
}

export interface AssistantPipelineTask {
  readonly id: string;
  readonly memberName: string;
  readonly role: AssistantStageRole;
  readonly assignedCuts: number;
  readonly completedCuts: number;
  readonly expectedFinishDays: number;
  readonly blocked?: boolean;
}

export interface SerializationBufferInput {
  readonly seriesTitle: string;
  readonly nextEpisodeNumber: number;
  readonly cutsPerEpisode: number;
  readonly currentEpisodeCompletedCuts: number;
  readonly daysUntilDeadline: number;
  readonly publishCadenceDays?: number;
  readonly stockpiledCompletedEpisodes: number;
  readonly recentVelocity: readonly RecentCutVelocitySample[];
  readonly assistantTasks?: readonly AssistantPipelineTask[];
  readonly creatorWeeklyRestDays?: number;
  readonly targetLeadWarningDays?: number;
  readonly referenceDateIso?: string;
}

export interface AssistantBottleneckItem {
  readonly taskId: string;
  readonly memberName: string;
  readonly role: AssistantStageRole;
  readonly roleLabelKo: string;
  readonly completionPct: number;
  readonly remainingCuts: number;
  readonly expectedFinishDays: number;
  readonly blocked: boolean;
  readonly reasonKo: string;
}

export interface StageWeeklyCutAllocation {
  readonly role: "storyboard" | AssistantStageRole;
  readonly labelKo: string;
  readonly cutsPerWeek: number;
  readonly sharePct: number;
}

export interface SerializationVelocityMetrics {
  readonly sampleDays: number;
  readonly avgCutsPerActiveDay: number;
  readonly effectiveDailyCuts: number;
  readonly weeklyWorkHoursEstimate: number | null;
  readonly fatigueWarning: boolean;
  readonly assistantProgressPct: number;
  readonly assistantDelayDays: number;
}

export interface SerializationBufferMetrics {
  readonly remainingCutsForNextDeadline: number;
  readonly stockpiledBufferDays: number;
  readonly projectedDaysToFinishCurrent: number | null;
  readonly projectedSlackDays: number | null;
  readonly netBufferDaysAfterDeadline: number;
  readonly twoWeekRequiredCuts: number;
  readonly twoWeekCapacityCuts: number;
  readonly twoWeekHorizonDeficitCuts: number;
}

export interface WeeklyCutAllocationRecommendation {
  readonly recommendedWorkDaysPerWeek: number;
  readonly recommendedWeeklyCuts: number;
  readonly recommendedDailyCuts: number;
  readonly suggestedEpisodeCutCap: number | null;
  readonly stageAllocations: readonly StageWeeklyCutAllocation[];
}

export interface SerializationNoticeDraft {
  readonly kind: "none" | "buffer-pacing" | "short-hiatus";
  readonly title: string;
  readonly body: string;
  readonly suggestedResumeDateIso: string | null;
  readonly suggestedActionKo: string;
}

export interface SerializationBufferPlan {
  readonly seriesTitle: string;
  readonly nextEpisodeNumber: number;
  readonly alertLevel: BufferAlertLevel;
  readonly alertLabelKo: string;
  readonly alertHeadlineKo: string;
  readonly bottleneckReasons: readonly string[];
  readonly assistantBottlenecks: readonly AssistantBottleneckItem[];
  readonly velocity: SerializationVelocityMetrics;
  readonly buffer: SerializationBufferMetrics;
  readonly recommendation: WeeklyCutAllocationRecommendation;
  readonly noticeDraft: SerializationNoticeDraft;
}

const ROLE_LABEL_KO: Readonly<Record<AssistantStageRole, string>> = Object.freeze({
  lineart: "선화",
  "base-color": "밑색",
  shading: "명암·후보정",
  background: "3D·배경",
  lettering: "식자·말풍선",
});

const ALERT_LABEL_KO: Readonly<Record<BufferAlertLevel, string>> = Object.freeze({
  green: "안정",
  amber: "2주 전 주의",
  red: "마감 긴급 경보",
});

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampSafe(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function parseIsoDateUtc(dateIso: string | undefined): Date | null {
  if (!dateIso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(dateIso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return dt;
}

function formatIsoDateUtc(date: Date): string {
  const yyyy = String(date.getUTCFullYear()).padStart(4, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function addDaysToIsoDate(dateIso: string | undefined, deltaDays: number): string | null {
  const base = parseIsoDateUtc(dateIso);
  if (!base || !Number.isFinite(deltaDays)) return null;
  const shifted = new Date(base.getTime() + Math.round(deltaDays) * 86_400_000);
  return formatIsoDateUtc(shifted);
}

function computeWeightedCutVelocity(samples: readonly RecentCutVelocitySample[]): {
  readonly sampleDays: number;
  readonly avgCutsPerActiveDay: number;
  readonly weeklyWorkHoursEstimate: number | null;
} {
  const valid = samples.filter(
    (item) => Number.isFinite(item.completedCuts) && item.completedCuts >= 0,
  );
  if (valid.length === 0) {
    return { sampleDays: 0, avgCutsPerActiveDay: 0, weeklyWorkHoursEstimate: null };
  }

  // 최근 3일에 가중치 1.25를 부여해 급격한 체력 저하나 속도 변화를 조기 포착한다.
  let weightedSum = 0;
  let totalWeight = 0;
  const recentCutoff = Math.max(0, valid.length - 3);
  for (let i = 0; i < valid.length; i += 1) {
    const weight = i >= recentCutoff ? 1.25 : 1;
    weightedSum += valid[i].completedCuts * weight;
    totalWeight += weight;
  }

  const hourSamples = valid.filter(
    (item): item is RecentCutVelocitySample & { readonly workHours: number } =>
      typeof item.workHours === "number" && Number.isFinite(item.workHours) && item.workHours >= 0,
  );
  const weeklyWorkHoursEstimate =
    hourSamples.length > 0
      ? roundOne(
          (hourSamples.reduce((sum, item) => sum + item.workHours, 0) / hourSamples.length) * 6,
        )
      : null;

  return {
    sampleDays: valid.length,
    avgCutsPerActiveDay: totalWeight > 0 ? roundOne(weightedSum / totalWeight) : 0,
    weeklyWorkHoursEstimate,
  };
}

function evaluateAssistantPipeline(
  tasks: readonly AssistantPipelineTask[],
  daysUntilDeadline: number,
): {
  readonly assistantProgressPct: number;
  readonly assistantDelayDays: number;
  readonly maxExpectedFinishDays: number;
  readonly bottlenecks: readonly AssistantBottleneckItem[];
} {
  if (tasks.length === 0) {
    return {
      assistantProgressPct: 100,
      assistantDelayDays: 0,
      maxExpectedFinishDays: 0,
      bottlenecks: [],
    };
  }

  let totalAssigned = 0;
  let totalCompleted = 0;
  let maxExpectedFinishDays = 0;
  const bottlenecks: AssistantBottleneckItem[] = [];

  for (const task of tasks) {
    const assigned = Math.max(0, Math.round(task.assignedCuts));
    const completed = Math.min(assigned, Math.max(0, Math.round(task.completedCuts)));
    const remaining = Math.max(0, assigned - completed);
    const completionPct = assigned > 0 ? Math.round((completed / assigned) * 100) : 100;
    const expectedDays = Math.max(0, roundOne(task.expectedFinishDays));
    const blocked = Boolean(task.blocked);
    const effectiveFinish = blocked ? expectedDays + 2 : expectedDays;

    totalAssigned += assigned;
    totalCompleted += completed;
    if (remaining > 0 || blocked) {
      maxExpectedFinishDays = Math.max(maxExpectedFinishDays, effectiveFinish);
    }

    const roleLabelKo = ROLE_LABEL_KO[task.role];
    const behindDeadline = remaining > 0 && effectiveFinish > daysUntilDeadline;
    const lowProgressNearDeadline = remaining > 0 && daysUntilDeadline <= 5 && completionPct < 55;

    if (blocked || behindDeadline || lowProgressNearDeadline) {
      const reasonParts: string[] = [];
      if (blocked) reasonParts.push("선행 컷 대기·차단 상태");
      if (behindDeadline) {
        reasonParts.push(
          `예상 완료(${effectiveFinish}일)가 남은 마감(${daysUntilDeadline}일)을 초과`,
        );
      }
      if (lowProgressNearDeadline) {
        reasonParts.push(`마감 임박 시점 진척도 ${completionPct}%`);
      }

      bottlenecks.push({
        taskId: task.id,
        memberName: task.memberName.trim() || roleLabelKo,
        role: task.role,
        roleLabelKo,
        completionPct,
        remainingCuts: remaining,
        expectedFinishDays: effectiveFinish,
        blocked,
        reasonKo: `${roleLabelKo}(${task.memberName.trim() || "담당"}) ${reasonParts.join(" · ")}`,
      });
    }
  }

  const assistantProgressPct =
    totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 100;
  const assistantDelayDays = roundOne(Math.max(0, maxExpectedFinishDays - daysUntilDeadline));

  return {
    assistantProgressPct,
    assistantDelayDays,
    maxExpectedFinishDays: roundOne(maxExpectedFinishDays),
    bottlenecks,
  };
}

function buildStageAllocations(recommendedWeeklyCuts: number): readonly StageWeeklyCutAllocation[] {
  const shares: readonly { readonly role: StageWeeklyCutAllocation["role"]; readonly labelKo: string; readonly sharePct: number }[] = [
    { role: "storyboard", labelKo: "콘티·연출", sharePct: 15 },
    { role: "lineart", labelKo: "선화", sharePct: 30 },
    { role: "base-color", labelKo: "밑색", sharePct: 15 },
    { role: "shading", labelKo: "명암·후보정", sharePct: 18 },
    { role: "background", labelKo: "3D·배경", sharePct: 14 },
    { role: "lettering", labelKo: "식자·최종검수", sharePct: 8 },
  ];
  return shares.map((item) => ({
    role: item.role,
    labelKo: item.labelKo,
    sharePct: item.sharePct,
    cutsPerWeek: Math.max(1, Math.round((recommendedWeeklyCuts * item.sharePct) / 100)),
  }));
}

function buildNoticeDraft(params: {
  readonly seriesTitle: string;
  readonly nextEpisodeNumber: number;
  readonly alertLevel: BufferAlertLevel;
  readonly daysUntilDeadline: number;
  readonly publishCadenceDays: number;
  readonly referenceDateIso?: string;
  readonly suggestedEpisodeCutCap: number | null;
}): SerializationNoticeDraft {
  const {
    seriesTitle,
    nextEpisodeNumber,
    alertLevel,
    daysUntilDeadline,
    publishCadenceDays,
    referenceDateIso,
    suggestedEpisodeCutCap,
  } = params;

  if (alertLevel === "green") {
    return {
      kind: "none",
      title: `[${seriesTitle}] ${nextEpisodeNumber}화 정상 연재 예정`,
      body: `독자 여러분 안녕하세요. <${seriesTitle}> ${nextEpisodeNumber}화는 예정된 일정에 맞춰 정상 업로드됩니다. 늘 함께해 주셔서 감사합니다.`,
      suggestedResumeDateIso: addDaysToIsoDate(referenceDateIso, daysUntilDeadline),
      suggestedActionKo: "현재 연재 속도와 예비 원고 버퍼가 안정적입니다. 별도 휴재 공지가 필요하지 않습니다.",
    };
  }

  if (alertLevel === "amber") {
    const resumeDate = addDaysToIsoDate(referenceDateIso, daysUntilDeadline);
    const pacingNote = suggestedEpisodeCutCap
      ? `다음 회차는 연출 밀도를 유지하면서 ${suggestedEpisodeCutCap}컷 안팎으로 호흡을 정리해 선보일 예정입니다.`
      : "작화 완성도와 안정적인 연재 흐름을 지키기 위해 이번 구간에서 작업 페이스를 조율하고 있습니다.";
    return {
      kind: "buffer-pacing",
      title: `[${seriesTitle}] ${nextEpisodeNumber}화 작업 페이스 및 연재 안내`,
      body: [
        `안녕하세요, <${seriesTitle}>을 읽어 주시는 독자 여러분.`,
        `${nextEpisodeNumber}화 마감을 앞두고 ${pacingNote}`,
        resumeDate
          ? `${nextEpisodeNumber}화는 ${resumeDate} 예정 일정대로 찾아뵙겠습니다. 기다려 주셔서 감사합니다.`
          : "예정된 연재 일정을 지키며 더 단단한 원고로 찾아뵙겠습니다. 감사합니다.",
      ].join("\n\n"),
      suggestedResumeDateIso: resumeDate,
      suggestedActionKo:
        "2주 전 조기 경보 구간입니다. 배경·밑색 분업 일정을 앞당기고 1화 이상 예비 비축을 우선 회복하세요.",
    };
  }

  const resumeDate = addDaysToIsoDate(referenceDateIso, daysUntilDeadline + publishCadenceDays);
  const resumeLine = resumeDate
    ? `${nextEpisodeNumber}화는 한 주 재정비 후 ${resumeDate}에 정상 연재로 돌아오겠습니다.`
    : `${nextEpisodeNumber}화는 ${publishCadenceDays}일 재정비 후 다음 주 같은 요일에 돌아오겠습니다.`;

  return {
    kind: "short-hiatus",
    title: `[${seriesTitle}] ${nextEpisodeNumber}화 1주 휴재 및 재정비 안내`,
    body: [
      `안녕하세요, <${seriesTitle}> 독자 여러분.`,
      `안정적인 작화 퀄리티와 연재 체력 회복을 위해 부득이하게 ${nextEpisodeNumber}화 연재를 한 주 쉬어 가기로 결정했습니다.`,
      resumeLine,
      "기다려 주시는 독자님들께 감사드리며, 충전 후 더 좋은 원고로 인사드리겠습니다.",
    ].join("\n\n"),
    suggestedResumeDateIso: resumeDate,
    suggestedActionKo:
      "마감 긴급 경보 상태입니다. 담당 PD와 1주 휴재 또는 분량 완충 협의를 시작하고 위 공지 초안을 검토하세요.",
  };
}

/**
 * 연재 체력·마감 버퍼 상태를 분석해 2주 전 조기 경보(green/amber/red), 버퍼 일수, 주간 컷 할당, 공지 초안을 산출한다.
 */
export function planSerializationBuffer(input: SerializationBufferInput): SerializationBufferPlan {
  const seriesTitle = input.seriesTitle.trim() || "연재 작품";
  const nextEpisodeNumber = Math.max(1, Math.round(input.nextEpisodeNumber));
  const cutsPerEpisode = Math.max(10, Math.round(input.cutsPerEpisode));
  const currentEpisodeCompletedCuts = Math.round(
    clampSafe(input.currentEpisodeCompletedCuts, 0, cutsPerEpisode),
  );
  const daysUntilDeadline = Math.max(0, roundOne(input.daysUntilDeadline));
  const publishCadenceDays = Math.max(1, Math.round(input.publishCadenceDays ?? 7));
  const stockpiledCompletedEpisodes = Math.max(0, roundOne(input.stockpiledCompletedEpisodes));
  const creatorWeeklyRestDays = Math.round(clampSafe(input.creatorWeeklyRestDays ?? 1, 0, 3));
  const targetLeadWarningDays = Math.max(7, Math.round(input.targetLeadWarningDays ?? 14));

  const workDaysPerWeek = Math.max(1, 7 - creatorWeeklyRestDays);
  const workRatio = workDaysPerWeek / 7;

  const velocityRaw = computeWeightedCutVelocity(input.recentVelocity);
  const effectiveDailyCuts = roundOne(velocityRaw.avgCutsPerActiveDay * workRatio);
  const fatigueWarning =
    velocityRaw.weeklyWorkHoursEstimate !== null && velocityRaw.weeklyWorkHoursEstimate >= 60;

  const assistantEval = evaluateAssistantPipeline(input.assistantTasks ?? [], daysUntilDeadline);

  const remainingCutsForNextDeadline = Math.max(0, cutsPerEpisode - currentEpisodeCompletedCuts);
  const stockpiledBufferDays = roundOne(stockpiledCompletedEpisodes * publishCadenceDays);

  const creatorDaysNeeded =
    remainingCutsForNextDeadline === 0
      ? 0
      : effectiveDailyCuts > 0
        ? roundOne(remainingCutsForNextDeadline / effectiveDailyCuts)
        : null;

  const projectedDaysToFinishCurrent =
    creatorDaysNeeded === null
      ? null
      : roundOne(Math.max(creatorDaysNeeded, assistantEval.maxExpectedFinishDays));

  const projectedSlackDays =
    projectedDaysToFinishCurrent === null
      ? null
      : roundOne(daysUntilDeadline - projectedDaysToFinishCurrent);

  const deadlineShortfallDays =
    projectedSlackDays === null
      ? Math.max(publishCadenceDays, remainingCutsForNextDeadline > 0 ? publishCadenceDays : 0)
      : Math.max(0, -projectedSlackDays);

  const netBufferDaysAfterDeadline = roundOne(stockpiledBufferDays - deadlineShortfallDays);

  // 향후 2주(targetLeadWarningDays) 안에 도래하는 추가 마감 회차 수:
  // daysUntilDeadline + k * publishCadenceDays <= targetLeadWarningDays 를 만족하는 최대 정수 k
  const additionalCyclesInHorizon =
    targetLeadWarningDays >= daysUntilDeadline
      ? Math.floor((targetLeadWarningDays - daysUntilDeadline) / publishCadenceDays)
      : 0;
  const twoWeekRequiredCuts =
    remainingCutsForNextDeadline + additionalCyclesInHorizon * cutsPerEpisode;

  // 어시스턴트 병목이 있으면 향후 2주 유효 처리량에 페널티 계수(0.85)를 반영
  const pipelineEfficiency = assistantEval.bottlenecks.length > 0 ? 0.85 : 1;
  const twoWeekCapacityCuts = Math.round(
    effectiveDailyCuts * targetLeadWarningDays * pipelineEfficiency,
  );
  const twoWeekHorizonDeficitCuts = Math.max(0, twoWeekRequiredCuts - twoWeekCapacityCuts);

  const bottleneckReasons: string[] = [];
  if (effectiveDailyCuts === 0 && remainingCutsForNextDeadline > 0) {
    bottleneckReasons.push("최근 컷 완료 실적 데이터가 없어 마감 소요 일수를 보장할 수 없습니다.");
  }
  if (projectedSlackDays !== null && projectedSlackDays < 0) {
    bottleneckReasons.push(
      `현재 페이스(일 ${effectiveDailyCuts}컷) 기준 다음 마감보다 ${roundOne(-projectedSlackDays)}일 지연 예상`,
    );
  } else if (projectedSlackDays !== null && projectedSlackDays < 2) {
    bottleneckReasons.push(`다음 마감 여유가 ${projectedSlackDays}일로 2일 미만입니다.`);
  }
  if (stockpiledBufferDays < targetLeadWarningDays) {
    bottleneckReasons.push(
      `예비 원고 비축 버퍼가 ${stockpiledBufferDays}일로 권장 ${targetLeadWarningDays}일(2주)에 미달합니다.`,
    );
  }
  if (twoWeekHorizonDeficitCuts > 0) {
    bottleneckReasons.push(
      `향후 ${targetLeadWarningDays}일 기준 필요 컷 대비 ${twoWeekHorizonDeficitCuts}컷 부족 예상`,
    );
  }
  if (fatigueWarning && velocityRaw.weeklyWorkHoursEstimate !== null) {
    bottleneckReasons.push(
      `주간 예상 작업시간이 ${velocityRaw.weeklyWorkHoursEstimate}시간으로 과로 주의 구간(60시간 이상)입니다.`,
    );
  }
  for (const item of assistantEval.bottlenecks) {
    bottleneckReasons.push(item.reasonKo);
  }

  const hasBlockedNearDeadline =
    assistantEval.bottlenecks.some((item) => item.blocked) && daysUntilDeadline <= 5;
  const severeTwoWeekDeficit =
    twoWeekHorizonDeficitCuts > cutsPerEpisode * 0.45 &&
    stockpiledBufferDays < targetLeadWarningDays;

  let alertLevel: BufferAlertLevel = "green";
  if (
    (effectiveDailyCuts === 0 && remainingCutsForNextDeadline > 0) ||
    (projectedSlackDays !== null && projectedSlackDays < 0 && stockpiledBufferDays < publishCadenceDays) ||
    netBufferDaysAfterDeadline < 3 ||
    hasBlockedNearDeadline ||
    severeTwoWeekDeficit
  ) {
    alertLevel = "red";
  } else if (
    (projectedSlackDays !== null && projectedSlackDays < 2) ||
    stockpiledBufferDays < targetLeadWarningDays ||
    twoWeekHorizonDeficitCuts > 0 ||
    assistantEval.bottlenecks.length > 0 ||
    fatigueWarning
  ) {
    alertLevel = "amber";
  }

  const alertHeadlineKo =
    alertLevel === "red"
      ? `${nextEpisodeNumber}화 마감 병목 위험이 큽니다. 1주 휴재 또는 회차 분량 조정을 즉시 검토하세요.`
      : alertLevel === "amber"
        ? `2주 전 마감 완충 구간입니다. 예비 비축(${stockpiledBufferDays}일)과 분업 병목을 먼저 정리하세요.`
        : `예비 원고 ${stockpiledBufferDays}일 버퍼와 작업 페이스가 안정적입니다.`;

  // 권장 주간 컷 할당 (주간 휴식일 보장 + 2주 버퍼 회복 목표 반영)
  const baseWeeklyNeed = Math.ceil((cutsPerEpisode * 7) / publishCadenceDays);
  const bufferRecoveryWeeklyAdd =
    stockpiledBufferDays < targetLeadWarningDays
      ? Math.min(Math.ceil(cutsPerEpisode * 0.25), Math.ceil(((targetLeadWarningDays - stockpiledBufferDays) / 14) * cutsPerEpisode * 0.4))
      : 0;
  const recommendedWeeklyCuts = baseWeeklyNeed + bufferRecoveryWeeklyAdd;
  const recommendedDailyCuts = roundOne(recommendedWeeklyCuts / workDaysPerWeek);

  const currentWeeklyCapacity = effectiveDailyCuts * 7;
  const suggestedEpisodeCutCap =
    alertLevel !== "green" && currentWeeklyCapacity > 0 && recommendedWeeklyCuts > currentWeeklyCapacity * 1.25
      ? Math.max(35, Math.round((currentWeeklyCapacity * publishCadenceDays) / 7))
      : null;

  const noticeDraft = buildNoticeDraft({
    seriesTitle,
    nextEpisodeNumber,
    alertLevel,
    daysUntilDeadline,
    publishCadenceDays,
    referenceDateIso: input.referenceDateIso,
    suggestedEpisodeCutCap,
  });

  return {
    seriesTitle,
    nextEpisodeNumber,
    alertLevel,
    alertLabelKo: ALERT_LABEL_KO[alertLevel],
    alertHeadlineKo,
    bottleneckReasons,
    assistantBottlenecks: assistantEval.bottlenecks,
    velocity: {
      sampleDays: velocityRaw.sampleDays,
      avgCutsPerActiveDay: velocityRaw.avgCutsPerActiveDay,
      effectiveDailyCuts,
      weeklyWorkHoursEstimate: velocityRaw.weeklyWorkHoursEstimate,
      fatigueWarning,
      assistantProgressPct: assistantEval.assistantProgressPct,
      assistantDelayDays: assistantEval.assistantDelayDays,
    },
    buffer: {
      remainingCutsForNextDeadline,
      stockpiledBufferDays,
      projectedDaysToFinishCurrent,
      projectedSlackDays,
      netBufferDaysAfterDeadline,
      twoWeekRequiredCuts,
      twoWeekCapacityCuts,
      twoWeekHorizonDeficitCuts,
    },
    recommendation: {
      recommendedWorkDaysPerWeek: workDaysPerWeek,
      recommendedWeeklyCuts,
      recommendedDailyCuts,
      suggestedEpisodeCutCap,
      stageAllocations: buildStageAllocations(recommendedWeeklyCuts),
    },
    noticeDraft,
  };
}
