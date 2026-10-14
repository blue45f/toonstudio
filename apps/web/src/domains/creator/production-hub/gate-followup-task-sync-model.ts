/**
 * 단계 합의 게이트 후속 작업 → 할 일(제작 과제) 동기화 어댑터 — 순수 모델.
 *
 * 게이트 후속 작업은 게이트 모델(stage-consensus-gate-model)이 도출하고,
 * 할 일은 제작 워크스페이스(ProductionWorkspace.tasks)에 산다. 검수 핀 →
 * 할 일 동기화(pin-task-sync-model)와 같은 패턴으로 두 세계를 잇는다:
 *
 * - 후속 작업 ID가 곧 할 일 ID다 (`gate-followup:<gateId>:r<round>:<kind>…`).
 *   게이트 모델이 이미 결정적 ID를 보장하므로 재동기화해도 중복이 없다.
 * - 재작업·재검토 요청은 해소 라운드(resolvedByRound)가 생기면 자동 완료되고,
 *   해소가 취소되면(라운드가 정리되는 등) 다시 열린다.
 * - 조건 후속 작업은 게이트 모델 계약상 자동 해소되지 않는다 — 사람이 조건
 *   충족을 확인해 할 일을 완료로 표시하는 것이 유일한 닫기 방법이라,
 *   동기화는 완료된 조건 할 일을 되열지 않는다.
 * - 사람이 손으로 바꾼 값(기한·진행 중 상태·진행률·의존성)은 덮지 않는다.
 *   동기화가 소유하는 필드는 제목·담당·우선순위·단계·완료 여부뿐이다.
 * - 게이트 기록이 사라진 후속 할 일은 아직 시작 전(todo·진행률 0)일 때만
 *   정리한다. 손이 간 할 일은 임의로 지우지 않는다.
 * - 후속 작업이 아닌 일반 할 일은 건드리지 않는다.
 *
 * React·저장소에 의존하지 않으므로 호스트는 게이트가 바뀔 때마다
 * applyGateFollowUpSyncToWorkspace를 호출해 결과를 커밋하기만 하면 된다.
 * 동기화된 할 일은 일반 할 일과 같은 workspace.tasks에 있으므로 기존 통합
 * 작업함(역할 인박스)이 담당 배정만으로 그대로 집어 간다. 게이트 전용
 * 모아보기는 summarizeGateFollowUpTasks / GateFollowUpInboxSection이 맡는다.
 */

import type {
  ProductionStage,
  ProductionTask,
  ProductionWorkspace,
} from "../studio-production/studio-production-workspace";
import type { BilingualLabel } from "./production-labels";
import {
  buildStageGateFollowUps,
  type StageConsensusGate,
  type StageGateFollowUp,
  type StageGateFollowUpKind,
  type StageGateStageId,
} from "./stage-consensus-gate-model";

/** 게이트 후속 작업에서 자동 생성된 할 일의 ID 접두사. 후속 작업↔할 일 연결의 유일한 표식이다. */
export const GATE_FOLLOWUP_TASK_ID_PREFIX = "gate-followup:";

/** 할 일 제목에 넣는 사유·조건 본문의 최대 길이 (초과 시 말줄임). 핀 할 일과 같은 기준이다. */
const GATE_TASK_DETAIL_LIMIT = 80;

export function isGateFollowUpTask(task: Pick<ProductionTask, "id">): boolean {
  return followUpIdFromGateTaskId(task.id) !== null;
}

/** 할 일 ID에서 후속 작업 ID를 되뽑는다. 게이트 할 일이 아니면 null이다. */
export function followUpIdFromGateTaskId(taskId: string): string | null {
  if (!taskId.startsWith(GATE_FOLLOWUP_TASK_ID_PREFIX)) return null;
  // 접두사 뒤에 최소 `게이트ID:r<라운드>:<종류>`가 있어야 후속 작업 ID로 본다.
  return taskId.length > GATE_FOLLOWUP_TASK_ID_PREFIX.length ? taskId : null;
}

/**
 * 할 일 ID 끝부분에서 후속 작업 종류를 읽는다. 조건은 뒤에 `:<index>`가 붙는다.
 * 인박스 표시(종류 칩)가 게이트 기록 없이 할 일만으로 종류를 구분할 때 쓴다.
 */
export function gateFollowUpKindFromTaskId(taskId: string): StageGateFollowUpKind | null {
  if (followUpIdFromGateTaskId(taskId) === null) return null;
  if (/:rejection-rework$/u.test(taskId)) return "rejection-rework";
  if (/:rereview-request$/u.test(taskId)) return "rereview-request";
  if (/:condition:\d+$/u.test(taskId)) return "condition";
  return null;
}

export const GATE_FOLLOWUP_KIND_LABELS: Readonly<Record<StageGateFollowUpKind, BilingualLabel>> =
  Object.freeze({
    "rejection-rework": { ko: "반려 재작업", en: "Rejection rework" },
    condition: { ko: "합의 조건", en: "Consensus condition" },
    "rereview-request": { ko: "재검토 요청", en: "Re-review request" },
  });

/* ------------------------------------------------------------------ */
/* 후속 작업 → 할 일 변환                                               */
/* ------------------------------------------------------------------ */

/**
 * 게이트 단계 → 워크스페이스 공정 단계.
 * 기획 합의는 기획(planning), 콘티 합의는 콘티(storyboard), 스케치 합의는
 * 선화 전 러프(rough) 단계의 일이다. "review"로 뭉뚱그리면 공정 보드에서
 * 어느 단계의 일인지 사라지므로 실제 단계에 붙인다.
 */
const GATE_STAGE_TO_PRODUCTION_STAGE: Readonly<Record<StageGateStageId, ProductionStage>> =
  Object.freeze({
    plan: "planning",
    storyboard: "storyboard",
    art: "rough",
  });

export function productionStageForGateFollowUp(followUp: StageGateFollowUp): ProductionStage {
  return GATE_STAGE_TO_PRODUCTION_STAGE[followUp.stageId];
}

/**
 * 종류별 기본 우선순위. 반려 재작업과 재검토 요청은 단계 완료·게시를 막는
 * 일이므로 높음, 조건은 합의 자체는 끝난 뒤의 확인 일이라 보통이다.
 * (반려가 수정 요청인지 거부인지는 후속 작업 계약에 실리지 않아 구분하지 않는다.)
 */
const GATE_FOLLOWUP_PRIORITY: Readonly<Record<StageGateFollowUpKind, ProductionTask["priority"]>> =
  Object.freeze({
    "rejection-rework": "high",
    condition: "normal",
    "rereview-request": "high",
  });

export interface GateFollowUpTaskSyncContext {
  /**
   * 후속 작업 담당자 ID를 워크스페이스 담당 ID로 바꿀 때 지정한다.
   * 게이트 담당자는 회원 ID 공간이고 워크스페이스 할 일은 역할 배정 ID를
   * 쓸 수 있어, 두 ID 공간이 다른 호스트는 여기서 변환해야 인박스의
   * '내 담당' 매칭에 바로 걸린다. 지정하지 않으면 담당자 ID를 그대로 쓴다.
   */
  readonly resolveAssigneeId?: (followUp: StageGateFollowUp) => string | null;
  /**
   * 주의: 워크스페이스 저장 검증은 assigneeIds가 roleAssignments에 실재하는
   * 배정 ID 또는 그 memberId일 것을 요구한다(하나라도 어긋나면 워크스페이스
   * 전체가 저장·복원에서 거부된다). 기본값(게이트 담당자 = 회원 ID)은 역할
   * 배정이 그 회원을 memberId로 실을 때 그대로 통과하고, 그렇지 않은
   * 호스트는 이 훅으로 배정 ID로 바꿔야 한다.
   */
  /** 후속 작업 생성 시각에서 날짜를 뽑을 수 없을 때 쓸 기한 (YYYY-MM-DD) */
  readonly fallbackDue?: string;
}

function dueDateFromCreatedAt(createdAt: string, fallbackDue: string | undefined): string {
  const matchedDate = /^(\d{4}-\d{2}-\d{2})/u.exec(createdAt)?.[1];
  if (matchedDate) return matchedDate;
  if (fallbackDue && /^\d{4}-\d{2}-\d{2}$/u.test(fallbackDue)) return fallbackDue;
  // 생성 시각도 fallback도 날짜로 읽을 수 없으면 워크스페이스 팩토리 기본 날짜를 쓴다.
  // 형식이 깨진 기한을 만들면 저장 정규화(parseTask)가 할 일째로 버려 후속 작업이 조용히 사라진다.
  return "1970-01-01";
}

function firstDetailLine(detail: string): string {
  return (
    detail
      .split(/\r?\n/u)
      .map((part) => part.trim())
      .find((part) => part.length > 0) ?? ""
  );
}

function truncateDetail(detail: string): string {
  return detail.length > GATE_TASK_DETAIL_LIMIT
    ? `${detail.slice(0, GATE_TASK_DETAIL_LIMIT - 1)}…`
    : detail;
}

/**
 * 할 일 제목은 인박스에서 사유 원문을 다시 열지 않아도 무슨 일인지 알 수
 * 있어야 한다: 종류 제목(한국어) + 사유·조건 첫 줄. 전체 사유는 게이트
 * 패널이 원문 그대로 보여 주므로 여기서는 첫 줄만 싣는다.
 */
function gateFollowUpTaskTitle(followUp: StageGateFollowUp): string {
  const detail = truncateDetail(firstDetailLine(followUp.detail));
  return detail ? `${followUp.title.ko} · ${detail}` : followUp.title.ko;
}

function resolveGateFollowUpAssigneeId(
  followUp: StageGateFollowUp,
  context: GateFollowUpTaskSyncContext | undefined,
): string | null {
  if (context?.resolveAssigneeId) return context.resolveAssigneeId(followUp);
  return followUp.assigneeId;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** 후속 작업이 해소됐는가. 조건은 자동 해소가 없으므로 항상 false다(게이트 모델 계약). */
function isFollowUpResolved(followUp: StageGateFollowUp): boolean {
  return followUp.resolvedByRound !== null;
}

/** 새 게이트 후속 할 일을 만든다. 워크스페이스 정규화 규칙(기한 YYYY-MM-DD 등)을 만족하는 값만 쓴다. */
export function buildGateFollowUpTask(
  followUp: StageGateFollowUp,
  context?: GateFollowUpTaskSyncContext,
): ProductionTask {
  const resolved = isFollowUpResolved(followUp);
  const assigneeId = resolveGateFollowUpAssigneeId(followUp, context);
  return {
    id: followUp.id,
    title: gateFollowUpTaskTitle(followUp),
    owner: followUp.assigneeName ?? "",
    due: dueDateFromCreatedAt(followUp.createdAt, context?.fallbackDue),
    progress: resolved ? 100 : 0,
    status: resolved ? "done" : "todo",
    stage: productionStageForGateFollowUp(followUp),
    priority: GATE_FOLLOWUP_PRIORITY[followUp.kind],
    role: null,
    hierarchyNodeId: null,
    dependencyIds: [],
    assigneeIds: assigneeId ? [assigneeId] : [],
    reviewerIds: [],
  };
}

/**
 * 기존 게이트 후속 할 일에 후속 작업의 현재 상태를 반영한다.
 * - 해소된 후속 작업(재작업·재검토)은 완료로 닫는다.
 * - 아직 열린 재작업·재검토 할 일을 누군가 먼저 완료로 표시했어도, 해소
 *   신호가 없으면 다시 연다 — 닫는 권한은 게이트 흐름(재제출·재판정)에 있다.
 * - 조건 할 일은 예외다: 사람이 확인해 완료한 것을 동기화가 되열지 않는다.
 * - 진행 중(doing·blocked)인 할 일은 상태·진행률을 유지한다.
 * 바뀐 것이 없으면 기존 객체를 그대로 돌려준다.
 */
function refreshGateFollowUpTask(
  existing: ProductionTask,
  followUp: StageGateFollowUp,
  context: GateFollowUpTaskSyncContext | undefined,
): ProductionTask {
  const resolved = isFollowUpResolved(followUp);
  const manuallyClosable = followUp.kind === "condition";
  const status: ProductionTask["status"] = resolved
    ? "done"
    : existing.status === "done" && !manuallyClosable
      ? "todo"
      : existing.status;
  const progress = resolved ? 100 : status === "todo" && existing.status === "done" ? 0 : existing.progress;
  const assigneeId = resolveGateFollowUpAssigneeId(followUp, context);
  const assigneeIds = assigneeId ? [assigneeId] : [];
  const title = gateFollowUpTaskTitle(followUp);
  const owner = followUp.assigneeName ?? "";
  const priority = GATE_FOLLOWUP_PRIORITY[followUp.kind];
  const stage = productionStageForGateFollowUp(followUp);
  if (
    existing.title === title
    && existing.owner === owner
    && existing.priority === priority
    && existing.stage === stage
    && existing.status === status
    && existing.progress === progress
    && sameIds(existing.assigneeIds ?? [], assigneeIds)
  ) {
    return existing;
  }
  return { ...existing, title, owner, priority, stage, status, progress, assigneeIds };
}

/* ------------------------------------------------------------------ */
/* 동기화                                                               */
/* ------------------------------------------------------------------ */

export interface GateFollowUpTaskSyncResult {
  readonly tasks: readonly ProductionTask[];
  /** 새로 등록된 게이트 후속 할 일 ID */
  readonly addedTaskIds: readonly string[];
  /** 이번 동기화로 완료된 게이트 후속 할 일 ID */
  readonly completedTaskIds: readonly string[];
  /** 해소 없이 닫혀 있었다가 다시 열린 게이트 후속 할 일 ID */
  readonly reopenedTaskIds: readonly string[];
  /** 게이트 기록이 사라져 함께 정리된(손대지 않은) 게이트 후속 할 일 ID */
  readonly removedTaskIds: readonly string[];
  readonly changed: boolean;
}

/**
 * 할 일 목록을 게이트 후속 작업 목록과 맞춘다 (멱등).
 * - 후속 작업은 있는데 할 일이 없으면 등록한다.
 * - 후속 작업이 해소되면 완료, 해소가 사라지면 재개한다(조건 제외).
 * - 후속 작업이 사라진 할 일은 아직 시작 전(todo·진행률 0)일 때만 정리한다.
 * - 게이트 후속 할 일이 아닌 일반 할 일·핀 할 일은 건드리지 않는다.
 */
export function syncGateFollowUpTasks(
  tasks: readonly ProductionTask[],
  followUps: readonly StageGateFollowUp[],
  context?: GateFollowUpTaskSyncContext,
): GateFollowUpTaskSyncResult {
  const followUpById = new Map(followUps.map((followUp) => [followUp.id, followUp]));
  const addedTaskIds: string[] = [];
  const completedTaskIds: string[] = [];
  const reopenedTaskIds: string[] = [];
  const removedTaskIds: string[] = [];
  const next: ProductionTask[] = [];
  const seenFollowUpIds = new Set<string>();

  for (const task of tasks) {
    const followUpId = followUpIdFromGateTaskId(task.id);
    if (followUpId === null) {
      next.push(task);
      continue;
    }
    const followUp = followUpById.get(followUpId);
    if (!followUp) {
      if (task.status === "todo" && task.progress === 0) {
        removedTaskIds.push(task.id);
        continue;
      }
      next.push(task);
      continue;
    }
    seenFollowUpIds.add(followUpId);
    const refreshed = refreshGateFollowUpTask(task, followUp, context);
    if (refreshed !== task) {
      if (task.status !== "done" && refreshed.status === "done") completedTaskIds.push(task.id);
      if (task.status === "done" && refreshed.status !== "done") reopenedTaskIds.push(task.id);
    }
    next.push(refreshed);
  }

  for (const followUp of followUps) {
    if (seenFollowUpIds.has(followUp.id)) continue;
    const created = buildGateFollowUpTask(followUp, context);
    addedTaskIds.push(created.id);
    if (created.status === "done") completedTaskIds.push(created.id);
    next.push(created);
  }

  const changed = next.length !== tasks.length || next.some((task, index) => task !== tasks[index]);
  return {
    tasks: changed ? next : tasks,
    addedTaskIds,
    completedTaskIds,
    reopenedTaskIds,
    removedTaskIds,
    changed,
  };
}

/** 여러 게이트의 후속 작업을 한 번에 도출한다. 게이트 순서 → 라운드 순서 그대로다. */
export function gateFollowUpsFromGates(
  gates: readonly StageConsensusGate[],
): readonly StageGateFollowUp[] {
  return gates.flatMap((gate) => buildStageGateFollowUps(gate));
}

/** 워크스페이스 단위 편의 함수. 바뀐 것이 없으면 같은 워크스페이스 객체를 돌려준다. */
export function applyGateFollowUpSyncToWorkspace(
  workspace: ProductionWorkspace,
  gates: readonly StageConsensusGate[],
  context?: GateFollowUpTaskSyncContext,
): { readonly workspace: ProductionWorkspace; readonly result: GateFollowUpTaskSyncResult } {
  const result = syncGateFollowUpTasks(workspace.tasks, gateFollowUpsFromGates(gates), context);
  if (!result.changed) return { workspace, result };
  return { workspace: { ...workspace, tasks: [...result.tasks] }, result };
}

/* ------------------------------------------------------------------ */
/* 인박스 모아보기                                                      */
/* ------------------------------------------------------------------ */

const KIND_SORT_WEIGHT: Readonly<Record<StageGateFollowUpKind, number>> = Object.freeze({
  "rejection-rework": 0,
  "rereview-request": 1,
  condition: 2,
});

/** 미해결 게이트 후속 할 일을 인박스 정렬(반려 재작업 → 재검토 → 조건, 그 안에서 기한·제목)으로 정렬한다. */
export function collectOpenGateFollowUpTasks(
  tasks: readonly ProductionTask[],
): ProductionTask[] {
  return tasks
    .filter((task) => isGateFollowUpTask(task) && task.status !== "done")
    .sort((a, b) => {
      const byKind =
        (KIND_SORT_WEIGHT[gateFollowUpKindFromTaskId(a.id) ?? "condition"] ?? 2)
        - (KIND_SORT_WEIGHT[gateFollowUpKindFromTaskId(b.id) ?? "condition"] ?? 2);
      if (byKind !== 0) return byKind;
      const byDue = a.due.localeCompare(b.due);
      if (byDue !== 0) return byDue;
      return a.title.localeCompare(b.title);
    });
}

export interface GateFollowUpAssigneeGroup {
  /** 담당자 ID (없으면 "unassigned") */
  readonly key: string;
  /** 표시 이름. 담당이 없으면 빈 문자열이다 — 표시는 호스트가 맡는다. */
  readonly label: string;
  readonly tasks: readonly ProductionTask[];
  /** 이 그룹에서 단계 완료를 막고 있는 수 (반려 재작업 + 재검토 요청) */
  readonly blockingCount: number;
}

export interface GateFollowUpTaskSummary {
  readonly openCount: number;
  /** 단계 완료·게시를 막는 미해결 수 (반려 재작업 + 재검토 요청) */
  readonly blockingOpenCount: number;
  readonly openByKind: Readonly<Record<StageGateFollowUpKind, number>>;
  readonly resolvedCount: number;
  /** 미해결 게이트 후속 할 일을 담당자별로 모은 그룹. 막는 일이 많은 그룹이 먼저 온다. */
  readonly groups: readonly GateFollowUpAssigneeGroup[];
}

/** 게이트 후속 할 일 전체를 세어 인박스 모아보기 요약을 만든다. */
export function summarizeGateFollowUpTasks(
  tasks: readonly ProductionTask[],
): GateFollowUpTaskSummary {
  const gateTasks = tasks.filter(isGateFollowUpTask);
  const open = collectOpenGateFollowUpTasks(gateTasks);
  const openByKind: Record<StageGateFollowUpKind, number> = {
    "rejection-rework": 0,
    condition: 0,
    "rereview-request": 0,
  };
  for (const task of open) {
    const kind = gateFollowUpKindFromTaskId(task.id);
    if (kind) openByKind[kind] += 1;
  }
  const groupsByKey = new Map<string, { label: string; tasks: ProductionTask[] }>();
  for (const task of open) {
    const key = task.assigneeIds?.[0] ?? "unassigned";
    const group = groupsByKey.get(key) ?? { label: task.owner, tasks: [] };
    group.tasks.push(task);
    groupsByKey.set(key, group);
  }
  const groups: GateFollowUpAssigneeGroup[] = [...groupsByKey.entries()]
    .map(([key, group]) => ({
      key,
      label: group.label,
      tasks: group.tasks,
      blockingCount: group.tasks.filter(
        (task) => gateFollowUpKindFromTaskId(task.id) !== "condition",
      ).length,
    }))
    .sort(
      (a, b) =>
        b.blockingCount - a.blockingCount
        || b.tasks.length - a.tasks.length
        || a.label.localeCompare(b.label),
    );
  return {
    openCount: open.length,
    blockingOpenCount: openByKind["rejection-rework"] + openByKind["rereview-request"],
    openByKind,
    resolvedCount: gateTasks.length - open.length,
    groups,
  };
}
