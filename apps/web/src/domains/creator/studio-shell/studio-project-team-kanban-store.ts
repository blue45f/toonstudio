/**
 * 프로젝트별 5단계 제작 칸반 상태·담당자·인계 이력 영속 스토어 (AC-010).
 * 브라우저 재방문·리로드 시에도 공정 진행 상태와 인계 메모·타임스탬프를 복원한다.
 */

export const KANBAN_STAGE_ORDER = [
  "storyboard",
  "bg3d",
  "lineart",
  "coloring",
  "lettering",
] as const;

export type KanbanStageId = (typeof KANBAN_STAGE_ORDER)[number];

export const KANBAN_STAGE_STATUSES = [
  "todo",
  "in_progress",
  "review_requested",
  "approved",
] as const;

export type KanbanStageStatus = (typeof KANBAN_STAGE_STATUSES)[number];

export interface KanbanStageRecord {
  readonly status: KanbanStageStatus;
  readonly assignee: string;
  readonly lastHandoffMemo: string;
  readonly updatedAt: string | null;
}

export interface KanbanHandoffEntry {
  readonly id: string;
  readonly fromStageId: KanbanStageId;
  readonly toStageId: KanbanStageId | "publish";
  readonly fromAssignee: string;
  readonly toAssignee: string;
  readonly memo: string;
  readonly handedOffAt: string;
}

export interface ProjectKanbanBoardState {
  readonly version: 1;
  readonly projectId: string;
  readonly stages: Readonly<Record<KanbanStageId, KanbanStageRecord>>;
  readonly handoffs: readonly KanbanHandoffEntry[];
}

export interface KanbanStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const MAX_HANDOFF_HISTORY = 30;
const STATUS_SET = new Set<string>(KANBAN_STAGE_STATUSES);
const STAGE_SET = new Set<string>(KANBAN_STAGE_ORDER);

export function kanbanStorageKey(projectId: string): string {
  return `toonstudio:project-team-kanban:v1:${encodeURIComponent(projectId.trim() || "default")}`;
}

export function createDefaultProjectKanbanState(projectId: string): ProjectKanbanBoardState {
  const emptyRecord = (): KanbanStageRecord => ({
    status: "todo",
    assignee: "",
    lastHandoffMemo: "",
    updatedAt: null,
  });
  return {
    version: 1,
    projectId,
    stages: {
      storyboard: emptyRecord(),
      bg3d: emptyRecord(),
      lineart: emptyRecord(),
      coloring: emptyRecord(),
      lettering: emptyRecord(),
    },
    handoffs: [],
  };
}

function normalizeStageRecord(raw: unknown): KanbanStageRecord {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { status: "todo", assignee: "", lastHandoffMemo: "", updatedAt: null };
  }
  const obj = raw as Record<string, unknown>;
  const status =
    typeof obj.status === "string" && STATUS_SET.has(obj.status)
      ? (obj.status as KanbanStageStatus)
      : "todo";
  const assignee = typeof obj.assignee === "string" ? obj.assignee.slice(0, 60) : "";
  const lastHandoffMemo =
    typeof obj.lastHandoffMemo === "string" ? obj.lastHandoffMemo.slice(0, 240) : "";
  const updatedAt = typeof obj.updatedAt === "string" && obj.updatedAt.trim() ? obj.updatedAt : null;
  return { status, assignee, lastHandoffMemo, updatedAt };
}

function normalizeHandoffEntry(raw: unknown): KanbanHandoffEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string" || !obj.id.trim()) return null;
  if (typeof obj.fromStageId !== "string" || !STAGE_SET.has(obj.fromStageId)) return null;
  const toStageId =
    obj.toStageId === "publish" || (typeof obj.toStageId === "string" && STAGE_SET.has(obj.toStageId))
      ? (obj.toStageId as KanbanStageId | "publish")
      : null;
  if (!toStageId) return null;
  if (typeof obj.handedOffAt !== "string" || !obj.handedOffAt.trim()) return null;
  return {
    id: obj.id,
    fromStageId: obj.fromStageId as KanbanStageId,
    toStageId,
    fromAssignee: typeof obj.fromAssignee === "string" ? obj.fromAssignee.slice(0, 60) : "",
    toAssignee: typeof obj.toAssignee === "string" ? obj.toAssignee.slice(0, 60) : "",
    memo: typeof obj.memo === "string" ? obj.memo.slice(0, 240) : "",
    handedOffAt: obj.handedOffAt,
  };
}

export function loadProjectKanbanState(
  storage: KanbanStorageLike | null | undefined,
  projectId: string,
): ProjectKanbanBoardState {
  const fallback = createDefaultProjectKanbanState(projectId);
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(kanbanStorageKey(projectId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    const rawStages =
      parsed.stages && typeof parsed.stages === "object" && !Array.isArray(parsed.stages)
        ? (parsed.stages as Record<string, unknown>)
        : {};
    const stages = {
      storyboard: normalizeStageRecord(rawStages.storyboard),
      bg3d: normalizeStageRecord(rawStages.bg3d),
      lineart: normalizeStageRecord(rawStages.lineart),
      coloring: normalizeStageRecord(rawStages.coloring),
      lettering: normalizeStageRecord(rawStages.lettering),
    };
    const handoffs = Array.isArray(parsed.handoffs)
      ? parsed.handoffs
          .map(normalizeHandoffEntry)
          .filter((entry): entry is KanbanHandoffEntry => entry !== null)
          .slice(0, MAX_HANDOFF_HISTORY)
      : [];
    return {
      version: 1,
      projectId,
      stages,
      handoffs,
    };
  } catch {
    return fallback;
  }
}

export function saveProjectKanbanState(
  storage: KanbanStorageLike | null | undefined,
  state: ProjectKanbanBoardState,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(kanbanStorageKey(state.projectId), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function updateKanbanStageStatus(
  state: ProjectKanbanBoardState,
  stageId: KanbanStageId,
  status: KanbanStageStatus,
  nowIso: string = new Date().toISOString(),
): ProjectKanbanBoardState {
  return {
    ...state,
    stages: {
      ...state.stages,
      [stageId]: {
        ...state.stages[stageId],
        status,
        updatedAt: nowIso,
      },
    },
  };
}

export function updateKanbanStageAssignee(
  state: ProjectKanbanBoardState,
  stageId: KanbanStageId,
  assignee: string,
  nowIso: string = new Date().toISOString(),
): ProjectKanbanBoardState {
  return {
    ...state,
    stages: {
      ...state.stages,
      [stageId]: {
        ...state.stages[stageId],
        assignee: assignee.slice(0, 60),
        updatedAt: nowIso,
      },
    },
  };
}

export function nextKanbanStageId(stageId: KanbanStageId): KanbanStageId | "publish" {
  const index = KANBAN_STAGE_ORDER.indexOf(stageId);
  return index >= 0 && index < KANBAN_STAGE_ORDER.length - 1
    ? KANBAN_STAGE_ORDER[index + 1]!
    : "publish";
}

export function handoffKanbanStage(
  state: ProjectKanbanBoardState,
  stageId: KanbanStageId,
  memo: string,
  nowIso: string = new Date().toISOString(),
): ProjectKanbanBoardState {
  const trimmedMemo = memo.trim().slice(0, 240);
  const toStageId = nextKanbanStageId(stageId);
  const fromRecord = state.stages[stageId];
  const nextStages: Record<KanbanStageId, KanbanStageRecord> = {
    ...state.stages,
    [stageId]: {
      ...fromRecord,
      status: "approved",
      lastHandoffMemo: trimmedMemo,
      updatedAt: nowIso,
    },
  };

  let toAssignee = "";
  if (toStageId !== "publish") {
    const targetRecord = state.stages[toStageId];
    toAssignee = targetRecord.assignee;
    nextStages[toStageId] = {
      ...targetRecord,
      status: targetRecord.status === "todo" ? "in_progress" : targetRecord.status,
      updatedAt: nowIso,
    };
  }

  const entry: KanbanHandoffEntry = {
    id: `handoff:${stageId}:${toStageId}:${nowIso}:${state.handoffs.length + 1}`,
    fromStageId: stageId,
    toStageId,
    fromAssignee: fromRecord.assignee.trim(),
    toAssignee: toAssignee.trim(),
    memo: trimmedMemo,
    handedOffAt: nowIso,
  };

  return {
    ...state,
    stages: nextStages,
    handoffs: [entry, ...state.handoffs].slice(0, MAX_HANDOFF_HISTORY),
  };
}

export function summarizeKanbanBoard(state: ProjectKanbanBoardState): {
  readonly approvedCount: number;
  readonly inProgressCount: number;
  readonly reviewRequestedCount: number;
  readonly todoCount: number;
  readonly progressPercent: number;
} {
  let approvedCount = 0;
  let inProgressCount = 0;
  let reviewRequestedCount = 0;
  let todoCount = 0;

  for (const id of KANBAN_STAGE_ORDER) {
    const status = state.stages[id].status;
    if (status === "approved") approvedCount += 1;
    else if (status === "in_progress") inProgressCount += 1;
    else if (status === "review_requested") reviewRequestedCount += 1;
    else todoCount += 1;
  }

  const progressPercent = Math.round(
    ((approvedCount + reviewRequestedCount * 0.7 + inProgressCount * 0.35) /
      KANBAN_STAGE_ORDER.length) *
      100,
  );

  return {
    approvedCount,
    inProgressCount,
    reviewRequestedCount,
    todoCount,
    progressPercent,
  };
}
