import { STATUSES } from "@toonstudio/contracts/admin-nestjs-quality";
import { useEffect, useId, useState } from "react";

import { NestDialog, NestLinks, NestStatus, nestDate } from "./nestjs-quality-ui";

import type { Status, Task } from "@toonstudio/contracts/admin-nestjs-quality";

interface Props {
  task: Task; isNew: boolean; canEdit: boolean; busy: boolean; error: string; conflict: boolean;
  onSave: (task: Task, reason: string) => Promise<string | null>;
  onExport: (task: Task) => void; onReload: () => Promise<boolean>;
  onDirty: (dirty: boolean) => void; onClose: () => void;
}

export function NestTaskEditor({ task, isNew, canEdit, busy, error, conflict, onSave, onExport, onReload, onDirty, onClose }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<Task>(() => structuredClone(task));
  const [tab, setTab] = useState<"detail" | "evidence">("detail");
  const [reason, setReason] = useState(`${task.title} 기록`);
  const [validation, setValidation] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(task);
  const noteOnly = task.approvalRequired;
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);

  function update<K extends keyof Task>(key: K, value: Task[K]): void {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setValidation("");
  }
  function close(): void { if (busy) return; if (dirty) setConfirmClose(true); else onClose(); }
  async function save(): Promise<void> {
    if (!canEdit || busy || conflict) return;
    if (!reason.trim()) { setValidation("변경 이유를 기록하세요."); return; }
    const submitted = noteOnly ? { ...task, notes: draft.notes } : draft;
    const problem = await onSave(submitted, reason.trim());
    if (problem) setValidation(problem);
  }

  const text = (key: "title" | "category" | "kind" | "owner" | "environment" | "result" | "commit" | "checkedAt" | "verificationDate", label: string, placeholder?: string) =>
    <label htmlFor={`${id}-${key}`}>{label}<input id={`${id}-${key}`} value={draft[key]} onChange={(event) => update(key, event.target.value)} placeholder={placeholder} /></label>;
  const area = (key: "summary" | "scope" | "nextAction" | "acceptance" | "beforeEvidence" | "afterEvidence", label: string, rows = 3) =>
    <label htmlFor={`${id}-${key}`}>{label}<textarea id={`${id}-${key}`} value={draft[key]} onChange={(event) => update(key, event.target.value)} rows={rows} /></label>;

  return <NestDialog title={noteOnly ? "승인 검토 메모" : "NestJS 검증 기록"} description={`${task.id} · 관리 상태와 실제 확인 결과를 따로 기록합니다.`} onClose={close}>
    <div className="nest-dialog-body">
      <div className="nest-toolbar"><NestStatus status={draft.status} /><span>서버 항목 버전 {task.revision} · 자료 확인 {nestDate(task.checkedAt)}</span></div>
      {draft.approvalRequired && <p className="nest-notice">이 항목은 승인 대기로만 기록합니다. 저장 이후에는 검토 메모만 편집하며 코드 수정·CI 실행·PR 병합·배포를 시작하지 않습니다.</p>}
      {!canEdit && <p className="nest-notice">읽기 전용입니다. 검증 기록과 근거를 확인할 수 있습니다.</p>}
      <div className="nest-tabs" aria-label="검증 기록 구역">
        <button type="button" aria-pressed={tab === "detail"} onClick={() => setTab("detail")}>항목 · 시나리오</button>
        <button type="button" aria-pressed={tab === "evidence"} onClick={() => setTab("evidence")}>전후 증거 · 링크</button>
      </div>
      <fieldset disabled={!canEdit || noteOnly || busy} className="nest-fields">
        <legend>검증 항목</legend>
        {text("title", "항목 이름")}
        {isNew && <label className="nest-check"><input type="checkbox" checked={draft.approvalRequired} onChange={(event) => {
          const approvalRequired = event.target.checked;
          setDraft((previous) => ({ ...previous, approvalRequired, status: approvalRequired ? "승인 대기" : "미확인", category: approvalRequired ? "승인" : "추가 검증" }));
        }} />코드 수정·PR 병합·배포 승인 필요</label>}
        <div hidden={tab !== "detail"}>
          <div className="nest-form-grid">
            <label htmlFor={`${id}-status`}>관리 상태<select id={`${id}-status`} disabled={draft.approvalRequired} value={draft.status} onChange={(event) => update("status", event.target.value as Status)}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
            <label htmlFor={`${id}-priority`}>우선순위<select id={`${id}-priority`} value={draft.priority} onChange={(event) => update("priority", event.target.value as Task["priority"])}>{["P0", "P1", "P2"].map((value) => <option key={value}>{value}</option>)}</select></label>
            {text("category", "영역")}{text("kind", "근거 종류")}{text("owner", "담당")}{text("result", "실제 확인 결과", "미확인 / 통과 / 실패 / 범위 한정 확인")}
          </div>
          {area("summary", "현재 판단")}{area("scope", "변경 영향 범위")}{text("environment", "검증 환경")}{area("nextAction", "다음 조치 · 선행 조건")}
          <label htmlFor={`${id}-steps`}>최소 검증 절차 · 한 줄에 한 단계<textarea id={`${id}-steps`} rows={6} value={draft.steps.join("\n")} onChange={(event) => update("steps", event.target.value.split("\n"))} /></label>
          {area("acceptance", "통과 기준")}
          <label className="nest-check"><input type="checkbox" checked={draft.archived} onChange={(event) => update("archived", event.target.checked)} />보관 · 기본 미완료 목록에서 제외</label>
        </div>
        <div hidden={tab !== "evidence"}>
          <p className="nest-muted">기존 CI·정적 코드 검토와 새 실행 증거를 구분하세요. 미실행 시나리오의 검증일은 비워 둡니다.</p>
          {text("commit", "해당 증거의 커밋 SHA")}
          <div className="nest-form-grid">{text("checkedAt", "자료 확인일", "ISO 8601 또는 YYYY-MM-DD")}{text("verificationDate", "검증·판정일", "실제 검증일, 미실행은 빈 값")}</div>
          {area("beforeEvidence", "변경 전 증거", 5)}{area("afterEvidence", "변경 후 증거", 5)}
          <h3>근거 링크</h3>
          {draft.evidenceLinks.map((link, index) => <div className="nest-link-edit" key={index}>
            <label>근거 {index + 1} 이름<input value={link.label} onChange={(event) => update("evidenceLinks", draft.evidenceLinks.map((item, at) => at === index ? { ...item, label: event.target.value } : item))} /></label>
            <label>근거 {index + 1} URL<input value={link.url} onChange={(event) => update("evidenceLinks", draft.evidenceLinks.map((item, at) => at === index ? { ...item, url: event.target.value } : item))} placeholder="https://" /></label>
            <label>근거 {index + 1} 종류<input value={link.type ?? ""} onChange={(event) => update("evidenceLinks", draft.evidenceLinks.map((item, at) => at === index ? { ...item, type: event.target.value } : item))} placeholder="PR / 커밋 / CI / 코드 / 릴리스" /></label>
            <button type="button" onClick={() => update("evidenceLinks", draft.evidenceLinks.filter((_, at) => at !== index))} aria-label={`근거 ${index + 1} 제거`}>제거</button>
          </div>)}
          <button type="button" onClick={() => update("evidenceLinks", [...draft.evidenceLinks, { label: "새 근거", url: "" }])}>근거 링크 추가</button>
          <p className="nest-muted">검증 완료에는 검증일·결과·후속 증거·링크가 필요합니다. main 머지 완료에는 해당 저장소의 PR과 병합 커밋도 필요합니다.</p>
        </div>
      </fieldset>
      <label htmlFor={`${id}-notes`}>{noteOnly ? "승인 검토 메모" : "메모 · 차단 요인"}<textarea id={`${id}-notes`} rows={4} disabled={!canEdit || busy} value={draft.notes} onChange={(event) => update("notes", event.target.value)} /></label>
      <NestLinks links={task.evidenceLinks} />
      {canEdit && <label htmlFor={`${id}-reason`}>변경 이유<input id={`${id}-reason`} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>}
      {(validation || error) && <p className="nest-error" role="alert">{error || validation}</p>}
      {conflict && <div className="nest-notice"><p>서버 기록은 덮어쓰지 않았습니다. 아래의 초안 JSON 내보내기로 보관한 뒤 최신 기록을 확인하세요.</p><button type="button" onClick={() => setConfirmReload(true)}>최신 기록 읽기</button></div>}
      {confirmReload && <div className="nest-notice" role="alert"><p>현재 편집을 버리고 서버의 최신 기록을 불러옵니다.</p><button type="button" disabled={busy} onClick={() => void onReload()}>초안을 버리고 최신 기록 읽기</button><button type="button" onClick={() => setConfirmReload(false)}>계속 편집</button></div>}
      {confirmClose && <div className="nest-notice" role="alert"><p>저장하지 않은 변경이 있습니다.</p><button type="button" onClick={() => setConfirmClose(false)}>계속 편집</button><button type="button" onClick={() => { onDirty(false); onClose(); }}>변경 버리고 닫기</button></div>}
    </div>
    <footer className="nest-dialog-footer"><span>{dirty ? "저장되지 않은 초안" : "서버 기록 확인"}</span><div className="nest-toolbar"><button type="button" disabled={busy} onClick={() => onExport(draft)}>초안 JSON 내보내기</button>{canEdit && <button type="button" className="nest-primary" disabled={busy || conflict} onClick={() => void save()}>{busy ? "저장 중…" : noteOnly ? "승인 메모 저장" : draft.approvalRequired ? "승인 항목 저장" : "검증 기록 저장"}</button>}</div></footer>
  </NestDialog>;
}
