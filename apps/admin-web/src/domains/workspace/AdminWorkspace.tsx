import { createWorkspaceRecord, freezeWorkspaceDocument, updateWorkspaceRecord, WORKSPACE_MODULES, workspaceFreshness, workspacePreflight } from "@toonstudio/contracts/admin-workspace";
import { useState } from "react";

import { useAdminWorkspace, workspaceId } from "./useAdminWorkspace";
import { downloadWorkspace, workspaceDate, WorkspaceBadge, WorkspaceDialog, WorkspaceFormError } from "./workspace-ui";
import { WorkspaceImportDialog, WorkspaceSources } from "./WorkspaceBackup";
import { WorkspaceDocumentEditor, WorkspaceDocuments, WorkspaceFreezeDialog } from "./WorkspaceDocuments";
import { WorkspaceRecordEditor } from "./WorkspaceRecordEditor";
import { WorkspaceRecords } from "./WorkspaceRecords";
import { WorkspaceApprovals, WorkspaceReview, WorkspaceReviewEditor } from "./WorkspaceReview";

import type { WorkspaceActor } from "./useAdminWorkspace";
import type { ReviewTarget } from "./WorkspaceReview";
import type { AdminWorkspace as WorkspaceState, WorkspaceDocument, WorkspaceModule, WorkspaceRecord } from "@toonstudio/contracts/admin-workspace";

import "./workspace.css";

type Page = "tasks" | "claims" | "documents" | "review" | "approvals" | "sources";
type Modal = { kind: "record"; record: WorkspaceRecord; isNew: boolean } | { kind: "document"; document: WorkspaceDocument } | { kind: "freeze"; document: WorkspaceDocument } | { kind: "review"; target: ReviewTarget } | { kind: "import" | "reload" } | null;
const businessPages: readonly [Page, string][] = [["tasks", "작업 보드"], ["claims", "주장·근거"], ["documents", "문서·버전"], ["review", "멘토·최종 점검"], ["approvals", "승인 대기"], ["sources", "가져온 원문"]];
const operationPages: readonly [Page, string][] = [["tasks", "운영 기록"], ["approvals", "승인 대기"], ["sources", "가져온 원문"]];

export function AdminWorkspace({ actor }: { actor: WorkspaceActor }) {
  if (!actor.id.trim() || !["admin", "operator"].includes(actor.role)) return <p role="alert">관리자 인증을 확인한 뒤 작업실을 열 수 있습니다.</p>;
  return <WorkspaceSession key={actor.id + ":" + actor.role} actor={actor} />;
}

function WorkspaceSession({ actor }: { actor: WorkspaceActor }) {
  const session = useAdminWorkspace(actor);
  const [module, setModule] = useState<WorkspaceModule>("business");
  const [page, setPage] = useState<Page>("tasks");
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState("");
  if (session.phase === "loading") return <section className="admin-workspace"><p role="status" className="workspace-alert">인증된 공유 작업실을 불러오고 있습니다.</p></section>;
  if (session.phase === "error" || session.phase === "denied" || !session.state) return <section className="admin-workspace"><div className="workspace-alert workspace-alert--bad" role="alert"><h1>작업실을 열 수 없습니다.</h1><p>{session.error || "관리자 로그인과 연결을 확인해 주세요."}</p><button onClick={() => void session.reload()} disabled={session.loading}>다시 확인</button></div></section>;
  const state = session.state;
  const busy = session.saving || session.loading;
  const work = state.records.filter(record => record.recordType !== "claim");
  const claims = state.records.filter(record => record.recordType === "claim" && record.factStatus !== "제외");
  const verified = claims.filter(record => record.factStatus === "확인" && workspaceFreshness(record, session.now).tone === "good");
  const gates = workspacePreflight(state, session.now);
  const blockers = gates.filter(gate => gate.tone === "bad");
  const approvalCount = state.approvals.length + state.records.filter(record => record.approvalOnly || record.status === "승인 대기").length;
  const records = state.records.filter(record => record.module === module && (page === "claims" ? record.recordType === "claim" : record.recordType !== "claim"));
  const moduleLabel = WORKSPACE_MODULES.find(item => item.id === module)?.label ?? "작업 보드";
  const showRecord = (record: WorkspaceRecord) => setModal({ kind: "record", record, isNew: false });
  const close = () => setModal(null);
  const addRecord = () => {
    const recordType = page === "claims" ? "claim" : module === "business" ? "task" : "operation";
    const record = createWorkspaceRecord(workspaceId(recordType), module, recordType);
    if (module === "business") record.freshnessDays = state.settings.freshnessDays;
    setModal({ kind: "record", record: { ...record, title: "" }, isNew: true });
  };
  const saveRecord = async (record: WorkspaceRecord): Promise<string | null> => {
    const exists = state.records.some(value => value.id === record.id);
    const base: WorkspaceState = exists ? state : { ...state, records: [...state.records, createWorkspaceRecord(record.id, record.module, record.recordType)] };
    const result = updateWorkspaceRecord(base, record);
    if (!result.ok) return result.errors.join("\n");
    return session.commit(result.value, "작업과 검증 근거를 저장했습니다. 핵심 근거가 바뀐 항목은 미확인으로 되돌렸습니다.");
  };
  const exportCurrent = () => {
    try { downloadWorkspace(state); setError(""); }
    catch { setError("백업 파일을 만들지 못했습니다. 브라우저 다운로드 설정을 확인해 주세요."); }
  };
  const reload = async () => {
    try { downloadWorkspace(state, "before-reload"); }
    catch { setError("현재 편집의 백업 파일을 만들지 못해 최신 읽기를 중단했습니다."); return; }
    if (await session.reload()) setModal(null);
  };
  return <section className="admin-workspace" aria-label="사업계획·운영 작업실">
    <header className="workspace-heading"><div><p className="workspace-eyebrow">TOONSTUDIO · ADMIN WORKSPACE</p><h1>사업계획·운영 작업실</h1><p>주장과 원문, 작업의 다음 조치부터 제출 준비까지.</p></div><div className="workspace-heading-actions">
      <WorkspaceBadge tone={session.dirty ? "warn" : "neutral"}>{session.dirty ? "미저장 편집 있음" : session.revision ? "공유 기록 저장됨" : "초기 템플릿"}</WorkspaceBadge>
      {actor.role === "operator" || !session.serverCanEdit ? <WorkspaceBadge tone="info">읽기 전용</WorkspaceBadge> : null}
      <button onClick={exportCurrent} disabled={busy}>JSON 백업</button>
      {actor.role === "admin" && session.serverCanEdit ? <button onClick={() => setModal({ kind: "import" })} disabled={!session.canEdit}>JSON 가져오기</button> : null}
    </div></header>
    <div className="workspace-notice-row"><span>공유 저장본 {session.revision} · {workspaceDate(session.updatedAt)}</span><span>코드·제출·계정 변경·배포는 승인 대기</span></div>
    {session.error ? <div className="workspace-alert workspace-alert--bad" role="alert"><p>{session.error}</p><div className="workspace-inline"><button onClick={exportCurrent} disabled={busy}>현재 편집 백업</button>{session.dirty && !session.conflict && actor.role === "admin" ? <button onClick={() => void session.retry()} disabled={busy}>같은 변경 재시도</button> : null}<button onClick={() => setModal({ kind: "reload" })} disabled={busy}>백업 후 최신 기록 불러오기</button></div></div> : null}
    <WorkspaceFormError error={error} />
    <p className="workspace-live-status" role="status">{session.notice}</p>
    <div className="workspace-metrics" aria-label="전체 준비 현황">
      <div><span>전체 작업</span><strong>{work.length}<small>개</small></strong><p>5개 모듈의 작업·운영 기록</p></div>
      <div><span>현재 확인된 주장</span><strong>{verified.length}<small> / {claims.length}</small></strong><p>근거와 최신성을 함께 충족</p></div>
      <div><span>제출 준비 점검</span><strong>{blockers.length}<small>개 남음</small></strong><p>문서·멘토·누락·오류 확인</p></div>
      <div><span>승인 대기</span><strong>{approvalCount}<small>개</small></strong><p>실행 요청과 검토 기록</p></div>
    </div>
    <nav className="workspace-modules" aria-label="업무 모듈">{WORKSPACE_MODULES.map(item => <button key={item.id} aria-current={module === item.id ? "page" : undefined} onClick={() => { setModule(item.id); setPage("tasks"); }}><span>{item.label}</span><strong>{state.records.filter(record => record.module === item.id && record.recordType !== "claim").length}</strong></button>)}</nav>
    <nav className="workspace-tabs" aria-label="작업실 보기">{(module === "business" ? businessPages : operationPages).map(([id, label]) => <button key={id} aria-current={page === id ? "page" : undefined} onClick={() => setPage(id)}>{label}</button>)}</nav>
    {page === "tasks" || page === "claims" ? <div className={"workspace-overview" + (module === "business" && page === "tasks" ? "" : " workspace-overview--single")}>
      <WorkspaceRecords key={module + ":" + page} records={records} now={session.now} title={page === "claims" ? "주장·근거" : moduleLabel} description={page === "claims" ? "출처·숫자·기간·단위·독립성을 확인하고 미확인 범위를 기록합니다." : "진행 상태, 근거 확인, 담당 작업과 다음 조치를 함께 관리합니다."} editable={session.canEdit} onOpen={showRecord} onAdd={addRecord} />
      {module === "business" && page === "tasks" ? <aside className="workspace-summary" aria-label="제출 준비 요약">
        <section className="workspace-panel"><header className="workspace-panel-header"><h2>문서·버전</h2><button onClick={() => setPage("documents")}>전체 보기</button></header><div className="workspace-panel-body">{state.documents.slice(0, 3).map(document => <button className="workspace-summary-link" key={document.id} onClick={() => setModal({ kind: "document", document })}><strong>{document.title}</strong><span>작업용 {document.working.label}</span><span>제출 후보 {document.submission?.label ?? "미지정"}</span></button>)}</div></section>
        <section className="workspace-panel"><header className="workspace-panel-header"><h2>멘토 요청</h2><button onClick={() => setPage("review")}>전체 보기</button></header><div className="workspace-panel-body">{state.mentor.slice(0, 3).map(item => <button className="workspace-summary-link" key={item.id} onClick={() => setModal({ kind: "review", target: { kind: "mentor", item } })}><strong>{item.text}</strong><span>{item.status} · {item.location || "반영 위치 미기록"}</span></button>)}</div></section>
        <section className="workspace-panel"><header className="workspace-panel-header"><h2>최종 제출 점검</h2><WorkspaceBadge tone={blockers.length ? "warn" : "good"}>{blockers.length}개 확인 필요</WorkspaceBadge></header><div className="workspace-panel-body"><ul className="workspace-summary-gates">{gates.filter(gate => gate.count).slice(0, 4).map(gate => <li key={gate.id}><span>{gate.title}</span><strong>{gate.count}</strong></li>)}</ul><button className="workspace-primary" onClick={() => setPage("review")}>누락·오류 점검</button></div></section>
      </aside> : null}
    </div> : page === "documents" ? <WorkspaceDocuments state={state} editable={session.canEdit} onOpen={document => setModal({ kind: "document", document })} onFreeze={document => setModal({ kind: "freeze", document })} onAdd={() => setModal({ kind: "document", document: { id: workspaceId("document"), title: "", purpose: "submission", working: { label: "작업본 v0.1", url: "", content: "", updatedAt: "" }, submission: null, history: [] } })} />
      : page === "review" ? <WorkspaceReview state={state} now={session.now} editable={session.canEdit} onEdit={target => setModal({ kind: "review", target })} />
        : page === "approvals" ? <WorkspaceApprovals state={state} editable={session.canEdit} onRecord={showRecord} onEdit={target => setModal({ kind: "review", target })} />
          : <WorkspaceSources state={state} />}
    <footer className="workspace-footer"><span>현재 검증과 원본 기록을 구분합니다.</span><button onClick={() => setModal({ kind: "reload" })} disabled={busy}>최신 기록 확인</button></footer>
    {modal?.kind === "record" ? <WorkspaceRecordEditor state={state} record={modal.record} isNew={modal.isNew} editable={session.canEdit} busy={busy} onSave={saveRecord} onClose={close} /> : null}
    {modal?.kind === "document" ? <WorkspaceDocumentEditor state={state} document={modal.document} editable={session.canEdit} busy={busy} onSave={session.commit} onClose={close} /> : null}
    {modal?.kind === "freeze" ? <WorkspaceFreezeDialog document={modal.document} busy={busy} onClose={close} onFreeze={async () => { const result = freezeWorkspaceDocument(state, modal.document.id, workspaceId("snapshot")); return result.ok ? session.commit(result.value, "제출 후보와 당시 검증 기록을 고정했습니다. 외부 제출은 실행하지 않았습니다.") : result.errors.join("\n"); }} /> : null}
    {modal?.kind === "review" ? <WorkspaceReviewEditor state={state} target={modal.target} editable={session.canEdit} busy={busy} onSave={session.commit} onClose={close} /> : null}
    {modal?.kind === "import" ? <WorkspaceImportDialog state={state} editable={session.canEdit} busy={busy} onSave={session.commit} onClose={close} /> : null}
    {modal?.kind === "reload" ? <WorkspaceDialog title="백업 후 최신 기록 불러오기" description="현재 화면의 데이터를 JSON으로 보관한 뒤 공유 저장본을 다시 읽습니다. 두 버전은 자동으로 합치지 않습니다." onClose={close} busy={busy}><div className="workspace-dialog-body"><p>{session.dirty ? "저장되지 않은 편집을 먼저 백업합니다. 최신 기록을 불러오면 파일의 변경 내용을 비교해 반영하세요." : "현재 기록을 백업하고 서버에 저장된 최신 내용을 확인합니다."}</p><WorkspaceFormError error={session.error} /></div><footer className="workspace-dialog-footer"><button onClick={close} disabled={busy}>취소</button><button className="workspace-primary" onClick={() => void reload()} disabled={busy}>백업하고 최신 읽기</button></footer></WorkspaceDialog> : null}
  </section>;
}
