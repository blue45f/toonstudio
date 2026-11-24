import { reconcileFinalSubmissionBoard } from "@toonstudio/contracts/final-submission";
import { useState } from "react";

import { SUBMISSION_DATE_HINT, SubmissionDialog, SubmissionError, SubmissionField, SubmissionSelect } from "./final-submission-ui";

import type { FinalSubmissionCommit } from "./final-submission-ui";
import type { BoardState, DocumentRecord } from "@toonstudio/contracts/final-submission";

export function FinalSubmissionDocumentEditor({ initial, board, onCommit, onClose, disabled }: { initial: DocumentRecord; board: BoardState; onCommit: FinalSubmissionCommit; onClose: () => void; disabled: boolean }) {
  const [draft, setDraft] = useState<DocumentRecord>(() => structuredClone(initial));
  const [openedRevision] = useState(board.revision);
  const [tab, setTab] = useState("관리 파일");
  const [error, setError] = useState("");
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  const stale = board.revision !== openedRevision;
  const update = (patch: Partial<DocumentRecord>) => { setDraft((current) => ({ ...current, ...patch })); setError(""); };
  const platform = (patch: Partial<DocumentRecord["platform"]>) => update({ platform: { ...draft.platform, ...patch } });
  const identityChanged = ["fileName", "version", "sourceUrl", "fileHash"].some((key) => initial[key as keyof DocumentRecord] !== draft[key as keyof DocumentRecord]);
  const platformIdentityChanged = (["fileName", "version", "hash"] as const).some((key) => initial.platform[key] !== draft.platform[key]);

  function apply(event: React.FormEvent) {
    event.preventDefault(); if (disabled || stale) return;
    const next = reconcileFinalSubmissionBoard({ ...board, documents: board.documents.map((document) => document.id === initial.id ? draft : document) }, board);
    const failure = onCommit(next, `${initial.label} · 파일·제출 비교 기록 변경`);
    if (failure) setError(failure); else onClose();
  }

  return <SubmissionDialog title={`${initial.label} · 비교 기록`} description="관리 중인 최신 후보와 플랫폼에서 직접 확인한 파일을 구분해서 기록합니다." dirty={dirty} onClose={onClose}>
    <form onSubmit={apply} noValidate><div className="fs-dialog-body">
      <nav className="fs-tabs" aria-label="파일 비교 입력 구역">{["관리 파일", "플랫폼 관찰", "최종본·형식"].map((name) => <button type="button" className="fs-button" key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>{name}</button>)}</nav>
      {identityChanged && <p className="fs-notice">기준 파일의 식별 정보가 바뀌었습니다. 반영 시 기존 최종본·형식·첨부 비교 확인과 연결 항목의 최종 확인이 해제되어 재검토 대상이 됩니다.</p>}
      {platformIdentityChanged && <p className="fs-notice">플랫폼 첨부 파일의 식별 정보가 바뀌었습니다. 변경 기록을 먼저 반영하고 서버에 저장한 뒤 첨부 비교를 다시 확인하세요.</p>}
      <div hidden={tab !== "관리 파일"} className="fs-form-grid">
        <SubmissionField label="관리 파일명" value={draft.fileName} disabled={disabled} onChange={(fileName) => update({ fileName })} />
        <SubmissionField label="관리 버전" value={draft.version} disabled={disabled} onChange={(version) => update({ version })} />
        <SubmissionField label="버전 판단 근거" value={draft.versionBasis} disabled={disabled} wide onChange={(versionBasis) => update({ versionBasis })} />
        <SubmissionField label="원본 작성일" value={draft.authoredAt} disabled={disabled} hint={`확인하지 못했으면 비워 두세요. ${SUBMISSION_DATE_HINT}`} onChange={(authoredAt) => update({ authoredAt })} />
        <SubmissionField label="원본 수정일" value={draft.modifiedAt} disabled={disabled} hint={`파일명 속 날짜·보드 저장 시각과 구분합니다. ${SUBMISSION_DATE_HINT}`} onChange={(modifiedAt) => update({ modifiedAt })} />
        <SubmissionField label="날짜·메타데이터 확인 범위" value={draft.metadataNote} multiline wide disabled={disabled} onChange={(metadataNote) => update({ metadataNote })} />
        <SubmissionField label="원본 파일 근거 링크" type="url" value={draft.sourceUrl} disabled={disabled} wide onChange={(sourceUrl) => update({ sourceUrl })} />
        <SubmissionSelect label="파일 확보 수준" value={draft.availability} options={["미확보", "메타데이터 확인", "내용 확인"]} disabled={disabled} onChange={(availability) => update({ availability: availability as DocumentRecord["availability"] })} />
        <SubmissionField label="파일 크기 · bytes" value={draft.bytes} disabled={disabled} onChange={(bytes) => update({ bytes })} />
        <SubmissionField label="원본 SHA-256" value={draft.fileHash} disabled={disabled} wide hint="직접 확인한 해시만 입력합니다. 파일명 일치만으로 내용 일치를 판정하지 않습니다." onChange={(fileHash) => update({ fileHash })} />
      </div>
      <div hidden={tab !== "플랫폼 관찰"} className="fs-form-grid">
        <p className="fs-notice fs-full">제출 화면·접수 기록의 근거가 없으면 미확인으로 둡니다. 이 화면은 플랫폼에 접속하거나 실제 제출·파일 교체를 실행하지 않습니다.</p>
        <SubmissionSelect label="플랫폼 실제 제출 여부" value={draft.platform.status} options={["미확인", "제출 확인", "미제출 확인"]} disabled={disabled} onChange={(status) => platform({ status: status as DocumentRecord["platform"]["status"] })} />
        <SubmissionSelect label="플랫폼 첨부와 비교" value={identityChanged || platformIdentityChanged ? "미확인" : draft.platform.comparison} options={["미확인", "일치 확인", "차이 확인"]} disabled={disabled || identityChanged || platformIdentityChanged} onChange={(comparison) => platform({ comparison: comparison as DocumentRecord["platform"]["comparison"] })} />
        <SubmissionField label="플랫폼에서 확인한 파일명" value={draft.platform.fileName} disabled={disabled} onChange={(fileName) => platform({ fileName })} />
        <SubmissionField label="플랫폼에서 확인한 버전" value={draft.platform.version} disabled={disabled} onChange={(version) => platform({ version })} />
        <SubmissionField label="업로드 시점" value={draft.platform.uploadedAt} disabled={disabled} hint={SUBMISSION_DATE_HINT} onChange={(uploadedAt) => platform({ uploadedAt })} />
        <SubmissionField label="실제 제출 시점" value={draft.platform.submittedAt} disabled={disabled} hint={SUBMISSION_DATE_HINT} onChange={(submittedAt) => platform({ submittedAt })} />
        <SubmissionField label="플랫폼 근거 링크" type="url" value={draft.platform.evidenceUrl} disabled={disabled} wide hint="제출 여부·첨부 비교 확인에는 근거 링크와 관찰 시점이 필요합니다." onChange={(evidenceUrl) => platform({ evidenceUrl })} />
        <SubmissionField label="접수번호·접수 확인 내용" value={draft.platform.receipt} disabled={disabled} onChange={(receipt) => platform({ receipt })} />
        <SubmissionField label="플랫폼 관찰 시점" value={draft.platform.observedAt} disabled={disabled} hint={SUBMISSION_DATE_HINT} onChange={(observedAt) => platform({ observedAt })} />
        <SubmissionField label="플랫폼 첨부 SHA-256" value={draft.platform.hash} disabled={disabled} wide onChange={(hash) => platform({ hash })} />
        <SubmissionField label="첨부 비교 결과·불일치 내용" value={draft.platform.comparisonNote} multiline wide disabled={disabled} onChange={(comparisonNote) => platform({ comparisonNote })} />
      </div>
      <div hidden={tab !== "최종본·형식"} className="fs-form-grid">
        <SubmissionSelect label="최종본 확정 여부" value={draft.candidateState} options={["미확인", "검토 후보", "최종본 확정"]} disabled={disabled || identityChanged} onChange={(candidateState) => update({ candidateState: candidateState as DocumentRecord["candidateState"] })} />
        <SubmissionField label="최종본 확정 시점" value={draft.finalizedAt} disabled={disabled || identityChanged} hint={SUBMISSION_DATE_HINT} onChange={(finalizedAt) => update({ finalizedAt })} />
        <SubmissionField label="최종본 확정 근거 링크" type="url" value={draft.candidateEvidence} wide disabled={disabled || identityChanged} onChange={(candidateEvidence) => update({ candidateEvidence })} />
        <SubmissionField label="요구되는 파일 형식" value={draft.expectedFormat} disabled={disabled} hint="확인한 제출 요구사항만 기록합니다. 확장자만으로 적합 판정을 내리지 않습니다." onChange={(expectedFormat) => update({ expectedFormat })} />
        <SubmissionSelect label="파일 형식 검수" value={draft.formatStatus} options={["미확인", "적합 확인", "문제 확인"]} disabled={disabled || identityChanged} onChange={(formatStatus) => update({ formatStatus: formatStatus as DocumentRecord["formatStatus"] })} />
        <SubmissionField label="파일 최종 확인 시점" value={draft.lastConfirmedAt} disabled={disabled || identityChanged} hint={SUBMISSION_DATE_HINT} onChange={(lastConfirmedAt) => update({ lastConfirmedAt })} />
        <SubmissionField label="검수 근거·결과 메모" value={draft.notes} multiline wide disabled={disabled} onChange={(notes) => update({ notes })} />
      </div>
      <SubmissionError error={stale ? "이 창을 연 뒤 서버 저장 버전이 바뀌었습니다. 입력을 확인한 뒤 창을 닫고 최신 비교 기록을 다시 열어 주세요. 이전 입력으로 최신 기록을 덮어쓰지 않습니다." : error} />
    </div><footer className="fs-dialog-footer"><span>보드 저장 시각은 원본 파일의 작성일·수정일을 바꾸지 않습니다.</span><button type="submit" className="fs-button fs-button--primary" disabled={disabled || stale}>비교 기록 반영</button></footer></form>
  </SubmissionDialog>;
}
