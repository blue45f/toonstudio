/**
 * 검수 핀 → 할 일(제작 과제) 자동 전환 — 순수 모델.
 *
 * 핀은 댓글 문서(StudioCommentsDocument)에 살고, 할 일은 제작 워크스페이스
 * (ProductionWorkspace.tasks)에 산다. 두 저장소를 잇는 규칙을 한곳에 모은다:
 *
 * - 핀이 생기면 할 일이 자동 등록된다 (결정적 ID `pin-task:<threadId>` — 재동기화해도 중복 없음).
 * - 핀이 해결되면 할 일이 자동 완료되고, 핀이 다시 열리면 할 일도 다시 열린다.
 * - 핀 본문·긴급 표시·담당자가 바뀌면 할 일의 제목·우선순위·담당도 따라간다.
 * - 사람이 손으로 바꾼 값(기한·진행률·단계·의존성)은 동기화가 덮지 않는다.
 * - 미해결 핀 할 일은 담당자별로 모아 볼 수 있다 (summarizePinTasks).
 *
 * React·저장소에 의존하지 않으므로 호스트는 문서가 바뀔 때마다
 * applyPinTaskSyncToWorkspace를 호출해 결과를 커밋하기만 하면 된다.
 */

import type {
  StudioCommentsDocument,
} from "../studio-comments";
import type {
  ProductionTask,
  ProductionWorkspace,
} from "../studio-production/studio-production-workspace";
import {
  commentsDocumentToManuscriptPins,
  stripManuscriptPinUrgentPrefix,
  type ManuscriptPinStatus,
} from "./manuscript-pin-feedback-model";

/** 핀에서 자동 생성된 할 일의 ID 접두사. 이 접두사가 핀↔할 일 연결의 유일한 표식이다. */
export const PIN_TASK_ID_PREFIX = "pin-task:";

/** 할 일 제목에 넣는 본문 최대 길이 (초과 시 말줄임) */
const PIN_TASK_TITLE_BODY_LIMIT = 80;

export function pinTaskIdForThread(threadId: string): string {
  return `${PIN_TASK_ID_PREFIX}${threadId}`;
}

export function threadIdFromPinTaskId(taskId: string): string | null {
  if (!taskId.startsWith(PIN_TASK_ID_PREFIX)) return null;
  const threadId = taskId.slice(PIN_TASK_ID_PREFIX.length);
  return threadId ? threadId : null;
}

export function isPinTask(task: Pick<ProductionTask, "id">): boolean {
  return threadIdFromPinTaskId(task.id) !== null;
}

/* ------------------------------------------------------------------ */
/* 동기화 입력: 문서에서 뽑은 핀 요약                                    */
/* ------------------------------------------------------------------ */

/** 할 일 하나로 전환될 핀 하나. 본문은 표시용으로 정리된 값이다. */
export interface PinTaskSource {
  readonly threadId: string;
  readonly pageId: string;
  /** 페이지 안에서의 핀 순번 (사이드바·뷰어에 보이는 번호와 같다) */
  readonly pinNumber: number;
  /** 긴급 접두사를 제거한 본문 첫 줄. 비어 있으면 대체 문구가 들어간다. */
  readonly title: string;
  readonly status: ManuscriptPinStatus;
  readonly assigneeId: string | null;
  readonly assigneeName: string | null;
  readonly authorName: string;
  readonly createdAt: string;
}

function firstBodyLine(body: string): string {
  const line = stripManuscriptPinUrgentPrefix(body)
    .split(/\r?\n/u)
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  return line ?? "본문 없는 핀";
}

function truncateTitleBody(body: string): string {
  return body.length > PIN_TASK_TITLE_BODY_LIMIT
    ? `${body.slice(0, PIN_TASK_TITLE_BODY_LIMIT - 1)}…`
    : body;
}

/**
 * 댓글 문서 전체(모든 페이지)의 point 앵커 핀을 동기화 입력으로 변환한다.
 * 순번·상태·담당은 원고 핀 모델과 같은 규칙으로 계산해 화면과 어긋나지 않는다.
 */
export function pinTaskSourcesFromDocument(
  document: StudioCommentsDocument,
): PinTaskSource[] {
  const pageIds: string[] = [];
  const seenPages = new Set<string>();
  for (const thread of document.threads) {
    if (thread.anchor.type !== "point") continue;
    if (seenPages.has(thread.anchor.pageId)) continue;
    seenPages.add(thread.anchor.pageId);
    pageIds.push(thread.anchor.pageId);
  }
  const threadById = new Map(document.threads.map((thread) => [thread.id, thread]));
  const sources: PinTaskSource[] = [];
  for (const pageId of pageIds) {
    for (const pin of commentsDocumentToManuscriptPins(document, pageId)) {
      if (!pin.threadId) continue;
      const thread = threadById.get(pin.threadId);
      sources.push({
        threadId: pin.threadId,
        pageId,
        pinNumber: pin.number,
        title: firstBodyLine(thread?.body ?? ""),
        status: pin.status,
        assigneeId: pin.assigneeId ?? null,
        assigneeName: pin.assigneeName ?? null,
        authorName: pin.authorName,
        createdAt: pin.createdAt,
      });
    }
  }
  return sources.sort((a, b) => {
    const byTime = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (byTime !== 0) return byTime;
    return a.threadId.localeCompare(b.threadId);
  });
}

/* ------------------------------------------------------------------ */
/* 핀 → 할 일 변환·동기화                                               */
/* ------------------------------------------------------------------ */

export interface PinTaskSyncContext {
  /**
   * 핀 담당자 ID를 워크스페이스 담당 ID로 바꿀 때 지정한다.
   * 핀 담당자는 검수 aggregate의 배정 ID이고, 워크스페이스 할 일은 역할 배정 ID를
   * 쓰므로, 두 ID 공간이 다른 호스트는 여기서 변환해야 인박스에 바로 걸린다.
   * 지정하지 않으면 핀 담당자 ID를 그대로 쓴다.
   */
  readonly resolveAssigneeId?: (source: PinTaskSource) => string | null;
  /** 핀 생성 시각에서 날짜를 뽑을 수 없을 때 쓸 기한 (YYYY-MM-DD) */
  readonly fallbackDue?: string;
}

function dueDateFromCreatedAt(createdAt: string, fallbackDue: string | undefined): string {
  const match = /^(\d{4}-\d{2}-\d{2})/u.exec(createdAt);
  if (match) return match[1];
  if (fallbackDue && /^\d{4}-\d{2}-\d{2}$/u.test(fallbackDue)) return fallbackDue;
  // 생성 시각도 fallback도 날짜로 읽을 수 없으면 워크스페이스 팩토리 기본 날짜를 쓴다.
  // 형식이 깨진 기한을 만들면 저장 정규화(parseTask)가 할 일째로 버려 핀이 조용히 사라진다.
  return "1970-01-01";
}

function pinTaskTitle(source: PinTaskSource): string {
  return `핀 ${source.pinNumber} · ${truncateTitleBody(source.title)}`;
}

function resolvePinTaskAssigneeId(
  source: PinTaskSource,
  context: PinTaskSyncContext | undefined,
): string | null {
  if (context?.resolveAssigneeId) return context.resolveAssigneeId(source);
  return source.assigneeId;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** 새 핀 할 일을 만든다. 워크스페이스 정규화 규칙(기한 YYYY-MM-DD 등)을 만족하는 값만 쓴다. */
export function buildPinTask(
  source: PinTaskSource,
  context?: PinTaskSyncContext,
): ProductionTask {
  const resolved = source.status === "resolved";
  const assigneeId = resolvePinTaskAssigneeId(source, context);
  return {
    id: pinTaskIdForThread(source.threadId),
    title: pinTaskTitle(source),
    owner: source.assigneeName ?? source.authorName,
    due: dueDateFromCreatedAt(source.createdAt, context?.fallbackDue),
    progress: resolved ? 100 : 0,
    status: resolved ? "done" : "todo",
    stage: "review",
    priority: source.status === "urgent" ? "urgent" : "normal",
    role: null,
    hierarchyNodeId: null,
    dependencyIds: [],
    assigneeIds: assigneeId ? [assigneeId] : [],
    reviewerIds: [],
  };
}

/**
 * 기존 핀 할 일에 핀의 현재 상태를 반영한다.
 * 동기화가 소유하는 필드(제목·담당·우선순위·완료 여부)만 바꾸고,
 * 기한·단계·의존성·검토자·차단 사유처럼 사람이 다듬은 값은 그대로 둔다.
 * 바뀐 것이 없으면 기존 객체를 그대로 돌려준다.
 */
function refreshPinTask(
  existing: ProductionTask,
  source: PinTaskSource,
  context: PinTaskSyncContext | undefined,
): ProductionTask {
  const resolved = source.status === "resolved";
  const status: ProductionTask["status"] = resolved
    ? "done"
    : existing.status === "done"
      ? "todo"
      : existing.status;
  const progress = resolved ? 100 : existing.status === "done" ? 0 : existing.progress;
  const assigneeId = resolvePinTaskAssigneeId(source, context);
  const assigneeIds = assigneeId ? [assigneeId] : [];
  const title = pinTaskTitle(source);
  const owner = source.assigneeName ?? source.authorName;
  const priority = source.status === "urgent" ? "urgent" : "normal";
  if (
    existing.title === title
    && existing.owner === owner
    && existing.priority === priority
    && existing.status === status
    && existing.progress === progress
    && sameIds(existing.assigneeIds ?? [], assigneeIds)
  ) {
    return existing;
  }
  return { ...existing, title, owner, priority, status, progress, assigneeIds };
}

export interface PinTaskSyncResult {
  readonly tasks: readonly ProductionTask[];
  /** 새로 등록된 핀 할 일 ID */
  readonly addedTaskIds: readonly string[];
  /** 이번 동기화로 완료된 핀 할 일 ID */
  readonly completedTaskIds: readonly string[];
  /** 해결됐다가 다시 열려 되살아난 핀 할 일 ID */
  readonly reopenedTaskIds: readonly string[];
  /** 핀이 지워져 함께 정리된(손대지 않은) 핀 할 일 ID */
  readonly removedTaskIds: readonly string[];
  readonly changed: boolean;
}

/**
 * 할 일 목록을 핀 목록과 맞춘다 (멱등).
 * - 핀은 있는데 할 일이 없으면 등록한다.
 * - 핀이 해결되면 완료, 다시 열리면 재개한다.
 * - 핀이 지워진 할 일은 아직 시작 전(todo·진행률 0)일 때만 정리한다.
 *   손이 간 할 일은 임의로 지우지 않고 남긴다.
 * - 핀 할 일이 아닌 일반 할 일은 건드리지 않는다.
 */
export function syncPinTasks(
  tasks: readonly ProductionTask[],
  sources: readonly PinTaskSource[],
  context?: PinTaskSyncContext,
): PinTaskSyncResult {
  const sourceByThreadId = new Map(sources.map((source) => [source.threadId, source]));
  const addedTaskIds: string[] = [];
  const completedTaskIds: string[] = [];
  const reopenedTaskIds: string[] = [];
  const removedTaskIds: string[] = [];
  const next: ProductionTask[] = [];
  const seenThreadIds = new Set<string>();

  for (const task of tasks) {
    const threadId = threadIdFromPinTaskId(task.id);
    if (threadId === null) {
      next.push(task);
      continue;
    }
    const source = sourceByThreadId.get(threadId);
    if (!source) {
      if (task.status === "todo" && task.progress === 0) {
        removedTaskIds.push(task.id);
        continue;
      }
      next.push(task);
      continue;
    }
    seenThreadIds.add(threadId);
    const refreshed = refreshPinTask(task, source, context);
    if (refreshed !== task) {
      if (task.status !== "done" && refreshed.status === "done") completedTaskIds.push(task.id);
      if (task.status === "done" && refreshed.status !== "done") reopenedTaskIds.push(task.id);
    }
    next.push(refreshed);
  }

  for (const source of sources) {
    if (seenThreadIds.has(source.threadId)) continue;
    const created = buildPinTask(source, context);
    addedTaskIds.push(created.id);
    if (created.status === "done") completedTaskIds.push(created.id);
    next.push(created);
  }

  const changed = next.length !== tasks.length
    || next.some((task, index) => task !== tasks[index]);
  return {
    tasks: changed ? next : tasks,
    addedTaskIds,
    completedTaskIds,
    reopenedTaskIds,
    removedTaskIds,
    changed,
  };
}

/** 워크스페이스 단위 편의 함수. 바뀐 것이 없으면 같은 워크스페이스 객체를 돌려준다. */
export function applyPinTaskSyncToWorkspace(
  workspace: ProductionWorkspace,
  document: StudioCommentsDocument,
  context?: PinTaskSyncContext,
): { readonly workspace: ProductionWorkspace; readonly result: PinTaskSyncResult } {
  const result = syncPinTasks(
    workspace.tasks,
    pinTaskSourcesFromDocument(document),
    context,
  );
  if (!result.changed) return { workspace, result };
  return { workspace: { ...workspace, tasks: [...result.tasks] }, result };
}

/* ------------------------------------------------------------------ */
/* 미해결 모아보기                                                      */
/* ------------------------------------------------------------------ */

/** 미해결 핀 할 일을 과제 인박스 정렬 감각(긴급 → 기한 → 제목)으로 정렬한다. */
export function collectOpenPinTasks(
  tasks: readonly ProductionTask[],
): ProductionTask[] {
  return tasks
    .filter((task) => isPinTask(task) && task.status !== "done")
    .sort((a, b) => {
      const byPriority = (b.priority === "urgent" ? 1 : 0) - (a.priority === "urgent" ? 1 : 0);
      if (byPriority !== 0) return byPriority;
      const byDue = a.due.localeCompare(b.due);
      if (byDue !== 0) return byDue;
      return a.title.localeCompare(b.title);
    });
}

export interface PinTaskAssigneeGroup {
  /** 담당자 ID (없으면 "unassigned") */
  readonly key: string;
  /** 표시 이름. 담당이 없으면 빈 문자열이다 — 표시는 호스트가 맡는다. */
  readonly label: string;
  readonly tasks: readonly ProductionTask[];
  readonly urgentCount: number;
}

export interface PinTaskSummary {
  readonly openCount: number;
  readonly urgentOpenCount: number;
  readonly resolvedCount: number;
  /** 미해결 핀 할 일을 담당자별로 모은 그룹. 긴급이 많은 그룹이 먼저 온다. */
  readonly groups: readonly PinTaskAssigneeGroup[];
}

/** 핀 할 일 전체를 세어 미해결 모아보기 요약을 만든다. */
export function summarizePinTasks(tasks: readonly ProductionTask[]): PinTaskSummary {
  const pinTasks = tasks.filter(isPinTask);
  const open = collectOpenPinTasks(pinTasks);
  const groupsByKey = new Map<string, { label: string; tasks: ProductionTask[] }>();
  for (const task of open) {
    const key = task.assigneeIds?.[0] ?? "unassigned";
    const group = groupsByKey.get(key) ?? { label: task.owner, tasks: [] };
    group.tasks.push(task);
    groupsByKey.set(key, group);
  }
  const groups: PinTaskAssigneeGroup[] = [...groupsByKey.entries()]
    .map(([key, group]) => ({
      key,
      label: group.label,
      tasks: group.tasks,
      urgentCount: group.tasks.filter((task) => task.priority === "urgent").length,
    }))
    .sort((a, b) => (
      b.urgentCount - a.urgentCount
      || b.tasks.length - a.tasks.length
      || a.label.localeCompare(b.label)
    ));
  return {
    openCount: open.length,
    urgentOpenCount: open.filter((task) => task.priority === "urgent").length,
    resolvedCount: pinTasks.length - open.length,
    groups,
  };
}
