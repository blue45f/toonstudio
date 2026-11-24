import { GLOBAL_PLATFORM_TASK_ID, STATUSES } from "@toonstudio/contracts/final-submission";
import { useState } from "react";

import { SubmissionBadge, SubmissionPanel, submissionDate } from "./final-submission-ui";
import { createSubmissionTask } from "./FinalSubmissionTaskEditor";

import type { BoardState, Task } from "@toonstudio/contracts/final-submission";

export function FinalSubmissionTasks({ board, onEdit, disabled }: { board: BoardState; onEdit: (task: Task) => void; disabled: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("전체");
  const [category, setCategory] = useState("전체");
  const [view, setView] = useState<"list" | "board">("list");
  const search = query.trim().toLocaleLowerCase("ko-KR");
  const tasks = board.tasks.filter((task) => (status === "전체" || task.status === status) && (category === "전체" || task.category === category) && (!search || [task.title, task.fileName, task.version, task.discrepancy, task.nextAction, ...task.evidenceLinks.flatMap((link) => [link.label, link.url]), ...task.attachments.flatMap((link) => [link.label, link.url])].join(" ").toLocaleLowerCase("ko-KR").includes(search)));

  function card(task: Task) {
    return <button type="button" className="fs-task-card" key={task.id} disabled={disabled} onClick={() => onEdit(task)}>
      <span className="fs-task-card-head"><span className="fs-meta">{task.category} · {task.priority === "높음" ? "우선 점검" : "일반 점검"}</span><SubmissionBadge status={task.status} /></span>
      <strong>{task.title}</strong>
      {task.id === GLOBAL_PLATFORM_TASK_ID && <span className="fs-meta">필수 문서 3종 전체의 플랫폼 근거 점검</span>}
      <span className="fs-meta">{task.fileName || "파일 미확인"}{task.version ? ` · ${task.version}` : ""}</span>
      <span className="fs-task-next">{task.nextAction || "다음 조치를 기록하세요."}</span>
      <span className="fs-meta">근거 {task.evidenceLinks.length} · 증빙 {task.attachments.length}{task.approvalRequired ? " · 실행 잠금" : ` · 확인 ${submissionDate(task.lastConfirmedAt)}`}</span>
    </button>;
  }

  return <SubmissionPanel id="fs-tasks" title="최종 제출 보완 항목" description="필수 파일·구버전 첨부·보고서와 증빙 대조·형식·멘토 검토본 반영을 추적합니다." actions={<button type="button" className="fs-button" disabled={disabled} onClick={() => onEdit(createSubmissionTask())}>보완 항목 추가</button>}>
    <div className="fs-toolbar">
      <label className="fs-field fs-search"><span>항목·파일·근거 검색</span><input value={query} placeholder="파일명, 다음 조치, 증빙 링크" onChange={(event) => setQuery(event.target.value)} /></label>
      <label className="fs-field"><span>관리 상태</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>전체</option>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="fs-field"><span>점검 분류</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option>전체</option>{Array.from(new Set(board.tasks.map((task) => task.category))).map((item) => <option key={item}>{item}</option>)}</select></label>
      <div className="fs-view-switch" aria-label="항목 보기 방식"><button type="button" className="fs-button" aria-pressed={view === "list"} onClick={() => setView("list")}>목록</button><button type="button" className="fs-button" aria-pressed={view === "board"} onClick={() => setView("board")}>상태 보드</button></div>
    </div>
    <p className="fs-results" role="status">{board.tasks.length}개 중 {tasks.length}개 표시</p>
    {!tasks.length ? <p className="fs-empty">조건에 맞는 항목이 없습니다. 검색어 또는 필터를 변경하세요.</p> : view === "list" ? <div className="fs-task-list">{tasks.map(card)}</div> : <div className="fs-kanban" tabIndex={0} role="region" aria-label="다섯 관리 상태별 점검 보드">
      {STATUSES.map((item) => <section className="fs-kanban-column" key={item}><h3><SubmissionBadge status={item} /><span>{tasks.filter((task) => task.status === item).length}</span></h3>{tasks.filter((task) => task.status === item).map(card)}{!tasks.some((task) => task.status === item) && <p className="fs-meta">해당 상태의 항목이 없습니다.</p>}</section>)}
    </div>}
  </SubmissionPanel>;
}
