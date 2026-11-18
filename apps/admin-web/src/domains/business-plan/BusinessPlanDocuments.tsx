import { BUSINESS_PLAN_DOCUMENT_HISTORY_LIMIT, createSubmissionSnapshot, diffLines } from "@toonstudio/contracts/business-plan";
import { useState } from "react";

import { useBusinessPlanPermissions } from "./business-plan-permissions";
import { BusinessPlanBadge, BusinessPlanDialog, BusinessPlanError, BusinessPlanFormFooter, BusinessPlanLink, BusinessPlanPanel, TextAreaField, TextField, businessPlanDate, businessPlanId, downloadBusinessPlan, formText } from "./business-plan-ui";


import type { BusinessPlanCommit } from "./business-plan-ui";
import type { BusinessPlanDocument, BusinessPlanDocumentHistoryEntry, BusinessPlanState } from "@toonstudio/contracts/business-plan";

function newDocument(): BusinessPlanDocument {
  return { id: businessPlanId("document"), title: "", sourceUrl: "", fileName: "", workingLabel: "", workingText: "", previousLabel: "", previousText: "", updatedAt: new Date().toISOString(), submission: null, history: [], notes: "" };
}

export function BusinessPlanDocuments({ board, onCommit }: { board: BusinessPlanState; onCommit: BusinessPlanCommit }) {
  const { canWrite, canExport, exportBoard } = useBusinessPlanPermissions();
  const [selected, setSelected] = useState(board.documents[0]?.id ?? "");
  const [comparison, setComparison] = useState<"previous" | "submission">("previous");
  const [editing, setEditing] = useState<BusinessPlanDocument | null>(null);
  const [snapshot, setSnapshot] = useState<BusinessPlanDocument | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState("");
  const current = board.documents.find((item) => item.id === selected) ?? board.documents[0];
  const before = current ? comparison === "previous" ? current.previousText : current.submission?.text ?? "" : "";
  const beforeLabel = current ? comparison === "previous" ? current.previousLabel || "변경 전 원문" : current.submission?.label || "제출용 사본 없음" : "";
  const changed = Boolean(current?.submission && current.workingText !== current.submission.text);

  return <BusinessPlanPanel id="bp-documents" title="문서 변경과 제출용 버전" eyebrow="DOCUMENT VERSIONS" description="작업용을 고쳐도 제출용 사본은 유지됩니다. 최종 제출 전 변경분 반영 여부를 확인하세요." className="bp-section" actions={<button type="button" className="bp-button bp-button--small" disabled={!canWrite} onClick={() => setEditing(newDocument())}>문서 추가</button>}>
    {current ? <>
      <div className="bp-document-toolbar"><label className="bp-document-select"><span className="bp-sr-only">비교할 문서</span><select value={current.id} onChange={(event) => setSelected(event.target.value)}>{board.documents.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><div className="bp-actions"><button type="button" className="bp-button bp-button--small" onClick={() => setEditing(current)}>작업용 편집</button><button type="button" className="bp-button bp-button--small" onClick={() => setSnapshot(current)} disabled={!canWrite || !current.workingText.trim()}>제출용 사본 만들기</button><button type="button" className="bp-button bp-button--small" onClick={() => setShowHistory(!showHistory)} aria-expanded={showHistory}>변경 이력 {current.history.length}</button></div></div>
      <div className="bp-document-notes"><div className="bp-actions"><div className="bp-segmented" role="group" aria-label="문서 비교 기준"><button type="button" aria-pressed={comparison === "previous"} onClick={() => setComparison("previous")}>변경 전 ↔ 작업용</button><button type="button" aria-pressed={comparison === "submission"} onClick={() => setComparison("submission")}>제출용 ↔ 작업용</button></div><BusinessPlanBadge tone={current.submission ? changed ? "warn" : "good" : "neutral"}>{current.submission ? changed ? "제출용에 미반영 변경 있음" : "작업용·제출용 내용 일치" : "제출용 미생성"}</BusinessPlanBadge></div></div>
      <div className="bp-version-grid"><article className="bp-version"><header className="bp-version-header"><div><strong>{comparison === "previous" ? "변경 전" : "제출용 고정 사본"}</strong><small>{beforeLabel}</small></div><BusinessPlanBadge>{comparison === "previous" ? "비교 기준" : "독립 버전"}</BusinessPlanBadge></header><pre>{before || "비교할 원문을 등록하세요. 내용은 추측해 채우지 않습니다."}</pre></article><article className="bp-version"><header className="bp-version-header"><div><strong>작업용</strong><small>{current.workingLabel || "버전 이름 미등록"} · {businessPlanDate(current.updatedAt)}</small></div><BusinessPlanBadge tone="info">편집 중</BusinessPlanBadge></header><pre>{current.workingText || "아직 작업용 원문이 없습니다. 문서 편집에서 등록하세요."}</pre></article></div>
      <details className="bp-diff"><summary>변경 내용 비교 · 삭제 − / 추가 +</summary><div className="bp-diff-body">{before === current.workingText ? <p className="bp-empty">현재 비교 기준과 작업용 내용이 같습니다.</p> : diffLines(before, current.workingText).map((line, index) => <pre className={`bp-diff-line bp-diff-line--${line.type}`} key={`${index}-${line.type}`}><span aria-label={line.type === "add" ? "추가" : line.type === "remove" ? "삭제" : "동일"}>{line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}</span><span>{line.text || " "}</span></pre>)}</div></details>
      <div className="bp-document-notes"><div className="bp-actions"><BusinessPlanLink url={current.sourceUrl || current.fileUrl || ""}>{current.fileName || "연결된 원문 문서"}</BusinessPlanLink>{current.submission && <button className="bp-button bp-button--small" type="button" disabled={!canExport} onClick={async () => {
        const authorized = await exportBoard();
        const submission = authorized?.documents.find((item) => item.id === current.id)?.submission;
        if (!submission) return;
        try { downloadBusinessPlan(`business-plan-submission-${current.id}.txt`, submission.text, "text/plain;charset=utf-8"); setError(""); } catch { setError("제출용 사본 파일을 내려받지 못했습니다. JSON 백업을 이용하세요."); }
      }}>제출용 텍스트 내려받기</button>}</div>{current.notes && <p>{current.notes}</p>}{current.submission && <p>제출용 생성: {businessPlanDate(current.submission.createdAt)} · 연결 원문 변경·외부 제출은 수행하지 않습니다.</p>}</div>
      {showHistory && <div className="bp-history">{[...current.history].reverse().map((entry, index) => <details key={`${entry.createdAt || entry.at}-${index}`}><summary>{entry.type} · {entry.label || "버전 이름 없음"} · {businessPlanDate(entry.createdAt || entry.at)}</summary><pre>{entry.text}</pre></details>)}{!current.history.length && <p className="bp-empty">작업용 변경 또는 제출용 사본 교체 시 이전 내용을 보관합니다.</p>}</div>}
    </> : <p className="bp-empty">문서를 추가하고 변경 전 원문과 작업용 내용을 등록하세요.</p>}
    <BusinessPlanError error={error} />
    {editing && <DocumentEditor key={editing.id} document={editing} board={board} onCommit={onCommit} onClose={() => setEditing(null)} onSelect={setSelected} />}
    {snapshot && <SnapshotEditor document={snapshot} board={board} onCommit={onCommit} onClose={() => setSnapshot(null)} />}
  </BusinessPlanPanel>;
}

function DocumentEditor({ document, board, onCommit, onClose, onSelect }: { document: BusinessPlanDocument; board: BusinessPlanState; onCommit: BusinessPlanCommit; onClose: () => void; onSelect: (id: string) => void }) {
  const [error, setError] = useState(""); const [dirty, setDirty] = useState(false);
  const exists = board.documents.some((item) => item.id === document.id);
  return <BusinessPlanDialog title={exists ? `${document.title} 편집` : "비교할 문서 추가"} description="원문 텍스트와 파일 링크를 기록합니다. 연결된 원본 파일은 수정하지 않습니다." dirty={dirty} wide onClose={onClose}>
    <form noValidate onChange={() => setDirty(true)} onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const value = (name: string) => formText(data, name); const at = new Date().toISOString();
      const workingText = formText(data, "workingText", true);
      const history: BusinessPlanDocumentHistoryEntry[] = [...document.history];
      if (document.workingText && document.workingText !== workingText) history.push({ label: document.workingLabel, text: document.workingText, type: "작업용", createdAt: at });
      const candidate: BusinessPlanDocument = { ...document, title: value("title"), fileName: value("fileName"), sourceUrl: value("sourceUrl"), workingLabel: value("workingLabel"), workingText, previousLabel: value("previousLabel"), previousText: formText(data, "previousText", true), notes: value("notes"), updatedAt: at, history: history.slice(-BUSINESS_PLAN_DOCUMENT_HISTORY_LIMIT) };
      const failure = onCommit({ ...board, documents: exists ? board.documents.map((item) => item.id === document.id ? candidate : item) : [...board.documents, candidate] }, `${candidate.title}: 작업용 문서 ${exists ? "수정" : "등록"}`);
      if (failure) setError(failure); else { onSelect(candidate.id); onClose(); }
    }}>
      <div className="bp-dialog-body"><div className="bp-form-grid">
        <TextField label="문서 제목" name="title" value={document.title} maxLength={500} required />
        <TextField label="원본 파일명" name="fileName" value={document.fileName} maxLength={500} />
        <TextField label="문서 원문 링크" name="sourceUrl" value={document.sourceUrl} type="url" full />
        <TextField label="변경 전 버전 이름" name="previousLabel" value={document.previousLabel} maxLength={500} />
        <TextField label="작업용 버전 이름" name="workingLabel" value={document.workingLabel} maxLength={500} />
        <TextAreaField label="변경 전 원문" name="previousText" value={document.previousText} rows={13} maxLength={500000} />
        <TextAreaField label="작업용 원문" name="workingText" value={document.workingText} rows={13} maxLength={500000} />
        <TextAreaField label="문서 메모" name="notes" value={document.notes} full />
      </div><BusinessPlanError error={error} /></div><BusinessPlanFormFooter />
    </form>
  </BusinessPlanDialog>;
}

function SnapshotEditor({ document, board, onCommit, onClose }: { document: BusinessPlanDocument; board: BusinessPlanState; onCommit: BusinessPlanCommit; onClose: () => void }) {
  const [error, setError] = useState(""); const [dirty, setDirty] = useState(false);
  return <BusinessPlanDialog title="제출용 고정 사본 만들기" description="현재 작업용 텍스트를 별도 버전으로 보관합니다. 외부 제출은 실행하지 않습니다." dirty={dirty} onClose={onClose}>
    <form noValidate onChange={() => setDirty(true)} onSubmit={(event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      const result = createSubmissionSnapshot(document, formText(data, "label"));
      if (!result.ok) { setError(result.errors.join(" · ")); return; }
      const failure = onCommit({ ...board, documents: board.documents.map((item) => item.id === document.id ? result.value : item) }, `${document.title}: 제출용 사본 생성`);
      if (failure) setError(failure); else onClose();
    }}><div className="bp-dialog-body"><p className="bp-notice">{document.title} · {document.workingLabel || "작업용"}<br />{document.workingText.length.toLocaleString()}자 · 기존 제출용이 있으면 이력에 보관합니다.</p><TextField label="제출용 버전 이름" name="label" maxLength={500} required /><BusinessPlanError error={error} /></div><BusinessPlanFormFooter label="제출용 사본 반영" /></form>
  </BusinessPlanDialog>;
}
