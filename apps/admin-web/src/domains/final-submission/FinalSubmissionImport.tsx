import { FINAL_SUBMISSION_IMPORT_MAX_BYTES, importFinalSubmissionBoard, STATUSES } from "@toonstudio/contracts/final-submission";
import { useRef, useState } from "react";

import { SubmissionDialog, SubmissionError, submissionDate } from "./final-submission-ui";

import type { FinalSubmissionCommit } from "./final-submission-ui";
import type { BoardState } from "@toonstudio/contracts/final-submission";

export function FinalSubmissionImport({ board, onCommit, onClose, disabled }: { board: BoardState; onCommit: FinalSubmissionCommit; onClose: () => void; disabled: boolean }) {
  const [raw, setRaw] = useState("");
  const [fileName, setFileName] = useState("");
  const [candidate, setCandidate] = useState<BoardState | null>(null);
  const [reviewedRevision, setReviewedRevision] = useState<number | null>(null);
  const [source, setSource] = useState<{ revision: number | null; exportedAt: string }>({ revision: null, exportedAt: "" });
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const sequence = useRef(0);
  const stale = candidate !== null && reviewedRevision !== board.revision;

  function review(text: string) {
    setCandidate(null); setConfirmed(false); setError("");
    try {
      if (new TextEncoder().encode(text).byteLength > FINAL_SUBMISSION_IMPORT_MAX_BYTES) throw new Error("가져올 JSON 백업은 8MB 이하여야 합니다. 내부 점검 기록은 2MB까지 지원합니다.");
      const input: unknown = JSON.parse(text);
      const result = importFinalSubmissionBoard(input, board.revision, board.revision === 0 ? undefined : board);
      if (!result.ok) throw new Error(result.errors.join(" · "));
      const original = input && typeof input === "object" && "board" in input ? input.board : input;
      const revision = original && typeof original === "object" && "revision" in original && typeof original.revision === "number" ? original.revision : null;
      const exportedAt = input && typeof input === "object" && "exportedAt" in input && typeof input.exportedAt === "string" ? input.exportedAt : "";
      setSource({ revision, exportedAt });
      setCandidate(result.value); setReviewedRevision(board.revision);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "JSON 파일을 읽지 못했습니다."); }
  }

  return <SubmissionDialog title="Sites 기록 가져오기" description="기존 Sites의 ‘변경 기록 → 전체 기록 JSON’으로 내보낸 파일을 선택하세요. 파일 내용과 상태를 먼저 검토합니다." dirty={Boolean(raw)} onClose={onClose}>
    <div className="fs-dialog-body">
      <p className="fs-notice">가져오기는 현재 어드민 보드 전체를 교체할 준비를 합니다. 기존 Sites 기록·원본 문서·플랫폼 제출 파일은 바뀌지 않으며, 이후의 변경은 자동 동기화되지 않습니다.</p>
      <label className="fs-field"><span>Sites 또는 어드민 JSON 파일 선택</span><input type="file" accept=".json,application/json" disabled={disabled} onChange={async (event) => {
        const file = event.target.files?.[0]; event.target.value = ""; const run = ++sequence.current;
        setCandidate(null); setConfirmed(false); setError("");
        if (!file) return;
        if (file.size > FINAL_SUBMISSION_IMPORT_MAX_BYTES) { setError("가져올 JSON 백업은 8MB 이하여야 합니다. 내부 점검 기록은 2MB까지 지원합니다."); return; }
        try {
          const text = await file.text(); if (run !== sequence.current) return;
          setRaw(text); setFileName(file.name); review(text);
        } catch { if (run === sequence.current) setError("파일을 읽지 못했습니다. JSON 파일을 다시 선택하세요."); }
      }} /></label>
      <details className="fs-import-raw"><summary>JSON을 직접 붙여넣기</summary><label className="fs-field"><span>가져올 점검 보드 JSON</span><textarea rows={9} value={raw} disabled={disabled} spellCheck={false} onChange={(event) => { sequence.current += 1; setRaw(event.target.value); setFileName(""); setCandidate(null); setConfirmed(false); setError(""); }} /></label><button type="button" className="fs-button" disabled={disabled || !raw.trim()} onClick={() => review(raw)}>가져올 기록 검증</button></details>
      <SubmissionError error={error} />
      {stale && <div className="fs-notice" role="alert"><p>검토 후 서버 저장 버전이 바뀌었습니다. 현재 기록을 기준으로 다시 검토한 뒤 교체 여부를 확인하세요.</p><button type="button" className="fs-button" disabled={disabled} onClick={() => review(raw)}>현재 저장 버전으로 다시 검토</button></div>}
      {candidate && <div className="fs-import-review">
        <h3>가져오기 검토</h3><p>{fileName || "붙여넣은 JSON"} · 문서 {candidate.documents.length}개 · 점검 {candidate.tasks.length}개 · 기준 자료 {candidate.sources.length}개</p>
        <p className="fs-meta">가져온 원본 저장 버전 {source.revision ?? "미확인"} · 내보낸 시점 {submissionDate(source.exportedAt)}<br />현재 어드민 저장 버전 {reviewedRevision}을 기준으로 검토했습니다.</p>
        <dl className="fs-import-counts">{STATUSES.map((status) => <div key={status}><dt>{status}</dt><dd>{candidate.tasks.filter((task) => task.status === status).length}</dd></div>)}</dl>
        <p>플랫폼 제출 미확인 {candidate.documents.filter((document) => document.platform.status === "미확인").length}건 · 승인 대기 실행 항목 {candidate.tasks.filter((task) => task.approvalRequired).length}개</p>
        <ul>{candidate.documents.map((document) => <li key={document.id}>{document.label} · {document.fileName || "파일명 미확인"} · {document.version || "버전 미확인"}</li>)}</ul>
        <p className="fs-muted">가져온 근거의 사실성은 별도 확인이 필요합니다. 원본 Sites 저장 이력은 기존 Sites에 남으며, 어드민에는 가져오기 이후 저장 이력이 쌓입니다.</p>
        <label className="fs-checkbox"><input type="checkbox" checked={confirmed} disabled={disabled} onChange={(event) => setConfirmed(event.target.checked)} /><span>현재 화면의 전체 기록이 바뀌는 것을 확인했습니다. 필요한 기존 기록은 JSON으로 보관했습니다.</span></label>
      </div>}
    </div>
    <footer className="fs-dialog-footer"><span>검토한 기록을 반영한 뒤 ‘서버에 저장’으로 보관하세요.</span><button type="button" className="fs-button fs-button--primary" disabled={disabled || !candidate || !confirmed || stale} onClick={() => {
      if (!candidate || !confirmed || stale) return;
      const checked = importFinalSubmissionBoard(candidate, board.revision, board.revision === 0 ? undefined : board);
      if (!checked.ok) { setError(checked.errors.join(" · ")); return; }
      const failure = onCommit(checked.value, "검증한 JSON으로 최종 제출 점검 기록 가져오기");
      if (failure) setError(failure); else onClose();
    }}>검토한 기록 반영</button></footer>
  </SubmissionDialog>;
}
