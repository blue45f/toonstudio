import { STATUSES } from "@toonstudio/contracts/final-submission";
import { useState } from "react";

import { downloadSubmission, SubmissionBadge, SubmissionDialog, SubmissionError, SubmissionLink, SubmissionPanel, submissionCsv, submissionDate } from "./final-submission-ui";
import { FinalSubmissionDocumentEditor } from "./FinalSubmissionDocumentEditor";
import { FinalSubmissionDocuments } from "./FinalSubmissionDocuments";
import { FinalSubmissionImport } from "./FinalSubmissionImport";
import { createSubmissionSource, FinalSubmissionSourceEditor } from "./FinalSubmissionSourceEditor";
import { FinalSubmissionTaskEditor } from "./FinalSubmissionTaskEditor";
import { FinalSubmissionTasks } from "./FinalSubmissionTasks";
import { useFinalSubmission } from "./use-final-submission";

import type { DocumentRecord, Source, Task } from "@toonstudio/contracts/final-submission";

import "./final-submission.css";

export function FinalSubmissionBoard({ userIdentity }: { userIdentity: string }) {
  if (!userIdentity.trim()) return <div className="final-submission"><SubmissionError error="관리자 신원을 확인한 뒤 점검 기록을 열 수 있습니다." /></div>;
  return <FinalSubmissionWorkspace key={userIdentity} userIdentity={userIdentity} />;
}

function FinalSubmissionWorkspace({ userIdentity }: { userIdentity: string }) {
  const workspace = useFinalSubmission(userIdentity);
  const { board, revision, updatedAt, history, loading, saving, dirty, denied, conflict, error, notice, accessVerified, hasPendingSave, commit, importBoard, persist, reload, exportBoard } = workspace;
  const [task, setTask] = useState<Task | null>(null);
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [reloadOpen, setReloadOpen] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const disabled = !accessVerified || loading || saving || conflict || hasPendingSave;

  async function backup(format: "json" | "csv") {
    if (exporting || saving) return;
    setExportError(""); setExporting(true);
    try {
      const authorized = await exportBoard(); if (!authorized) return;
      const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      if (format === "json") downloadSubmission(`final-submission-${today}.json`, JSON.stringify({ board: authorized, history, exportedAt: new Date().toISOString() }, null, 2));
      else downloadSubmission(`final-submission-${today}.csv`, submissionCsv(authorized), "text/csv;charset=utf-8");
    } catch { setExportError("내보내기 파일을 만들지 못했습니다. 기록은 변경하지 않았습니다. 다시 시도하세요."); }
    finally { setExporting(false); }
  }

  if (denied) return <div className="final-submission"><SubmissionError error={error || "개인 점검 보드 접근 권한을 확인하지 못했습니다."} /></div>;

  return <div className="final-submission">
    <div className="fs-heading"><div><p className="fs-eyebrow">TOONSTUDIO · SUBMISSION READINESS</p><h1>모두의 창업 1R 최종 제출</h1><p className="fs-muted">최신 파일, 실제 제출 근거, 남은 보완사항을 한곳에서 확인합니다.</p></div><span className="fs-privacy">현재 관리자 계정의 개인 보드</span></div>
    {loading && <p className="fs-notice" role="status">관리자 권한과 개인 저장 기록을 확인하고 있습니다. 확인하는 동안 기록을 숨깁니다.</p>}
    {!accessVerified && !loading && <><SubmissionError error={error} /><button type="button" className="fs-button" onClick={() => void reload(true)}>권한과 저장 기록 다시 확인</button></>}
    <div hidden={!accessVerified} inert={!accessVerified || loading} aria-busy={loading}>
      <div className="fs-savebar"><div><strong>{dirty ? "서버 미저장 변경 있음" : board ? "서버 저장본과 동일" : "서버 기록 미확인"}</strong><span>{revision === null ? "저장 버전 미확인" : `어드민 저장 버전 ${revision}`} · 마지막 저장 {submissionDate(updatedAt)}</span></div><div className="fs-actions">
        <button type="button" className="fs-button" disabled={loading || saving} onClick={() => dirty ? setReloadOpen(true) : void reload()}>서버 기록 다시 읽기</button>
        <button type="button" className="fs-button fs-button--primary" disabled={!accessVerified || !board || loading || saving || conflict || (!dirty && !hasPendingSave)} onClick={() => void persist()}>{saving ? "서버 저장 중…" : hasPendingSave ? "같은 저장 요청 다시 확인" : "서버에 저장"}</button>
      </div></div>
      <SubmissionError error={error} /><SubmissionError error={exportError} />
      {notice && <p className="fs-status" role="status">{notice}</p>}
      {hasPendingSave && !saving && <p className="fs-notice">앞서 보낸 저장 결과를 확인할 때까지 편집을 잠급니다. 같은 저장 요청을 다시 확인하거나 현재 기록을 JSON으로 보관할 수 있습니다.</p>}
      {board && <>
        <div className="fs-actions fs-data-actions"><button type="button" className="fs-button" disabled={disabled} onClick={() => setImportOpen(true)}>Sites JSON 가져오기</button><button type="button" className="fs-button" disabled={!accessVerified || loading || saving || exporting} onClick={() => void backup("json")}>전체 기록 JSON</button><button type="button" className="fs-button" disabled={!accessVerified || loading || saving || exporting} onClick={() => void backup("csv")}>보완 항목 CSV</button></div>
        <div className="fs-metrics" aria-label="다섯 관리 상태 현황">{STATUSES.map((status) => <a href="#fs-tasks" key={status} className="fs-metric"><SubmissionBadge status={status} /><strong>{board.tasks.filter((item) => item.status === status).length}<small>개</small></strong></a>)}</div>
        <p className="fs-observation-note"><strong>플랫폼 관찰 근거</strong> {board.documents.filter((item) => item.platform.status === "미확인").length}/{board.documents.length}개 문서의 실제 제출 여부가 미확인입니다. 보드의 최종 확인은 플랫폼 제출 완료를 대신하지 않습니다.</p>
        <nav className="fs-section-nav" aria-label="최종 제출 점검 구역"><a href="#fs-documents">파일·제출 비교</a><a href="#fs-tasks">보완 항목</a><a href="#fs-approvals">승인 대기</a><a href="#fs-sources">근거 모음</a><a href="#fs-history">저장 이력</a><a href="/admin/growth/business-plan/?view=evidence-coordination">증빙·승인 조정</a></nav>
        <FinalSubmissionDocuments board={board} onEdit={(item) => setDocument(structuredClone(item))} disabled={disabled} />
        <FinalSubmissionTasks board={board} onEdit={(item) => setTask(structuredClone(item))} disabled={disabled} />
        <SubmissionPanel id="fs-approvals" title="실행 승인 대기" description="실제 제출·파일 교체·외부 계정 접근·원본 문서 수정은 실행하지 않습니다. 필요한 범위와 다음 조치만 기록합니다.">
          <div className="fs-approvals">{board.tasks.filter((item) => item.approvalRequired).map((item) => <button type="button" className="fs-approval" key={item.id} disabled={disabled} onClick={() => setTask(structuredClone(item))}><span><strong>{item.title}</strong><small>{item.nextAction || "실행 범위와 필요한 승인을 기록하세요."}</small></span><SubmissionBadge status="승인 대기" /></button>)}</div>
        </SubmissionPanel>
        <div className="fs-support-grid">
          <SubmissionPanel id="fs-sources" title="근거 모음" description="기준 자료와 확인 범위를 기록합니다. 기존 분석은 반복하지 않고 최종본 반영 여부를 점검합니다." actions={<button type="button" className="fs-button" disabled={disabled} onClick={() => setSource(createSubmissionSource())}>기준 자료 추가</button>}>
            {!board.sources.length ? <p className="fs-empty">기준 자료가 없습니다. 기존 Sites JSON을 가져오거나 ‘기준 자료 추가’로 참조를 기록하세요.</p> : <ul className="fs-sources">{board.sources.map((item) => <li key={item.id}><div className="fs-source-heading"><SubmissionLink href={item.url}>{item.title}</SubmissionLink><button type="button" className="fs-button" disabled={disabled} aria-label={`${item.title} 기준 자료 편집`} onClick={() => setSource(structuredClone(item))}>편집</button></div><span className="fs-meta">{item.type} · {submissionDate(item.observedAt)}</span><p>{item.note}</p></li>)}</ul>}
          </SubmissionPanel>
          <SubmissionPanel id="fs-history" title="어드민 저장 이력" description="이 화면에서 서버 저장에 성공한 기록입니다. 원본 파일의 수정 시각과 구분합니다.">
            {!history.length ? <p className="fs-empty">어드민 저장 이력이 없습니다. 가져온 Sites의 과거 이력은 원본 Sites와 JSON에 남아 있습니다.</p> : <ol className="fs-history">{history.map((entry) => <li key={entry.id}><span className="fs-meta">저장 {entry.revision} · {submissionDate(entry.changedAt)}</span><strong>{entry.summary}</strong></li>)}</ol>}
          </SubmissionPanel>
        </div>
        <footer className="fs-footer"><span>시간대가 확인된 시각은 KST · 문서·플랫폼 자동 조회 없음</span><span>Sites와 어드민의 기록은 각각 저장됩니다.</span></footer>
        {task && <FinalSubmissionTaskEditor key={task.id} initial={task} board={board} onCommit={commit} onClose={() => setTask(null)} disabled={disabled} />}
        {document && <FinalSubmissionDocumentEditor key={document.id} initial={document} board={board} onCommit={commit} onClose={() => setDocument(null)} disabled={disabled} />}
        {source && <FinalSubmissionSourceEditor key={source.id} initial={source} board={board} onCommit={commit} onClose={() => setSource(null)} disabled={disabled} />}
        {importOpen && <FinalSubmissionImport board={board} onCommit={importBoard} onClose={() => setImportOpen(false)} disabled={disabled} />}
      </>}
      {reloadOpen && <SubmissionDialog title="서버 최신 기록 다시 읽기" description="현재 화면의 미저장 변경을 버리고 서버의 최신 기록을 읽습니다." onClose={() => setReloadOpen(false)}><div className="fs-dialog-body"><p className="fs-notice">필요한 현재 기록은 먼저 JSON으로 보관하세요. 다시 읽기가 성공하면 미저장 변경은 교체됩니다.</p><button type="button" className="fs-button" disabled={exporting || saving} onClick={() => void backup("json")}>현재 기록 JSON 보관</button></div><footer className="fs-dialog-footer"><button type="button" className="fs-button" onClick={() => setReloadOpen(false)}>계속 작성</button><button type="button" className="fs-button fs-button--primary" onClick={() => { setReloadOpen(false); void reload(); }}>미저장 변경을 버리고 읽기</button></footer></SubmissionDialog>}
    </div>
  </div>;
}
