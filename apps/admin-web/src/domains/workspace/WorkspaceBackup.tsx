import { importAdminWorkspace, MAX_WORKSPACE_RECOVERY_BYTES, workspaceImportSizeAllowed } from "@toonstudio/contracts/admin-workspace";
import { useEffect, useId, useRef, useState } from "react";

import { downloadWorkspace, workspaceDate, WorkspaceBadge, WorkspaceDialog, WorkspaceFormError } from "./workspace-ui";

import type { AdminWorkspace, WorkspaceImport } from "@toonstudio/contracts/admin-workspace";

export function WorkspaceImportDialog({ state, busy, editable, onSave, onClose }: { state: AdminWorkspace; busy: boolean; editable: boolean; onSave: (next: AdminWorkspace, message: string) => Promise<string | null>; onClose: () => void }) {
  const [preview, setPreview] = useState<AdminWorkspace | null>(null);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const selection = useRef(0);
  const inputId = useId();
  useEffect(() => () => { selection.current += 1; }, []);
  async function read(file?: File) {
    const token = ++selection.current;
    setPreview(null); setError(""); setFilename(file?.name ?? "");
    if (!file || !editable) return;
    if (file.size > MAX_WORKSPACE_RECOVERY_BYTES) { setError("일반 JSON은 12MiB, 복구 파일은 64MiB 이하만 가져올 수 있습니다."); return; }
    setReading(true);
    try {
      const value: unknown = JSON.parse(await file.text());
      if (token !== selection.current) return;
      const recovery = value !== null && typeof value === "object" && "kind" in value && value.kind === "toonstudio-admin-recovery";
      if (!workspaceImportSizeAllowed(file.size, recovery)) { setError("일반 JSON은 12MiB, 복구 파일은 64MiB 이하여야 합니다."); return; }
      const result = importAdminWorkspace(value, state);
      if (!result.ok) { setError(result.errors.join("\n")); return; }
      setPreview(result.value);
    } catch { if (token === selection.current) setError("JSON 파일을 읽을 수 없습니다. 올바른 작업실·통합 보드 백업인지 확인하세요."); }
    finally { if (token === selection.current) setReading(false); }
  }
  async function apply() {
    if (!preview || !editable || busy) return;
    try { downloadWorkspace(state, "before-import"); }
    catch { setError("현재 기록의 백업 파일을 만들지 못했습니다. 가져오기를 적용하지 않았습니다."); return; }
    const error = await onSave(preview, "검증한 JSON 기록을 가져왔습니다. 원본과 현재 확인 상태를 구분해 보존했습니다.");
    if (error) setError(error); else onClose();
  }
  return <WorkspaceDialog title="JSON 기록 가져오기" description="인증된 관리자만 가져온 원문을 공유 기록에 저장할 수 있습니다. 적용 전 현재 기록을 백업합니다." onClose={onClose} busy={busy}>
    <div className="workspace-dialog-body"><WorkspaceFormError error={error} /><div className="workspace-field"><label htmlFor={inputId}>백업 JSON 파일</label><input id={inputId} type="file" accept="application/json,.json" disabled={!editable || busy || reading} onChange={event => { void read(event.target.files?.[0]); event.target.value = ""; }} /><small>현재 작업실 JSON, 이전 사업계획·통합 보드 JSON, 복구 파일을 지원합니다.</small></div>
      <p className="workspace-alert">이전 보드의 완료·확인 표시는 원문에 보존하고 현재 검증으로 자동 승격하지 않습니다. 기존 원문·고정본을 삭제하거나 승인 제한을 해제하는 가져오기는 거부합니다.</p>
      {reading ? <p role="status">파일 구조와 근거 기록을 확인하고 있습니다.</p> : null}
      {preview ? <section className="workspace-import-preview" aria-label="가져오기 미리보기"><h3>{filename}</h3><div className="workspace-import-counts">{[["작업·주장", preview.records.length], ["문서", preview.documents.length], ["멘토 요청", preview.mentor.length], ["점검 항목", preview.checklist.length], ["원본 묶음", preview.imports.length]].map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}</div><p>적용 후의 전체 항목 수입니다. 현재 편집과 원본 보존 검증을 통과했습니다.</p><ul>{preview.records.slice(0, 5).map(record => <li key={record.id}>{record.title}</li>)}</ul><small>파일의 HTML·스크립트는 실행하지 않습니다. 출처 링크의 내용이나 최신성을 자동 검증하지 않습니다.</small></section> : null}
    </div><footer className="workspace-dialog-footer"><button type="button" onClick={onClose} disabled={busy}>닫기</button><button type="button" className="workspace-primary" onClick={() => void apply()} disabled={!preview || !editable || busy || reading}>{busy ? "저장 중…" : "현재 기록 백업 후 가져오기"}</button></footer>
  </WorkspaceDialog>;
}

function Archive({ item }: { item: WorkspaceImport }) {
  const [open, setOpen] = useState(false);
  return <article className="workspace-panel"><header className="workspace-panel-header"><div><h3>{item.label}</h3><p>{workspaceDate(item.importedAt)}</p></div><WorkspaceBadge tone="info">원본 보존</WorkspaceBadge></header><div className="workspace-panel-body"><p className="workspace-muted">가져올 당시의 원본 전체입니다. 여기에 적힌 과거 판정·수치·일정은 현재 검증과 구분됩니다.</p><details className="workspace-source-details" onToggle={event => setOpen(event.currentTarget.open)}><summary>가져온 원본 전체 보기</summary>{open ? <pre>{JSON.stringify(item.archive, null, 2)}</pre> : null}</details></div></article>;
}
export function WorkspaceSources({ state }: { state: AdminWorkspace }) {
  return <section aria-label="가져온 원문"><div className="workspace-section-heading"><div><h2>가져온 원문</h2><p>원본 전체와 가져온 시각을 보존합니다. 기존 서비스의 이후 편집과 자동 동기화하지 않습니다.</p></div></div>{state.imports.length ? <div className="workspace-source-grid">{state.imports.map(item => <Archive key={item.id} item={item} />)}</div> : <div className="workspace-panel workspace-empty"><h3>가져온 원문이 없습니다.</h3><p>현재 화면은 일반 초기 템플릿입니다. 관리자 권한으로 기존 JSON을 가져오면 원문이 이곳에 연결됩니다.</p></div>}</section>;
}
