import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";
import {
  productionTaskProgressPercent,
  remainingProductionTaskHours,
  type ProductionProjectAggregate,
  type ProductionTask,
  type ProductionTaskStatus,
} from "@toonstudio/core/production";

/**
 * 마감 위험 예보 (REPORT T-1).
 *
 * 이번 회차의 공정 진행 속도를 지난 회차(최대 4화) 실측 소요와 비교해
 * 여유/주의/위험 구간으로만 표시한다. 단정적 예측(확률·확정 문구)은 만들지 않으며,
 * 모든 구간 판정에는 근거 수치를 함께 싣는다. 실측이 부족하면 구간을 지어내지 않고
 * "insufficient-data"로 돌려 표면이 근거 부족을 그대로 보여 주게 한다.
 *
 * 실측의 정의: 지난 회차 작업 중 시작(startedAt)과 완료(completedAt)가 모두 있고
 * 상태가 approved/done인 작업의 실제 소요 시간. 타임스탬프가 없는 작업은
 * 실측에서 제외하되, 제외된 사실은 근거 문구에 건수로 드러낸다.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** 근거로 쓰는 지난 회차 수 상한. REPORT T-1의 "지난 4화 평균" 기준. */
export const DEADLINE_RISK_HISTORY_EPISODE_LIMIT = 4;
/** 구간을 매길 최소 실측 건수. 이보다 적으면 예보 대신 근거 부족으로 표시한다. */
export const DEADLINE_RISK_MIN_SAMPLE_TASKS = 3;

const COMPLETE_TASK_STATUSES = new Set<ProductionTaskStatus>([
  "approved",
  "done",
  "cancelled",
  "out-of-scope",
]);
const MEASURED_TASK_STATUSES = new Set<ProductionTaskStatus>(["approved", "done"]);

export type DeadlineRiskBand = "comfortable" | "caution" | "risk" | "insufficient-data";

export const DEADLINE_RISK_BAND_LABELS: Readonly<Record<DeadlineRiskBand, string>> = {
  comfortable: "여유 구간",
  caution: "주의 구간",
  risk: "위험 구간",
  "insufficient-data": "근거 부족",
};

export const DEADLINE_RISK_BAND_LABELS_EN: Readonly<Record<DeadlineRiskBand, string>> = {
  comfortable: "Comfortable range",
  caution: "Caution range",
  risk: "Risk range",
  "insufficient-data": "Not enough data",
};

/** 모든 예보에 고정으로 붙는 고지. 확정 예측이 아니라는 점을 문구 자체로 못 박는다. */
export const DEADLINE_RISK_FORECAST_NOTE =
  "이 표시는 지난 회차 실측과 현재 진행 상황을 비교한 구간 안내입니다. 확정된 예측이 아니며 실제 소요는 회차마다 달라질 수 있습니다.";

export interface DeadlineRiskProcessHistory {
  readonly processKey: string;
  readonly label: string;
  readonly sampleCount: number;
  readonly meanHours: number;
}

export interface DeadlineRiskHistoryBasis {
  /** 실측이 있는 지난 회차 수 (상한 DEADLINE_RISK_HISTORY_EPISODE_LIMIT). */
  readonly episodeCount: number;
  readonly sampleTaskCount: number;
  /** 시작·완료 시각이 없어 실측에서 제외된 지난 회차 완료 작업 수. */
  readonly unmeasuredTaskCount: number;
  /** 공정별 평균 소요의 합 = 지난 회차 한 화가 평균적으로 쓴 공정 시간. */
  readonly meanEpisodeTotalHours: number | null;
  readonly perProcess: readonly DeadlineRiskProcessHistory[];
}

export interface DeadlineRiskOverrun {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly processKey: string;
  readonly elapsedHours: number;
  readonly meanHours: number;
}

export interface DeadlineRiskCurrentBasis {
  readonly totalTasks: number;
  readonly completedTasks: number;
  readonly remainingTaskCount: number;
  /** 계획 공수 기준 잔여 시간 (remainingProductionTaskHours 합). */
  readonly remainingHoursByPlan: number;
  /** 지난 실측 평균으로 환산한 잔여 시간. 실측이 없는 공정은 계획 공수로 채운다. */
  readonly projectedRemainingHours: number;
  readonly historyCoveredRemainingTasks: number;
  readonly daysUntilRelease: number | null;
  readonly availableHours: number | null;
  readonly assigneeCount: number;
  /** projectedRemainingHours / availableHours. 가용을 계산할 수 없으면 null. */
  readonly loadRatio: number | null;
  readonly overdueTaskCount: number;
  readonly overruns: readonly DeadlineRiskOverrun[];
}

export interface DeadlineRiskForecast {
  readonly episodeId: string;
  readonly releaseAt: string | null;
  readonly band: DeadlineRiskBand;
  readonly history: DeadlineRiskHistoryBasis;
  readonly current: DeadlineRiskCurrentBasis;
  /** 근거 수치 문장. 구간만 단독으로 표시되지 않도록 항상 숫자를 포함한다. */
  readonly evidence: readonly string[];
  readonly note: string;
}

function round(value: number, digits = 1): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function episodeTasks(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
): readonly ProductionTask[] {
  return aggregate.tasks.filter(
    (task) => task.scope.kind === "episode" && task.scope.id === episodeId,
  );
}

function processLabel(aggregate: ProductionProjectAggregate, canonicalKey: string): string {
  const step = aggregate.workflowProfile?.steps.find(
    (entry) => canonicalProductionProcessKey(entry.key) === canonicalKey,
  );
  return step?.name ?? canonicalKey;
}

interface MeasuredEpisode {
  readonly episodeId: string;
  readonly latestCompletedMs: number;
  readonly durationsByProcess: ReadonlyMap<string, readonly number[]>;
  readonly unmeasuredTaskCount: number;
}

function measurePastEpisodes(
  aggregate: ProductionProjectAggregate,
  targetEpisodeId: string,
): readonly MeasureEpisode[] {
  const byEpisode = new Map<string, {
    latestCompletedMs: number;
    durationsByProcess: Map<string, number[]>;
    unmeasuredTaskCount: number;
  }>();
  for (const task of aggregate.tasks) {
    if (task.scope.kind !== "episode" || task.scope.id === targetEpisodeId) continue;
    if (!MEASURED_TASK_STATUSES.has(task.status)) continue;
    const startedMs = parseMs(task.startedAt);
    const completedMs = parseMs(task.completedAt);
    const entry = byEpisode.get(task.scope.id) ?? {
      latestCompletedMs: Number.NEGATIVE_INFINITY,
      durationsByProcess: new Map<string, number[]>(),
      unmeasuredTaskCount: 0,
    };
    if (startedMs === null || completedMs === null || completedMs <= startedMs) {
      entry.unmeasuredTaskCount += 1;
    } else {
      const key = canonicalProductionProcessKey(task.processKey);
      const durations = entry.durationsByProcess.get(key) ?? [];
      durations.push((completedMs - startedMs) / HOUR_MS);
      entry.durationsByProcess.set(key, durations);
      entry.latestCompletedMs = Math.max(entry.latestCompletedMs, completedMs);
    }
    byEpisode.set(task.scope.id, entry);
  }
  return [...byEpisode.entries()]
    .filter(([, entry]) => [...entry.durationsByProcess.values()].some((list) => list.length > 0))
    .sort((left, right) => right[1].latestCompletedMs - left[1].latestCompletedMs)
    .slice(0, DEADLINE_RISK_HISTORY_EPISODE_LIMIT)
    .map(([episodeId, entry]) => ({
      episodeId,
      latestCompletedMs: entry.latestCompletedMs,
      durationsByProcess: entry.durationsByProcess,
      unmeasuredTaskCount: entry.unmeasuredTaskCount,
    }));
}

function buildHistoryBasis(
  aggregate: ProductionProjectAggregate,
  measured: readonly MeasureEpisode[],
): DeadlineRiskHistoryBasis {
  const durationsByProcess = new Map<string, number[]>();
  let sampleTaskCount = 0;
  let unmeasuredTaskCount = 0;
  for (const episode of measured) {
    unmeasuredTaskCount += episode.unmeasuredTaskCount;
    for (const [key, durations] of episode.durationsByProcess) {
      const merged = durationsByProcess.get(key) ?? [];
      merged.push(...durations);
      durationsByProcess.set(key, merged);
      sampleTaskCount += durations.length;
    }
  }
  const perProcess = [...durationsByProcess.entries()]
    .map(([processKey, durations]) => ({
      processKey,
      label: processLabel(aggregate, processKey),
      sampleCount: durations.length,
      meanHours: round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
    }))
    .sort((left, right) => right.meanHours - left.meanHours || left.processKey.localeCompare(right.processKey));
  return {
    episodeCount: measured.length,
    sampleTaskCount,
    unmeasuredTaskCount,
    meanEpisodeTotalHours: perProcess.length > 0
      ? round(perProcess.reduce((sum, entry) => sum + entry.meanHours, 0))
      : null,
    perProcess,
  };
}

function releaseAtFor(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
  tasks: readonly ProductionTask[],
): string | null {
  const episode = aggregate.episodes.find((entry) => entry.episodeId === episodeId);
  if (episode?.plannedReleaseAt) return episode.plannedReleaseAt;
  const publication = tasks
    .filter((task) => task.processKey === "publication" && task.status !== "cancelled")
    .sort((left, right) => (parseMs(left.dueAt) ?? Number.MAX_SAFE_INTEGER) - (parseMs(right.dueAt) ?? Number.MAX_SAFE_INTEGER))[0];
  return publication?.dueAt ?? null;
}

/**
 * 회차 하나의 마감 위험 예보를 만든다.
 * 회차가 없거나 이미 게시된 회차면 예보 대상이 아니므로 null을 돌려준다.
 */
export function buildDeadlineRiskForecast(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
  now = new Date(),
): DeadlineRiskForecast | null {
  const episode = aggregate.episodes.find((entry) => entry.episodeId === episodeId);
  if (!episode || episode.state === "published") return null;
  const nowMs = now.getTime();
  const tasks = episodeTasks(aggregate, episodeId);
  const releaseAt = releaseAtFor(aggregate, episodeId, tasks);
  const history = buildHistoryBasis(aggregate, measurePastEpisodes(aggregate, episodeId));
  const meanByProcess = new Map(history.perProcess.map((entry) => [entry.processKey, entry.meanHours]));

  const completedTasks = tasks.filter((task) => COMPLETE_TASK_STATUSES.has(task.status)).length;
  const remainingTasks = tasks.filter((task) => !COMPLETE_TASK_STATUSES.has(task.status));
  let projectedRemainingHours = 0;
  let historyCoveredRemainingTasks = 0;
  const overruns: DeadlineRiskOverrun[] = [];
  for (const task of remainingTasks) {
    const canonicalKey = canonicalProductionProcessKey(task.processKey);
    const meanHours = meanByProcess.get(canonicalKey);
    if (meanHours !== undefined) {
      historyCoveredRemainingTasks += 1;
      projectedRemainingHours += meanHours * (1 - productionTaskProgressPercent(task) / 100);
    } else {
      projectedRemainingHours += remainingProductionTaskHours(task);
    }
    const startedMs = parseMs(task.startedAt);
    if (meanHours !== undefined && startedMs !== null && startedMs <= nowMs) {
      const elapsedHours = round((nowMs - startedMs) / HOUR_MS);
      if (elapsedHours >= meanHours) {
        overruns.push({
          taskId: task.id,
          taskTitle: task.title,
          processKey: canonicalKey,
          elapsedHours,
          meanHours,
        });
      }
    }
  }
  projectedRemainingHours = round(projectedRemainingHours);
  const remainingHoursByPlan = round(
    remainingTasks.reduce((sum, task) => sum + remainingProductionTaskHours(task), 0),
  );
  const daysUntilRelease = releaseAt
    ? Math.ceil(((parseMs(releaseAt) ?? nowMs) - nowMs) / DAY_MS)
    : null;
  const assigneeIds = new Set<string>();
  for (const task of remainingTasks) {
    for (const assignmentId of task.assignmentIds) assigneeIds.add(assignmentId);
  }
  const assigneeCount = Math.max(1, assigneeIds.size);
  const availableHours = daysUntilRelease === null
    ? null
    : Math.max(0, daysUntilRelease) * 8 * assigneeCount;
  const loadRatio = availableHours !== null && availableHours > 0
    ? round(projectedRemainingHours / availableHours, 2)
    : null;
  const overdueTaskCount = remainingTasks.filter((task) => {
    const dueMs = parseMs(task.dueAt);
    return dueMs !== null && dueMs < nowMs;
  }).length;

  const current: DeadlineRiskCurrentBasis = {
    totalTasks: tasks.length,
    completedTasks,
    remainingTaskCount: remainingTasks.length,
    remainingHoursByPlan,
    projectedRemainingHours,
    historyCoveredRemainingTasks,
    daysUntilRelease,
    availableHours,
    assigneeCount,
    loadRatio,
    overdueTaskCount,
    overruns,
  };

  const evidence: string[] = [];
  if (history.episodeCount > 0 && history.meanEpisodeTotalHours !== null) {
    evidence.push(
      `지난 ${history.episodeCount}화 실측 ${history.sampleTaskCount}건 기준, 한 화의 공정별 평균 소요 합계는 약 ${history.meanEpisodeTotalHours}시간입니다`,
    );
    const slowest = history.perProcess[0];
    if (slowest) {
      evidence.push(
        `가장 오래 걸린 공정은 ${slowest.label}로 평균 약 ${slowest.meanHours}시간입니다 (실측 ${slowest.sampleCount}건)`,
      );
    }
  } else {
    evidence.push(
      `지난 회차 실측이 ${history.sampleTaskCount}건이라 평균 소요를 계산할 근거가 아직 없습니다`,
    );
  }
  if (history.unmeasuredTaskCount > 0) {
    evidence.push(
      `시작·완료 시각이 없어 실측에서 제외된 지난 회차 작업이 ${history.unmeasuredTaskCount}건 있습니다`,
    );
  }

  const insufficient =
    history.episodeCount === 0
    || history.sampleTaskCount < DEADLINE_RISK_MIN_SAMPLE_TASKS
    || releaseAt === null
    || tasks.length === 0;

  let band: DeadlineRiskBand;
  if (insufficient) {
    band = "insufficient-data";
    if (releaseAt === null) evidence.push("게시 마감이 정해지지 않아 남은 기간과 비교할 수 없습니다");
    if (tasks.length === 0) evidence.push("이번 회차에 등록된 공정이 없어 진행 속도를 잴 수 없습니다");
  } else if (remainingTasks.length === 0) {
    band = "comfortable";
    evidence.push(`등록된 공정 ${tasks.length}건이 모두 마무리 단계입니다`);
  } else {
    if (availableHours !== null && loadRatio !== null && daysUntilRelease !== null) {
      evidence.push(
        `남은 공정 ${remainingTasks.length}건의 환산 소요는 약 ${projectedRemainingHours}시간, 마감까지 가용은 약 ${availableHours}시간(담당 ${assigneeCount}명 × 남은 ${Math.max(0, daysUntilRelease)}일 × 8시간)으로 가용 대비 약 ${Math.round(loadRatio * 100)}%입니다`,
      );
    }
    if (historyCoveredRemainingTasks < remainingTasks.length) {
      evidence.push(
        `지난 실측이 없는 공정 ${remainingTasks.length - historyCoveredRemainingTasks}건은 계획 공수(약 ${remainingHoursByPlan}시간 합계 기준)로 환산했습니다`,
      );
    }
    for (const overrun of overruns.slice(0, 3)) {
      evidence.push(
        `${overrun.taskTitle} 공정이 시작 후 약 ${overrun.elapsedHours}시간 진행 중으로, 지난 평균 약 ${overrun.meanHours}시간과 같거나 그 이상 걸리고 있습니다`,
      );
    }
    if (overdueTaskCount > 0) {
      evidence.push(`작업 마감 기한이 지난 공정이 ${overdueTaskCount}건 있습니다`);
    }
    const severeOverrun = overruns.some((overrun) => overrun.elapsedHours >= overrun.meanHours * 1.5);
    if ((loadRatio !== null && loadRatio > 1) || (daysUntilRelease !== null && daysUntilRelease < 0) || severeOverrun) {
      band = "risk";
    } else if (
      (loadRatio !== null && loadRatio >= 0.75)
      || overruns.length > 0
      || overdueTaskCount > 0
    ) {
      band = "caution";
    } else {
      band = "comfortable";
    }
  }

  return {
    episodeId,
    releaseAt,
    band,
    history,
    current,
    evidence,
    note: DEADLINE_RISK_FORECAST_NOTE,
  };
}
