import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import type { ProductionProjectAggregate, ProductionTask, ProductionTaskStatus } from "@toonstudio/core/production";

import { scheduleRiskLabel, taskStatusLabel, type ProductionLocalize, type ScheduleRiskLevel } from "./production-labels";
import type { ProductionRiskSignal } from "./production-risk-intelligence";
import { cn } from "@/shared/lib/utils";

type ProductionAssignmentEntry = ProductionProjectAggregate["assignments"][number];

export interface TaskInlineDraft {
  readonly taskId: string;
  readonly title: string;
  readonly processKey: string;
  readonly assignmentId: string;
  readonly likelyHours: string;
  readonly dueDate: string;
}

export interface ScheduleTaskForecastSummary {
  readonly baselineDueAt: string | null;
  readonly forecastDueAt: string;
  readonly slackHours: number | null;
}

export interface ScheduleViewSharedProps {
  readonly aggregate: ProductionProjectAggregate;
  readonly canEdit: boolean;
  readonly now: Date;
  readonly bt: ProductionLocalize;
  readonly statusOptions: readonly ProductionTaskStatus[];
  readonly processOptions: readonly string[];
  readonly activeAssignments: readonly ProductionAssignmentEntry[];
  readonly riskSignalsByTask: ReadonlyMap<string, readonly ProductionRiskSignal[]>;
  readonly forecastByTaskId: Readonly<Record<string, ScheduleTaskForecastSummary | undefined>>;
  readonly editingDraft: TaskInlineDraft | null;
  readonly onChangeDraft: (updater: (current: TaskInlineDraft | null) => TaskInlineDraft | null) => void;
  readonly onOpenEditor: (task: ProductionTask) => void;
  readonly onCloseEditor: (taskId?: string) => void;
  readonly onSubmitEditor: (event: FormEvent<HTMLFormElement>, task: ProductionTask) => void;
  readonly onTitleInputMount: (node: HTMLInputElement | null) => void;
  readonly onSaveTask: (task: ProductionTask, patch: Partial<ProductionTask>, message: string) => void;
  readonly onShiftTaskDueByDays: (task: ProductionTask, deltaDays: number) => void;
  readonly onJumpToTaskWindow: (task: ProductionTask) => void;
  readonly parseDate: (value: string | null) => Date | null;
  readonly dateOnly: (value: Date) => string;
  readonly dueIsoFromDateInput: (value: string) => string | null;
  readonly formatDateLabel: (value: Date) => string;
  readonly formatDueRelativeBadge: (task: ProductionTask, now: Date) => string;
  readonly taskRisk: (task: ProductionTask, now: Date, signals?: readonly ProductionRiskSignal[], slackHours?: number | null) => ScheduleRiskLevel;
  readonly assignmentLabel: (aggregate: ProductionProjectAggregate, assignmentId: string) => string;
  readonly processLabel: (processKey: string, localize: ProductionLocalize) => string;
  readonly scopeLabel: (task: ProductionTask, localize: ProductionLocalize) => string;
  readonly taskHours: (task: ProductionTask) => number;
  readonly riskClass: (risk: ScheduleRiskLevel) => string;
  readonly statusClass: (status: ProductionTaskStatus) => string;
}

const MAX_CALENDAR_INLINE_TASKS = 2;

export function ScheduleInlineTaskEditor({
  task,
  shared,
}: {
  readonly task: ProductionTask;
  readonly shared: ScheduleViewSharedProps;
}) {
  const {
    aggregate,
    canEdit,
    bt,
    processOptions,
    activeAssignments,
    editingDraft,
    onChangeDraft,
    onCloseEditor,
    onSubmitEditor,
    onTitleInputMount,
    assignmentLabel,
    processLabel,
  } = shared;

  if (!editingDraft || editingDraft.taskId !== task.id) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCloseEditor(task.id);
    }
  };

  return (
    <form
      aria-label={`${task.title} 상세 편집 폼`}
      onSubmit={(event) => onSubmitEditor(event, task)}
      className="mt-2.5 grid gap-2 rounded-xl border border-line bg-panel p-2.5 text-xs"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid min-w-0 gap-1">
          <span className="text-[0.6875rem] font-semibold text-fg-2">작업 제목</span>
          <input ref={onTitleInputMount} onKeyDown={handleKeyDown} type="text" aria-label={`${task.title} 제목 편집`} value={editingDraft.title} disabled={!canEdit} onChange={(event) => onChangeDraft((current) => (current ? { ...current, title: event.target.value } : current))} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg outline-none" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid min-w-0 gap-1">
            <span className="text-[0.6875rem] font-semibold text-fg-2">공정</span>
            <select onKeyDown={handleKeyDown} aria-label={`${task.title} 공정 편집`} value={editingDraft.processKey} disabled={!canEdit} onChange={(event) => onChangeDraft((current) => (current ? { ...current, processKey: event.target.value } : current))} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg outline-none">{processOptions.map((processKey) => <option key={processKey} value={processKey}>{processLabel(processKey, bt)}</option>)}</select>
          </label>
          <label className="grid min-w-0 gap-1">
            <span className="text-[0.6875rem] font-semibold text-fg-2">담당자</span>
            <select onKeyDown={handleKeyDown} aria-label={`${task.title} 담당자 편집`} value={editingDraft.assignmentId} disabled={!canEdit} onChange={(event) => onChangeDraft((current) => (current ? { ...current, assignmentId: event.target.value } : current))} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg outline-none"><option value="">담당 미지정</option>{activeAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignmentLabel(aggregate, assignment.id)}</option>)}</select>
          </label>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="grid min-w-0 gap-1">
          <span className="text-[0.6875rem] font-semibold text-fg-2">예상 공수(h)</span>
          <input type="number" min={0} max={999} onKeyDown={handleKeyDown} aria-label={`${task.title} 예상 공수 편집`} value={editingDraft.likelyHours} disabled={!canEdit} onChange={(event) => onChangeDraft((current) => (current ? { ...current, likelyHours: event.target.value } : current))} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg outline-none" />
        </label>
        <label className="grid min-w-0 gap-1">
          <span className="text-[0.6875rem] font-semibold text-fg-2">마감일</span>
          <input type="date" onKeyDown={handleKeyDown} aria-label={`${task.title} 상세 마감일 편집`} value={editingDraft.dueDate} disabled={!canEdit} onChange={(event) => onChangeDraft((current) => (current ? { ...current, dueDate: event.target.value } : current))} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg outline-none" />
        </label>
        <div className="flex flex-wrap items-end justify-end gap-1.5">
          <button type="button" onClick={() => onCloseEditor(task.id)} className="min-h-8 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 hover:bg-raised">취소</button>
          <button type="submit" disabled={!canEdit} className="min-h-8 rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent disabled:opacity-50">저장</button>
        </div>
      </div>
    </form>
  );
}

function CalendarTaskCard({
  task,
  shared,
}: {
  readonly task: ProductionTask;
  readonly shared: ScheduleViewSharedProps;
}) {
  const {
    aggregate,
    canEdit,
    now,
    bt,
    statusOptions,
    riskSignalsByTask,
    forecastByTaskId,
    editingDraft,
    onOpenEditor,
    onCloseEditor,
    onSaveTask,
    onShiftTaskDueByDays,
    parseDate,
    dateOnly,
    dueIsoFromDateInput,
    taskRisk,
    assignmentLabel,
    processLabel,
    taskHours,
    riskClass,
  } = shared;

  const due = parseDate(task.dueAt);
  const taskSignals = riskSignalsByTask.get(task.id) ?? [];
  const taskForecast = forecastByTaskId[task.id];
  const risk = taskRisk(task, now, taskSignals, taskForecast?.slackHours);
  const assignees = task.assignmentIds.map((id) => assignmentLabel(aggregate, id));
  const isEditing = editingDraft?.taskId === task.id;

  return (
    <article className="min-w-0 rounded-xl border border-line bg-card p-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-1">
        <span className={cn("rounded-full border px-1.5 py-0.5 text-[0.625rem] font-bold", riskClass(risk))}>{scheduleRiskLabel(risk, bt)}</span>
        <span className="text-[0.625rem] font-semibold text-fg-3">{processLabel(task.processKey, bt)} · {taskHours(task)}h</span>
      </div>
      <h4 title={task.title} className="production-schedule-task-title mt-1 text-xs font-bold text-fg">{task.title}</h4>
      <p className="mt-0.5 truncate text-[0.6875rem] text-fg-3">{assignees.length > 0 ? assignees.join(", ") : "담당 미지정"}</p>
      {taskSignals[0] ? <p className="mt-1 line-clamp-2 text-[0.6875rem] leading-4 text-warn">{taskSignals[0].summary}</p> : null}
      <div className="mt-2 grid gap-1.5">
        <select aria-label={`${task.title} 상태`} value={task.status} disabled={!canEdit} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-panel px-2 text-[0.6875rem] font-semibold text-fg outline-none disabled:opacity-60" onChange={(event) => onSaveTask(task, { status: event.target.value as ProductionTaskStatus }, `${task.title} 상태를 변경했습니다.`)}>{statusOptions.map((status) => <option key={status} value={status}>{taskStatusLabel(status, bt)}</option>)}</select>
        <input type="date" aria-label={`${task.title} 마감일`} value={due ? dateOnly(due) : ""} disabled={!canEdit} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-panel px-2 text-[0.6875rem] text-fg outline-none disabled:opacity-60" onChange={(event) => onSaveTask(task, { dueAt: dueIsoFromDateInput(event.target.value) }, `${task.title} 마감일을 변경했습니다.`)} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          <button type="button" disabled={!canEdit} aria-label={`${task.title} 마감 1일 앞당기기`} onClick={() => onShiftTaskDueByDays(task, -1)} className="rounded border border-line bg-panel px-1.5 py-0.5 text-[0.625rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-50">-1일</button>
          <button type="button" disabled={!canEdit} aria-label={`${task.title} 마감 1일 늦추기`} onClick={() => onShiftTaskDueByDays(task, 1)} className="rounded border border-line bg-panel px-1.5 py-0.5 text-[0.625rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-50">+1일</button>
        </div>
        <button type="button" data-schedule-edit-trigger={task.id} aria-expanded={isEditing} aria-label={`${task.title} 상세 편집`} onClick={() => (isEditing ? onCloseEditor(task.id) : onOpenEditor(task))} className="rounded border border-line bg-panel px-1.5 py-0.5 text-[0.625rem] font-semibold text-fg hover:bg-raised">{isEditing ? "닫기" : "상세 편집"}</button>
      </div>
      <ScheduleInlineTaskEditor task={task} shared={shared} />
    </article>
  );
}

export function ScheduleCalendarView({
  days,
  tasks,
  calendarTasksByDateKey,
  calendarOutsideOrUndatedTasks,
  selectedDate,
  onSelectDate,
  onOpenListViewForSelectedDate,
  renderEmptyFilteredTasks,
  shared,
}: {
  readonly days: readonly Date[];
  readonly tasks: readonly ProductionTask[];
  readonly calendarTasksByDateKey: ReadonlyMap<string, readonly ProductionTask[]>;
  readonly calendarOutsideOrUndatedTasks: readonly ProductionTask[];
  readonly selectedDate: string | null;
  readonly onSelectDate: (nextDate: string | null) => void;
  readonly onOpenListViewForSelectedDate: () => void;
  readonly renderEmptyFilteredTasks: () => ReactNode;
  readonly shared: ScheduleViewSharedProps;
}) {
  const {
    canEdit,
    now,
    bt,
    statusOptions,
    riskSignalsByTask,
    forecastByTaskId,
    onSaveTask,
    onJumpToTaskWindow,
    parseDate,
    dateOnly,
    dueIsoFromDateInput,
    formatDateLabel,
    taskRisk,
    riskClass,
  } = shared;

  const selectedDateTasks = selectedDate
    ? tasks.filter((task) => {
        const due = parseDate(task.dueAt);
        return due !== null && dateOnly(due) === selectedDate;
      })
    : [];

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-fg">2주 마감 캘린더</h3>
          <p className="text-xs text-fg-3">날짜 셀(44px 이상)을 선택해 당일 밀집 일정을 모아 보거나 목록 보기와 전환하며 편집합니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedDate ? (
            <button type="button" onClick={() => onSelectDate(null)} className="min-h-9 rounded-full border border-accent/40 bg-accent-soft px-3 text-xs font-bold text-accent hover:bg-accent-soft/80">
              선택 날짜 해제 ({selectedDate})
            </button>
          ) : null}
          <span className="rounded-full border border-line bg-panel px-2.5 py-1 text-xs font-bold text-fg-2">구간 내 마감 {tasks.length - calendarOutsideOrUndatedTasks.length}건</span>
        </div>
      </div>

      {tasks.length === 0 ? (
        renderEmptyFilteredTasks()
      ) : (
        <>
          <div className="production-schedule-calendar-scroll">
            <div className="production-schedule-calendar-grid">
              {days.map((day) => {
                const dayKey = dateOnly(day);
                const dayTasks = calendarTasksByDateKey.get(dayKey) ?? [];
                const today = dayKey === dateOnly(now);
                const isSelected = selectedDate === dayKey;
                const previewTasks = dayTasks.slice(0, MAX_CALENDAR_INLINE_TASKS);
                const overflowCount = Math.max(0, dayTasks.length - MAX_CALENDAR_INLINE_TASKS);

                return (
                  <div
                    key={dayKey}
                    data-calendar-day-cell={dayKey}
                    className={cn(
                      "flex min-h-40 min-w-0 flex-col rounded-2xl border p-2.5 transition-colors",
                      isSelected ? "border-accent bg-accent-soft/25" : today ? "border-accent/35 bg-accent-soft/15" : "border-line bg-panel/60",
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={`${dayKey} 날짜 선택 (${dayTasks.length}건)`}
                      data-calendar-date-button={dayKey}
                      onClick={() => onSelectDate(isSelected ? null : dayKey)}
                      className={cn(
                        "production-schedule-calendar-day-button flex min-h-11 min-w-11 w-full items-center justify-between gap-1 rounded-xl border px-2.5 py-2 text-left text-xs font-bold transition-colors",
                        isSelected ? "border-accent bg-accent text-on-accent" : today ? "border-accent/40 bg-card text-accent hover:bg-raised" : "border-line/80 bg-card text-fg hover:bg-raised",
                      )}
                    >
                      <span>{formatDateLabel(day)}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-bold", isSelected ? "bg-on-accent/20 text-on-accent" : "bg-panel text-fg-3")}>{dayTasks.length}건</span>
                    </button>

                    <div className="mt-2 flex flex-1 flex-col gap-2">
                      {dayTasks.length === 0 ? (
                        <p className="my-auto text-center text-[0.6875rem] text-fg-3">마감 없음</p>
                      ) : isSelected ? (
                        <div className="flex flex-1 flex-col justify-between gap-2 rounded-xl border border-accent/35 bg-card p-2.5 text-xs">
                          <div className="space-y-1">
                            <p className="text-[0.6875rem] font-bold text-accent">선택 날짜 패널에서 {dayTasks.length}건 편집 중</p>
                            {previewTasks.map((task) => (
                              <p key={task.id} title={task.title} className="production-schedule-task-title text-[0.6875rem] font-semibold text-fg-2">• {task.title}</p>
                            ))}
                            {overflowCount > 0 ? <p className="text-[0.6875rem] font-semibold text-fg-3">외 {overflowCount}건 포함</p> : null}
                          </div>
                          <button type="button" onClick={onOpenListViewForSelectedDate} className="min-h-9 w-full rounded-lg border border-line bg-panel px-2 py-1 text-[0.6875rem] font-semibold text-fg hover:bg-raised">목록에서 선택 날짜 보기</button>
                        </div>
                      ) : (
                        <>
                          {previewTasks.map((task) => (
                            <CalendarTaskCard key={task.id} task={task} shared={shared} />
                          ))}
                          {overflowCount > 0 ? (
                            <button
                              type="button"
                              aria-label={`${dayKey} 외 ${overflowCount}건 더보기`}
                              onClick={() => onSelectDate(dayKey)}
                              className="min-h-11 w-full rounded-xl border border-accent/40 bg-accent-soft/25 px-2.5 py-2 text-xs font-bold text-accent hover:bg-accent-soft/40"
                            >
                              +{overflowCount}건 더보기 ({dayTasks.length}건 전체 열기)
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedDate ? (
            <section aria-label={`선택 날짜 일정 상세 (${selectedDate})`} data-selected-date-panel={selectedDate} className="rounded-2xl border border-accent/45 bg-panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-black text-fg">선택 날짜 일정 ({selectedDate} · {selectedDateTasks.length}건)</h4>
                  <p className="text-xs text-fg-3">선택한 날짜의 전체 작업을 스크롤 폭주 없이 확인하고 상세 편집·목록 전환 시에도 선택 날짜를 유지합니다.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={onOpenListViewForSelectedDate} className="min-h-9 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg hover:bg-raised">선택 날짜 목록으로 전환</button>
                  <button type="button" onClick={() => onSelectDate(null)} className="min-h-9 rounded-xl border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised">선택 해제</button>
                </div>
              </div>
              {selectedDateTasks.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-line bg-card p-4 text-center text-xs text-fg-3">선택한 날짜({selectedDate})에 해당하는 마감 작업이 없습니다.</p>
              ) : (
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {selectedDateTasks.map((task) => (
                    <CalendarTaskCard key={task.id} task={task} shared={shared} />
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {calendarOutsideOrUndatedTasks.length > 0 ? (
            <div className="rounded-2xl border border-line bg-panel p-3.5">
              <h4 className="text-xs font-bold text-fg">현재 2주 구간 외 또는 마감 미정 작업 ({calendarOutsideOrUndatedTasks.length}건)</h4>
              <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {calendarOutsideOrUndatedTasks.map((task) => {
                  const due = parseDate(task.dueAt);
                  const taskSignals = riskSignalsByTask.get(task.id) ?? [];
                  const taskForecast = forecastByTaskId[task.id];
                  const risk = taskRisk(task, now, taskSignals, taskForecast?.slackHours);
                  return (
                    <article key={task.id} className="min-w-0 rounded-xl border border-line bg-card p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className={cn("rounded-full border px-2 py-0.5 text-[0.625rem] font-bold", riskClass(risk))}>{scheduleRiskLabel(risk, bt)}</span>
                        <span className="text-[0.6875rem] text-fg-3">{due ? dateOnly(due) : "마감 미정"}</span>
                      </div>
                      <h5 title={task.title} className="production-schedule-task-title mt-1.5 text-xs font-bold text-fg">{task.title}</h5>
                      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                        <select aria-label={`${task.title} 상태`} value={task.status} disabled={!canEdit} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-panel px-2 text-[0.6875rem] font-semibold text-fg outline-none disabled:opacity-60" onChange={(event) => onSaveTask(task, { status: event.target.value as ProductionTaskStatus }, `${task.title} 상태를 변경했습니다.`)}>{statusOptions.map((status) => <option key={status} value={status}>{taskStatusLabel(status, bt)}</option>)}</select>
                        <input type="date" aria-label={`${task.title} 마감일`} value={due ? dateOnly(due) : ""} disabled={!canEdit} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-panel px-2 text-[0.6875rem] text-fg outline-none disabled:opacity-60" onChange={(event) => onSaveTask(task, { dueAt: dueIsoFromDateInput(event.target.value) }, `${task.title} 마감일을 변경했습니다.`)} />
                      </div>
                      {due ? <button type="button" onClick={() => onJumpToTaskWindow(task)} className="mt-2 rounded-md border border-warn/40 bg-warn/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-warn hover:bg-warn/20">마감 구간으로 이동</button> : null}
                    </article>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function ScheduleListView({
  tasks,
  selectedDate,
  onClearSelectedDate,
  renderEmptyFilteredTasks,
  shared,
}: {
  readonly tasks: readonly ProductionTask[];
  readonly selectedDate: string | null;
  readonly onClearSelectedDate: () => void;
  readonly renderEmptyFilteredTasks: () => ReactNode;
  readonly shared: ScheduleViewSharedProps;
}) {
  const {
    aggregate,
    canEdit,
    now,
    bt,
    statusOptions,
    riskSignalsByTask,
    forecastByTaskId,
    editingDraft,
    onOpenEditor,
    onCloseEditor,
    onSaveTask,
    onShiftTaskDueByDays,
    parseDate,
    dateOnly,
    dueIsoFromDateInput,
    formatDueRelativeBadge,
    taskRisk,
    assignmentLabel,
    processLabel,
    scopeLabel,
    taskHours,
    riskClass,
    statusClass,
  } = shared;

  const visibleTasks = selectedDate
    ? tasks.filter((task) => {
        const due = parseDate(task.dueAt);
        return due !== null && dateOnly(due) === selectedDate;
      })
    : tasks;

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-fg">일정 상세 목록 ({visibleTasks.length})</h3>
          <p className="text-xs text-fg-3">긴 작업 제목, 선행 의존, 예측 위험 사유를 한눈에 읽고 상태와 마감일을 바로 편집합니다.</p>
        </div>
        {selectedDate ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-accent/40 bg-accent-soft px-3 py-1 text-xs font-bold text-accent">선택 날짜: {selectedDate} ({visibleTasks.length}건)</span>
            <button type="button" onClick={onClearSelectedDate} className="min-h-8 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg hover:bg-raised">전체 날짜 보기</button>
          </div>
        ) : null}
      </div>
      {visibleTasks.length === 0 ? (
        renderEmptyFilteredTasks()
      ) : (
        <div className="grid gap-3">
          {visibleTasks.map((task) => {
            const due = parseDate(task.dueAt);
            const taskSignals = riskSignalsByTask.get(task.id) ?? [];
            const taskForecast = forecastByTaskId[task.id];
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
                      <select aria-label={`${task.title} 상태`} value={task.status} disabled={!canEdit} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs font-semibold text-fg outline-none disabled:opacity-60" onChange={(event) => onSaveTask(task, { status: event.target.value as ProductionTaskStatus }, `${task.title} 상태를 변경했습니다.`)}>{statusOptions.map((status) => <option key={status} value={status}>{taskStatusLabel(status, bt)}</option>)}</select>
                      <input type="date" aria-label={`${task.title} 마감일`} value={due ? dateOnly(due) : ""} disabled={!canEdit} className="min-h-8 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-xs text-fg outline-none disabled:opacity-60" onChange={(event) => onSaveTask(task, { dueAt: dueIsoFromDateInput(event.target.value) }, `${task.title} 마감일을 변경했습니다.`)} />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex flex-wrap items-center gap-1">
                        <button type="button" disabled={!canEdit} onClick={() => onShiftTaskDueByDays(task, -1)} className="rounded-md border border-line bg-card px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-50">-1일</button>
                        <button type="button" disabled={!canEdit} onClick={() => onShiftTaskDueByDays(task, 1)} className="rounded-md border border-line bg-card px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-50">+1일</button>
                        <button type="button" disabled={!canEdit} onClick={() => onShiftTaskDueByDays(task, 7)} className="rounded-md border border-line bg-card px-2 py-0.5 text-[0.6875rem] font-semibold text-fg-2 hover:bg-raised disabled:opacity-50">+1주</button>
                      </div>
                      <button type="button" data-schedule-edit-trigger={task.id} aria-expanded={isEditing} aria-label={`${task.title} 상세 편집`} onClick={() => (isEditing ? onCloseEditor(task.id) : onOpenEditor(task))} className="rounded-md border border-line bg-card px-2.5 py-0.5 text-[0.6875rem] font-semibold text-fg hover:bg-raised">{isEditing ? "편집 닫기" : "상세 편집"}</button>
                    </div>
                  </div>
                </div>
                <ScheduleInlineTaskEditor task={task} shared={shared} />
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
