import { WORKSPACE_FACT_STATUSES, WORKSPACE_STATUSES, workspaceFreshness } from "@toonstudio/contracts/admin-workspace";
import { useDeferredValue, useMemo, useState } from "react";

import { statusTone, WorkspaceBadge } from "./workspace-ui";

import type { WorkspaceRecord } from "@toonstudio/contracts/admin-workspace";

interface Props {
  records: WorkspaceRecord[]; title: string; description: string; editable: boolean; now: Date;
  onOpen: (record: WorkspaceRecord) => void; onAdd: () => void;
}

export function WorkspaceRecords({ records, title, description, editable, now, onOpen, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [fact, setFact] = useState("");
  const [project, setProject] = useState("");
  const [layout, setLayout] = useState<"table" | "board">("table");
  const search = useDeferredValue(query).trim().toLocaleLowerCase("ko-KR");
  const filtered = useMemo(() => records.filter(record =>
    (!status || record.status === status) && (!fact || record.factStatus === fact) && (!project || record.project === project)
    && (!search || [record.title, record.text, record.owner, record.assignment, record.nextAction, record.notes].join(" ").toLocaleLowerCase("ko-KR").includes(search))),
  [records, status, fact, project, search]);
  const projects = [...new Set(records.map(record => record.project).filter(Boolean))];
  const reset = () => { setQuery(""); setStatus(""); setFact(""); setProject(""); };
  return <section className="workspace-panel" aria-label={title}>
    <header className="workspace-panel-header"><div><h2>{title} <span className="workspace-count">{filtered.length}</span></h2><p>{description}</p></div><div className="workspace-inline">
      <div className="workspace-view-toggle" role="group" aria-label="목록 보기 방식"><button type="button" aria-pressed={layout === "table"} onClick={() => setLayout("table")}>표</button><button type="button" aria-pressed={layout === "board"} onClick={() => setLayout("board")}>상태별</button></div>
      {editable ? <button className="workspace-primary" onClick={onAdd}>기록 추가</button> : null}
    </div></header>
    <div className="workspace-toolbar">
      <label className="workspace-search"><span className="workspace-sr-only">기록 검색</span><input type="search" value={query} placeholder="작업·담당자·근거·다음 조치 검색" onChange={event => setQuery(event.target.value)} /></label>
      <label><span className="workspace-sr-only">진행 상태 필터</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="">전체 상태</option>{WORKSPACE_STATUSES.map(value => <option key={value}>{value}</option>)}</select></label>
      <label><span className="workspace-sr-only">사실 확인 필터</span><select value={fact} onChange={event => setFact(event.target.value)}><option value="">전체 검증</option>{WORKSPACE_FACT_STATUSES.map(value => <option key={value}>{value}</option>)}</select></label>
      {projects.length > 1 ? <label><span className="workspace-sr-only">프로젝트 필터</span><select value={project} onChange={event => setProject(event.target.value)}><option value="">전체 프로젝트</option>{projects.map(value => <option key={value}>{value}</option>)}</select></label> : null}
    </div>
    {!filtered.length ? <div className="workspace-empty"><h3>{records.length ? "조건에 맞는 기록이 없습니다." : "아직 등록된 기록이 없습니다."}</h3><p>{records.length ? "검색어나 상태 조건을 확인하세요." : "일반 작업을 추가하거나 인증된 JSON 백업에서 기존 기록을 가져오세요."}</p>{records.length ? <button onClick={reset}>필터 초기화</button> : null}</div>
      : layout === "board" ? <div className="workspace-kanban">{WORKSPACE_STATUSES.map(value => <section key={value} className="workspace-kanban-column" aria-label={value + " 기록"}><h3><WorkspaceBadge tone={statusTone(value)}>{value}</WorkspaceBadge><span>{filtered.filter(record => record.status === value).length}</span></h3>{filtered.filter(record => record.status === value).map(record => <button className="workspace-kanban-card" key={record.id} onClick={() => onOpen(record)}><small>{record.project}</small><strong>{record.title}</strong><span>{record.nextAction || "다음 조치 미기록"}</span><WorkspaceBadge tone={statusTone(record.factStatus)}>{record.factStatus}</WorkspaceBadge></button>)}</section>)}</div>
        : <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th scope="col">작업·주장</th><th scope="col">진행 상태</th><th scope="col">사실 확인·최신성</th><th scope="col">담당·다음 조치</th><th scope="col"><span className="workspace-sr-only">상세</span></th></tr></thead><tbody>
          {filtered.map(record => {
            const freshness = workspaceFreshness(record, now);
            const current = record.factStatus === "확인" && freshness.tone === "good";
            const result = record.kind === "비교"
              ? current ? "비교 조건·원문 확인" : "비교 결과 미확인"
              : current && record.value !== null ? String(record.value) + " " + record.unit + (record.kind === "매출 전망" ? " · 전망·가정" : "") : "수치 미확인";
            return <tr key={record.id}><td><button className="workspace-title-button" onClick={() => onOpen(record)}>{record.title}</button><small>{record.project} · {record.category || (record.recordType === "claim" ? record.kind : "분류 미지정")}</small>{record.kind !== "일반" ? <small>{result}</small> : null}</td>
              <td><WorkspaceBadge tone={statusTone(record.status)}>{record.status}</WorkspaceBadge>{record.approvalOnly ? <small>실행 승인 요청</small> : null}</td>
              <td><WorkspaceBadge tone={statusTone(record.factStatus)}>{record.factStatus}</WorkspaceBadge><small className={"workspace-freshness--" + freshness.tone}>{freshness.label}</small></td>
              <td><span>{record.owner || "담당 미지정"}</span><small className="workspace-next-action">{record.nextAction || "다음 조치 미기록"}</small></td>
              <td><button onClick={() => onOpen(record)} aria-label={record.title + " 상세 보기"}>열기</button></td></tr>;
          })}
        </tbody></table></div>}
    <footer className="workspace-panel-footer"><span>{filtered.length} / {records.length}개 표시</span><span>진행 상태와 사실 확인은 별도</span></footer>
  </section>;
}
