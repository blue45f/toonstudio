import { blankTask, formatTime, freshness, PROJECTS, STAGES } from "@toonstudio/contracts/admin-cloud-workboard";
import { useEffect, useMemo, useRef, useState } from "react";

import { CLOUD_WORK_IMPORT_LIMIT, DEFAULT_FILTERS, downloadWorkJson, filterWorkTasks, parseWorkImport, RISK_FILTERS, VIEW_NAMES } from "./cloud-work-helpers";
import { WorkBadge, WorkCallout, WorkIcon, WorkSelect } from "./cloud-work-ui";
import { CloudWorkEditor } from "./CloudWorkEditor";
import { CloudWorkImportDialog } from "./CloudWorkImportDialog";
import { CloudWorkViews } from "./CloudWorkViews";
import { useCloudWorkboard } from "./use-cloud-workboard";
import "./cloud-work.css";

import type { WorkFilters, WorkView } from "./cloud-work-helpers";
import type { WorkIconName } from "./cloud-work-ui";
import type { Board, Task } from "@toonstudio/contracts/admin-cloud-workboard";

const VIEW_ICONS: Record<WorkView, WorkIconName> = { board: "list", compare: "compare", approvals: "lock", activity: "history" };

interface Props { onAccessDenied: (message: string) => void }

export function CloudWorkBoard({ onAccessDenied }: Props) {
  const state = useCloudWorkboard(onAccessDenied);
  const { board, revision, loading, saving, loadError, saveError, conflict } = state;
  const [view, setView] = useState<WorkView>("board");
  const [layout, setLayout] = useState<"table" | "kanban">("table");
  const [filters, setFilters] = useState<WorkFilters>(DEFAULT_FILTERS);
  const [now, setNow] = useState(Date.now);
  const [editor, setEditor] = useState<{ task: Task; revision: number } | null>(null);
  const [incoming, setIncoming] = useState<{ board: Board; revision: number } | null>(null);
  const [importError, setImportError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const fileRead = useRef(0);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => { window.clearInterval(timer); fileRead.current += 1; };
  }, []);

  const projects = useMemo(() => [...new Set<string>([...PROJECTS, ...(board?.tasks.map(task => task.project) ?? [])])], [board]);
  const tasks = useMemo(() => filterWorkTasks(board?.tasks ?? [], filters, now), [board, filters, now]);
  const counts = useMemo(() => ({
    remaining: board?.tasks.filter(task => task.stage !== "main 머지 완료").length ?? 0,
    approvals: board?.tasks.filter(task => task.stage === "승인 대기").length ?? 0,
    risks: board?.tasks.filter(task => Object.values(task.risks).includes("감지")).length ?? 0,
    unknown: board?.tasks.filter(task => freshness(task, now) !== "24시간 내 확인").length ?? 0,
  }), [board, now]);
  const unavailable = loading || !!loadError;
  const canEdit = !!board && !unavailable && !saving;
  const filter = (patch: Partial<WorkFilters>) => setFilters(current => ({ ...current, ...patch }));
  const edit = (task: Task) => { setNotice(""); setEditor({ task, revision }); };
  const add = () => {
    if (!canEdit || !board) return;
    if (board.tasks.length >= 400) { setNotice("보드는 최대 400개의 작업을 저장할 수 있습니다."); return; }
    edit(blankTask(filters.project === "전체 프로젝트" ? "ToonStudio" : filters.project));
  };
  const boardWithTask = (task: Task): Board => {
    if (!board) throw new Error("서버 기록을 먼저 불러와 주세요.");
    return { ...board, tasks: board.tasks.some(item => item.id === task.id) ? board.tasks.map(item => item.id === task.id ? task : item) : [...board.tasks, task] };
  };
  const saveTask = async (task: Task) => {
    const saved = await state.commit(boardWithTask(task));
    if (saved) setNotice("작업 기록을 저장했습니다. 외부 작업은 실행하지 않았습니다.");
    return saved;
  };
  const readImport = async (file: File | undefined) => {
    if (!file || !canEdit) return;
    const current = ++fileRead.current;
    setImportError("");
    try {
      if (file.size > CLOUD_WORK_IMPORT_LIMIT) throw new Error("JSON 파일은 1.5MB 이하여야 합니다.");
      const result = parseWorkImport(await file.text());
      if (current === fileRead.current) setIncoming({ board: result, revision });
    } catch (cause) {
      if (current === fileRead.current) setImportError(cause instanceof Error ? cause.message : "JSON 파일을 읽지 못했습니다.");
    }
  };
  const reload = () => { setNotice(""); void state.reload(); };
  return <section className="cloud-workboard" aria-label="클라우드 작업 보드">
    <header className="cw-page-header"><div><span className="cw-eyebrow"><WorkIcon name="cloud" />CLOUD WORKSPACE</span><h1>클라우드 작업 보드</h1><p>남은 작업부터 main 병합 이력까지, 확인한 근거로 이어가는 작업 기록</p></div><WorkBadge tone="teal">관리자 전용</WorkBadge></header>
    <div className="cw-workspace">
      <aside className="cw-sidebar" aria-label="보드 탐색"><span className="cw-sidebar-label">작업 공간</span>
        {(Object.keys(VIEW_NAMES) as WorkView[]).map(key => <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)}><WorkIcon name={VIEW_ICONS[key]} />{VIEW_NAMES[key]}{key === "approvals" && <span>{counts.approvals}</span>}</button>)}
        <span className="cw-sidebar-label">프로젝트</span><button type="button" aria-pressed={filters.project === "전체 프로젝트"} onClick={() => filter({ project: "전체 프로젝트" })}>전체 프로젝트<span>{board?.tasks.length ?? 0}</span></button>
        {projects.map(project => <button type="button" key={project} aria-pressed={filters.project === project} onClick={() => filter({ project })}><span className="cw-project-dot" />{project}<span>{board?.tasks.filter(task => task.project === project).length ?? 0}</span></button>)}
        <div className="cw-sidebar-note"><WorkIcon name="lock" /><p>같은 관리자 계정의 기기에서 공유합니다. 다른 관리자에게 자동 공유되지 않습니다.</p></div>
      </aside>
      <div className="cw-main">
        <div className="cw-toolbar"><div><h2>{VIEW_NAMES[view]}</h2><p className="cw-meta">증빙 스냅샷 {formatTime(board?.snapshotAt ?? "")} · 서버 저장 {formatTime(state.storedAt ?? "")}</p></div>
          <div className="cw-actions"><button type="button" disabled={loading || saving} onClick={reload}><WorkIcon name="refresh" />새로고침</button><button type="button" disabled={!board} onClick={() => { if (board) downloadWorkJson(board); }}><WorkIcon name="download" />내보내기</button><button type="button" disabled={!canEdit || conflict} onClick={() => fileInput.current?.click()}><WorkIcon name="upload" />가져오기</button><button type="button" className="cw-primary" disabled={!canEdit || conflict} onClick={add}><WorkIcon name="add" />작업 추가</button></div>
        </div>
        <input className="cw-sr-only" type="file" accept="application/json,.json" ref={fileInput} aria-label="작업 보드 JSON 파일" onChange={event => { void readImport(event.target.files?.[0]); event.target.value = ""; }} />
        <WorkCallout>코드 수정·main 병합·배포·계정·운영 데이터 변경은 승인 대기 항목으로 기록합니다. 확인하지 못한 상태는 미확인으로 유지하며, 24시간이 지난 증빙은 재확인이 필요합니다.</WorkCallout>
        {loading && <p role="status" className="cw-loading">서버 작업 기록을 불러오고 있습니다.</p>}
        {loadError && <div role="alert" className="cw-error"><strong>작업 기록 조회 실패</strong><p>{loadError}</p>{board && <p>아래는 이전에 조회한 기록입니다. 최신 기록을 불러오기 전에는 저장할 수 없습니다.</p>}<button type="button" disabled={loading} onClick={reload}>다시 불러오기</button></div>}
        {importError && <div role="alert" className="cw-error">{importError}</div>}
        {notice && <p role="status" className="cw-notice">{notice}</p>}
        {saveError && !editor && !incoming && <div role="alert" className="cw-error">{saveError}</div>}
        {board && <>
          <div className="cw-metrics">
            <button type="button" onClick={() => { setView("board"); setFilters(DEFAULT_FILTERS); }}><span>전체 / 남은 작업</span><strong>{board.tasks.length}<small> / {counts.remaining}</small></strong><span>main 병합 이력 제외</span></button>
            <button type="button" onClick={() => { setView("approvals"); setFilters(DEFAULT_FILTERS); }}><span>승인 대기</span><strong>{counts.approvals}</strong><span>실행 전 범위 검토</span></button>
            <button type="button" onClick={() => { setView("board"); setFilters({ ...DEFAULT_FILTERS, risk: "위험 감지" }); }}><span>위험 신호</span><strong>{counts.risks}</strong><span>충돌 · 회귀 · CI · 배포</span></button>
            <button type="button" onClick={() => { setView("board"); setFilters({ ...DEFAULT_FILTERS, risk: "증빙 미확인·오래됨" }); }}><span>증빙 재확인</span><strong>{counts.unknown}</strong><span>미확인 또는 24시간 경과</span></button>
          </div>
          <div className="cw-mobile-views" aria-label="보드 보기">{(Object.keys(VIEW_NAMES) as WorkView[]).map(key => <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)}>{VIEW_NAMES[key]}</button>)}</div>
          <div className="cw-filters"><label className="cw-search"><WorkIcon name="search" /><input aria-label="작업 검색" placeholder="작업, 브랜치, SHA 검색" value={filters.query} onChange={event => filter({ query: event.target.value })} /></label><WorkSelect label="프로젝트 필터" value={filters.project} options={["전체 프로젝트", ...projects]} onChange={project => filter({ project })} /><WorkSelect label="상태 필터" value={filters.stage} options={["전체 상태", ...STAGES]} onChange={stage => filter({ stage })} /><WorkSelect label="신호 필터" value={filters.risk} options={RISK_FILTERS} onChange={risk => filter({ risk })} /></div>
          <div className="cw-results-heading"><p>{tasks.length}개 작업 <span className="cw-muted">· 서버 버전 {revision}</span></p>{view === "board" && <div className="cw-layout-controls" aria-label="작업 배치"><button type="button" aria-label="표 보기" aria-pressed={layout === "table"} onClick={() => setLayout("table")}><WorkIcon name="list" /></button><button type="button" aria-label="칸반 보기" aria-pressed={layout === "kanban"} onClick={() => setLayout("kanban")}><WorkIcon name="kanban" /></button></div>}</div>
          {board.tasks.length === 0 ? <div className="cw-empty"><WorkIcon name="cloud" size={32} /><h3>아직 저장된 작업이 없습니다</h3><p>새 작업을 추가하거나 Sites에서 내보낸 JSON을 가져오세요. 실제 증빙을 입력하기 전에는 모든 상태가 미확인입니다.</p></div> : <CloudWorkViews board={board} tasks={tasks} now={now} view={view} layout={layout} onEdit={edit} />}
        </>}
      </div>
    </div>
    {board && editor && <CloudWorkEditor key={editor.task.id} initial={editor.task} projects={projects} openedRevision={editor.revision} revision={revision} latest={board.tasks.find(task => task.id === editor.task.id)} saving={saving} unavailable={unavailable} conflict={conflict} error={saveError} onSave={saveTask} onClose={() => setEditor(null)} onReload={reload} onBackup={task => downloadWorkJson(boardWithTask(task), true)} />}
    {board && incoming && <CloudWorkImportDialog incoming={incoming.board} current={board} openedRevision={incoming.revision} revision={revision} saving={saving} unavailable={unavailable} conflict={conflict} error={saveError} onSave={state.commit} onClose={() => setIncoming(null)} onReload={reload} />}
  </section>;
}
