import { useState } from "react";

import { SUBMISSION_DATE_HINT, SubmissionDialog, SubmissionError, SubmissionField } from "./final-submission-ui";

import type { FinalSubmissionCommit } from "./final-submission-ui";
import type { BoardState, Source } from "@toonstudio/contracts/final-submission";

export function createSubmissionSource(): Source {
  return { id: `SOURCE-${crypto.randomUUID()}`, title: "", url: "", type: "", observedAt: "", note: "" };
}

export function FinalSubmissionSourceEditor({ initial, board, onCommit, onClose, disabled }: { initial: Source; board: BoardState; onCommit: FinalSubmissionCommit; onClose: () => void; disabled: boolean }) {
  const [draft, setDraft] = useState<Source>(() => structuredClone(initial));
  const [openedRevision] = useState(board.revision);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  const stale = board.revision !== openedRevision;
  const update = (patch: Partial<Omit<Source, "id">>) => { setDraft((current) => ({ ...current, ...patch })); setError(""); };

  function apply(event: React.FormEvent) {
    event.preventDefault(); if (disabled || stale) return;
    const sources = board.sources.some((source) => source.id === initial.id) ? board.sources.map((source) => source.id === initial.id ? draft : source) : [...board.sources, draft];
    const failure = onCommit({ ...board, sources }, `${draft.title} · 기준 자료 참조 변경`);
    if (failure) setError(failure); else onClose();
  }

  return <SubmissionDialog title={initial.title ? `${initial.title} · 기준 자료` : "기준 자료 추가"} description="보드의 자료명·근거 링크·확인 범위를 기록합니다. 연결된 원본 문서는 수정하지 않습니다." dirty={dirty} onClose={onClose}>
    <form onSubmit={apply} noValidate><div className="fs-dialog-body">
      <div className="fs-form-grid">
        <SubmissionField label="기준 자료 제목" value={draft.title} required wide disabled={disabled} onChange={(title) => update({ title })} />
        <SubmissionField label="기준 자료 URL" value={draft.url} type="url" wide disabled={disabled} hint="확인한 http 또는 https 링크를 기록합니다. 주소를 모르면 비워 두세요." onChange={(url) => update({ url })} />
        <SubmissionField label="자료 유형" value={draft.type} disabled={disabled} hint="예: 활동보고서, 증빙 대장, 멘토 검토본, 제출 화면" onChange={(type) => update({ type })} />
        <SubmissionField label="자료 관찰 시점" value={draft.observedAt} disabled={disabled} hint={SUBMISSION_DATE_HINT} onChange={(observedAt) => update({ observedAt })} />
        <SubmissionField label="확인 범위·메모" value={draft.note} multiline wide disabled={disabled} hint="최종 제출에 확인해야 하는 부분과 확인하지 못한 범위를 구분해 기록하세요." onChange={(note) => update({ note })} />
      </div>
      <SubmissionError error={stale ? "이 창을 연 뒤 서버 저장 버전이 바뀌었습니다. 입력을 확인한 뒤 창을 닫고 최신 기준 자료를 다시 열어 주세요." : error} />
    </div><footer className="fs-dialog-footer"><span>자료 ID는 유지하며, 반영한 참조는 ‘서버에 저장’으로 보관합니다.</span><button type="submit" className="fs-button fs-button--primary" disabled={disabled || stale}>기준 자료 기록 반영</button></footer></form>
  </SubmissionDialog>;
}
