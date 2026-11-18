import { useEffect, useRef, useState } from "react";

import { downloadQualityJson } from "../CiQualityDialogs";
import { QualityDialog, QualityFormError, qualityDate } from "../quality-ui";

import { applyDependencyImport, prepareDependencyImport } from "./dependency-review-import";
import { exportDependencyReviewBoard, getRecordFreshness, REVIEW_JSON_MAX_BYTES } from "./dependency-review-model";
import { editableRecordFields, recordFieldLabels, workflowStatuses } from "./dependency-review-types";
import { DependencyCopyBlock, ReviewSourceDetails, ReviewStatusBadge } from "./DependencyReviewViews";

import type { DependencyImportPlan, DependencyReviewBoard, ReviewRecord, WorkflowStatus } from "./dependency-review-types";

const shortFields = new Set<string>(["owner", "priority", "currentVersion", "expectedVersion", "workspace", "verifiedAt", "verificationSha"]);

export function DependencyRecordDialog({ record, board, now, onSave, onDirtyChange, onClose }: {
  record: ReviewRecord;
  board: DependencyReviewBoard;
  now: number;
  onSave: (draft: ReviewRecord) => string | null;
  onDirtyChange?: (dirty: boolean) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ReviewRecord>(() => ({ ...record }));
  const [tab, setTab] = useState<"record" | "evidence" | "patch">("record");
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const dirty = draft.status !== record.status || editableRecordFields.some(key => draft[key] !== record[key]);
  const freshness = getRecordFreshness(record, board, now);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  function close() { if (dirty) setConfirmClose(true); else onClose(); }

  return <QualityDialog title={`${record.title} 기록`} description="원본 관측 결과와 수동 검토 기록을 구분합니다. 저장은 테스트 성공 판정이나 외부 작업 실행이 아닙니다." onClose={close}>
    <form noValidate onSubmit={event => {
      event.preventDefault();
      const message = onSave(draft);
      if (message) setError(message);
      else onClose();
    }}>
      <div className="ci-quality-dialog-body dependency-record-dialog">
        <div className="ci-quality-section-heading"><ReviewStatusBadge status={record.status} /><span className={`dependency-freshness dependency-freshness--${freshness.kind}`}>{freshness.label}</span></div>
        <p>{freshness.reason}</p>
        <p className="dependency-preserve">{record.summary || "요약 미확인"}</p>
        <div className="ci-quality-editor-tabs" role="group" aria-label="의존성 상세 기록 구역">
          <button type="button" aria-pressed={tab === "record"} onClick={() => setTab("record")}>검토 기록 편집</button>
          <button type="button" aria-pressed={tab === "evidence"} onClick={() => setTab("evidence")}>원본 관측·근거</button>
          <button type="button" aria-pressed={tab === "patch"} onClick={() => setTab("patch")}>패치·검증 초안</button>
        </div>
        <div hidden={tab !== "record"} className="ci-quality-form-grid">
          <label className="ci-quality-full">작업 관리 상태<select aria-label="작업 관리 상태" value={draft.status} disabled={record.category === "approval" || record.category === "archive"} onChange={event => { setDraft(previous => ({ ...previous, status: event.target.value as WorkflowStatus })); setConfirmClose(false); }}>{workflowStatuses.map(status => <option key={status} value={status}>{status}</option>)}</select></label>
          {(record.category === "approval" || record.category === "archive") && <p className="ci-quality-full">{record.category === "approval" ? "실행 항목은 승인 대기로 유지합니다. 검토 메모만 저장할 수 있습니다." : "PR #2789는 기존 완료 항목으로 보관합니다. 이번 실패로 다시 집계하지 않습니다."}</p>}
          {editableRecordFields.map(key => <label key={key} className={key === "patchDraft" || key === "evidence" ? "ci-quality-full" : undefined}>{recordFieldLabels[key]}
            {key === "recordedResult" ? <select aria-label={recordFieldLabels[key]} value={draft[key]} onChange={event => { setDraft(previous => ({ ...previous, [key]: event.target.value })); setConfirmClose(false); }}>{["미확인", "통과", "실패", "취소", "미실행"].map(result => <option key={result} value={result}>{result}</option>)}</select>
              : shortFields.has(key) ? <input aria-label={recordFieldLabels[key]} value={draft[key]} maxLength={key === "verificationSha" ? 40 : key === "verifiedAt" ? 64 : 15000} spellCheck={key === "verificationSha" ? false : undefined} placeholder={key === "verifiedAt" ? "예: 2026-11-18T03:00:00Z" : key === "verificationSha" ? "실제 검증한 40자리 SHA" : "미확인인 내용은 비워 두세요"} onChange={event => { setDraft(previous => ({ ...previous, [key]: event.target.value })); setConfirmClose(false); }} />
                : <textarea aria-label={recordFieldLabels[key]} rows={key === "patchDraft" ? 7 : 3} maxLength={15000} value={draft[key]} onChange={event => { setDraft(previous => ({ ...previous, [key]: event.target.value })); setConfirmClose(false); }} />}
          </label>)}
          <p className="ci-quality-full">완료로 전환하려면 해당 기준 SHA의 새 확정 근거·검증일·CI 링크를 기록하세요. 확인하지 못한 검사 결과는 미확인으로 남깁니다.</p>
        </div>
        <div hidden={tab !== "evidence"}><ReviewSourceDetails record={record} /><p>원본 증빙은 편집 기록과 분리해 보존합니다. 원본의 완료 상태만으로 최신 main 성공을 판정하지 않습니다.</p></div>
        <div hidden={tab !== "patch"}>
          <DependencyCopyBlock title="패치 초안" text={draft.patchDraft} />
          <DependencyCopyBlock title="저비용 검증 방법" text={draft.validation} />
          <dl className="ci-quality-detail-grid"><div><dt>최소 변경 파일</dt><dd>{draft.minimalFiles || "미확인"}</dd></div><div><dt>다음 조치</dt><dd>{draft.nextAction || "미등록"}</dd></div></dl>
        </div>
        {confirmClose && <div role="alert" className="ci-quality-warning"><p>저장하지 않은 입력이 있습니다. 닫으면 이번 입력을 버립니다.</p><div className="ci-quality-actions"><button type="button" onClick={() => setConfirmClose(false)}>계속 편집</button><button type="button" onClick={onClose}>입력을 버리고 닫기</button></div></div>}
        <QualityFormError error={error} />
      </div>
      <footer className="ci-quality-dialog-footer"><span>{dirty ? "아직 저장하지 않은 입력이 있습니다." : "현재 기록과 같은 내용입니다."} · 검토 기록 저장은 검사 성공 판정이 아닙니다.</span><button className="ci-quality-primary" type="submit">검토 기록 저장</button></footer>
    </form>
  </QualityDialog>;
}

export function DependencyJsonDialog({ board, recovering = false, onImport, onDirtyChange, onClose }: {
  board: DependencyReviewBoard;
  recovering?: boolean;
  onImport: (next: DependencyReviewBoard) => string | null;
  onDirtyChange?: (dirty: boolean) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [plan, setPlan] = useState<DependencyImportPlan | null>(null);
  const [overwriteIds, setOverwriteIds] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exportText, setExportText] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const sequence = useRef(0);
  useEffect(() => {
    // 숨김 탭에서 취소된 비동기 검토는 다시 열었을 때 재시도할 수 있다.
    setBusy(false);
    return () => { sequence.current += 1; };
  }, []);
  useEffect(() => { onDirtyChange?.(Boolean(input.trim())); }, [input, onDirtyChange]);

  function invalidate() {
    sequence.current += 1;
    setPlan(null);
    setOverwriteIds(new Set());
    setError("");
    setNotice("");
    setBusy(false);
    setConfirmClose(false);
  }
  function changeInput(value: string) { invalidate(); setInput(value); }
  function close() { if (input.trim()) setConfirmClose(true); else onClose(); }
  function exportCurrent(download: boolean) {
    try {
      const json = exportDependencyReviewBoard(board);
      setExportText(json);
      if (download) {
        downloadQualityJson(`toonstudio-dependency-review-${new Date().toISOString().slice(0, 10)}.json`, json);
        setNotice("의존성 검토 기록과 가져온 원본 JSON을 내보냈습니다.");
      }
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "의존성 기록을 내보내지 못했습니다."); }
  }
  async function readFile(file: File) {
    invalidate();
    const current = sequence.current;
    if (file.size > REVIEW_JSON_MAX_BYTES) { setError("JSON 파일은 UTF-8 기준 2MB 이하만 허용합니다."); return; }
    setBusy(true);
    try {
      const json = await file.text();
      if (current !== sequence.current) return;
      setInput(json);
      setNotice("파일을 읽었습니다. 변환 검토로 항목과 충돌을 확인하세요.");
    } catch {
      if (current === sequence.current) setError("파일을 읽지 못했습니다. JSON을 직접 붙여 넣을 수 있습니다.");
    } finally { if (current === sequence.current) setBusy(false); }
  }
  async function prepare() {
    invalidate();
    const current = sequence.current;
    setBusy(true);
    try {
      const next = await prepareDependencyImport(input, board);
      if (current === sequence.current) setPlan(next);
    } catch (cause) {
      if (current === sequence.current) setError(cause instanceof Error ? cause.message : "가져올 JSON을 확인하세요.");
    } finally { if (current === sequence.current) setBusy(false); }
  }
  function apply() {
    if (!plan || busy) return;
    try {
      const next = applyDependencyImport(board, plan, [...overwriteIds]);
      const message = onImport(next);
      if (message) setError(message);
      else onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "가져오기 변경을 적용하지 못했습니다."); }
  }
  const conflicts = plan?.changes.filter(change => change.conflict) ?? [];
  const lowered = plan?.records.filter(record => record.category !== "archive" && record.sourceStatus && record.sourceStatus !== record.status) ?? [];

  return <QualityDialog title="의존성 JSON 가져오기·백업" description="Sites 내보내기와 의존성 검토 JSON을 검토해 가져옵니다. 기존 CI·QA의 12개 검사와 저장소는 변경하지 않습니다." onClose={close}>
    <div className="ci-quality-dialog-body dependency-json-dialog">
      <p className="ci-quality-warning">로컬 편집 기록은 기본으로 보존합니다. 충돌 항목별 덮어쓰기를 직접 선택해야 바뀝니다. 가져온 완료 주장은 원본에 보존하고 현재 작업은 검토 필요로 표시합니다.</p>
      {recovering && <p className="ci-quality-error">저장본을 읽지 못했습니다. 저장 원문을 먼저 백업하고, 복구할 JSON의 변환 결과를 확인하세요. 확인 후 의존성 검토 저장본을 다시 기록합니다.</p>}
      <label>가져올 의존성 JSON<textarea aria-label="가져올 의존성 JSON" className="ci-quality-json" rows={10} value={input} maxLength={REVIEW_JSON_MAX_BYTES} onChange={event => changeInput(event.target.value)} placeholder="Sites 보드의 JSON 내보내기를 붙여 넣으세요." /></label>
      <label>의존성 JSON 파일<input aria-label="의존성 JSON 파일" type="file" accept=".json,application/json" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void readFile(file); }} /></label>
      {busy && <p role="status">원본과 변환 결과를 확인하고 있습니다.</p>}
      {plan && <section className="ci-quality-card dependency-import-preview" aria-label="의존성 가져오기 검토 결과">
        <h3>변환 검토 결과</h3>
        <p>{plan.kind === "sites" ? "Sites 내보내기" : "의존성 검토 백업"} · 원본 {plan.originalRecordCount}개 · 차이 {plan.changes.length}개 · 로컬 충돌 {conflicts.length}개</p>
        <dl className="ci-quality-detail-grid"><div><dt>원본 기준 SHA</dt><dd><code>{plan.snapshotSha}</code></dd></div><div><dt>원본 내보낸 시각</dt><dd>{qualityDate(plan.exportedAt)}</dd></div></dl>
        {plan.identical ? <p role="status">이미 가져온 원본입니다. 중복 적용하지 않습니다.</p> : <>
          <ul className="dependency-import-changes">{plan.changes.map(change => <li key={change.id}><strong>{change.title}</strong><small>{change.conflict ? "로컬 편집을 보존합니다." : "검토한 항목을 가져옵니다."} · 변경 필드 {change.fields.join(", ") || "없음"}</small>{change.conflict && <label className="dependency-checkbox"><input type="checkbox" checked={overwriteIds.has(change.id)} onChange={event => { setOverwriteIds(previous => { const next = new Set(previous); if (event.target.checked) next.add(change.id); else next.delete(change.id); return next; }); }} />{change.title} 로컬 기록 덮어쓰기</label>}</li>)}</ul>
          {!plan.changes.length && <p>기록 필드의 차이가 없습니다. 원본 JSON 보관 여부를 확인하세요.</p>}
        </>}
        {!!lowered.length && <div className="dependency-import-claims"><h3>원본 완료 주장과 현재 검토 상태</h3><ul>{lowered.map(record => <li key={record.id}>{record.title} · 원본 {record.sourceStatus} / {record.sourceResult || "결과 미확인"} → {record.status}</li>)}</ul></div>}
        <p>원본 JSON은 식별자와 함께 보관되어 다음 내보내기에 포함됩니다. 현재 기준 SHA와 의존성·PR·명령 표는 유지합니다. 가져온 표와 이력은 원본 JSON에서 확인할 수 있습니다.</p>
        <p>가져오기는 기준 main을 자동 변경하거나 현재 CI 성공으로 집계하지 않습니다.</p>
      </section>}
      <div className="ci-quality-actions"><button type="button" disabled={recovering} onClick={() => exportCurrent(true)}>의존성 기록 내보내기</button><button type="button" disabled={recovering} onClick={() => exportCurrent(false)}>백업 JSON 펼치기</button></div>
      {exportText && <label>현재 의존성 백업 JSON<textarea aria-label="현재 의존성 백업 JSON" readOnly className="ci-quality-json" rows={8} value={exportText} /></label>}
      {board.imports.length > 0 && <details><summary>보관된 가져오기 원본 {board.imports.length}개</summary><p>가져온 의존성·PR·명령·이력을 포함한 원문입니다. 현재 기준 표와 구분해 보관합니다.</p><ul className="dependency-import-receipts">{board.imports.map(receipt => <li key={receipt.fingerprint}><code>{receipt.snapshotSha}</code><small>{qualityDate(receipt.importedAt)} · 원본 {receipt.fingerprint.slice(0, 12)}</small><button type="button" aria-label={`가져오기 원본 ${receipt.fingerprint.slice(0, 12)} 다운로드`} onClick={() => {
        try { downloadQualityJson(`toonstudio-dependency-source-${receipt.fingerprint.slice(0, 12)}.json`, receipt.sourceJson); setNotice("가져오기 원본 JSON을 내보냈습니다."); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "원본 JSON을 내보내지 못했습니다."); }
      }}>원본 JSON 다운로드</button></li>)}</ul></details>}
      {notice && <p role="status">{notice}</p>}
      {confirmClose && <div role="alert" className="ci-quality-warning"><p>입력한 JSON은 아직 적용하지 않았습니다. 닫으면 가져오기 입력을 버립니다.</p><div className="ci-quality-actions"><button type="button" onClick={() => setConfirmClose(false)}>가져오기 계속 검토</button><button type="button" onClick={onClose}>가져오기 입력을 버리고 닫기</button></div></div>}
      <QualityFormError error={error} />
    </div>
    <footer className="ci-quality-dialog-footer"><span>확인한 변경만 의존성 검토 영역에 기록합니다. 명령·CI·배포는 실행하지 않습니다.</span>{plan ? <button type="button" className="ci-quality-primary" disabled={busy || plan.identical} onClick={apply}>검토한 변경 가져오기</button> : <button type="button" className="ci-quality-primary" disabled={busy || !input.trim()} onClick={() => { void prepare(); }}>변환 검토</button>}</footer>
  </QualityDialog>;
}
