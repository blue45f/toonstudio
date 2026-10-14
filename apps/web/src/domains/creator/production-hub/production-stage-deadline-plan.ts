/**
 * 연재 캘린더 ↔ 제작 진척 연동 — 게시 일정 역산 모델 (순수 함수).
 *
 * 게시일(연재 캘린더 예약 → 회차 게시 계획 → 게시 작업 마감 순으로 해석)에서
 * 단계별 권장 마감을 역산해 회차 흐름에 보여 줄 계획을 만든다. 역산 간격은
 * 회차 파이프라인 템플릿의 daysBeforeRelease를 그대로 쓰므로, 공정 재배치
 * (buildEpisodePipelinePlan)가 작업 dueAt에 심는 날짜와 권장 마감이 어긋나지
 * 않는다. 버퍼는 "게시일까지 남은 일수 − 가장 이른 미완료 단계가 필요로 하는
 * 선행 일수"로 정의한다: 음수면 권장 일정이 이미 무너진 것이고, 0~2일이면
 * 게시를 미루거나 단계를 병행하지 않는 한 여유가 없다는 경고 대상이다.
 *
 * 게시일이 없으면 권장 마감을 지어내지 않고 unplanned로 정직하게 돌려준다.
 */

import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";
import type {
  EpisodeCollaboration,
  EpisodeReleasePlan,
  ProductionProjectAggregate,
  ProductionTask,
  ProductionTaskStatus,
} from "@toonstudio/core/production";

import {
  WEBTOON_EPISODE_PIPELINE,
  type EpisodePipelineTemplateStep,
} from "./production-episode-operations";
import { workflowEpisodePipeline } from "./production-workflow-episode-plan";

const DAY_MS = 86_400_000;

const COMPLETE_TASK_STATUSES = new Set<ProductionTaskStatus>([
  "approved",
  "done",
  "cancelled",
  "out-of-scope",
]);

/** 버퍼가 이 일수 이하면 "임박" 경고로 올린다. */
export const STAGE_DEADLINE_TIGHT_BUFFER_DAYS = 2;
/** 권장 마감이 이 일수 이내로 다가오면 단계 상태를 "임박"으로 표시한다. */
export const STAGE_DEADLINE_DUE_SOON_DAYS = 2;

/** 게시일의 출처. 캘린더 연결 상태를 UI가 그대로 드러낼 수 있게 분리한다. */
export type EpisodeReleaseSource =
  | "release-plan"
  | "episode-plan"
  | "publication-task"
  | "none";

export interface EpisodeReleaseResolution {
  readonly releaseAt: string | null;
  readonly source: EpisodeReleaseSource;
  /** source가 release-plan일 때 해당 게시 캘린더 예약의 id. */
  readonly releasePlanId: string | null;
}

export type StageDeadlineStatus =
  | "done"
  | "overdue"
  | "due-soon"
  | "upcoming"
  | "unplanned";

export interface StageDeadline {
  readonly processKey: string;
  readonly label: string;
  readonly daysBeforeRelease: number;
  /** 게시일에서 역산한 권장 마감 (ISO). 게시일이 없으면 null. */
  readonly recommendedDueAt: string | null;
  /** 권장 마감까지 남은 일수 (ceil). 게시일이 없으면 null. */
  readonly daysUntilRecommended: number | null;
  /** 실제 작업에 잡힌 마감 (ISO). 작업이 없으면 null. */
  readonly plannedDueAt: string | null;
  /** 계획 마감이 권장보다 늦으면 양수(일). 비교할 수 없으면 null. */
  readonly driftDays: number | null;
  readonly taskExists: boolean;
  readonly done: boolean;
  readonly status: StageDeadlineStatus;
}

export type StageDeadlineBufferLevel =
  | "ready"
  | "safe"
  | "tight"
  | "exhausted"
  | "unplanned";

export interface StageDeadlinePlan {
  readonly episodeId: string;
  readonly releaseAt: string | null;
  readonly releaseSource: EpisodeReleaseSource;
  readonly releasePlanId: string | null;
  readonly daysUntilRelease: number | null;
  readonly stages: readonly StageDeadline[];
  /** 가장 먼저 챙겨야 할 미완료 단계. 전부 완료면 null. */
  readonly nextStage: StageDeadline | null;
  /** 게시 버퍼 일수. ready면 게시일까지 남은 일수, unplanned면 null. */
  readonly bufferDays: number | null;
  readonly bufferLevel: StageDeadlineBufferLevel;
  /** 숫자를 포함한 경고·안내 문장. 판정 근거를 숨기지 않는다. */
  readonly warnings: readonly string[];
}

function isActiveReleasePlan(
  plan: EpisodeReleasePlan,
): plan is EpisodeReleasePlan & { readonly scheduledAt: string } {
  return (
    (plan.status === "scheduled" || plan.status === "ready" || plan.status === "preflight")
    && typeof plan.scheduledAt === "string"
    && Number.isFinite(Date.parse(plan.scheduledAt))
  );
}

/**
 * 게시일 해석 우선순위:
 * 1. 게시 캘린더 예약(aggregate.releasePlans 중 scheduled/ready/preflight, 가장 이른 예약)
 * 2. 회차 자체의 게시 계획(plannedReleaseAt)
 * 3. 게시(publication) 작업의 마감
 */
export function resolveEpisodeRelease(
  aggregate: ProductionProjectAggregate,
  episode: EpisodeCollaboration,
  tasks: readonly ProductionTask[],
): EpisodeReleaseResolution {
  const calendarPlan = (aggregate.releasePlans ?? [])
    .filter((plan): plan is EpisodeReleasePlan & { readonly scheduledAt: string } =>
      plan.episodeId === episode.episodeId && isActiveReleasePlan(plan))
    .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt))[0];
  if (calendarPlan) {
    return {
      releaseAt: calendarPlan.scheduledAt,
      source: "release-plan",
      releasePlanId: calendarPlan.id,
    };
  }
  if (episode.plannedReleaseAt && Number.isFinite(Date.parse(episode.plannedReleaseAt))) {
    return { releaseAt: episode.plannedReleaseAt, source: "episode-plan", releasePlanId: null };
  }
  const publicationTask = tasks
    .filter((task) => canonicalProductionProcessKey(task.processKey) === "publication" && task.status !== "cancelled" && task.dueAt)
    .sort((left, right) => Date.parse(left.dueAt!) - Date.parse(right.dueAt!))[0];
  if (publicationTask?.dueAt) {
    return { releaseAt: publicationTask.dueAt, source: "publication-task", releasePlanId: null };
  }
  return { releaseAt: null, source: "none", releasePlanId: null };
}

/** 회차 마일스톤 승인이 작업 완료와 별개로 단계를 끝낸 것으로 본다 (운영 행의 진행률 규칙과 동일). */
function milestoneCompletes(episode: EpisodeCollaboration, processKey: string): boolean {
  switch (canonicalProductionProcessKey(processKey)) {
    case "story-lock":
      return episode.storyLockApproved;
    case "storyboard":
      return episode.thumbnailLockApproved;
    case "joint-proof":
      return episode.jointProofApproved;
    case "rights-preflight":
      return episode.creditPreflightPassed && episode.publicationPreflightPassed;
    case "publication":
      return episode.state === "published";
    default:
      return false;
  }
}

function daysUntil(timestampMs: number, nowMs: number): number {
  return Math.ceil((timestampMs - nowMs) / DAY_MS);
}

export function buildStageDeadlinePlan(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
  now: Date = new Date(),
): StageDeadlinePlan | null {
  const episode = aggregate.episodes.find((entry) => entry.episodeId === episodeId);
  if (!episode || episode.state === "published") return null;
  const nowMs = now.getTime();
  const tasks = aggregate.tasks.filter(
    (task) => task.scope.kind === "episode" && task.scope.id === episodeId && task.status !== "out-of-scope",
  );
  const release = resolveEpisodeRelease(aggregate, episode, tasks);
  const releaseMs = release.releaseAt ? Date.parse(release.releaseAt) : null;
  const template = workflowEpisodePipeline(aggregate) ?? WEBTOON_EPISODE_PIPELINE;

  const stages: StageDeadline[] = template.map((step: EpisodePipelineTemplateStep) => {
    const stepTasks = tasks.filter(
      (task) => canonicalProductionProcessKey(task.processKey) === canonicalProductionProcessKey(step.processKey),
    );
    const activeTasks = stepTasks.filter((task) => task.status !== "cancelled");
    const done = milestoneCompletes(episode, step.processKey)
      || (activeTasks.length > 0 && activeTasks.every((task) => COMPLETE_TASK_STATUSES.has(task.status)));
    const plannedTask = [...activeTasks]
      .filter((task) => task.dueAt)
      .sort((left, right) => Date.parse(left.dueAt!) - Date.parse(right.dueAt!))[0] ?? null;
    const recommendedMs = releaseMs === null ? null : releaseMs - step.daysBeforeRelease * DAY_MS;
    const recommendedDueAt = recommendedMs === null ? null : new Date(recommendedMs).toISOString();
    const daysUntilRecommended = recommendedMs === null ? null : daysUntil(recommendedMs, nowMs);
    const driftDays = plannedTask?.dueAt && recommendedMs !== null
      ? Math.round((Date.parse(plannedTask.dueAt) - recommendedMs) / DAY_MS)
      : null;
    const status: StageDeadlineStatus = done
      ? "done"
      : recommendedMs === null
        ? "unplanned"
        : recommendedMs < nowMs
          ? "overdue"
          : daysUntilRecommended !== null && daysUntilRecommended <= STAGE_DEADLINE_DUE_SOON_DAYS
            ? "due-soon"
            : "upcoming";
    return {
      processKey: step.processKey,
      label: step.label,
      daysBeforeRelease: step.daysBeforeRelease,
      recommendedDueAt,
      daysUntilRecommended,
      plannedDueAt: plannedTask?.dueAt ?? null,
      driftDays,
      taskExists: stepTasks.length > 0,
      done,
      status,
    };
  });

  const incomplete = stages.filter((stage) => !stage.done);
  const nextStage = [...incomplete]
    .sort((left, right) => right.daysBeforeRelease - left.daysBeforeRelease)[0] ?? null;
  const daysUntilRelease = releaseMs === null ? null : daysUntil(releaseMs, nowMs);

  let bufferDays: number | null = null;
  let bufferLevel: StageDeadlineBufferLevel = "unplanned";
  if (releaseMs !== null && daysUntilRelease !== null) {
    if (incomplete.length === 0) {
      bufferDays = daysUntilRelease;
      bufferLevel = "ready";
    } else {
      bufferDays = daysUntilRelease - (nextStage?.daysBeforeRelease ?? 0);
      bufferLevel = bufferDays < 0
        ? "exhausted"
        : bufferDays <= STAGE_DEADLINE_TIGHT_BUFFER_DAYS
          ? "tight"
          : "safe";
    }
  }

  const warnings: string[] = [];
  if (releaseMs === null) {
    warnings.push("게시 일정이 없어 단계별 권장 마감을 계산할 수 없습니다. 게시 캘린더에 예약을 먼저 잡아 주세요.");
  } else if (bufferLevel === "exhausted" && nextStage) {
    warnings.push(
      `'${nextStage.label}' 단계의 권장 마감이 ${Math.abs(nextStage.daysUntilRecommended ?? 0)}일 지났습니다. 게시일까지 남은 ${Math.max(0, daysUntilRelease ?? 0)}일 안에 필요 선행 기간 ${nextStage.daysBeforeRelease}일을 확보할 수 없어 버퍼가 없습니다.`,
    );
  } else if (bufferLevel === "tight" && nextStage) {
    warnings.push(
      `게시 버퍼가 ${bufferDays ?? 0}일뿐입니다. '${nextStage.label}' 권장 마감까지 ${nextStage.daysUntilRecommended ?? 0}일 남았으니 지연이 생기면 바로 게시일에 닿습니다.`,
    );
  } else if (bufferLevel === "ready") {
    warnings.push(`모든 제작 단계가 끝나 게시 버퍼 ${bufferDays ?? 0}일이 확보됐습니다.`);
  }
  for (const stage of incomplete) {
    if (stage.driftDays !== null && stage.driftDays > 0) {
      warnings.push(`'${stage.label}' 작업 마감이 권장 마감보다 ${stage.driftDays}일 늦게 잡혀 있습니다.`);
    }
    if (!stage.taskExists) {
      warnings.push(`'${stage.label}' 단계의 작업이 아직 등록되지 않았습니다.`);
    }
  }

  return {
    episodeId,
    releaseAt: release.releaseAt,
    releaseSource: release.source,
    releasePlanId: release.releasePlanId,
    daysUntilRelease,
    stages,
    nextStage,
    bufferDays,
    bufferLevel,
    warnings,
  };
}
