import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  GitBranch,
  ListFilter,
  Plus,
  Users,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import {
  forecastProductionSchedule,
  type ProductionProjectAggregate,
  type ProductionTask,
  type ProductionTaskStatus,
} from "@toonstudio/core/production";

import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";

import type { ProductionClientCommand } from "./production-api";
import {
  PRODUCTION_PROCESS_LABELS,
  scheduleRiskLabel,
  scopeKindLabel,
  taskStatusLabel,
  type ProductionLocalize,
  type ScheduleRiskLevel,
} from "./production-labels";
import { deriveProductionOperationsOverview } from "./production-episode-operations";
import { deriveAssignmentWorkload } from "./production-management-overview";
import {
  deriveProductionRiskIntelligence,
  type ProductionRiskSignal,
} from "./production-risk-intelligence";
import { ProductionBatchScheduleSuite } from "./ProductionBatchScheduleSuite";
import { ProductionNotionKnowledgeCalendarSuite } from "./ProductionNotionKnowledgeCalendarSuite";
import { ProductionPmsBlueprintSuite } from "./ProductionPmsBlueprintSuite";
import "./production-schedule-workspace.css";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import { useT } from "@/shared/lib/i18n";

export type ScheduleView = "timeline" | "calendar" | "list" | "workload";
export type ScheduleSortKey = "due-asc" | "risk-desc" | "hours-desc" | "title-asc";
type ExecuteCommand = (command: ProductionClientCommand, message: string) => Promise<void>;
type RiskLevel = ScheduleRiskLevel;

interface TaskInlineDraft {
  readonly taskId: string;
  readonly title: string;
  readonly processKey: string;
  readonly assignmentId: string;
  readonly likelyHours: string;
  readonly dueDate: string;
}

export interface ProductionScheduleWorkspaceProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly execute: ExecuteCommand;
  readonly canEdit: boolean;
}

const DAY_MS = 86_400_000;
const DATE_LABEL = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", weekday: "short" });
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const STATUS_OPTIONS: readonly ProductionTaskStatus[] = [
  "draft",
  "needs-input",
  "ready",
  "in-progress",
  "internal-review",
  "external-review",
  "changes-requested",
  "conditionally-approved",
  "approved",
  "done",
  "blocked",
  "paused",
  "cancelled",
  "out-of-scope",
];
const PROCESS_OPTIONS = Object.keys(PRODUCTION_PROCESS_LABELS);
const RISK_PRIORITY: Readonly<Record<RiskLevel, number>> = {
  overdue: 5,
  predicted: 4,
  forecast: 3,
  attention: 2,
  normal: 1,
};

function dateOnly(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = DATE_ONLY_PATTERN.exec(trimmed);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const localDate = new Date(year, month - 1, day, 9, 0, 0, 0);
    if (Number.isFinite(localDate.getTime()) && localDate.getFullYear() === year && localDate.getMonth() === month - 1 && localDate.getDate() === day) return localDate;
    return null;
  }
  const date = new Date(trimmed);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dueIsoFromDateInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = parseDate(trimmed);
  if (!parsed) return null;
  const year = parsed.getFullYear();
  if (year < 1970 || year > 2100) return null;
  return new Date(`${dateOnly(parsed)}T09:00:00`).toISOString();
}

function addDays(value: Date, amount: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function formatDueRelativeBadge(task: ProductionTask, now: Date): string {
  if (task.status === "done" || task.status === "approved") return "완료";
  const due = parseDate(task.dueAt);
  if (!due) return "마감 미정";
  const diffDays = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / DAY_MS);
  if (diffDays === 0) return "D-Day";
  if (diffDays > 0) return `D-${diffDays}`;
  return `D+${Math.abs(diffDays)} 지연`;
}

function taskRisk(
  task: ProductionTask,
  now: Date,
  signals: readonly ProductionRiskSignal[] = [],
  slackHours?: number | null,
): RiskLevel {
  if (["done", "approved", "cancelled", "out-of-scope"].includes(task.status)) return "normal";
  const due = parseDate(task.dueAt);
  if (due && due.getTime() < now.getTime()) return "overdue";
  if (signals.some((signal) =>
    signal.source === "derived"
    && (signal.severity === "critical" || signal.severity === "high"))) return "predicted";
  if (typeof slackHours === "number" && slackHours < 0) return "forecast";
  if (task.status === "blocked" || task.status === "changes-requested") return "attention";
  if (due && startOfDay(due).getTime() - startOfDay(now).getTime() <= DAY_MS * 2) return "attention";
  return "normal";
}

function assignmentLabel(aggregate: ProductionProjectAggregate, assignmentId: string): string {
  const assignment = aggregate.assignments.find((entry) => entry.id === assignmentId);
  const party = assignment ? aggregate.parties.find((entry) => entry.id === assignment.partyId) : null;
  return party?.publicDisplayName ?? assignmentId;
}

/** 공정 코드를 사람이 읽는 공정명으로. 팀 공정 설정의 이름은 이 표면에서 알 수 없어 정본 이름표를 쓴다. */
function processLabel(processKey: string, localize: ProductionLocalize): string {
  const label = PRODUCTION_PROCESS_LABELS[canonicalProductionProcessKey(processKey)];
  return label ? localize(label.ko, label.en) : processKey;
}

function taskHours(task: ProductionTask): number {
  return task.estimateHours?.likely ?? 0;
}

function scopeLabel(task: ProductionTask, localize: ProductionLocalize): string {
  return `${scopeKindLabel(task.scope.kind, localize)} · ${task.scope.id}`;
}

function riskClass(risk: RiskLevel): string {
  if (risk === "overdue") return "border-bad/35 bg-bad/10 text-bad";
  if (risk === "predicted") return "border-warn/50 bg-warn/15 text-warn";
  if (risk === "attention" || risk === "forecast") return "border-warn/35 bg-warn/10 text-warn";
  return "border-line bg-raised text-fg-2";
}

function statusClass(status: ProductionTaskStatus): string {
  if (status === "done" || status === "approved") return "border-good/35 bg-good/10 text-good";
  if (status === "blocked" || status === "changes-requested") return "border-bad/35 bg-bad/10 text-bad";
  if (status === "in-progress" || status === "internal-review" || status === "external-review") return "border-accent/35 bg-accent-soft text-accent";
  if (status === "paused" || status === "needs-input") return "border-warn/35 bg-warn/10 text-warn";
  return "border-line bg-raised text-fg-2";
}

export function ProductionScheduleWorkspace({
  aggregate,
  execute,
  canEdit,
}: ProductionScheduleWorkspaceProps) {
  const t = useT();
  const bt = useBilingual("ProductionScheduleWorkspace.labels");
  const now = useMemo(() => new Date(), []);
  const schedule = useMemo(() => forecastProductionSchedule(aggregate, now), [aggregate, now]);
  const dueDates = aggregate.tasks.map((task) => parseDate(task.dueAt)).filter((date): date is Date => date !== null);
  const initialStart = dueDates.length > 0
    ? addDays(new Date(Math.min(...dueDates.map((date) => date.getTime()))), -3)
    : addDays(now, -2);
  const [view, setView] = useState<ScheduleView>("timeline");
  const [windowStart, setWindowStart] = useState(startOfDay(initialStart));
  const [query, setQuery] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ProductionTaskStatus>("all");
  const [sortBy, setSortBy] = useState<ScheduleSortKey>("due-asc");
  const [editingDraft, setEditingDraft] = useState<TaskInlineDraft | null>(null);
  const activeAssignments = useMemo(
    () => aggregate.assignments.filter((entry) => entry.status === "active"),
    [aggregate.assignments],
  );
  const riskTranslate = useMemo(
    () => (key: string, fallback: string, values?: Readonly<Record<string, string | number>>) =>
      values ? t(key, values, fallback) : t(key, fallback),
    [t],
  );
  const riskIntelligence = useMemo(() => {
    const operations = deriveProductionOperationsOverview(aggregate, now);
    return deriveProductionRiskIntelligence(aggregate, {
      now,
      operations,
      workload: deriveAssignmentWorkload(aggregate, now),
      translate: riskTranslate,
    });
  }, [aggregate, now, riskTranslate]);
  const riskSignalsByTask = useMemo(() => {
    const byTask = new Map<string, ProductionRiskSignal[]>();
    for (const signal of riskIntelligence.signals) {
      if (!signal.taskId) continue;
      const current = byTask.get(signal.taskId) ?? [];
      current.push(signal);
      byTask.set(signal.taskId, current);
    }
    return byTask;
  }, [riskIntelligence.signals]);

  const days = useMemo(
    () => Array.from({ length: 14 }, (_, index) => addDays(windowStart, index)),
    [windowStart],
  );

  const hasActiveFilters = query.trim().length > 0 || assignmentFilter !== "all" || riskFilter !== "all" || statusFilter !== "all";

  const resetFilters = () => { setQuery(""); setAssignmentFilter("all"); setRiskFilter("all"); setStatusFilter("all"); };

  const tasks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    const filtered = aggregate.tasks.filter((task) => {
      const localizedProcess = processLabel(task.processKey, bt).toLocaleLowerCase("ko-KR");
      const localizedScope = scopeLabel(task, bt).toLocaleLowerCase("ko-KR");
      const assigneeNames = task.assignmentIds
        .map((id) => assignmentLabel(aggregate, id).toLocaleLowerCase("ko-KR"))
        .join(" ");
      const matchesQuery = !normalized || [task.title, task.processKey, localizedProcess, task.scope.id, localizedScope, assigneeNames].some((field) => field.toLocaleLowerCase("ko-KR").includes(normalized));
      const matchesAssignment = assignmentFilter === "all" ? true : assignmentFilter === "unassigned" ? task.assignmentIds.length === 0 : task.assignmentIds.includes(assignmentFilter);
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const risk = taskRisk(task, now, riskSignalsByTask.get(task.id), schedule.byTaskId[task.id]?.slackHours);
      const matchesRisk = riskFilter === "all" || riskFilter === risk;
      return matchesQuery && matchesAssignment && matchesStatus && matchesRisk;
    });

    if (sortBy === "due-asc") {
      return [...filtered].sort((left, right) => {
        const leftDue = parseDate(left.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightDue = parseDate(right.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (leftDue !== rightDue) return leftDue - rightDue;
        return left.title.localeCompare(right.title, "ko");
      });
    }
    if (sortBy === "risk-desc") {
      return [...filtered].sort((left, right) => {
        const leftRisk = RISK_PRIORITY[taskRisk(left, now, riskSignalsByTask.get(left.id), schedule.byTaskId[left.id]?.slackHours)];
        const rightRisk = RISK_PRIORITY[taskRisk(right, now, riskSignalsByTask.get(right.id), schedule.byTaskId[right.id]?.slackHours)];
        if (rightRisk !== leftRisk) return rightRisk - leftRisk;
        return left.title.localeCompare(right.title, "ko");
      });
    }
    if (sortBy === "hours-desc") {
      return [...filtered].sort((left, right) => taskHours(right) - taskHours(left));
    }
    return [...filtered].sort((left, right) => left.title.localeCompare(right.title, "ko"));
  }, [aggregate, assignmentFilter, bt, now, query, riskFilter, riskSignalsByTask, schedule.byTaskId, sortBy, statusFilter]);

  const saveTask = (task: ProductionTask, patch: Partial<ProductionTask>, message: string) => {
    if (!canEdit) return;
    void execute({ type: "upsert-task", task: { ...task, ...patch } }, message);
  };

  const shiftTaskDueByDays = (task: ProductionTask, deltaDays: number) => {
    if (!canEdit) return;
    const base = parseDate(task.dueAt) ?? startOfDay(now);
    const nextDate = addDays(startOfDay(base), deltaDays);
    const nextIso = new Date(`${dateOnly(nextDate)}T09:00:00`).toISOString();
    const label = deltaDays > 0 ? `+${deltaDays}일` : `${deltaDays}일`;
    saveTask(task, { dueAt: nextIso }, `${task.title} 마감일을 ${label} 조정했습니다.`);
  };

  const jumpToTaskWindow = (task: ProductionTask) => {
    const due = parseDate(task.dueAt);
    if (!due) return;
    setWindowStart(startOfDay(addDays(due, -3)));
  };

  const openInlineEditor = (task: ProductionTask) => { const due = parseDate(task.dueAt); setEditingDraft({ taskId: task.id, title: task.title, processKey: canonicalProductionProcessKey(task.processKey), assignmentId: task.assignmentIds[0] ?? "", likelyHours: String(taskHours(task)), dueDate: due ? dateOnly(due) : "" }); };

  const submitInlineEditor = (event: FormEvent<HTMLFormElement>, task: ProductionTask) => {
    event.preventDefault();
    if (!canEdit || !editingDraft || editingDraft.taskId !== task.id) return;
    const nextTitle = editingDraft.title.trim() || task.title;
    const parsedLikely = Number(editingDraft.likelyHours);
    const likely = Number.isFinite(parsedLikely) && parsedLikely >= 0
      ? Math.min(999, Math.round(parsedLikely))
      : taskHours(task);
    const nextDueAt = editingDraft.dueDate.trim() === ""
      ? null
      : (dueIsoFromDateInput(editingDraft.dueDate) ?? task.dueAt);
    saveTask(task, { title: nextTitle, processKey: editingDraft.processKey, assignmentIds: editingDraft.assignmentId ? [editingDraft.assignmentId] : [], estimateHours: { optimistic: Math.max(1, Math.floor(likely * 0.6)), likely, pessimistic: Math.max(likely + 2, Math.ceil(likely * 1.5)) }, dueAt: nextDueAt }, `${nextTitle} 세부 일정을 저장했습니다.`);
    setEditingDraft(null);
  };

  const createTask = async () => {
    if (!canEdit) return;
    const producer = aggregate.assignments.find((assignment) => assignment.status === "active" && assignment.roleType === "producer");
    const task: ProductionTask = {
      id: `task-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
      projectId: aggregate.projectId,
      scope: { kind: "project", id: aggregate.projectId, ancestors: [] },
      processKey: "planning",
      title: "새 제작 작업",
      status: "draft",
      assignmentIds: producer ? [producer.id] : [],
      reviewerAssignmentIds: [],
      inputRevisionRefs: [],
      outputDeliverableIds: [],
      dependencyTaskIds: [],
      dueAt: addDays(now, 7).toISOString(),
      estimateHours: { optimistic: 2, likely: 4, pessimistic: 8 },
      completionCriteria: ["완료 기준을 정의하세요."],
      sourceAgreementMilestoneId: null,
    };
    await execute({ type: "upsert-task", task }, "새 제작 작업을 만들었습니다.");
  };

  const workload = useMemo(() => activeAssignments
    .map((assignment) => {
      const assignedTasks = tasks.filter((task) => task.assignmentIds.includes(assignment.id));
      return {
        assignment,
        name: assignmentLabel(aggregate, assignment.id),
        tasks: assignedTasks,
        hours: assignedTasks.reduce((sum, task) => sum + taskHours(task), 0),
        attention: assignedTasks.filter((task) => taskRisk(
          task,
          now,
          riskSignalsByTask.get(task.id),
          schedule.byTaskId[task.id]?.slackHours,
        ) !== "normal").length,
      };
    })
    .filter((entry) => entry.tasks.length > 0)
    .sort((left, right) => right.hours - left.hours), [activeAssignments, aggregate, now, riskSignalsByTask, schedule.byTaskId, tasks]);

  const calendarTasksByDateKey = useMemo(() => {
    const map = new Map<string, ProductionTask[]>();
    for (const day of days) {
      map.set(dateOnly(day), []);
    }
    for (const task of tasks) {
      const due = parseDate(task.dueAt);
      if (!due) continue;
      const key = dateOnly(due);
      if (map.has(key)) {
        const list = map.get(key) ?? [];
        list.push(task);
        map.set(key, list);
      }
    }
    return map;
  }, [days, tasks]);

  const calendarOutsideOrUndatedTasks = useMemo(() => {
    const windowKeys = new Set(days.map((day) => dateOnly(day)));
    return tasks.filter((task) => {
      const due = parseDate(task.dueAt);
      return !due || !windowKeys.has(dateOnly(due));
    });
  }, [days, tasks]);

  const riskForTask = (task: ProductionTask) => taskRisk(task, now, riskSignalsByTask.get(task.id), schedule.byTaskId[task.id]?.slackHours);
  const overdueCount = tasks.filter((task) => riskForTask(task) === "overdue").length;
  const predictedCount = tasks.filter((task) => riskForTask(task) === "predicted").length;
  const forecastCount = tasks.filter((task) => riskForTask(task) === "forecast").length;
  const attentionCount = tasks.filter((task) => riskForTask(task) === "attention").length;
  const scheduledHours = tasks.reduce((sum, task) => sum + taskHours(task), 0);

  const renderInlineEditor = (task: ProductionTask) => {
    if (!editingDraft || editingDraft.taskId !== task.id) return null;
    return (
      <form aria-label={`${task.title} 상세 편집 폼`} onSubmit={(event) => submitInlineEditor(event, task)} className="mt-2.5 grid gap-2 rounded-xl border border-line bg-panel p-2.5 text-xs">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid min-w-0 gap-1"><span className="text-[0.6875rem] font-semibold text-fg-2">작업 제목</span><input type="text" aria-label={`${task.title} 제목 편집`} value={editingDraft.title} disabled={!canEdit} onChange={(event) => setEditingDraft((current) => current ? { ...current, title: event.target.value } : current)} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg outline-none" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid min-w-0 gap-1"><span className="text-[0.6875rem] font-semibold text-fg-2">공정</span><select aria-label={`${task.title} 공정 편집`} value={editingDraft.processKey} disabled={!canEdit} onChange={(event) => setEditingDraft((current) => current ? { ...current, processKey: event.target.value } : current)} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg outline-none">{PROCESS_OPTIONS.map((processKey) => <option key={processKey} value={processKey}>{processLabel(processKey, bt)}</option>)}</select></label>
            <label className="grid min-w-0 gap-1"><span className="text-[0.6875rem] font-semibold text-fg-2">담당자</span><select aria-label={`${task.title} 담당자 편집`} value={editingDraft.assignmentId} disabled={!canEdit} onChange={(event) => setEditingDraft((current) => current ? { ...current, assignmentId: event.target.value } : current)} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg outline-none"><option value="">담당 미지정</option>{activeAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignmentLabel(aggregate, assignment.id)}</option>)}</select></label>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="grid min-w-0 gap-1"><span className="text-[0.6875rem] font-semibold text-fg-2">예상 공수(h)</span><input type="number" min={0} max={999} aria-label={`${task.title} 예상 공수 편집`} value={editingDraft.likelyHours} disabled={!canEdit} onChange={(event) => setEditingDraft((current) => current ? { ...current, likelyHours: event.target.value } : current)} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg outline-none" /></label>
          <label className="grid min-w-0 gap-1"><span className="text-[0.6875rem] font-semibold text-fg-2">마감일</span><input type="date" aria-label={`${task.title} 상세 마감일 편집`} value={editingDraft.dueDate} disabled={!canEdit} onChange={(event) => setEditingDraft((current) => current ? { ...current, dueDate: event.target.value } : current)} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg outline-none" /></label>
          <div className="flex flex-wrap items-end justify-end gap-1.5">
            <button type="button" onClick={() => setEditingDraft(null)} className="min-h-8 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 hover:bg-raised">취소</button>
            <button type="submit" disabled={!canEdit} className="min-h-8 rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent disabled:opacity-50">저장</button>
          </div>
        </div>
      </form>
    );
  };

  const renderEmptyFilteredTasks = () => (
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
      <p className="text-sm font-semibold text-fg-2">{t("productionHub.schedule.emptyFilteredTasks", "현재 필터에 맞는 작업이 없습니다.")}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {hasActiveFilters ? <button type="button" onClick={resetFilters} className="min-h-9 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg hover:bg-raised">필터 초기화</button> : null}
        <button type="button" disabled={!canEdit} onClick={() => void createTask()} className={buttonClass({ size: "sm" })}><Plus className="size-4" aria-hidden="true" />새 작업 추가</button>
      </div>
    </div>
  );

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-card shadow-sm" data-production-schedule-workspace>
      <header className="border-b border-line bg-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-accent"><CalendarClock className="size-4" aria-hidden="true" /><p className="text-[0.6875rem] font-black uppercase tracking-[0.14em]">Production Schedule</p></div>
            <h2 className="mt-1 text-lg font-black text-fg">일정·용량 작업실</h2>
            <p className="mt-1 text-xs leading-5 text-fg-2">마감, 선행 작업, 담당자와 예상 공수를 타임라인·캘린더·목록·워크로드에서 조율합니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="production-schedule-view-switcher flex flex-wrap rounded-xl border border-line bg-card p-1" role="group" aria-label="일정 보기 방식">
              <button type="button" aria-pressed={view === "timeline"} className={cn("min-h-9 rounded-lg px-3 text-xs font-semibold", view === "timeline" ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised")} onClick={() => setView("timeline")}>타임라인</button>
              <button type="button" aria-pressed={view === "calendar"} className={cn("min-h-9 rounded-lg px-3 text-xs font-semibold", view === "calendar" ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised")} onClick={() => setView("calendar")}>캘린더</button>
              <button type="button" aria-pressed={view === "list"} className={cn("min-h-9 rounded-lg px-3 text-xs font-semibold", view === "list" ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised")} onClick={() => setView("list")}>목록</button>
              <button type="button" aria-pressed={view === "workload"} className={cn("min-h-9 rounded-lg px-3 text-xs font-semibold", view === "workload" ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised")} onClick={() => setView("workload")}>워크로드</button>
            </div>
            <button type="button" className={buttonClass({ size: "sm" })} disabled={!canEdit} onClick={() => void createTask()}><Plus className="size-4" aria-hidden="true" />작업 추가</button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-8">
          <div className="rounded-xl border border-line bg-card p-3"><p className="text-[0.6875rem] font-bold text-fg-3">표시 작업</p><p className="mt-1 text-xl font-black text-fg">{tasks.length}</p></div>
          <div className={cn("rounded-xl border p-3", overdueCount > 0 ? "border-bad/30 bg-bad/10" : "border-line bg-card")}><p className="text-[0.6875rem] font-bold text-fg-3">{t("productionHub.status.scheduleOverdue", "기한 초과")}</p><p className="mt-1 text-xl font-black text-fg">{overdueCount}</p></div>
          <div className={cn("rounded-xl border p-3", predictedCount > 0 ? "border-warn/40 bg-warn/15" : "border-line bg-card")}><p className="text-[0.6875rem] font-bold text-fg-3">예측 위험</p><p className="mt-1 text-xl font-black text-fg">{predictedCount}</p></div>
          <div className={cn("rounded-xl border p-3", forecastCount > 0 ? "border-warn/30 bg-warn/10" : "border-line bg-card")}><p className="text-[0.6875rem] font-bold text-fg-3">{t("productionHub.status.scheduleForecastOverrun", "예상 초과")}</p><p className="mt-1 text-xl font-black text-fg">{forecastCount}</p></div>
          <div className={cn("rounded-xl border p-3", attentionCount > 0 ? "border-warn/30 bg-warn/10" : "border-line bg-card")}><p className="text-[0.6875rem] font-bold text-fg-3">주의 필요</p><p className="mt-1 text-xl font-black text-fg">{attentionCount}</p></div>
          <div className="rounded-xl border border-line bg-card p-3"><p className="text-[0.6875rem] font-bold text-fg-3">예상 공수</p><p className="mt-1 text-xl font-black text-fg">{scheduledHours}h</p></div>
          <div className="rounded-xl border border-line bg-card p-3"><p className="text-[0.6875rem] font-bold text-fg-3">활성 담당</p><p className="mt-1 text-xl font-black text-fg">{workload.length}</p></div>
          <div className="rounded-xl border border-line bg-card p-3"><p className="text-[0.6875rem] font-bold text-fg-3">의존 연결</p><p className="mt-1 text-xl font-black text-fg">{tasks.reduce((sum, task) => sum + task.dependencyTaskIds.length, 0)}</p></div>
        </div>

        <div className="production-schedule-filter-toolbar mt-3 flex flex-wrap items-center gap-2">
          <label className="production-schedule-search-label flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs text-fg-2 sm:min-w-52">
            <ListFilter className="size-4 shrink-0 text-fg-3" aria-hidden="true" />
            <input aria-label="작업 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="작업·공정·담당자·범위 검색" className="min-w-0 flex-1 bg-transparent text-fg outline-none" />
          </label>
          <label className="flex min-h-10 max-w-full items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs text-fg-2"><Users className="size-4 shrink-0 text-fg-3" aria-hidden="true" /><span className="sr-only">담당자 필터</span><select aria-label="담당자 필터" value={assignmentFilter} onChange={(event) => setAssignmentFilter(event.target.value)} className="min-w-0 bg-transparent font-semibold text-fg outline-none"><option value="all">모든 담당자</option><option value="unassigned">담당 미지정</option>{activeAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignmentLabel(aggregate, assignment.id)}</option>)}</select></label>
          <label className="flex min-h-10 max-w-full items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs text-fg-2"><Filter className="size-4 shrink-0 text-fg-3" aria-hidden="true" /><span className="sr-only">위험 필터</span><select aria-label="위험 필터" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as typeof riskFilter)} className="min-w-0 bg-transparent font-semibold text-fg outline-none"><option value="all">모든 위험</option><option value="overdue">{t("productionHub.status.scheduleOverdue", "기한 초과")}</option><option value="predicted">예측 위험</option><option value="forecast">{t("productionHub.status.scheduleForecastOverrun", "예상 초과")}</option><option value="attention">주의 필요</option><option value="normal">정상</option></select></label>
          <label className="flex min-h-10 max-w-full items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs text-fg-2"><span className="sr-only">상태 필터</span><select aria-label="상태 필터" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="min-w-0 bg-transparent font-semibold text-fg outline-none"><option value="all">모든 상태</option>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{taskStatusLabel(status, bt)}</option>)}</select></label>
          <label className="flex min-h-10 max-w-full items-center gap-2 rounded-xl border border-line bg-card px-3 text-xs text-fg-2"><span className="sr-only">작업 정렬</span><select aria-label="작업 정렬" value={sortBy} onChange={(event) => setSortBy(event.target.value as ScheduleSortKey)} className="min-w-0 bg-transparent font-semibold text-fg outline-none"><option value="due-asc">마감 빠른순</option><option value="risk-desc">위험 높은순</option><option value="hours-desc">공수 큰순</option><option value="title-asc">제목 가나다순</option></select></label>
          {hasActiveFilters ? <button type="button" onClick={resetFilters} className="min-h-10 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg hover:bg-raised">필터 초기화</button> : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-3 text-xs text-fg-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-fg">표시 구간: {dateOnly(days[0]!)} – {dateOnly(days.at(-1)!)}</span>
            <label className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-card px-2 text-[0.6875rem] text-fg-2">
              <span>시작일</span>
              <input type="date" aria-label="구간 시작일 선택" value={dateOnly(windowStart)} onChange={(event) => { const parsed = parseDate(event.target.value); if (parsed) setWindowStart(startOfDay(parsed)); }} className="min-w-0 bg-transparent font-semibold text-fg outline-none" />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className={buttonClass({ variant: "quiet", size: "icon" })} aria-label="이전 2주" onClick={() => setWindowStart((value) => addDays(value, -14))}><ChevronLeft className="size-4" /></button>
            <button type="button" onClick={() => setWindowStart(startOfDay(addDays(now, -2)))} className="min-h-8 rounded-lg border border-line bg-card px-2.5 text-[0.6875rem] font-semibold text-fg hover:bg-raised">오늘 기준</button>
            <button type="button" onClick={() => setWindowStart(startOfDay(initialStart))} className="min-h-8 rounded-lg border border-line bg-card px-2.5 text-[0.6875rem] font-semibold text-fg hover:bg-raised">첫 마감 기준</button>
            <button type="button" className={buttonClass({ variant: "quiet", size: "icon" })} aria-label="다음 2주" onClick={() => setWindowStart((value) => addDays(value, 14))}><ChevronRight className="size-4" /></button>
          </div>
        </div>
      </header>

      {view === "timeline" ? (
        <div className="production-schedule-timeline-scroll">
          <div>
            <div className="production-schedule-timeline-grid grid border-b border-line bg-card">
              <div className="production-schedule-sticky-col flex items-center justify-between border-r border-line bg-card px-3 py-2">
                <span className="text-xs font-bold text-fg">작업 · 담당 · 마감 제어</span>
                <span className="text-[0.6875rem] font-semibold text-fg-3">{tasks.length}건</span>
              </div>
              {days.map((day) => {
                const today = dateOnly(day) === dateOnly(now);
                return <div key={day.toISOString()} className={cn("border-r border-line px-1 py-2 text-center text-[0.6875rem] font-semibold", today ? "bg-accent-soft text-accent" : "text-fg-3")}>{DATE_LABEL.format(day)}</div>;
              })}
            </div>

            {tasks.map((task) => {
              const due = parseDate(task.dueAt);
              const dueIndex = due ? Math.round((startOfDay(due).getTime() - windowStart.getTime()) / DAY_MS) : -1;
              const durationDays = Math.max(1, Math.ceil(taskHours(task) / 8));
              const startIndex = Math.max(0, dueIndex - durationDays + 1);
              const isOutOfWindow = due !== null && (dueIndex < 0 || dueIndex >= 14);
              const taskSignals = riskSignalsByTask.get(task.id) ?? [];
              const taskForecast = schedule.byTaskId[task.id];
              const risk = taskRisk(task, now, taskSignals, taskForecast?.slackHours);
              const assignees = task.assignmentIds.map((id) => assignmentLabel(aggregate, id));
              const isEditing = editingDraft?.taskId === task.id;
              return (
                <div key={task.id} className="production-schedule-timeline-grid grid min-h-24 border-b border-line bg-panel/45">
                  <div className="production-schedule-sticky-col border-r border-line bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cn("rounded-full border px-2 py-0.5 text-[0.625rem] font-bold", statusClass(task.status))}>{taskStatusLabel(task.status, bt)}</span>
                          <span className={cn("rounded-full border px-2 py-0.5 text-[0.625rem] font-bold", riskClass(risk))}>{scheduleRiskLabel(risk, bt)}</span>
                          <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[0.625rem] font-semibold text-fg-2">{formatDueRelativeBadge(task, now)}</span>
                        </div>
                        <h3 title={task.title} className="production-schedule-task-title mt-2 text-sm font-bold text-fg">{task.title}</h3>
                        <p className="mt-1 text-[0.6875rem] text-fg-3">{processLabel(task.processKey, bt)} · {scopeLabel(task, bt)} · {assignees.length > 0 ? assignees.join(", ") : "담당 미지정"}</p>
                        <p className="mt-1 text-[0.6875rem] text-fg-3">기준 {taskForecast?.baselineDueAt ? dateOnly(new Date(taskForecast.baselineDueAt)) : "미정"} · 예상 {taskForecast ? dateOnly(new Date(taskForecast.forecastDueAt)) : "미정"}{typeof taskForecast?.slackHours === "number" ? ` · 여유 ${taskForecast.slackHours}h` : ""}</p>
                      </div>
                      <span className="shrink-0 text-xs font-black text-fg">{taskHours(task)}h</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select aria-label={`${task.title} 상태`} value={task.status} disabled={!canEdit} className="min-h-8 max-w-full rounded-lg border border-line bg-panel px-2 text-[0.6875rem] font-semibold text-fg outline-none disabled:opacity-60" onChange={(event) => saveTask(task, { status: event.target.value as ProductionTaskStatus }, `${task.title} 상태를 변경했습니다.`)}>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{taskStatusLabel(status, bt)}</option>)}</select>
                      <input type="date" aria-label={`${task.title} 마감일`} value={due ? dateOnly(due) : ""} disabled={!canEdit} className="min-h-8 max-w-full rounded-lg border border-line bg-panel px-2 text-[0.6875rem] text-fg outline-none disabled:opacity-60" onChange={(event) => saveTask(task, { dueAt: dueIsoFromDateInput(event.target.value) }, `${task.title} 마감일을 변경했습니다.`)} />
                      {task.dependencyTaskIds.length > 0 ? <span className="inline-flex items-center gap-1 text-[0.6875rem] text-fg-3"><GitBranch className="size-3" aria-hidden="true" />선행 {task.dependencyTaskIds.length}</span> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <button type="button" disabled={!canEdit} aria-label={`${task.title} 마감 1일 앞당기기`} onClick={() => shiftTaskDueByDays(task, -1)} className="rounded-md border border-line bg-panel px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-50">-1일</button>
                        <button type="button" disabled={!canEdit} aria-label={`${task.title} 마감 1일 늦추기`} onClick={() => shiftTaskDueByDays(task, 1)} className="rounded-md border border-line bg-panel px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-50">+1일</button>
                        <button type="button" disabled={!canEdit} aria-label={`${task.title} 마감 1주 늦추기`} onClick={() => shiftTaskDueByDays(task, 7)} className="rounded-md border border-line bg-panel px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-50">+1주</button>
                        {isOutOfWindow ? <button type="button" onClick={() => jumpToTaskWindow(task)} className="rounded-md border border-warn/40 bg-warn/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-warn hover:bg-warn/20">마감 구간으로 이동</button> : null}
                      </div>
                      <button type="button" aria-expanded={isEditing} aria-label={`${task.title} 상세 편집`} onClick={() => (isEditing ? setEditingDraft(null) : openInlineEditor(task))} className="rounded-md border border-line bg-card px-2 py-0.5 text-[0.6875rem] font-semibold text-fg hover:bg-raised">{isEditing ? "편집 닫기" : "상세 편집"}</button>
                    </div>
                    {taskSignals[0] ? <p className="mt-2 line-clamp-2 text-[0.6875rem] leading-4 text-warn">{taskSignals[0].summary}</p> : null}
                    {renderInlineEditor(task)}
                  </div>
                  {days.map((day, index) => {
                    const withinBar = dueIndex >= 0 && dueIndex < 14 && index >= startIndex && index <= dueIndex;
                    const isDue = dueIndex === index;
                    const today = dateOnly(day) === dateOnly(now);
                    return (
                      <div key={day.toISOString()} className={cn("relative border-r border-line/70", today && "bg-accent-soft/40")}>
                        {withinBar ? <div className={cn("absolute inset-y-7", index === startIndex ? "left-2 rounded-l-full" : "left-0", index === dueIndex ? "right-2 rounded-r-full" : "right-0", risk === "overdue" ? "bg-bad/45" : risk === "predicted" ? "bg-warn/55" : risk === "attention" || risk === "forecast" ? "bg-warn/45" : "bg-accent/35")} /> : null}
                        {isDue ? <div className={cn("absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card", risk === "overdue" ? "bg-bad" : risk === "predicted" || risk === "attention" || risk === "forecast" ? "bg-warn" : "bg-accent")} title={`${task.title} 마감`} /> : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {tasks.length === 0 ? renderEmptyFilteredTasks() : null}
          </div>
        </div>
      ) : null}

      {view === "calendar" ? (
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-fg">2주 마감 캘린더</h3>
              <p className="text-xs text-fg-3">일자별 마감 작업을 확인하고 카드에서 상태·마감일·세부 정보를 바로 편집합니다.</p>
            </div>
            <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-xs font-bold text-fg-2">구간 내 마감 {tasks.length - calendarOutsideOrUndatedTasks.length}건</span>
          </div>
          {tasks.length === 0 ? renderEmptyFilteredTasks() : (
            <>
              <div className="production-schedule-calendar-scroll">
                <div className="production-schedule-calendar-grid">
                  {days.map((day) => {
                    const dayKey = dateOnly(day);
                    const dayTasks = calendarTasksByDateKey.get(dayKey) ?? [];
                    const today = dayKey === dateOnly(now);
                    return (
                      <div key={dayKey} className={cn("flex min-h-40 min-w-0 flex-col rounded-2xl border border-line p-2.5", today ? "bg-accent-soft/20" : "bg-panel/60")}>
                        <div className="flex items-center justify-between gap-1 border-b border-line/70 pb-1.5 text-xs">
                          <span className={cn("font-bold", today ? "text-accent" : "text-fg")}>{DATE_LABEL.format(day)}</span>
                          <span className="rounded-full bg-card px-2 py-0.5 text-[0.6875rem] font-bold text-fg-3">{dayTasks.length}건</span>
                        </div>
                        <div className="mt-2 flex flex-1 flex-col gap-2">
                          {dayTasks.length === 0 ? <p className="my-auto text-center text-[0.6875rem] text-fg-3">마감 없음</p> : dayTasks.map((task) => {
                            const due = parseDate(task.dueAt);
                            const taskSignals = riskSignalsByTask.get(task.id) ?? [];
                            const taskForecast = schedule.byTaskId[task.id];
                            const risk = taskRisk(task, now, taskSignals, taskForecast?.slackHours);
                            const assignees = task.assignmentIds.map((id) => assignmentLabel(aggregate, id));
                            const isEditing = editingDraft?.taskId === task.id;
                            return (
                              <article key={task.id} className="min-w-0 rounded-xl border border-line bg-card p-2.5 text-xs">
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className={cn("rounded-full border px-1.5 py-0.5 text-[0.625rem] font-bold", riskClass(risk))}>{scheduleRiskLabel(risk, bt)}</span>
                                  <span className="text-[0.625rem] font-semibold text-fg-3">{processLabel(task.processKey, bt)} · {taskHours(task)}h</span>
                                </div>
                                <h4 title={task.title} className="production-schedule-task-title mt-1 text-xs font-bold text-fg">{task.title}</h4>
                                <p className="mt-0.5 truncate text-[0.6875rem] text-fg-3">{assignees.length > 0 ? assignees.join(", ") : "담당 미지정"}</p>
                                {taskSignals[0] ? <p className="mt-1 line-clamp-2 text-[0.6875rem] leading-4 text-warn">{taskSignals[0].summary}</p> : null}
                                <div className="mt-2 grid gap-1.5">
                                  <select aria-label={`${task.title} 상태`} value={task.status} disabled={!canEdit} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-panel px-2 text-[0.6875rem] font-semibold text-fg outline-none disabled:opacity-60" onChange={(event) => saveTask(task, { status: event.target.value as ProductionTaskStatus }, `${task.title} 상태를 변경했습니다.`)}>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{taskStatusLabel(status, bt)}</option>)}</select>
                                  <input type="date" aria-label={`${task.title} 마감일`} value={due ? dateOnly(due) : ""} disabled={!canEdit} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-panel px-2 text-[0.6875rem] text-fg outline-none disabled:opacity-60" onChange={(event) => saveTask(task, { dueAt: dueIsoFromDateInput(event.target.value) }, `${task.title} 마감일을 변경했습니다.`)} />
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1">
                                  <div className="flex items-center gap-1">
                                    <button type="button" disabled={!canEdit} onClick={() => shiftTaskDueByDays(task, -1)} className="rounded border border-line bg-panel px-1.5 py-0.5 text-[0.625rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-50">-1일</button>
                                    <button type="button" disabled={!canEdit} onClick={() => shiftTaskDueByDays(task, 1)} className="rounded border border-line bg-panel px-1.5 py-0.5 text-[0.625rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-50">+1일</button>
                                  </div>
                                  <button type="button" aria-expanded={isEditing} aria-label={`${task.title} 상세 편집`} onClick={() => (isEditing ? setEditingDraft(null) : openInlineEditor(task))} className="rounded border border-line bg-panel px-1.5 py-0.5 text-[0.625rem] font-semibold text-fg hover:bg-raised">{isEditing ? "닫기" : "상세 편집"}</button>
                                </div>
                                {renderInlineEditor(task)}
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {calendarOutsideOrUndatedTasks.length > 0 ? (
                <div className="rounded-2xl border border-line bg-panel p-3.5">
                  <h4 className="text-xs font-bold text-fg">현재 2주 구간 외 또는 마감 미정 작업 ({calendarOutsideOrUndatedTasks.length}건)</h4>
                  <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {calendarOutsideOrUndatedTasks.map((task) => {
                      const due = parseDate(task.dueAt);
                      const taskSignals = riskSignalsByTask.get(task.id) ?? [];
                      const taskForecast = schedule.byTaskId[task.id];
                      const risk = taskRisk(task, now, taskSignals, taskForecast?.slackHours);
                      return (
                        <article key={task.id} className="min-w-0 rounded-xl border border-line bg-card p-3 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className={cn("rounded-full border px-2 py-0.5 text-[0.625rem] font-bold", riskClass(risk))}>{scheduleRiskLabel(risk, bt)}</span>
                            <span className="text-[0.6875rem] text-fg-3">{due ? dateOnly(due) : "마감 미정"}</span>
                          </div>
                          <h5 title={task.title} className="production-schedule-task-title mt-1.5 text-xs font-bold text-fg">{task.title}</h5>
                          <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                            <select aria-label={`${task.title} 상태`} value={task.status} disabled={!canEdit} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-panel px-2 text-[0.6875rem] font-semibold text-fg outline-none disabled:opacity-60" onChange={(event) => saveTask(task, { status: event.target.value as ProductionTaskStatus }, `${task.title} 상태를 변경했습니다.`)}>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{taskStatusLabel(status, bt)}</option>)}</select>
                            <input type="date" aria-label={`${task.title} 마감일`} value={due ? dateOnly(due) : ""} disabled={!canEdit} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-panel px-2 text-[0.6875rem] text-fg outline-none disabled:opacity-60" onChange={(event) => saveTask(task, { dueAt: dueIsoFromDateInput(event.target.value) }, `${task.title} 마감일을 변경했습니다.`)} />
                          </div>
                          {due ? <button type="button" onClick={() => jumpToTaskWindow(task)} className="mt-2 rounded-md border border-warn/40 bg-warn/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-warn hover:bg-warn/20">마감 구간으로 이동</button> : null}
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {view === "list" ? (
        <div className="space-y-3 p-4">
          <div>
            <h3 className="text-sm font-black text-fg">일정 상세 목록 ({tasks.length})</h3>
            <p className="text-xs text-fg-3">긴 작업 제목, 선행 의존, 예측 위험 사유를 한눈에 읽고 상태와 마감일을 바로 편집합니다.</p>
          </div>
          {tasks.length === 0 ? renderEmptyFilteredTasks() : (
            <div className="grid gap-3">
              {tasks.map((task) => {
                const due = parseDate(task.dueAt);
                const taskSignals = riskSignalsByTask.get(task.id) ?? [];
                const taskForecast = schedule.byTaskId[task.id];
                const risk = taskRisk(task, now, taskSignals, taskForecast?.slackHours);
                const assignees = task.assignmentIds.map((id) => assignmentLabel(aggregate, id));
                const isEditing = editingDraft?.taskId === task.id;
                return (
                  <article key={task.id} className="min-w-0 rounded-2xl border border-line bg-panel p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cn("rounded-full border px-2 py-0.5 text-[0.625rem] font-bold", statusClass(task.status))}>{taskStatusLabel(task.status, bt)}</span>
                          <span className={cn("rounded-full border px-2 py-0.5 text-[0.625rem] font-bold", riskClass(risk))}>{scheduleRiskLabel(risk, bt)}</span>
                          <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.625rem] font-semibold text-fg-2">{formatDueRelativeBadge(task, now)}</span>
                          <span className="text-xs font-black text-fg">{taskHours(task)}h</span>
                        </div>
                        <h4 title={task.title} className="production-schedule-task-title mt-2 text-sm font-bold text-fg">{task.title}</h4>
                        <p className="mt-1 text-xs text-fg-3">{processLabel(task.processKey, bt)} · {scopeLabel(task, bt)} · 담당: {assignees.length > 0 ? assignees.join(", ") : "담당 미지정"}{task.dependencyTaskIds.length > 0 ? ` · 선행 ${task.dependencyTaskIds.length}개` : " · 선행 없음"}</p>
                        {taskSignals[0] ? <p className="mt-2 text-xs leading-5 text-warn">{taskSignals[0].summary}</p> : null}
                      </div>
                      <div className="flex w-full shrink-0 flex-col gap-2 lg:w-80">
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                          <select aria-label={`${task.title} 상태`} value={task.status} disabled={!canEdit} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs font-semibold text-fg outline-none disabled:opacity-60" onChange={(event) => saveTask(task, { status: event.target.value as ProductionTaskStatus }, `${task.title} 상태를 변경했습니다.`)}>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{taskStatusLabel(status, bt)}</option>)}</select>
                          <input type="date" aria-label={`${task.title} 마감일`} value={due ? dateOnly(due) : ""} disabled={!canEdit} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg outline-none disabled:opacity-60" onChange={(event) => saveTask(task, { dueAt: dueIsoFromDateInput(event.target.value) }, `${task.title} 마감일을 변경했습니다.`)} />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <div className="flex flex-wrap items-center gap-1">
                            <button type="button" disabled={!canEdit} onClick={() => shiftTaskDueByDays(task, -1)} className="rounded-md border border-line bg-card px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-50">-1일</button>
                            <button type="button" disabled={!canEdit} onClick={() => shiftTaskDueByDays(task, 1)} className="rounded-md border border-line bg-card px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-50">+1일</button>
                            <button type="button" disabled={!canEdit} onClick={() => shiftTaskDueByDays(task, 7)} className="rounded-md border border-line bg-card px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-50">+1주</button>
                          </div>
                          <button type="button" aria-expanded={isEditing} aria-label={`${task.title} 상세 편집`} onClick={() => (isEditing ? setEditingDraft(null) : openInlineEditor(task))} className="rounded-md border border-line bg-card px-2.5 py-0.5 text-[0.6875rem] font-semibold text-fg hover:bg-raised">{isEditing ? "편집 닫기" : "상세 편집"}</button>
                        </div>
                      </div>
                    </div>
                    {renderInlineEditor(task)}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {view === "workload" ? (
        <div className="grid gap-4 p-4 lg:grid-cols-2 2xl:grid-cols-3">
          {workload.map(({ assignment, name, tasks: assignedTasks, hours, attention }) => {
            const target = 40;
            const ratio = Math.min(140, Math.round((hours / target) * 100));
            return (
              <article key={assignment.id} className="min-w-0 rounded-2xl border border-line bg-panel p-4">
                <header className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-black text-fg">{name}</p><p className="mt-1 text-xs text-fg-3">{assignment.publicCreditRole ?? assignment.roleType}</p></div><span className={cn("shrink-0 rounded-full border px-2 py-1 text-xs font-bold", ratio > 100 ? "border-bad/30 bg-bad/10 text-bad" : ratio > 80 ? "border-warn/30 bg-warn/10 text-warn" : "border-good/30 bg-good/10 text-good")}>{hours}h / {target}h</span></header>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-raised"><div className={cn("h-full rounded-full", ratio > 100 ? "bg-bad" : ratio > 80 ? "bg-warn" : "bg-good")} style={{ width: `${Math.min(100, ratio)}%` }} /></div>
                <div className="mt-3 flex items-center justify-between text-[0.6875rem] text-fg-3"><span>{assignedTasks.length}개 작업</span><span>{attention}개 주의</span></div>
                <div className="mt-4 space-y-2">
                  {assignedTasks.map((task) => {
                    const signals = riskSignalsByTask.get(task.id) ?? [];
                    const taskForecast = schedule.byTaskId[task.id];
                    const risk = taskRisk(task, now, signals, taskForecast?.slackHours);
                    return (
                      <div key={task.id} className="min-w-0 rounded-xl border border-line bg-card p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p title={task.title} className="production-schedule-task-title text-xs font-semibold text-fg">{task.title}</p>
                            <p className="mt-1 text-[0.6875rem] text-fg-3">{processLabel(task.processKey, bt)} · {taskHours(task)}h</p>
                          </div>
                          {risk === "normal"
                            ? <CheckCircle2 className="size-4 shrink-0 text-good" aria-label="일정 정상" />
                            : <AlertTriangle className={cn("size-4 shrink-0", risk === "overdue" ? "text-bad" : "text-warn")} aria-label={scheduleRiskLabel(risk, bt)} />}
                        </div>
                        {signals[0] ? <p className="mt-2 text-[0.6875rem] leading-4 text-warn">{signals[0].summary}</p> : null}
                        {taskForecast ? <p className="mt-2 text-[0.6875rem] text-fg-3">예상 {dateOnly(new Date(taskForecast.forecastDueAt))}{typeof taskForecast.slackHours === "number" ? ` · 여유 ${taskForecast.slackHours}h` : ""}</p> : null}
                        <div className="mt-2 flex items-center justify-between text-[0.6875rem]"><span className="text-fg-3">{task.dueAt ? dateOnly(new Date(task.dueAt)) : "마감 미정"}</span><span className={cn("rounded-full border px-1.5 py-0.5 font-bold", statusClass(task.status))}>{taskStatusLabel(task.status, bt)}</span></div>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
          {workload.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line p-10 text-center">
              <Clock3 className="mx-auto size-8 text-fg-3" />
              <p className="text-sm font-bold text-fg">{t("productionHub.schedule.emptyWorkload", "표시할 워크로드가 없습니다")}</p>
              <p className="text-xs text-fg-2">담당자를 지정한 작업이 생기면 역할별 용량이 표시됩니다.</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {hasActiveFilters ? <button type="button" onClick={resetFilters} className="min-h-9 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg hover:bg-raised">필터 초기화</button> : null}
                <button type="button" onClick={() => setView("list")} className="min-h-9 rounded-xl bg-accent px-3 text-xs font-semibold text-on-accent">목록 보기에서 작업 확인</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="p-4 pt-0 space-y-5">
        <ProductionBatchScheduleSuite />
        <ProductionPmsBlueprintSuite />
        <ProductionNotionKnowledgeCalendarSuite />
      </div>
    </section>
  );
}
