import { STATUS, todayKst } from "@toonstudio/contracts/business-plan";
import { useState } from "react";

import { BusinessPlanDialog, BusinessPlanError, BusinessPlanFormFooter, BusinessPlanPanel, SelectField, TextAreaField, TextField, businessPlanDateInput, businessPlanId, formText } from "./business-plan-ui";

import type { BusinessPlanCommit } from "./business-plan-ui";
import type { BusinessPlanState, BusinessPlanTask } from "@toonstudio/contracts/business-plan";

const categories = ["문제·고객", "제품·공정", "수치·시장", "문서·제출"] as const;

function newTask(): BusinessPlanTask {
  return { id: businessPlanId("task"), title: "", category: categories[0], status: "초안", priority: "보통", description: "", owner: "", assignment: "", nextAction: "", notes: "", evidenceUrl: "", sourceTitle: "", verifiedAt: "", dueDate: "", updatedAt: new Date().toISOString() };
}

export function BusinessPlanTasks({ board, onCommit }: { board: BusinessPlanState; onCommit: BusinessPlanCommit }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("전체");
  const [category, setCategory] = useState("전체");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [editing, setEditing] = useState<BusinessPlanTask | null>(null);
  const [error, setError] = useState("");
  const filtered = board.tasks.filter((task) => (status === "전체" || task.status === status) && (category === "전체" || task.category === category) && [task.title, task.id, task.description, task.owner, task.assignment, task.nextAction, task.notes, task.sourceTitle].join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const taskCategories = [...new Set([...categories, ...board.tasks.map((task) => task.category)])];

  function changeStatus(task: BusinessPlanTask, next: string) {
    const nextStatus = STATUS.find((item) => item === next);
    if (!nextStatus) return;
    const candidate = { ...task, status: nextStatus, updatedAt: new Date().toISOString() };
    setError(onCommit({ ...board, tasks: board.tasks.map((item) => item.id === task.id ? candidate : item) }, `${task.title}: ${task.status} → ${nextStatus}`) ?? "");
  }

  return <BusinessPlanPanel id="bp-tasks" title="보완 작업" eyebrow="WORKSTREAM" description="작업 상태와 주장 검증 상태를 각각 관리합니다." actions={<button type="button" className="bp-button bp-button--small" onClick={() => setEditing(newTask())}>작업 추가</button>}>
    <div className="bp-toolbar">
      <label className="bp-search"><span className="bp-sr-only">작업 검색</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="항목, 담당자, 다음 조치 검색" /></label>
      <label><span className="bp-sr-only">작업 분류 필터</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="전체">전체 분류</option>{taskCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span className="bp-sr-only">작업 상태 필터</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="전체">전체 상태</option>{STATUS.map((item) => <option key={item}>{item}</option>)}</select></label>
      <div className="bp-segmented" role="group" aria-label="작업 보기"><button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>목록</button><button type="button" aria-pressed={view === "kanban"} onClick={() => setView("kanban")}>칸반</button></div>
    </div>
    <BusinessPlanError error={error} />
    {view === "list" ? <><div className="bp-task-head" aria-hidden="true"><span>항목 · 담당 작업</span><span>진행 상태</span><span>주장</span></div><div className="bp-task-list">
      {filtered.map((task) => <div className="bp-task-row" key={task.id}>
        <button type="button" className="bp-task-open" onClick={() => setEditing(task)} aria-label={`${task.title} 작업 편집`}><span className="bp-task-index">{String(board.tasks.indexOf(task) + 1).padStart(2, "0")}</span><span className="bp-task-text"><strong>{task.title}</strong><small>{task.owner || "담당 미지정"} · {task.nextAction || "다음 조치 미등록"}</small></span></button>
        <select className="bp-task-status" aria-label={`${task.title} 진행 상태`} value={task.status} onChange={(event) => changeStatus(task, event.target.value)}>{STATUS.map((item) => <option key={item}>{item}</option>)}</select>
        <span className="bp-task-evidence">{board.claims.filter((claim) => claim.taskId === task.id).length}개</span>
      </div>)}
      {!filtered.length && <p className="bp-empty">검색 조건에 맞는 작업이 없습니다.</p>}
    </div></> : <div className="bp-kanban">{STATUS.map((item) => <section className="bp-kanban-column" key={item} aria-label={`${item} 작업`}><div className="bp-kanban-title"><span>{item}</span><span>{filtered.filter((task) => task.status === item).length}</span></div>{filtered.filter((task) => task.status === item).map((task) => <button className="bp-kanban-card" type="button" key={task.id} onClick={() => setEditing(task)} aria-label={`${task.title} 작업 편집`}><strong>{task.title}</strong><small>{task.owner || "담당 미지정"}</small><small>{task.nextAction || "다음 조치 미등록"}</small></button>)}</section>)}</div>}
    <div className="bp-panel-footer">{filtered.length}/{board.tasks.length}개 항목 · 근거가 없거나 확인되지 않은 수치는 미확인으로 표시합니다.</div>
    {editing && <TaskEditor key={editing.id} task={editing} board={board} onCommit={onCommit} onClose={() => setEditing(null)} />}
  </BusinessPlanPanel>;
}

function TaskEditor({ task, board, onCommit, onClose }: { task: BusinessPlanTask; board: BusinessPlanState; onCommit: BusinessPlanCommit; onClose: () => void }) {
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const exists = board.tasks.some((item) => item.id === task.id);
  return <BusinessPlanDialog title={exists ? `${task.title} 편집` : "보완 작업 추가"} description="근거 링크, 원문 출처, 검증일과 담당 작업을 함께 기록하세요." dirty={dirty} onClose={onClose}>
    <form noValidate onChange={() => setDirty(true)} onSubmit={(event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget); const value = (name: string) => formText(data, name);
      const status = STATUS.find((item) => item === value("status"));
      if (!status) { setError("작업 상태를 선택하세요."); return; }
      if (value("verifiedAt") && value("verifiedAt") > todayKst()) { setError("작업 검증일은 미래 날짜일 수 없습니다."); return; }
      const candidate: BusinessPlanTask = { ...task, title: value("title"), status, category: value("category"), priority: value("priority"), description: value("description"), owner: value("owner"), assignment: value("assignment"), nextAction: value("nextAction"), notes: value("notes"), evidenceUrl: value("evidenceUrl"), sourceUrl: value("sourceUrl"), sourceTitle: value("sourceTitle"), verifiedAt: value("verifiedAt") === businessPlanDateInput(task.verifiedAt) ? task.verifiedAt : value("verifiedAt"), dueDate: value("dueDate"), updatedAt: new Date().toISOString() };
      const failure = onCommit({ ...board, tasks: exists ? board.tasks.map((item) => item.id === task.id ? candidate : item) : [...board.tasks, candidate] }, `${candidate.title}: 작업 기록 ${exists ? "수정" : "추가"}`);
      if (failure) setError(failure); else onClose();
    }}>
      <div className="bp-dialog-body"><div className="bp-form-grid">
        <TextField label="작업 제목" name="title" value={task.title} maxLength={500} required full />
        <SelectField label="작업 상태" name="status" value={task.status} options={STATUS} />
        <SelectField label="분류" name="category" value={task.category} options={[...new Set([...categories, task.category])]} />
        <SelectField label="우선순위" name="priority" value={task.priority} options={[...new Set(["높음", "보통", "낮음", task.priority])]} />
        <TextField label="담당자" name="owner" value={task.owner} maxLength={500} />
        <TextAreaField label="확인할 문제·보완 내용" name="description" value={task.description} full />
        <TextAreaField label="담당 작업" name="assignment" value={task.assignment || task.assignedWork} />
        <TextAreaField label="다음 조치" name="nextAction" value={task.nextAction} />
        <TextField label="근거 링크" name="evidenceUrl" value={task.evidenceUrl} type="url" />
        <TextField label="원문 출처 제목" name="sourceTitle" value={task.sourceTitle} />
        <TextField label="원문 출처 링크" name="sourceUrl" value={task.sourceUrl} type="url" full />
        <TextField label="작업 검증일" name="verifiedAt" value={businessPlanDateInput(task.verifiedAt)} type="date" />
        <TextField label="목표일" name="dueDate" value={task.dueDate} type="date" />
        <TextAreaField label="작업 메모" name="notes" value={task.notes || task.note} full />
      </div><BusinessPlanError error={error} /></div><BusinessPlanFormFooter />
    </form>
  </BusinessPlanDialog>;
}
