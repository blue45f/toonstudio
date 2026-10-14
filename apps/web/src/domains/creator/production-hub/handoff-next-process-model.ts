/**
 * 인계 → 다음 공정 연결 모델.
 *
 * 인계 화면은 준비도만 보여 주고 끝나면, 준비가 찬 사람도 공정 보드로 직접 찾아가
 * 회차와 공정을 다시 골라야 했다(협업 흐름 진단 §3·마찰 7). 이 모델이 그 사이를 잇는다.
 *
 * - 다음 공정: 그 회차 작업 중 스토리 다음으로 가장 먼저 오는 공정. 작업이 아직
 *   생성되지 않았으면 팀 공정 설정(없으면 기본 순서)의 두 번째 공정을 가리켜,
 *   보드에서 바로 만들 수 있게 한다.
 * - 인계 방향: 워크플로 선행 관계(dependsOn)가 있으면 그 간선을 그대로 쓰고
 *   (선화→채색처럼 배경을 사이에 둔 직접 선행도 살아난다), 없으면 회차 공정의
 *   순서대로 이웃한 쌍을 만든다. 첫 방향이 "다음 공정", 나머지는 "후단 인계"다.
 * - 딥링크: 공정 보드가 이미 읽는 값(boardEpisode·boardProcess·boardLayout=process)만
 *   쓴다. 공정별 보기에서 해당 공정 열이 그 회차 작업으로 채워져 열린다.
 */
import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";
import type { ProductionProjectAggregate, ProductionTask } from "@toonstudio/core/production";

import { PRODUCTION_DEFAULT_PROCESS_ORDER } from "./production-labels";

/** 인계의 출발 공정. 이 공정 자체는 "다음"이 될 수 없다. */
export const HANDOFF_STORY_PROCESS_KEY = "story-lock";

const CLOSED_TASK_STATUSES: ReadonlySet<ProductionTask["status"]> = new Set([
  "approved",
  "done",
  "cancelled",
  "out-of-scope",
]);

export interface HandoffNextProcess {
  readonly key: string;
  /** 그 회차·그 공정의 전체 작업 수(보관 제외). */
  readonly taskCount: number;
  /** 아직 닫히지 않은 작업 수. */
  readonly openTaskCount: number;
  readonly firstOpenTaskId: string | null;
}

export interface HandoffDirection {
  readonly fromKey: string;
  readonly toKey: string;
  /** `next`는 지금 열 다음 공정으로 가는 첫 방향, `downstream`은 그 뒤 후단 인계. */
  readonly stage: "next" | "downstream";
}

type HandoffAggregate = Pick<ProductionProjectAggregate, "tasks" | "workflowProfile">;

function episodeIdOfTask(task: ProductionTask): string | null {
  return task.scope.kind === "episode"
    ? task.scope.id
    : task.scope.ancestors.find((scope) => scope.kind === "episode")?.id ?? null;
}

/** 그 회차의 작업. 보관(취소·범위 제외)은 공정 흐름에서 제외한다. */
export function handoffEpisodeTasks(
  aggregate: Pick<ProductionProjectAggregate, "tasks">,
  episodeId: string,
): readonly ProductionTask[] {
  return aggregate.tasks.filter(
    (task) =>
      episodeIdOfTask(task) === episodeId && task.status !== "cancelled" && task.status !== "out-of-scope",
  );
}

/** 공정 순서의 정본: 팀 공정 설정 → 기본 순서. 레거시 키는 표준 키로 맞춘다. */
export function handoffProcessOrder(aggregate: HandoffAggregate): readonly string[] {
  return [
    ...new Set([
      ...(aggregate.workflowProfile?.steps.map((step) => canonicalProductionProcessKey(step.key)) ?? []),
      ...PRODUCTION_DEFAULT_PROCESS_ORDER.map((key) => canonicalProductionProcessKey(key)),
    ]),
  ];
}

/** 그 회차에 실제로 있는 공정을 공정 순서대로. 설정에 없는 공정은 뒤에 붙여 숨기지 않는다. */
export function handoffEpisodeProcesses(
  aggregate: HandoffAggregate,
  episodeId: string,
): readonly string[] {
  const present = [
    ...new Set(handoffEpisodeTasks(aggregate, episodeId).map((task) => canonicalProductionProcessKey(task.processKey))),
  ];
  const order = handoffProcessOrder(aggregate);
  return [...order.filter((key) => present.includes(key)), ...present.filter((key) => !order.includes(key))];
}

export function handoffNextProcess(
  aggregate: HandoffAggregate,
  episodeId: string,
): HandoffNextProcess | null {
  const episodeProcesses = handoffEpisodeProcesses(aggregate, episodeId);
  const key =
    episodeProcesses.find((candidate) => candidate !== HANDOFF_STORY_PROCESS_KEY) ??
    handoffProcessOrder(aggregate).find((candidate) => candidate !== HANDOFF_STORY_PROCESS_KEY) ??
    null;
  if (!key) return null;
  const tasks = handoffEpisodeTasks(aggregate, episodeId).filter(
    (task) => canonicalProductionProcessKey(task.processKey) === key,
  );
  const open = tasks.filter((task) => !CLOSED_TASK_STATUSES.has(task.status));
  return {
    key,
    taskCount: tasks.length,
    openTaskCount: open.length,
    firstOpenTaskId: open[0]?.id ?? null,
  };
}

export function handoffDirections(
  aggregate: HandoffAggregate,
  episodeId: string,
): readonly HandoffDirection[] {
  const episodeProcesses = handoffEpisodeProcesses(aggregate, episodeId);
  const steps = aggregate.workflowProfile?.steps ?? [];
  const edges: { readonly fromKey: string; readonly toKey: string }[] = [];
  if (steps.length > 0) {
    // 회차 공정이 둘 이상이면 그 범위 안의 선행 간선만, 아니면 설정 전체의 흐름을 보여 준다.
    const allowed = new Set(episodeProcesses.length > 1 ? episodeProcesses : handoffProcessOrder(aggregate));
    for (const step of steps) {
      const toKey = canonicalProductionProcessKey(step.key);
      for (const dependency of step.dependsOn) {
        const fromKey = canonicalProductionProcessKey(dependency);
        if (fromKey !== toKey && allowed.has(fromKey) && allowed.has(toKey)) edges.push({ fromKey, toKey });
      }
    }
  }
  if (edges.length === 0) {
    for (let index = 0; index + 1 < episodeProcesses.length; index += 1) {
      const fromKey = episodeProcesses[index];
      const toKey = episodeProcesses[index + 1];
      if (fromKey && toKey) edges.push({ fromKey, toKey });
    }
  }
  const order = handoffProcessOrder(aggregate);
  const rank = (key: string) => {
    const index = order.indexOf(key);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  const unique = [...new Map(edges.map((edge) => [`${edge.fromKey}->${edge.toKey}`, edge])).values()].sort(
    (left, right) => rank(left.toKey) - rank(right.toKey) || rank(left.fromKey) - rank(right.fromKey),
  );
  return unique.map((edge, index) => ({ ...edge, stage: index === 0 ? ("next" as const) : ("downstream" as const) }));
}

/** 공정 보드 딥링크. 보드가 읽는 필터 값만으로 해당 회차·해당 공정 열을 연다. */
export function handoffBoardHref(projectId: string, episodeId: string, processKey: string): string {
  const params = new URLSearchParams({
    boardEpisode: episodeId,
    boardProcess: canonicalProductionProcessKey(processKey),
    boardLayout: "process",
  });
  return `/production/projects/${encodeURIComponent(projectId)}/production?${params.toString()}`;
}
