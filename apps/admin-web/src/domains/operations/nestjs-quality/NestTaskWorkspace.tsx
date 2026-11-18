import { STATUSES } from "@toonstudio/contracts/admin-nestjs-quality";
import { useMemo, useState } from "react";

import { NestStatus, NestTaskList, isNestClosed } from "./nestjs-quality-ui";

import type { Task } from "@toonstudio/contracts/admin-nestjs-quality";

export function NestTaskWorkspace({ tasks, section, canEdit, onOpen, onAdd }: {
  tasks: Task[]; section: "tasks" | "scenarios" | "approvals"; canEdit: boolean;
  onOpen: (task: Task) => void; onAdd: () => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("전체");
  const [category, setCategory] = useState("전체");
  const [includeClosed, setIncludeClosed] = useState(false);
  const [layout, setLayout] = useState<"list" | "kanban">("list");
  const visible = useMemo(() => tasks.filter((task) => {
    if (!includeClosed && isNestClosed(task)) return false;
    if (section === "scenarios" && task.category !== "검증 시나리오") return false;
    if (section === "approvals" && !task.approvalRequired) return false;
    if (status !== "전체" && task.status !== status) return false;
    if (category !== "전체" && task.category !== category) return false;
    return `${task.id} ${task.title} ${task.summary} ${task.scope} ${task.owner} ${task.commit} ${task.evidenceLinks.map((link) => `${link.label} ${link.url}`).join(" ")}`.toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id)), [tasks, section, includeClosed, status, category, search]);

  return <section>
    {section === "scenarios" && <p className="nest-notice">시나리오 설계와 실행 결과를 구분합니다. 모의 소켓·메모리 테스트는 실제 Nest + 인증 + Socket.IO + PostgreSQL 전체 경로의 실행 증거를 대신하지 않습니다.</p>}
    {section === "approvals" && <p className="nest-notice">버전 정렬·코드 수정·PR 병합·운영 배포의 검토 메모만 기록합니다. 저장은 해당 작업을 실행하거나 승인하지 않습니다.</p>}
    <div className="nest-panel">
      <div className="nest-toolbar nest-between"><div className="nest-tabs"><button type="button" aria-pressed={layout === "list"} onClick={() => setLayout("list")}>작업 목록</button><button type="button" aria-pressed={layout === "kanban"} onClick={() => setLayout("kanban")}>6상태 보드</button></div><span>{visible.length}개 표시</span>{canEdit && section !== "approvals" && <button type="button" onClick={onAdd}>검증 항목 추가</button>}</div>
      <div className="nest-filters">
        <label>작업 검색<input type="search" value={search} placeholder="항목·담당·PR·커밋" onChange={(event) => setSearch(event.target.value)} /></label>
        <label>상태 필터<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="전체">모든 상태</option>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>영역 필터<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="전체">모든 영역</option>{[...new Set(tasks.map((task) => task.category))].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="nest-check"><input type="checkbox" checked={includeClosed} onChange={(event) => setIncludeClosed(event.target.checked)} />완료·보관 포함</label>
      </div>
      {layout === "list" ? <NestTaskList tasks={visible} onOpen={onOpen} /> : <div className="nest-kanban">{STATUSES.map((item) => <section className="nest-kanban-column" key={item} aria-label={`${item} 작업`}><h3><NestStatus status={item} /> {visible.filter((task) => task.status === item).length}</h3>{visible.filter((task) => task.status === item).map((task) => <button type="button" className="nest-kanban-card" key={task.id} onClick={() => onOpen(task)}><small>{task.priority} · {task.category}</small><strong>{task.title}</strong><span>결과: {task.result || "미확인"}</span><small>{task.owner || "미지정"} · 근거 {task.evidenceLinks.length}개</small></button>)}{!visible.some((task) => task.status === item) && <p className="nest-muted">항목 없음</p>}</section>)}</div>}
    </div>
  </section>;
}
