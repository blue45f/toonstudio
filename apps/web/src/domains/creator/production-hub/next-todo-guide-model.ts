/**
 * '다음 할 일' 통합 안내 — 집계 모델 (작업 흐름 연속성 레인).
 *
 * 작품 허브(개요)와 홈(제작 랜딩)은 지금까지 "다음 단계"를 표면·회차 단위로만
 * 보여 줬다. 이 모델은 여러 회차·단계에 흩어진 다음 행동을 한 목록으로 모아
 * 우선순위 순으로 정렬한다. 새 상태를 만들지 않는다:
 * - 회차 행동은 단계 도출 정본(`deriveEpisodeStageStates`)의 결과와 단계 정의
 *   정본(`EPISODE_STAGES`)의 primaryAction에서만 나온다. 호출자가 도출한
 *   stageStates를 그대로 받으며, current 단계가 없는 회차는 지어내지 않는다.
 * - 작업 행동은 aggregate의 ProductionTask 실제 필드(상태·마감·우선순위)에서만
 *   나온다. 마감·상태 근거가 없는 일상 작업은 목록에 넣지 않는다(소음 방지).
 * - 홈 집계는 랜딩이 이미 받는 프로젝트 요약·개인 인박스만으로 만든다.
 *
 * 우선순위는 고정 점수표다: 막힘(차단) > 수정 요청·기한 초과 > 게시 임박 >
 * 검수 대기 > 마감 임박 > 회차 현재 단계. 동점은 마감 오름차순 → 회차 번호
 * 오름차순 → 제목 순으로 deterministic하게 깬다.
 */
import type {
  EpisodeCollaboration,
  EpisodePlan,
  ProductionTask,
} from "@toonstudio/core/production";

import type { BilingualLabel } from "./production-labels";
import type {
  ProductionPersonalInboxItem,
  ProductionProjectSummary,
} from "./production-dashboard-api";
import type { EpisodeStageState } from "./production-episode-stage";
import {
  EPISODE_STAGES,
  productionEpisodeRoomPath,
  productionSurfacePath,
  type EpisodeStageId,
  type ProductionSurfaceTarget,
} from "./production-project-surfaces";

export type NextTodoKind =
  | "blocker"
  | "changes-requested"
  | "overdue-task"
  | "blocked-task"
  | "release-soon"
  | "review-task"
  | "due-task"
  | "episode-stage"
  | "inbox"
  | "project-risk";

export interface NextTodoItem {
  readonly id: string;
  readonly kind: NextTodoKind;
  /** 클수록 먼저 보인다. 고정 점수표로만 산출한다. */
  readonly score: number;
  /** 회차·작업·작품 이름 같은 데이터 문자열. 번역 대상이 아니다. */
  readonly title: string;
  /** 왜 지금 해야 하는지 (우선순위 근거). 근거가 없으면 만들지 않는다. */
  readonly reason: BilingualLabel;
  readonly actionLabel: BilingualLabel;
  readonly href: string;
  readonly dueAt: string | null;
  readonly episodeId: string | null;
  readonly stageId: EpisodeStageId | null;
}

export interface NextTodoEpisodeInput {
  readonly episode: Pick<
    EpisodeCollaboration,
    "episodeId" | "state" | "openBlockerCount" | "plannedReleaseAt"
  >;
  readonly plan?: Pick<EpisodePlan, "episodeNumber" | "title"> | null;
  /** deriveEpisodeStageStates 결과. 호출자가 도출해 넘긴다. */
  readonly stageStates: readonly EpisodeStageState[];
}

export interface NextTodoGuide {
  readonly items: readonly NextTodoItem[];
  /** limit으로 잘리기 전 전체 건수. "외 N건" 표시에 쓴다. */
  readonly totalCount: number;
  readonly isEmpty: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const RELEASE_SOON_MS = 72 * 60 * 60 * 1000;
const DUE_SOON_MS = 48 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 7;

const KIND_BASE_SCORE: Readonly<Record<NextTodoKind, number>> = Object.freeze({
  blocker: 100,
  "changes-requested": 92,
  "overdue-task": 90,
  "blocked-task": 88,
  "release-soon": 84,
  "review-task": 78,
  "due-task": 70,
  "episode-stage": 60,
  inbox: 50,
  "project-risk": 40,
});

const INBOX_BUCKET_SCORE: Readonly<Record<ProductionPersonalInboxItem["bucket"], number>> =
  Object.freeze({
    blockingOthers: 96,
    dueToday: 86,
    review: 76,
    waitingInput: 68,
    inProgress: 52,
    ready: 44,
  });

const INBOX_BUCKET_REASON: Readonly<
  Record<ProductionPersonalInboxItem["bucket"], BilingualLabel>
> = Object.freeze({
  blockingOthers: { ko: "다른 작업을 막고 있어요", en: "Blocking other work" },
  dueToday: { ko: "오늘 제출 마감", en: "Due today" },
  review: { ko: "내 검수를 기다려요", en: "Waiting for your review" },
  waitingInput: { ko: "입력을 기다려요", en: "Waiting for input" },
  inProgress: { ko: "진행 중인 내 작업", en: "Your work in progress" },
  ready: { ko: "지금 시작할 수 있어요", en: "Ready to start" },
});

const REVIEW_TASK_STATUSES: ReadonlySet<ProductionTask["status"]> = new Set([
  "internal-review",
  "external-review",
]);

const CLOSED_TASK_STATUSES: ReadonlySet<ProductionTask["status"]> = new Set([
  "done",
  "approved",
  "cancelled",
  "out-of-scope",
]);

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function overdueDays(dueTime: number, nowTime: number): number {
  return Math.max(1, Math.ceil((nowTime - dueTime) / DAY_MS));
}

/**
 * target → href 해석기. 프로젝트 내비(ProductionProjectNav의
 * StagePrimaryActionLink)와 같은 규칙이다 — 내비는 이 변환을 내보내지 않아
 * 진행 레일·인계 카드와 같은 방식으로 여기에 같은 규칙으로 둔다.
 */
export function nextTodoTargetHref(
  target: ProductionSurfaceTarget,
  context: { readonly projectId: string; readonly episodeId?: string | null },
): string {
  switch (target.kind) {
    case "surface":
      return productionSurfacePath(context.projectId, target.surface, target.query);
    case "path":
      return target.path;
    case "episode-room":
      return context.episodeId
        ? productionEpisodeRoomPath(context.projectId, context.episodeId)
        : productionSurfacePath(context.projectId, "episodes");
  }
}

function compareItems(a: NextTodoItem, b: NextTodoItem): number {
  if (b.score !== a.score) return b.score - a.score;
  const aDue = parseTime(a.dueAt);
  const bDue = parseTime(b.dueAt);
  if (aDue !== bDue) {
    if (aDue === null) return 1;
    if (bDue === null) return -1;
    return aDue - bDue;
  }
  return a.id.localeCompare(b.id);
}

function finish(items: NextTodoItem[], limit: number): NextTodoGuide {
  const sorted = [...items].sort(compareItems);
  return {
    items: sorted.slice(0, Math.max(0, limit)),
    totalCount: sorted.length,
    isEmpty: sorted.length === 0,
  };
}

function episodeTitle(input: NextTodoEpisodeInput): string {
  const plan = input.plan ?? null;
  if (plan && plan.title.trim()) {
    return plan.episodeNumber > 0 ? `${plan.episodeNumber}화 · ${plan.title.trim()}` : plan.title.trim();
  }
  if (plan && plan.episodeNumber > 0) return `${plan.episodeNumber}화`;
  return input.episode.episodeId;
}

function taskEpisodeId(task: Pick<ProductionTask, "scope">): string | null {
  if (task.scope.kind === "episode") return task.scope.id;
  const ancestor = task.scope.ancestors.find((entry) => entry.kind === "episode");
  return ancestor ? ancestor.id : null;
}

/**
 * 작품 허브용 집계. aggregate 한 작품의 회차·작업을 모은다.
 * episodes의 stageStates는 호출자가 deriveEpisodeStageStates로 도출해 넘긴다 —
 * 이 모델은 단계 상태를 다시 판정하지 않는다.
 */
export function buildProjectNextTodos(
  input: {
    readonly projectId: string;
    readonly episodes: readonly NextTodoEpisodeInput[];
    readonly tasks: readonly Pick<
      ProductionTask,
      "id" | "title" | "status" | "dueAt" | "priority" | "scope"
    >[];
  },
  options?: { readonly now?: Date; readonly limit?: number },
): NextTodoGuide {
  const now = options?.now ?? new Date();
  const nowTime = now.getTime();
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const items: NextTodoItem[] = [];

  for (const entry of input.episodes) {
    const { episode } = entry;
    const title = episodeTitle(entry);
    const roomHref = productionEpisodeRoomPath(input.projectId, episode.episodeId);
    const releaseTime = parseTime(episode.plannedReleaseAt ?? null);

    if (episode.openBlockerCount > 0) {
      items.push({
        id: `blocker:${episode.episodeId}`,
        kind: "blocker",
        score: KIND_BASE_SCORE.blocker + Math.min(episode.openBlockerCount, 9),
        title,
        reason: {
          ko: `막힌 지점 ${episode.openBlockerCount}건이 진행을 멈추고 있어요`,
          en: `${episode.openBlockerCount} blocker(s) are holding this episode`,
        },
        actionLabel: { ko: "회차 룸에서 풀기", en: "Resolve in the episode room" },
        href: roomHref,
        dueAt: episode.plannedReleaseAt ?? null,
        episodeId: episode.episodeId,
        stageId: null,
      });
    }

    if (
      episode.state !== "published" &&
      releaseTime !== null &&
      releaseTime - nowTime <= RELEASE_SOON_MS
    ) {
      const overdue = releaseTime < nowTime;
      items.push({
        id: `release:${episode.episodeId}`,
        kind: "release-soon",
        score: KIND_BASE_SCORE["release-soon"] + (overdue ? 5 : 0),
        title,
        reason: overdue
          ? { ko: "게시 예정일이 지났어요", en: "The planned release date has passed" }
          : { ko: "게시 예정이 3일 안에 있어요", en: "Planned release within 3 days" },
        actionLabel: { ko: "게시 준비 확인", en: "Check release readiness" },
        href: nextTodoTargetHref(
          { kind: "path", path: "/studio/publish" },
          { projectId: input.projectId, episodeId: episode.episodeId },
        ),
        dueAt: episode.plannedReleaseAt ?? null,
        episodeId: episode.episodeId,
        stageId: "publish",
      });
    }

    // 현재 단계 행동: current가 있을 때만. 전부 끝난 회차(publish done)는
    // 운영 단계 행동을 한 번만 제안하고, unknown뿐인 회차는 제안하지 않는다.
    const current = entry.stageStates.find((state) => state.status === "current") ?? null;
    const publishState = entry.stageStates.find((state) => state.id === "publish") ?? null;
    const stageId: EpisodeStageId | null = current
      ? current.id
      : publishState?.status === "done"
        ? "operate"
        : null;
    if (stageId) {
      const definition = EPISODE_STAGES.find((stage) => stage.id === stageId) ?? null;
      if (definition) {
        items.push({
          id: `stage:${episode.episodeId}:${stageId}`,
          kind: "episode-stage",
          score: KIND_BASE_SCORE["episode-stage"],
          title,
          reason: {
            ko: `지금 ${definition.label.ko} 단계예요`,
            en: `Currently at the ${definition.label.en} stage`,
          },
          actionLabel: definition.primaryAction.label,
          href: nextTodoTargetHref(definition.primaryAction.target, {
            projectId: input.projectId,
            episodeId: episode.episodeId,
          }),
          dueAt: episode.plannedReleaseAt ?? null,
          episodeId: episode.episodeId,
          stageId,
        });
      }
    }
  }

  for (const task of input.tasks) {
    if (CLOSED_TASK_STATUSES.has(task.status)) continue;
    const dueTime = parseTime(task.dueAt);
    const episodeId = taskEpisodeId(task);
    const href = productionSurfacePath(
      input.projectId,
      "production",
      `task=${encodeURIComponent(task.id)}`,
    );
    const base = {
      title: task.title,
      href,
      dueAt: task.dueAt,
      episodeId,
      stageId: null,
    } as const;

    if (task.status === "changes-requested") {
      items.push({
        ...base,
        id: `task:${task.id}`,
        kind: "changes-requested",
        score: KIND_BASE_SCORE["changes-requested"],
        reason: { ko: "수정 요청이 와 있어요", en: "Changes were requested" },
        actionLabel: { ko: "작업 열기", en: "Open the task" },
      });
    } else if (task.status === "blocked") {
      items.push({
        ...base,
        id: `task:${task.id}`,
        kind: "blocked-task",
        score: KIND_BASE_SCORE["blocked-task"],
        reason: { ko: "막혀서 멈춰 있어요", en: "Blocked and stalled" },
        actionLabel: { ko: "작업 열기", en: "Open the task" },
      });
    } else if (dueTime !== null && dueTime < nowTime) {
      items.push({
        ...base,
        id: `task:${task.id}`,
        kind: "overdue-task",
        score: KIND_BASE_SCORE["overdue-task"] + Math.min(overdueDays(dueTime, nowTime), 9),
        reason: {
          ko: `마감이 ${overdueDays(dueTime, nowTime)}일 지났어요`,
          en: `${overdueDays(dueTime, nowTime)} day(s) past the deadline`,
        },
        actionLabel: { ko: "작업 열기", en: "Open the task" },
      });
    } else if (REVIEW_TASK_STATUSES.has(task.status)) {
      items.push({
        ...base,
        id: `task:${task.id}`,
        kind: "review-task",
        score: KIND_BASE_SCORE["review-task"],
        reason: { ko: "검수를 기다리고 있어요", en: "Waiting for review" },
        actionLabel: { ko: "검수하러 가기", en: "Go to review" },
        href: productionSurfacePath(input.projectId, "review"),
      });
    } else if (dueTime !== null && dueTime - nowTime <= DUE_SOON_MS) {
      items.push({
        ...base,
        id: `task:${task.id}`,
        kind: "due-task",
        score: KIND_BASE_SCORE["due-task"],
        reason: { ko: "마감이 이틀 안에 있어요", en: "Due within two days" },
        actionLabel: { ko: "작업 열기", en: "Open the task" },
      });
    }
    // 마감·상태 근거가 없는 일상 작업은 넣지 않는다. 회차 단계 행동이 이미
    // "다음에 할 일"을 말하고 있어, 근거 없는 작업을 얹으면 소음이 된다.
  }

  return finish(items, limit);
}

/**
 * 홈(제작 랜딩)용 집계. 랜딩이 이미 받는 프로젝트 요약 + 개인 인박스만으로
 * 작품을 넘나드는 다음 행동을 만든다. 인박스 항목이 작품 요약 신호보다
 * 구체적이라(실제 작업 단위) 항상 위에 온다.
 */
export function buildHomeNextTodos(
  input: {
    readonly projects: readonly ProductionProjectSummary[];
    readonly inboxItems: readonly ProductionPersonalInboxItem[];
  },
  options?: { readonly now?: Date; readonly limit?: number },
): NextTodoGuide {
  const now = options?.now ?? new Date();
  const nowTime = now.getTime();
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const items: NextTodoItem[] = [];

  for (const item of input.inboxItems) {
    const dueTime = parseTime(item.dueAt);
    const overdueBoost = dueTime !== null && dueTime < nowTime ? 4 : 0;
    items.push({
      id: `inbox:${item.projectId}:${item.taskId}`,
      kind: "inbox",
      score: INBOX_BUCKET_SCORE[item.bucket] + overdueBoost,
      title: item.taskTitle,
      reason: INBOX_BUCKET_REASON[item.bucket],
      actionLabel: { ko: "작업 열기", en: "Open the task" },
      href: productionSurfacePath(
        item.projectId,
        "production",
        `task=${encodeURIComponent(item.taskId)}`,
      ),
      dueAt: item.dueAt,
      episodeId: item.episodeId,
      stageId: null,
    });
  }

  const inboxProjectIds = new Set(input.inboxItems.map((item) => item.projectId));
  for (const project of input.projects) {
    // 이미 인박스 항목으로 구체적인 행동이 보이는 작품은 요약 신호를 겹치지 않는다.
    if (inboxProjectIds.has(project.projectId)) continue;
    const overviewHref = productionSurfacePath(project.projectId, "overview");
    if (project.overdueTaskCount > 0) {
      items.push({
        id: `risk:${project.projectId}:overdue`,
        kind: "project-risk",
        score: KIND_BASE_SCORE["project-risk"] + 18,
        title: project.title,
        reason: {
          ko: `기한을 넘긴 작업 ${project.overdueTaskCount}건`,
          en: `${project.overdueTaskCount} overdue task(s)`,
        },
        actionLabel: { ko: "작품 허브 열기", en: "Open the project hub" },
        href: overviewHref,
        dueAt: null,
        episodeId: null,
        stageId: null,
      });
    } else if (project.blockedTaskCount > 0) {
      items.push({
        id: `risk:${project.projectId}:blocked`,
        kind: "project-risk",
        score: KIND_BASE_SCORE["project-risk"] + 14,
        title: project.title,
        reason: {
          ko: `막힌 작업 ${project.blockedTaskCount}건`,
          en: `${project.blockedTaskCount} blocked task(s)`,
        },
        actionLabel: { ko: "작품 허브 열기", en: "Open the project hub" },
        href: overviewHref,
        dueAt: null,
        episodeId: null,
        stageId: null,
      });
    } else if (project.criticalRiskCount > 0) {
      items.push({
        id: `risk:${project.projectId}:critical`,
        kind: "project-risk",
        score: KIND_BASE_SCORE["project-risk"] + 10,
        title: project.title,
        reason: {
          ko: `긴급 위험 신호 ${project.criticalRiskCount}건`,
          en: `${project.criticalRiskCount} critical risk signal(s)`,
        },
        actionLabel: { ko: "작품 허브 열기", en: "Open the project hub" },
        href: overviewHref,
        dueAt: null,
        episodeId: null,
        stageId: null,
      });
    } else if (
      project.nextReleaseAt &&
      parseTime(project.nextReleaseAt) !== null &&
      (parseTime(project.nextReleaseAt) as number) - nowTime <= RELEASE_SOON_MS &&
      project.readyBufferCount === 0
    ) {
      items.push({
        id: `risk:${project.projectId}:release`,
        kind: "project-risk",
        score: KIND_BASE_SCORE["project-risk"] + 6,
        title: project.title,
        reason: {
          ko: "다음 게시가 가까운데 완성 비축이 없어요",
          en: "Release is near with no finished buffer",
        },
        actionLabel: { ko: "작품 허브 열기", en: "Open the project hub" },
        href: overviewHref,
        dueAt: project.nextReleaseAt,
        episodeId: null,
        stageId: null,
      });
    }
  }

  return finish(items, limit);
}
