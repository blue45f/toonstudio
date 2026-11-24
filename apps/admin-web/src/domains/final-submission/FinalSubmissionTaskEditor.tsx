import { GLOBAL_PLATFORM_TASK_ID, reconcileFinalSubmissionBoard, STATUSES } from "@toonstudio/contracts/final-submission";
import { useState } from "react";

import { SUBMISSION_DATE_HINT, SubmissionBadge, SubmissionDialog, SubmissionError, SubmissionField, SubmissionLinksEditor, SubmissionSelect } from "./final-submission-ui";

import type { FinalSubmissionCommit } from "./final-submission-ui";
import type { BoardState, Task } from "@toonstudio/contracts/final-submission";

export const SUBMISSION_CATEGORIES = ["최종본", "첨부 파일", "증빙 대조", "파일 형식", "기존 검토 반영", "플랫폼", "승인 대기"];

export function createSubmissionTask(): Task {
  return { id: `CHECK-${crypto.randomUUID()}`, title: "", category: "첨부 파일", docId: "", status: "미확인", priority: "보통", issueType: "미확인", fileName: "", version: "", authoredAt: "", modifiedAt: "", evidenceLinks: [], attachments: [], discrepancy: "", nextAction: "", lastConfirmedAt: "", confirmedBy: "", confirmationNote: "", approvalRequired: false, unresolved: true, updatedAt: "", provenance: "관리자가 추가한 최종 제출 점검 항목" };
}

export function FinalSubmissionTaskEditor({ initial, board, onCommit, onClose, disabled }: { initial: Task; board: BoardState; onCommit: FinalSubmissionCommit; onClose: () => void; disabled: boolean }) {
  const [draft, setDraft] = useState<Task>(() => structuredClone(initial));
  const [openedRevision] = useState(board.revision);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("점검 기록");
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  const stale = board.revision !== openedRevision;
  const update = (patch: Partial<Task>) => { setDraft((current) => ({ ...current, ...patch })); setError(""); };

  function apply(event: React.FormEvent) {
    event.preventDefault();
    if (disabled || stale) return;
    const nextTask = { ...draft, updatedAt: new Date().toISOString() };
    const tasks = board.tasks.some((task) => task.id === initial.id) ? board.tasks.map((task) => task.id === initial.id ? nextTask : task) : [...board.tasks, nextTask];
    const next = reconcileFinalSubmissionBoard({ ...board, tasks }, board);
    const failure = onCommit(next, `${draft.title} · 점검 기록 변경`);
    if (failure) setError(failure); else onClose();
  }

  return <SubmissionDialog title={initial.title || "보완 항목 추가"} description="점검 기록만 변경합니다. 원본 문서나 플랫폼 파일은 변경하지 않습니다." dirty={dirty} onClose={onClose}>
    <form onSubmit={apply} noValidate>
      <div className="fs-dialog-body">
        {draft.approvalRequired && <p className="fs-notice"><SubmissionBadge status="승인 대기" /> 실제 실행은 잠겨 있습니다. 필요한 범위와 다음 조치만 기록하세요.</p>}
        {draft.id === GLOBAL_PLATFORM_TASK_ID && <p className="fs-notice">필수 문서 3종 전체의 플랫폼 근거를 점검합니다. 활동보고서·사업계획서·지출 증빙 대장 모두의 실제 제출 여부와 첨부 비교 근거를 확인해야 최종 확인할 수 있습니다.</p>}
        <nav className="fs-tabs" aria-label="점검 항목 입력 구역">{["점검 기록", "근거·증빙", "최종 확인"].map((name) => <button type="button" className="fs-button" key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</nav>
        <div hidden={tab !== "점검 기록"} className="fs-form-grid">
          <SubmissionField label="점검 항목" value={draft.title} required wide disabled={disabled || draft.approvalRequired} onChange={(title) => update({ title })} />
          <SubmissionSelect label="관리 상태" value={draft.status} options={STATUSES} disabled={disabled || draft.approvalRequired} onChange={(status) => update({ status: status as Task["status"] })} />
          <SubmissionSelect label="분류" value={draft.category} options={Array.from(new Set([...SUBMISSION_CATEGORIES, draft.category]))} disabled={disabled || draft.approvalRequired || draft.id === GLOBAL_PLATFORM_TASK_ID} onChange={(category) => update({ category })} />
          {draft.id === GLOBAL_PLATFORM_TASK_ID ? <p className="fs-notice">점검 대상 · 활동보고서, 사업계획서, 지출 증빙 대장</p> : <SubmissionSelect label="연결 문서" value={draft.docId} options={[{ value: "", label: "공통 점검" }, ...board.documents.map((document) => ({ value: document.id, label: document.label }))]} disabled={disabled} onChange={(docId) => update({ docId })} />}
          <SubmissionSelect label="우선순위" value={draft.priority} options={["높음", "보통"]} disabled={disabled} onChange={(priority) => update({ priority: priority as Task["priority"] })} />
          <SubmissionField label="파일명" value={draft.fileName} disabled={disabled} onChange={(fileName) => update({ fileName })} />
          <SubmissionField label="버전" value={draft.version} disabled={disabled} onChange={(version) => update({ version })} />
          <SubmissionField label="작성일" value={draft.authoredAt} disabled={disabled} hint={`원본에서 확인한 날짜만 입력합니다. ${SUBMISSION_DATE_HINT}`} onChange={(authoredAt) => update({ authoredAt })} />
          <SubmissionField label="수정일" value={draft.modifiedAt} disabled={disabled} hint={`보드 편집 시각과 구분하며, 모르면 비워 두세요. ${SUBMISSION_DATE_HINT}`} onChange={(modifiedAt) => update({ modifiedAt })} />
          <SubmissionSelect label="확인 결과" value={draft.issueType} options={["미확인", "차이 확인", "확인 필요"]} disabled={disabled} onChange={(issueType) => update({ issueType: issueType as Task["issueType"] })} />
          <label className="fs-checkbox"><input type="checkbox" checked={draft.unresolved} disabled={disabled || draft.approvalRequired} onChange={(event) => update({ unresolved: event.target.checked })} /><span>미해결 사항이 남아 있음</span></label>
          <SubmissionField label="불일치·확인할 내용" value={draft.discrepancy} multiline wide disabled={disabled} onChange={(discrepancy) => update({ discrepancy })} />
          <SubmissionField label="다음 조치" value={draft.nextAction} multiline wide disabled={disabled} onChange={(nextAction) => update({ nextAction })} />
          <SubmissionField label="기록 근거·확인 범위" value={draft.provenance} multiline wide disabled={disabled} onChange={(provenance) => update({ provenance })} />
        </div>
        <div hidden={tab !== "근거·증빙"} className="fs-form-stack">
          <SubmissionLinksEditor title="근거 링크" links={draft.evidenceLinks} disabled={disabled} onChange={(evidenceLinks) => update({ evidenceLinks })} />
          <SubmissionLinksEditor title="첨부 증빙" links={draft.attachments} disabled={disabled} onChange={(attachments) => update({ attachments })} />
        </div>
        <div hidden={tab !== "최종 확인"} className="fs-form-grid">
          <p className="fs-notice fs-full">최종 확인에는 근거 링크 또는 첨부 증빙, 확인자, 결과, 시점이 필요하며 미해결 표시를 해제해야 합니다. 파일·근거가 바뀌면 기존 최종 확인은 검토 필요로 돌아갑니다.</p>
          <SubmissionField label="확인자" value={draft.confirmedBy} disabled={disabled || draft.approvalRequired} onChange={(confirmedBy) => update({ confirmedBy })} />
          <SubmissionField label="최종 확인 시점" value={draft.lastConfirmedAt} disabled={disabled || draft.approvalRequired} hint={`실제 확인한 시점만 입력하세요. ${SUBMISSION_DATE_HINT}`} onChange={(lastConfirmedAt) => update({ lastConfirmedAt })} />
          <SubmissionField label="최종 확인 결과" value={draft.confirmationNote} multiline wide disabled={disabled || draft.approvalRequired} onChange={(confirmationNote) => update({ confirmationNote })} />
        </div>
        <SubmissionError error={stale ? "이 창을 연 뒤 서버 저장 버전이 바뀌었습니다. 입력을 확인한 뒤 창을 닫고 최신 항목을 다시 열어 주세요. 이전 입력으로 최신 기록을 덮어쓰지 않습니다." : error} />
      </div>
      <footer className="fs-dialog-footer"><span>화면에 반영한 뒤 상단의 ‘서버에 저장’으로 보관합니다.</span><button className="fs-button fs-button--primary" type="submit" disabled={disabled || stale}>점검 기록 반영</button></footer>
    </form>
  </SubmissionDialog>;
}
