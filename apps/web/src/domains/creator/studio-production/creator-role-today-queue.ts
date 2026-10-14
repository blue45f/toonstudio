import {
  rankCreatorRoleTasks,
  type CreatorRoleTaskReason,
} from "./creator-role-task-inbox";
import type {
  ProductionRole,
  ProductionTask,
  ProductionTaskStatus,
  ProductionWorkspace,
} from "./studio-production-workspace-runtime";

/**
 * 역할별 오늘 큐 (REPORT T-4): 아침에 여는 '작업자 뷰'.
 *
 * 기존 과제 인박스(rankCreatorRoleTasks)는 관련 작업을 우선순위로만 늘어놓아
 * "오늘 마감"과 "앞 공정을 기다리는 중"이 섞여 보였고, 대기 항목에는
 * '선행 작업 대기' 칩만 붙어 왜 기다리는지(어느 앞 공정이, 어떤 상태로,
 * 얼마나 늦었는지)가 표시되지 않았다. 이 모델은 같은 관련성 판정(직접 배정·
 * 검수·역할 일치·감독 신호)을 재사용해 오늘 단위로 다시 가른다:
 *
 * - dueToday: 선행 작업이 모두 끝나 지금 손댈 수 있고, 마감이 오늘 또는
 *   이미 지난 내 작업.
 * - waiting: 선행 작업이 끝나지 않아 시작할 수 없는 내 작업. 항목마다
 *   막고 있는 앞 공정(blockers)과 사람이 읽는 대기 사유(waitingSummary)를
 *   함께 싣는다 — 판정 기준 "앞 공정 지연 항목에 대기 이유가 표시됨".
 *
 * 날짜 판정은 인박스와 같은 UTC 날짜 단위(dayStart)를 쓴다. 대기 사유는
 * 앞 공정의 실제 상태·마감에서만 도출하고, 앞 공정 정보가 없으면 그 사실을
 * 사유로 정직하게 표시한다(추측으로 이유를 지어내지 않음).
 */

export const PRODUCTION_ROLE_LABELS: Readonly<Record<ProductionRole, string>> = Object.freeze({
  story: "스토리",
  storyboard: "콘티",
  lineart: "선화",
  color: "채색",
  background: "배경",
  lettering: "식자",
  reviewer: "검수",
  director: "연출·PD",
  publisher: "게시",
});

export type RoleTodayBlockerKind = "blocked" | "in-progress" | "not-started" | "missing";

export interface RoleTodayBlocker {
  /** 막고 있는 앞 공정 작업 id. 워크스페이스에서 찾지 못하면 그 id 그대로. */
  readonly taskId: string;
  readonly title: string;
  readonly status: ProductionTaskStatus | null;
  readonly kind: RoleTodayBlockerKind;
  readonly role: ProductionRole | null;
  readonly owner: string;
  /** 앞 공정 마감(원본 due 문자열). 없거나 파싱 불가면 null. */
  readonly due: string | null;
  /** 앞 공정 마감이 오늘보다 며칠 지났는지. 지나지 않았으면 0. */
  readonly overdueDays: number;
  /** 앞 공정 자체에 기록된 차단 사유(자유 문구). 없으면 null. */
  readonly blockedReason: string | null;
}

export type RoleTodayDueKind = "overdue" | "today" | "later" | "none";

export interface RoleTodayQueueItem {
  readonly task: ProductionTask;
  readonly score: number;
  readonly reasons: readonly CreatorRoleTaskReason[];
  readonly dueAt: number | null;
  readonly dueKind: RoleTodayDueKind;
  /** 오늘보다 며칠 지났는지( dueKind === "overdue"일 때만 1 이상). */
  readonly overdueDays: number;
  /** 끝나지 않은 앞 공정 목록. dueToday 항목은 항상 빈 배열이다. */
  readonly blockers: readonly RoleTodayBlocker[];
  /** waiting 항목 전용: 어느 앞 공정이 왜 안 끝났는지를 한 문장으로. */
  readonly waitingSummary: string | null;
}

export interface RoleTodayQueue {
  /** 기준 날짜(yyyy-mm-dd, UTC). */
  readonly today: string;
  readonly activeRoles: readonly ProductionRole[];
  readonly dueToday: readonly RoleTodayQueueItem[];
  readonly waiting: readonly RoleTodayQueueItem[];
}

export interface BuildRoleTodayQueueInput {
  readonly workspace: ProductionWorkspace;
  readonly currentUserId: string | null | undefined;
  readonly activeRoles: readonly ProductionRole[];
  readonly now?: Date;
  readonly limit?: number;
}

function dayStart(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function dateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function blockerKind(status: ProductionTaskStatus): RoleTodayBlockerKind {
  if (status === "blocked") return "blocked";
  if (status === "doing") return "in-progress";
  return "not-started";
}

function blockerPhrase(blocker: RoleTodayBlocker): string {
  switch (blocker.kind) {
    case "missing":
      return "앞 공정 정보를 찾을 수 없음";
    case "blocked":
      return blocker.blockedReason
        ? `앞 공정 '${blocker.title}'이(가) 멈춰 있음 (${blocker.blockedReason})`
        : `앞 공정 '${blocker.title}'이(가) 차단 상태로 멈춰 있음`;
    case "in-progress":
      return `앞 공정 '${blocker.title}'이(가) 아직 진행 중`;
    case "not-started":
      return `앞 공정 '${blocker.title}'이(가) 아직 시작 전`;
    default:
      return "앞 공정이 끝나지 않음";
  }
}

function buildWaitingSummary(blockers: readonly RoleTodayBlocker[]): string {
  const first = blockers[0];
  if (!first) return "";
  let summary = blockerPhrase(first);
  const overdue = blockers.reduce((max, blocker) => Math.max(max, blocker.overdueDays), 0);
  if (overdue > 0) summary += ` · 앞 공정 마감 ${overdue}일 지남`;
  if (blockers.length > 1) summary += ` · 외 ${blockers.length - 1}건도 대기 중`;
  return summary;
}

export function buildRoleTodayQueue({
  workspace,
  currentUserId,
  activeRoles,
  now = new Date(),
  limit = 20,
}: BuildRoleTodayQueueInput): RoleTodayQueue {
  const todayStart = dayStart(now);
  const taskById = new Map(workspace.tasks.map((task) => [task.id, task] as const));
  const ranked = rankCreatorRoleTasks({
    workspace,
    currentUserId,
    activeRoles,
    now,
    limit,
  });

  const dueToday: RoleTodayQueueItem[] = [];
  const waiting: RoleTodayQueueItem[] = [];

  for (const item of ranked) {
    const blockers: RoleTodayBlocker[] = [];
    for (const dependencyId of item.task.dependencyIds ?? []) {
      const dependency = taskById.get(dependencyId);
      if (dependency && dependency.status === "done") continue;
      if (!dependency) {
        blockers.push({
          taskId: dependencyId,
          title: dependencyId,
          status: null,
          kind: "missing",
          role: null,
          owner: "",
          due: null,
          overdueDays: 0,
          blockedReason: null,
        });
        continue;
      }
      const dependencyDueAt = dependency.due.trim() ? Date.parse(dependency.due) : Number.NaN;
      const overdueDays = Number.isFinite(dependencyDueAt)
        ? Math.max(0, Math.round((todayStart - dayStart(new Date(dependencyDueAt))) / 86_400_000))
        : 0;
      blockers.push({
        taskId: dependency.id,
        title: dependency.title,
        status: dependency.status,
        kind: blockerKind(dependency.status),
        role: dependency.role ?? null,
        owner: dependency.owner,
        due: dependency.due || null,
        overdueDays,
        blockedReason: dependency.blockedReason?.trim() ? dependency.blockedReason : null,
      });
    }

    let dueKind: RoleTodayDueKind = "none";
    let overdueDays = 0;
    if (item.dueAt !== null) {
      const diffDays = Math.round((dayStart(new Date(item.dueAt)) - todayStart) / 86_400_000);
      if (diffDays < 0) {
        dueKind = "overdue";
        overdueDays = Math.abs(diffDays);
      } else if (diffDays === 0) {
        dueKind = "today";
      } else {
        dueKind = "later";
      }
    }

    const queueItem: RoleTodayQueueItem = {
      task: item.task,
      score: item.score,
      reasons: item.reasons,
      dueAt: item.dueAt,
      dueKind,
      overdueDays,
      blockers,
      waitingSummary: blockers.length > 0 ? buildWaitingSummary(blockers) : null,
    };

    if (blockers.length > 0) {
      waiting.push(queueItem);
    } else if (dueKind === "overdue" || dueKind === "today") {
      dueToday.push(queueItem);
    }
  }

  dueToday.sort((left, right) => (
    (left.dueAt ?? Number.POSITIVE_INFINITY) - (right.dueAt ?? Number.POSITIVE_INFINITY)
    || right.score - left.score
    || left.task.title.localeCompare(right.task.title)
  ));
  waiting.sort((left, right) => {
    const leftOverdue = left.blockers.reduce((max, blocker) => Math.max(max, blocker.overdueDays), 0);
    const rightOverdue = right.blockers.reduce((max, blocker) => Math.max(max, blocker.overdueDays), 0);
    return rightOverdue - leftOverdue
      || (left.dueAt ?? Number.POSITIVE_INFINITY) - (right.dueAt ?? Number.POSITIVE_INFINITY)
      || left.task.title.localeCompare(right.task.title);
  });

  return {
    today: dateKey(todayStart),
    activeRoles,
    dueToday,
    waiting,
  };
}
