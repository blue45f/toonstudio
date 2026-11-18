import { workspaceSubmissionChanges } from "@toonstudio/contracts/admin-workspace";
import { useId, useMemo, useState } from "react";

import { workspaceId } from "./useAdminWorkspace";
import { compareWorkspaceText } from "./workspace-diff";
import { formText, workspaceDate, WorkspaceBadge, WorkspaceDialog, WorkspaceField, WorkspaceFormError, WorkspaceLink, WorkspaceSection } from "./workspace-ui";

import type { AdminWorkspace, WorkspaceDocument, WorkspaceSnapshot } from "@toonstudio/contracts/admin-workspace";
import type { FormEvent } from "react";

interface ListProps {
  state: AdminWorkspace; editable: boolean;
  onOpen: (document: WorkspaceDocument) => void; onAdd: () => void; onFreeze: (document: WorkspaceDocument) => void;
}
export function WorkspaceDocuments({ state, editable, onOpen, onAdd, onFreeze }: ListProps) {
  return <section aria-label="문서와 버전">
    <div className="workspace-section-heading"><div><h2>문서·버전</h2><p>작업본과 고정된 제출 후보를 구분합니다. 참고 자료는 제출 후보를 요구하지 않습니다.</p></div>{editable ? <button className="workspace-primary" onClick={onAdd}>문서 추가</button> : null}</div>
    <div className="workspace-document-grid">{state.documents.map(document => {
      const changes = workspaceSubmissionChanges(document, state);
      return <article className="workspace-panel workspace-document" key={document.id}>
        <header className="workspace-panel-header"><div><p className="workspace-eyebrow">DOCUMENT</p><h3>{document.title}</h3></div><WorkspaceBadge tone={document.purpose === "reference" ? "neutral" : "info"}>{document.purpose === "reference" ? "참고 자료" : "제출 대상"}</WorkspaceBadge></header>
        <div className="workspace-panel-body"><div className="workspace-version-pair"><div><span>{editable ? "작업용 · 편집 가능" : "이전 작업본 · 읽기 전용"}</span><strong>{document.working.label}</strong><small>{document.working.content || document.working.url ? "원문 연결됨" : "원문 연결 대기"}</small></div><div><span>제출 후보 · 고정됨</span><strong>{document.submission?.label ?? "미지정"}</strong><small>{document.submission ? workspaceDate(document.submission.frozenAt) : "아직 고정하지 않았습니다."}</small></div></div><p className="workspace-muted">{document.submission ? changes.join(" ") || "고정한 후보와 작업본·근거가 같습니다." : document.purpose === "reference" ? "검토용 자료로 보존합니다." : editable ? "검토한 작업본을 제출 후보로 고정하세요." : "이전 자료입니다. 현재 제출 후보는 전문 사업계획서 보드에서 관리하세요."}</p><div className="workspace-inline"><WorkspaceLink url={document.working.url} /><span className="workspace-muted">변경 이력 {document.history.length}개</span></div></div>
        <footer className="workspace-panel-footer"><button onClick={() => onOpen(document)} aria-label={document.title + " 원문·변경 비교"}>원문·변경 비교</button>{editable && document.purpose === "submission" ? <button onClick={() => onFreeze(document)} disabled={!document.working.content.trim() && !document.working.url.trim()}>제출 후보 고정</button> : null}</footer>
      </article>;
    })}</div>
  </section>;
}

export function WorkspaceDocumentEditor({ state, document, editable, busy, onSave, onClose }: {
  state: AdminWorkspace; document: WorkspaceDocument; editable: boolean; busy: boolean;
  onSave: (state: AdminWorkspace, message: string) => Promise<string | null>; onClose: () => void;
}) {
  const [content, setContent] = useState(document.working.content);
  const candidates = [document.submission, ...[...document.history].reverse()].filter((value): value is WorkspaceSnapshot => value !== null);
  const [selected, setSelected] = useState(candidates[0]?.id ?? "");
  const [error, setError] = useState("");
  const textId = useId();
  const versionId = useId();
  const previous = candidates.find(candidate => candidate.id === selected);
  const diff = useMemo(() => compareWorkspaceText(previous?.content ?? "", content), [previous?.content, content]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable || busy) return;
    const data = new FormData(event.currentTarget);
    const purpose = data.get("purpose");
    if (purpose !== "submission" && purpose !== "reference") { setError("문서 용도를 선택하세요."); return; }
    const working = { label: formText(data, "label"), url: formText(data, "url"), content, updatedAt: new Date().toISOString() };
    const changed = document.working.content !== content || document.working.url !== working.url || document.working.label !== working.label;
    const history = changed && (document.working.content || document.working.url)
      ? [...document.history, { ...document.working, id: workspaceId("version"), frozenAt: new Date().toISOString(), status: "승인 대기" as const, basis: null }]
      : document.history;
    const next: WorkspaceDocument = { ...document, title: formText(data, "title"), purpose, working, history };
    const exists = state.documents.some(value => value.id === document.id);
    const error = await onSave({ ...state, documents: exists ? state.documents.map(value => value.id === document.id ? next : value) : [...state.documents, next] }, "작업본을 저장했습니다. 고정한 제출 후보와 원본 이력은 보존했습니다.");
    if (error) setError(error); else onClose();
  }
  return <WorkspaceDialog title={document.title || "새 문서"} description={editable ? "원문을 편집하고 변경 전 버전과 비교합니다. 고정된 제출 후보는 자동 변경되지 않습니다." : "읽기 전용으로 원문과 버전 차이를 확인합니다."} onClose={onClose} busy={busy}>
    <form onSubmit={event => void submit(event)}><div className="workspace-dialog-body">
      <WorkspaceFormError error={error} />
      <fieldset className="workspace-fieldset" disabled={!editable || busy}><legend className="workspace-sr-only">문서 작업본</legend><WorkspaceSection title="문서와 작업용 버전">
        <WorkspaceField name="title" label="문서명" value={document.title} required full />
        <WorkspaceField name="purpose" label="문서 용도" value={document.purpose} options={[{ value: "submission", label: "제출 대상" }, { value: "reference", label: "참고 자료" }]} />
        <WorkspaceField name="label" label="작업용 버전명" value={document.working.label} required />
        <WorkspaceField name="url" label="작업 원문 링크" value={document.working.url} type="url" full />
        <div className="workspace-field workspace-field--full"><label htmlFor={textId}>작업본 원문</label><textarea id={textId} name="content" value={content} onChange={event => setContent(event.target.value)} rows={10} maxLength={250000} /><small>원문을 텍스트로 보존합니다. 링크의 내용이나 HTML은 자동 실행하지 않습니다.</small></div>
      </WorkspaceSection></fieldset>
      <section className="workspace-form-section"><h3>변경 전후 비교</h3>{candidates.length ? <div className="workspace-field"><label htmlFor={versionId}>변경 전 버전</label><select id={versionId} value={selected} onChange={event => setSelected(event.target.value)}>{candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.label} · {workspaceDate(candidate.frozenAt)}{candidate.id === document.submission?.id ? " · 제출 후보" : ""}</option>)}</select></div> : <p className="workspace-muted">이전 원문이 없어 현재 입력 전체를 새 내용으로 표시합니다.</p>}
        <div className="workspace-inline"><WorkspaceBadge tone="good">추가 {diff.added}줄</WorkspaceBadge><WorkspaceBadge tone="bad">삭제 {diff.removed}줄</WorkspaceBadge>{diff.coarse ? <span className="workspace-muted">긴 변경 구간은 묶어서 비교합니다.</span> : null}</div>
        <div className="workspace-diff" aria-label="원문 변경 내용">{diff.lines.length ? diff.lines.map((line, index) => <div className={"workspace-diff-line workspace-diff-line--" + line.kind} key={index}><span>{line.kind === "added" ? "추가" : line.kind === "removed" ? "삭제" : "유지"}</span><pre>{line.text || " "}</pre></div>) : <p className="workspace-muted">등록된 원문이 없습니다.</p>}</div>
        {diff.omitted ? <p className="workspace-muted">화면에는 앞 400줄을 표시했습니다. 나머지 {diff.omitted}줄은 아래 전체 원문에서 확인하세요.</p> : null}
        <details className="workspace-source-details"><summary>변경 전·현재 전체 원문</summary><h4>변경 전</h4><pre>{previous?.content || "이전 원문 없음"}</pre><h4>현재 작업본</h4><pre>{content || "원문 없음"}</pre></details>
      </section>
      {document.submission ? <p className="workspace-alert">제출 후보는 {workspaceDate(document.submission.frozenAt)}에 고정한 기록입니다. 원문과 당시 근거를 별도로 보존합니다.</p> : null}
    </div><footer className="workspace-dialog-footer"><button type="button" onClick={onClose} disabled={busy}>닫기</button>{editable ? <button type="submit" className="workspace-primary" disabled={busy}>작업본 저장</button> : null}</footer></form>
  </WorkspaceDialog>;
}

export function WorkspaceFreezeDialog({ document, busy, onFreeze, onClose }: { document: WorkspaceDocument; busy: boolean; onFreeze: () => Promise<string | null>; onClose: () => void }) {
  const [error, setError] = useState("");
  return <WorkspaceDialog title="제출 후보 고정" description="현재 작업본과 근거·멘토·점검 기록을 함께 고정합니다. 외부 제출은 실행하지 않습니다." onClose={onClose} busy={busy}>
    <div className="workspace-dialog-body"><WorkspaceFormError error={error} /><h3>{document.title}</h3><p>{document.working.label}</p><p className="workspace-muted">기존 제출 후보가 있으면 변경 이력에 보존합니다. 이후 작업본을 수정해도 이번 후보는 바뀌지 않습니다.</p></div>
    <footer className="workspace-dialog-footer"><button type="button" onClick={onClose} disabled={busy}>취소</button><button type="button" className="workspace-primary" disabled={busy} onClick={() => { void onFreeze().then(result => { if (result) setError(result); else onClose(); }); }}>제출 후보로 고정</button></footer>
  </WorkspaceDialog>;
}
