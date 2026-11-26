/**
 * #25 스트로크 이력 기반 마감 ETA 및 병목 예측기(predictDeadlineEtaFromHistory).
 *
 * - 과거 컷별 공정 로그(`lineart` · `flatting` · `bg` · `lettering`)에서
 *   이상치를 억제한 최근 가중 작업 속도와 보수적 P85 소요 시간을 산출한다.
 * - 잔여 컷의 단계별 남은 시간과 핵심 병목 공정을 식별하고,
 *   마감 초과 위험이 감지되면 즉각 조기 경보와 구체적 시간 단축 전략(단축 예상 시간 포함)을 제안한다.
 */

export type ProductionStage = "lineart" | "flatting" | "bg" | "lettering";

export const PRODUCTION_STAGES: readonly ProductionStage[] = [
  "lineart",
  "flatting",
  "bg",
  "lettering",
];

export interface CutStageHistoryEntry {
  readonly cutId: string;
  readonly stage: ProductionStage;
  readonly durationMinutes: number;
  readonly strokeCount: number;
  /** 컷 복잡도 가중치(기본 1.0, 군중/액션 컷은 1.5~2.5). */
  readonly complexityWeight?: number;
  readonly completedAtMs: number;
}

export interface RemainingCutWorkItem {
  readonly cutId: string;
  readonly remainingStages: readonly ProductionStage[];
  readonly complexityWeight?: number;
  readonly has3dBackground?: boolean;
  readonly dialogueBalloonCount?: number;
}

export interface DeadlineEtaInput {
  readonly episodeId: string;
  readonly nowMs: number;
  readonly deadlineMs: number;
  /** 하루 가용 작업 시간(기본 8시간). */
  readonly dailyWorkingHours?: number;
  /** 직접 지정한 잔여 가용 작업 시간(지정 시 날짜 환산 대신 우선 사용). */
  readonly availableWorkingHoursOverride?: number;
  readonly historicalCutLogs: readonly CutStageHistoryEntry[];
  readonly remainingCuts: readonly RemainingCutWorkItem[];
}

export interface StageEtaBreakdown {
  readonly stage: ProductionStage;
  readonly sampleCount: number;
  readonly confidence: "low" | "medium" | "high";
  readonly minutesPerUnitComplexityP50: number;
  readonly minutesPerUnitComplexityP85: number;
  readonly strokesPerMinute: number;
  readonly remainingCutCount: number;
  readonly remainingHoursP50: number;
  readonly remainingHoursP85: number;
  readonly shareOfTotalPct: number;
}

export interface DeadlineShortcutRecommendation {
  readonly actionCode:
    | "REUSE_3D_BG_OR_SMART_SYMBOL"
    | "BATCH_AUTO_FLAT_OR_DELEGATE_SUBCANVAS"
    | "GLOBAL_SYMBOL_AND_DISTANT_LINE_SIMPLIFY"
    | "BATCH_SCRIPT_LETTERING_TEMPLATES";
  readonly targetStage: ProductionStage;
  readonly titleKo: string;
  readonly rationaleKo: string;
  readonly estimatedHoursSaved: number;
  readonly qualityTradeoff: "none" | "minimal" | "moderate";
}

export type DeadlineRiskLevel = "on-track" | "tight" | "warning" | "critical-overrun";

export interface DeadlineEtaPredictionReport {
  readonly episodeId: string;
  readonly availableWorkingHours: number;
  readonly estimatedTotalHoursP50: number;
  readonly estimatedTotalHoursP85: number;
  readonly slackHoursP50: number;
  readonly overrunHoursP50: number;
  readonly overrunHoursP85: number;
  readonly predictedCompletionMsP50: number;
  readonly predictedCompletionMsP85: number;
  readonly riskLevel: DeadlineRiskLevel;
  readonly overrunWarningTriggered: boolean;
  readonly warningMessageKo: string | null;
  readonly bottleneckStage: ProductionStage;
  readonly stageBreakdown: Readonly<Record<ProductionStage, StageEtaBreakdown>>;
  readonly recommendations: readonly DeadlineShortcutRecommendation[];
  readonly projectedHoursAfterShortcutsP50: number;
  readonly canRecoverDeadlineWithShortcuts: boolean;
}

const DEFAULT_PRIOR_MINUTES_PER_UNIT: Readonly<Record<ProductionStage, number>> = {
  lineart: 22,
  flatting: 14,
  bg: 18,
  lettering: 6,
};

function clampComplexity(weight?: number): number {
  if (weight === undefined || !Number.isFinite(weight) || weight <= 0) {
    return 1;
  }
  return Math.max(0.25, Math.min(5, weight));
}

function computeQuantileSorted(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const frac = pos - base;
  const next = Math.min(sorted.length - 1, base + 1);
  return sorted[base] + (sorted[next] - sorted[base]) * frac;
}

/**
 * 이상치(MAD 기반 AFK 스파이크)를 윈저라이즈한 뒤 최근성 가중 평균과 P85 분위를 계산한다.
 */
function estimateStageVelocity(
  stage: ProductionStage,
  entries: readonly CutStageHistoryEntry[],
): {
  readonly sampleCount: number;
  readonly confidence: "low" | "medium" | "high";
  readonly p50Minutes: number;
  readonly p85Minutes: number;
  readonly strokesPerMinute: number;
} {
  const valid = entries
    .filter((entry) => Number.isFinite(entry.durationMinutes) && entry.durationMinutes > 0)
    .slice()
    .sort((a, b) => a.completedAtMs - b.completedAtMs);

  if (valid.length === 0) {
    const prior = DEFAULT_PRIOR_MINUTES_PER_UNIT[stage];
    return {
      sampleCount: 0,
      confidence: "low",
      p50Minutes: prior,
      p85Minutes: Number((prior * 1.3).toFixed(2)),
      strokesPerMinute: stage === "lettering" ? 4 : 18,
    };
  }

  const normalizedRates = valid.map(
    (entry) => entry.durationMinutes / clampComplexity(entry.complexityWeight),
  );
  const sortedRates = normalizedRates.slice().sort((a, b) => a - b);

  // 중앙값 + MAD(50% 붕괴점) 상한 캡으로 소표본에서도 자리비움(AFK) 스파이크 왜곡 방지
  let upperCap = sortedRates[sortedRates.length - 1];
  if (sortedRates.length >= 3) {
    const median = computeQuantileSorted(sortedRates, 0.5);
    const absDevs = sortedRates.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
    const mad = computeQuantileSorted(absDevs, 0.5);
    const robustSigma = Math.max(1.4826 * mad, median * 0.15, 1);
    upperCap = median + 2.5 * robustSigma;
  }

  const winsorized = normalizedRates.map((rate) => Math.min(rate, upperCap));
  const sortedWinsorized = winsorized.slice().sort((a, b) => a - b);

  // 최근 완료 컷에 더 큰 가중치를 부여(선형 증가 1.0 -> 1.8)
  let weightedSum = 0;
  let weightTotal = 0;
  let totalStrokes = 0;
  let totalDurationMin = 0;

  for (let i = 0; i < winsorized.length; i += 1) {
    const recencyWeight =
      winsorized.length === 1 ? 1 : 1 + (0.8 * i) / (winsorized.length - 1);
    weightedSum += winsorized[i] * recencyWeight;
    weightTotal += recencyWeight;
    totalStrokes += Math.max(0, valid[i].strokeCount);
    totalDurationMin += Math.min(valid[i].durationMinutes, upperCap * clampComplexity(valid[i].complexityWeight));
  }

  const p50Minutes = weightedSum / Math.max(weightTotal, 1e-6);
  const rawP85 = computeQuantileSorted(sortedWinsorized, 0.85);
  const p85Minutes = Math.max(p50Minutes * 1.12, rawP85);
  const strokesPerMinute =
    totalDurationMin > 0 ? totalStrokes / totalDurationMin : 0;

  const confidence: "low" | "medium" | "high" =
    valid.length >= 5 ? "high" : valid.length >= 2 ? "medium" : "low";

  return {
    sampleCount: valid.length,
    confidence,
    p50Minutes: Number(p50Minutes.toFixed(2)),
    p85Minutes: Number(p85Minutes.toFixed(2)),
    strokesPerMinute: Number(strokesPerMinute.toFixed(2)),
  };
}

function buildStageRecommendation(
  stage: ProductionStage,
  stageHours: number,
  has3dBgCount: number,
): DeadlineShortcutRecommendation {
  if (stage === "bg") {
    const saveRatio = has3dBgCount > 0 ? 0.42 : 0.32;
    return {
      actionCode: "REUSE_3D_BG_OR_SMART_SYMBOL",
      targetStage: "bg",
      titleKo: "배경 3D 스냅샷·글로벌 스마트 심볼 재사용 전환",
      rationaleKo:
        has3dBgCount > 0
          ? `3D 배경 포함 ${has3dBgCount}개 컷의 카메라 프리셋 재활용과 원경 실루엣 단순화로 배경 공정 시간을 대폭 절감합니다.`
          : "반복 배경 소품을 글로벌 스마트 심볼로 묶고 원경 컷은 톤 실루엣 처리해 배경 병목을 해소합니다.",
      estimatedHoursSaved: Number((stageHours * saveRatio).toFixed(2)),
      qualityTradeoff: "minimal",
    };
  }
  if (stage === "flatting") {
    return {
      actionCode: "BATCH_AUTO_FLAT_OR_DELEGATE_SUBCANVAS",
      targetStage: "flatting",
      titleKo: "밑색 닫힌 영역 일괄 채우기 또는 서브캔버스 어시스턴트 위임",
      rationaleKo:
        "캐릭터 팔레트 일괄 자동 채우기 및 밑색 레이어만 분리 위임(서브캔버스)해 메인 작가의 마감 병목을 제거합니다.",
      estimatedHoursSaved: Number((stageHours * 0.45).toFixed(2)),
      qualityTradeoff: "none",
    };
  }
  if (stage === "lineart") {
    return {
      actionCode: "GLOBAL_SYMBOL_AND_DISTANT_LINE_SIMPLIFY",
      targetStage: "lineart",
      titleKo: "반복 소품 심볼화 및 원경/액션 컷 선화 디테일 단계 축소",
      rationaleKo:
        "반복 의상 장식·소품을 스마트 심볼로 연결하고 풀샷/원경 컷의 잔선 묘사를 줄여 선화 속도를 확보합니다.",
      estimatedHoursSaved: Number((stageHours * 0.25).toFixed(2)),
      qualityTradeoff: "minimal",
    };
  }
  return {
    actionCode: "BATCH_SCRIPT_LETTERING_TEMPLATES",
    targetStage: "lettering",
    titleKo: "대사 스크립트 일괄 임포트 및 말풍선 템플릿 배치 적용",
    rationaleKo:
      "원고 대본을 컷별 말풍선 템플릿에 일괄 바인딩해 수동 식자·폰트 조정 시간을 줄입니다.",
    estimatedHoursSaved: Number((stageHours * 0.4).toFixed(2)),
    qualityTradeoff: "none",
  };
}

/**
 * 과거 컷별 스트로크·작업 시간 로그에서 단계별 마감 ETA와 병목/단축 권고안을 예측한다.
 */
export function predictDeadlineEtaFromHistory(
  input: DeadlineEtaInput,
): DeadlineEtaPredictionReport {
  const dailyWorkingHours = Math.max(1, Math.min(20, input.dailyWorkingHours ?? 8));
  const remainingWallMs = Math.max(0, input.deadlineMs - input.nowMs);
  const availableWorkingHours =
    input.availableWorkingHoursOverride !== undefined
      ? Math.max(0, input.availableWorkingHoursOverride)
      : Number(((remainingWallMs / 86_400_000) * dailyWorkingHours).toFixed(2));

  const logsByStage: Record<ProductionStage, CutStageHistoryEntry[]> = {
    lineart: [],
    flatting: [],
    bg: [],
    lettering: [],
  };
  for (let i = 0; i < input.historicalCutLogs.length; i += 1) {
    const entry = input.historicalCutLogs[i];
    logsByStage[entry.stage].push(entry);
  }

  const remainingWeightByStage: Record<ProductionStage, number> = {
    lineart: 0,
    flatting: 0,
    bg: 0,
    lettering: 0,
  };
  const remainingCutCountByStage: Record<ProductionStage, number> = {
    lineart: 0,
    flatting: 0,
    bg: 0,
    lettering: 0,
  };
  let cutsWith3dBg = 0;

  for (let i = 0; i < input.remainingCuts.length; i += 1) {
    const cut = input.remainingCuts[i];
    const baseWeight = clampComplexity(cut.complexityWeight);
    if (cut.has3dBackground) {
      cutsWith3dBg += 1;
    }
    const seenStages = new Set<ProductionStage>();
    for (let s = 0; s < cut.remainingStages.length; s += 1) {
      const stage = cut.remainingStages[s];
      if (seenStages.has(stage)) continue;
      seenStages.add(stage);

      let stageWeight = baseWeight;
      if (stage === "lettering" && cut.dialogueBalloonCount !== undefined) {
        stageWeight = Math.max(0.5, cut.dialogueBalloonCount / 3);
      }
      remainingWeightByStage[stage] += stageWeight;
      remainingCutCountByStage[stage] += 1;
    }
  }

  const rawBreakdown = {} as Record<ProductionStage, StageEtaBreakdown>;
  let totalP50Hours = 0;
  let totalP85Hours = 0;

  for (let i = 0; i < PRODUCTION_STAGES.length; i += 1) {
    const stage = PRODUCTION_STAGES[i];
    const velocity = estimateStageVelocity(stage, logsByStage[stage]);
    const hoursP50 = (remainingWeightByStage[stage] * velocity.p50Minutes) / 60;
    const hoursP85 = (remainingWeightByStage[stage] * velocity.p85Minutes) / 60;
    totalP50Hours += hoursP50;
    totalP85Hours += hoursP85;

    rawBreakdown[stage] = {
      stage,
      sampleCount: velocity.sampleCount,
      confidence: velocity.confidence,
      minutesPerUnitComplexityP50: velocity.p50Minutes,
      minutesPerUnitComplexityP85: velocity.p85Minutes,
      strokesPerMinute: velocity.strokesPerMinute,
      remainingCutCount: remainingCutCountByStage[stage],
      remainingHoursP50: Number(hoursP50.toFixed(2)),
      remainingHoursP85: Number(hoursP85.toFixed(2)),
      shareOfTotalPct: 0,
    };
  }

  let bottleneckStage: ProductionStage = "lineart";
  let maxStageHours = -1;
  const stageBreakdown = {} as Record<ProductionStage, StageEtaBreakdown>;

  for (let i = 0; i < PRODUCTION_STAGES.length; i += 1) {
    const stage = PRODUCTION_STAGES[i];
    const item = rawBreakdown[stage];
    const share =
      totalP50Hours > 0 ? Number(((item.remainingHoursP50 / totalP50Hours) * 100).toFixed(1)) : 0;
    stageBreakdown[stage] = {
      ...item,
      shareOfTotalPct: share,
    };
    if (item.remainingHoursP50 > maxStageHours) {
      maxStageHours = item.remainingHoursP50;
      bottleneckStage = stage;
    }
  }

  const estimatedTotalHoursP50 = Number(totalP50Hours.toFixed(2));
  const estimatedTotalHoursP85 = Number(totalP85Hours.toFixed(2));
  const slackHoursP50 = Number((availableWorkingHours - estimatedTotalHoursP50).toFixed(2));
  const overrunHoursP50 = Number(Math.max(0, estimatedTotalHoursP50 - availableWorkingHours).toFixed(2));
  const overrunHoursP85 = Number(Math.max(0, estimatedTotalHoursP85 - availableWorkingHours).toFixed(2));

  const workRatio = 24 / dailyWorkingHours;
  const predictedCompletionMsP50 = Math.round(
    input.nowMs + estimatedTotalHoursP50 * workRatio * 3_600_000,
  );
  const predictedCompletionMsP85 = Math.round(
    input.nowMs + estimatedTotalHoursP85 * workRatio * 3_600_000,
  );

  let riskLevel: DeadlineRiskLevel = "on-track";
  if (overrunHoursP50 > 0) {
    riskLevel = "critical-overrun";
  } else if (overrunHoursP85 > 0) {
    riskLevel = "warning";
  } else if (availableWorkingHours > 0 && slackHoursP50 < availableWorkingHours * 0.15) {
    riskLevel = "tight";
  }

  const overrunWarningTriggered = riskLevel === "critical-overrun" || riskLevel === "warning";
  let warningMessageKo: string | null = null;
  if (riskLevel === "critical-overrun") {
    warningMessageKo = `마감 초과 위험: 예상 잔여 작업(${estimatedTotalHoursP50}h)이 가용 시간(${availableWorkingHours}h)을 ${overrunHoursP50}h 초과합니다. 핵심 병목은 '${bottleneckStage}' 공정입니다.`;
  } else if (riskLevel === "warning") {
    warningMessageKo = `마감 조기 경보: 보수적 추정치(P85 ${estimatedTotalHoursP85}h) 기준 ${overrunHoursP85}h 지연 우려가 있습니다. '${bottleneckStage}' 공정 선제 단축을 권장합니다.`;
  }

  // 잔여 시간이 큰 공정 순으로 구체적 단축 권고안 생성
  const activeStagesDesc = PRODUCTION_STAGES.filter(
    (stage) => stageBreakdown[stage].remainingHoursP50 > 0,
  ).sort((a, b) => stageBreakdown[b].remainingHoursP50 - stageBreakdown[a].remainingHoursP50);

  const recommendations: DeadlineShortcutRecommendation[] = [];
  const recLimit = overrunWarningTriggered ? 3 : 1;
  for (let i = 0; i < activeStagesDesc.length && recommendations.length < recLimit; i += 1) {
    const stage = activeStagesDesc[i];
    recommendations.push(
      buildStageRecommendation(stage, stageBreakdown[stage].remainingHoursP50, cutsWith3dBg),
    );
  }

  const totalSavedHours = recommendations.reduce((sum, rec) => sum + rec.estimatedHoursSaved, 0);
  const projectedHoursAfterShortcutsP50 = Number(
    Math.max(0, estimatedTotalHoursP50 - totalSavedHours).toFixed(2),
  );
  const canRecoverDeadlineWithShortcuts =
    projectedHoursAfterShortcutsP50 <= availableWorkingHours;

  return {
    episodeId: input.episodeId,
    availableWorkingHours,
    estimatedTotalHoursP50,
    estimatedTotalHoursP85,
    slackHoursP50,
    overrunHoursP50,
    overrunHoursP85,
    predictedCompletionMsP50,
    predictedCompletionMsP85,
    riskLevel,
    overrunWarningTriggered,
    warningMessageKo,
    bottleneckStage,
    stageBreakdown,
    recommendations,
    projectedHoursAfterShortcutsP50,
    canRecoverDeadlineWithShortcuts,
  };
}
